/* ════════════════════════════════════════════════════════════════════════
   Myntland – AUKSJON 5.–7. trinn (lærerportalen)
   ────────────────────────────────────────────────────────────────────────
   Lastes etter laererportal57.js. Legger et «🔨 Auksjon»-kort øverst på
   Butikk-siden: start auksjon, følg budene live, avslutt/avbryt, og vis
   auksjonen på storskjerm.

   Samme regler og samme oppgjør som i elevappen (auksjon57-elev.js):
   • maks bud = brukskonto minus det eleven leder med i andre auksjoner
   • bud innen 30 sek før slutt → fristen forlenges med 30 sek
   • når tiden er ute, trekkes vinneren automatisk (én gang, via transaksjon)

   Data: classes/{id}/data/auctions57 og auctionBids57
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var auctions = [];
  var srvOffset = 0;
  var settling = {};
  var seenEnds = {};
  var flashUntil = {};
  var bigId = null;
  var lastSig = '';
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
  function clock(ts) {
    var d = new Date(ts - srvOffset);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function mine() {
    return (typeof filterByWorkspace === 'function') ? filterByWorkspace(auctions) : auctions;
  }
  function byId(id) { return auctions.find(function (a) { return a.fbKey === id; }); }
  function isLive(a) { return a.status === 'active' && now() < a.endsAt; }
  function recentList(a) {
    var r = a.recent ? (Array.isArray(a.recent) ? a.recent : Object.values(a.recent)) : [];
    return r.filter(Boolean).slice(-6).reverse();
  }

  // ── Stil ────────────────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('auk-t-style')) return;
    var st = document.createElement('style');
    st.id = 'auk-t-style';
    st.textContent =
      '.aukt-item{border:1.5px solid var(--border);border-radius:14px;padding:12px 14px;margin-bottom:10px;background:#fff}' +
      '.aukt-item.live{border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-light)}' +
      '.aukt-top{display:flex;align-items:center;gap:10px}' +
      '.aukt-emoji{font-size:1.9rem;line-height:1}' +
      '.aukt-name{font-weight:800;font-size:1rem}' +
      '.aukt-sub{font-size:.8rem;color:var(--muted);font-weight:600}' +
      '.aukt-cd{margin-left:auto;font-family:"Fredoka One",cursive;font-size:1.3rem;color:var(--teal-dark);background:var(--amber-light);border-radius:10px;padding:3px 10px;min-width:70px;text-align:center}' +
      '.aukt-cd.urgent{background:var(--coral);color:#fff}' +
      '.aukt-pill{margin-left:auto;font-size:.75rem;font-weight:800;border-radius:999px;padding:3px 10px;background:var(--teal-light);color:var(--teal-dark)}' +
      '.aukt-pill.grey{background:#eee;color:#666}' +
      '.aukt-high{margin-top:8px;font-size:.9rem;font-weight:700}' +
      '.aukt-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
      '.aukt-flash{display:none;margin-left:6px;background:var(--coral);color:#fff;border-radius:999px;padding:1px 8px;font-size:.75rem;font-weight:800}' +
      '.aukt-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
      '#aukt-big{display:none;position:fixed;inset:0;z-index:9999;background:linear-gradient(160deg,#0F6E56,#04342C);color:#fff;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem;font-family:"Nunito",sans-serif}' +
      '#aukt-big.open{display:flex}' +
      '#aukt-big .b-close{position:absolute;top:18px;right:22px;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:1.4rem;border-radius:12px;padding:6px 14px;cursor:pointer}' +
      '#aukt-big .b-full{position:absolute;top:18px;right:92px;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:1rem;font-weight:800;border-radius:12px;padding:9px 14px;cursor:pointer}' +
      '#aukt-big .b-label{font-family:"Fredoka One",cursive;color:#FAC775;font-size:1.6rem;letter-spacing:.5px}' +
      '#aukt-big .b-emoji{font-size:9rem;line-height:1.1;margin:.5rem 0}' +
      '#aukt-big .b-name{font-family:"Fredoka One",cursive;font-size:3.2rem;line-height:1.1}' +
      '#aukt-big .b-desc{font-size:1.3rem;opacity:.8;font-weight:700;margin-top:.3rem}' +
      '#aukt-big .b-cd{font-family:"Fredoka One",cursive;font-size:7rem;line-height:1;margin:1.5rem 0 .6rem;padding:.1em .5em;border-radius:28px;background:rgba(255,255,255,.1)}' +
      '#aukt-big .b-cd.urgent{background:#D85A30;animation:auktPulse 1s infinite}' +
      '@keyframes auktPulse{50%{transform:scale(1.05)}}' +
      '#aukt-big .b-high{font-size:2.2rem;font-weight:800}' +
      '#aukt-big .b-high b{font-family:"Fredoka One",cursive;color:#FAC775;font-weight:400;font-size:2.8rem}' +
      '#aukt-big .b-flash{display:none;margin-top:.6rem;background:#D85A30;border-radius:999px;padding:.3rem 1.2rem;font-weight:800;font-size:1.5rem}' +
      '#aukt-big .b-recent{margin-top:1.2rem;font-size:1.2rem;opacity:.85;font-weight:700;line-height:1.6}' +
      '#aukt-big .b-rules{position:absolute;bottom:18px;left:0;right:0;font-size:1rem;opacity:.65;font-weight:700}';
    document.head.appendChild(st);
  }

  // ── Kortet på Butikk-siden ──────────────────────────────────────────────
  function injectUI() {
    injectStyle();
    var page = document.getElementById('page-butikk57');
    if (page && !document.getElementById('aukt-card')) {
      var card = document.createElement('div');
      card.className = 'card';
      card.id = 'aukt-card';
      card.innerHTML =
        '<div class="card-title">🔨 Auksjon</div>' +
        '<p style="font-size:.86rem;color:var(--muted);line-height:1.6;margin-bottom:1rem;">Legg ut noe elevene kan by på i Butikken i elevappen. ' +
          'Ingen kan by mer enn de har på <strong>brukskontoen</strong> (mynter de allerede leder med i en annen auksjon er holdt av). ' +
          'Kommer det et bud i de <strong>siste 30 sekundene</strong>, forlenges fristen med <strong>30 sekunder</strong>. ' +
          'Når tiden er ute, trekkes myntene automatisk fra vinneren. Har vinneren ikke nok igjen, går varen til neste bud.</p>' +
        '<div class="grid-2">' +
          '<div>' +
            '<div class="form-row"><label>Hent fra butikken (valgfritt)</label><select id="aukt-from"><option value="">– Skriv inn selv –</option></select></div>' +
            '<div class="aukt-row">' +
              '<div class="form-row"><label>Emoji</label><input type="text" id="aukt-emoji" placeholder="🎁" maxlength="4"></div>' +
              '<div class="form-row"><label>Hva auksjoneres?</label><input type="text" id="aukt-name" placeholder="f.eks. Velge musikk fredag" maxlength="60"></div>' +
            '</div>' +
            '<div class="form-row"><label>Beskrivelse (valgfritt)</label><input type="text" id="aukt-desc" placeholder="f.eks. Du velger spillelista i arbeidsøkta" maxlength="120"></div>' +
            '<div class="aukt-row">' +
              '<div class="form-row"><label>Startbud (mynter)</label><input type="number" id="aukt-start" value="10" min="1"></div>' +
              '<div class="form-row"><label>Minste budøkning</label><input type="number" id="aukt-inc" value="5" min="1"></div>' +
            '</div>' +
            '<div class="aukt-row">' +
              '<div class="form-row"><label>Varighet</label><select id="aukt-dur">' +
                '<option value="1">1 minutt</option><option value="2">2 minutter</option><option value="3" selected>3 minutter</option>' +
                '<option value="5">5 minutter</option><option value="10">10 minutter</option><option value="15">15 minutter</option>' +
                '<option value="30">30 minutter</option><option value="60">1 time</option><option value="180">3 timer</option>' +
                '<option value="clock">Slutter kl. …</option></select></div>' +
              '<div class="form-row" id="aukt-clock-row" style="display:none"><label>Slutter kl.</label><input type="time" id="aukt-clock"></div>' +
            '</div>' +
            '<button class="btn btn-primary" onclick="auktCreate()">🔨 Start auksjon</button>' +
            '<div id="aukt-alert" style="margin-top:1rem;"></div>' +
          '</div>' +
          '<div><div id="aukt-list"><p style="color:var(--muted);font-size:.9rem;">Ingen auksjoner ennå.</p></div></div>' +
        '</div>';
      var sub = page.querySelector('.page-subtitle');
      if (sub && sub.nextSibling) page.insertBefore(card, sub.nextSibling); else page.appendChild(card);

      document.getElementById('aukt-dur').addEventListener('change', function () {
        document.getElementById('aukt-clock-row').style.display = this.value === 'clock' ? '' : 'none';
      });
      document.getElementById('aukt-from').addEventListener('change', function () {
        var it = (typeof getShop === 'function' ? getShop() : (window._shop57 || [])).find(function (x) { return x.fbKey === this.value; }, this);
        if (!it) return;
        document.getElementById('aukt-emoji').value = it.emoji || '';
        document.getElementById('aukt-name').value = it.name || '';
        document.getElementById('aukt-desc').value = 'Butikkpris: ' + (it.price || 0) + ' mynter';
      });
    }
    if (!document.getElementById('aukt-big')) {
      var big = document.createElement('div');
      big.id = 'aukt-big';
      document.body.appendChild(big);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && bigId) window.auktBigClose(); });
    }
  }

  function fillShopSelect() {
    var sel = document.getElementById('aukt-from');
    if (!sel) return;
    var items = (typeof getShop === 'function') ? getShop() : (window._shop57 || []);
    var cur = sel.value;
    sel.innerHTML = '<option value="">– Skriv inn selv –</option>' + items.map(function (x) {
      return '<option value="' + esc(x.fbKey) + '">' + esc((x.emoji || '') + ' ' + x.name + ' (🪙 ' + x.price + ')') + '</option>';
    }).join('');
    sel.value = cur;
  }

  function alertMsg(html, cls) {
    var el = document.getElementById('aukt-alert');
    if (!el) return;
    el.innerHTML = '<div class="alert ' + (cls || 'alert-success') + '">' + html + '</div>';
    setTimeout(function () { if (el) el.innerHTML = ''; }, 4000);
  }

  // ── Opprett ─────────────────────────────────────────────────────────────
  window.auktCreate = async function () {
    if (!window._db || !window._runTransaction) return alertMsg('⚠️ Ikke koblet til ennå – vent litt.', 'alert-error');
    var name = document.getElementById('aukt-name').value.trim();
    var emoji = document.getElementById('aukt-emoji').value.trim() || '🎁';
    var desc = document.getElementById('aukt-desc').value.trim();
    var start = Math.max(1, parseInt(document.getElementById('aukt-start').value, 10) || 1);
    var inc = Math.max(1, parseInt(document.getElementById('aukt-inc').value, 10) || 1);
    var dur = document.getElementById('aukt-dur').value;
    if (!name) return alertMsg('⚠️ Skriv inn hva som auksjoneres.', 'alert-error');
    var endsAt;
    if (dur === 'clock') {
      var hm = document.getElementById('aukt-clock').value;
      if (!hm) return alertMsg('⚠️ Velg klokkeslett.', 'alert-error');
      var p = hm.split(':'), d = new Date();
      d.setHours(+p[0], +p[1], 0, 0);
      endsAt = d.getTime() + srvOffset;
      if (endsAt <= now() + 30000) return alertMsg('⚠️ Klokkeslettet må være minst ett minutt fram i tid.', 'alert-error');
    } else {
      endsAt = now() + (parseInt(dur, 10) || 3) * 60000;
    }
    var t = window._currentTeacher || {};
    var data = {
      emoji: emoji, name: name, desc: desc, startPrice: start, minIncrement: inc,
      endsAt: endsAt, startedAt: now(), status: 'active', bidCount: 0, extensions: 0,
      workspaceId: (typeof currentWorkspaceId === 'function' ? currentWorkspaceId() : null) || 'main',
      createdBy: t.uid || '', createdByName: t.name || ''
    };
    try {
      await window._set(window._push(R('auctions57')), data);
      ['aukt-name', 'aukt-desc', 'aukt-emoji'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('aukt-from').value = '';
      alertMsg('✅ Auksjonen «' + esc(name) + '» er i gang! Elevene finner den i Butikken.');
    } catch (e) {
      console.error(e);
      alertMsg('⚠️ Klarte ikke å starte auksjonen: ' + esc(e.message || e), 'alert-error');
    }
  };

  // ── Handlinger ──────────────────────────────────────────────────────────
  window.auktEndNow = async function (id) {
    var a = byId(id); if (!a || a.status !== 'active') return;
    if (!confirm('Avslutte «' + a.name + '» nå? Høyeste bud vinner.')) return;
    await window._runTransaction(R('auctions57/' + id), function (cur) {
      if (!cur) return cur;
      if (cur.status !== 'active') return;
      cur.endsAt = Math.min(cur.endsAt, now());
      return cur;
    });
  };
  window.auktCancel = async function (id) {
    var a = byId(id); if (!a || a.status !== 'active') return;
    if (!confirm('Avbryte «' + a.name + '»? Ingen blir trukket for mynter.')) return;
    await window._runTransaction(R('auctions57/' + id), function (cur) {
      if (!cur) return cur;
      if (cur.status !== 'active') return;
      cur.status = 'cancelled'; cur.settledAt = now();
      return cur;
    });
  };
  window.auktRemove = async function (id) {
    var a = byId(id); if (!a || a.status === 'active' || a.status === 'settling') return;
    if (!confirm('Fjerne «' + a.name + '» fra lista? (Myntene som er trukket, blir ikke gitt tilbake.)')) return;
    await window._remove(R('auctions57/' + id));
    await window._remove(R('auctionBids57/' + id));
  };
  window.auktRetry = async function (id) {
    var a = byId(id); if (!a || a.status !== 'settling') return;
    if (!confirm('Oppgjøret ser ut til å ha stoppet. Sjekk først transaksjonene til ' + (a.highBid ? a.highBid.name : 'vinneren') +
      ' – er myntene allerede trukket, trykk Avbryt. Vil du prøve oppgjøret på nytt?')) return;
    await window._update(R('auctions57/' + id), { status: 'active', settleClaim: null, settleClaimAt: null });
  };

  // ── Liste ───────────────────────────────────────────────────────────────
  function statusPill(a) {
    if (a.status === 'sold') return '<span class="aukt-pill">✅ Solgt</span>';
    if (a.status === 'unsold') return '<span class="aukt-pill grey">Ikke solgt</span>';
    if (a.status === 'cancelled') return '<span class="aukt-pill grey">Avbrutt</span>';
    if (a.status === 'settling') return '<span class="aukt-pill">⏳ Oppgjør …</span>';
    return '';
  }

  function renderList() {
    var el = document.getElementById('aukt-list');
    if (!el) return;
    var list = mine().slice().sort(function (x, y) {
      var la = x.status === 'active' ? 0 : 1, lb = y.status === 'active' ? 0 : 1;
      if (la !== lb) return la - lb;
      return la === 0 ? x.endsAt - y.endsAt : y.endsAt - x.endsAt;
    }).slice(0, 12);
    if (!list.length) { el.innerHTML = '<p style="color:var(--muted);font-size:.9rem;">Ingen auksjoner ennå.</p>'; return; }
    el.innerHTML = list.map(function (a) {
      var id = a.fbKey, active = a.status === 'active';
      var high = a.highBid
        ? 'Høyeste bud: <strong>🪙 ' + a.highBid.amount + '</strong> · ' + esc(a.highBid.name)
        : 'Ingen bud ennå · startbud 🪙 ' + (a.startPrice || 1);
      var result = '';
      if (a.status === 'sold' && a.winner) result = '🏆 <strong>' + esc(a.winner.name) + '</strong> vant for 🪙 ' + a.winner.amount + ' – myntene er trukket.';
      if (a.status === 'unsold') result = esc(a.settleNote || 'Ingen bud');
      var btns = '';
      if (active) {
        btns = '<button class="btn btn-amber btn-sm" onclick="auktBigOpen(\'' + id + '\')">📺 Storskjerm</button>' +
               '<button class="btn btn-ghost btn-sm" onclick="auktEndNow(\'' + id + '\')">⏹ Avslutt nå</button>' +
               '<button class="btn btn-coral btn-sm" onclick="auktCancel(\'' + id + '\')">✖ Avbryt</button>';
      } else if (a.status === 'settling') {
        if (now() - (a.settleClaimAt || 0) > 20000)
          btns = '<button class="btn btn-ghost btn-sm" onclick="auktRetry(\'' + id + '\')">🔁 Prøv oppgjøret igjen</button>';
      } else {
        btns = '<button class="btn btn-ghost btn-sm" onclick="auktBigOpen(\'' + id + '\')">📺 Vis resultat</button>' +
               '<button class="btn btn-ghost btn-sm" onclick="auktRemove(\'' + id + '\')">🗑️ Fjern</button>';
      }
      var rec = recentList(a);
      return '<div class="aukt-item' + (active ? ' live' : '') + '">' +
        '<div class="aukt-top"><span class="aukt-emoji">' + esc(a.emoji || '🎁') + '</span>' +
          '<div><div class="aukt-name">' + esc(a.name) + '</div>' +
          '<div class="aukt-sub">' + (active ? 'Slutter kl. ' + clock(a.endsAt) : 'Sluttet kl. ' + clock(a.endsAt)) +
            ' · ' + (a.bidCount || 0) + ' bud' + (a.extensions ? ' · forlenget ' + a.extensions + '×' : '') + '</div></div>' +
          (active ? '<div class="aukt-cd" data-aukt-cd="' + id + '"></div>' : statusPill(a)) + '</div>' +
        '<div class="aukt-high">' + high + (active ? '<span class="aukt-flash" data-aukt-flash="' + id + '">⏱️ +30 sek!</span>' : '') + '</div>' +
        (result ? '<div class="aukt-high" style="color:var(--teal-dark)">' + result + '</div>' : '') +
        (active && rec.length ? '<div class="aukt-sub" style="margin-top:4px">Siste bud: ' + rec.slice(0, 4).map(function (r) { return esc(r.name) + ' 🪙' + r.amount; }).join(' · ') + '</div>' : '') +
        '<div class="aukt-btns">' + btns + '</div></div>';
    }).join('');
    tickDisplays();
  }

  // ── Storskjerm ──────────────────────────────────────────────────────────
  window.auktBigOpen = function (id) { bigId = id; renderBig(); document.getElementById('aukt-big').classList.add('open'); };
  window.auktBigClose = function () {
    bigId = null;
    document.getElementById('aukt-big').classList.remove('open');
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
  };
  window.auktBigFull = function () {
    var el = document.getElementById('aukt-big');
    try { if (!document.fullscreenElement) el.requestFullscreen(); else document.exitFullscreen(); } catch (e) {}
  };

  function renderBig() {
    var el = document.getElementById('aukt-big');
    if (!el || !bigId) return;
    var a = byId(bigId);
    if (!a) { window.auktBigClose(); return; }
    var active = a.status === 'active';
    var mid;
    if (active) {
      mid = '<div class="b-cd" data-aukt-bigcd="1"></div>' +
        '<div class="b-high">' + (a.highBid
          ? 'Høyeste bud: <b>🪙 ' + a.highBid.amount + '</b><br>' + esc(a.highBid.name)
          : 'Startbud: <b>🪙 ' + (a.startPrice || 1) + '</b><br>Ingen bud ennå') + '</div>' +
        '<div class="b-flash" data-aukt-bigflash="1">⏱️ +30 sekunder!</div>';
    } else if (a.status === 'sold' && a.winner) {
      mid = '<div class="b-cd" style="font-size:4.5rem">🎉 SOLGT!</div>' +
        '<div class="b-high">til <b>' + esc(a.winner.name) + '</b><br>for <b>🪙 ' + a.winner.amount + '</b></div>';
    } else if (a.status === 'settling' || (a.status === 'active')) {
      mid = '<div class="b-cd" style="font-size:4rem">⏳ Tiden er ute …</div>';
    } else {
      mid = '<div class="b-cd" style="font-size:4rem">' + (a.status === 'cancelled' ? 'Avbrutt' : 'Ingen vinner') + '</div>' +
        (a.settleNote ? '<div class="b-high" style="font-size:1.4rem">' + esc(a.settleNote) + '</div>' : '');
    }
    var rec = recentList(a);
    el.innerHTML =
      '<button class="b-full" onclick="auktBigFull()">⛶ Fullskjerm</button>' +
      '<button class="b-close" onclick="auktBigClose()">✕</button>' +
      '<div class="b-label">🔨 AUKSJON</div>' +
      '<div class="b-emoji">' + esc(a.emoji || '🎁') + '</div>' +
      '<div class="b-name">' + esc(a.name) + '</div>' +
      (a.desc ? '<div class="b-desc">' + esc(a.desc) + '</div>' : '') +
      mid +
      (active && rec.length > 1 ? '<div class="b-recent">' + rec.slice(1, 4).map(function (r) { return esc(r.name) + ' · 🪙 ' + r.amount; }).join('<br>') + '</div>' : '') +
      (active ? '<div class="b-rules">By i Butikken i elevappen · Minste økning 🪙 ' + (a.minIncrement || 1) + ' · Bud de siste 30 sek gir 30 sek ekstra</div>' : '');
    tickDisplays();
  }

  // ── Klokke + oppgjør ────────────────────────────────────────────────────
  function tickDisplays() {
    var t = now();
    var els = document.querySelectorAll('[data-aukt-cd]');
    for (var i = 0; i < els.length; i++) {
      var a = byId(els[i].getAttribute('data-aukt-cd'));
      if (!a) continue;
      var left = a.endsAt - t;
      els[i].textContent = left > 0 ? fmt(left) : 'Slutt!';
      els[i].classList.toggle('urgent', left > 0 && left <= 30000);
    }
    var fl = document.querySelectorAll('[data-aukt-flash]');
    for (var j = 0; j < fl.length; j++) {
      fl[j].style.display = (flashUntil[fl[j].getAttribute('data-aukt-flash')] || 0) > Date.now() ? 'inline-block' : 'none';
    }
    if (bigId) {
      var b = byId(bigId);
      var cd = document.querySelector('[data-aukt-bigcd]');
      if (b && cd) {
        var l = b.endsAt - t;
        cd.textContent = l > 0 ? fmt(l) : 'Slutt!';
        cd.classList.toggle('urgent', l > 0 && l <= 30000);
      }
      var bf = document.querySelector('[data-aukt-bigflash]');
      if (bf) bf.style.display = (flashUntil[bigId] || 0) > Date.now() ? 'inline-block' : 'none';
    }
  }

  function tick() {
    tickDisplays();
    var t = now();
    auctions.forEach(function (a) { if (a.status === 'active' && t >= a.endsAt + 1500) settle(a.fbKey); });
    var sig = auctions.map(function (a) {
      return a.fbKey + (isLive(a) ? 'L' : a.status) + (a.status === 'settling' && t - (a.settleClaimAt || 0) > 20000 ? 'S' : '');
    }).join(',');
    if (sig !== lastSig) { lastSig = sig; renderList(); if (bigId) renderBig(); }
  }

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

  // ── Oppstart ────────────────────────────────────────────────────────────
  function init() {
    if (started) return;
    if (!window._fbReady || !window._db || !window._runTransaction || !window._currentTeacher || !window._CLASS_ID) {
      setTimeout(init, 500); return;
    }
    started = true;
    injectUI();
    window._onValue(R('.info/serverTimeOffset'), function (snap) { srvOffset = snap.val() || 0; });
    window._onValue(R('auctions57'), function (snap) {
      var v = snap.val() || {};
      auctions = Object.keys(v).map(function (k) { var a = v[k] || {}; a.fbKey = k; return a; });
      auctions.forEach(function (a) {
        if (seenEnds[a.fbKey] && a.endsAt > seenEnds[a.fbKey] && a.status === 'active') flashUntil[a.fbKey] = Date.now() + 3000;
        seenEnds[a.fbKey] = a.endsAt;
      });
      renderList();
      if (bigId) renderBig();
    });
    window._onValue(R('shop57'), fillShopSelect);
    setInterval(tick, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
