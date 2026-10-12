// FreqRoom service worker: makes the app installable and usable offline.
// Pages are network-first (updates show up as soon as you're online), each
// cached under its own URL, with the home page as the offline fallback; other same-origin files are served from
// cache and refreshed in the background (Vite's asset names are content-hashed).
// Bump CACHE when the caching strategy changes, which clears the old cache.
const CACHE = 'freqroom-v2';
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Each page is prerendered with its own title and markup, so pages are cached
  // by path (query strings ignored); any page can fall back to the home page,
  // since the app routes on the client
  if (request.mode === 'navigate') {
    const key = new URL(request.url).pathname;
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(key, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(key)) || caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      const refresh = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
