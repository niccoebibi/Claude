import webpush from 'web-push';
import { db, getSettings, setSettings, publicUrl, q } from './db.js';

const delSub = db.prepare('DELETE FROM push_subs WHERE id = ?');
const allSubs = db.prepare('SELECT * FROM push_subs');

export function initPush() {
  if (!getSettings().vapid) setSettings({ vapid: webpush.generateVAPIDKeys() });
}

export const vapidPublicKey = () => getSettings().vapid.publicKey;

function vapidDetails() {
  const { vapid, adminEmail } = getSettings();
  // Apple rejects localhost subjects; prefer the public https URL, then a mailto.
  const url = publicUrl();
  const subject = url.startsWith('https://')
    ? url
    : process.env.VAPID_SUBJECT || `mailto:${adminEmail || 'sposi@matrimonio.app'}`;
  return { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey };
}

export function saveSubscription(guestId, sub) {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth || endpoint.length > 1000) {
    throw Object.assign(new Error('Sottoscrizione non valida'), { status: 400 });
  }
  db.prepare(
    `INSERT INTO push_subs(guest_id, endpoint, p256dh, auth, created_at) VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET guest_id = excluded.guest_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).run(guestId, endpoint, p256dh, auth, Date.now());
}

export function removeSubscription(guestId, endpoint) {
  db.prepare('DELETE FROM push_subs WHERE guest_id = ? AND endpoint = ?').run(guestId, String(endpoint || ''));
}

async function sendToSubs(subs, payload) {
  const body = JSON.stringify(payload);
  const details = vapidDetails();
  let delivered = 0;
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(
      subs.slice(i, i + 25).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60 * 60 * 24,
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
  }
  return delivered;
}

export const sendToGuest = (guestId, payload) => sendToSubs(q.subsByGuest.all(guestId), payload);
export const sendToAll = (payload) => sendToSubs(allSubs.all(), payload);
