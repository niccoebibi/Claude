// Personal accounts: scrypt password hashes, server-side sessions, one-time links
// (invitation and password reset), bootstrap of the owner account from env vars.
import crypto from 'node:crypto';
import { db, q, sha256, randomToken, normEmail, getSettings, setSettings, fullName, publicUrl } from './db.js';
import * as audit from './audit.js';

const SESSION_DAYS = 180;
const INVITE_DAYS = 14;
export const MIN_PASSWORD = 8;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function checkPassword(password, stored) {
  if (!stored) return false;
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

// Burn the same time for unknown emails, so response times do not reveal which accounts exist.
const DUMMY_HASH = hashPassword(randomToken());

export function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD) return `La password deve avere almeno ${MIN_PASSWORD} caratteri`;
  if (p.length > 200) return 'Password troppo lunga';
  return null;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const insertSession = db.prepare(
  'INSERT INTO sessions(user_id, token_hash, created_at, expires_at, ip, ua) VALUES(?, ?, ?, ?, ?, ?)',
);
const sessionByHash = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?');
const touchUser = db.prepare('UPDATE users SET last_seen = ? WHERE id = ?');

export function createSession(user, ctx) {
  const token = randomToken();
  insertSession.run(user.id, sha256(token), Date.now(), Date.now() + SESSION_DAYS * 864e5, ctx.ip || '', String(ctx.ua || '').slice(0, 300));
  return token;
}

export function sessionUser(token) {
  if (!token) return null;
  const s = sessionByHash.get(sha256(token), Date.now());
  if (!s) return null;
  const user = q.userById.get(s.user_id);
  if (!user || !user.active) return null;
  if (!user.last_seen || Date.now() - user.last_seen > 60000) touchUser.run(Date.now(), user.id);
  return user;
}

export const sessionHash = (token) => sha256(token || '');
export const endSession = (token) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sessionHash(token));
export const endAllSessions = (userId) => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

export const cookieOptions = (req) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: req.secure,
  maxAge: SESSION_DAYS * 864e5,
  path: '/',
});

/* ------------------------------------------------------------------ */
/* One-time links (invitation / password reset)                        */
/* ------------------------------------------------------------------ */

const setInvite = db.prepare('UPDATE users SET invite_hash = ?, invite_exp = ? WHERE id = ?');
const userByInvite = db.prepare('SELECT * FROM users WHERE invite_hash = ? AND invite_exp > ? AND active = 1');

/** New personal link; any previous one stops working. */
export function newAccessLink(user, { hours = INVITE_DAYS * 24 } = {}) {
  const token = randomToken(24);
  setInvite.run(sha256(token), Date.now() + hours * 3600e3, user.id);
  return `${publicUrl()}/#accesso/${token}`;
}

export const userByAccessToken = (token) => (token ? userByInvite.get(sha256(token), Date.now()) : null);

export function setPassword(user, password) {
  db.prepare(
    'UPDATE users SET pass_hash = ?, invite_hash = NULL, invite_exp = NULL, activated_at = COALESCE(activated_at, ?) WHERE id = ?',
  ).run(hashPassword(password), Date.now(), user.id);
}

/* ------------------------------------------------------------------ */
/* Owner account                                                       */
/* ------------------------------------------------------------------ */

/**
 * ADMIN_EMAIL / ADMIN_PASSWORD create the owner's account on first start.
 * Changing ADMIN_PASSWORD later (e.g. on Render) resets that password: handy if it is forgotten.
 */
export function bootstrapAdmin() {
  const email = normEmail(process.env.ADMIN_EMAIL);
  let password = process.env.ADMIN_PASSWORD || '';
  const system = { ip: 'server' };
  if (!email) {
    if (!q.admins.all().length) console.warn('⚠️  ADMIN_EMAIL non impostata: nessun account titolare.');
    return;
  }
  let generated = false;
  if (!password) {
    password = randomToken(9);
    generated = true;
  }
  const envHash = sha256(`${email}:${password}`);
  let user = q.userByEmail.get(email);
  if (!user) {
    db.prepare(
      "INSERT INTO users(role, first_name, last_name, email, pass_hash, created_at, activated_at) VALUES('admin', 'Titolare', '', ?, ?, ?, ?)",
    ).run(email, hashPassword(password), Date.now(), Date.now());
    user = q.userByEmail.get(email);
    audit.log(system, { action: 'user.create', subject: user, after: { role: 'admin', email } });
    setSettings({ adminEnvHash: envHash });
    if (generated) console.warn(`⚠️  ADMIN_PASSWORD non impostata: password temporanea del titolare = ${password}`);
  } else if (!generated && getSettings().adminEnvHash !== envHash) {
    db.prepare("UPDATE users SET pass_hash = ?, role = 'admin', active = 1 WHERE id = ?").run(hashPassword(password), user.id);
    audit.log(system, { action: 'auth.password_change', subject: user, after: { via: 'ADMIN_PASSWORD' } });
    setSettings({ adminEnvHash: envHash });
    console.log(`🔑 Password del titolare ${fullName(user)} aggiornata da ADMIN_PASSWORD`);
  }
}

export { DUMMY_HASH };
