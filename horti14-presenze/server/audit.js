// Certified log: every change is appended here, never updated or deleted (SQLite triggers
// refuse it). Each event carries the SHA-256 of the previous one, so altering, removing or
// reordering any past event breaks the chain and `verify()` points at the exact spot.
import { db, sha256, fullName } from './db.js';

const GENESIS = '0'.repeat(64);

const last = db.prepare('SELECT id, hash FROM audit ORDER BY id DESC LIMIT 1');
const insert = db.prepare(`
  INSERT INTO audit(id, at, actor_id, actor, subject_id, subject, action, month, day, before, after, ip, ua, prev_hash, hash)
  VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const FIELDS = ['id', 'at', 'actor_id', 'actor', 'subject_id', 'subject', 'action', 'month', 'day', 'before', 'after', 'ip', 'ua', 'prev_hash'];
const hashOf = (row) => sha256(JSON.stringify(FIELDS.map((f) => row[f] ?? null)));

export function actorLabel(user) {
  if (!user) return 'Sistema';
  if (user.role === 'admin') return fullName(user) === 'Titolare' ? 'Titolare' : `${fullName(user)} (titolare)`;
  return `${fullName(user)} (dipendente)`;
}

/**
 * Append one event. Call it inside the same transaction as the change it describes.
 * ctx: { user, ip, ua } of whoever acted (no user = the system itself).
 */
export function log(ctx, { action, subject = null, month = null, day = null, before = null, after = null }) {
  const prev = last.get();
  const row = {
    id: (prev?.id || 0) + 1,
    at: Date.now(),
    actor_id: ctx?.user?.id ?? null,
    actor: actorLabel(ctx?.user),
    subject_id: subject?.id ?? null,
    subject: subject ? fullName(subject) : '',
    action,
    month,
    day,
    before: before == null ? null : JSON.stringify(before),
    after: after == null ? null : JSON.stringify(after),
    ip: String(ctx?.ip || '').slice(0, 64),
    ua: String(ctx?.ua || '').slice(0, 300),
    prev_hash: prev?.hash || GENESIS,
  };
  row.hash = hashOf(row);
  insert.run(...FIELDS.map((f) => row[f]), row.hash);
  return row;
}

export const head = () => db.prepare('SELECT id, at, hash FROM audit ORDER BY id DESC LIMIT 1').get() || null;

/** Recompute the whole chain. */
export function verify() {
  let prevId = 0;
  let prevHash = GENESIS;
  let count = 0;
  for (const row of db.prepare('SELECT * FROM audit ORDER BY id').iterate()) {
    count++;
    let reason = null;
    if (row.id !== prevId + 1) reason = `manca l'evento n. ${prevId + 1}`;
    else if (row.prev_hash !== prevHash) reason = "collegamento con l'evento precedente alterato";
    else if (hashOf(row) !== row.hash) reason = 'contenuto alterato';
    if (reason) return { ok: false, count, brokenAt: row.id, reason, head: head() };
    prevId = row.id;
    prevHash = row.hash;
  }
  return { ok: true, count, head: head() };
}

export function rowJson(r) {
  return {
    id: r.id,
    at: r.at,
    actorId: r.actor_id,
    actor: r.actor,
    subjectId: r.subject_id,
    subject: r.subject,
    action: r.action,
    month: r.month,
    day: r.day,
    before: r.before ? JSON.parse(r.before) : null,
    after: r.after ? JSON.parse(r.after) : null,
    ip: r.ip,
    ua: r.ua,
    prevHash: r.prev_hash,
    hash: r.hash,
  };
}
