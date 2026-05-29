/* ============================================================
   MYNTLAND – MYNTSTIGEN (stigespill)
   Frittstående brettspill for 2–4 spillere, iPad-optimalisert.
   Mynter samles i spillet; ved spillslutt skanner hver spiller
   kortet + PIN for å sette inn på sin ekte Myntland-konto.
   Firebase-integrasjonen gjenbruker Myntjaktens flyt og leser
   samme av/på + dagstak (settings/myntjakten14|57).
   ============================================================ */
'use strict';

// Felles mynt-ikon: eget bilde i stedet for 🪙-emojien (den tegnes
// ulikt paa iOS/Android/Windows - av og til som en soelvmynt med oern).
const COIN_IMG = 'mynt.webp';
const COIN_TAG = '<img class="myntico" src="' + COIN_IMG + '" alt="mynt">';
function coin(s) { return String(s).replace(/🪙/g, COIN_TAG); }
function setText(el, str) { if (el) el.innerHTML = coin(escapeHtml(str)); }

/* ───────────────────────────────────────────────────────────
   FIREBASE-HJELPERE (samme mønster som Myntjakten)
   ─────────────────────────────────────────────────────────── */
const STUDENT_NODES = ['students14', 'students57'];

function waitForFirebase(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window._fbReady) return resolve();
    const t = setTimeout(() => {
      window.removeEventListener('firebase-ready', h);
      reject(new Error('Firebase tok for lang tid å starte'));
    }, timeoutMs);
    function h() { clearTimeout(t); resolve(); }
    window.addEventListener('firebase-ready', h, { once: true });
  });
}
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Tidsavbrudd: ' + (label || 'oppslag'))), ms))
  ]);
}

// Slå opp elev fra kort-QR (JSON {type:'login',fbKey} eller ren fbKey)
async function lookupStudentFromQR(qrText) {
  await waitForFirebase();
  let fbKey = null;
  try {
    const parsed = JSON.parse(qrText);
    if (parsed && parsed.fbKey) fbKey = parsed.fbKey;
  } catch (e) { /* ikke JSON */ }
  if (!fbKey) fbKey = (qrText || '').trim();
  if (!fbKey) return null;

  for (const node of STUDENT_NODES) {
    try {
      const snap = await withTimeout(
        window._get(window._ref(window._db, node + '/' + fbKey)),
        4000, 'oppslag i ' + node
      );
      const data = snap.val();
      if (data) {
        const name = data.firstname || data.name || 'Elev';
        return { id: fbKey, name, node };
      }
    } catch (e) {
      console.error('[Myntstigen] Feil ved oppslag i ' + node + ':', e);
      throw e;
    }
  }
  return null;
}

// Verifiser PIN (klartekst-sammenligning, som lærerportalen lagrer den)
async function verifyPin(student, pin) {
  await waitForFirebase();
  const snap = await window._get(
    window._ref(window._db, student.node + '/' + student.id + '/pin')
  );
  const stored = snap.val();
  if (stored === null || stored === undefined) return false;
  return String(stored) === String(pin);
}

// Sett inn mynter: oppdater saldo (transaksjon) + logg + dagsteller
async function depositCoins(student, amount) {
  await waitForFirebase();
  const balanceRef = window._ref(window._db, student.node + '/' + student.id + '/balance');
  const result = await window._runTransaction(balanceRef, (current) => (current || 0) + amount);
  if (!result.committed) throw new Error('Transaksjonen ble avbrutt');
  const newBalance = result.snapshot.val();

  const txNode = student.node.replace('students', 'transactions');
  try {
    await window._set(
      window._push(window._ref(window._db, txNode + '/' + student.id)),
      { type: 'income', icon: '🎲', desc: 'Myntstigen – stigespill', amount: amount, ts: Date.now() }
    );
  } catch (e) { console.warn('[Myntstigen] Kunne ikke logge transaksjonen:', e); }

  try {
    const earnedSoFar = await loadEarnedToday(student);
    await recordEarnedToday(student, earnedSoFar + amount);
  } catch (e) { console.warn('[Myntstigen] Kunne ikke oppdatere dagens opptjening:', e); }

  return newBalance;
}

/* ── Policy: deler Myntjakten-bryteren (av/på + dagstak) ────── */
function policyKeyForStudent(student) {
  if (!student || !student.node) return null;
  if (student.node.endsWith('14')) return 'myntjakten14';
  if (student.node.endsWith('57')) return 'myntjakten57';
  return null;
}
async function loadMyntjaktenPolicy(student) {
  const key = policyKeyForStudent(student);
  if (!key) return { enabled: true, dailyMax: 0 };
  try {
    const snap = await window._get(window._ref(window._db, 'settings/' + key));
    const val = snap.val();
    if (!val) return { enabled: true, dailyMax: 0 };
    return { enabled: val.enabled !== false, dailyMax: parseInt(val.dailyMax) || 0 };
  } catch (e) {
    console.warn('[Myntstigen] Kunne ikke laste policy:', e);
    return { enabled: true, dailyMax: 0 };
  }
}
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
async function loadEarnedToday(student) {
  try {
    const snap = await window._get(window._ref(window._db, student.node + '/' + student.id + '/myntjaktenToday'));
    const val = snap.val();
    if (!val || val.date !== todayKey()) return 0;
    return parseInt(val.earned) || 0;
  } catch (e) { return 0; }
}
async function recordEarnedToday(student, totalEarnedToday) {
  try {
    await window._update(
      window._ref(window._db, student.node + '/' + student.id),
      { myntjaktenToday: { date: todayKey(), earned: totalEarnedToday } }
    );
  } catch (e) { console.warn('[Myntstigen] Kunne ikke logge dagens opptjening:', e); }
}
async function applyPolicyToAmount(student, requestedAmount) {
  const policy = await loadMyntjaktenPolicy(student);
  if (!policy.enabled) {
    return { allowed: false, amount: 0, reason: 'Læreren har slått av myntopptjening akkurat nå. Myntene går ikke inn på kontoen i dag — men dere fikk spilt!' };
  }
  if (policy.dailyMax > 0) {
    const earned = await loadEarnedToday(student);
    const remaining = policy.dailyMax - earned;
    if (remaining <= 0) {
      return { allowed: false, amount: 0, reason: 'Dagstaket er nådd (' + earned + ' 🪙 i dag). Kom tilbake i morgen for flere mynter!' };
    }
    if (requestedAmount > remaining) {
      return { allowed: true, amount: remaining, partial: true, reason: 'Bare ' + remaining + ' 🪙 igjen av dagstaket — så det er det som settes inn i dag.' };
    }
  }
  return { allowed: true, amount: requestedAmount, reason: null };
}

/* ───────────────────────────────────────────────────────────
   SPØRSMÅLSBANK
   ─────────────────────────────────────────────────────────── */
const QUESTIONS = {
  '14': [
    { q: 'Hva er en god grunn til å spare mynter?', options: ['For å ha råd til noe stort senere', 'For å bli kvitt dem fort', 'Sparing er aldri lurt'], correct: 0 },
    { q: 'Du har 10 🪙 og får 5 🪙 til. Hvor mange har du?', options: ['15 🪙', '5 🪙', '50 🪙'], correct: 0 },
    { q: 'Et eple koster 8 🪙. Du betaler med 10 🪙. Hvor mye får du igjen?', options: ['2 🪙', '8 🪙', '18 🪙'], correct: 0 },
    { q: 'Hva betyr det å spare?', options: ['Legge mynter til side til senere', 'Bruke alt med en gang', 'Gi bort alt'], correct: 0 },
    { q: 'Hva trenger du mest av disse?', options: ['Mat', 'Et nytt leketøy', 'En pose godteri'], correct: 0 },
    { q: 'Hvor kan du sette mynter for å få renter?', options: ['På sparekontoen', 'Under madrassen', 'I søpla'], correct: 0 },
    { q: 'Du vil kjøpe noe til 20 🪙, men har bare 12 🪙. Hva er lurt?', options: ['Spare litt til først', 'Ta det uten å betale', 'Bli sur'], correct: 0 },
    { q: 'Hva er en mynt i Myntland?', options: ['Penger dere bruker i klassen', 'En slags mat', 'Et lite dyr'], correct: 0 },
    { q: 'Du har 3 🪙 og finner 4 🪙 til. Hvor mange nå?', options: ['7 🪙', '1 🪙', '34 🪙'], correct: 0 },
    { q: 'Hva er lurt å gjøre før du kjøper noe?', options: ['Sjekke at du har nok mynter', 'Lukke øynene', 'Ikke tenke'], correct: 0 },
    { q: 'To venner deler 10 🪙 likt. Hvor mye får hver?', options: ['5 🪙', '10 🪙', '2 🪙'], correct: 0 },
    { q: 'Hvorfor har klassen et sparemål?', options: ['For å spare til noe gøy sammen', 'For å kaste bort mynter', 'Ingen god grunn'], correct: 0 },
    { q: 'Hva skjer hvis du bruker alle myntene med en gang?', options: ['Du har ingen igjen til senere', 'De blir flere', 'Du får dobbelt'], correct: 0 },
    { q: 'Du sparer 2 🪙 hver dag i 3 dager. Hvor mye har du spart?', options: ['6 🪙', '5 🪙', '23 🪙'], correct: 0 },
    { q: 'Hvilket koster nok mest?', options: ['En sykkel', 'Et viskelær', 'En blyant'], correct: 0 },
    { q: 'Du har 9 🪙 og bruker 4 🪙. Hvor mange igjen?', options: ['5 🪙', '13 🪙', '4 🪙'], correct: 0 },
    { q: 'Hva er smart når du får mynter?', options: ['Spare litt og bruke litt', 'Bruke alt på sekunder', 'Miste dem'], correct: 0 },
    { q: 'En venn vil låne 5 🪙 av deg hver dag. Hva er lurt?', options: ['Snakke om hvordan de betaler tilbake', 'Si ja til alt uten å tenke', 'Gi bort alle myntene'], correct: 0 }
  ],
  '57': [
    { q: 'I Myntland trekkes 20 % skatt av lønna. Tjener du 100 🪙, hvor mye skatt?', options: ['20 🪙', '2 🪙', '80 🪙'], correct: 0 },
    { q: 'Sparekontoen gir 2 % rente i uka. Har du 100 🪙, hvor mye rente neste mandag?', options: ['2 🪙', '20 🪙', '100 🪙'], correct: 0 },
    { q: 'Hva betyr et budsjett?', options: ['En plan for inntekter og utgifter', 'En type lån', 'Et spill'], correct: 0 },
    { q: 'Du tar opp et lån. Hva må du huske?', options: ['Det må betales tilbake', 'Det er gratis penger', 'Det forsvinner av seg selv'], correct: 0 },
    { q: 'Forskjellen på fond med lav og høy risiko?', options: ['Høy risiko kan gi mer, men kan også tape mer', 'Lav risiko taper alltid', 'Ingen forskjell'], correct: 0 },
    { q: 'Lønna er 50 🪙. Etter 20 % skatt, hvor mye sitter du igjen med?', options: ['40 🪙', '30 🪙', '10 🪙'], correct: 0 },
    { q: 'Hva er typiske faste fredagsutgifter i Myntland?', options: ['Leie av pult, strøm og iPad', 'Gratis godteri', 'Ekstra lønn'], correct: 0 },
    { q: 'Du har 60 🪙 og følger 50–30–20. Hvor mye til sparing (20 %)?', options: ['12 🪙', '20 🪙', '6 🪙'], correct: 0 },
    { q: 'Hvorfor er det lurt å ha sparepenger i bakhånd?', options: ['For uventede utgifter', 'For å bruke alt fort', 'Det er aldri lurt'], correct: 0 },
    { q: 'Et fond stiger fra 100 🪙 til 120 🪙. Hvor mange prosent opp?', options: ['20 %', '2 %', '120 %'], correct: 0 },
    { q: 'Du låner 30 🪙 og betaler tilbake 35 🪙. De 5 ekstra kalles?', options: ['Rente', 'Skatt', 'Gave'], correct: 0 },
    { q: 'Hva er en utgift?', options: ['Mynter som går ut', 'Mynter som kommer inn', 'En type konto'], correct: 0 },
    { q: 'Klassens sparemål er 500 🪙. Dere har 350 🪙. Hvor mye mangler?', options: ['150 🪙', '850 🪙', '200 🪙'], correct: 0 },
    { q: 'Gevinst på fond beskattes 10 % ved uttak. Tjener du 50 🪙, hvor mye skatt?', options: ['5 🪙', '10 🪙', '50 🪙'], correct: 0 },
    { q: 'Hva er lurest hvis du vil ha noe dyrt?', options: ['Spare litt hver uke', 'Låne uten plan', 'Gi opp med en gang'], correct: 0 },
    { q: 'Du tjener 40 🪙 i uka. Hvor lenge for å spare 200 🪙?', options: ['5 uker', '2 uker', '20 uker'], correct: 0 },
    { q: 'Hva betyr inntekt?', options: ['Mynter som kommer inn', 'Mynter som går ut', 'Et lån'], correct: 0 },
    { q: '50–30–20-regelen deler inntekten i?', options: ['Behov, ønsker og sparing', 'Mat, leker og godteri', 'Tre helt like deler'], correct: 0 }
  ]
};

/* ───────────────────────────────────────────────────────────
   BRETT
   ─────────────────────────────────────────────────────────── */
const TILE_COUNT = 60, COLS = 6, ROWS = 10;
const LADDERS = { 3: 21, 8: 26, 12: 30, 16: 34, 28: 44, 37: 52, 45: 58 };
const SLIDES  = { 24: 7, 33: 14, 40: 19, 48: 27, 50: 31, 54: 36, 57: 41 };
const TILE_TYPES = (function () {
  const t = { 1: 'start', 60: 'finish' };
  Object.keys(LADDERS).forEach(f => { t[f] = 'ladder'; });
  Object.keys(SLIDES).forEach(f => { t[f] = 'slide'; });
  // Resten fylles med en monstret miks (flest sporsmaal, saa mynter, litt utgift)
  const pattern = ['question', 'coin', 'question', 'expense', 'coin', 'question'];
  let pi = 0;
  for (let n = 2; n <= 59; n++) {
    if (t[n]) continue;
    t[n] = pattern[pi % pattern.length];
    pi++;
  }
  return t;
})();
let tileAmount = {};
function genAmounts() {
  tileAmount = {};
  const coinPool = [5, 10, 10, 15, 20], expPool = [5, 5, 10, 10, 15];
  for (let n = 1; n <= TILE_COUNT; n++) {
    const t = TILE_TYPES[n];
    if (t === 'coin') tileAmount[n] = coinPool[Math.floor(Math.random() * coinPool.length)];
    else if (t === 'expense') tileAmount[n] = expPool[Math.floor(Math.random() * expPool.length)];
  }
}
function tileGrid(n) {
  const k = n - 1;
  const rowFromBottom = Math.floor(k / COLS);
  const posInRow = k % COLS;
  const col = (rowFromBottom % 2 === 0) ? posInRow : (COLS - 1 - posInRow);
  return { col, cssRow: ROWS - rowFromBottom, rowFromBottom };
}
function tileCenterPct(n) {
  const g = tileGrid(n);
  const x = (g.col + 0.5) / COLS * 100;
  const visualRow = (ROWS - 1) - g.rowFromBottom;
  const y = (visualRow + 0.5) / ROWS * 100;
  return { x, y };
}
function tileInner(n, t) {
  const map = {
    coin: ['🪙', ''], question: ['❓', 'Spørsmål'], expense: ['💸', ''],
    ladder: ['🪜', 'Stige'], slide: ['🛝', 'Sklie'], start: ['🏁', 'Start'], finish: ['🏆', 'MÅL']
  };
  const pair = map[t] || ['', ''];
  let lbl = pair[1];
  if (t === 'coin') lbl = '+' + tileAmount[n] + ' 🪙';
  if (t === 'expense') lbl = '−' + tileAmount[n] + ' 🪙';
  return '<span class="ticon">' + coin(pair[0]) + '</span><span class="tlabel">' + coin(lbl) + '</span>';
}
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (let n = 1; n <= TILE_COUNT; n++) {
    const t = TILE_TYPES[n];
    const g = tileGrid(n);
    const div = document.createElement('div');
    div.className = 'tile t-' + t;
    div.style.gridColumn = g.col + 1;
    div.style.gridRow = g.cssRow;
    div.dataset.n = n;
    div.innerHTML = '<span class="tnum">' + n + '</span>' + tileInner(n, t);
    board.appendChild(div);
  }
  drawConnectors();
}
function connectorLine(a, b, color, dashed) {
  return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
    '" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" opacity="0.5"' +
    (dashed ? ' stroke-dasharray="3 2"' : '') + '/>' +
    '<circle cx="' + a.x + '" cy="' + a.y + '" r="1.7" fill="' + color + '"/>' +
    '<circle cx="' + b.x + '" cy="' + b.y + '" r="1.7" fill="' + color + '"/>';
}
function drawConnectors() {
  const svg = document.getElementById('connectors');
  const board = document.getElementById('board');
  if (!svg || !board) return;
  const w = board.offsetWidth, h = board.offsetHeight;
  if (!w || !h) return; // brettet ikke lagt ut ennaa
  const vbH = 100 * h / w; // viewBox-hoyde som matcher brettets forhold
  svg.setAttribute('viewBox', '0 0 100 ' + vbH.toFixed(2));
  const P = n => { const c = tileCenterPct(n); return { x: c.x, y: c.y / 100 * vbH }; };
  let html = '';
  Object.keys(LADDERS).forEach(from => {
    html += connectorLine(P(+from), P(LADDERS[from]), '#1D9E75', false);
  });
  Object.keys(SLIDES).forEach(from => {
    html += connectorLine(P(+from), P(SLIDES[from]), '#7a3eb8', true);
  });
  svg.innerHTML = html;
}
// Scroll brettet slik at den aktive spilleren holdes synlig (folger oppover)
function scrollActiveIntoView() {
  const sc = document.getElementById('board-scroll');
  const board = document.getElementById('board');
  if (!sc || !board) return;
  const p = game.players[game.current];
  if (!p) return;
  const c = tileCenterPct(p.pos);
  const targetY = (c.y / 100) * board.offsetHeight;
  const top = targetY - sc.clientHeight / 2;
  sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/* ───────────────────────────────────────────────────────────
   BRIKKER (monstre 01..20)
   ─────────────────────────────────────────────────────────── */
const ALL_PIECES = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'));
function monsterImg(id) { return 'worksheet/monsters/' + id + '.webp'; }
function nextFreePiece() {
  const used = new Set(game.players.map(p => p.pieceId));
  const free = ALL_PIECES.filter(id => !used.has(id));
  const pool = free.length ? free : ALL_PIECES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ───────────────────────────────────────────────────────────
   SPILLTILSTAND
   ─────────────────────────────────────────────────────────── */
const game = { level: '14', players: [], current: 0, started: false, over: false, busy: false, pendingMove: null };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Skjermer og overlegg ── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showOverlay(id) { document.getElementById(id).classList.add('show'); }
function hideOverlay(id) { document.getElementById(id).classList.remove('show'); }

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.innerHTML = coin(escapeHtml(msg));
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function miniLog(msg) { document.getElementById('mini-log').textContent = msg; }

/* ───────────────────────────────────────────────────────────
   OPPSETT
   ─────────────────────────────────────────────────────────── */
function selectLevel(level) {
  game.level = level;
  document.getElementById('lvl-14').classList.toggle('selected', level === '14');
  document.getElementById('lvl-57').classList.toggle('selected', level === '57');
}
function addPlayer(p) {
  const pieceId = nextFreePiece();
  game.players.push({
    name: p.name, isGuest: !!p.isGuest, student: p.student || null,
    pieceId, pos: 1, coins: 0, skip: 0, deposited: false
  });
  renderPlayers();
}
function removePlayer(idx) { game.players.splice(idx, 1); renderPlayers(); }
function renderPlayers() {
  const list = document.getElementById('players-list');
  list.innerHTML = '';
  if (!game.players.length) {
    list.innerHTML = '<div class="muted" style="padding:.6rem;font-weight:700;">Ingen spillere ennå. Skann et kort eller bli med som gjest.</div>';
  }
  game.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-slot';
    const badge = p.isGuest
      ? '<span class="badge-card badge-guest">Gjest</span>'
      : '<span class="badge-card">Kort ✓</span>';
    row.innerHTML =
      '<img class="piece" src="' + monsterImg(p.pieceId) + '" alt="">' +
      '<div style="flex:1;"><div class="pname">' + escapeHtml(p.name) + '</div>' +
      '<div class="ptag">' + badge + '</div></div>' +
      '<button class="remove" data-i="' + i + '" aria-label="Fjern">×</button>';
    list.appendChild(row);
  });
  list.querySelectorAll('.remove').forEach(b => b.onclick = () => removePlayer(+b.dataset.i));
  document.getElementById('btn-start-game').disabled = game.players.length < 2;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ── Bli med via kort ── */
function addCardPlayer() {
  if (game.players.length >= 4) { toast('Maks 4 spillere'); return; }
  openScanner('📷 Skann kortet', 'Hold Myntland-kortet foran kameraet', async (qr) => {
    document.getElementById('scan-status').textContent = 'Sjekker…';
    try {
      const student = await lookupStudentFromQR(qr);
      stopScanner(); hideOverlay('overlay-scan');
      if (!student) { toast('Fant ikke eleven – prøv å skanne igjen'); return; }
      if (game.players.some(p => p.student && p.student.id === student.id)) {
        toast(student.name + ' er allerede med'); return;
      }
      addPlayer({ name: student.name, isGuest: false, student });
      toast(student.name + ' ble med! 🎲');
    } catch (e) {
      stopScanner(); hideOverlay('overlay-scan');
      toast('Tilkoblingsfeil: ' + (e.message || 'ukjent'));
    }
  });
}

/* ───────────────────────────────────────────────────────────
   SPILLET
   ─────────────────────────────────────────────────────────── */
function startGame() {
  if (game.players.length < 2) return;
  game.players.forEach(p => { p.pos = 1; p.coins = 0; p.skip = 0; p.deposited = false; });
  game.current = 0; game.over = false; game.busy = false; game.started = true;
  game.pendingMove = null;
  genAmounts();
  renderBoard();
  renderPawns();
  renderStatus();
  updateTurnUI();
  miniLog('');
  showScreen('screen-game');
  setTimeout(() => { drawConnectors(); scrollActiveIntoView(); }, 60);
}

function updateTurnUI() {
  const p = game.players[game.current];
  document.getElementById('turn-name').textContent = p ? p.name : '—';
  document.getElementById('btn-roll').disabled = game.over || game.busy;
}

function renderStatus() {
  const wrap = document.getElementById('player-status');
  wrap.innerHTML = '';
  game.players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'pstatus' + (i === game.current && !game.over ? ' active' : '');
    const skip = p.skip > 0 ? '<span class="ps-skip">står over</span>' : '';
    div.innerHTML =
      '<img class="ps-piece" src="' + monsterImg(p.pieceId) + '" alt="">' +
      '<div style="flex:1;"><div class="ps-name">' + escapeHtml(p.name) + '</div>' + skip + '</div>' +
      '<div class="ps-coins">' + p.coins + ' ' + COIN_TAG + '</div>';
    wrap.appendChild(div);
  });
}

function renderPawns() {
  const layer = document.getElementById('pieces-layer');
  layer.innerHTML = '';
  const byTile = {};
  game.players.forEach((p, i) => { (byTile[p.pos] = byTile[p.pos] || []).push(i); });
  const offsets = [{ dx: -3.4, dy: -3.4 }, { dx: 3.4, dy: -3.4 }, { dx: -3.4, dy: 3.4 }, { dx: 3.4, dy: 3.4 }];
  game.players.forEach((p, i) => {
    const c = tileCenterPct(p.pos);
    const group = byTile[p.pos];
    const idx = group.indexOf(i);
    const off = group.length > 1 ? offsets[idx % 4] : { dx: 0, dy: 0 };
    const img = document.createElement('img');
    img.className = 'pawn' + (i === game.current && !game.over ? ' is-turn' : '');
    img.src = monsterImg(p.pieceId);
    img.style.left = (c.x + off.dx) + '%';
    img.style.top = (c.y + off.dy) + '%';
    layer.appendChild(img);
  });
}

async function doRoll() {
  if (game.over || game.busy) return;
  game.busy = true;
  document.getElementById('btn-roll').disabled = true;
  const dice = document.getElementById('dice');
  dice.classList.add('rolling');
  const face = 1 + Math.floor(Math.random() * 6);
  let ticks = 0;
  const iv = setInterval(() => {
    dice.dataset.face = String(1 + Math.floor(Math.random() * 6));
    if (++ticks > 6) { clearInterval(iv); dice.dataset.face = String(face); }
  }, 70);
  await sleep(580);
  dice.classList.remove('rolling');
  beginMovePick(game.current, face);
}

// Etter kast teller spilleren selv og trykker paa ruten de lander paa.
function beginMovePick(i, roll) {
  const p = game.players[i];
  const target = Math.min(p.pos + roll, TILE_COUNT);
  game.pendingMove = { i: i, roll: roll, target: target };
  miniLog('🎲 ' + roll + ' — tell ' + roll + ' ruter fram og trykk på ruten!');
  const board = document.getElementById('board');
  if (board) board.classList.add('picking');
}

// Trykk paa en rute: riktig => flytt monsteret dit; feil => tell paa nytt.
async function handleTileTap(n) {
  const pm = game.pendingMove;
  if (!pm || game.over) return;
  if (n !== pm.target) {
    flashWrongTile(n);
    toast('Ikke helt riktig – tell rutene på nytt!');
    return;
  }
  game.pendingMove = null;
  const board = document.getElementById('board');
  if (board) board.classList.remove('picking');
  const p = game.players[pm.i];
  // Flytt rute for rute fram til maalet (raskt – de har alt telt selv)
  while (p.pos < pm.target) { p.pos++; renderPawns(); scrollActiveIntoView(); await sleep(170); }
  miniLog('');
  await sleep(220);
  await resolveTile(pm.i);
}

function flashWrongTile(n) {
  const el = document.querySelector('.tile[data-n="' + n + '"]');
  if (!el) return;
  el.classList.add('wrong-pick');
  setTimeout(() => el.classList.remove('wrong-pick'), 500);
}

async function resolveTile(i) {
  const p = game.players[i];
  if (p.pos >= TILE_COUNT) return handleWin(i);
  const type = TILE_TYPES[p.pos];

  if (type === 'ladder') {
    const to = LADDERS[p.pos];
    await showEvent('🪜', 'Stige opp!', p.name + ' klatrer fra rute ' + p.pos + ' opp til ' + to + '!');
    p.pos = to; renderPawns(); scrollActiveIntoView(); await sleep(320);
    if (p.pos >= TILE_COUNT) return handleWin(i);
    return endTurn();
  }
  if (type === 'slide') {
    const to = SLIDES[p.pos];
    await showEvent('🛝', 'Oi, en sklie!', p.name + ' sklir fra rute ' + p.pos + ' ned til ' + to + '.');
    p.pos = to; renderPawns(); scrollActiveIntoView(); await sleep(320);
    return endTurn();
  }
  if (type === 'coin') {
    const amt = tileAmount[p.pos];
    p.coins += amt; renderStatus();
    await showEvent('🪙', '+' + amt + ' mynter!', p.name + ' fant ' + amt + ' 🪙 og samler dem opp. Nå: ' + p.coins + ' 🪙.');
    return endTurn();
  }
  if (type === 'expense') {
    const amt = tileAmount[p.pos];
    if (p.coins >= amt) {
      p.coins -= amt; renderStatus();
      await showEvent('💸', 'Utgift: ' + amt + ' 🪙', p.name + ' betaler ' + amt + ' 🪙. Igjen: ' + p.coins + ' 🪙.');
    } else {
      p.skip += 1; renderStatus();
      await showEvent('😬', 'Ikke nok mynter!', p.name + ' har bare ' + p.coins + ' 🪙 og kan ikke betale ' + amt + ' 🪙 — står over neste runde.');
    }
    return endTurn();
  }
  if (type === 'question') return openQuestion(i);
  return endTurn();
}

function showEvent(emoji, title, sub) {
  return new Promise(resolve => {
    setText(document.getElementById('ev-emoji'), emoji);
    setText(document.getElementById('ev-title'), title);
    setText(document.getElementById('ev-sub'), sub);
    showOverlay('overlay-event');
    const btn = document.getElementById('ev-continue');
    btn.onclick = () => { hideOverlay('overlay-event'); resolve(); };
  });
}

function openQuestion(i) {
  const p = game.players[i];
  const bank = QUESTIONS[game.level];
  const q = bank[Math.floor(Math.random() * bank.length)];
  const reward = game.level === '14' ? 10 : 15;
  document.getElementById('q-who').textContent = p.name;
  setText(document.getElementById('q-text'), q.q);
  setText(document.getElementById('q-reward'), 'Riktig svar: +' + reward + ' 🪙');
  const optsEl = document.getElementById('q-options');
  optsEl.innerHTML = '';
  document.getElementById('q-feedback').textContent = '';
  const cont = document.getElementById('q-continue');
  cont.style.display = 'none';
  q.options.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.className = 'q-opt';
    b.innerHTML = coin(escapeHtml(opt));
    b.onclick = () => {
      Array.from(optsEl.children).forEach(c => { c.disabled = true; });
      const fb = document.getElementById('q-feedback');
      if (idx === q.correct) {
        b.classList.add('correct');
        p.coins += reward; renderStatus();
        fb.innerHTML = coin(escapeHtml('✅ Riktig! +' + reward + ' 🪙'));
        fb.className = 'q-feedback ok';
      } else {
        b.classList.add('wrong');
        optsEl.children[q.correct].classList.add('correct');
        fb.innerHTML = coin(escapeHtml('Riktig svar: ' + q.options[q.correct]));
        fb.className = 'q-feedback no';
      }
      cont.style.display = '';
    };
    optsEl.appendChild(b);
  });
  cont.onclick = () => { hideOverlay('overlay-question'); endTurn(); };
  showOverlay('overlay-question');
}

function endTurn() {
  game.busy = false;
  if (game.over) return;
  let next = game.current;
  for (let n = 0; n < game.players.length; n++) {
    next = (next + 1) % game.players.length;
    const np = game.players[next];
    if (np.skip > 0) {
      np.skip--; renderStatus();
      toast(np.name + ' står over denne runden');
      continue;
    }
    break;
  }
  game.current = next;
  updateTurnUI();
  renderPawns();
  renderStatus();
  scrollActiveIntoView();
  document.getElementById('btn-roll').disabled = false;
}

/* ───────────────────────────────────────────────────────────
   SEIER + INNSKUDD
   ─────────────────────────────────────────────────────────── */
function handleWin(i) {
  game.over = true;
  game.busy = false;
  const winner = game.players[i];
  document.getElementById('btn-roll').disabled = true;
  renderPawns();
  renderStatus();

  const others = game.players.filter(p => p !== winner)
    .sort((a, b) => (b.pos - a.pos) || (b.coins - a.coins));
  const order = [winner].concat(others);

  document.getElementById('win-mascot').src = monsterImg(winner.pieceId);
  document.getElementById('win-title').textContent = '🎉 ' + winner.name + ' kom i mål!';

  const fl = document.getElementById('final-list');
  fl.innerHTML = '';
  order.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'final-row';
    row.innerHTML =
      '<span class="fr-rank">' + (idx + 1) + '.</span>' +
      '<img src="' + monsterImg(p.pieceId) + '" alt="">' +
      '<span class="fr-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="fr-coins">' + p.coins + ' ' + COIN_TAG + '</span>';
    fl.appendChild(row);
  });

  renderDepositList();
  showOverlay('overlay-win');
}

function renderDepositList() {
  const dl = document.getElementById('deposit-list');
  dl.innerHTML = '';
  game.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'deposit-row';
    let right;
    if (p.isGuest) {
      right = '<span class="dr-state guest">Gjest – ingen konto</span>';
    } else if (p.deposited) {
      right = '<span class="dr-state done">✓ Satt inn</span>';
    } else if (p.coins <= 0) {
      right = '<span class="dr-state guest">Ingen mynter</span>';
    } else {
      right = '<button class="btn btn-green" data-i="' + i + '">Sett inn ' + p.coins + ' ' + COIN_TAG + '</button>';
    }
    row.innerHTML =
      '<img src="' + monsterImg(p.pieceId) + '" alt="">' +
      '<span class="dr-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="dr-coins">' + p.coins + ' ' + COIN_TAG + '</span>' + right;
    dl.appendChild(row);
  });
  dl.querySelectorAll('button[data-i]').forEach(b => {
    b.onclick = () => startDeposit(game.players[+b.dataset.i]);
  });
}

function startDeposit(player) {
  if (!player.student) { toast('Denne spilleren har ikke kort'); return; }
  openPin(player.name, async (entered) => {
    document.getElementById('pin-error').textContent = 'Sjekker…';
    try {
      const ok = await verifyPin(player.student, entered);
      if (!ok) {
        document.getElementById('pin-error').textContent = 'Feil PIN, prøv igjen';
        pin.buffer = ''; updatePinDots();
        return;
      }
      const policy = await applyPolicyToAmount(player.student, player.coins);
      if (!policy.allowed) {
        hideOverlay('overlay-pin');
        toast(policy.reason);
        return;
      }
      const amount = policy.amount;
      await depositCoins(player.student, amount);
      player.deposited = true;
      hideOverlay('overlay-pin');
      renderDepositList();
      if (policy.partial) toast(player.name + ': ' + policy.reason);
      else toast(player.name + ' fikk ' + amount + ' 🪙 på kontoen! 🪙');
    } catch (e) {
      document.getElementById('pin-error').textContent = 'Noe gikk galt: ' + (e.message || 'ukjent');
    }
  });
}

function resetForReplay() {
  game.players.forEach(p => { p.pos = 1; p.coins = 0; p.skip = 0; p.deposited = false; });
  game.current = 0; game.over = false; game.busy = false; game.pendingMove = null;
  genAmounts(); renderBoard(); renderPawns(); renderStatus(); updateTurnUI(); miniLog('');
  setTimeout(() => { drawConnectors(); scrollActiveIntoView(); }, 60);
}

/* ───────────────────────────────────────────────────────────
   QR-SKANNER (generisk)
   ─────────────────────────────────────────────────────────── */
const scan = { stream: null, handle: null, onResult: null };
function openScanner(title, sub, onResult) {
  scan.onResult = onResult;
  document.getElementById('scan-title').textContent = title;
  document.getElementById('scan-sub').textContent = sub;
  document.getElementById('scan-status').textContent = 'Starter kamera…';
  showOverlay('overlay-scan');
  startScanner();
}
async function startScanner() {
  const video = document.getElementById('scanner-video');
  const statusEl = document.getElementById('scan-status');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = 'Nettleseren støtter ikke kamera.';
    return;
  }
  if (typeof jsQR === 'undefined') {
    statusEl.textContent = 'QR-leseren er ikke lastet. Sjekk internett.';
    return;
  }
  try {
    scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = scan.stream;
    video.play().catch(() => {});
    statusEl.textContent = 'Leter etter QR-kode…';
    video.addEventListener('loadedmetadata', () => scanLoop(), { once: true });
  } catch (err) {
    let msg = 'Kunne ikke starte kameraet.';
    if (err.name === 'NotAllowedError') msg = 'Du må gi tilgang til kameraet.';
    else if (err.name === 'NotFoundError') msg = 'Fant ingen kamera på enheten.';
    statusEl.textContent = msg;
  }
}
function stopScanner() {
  if (scan.handle) { cancelAnimationFrame(scan.handle); scan.handle = null; }
  if (scan.stream) { scan.stream.getTracks().forEach(t => t.stop()); scan.stream = null; }
}
function scanLoop() {
  const video = document.getElementById('scanner-video');
  if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
    scan.handle = requestAnimationFrame(scanLoop);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
  if (code && code.data) {
    if (scan.handle) { cancelAnimationFrame(scan.handle); scan.handle = null; }
    const cb = scan.onResult; scan.onResult = null;
    if (cb) cb(code.data);
    return;
  }
  scan.handle = requestAnimationFrame(scanLoop);
}

/* ───────────────────────────────────────────────────────────
   PIN-PAD (generisk)
   ─────────────────────────────────────────────────────────── */
const pin = { buffer: '', onComplete: null };
function openPin(name, onComplete) {
  pin.buffer = '';
  pin.onComplete = onComplete;
  document.getElementById('pin-name').textContent = name;
  document.getElementById('pin-error').textContent = '';
  updatePinDots();
  showOverlay('overlay-pin');
}
function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('pd' + i).classList.toggle('filled', i < pin.buffer.length);
  }
}
function pinKey(k) {
  if (k === 'cancel') { hideOverlay('overlay-pin'); pin.buffer = ''; return; }
  if (k === 'del') { pin.buffer = pin.buffer.slice(0, -1); updatePinDots(); return; }
  if (pin.buffer.length >= 4) return;
  pin.buffer += k;
  updatePinDots();
  if (pin.buffer.length === 4) {
    const entered = pin.buffer;
    const cb = pin.onComplete;
    if (cb) setTimeout(() => cb(entered), 150);
  }
}

/* ───────────────────────────────────────────────────────────
   GJEST
   ─────────────────────────────────────────────────────────── */
function openGuest() {
  if (game.players.length >= 4) { toast('Maks 4 spillere'); return; }
  document.getElementById('guest-name').value = '';
  showOverlay('overlay-guest');
  setTimeout(() => document.getElementById('guest-name').focus(), 100);
}

/* ───────────────────────────────────────────────────────────
   INIT
   ─────────────────────────────────────────────────────────── */
let resizeTimer = null;
function init() {
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { drawConnectors(); renderPawns(); }, 150);
  });
  document.getElementById('lvl-14').onclick = () => selectLevel('14');
  document.getElementById('lvl-57').onclick = () => selectLevel('57');
  document.getElementById('btn-add-card').onclick = addCardPlayer;
  document.getElementById('btn-add-guest').onclick = openGuest;
  document.getElementById('btn-start-game').onclick = startGame;
  document.getElementById('btn-roll').onclick = doRoll;
  const boardEl = document.getElementById('board');
  if (boardEl) boardEl.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile || !tile.dataset.n) return;
    handleTileTap(parseInt(tile.dataset.n, 10));
  });
  document.getElementById('btn-quit').onclick = () => {
    if (confirm('Avslutte spillet og gå tilbake til oppsett?')) {
      game.started = false; game.over = false; game.busy = false; game.pendingMove = null;
      const b = document.getElementById('board'); if (b) b.classList.remove('picking');
      showScreen('screen-setup');
    }
  };

  document.getElementById('scan-cancel').onclick = () => { stopScanner(); hideOverlay('overlay-scan'); };

  document.getElementById('guest-ok').onclick = () => {
    const name = (document.getElementById('guest-name').value || '').trim() || 'Gjest';
    hideOverlay('overlay-guest');
    addPlayer({ name, isGuest: true });
  };
  document.getElementById('guest-cancel').onclick = () => hideOverlay('overlay-guest');
  document.getElementById('guest-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('guest-ok').click();
  });

  document.getElementById('pin-pad').querySelectorAll('.pin-key').forEach(b => {
    b.onclick = () => pinKey(b.dataset.k);
  });

  document.getElementById('btn-play-again').onclick = () => { hideOverlay('overlay-win'); resetForReplay(); };
  document.getElementById('btn-finish').onclick = () => {
    hideOverlay('overlay-win');
    game.players = [];
    game.started = false; game.over = false;
    renderPlayers();
    showScreen('screen-setup');
  };

  selectLevel('14');
  renderPlayers();
}

document.addEventListener('DOMContentLoaded', init);
