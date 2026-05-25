
// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
window._students = []; window._groups = []; window._jobs = [];
window._shop57 = []; window._teachers = []; window._customRewards57 = []; window._hendelser = [];
window._currentTeacher = null;

let currentAction = null, currentStudentId = null, bulkAction = null;
let currentEditJobKey = null, currentEditGroupKey = null;
let currentDeleteTeacherId = null;
let searchFilter = '', classFilter = '';
let csvParsed = [];
let selectedGroupColor = '#1D9E75';
let selectedTeacherColor = '#1D9E75';
const TAX_RATE = 0.20;

function fbRef(p) { return window._ref(window._db, p); }
function ready()  { return !!(window._fbReady && window._db && window._ref); }

// ════════════════════════════════════════════════════════════
// LOGIN / LÆRERPROFILER  (identisk med 1–4-portalen)
// ════════════════════════════════════════════════════════════
let loginPin = '', loginTarget = null;

function loadProfiles() {
  window._onValue(fbRef('teachers57'), snap => {
    window._teachers = snap.val()
      ? Object.entries(snap.val()).map(([k,v]) => ({...v, fbKey:k}))
      : [];
    renderLoginProfiles();
    if (document.getElementById('page-laerere')?.classList.contains('active')) renderTeacherList();
    if (!window._teachers.length) seedDefaultAdmin();
  });
}

function seedDefaultAdmin() {
  window._set(window._push(fbRef('teachers57')), {
    name: 'Administrator', pin: '1379', role: 'admin', color: '#085041', class: ''
  });
}

function renderLoginProfiles() {
  const el = document.getElementById('profile-list');
  if (!window._teachers.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:1rem;font-size:.85rem;">Ingen profiler ennå – første gangs PIN er 1379</div>';
    return;
  }
  el.innerHTML = window._teachers.map(t => `
    <button class="profile-btn" onclick="selectProfile('${t.fbKey}')">
      <div class="profile-avatar" style="background:${t.color}22;color:${t.color};">${t.name[0].toUpperCase()}</div>
      <div>
        <div class="profile-name">${t.name}</div>
        <div class="profile-role">${t.role === 'admin' ? '⚙️ Administrator' : `👩‍🏫 Lærer${t.class ? ' – klasse ' + t.class : ''}`}</div>
      </div>
    </button>`).join('');
}

function selectProfile(fbKey) {
  loginTarget = window._teachers.find(t => t.fbKey === fbKey);
  loginPin = '';
  document.getElementById('pin-for-name').textContent = 'PIN for ' + loginTarget.name;
  document.getElementById('login-error').textContent = '';
  updateLoginDots();
  document.getElementById('profile-list').style.display = 'none';
  document.getElementById('pin-section').style.display = 'block';
}

function backToProfiles() {
  loginPin = ''; loginTarget = null;
  document.getElementById('pin-section').style.display = 'none';
  document.getElementById('profile-list').style.display = 'flex';
  document.getElementById('profile-list').style.flexDirection = 'column';
}

function pinKey(val) {
  if (val === 'DEL') loginPin = loginPin.slice(0,-1);
  else if (loginPin.length < 4) loginPin += val;
  updateLoginDots();
  document.getElementById('login-error').textContent = '';
  if (loginPin.length === 4) setTimeout(tryTeacherLogin, 150);
}

function updateLoginDots() {
  ['pc-0','pc-1','pc-2','pc-3'].forEach((id,i) => {
    const el = document.getElementById(id);
    el.textContent = i < loginPin.length ? '●' : '·';
    el.classList.toggle('filled', i < loginPin.length);
  });
}

function tryTeacherLogin() {
  if (loginPin === String(loginTarget.pin)) {
    window._currentTeacher = loginTarget;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('header-name').textContent = loginTarget.name;
    const av = document.getElementById('header-avatar');
    av.textContent = loginTarget.name[0].toUpperCase();
    av.style.background = loginTarget.color + '33';
    av.style.color = loginTarget.color;
    if (loginTarget.role === 'admin') document.getElementById('nav-laerere').style.display = '';
    const sub = document.getElementById('elever-subtitle');
    sub.textContent = loginTarget.class ? `Viser klasse ${loginTarget.class}` : 'Alle 5–7-klasser';
    if (loginTarget.class && loginTarget.role !== 'admin') classFilter = loginTarget.class;
    window._startListeners();
    showPage('elever');
  } else {
    document.getElementById('login-error').textContent = '❌ Feil PIN – prøv igjen';
    loginPin = ''; updateLoginDots();
  }
}

function doLogout() {
  window._currentTeacher = null;
  searchFilter = ''; classFilter = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('pin-section').style.display = 'none';
  document.getElementById('profile-list').style.display = 'flex';
  document.getElementById('profile-list').style.flexDirection = 'column';
  document.getElementById('nav-laerere').style.display = 'none';
  loginPin = ''; loginTarget = null;
}

// ── Teacher CRUD (admin only) ──────────────────────────────────────────────
function selectTeacherColor(el) {
  document.querySelectorAll('#teacher-color-picker .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  selectedTeacherColor = el.dataset.color;
}

async function createTeacher() {
  const name  = document.getElementById('new-teacher-name').value.trim();
  const pin   = document.getElementById('new-teacher-pin').value.trim();
  const cls   = document.getElementById('new-teacher-class').value.trim();
  const role  = document.getElementById('new-teacher-role').value;
  const alertEl = document.getElementById('teacher-create-alert');
  if (!name || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Fyll inn navn og en 4-sifret PIN.</div>'; return;
  }
  await window._set(window._push(fbRef('teachers57')), { name, pin, role, class: cls, color: selectedTeacherColor });
  document.getElementById('new-teacher-name').value = '';
  document.getElementById('new-teacher-pin').value  = '';
  document.getElementById('new-teacher-class').value = '';
  alertEl.innerHTML = `<div class="alert alert-success">✅ ${name} er opprettet!</div>`;
  setTimeout(() => alertEl.innerHTML = '', 3000);
}

function renderTeacherList() {
  const el = document.getElementById('teacher-list'); if (!el) return;
  el.innerHTML = window._teachers.map(t => `
    <div class="teacher-card">
      <div class="teacher-card-avatar" style="background:${t.color}22;color:${t.color};">${t.name[0].toUpperCase()}</div>
      <div class="teacher-card-info">
        <div class="teacher-card-name">${t.name}</div>
        <div class="teacher-card-meta">${t.role === 'admin' ? '⚙️ Admin' : '👩‍🏫 Lærer'}${t.class ? ' · klasse ' + t.class : ' · alle klasser'} · PIN: ${t.pin}</div>
      </div>
      ${t.fbKey !== window._currentTeacher?.fbKey
        ? `<button class="btn btn-coral btn-sm" onclick="openDeleteTeacherModal('${t.fbKey}','${t.name}')">🗑️</button>`
        : '<span style="font-size:.75rem;color:var(--muted);">(deg)</span>'}
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem;">Ingen lærere ennå.</p>';
}

function openDeleteTeacherModal(fbKey, name) {
  currentDeleteTeacherId = fbKey;
  document.getElementById('modal-delete-teacher-text').textContent = `Slett lærerprofilen til ${name}?`;
  document.getElementById('modal-delete-teacher').classList.add('open');
}
async function confirmDeleteTeacher() {
  await window._remove(fbRef('teachers57/' + currentDeleteTeacherId));
  closeModal('modal-delete-teacher');
}

// ════════════════════════════════════════════════════════════
// NAVIGASJON
// ════════════════════════════════════════════════════════════
function showPage(page) {
  // Bakoverkompatibilitet: gamle sidenavn (sparemaal, qrkoder, hendelser, merker)
  // er nå tabs på Belønninger-siden. Rut til riktig fane.
  const tabMap = {
    sparemaal: 'sparemaal',
    qrkoder:   'qrkoder',
    hendelser: 'hendelser',
    merker:    'merker',
    myntjakten:'myntjakten'
  };
  if (tabMap[page]) {
    showPage('belonninger');
    setTimeout(() => {
      const btn = document.querySelector('#page-belonninger .tabs button[onclick*="' + tabMap[page] + '"]');
      if (btn) showBelonningTab(tabMap[page], btn);
    }, 0);
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('header nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-'  + page).classList.add('active');
  if (page === 'grupper')  renderGroupsPage();
  if (page === 'oppdrag')  { refreshJobSelects(); if (typeof setJobType === 'function') setJobType(window._currentJobType || 'task'); }
  if (page === 'butikk57') renderShop57List();
  if (page === 'laerere')  renderTeacherList();
  if (page === 'budsjett') renderBudgetPage();
  if (page === 'arbeidsplan') { if (typeof renderWorkPlans === 'function') renderWorkPlans(); }
  if (page === 'belonninger') {
    // Render alle tabs som kan være synlig — billig og gjør at innholdet
    // er klart uansett hvilken fane læreren bytter til.
    if (typeof renderClassGoalsPage === 'function') renderClassGoalsPage();
    if (typeof generateRewardQRCodes === 'function') generateRewardQRCodes();
    if (typeof renderCustomRewards57 === 'function') renderCustomRewards57();
    if (typeof renderHendelser === 'function') renderHendelser();
    if (typeof renderMerkerPage === 'function') renderMerkerPage();
    if (typeof renderMyntjaktenSettings57 === 'function') renderMyntjaktenSettings57();
  }
  // Close mobile nav after selection
  const nav = document.querySelector('header nav');
  const btn = document.getElementById('hamburger-btn');
  if (nav && btn) { nav.classList.remove('open'); btn.classList.remove('open'); }
}

// Bytt fane på Belønninger-siden. Mønster identisk med showElevTab.
function showBelonningTab(tab, btnEl) {
  ['sparemaal','qrkoder','hendelser','merker','myntjakten'].forEach(t => {
    const el = document.getElementById('bel-tab-' + t);
    if (el) el.style.display = (t === tab) ? 'block' : 'none';
  });
  if (btnEl && btnEl.closest) {
    btnEl.closest('.tabs').querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }
  // Re-render aktiv fane (idempotent og billig)
  if (tab === 'sparemaal'  && typeof renderClassGoalsPage   === 'function') renderClassGoalsPage();
  if (tab === 'qrkoder'    && typeof generateRewardQRCodes  === 'function') { generateRewardQRCodes(); renderCustomRewards57(); }
  if (tab === 'hendelser'  && typeof renderHendelser        === 'function') renderHendelser();
  if (tab === 'merker'     && typeof renderMerkerPage       === 'function') renderMerkerPage();
  if (tab === 'myntjakten' && typeof renderMyntjaktenSettings57 === 'function') renderMyntjaktenSettings57();
}

function toggleMobileNav() {
  const nav = document.querySelector('header nav');
  const btn = document.getElementById('hamburger-btn');
  nav.classList.toggle('open');
  btn.classList.toggle('open');
}

function showElevTab(tab, btn) {
  ['manuell','csv','klasser'].forEach(t => {
    document.getElementById('elev-tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  btn.closest('.tabs').querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'klasser') renderClassManager();
}

// ════════════════════════════════════════════════════════════
// ELEVER  (identisk med 1–4-portalen)
// ════════════════════════════════════════════════════════════
function generatePIN() { return String(Math.floor(1000 + Math.random() * 9000)); }

async function createStudent() {
  if (!ready()) { alert('Firebase ikke klar – prøv igjen om et øyeblikk.'); return; }
  const fn  = document.getElementById('new-firstname').value.trim();
  const ln  = document.getElementById('new-lastname').value.trim();
  const cls = document.getElementById('new-class').value || (window._currentTeacher?.class || '5. klasse');
  const bal = parseInt(document.getElementById('new-balance').value) || 0;
  const alertEl = document.getElementById('create-alert');
  if (!fn || !ln) { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Fyll inn fornavn og etternavn.</div>'; return; }
  const pin = generatePIN();
  await window._set(window._push(fbRef('students57')), {
    firstname: fn, lastname: ln, class: cls, pin, balance: bal,
    loan: 0, savings: 0, fund_low: 0, fund_high: 0, created: Date.now()
  });
  document.getElementById('new-firstname').value = '';
  document.getElementById('new-lastname').value  = '';
  document.getElementById('new-balance').value   = '100';
  alertEl.innerHTML = `<div class="alert alert-success">✅ ${fn} ${ln} opprettet! PIN: <strong>${pin}</strong></div>`;
}

function getClassNames() {
  return [...new Set(window._students.map(s => s.class))].filter(Boolean).sort();
}

function renderStudentTable() {
  const tbody = document.getElementById('student-table-body'); if (!tbody) return;
  // Oppdater filter-select og bulk-select
  const classes = getClassNames();
  const sel = document.getElementById('filter-class-select');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">Alle klasser</option>' + classes.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
  }
  const bulkSel = document.getElementById('bulk-class');
  if (bulkSel) bulkSel.innerHTML = '<option value="">Alle klasser</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
  const rf = document.getElementById('rename-class-from');
  if (rf) {
    const cur2 = rf.value;
    rf.innerHTML = '<option value="">– Velg klasse –</option>' + classes.map(c => `<option value="${c}"${c===cur2?' selected':''}>${c}</option>`).join('');
  }

  const filtered = window._students.filter(s => {
    const name = (s.firstname + ' ' + s.lastname).toLowerCase();
    return name.includes(searchFilter.toLowerCase()) && (!classFilter || s.class === classFilter);
  });
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem;">Ingen elever funnet</td></tr>'; return; }
  tbody.innerHTML = filtered.map(s => {
    const grp = s.groupKey ? window._groups.find(g => g.fbKey === s.groupKey) : null;
    const grpBadge = grp
      ? `<span class="group-badge" style="color:${grp.color};border-color:${grp.color};background:${grp.color}18;">${grp.emoji||'👥'} ${grp.name}</span>`
      : `<span style="color:var(--muted);font-size:.8rem;">–</span>`;
    return `<tr>
      <td data-label="Elev"><div style="display:flex;align-items:center;gap:8px;">
        <div style="width:32px;height:32px;background:var(--teal-light);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.75rem;color:var(--teal-dark);">${s.firstname[0]}${s.lastname[0]}</div>
        <strong>${s.firstname} ${s.lastname}</strong></div></td>
      <td data-label="Klasse"><span class="class-badge">${s.class}</span></td>
      <td data-label="Gruppe">${grpBadge}</td>
      <td data-label="PIN"><code style="background:var(--bg);padding:4px 8px;border-radius:6px;">${s.pin}</code></td>
      <td data-label="Saldo"><span class="balance-badge">🪙 ${s.balance||0}</span></td>
      <td data-label=""><div class="balance-actions">
        <button class="btn btn-ghost btn-sm" onclick="openSaldoModal('${s.fbKey}','add')">➕</button>
        <button class="btn btn-ghost btn-sm" onclick="openSaldoModal('${s.fbKey}','subtract')">➖</button>
        <button class="btn btn-ghost btn-sm" onclick="openSaldoModal('${s.fbKey}','set')">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="openPinModal('${s.fbKey}')" title="Endre PIN">🔑</button>
        <button class="btn btn-coral btn-sm" onclick="openDeleteModal('${s.fbKey}','${s.firstname} ${s.lastname}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

function filterStudents(v) { searchFilter = v; renderStudentTable(); }
function filterClass(v)    { classFilter  = v; renderStudentTable(); }

function updateStats() {
  const e1 = document.getElementById('stat-total');
  const e2 = document.getElementById('stat-balance');
  const e3 = document.getElementById('stat-loans');
  if (e1) e1.textContent = window._students.length;
  if (e2) e2.textContent = window._students.reduce((a,s) => a + (s.balance||0), 0);
  if (e3) e3.textContent = window._students.reduce((a,s) => a + (s.loan||0), 0);
}

// ════════════════════════════════════════════════════════════
// KLASSER
// ════════════════════════════════════════════════════════════
function renderClassManager() {
  const classes = getClassNames();
  const el = document.getElementById('class-list-display'); if (!el) return;
  if (!classes.length) { el.innerHTML = '<p style="font-size:.85rem;color:var(--muted);">Ingen klasser ennå – opprett elever først.</p>'; return; }
  el.innerHTML = classes.map(c => {
    const count = window._students.filter(s => s.class === c).length;
    return `<div class="class-row"><span class="class-badge">${c}</span><span style="font-size:.8rem;color:var(--muted);margin-left:auto;">${count} elev${count!==1?'er':''}</span></div>`;
  }).join('');
}

async function renameClass() {
  const from    = document.getElementById('rename-class-from').value;
  const to      = document.getElementById('rename-class-to').value.trim();
  const alertEl = document.getElementById('rename-alert');
  if (!from) { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Velg klassen som skal endres.</div>'; return; }
  if (!to)   { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Skriv inn det nye klassenavnet.</div>'; return; }
  if (from === to) { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Nytt navn er det samme som det gamle.</div>'; return; }
  alertEl.innerHTML = '<div class="alert alert-success">⏳ Oppdaterer…</div>';
  const updates = {};
  window._students.filter(s => s.class === from).forEach(s => { updates['students57/' + s.fbKey + '/class'] = to; });
  if (Object.keys(updates).length) await window._update(fbRef('/'), updates);
  document.getElementById('rename-class-to').value = '';
  alertEl.innerHTML = `<div class="alert alert-success">✅ «${from}» → «${to}»</div>`;
  setTimeout(() => renderClassManager(), 600);
}

// ════════════════════════════════════════════════════════════
// CSV IMPORT  (identisk med 1–4-portalen)
// ════════════════════════════════════════════════════════════
const dropZone = document.getElementById('csv-drop-zone');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleCSVFile(e.dataTransfer.files[0]); });

function handleCSVFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return;
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes('fornavn') || first.includes('navn') || first.includes('firstname');
  const dataLines = hasHeader ? lines.slice(1) : lines;
  csvParsed = dataLines.map(line => {
    const parts = line.split(/[,;]/).map(p => p.trim().replace(/^"|"$/g, ''));
    return { firstname: parts[0]||'', lastname: parts[1]||'', class: (parts[2] || window._currentTeacher?.class || '5. klasse').trim() };
  }).filter(r => r.firstname || r.lastname);

  document.getElementById('csv-preview-body').innerHTML = csvParsed.map(r =>
    `<tr><td style="padding:6px 8px;">${r.firstname}</td><td style="padding:6px 8px;">${r.lastname}</td><td style="padding:6px 8px;">${r.class}</td><td style="padding:6px 8px;color:var(--teal);">✓</td></tr>`
  ).join('');
  document.getElementById('csv-preview-title').textContent = `${csvParsed.length} elever funnet`;
  document.getElementById('csv-preview-area').style.display = 'block';
  document.getElementById('csv-import-alert').innerHTML = '';
}

async function importCSV() {
  if (!ready() || !csvParsed.length) return;
  const bal = parseInt(document.getElementById('csv-default-balance').value) || 100;
  const alertEl = document.getElementById('csv-import-alert');
  alertEl.innerHTML = '<div class="alert alert-success">⏳ Importerer…</div>';
  let count = 0;
  for (const r of csvParsed) {
    if (!r.firstname && !r.lastname) continue;
    await window._set(window._push(fbRef('students57')), {
      firstname: r.firstname, lastname: r.lastname, class: r.class,
      pin: generatePIN(), balance: bal,
      loan: 0, savings: 0, fund_low: 0, fund_high: 0, created: Date.now()
    });
    count++;
  }
  alertEl.innerHTML = `<div class="alert alert-success">✅ ${count} elever importert!</div>`;
  csvParsed = [];
  setTimeout(resetCSV, 2500);
}

function resetCSV() {
  csvParsed = [];
  document.getElementById('csv-preview-area').style.display = 'none';
  document.getElementById('csv-preview-body').innerHTML = '';
  document.getElementById('csv-import-alert').innerHTML = '';
  document.getElementById('csv-file-input').value = '';
}

// ════════════════════════════════════════════════════════════
// SALDO
// ════════════════════════════════════════════════════════════
function fondVerdi(units, rate) { return Math.round((units||0) * (rate||100)); }

function renderSaldoTable() {
  const tbody = document.getElementById('saldo-table-body'); if (!tbody) return;
  const rateLow  = window._curFundLow  || 100;
  const rateHigh = window._curFundHigh || 100;
  // Update summary
  const sumRow = document.getElementById('saldo-summary-row');
  if (sumRow && window._students.length) {
    sumRow.style.display = 'flex';
    document.getElementById('sum-bruk').textContent  = '🪙 ' + window._students.reduce((a,s)=>a+(s.balance||0),0);
    document.getElementById('sum-spare').textContent = '🪙 ' + window._students.reduce((a,s)=>a+(s.savings||0),0);
    document.getElementById('sum-fond').textContent  = '🪙 ' + window._students.reduce((a,s)=>
      a + fondVerdi(s.fund_low_units,rateLow) + fondVerdi(s.fund_high_units,rateHigh), 0);
    document.getElementById('sum-loan').textContent  = '🪙 ' + window._students.reduce((a,s)=>a+(s.loan||0),0);
  }
  if (!window._students.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:2rem;">Ingen elever</td></tr>';
    return;
  }
  tbody.innerHTML = window._students.map(s => {
    const bruk  = s.balance   || 0;
    const spare = s.savings   || 0;
    const fl    = fondVerdi(s.fund_low_units,  rateLow);
    const fh    = fondVerdi(s.fund_high_units, rateHigh);
    const loan  = s.loan      || 0;
    const total = bruk + spare + fl + fh;
    return `<tr>
      <td data-label="Elev">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:30px;height:30px;background:var(--teal-light);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.72rem;color:var(--teal-dark);flex-shrink:0;">${s.firstname[0]}${s.lastname[0]}</div>
          <div>
            <div style="font-weight:800;font-size:.88rem;">${s.firstname} ${s.lastname}</div>
            <div style="font-size:.72rem;color:var(--muted);">Total: 🪙 ${total}</div>
          </div>
        </div>
      </td>
      <td data-label="Klasse"><span class="class-badge">${s.class}</span></td>
      <td data-label="Brukskonto"><span class="balance-badge">🪙 ${bruk}</span></td>
      <td data-label="Sparekonto"><span style="background:#dbeafe;color:#1e40af;font-weight:800;padding:3px 10px;border-radius:20px;font-size:.82rem;">🪙 ${spare}</span></td>
      <td data-label="Fond lav"><span style="background:#ede9fe;color:#5b21b6;font-weight:800;padding:3px 10px;border-radius:20px;font-size:.82rem;" title="${(s.fund_low_units||0).toFixed(2)} andeler × 🪙${rateLow}">🪙 ${fl}</span></td>
      <td data-label="Fond høy"><span style="background:#ede9fe;color:#5b21b6;font-weight:800;padding:3px 10px;border-radius:20px;font-size:.82rem;" title="${(s.fund_high_units||0).toFixed(2)} andeler × 🪙${rateHigh}">🪙 ${fh}</span></td>
      <td data-label="Lån">${loan > 0 ? `<span class="badge badge-coral">📉 ${loan}</span>` : '<span style="color:var(--muted);font-size:.8rem;">–</span>'}</td>
      <td data-label=""><div class="balance-actions">
        <button class="btn btn-ghost btn-sm" onclick="openSaldoModal('${s.fbKey}','add')" title="Legg til">➕</button>
        <button class="btn btn-ghost btn-sm" onclick="openSaldoModal('${s.fbKey}','subtract')" title="Trekk fra">➖</button>
        <button class="btn btn-ghost btn-sm" onclick="openSaldoModal('${s.fbKey}','set')" title="Sett saldo">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="openSaldoModal('${s.fbKey}','reset')" title="Nullstill">🔄</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openSaldoModal(fbKey, action) {
  currentStudentId = fbKey; currentAction = action;
  const s = window._students.find(x => x.fbKey === fbKey);
  const labels = { add:'➕ Legg til', subtract:'➖ Trekk fra', set:'✏️ Sett saldo', reset:'🔄 Nullstill' };
  document.getElementById('modal-saldo-title').textContent = labels[action] + ` – ${s.firstname}`;
  if (action === 'reset') {
    const sav = s.savings || 0;
    const ln  = s.loan || 0;
    const fl  = (s.fund_low_units || 0) > 0 ? ' · fond lav' : '';
    const fh  = (s.fund_high_units || 0) > 0 ? ' · fond høy' : '';
    document.getElementById('modal-saldo-info').textContent =
      `⚠️ Nullstiller ALT: brukskonto (🪙${s.balance||0}), sparekonto (🪙${sav}), lån (🪙${ln})${fl}${fh}`;
  } else {
    document.getElementById('modal-saldo-info').textContent  = `Nåværende saldo: 🪙 ${s.balance||0}`;
  }
  document.getElementById('modal-saldo-amount').style.display = action === 'reset' ? 'none' : 'block';
  document.getElementById('modal-saldo').classList.add('open');
}

async function confirmSaldoAction() {
  const s = window._students.find(x => x.fbKey === currentStudentId);
  const amount = parseInt(document.getElementById('modal-saldo-amount').value) || 0;
  let newBal = s.balance || 0;
  if (currentAction === 'add')      newBal = newBal + amount;
  else if (currentAction === 'subtract') newBal = Math.max(0, newBal - amount);
  else if (currentAction === 'set') newBal = Math.max(0, amount);
  else if (currentAction === 'reset') newBal = 0;

  if (currentAction === 'reset') {
    // Full nullstilling: brukskonto, sparekonto, fond og lån
    const fullReset = {
      balance: 0,
      savings: 0,
      loan: 0,
      loanDate: null,
      fund_low_units: 0,
      fund_low_invested: 0,
      fund_high_units: 0,
      fund_high_invested: 0,
      withdrawalsThisWeek: 0
    };
    await window._update(fbRef('students57/' + currentStudentId), fullReset);
    await logTx(currentStudentId, 'expense', '🔄', 'Alle kontoer nullstilt av lærer', -(s.balance||0));
  } else {
    await window._update(fbRef('students57/' + currentStudentId), { balance: newBal });
    await logTx(currentStudentId, newBal > (s.balance||0) ? 'income' : 'expense', '💰',
      'Saldo justert av lærer', newBal - (s.balance||0));
  }
  closeModal('modal-saldo');
}

function openBulkModal(action) {
  bulkAction = action;
  const labels = {
    add:    '➕ Legg til – alle',
    salary: '💼 Utbetal ukentlig lønn (20 % skatt trekkes automatisk)',
    reset:  '🔄 Nullstill – alle'
  };
  document.getElementById('modal-bulk-title').textContent = labels[action];
  document.getElementById('bulk-amount-row').style.display = action === 'reset' ? 'none' : 'block';
  // Bulk-info-felt (vises ikke lenger — beholdes for bakoverkompatibilitet)
  const ti = document.getElementById('bulk-tax-info');
  if (ti) ti.style.display = 'none';
  document.getElementById('modal-bulk').classList.add('open');
}

async function confirmBulkAction() {
  // Anti-dobbeltklikk-vakt: hvis denne fortsatt kjører fra forrige klikk,
  // ignorer nye trykk. Tidligere bug: en utbetaling som tar 1-3 sekunder
  // (mange Firebase-kall i loop) lot læreren klikke "Bekreft" flere
  // ganger og dermed utbetale lønn dobbelt eller trippelt.
  if (window._bulkActionRunning) return;
  window._bulkActionRunning = true;

  // Lås knappen visuelt slik at læreren skjønner at noe skjer
  const confirmBtn = document.querySelector('#modal-bulk .btn-primary');
  const cancelBtn  = document.querySelector('#modal-bulk .btn-ghost');
  const origConfirmText = confirmBtn ? confirmBtn.textContent : '';
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ Behandler…';
    confirmBtn.style.opacity = '0.6';
    confirmBtn.style.cursor = 'wait';
  }
  if (cancelBtn) cancelBtn.disabled = true;

  try {
    const cls    = document.getElementById('bulk-class').value;
    const amount = parseInt(document.getElementById('bulk-amount').value) || 0;
    const updates = {};
    const targets = window._students.filter(s => !cls || s.class === cls);
    for (const s of targets) {
      const cur = s.balance || 0;
      let newBal = cur, txDesc = '', txAmt = 0;
      if (bulkAction === 'add') {
        newBal = cur + amount;
        txDesc = 'Ekstra fra lærer';
        txAmt = amount;
      }
      if (bulkAction === 'salary') {
        const taxAmt = Math.floor(amount * TAX_RATE);
        const net = amount - taxAmt;
        newBal = cur + net;
        txDesc = `Ukentlig lønn (netto etter ${Math.round(TAX_RATE*100)}% skatt)`;
        txAmt = net;
        updates['students57/' + s.fbKey + '/badgeTaxContributed'] = (s.badgeTaxContributed||0) + taxAmt;
        await distributeToGoalsPortal(taxAmt);
      }
      if (bulkAction === 'reset') {
        // Full nullstilling: brukskonto, sparekonto, fond og lån
        newBal = 0;
        txDesc = 'Alle kontoer nullstilt';
        txAmt = -cur;
        const base = 'students57/' + s.fbKey + '/';
        updates[base + 'savings']            = 0;
        updates[base + 'loan']               = 0;
        updates[base + 'loanDate']           = null;
        updates[base + 'fund_low_units']     = 0;
        updates[base + 'fund_low_invested']  = 0;
        updates[base + 'fund_high_units']    = 0;
        updates[base + 'fund_high_invested'] = 0;
        updates[base + 'withdrawalsThisWeek']= 0;
      }
      updates['students57/' + s.fbKey + '/balance'] = Math.max(0, newBal);
      if (txAmt !== 0) await logTx(s.fbKey, txAmt > 0 ? 'income' : 'expense', '💰', txDesc, txAmt);
    }
    await window._update(fbRef('/'), updates);
  } catch (e) {
    console.error('[Bulk-action feilet]', e);
    alert('Noe gikk galt: ' + (e.message || e) + '\n\nPrøv igjen, eller sjekk transaksjonsloggen for å se hva som rakk å skje.');
  } finally {
    // Sikrer at modalen alltid lukkes og knappen tilbakestilles,
    // også hvis det oppstod en feil underveis.
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = origConfirmText || 'Bekreft';
      confirmBtn.style.opacity = '';
      confirmBtn.style.cursor = '';
    }
    if (cancelBtn) cancelBtn.disabled = false;
    window._bulkActionRunning = false;
    closeModal('modal-bulk');
  }
}

function openDeleteModal(fbKey, name) {
  currentStudentId = fbKey;
  document.getElementById('modal-delete-text').textContent = `Slett ${name}?`;
  document.getElementById('modal-delete').classList.add('open');
}
async function confirmDelete() { await window._remove(fbRef('students57/' + currentStudentId)); closeModal('modal-delete'); }

function openPinModal(fbKey) {
  const s = window._students.find(x => x.fbKey === fbKey); if (!s) return;
  currentStudentId = fbKey;
  document.getElementById('modal-pin-name').textContent =
    s.firstname + ' ' + s.lastname + ' · Nåværende PIN: ' + s.pin;
  document.getElementById('modal-pin-input').value = '';
  document.getElementById('modal-pin-alert').innerHTML = '';
  document.getElementById('modal-pin').classList.add('open');
  setTimeout(() => document.getElementById('modal-pin-input').focus(), 100);
}

async function confirmPinChange() {
  const val    = document.getElementById('modal-pin-input').value.trim();
  const alertEl = document.getElementById('modal-pin-alert');
  if (!/^\d{4}$/.test(val)) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ PIN må være nøyaktig 4 siffer.</div>';
    return;
  }
  await window._update(fbRef('students57/' + currentStudentId), { pin: val });
  closeModal('modal-pin');
  alertEl.innerHTML = '';
}


// ════════════════════════════════════════════════════════════
// TRANSAKSJON-LOGGER
// ════════════════════════════════════════════════════════════
async function logTx(sk, type, icon, desc, amount) {
  if (!window._push || !window._set) return;
  await window._set(window._push(fbRef('transactions57/' + sk)), { type, icon, desc, amount, ts: Date.now() });
}

// ════════════════════════════════════════════════════════════
// GRUPPER
// ════════════════════════════════════════════════════════════
function selectColor(el) {
  document.querySelectorAll('#color-picker .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  selectedGroupColor = el.dataset.color;
}

async function submitGroup() {
  if (!ready()) return;
  const name  = document.getElementById('new-group-name').value.trim();
  const emoji = document.getElementById('new-group-emoji').value || '👥';
  const alertEl = document.getElementById('group-create-alert');
  if (!name) { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Skriv inn et gruppenavn.</div>'; return; }
  if (currentEditGroupKey) {
    await window._update(fbRef('groups/' + currentEditGroupKey), { name, emoji, color: selectedGroupColor });
    alertEl.innerHTML = '<div class="alert alert-success">✅ Gruppe oppdatert!</div>';
    cancelEditGroup();
  } else {
    await window._set(window._push(fbRef('groups')), { name, emoji, color: selectedGroupColor, created: Date.now() });
    alertEl.innerHTML = `<div class="alert alert-success">✅ «${name}» opprettet!</div>`;
    document.getElementById('new-group-name').value  = '';
    document.getElementById('new-group-emoji').value = '';
  }
  setTimeout(() => alertEl.innerHTML = '', 3000);
}

function openEditGroup(fbKey) {
  const g = window._groups.find(x => x.fbKey === fbKey); if (!g) return;
  currentEditGroupKey = fbKey;
  document.getElementById('new-group-name').value  = g.name;
  document.getElementById('new-group-emoji').value = g.emoji || '';
  document.querySelectorAll('#color-picker .color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === g.color));
  selectedGroupColor = g.color;
  document.getElementById('group-form-title').textContent = '✏️ Rediger gruppe';
  document.getElementById('group-submit-btn').textContent = 'Lagre endringer';
  document.getElementById('group-cancel-btn').style.display = '';
  document.getElementById('new-group-name').focus();
}

function cancelEditGroup() {
  currentEditGroupKey = null;
  document.getElementById('new-group-name').value  = '';
  document.getElementById('new-group-emoji').value = '';
  document.getElementById('group-form-title').textContent = '➕ Opprett ny gruppe';
  document.getElementById('group-submit-btn').textContent = 'Opprett gruppe';
  document.getElementById('group-cancel-btn').style.display = 'none';
}

async function deleteGroup(fbKey, name) {
  if (!confirm(`Slett gruppen «${name}»? Elever beholdes.`)) return;
  const updates = {};
  window._students.filter(s => s.groupKey === fbKey).forEach(s => { updates['students57/' + s.fbKey + '/groupKey'] = null; });
  if (Object.keys(updates).length) await window._update(fbRef('/'), updates);
  await window._remove(fbRef('groups/' + fbKey));
}

function renderGroupsPage() { renderGroupsList(); renderAssignSelects(); }

function renderGroupsList() {
  const el = document.getElementById('groups-list'); if (!el) return;
  if (!window._groups.length) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:2.5rem;color:var(--muted);"><div style="font-size:2.5rem;margin-bottom:.75rem;">👥</div><div style="font-weight:700;">Ingen grupper ennå</div><div style="font-size:.85rem;margin-top:.25rem;">Opprett din første gruppe ovenfor!</div></div>`;
    return;
  }
  el.innerHTML = window._groups.map(g => {
    const members = window._students.filter(s => s.groupKey === g.fbKey);
    const total   = members.reduce((a,s) => a + (s.balance||0), 0);
    return `<div class="group-card">
      <div class="group-card-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:44px;height:44px;border-radius:12px;background:${g.color}22;border:2px solid ${g.color};display:flex;align-items:center;justify-content:center;font-size:1.5rem;">${g.emoji||'👥'}</div>
          <div>
            <div style="font-family:'Fredoka One',cursive;font-size:1.2rem;color:${g.color};">${g.name}</div>
            <div style="font-size:.8rem;color:var(--muted);font-weight:700;">${members.length} elev${members.length!==1?'er':''} · 🪙 ${total} totalt</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="openEditGroup('${g.fbKey}')">✏️ Rediger</button>
          <button class="btn btn-coral btn-sm" onclick="deleteGroup('${g.fbKey}','${g.name.replace(/'/g,"\\'")}')">🗑️</button>
        </div>
      </div>
      <div class="group-members">
        ${members.length ? members.map(s => `
          <div style="display:flex;align-items:center;gap:6px;background:${g.color}12;border:1px solid ${g.color}44;border-radius:20px;padding:4px 10px;">
            <div style="width:22px;height:22px;background:${g.color}33;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:800;color:${g.color};">${s.firstname[0]}${s.lastname[0]}</div>
            <span style="font-size:.82rem;font-weight:700;">${s.firstname} ${s.lastname}</span>
            <span style="font-size:.75rem;color:var(--muted);">🪙${s.balance||0}</span>
            <button onclick="removeFromGroup('${s.fbKey}')" style="background:none;border:none;cursor:pointer;color:${g.color};font-size:.9rem;padding:0 2px;" title="Fjern">✕</button>
          </div>`).join('')
        : '<span style="font-size:.82rem;color:var(--muted);font-style:italic;">Ingen elever ennå</span>'}
      </div>
    </div>`;
  }).join('');
}

function renderAssignSelects() {
  const ss = document.getElementById('assign-student-select');
  const gs = document.getElementById('assign-group-select');
  if (!ss || !gs) return;
  ss.innerHTML = '<option value="">– Velg elev –</option>' + window._students.map(s => `<option value="${s.fbKey}">${s.firstname} ${s.lastname} (${s.class})</option>`).join('');
  gs.innerHTML = '<option value="">– Velg gruppe –</option>' + window._groups.map(g => `<option value="${g.fbKey}">${g.emoji||'👥'} ${g.name}</option>`).join('');
}

async function assignStudentToGroup() {
  const sk = document.getElementById('assign-student-select').value;
  const gk = document.getElementById('assign-group-select').value;
  if (!sk || !gk) { alert('Velg både elev og gruppe.'); return; }
  await window._update(fbRef('students57/' + sk), { groupKey: gk });
}
async function removeStudentFromGroup() {
  const sk = document.getElementById('assign-student-select').value;
  if (!sk) { alert('Velg en elev først.'); return; }
  await window._update(fbRef('students57/' + sk), { groupKey: null });
}
async function removeFromGroup(sk) { await window._update(fbRef('students57/' + sk), { groupKey: null }); }

// ════════════════════════════════════════════════════════════
// OPPDRAG
// ════════════════════════════════════════════════════════════


function cancelJobEdit() {
  currentEditJobKey = null;
  ['job-title','job-emoji','job-desc','job-deadline'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('job-pay').value = '50';
  const mu = document.getElementById('job-max-uses'); if (mu) mu.value = '';
  document.getElementById('job-form-title').textContent  = '➕ Ny jobb';
  document.getElementById('job-submit-btn').textContent  = 'Opprett jobb';
  document.getElementById('job-cancel-btn').style.display = 'none';
  setJobType('task');
}

// Velger mellom engangsoppdrag og fast jobb i skjemaet
window._currentJobType = 'task';
function setJobType(type) {
  window._currentJobType = type;
  const taskBtn = document.getElementById('job-type-task-btn');
  const salaryBtn = document.getElementById('job-type-salary-btn');
  const maxRow = document.getElementById('job-max-uses-row');
  const deadlineRow = document.getElementById('job-deadline-row');
  const salaryInfo = document.getElementById('job-salary-info-row');
  const payLabel = document.getElementById('job-pay-label');
  const submitBtn = document.getElementById('job-submit-btn');
  const formTitle = document.getElementById('job-form-title');
  if (!taskBtn || !salaryBtn) return;
  if (type === 'salary') {
    taskBtn.className = 'btn btn-ghost'; salaryBtn.className = 'btn btn-primary';
    if (maxRow) maxRow.style.display = 'none';
    if (deadlineRow) deadlineRow.style.display = 'none';
    if (salaryInfo) salaryInfo.style.display = 'block';
    if (payLabel) payLabel.textContent = 'Ukelønn (mynter, brutto)';
    if (!currentEditJobKey) {
      if (submitBtn) submitBtn.textContent = 'Opprett fast jobb';
      if (formTitle) formTitle.textContent = '➕ Ny fast jobb';
    }
  } else {
    taskBtn.className = 'btn btn-primary'; salaryBtn.className = 'btn btn-ghost';
    if (maxRow) maxRow.style.display = '';
    if (deadlineRow) deadlineRow.style.display = '';
    if (salaryInfo) salaryInfo.style.display = 'none';
    if (payLabel) payLabel.textContent = 'Betaling (mynter)';
    if (!currentEditJobKey) {
      if (submitBtn) submitBtn.textContent = 'Opprett oppdrag';
      if (formTitle) formTitle.textContent = '➕ Nytt engangsoppdrag';
    }
  }
}

async function deleteJob(fbKey) {
  const j = (window._jobs||[]).find(x => x.fbKey === fbKey);
  const label = j?.type === 'salary' ? 'fast jobb' : 'oppdrag';
  if (!confirm('Slett ' + label + '?')) return;
  await window._remove(fbRef('jobs/' + fbKey));
}

// Tildel/fjern elev til/fra fast jobb
async function assignStudentToJob(jobKey, studentKey) {
  if (!jobKey || !studentKey) return;
  await window._update(fbRef('jobs/' + jobKey + '/assigned'), { [studentKey]: true });
  // Fjern eventuell søknad og tidligere avslag når eleven faktisk ansettes
  await window._remove(fbRef('jobs/' + jobKey + '/applicants/' + studentKey));
  await window._remove(fbRef('jobs/' + jobKey + '/rejected/' + studentKey));
}
async function unassignStudentFromJob(jobKey, studentKey) {
  if (!jobKey || !studentKey) return;
  await window._remove(fbRef('jobs/' + jobKey + '/assigned/' + studentKey));
}
async function approveApplicant(jobKey, studentKey) {
  await assignStudentToJob(jobKey, studentKey);
}
// Avslå søknad: lagre tidsstempel slik at eleven har 7 dagers karantene
async function rejectApplicant(jobKey, studentKey) {
  await window._update(fbRef('jobs/' + jobKey + '/rejected'), { [studentKey]: Date.now() });
  await window._remove(fbRef('jobs/' + jobKey + '/applicants/' + studentKey));
}
// Lærer kan åpne/stenge søknader på en fast jobb
async function toggleApplicationsOpen(jobKey) {
  const j = (window._jobs||[]).find(x => x.fbKey === jobKey);
  if (!j) return;
  const cur = (j.applicationsOpen !== false); // default åpen
  await window._update(fbRef('jobs/' + jobKey), { applicationsOpen: !cur });
}

function showJobQR(fbKey) {
  const j = window._jobs.find(x => x.fbKey === fbKey); if (!j) return;
  const payload = JSON.stringify({ type:'job', jobKey: fbKey, title: j.title, pay: j.pay });

  // Sett tekst og åpne modalen FØR QR genereres – da er elementet synlig
  document.getElementById('modal-job-qr-title').textContent = `${j.emoji||'💼'} ${j.title}`;
  document.getElementById('modal-job-qr-desc').textContent  = `Brutto: 🪙 ${j.pay} · Elev får netto: 🪙 ${Math.floor(j.pay * 0.8)} (20% til sparemål)`;
  const box = document.getElementById('modal-job-qr-box');
  box.innerHTML = '<div style="width:250px;height:250px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.85rem;">Genererer QR…</div>';
  document.getElementById('modal-job-qr').classList.add('open');

  // Vent til nettleseren har tegnet opp modalen, DERETTER generer QR
  requestAnimationFrame(() => requestAnimationFrame(() => {
    box.innerHTML = '';
    try {
      new QRCode(box, {
        text: payload,
        width: 250,
        height: 250,
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch(e) {
      box.innerHTML = '<p style="color:var(--coral);font-size:.82rem;">Kunne ikke generere QR</p>';
    }
    // Oppdater print-knapp med canvas data-URL etter at QR er tegnet
    setTimeout(() => {
      const canvas = box.querySelector('canvas');
      if (canvas) {
        const btn = document.getElementById('job-qr-print-btn');
        if (btn) btn._qrDataUrl = canvas.toDataURL('image/png');
      }
    }, 200);
  }));
}

function printJobQRCard() {
  const title = document.getElementById('modal-job-qr-title').textContent;
  const desc  = document.getElementById('modal-job-qr-desc').textContent;
  const btn   = document.getElementById('job-qr-print-btn');
  const canvas = document.getElementById('modal-job-qr-box').querySelector('canvas');
  const dataUrl = (btn && btn._qrDataUrl) || (canvas && canvas.toDataURL('image/png')) || '';
  if (!dataUrl) { alert('QR ikke klar ennå, vent et sekund og prøv igjen.'); return; }
  const win = window.open('', '', 'width=500,height=600');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '@media print{@page{size:A6;margin:5mm}}body{font-family:sans-serif;text-align:center;padding:8mm;margin:0;}' +
    'h2{font-size:16px;margin:.4rem 0}.desc{font-size:12px;color:#555}.logo{font-size:13px;font-weight:700;color:#1e0f52}' +
    '</style></head><body>' +
    '<div class="logo">🪙 Myntland – Oppdrag</div>' +
    `<h2>${title}</h2>` +
    `<img src="${dataUrl}" style="width:180px;height:180px;margin:.5rem auto;display:block;">` +
    `<div class="desc">${desc}</div>` +
    '<script>setTimeout(function(){window.print();},300);<\/script></body></html>');
  win.document.close();
}

async function approveJob() {
  const sk = document.getElementById('job-approve-student').value;
  const jk = document.getElementById('job-approve-job').value;
  const alertEl = document.getElementById('job-approve-alert');
  if (!sk || !jk) { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Velg elev og oppdrag.</div>'; return; }
  const j = window._jobs.find(x => x.fbKey === jk);
  const s = window._students.find(x => x.fbKey === sk);
  if (!j || !s) return;
  const net = Math.floor(j.pay * 0.8);
  const taxAmt = j.pay - net;
  await window._update(fbRef('students57/' + sk), {
    balance: (s.balance||0) + net,
    badgeTaxContributed: (s.badgeTaxContributed||0) + taxAmt
  });
  await logTx(sk, 'income', '💼', `Oppdrag: ${j.title} (netto etter 20% skatt)`, net);
  alertEl.innerHTML = `<div class="alert alert-success">✅ 🪙 ${net} utbetalt til ${s.firstname}!</div>`;
  setTimeout(() => alertEl.innerHTML = '', 3000);
}

function renderJobsList() {
  const taskEl = document.getElementById('jobs-list');
  const salaryEl = document.getElementById('salary-jobs-list');
  const allJobs = window._jobs || [];
  const taskJobs = allJobs.filter(j => (j.type || 'task') !== 'salary');
  const salaryJobs = allJobs.filter(j => j.type === 'salary');

  // Engangsoppdrag (med QR)
  if (taskEl) {
    if (!taskJobs.length) {
      taskEl.innerHTML = '<p style="color:var(--muted);font-size:.9rem;">Ingen engangsoppdrag.</p>';
    } else {
      taskEl.innerHTML = taskJobs.map(j => `
        <div style="background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:1.1rem;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px;">
          <div style="width:48px;height:48px;border-radius:12px;background:var(--amber-light);display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0;">${j.emoji||'💼'}</div>
          <div style="flex:1;">
            <div style="font-weight:800;font-size:.95rem;">${j.title}</div>
            <div style="font-size:.82rem;color:var(--muted);margin-top:2px;">${j.desc||''}${j.deadline?' · Frist: '+j.deadline:''}</div>
            <div style="margin-top:4px;"><span class="badge badge-amber">Brutto 🪙 ${j.pay}</span> <span class="badge" style="background:var(--teal-light);color:var(--teal-dark);">Netto 🪙 ${Math.floor(j.pay*.8)}</span></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <button class="btn btn-primary btn-sm" onclick="showJobQR('${j.fbKey}')">⬛ QR</button>
            <button class="btn btn-coral btn-sm"   onclick="deleteJob('${j.fbKey}')">🗑️</button>
          </div>
        </div>`).join('');
    }
  }

  // Faste jobber (ukelønn fredag)
  if (salaryEl) {
    if (!salaryJobs.length) {
      salaryEl.innerHTML = '<p style="color:var(--muted);font-size:.9rem;">Ingen faste jobber ennå.</p>';
    } else {
      salaryEl.innerHTML = salaryJobs.map(j => {
        const assigned = j.assigned ? Object.keys(j.assigned) : [];
        const applicants = j.applicants ? Object.keys(j.applicants) : [];
        const rejected = j.rejected || {};
        const tax = (window._settings?.taxRate || 20) / 100;
        const net = Math.floor((j.pay||0) * (1 - tax));
        const appsOpen = (j.applicationsOpen !== false); // default åpne

        const assignedHTML = assigned.length
          ? assigned.map(sk => {
              const s = window._students.find(x => x.fbKey === sk);
              const name = s ? `${s.firstname} ${s.lastname.charAt(0)}.` : '(ukjent elev)';
              return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--teal-light);padding:6px 10px;border-radius:8px;margin-bottom:4px;font-size:.85rem;">
                <span style="font-weight:700;color:var(--teal-dark);">👤 ${name}</span>
                <button class="btn btn-coral btn-sm" onclick="unassignStudentFromJob('${j.fbKey}','${sk}')" style="padding:3px 9px;font-size:.75rem;">Fjern</button>
              </div>`;
            }).join('')
          : '<p style="font-size:.8rem;color:var(--muted);font-style:italic;margin:4px 0;">Ingen ansatte enn\u00e5</p>';

        const applicantsHTML = applicants.length
          ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">
              <div style="font-size:.8rem;font-weight:800;color:var(--coral);margin-bottom:4px;">📨 Søknader (${applicants.length})</div>
              ${applicants.map(sk => {
                const s = window._students.find(x => x.fbKey === sk);
                const name = s ? `${s.firstname} ${s.lastname.charAt(0)}.` : '(ukjent)';
                return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--amber-light);padding:6px 10px;border-radius:8px;margin-bottom:4px;font-size:.85rem;">
                  <span style="font-weight:700;">${name}</span>
                  <div style="display:flex;gap:4px;">
                    <button class="btn btn-primary btn-sm" onclick="approveApplicant('${j.fbKey}','${sk}')" style="padding:3px 9px;font-size:.75rem;">✅ Ansett</button>
                    <button class="btn btn-ghost btn-sm" onclick="rejectApplicant('${j.fbKey}','${sk}')" style="padding:3px 9px;font-size:.75rem;">Avslå</button>
                  </div>
                </div>`;
              }).join('')}
            </div>`
          : '';

        // Vis avslåtte søkere som har aktiv karantene (innen 7 dager)
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const rejectedActive = Object.entries(rejected)
          .filter(([sk, ts]) => (now - (ts||0)) < SEVEN_DAYS && !assigned.includes(sk));
        const rejectedHTML = rejectedActive.length
          ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">
              <div style="font-size:.8rem;font-weight:800;color:var(--muted);margin-bottom:4px;">⏳ Avslåtte (kan søke igjen senere)</div>
              ${rejectedActive.map(([sk, ts]) => {
                const s = window._students.find(x => x.fbKey === sk);
                const name = s ? `${s.firstname} ${s.lastname.charAt(0)}.` : '(ukjent)';
                const daysLeft = Math.max(1, Math.ceil((SEVEN_DAYS - (now - ts)) / (24*60*60*1000)));
                return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg);padding:6px 10px;border-radius:8px;margin-bottom:4px;font-size:.82rem;">
                  <span style="color:var(--muted);font-weight:700;">${name}</span>
                  <span style="font-size:.75rem;color:var(--muted);font-weight:700;">${daysLeft} dag${daysLeft===1?'':'er'} igjen</span>
                </div>`;
              }).join('')}
            </div>`
          : '';

        const toggleBtnLabel = appsOpen ? '🟢 Søknader åpne' : '🔴 Søknader stengt';
        const toggleBtnClass = appsOpen ? 'btn btn-primary btn-sm' : 'btn btn-coral btn-sm';

        return `
        <div style="background:var(--white);border:1.5px solid var(--teal);border-radius:14px;padding:1.1rem;margin-bottom:10px;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="width:48px;height:48px;border-radius:12px;background:var(--teal-light);display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0;">${j.emoji||'💼'}</div>
            <div style="flex:1;">
              <div style="font-weight:800;font-size:.95rem;">${j.title} <span class="badge" style="background:var(--teal);color:white;font-size:.65rem;">FAST · FREDAG</span></div>
              <div style="font-size:.82rem;color:var(--muted);margin-top:2px;">${j.desc||''}</div>
              <div style="margin-top:4px;"><span class="badge badge-amber">Ukelønn brutto 🪙 ${j.pay}</span> <span class="badge" style="background:var(--teal-light);color:var(--teal-dark);">Netto 🪙 ${net}</span></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <button class="${toggleBtnClass}" onclick="toggleApplicationsOpen('${j.fbKey}')" style="white-space:nowrap;">${toggleBtnLabel}</button>
              <button class="btn btn-coral btn-sm" onclick="deleteJob('${j.fbKey}')">🗑️ Slett</button>
            </div>
          </div>
          <div style="margin-top:10px;">
            <div style="font-size:.8rem;font-weight:800;color:var(--teal-dark);margin-bottom:4px;">👥 Ansatte (${assigned.length})</div>
            ${assignedHTML}
            <div style="display:flex;gap:6px;margin-top:6px;">
              <select id="assign-sel-${j.fbKey}" style="flex:1;padding:7px;border-radius:8px;border:1.5px solid var(--border);font-size:.85rem;">
                <option value="">– Velg elev å ansette –</option>
                ${window._students
                  .filter(s => !assigned.includes(s.fbKey))
                  .map(s => `<option value="${s.fbKey}">${s.firstname} ${s.lastname} (${s.class})</option>`).join('')}
              </select>
              <button class="btn btn-primary btn-sm" onclick="assignStudentToJob('${j.fbKey}', document.getElementById('assign-sel-${j.fbKey}').value)">Ansett</button>
            </div>
            ${applicantsHTML}
            ${rejectedHTML}
          </div>
        </div>`;
      }).join('');
    }
  }

  refreshJobSelects();
}

function refreshJobSelects() {
  const ss = document.getElementById('job-approve-student');
  const js = document.getElementById('job-approve-job');
  if (!ss || !js) return;
  ss.innerHTML = '<option value="">– Velg elev –</option>' + window._students.map(s => `<option value="${s.fbKey}">${s.firstname} ${s.lastname} (${s.class})</option>`).join('');
  const taskJobs = (window._jobs||[]).filter(j => (j.type || 'task') !== 'salary');
  js.innerHTML = '<option value="">– Velg oppdrag –</option>' + taskJobs.map(j => `<option value="${j.fbKey}">${j.emoji||'💼'} ${j.title} (${j.pay}🪙)</option>`).join('');
}

// ════════════════════════════════════════════════════════════
// BUTIKK 5-7
// ════════════════════════════════════════════════════════════
let shop57Filter = '';

async function addShop57Item() {
  if (!ready()) return;
  const emoji   = document.getElementById('s57-emoji').value || '🛒';
  const name    = document.getElementById('s57-name').value.trim();
  const price   = parseInt(document.getElementById('s57-price').value) || 1;
  const cat     = document.getElementById('s57-category').value;
  const alertEl = document.getElementById('s57-alert');
  if (!name) { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Skriv inn varenavn.</div>'; return; }
  await window._set(window._push(fbRef('shop57')), { emoji, name, price, category: cat, created: Date.now() });
  ['s57-emoji','s57-name','s57-price'].forEach(id => document.getElementById(id).value = '');
  alertEl.innerHTML = `<div class="alert alert-success">✅ «${name}» lagt til!</div>`;
  setTimeout(() => alertEl.innerHTML = '', 3000);
}

function filterShop57(v) { shop57Filter = v.toLowerCase(); renderShop57List(); }

function renderShop57List() {
  const tbody = document.getElementById('shop57-table-body'); if (!tbody) return;
  const countEl = document.getElementById('s57-count');
  if (countEl) countEl.textContent = window._shop57.length;
  const items = window._shop57.filter(x => !shop57Filter || x.name.toLowerCase().includes(shop57Filter) || (x.category||'').toLowerCase().includes(shop57Filter));
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:2rem;">Ingen varer ennå.</td></tr>'; return; }
  tbody.innerHTML = items.map(x => `<tr>
    <td><div style="display:flex;align-items:center;gap:10px;"><span style="font-size:1.8rem;">${x.emoji}</span><strong>${x.name}</strong></div></td>
    <td><span class="badge badge-teal">${x.category}</span></td>
    <td><span class="balance-badge">🪙 ${x.price}</span></td>
    <td><button class="btn btn-primary btn-sm" onclick="showShopItemQR('${x.fbKey}')">⬛ QR</button></td>
    <td><button class="btn btn-coral btn-sm" onclick="removeShop57('${x.fbKey}')">🗑️</button></td>
  </tr>`).join('');
}

async function removeShop57(fbKey) { await window._remove(fbRef('shop57/' + fbKey)); }

function showShopItemQR(fbKey) {
  const item = window._shop57.find(x => x.fbKey === fbKey); if (!item) return;
  const payload = JSON.stringify({ type: 'purchase', fbKey: item.fbKey, name: item.name, emoji: item.emoji, price: item.price });

  // Bruker QR Server API – returnerer ferdig PNG, ingen canvas/synlighetsproblemer
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=' + encodeURIComponent(payload);

  const box = document.getElementById('modal-shop-qr-box');
  box.innerHTML = `
    <div style="text-align:center">
      <img id="shop-qr-img" src="${qrUrl}"
           style="width:200px;height:200px;border:2px solid var(--border);border-radius:8px;padding:6px;background:white;"
           onerror="this.parentElement.innerHTML='<div style=color:var(--coral);font-size:.85rem;padding:1rem>Ingen internettforbindelse – QR kan ikke genereres</div>'">
    </div>`;

  document.getElementById('modal-shop-qr-title').textContent = `${item.emoji} ${item.name}`;
  document.getElementById('modal-shop-qr-desc').textContent  = `Pris: 🪙 ${item.price} · Eleven scanner med bankkortet`;

  const printBtn = document.getElementById('modal-shop-qr-print');
  if (printBtn) {
    printBtn.onclick = () => {
      const win = window.open('', '', 'width=500,height=600');
      win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
        '@media print{@page{size:A6;margin:5mm}}body{font-family:sans-serif;text-align:center;padding:8mm;margin:0;}' +
        'h2{font-size:18px;margin:.4rem 0}.price{font-size:16px;font-weight:800;color:#085041}.hint{font-size:11px;color:#5a7a5a}' +
        '</style></head><body>' +
        '<p style="font-size:13px;font-weight:700;color:#085041">🪙 Myntland Butikk</p>' +
        `<h2>${item.emoji} ${item.name}</h2><div class="price">🪙 ${item.price}</div>` +
        `<img src="${qrUrl}" style="width:180px;height:180px;margin:.5rem auto;display:block;" crossorigin="anonymous">` +
        '<div class="hint">Scan med bankkortet</div>' +
        '<script>setTimeout(function(){window.print();},400);<\/script></body></html>');
      win.document.close();
    };
  }
  document.getElementById('modal-shop-qr').classList.add('open');
}

// ════════════════════════════════════════════════════════════
// QR KODER
// ════════════════════════════════════════════════════════════
function generateRewardQRCodes() {
  [10,50,100].forEach(amount => {
    const el = document.getElementById('qr-' + amount);
    if (el && !el.children.length) try { new QRCode(el, { text: JSON.stringify({ type:'reward', amount }), width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M }); } catch(e) {}
  });
}

// ── Egendefinerte belønninger (57) ──────────────────────────────────────────
async function addCustomReward57() {
  const amount  = parseInt(document.getElementById('custom-qr-amount').value) || 0;
  const desc    = document.getElementById('custom-qr-desc').value.trim();
  const alertEl = document.getElementById('custom-reward-alert');
  if (!amount || amount < 1) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Skriv inn et gyldig beløp.</div>'; return;
  }
  if (!ready()) { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Firebase ikke klar.</div>'; return; }
  await window._set(window._push(fbRef('customRewards57')), {
    amount, desc: desc || `+${amount} mynter`, created: Date.now()
  });
  document.getElementById('custom-qr-amount').value = '75';
  document.getElementById('custom-qr-desc').value   = '';
  alertEl.innerHTML = `<div class="alert alert-success">✅ Belønning på 🪙 ${amount} lagt til!</div>`;
  setTimeout(() => alertEl.innerHTML = '', 2500);
}

function renderCustomRewards57() {
  const el = document.getElementById('custom-rewards-list'); if (!el) return;
  if (!window._customRewards57.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:.85rem;">Ingen egendefinerte belønninger ennå.</p>';
    return;
  }
  el.innerHTML = window._customRewards57.map(r => `
    <div style="display:flex;align-items:center;gap:12px;padding:.9rem 1rem;background:var(--bg);border-radius:12px;margin-bottom:8px;">
      <div style="width:36px;height:36px;background:var(--teal-light);border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:'Fredoka One',cursive;color:var(--teal-dark);font-size:.8rem;flex-shrink:0;">🪙${r.amount}</div>
      <div style="flex:1;">
        <div style="font-weight:800;font-size:.9rem;">+${r.amount} 🪙</div>
        <div style="font-size:.78rem;color:var(--muted);">${r.desc}</div>
      </div>
      <div id="mini-qr57-${r.fbKey}" style="width:60px;height:60px;flex-shrink:0;"></div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <button class="btn btn-primary btn-sm" onclick="printCustomReward57('${r.fbKey}')">🖨️</button>
        <button class="btn btn-coral btn-sm"   onclick="deleteCustomReward57('${r.fbKey}')">🗑️</button>
      </div>
    </div>`).join('');
  // Render mini QRs – bruk popup-teknikken for inline via canvas-data
  window._customRewards57.forEach(r => {
    const el = document.getElementById('mini-qr57-' + r.fbKey);
    if (el && !el.children.length) {
      try {
        new QRCode(el, {
          text: JSON.stringify({ type:'reward', amount:r.amount, desc:r.desc }),
          width: 60, height: 60, correctLevel: QRCode.CorrectLevel.L
        });
      } catch(e) {}
    }
  });
}

async function deleteCustomReward57(fbKey) {
  if (!confirm('Slett denne belønningen?')) return;
  await window._remove(fbRef('customRewards57/' + fbKey));
}

function printCustomReward57(fbKey) {
  const r = window._customRewards57.find(x => x.fbKey === fbKey); if (!r) return;
  _printRewardCards57([r]);
}

function printAllCustomRewards57() {
  if (!window._customRewards57.length) { alert('Ingen belønninger å skrive ut.'); return; }
  _printRewardCards57(window._customRewards57);
}

function printSingleQR(elId, label) {
  // Hent payload fra QR-elementets canvas eller img
  const src = document.getElementById(elId); if (!src) return;
  const canvas = src.querySelector('canvas');
  const img    = src.querySelector('img');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : '');
  if (!dataUrl) { alert('QR ikke klar – vent litt og prøv igjen.'); return; }
  const amount = parseInt(label);
  const payload = JSON.stringify({ type:'reward', amount });
  // Skriv ut med samme design som egendefinerte belønninger
  const win = window.open('', '_blank', 'width=800,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700;800&display=swap" rel="stylesheet">
    <style>
      @media print{@page{size:A4 portrait;margin:0}}
      body{margin:0;padding:8mm;font-family:'Nunito',sans-serif;background:white;}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm;}
      .card{border:1.5mm solid #534AB7;border-radius:5mm;padding:7mm;display:flex;flex-direction:column;align-items:center;gap:4mm;page-break-inside:avoid;}
      .logo{font-family:'Fredoka One',cursive;font-size:5mm;color:#1e0f52;}
      .amount{font-family:'Fredoka One',cursive;font-size:12mm;color:#534AB7;}
      .desc{font-size:3.5mm;color:#5a5080;text-align:center;font-weight:700;}
      .qr-wrap{display:flex;justify-content:center;align-items:center;}
    </style>
  </head><body>
    <div class="grid">
      ${[0,1,2,3].map(()=>`<div class="card">
        <div class="logo">🪙 Myntland</div>
        <div class="amount">+${amount} 🪙</div>
        <div class="qr-wrap"><img src="${dataUrl}" style="width:130px;height:130px;"></div>
        <div class="desc">Belønning</div>
      </div>`).join('')}
    </div>
    <script>setTimeout(()=>{window.focus();window.print();},300);<\/script>
  </body></html>`);
  win.document.close();
}

function _printRewardCards57(rewards) {
  const payloads = rewards.map(r => JSON.stringify({ type:'reward', amount:r.amount, desc:r.desc }));
  const cardsHTML = rewards.map((r, i) =>
    `<div class="card">
      <div class="logo">🪙 Myntland</div>
      <div class="amount">+${r.amount} 🪙</div>
      <div class="qr-wrap" id="pqr${i}"></div>
      <div class="desc">${r.desc}</div>
    </div>`
  ).join('');
  const win = window.open('', '_blank', 'width=800,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700;800&display=swap" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
    <style>
      @media print{@page{size:A4 portrait;margin:0}}
      body{margin:0;padding:8mm;font-family:'Nunito',sans-serif;background:white;}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm;}
      .card{border:1.5mm solid #534AB7;border-radius:5mm;padding:7mm;display:flex;flex-direction:column;align-items:center;gap:4mm;page-break-inside:avoid;}
      .logo{font-family:'Fredoka One',cursive;font-size:5mm;color:#1e0f52;}
      .amount{font-family:'Fredoka One',cursive;font-size:12mm;color:#534AB7;}
      .desc{font-size:3.5mm;color:#5a5080;text-align:center;font-weight:700;}
      .qr-wrap{display:flex;justify-content:center;align-items:center;}
    </style>
  </head><body>
    <div class="grid">${cardsHTML}</div>
    <script>
      var payloads=${JSON.stringify(payloads)};
      function makeAll(){
        var done=true;
        for(var i=0;i<payloads.length;i++){
          var el=document.getElementById('pqr'+i);
          if(!el){done=false;continue;}
          if(el.children.length>0)continue;
          try{new QRCode(el,{text:payloads[i],width:130,height:130,correctLevel:QRCode.CorrectLevel.M});}catch(e){done=false;}
        }
        return done;
      }
      var att=0;var poll=setInterval(function(){att++;if(makeAll()||att>40){clearInterval(poll);setTimeout(function(){window.focus();window.print();},400);}},150);
    <\/script>
  </body></html>`);
  win.document.close();
}

// ════════════════════════════════════════════════════════════════════
// MYNTLAND BANKKORT — shared helper
// Bygger en komplett HTML-side med 8 forsider + 8 baksider per A4-side.
// Brukes av begge lærerportaler (1–4 og 5–7) til utskrift av bankkort.
// ════════════════════════════════════════════════════════════════════
window.buildMyntlandBankCardsHTML = function(students, opts) {
  opts = opts || {};
  var showPin   = !!opts.showPin;
  var getAvatar = opts.getAvatarSVG;            // beholdt for kompatibilitet
  var title     = opts.title || 'Myntland · Bankkort';
  var THEMES = ['theme-gull','theme-turkis','theme-korall','theme-lilla','theme-lime','theme-skog'];

  function hashStr(str) {
    var h = 0, i; str = String(str||'');
    for (i = 0; i < str.length; i++) h = ((h<<5) - h) + str.charCodeAt(i);
    return Math.abs(h);
  }
  function fakePAN(s) {
    var h = hashStr((s.fbKey||'') + (s.firstname||'') + (s.lastname||''));
    var last4 = String(h % 10000).padStart(4, '0');
    return '4900 41•• •••• ' + last4;
  }
  function escapeHTML(s) {
    return String(s||'').replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  // QR: inline-vektor hvis qrToSVG finnes (1.–4.-portalen), ellers QR-bilde-API.
  // Selve kortdesignen blir lik uansett — kun teknikken bak QR-en varierer.
  function qrMarkup(payload) {
    if (typeof window.qrToSVG === 'function') return window.qrToSVG(payload, 16, 'L');
    var url = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data='
      + encodeURIComponent(JSON.stringify(payload));
    return '<img src="' + url + '" alt="QR" crossorigin="anonymous">';
  }

  // Myntland-mynt — logo-emblem i båndet og på baksiden. Ren vektor.
  function coinSVG() {
    return '<svg viewBox="0 0 60 60" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="30" cy="30" r="24" fill="#F5C849" stroke="#2A1F3D" stroke-width="2.5"/>'
      + '<circle cx="30" cy="30" r="20" fill="none" stroke="#C99517" stroke-width="1"/>'
      + '<circle cx="30" cy="30" r="17" fill="none" stroke="#2A1F3D" stroke-width=".6" stroke-dasharray="1.5,1.5" opacity=".55"/>'
      + '<text x="30" y="39" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="24" font-weight="900" font-style="italic" fill="#2A1F3D">M</text>'
      + '</svg>';
  }
  // Liten chip — gir kortet et umiddelbart bankkort-preg. Ren vektor.
  function chipSVG() {
    return '<svg viewBox="0 0 46 34" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">'
      + '<rect x="1" y="1" width="44" height="32" rx="5" fill="#E9BE44" stroke="#B8901F" stroke-width="1.5"/>'
      + '<line x1="1" y1="12.3" x2="45" y2="12.3" stroke="#B8901F" stroke-width="1.2"/>'
      + '<line x1="1" y1="21.7" x2="45" y2="21.7" stroke="#B8901F" stroke-width="1.2"/>'
      + '<line x1="16" y1="1" x2="16" y2="33" stroke="#B8901F" stroke-width="1.2"/>'
      + '<line x1="30" y1="1" x2="30" y2="33" stroke="#B8901F" stroke-width="1.2"/>'
      + '</svg>';
  }

  function frontHTML(s, idx) {
    var theme   = THEMES[idx % THEMES.length];
    var display = escapeHTML((s.firstname||'') + ' ' + (s.lastname||'').charAt(0) + '.');
    var pinHTML = (showPin && s.pin)
      ? '<span class="pin-val">' + escapeHTML(s.pin) + '</span>'
      : '<span class="pin-val pin-blank">– – – –</span>';
    var klasse = s.class ? 'KLASSE ' + escapeHTML(s.class) : '';
    return ''
      + '<div class="card-slot">'
      +   '<div class="bank ' + theme + '">'
      +     '<div class="band">'
      +       '<span class="brand">MYNTLAND</span>'
      +       '<span class="emblem">' + coinSVG() + '</span>'
      +     '</div>'
      +     '<div class="body">'
      +       '<div class="r-top">'
      +         '<div class="top-left">'
      +           '<span class="chip">' + chipSVG() + '</span>'
      +           '<span class="klasse">' + klasse + '</span>'
      +         '</div>'
      +         '<div class="qr">' + qrMarkup({ type:'login', fbKey:s.fbKey }) + '</div>'
      +       '</div>'
      +       '<div class="cardnum">' + fakePAN(s) + '</div>'
      +       '<div class="r-bot">'
      +         '<div class="holder"><span class="lbl">KORTHOLDER</span><span class="navn">' + display + '</span></div>'
      +         '<div class="pin"><span class="lbl">PIN</span>' + pinHTML + '</div>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }
  function backHTML() {
    return ''
      + '<div class="card-slot">'
      +   '<div class="back">'
      +     '<div class="back-coin">' + coinSVG() + '</div>'
      +     '<div class="back-logo">MYNTLAND</div>'
      +     '<div class="back-sub">Klassens sparebank</div>'
      +     '<div class="back-name"><span class="bn-lbl">ELEVENS NAVN</span><span class="bn-line"></span></div>'
      +   '</div>'
      + '</div>';
  }

  // Bygg sider — 8 kort per A4, forside + bakside annenhver side.
  var pagesHTML = '';
  var emptySlot = '<div class="card-slot card-slot-empty"></div>';
  for (var i = 0; i < students.length; i += 8) {
    var chunk = students.slice(i, i + 8);
    var fronts = chunk.map(function(s, j){ return frontHTML(s, i + j); }).join('');
    for (var fp = chunk.length; fp < 8; fp++) fronts += emptySlot;
    var backs = '';
    for (var k = 0; k < 8; k++) backs += backHTML();
    pagesHTML += '<div class="page"><div class="card-grid">' + fronts + '</div></div>';
    pagesHTML += '<div class="page back-page"><div class="card-grid">' + backs + '</div></div>';
  }

  var css = ''
    + '@page{size:A4 portrait;margin:8mm}'
    + '*{box-sizing:border-box}'
    + 'html,body{margin:0;padding:0;background:white;font-family:"Nunito",sans-serif;color:#2A1F3D;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '.page{width:194mm;height:281mm;position:relative;overflow:hidden;page-break-after:always;break-after:page;background:white}'
    + '.page:last-of-type{page-break-after:auto}'
    + '.card-grid{position:absolute;inset:6mm 0 6mm 0;display:grid;grid-template-columns:repeat(2,96mm);grid-template-rows:repeat(4,66mm);gap:0;justify-content:center}'
    + '.card-slot{position:relative;padding:0}'
    + '.card-slot-empty{visibility:hidden}'
    /* Klippelinjer — KUN på forsidearket, aldri på baksiden */
    + '.page:not(.back-page) .card-slot{border-right:1px dashed #B0A8C0;border-bottom:1px dashed #B0A8C0}'
    + '.page:not(.back-page) .card-grid>.card-slot:nth-child(2n){border-right:none}'
    + '.page:not(.back-page) .card-grid>.card-slot:nth-child(n+7){border-bottom:none}'
    /* FORSIDE — dus temabakgrunn, farget bånd */
    + '.bank{width:100%;height:100%;background:var(--cbg,#FFFFFF);display:grid;grid-template-rows:9mm 1fr;overflow:hidden}'
    + '.bank .band{background:var(--ca,#F5C849);display:flex;align-items:center;justify-content:space-between;padding:0 5mm}'
    + '.bank .band .brand{font-family:"Bowlby One",sans-serif;font-size:9pt;letter-spacing:.06em;color:#2A1F3D}'
    + '.bank .band .emblem{width:6mm;height:6mm}'
    + '.bank .band .emblem svg{display:block;width:100%;height:100%}'
    + '.bank.theme-korall .band .brand,.bank.theme-lilla .band .brand,.bank.theme-skog .band .brand{color:#FBF2D6}'
    + '.bank .body{display:grid;grid-template-rows:auto auto 1fr;padding:4mm 5mm}'
    + '.bank .r-top{display:flex;justify-content:space-between;align-items:flex-start}'
    + '.bank .top-left{display:flex;flex-direction:column;gap:2.5mm}'
    + '.bank .chip{display:block}'
    + '.bank .chip svg{display:block;width:11mm;height:8.1mm}'
    + '.bank .klasse{font-family:"Nunito",sans-serif;font-weight:800;font-size:8pt;letter-spacing:.1em;color:#6E6480}'
    + '.bank .qr{width:20mm;height:20mm;background:#fff;border:.3mm solid #2A1F3D;border-radius:1.5mm;padding:2mm}'
    + '.bank .qr svg,.bank .qr img{display:block;width:100%;height:100%}'
    + '.bank .cardnum{margin-top:3mm;font-family:"JetBrains Mono",monospace;font-weight:700;font-size:12pt;letter-spacing:.06em;color:#2A1F3D;white-space:nowrap}'
    + '.bank .r-bot{display:flex;justify-content:space-between;align-items:flex-end;gap:3mm}'
    + '.bank .holder{display:flex;flex-direction:column;min-width:0}'
    + '.bank .pin{display:flex;flex-direction:column}'
    + '.bank .lbl{font-family:"Nunito",sans-serif;font-weight:800;font-size:7pt;letter-spacing:.16em;color:#6E6480;margin-bottom:.6mm}'
    + '.bank .navn{font-family:"Nunito",sans-serif;font-weight:900;font-size:13pt;line-height:1;color:#2A1F3D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.bank .pin-val{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:12pt;letter-spacing:.18em;color:#2A1F3D;line-height:1}'
    + '.bank .pin-val.pin-blank{color:#6E6480;opacity:.55}'
    /* TEMA — bånd-farge (--ca) + dus bakgrunnsfarge (--cbg) */
    + '.bank.theme-gull{--ca:#F5C849;--cbg:#FBF4DD}'
    + '.bank.theme-turkis{--ca:#2DC4C4;--cbg:#E1F4F3}'
    + '.bank.theme-korall{--ca:#C13D2F;--cbg:#F8E7E1}'
    + '.bank.theme-lilla{--ca:#6B5BA8;--cbg:#ECE9F4}'
    + '.bank.theme-lime{--ca:#B8DA3B;--cbg:#F1F4DC}'
    + '.bank.theme-skog{--ca:#2F6B4A;--cbg:#E4EDE7}'
    /* BAKSIDE — felles for alle kort, med skrivefelt for elevens navn */
    + '.back{width:100%;height:100%;background:#FBF2D6;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5mm;text-align:center}'
    + '.back .back-coin{width:15mm;height:15mm}'
    + '.back .back-coin svg{display:block;width:100%;height:100%}'
    + '.back .back-logo{font-family:"Bowlby One",sans-serif;font-size:13pt;color:#2A1F3D;letter-spacing:.04em;margin-top:2mm}'
    + '.back .back-sub{font-family:"Fraunces",serif;font-style:italic;font-weight:900;font-size:8.5pt;color:#6E6480;letter-spacing:.06em;margin-top:1mm}'
    + '.back .back-name{width:74mm;background:#fff;border:.3mm solid #D8C9A0;border-radius:2mm;padding:2.4mm 4mm 2mm;margin-top:5mm}'
    + '.back .bn-lbl{display:block;font-family:"Nunito",sans-serif;font-weight:800;font-size:6.5pt;letter-spacing:.16em;color:#6E6480}'
    + '.back .bn-line{display:block;border-bottom:.4mm solid #B0A8C0;height:5mm;margin-top:.6mm}';

  // Info-banner i forhåndsvisningen — skjules ved utskrift.
  var infoBanner = ''
    + '<div class="print-info-banner"><div class="pib-inner">'
    +   '<div class="pib-title">Slik skriver du ut bankkortene</div>'
    +   '<ol class="pib-list">'
    +     '<li>Velg <strong>tosidig utskrift</strong> og <strong>«vend langs lang kant»</strong>.</li>'
    +     '<li>Sett <strong>skala til 100 %</strong> — ikke «tilpass til side».</li>'
    +     '<li>Skru på <strong>«skriv ut bakgrunnsgrafikk»</strong> så fargene blir med.</li>'
    +     '<li>Klipp langs de stiplede linjene på forsidearket. Skriv elevens navn på baksiden før du laminerer.</li>'
    +   '</ol>'
    +   '<button class="pib-print-btn" onclick="window.print()">Skriv ut nå</button>'
    + '</div></div>';
  var bannerCSS = ''
    + '@media screen{'
    +   '.print-info-banner{position:fixed;top:0;left:0;right:0;background:#FFE89A;border-bottom:3px solid #2A1F3D;z-index:9999;padding:14px 20px;font-family:"Nunito",sans-serif;color:#2A1F3D;box-shadow:0 4px 12px rgba(0,0,0,.15)}'
    +   '.pib-inner{max-width:760px;margin:0 auto}'
    +   '.pib-title{font-family:"Bowlby One",sans-serif;font-size:13pt;margin-bottom:8px;letter-spacing:.02em}'
    +   '.pib-list{margin:0 0 10px 20px;padding:0;font-size:10.5pt;line-height:1.55}'
    +   '.pib-list li{margin-bottom:3px}'
    +   '.pib-print-btn{background:#2A1F3D;color:#F5C849;border:none;padding:10px 24px;border-radius:8px;font-family:"Bowlby One",sans-serif;font-size:11pt;letter-spacing:.04em;cursor:pointer}'
    +   'body{padding-top:215px}'
    + '}'
    + '@media print{.print-info-banner{display:none!important}body{padding-top:0!important}}';

  return '<!DOCTYPE html><html lang="nb"><head><meta charset="UTF-8"><title>' + escapeHTML(title) + '</title>'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,900;1,9..144,700;1,9..144,900&family=Nunito:wght@400;600;700;800;900&family=Bowlby+One&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">'
    + '<style>' + css + bannerCSS + '</style>'
    + '</head><body>' + infoBanner + pagesHTML + '</body></html>';
};


// ════════════════════════════════════════════════════════════
// BANKKORT PDF — Myntland-design (forside + bakside annenhver side)
// ════════════════════════════════════════════════════════════
function generateCardPDF() {
  const cardClassFilter = document.getElementById('card-class-filter')?.value || '';
  const printStudents = cardClassFilter
    ? window._students.filter(s => s.class === cardClassFilter)
    : window._students;
  if (!printStudents.length) {
    alert(cardClassFilter ? `Ingen elever i ${cardClassFilter}.` : 'Ingen elever å skrive ut.');
    return;
  }
  // Skriv ut bankkort med samme design som "Bankkort - Myntland" — uten PIN på 5–7
  const html = window.buildMyntlandBankCardsHTML(printStudents, { showPin: false, title: 'Myntland · Bankkort' });
  const win = window.open('', '_blank', 'width=900,height=900');
  win.document.write(html);
  win.document.close();
  // Auto-print fjernet — læreren ser banneret med utskriftsinstruksjoner
  // og trykker "Skriv ut nå"-knappen selv etter å ha lest dem og evt
  // kontrollert printerinnstillingene.
}


// ════════════════════════════════════════════════════════════
// KLASSENS SPAREMÅL (portal)
// ════════════════════════════════════════════════════════════
window._classGoals = [];

async function distributeToGoalsPortal(amount) {
  if (!amount || !window._classGoals?.length) return;
  const active = window._classGoals.filter(g => !g.completed);
  if (!active.length) return;
  const perGoal = Math.floor(amount / active.length);
  const upd = {};
  active.forEach(g => {
    const ns = (g.saved||0) + perGoal;
    upd['classGoals/' + g.fbKey + '/saved'] = ns;
    if (ns >= g.target) upd['classGoals/' + g.fbKey + '/completed'] = true;
  });
  await window._update(fbRef('/'), upd);
}

async function createClassGoal() {
  if (!ready()) return;
  const active = window._classGoals.filter(g => !g.completed);
  if (active.length >= 3) {
    document.getElementById('goal-alert').innerHTML = '<div class="alert alert-error">⚠️ Maks 3 aktive sparemål.</div>'; return;
  }
  const emoji  = document.getElementById('goal-emoji').value || '🏦';
  const name   = document.getElementById('goal-name').value.trim();
  const target = parseInt(document.getElementById('goal-target').value) || 1000;
  const desc   = document.getElementById('goal-desc').value.trim();
  if (!name) { document.getElementById('goal-alert').innerHTML = '<div class="alert alert-error">⚠️ Skriv inn navn.</div>'; return; }
  await window._set(window._push(fbRef('classGoals')), { emoji, name, target, desc, saved: 0, completed: false, created: Date.now() });
  ['goal-emoji','goal-name','goal-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('goal-target').value = '1000';
  document.getElementById('goal-alert').innerHTML = `<div class="alert alert-success">✅ «${name}» opprettet!</div>`;
  setTimeout(() => document.getElementById('goal-alert').innerHTML = '', 3000);
}

async function deleteClassGoal(fbKey) {
  if (!confirm('Slett sparemål?')) return;
  await window._remove(fbRef('classGoals/' + fbKey));
}

function renderClassGoalsPage() {
  const el = document.getElementById('class-goals-container'); if (!el) return;
  const active  = window._classGoals.filter(g => !g.completed);
  const done    = window._classGoals.filter(g =>  g.completed);
  const newCard = document.getElementById('new-goal-card');
  if (newCard) newCard.style.display = active.length >= 3 ? 'none' : 'block';
  if (!window._classGoals.length) { el.innerHTML = ''; return; }
  el.innerHTML = [...active, ...done].map(g => {
    const pct = Math.min(100, Math.round((g.saved||0) / g.target * 100));
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:.75rem;">
        <div style="font-size:1.8rem;">${g.emoji||'🏦'}</div>
        <div style="flex:1;"><div style="font-weight:800;">${g.name}${g.completed?' ✅':''}</div><div style="font-size:.8rem;color:var(--muted);">Mål: 🪙 ${g.target}${g.desc?' · '+g.desc:''}</div></div>
        <button onclick="deleteClassGoal('${g.fbKey}')" style="background:none;border:none;cursor:pointer;color:var(--coral);font-size:1.1rem;">🗑️</button>
      </div>
      <div style="height:10px;background:var(--bg);border-radius:20px;overflow:hidden;margin-bottom:.5rem;">
        <div style="height:100%;background:${g.completed?'#16a34a':'var(--teal)'};border-radius:20px;width:${pct}%;transition:width .4s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;color:var(--muted);">
        <span>🪙 ${g.saved||0} spart</span><span>${pct}%</span><span>🪙 ${Math.max(0,g.target-(g.saved||0))} igjen</span>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
// ARBEIDSPLAN (periodeplanlegger)
// ════════════════════════════════════════════════════════════
let _wpEditKey = null;     // firebase-nøkkel som redigeres (null = ny plan)
let _wpEditSteps = [];     // arbeidskopi av trinn under redigering
let _wpActiveStep = -1;    // hvilket trinn som er åpent for redigering (-1 = ingen)
let _wpApproveKey = null;  // plan-nøkkel åpen i godkjenn-modalen

function wpEscAttr(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function wpRandomCode(){
  const a='ABCDEFGHJKLMNPQRSTUVWXYZ', n='23456789';
  let s='';
  for(let i=0;i<3;i++) s+=a[Math.floor(Math.random()*a.length)];
  s+='-';
  for(let i=0;i<3;i++) s+=n[Math.floor(Math.random()*n.length)];
  return s;
}
function wpPlansForTeacher(){
  const t=window._currentTeacher, all=window._workPlans||[];
  if(t?.role==='admin' || !t?.class) return all;
  return all.filter(p=>p.class===t.class);
}
function wpStudentsInClass(cls){
  return (window._students||[]).filter(s=>s.class===cls)
    .sort((a,b)=>(a.firstname||'').localeCompare(b.firstname||'','no'));
}
function wpGetProgress(studentKey, planKey){
  return (window._wpProgress?.[studentKey]?.[planKey]) || { current:0, steps:{} };
}
function wpBlankStep(){
  return { title:'', goal:'', bonus:50, approval:'teacher', reqs:[{text:'',img:'',link:''}] };
}

// ── EDITOR ──────────────────────────────────────────────────
// Ett trinn redigeres om gangen. Lagrede trinn vises sammenslått øverst.
function openPlanEditor(planKey){
  _wpEditKey=planKey;
  const ed=document.getElementById('wp-editor');
  ed.style.display='block';
  document.getElementById('wp-editor-alert').innerHTML='';
  const t=window._currentTeacher;
  const clsRow=document.getElementById('wp-class-row');
  const clsSel=document.getElementById('wp-class');
  if(t?.class && t.role!=='admin'){ clsSel.value=t.class; clsRow.style.display='none'; }
  else { clsRow.style.display='block'; }
  if(planKey){
    const p=(window._workPlans||[]).find(x=>x.fbKey===planKey)||{};
    document.getElementById('wp-editor-title').textContent='✏️ Rediger periodeplan';
    document.getElementById('wp-emoji').value=p.emoji||'📘';
    document.getElementById('wp-subject').value=p.subject||'';
    if(p.class) clsSel.value=p.class;
    document.getElementById('wp-approval').value=
      (p.approval||(p.steps&&p.steps[0]&&p.steps[0].approval)||'teacher')==='both'?'both':'teacher';
    _wpEditSteps=JSON.parse(JSON.stringify(p.steps||[]));
    _wpEditSteps.forEach(st=>{ if(!st.reqs||!st.reqs.length) st.reqs=[{text:'',img:'',link:''}]; });
    if(!_wpEditSteps.length){ _wpEditSteps=[wpBlankStep()]; _wpActiveStep=0; }
    else { _wpActiveStep=-1; }   // lagrede trinn vises sammenslått
  } else {
    document.getElementById('wp-editor-title').textContent='➕ Ny periodeplan';
    document.getElementById('wp-emoji').value='📘';
    document.getElementById('wp-subject').value='';
    document.getElementById('wp-approval').value='teacher';
    _wpEditSteps=[wpBlankStep()];
    _wpActiveStep=0;
  }
  wpRenderSteps();
  ed.scrollIntoView({behavior:'smooth',block:'start'});
}
function closePlanEditor(){
  document.getElementById('wp-editor').style.display='none';
  _wpEditKey=null; _wpEditSteps=[]; _wpActiveStep=-1;
}
function wpEdAlert(msg,type){
  document.getElementById('wp-editor-alert').innerHTML=
    `<div class="alert alert-${type==='error'?'error':'success'}">${type==='error'?'⚠️':'✅'} ${msg}</div>`;
}
// Les det ÅPNE trinnet fra DOM inn i _wpEditSteps.
function wpCaptureActiveStep(){
  if(_wpActiveStep<0) return;
  const b=document.querySelector('#wp-steps-container .wp-step-edit');
  if(!b) return;
  _wpEditSteps[_wpActiveStep]={
    title:b.querySelector('.wp-step-title').value.trim(),
    goal: b.querySelector('.wp-step-goal').value,
    bonus:parseInt(b.querySelector('.wp-step-bonus').value)||0,
    reqs:Array.from(b.querySelectorAll('.wp-req-row')).map(r=>({
      text:r.querySelector('.wp-req-text').value.trim(),
      link:r.querySelector('.wp-req-link').value.trim()
    }))
  };
}
function wpAddStep(){
  wpCaptureActiveStep();
  if(_wpEditSteps.length>=6){ wpEdAlert('En trapp kan ha maks 6 trinn.','error'); return; }
  _wpEditSteps.push(wpBlankStep());
  _wpActiveStep=_wpEditSteps.length-1;
  wpRenderSteps();
  document.getElementById('wp-editor-alert').innerHTML='';
}
// Lagre det åpne trinnet → slå det sammen, og åpne neste tomme trinn.
function wpSaveStep(){
  wpCaptureActiveStep();
  const st=_wpEditSteps[_wpActiveStep];
  if(!st || !st.title){ wpEdAlert('Gi trinnet en tittel før du lagrer det.','error'); return; }
  _wpActiveStep=-1;
  if(_wpEditSteps.length<6){
    _wpEditSteps.push(wpBlankStep());
    _wpActiveStep=_wpEditSteps.length-1;
  }
  wpRenderSteps();
  document.getElementById('wp-editor-alert').innerHTML='';
}
function wpEditStep(i){
  wpCaptureActiveStep();
  _wpActiveStep=i;
  wpRenderSteps();
  document.getElementById('wp-editor-alert').innerHTML='';
}
function wpDiscardStep(i){
  const st=_wpEditSteps[i];
  if((st&&st.title||'').trim() && !confirm('Forkaste trinn '+(i+1)+'?')) return;
  _wpEditSteps.splice(i,1);
  if(_wpActiveStep===i) _wpActiveStep=-1;
  else if(_wpActiveStep>i) _wpActiveStep--;
  wpRenderSteps();
}
function wpAddReq(stepIdx){
  wpCaptureActiveStep();
  _wpEditSteps[stepIdx].reqs.push({text:'',img:'',link:''});
  wpRenderSteps();
}
function wpRemoveReq(stepIdx,reqIdx){
  wpCaptureActiveStep();
  _wpEditSteps[stepIdx].reqs.splice(reqIdx,1);
  if(!_wpEditSteps[stepIdx].reqs.length) _wpEditSteps[stepIdx].reqs.push({text:'',img:'',link:''});
  wpRenderSteps();
}
// Sammenslått rad for et lagret trinn.
function wpStepRowHTML(st,i){
  const t=(st.title||'').trim();
  const nReq=(st.reqs||[]).filter(r=>r.text||r.link).length;
  const titleHtml=t ? wpEscAttr(t)
    : '<span style="color:var(--muted);font-weight:600;">Trinn uten tittel</span>';
  return `<div class="wp-step-done">
    <div class="wp-step-num">${i+1}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-weight:800;color:var(--teal-dark);">${titleHtml}</div>
      <div style="font-size:.78rem;color:var(--muted);font-weight:700;">
        ${nReq} arbeidskrav${st.bonus?' · 🪙 '+st.bonus:''}
      </div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="wpEditStep(${i})">✏️ Rediger</button>
    <button class="btn btn-coral btn-sm" onclick="wpDiscardStep(${i})" title="Forkast trinn">🗑️</button>
  </div>`;
}
// Utvidet redigering for det åpne trinnet.
function wpStepEditorHTML(st,i){
  return `<div class="wp-step-edit">
    <div class="wp-step-edit-head">
      <div class="wp-step-num">${i+1}</div>
      <input type="text" class="wp-step-title" placeholder="Tittel, f.eks. Addisjon"
             value="${wpEscAttr(st.title)}" style="flex:1;">
    </div>
    <div class="form-row">
      <label>Læringsmål – hva eleven skal mestre</label>
      <textarea class="wp-step-goal" placeholder="Jeg kan …">${wpEscAttr(st.goal)}</textarea>
    </div>
    <div class="form-row"><label>Bonus når trinnet er fullført (mynter)</label>
      <input type="number" class="wp-step-bonus" min="0" value="${st.bonus||0}"></div>
    <div class="wp-mini-label" style="margin-bottom:6px;">Arbeidskrav</div>
    ${(st.reqs||[]).map((r,j)=>`
      <div class="wp-req-row">
        <div class="wp-req-fields">
          <input type="text" class="wp-req-text" placeholder="Arbeidskrav, f.eks. Gjør oppgave 1–8 på s. 24" value="${wpEscAttr(r.text)}">
          <input type="text" class="wp-req-link" placeholder="🔗 Lenke-URL (valgfritt)" value="${wpEscAttr(r.link)}">
        </div>
        <button class="btn btn-ghost btn-sm" onclick="wpRemoveReq(${i},${j})" title="Fjern arbeidskrav">✕</button>
      </div>`).join('')}
    <button class="btn btn-ghost btn-sm" onclick="wpAddReq(${i})"><i class="ti ti-plus"></i> Legg til arbeidskrav</button>
    <div style="display:flex;gap:8px;margin-top:1rem;flex-wrap:wrap;border-top:1.5px dashed var(--border);padding-top:1rem;">
      <button class="btn btn-primary btn-sm" onclick="wpSaveStep()">💾 Lagre trinnet</button>
      <button class="btn btn-ghost btn-sm" onclick="wpDiscardStep(${i})">🗑️ Forkast trinnet</button>
    </div>
  </div>`;
}
function wpRenderSteps(){
  const cont=document.getElementById('wp-steps-container');
  let html='';
  _wpEditSteps.forEach((st,i)=>{
    html+=(i===_wpActiveStep) ? wpStepEditorHTML(st,i) : wpStepRowHTML(st,i);
  });
  if(_wpActiveStep<0 && _wpEditSteps.length<6){
    html+='<button class="btn btn-ghost btn-sm" onclick="wpAddStep()"><i class="ti ti-plus"></i> Legg til trinn</button>';
  }
  const titled=_wpEditSteps.filter(s=>(s.title||'').trim()).length;
  html+='<div class="wp-publish-hint">'+(titled<3
      ? '📝 '+titled+' av 3 trinn lagret. Trappa kan publiseres når minst 3 trinn er lagret.'
      : '✅ '+titled+' trinn lagret – klar til å publiseres.')+'</div>';
  cont.innerHTML=html;
  const pubBtn=document.getElementById('wp-publish-btn');
  if(pubBtn){
    pubBtn.disabled=titled<3;
    pubBtn.title=titled<3?'Lagre minst 3 trinn for å publisere':'Publiser periodeplanen for elevene';
  }
}
// publish=true → synlig for elevene. publish=false → lagre som kladd.
async function savePlan(publish){
  if(!ready()){ wpEdAlert('Firebase ikke klar – prøv igjen om et øyeblikk.','error'); return; }
  wpCaptureActiveStep();
  const emoji=document.getElementById('wp-emoji').value.trim()||'📘';
  const subject=document.getElementById('wp-subject').value.trim();
  const cls=document.getElementById('wp-class').value;
  // Godkjenningsvalg gjelder hele periodeplanen – kopieres inn på hvert trinn.
  const approval=document.getElementById('wp-approval').value==='both'?'both':'teacher';
  if(!subject){ wpEdAlert('Skriv inn hvilket fag periodeplanen gjelder.','error'); return; }
  // Behold kun trinn med tittel (tomme «neste trinn» faller bort).
  const steps=_wpEditSteps
    .filter(s=>(s.title||'').trim())
    .map(st=>({
      title:st.title.trim(), goal:st.goal||'', bonus:st.bonus||0, approval:approval,
      reqs:(st.reqs||[]).filter(r=>r.text||r.link)
        .map(r=>({text:r.text||'',link:r.link||''}))
    }));
  if(publish && steps.length<3){
    wpEdAlert('Du må ha minst 3 lagrede trinn for å publisere.','error'); return;
  }
  if(steps.length>6){ wpEdAlert('En trapp kan ha maks 6 trinn.','error'); return; }
  const ex=_wpEditKey?((window._workPlans||[]).find(x=>x.fbKey===_wpEditKey)||{}):{};
  const willActive = publish ? true : (_wpEditKey ? (ex.active!==false) : false);
  if(_wpEditKey){
    await window._update(fbRef('workPlans/'+_wpEditKey),
      { emoji, subject, class:cls, approval, steps, active:willActive });
  } else {
    await window._set(window._push(fbRef('workPlans')),
      { emoji, subject, class:cls, approval, steps, active:willActive, created:Date.now() });
  }
  closePlanEditor();
}
async function togglePlanActive(planKey){
  const p=(window._workPlans||[]).find(x=>x.fbKey===planKey); if(!p) return;
  const turningOn=!(p.active!==false);
  if(turningOn && (p.steps||[]).length<3){
    alert('Periodeplanen må ha minst 3 trinn før den kan publiseres. Åpne den og legg til flere trinn.');
    renderWorkPlans();
    return;
  }
  await window._update(fbRef('workPlans/'+planKey), { active: turningOn });
}
async function deletePlan(planKey){
  const p=(window._workPlans||[]).find(x=>x.fbKey===planKey);
  if(!confirm(`Slette periodeplanen «${p?.subject||''}»?\nElevenes framgang i denne planen slettes også.`)) return;
  await window._remove(fbRef('workPlans/'+planKey));
  const upd={};
  Object.keys(window._wpProgress||{}).forEach(sk=>{
    if(window._wpProgress[sk]?.[planKey]) upd['workPlanProgress/'+sk+'/'+planKey]=null;
  });
  if(Object.keys(upd).length) await window._update(fbRef('/'),upd);
}

// ── LISTE ───────────────────────────────────────────────────
function wpClassKey(c){ return encodeURIComponent(String(c==null?'':c)).replace(/\./g,'%2E'); }
function wpLeadLimitCardHTML(){
  const plans=wpPlansForTeacher();
  const classes=Array.from(new Set(plans.map(p=>p.class).filter(Boolean))).sort();
  if(!classes.length) return '';
  const lim=(window._settings&&window._settings.wpLeadLimit)||{};
  const rows=classes.map(c=>{
    const v=lim[wpClassKey(c)];
    return `<div style="display:flex;align-items:center;gap:9px;margin:.45rem 0;flex-wrap:wrap;">
      <span class="class-badge">${c}</span>
      <span style="font-size:.85rem;color:var(--muted);font-weight:700;">maks</span>
      <input type="number" min="0" max="99" placeholder="av" value="${(v!=null&&v>0)?v:''}"
        onchange="saveWpLeadLimit('${c}',this)" style="width:74px;text-align:center;">
      <span style="font-size:.85rem;color:var(--muted);font-weight:700;">trinn forsprang</span>
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="card-title">⚖️ Forsprangsbegrensning</div>
    <p style="font-size:.85rem;color:var(--muted);margin-bottom:.6rem;line-height:1.5;">
    Hindrer at en elev jobber seg for langt foran på ett fag mens hen ligger bak på et annet.
    Tomt felt = av (standard). Tallet er hvor mange trinn forsprang som tillates.</p>
    ${rows}
    <div id="wp-leadlimit-alert" style="margin-top:.4rem;"></div>
  </div>`;
}
async function saveWpLeadLimit(cls,inp){
  const raw=parseInt(inp.value,10);
  const val=(isNaN(raw)||raw<=0)?null:Math.min(99,raw);
  const a=document.getElementById('wp-leadlimit-alert');
  try{
    await window._update(window._ref(window._db,'settings/wpLeadLimit'),{[wpClassKey(cls)]:val});
    if(!window._settings) window._settings={};
    if(!window._settings.wpLeadLimit) window._settings.wpLeadLimit={};
    window._settings.wpLeadLimit[wpClassKey(cls)]=val;
    if(a){
      a.innerHTML='<div class="alert alert-success">'
        +(val?('✅ '+cls+': maks '+val+' trinn forsprang.'):('✅ '+cls+': forsprangsbegrensning av.'))+'</div>';
      setTimeout(function(){a.innerHTML='';},3500);
    }
  }catch(e){
    if(a) a.innerHTML='<div class="alert alert-error">⚠️ Lagring feilet: '+e.message+'</div>';
  }
}

function renderWorkPlans(){
  const el=document.getElementById('wp-list'); if(!el) return;
  const plans=wpPlansForTeacher();
  if(!plans.length){
    el.innerHTML='<div class="card" style="text-align:center;color:var(--muted);">'
      +'<div style="font-size:2.4rem;margin-bottom:.4rem;">🪜</div>'
      +'<div style="font-weight:800;">Ingen periodeplaner ennå</div>'
      +'<div style="font-size:.86rem;margin-top:4px;">Bruk «Ny periodeplan»-knappen under for å lage den første trappa.</div></div>';
    return;
  }
  const active=plans.filter(p=>p.active!==false);
  const drafts=plans.filter(p=>p.active===false);
  let html='';
  html+=wpLeadLimitCardHTML();
  html+='<div class="wp-cat-pill aktiv">✅ Aktive periodeplaner ('+active.length+')</div>';
  html+= active.length
    ? active.map(wpPlanCardHTML).join('')
    : '<div class="wp-cat-empty">Ingen publiserte periodeplaner ennå.</div>';
  html+='<div class="wp-cat-pill kladd">📝 Ikke publisert ('+drafts.length+')</div>';
  html+= drafts.length
    ? drafts.map(wpPlanCardHTML).join('')
    : '<div class="wp-cat-empty">Ingen kladder.</div>';
  el.innerHTML=html;
}
function wpPlanCardHTML(p){
  const students=wpStudentsInClass(p.class);
  const nSteps=(p.steps||[]).length;
  let done=0;
  students.forEach(s=>{ if((wpGetProgress(s.fbKey,p.fbKey).current||0)>=nSteps && nSteps>0) done++; });
  const active=p.active!==false;
  return `<div class="wp-plan-card${active?'':' inactive'}">
    <div class="wp-plan-head">
      <div class="wp-plan-emoji">${p.emoji||'📘'}</div>
      <div style="flex:1;min-width:140px;">
        <div style="font-weight:800;font-size:1.05rem;color:var(--teal-dark);">${wpEscAttr(p.subject)}</div>
        <div style="font-size:.8rem;color:var(--muted);font-weight:700;margin-top:2px;">
          <span class="class-badge">${p.class}</span> · ${nSteps} trinn · ${students.length} elever · ${done} fullført
        </div>
      </div>
      <label class="wp-toggle" title="${active?'Aktiv – synlig for elevene':'Skjult for elevene'}">
        <input type="checkbox" ${active?'checked':''} onchange="togglePlanActive('${p.fbKey}')">
        <span class="wp-slider"></span>
      </label>
    </div>
    <div class="wp-plan-actions">
      <button class="btn btn-primary btn-sm" onclick="openApprove('${p.fbKey}')">👀 Elevoversikt &amp; godkjenning</button>
      <button class="btn btn-ghost btn-sm" onclick="openPlanEditor('${p.fbKey}')">✏️ Rediger</button>
      <button class="btn btn-coral btn-sm" onclick="deletePlan('${p.fbKey}')">🗑️ Slett</button>
    </div>
  </div>`;
}

// ── GODKJENNING ─────────────────────────────────────────────
function openApprove(planKey){
  _wpApproveKey=planKey;
  document.getElementById('modal-wp-approve').classList.add('open');
  refreshApproveModal();
}
function refreshApproveModal(){
  const modal=document.getElementById('modal-wp-approve');
  if(!modal || !modal.classList.contains('open') || !_wpApproveKey) return;
  const p=(window._workPlans||[]).find(x=>x.fbKey===_wpApproveKey);
  if(!p){ closeModal('modal-wp-approve'); return; }
  document.getElementById('modal-wp-approve-title').textContent=(p.emoji||'📘')+' '+p.subject;
  document.getElementById('modal-wp-approve-sub').textContent=
    p.class+' · '+(p.steps||[]).length+' trinn. Godkjenn trinnet eleven jobber med nå.';
  const students=wpStudentsInClass(p.class);
  const nSteps=(p.steps||[]).length;
  const body=document.getElementById('modal-wp-approve-body');
  if(!students.length){ body.innerHTML='<p style="color:var(--muted);">Ingen elever i denne klassen.</p>'; return; }
  body.innerHTML=students.map(s=>{
    const pr=wpGetProgress(s.fbKey,_wpApproveKey);
    const cur=pr.current||0;
    const nm=`${wpEscAttr(s.firstname)} ${s.lastname?wpEscAttr(s.lastname.charAt(0))+'.':''}`;
    if(cur>=nSteps){
      return `<div class="wp-approve-row"><div style="flex:1;font-weight:800;">${nm}</div>`
        +`<span class="wp-pill wp-pill-done">🎉 Fullført hele trappa</span></div>`;
    }
    const step=p.steps[cur]||{};
    const ss=pr.steps?.[cur]||{};
    const nReqs=(step.reqs||[]).length;
    const nChk=Object.values(ss.checks||{}).filter(Boolean).length;
    const tOk=!!ss.teacherApproved, needG=step.approval==='both', gOk=!!ss.guardianApproved;
    const tPill=tOk?'<span class="wp-pill wp-pill-ok">✓ Lærer</span>'
      :'<span class="wp-pill wp-pill-wait">⏳ Lærer</span>';
    const gPill=!needG?'<span class="wp-pill wp-pill-na">Foresatt ikke nødvendig</span>'
      :gOk?'<span class="wp-pill wp-pill-ok">✓ Foresatt</span>'
      :'<span class="wp-pill wp-pill-wait">⏳ Foresatt</span>';
    return `<div class="wp-approve-row">
      <div style="flex:1;min-width:130px;">
        <div style="font-weight:800;">${nm}</div>
        <div style="font-size:.78rem;color:var(--muted);font-weight:700;">
          Trinn ${cur+1}/${nSteps}: ${wpEscAttr(step.title)} · ${nChk}/${nReqs} huket av
        </div>
      </div>
      ${tPill}${gPill}
      ${tOk
        ? `<button class="btn btn-ghost btn-sm" onclick="teacherUnapprove('${s.fbKey}')">Angre</button>`
        : `<button class="btn btn-primary btn-sm" onclick="teacherApproveStep('${s.fbKey}')">Godkjenn</button>`}
    </div>`;
  }).join('');
}
async function teacherApproveStep(studentKey){
  const planKey=_wpApproveKey;
  const p=(window._workPlans||[]).find(x=>x.fbKey===planKey); if(!p) return;
  const cur=wpGetProgress(studentKey,planKey).current||0;
  if(cur>=(p.steps||[]).length) return;
  await window._update(fbRef('workPlanProgress/'+studentKey+'/'+planKey+'/steps/'+cur),
    { teacherApproved:true, teacherApprovedTs:Date.now() });
  await wpCheckCompletion(planKey, studentKey);
}
async function teacherUnapprove(studentKey){
  const planKey=_wpApproveKey;
  const pr=wpGetProgress(studentKey,planKey);
  const cur=pr.current||0;
  if(pr.steps?.[cur]?.completed){
    alert('Trinnet er allerede fullført og bonus er utbetalt – det kan ikke angres.');
    return;
  }
  await window._update(fbRef('workPlanProgress/'+studentKey+'/'+planKey+'/steps/'+cur),
    { teacherApproved:false, teacherApprovedTs:null });
}
// Felles fullføringslogikk – brukes når lærer (her) eller foresatt godkjenner.
async function wpCheckCompletion(planKey, studentKey){
  const p=(window._workPlans||[]).find(x=>x.fbKey===planKey); if(!p) return;
  const steps=p.steps||[];
  const snap=await window._get(fbRef('workPlanProgress/'+studentKey+'/'+planKey));
  const pr=snap.val()||{current:0,steps:{}};
  const cur=pr.current||0;
  if(cur>=steps.length) return;
  const step=steps[cur];
  const ss=(pr.steps&&pr.steps[cur])||{};
  if(ss.completed) return;
  const ok = ss.teacherApproved && (step.approval!=='both' || ss.guardianApproved);
  if(!ok) return;
  const base='workPlanProgress/'+studentKey+'/'+planKey;
  const upd={};
  upd[base+'/steps/'+cur+'/completed']=true;
  upd[base+'/steps/'+cur+'/completedTs']=Date.now();
  upd[base+'/steps/'+cur+'/bonusPaid']=true;
  upd[base+'/current']=cur+1;
  await window._update(fbRef('/'),upd);
  if((step.bonus||0)>0 && !ss.bonusPaid){
    const sSnap=await window._get(fbRef('students57/'+studentKey));
    const sv=sSnap.val()||{};
    await window._update(fbRef('students57/'+studentKey),{balance:(sv.balance||0)+step.bonus});
    await logTx(studentKey,'income','🪙',
      'Arbeidsplan: «'+(step.title||'Trinn')+'» fullført',step.bonus);
  }
}

// ── FORESATTBREV ────────────────────────────────────────────
const WP_FORESATT_URL='www.myntland.no/foresatt';
async function openGuardianLetters(){
  const students=(window._students||[]).slice()
    .sort((a,b)=>(a.class||'').localeCompare(b.class||'')||(a.firstname||'').localeCompare(b.firstname||'','no'));
  if(!students.length){ alert('Ingen elever å lage brev for.'); return; }
  const codes=window._guardianCodes||{};
  const used=new Set(Object.values(codes).map(c=>c&&c.code).filter(Boolean));
  const upd={};
  students.forEach(s=>{
    if(!codes[s.fbKey]?.code){
      let c=wpRandomCode();
      while(used.has(c)) c=wpRandomCode();
      used.add(c);
      upd['guardianCodes/'+s.fbKey]={code:c};
    }
  });
  if(Object.keys(upd).length) await window._update(fbRef('/'),upd);
  const fresh=(await window._get(fbRef('guardianCodes'))).val()||{};
  window._guardianCodes=fresh;
  document.getElementById('modal-wp-letters-body').innerHTML=
    '<div style="max-height:300px;overflow-y:auto;border:1.5px solid var(--border);border-radius:10px;">'
    +students.map(s=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid var(--bg);">
      <span style="font-weight:700;">${wpEscAttr(s.firstname)} ${wpEscAttr(s.lastname||'')}
        <span style="color:var(--muted);font-size:.8rem;">(${s.class})</span></span>
      <span style="font-family:'Fredoka One',cursive;color:var(--teal);">${wpEscAttr(fresh[s.fbKey]?.code||'—')}</span>
    </div>`).join('')+'</div>';
  document.getElementById('modal-wp-letters').classList.add('open');
}
function printGuardianLetters(){
  const students=(window._students||[]).slice()
    .sort((a,b)=>(a.class||'').localeCompare(b.class||'')||(a.firstname||'').localeCompare(b.firstname||'','no'));
  if(!students.length){ alert('Ingen elever.'); return; }
  const codes=window._guardianCodes||{};
  const letters=students.map(s=>{
    const code=codes[s.fbKey]?.code||'—';
    const navn=wpEscAttr(s.firstname||'');
    const klasse=wpEscAttr(s.class||'');
    return `<div class="sheet"><div class="letter">
      <div class="lt-ident">Til foresatte · ${navn} · ${klasse}</div>
      <div class="lt-top">🪙 Myntland · Arbeidsplan</div>
      <h1>Følg med på arbeidsplanen til barnet ditt</h1>
      <div class="lt-intro">Klassen bruker <strong>Myntland</strong> til å jobbe med læringsmål i en
      «trapp» — eleven jobber seg oppover ett trinn om gangen. Som foresatt kan du logge inn,
      følge med, og gi klarsignal på de trinnene som trenger et blikk hjemmefra.</div>
      <div class="lt-h">Slik logger du inn</div>
      <div class="lt-steps">
        <div><b>1</b> Gå til&nbsp;<span class="lt-url">${WP_FORESATT_URL}</span></div>
        <div><b>2</b> Skriv inn den personlige koden nedenfor</div>
        <div><b>3</b> Du ser framgangen med en gang</div>
      </div>
      <div class="lt-code-label">Personlig kode</div>
      <div class="lt-code">${wpEscAttr(code)}</div>
      <div class="lt-h">Når du er logget inn, ser du to ting</div>
      <div class="lt-feat">
        <div class="lt-feat-title">📋 Siden sist</div>
        <div class="lt-feat-text">Øverst får du en kort oppsummering av hva som har skjedd siden
        forrige gang du var innom. Stikk innom jevnlig — gjerne et par minutter i uka — så følger
        du framgangen steg for steg.</div>
      </div>
      <div class="lt-feat">
        <div class="lt-feat-title">✅ Dette kan du godkjenne</div>
        <div class="lt-feat-text">Noen trinn venter på et lite klarsignal fra deg. Når barnet har
        gjort arbeidet og læreren har sett over det, bekrefter du at du også har sett framgangen —
        og da er trinnet fullført. Andre trinn ordner læreren alene; der trenger du ikke gjøre noe.</div>
      </div>
      <div class="lt-coop">Et lite blikk fra deg betyr mye. Når barnet merker at både skole og hjem
      følger med, blir læringsmålene noe vi jobber mot sammen — og det syns på motivasjonen.</div>
      <div class="lt-fine">Koden gir bare innsyn i denne ene arbeidsplanen, og ingen sensitive
      opplysninger er knyttet til den. Ta vare på brevet.</div>
      <div class="lt-sign">Vennlig hilsen<br>kontaktlæreren</div>
    </div></div>`;
  });
  const css=`
    @page{size:A4;margin:0;}
    *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    body{font-family:'Nunito',Arial,sans-serif;color:#1a2e1a;}
    .sheet{width:210mm;min-height:297mm;padding:15mm 17mm;page-break-after:always;}
    .letter{border:2px solid #c8dfc8;border-radius:16px;padding:10mm 11mm;}
    .lt-ident{font-size:8.5pt;color:#5a7a5a;font-weight:700;letter-spacing:.3px;margin-bottom:4mm;}
    .lt-top{font-weight:800;color:#1a5fa5;font-size:10pt;letter-spacing:.5px;}
    .letter h1{font-size:17pt;color:#1e0f52;margin:2mm 0 3.5mm;line-height:1.2;}
    .lt-intro{font-size:10.5pt;line-height:1.5;margin-bottom:3.5mm;}
    .lt-h{font-weight:800;color:#1e0f52;font-size:11pt;margin-bottom:2mm;}
    .lt-steps{background:#F7F9F7;border-radius:10px;padding:3.5mm 5mm;margin-bottom:3.5mm;}
    .lt-steps div{font-size:10pt;margin:1.4mm 0;}
    .lt-steps b{display:inline-block;width:5.5mm;height:5.5mm;line-height:5.5mm;text-align:center;
      background:#1a5fa5;color:#fff;border-radius:50%;font-size:8pt;margin-right:2mm;}
    .lt-url{font-weight:800;color:#1a5fa5;}
    .lt-code-label{font-size:8.5pt;font-weight:800;color:#5a7a5a;text-transform:uppercase;letter-spacing:1px;}
    .lt-code{font-family:'Fredoka One',Arial,sans-serif;font-size:26pt;color:#1e0f52;
      letter-spacing:4px;background:#FAEEDA;border:2px dashed #EF9F27;border-radius:12px;
      text-align:center;padding:3.5mm;margin:1.5mm 0 4mm;}
    .lt-feat{background:#E1F5EE;border-radius:10px;padding:3mm 4.5mm;margin-bottom:2.5mm;}
    .lt-feat-title{font-family:'Fredoka One',Arial,sans-serif;font-size:11pt;color:#085041;margin-bottom:.8mm;}
    .lt-feat-text{font-size:9.5pt;line-height:1.5;}
    .lt-coop{font-size:10pt;line-height:1.5;color:#085041;font-weight:600;margin:1.5mm 0 3.5mm;}
    .lt-fine{font-size:8.5pt;color:#5a7a5a;line-height:1.4;}
    .lt-sign{font-size:10pt;font-weight:700;margin-top:4mm;}
  `;
  const win=window.open('','_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Foresattbrev</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">'
    +'<style>'+css+'</style></head><body>'+letters.join('')
    +'<script>setTimeout(function(){window.print();},500);<\/script></body></html>');
  win.document.close();
}

// ── GODKJENNINGS-QR ─────────────────────────────────────────
// Én generell QR for alle arbeidsplaner. Den bærer ingen fag-info –
// elevappen godkjenner trinnet eleven står på når QR-en scannes.
function showWpQR(){
  const payload=JSON.stringify({ type:'wpApprove' });
  window._wpQrPayload=payload;
  const box=document.getElementById('modal-wp-qr-box');
  /* ═══════════════════════════════════════════════════════════════════
     REKONSTRUERT AV CLAUDE 2026-05-24 — resten av showWpQR() + printWpQR()
     gikk tapt da fila ble avkuttet. Bygget etter mønster fra showShopItemQR
     lenger oppe i fila. SJEKK denne blokken mot din egen original.
     ═══════════════════════════════════════════════════════════════════ */
  document.getElementById('modal-wp-qr-title').textContent = '📱 Godkjennings-QR';

  // QR via QR Server API (samme tilnærming som showShopItemQR) – ferdig PNG
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' + encodeURIComponent(payload);
  box.innerHTML = `
    <img src="${qrUrl}" alt="Godkjennings-QR"
         style="width:220px;height:220px;border:2px solid var(--border);border-radius:10px;padding:6px;background:white;"
         onerror="this.parentElement.innerHTML='<div style=color:var(--coral);font-size:.85rem;padding:1rem>Ingen internettforbindelse – QR kan ikke genereres</div>'">`;

  document.getElementById('modal-wp-qr').classList.add('open');
}

function printWpQR(){
  /* Myntland-stil utskrift — restylet 2026-05-24 (mindre QR, ramme, bakgrunn). */
  const payload = window._wpQrPayload || JSON.stringify({ type:'wpApprove' });
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=4&data=' + encodeURIComponent(payload);
  const win = window.open('', '', 'width=520,height=700');
  win.document.write(
    '<!DOCTYPE html><html lang="no"><head><meta charset="UTF-8"><title>Godkjennings-QR</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@600;700;800&display=swap" rel="stylesheet">'
    + '<style>'
    + '@page{size:A6;margin:0}'
    + '*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}'
    + 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
    +      'padding:8mm;font-family:Nunito,sans-serif;background:#fff}'
    + '.card{width:100%;padding:8mm 6mm;border:3px solid #1D9E75;border-radius:20px;'
    +       'background:#E1F5EE;text-align:center;color:#085041}'
    + '.brand{font-family:"Fredoka One",cursive;font-size:13pt;color:#1D9E75}'
    + '.title{font-family:"Fredoka One",cursive;font-size:17pt;color:#085041;margin:1mm 0 4mm}'
    + '.qrbox{display:inline-block;background:#fff;border:2px solid #c8dfc8;border-radius:14px;padding:9px}'
    + '.qrbox img{display:block;width:42mm;height:42mm}'
    + '.hint{font-size:9.5pt;font-weight:700;color:#5a7a5a;line-height:1.5;margin-top:5mm}'
    + '</style></head><body>'
    + '<div class="card">'
    +   '<div class="brand">🪙 Myntland</div>'
    +   '<div class="title">📱 Godkjennings-QR</div>'
    +   '<div class="qrbox"><img src="' + qrUrl + '" alt="Godkjennings-QR"></div>'
    +   '<div class="hint">Vis denne til elever som har fullført arbeidet sitt.<br>'
    +     'Eleven scanner den fra trinnet sitt i elevappen.</div>'
    + '</div>'
    + '<script>setTimeout(function(){window.print();},500);<\/script>'
    + '</body></html>'
  );
  win.document.close();
}

// ════════════════════════════════════════════════════════════
// JOBBER – opprett/oppdater (engangsoppdrag + faste jobber)
// ════════════════════════════════════════════════════════════
async function submitJob() {
  if (!ready()) return;
  const title    = document.getElementById('job-title').value.trim();
  const emoji    = document.getElementById('job-emoji').value || '💼';
  const desc     = document.getElementById('job-desc').value.trim();
  const pay      = parseInt(document.getElementById('job-pay').value) || 50;
  const deadline = document.getElementById('job-deadline').value.trim();
  const maxUses  = parseInt(document.getElementById('job-max-uses')?.value) || 0;
  const type     = window._currentJobType || 'task';
  const alertEl  = document.getElementById('job-alert');
  if (!title) { alertEl.innerHTML = '<div class="alert alert-error">⚠️ Skriv inn tittel.</div>'; return; }

  if (type === 'salary') {
    const data = { title, emoji, desc, pay, type: 'salary', active: true, applicationsOpen: true, created: Date.now() };
    if (currentEditJobKey) {
      await window._update(fbRef('jobs/' + currentEditJobKey), { title, emoji, desc, pay, type: 'salary' });
      alertEl.innerHTML = '<div class="alert alert-success">✅ Fast jobb oppdatert!</div>';
      cancelJobEdit();
    } else {
      await window._set(window._push(fbRef('jobs')), data);
      alertEl.innerHTML = `<div class="alert alert-success">✅ Fast jobb «${title}» opprettet!</div>`;
      ['job-title','job-emoji','job-desc'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('job-pay').value = '50';
    }
  } else {
    const data = { title, emoji, desc, pay, deadline, type: 'task', active: true, created: Date.now(), usesLeft: maxUses || null, maxUses: maxUses || null };
    if (currentEditJobKey) {
      await window._update(fbRef('jobs/' + currentEditJobKey), { title, emoji, desc, pay, deadline, maxUses: maxUses||null });
      alertEl.innerHTML = '<div class="alert alert-success">✅ Oppdatert!</div>';
      cancelJobEdit();
    } else {
      await window._set(window._push(fbRef('jobs')), data);
      alertEl.innerHTML = `<div class="alert alert-success">✅ «${title}» opprettet!</div>`;
      ['job-title','job-emoji','job-desc','job-deadline'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('job-pay').value = '50';
      const mu = document.getElementById('job-max-uses'); if(mu) mu.value='';
    }
  }
  setTimeout(() => alertEl.innerHTML = '', 3000);
}

// ════════════════════════════════════════════════════════════
// BUTIKK PDF – 2 varer per A4, liggende
// ════════════════════════════════════════════════════════════
function printShopPDF() {
  if (!window._shop57?.length) { alert('Ingen varer i butikken.'); return; }
  const items = window._shop57;
  // Bygg sider: 2 varer per side, liggende A4
  // QR genereres via api.qrserver.com – ingen canvas/synlighetsproblemer
  let pagesHTML = '';
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i+2);
    while (pair.length < 2) pair.push(null);
    pagesHTML += `<div class="page">${pair.map(x => x ? `
      <div class="item">
        <div class="item-cat">${x.category}</div>
        <div class="item-emoji">${x.emoji}</div>
        <div class="item-name">${x.name}</div>
        <div class="item-price">🪙 ${x.price}</div>
        <div class="item-qr">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=4&data=${encodeURIComponent(JSON.stringify({ type:'purchase', fbKey:x.fbKey, name:x.name, emoji:x.emoji, price:x.price }))}"
               width="130" height="130" alt="QR">
        </div>
      </div>` : '<div class="item"></div>').join('')}</div>`;
  }
  const win = window.open('', '_blank', 'width=1100,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700;800&display=swap" rel="stylesheet">
    <style>
      body{margin:0;padding:0;font-family:'Nunito',sans-serif;background:white;}
      @media print{@page{size:A4 landscape;margin:0}}
      .page{display:flex;width:297mm;height:210mm;page-break-after:always;box-sizing:border-box;}
      .item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4mm;
            border:0.5mm solid #534AB7;padding:8mm;box-sizing:border-box;background:white;}
      .item-cat  {font-size:4.5mm;font-weight:900;color:#534AB7;text-transform:uppercase;letter-spacing:.3mm;}
      .item-emoji{font-size:30mm;line-height:1;}
      .item-name {font-family:'Fredoka One',cursive;font-size:12mm;color:#1e0f52;text-align:center;}
      .item-price{background:#EEEDFE;color:#534AB7;font-weight:900;padding:2mm 8mm;border-radius:4mm;font-size:10mm;}
      .item-qr   {display:flex;justify-content:center;align-items:center;}
    </style>
  </head><body>${pagesHTML}<script>setTimeout(function(){window.focus();window.print();},800);<\/script></body></html>`);
  win.document.close();
}

// ════════════════════════════════════════════════════════════
// AUTOMATISK FOND-OPPDATERING – kjører kl. 08:00 hver dag
//
// Modell:
//   Daglig endring = drift + tilfeldig(−range, +range)
//   Lav risiko:  drift = +0.50%/dag, range = ±5%
//                → gjennomsnitt ~+7% over 14 dager (mål: +5% til +10%)
//   Høy risiko:  drift = +0.90%/dag, range = ±10%
//                → gjennomsnitt ~+14% over 14 dager (mål: +10% til +15%)
//
// Kjøres ved innlogging. Skriver kun hvis:
//   1. Dagens dato ikke allerede finnes i fundHistory
//   2. Lokal tid er 08:00 eller senere


// ════════════════════════════════════════════════════════════
// AUTOMATISK UKENTLIG LØNN (mandager)



// ════════════════════════════════════════════════════════════
// HENDELSER
// ════════════════════════════════════════════════════════════

const DEFAULT_HENDELSER = [
  // 10 inntekter (income) ─────────────────────────────────────
  { emoji:'🎂', type:'income',  amount:150, desc:'Du fikk bursdagspenger av bestemor' },
  { emoji:'🏆', type:'income',  amount:200, desc:'Du vant en konkurranse på skolen' },
  { emoji:'🛍️', type:'income',  amount:100, desc:'Du solgte gamle leker på loppemarked' },
  { emoji:'🌱', type:'income',  amount:80,  desc:'Du klipte gresset hos naboen' },
  { emoji:'📦', type:'income',  amount:120, desc:'Du hjalp til med å flytte møbler' },
  { emoji:'🎁', type:'income',  amount:250, desc:'Du fikk en uventet gave fra familie' },
  { emoji:'🔧', type:'income',  amount:90,  desc:'Du reparerte sykkelen til en venn' },
  { emoji:'🐕', type:'income',  amount:175, desc:'Du passet hunden til naboene i en uke' },
  { emoji:'♻️', type:'income',  amount:60,  desc:'Du pante tomflasker fra en fest' },
  { emoji:'📚', type:'income',  amount:130, desc:'Du solgte bøker du ikke trenger lenger' },
  // 20 utgifter (expense) ─────────────────────────────────────
  { emoji:'🍕', type:'expense', amount:120, desc:'Pizzakveld med vennene – du betalte' },
  { emoji:'🎮', type:'expense', amount:299, desc:'Du kjøpte et nytt spill' },
  { emoji:'👟', type:'expense', amount:250, desc:'Du måtte kjøpe nye treningssko' },
  { emoji:'🚌', type:'expense', amount:55,  desc:'Du glemte månedkortet og måtte kjøpe enkeltbillett' },
  { emoji:'🦷', type:'expense', amount:180, desc:'Tannlegen fant et hull – egenandel' },
  { emoji:'📱', type:'expense', amount:200, desc:'Telefonen din trenger nytt batteri' },
  { emoji:'🎬', type:'expense', amount:90,  desc:'Kinobilletter og popcorn til to' },
  { emoji:'☂️', type:'expense', amount:75,  desc:'Du glemte paraplyen og kjøpte en ny' },
  { emoji:'🍦', type:'expense', amount:50,  desc:'Spontant iskrem-stopp med gjengen' },
  { emoji:'🐾', type:'expense', amount:160, desc:'Katten din trengte veterinærbesøk' },
  { emoji:'🔑', type:'expense', amount:220, desc:'Du låste deg ute og måtte tilkalle låsesmed' },
  { emoji:'💻', type:'expense', amount:300, desc:'Datamaskinen krasjet – måtte repareres' },
  { emoji:'🏋️', type:'expense', amount:150, desc:'Halvårskontingent til treningsstudio' },
  { emoji:'🎪', type:'expense', amount:85,  desc:'Inngangspenger til konsert' },
  { emoji:'🍱', type:'expense', amount:95,  desc:'Du glemte matpakke og kjøpte lunsj' },
  { emoji:'⚡', type:'expense', amount:130, desc:'Strømregningen var høyere enn forventet' },
  { emoji:'🎿', type:'expense', amount:280, desc:'Skileie for en dag i skiheisen' },
  { emoji:'📸', type:'expense', amount:110, desc:'Du ødelagde en venns ting og måtte erstatte det' },
  { emoji:'🚗', type:'expense', amount:175, desc:'Drosje hjem etter sen kveld' },
  { emoji:'🌊', type:'expense', amount:240, desc:'Vannparken – billett og mat' },
];

window._hendelser = [];

function onHendelserSnap(snap) {
  window._hendelser = snap.val()
    ? Object.entries(snap.val()).map(([k,v]) => ({ ...v, fbKey: k }))
    : [];
  if (document.getElementById('page-belonninger')?.classList.contains('active')) {
    renderHendelser();
  }
}

function renderHendelser() {
  const filter = document.getElementById('hend-filter')?.value || 'all';
  const list = document.getElementById('hendelser-list');
  if (!list) return;

  const all = window._hendelser;
  const income  = all.filter(h => h.type === 'income');
  const expense = all.filter(h => h.type === 'expense');

  // Update stats
  const ct = document.getElementById('hend-count-total');
  const ci = document.getElementById('hend-count-income');
  const ce = document.getElementById('hend-count-expense');
  if (ct) ct.textContent = all.length;
  if (ci) ci.textContent = income.length;
  if (ce) ce.textContent = expense.length;

  const filtered = filter === 'all' ? all : all.filter(h => h.type === filter);

  if (!filtered.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:.9rem;padding:1rem;">Ingen hendelser å vise.</div>';
    return;
  }

  list.innerHTML = filtered.map(h => {
    const isIncome = h.type === 'income';
    const bg    = isIncome ? '#dcfce7' : '#fee2e2';
    const color = isIncome ? '#15803d' : '#dc2626';
    const border= isIncome ? '#86efac' : '#fca5a5';
    const sign  = isIncome ? '+' : '-';
    return `<div style="background:${bg};border:1.5px solid ${border};border-radius:12px;padding:.85rem 1rem;display:flex;flex-direction:column;gap:.4rem;position:relative;">
      <div style="display:flex;align-items:center;gap:.5rem;">
        <span style="font-size:1.6rem;">${h.emoji}</span>
        <div style="flex:1;">
          <div style="font-weight:800;font-size:.88rem;color:#1a1040;line-height:1.2;">${h.desc}</div>
          <div style="font-size:.82rem;font-weight:900;color:${color};margin-top:2px;">${sign}🪙${h.amount}</div>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm" onclick="showHendelseQR('${h.fbKey}')" title="Vis QR">⬛</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteHendelse('${h.fbKey}')" title="Slett" style="color:var(--coral);">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function addHendelse() {
  if (!ready()) return;
  const emoji  = document.getElementById('hend-emoji').value.trim() || '🎲';
  const desc   = document.getElementById('hend-desc').value.trim();
  const type   = document.getElementById('hend-type').value;
  const amount = parseInt(document.getElementById('hend-amount').value) || 0;
  const alertEl = document.getElementById('hend-alert');

  if (!desc) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Skriv inn en beskrivelse.</div>'; return;
  }
  if (amount < 1 || amount > 9999) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Beløp må være mellom 1 og 9999.</div>'; return;
  }

  await window._set(window._push(fbRef('hendelser')), { emoji, desc, type, amount, created: Date.now() });
  document.getElementById('hend-emoji').value  = '';
  document.getElementById('hend-desc').value   = '';
  document.getElementById('hend-amount').value = '';
  alertEl.innerHTML = `<div class="alert alert-success">✅ Hendelse lagt til!</div>`;
  setTimeout(() => alertEl.innerHTML = '', 2500);
}

async function deleteHendelse(fbKey) {
  if (!confirm('Slett denne hendelsen?')) return;
  await window._remove(fbRef('hendelser/' + fbKey));
}

async function clearAllHendelser() {
  if (!confirm('Slett ALLE hendelser? Dette kan ikke angres.')) return;
  await window._remove(fbRef('hendelser'));
}

async function seedDefaultHendelser() {
  if (!ready()) return;
  if (window._hendelser.length > 0) {
    if (!confirm('Du har allerede ' + window._hendelser.length + ' hendelser. Legg til 30 standard i tillegg?')) return;
  }

  const alertEl = document.getElementById('hend-alert');
  if (alertEl) alertEl.innerHTML = '<div class="alert alert-info">⏳ Laster inn 30 hendelser…</div>';

  try {
    // Skriv alle 30 parallelt via Promise.all – langt raskere enn sekvensiell loop
    await Promise.all(DEFAULT_HENDELSER.map(function(h) {
      return window._set(window._push(fbRef('hendelser')), Object.assign({}, h, { created: Date.now() }));
    }));
    if (alertEl) {
      alertEl.innerHTML = '<div class="alert alert-success">✅ 30 standard hendelser lagt til!</div>';
      setTimeout(function() { alertEl.innerHTML = ''; }, 3000);
    }
  } catch(err) {
    console.error('seedDefaultHendelser feilet:', err);
    if (alertEl) {
      alertEl.innerHTML = '<div class="alert alert-error">❌ Feil: ' + err.message + '. Sjekk Firebase-regler.</div>';
    }
  }
}

// ── QR-MODAL FOR HENDELSE ─────────────────────────────────────────────────────
// Reuse the job QR modal – check if it exists, otherwise use a dedicated approach
function showHendelseQR(fbKey) {
  const h = window._hendelser.find(x => x.fbKey === fbKey);
  if (!h) return;

  // Kompakt payload (kortere felt = får plass i QR selv med lange beskrivelser/æøå)
  // t=type, s=subtype, a=amount, d=desc. Elev-appen leser begge varianter.
  const payload = JSON.stringify({ t: 'event', s: h.type, a: h.amount, d: h.desc });

  // Åpne modal FØRST, generer QR etterpå (dobbel rAF for synlighet)
  const modal = document.getElementById('modal-hend-qr');
  const box   = document.getElementById('modal-hend-qr-box');
  const title = document.getElementById('modal-hend-qr-title');
  const desc  = document.getElementById('modal-hend-qr-desc');

  const isIncome = h.type === 'income';
  const sign = isIncome ? '+' : '-';
  title.textContent = h.emoji + ' ' + h.desc;
  desc.textContent  = (isIncome ? '💰 Inntekt' : '💸 Utgift') + ': ' + sign + '🪙' + h.amount;
  box.innerHTML     = '<div style="width:250px;height:250px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.85rem;">Genererer QR…</div>';
  modal.classList.add('open');

  requestAnimationFrame(() => requestAnimationFrame(() => {
    box.innerHTML = '';
    // correctLevel L gir plass til ~50 % flere tegn enn M → trygt for lange norske tekster
    let ok = false;
    try {
      new QRCode(box, { text: payload, width: 250, height: 250, correctLevel: QRCode.CorrectLevel.L });
      ok = !!box.querySelector('canvas, img');
    } catch(e) { ok = false; }
    // Fallback: hvis qrcodejs likevel feilet (tekst for lang), bruk online QR-tjeneste
    if (!ok) {
      box.innerHTML = '';
      const img = new Image();
      img.width = 250; img.height = 250;
      img.crossOrigin = 'anonymous';
      img.onerror = () => {
        box.innerHTML = '<p style="color:var(--coral);font-size:.82rem;">Kunne ikke generere QR – beskrivelsen er for lang. Forkort den og prøv igjen.</p>';
      };
      img.onload = () => {
        // Lagre dataUrl for utskrift
        try {
          const c = document.createElement('canvas');
          c.width = 250; c.height = 250;
          c.getContext('2d').drawImage(img, 0, 0, 250, 250);
          const btn = document.getElementById('hend-qr-print-btn');
          if (btn) btn._qrDataUrl = c.toDataURL('image/png');
        } catch(_) {}
      };
      img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&ecc=L&data=' + encodeURIComponent(payload);
      box.appendChild(img);
    }
    // Lagre dataUrl for utskrift (canvas-variant)
    setTimeout(() => {
      const canvas = box.querySelector('canvas');
      if (canvas) document.getElementById('hend-qr-print-btn')._qrDataUrl = canvas.toDataURL('image/png');
    }, 200);
    // Lagre payload for print-knapp
    document.getElementById('hend-qr-print-btn')._payload  = payload;
    document.getElementById('hend-qr-print-btn')._hendelse = h;
  }));
}

function printHendelseQRCard() {
  const btn = document.getElementById('hend-qr-print-btn');
  const h   = btn._hendelse;
  const dataUrl = btn._qrDataUrl || '';
  if (!dataUrl || !h) { alert('QR ikke klar ennå – vent et sekund.'); return; }
  printHendelserCards([{ ...h, _dataUrl: dataUrl }]);
}

// ── UTSKRIFT: 4 hendelser per A4, med kuttlinjer ──────────────────────────────
function printHendelser() {
  const all = window._hendelser;
  if (!all.length) { alert('Ingen hendelser å skrive ut.'); return; }
  // Generate QR data URLs via api.qrserver.com (no canvas issues in print)
  // Bruk kompakt payload (kortere felt) + ecc=L så lange tekster med æøå får plass.
  const cards = all.map(h => ({
    ...h,
    qrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&ecc=L&data=' +
           encodeURIComponent(JSON.stringify({ t:'event', s:h.type, a:h.amount, d:h.desc }))
  }));
  openHendelserPrintWindow(cards);
}

function openHendelserPrintWindow(cards) {
  const win = window.open('', '_blank', 'width=900,height=700');

  const cardHTML = (c) => {
    const isIncome = c.type === 'income';
    const color    = isIncome ? '#15803d' : '#dc2626';
    const bg       = isIncome ? '#f0fdf4' : '#fff1f2';
    const border   = isIncome ? '#86efac' : '#fca5a5';
    const sign     = isIncome ? '+' : '−';
    const label    = isIncome ? 'INNTEKT' : 'UTGIFT';
    const qrSrc    = c.qrUrl || (c._dataUrl || '');
    return `<div class="card" style="background:${bg};border:2.5px solid ${border};">
      <div class="type-label" style="background:${border};color:${color};">${label}</div>
      <div class="emoji">${c.emoji}</div>
      <div class="desc">${c.desc}</div>
      <div class="amount" style="color:${color};">${sign} 🪙 ${c.amount}</div>
      <div class="qr-wrap"><img src="${qrSrc}" width="130" height="130" alt="QR"></div>
      <div class="scan-hint">Scan for å registrere</div>
    </div>`;
  };

  // Group into pages of 4
  let pagesHTML = '';
  for (let i = 0; i < cards.length; i += 4) {
    const group = cards.slice(i, i+4);
    while (group.length < 4) group.push(null);
    pagesHTML += `<div class="page">
      ${group.map(c => c ? cardHTML(c) : '<div class="card empty"></div>').join('')}
    </div>`;
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Nunito', sans-serif; background: white; }
    @media print { @page { size: A4 portrait; margin: 0; } }

    /* A4 = 210 × 297mm. 4 kort: 2×2 rutenett, kuttlinjer mellom */
    .page {
      width: 210mm;
      height: 297mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      page-break-after: always;
    }

    /* Kuttlinjer: grønn stiplet linje mellom kortene */
    .page::after {
      content: '';
      position: absolute;
      pointer-events: none;
    }

    /* Stiplet kuttlinje vertikalt (midten) */
    .page {
      position: relative;
    }
    .page::before {
      content: '';
      position: absolute;
      left: 50%;
      top: 8mm;
      bottom: 8mm;
      width: 0;
      border-left: 1.5px dashed #1D9E75;
      z-index: 10;
      pointer-events: none;
    }
    .page::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 8mm;
      right: 8mm;
      height: 0;
      border-top: 1.5px dashed #1D9E75;
      z-index: 10;
      pointer-events: none;
    }

    .card {
      padding: 7mm 8mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3.5mm;
      text-align: center;
      border: none;  /* outer border removed – kuttlinje erstatter */
      outline: 0.5px solid #d1d5db;
      outline-offset: -1px;
    }
    .card.empty { background: white; }

    .type-label {
      font-size: 3.5mm;
      font-weight: 900;
      letter-spacing: 0.5mm;
      padding: 1.5mm 5mm;
      border-radius: 3mm;
      text-transform: uppercase;
    }
    .emoji    { font-size: 22mm; line-height: 1.05; }
    .desc     { font-size: 5mm; font-weight: 800; color: #1a1040; line-height: 1.3; max-width: 80mm; }
    .amount   { font-family: 'Fredoka One', cursive; font-size: 11mm; line-height: 1; }
    .qr-wrap  { display: flex; justify-content: center; }
    .scan-hint{ font-size: 3mm; color: #6b7280; font-weight: 700; }
  </style>
</head><body>
  ${pagesHTML}
  <script>setTimeout(function(){ window.focus(); window.print(); }, 800);<\/script>
</body></html>`);
  win.document.close();
}


// ════════════════════════════════════════════════════════════
// MODALS & UTILS
// ════════════════════════════════════════════════════════════

// ── Tastatur-PIN (for PC-nettleser) ───────────────────────────────────────
document.addEventListener('keydown', function(e) {
  const loginScreen = document.getElementById('login-screen');
  const pinSection  = document.getElementById('pin-section');
  if (!loginScreen || loginScreen.style.display === 'none') return;
  if (!pinSection  || pinSection.style.display  === 'none') return;
  if (e.key >= '0' && e.key <= '9') { pinKey(e.key); e.preventDefault(); }
  if (e.key === 'Backspace') { pinKey('DEL'); e.preventDefault(); }
});

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

// ════════════════════════════════════════════════════════════
// BUDSJETT
// ════════════════════════════════════════════════════════════
window._budgetSettings = window._budgetSettings || { rentDesk:300, powerMin:50, powerMax:150, rentIpad:50, wedEventsEnabled:true };

function renderBudgetPage() {
  const bs = window._budgetSettings || {};
  const elDesk = document.getElementById('bud-rent-desk');
  const elPMin = document.getElementById('bud-power-min');
  const elPMax = document.getElementById('bud-power-max');
  const elIpad = document.getElementById('bud-rent-ipad');
  const elWed  = document.getElementById('bud-wed-events-toggle');
  if (elDesk) elDesk.value = bs.rentDesk ?? 300;
  if (elPMin) elPMin.value = bs.powerMin ?? 50;
  if (elPMax) elPMax.value = bs.powerMax ?? 150;
  if (elIpad) elIpad.value = bs.rentIpad ?? 50;
  if (elWed)  elWed.checked = bs.wedEventsEnabled !== false;

  // Status
  const cnt = document.getElementById('bud-status-hend-count');
  if (cnt) cnt.textContent = (window._hendelser || []).length;

  // Last paid – les fra Firebase
  if (window._get && window._db) {
    window._get(window._ref(window._db, 'fridayBudgetLastPaid')).then(snap => {
      const el = document.getElementById('bud-status-last-friday');
      if (el) el.textContent = snap.val() || 'aldri';
    }).catch(()=>{});
    window._get(window._ref(window._db, 'wedEventsLastApplied')).then(snap => {
      const el = document.getElementById('bud-status-last-wed');
      if (el) el.textContent = snap.val() || 'aldri';
    }).catch(()=>{});
  }

  // Faste jobber-liste
  const list = document.getElementById('bud-salary-jobs-list');
  if (list) {
    const salaryJobs = (window._jobs || []).filter(j => j.type === 'salary' && j.active !== false);
    if (!salaryJobs.length) {
      list.innerHTML = '<div style="color:var(--muted);font-size:.9rem;padding:1rem;">Ingen faste jobber. Opprett dem på Jobber-siden.</div>';
    } else {
      list.innerHTML = salaryJobs.map(j => {
        const numEmp = j.assigned ? Object.keys(j.assigned).length : 0;
        return `<div style="background:var(--teal-light);border:1.5px solid var(--border);border-radius:12px;padding:.75rem .9rem;display:flex;align-items:center;gap:.6rem;">
          <span style="font-size:1.6rem;">${j.emoji || '💼'}</span>
          <div style="flex:1;">
            <div style="font-weight:800;font-size:.92rem;color:var(--teal-dark);">${j.title}</div>
            <div style="font-size:.78rem;color:var(--muted);font-weight:700;">🪙 ${j.pay} per uke · 👥 ${numEmp} ansatt${numEmp===1?'':'e'}</div>
          </div>
        </div>`;
      }).join('');
    }
  }
}

// Myntjakten-innstillinger (egen funksjon — flyttet til Belønninger-siden)
function renderMyntjaktenSettings57() {
  const mj = (window._settings && window._settings.myntjakten57) || {};
  const mjEnabled = document.getElementById('myntjakten57-enabled');
  const mjMax     = document.getElementById('myntjakten57-daily-max');
  // Default: aktivert, ingen grense
  if (mjEnabled) mjEnabled.checked = mj.enabled !== false;
  if (mjMax)     mjMax.value       = (mj.dailyMax != null) ? mj.dailyMax : 0;

  // Aktive nivå — mangler feltet (eldre datasett) → alle nivå på
  const al = mj.activeLevels;
  for (let i = 1; i <= 6; i++) {
    const cb = document.getElementById('myntjakten57-level-' + i);
    if (cb) cb.checked = !al || al[i] !== false;
  }

  // Dagens aktivitet
  renderMyntjaktenStats57();
}

// Lokal "i dag"-nøkkel — må matche logikken i myntjakten.html
function _myntjaktenTodayKey57() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function renderMyntjaktenStats57() {
  const summaryEl = document.getElementById('myntjakten57-stats-summary');
  const topEl     = document.getElementById('myntjakten57-stats-top');
  if (!summaryEl || !topEl) return;

  const students = window._students || [];
  const today = _myntjaktenTodayKey57();

  // Filtrer ut elever som har tjent i dag
  const active = students
    .map(s => {
      const t = s.myntjaktenToday;
      if (!t || t.date !== today) return null;
      const earned = parseInt(t.earned) || 0;
      if (earned <= 0) return null;
      return { name: s.name || s.id, earned };
    })
    .filter(Boolean)
    .sort((a, b) => b.earned - a.earned);

  if (active.length === 0) {
    summaryEl.textContent = 'Ingen elever har tjent mynter via Myntjakten i dag ennå.';
    topEl.textContent = '';
    return;
  }

  const total = active.reduce((sum, a) => sum + a.earned, 0);
  summaryEl.innerHTML = '👥 <strong>' + active.length + '</strong> elev' +
    (active.length === 1 ? '' : 'er') + ' har tjent totalt <strong>🪙 ' + total + '</strong> i dag.';

  // Topp 5 (eller færre hvis det er færre)
  const top = active.slice(0, 5);
  topEl.innerHTML = '🏆 ' + top.map(a => a.name + ' (🪙 ' + a.earned + ')').join(' · ');
}

async function saveMyntjakten57Settings() {
  const alertEl = document.getElementById('myntjakten57-alert');
  const enabled = !!document.getElementById('myntjakten57-enabled').checked;
  const dailyMax = parseInt(document.getElementById('myntjakten57-daily-max').value);

  if (isNaN(dailyMax) || dailyMax < 0 || dailyMax > 9999) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Dagstak må være et tall mellom 0 og 9999 (0 = ingen grense).</div>';
    return;
  }

  // Aktive nivå — minst ett må være på
  const activeLevels = {};
  let levelCount = 0;
  for (let i = 1; i <= 6; i++) {
    const on = !!document.getElementById('myntjakten57-level-' + i).checked;
    activeLevels[i] = on;
    if (on) levelCount++;
  }
  if (levelCount === 0) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Minst ett nivå må være aktivt i Myntjakten.</div>';
    return;
  }

  try {
    await window._update(window._ref(window._db, 'settings'), {
      myntjakten57: { enabled, dailyMax, activeLevels, updated: Date.now() }
    });
    if (!window._settings) window._settings = {};
    window._settings.myntjakten57 = { enabled, dailyMax, activeLevels };

    const levelNote = levelCount < 6 ? ` ${levelCount} av 6 nivå er aktive.` : '';
    const status = (enabled
      ? (dailyMax > 0
          ? `✅ Lagret. Elevene kan tjene opp til 🪙 ${dailyMax} per dag via Myntjakten.`
          : '✅ Lagret. Ingen dagstak — elevene kan tjene fritt.')
      : '✅ Lagret. Opptjening via Myntjakten er slått av.') + levelNote;
    alertEl.innerHTML = '<div class="alert alert-success">' + status + '</div>';
    setTimeout(() => alertEl.innerHTML = '', 3500);
  } catch(e) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Lagring feilet: ' + e.message + '</div>';
  }
}

async function saveBudgetSettings() {
  const alertEl = document.getElementById('bud-alert');
  const rentDesk = parseInt(document.getElementById('bud-rent-desk').value);
  const powerMin = parseInt(document.getElementById('bud-power-min').value);
  const powerMax = parseInt(document.getElementById('bud-power-max').value);
  const rentIpad = parseInt(document.getElementById('bud-rent-ipad').value);
  const wedOn    = !!document.getElementById('bud-wed-events-toggle').checked;

  if ([rentDesk, powerMin, powerMax, rentIpad].some(v => isNaN(v) || v < 0 || v > 9999)) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Alle beløp må være tall mellom 0 og 9999.</div>';
    return;
  }
  if (powerMin > powerMax) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Strøm-min kan ikke være større enn strøm-maks.</div>';
    return;
  }

  try {
    await window._set(fbRef('budgetSettings'), {
      rentDesk, powerMin, powerMax, rentIpad, wedEventsEnabled: wedOn,
      updated: Date.now()
    });
    alertEl.innerHTML = '<div class="alert alert-success">✅ Innstillinger lagret!</div>';
    setTimeout(() => alertEl.innerHTML = '', 2500);
  } catch(e) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Lagring feilet: ' + e.message + '</div>';
  }
}

async function runBudgetExpensesNow() {
  if (!confirm('Trekke faste utgifter (pult, strøm, iPad) fra ALLE elever nå? Dette kan ikke angres.')) return;
  const alertEl = document.getElementById('bud-alert');
  alertEl.innerHTML = '<div class="alert alert-info">⏳ Kjører trekk for alle elever…</div>';
  try {
    if (typeof window._runFridayBudgetNow === 'function') {
      await window._runFridayBudgetNow();
      alertEl.innerHTML = '<div class="alert alert-success">✅ Trekk gjennomført!</div>';
      renderBudgetPage();
    } else {
      alertEl.innerHTML = '<div class="alert alert-error">⚠️ Funksjonen er ikke klar – prøv igjen om et øyeblikk.</div>';
    }
    setTimeout(() => alertEl.innerHTML = '', 3000);
  } catch(e) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠️ Feilet: ' + e.message + '</div>';
  }
}

async function runWednesdayEventsNow() {
  if (!(window._hendelser || []).length) {
    alert('Ingen hendelser i biblioteket. Legg til hendelser først (Hendelser-siden).');
    return;
  }
  if (!confirm('Tildele én tilfeldig hendelse til ALLE elever nå? Dette kan ikke angres.')) return;
  try {
    if (typeof window._runWednesdayEventsNow === 'function') {
      await window._runWednesdayEventsNow();
      alert('✅ Hendelser tildelt!');
      renderBudgetPage();
    } else {
      alert('⚠️ Funksjonen er ikke klar – prøv igjen om et øyeblikk.');
    }
  } catch(e) {
    alert('⚠️ Feilet: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════
// MERKER
// ════════════════════════════════════════════════════════════

const DEFAULT_BADGE_PARAMS = {
  quizBronse: 25, quizSolv: 50, quizGull: 75,
  spareBronse: 100, spareSolv: 1000, spareGull: 10000,
  skattBronse: 1000, skattSolv: 5000, skattGull: 10000,
  bonusBronse: 500, bonusSolv: 2500, bonusGull: 5000
};

function loadBadgeParamsToForm() {
  const bp = window._settings?.badgeParams || DEFAULT_BADGE_PARAMS;
  const fields = ['quizBronse','quizSolv','quizGull','spareBronse','spareSolv','spareGull','skattBronse','skattSolv','skattGull','bonusBronse','bonusSolv','bonusGull'];
  fields.forEach(f => {
    const el = document.getElementById('bp-' + f);
    if (el) el.value = bp[f] !== undefined ? bp[f] : DEFAULT_BADGE_PARAMS[f];
  });
}

async function saveBadgeParams() {
  const alertEl = document.getElementById('bp-save-alert');
  const fields = ['quizBronse','quizSolv','quizGull','spareBronse','spareSolv','spareGull','skattBronse','skattSolv','skattGull','bonusBronse','bonusSolv','bonusGull'];
  const bp = {};
  for (const f of fields) {
    const v = parseInt(document.getElementById('bp-' + f)?.value);
    if (isNaN(v) || v < 0) { alertEl.textContent = '⚠️ Alle felter må være positive tall'; alertEl.style.color='var(--coral)'; return; }
    bp[f] = v;
  }
  try {
    await window._update(fbRef('settings'), { badgeParams: bp });
    if (!window._settings) window._settings = {};
    window._settings.badgeParams = bp;
    alertEl.textContent = '✅ Lagret!';
    alertEl.style.color = 'var(--teal-dark)';
    setTimeout(() => alertEl.textContent = '', 2500);
    renderMerkerPage();
  } catch(e) {
    alertEl.textContent = '⚠️ Feilet: ' + e.message;
    alertEl.style.color = 'var(--coral)';
  }
}

async function confirmBadgeReset() {
  const cls = document.getElementById('badge-reset-class').value;
  const alertEl = document.getElementById('badge-reset-alert');
  const target = cls ? `klasse ${cls}` : 'alle elever';
  if (!confirm(`⚠️ Vil du virkelig slette ALLE merker og nullstille fremgang for ${target}? Dette kan ikke angres!`)) return;

  try {
    const students = window._students.filter(s => !cls || s.class === cls);
    const updates = {};
    for (const s of students) {
      updates['students57/' + s.fbKey + '/badges'] = null;
      updates['students57/' + s.fbKey + '/quizCorrectTotal'] = 0;
      updates['students57/' + s.fbKey + '/badgeSavingsEarned'] = 0;
      updates['students57/' + s.fbKey + '/badgeTaxContributed'] = 0;
    }
    await window._update(fbRef('/'), updates);
    alertEl.innerHTML = `<div class="alert alert-success">✅ Merker nullstilt for ${students.length} elever!</div>`;
    setTimeout(() => alertEl.innerHTML = '', 3500);
    renderMerkerPage();
  } catch(e) {
    alertEl.innerHTML = `<div class="alert alert-error">⚠️ Feilet: ${e.message}</div>`;
  }
}

function badgeLevelBadge(earned, level) {
  const colors = { bronse: '#cd7f32', sølv: '#9ea7aa', gull: '#EF9F27' };
  const labels = { bronse: '🥉', sølv: '🥈', gull: '🥇' };
  if (earned) return `<span title="Oppnådd ${level}" style="font-size:1.1rem;">${labels[level]}</span>`;
  return `<span title="Ikke oppnådd ${level}" style="opacity:.25;font-size:1.1rem;">${labels[level]}</span>`;
}

function renderMerkerPage() {
  loadBadgeParamsToForm();
  const tbody = document.getElementById('merker-table-body'); if (!tbody) return;
  const cls = document.getElementById('merker-class-filter')?.value || '';
  const bp = window._settings?.badgeParams || DEFAULT_BADGE_PARAMS;
  const students = window._students.filter(s => !cls || s.class === cls);

  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:2rem;">Ingen elever</td></tr>';
    return;
  }

  tbody.innerHTML = students.map(s => {
    const badges = s.badges || {};
    const quiz = s.quizCorrectTotal || 0;
    const spare = s.badgeSavingsEarned || 0;
    const skatt = s.badgeTaxContributed || 0;

    const quizLevels = badgeLevelBadge(!!badges.quiz_bronse,'bronse') + badgeLevelBadge(!!badges.quiz_sølv,'sølv') + badgeLevelBadge(!!badges.quiz_gull,'gull');
    const spareLevels = badgeLevelBadge(!!badges.spare_bronse,'bronse') + badgeLevelBadge(!!badges.spare_sølv,'sølv') + badgeLevelBadge(!!badges.spare_gull,'gull');
    const skattLevels = badgeLevelBadge(!!badges.skatt_bronse,'bronse') + badgeLevelBadge(!!badges.skatt_sølv,'sølv') + badgeLevelBadge(!!badges.skatt_gull,'gull');

    const quizPct = Math.min(100,Math.round(quiz/bp.quizGull*100));
    const sparePct = Math.min(100,Math.round(spare/bp.spareGull*100));
    const skattPct = Math.min(100,Math.round(skatt/bp.skattGull*100));

    const miniBar = (pct, color) => `<div style="height:4px;background:#e5e7eb;border-radius:4px;margin-top:3px;overflow:hidden;width:80px;display:inline-block;"><div style="height:100%;width:${pct}%;background:${color};border-radius:4px;"></div></div>`;

    return `<tr>
      <td data-label="Elev">
        <div style="font-weight:800;font-size:.88rem;">${s.firstname} ${s.lastname}</div>
      </td>
      <td data-label="Klasse"><span class="class-badge">${s.class}</span></td>
      <td data-label="Quiz">
        <div style="font-weight:800;">${quiz}</div>
        ${miniBar(quizPct, '#7c3aed')}
      </td>
      <td data-label="Nivå">${quizLevels}</td>
      <td data-label="Spare">
        <div style="font-weight:800;">🪙 ${spare}</div>
        ${miniBar(sparePct, '#16a34a')}
      </td>
      <td data-label="Nivå">${spareLevels}</td>
      <td data-label="Skatt">
        <div style="font-weight:800;">🪙 ${skatt}</div>
        ${miniBar(skattPct, '#EF9F27')}
      </td>
      <td data-label="Nivå">${skattLevels}</td>
    </tr>`;
  }).join('');
}

