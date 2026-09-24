import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const ICON_DIR = path.join(UPLOAD_DIR, 'icons');
fs.mkdirSync(ICON_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'wedding.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seating_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  x REAL,
  y REAL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  email TEXT,
  table_id INTEGER REFERENCES seating_tables(id) ON DELETE SET NULL,
  seat TEXT NOT NULL DEFAULT '',
  token TEXT UNIQUE,
  registered_at INTEGER,
  last_seen INTEGER,
  login_code TEXT,
  login_code_exp INTEGER,
  login_attempts INTEGER NOT NULL DEFAULT 0,
  seat_notified_at INTEGER,
  seat_email_status TEXT,
  seat_email_attempts INTEGER NOT NULL DEFAULT 0,
  seat_email_next INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guests_email ON guests(email);
CREATE INDEX IF NOT EXISTS guests_name_key ON guests(name_key);
CREATE INDEX IF NOT EXISTS guests_table ON guests(table_id);

CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_guest ON push_subs(guest_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  photo TEXT,
  thumb TEXT,
  w INTEGER,
  h INTEGER,
  likes INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_kind ON messages(kind, id);

CREATE TABLE IF NOT EXISTS likes (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  liker TEXT NOT NULL,
  PRIMARY KEY (message_id, liker)
);
`);

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_SECTIONS = [
  {
    icon: '⛪',
    title: 'La cerimonia',
    subtitle: 'Ore 11:00',
    body: 'Chiesa di Santa Maria\nVia Roma 1, Città',
    linkLabel: 'Apri in Maps',
    linkUrl: '',
  },
  {
    icon: '🥂',
    title: 'Il ricevimento',
    subtitle: 'Dalle 13:00',
    body: 'Villa delle Rose\nVia dei Giardini 10, Città',
    linkLabel: 'Apri in Maps',
    linkUrl: '',
  },
  {
    icon: '🗓️',
    title: 'Il programma',
    subtitle: '',
    body: '11:00 · Cerimonia\n12:30 · Aperitivo in giardino\n14:00 · Pranzo\n17:30 · Taglio della torta\n18:30 · Musica e balli',
    linkLabel: '',
    linkUrl: '',
  },
  {
    icon: '👗',
    title: 'Dress code',
    subtitle: '',
    body: 'Elegante. Lasciate il bianco alla sposa 😉',
    linkLabel: '',
    linkUrl: '',
  },
  {
    icon: '🎁',
    title: 'Lista nozze',
    subtitle: '',
    body: 'La vostra presenza è il regalo più bello.\nPer chi desidera farci un pensiero: IBAN IT00 X000 0000 0000 0000 0000 000',
    linkLabel: '',
    linkUrl: '',
  },
  {
    icon: '📞',
    title: 'Contatti',
    subtitle: '',
    body: 'Per qualsiasi cosa scriveteci pure:\nBeatrice 333 000 0000 · Niccolò 333 000 0001',
    linkLabel: '',
    linkUrl: '',
  },
];

export const DEFAULTS = {
  coupleNames: 'Niccolò & Beatrice',
  weddingDate: null,
  tz: 'Europe/Rome',
  accent: 'salvia',
  welcomeTitle: 'Benvenuti!',
  welcomeText:
    "Siamo felicissimi di condividere con voi il giorno più bello della nostra vita.\nQui trovate tutte le informazioni utili: orari, luoghi e qualche sorpresa. Il giorno del matrimonio questa app diventerà la nostra bacheca: condividete foto e messaggi!",
  coverImage: null,
  sections: DEFAULT_SECTIONS,
  mode: 'info',
  autoLiveAt: null,
  notifyOnLive: true,
  allowPhotos: true,
  allowChat: true,
  revealAt: null,
  revealAnnounced: false,
  revealMessage: '',
  lastAnnouncement: null,
  floorplan: null,
  iconVersion: 0,
  customIcon: false,
  adminEmail: '',
  email: {
    provider: 'gmail',
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromEmail: '',
    fromName: '',
  },
  vapid: null,
  secret: null,
  publicUrl: '',
};

const PRIVATE_KEYS = new Set(['email', 'vapid', 'secret', 'adminEmail', 'revealAnnounced', 'publicUrl']);

const upsertSetting = db.prepare(
  'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
);

let cache = null;

export function getSettings() {
  if (!cache) {
    cache = structuredClone(DEFAULTS);
    for (const row of db.prepare('SELECT key, value FROM settings').all()) {
      if (!(row.key in DEFAULTS)) continue;
      try {
        cache[row.key] = JSON.parse(row.value);
      } catch {
        /* ignore corrupt value, keep default */
      }
    }
  }
  return cache;
}

export function setSettings(patch) {
  const s = getSettings();
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS)) continue;
    s[key] = value;
    upsertSetting.run(key, JSON.stringify(value));
  }
  return s;
}

export function publicSettings() {
  const s = getSettings();
  const out = {};
  for (const key of Object.keys(s)) if (!PRIVATE_KEYS.has(key)) out[key] = s[key];
  return out;
}

if (!getSettings().secret) setSettings({ secret: crypto.randomBytes(32).toString('hex') });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

/** Order-insensitive, accent-insensitive key: "Rossi Mario" === "mario  rossì". */
export function nameKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function normEmail(value) {
  const e = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null;
}

export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export function isRevealed(s = getSettings(), t = Date.now()) {
  return !!s.revealAt && t >= Date.parse(s.revealAt);
}

export function publicUrl() {
  const fromEnv = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
  return (fromEnv || getSettings().publicUrl || 'http://localhost:3000').replace(/\/+$/, '');
}

export const q = {
  guestByToken: db.prepare('SELECT * FROM guests WHERE token = ?'),
  guestById: db.prepare('SELECT * FROM guests WHERE id = ?'),
  tableById: db.prepare('SELECT * FROM seating_tables WHERE id = ?'),
  allTables: db.prepare('SELECT * FROM seating_tables ORDER BY sort, id'),
  tableMates: db.prepare('SELECT id, name FROM guests WHERE table_id = ? ORDER BY name COLLATE NOCASE'),
  touchGuest: db.prepare('UPDATE guests SET last_seen = ? WHERE id = ?'),
  subsByGuest: db.prepare('SELECT * FROM push_subs WHERE guest_id = ?'),
  pushCount: db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE guest_id = ?'),
};
