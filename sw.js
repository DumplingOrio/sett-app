/* Sett service worker — offline cache + auto-update.
   Bump CACHE on every release so old assets are dropped.
   Confirmed release: clean CACHE string, no -bN suffix (the -b1/-b2/-b3 test
   builds of plate calc + consistency were confirmed on device 2026-07-09).
   For an UNCONFIRMED test build, append -bN and leave APP_VERSION untouched
   (sett-change-control confirmed-only law). */
const CACHE = 'sett-v0.9.36-b2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './exercises.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

/* Let the page trigger activation of a freshly-installed worker. */
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first so a new deploy is picked up on the next online open;
   cache fallback keeps the app working offline at the gym. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || caches.match('./index.html')))
  );
});
