
// ── STATE ──────────────────────────────────────────────────────────────────
window._allStudents=[]; window._classGoals=[]; window._jobs=[]; window._fundHistory={};
window._currentStudent=null; window._settings={taxRate:20,savingsInterest:5,fundLowMax:5,fundHighMax:10,maxWithdrawals:2,loanInterest:10,loanFactor:2,fundTax:10};

// ── Workspace-filtrering (multi-tenant, fase 4) ─────────────────────────────
// Elever ser kun ting fra sitt workspace. Eksisterende elever uten workspaceId
// behandles som 'main' (bakoverkompatibelt). Admin-bryteren disableWorkspaceFiltering
// i settings slår av filteret umiddelbart hvis noe ryker.
function studentWorkspaceId() {
  const s = window._currentStudent;
  if (!s) return null;
  return s.workspaceId || 'main';
}
function elevWorkspaceFilteringEnabled() {
  if (!window._settings) return true;
  return !window._settings.workspaceFilteringDisabled;
}
function filterByStudentWorkspace(items) {
  if (!Array.isArray(items)) return items;
  if (!elevWorkspaceFilteringEnabled()) return items;
  const ws = studentWorkspaceId() || 'main';
  return items.filter(it => ((it && it.workspaceId) || 'main') === ws);
}
function getJobs()      { return filterByStudentWorkspace(window._jobs || []); }
function getShop()      { return filterByStudentWorkspace(window._shop57 || []); }
function getWorkPlans() { return filterByStudentWorkspace(window._workPlans || []); }

// ── Per-workspace settings i elevappen (fase 3) ─────────────────────────────
function _elevWsSettingsFor(wsId) {
  return (window._workspaceSettingsByWs || {})[wsId] || {};
}
function getEffectiveBudgetSettingsElev() {
  const ws = studentWorkspaceId();
  if (!ws || ws === 'main') return window._budgetSettings || {rentDesk:300,powerMin:50,powerMax:150,rentIpad:50,wedEventsEnabled:true};
  return _elevWsSettingsFor(ws).budgetSettings || window._budgetSettings || {rentDesk:300,powerMin:50,powerMax:150,rentIpad:50,wedEventsEnabled:true};
}
function getEffectiveBadgeParamsElev() {
  const ws = studentWorkspaceId();
  const fromMain = (window._settings && window._settings.badgeParams);
  if (!ws || ws === 'main') return fromMain || {};
  return _elevWsSettingsFor(ws).badgeParams || fromMain || {};
}
function getClassGoals() { return filterByStudentWorkspace(window._classGoals || []); }


let currentPin='',confirmPin='',transactions=[];
let scanMode=null,pendingPayAmount=0,scanActive=false,_scanCanvas=null,_scanCtx=null;
let quizQs=[],quizIdx=0,quizOk=0,quizAnswered=false;
let inputCb=null;
let _fondChart=null;

function fbRef(p){return window._ref(window._db,p);}
function getTax(){return (window._settings?.taxRate||20)/100;}
function getSavingsRate(){return (window._settings?.savingsInterest||5)/100;}
function getFundTax(){return (window._settings?.fundTax||10)/100;}
function getLoanRate(){return (window._settings?.loanInterest||10)/100;}
function getLoanFactor(){return window._settings?.loanFactor||2;}
function getMaxW(){return window._settings?.maxWithdrawals||2;}

// ── SPAREMODELL: Daglig rente (samme som 1-4) ─────────────────────────────
// Låst saldo (fra forrige mandag) får full ukentlig rente.
// Ventende innskudd (gjort midt i uka) får dagsrente basert på antall dager
// pengene har ligget der. Hver mandag utbetales rente og pending → locked.
const MS_PER_DAY_57 = 24 * 3600 * 1000;
function lastMondayTs57(now) {
  const d = new Date(now);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0=søn, 1=man, ..., 6=lør
  const daysSinceMonday = (day === 0) ? 6 : (day - 1);
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}
// Normaliser pending (Firebase kan returnere array som objekt med numeriske keys)
function normPending57(p) {
  if (Array.isArray(p)) return [...p];
  if (p && typeof p === 'object') return Object.values(p);
  return [];
}
// Hent låst saldo med migrasjons-fallback: hvis savingsLocked ikke finnes,
// behandle hele eksisterende savings-saldoen som låst (full rente neste mandag).
function getLocked57(s) {
  return (s.savingsLocked !== undefined && s.savingsLocked !== null)
    ? s.savingsLocked
    : (s.savings || 0);
}

async function checkAndPaySavingsInterest57(s) {
  if (!s || !s.fbKey) return;
  // ⚠️ AVSLÅTT: Sparerenten i 5.–7. håndteres nå UTELUKKENDE av nattjobben
  // (cron.mjs → payWeeklySavingsInterest57), som bruker nøyaktig samme
  // dag-vektede modell og fører transaksjonen «Sparerente (X%)». Appen
  // betalte tidligere rente i tillegg, noe som ga skjult dobbel utbetaling i
  // saldoen. Innskudd/uttak vedlikeholder fortsatt savingsLocked/savingsPending
  // selv, så modellen forblir korrekt – vi returnerer bare her.
  return;
  // --- gammel logikk under (kjøres aldri) -----------------------------------
  const totalSavings = s.savings || 0;
  const now = Date.now();
  const lastMon = lastMondayTs57(now);
  const lastPaid = s.lastInterestPaid || 0;
  const initialLocked = getLocked57(s);
  const initialPending = normPending57(s.savingsPending);
  const needsMigration = (s.savingsLocked === undefined || s.savingsLocked === null);

  // Hvis ingenting å gjøre og ingen migrasjon, returner
  if (lastPaid >= lastMon) {
    if (needsMigration && totalSavings > 0) {
      // Skriv migrert state én gang så fremtidige innskudd/uttak har feltene
      const upd = { savingsLocked: initialLocked, savingsPending: initialPending };
      patchStudent(s.fbKey, upd);
      try { await window._update(fbRef('students57/'+s.fbKey), upd); } catch(e){}
    }
    return;
  }
  if (totalSavings <= 0 && !needsMigration) {
    // Bare oppdater lastInterestPaid så vi ikke prøver igjen samme mandag
    const upd = { lastInterestPaid: lastMon };
    patchStudent(s.fbKey, upd);
    try { await window._update(fbRef('students57/'+s.fbKey), upd); } catch(e){}
    return;
  }

  // Antall mandager å utbetale (1 normalt, flere ved langt fravær)
  let weeksToPay = 1;
  if (lastPaid > 0) {
    const lastPaidMon = lastMondayTs57(lastPaid);
    weeksToPay = Math.round((lastMon - lastPaidMon) / (7 * MS_PER_DAY_57));
    if (weeksToPay < 1) weeksToPay = 1;
    if (weeksToPay > 8) weeksToPay = 8;
  }

  const rate = getSavingsRate();
  let lockedBal = initialLocked;
  let pending = [...initialPending];
  let totalInterestPaid = 0;

  for (let i = 0; i < weeksToPay; i++) {
    const mondayTs = lastMon - (weeksToPay - 1 - i) * 7 * MS_PER_DAY_57;
    // Full ukerente på låst saldo
    let interestThisMonday = Math.floor(lockedBal * rate);
    // Dagsrente på ventende innskudd (kun for første mandag vi utbetaler)
    if (i === 0 && pending.length) {
      for (const dep of pending) {
        const days = Math.max(0, Math.min(7, Math.floor((mondayTs - (dep.ts||0)) / MS_PER_DAY_57)));
        const depInterest = Math.floor((dep.amount||0) * rate * (days/7));
        interestThisMonday += depInterest;
      }
    }
    if (interestThisMonday <= 0 && lockedBal <= 0 && pending.length === 0) break;

    // Etter mandag: pending låses inn + rente legges til låst saldo
    const pendingSum = pending.reduce((acc, d) => acc + (d.amount||0), 0);
    lockedBal = lockedBal + pendingSum + interestThisMonday;
    pending = [];

    if (interestThisMonday > 0) {
      totalInterestPaid += interestThisMonday;
      const rentePct = Math.round(rate * 100);
      const renteDesc = 'Sparerente (' + rentePct + '%)';
      try { await saveTx(s.fbKey, 'income', '✨', renteDesc, interestThisMonday); } catch(e){}
      transactions.unshift({ type:'income', icon:'✨', desc:renteDesc, amount:interestThisMonday, ts:mondayTs });
    }
  }

  const newSavings = lockedBal + pending.reduce((acc, d) => acc + (d.amount||0), 0);
  const upd = {
    savings: newSavings,
    savingsLocked: lockedBal,
    savingsPending: pending,
    lastInterestPaid: lastMon
  };
  if (totalInterestPaid > 0) {
    upd.badgeSavingsEarned = (s.badgeSavingsEarned || 0) + totalInterestPaid;
  }
  patchStudent(s.fbKey, upd);
  try { await window._update(fbRef('students57/'+s.fbKey), upd); } catch(e){ console.log('Sparerente-write feilet:', e.message); }
  refreshAllDisplays();
  renderTransactions();
}

// ── SCREENS ────────────────────────────────────────────────────────────────
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');}
function goToSplash(){stopScan();window._loginIntent=null;window._currentStudent=null;window._preselectedStudent=null;currentPin='';transactions=[];const pre=document.getElementById('login-preselect');if(pre)pre.style.display='none';const btn=document.getElementById('login-scan-btn');if(btn)btn.style.display='block';const card=document.getElementById('login-card');if(card)card.style.display='none';const sub=document.getElementById('login-subtitle');if(sub)sub.textContent='Scan bankkortet ditt for å logge inn';showScreen('screen-splash');}
function selectRole(){window._loginIntent=null;showScreen('screen-login');recallLoginCard();}

// ── ARBEIDSPLAN ─────────────────────────────────────────────────────────────
let _apPlanKey=null;     // valgt fag (workPlan-nøkkel)
let _apView='trapp';     // 'trapp' | 'step'
let _apStepIdx=0;

function apEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
// Sørg for at lenker har https:// foran – ellers tolkes de som relative
// adresser og havner under myntland.no/...
function apFixUrl(u){
  u=String(u||'').trim();
  if(!u) return '';
  if(/^(https?:\/\/|mailto:)/i.test(u)) return u;
  return 'https://'+u;
}
function apIsTablet(){
  return window.matchMedia('(min-width:700px) and (min-height:700px)').matches;
}
function updateArbeidsplanSplashBtn(){
  const btn=document.getElementById('splash-arbeidsplan-btn');
  if(!btn) return;
  // Foreløpig: Arbeidsplan-knappen vises alltid på splash-skjermen.
  // Når Myntland blir multitenant, bytt tilbake til linjene under – da
  // vises knappen kun når skolen faktisk har en aktiv arbeidsplan:
  //   const any=(getWorkPlans()||[]).some(p=>p.active!==false);
  //   btn.style.display=any?'flex':'none';
  btn.style.display='flex';
}
function goToArbeidsplan(){
  window._loginIntent='arbeidsplan';
  document.getElementById('login-subtitle').textContent='Scan bankkortet ditt for å se arbeidsplanen';
  showScreen('screen-login');
  recallLoginCard();
}
function apActivePlans(){
  const s=window._currentStudent; if(!s) return [];
  return getWorkPlans()
    .filter(p=>p.active!==false && p.class===s.class)
    .filter(p=>{
      // Tildelt undergruppe? Bare elever i listen ser planen.
      // Tom/manglende assignedTo = hele klassen (bakoverkompatibelt).
      const assigned=p.assignedTo;
      if(!assigned || !Array.isArray(assigned) || !assigned.length) return true;
      return assigned.indexOf(s.fbKey)>=0;
    })
    .sort((a,b)=>(a.created||0)-(b.created||0));
}
function apProgress(planKey){
  const sk=window._currentStudent?.fbKey;
  return (window._wpProgress?.[sk]?.[planKey]) || { current:0, steps:{} };
}
// ── Forsprangsbegrensning ──────────────────────────────────────────────────
// Et fag er låst hvis eleven ligger mer enn «grensa» trinn foran det faget hen
// ligger lengst bak på. Grensa settes per klasse i lærerportalen. Tom = av.
function wpClassKey(c){ return encodeURIComponent(String(c==null?'':c)).replace(/\./g,'%2E'); }
function apLeadLockedPlans(){
  const cls=window._currentStudent&&window._currentStudent.class;
  const lim=cls&&window._settings&&window._settings.wpLeadLimit&&window._settings.wpLeadLimit[wpClassKey(cls)];
  if(!lim||lim<=0) return {};
  const plans=apActivePlans();
  const nonDone=plans.filter(p=>(apProgress(p.fbKey).current||0)<((p.steps||[]).length));
  if(nonDone.length<=1) return {};
  const minCur=Math.min.apply(null,nonDone.map(p=>apProgress(p.fbKey).current||0));
  const locked={};
  plans.forEach(p=>{ if((apProgress(p.fbKey).current||0)-minCur>lim) locked[p.fbKey]=true; });
  return locked;
}
function apLaggingSubjects(){
  const plans=apActivePlans();
  const nonDone=plans.filter(p=>(apProgress(p.fbKey).current||0)<((p.steps||[]).length));
  if(!nonDone.length) return '';
  const minCur=Math.min.apply(null,nonDone.map(p=>apProgress(p.fbKey).current||0));
  return nonDone.filter(p=>(apProgress(p.fbKey).current||0)===minCur).map(p=>p.subject).join(' og ');
}
function enterArbeidsplan(){
  const plans=apActivePlans();
  _apPlanKey=plans.length?plans[0].fbKey:null;
  _apView='trapp';
  _apStepIdx=_apPlanKey?(apProgress(_apPlanKey).current||0):0;
  showScreen('screen-arbeidsplan');
  apRefresh(true);
}
function apBack(){
  if(_apView==='step' && !apIsTablet()){ _apView='trapp'; apShowPane(); }
  else { goToSplash(); }
}
// Telefon: vis ett panel om gangen. iPad: CSS (!important) viser begge.
function apShowPane(){
  const steps=document.getElementById('ap-steps');
  const detail=document.getElementById('ap-detail');
  if(!steps||!detail) return;
  if(_apView==='step'){ steps.style.display='none'; detail.style.display='block'; }
  else { steps.style.display='block'; detail.style.display='none'; }
}
function apRefresh(scrollActive){
  const plans=apActivePlans();
  const sub=document.getElementById('ap-sub');
  const subjEl=document.getElementById('ap-subjects');
  const steps=document.getElementById('ap-steps');
  const detail=document.getElementById('ap-detail');
  if(window._currentStudent) sub.textContent=window._currentStudent.firstname;
  if(!plans.length){
    subjEl.innerHTML='';
    steps.innerHTML='<div class="ap-empty"><div class="e">📋</div>'
      +'<div style="font-weight:800;color:var(--text)">Ingen arbeidsplan ennå</div>'
      +'<div style="font-size:.88rem;margin-top:4px">Læreren har ikke laget en arbeidsplan til klassen din enda.</div></div>';
    detail.innerHTML='';
    apShowPane();
    return;
  }
  if(!plans.some(p=>p.fbKey===_apPlanKey)) _apPlanKey=plans[0].fbKey;
  // fagmeny
  const apLk=apLeadLockedPlans();
  subjEl.innerHTML=plans.map(p=>
    `<button class="ap-subj-btn${p.fbKey===_apPlanKey?' active':''}" onclick="apSelectSubject('${p.fbKey}')">`
    +`${p.emoji||'📘'} ${apEsc(p.subject)}${apLk[p.fbKey]?' 🔒':''}</button>`).join('');
  apRenderTrapp();
  apRenderStepDetail();
  apShowPane();
  if(scrollActive){
    const el=document.querySelector('#ap-steps .ap-step.active');
    if(el) el.scrollIntoView({block:'center'});
  }
}
function apSelectSubject(planKey){
  _apPlanKey=planKey;
  _apView='trapp';
  _apStepIdx=apProgress(planKey).current||0;
  apRefresh(true);
}
function apRenderTrapp(){
  const plan=(getWorkPlans()||[]).find(p=>p.fbKey===_apPlanKey);
  const host=document.getElementById('ap-steps');
  if(!plan){ host.innerHTML=''; return; }
  const steps=plan.steps||[];
  const pr=apProgress(_apPlanKey);
  const cur=pr.current||0;
  const leadLocked=!!apLeadLockedPlans()[_apPlanKey];
  const allDone=cur>=steps.length;
  let html='';
  html+='<div class="ap-intro">🪜 Jobb deg oppover trappa – trinn 1 nederst! Du jobber med ett trinn '
       +'om gangen. Når læreren'+(steps.some(s=>s.approval==='both')?' (og en voksen hjemme)':'')
       +' har godkjent, låses neste trinn opp.</div>';
  if(allDone){
    html+='<div class="ap-status-box ap-status-ok" style="margin:0 0 1rem">🎉 Du har fullført hele '
         +apEsc(plan.subject)+'-trappa! Veldig bra jobba!</div>';
  }
  // Øverst = høyeste trinn, nederst = trinn 1 — eleven klatrer oppover.
  for(let i=steps.length-1;i>=0;i--){
    const st=steps[i];
    let cls='locked', ring='🔒', status='🔒 Låst';
    if(i<cur){ cls='done'; ring='✓'; status='✓ Fullført'; }
    else if(i===cur){
      cls='active'; ring=(i+1);
      const ss=pr.steps?.[i]||{};
      if(ss.teacherApproved && st.approval==='both' && !ss.guardianApproved)
        status='✓ Lærer godkjent – venter på voksen hjemme';
      else if(ss.teacherApproved)
        status='✓ Læreren har godkjent';
      else status='👉 Trykk for å se hva du skal gjøre';
      if(leadLocked) status='🔒 Låst – du ligger for langt foran';
    } else { ring=(i+1); }
    const tappable=(i<=cur);
    const sel=(i===_apStepIdx)?' ap-step-sel':'';
    html+=`<div class="ap-step ${cls}${sel}">
      <div class="ap-railwrap"><div class="ap-ring">${ring}</div><div class="ap-rail"></div></div>
      <div class="ap-card" ${tappable?`onclick="apOpenStep(${i})"`:''}>
        <div class="ap-card-title">Trinn ${i+1}: ${apEsc(st.title)}</div>
        <div class="ap-card-status">${status}</div>
      </div>
      <div class="ap-monster" ${tappable?`onclick="apOpenStep(${i})"`:''}>${wpMonsterImg(_apPlanKey,i,i<cur)}</div>
    </div>`;
  }
  host.innerHTML=html;
}
// Hvert trinn får sitt eget monster (samme 20 som forsiden). Godkjent trinn
// viser tommel-opp-versjonen fra monsters/tommel/.
const WP_MONSTERS=['groennhaar','appelsin','rosa','graa','moerkelilla','indigo',
  'marineblaa','vinroed','ildkatt','gullgul','gressgroenn','rustbrun','laksrosa',
  'mintgroenn','solskinn','turkis','lilla','himmelblaa','beige','havblaa'];
function wpHash(s){
  let h=0; s=String(s||'');
  for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0;
  return Math.abs(h);
}
function wpMonsterImg(planKey,stepIdx,done){
  const name=WP_MONSTERS[(wpHash(planKey)+stepIdx)%WP_MONSTERS.length];
  const url=done?'monsters/tommel/'+name+'.webp':'monsters/'+name+'.webp';
  return '<img src="'+url+'" alt="" loading="lazy"'
    +(done?' onerror="this.onerror=null;this.src=\'monsters/'+name+'.webp\'"':'')+'>';
}
function apOpenStep(idx){
  _apStepIdx=idx; _apView='step';
  apRenderTrapp();          // oppdater valgt-markering i menyen
  apRenderStepDetail();
  apShowPane();
}
function apRenderStepDetail(){
  const plan=(getWorkPlans()||[]).find(p=>p.fbKey===_apPlanKey);
  const host=document.getElementById('ap-detail');
  if(!plan){ host.innerHTML=''; return; }
  const i=_apStepIdx;
  const st=(plan.steps||[])[i];
  if(!st){ host.innerHTML=''; return; }
  const pr=apProgress(_apPlanKey);
  const cur=pr.current||0;
  const ss=pr.steps?.[i]||{};
  const isActive=(i===cur);
  const isDone=(i<cur);
  const checks=ss.checks||{};
  let html='';
  html+=`<div style="font-family:'Fredoka One',cursive;font-size:1.3rem;color:var(--teal-dark);margin-bottom:.6rem">`
       +`Trinn ${i+1}: ${apEsc(st.title)}</div>`;
  if(st.goal){
    html+='<div class="ap-detail-goal"><div class="g">'
         +apEsc(st.goal).replace(/\n/g,'<br>')+'</div></div>';
  }
  if(isActive && apLeadLockedPlans()[_apPlanKey]){
    const lag=apLaggingSubjects();
    html+='<div class="ap-status-box ap-status-wait">📌 Du ligger langt foran her. Jobb deg videre på '
         +(lag?apEsc(lag):'de andre fagene')+' før du fortsetter på dette faget.</div>';
    html+='<button onclick="apBack()" class="ap-detail-back" style="width:100%;margin-top:1rem;background:var(--white);border:2px solid var(--border);color:var(--muted);padding:12px;border-radius:12px;font-family:Nunito,sans-serif;font-weight:800;cursor:pointer">← Tilbake til trappa</button>';
    host.innerHTML=html; host.scrollTop=0;
    return;
  }
  const reqs=st.reqs||[];
  const goalsRead=!!ss.goalsRead;
  // På aktivt trinn vises alltid «Jeg har lest læringsmålene». Avkrysningen blir
  // uaktiv (grå) etter at den er huket av – og arbeidskravene kommer fram da.
  if(isActive && st.goal){
    html+=`<div class="ap-goalcheck">
      <div class="ap-check${goalsRead?' on ro':''}" ${goalsRead?'':'onclick="apMarkGoalsRead()"'}>${goalsRead?'✓':''}</div>
      <div class="ap-req-text">Jeg har lest læringsmålene</div>
    </div>`;
  }
  if(goalsRead || !(isActive && st.goal)){
    if(reqs.length){
      html+='<div class="section-title" style="margin-top:.3rem">✅ Arbeidskrav</div>';
      reqs.forEach((r,j)=>{
        const on=!!checks[j];
        const ro=!isActive;
        html+=`<div class="ap-req">
          <div class="ap-check${on?' on':''}${ro?' ro':''}" ${isActive?`onclick="apToggleCheck(${j})"`:''}>${on?'✓':''}</div>
          <div style="flex:1">
            <div class="ap-req-text">${apEsc(r.text)}</div>
            ${r.link?`<a class="ap-req-link" href="${apEsc(apFixUrl(r.link))}" target="_blank" rel="noopener">🔗 Åpne lenke</a>`:''}
          </div></div>`;
      });
    } else {
      html+='<div class="info-box">Ingen arbeidskrav lagt inn på dette trinnet.</div>';
    }
    // status
    if(isDone){
      html+='<div class="ap-status-box ap-status-ok">✓ Dette trinnet er fullført og godkjent. Bra jobba!</div>';
    } else if(isActive){
      const needBoth=st.approval==='both';
      if(ss.teacherApproved && needBoth && !ss.guardianApproved){
        html+='<div class="ap-status-box ap-status-wait">✓ Læreren har godkjent. Nå venter vi på at en voksen hjemme bekrefter.</div>';
      } else if(ss.teacherApproved){
        html+='<div class="ap-status-box ap-status-ok">✓ Læreren har godkjent trinnet ditt!</div>';
      } else {
        const nDone=reqs.filter((r,j)=>checks[j]).length;
        const allChecked=reqs.every((r,j)=>checks[j]);
        html+='<div class="ap-status-box ap-status-wait">'
             +(allChecked?'🌟 Alt er huket av! Vis arbeidet til læreren og scan godkjennings-QR-en.'
                         :`Huk av alle arbeidskrav – vis arbeidet ditt til læreren eller ta prøven for godkjenning (${nDone}/${reqs.length})`)
             +'</div>';
        html+='<button onclick="startScan(\'wpapprove\')" class="big-btn bb-teal" '
             +(allChecked?'':'disabled ')
             +'style="margin-top:.85rem'+(allChecked?'':';opacity:.45;cursor:not-allowed')+'">'
             +'📷 Scan godkjenning fra læreren</button>';
      }
    }
  } else {
    html+='<div class="info-box">👆 Huk av «Jeg har lest læringsmålene» når du har lest dem '
         +'– da kommer arbeidskravene fram.</div>';
  }
  html+='<button onclick="apBack()" class="ap-detail-back" style="width:100%;margin-top:1rem;background:var(--white);'
       +'border:2px solid var(--border);color:var(--muted);padding:12px;border-radius:12px;'
       +"font-family:'Nunito',sans-serif;font-weight:800;cursor:pointer\">← Tilbake til trappa</button>";
  host.innerHTML=html;
  host.scrollTop=0;
}
async function apToggleCheck(reqIdx){
  const sk=window._currentStudent?.fbKey; if(!sk||!_apPlanKey) return;
  const pr=apProgress(_apPlanKey);
  if(_apStepIdx!==(pr.current||0)) return;   // bare aktivt trinn
  const cur=!!(pr.steps?.[_apStepIdx]?.checks?.[reqIdx]);
  await window._update(
    fbRef('workPlanProgress/'+sk+'/'+_apPlanKey+'/steps/'+_apStepIdx+'/checks'),
    { [reqIdx]: !cur });
  // apRefresh skjer via onValue-lytteren
}
// Eleven bekrefter at læringsmålene er lest → arbeidskravene vises.
async function apMarkGoalsRead(){
  const sk=window._currentStudent?.fbKey; if(!sk||!_apPlanKey) return;
  await window._update(
    fbRef('workPlanProgress/'+sk+'/'+_apPlanKey+'/steps/'+_apStepIdx),
    { goalsRead:true });
}
// Felles fullføringslogikk (samme som lærerportal/foresattside).
async function apCheckCompletion(planKey){
  const plan=(getWorkPlans()||[]).find(p=>p.fbKey===planKey); if(!plan) return false;
  const steps=plan.steps||[];
  const sk=window._currentStudent?.fbKey; if(!sk) return false;
  const snap=await window._get(fbRef('workPlanProgress/'+sk+'/'+planKey));
  const pr=snap.val()||{current:0,steps:{}};
  const cur=pr.current||0;
  if(cur>=steps.length) return false;
  const step=steps[cur];
  const ss=(pr.steps&&pr.steps[cur])||{};
  if(ss.completed) return false;
  const ok=ss.teacherApproved && (step.approval!=='both' || ss.guardianApproved);
  if(!ok) return false;
  const base='workPlanProgress/'+sk+'/'+planKey;
  const upd={};
  upd[base+'/steps/'+cur+'/completed']=true;
  upd[base+'/steps/'+cur+'/completedTs']=Date.now();
  upd[base+'/steps/'+cur+'/bonusPaid']=true;
  upd[base+'/current']=cur+1;
  await window._update(fbRef('/'),upd);
  if((step.bonus||0)>0 && !ss.bonusPaid){
    const s2=(await window._get(fbRef('students57/'+sk))).val()||{};
    await window._update(fbRef('students57/'+sk),{balance:(s2.balance||0)+(step.bonus||0)});
    await saveTx(sk,'income','🪙','Arbeidsplan: «'+(step.title||'Trinn')+'» fullført',step.bonus);
  }
  return true;
}
// Eleven scanner lærerens generelle godkjennings-QR. QR-en bærer ingen
// fag-info – trinnet som godkjennes er det eleven står på akkurat nå.
async function doWpApproveScan(){
  const stu=window._currentStudent;
  const sk=stu?.fbKey;
  const planKey=_apPlanKey;
  const plan=(getWorkPlans()||[]).find(p=>p.fbKey===planKey);
  if(!sk||!plan||plan.active===false||plan.class!==stu?.class){
    showSuccess('📋','Åpne trinnet ditt først','','Gå inn på faget i Arbeidsplan og trykk «Scan godkjenning» fra trinnet ditt.'); return;
  }
  const steps=plan.steps||[];
  const snap=await window._get(fbRef('workPlanProgress/'+sk+'/'+planKey));
  const pr=snap.val()||{current:0,steps:{}};
  const cur=pr.current||0;
  if(cur>=steps.length){
    showSuccess('🎉','Alt er ferdig!','','Du har fullført hele '+plan.subject+'-trappa'); return;
  }
  const ss=(pr.steps&&pr.steps[cur])||{};
  if(ss.teacherApproved){
    showSuccess('✅','Allerede godkjent','','Læreren har alt godkjent dette trinnet'); return;
  }
  const step=steps[cur];
  if(!(step.reqs||[]).every((r,j)=>(ss.checks||{})[j])){
    showSuccess('📋','Ikke ferdig ennå','','Huk av alle arbeidskravene på trinnet ditt før du scanner godkjenning.');
    return;
  }
  await window._update(fbRef('workPlanProgress/'+sk+'/'+planKey+'/steps/'+cur),
    { teacherApproved:true, teacherApprovedTs:Date.now() });
  const completed=await apCheckCompletion(planKey);
  if(completed){
    showSuccess('🎉','Trinn fullført!', (step.bonus>0?'+🪙 '+step.bonus:''),
      'Bra jobba i '+plan.subject+'! Neste trinn er låst opp.');
  } else {
    showSuccess('✓','Godkjent av læreren!','',
      step.approval==='both'?'Nå mangler bare bekreftelse fra en voksen hjemme.':'');
  }
  _apPlanKey=planKey; _apStepIdx=cur; _apView='step';
  if(document.getElementById('screen-arbeidsplan').classList.contains('active')) apRefresh();
}

// Naviger til Myntjakten med kontekst-flagg så tilbakeknappen
// der peker hit i stedet for til markedsføringssiden.
function goToMyntjakten(){window.location.href='myntjakten.html?from=elevapp57';}
function goToMyntstigen(){window.location.href='stigespill.html?from=elevapp57';}
function openMyntspillMeny(){var m=document.getElementById('myntspill-meny');if(m)m.style.display='flex';}
function closeMyntspillMeny(){var m=document.getElementById('myntspill-meny');if(m)m.style.display='none';}

// ── LOGIN ──────────────────────────────────────────────────────────────────
// Kort-scan er påkrevd. PIN-en må matche nøyaktig den eleven kortet tilhører.
window._preselectedStudent=null;

// ── Husk scannet kort i 60 min ─────────────────────────────────────────────
// Eleven slipper å scanne på nytt ved hver innlogging. Bare kort-ID lagres,
// aldri PIN-en. Etter 60 min (regnet fra skanningen) må kortet scannes igjen.
var _CARD_KEY_57='myntland_loginCard_57';
function rememberLoginCard(fbKey){
  try{ localStorage.setItem(_CARD_KEY_57, JSON.stringify({fbKey:fbKey,exp:Date.now()+60*60*1000})); }catch(e){}
}
function forgetLoginCard(){
  try{ localStorage.removeItem(_CARD_KEY_57); }catch(e){}
}
function recallLoginCard(){
  try{
    var raw=localStorage.getItem(_CARD_KEY_57);
    if(!raw) return false;
    var d=JSON.parse(raw);
    if(!d||!d.fbKey||!d.exp||Date.now()>d.exp){ forgetLoginCard(); return false; }
    var all=window._allStudents||[];
    if(!all.length) return false;
    if(!all.some(function(x){return x.fbKey===d.fbKey;})){ forgetLoginCard(); return false; }
    handleLoginCardScan(d.fbKey);
    return true;
  }catch(e){ return false; }
}

function handleLoginCardScan(fbKey,fromScan){
  const s=(window._allStudents||[]).find(x=>x.fbKey===fbKey);
  if(!s){showSuccess('❌','Ukjent kort','','Be læreren om et nytt kort');return;}
  window._preselectedStudent=s;
  if(fromScan) rememberLoginCard(fbKey);
  document.getElementById('login-preselect-name').textContent=s.firstname+' '+s.lastname.charAt(0)+'.';
  document.getElementById('login-preselect').style.display='block';
  document.getElementById('login-scan-btn').style.display='none';
  document.getElementById('login-card').style.display='block';
  document.getElementById('login-subtitle').textContent='Bekreft med PIN-koden din';
  document.getElementById('login-error').textContent='';
  currentPin='';
  for(let i=0;i<4;i++)document.getElementById('dot-'+i).classList.remove('filled');
}

function clearPreselected(){
  forgetLoginCard();
  window._preselectedStudent=null;
  document.getElementById('login-preselect').style.display='none';
  document.getElementById('login-scan-btn').style.display='block';
  document.getElementById('login-card').style.display='none';
  document.getElementById('login-subtitle').textContent='Scan bankkortet ditt for å logge inn';
  document.getElementById('login-error').textContent='';
  currentPin='';
  for(let i=0;i<4;i++)document.getElementById('dot-'+i).classList.remove('filled');
}

function np(v){
  if(v==='DEL') currentPin=currentPin.slice(0,-1);
  else if(currentPin.length<4) currentPin+=v;
  for(let i=0;i<4;i++) document.getElementById('dot-'+i).classList.toggle('filled',i<currentPin.length);
  document.getElementById('login-error').textContent='';
  if(currentPin.length===4) setTimeout(tryLogin,200);
}
function tryLogin(){
  // Kort-scan er påkrevd – uten forhåndsvalgt elev er det ingenting å matche mot
  if(!window._preselectedStudent){
    document.getElementById('login-error').textContent='❌ Scan kortet først';
    currentPin='';
    for(let i=0;i<4;i++) document.getElementById('dot-'+i).classList.remove('filled');
    return;
  }
  const pre=window._preselectedStudent;
  const fresh=(window._allStudents||[]).find(x=>x.fbKey===pre.fbKey)||pre;
  let s=null;
  if(String(fresh.pin)===String(currentPin)) s=fresh;
  if(s){
    window._currentStudent=s;transactions=[];
    window._preselectedStudent=null;
    document.getElementById('login-preselect').style.display='none';
    document.getElementById('login-scan-btn').style.display='block';
    document.getElementById('login-card').style.display='none';
    document.getElementById('login-subtitle').textContent='Scan bankkortet ditt for å logge inn';
    document.getElementById('greeting-sub').textContent=s.firstname+' '+s.class;
    document.getElementById('card-holder').textContent=(s.firstname+' '+s.lastname).toUpperCase();
    document.getElementById('card-number').textContent='•••• ••••';
    refreshAllDisplays();
    renderClassGoalsHome();
    loadTransactions(s.fbKey);
    checkAndResetQuiz(s);
    checkAndPaySavingsInterest57(s);
    checkQuizStatus();
    renderLoan();
    checkLoanExpiry();
    if(window._loginIntent==='arbeidsplan'){
      window._loginIntent=null;
      enterArbeidsplan();
    } else if(window._loginIntent==='dag'){
      window._loginIntent=null;
      enterDag();
    } else {
      switchTab('bank',document.querySelector('.nav-item'));
      showScreen('screen-app');
    }
  } else {
    document.getElementById('login-error').textContent='❌ Feil PIN-kode!';
  }
  currentPin='';
  for(let i=0;i<4;i++) document.getElementById('dot-'+i).classList.remove('filled');
}

// ── TABS ───────────────────────────────────────────────────────────────────
function switchTab(t,btn){
  document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const tabEl=document.getElementById('tab-'+t);
  if(tabEl)tabEl.classList.add('active');
  if(btn)btn.classList.add('active');
}

// ── DISPLAY ────────────────────────────────────────────────────────────────
function refreshAllDisplays(){
  const s=window._currentStudent;if(!s)return;
  const bruk=s.balance||0,spare=s.savings||0;
  // Fondsverdi = andeler × nåværende kurs
  const histD=Object.keys(window._fundHistory||{}).sort();
  const curRL=histD.length?(window._fundHistory[histD[histD.length-1]]?.low||100):100;
  const curRH=histD.length?(window._fundHistory[histD[histD.length-1]]?.high||100):100;
  const fl=getFondValue(s.fund_low_units||0,curRL);
  const fh=getFondValue(s.fund_high_units||0,curRH);
  const total=bruk+spare+fl+fh;
  document.getElementById('bal-bruk').textContent=bruk;
  document.getElementById('bal-spare').textContent=spare;
  document.getElementById('bal-fond').textContent=fl+fh;
  document.getElementById('top-total').textContent=total+'🪙';
  document.getElementById('spare-main-val').textContent=spare;
  const rate=Math.round(getSavingsRate()*100);
  document.getElementById('spare-rate-sub').textContent=`${rate}% ukentlig rente · maks ${getMaxW()} uttak/uke`;
  // spare-info-box inneholder den fyldige "Visste du?"-forklaringen i HTML – ikke overskriv.
  document.getElementById('fond-tax-pct').textContent=Math.round(getFundTax()*100);
  const usedW=s.withdrawalsThisWeek||0;
  const warnEl=document.getElementById('spare-withdrawal-warn');
  if(warnEl)warnEl.style.display=usedW>=getMaxW()?'block':'none';
  const wBtn=document.getElementById('spare-withdraw-btn');
  if(wBtn)wBtn.disabled=usedW>=getMaxW();
  const mini=document.getElementById('mini-loan');
  if(mini)mini.textContent=(s.loan||0)+' 🪙';
}

// ── KLASSENS SPAREMÅL (forsiden) ───────────────────────────────────────────
function renderClassGoalsHome(){
  const card=document.getElementById('class-goals-card');
  const body=document.getElementById('class-goals-body');
  if(!card||!body)return;
  const goals=getClassGoals();
  if(!goals.length){card.style.display='none';return;}
  card.style.display='block';

  // Sortér: aktive først, så fullførte
  const active=goals.filter(g=>!g.completed);
  const done=goals.filter(g=>g.completed);
  const ordered=[...active,...done];

  const s=window._currentStudent;
  const chosenKey=s?.preferredGoal||'';
  const chosen=chosenKey?active.find(g=>g.fbKey===chosenKey):null;

  let headerHTML='';
  if(chosen){
    headerHTML=`<div class="chosen-goal-banner" onclick="openChooseGoalModal()">
      <div class="chosen-goal-left">
        <div class="chosen-goal-label">⭐ Du støtter</div>
        <div class="chosen-goal-name">${chosen.emoji||'🏦'} ${chosen.name}</div>
      </div>
      <div class="chosen-goal-edit">Bytt</div>
    </div>`;
  } else if(active.length){
    headerHTML=`<div class="chosen-goal-banner empty" onclick="openChooseGoalModal()">
      <div class="chosen-goal-left">
        <div class="chosen-goal-label" style="color:var(--coral);">⚠️ Du har ikke valgt et sparemål ennå</div>
        <div class="chosen-goal-name" style="font-size:.85rem;color:var(--muted);">Skatten din venter på å bli plassert</div>
      </div>
      <div class="chosen-goal-edit" style="background:var(--amber);color:var(--teal-dark);">Velg</div>
    </div>`;
  }

  body.innerHTML=headerHTML+ordered.map(g=>{
    const saved=g.saved||0;
    const target=g.target||1;
    const pct=Math.min(100,Math.round(saved/target*100));
    const isDone=!!g.completed;
    const isMine=g.fbKey===chosenKey&&!isDone;
    return `<div class="class-goal-row${isMine?' mine':''}">
      <div class="class-goal-top">
        <div class="class-goal-emoji">${g.emoji||'🏦'}</div>
        <div class="class-goal-name${isDone?' done':''}">${g.name||'Sparemål'}${isDone?' ✅':''}${isMine?' <span class="mine-badge">⭐ Mitt valg</span>':''}</div>
      </div>
      <div class="class-goal-bar"><div class="class-goal-fill${isDone?' done':''}" style="width:${pct}%;"></div></div>
      <div class="class-goal-meta">
        <span>🪙 ${saved} / ${target}</span>
        <span class="pct">${pct}%</span>
        <span>${isDone?'Fullført!':'🪙 '+Math.max(0,target-saved)+' igjen'}</span>
      </div>
    </div>`;
  }).join('');
}

function openChooseGoalModal(){
  const goals=getClassGoals().filter(g=>!g.completed);
  const list=document.getElementById('choose-goal-list');
  if(!goals.length){
    list.innerHTML='<div style="text-align:center;color:var(--muted);padding:1rem;">Ingen aktive sparemål akkurat nå.</div>';
  } else {
    const s=window._currentStudent;
    const chosenKey=s?.preferredGoal||'';
    list.innerHTML=goals.map(g=>{
      const saved=g.saved||0;
      const pct=Math.min(100,Math.round(saved/(g.target||1)*100));
      const isMine=g.fbKey===chosenKey;
      return `<button class="choose-goal-row${isMine?' selected':''}" onclick="selectGoal('${g.fbKey}')">
        <div class="choose-goal-emoji">${g.emoji||'🏦'}</div>
        <div class="choose-goal-info">
          <div class="choose-goal-name">${g.name}</div>
          <div class="choose-goal-bar"><div class="choose-goal-fill" style="width:${pct}%;"></div></div>
          <div class="choose-goal-meta">🪙 ${saved} / ${g.target} · ${pct}%</div>
        </div>
        ${isMine?'<div class="choose-goal-check">⭐</div>':'<div class="choose-goal-check empty">○</div>'}
      </button>`;
    }).join('');
  }
  document.getElementById('choose-goal-modal').classList.add('open');
}

function closeChooseGoalModal(){
  document.getElementById('choose-goal-modal').classList.remove('open');
}

async function selectGoal(fbKey){
  const s=window._currentStudent;
  if(!s)return;
  try {
    await window._update(fbRef('students57/'+s.fbKey),{preferredGoal:fbKey});
    window._currentStudent.preferredGoal=fbKey;
    patchStudent(s.fbKey,{preferredGoal:fbKey});
    renderClassGoalsHome();
    closeChooseGoalModal();
  } catch(err) {
    alert('Kunne ikke lagre valget: '+(err.message||''));
  }
}

// ── PILL-BRYTER: Sparekonto / Fond ─────────────────────────────────────────
function switchSpareSeg(seg,btn){
  document.querySelectorAll('.spare-seg-content').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.ss-pill').forEach(b=>b.classList.remove('active'));
  const target=document.getElementById('spare-seg-'+seg);
  if(target)target.classList.add('active');
  if(btn)btn.classList.add('active');
}
async function distributeToGoals(amount){
  if(!amount||!getClassGoals().length)return;
  const pref=window._currentStudent?.preferredGoal;
  const active=window._classGoals.filter(g=>!g.completed);if(!active.length)return;
  const targets=pref?active.filter(g=>g.fbKey===pref):active;
  const perGoal=Math.floor(amount/(targets.length||active.length));
  const upd={};
  (targets.length?targets:active).forEach(g=>{
    const ns=(g.saved||0)+perGoal;
    upd['classGoals/'+g.fbKey+'/saved']=ns;
    if(ns>=g.target)upd['classGoals/'+g.fbKey+'/completed']=true;
  });
  await window._update(fbRef('/'),upd);
}

// ── TRANSACTIONS ───────────────────────────────────────────────────────────
function fmtDate(ts){
  const d = new Date(ts), now = new Date(), diff = now - d;
  if (diff < 60000)   return 'Nå nettopp';
  if (diff < 3600000) return Math.floor(diff/60000) + ' min siden';
  // Sammenlign faktiske kalenderdager (lokal/norsk tid), ikke antall timer.
  // Dette unngår at en transaksjon fra i går kveld vises som "I dag" bare
  // fordi det er mindre enn 24 timer siden.
  const sameDay = d.getFullYear() === now.getFullYear()
               && d.getMonth()    === now.getMonth()
               && d.getDate()     === now.getDate();
  if (sameDay) return 'I dag ' + d.toLocaleTimeString('no', {hour:'2-digit', minute:'2-digit'});
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const wasYesterday = d.getFullYear() === y.getFullYear()
                    && d.getMonth()    === y.getMonth()
                    && d.getDate()     === y.getDate();
  if (wasYesterday) return 'I går ' + d.toLocaleTimeString('no', {hour:'2-digit', minute:'2-digit'});
  return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0');
}
async function saveTx(sk,type,icon,desc,amount){if(!window._push||!window._set)return;await window._set(window._push(fbRef('transactions57/'+sk)),{type,icon,desc,amount,ts:Date.now()});}
async function loadTransactions(sk){
  if(!window._get)return;
  try{const snap=await window._get(fbRef('transactions57/'+sk));transactions=snap.val()?Object.values(snap.val()).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,30):[];renderTransactions();}catch(e){}
}
function renderTransactions(){
  const el=document.getElementById('transaction-list');if(!el)return;
  const all=transactions.slice(0,15);
  if(!all.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📜</div><div style="font-weight:700">Ingen transaksjoner ennå</div></div>';return;}
  el.innerHTML=all.map(t=>`<div class="tx-item"><div class="tx-icon ${t.type}">${t.icon}</div><div class="tx-desc"><div class="tx-name">${t.desc}</div><div class="tx-date">${fmtDate(t.ts||0)}</div></div><div class="tx-amount ${t.type}">${t.amount>0?'+':''}${t.amount} 🪙</div></div>`).join('');
  // spare history
  const spEl=document.getElementById('spare-tx-list');if(!spEl)return;
  const spareTx=transactions.filter(t=>t.desc?.toLowerCase().includes('spare'));
  spEl.innerHTML=spareTx.length?spareTx.slice(0,8).map(t=>`<div class="tx-item"><div class="tx-icon ${t.type}">${t.icon}</div><div class="tx-desc"><div class="tx-name">${t.desc}</div><div class="tx-date">${fmtDate(t.ts||0)}</div></div><div class="tx-amount ${t.type}">${t.amount>0?'+':''}${t.amount} 🪙</div></div>`).join(''):'<div class="empty-state"><div class="empty-icon">💰</div><div style="font-weight:700">Ingen sparehistorikk</div></div>';
}

// ── BUDSJETT ───────────────────────────────────────────────────────────────
window._budgetSettings = window._budgetSettings || {rentDesk:300,powerMin:50,powerMax:150,rentIpad:50,wedEventsEnabled:true};
window._budgetTxCache = [];
window._budgetPeriod = 1; // uker

async function loadBudgetTx() {
  const s = window._currentStudent;
  if (!s || !window._get) return;
  try {
    const snap = await window._get(fbRef('transactions57/' + s.fbKey));
    const all = snap.val() ? Object.values(snap.val()) : [];
    // 4 uker = 28 dager
    const cutoff = Date.now() - 28*24*60*60*1000;
    window._budgetTxCache = all.filter(t => (t.ts||0) >= cutoff).sort((a,b)=>(b.ts||0)-(a.ts||0));
  } catch(e) { window._budgetTxCache = []; }
}

function nextFridayLabel() {
  const now = new Date();
  const day = now.getDay(); // 0=søn, 5=fre
  let daysUntil = (5 - day + 7) % 7;
  // Hvis det er fredag og før kl. 08, så er "neste" i dag
  if (day === 5 && now.getHours() < 8) daysUntil = 0;
  // Hvis det er fredag og etter kl. 08, så er "neste" om en uke
  if (day === 5 && now.getHours() >= 8) daysUntil = 7;
  if (daysUntil === 0) return 'i dag';
  if (daysUntil === 1) return 'i morgen';
  return `om ${daysUntil} dager`;
}

async function renderBudgetTab() {
  const s = window._currentStudent;
  if (!s) return;
  const bs = getEffectiveBudgetSettingsElev() || {};
  const tax = (window._settings?.taxRate || 20) / 100;

  // ── Faste utgifter ──────────────────────────────────────────────────
  const rentDesk = +bs.rentDesk || 0;
  const rentIpad = +bs.rentIpad || 0;
  const pMin     = +bs.powerMin || 0;
  const pMax     = Math.max(pMin, +bs.powerMax || 0);
  const powerAvg = Math.round((pMin + pMax) / 2);

  const expensesEl = document.getElementById('bud-expenses-list');
  const expRows = [];
  if (rentDesk > 0) expRows.push({icon:'🪑', label:'Leie av pult', sub:'Trekkes hver fredag', amt:rentDesk});
  if (pMax > 0)    expRows.push({icon:'⚡', label:'Strøm',        sub:`Trekkes hver fredag`, amt:powerAvg, isAvg:false});
  if (rentIpad > 0) expRows.push({icon:'📱', label:'Leie av iPad', sub:'Trekkes hver fredag', amt:rentIpad});

  if (expensesEl) {
    if (!expRows.length) {
      expensesEl.innerHTML = '<div style="color:var(--muted);font-size:.85rem;font-weight:700;padding:.5rem;">Ingen faste utgifter akkurat nå.</div>';
    } else {
      expensesEl.innerHTML = expRows.map(r => `
        <div class="bud-row">
          <div class="bud-row-icon">${r.icon}</div>
          <div class="bud-row-label">${r.label}<div class="bud-row-sub">${r.sub}</div></div>
          <div class="bud-row-amt expense">${r.isAvg?'~':'-'}${r.amt} 🪙</div>
        </div>`).join('');
    }
  }
  const totalExpense = rentDesk + rentIpad + powerAvg;

  const nfEl = document.getElementById('bud-next-friday');
  if (nfEl) nfEl.textContent = `Neste trekk: ${nextFridayLabel()}`;

  // ── Inntekter (faste jobber + estimat) ──────────────────────────────
  const me = window._currentStudent;
  const myJobs = (getJobs() || []).filter(j => j.type === 'salary' && j.assigned && j.assigned[me.fbKey]);
  const salaryEl = document.getElementById('bud-salary-list');
  let totalSalaryNet = 0;
  if (salaryEl) {
    if (!myJobs.length) {
      salaryEl.innerHTML = '<div style="color:var(--muted);font-size:.85rem;font-weight:700;padding:.5rem;">Du har ingen faste jobber ennå. Søk på en jobb i Jobber-fanen!</div>';
    } else {
      salaryEl.innerHTML = myJobs.map(j => {
        const net = Math.floor((j.pay||0) * (1 - tax));
        totalSalaryNet += net;
        return `<div class="bud-row">
          <div class="bud-row-icon">${j.emoji||'💼'}</div>
          <div class="bud-row-label">${j.title}<div class="bud-row-sub">Ukelønn 🪙 ${j.pay} · netto etter skatt</div></div>
          <div class="bud-row-amt income">+${net} 🪙</div>
        </div>`;
      }).join('');
    }
  }

  // Estimert ekstra inntekt (lagret pr. elev)
  const estIn = +(me.estimatedIncome || 0);
  const estInputEl = document.getElementById('bud-est-input');
  if (estInputEl && document.activeElement !== estInputEl) {
    estInputEl.value = estIn > 0 ? estIn : '';
  }

  // ── Estimat for uka ────────────────────────────────────────────────
  const totalIn = totalSalaryNet + estIn;
  const totalOut = totalExpense;
  const net = totalIn - totalOut;
  const setT = (id,t,c)=>{const el=document.getElementById(id);if(el){el.textContent=t;if(c)el.style.color=c;}};
  setT('bud-est-in',  '+'+totalIn+' 🪙', '#15803d');
  setT('bud-est-out', '-'+totalOut+' 🪙', '#dc2626');
  setT('bud-est-net', (net>=0?'+':'')+net+' 🪙', net>=0?'#15803d':'#dc2626');

  // ── Periode-oversikt fra historikk ─────────────────────────────────
  await loadBudgetTx();
  renderBudgetPeriod();
}

function switchBudgetPeriod(weeks) {
  window._budgetPeriod = weeks;
  document.getElementById('bud-period-1').classList.toggle('bud-period-active', weeks===1);
  document.getElementById('bud-period-4').classList.toggle('bud-period-active', weeks===4);
  renderBudgetPeriod();
}

function renderBudgetPeriod() {
  const weeks = window._budgetPeriod || 1;
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const tx = (window._budgetTxCache || []).filter(t => (t.ts||0) >= cutoff);

  let totalIn = 0, totalOut = 0;
  tx.forEach(t => {
    const amt = +t.amount || 0;
    if (amt > 0) totalIn += amt;
    else totalOut += -amt;
  });

  const setT = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (color) el.style.color = color;
  };
  setT('bud-period-in',  '+'+totalIn+' 🪙', '#15803d');
  setT('bud-period-out', '-'+totalOut+' 🪙', '#dc2626');
  const netP = totalIn - totalOut;
  setT('bud-period-net', (netP>=0?'+':'')+netP+' 🪙', netP>=0?'#15803d':'#dc2626');

  const listEl = document.getElementById('bud-period-list');
  if (!listEl) return;
  if (!tx.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><div style="font-weight:700">Ingen bevegelser i denne perioden</div></div>';
    return;
  }
  // Vis maks 30
  listEl.innerHTML = tx.slice(0, 30).map(t => {
    const isInc = (+t.amount||0) > 0;
    return `<div class="tx-item">
      <div class="tx-icon ${isInc?'income':'expense'}">${t.icon||'•'}</div>
      <div class="tx-desc">
        <div class="tx-name">${t.desc||''}</div>
        <div class="tx-date">${fmtDate(t.ts||0)}</div>
      </div>
      <div class="tx-amount ${isInc?'income':'expense'}">${isInc?'+':''}${t.amount} 🪙</div>
    </div>`;
  }).join('');
}

async function saveEstimatedIncome() {
  const s = window._currentStudent;
  const fbEl = document.getElementById('bud-est-feedback');
  const btn  = document.getElementById('bud-est-save-btn');
  const inp  = document.getElementById('bud-est-input');
  const showMsg = (txt, color) => { if (fbEl) { fbEl.textContent = txt; fbEl.style.color = color; } };

  if (!s) { showMsg('⚠️ Ikke innlogget', '#dc2626'); return; }
  if (!window._update) { showMsg('⚠️ Forbindelse ikke klar – prøv igjen', '#dc2626'); return; }

  const raw = inp?.value;
  // Tom = 0 (lov å nullstille)
  const v = raw === '' || raw == null ? 0 : parseInt(raw);
  if (isNaN(v) || v < 0 || v > 9999) {
    showMsg('⚠️ Beløp må være mellom 0 og 9999', '#dc2626');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Lagrer…'; }
  showMsg('⏳ Lagrer…', 'var(--muted)');

  try {
    await window._update(fbRef('students57/' + s.fbKey), { estimatedIncome: v });
    patchStudent(s.fbKey, { estimatedIncome: v });
    showMsg('✅ Lagret!', '#15803d');
    // Oppdater estimat-tallene umiddelbart
    renderBudgetTab();
    setTimeout(() => { if (fbEl) fbEl.textContent = ''; }, 2200);
  } catch(e) {
    showMsg('⚠️ Kunne ikke lagre: ' + (e.message || e), '#dc2626');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Lagre'; }
  }
}

// ── TRANSFERS ──────────────────────────────────────────────────────────────
// ── TRANSFERS – alltid les window._currentStudent live inne i callback ──────
function getTitle(type) {
  const s = window._currentStudent;
  const titles = {
    'bruk-til-spare':    `Sett inn på sparekonto`,
    'spare-til-bruk':    `Ta ut fra sparekonto`,
    'bruk-til-fond-low': `Sett inn – Fond lav risiko`,
    'fond-low-til-bruk': `Ta ut – Fond lav risiko`,
    'bruk-til-fond-high':`Sett inn – Fond høy risiko`,
    'fond-high-til-bruk':`Ta ut – Fond høy risiko`,
  };
  const descs = {
    'bruk-til-spare':    ()=>`Brukskonto: 🪙 ${window._currentStudent?.balance||0}`,
    'spare-til-bruk':    ()=>`Sparekonto: 🪙 ${window._currentStudent?.savings||0} · ${getMaxW()-(window._currentStudent?.withdrawalsThisWeek||0)} uttak igjen`,
    'bruk-til-fond-low': ()=>{ const s=window._currentStudent; const d=Object.keys(window._fundHistory||{}).sort(); const r=d.length?(window._fundHistory[d[d.length-1]]?.low||100):100; return `Investér i fond lav risiko · Kurs: 🪙 ${r.toFixed(2)} · Du har: 🪙 ${s?.balance||0}`; },
    'fond-low-til-bruk': ()=>{ const s=window._currentStudent; const d=Object.keys(window._fundHistory||{}).sort(); const r=d.length?(window._fundHistory[d[d.length-1]]?.low||100):100; const v=getFondValue(s?.fund_low_units||0,r); return `Fond lav: 🪙 ${v} · ${(s?.fund_low_units||0).toFixed(2)} andeler · ${Math.round(getFundTax()*100)}% skatt på gevinst`; },
    'bruk-til-fond-high':()=>{ const s=window._currentStudent; const d=Object.keys(window._fundHistory||{}).sort(); const r=d.length?(window._fundHistory[d[d.length-1]]?.high||100):100; return `Investér i fond høy risiko · Kurs: 🪙 ${r.toFixed(2)} · Du har: 🪙 ${s?.balance||0}`; },
    'fond-high-til-bruk':()=>{ const s=window._currentStudent; const d=Object.keys(window._fundHistory||{}).sort(); const r=d.length?(window._fundHistory[d[d.length-1]]?.high||100):100; const v=getFondValue(s?.fund_high_units||0,r); return `Fond høy: 🪙 ${v} · ${(s?.fund_high_units||0).toFixed(2)} andeler · ${Math.round(getFundTax()*100)}% skatt på gevinst`; },
  };
  return { title: titles[type]||'', desc: (descs[type]||(() => ''))() };
}


// ── PATCH STUDENT – updates both window._currentStudent AND the _allStudents entry ──
function patchStudent(fbKey, fields) {
  // Patch in _allStudents so onValue merge sees correct data
  const idx = window._allStudents.findIndex(s => s.fbKey === fbKey);
  if (idx !== -1) Object.assign(window._allStudents[idx], fields);
  // Patch currentStudent if it's the same person
  if (window._currentStudent?.fbKey === fbKey) Object.assign(window._currentStudent, fields);
}

async function doTransfer(type, amt) {
  // ALWAYS read fresh from window._currentStudent at execution time
  const s = window._currentStudent;
  if (!s) return;
  const fbKey = s.fbKey;

  // Sperre: flytting AV brukskonto når brukskonto er negativ (gjeld må gjøres opp først)
  const movingOutOfBalance = (type === 'bruk-til-spare' || type === 'bruk-til-fond-low' || type === 'bruk-til-fond-high');
  if (movingOutOfBalance && (s.balance||0) < 0) {
    alert('🚫 Brukskontoen din er negativ (du har gjeld). Du kan ikke flytte penger ut før gjelden er gjort opp.');
    return;
  }

  if (type === 'bruk-til-spare') {
    if (amt > (s.balance||0)) { alert('Ikke nok på brukskonto.'); return; }
    // Nytt innskudd legges i pending (får dagsrente til neste mandag)
    const curLocked = getLocked57(s);
    const curPending = normPending57(s.savingsPending);
    const newPending = [...curPending, { amount: amt, ts: Date.now() }];
    const upd = {
      balance: (s.balance||0)-amt,
      savings: (s.savings||0)+amt,
      savingsLocked: curLocked,
      savingsPending: newPending
    };
    await window._update(fbRef('students57/'+fbKey), upd);
    patchStudent(fbKey, upd);
    await saveTx(fbKey,'expense','💰','Overført til sparekonto',-amt);
    transactions.unshift({type:'income',icon:'💰',desc:'Inn på sparekonto',amount:amt,ts:Date.now()});
    refreshAllDisplays(); renderTransactions();
    showSuccess('💰','Overført!',`+${amt} 🪙 sparekonto`,`Brukskonto: ${window._currentStudent.balance}🪙`);

  } else if (type === 'spare-til-bruk') {
    if (amt > (s.savings||0)) { alert('Ikke nok på sparekonto.'); return; }
    const usedW = s.withdrawalsThisWeek||0;
    if (usedW >= getMaxW()) { alert(`Maks ${getMaxW()} uttak per uke. Prøv igjen neste uke.`); return; }
    // Uttak: LIFO fra pending først (nyeste innskudd har minst rente å miste),
    // så fra låst saldo hvis nødvendig.
    let remaining = amt;
    let curPending = normPending57(s.savingsPending);
    curPending.sort((a,b) => (b.ts||0) - (a.ts||0));
    while (remaining > 0 && curPending.length) {
      const top = curPending[0];
      if ((top.amount||0) <= remaining) {
        remaining -= (top.amount||0);
        curPending.shift();
      } else {
        top.amount -= remaining;
        remaining = 0;
      }
    }
    let curLocked = getLocked57(s);
    if (remaining > 0) {
      curLocked = Math.max(0, curLocked - remaining);
    }
    const upd = {
      balance: (s.balance||0)+amt,
      savings: (s.savings||0)-amt,
      savingsLocked: curLocked,
      savingsPending: curPending,
      withdrawalsThisWeek: usedW+1
    };
    await window._update(fbRef('students57/'+fbKey), upd);
    patchStudent(fbKey, upd);
    await saveTx(fbKey,'income','💰','Uttak fra sparekonto',amt);
    transactions.unshift({type:'income',icon:'💰',desc:'Uttak fra sparekonto',amount:amt,ts:Date.now()});
    refreshAllDisplays(); renderTransactions();
    showSuccess('💰','Tatt ut!',`+${amt} 🪙 brukskonto`,`Sparekonto: ${window._currentStudent.savings}🪙`);

  } else if (type === 'bruk-til-fond-low') {
    if (amt > (s.balance||0)) { alert('Ikke nok på brukskonto.'); return; }
    const days_ld = Object.keys(window._fundHistory||{}).sort();
    const curRate_ld = days_ld.length ? (window._fundHistory[days_ld[days_ld.length-1]]?.low||100) : 100;
    // Kjøp andeler: andeler = beløp / kurs
    const newUnits = getUnitsFromAmt(amt, curRate_ld);
    const upd = {
      balance: (s.balance||0) - amt,
      fund_low_units:    Math.round(((s.fund_low_units||0) + newUnits) * 100) / 100,
      fund_low_invested: (s.fund_low_invested||0) + amt
    };
    await window._update(fbRef('students57/'+fbKey), upd);
    patchStudent(fbKey, upd);
    await saveTx(fbKey,'expense','📊',`Kjøpte ${newUnits.toFixed(2)} andeler lav risiko @ 🪙${curRate_ld.toFixed(2)}`,-amt);
    transactions.unshift({type:'expense',icon:'📊',desc:`Kjøpte ${newUnits.toFixed(2)} andeler lav fond`,amount:-amt,ts:Date.now()});
    refreshAllDisplays(); renderTransactions(); renderFond();
    showSuccess('📊','Investert!',`${newUnits.toFixed(2)} andeler`,`Kurs: 🪙 ${curRate_ld.toFixed(2)} · Kostnad: 🪙 ${amt}`);

  } else if (type === 'fond-low-til-bruk') {
    const days_lw = Object.keys(window._fundHistory||{}).sort();
    const curRate_lw = days_lw.length ? (window._fundHistory[days_lw[days_lw.length-1]]?.low||100) : 100;
    const totalUnits_lw = s.fund_low_units || 0;
    const totalValue_lw = getFondValue(totalUnits_lw, curRate_lw);
    if (totalUnits_lw <= 0) { alert('Du har ingen andeler i fond lav risiko.'); return; }
    if (amt > totalValue_lw) { alert(`Markedsverdi er 🪙 ${totalValue_lw}. Kan ikke ta ut mer.`); return; }
    // Selg proporsjonalt med andeler
    const ratio_lw     = amt / totalValue_lw;
    const unitsSold_lw = Math.round(totalUnits_lw * ratio_lw * 100) / 100;
    const invested_lw  = s.fund_low_invested || 0;
    const costBasis_lw = Math.round(invested_lw * ratio_lw); // andel av opprinnelig kostnad
    const gain_lw      = Math.max(0, amt - costBasis_lw);
    const taxAmt_lw    = Math.round(gain_lw * getFundTax());
    const net_lw       = amt - taxAmt_lw;
    const upd = {
      balance:                (s.balance||0) + net_lw,
      fund_low_units:         Math.max(0, Math.round((totalUnits_lw - unitsSold_lw) * 100) / 100),
      fund_low_invested:      Math.max(0, invested_lw - costBasis_lw),
      badgeTaxContributed:    (s.badgeTaxContributed||0) + taxAmt_lw
    };
    await window._update(fbRef('students57/'+fbKey), upd);
    patchStudent(fbKey, upd);
    await saveTx(fbKey,'income','📊',`Solgte ${unitsSold_lw.toFixed(2)} andeler lav fond (${taxAmt_lw}🪙 skatt)`,net_lw);
    transactions.unshift({type:'income',icon:'📊',desc:`Solgte ${unitsSold_lw.toFixed(2)} andeler lav fond`,amount:net_lw,ts:Date.now()});
    // Track realized gain for Sparemester badge
    if (gain_lw > 0) {
      const newSpare = (window._currentStudent?.badgeSavingsEarned||0) + gain_lw;
      await window._update(fbRef('students57/'+fbKey), {badgeSavingsEarned: newSpare});
      patchStudent(fbKey, {badgeSavingsEarned: newSpare});
    }
    refreshAllDisplays(); renderTransactions(); renderFond();
    showSuccess('📊','Solgt!',`+${net_lw} 🪙`,`Solgte ${unitsSold_lw.toFixed(2)} andeler · Fondskatt: ${taxAmt_lw}🪙`);
    await checkAndAwardBadges(window._currentStudent);

  } else if (type === 'bruk-til-fond-high') {
    if (amt > (s.balance||0)) { alert('Ikke nok på brukskonto.'); return; }
    const days_hd = Object.keys(window._fundHistory||{}).sort();
    const curRate_hd = days_hd.length ? (window._fundHistory[days_hd[days_hd.length-1]]?.high||100) : 100;
    const newUnitsH = getUnitsFromAmt(amt, curRate_hd);
    const upd = {
      balance: (s.balance||0) - amt,
      fund_high_units:    Math.round(((s.fund_high_units||0) + newUnitsH) * 100) / 100,
      fund_high_invested: (s.fund_high_invested||0) + amt
    };
    await window._update(fbRef('students57/'+fbKey), upd);
    patchStudent(fbKey, upd);
    await saveTx(fbKey,'expense','📊',`Kjøpte ${newUnitsH.toFixed(2)} andeler høy risiko @ 🪙${curRate_hd.toFixed(2)}`,-amt);
    transactions.unshift({type:'expense',icon:'📊',desc:`Kjøpte ${newUnitsH.toFixed(2)} andeler høy fond`,amount:-amt,ts:Date.now()});
    refreshAllDisplays(); renderTransactions(); renderFond();
    showSuccess('📊','Investert!',`${newUnitsH.toFixed(2)} andeler`,`Kurs: 🪙 ${curRate_hd.toFixed(2)} · Kostnad: 🪙 ${amt}`);

  } else if (type === 'fond-high-til-bruk') {
    const days_hw = Object.keys(window._fundHistory||{}).sort();
    const curRate_hw = days_hw.length ? (window._fundHistory[days_hw[days_hw.length-1]]?.high||100) : 100;
    const totalUnits_hw = s.fund_high_units || 0;
    const totalValue_hw = getFondValue(totalUnits_hw, curRate_hw);
    if (totalUnits_hw <= 0) { alert('Du har ingen andeler i fond høy risiko.'); return; }
    if (amt > totalValue_hw) { alert(`Markedsverdi er 🪙 ${totalValue_hw}. Kan ikke ta ut mer.`); return; }
    const ratio_hw      = amt / totalValue_hw;
    const unitsSold_hw  = Math.round(totalUnits_hw * ratio_hw * 100) / 100;
    const invested_hw   = s.fund_high_invested || 0;
    const costBasis_hw  = Math.round(invested_hw * ratio_hw);
    const gain_hw       = Math.max(0, amt - costBasis_hw);
    const taxAmt_hw     = Math.round(gain_hw * getFundTax());
    const net_hw        = amt - taxAmt_hw;
    const upd = {
      balance:                (s.balance||0) + net_hw,
      fund_high_units:        Math.max(0, Math.round((totalUnits_hw - unitsSold_hw) * 100) / 100),
      fund_high_invested:     Math.max(0, invested_hw - costBasis_hw),
      badgeTaxContributed:    (s.badgeTaxContributed||0) + taxAmt_hw
    };
    await window._update(fbRef('students57/'+fbKey), upd);
    patchStudent(fbKey, upd);
    await saveTx(fbKey,'income','📊',`Solgte ${unitsSold_hw.toFixed(2)} andeler høy fond (${taxAmt_hw}🪙 skatt)`,net_hw);
    transactions.unshift({type:'income',icon:'📊',desc:`Solgte ${unitsSold_hw.toFixed(2)} andeler høy fond`,amount:net_hw,ts:Date.now()});
    // Track realized gain for Sparemester badge
    if (gain_hw > 0) {
      const newSpare = (window._currentStudent?.badgeSavingsEarned||0) + gain_hw;
      await window._update(fbRef('students57/'+fbKey), {badgeSavingsEarned: newSpare});
      patchStudent(fbKey, {badgeSavingsEarned: newSpare});
    }
    refreshAllDisplays(); renderTransactions(); renderFond();
    showSuccess('📊','Solgt!',`+${net_hw} 🪙`,`Solgte ${unitsSold_hw.toFixed(2)} andeler · Fondskatt: ${taxAmt_hw}🪙`);
    await checkAndAwardBadges(window._currentStudent);
  }
}

function openTransfer(type){
  if (!window._currentStudent) return;
  const {title, desc} = getTitle(type);
  showInputSheet(title, desc, (amt) => doTransfer(type, amt));
}
function renderSpareTab(){refreshAllDisplays();renderTransactions();}

// ── FOND ───────────────────────────────────────────────────────────────────
// Fondsandel-modell:
//   fund_low_units  = antall andeler i fond lav risiko
//   fund_high_units = antall andeler i fond høy risiko
//   Verdi = andeler × nåværende kurs
//   Kjøp:  andeler += investering / kurs  (avrundet til 4 desimaler)
//   Salg:  selg X andeler → mottar X × kurs (minus skatt på gevinst)
//
// Bakoverkompatibilitet: fund_low / fund_high (gamle felt) ignoreres.
// Nye felt: fund_low_units, fund_high_units

function getFondValue(units, currentRate) {
  return Math.round((units||0) * (currentRate||100));
}
function getUnitsFromAmt(amt, rate) {
  return Math.round(amt / (rate||100) * 100) / 100; // 2 desimaler
}
// Beholder getFondMarketValue som alias for bakoverkompatibilitet
function getFondMarketValue(invested, buyRate, currentRate) {
  return Math.round((invested||0) * (currentRate||100) / (buyRate||100));
}

function renderFond(){
  const s=window._currentStudent;if(!s)return;
  const hist=window._fundHistory||{};
  const days=Object.keys(hist).sort();
  const curRates = days.length ? hist[days[days.length-1]] : {low:100,high:100};

  const lowUnits  = s.fund_low_units  || 0;
  const highUnits = s.fund_high_units || 0;
  const curLow    = curRates.low  || 100;
  const curHigh   = curRates.high || 100;

  const lowValue  = getFondValue(lowUnits,  curLow);
  const highValue = getFondValue(highUnits, curHigh);

  // Gevinst: verdi minus totalt investert (fund_low_invested / fund_high_invested)
  const lowInvested  = s.fund_low_invested  || 0;
  const highInvested = s.fund_high_invested || 0;
  const lowGain  = lowValue  - lowInvested;
  const highGain = highValue - highInvested;
  const lowPct   = lowInvested  > 0 ? Math.round(lowGain  / lowInvested  * 100) : 0;
  const highPct  = highInvested > 0 ? Math.round(highGain / highInvested * 100) : 0;

  document.getElementById('fond-cards').innerHTML=`
    <div class="fond-card low">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">
        <div>
          <div class="fond-title">📉 Fond lav risiko</div>
          <div class="fond-risk">±${window._settings?.fundLowMax||5}% daglig variasjon</div>
        </div>
        <div style="text-align:right;position:relative;z-index:1;background:rgba(0,0,0,.2);border-radius:8px;padding:4px 10px">
          <div style="font-size:.68rem;color:rgba(255,255,255,.65);font-weight:700">KURS PER ANDEL</div>
          <div style="font-family:'Fredoka One',cursive;font-size:1.2rem;color:#FAC775">🪙 ${curLow.toFixed(2)}</div>
        </div>
      </div>
      <!-- Andeler – tydelig boks -->
      <div style="background:rgba(0,0,0,.25);border-radius:10px;padding:.6rem .85rem;margin-bottom:.5rem;position:relative;z-index:1">
        <div style="font-size:.68rem;color:rgba(255,255,255,.6);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Mine andeler</div>
        <div style="font-family:'Fredoka One',cursive;font-size:1.6rem;color:white;line-height:1">${lowUnits.toFixed(2)}</div>
        <div style="font-size:.72rem;color:rgba(255,255,255,.65);margin-top:2px">${lowUnits.toFixed(2)} andeler × 🪙${curLow.toFixed(2)} = <strong style="color:#FAC775">🪙 ${lowValue}</strong></div>
      </div>
      <div class="fond-value" style="font-size:1.8rem">🪙 ${lowValue}</div>
      <div style="font-size:.72rem;color:rgba(255,255,255,.5);position:relative;z-index:1;margin-top:2px">Investert: 🪙 ${lowInvested}</div>
      <div class="fond-change" style="color:${lowGain>=0?'#86efac':'#fca5a5'};margin-top:.4rem">
        ${lowGain>=0?'📈':'📉'} ${lowGain>=0?'+':''}${lowGain} 🪙 (${lowPct>=0?'+':''}${lowPct}%)
      </div>
    </div>
    <div class="fond-card high">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">
        <div>
          <div class="fond-title">📈 Fond høy risiko</div>
          <div class="fond-risk">±${window._settings?.fundHighMax||10}% daglig variasjon</div>
        </div>
        <div style="text-align:right;position:relative;z-index:1;background:rgba(0,0,0,.2);border-radius:8px;padding:4px 10px">
          <div style="font-size:.68rem;color:rgba(255,255,255,.65);font-weight:700">KURS PER ANDEL</div>
          <div style="font-family:'Fredoka One',cursive;font-size:1.2rem;color:#FAC775">🪙 ${curHigh.toFixed(2)}</div>
        </div>
      </div>
      <div style="background:rgba(0,0,0,.25);border-radius:10px;padding:.6rem .85rem;margin-bottom:.5rem;position:relative;z-index:1">
        <div style="font-size:.68rem;color:rgba(255,255,255,.6);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Mine andeler</div>
        <div style="font-family:'Fredoka One',cursive;font-size:1.6rem;color:white;line-height:1">${highUnits.toFixed(2)}</div>
        <div style="font-size:.72rem;color:rgba(255,255,255,.65);margin-top:2px">${highUnits.toFixed(2)} andeler × 🪙${curHigh.toFixed(2)} = <strong style="color:#FAC775">🪙 ${highValue}</strong></div>
      </div>
      <div class="fond-value" style="font-size:1.8rem">🪙 ${highValue}</div>
      <div style="font-size:.72rem;color:rgba(255,255,255,.5);position:relative;z-index:1;margin-top:2px">Investert: 🪙 ${highInvested}</div>
      <div class="fond-change" style="color:${highGain>=0?'#86efac':'#fca5a5'};margin-top:.4rem">
        ${highGain>=0?'📈':'📉'} ${highGain>=0?'+':''}${highGain} 🪙 (${highPct>=0?'+':''}${highPct}%)
      </div>
    </div>`;
  const totalFond = lowValue + highValue;
  const balFond = document.getElementById('bal-fond');
  if (balFond) balFond.textContent = totalFond;
  renderFondChart(hist,days);
}
function renderFondChart(hist,days){
  const recent=days.slice(-14);
  const labels=recent.map(d=>{ const p=d.split('-'); return p[2]+'.'+p[1]; });
  const lowData=recent.map(d=>hist[d]?.low||100);
  const highData=recent.map(d=>hist[d]?.high||100);
  if(_fondChart){_fondChart.destroy();_fondChart=null;}
  const ctx=document.getElementById('fond-chart');if(!ctx)return;
  _fondChart=new Chart(ctx,{type:'line',data:{labels,datasets:[
    {label:'Lav risiko',data:lowData,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,.1)',tension:.3,borderWidth:2,pointRadius:3},
    {label:'Høy risiko',data:highData,borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,.1)',tension:.3,borderWidth:2,pointRadius:3}
  ]},options:{responsive:true,plugins:{legend:{labels:{font:{family:'Nunito',size:11},boxWidth:12}}},scales:{y:{beginAtZero:false,ticks:{font:{family:'Nunito',size:10}}},x:{ticks:{font:{family:'Nunito',size:10}}}}}});
}

// ── LOAN ───────────────────────────────────────────────────────────────────
async function checkLoanExpiry() {
  const s = window._currentStudent; if (!s || !s.loan || !s.loanDate) return;
  const daysSince = (Date.now() - s.loanDate) / 86400000;
  if (daysSince < 14) return;

  // Misligholdsgebyr: 25% straff på toppen av lånebeløpet
  const penaltyRate = 0.25;
  const penalty = Math.ceil(s.loan * penaltyRate);
  const totalDue = s.loan + penalty;
  let owed = totalDue;

  // Hent gjeldende fondskurser
  const days_le = Object.keys(window._fundHistory||{}).sort();
  const lastDay_le = days_le.length ? window._fundHistory[days_le[days_le.length-1]] : null;
  const rateLow_le  = lastDay_le?.low  || 100;
  const rateHigh_le = lastDay_le?.high || 100;

  // Start-tilstand
  let bal       = s.balance || 0;
  let savings   = s.savings || 0;
  let unitsLow  = s.fund_low_units  || 0;
  let invLow    = s.fund_low_invested  || 0;
  let unitsHigh = s.fund_high_units || 0;
  let invHigh   = s.fund_high_invested || 0;

  // 1) Brukskonto
  if (owed > 0 && bal > 0) {
    const take = Math.min(bal, owed);
    bal  -= take;
    owed -= take;
  }

  // 2) Sparekonto
  if (owed > 0 && savings > 0) {
    const take = Math.min(savings, owed);
    savings -= take;
    owed    -= take;
  }

  // 3) Fond lavrisiko – selg proporsjonalt med fondskatt på gevinst
  if (owed > 0 && unitsLow > 0) {
    const totalValue = getFondValue(unitsLow, rateLow_le);
    if (totalValue > 0) {
      // Hvor mye markedsverdi må selges for å dekke "owed" netto etter skatt?
      // Forenkling: selg så mye at netto >= owed (eller alt). Gjør binærsøk-light:
      // Beregn først hva alt selges for netto.
      const allGain = Math.max(0, totalValue - invLow);
      const allTax  = Math.round(allGain * getFundTax());
      const allNet  = totalValue - allTax;
      if (allNet <= owed) {
        // Selg alt
        bal       += 0; // går rett mot owed
        owed      -= allNet;
        unitsLow   = 0;
        invLow     = 0;
      } else {
        // Selg en andel slik at netto ≈ owed
        // ratio er andelen av markedsverdi vi selger
        // Vi løser tilnærmet: sellGross - tax(sellGross - costBasis*ratio) = owed
        // For enkelhet: ratio ≈ owed / allNet (litt unøyaktig, men trygt avrundet opp)
        let ratio = Math.min(1, (owed / allNet) * 1.02); // litt buffer pga skatt
        if (ratio > 1) ratio = 1;
        const sellGross = Math.round(totalValue * ratio);
        const unitsSold = Math.round(unitsLow * ratio * 100) / 100;
        const costBasis = Math.round(invLow * ratio);
        const gain      = Math.max(0, sellGross - costBasis);
        const taxAmt    = Math.round(gain * getFundTax());
        const net       = sellGross - taxAmt;
        unitsLow = Math.max(0, Math.round((unitsLow - unitsSold) * 100) / 100);
        invLow   = Math.max(0, invLow - costBasis);
        if (net >= owed) {
          // overskudd legges på brukskonto
          bal += (net - owed);
          owed = 0;
        } else {
          owed -= net;
        }
      }
    }
  }

  // 4) Fond høyrisiko – samme logikk
  if (owed > 0 && unitsHigh > 0) {
    const totalValue = getFondValue(unitsHigh, rateHigh_le);
    if (totalValue > 0) {
      const allGain = Math.max(0, totalValue - invHigh);
      const allTax  = Math.round(allGain * getFundTax());
      const allNet  = totalValue - allTax;
      if (allNet <= owed) {
        owed     -= allNet;
        unitsHigh = 0;
        invHigh   = 0;
      } else {
        let ratio = Math.min(1, (owed / allNet) * 1.02);
        if (ratio > 1) ratio = 1;
        const sellGross = Math.round(totalValue * ratio);
        const unitsSold = Math.round(unitsHigh * ratio * 100) / 100;
        const costBasis = Math.round(invHigh * ratio);
        const gain      = Math.max(0, sellGross - costBasis);
        const taxAmt    = Math.round(gain * getFundTax());
        const net       = sellGross - taxAmt;
        unitsHigh = Math.max(0, Math.round((unitsHigh - unitsSold) * 100) / 100);
        invHigh   = Math.max(0, invHigh - costBasis);
        if (net >= owed) {
          bal += (net - owed);
          owed = 0;
        } else {
          owed -= net;
        }
      }
    }
  }

  // 5) Resten = negativ brukskonto (gjeld som må gjøres opp)
  if (owed > 0) {
    bal -= owed;  // bal blir negativ
    owed = 0;
  }

  const updates = {
    loan: 0,
    loanDate: null,
    balance: bal,
    savings: savings,
    fund_low_units:     unitsLow,
    fund_low_invested:  invLow,
    fund_high_units:    unitsHigh,
    fund_high_invested: invHigh
  };

  await window._update(fbRef('students57/'+s.fbKey), updates);
  patchStudent(s.fbKey, updates);

  await saveTx(s.fbKey, 'expense', '🚫',
    `Lån tvangsinndratt etter 14 dager (lån ${s.loan}🪙 + 25% gebyr ${penalty}🪙 = ${totalDue}🪙)`, -totalDue);
  transactions.unshift({
    type:'expense', icon:'🚫',
    desc:`Lån tvangsinndratt + 25% gebyr (${totalDue}🪙)`,
    amount:-totalDue, ts:Date.now()
  });
  refreshAllDisplays(); renderTransactions();

  const debtMsg = bal < 0
    ? `Brukskonto er nå ${bal}🪙 (gjeld). Du må gjøre opp før du kan ta opp nytt lån eller spare/investere.`
    : `Trukket fra alle kontoer. 25% gebyr ekstra: ${penalty}🪙.`;
  showSuccess('⚠️', 'Lån tvangsinndratt!', `-${totalDue} 🪙`, debtMsg);
}

function renderLoan(){
  const s=window._currentStudent;if(!s)return;
  const el=document.getElementById('loan-section');if(!el)return;
  const loan=s.loan||0;const rate=getLoanRate();const factor=getLoanFactor();
  if(loan>0){
    const interest=Math.ceil(loan*rate);const total=loan+interest;
    // Calculate days remaining
    const daysSince = s.loanDate ? (Date.now()-s.loanDate)/86400000 : 0;
    const daysLeft  = Math.max(0, Math.ceil(14 - daysSince));
    const urgent    = daysLeft <= 3;
    const deadlineColor = urgent ? 'var(--coral)' : '#854F0B';
    const deadlineIcon  = urgent ? '🔴' : '🟡';
    el.innerHTML=`
    <div class="loan-card loan-active">
      <div style="font-weight:800;margin-bottom:.4rem">📉 Aktivt lån</div>
      <div style="font-family:'Fredoka One',cursive;font-size:2rem;color:var(--coral)">🪙 ${loan}</div>
      <div style="font-size:.82rem;color:var(--coral);font-weight:700;margin-top:4px">
        Rente (${Math.round(rate*100)}%): 🪙 ${interest} · Total: 🪙 ${total}
      </div>
      <div style="margin-top:.5rem;font-size:.82rem;font-weight:700;color:${deadlineColor}">
        ${deadlineIcon} Frist: ${daysLeft} dag${daysLeft!==1?'er':''} igjen (14 dagers frist)
      </div>
    </div>
    ${urgent ? `<div class="warn-box">🔴 Mindre enn 3 dager igjen! Betal tilbake nå for å unngå automatisk inndragelse.</div>` : `<div class="info-box">⏳ Du har ${daysLeft} dager på å betale tilbake. Etter 14 dager inndras lånet automatisk.</div>`}
    <button class="big-btn bb-coral" onclick="repayLoan()">💳 Betal tilbake 🪙 ${total}</button>`;
  } else {
    // Beregn totale aktiva (brukskonto + sparekonto + markedsverdi av fond)
    const days_ml = Object.keys(window._fundHistory||{}).sort();
    const lastDay_ml = days_ml.length ? window._fundHistory[days_ml[days_ml.length-1]] : null;
    const rLow_ml  = lastDay_ml?.low  || 100;
    const rHigh_ml = lastDay_ml?.high || 100;
    const fondLowVal  = getFondValue(s.fund_low_units  || 0, rLow_ml);
    const fondHighVal = getFondValue(s.fund_high_units || 0, rHigh_ml);
    const totalAssets = (s.balance||0) + (s.savings||0) + fondLowVal + fondHighVal;
    const maxLoan = (s.balance||0) < 0 ? 0 : Math.max(50, Math.floor(totalAssets * factor));
    const debtBlock = (s.balance||0) < 0
      ? `<div class="warn-box">🔴 Du har gjeld på brukskontoen (${s.balance}🪙). Du kan ikke ta opp nytt lån før gjelden er gjort opp.</div>`
      : '';
    el.innerHTML=`<div class="loan-card loan-none"><div style="font-weight:800;margin-bottom:.3rem">✅ Ingen aktive lån</div><div style="font-size:.85rem;color:var(--teal-dark);font-weight:700">Brukskonto: 🪙 ${s.balance||0}</div></div>
    ${debtBlock}
    <div class="info-box">⚠️ Lån koster penger! ${Math.round(rate*100)}% rente betales ved tilbakebetaling. Maks lån: 🪙 ${maxLoan} (${factor}× totale verdier).</div>
    <div class="warn-box">🚨 Hvis du ikke betaler tilbake innen 14 dager, blir lånet tvangsinndratt med 25% gebyr. Banken trekker da fra brukskonto, sparekonto og fond i den rekkefølgen – også fond du har kjøpt for lånte penger.</div>
    <div class="card-block"><div style="font-weight:800;margin-bottom:.6rem">Lånevilkår</div>
    <div style="font-size:.85rem;color:var(--muted);line-height:1.8">• Maks: 🪙 ${maxLoan} (basert på alt du eier)<br>• Rente: ${Math.round(rate*100)}%<br>• Betales i ett beløp<br>• Bare ett lån av gangen<br>• ⏳ Tilbakebetaling innen 14 dager<br>• ⚠️ Mislighold: 25% gebyr + trekk fra alle kontoer</div></div>
    <button class="big-btn bb-blue" onclick="takeLoan(${maxLoan})" ${maxLoan<=0?'disabled style="opacity:.4"':''}>📋 Ta opp lån</button>`;
  }
}
function takeLoan(max){
  const sChk = window._currentStudent;
  if (sChk && (sChk.balance||0) < 0) {
    alert(`Du har gjeld på brukskontoen (${sChk.balance}🪙). Gjør opp gjelden før du kan ta opp nytt lån.`);
    return;
  }
  if (max <= 0) { alert('Du kan ikke ta opp lån akkurat nå.'); return; }
  showInputSheet('Ta opp lån',`Maks 🪙 ${max} · Rente: ${Math.round(getLoanRate()*100)}%`,async(amt)=>{
    if(amt>max){alert(`Maks lån er 🪙 ${max}.`);return;}
    const s=window._currentStudent;const newBal=(s.balance||0)+amt;
    const loanDate=Date.now();
    await window._update(fbRef('students57/'+s.fbKey),{balance:newBal,loan:amt,loanDate:loanDate});
    patchStudent(s.fbKey,{balance:newBal,loan:amt,loanDate:loanDate});
    await saveTx(s.fbKey,'income','📋','Lån opptatt',amt);
    transactions.unshift({type:'income',icon:'📋',desc:'Lån opptatt',amount:amt,ts:Date.now()});
    refreshAllDisplays();renderTransactions();renderLoan();showSuccess('💰','Lån innvilget!',`+${amt} 🪙`,'Husk å betale tilbake med renter!');
  });
}
async function repayLoan(){
  const s=window._currentStudent;if(!s)return;const loan=s.loan||0;if(!loan)return;
  const interest=Math.ceil(loan*getLoanRate());const total=loan+interest;
  if((s.balance||0)<total){alert(`Du trenger 🪙 ${total}. Du har 🪙 ${s.balance||0}.`);return;}
  if(!confirm(`Betal tilbake 🪙 ${total} (lån + ${Math.round(getLoanRate()*100)}% rente)?`))return;
  const newBal=(s.balance||0)-total;
  await window._update(fbRef('students57/'+s.fbKey),{balance:newBal,loan:0,loanDate:null});
  patchStudent(s.fbKey,{balance:newBal,loan:0,loanDate:null});
  await saveTx(s.fbKey,'expense','📋',`Lån nedbetalt (rente: ${interest}🪙)`,-total);
  transactions.unshift({type:'expense',icon:'📋',desc:`Lån nedbetalt (rente: ${interest}🪙)`,amount:-total,ts:Date.now()});
  refreshAllDisplays();renderTransactions();renderLoan();showSuccess('✅','Nedbetalt!',`-${total} 🪙`,`Rente betalt: ${interest}🪙`);
}

// ── JOBS ───────────────────────────────────────────────────────────────────
window._jobsSearchQuery = '';
const REJECTION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function filterJobs(q) {
  window._jobsSearchQuery = (q || '').toLowerCase().trim();
  renderJobs();
}

function jobMatchesSearch(j) {
  const q = window._jobsSearchQuery || '';
  if (!q) return true;
  const hay = ((j.title || '') + ' ' + (j.desc || '') + ' ' + (j.emoji || '')).toLowerCase();
  return hay.includes(q);
}

async function applyForJob(jobKey) {
  const s = window._currentStudent;
  if (!s || !jobKey) return;
  const j = (getJobs()||[]).find(x => x.fbKey === jobKey);
  if (!j) return;
  // Sikkerhetssjekker (UI burde allerede ha hindret dette, men dobbeltsjekk)
  if (j.applicationsOpen === false) {
    showSuccess('🔒','Søknader stengt','','Læreren har stengt søknader på denne jobben.');
    return;
  }
  const rejTs = j.rejected?.[s.fbKey];
  if (rejTs && (Date.now() - rejTs) < REJECTION_COOLDOWN_MS) {
    const daysLeft = Math.max(1, Math.ceil((REJECTION_COOLDOWN_MS - (Date.now() - rejTs)) / (24*60*60*1000)));
    showSuccess('⏳','Karantene aktiv','',`Du kan søke igjen om ${daysLeft} dag${daysLeft===1?'':'er'}.`);
    return;
  }
  try {
    await window._update(window._ref(window._db, 'jobs/' + jobKey + '/applicants'), { [s.fbKey]: true });
    showSuccess('📨','Søknad sendt!','','Læreren må godkjenne søknaden din.');
  } catch(e) {
    showSuccess('⚠️','Noe gikk galt','','Prøv igjen senere.');
  }
}

async function withdrawApplication(jobKey) {
  const s = window._currentStudent;
  if (!s || !jobKey) return;
  if (!confirm('Trekke tilbake søknaden?')) return;
  try {
    await window._set(window._ref(window._db, 'jobs/' + jobKey + '/applicants/' + s.fbKey), null);
  } catch(e) {}
}

function renderJobs() {
  const taskEl = document.getElementById('jobs-list-el');
  const salaryEl = document.getElementById('salary-jobs-list-el');
  const all = getJobs() || [];
  const tax = getTax();
  const me = window._currentStudent;
  const now = Date.now();

  const taskJobs = all.filter(j => (j.type || 'task') !== 'salary' && jobMatchesSearch(j));
  const salaryJobs = all.filter(j => j.type === 'salary' && jobMatchesSearch(j));

  // Engangsoppdrag
  if (taskEl) {
    if (!taskJobs.length) {
      const noResults = window._jobsSearchQuery && all.some(j => (j.type||'task') !== 'salary');
      taskEl.innerHTML = noResults
        ? '<div class="empty-state"><div class="empty-icon">🔍</div><div style="font-weight:700">Ingen treff</div></div>'
        : '<div class="empty-state"><div class="empty-icon">💼</div><div style="font-weight:700">Ingen oppdrag nå</div></div>';
    } else {
      taskEl.innerHTML = taskJobs.map(j => {
        const net = Math.floor((j.pay||0) * (1 - tax));
        return `<div class="job-card-el">
          <div class="job-emoji-el">${j.emoji||'💼'}</div>
          <div style="flex:1;">
            <div class="job-title-el">${j.title}</div>
            <div class="job-desc-el">${j.desc||''}${j.deadline?` · Frist: ${j.deadline}`:''}</div>
            <div class="job-pay-el">Brutto 🪙 ${j.pay} · netto 🪙 ${net}</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Faste jobber
  if (salaryEl) {
    if (!salaryJobs.length) {
      const hasAny = all.some(j => j.type === 'salary');
      const noResults = window._jobsSearchQuery && hasAny;
      salaryEl.innerHTML = noResults
        ? '<div class="empty-state"><div class="empty-icon">🔍</div><div style="font-weight:700">Ingen treff</div></div>'
        : (hasAny ? '' : '<div class="empty-state"><div class="empty-icon">💰</div><div style="font-weight:700">Ingen faste jobber ennå</div></div>');
    } else {
      salaryEl.innerHTML = salaryJobs.map(j => {
        const net = Math.floor((j.pay||0) * (1 - tax));
        const assigned = j.assigned || {};
        const applicants = j.applicants || {};
        const rejected = j.rejected || {};
        const isAssigned = me && !!assigned[me.fbKey];
        const hasApplied = me && !!applicants[me.fbKey];
        const numEmployed = Object.keys(assigned).length;
        const appsOpen = (j.applicationsOpen !== false); // default åpne

        // Karantene-sjekk for denne eleven
        let cooldownDaysLeft = 0;
        const myRejTs = me ? rejected[me.fbKey] : null;
        if (myRejTs && (now - myRejTs) < REJECTION_COOLDOWN_MS) {
          cooldownDaysLeft = Math.max(1, Math.ceil((REJECTION_COOLDOWN_MS - (now - myRejTs)) / (24*60*60*1000)));
        }

        let actionHTML = '';
        if (isAssigned) {
          actionHTML = `<div style="background:var(--green-light);border:1.5px solid var(--green);color:#14532d;padding:8px 12px;border-radius:10px;font-weight:800;font-size:.85rem;text-align:center;margin-top:8px;">✅ Du er ansatt – lønn hver fredag</div>`;
        } else if (hasApplied) {
          actionHTML = `<div style="display:flex;gap:6px;margin-top:8px;">
            <div style="flex:1;background:var(--amber-light);border:1.5px solid #f0c060;color:#854F0B;padding:8px 12px;border-radius:10px;font-weight:800;font-size:.82rem;text-align:center;">⏳ Søknad sendt</div>
            <button onclick="withdrawApplication('${j.fbKey}')" style="background:white;border:1.5px solid var(--border);color:var(--muted);border-radius:10px;padding:8px 12px;font-weight:700;font-size:.78rem;cursor:pointer;">Trekk</button>
          </div>`;
        } else if (cooldownDaysLeft > 0) {
          actionHTML = `<div style="background:var(--coral-light);border:1.5px solid var(--coral);color:#7f1d1d;padding:8px 12px;border-radius:10px;font-weight:800;font-size:.82rem;text-align:center;margin-top:8px;">⏳ Avslått – kan søke igjen om ${cooldownDaysLeft} dag${cooldownDaysLeft===1?'':'er'}</div>`;
        } else if (!appsOpen) {
          actionHTML = `<button disabled style="width:100%;background:#cbd5cb;border:none;color:#6b7280;border-radius:10px;padding:10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:.9rem;cursor:not-allowed;margin-top:8px;">🔒 Søknader stengt</button>`;
        } else {
          actionHTML = `<button onclick="applyForJob('${j.fbKey}')" style="width:100%;background:var(--teal);border:none;color:white;border-radius:10px;padding:10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:.9rem;cursor:pointer;margin-top:8px;">📨 Søk på jobben</button>`;
        }

        const statusBadge = appsOpen
          ? '<span style="background:var(--green-light);color:#14532d;font-size:.6rem;padding:2px 6px;border-radius:8px;font-weight:800;vertical-align:middle;margin-left:4px;">SØKER VELKOMMEN</span>'
          : '<span style="background:var(--coral-light);color:#7f1d1d;font-size:.6rem;padding:2px 6px;border-radius:8px;font-weight:800;vertical-align:middle;margin-left:4px;">STENGT</span>';

        return `<div class="job-card-el" style="display:block;border-color:var(--teal);">
          <div style="display:flex;gap:10px;">
            <div class="job-emoji-el">${j.emoji||'💼'}</div>
            <div style="flex:1;">
              <div class="job-title-el">${j.title} <span style="background:var(--teal);color:white;font-size:.6rem;padding:2px 6px;border-radius:8px;font-weight:800;vertical-align:middle;">FAST</span>${isAssigned ? '' : statusBadge}</div>
              <div class="job-desc-el">${j.desc||''}</div>
              <div class="job-pay-el">Ukelønn 🪙 ${j.pay} · netto 🪙 ${net}</div>
              <div style="font-size:.7rem;color:var(--muted);font-weight:700;margin-top:2px;">👥 ${numEmployed} ansatt${numEmployed===1?'':'e'}</div>
            </div>
          </div>
          ${actionHTML}
        </div>`;
      }).join('');
    }
  }
}

// ── CAMERA / QR ────────────────────────────────────────────────────────────
function startScan(mode){
  scanMode=mode;
  const titleEl=document.getElementById('scanner-title');
  const hintEl=document.getElementById('scanner-hint');
  if(mode==='payment'){titleEl.textContent='💳 Scan betalings-QR';hintEl.textContent='Hold kassens QR innenfor rammen';}
  else if(mode==='reward'){titleEl.textContent='⭐ Scan belønnings-QR';hintEl.textContent='Hold belønnings-QR innenfor rammen';}
  else if(mode==='any'){titleEl.textContent='📷 Scan QR';hintEl.textContent='Hold QR-koden innenfor rammen';}
  else if(mode==='loginCard'){titleEl.textContent='💳 Scan bankkortet ditt';hintEl.textContent='Hold QR-koden på kortet innenfor rammen';}
  else if(mode==='loginShop'){titleEl.textContent='🛒 Scan bankkortet ditt';hintEl.textContent='Hold QR-koden på kortet innenfor rammen';}
  else if(mode==='wpapprove'){titleEl.textContent='📋 Scan godkjenning';hintEl.textContent='Hold lærerens godkjennings-QR innenfor rammen';}
  document.getElementById('scanner-overlay').classList.add('open');
  initCamera();
}
async function initCamera(){
  if(scanActive)return;scanActive=true;
  const video=document.getElementById('scanner-video');
  try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}}});video.srcObject=stream;video.setAttribute('playsinline',true);await video.play();setTimeout(()=>{if(scanActive)requestAnimationFrame(scanFrame);},300);}
  catch(e){document.getElementById('scanner-hint').textContent='⚠️ Kameratilgang nektet';scanActive=false;}
}
function scanFrame(){
  if(!scanActive)return;const video=document.getElementById('scanner-video');
  if(!video||video.readyState<2||video.videoWidth===0){requestAnimationFrame(scanFrame);return;}
  if(!_scanCanvas){_scanCanvas=document.createElement('canvas');_scanCtx=_scanCanvas.getContext('2d',{willReadFrequently:true});}
  _scanCanvas.width=video.videoWidth;_scanCanvas.height=video.videoHeight;_scanCtx.drawImage(video,0,0);
  if('BarcodeDetector'in window){if(!window._bd)window._bd=new BarcodeDetector({formats:['qr_code']});window._bd.detect(_scanCanvas).then(c=>{if(!scanActive)return;if(c.length>0)handleScan(c[0].rawValue);else requestAnimationFrame(scanFrame);}).catch(()=>tryJsQR());return;}
  tryJsQR();
}
function tryJsQR(){
  if(!scanActive)return;if(!window.jsQR){setTimeout(()=>{if(scanActive)requestAnimationFrame(scanFrame);},100);return;}
  try{const img=_scanCtx.getImageData(0,0,_scanCanvas.width,_scanCanvas.height);const c=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'});if(c)handleScan(c.data);else requestAnimationFrame(scanFrame);}catch(e){requestAnimationFrame(scanFrame);}
}
function handleScan(text){
  if(!scanActive)return;stopScan();
  try{
    // qrcodejs legger til et usynlig BOM-tegn (U+FEFF) foran teksten naar QR-koden
    // inneholder norske tegn (oe/ae/aa). Det maa fjernes, ellers feiler JSON.parse.
    const raw=JSON.parse(String(text).replace(/^\uFEFF/, ''));
    // Normaliser kompakt format ({t,s,a,d}) til langt format ({type,subtype,amount,desc})
    // slik at scanner-koden under fungerer for både gamle og nye QR-koder.
    const d = (raw && raw.t && !raw.type) ? {
      type:    raw.t,
      subtype: raw.s,
      amount:  raw.a,
      desc:    raw.d,
      // ta med øvrige felt uendret hvis de finnes i kompakt form
      fbKey:   raw.fbKey, name: raw.name, price: raw.price, emoji: raw.emoji,
      pay:     raw.pay,   title: raw.title
    } : raw;
    if(scanMode==='loginCard'&&d.type==='login'&&d.fbKey){handleLoginCardScan(d.fbKey,true);}
    else if(scanMode==='loginShop'&&d.type==='login'&&d.fbKey){handleShopLoginCardScan(d.fbKey);}
    else if(scanMode==='payment'&&d.type==='payment'&&d.amount>0){pendingPayAmount=d.amount;openPinConfirm(d.amount);}
    else if(scanMode==='reward'&&d.type==='reward'&&d.amount>0)doReward(d.amount,d.desc,d.rid);
    else if(scanMode==='reward'&&d.type==='job'&&d.pay>0)doJobReward(d.pay,d.title);
    else if((scanMode==='payment'||scanMode==='reward')&&d.type==='purchase'&&d.price>0)initPurchase(d.fbKey,d.name,d.price,d.emoji||'🛒');
    else if(scanMode==='reward'&&d.type==='event')doEventHendelse(d.subtype,d.amount,d.desc);
    else if(scanMode==='any'&&d.type==='payment'&&d.amount>0){pendingPayAmount=d.amount;openPinConfirm(d.amount);}
    else if(scanMode==='any'&&d.type==='reward'&&d.amount>0)doReward(d.amount,d.desc,d.rid);
    else if(scanMode==='any'&&d.type==='job'&&d.pay>0)doJobReward(d.pay,d.title);
    else if(scanMode==='any'&&d.type==='purchase'&&d.price>0)initPurchase(d.fbKey,d.name,d.price,d.emoji||'🛒');
    else if(scanMode==='any'&&d.type==='event')doEventHendelse(d.subtype,d.amount,d.desc);
    else if((scanMode==='wpapprove'||scanMode==='any')&&d.type==='wpApprove')doWpApproveScan();
    else showSuccess('❌','Ugyldig QR','','Prøv å scanne igjen');
  }catch(e){showSuccess('❌','Ugyldig QR','','Prøv å scanne igjen');}
}
function stopScan(){
  scanActive=false;_scanCanvas=null;_scanCtx=null;
  const v=document.getElementById('scanner-video');
  if(v?.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null;}
  document.getElementById('scanner-overlay').classList.remove('open');
}

// ── PIN CONFIRM ────────────────────────────────────────────────────────────
function openPinConfirm(amount){
  confirmPin='';document.getElementById('pin-overlay-amount').textContent=amount+' 🪙';
  document.getElementById('pin-overlay-error').textContent='';
  for(let i=0;i<4;i++)document.getElementById('pdot-'+i).classList.remove('filled');
  document.getElementById('pin-overlay').classList.add('open');
}
function cancelPinConfirm(){document.getElementById('pin-overlay').classList.remove('open');confirmPin='';}
function pcp(v){
  if(v==='DEL')confirmPin=confirmPin.slice(0,-1);else if(confirmPin.length<4)confirmPin+=v;
  for(let i=0;i<4;i++)document.getElementById('pdot-'+i).classList.toggle('filled',i<confirmPin.length);
  document.getElementById('pin-overlay-error').textContent='';
  if(confirmPin.length===4)setTimeout(checkPin,150);
}
function checkPin(){
  if(String(confirmPin)===String(window._currentStudent?.pin)){document.getElementById('pin-overlay').classList.remove('open');confirmPin='';doPayment(pendingPayAmount);}
  else{document.getElementById('pin-overlay-error').textContent='❌ Feil PIN';confirmPin='';for(let i=0;i<4;i++)document.getElementById('pdot-'+i).classList.remove('filled');}
}

// ── PAYMENTS & REWARDS ─────────────────────────────────────────────────────
async function doPayment(amount){
  const s=window._currentStudent;if(!s)return;
  if((s.balance||0)<amount){showSuccess('😕','Ikke nok mynter!','',`Saldo: ${s.balance||0}🪙`);return;}
  const newBal=(s.balance||0)-amount;
  await window._update(fbRef('students57/'+s.fbKey),{balance:newBal});
  patchStudent(s.fbKey,{balance:newBal});
  const tx={type:'expense',icon:'🛒',desc:'Betaling i kassen',amount:-amount,ts:Date.now()};
  await saveTx(s.fbKey,'expense','🛒','Betaling i kassen',-amount);
  transactions.unshift(tx);refreshAllDisplays();renderTransactions();
  showSuccess('✅','Betalt!',`-${amount} 🪙`,`Saldo: ${newBal}🪙`);
}
async function doReward(amount,desc,rid){
  const s=window._currentStudent;if(!s)return;
  if(rid){ if(s.rewardsClaimed && s.rewardsClaimed[rid]){ showSuccess('🔁','Allerede skannet','','Du har allerede fått denne belønningen'); return; } s.rewardsClaimed=s.rewardsClaimed||{}; s.rewardsClaimed[rid]=Date.now(); }
  const tax=getTax();const taxAmt=Math.floor(amount*tax);const net=amount-taxAmt;
  const newBal=(s.balance||0)+net;
  const newTaxTotal=(s.badgeTaxContributed||0)+taxAmt;
  await window._update(fbRef('students57/'+s.fbKey),{balance:newBal,badgeTaxContributed:newTaxTotal});
  patchStudent(s.fbKey,{balance:newBal,badgeTaxContributed:newTaxTotal});
  await distributeToGoals(taxAmt);
  const tx={type:'income',icon:'⭐',desc:desc||`Belønning skannet (${taxAmt}🪙 til sparemål)`,amount:net,ts:Date.now()};
  await saveTx(s.fbKey,'income','⭐',tx.desc,net);
  transactions.unshift(tx);refreshAllDisplays();renderTransactions();
  showSuccess('🎉','Belønning!',`+${net} 🪙`,`${taxAmt}🪙 til klassens sparemål`);
  await checkAndAwardBadges(window._currentStudent);
  if(rid){ try{ const u={}; u['rewardsClaimed/'+rid]=Date.now(); await window._update(fbRef('students57/'+s.fbKey), u); patchStudent(s.fbKey,{rewardsClaimed:s.rewardsClaimed}); }catch(e){} }
}
async function doJobReward(grossPay,title){
  const s=window._currentStudent;if(!s)return;
  const tax=getTax();const taxAmt=Math.floor(grossPay*tax);const net=grossPay-taxAmt;
  const newBal=(s.balance||0)+net;
  const newTaxTotal=(s.badgeTaxContributed||0)+taxAmt;
  await window._update(fbRef('students57/'+s.fbKey),{balance:newBal,badgeTaxContributed:newTaxTotal});
  patchStudent(s.fbKey,{balance:newBal,badgeTaxContributed:newTaxTotal});
  await distributeToGoals(taxAmt);
  const tx={type:'income',icon:'💼',desc:`Oppdrag: ${title||'Fullført'} (netto etter skatt)`,amount:net,ts:Date.now()};
  await saveTx(s.fbKey,'income','💼',tx.desc,net);
  transactions.unshift(tx);refreshAllDisplays();renderTransactions();
  showSuccess('💼','Oppdrag fullført!',`+${net} 🪙`,`${taxAmt}🪙 til klassens sparemål`);
  await checkAndAwardBadges(window._currentStudent);
}


// ── SHOP PIN LOGIN & CART ──────────────────────────────────────────────────
let _shopStudent = null;
let _shopPin = '';
let _shopCart = []; // [{fbKey, name, emoji, price}]
let _shopFilter = '';
let _cartPin = '';

// Shop-login krever kort-scan. PIN må matche nøyaktig eleven kortet tilhører.
window._shopPreselected = null;

function handleShopLoginCardScan(fbKey){
  const s=(window._allStudents||[]).find(x=>x.fbKey===fbKey);
  if(!s){showSuccess('❌','Ukjent kort','','Be læreren om et nytt kort');return;}
  window._shopPreselected=s;
  document.getElementById('shop-login-preselect-name').textContent=s.firstname+' '+s.lastname.charAt(0)+'.';
  document.getElementById('shop-login-preselect').style.display='block';
  document.getElementById('shop-login-scan-btn').style.display='none';
  document.getElementById('shop-login-card').style.display='block';
  document.getElementById('shop-login-subtitle').textContent='Bekreft med PIN-koden din';
  document.getElementById('shop-login-error').textContent='';
  _shopPin='';
  for(let i=0;i<4;i++){const d=document.getElementById('shop-dot-'+i);if(d)d.classList.remove('filled');}
}

function clearShopPreselected(){
  window._shopPreselected=null;
  document.getElementById('shop-login-preselect').style.display='none';
  document.getElementById('shop-login-scan-btn').style.display='block';
  document.getElementById('shop-login-card').style.display='none';
  document.getElementById('shop-login-subtitle').textContent='Scan bankkortet ditt for å handle';
  document.getElementById('shop-login-error').textContent='';
  _shopPin='';
  for(let i=0;i<4;i++){const d=document.getElementById('shop-dot-'+i);if(d)d.classList.remove('filled');}
}

function shopNp(v) {
  if (v === 'DEL') _shopPin = _shopPin.slice(0,-1);
  else if (_shopPin.length < 4) _shopPin += v;
  for (let i=0;i<4;i++) {
    const d = document.getElementById('shop-dot-'+i);
    if(d) d.classList.toggle('filled', i < _shopPin.length);
  }
  document.getElementById('shop-login-error').textContent = '';
  if (_shopPin.length === 4) setTimeout(tryShopLogin, 200);
}

function tryShopLogin() {
  if(!window._shopPreselected){
    document.getElementById('shop-login-error').textContent='❌ Scan kortet først';
    _shopPin='';
    for(let i=0;i<4;i++){const d=document.getElementById('shop-dot-'+i);if(d)d.classList.remove('filled');}
    return;
  }
  const pre=window._shopPreselected;
  const fresh=(window._allStudents||[]).find(x=>x.fbKey===pre.fbKey)||pre;
  let s=null;
  if(String(fresh.pin)===String(_shopPin)) s=fresh;
  if (s) {
    _shopStudent = s;
    window._shopPreselected = null;
    document.getElementById('shop-login-section').style.display = 'none';
    document.getElementById('shop-content-section').style.display = 'block';
    document.getElementById('shop-student-badge').style.display = 'block';
    document.getElementById('shop-student-badge').textContent = s.firstname + ' ' + s.class;
    updateShopBalance();
    renderShopLogged();
  } else {
    document.getElementById('shop-login-error').textContent = '❌ Feil PIN-kode!';
  }
  _shopPin = '';
  for (let i=0;i<4;i++) { const d=document.getElementById('shop-dot-'+i); if(d) d.classList.remove('filled'); }
}

function shopLogout() {
  _shopStudent = null; _shopCart = []; _shopPin = '';
  window._shopPreselected = null;
  document.getElementById('shop-login-section').style.display = 'flex';
  document.getElementById('shop-content-section').style.display = 'none';
  document.getElementById('shop-student-badge').style.display = 'none';
  document.getElementById('shop-login-preselect').style.display = 'none';
  document.getElementById('shop-login-scan-btn').style.display = 'block';
  document.getElementById('shop-login-card').style.display = 'none';
  document.getElementById('shop-login-subtitle').textContent = 'Scan bankkortet ditt for å handle';
  document.getElementById('shop-login-error').textContent = '';
  for (let i=0;i<4;i++) { const d=document.getElementById('shop-dot-'+i); if(d) d.classList.remove('filled'); }
}

function updateShopBalance() {
  if (!_shopStudent) return;
  // Refresh from allStudents
  const fresh = window._allStudents.find(s => s.fbKey === _shopStudent.fbKey);
  if (fresh) _shopStudent = fresh;
  const el = document.getElementById('shop-balance-display');
  if (el) el.textContent = `💰 Brukskonto: 🪙 ${_shopStudent.balance||0}`;
}

function filterShopLogged(v) { _shopFilter = v.toLowerCase(); renderShopLogged(); }

function renderShopLogged() {
  const el = document.getElementById('shop-logged-list'); if (!el) return;
  const items = (getShop()||[]).filter(x =>
    !_shopFilter || x.name.toLowerCase().includes(_shopFilter) || x.category?.toLowerCase().includes(_shopFilter)
  );
  if (!items.length) { el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)"><div style="font-size:2rem">🛒</div><div style="font-weight:700">Ingen varer ennå</div></div>'; return; }
  const cats = {};
  items.forEach(x => { if (!cats[x.category]) cats[x.category] = []; cats[x.category].push(x); });
  el.innerHTML = Object.entries(cats).map(([cat, vars]) => `
    <div style="margin-bottom:1rem">
      <div style="font-size:.75rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem">${cat}</div>
      ${vars.map(x => {
        const inCart = _shopCart.filter(c => c.fbKey === x.fbKey).length;
        return `<div style="display:flex;align-items:center;gap:10px;background:white;padding:12px;border-radius:12px;margin-bottom:7px;border:1px solid var(--border)">
          <span style="font-size:1.7rem;flex-shrink:0">${x.emoji}</span>
          <span style="font-weight:700;flex:1;font-size:.92rem">${x.name}</span>
          <span style="font-family:'Fredoka One',cursive;font-size:1rem;color:var(--teal-dark);background:var(--amber-light);padding:3px 10px;border-radius:20px;white-space:nowrap">🪙 ${x.price}</span>
          <button onclick="addToShopCart('${x.fbKey}','${x.name.replace(/'/g,"\'")}',${x.price},'${x.emoji}')"
            style="background:var(--teal);color:white;border:none;border-radius:9px;width:32px;height:32px;font-size:1.1rem;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">+</button>
          ${inCart > 0 ? `<span style="background:var(--coral);color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0">${inCart}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`).join('');
  updateCartBar();
}

function addToShopCart(fbKey, name, price, emoji) {
  _shopCart.push({ fbKey, name, price, emoji });
  renderShopLogged();
}

function updateCartBar() {
  const total = _shopCart.reduce((a,x) => a+x.price, 0);
  const bar = document.getElementById('shop-cart-bar');
  const td  = document.getElementById('cart-total-display');
  if (bar) bar.style.display = _shopCart.length ? 'flex' : 'none';
  if (td)  td.textContent = total + ' 🪙';
}

function openShopCart() {
  _cartPin = '';
  for (let i=0;i<4;i++) { const d=document.getElementById('cart-pdot-'+i); if(d) d.classList.remove('filled'); }
  document.getElementById('cart-pin-error').textContent = '';
  const total = _shopCart.reduce((a,x) => a+x.price, 0);
  document.getElementById('cart-total-big').textContent = total;
  // Render cart items
  const el = document.getElementById('cart-items-list');
  if (el) {
    // Group by item
    const grouped = {};
    _shopCart.forEach(x => { if (!grouped[x.fbKey]) grouped[x.fbKey] = {...x, qty:0}; grouped[x.fbKey].qty++; });
    el.innerHTML = Object.values(grouped).map(x => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:1.4rem">${x.emoji}</span>
        <span style="flex:1;font-weight:700;font-size:.9rem">${x.name}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <button onclick="removeFromCart('${x.fbKey}')" style="background:var(--coral-light);border:none;color:var(--coral);border-radius:6px;width:26px;height:26px;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center">-</button>
          <span style="font-weight:700;min-width:16px;text-align:center">${x.qty}</span>
          <button onclick="addToShopCart('${x.fbKey}','${x.name.replace(/'/g,"\'")}',${x.price},'${x.emoji}')" style="background:var(--teal-light);border:none;color:var(--teal-dark);border-radius:6px;width:26px;height:26px;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center">+</button>
        </div>
        <span style="font-family:'Fredoka One',cursive;color:var(--teal-dark);font-size:.9rem;min-width:48px;text-align:right">🪙 ${x.price*x.qty}</span>
      </div>`).join('');
  }
  document.getElementById('shop-cart-overlay').classList.add('open');
}

function removeFromCart(fbKey) {
  const idx = _shopCart.findIndex(x => x.fbKey === fbKey);
  if (idx !== -1) _shopCart.splice(idx,1);
  openShopCart(); // re-render
  updateCartBar();
}

function closeShopCart() {
  document.getElementById('shop-cart-overlay').classList.remove('open');
  _cartPin = '';
}

function cartPinPress(v) {
  if (v === 'DEL') _cartPin = _cartPin.slice(0,-1);
  else if (_cartPin.length < 4) _cartPin += v;
  for (let i=0;i<4;i++) {
    const d = document.getElementById('cart-pdot-'+i);
    if (d) d.classList.toggle('filled', i < _cartPin.length);
  }
  document.getElementById('cart-pin-error').textContent = '';
  if (_cartPin.length === 4) setTimeout(checkCartPin, 150);
}

async function checkCartPin() {
  if (!_shopStudent) return;
  if (String(_cartPin) !== String(_shopStudent.pin)) {
    document.getElementById('cart-pin-error').textContent = '❌ Feil PIN – prøv igjen';
    _cartPin = '';
    for (let i=0;i<4;i++) { const d=document.getElementById('cart-pdot-'+i); if(d) d.classList.remove('filled'); }
    return;
  }
  // Pay!
  const total = _shopCart.reduce((a,x) => a+x.price, 0);
  if ((_shopStudent.balance||0) < total) {
    document.getElementById('cart-pin-error').textContent = `❌ Ikke nok mynter (trenger 🪙 ${total})`;
    _cartPin = '';
    return;
  }
  closeShopCart();
  const newBal = (_shopStudent.balance||0) - total;
  await window._update(fbRef('students57/'+_shopStudent.fbKey), { balance: newBal });
  patchStudent(_shopStudent.fbKey, { balance: newBal });
  _shopStudent.balance = newBal;
  // Log transaction
  const itemNames = _shopCart.map(x=>x.emoji+x.name).join(', ');
  await window._set(window._push(fbRef('transactions57/'+_shopStudent.fbKey)), {
    type: 'expense', icon: '🛒', desc: `Kjøpt: ${itemNames}`, amount: -total, ts: Date.now()
  });
  _shopCart = [];
  updateShopBalance();
  renderShopLogged();
  // Show success
  const badge = document.getElementById('shop-student-badge');
  if (badge) badge.textContent = _shopStudent.firstname + ' · 🪙' + newBal;
  // Brief success flash
  const bar = document.getElementById('shop-cart-bar');
  if (bar) { bar.style.background='var(--teal)'; setTimeout(()=>{bar.style.background='var(--teal-dark)';}, 1500); }
  _cartPin = '';
}

// ── QUIZ MONDAY RESET ─────────────────────────────────────────────────────
function checkAndResetQuiz(s) {
  const d = new Date();
  if (d.getDay() !== 1) return; // only Monday

  // ── Nullstill quiz hvis gammel uke ───────────────────────────────────────
  const currentWeek = getWeekKey();
  if (s.quizWeek && s.quizWeek !== currentWeek) {
    window._currentStudent.quizWeek = null;
  }

  // ── Nullstill uttaksteller på mandag ─────────────────────────────────────
  const yr = d.getFullYear();
  const mo = String(d.getMonth()+1).padStart(2,'0');
  const dy = String(d.getDate()).padStart(2,'0');
  const today = yr + '-' + mo + '-' + dy;
  const resetKey = 'withdrawalReset_' + s.fbKey;
  const lastReset = localStorage.getItem(resetKey);

  if (lastReset !== today) {
    localStorage.setItem(resetKey, today);
    // Sparerente håndteres nå av checkAndPaySavingsInterest57 (kalles i selectStudent)
    // Her nullstiller vi kun uttakstelleren.
    patchStudent(s.fbKey, { withdrawalsThisWeek: 0 });
    window._update(fbRef('students57/'+s.fbKey), { withdrawalsThisWeek: 0 })
      .then(function() { refreshAllDisplays(); })
      .catch(function(err) { console.log('Uttaksteller-reset feilet:', err.message); });
  }
}

async function doEventHendelse(subtype, amount, desc) {
  const s = window._currentStudent; if (!s) return;
  if (subtype === 'income') {
    // Hendelser beskattes IKKE – hele beløpet går rett til eleven
    const newBal = (s.balance||0) + amount;
    await window._update(fbRef('students57/'+s.fbKey), {balance:newBal});
    patchStudent(s.fbKey, {balance:newBal});
    await saveTx(s.fbKey,'income','🎲', desc || 'Hendelse', amount);
    transactions.unshift({type:'income',icon:'🎲',desc:desc||'Hendelse',amount:amount,ts:Date.now()});
    refreshAllDisplays(); renderTransactions();
    showSuccess('🎲','Hendelse!','+'+amount+' 🪙','Saldo: '+newBal+'🪙');
  } else {
    if ((s.balance||0) < amount) {
      showSuccess('😕','Ikke nok mynter!','',`Saldo: ${s.balance||0}🪙 – trenger ${amount}🪙`);
      return;
    }
    const newBal = (s.balance||0) - amount;
    await window._update(fbRef('students57/'+s.fbKey), {balance:newBal});
    patchStudent(s.fbKey, {balance:newBal});
    await saveTx(s.fbKey,'expense','🎲', desc || 'Hendelse (utgift)', -amount);
    transactions.unshift({type:'expense',icon:'🎲',desc:desc||'Hendelse (utgift)',amount:-amount,ts:Date.now()});
    refreshAllDisplays(); renderTransactions();
    showSuccess('🎲','Hendelse!','-'+amount+' 🪙','Saldo: '+newBal+'🪙');
  }
}

// ── SHOP 5-7 ──────────────────────────────────────────────────────────────
window._shop57 = [];
let shop57ElFilter = '';

function filterShop57El(v){ shop57ElFilter=v.toLowerCase(); renderShop57(); }

let shop57PublicFilter = '';
function filterShop57Public(v){ shop57PublicFilter=v.toLowerCase(); renderShopPublic(); }

function showShopScreen(){
  showScreen('screen-shop');
  renderShopPublic();
}

function renderShopPublic(){
  const el = document.getElementById('shop-public-list'); if(!el) return;
  const items = (getShop()||[]).filter(x =>
    !shop57PublicFilter || x.name.toLowerCase().includes(shop57PublicFilter) || x.category?.toLowerCase().includes(shop57PublicFilter)
  );
  if(!items.length){
    el.innerHTML='<div style="text-align:center;padding:2rem;color:var(--muted)"><div style="font-size:2rem;margin-bottom:.5rem">🛒</div><div style="font-weight:700">'+(getShop().length?'Ingen treff':'Ingen varer ennå')+'</div></div>';
    return;
  }
  const cats = {};
  items.forEach(x=>{ if(!cats[x.category])cats[x.category]=[]; cats[x.category].push(x); });
  el.innerHTML = Object.entries(cats).map(([cat, vars])=>`
    <div style="margin-bottom:1.1rem">
      <div style="font-size:.75rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem">${cat}</div>
      ${vars.map(x=>`
        <div style="display:flex;align-items:center;gap:10px;background:white;padding:12px;border-radius:12px;margin-bottom:7px;border:1px solid var(--border)">
          <span style="font-size:1.7rem;flex-shrink:0">${x.emoji}</span>
          <span style="font-weight:700;flex:1;font-size:.92rem;color:var(--text)">${x.name}</span>
          <span style="font-family:'Fredoka One',cursive;font-size:1rem;color:var(--teal-dark);background:var(--amber-light);padding:3px 10px;border-radius:20px;white-space:nowrap">🪙 ${x.price}</span>
          ${window._currentStudent ? `<button onclick="initPurchase('${x.fbKey}','${x.name.replace(/'/g,"\'")}',${x.price},'${x.emoji}')" style="background:var(--teal);color:white;border:none;border-radius:10px;padding:8px 12px;font-family:'Nunito',sans-serif;font-weight:700;font-size:.82rem;cursor:pointer;flex-shrink:0">Kjøp</button>` : ''}
        </div>`).join('')}
    </div>`).join('');
}

function renderShop57(){
  const el = document.getElementById('shop57-el-list');
  if(!el) return;
  const items = (getShop()||[]).filter(x =>
    !shop57ElFilter || x.name.toLowerCase().includes(shop57ElFilter) || x.category?.toLowerCase().includes(shop57ElFilter)
  );
  if(!items.length){
    el.innerHTML='<div class="empty-state"><div class="empty-icon">🛒</div><div style="font-weight:700">Ingen varer ennå</div></div>';
    return;
  }
  // Group by category
  const cats = {};
  items.forEach(x=>{ if(!cats[x.category])cats[x.category]=[]; cats[x.category].push(x); });
  el.innerHTML = Object.entries(cats).map(([cat,vars])=>`
    <div style="margin-bottom:1rem">
      <div style="font-size:.75rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem">${cat}</div>
      ${vars.map(x=>`
        <div style="display:flex;align-items:center;gap:12px;background:white;padding:12px;border-radius:12px;margin-bottom:6px;border:1px solid var(--border)">
          <span style="font-size:1.8rem;flex-shrink:0">${x.emoji}</span>
          <span style="font-weight:700;flex:1;font-size:.92rem">${x.name}</span>
          <span style="font-family:'Fredoka One',cursive;font-size:1.05rem;color:var(--teal-dark);background:var(--amber-light);padding:3px 10px;border-radius:20px;font-weight:800">🪙 ${x.price}</span>
        </div>`).join('')}
    </div>`).join('');
}

// ── IN-APP PURCHASE ────────────────────────────────────────────────────────
let _pendingPurchase = null;
let _buyPin = '';

function initPurchase(fbKey, name, price, emoji) {
  const s = window._currentStudent; if (!s) return;
  if ((s.balance||0) < price) {
    showSuccess('😕', 'Ikke nok mynter!', `Saldo: ${s.balance||0} 🪙`, `Trenger ${price} 🪙`);
    return;
  }
  _pendingPurchase = { fbKey, name, price, emoji };
  _buyPin = '';
  document.getElementById('purchase-item-name').textContent = emoji + ' ' + name;
  document.getElementById('purchase-item-price').textContent = price + ' 🪙';
  document.getElementById('purchase-pin-error').textContent = '';
  for (let i=0;i<4;i++) document.getElementById('bpdot-'+i).classList.remove('filled');
  document.getElementById('purchase-pin-overlay').classList.add('open');
}

function bpp(v) {
  if (v === 'DEL') _buyPin = _buyPin.slice(0,-1);
  else if (_buyPin.length < 4) _buyPin += v;
  for (let i=0;i<4;i++) document.getElementById('bpdot-'+i).classList.toggle('filled', i<_buyPin.length);
  document.getElementById('purchase-pin-error').textContent = '';
  if (_buyPin.length === 4) setTimeout(confirmPurchase, 150);
}

function cancelPurchase() {
  _pendingPurchase = null; _buyPin = '';
  document.getElementById('purchase-pin-overlay').classList.remove('open');
}

async function confirmPurchase() {
  const s = window._currentStudent;
  if (String(_buyPin) !== String(s.pin)) {
    document.getElementById('purchase-pin-error').textContent = '❌ Feil PIN – prøv igjen';
    _buyPin = '';
    for (let i=0;i<4;i++) document.getElementById('bpdot-'+i).classList.remove('filled');
    return;
  }
  const p = _pendingPurchase; if (!p) return;
  document.getElementById('purchase-pin-overlay').classList.remove('open');
  const newBal = (s.balance||0) - p.price;
  await window._update(fbRef('students57/'+s.fbKey), { balance: newBal });
  patchStudent(s.fbKey, { balance: newBal });
  const tx = { type:'expense', icon:'🛒', desc:`Kjøpte: ${p.name}`, amount: -p.price, ts: Date.now() };
  await saveTx(s.fbKey, 'expense', '🛒', `Kjøpte: ${p.name}`, -p.price);
  transactions.unshift(tx);
  refreshAllDisplays(); renderTransactions(); renderShop57();
  showSuccess('✅', 'Kjøpt!', `-${p.price} 🪙`, `${p.emoji} ${p.name} er ditt!`);
  _pendingPurchase = null; _buyPin = '';
}

// ── MERKER (BADGES) ────────────────────────────────────────────────────────
// Badge parameters loaded from settings/badgeParams (teacher-editable)
function getBadgeParams() {
  return getEffectiveBadgeParamsElev() || {
    quizBronse: 25, quizSolv: 50, quizGull: 75,
    spareBronse: 100, spareSolv: 1000, spareGull: 10000,
    skattBronse: 1000, skattSolv: 5000, skattGull: 10000,
    bonusBronse: 500, bonusSolv: 2500, bonusGull: 5000
  };
}

function getMedalLabel(type) {
  if (type === 'bronse') return {emoji: '🥉', name: 'Bronse', cls: 'bronse'};
  if (type === 'sølv')   return {emoji: '🥈', name: 'Sølv',   cls: 'sølv'};
  if (type === 'gull')   return {emoji: '🥇', name: 'Gull',   cls: 'gull'};
}

function getBadgeStatus(s) {
  const bp = getBadgeParams();
  const badges = s?.badges || {};
  // Current progress values
  const quizTotal = s?.quizCorrectTotal || 0;
  const spareTotal = s?.badgeSavingsEarned || 0;
  const skattTotal = s?.badgeTaxContributed || 0;

  return {
    quizTotal, spareTotal, skattTotal,
    quiz: {
      bronse: { earned: !!badges.quiz_bronse, req: bp.quizBronse, progress: quizTotal },
      sølv:   { earned: !!badges.quiz_sølv,   req: bp.quizSolv,   progress: quizTotal },
      gull:   { earned: !!badges.quiz_gull,   req: bp.quizGull,   progress: quizTotal },
    },
    spare: {
      bronse: { earned: !!badges.spare_bronse, req: bp.spareBronse, progress: spareTotal },
      sølv:   { earned: !!badges.spare_sølv,   req: bp.spareSolv,   progress: spareTotal },
      gull:   { earned: !!badges.spare_gull,   req: bp.spareGull,   progress: spareTotal },
    },
    skatt: {
      bronse: { earned: !!badges.skatt_bronse, req: bp.skattBronse, progress: skattTotal },
      sølv:   { earned: !!badges.skatt_sølv,   req: bp.skattSolv,   progress: skattTotal },
      gull:   { earned: !!badges.skatt_gull,   req: bp.skattGull,   progress: skattTotal },
    }
  };
}

function renderMerker() {
  const s = window._currentStudent; if (!s) return;
  const el = document.getElementById('merker-list'); if (!el) return;
  const bs = getBadgeStatus(s);
  const bp = getBadgeParams();

  const makeLevelRow = (level, data, category) => {
    const m = getMedalLabel(level);
    const pct = Math.min(100, Math.round(data.progress / data.req * 100));
    const earned = data.earned;
    const bonusKeyMap = { bronse: 'bonusBronse', sølv: 'bonusSolv', gull: 'bonusGull' };
    const bonusKey = bonusKeyMap[level] || `bonus${level.charAt(0).toUpperCase()+level.slice(1)}`;
    const bonus = bp[bonusKey] || 0;
    return `<div class="merke-level-row${earned?' earned':''}">
      <div class="merke-medal">${m.emoji}</div>
      <div class="merke-level-info">
        <div class="merke-level-name">${m.name}</div>
        <div class="merke-level-req">${data.progress} / ${data.req}</div>
        ${!earned ? `<div class="merke-prog-wrap"><div class="merke-prog-fill ${m.cls}" style="width:${pct}%"></div></div>` : ''}
      </div>
      ${earned
        ? `<div class="merke-earned-badge">✅ Oppnådd</div>`
        : `<div class="merke-bonus">+${bonus}🪙</div>`}
    </div>`;
  };

  const cards = [
    {
      icon: '🧠', name: 'Quizmester',
      desc: `Totalt riktige svar i økonomiquizen: ${bs.quizTotal}`,
      levels: ['bronse','sølv','gull'].map(l => makeLevelRow(l, bs.quiz[l], 'quiz'))
    },
    {
      icon: '💰', name: 'Sparemester',
      desc: `Totalt opptjent fra renter og fondsgevinst: ${bs.spareTotal} 🪙`,
      levels: ['bronse','sølv','gull'].map(l => makeLevelRow(l, bs.spare[l], 'spare'))
    },
    {
      icon: '🏛️', name: 'Skattemester',
      desc: `Totalt bidratt i skatt: ${bs.skattTotal} 🪙`,
      levels: ['bronse','sølv','gull'].map(l => makeLevelRow(l, bs.skatt[l], 'skatt'))
    }
  ];

  el.innerHTML = cards.map(c => `
    <div class="merke-card">
      <div class="merke-card-header">
        <div class="merke-icon">${c.icon}</div>
        <div>
          <div class="merke-name">${c.name}</div>
          <div class="merke-desc">${c.desc}</div>
        </div>
      </div>
      <div class="merke-levels">${c.levels.join('')}</div>
    </div>`).join('');
}

async function checkAndAwardBadges(s) {
  if (!s) return;
  const bp = getBadgeParams();
  const bs = getBadgeStatus(s);
  const updates = {};
  const newBadges = [];

  const check = (category, level, data, bonusKey) => {
    const key = `${category}_${level}`;
    if (!data.earned && data.progress >= data.req) {
      updates[`students57/${s.fbKey}/badges/${key}`] = true;
      const bonus = bp[bonusKey] || 0;
      newBadges.push({ key, bonus, label: getMedalLabel(level).name + ' ' + ({quiz:'Quizmester',spare:'Sparemester',skatt:'Skattemester'}[category]) });
    }
  };

  check('quiz',  'bronse', bs.quiz.bronse,  'bonusBronse');
  check('quiz',  'sølv',   bs.quiz.sølv,    'bonusSolv');
  check('quiz',  'gull',   bs.quiz.gull,    'bonusGull');
  check('spare', 'bronse', bs.spare.bronse, 'bonusBronse');
  check('spare', 'sølv',   bs.spare.sølv,   'bonusSolv');
  check('spare', 'gull',   bs.spare.gull,   'bonusGull');
  check('skatt', 'bronse', bs.skatt.bronse, 'bonusBronse');
  check('skatt', 'sølv',   bs.skatt.sølv,   'bonusSolv');
  check('skatt', 'gull',   bs.skatt.gull,   'bonusGull');

  if (newBadges.length > 0) {
    let totalBonus = newBadges.reduce((a, b) => a + b.bonus, 0);
    if (totalBonus > 0) {
      updates[`students57/${s.fbKey}/balance`] = (s.balance || 0) + totalBonus;
      patchStudent(s.fbKey, { balance: (s.balance || 0) + totalBonus });
    }
    for (const [k, v] of Object.entries(updates)) {
      patchStudent(s.fbKey, { badges: { ...(s.badges||{}), [k.split('/').pop()]: v } });
    }
    await window._update(window._ref(window._db, '/'), updates);
    if (totalBonus > 0) {
      await saveTx(s.fbKey, 'income', '🏅', `Merke-bonus: ${newBadges.map(b=>b.label).join(', ')}`, totalBonus);
      transactions.unshift({type:'income',icon:'🏅',desc:`Merke-bonus opptjent!`,amount:totalBonus,ts:Date.now()});
      renderTransactions();
      refreshAllDisplays();
      showSuccess('🏅','Nytt merke!',`+${totalBonus} 🪙`,newBadges.map(b=>b.label).join(' · '));
    }
  }
}

// ── QUIZ ───────────────────────────────────────────────────────────────────
const QUIZ_POOL=[
  {q:'Hva er rente?',opts:['Penger du får gratis','En kostnad for å låne penger','Et annet ord for lønn','En type skatt'],a:1},
  {q:'Du låner 200🪙 med 10% rente. Hva betaler du tilbake totalt?',opts:['200🪙','210🪙','220🪙','190🪙'],a:2},
  {q:'Hva betyr budsjett?',opts:['En type bank','En plan for inntekter og utgifter','Penger du har i lomma','En type rente'],a:1},
  {q:'Hva er inflasjon?',opts:['At penger vokser','At priser stiger over tid','At renter synker','At lønn alltid øker'],a:1},
  {q:'Inntekt minus skatt kalles:',opts:['Bruttolønn','Nettolønn','Kapital','Rente'],a:1},
  {q:'Hva er en sparekonto?',opts:['En konto med høy risiko','En konto som vokser med rente','En gjeldskonto','Et lån fra banken'],a:1},
  {q:'Hva skjer om du ikke betaler tilbake et lån?',opts:['Ingenting','Du får mer penger','Gjelden og renter vokser','Banken glemmer det'],a:2},
  {q:'Hva er forskjell på fast og variabel utgift?',opts:['Ingen forskjell','Fast er likt hver måned, variabel endrer seg','Fast er dyrest','Variabel er billigst'],a:1},
  {q:'Du tjener 1000🪙 og betaler 22% skatt. Hva sitter du igjen med?',opts:['880🪙','780🪙','800🪙','780🪙'],a:1},
  {q:'Hva er en fordel med å spare tidlig?',opts:['Pengene kan brukes med en gang','Renter legges til over tid og pengene vokser mer','Det er ikke noen fordel','Du mister pengene'],a:1},
  {q:'Hva er risiko i investering?',opts:['Du tjener alltid penger','Du kan både tjene og tape','Det er ingen risiko','Penger vokser alltid'],a:1},
  {q:'Hva menes med diversifisering?',opts:['Investere alt ett sted','Spre investeringene for å redusere risiko','Ta opp så mye lån som mulig','Spare uten rente'],a:1},
  {q:'Hva er et fond?',opts:['Et lån','En samling av mange investeringer','En type skatt','Et sparemål'],a:1},
  {q:'Hvorfor er det lurt å lage et budsjett?',opts:['Det er ikke lurt','For å ha oversikt og unngå å bruke mer enn du har','Bare rike lager budsjett','For å spare tid'],a:1},
  {q:'Hva betyr det å ha gjeld?',opts:['Du har mye penger','Du skylder penger til noen','Du er rik','Du har spart mye'],a:1},
  {q:'Hva er skatt?',opts:['Penger staten gir deg','Penger du betaler til staten for å finansiere fellesgoder','En type gave','Et lån'],a:1},
  {q:'Du setter 500🪙 i sparebank med 5% rente per uke. Hva har du etter én uke?',opts:['525🪙','550🪙','505🪙','510🪙'],a:0},
  {q:'Hva kalles det når en aksje stiger i verdi?',opts:['Tap','Kursfall','Kursøkning','Gjeld'],a:2},
  {q:'Hva er en brukskonto?',opts:['En konto du ikke kan bruke','En dagligkonto for inn og utbetalinger','En investeringskonto','En gjeldskonto'],a:1},
  {q:'Hva menes med "netto" lønn?',opts:['Lønn før skatt','Lønn etter skatt','Lønn + bonus','Lønn + renter'],a:1},
  {q:'Du har 300🪙 og bruker 40% på mat. Hva er igjen?',opts:['120🪙','180🪙','140🪙','200🪙'],a:1},
  {q:'Hva er fondsskatt?',opts:['Skatt du betaler for å opprette fond','Skatt på gevinst når du tar ut av fond','En avgift for å eie aksjer','Skatt på renter'],a:1},
  {q:'Hva skjer med pengene dine om du ikke investerer dem?',opts:['De vokser av seg selv','De holder seg stabile','De kan miste kjøpekraft pga. inflasjon','De dobles'],a:2},
  {q:'Hva er en fordel med høy risiko-investering?',opts:['Aldri tap','Mulighet for høyere gevinst','Garantert avkastning','Ingen skatt'],a:1},
  {q:'Hva er en ulempe med høy risiko-investering?',opts:['Du tjener alltid mer','Mulighet for større tap','Pengene er alltid trygge','Du slipper skatt'],a:1},
  {q:'Hva er meningen med klassens sparemål?',opts:['Å gi læreren penger','Å spare som klasse til noe alle kan glede seg over','Å betale skatt','Å kjøpe aksjer'],a:1},
  {q:'Hva er renten på brukskontoen din?',opts:['10%','5%','2%','0%'],a:3},
  {q:'Hvem eller hva bestemmer fondets kursendring?',opts:['Eleven selv','Læreren','Det endrer seg automatisk hver dag','Banken'],a:2},
  {q:'Du har 400🪙 og vil ta opp maks lån (2× saldo). Hva er maks lån?',opts:['400🪙','200🪙','800🪙','600🪙'],a:2},
  {q:'Hva skjer med sparekontoen din på mandag?',opts:['Den nullstilles','Renter legges til','Den låses','Ingenting'],a:1},
];
function getWeekKey(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+3-(d.getDay()+6)%7);const w1=new Date(d.getFullYear(),0,4);return`${d.getFullYear()}-W${String(1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7)).padStart(2,'0')}`;}
function getWeekQs(){
  // Individual per student: combine week key with student PIN for unique shuffle
  const s = window._currentStudent;
  const studentSeed = s ? parseInt(s.pin||'1234') : 1234;
  const seed = (parseInt(getWeekKey().replace(/\D/g,'')) + studentSeed) * 137;
  return [...QUIZ_POOL].sort((a,b)=>{
    const ha=(seed*(QUIZ_POOL.indexOf(a)+1)*1103515245)%1000;
    const hb=(seed*(QUIZ_POOL.indexOf(b)+1)*1103515245)%1000;
    return ha-hb;
  }).slice(0,5);
}
function checkQuizStatus(){
  const s=window._currentStudent;if(!s)return;
  const done=s.quizWeek===getWeekKey();
  document.getElementById('quiz-badge').textContent=done?'✅ Fullført':'5 sp. · 20🪙 per svar';
  document.getElementById('quiz-card-body').innerHTML=done
    ?'<div style="text-align:center;padding:.3rem 0"><div style="font-size:1.6rem">🏆</div><div style="font-size:.8rem;font-weight:700;opacity:.85">Fullført! Ny quiz på mandag.</div></div>'
    :'<div style="font-size:.8rem;opacity:.85;margin-bottom:.5rem">Test dine kunnskaper om økonomi!</div><button class="quiz-start-btn" onclick="startQuiz()">▶ Start quiz</button>';
}
function startQuiz(){
  const s=window._currentStudent;if(!s)return;
  if(s.quizWeek===getWeekKey()){alert('Du har allerede tatt quizen!');return;}
  quizQs=getWeekQs();quizIdx=0;quizOk=0;
  document.getElementById('quiz-overlay').classList.add('open');showQuizQ();
}
function showQuizQ(){
  const q=quizQs[quizIdx],tot=quizQs.length;
  document.getElementById('quiz-q-num').textContent=`Spørsmål ${quizIdx+1} av ${tot}`;
  document.getElementById('quiz-q-text').textContent=q.q;
  document.getElementById('quiz-prog-bar').style.width=(quizIdx/tot*100)+'%';
  document.getElementById('quiz-fb').className='quiz-fb';
  document.getElementById('quiz-nxt').className='quiz-nxt';
  quizAnswered=false;
  document.getElementById('quiz-opts').innerHTML=q.opts.map((o,i)=>`<button class="quiz-opt" onclick="answerQ(${i})" id="qo-${i}">${o}</button>`).join('');
}
function answerQ(c){
  if(quizAnswered)return;quizAnswered=true;
  const q=quizQs[quizIdx],ok=c===q.a;if(ok)quizOk++;
  q.opts.forEach((_,i)=>{const b=document.getElementById('qo-'+i);b.disabled=true;if(i===q.a)b.classList.add('correct');if(i===c&&!ok)b.classList.add('wrong');});
  const fb=document.getElementById('quiz-fb');fb.textContent=ok?'✅ Riktig!':'❌ Riktig: '+q.opts[q.a];fb.className='quiz-fb show '+(ok?'ok':'no');
  const nxt=document.getElementById('quiz-nxt');nxt.className='quiz-nxt show';nxt.textContent=quizIdx<quizQs.length-1?'Neste →':'Se resultatet 🏆';
}
async function nextQ(){quizIdx++;if(quizIdx<quizQs.length)showQuizQ();else await finishQuiz();}
async function finishQuiz(){
  document.getElementById('quiz-overlay').classList.remove('open');
  const earned=quizOk*20;const s=window._currentStudent;
  const prevTotal = s.quizCorrectTotal || 0;
  const newTotal = prevTotal + quizOk;
  const newBal=(s.balance||0)+earned;
  await window._update(fbRef('students57/'+s.fbKey),{balance:newBal,quizWeek:getWeekKey(),quizCorrectTotal:newTotal});
  patchStudent(s.fbKey,{balance:newBal,quizWeek:getWeekKey(),quizCorrectTotal:newTotal});
  refreshAllDisplays();
  if(earned>0){const tx={type:'income',icon:'🧠',desc:`Quiz – ${quizOk}/5 riktige`,amount:earned,ts:Date.now()};await saveTx(s.fbKey,'income','🧠',tx.desc,earned);transactions.unshift(tx);renderTransactions();}
  const pct=quizOk/quizQs.length;
  document.getElementById('qr-emoji').textContent=pct===1?'🏆':pct>=.6?'🌟':'💪';
  document.getElementById('qr-title').textContent=pct===1?'Perfekt!':pct>=.6?'Bra!':'Øv videre!';
  document.getElementById('qr-score').textContent=`${quizOk} av ${quizQs.length} riktige`;
  document.getElementById('qr-earned').textContent=earned>0?`+${earned} 🪙`:'0 🪙';
  document.getElementById('quiz-result').classList.add('open');checkQuizStatus();
  // Check badges after updating student
  await checkAndAwardBadges(window._currentStudent);
}
function closeQuiz(){document.getElementById('quiz-overlay').classList.remove('open');}
function closeQuizResult(){document.getElementById('quiz-result').classList.remove('open');}

// ── INPUT SHEET ────────────────────────────────────────────────────────────
function showInputSheet(title,desc,cb){
  document.getElementById('input-sheet-title').textContent=title;
  document.getElementById('input-sheet-desc').textContent=desc;
  document.getElementById('input-sheet-val').value='';
  inputCb=cb;
  document.getElementById('input-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('input-sheet-val').focus(),150);
  document.getElementById('input-sheet-confirm').onclick=()=>{
    const v=parseInt(document.getElementById('input-sheet-val').value)||0;
    if(v<1){document.getElementById('input-sheet-val').style.borderColor='var(--coral)';return;}
    document.getElementById('input-overlay').classList.remove('open');cb(v);
  };
}
function closeInputSheet(){document.getElementById('input-overlay').classList.remove('open');inputCb=null;}

// ── SUCCESS ────────────────────────────────────────────────────────────────

// ── Tastatur-PIN (for PC-nettleser) ───────────────────────────────────────
document.addEventListener('keydown', function(e) {
  const loginScreen = document.getElementById('screen-login');
  const pinOverlay  = document.getElementById('pin-overlay');
  const purchasePin = document.getElementById('purchase-pin-overlay');
  if (loginScreen?.classList.contains('active')) {
    if (e.key >= '0' && e.key <= '9') { np(e.key); e.preventDefault(); }
    if (e.key === 'Backspace') { np('DEL'); e.preventDefault(); }
    return;
  }
  if (pinOverlay?.classList.contains('open')) {
    if (e.key >= '0' && e.key <= '9') { pcp(e.key); e.preventDefault(); }
    if (e.key === 'Backspace') { pcp('DEL'); e.preventDefault(); }
    return;
  }
  if (purchasePin?.classList.contains('open')) {
    if (e.key >= '0' && e.key <= '9') { bpp(e.key); e.preventDefault(); }
    if (e.key === 'Backspace') { bpp('DEL'); e.preventDefault(); }
    return;
  }
});

var _pinVisible57 = false;
function togglePinDisplay57() {
  _pinVisible57 = !_pinVisible57;
  var s = window._currentStudent;
  var disp = document.getElementById('pin-display-57');
  var btn  = document.getElementById('pin-toggle-btn-57');
  if (!disp || !btn || !s) return;
  if (_pinVisible57) {
    disp.textContent = s.pin;
    disp.style.letterSpacing = '.5rem';
    disp.style.color = 'var(--teal-dark)';
    btn.textContent = '🙈 Skjul PIN';
  } else {
    disp.textContent = '••••';
    disp.style.letterSpacing = '.4rem';
    btn.textContent = '👁 Vis PIN';
  }
}
function showSuccess(emoji,title,amount,text){
  document.getElementById('suc-emoji').textContent=emoji;document.getElementById('suc-title').textContent=title;
  document.getElementById('suc-amount').textContent=amount;document.getElementById('suc-text').textContent=text;
  document.getElementById('success-overlay').classList.add('open');
}

/* ====================== DAGEN I DAG ====================== */
var DAG_DAYS=['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
var DAG_MONTHS=['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
var _dagTimer=null;
var DAG_CTX_KEY='myntland-dag-ctx';
function dagEsc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function dagNameOfHour(hh){var N=['tolv','ett','to','tre','fire','fem','seks','sju','åtte','ni','ti','elleve','tolv'];var x=((hh%12)+12)%12;if(x===0)x=12;return N[x];}
function dagTimeWords(h,m){var rm=Math.round(m/5)*5,rh=h;if(rm===60){rm=0;rh=h+1;}var map={0:dagNameOfHour(rh),5:'fem over '+dagNameOfHour(rh),10:'ti over '+dagNameOfHour(rh),15:'kvart over '+dagNameOfHour(rh),20:'ti på halv '+dagNameOfHour(rh+1),25:'fem på halv '+dagNameOfHour(rh+1),30:'halv '+dagNameOfHour(rh+1),35:'fem over halv '+dagNameOfHour(rh+1),40:'ti over halv '+dagNameOfHour(rh+1),45:'kvart på '+dagNameOfHour(rh+1),50:'ti på '+dagNameOfHour(rh+1),55:'fem på '+dagNameOfHour(rh+1)};return map[rm]||'';}
function dagWeekNo(d){var t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));var day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);var ys=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil((((t-ys)/86400000)+1)/7);}
function dagSet(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
function dagTick(){
  var n=new Date();
  dagSet('dag-weekday',DAG_DAYS[n.getDay()]); dagSet('dag-day',n.getDate()); dagSet('dag-month',DAG_MONTHS[n.getMonth()]);
  dagSet('dag-week','Uke '+dagWeekNo(n)); dagSet('dag-year',n.getFullYear());
  var h=n.getHours(),m=n.getMinutes();
  dagSet('dag-digital',String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'));
  dagSet('dag-words',dagTimeWords(h,m));
  var hh=document.getElementById('dag-hour'),mm=document.getElementById('dag-min');
  if(hh)hh.setAttribute('transform','rotate('+((h%12)*30+m*0.5)+' 40 40)');
  if(mm)mm.setAttribute('transform','rotate('+(m*6)+' 40 40)');
}
function dagSaveCtx(c){ try{ localStorage.setItem(DAG_CTX_KEY, JSON.stringify(c)); }catch(e){} }
function dagCtx(){
  var s=window._currentStudent;
  if(s){ var c={ws:(s.workspaceId||'main'), klasse:(s.class||'')}; dagSaveCtx(c); return c; }
  try{ var r=JSON.parse(localStorage.getItem(DAG_CTX_KEY)||'null'); if(r&&(r.ws||r.klasse)) return r; }catch(e){}
  return null;
}
function dagBoard(){
  var all=window._dayboard||{}; var c=dagCtx(); if(window._CLASS_ID && all[window._CLASS_ID]) return all[window._CLASS_ID]; if(!c) return null;
  if(c.ws && all[c.ws]) return all[c.ws];
  if(c.klasse){ for(var k in all){ if(all[k]&&all[k].klasse===c.klasse) return all[k]; } }
  return null;
}
function dagToday(){ var b=dagBoard(); var wd=new Date().getDay(); wd=wd===0?7:wd; return {plan:(b&&b.week&&b.week[wd])||[], notes:(b&&b.notes)||[], has:!!b}; }
function renderDag(){
  var wrap=document.getElementById('dag-wrap'); if(wrap)wrap.style.display='';
  var pk=document.getElementById('dag-picker'); if(pk)pk.style.display='none';
  var t=dagToday();
  var cl=document.getElementById('dag-class');
  if(cl){
    var _b=dagBoard(); var _navn=(_b&&(_b.navn||_b.klasse))||'';
    if(window._currentStudent){ cl.textContent='Klasse '+(window._currentStudent.class||_navn||''); }
    else { var c=dagCtx(); var _nm=_navn||(c&&c.klasse)||''; cl.innerHTML = (c||_b) ? ('Klasse '+dagEsc(_nm)+' · <span style="text-decoration:underline;cursor:pointer" onclick="dagRepick()">bytt</span>') : ''; }
  }
  var ol=document.getElementById('dag-lessons');
  if(ol){
    ol.innerHTML='';
    if(!t.has){ ol.innerHTML='<li class="dag-empty">Læreren har ikke delt en plan ennå.</li>'; }
    else if(!t.plan.length){ ol.innerHTML='<li class="dag-empty">Ingen timer i dag 🎉</li>'; }
    else {
      t.plan.forEach(function(it){
        var li=document.createElement('li');
        if(it.type==='break'){
          li.className='dag-break';
          li.innerHTML='<span class="dag-btime">'+dagEsc(it.time||'')+'</span><span class="dag-bname">'+(it.big?'Storefri':'Friminutt')+(it.note?' · '+dagEsc(it.note):'')+'</span>';
        } else {
          li.className='dag-lesson';
          li.innerHTML='<span class="dag-time">'+dagEsc(it.time||'')+'</span><span class="dag-ic"><img src="fagikoner/ikon-'+dagEsc(it.icon||'annet')+'.webp" alt="" onerror="this.parentNode.style.display=\'none\'"></span><span class="dag-name">'+dagEsc(it.name||'')+'</span>';
        }
        ol.appendChild(li);
      });
    }
  }
  var nb=document.getElementById('dag-notes');
  if(nb){
    nb.innerHTML='';
    if(!t.notes.length){ nb.innerHTML='<div class="dag-empty">Ingen beskjeder i dag.</div>'; }
    else t.notes.forEach(function(tx){ var d=document.createElement('div'); d.className='dag-note'; d.textContent=tx; nb.appendChild(d); });
  }
}
function renderDagPicker(){
  var wrap=document.getElementById('dag-wrap'); if(wrap)wrap.style.display='none';
  var pk=document.getElementById('dag-picker'); if(!pk) return; pk.style.display='';
  var list=document.getElementById('dag-picker-list'); if(!list) return;
  var all=window._dayboard||{}; var classes=[];
  for(var k in all){ if(all[k]&&all[k].klasse){ classes.push({ws:k,klasse:all[k].klasse}); } }
  classes.sort(function(a,b){return String(a.klasse).localeCompare(String(b.klasse),'nb');});
  list.innerHTML='';
  if(!classes.length){ list.innerHTML='<div class="dag-empty" style="text-align:center">Ingen klasser har delt en plan ennå. Be læreren åpne klasseportalen.</div>'; return; }
  classes.forEach(function(c){
    var b=document.createElement('button'); b.textContent=c.klasse;
    b.style.cssText='font-family:inherit;font-size:22px;font-weight:800;color:#2a1f3d;background:#fffaf0;border:4px solid #2a1f3d;border-radius:18px;padding:14px;cursor:pointer;box-shadow:0 5px 0 rgba(42,31,61,.16);';
    b.onclick=function(){ dagSaveCtx({ws:c.ws,klasse:c.klasse}); dagTick(); renderDag(); };
    list.appendChild(b);
  });
}
function dagRefresh(){ if(dagCtx()) renderDag(); else renderDagPicker(); }
function dagRepick(){ try{ localStorage.removeItem(DAG_CTX_KEY); }catch(e){} renderDagPicker(); }
function enterDag(){
  showScreen('screen-dag');
  if(_dagTimer)clearInterval(_dagTimer);
  _dagTimer=setInterval(function(){ dagTick(); dagRefresh(); },20000);
  dagTick(); dagRefresh();
}
function goToDag(){ enterDag(); }
function goSplashFromDag(){ if(_dagTimer){clearInterval(_dagTimer);_dagTimer=null;} goToSplash(); }

/* Dagen i dag: les klasse fra delt lenke (?ws= har forrang, ?klasse= som reserve) */
(function(){ try{ var p=new URLSearchParams(location.search); var ws=p.get('ws'), kl=p.get('klasse')||p.get('class'); if((ws||kl)&&typeof dagSaveCtx==='function'){ dagSaveCtx({ ws: ws||'', klasse: kl||'' }); } }catch(e){} })();

function dagUpdateSplashBtn(){
  var b=document.getElementById('splash-dag-btn'); if(!b) return;
  var c=(typeof dagCtx==='function')?dagCtx():null;
  if(c){ var board=dagBoard(); b.style.display=(board && board.enabled!==false) ? '' : 'none'; }
  else { var all=window._dayboard||{}; var any=false; for(var k in all){ if(all[k]&&all[k].enabled!==false&&all[k].week) any=true; } b.style.display=any?'':'none'; }
}
