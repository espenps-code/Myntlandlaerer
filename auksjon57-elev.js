/* ════════════════════════════════════════════════════════════════════════
   Myntland – AUKSJON 5.–7. trinn (elevappen)
   ────────────────────────────────────────────────────────────────────────
   Lastes etter elevapp57.js. Viser pågående auksjoner i Butikken og lar
   innlogget elev by.

   Regler:
   • Eleven kan ikke by mer enn brukskontoen – minus det eleven allerede
     leder med i andre pågående auksjoner (myntene er «holdt av»).
   • Bud i de siste 30 sekundene forlenger fristen med 30 sekunder.
   • Når tiden er ute, trekkes vinneren automatisk (første app som ser at
     tiden er ute gjør oppgjøret – en transaksjon sørger for at det bare
     skjer én gang). Har vinneren ikke nok mynter lenger, går varen til
     neste budgiver som har råd.

   Data (under classes/{id}/data/):
     auctions57/{id}      – selve auksjonen (status, endsAt, highBid …)
     auctionBids57/{id}   – full budhistorikk (brukes ved oppgjør)
   Tid: synkes mot Firebase-serveren (.info/serverTimeOffset), så alle
   enheter viser samme nedtelling.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var EXT_WINDOW = 30000;          // bud innen 30 sek før slutt …
  var EXT_ADD    = 30000;          // … forlenger fristen med 30 sek
  var FRESH_MS   = 5 * 60 * 1000;  // PIN gjelder i 5 min etter innlogging/bud
  var SHOW_ENDED_MS = 3 * 60 * 60 * 1000; // vis avsluttede i 3 timer

  var auctions = [];
  var srvOffset = 0;
  var drafts = {};      // auksjon-id -> budutkast i feltet
  var msgs = {};        // auksjon-id -> {text, cls, until}
  var armed = {};       // auksjon-id -> {amount, until}  (bekreft-klikk)
  var seenEnds = {};    // auksjon-id -> sist sette endsAt (oppdager forlengelse)
  var flashUntil = {};  // auksjon-id -> tidspunkt «+30 sek!» vises til
  var settling = {};    // auksjon-id -> true mens oppgjør pågår her
  var lastPinAt = 0;
  var lastSig = '';
  var pinBuf = '';
  var pinPending = null; // {id, amount}
  var started = false;

  function now() { return Date.now() + srvOffset; }
  function R(p) { return window._ref(window._db, p); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(ms) {
    if (ms <= 0) return '0:00';
    var t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
             : m + ':' + String(s).padStart(2, '0');
  }
  function shortName(s) {
    var ln = String(s.lastname || '');
    return ((s.firstname || '') + (ln ? ' ' + ln.charAt(0) + '.' : '')).trim() || 'Elev';
  }
  function shopStudent() {
    try { return (typeof _shopStudent !== 'undefined' && _shopStudent) ? _shopStudent : null; }
    catch (e) { return null; }
  }
  function freshStudent(s) {
    if (!s) return null;
    return (window._allStudents || []).find(function (x) { return x.fbKey === s.fbKey; }) || s;
  }
  function visibleFor(s) {
    var filt = !(window._settings && window._settings.workspaceFilteringDisabled);
    var ws = (s && s.workspaceId) || 'main';
    return auctions.filter(function (a) { return !s || !filt || ((a.workspaceId || 'main') === ws); });
  }
  function isLive(a) { return a.status === 'active' && now() < a.endsAt; }
  function minNext(a) { return a.highBid ? (a.highBid.amount + (a.minIncrement || 1)) : (a.startPrice || 1); }
  function committed(sk, exceptId) {
    return auctions.reduce(function (t, a) {
      return (a.status === 'active' && a.fbKey !== exceptId && a.highBid && a.highBid.sk === sk) ? t + a.highBid.amount : t;
    }, 0);
  }
  function available(s, exceptId) {
    s = freshStudent(s);
    return Math.max(0, (s.balance || 0) - committed(s.fbKey, exceptId));
  }
  // Tilgjengelig for andre skript (f.eks. butikken)
  window.auksjonHoldtAv = function (sk) { return committed(sk, null); };

  // ── Stil ────────────────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('auk-style')) return;
    var st = document.createElement('style');
    st.id = 'auk-style';
    st.textContent =
      '.auk-wrap{margin-bottom:1rem}' +
      '.auk-h{font-family:"Fredoka One",cursive;font-size:1.15rem;color:var(--teal-dark);margin:0 0 .5rem;display:flex;align-items:center;gap:6px}' +
      '.auk-card{background:#fff;border:2px solid var(--amber);border-radius:16px;padding:12px 14px;margin-bottom:10px;box-shadow:0 3px 0 rgba(0,0,0,.05)}' +
      '.auk-card.auk-lead{border-color:var(--teal);background:var(--teal-light)}' +
      '.auk-card.auk-done{border-color:var(--border);background:#fafafa}' +
      '.auk-top{display:flex;align-items:center;gap:10px}' +
      '.auk-emoji{font-size:2.1rem;flex-shrink:0;line-height:1}' +
      '.auk-name{font-weight:800;font-size:1rem;color:var(--text);line-height:1.2}' +
      '.auk-desc{font-size:.8rem;color:var(--muted);font-weight:600;margin-top:2px}' +
      '.auk-cd{margin-left:auto;font-family:"Fredoka One",cursive;font-size:1.35rem;color:var(--teal-dark);background:var(--amber-light);border-radius:12px;padding:4px 10px;white-space:nowrap;min-width:64px;text-align:center}' +
      '.auk-cd.auk-urgent{background:var(--coral);color:#fff;animation:aukPulse 1s infinite}' +
      '@keyframes aukPulse{50%{transform:scale(1.06)}}' +
      '.auk-high{margin-top:8px;font-size:.88rem;font-weight:700;color:var(--text)}' +
      '.auk-high b{font-family:"Fredoka One",cursive;font-size:1.05rem;color:var(--teal-dark);font-weight:400}' +
      '.auk-flash{display:none;margin-left:6px;background:var(--coral);color:#fff;border-radius:999px;padding:1px 8px;font-size:.75rem;font-weight:800}' +
      '.auk-you{display:inline-block;margin-top:6px;background:var(--teal);color:#fff;border-radius:999px;padding:3px 10px;font-size:.78rem;font-weight:800}' +
      '.auk-form{display:flex;gap:6px;margin-top:10px;align-items:stretch}' +
      '.auk-form input{flex:1;min-width:0;font-family:"Nunito",sans-serif;font-size:1rem;font-weight:800;padding:9px 10px;border-radius:10px;border:1.5px solid var(--border);outline:none}' +
      '.auk-form .auk-plus{background:var(--teal-light);color:var(--teal-dark);border:none;border-radius:10px;padding:0 10px;font-weight:800;font-family:"Nunito",sans-serif;cursor:pointer}' +
      '.auk-form .auk-bid{background:var(--teal);color:#fff;border:none;border-radius:10px;padding:0 14px;font-weight:800;font-family:"Nunito",sans-serif;font-size:.9rem;cursor:pointer;white-space:nowrap}' +
      '.auk-form .auk-bid.auk-armed{background:var(--amber);color:var(--teal-dark)}' +
      '.auk-note{font-size:.75rem;color:var(--muted);font-weight:700;margin-top:6px}' +
      '.auk-msg{font-size:.82rem;font-weight:800;margin-top:6px}' +
      '.auk-msg.ok{color:var(--teal-dark)}.auk-msg.err{color:var(--coral)}' +
      '.auk-recent{margin-top:8px;border-top:1px dashed var(--border);padding-top:6px;font-size:.75rem;color:var(--muted);font-weight:700}' +
      '.auk-recent div{display:flex;justify-content:space-between}' +
      '.auk-result{margin-top:8px;font-weight:800;font-size:.9rem;color:var(--teal-dark)}' +
      '.auk-banner{width:100%;background:var(--amber-light);border:2px solid var(--amber);border-radius:14px;padding:10px 14px;margin-bottom:14px;font-weight:800;color:var(--teal-dark);font-size:.9rem}' +
      '.auk-banner .auk-bl{display:flex;justify-content:space-between;gap:8px;margin-top:4px;font-size:.85rem}' +
      '#auk-splash-badge{display:none;margin-left:8px;background:var(--amber);color:var(--teal-dark);border-radius:999px;padding:2px 10px;font-size:.8rem;vertical-align:middle}';
    document.head.appendChild(st);
  }

  // ── Plassér beholdere i butikken ────────────────────────────────────────
  function injectUI() {
    injectStyle();
    var content = document.getElementById('shop-content-section');
    if (content && !document.getElementById('auk-shop-box')) {
      var box = document.createElement('div');
      box.id = 'auk-shop-box';
      box.className = 'auk-wrap';
      var search = content.querySelector('input[type="text"]');
      if (search) content.insertBefore(box, search); else content.appendChild(box);
      box.addEventListener('input', function (e) {
        var id = e.target && e.target.getAttribute('data-auk-in');
        if (id) { drafts[id] = e.target.value; delete armed[id]; syncBidBtn(id); }
      });
    }
    var login = document.getElementById('shop-login-section');
    if (login && !document.getElementById('auk-login-banner')) {
      var b = document.createElement('div');
      b.id = 'auk-login-banner';
      b.className = 'auk-banner';
      b.style.display = 'none';
      login.insertBefore(b, login.firstChild);
    }
    var sbtn = document.querySelector('button[onclick="showShopScreen()"]');
    if (sbtn && !document.getElementById('auk-splash-badge')) {
      var sp = document.createElement('span');
      sp.id = 'auk-splash-badge';
      sp.textContent = '🔨 Auksjon!';
      sbtn.appendChild(sp);
    }
    if (!document.getElementById('auk-pin-overlay')) {
      var ov = document.createElement('div');
      ov.className = 'pin-overlay';
      ov.id = 'auk-pin-overlay';
      ov.style.zIndex = '700';
      var keys = ['1','2','3','4','5','6','7','8','9','','0','DEL'].map(function (k) {
        if (k === '') return '<button class="pin-ov-btn empty"></button>';
        if (k === 'DEL') return '<button class="pin-ov-btn del" onclick="aukPin(\'DEL\')">⌫</button>';
        return '<button class="pin-ov-btn" onclick="aukPin(\'' + k + '\')">' + k + '</button>';
      }).join('');
      ov.innerHTML =
        '<div class="pin-ov-title">Bekreft budet ditt</div>' +
        '<div style="font-family:\'Fredoka One\',cursive;font-size:1.2rem;color:rgba(255,255,255,.9);margin-bottom:.2rem;text-align:center" id="auk-pin-item"></div>' +
        '<div class="pin-ov-amount" id="auk-pin-amount"></div>' +
        '<div class="pin-ov-card">' +
          '<div style="font-size:.78rem;color:rgba(255,255,255,.6);text-align:center;margin-bottom:.4rem">Tast inn PIN for å by</div>' +
          '<div class="pin-ov-dots"><div class="pin-ov-dot" id="auk-pdot-0"></div><div class="pin-ov-dot" id="auk-pdot-1"></div><div class="pin-ov-dot" id="auk-pdot-2"></div><div class="pin-ov-dot" id="auk-pdot-3"></div></div>' +
          '<div class="pin-ov-err" id="auk-pin-err"></div>' +
          '<div class="pin-ov-numpad">' + keys + '</div>' +
        '</div>' +
        '<button class="pin-ov-cancel" onclick="aukPinCancel()">Avbryt</button>';
      document.body.appendChild(ov);
    }
  }

  // ── Tegning ─────────────────────────────────────────────────────────────
  function recentList(a) {
    var r = a.recent ? (Array.isArray(a.recent) ? a.recent : Object.values(a.recent)) : [];
    return r.filter(Boolean).slice(-4).reverse();
  }

  function renderShopBox() {
    var box = document.getElementById('auk-shop-box');
    if (!box) return;
    var s = shopStudent();
    if (!s) { box.innerHTML = ''; return; }
    s = freshStudent(s);
    var t = now();
    var list = visibleFor(s);
    var live = list.filter(function (a) { return a.status === 'active'; }).sort(function (x, y) { return x.endsAt - y.endsAt; });
    var ended = list.filter(function (a) {
      return a.status !== 'active' && a.status !== 'cancelled' && (a.endsAt || 0) > t - SHOW_ENDED_MS;
    }).sort(function (x, y) { return y.endsAt - x.endsAt; }).slice(0, 3);
    if (!live.length && !ended.length) { box.innerHTML = ''; return; }

    var focusedId = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-auk-in');

    var html = '<div class="auk-h">🔨 Auksjon</div>';
    live.forEach(function (a) {
      var id = a.fbKey;
      var open = isLive(a);
      var lead = a.highBid && a.highBid.sk === s.fbKey;
      var mn = minNext(a);
      var av = available(s, id);
      var val = (drafts[id] != null && drafts[id] !== '') ? drafts[id] : mn;
      html += '<div class="auk-card' + (lead ? ' auk-lead' : '') + '">' +
        '<div class="auk-top"><span class="auk-emoji">' + esc(a.emoji || '🔨') + '</span>' +
          '<div><div class="auk-name">' + esc(a.name) + '</div>' + (a.desc ? '<div class="auk-desc">' + esc(a.desc) + '</div>' : '') + '</div>' +
          '<div class="auk-cd" data-auk-cd="' + id + '"></div></div>' +
        '<div class="auk-high">' + (a.highBid
            ? 'Høyeste bud: <b>🪙 ' + a.highBid.amount + '</b> · ' + esc(a.highBid.name)
            : 'Ingen bud ennå · startbud <b>🪙 ' + (a.startPrice || 1) + '</b>') +
          '<span class="auk-flash" data-auk-flash="' + id + '">⏱️ +30 sek!</span></div>' +
        (lead ? '<div class="auk-you">⭐ Du leder!</div>' : '');
      if (open && !lead) {
        html += '<div class="auk-form">' +
          '<input type="number" inputmode="numeric" min="' + mn + '" step="1" data-auk-in="' + id + '" value="' + esc(val) + '">' +
          '<button class="auk-plus" onclick="aukPlus(\'' + id + '\',' + (a.minIncrement || 1) + ')">+' + (a.minIncrement || 1) + '</button>' +
          '<button class="auk-bid" data-auk-btn="' + id + '" onclick="aukBid(\'' + id + '\')">Legg inn bud</button>' +
        '</div>' +
        '<div class="auk-note">Minste bud: 🪙 ' + mn + ' · Du kan by opptil 🪙 ' + av +
          (committed(s.fbKey, id) > 0 ? ' (🪙 ' + committed(s.fbKey, id) + ' er holdt av i andre auksjoner)' : '') + '</div>';
      } else if (open && lead) {
        html += '<div class="auk-note">Myntene er holdt av til auksjonen er over. Følg med – noen kan by over deg!</div>';
      }
      var m = msgs[id];
      if (m && m.until > Date.now()) html += '<div class="auk-msg ' + m.cls + '">' + esc(m.text) + '</div>';
      var rec = recentList(a);
      if (rec.length) {
        html += '<div class="auk-recent">' + rec.map(function (r) {
          return '<div><span>' + esc(r.name) + '</span><span>🪙 ' + r.amount + '</span></div>';
        }).join('') + '</div>';
      }
      html += '</div>';
    });
    ended.forEach(function (a) {
      var res;
      if (a.status === 'sold' && a.winner) {
        res = a.winner.sk === s.fbKey
          ? '🎉 Du vant! 🪙 ' + a.winner.amount + ' er trukket fra brukskontoen. Hent varen hos læreren.'
          : '🔨 Solgt til ' + esc(a.winner.name) + ' for 🪙 ' + a.winner.amount;
      } else if (a.status === 'unsold') {
        res = 'Ingen vinner denne gangen' + (a.settleNote ? ' – ' + esc(a.settleNote) : '');
      } else {
        res = '⏳ Tiden er ute – finner vinneren …';
      }
      html += '<div class="auk-card auk-done"><div class="auk-top"><span class="auk-emoji">' + esc(a.emoji || '🔨') + '</span>' +
        '<div class="auk-name">' + esc(a.name) + '</div></div><div class="auk-result">' + res + '</div></div>';
    });
    box.innerHTML = html;
    if (focusedId) {
      var inp = box.querySelector('[data-auk-in="' + focusedId + '"]');
      if (inp) { inp.focus(); try { var l = String(inp.value).length; inp.setSelectionRange(l, l); } catch (e) {} }
    }
    Object.keys(armed).forEach(syncBidBtn);
    tickDisplays();
  }

  function renderBanner() {
    var b = document.getElementById('auk-login-banner');
    var badge = document.getElementById('auk-splash-badge');
    var live = auctions.filter(isLive);
    if (badge) badge.style.display = live.length ? 'inline-block' : 'none';
    if (!b) return;
    if (!live.length) { b.style.display = 'none'; b.innerHTML = ''; return; }
    b.style.display = 'block';
    b.innerHTML = '🔨 Auksjon pågår! Logg inn for å by.' + live.map(function (a) {
      return '<div class="auk-bl"><span>' + esc(a.emoji || '🔨') + ' ' + esc(a.name) +
        (a.highBid ? ' · 🪙 ' + a.highBid.amount : '') + '</span><span data-auk-cd="' + a.fbKey + '"></span></div>';
    }).join('');
  }

  function renderAll() { renderShopBox(); renderBanner(); }

  function syncBidBtn(id) {
    var btn = document.querySelector('[data-auk-btn="' + id + '"]');
    if (!btn) return;
    var a = armed[id];
    if (a && a.until > Date.now()) { btn.classList.add('auk-armed'); btn.textContent = 'Bekreft 🪙 ' + a.amount; }
    else { btn.classList.remove('auk-armed'); btn.textContent = 'Legg inn bud'; delete armed[id]; }
  }

  function setMsg(id, text, cls) {
    msgs[id] = { text: text, cls: cls || 'ok', until: Date.now() + 6000 };
    renderShopBox();
  }

  // ── Nedtelling + oppgjør (kjøres 4 ganger i sekundet) ───────────────────
  function tickDisplays() {
    var t = now();
    var els = document.querySelectorAll('[data-auk-cd]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var a = auctions.find(function (x) { return x.fbKey === el.getAttribute('data-auk-cd'); });
      if (!a) continue;
      var left = a.endsAt - t;
      el.textContent = a.status === 'active' ? (left > 0 ? fmt(left) : 'Slutt!') : '';
      el.classList.toggle('auk-urgent', a.status === 'active' && left > 0 && left <= EXT_WINDOW);
    }
    var fl = document.querySelectorAll('[data-auk-flash]');
    for (var j = 0; j < fl.length; j++) {
      fl[j].style.display = (flashUntil[fl[j].getAttribute('data-auk-flash')] || 0) > Date.now() ? 'inline-block' : 'none';
    }
  }

  function tick() {
    tickDisplays();
    var t = now();
    auctions.forEach(function (a) {
      if (a.status === 'active' && t >= a.endsAt + 1500) settle(a.fbKey);
    });
    Object.keys(armed).forEach(function (id) { if (armed[id].until <= Date.now()) syncBidBtn(id); });
    var sig = auctions.map(function (a) { return a.fbKey + (isLive(a) ? '1' : '0'); }).join(',') +
      Object.keys(msgs).filter(function (k) { return msgs[k].until > Date.now(); }).join(',');
    if (sig !== lastSig) { lastSig = sig; renderAll(); }
  }

  // ── Bud ─────────────────────────────────────────────────────────────────
  window.aukPlus = function (id, inc) {
    var a = auctions.find(function (x) { return x.fbKey === id; }); if (!a) return;
    var inp = document.querySelector('[data-auk-in="' + id + '"]');
    var cur = parseInt(inp && inp.value, 10);
    if (!(cur > 0)) cur = minNext(a) - inc;
    var v = Math.max(minNext(a), cur + inc);
    drafts[id] = String(v); delete armed[id];
    if (inp) inp.value = v;
    syncBidBtn(id);
  };

  window.aukBid = function (id) {
    var s = shopStudent(); if (!s) return;
    s = freshStudent(s);
    var a = auctions.find(function (x) { return x.fbKey === id; }); if (!a) return;
    var inp = document.querySelector('[data-auk-in="' + id + '"]');
    var amount = Math.floor(Number(inp ? inp.value : drafts[id]));
    var err = precheck(a, s, amount);
    if (err) { delete armed[id]; return setMsg(id, err, 'err'); }
    if (Date.now() - lastPinAt > FRESH_MS) { openPin(id, amount, a); return; }
    var arm = armed[id];
    if (arm && arm.amount === amount && arm.until > Date.now()) { delete armed[id]; placeBid(id, amount); return; }
    armed[id] = { amount: amount, until: Date.now() + 4000 };
    syncBidBtn(id);
  };

  function precheck(a, s, amount) {
    if (!(amount > 0)) return 'Skriv inn et gyldig bud.';
    if (!isLive(a)) return 'Auksjonen er over.';
    if (a.highBid && a.highBid.sk === s.fbKey) return 'Du har allerede høyeste bud! 🎉';
    if (amount < minNext(a)) return 'Budet må være minst 🪙 ' + minNext(a) + '.';
    var av = available(s, a.fbKey);
    if (amount > av) {
      var held = committed(s.fbKey, a.fbKey);
      return (s.balance || 0) <= 0
        ? 'Du har ingen mynter på brukskontoen å by med.'
        : 'Du kan ikke by mer enn du har på brukskontoen (🪙 ' + av + (held ? ', fordi 🪙 ' + held + ' er holdt av i andre auksjoner' : '') + ').';
    }
    return '';
  }

  async function placeBid(id, amount) {
    var s0 = shopStudent(); if (!s0) return;
    var s = freshStudent(s0);
    var a = auctions.find(function (x) { return x.fbKey === id; }); if (!a) return;
    var err = precheck(a, s, amount);
    if (err) return setMsg(id, err, 'err');
    var bidder = { sk: s.fbKey, name: shortName(s) };
    var reason = '', extended = false;
    try {
      var res = await window._runTransaction(R('auctions57/' + id), function (cur) {
        reason = ''; extended = false;
        if (!cur) return cur;
        var t = now();
        if (cur.status !== 'active' || t >= cur.endsAt) { reason = 'over'; return; }
        var mn = cur.highBid ? cur.highBid.amount + (cur.minIncrement || 1) : (cur.startPrice || 1);
        if (cur.highBid && cur.highBid.sk === bidder.sk) { reason = 'leder'; return; }
        if (amount < mn) { reason = 'lav:' + mn; return; }
        cur.highBid = { sk: bidder.sk, name: bidder.name, amount: amount, ts: t };
        cur.bidCount = (cur.bidCount || 0) + 1;
        if (cur.endsAt - t < EXT_WINDOW) {
          cur.endsAt = cur.endsAt + EXT_ADD;
          cur.extensions = (cur.extensions || 0) + 1;
          extended = true;
        }
        var rec = cur.recent ? (Array.isArray(cur.recent) ? cur.recent.slice() : Object.values(cur.recent)) : [];
        rec.push({ name: bidder.name, amount: amount, ts: t });
        cur.recent = rec.filter(Boolean).slice(-6);
        return cur;
      });
      if (!res.committed) {
        if (reason === 'over') return setMsg(id, 'For sent – auksjonen er over.', 'err');
        if (reason === 'leder') return setMsg(id, 'Du har allerede høyeste bud! 🎉', 'ok');
        if (reason.indexOf('lav:') === 0) {
          drafts[id] = reason.slice(4);
          return setMsg(id, 'Noen var raskere! Nå må du by minst 🪙 ' + reason.slice(4) + '.', 'err');
        }
        return setMsg(id, 'Budet gikk ikke gjennom. Prøv igjen.', 'err');
      }
      lastPinAt = Date.now();
      window._set(window._push(R('auctionBids57/' + id)), { sk: bidder.sk, name: bidder.name, amount: amount, ts: now() })
        .catch(function (e) { console.warn('Budlogg feilet', e); });
      delete drafts[id];
      setMsg(id, extended ? '✅ Bud på 🪙 ' + amount + '! Fristen ble forlenget med 30 sek.' : '✅ Du leder med 🪙 ' + amount + '!', 'ok');
    } catch (e) {
      console.error('Bud feilet', e);
      setMsg(id, 'Noe gikk galt med nettet. Prøv igjen.', 'err');
    }
  }

  // ── PIN-bekreftelse ─────────────────────────────────────────────────────
  function pinDots() {
    for (var i = 0; i < 4; i++) {
      var d = document.getElementById('auk-pdot-' + i);
      if (d) d.classList.toggle('filled', i < pinBuf.length);
    }
  }
  function openPin(id, amount, a) {
    pinPending = { id: id, amount: amount }; pinBuf = ''; pinDots();
    document.getElementById('auk-pin-item').textContent = (a.emoji || '🔨') + ' ' + (a.name || '');
    document.getElementById('auk-pin-amount').textContent = amount + ' 🪙';
    document.getElementById('auk-pin-err').textContent = '';
    document.getElementById('auk-pin-overlay').classList.add('open');
  }
  window.aukPinCancel = function () {
    pinPending = null; pinBuf = ''; pinDots();
    document.getElementById('auk-pin-overlay').classList.remove('open');
  };
  window.aukPin = function (v) {
    if (v === 'DEL') pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < 4) pinBuf += v;
    pinDots();
    document.getElementById('auk-pin-err').textContent = '';
    if (pinBuf.length === 4) setTimeout(checkPin, 150);
  };
  function checkPin() {
    var s = freshStudent(shopStudent());
    if (!s || !pinPending) { window.aukPinCancel(); return; }
    if (String(pinBuf) !== String(s.pin)) {
      document.getElementById('auk-pin-err').textContent = '❌ Feil PIN – prøv igjen';
      pinBuf = ''; pinDots(); return;
    }
    var p = pinPending;
    window.aukPinCancel();
    lastPinAt = Date.now();
    placeBid(p.id, p.amount);
  }

  // ── Oppgjør (vinner trekkes) ────────────────────────────────────────────
  async function settle(id) {
    if (settling[id]) return;
    settling[id] = true;
    try {
      var token = Math.random().toString(36).slice(2) + Date.now();
      var res = await window._runTransaction(R('auctions57/' + id), function (cur) {
        if (!cur) return cur;
        if (cur.status !== 'active') return;
        if (now() < cur.endsAt) return;
        cur.status = 'settling'; cur.settleClaim = token; cur.settleClaimAt = now();
        return cur;
      });
      if (!res.committed) return;
      var a = res.snapshot.val();
      if (!a || a.settleClaim !== token) return;
      await payOut(id, a);
    } catch (e) {
      console.warn('Auksjon-oppgjør feilet', e);
    } finally {
      setTimeout(function () { delete settling[id]; }, 5000);
    }
  }

  async function payOut(id, a) {
    if (!a.highBid) {
      await window._update(R('auctions57/' + id), { status: 'unsold', settledAt: now(), settleNote: 'Ingen bud' });
      return;
    }
    var cands = [];
    try {
      var snap = await window._get(R('auctionBids57/' + id));
      var v = snap.val() || {};
      cands = Object.keys(v).map(function (k) { return v[k]; });
    } catch (e) { console.warn('Klarte ikke å hente budhistorikk', e); }
    cands.push({ sk: a.highBid.sk, name: a.highBid.name, amount: a.highBid.amount, ts: a.highBid.ts });
    cands.sort(function (x, y) { return (y.amount - x.amount) || ((x.ts || 0) - (y.ts || 0)); });
    var seen = {}, list = [];
    cands.forEach(function (c) { if (c && c.sk && !seen[c.sk]) { seen[c.sk] = 1; list.push(c); } });

    for (var i = 0; i < list.length; i++) {
      var c = list[i], ok = false;
      var r = await window._runTransaction(R('students57/' + c.sk + '/balance'), function (bal) {
        ok = false;
        if (bal === null) return bal;
        var b = Number(bal) || 0;
        if (b < c.amount) return;
        ok = true;
        return b - c.amount;
      });
      if (r.committed && ok) {
        await window._set(window._push(R('transactions57/' + c.sk)), {
          type: 'expense', icon: '🔨', desc: ('Vant auksjon: ' + (a.emoji || '') + ' ' + (a.name || '')).trim(),
          amount: -c.amount, ts: Date.now()
        });
        await window._update(R('auctions57/' + id), {
          status: 'sold', settledAt: now(),
          winner: { sk: c.sk, name: c.name || '', amount: c.amount },
          settleNote: i > 0 ? 'Høyeste budgiver hadde ikke nok mynter igjen – varen gikk til neste bud.' : null
        });
        return;
      }
    }
    await window._update(R('auctions57/' + id), { status: 'unsold', settledAt: now(), settleNote: 'Ingen av budgiverne hadde nok mynter igjen.' });
  }

  // ── Butikken: ikke la eleven bruke mynter som er holdt av til et bud ────
  function wrapShop() {
    if (typeof window.tryShopLogin === 'function' && !window.tryShopLogin._auk) {
      var oTry = window.tryShopLogin;
      window.tryShopLogin = function () {
        var before = shopStudent();
        var r = oTry.apply(this, arguments);
        var after = shopStudent();
        if (after && after !== before) { lastPinAt = Date.now(); drafts = {}; msgs = {}; armed = {}; }
        renderAll();
        return r;
      };
      window.tryShopLogin._auk = true;
    }
    if (typeof window.shopLogout === 'function' && !window.shopLogout._auk) {
      var oOut = window.shopLogout;
      window.shopLogout = function () {
        var r = oOut.apply(this, arguments);
        lastPinAt = 0; drafts = {}; msgs = {}; armed = {};
        window.aukPinCancel && document.getElementById('auk-pin-overlay') && window.aukPinCancel();
        renderAll();
        return r;
      };
      window.shopLogout._auk = true;
    }
    if (typeof window.checkCartPin === 'function' && !window.checkCartPin._auk) {
      var oCart = window.checkCartPin;
      window.checkCartPin = function () {
        try {
          var s = freshStudent(shopStudent());
          if (s && String(_cartPin) === String(s.pin)) {
            var held = committed(s.fbKey, null);
            var total = (_shopCart || []).reduce(function (t, x) { return t + (x.price || 0); }, 0);
            var bal = s.balance || 0;
            if (held > 0 && bal - total < held) {
              var el = document.getElementById('cart-pin-error');
              if (el) el.textContent = '🔨 🪙 ' + held + ' er holdt av til auksjonsbudet ditt. Du kan handle for 🪙 ' + Math.max(0, bal - held) + '.';
              _cartPin = '';
              for (var i = 0; i < 4; i++) { var d = document.getElementById('cart-pdot-' + i); if (d) d.classList.remove('filled'); }
              return;
            }
          }
        } catch (e) { console.warn(e); }
        return oCart.apply(this, arguments);
      };
      window.checkCartPin._auk = true;
    }
    if (typeof window.confirmPurchase === 'function' && !window.confirmPurchase._auk) {
      var oBuy = window.confirmPurchase;
      window.confirmPurchase = function () {
        try {
          var s = window._currentStudent;
          if (s && _pendingPurchase && String(_buyPin) === String(s.pin)) {
            var held = committed(s.fbKey, null);
            var bal = s.balance || 0;
            if (held > 0 && bal - _pendingPurchase.price < held) {
              var el = document.getElementById('purchase-pin-error');
              if (el) el.textContent = '🔨 🪙 ' + held + ' er holdt av til auksjonsbudet ditt.';
              _buyPin = '';
              for (var i = 0; i < 4; i++) { var d = document.getElementById('bpdot-' + i); if (d) d.classList.remove('filled'); }
              return;
            }
          }
        } catch (e) { console.warn(e); }
        return oBuy.apply(this, arguments);
      };
      window.confirmPurchase._auk = true;
    }
  }

  // ── Oppstart ────────────────────────────────────────────────────────────
  function init() {
    if (started) return;
    if (!window._db || !window._ref || !window._onValue || !window._runTransaction || !window._CLASS_ID) {
      setTimeout(init, 400); return;
    }
    started = true;
    injectUI();
    wrapShop();
    window._onValue(R('.info/serverTimeOffset'), function (snap) { srvOffset = snap.val() || 0; });
    window._onValue(R('auctions57'), function (snap) {
      var v = snap.val() || {};
      auctions = Object.keys(v).map(function (k) { var a = v[k] || {}; a.fbKey = k; return a; });
      auctions.forEach(function (a) {
        if (seenEnds[a.fbKey] && a.endsAt > seenEnds[a.fbKey] && a.status === 'active') flashUntil[a.fbKey] = Date.now() + 3000;
        seenEnds[a.fbKey] = a.endsAt;
      });
      renderAll();
    });
    // Saldo endrer seg → oppdater «du kan by opptil»
    window._onValue(R('students57'), function () { if (shopStudent()) renderShopBox(); });
    setInterval(tick, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
