// Background jobs: automatic switch to live mode and the seating reveal
// (push notification to every device + one email per guest).
// All state lives in the database, so a restart simply resumes the work.
import { db, getSettings, setSettings, publicSettings, isRevealed, randomToken, q } from './db.js';
import * as hub from './hub.js';
import * as push from './push.js';
import * as mail from './mail.js';

const MAX_EMAIL_ATTEMPTS = 3;

export async function setMode(mode, notify) {
  const prev = getSettings().mode;
  setSettings({ mode });
  hub.broadcast('settings', publicSettings());
  if (mode === 'live' && prev !== 'live' && notify) {
    await push.sendToAll({
      title: `📸 La chat LIVE di ${getSettings().coupleNames} è aperta!`,
      body: 'Condividi foto e messaggi in diretta con tutti gli invitati.',
      url: '/#bacheca',
      tag: 'live',
    });
  }
}

async function autoLive() {
  const s = getSettings();
  if (s.autoLiveAt && Date.now() >= Date.parse(s.autoLiveAt)) {
    setSettings({ autoLiveAt: null });
    if (s.mode !== 'live') await setMode('live', s.notifyOnLive);
  }
}

// Registered guests, plus guests imported with an email who never registered:
// they get the email too, with a personal link that logs them straight in.
const pendingPush = db.prepare(`
  SELECT g.id, g.name, g.token, t.name AS table_name FROM guests g
  JOIN seating_tables t ON t.id = g.table_id
  WHERE (g.registered_at IS NOT NULL OR g.email IS NOT NULL) AND g.seat_notified_at IS NULL`);
const markNotified = db.prepare('UPDATE guests SET seat_notified_at = ? WHERE id = ?');
const giveToken = db.prepare('UPDATE guests SET token = ? WHERE id = ? AND token IS NULL');

async function pushPhase() {
  const rows = pendingPush.all();
  if (!rows.length) return;
  const stamp = Date.now();
  for (const g of rows) {
    if (!g.token) giveToken.run(randomToken(), g.id);
    markNotified.run(stamp, g.id);
  }
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(
      rows.slice(i, i + 20).map((g) =>
        push
          .sendToGuest(g.id, {
            title: '🪑 Il tuo tavolo è pronto!',
            body: `Sarai al tavolo «${g.table_name}». Tocca per vedere la disposizione.`,
            url: '/#tavolo',
            tag: 'seating',
          })
          .catch((err) => console.warn('[reveal] push', err.message)),
      ),
    );
  }
  hub.broadcastToGuests(
    rows.map((g) => g.id),
    'seating',
    {},
  );
}

const pendingEmail = db.prepare(`
  SELECT * FROM guests
  WHERE seat_notified_at IS NOT NULL AND table_id IS NOT NULL
    AND (seat_email_status IS NULL
         OR (seat_email_status LIKE 'error%' AND seat_email_attempts < ${MAX_EMAIL_ATTEMPTS} AND seat_email_next <= ?))
  ORDER BY seat_notified_at, id LIMIT 10`);
const setEmailStatus = db.prepare(
  'UPDATE guests SET seat_email_status = ?, seat_email_attempts = ?, seat_email_next = ? WHERE id = ?',
);

async function emailPhase() {
  for (const g of pendingEmail.all(Date.now())) {
    if (!g.email) {
      setEmailStatus.run('no-email', g.seat_email_attempts, 0, g.id);
      continue;
    }
    if (!mail.emailEnabled()) {
      setEmailStatus.run('non-configurata', g.seat_email_attempts, 0, g.id);
      continue;
    }
    const attempts = g.seat_email_attempts + 1;
    try {
      const guest = q.guestById.get(g.id);
      const table = q.tableById.get(g.table_id);
      await mail.sendMail({ to: g.email, ...mail.seatingEmail(guest, table, q.tableMates.all(g.table_id)) });
      setEmailStatus.run('sent', attempts, 0, g.id);
    } catch (err) {
      console.warn('[reveal] email', g.email, err.message);
      setEmailStatus.run(`error: ${String(err.message).slice(0, 180)}`, attempts, Date.now() + attempts * 60000, g.id);
    }
  }
}

function announceReveal() {
  const s = getSettings();
  if (s.revealAnnounced) return;
  setSettings({ revealAnnounced: true });
  hub.broadcast('reveal', {});
}

let running = false;
let again = false;

export async function tick() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await autoLive();
      if (isRevealed()) {
        announceReveal();
        await pushPhase();
        await emailPhase();
      }
    } while (again);
  } catch (err) {
    console.error('[worker]', err);
  } finally {
    running = false;
  }
}

/** Run the worker soon (e.g. after an admin action). */
export const kick = () => setImmediate(tick);

export function startWorker() {
  setInterval(tick, 5000).unref();
  setTimeout(tick, 500);
}
