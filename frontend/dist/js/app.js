/* Anwesenheit NEO – Material Design 3 SPA (vanilla, kein Framework). */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var state = { me: null, branding: null };

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'html') el.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function icon(name) { return h('span', { class: 'material-symbols-outlined' }, [name]); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function esc(s) { return String(s == null ? '' : s); }

  var snackEl = document.getElementById('snackbar');
  var snackTimer = null;
  function snack(msg, isError) {
    snackEl.textContent = msg;
    snackEl.className = 'snackbar show' + (isError ? ' error' : '');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(function () { snackEl.className = 'snackbar'; }, 3500);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return iso; }
  }

  function dialog(title, contentNodes, actions) {
    var scrim = h('div', { class: 'dialog-scrim' });
    function close() { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); }
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    var d = h('div', { class: 'dialog' }, [h('h2', {}, [title])]);
    contentNodes.forEach(function (n) { d.appendChild(n); });
    var act = h('div', { class: 'dialog-actions' });
    (actions || []).forEach(function (a) { act.appendChild(a); });
    d.appendChild(act);
    scrim.appendChild(d);
    document.body.appendChild(scrim);
    return { close: close, el: d };
  }

  // ---------------------------------------------------------------------------
  // Branding / Theme
  // ---------------------------------------------------------------------------
  function applyBranding(b) {
    state.branding = b;
    if (b.primaryColor) {
      document.documentElement.style.setProperty('--md-primary', b.primaryColor);
      var meta = document.getElementById('theme-color-meta');
      if (meta) meta.setAttribute('content', b.primaryColor);
    }
    if (b.faviconUrl) {
      var fav = document.getElementById('favicon-link');
      if (fav) fav.setAttribute('href', b.faviconUrl);
    }
    var mode = b.themeMode || 'system';
    var dark = mode === 'dark' || (mode === 'system' &&
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.title = b.appName || 'Anwesenheit NEO';
  }

  // ---------------------------------------------------------------------------
  // Auth-Views
  // ---------------------------------------------------------------------------
  function renderAuth(mode) {
    clear(app);
    var b = state.branding || {};
    var tab = mode || 'login';

    var brandBox = h('div', { class: 'brand' }, [
      b.logoUrl ? h('img', { src: b.logoUrl, alt: 'Logo' }) : icon('event_available'),
      h('h1', {}, [b.appName || 'Anwesenheit NEO']),
    ]);

    var tabs = h('div', { class: 'auth-tabs' }, [
      h('button', { class: tab === 'login' ? 'active' : '', onclick: function () { renderAuth('login'); } }, ['Anmelden']),
      h('button', { class: tab === 'register' ? 'active' : '', onclick: function () { renderAuth('register'); } }, ['Registrieren']),
    ]);

    var form = tab === 'login' ? loginForm() : registerForm();
    var card = h('div', { class: 'card auth-card' }, [brandBox, tabs, form]);
    app.appendChild(h('div', { class: 'auth-wrap' }, [card]));
  }

  function fieldInput(label, name, type, value) {
    var input = h('input', { name: name, type: type || 'text', value: value || '' });
    return { wrap: h('div', { class: 'field' }, [h('label', {}, [label]), input]), input: input };
  }

  function loginForm() {
    var id = fieldInput('Name oder E-Mail', 'identifier');
    var pw = fieldInput('Passwort', 'password', 'password');
    var err = h('div', { class: 'error-text' });
    var btn = h('button', { class: 'btn', type: 'submit' }, [icon('login'), 'Anmelden']);
    var form = h('form', {}, [id.wrap, pw.wrap, err, h('div', { class: 'row' }, [btn])]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      API.post('/auth/login', { identifier: id.input.value.trim(), password: pw.input.value })
        .then(function () { return boot(); })
        .catch(function (ex) { err.textContent = ex.message; btn.disabled = false; });
    });
    return form;
  }

  function registerForm() {
    var code = fieldInput('Registrierungscode (AA11-B2B2-C33C-44DD)', 'code');
    var name = fieldInput('Name', 'name');
    var email = fieldInput('E-Mail (optional)', 'email', 'email');
    var pw = fieldInput('Passwort (min. 8 Zeichen)', 'password', 'password');
    var err = h('div', { class: 'error-text' });
    var btn = h('button', { class: 'btn', type: 'submit' }, [icon('person_add'), 'Konto erstellen']);
    var form = h('form', {}, [code.wrap, name.wrap, email.wrap, pw.wrap, err, h('div', { class: 'row' }, [btn])]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      API.post('/auth/register', {
        code: code.input.value.trim().toUpperCase(),
        name: name.input.value.trim(),
        email: email.input.value.trim() || undefined,
        password: pw.input.value,
      })
        .then(function () { return boot(); })
        .catch(function (ex) { err.textContent = ex.message; btn.disabled = false; });
    });
    return form;
  }

  // ---------------------------------------------------------------------------
  // Navigation nach Rolle
  // ---------------------------------------------------------------------------
  function navFor(role) {
    var items = [
      { id: 'dashboard', label: 'Start', icon: 'dashboard' },
      { id: 'events', label: 'Termine', icon: 'calendar_month' },
      { id: 'chat', label: 'Chat', icon: 'chat' },
      { id: 'messages', label: 'Nachrichten', icon: 'campaign' },
    ];
    var admin = role === 'admin' || role === 'coordinator' || role === 'suad';
    if (admin) {
      items.push({ id: 'users', label: 'Nutzer', icon: 'group' });
      items.push({ id: 'groups', label: 'Gruppen', icon: 'groups' });
      items.push({ id: 'codes', label: 'Codes', icon: 'qr_code_2' });
      items.push({ id: 'stats', label: 'Statistik', icon: 'bar_chart' });
      items.push({ id: 'branding', label: 'Branding', icon: 'palette' });
      items.push({ id: 'system', label: 'System', icon: 'monitoring' });
    }
    if (role === 'teacher') items.push({ id: 'stats', label: 'Statistik', icon: 'bar_chart' });
    if (role === 'suad') items.push({ id: 'suad', label: 'Intern', icon: 'admin_panel_settings' });
    items.push({ id: 'profile', label: 'Profil', icon: 'account_circle' });
    return items;
  }

  // ---------------------------------------------------------------------------
  // App-Shell
  // ---------------------------------------------------------------------------
  var currentView = 'dashboard';

  function renderShell() {
    clear(app);
    var b = state.branding || {};
    var me = state.me;
    var items = navFor(me.role);

    var rail = h('div', { class: 'rail' });
    items.forEach(function (it) {
      var el = h('button', {
        class: 'rail-item' + (it.id === currentView ? ' active' : ''),
        onclick: function () { navigate(it.id); },
      }, [h('span', { class: 'ind' }, [icon(it.icon)]), it.label]);
      rail.appendChild(el);
    });

    var appbar = h('div', { class: 'appbar' }, [
      b.logoUrl ? h('img', { class: 'logo', src: b.logoUrl, alt: '' }) : icon('event_available'),
      h('div', { class: 'title' }, [b.appName || 'Anwesenheit NEO']),
      h('span', { class: 'chip' }, [me.role]),
      h('button', { class: 'icon-btn', title: 'Abmelden', onclick: logout }, [icon('logout')]),
    ]);

    var content = h('div', { class: 'content', id: 'view' });
    var main = h('div', { class: 'main' }, [appbar, content]);
    app.appendChild(h('div', { class: 'shell' }, [rail, main]));
    renderView();
  }

  function navigate(view) {
    currentView = view;
    location.hash = '#/' + view;
    renderShell();
  }

  function viewNode() { return document.getElementById('view'); }

  function loading(node) {
    clear(node);
    node.appendChild(h('div', { class: 'empty' }, [icon('hourglass_empty'), h('div', {}, ['Laden…'])]));
  }
  function showError(node, ex) {
    clear(node);
    node.appendChild(h('div', { class: 'empty' }, [
      icon('error'),
      h('div', {}, [ex && ex.status === 403 ? 'Keine Berechtigung.' : (ex ? ex.message : 'Fehler')]),
    ]));
  }

  function sectionHead(title, actions) {
    var head = h('div', { class: 'section-head' }, [h('h2', {}, [title]), h('div', { class: 'spacer' })]);
    (actions || []).forEach(function (a) { head.appendChild(a); });
    return head;
  }

  function renderView() {
    var node = viewNode();
    var map = {
      dashboard: viewDashboard, events: viewEvents, chat: viewChat, messages: viewMessages,
      users: viewUsers, groups: viewGroups, codes: viewCodes, stats: viewStats,
      branding: viewBranding, system: viewSystem, suad: viewSuad, profile: viewProfile,
    };
    (map[currentView] || viewDashboard)(node);
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------
  function viewDashboard(node) {
    clear(node);
    node.appendChild(sectionHead('Willkommen, ' + esc(state.me.name)));
    loading(node);
    API.get('/events?from=' + encodeURIComponent(new Date().toISOString())).then(function (events) {
      clear(node);
      node.appendChild(sectionHead('Willkommen, ' + esc(state.me.name)));
      var grid = h('div', { class: 'grid' });

      var upcoming = (events || []).slice(0, 5);
      var evCard = h('div', { class: 'card' }, [h('h3', {}, ['Nächste Termine'])]);
      if (!upcoming.length) evCard.appendChild(h('div', { class: 'muted' }, ['Keine anstehenden Termine.']));
      upcoming.forEach(function (ev) {
        evCard.appendChild(h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--md-outline-variant)' }, [
          icon('event'), h('div', {}, [h('div', {}, [esc(ev.title)]), h('div', { class: 'muted' }, [fmtDate(ev.startAt)])]),
        ]));
      });
      grid.appendChild(evCard);

      grid.appendChild(h('div', { class: 'card' }, [
        h('h3', {}, ['Konto']),
        h('div', { class: 'row' }, [h('span', { class: 'chip' }, [state.me.role])]),
        h('p', { class: 'muted' }, [(state.me.groups || []).length + ' Gruppe(n)']),
      ]));

      node.appendChild(grid);
    }).catch(function (ex) { showError(node, ex); });
  }

  // ---------------------------------------------------------------------------
  // Termine + Anwesenheit
  // ---------------------------------------------------------------------------
  function attendanceButtons(ev) {
    var wrap = h('div', { class: 'row' });
    function act(path, body, label) {
      return API.post('/events/' + ev.id + path, body || {})
        .then(function () { snack(label + ' gespeichert'); navigate('events'); })
        .catch(function (ex) { snack(ex.message, true); });
    }
    if (ev.mode === 'open') {
      wrap.appendChild(h('button', { class: 'btn tonal', onclick: function () { act('/attendance', { status: 'registered' }, 'Anmeldung'); } }, [icon('check'), 'Anmelden']));
      wrap.appendChild(h('button', { class: 'btn outlined', onclick: function () { act('/attendance', { status: 'withdrawn' }, 'Abmeldung'); } }, [icon('close'), 'Abmelden']));
    } else if (ev.mode === 'request') {
      wrap.appendChild(h('button', { class: 'btn tonal', onclick: function () { act('/attendance', { status: 'requested' }, 'Anfrage'); } }, [icon('front_hand'), 'Teilnahme anfragen']));
    } else {
      wrap.appendChild(h('span', { class: 'chip' }, ['Geschlossen']));
    }
    return wrap;
  }

  function viewEvents(node) {
    clear(node);
    var canManage = ['admin', 'coordinator', 'teacher', 'suad'].indexOf(state.me.role) >= 0;
    var actions = [];
    if (canManage) actions.push(h('button', { class: 'btn', onclick: eventDialog }, [icon('add'), 'Termin']));
    node.appendChild(sectionHead('Termine', actions));
    loading(node);
    API.get('/events').then(function (events) {
      clear(node);
      node.appendChild(sectionHead('Termine', actions));
      if (!events || !events.length) { node.appendChild(h('div', { class: 'empty' }, [icon('calendar_month'), h('div', {}, ['Keine Termine.'])])); return; }
      var stack = h('div', { class: 'stack' });
      events.forEach(function (ev) {
        var card = h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', { style: 'flex:1;margin:0' }, [esc(ev.title)]),
            h('span', { class: 'chip' }, [ev.mode]),
          ]),
          h('div', { class: 'muted' }, [fmtDate(ev.startAt) + (ev.location ? ' · ' + esc(ev.location) : '')]),
          ev.description ? h('p', {}, [esc(ev.description)]) : null,
          ev.isCancelled ? h('div', { class: 'error-text' }, ['Ausgefallen: ' + esc(ev.cancelReason || '')]) : attendanceButtons(ev),
        ]);
        stack.appendChild(card);
      });
      node.appendChild(stack);
    }).catch(function (ex) { showError(node, ex); });
  }

  function eventDialog() {
    var title = fieldInput('Titel', 'title');
    var start = fieldInput('Beginn', 'startAt', 'datetime-local');
    var end = fieldInput('Ende', 'endAt', 'datetime-local');
    var loc = fieldInput('Ort (optional)', 'location');
    var descWrap = h('div', { class: 'field' }, [h('label', {}, ['Beschreibung']), h('textarea', { name: 'description', rows: '2' })]);
    var modeSel = h('select', { name: 'mode' }, [
      h('option', { value: 'open' }, ['Offen']),
      h('option', { value: 'request' }, ['Auf Anfrage']),
      h('option', { value: 'closed' }, ['Geschlossen']),
    ]);
    var group = fieldInput('Gruppen-ID', 'groupId');
    var err = h('div', { class: 'error-text' });
    var d;
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () {
      err.textContent = '';
      API.post('/events', {
        title: title.input.value.trim(),
        startAt: start.input.value ? new Date(start.input.value).toISOString() : undefined,
        endAt: end.input.value ? new Date(end.input.value).toISOString() : undefined,
        location: loc.input.value.trim() || undefined,
        description: descWrap.querySelector('textarea').value.trim() || undefined,
        mode: modeSel.value,
        groupId: group.input.value.trim(),
      }).then(function () { d.close(); snack('Termin erstellt'); navigate('events'); })
        .catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog('Neuer Termin', [
      title.wrap, start.wrap, end.wrap, loc.wrap, descWrap,
      h('div', { class: 'field' }, [h('label', {}, ['Modus']), modeSel]),
      group.wrap, err,
    ], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------
  function viewChat(node) {
    clear(node);
    node.appendChild(sectionHead('Chat'));
    loading(node);
    API.get('/chat/rooms').then(function (rooms) {
      clear(node);
      node.appendChild(sectionHead('Chat'));
      if (!rooms || !rooms.length) { node.appendChild(h('div', { class: 'empty' }, [icon('chat'), h('div', {}, ['Keine Chats.'])])); return; }
      var stack = h('div', { class: 'stack' });
      rooms.forEach(function (r) {
        var names = (r.participants || []).map(function (p) { return p.name; }).join(', ');
        stack.appendChild(h('div', { class: 'card', style: 'cursor:pointer', onclick: function () { openRoom(r); } }, [
          h('div', { class: 'row' }, [icon(r.type === 'group' ? 'groups' : 'person'),
            h('div', {}, [h('div', {}, [esc(r.name || names)]), h('div', { class: 'muted' }, [names])])]),
        ]));
      });
      node.appendChild(stack);
    }).catch(function (ex) { showError(node, ex); });
  }

  function openRoom(room) {
    var list = h('div', { class: 'stack', style: 'max-height:50vh;overflow-y:auto' });
    var input = h('input', { placeholder: 'Nachricht…', style: 'flex:1' });
    var d = dialog(room.name || 'Chat', [list, h('div', { class: 'row' }, [input,
      h('button', { class: 'btn', onclick: send }, [icon('send')])])], [
      h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Schließen'])]);

    function load() {
      API.get('/chat/rooms/' + room.id + '/messages').then(function (msgs) {
        clear(list);
        (msgs || []).forEach(function (m) {
          list.appendChild(h('div', {}, [h('span', { class: 'muted' }, [esc(m.senderName) + ': ']),
            m.deleted ? h('em', { class: 'muted' }, ['(gelöscht)']) : esc(m.body)]));
        });
        list.scrollTop = list.scrollHeight;
      });
    }
    function send() {
      var body = input.value.trim();
      if (!body || !window.chatSocket) return;
      window.chatSocket.emit('chat:message', { roomId: room.id, body: body });
      input.value = '';
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    if (window.chatSocket) {
      window.chatSocket.emit('chat:join', room.id);
      window.chatSocket.on('chat:message', function (m) { if (m.roomId === room.id) load(); });
    }
    load();
  }

  // ---------------------------------------------------------------------------
  // Systemnachrichten
  // ---------------------------------------------------------------------------
  function viewMessages(node) {
    clear(node);
    var canManage = ['admin', 'coordinator', 'suad'].indexOf(state.me.role) >= 0;
    var actions = canManage ? [h('button', { class: 'btn', onclick: messageDialog }, [icon('add'), 'Nachricht'])] : [];
    node.appendChild(sectionHead('Systemnachrichten', actions));
    loading(node);
    API.get('/messages').then(function (msgs) {
      clear(node);
      node.appendChild(sectionHead('Systemnachrichten', actions));
      if (!msgs || !msgs.length) { node.appendChild(h('div', { class: 'empty' }, [icon('campaign'), h('div', {}, ['Keine Nachrichten.'])])); return; }
      var stack = h('div', { class: 'stack' });
      msgs.forEach(function (m) {
        stack.appendChild(h('div', { class: 'card' }, [
          h('h3', {}, [esc(m.title)]),
          h('p', {}, [esc(m.body)]),
          h('div', { class: 'row' }, [
            h('button', { class: 'btn text', onclick: function () { API.post('/messages/' + m.id + '/dismiss', {}).then(function () { snack('Ausgeblendet'); navigate('messages'); }); } }, [icon('visibility_off'), 'Ausblenden']),
          ]),
        ]));
      });
      node.appendChild(stack);
    }).catch(function (ex) { showError(node, ex); });
  }

  function messageDialog() {
    var title = fieldInput('Titel', 'title');
    var bodyWrap = h('div', { class: 'field' }, [h('label', {}, ['Text']), h('textarea', { rows: '3' })]);
    var err = h('div', { class: 'error-text' });
    var d;
    var save = h('button', { class: 'btn' }, [icon('save'), 'Senden']);
    save.addEventListener('click', function () {
      API.post('/messages', { title: title.input.value.trim(), body: bodyWrap.querySelector('textarea').value.trim() })
        .then(function () { d.close(); snack('Nachricht erstellt'); navigate('messages'); })
        .catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog('Neue Systemnachricht', [title.wrap, bodyWrap, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Nutzerverwaltung
  // ---------------------------------------------------------------------------
  function viewUsers(node) {
    clear(node);
    node.appendChild(sectionHead('Nutzerverwaltung'));
    loading(node);
    API.get('/users').then(function (users) {
      clear(node);
      node.appendChild(sectionHead('Nutzerverwaltung'));
      var table = h('table', {}, [h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Name']), h('th', {}, ['Rolle']), h('th', {}, ['Status']),
        h('th', {}, ['Letzte Aktivität']), h('th', {}, ['']),
      ])])]);
      var tbody = h('tbody');
      (users || []).forEach(function (u) {
        tbody.appendChild(h('tr', {}, [
          h('td', {}, [esc(u.name)]),
          h('td', {}, [h('span', { class: 'chip' }, [u.role])]),
          h('td', {}, [u.isActive ? 'aktiv' : 'gesperrt']),
          h('td', { class: 'muted' }, [fmtDate(u.lastActiveAt)]),
          h('td', {}, [h('div', { class: 'row-actions' }, [
            h('button', { class: 'icon-btn', title: u.isActive ? 'Sperren' : 'Entsperren', onclick: function () { toggleUser(u); } }, [icon(u.isActive ? 'lock' : 'lock_open')]),
            h('button', { class: 'icon-btn', title: 'Löschen', onclick: function () { deleteUser(u); } }, [icon('delete')]),
          ])]),
        ]));
      });
      table.appendChild(tbody);
      node.appendChild(h('div', { class: 'card' }, [table]));
    }).catch(function (ex) { showError(node, ex); });
  }
  function toggleUser(u) {
    API.patch('/users/' + u.id, { isActive: !u.isActive })
      .then(function () { snack('Aktualisiert'); navigate('users'); })
      .catch(function (ex) { snack(ex.message, true); });
  }
  function deleteUser(u) {
    var d = dialog('Nutzer löschen', [h('p', {}, ['„' + esc(u.name) + '“ wirklich löschen?'])], [
      h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']),
      h('button', { class: 'btn danger', onclick: function () {
        API.del('/users/' + u.id).then(function () { d.close(); snack('Gelöscht'); navigate('users'); })
          .catch(function (ex) { snack(ex.message, true); });
      } }, ['Löschen']),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Gruppen
  // ---------------------------------------------------------------------------
  function viewGroups(node) {
    clear(node);
    var actions = [h('button', { class: 'btn', onclick: function () {
      var name = fieldInput('Gruppenname', 'name');
      var d = dialog('Neue Gruppe', [name.wrap], [
        h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']),
        h('button', { class: 'btn', onclick: function () {
          API.post('/groups', { name: name.input.value.trim() }).then(function () { d.close(); snack('Gruppe erstellt'); navigate('groups'); })
            .catch(function (ex) { snack(ex.message, true); });
        } }, ['Speichern']),
      ]);
    } }, [icon('add'), 'Gruppe'])];
    node.appendChild(sectionHead('Gruppen', actions));
    loading(node);
    API.get('/groups').then(function (groups) {
      clear(node);
      node.appendChild(sectionHead('Gruppen', actions));
      var grid = h('div', { class: 'grid' });
      (groups || []).forEach(function (g) {
        grid.appendChild(h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [icon('groups'), h('h3', { style: 'margin:0' }, [esc(g.name)])]),
          h('p', { class: 'muted' }, [(g.memberCount != null ? g.memberCount : (g.members ? g.members.length : 0)) + ' Mitglieder']),
        ]));
      });
      node.appendChild(grid.children.length ? grid : h('div', { class: 'empty' }, [icon('groups'), h('div', {}, ['Keine Gruppen.'])]));
    }).catch(function (ex) { showError(node, ex); });
  }

  // ---------------------------------------------------------------------------
  // Registrierungscodes
  // ---------------------------------------------------------------------------
  function viewCodes(node) {
    clear(node);
    var actions = [h('button', { class: 'btn', onclick: codeDialog }, [icon('add'), 'Code'])];
    node.appendChild(sectionHead('Registrierungscodes', actions));
    loading(node);
    API.get('/registration-codes').then(function (codes) {
      clear(node);
      node.appendChild(sectionHead('Registrierungscodes', actions));
      var table = h('table', {}, [h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Code']), h('th', {}, ['Rolle']), h('th', {}, ['Nutzung']), h('th', {}, ['Status']), h('th', {}, ['']),
      ])])]);
      var tbody = h('tbody');
      (codes || []).forEach(function (c) {
        tbody.appendChild(h('tr', {}, [
          h('td', {}, [h('code', {}, [esc(c.code)])]),
          h('td', {}, [esc(c.role || '—')]),
          h('td', {}, [(c.useCount || 0) + (c.maxUses ? ' / ' + c.maxUses : '')]),
          h('td', {}, [c.isActive ? 'aktiv' : 'inaktiv']),
          h('td', {}, [h('button', { class: 'icon-btn', title: 'Deaktivieren', onclick: function () {
            API.del('/registration-codes/' + c.id).then(function () { snack('Deaktiviert'); navigate('codes'); })
              .catch(function (ex) { snack(ex.message, true); });
          } }, [icon('block')])]),
        ]));
      });
      table.appendChild(tbody);
      node.appendChild(h('div', { class: 'card' }, [table]));
    }).catch(function (ex) { showError(node, ex); });
  }
  function codeDialog() {
    var group = fieldInput('Gruppen-ID', 'groupId');
    var roleSel = h('select', { name: 'role' }, ['member', 'parent', 'teacher', 'coordinator'].map(function (r) { return h('option', { value: r }, [r]); }));
    var maxUses = fieldInput('Max. Nutzungen (optional)', 'maxUses', 'number');
    var err = h('div', { class: 'error-text' });
    var d;
    var save = h('button', { class: 'btn' }, [icon('save'), 'Erzeugen']);
    save.addEventListener('click', function () {
      API.post('/registration-codes', {
        groupId: group.input.value.trim(), role: roleSel.value,
        maxUses: maxUses.input.value ? parseInt(maxUses.input.value, 10) : undefined,
      }).then(function (c) { d.close(); snack('Code: ' + (c && c.code ? c.code : 'erstellt')); navigate('codes'); })
        .catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog('Neuer Registrierungscode', [group.wrap,
      h('div', { class: 'field' }, [h('label', {}, ['Rolle']), roleSel]), maxUses.wrap, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Statistik
  // ---------------------------------------------------------------------------
  function viewStats(node) {
    clear(node);
    var actions = [h('button', { class: 'btn tonal', onclick: function () { window.location.href = '/api/reports/export'; } }, [icon('download'), 'CSV-Export'])];
    node.appendChild(sectionHead('Statistik & Reports', actions));
    loading(node);
    API.get('/statistics/overview').then(function (s) {
      clear(node);
      node.appendChild(sectionHead('Statistik & Reports', actions));
      var grid = h('div', { class: 'grid' });
      Object.keys(s || {}).forEach(function (k) {
        grid.appendChild(h('div', { class: 'card' }, [h('h3', {}, [String(s[k])]), h('div', { class: 'muted' }, [k])]));
      });
      node.appendChild(grid);
    }).catch(function (ex) { showError(node, ex); });
  }

  // ---------------------------------------------------------------------------
  // Branding
  // ---------------------------------------------------------------------------
  function viewBranding(node) {
    clear(node);
    node.appendChild(sectionHead('Branding'));
    loading(node);
    API.get('/branding').then(function (b) {
      clear(node);
      node.appendChild(sectionHead('Branding'));
      var appName = fieldInput('App-Name', 'appName', 'text', b.appName);
      var color = fieldInput('Primärfarbe (Hex)', 'primaryColor', 'text', b.primaryColor);
      var support = fieldInput('Support-Kontakt', 'supportContact', 'text', b.supportContact);
      var modeSel = h('select', { name: 'themeMode' }, ['system', 'light', 'dark'].map(function (m) {
        return h('option', { value: m, selected: b.themeMode === m ? 'selected' : null }, [m]);
      }));
      var save = h('button', { class: 'btn', onclick: function () {
        API.put('/branding', {
          appName: appName.input.value.trim(), primaryColor: color.input.value.trim(),
          supportContact: support.input.value.trim(), themeMode: modeSel.value,
        }).then(function (nb) { applyBranding(nb); snack('Branding gespeichert'); renderShell(); })
          .catch(function (ex) { snack(ex.message, true); });
      } }, [icon('save'), 'Speichern']);
      node.appendChild(h('div', { class: 'card', style: 'max-width:480px' }, [
        appName.wrap, color.wrap, support.wrap,
        h('div', { class: 'field' }, [h('label', {}, ['Theme-Modus']), modeSel]),
        h('div', { class: 'row' }, [save]),
      ]));
    }).catch(function (ex) { showError(node, ex); });
  }

  // ---------------------------------------------------------------------------
  // System
  // ---------------------------------------------------------------------------
  function viewSystem(node) {
    clear(node);
    node.appendChild(sectionHead('System'));
    loading(node);
    API.get('/system/status').then(function (s) {
      clear(node);
      node.appendChild(sectionHead('System'));
      var grid = h('div', { class: 'grid' });
      grid.appendChild(h('div', { class: 'card' }, [h('h3', {}, ['Laufzeit']),
        h('div', { class: 'muted' }, ['Uptime: ' + Math.round((s.uptimeSeconds || 0) / 60) + ' min']),
        h('div', { class: 'muted' }, ['Node: ' + esc(s.nodeVersion)])]));
      var counts = s.counts || {};
      grid.appendChild(h('div', { class: 'card' }, [h('h3', {}, ['Kennzahlen'])].concat(
        Object.keys(counts).map(function (k) { return h('div', { class: 'muted' }, [k + ': ' + counts[k]]); }))));
      var jobsCard = h('div', { class: 'card' }, [h('h3', {}, ['Cronjobs'])]);
      (s.cronJobs || []).forEach(function (j) { jobsCard.appendChild(h('div', { class: 'muted' }, [j.name + ': ' + j.schedule])); });
      grid.appendChild(jobsCard);
      var backupCard = h('div', { class: 'card' }, [h('h3', {}, ['Letzte Backups'])]);
      (s.backups || []).forEach(function (bk) { backupCard.appendChild(h('div', { class: 'muted' }, [bk.file + ' (' + Math.round(bk.size / 1024) + ' KB)'])); });
      if (!(s.backups || []).length) backupCard.appendChild(h('div', { class: 'muted' }, ['Keine Backups.']));
      grid.appendChild(backupCard);
      node.appendChild(grid);
    }).catch(function (ex) { showError(node, ex); });
  }

  // ---------------------------------------------------------------------------
  // SuAd-Bereich
  // ---------------------------------------------------------------------------
  function viewSuad(node) {
    clear(node);
    var actions = [h('button', { class: 'btn', onclick: issueKeyDialog }, [icon('key'), 'Key ausstellen'])];
    node.appendChild(sectionHead('Interner Bereich', actions));
    loading(node);
    API.get('/internal/suad/audit-logs').then(function (logs) {
      clear(node);
      node.appendChild(sectionHead('Interner Bereich', actions));
      var table = h('table', {}, [h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Zeit']), h('th', {}, ['Aktion']), h('th', {}, ['Akteur']), h('th', {}, ['Ziel']),
      ])])]);
      var tbody = h('tbody');
      (logs || []).slice(0, 100).forEach(function (l) {
        tbody.appendChild(h('tr', {}, [
          h('td', { class: 'muted' }, [fmtDate(l.createdAt)]),
          h('td', {}, [esc(l.action)]),
          h('td', { class: 'muted' }, [esc(l.actorId)]),
          h('td', { class: 'muted' }, [esc(l.targetType) + ':' + esc(l.targetId)]),
        ]));
      });
      table.appendChild(tbody);
      node.appendChild(h('div', { class: 'card' }, [h('h3', {}, ['Audit-Log']), table]));
    }).catch(function (ex) { showError(node, ex); });
  }
  function issueKeyDialog() {
    var pw = fieldInput('Sonderkennwort', 'specialPassword', 'password');
    var err = h('div', { class: 'error-text' });
    var d;
    var save = h('button', { class: 'btn' }, [icon('key'), 'Ausstellen']);
    save.addEventListener('click', function () {
      API.post('/internal/suad/keys', { specialPassword: pw.input.value })
        .then(function (k) {
          d.close();
          dialog('SuAd-Key (einmalig!)', [h('p', {}, ['Gültig bis: ' + fmtDate(k.expiresAt)]),
            h('div', { class: 'card' }, [h('code', {}, [esc(k.key)])])],
            [h('button', { class: 'btn', onclick: function (e) { e.target.closest('.dialog-scrim').remove(); } }, ['Schließen'])]);
        })
        .catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog('SuAd-Key ausstellen', [pw.wrap, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Profil + "Activate Special"
  // ---------------------------------------------------------------------------
  function viewProfile(node) {
    clear(node);
    node.appendChild(sectionHead('Mein Profil'));
    var me = state.me;
    var card = h('div', { class: 'card', style: 'max-width:480px' }, [
      h('div', { class: 'row' }, [icon('account_circle'), h('h3', { style: 'margin:0' }, [esc(me.name)])]),
      h('div', { class: 'row' }, [h('span', { class: 'chip' }, [me.role])].concat((me.badges || []).map(function (b) { return h('span', { class: 'chip selected' }, [b]); }))),
      me.email ? h('p', { class: 'muted' }, [me.email]) : null,
    ]);
    node.appendChild(card);

    // Activate Special (getarnt als Badge-Freischaltung)
    var code = fieldInput('Code', 'code');
    var pw = fieldInput('Sonderkennwort (nur Erst-Setup)', 'specialPassword', 'password');
    var err = h('div', { class: 'error-text' });
    var btn = h('button', { class: 'btn tonal', onclick: function () {
      err.textContent = '';
      API.post('/internal/suad/activate-special', { code: code.input.value.trim(), specialPassword: pw.input.value || undefined })
        .then(function (r) {
          if (r.recoveryKey) {
            dialog('Recovery-Key (einmalig sichern!)', [h('div', { class: 'card' }, [h('code', {}, [r.recoveryKey])])],
              [h('button', { class: 'btn', onclick: function (e) { e.target.closest('.dialog-scrim').remove(); boot(); } }, ['Verstanden'])]);
          } else { snack('Badge freigeschaltet'); boot(); }
        })
        .catch(function (ex) { err.textContent = ex.message; });
    } }, [icon('workspace_premium'), 'Freischalten']);
    node.appendChild(h('div', { class: 'card', style: 'max-width:480px' }, [
      h('h3', {}, ['Activate Special']),
      h('p', { class: 'muted' }, ['Code zur Badge-Freischaltung eingeben.']),
      code.wrap, pw.wrap, err, h('div', { class: 'row' }, [btn]),
    ]));
  }

  // ---------------------------------------------------------------------------
  // Socket.IO (dynamisch geladen, optional)
  // ---------------------------------------------------------------------------
  function initSocket() {
    if (window.chatSocket || !window.io) return;
    try {
      window.chatSocket = window.io({ withCredentials: true });
    } catch (e) { /* Chat-Echtzeit optional */ }
  }
  function loadSocketIO() {
    if (window.io) { initSocket(); return; }
    var s = document.createElement('script');
    s.src = '/socket.io/socket.io.js';
    s.onload = initSocket;
    s.onerror = function () { /* Socket.IO nicht verfügbar */ };
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------
  function logout() {
    API.post('/auth/logout', {}).catch(function () {}).then(function () {
      state.me = null;
      if (window.chatSocket) { try { window.chatSocket.disconnect(); } catch (e) {} window.chatSocket = null; }
      renderAuth('login');
    });
  }

  function boot() {
    return API.get('/branding').catch(function () { return {}; }).then(function (b) {
      applyBranding(b || {});
      return API.get('/auth/me').then(function (me) {
        state.me = me;
        var hash = (location.hash || '').replace('#/', '');
        currentView = hash && navFor(me.role).some(function (i) { return i.id === hash; }) ? hash : 'dashboard';
        renderShell();
        loadSocketIO();
      }).catch(function () {
        renderAuth('login');
      });
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }

  boot();
})();
