// Service worker: offline shell, push notifications.
const CACHE = 'wedding-v1';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/util.js', '/js/admin.js', '/icon/icon-192.png', '/icon/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const OFFLINE_API = ['/api/state', '/api/seating'];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/uploads/') || url.pathname === '/api/stream') return;
  if (url.pathname.startsWith('/api/') && !OFFLINE_API.includes(url.pathname)) return;
  if (url.pathname === '/login') return;

  // Network first (always fresh), cache as offline fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          const key = req.mode === 'navigate' ? '/' : req;
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req.mode === 'navigate' ? '/' : req, { ignoreSearch: req.mode !== 'navigate' });
        return cached || Response.error();
      }),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Novità', body: event.data?.text() || '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Novità dal matrimonio', {
      body: data.body || '',
      icon: '/icon/icon-192.png',
      badge: '/icon/badge-96.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
      vibrate: [120, 60, 120],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === location.origin) {
          await w.focus();
          w.postMessage({ type: 'navigate', url: target });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
