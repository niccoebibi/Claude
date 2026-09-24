// Reminder schedule and deadline rules, run against the real modules with a simulated clock.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deadline, reminderKind, employeeCanEdit, monthStatus, romeNow } from '../public/js/cal.js';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'presenze-rem-'));
process.env.DATA_DIR = DATA;
process.env.MAIL_DEV = '1';
let db, worker, months, push;

/** An instant at a given Rome wall-clock time (CET/CEST handled by trying both offsets). */
function rome(day, hour) {
  for (const off of [1, 2]) {
    const t = Date.parse(`${day}T${String(hour - off).padStart(2, '0')}:00:00Z`);
    const r = romeNow(t);
    if (r.day === day && r.hour === hour) return t;
  }
  throw new Error('bad time');
}

before(async () => {
  ({ db } = await import('../server/db.js'));
  push = await import('../server/push.js');
  push.initPush();
  worker = await import('../server/worker.js');
  months = await import('../server/months.js');
  const add = db.prepare("INSERT INTO users(role, first_name, last_name, email, pass_hash, created_at) VALUES(?, ?, ?, ?, ?, ?)");
  const created = Date.parse('2026-09-01T08:00:00Z');
  add.run('admin', 'Capo', '', 'capo@example.com', 'x', created);
  add.run('employee', 'Anna', 'Blu', 'anna@example.com', 'x', created);
  add.run('employee', 'Bruno', 'Rosa', 'bruno@example.com', 'x', created);
  add.run('employee', 'Carla', 'Invitata', 'carla@example.com', null, created); // never activated
});

after(() => fs.rmSync(DATA, { recursive: true, force: true }));

const sent = () => db.prepare('SELECT u.first_name AS who, r.month, r.kind FROM reminders r JOIN users u ON u.id = r.user_id ORDER BY r.rowid').all().map((r) => ({ ...r }));
const outbox = () => {
  const dir = path.join(DATA, 'outbox');
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
};

test('the deadline is the last Thursday of the month', () => {
  assert.equal(deadline('2026-09'), '2026-09-24');
  assert.equal(deadline('2026-10'), '2026-10-29');
  assert.equal(deadline('2026-12'), '2026-12-31');
  assert.equal(deadline('2027-02'), '2027-02-25');
  assert.equal(deadline('2027-04'), '2027-04-29');
});

test('reminder calendar around the deadline', () => {
  assert.equal(reminderKind('2026-10', '2026-10-25'), null);
  assert.equal(reminderKind('2026-10', '2026-10-26'), 'pre');
  assert.equal(reminderKind('2026-10', '2026-10-28'), 'pre');
  assert.equal(reminderKind('2026-10', '2026-10-29'), 'due');
  assert.equal(reminderKind('2026-10', '2026-10-30'), 'late-2026-10-30');
  assert.equal(reminderKind('2026-10', '2026-11-05'), 'late-2026-11-05');
  assert.equal(reminderKind('2026-10', '2026-11-06'), null);
});

test('which months an employee may edit', () => {
  assert.equal(employeeCanEdit('2026-10', '2026-10-15'), true);
  assert.equal(employeeCanEdit('2026-09', '2026-10-15'), true);
  assert.equal(employeeCanEdit('2026-08', '2026-10-15'), false);
  assert.equal(employeeCanEdit('2027-10', '2026-10-15'), true);
  assert.equal(employeeCanEdit('2027-11', '2026-10-15'), false);
});

test('month status', () => {
  const base = { month: '2026-10', confirmedDigest: 'a', currentDigest: 'a' };
  assert.deepEqual(monthStatus({ ...base, today: '2026-10-30' }), { state: 'ok', deadline: '2026-10-29', late: false, dueToday: false });
  assert.equal(monthStatus({ ...base, currentDigest: 'b', today: '2026-10-30' }).state, 'changed');
  assert.equal(monthStatus({ ...base, currentDigest: 'b', today: '2026-10-30' }).late, true);
  assert.equal(monthStatus({ ...base, confirmedDigest: null, today: '2026-10-29' }).dueToday, true);
});

test('nothing is sent before the reminder hour or far from the deadline', async () => {
  await worker.tick(rome('2026-10-20', 12));
  await worker.tick(rome('2026-10-26', 8));
  assert.deepEqual(sent(), []);
});

test('three days before: a reminder to each activated employee, once', async () => {
  await worker.tick(rome('2026-10-26', 9));
  await worker.tick(rome('2026-10-27', 15));
  assert.deepEqual(sent(), [
    { who: 'Anna', month: '2026-10', kind: 'pre' },
    { who: 'Bruno', month: '2026-10', kind: 'pre' },
  ]);
  const mails = outbox().filter((m) => m.subject.includes('scadenza giovedì'));
  assert.equal(mails.length, 2);
  assert.ok(mails[0].text.includes('giovedì 29 ottobre'));
});

test('whoever confirms stops receiving reminders', async () => {
  const anna = db.prepare("SELECT * FROM users WHERE first_name = 'Anna'").get();
  months.setDays({ user: anna }, anna, ['2026-10-01', '2026-10-02'], { code: 'L' });
  months.confirmMonth({ user: anna }, anna, '2026-10');
  await worker.tick(rome('2026-10-29', 9));
  assert.deepEqual(sent().slice(2), [{ who: 'Bruno', month: '2026-10', kind: 'due' }]);
});

test('after the deadline: daily reminders, and the owner gets the summary', async () => {
  await worker.tick(rome('2026-10-30', 9));
  await worker.tick(rome('2026-10-30', 18));
  await worker.tick(rome('2026-10-31', 9));
  assert.deepEqual(sent().slice(3), [
    { who: 'Bruno', month: '2026-10', kind: 'late-2026-10-30' },
    { who: 'Capo', month: '2026-10', kind: 'summary' },
    { who: 'Bruno', month: '2026-10', kind: 'late-2026-10-31' },
  ]);
  const summary = outbox().find((m) => m.to === 'capo@example.com');
  assert.match(summary.subject, /mancano 1 dipendente/);
  assert.match(summary.text, /Mancano: Bruno Rosa/);
});

test('the late reminders stop a week after the deadline', async () => {
  await worker.tick(rome('2026-11-05', 9));
  const before = sent().length;
  await worker.tick(rome('2026-11-06', 9));
  assert.ok(sent().slice(0, before).some((r) => r.kind === 'late-2026-11-05'));
  assert.ok(!sent().slice(before).some((r) => r.month === '2026-10'));
});

test('every reminder is written in the audit log', () => {
  const n = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'reminder.sent'").get().n;
  assert.equal(n, sent().filter((r) => r.who !== 'Capo').length);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'summary.sent'").get().n, 1);
});
