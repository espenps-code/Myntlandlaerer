/* ============================================================
   GANGEKURSET – Myntland
   gangekurs.js  (bygget av: motor + trinn + prøve/diplom/lærer)
   Ingen innlogging, ingen sky – all fremdrift lagres lokalt i nettleseren.
   ============================================================ */
(function () {
'use strict';

/* ---------- tilstand ---------- */
const LAGER = 'myntland-gangekurs-v1';
const S = lastTilstand();

function lastTilstand() {
  try {
    const raw = localStorage.getItem(LAGER);
    if (raw) return Object.assign(nyTilstand(), JSON.parse(raw));
  } catch (e) { /* privat modus e.l. */ }
  return nyTilstand();
}
function nyTilstand() {
  return { navn: '', ferdig: {}, kort: {}, forsok: {}, prove: null, sert: null, runder: 0 };
}
function lagre() {
  try { localStorage.setItem(LAGER, JSON.stringify(S)); } catch (e) { /* ignorer */ }
}

/* ---------- små hjelpere ---------- */
const $ = (sel, el) => (el || document).querySelector(sel);
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const velg = arr => arr[Math.floor(Math.random() * arr.length)];
function stokk(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function unike(gen, n, nokkel) {
  const ut = [], sett = new Set(); let vakt = 0;
  while (ut.length < n && vakt++ < 500) {
    const t = gen(); const k = nokkel ? nokkel(t) : JSON.stringify(t);
    if (!sett.has(k)) { sett.add(k); ut.push(t); }
  }
  return ut;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const ROS = ['Riktig! 🎉', 'Supert! ⭐', 'Helt rett! 👏', 'Ja! 🪙', 'Stemmer! 🌟', 'Kjempebra! 💪', 'Du kan dette! 🔥'];
const EMOJI = ['🍎', '🪙', '⭐', '🍪', '🎈', '🐟', '🌸', '🧁'];

/* ---------- skjermer ---------- */
function visSkjerm(id) {
  if (typeof stoppForklaring === 'function') stoppForklaring();
  $$('.skjerm').forEach(s => s.classList.toggle('aktiv', s.id === 'skjerm-' + id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- konfetti ---------- */
function konfetti(n) {
  const boks = $('#konfetti'); boks.innerHTML = '';
  const farger = ['#EF9F27', '#1D9E75', '#534AB7', '#D85A30', '#1a5fa5', '#f4c430'];
  for (let i = 0; i < (n || 90); i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = velg(farger);
    p.style.animationDuration = (1.8 + Math.random() * 1.6) + 's';
    p.style.animationDelay = (Math.random() * .6) + 's';
    boks.appendChild(p);
  }
  setTimeout(() => { boks.innerHTML = ''; }, 3600);
}

/* ---------- strategihint per gangestykke ----------
   Brukes både i trinnene, i kortstokken og i prøven. Gir en kort
   forklaring av den smarteste veien til svaret. */
function hint(a, b) {
  // sørg for at "strategitallet" er det vi kjenner igjen
  const p = a * b;
  const par = [[a, b], [b, a]];
  for (const [x, y] of par) {
    if (x === 1) return `<b>1-gangen:</b> ${y} én gang er bare ${y}.`;
    if (x === 10) return `<b>10-gangen:</b> ${y} tiere er ${y}0. Sett en 0 bak: 10 · ${y} = ${p}.`;
    if (x === 2) return `<b>Dobling:</b> 2 · ${y} er ${y} + ${y} = ${p}.`;
    if (x === 5) return `<b>5-gangen:</b> 10 · ${y} = ${10 * y}, og halvparten av det er ${p}.`;
    if (x === 4) return `<b>Doble to ganger:</b> 2 · ${y} = ${2 * y}, og dobbelt opp igjen: ${2 * y} + ${2 * y} = ${p}.`;
    if (x === 8) return `<b>Doble 4-gangen:</b> 4 · ${y} = ${4 * y}, og dobbelt opp: ${4 * y} + ${4 * y} = ${p}.`;
    if (x === 9) return `<b>10-gangen minus én:</b> 10 · ${y} = ${10 * y}, og ${10 * y} − ${y} = ${p}.`;
    if (x === 3) return `<b>Dobbelt + én gang til:</b> 2 · ${y} = ${2 * y}, og ${2 * y} + ${y} = ${p}.`;
    if (x === 6) return `<b>Doble 3-gangen:</b> 3 · ${y} = ${3 * y}, og ${3 * y} + ${3 * y} = ${p}.`;
  }
  // 7 · 7 og 7 · andre "vanskelige"
  return `<b>Del opp:</b> ${a} · ${b} = ${a} · 5 + ${a} · ${b - 5} = ${a * 5} + ${a * (b - 5)} = ${p}.`;
}
function strategiNavn(a, b) {
  const s = new Set([a, b]);
  if (s.has(10)) return '10-gangen';
  if (s.has(1)) return '1-gangen';
  if (s.has(2)) return 'dobling';
  if (s.has(5)) return '5-gangen';
  if (s.has(4)) return 'doble to ganger';
  if (s.has(8)) return 'doble 4-gangen';
  if (s.has(9)) return '10-gangen minus én';
  if (s.has(3)) return 'dobbelt + én til';
  if (s.has(6)) return 'doble 3-gangen';
  return 'del opp';
}

/* ============================================================
   OPPGAVEMOTOR
   Hver oppgave er et objekt {type, ...}. Motoren tegner den i en
   container og kaller ferdig(riktig) når eleven har svart.
   Feil svar gir hint og eleven prøver igjen (mestring, ikke straff).
   ============================================================ */

/* --- tallpanel --- */
function tallpanel(mount, opts) {
  // opts: {etikett, maks, onOk(verdi)}
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="svarfelt">${opts.etikett ? `<span class="etikett">${opts.etikett}</span>` : ''}<div class="visning tom"></div></div>
    <div class="tallpanel">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}
      <button type="button" class="slett" data-n="slett">⌫</button>
      <button type="button" class="ok" data-n="ok">Svar ✓</button>
    </div>`;
  mount.appendChild(wrap);
  const vis = $('.visning', wrap);
  let verdi = '';
  const maks = opts.maks || 4;
  function oppdater() { vis.textContent = verdi; vis.classList.toggle('tom', verdi === ''); }
  function trykk(n) {
    if (n === 'slett') verdi = verdi.slice(0, -1);
    else if (n === 'ok') { if (verdi !== '') { const v = parseInt(verdi, 10); verdi = ''; oppdater(); opts.onOk(v); } return; }
    else if (verdi.length < maks) verdi += n;
    oppdater();
  }
  wrap.addEventListener('click', e => { const b = e.target.closest('button[data-n]'); if (b) trykk(b.dataset.n); });
  const tast = e => {
    if (!document.body.contains(wrap)) { document.removeEventListener('keydown', tast); return; }
    if (e.key >= '0' && e.key <= '9') trykk(e.key);
    else if (e.key === 'Backspace') trykk('slett');
    else if (e.key === 'Enter') trykk('ok');
  };
  document.addEventListener('keydown', tast);
  return { fjern() { document.removeEventListener('keydown', tast); wrap.remove(); } };
}

/* --- visuelle byggeklosser --- */
function rekkeHTML(rader, kol, opt) {
  opt = opt || {};
  let h = `<div class="rekke${opt.klikkbar ? ' klikkbar' : ''}" style="grid-template-columns:repeat(${kol},auto)">`;
  for (let r = 0; r < rader; r++) for (let c = 0; c < kol; c++) {
    let kl = 'celle';
    if (opt.del != null && c >= opt.del) kl += ' del';
    if (opt.tom && (r >= opt.tom.r || c >= opt.tom.c)) kl += ' tom';
    h += `<div class="${kl}" data-r="${r}" data-c="${c}">${opt.innhold || ''}</div>`;
  }
  return h + '</div>';
}
function rekkeMedEtiketter(rader, kol) {
  return `<div class="rekke-med-etiketter">
    <div class="rekke-etikett-topp">${kol} i hver rekke</div>
    <div class="rekke-etikett-side">${rader} rekker</div>
    ${rekkeHTML(rader, kol)}
  </div>`;
}
function grupperHTML(ant, per, emoji) {
  emoji = emoji || '🍎';
  let h = '<div class="grupper">';
  for (let i = 0; i < ant; i++) h += `<div class="tallerken ferdig">${Array(per).fill(`<span>${emoji}</span>`).join('')}</div>`;
  return h + '</div>';
}
function miniRekke(r, c) {
  let h = `<span class="mini-rekke" style="grid-template-columns:repeat(${c},12px)">`;
  for (let i = 0; i < r * c; i++) h += '<i></i>';
  return h + '</span>';
}

/* --- oppgavekjøring --- */
let aktivPanel = null;
function kjorOppgave(t, flate, feedback, knapper, ferdig) {
  flate.innerHTML = ''; feedback.className = 'tilbakemelding'; feedback.innerHTML = ''; knapper.innerHTML = '';
  if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; }
  let feil = 0;

  function ok(tekst) {
    feedback.className = 'tilbakemelding ok vis';
    feedback.innerHTML = tekst || velg(ROS);
    knapper.innerHTML = '';
    const b = document.createElement('button'); b.className = 'knapp gronn'; b.type = 'button'; b.textContent = 'Neste →';
    b.onclick = () => ferdig(feil === 0);
    knapper.appendChild(b); b.focus();
  }
  function galt(hintTekst) {
    feil++;
    feedback.className = 'tilbakemelding feil vis';
    feedback.innerHTML = `Ikke helt – prøv igjen! ${hintTekst ? `<div class="hint">${hintTekst}</div>` : ''}`;
  }
  const sp = document.createElement('div'); sp.className = 'oppg-sporsmal'; sp.innerHTML = t.q || ''; flate.appendChild(sp);
  const vis = document.createElement('div'); vis.className = 'oppg-visual'; flate.appendChild(vis);
  const inn = document.createElement('div'); flate.appendChild(inn);

  const typer = { input: oppgInput, mc: oppgMC, grupper: oppgGrupper, rekke: oppgRekke, tallinje: oppgTallinje, match: oppgMatch, del: oppgDel, tabell: oppgTabell };
  const nullstill = () => { feedback.className = 'tilbakemelding'; feedback.innerHTML = ''; };
  typer[t.type](t, { vis, inn, ok, galt, sp, nullstill });
}

/* input: skriv et tall */
function oppgInput(t, u) {
  if (t.visual) u.vis.innerHTML = t.visual;
  aktivPanel = tallpanel(u.inn, {
    etikett: t.etikett || '', maks: t.maks || 4,
    onOk(v) {
      if (v === t.svar) { u.ok(t.ros); if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; } }
      else u.galt(typeof t.hint === 'function' ? t.hint(v) : t.hint);
    }
  });
}

/* mc: flervalg */
function oppgMC(t, u) {
  if (t.visual) u.vis.innerHTML = t.visual;
  const boks = document.createElement('div'); boks.className = 'valg' + (t.bred ? ' bred' : '');
  const alts = t.behold ? t.alt : stokk(t.alt);
  alts.forEach(a => {
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = a.t;
    b.onclick = () => {
      if (a.ok) { b.classList.add('riktig'); $$('button', boks).forEach(x => x.disabled = true); u.ok(t.ros); }
      else { b.classList.add('galt'); b.disabled = true; u.galt(a.hint || t.hint); }
    };
    boks.appendChild(b);
  });
  u.inn.appendChild(boks);
}

/* grupper: bygg like grupper ved å trykke på tallerkener, svar så på totalen */
function oppgGrupper(t, u) {
  const emoji = t.emoji || velg(EMOJI);
  const info = document.createElement('div'); info.className = 'grupper-info';
  const boks = document.createElement('div'); boks.className = 'grupper';
  const teller = Array(t.grupper).fill(0);
  for (let i = 0; i < t.grupper; i++) {
    const d = document.createElement('div'); d.className = 'tallerken'; d.dataset.i = i;
    d.onclick = () => {
      if (laast) return;
      teller[i] = (teller[i] + 1) % (t.per + 3); // kan gå «for mange» og rundt igjen
      tegn();
    };
    boks.appendChild(d);
  }
  let laast = false;
  function tegn() {
    $$('.tallerken', boks).forEach((d, i) => {
      d.innerHTML = Array(teller[i]).fill(`<span>${emoji}</span>`).join('');
      d.classList.toggle('ferdig', teller[i] === t.per);
      d.classList.toggle('formye', teller[i] > t.per);
    });
    const sum = teller.reduce((a, b) => a + b, 0);
    info.innerHTML = `Trykk på tallerkenene til det ligger <b>${t.per}</b> på hver. Nå: ${teller.map(x => x).join(' + ')} = <b>${sum}</b>`;
  }
  tegn();
  u.vis.appendChild(info); u.vis.appendChild(boks);
  const sjekk = document.createElement('button'); sjekk.className = 'knapp lilla'; sjekk.type = 'button'; sjekk.textContent = 'Ferdig – jeg har lagt på';
  sjekk.style.marginTop = '.7rem';
  sjekk.onclick = () => {
    if (teller.every(x => x === t.per)) {
      laast = true; sjekk.remove();
      info.innerHTML = `Flott! <b>${t.grupper} grupper med ${t.per}</b>. Det skriver vi som <span class="stykke" style="font-family:'Fredoka One';color:#534AB7">${t.grupper} · ${t.per}</span>. Hvor mange er det til sammen?`;
      aktivPanel = tallpanel(u.inn, {
        etikett: `${t.grupper} · ${t.per} =`,
        onOk(v) {
          if (v === t.grupper * t.per) { u.ok(`Riktig! ${t.grupper} · ${t.per} = ${v}. ${t.grupper} grupper med ${t.per} i hver.`); aktivPanel.fjern(); aktivPanel = null; }
          else u.galt(`Tell alle sammen: ${Array(t.grupper).fill(t.per).join(' + ')} = ?`);
        }
      });
    } else {
      u.galt(`Det skal være nøyaktig ${t.per} på hver tallerken. Sjekk de som ikke er grønne.`);
    }
  };
  u.vis.appendChild(sjekk);
}

/* rekke: bygg en rekke (array) med + og − på rader/kolonner, svar så på totalen */
function oppgRekke(t, u) {
  let rader = t.startR || 1, kol = t.startK || 1;
  const verktoy = document.createElement('div'); verktoy.className = 'rekke-verktoy';
  verktoy.innerHTML = `
    <span class="gruppe">Rekker <button type="button" data-d="r-">−</button><b data-v="r">${rader}</b><button type="button" data-d="r+">+</button></span>
    <span class="gruppe">I hver rekke <button type="button" data-d="k-">−</button><b data-v="k">${kol}</b><button type="button" data-d="k+">+</button></span>`;
  const boks = document.createElement('div');
  const info = document.createElement('div'); info.className = 'grupper-info';
  function tegn() {
    boks.innerHTML = rekkeHTML(rader, kol, { innhold: '🪙' });
    $('[data-v=r]', verktoy).textContent = rader; $('[data-v=k]', verktoy).textContent = kol;
    info.innerHTML = `Lag <b>${t.rader} rekker</b> med <b>${t.kol} i hver</b>. Nå: ${rader} rekker med ${kol}.`;
  }
  verktoy.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || laast) return;
    const d = b.dataset.d;
    if (d === 'r+') rader = Math.min(10, rader + 1); if (d === 'r-') rader = Math.max(1, rader - 1);
    if (d === 'k+') kol = Math.min(10, kol + 1); if (d === 'k-') kol = Math.max(1, kol - 1);
    tegn();
  });
  let laast = false;
  tegn();
  u.vis.appendChild(info); u.vis.appendChild(verktoy); u.vis.appendChild(boks);
  const sjekk = document.createElement('button'); sjekk.className = 'knapp lilla'; sjekk.type = 'button'; sjekk.textContent = 'Ferdig – rekka er bygd'; sjekk.style.marginTop = '.7rem';
  sjekk.onclick = () => {
    if (rader === t.rader && kol === t.kol) {
      laast = true; sjekk.remove(); verktoy.remove();
      info.innerHTML = `Flott! <b>${t.rader} rekker med ${t.kol}</b> = <span style="font-family:'Fredoka One';color:#534AB7;font-size:1.3em">${t.rader} · ${t.kol}</span>. Hvor mange mynter er det?`;
      aktivPanel = tallpanel(u.inn, {
        etikett: `${t.rader} · ${t.kol} =`,
        onOk(v) {
          if (v === t.rader * t.kol) { u.ok(`Riktig! ${t.rader} · ${t.kol} = ${v}.`); aktivPanel.fjern(); aktivPanel = null; }
          else u.galt(`Tell rekke for rekke: ${Array(t.rader).fill(t.kol).join(' + ')} = ?`);
        }
      });
    } else u.galt(`Det skal være ${t.rader} rekker med ${t.kol} i hver. Bruk + og −.`);
  };
  u.vis.appendChild(sjekk);
}

/* tallinje: hopp k ganger med n */
function oppgTallinje(t, u) {
  const n = t.steg, k = t.hopp, maks = n * k + n; // litt luft etter siste
  const W = Math.max(640, maks * 26 + 60), pad = 30;
  const x = v => pad + v * (W - 2 * pad) / maks;
  const wrap = document.createElement('div'); wrap.className = 'tallinje-wrap';
  const linje = document.createElement('div'); linje.className = 'tallinje'; linje.style.width = W + 'px';
  let h = '<div class="strek"></div>';
  for (let v = 0; v <= maks; v++) {
    h += `<div class="merke" style="left:${x(v)}px"></div>`;
    if (maks <= 40 || v % 5 === 0 || v % n === 0) h += `<div class="tall" style="left:${x(v)}px">${v}</div>`;
  }
  h += `<div class="landet" style="left:${x(0)}px">0</div><div class="monster" style="left:${x(0)}px">${t.figur || '🐸'}</div>`;
  linje.innerHTML = h; wrap.appendChild(linje);
  const hjelp = document.createElement('div'); hjelp.className = 'tallinje-hjelp';
  u.vis.appendChild(wrap); u.vis.appendChild(hjelp);
  let pos = 0, gjort = 0;
  function settMal() {
    $$('.mal', linje).forEach(m => m.remove());
    // mulige landingsplasser: alle tall etter pos (eleven må finne rett)
    for (let v = pos + 1; v <= Math.min(maks, pos + n + 4); v++) {
      const m = document.createElement('div'); m.className = 'mal'; m.style.left = x(v) + 'px'; m.dataset.v = v;
      m.onclick = () => landing(v);
      linje.appendChild(m);
    }
    hjelp.innerHTML = `Hopp nr. <b>${gjort + 1}</b> av ${k}: trykk der du lander når du hopper <b>${n}</b> fra ${pos}.`;
  }
  function landing(v) {
    if (v !== pos + n) { u.galt(`Fra ${pos} og ${n} videre: ${pos} + ${n} = ${pos + n}.`); return; }
    const bue = document.createElement('div'); bue.className = 'bue';
    bue.style.left = x(pos) + 'px'; bue.style.width = (x(v) - x(pos)) + 'px'; linje.appendChild(bue);
    pos = v; gjort++;
    const l = document.createElement('div'); l.className = 'landet'; l.style.left = x(pos) + 'px'; l.textContent = pos; linje.appendChild(l);
    $('.monster', linje).style.left = x(pos) + 'px';
    u.nullstill();
    if (gjort < k) settMal();
    else {
      $$('.mal', linje).forEach(m => m.remove());
      hjelp.innerHTML = `Du hoppet <b>${k} ganger med ${n}</b>. Det er ${Array(k).fill(n).join(' + ')} – eller <b>${k} · ${n}</b>. Hvor landet du?`;
      aktivPanel = tallpanel(u.inn, {
        etikett: `${k} · ${n} =`,
        onOk(v) {
          if (v === n * k) { u.ok(`Riktig! ${k} · ${n} = ${v}. Å hoppe ${k} ganger med ${n} er det samme som ${k} · ${n}.`); aktivPanel.fjern(); aktivPanel = null; }
          else u.galt(`Se på tallinja – hvor står det siste hoppet?`);
        }
      });
    }
  }
  settMal();
}

/* match: par venstre ↔ høyre */
function oppgMatch(t, u) {
  const boks = document.createElement('div'); boks.className = 'match';
  const vk = document.createElement('div'); vk.className = 'kolonne';
  const hk = document.createElement('div'); hk.className = 'kolonne';
  boks.appendChild(vk); boks.appendChild(hk);
  const par = t.par; // [{v, h}]
  const vl = stokk(par.map((p, i) => ({ html: p.v, i }))), hl = stokk(par.map((p, i) => ({ html: p.h, i })));
  let valgtV = null, igjen = par.length;
  function lag(kol, liste, side) {
    liste.forEach(o => {
      const b = document.createElement('button'); b.type = 'button'; b.innerHTML = o.html; b.dataset.i = o.i; b.dataset.side = side;
      b.onclick = () => klikk(b);
      kol.appendChild(b);
    });
  }
  function klikk(b) {
    if (b.classList.contains('paret')) return;
    if (b.dataset.side === 'v') { $$('button.valgt', vk).forEach(x => x.classList.remove('valgt')); b.classList.add('valgt'); valgtV = b; return; }
    if (!valgtV) { u.galt('Velg først noe i venstre kolonne, så det som hører sammen i høyre.'); return; }
    if (valgtV.dataset.i === b.dataset.i) {
      valgtV.classList.remove('valgt'); valgtV.classList.add('paret'); b.classList.add('paret'); valgtV = null; igjen--; u.nullstill();
      if (igjen === 0) u.ok(t.ros || 'Alle parene er riktige! 🎉 Samme gangestykke – mange måter å vise det på.');
    } else { b.classList.add('galt'); setTimeout(() => b.classList.remove('galt'), 400); u.galt(t.hint || 'Tenk: hvor mange grupper, og hvor mange i hver?'); }
  }
  lag(vk, vl, 'v'); lag(hk, hl, 'h');
  u.inn.appendChild(boks);
}

/* del: del opp en rekke (distributiv lov) – velg delingssted, fyll inn to deler og sum */
function oppgDel(t, u) {
  const a = t.a, b = t.b; // a rader, b i hver rekke; vi deler kolonnene
  const info = document.createElement('div'); info.className = 'grupper-info';
  info.innerHTML = `<b>${a} · ${b}</b> er vanskelig å huske. Del rekka i to biter du kan! Velg hvor du vil dele:`;
  const velger = document.createElement('div'); velger.className = 'delvelger';
  const boks = document.createElement('div');
  const sum = document.createElement('div'); sum.className = 'delsum';
  u.vis.appendChild(info); u.vis.appendChild(velger); u.vis.appendChild(boks); u.vis.appendChild(sum);
  let del = null, steg = 0; // 0 = velg, 1 = første del, 2 = andre del, 3 = sum
  const lov = t.lov || [2, 3, 5]; // lovlige delingssteder
  lov.filter(d => d < b).forEach(d => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = `Del ved ${d}`;
    bt.onclick = () => { if (steg > 0) return; del = d; $$('button', velger).forEach(x => x.classList.toggle('aktiv', x === bt)); tegn(); };
    velger.appendChild(bt);
  });
  const start = document.createElement('button'); start.type = 'button'; start.className = 'knapp liten lilla'; start.textContent = 'Regn ut delene';
  start.onclick = () => { if (del == null) { u.galt('Velg først hvor du vil dele.'); return; } steg = 1; start.remove(); velger.remove(); spor(); };
  velger.appendChild(start);
  function tegn() { boks.innerHTML = rekkeHTML(a, b, { del }); sum.innerHTML = del == null ? '' : `${a} · ${b} = <b>${a} · ${del}</b> + <b>${a} · ${b - del}</b>`; }
  tegn();
  function spor() {
    if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; }
    const d1 = a * del, d2 = a * (b - del);
    if (steg === 1) {
      sum.innerHTML = `${a} · ${b} = <b>${a} · ${del}</b> + ${a} · ${b - del} = <span class="ukjent">?</span> + …`;
      aktivPanel = tallpanel(u.inn, { etikett: `${a} · ${del} =`, onOk(v) { if (v === d1) { steg = 2; spor(); } else u.galt(hint(a, del)); } });
    } else if (steg === 2) {
      sum.innerHTML = `${a} · ${b} = ${d1} + <b>${a} · ${b - del}</b> = ${d1} + <span class="ukjent">?</span>`;
      aktivPanel = tallpanel(u.inn, { etikett: `${a} · ${b - del} =`, onOk(v) { if (v === d2) { steg = 3; spor(); } else u.galt(hint(a, b - del)); } });
    } else {
      sum.innerHTML = `${a} · ${b} = ${d1} + ${d2} = <span class="ukjent">?</span>`;
      aktivPanel = tallpanel(u.inn, { etikett: `${d1} + ${d2} =`, onOk(v) {
        if (v === a * b) { sum.innerHTML = `${a} · ${b} = ${d1} + ${d2} = <b>${a * b}</b>`; u.ok(`Riktig! Du delte ${a} · ${b} i ${a} · ${del} og ${a} · ${b - del}. Det er «del opp»-trikset.`); aktivPanel.fjern(); aktivPanel = null; }
        else u.galt(`Legg sammen delene: ${d1} + ${d2}.`);
      } });
    }
  }
}

/* tabell: fyll inn skjulte ruter i gangetabellen */
function oppgTabell(t, u) {
  const skjul = t.skjul; // [[a,b],...]
  const boks = document.createElement('div');
  const igjenSett = new Set(skjul.map(p => p.join('x')));
  let valgt = null;
  function tegn() {
    let h = '<div class="tabell"><div class="hode">×</div>';
    for (let c = 1; c <= 10; c++) h += `<div class="hode">${c}</div>`;
    for (let r = 1; r <= 10; r++) {
      h += `<div class="hode">${r}</div>`;
      for (let c = 1; c <= 10; c++) {
        const k = r + 'x' + c;
        if (igjenSett.has(k)) h += `<div class="skjul" data-k="${k}" data-r="${r}" data-c="${c}">${valgt === k ? '?' : ''}</div>`;
        else h += `<div class="${r === c ? 'kv' : ''}">${r * c}</div>`;
      }
    }
    boks.innerHTML = h + '</div>';
  }
  tegn();
  u.vis.appendChild(boks);
  const info = document.createElement('div'); info.className = 'grupper-info'; info.textContent = 'Trykk på en lilla rute og skriv tallet som mangler.'; u.vis.appendChild(info);
  boks.addEventListener('click', e => {
    const d = e.target.closest('.skjul'); if (!d) return;
    valgt = d.dataset.k; tegn();
    const r = +d.dataset.r, c = +d.dataset.c;
    if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; }
    info.innerHTML = `Rute: rad <b>${r}</b>, kolonne <b>${c}</b> → <b>${r} · ${c}</b>`;
    aktivPanel = tallpanel(u.inn, { etikett: `${r} · ${c} =`, onOk(v) {
      if (v === r * c) {
        igjenSett.delete(valgt); valgt = null; tegn(); aktivPanel.fjern(); aktivPanel = null;
        if (igjenSett.size === 0) u.ok('Hele tabellen er fylt ut! 🎉'); else { info.textContent = `Riktig! ${igjenSett.size} igjen.`; }
      } else u.galt(hint(r, c));
    } });
  });
}

/* ============================================================
   ANIMERTE FORKLARINGER
   Hvert trinn har en liste scener: {tekst, dur, tegn(stage)}.
   tekst = det som leses inn (fil gangekurs/lyd/t<trinn>-<scene>.mp3)
   og vises som undertekst. Finnes ikke lydfila, går scenen på timer (dur).
   ============================================================ */
const LYDSTI = 'gangekurs/lyd/';
let lydPaa = true;

/* --- tegnehjelpere --- */
function fEl(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function fRekke(stage, rader, kol, opt) {
  // opt: {start (ms), steg (ms per celle), radvis, innhold, klasse, del, id}
  opt = opt || {};
  const g = fEl('div', 'f-rekke ' + (opt.klasse || ''));
  g.style.gridTemplateColumns = `repeat(${kol},auto)`;
  if (opt.id) g.id = opt.id;
  const start = opt.start || 0, steg = opt.steg == null ? 60 : opt.steg;
  for (let r = 0; r < rader; r++) for (let c = 0; c < kol; c++) {
    const d = fEl('div', 'f-celle popp' + (opt.del != null && c >= opt.del ? ' del' : ''), opt.innhold || '');
    d.dataset.r = r; d.dataset.c = c;
    const idx = opt.radvis === false ? c * rader + r : r * kol + c;
    d.style.animationDelay = (start + idx * steg) + 'ms';
    g.appendChild(d);
  }
  stage.appendChild(g);
  return g;
}
function fTekst(stage, html, delay, cls) {
  const t = fEl('div', 'f-tekst popp ' + (cls || ''), html);
  t.style.animationDelay = (delay || 0) + 'ms';
  stage.appendChild(t); return t;
}
function fEtikett(stage, html, delay, cls) {
  const t = fEl('div', 'f-etikett popp ' + (cls || ''), html);
  t.style.animationDelay = (delay || 0) + 'ms';
  stage.appendChild(t); return t;
}
function fGrupper(stage, ant, per, emoji, start, steg) {
  const g = fEl('div', 'f-grupper');
  for (let i = 0; i < ant; i++) {
    const t = fEl('div', 'f-tallerken popp'); t.style.animationDelay = (start + i * 400) + 'ms';
    for (let j = 0; j < per; j++) { const s = fEl('span', 'popp', emoji); s.style.animationDelay = (start + i * 400 + 150 + j * (steg || 120)) + 'ms'; t.appendChild(s); }
    g.appendChild(t);
  }
  stage.appendChild(g); return g;
}
function fRad(stage) { const r = fEl('div', 'f-rad'); stage.appendChild(r); return r; }
function fTallinje(stage, n, k, opt) {
  opt = opt || {};
  const maks = n * k + (opt.luft == null ? n : opt.luft);
  const W = 100; // prosent
  const x = v => (4 + v * 92 / maks) + '%';
  const l = fEl('div', 'f-tallinje');
  l.appendChild(fEl('div', 'strek'));
  for (let v = 0; v <= maks; v++) {
    const m = fEl('div', 'merke'); m.style.left = x(v); l.appendChild(m);
    if (maks <= 30 || v % n === 0) { const t = fEl('div', 'tall' + (v > 0 && v % n === 0 ? ' mål' : ''), v); t.style.left = x(v); if (v > 0 && v % n === 0) { t.classList.add('popp'); t.style.animationDelay = (opt.start + (v / n) * opt.steg + 300) + 'ms'; } l.appendChild(t); }
  }
  for (let i = 0; i < k; i++) {
    const b = fEl('div', 'bue popp'); b.style.left = x(i * n); b.style.width = `calc(${x((i + 1) * n)} - ${x(i * n)})`; b.style.animationDelay = (opt.start + i * opt.steg) + 'ms'; l.appendChild(b);
  }
  const fig = fEl('div', 'figur', opt.figur || '🐸'); fig.style.left = x(0); l.appendChild(fig);
  for (let i = 1; i <= k; i++) setTimeout(() => { fig.style.left = x(i * n); fig.classList.add('hopp'); setTimeout(() => fig.classList.remove('hopp'), 350); }, opt.start + (i - 1) * opt.steg + 100);
  stage.appendChild(l); return l;
}
function fFlashkort(stage, tekst, delay, farge) {
  const k = fEl('div', 'f-flash popp ' + (farge || ''), tekst); k.style.animationDelay = (delay || 0) + 'ms'; stage.appendChild(k); return k;
}
function senere(fn, ms) { const t = setTimeout(fn, ms); aktiveTimere.push(t); }
let aktiveTimere = [];

/* --- scenene --- */
const FORKLARINGER = {
1: [
  { tekst: 'Ganging er å telle like grupper – fort. Se her: fire tallerkener, og tre epler på hver.', dur: 7000, tegn(s) {
    fGrupper(s, 4, 3, '🍎', 300, 130);
  } },
  { tekst: 'Vi kunne telle tre pluss tre pluss tre pluss tre. Det blir tolv.', dur: 6000, tegn(s) {
    fGrupper(s, 4, 3, '🍎', 0, 0);
    fTekst(s, '3 + 3 + 3 + 3 = <b>12</b>', 800);
  } },
  { tekst: 'Men det er raskere å si: fire ganger tre. Fire grupper – med tre i hver. Fire ganger tre er tolv.', dur: 8000, tegn(s) {
    fGrupper(s, 4, 3, '🍎', 0, 0);
    fTekst(s, '<span class="f-a">4</span> · <span class="f-b">3</span> = <b>12</b>', 600);
    fEtikett(s, '<span class="f-a">4 grupper</span> · <span class="f-b">3 i hver</span>', 2500);
  } },
  { tekst: 'Det første tallet sier hvor mange grupper. Det andre sier hvor mange i hver gruppe. Og prikken betyr «ganger».', dur: 8000, tegn(s) {
    fTekst(s, '<span class="f-a f-stor">4</span> · <span class="f-b f-stor">3</span>', 0);
    fEtikett(s, '<span class="f-a">↑ hvor mange grupper</span>', 800);
    fEtikett(s, '<span class="f-b">↑ hvor mange i hver</span>', 2800);
    fEtikett(s, '<span class="f-lilla">· betyr «ganger»</span>', 5000);
  } },
],
2: [
  { tekst: 'Når vi legger tingene i rekker med like mange i hver, ser vi gangestykket med én gang. Her er tre rekker med fire mynter.', dur: 8000, tegn(s) {
    fRekke(s, 3, 4, { start: 300, steg: 120, innhold: '🪙' });
    fEtikett(s, '<span class="f-a">3 rekker</span> · <span class="f-b">4 i hver</span>', 2200);
    fTekst(s, '3 · 4 = <b>12</b>', 3500);
  } },
  { tekst: 'Og nå kommer den beste hemmeligheten i hele gangetabellen. Vi snur rekka!', dur: 6000, tegn(s) {
    const g = fRekke(s, 3, 4, { steg: 0, innhold: '🪙', id: 'snu' });
    senere(() => g.classList.add('snu'), 1500);
  } },
  { tekst: 'Nå er det fire rekker med tre. Men det er fortsatt tolv mynter! Derfor er tre ganger fire det samme som fire ganger tre.', dur: 9000, tegn(s) {
    fRekke(s, 4, 3, { steg: 0, innhold: '🪙' });
    fEtikett(s, '<span class="f-b">4 rekker</span> · <span class="f-a">3 i hver</span>', 500);
    fTekst(s, '3 · 4 = 4 · 3 = <b>12</b>', 3000);
  } },
  { tekst: 'Kan du ett gangestykke, kan du alltid to. Det halverer alt du må lære.', dur: 6000, tegn(s) {
    const r = fRad(s);
    [['3 · 4', 12], ['4 · 3', 12], ['6 · 8', 48], ['8 · 6', 48]].forEach((p, i) => { const k = fFlashkort(r, `${p[0]} = ${p[1]}`, 300 + i * 500, i % 2 ? 'gronn' : ''); });
    fEtikett(s, 'Ett stykke – to svar du kan!', 2800);
  } },
],
3: [
  { tekst: 'Ganging er også like lange hopp på tallinja. Frosken hopper med fem – fire ganger.', dur: 8000, tegn(s) {
    fTallinje(s, 5, 4, { start: 1500, steg: 1200, figur: '🐸' });
  } },
  { tekst: 'Fem, ti, femten, tjue. Fire hopp med fem – frosken landet på tjue. Fire ganger fem er tjue.', dur: 8000, tegn(s) {
    fTallinje(s, 5, 4, { start: 300, steg: 900, figur: '🐸' });
    fTekst(s, '4 · 5 = <b>20</b>', 4500);
  } },
  { tekst: 'Når du teller fem, ti, femten, tjue, kaller vi det å telle med fem. Å kunne telle med to, fem og ti er superkrefter i ganging!', dur: 9000, tegn(s) {
    const r = fRad(s);
    fFlashkort(r, '2, 4, 6, 8, 10 …', 300, 'gul');
    fFlashkort(r, '5, 10, 15, 20 …', 1800, 'gronn');
    fFlashkort(r, '10, 20, 30, 40 …', 3300, 'lilla');
    fEtikett(s, '💪 Superkrefter: telle med 2, 5 og 10', 5000);
  } },
],
4: [
  { tekst: 'Nå kan du mange måter å se ganging på. Se på tre ganger fire.', dur: 5000, tegn(s) {
    fTekst(s, '<span class="f-stor">3 · 4</span>', 300);
  } },
  { tekst: 'Like grupper. Rekker. Hopp på tallinja. Og gjentatt pluss: fire pluss fire pluss fire. Alt sammen er tre ganger fire.', dur: 11000, tegn(s) {
    const r = fRad(s); r.classList.add('fire');
    const a = fEl('div', 'f-panel popp'); a.style.animationDelay = '300ms'; fGrupper(a, 3, 4, '⭐', 300, 60); a.appendChild(fEl('small', '', 'grupper')); r.appendChild(a);
    const b = fEl('div', 'f-panel popp'); b.style.animationDelay = '2600ms'; fRekke(b, 3, 4, { start: 2600, steg: 60, innhold: '🪙', klasse: 'liten' }); b.appendChild(fEl('small', '', 'rekke')); r.appendChild(b);
    const c = fEl('div', 'f-panel popp'); c.style.animationDelay = '4800ms'; c.appendChild(fEl('div', 'f-mini', '4 → 8 → 12')); c.appendChild(fEl('small', '', 'hopp')); r.appendChild(c);
    const d = fEl('div', 'f-panel popp'); d.style.animationDelay = '7000ms'; d.appendChild(fEl('div', 'f-mini', '4 + 4 + 4')); d.appendChild(fEl('small', '', 'pluss')); r.appendChild(d);
    fTekst(s, 'Alt er <b>3 · 4 = 12</b>', 9000);
  } },
  { tekst: 'Og du kan fortelle det som en historie: tre barn får fire mynter hver. Den som virkelig skjønner ganging, kan bytte mellom bildene. Er et stykke vanskelig – tegn det på en annen måte!', dur: 11000, tegn(s) {
    fTekst(s, '👧👦🧒 &nbsp;får 🪙🪙🪙🪙 hver', 500, 'f-mindre');
    fEtikett(s, '«Tre barn får fire mynter hver» = 3 · 4', 3000);
    fEtikett(s, '💡 Vanskelig stykke? Tegn det på en annen måte!', 7000);
  } },
],
5: [
  { tekst: 'To-gangen er å doble. To ganger sju er sju pluss sju – fjorten.', dur: 7000, tegn(s) {
    const r = fRad(s);
    fRekke(r, 1, 7, { start: 300, steg: 100, innhold: '🪙' });
    fRekke(r, 1, 7, { start: 2500, steg: 100, innhold: '🪙' });
    fTekst(s, '2 · 7 = 7 + 7 = <b>14</b>', 4000);
  } },
  { tekst: 'Ti-gangen er tiere. Ti ganger sju er sju tiere – sytti. Bare sett en null bak!', dur: 8000, tegn(s) {
    fRekke(s, 7, 10, { start: 300, steg: 25, innhold: '', klasse: 'liten' });
    fTekst(s, '10 · 7 = 7 tiere = <b>7<span class="f-null popp" style="animation-delay:4500ms">0</span></b>', 3000);
  } },
  { tekst: 'Og fem-gangen er halvparten av ti-gangen. Ti ganger seks er seksti – så fem ganger seks er tretti.', dur: 8000, tegn(s) {
    const g = fRekke(s, 6, 10, { start: 300, steg: 25, innhold: '', klasse: 'liten', del: 5 });
    senere(() => g.classList.add('halv'), 3500);
    fTekst(s, '10 · 6 = 60 &nbsp;→&nbsp; 5 · 6 = <b>30</b>', 4500);
  } },
  { tekst: 'Disse tre tabellene kan du nesten allerede – og de er nøkkelen til alle de andre.', dur: 6000, tegn(s) {
    const r = fRad(s);
    fFlashkort(r, '2-gangen', 300, 'gul'); fFlashkort(r, '5-gangen', 1000, 'gronn'); fFlashkort(r, '10-gangen', 1700, 'lilla');
    fEtikett(s, '🔑 Nøkkelen til alle de andre', 3000);
  } },
],
6: [
  { tekst: 'Kan du to-gangen, kan du fire-gangen. Du dobler bare to ganger. Se: to rekker med seks er tolv.', dur: 8000, tegn(s) {
    fRekke(s, 2, 6, { start: 300, steg: 100, innhold: '🪙' });
    fTekst(s, '2 · 6 = <b>12</b>', 2500);
  } },
  { tekst: 'Dobbelt opp – fire rekker med seks. Tolv pluss tolv er tjuefire. Fire ganger seks er tjuefire.', dur: 8000, tegn(s) {
    fRekke(s, 2, 6, { steg: 0, innhold: '🪙' });
    fRekke(s, 2, 6, { start: 800, steg: 80, innhold: '🪙', klasse: 'blaa' });
    fTekst(s, '4 · 6 = 12 + 12 = <b>24</b>', 3500);
  } },
  { tekst: 'Og åtte-gangen er fire-gangen doblet. Tjuefire pluss tjuefire er førtiåtte. Hver gang blir det dobbelt så mange.', dur: 9000, tegn(s) {
    fRekke(s, 4, 6, { steg: 0, innhold: '🪙', klasse: 'liten' });
    fRekke(s, 4, 6, { start: 800, steg: 50, innhold: '🪙', klasse: 'liten blaa' });
    fTekst(s, '8 · 6 = 24 + 24 = <b>48</b>', 3500);
    fEtikett(s, '2 · 6 → 4 · 6 → 8 · 6: dobbelt hver gang', 6000);
  } },
],
7: [
  { tekst: 'Tre-gangen: doble, og legg til én gang til. Tre ganger sju – først to ganger sju, det er fjorten.', dur: 8000, tegn(s) {
    fRekke(s, 2, 7, { start: 300, steg: 100, innhold: '🪙' });
    fTekst(s, '2 · 7 = <b>14</b>', 2800);
  } },
  { tekst: 'Så én rekke til med sju. Fjorten pluss sju er tjueen. Tre ganger sju er tjueen.', dur: 7000, tegn(s) {
    fRekke(s, 2, 7, { steg: 0, innhold: '🪙' });
    fRekke(s, 1, 7, { start: 800, steg: 100, innhold: '🪙', klasse: 'blaa' });
    fTekst(s, '3 · 7 = 14 + 7 = <b>21</b>', 3000);
  } },
  { tekst: 'Og seks-gangen er tre-gangen doblet. Tjueen pluss tjueen er førtito. Husk også snu-regelen: seks ganger fire er det samme som fire ganger seks – som du allerede kan!', dur: 11000, tegn(s) {
    fRekke(s, 3, 7, { steg: 0, innhold: '🪙', klasse: 'liten' });
    fRekke(s, 3, 7, { start: 800, steg: 50, innhold: '🪙', klasse: 'liten blaa' });
    fTekst(s, '6 · 7 = 21 + 21 = <b>42</b>', 3200);
    fEtikett(s, '🔁 6 · 4 = 4 · 6 – det kan du fra før', 7500);
  } },
],
8: [
  { tekst: 'Ni er nesten ti. Se på ti rekker med sju – det er sytti.', dur: 6000, tegn(s) {
    fRekke(s, 10, 7, { start: 300, steg: 30, innhold: '', klasse: 'liten', id: 'ni' });
    fTekst(s, '10 · 7 = <b>70</b>', 3000);
  } },
  { tekst: 'Ta bort den siste rekka – én sjuer. Sytti minus sju er sekstitre. Ni ganger sju er sekstitre.', dur: 8000, tegn(s) {
    const g = fRekke(s, 10, 7, { steg: 0, innhold: '', klasse: 'liten' });
    senere(() => g.querySelectorAll('[data-r="9"]').forEach(c => c.classList.add('vekk')), 1500);
    fTekst(s, '9 · 7 = 70 − 7 = <b>63</b>', 3500);
  } },
  { tekst: 'Og sjekk svaret: i ni-gangen blir sifrene alltid ni til sammen. Seks pluss tre er ni. Og tieren er én mindre enn tallet du ganger med.', dur: 10000, tegn(s) {
    fTekst(s, '9 · 7 = <span class="f-a">6</span><span class="f-b">3</span>', 300);
    fEtikett(s, '<span class="f-a">6</span> + <span class="f-b">3</span> = 9 ✓', 3000);
    fEtikett(s, 'Tieren er 6 – én mindre enn 7 ✓', 6500);
  } },
],
9: [
  { tekst: 'Nå er det bare noen få stykker igjen – som sju ganger åtte. For dem bruker vi det kraftigste trikset av alle: del opp.', dur: 8000, tegn(s) {
    fRekke(s, 7, 8, { start: 300, steg: 25, innhold: '', klasse: 'liten', id: 'delopp' });
    fTekst(s, '7 · 8 = ?', 2500);
  } },
  { tekst: 'Del rekka ved fem. Da får du sju ganger fem – det er trettifem – og sju ganger tre – det er tjueen.', dur: 9000, tegn(s) {
    const g = fRekke(s, 7, 8, { steg: 0, innhold: '', klasse: 'liten', del: 5 });
    senere(() => g.classList.add('vis-del'), 1200);
    fTekst(s, '7 · 5 = <b>35</b> &nbsp;og&nbsp; <span class="f-gronn">7 · 3 = <b>21</b></span>', 3500);
  } },
  { tekst: 'Trettifem pluss tjueen er femtiseks. Sju ganger åtte er femtiseks! Du kan dele hvor du vil – bare velg biter du kan.', dur: 9000, tegn(s) {
    fRekke(s, 7, 8, { steg: 0, innhold: '', klasse: 'liten vis-del', del: 5 });
    fTekst(s, '7 · 8 = 35 + 21 = <b>56</b>', 800);
    fEtikett(s, '✂️ Del der du vil – velg biter du kan', 5000);
  } },
],
10: [
  { tekst: 'Her er hele gangetabellen. Se på den gule diagonalen – det er kvadrattallene: en, fire, ni, seksten …', dur: 9000, tegn(s) {
    const t = fEl('div', 'f-tabell');
    for (let r = 1; r <= 10; r++) for (let c = 1; c <= 10; c++) { const d = fEl('div', 'popp' + (r === c ? ' kv' : ''), r * c); d.style.animationDelay = ((r + c) * 120) + 'ms'; if (r === c) d.style.animationDelay = (2600 + r * 300) + 'ms'; t.appendChild(d); }
    s.appendChild(t);
  } },
  { tekst: 'Speil du tabellen langs diagonalen, er tallene like. Tre ganger fire og fire ganger tre – det er snu-regelen!', dur: 8000, tegn(s) {
    const t = fEl('div', 'f-tabell');
    for (let r = 1; r <= 10; r++) for (let c = 1; c <= 10; c++) { const d = fEl('div', (r === c ? 'kv' : '') + ((r === 3 && c === 4) || (r === 4 && c === 3) ? ' blink' : '') + (c < r ? ' dim' : ''), r * c); t.appendChild(d); }
    s.appendChild(t);
    fTekst(s, '3 · 4 = 4 · 3 = 12', 2500, 'f-mindre');
  } },
  { tekst: 'Og hvert gangestykke har en familie: tre ganger fire er tolv, fire ganger tre er tolv, tolv delt på fire er tre, og tolv delt på tre er fire. Deling er ganging baklengs!', dur: 12000, tegn(s) {
    const r = fRad(s);
    fFlashkort(r, '3 · 4 = 12', 300, 'gul'); fFlashkort(r, '4 · 3 = 12', 2300, 'gul');
    fFlashkort(r, '12 : 4 = 3', 4500, 'gronn'); fFlashkort(r, '12 : 3 = 4', 6700, 'gronn');
    fEtikett(s, '👨‍👩‍👧‍👦 Gangefamilien: kan du ett, kan du fire', 9000);
  } },
],
11: [
  { tekst: 'Nå skal stykkene inn i hodet for godt. Kortstokken har alle femtifem stykkene. Hvert kort starter grått.', dur: 7000, tegn(s) {
    const r = fRad(s);
    ['3 · 7', '6 · 8', '4 · 9', '7 · 7'].forEach((k, i) => fFlashkort(r, k, 300 + i * 400, 'graa'));
    fEtikett(s, '55 kort – alle grå til å begynne med', 2500);
  } },
  { tekst: 'Svarer du riktig, blir kortet gult. Svarer du riktig igjen en annen dag, blir det grønt. Da sitter det!', dur: 8000, tegn(s) {
    const r = fRad(s);
    const k = fFlashkort(r, '6 · 8', 0, 'graa');
    senere(() => { k.className = 'f-flash gul'; k.textContent = '6 · 8 = 48'; }, 1500);
    fEtikett(s, '☀️ i dag: gult', 1500);
    senere(() => { k.className = 'f-flash gronn'; }, 4500);
    fEtikett(s, '🌙 en annen dag: grønt ✓', 4500);
  } },
  { tekst: 'Svarer du feil, får du strategien – og kortet går tilbake. Øv fem minutter om gangen, gjerne hver dag. Det virker mye bedre enn én lang økt.', dur: 9000, tegn(s) {
    const r = fRad(s);
    const k = fFlashkort(r, '7 · 8', 0, 'gul');
    senere(() => { k.className = 'f-flash graa rist'; }, 1500);
    fEtikett(s, '💡 7 · 8 = 7 · 5 + 7 · 3', 1800);
    fEtikett(s, '⏱️ 5 minutter hver dag > én lang økt', 5000);
  } },
],
12: [
  { tekst: 'Siste trinn! Nå bruker du ganging på ekte oppgaver – og på stykker utenfor tabellen, som seks ganger tolv.', dur: 7000, tegn(s) {
    fTekst(s, '<span class="f-stor">6 · 12</span> = ?', 300);
  } },
  { tekst: 'Trikset er det samme som før: del opp i biter du kan. Seks ganger ti er seksti. Seks ganger to er tolv.', dur: 8000, tegn(s) {
    const g = fRekke(s, 6, 12, { start: 200, steg: 20, innhold: '', klasse: 'liten', del: 10 });
    senere(() => g.classList.add('vis-del'), 2000);
    fTekst(s, '6 · 10 = <b>60</b> &nbsp;og&nbsp; <span class="f-gronn">6 · 2 = <b>12</b></span>', 3500);
  } },
  { tekst: 'Seksti pluss tolv er syttito. Seks ganger tolv er syttito. Den som klarer dette, er klar for Gangeprøven!', dur: 8000, tegn(s) {
    fRekke(s, 6, 12, { steg: 0, innhold: '', klasse: 'liten vis-del', del: 10 });
    fTekst(s, '6 · 12 = 60 + 12 = <b>72</b>', 800);
    fEtikett(s, '🎓 Klar for Gangeprøven!', 4500);
  } },
],
};

/* --- spilleren --- */
let aktivLyd = null;
function stoppForklaring() {
  aktiveTimere.forEach(clearTimeout); aktiveTimere = [];
  if (aktivLyd) { try { aktivLyd.pause(); } catch (e) { /* */ } aktivLyd = null; }
}
function lagForklaringsspiller(mount, trinnId, bilde) {
  const scener = FORKLARINGER[trinnId];
  if (!scener || !scener.length) return;
  const boks = fEl('div', 'f-spiller');
  boks.innerHTML = `
    <div class="f-scene" id="f-scene">
      <img src="${bilde}" alt="" class="f-plakat">
      <button type="button" class="f-play" id="f-play">▶ Se forklaringen</button>
    </div>
    <div class="f-undertekst" id="f-undertekst">Trykk på ▶ for å se forklaringen med bilder${lydPaa ? ' og lyd' : ''}.</div>
    <div class="f-kontroll">
      <button type="button" class="knapp hvit liten" id="f-forrige" disabled>◀ Forrige</button>
      <div class="f-prikker" id="f-prikker">${scener.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>
      <button type="button" class="knapp hvit liten" id="f-neste" disabled>Neste ▶</button>
      <button type="button" class="knapp hvit liten" id="f-lyd" title="Lyd av/på">${lydPaa ? '🔊' : '🔇'}</button>
    </div>`;
  mount.appendChild(boks);
  const stage = $('#f-scene', boks), ut = $('#f-undertekst', boks), prikker = $$('#f-prikker i', boks);
  const bForrige = $('#f-forrige', boks), bNeste = $('#f-neste', boks), bLyd = $('#f-lyd', boks);
  let i = -1, ferdig = false;

  function visScene(n) {
    stoppForklaring();
    i = n; ferdig = false;
    const sc = scener[i];
    stage.innerHTML = ''; stage.classList.add('aktiv');
    sc.tegn(stage);
    ut.textContent = sc.tekst;
    prikker.forEach((p, j) => p.classList.toggle('aktiv', j === i));
    bForrige.disabled = i === 0; bNeste.disabled = false;
    bNeste.textContent = i === scener.length - 1 ? 'Spill igjen ↺' : 'Neste ▶';
    // lyd eller timer
    let gikkVidere = false;
    const videre = () => { if (gikkVidere) return; gikkVidere = true; if (i < scener.length - 1) visScene(i + 1); else avslutt(); };
    if (lydPaa) {
      const a = new Audio(LYDSTI + `t${trinnId}-${i + 1}.mp3`);
      aktivLyd = a;
      a.addEventListener('ended', () => senere(videre, 700));
      a.addEventListener('error', () => { if (aktivLyd === a) senere(videre, sc.dur); });
      a.play().catch(() => { if (aktivLyd === a) senere(videre, sc.dur); });
    } else senere(videre, sc.dur);
  }
  function avslutt() {
    ferdig = true;
    stage.classList.remove('aktiv');
    const p = fEl('button', 'f-play', '↺ Se igjen'); p.type = 'button'; p.onclick = () => visScene(0); stage.appendChild(p);
    ut.textContent = 'Det var forklaringen. Nå kan du prøve selv!';
  }
  $('#f-play', boks).onclick = () => visScene(0);
  bForrige.onclick = () => { if (i > 0) visScene(i - 1); };
  bNeste.onclick = () => { if (i < 0) visScene(0); else if (i < scener.length - 1) visScene(i + 1); else visScene(0); };
  bLyd.onclick = () => { lydPaa = !lydPaa; bLyd.textContent = lydPaa ? '🔊' : '🔇'; if (i >= 0 && !ferdig) visScene(i); };
  return boks;
}

/* ============================================================
   TRINNENE
   Hvert trinn: intro (bilde + forklaring), «Gjør det med hendene»,
   «Snakk sammen» og en liste oppgaver som genereres ved start.
   ============================================================ */

/* felles oppgavegeneratorer */
function inputStykke(a, b, opt) {
  opt = opt || {};
  return { type: 'input', q: opt.q || `Hva er <span class="stykke">${a} · ${b}</span>?`, etikett: `${a} · ${b} =`, svar: a * b,
    visual: opt.visual || '', hint: opt.hint || hint(a, b), ros: opt.ros };
}
function mcTall(q, riktig, feilListe, opt) {
  opt = opt || {};
  const alt = [{ t: String(riktig), ok: true }].concat(feilListe.map(f => ({ t: String(f), ok: false })));
  return Object.assign({ type: 'mc', q, alt }, opt);
}
function naboer(p, n) {
  // plausible feil svar rundt p
  const kand = [p + 1, p - 1, p + 2, p - 2, p + 10, p - 10, p + 5, p - 5].filter(x => x > 0 && x !== p);
  return stokk(kand).slice(0, n);
}
function stykkeAlt(a, b) {
  // feil gangestykker som ligner
  const kand = [`${a} · ${b + 1}`, `${a + 1} · ${b}`, `${a} + ${b}`, `${b} · ${a + 1}`, `${a - 1} · ${b}`].filter(s => !s.startsWith('0'));
  return stokk(kand).slice(0, 3);
}
function tekstoppgave(a, b, ctx) {
  const c = ctx || velg(HISTORIER);
  return { type: 'input', q: c.tekst(a, b), etikett: '=', svar: a * b, hint: `Det er <b>${a} grupper med ${b}</b>: ${a} · ${b}. ${hint(a, b)}` };
}
const HISTORIER = [
  { tekst: (a, b) => `Drage har <b>${a}</b> sparegriser. I hver ligger det <b>${b}</b> mynter. Hvor mange mynter har Drage?` },
  { tekst: (a, b) => `I klassebutikken koster en blyant <b>${b}</b> mynter. Stjerne kjøper <b>${a}</b> blyanter. Hva må Stjerne betale?` },
  { tekst: (a, b) => `Måne får <b>${b}</b> mynter i lønn hver dag. Hvor mye har Måne tjent etter <b>${a}</b> dager?` },
  { tekst: (a, b) => `Bølge legger mynter i rekker: <b>${a}</b> rekker med <b>${b}</b> i hver. Hvor mange mynter er det?` },
  { tekst: (a, b) => `Det er <b>${a}</b> bord i klasserommet. Ved hvert bord sitter <b>${b}</b> elever. Hvor mange elever er det?` },
  { tekst: (a, b) => `En pose har <b>${b}</b> eplebiter. Lyn tar med <b>${a}</b> poser på tur. Hvor mange eplebiter er det?` },
];

const TRINN = [
/* ---------- DEL 1: HVA ER GANGING? ---------- */
{
  id: 1, del: 1, tittel: 'Like grupper', kort: '4 tallerkener med 3 epler – det er ganging!', bilde: 'gangekurs/grupper.webp',
  intro: `<p class="forklaring">Ganging er å telle <b>like grupper</b> fort. Hvis fire tallerkener har tre epler hver, kan du telle 3 + 3 + 3 + 3. Eller du kan si: <span class="stykke">4 · 3</span> – «fire ganger tre» – som betyr <b>4 grupper med 3 i hver</b>.</p>
  <p>Det første tallet sier <b>hvor mange grupper</b>. Det andre sier <b>hvor mange i hver gruppe</b>. Prikken · betyr «ganger».</p>`,
  hender: `Legg <b>3 hauger med 5 mynter</b> (eller knapper, klosser, viskelær) på pulten. Si høyt: «3 grupper med 5 – 3 ganger 5 – 15». Lag så 5 hauger med 3. Like mange?`,
  snakk: `Hvor i klasserommet eller hjemme finnes det like grupper? (Eggekartong, stoler ved bordene, sokker i par, dager i uka …)`,
  oppgaver() {
    const o = [];
    o.push({ type: 'grupper', q: 'Lag <b>3 grupper med 4</b> 🍎', grupper: 3, per: 4, emoji: '🍎' });
    o.push(mcTall('Hvilket gangestykke passer til bildet?', '4 · 2', ['2 · 3', '4 + 2', '4 · 4'], { visual: grupperHTML(4, 2, '🪙'), hint: 'Tell gruppene først (tallerkenene), så hvor mange i hver.' }));
    o.push({ type: 'grupper', q: 'Lag <b>2 grupper med 6</b> 🍪', grupper: 2, per: 6, emoji: '🍪' });
    o.push(mcTall('Hvilket gangestykke passer til bildet?', '5 · 3', ['3 · 3', '5 + 3', '5 · 5'], { visual: grupperHTML(5, 3, '⭐'), hint: '5 tallerkener – 5 grupper. Hvor mange på hver?' }));
    o.push({ type: 'grupper', q: 'Lag <b>5 grupper med 2</b> 🎈', grupper: 5, per: 2, emoji: '🎈' });
    o.push(inputStykke(3, 5, { q: 'Hvor mange til sammen? Tell gruppene og skriv svaret.', visual: grupperHTML(3, 5, '🐟'), hint: '3 grupper med 5: 5 + 5 + 5 = ?' }));
    o.push({ type: 'grupper', q: 'Lag <b>4 grupper med 5</b> 🪙', grupper: 4, per: 5, emoji: '🪙' });
    o.push(tekstoppgave(3, 4, HISTORIER[0]));
    return o;
  }
},
{
  id: 2, del: 1, tittel: 'Rekker – og snu-regelen', kort: 'Mynter i rekker viser at 3 · 4 = 4 · 3', bilde: 'gangekurs/rekker.webp',
  intro: `<p class="forklaring">Når vi legger tingene i <b>rekker</b> med like mange i hver, ser vi gangestykket med én gang. 3 rekker med 4 mynter er <span class="stykke">3 · 4 = 12</span>.</p>
  <p>Og her er den beste hemmeligheten i hele gangetabellen: <b>snu rekka</b> – og du har 4 rekker med 3. Fortsatt 12 mynter! Derfor er <b>3 · 4 = 4 · 3</b>. Kan du ett gangestykke, kan du alltid to. Det halverer alt du må lære.</p>
  ${rekkeMedEtiketter(3, 4)}`,
  hender: `Legg 2 rekker med 6 mynter på pulten. Snu hele rekka en kvart runde. Hvor mange rekker nå? Hvor mange i hver? Hvor mange mynter? Prøv med 3 · 5 også.`,
  snakk: `Hvorfor blir det like mange når vi snur rekka? Finnes det gangestykker der det ikke hjelper å snu? (Hva med 7 · 7?)`,
  oppgaver() {
    const o = [];
    o.push({ type: 'rekke', q: 'Bygg en rekke med <b>2 rekker og 5 i hver</b>.', rader: 2, kol: 5, startR: 1, startK: 1 });
    o.push(inputStykke(4, 3, { q: 'Hvor mange mynter er det i rekka?', visual: rekkeMedEtiketter(4, 3), hint: '4 rekker med 3: 3 + 3 + 3 + 3.' }));
    o.push({ type: 'rekke', q: 'Bygg <b>3 rekker med 6 i hver</b>.', rader: 3, kol: 6, startR: 1, startK: 1 });
    o.push(mcTall('Rekka viser 5 · 2. Snur du den, hvilket gangestykke får du?', '2 · 5', ['5 · 5', '2 · 2', '5 + 2'], { visual: rekkeMedEtiketter(5, 2), hint: 'Rekker blir kolonner: 2 rekker med 5.' }));
    o.push({ type: 'rekke', q: 'Bygg <b>4 rekker med 4 i hver</b> – en kvadratrekke!', rader: 4, kol: 4, startR: 2, startK: 2 });
    o.push(mcTall('Hvilket gangestykke gir like mange som 6 · 3?', '3 · 6', ['6 · 6', '3 · 3', '6 + 3'], { hint: 'Snu-regelen: bytt plass på tallene.' }));
    o.push(inputStykke(2, 7, { q: 'Du vet at 7 · 2 = 14. Hva er da <span class="stykke">2 · 7</span>?', hint: 'Snu-regelen! 7 · 2 og 2 · 7 er like mange.' }));
    o.push({ type: 'rekke', q: 'Bygg rekka til <b>5 · 3</b> (5 rekker med 3).', rader: 5, kol: 3, startR: 1, startK: 1 });
    return o;
  }
},
{
  id: 3, del: 1, tittel: 'Hopp på tallinja', kort: 'Like lange hopp – 4 hopp med 5 lander på 20', bilde: 'gangekurs/hopp.webp',
  intro: `<p class="forklaring">Ganging er også <b>like lange hopp</b> på tallinja. Hopper du 4 ganger med 5, lander du på 5, 10, 15, 20. Så <span class="stykke">4 · 5 = 20</span>.</p>
  <p>Når du teller 5, 10, 15, 20 kaller vi det å <b>telle med 5</b>. Å kunne telle med 2, 5 og 10 er superkrefter i ganging – og det er derfor vi begynner med de tabellene.</p>`,
  hender: `Tegn en tallinje fra 0 til 30 på et ark (eller bruk gulvet og tape). Hopp med 3 – si tallene høyt: 3, 6, 9 … Hvor mange hopp til 30? Hopp så med 5: hvor mange hopp?`,
  snakk: `Hva er forskjellen på å telle 1, 2, 3, 4 … og å telle 5, 10, 15, 20? Når er det lurt å telle i hopp?`,
  oppgaver() {
    const o = [];
    o.push({ type: 'tallinje', q: 'Hopp <b>4 ganger med 2</b>.', steg: 2, hopp: 4, figur: '🐸' });
    o.push({ type: 'tallinje', q: 'Hopp <b>3 ganger med 5</b>.', steg: 5, hopp: 3, figur: '🦘' });
    o.push(mcTall('Hvilket gangestykke viser hoppene: 10, 20, 30, 40?', '4 · 10', ['10 · 10', '4 · 4', '10 + 4'], { hint: '4 hopp – hvert hopp er 10.' }));
    o.push({ type: 'tallinje', q: 'Hopp <b>5 ganger med 3</b>.', steg: 3, hopp: 5, figur: '🐰' });
    o.push(inputStykke(6, 5, { q: 'Tell med 5: 5, 10, 15, 20, 25, … Hvor er du etter <b>6 hopp</b>? (6 · 5)', hint: 'Fortsett: 25 og så ett hopp til med 5.' }));
    o.push({ type: 'tallinje', q: 'Hopp <b>3 ganger med 10</b>.', steg: 10, hopp: 3, figur: '🐸' });
    o.push(mcTall('Bølge hopper 2, 4, 6, 8, 10, 12. Hvor mange hopp – og hvor lange?', '6 hopp med 2', ['2 hopp med 6', '12 hopp med 1', '6 hopp med 6'], { hint: 'Tell hvor mange tall Bølge sa. Hvor mye øker det for hvert hopp?' }));
    o.push({ type: 'tallinje', q: 'Hopp <b>4 ganger med 4</b>.', steg: 4, hopp: 4, figur: '🦘' });
    return o;
  }
},
{
  id: 4, del: 1, tittel: 'Mange bilder – samme stykke', kort: 'Grupper, rekker, hopp, pluss og historie – alt er 3 · 4', bilde: 'gangekurs/strategi.webp',
  intro: `<p class="forklaring">Nå kan du fire måter å se ganging på: <b>like grupper</b>, <b>rekker</b>, <b>hopp på tallinja</b> og <b>gjentatt pluss</b> (3 + 3 + 3 + 3). Og så kan du fortelle det som en <b>historie</b>: «Fire barn får tre mynter hver.»</p>
  <p>Den som virkelig skjønner ganging, kan <b>bytte mellom bildene</b>. Er et stykke vanskelig, tegn det på en annen måte!</p>`,
  hender: `Velg et gangestykke (f.eks. 4 · 6). Vis det på tre måter på ett ark: tegn grupper, tegn en rekke, tegn hopp på en tallinje. Skriv en liten historie som passer.`,
  snakk: `Lag en historie til 5 · 2 og en til 2 · 5. Hva er likt og hva er forskjellig i historiene?`,
  oppgaver() {
    const o = [];
    o.push({ type: 'match', q: 'Sett sammen det som viser <b>det samme</b>.', par: [
      { v: '3 · 4', h: '4 + 4 + 4' }, { v: '2 · 6', h: '6 + 6' }, { v: '5 · 2', h: '2 + 2 + 2 + 2 + 2' }, { v: '4 · 3', h: '3 + 3 + 3 + 3' }] });
    o.push({ type: 'match', q: 'Hvilken rekke hører til hvilket gangestykke?', par: [
      { v: '2 · 5', h: miniRekke(2, 5) }, { v: '3 · 3', h: miniRekke(3, 3) }, { v: '4 · 2', h: miniRekke(4, 2) }, { v: '1 · 6', h: miniRekke(1, 6) }] });
    o.push(mcTall('«Stjerne kjøper 5 kjeks til 3 mynter hver.» Hvilket stykke passer?', '5 · 3', ['5 + 3', '3 · 3', '5 · 5'], { hint: '5 kjeks (grupper) med 3 mynter hver.' }));
    o.push({ type: 'match', q: 'Sett sammen historie og gangestykke.', par: [
      { v: '3 bord med 4 elever ved hvert', h: '3 · 4' }, { v: '6 poser med 2 epler i hver', h: '6 · 2' }, { v: '2 uker – 7 dager i hver', h: '2 · 7' }, { v: '5 hender med 5 fingre', h: '5 · 5' }] });
    o.push(mcTall('Hvilke hopp på tallinja viser 3 · 6?', '6, 12, 18', ['3, 6, 9', '6, 9, 12', '3, 6, 18'], { hint: '3 hopp – hvert hopp er 6 langt.' }));
    o.push({ type: 'match', q: 'Hopp, rekke, pluss – finn parene.', par: [
      { v: 'Hopp: 4, 8, 12', h: '3 · 4' }, { v: '5 + 5 + 5 + 5', h: '4 · 5' }, { v: miniRekke(2, 3), h: '2 · 3' }, { v: 'Hopp: 10, 20', h: '2 · 10' }] });
    o.push(mcTall('Hvilken historie passer til 4 · 2?', 'Fire barn får to mynter hver', ['To barn deler fire mynter', 'Fire barn får fire mynter hver', 'Fire barn og to voksne'], { bred: true, hint: '4 grupper (barn) med 2 i hver (mynter).' }));
    return o;
  }
},

/* ---------- DEL 2: SMARTE STRATEGIER ---------- */
{
  id: 5, del: 2, tittel: '2-, 10- og 5-gangen', kort: 'Dobling, tiere og halvparten av tieren', bilde: 'gangekurs/hopp.webp',
  intro: `<p class="forklaring"><b>2-gangen</b> er å <b>doble</b>: 2 · 7 = 7 + 7 = 14. <b>10-gangen</b> er tiere: 10 · 7 er 7 tiere = 70 – sett en 0 bak! <b>5-gangen</b> er <b>halvparten av 10-gangen</b>: 10 · 6 = 60, så 5 · 6 = 30.</p>
  <p>Disse tre tabellene kan du nesten allerede – og de er nøkkelen til alle de andre.</p>`,
  hender: `Tell høyt med 2 mens du klapper, med 5 mens du tramper, med 10 mens du hopper. Legg 10 mynter i én rekke, ta bort halvparten – hvor mange er 5 · 1? Bygg 10 · 4 med mynter og del i to.`,
  snakk: `Hvorfor ender alle svar i 5-gangen på 0 eller 5? Hvorfor er 5 · 8 halvparten av 10 · 8?`,
  oppgaver() {
    const o = [];
    unike(() => rnd(2, 9), 3).forEach(n => o.push(inputStykke(2, n, { hint: `Dobling: ${n} + ${n}.` })));
    unike(() => rnd(2, 9), 2).forEach(n => o.push(inputStykke(10, n, { hint: `${n} tiere. Sett en 0 bak ${n}.` })));
    unike(() => rnd(2, 9), 3).forEach(n => o.push(inputStykke(5, n, { hint: `10 · ${n} = ${10 * n}. Halvparten av ${10 * n}?` })));
    o.push(mcTall('Hva er halvparten av 10 · 8?', '40', ['80', '18', '50'], { hint: '10 · 8 = 80. Halvparten av 80.' }));
    o.push(tekstoppgave(5, rnd(3, 9), HISTORIER[2]));
    return o;
  }
},
{
  id: 6, del: 2, tittel: 'Dobling: 4- og 8-gangen', kort: '4 · 6 er 2 · 6 doblet. 8 · 6 er 4 · 6 doblet.', bilde: 'gangekurs/rekker.webp',
  intro: `<p class="forklaring">Kan du 2-gangen, kan du 4-gangen: <b>doble to ganger</b>. 4 · 6 → 2 · 6 = 12 → dobbelt = <span class="stykke">24</span>.</p>
  <p>Og 8-gangen er 4-gangen doblet: 8 · 6 → 4 · 6 = 24 → dobbelt = <span class="stykke">48</span>. Se på rekka: 2 rekker, 4 rekker, 8 rekker – hver gang blir det dobbelt så mange.</p>
  <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-end;margin-top:.5rem">${rekkeHTML(2, 6)}${rekkeHTML(4, 6)}</div>`,
  hender: `Legg 2 rekker med 7 mynter. Legg 2 rekker til under – nå har du 4 · 7. Hvor mange? Doble igjen om du har nok mynter: 8 · 7.`,
  snakk: `Hva mer kan vi doble oss frem til? (Hint: 3 → 6, og 6 → 12!) Hvorfor er dobling så lett å regne i hodet?`,
  oppgaver() {
    const o = [];
    unike(() => rnd(3, 9), 4).forEach(n => o.push(inputStykke(4, n, { hint: `2 · ${n} = ${2 * n}. Dobbelt opp: ${2 * n} + ${2 * n}.` })));
    o.push(mcTall('Hvilket stykke er det dobbelte av 4 · 7?', '8 · 7', ['4 · 14', '2 · 7', '4 · 8'], { hint: 'Dobbelt så mange rekker – 4 rekker blir 8 rekker.' }));
    unike(() => rnd(3, 9), 3).forEach(n => o.push(inputStykke(8, n, { hint: `4 · ${n} = ${4 * n}. Dobbelt opp: ${4 * n} + ${4 * n}.` })));
    o.push(tekstoppgave(8, rnd(3, 7), HISTORIER[4]));
    return o;
  }
},
{
  id: 7, del: 2, tittel: '3- og 6-gangen', kort: '3 · 7 = dobbelt + én til. 6 · 7 = 3 · 7 doblet.', bilde: 'gangekurs/grupper.webp',
  intro: `<p class="forklaring"><b>3-gangen</b>: doble og legg til én gang til. 3 · 7 → 2 · 7 = 14 → 14 + 7 = <span class="stykke">21</span>.</p>
  <p><b>6-gangen</b> er 3-gangen doblet: 6 · 7 → 3 · 7 = 21 → 21 + 21 = <span class="stykke">42</span>. Og husk snu-regelen: 6 · 4 er det samme som 4 · 6 – som du allerede kan!</p>`,
  hender: `Lag 3 grupper med 8 klosser. Ta de to første gruppene – det er 2 · 8 = 16. Legg til den siste – 16 + 8 = 24. Lag så 3 grupper til: 6 · 8.`,
  snakk: `Hvilken tabell er lettest for deg? Hvilken strategi bruker du? Forklar til en venn hvordan du finner 6 · 8.`,
  oppgaver() {
    const o = [];
    unike(() => rnd(4, 9), 4).forEach(n => o.push(inputStykke(3, n, { hint: `2 · ${n} = ${2 * n}, og ${2 * n} + ${n}.` })));
    o.push(mcTall('6 · 8 er det dobbelte av …', '3 · 8', ['6 · 4', '2 · 8', '6 · 6'], { hint: 'Halvparten av 6 rekker er 3 rekker.' }));
    unike(() => rnd(4, 9), 3).forEach(n => o.push(inputStykke(6, n, { hint: `3 · ${n} = ${3 * n}. Dobbelt: ${3 * n} + ${3 * n}.` })));
    o.push(tekstoppgave(6, rnd(4, 9), HISTORIER[1]));
    return o;
  }
},
{
  id: 8, del: 2, tittel: '9-gangen', kort: '10-gangen minus én: 9 · 7 = 70 − 7', bilde: 'gangekurs/strategi.webp',
  intro: `<p class="forklaring">9 er nesten 10. Så <b>9 · 7 er 10 · 7 minus én sjuer</b>: 70 − 7 = <span class="stykke">63</span>. Se på rekka: 10 rekker med 7, ta bort den siste rekka.</p>
  <p>Sjekk svaret: i 9-gangen blir <b>sifrene alltid 9 til sammen</b> (6 + 3 = 9). Og tieren er alltid én mindre enn tallet du ganger med (9 · 7 → 6-noe).</p>
  ${rekkeHTML(10, 7, { tom: { r: 9, c: 99 } })}`,
  hender: `Hold opp begge hender. Bøy finger nr. 4 fra venstre: fingrene til venstre er tiere (3), til høyre er enere (6) → 9 · 4 = 36. Prøv alle fra 9 · 1 til 9 · 10!`,
  snakk: `Hvorfor virker «10-gangen minus én»? Kan vi bruke samme triks på 8-gangen (10-gangen minus to)?`,
  oppgaver() {
    const o = [];
    unike(() => rnd(3, 10), 5).forEach(n => o.push(inputStykke(9, n, { hint: `10 · ${n} = ${10 * n}. Ta bort ${n}: ${10 * n} − ${n}.` })));
    o.push(mcTall('Hvilket svar kan være riktig i 9-gangen? (Sifrene skal bli 9 til sammen)', '54', ['56', '48', '64'], { hint: '5 + 4 = 9. Sjekk de andre.' }));
    o.push(mcTall('9 · 8 = 10 · 8 − …', '8', ['9', '10', '80'], { hint: 'Vi tar bort én rekke med 8.' }));
    o.push(tekstoppgave(9, rnd(3, 8), HISTORIER[3]));
    return o;
  }
},
{
  id: 9, del: 2, tittel: 'Del opp! 7-gangen og de vanskelige', kort: '7 · 8 = 7 · 5 + 7 · 3. Bruk det du kan.', bilde: 'gangekurs/rekker.webp',
  intro: `<p class="forklaring">Nå er det faktisk bare noen få stykker igjen: 7 · 7, 7 · 8, 6 · 7, 8 · 8 og et par til. For dem bruker vi det kraftigste trikset av alle: <b>del opp</b>.</p>
  <p>7 · 8: del rekka ved 5. Da får du 7 · 5 = 35 og 7 · 3 = 21. Til sammen <span class="stykke">56</span>. Du kan dele hvor du vil – bare velg biter du kan!</p>
  ${rekkeHTML(7, 8, { del: 5 })}`,
  hender: `Legg 6 rekker med 7 mynter. Legg en blyant tvers over så rekka deles i 6 · 5 og 6 · 2. Regn delene, legg sammen. Flytt blyanten og del et annet sted – blir det likt?`,
  snakk: `Hvor mange «helt nye» stykker er det egentlig igjen når du kan 1-, 2-, 5-, 10-gangen og snu-regelen? Tell i tabellen!`,
  oppgaver() {
    const o = [];
    o.push({ type: 'del', q: 'Del opp <span class="stykke">7 · 8</span>', a: 7, b: 8, lov: [2, 3, 5] });
    o.push({ type: 'del', q: 'Del opp <span class="stykke">6 · 7</span>', a: 6, b: 7, lov: [2, 5] });
    o.push({ type: 'del', q: 'Del opp <span class="stykke">7 · 7</span>', a: 7, b: 7, lov: [2, 5] });
    o.push(inputStykke(8, 7, { hint: 'Snu-regelen: 8 · 7 = 7 · 8 – som du nettopp regnet ut!' }));
    o.push({ type: 'del', q: 'Del opp <span class="stykke">8 · 8</span>', a: 8, b: 8, lov: [2, 3, 5] });
    o.push(inputStykke(7, 6, { hint: 'Del opp: 7 · 5 = 35 og 7 · 1 = 7.' }));
    o.push(mcTall('7 · 9 kan deles opp som …', '7 · 5 + 7 · 4', ['7 · 5 + 7 · 5', '7 + 9', '7 · 4 + 7 · 4'], { hint: 'Delene må bli 9 til sammen: 5 + 4.' }));
    o.push(inputStykke(7, 9, { hint: 'Eller: 10 · 7 − 7 = 63 (9-gangen-trikset).' }));
    return o;
  }
},

/* ---------- DEL 3: ØV TIL DU KAN DET ---------- */
{
  id: 10, del: 3, tittel: 'Gangetabellen og gangefamilien', kort: 'Mønstre i tabellen – og deling som «ganging baklengs»', bilde: 'gangekurs/strategi.webp',
  intro: `<p class="forklaring">Her er hele gangetabellen. Se etter mønstre: den gule <b>diagonalen</b> er kvadrattallene (1, 4, 9, 16 …). Speil du tabellen langs diagonalen, er tallene like – det er snu-regelen!</p>
  <p>Og hvert gangestykke har en <b>familie</b>: 3 · 4 = 12, 4 · 3 = 12, 12 : 4 = 3 og 12 : 3 = 4. Deling er ganging baklengs. Kan du 3 · 4, kan du fire stykker.</p>
  <div class="tabell" style="margin-top:.6rem">${(() => { let h = '<div class="hode">×</div>'; for (let c = 1; c <= 10; c++) h += `<div class="hode">${c}</div>`; for (let r = 1; r <= 10; r++) { h += `<div class="hode">${r}</div>`; for (let c = 1; c <= 10; c++) h += `<div class="${r === c ? 'kv' : ''}">${r * c}</div>`; } return h; })()}</div>`,
  hender: `Fargelegg en tom gangetabell: alle svar i 5-gangen blå, alle kvadrattall gule. Sett en ring rundt de stykkene du ennå ikke kan på rams. Hvor mange er det? (Færre enn du tror!)`,
  snakk: `Hvorfor er tallene like på hver side av diagonalen? Hvilke tall i tabellen dukker opp flest ganger? (12? 24?) Hvorfor?`,
  oppgaver() {
    const o = [];
    o.push({ type: 'tabell', q: 'Fyll inn rutene som mangler.', skjul: [[3, 7], [6, 4], [8, 6], [9, 9], [7, 5]] });
    o.push(mcTall('3 · 4 = 12. Hvilket delestykke hører til i familien?', '12 : 4 = 3', ['12 : 2 = 6', '4 : 3 = 1', '12 · 3 = 36'], { hint: 'Familien: 3 · 4, 4 · 3, 12 : 3, 12 : 4.' }));
    o.push({ type: 'input', q: '6 · 7 = 42. Hva er da <span class="stykke">42 : 6</span>?', etikett: '42 : 6 =', svar: 7, hint: 'Hvor mange sekserne går det i 42? Familien til 6 · 7.' });
    o.push({ type: 'tabell', q: 'Fyll inn rutene som mangler.', skjul: [[4, 8], [7, 7], [6, 9], [8, 3], [5, 9], [7, 6]] });
    o.push({ type: 'input', q: 'Drage har 24 mynter og deler likt på 4 venner. Hvor mange får hver?', etikett: '24 : 4 =', svar: 6, hint: '4 · ? = 24. Tenk 4-gangen!' });
    o.push(mcTall('Hvilket tall er et kvadrattall?', '49', ['48', '50', '45'], { hint: 'Kvadrattall er n · n: 7 · 7 = ?' }));
    o.push({ type: 'input', q: '<span class="stykke">56 : 8</span> = ? (Tenk: 8 · ? = 56)', etikett: '56 : 8 =', svar: 7, hint: '8 · 7 = 56, så 56 : 8 = 7.' });
    return o;
  }
},
{
  id: 11, del: 3, tittel: 'Kortstokken', kort: 'Øv litt hver dag til alle kortene er grønne', bilde: 'gangekurs/gangemonster.webp', kortstokk: true,
  intro: `<p class="forklaring">Nå skal stykkene inn i hodet for godt. Kortstokken har alle 55 stykkene i tabellen (snu-regelen fjerner resten). Hvert kort starter grått. Svarer du riktig, blir det gult. Riktig igjen <b>en annen dag</b> – grønt. Svarer du feil, får du strategien og kortet går tilbake.</p>
  <p><b>Øv 5 minutter om gangen, gjerne hver dag.</b> Det virker mye bedre enn én lang økt. Trinnet er ferdig når alle 55 kortene er grønne.</p>`,
  hender: `Lag din egen kortstokk: 20 papirkort med stykket foran og svaret bak. Øv i par: den ene viser kortet, den andre svarer og <b>forklarer strategien</b>. Bytt. Legg kortene du kan i en «kan»-haug.`,
  snakk: `Hvilke stykker er «rare» for deg? Hvilken strategi hjelper på akkurat de? Er det lurt å øve på det du allerede kan?`,
  oppgaver() { return []; }
},
{
  id: 12, del: 3, tittel: 'Bruk det du kan', kort: 'Oppgaver fra Myntland – og stykker utenfor tabellen', bilde: 'gangekurs/diplom.webp',
  intro: `<p class="forklaring">Siste trinn! Nå bruker du ganging til å løse ekte oppgaver fra Myntland – og til stykker <b>utenfor tabellen</b>, som 12 · 5 eller 6 · 11. Trikset er det samme som før: <b>del opp i biter du kan</b>. 12 · 5 = 10 · 5 + 2 · 5 = 50 + 10 = 60.</p>
  <p>Den som klarer dette, er klar for Gangeprøven.</p>`,
  hender: `Lag tre regnefortellinger fra klasserommet ditt der du må gange – med Myntland-mynter, jobber i klassen eller varer i butikken. Bytt oppgaver med en venn og løs hverandres.`,
  snakk: `Hvordan regner du 15 · 4 i hodet? Finnes det flere måter? (10 · 4 + 5 · 4, eller 15 · 2 · 2 …)`,
  oppgaver() {
    const o = [];
    o.push(tekstoppgave(7, 6, HISTORIER[2]));
    o.push(mcTall('Måne skal regne 6 · 12. Hvilken oppdeling er lur?', '6 · 10 + 6 · 2', ['6 · 6 + 6 · 6 + 6', '6 + 12', '6 · 10 − 6 · 2'], { hint: '12 = 10 + 2. Del ved tieren.' }));
    o.push({ type: 'input', q: 'Regn ut <span class="stykke">6 · 12</span> (tips: 6 · 10 + 6 · 2)', etikett: '6 · 12 =', svar: 72, hint: '6 · 10 = 60 og 6 · 2 = 12. 60 + 12 = ?' });
    o.push({ type: 'input', q: 'Regn ut <span class="stykke">12 · 5</span>', etikett: '12 · 5 =', svar: 60, hint: '10 · 5 = 50 og 2 · 5 = 10.' });
    o.push(tekstoppgave(8, 9, HISTORIER[1]));
    o.push({ type: 'input', q: 'Regn ut <span class="stykke">9 · 11</span> (tips: 9 · 10 + 9 · 1)', etikett: '9 · 11 =', svar: 99, hint: '9 · 10 = 90 og 9 · 1 = 9.' });
    o.push(mcTall('Ukelønna i klassen er 25 mynter. Hva har Stjerne tjent etter 4 uker?', '100', ['75', '90', '125'], { hint: '4 · 25 = 2 · 50 (dobling!) eller 4 · 20 + 4 · 5.' }));
    o.push({ type: 'input', q: 'Bølge kjøper 3 varer til 15 mynter. Hva koster det?', etikett: '3 · 15 =', svar: 45, hint: '3 · 10 = 30 og 3 · 5 = 15.' });
    o.push({ type: 'input', q: 'En pizza deles i 8 biter. Hvor mange biter er det i 7 pizzaer?', etikett: '7 · 8 =', svar: 56, hint: hint(7, 8) });
    o.push({ type: 'input', q: '4 elever har 20 mynter hver. Læreren har like mye som alle elevene til sammen. Hvor mye har læreren?', etikett: '4 · 20 =', svar: 80, hint: '4 · 2 = 8, så 4 · 20 = 80 (tiere).' });
    return o;
  }
}
];

/* ============================================================
   KORTSTOKKEN (trinn 11) – spredt henting fra hukommelsen
   55 unike stykker (a ≤ b, 1–10). Boks 0 grå → 1 gul → 2 grønn.
   Gul → grønn krever riktig svar igjen etter minst 3 timer.
   ============================================================ */
const ALLE_KORT = (() => { const k = []; for (let a = 1; a <= 10; a++) for (let b = a; b <= 10; b++) k.push([a, b]); return k; })();
const KORT_VENT = 3 * 60 * 60 * 1000;
function kortNokkel(a, b) { return Math.min(a, b) + 'x' + Math.max(a, b); }
function kortStatus(a, b) { return S.kort[kortNokkel(a, b)] || { b: 0, d: 0 }; }
function kortTelling() {
  const t = [0, 0, 0];
  ALLE_KORT.forEach(([a, b]) => t[kortStatus(a, b).b]++);
  return t;
}
function kortstokkFerdig() { return kortTelling()[2] === ALLE_KORT.length; }

function lagRunde() {
  const na = Date.now();
  const nye = [], modne = [], umodne = [], gronne = [];
  ALLE_KORT.forEach(([a, b]) => {
    const s = kortStatus(a, b);
    if (s.b === 0) nye.push([a, b]);
    else if (s.b === 1) (na - s.d >= KORT_VENT ? modne : umodne).push([a, b]);
    else gronne.push([a, b]);
  });
  // prioriter: modne gule (klare for grønt), så nye, så litt repetisjon
  let runde = stokk(modne).slice(0, 12);
  runde = runde.concat(stokk(nye).slice(0, 20 - runde.length));
  if (runde.length < 20) runde = runde.concat(stokk(umodne).slice(0, 20 - runde.length));
  if (runde.length < 20) runde = runde.concat(stokk(gronne).slice(0, Math.min(6, 20 - runde.length)));
  return stokk(runde).map(([a, b]) => Math.random() < .5 ? [a, b] : [b, a]);
}

function kortTabellHTML() {
  let h = '<div class="tabell"><div class="hode">×</div>';
  for (let c = 1; c <= 10; c++) h += `<div class="hode">${c}</div>`;
  for (let r = 1; r <= 10; r++) {
    h += `<div class="hode">${r}</div>`;
    for (let c = 1; c <= 10; c++) h += `<div class="b${kortStatus(r, c).b}${c < r ? ' dim' : ''}">${r * c}</div>`;
  }
  return h + '</div>';
}

function visKortstokk(mount, tilbake) {
  const t = kortTelling();
  mount.innerHTML = `
    <div class="kortstokk">
      <h2>Kortstokken</h2>
      <div class="status-rad"><span>⬜ Nye: <b>${t[0]}</b></span><span>🟨 Øver: <b>${t[1]}</b></span><span>🟩 Kan: <b>${t[2]}</b></span></div>
      <div class="fremdrift" style="max-width:420px;margin:0 auto .8rem"><div style="width:${Math.round(100 * t[2] / ALLE_KORT.length)}%"></div></div>
      <p class="muted">En runde er 20 kort og tar ca. 5 minutter. Gule kort blir grønne når du svarer riktig igjen senere (etter minst 3 timer – gjerne i morgen).</p>
      <div class="knapperad" style="justify-content:center">
        <button class="knapp gronn" id="ks-start" type="button">Start en runde</button>
        <button class="knapp hvit" id="ks-tabell" type="button">Se tabellen min</button>
        <button class="knapp hvit liten" id="ks-tilbake" type="button">Tilbake</button>
      </div>
      <div id="ks-tabellvis" style="margin-top:1rem;display:none">
        <div class="legende"><span class="l0">Ny</span><span class="l1">Øver</span><span class="l2">Kan</span></div>
        ${kortTabellHTML()}
        <p class="muted" style="font-size:.85rem">Rutene under diagonalen er de samme stykkene snudd – de følger automatisk med.</p>
      </div>
    </div>`;
  $('#ks-tilbake', mount).onclick = tilbake;
  $('#ks-tabell', mount).onclick = () => { const v = $('#ks-tabellvis', mount); v.style.display = v.style.display === 'none' ? 'block' : 'none'; };
  $('#ks-start', mount).onclick = () => kjorRunde(mount, () => visKortstokk(mount, tilbake));
}

function kjorRunde(mount, ferdigCb) {
  const runde = lagRunde();
  let i = 0, riktige = 0, nyeGronne = 0, nyeGule = 0;
  const feilListe = [];
  S.runder++; lagre();
  function neste() {
    if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; }
    if (i >= runde.length) return oppsummer();
    const [a, b] = runde[i];
    const st = kortStatus(a, b);
    mount.innerHTML = `
      <div class="kortstokk">
        <div class="oppg-topp"><span class="teller">Kort ${i + 1} av ${runde.length}</span><div class="fremdrift"><div style="width:${Math.round(100 * i / runde.length)}%"></div></div></div>
        <div class="flashkort">${a} · ${b}</div>
        <div id="ks-inn"></div>
        <div class="tilbakemelding" id="ks-fb"></div>
        <div class="knapperad" id="ks-knapper" style="justify-content:center"></div>
      </div>`;
    const fb = $('#ks-fb', mount), kn = $('#ks-knapper', mount);
    let start = Date.now();
    aktivPanel = tallpanel($('#ks-inn', mount), { etikett: '=', onOk(v) {
      const tid = (Date.now() - start) / 1000;
      const k = kortNokkel(a, b);
      if (v === a * b) {
        riktige++;
        let msg = velg(ROS);
        if (st.b === 0) { S.kort[k] = { b: 1, d: Date.now() }; nyeGule++; msg += ' Kortet er gult – riktig igjen senere, så blir det grønt.'; }
        else if (st.b === 1 && Date.now() - st.d >= KORT_VENT) { S.kort[k] = { b: 2, d: Date.now() }; nyeGronne++; msg += ' 🟩 Kortet er grønt!'; }
        else if (st.b === 1) { msg += ' Fortsatt gult – prøv igjen senere i dag eller i morgen.'; }
        else { S.kort[k] = { b: 2, d: Date.now() }; }
        if (tid > 6 && st.b === 2) msg += ` Det tok litt tid – husk: ${strategiNavn(a, b)}.`;
        lagre();
        fb.className = 'tilbakemelding ok vis'; fb.innerHTML = msg;
        aktivPanel.fjern(); aktivPanel = null;
        i++;
        const bt = document.createElement('button'); bt.className = 'knapp gronn'; bt.type = 'button'; bt.textContent = 'Neste →'; bt.onclick = neste; kn.appendChild(bt); bt.focus();
      } else {
        S.kort[k] = { b: 0, d: 0 }; feilListe.push([a, b]); lagre();
        fb.className = 'tilbakemelding feil vis';
        fb.innerHTML = `${a} · ${b} = <b>${a * b}</b>. <div class="hint">${hint(a, b)}</div><div class="hint">Skriv det riktige svaret for å gå videre.</div>`;
        aktivPanel.fjern();
        aktivPanel = tallpanel($('#ks-inn', mount), { etikett: '=', onOk(v2) {
          if (v2 === a * b) { aktivPanel.fjern(); aktivPanel = null; i++; neste(); }
          else { fb.innerHTML = `Svaret er <b>${a * b}</b>. Skriv ${a * b}.`; }
        } });
      }
    } });
  }
  function oppsummer() {
    const t = kortTelling();
    const ferdig = kortstokkFerdig();
    if (ferdig && !S.ferdig[11]) { S.ferdig[11] = true; lagre(); konfetti(); }
    mount.innerHTML = `
      <div class="kortstokk">
        <h2>${ferdig ? '🎉 Alle kortene er grønne!' : 'Runden er ferdig!'}</h2>
        <div class="status-rad"><span>Riktige: <b>${riktige}/${runde.length}</b></span><span>Nye gule: <b>${nyeGule}</b></span><span>Nye grønne: <b>${nyeGronne}</b></span></div>
        <div class="status-rad"><span>⬜ <b>${t[0]}</b></span><span>🟨 <b>${t[1]}</b></span><span>🟩 <b>${t[2]}</b> av ${ALLE_KORT.length}</span></div>
        ${feilListe.length ? `<div class="boks tips" style="text-align:left"><h3>Øv ekstra på disse</h3><p>${feilListe.map(([a, b]) => `<b>${a} · ${b}</b> (${strategiNavn(a, b)})`).join(' · ')}</p></div>` : ''}
        ${ferdig ? `<p class="stor">Du har alle 55 stykkene i hodet. Trinn 11 er fullført!</p>` : `<p class="muted">Kom tilbake senere i dag eller i morgen – da kan de gule bli grønne.</p>`}
        <div class="knapperad" style="justify-content:center">
          <button class="knapp gronn" id="ks-igjen" type="button">Ny runde</button>
          <button class="knapp hvit" id="ks-ferdig" type="button">Tilbake til kursoversikten</button>
        </div>
      </div>`;
    $('#ks-igjen', mount).onclick = () => kjorRunde(mount, ferdigCb);
    $('#ks-ferdig', mount).onclick = () => { visHjem(); };
  }
  neste();
}

/* ============================================================
   TRINNFLYT
   ============================================================ */
let aktivtTrinn = null;
function trinnLaast(id) { if (id === 1) return false; return !S.ferdig[id - 1]; }

function aapneTrinn(id) {
  const t = TRINN[id - 1]; aktivtTrinn = t;
  visSkjerm('trinn');
  const intro = $('#trinn-intro'); $('#trinn-oppgaver').style.display = 'none'; $('#trinn-ferdig').style.display = 'none'; intro.style.display = 'block';
  intro.innerHTML = `
    <span class="pill" style="display:inline-block;background:var(--lilla-lys);color:var(--lilla);font-weight:900;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;border-radius:999px;padding:.25rem .7rem">Trinn ${t.id} av 12</span>
    <h2 style="margin:.3rem 0 .6rem">${t.tittel}</h2>
    <div id="f-mount"></div>
    <div class="intro-grid">
      <div>${t.intro}</div>
      <img src="${t.bilde}" alt="">
    </div>
    <div class="boks hender"><h3>✋ Gjør det med hendene</h3><p>${t.hender}</p></div>
    <div class="boks snakk"><h3>💬 Snakk sammen</h3><p>${t.snakk}</p></div>
    <div class="knapperad">
      <button class="knapp gronn" id="trinn-start" type="button">${t.kortstokk ? 'Åpne kortstokken' : (S.ferdig[id] ? 'Øv en gang til' : 'Start oppgavene')}</button>
      <button class="knapp hvit" id="trinn-tilbake" type="button">Tilbake</button>
    </div>`;
  lagForklaringsspiller($('#f-mount', intro), id, t.bilde);
  $('#trinn-tilbake').onclick = visHjem;
  $('#trinn-start').onclick = () => {
    stoppForklaring();
    if (t.kortstokk) { intro.style.display = 'none'; const f = $('#trinn-ferdig'); f.style.display = 'block'; visKortstokk(f, () => aapneTrinn(id)); }
    else startOppgaver(t);
  };
}

function startOppgaver(t) {
  const liste = t.oppgaver();
  let i = 0, feil = 0;
  $('#trinn-intro').style.display = 'none'; $('#trinn-ferdig').style.display = 'none';
  const boks = $('#trinn-oppgaver'); boks.style.display = 'block';
  $('#oppg-avbryt').onclick = () => { if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; } aapneTrinn(t.id); };
  function neste() {
    if (i >= liste.length) return ferdig();
    $('#oppg-teller').textContent = `Oppgave ${i + 1} av ${liste.length}`;
    $('#oppg-fremdrift').style.width = Math.round(100 * i / liste.length) + '%';
    kjorOppgave(liste[i], $('#oppg-flate'), $('#oppg-feedback'), $('#oppg-knapper'), (forsteForsok) => { if (!forsteForsok) feil++; i++; neste(); });
  }
  function ferdig() {
    const forste = !S.ferdig[t.id];
    S.ferdig[t.id] = true; S.forsok[t.id] = (S.forsok[t.id] || 0) + 1; lagre();
    boks.style.display = 'none';
    const f = $('#trinn-ferdig'); f.style.display = 'block';
    const neste = TRINN[t.id]; // neste trinn (id+1) eller undefined
    f.innerHTML = `
      <div style="text-align:center">
        <img src="${t.bilde}" alt="" style="width:160px;margin:0 auto .5rem;border-radius:18px">
        <h2>⭐ Trinn ${t.id} fullført!</h2>
        <p class="stor">${feil === 0 ? 'Alt riktig på første forsøk – imponerende!' : `Du løste alle oppgavene. ${feil} måtte du prøve en gang til på – det er sånn man lærer.`}</p>
        <div class="knapperad" style="justify-content:center">
          ${neste ? `<button class="knapp gronn" id="ferdig-neste" type="button">Neste: ${neste.tittel} →</button>` : `<button class="knapp lilla" id="ferdig-prove" type="button">Til Gangeprøven</button>`}
          <button class="knapp hvit" id="ferdig-hjem" type="button">Kursoversikt</button>
        </div>
      </div>`;
    if (forste) konfetti(60);
    $('#ferdig-hjem').onclick = visHjem;
    if (neste) $('#ferdig-neste').onclick = () => aapneTrinn(neste.id);
    else $('#ferdig-prove').onclick = () => { visHjem(); };
  }
  neste();
}

/* ============================================================
   HJEM
   ============================================================ */
function alleTrinnFerdig() { return TRINN.every(t => S.ferdig[t.id]); }
function visHjem() {
  visSkjerm('hjem');
  $('#hjem-hilsen').textContent = S.navn ? `Hei, ${S.navn}! ` + (S.sert ? 'Du har sertifikatet – men du kan alltid øve mer.' : `Du har fullført ${Object.keys(S.ferdig).length} av 12 trinn.`) : '';
  $('#hjem-start').textContent = S.navn ? (Object.keys(S.ferdig).length ? 'Fortsett kurset' : 'Start kurset') : 'Start kurset';
  $('#hjem-fremdrift').style.width = Math.round(100 * Object.keys(S.ferdig).length / 12) + '%';
  [1, 2, 3].forEach(del => {
    const m = $('#trapp-del' + del); m.innerHTML = '';
    TRINN.filter(t => t.del === del).forEach(t => {
      const b = document.createElement('button'); b.type = 'button';
      const laast = trinnLaast(t.id), ferdig = !!S.ferdig[t.id];
      b.className = 'trinn' + (ferdig ? ' ferdig' : '') + (laast ? ' laast' : '');
      b.disabled = laast;
      let ekstra = '';
      if (t.kortstokk) { const k = kortTelling(); ekstra = ` · 🟩 ${k[2]}/55`; }
      b.innerHTML = `<span class="tnr">${t.id}</span><div class="ttittel">${t.tittel}</div><div class="tdesc">${t.kort}${ekstra}</div><span class="tstatus">${ferdig ? '✅' : laast ? '🔒' : ''}</span>`;
      b.onclick = () => { if (!S.navn) { sporNavn(() => aapneTrinn(t.id)); return; } aapneTrinn(t.id); };
      m.appendChild(b);
    });
  });
  const klar = alleTrinnFerdig();
  $('#prove-start').disabled = !klar;
  $('#provekort-tekst').innerHTML = klar
    ? 'Alle trinnene er fullført! Gangeprøven har tre deler: <b>forståelse</b>, <b>strategier</b> og <b>tabellene</b>. Du kan ta den så mange ganger du vil.'
    : `Fullfør alle 12 trinnene for å låse opp Gangeprøven (${Object.keys(S.ferdig).length}/12 ferdig). Består du, får du gangesertifikatet med navnet ditt på.`;
  $('#diplomkort').style.display = S.sert ? 'block' : 'none';
  if (S.sert) $('#diplomkort-tekst').textContent = `Bestått ${S.sert.dato}. Skriv det ut og heng det opp!`;
}
function sporNavn(cb) {
  const m = $('#navn-modal'); m.classList.add('vis');
  const inp = $('#navn-input'); inp.value = S.navn || ''; setTimeout(() => inp.focus(), 50);
  const ok = () => { const v = inp.value.trim().slice(0, 24); if (!v) { inp.focus(); return; } S.navn = v; lagre(); m.classList.remove('vis'); cb && cb(); };
  $('#navn-ok').onclick = ok;
  inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
}

/* ============================================================
   GANGEPRØVEN
   ============================================================ */
const VANSKELIGE = [[6, 7], [7, 8], [6, 8], [7, 9], [8, 9], [6, 9], [4, 7], [4, 8], [3, 7], [3, 8], [7, 7], [8, 8], [6, 6], [9, 9]];
function lagProve() {
  const A = [
    mcTall('Hvilket gangestykke passer til bildet?', '3 · 5', stykkeAlt(3, 5), { visual: grupperHTML(3, 5, '🪙') }),
    mcTall('4 · 7 = 28. Hvilket stykke gir like mange?', '7 · 4', ['4 · 8', '7 · 7', '4 + 7']),
    { type: 'input', q: 'Hvor mange mynter er det i rekka?', visual: rekkeMedEtiketter(6, 4), etikett: '6 · 4 =', svar: 24 },
    mcTall('«Måne får 6 mynter om dagen i 5 dager.» Hvilket stykke passer?', '5 · 6', ['5 + 6', '6 · 6', '5 · 5'], { bred: true }),
    mcTall('7 · 6 = 7 · 5 + …', '7 · 1', ['7 · 6', '6 · 1', '7 + 1']),
    { type: 'input', q: '5 · 8 = 40. Hva er da <span class="stykke">40 : 5</span>?', etikett: '40 : 5 =', svar: 8 },
  ];
  const B = [
    { type: 'input', q: 'Regn ut <span class="stykke">9 · 12</span> – del opp i biter du kan.', etikett: '9 · 12 =', svar: 108 },
    { type: 'input', q: 'Regn ut <span class="stykke">4 · 25</span>', etikett: '4 · 25 =', svar: 100 },
    { type: 'input', q: 'Regn ut <span class="stykke">6 · 11</span>', etikett: '6 · 11 =', svar: 66 },
    { type: 'input', q: 'Regn ut <span class="stykke">3 · 20</span>', etikett: '3 · 20 =', svar: 60 },
    { type: 'input', q: 'Stjerne kjøper 7 varer til 12 mynter. Hva koster det?', etikett: '7 · 12 =', svar: 84 },
  ];
  const brukt = new Set(VANSKELIGE.map(p => p.join('x')));
  const andre = unike(() => { const a = rnd(2, 10), b = rnd(2, 10); return [Math.min(a, b), Math.max(a, b)]; }, 40, p => p.join('x')).filter(p => !brukt.has(p.join('x'))).slice(0, 16);
  const C = stokk(VANSKELIGE.concat(andre)).map(([a, b]) => { if (Math.random() < .5) [a, b] = [b, a]; return { type: 'input', q: `<span class="stykke">${a} · ${b}</span>`, etikett: '=', svar: a * b }; });
  return { A, B, C };
}
const PROVE_KRAV = { A: [5, 6], B: [4, 5], C: [28, 30] };

function startProve() {
  if (!alleTrinnFerdig()) return;
  const p = lagProve();
  const deler = [
    { n: 'A', navn: 'Forståelse', liste: p.A, info: 'Vis at du skjønner hva ganging er: grupper, rekker, snu-regelen, del opp og gangefamilien.' },
    { n: 'B', navn: 'Strategier', liste: p.B, info: 'Stykker utenfor tabellen. Bruk trikset «del opp» – du får ingen hint her.' },
    { n: 'C', navn: 'Tabellene', liste: p.C, info: '30 stykker fra tabellen. Ta den tiden du trenger – det er ikke om kapp.' },
  ];
  const res = { A: 0, B: 0, C: 0, tid: [] };
  let d = 0, i = 0;
  visSkjerm('prove');
  const flate = $('#prove-flate');
  function visDelIntro() {
    const del = deler[d];
    flate.innerHTML = `
      <span class="prove-del">Del ${del.n} av 3</span>
      <h2 style="margin:.3rem 0">${del.navn}</h2>
      <p class="stor">${del.info}</p>
      <p class="muted">${del.liste.length} oppgaver. Ett forsøk per oppgave. Du må ha minst ${PROVE_KRAV[del.n][0]} riktige.</p>
      <div class="knapperad"><button class="knapp gronn" id="pd-start" type="button">Start del ${del.n}</button><button class="knapp hvit" id="pd-avbryt" type="button">Avbryt prøven</button></div>`;
    $('#pd-start').onclick = () => { i = 0; visOppgave(); };
    $('#pd-avbryt').onclick = () => { if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; } visHjem(); };
  }
  function visOppgave() {
    const del = deler[d];
    if (i >= del.liste.length) { d++; if (d >= deler.length) return resultat(); return visDelIntro(); }
    flate.innerHTML = `
      <div class="oppg-topp"><span class="teller">Del ${del.n} · ${i + 1} av ${del.liste.length}</span><div class="fremdrift"><div style="width:${Math.round(100 * i / del.liste.length)}%"></div></div></div>
      <div id="pv-flate"></div><div class="tilbakemelding" id="pv-fb"></div><div class="knapperad" id="pv-kn"></div>`;
    const start = Date.now();
    kjorProveOppgave(del.liste[i], $('#pv-flate'), $('#pv-fb'), $('#pv-kn'), riktig => {
      if (riktig) res[del.n]++;
      if (del.n === 'C') res.tid.push((Date.now() - start) / 1000);
      i++; visOppgave();
    });
  }
  function resultat() {
    const best = ['A', 'B', 'C'].every(k => res[k] >= PROVE_KRAV[k][0]);
    const snitt = res.tid.length ? (res.tid.reduce((a, b) => a + b, 0) / res.tid.length) : 0;
    const dato = new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
    S.prove = { A: res.A, B: res.B, C: res.C, snitt: Math.round(snitt * 10) / 10, dato, best };
    if (best) { S.sert = { navn: S.navn, dato, A: res.A, B: res.B, C: res.C, snitt: S.prove.snitt }; konfetti(160); }
    lagre();
    const rad = (k, navn) => `<li class="${res[k] >= PROVE_KRAV[k][0] ? 'bestatt' : 'ikke'}"><span>Del ${k} – ${navn}</span><span>${res[k]} / ${PROVE_KRAV[k][1]} ${res[k] >= PROVE_KRAV[k][0] ? '✅' : '↺'}</span></li>`;
    const tips = [];
    if (res.A < PROVE_KRAV.A[0]) tips.push('Del A: gå tilbake til trinn 1–4 og 10 (grupper, rekker, snu-regelen, gangefamilien).');
    if (res.B < PROVE_KRAV.B[0]) tips.push('Del B: øv på «del opp» i trinn 9 og 12.');
    if (res.C < PROVE_KRAV.C[0]) tips.push('Del C: ta noen runder til i kortstokken (trinn 11).');
    flate.innerHTML = `
      <h2>${best ? '🎓 Bestått! Du er gangemester!' : 'Nesten – øv litt til!'}</h2>
      <ul class="resultat-liste">${rad('A', 'Forståelse')}${rad('B', 'Strategier')}${rad('C', 'Tabellene')}</ul>
      ${best ? `<p class="stor">Gratulerer, ${esc(S.navn)}! Du har vist at du både forstår ganging og kan tabellene. Sertifikatet ditt er klart.</p>` : `<div class="boks tips"><h3>Hva nå?</h3><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul><p>Du kan ta prøven igjen når du vil – det er ingen begrensning.</p></div>`}
      <div class="knapperad">
        ${best ? `<button class="knapp gronn" id="pr-diplom" type="button">Vis sertifikatet</button>` : `<button class="knapp gronn" id="pr-igjen" type="button">Ta prøven igjen</button>`}
        <button class="knapp hvit" id="pr-hjem" type="button">Kursoversikt</button>
      </div>`;
    $('#pr-hjem').onclick = visHjem;
    if (best) $('#pr-diplom').onclick = visDiplom; else $('#pr-igjen').onclick = startProve;
  }
  visDelIntro();
}

/* prøveoppgave: ett forsøk, viser riktig svar ved feil */
function kjorProveOppgave(t, flate, feedback, knapper, ferdig) {
  flate.innerHTML = ''; feedback.className = 'tilbakemelding'; feedback.innerHTML = ''; knapper.innerHTML = '';
  if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; }
  const sp = document.createElement('div'); sp.className = 'oppg-sporsmal'; sp.innerHTML = t.q; flate.appendChild(sp);
  if (t.visual) { const v = document.createElement('div'); v.className = 'oppg-visual'; v.innerHTML = t.visual; flate.appendChild(v); }
  const inn = document.createElement('div'); flate.appendChild(inn);
  function avslutt(riktig, fasit) {
    if (aktivPanel) { aktivPanel.fjern(); aktivPanel = null; }
    feedback.className = 'tilbakemelding ' + (riktig ? 'ok' : 'feil') + ' vis';
    feedback.innerHTML = riktig ? velg(ROS) : `Riktig svar: <b>${fasit}</b>`;
    const b = document.createElement('button'); b.className = 'knapp gronn'; b.type = 'button'; b.textContent = 'Neste →'; b.onclick = () => ferdig(riktig); knapper.appendChild(b); b.focus();
  }
  if (t.type === 'input') {
    aktivPanel = tallpanel(inn, { etikett: t.etikett || '', onOk(v) { avslutt(v === t.svar, t.svar); } });
  } else {
    const boks = document.createElement('div'); boks.className = 'valg' + (t.bred ? ' bred' : '');
    const fasit = t.alt.find(a => a.ok).t;
    stokk(t.alt).forEach(a => {
      const b = document.createElement('button'); b.type = 'button'; b.innerHTML = a.t;
      b.onclick = () => { $$('button', boks).forEach(x => x.disabled = true); b.classList.add(a.ok ? 'riktig' : 'galt'); avslutt(a.ok, fasit); };
      boks.appendChild(b);
    });
    inn.appendChild(boks);
  }
}

/* ============================================================
   DIPLOM
   ============================================================ */
function visDiplom() {
  if (!S.sert) return;
  visSkjerm('diplom');
  const s = S.sert;
  $('#diplom').innerHTML = `
    <div class="under">Myntland · Gangekurset</div>
    <div class="tittel">Gangesertifikat</div>
    <img src="gangekurs/diplom.webp" alt="">
    <div class="under">tildeles</div>
    <div class="navn">${esc(s.navn)}</div>
    <p class="tekst">som har fullført Myntlands gangekurs og bestått Gangeprøven. ${esc(s.navn)} forstår multiplikasjon som like grupper, rekker og hopp på tallinja, bruker smarte strategier for å finne svar – også utenfor tabellen – og kan gangetabellene fra 1 til 10.</p>
    <div class="kan"><span>Like grupper og rekker</span><span>Snu-regelen</span><span>Dobling</span><span>10-gangen minus én</span><span>Del opp</span><span>Gangefamilien</span><span>Tabellene 1–10</span></div>
    <div class="dato">Bestått ${esc(s.dato)}</div>
    <div class="signatur"><div>Lærer</div><div>Gangemesteren i Myntland</div></div>
    <div class="logo">🪙 myntland.no/gangekurs.html</div>`;
}

/* ============================================================
   FOR LÆREREN
   ============================================================ */
function visLaerer() {
  visSkjerm('laerer');
  const k = kortTelling();
  $('#laerer-innhold').innerHTML = `
    <h2>Gangekurset – for læreren</h2>
    <p class="stor">Et komplett kurs i multiplikasjon for 3.–5. trinn: fra forståelse via strategier til automatisering – og til slutt en prøve og et sertifikat. Bygget på det forskningen er mest enig om, og laget for aktiv læring: elevene bygger, hopper, deler opp og forklarer – ikke bare svarer.</p>

    <h3>Slik er kurset bygd opp</h3>
    <table>
      <tr><th>Del</th><th>Trinn</th><th>Hva eleven gjør</th><th>Kobling til LK20 (matematikk)</th></tr>
      <tr><td rowspan="4"><b>1. Forståelse</b><br><small>Konkret → bilde → symbol</small></td><td>1 Like grupper</td><td>Bygger grupper på tallerkener, skriver gangestykket</td><td rowspan="4">3. trinn: «utforske multiplikasjon ved telling», «representere multiplikasjon på ulike måter og oversette mellom representasjonene», «bruke kommutativ, assosiativ og distributiv egenskap til å utforske og beskrive strategier i multiplikasjon»</td></tr>
      <tr><td>2 Rekker</td><td>Bygger arrays, oppdager snu-regelen (kommutativ lov)</td></tr>
      <tr><td>3 Tallinja</td><td>Hopper med like lange hopp, telling med 2, 5 og 10</td></tr>
      <tr><td>4 Mange bilder</td><td>Kobler grupper, rekker, hopp, gjentatt addisjon og historier</td></tr>
      <tr><td rowspan="5"><b>2. Strategier</b><br><small>Tabellene i «lett-først»-rekkefølge</small></td><td>5 · 2, 10, 5</td><td>Dobling, tiere, halvparten av tieren</td><td rowspan="5">3.–4. trinn: strategier i multiplikasjon, sammenhengen mellom regneartene, «utforske og forklare» – ikke bare regne</td></tr>
      <tr><td>6 · 4, 8</td><td>Doble to ganger, doble 4-gangen</td></tr>
      <tr><td>7 · 3, 6</td><td>Dobbelt + én til, doble 3-gangen</td></tr>
      <tr><td>8 · 9</td><td>10-gangen minus én, siffersum 9, fingertrikset</td></tr>
      <tr><td>9 Del opp</td><td>Distributiv lov på rekker: 7 · 8 = 7 · 5 + 7 · 3</td></tr>
      <tr><td rowspan="3"><b>3. Automatisering</b><br><small>Henting fra hukommelsen, spredt over dager</small></td><td>10 Tabellen</td><td>Mønstre, kvadrattall, gangefamilien (deling)</td><td rowspan="3">4. trinn: divisjon i praktiske situasjoner, «utforske og forklare sammenhenger mellom de fire regneartene»</td></tr>
      <tr><td>11 Kortstokken</td><td>55 kort i tre bokser – grønt krever riktig svar to ganger med minst 3 timers mellomrom</td></tr>
      <tr><td>12 Bruk det</td><td>Myntland-oppgaver og stykker utenfor tabellen (6 · 12, 4 · 25)</td></tr>
    </table>

    <h3>Hvorfor akkurat sånn? Det forskningen sier</h3>
    <ul>
      <li><b>Forståelse før pugging.</b> Elever som først møter multiplikasjon som like grupper, rekker og hopp (den såkalte konkret–representasjon–abstrakt-sekvensen) husker faktaene bedre og kan bruke dem på nye problemer. Å kunne oversette mellom representasjonene er dessuten et eget kompetansemål etter 3. trinn.</li>
      <li><b>Egenskapene halverer jobben.</b> Kommutativ lov (snu-regelen) gjør 100 fakta til 55. Distributiv lov («del opp») gjør de siste vanskelige stykkene til summer av lette. Elever som kan avlede ukjente fakta fra kjente, står ikke fast – heller ikke utenfor tabellen.</li>
      <li><b>Strategirekkefølge, ikke tallrekkefølge.</b> 2-, 10- og 5-gangen bygger på telling og dobling barna alt kan. 4 og 8 er dobling av 2 og 4; 3 er dobling pluss én; 6 er dobling av 3; 9 er ti minus én. Da gjenstår bare en håndfull stykker som må «deles opp». Slik unngår vi at 7-gangen blir en mur.</li>
      <li><b>Henting fra hukommelsen slår gjentakelse.</b> Å måtte hente svaret selv (kortstokk) gir bedre langtidshukommelse enn å lese eller ramse tabellen i kor – og øving fordelt over flere dager slår én lang økt. Derfor krever kortstokken riktig svar to ganger med minst tre timers mellomrom, og derfor anbefaler vi 5 minutter daglig.</li>
      <li><b>Tempo uten stress.</b> Tidspress skaper matteangst hos mange elever og blokkerer arbeidsminnet. Kurset måler derfor ingen synlig tid, og Gangeprøven er ikke «om kapp». Automatisering kommer likevel – gjennom mange korte, trygge hentinger.</li>
      <li><b>Feil er læringsstoff.</b> I trinnene får eleven strategien vist ved feil og prøver igjen til det sitter (mestring, ikke poeng). I prøven er det ett forsøk per oppgave, slik at resultatet faktisk sier noe.</li>
    </ul>

    <h3>Aktiv læring i klasserommet – forslag til et 6-ukers løp</h3>
    <table>
      <tr><th>Uke</th><th>Trinn</th><th>Felles aktivitet (15–20 min)</th><th>Digitalt (10–15 min)</th></tr>
      <tr><td>1</td><td>1–2</td><td>Mynt-arrays på pulten: bygg, snu, skriv stykket. «Hvor nær 100?»: to og to kaster terninger og tegner rekker på et 10×10-rutenett.</td><td>Trinn 1 og 2 alene eller i par</td></tr>
      <tr><td>2</td><td>3–4</td><td>Tallinje på gulvet med tape – hopp og tell høyt. «Representasjonsmesse»: hver elev viser ett stykke på fire måter på en plakat.</td><td>Trinn 3 og 4</td></tr>
      <tr><td>3</td><td>5–6</td><td>Number talk: «Hvordan tenkte du på 4 · 7?» – samle strategier på tavla. Doblingsstafett.</td><td>Trinn 5 og 6, start kortstokk 5 min/dag</td></tr>
      <tr><td>4</td><td>7–8</td><td>Fingertrikset for 9-gangen. «Pepperoni-pizza»: terning 1 = antall pizzaer, terning 2 = pepperoni per pizza – tegn og skriv stykket.</td><td>Trinn 7 og 8, kortstokk daglig</td></tr>
      <tr><td>5</td><td>9–10</td><td>Del-opp med blyant tvers over rekka. Fargelegg tabellen: finn kvadrattall og speilingen. Gangefamilie-kort (4 kort per familie).</td><td>Trinn 9 og 10, kortstokk daglig</td></tr>
      <tr><td>6</td><td>11–12</td><td>Elevene lager egne Myntland-regnefortellinger og bytter. Par-kortstokk med papirkort der den som svarer også forklarer strategien.</td><td>Trinn 12, Gangeprøven, sertifikat</td></tr>
    </table>
    <p class="muted">Kurset trenger ikke følge kalenderen slavisk – trinnene låses opp i rekkefølge, og elever som er ferdige kan alltid gå tilbake og «øve en gang til».</p>

    <h3>Gangeprøven og sertifikatet</h3>
    <p>Prøven låses opp når alle 12 trinn er fullført (kortstokken må være helt grønn). Tre deler med ett forsøk per oppgave: <b>A Forståelse</b> (6 oppgaver, krav 5), <b>B Strategier</b> utenfor tabellen (5 oppgaver, krav 4) og <b>C Tabellene</b> (30 stykker der de 14 vanskeligste alltid er med, krav 28). Ingen synlig tid. Bestått gir et utskriftsklart sertifikat med elevens kallenavn og dato; prøven kan tas på nytt ubegrenset.</p>
    ${S.prove ? `<div class="boks tips"><h3>Siste prøve på denne enheten</h3><p>${esc(S.navn)} – ${S.prove.dato}: A ${S.prove.A}/6 · B ${S.prove.B}/5 · C ${S.prove.C}/30 · gjennomsnitt ${S.prove.snitt} s per stykke i del C · ${S.prove.best ? 'bestått ✅' : 'ikke bestått'}</p></div>` : ''}

    <h3>Elevens status på denne enheten</h3>
    <p>${S.navn ? `<b>${esc(S.navn)}</b> – ${Object.keys(S.ferdig).length}/12 trinn fullført · kortstokk: ⬜ ${k[0]} · 🟨 ${k[1]} · 🟩 ${k[2]} av 55 · ${S.runder} runder` : 'Ingen elev har startet på denne enheten ennå.'}</p>
    <details><summary>Vis kortstokk-tabellen</summary><div class="legende" style="margin-top:.5rem"><span class="l0">Ny</span><span class="l1">Øver</span><span class="l2">Kan</span></div>${kortTabellHTML()}</details>

    <h3>Personvern og lagring</h3>
    <p>Kurset bruker ingen innlogging og sender ingenting til skyen. All fremdrift lagres lokalt i nettleseren på enheten (localStorage). Bruk kallenavnet fra Myntland – ikke ekte navn. Bytter eleven enhet, starter kurset på nytt der. Skal flere elever dele én iPad, bør hver elev ha sin egen nettleserprofil – eller nullstill mellom elevene.</p>
    <div class="knapperad"><button class="knapp hvit liten" id="la-nullstill" type="button">Nullstill fremdriften på denne enheten</button><button class="knapp gronn" id="la-hjem" type="button">Til kurset</button></div>

    <h3>Kilder</h3>
    <ul>
      <li>Udir: <a href="https://www.udir.no/lk20/mat01-05/kompetansemaal-og-vurdering/kv22" target="_blank" rel="noopener">Kompetansemål etter 3. trinn</a> og <a href="https://www.udir.no/lk20/mat01-05/kompetansemaal-og-vurdering/kv18" target="_blank" rel="noopener">etter 4. trinn</a> (MAT01-05).</li>
      <li>Boaler, J. (2015). <a href="https://www.youcubed.org/evidence/fluency-without-fear/" target="_blank" rel="noopener">Fluency Without Fear</a>, youcubed/Stanford – tallforståelse, number talks, «Hvor nær 100?», «Pepperoni-pizza», og hvorfor tidspress skader.</li>
      <li>Milton, Flores m.fl. (2019). <a href="https://journals.sagepub.com/doi/10.1177/0731948718790089" target="_blank" rel="noopener">Using the Concrete–Representational–Abstract Sequence to Teach Conceptual Understanding of Basic Multiplication and Division</a>, Learning Disability Quarterly.</li>
      <li>Ophuis-Cox m.fl. (2023). <a href="https://onlinelibrary.wiley.com/doi/10.1002/acp.4141" target="_blank" rel="noopener">The effect of retrieval practice on fluently retrieving multiplication facts in an authentic elementary school setting</a>, Applied Cognitive Psychology – kortstokk slår korlesing (omtalt i <a href="https://hechingerreport.org/proof-points-flashcards-prevail-over-repetition-in-memorizing-multiplication-tables/" target="_blank" rel="noopener">Hechinger Report</a>).</li>
      <li>Chartered College of Teaching: <a href="https://my.chartered.college/impact_article/learning-using-and-applying-multiplication-facts-insights-from-research/" target="_blank" rel="noopener">Learning, using and applying multiplication facts: insights from research</a> – avledede fakta og strategirekkefølge.</li>
      <li>Evidence Based Education: <a href="https://evidencebased.education/resource/retrieval-and-spaced-practice-study-strategies-that-must-be-combined/" target="_blank" rel="noopener">Retrieval and spaced practice – strategies that must be combined</a>.</li>
      <li>Matematikksenteret: <a href="https://www.matematikksenteret.no/sites/default/files/attachments/page/Barns%20strategier%20i%20arbeid%20med%20tall.pdf" target="_blank" rel="noopener">Barns strategier i arbeid med tall</a> (Svingen).</li>
    </ul>`;
  $('#la-hjem').onclick = visHjem;
  $('#la-nullstill').onclick = () => {
    if (!confirm('Slette all fremdrift, kortstokk og sertifikat på denne enheten?')) return;
    Object.assign(S, nyTilstand()); lagre(); visHjem();
  };
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  $('#nav-hjem').onclick = visHjem;
  $('#nav-laerer').onclick = visLaerer;
  $('#hjem-start').onclick = () => {
    const gaa = () => { const neste = TRINN.find(t => !S.ferdig[t.id]) || TRINN[0]; aapneTrinn(neste.id); };
    if (!S.navn) sporNavn(gaa); else gaa();
  };
  $('#hjem-navn').onclick = () => sporNavn(visHjem);
  $('#prove-start').onclick = () => { if (!S.navn) sporNavn(startProve); else startProve(); };
  $('#diplom-vis').onclick = visDiplom;
  $('#diplom-print').onclick = () => window.print();
  $('#diplom-tilbake').onclick = visHjem;
  visHjem();
}
document.addEventListener('DOMContentLoaded', init);

})();
