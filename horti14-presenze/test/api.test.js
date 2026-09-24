// End-to-end API tests: start the real server on a temp data dir and walk through
// the whole flow (owner, employee, confirmation, audit chain). Run with `npm test`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';
import { romeNow, addMonths, monthDays } from '../public/js/cal.js';

const PORT = 4100 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'presenze-test-'));
const MONTH = romeNow().month;
const DAYS = monthDays(MONTH);
let server;

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_EMAIL: 'capo@example.com', ADMIN_PASSWORD: 'password-capo', MAIL_DEV: '1', PUBLIC_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

/** Minimal cookie-keeping client. */
function client() {
  const jar = new Map();
  return async (method, url, body) => {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'user-agent': 'test-suite' };
    let payload;
    if (method !== 'GET') {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body ?? {});
    }
    const res = await fetch(BASE + url, { method, headers, body: payload });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const v = pair.slice(i + 1);
      if (v) jar.set(pair.slice(0, i), v);
      else jar.delete(pair.slice(0, i));
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, res };
  };
}

const outbox = () => {
  const dir = path.join(DATA, 'outbox');
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
};

const owner = client();
const giulia = client();
let giuliaId;
let inviteToken;

test('the owner logs in with the account created from the environment', async () => {
  assert.equal((await owner('POST', '/api/login', { email: 'capo@example.com', password: 'sbagliata' })).status, 401);
  const r = await owner('POST', '/api/login', { email: 'CAPO@example.com', password: 'password-capo' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'admin');
  const me = await owner('GET', '/api/me');
  assert.equal(me.data.user.email, 'capo@example.com');
  assert.equal(me.data.company, 'Horti 14');
});

test('API writes must be JSON (no cross-site form posts)', async () => {
  const res = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
  assert.equal(res.status, 415);
});

test('the owner adds an employee, who gets a personal invitation link by email', async () => {
  const r = await owner('POST', '/api/admin/employees', { firstName: 'Giulia', lastName: 'Verdi', email: 'Giulia@Example.com', job: 'Reception', phone: '333 1234567' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  giuliaId = r.data.employee.id;
  assert.equal(r.data.employee.email, 'giulia@example.com');
  assert.equal(r.data.employee.activated, false);
  assert.equal(r.data.access.emailed, true);
  inviteToken = r.data.access.link.split('#accesso/')[1];
  assert.ok(r.data.access.link.startsWith(`http://127.0.0.1:${PORT}/#accesso/`), r.data.access.link);
  const mail = outbox().find((m) => m.to === 'giulia@example.com');
  assert.ok(mail.html.includes(inviteToken));
  const dup = await owner('POST', '/api/admin/employees', { firstName: 'Altra', email: 'giulia@example.com' });
  assert.equal(dup.status, 409);
});

test('the employee activates the account with her own password', async () => {
  assert.equal((await giulia('POST', '/api/login', { email: 'giulia@example.com', password: 'qualsiasi1' })).status, 401);
  const info = await giulia('POST', '/api/access/info', { token: inviteToken });
  assert.equal(info.data.firstName, 'Giulia');
  assert.equal(info.data.reset, false);
  assert.equal((await giulia('POST', '/api/access', { token: inviteToken, password: 'corta' })).status, 400);
  const r = await giulia('POST', '/api/access', { token: inviteToken, password: 'giulia-segreta' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.activated, true);
  // The link works once.
  assert.equal((await client()('POST', '/api/access/info', { token: inviteToken })).status, 404);
});

test('employees cannot use the owner area', async () => {
  assert.equal((await giulia('GET', `/api/admin/overview/${MONTH}`)).status, 403);
  assert.equal((await client()('GET', `/api/month/${MONTH}`)).status, 401);
});

test('the employee marks days, and the month totals follow', async () => {
  let r = await giulia('PUT', `/api/month/${MONTH}/days`, { days: DAYS.slice(0, 5), entry: { code: 'L' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[5]], entry: { code: 'F' } });
  r = await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[6]], entry: { code: 'P', hours: 2, note: 'visita medica' } });
  r = await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[7]], entry: { code: 'M', note: '=HYPERLINK("x")' } });
  assert.deepEqual(r.data.totals, { L: 5, F: 1, P: 1, M: 1, permHours: 2 });
  assert.equal(r.data.entries[DAYS[6]].note, 'visita medica');
  assert.equal(r.data.state, 'todo');
  // Clearing a day.
  r = await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[4]], entry: null });
  assert.equal(r.data.totals.L, 4);
  // Invalid input.
  assert.equal((await giulia('PUT', `/api/month/${MONTH}/days`, { days: ['2020-01-01'], entry: { code: 'L' } })).status, 400);
  assert.equal((await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[0]], entry: { code: 'X' } })).status, 400);
  assert.equal((await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[0]], entry: { code: 'P', hours: 30 } })).status, 400);
});

test('old months are closed to employees but not to the owner', async () => {
  const old = addMonths(MONTH, -2);
  const day = `${old}-10`;
  const r = await giulia('PUT', `/api/month/${old}/days`, { days: [day], entry: { code: 'L' } });
  assert.equal(r.status, 403);
  const prev = addMonths(MONTH, -1);
  assert.equal((await giulia('PUT', `/api/month/${prev}/days`, { days: [`${prev}-10`], entry: { code: 'L' } })).status, 200);
  const o = await owner('PUT', `/api/admin/user/${giuliaId}/month/${old}/days`, { days: [day], entry: { code: 'F' } });
  assert.equal(o.status, 200);
  assert.equal(o.data.entries[day].code, 'F');
});

test('confirming the month gives a receipt, by email too', async () => {
  const r = await giulia('POST', `/api/month/${MONTH}/confirm`);
  assert.equal(r.status, 200);
  assert.equal(r.data.state, 'ok');
  assert.ok(r.data.receipt.id > 0);
  await sleep(200);
  const receipt = outbox().find((m) => m.to === 'giulia@example.com' && m.subject.startsWith('Ricevuta'));
  assert.ok(receipt, 'receipt email');
  assert.ok(receipt.text.includes(r.data.digest));
  // Confirming again without changes does nothing new.
  const again = await giulia('POST', `/api/month/${MONTH}/confirm`);
  assert.equal(again.data.receipt.already, true);
  assert.equal(again.data.receipt.id, r.data.receipt.id);
});

test('a change after confirming needs a new confirmation, and the owner is told what changed', async () => {
  let r = await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[0]], entry: { code: 'M' } });
  assert.equal(r.data.state, 'changed');
  // Undoing the change brings the month back to "confirmed": the digest is the same.
  r = await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[0]], entry: { code: 'L' } });
  assert.equal(r.data.state, 'ok');
  r = await giulia('PUT', `/api/month/${MONTH}/days`, { days: [DAYS[1]], entry: { code: 'F' } });
  assert.equal(r.data.state, 'changed');
  const o = await owner('GET', `/api/admin/overview/${MONTH}`);
  assert.equal(o.data.employees.find((e) => e.id === giuliaId).state, 'changed');
  r = await giulia('POST', `/api/month/${MONTH}/confirm`);
  assert.equal(r.data.state, 'ok');
  await sleep(200);
  const note = outbox().find((m) => m.to === 'capo@example.com' && m.subject.includes('ha corretto'));
  assert.ok(note, 'owner notified');
  assert.match(note.text, /Lavorato -> Ferie/);
});

test('history lists every change with before and after', async () => {
  const r = await giulia('GET', `/api/month/${MONTH}/history`);
  const sets = r.data.events.filter((e) => e.action === 'day.set');
  assert.ok(sets.length >= 10);
  const cleared = sets.find((e) => e.day === DAYS[4] && e.after === null);
  assert.deepEqual(cleared.before, { code: 'L' });
  assert.equal(r.data.events.filter((e) => e.action === 'month.confirm').length, 2);
  const byOwner = await owner('GET', `/api/admin/user/${giuliaId}/month/${addMonths(MONTH, -2)}/history`);
  assert.match(byOwner.data.events[0].actor, /titolare/i);
  assert.equal(byOwner.data.events[0].ip, '127.0.0.1');
  assert.equal(byOwner.data.events[0].ua, 'test-suite');
});

test('the audit chain verifies, and cannot be edited even directly in the database', async () => {
  let v = await owner('GET', '/api/admin/audit/verify');
  assert.equal(v.data.ok, true);
  assert.ok(v.data.count > 15);
  const db = new DatabaseSync(path.join(DATA, 'presenze.db'));
  db.exec('PRAGMA busy_timeout = 5000');
  assert.throws(() => db.exec("UPDATE audit SET after = 'x' WHERE id = 5"), /non si può modificare/);
  assert.throws(() => db.exec('DELETE FROM audit WHERE id = 5'), /non si può cancellare/);
  // Someone with full access removes the protection and rewrites an event: the chain breaks.
  const target = db.prepare("SELECT id FROM audit WHERE action = 'day.set' ORDER BY id LIMIT 1").get().id;
  db.exec('DROP TRIGGER audit_no_update');
  db.prepare(`UPDATE audit SET after = '{"code":"F"}' WHERE id = ?`).run(target);
  v = await owner('GET', '/api/admin/audit/verify');
  assert.equal(v.data.ok, false);
  assert.equal(v.data.brokenAt, target);
  assert.equal(v.data.reason, 'contenuto alterato');
  // Restore, so the rest of the suite runs on a clean chain.
  db.prepare(`UPDATE audit SET after = '{"code":"L"}' WHERE id = ?`).run(target);
  db.exec("CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Il registro non si può modificare'); END");
  db.close();
  v = await owner('GET', '/api/admin/audit/verify');
  assert.equal(v.data.ok, true);
});

test('exports: the monthly sheet and the audit log as CSV for Excel', async () => {
  const r = await owner('GET', `/api/admin/export/${MONTH}`);
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get('content-disposition'), new RegExp(`presenze-${MONTH}\\.csv`));
  const lines = r.data.replace(/^﻿/, '').split('\r\n');
  const row = lines.find((l) => l.startsWith('Giulia Verdi;'));
  const cells = row.split(';');
  assert.equal(cells[2], 'L');
  assert.equal(cells[3], 'F');
  assert.equal(cells[8], 'P2');
  assert.equal(cells[9], 'M');
  assert.ok(row.includes('Confermato'));
  assert.ok(r.data.includes('visita medica'));
  assert.ok(r.data.includes(`"'=HYPERLINK(""x"")"`), 'formulas are neutralised');
  const log = await owner('GET', `/api/admin/audit/export?month=${MONTH}`);
  assert.equal(log.status, 200);
  assert.ok(log.data.includes('Confermato il mese'));
  assert.equal((await giulia('GET', `/api/admin/export/${MONTH}`)).status, 403);
});

test('logins, failures and logouts are in the log', async () => {
  const other = client();
  await other('POST', '/api/login', { email: 'giulia@example.com', password: 'sbagliata!' });
  const r = await owner('GET', `/api/admin/audit?user=${giuliaId}`);
  const actions = r.data.events.map((e) => e.action);
  assert.ok(actions.includes('auth.login_failed'));
  assert.ok(actions.includes('auth.password_set'));
  assert.ok(actions.includes('user.create'));
});

test('forgotten password: a one-hour link by email', async () => {
  const r = await client()('POST', '/api/forgot', { email: 'giulia@example.com' });
  assert.equal(r.status, 200);
  await sleep(200);
  const mail = outbox().findLast((m) => m.to === 'giulia@example.com' && m.subject.includes('Reimposta'));
  const token = /#accesso\/([\w-]+)/.exec(mail.text)[1];
  const fresh = client();
  assert.equal((await fresh('POST', '/api/access/info', { token })).data.reset, true);
  assert.equal((await fresh('POST', '/api/access', { token, password: 'nuova-password' })).status, 200);
  // Old sessions are closed when the password is reset.
  assert.equal((await giulia('GET', `/api/month/${MONTH}`)).status, 401);
  assert.equal((await giulia('POST', '/api/login', { email: 'giulia@example.com', password: 'nuova-password' })).status, 200);
  // Unknown emails get the same answer.
  assert.equal((await client()('POST', '/api/forgot', { email: 'nessuno@example.com' })).status, 200);
});

test('a deactivated employee can no longer enter, but the data stays', async () => {
  const r = await owner('PATCH', `/api/admin/employees/${giuliaId}`, { active: false });
  assert.equal(r.data.employee.active, false);
  assert.equal((await giulia('GET', `/api/month/${MONTH}`)).status, 401);
  const login = await client()('POST', '/api/login', { email: 'giulia@example.com', password: 'nuova-password' });
  assert.equal(login.status, 401);
  assert.match(login.data.error, /disattivato/);
  const o = await owner('GET', `/api/admin/overview/${MONTH}`);
  assert.equal(o.data.employees.find((e) => e.id === giuliaId).totals.L, 3);
  await owner('PATCH', `/api/admin/employees/${giuliaId}`, { active: true, job: 'Receptionist' });
  const log = await owner('GET', `/api/admin/audit?user=${giuliaId}&limit=3`);
  assert.equal(log.data.events[0].action, 'user.reactivate');
  assert.equal(log.data.events[1].action, 'user.update');
  assert.deepEqual(log.data.events[1].after, { job: 'Receptionist' });
});

test('manual reminder from the owner reaches whoever has not confirmed', async () => {
  const r2 = await owner('POST', '/api/admin/employees', { firstName: 'Marco', lastName: 'Neri', email: 'marco@example.com' });
  const token = r2.data.access.link.split('#accesso/')[1];
  await client()('POST', '/api/access', { token, password: 'marco-password' });
  const r = await owner('POST', `/api/admin/remind/${MONTH}`);
  assert.deepEqual(r.data.reminded, ['Marco Neri']);
  await sleep(200);
  assert.ok(outbox().some((m) => m.to === 'marco@example.com' && /presenze/i.test(m.subject)));
});

test('the owner settings are saved and logged', async () => {
  const r = await owner('PUT', '/api/admin/settings', { reminderHour: 10, me: { firstName: 'Niccolò', lastName: 'Rossi' } });
  assert.equal(r.status, 200);
  const s = await owner('GET', '/api/admin/settings');
  assert.equal(s.data.reminderHour, 10);
  assert.equal(s.data.me.name, 'Niccolò Rossi');
  assert.equal((await owner('PUT', '/api/admin/settings', { reminderHour: 30 })).status, 400);
});

test('the app shell is served for every page', async () => {
  const r = await client()('GET', '/dipendenti');
  assert.match(r.data, /Presenze Horti 14/);
  const m = await client()('GET', '/manifest.webmanifest');
  assert.equal(m.data.short_name, 'Presenze');
});
