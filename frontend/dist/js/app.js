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

  var openDialogs = [];
  function closeAllDialogs() { openDialogs.slice().forEach(function (c) { c(); }); }
  function dialog(title, contentNodes, actions) {
    var scrim = h('div', { class: 'dialog-scrim' });
    function close() {
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      var i = openDialogs.indexOf(close);
      if (i >= 0) openDialogs.splice(i, 1);
    }
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    var d = h('div', { class: 'dialog' }, [h('h2', {}, [title])]);
    contentNodes.forEach(function (n) { d.appendChild(n); });
    var act = h('div', { class: 'dialog-actions' });
    (actions || []).forEach(function (a) { act.appendChild(a); });
    d.appendChild(act);
    scrim.appendChild(d);
    document.body.appendChild(scrim);
    openDialogs.push(close);
    return { close: close, el: d };
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openDialogs.length) {
      e.preventDefault();
      openDialogs[openDialogs.length - 1]();
    }
  });

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
      h('button', { class: tab === 'login' ? 'active' : '', onclick: function () { if (tab !== 'login') renderAuth('login'); } }, ['Anmelden']),
      h('button', { class: tab === 'register' ? 'active' : '', onclick: function () { if (tab !== 'register') renderAuth('register'); } }, ['Registrieren']),
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
    closeAllDialogs();
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
      subs: viewSubs, profiles: viewProfiles,
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
    var myId = state.me.id;
    if (ev.mode === 'open') {
      wrap.appendChild(h('button', { class: 'btn tonal', onclick: function () { act('/attendance', { action: 'register' }, 'Anmeldung'); } }, [icon('check'), 'Anmelden']));
      wrap.appendChild(h('button', { class: 'btn outlined', onclick: function () { act('/attendance', { action: 'withdraw' }, 'Abmeldung'); } }, [icon('close'), 'Abmelden']));
    } else if (ev.mode === 'request') {
      wrap.appendChild(h('button', { class: 'btn tonal', onclick: function () { act('/attendance', { action: 'register' }, 'Anfrage'); } }, [icon('front_hand'), 'Teilnahme anfragen']));
      wrap.appendChild(h('button', { class: 'btn outlined', onclick: function () { act('/attendance', { action: 'withdraw' }, 'Abmeldung'); } }, [icon('close'), 'Abmelden']));
    } else {
      wrap.appendChild(h('span', { class: 'chip' }, ['Geschlossen']));
    }
    // Zusage/Absage im Bestätigungsfenster
    if (ev.confirmationWindowMinutes != null) {
      wrap.appendChild(h('button', { class: 'btn text', onclick: function () { act('/attendance/' + myId + '/confirm', {}, 'Zusage'); } }, [icon('event_available'), 'Zusagen']));
      wrap.appendChild(h('button', { class: 'btn text', onclick: function () { act('/attendance/' + myId + '/decline', {}, 'Absage'); } }, [icon('event_busy'), 'Absagen']));
    }
    return wrap;
  }

  function viewEvents(node) {
    clear(node);
    var canManage = ['admin', 'coordinator', 'teacher', 'suad'].indexOf(state.me.role) >= 0;
    var actions = [];
    if (canManage) actions.push(h('button', { class: 'btn', onclick: function () { eventDialog(); } }, [icon('add'), 'Termin']));
    node.appendChild(sectionHead('Termine', actions));
    loading(node);
    API.get('/events').then(function (events) {
      clear(node);
      node.appendChild(sectionHead('Termine', actions));
      if (!events || !events.length) { node.appendChild(h('div', { class: 'empty' }, [icon('calendar_month'), h('div', {}, ['Keine Termine.'])])); return; }
      var stack = h('div', { class: 'stack' });
      events.forEach(function (ev) {
        var headRow = h('div', { class: 'row' }, [
          h('h3', { style: 'flex:1;margin:0' }, [esc(ev.title)]),
          ev.seriesId ? h('span', { class: 'chip', title: 'Serientermin' }, ['Serie']) : null,
          h('span', { class: 'chip' }, [ev.mode]),
        ]);
        var card = h('div', { class: 'card' }, [
          headRow,
          h('div', { class: 'muted' }, [fmtDate(ev.startAt) + (ev.location ? ' · ' + esc(ev.location) : '')]),
          ev.description ? h('p', {}, [esc(ev.description)]) : null,
          ev.isCancelled ? h('div', { class: 'error-text' }, ['Ausgefallen: ' + esc(ev.cancelReason || '')]) : attendanceButtons(ev),
        ]);
        if (canManage) card.appendChild(eventManageRow(ev));
        stack.appendChild(card);
      });
      node.appendChild(stack);
    }).catch(function (ex) { showError(node, ex); });
  }

  function askScope(ev, cb) {
    if (!ev.seriesId) { cb('single'); return; }
    var sel = h('select', {}, [
      h('option', { value: 'single' }, ['Nur dieser Termin']),
      h('option', { value: 'following' }, ['Dieser und folgende']),
      h('option', { value: 'all' }, ['Alle der Serie']),
    ]);
    var d = dialog('Serientermin – Umfang', [h('div', { class: 'field' }, [h('label', {}, ['Änderung anwenden auf']), sel])], [
      h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']),
      h('button', { class: 'btn', onclick: function () { d.close(); cb(sel.value); } }, ['Weiter']),
    ]);
  }

  function eventManageRow(ev) {
    var row = h('div', { class: 'row-actions', style: 'margin-top:8px;border-top:1px solid var(--md-outline-variant);padding-top:8px' });
    row.appendChild(h('button', { class: 'icon-btn', title: 'Bearbeiten', onclick: function () { eventDialog(ev); } }, [icon('edit')]));
    if (ev.isCancelled) {
      row.appendChild(h('button', { class: 'icon-btn', title: 'Ausfall aufheben', onclick: function () {
        askScope(ev, function (scope) {
          API.del('/events/' + ev.id + '/cancel?scope=' + scope).then(function () { snack('Ausfall aufgehoben'); navigate('events'); }).catch(function (ex) { snack(ex.message, true); });
        });
      } }, [icon('event_available')]));
    } else {
      row.appendChild(h('button', { class: 'icon-btn', title: 'Absagen (Ausfall)', onclick: function () {
        var reason = fieldInput('Begründung', 'reason');
        var d = dialog('Termin absagen', [reason.wrap], [
          h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']),
          h('button', { class: 'btn danger', onclick: function () {
            var r = reason.input.value.trim();
            if (!r) { snack('Begründung erforderlich', true); return; }
            d.close();
            askScope(ev, function (scope) {
              API.post('/events/' + ev.id + '/cancel?scope=' + scope, { reason: r }).then(function () { snack('Termin abgesagt'); navigate('events'); }).catch(function (ex) { snack(ex.message, true); });
            });
          } }, ['Absagen']),
        ]);
      } }, [icon('event_busy')]));
    }
    row.appendChild(h('button', { class: 'icon-btn', title: 'Löschen', onclick: function () {
      askScope(ev, function (scope) {
        var d = dialog('Termin löschen', [h('p', {}, ['„' + esc(ev.title) + '“ wirklich löschen?'])], [
          h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']),
          h('button', { class: 'btn danger', onclick: function () {
            API.del('/events/' + ev.id + '?scope=' + scope).then(function () { d.close(); snack('Gelöscht'); navigate('events'); }).catch(function (ex) { snack(ex.message, true); });
          } }, ['Löschen']),
        ]);
      });
    } }, [icon('delete')]));
    return row;
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    var dt = new Date(iso);
    var off = dt.getTimezoneOffset() * 60000;
    return new Date(dt.getTime() - off).toISOString().slice(0, 16);
  }

  // Tage zwischen zwei Terminen einer Serie, passend zur Backend-Logik.
  function rruleIntervalDays(rrule) {
    if (!rrule) return 0;
    var m = /INTERVAL=(\d+)/i.exec(rrule);
    var mult = m ? parseInt(m[1], 10) : 1;
    var base = /WEEKLY/i.test(rrule) ? 7 : /MONTHLY/i.test(rrule) ? 30 : 1;
    return base * mult;
  }

  function eventDialog(ev) {
    var editing = !!(ev && ev.id);
    var title = fieldInput('Titel', 'title', 'text', editing ? ev.title : '');
    var start = fieldInput('Beginn', 'startAt', 'datetime-local', editing ? toLocalInput(ev.startAt) : '');
    var end = fieldInput('Ende', 'endAt', 'datetime-local', editing ? toLocalInput(ev.endAt) : '');
    var loc = fieldInput('Ort (optional)', 'location', 'text', editing ? (ev.location || '') : '');
    var descWrap = h('div', { class: 'field' }, [h('label', {}, ['Beschreibung']), h('textarea', { name: 'description', rows: '2' }, [editing ? (ev.description || '') : ''])]);
    var modeSel = h('select', { name: 'mode' }, [
      h('option', { value: 'open', selected: editing && ev.mode === 'open' ? 'selected' : null }, ['Offen']),
      h('option', { value: 'request', selected: editing && ev.mode === 'request' ? 'selected' : null }, ['Auf Anfrage']),
      h('option', { value: 'closed', selected: editing && ev.mode === 'closed' ? 'selected' : null }, ['Geschlossen']),
    ]);
    // Pflicht-Gruppenauswahl, befüllt aus GET /api/groups.
    var groupSel = h('select', { name: 'groupId' }, [h('option', { value: '' }, ['Gruppe wählen…'])]);
    API.get('/groups').then(function (groups) {
      (groups || []).forEach(function (g) {
        var opt = h('option', { value: g.id }, [g.name]);
        if (editing && ev.groupId === g.id) opt.setAttribute('selected', 'selected');
        groupSel.appendChild(opt);
      });
    }).catch(function () { err.textContent = 'Gruppen konnten nicht geladen werden.'; });
    var signup = fieldInput('Anmeldefrist (optional)', 'signupDeadline', 'datetime-local', editing ? toLocalInput(ev.signupDeadline) : '');
    var withdraw = fieldInput('Abmeldefrist (optional)', 'withdrawDeadline', 'datetime-local', editing ? toLocalInput(ev.withdrawDeadline) : '');
    var confWin = fieldInput('Bestätigungsfenster (Min. vor Beginn, optional)', 'confirmationWindowMinutes', 'number', editing && ev.confirmationWindowMinutes != null ? String(ev.confirmationWindowMinutes) : '');
    // Serie nur beim Anlegen
    var rruleSel = h('select', { name: 'rrule' }, [
      h('option', { value: '' }, ['Einzeltermin']),
      h('option', { value: 'FREQ=DAILY' }, ['Täglich']),
      h('option', { value: 'FREQ=WEEKLY' }, ['Wöchentlich']),
      h('option', { value: 'FREQ=WEEKLY;INTERVAL=2' }, ['14-tägig']),
      h('option', { value: 'FREQ=MONTHLY' }, ['Monatlich']),
    ]);
    var count = fieldInput('Anzahl Termine (Serie)', 'count', 'number', '1');
    var endDate = fieldInput('Serienende bis (optional, statt Anzahl)', 'seriesEnd', 'datetime-local', '');
    var err = h('div', { class: 'error-text' });
    var d;

    function payload() {
      return {
        title: title.input.value.trim(),
        startAt: start.input.value ? new Date(start.input.value).toISOString() : undefined,
        endAt: end.input.value ? new Date(end.input.value).toISOString() : undefined,
        location: loc.input.value.trim() || undefined,
        description: descWrap.querySelector('textarea').value.trim() || undefined,
        mode: modeSel.value,
        groupId: groupSel.value,
        signupDeadline: signup.input.value ? new Date(signup.input.value).toISOString() : undefined,
        withdrawDeadline: withdraw.input.value ? new Date(withdraw.input.value).toISOString() : undefined,
        confirmationWindowMinutes: confWin.input.value ? parseInt(confWin.input.value, 10) : undefined,
      };
    }

    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () {
      err.textContent = '';
      if (!title.input.value.trim() || !start.input.value || !end.input.value) {
        err.textContent = 'Titel, Beginn und Ende sind erforderlich.'; return;
      }
      if (!groupSel.value) { err.textContent = 'Bitte eine Gruppe wählen.'; return; }
      if (editing) {
        askScope(ev, function (scope) {
          API.patch('/events/' + ev.id + '?scope=' + scope, payload())
            .then(function () { d.close(); snack('Termin aktualisiert'); navigate('events'); })
            .catch(function (ex) { err.textContent = ex.message; });
        });
      } else {
        var body = payload();
        if (rruleSel.value) {
          body.rrule = rruleSel.value;
          var cnt = parseInt(count.input.value, 10) || 1;
          if (endDate.input.value) {
            var days = rruleIntervalDays(rruleSel.value);
            if (days > 0) {
              var span = Math.floor((new Date(endDate.input.value).getTime() - new Date(start.input.value).getTime()) / (days * 86400000));
              cnt = Math.max(1, span + 1);
            }
          }
          body.count = cnt;
        }
        API.post('/events', body).then(function () { d.close(); snack('Termin erstellt'); navigate('events'); })
          .catch(function (ex) { err.textContent = ex.message; });
      }
    });
    var fields = [
      title.wrap, start.wrap, end.wrap, loc.wrap, descWrap,
      h('div', { class: 'field' }, [h('label', {}, ['Modus']), modeSel]),
      h('div', { class: 'field' }, [h('label', {}, ['Gruppe']), groupSel]),
      signup.wrap, withdraw.wrap, confWin.wrap,
    ];
    if (!editing) fields.push(h('div', { class: 'field' }, [h('label', {}, ['Wiederholung']), rruleSel]), count.wrap, endDate.wrap);
    fields.push(err);
    d = dialog(editing ? 'Termin bearbeiten' : 'Termin erstellen', fields,
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------
  function viewChat(node) {
    clear(node);
    var actions = [h('button', { class: 'btn', onclick: chatDialog }, [icon('add'), 'Chat'])];
    node.appendChild(sectionHead('Chat', actions));
    loading(node);
    API.get('/chat/rooms').then(function (rooms) {
      clear(node);
      node.appendChild(sectionHead('Chat', actions));
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

  function chatDialog() {
    var typeSel = h('select', {}, [h('option', { value: 'direct' }, ['Einzelchat']), h('option', { value: 'group' }, ['Gruppenchat'])]);
    var name = fieldInput('Chat-Name (nur Gruppe)', 'name');
    var partsWrap = h('div', { class: 'stack', style: 'max-height:35vh;overflow-y:auto' });
    var boxes = {};
    var err = h('div', { class: 'error-text' });
    var d;
    API.get('/users').then(function (users) {
      (users || []).filter(function (u) { return u.id !== state.me.id; }).forEach(function (u) {
        var cb = h('input', { type: 'checkbox' });
        boxes[u.id] = cb;
        partsWrap.appendChild(h('label', { class: 'row', style: 'gap:8px' }, [cb, esc(u.name) + ' (' + u.role + ')']));
      });
    }).catch(function () { partsWrap.appendChild(h('div', { class: 'muted' }, ['Nutzerliste nicht verfügbar.'])); });
    var save = h('button', { class: 'btn' }, [icon('save'), 'Erstellen']);
    save.addEventListener('click', function () {
      var ids = Object.keys(boxes).filter(function (k) { return boxes[k].checked; });
      API.post('/chat/rooms', { type: typeSel.value, name: name.input.value.trim() || undefined, participantIds: ids })
        .then(function () { d.close(); snack('Chat erstellt'); navigate('chat'); })
        .catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog('Neuer Chat', [h('div', { class: 'field' }, [h('label', {}, ['Typ']), typeSel]), name.wrap, partsWrap, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  function openRoom(room) {
    var canMod = ['admin', 'coordinator', 'suad'].indexOf(state.me.role) >= 0;
    var list = h('div', { class: 'stack', style: 'max-height:50vh;overflow-y:auto' });
    var input = h('input', { placeholder: 'Nachricht…', style: 'flex:1' });
    var d = dialog(room.name || 'Chat', [list, h('div', { class: 'row' }, [input,
      h('button', { class: 'btn', onclick: send }, [icon('send')])])], [
      h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Schließen'])]);

    function load() {
      API.get('/chat/rooms/' + room.id + '/messages').then(function (msgs) {
        clear(list);
        (msgs || []).forEach(function (m) {
          var line = h('div', { class: 'row' }, [h('div', { style: 'flex:1' }, [h('span', { class: 'muted' }, [esc(m.senderName) + ': ']),
            m.deleted ? h('em', { class: 'muted' }, ['(gelöscht)']) : esc(m.body)])]);
          if (canMod && !m.deleted) {
            line.appendChild(h('button', { class: 'icon-btn', title: 'Moderieren', onclick: function () {
              API.del('/chat/messages/' + m.id).then(function () { snack('Gelöscht'); load(); }).catch(function (ex) { snack(ex.message, true); });
            } }, [icon('delete')]));
          }
          list.appendChild(line);
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
    var manageMode = false;
    var actions = [];
    if (canManage) {
      var toggle = h('button', { class: 'btn text', onclick: function () { manageMode = !manageMode; load(); } }, [icon('manage_accounts'), 'Verwalten']);
      actions.push(toggle);
      actions.push(h('button', { class: 'btn', onclick: function () { messageDialog(null); } }, [icon('add'), 'Nachricht']));
    }
    node.appendChild(sectionHead('Systemnachrichten', actions));

    function load() {
      loading(node);
      var url = manageMode ? '/messages/manage' : '/messages';
      API.get(url).then(function (msgs) {
        clear(node);
        node.appendChild(sectionHead('Systemnachrichten', actions));
        if (!msgs || !msgs.length) { node.appendChild(h('div', { class: 'empty' }, [icon('campaign'), h('div', {}, ['Keine Nachrichten.'])])); return; }
        var stack = h('div', { class: 'stack' });
        msgs.forEach(function (m) {
          var footer;
          if (manageMode) {
            var validity = [];
            if (m.validFrom) validity.push('ab ' + fmtDate(m.validFrom));
            if (m.validUntil) validity.push('bis ' + fmtDate(m.validUntil));
            footer = h('div', {}, [
              h('div', { class: 'muted' }, [(m.isActive ? 'aktiv' : 'inaktiv') + (validity.length ? ' · ' + validity.join(' ') : '') + ' · ' + (m.targetRoles || []).join(',')]),
              h('div', { class: 'row-actions' }, [
                h('button', { class: 'icon-btn', title: 'Bearbeiten', onclick: function () { messageDialog(m); } }, [icon('edit')]),
                h('button', { class: 'icon-btn', title: 'Löschen', onclick: function () {
                  API.del('/messages/' + m.id).then(function () { snack('Gelöscht'); load(); }).catch(function (ex) { snack(ex.message, true); });
                } }, [icon('delete')]),
              ]),
            ]);
          } else {
            footer = h('div', { class: 'row' }, [
              h('button', { class: 'btn text', onclick: function () { API.post('/messages/' + m.id + '/dismiss', {}).then(function () { snack('Ausgeblendet'); load(); }); } }, [icon('visibility_off'), 'Ausblenden']),
            ]);
          }
          stack.appendChild(h('div', { class: 'card' }, [h('h3', {}, [esc(m.title)]), h('p', {}, [esc(m.body)]), footer]));
        });
        node.appendChild(stack);
      }).catch(function (ex) { showError(node, ex); });
    }
    load();
  }

  function messageDialog(m) {
    var editing = !!m;
    var title = fieldInput('Titel', 'title', 'text', editing ? m.title : '');
    var bodyWrap = h('div', { class: 'field' }, [h('label', {}, ['Text']), h('textarea', { rows: '3' }, [editing ? m.body : ''])]);
    var rolesInput = fieldInput('Zielrollen (Komma, „all")', 'roles', 'text', editing ? (m.targetRoles || ['all']).join(',') : 'all');
    var vFrom = fieldInput('Gültig ab (optional)', 'validFrom', 'datetime-local', editing ? toLocalInput(m.validFrom) : '');
    var vUntil = fieldInput('Gültig bis (optional)', 'validUntil', 'datetime-local', editing ? toLocalInput(m.validUntil) : '');
    var err = h('div', { class: 'error-text' });
    var d;
    var save = h('button', { class: 'btn' }, [icon('save'), editing ? 'Speichern' : 'Senden']);
    save.addEventListener('click', function () {
      var body = {
        title: title.input.value.trim(),
        body: bodyWrap.querySelector('textarea').value.trim(),
        targetRoles: rolesInput.input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        validFrom: vFrom.input.value ? new Date(vFrom.input.value).toISOString() : null,
        validUntil: vUntil.input.value ? new Date(vUntil.input.value).toISOString() : null,
      };
      var p = editing ? API.patch('/messages/' + m.id, body) : API.post('/messages', body);
      p.then(function () { d.close(); snack('Gespeichert'); navigate('messages'); }).catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog(editing ? 'Nachricht bearbeiten' : 'Neue Systemnachricht', [title.wrap, bodyWrap, rolesInput.wrap, vFrom.wrap, vUntil.wrap, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Nutzerverwaltung
  // ---------------------------------------------------------------------------
  function viewUsers(node) {
    clear(node);
    var actions = [h('button', { class: 'btn', onclick: function () { userDialog(null); } }, [icon('person_add'), 'Nutzer'])];
    node.appendChild(sectionHead('Nutzerverwaltung', actions));
    loading(node);
    API.get('/users').then(function (users) {
      clear(node);
      node.appendChild(sectionHead('Nutzerverwaltung', actions));
      var filter = h('input', { placeholder: 'Suchen (Name/E-Mail/Rolle)…', style: 'width:100%;margin-bottom:12px' });
      node.appendChild(filter);
      var table = h('table', {}, [h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Name']), h('th', {}, ['E-Mail']), h('th', {}, ['Rolle']), h('th', {}, ['Status']),
        h('th', {}, ['Letzte Aktivität']), h('th', {}, ['']),
      ])])]);
      var tbody = h('tbody');
      function render(list) {
        clear(tbody);
        list.forEach(function (u) {
          tbody.appendChild(h('tr', {}, [
            h('td', {}, [h('a', { href: 'javascript:void 0', onclick: function () { userDialog(u); } }, [esc(u.name)])]),
            h('td', { class: 'muted' }, [esc(u.email || '—')]),
            h('td', {}, [h('span', { class: 'chip' }, [u.role])]),
            h('td', {}, [u.isActive ? 'aktiv' : 'gesperrt']),
            h('td', { class: 'muted' }, [fmtDate(u.lastActiveAt)]),
            h('td', {}, [h('div', { class: 'row-actions' }, [
              h('button', { class: 'icon-btn', title: 'Rechte', onclick: function () { userPermsDialog(u); } }, [icon('shield')]),
              h('button', { class: 'icon-btn', title: 'Eltern-Kind', onclick: function () { parentChildDialog(u); } }, [icon('family_restroom')]),
              h('button', { class: 'icon-btn', title: u.isActive ? 'Sperren' : 'Entsperren', onclick: function () { toggleUser(u); } }, [icon(u.isActive ? 'lock' : 'lock_open')]),
              h('button', { class: 'icon-btn', title: 'Löschen', onclick: function () { deleteUser(u); } }, [icon('delete')]),
            ])]),
          ]));
        });
      }
      render(users || []);
      filter.addEventListener('input', function () {
        var q = filter.value.trim().toLowerCase();
        render((users || []).filter(function (u) {
          return !q || (u.name + ' ' + (u.email || '') + ' ' + u.role).toLowerCase().indexOf(q) >= 0;
        }));
      });
      table.appendChild(tbody);
      node.appendChild(h('div', { class: 'card' }, [table]));
    }).catch(function (ex) { showError(node, ex); });
  }

  function userDialog(u) {
    var editing = !!u;
    var name = fieldInput('Name', 'name', 'text', editing ? u.name : '');
    var email = fieldInput('E-Mail (optional)', 'email', 'email', editing ? (u.email || '') : '');
    var roles = ['member', 'parent', 'teacher', 'coordinator', 'admin'];
    var roleSel = h('select', {}, roles.map(function (r) { return h('option', { value: r, selected: editing && u.role === r ? 'selected' : null }, [r]); }));
    var pw = fieldInput(editing ? 'Neues Passwort (optional)' : 'Passwort (min. 8)', 'password', 'password');
    var err = h('div', { class: 'error-text' });
    var d;
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () {
      err.textContent = '';
      var body = { name: name.input.value.trim(), email: email.input.value.trim() || null, role: roleSel.value };
      if (pw.input.value) body.password = pw.input.value;
      var p = editing ? API.patch('/users/' + u.id, body) : API.post('/users', body);
      p.then(function () { d.close(); snack('Gespeichert'); navigate('users'); }).catch(function (ex) { err.textContent = ex.message; });
    });
    var fields = [name.wrap, email.wrap, h('div', { class: 'field' }, [h('label', {}, ['Rolle']), roleSel]), pw.wrap, err];
    d = dialog(editing ? 'Nutzer bearbeiten' : 'Neuer Nutzer', fields,
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  function userPermsDialog(u) {
    var err = h('div', { class: 'error-text' });
    var checks = h('div', { class: 'stack', style: 'max-height:40vh;overflow-y:auto' });
    var boxes = {};
    var d;
    Promise.all([API.get('/permission-profiles/catalog'), API.get('/users/' + u.id + '/permission-overrides')]).then(function (r) {
      var cat = r[0] || [];
      var existing = {};
      (r[1] || []).forEach(function (o) { if (o.permissionKey) existing[o.permissionKey] = o.value; });
      cat.forEach(function (c) {
        var cb = h('input', { type: 'checkbox' });
        if (existing[c.key]) cb.checked = true;
        boxes[c.key] = cb;
        checks.appendChild(h('label', { class: 'row', style: 'gap:8px;align-items:flex-start' }, [cb, h('div', {}, [h('div', {}, [c.key]), h('div', { class: 'muted' }, [esc(c.description)])])]));
      });
    }).catch(function (ex) { err.textContent = ex.message; });
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () {
      var items = Object.keys(boxes).filter(function (k) { return boxes[k].checked; }).map(function (k) { return { permissionKey: k, value: true }; });
      API.put('/users/' + u.id + '/permissions', { items: items })
        .then(function () { d.close(); snack('Rechte gespeichert'); }).catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog('Direkte Rechte – ' + esc(u.name), [h('p', { class: 'muted' }, ['Personen-Overrides haben Vorrang vor Gruppen und Rolle.']), checks, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }
  function parentChildDialog(u) {
    var err = h('div', { class: 'error-text' });
    var childrenBox = h('div', { class: 'stack' });
    var parentsBox = h('div', { class: 'stack' });
    var d;
    function reload() {
      API.get('/users/' + u.id).then(function (full) {
        clear(childrenBox); clear(parentsBox);
        (full.children || []).forEach(function (c) {
          childrenBox.appendChild(h('div', { class: 'row' }, [h('div', { style: 'flex:1' }, [esc(c.name)]),
            h('button', { class: 'icon-btn', title: 'Entfernen', onclick: function () {
              API.del('/users/' + u.id + '/parent-links/' + c.id).then(reload).catch(function (ex) { snack(ex.message, true); });
            } }, [icon('link_off')])]));
        });
        if (!(full.children || []).length) childrenBox.appendChild(h('div', { class: 'muted' }, ['Keine Kinder verknüpft.']));
        (full.parents || []).forEach(function (p) {
          parentsBox.appendChild(h('div', { class: 'row' }, [h('div', { style: 'flex:1' }, [esc(p.name)]),
            h('button', { class: 'icon-btn', title: 'Entfernen', onclick: function () {
              API.del('/users/' + p.id + '/parent-links/' + u.id).then(reload).catch(function (ex) { snack(ex.message, true); });
            } }, [icon('link_off')])]));
        });
        if (!(full.parents || []).length) parentsBox.appendChild(h('div', { class: 'muted' }, ['Keine Eltern verknüpft.']));
      }).catch(function (ex) { err.textContent = ex.message; });
    }
    var childSel = h('select', {}, [h('option', { value: '' }, ['Kind wählen…'])]);
    API.get('/users').then(function (users) {
      (users || []).filter(function (c) { return c.id !== u.id; }).forEach(function (c) {
        childSel.appendChild(h('option', { value: c.id }, [c.name + ' (' + c.role + ')']));
      });
    }).catch(function () { err.textContent = 'Nutzerliste nicht verfügbar.'; });
    var addChild = h('button', { class: 'btn tonal', onclick: function () {
      if (!childSel.value) { snack('Bitte ein Kind wählen', true); return; }
      // Backend: POST /users/:id/parent-links mit :id = Kind, body.parentId = Elternteil.
      API.post('/users/' + childSel.value + '/parent-links', { parentId: u.id })
        .then(function () { childSel.value = ''; reload(); }).catch(function (ex) { snack(ex.message, true); });
    } }, [icon('add'), 'Als Elternteil verknüpfen']);
    reload();
    d = dialog('Eltern-Kind – ' + esc(u.name), [
      h('h3', {}, ['Kinder von ' + esc(u.name)]), childrenBox,
      h('div', { class: 'field' }, [h('label', {}, ['Kind hinzufügen']), childSel]), h('div', { class: 'row' }, [addChild]),
      h('h3', {}, ['Eltern von ' + esc(u.name)]), parentsBox, err,
    ], [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Schließen'])]);
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
    var groupSel = h('select', { name: 'groupId' }, [h('option', { value: '' }, ['Gruppe wählen…'])]);
    var err = h('div', { class: 'error-text' });
    API.get('/groups').then(function (groups) {
      (groups || []).forEach(function (g) { groupSel.appendChild(h('option', { value: g.id }, [g.name])); });
    }).catch(function () { err.textContent = 'Gruppen konnten nicht geladen werden.'; });
    var roleSel = h('select', { name: 'role' }, ['member', 'parent', 'teacher', 'coordinator'].map(function (r) { return h('option', { value: r }, [r]); }));
    var maxUses = fieldInput('Max. Nutzungen (optional)', 'maxUses', 'number');
    var d;
    var save = h('button', { class: 'btn' }, [icon('save'), 'Erzeugen']);
    save.addEventListener('click', function () {
      err.textContent = '';
      if (!groupSel.value) { err.textContent = 'Bitte eine Gruppe wählen.'; return; }
      API.post('/registration-codes', {
        groupId: groupSel.value, role: roleSel.value,
        maxUses: maxUses.input.value ? parseInt(maxUses.input.value, 10) : undefined,
      }).then(function (c) { d.close(); snack('Code: ' + (c && c.code ? c.code : 'erstellt')); navigate('codes'); })
        .catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog('Neuer Registrierungscode', [
      h('div', { class: 'field' }, [h('label', {}, ['Gruppe']), groupSel]),
      h('div', { class: 'field' }, [h('label', {}, ['Rolle']), roleSel]), maxUses.wrap, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Statistik
  // ---------------------------------------------------------------------------
  var STAT_LABELS = { userCount: 'Nutzer', groupCount: 'Gruppen', eventCount: 'Termine', upcomingEvents: 'Anstehend' };
  function viewStats(node) {
    clear(node);
    var actions = [
      h('button', { class: 'btn tonal', onclick: function () { window.location.href = '/api/reports/export?format=csv'; } }, [icon('download'), 'CSV']),
      h('button', { class: 'btn tonal', onclick: function () { window.location.href = '/api/reports/export?format=json'; } }, [icon('data_object'), 'JSON']),
    ];
    node.appendChild(sectionHead('Statistik & Reports', actions));
    loading(node);
    Promise.all([API.get('/statistics/overview'), API.get('/statistics/attendance')]).then(function (r) {
      var s = r[0] || {}, att = r[1] || {};
      clear(node);
      node.appendChild(sectionHead('Statistik & Reports', actions));
      var grid = h('div', { class: 'grid' });
      Object.keys(s).forEach(function (k) {
        grid.appendChild(h('div', { class: 'card' }, [h('h3', {}, [String(s[k])]), h('div', { class: 'muted' }, [STAT_LABELS[k] || k])]));
      });
      node.appendChild(grid);
      var byStatus = att.byStatus || {};
      var attCard = h('div', { class: 'card' }, [h('h3', {}, ['Anwesenheit (' + (att.total || 0) + ' Einträge)'])]);
      Object.keys(byStatus).forEach(function (k) {
        attCard.appendChild(h('div', { class: 'muted' }, [k + ': ' + byStatus[k]]));
      });
      if (!Object.keys(byStatus).length) attCard.appendChild(h('div', { class: 'muted' }, ['Keine Daten.']));
      node.appendChild(attCard);
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
      // Live-Vorschau
      var preview = h('div', { class: 'card', style: 'max-width:480px' }, []);
      function renderPreview() {
        clear(preview);
        preview.appendChild(h('h3', {}, ['Vorschau']));
        var bar = h('div', { class: 'row', style: 'padding:10px;border-radius:12px;color:#fff;background:' + (color.input.value.trim() || '#6750A4') }, [
          b.logoUrl ? h('img', { src: b.logoUrl, alt: '', style: 'height:24px' }) : icon('event_available'),
          h('strong', {}, [appName.input.value.trim() || 'Anwesenheit NEO']),
        ]);
        preview.appendChild(bar);
      }
      appName.input.addEventListener('input', renderPreview);
      color.input.addEventListener('input', renderPreview);

      function uploadField(label, endpoint, key) {
        var file = h('input', { type: 'file', accept: 'image/*' });
        var up = h('button', { class: 'btn tonal', onclick: function () {
          if (!file.files || !file.files[0]) { snack('Datei wählen', true); return; }
          var fd = new FormData();
          fd.append('file', file.files[0]);
          API.post('/branding/' + endpoint, fd).then(function (r) { b[key] = r[key]; applyBranding(b); snack(label + ' hochgeladen'); renderPreview(); })
            .catch(function (ex) { snack(ex.message, true); });
        } }, [icon('upload'), label]);
        return h('div', { class: 'field' }, [h('label', {}, [label]), h('div', { class: 'row' }, [file, up])]);
      }

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
        uploadField('Logo', 'logo', 'logoUrl'),
        uploadField('Favicon', 'favicon', 'faviconUrl'),
        h('div', { class: 'row' }, [save]),
      ]));
      renderPreview();
      node.appendChild(preview);
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
  // Vertretungen
  // ---------------------------------------------------------------------------
  function viewSubs(node) {
    clear(node);
    var actions = [h('button', { class: 'btn', onclick: subDialog }, [icon('add'), 'Anfrage'])];
    node.appendChild(sectionHead('Vertretungen', actions));
    loading(node);
    API.get('/substitutions').then(function (subs) {
      clear(node);
      node.appendChild(sectionHead('Vertretungen', actions));
      if (!subs || !subs.length) { node.appendChild(h('div', { class: 'empty' }, [icon('swap_horiz'), h('div', {}, ['Keine Vertretungen.'])])); return; }
      var stack = h('div', { class: 'stack' });
      subs.forEach(function (s) {
        var row = h('div', { class: 'row-actions', style: 'margin-top:8px' });
        if (s.status === 'pending') {
          row.appendChild(h('button', { class: 'btn tonal', onclick: function () { patchSub(s.id, 'confirmed'); } }, [icon('check'), 'Übernehmen']));
          row.appendChild(h('button', { class: 'btn outlined', onclick: function () { patchSub(s.id, 'rejected'); } }, [icon('close'), 'Ablehnen']));
        }
        stack.appendChild(h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', { style: 'flex:1;margin:0' }, [esc(s.event ? s.event.title : '—')]),
            h('span', { class: 'chip' }, [s.status]),
          ]),
          h('div', { class: 'muted' }, [(s.event ? fmtDate(s.event.startAt) : '') + ' · Anfrage: ' + esc(s.requester ? s.requester.name : '') + (s.filler ? ' · Vertretung: ' + esc(s.filler.name) : '')]),
          s.note ? h('p', {}, [esc(s.note)]) : null,
          row,
        ]));
      });
      node.appendChild(stack);
    }).catch(function (ex) { showError(node, ex); });
  }
  function patchSub(id, status) {
    API.patch('/substitutions/' + id, { status: status })
      .then(function () { snack('Aktualisiert'); navigate('subs'); })
      .catch(function (ex) { snack(ex.message, true); });
  }
  function subDialog() {
    var evSel = h('select', { name: 'eventId' }, [h('option', { value: '' }, ['Termin wählen…'])]);
    var noteWrap = h('div', { class: 'field' }, [h('label', {}, ['Notiz (optional)']), h('textarea', { rows: '2' })]);
    var err = h('div', { class: 'error-text' });
    var d;
    API.get('/events?from=' + encodeURIComponent(new Date().toISOString())).then(function (events) {
      (events || []).forEach(function (ev) { evSel.appendChild(h('option', { value: ev.id }, [ev.title + ' · ' + fmtDate(ev.startAt)])); });
    }).catch(function () { err.textContent = 'Termine konnten nicht geladen werden.'; });
    var save = h('button', { class: 'btn' }, [icon('save'), 'Anfragen']);
    save.addEventListener('click', function () {
      err.textContent = '';
      if (!evSel.value) { err.textContent = 'Bitte einen Termin wählen.'; return; }
      API.post('/substitutions', { eventId: evSel.value, note: noteWrap.querySelector('textarea').value.trim() || undefined })
        .then(function () { d.close(); snack('Vertretung angefragt'); navigate('subs'); })
        .catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog('Vertretung anfragen', [h('div', { class: 'field' }, [h('label', {}, ['Termin']), evSel]), noteWrap, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
  }

  // ---------------------------------------------------------------------------
  // Rechteprofile
  // ---------------------------------------------------------------------------
  function viewProfiles(node) {
    clear(node);
    var actions = [h('button', { class: 'btn', onclick: function () { profileDialog(null); } }, [icon('add'), 'Profil'])];
    node.appendChild(sectionHead('Rechteprofile', actions));
    loading(node);
    API.get('/permission-profiles').then(function (profiles) {
      clear(node);
      node.appendChild(sectionHead('Rechteprofile', actions));
      if (!profiles || !profiles.length) { node.appendChild(h('div', { class: 'empty' }, [icon('shield_person'), h('div', {}, ['Keine Profile.'])])); return; }
      var grid = h('div', { class: 'grid' });
      profiles.forEach(function (p) {
        var cnt = p._count || {};
        grid.appendChild(h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [icon('shield_person'), h('h3', { style: 'flex:1;margin:0' }, [esc(p.name)])]),
          h('p', { class: 'muted' }, [(p.items ? p.items.length : 0) + ' Rechte · ' + ((cnt.userPermissions || 0) + (cnt.groupPermissions || 0)) + ' Zuweisungen']),
          h('div', { class: 'row-actions' }, [
            h('button', { class: 'icon-btn', title: 'Bearbeiten', onclick: function () { profileDialog(p); } }, [icon('edit')]),
            h('button', { class: 'icon-btn', title: 'Löschen', onclick: function () {
              API.del('/permission-profiles/' + p.id).then(function () { snack('Gelöscht'); navigate('profiles'); }).catch(function (ex) { snack(ex.message, true); });
            } }, [icon('delete')]),
          ]),
        ]));
      });
      node.appendChild(grid);
    }).catch(function (ex) { showError(node, ex); });
  }
  function profileDialog(profile) {
    var editing = !!profile;
    var name = fieldInput('Name', 'name', 'text', editing ? profile.name : '');
    var err = h('div', { class: 'error-text' });
    var checks = h('div', { class: 'stack', style: 'max-height:40vh;overflow-y:auto' });
    var boxes = {};
    var d;
    API.get('/permission-profiles/catalog').then(function (cat) {
      var existing = {};
      (editing && profile.items ? profile.items : []).forEach(function (it) { existing[it.permissionKey] = it.value; });
      (cat || []).forEach(function (c) {
        var cb = h('input', { type: 'checkbox' });
        if (existing[c.key]) cb.checked = true;
        boxes[c.key] = cb;
        checks.appendChild(h('label', { class: 'row', style: 'gap:8px;align-items:flex-start' }, [cb, h('div', {}, [h('div', {}, [c.key]), h('div', { class: 'muted' }, [esc(c.description)])])]));
      });
    });
    var save = h('button', { class: 'btn' }, [icon('save'), 'Speichern']);
    save.addEventListener('click', function () {
      var items = Object.keys(boxes).filter(function (k) { return boxes[k].checked; }).map(function (k) { return { permissionKey: k, value: true }; });
      var body = { name: name.input.value.trim(), items: items };
      var p = editing ? API.patch('/permission-profiles/' + profile.id, body) : API.post('/permission-profiles', body);
      p.then(function () { d.close(); snack('Gespeichert'); navigate('profiles'); }).catch(function (ex) { err.textContent = ex.message; });
    });
    d = dialog(editing ? 'Profil bearbeiten' : 'Neues Rechteprofil', [name.wrap, checks, err],
      [h('button', { class: 'btn text', onclick: function () { d.close(); } }, ['Abbrechen']), save]);
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

  boot().catch(function () { renderAuth('login'); });
})();
