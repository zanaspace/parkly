/* global self, caches, fetch, URL, Response */
// Attendant app service worker (ADR 0005). Lets /attend open with no network:
// - the page: network first, the last good copy when offline;
// - Next's static files (hashed, never change): cache first;
// - /attend/api/*: never cached (the app keeps its own data in IndexedDB).
const CACHE = 'parkly-attend-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['/attend']))
      .catch(() => undefined)
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/attend/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === 'navigate' && url.pathname.startsWith('/attend')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put('/attend', res.clone()));
          return res;
        })
        .catch(() => caches.match('/attend').then((hit) => hit || Response.error())),
    );
  }
});
