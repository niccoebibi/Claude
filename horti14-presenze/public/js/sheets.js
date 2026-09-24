// CSV files for Excel (Italian locale: «;» separator, UTF-8 with BOM). Shared by server and demo.
import { CODES, monthDays, monthLabel, stamp } from './cal.js';
import { describeEvent } from './events.js';

const cell = (v) => {
  let s = String(v ?? '');
  // Text typed by users must never run as an Excel formula.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows) => `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;

const code = (e) => (!e ? '' : e.code === 'P' && e.hours ? `P${String(e.hours).replace('.', ',')}` : e.code);
const STATE = { ok: 'Confermato', changed: 'Modificato dopo la conferma', todo: 'Non confermato' };

/** The monthly sheet: one row per employee, one column per day, totals, then the notes. */
export function monthSheet({ company, month, rows }) {
  const days = monthDays(month);
  const notes = [];
  for (const r of rows) {
    for (const d of days) {
      const e = r.entries[d];
      if (e?.note) notes.push([r.name, d.split('-').reverse().join('/'), CODES[e.code].label, e.note]);
    }
  }
  return toCsv([
    [`Presenze ${company} - ${monthLabel(month)}`],
    ['Dipendente', 'Mansione', ...days.map((d) => d.slice(8)), 'Lavorati', 'Ferie', 'Permessi', 'Ore di permesso', 'Malattia', 'Stato', 'Confermato il'],
    ...rows.map((r) => [
      r.name,
      r.job,
      ...days.map((d) => code(r.entries[d])),
      r.totals.L,
      r.totals.F,
      r.totals.P,
      String(r.totals.permHours).replace('.', ','),
      r.totals.M,
      STATE[r.state],
      r.confirmedAt ? stamp(r.confirmedAt) : '',
    ]),
    [],
    ['Legenda: L = lavorato, F = ferie, P = permesso di un giorno intero, P2 = permesso di 2 ore, M = malattia'],
    ...(notes.length ? [[], ['Note'], ['Dipendente', 'Giorno', 'Tipo', 'Nota'], ...notes] : []),
  ]);
}

/** The audit log, with both fingerprints of every event so anyone can re-check the chain. */
export function auditSheet(events) {
  return toCsv([
    ['N.', 'Data e ora (Roma)', 'Chi', 'Dipendente', 'Evento', 'Descrizione', 'IP', 'Dispositivo', 'Impronta precedente', 'Impronta'],
    ...events.map((e) => [e.id, stamp(e.at), e.actor, e.subject, e.action, describeEvent(e), e.ip, e.ua, e.prevHash, e.hash]),
  ]);
}
