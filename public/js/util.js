// Shared helpers: DOM, API, formatting, images, dialogs.

// Keep in sync with server/theme.js
export const ACCENTS = {
  salvia: { name: 'Salvia', color: '#6F826A' },
  oro: { name: 'Oro', color: '#A8844E' },
  cipria: { name: 'Cipria', color: '#BF7B7B' },
  terracotta: { name: 'Terracotta', color: '#B5653E' },
  lavanda: { name: 'Lavanda', color: '#7E72A6' },
  blu: { name: 'Blu notte', color: '#2F4A6D' },
  bordeaux: { name: 'Bordeaux', color: '#7D2E3E' },
  cobalto: { name: 'Blu cobalto', color: '#3D518A' },
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Escaped text with clickable links and line breaks. */
export function richText(s) {
  return esc(s)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
}

export function html(strings, ...values) {
  return strings.reduce((out, str, i) => out + str + (i < values.length ? values[i] ?? '' : ''), '');
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (form) opts.body = form;
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error('Connessione assente: riprova tra un attimo');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Errore ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Upload with progress (fetch cannot report upload progress). */
export function uploadForm(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status < 300 ? resolve(xhr.response) : reject(new Error(xhr.response?.error || `Errore ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Connessione assente: riprova'));
    xhr.send(form);
  });
}

/* ------------------------------------------------------------------ */
/* Icons (Feather-style, 24x24 stroke)                                 */
/* ------------------------------------------------------------------ */

const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  plusSquare: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  tv: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  up: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  down: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  table: '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="3" r="1.6"/><circle cx="12" cy="21" r="1.6"/><circle cx="3" cy="12" r="1.6"/><circle cx="21" cy="12" r="1.6"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="14.01"/><line x1="18" y1="14" x2="21" y2="14"/><line x1="14" y1="18" x2="14" y2="21"/><line x1="18" y1="18" x2="21" y2="21"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0z"/><path d="M17 5h3a3 3 0 0 1-3 5M7 5H4a3 3 0 0 0 3 5"/><path d="M12 14v4M8 21h8M9 18h6"/>',
};

// Fine-line illustrations for the info cards (48x48), in the style of the couple's stationery.
export const LINE_ICONS = {
  busta: {
    label: 'Busta',
    svg: '<rect x="7" y="13" width="34" height="23" rx="2.5"/><path d="M8 15l16 10 16-10"/><path d="M24 35c-2.8-2-5.6-3.9-5.6-6.4 0-1.7 1.3-2.8 2.8-2.8 1.2 0 2.2.6 2.8 1.7.6-1.1 1.6-1.7 2.8-1.7 1.5 0 2.8 1.1 2.8 2.8 0 2.5-2.8 4.4-5.6 6.4z"/>',
  },
  regalo: {
    label: 'Regalo',
    svg: '<rect x="9" y="20" width="30" height="8" rx="1.5"/><path d="M11 28v12a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V28"/><path d="M24 20v22"/><path d="M24 20c-2-4.5-9-7.5-10.5-3.8C12.4 19 18 20 24 20z"/><path d="M24 20c2-4.5 9-7.5 10.5-3.8C35.6 19 30 20 24 20z"/>',
  },
  fedi: {
    label: 'Fedi',
    svg: '<circle cx="19" cy="29" r="10"/><circle cx="29" cy="29" r="10"/><path d="M29 19l-3-3.5 3-3.2 3 3.2z"/>',
  },
  chiesa: {
    label: 'Chiesa',
    svg: '<path d="M24 4v7M21 7h6"/><path d="M14 42V24l10-9 10 9v18"/><path d="M8 42V31l6-4M40 42V31l-6-4"/><path d="M20 42v-7a4 4 0 0 1 8 0v7"/><circle cx="24" cy="24.5" r="2.5"/><path d="M5 42h38"/>',
  },
  brindisi: {
    label: 'Brindisi',
    svg: '<g transform="rotate(-12 17 26)"><path d="M13 8h8l-.6 11a3.4 3.4 0 0 1-6.8 0z"/><path d="M17 22.5V36M13.5 36h7"/></g><g transform="rotate(12 31 26)"><path d="M27 8h8l-.6 11a3.4 3.4 0 0 1-6.8 0z"/><path d="M31 22.5V36M27.5 36h7"/></g><path d="M24 3v3.5M20.5 5.5l1.5 1.5M27.5 5.5 26 7"/>',
  },
  luogo: { label: 'Luogo', svg: '<path d="M24 43s-12-11.2-12-21a12 12 0 0 1 24 0c0 9.8-12 21-12 21z"/><circle cx="24" cy="22" r="4.5"/>' },
  parcheggio: { label: 'Parcheggio', svg: '<rect x="9" y="9" width="30" height="30" rx="7"/><path d="M20 33V16h6a5 5 0 0 1 0 10h-6"/>' },
  calendario: {
    label: 'Calendario',
    svg: '<rect x="8" y="11" width="32" height="29" rx="3"/><path d="M8 19h32M16 7v7M32 7v7"/><path d="M24 34.5c-2.3-1.7-4.6-3.2-4.6-5.3 0-1.4 1.1-2.3 2.3-2.3 1 0 1.8.5 2.3 1.4.5-.9 1.3-1.4 2.3-1.4 1.2 0 2.3.9 2.3 2.3 0 2.1-2.3 3.6-4.6 5.3z"/>',
  },
  orario: { label: 'Orario', svg: '<circle cx="24" cy="24" r="17"/><path d="M24 14v10l7 4"/>' },
  cuore: {
    label: 'Cuore',
    svg: '<path d="M24 40c-7-5-15-10.4-15-17.5C9 17.8 12.4 14 16.8 14c3 0 5.5 1.6 7.2 4.2C25.7 15.6 28.2 14 31.2 14c4.4 0 7.8 3.8 7.8 8.5C39 29.6 31 35 24 40z"/>',
  },
  torta: { label: 'Torta', svg: '<path d="M10 40h28M12 40V30h24v10M15 30v-7h18v7M19 23v-5h10v5M24 18v-4"/><path d="M24 12c-1.2-1.4-.4-3.2 0-4 .4.8 1.2 2.6 0 4z"/>' },
  musica: { label: 'Musica', svg: '<path d="M19 35V11l18-4v24"/><circle cx="15" cy="35" r="4"/><circle cx="33" cy="31" r="4"/>' },
  foto: { label: 'Foto', svg: '<path d="M7 17a3 3 0 0 1 3-3h5l3-4h12l3 4h5a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"/><circle cx="24" cy="26" r="7"/>' },
  casa: { label: 'Casa', svg: '<path d="M8 22 24 9l16 13"/><path d="M12 19v21h24V19"/><path d="M20 40v-9h8v9"/>' },
  viaggio: { label: 'Viaggio', svg: '<path d="M42 7 6 22l12 4 4 12 5-8 9 6z"/><path d="m18 26 24-19"/>' },
  hotel: { label: 'Hotel', svg: '<path d="M6 36V12M6 28h36v8M42 28v-5a5 5 0 0 0-5-5H20v10"/><circle cx="13" cy="22" r="3.5"/>' },
};

/** Card icon: "line:<name>" draws a fine-line illustration, anything else is shown as an emoji. */
export function cardIcon(value) {
  const v = String(value || '');
  if (v.startsWith('line:')) {
    const ic = LINE_ICONS[v.slice(5)];
    return ic
      ? `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic.svg}</svg>`
      : '';
  }
  return esc(v);
}

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function fmtDate(iso, tz, opts) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('it-IT', { timeZone: tz || 'Europe/Rome', ...opts }).format(new Date(iso));
}

export function fmtLongDate(iso, tz) {
  return fmtDate(iso, tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtDateTime(iso, tz) {
  return fmtDate(iso, tz, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function fmtTime(ts, tz) {
  return fmtDate(ts, tz, { hour: '2-digit', minute: '2-digit' });
}

export function relTime(ts, tz) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 45) return 'ora';
  if (diff < 3600) return `${Math.round(diff / 60)} min fa`;
  const sameDay = new Date(ts).toDateString() === new Date().toDateString();
  if (sameDay) return fmtTime(ts, tz);
  return fmtDate(ts, tz, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function colorFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 32% 58%)`;
}

export function countdown(target, now = Date.now()) {
  let diff = Math.max(0, Math.floor((Date.parse(target) - now) / 1000));
  const d = Math.floor(diff / 86400);
  diff -= d * 86400;
  const h = Math.floor(diff / 3600);
  diff -= h * 3600;
  const m = Math.floor(diff / 60);
  const s = diff - m * 60;
  return { d, h, m, s, done: Date.parse(target) <= now };
}

/* ------------------------------------------------------------------ */
/* Time zones: <input type="datetime-local"> <-> ISO in the wedding tz  */
/* ------------------------------------------------------------------ */

function tzOffset(ts, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ts));
  const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) - ts;
}

export function localInputToIso(value, tz) {
  if (!value) return null;
  const [d, t = '00:00'] = value.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  let ts = wall;
  for (let i = 0; i < 2; i++) ts = wall - tzOffset(ts, tz);
  return new Date(ts).toISOString();
}

export function isoToLocalInput(iso, tz) {
  if (!iso) return '';
  const ts = Date.parse(iso);
  const d = new Date(ts + tzOffset(ts, tz));
  return d.toISOString().slice(0, 16);
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Formato foto non supportato'));
    };
    img.src = url;
  });
}

/** Downscale a photo in the browser (keeps uploads fast on venue Wi-Fi). */
export async function resizeImage(file, sizes) {
  const { img, url } = await loadImage(file);
  try {
    const out = [];
    for (const { max, quality = 0.85, type = 'image/jpeg', square = false } of sizes) {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      let sx = 0;
      let sy = 0;
      let sw = W;
      let sh = H;
      if (square) {
        const side = Math.min(W, H);
        sx = (W - side) / 2;
        sy = (H - side) / 2;
        sw = sh = side;
      }
      const scale = Math.min(1, max / Math.max(sw, sh));
      const w = square ? max : Math.round(sw * scale);
      const h = square ? max : Math.round(sh * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
      if (!blob) throw new Error('Impossibile elaborare la foto');
      out.push({ blob, w, h });
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------------ */
/* Toasts & dialogs                                                    */
/* ------------------------------------------------------------------ */

export function toast(message, type = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, type === 'error' ? 5000 : 3200);
}

export function errorToast(err) {
  toast(err?.message || 'Qualcosa è andato storto', 'error');
}

/**
 * Bottom sheet / dialog. `content` is an HTML string; returns { el, close }.
 * Buttons with [data-close] close the sheet.
 */
export function sheet(content, { onClose, className = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `sheet-wrap ${className}`;
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <button class="sheet-x icon-btn" data-close aria-label="Chiudi">${icon('x')}</button>
      ${content}
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('open');
    if (!document.querySelector('.sheet-wrap.open')) document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 250);
    onClose?.();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  return { el: wrap.querySelector('.sheet'), close };
}

export function confirmDialog(message, { ok = 'Conferma', cancel = 'Annulla', danger = false, title = '' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const { el, close } = sheet(
      `${title ? `<h3 class="sheet-title">${esc(title)}</h3>` : ''}
       <p class="sheet-text">${richText(message)}</p>
       <div class="sheet-actions">
         <button class="btn ghost" data-act="no">${esc(cancel)}</button>
         <button class="btn ${danger ? 'danger' : 'primary'}" data-act="yes">${esc(ok)}</button>
       </div>`,
      { onClose: () => !answered && resolve(false) },
    );
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      answered = true;
      resolve(act === 'yes');
      close();
    });
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiato!');
  } catch {
    prompt('Copia il testo:', text);
  }
}

/* ------------------------------------------------------------------ */
/* Device detection                                                    */
/* ------------------------------------------------------------------ */

const ua = navigator.userAgent;
export const device = {
  ios: /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  android: /Android/i.test(ua),
  inApp: /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|; wv\)/i.test(ua),
  iosChrome: /CriOS/i.test(ua),
  standalone: () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
};

/* ------------------------------------------------------------------ */
/* Trophies & confetti (the couple's quiz)                             */
/* ------------------------------------------------------------------ */

let trophyIds = 0;
/**
 * Trophy for the quiz: 'classic' (silver, everyone who finishes) or 'shiny'
 * (gold with sparkles, all answers right). `mini` drops the animations for badges.
 */
export function trophySVG(kind, { mini = false } = {}) {
  const shiny = kind === 'shiny';
  const id = `tr${++trophyIds}`;
  const [c1, c2, c3, line] = shiny ? ['#fff4c2', '#f1c343', '#c98d17', '#9c6a0c'] : ['#ffffff', '#dfe4ef', '#a9b3c9', 'var(--accent)'];
  const cup = 'M19 7h26v10c0 9-5.8 16-13 16S19 26 19 17z';
  const sparkle = (x, y, r, d) =>
    `<path class="tw" style="animation-delay:${d}s" d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}z"/>`;
  return `<svg class="trophy ${shiny ? 'shiny' : 'classic'}" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".5" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>
      ${mini ? '' : `<clipPath id="${id}c"><path d="${cup}"/><rect x="21" y="43" width="22" height="6" rx="2"/><rect x="17" y="49" width="30" height="8" rx="2.5"/></clipPath>`}
    </defs>
    <g stroke="${line}" stroke-width="${mini ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round">
      <path d="M19 11h-7c0 8 3.5 12.5 9.5 13.5M45 11h7c0 8-3.5 12.5-9.5 13.5" fill="none"/>
      <path d="${cup}" fill="url(#${id}g)"/>
      <path d="M28.5 33h7l-1 10h-5z" fill="url(#${id}g)"/>
      <rect x="21" y="43" width="22" height="6" rx="2" fill="url(#${id}g)"/>
      <rect x="17" y="49" width="30" height="8" rx="2.5" fill="url(#${id}g)"/>
    </g>
    <path d="M32 13.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="${shiny ? '#fffbe6' : 'var(--accent)'}" opacity="${shiny ? 0.95 : 0.85}"/>
    ${
      mini
        ? ''
        : `<g clip-path="url(#${id}c)"><rect class="shine" x="-18" y="0" width="12" height="64" fill="#fff" opacity=".55"/></g>
           ${shiny ? `<g class="sparkles" fill="#f5c542">${sparkle(10, 6, 4, 0)}${sparkle(56, 30, 3.5, 0.7)}${sparkle(8, 36, 3, 1.3)}${sparkle(54, 4, 2.5, 1.9)}</g>` : ''}`
    }
  </svg>`;
}

/**
 * Canvas confetti. A burst from (x, y) or, with `rain`, a shower from the top.
 * Skipped for people who asked their phone for less motion.
 */
export function confetti({ x, y, count = 70, spread = 60, power = 1, rain = false, duration = 2600 } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3d518a';
  const colors = [accent, '#e3b341', '#f3d57a', '#eea5b8', '#8fa6de', '#c9d4f2'];
  const ox = x ?? W / 2;
  const oy = y ?? H / 3;
  const parts = Array.from({ length: count }, (_, i) => {
    const angle = ((-90 + (Math.random() - 0.5) * 2 * spread) * Math.PI) / 180;
    const v = (5 + Math.random() * 7) * power;
    return {
      x: rain ? Math.random() * W : ox,
      y: rain ? -20 - Math.random() * H * 0.6 : oy,
      vx: rain ? (Math.random() - 0.5) * 1.5 : Math.cos(angle) * v,
      vy: rain ? 2 + Math.random() * 2.5 : Math.sin(angle) * v,
      w: 5 + Math.random() * 5,
      h: 7 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      sway: Math.random() * Math.PI * 2,
      color: colors[i % colors.length],
      round: Math.random() < 0.25,
    };
  });
  const start = performance.now();
  const frame = (now) => {
    const age = now - start;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, Math.min(1, (duration - age) / 600));
    for (const p of parts) {
      p.vy += rain ? 0.03 : 0.22;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.sway += 0.08;
      p.x += p.vx + (rain ? Math.sin(p.sway) * 0.8 : 0);
      p.y += p.vy;
      p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      if (p.round) {
        g.beginPath();
        g.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.max(0.2, Math.abs(Math.cos(p.rot * 1.7))));
      }
      g.restore();
    }
    if (age < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}


/* ------------------------------------------------------------------ */
/* Sound (quiz effects)                                                */
/* ------------------------------------------------------------------ */

let audioCtx = null;
/** Shared Web Audio context, or null where sound is not available. */
export function audio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}
/** Call from inside a tap: iPhones only let a page make sound once the user touched it. */
export function unlockAudio() {
  const ctx = audio();
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}
