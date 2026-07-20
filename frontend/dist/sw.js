/* Service Worker – App-Shell-Cache, netzwerk-first für API. */
var CACHE = 'anwesenheit-neo-v1';
var SHELL = ['/', '/index.html', '/css/app.css', '/js/api.js', '/js/app.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }),
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // API, Manifest, Uploads, Socket.IO immer aus dem Netz (keine Auth-Caches).
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/internal/') === 0 ||
      url.pathname === '/manifest.json' || url.pathname.indexOf('/uploads/') === 0 ||
      url.pathname.indexOf('/socket.io/') === 0) {
    return;
  }

  // App-Shell: Cache-first mit Netz-Fallback.
  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return caches.match('/index.html'); });
    }),
  );
});
