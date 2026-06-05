/* Service worker for Yda Dex (Unbound Pokédex) PWA.
 * Scope: /Unbound-Pokedex-Adv/
 *
 * Strategy:
 *  - Only same-origin GET requests are handled. Cross-origin requests
 *    (dex-core engine/data on ydarissep.github.io, Google Fonts, etc.)
 *    are left untouched so the runtime fetch+eval loader keeps working.
 *  - Network-first with a cache fallback: always try the network so the
 *    app stays fresh (it sends no-cache headers), but fall back to the
 *    last cached copy when offline. */

const CACHE = 'yda-dex-v1';

// App shell pre-cached on install. Paths are relative to the SW scope.
const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // never block install if one asset 404s
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only same-origin GETs; let everything else hit the network directly.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache a copy of successful basic responses for offline fallback.
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        // Offline navigation fallback -> app shell.
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
