// End-to-end API tests: start the real server on a temp data dir and walk
// through the whole wedding flow. Run with `npm test`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wedding-test-'));
let server;

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: 'segreta', MAIL_DEV: '1', SEED_FILE: '/nonexistent', QUIZ_FILE: '/nonexistent' },
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
  const call = async (method, url, body, { form } = {}) => {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + url, { method, headers, body: payload, redirect: 'manual' });
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
  return {
    jar,
    get: (u) => call('GET', u),
    post: (u, b, o) => call('POST', u, b, o),
    patch: (u, b) => call('PATCH', u, b),
    del: (u) => call('DELETE', u),
  };
}

const outbox = () => {
  const dir = path.join(DATA, 'outbox');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
};

// 1x1 JPEG
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z',
  'base64',
);

const admin = client();
const mario = client();
const anna = client();

test('public state and shell', async () => {
  const r = await client().get('/api/state');
  assert.equal(r.status, 200);
  assert.equal(r.data.me, null);
  assert.equal(r.data.settings.mode, 'info');
  assert.ok(r.data.vapidPublicKey.length > 40);
  assert.equal(r.data.settings.email, undefined, 'private settings must not leak');
  const html = await client().get('/');
  assert.match(html.data, /<title>Niccolò &amp; Beatrice<\/title>/);
  const manifest = await client().get('/manifest.webmanifest');
  assert.equal(manifest.data.display, 'standalone');
});

test('admin login', async () => {
  assert.equal((await admin.post('/api/admin/login', { password: 'nope' })).status, 401);
  assert.equal((await admin.post('/api/admin/login', { password: 'segreta' })).status, 200);
  const st = await admin.get('/api/state');
  assert.equal(st.data.isAdmin, true);
  assert.equal((await mario.get('/api/admin/overview')).status, 401);
});

test('import guest list creates tables and guests', async () => {
  const r = await admin.post('/api/admin/guests/import', {
    rows: [
      { name: 'Mario Rossi', table: 'Positano', email: 'mario@example.com' },
      { name: 'Anna Bianchi', table: 'Positano', seat: '3' },
      { name: 'Luca Verdi', table: 'Amalfi' },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.created, 3);
  assert.equal(r.data.tablesCreated, 2);
  // re-import updates instead of duplicating
  const again = await admin.post('/api/admin/guests/import', { rows: [{ name: 'rossi mario', table: 'Positano' }] });
  assert.equal(again.data.updated, 1);
  assert.equal(again.data.guests.length, 3);
});

test('registration claims the imported entry', async () => {
  const bad = await mario.post('/api/register', { name: 'Mario', email: 'mario@example.com' });
  assert.equal(bad.status, 400);
  const r = await mario.post('/api/register', { name: 'Mario Rossi', email: 'Mario@Example.com' });
  assert.equal(r.status, 200);
  assert.equal(r.data.me.hasTable, true);
  const a = await anna.post('/api/register', { name: 'Bianchi Anna', email: 'anna@example.com' });
  assert.equal(a.data.me.hasTable, true, 'matched by name (order-insensitive)');
  const guests = (await admin.get('/api/admin/guests')).data.guests;
  assert.equal(guests.length, 3, 'no duplicates created');
});

test('login with emailed code from another device', async () => {
  const other = client();
  const r = await other.post('/api/register', { name: 'Mario Rossi', email: 'mario@example.com' });
  assert.equal(r.data.needCode, true);
  const mail = outbox().filter((m) => m.to === 'mario@example.com').pop();
  const code = mail.subject.match(/(\d{6})/)[1];
  assert.equal((await other.post('/api/login/verify', { email: 'mario@example.com', code: '000000' })).status, 400);
  const ok = await other.post('/api/login/verify', { email: 'mario@example.com', code });
  assert.equal(ok.status, 200);
  assert.equal((await other.get('/api/state')).data.me.name, 'Mario Rossi');
});

test('an email can be registered only once', async () => {
  const other = client();
  const r = await other.post('/api/register', { name: 'Laura Neri', email: 'mario@example.com' });
  assert.equal(r.status, 409);
  assert.equal(r.data.emailTaken, true);
  assert.equal((await other.get('/api/state')).data.me, null, 'not logged in');
  const same = await other.post('/api/register', { name: 'rossi mario', email: 'MARIO@example.com' });
  assert.equal(same.data.needCode, true, 'the same person logs in with a code instead');
  let guests = (await admin.get('/api/admin/guests')).data.guests;
  assert.equal(guests.filter((g) => g.email === 'mario@example.com' && g.registered).length, 1);
  const anna = guests.find((g) => g.name === 'Anna Bianchi');
  const clash = await admin.patch(`/api/admin/guests/${anna.id}`, { email: 'mario@example.com' });
  assert.equal(clash.status, 409);
  guests = (await admin.get('/api/admin/guests')).data.guests;
  assert.equal(guests.find((g) => g.id === anna.id).email, 'anna@example.com');
});

test('board is closed in info mode and opens in live mode', async () => {
  assert.equal((await mario.get('/api/messages')).status, 403);
  assert.equal((await mario.post('/api/messages', { text: 'ciao' })).status, 403);
  await admin.post('/api/admin/mode', { mode: 'live', notify: false });
  assert.equal((await mario.get('/api/state')).data.settings.mode, 'live');
  const m = await mario.post('/api/messages', { text: 'Viva gli sposi! <b>' });
  assert.equal(m.status, 200);
  assert.equal(m.data.message.author, 'Mario Rossi');
  const like = await anna.post(`/api/messages/${m.data.message.id}/like`);
  assert.deepEqual([like.data.likes, like.data.liked], [1, true]);
  const unlike = await anna.post(`/api/messages/${m.data.message.id}/like`);
  assert.deepEqual([unlike.data.likes, unlike.data.liked], [0, false]);
  assert.equal((await anna.del(`/api/messages/${m.data.message.id}`)).status, 403, 'cannot delete others');
  const adminMsg = await admin.post('/api/messages', { text: 'Grazie a tutti' });
  assert.equal(adminMsg.data.message.isAdmin, true);
  const list = await anna.get('/api/messages');
  assert.equal(list.data.messages.length, 2);
});

test('photo upload', async () => {
  const form = new FormData();
  form.append('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'p.jpg');
  form.append('thumb', new Blob([JPEG], { type: 'image/jpeg' }), 't.jpg');
  form.append('w', '1');
  form.append('h', '1');
  form.append('caption', 'Che bello');
  const r = await anna.post('/api/photos', undefined, { form });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.message.kind, 'photo');
  const img = await fetch(BASE + r.data.message.photo);
  assert.equal(img.status, 200);
  const bad = new FormData();
  bad.append('photo', new Blob([Buffer.from('not an image at all')]), 'x.jpg');
  assert.equal((await anna.post('/api/photos', undefined, { form: bad })).status, 400);
  const photos = await mario.get('/api/messages?kind=photo');
  assert.equal(photos.data.messages.length, 1);
});

test('live stream delivers new messages', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/stream`, {
    headers: { cookie: [...mario.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    signal: ctrl.signal,
  });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  await anna.post('/api/messages', { text: 'in diretta' });
  let buf = '';
  const deadline = Date.now() + 3000;
  while (!buf.includes('in diretta') && Date.now() < deadline) {
    const { value } = await reader.read();
    buf += new TextDecoder().decode(value);
  }
  ctrl.abort();
  assert.match(buf, /event: msg/);
});

test('seating stays secret until the reveal, then push + email go out', async () => {
  let s = await mario.get('/api/seating');
  assert.equal(s.data.revealed, false);
  assert.equal(s.data.table, undefined);

  const future = new Date(Date.now() + 3600e3).toISOString();
  await admin.patch('/api/admin/settings', { revealAt: future, revealMessage: 'Sorpresa!' });
  assert.equal((await mario.get('/api/seating')).data.revealed, false);

  // Imported with an email but never registered: still gets the seating email.
  await admin.post('/api/admin/guests/import', { rows: [{ name: 'Carla Rosa', table: 'Amalfi', email: 'carla@example.com' }] });

  await admin.post('/api/admin/reveal/now');
  for (let i = 0; i < 40; i++) {
    const st = (await admin.get('/api/admin/overview')).data.stats;
    if (st.emailSent === 3) break;
    await sleep(150);
  }
  const stats = (await admin.get('/api/admin/overview')).data.stats;
  assert.equal(stats.notified, 3);
  assert.equal(stats.emailSent, 3);

  const carlaMail = outbox().find((m) => m.to === 'carla@example.com');
  const link = carlaMail.html.match(/href="https?:\/\/[^/]+(\/login\?key=[^"&]+)/)[1];
  const carla = client();
  const redirect = await carla.get(link.replace(/&amp;/g, '&'));
  assert.equal(redirect.status, 302);
  assert.equal((await carla.get('/api/state')).data.me.name, 'Carla Rosa');
  assert.equal((await carla.get('/api/seating')).data.table.name, 'Amalfi');

  s = await mario.get('/api/seating');
  assert.equal(s.data.revealed, true);
  assert.equal(s.data.table.name, 'Positano');
  assert.deepEqual(s.data.mates, ['Anna Bianchi']);

  const mail = outbox().find((m) => m.to === 'anna@example.com' && /tavolo/.test(m.subject));
  assert.ok(mail, 'seating email sent');
  assert.match(mail.html, /Positano/);
  assert.match(mail.html, /Sorpresa!/);
  assert.match(mail.html, /Posto: <b>3<\/b>/);
  assert.match(mail.html, /Mario Rossi/);

  // A late table change re-notifies only that guest.
  const guests = (await admin.get('/api/admin/guests')).data.guests;
  const tables = (await admin.get('/api/admin/tables')).data.tables;
  const annaRow = guests.find((g) => g.name === 'Anna Bianchi');
  const amalfi = tables.find((t) => t.name === 'Amalfi');
  const before = outbox().length;
  await admin.patch(`/api/admin/guests/${annaRow.id}`, { tableId: amalfi.id });
  for (let i = 0; i < 30 && outbox().length === before; i++) await sleep(100);
  assert.equal(outbox().length, before + 1);
  assert.match(outbox().pop().html, /Amalfi/);
});

test('announcement, exports and QR', async () => {
  const a = await admin.post('/api/admin/announce', { title: 'Torta!', text: 'Tutti in giardino', push: true, post: true });
  assert.equal(a.status, 200);
  const st = await mario.get('/api/state');
  assert.equal(st.data.settings.lastAnnouncement.title, 'Torta!');
  const msgs = (await mario.get('/api/messages')).data.messages;
  assert.equal(msgs.at(-1).kind, 'announce');

  const csv = await admin.get('/api/admin/guests.csv');
  assert.match(csv.data, /Mario Rossi;mario@example.com;Positano/);
  const zip = await fetch(`${BASE}/api/admin/photos.zip`, {
    headers: { cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  const buf = Buffer.from(await zip.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  const qr = await admin.get('/api/admin/qr.svg');
  assert.match(qr.data, /<svg/);
});

test('settings validation keeps links safe', async () => {
  const r = await admin.patch('/api/admin/settings', {
    sections: [{ title: 'X', linkUrl: 'javascript:alert(1)' }, { title: 'Y', linkUrl: 'www.google.com/maps' }],
    accent: 'nonexistent',
  });
  assert.equal(r.data.settings.sections[0].linkUrl, '');
  assert.equal(r.data.settings.sections[1].linkUrl, 'https://www.google.com/maps');
  assert.equal(r.data.settings.accent, 'salvia');
  assert.equal(r.data.settings.email.pass, '', 'password never returned');
});

test('tables: bulk creation, automatic layout, group assignment, entrance', async () => {
  const before = (await admin.get('/api/admin/tables')).data.tables.length;
  const bulk = await admin.post('/api/admin/tables/bulk', { count: 18, prefix: 'Tavolo', seats: 8, couple: true });
  const tables = bulk.data.tables;
  assert.equal(tables.length, before + 19, '18 round tables + the couple table');
  const couple = tables.find((t) => t.shape === 'rect');
  assert.equal(couple.name, 'Sposi');
  assert.equal(couple.seats, 2);
  assert.equal(tables[0].id, couple.id, 'couple table listed first');
  assert.equal(tables.filter((t) => /^Tavolo \d+$/.test(t.name)).length, 18);

  const arranged = (await admin.post('/api/admin/tables/arrange')).data.tables;
  const c = arranged.find((t) => t.id === couple.id);
  assert.deepEqual([c.x, c.y], [50, 13], 'couple table at the top centre');
  assert.ok(arranged.every((t) => t.x > 0 && t.x < 100 && t.y > 0 && t.y < 100));
  assert.ok(arranged.filter((t) => t.id !== couple.id).every((t) => t.y > c.y), 'others below it');

  const t5 = arranged.find((t) => t.name === 'Tavolo 5');
  const guests = (await admin.get('/api/admin/guests')).data.guests;
  const ids = guests.slice(0, 2).map((g) => g.id);
  const assign = await admin.post('/api/admin/guests/assign', { guestIds: ids, tableId: t5.id });
  assert.equal(assign.data.changed, 2);
  assert.deepEqual(
    assign.data.tables.find((t) => t.id === t5.id).guests.map((g) => g.id).sort(),
    [...ids].sort(),
  );
  const off = await admin.post('/api/admin/guests/assign', { guestIds: [ids[0]], tableId: null });
  assert.equal(off.data.guests.find((g) => g.id === ids[0]).tableId, null);

  await admin.patch(`/api/admin/tables/${t5.id}`, { shape: 'rect', seats: 99 });
  const t5b = (await admin.get('/api/admin/tables')).data.tables.find((t) => t.id === t5.id);
  assert.deepEqual([t5b.shape, t5b.seats], ['rect', 30], 'seats capped at 30');

  const ent = await admin.patch('/api/admin/settings', { hallEntrance: { x: 8, y: 96 } });
  assert.deepEqual(ent.data.settings.hallEntrance, { x: 8, y: 96 });
  const seating = await admin.get('/api/seating');
  assert.deepEqual(seating.data.entrance, { x: 8, y: 96 });
  assert.ok(seating.data.tables.some((t) => t.shape === 'rect'));
});

test('style options and card images', async () => {
  const form = new FormData();
  form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 's.jpg');
  const up = await admin.post('/api/admin/upload/section', undefined, { form });
  assert.equal(up.status, 200);
  assert.match(up.data.file, /^section-[\w.-]+\.jpg$/);
  const r = await admin.patch('/api/admin/settings', {
    accent: 'cobalto',
    nameFont: 'script',
    coverTone: 'light',
    sections: [{ title: 'Dopo il sì', image: up.data.file }, { title: 'X', image: '../../etc/passwd' }],
  });
  assert.equal(r.data.settings.accent, 'cobalto');
  assert.equal(r.data.settings.nameFont, 'script');
  assert.equal(r.data.settings.coverTone, 'light');
  assert.equal(r.data.settings.sections[0].image, up.data.file);
  assert.equal(r.data.settings.sections[1].image, '', 'paths are rejected');
  const bogus = await admin.patch('/api/admin/settings', { nameFont: 'comic', coverTone: 'neon' });
  assert.equal(bogus.data.settings.nameFont, 'serif');
  assert.equal(bogus.data.settings.coverTone, 'dark');
  assert.equal((await fetch(`${BASE}/uploads/${up.data.file}`)).status, 200);
});

test('quiz: answers stay secret, everyone gets a trophy, all right = shiny one', async () => {
  assert.equal((await mario.get('/api/quiz')).status, 404, 'no quiz yet');
  assert.equal((await mario.get('/api/state')).data.settings.quiz, null);
  const quiz = {
    title: 'Quanto conosci gli sposi?',
    prizes: 3,
    questions: [
      { emoji: '🎂', text: 'Domanda uno', options: ['A', '', 'B', 'C'], answer: 2, fact: 'Era B', effect: 'drago' },
      { text: 'Domanda due', options: ['Sì', 'No'], answer: 0, effect: '<script>' },
      { text: 'Una sola opzione', options: ['solo questa'] },
    ],
  };
  const saved = (await admin.patch('/api/admin/settings', { quiz })).data.settings.quiz;
  assert.equal(saved.questions.length, 2, 'a question needs at least two options');
  assert.deepEqual(saved.questions[0].options, ['A', 'B', 'C']);
  assert.equal(saved.questions[0].answer, 1, 'the right answer follows its option');
  assert.deepEqual(saved.questions.map((x) => x.effect), ['drago', ''], 'only known effects');

  const pub = (await client().get('/api/state')).data.settings.quiz;
  assert.deepEqual(
    pub,
    { title: 'Quanto conosci gli sposi?', intro: '', count: 2, prizes: 3, prizesLeft: 3 },
    'no questions in the public state',
  );
  assert.equal((await client().get('/api/quiz')).status, 401);

  const game = (await mario.get('/api/quiz')).data;
  assert.equal(game.questions[0].answer, undefined, 'answers stay on the server');
  assert.equal(game.questions[0].effect, 'drago');
  const wrong = await mario.post('/api/quiz/answer', { index: 0, choice: 0 });
  assert.deepEqual([wrong.data.correct, wrong.data.answer, wrong.data.fact], [false, 1, 'Era B']);
  assert.equal((await mario.post('/api/quiz/answer', { index: 0, choice: 1 })).status, 409, 'no second chances');
  assert.equal((await mario.post('/api/quiz/answer', { index: 1, choice: 5 })).status, 400);
  const last = await mario.post('/api/quiz/answer', { index: 1, choice: 0 });
  assert.equal(last.data.trophy, 'classic', 'a trophy for everyone who finishes');
  assert.deepEqual(last.data.me.quiz, { answered: 2, score: 1, done: true, place: null });
  assert.equal((await mario.get('/api/quiz')).data.questions[0].chosen, 0, 'answers can be reviewed');

  await anna.post('/api/quiz/answer', { index: 0, choice: 1 });
  const annaDone = await anna.post('/api/quiz/answer', { index: 1, choice: 0 });
  assert.equal(annaDone.data.trophy, 'shiny');
  assert.equal(annaDone.data.place, 1, 'first with everything right: a prize');
  assert.equal(last.data.place, null);
  assert.equal((await anna.get('/api/state')).data.settings.quiz.prizesLeft, 2);
  assert.deepEqual((await mario.get('/api/quiz')).data.champions, ['Anna Bianchi']);
  assert.equal((await anna.get('/api/state')).data.me.trophy, 'shiny');

  // The trophy shows next to the name in the Chat LIVE.
  const msg = (await anna.post('/api/messages', { text: 'Ho vinto!' })).data.message;
  assert.equal(msg.trophy, 'shiny');
  const list = (await mario.get('/api/messages')).data.messages;
  assert.equal(list.find((m) => m.id === msg.id).trophy, 'shiny');

  const stats = (await admin.get('/api/admin/overview')).data.quiz;
  assert.deepEqual([stats.finished, stats.shiny, stats.prizes], [2, 1, 3]);
  assert.deepEqual(stats.winners.map((w) => w.name), ['Anna Bianchi'], 'the couple sees who wins the prizes');
  await admin.post('/api/admin/quiz/reset');
  assert.equal((await anna.get('/api/state')).data.me.trophy, null);
});
