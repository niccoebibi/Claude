// Reminders. Deadline: the last Thursday of each month. Whoever has not confirmed the month gets
// a notification on the phone plus an email three days before, on the day itself and every day
// for a week after. The day after the deadline the owner gets a summary of who is missing.
// Sent reminders are stored, so each one goes out once even across restarts.
import { db, q, getSettings, fullName } from './db.js';
import * as audit from './audit.js';
import * as push from './push.js';
import * as mail from './mail.js';
import * as months from './months.js';
import { romeNow, addMonths, addDays, deadline, reminderKind, monthLabel } from '../public/js/cal.js';

const claim = db.prepare('INSERT OR IGNORE INTO reminders(user_id, month, kind, at) VALUES(?, ?, ?, ?)');
const LABEL = { pre: 'preventivo', due: 'di scadenza', late: 'di ritardo', manual: 'manuale' };

/** Remind one employee (push + email) and write it in the log. */
export async function remind(user, month, kind, ctx = null) {
  const r = mail.reminderText(kind, month);
  const pushed = await push
    .sendToUser(user.id, {
      title: r.title,
      body: r.lead.replace(/<[^>]+>/g, ''),
      url: `/#mese/${month}`,
      tag: `promemoria-${month}`,
    })
    .catch(() => 0);
  const emailed = await mail.trySend({ to: user.email, ...mail.reminderEmail(user, month, kind) });
  audit.log(ctx, {
    action: 'reminder.sent',
    subject: user,
    month,
    after: { kind, label: LABEL[kind.split('-')[0]], push: pushed, email: emailed },
  });
  return { pushed, emailed };
}

/** Remind everyone who has not confirmed a month (owner's button). */
export async function remindMissing(month, ctx) {
  const missing = months.expectedEmployees(month).filter((u) => months.monthState(u, month).state !== 'ok');
  const kind = `manual-${Date.now()}`;
  for (const u of missing) await remind(u, month, kind, ctx);
  return missing.map(fullName);
}

export async function sendSummary(month, ctx = null) {
  const rows = months.expectedEmployees(month).map((u) => ({ name: fullName(u), ...months.monthState(u, month) }));
  const head = audit.head();
  const msg = mail.summaryEmail(month, rows, head);
  const missing = rows.filter((r) => r.state !== 'ok').map((r) => r.name);
  for (const admin of q.admins.all()) {
    await push
      .sendToUser(admin.id, { title: msg.subject, body: missing.length ? `Mancano: ${missing.join(', ')}` : 'Tutto in ordine.', url: `/#mese/${month}`, tag: `riepilogo-${month}` })
      .catch(() => 0);
    await mail.trySend({ to: admin.email, ...msg });
  }
  audit.log(ctx, { action: 'summary.sent', month, after: { missing, total: rows.length, sealId: head?.id, seal: head?.hash } });
}

/** When the last employee confirms a month, tell the owner (once per month). */
export async function checkAllDone(month) {
  const expected = months.expectedEmployees(month);
  if (!expected.length || expected.some((u) => months.monthState(u, month).state !== 'ok')) return;
  for (const admin of q.admins.all()) {
    if (!claim.run(admin.id, month, 'all-ok', Date.now()).changes) continue;
    await push
      .sendToUser(admin.id, { title: `Presenze di ${monthLabel(month)} complete ✅`, body: `Tutti i ${expected.length} dipendenti hanno confermato il mese.`, url: `/#mese/${month}`, tag: `riepilogo-${month}` })
      .catch(() => 0);
  }
}

async function automaticReminders(t = Date.now()) {
  const now = romeNow(t);
  if (now.hour < getSettings().reminderHour) return;
  for (const month of [addMonths(now.month, -1), now.month]) {
    const kind = reminderKind(month, now.day);
    if (!kind) continue;
    for (const user of months.expectedEmployees(month)) {
      if (months.monthState(user, month, now.day).state === 'ok') continue;
      if (!claim.run(user.id, month, kind, Date.now()).changes) continue;
      await remind(user, month, kind);
    }
    if (now.day === addDays(deadline(month), 1)) {
      const admins = q.admins.all();
      if (admins.length && claim.run(admins[0].id, month, 'summary', Date.now()).changes) await sendSummary(month);
    }
  }
}

let running = false;

export async function tick(t) {
  if (running) return;
  running = true;
  try {
    await automaticReminders(t);
  } catch (err) {
    console.error('[promemoria]', err);
  } finally {
    running = false;
  }
}

export function startWorker() {
  setInterval(tick, 60000).unref();
  setTimeout(tick, 2000).unref();
}
