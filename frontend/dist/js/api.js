/* Zentraler API-Client mit automatischem Refresh-Token-Retry. */
(function () {
  'use strict';

  let refreshing = null;

  async function request(method, path, body, opts) {
    opts = opts || {};
    const init = {
      method: method,
      credentials: 'same-origin',
      headers: {},
    };
    if (body !== undefined && !(body instanceof FormData)) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      init.body = body;
    }

    // /internal/* wird ohne /api-Präfix gemountet.
    var url = path.indexOf('/internal') === 0 ? path : '/api' + path;
    let res = await fetch(url, init);

    // Bei 401 einmalig Refresh versuchen (außer für Auth-Endpunkte selbst).
    if (res.status === 401 && !opts._retried && !path.startsWith('/auth/')) {
      const ok = await tryRefresh();
      if (ok) {
        return request(method, path, body, Object.assign({}, opts, { _retried: true }));
      }
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = text; }
    }
    if (!res.ok) {
      const message = (data && data.error) || 'Fehler ' + res.status;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function tryRefresh() {
    if (!refreshing) {
      refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
        .then(function (r) { return r.ok; })
        .catch(function () { return false; })
        .then(function (ok) { refreshing = null; return ok; });
    }
    return refreshing;
  }

  window.API = {
    get: function (p, opts) { return request('GET', p, undefined, opts); },
    post: function (p, b, opts) { return request('POST', p, b, opts); },
    put: function (p, b, opts) { return request('PUT', p, b, opts); },
    patch: function (p, b, opts) { return request('PATCH', p, b, opts); },
    del: function (p, opts) { return request('DELETE', p, undefined, opts); },
    // Roher Zugriff für nicht-/api Pfade (z. B. /reports Export)
    raw: function (path) { return fetch(path, { credentials: 'same-origin' }); },
  };
})();
