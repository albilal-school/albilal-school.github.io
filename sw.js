// Al-Bilal service worker: caches the app shell so it works fully offline.
const CACHE = 'albilal-v8';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './dash.js', './notes.js', './chat.js', './ann.js', './qr_app_url.png', './manifest.webmanifest', './vendor/chart.umd.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-192-maskable.png', './icons/icon-512-maskable.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // sync POSTs go straight to network
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // don't touch Google Apps Script calls
  e.respondWith(
    caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
