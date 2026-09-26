// Load test for the wedding day: N guests on the same Wi-Fi (one address), all at once.
// Starts a throw-away server, then: registrations, live connections, the table reveal,
// a burst of Chat LIVE messages and photos, and everyone playing the quiz together.
// Usage: node scripts/load-test.mjs [guests=170]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const N = Number(process.argv[2]) || 170;
const PORT = 4700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wedding-load-'));
const QUESTIONS = 17;
fs.writeFileSync(
  path.join(DATA, 'quiz.json'),
  JSON.stringify({
    prizes: 3,
    questions: Array.from({ length: QUESTIONS }, (_, i) => ({ text: `Domanda ${i + 1}`, options: ['A', 'B', 'C', 'D'], answer: i % 4 })),
  }),
);

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: 'x', MAIL_DEV: '1', SEED_FILE: '/nonexistent', QUIZ_FILE: path.join(DATA, 'quiz.json') },
  stdio: ['ignore', 'ignore', 'inherit'],
});
let peakRss = 0;
const rss = () => {
  try {
    const kb = Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${server.pid}/status`, 'utf8'))[1]);
    peakRss = Math.max(peakRss, kb);
  } catch {
    /* not on Linux */
  }
};
const rssTimer = setInterval(rss, 100);

function client() {
  let cookie = '';
  return async (method, url, body, form) => {
    const t = performance.now();
    const res = await fetch(BASE + url, {
      method,
      headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    const set = res.headers.getSetCookie().map((c) => c.split(';')[0]);
    if (set.length) cookie = set.join('; ');
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, ms: performance.now() - t, cookie: () => cookie };
  };
}

async function phase(name, tasks) {
  const t = performance.now();
  const results = await Promise.all(tasks.map((f) => f().catch((err) => ({ status: 0, ms: 0, err }))));
  const flat = results.flat();
  const ms = flat.map((r) => r.ms).sort((a, b) => a - b);
  const bad = flat.filter((r) => !(r.status >= 200 && r.status < 300));
  const pct = (p) => (ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] || 0).toFixed(0);
  console.log(
    `${name.padEnd(34)} ${String(flat.length).padStart(5)} richieste  ` +
      `mediana ${pct(0.5).padStart(4)} ms · 95% ${pct(0.95).padStart(4)} ms · max ${pct(1).padStart(5)} ms · ` +
      `totale ${((performance.now() - t) / 1000).toFixed(1)} s · errori ${bad.length}`,
  );
  if (bad.length) console.log('   primo errore:', bad[0].status, bad[0].data?.error || bad[0].err?.message);
  return results;
}

/** A live connection that counts the events it receives. */
function listen(cookie) {
  const got = { reveal: 0, msg: 0 };
  const ctrl = new AbortController();
  fetch(`${BASE}/api/stream`, { headers: { cookie }, signal: ctrl.signal })
    .then(async (res) => {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const m of dec.decode(value).matchAll(/event: (\w+)/g)) if (m[1] in got) got[m[1]]++;
      }
    })
    .catch(() => {});
  return { got, close: () => ctrl.abort() };
}

try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) break;
    } catch {
      /* starting */
    }
    await sleep(100);
  }
  const admin = client();
  await admin('POST', '/api/admin/login', { password: 'x' });
  await admin('POST', '/api/admin/tables/bulk', { count: 18, seats: 10, couple: true });

  console.log(`\n${N} invitati sulla stessa rete, tutti insieme:\n`);
  const guests = Array.from({ length: N }, () => client());
  const reg = await phase('Registrazioni', guests.map((g, i) => () => g('POST', '/api/register', { name: `Invitato Numero${i}`, email: `invitato${i}@example.com` })));
  const cookies = reg.map((r) => r.cookie());

  // Seat everyone, then open the live connections.
  const list = (await admin('GET', '/api/admin/guests')).data.guests;
  const tables = (await admin('GET', '/api/admin/tables')).data.tables;
  for (let i = 0; i < tables.length; i++) {
    const ids = list.filter((_, k) => k % tables.length === i).map((g) => g.id);
    await admin('POST', '/api/admin/guests/assign', { guestIds: ids, tableId: tables[i].id });
  }
  const streams = cookies.map((c) => listen(c));
  await sleep(1500);

  // 18:45: the reveal. Every phone is told at once and asks for its table.
  const t0 = performance.now();
  await admin('POST', '/api/admin/reveal/now');
  for (let i = 0; i < 100 && streams.some((s) => !s.got.reveal); i++) await sleep(50);
  const told = streams.filter((s) => s.got.reveal).length;
  console.log(`${'Avviso «tavoli svelati» in diretta'.padEnd(34)} ${told}/${N} telefoni in ${(performance.now() - t0).toFixed(0)} ms`);
  await phase('Tutti aprono il proprio tavolo', guests.map((g) => async () => [await g('GET', '/api/state'), await g('GET', '/api/seating')]));

  await admin('POST', '/api/admin/mode', { mode: 'live', notify: false });
  await sleep(300);
  await phase('Chat LIVE: un messaggio a testa', guests.map((g, i) => () => g('POST', '/api/messages', { text: `Evviva gli sposi! (${i})` })));
  await sleep(1500);
  const delivered = streams.reduce((n, s) => n + s.got.msg, 0);
  console.log(`${'Messaggi arrivati sui telefoni'.padEnd(34)} ${delivered}/${N * N} (${((100 * delivered) / (N * N)).toFixed(1)}%)`);

  const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900 * 1024, 7)]);
  const thumb = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(150 * 1024, 7)]);
  const shooters = guests.slice(0, Math.min(60, N));
  await phase('Chat LIVE: 60 foto nello stesso istante', shooters.map((g) => () => {
    const form = new FormData();
    form.append('photo', new Blob([photo], { type: 'image/jpeg' }), 'p.jpg');
    form.append('thumb', new Blob([thumb], { type: 'image/jpeg' }), 't.jpg');
    return g('POST', '/api/photos', undefined, form);
  }));
  await phase('Tutti ricaricano la chat', guests.map((g) => () => g('GET', '/api/messages')));

  await phase(`Gioco: ${QUESTIONS} risposte a testa, insieme`, guests.map((g) => async () => {
    const out = [await g('POST', '/api/quiz/start')];
    for (let i = 0; i < QUESTIONS; i++) out.push(await g('POST', '/api/quiz/answer', { index: i, choice: (i + (Math.random() < 0.8 ? 0 : 1)) % 4 }));
    out.push(await g('GET', '/api/quiz'));
    return out;
  }));

  streams.forEach((s) => s.close());
  rss();
  console.log(`\nMemoria massima usata dal server: ${(peakRss / 1024).toFixed(0)} MB (su Render ce ne sono 512)\n`);
} finally {
  clearInterval(rssTimer);
  server.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
}
