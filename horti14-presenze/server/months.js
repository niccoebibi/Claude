// Attendance logic: reading a month, changing days, confirming ("consegna") a month.
import { db, q, sha256, transaction, fullName } from './db.js';
import * as audit from './audit.js';
import { cleanEntry, sameEntry, totals, canonicalMonth, monthStatus, monthOf, romeNow } from '../public/js/cal.js';

const rowToEntry = (r) => cleanEntry({ code: r.code, hours: r.hours, note: r.note });

export function monthEntries(userId, month) {
  const out = {};
  for (const r of q.entriesOf.all(userId, `${month}-%`)) out[r.day] = rowToEntry(r);
  return out;
}

export const digestOf = (entries) => sha256(canonicalMonth(entries));

/** Everything the calendar screen needs about one employee and one month. */
export function monthState(user, month, today = romeNow().day) {
  const entries = monthEntries(user.id, month);
  const digest = digestOf(entries);
  const last = q.lastSubmission.get(user.id, month);
  const status = monthStatus({ month, today, confirmedDigest: last?.digest, currentDigest: digest });
  return {
    month,
    entries,
    digest,
    totals: totals(entries),
    ...status,
    confirmedAt: last?.at ?? null,
    receiptId: last?.audit_id ?? null,
  };
}

const upsertEntry = db.prepare(`
  INSERT INTO entries(user_id, day, code, hours, note, updated_at, updated_by) VALUES(?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, day) DO UPDATE SET code = excluded.code, hours = excluded.hours, note = excluded.note,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by`);
const deleteEntry = db.prepare('DELETE FROM entries WHERE user_id = ? AND day = ?');

/**
 * Set (or clear, with entry = null) several days of one employee at once.
 * Each day that really changes gets its own audit event with the value before and after.
 */
export function setDays(ctx, subject, days, entry) {
  return transaction(() => {
    const changes = [];
    for (const day of days) {
      const row = q.entry.get(subject.id, day);
      const before = row ? rowToEntry(row) : null;
      if (sameEntry(before, entry)) continue;
      if (entry) upsertEntry.run(subject.id, day, entry.code, entry.hours ?? null, entry.note ?? '', Date.now(), ctx.user?.id ?? null);
      else deleteEntry.run(subject.id, day);
      audit.log(ctx, { action: 'day.set', subject, month: monthOf(day), day, before, after: entry });
      changes.push({ day, before, after: entry });
    }
    return changes;
  });
}

const insertSubmission = db.prepare(
  'INSERT INTO submissions(user_id, month, digest, totals, content, audit_id, at) VALUES(?, ?, ?, ?, ?, ?, ?)',
);

/** Differences between the previously confirmed content and the current one. */
function diffSinceLast(prev, entries) {
  if (!prev) return [];
  const old = Object.fromEntries(JSON.parse(prev.content).map(([day, code, hours, note]) => [day, cleanEntry({ code, hours, note })]));
  return [...new Set([...Object.keys(old), ...Object.keys(entries)])]
    .sort()
    .filter((day) => !sameEntry(old[day], entries[day]))
    .map((day) => ({ day, before: old[day] || null, after: entries[day] || null }));
}

/** The employee confirms the month exactly as it is now. */
export function confirmMonth(ctx, user, month) {
  return transaction(() => {
    const entries = monthEntries(user.id, month);
    const digest = digestOf(entries);
    const prev = q.lastSubmission.get(user.id, month);
    if (prev?.digest === digest) return { already: true, receiptId: prev.audit_id, at: prev.at };
    const t = totals(entries);
    const changes = diffSinceLast(prev, entries);
    const row = audit.log(ctx, {
      action: 'month.confirm',
      subject: user,
      month,
      after: { totals: t, digest, days: Object.keys(entries).length, changes: prev ? changes.length : undefined },
    });
    insertSubmission.run(user.id, month, digest, JSON.stringify(t), canonicalMonth(entries), row.id, row.at);
    return { already: false, receiptId: row.id, at: row.at, digest, totals: t, entries, auditHash: row.hash, changes, recheck: !!prev };
  });
}

/** Employees expected to deliver a month: active, with an account, added by the end of that month. */
export function expectedEmployees(month) {
  return q.employees.all().filter((u) => u.active && u.pass_hash && romeNow(u.created_at).month <= month);
}

/** One line per employee for the owner's overview of a month. */
export function overview(month, today = romeNow().day) {
  const expected = new Set(expectedEmployees(month).map((u) => u.id));
  const withEntries = new Set(db.prepare('SELECT DISTINCT user_id FROM entries WHERE day LIKE ?').all(`${month}-%`).map((r) => r.user_id));
  return q.employees
    .all()
    .filter((u) => u.active || withEntries.has(u.id))
    .map((u) => {
      const s = monthState(u, month, today);
      return {
        id: u.id,
        name: fullName(u),
        firstName: u.first_name,
        lastName: u.last_name,
        job: u.job,
        active: !!u.active,
        activated: !!u.pass_hash,
        expected: expected.has(u.id),
        state: s.state,
        late: s.late && expected.has(u.id),
        dueToday: s.dueToday,
        confirmedAt: s.confirmedAt,
        totals: s.totals,
        entries: s.entries,
      };
    });
}
