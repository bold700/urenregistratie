/**
 * Service Worker – Urenregistratie PWA / offline
 * Cachet app shell + externe assets voor offline gebruik
 */
const CACHE_NAME = 'urenregistratie-v7';
const BASE = new URL('./', self.location.href).href;
const PRECACHE = [BASE, BASE + 'index.html', BASE + 'app.js', BASE + 'shared/theme.css', BASE + 'shared/core.js', BASE + 'manifest.json', BASE + 'icon-192.png', BASE + 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Eigen bestanden: network-first, fallback cache (offline = cache)
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else if (e.request.method === 'GET') {
    // Extern (Material Web, fonts): cache-first voor offline (alleen GET)
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      }))
    );
  }
});
