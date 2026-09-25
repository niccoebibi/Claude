// First-run setup: config/matrimonio.json is loaded once into a fresh installation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wedding-seed-'));
const PORT = 3990 + Math.floor(Math.random() * 9);
const BASE = `http://127.0.0.1:${PORT}`;
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z',
  'base64',
);
let images;
let server;

// Stand-in for the couple's wedding website hosting the illustrations.
before(async () => {
  images = http.createServer((req, res) => {
    if (req.url === '/cover.jpg') res.end(JPEG);
    else res.writeHead(404).end('missing');
  });
  await new Promise((r) => images.listen(0, '127.0.0.1', r));
  const img = `http://127.0.0.1:${images.address().port}`;
  const real = JSON.parse(fs.readFileSync('config/matrimonio.json', 'utf8'));
  real.images = { 'copertina.jpg': `${img}/cover.jpg`, 'palazzo-brancaccio.jpg': `${img}/nope.jpg` };
  fs.writeFileSync(path.join(DATA, 'seed.json'), JSON.stringify(real));
});

after(() => {
  server?.kill();
  images?.close();
  fs.rmSync(DATA, { recursive: true, force: true });
});

async function start() {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: 'x', SEED_FILE: path.join(DATA, 'seed.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  throw new Error('server did not start');
}
async function stop() {
  const exited = new Promise((r) => server.once('exit', r));
  server.kill();
  await exited;
}

async function adminCookie() {
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'x' }),
  });
  return r.headers.getSetCookie()[0].split(';')[0];
}

test('a fresh installation starts with the couple\'s content, tables and pictures', async () => {
  await start();
  const s = (await (await fetch(`${BASE}/api/state`)).json()).settings;
  assert.equal(s.coupleNames, 'Niccolò & Beatrice');
  assert.equal(s.weddingDate, '2027-04-17T15:00:00.000Z', '17:00 in Rome');
  assert.equal(s.revealAt, '2027-04-17T16:45:00.000Z', '18:45 in Rome');
  assert.equal(s.accent, 'cobalto');
  assert.equal(s.nameFont, 'script');
  assert.equal(s.sections[0].title, 'Il momento del sì');
  assert.equal(s.coverImage, 'copertina.jpg', 'downloaded picture is used');
  assert.equal(s.sections[1].image, '', 'a picture that could not be downloaded is dropped');
  assert.equal((await fetch(`${BASE}/uploads/copertina.jpg`)).status, 200);
  assert.equal(s.email, undefined);

  const cookie = await adminCookie();
  const tables = (await (await fetch(`${BASE}/api/admin/tables`, { headers: { cookie } })).json()).tables;
  assert.equal(tables.length, 19);
  assert.deepEqual([tables[0].name, tables[0].x, tables[0].y], ['Sposi', 50, 13]);
  assert.ok(tables.every((t) => t.x != null && t.y != null), 'all tables placed in the hall');
});

test('a restart never overwrites what the couple changed', async () => {
  const cookie = await adminCookie();
  await fetch(`${BASE}/api/admin/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ welcomeTitle: 'Benvenuti!' }),
  });
  await stop();
  await start();
  const s = (await (await fetch(`${BASE}/api/state`)).json()).settings;
  assert.equal(s.welcomeTitle, 'Benvenuti!');
  const tables = (await (await fetch(`${BASE}/api/admin/tables`, { headers: { cookie: await adminCookie() } })).json()).tables;
  assert.equal(tables.length, 19, 'tables not created twice');
});
