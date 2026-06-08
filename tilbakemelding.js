/* ============================================================================
   tilbakemelding.js  —  «Meld inn feil eller forslag» for lærerportalene
   ----------------------------------------------------------------------------
   Selvstendig modul. Lastes med <script defer src="tilbakemelding.js"></script>
   i laererportal14-ny.html og laererportal57-ny.html.

   Bruker globalene som portal-skallet allerede eksponerer:
     window._db, window._ref, window._set, window._push, window._onValue,
     window._update, window._fbReady, window._CLASS_ID, window._currentTeacher

   Data lagres i en GLOBAL node (ikke klasse-scopet):
     feedback/{authUid}/{meldingId} = {
       type, text, status, createdAt, authUid, teacherName,
       className, classId, page, pageId, reply, readAt, resolvedAt
     }
   status: 'sent' (Sendt) -> 'read' (Lest) -> 'resolved' (Løst)
   Læreren skriver og leser kun under sin egen uid. Bare admin (du) leser alt.
============================================================================ */
(function () {
  'use strict';

  // ── Hvilken side er vi på? ────────────────────────────────────────────────
  var path = (location.pathname || '').toLowerCase();
  var PAGE_ID, PAGE_LABEL;
  if (path.indexOf('laererportal57') !== -1) { PAGE_ID = 'laererportal57'; PAGE_LABEL = 'Lærerportal 5.–7.'; }
  else if (path.indexOf('laererportal14') !== -1) { PAGE_ID = 'laererportal14'; PAGE_LABEL = 'Lærerportal 1.–4.'; }
  else { PAGE_ID = 'laererportal'; PAGE_LABEL = 'Lærerportal'; }

  // ── Vent på at Firebase + innlogging er klar ─────────────────────────────
  var tries = 0;
  function ready() {
    return window._fbReady && window._db && window._ref && window._push &&
           window._set && window._onValue && window._currentTeacher &&
           window._currentTeacher.uid;
  }
  function boot() {
    if (ready()) { init(); return; }
    if (tries++ > 120) return; // gir opp etter ~30 s (ikke innlogget)
    setTimeout(boot, 250);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  // ── Hjelpere ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(ms) {
    if (!ms) return '';
    try {
      var d = new Date(ms);
      return d.toLocaleDateString('no-NO', { day: '2-digit', month: 'short' }) +
             ' kl. ' + d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  function statusInfo(s) {
    if (s === 'resolved') return { label: 'Løst', cls: 'ml-st-resolved' };
    if (s === 'read')     return { label: 'Lest', cls: 'ml-st-read' };
    return { label: 'Sendt', cls: 'ml-st-sent' };
  }

  // ── Stil ────────────────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('ml-fb-style')) return;
    var css = ''
      + '.ml-fb-fab{position:fixed;right:18px;bottom:18px;z-index:99990;'
      + 'background:#1D9E75;color:#fff;border:none;border-radius:999px;'
      + 'padding:12px 18px;font:700 15px/1 Nunito,system-ui,sans-serif;'
      + 'box-shadow:0 4px 14px rgba(8,80,65,.32);cursor:pointer;display:flex;'
      + 'align-items:center;gap:8px;transition:transform .12s,background .12s;}'
      + '.ml-fb-fab:hover{background:#168a64;transform:translateY(-1px);}'
      + '.ml-fb-fab:focus-visible{outline:3px solid #FFC857;outline-offset:2px;}'
      + '.ml-fb-fab .ml-dot{background:#e8513a;color:#fff;border-radius:999px;'
      + 'min-width:20px;height:20px;padding:0 5px;font-size:12px;display:none;'
      + 'align-items:center;justify-content:center;}'
      + '.ml-fb-overlay{position:fixed;inset:0;z-index:99991;background:rgba(8,40,32,.45);'
      + 'display:none;align-items:flex-start;justify-content:center;padding:24px 14px;'
      + 'overflow:auto;}'
      + '.ml-fb-overlay.open{display:flex;}'
      + '.ml-fb-modal{background:#fff;border-radius:18px;max-width:560px;width:100%;'
      + 'margin:auto;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden;'
      + 'font-family:Nunito,system-ui,sans-serif;color:#143a2e;}'
      + '.ml-fb-head{background:#085041;color:#fff;padding:16px 20px;display:flex;'
      + 'align-items:center;justify-content:space-between;}'
      + '.ml-fb-head h2{margin:0;font-size:18px;}'
      + '.ml-fb-x{background:transparent;border:none;color:#cdeee0;font-size:24px;'
      + 'cursor:pointer;line-height:1;padding:2px 6px;border-radius:8px;}'
      + '.ml-fb-x:hover{color:#fff;background:rgba(255,255,255,.12);}'
      + '.ml-fb-body{padding:18px 20px;}'
      + '.ml-fb-lbl{display:block;font-weight:700;margin:2px 0 8px;font-size:14px;}'
      + '.ml-fb-types{display:flex;gap:10px;margin-bottom:14px;}'
      + '.ml-fb-types label{flex:1;border:2px solid #d6e6df;border-radius:12px;'
      + 'padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;'
      + 'font-weight:700;font-size:14px;}'
      + '.ml-fb-types input{accent-color:#1D9E75;width:16px;height:16px;}'
      + '.ml-fb-types label.sel{border-color:#1D9E75;background:#eafaf3;}'
      + '.ml-fb-ta{width:100%;min-height:120px;border:2px solid #d6e6df;border-radius:12px;'
      + 'padding:12px;font:400 15px/1.45 Nunito,system-ui,sans-serif;resize:vertical;'
      + 'box-sizing:border-box;color:#143a2e;}'
      + '.ml-fb-ta:focus{outline:none;border-color:#1D9E75;}'
      + '.ml-fb-meta{font-size:12px;color:#5a7a6e;margin:8px 2px 0;}'
      + '.ml-fb-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}'
      + '.ml-fb-btn{border:none;border-radius:12px;padding:11px 18px;font-weight:800;'
      + 'font-size:15px;cursor:pointer;font-family:inherit;}'
      + '.ml-fb-btn.primary{background:#1D9E75;color:#fff;}'
      + '.ml-fb-btn.primary:hover{background:#168a64;}'
      + '.ml-fb-btn.primary:disabled{background:#9cd1bd;cursor:default;}'
      + '.ml-fb-btn.ghost{background:#eef4f1;color:#2c5446;}'
      + '.ml-fb-note{font-size:14px;font-weight:700;margin-top:12px;min-height:20px;}'
      + '.ml-fb-note.ok{color:#1a8a5c;}.ml-fb-note.err{color:#c0392b;}'
      + '.ml-fb-mine{border-top:1px solid #e4eeea;margin-top:18px;padding-top:14px;}'
      + '.ml-fb-mine h3{font-size:15px;margin:0 0 10px;color:#2c5446;}'
      + '.ml-card{border:1px solid #e4eeea;border-radius:12px;padding:12px 14px;'
      + 'margin-bottom:10px;background:#fafdfb;}'
      + '.ml-card-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
      + 'justify-content:space-between;margin-bottom:6px;}'
      + '.ml-tag{font-size:12px;font-weight:800;border-radius:999px;padding:2px 10px;}'
      + '.ml-tag.feil{background:#fde8e4;color:#b23a23;}'
      + '.ml-tag.forslag{background:#e6f0fb;color:#2563a8;}'
      + '.ml-st{font-size:12px;font-weight:800;border-radius:999px;padding:2px 10px;}'
      + '.ml-st-sent{background:#eef1f4;color:#56657a;}'
      + '.ml-st-read{background:#fff3d6;color:#9a6a00;}'
      + '.ml-st-resolved{background:#e2f7ea;color:#1a8a5c;}'
      + '.ml-card-text{font-size:14px;line-height:1.45;white-space:pre-wrap;'
      + 'word-break:break-word;color:#1f3b32;}'
      + '.ml-card-time{font-size:12px;color:#7a9389;margin-top:6px;}'
      + '.ml-reply{margin-top:10px;background:#eafaf3;border-left:4px solid #1D9E75;'
      + 'border-radius:8px;padding:9px 12px;font-size:14px;line-height:1.45;'
      + 'white-space:pre-wrap;word-break:break-word;}'
      + '.ml-reply b{display:block;font-size:12px;color:#1a8a5c;margin-bottom:3px;}'
      + '.ml-empty{font-size:14px;color:#7a9389;}'
      + '@media(max-width:520px){.ml-fb-fab span.txt{display:none;}.ml-fb-fab{padding:14px;}}';
    var st = document.createElement('style');
    st.id = 'ml-fb-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ── Bygg UI ───────────────────────────────────────────────────────────────
  var els = {};
  function buildUI() {
    var fab = document.createElement('button');
    fab.className = 'ml-fb-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Meld inn feil eller forslag');
    fab.innerHTML = '💬 <span class="txt">Meld inn feil eller forslag</span>'
                  + '<span class="ml-dot" aria-hidden="true"></span>';
    document.body.appendChild(fab);

    var overlay = document.createElement('div');
    overlay.className = 'ml-fb-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Meld inn feil eller forslag');
    overlay.innerHTML =
      '<div class="ml-fb-modal">'
      + '<div class="ml-fb-head"><h2>💬 Meld inn feil eller forslag</h2>'
      + '<button class="ml-fb-x" type="button" aria-label="Lukk">×</button></div>'
      + '<div class="ml-fb-body">'
      + '  <span class="ml-fb-lbl">Hva gjelder det?</span>'
      + '  <div class="ml-fb-types">'
      + '    <label class="sel"><input type="radio" name="ml-type" value="feil" checked> 🐞 En feil</label>'
      + '    <label><input type="radio" name="ml-type" value="forslag"> 💡 Et forslag</label>'
      + '  </div>'
      + '  <label class="ml-fb-lbl" for="ml-ta">Beskriv kort</label>'
      + '  <textarea id="ml-ta" class="ml-fb-ta" maxlength="2000" '
      + '    placeholder="Skriv hva som skjedde eller hva du ønsker deg…"></textarea>'
      + '  <div class="ml-fb-meta"></div>'
      + '  <div class="ml-fb-actions">'
      + '    <button class="ml-fb-btn ghost" type="button" data-close>Avbryt</button>'
      + '    <button class="ml-fb-btn primary" type="button" data-send>Send inn</button>'
      + '  </div>'
      + '  <div class="ml-fb-note" role="status" aria-live="polite"></div>'
      + '  <div class="ml-fb-mine"><h3>Mine meldinger</h3><div class="ml-fb-list"></div></div>'
      + '</div></div>';
    document.body.appendChild(overlay);

    els.fab = fab;
    els.dot = fab.querySelector('.ml-dot');
    els.overlay = overlay;
    els.ta = overlay.querySelector('#ml-ta');
    els.meta = overlay.querySelector('.ml-fb-meta');
    els.note = overlay.querySelector('.ml-fb-note');
    els.list = overlay.querySelector('.ml-fb-list');
    els.send = overlay.querySelector('[data-send]');

    var t = window._currentTeacher || {};
    els.meta.textContent = 'Sendes fra: ' + (t.name || 'Lærer') +
      (t.class ? ' · klasse ' + t.class : '') + ' · ' + PAGE_LABEL;

    // type-valg visuelt
    overlay.querySelectorAll('.ml-fb-types label').forEach(function (lab) {
      lab.addEventListener('click', function () {
        overlay.querySelectorAll('.ml-fb-types label').forEach(function (l) { l.classList.remove('sel'); });
        lab.classList.add('sel');
      });
    });

    fab.addEventListener('click', open);
    overlay.querySelector('.ml-fb-x').addEventListener('click', close);
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
    els.send.addEventListener('click', send);
  }

  function open() {
    els.note.textContent = '';
    els.overlay.classList.add('open');
    setTimeout(function () { els.ta.focus(); }, 50);
  }
  function close() { els.overlay.classList.remove('open'); }

  // ── Send inn melding ──────────────────────────────────────────────────────
  function send() {
    var text = (els.ta.value || '').trim();
    if (text.length < 3) {
      els.note.className = 'ml-fb-note err';
      els.note.textContent = 'Skriv litt mer før du sender 🙂';
      els.ta.focus();
      return;
    }
    var typeEl = els.overlay.querySelector('input[name="ml-type"]:checked');
    var type = typeEl ? typeEl.value : 'feil';
    var t = window._currentTeacher || {};
    var uid = t.uid;

    var obj = {
      type: type,
      text: text,
      status: 'sent',
      createdAt: Date.now(),
      authUid: uid,
      teacherName: t.name || 'Lærer',
      className: t.class || '',
      classId: window._CLASS_ID || '',
      page: PAGE_LABEL,
      pageId: PAGE_ID,
      reply: '',
      readAt: 0,
      resolvedAt: 0
    };

    els.send.disabled = true;
    els.note.className = 'ml-fb-note';
    els.note.textContent = 'Sender…';

    try {
      var newRef = window._push(window._ref(window._db, 'feedback/' + uid));
      var p = window._set(newRef, obj);
      if (p && typeof p.then === 'function') {
        p.then(onSent).catch(onErr);
      } else { onSent(); }
    } catch (e) { onErr(e); }
  }
  function onSent() {
    els.send.disabled = false;
    els.ta.value = '';
    els.note.className = 'ml-fb-note ok';
    els.note.textContent = '✅ Takk! Meldingen er sendt.';
  }
  function onErr(e) {
    console.warn('[tilbakemelding] kunne ikke sende:', e);
    els.send.disabled = false;
    els.note.className = 'ml-fb-note err';
    els.note.textContent = 'Beklager – noe gikk galt. Prøv igjen om litt.';
  }

  // ── Live-liste over egne meldinger ────────────────────────────────────────
  function startMineListener() {
    var uid = (window._currentTeacher || {}).uid;
    if (!uid) return;
    try {
      window._onValue(window._ref(window._db, 'feedback/' + uid), function (snap) {
        var val = snap && snap.val ? snap.val() : null;
        renderMine(val);
      });
    } catch (e) { console.warn('[tilbakemelding] kunne ikke lese egne meldinger:', e); }
  }
  function renderMine(val) {
    if (!els.list) return;
    var items = val ? Object.keys(val).map(function (k) { return val[k]; }) : [];
    items.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    var unread = items.filter(function (m) { return m.reply && m.status === 'resolved'; }).length;
    // liten varselprikk: antall meldinger som er besvart
    if (els.dot) {
      var answered = items.filter(function (m) { return m.reply; }).length;
      if (answered > 0) { els.dot.textContent = answered; els.dot.style.display = 'flex'; }
      else { els.dot.style.display = 'none'; }
    }

    if (!items.length) {
      els.list.innerHTML = '<p class="ml-empty">Du har ikke sendt inn noe ennå.</p>';
      return;
    }
    els.list.innerHTML = items.map(function (m) {
      var si = statusInfo(m.status);
      var typeCls = m.type === 'forslag' ? 'forslag' : 'feil';
      var typeTxt = m.type === 'forslag' ? '💡 Forslag' : '🐞 Feil';
      var reply = m.reply
        ? '<div class="ml-reply"><b>Svar fra Myntland</b>' + esc(m.reply) + '</div>'
        : '';
      return '<div class="ml-card">'
        + '<div class="ml-card-top">'
        + '<span class="ml-tag ' + typeCls + '">' + typeTxt + '</span>'
        + '<span class="ml-st ' + si.cls + '">' + si.label + '</span>'
        + '</div>'
        + '<div class="ml-card-text">' + esc(m.text) + '</div>'
        + '<div class="ml-card-time">' + fmtDate(m.createdAt) + '</div>'
        + reply
        + '</div>';
    }).join('');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (window.__mlFeedbackInit) return;
    window.__mlFeedbackInit = true;
    injectStyle();
    buildUI();
    startMineListener();
  }
})();
