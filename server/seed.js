// First-run setup: loads config/matrimonio.json (texts, style, tables, pictures) into a
// brand-new installation, so the couple finds everything ready. Never touches an app
// that has already been set up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, UPLOAD_DIR, getSettings, setSettings } from './db.js';
import { createTables, arrangeTables } from './tables.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Only content: credentials and internal keys can never come from the file.
const CONTENT_KEYS = [
  'coupleNames',
  'weddingDate',
  'tz',
  'accent',
  'nameFont',
  'coverImage',
  'coverTone',
  'welcomeTitle',
  'welcomeText',
  'sections',
  'revealAt',
  'revealMessage',
  'hallEntrance',
  'notifyOnLive',
  'allowPhotos',
  'allowChat',
];

const isImage = (buf) =>
  buf.length > 12 &&
  ((buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||
    buf.toString('ascii', 1, 4) === 'PNG' ||
    (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'));

function isFreshInstall() {
  const touched = db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key NOT IN ('secret', 'vapid')").get().n;
  const tables = db.prepare('SELECT COUNT(*) AS n FROM seating_tables').get().n;
  const guests = db.prepare('SELECT COUNT(*) AS n FROM guests').get().n;
  return !touched && !tables && !guests;
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !isImage(buf)) throw new Error(`HTTP ${res.status}`);
  return buf;
}

export async function applySeed() {
  const file = process.env.SEED_FILE || path.join(ROOT, 'config', 'matrimonio.json');
  if (getSettings().seededAt || !fs.existsSync(file)) return;
  if (!isFreshInstall()) {
    setSettings({ seededAt: Date.now() });
    return;
  }
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));

  const saved = new Set();
  for (const [name, url] of Object.entries(cfg.images || {})) {
    const safe = path.basename(name);
    try {
      fs.writeFileSync(path.join(UPLOAD_DIR, safe), await download(url));
      saved.add(safe);
    } catch (err) {
      console.warn('[setup] immagine non scaricata:', safe, err.message);
    }
  }

  const settings = {};
  for (const key of CONTENT_KEYS) if (cfg.settings && key in cfg.settings) settings[key] = cfg.settings[key];
  if (settings.coverImage && !saved.has(settings.coverImage)) settings.coverImage = null;
  if (Array.isArray(settings.sections)) {
    settings.sections = settings.sections.map((s) => ({ ...s, image: s.image && saved.has(s.image) ? s.image : '' }));
  }
  setSettings(settings);

  if (cfg.tables) {
    createTables(cfg.tables);
    arrangeTables();
  }
  setSettings({ seededAt: Date.now() });
  console.log(`💍 Configurazione iniziale caricata (${saved.size} immagini)`);
}
