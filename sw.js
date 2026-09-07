const CACHE_NAME = 'dairy-pwa-v3';
const CORE_ASSETS = [
  '/dairy_app/',
  '/dairy_app/index.html',
  '/dairy_app/training.html',
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
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
        return caches.match(e.request).then(m => {
          if (m) return m;
          if (e.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/dairy_app/index.html');
          }
        });
      })
  );
});