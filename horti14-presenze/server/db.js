import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'presenze.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  job TEXT NOT NULL DEFAULT '',
  pass_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  invite_hash TEXT,
  invite_exp INTEGER,
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  ua TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Current state: one row per employee per day. Every change is also written to the audit log.
CREATE TABLE IF NOT EXISTS entries (
  user_id INTEGER NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('L', 'F', 'P', 'M')),
  hours REAL,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  updated_by INTEGER,
  PRIMARY KEY (user_id, day)
);

-- Month confirmations ("consegne"): the digest fingerprints exactly what was confirmed.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  month TEXT NOT NULL,
  digest TEXT NOT NULL,
  totals TEXT NOT NULL,
  content TEXT NOT NULL,
  audit_id INTEGER,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_user_month ON submissions(user_id, month, id);

CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs(user_id);

-- Reminders already sent (so each one goes out once, even across restarts).
CREATE TABLE IF NOT EXISTS reminders (
  user_id INTEGER NOT NULL REFERENCES users(id),
  month TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, month, kind)
);

-- Append-only, hash-chained log of everything that happens (see audit.js).
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_id INTEGER,
  actor TEXT NOT NULL,
  subject_id INTEGER,
  subject TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  month TEXT,
  day TEXT,
  before TEXT,
  after TEXT,
  ip TEXT NOT NULL DEFAULT '',
  ua TEXT NOT NULL DEFAULT '',
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_subject ON audit(subject_id, month, id);
CREATE INDEX IF NOT EXISTS audit_month ON audit(month, id);

CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
BEGIN SELECT RAISE(ABORT, 'Il registro non si può modificare'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
BEGIN SELECT RAISE(ABORT, 'Il registro non si può cancellare'); END;
`);

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
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

export const DEFAULTS = {
  companyName: 'Horti 14',
  reminderHour: 9,
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
  adminEnvHash: '',
  publicUrl: '',
};

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

if (!getSettings().secret) setSettings({ secret: crypto.randomBytes(32).toString('hex') });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function normEmail(value) {
  const e = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null;
}

export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function publicUrl() {
  const fromEnv = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
  return (fromEnv || getSettings().publicUrl || 'http://localhost:3000').replace(/\/+$/, '');
}

export const fullName = (u) => `${u.first_name} ${u.last_name}`.trim();

export const q = {
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  admins: db.prepare("SELECT * FROM users WHERE role = 'admin' AND active = 1"),
  employees: db.prepare("SELECT * FROM users WHERE role = 'employee' ORDER BY active DESC, last_name COLLATE NOCASE, first_name COLLATE NOCASE"),
  entriesOf: db.prepare('SELECT * FROM entries WHERE user_id = ? AND day LIKE ? ORDER BY day'),
  entriesOfMonth: db.prepare('SELECT * FROM entries WHERE day LIKE ? ORDER BY user_id, day'),
  entry: db.prepare('SELECT * FROM entries WHERE user_id = ? AND day = ?'),
  lastSubmission: db.prepare('SELECT * FROM submissions WHERE user_id = ? AND month = ? ORDER BY id DESC LIMIT 1'),
  subsOf: db.prepare('SELECT * FROM push_subs WHERE user_id = ?'),
  pushCount: db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?'),
};
