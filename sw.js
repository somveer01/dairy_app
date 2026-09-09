const CACHE_NAME = 'dairy-pwa-1788927191931';
const CORE_ASSETS = [
  '/dairy_app/',
  '/dairy_app/index.html',
  '/dairy_app/manifest.json',
  '/dairy_app/favicon.ico',
  '/dairy_app/assets/icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // For HTML navigation requests: NETWORK FIRST, fallback to cache when offline
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => {
          return caches.match('/dairy_app/index.html').then(m => m || caches.match('/dairy_app/'));
        })
    );
    return;
  }

  // For static assets (JS bundles, images, fonts): Cache-first with network fallback and background refresh
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate in background
        fetch(e.request)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(CACHE_NAME).then(c => c.put(e.request, res));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});