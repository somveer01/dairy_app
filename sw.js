const CACHE_NAME = 'dairy-pwa-1789152428945';
const CORE_ASSETS = [
  '/dairy_app/',
  '/dairy_app/index.html',
  '/dairy_app/card.html',
  '/dairy_app/manifest.json',
  '/dairy_app/manifest-card.json',
  '/dairy_app/favicon.ico',
  '/dairy_app/assets/icon-192.png',
  '/dairy_app/assets/icon-512.png',
  '/dairy_app/assets/icon.png',
  '/dairy_app/_expo/static/js/web/index-d38bcec42aee0b9a66a8d239f8eaa665.js',
  '/dairy_app/_expo/static/js/web/jszip-2a67ffc103fc39ffd63659cab1624a9c.js'
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
  const url = new URL(e.request.url);

  // Handle WhatsApp / Android Web Share Target POST request
  if (e.request.method === 'POST' && url.pathname.includes('/share-target/')) {
    e.respondWith((async () => {
      try {
        const formData = await e.request.formData();
        const file = formData.get('file');
        const text = formData.get('text') || '';

        const cache = await caches.open('dairy-shared-cache');
        if (file && typeof file !== 'string') {
          const headers = new Headers();
          headers.append('X-Shared-Filename', encodeURIComponent(file.name || 'whatsapp_chat.txt'));
          headers.append('Content-Type', file.type || 'application/octet-stream');
          await cache.put('/dairy_app/last-shared-file', new Response(file, { headers }));
        } else if (text) {
          const headers = new Headers();
          headers.append('X-Shared-Filename', encodeURIComponent('whatsapp_chat.txt'));
          headers.append('Content-Type', 'text/plain');
          await cache.put('/dairy_app/last-shared-file', new Response(text, { headers }));
        }
      } catch (err) {
        console.error('Share target handling error:', err);
      }
      return Response.redirect('/dairy_app/?action=whatsapp_share', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;

  // For HTML navigation requests: Cache-first with background network revalidation (Stale-While-Revalidate)
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      caches.match('/dairy_app/index.html').then((cached) => {
        const networkFetch = fetch(e.request)
          .then((res) => {
            if (res && res.status === 200) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
            }
            return res;
          })
          .catch(() => cached);
        // Instant load from cache if available, else wait for network
        return cached || networkFetch;
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