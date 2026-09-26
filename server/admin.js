import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { ZipArchive } from 'archiver';
import {
  db,
  q,
  UPLOAD_DIR,
  ICON_DIR,
  DEFAULTS,
  getSettings,
  setSettings,
  publicSettings,
  isRevealed,
  nameKey,
  normEmail,
  cleanText,
  publicUrl,
  transaction,
} from './db.js';
import * as hub from './hub.js';
import * as push from './push.js';
import * as mail from './mail.js';
import * as worker from './worker.js';
import { ACCENTS } from './theme.js';
import { tableShape, tableSeats, createTables, arrangeTables } from './tables.js';
import { sanitizeQuiz, onQuizSaved, quizStats, resetQuizResults, closeQuiz } from './quiz.js';
import { adminPassword, setAdminCookie, upload, saveImage, removeUpload, imageExt } from './app.js';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const isoOrNull = (v) => {
  if (v === null || v === '' || v === undefined) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

function safeUrl(v) {
  let u = cleanText(v, 1000);
  if (!u) return '';
  if (/^www\./i.test(u) || /^[a-z0-9-]+\.[a-z]{2,}\//i.test(u)) u = `https://${u}`;
  return /^(https?:\/\/|tel:|mailto:)/i.test(u) ? u : '';
}

function validTz(tz) {
  try {
    new Intl.DateTimeFormat('it-IT', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const SETTING_RULES = {
  coupleNames: (v) => cleanText(v, 80) || DEFAULTS.coupleNames,
  weddingDate: isoOrNull,
  tz: (v) => (validTz(v) ? v : 'Europe/Rome'),
  accent: (v) => (ACCENTS[v] ? v : 'salvia'),
  nameFont: (v) => (v === 'script' ? 'script' : 'serif'),
  coverTone: (v) => (v === 'light' ? 'light' : 'dark'),
  welcomeTitle: (v) => cleanText(v, 120),
  welcomeText: (v) => cleanText(v, 5000),
  sections: (v) =>
    Array.isArray(v)
      ? v.slice(0, 30).map((s) => ({
          icon: cleanText(s?.icon, 16),
          title: cleanText(s?.title, 120),
          subtitle: cleanText(s?.subtitle, 160),
          body: cleanText(s?.body, 5000),
          linkLabel: cleanText(s?.linkLabel, 60),
          linkUrl: safeUrl(s?.linkUrl),
          image: /^[\w.-]+$/.test(String(s?.image || '')) ? String(s.image) : '',
        }))
      : getSettings().sections,
  autoLiveAt: isoOrNull,
  notifyOnLive: Boolean,
  allowPhotos: Boolean,
  allowChat: Boolean,
  revealAt: isoOrNull,
  revealMessage: (v) => cleanText(v, 1000),
  hallEntrance: (v) =>
    v && Number.isFinite(Number(v.x)) && Number.isFinite(Number(v.y))
      ? { x: Math.max(0, Math.min(100, Number(v.x))), y: Math.max(0, Math.min(100, Number(v.y))) }
      : null,
  quiz: sanitizeQuiz,
  adminEmail: (v) => normEmail(v) || '',
  email: (v) => {
    const old = getSettings().email || DEFAULTS.email;
    const provider = ['gmail', 'brevo', 'custom'].includes(v?.provider) ? v.provider : old.provider;
    return {
      provider,
      host: cleanText(v?.host ?? old.host, 200),
      port: Number(v?.port ?? old.port) || 587,
      secure: v?.secure !== undefined ? !!v.secure : old.secure,
      user: cleanText(v?.user ?? old.user, 200),
      // Gmail shows app passwords in groups of four ("abcd efgh ..."): spaces are not part of it.
      pass: v?.pass
        ? (provider === 'gmail' ? String(v.pass).replace(/\s+/g, '') : String(v.pass)).slice(0, 300)
        : v?.clearPass
          ? ''
          : old.pass,
      fromEmail: normEmail(v?.fromEmail) || '',
      fromName: cleanText(v?.fromName ?? old.fromName, 100),
    };
  },
};

function adminSettings() {
  const s = getSettings();
  const { secret, vapid, ...rest } = s; // eslint-disable-line no-unused-vars
  return { ...rest, email: { ...s.email, pass: '', hasPass: !!s.email?.pass } };
}

const count = (sql, ...args) => db.prepare(sql).get(...args).n;

function stats() {
  return {
    guests: count('SELECT COUNT(*) AS n FROM guests'),
    registered: count('SELECT COUNT(*) AS n FROM guests WHERE registered_at IS NOT NULL'),
    withPush: count('SELECT COUNT(DISTINCT guest_id) AS n FROM push_subs'),
    pushDevices: count('SELECT COUNT(*) AS n FROM push_subs'),
    tables: count('SELECT COUNT(*) AS n FROM seating_tables'),
    withTable: count('SELECT COUNT(*) AS n FROM guests WHERE table_id IS NOT NULL'),
    registeredNoTable: count('SELECT COUNT(*) AS n FROM guests WHERE registered_at IS NOT NULL AND table_id IS NULL'),
    toNotify: count(
      'SELECT COUNT(*) AS n FROM guests WHERE (registered_at IS NOT NULL OR email IS NOT NULL) AND table_id IS NOT NULL',
    ),
    notified: count('SELECT COUNT(*) AS n FROM guests WHERE seat_notified_at IS NOT NULL'),
    emailSent: count("SELECT COUNT(*) AS n FROM guests WHERE seat_email_status = 'sent'"),
    emailErrors: count(
      "SELECT COUNT(*) AS n FROM guests WHERE seat_email_status LIKE 'error%' OR seat_email_status = 'non-configurata'",
    ),
    emailPending: count(
      'SELECT COUNT(*) AS n FROM guests WHERE seat_notified_at IS NOT NULL AND table_id IS NOT NULL AND seat_email_status IS NULL',
    ),
    messages: count("SELECT COUNT(*) AS n FROM messages WHERE deleted = 0 AND kind != 'photo'"),
    photos: count("SELECT COUNT(*) AS n FROM messages WHERE deleted = 0 AND kind = 'photo'"),
    online: hub.onlineCount(),
  };
}

function guestRows() {
  return db
    .prepare(
      `SELECT g.*, t.name AS table_name, (SELECT COUNT(*) FROM push_subs p WHERE p.guest_id = g.id) AS push_devices
       FROM guests g LEFT JOIN seating_tables t ON t.id = g.table_id
       ORDER BY g.name COLLATE NOCASE`,
    )
    .all()
    .map((g) => ({
      id: g.id,
      name: g.name,
      email: g.email,
      tableId: g.table_id,
      tableName: g.table_name,
      seat: g.seat,
      registered: !!g.registered_at,
      registeredAt: g.registered_at,
      lastSeen: g.last_seen,
      pushDevices: g.push_devices,
      notifiedAt: g.seat_notified_at,
      emailStatus: g.seat_email_status,
    }));
}

function tableRows() {
  const guests = db.prepare('SELECT id, name, table_id FROM guests WHERE table_id IS NOT NULL ORDER BY name COLLATE NOCASE').all();
  return q.allTables.all().map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    x: t.x,
    y: t.y,
    sort: t.sort,
    shape: t.shape,
    seats: t.seats,
    guests: guests.filter((g) => g.table_id === t.id).map((g) => ({ id: g.id, name: g.name })),
  }));
}

const resetNotification = db.prepare(
  'UPDATE guests SET seat_notified_at = NULL, seat_email_status = NULL, seat_email_attempts = 0, seat_email_next = 0 WHERE id = ?',
);

function findOrCreateTable(name) {
  const clean = cleanText(name, 80);
  if (!clean) return null;
  const found = db.prepare('SELECT id FROM seating_tables WHERE lower(name) = lower(?)').get(clean);
  if (found) return { id: found.id, created: false };
  const sort = count('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM seating_tables');
  const r = db.prepare('INSERT INTO seating_tables(name, sort) VALUES(?, ?)').run(clean, sort);
  return { id: Number(r.lastInsertRowid), created: true };
}

const slug = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'x';

export function adminRouter(app) {
  const r = express.Router();

  // Only wrong passwords count: guests trying the button at the venue (one shared address)
  // must not lock the couple out.
  const failures = new Map();
  setInterval(() => failures.clear(), 15 * 60000).unref();
  r.post('/login', (req, res) => {
    if ((failures.get(req.ip) || 0) >= 20) {
      return res.status(429).json({ error: 'Troppi tentativi, riprova tra qualche minuto.' });
    }
    if (!safeEqual(String(req.body?.password || ''), adminPassword())) {
      failures.set(req.ip, (failures.get(req.ip) || 0) + 1);
      return res.status(401).json({ error: 'Password errata' });
    }
    setAdminCookie(req, res);
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => {
    res.clearCookie('ga', { path: '/' });
    res.json({ ok: true });
  });

  r.use((req, res, next) => (req.isAdmin ? next() : res.status(401).json({ error: 'Accesso riservato agli sposi' })));

  /* ---------- Overview & settings ---------- */

  r.get('/overview', (req, res) => {
    res.json({
      settings: adminSettings(),
      stats: stats(),
      revealed: isRevealed(),
      emailEnabled: mail.emailEnabled(),
      emailFromEnv: !!process.env.SMTP_HOST,
      emailDev: process.env.MAIL_DEV === '1',
      publicUrl: publicUrl(),
      accents: ACCENTS,
      quiz: quizStats(),
    });
  });

  r.post('/quiz/reset', (req, res) => {
    resetQuizResults();
    hub.broadcast('settings', publicSettings());
    res.json({ quiz: quizStats() });
  });

  r.post('/quiz/close', (req, res) => {
    closeQuiz(!!req.body?.closed);
    hub.broadcast('settings', publicSettings());
    res.json({ quiz: quizStats() });
  });

  r.patch('/settings', (req, res) => {
    const patch = {};
    for (const [key, rule] of Object.entries(SETTING_RULES)) {
      if (req.body && key in req.body) patch[key] = rule(req.body[key]);
    }
    if ('revealAt' in patch && (!patch.revealAt || Date.parse(patch.revealAt) > Date.now())) {
      patch.revealAnnounced = false;
    }
    if ('quiz' in patch) onQuizSaved(getSettings().quiz, patch.quiz);
    setSettings(patch);
    hub.broadcast('settings', publicSettings());
    worker.kick();
    res.json({ settings: adminSettings() });
  });

  r.post('/mode', async (req, res) => {
    const mode = req.body?.mode === 'live' ? 'live' : 'info';
    await worker.setMode(mode, !!req.body?.notify);
    res.json({ settings: adminSettings() });
  });

  /* ---------- Seating reveal ---------- */

  r.post('/reveal/now', (req, res) => {
    setSettings({ revealAt: new Date().toISOString(), revealAnnounced: false });
    hub.broadcast('settings', publicSettings());
    worker.kick();
    res.json({ settings: adminSettings() });
  });

  r.post('/reveal/reset', (req, res) => {
    if (req.body?.scope === 'all') {
      db.prepare(
        'UPDATE guests SET seat_notified_at = NULL, seat_email_status = NULL, seat_email_attempts = 0, seat_email_next = 0',
      ).run();
    } else {
      db.prepare(
        `UPDATE guests SET seat_email_status = NULL, seat_email_attempts = 0, seat_email_next = 0
         WHERE seat_email_status IS NOT NULL AND seat_email_status NOT IN ('sent', 'no-email')`,
      ).run();
    }
    worker.kick();
    res.json({ stats: stats() });
  });

  r.post('/reveal/preview', async (req, res) => {
    const to = normEmail(req.body?.to) || getSettings().adminEmail;
    if (!to) return res.status(400).json({ error: 'Indica un indirizzo email' });
    const sample = db.prepare('SELECT * FROM guests WHERE table_id IS NOT NULL ORDER BY id LIMIT 1').get();
    const table = sample ? q.tableById.get(sample.table_id) : { name: 'Tavolo Esempio', description: 'Vicino alla finestra' };
    const mates = sample ? q.tableMates.all(sample.table_id) : [{ id: -1, name: 'Mario Rossi' }, { id: -2, name: 'Anna Bianchi' }];
    const guest = { ...(sample || { id: 0, name: 'Invitato Esempio', seat: '' }), token: 'anteprima' };
    await mail.sendMail({ to, ...mail.seatingEmail(guest, table, mates) });
    res.json({ ok: true, to });
  });

  /* ---------- Email ---------- */

  r.post('/email/test', async (req, res) => {
    const to = normEmail(req.body?.to) || getSettings().adminEmail;
    if (!to) return res.status(400).json({ error: 'Indica un indirizzo email' });
    try {
      await mail.sendMail({ to, ...mail.testEmail() });
      res.json({ ok: true, to });
    } catch (err) {
      res.status(400).json({ error: `Invio non riuscito: ${err.message}` });
    }
  });

  /* ---------- Announcements ---------- */

  r.post('/announce', async (req, res) => {
    const title = cleanText(req.body?.title, 120);
    const text = cleanText(req.body?.text, 2000);
    if (!text) return res.status(400).json({ error: 'Scrivi il messaggio' });
    const couple = getSettings().coupleNames;
    const result = { pushed: 0, emails: 0 };

    setSettings({ lastAnnouncement: { title, text, at: Date.now() } });
    hub.broadcast('settings', publicSettings());
    hub.broadcast('announce', { title, text }, (c) => !c.isAdmin);

    if (req.body?.post) {
      app.locals.insertMessage(
        { guestId: null, name: couple, isAdmin: 1 },
        { kind: 'announce', text: [title, text].filter(Boolean).join('\n') },
      );
    }
    if (req.body?.push) {
      result.pushed = await push.sendToAll({ title: title || `📣 ${couple}`, body: text, url: '/', tag: `announce-${Date.now()}` });
    }
    if (req.body?.email) {
      if (!mail.emailEnabled()) return res.status(400).json({ error: 'Configura prima le email', ...result });
      const emails = db
        .prepare('SELECT DISTINCT email FROM guests WHERE registered_at IS NOT NULL AND email IS NOT NULL')
        .all()
        .map((x) => x.email);
      result.emails = emails.length;
      const content = mail.announceEmail(title, text);
      (async () => {
        for (const to of emails) {
          await mail.sendMail({ to, ...content }).catch((err) => console.warn('[announce] email', to, err.message));
        }
      })();
    }
    res.json({ ok: true, ...result });
  });

  /* ---------- Tables ---------- */

  r.get('/tables', (req, res) => res.json({ tables: tableRows() }));

  r.post('/tables', (req, res) => {
    const name = cleanText(req.body?.name, 80);
    if (!name) return res.status(400).json({ error: 'Dai un nome al tavolo' });
    const sort = count('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM seating_tables');
    db.prepare('INSERT INTO seating_tables(name, description, sort, shape, seats) VALUES(?, ?, ?, ?, ?)').run(
      name,
      cleanText(req.body?.description, 300),
      sort,
      tableShape(req.body?.shape),
      tableSeats(req.body?.seats),
    );
    res.json({ tables: tableRows() });
  });

  // Several numbered tables at once, optionally with the couple's table.
  r.post('/tables/bulk', (req, res) => {
    createTables({
      count: req.body?.count,
      prefix: cleanText(req.body?.prefix, 40) || 'Tavolo',
      seats: req.body?.seats,
      couple: !!req.body?.couple,
    });
    res.json({ tables: tableRows() });
  });

  r.post('/tables/arrange', (req, res) => {
    arrangeTables();
    res.json({ tables: tableRows() });
  });

  r.patch('/tables/:id', (req, res) => {
    const t = q.tableById.get(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Tavolo non trovato' });
    const b = req.body || {};
    const coord = (v, old) => (v === null ? null : v === undefined ? old : Math.max(0, Math.min(100, Number(v) || 0)));
    db.prepare('UPDATE seating_tables SET name = ?, description = ?, x = ?, y = ?, sort = ?, shape = ?, seats = ? WHERE id = ?').run(
      b.name !== undefined ? cleanText(b.name, 80) || t.name : t.name,
      b.description !== undefined ? cleanText(b.description, 300) : t.description,
      coord(b.x, t.x),
      coord(b.y, t.y),
      b.sort !== undefined ? Number(b.sort) || 0 : t.sort,
      b.shape !== undefined ? tableShape(b.shape) : t.shape,
      b.seats !== undefined ? tableSeats(b.seats) : t.seats,
      t.id,
    );
    res.json({ tables: tableRows() });
  });

  r.post('/tables/order', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
    transaction(() => ids.forEach((id, i) => db.prepare('UPDATE seating_tables SET sort = ? WHERE id = ?').run(i + 1, id)));
    res.json({ tables: tableRows() });
  });

  r.delete('/tables/:id', (req, res) => {
    const id = Number(req.params.id);
    transaction(() => {
      for (const g of db.prepare('SELECT id FROM guests WHERE table_id = ?').all(id)) resetNotification.run(g.id);
      db.prepare('DELETE FROM seating_tables WHERE id = ?').run(id);
    });
    res.json({ tables: tableRows() });
  });

  /* ---------- Guests ---------- */

  r.get('/guests', (req, res) => res.json({ guests: guestRows() }));

  r.post('/guests', (req, res) => {
    const name = cleanText(req.body?.name, 80).replace(/\s+/g, ' ');
    if (name.length < 2) return res.status(400).json({ error: 'Scrivi nome e cognome' });
    const tableId = Number(req.body?.tableId) || null;
    db.prepare('INSERT INTO guests(name, name_key, email, table_id, seat, created_at) VALUES(?, ?, ?, ?, ?, ?)').run(
      name,
      nameKey(name),
      normEmail(req.body?.email),
      tableId && q.tableById.get(tableId) ? tableId : null,
      cleanText(req.body?.seat, 20),
      Date.now(),
    );
    res.json({ guests: guestRows() });
  });

  r.patch('/guests/:id', (req, res) => {
    const g = q.guestById.get(Number(req.params.id));
    if (!g) return res.status(404).json({ error: 'Invitato non trovato' });
    const b = req.body || {};
    const name = b.name !== undefined ? cleanText(b.name, 80).replace(/\s+/g, ' ') || g.name : g.name;
    const email = b.email !== undefined ? normEmail(b.email) : g.email;
    let tableId = g.table_id;
    if (b.tableId !== undefined) {
      tableId = Number(b.tableId) || null;
      if (tableId && !q.tableById.get(tableId)) return res.status(400).json({ error: 'Tavolo non valido' });
    }
    const seat = b.seat !== undefined ? cleanText(b.seat, 20) : g.seat;
    if (g.registered_at && email && email !== g.email) {
      const other = db
        .prepare('SELECT name FROM guests WHERE email = ? AND registered_at IS NOT NULL AND id != ?')
        .get(email, g.id);
      if (other) return res.status(409).json({ error: `Questa email è già registrata da ${other.name}` });
    }
    transaction(() => {
      db.prepare('UPDATE guests SET name = ?, name_key = ?, email = ?, table_id = ?, seat = ? WHERE id = ?').run(
        name,
        nameKey(name),
        email,
        tableId,
        seat,
        g.id,
      );
      // A changed table after the reveal means the guest must be told again.
      if (tableId !== g.table_id || seat !== g.seat) resetNotification.run(g.id);
    });
    hub.broadcastToGuests([g.id], 'seating', {});
    worker.kick();
    const row = guestRows().find((x) => x.id === g.id);
    res.json({ guest: row });
  });

  r.delete('/guests/:id', (req, res) => {
    db.prepare('DELETE FROM guests WHERE id = ?').run(Number(req.params.id));
    res.json({ guests: guestRows() });
  });

  // Put several guests at one table (or take them off any table with tableId null).
  r.post('/guests/assign', (req, res) => {
    const ids = Array.isArray(req.body?.guestIds) ? req.body.guestIds.map(Number).filter(Boolean) : [];
    const tableId = Number(req.body?.tableId) || null;
    if (tableId && !q.tableById.get(tableId)) return res.status(400).json({ error: 'Tavolo non valido' });
    const changed = [];
    transaction(() => {
      for (const id of ids) {
        const g = q.guestById.get(id);
        if (!g || g.table_id === tableId) continue;
        db.prepare('UPDATE guests SET table_id = ? WHERE id = ?').run(tableId, id);
        resetNotification.run(id);
        changed.push(id);
      }
    });
    hub.broadcastToGuests(changed, 'seating', {});
    worker.kick();
    res.json({ changed: changed.length, guests: guestRows(), tables: tableRows() });
  });

  r.post('/guests/:id/resend', (req, res) => {
    resetNotification.run(Number(req.params.id));
    worker.kick();
    res.json({ ok: true });
  });

  r.post('/guests/import', (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 2000) : [];
    const result = { created: 0, updated: 0, tablesCreated: 0 };
    transaction(() => {
      for (const row of rows) {
        const name = cleanText(row?.name, 80).replace(/\s+/g, ' ');
        if (name.length < 2) continue;
        const table = row.table ? findOrCreateTable(row.table) : null;
        if (table?.created) result.tablesCreated++;
        const email = normEmail(row.email);
        const seat = cleanText(row.seat, 20);
        const key = nameKey(name);
        const existing =
          (email && db.prepare('SELECT * FROM guests WHERE email = ? AND name_key = ?').get(email, key)) ||
          db.prepare('SELECT * FROM guests WHERE name_key = ? ORDER BY registered_at IS NULL, id LIMIT 1').get(key);
        if (existing) {
          const tableId = table ? table.id : existing.table_id;
          const newSeat = seat || existing.seat;
          db.prepare('UPDATE guests SET table_id = ?, seat = ?, email = COALESCE(email, ?) WHERE id = ?').run(
            tableId,
            newSeat,
            email,
            existing.id,
          );
          if (tableId !== existing.table_id || newSeat !== existing.seat) resetNotification.run(existing.id);
          result.updated++;
        } else {
          db.prepare('INSERT INTO guests(name, name_key, email, table_id, seat, created_at) VALUES(?, ?, ?, ?, ?, ?)').run(
            name,
            key,
            email,
            table ? table.id : null,
            seat,
            Date.now(),
          );
          result.created++;
        }
      }
    });
    worker.kick();
    res.json({ ...result, guests: guestRows(), tables: tableRows() });
  });

  /* ---------- Images: cover, floor plan, app icon ---------- */

  const IMAGE_KEYS = { cover: 'coverImage', floorplan: 'floorplan' };

  // Images for the info cards: stored as files, referenced from settings.sections[].image.
  r.post('/upload/section', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nessun file' });
    res.json({ file: saveImage(req.file, 'section') });
  });

  r.post('/upload/:kind', upload.single('file'), (req, res) => {
    const key = IMAGE_KEYS[req.params.kind];
    if (!key) return res.status(404).json({ error: 'Tipo non valido' });
    if (!req.file) return res.status(400).json({ error: 'Nessun file' });
    const name = saveImage(req.file, req.params.kind);
    removeUpload(getSettings()[key]);
    setSettings({ [key]: name });
    hub.broadcast('settings', publicSettings());
    res.json({ settings: adminSettings() });
  });

  r.delete('/upload/:kind', (req, res) => {
    const key = IMAGE_KEYS[req.params.kind];
    if (!key) return res.status(404).json({ error: 'Tipo non valido' });
    removeUpload(getSettings()[key]);
    setSettings({ [key]: null });
    hub.broadcast('settings', publicSettings());
    res.json({ settings: adminSettings() });
  });

  const ICON_FILES = {
    i512: 'icon-512.png',
    i192: 'icon-192.png',
    i180: 'apple-touch-icon.png',
    m512: 'maskable-512.png',
    badge: 'badge-96.png',
  };

  r.post(
    '/icon',
    upload.fields(Object.keys(ICON_FILES).map((name) => ({ name, maxCount: 1 }))),
    (req, res) => {
      for (const field of Object.keys(ICON_FILES)) {
        if (field === 'badge') continue;
        if (imageExt(req.files?.[field]?.[0]?.buffer) !== 'png') {
          return res.status(400).json({ error: 'Icona non valida' });
        }
      }
      for (const [field, file] of Object.entries(ICON_FILES)) {
        const f = req.files?.[field]?.[0];
        if (f) fs.writeFileSync(path.join(ICON_DIR, file), f.buffer);
      }
      setSettings({
        customIcon: req.body?.kind === 'photo' ? 'photo' : 'monogram',
        iconVersion: getSettings().iconVersion + 1,
      });
      hub.broadcast('settings', publicSettings());
      res.json({ settings: adminSettings() });
    },
  );

  r.delete('/icon', (req, res) => {
    setSettings({ customIcon: false, iconVersion: getSettings().iconVersion + 1 });
    hub.broadcast('settings', publicSettings());
    res.json({ settings: adminSettings() });
  });

  /* ---------- Exports ---------- */

  r.get('/photos.zip', (req, res) => {
    const s = getSettings();
    const photos = db.prepare("SELECT * FROM messages WHERE kind = 'photo' AND deleted = 0 ORDER BY id").all();
    const texts = db.prepare("SELECT * FROM messages WHERE kind != 'photo' AND deleted = 0 ORDER BY id").all();
    res.attachment(`foto-${slug(s.coupleNames)}.zip`);
    const archive = new ZipArchive({ store: true });
    archive.on('warning', (err) => console.warn('[zip]', err.message));
    archive.on('error', (err) => {
      console.error('[zip]', err);
      res.destroy(err);
    });
    archive.pipe(res);
    photos.forEach((p, i) => {
      const file = path.join(UPLOAD_DIR, p.photo);
      if (fs.existsSync(file)) {
        const ext = path.extname(p.photo) || '.jpg';
        archive.file(file, { name: `foto/${String(i + 1).padStart(4, '0')}_${slug(p.author)}${ext}` });
      }
    });
    const fmt = (t) => new Date(t).toLocaleString('it-IT', { timeZone: s.tz || 'Europe/Rome' });
    const chat = texts.map((m) => `[${fmt(m.created_at)}] ${m.author}: ${m.text}`).join('\n');
    const captions = photos
      .filter((p) => p.text)
      .map((p, i) => `foto ${i + 1} · ${p.author}: ${p.text}`)
      .join('\n');
    archive.append(`${chat}\n\n--- Didascalie delle foto ---\n${captions}\n`, { name: 'messaggi.txt' });
    archive.finalize();
  });

  r.get('/guests.csv', (req, res) => {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmt = (t) => (t ? new Date(t).toLocaleString('it-IT', { timeZone: getSettings().tz || 'Europe/Rome' }) : '');
    const lines = [
      ['Nome', 'Email', 'Tavolo', 'Posto', 'Registrato', 'Notifiche push', 'Tavolo notificato', 'Email tavolo'].join(';'),
      ...guestRows().map((g) =>
        [g.name, g.email, g.tableName, g.seat, fmt(g.registeredAt), g.pushDevices, fmt(g.notifiedAt), g.emailStatus]
          .map(cell)
          .join(';'),
      ),
    ];
    res.attachment('invitati.csv');
    res.type('text/csv; charset=utf-8').send(`﻿${lines.join('\r\n')}`);
  });

  r.get('/qr.svg', async (req, res) => {
    const svg = await QRCode.toString(publicUrl(), {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#2E2A26', light: '#FFFFFF' },
    });
    res.type('image/svg+xml').send(svg);
  });

  return r;
}
