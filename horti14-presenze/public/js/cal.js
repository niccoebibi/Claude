// Calendar rules shared by the server, the app and the demo (pure functions, no DOM).
// Dates are plain strings: day 'YYYY-MM-DD', month 'YYYY-MM', always in Rome time.

export const TZ = 'Europe/Rome';

export const CODES = {
  L: { label: 'Lavorato', plural: 'Lavorati', short: 'L', color: '#3F6B4E' },
  F: { label: 'Ferie', plural: 'Ferie', short: 'F', color: '#2F6FA3' },
  P: { label: 'Permesso', plural: 'Permessi', short: 'P', color: '#B7791F' },
  M: { label: 'Malattia', plural: 'Malattia', short: 'M', color: '#B4473F' },
};

export const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];
export const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

const pad = (n) => String(n).padStart(2, '0');
const parse = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d || 1));
};
const fmt = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s));
export const isDay = (s) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s)) && fmt(parse(s)) === s;

/** Rome wall-clock parts of an instant: { day, month, hour, minute }. */
export function romeNow(t = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, month: day.slice(0, 7), hour: Number(parts.hour), minute: Number(parts.minute) };
}

export const monthOf = (day) => day.slice(0, 7);
export const daysInMonth = (month) => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
export const monthDays = (month) => Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`);
export const weekday = (day) => parse(day).getUTCDay();

export function addDays(day, n) {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function addMonths(month, n) {
  const d = parse(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return fmt(d).slice(0, 7);
}

/** Deadline for a month: its last Thursday (the whole day counts). */
export function deadline(month) {
  let day = `${month}-${pad(daysInMonth(month))}`;
  while (weekday(day) !== 4) day = addDays(day, -1);
  return day;
}

/** Employees can edit the previous month, the current one and plan up to a year ahead. */
export function employeeCanEdit(month, today) {
  const current = monthOf(today);
  return month >= addMonths(current, -1) && month <= addMonths(current, 12);
}

export const monthLabel = (month) => `${MONTHS[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}`;
export const monthName = (month) => MONTHS[+month.slice(5, 7) - 1];
export const dayLabel = (day) => `${WEEKDAYS[weekday(day)]} ${+day.slice(8, 10)} ${MONTHS[+day.slice(5, 7) - 1]}`;
export const shortDay = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** Rome date and time of an instant, e.g. '24/09/2026 18:32:05'. */
export function stamp(t, { seconds = true } = {}) {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
  })
    .format(new Date(t))
    .replace(',', '');
}

/** Normalised entry, or null when the input does not describe a valid day. */
export function cleanEntry({ code, hours, note } = {}) {
  if (!CODES[code]) return null;
  const out = { code };
  if (code === 'P' && hours !== undefined && hours !== null && hours !== '') {
    const h = Math.round(Number(hours) * 2) / 2;
    if (!(h > 0 && h <= 12)) return null;
    out.hours = h;
  }
  const n = String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (n) out.note = n;
  return out;
}

export const sameEntry = (a, b) =>
  (a?.code ?? null) === (b?.code ?? null) && (a?.hours ?? null) === (b?.hours ?? null) && (a?.note ?? '') === (b?.note ?? '');

export function describeEntry(e) {
  if (!e) return 'vuoto';
  let s = CODES[e.code]?.label || e.code;
  if (e.hours) s += ` ${String(e.hours).replace('.', ',')} h`;
  if (e.note) s += ` («${e.note}»)`;
  return s;
}

/** Totals for a month: { L, F, P, M, permHours } (full-day permits count as days only). */
export function totals(entries) {
  const t = { L: 0, F: 0, P: 0, M: 0, permHours: 0 };
  for (const e of Object.values(entries || {})) {
    if (!e || !(e.code in t)) continue;
    t[e.code]++;
    if (e.code === 'P' && e.hours) t.permHours += e.hours;
  }
  return t;
}

/** Canonical text of a month's content: the same data always gives the same text (and hash). */
export function canonicalMonth(entries) {
  return JSON.stringify(
    Object.keys(entries || {})
      .sort()
      .map((day) => [day, entries[day].code, entries[day].hours ?? null, entries[day].note ?? '']),
  );
}

/**
 * Where an employee stands for a month.
 * state: 'ok' (confirmed, unchanged) · 'changed' (edited after confirming) · 'todo' (never confirmed)
 * late: not 'ok' after the deadline.
 */
export function monthStatus({ month, today, confirmedDigest, currentDigest }) {
  const state = !confirmedDigest ? 'todo' : confirmedDigest === currentDigest ? 'ok' : 'changed';
  const due = deadline(month);
  return { state, deadline: due, late: state !== 'ok' && today > due, dueToday: state !== 'ok' && today === due };
}

/** Which automatic reminder applies today for a month (null = none). */
export function reminderKind(month, today) {
  const due = deadline(month);
  if (today > addDays(due, 7) || today < addDays(due, -3)) return null;
  if (today < due) return 'pre';
  if (today === due) return 'due';
  return `late-${today}`;
}
