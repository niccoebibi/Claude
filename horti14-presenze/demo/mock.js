/*
 * Demo backend: simulates the server inside the browser, so the real app can be tried
 * without deploying (fetch to /api/… is intercepted). Sample people and data only;
 * everything stays in this browser (localStorage).
 */
import {
  romeNow, monthOf, addMonths, addDays, monthDays, weekday, deadline, isMonth, isDay, cleanEntry, sameEntry,
  totals, canonicalMonth, monthStatus, employeeCanEdit, monthName, dayLabel,
} from '../js/cal.js';
import { monthSheet, auditSheet } from '../js/sheets.js';
import { toast } from '../js/ui.js';

const KEY = 'h14-presenze-demo-v1';
const HOUR = 3600e3;

/* ------------------------------------------------------------------ */
/* SHA-256 (sync), for the audit chain and the month fingerprints      */
/* ------------------------------------------------------------------ */

const primes = [];
for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
const frac = (x) => ((x - Math.floor(x)) * 2 ** 32) >>> 0;
const K = primes.map((p) => frac(Math.cbrt(p)));
const H0 = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(text) {
  const bytes = new TextEncoder().encode(String(text));
  const len = (((bytes.length + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(len);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = bytes.length * 8;
  dv.setUint32(len - 8, Math.floor(bits / 2 ** 32));
  dv.setUint32(len - 4, bits >>> 0);
  const H = H0.slice();
  const w = new Uint32Array(64);
  for (let i = 0; i < len; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, k) => (H[k] = (H[k] + v) | 0));
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let db;
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* private mode: the demo still works until reload */
  }
};

const fullName = (u) => `${u.first_name} ${u.last_name}`.trim();
const userById = (id) => db.users.find((u) => u.id === Number(id));
const me = () => (db.session ? userById(db.session) : null);
const today = () => romeNow().day;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Safari/537.36';

const FIELDS = ['id', 'at', 'actor_id', 'actor', 'subject_id', 'subject', 'action', 'month', 'day', 'before', 'after', 'ip', 'ua', 'prev_hash'];
const hashOf = (row) => sha256(JSON.stringify(FIELDS.map((f) => row[f] ?? null)));

function actorLabel(u) {
  if (!u) return 'Sistema';
  if (u.role === 'admin') return fullName(u) === 'Titolare' ? 'Titolare' : `${fullName(u)} (titolare)`;
  return `${fullName(u)} (dipendente)`;
}

/** Build an event (not yet chained). */
function event(ctx, { action, subject = null, month = null, day = null, before = null, after = null, at = Date.now() }) {
  return {
    at,
    actor_id: ctx.user?.id ?? null,
    actor: actorLabel(ctx.user),
    subject_id: subject?.id ?? null,
    subject: subject ? fullName(subject) : '',
    action,
    month,
    day,
    before: before == null ? null : JSON.stringify(before),
    after: after == null ? null : JSON.stringify(after),
    ip: ctx.ip || '',
    ua: ctx.ua || '',
  };
}

function append(row) {
  const prev = db.audit.at(-1);
  row.id = (prev?.id || 0) + 1;
  row.prev_hash = prev?.hash || '0'.repeat(64);
  row.hash = hashOf(row);
  db.audit.push(row);
  return row;
}

const log = (ctx, e) => append(event(ctx, e));
const liveCtx = () => ({ user: me(), ip: '93.44.120.18', ua: navigator.userAgent });

function rowJson(r) {
  return {
    id: r.id, at: r.at, actorId: r.actor_id, actor: r.actor, subjectId: r.subject_id, subject: r.subject, action: r.action,
    month: r.month, day: r.day, before: r.before ? JSON.parse(r.before) : null, after: r.after ? JSON.parse(r.after) : null,
    ip: r.ip, ua: r.ua, prevHash: r.prev_hash, hash: r.hash,
  };
}

/* ------------------------------------------------------------------ */
/* Sample data                                                         */
/* ------------------------------------------------------------------ */

/** Instant of a Rome wall-clock time (tries both CET and CEST). */
function at(day, hour, minute = 0) {
  for (const off of [1, 2]) {
    const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), hour - off, minute);
    const r = romeNow(t);
    if (r.day === day && r.hour === hour) return t;
  }
  return Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
}

function seed() {
  const now = Date.now();
  const t = today();
  const cur = monthOf(t);
  const prev = addMonths(cur, -1);
  const start = at(`${addMonths(cur, -3)}-03`, 10);
  const people = [
    ['admin', 'Titolare', '', 'titolare@horti14.com', '', '', MAC],
    ['employee', 'Giulia', 'Verdi', 'giulia.verdi@example.com', '333 111 2233', 'Reception', IPHONE],
    ['employee', 'Marco', 'Neri', 'marco.neri@example.com', '333 222 3344', 'Cucina', ANDROID],
    ['employee', 'Sara', 'Bianchi', 'sara.bianchi@example.com', '', 'Housekeeping', IPHONE],
    ['employee', 'Luca', 'Gialli', 'luca.gialli@example.com', '', 'Manutenzione', ANDROID],
    ['employee', 'Paolo', 'Conti', 'paolo.conti@example.com', '', 'Colazioni', IPHONE],
    ['employee', 'Elena', 'Russo', 'elena.russo@example.com', '333 444 5566', 'Reception', ''],
  ];
  db = {
    v: 1, session: 2, company: 'Horti 14', reminderHour: 9, push: {}, invites: {}, subs: [], entries: {}, audit: [],
    email: { provider: 'gmail', user: 'presenze@horti14.com', fromName: '', hasPass: true },
    users: people.map(([role, first, last, email, phone, job, ua], i) => ({
      id: i + 1, role, first_name: first, last_name: last, email, phone, job, active: true,
      activated: i !== 6, created_at: start + i * 60e3, last_seen: i === 6 ? null : now - (i + 1) * 3 * HOUR, ua,
    })),
  };
  const [owner, giulia, marco, sara, luca, paolo] = db.users;
  const events = [];
  const ip = (u) => `93.44.${100 + u.id}.${20 + u.id * 7}`;
  const ctxOf = (u) => ({ user: u, ip: ip(u), ua: u.ua });
  const push = (ctx, e) => events.push(event(ctx, e));

  push(ctxOf(owner), { action: 'auth.login', subject: owner, at: start - 60e3 });
  for (const u of db.users.slice(1)) {
    push(ctxOf(owner), { action: 'user.create', subject: u, after: { role: 'employee', email: u.email, job: u.job }, at: u.created_at });
    push(ctxOf(owner), { action: 'user.invite', subject: u, after: { emailed: true }, at: u.created_at + 5e3 });
    if (u.activated) push(ctxOf(u), { action: 'auth.password_set', subject: u, at: u.created_at + 2 * HOUR + u.id * 60e3 });
  }

  // Rotating hotel shifts: five days on, two off.
  const shift = (u, day) => (Math.floor((Date.parse(day) / 864e5)) + u.id * 2) % 7 < 5;
  // Each day is entered the evening it is worked; days planned ahead are entered just before confirming.
  function fill(u, month, { until, extra = {}, confirmAt = null }) {
    const e = (db.entries[u.id] ||= {});
    for (const day of monthDays(month)) {
      if (day > until) break;
      const entry = extra[day] || (shift(u, day) ? { code: 'L' } : null);
      if (!entry) continue;
      e[day] = entry;
      const evening = at(day, 19, 5 + u.id * 3);
      const when = confirmAt ? Math.min(evening, confirmAt - 10 * 60e3) : evening;
      push(ctxOf(u), { action: 'day.set', subject: u, month, day, before: null, after: entry, at: when });
    }
    if (confirmAt) confirm(u, month, confirmAt);
  }
  function confirm(u, month, when) {
    const e = Object.fromEntries(Object.entries(db.entries[u.id] || {}).filter(([d]) => d.startsWith(month)));
    const digest = sha256(canonicalMonth(e));
    const tot = totals(e);
    const ev = event(ctxOf(u), { action: 'month.confirm', subject: u, month, after: { totals: tot, digest, days: Object.keys(e).length }, at: when });
    events.push(ev);
    db.subs.push({ user_id: u.id, month, digest, content: canonicalMonth(e), totals: tot, ev, at: when });
  }

  // Previous month: complete and confirmed by everyone.
  const prevDl = deadline(prev);
  const prevEnd = monthDays(prev).at(-1);
  const offDays = (u, month, n, from) => monthDays(month).filter((d) => shift(u, d) && d >= from).slice(0, n);
  const ferie = Object.fromEntries(offDays(sara, prev, 3, `${prev}-10`).map((d) => [d, { code: 'F' }]));
  for (const u of [giulia, marco, sara, luca, paolo]) {
    fill(u, prev, { until: prevEnd, extra: u === sara ? ferie : {}, confirmAt: at(addDays(prevDl, u === paolo ? 1 : -1), 18, 10 + u.id * 4) });
  }
  push({}, { action: 'reminder.sent', subject: paolo, month: prev, after: { kind: 'due', label: 'di scadenza', push: 1, email: true }, at: at(prevDl, 9) });

  // Current month.
  const yesterday = addDays(t, -1);
  const monthEnd = monthDays(cur).at(-1);
  const [p1] = offDays(giulia, cur, 1, `${cur}-05`);
  const [f1, f2] = offDays(giulia, cur, 2, `${cur}-12`);
  fill(giulia, cur, { until: yesterday, extra: { ...(p1 ? { [p1]: { code: 'P', hours: 2, note: 'Visita medica' } } : {}), ...(f1 ? { [f1]: { code: 'F' }, [f2]: { code: 'F' } } : {}) } });
  fill(marco, cur, { until: monthEnd, confirmAt: at(yesterday, 20, 30) });
  const sick = offDays(sara, cur, 2, `${cur}-08`);
  fill(sara, cur, { until: yesterday, extra: Object.fromEntries(sick.map((d) => [d, { code: 'M', note: 'Certificato n. 4471829' }])) });
  const lucaAt = at(yesterday, 20, 45);
  fill(luca, cur, { until: monthEnd, confirmAt: lucaAt });
  fill(paolo, cur, { until: monthEnd, confirmAt: at(yesterday, 21, 10) });
  // Luca corrects a day after confirming: the month goes back to "da riconfermare".
  const lucaDay = monthDays(cur).find((d) => d < t && db.entries[luca.id][d]?.code === 'L');
  if (lucaDay) {
    db.entries[luca.id][lucaDay] = { code: 'P', hours: 3, note: 'Uscita anticipata' };
    push(ctxOf(luca), { action: 'day.set', subject: luca, month: cur, day: lucaDay, before: { code: 'L' }, after: db.entries[luca.id][lucaDay], at: Math.max(lucaAt + 30 * 60e3, now - 5 * HOUR) });
  }
  for (const u of db.users.slice(0, 6)) push(ctxOf(u), { action: 'auth.login', subject: u, at: now - u.id * 2 * HOUR - 17e5 });

  // Chain everything in time order; submissions point at their confirmation event.
  events.sort((a, b) => a.at - b.at);
  for (const ev of events) append(ev);
  for (const s of db.subs) {
    s.audit_id = s.ev.id;
    delete s.ev;
  }
  save();
}

function load() {
  try {
    db = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    db = null;
  }
  // Start over when the saved demo belongs to an old month.
  if (!db || db.v !== 1 || db.month !== monthOf(today())) {
    seed();
    db.month = monthOf(today());
    save();
  }
}

/* ------------------------------------------------------------------ */
/* Month logic (same rules as the server)                              */
/* ------------------------------------------------------------------ */

function monthEntries(uid, month) {
  return Object.fromEntries(Object.entries(db.entries[uid] || {}).filter(([d]) => d.startsWith(month)).sort());
}

const lastSub = (uid, month) => db.subs.filter((s) => s.user_id === uid && s.month === month).at(-1);

function monthState(u, month) {
  const entries = monthEntries(u.id, month);
  const digest = sha256(canonicalMonth(entries));
  const last = lastSub(u.id, month);
  return {
    month, entries, digest, totals: totals(entries),
    ...monthStatus({ month, today: today(), confirmedDigest: last?.digest, currentDigest: digest }),
    confirmedAt: last?.at ?? null, receiptId: last?.audit_id ?? null,
  };
}

const payload = (u, month, admin = false) => ({
  ...monthState(u, month),
  today: today(),
  editable: admin ? month <= addMonths(monthOf(today()), 12) : employeeCanEdit(month, today()),
});

function setDays(ctx, u, days, entry) {
  const e = (db.entries[u.id] ||= {});
  for (const day of days) {
    const before = e[day] || null;
    if (sameEntry(before, entry)) continue;
    if (entry) e[day] = entry;
    else delete e[day];
    log(ctx, { action: 'day.set', subject: u, month: day.slice(0, 7), day, before, after: entry });
  }
  save();
}

const expected = (month) => db.users.filter((u) => u.role === 'employee' && u.active && u.activated && romeNow(u.created_at).month <= month);

function userJson(u) {
  return {
    id: u.id, role: u.role, firstName: u.first_name, lastName: u.last_name, name: fullName(u), email: u.email, phone: u.phone,
    job: u.job, active: u.active, activated: u.activated, createdAt: u.created_at, lastSeen: u.last_seen, pushDevices: db.push[u.id] ? 1 : 0,
  };
}

function overview(month) {
  const exp = new Set(expected(month).map((u) => u.id));
  return db.users
    .filter((u) => u.role === 'employee' && (u.active || Object.keys(monthEntries(u.id, month)).length))
    .sort((a, b) => a.last_name.localeCompare(b.last_name))
    .map((u) => {
      const s = monthState(u, month);
      return {
        id: u.id, name: fullName(u), firstName: u.first_name, lastName: u.last_name, job: u.job, active: u.active, activated: u.activated,
        expected: exp.has(u.id), state: s.state, late: s.late && exp.has(u.id), dueToday: s.dueToday, confirmedAt: s.confirmedAt,
        totals: s.totals, entries: s.entries,
      };
    });
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

function daysBody(body, month) {
  const days = [...new Set(body?.days || [])];
  if (!days.length || !days.every((d) => isDay(d) && d.startsWith(month))) fail(400, 'Giorni non validi');
  let entry = null;
  if (body.entry) entry = cleanEntry(body.entry) || fail(400, 'Dati del giorno non validi');
  return { days: days.sort(), entry };
}

const history = (uid, month) => db.audit.filter((r) => r.subject_id === uid && r.month === month).reverse().map(rowJson);

function newLink(u) {
  const token = sha256(`${u.id}-${Date.now()}-${Math.random()}`).slice(0, 32);
  db.invites[token] = u.id;
  return `${location.origin}${location.pathname}#accesso/${token}`;
}

function requireUser() {
  return me() || fail(401, 'Accedi per continuare');
}
function requireAdmin() {
  const u = requireUser();
  if (u.role !== 'admin') fail(403, 'Riservato al titolare');
  return u;
}

const routes = [
  ['GET', /^\/api\/me$/, () => ({
    user: me() ? userJson(me()) : null, company: db.company, today: today(), serverTime: Date.now(), vapidPublicKey: 'demo', emailEnabled: true,
  })],
  ['POST', /^\/api\/login$/, (m, b) => {
    const u = db.users.find((x) => x.email === String(b.email || '').trim().toLowerCase());
    if (!u || !u.activated || !String(b.password || '')) fail(401, 'Email o password non corrette (nella prova usa per esempio giulia.verdi@example.com e una password qualsiasi)');
    db.session = u.id;
    log(liveCtx(), { action: 'auth.login', subject: u });
    save();
    return { user: userJson(u) };
  }],
  ['POST', /^\/api\/logout$/, () => {
    if (me()) log(liveCtx(), { action: 'auth.logout', subject: me() });
    db.session = null;
    save();
    return { ok: true };
  }],
  ['POST', /^\/api\/access\/info$/, (m, b) => {
    const u = userById(db.invites[b.token]) || fail(404, 'Questo link non è più valido: chiedine uno nuovo al titolare.');
    return { firstName: u.first_name, email: u.email, reset: u.activated };
  }],
  ['POST', /^\/api\/access$/, (m, b) => {
    const u = userById(db.invites[b.token]) || fail(404, 'Questo link non è più valido.');
    if (String(b.password || '').length < 8) fail(400, 'La password deve avere almeno 8 caratteri');
    delete db.invites[b.token];
    u.activated = true;
    db.session = u.id;
    log(liveCtx(), { action: 'auth.password_set', subject: u });
    save();
    return { user: userJson(u) };
  }],
  ['POST', /^\/api\/forgot$/, () => ({ ok: true, emailEnabled: true })],
  ['POST', /^\/api\/password$/, (m, b) => {
    const u = requireUser();
    if (String(b.password || '').length < 8) fail(400, 'La password deve avere almeno 8 caratteri');
    log(liveCtx(), { action: 'auth.password_change', subject: u });
    save();
    return { ok: true };
  }],
  ['POST', /^\/api\/push\/(subscribe|unsubscribe|test)$/, () => ({ ok: true })],

  ['GET', /^\/api\/month\/(\d{4}-\d{2})$/, (m) => payload(requireUser(), m[1])],
  ['PUT', /^\/api\/month\/(\d{4}-\d{2})\/days$/, (m, b) => {
    const u = requireUser();
    if (!employeeCanEdit(m[1], today())) fail(403, 'Questo mese è chiuso: per correzioni chiedi al titolare');
    const { days, entry } = daysBody(b, m[1]);
    setDays(liveCtx(), u, days, entry);
    return payload(u, m[1]);
  }],
  ['POST', /^\/api\/month\/(\d{4}-\d{2})\/confirm$/, (m) => {
    const u = requireUser();
    const month = m[1];
    const s = monthState(u, month);
    const last = lastSub(u.id, month);
    if (last?.digest === s.digest) return { ...payload(u, month), receipt: { id: last.audit_id, at: last.at, already: true } };
    const row = log(liveCtx(), { action: 'month.confirm', subject: u, month, after: { totals: s.totals, digest: s.digest, days: Object.keys(s.entries).length } });
    db.subs.push({ user_id: u.id, month, digest: s.digest, content: canonicalMonth(s.entries), totals: s.totals, audit_id: row.id, at: row.at });
    save();
    return { ...payload(u, month), receipt: { id: row.id, at: row.at, already: false } };
  }],
  ['GET', /^\/api\/month\/(\d{4}-\d{2})\/history$/, (m) => ({ events: history(requireUser().id, m[1]) })],

  ['GET', /^\/api\/admin\/overview\/(\d{4}-\d{2})$/, (m) => {
    requireAdmin();
    return { month: m[1], today: today(), deadline: deadline(m[1]), employees: overview(m[1]) };
  }],
  ['GET', /^\/api\/admin\/user\/(\d+)\/month\/(\d{4}-\d{2})$/, (m) => {
    requireAdmin();
    const u = userById(m[1]) || fail(404, 'Dipendente non trovato');
    return { ...payload(u, m[2], true), employee: userJson(u) };
  }],
  ['PUT', /^\/api\/admin\/user\/(\d+)\/month\/(\d{4}-\d{2})\/days$/, (m, b) => {
    requireAdmin();
    const u = userById(m[1]) || fail(404, 'Dipendente non trovato');
    const { days, entry } = daysBody(b, m[2]);
    setDays(liveCtx(), u, days, entry);
    return { ...payload(u, m[2], true), employee: userJson(u) };
  }],
  ['GET', /^\/api\/admin\/user\/(\d+)\/month\/(\d{4}-\d{2})\/history$/, (m) => (requireAdmin(), { events: history(Number(m[1]), m[2]) })],
  ['GET', /^\/api\/admin\/employees$/, () => {
    requireAdmin();
    const byName = (a, b) => a.last_name.localeCompare(b.last_name);
    return {
      employees: db.users.filter((u) => u.role === 'employee').sort((a, b) => b.active - a.active || byName(a, b)).map(userJson),
      admins: db.users.filter((u) => u.role === 'admin').map(userJson),
    };
  }],
  ['POST', /^\/api\/admin\/employees$/, (m, b) => {
    requireAdmin();
    const email = String(b.email || '').trim().toLowerCase();
    if (!String(b.firstName || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Nome ed email sono obbligatori');
    if (db.users.some((u) => u.email === email)) fail(409, 'Esiste già un account con questa email');
    const u = {
      id: Math.max(...db.users.map((x) => x.id)) + 1, role: b.role === 'admin' ? 'admin' : 'employee', first_name: b.firstName.trim(),
      last_name: String(b.lastName || '').trim(), email, phone: b.phone || '', job: b.job || '', active: true, activated: false,
      created_at: Date.now(), last_seen: null,
    };
    db.users.push(u);
    log(liveCtx(), { action: 'user.create', subject: u, after: { role: u.role, email: u.email, job: u.job } });
    const link = newLink(u);
    log(liveCtx(), { action: 'user.invite', subject: u, after: { emailed: true } });
    save();
    return { employee: userJson(u), access: { link, emailed: true } };
  }],
  ['PATCH', /^\/api\/admin\/employees\/(\d+)$/, (m, b) => {
    requireAdmin();
    const u = userById(m[1]) || fail(404, 'Account non trovato');
    const map = { firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone', job: 'job', role: 'role' };
    const before = {};
    const after = {};
    for (const [k, col] of Object.entries(map)) {
      if (b[k] === undefined || b[k] === u[col]) continue;
      before[k] = u[col];
      after[k] = b[k];
      u[col] = b[k];
    }
    if (Object.keys(after).length) log(liveCtx(), { action: 'user.update', subject: u, before, after });
    if (typeof b.active === 'boolean' && b.active !== u.active) {
      u.active = b.active;
      log(liveCtx(), { action: b.active ? 'user.reactivate' : 'user.deactivate', subject: u });
    }
    save();
    return { employee: userJson(u) };
  }],
  ['POST', /^\/api\/admin\/employees\/(\d+)\/access$/, (m) => {
    requireAdmin();
    const u = userById(m[1]) || fail(404, 'Account non trovato');
    const link = newLink(u);
    log(liveCtx(), { action: 'user.invite', subject: u, after: { emailed: true } });
    save();
    return { link, emailed: true };
  }],
  ['POST', /^\/api\/admin\/remind\/(\d{4}-\d{2})$/, (m) => {
    requireAdmin();
    const missing = expected(m[1]).filter((u) => monthState(u, m[1]).state !== 'ok');
    for (const u of missing) log(liveCtx(), { action: 'reminder.sent', subject: u, month: m[1], after: { kind: 'manual', label: 'manuale', push: db.push[u.id] ? 1 : 0, email: true } });
    save();
    return { reminded: missing.map(fullName) };
  }],
  ['GET', /^\/api\/admin\/audit\/verify$/, () => {
    requireAdmin();
    let prev = '0'.repeat(64);
    for (const [i, r] of db.audit.entries()) {
      const reason = r.id !== i + 1 ? `manca l'evento n. ${i + 1}` : r.prev_hash !== prev ? "collegamento con l'evento precedente alterato" : hashOf(r) !== r.hash ? 'contenuto alterato' : null;
      if (reason) return { ok: false, count: i + 1, brokenAt: r.id, reason };
      prev = r.hash;
    }
    const h = db.audit.at(-1);
    return { ok: true, count: db.audit.length, head: h ? { id: h.id, at: h.at, hash: h.hash } : null };
  }],
  ['GET', /^\/api\/admin\/audit$/, (m, b, url) => {
    requireAdmin();
    const q = url.searchParams;
    const limit = Math.min(Number(q.get('limit')) || 100, 500);
    const rows = db.audit
      .filter((r) => (!q.get('user') || r.subject_id === Number(q.get('user'))) && (!q.get('month') || r.month === q.get('month')))
      .filter((r) => q.get('kind') !== 'days' || ['day.set', 'month.confirm'].includes(r.action))
      .filter((r) => !q.get('before') || r.id < Number(q.get('before')))
      .reverse()
      .slice(0, limit);
    return { events: rows.map(rowJson), more: rows.length === limit };
  }],
  ['GET', /^\/api\/admin\/audit\/export$/, (m, b, url) => {
    requireAdmin();
    const month = url.searchParams.get('month');
    const rows = db.audit.filter((r) => !month || r.month === month).map(rowJson);
    return csv(`registro-presenze${month ? `-${month}` : ''}.csv`, auditSheet(rows));
  }],
  ['GET', /^\/api\/admin\/export\/(\d{4}-\d{2})$/, (m) => {
    requireAdmin();
    return csv(`presenze-${m[1]}.csv`, monthSheet({ company: db.company, month: m[1], rows: overview(m[1]) }));
  }],
  ['GET', /^\/api\/admin\/settings$/, () => {
    const u = requireAdmin();
    return { companyName: db.company, reminderHour: db.reminderHour, email: db.email, emailFromEnv: false, emailEnabled: true, me: userJson(u) };
  }],
  ['PUT', /^\/api\/admin\/settings$/, (m, b) => {
    const u = requireAdmin();
    const keys = [];
    if (b.companyName !== undefined) (db.company = b.companyName || 'Horti 14'), keys.push('companyName');
    if (b.reminderHour !== undefined) (db.reminderHour = Number(b.reminderHour)), keys.push('reminderHour');
    if (b.email) (db.email = { ...db.email, ...b.email, hasPass: db.email.hasPass || !!b.email.pass, pass: undefined }), keys.push('email');
    if (b.me && b.me.firstName && (b.me.firstName !== u.first_name || b.me.lastName !== u.last_name)) {
      const before = { firstName: u.first_name, lastName: u.last_name };
      u.first_name = b.me.firstName;
      u.last_name = b.me.lastName || '';
      log(liveCtx(), { action: 'user.update', subject: u, before, after: { firstName: u.first_name, lastName: u.last_name } });
    }
    if (keys.length) log(liveCtx(), { action: 'settings.update', after: { keys } });
    save();
    return { ok: true };
  }],
  ['POST', /^\/api\/admin\/test-email$/, () => ({ ok: true, to: requireAdmin().email })],
];

function csv(name, body) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` } });
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  const path = url.pathname.replace(/^.*?(\/api\/)/, '/api/');
  if (!path.startsWith('/api/')) return realFetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  await new Promise((r) => setTimeout(r, 60));
  for (const [verb, re, fn] of routes) {
    const m = verb === method && re.exec(path);
    if (!m) continue;
    try {
      const out = fn(m, init.body ? JSON.parse(init.body) : {}, url);
      return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      return new Response(JSON.stringify({ error: err.message }), { status: err.status || 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return new Response(JSON.stringify({ error: 'Non trovato' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
};

/* ------------------------------------------------------------------ */
/* Demo bar, simulated notifications                                   */
/* ------------------------------------------------------------------ */

function notify(title, body, url) {
  document.querySelector('.demo-push')?.remove();
  const el = document.createElement('div');
  el.className = 'demo-push';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="dp-caption">Notifica sul telefono (simulata)</div>
    <div class="dp-card"><img src="icons/icon-192.png" alt=""><div>
      <div class="dp-top"><b>Presenze</b><span>ora</span></div>
      <div class="dp-title"></div><div class="dp-body"></div></div></div>`;
  el.querySelector('.dp-title').textContent = title;
  el.querySelector('.dp-body').textContent = body;
  el.onclick = () => {
    el.classList.remove('show');
    if (url) location.hash = url;
  };
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => el.classList.remove('show'), 7000);
  setTimeout(() => el.remove(), 7600);
}

function simulateReminder() {
  const u = me();
  const t = today();
  const month = monthOf(t);
  const dl = deadline(month);
  if (u?.role === 'admin') {
    const missing = expected(month).filter((x) => monthState(x, month).state !== 'ok').map(fullName);
    notify(
      missing.length ? `Presenze di ${monthName(month)}: mancano ${missing.length} dipendent${missing.length === 1 ? 'e' : 'i'}` : `Presenze di ${monthName(month)}: tutte consegnate ✅`,
      missing.length ? `Mancano: ${missing.join(', ')}` : 'Tutto in ordine.',
      `#mese/${month}`,
    );
    return;
  }
  if (!u) return notify('Presenze', 'Accedi per vedere i promemoria.', '');
  const state = monthState(u, month).state;
  const title = state === 'ok' ? `Presenze di ${monthName(month)} confermate ✅` : t < dl ? `Presenze di ${monthName(month)}: scadenza giovedì` : t === dl ? `Oggi scadono le presenze di ${monthName(month)}` : `Presenze di ${monthName(month)} in ritardo`;
  const body = state === 'ok' ? 'Nessun promemoria: il mese è già confermato.' : `Inseriscile e conferma il mese entro ${dayLabel(dl)}.`;
  if (state !== 'ok') {
    log({}, { action: 'reminder.sent', subject: u, month, after: { kind: t < dl ? 'pre' : t === dl ? 'due' : `late-${t}`, label: t < dl ? 'preventivo' : t === dl ? 'di scadenza' : 'di ritardo', push: 1, email: true } });
    save();
  }
  notify(title, body, `#mese/${month}`);
}

function setRole(role) {
  db.session = role === 'admin' ? 1 : 2;
  save();
  location.hash = '';
  location.reload();
}

load();

window.__DEMO = {
  pushStatus: async () => (db.push[db.session] ? 'on' : 'off'),
  download: async (path, name) => toast(`Nell'anteprima i file non si scaricano: nell'app vera ricevi «${name}», che si apre con Excel.`),
  enablePush: async () => {
    db.push[db.session] = true;
    save();
    notify('🔔 Notifiche attive', 'Riceverai qui i promemoria per le presenze.', '');
  },
};

const bar = document.getElementById('demo-bar');
if (bar) {
  const role = me()?.role;
  bar.querySelectorAll('[data-demo-role]').forEach((b) => {
    b.classList.toggle('on', b.dataset.demoRole === role);
    b.setAttribute('aria-pressed', String(b.dataset.demoRole === role));
    b.onclick = () => setRole(b.dataset.demoRole);
  });
  bar.querySelector('[data-demo-remind]').onclick = simulateReminder;
  bar.querySelector('[data-demo-reset]').onclick = () => {
    const session = db.session;
    seed();
    db.month = monthOf(today());
    db.session = session;
    save();
    location.hash = '';
    location.reload();
  };
}
