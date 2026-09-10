const fs = require('fs');
const path = require('path');

// 1. Web App Manifest
const manifest = {
  short_name: 'DairyApp',
  name: 'Dairy Milk Supplier Register',
  description: 'Daily milk register, billing, and customer management for milk suppliers',
  id: '/dairy_app/',
  icons: [
    {
      src: '/dairy_app/assets/icon.png',
      type: 'image/png',
      sizes: '192x192',
      purpose: 'any maskable'
    },
    {
      src: '/dairy_app/assets/icon.png',
      type: 'image/png',
      sizes: '512x512',
      purpose: 'any maskable'
    }
  ],
  start_url: '/dairy_app/',
  background_color: '#ffffff',
  theme_color: '#0284c7',
  display: 'standalone',
  orientation: 'portrait',
  scope: '/dairy_app/',
  share_target: {
    action: '/dairy_app/share-target/',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: {
      title: 'title',
      text: 'text',
      files: [
        {
          name: 'file',
          accept: ['.txt', '.zip', 'text/plain', 'application/zip']
        }
      ]
    }
  }
};

fs.writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));

// 2. Copy App Icon & .nojekyll
if (fs.existsSync('assets/icon.png')) {
  if (!fs.existsSync('dist/assets')) fs.mkdirSync('dist/assets', { recursive: true });
  fs.copyFileSync('assets/icon.png', 'dist/assets/icon.png');
}
if (fs.existsSync('assets/training.html')) {
  fs.copyFileSync('assets/training.html', 'dist/training.html');
}
if (fs.existsSync('assets/card.html')) {
  fs.copyFileSync('assets/card.html', 'dist/card.html');
}
if (fs.existsSync('assets/manifest-card.json')) {
  fs.copyFileSync('assets/manifest-card.json', 'dist/manifest-card.json');
}
fs.writeFileSync('dist/.nojekyll', '');

// 3. PWA Service Worker (dist/sw.js)
const BUILD_TIME = Date.now();
const CACHE_NAME = `dairy-pwa-${BUILD_TIME}`;

const swContent = `
const CACHE_NAME = '${CACHE_NAME}';
const CORE_ASSETS = [
  '/dairy_app/',
  '/dairy_app/index.html',
  '/dairy_app/card.html',
  '/dairy_app/manifest.json',
  '/dairy_app/manifest-card.json',
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
`;
fs.writeFileSync('dist/sw.js', swContent.trim());

// 4. Update index.html
let html = fs.readFileSync('dist/index.html', 'utf8');

// Use standard viewport so UI does NOT get hidden under Android 3-button navigation bar (Back/Home/Recents)
html = html.replace(/<meta name="viewport"[^>]*>/i, '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />');

// Clean existing PWA head tags
html = html.replace(/<link rel="manifest"[^>]*>/g, '');
html = html.replace(/<link rel= manifest[^>]*>/g, '');
html = html.replace(/<meta name="theme-color"[^>]*>/g, '');
html = html.replace(/<meta name=theme-color[^>]*>/g, '');
html = html.replace(/<meta name="apple-mobile-web-app-capable"[^>]*>/g, '');
html = html.replace(/<meta name=apple-mobile-web-app-capable[^>]*>/g, '');
html = html.replace(/<meta name="apple-mobile-web-app-status-bar-style"[^>]*>/g, '');
html = html.replace(/<meta name=apple-mobile-web-app-status-bar-style[^>]*>/g, '');

const pwaHead = `  <link rel="manifest" href="/dairy_app/manifest.json"/>
  <meta name="theme-color" content="#0284c7"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
</head>`;

html = html.replace('</head>', pwaHead);

// Remove old banner or install script if previously inserted
html = html.replace(/<!-- PWA Install Banner -->[\s\S]*?<\/script>\s*<\/body>/, '</body>');

// Install Banner and ServiceWorker script
const pwaBody = `
  <!-- PWA Install Banner -->
  <div id="pwa-install-banner" style="display:none; position:fixed; top:12px; left:12px; right:12px; z-index:999999; background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; padding:10px 14px; border-radius:14px; box-shadow:0 6px 20px rgba(0,0,0,0.25); font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; align-items:center; justify-content:space-between;">
    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
      <img src="/dairy_app/assets/icon.png" style="width:38px; height:38px; border-radius:9px; background:#fff; flex-shrink:0;" alt="Icon"/>
      <div style="min-width:0;">
        <div style="font-weight:bold; font-size:13px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Dairy Milk App</div>
        <div style="font-size:11px; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Tap to install on Phone Home Screen</div>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
      <button id="pwa-install-btn" style="background:#ffffff; color:#0284c7; border:none; padding:7px 14px; border-radius:8px; font-weight:bold; font-size:12px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.15);">
        📲 Install
      </button>
      <button id="pwa-dismiss-btn" style="background:transparent; border:none; color:#ffffff; font-size:16px; cursor:pointer; padding:4px 6px;">✕</button>
    </div>
  </div>

  <script>
    // PWA Install Prompt Handler
    window.pwaDeferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      window.pwaDeferredPrompt = e;
      var banner = document.getElementById('pwa-install-banner');
      if (banner && !sessionStorage.getItem('pwa_banner_dismissed')) {
        banner.style.display = 'flex';
      }
    });

    function initPwaBanner() {
      var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true ||
                         document.referrer.includes('android-app://');

      var banner = document.getElementById('pwa-install-banner');
      var installBtn = document.getElementById('pwa-install-btn');
      var dismissBtn = document.getElementById('pwa-dismiss-btn');

      if (banner && !isStandalone && !sessionStorage.getItem('pwa_banner_dismissed')) {
        banner.style.display = 'flex';
      }

      if (installBtn) {
        installBtn.addEventListener('click', function() {
          if (window.pwaDeferredPrompt) {
            window.pwaDeferredPrompt.prompt();
            window.pwaDeferredPrompt.userChoice.then(function(choice) {
              if (choice.outcome === 'accepted') {
                if (banner) banner.style.display = 'none';
              }
              window.pwaDeferredPrompt = null;
            });
          } else {
            alert('📲 Dairy App Installation Steps:\\n\\n🤖 Android (Chrome):\\n1. Tap 3 dots (⋮) in Chrome\\n2. Tap "Install app" or "Add to Home screen"\\n3. Confirm Install\\n\\n🍎 iPhone (Safari):\\n1. Tap Share (⎋) in Safari\\n2. Tap "Add to Home Screen"\\n3. Tap "Add"');
          }
        });
      }

      if (dismissBtn) {
        dismissBtn.addEventListener('click', function() {
          if (banner) banner.style.display = 'none';
          sessionStorage.setItem('pwa_banner_dismissed', '1');
        });
      }

      window.addEventListener('appinstalled', function() {
        if (banner) banner.style.display = 'none';
        window.pwaDeferredPrompt = null;
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPwaBanner);
    } else {
      initPwaBanner();
    }

    // Register Service Worker for PWA installability with immediate update detection
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/dairy_app/sw.js', { scope: '/dairy_app/', updateViaCache: 'none' })
          .then(function(reg) {
            console.log('Dairy PWA ServiceWorker active with scope:', reg.scope);

            // Proactively check for updates immediately on launch
            reg.update();

            // Re-check for updates whenever user switches back to the app
            document.addEventListener('visibilitychange', function() {
              if (document.visibilityState === 'visible') {
                reg.update();
              }
            });

            // If a new update is found, activate it right away
            reg.addEventListener('updatefound', function() {
              var newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', function() {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    newWorker.postMessage({ action: 'skipWaiting' });
                  }
                });
              }
            });
          })
          .catch(function(err) {
            console.log('ServiceWorker registration error:', err);
          });

        // Automatically reload once when the new version takes control
        var refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', function() {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      });
    }
  </script>
</body>`;

html = html.replace('</body>', pwaBody);

fs.writeFileSync('dist/index.html', html);
console.log('PWA build post-processing complete!');
