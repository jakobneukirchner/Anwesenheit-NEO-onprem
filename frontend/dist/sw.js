/* Service Worker – App-Shell netzwerk-first (Updates sofort), Offline-Fallback aus Cache. */
var CACHE = 'anwesenheit-neo-v2';
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

  // App-Shell (Navigation + statische Assets): Netz-first, Cache aktualisieren,
  // bei Offline aus dem Cache liefern. So erhalten Installationen sofort Updates.
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && url.origin === self.location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        return cached || (req.mode === 'navigate' ? caches.match('/index.html') : undefined);
      });
    }),
  );
});
