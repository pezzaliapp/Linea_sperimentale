// Service Worker per La Linea — PWA
const CACHE = 'la-linea-v3'; // bump versione quando cambi asset
const ASSETS = [
  '/',            // root
  '/index.html',
  '/app.js',
  '/manifest.json',
  // aggiungi qui eventuali icone: '/icons/icon-192.png', '/icons/icon-512.png', ...
];

// Install: precache asset noti
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: rimuovi cache vecchie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Strategy helpers
const isNavigation = (req) =>
  req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));

const isStaticAsset = (url) => {
  // adatta se hai sottocartelle
  return url.origin === self.location.origin && (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    ASSETS.includes(url.pathname) || ASSETS.includes(url.pathname + '/')
  );
};

// Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) Navigazioni: Network-first con fallback offline a index.html (SPA)
  if (isNavigation(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        // opzionale: aggiorna cache di index.html per next time
        const cache = await caches.open(CACHE);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // 2) Statici di prima parte: Stale-While-Revalidate
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const network = fetch(request).then((resp) => {
        if (resp && resp.status === 200) cache.put(request, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || network || Response.error();
    })());
    return;
  }

  // 3) Tutto il resto: cache-first con fallback rete
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    return cached || fetch(request).catch(() => cached || Response.error());
  })());
});
