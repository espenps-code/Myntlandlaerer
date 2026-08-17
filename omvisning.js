/* ═══════════════════════════════════════════════════════════════════════════
   omvisning.js — førstegangsomvisning for Myntlands lærerportaler
   ---------------------------------------------------------------------------
   Frittstående fil. Lastes av laererportal57-ny.html og laererportal14-ny.html
   etter portalens egen JS:
       <script defer src="omvisning.js"></script>

   Filen finner selv ut hvilken portal den kjører i (5.–7. har «Jobber» i
   menyen, 1.–4. har ikke det) og bruker riktig steg-liste.

   Ingenting lagres i skyen. Valget «ikke vis igjen» ligger i localStorage
   i lærerens egen nettleser — altså ingen personopplysninger.

   Ingen endringer i HTML-en utover script-taggen: knappen «Omvisning»
   settes inn i headeren herfra.
   ═════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Hvilken portal? ────────────────────────────────────────────────────────
  var IS57 = !!document.getElementById('nav-oppdrag');
  var KEY = 'myntland_omvisning_' + (IS57 ? '57' : '14') + '_v1';
  var GUIDE_SEED = 11;

  function guideName() {
    try {
      if (typeof window.getAnimalName === 'function') return window.getAnimalName(GUIDE_SEED);
    } catch (e) {}
    return 'Mynt';
  }

  // ── Småhjelpere ────────────────────────────────────────────────────────────
  function q(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }

  function synlig(el) {
    if (!el) return false;
    if (!el.offsetParent && el.tagName !== 'BODY') {
      var cs = window.getComputedStyle(el);
      if (cs.position !== 'fixed') return false;
    }
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function klikk(sel) { var el = q(sel); if (el) { try { el.click(); } catch (e) {} } }

  function side(navn) {
    try { if (typeof window.showPage === 'function') window.showPage(navn); } catch (e) {}
  }

  // På mobil og nettbrett ligger menyknappene skjult bak ☰. Da folder vi
  // menyen ut selv, slik at markeringen faktisk har noe å peke på.
  function smalSkjerm() { return synlig(document.getElementById('hamburger-btn')); }

  function mobilmeny(paa) {
    var nav = q('.portal-nav-strip nav');
    var btn = document.getElementById('hamburger-btn');
    if (!nav) return;
    if (paa) { nav.classList.add('open'); if (btn) btn.classList.add('open'); }
    else { nav.classList.remove('open'); if (btn) btn.classList.remove('open'); }
  }

  // ── Stilark ────────────────────────────────────────────────────────────────
  var CSS = ''
    + '.mo-hull{position:fixed;z-index:100001;border-radius:16px;pointer-events:none;'
    + '  box-shadow:0 0 0 4px #EF9F27,0 0 0 9999px rgba(14,20,32,.66);'
    + '  transition:top .3s cubic-bezier(.4,0,.2,1),left .3s cubic-bezier(.4,0,.2,1),'
    + '  width .3s cubic-bezier(.4,0,.2,1),height .3s cubic-bezier(.4,0,.2,1);}'
    + '.mo-hull.mo-tom{box-shadow:0 0 0 0 rgba(0,0,0,0),0 0 0 9999px rgba(14,20,32,.66);}'
    + '.mo-sperre{position:fixed;inset:0;z-index:100000;cursor:default;}'
    + '.mo-boks{position:fixed;z-index:100002;width:min(400px,calc(100vw - 24px));'
    + '  background:#fff;border-radius:20px;padding:1.1rem 1.15rem 1rem;'
    + '  box-shadow:0 18px 50px rgba(10,15,30,.4);font-family:"Nunito",sans-serif;'
    + '  color:#1a2e1a;transition:top .3s cubic-bezier(.4,0,.2,1),left .3s cubic-bezier(.4,0,.2,1);}'
    + '.mo-pil{position:absolute;width:16px;height:16px;background:#fff;transform:rotate(45deg);}'
    + '.mo-topp{display:flex;align-items:flex-start;gap:12px;margin-bottom:.6rem;}'
    + '.mo-monster{width:60px;height:60px;flex-shrink:0;border-radius:50%;overflow:hidden;'
    + '  background:#EEF6FF;display:flex;align-items:center;justify-content:center;font-size:2rem;'
    + '  box-shadow:0 3px 10px rgba(10,15,30,.16);}'
    + '.mo-monster>div,.mo-monster>img{width:100%;height:100%;}'
    + '.mo-tittel{font-family:"Fredoka One","Nunito",cursive;font-size:1.12rem;line-height:1.25;'
    + '  color:#1e0f52;margin:2px 0 3px;}'
    + '.mo-teller{font-size:.7rem;font-weight:800;color:#5a7a5a;letter-spacing:.04em;}'
    + '.mo-tekst{font-size:.92rem;line-height:1.5;font-weight:600;color:#26382b;}'
    + '.mo-tekst b,.mo-tekst strong{color:#1e0f52;}'
    + '.mo-tekst code{background:#F1F5F2;border-radius:5px;padding:1px 5px;font-size:.85em;}'
    + '.mo-bunn{display:flex;align-items:center;gap:.5rem;margin-top:.9rem;flex-wrap:wrap;}'
    + '.mo-knapp{font-family:"Nunito",sans-serif;font-weight:800;font-size:.86rem;border-radius:11px;'
    + '  padding:.5rem .95rem;cursor:pointer;border:2px solid transparent;transition:filter .15s,background .15s;}'
    + '.mo-knapp:focus-visible{outline:3px solid #EF9F27;outline-offset:2px;}'
    + '.mo-neste{background:#1e0f52;color:#fff;}'
    + '.mo-neste:hover{filter:brightness(1.22);}'
    + '.mo-tilbake{background:#fff;color:#1e0f52;border-color:#c8dfc8;}'
    + '.mo-tilbake:hover{background:#F1F5F2;}'
    + '.mo-hopp{background:none;border:none;color:#5a7a5a;font-weight:800;font-size:.82rem;'
    + '  cursor:pointer;text-decoration:underline;padding:.5rem .2rem;margin-left:auto;'
    + '  font-family:"Nunito",sans-serif;}'
    + '.mo-hopp:hover{color:#1e0f52;}'
    + '.mo-avkryss{display:flex;align-items:center;gap:7px;margin-top:.7rem;padding-top:.7rem;'
    + '  border-top:2px solid #EEF2EE;font-size:.78rem;font-weight:700;color:#5a7a5a;cursor:pointer;}'
    + '.mo-avkryss input{width:17px;height:17px;accent-color:#1e0f52;cursor:pointer;flex-shrink:0;}'
    + '.mo-prikker{display:flex;gap:4px;margin-top:.75rem;}'
    + '.mo-prikk{height:4px;flex:1;border-radius:2px;background:#E3EAE4;}'
    + '.mo-prikk.mo-gjort{background:#EF9F27;}'
    + '@media (max-width:560px){.mo-boks{padding:.95rem;}.mo-monster{width:48px;height:48px;}'
    + '  .mo-tittel{font-size:1rem;}.mo-tekst{font-size:.88rem;}}'
    + '@media (prefers-reduced-motion:reduce){.mo-hull,.mo-boks{transition:none;}}';

  // ── Steg ───────────────────────────────────────────────────────────────────
  var STEG_57 = [
    { t: 'Hei! Jeg heter ' + '{{navn}}' + ' 👋',
      d: 'Velkommen til lærerportalen for 5.–7. trinn. Jeg tar deg en rask runde innom det viktigste — det tar under ett minutt.<br><br>Du kan hoppe over når som helst, og hente runden fram igjen med <b>❓ Omvisning</b> øverst til høyre.' },

    { sel: '.portal-nav-strip nav', pad: 6,
      t: 'Hovedmenyen',
      d: 'Alt i portalen ligger bak disse knappene. Vi går gjennom dem én etter én. På mobil og nettbrett gjemmer de seg bak ☰-knappen.' },

    { sel: '#nav-elever', go: function () { side('elever'); },
      t: 'Elever — start her',
      d: 'Her oppretter du klassen, gir elevene kallenavn og monsteravatar, og skriver ut bankkortene. Ekte navn lagres aldri i skyen — bare kallenavnene.' },

    { sel: '#page-elever .stat-row', pad: 6,
      t: 'Tre tall å holde øye med',
      d: 'Antall elever, hvor mange mynter som er i omløp i klassen, og hvor mye elevene til sammen skylder i lån. Ser du at myntene bare vokser og vokser, er det ofte et tegn på at butikken trenger flere ting å bruke dem på.' },

    { sel: '#page-elever .tabs .tab:nth-child(1)',
      go: function () { klikk('#page-elever .tabs .tab:nth-child(1)'); },
      t: 'Opprett hel klasse',
      d: 'Den raskeste veien i gang: skriv inn antall elever og startsaldo, så lages kallenavn og avatarer automatisk. Du kan bytte dem før du godkjenner.<br><br>Fyll ut klasselista med de <b>ekte</b> navnene, skriv den ut og oppbevar den lokalt — den lastes ikke opp.' },

    { sel: '#page-elever .tabs .tab:nth-child(3)',
      go: function () { klikk('#page-elever .tabs .tab:nth-child(3)'); },
      t: 'Skriv ut bankkort',
      d: 'Åtte kort per A4. Laminer dem, så holder de hele skoleåret. Eleven logger inn ved å skanne QR-koden og taste PIN.<br><br>Krysset <b>«Vis PIN-koden på kortet»</b> er praktisk i starten — men husk at hvem som helst som finner kortet da kan logge inn som den eleven. Skru det av når klassen kan kodene sine.' },

    { sel: '#nav-saldo', go: function () { side('saldo'); },
      t: 'Saldo',
      d: 'Full oversikt over hver elevs bruks- og sparekonto. Herfra kan du gi eller trekke mynter manuelt når noe skjer utenom det vanlige.<br><br>Sparekontoen gir <b>5 % rente i uka</b>, som utbetales automatisk hver mandag.' },

    { sel: '#nav-oppdrag', go: function () { side('oppdrag'); },
      t: 'Jobber',
      d: 'To typer: <b>faste jobber</b> med lønn som utbetales automatisk hver fredag, og <b>engangsoppdrag</b> du godkjenner selv eller lar eleven skanne en QR for.<br><br>Skatten trekkes automatisk og går rett til klassens sparemål.' },

    { sel: '#nav-butikk57', go: function () { side('butikk57'); },
      t: 'Butikken',
      d: 'Her legger du inn det elevene kan bruke myntene på — utstyr, småting eller privilegier.<br><br>Et godt utgangspunkt: la privilegier koste én til tre ukers sparing. Da blir det faktisk noe å spare <i>til</i>.' },

    { sel: '#nav-belonninger', go: function () { side('belonninger'); },
      t: 'Belønninger',
      d: 'Denne siden rommer fem ting: sparemål, belønnings-QR, hendelser, merker og myntspill. Vi tar en kikk på fanene.' },

    { sel: '#page-belonninger .tabs', pad: 6,
      t: 'De fem fanene',
      d: '<b>🏦 Sparemål</b> — klassens felles mål (maks tre av gangen). Skatten havner her.<br><b>⬛ Belønnings-QR</b> — kort på 10, 50 og 100 mynter du kan dele ut.<br><b>🎲 Hendelser</b> — trykk «Last inn 30 standard» for å komme raskt i gang. Hver onsdag får elevene én tilfeldig hendelse.<br><b>🏅 Merker</b> — bronse, sølv og gull.<br><b>🪙 Myntspill</b> — av/på for Myntjakten og Myntstigen.' },

    { sel: '#nav-budsjett', go: function () { side('budsjett'); },
      t: 'Budsjett',
      d: 'Motoren i klassens økonomi: ukelønn til alle, skatteprosent (standard 20 %) og de faste fredagsutgiftene — pult, strøm og iPad.<br><br>Er du usikker på tallene, prøv <b>økonomikalkulatoren</b> på myntland.no. Den regner ut hva klassen tåler.' },

    { sel: '#nav-arbeidsplan', go: function () { side('arbeidsplan'); },
      t: 'Periodeplan',
      d: 'Et pedagogisk verktøy ved siden av økonomien: en læringstrapp i et fag, som eleven jobber seg oppover. Minst tre trinn før du kan publisere.<br><br>Du kan også be en foresatt bekrefte hvert trinn — da lager du et foresattbrev med kode i samme slengen.' },

    { sel: '#nav-klasseportal',
      t: 'Klasseportalen',
      d: 'Klassens storskjerm — «Dagen i dag», timeplan, sparemål, ukas hjelpere, tavle og klassetimer. Den åpnes i en ny fane, så vi lar den ligge nå.' },

    { sel: '.ml-fb-fab', pad: 10,
      t: 'Noe som skurrer?',
      d: 'Trykk her for å melde inn en feil eller et forslag. Meldingen kommer rett fram med riktig klasse og side, og du ser svaret under «Mine meldinger».' },

    { t: 'Det var runden! 🎉',
      d: 'Neste steg er å opprette klassen, lage et sparemål og skrive ut bankkortene — så er dere i gang.<br><br>Full veiledning: <a href="laererveiledning.html" target="_blank" rel="noopener" style="color:#185FA5;font-weight:800;">myntland.no/laererveiledning</a>' }
  ];

  var STEG_14 = [
    { t: 'Hei! Jeg heter ' + '{{navn}}' + ' 👋',
      d: 'Velkommen til lærerportalen for 1.–4. trinn. Jeg viser deg det viktigste på under ett minutt.<br><br>Du kan hoppe over når som helst, og hente runden fram igjen med <b>❓ Omvisning</b> øverst til høyre.' },

    { sel: '.portal-nav-strip nav', pad: 6,
      t: 'Hovedmenyen',
      d: 'Alt i portalen ligger bak disse knappene. Vi går gjennom dem én etter én. På mobil og nettbrett gjemmer de seg bak ☰-knappen.' },

    { sel: '#nav-elever', go: function () { side('elever'); },
      t: 'Elever — start her',
      d: 'Her oppretter du klassen, gir elevene kallenavn og monsteravatar, og skriver ut bankkortene. Ekte navn lagres aldri i skyen — bare kallenavnene.' },

    { sel: '#page-elever .stat-row', pad: 6,
      t: 'To tall å holde øye med',
      d: 'Antall elever, og hvor mange mynter som er i omløp i klassen. Vokser myntene bare og bare, er det som regel et tegn på at butikken trenger flere ting å bruke dem på.' },

    { sel: '#page-elever .tabs .tab:nth-child(1)',
      go: function () { klikk('#page-elever .tabs .tab:nth-child(1)'); },
      t: 'Opprett hel klasse',
      d: 'Den raskeste veien i gang: skriv inn antall elever og startsaldo, så lages kallenavn og avatarer automatisk. Du kan bytte dem før du godkjenner.<br><br>Fyll ut klasselista med de <b>ekte</b> navnene, skriv den ut og oppbevar den lokalt — den lastes ikke opp.' },

    { sel: '#page-elever .tabs .tab:nth-child(3)',
      go: function () { klikk('#page-elever .tabs .tab:nth-child(3)'); },
      t: 'Skriv ut bankkort',
      d: 'Åtte kort per A4. Laminer dem, så holder de hele skoleåret. Eleven skanner QR-koden og taster PIN.<br><br>For de yngste er <b>«Vis PIN-koden på kortet»</b> til god hjelp i starten. Husk bare at kortet da fungerer for hvem som helst som finner det.' },

    { sel: '#nav-saldo', go: function () { side('saldo'); },
      t: 'Saldo',
      d: 'Oversikt over hver elevs konto. Herfra gir eller trekker du mynter manuelt.<br><br>Sparekontoen gir <b>5 % rente i uka</b>, som utbetales automatisk hver mandag.' },

    { sel: '#nav-butikk', go: function () { side('butikk'); },
      t: 'Butikken',
      d: 'Hjertet i småtrinnsopplegget: en dagligvarebutikk-lek. Du legger inn varer med emoji og pris, skriver ut varelapper med QR, og lager handlelister der elevene regner ut totalen før de går i kassa.' },

    { sel: '#page-butikk .tabs', pad: 6,
      t: 'Butikkens fem faner',
      d: '<b>📖 Slik fungerer det</b> — les denne først.<br><b>⚙️ Innstillinger</b> — her velger du <b>lekemodus</b> (ingen mynter trekkes, ren øving) eller <b>aktiv modus</b>.<br><b>🛍️ Varer</b>, <b>🏷️ Varelapper</b> og <b>📋 Handlelister</b> — alt du trenger å skrive ut. Laminer varelappene.' },

    { sel: '#nav-belonninger', go: function () { side('belonninger'); },
      t: 'Belønninger',
      d: 'Sparemål, belønnings-QR, hendelser, merker og myntspill — fem faner. La oss se på dem.' },

    { sel: '#page-belonninger .tabs', pad: 6,
      t: 'De fem fanene',
      d: '<b>🏦 Sparemål</b> — klassens felles mål (maks tre av gangen).<br><b>⬛ Belønnings-QR</b> — kort på 10, 50 og 100 mynter du kan dele ut.<br><b>🎲 Hendelser</b> — trykk «Last inn 30 standard» for å komme raskt i gang.<br><b>🏅 Merker</b> — bronse, sølv og gull.<br><b>🪙 Myntspill</b> — av/på for Myntjakten og Myntstigen.' },

    { sel: '#nav-klasseportal',
      t: 'Klasseportalen',
      d: 'Klassens storskjerm — «Dagen i dag», timeplan, sparemål, ukas hjelpere, tavle og klassetimer. Den åpnes i en ny fane, så vi lar den ligge nå.' },

    { sel: '.ml-fb-fab', pad: 10,
      t: 'Noe som skurrer?',
      d: 'Trykk her for å melde inn en feil eller et forslag. Meldingen kommer rett fram med riktig klasse og side, og du ser svaret under «Mine meldinger».' },

    { t: 'Det var runden! 🎉',
      d: 'Neste steg er å opprette klassen, lage et sparemål og skrive ut bankkortene — så er dere i gang.<br><br>Full veiledning: <a href="laererveiledning.html" target="_blank" rel="noopener" style="color:#185FA5;font-weight:800;">myntland.no/laererveiledning</a>' }
  ];

  var STEG = IS57 ? STEG_57 : STEG_14;

  // ── Tilstand ───────────────────────────────────────────────────────────────
  var i = 0, aktiv = false;
  var sperre, hull, boks, pil, monsterSlot, tittelEl, tellerEl, tekstEl,
      tilbakeBtn, nesteBtn, hoppBtn, avkryssEl, prikkerEl, sistFokus;

  function lagre(verdi) { try { localStorage.setItem(KEY, verdi); } catch (e) {} }
  function lest() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  // ── Bygg grensesnittet (én gang) ───────────────────────────────────────────
  function bygg() {
    if (boks) return;

    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    sperre = document.createElement('div');
    sperre.className = 'mo-sperre';
    sperre.setAttribute('aria-hidden', 'true');

    hull = document.createElement('div');
    hull.className = 'mo-hull';

    boks = document.createElement('div');
    boks.className = 'mo-boks';
    boks.setAttribute('role', 'dialog');
    boks.setAttribute('aria-modal', 'true');
    boks.setAttribute('aria-label', 'Omvisning i lærerportalen');
    boks.innerHTML = ''
      + '<div class="mo-pil"></div>'
      + '<div class="mo-topp">'
      + '  <div class="mo-monster" aria-hidden="true">👾</div>'
      + '  <div style="min-width:0;">'
      + '    <div class="mo-teller"></div>'
      + '    <div class="mo-tittel"></div>'
      + '  </div>'
      + '</div>'
      + '<div class="mo-tekst"></div>'
      + '<div class="mo-prikker"></div>'
      + '<div class="mo-bunn">'
      + '  <button type="button" class="mo-knapp mo-tilbake">‹ Tilbake</button>'
      + '  <button type="button" class="mo-knapp mo-neste">Neste ›</button>'
      + '  <button type="button" class="mo-hopp">Hopp over</button>'
      + '</div>'
      + '<label class="mo-avkryss"><input type="checkbox" checked>'
      + '  <span>Ikke vis denne automatisk igjen</span></label>';

    pil        = boks.querySelector('.mo-pil');
    monsterSlot = boks.querySelector('.mo-monster');
    tittelEl   = boks.querySelector('.mo-tittel');
    tellerEl   = boks.querySelector('.mo-teller');
    tekstEl    = boks.querySelector('.mo-tekst');
    prikkerEl  = boks.querySelector('.mo-prikker');
    tilbakeBtn = boks.querySelector('.mo-tilbake');
    nesteBtn   = boks.querySelector('.mo-neste');
    hoppBtn    = boks.querySelector('.mo-hopp');
    avkryssEl  = boks.querySelector('.mo-avkryss input');

    tilbakeBtn.addEventListener('click', function () { gaaTil(i - 1); });
    nesteBtn.addEventListener('click', function () {
      if (i >= STEG.length - 1) avslutt(true); else gaaTil(i + 1);
    });
    hoppBtn.addEventListener('click', function () { avslutt(false); });

    // Monsteret — samme motor som elevavatarene bruker.
    try {
      if (typeof window.makeAnimalSVG === 'function') {
        var m = window.makeAnimalSVG(GUIDE_SEED, 60);
        if (m) { monsterSlot.textContent = ''; monsterSlot.appendChild(m); }
      }
    } catch (e) {}

    for (var n = 0; n < STEG.length; n++) {
      var p = document.createElement('div');
      p.className = 'mo-prikk';
      prikkerEl.appendChild(p);
    }

    document.body.appendChild(sperre);
    document.body.appendChild(hull);
    document.body.appendChild(boks);
  }

  // ── Plassering ─────────────────────────────────────────────────────────────
  function plasser() {
    var steg = STEG[i];
    var el = steg.sel ? q(steg.sel) : null;
    if (el && !synlig(el)) el = null;

    var vw = window.innerWidth, vh = window.innerHeight;
    var bh = boks.offsetHeight, bw = boks.offsetWidth;

    if (!el) {
      // Ingen (synlig) målboks — vis kortet midt på skjermen.
      hull.classList.add('mo-tom');
      hull.style.top = (vh / 2) + 'px';
      hull.style.left = (vw / 2) + 'px';
      hull.style.width = '0px';
      hull.style.height = '0px';
      boks.style.top = Math.max(12, (vh - bh) / 2) + 'px';
      boks.style.left = Math.max(12, (vw - bw) / 2) + 'px';
      pil.style.display = 'none';
      return;
    }

    hull.classList.remove('mo-tom');
    var r = el.getBoundingClientRect();
    var pad = (steg.pad == null) ? 8 : steg.pad;
    var ht = r.top - pad, hl = r.left - pad;
    var hw = r.width + pad * 2, hh = r.height + pad * 2;

    hull.style.top = ht + 'px';
    hull.style.left = hl + 'px';
    hull.style.width = hw + 'px';
    hull.style.height = hh + 'px';

    // Under målet hvis det er plass, ellers over, ellers midt på.
    var top, under = true;
    if (ht + hh + 18 + bh <= vh - 12) {
      top = ht + hh + 18;
    } else if (ht - 18 - bh >= 12) {
      top = ht - 18 - bh; under = false;
    } else {
      top = Math.max(12, (vh - bh) / 2); under = null;
    }

    var left = r.left + r.width / 2 - bw / 2;
    left = Math.max(12, Math.min(left, vw - bw - 12));

    boks.style.top = top + 'px';
    boks.style.left = left + 'px';

    if (under === null) {
      pil.style.display = 'none';
    } else {
      pil.style.display = 'block';
      var px = r.left + r.width / 2 - left - 8;
      px = Math.max(20, Math.min(px, bw - 36));
      pil.style.left = px + 'px';
      pil.style.top = under ? '-8px' : (bh - 8) + 'px';
    }
  }

  // ── Vis et steg ────────────────────────────────────────────────────────────
  function gaaTil(n) {
    if (n < 0) n = 0;
    if (n > STEG.length - 1) n = STEG.length - 1;
    i = n;
    var steg = STEG[i];

    // Menyen foldes ut på små skjermer når steget peker på en menyknapp.
    var pekerPaaMeny = !!steg.sel && (steg.sel.indexOf('#nav-') === 0 || steg.sel === '.portal-nav-strip nav');
    mobilmeny(pekerPaaMeny && smalSkjerm());

    if (typeof steg.go === 'function') { try { steg.go(); } catch (e) {} }

    tittelEl.innerHTML = (steg.t || '').replace('{{navn}}', guideName());
    tekstEl.innerHTML = steg.d || '';
    tellerEl.textContent = 'STEG ' + (i + 1) + ' AV ' + STEG.length;

    var prikker = prikkerEl.children;
    for (var k = 0; k < prikker.length; k++) {
      prikker[k].className = 'mo-prikk' + (k <= i ? ' mo-gjort' : '');
    }

    tilbakeBtn.style.display = i === 0 ? 'none' : '';
    nesteBtn.textContent = (i === STEG.length - 1) ? 'Ferdig 🎉' : 'Neste ›';
    hoppBtn.style.display = (i === STEG.length - 1) ? 'none' : '';

    // Rull målet inn i synsfeltet før vi måler.
    var el = steg.sel ? q(steg.sel) : null;
    if (el && synlig(el)) {
      var r = el.getBoundingClientRect();
      var utenfor = r.top < 90 || r.bottom > window.innerHeight - 120
                 || r.left < 4 || r.right > window.innerWidth - 4;
      if (utenfor) {
        try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); }
        catch (e2) { el.scrollIntoView(); }
      }
    }

    plasser();
    setTimeout(plasser, 340);   // etter rulling/faneskifte
    nesteBtn.focus();
  }

  // ── Start / avslutt ────────────────────────────────────────────────────────
  function start() {
    if (aktiv) return;
    bygg();
    aktiv = true;
    sistFokus = document.activeElement;
    sperre.style.display = 'block';
    hull.style.display = 'block';
    boks.style.display = 'block';
    document.addEventListener('keydown', tast, true);
    window.addEventListener('resize', plasser);
    window.addEventListener('scroll', plasser, true);
    gaaTil(0);
  }

  function avslutt(fullfort) {
    if (!aktiv) return;
    aktiv = false;
    mobilmeny(false);
    if (fullfort || avkryssEl.checked) lagre(fullfort ? 'fullfort' : 'skjult');
    sperre.style.display = 'none';
    hull.style.display = 'none';
    boks.style.display = 'none';
    document.removeEventListener('keydown', tast, true);
    window.removeEventListener('resize', plasser);
    window.removeEventListener('scroll', plasser, true);
    try { if (sistFokus && sistFokus.focus) sistFokus.focus(); } catch (e) {}
  }

  function tast(ev) {
    if (!aktiv) return;
    if (ev.key === 'Escape') { ev.preventDefault(); avslutt(false); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); if (i < STEG.length - 1) gaaTil(i + 1); else avslutt(true); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); gaaTil(i - 1); }
  }

  // ── «❓ Omvisning»-knapp i headeren ────────────────────────────────────────
  function leggTilKnapp() {
    if (document.querySelector('.mo-hjelp-btn')) return true;
    var hoyre = q('.portal-header-right');
    if (!hoyre) return false;
    var rad = hoyre.querySelector('div:last-child');
    if (!rad) return false;

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'logout-btn mo-hjelp-btn';
    b.title = 'Ta omvisningen i portalen på nytt';
    b.innerHTML = '<i class="ti ti-help" aria-hidden="true"></i><span>Omvisning</span>';
    b.addEventListener('click', function () { start(); });
    rad.insertBefore(b, rad.firstChild);
    return true;
  }

  // ── Vent til læreren faktisk er inne i portalen ────────────────────────────
  function paalogget() {
    var app = document.getElementById('app');
    if (!app) return false;
    var cs = window.getComputedStyle(app);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  var forsok = 0;
  function vent() {
    forsok++;
    if (paalogget()) {
      leggTilKnapp();
      if (!lest()) setTimeout(function () { if (paalogget()) start(); }, 1200);
      return;
    }
    if (forsok < 200) setTimeout(vent, 400);   // gir opp etter ca. 80 sekunder
  }

  // Åpen inngang, i tilfelle noe annet vil starte runden.
  window.myntlandOmvisning = { start: start, nullstill: function () { try { localStorage.removeItem(KEY); } catch (e) {} } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(vent, 500); });
  } else {
    setTimeout(vent, 500);
  }
})();
