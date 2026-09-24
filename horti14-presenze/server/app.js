import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, q, getSettings, setSettings, normEmail, cleanText, fullName, transaction } from './db.js';
import * as auth from './auth.js';
import * as audit from './audit.js';
import * as months from './months.js';
import * as push from './push.js';
import * as mail from './mail.js';
import * as worker from './worker.js';
import { isMonth, isDay, monthOf, cleanEntry, employeeCanEdit, romeNow, addMonths, deadline } from '../public/js/cal.js';
import { monthSheet, auditSheet } from '../public/js/sheets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ASSET_VERSION = Date.now().toString(36);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fail = (status, message) => Object.assign(new Error(message), { status });
const ctxOf = (req) => ({ user: req.user, ip: req.ip, ua: req.get('user-agent') || '' });

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* ignore malformed cookie */
      }
    }
  }
  return out;
}

/** Tiny in-memory rate limiter. */
function limiter(max, windowMs, keyFn = (req) => req.ip) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = keyFn(req);
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).json({ error: 'Troppi tentativi: riprova tra qualche minuto.' });
    next();
  };
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Accedi per continuare' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Accedi per continuare' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Riservato al titolare' });
  next();
}

export function userJson(u) {
  return {
    id: u.id,
    role: u.role,
    firstName: u.first_name,
    lastName: u.last_name,
    name: fullName(u),
    email: u.email,
    phone: u.phone,
    job: u.job,
    active: !!u.active,
    activated: !!u.pass_hash,
    createdAt: u.created_at,
    lastSeen: u.last_seen,
    pushDevices: q.pushCount.get(u.id).n,
  };
}

function monthParam(req) {
  const month = req.params.month;
  if (!isMonth(month)) throw fail(400, 'Mese non valido');
  return month;
}

function employeeParam(req) {
  const u = q.userById.get(Number(req.params.id));
  if (!u || u.role !== 'employee') throw fail(404, 'Dipendente non trovato');
  return u;
}

/** Validated list of days (all inside `month`) and the entry to write (null = clear). */
function daysBody(body, month) {
  const days = [...new Set(Array.isArray(body?.days) ? body.days : [])];
  if (!days.length || days.length > 31) throw fail(400, 'Scegli almeno un giorno');
  if (!days.every((d) => isDay(d) && monthOf(d) === month)) throw fail(400, 'Giorni non validi');
  let entry = null;
  if (body.entry) {
    entry = cleanEntry(body.entry);
    if (!entry) throw fail(400, 'Dati del giorno non validi');
  }
  return { days: days.sort(), entry };
}

function monthPayload(user, month, { admin = false } = {}) {
  const today = romeNow().day;
  const s = months.monthState(user, month, today);
  return { ...s, today, editable: admin ? month <= addMonths(monthOf(today), 12) : employeeCanEdit(month, today) };
}

function historyOf(userId, month) {
  return db
    .prepare('SELECT * FROM audit WHERE subject_id = ? AND month = ? ORDER BY id DESC LIMIT 500')
    .all(userId, month)
    .map(audit.rowJson);
}

function sendCsv(res, name, body) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.set('Cache-Control', 'no-store');
  res.send(body);
}

/** Notify the owner when a month is re-confirmed with changes. */
async function notifyChanges(user, month, changes) {
  if (!changes.length) return;
  const msg = mail.changedEmail(user, month, changes);
  for (const admin of q.admins.all()) {
    await push
      .sendToUser(admin.id, { title: msg.subject, body: `${changes.length} modific${changes.length === 1 ? 'a' : 'he'} dopo la consegna`, url: `/#mese/${month}`, tag: `modifiche-${user.id}-${month}` })
      .catch(() => 0);
    await mail.trySend({ to: admin.email, ...msg });
  }
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  const api = express.Router();
  app.use('/api', api);

  api.use(express.json({ limit: '100kb' }));
  api.use((req, res, next) => {
    // Writes only as JSON: plain HTML forms from other sites cannot reach the API (CSRF).
    if (!['GET', 'HEAD'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Formato non supportato' });
    }
    res.set('Cache-Control', 'no-store');
    req.sid = parseCookies(req.headers.cookie).sid || null;
    req.user = auth.sessionUser(req.sid);
    // Without PUBLIC_URL, links in emails use the address the owner opens the app with.
    if (req.user?.role === 'admin' && !process.env.PUBLIC_URL && !process.env.RENDER_EXTERNAL_URL) {
      const origin = `${req.protocol}://${req.get('host')}`;
      if (getSettings().publicUrl !== origin) setSettings({ publicUrl: origin });
    }
    next();
  });

  /* ---------------------------- account ---------------------------- */

  api.get('/me', (req, res) => {
    const s = getSettings();
    res.json({
      user: req.user ? userJson(req.user) : null,
      company: s.companyName,
      today: romeNow().day,
      serverTime: Date.now(),
      vapidPublicKey: push.vapidPublicKey(),
      emailEnabled: mail.emailEnabled(),
    });
  });

  const loginLimit = limiter(10, 15 * 60e3, (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`);
  api.post('/login', limiter(40, 15 * 60e3), loginLimit, (req, res) => {
    const email = normEmail(req.body?.email);
    const user = email ? q.userByEmail.get(email) : null;
    const ok = auth.checkPassword(req.body?.password || '', user?.pass_hash || auth.DUMMY_HASH) && !!user?.pass_hash;
    if (!ok || !user.active) {
      if (user) {
        audit.log(ctxOf(req), {
          action: 'auth.login_failed',
          subject: user,
          after: { email, reason: !user.pass_hash ? 'account non attivato' : !user.active ? 'account disattivato' : 'password errata' },
        });
      }
      return res.status(401).json({
        error: user && !user.active && ok ? 'Il tuo account è stato disattivato: parlane con il titolare' : 'Email o password non corrette',
      });
    }
    const token = auth.createSession(user, ctxOf(req));
    audit.log({ ...ctxOf(req), user }, { action: 'auth.login', subject: user });
    res.cookie('sid', token, auth.cookieOptions(req));
    res.json({ user: userJson(user) });
  });

  api.post('/logout', (req, res) => {
    if (req.user) audit.log(ctxOf(req), { action: 'auth.logout', subject: req.user });
    if (req.sid) auth.endSession(req.sid);
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  });

  api.post('/access/info', limiter(30, 15 * 60e3), (req, res) => {
    const user = auth.userByAccessToken(String(req.body?.token || ''));
    if (!user) return res.status(404).json({ error: 'Questo link non è più valido: chiedine uno nuovo al titolare o usa «Password dimenticata».' });
    res.json({ firstName: user.first_name, email: user.email, reset: !!user.pass_hash });
  });

  api.post('/access', limiter(30, 15 * 60e3), (req, res) => {
    const user = auth.userByAccessToken(String(req.body?.token || ''));
    if (!user) throw fail(404, 'Questo link non è più valido: chiedine uno nuovo al titolare o usa «Password dimenticata».');
    const problem = auth.passwordProblem(req.body?.password);
    if (problem) throw fail(400, problem);
    transaction(() => {
      auth.setPassword(user, req.body.password);
      auth.endAllSessions(user.id);
      audit.log({ ...ctxOf(req), user }, { action: 'auth.password_set', subject: user });
    });
    const token = auth.createSession(user, ctxOf(req));
    res.cookie('sid', token, auth.cookieOptions(req));
    res.json({ user: userJson(q.userById.get(user.id)) });
  });

  api.post('/forgot', limiter(5, 15 * 60e3), async (req, res) => {
    const email = normEmail(req.body?.email);
    const user = email ? q.userByEmail.get(email) : null;
    // Same answer whether or not the account exists.
    res.json({ ok: true, emailEnabled: mail.emailEnabled() });
    if (!user || !user.active || !user.pass_hash) return;
    const link = auth.newAccessLink(user, { hours: 1 });
    audit.log(ctxOf(req), { action: 'auth.reset_request', subject: user });
    await mail.trySend({ to: user.email, ...mail.accessEmail(user, link, { reset: true }) });
  });

  api.post('/password', requireUser, (req, res) => {
    if (!auth.checkPassword(req.body?.current || '', req.user.pass_hash)) throw fail(400, 'La password attuale non è corretta');
    const problem = auth.passwordProblem(req.body?.password);
    if (problem) throw fail(400, problem);
    transaction(() => {
      auth.setPassword(req.user, req.body.password);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user.id, auth.sessionHash(req.sid));
      audit.log(ctxOf(req), { action: 'auth.password_change', subject: req.user });
    });
    res.json({ ok: true });
  });

  /* ------------------------------ push ----------------------------- */

  api.post('/push/subscribe', requireUser, (req, res) => {
    push.saveSubscription(req.user.id, req.body?.subscription);
    res.json({ ok: true, pushDevices: q.pushCount.get(req.user.id).n });
  });

  api.post('/push/unsubscribe', requireUser, (req, res) => {
    push.removeSubscription(req.user.id, req.body?.endpoint);
    res.json({ ok: true });
  });

  api.post('/push/test', requireUser, async (req, res) => {
    const n = await push.sendToUser(req.user.id, {
      title: '🔔 Notifiche attive',
      body: 'Riceverai qui i promemoria per le presenze.',
      url: '/',
      tag: 'test',
    });
    res.json({ delivered: n });
  });

  /* ------------------------ my attendance -------------------------- */

  api.get('/month/:month', requireUser, (req, res) => {
    res.json(monthPayload(req.user, monthParam(req)));
  });

  api.put('/month/:month/days', requireUser, (req, res) => {
    const month = monthParam(req);
    if (req.user.role !== 'employee') throw fail(403, 'Il titolare non ha un calendario personale');
    if (!employeeCanEdit(month, romeNow().day)) throw fail(403, 'Questo mese è chiuso: per correzioni chiedi al titolare');
    const { days, entry } = daysBody(req.body, month);
    months.setDays(ctxOf(req), req.user, days, entry);
    res.json(monthPayload(req.user, month));
  });

  api.post('/month/:month/confirm', requireUser, async (req, res) => {
    const month = monthParam(req);
    if (req.user.role !== 'employee') throw fail(403, 'Il titolare non ha un calendario personale');
    if (!employeeCanEdit(month, romeNow().day)) throw fail(403, 'Questo mese è chiuso: per correzioni chiedi al titolare');
    const out = months.confirmMonth(ctxOf(req), req.user, month);
    res.json({ ...monthPayload(req.user, month), receipt: { id: out.receiptId, at: out.at, already: out.already } });
    if (out.already) return;
    await mail.trySend({ to: req.user.email, ...mail.receiptEmail(req.user, { month, at: out.at, digest: out.digest, totals: out.totals, entries: out.entries, auditId: out.receiptId, auditHash: out.auditHash }) });
    if (out.recheck) await notifyChanges(req.user, month, out.changes);
    await worker.checkAllDone(month);
  });

  api.get('/month/:month/history', requireUser, (req, res) => {
    res.json({ events: historyOf(req.user.id, monthParam(req)) });
  });

  /* ----------------------------- owner ----------------------------- */

  const admin = express.Router();
  api.use('/admin', requireAdmin, admin);

  admin.get('/overview/:month', (req, res) => {
    const month = monthParam(req);
    const today = romeNow().day;
    res.json({ month, today, deadline: deadline(month), employees: months.overview(month, today) });
  });

  admin.get('/user/:id/month/:month', (req, res) => {
    const u = employeeParam(req);
    res.json({ ...monthPayload(u, monthParam(req), { admin: true }), employee: userJson(u) });
  });

  admin.put('/user/:id/month/:month/days', (req, res) => {
    const u = employeeParam(req);
    const month = monthParam(req);
    const { days, entry } = daysBody(req.body, month);
    months.setDays(ctxOf(req), u, days, entry);
    res.json({ ...monthPayload(u, month, { admin: true }), employee: userJson(u) });
  });

  admin.get('/user/:id/month/:month/history', (req, res) => {
    res.json({ events: historyOf(employeeParam(req).id, monthParam(req)) });
  });

  admin.get('/employees', (req, res) => {
    res.json({ employees: q.employees.all().map(userJson), admins: q.admins.all().map(userJson) });
  });

  function employeeFields(body, { partial = false } = {}) {
    const out = {};
    const take = (key, max) => {
      if (body[key] === undefined) return;
      out[key] = cleanText(body[key], max);
    };
    take('firstName', 60);
    take('lastName', 60);
    take('phone', 30);
    take('job', 60);
    if (body.email !== undefined) {
      out.email = normEmail(body.email);
      if (!out.email) throw fail(400, 'Email non valida');
    }
    if (body.role !== undefined) {
      if (!['employee', 'admin'].includes(body.role)) throw fail(400, 'Ruolo non valido');
      out.role = body.role;
    }
    if (!partial && (!out.firstName || !out.email)) throw fail(400, 'Nome ed email sono obbligatori');
    if (partial && out.firstName === '') throw fail(400, 'Il nome è obbligatorio');
    return out;
  }

  async function sendAccess(req, user) {
    const link = auth.newAccessLink(user);
    const emailed = await mail.trySend({ to: user.email, ...mail.accessEmail(user, link) });
    audit.log(ctxOf(req), { action: 'user.invite', subject: user, after: { emailed } });
    return { link, emailed };
  }

  admin.post('/employees', async (req, res) => {
    const f = employeeFields(req.body || {});
    if (q.userByEmail.get(f.email)) throw fail(409, 'Esiste già un account con questa email');
    const user = transaction(() => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO users(role, first_name, last_name, email, phone, job, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
        .run(f.role || 'employee', f.firstName, f.lastName || '', f.email, f.phone || '', f.job || '', Date.now());
      const u = q.userById.get(Number(lastInsertRowid));
      audit.log(ctxOf(req), { action: 'user.create', subject: u, after: { role: u.role, email: u.email, job: u.job } });
      return u;
    });
    res.json({ employee: userJson(user), access: await sendAccess(req, user) });
  });

  const COLUMN = { firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone', job: 'job', role: 'role' };

  admin.patch('/employees/:id', (req, res) => {
    const user = q.userById.get(Number(req.params.id));
    if (!user) throw fail(404, 'Account non trovato');
    const f = employeeFields(req.body || {}, { partial: true });
    if (f.email && f.email !== user.email && q.userByEmail.get(f.email)) throw fail(409, 'Esiste già un account con questa email');
    if (user.id === req.user.id && (f.role === 'employee' || req.body.active === false)) throw fail(400, 'Non puoi togliere a te stesso l’accesso da titolare');
    const before = {};
    const after = {};
    for (const [k, v] of Object.entries(f)) {
      if (user[COLUMN[k]] === v) continue;
      before[k] = user[COLUMN[k]];
      after[k] = v;
    }
    transaction(() => {
      if (Object.keys(after).length) {
        db.prepare(`UPDATE users SET ${Object.keys(after).map((k) => `${COLUMN[k]} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(after), user.id);
        audit.log(ctxOf(req), { action: 'user.update', subject: q.userById.get(user.id), before, after });
      }
      if (typeof req.body.active === 'boolean' && req.body.active !== !!user.active) {
        db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, user.id);
        if (!req.body.active) auth.endAllSessions(user.id);
        audit.log(ctxOf(req), { action: req.body.active ? 'user.reactivate' : 'user.deactivate', subject: user });
      }
      if (after.email || after.role) auth.endAllSessions(user.id);
    });
    res.json({ employee: userJson(q.userById.get(user.id)) });
  });

  admin.post('/employees/:id/access', async (req, res) => {
    const user = q.userById.get(Number(req.params.id));
    if (!user || !user.active) throw fail(404, 'Account non trovato o disattivato');
    res.json(await sendAccess(req, user));
  });

  admin.post('/remind/:month', async (req, res) => {
    const month = monthParam(req);
    res.json({ reminded: await worker.remindMissing(month, ctxOf(req)) });
  });

  admin.get('/audit', (req, res) => {
    const where = [];
    const args = [];
    if (req.query.user) {
      where.push('subject_id = ?');
      args.push(Number(req.query.user));
    }
    if (req.query.month && isMonth(req.query.month)) {
      where.push('month = ?');
      args.push(req.query.month);
    }
    if (req.query.kind === 'days') where.push("action IN ('day.set', 'month.confirm')");
    if (req.query.before) {
      where.push('id < ?');
      args.push(Number(req.query.before));
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = db
      .prepare(`SELECT * FROM audit ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`)
      .all(...args, limit);
    res.json({ events: rows.map(audit.rowJson), more: rows.length === limit });
  });

  admin.get('/audit/verify', (req, res) => res.json(audit.verify()));

  admin.get('/audit/export', (req, res) => {
    const month = isMonth(req.query.month) ? req.query.month : null;
    const rows = db
      .prepare(`SELECT * FROM audit ${month ? 'WHERE month = ?' : ''} ORDER BY id`)
      .all(...(month ? [month] : []))
      .map(audit.rowJson);
    sendCsv(res, `registro-presenze${month ? `-${month}` : ''}.csv`, auditSheet(rows));
  });

  admin.get('/export/:month', (req, res) => {
    const month = monthParam(req);
    sendCsv(res, `presenze-${month}.csv`, monthSheet({ company: getSettings().companyName, month, rows: months.overview(month) }));
  });

  admin.get('/settings', (req, res) => {
    const s = getSettings();
    const e = s.email || {};
    res.json({
      companyName: s.companyName,
      reminderHour: s.reminderHour,
      email: { provider: e.provider, host: e.host, port: e.port, secure: e.secure, user: e.user, fromEmail: e.fromEmail, fromName: e.fromName, hasPass: !!e.pass },
      emailFromEnv: mail.emailFromEnv(),
      emailEnabled: mail.emailEnabled(),
      me: userJson(req.user),
    });
  });

  admin.put('/settings', (req, res) => {
    const b = req.body || {};
    const patch = {};
    if (b.companyName !== undefined) patch.companyName = cleanText(b.companyName, 60) || 'Horti 14';
    if (b.reminderHour !== undefined) {
      const h = Number(b.reminderHour);
      if (!Number.isInteger(h) || h < 0 || h > 23) throw fail(400, 'Orario non valido');
      patch.reminderHour = h;
    }
    if (b.email) {
      const cur = getSettings().email;
      const e = b.email;
      patch.email = {
        provider: ['gmail', 'brevo', 'custom'].includes(e.provider) ? e.provider : cur.provider,
        host: cleanText(e.host ?? cur.host, 120),
        port: Number(e.port ?? cur.port) || 587,
        secure: !!(e.secure ?? cur.secure),
        user: cleanText(e.user ?? cur.user, 120),
        pass: e.pass ? String(e.pass).replace(/\s+/g, '').slice(0, 200) : cur.pass,
        fromEmail: cleanText(e.fromEmail ?? cur.fromEmail, 120),
        fromName: cleanText(e.fromName ?? cur.fromName, 80),
      };
    }
    transaction(() => {
      setSettings(patch);
      const keys = Object.keys(patch);
      if (b.me) {
        const first = cleanText(b.me.firstName, 60);
        const last = cleanText(b.me.lastName, 60);
        if (first && (first !== req.user.first_name || last !== req.user.last_name)) {
          db.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?').run(first, last, req.user.id);
          audit.log(ctxOf(req), {
            action: 'user.update',
            subject: q.userById.get(req.user.id),
            before: { firstName: req.user.first_name, lastName: req.user.last_name },
            after: { firstName: first, lastName: last },
          });
        }
      }
      if (keys.length) audit.log(ctxOf(req), { action: 'settings.update', after: { keys } });
    });
    res.json({ ok: true });
  });

  admin.post('/test-email', async (req, res) => {
    if (!mail.emailEnabled()) throw fail(400, 'Prima configura le email');
    try {
      await mail.sendMail({ to: req.user.email, ...mail.testEmail() });
    } catch (err) {
      throw fail(400, `Invio non riuscito: ${err.message}`);
    }
    res.json({ ok: true, to: req.user.email });
  });

  api.use((req, res) => res.status(404).json({ error: 'Non trovato' }));

  /* ---------------------------- frontend ---------------------------- */

  const indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  app.get('/manifest.webmanifest', (req, res) => {
    const name = getSettings().companyName;
    res.type('application/manifest+json').json({
      name: `Presenze ${name}`,
      short_name: 'Presenze',
      description: `Presenze del personale di ${name}`,
      lang: 'it',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#F6F4EE',
      theme_color: '#F6F4EE',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  });

  app.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(PUBLIC_DIR, 'sw.js'));
  });

  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(indexHtml.replaceAll('%%COMPANY%%', escHtml(getSettings().companyName)).replaceAll('%%V%%', ASSET_VERSION));
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Errore del server, riprova' : err.message || 'Richiesta non valida' });
  });

  return app;
}
