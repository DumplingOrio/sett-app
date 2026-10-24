/* Sett service worker — offline cache + auto-update.
   Bump CACHE on every release so old assets are dropped.
   Confirmed release: clean CACHE string, no -bN suffix (the -b1/-b2/-b3 test
   builds of plate calc + consistency were confirmed on device 2026-07-09).
   For an UNCONFIRMED test build, append -bN and leave APP_VERSION untouched
   (sett-change-control confirmed-only law). */
const CACHE = 'sett-v0.9.38-b2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './exercises.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
/* S8 (M3 gym-proof, 2026-10-24): exercise photos live in their OWN cache that a
   version bump does NOT drop. They never change, and before this every release
   wiped them, so a fresh update left the gym with no pictures offline. The page
   asks for the user's own library up front ('precacheImgs'); any other photo
   is still saved the first time it's viewed online. Bump the -vN only if the
   photo set itself is ever replaced. */
const IMG_CACHE = 'sett-img-v1';
const IMG_RE = /\/exercises\/[^/]+\/[01]\.jpg$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

/* Let the page trigger activation of a freshly-installed worker. */
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  else if (e.data && e.data.type === 'precacheImgs' && Array.isArray(e.data.urls))
    e.waitUntil(precacheImgs(e.data.urls, e.source));
});

/* S8: fetch every library photo not already saved, one at a time (gentle on a
   phone). Offline mid-way → stop; the next open carries on. Replies with how
   many of the library's photos are now saved, for Settings → Your data. */
async function precacheImgs(urls, client) {
  const c = await caches.open(IMG_CACHE);
  let have = 0;
  for (const u of urls) {
    if (await c.match(u)) { have++; continue; }
    try {
      const res = await fetch(u);
      if (res.ok) { await c.put(u, res); have++; }
    } catch (err) { break; }
  }
  if (client && client.postMessage) client.postMessage({ type: 'imgStatus', have, total: urls.length });
}

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first so a new deploy is picked up on the next online open;
   cache fallback keeps the app working offline at the gym. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  /* S8: photos are cache-first from the photo cache (they never change); a miss
     goes to the network and is kept. Offline with no copy → a plain 404, so the
     <img> fails like a missing picture instead of receiving index.html. */
  if (url.origin === location.origin && IMG_RE.test(url.pathname)) {
    e.respondWith(caches.open(IMG_CACHE).then(c =>
      c.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)
        .then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })
        .catch(() => new Response('', { status: 404, statusText: 'offline' })))));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      /* S8: only a page load falls back to the app shell — any other miss
         (a script, a file) gets an honest 504 instead of index.html */
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || (e.request.mode === 'navigate'
          ? caches.match('./index.html')
          : new Response('', { status: 504, statusText: 'offline' }))))
  );
});
