const fs = require('fs');

const manifest = {
  short_name: 'DairyApp',
  name: 'Dairy Milk Supplier Register',
  description: 'Daily milk register, billing, and customer management for milk suppliers',
  icons: [
    {
      src: '/dairy_app/assets/icon.png',
      type: 'image/png',
      sizes: '192x192'
    },
    {
      src: '/dairy_app/assets/icon.png',
      type: 'image/png',
      sizes: '512x512'
    }
  ],
  start_url: '/dairy_app/',
  background_color: '#16a34a',
  theme_color: '#16a34a',
  display: 'standalone',
  orientation: 'portrait',
  scope: '/dairy_app/'
};

fs.writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));

if (fs.existsSync('assets/icon.png')) {
  fs.copyFileSync('assets/icon.png', 'dist/assets/icon.png');
}

fs.writeFileSync('dist/.nojekyll', '');

let html = fs.readFileSync('dist/index.html', 'utf8');

// Ensure viewport-fit=cover
if (!html.includes('viewport-fit=cover')) {
  html = html.replace('shrink-to-fit=no', 'shrink-to-fit=no, viewport-fit=cover');
}

// Clean meta tags
html = html.replace(/<link rel= manifest[^>]*>/g, '');
html = html.replace(/<meta name=theme-color[^>]*>/g, '');
html = html.replace(/<meta name=apple-mobile-web-app-capable[^>]*>/g, '');
html = html.replace(/<meta name=apple-mobile-web-app-status-bar-style[^>]*>/g, '');

const pwaTags = [
  '  <link rel= manifest href=/dairy_app/manifest.json/>',
  '  <meta name=theme-color content=#16a34a/>',
  '  <meta name=apple-mobile-web-app-capable content=yes/>',
  '  <meta name=apple-mobile-web-app-status-bar-style content=black-translucent/>',
  '</head>'
].join('\n');

html = html.replace('</head>', pwaTags);

fs.writeFileSync('dist/index.html', html);
console.log('Post build cleaned and verified.');
