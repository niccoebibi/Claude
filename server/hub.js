// Live updates via Server-Sent Events: simple, proxy-friendly, auto-reconnecting.
import { getSettings } from './db.js';

const clients = new Set();

export function addClient(req, res, { guestId, isAdmin }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client = { res, guestId, isAdmin, key: guestId ? `g${guestId}` : `a${Math.random()}` };
  clients.add(client);
  send(client, 'online', onlineCount());
  req.on('close', () => clients.delete(client));
}

function send(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(client);
  }
}

/** Broadcast to everyone (optionally filtered). */
export function broadcast(event, data, filter) {
  for (const c of clients) if (!filter || filter(c)) send(c, event, data);
}

/** Board events are visible to guests only while the live board is open. */
export function broadcastBoard(event, data) {
  const live = getSettings().mode === 'live';
  broadcast(event, data, (c) => live || c.isAdmin);
}

export function broadcastToGuests(guestIds, event, data) {
  const ids = new Set(guestIds);
  broadcast(event, data, (c) => c.guestId && ids.has(c.guestId));
}

export function onlineCount() {
  return new Set([...clients].map((c) => c.key)).size;
}

setInterval(() => broadcast('online', onlineCount()), 20000).unref();
