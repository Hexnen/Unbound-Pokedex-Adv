/* Service worker for Yda Dex (Unbound Pokédex) PWA — offline-capable.
 *
 * The app loads its engine (dex-core) and data (ROM-hack decomp files) from
 * other origins at runtime, then fetch+evals them. All of those responses are
 * CORS-readable, so we can cache them and serve the app fully offline.
 *
 * Caching strategy, by resource class:
 *   - shell  (same-origin index/css/icons)      -> network-first, cache fallback
 *   - engine (dex-core js/css/json)             -> stale-while-revalidate
 *   - data   (raw.github decomp .c/.h/.json…)   -> stale-while-revalidate
 *   - img    (sprites, type/TM icons, png/gif)  -> cache-first (+ size cap)
 *   - font   (Google fonts)                     -> cache-first
 * Anything else cross-origin is left to the network, untouched.
 *
 * stale-while-revalidate = serve the cached copy instantly (fast + offline),
 * and refresh it from the network in the background when online. The decomp
 * data changes rarely, so this is both fast and effectively always fresh. */

const VERSION = 'v2';
const CACHE_SHELL = `yda-shell-${VERSION}`;
const CACHE_ENGINE = `yda-engine-${VERSION}`;
const CACHE_DATA = `yda-data-${VERSION}`;
const CACHE_IMG = `yda-img-${VERSION}`;
const CACHE_FONT = `yda-font-${VERSION}`;
const CURRENT = [CACHE_SHELL, CACHE_ENGINE, CACHE_DATA, CACHE_IMG, CACHE_FONT];

// Keep the image cache from growing without bound. Unbound has ~1000 species,
// so this comfortably holds a full "download all sprites" warm-up plus icons.
const IMG_MAX = 2500;

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
    caches.open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // never block install if one asset 404s
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !CURRENT.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Decide which cache/strategy a request belongs to (or null = don't handle).
function classify(url) {
  const u = new URL(url);

  if (u.origin === self.location.origin) return CACHE_SHELL;

  if (u.hostname === 'fonts.gstatic.com' || u.hostname === 'fonts.googleapis.com') {
    return CACHE_FONT;
  }
  if (/\.(png|gif|jpe?g|webp|svg|ico)$/i.test(u.pathname)) return CACHE_IMG;

  if (u.hostname === 'ydarissep.github.io') return CACHE_ENGINE;
  if (u.hostname === 'raw.githubusercontent.com') {
    return u.pathname.includes('/dex-core/') ? CACHE_ENGINE : CACHE_DATA;
  }
  return null;
}

// A response worth caching: a readable 200 (cors/basic) or an opaque cross-origin
// response (e.g. an <img> loaded in no-cors mode, status 0 but still usable).
function cacheable(res) {
  return res && (res.ok || res.type === 'opaque');
}

// Serve cache immediately, refresh in the background.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (cacheable(res)) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

// Serve cache; only hit the network on a miss. Trim oldest entries past the cap.
async function cacheFirst(request, cacheName, cap) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request).catch(() => null);
  if (cacheable(res)) {
    await cache.put(request, res.clone());
    if (cap) trim(cacheName, cap);
  }
  return res || Response.error();
}

// Network-first: stay fresh, fall back to cache (then app shell) when offline.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return Response.error();
  }
}

// Approximate-LRU trim: Cache Storage preserves insertion order, so dropping the
// oldest keys behaves as FIFO — good enough to bound storage.
async function trim(cacheName, cap) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= cap) return;
  for (let i = 0; i < keys.length - cap; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const cacheName = classify(request.url);
  if (!cacheName) return; // not ours — straight to network

  if (cacheName === CACHE_SHELL) {
    event.respondWith(networkFirst(request, cacheName));
  } else if (cacheName === CACHE_IMG || cacheName === CACHE_FONT) {
    event.respondWith(cacheFirst(request, cacheName, cacheName === CACHE_IMG ? IMG_MAX : 0));
  } else {
    event.respondWith(staleWhileRevalidate(request, cacheName));
  }
});

// Let the page query/clear offline storage if it wants to.
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'CLEAR_OFFLINE') {
    event.waitUntil(
      Promise.all([CACHE_ENGINE, CACHE_DATA, CACHE_IMG, CACHE_FONT].map((c) => caches.delete(c)))
        .then(() => event.source && event.source.postMessage({ type: 'OFFLINE_CLEARED' }))
    );
  }
});
