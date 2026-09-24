import webpush from 'web-push';
import { db, getSettings, setSettings, publicUrl, q } from './db.js';

const delSub = db.prepare('DELETE FROM push_subs WHERE id = ?');

export function initPush() {
  if (!getSettings().vapid) setSettings({ vapid: webpush.generateVAPIDKeys() });
}

export const vapidPublicKey = () => getSettings().vapid.publicKey;

function vapidDetails() {
  const { vapid } = getSettings();
  // Apple rejects localhost subjects: prefer the public https URL, then a mailto.
  const url = publicUrl();
  const subject = url.startsWith('https://') ? url : process.env.VAPID_SUBJECT || 'mailto:presenze@horti14.com';
  return { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey };
}

export function saveSubscription(userId, sub) {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth || endpoint.length > 1000) {
    throw Object.assign(new Error('Sottoscrizione non valida'), { status: 400 });
  }
  db.prepare(
    `INSERT INTO push_subs(user_id, endpoint, p256dh, auth, created_at) VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).run(userId, endpoint, p256dh, auth, Date.now());
}

export function removeSubscription(userId, endpoint) {
  db.prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint || ''));
}

/** Notify every device of a user; returns how many devices accepted it. */
export async function sendToUser(userId, payload) {
  const subs = q.subsOf.all(userId);
  if (!subs.length) return 0;
  const body = JSON.stringify(payload);
  const details = vapidDetails();
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24 * 3,
          urgency: 'high',
          vapidDetails: details,
          timeout: 15000,
        });
        delivered++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) delSub.run(s.id);
        else console.warn('[push] errore', err.statusCode || '', String(err.body || err.message).slice(0, 200));
      }
    }),
  );
  return delivered;
}
