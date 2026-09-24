// Human-readable text for audit events (used by the app, the demo and the CSV export).
import { describeEntry, shortDay, monthLabel } from './cal.js';

const ROLE = { employee: 'dipendente', admin: 'titolare' };
const FIELD = {
  firstName: 'nome',
  lastName: 'cognome',
  email: 'email',
  phone: 'telefono',
  job: 'mansione',
  role: 'ruolo',
};

function totalsText(t) {
  if (!t) return '';
  const hours = t.permHours ? ` (${String(t.permHours).replace('.', ',')} h)` : '';
  return `lavorati ${t.L}, ferie ${t.F}, permessi ${t.P}${hours}, malattia ${t.M}`;
}

export function describeEvent(e) {
  const a = e.after || {};
  const b = e.before || {};
  switch (e.action) {
    case 'day.set':
      return `${shortDay(e.day)}: ${describeEntry(e.before)} → ${describeEntry(e.after)}`;
    case 'month.confirm':
      return `Confermato il mese di ${monthLabel(e.month)} (${totalsText(a.totals)})`;
    case 'user.create':
      return `Creato l'account di ${e.subject} (${ROLE[a.role] || a.role}, ${a.email})`;
    case 'user.update':
      return `Modificati i dati di ${e.subject}: ${Object.keys(a)
        .map((k) => `${FIELD[k] || k} «${b[k] ?? ''}» → «${a[k] ?? ''}»`)
        .join(', ')}`;
    case 'user.deactivate':
      return `Disattivato l'account di ${e.subject}`;
    case 'user.reactivate':
      return `Riattivato l'account di ${e.subject}`;
    case 'user.invite':
      return `Creato un link di accesso per ${e.subject}${a.emailed ? ' (inviato per email)' : ''}`;
    case 'auth.login':
      return 'Accesso effettuato';
    case 'auth.login_failed':
      return `Accesso non riuscito (${a.email || ''}${a.reason ? `, ${a.reason}` : ''})`;
    case 'auth.logout':
      return 'Uscita dall’app';
    case 'auth.password_set':
      return 'Password scelta tramite link personale';
    case 'auth.password_change':
      return 'Password cambiata';
    case 'auth.reset_request':
      return 'Richiesto il link per reimpostare la password';
    case 'reminder.sent':
      return `Promemoria ${a.label || ''} inviato a ${e.subject} per ${monthLabel(e.month)} (${[
        a.push ? `notifica su ${a.push} dispositiv${a.push === 1 ? 'o' : 'i'}` : 'nessuna notifica',
        a.email ? 'email' : 'nessuna email',
      ].join(', ')})`;
    case 'summary.sent':
      return `Riepilogo di ${monthLabel(e.month)} inviato al titolare (${a.missing?.length ? `mancano ${a.missing.length}` : 'tutti consegnati'})`;
    case 'settings.update':
      return `Impostazioni modificate: ${(a.keys || []).join(', ')}`;
    default:
      return e.action;
  }
}

export const eventIcon = (action) =>
  ({
    'day.set': '✏️',
    'month.confirm': '✅',
    'reminder.sent': '🔔',
    'summary.sent': '📨',
  })[action] || (action.startsWith('auth.') ? '🔑' : action.startsWith('user.') ? '👤' : '⚙️');
