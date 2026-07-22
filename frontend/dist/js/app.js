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
    try { return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; }
  }
  function fmtDateFriendly(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso), now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var diff = Math.round((target - today) / 86400000);
      var time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      if (diff === 0) return 'Heute, ' + time;
      if (diff === 1) return 'Morgen, ' + time;
      if (diff === -1) return 'Gestern, ' + time;
      if (diff > 1 && diff <= 6) return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()] + ', ' + time;
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + time;
    } catch (e) { return iso; }
  }
  function fmtTimeRange(s, e) {
    if (!s || !e) return fmtDateFriendly(s);
    try {
      var sd = new Date(s), ed = new Date(e), same = sd.toDateString() === ed.toDateString();
      var st = sd.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      var et = ed.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      return fmtDateFriendly(s) + ' – ' + (same ? et : fmtDateFriendly(e));
    } catch (e) { return fmtDateFriendly(s); }
  }
  function fmtDeadline(iso) {
    if (!iso) return null;
    var d = new Date(iso), now = new Date(), diff = d.getTime() - now.getTime();
    if (diff < 0) return { text: 'abgelaufen', warn: true };
    var hours = Math.floor(diff / 3600000);
    if (hours < 1) return { text: 'in < 1 Std.', warn: true };
    if (hours < 24) return { text: 'noch ' + hours + ' Std.', warn: hours < 3 };
    var days = Math.floor(hours / 24);
    return { text: 'noch ' + days + ' Tag' + (days > 1 ? 'e' : ''), warn: false };
  }

  var openDialogs = [];
  function closeAllDialogs() { openDialogs.slice().forEach(function (c) { c(); }); }
  function dialog(title, contentNodes, actions) {
    var scrim = h('div', { class: 'dialog-scrim' });
    function close() { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); var i = openDialogs.indexOf(close); if (i >= 0) openDialogs.splice(i, 1); }
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    var d = h('div', { class: 'dialog' }, [h('h2', {}, [title])]);
    contentNodes.forEach(function (n) { if (n) d.appendChild(n); });
    var act = h('div', { class: 'dialog-actions' });
    (actions || []).forEach(function (a) { act.appendChild(a); });
    d.appendChild(act); scrim.appendChild(d); document.body.appendChild(scrim);
    openDialogs.push(close);
    return { close: close, el: d };
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openDialogs.length) { e.preventDefault(); openDialogs[openDialogs.length - 1](); } });

  function skeletonCards(node, count) { clear(node); var g = h('div', { class: 'grid' }); for (var i = 0; i < (count || 3); i++) g.appendChild(h('div', { class: 'skeleton skeleton-card' })); node.appendChild(g); }
  function skeletonList(node, count) { clear(node); var s = h('div', { class: 'stack' }); for (var i = 0; i < (count || 4); i++) s.appendChild(h('div', { class: 'card' }, [h('div', { class: 'skeleton skeleton-line', style: 'width:' + (50 + Math.random() * 30) + '%' }), h('div', { class: 'skeleton skeleton-line short' })])); node.appendChild(s); }
  function fieldInput(label, name, type, value) { var input = h('input', { name: name, type: type || 'text', value: value || '' }); return { wrap: h('div', { class: 'field' }, [h('label', {}, [label]), input]), input: input }; }

  // ---------------------------------------------------------------------------
  // Attendance Status-Mapping (Sportverein)
  // ---------------------------------------------------------------------------
  var STATUS_LABELS = {
    registered: 'Angemeldet', confirmed: 'Bestätigt', present: 'Anwesend',
    pending: 'Bestätigung ausstehend', absent: 'Abgemeldet', cancelled: 'Abgesagt',
  };
  var STATUS_ICONS = {
    registered: 'check_circle', confirmed: 'verified', present: 'how_to_reg',
    pending: 'schedule', absent: 'cancel', cancelled: 'block',
  };
  var MODE_LABELS = { signup: 'Anmeldebasiert', signoff: 'Abmeldebasiert', confirmation: 'Bestätigung' };
  var MODE_HINTS = {
    signup: 'Teilnehmer müssen sich aktiv anmelden',
    signoff: 'Teilnehmer sind automatisch angemeldet – Abmeldung bei Verhinderung',
    confirmation: 'Teilnehmer müssen ihre Teilnahme bestätigen oder absagen',
  };
  var TYPE_LABELS = { training: 'Training', match: 'Spiel', event: 'Veranstaltung', other: 'Sonstiges' };
  var TYPE_ICONS = { training: 'fitness_center', match: 'sports_soccer', event: 'celebration', other: 'event' };

  function statusChip(status) {
    if (!status) return h('span', { class: 'chip' }, ['—']);
    return h('span', { class: 'chip status-' + status }, [icon(STATUS_ICONS[status] || 'help'), STATUS_LABELS[status] || status]);
  }
  function eventTypeBadge(type) {
    return h('span', { class: 'event-type-badge event-type-' + (type || 'training') }, [icon(TYPE_ICONS[type] || 'event'), TYPE_LABELS[type] || type]);
  }

  // ---------------------------------------------------------------------------
  // Branding / Theme
  // ---------------------------------------------------------------------------
  function applyBranding(b) {
    state.branding = b;
    if (b.primaryColor) { document.documentElement.style.setProperty('--md-primary', b.primaryColor); var meta = document.getElementById('theme-color-meta'); if (meta) meta.setAttribute('content', b.primaryColor); }
    if (b.faviconUrl) { var fav = document.getElementById('favicon-link'); if (fav) fav.setAttribute('href', b.faviconUrl); }
    var mode = b.themeMode || 'system';
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.title = b.appName || 'Anwesenheit NEO';
  }

  // ---------------------------------------------------------------------------
  // Auth Views
  // ---------------------------------------------------------------------------
  function renderAuth(mode) {
    clear(app); var b = state.branding || {}; var tab = mode || 'login';
    var brandBox = h('div', { class: 'brand' }, [b.logoUrl ? h('img', { src: b.logoUrl, alt: 'Logo' }) : icon('event_available'), h('h1', {}, [b.appName || 'Anwesenheit NEO'])]);
    var tabs = h('div', { class: 'auth-tabs' }, [
      h('button', { class: tab === 'login' ? 'active' : '', onclick: function () { if (tab !== 'login') renderAuth('login'); } }, ['Anmelden']),
      h('button', { class: tab === 'register' ? 'active' : '', onclick: function () { if (tab !== 'register') renderAuth('register'); } }, ['Registrieren']),
    ]);
    var form = tab === 'login' ? loginForm() : registerForm();
    app.appendChild(h('div', { class: 'auth-wrap' }, [h('div', { class: 'card auth-card' }, [brandBox, tabs, form])]));
  }
  function loginForm() {
    var id = fieldInput('Name oder E-Mail', 'identifier'), pw = fieldInput('Passwort', 'password', 'password');
    var err = h('div', { class: 'error-text' }), btn = h('button', { class: 'btn', type: 'submit' }, [icon('login'), 'Anmelden']);
    var form = h('form', {}, [id.wrap, pw.wrap, err, h('div', { class: 'row' }, [btn])]);
    form.addEventListener('submit', function (e) { e.preventDefault(); err.textContent = ''; btn.disabled = true;
      API.post('/auth/login', { identifier: id.input.value.trim(), password: pw.input.value }).then(function () { return boot(); }).catch(function (ex) { err.textContent = ex.message; btn.disabled = false; }); });
    return form;
  }
  function registerForm() {
    var code = fieldInput('Registrierungscode', 'code'), name = fieldInput('Name', 'name'), email = fieldInput('E-Mail (optional)', 'email', 'email'), pw = fieldInput('Passwort (min. 8 Zeichen)', 'password', 'password');
    var err = h('div', { class: 'error-text' }), btn = h('button', { class: 'btn', type: 'submit' }, [icon('person_add'), 'Konto erstellen']);
    var form = h('form', {}, [code.wrap, name.wrap, email.wrap, pw.wrap, err, h('div', { class: 'row' }, [btn])]);
    form.addEventListener('submit', function (e) { e.preventDefault(); err.textContent = ''; btn.disabled = true;
      API.post('/auth/register', { code: code.input.value.trim().toUpperCase(), name: name.input.value.trim(), email: email.input.value.trim() || undefined, password: pw.input.value })
        .then(function () { return boot(); }).catch(function (ex) { err.textContent = ex.message; btn.disabled = false; }); });
    return form;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function navFor(role) {
    var items = [
      { id: 'dashboard', label: 'Start', icon: 'dashboard' },
      { id: 'events', label: 'Termine', icon: 'calendar_month' },
      { id: 'chat', label: 'Chat', icon: 'chat' },
      { id: 'messages', label: 'Nachrichten', icon: 'campaign' },
    ];
    var admin = role === 'admin' || role === 'coordinator' || role === 'suad';
    if (role === 'teacher' || admin) items.push({ id: 'subs', label: 'Vertretung', icon: 'swap_horiz' });
    if (admin) {
      items.push({ id: 'users', label: 'Nutzer', icon: 'group' });
      items.push({ id: 'groups', label: 'Gruppen', icon: 'groups' });
      items.push({ id: 'profiles', label: 'Rechteprofile', icon: 'shield_person' });
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
  // App Shell
  // ---------------------------------------------------------------------------
  var currentView = 'dashboard';
  function renderShell() {
    clear(app); var b = state.branding || {}, me = state.me, items = navFor(me.role);
    var rail = h('div', { class: 'rail' });
    items.forEach(function (it) { rail.appendChild(h('button', { class: 'rail-item' + (it.id === currentView ? ' active' : ''), onclick: function () { navigate(it.id); } }, [h('span', { class: 'ind' }, [icon(it.icon)]), it.label])); });
    var appbar = h('div', { class: 'appbar' }, [b.logoUrl ? h('img', { class: 'logo', src: b.logoUrl, alt: '' }) : icon('event_available'), h('div', { class: 'title' }, [b.appName || 'Anwesenheit NEO']), h('span', { class: 'chip' }, [me.role]), h('button', { class: 'icon-btn', title: 'Abmelden', onclick: logout }, [icon('logout')])]);
    var content = h('div', { class: 'content', id: 'view' });
    app.appendChild(h('div', { class: 'shell' }, [rail, h('div', { class: 'main' }, [appbar, content])]));
    renderView();
  }
  function navigate(view) { closeAllDialogs(); currentView = view; location.hash = '#/' + view; var n = viewNode(); if (n) { n.style.animation = 'none'; void n.offsetHeight; n.style.animation = ''; renderView(); } else renderShell(); }
  function viewNode() { return document.getElementById('view'); }
  function loading(node) { skeletonList(node, 3); }
  function showError(node, ex) { clear(node); node.appendChild(h('div', { class: 'empty' }, [icon('error'), h('div', {}, [ex && ex.status === 403 ? 'Keine Berechtigung.' : (ex ? ex.message : 'Fehler')])])); }
  function sectionHead(title, actions) { var head = h('div', { class: 'section-head' }, [h('h2', {}, [title]), h('div', { class: 'spacer' })]); (actions || []).forEach(function (a) { head.appendChild(a); }); return head; }
  function emptyState(iconName, message, hint) { return h('div', { class: 'empty' }, [icon(iconName), h('div', {}, [message]), hint ? h('div', { class: 'empty-hint' }, [hint]) : null]); }
  function renderView() { var map = { dashboard: viewDashboard, events: viewEvents, chat: viewChat, messages: viewMessages, users: viewUsers, groups: viewGroups, codes: viewCodes, stats: viewStats, branding: viewBranding, system: viewSystem, suad: viewSuad, profile: viewProfile, subs: viewSubs, profiles: viewProfiles }; (map[currentView] || viewDashboard)(viewNode()); }

  // ---------------------------------------------------------------------------
  // Dashboard (Sportverein-Sprache)
  // ---------------------------------------------------------------------------
  function viewDashboard(node) {
    clear(node); var me = state.me;
    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
    node.appendChild(h('div', { class: 'dash-welcome' }, [greeting + ', ' + esc(me.name)]));
    node.appendChild(h('div', { class: 'dash-subtitle' }, ['Rolle: ', h('span', { class: 'chip' }, [me.role])]));
    skeletonCards(node, 4);

    Promise.all([
      API.get('/events?from=' + encodeURIComponent(new Date().toISOString())).catch(function () { return []; }),
      API.get('/messages').catch(function () { return []; }),
    ]).then(function (r) {
      var events = r[0] || [], messages = r[1] || [];
      while (node.children.length > 2) node.removeChild(node.lastChild);
      var grid = h('div', { class: 'grid' });

      // -- Nächste Trainings/Spiele --
      var evCard = h('div', { class: 'card' }, [h('div', { class: 'row' }, [icon('calendar_month'), h('h3', { style: 'flex:1;margin:0' }, ['Nächste Termine'])])]);
      var upcoming = events.slice(0, 5);
      if (!upcoming.length) evCard.appendChild(h('div', { class: 'muted', style: 'padding:16px 0' }, ['Keine anstehenden Termine.']));
      upcoming.forEach(function (ev) {
        var evRow = h('div', { style: 'padding:10px 0;border-bottom:1px solid var(--md-outline-variant)' }, [
          h('div', { class: 'row' }, [
            ev.groupColor ? h('span', { class: 'group-color-dot', style: 'background:' + ev.groupColor }) : null,
            eventTypeBadge(ev.eventType),
            h('div', { style: 'flex:1' }, [h('div', { style: 'font-weight:500' }, [esc(ev.title)]), h('div', { class: 'muted', style: 'font-size:13px' }, [fmtTimeRange(ev.startAt, ev.endAt)])]),
            statusChip(ev.myAttendance),
          ]),
        ]);
        // Schnellaktion basierend auf Modus
        if (!ev.isCancelled) {
          var quickBtn = null;
          if (ev.mode === 'signup' && (!ev.myAttendance || ev.myAttendance === 'absent')) {
            quickBtn = h('button', { class: 'btn tonal', style: 'margin-top:6px;min-height:32px;font-size:12px;padding:0 14px' }, [icon('check'), 'Anmelden']);
            quickBtn.onclick = function (e) { e.stopPropagation(); API.post('/events/' + ev.id + '/attendance', { action: 'register' }).then(function () { snack('Anmeldung gespeichert'); navigate('dashboard'); }).catch(function (ex) { snack(ex.message, true); }); };
          } else if (ev.mode === 'confirmation' && ev.myAttendance === 'pending') {
            quickBtn = h('button', { class: 'btn tonal', style: 'margin-top:6px;min-height:32px;font-size:12px;padding:0 14px' }, [icon('verified'), 'Teilnahme bestätigen']);
            quickBtn.onclick = function (e) { e.stopPropagation(); API.post('/events/' + ev.id + '/attendance', { action: 'confirm' }).then(function () { snack('Teilnahme bestätigt'); navigate('dashboard'); }).catch(function (ex) { snack(ex.message, true); }); };
          }
          if (quickBtn) evRow.appendChild(quickBtn);
        }
        evCard.appendChild(evRow);
      });
      if (events.length > 5) evCard.appendChild(h('button', { class: 'btn text', style: 'margin-top:8px', onclick: function () { navigate('events'); } }, ['Alle ' + events.length + ' Termine →']));
      grid.appendChild(evCard);

      // -- Nachrichten --
      var msgCard = h('div', { class: 'card' }, [h('div', { class: 'row' }, [icon('campaign'), h('h3', { style: 'flex:1;margin:0' }, ['Nachrichten']), messages.length ? h('span', { class: 'badge-count' }, [String(messages.length)]) : null])]);
      if (!messages.length) msgCard.appendChild(h('div', { class: 'muted', style: 'padding:16px 0' }, ['Keine neuen Nachrichten.']));
      messages.slice(0, 3).forEach(function (m) { msgCard.appendChild(h('div', { style: 'padding:8px 0;border-bottom:1px solid var(--md-outline-variant)' }, [h('div', { style: 'font-weight:500;font-size:14px' }, [esc(m.title)]), h('div', { class: 'muted', style: 'font-size:13px' }, [esc((m.body || '').substring(0, 80))])])); });
      if (messages.length > 3) msgCard.appendChild(h('button', { class: 'btn text', style: 'margin-top:8px', onclick: function () { navigate('messages'); } }, ['Alle Nachrichten →']));
      grid.appendChild(msgCard);

      // -- Gruppen --
      var groups = me.groups || [];
      var grpCard = h('div', { class: 'card' }, [h('div', { class: 'row' }, [icon('groups'), h('h3', { style: 'flex:1;margin:0' }, ['Meine Mannschaften'])])]);
      if (!groups.length) grpCard.appendChild(h('div', { class: 'muted', style: 'padding:16px 0' }, ['Keiner Mannschaft zugewiesen.']));
      groups.forEach(function (g) { grpCard.appendChild(h('div', { class: 'row', style: 'padding:6px 0' }, [h('span', { class: 'chip selected' }, [esc(g.name)])])); });
      grid.appendChild(grpCard);

      // -- Statistik --
      var today = new Date();
      var todaysEvents = events.filter(function (ev) { return new Date(ev.startAt).toDateString() === today.toDateString(); });
      var myActive = events.filter(function (ev) { return ev.myAttendance === 'registered' || ev.myAttendance === 'confirmed' || ev.myAttendance === 'present'; });
      var pendingCount = events.filter(function (ev) { return ev.myAttendance === 'pending'; }).length;
      var statsCard = h('div', { class: 'card' }, [
        h('div', { class: 'row' }, [icon('insights'), h('h3', { style: 'flex:1;margin:0' }, ['Auf einen Blick'])]),
        h('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr;gap:12px;margin-top:12px' }, [
          h('div', {}, [h('div', { class: 'stat-number' }, [String(todaysEvents.length)]), h('div', { class: 'stat-label' }, ['Heute'])]),
          h('div', {}, [h('div', { class: 'stat-number' }, [String(events.length)]), h('div', { class: 'stat-label' }, ['Anstehend'])]),
          h('div', {}, [h('div', { class: 'stat-number' }, [String(myActive.length)]), h('div', { class: 'stat-label' }, ['Meine Zusagen'])]),
          pendingCount > 0 ? h('div', {}, [h('div', { class: 'stat-number', style: 'color:var(--md-warning)' }, [String(pendingCount)]), h('div', { class: 'stat-label' }, ['Offen (bestätigen!)'])]) : h('div', {}, [h('div', { class: 'stat-number' }, [String(groups.length)]), h('div', { class: 'stat-label' }, ['Mannschaften'])]),
        ]),
      ]);
      grid.appendChild(statsCard);
      node.appendChild(grid);
    }).catch(function (ex) { showError(node, ex); });
  }

  // ---------------------------------------------------------------------------
  // Termine (Sportverein-Modi + Trainer-Teilnehmerliste)
  // ---------------------------------------------------------------------------
  function modeActionButtons(ev) {
    var wrap = h('div', { class: 'row', style: 'margin-top:8px' });
    if (ev.isCancelled) { wrap.appendChild(h('span', { class: 'chip status-cancelled' }, [icon('block'), 'Ausgefallen'])); return wrap; }
    var myStatus = ev.myAttendance;

    function doAction(action, label) {
      return function () { API.post('/events/' + ev.id + '/attendance', { action: action }).then(function () { snack(label); navigate('events'); }).catch(function (ex) { snack(ex.message, true); }); };
    }

    switch (ev.mode) {
      case 'signup':
        if (!myStatus || myStatus === 'absent') {
          wrap.appendChild(h('button', { class: 'btn success', onclick: doAction('register', 'Anmeldung gespeichert') }, [icon('check'), 'Anmelden']));
        } else {
          wrap.appendChild(h('button', { class: 'btn outlined', onclick: doAction('withdraw', 'Abmeldung gespeichert') }, [icon('close'), 'Abmelden']));
        }
        break;
      case 'signoff':
        if (myStatus === 'registered' || myStatus === 'present') {
          wrap.appendChild(h('button', { class: 'btn outlined', onclick: function () { withdrawWithReason(ev); } }, [icon('close'), 'Abmelden']));
        } else {
          wrap.appendChild(h('button', { class: 'btn success', onclick: doAction('register', 'Wieder angemeldet') }, [icon('check'), 'Wieder anmelden']));
        }
        break;
      case 'confirmation':
        if (myStatus === 'pending') {
          wrap.appendChild(h('button', { class: 'btn success', onclick: doAction('confirm', 'Teilnahme bestätigt') }, [icon('verified'), 'Bestätigen']));
          wrap.appendChild(h('button', { class: 'btn outlined', onclick: function () { withdrawWithReason(ev, 'cancel'); } }, [icon('close'), 'Absagen']));
        } else if (myStatus === 'confirmed') {
          wrap.appendChild(h('button', { class: 'btn outlined', onclick: function () { withdrawWithReason(ev, 'cancel'); } }, [icon('close'), 'Doch absagen']));
        } else if (myStatus === 'cancelled') {
          wrap.appendChild(h('button', { class: 'btn success', onclick: doAction('confirm', 'Teilnahme bestätigt') }, [icon('verified'), 'Doch bestätigen']));
        }
        break;
    }
    return wrap;
  }

  function withdrawWithReason(ev, actionOverride) {
    var reason = fieldInput('Grund (optional)', 'reason');
    var action = actionOverride || 'withdraw';
    var d = dialog('Abmeldung', [h('p', {}, ['Warum kannst du nicht teilnehmen?']), reason.wrap], [
      h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']),
      h('button', { class: 'btn danger', onclick: function () {
        d.close();
        API.post('/events/' + ev.id + '/attendance', { action: action, note: reason.input.value.trim() || undefined })
          .then(function () { snack(action === 'cancel' ? 'Abgesagt' : 'Abgemeldet'); navigate('events'); }).catch(function (ex) { snack(ex.message, true); });
      } }, [action === 'cancel' ? 'Absagen' : 'Abmelden']),
    ]);
  }

  function viewEvents(node) {
    clear(node);
    var canManage = ['admin', 'coordinator', 'teacher', 'suad'].indexOf(state.me.role) >= 0;
    var actions = [];
    if (canManage) actions.push(h('button', { class: 'btn', onclick: function () { eventDialog(); } }, [icon('add'), 'Termin']));
    node.appendChild(sectionHead('Termine', actions));

    // Filter
    var groupFilter = h('select', {}, [h('option', { value: '' }, ['Alle Mannschaften'])]);
    API.get('/groups').then(function (groups) { (groups || []).forEach(function (g) { groupFilter.appendChild(h('option', { value: g.id }, [g.name])); }); }).catch(function () {});
    var typeFilter = h('select', {}, [h('option', { value: '' }, ['Alle Typen']), h('option', { value: 'training' }, ['Training']), h('option', { value: 'match' }, ['Spiel']), h('option', { value: 'event' }, ['Veranstaltung']), h('option', { value: 'other' }, ['Sonstiges'])]);
    var dateFilter = h('select', {}, [h('option', { value: 'upcoming' }, ['Anstehend']), h('option', { value: 'today' }, ['Heute']), h('option', { value: 'week' }, ['Diese Woche']), h('option', { value: 'all' }, ['Alle'])]);
    node.appendChild(h('div', { class: 'filter-bar' }, [icon('filter_list'), groupFilter, typeFilter, dateFilter]));

    var listContainer = h('div');
    node.appendChild(listContainer);

    function loadEvents() {
      var params = '', dateVal = dateFilter.value, now = new Date();
      if (dateVal === 'upcoming') params += 'from=' + encodeURIComponent(now.toISOString());
      else if (dateVal === 'today') { var ts = new Date(now.getFullYear(), now.getMonth(), now.getDate()); params += 'from=' + encodeURIComponent(ts.toISOString()) + '&to=' + encodeURIComponent(new Date(ts.getTime() + 86400000).toISOString()); }
      else if (dateVal === 'week') params += 'from=' + encodeURIComponent(now.toISOString()) + '&to=' + encodeURIComponent(new Date(now.getTime() + 7 * 86400000).toISOString());
      if (groupFilter.value) params += (params ? '&' : '') + 'groupId=' + groupFilter.value;
      if (typeFilter.value) params += (params ? '&' : '') + 'eventType=' + typeFilter.value;
      skeletonList(listContainer, 4);

      API.get('/events' + (params ? '?' + params : '')).then(function (events) {
        clear(listContainer);
        if (!events || !events.length) { listContainer.appendChild(emptyState('calendar_month', 'Keine Termine gefunden.', canManage ? 'Erstelle ein Training oder Spiel mit dem + Button.' : 'Aktuell keine Termine für den Filter.')); return; }
        var stack = h('div', { class: 'stack' });
        events.forEach(function (ev) {
          var headRow = h('div', { class: 'row' }, [
            ev.groupColor ? h('span', { class: 'group-color-dot', style: 'background:' + ev.groupColor }) : null,
            eventTypeBadge(ev.eventType),
            h('h3', { style: 'flex:1;margin:0' }, [esc(ev.title)]),
            statusChip(ev.myAttendance),
          ]);
          var metaRow = h('div', { class: 'event-meta' }, [
            h('span', {}, [icon('schedule'), ' ', fmtTimeRange(ev.startAt, ev.endAt)]),
            ev.groupName ? h('span', {}, [icon('group'), ' ', esc(ev.groupName)]) : null,
            ev.location ? h('span', {}, [icon('location_on'), ' ', esc(ev.location)]) : null,
          ]);
          // Teilnehmerübersicht
          var partText = String(ev.totalRegistered || 0) + ' von ' + (ev.totalMembers || '?') + ' angemeldet';
          if (ev.minParticipants > 0) partText += ' (min. ' + ev.minParticipants + ')';
          var partRow = h('div', { class: 'event-participants' }, [icon('people'), partText]);
          // Modus-Info
          var modeRow = h('div', { class: 'info-text' }, [icon('info'), MODE_LABELS[ev.mode] || ev.mode]);
          // Fristen
          var deadlineRow = null;
          if (ev.signupDeadline && (ev.mode === 'signup') && (!ev.myAttendance || ev.myAttendance === 'absent')) {
            var dl = fmtDeadline(ev.signupDeadline);
            if (dl) deadlineRow = h('div', { class: 'info-text ' + (dl.warn ? 'deadline-warn' : 'deadline-ok') }, [icon('timer'), 'Anmeldefrist: ' + dl.text]);
          }
          if (ev.withdrawDeadline && ev.myAttendance && ev.myAttendance !== 'absent' && ev.myAttendance !== 'cancelled') {
            var wdl = fmtDeadline(ev.withdrawDeadline);
            if (wdl) { var wNode = h('div', { class: 'info-text ' + (wdl.warn ? 'deadline-warn' : 'deadline-ok') }, [icon('timer_off'), 'Abmeldefrist: ' + wdl.text]); deadlineRow = deadlineRow ? h('div', {}, [deadlineRow, wNode]) : wNode; }
          }

          var card = h('div', { class: 'card' }, [headRow, metaRow, ev.description ? h('p', { style: 'margin:4px 0 8px' }, [esc(ev.description)]) : null, partRow, modeRow, deadlineRow,
            ev.isCancelled ? h('div', { class: 'error-text', style: 'margin-top:8px' }, [icon('cancel'), ' Ausgefallen' + (ev.cancelReason ? ': ' + esc(ev.cancelReason) : '')]) : modeActionButtons(ev)]);

          // Trainer-Aktionen
          if (canManage) {
            var trainerRow = h('div', { class: 'row-actions', style: 'margin-top:8px;border-top:1px solid var(--md-outline-variant);padding-top:8px' });
            trainerRow.appendChild(h('button', { class: 'btn tonal', style: 'min-height:36px;font-size:13px', onclick: function () { openAttendanceList(ev); } }, [icon('checklist'), 'Teilnehmerliste']));
            trainerRow.appendChild(h('button', { class: 'icon-btn', title: 'Bearbeiten', onclick: function () { eventDialog(ev); } }, [icon('edit')]));
            if (!ev.isCancelled) {
              trainerRow.appendChild(h('button', { class: 'icon-btn', title: 'Absagen', onclick: function () { cancelEventDialog(ev); } }, [icon('event_busy')]));
            } else {
              trainerRow.appendChild(h('button', { class: 'icon-btn', title: 'Ausfall aufheben', onclick: function () { askScope(ev, function (scope) { API.del('/events/' + ev.id + '/cancel?scope=' + scope).then(function () { snack('Aufgehoben'); navigate('events'); }).catch(function (ex) { snack(ex.message, true); }); }); } }, [icon('event_available')]));
            }
            trainerRow.appendChild(h('button', { class: 'icon-btn', title: 'Löschen', onclick: function () { deleteEventDialog(ev); } }, [icon('delete')]));
            card.appendChild(trainerRow);
          }
          stack.appendChild(card);
        });
        listContainer.appendChild(stack);
      }).catch(function (ex) { showError(listContainer, ex); });
    }
    groupFilter.addEventListener('change', loadEvents); typeFilter.addEventListener('change', loadEvents); dateFilter.addEventListener('change', loadEvents);
    loadEvents();
  }

  // ---------------------------------------------------------------------------
  // Trainer-Teilnehmerliste + Anwesenheitskontrolle
  // ---------------------------------------------------------------------------
  function openAttendanceList(ev) {
    var listNode = h('div'); var d;
    function load() {
      API.get('/events/' + ev.id + '/attendance').then(function (data) {
        clear(listNode);
        var members = data.members || [];
        var counts = data.counts || {};
        // Zusammenfassung
        var summary = h('div', { class: 'attendance-summary' });
        var statusOrder = ['registered', 'confirmed', 'present', 'pending', 'absent', 'cancelled'];
        statusOrder.forEach(function (s) { if (counts[s]) summary.appendChild(h('div', { class: 'attendance-summary-item' }, [h('span', { class: 'count' }, [String(counts[s])]), statusChip(s)])); });
        summary.appendChild(h('div', { class: 'attendance-summary-item' }, [h('span', { class: 'count' }, [String(data.totalMembers || 0)]), h('span', { class: 'muted' }, ['Gesamt'])]));
        listNode.appendChild(summary);

        // Modus-Info
        listNode.appendChild(h('div', { class: 'info-text', style: 'margin-bottom:8px' }, [icon('info'), MODE_LABELS[data.mode] || data.mode, ' – ', MODE_HINTS[data.mode] || '']));

        // Teilnehmerliste
        var list = h('div', { class: 'participant-list' });
        members.sort(function (a, b) { return a.userName.localeCompare(b.userName); });
        members.forEach(function (m) {
          var statusSel = h('select', { style: 'font:inherit;padding:4px 8px;border-radius:6px;border:1px solid var(--md-outline);background:var(--md-surface);color:var(--md-on-surface)' });
          ['registered', 'confirmed', 'present', 'pending', 'absent', 'cancelled'].forEach(function (s) {
            var opt = h('option', { value: s }, [STATUS_LABELS[s]]);
            if (m.status === s) opt.setAttribute('selected', 'selected');
            statusSel.appendChild(opt);
          });
          statusSel.addEventListener('change', function () {
            API.post('/events/' + ev.id + '/attendance/set-status', { userId: m.userId, status: statusSel.value })
              .then(function () { snack('Status geändert'); load(); }).catch(function (ex) { snack(ex.message, true); });
          });

          var row = h('div', { class: 'participant-row' }, [
            icon('person'),
            h('span', { class: 'participant-name' }, [esc(m.userName)]),
            m.note ? h('span', { class: 'participant-note' }, ['(' + esc(m.note) + ')']) : null,
            statusSel,
          ]);
          list.appendChild(row);
        });
        listNode.appendChild(list);

        // Anwesenheitskontrolle (Quick check-in)
        listNode.appendChild(h('hr', { class: 'divider' }));
        listNode.appendChild(h('h3', {}, ['Anwesenheitskontrolle']));
        listNode.appendChild(h('p', { class: 'muted' }, ['Hake ab, wer tatsächlich da ist. Alle nicht abgehakten werden auf „Abgemeldet" gesetzt.']));
        var checkBoxes = {};
        var checkList = h('div', { class: 'participant-list' });
        members.forEach(function (m) {
          var cb = h('input', { type: 'checkbox', class: 'check-in-cb' });
          if (m.status === 'present' || m.status === 'registered' || m.status === 'confirmed') cb.checked = true;
          checkBoxes[m.userId] = cb;
          checkList.appendChild(h('div', { class: 'participant-row' }, [cb, h('span', { class: 'participant-name' }, [esc(m.userName)]), statusChip(m.status)]));
        });
        listNode.appendChild(checkList);
        var checkInBtn = h('button', { class: 'btn', style: 'margin-top:12px', onclick: function () {
          var presentIds = Object.keys(checkBoxes).filter(function (k) { return checkBoxes[k].checked; });
          API.post('/events/' + ev.id + '/attendance/check-in', { presentUserIds: presentIds })
            .then(function () { snack('Anwesenheit gespeichert (' + presentIds.length + ' anwesend)'); load(); }).catch(function (ex) { snack(ex.message, true); });
        } }, [icon('how_to_reg'), 'Anwesenheit speichern']);
        listNode.appendChild(checkInBtn);
      }).catch(function (ex) { clear(listNode); listNode.appendChild(h('div', { class: 'error-text' }, [ex.message])); });
    }
    load();
    d = dialog(esc(ev.title) + ' – Teilnehmer', [listNode], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Schließen'])]);
  }

  // ---------------------------------------------------------------------------
  // Termin erstellen/bearbeiten
  // ---------------------------------------------------------------------------
  function askScope(ev, cb) {
    if (!ev.seriesId) { cb('single'); return; }
    var sel = h('select', {}, [h('option', { value: 'single' }, ['Nur dieser Termin']), h('option', { value: 'following' }, ['Dieser und folgende']), h('option', { value: 'all' }, ['Alle der Serie'])]);
    var d = dialog('Serientermin', [h('div', { class: 'field' }, [h('label', {}, ['Änderung anwenden auf']), sel])], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), h('button', { class: 'btn', onclick: function () { d.close(); cb(sel.value); } }, ['Weiter'])]);
  }
  function cancelEventDialog(ev) {
    var reason = fieldInput('Begründung', 'reason');
    var d = dialog('Termin absagen', [reason.wrap], [
      h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']),
      h('button', { class: 'btn danger', onclick: function () { var r = reason.input.value.trim(); if (!r) { snack('Begründung erforderlich', true); return; } d.close(); askScope(ev, function (scope) { API.post('/events/' + ev.id + '/cancel?scope=' + scope, { reason: r }).then(function () { snack('Abgesagt'); navigate('events'); }).catch(function (ex) { snack(ex.message, true); }); }); } }, ['Absagen']),
    ]);
  }
  function deleteEventDialog(ev) {
    askScope(ev, function (scope) {
      var d = dialog('Termin löschen', [h('p', {}, ['„' + esc(ev.title) + '" endgültig löschen?'])], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), h('button', { class: 'btn danger', onclick: function () { API.del('/events/' + ev.id + '?scope=' + scope).then(function () { d.close(); snack('Gelöscht'); navigate('events'); }).catch(function (ex) { snack(ex.message, true); }); } }, ['Löschen'])]);
    });
  }
  function toLocalInput(iso) { if (!iso) return ''; var dt = new Date(iso); return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

  function eventDialog(ev) {
    var editing = !!(ev && ev.id);
    var title = fieldInput('Titel', 'title', 'text', editing ? ev.title : '');
    var start = fieldInput('Beginn', 'startAt', 'datetime-local', editing ? toLocalInput(ev.startAt) : '');
    var end = fieldInput('Ende', 'endAt', 'datetime-local', editing ? toLocalInput(ev.endAt) : '');
    var loc = fieldInput('Ort (optional)', 'location', 'text', editing ? (ev.location || '') : '');
    var descWrap = h('div', { class: 'field' }, [h('label', {}, ['Beschreibung']), h('textarea', { name: 'description', rows: '2' }, [editing ? (ev.description || '') : ''])]);

    // Event-Typ
    var typeSel = h('select', {});
    [['training', 'Training'], ['match', 'Spiel'], ['event', 'Veranstaltung'], ['other', 'Sonstiges']].forEach(function (t) {
      var opt = h('option', { value: t[0] }, [t[1]]);
      if (editing && ev.eventType === t[0]) opt.setAttribute('selected', 'selected');
      typeSel.appendChild(opt);
    });

    // Anmeldemodus mit Erklärung
    var modeSel = h('select', {});
    var modeHint = h('div', { class: 'info-text', style: 'margin-top:4px' });
    [['signoff', 'Abmeldebasiert – Alle sind angemeldet, Abmeldung bei Verhinderung'],
     ['signup', 'Anmeldebasiert – Teilnehmer müssen sich aktiv anmelden'],
     ['confirmation', 'Bestätigung – Teilnehmer müssen bestätigen oder absagen']].forEach(function (m) {
      var opt = h('option', { value: m[0] }, [m[1]]);
      if (editing && ev.mode === m[0]) opt.setAttribute('selected', 'selected');
      modeSel.appendChild(opt);
    });
    function updateModeHint() { modeHint.textContent = MODE_HINTS[modeSel.value] || ''; }
    modeSel.addEventListener('change', updateModeHint);
    updateModeHint();

    var groupSel = h('select', {}, [h('option', { value: '' }, ['Mannschaft wählen…'])]);
    var err = h('div', { class: 'error-text' });
    API.get('/groups').then(function (groups) { (groups || []).forEach(function (g) { var opt = h('option', { value: g.id }, [g.name]); if (editing && ev.groupId === g.id) opt.setAttribute('selected', 'selected'); groupSel.appendChild(opt); }); }).catch(function () { err.textContent = 'Gruppen nicht geladen.'; });
    var signup = fieldInput('Anmeldefrist (optional)', 'signupDeadline', 'datetime-local', editing ? toLocalInput(ev.signupDeadline) : '');
    var withdraw = fieldInput('Abmeldefrist (optional)', 'withdrawDeadline', 'datetime-local', editing ? toLocalInput(ev.withdrawDeadline) : '');
    var confWin = fieldInput('Bestätigungsfrist (Min. vor Beginn)', 'confirmationWindowMinutes', 'number', editing && ev.confirmationWindowMinutes != null ? String(ev.confirmationWindowMinutes) : '');
    // Serie
    var rruleSel = h('select', {}, [h('option', { value: '' }, ['Einzeltermin']), h('option', { value: 'FREQ=DAILY' }, ['Täglich']), h('option', { value: 'FREQ=WEEKLY' }, ['Wöchentlich']), h('option', { value: 'FREQ=WEEKLY;INTERVAL=2' }, ['14-tägig']), h('option', { value: 'FREQ=MONTHLY' }, ['Monatlich'])]);
    var count = fieldInput('Anzahl Termine', 'count', 'number', '1');
    var d;
    function payload() {
      return { title: title.input.value.trim(), startAt: start.input.value ? new Date(start.input.value).toISOString() : undefined, endAt: end.input.value ? new Date(end.input.value).toISOString() : undefined,
        location: loc.input.value.trim() || undefined, description: descWrap.querySelector('textarea').value.trim() || undefined, mode: modeSel.value, eventType: typeSel.value, groupId: groupSel.value,
        signupDeadline: signup.input.value ? new Date(signup.input.value).toISOString() : undefined, withdrawDeadline: withdraw.input.value ? new Date(withdraw.input.value).toISOString() : undefined,
        confirmationWindowMinutes: confWin.input.value ? parseInt(confWin.input.value, 10) : undefined };
    }
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () {
      err.textContent = '';
      if (!title.input.value.trim() || !start.input.value || !end.input.value) { err.textContent = 'Titel, Beginn und Ende erforderlich.'; return; }
      if (!groupSel.value) { err.textContent = 'Bitte eine Mannschaft wählen.'; return; }
      if (editing) {
        askScope(ev, function (scope) { API.patch('/events/' + ev.id + '?scope=' + scope, payload()).then(function () { d.close(); snack('Aktualisiert'); navigate('events'); }).catch(function (ex) { err.textContent = ex.message; }); });
      } else {
        var body = payload();
        if (rruleSel.value) { body.rrule = rruleSel.value; body.count = parseInt(count.input.value, 10) || 1; }
        API.post('/events', body).then(function () { d.close(); snack('Termin erstellt'); navigate('events'); }).catch(function (ex) { err.textContent = ex.message; });
      }
    });
    var fields = [title.wrap, h('div', { class: 'field' }, [h('label', {}, ['Typ']), typeSel]), start.wrap, end.wrap, loc.wrap, descWrap,
      h('div', { class: 'field' }, [h('label', {}, ['Anmeldemodus']), modeSel, modeHint]),
      h('div', { class: 'field' }, [h('label', {}, ['Mannschaft']), groupSel]),
      signup.wrap, withdraw.wrap, confWin.wrap];
    if (!editing) fields.push(h('div', { class: 'field' }, [h('label', {}, ['Wiederholung']), rruleSel]), count.wrap);
    fields.push(err);
    d = dialog(editing ? 'Termin bearbeiten' : 'Termin erstellen', fields, [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Chat (unverändert)
  // ---------------------------------------------------------------------------
  function viewChat(node) {
    clear(node); var actions = [h('button', { class: 'btn', onclick: chatDialog }, [icon('add'), 'Chat'])];
    node.appendChild(sectionHead('Chat', actions)); loading(node);
    API.get('/chat/rooms').then(function (rooms) { clear(node); node.appendChild(sectionHead('Chat', actions));
      if (!rooms || !rooms.length) { node.appendChild(emptyState('chat', 'Keine Chats.', 'Starte einen neuen Chat.')); return; }
      var stack = h('div', { class: 'stack' });
      rooms.forEach(function (r) { var names = (r.participants || []).map(function (p) { return p.name; }).join(', ');
        stack.appendChild(h('div', { class: 'card clickable', onclick: function () { openRoom(r); } }, [h('div', { class: 'row' }, [icon(r.type === 'group' ? 'groups' : 'person'), h('div', {}, [h('div', { style: 'font-weight:500' }, [esc(r.name || names)]), h('div', { class: 'muted', style: 'font-size:13px' }, [names])])])])); });
      node.appendChild(stack);
    }).catch(function (ex) { showError(node, ex); });
  }
  function chatDialog() {
    var typeSel = h('select', {}, [h('option', { value: 'direct' }, ['Einzelchat']), h('option', { value: 'group' }, ['Gruppenchat'])]);
    var name = fieldInput('Chat-Name (Gruppe)', 'name'); var partsWrap = h('div', { class: 'stack', style: 'max-height:35vh;overflow-y:auto' }); var boxes = {}; var err = h('div', { class: 'error-text' }); var d;
    API.get('/users').then(function (users) { (users || []).filter(function (u) { return u.id !== state.me.id; }).forEach(function (u) { var cb = h('input', { type: 'checkbox' }); boxes[u.id] = cb; partsWrap.appendChild(h('label', { class: 'row', style: 'gap:8px' }, [cb, esc(u.name) + ' (' + u.role + ')'])); }); }).catch(function () {});
    var save = h('button', { class: 'btn' }, [icon('save'), 'Erstellen']);
    save.addEventListener('click', function () { var ids = Object.keys(boxes).filter(function (k) { return boxes[k].checked; }); API.post('/chat/rooms', { type: typeSel.value, name: name.input.value.trim() || undefined, participantIds: ids }).then(function () { d.close(); snack('Chat erstellt'); navigate('chat'); }).catch(function (ex) { err.textContent = ex.message; }); });
    d = dialog('Neuer Chat', [h('div', { class: 'field' }, [h('label', {}, ['Typ']), typeSel]), name.wrap, partsWrap, err], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }
  function openRoom(room) {
    var list = h('div', { class: 'stack', style: 'max-height:50vh;overflow-y:auto' }); var input = h('input', { placeholder: 'Nachricht…', style: 'flex:1' }); var d;
    d = dialog(room.name || 'Chat', [list, h('div', { class: 'row' }, [input, h('button', { class: 'btn', onclick: send }, [icon('send')])])], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Schließen'])]);
    function load() { API.get('/chat/rooms/' + room.id + '/messages').then(function (msgs) { clear(list); (msgs || []).forEach(function (m) { var isMine = m.senderId === state.me.id; list.appendChild(h('div', { class: 'row', style: isMine ? 'justify-content:flex-end' : '' }, [h('div', { style: 'flex:1;' + (isMine ? 'text-align:right' : '') }, [h('span', { class: 'muted', style: 'font-size:12px' }, [esc(m.senderName)]), h('div', {}, [m.deleted ? h('em', { class: 'muted' }, ['(gelöscht)']) : esc(m.body)])])])); }); list.scrollTop = list.scrollHeight; }); }
    function send() { var body = input.value.trim(); if (!body || !window.chatSocket) return; window.chatSocket.emit('chat:message', { roomId: room.id, body: body }); input.value = ''; }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    if (window.chatSocket) { window.chatSocket.emit('chat:join', room.id); window.chatSocket.on('chat:message', function (m) { if (m.roomId === room.id) load(); }); }
    load();
  }

  // ---------------------------------------------------------------------------
  // Remaining views (Messages, Users, Groups, Codes, Stats, Branding, System, SuAd, Profile, Subs, Profiles)
  // These are mostly unchanged from the previous version – included for completeness.
  // ---------------------------------------------------------------------------
  function viewMessages(node) {
    clear(node); var canManage = ['admin', 'coordinator', 'suad'].indexOf(state.me.role) >= 0; var manageMode = false; var actions = [];
    if (canManage) { actions.push(h('button', { class: 'btn text', onclick: function () { manageMode = !manageMode; load(); } }, [icon('manage_accounts'), 'Verwalten'])); actions.push(h('button', { class: 'btn', onclick: function () { messageDialog(null); } }, [icon('add'), 'Nachricht'])); }
    node.appendChild(sectionHead('Systemnachrichten', actions));
    function load() { loading(node); API.get(manageMode ? '/messages/manage' : '/messages').then(function (msgs) { clear(node); node.appendChild(sectionHead('Systemnachrichten', actions));
      if (!msgs || !msgs.length) { node.appendChild(emptyState('campaign', 'Keine Nachrichten.')); return; }
      var stack = h('div', { class: 'stack' });
      msgs.forEach(function (m) { var footer = manageMode ? h('div', {}, [h('div', { class: 'muted' }, [(m.isActive ? 'aktiv' : 'inaktiv')]), h('div', { class: 'row-actions' }, [h('button', { class: 'icon-btn', onclick: function () { messageDialog(m); } }, [icon('edit')]), h('button', { class: 'icon-btn', onclick: function () { API.del('/messages/' + m.id).then(function () { snack('Gelöscht'); load(); }); } }, [icon('delete')])])]) : h('div', { class: 'row' }, [h('button', { class: 'btn text', onclick: function () { API.post('/messages/' + m.id + '/dismiss', {}).then(function () { snack('Ausgeblendet'); load(); }); } }, [icon('visibility_off'), 'Ausblenden'])]);
        stack.appendChild(h('div', { class: 'card' }, [h('div', { class: 'row' }, [icon('info'), h('h3', { style: 'margin:0' }, [esc(m.title)])]), h('p', {}, [esc(m.body)]), footer])); });
      node.appendChild(stack); }).catch(function (ex) { showError(node, ex); }); }
    load();
  }
  function messageDialog(m) { var editing = !!m; var title = fieldInput('Titel', 'title', 'text', editing ? m.title : ''); var bodyWrap = h('div', { class: 'field' }, [h('label', {}, ['Text']), h('textarea', { rows: '3' }, [editing ? m.body : ''])]); var rolesInput = fieldInput('Zielrollen (Komma)', 'roles', 'text', editing ? (m.targetRoles || ['all']).join(',') : 'all'); var err = h('div', { class: 'error-text' }); var d;
    var save = h('button', { class: 'btn' }, [icon('save'), editing ? 'Speichern' : 'Senden']);
    save.addEventListener('click', function () { var body = { title: title.input.value.trim(), body: bodyWrap.querySelector('textarea').value.trim(), targetRoles: rolesInput.input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) };
      var p = editing ? API.patch('/messages/' + m.id, body) : API.post('/messages', body); p.then(function () { d.close(); snack('Gespeichert'); navigate('messages'); }).catch(function (ex) { err.textContent = ex.message; }); });
    d = dialog(editing ? 'Nachricht bearbeiten' : 'Neue Nachricht', [title.wrap, bodyWrap, rolesInput.wrap, err], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]); }

  function viewUsers(node) { clear(node); var actions = [h('button', { class: 'btn', onclick: function () { userDialog(null); } }, [icon('person_add'), 'Nutzer'])]; node.appendChild(sectionHead('Nutzerverwaltung', actions)); loading(node);
    API.get('/users').then(function (users) { clear(node); node.appendChild(sectionHead('Nutzerverwaltung', actions));
      var filter = h('input', { placeholder: 'Suchen…', style: 'width:100%;margin-bottom:12px;padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--md-outline);background:var(--md-surface);color:var(--md-on-surface);font:inherit' }); node.appendChild(filter);
      var table = h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', {}, ['Name']), h('th', {}, ['E-Mail']), h('th', {}, ['Rolle']), h('th', {}, ['Status']), h('th', {}, [''])])])]); var tbody = h('tbody');
      function render(list) { clear(tbody); if (!list || !list.length) { tbody.appendChild(h('tr', {}, [h('td', { colspan: '5', style: 'text-align:center;padding:24px' }, ['Keine Nutzer.'])])); return; }
        list.forEach(function (u) { tbody.appendChild(h('tr', {}, [h('td', {}, [h('a', { href: 'javascript:void 0', onclick: function () { userDialog(u); }, style: 'color:var(--md-primary);text-decoration:none;font-weight:500' }, [esc(u.name)])]), h('td', { class: 'muted' }, [esc(u.email || '—')]), h('td', {}, [h('span', { class: 'chip' }, [u.role])]), h('td', {}, [u.isActive ? h('span', { style: 'color:var(--md-success)' }, ['● aktiv']) : h('span', { style: 'color:var(--md-error)' }, ['● gesperrt'])]),
          h('td', {}, [h('div', { class: 'row-actions' }, [h('button', { class: 'icon-btn', title: 'Rechte', onclick: function () { userPermsDialog(u); } }, [icon('shield')]), h('button', { class: 'icon-btn', title: u.isActive ? 'Sperren' : 'Entsperren', onclick: function () { API.patch('/users/' + u.id, { isActive: !u.isActive }).then(function () { snack('Aktualisiert'); navigate('users'); }); } }, [icon(u.isActive ? 'lock' : 'lock_open')]), h('button', { class: 'icon-btn', title: 'Löschen', onclick: function () { var dd = dialog('Löschen?', [h('p', {}, ['„' + esc(u.name) + '" endgültig löschen?'])], [h('button', { class: 'btn text', onclick: function () { dd.close(); } }, ['Abbrechen']), h('button', { class: 'btn danger', onclick: function () { API.del('/users/' + u.id).then(function () { dd.close(); snack('Gelöscht'); navigate('users'); }); } }, ['Löschen'])]); } }, [icon('delete')])])])])); }); }
      render(users || []); filter.addEventListener('input', function () { var q = filter.value.trim().toLowerCase(); render((users || []).filter(function (u) { return !q || (u.name + ' ' + (u.email || '') + ' ' + u.role).toLowerCase().indexOf(q) >= 0; })); });
      table.appendChild(tbody); node.appendChild(h('div', { class: 'card' }, [table])); }).catch(function (ex) { showError(node, ex); }); }
  function userDialog(u) { var editing = !!u; var name = fieldInput('Name', 'name', 'text', editing ? u.name : ''); var email = fieldInput('E-Mail', 'email', 'email', editing ? (u.email || '') : ''); var roles = ['member', 'parent', 'teacher', 'coordinator', 'admin']; var roleSel = h('select', {}, roles.map(function (r) { return h('option', { value: r, selected: editing && u.role === r ? 'selected' : null }, [r]); })); var pw = fieldInput(editing ? 'Neues Passwort' : 'Passwort', 'password', 'password'); var err = h('div', { class: 'error-text' }); var d;
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () { var body = { name: name.input.value.trim(), email: email.input.value.trim() || null, role: roleSel.value }; if (pw.input.value) body.password = pw.input.value;
      var p = editing ? API.patch('/users/' + u.id, body) : API.post('/users', body); p.then(function () { d.close(); snack('Gespeichert'); navigate('users'); }).catch(function (ex) { err.textContent = ex.message; }); });
    d = dialog(editing ? 'Nutzer bearbeiten' : 'Neuer Nutzer', [name.wrap, email.wrap, h('div', { class: 'field' }, [h('label', {}, ['Rolle']), roleSel]), pw.wrap, err], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]); }
  function userPermsDialog(u) { var checks = h('div', { class: 'stack', style: 'max-height:40vh;overflow-y:auto' }); var boxes = {}; var err = h('div', { class: 'error-text' }); var d;
    Promise.all([API.get('/permission-profiles/catalog'), API.get('/users/' + u.id + '/permission-overrides')]).then(function (r) { var cat = r[0] || []; var existing = {}; (r[1] || []).forEach(function (o) { if (o.permissionKey) existing[o.permissionKey] = o.value; }); cat.forEach(function (c) { var cb = h('input', { type: 'checkbox' }); if (existing[c.key]) cb.checked = true; boxes[c.key] = cb; checks.appendChild(h('label', { class: 'row', style: 'gap:8px;align-items:flex-start' }, [cb, h('div', {}, [h('div', {}, [c.key]), h('div', { class: 'muted' }, [esc(c.description)])])])); }); }).catch(function (ex) { err.textContent = ex.message; });
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () { var items = Object.keys(boxes).filter(function (k) { return boxes[k].checked; }).map(function (k) { return { permissionKey: k, value: true }; }); API.put('/users/' + u.id + '/permissions', { items: items }).then(function () { d.close(); snack('Gespeichert'); }).catch(function (ex) { err.textContent = ex.message; }); });
    d = dialog('Rechte – ' + esc(u.name), [checks, err], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]); }

  function viewGroups(node) { clear(node); var actions = [h('button', { class: 'btn', onclick: function () { groupDialog(null); } }, [icon('add'), 'Mannschaft'])]; node.appendChild(sectionHead('Mannschaften', actions)); loading(node);
    API.get('/groups').then(function (groups) { clear(node); node.appendChild(sectionHead('Mannschaften', actions));
      if (!groups || !groups.length) { node.appendChild(emptyState('groups', 'Keine Mannschaften.', 'Erstelle deine erste Mannschaft.')); return; }
      var grid = h('div', { class: 'grid' });
      groups.forEach(function (g) { grid.appendChild(h('div', { class: 'card clickable', onclick: function () { groupDetailDialog(g); } }, [h('div', { class: 'row' }, [g.color ? h('span', { class: 'group-color-dot', style: 'background:' + g.color + ';width:16px;height:16px' }) : icon('groups'), h('h3', { style: 'flex:1;margin:0' }, [esc(g.name)]), h('span', { class: 'chip' }, [String(g.memberCount != null ? g.memberCount : 0) + ' Spieler'])]), g.description ? h('p', { class: 'muted', style: 'margin:8px 0 0' }, [esc(g.description)]) : null])); });
      node.appendChild(grid); }).catch(function (ex) { showError(node, ex); }); }
  function groupDialog(g) { var editing = !!g; var name = fieldInput('Name', 'name', 'text', editing ? g.name : ''); var desc = fieldInput('Beschreibung', 'description', 'text', editing ? (g.description || '') : ''); var color = fieldInput('Farbe (Hex)', 'color', 'text', editing ? (g.color || '') : ''); var err = h('div', { class: 'error-text' }); var d;
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () { var body = { name: name.input.value.trim(), description: desc.input.value.trim() || null, color: color.input.value.trim() || null }; if (!body.name) { err.textContent = 'Name erforderlich.'; return; } var p = editing ? API.patch('/groups/' + g.id, body) : API.post('/groups', body); p.then(function () { d.close(); snack('Gespeichert'); navigate('groups'); }).catch(function (ex) { err.textContent = ex.message; }); });
    d = dialog(editing ? 'Bearbeiten' : 'Neue Mannschaft', [name.wrap, desc.wrap, color.wrap, err], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]); }
  function groupDetailDialog(g) { var err = h('div', { class: 'error-text' }); var memberList = h('div', { class: 'stack' }); var d;
    function loadMembers() { API.get('/groups/' + g.id).then(function (detail) { clear(memberList); var members = detail.members || []; if (!members.length) { memberList.appendChild(h('div', { class: 'muted' }, ['Keine Spieler.'])); return; }
      members.forEach(function (m) { memberList.appendChild(h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--md-outline-variant)' }, [icon('person'), h('div', { style: 'flex:1' }, [esc(m.name)]), h('span', { class: 'chip' }, [m.role]), h('button', { class: 'icon-btn', title: 'Entfernen', onclick: function () { API.del('/groups/' + g.id + '/members/' + m.id).then(function () { snack('Entfernt'); loadMembers(); }); } }, [icon('person_remove')])])); }); }).catch(function (ex) { err.textContent = ex.message; }); }
    var addSel = h('select', {}, [h('option', { value: '' }, ['Spieler wählen…'])]); API.get('/users').then(function (users) { (users || []).forEach(function (u) { addSel.appendChild(h('option', { value: u.id }, [u.name + ' (' + u.role + ')'])); }); }).catch(function () {});
    var addBtn = h('button', { class: 'btn tonal', onclick: function () { if (!addSel.value) return; API.post('/groups/' + g.id + '/members', { userId: addSel.value }).then(function () { addSel.value = ''; snack('Hinzugefügt'); loadMembers(); }).catch(function (ex) { snack(ex.message, true); }); } }, [icon('person_add'), 'Hinzufügen']);
    loadMembers();
    d = dialog(esc(g.name), [g.description ? h('p', { class: 'muted' }, [esc(g.description)]) : null, h('hr', { class: 'divider' }), h('h3', {}, ['Spieler']), memberList, h('hr', { class: 'divider' }), h('div', { class: 'field' }, [h('label', {}, ['Spieler hinzufügen']), addSel]), h('div', { class: 'row' }, [addBtn]), err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); groupDialog(g); } }, [icon('edit'), 'Bearbeiten']), h('button', { class: 'btn text', style: 'color:var(--md-error)', onclick: function () { var cd = dialog('Löschen?', [h('p', {}, ['Mannschaft „' + esc(g.name) + '" löschen?'])], [h('button', { class: 'btn text', onclick: function () { cd.close(); } }, ['Abbrechen']), h('button', { class: 'btn danger', onclick: function () { API.del('/groups/' + g.id).then(function () { cd.close(); d.close(); snack('Gelöscht'); navigate('groups'); }); } }, ['Löschen'])]); } }, [icon('delete'), 'Löschen']), h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Schließen'])]); }

  function viewCodes(node) { clear(node); var actions = [h('button', { class: 'btn', onclick: codeDialog }, [icon('add'), 'Code'])]; node.appendChild(sectionHead('Registrierungscodes', actions)); loading(node);
    API.get('/registration-codes').then(function (codes) { clear(node); node.appendChild(sectionHead('Registrierungscodes', actions));
      if (!codes || !codes.length) { node.appendChild(emptyState('qr_code_2', 'Keine Codes.', 'Erstelle einen Code für neue Spieler/Eltern.')); return; }
      var table = h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', {}, ['Code']), h('th', {}, ['Rolle']), h('th', {}, ['Nutzung']), h('th', {}, [''])])])]); var tbody = h('tbody');
      codes.forEach(function (c) { tbody.appendChild(h('tr', {}, [h('td', {}, [h('code', { style: 'background:var(--md-surface-container-high);padding:4px 8px;border-radius:4px;font-weight:500' }, [esc(c.code)])]), h('td', {}, [esc(c.role)]), h('td', {}, [(c.useCount || 0) + (c.maxUses ? '/' + c.maxUses : '')]),
        h('td', {}, [h('button', { class: 'icon-btn', onclick: function () { API.del('/registration-codes/' + c.id).then(function () { snack('Deaktiviert'); navigate('codes'); }); } }, [icon('block')])])])); });
      table.appendChild(tbody); node.appendChild(h('div', { class: 'card' }, [table])); }).catch(function (ex) { showError(node, ex); }); }
  function codeDialog() { var groupSel = h('select', {}, [h('option', { value: '' }, ['Mannschaft…'])]); var err = h('div', { class: 'error-text' }); API.get('/groups').then(function (groups) { (groups || []).forEach(function (g) { groupSel.appendChild(h('option', { value: g.id }, [g.name])); }); }).catch(function () {});
    var roleSel = h('select', {}, ['member', 'parent', 'teacher', 'coordinator'].map(function (r) { return h('option', { value: r }, [r]); })); var maxUses = fieldInput('Max. Nutzungen', 'maxUses', 'number'); var d;
    var save = h('button', { class: 'btn' }, [icon('save'), 'Erzeugen']);
    save.addEventListener('click', function () { if (!groupSel.value) { err.textContent = 'Mannschaft wählen.'; return; } API.post('/registration-codes', { groupId: groupSel.value, role: roleSel.value, maxUses: maxUses.input.value ? parseInt(maxUses.input.value, 10) : undefined }).then(function (c) { d.close(); snack('Code: ' + (c && c.code ? c.code : 'erstellt')); navigate('codes'); }).catch(function (ex) { err.textContent = ex.message; }); });
    d = dialog('Neuer Code', [h('div', { class: 'field' }, [h('label', {}, ['Mannschaft']), groupSel]), h('div', { class: 'field' }, [h('label', {}, ['Rolle']), roleSel]), maxUses.wrap, err], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]); }

  function viewStats(node) { clear(node); var actions = [h('button', { class: 'btn tonal', onclick: function () { window.location.href = '/api/reports/export?format=csv'; } }, [icon('download'), 'CSV'])]; node.appendChild(sectionHead('Statistik', actions)); skeletonCards(node, 4);
    Promise.all([API.get('/statistics/overview'), API.get('/statistics/attendance')]).then(function (r) { var s = r[0] || {}, att = r[1] || {}; clear(node); node.appendChild(sectionHead('Statistik', actions));
      var grid = h('div', { class: 'grid' }); Object.keys(s).forEach(function (k) { grid.appendChild(h('div', { class: 'card' }, [h('div', { class: 'stat-number' }, [String(s[k])]), h('div', { class: 'stat-label' }, [k])])); }); node.appendChild(grid);
      var byStatus = att.byStatus || {}; var attCard = h('div', { class: 'card', style: 'margin-top:16px' }, [h('h3', {}, ['Anwesenheit'])]);
      Object.keys(byStatus).forEach(function (k) { var pct = att.total ? Math.round(byStatus[k] / att.total * 100) : 0; attCard.appendChild(h('div', { class: 'row', style: 'margin:6px 0' }, [statusChip(k), h('div', { style: 'flex:1;height:8px;background:var(--md-surface-container-high);border-radius:4px;overflow:hidden' }, [h('div', { style: 'height:100%;width:' + pct + '%;background:var(--md-primary);border-radius:4px;transition:width 0.5s' })]), h('span', { class: 'muted' }, [byStatus[k] + ' (' + pct + '%)'])])); });
      node.appendChild(attCard); }).catch(function (ex) { showError(node, ex); }); }

  function viewBranding(node) { clear(node); node.appendChild(sectionHead('Branding')); loading(node);
    API.get('/branding').then(function (b) { clear(node); node.appendChild(sectionHead('Branding'));
      var appName = fieldInput('App-Name', 'appName', 'text', b.appName); var color = fieldInput('Primärfarbe', 'primaryColor', 'text', b.primaryColor); var support = fieldInput('Support', 'supportContact', 'text', b.supportContact);
      var modeSel = h('select', {}, ['system', 'light', 'dark'].map(function (m) { return h('option', { value: m, selected: b.themeMode === m ? 'selected' : null }, [m]); }));
      var save = h('button', { class: 'btn', onclick: function () { API.put('/branding', { appName: appName.input.value.trim(), primaryColor: color.input.value.trim(), supportContact: support.input.value.trim(), themeMode: modeSel.value }).then(function (nb) { applyBranding(nb); snack('Gespeichert'); renderShell(); }).catch(function (ex) { snack(ex.message, true); }); } }, [icon('save'), 'Speichern']);
      node.appendChild(h('div', { class: 'card', style: 'max-width:480px' }, [appName.wrap, color.wrap, support.wrap, h('div', { class: 'field' }, [h('label', {}, ['Theme']), modeSel]), h('div', { class: 'row' }, [save])])); }).catch(function (ex) { showError(node, ex); }); }

  function viewSystem(node) { clear(node); node.appendChild(sectionHead('System')); skeletonCards(node, 4);
    API.get('/system/status').then(function (s) { clear(node); node.appendChild(sectionHead('System'));
      var grid = h('div', { class: 'grid' }); grid.appendChild(h('div', { class: 'card' }, [h('h3', {}, ['Laufzeit']), h('div', { class: 'stat-number' }, [Math.round((s.uptimeSeconds || 0) / 60) + ' min'])]));
      var counts = s.counts || {}; grid.appendChild(h('div', { class: 'card' }, [h('h3', {}, ['Kennzahlen'])].concat(Object.keys(counts).map(function (k) { return h('div', { class: 'row', style: 'justify-content:space-between;padding:4px 0' }, [h('span', {}, [k]), h('strong', {}, [String(counts[k])])]); }))));
      node.appendChild(grid); }).catch(function (ex) { showError(node, ex); }); }

  function viewSuad(node) { clear(node); node.appendChild(sectionHead('Interner Bereich')); loading(node);
    API.get('/internal/suad/audit-logs').then(function (logs) { clear(node); node.appendChild(sectionHead('Interner Bereich'));
      var table = h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', {}, ['Zeit']), h('th', {}, ['Aktion']), h('th', {}, ['Akteur']), h('th', {}, ['Ziel'])])])]); var tbody = h('tbody');
      (logs || []).slice(0, 100).forEach(function (l) { tbody.appendChild(h('tr', {}, [h('td', { class: 'muted' }, [fmtDate(l.createdAt)]), h('td', {}, [esc(l.action)]), h('td', { class: 'muted' }, [esc(l.actorId)]), h('td', { class: 'muted' }, [esc(l.targetType) + ':' + esc(l.targetId)])])); });
      table.appendChild(tbody); node.appendChild(h('div', { class: 'card' }, [h('h3', {}, ['Audit-Log']), table])); }).catch(function (ex) { showError(node, ex); }); }

  function viewProfile(node) { clear(node); node.appendChild(sectionHead('Mein Profil')); var me = state.me;
    node.appendChild(h('div', { class: 'card', style: 'max-width:480px' }, [h('div', { class: 'row', style: 'gap:16px' }, [h('div', { style: 'width:56px;height:56px;border-radius:50%;background:var(--md-primary-container);display:grid;place-items:center' }, [h('span', { class: 'material-symbols-outlined', style: 'font-size:32px;color:var(--md-on-primary-container)' }, ['person'])]), h('div', { style: 'flex:1' }, [h('h3', { style: 'margin:0' }, [esc(me.name)]), h('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, [h('span', { class: 'chip' }, [me.role])].concat((me.badges || []).map(function (b) { return h('span', { class: 'chip selected' }, [b]); }))), me.email ? h('div', { class: 'muted', style: 'margin-top:4px' }, [me.email]) : null])])]));
    // Self-service edit
    var editName = fieldInput('Name', 'name', 'text', me.name); var editEmail = fieldInput('E-Mail', 'email', 'email', me.email || ''); var err = h('div', { class: 'error-text' });
    var saveProfile = h('button', { class: 'btn', onclick: function () { err.textContent = ''; var body = {}; if (editName.input.value.trim() !== me.name) body.name = editName.input.value.trim(); if ((editEmail.input.value.trim() || null) !== (me.email || null)) body.email = editEmail.input.value.trim() || null; if (!Object.keys(body).length) { snack('Keine Änderungen'); return; } API.patch('/auth/me', body).then(function () { snack('Aktualisiert'); boot(); }).catch(function (ex) { err.textContent = ex.message; }); } }, [icon('save'), 'Speichern']);
    node.appendChild(h('div', { class: 'card', style: 'max-width:480px;margin-top:16px' }, [h('h3', {}, ['Profil bearbeiten']), editName.wrap, editEmail.wrap, err, h('div', { class: 'row' }, [saveProfile])]));
    // Password
    var curPw = fieldInput('Aktuelles Passwort', 'currentPassword', 'password'); var newPw = fieldInput('Neues Passwort (min. 8)', 'newPassword', 'password'); var newPw2 = fieldInput('Bestätigen', 'newPassword2', 'password'); var pwErr = h('div', { class: 'error-text' });
    var savePw = h('button', { class: 'btn', onclick: function () { pwErr.textContent = ''; if (!curPw.input.value) { pwErr.textContent = 'Aktuelles Passwort nötig.'; return; } if (newPw.input.value.length < 8) { pwErr.textContent = 'Min. 8 Zeichen.'; return; } if (newPw.input.value !== newPw2.input.value) { pwErr.textContent = 'Stimmen nicht überein.'; return; } API.patch('/auth/me', { currentPassword: curPw.input.value, newPassword: newPw.input.value }).then(function () { snack('Passwort geändert'); curPw.input.value = ''; newPw.input.value = ''; newPw2.input.value = ''; }).catch(function (ex) { pwErr.textContent = ex.message; }); } }, [icon('lock'), 'Ändern']);
    node.appendChild(h('div', { class: 'card', style: 'max-width:480px;margin-top:16px' }, [h('h3', {}, ['Passwort ändern']), curPw.wrap, newPw.wrap, newPw2.wrap, pwErr, h('div', { class: 'row' }, [savePw])]));
    // Activate Special
    var code = fieldInput('Code', 'code'); var pw = fieldInput('Sonderkennwort', 'specialPassword', 'password'); var specErr = h('div', { class: 'error-text' });
    node.appendChild(h('div', { class: 'card', style: 'max-width:480px;margin-top:16px' }, [h('h3', {}, ['Activate Special']), h('p', { class: 'muted' }, ['Code zur Badge-Freischaltung.']), code.wrap, pw.wrap, specErr,
      h('div', { class: 'row' }, [h('button', { class: 'btn tonal', onclick: function () { specErr.textContent = ''; API.post('/internal/suad/activate-special', { code: code.input.value.trim(), specialPassword: pw.input.value || undefined }).then(function (r) { if (r.recoveryKey) dialog('Recovery-Key', [h('div', { class: 'card' }, [h('code', {}, [r.recoveryKey])])], [h('button', { class: 'btn', onclick: function (e) { e.target.closest('.dialog-scrim').remove(); boot(); } }, ['Verstanden'])]); else { snack('Freigeschaltet'); boot(); } }).catch(function (ex) { specErr.textContent = ex.message; }); } }, [icon('workspace_premium'), 'Freischalten'])])])); }

  function viewSubs(node) { clear(node); var actions = [h('button', { class: 'btn', onclick: subDialog }, [icon('add'), 'Anfrage'])]; node.appendChild(sectionHead('Vertretungen', actions)); loading(node);
    API.get('/substitutions').then(function (subs) { clear(node); node.appendChild(sectionHead('Vertretungen', actions));
      if (!subs || !subs.length) { node.appendChild(emptyState('swap_horiz', 'Keine Vertretungen.')); return; }
      var stack = h('div', { class: 'stack' });
      subs.forEach(function (s) { var row = h('div', { class: 'row-actions', style: 'margin-top:8px' });
        if (s.status === 'pending') { row.appendChild(h('button', { class: 'btn tonal', onclick: function () { API.patch('/substitutions/' + s.id, { status: 'confirmed' }).then(function () { snack('Übernommen'); navigate('subs'); }); } }, [icon('check'), 'Übernehmen'])); row.appendChild(h('button', { class: 'btn outlined', onclick: function () { API.patch('/substitutions/' + s.id, { status: 'rejected' }).then(function () { snack('Abgelehnt'); navigate('subs'); }); } }, [icon('close'), 'Ablehnen'])); }
        stack.appendChild(h('div', { class: 'card' }, [h('div', { class: 'row' }, [h('h3', { style: 'flex:1;margin:0' }, [esc(s.event ? s.event.title : '—')]), h('span', { class: 'chip status-' + s.status }, [STATUS_LABELS[s.status] || s.status])]), h('div', { class: 'muted' }, [(s.event ? fmtDateFriendly(s.event.startAt) : '')]), row])); });
      node.appendChild(stack); }).catch(function (ex) { showError(node, ex); }); }
  function subDialog() { var evSel = h('select', {}, [h('option', { value: '' }, ['Termin…'])]); var noteWrap = h('div', { class: 'field' }, [h('label', {}, ['Notiz']), h('textarea', { rows: '2' })]); var err = h('div', { class: 'error-text' }); var d;
    API.get('/events?from=' + encodeURIComponent(new Date().toISOString())).then(function (events) { (events || []).forEach(function (ev) { evSel.appendChild(h('option', { value: ev.id }, [ev.title + ' · ' + fmtDateFriendly(ev.startAt)])); }); }).catch(function () {});
    var save = h('button', { class: 'btn' }, [icon('save'), 'Anfragen']);
    save.addEventListener('click', function () { if (!evSel.value) { err.textContent = 'Termin wählen.'; return; } API.post('/substitutions', { eventId: evSel.value, note: noteWrap.querySelector('textarea').value.trim() || undefined }).then(function () { d.close(); snack('Angefragt'); navigate('subs'); }).catch(function (ex) { err.textContent = ex.message; }); });
    d = dialog('Vertretung anfragen', [h('div', { class: 'field' }, [h('label', {}, ['Termin']), evSel]), noteWrap, err], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]); }

  function viewProfiles(node) { clear(node); var actions = [h('button', { class: 'btn', onclick: function () { profileDialog(null); } }, [icon('add'), 'Profil'])]; node.appendChild(sectionHead('Rechteprofile', actions)); loading(node);
    API.get('/permission-profiles').then(function (profiles) { clear(node); node.appendChild(sectionHead('Rechteprofile', actions));
      if (!profiles || !profiles.length) { node.appendChild(emptyState('shield_person', 'Keine Profile.')); return; }
      var grid = h('div', { class: 'grid' });
      profiles.forEach(function (p) { grid.appendChild(h('div', { class: 'card' }, [h('div', { class: 'row' }, [icon('shield_person'), h('h3', { style: 'flex:1;margin:0' }, [esc(p.name)])]), h('div', { class: 'row-actions' }, [h('button', { class: 'icon-btn', onclick: function () { profileDialog(p); } }, [icon('edit')]), h('button', { class: 'icon-btn', onclick: function () { API.del('/permission-profiles/' + p.id).then(function () { snack('Gelöscht'); navigate('profiles'); }); } }, [icon('delete')])])])); });
      node.appendChild(grid); }).catch(function (ex) { showError(node, ex); }); }
  function profileDialog(profile) { var editing = !!profile; var name = fieldInput('Name', 'name', 'text', editing ? profile.name : ''); var err = h('div', { class: 'error-text' }); var checks = h('div', { class: 'stack', style: 'max-height:40vh;overflow-y:auto' }); var boxes = {}; var d;
    API.get('/permission-profiles/catalog').then(function (cat) { var existing = {}; (editing && profile.items ? profile.items : []).forEach(function (it) { existing[it.permissionKey] = it.value; }); (cat || []).forEach(function (c) { var cb = h('input', { type: 'checkbox' }); if (existing[c.key]) cb.checked = true; boxes[c.key] = cb; checks.appendChild(h('label', { class: 'row', style: 'gap:8px;align-items:flex-start' }, [cb, h('div', {}, [h('div', {}, [c.key]), h('div', { class: 'muted' }, [esc(c.description)])])])); }); });
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () { var items = Object.keys(boxes).filter(function (k) { return boxes[k].checked; }).map(function (k) { return { permissionKey: k, value: true }; }); var body = { name: name.input.value.trim(), items: items }; var p = editing ? API.patch('/permission-profiles/' + profile.id, body) : API.post('/permission-profiles', body); p.then(function () { d.close(); snack('Gespeichert'); navigate('profiles'); }).catch(function (ex) { err.textContent = ex.message; }); });
    d = dialog(editing ? 'Profil bearbeiten' : 'Neues Profil', [name.wrap, checks, err], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]); }

  // ---------------------------------------------------------------------------
  // Socket.IO
  // ---------------------------------------------------------------------------
  function initSocket() { if (window.chatSocket || !window.io) return; try { window.chatSocket = window.io({ withCredentials: true }); } catch (e) {} }
  function loadSocketIO() { if (window.io) { initSocket(); return; } var s = document.createElement('script'); s.src = '/socket.io/socket.io.js'; s.onload = initSocket; document.head.appendChild(s); }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------
  function logout() { API.post('/auth/logout', {}).catch(function () {}).then(function () { state.me = null; if (window.chatSocket) { try { window.chatSocket.disconnect(); } catch (e) {} window.chatSocket = null; } renderAuth('login'); }); }
  function boot() {
    return API.get('/branding').catch(function () { return {}; }).then(function (b) { applyBranding(b || {});
      return API.get('/auth/me').then(function (me) { state.me = me; var hash = (location.hash || '').replace('#/', '');
        currentView = hash && navFor(me.role).some(function (i) { return i.id === hash; }) ? hash : 'dashboard';
        renderShell(); loadSocketIO(); }).catch(function () { renderAuth('login'); }); });
  }
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  boot().catch(function () { renderAuth('login'); });
})();
