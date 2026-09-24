import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  db,
  q,
  UPLOAD_DIR,
  ICON_DIR,
  getSettings,
  setSettings,
  publicSettings,
  isRevealed,
  nameKey,
  normEmail,
  cleanText,
  randomToken,
  publicUrl,
  transaction,
} from './db.js';
import * as hub from './hub.js';
import * as push from './push.js';
import * as mail from './mail.js';
import * as worker from './worker.js';
import { adminRouter } from './admin.js';
import { ACCENTS } from './theme.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ASSET_VERSION = Date.now().toString(36);

/* ------------------------------------------------------------------ */
/* Auth helpers                                                        */
/* ------------------------------------------------------------------ */

export function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  // No password configured: derive a stable one from the secret and print it in the logs.
  return getSettings().secret.slice(0, 10);
}

export function adminToken() {
  return crypto.createHmac('sha256', getSettings().secret).update(`admin:${adminPassword()}`).digest('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

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

const YEAR = 365 * 24 * 3600 * 1000;
const cookieOpts = (req, maxAge = YEAR) => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge, path: '/' });

export function setGuestCookie(req, res, token) {
  res.cookie('gt', token, cookieOpts(req));
}
export function setAdminCookie(req, res) {
  res.cookie('ga', adminToken(), cookieOpts(req, 60 * 24 * 3600 * 1000));
}

function identify(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  req.guest = cookies.gt ? q.guestByToken.get(cookies.gt) || null : null;
  req.isAdmin = !!cookies.ga && safeEqual(cookies.ga, adminToken());
  if (req.guest && (!req.guest.last_seen || Date.now() - req.guest.last_seen > 60000)) {
    q.touchGuest.run(Date.now(), req.guest.id);
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.guest && !req.isAdmin) return res.status(401).json({ error: 'Registrati per continuare' });
  next();
}

const boardOpen = (req) => req.isAdmin || getSettings().mode === 'live';

/** Tiny in-memory rate limiter (generous: at the venue many guests share one IP). */
export function limiter(max, windowMs, keyFn = (req) => req.ip) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = keyFn(req);
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).json({ error: 'Troppi tentativi, riprova tra qualche minuto.' });
    next();
  };
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 4, fields: 10 },
});

export function imageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function saveImage(file, prefix) {
  const ext = imageExt(file?.buffer);
  if (!ext) throw Object.assign(new Error('Formato immagine non supportato'), { status: 400 });
  const name = `${prefix}-${Date.now().toString(36)}-${randomToken(9)}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  return name;
}

export function removeUpload(name) {
  if (!name || name.includes('/') || name.includes('..')) return;
  fs.rm(path.join(UPLOAD_DIR, name), { force: true }, () => {});
}

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */

export function meJson(g) {
  return {
    id: g.id,
    name: g.name,
    email: g.email,
    loginKey: g.token,
    hasTable: !!g.table_id,
    pushDevices: q.pushCount.get(g.id).n,
  };
}

export function msgJson(m) {
  return {
    id: m.id,
    guestId: m.guest_id,
    author: m.author,
    isAdmin: !!m.is_admin,
    kind: m.kind,
    text: m.text,
    photo: m.photo ? `/uploads/${m.photo}` : null,
    thumb: m.thumb ? `/uploads/${m.thumb}` : null,
    w: m.w,
    h: m.h,
    likes: m.likes,
    liked: !!m.liked,
    createdAt: m.created_at,
  };
}

const likerKey = (req) => (req.guest ? `g${req.guest.id}` : 'admin');

function statePayload(req) {
  const s = getSettings();
  return {
    settings: publicSettings(),
    revealed: isRevealed(s),
    me: req.guest ? meJson(req.guest) : null,
    isAdmin: req.isAdmin,
    vapidPublicKey: push.vapidPublicKey(),
    emailEnabled: mail.emailEnabled(),
    serverTime: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Login codes                                                         */
/* ------------------------------------------------------------------ */

const hashCode = (code) => crypto.createHmac('sha256', getSettings().secret).update(String(code)).digest('hex');
const registeredByEmail = db.prepare(
  'SELECT * FROM guests WHERE email = ? AND registered_at IS NOT NULL ORDER BY id',
);

async function sendLoginCode(email) {
  const guests = registeredByEmail.all(email);
  if (!guests.length) return false;
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const upd = db.prepare('UPDATE guests SET login_code = ?, login_code_exp = ?, login_attempts = 0 WHERE id = ?');
  for (const g of guests) upd.run(hashCode(code), Date.now() + 15 * 60000, g.id);
  try {
    await mail.sendMail({ to: email, ...mail.loginCodeEmail(code, guests) });
  } catch (err) {
    console.warn('[login] email', email, err.message);
    throw Object.assign(new Error('Non siamo riusciti a inviarti il codice via email: riprova tra poco'), { status: 502, expose: true });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export function createApp() {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  app.use(express.json({ limit: '2mb' }));
  app.use(identify);

  // Remember the public address so emails and QR codes link to the right place.
  app.use((req, res, next) => {
    if (req.isAdmin && !process.env.PUBLIC_URL && !process.env.RENDER_EXTERNAL_URL) {
      const url = `${req.protocol}://${req.get('host')}`;
      if (getSettings().publicUrl !== url) setSettings({ publicUrl: url });
    }
    next();
  });

  /* ---------- HTML shell, manifest, icons ---------- */

  const sendIndex = (req, res) => {
    const s = getSettings();
    const html = fs
      .readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
      .replaceAll('%%TITLE%%', escapeHtml(s.coupleNames))
      .replaceAll('%%ACCENT%%', (ACCENTS[s.accent] || ACCENTS.salvia).color)
      .replaceAll('%%ICONV%%', String(s.iconVersion))
      .replaceAll('%%V%%', ASSET_VERSION);
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(html);
  };
  app.get(['/', '/index.html'], sendIndex);

  app.get('/manifest.webmanifest', (req, res) => {
    const s = getSettings();
    // A personal start_url logs the guest in automatically when the app is opened
    // from the home screen (iOS keeps home-screen apps' cookies separate from Safari).
    const key = String(req.query.k || '');
    const guest = key ? q.guestByToken.get(key) : null;
    const v = s.iconVersion;
    res.setHeader('Cache-Control', 'no-cache');
    res.type('application/manifest+json').send(
      JSON.stringify({
        id: '/',
        name: s.coupleNames,
        short_name: shortName(s.coupleNames),
        description: `L'app del matrimonio di ${s.coupleNames}`,
        lang: 'it',
        start_url: guest ? `/login?key=${encodeURIComponent(guest.token)}` : '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF8F3',
        theme_color: '#FBF8F3',
        icons: [
          { src: `/icon/icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `/icon/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `/icon/maskable-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }),
    );
  });

  app.get('/icon/:file', (req, res) => {
    const file = path.basename(req.params.file);
    const custom = path.join(ICON_DIR, file);
    const fallback = path.join(PUBLIC_DIR, 'icons', file);
    const target = getSettings().customIcon && fs.existsSync(custom) ? custom : fallback;
    if (!fs.existsSync(target)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(target);
  });

  app.get('/login', (req, res) => {
    const g = req.query.key ? q.guestByToken.get(String(req.query.key)) : null;
    if (g) {
      // Imported guests become registered on their first visit, unless someone already registered
      // with the same email (a shared family address): they still get in, just not as a new registration.
      const emailTaken =
        g.email && db.prepare('SELECT 1 FROM guests WHERE email = ? AND registered_at IS NOT NULL AND id != ?').get(g.email, g.id);
      if (!g.registered_at && !emailTaken) {
        db.prepare('UPDATE guests SET registered_at = ? WHERE id = ?').run(Date.now(), g.id);
      }
      setGuestCookie(req, res, g.token);
    }
    const go = /^[a-z]+$/.test(String(req.query.go || '')) ? `#${req.query.go}` : '';
    res.redirect(`/${go}`);
  });

  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d', index: false, fallthrough: false }),
  );
  app.use(
    express.static(PUBLIC_DIR, {
      index: false,
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
    }),
  );

  /* ---------- State & auth ---------- */

  app.get('/api/state', (req, res) => res.json(statePayload(req)));

  // Generous: on the wedding day many guests share the venue Wi-Fi (one IP).
  const authLimit = limiter(300, 10 * 60000);

  app.post('/api/register', authLimit, async (req, res) => {
    const name = cleanText(req.body?.name, 80).replace(/\s+/g, ' ');
    const email = normEmail(req.body?.email);
    if (name.length < 2 || !/\s/.test(name)) return res.status(400).json({ error: 'Scrivi nome e cognome' });
    if (!email) return res.status(400).json({ error: 'Controlla l’indirizzo email' });
    const key = nameKey(name);

    // One registration per email: the same person logs in again, anyone else needs another address.
    const existing = db
      .prepare('SELECT * FROM guests WHERE email = ? AND registered_at IS NOT NULL ORDER BY id LIMIT 1')
      .get(email);
    if (existing && existing.name_key !== key) {
      return res.status(409).json({
        error: 'Questa email è già stata usata per registrarsi. Usa un indirizzo diverso oppure, se sei tu, accedi.',
        emailTaken: true,
      });
    }
    if (existing) {
      if (mail.emailEnabled()) {
        await sendLoginCode(email);
        return res.json({ needCode: true, email });
      }
      setGuestCookie(req, res, existing.token);
      return res.json({ ok: true });
    }

    const token = randomToken();
    const now = Date.now();
    const guest = transaction(() => {
      // Claim a matching entry of the guest list (imported by the couple) if there is one.
      const byEmailName = db
        .prepare('SELECT * FROM guests WHERE registered_at IS NULL AND email = ? AND name_key = ? LIMIT 1')
        .get(email, key);
      const byEmail = db.prepare('SELECT * FROM guests WHERE registered_at IS NULL AND email = ?').all(email);
      const byName = db
        .prepare('SELECT * FROM guests WHERE registered_at IS NULL AND email IS NULL AND name_key = ? ORDER BY id LIMIT 1')
        .get(key);
      const match = byEmailName || (byEmail.length === 1 ? byEmail[0] : null) || byName;
      if (match) {
        // Keep a token already emailed with the seating (its link must keep working).
        db.prepare('UPDATE guests SET email = ?, token = COALESCE(token, ?), registered_at = ?, last_seen = ? WHERE id = ?').run(
          email,
          token,
          now,
          now,
          match.id,
        );
        return q.guestById.get(match.id);
      }
      const r = db
        .prepare(
          'INSERT INTO guests(name, name_key, email, token, registered_at, last_seen, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)',
        )
        .run(name, key, email, token, now, now, now);
      return q.guestById.get(Number(r.lastInsertRowid));
    });
    setGuestCookie(req, res, guest.token);
    hub.broadcast('guests', {}, (c) => c.isAdmin);
    worker.kick();
    res.json({ ok: true, me: meJson(guest) });
  });

  app.post('/api/login/request', authLimit, async (req, res) => {
    const email = normEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Controlla l’indirizzo email' });
    const guests = registeredByEmail.all(email);
    if (!guests.length) {
      return res.status(404).json({ error: 'Nessuna registrazione con questa email: registrati qui sopra!' });
    }
    if (!mail.emailEnabled()) {
      if (guests.length === 1) {
        setGuestCookie(req, res, guests[0].token);
        return res.json({ ok: true });
      }
      return res.json({ choose: guests.map((g) => ({ id: g.id, name: g.name })) });
    }
    await sendLoginCode(email);
    res.json({ needCode: true, email });
  });

  app.post('/api/login/verify', authLimit, (req, res) => {
    const email = normEmail(req.body?.email);
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const guestId = Number(req.body?.guestId) || null;
    const guests = email ? registeredByEmail.all(email) : [];
    const valid = guests.filter(
      (g) => g.login_code && g.login_code_exp > Date.now() && g.login_attempts < 6 && g.login_code === hashCode(code),
    );
    if (!valid.length) {
      db.prepare('UPDATE guests SET login_attempts = login_attempts + 1 WHERE email = ?').run(email || '');
      return res.status(400).json({ error: 'Codice non valido o scaduto' });
    }
    let chosen = valid.length === 1 ? valid[0] : valid.find((g) => g.id === guestId);
    if (!chosen) return res.json({ choose: valid.map((g) => ({ id: g.id, name: g.name })) });
    db.prepare('UPDATE guests SET login_code = NULL, login_code_exp = NULL WHERE email = ?').run(email);
    setGuestCookie(req, res, chosen.token);
    res.json({ ok: true });
  });

  // Only when email is not configured (otherwise a code is required).
  app.post('/api/login/pick', authLimit, (req, res) => {
    if (mail.emailEnabled()) return res.status(400).json({ error: 'Usa il codice ricevuto via email' });
    const email = normEmail(req.body?.email);
    const g = registeredByEmail.all(email || '').find((x) => x.id === Number(req.body?.guestId));
    if (!g) return res.status(404).json({ error: 'Utente non trovato' });
    setGuestCookie(req, res, g.token);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    res.clearCookie('gt', { path: '/' });
    res.clearCookie('ga', { path: '/' });
    res.json({ ok: true });
  });

  app.patch('/api/me', (req, res) => {
    if (!req.guest) return res.status(401).json({ error: 'Non registrato' });
    const name = cleanText(req.body?.name, 80).replace(/\s+/g, ' ');
    if (name.length < 2) return res.status(400).json({ error: 'Nome non valido' });
    db.prepare('UPDATE guests SET name = ?, name_key = ? WHERE id = ?').run(name, nameKey(name), req.guest.id);
    res.json({ ok: true, me: meJson(q.guestById.get(req.guest.id)) });
  });

  /* ---------- Push ---------- */

  app.post('/api/push/subscribe', (req, res) => {
    if (!req.guest) return res.status(401).json({ error: 'Registrati per attivare le notifiche' });
    push.saveSubscription(req.guest.id, req.body?.subscription);
    worker.kick();
    res.json({ ok: true, pushDevices: q.pushCount.get(req.guest.id).n });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    if (req.guest) push.removeSubscription(req.guest.id, req.body?.endpoint);
    res.json({ ok: true });
  });

  app.post('/api/push/test', limiter(10, 60000), async (req, res) => {
    if (!req.guest) return res.status(401).json({ error: 'Non registrato' });
    const n = await push.sendToGuest(req.guest.id, {
      title: '🔔 Notifiche attive!',
      body: 'Perfetto, riceverai qui gli aggiornamenti del matrimonio.',
      url: '/',
      tag: 'test',
    });
    res.json({ ok: true, delivered: n });
  });

  /* ---------- Seating ---------- */

  app.get('/api/seating', requireUser, (req, res) => {
    const s = getSettings();
    const revealed = isRevealed(s);
    const out = { revealed, revealAt: s.revealAt, floorplan: s.floorplan ? `/uploads/${s.floorplan}` : null };
    const guest = req.guest ? q.guestById.get(req.guest.id) : null;
    if (revealed && guest?.table_id) {
      const t = q.tableById.get(guest.table_id);
      out.table = { id: t.id, name: t.name, description: t.description, x: t.x, y: t.y };
      out.seat = guest.seat;
      out.mates = q.tableMates.all(t.id).filter((m) => m.id !== guest.id).map((m) => m.name);
    }
    if (revealed || req.isAdmin) {
      out.tables = q.allTables.all().map((t) => ({ id: t.id, name: t.name, x: t.x, y: t.y }));
    }
    res.json(out);
  });

  /* ---------- Board: messages & photos ---------- */

  const msgSelect = `SELECT m.*, (l.liker IS NOT NULL) AS liked FROM messages m
    LEFT JOIN likes l ON l.message_id = m.id AND l.liker = ?`;

  app.get('/api/messages', requireUser, (req, res) => {
    if (!boardOpen(req)) return res.status(403).json({ error: 'La bacheca non è ancora aperta' });
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const after = Number(req.query.after) || 0;
    const photosOnly = req.query.kind === 'photo';
    const where = `m.deleted = 0 AND m.id < ? AND m.id > ? ${photosOnly ? "AND m.kind = 'photo'" : ''}`;
    const rows = after
      ? db.prepare(`${msgSelect} WHERE ${where} ORDER BY m.id ASC LIMIT ?`).all(likerKey(req), before, after, limit)
      : db.prepare(`${msgSelect} WHERE ${where} ORDER BY m.id DESC LIMIT ?`).all(likerKey(req), before, after, limit);
    const list = rows.map(msgJson);
    if (!after) list.reverse();
    res.json({ messages: list, hasMore: !after && rows.length === limit });
  });

  const author = (req) =>
    req.isAdmin
      ? { guestId: req.guest?.id ?? null, name: getSettings().coupleNames, isAdmin: 1 }
      : { guestId: req.guest.id, name: req.guest.name, isAdmin: 0 };

  const postLimit = limiter(20, 30000, (req) => (req.guest ? `g${req.guest.id}` : req.ip));

  function insertMessage(a, fields) {
    const r = db
      .prepare(
        'INSERT INTO messages(guest_id, author, is_admin, kind, text, photo, thumb, w, h, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        a.guestId,
        a.name,
        a.isAdmin,
        fields.kind,
        fields.text || '',
        fields.photo || null,
        fields.thumb || null,
        fields.w || null,
        fields.h || null,
        Date.now(),
      );
    const msg = msgJson(db.prepare('SELECT *, 0 AS liked FROM messages WHERE id = ?').get(Number(r.lastInsertRowid)));
    hub.broadcastBoard('msg', msg);
    return msg;
  }
  app.locals.insertMessage = insertMessage;

  app.post('/api/messages', requireUser, postLimit, (req, res) => {
    if (!boardOpen(req)) return res.status(403).json({ error: 'La bacheca non è ancora aperta' });
    if (!req.isAdmin && !getSettings().allowChat) return res.status(403).json({ error: 'La chat è in pausa' });
    const text = cleanText(req.body?.text, 1000);
    if (!text) return res.status(400).json({ error: 'Scrivi qualcosa' });
    res.json({ message: insertMessage(author(req), { kind: 'text', text }) });
  });

  app.post(
    '/api/photos',
    requireUser,
    postLimit,
    upload.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'thumb', maxCount: 1 },
    ]),
    (req, res) => {
      if (!boardOpen(req)) return res.status(403).json({ error: 'La bacheca non è ancora aperta' });
      if (!req.isAdmin && !getSettings().allowPhotos) return res.status(403).json({ error: 'Il caricamento foto è in pausa' });
      const photoFile = req.files?.photo?.[0];
      if (!photoFile) return res.status(400).json({ error: 'Nessuna foto' });
      const photo = saveImage(photoFile, 'p');
      const thumb = req.files?.thumb?.[0] ? saveImage(req.files.thumb[0], 't') : photo;
      const clamp = (v) => Math.max(1, Math.min(20000, Math.round(Number(v) || 0))) || null;
      const msg = insertMessage(author(req), {
        kind: 'photo',
        text: cleanText(req.body?.caption, 500),
        photo,
        thumb,
        w: clamp(req.body?.w),
        h: clamp(req.body?.h),
      });
      res.json({ message: msg });
    },
  );

  app.post('/api/messages/:id/like', requireUser, (req, res) => {
    if (!boardOpen(req)) return res.status(403).json({ error: 'La bacheca non è ancora aperta' });
    const id = Number(req.params.id);
    const m = db.prepare('SELECT id FROM messages WHERE id = ? AND deleted = 0').get(id);
    if (!m) return res.status(404).json({ error: 'Messaggio non trovato' });
    const key = likerKey(req);
    const liked = transaction(() => {
      const had = db.prepare('DELETE FROM likes WHERE message_id = ? AND liker = ?').run(id, key).changes > 0;
      if (!had) db.prepare('INSERT INTO likes(message_id, liker) VALUES(?, ?)').run(id, key);
      db.prepare('UPDATE messages SET likes = (SELECT COUNT(*) FROM likes WHERE message_id = ?) WHERE id = ?').run(id, id);
      return !had;
    });
    const likes = db.prepare('SELECT likes FROM messages WHERE id = ?').get(id).likes;
    hub.broadcastBoard('like', { id, likes });
    res.json({ id, likes, liked });
  });

  app.delete('/api/messages/:id', requireUser, (req, res) => {
    const m = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted = 0').get(Number(req.params.id));
    if (!m) return res.status(404).json({ error: 'Messaggio non trovato' });
    const own = req.guest && m.guest_id === req.guest.id;
    if (!req.isAdmin && !own) return res.status(403).json({ error: 'Non puoi eliminare questo messaggio' });
    db.prepare('UPDATE messages SET deleted = 1 WHERE id = ?').run(m.id);
    if (m.photo) {
      removeUpload(m.photo);
      if (m.thumb !== m.photo) removeUpload(m.thumb);
    }
    hub.broadcastBoard('del', { id: m.id });
    res.json({ ok: true });
  });

  /* ---------- Live stream ---------- */

  app.get('/api/stream', requireUser, (req, res) => {
    hub.addClient(req, res, { guestId: req.guest?.id || null, isAdmin: req.isAdmin });
  });

  /* ---------- Admin ---------- */

  app.use('/api/admin', adminRouter(app));

  /* ---------- Errors ---------- */

  app.use('/api', (req, res) => res.status(404).json({ error: 'Non trovato' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Foto troppo grande' : 'Caricamento non valido';
      return res.status(413).json({ error: msg });
    }
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    if (res.headersSent) return;
    res.status(status).json({ error: status < 500 || err.expose ? err.message : 'Errore del server, riprova' });
  });

  return app;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function shortName(names) {
  const s = String(names || 'Matrimonio');
  if (s.length <= 12) return s;
  const initials = s
    .split(/\s*(?:&|e|and|\+)\s*/i)
    .map((p) => p.trim()[0])
    .filter(Boolean);
  return initials.length >= 2 ? initials.join(' & ') : s.slice(0, 12);
}

export { publicUrl };
