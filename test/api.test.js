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
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: 'segreta', MAIL_DEV: '1' },
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
