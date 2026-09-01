/* ============================================================================
   IMMUNE RESPONSE — UI orchestration: screens, lobby, drafts, results, loop
   ========================================================================== */
'use strict';

const DRAFT_KINDS=['squadDraft','personalDraft','evolution'];
const BOT_SEEDS=[['Rho-2','macrophage'],['Kai-9','bcell'],['Iyo-4','nk']];
let hbBeat=0;

function showScreen(id){
  // Draft screens run over live gameplay — the HUD (joystick, fire button,
  // health, etc.) must stay visible and touchable underneath them so players
  // can still reposition. Every other screen is a full stop, so HUD hides.
  const isDraft=id==='screenDraft';
  document.querySelectorAll('.screen').forEach(s=>{
    if(s.id===id){clearTimeout(s._closeT);s.classList.remove('closing','hidden');return;}
    if(s.classList.contains('hidden'))return;
    // Fade the outgoing screen out instead of yanking it away instantly —
    // an abrupt cut when a draft/menu closes is disorienting mid-action.
    s.classList.add('closing');
    clearTimeout(s._closeT);
    s._closeT=setTimeout(()=>{s.classList.add('hidden');s.classList.remove('closing');},190);
  });
  $('hud').classList.toggle('active',!id||isDraft);
  if(id){
    App.screen=id.replace('screen','').toLowerCase();
    if(id==='screenSplash')refreshRejoinButton();
  }else{
    App.screen='playing';
    // Belt-and-suspenders: re-request fullscreen every time gameplay
    // (re)starts — e.g. resuming from pause, retry, or a fresh draft →
    // combat transition. This call is inside a function invoked from a
    // click handler chain (Resume/Retry/etc.) so it still counts as a user
    // gesture in the browsers that require one.
    if(!isGameFullscreen())requestGameFullscreen();
  }
  updateFullscreenBtn();
}
function setStatus(msg){$('connectStatus').innerHTML=msg?'<span style="color:#ff8ea0">'+escapeHtml(msg)+'</span>':'&nbsp;';}

/* ---------------------------------------------------------------- class cards */
function classCardHtml(key,selected){
  const c=CLASSES[key];
  return `<div class="class-toprow"><span class="class-icon">${c.icon}</span>`+
    `<span class="class-name">${c.name}</span><span class="class-role">${c.role}</span></div>`+
    `<div class="class-desc">${c.desc}</div>`+
    `<div class="class-stats">`+
    `<div class="stat-pill"><b>${c.hp}</b>HP</div>`+
    `<div class="stat-pill"><b>${c.speed}</b>SPD</div>`+
    `<div class="stat-pill"><b>${c.range}</b>RNG</div></div>`+
    `<div class="class-ab"><b>${c.ability.icon} ${c.ability.name}</b> — ${c.ability.desc}</div>`;
}
function buildClassGrid(el,onPick){
  el.innerHTML='';
  for(const key of Object.keys(CLASSES)){
    const card=document.createElement('div');
    card.className='class-card'+(App.myClass===key?' selected':'');
    card.style.setProperty('--cc',CLASSES[key].color);
    card.innerHTML=classCardHtml(key);
    card.addEventListener('click',()=>{AudioSys.play('ui');onPick(key);});
    el.appendChild(card);
  }
}
App.myClass=localStorage.getItem('ir_class')||'tcell';
if(!CLASSES[App.myClass])App.myClass='tcell';

/* ---------------------------------------------------------------- lobby */
function renderLobby(){
  // A lobby update means we belong in the lobby UI. Arriving here from the
  // connect screen (create/join) previously never switched screens — the
  // lobby stayed invisible behind the connect panel.
  if(!App.inRun||App.screen==='results'){showScreen('screenLobby');}
  const slots=App.lobbySlots||[];
  App.isHost=slots.some(s=>s.pid===App.myPid&&s.host);
  $('lobbyCode').textContent=App.lobbyCode||'----';
  const list=$('slotList');
  list.innerHTML='';
  for(let i=0;i<4;i++){
    const s=slots[i];
    const row=document.createElement('div');
    if(!s){
      row.className='slot empty';
      row.innerHTML='<span style="letter-spacing:.12em;">OPEN SEAT — AI SQUADMATE FILLS IN</span>';
    }else{
      row.className='slot';
      const cls=s.cls?`<span style="opacity:.75">${(CLASSES[s.cls]||{}).icon||''} ${(CLASSES[s.cls]||{}).name||''}</span>`:'<span style="opacity:.5;font-size:11px;">picking…</span>';
      const goneTag=s.gone?'<span class="slot-tag tag-wait" style="animation:fadeIn .3s ease;">RECONNECTING…</span>':
        `<span class="slot-tag ${s.host?'tag-host':(s.ready?'tag-ready':'tag-wait')}">${s.host?'HOST':(s.ready?'READY':'WAITING')}</span>`;
      const kickBtn=(App.isHost&&s.human&&s.pid!==App.myPid)
        ?`<button class="copy-btn kick-btn" data-kick="${s.pid}" title="Remove from squad">KICK</button>`:'';
      row.innerHTML=`<div class="slot-dot" style="background:${s.gone?'#555':s.cls?(CLASSES[s.cls]||{}).color:'#555'}"></div>`+
        `<span class="slot-name">${escapeHtml(s.name)}${s.pid===App.myPid?' <span style="color:var(--you)">(you)</span>':''}</span>`+
        `${cls}`+
        `${goneTag}${kickBtn}`;
    }
    list.appendChild(row);
  }
  function rebuildGrid(){
    buildClassGrid($('lobbyClassGrid'),k=>{
      App.myClass=k;localStorage.setItem('ir_class',k);
      netSend({t:'class',k});
      rebuildGrid();
    });
  }
  rebuildGrid();
  const me=slots.find(s=>s.pid===App.myPid);
  // The host has no Ready button — their launch IS the ready action. Only
  // guests gate deployment. (Previously the host counted as unready forever,
  // so Deploy Squad could never be enabled.)
  const allReady=slots.length>0&&slots.filter(s=>!s.host).every(s=>!s.human||s.ready||s.gone);
  const launch=$('btnLaunch'),ready=$('btnReady');
  if(App.isHost){
    launch.style.display='inline-block';
    launch.disabled=!allReady;
    launch.textContent=allReady?'Deploy Squad':'Waiting for squad to ready…';
    ready.style.display='none';
  }else{
    launch.style.display='none';
    ready.style.display='inline-block';
    ready.textContent=me&&me.ready?'Unready':'Ready Up';
  }
}
/* kick delegation — one listener on the slot list */
function wireLobbyKick(){
  $('slotList').addEventListener('click',e=>{
    const btn=e.target.closest('.kick-btn');
    if(!btn||!App.isHost)return;
    const pid=Number(btn.dataset.kick);
    if(pid===App.myPid)return;
    netSend({t:'kick',pid});
    toast((App.lobbySlots.find(s=>s.pid===pid)||{}).name?('Kicked '+App.lobbySlots.find(s=>s.pid===pid).name):'Player kicked');
  });
}
function renderLobbyKeepSel(){renderLobby();}

/* ---------------------------------------------------------------- run start */
function startSoloRun(){
  App.mode='solo';App.isHost=true;App.inRun=true;App.paused=false;
  App.myPid=1;
  initSimFromRoster([{pid:1,name:App.playerName||'You',cls:App.myClass,human:true}],true);
  beginRunUi();
}
function startMultiplayerRun(){
  App.mode='mp'; // gates snapshot streaming, guest input streaming & result relay
  App.inRun=true;App.paused=false;guestReset();
  if(App.isHost)initSimFromRoster(App.roster,true);
  beginRunUi();
  callout(App.isHost?'You are hosting the simulation':'Linked to host — good hunting','#3ee8c8',true);
}
function initSimFromRoster(roster,withBots){
  SIM=newSim();
  for(const r of roster)SIM.players.push(makePlayerEntity(r.pid,r.name,r.cls,false));
  if(withBots){
    const taken=new Set(SIM.players.map(p=>p.cls));
    for(const[nm,cls]of BOT_SEEDS){
      if(SIM.players.length>=4)break;
      let k=cls;
      if(taken.has(k))k=Object.keys(CLASSES).find(c=>!taken.has(c));
      if(!k)k=choice(Object.keys(CLASSES));
      taken.add(k);
      SIM.players.push(makePlayerEntity(-(SIM.players.length+10),nm,k,true));
    }
  }
  startWave();
}
function beginRunUi(){
  initWorld(); // freeze the arena to this viewport for the whole run
  showScreen(null);
  buildOrganIcons();
  lastSquadKey='';
  FX.parts=[];FX.popups=[];FX.motes=[];FX.warns=[];FX.fakeTraces=[];
  $('calloutFeed').innerHTML='';
  hintOnce('move');
}

/* ---------------------------------------------------------------- drafts UI */
let draftKind=null,draftLocalDone=false,draftSelId=null;
function openDraftScreen(phase){
  if(App.screen==='results')return;
  draftKind=phase;draftLocalDone=false;draftSelId=null;
  AudioSys.play('draftOpen');
  const panel=$('screenDraft');
  const title=$('draftTitle'),sub=$('draftSub'),note=$('draftNote');
  const actions=$('draftActions'),skipBtn=$('btnSkipDraft');
  panel.classList.remove('no-timer'); // every draft phase now runs on a countdown
  // Personal-perk and evolution drafts are select-and-lock with no button —
  // nothing single-handedly closes those for the group either, since an
  // unpicked slot just times out and is skipped for that one player only.
  // Squad draft is the one case that needs an explicit "skip" affordance:
  // voting for no card at all is a valid group decision, not just an
  // absence of one, so it gets its own button (see voteSquad('skip')).
  actions.style.display=phase==='squadDraft'?'flex':'none';
  if(phase==='squadDraft'){
    title.textContent='SQUAD DRAFT';title.style.color='var(--gold)';
    sub.textContent='One shared upgrade, bought with squad EP.';
    note.innerHTML='Click a card to lock in your vote, or Skip if the squad would rather save EP. This is a <b>group decision</b> — it resolves once <b>everyone</b> has voted, or when the timer runs out (unvoted squadmates count as a skip).';
    skipBtn.classList.remove('picked');
    skipBtn.disabled=false;
  }else if(phase==='personalDraft'){
    title.textContent='YOUR EVOLUTION';title.style.color='var(--plasma)';
    sub.textContent='A personal perk — free, just for you.';
    note.innerHTML='Click a card to lock in your pick. The run resumes when <b>everyone</b> has picked (or the timer ends — unpicked slots are skipped).';
  }else{
    title.textContent='SKILL EVOLUTION';title.style.color='var(--toxin)';
    const ab=(CLASSES[App.myClass]||{}).ability||{};
    sub.textContent=`Upgrade your ${ab.name||''} ability.`;
    note.innerHTML='These upgrades apply to <b>your ability only</b>. Click a card to lock it in.';
  }
  renderDraftList(null);
  showScreen('screenDraft');
}
function renderDraftList(votesMap){
  const list=$('draftList');
  list.innerHTML='';
  let optIds=[];
  if(draftKind==='squadDraft')optIds=(currentView&&currentView.squadOptions)||[];
  else if(draftKind==='personalDraft')optIds=((currentView&&currentView.personalOptions)||{})[String(App.myPid)]||((currentView&&currentView.personalOptions)||{})[App.myPid]||[];
  else optIds=((currentView&&currentView.evoOptions)||{})[String(App.myPid)]||((currentView&&currentView.evoOptions)||{})[App.myPid]||[];
  const ep=currentView?currentView.ep:0;
  const wave=currentView?currentView.wave:1;
  optIds.forEach((id,idx)=>{
    // Filler cards (see makeSquadFillerCard/makeEpFillerCard in waves.js —
    // the never-empty-slot fallback) live in FILLER_BY_ID, checked first so
    // a dried-out pool still renders a real card instead of silently
    // skipping the slot via the !meta guard below.
    const meta=FILLER_BY_ID[id]||(draftKind==='squadDraft'?UPG_BY_ID[id]:(draftKind==='personalDraft'?PERK_BY_ID[id]:EVO_BY_ID[id]));
    if(!meta)return;
    const cost=draftKind==='squadDraft'?scaledCost(meta,wave):0;
    const afford=draftKind!=='squadDraft'||ep>=cost;
    const card=document.createElement('div');
    const rarity=meta.rarity||'common';
    // Curses get their own accent color/badge (CURSE_COLOR/CURSE_LABEL,
    // keyed by curseTier) instead of the normal rarity treatment — they're
    // a distinct 5th tier visually, not just an elite/epic card with a
    // scary name, so the risk/reward choice is obvious before clicking.
    const isCurse=!!meta.curse;
    const accentColor=isCurse?CURSE_COLOR[meta.curseTier||'mild']:RARITY_COLOR[rarity];
    // Rarity now drives the card's accent color/glow (legendary=gold pops
    // hardest); category is still shown as a small text tag on squad cards.
    card.className='upgrade-card rarity-'+rarity+(isCurse?' cursed curse-'+(meta.curseTier||'mild'):'')+(draftSelId===id?' picked':'')+(afford?'':' disabled');
    card.style.setProperty('--oc',accentColor);
    const costHtml=draftKind==='squadDraft'
      ?(afford?`<div class="upgrade-cost">◈${cost}</div>`:`<div class="upgrade-cost cant">NEED ◈${cost}</div>`)
      :'';
    let votesHtml='';
    if(draftKind==='squadDraft'&&votesMap){
      const voters=Object.entries(votesMap).filter(([pid,v])=>v===id);
      if(voters.length){
        votesHtml='<div class="votes-row"><span class="vote-label">VOTES</span>'+voters.map(([pid])=>{
          const pl=(currentView.players||[]).find(p=>p.i==Number(pid));
          return `<div class="vote-dot" style="background:${pl?pl.col:'#3ee8c8'};color:${pl?pl.col:'#3ee8c8'}"></div>`;
        }).join('')+'</div>';
      }
    }
    // {amt} in a repeatable card's desc resolves to THIS specific stack's
    // diminishing-returns amount, plus a "(n/max)" counter so the squad can
    // see at a glance how close a card is to capping out.
    let desc=meta.desc;
    if(meta.stack&&draftKind==='squadDraft'){
      const amt=nextStackAmount(meta);
      const n=upgStacks(meta.id);
      desc=desc.replace('{amt}',amt)+` <span class="stack-count">(${n+1}/${meta.stack.max})</span>`;
    }
    const rarityBadge=isCurse
      ?`<span class="rarity-badge cursed" style="color:${accentColor}">💀 ${CURSE_LABEL[meta.curseTier||'mild']}</span>`
      :`<span class="rarity-badge" style="color:${accentColor}">${RARITY_LABEL[rarity]}</span>`;
    card.innerHTML=`<div class="num-key">${idx+1}</div><div class="upgrade-icon">${meta.icon}</div>`+
      `<div class="upgrade-body"><div class="upgrade-name">${meta.name} ${rarityBadge}</div><div class="upgrade-desc">${desc}${meta.cat?` · <span style="color:${CAT_COLOR[meta.cat]}">${meta.cat}</span>`:''}</div></div>`+
      costHtml+votesHtml;
    card.addEventListener('click',()=>selectDraftOption(id,afford));
    list.appendChild(card);
  });
}
function selectDraftOption(id,afford){
  AudioSys.play('ui');
  if(draftKind==='squadDraft'){
    // A vote, not a confirm — anyone can change their mind right up until
    // the whole squad has picked. Nobody's single tap can close this for
    // everyone else; the host only resolves it once every human has voted
    // (see resolveSquadDraft in waves.js).
    if(!afford){toast('Not enough EP for that upgrade',true);return;}
    draftSelId=id;
    $('btnSkipDraft').classList.remove('picked');
    renderDraftList(currentView&&currentView.votes);
    if(App.mode==='mp'&&!App.isHost)netSend({t:'g',d:{a:'vote',id}});
    else if(SIM&&SIM.draft)voteSquad(App.myPid,id);
  }else{
    draftSelId=id;
    renderDraftList();
    draftLocalDone=true;
    const k=draftKind;
    setTimeout(()=>{if(App.screen==='draft'&&draftKind===k&&currentView&&currentView.phase===k){showScreen(null);} },250);
    if(App.isHost&&SIM){(draftKind==='personalDraft'?pickPersonal:pickEvolution)(App.myPid,id);}
    else netSend({t:'g',d:{a:draftKind==='personalDraft'?'perk':'evo',id}});
  }
}
/* The squad votes to buy nothing this round. Same vote-and-wait machinery
   as picking a card (voteSquad with the 'skip' sentinel) — it just never
   competes for a card in topVotedAffordable. */
function skipSquadDraft(){
  if(draftKind!=='squadDraft')return;
  AudioSys.play('ui');
  draftSelId=null;
  $('btnSkipDraft').classList.add('picked');
  renderDraftList(currentView&&currentView.votes);
  if(App.mode==='mp'&&!App.isHost)netSend({t:'g',d:{a:'vote',id:'skip'}});
  else if(SIM&&SIM.draft)voteSquad(App.myPid,'skip');
}
let currentView=null;
function syncDraftScreens(view){
  const ph=view.phase;
  if(DRAFT_KINDS.includes(ph)){
    // Open (or re-render) whenever the modal isn't showing THIS phase yet:
    // covers first-open, and mid-modal transitions like squad->personal.
    const showingThisPhase=App.screen==='draft'&&draftKind===ph;
    if(!showingThisPhase&&!(App.screen!=='draft'&&draftLocalDone&&draftKind===ph))openDraftScreen(ph);
    if(App.screen==='draft'){
      const t=Math.max(0,Math.ceil(view.phaseLeft));
      $('draftTimerNum').textContent=t+'s';
      $('draftTimerFill').style.width=(clamp(view.phaseLeft/Math.max(1,view.phaseDur),0,1)*100)+'%';
      const urgent=view.phaseLeft<=5;
      $('draftTimerFill').classList.toggle('urgent',urgent);
      $('draftTimerNum').classList.toggle('urgent',urgent);
      if(ph==='squadDraft'){
        const votedCount=(view.players||[]).filter(p=>p.h&&view.votes&&view.votes[p.i]!=null).length;
        const humanCount=(view.players||[]).filter(p=>p.h).length;
        $('draftKicker').textContent=`WAVE ${view.wave} CLEARED · ${votedCount}/${humanCount} VOTED`;
      }else{
        $('draftKicker').textContent='WAVE '+view.wave+' CLEARED';
      }
      const sum=$('draftSummary');
      if(sum)sum.innerHTML=
        `<div>WAVE CLEARED<b>${view.wave}</b></div>`+
        `<div>BODY HP<b>${view.bodyHp}/${view.bodyHpMax}</b></div>`+
        `<div>SQUAD EP<b style="color:var(--plasma)">◈ ${view.ep}</b></div>`;
      if(ph==='squadDraft')renderDraftList(view.votes);
    }
  }else{
    draftLocalDone=false;draftKind=null;
    if(App.screen==='draft')showScreen(null);
  }
}
function applyGuestAction(pid,d){
  if(!SIM)return;
  // Squad draft: every action is just a vote now — nothing a guest sends
  // can close the screen for the rest of the squad. Resolution happens
  // automatically once everyone has voted (simUpdate → resolveSquadDraft).
  if((d.a==='vote'||d.a==='confirm')&&SIM.phase==='squadDraft')voteSquad(pid,d.id);
  else if(d.a==='perk'&&SIM.phase==='personalDraft')pickPersonal(pid,d.id);
  else if(d.a==='evo'&&SIM.phase==='evolution')pickEvolution(pid,d.id);
}

/* ---------------------------------------------------------------- results */
function showResults(stats,reason){
  if(App.screen==='results')return; // host event + relay can both arrive
  App.inRun=false;
  if(typeof SvgFX!=='undefined')SvgFX.reset(); // clear pooled sprite DOM nodes now that the run is over
  showScreen('screenResults');
  $('resultsTitle').textContent='THE BODY HAS FALLEN';
  $('resultsSub').textContent='Failed at wave '+stats.waves+' — infection overwhelmed the body';
  $('resultsReason').textContent=reason||'';
  const grid=$('statGrid');
  grid.innerHTML='';
  [['Waves Survived',stats.waves],['Pathogens Eliminated',stats.kills],['Perfect Waves',stats.perfect],['Leaks Total',stats.leaks]].forEach(([l,v])=>{
    const box=document.createElement('div');box.className='stat-box';
    box.innerHTML=`<div class="v">${v}</div><div class="l">${l}</div>`;
    grid.appendChild(box);
  });
  const retry=$('btnRetry');
  if(App.mode==='mp'){retry.textContent='Back to Lobby';}
  else{retry.textContent='Deploy Again';}
}

/* ---------------------------------------------------------------- misc UI */
function leaveToMenu(){
  exitGameFullscreen(); // covers every path here: quit, kick, disconnect, host-ended
  App.leaving=true; // suppress auto-reconnect — this exit was intentional
  App.inRun=false;App.mode=null;App.isHost=false;SIM=null;
  if(typeof SvgFX!=='undefined')SvgFX.reset(); // clear pooled sprite DOM nodes so a fresh run starts with an empty layer
  clearSquadIdentity();
  try{if(App.ws)App.ws.close();}catch(_){}
  App.ws=null;App.connected=false;
  showScreen('screenSplash');
}
function togglePause(){
  if(App.screen==='playing'){
    showScreen('screenPause');
    $('pauseNote').textContent=App.mode==='mp'
      ?'The fight continues for your squad while this menu is open.'
      :'Solo simulation frozen.';
    App.paused=true;
  }else if(App.screen==='pause'){
    resumeFromPause();
  }
}
function resumeFromPause(){App.paused=false;showScreen(null);}

/* ---------------------------------------------------------------- settings */
function openSettings(){
  AudioSys.play('ui');
  renderSettingsScreen();
  showScreen('screenSettings');
}

const SETTINGS_PRESET_ORDER=['low','medium','high','ultra'];
const SETTINGS_PRESET_LABELS={low:'Low',medium:'Medium',high:'High',ultra:'Ultra'};

/* Toggle rows: [settingKey, label, sublabel]. Grouped to match settings.js
   comment sections so the UI and the data file stay easy to cross-reference. */
const SETTINGS_TOGGLE_GROUPS=[
  {title:'Resolution & Performance',rows:[
    ['autoRes','Auto resolution','Let the game adapt resolution live to keep frame time steady. Turn off to lock in your own choice.'],
  ]},
  {title:'Particles & Effects',rows:[
    ['particles','Particles','Hit sparks, death bursts, muzzle flashes, EP motes.'],
    ['destructionParticles','Destruction debris','Extra jagged fragments thrown out when something dies, on top of regular particles.'],
    ['screenShake','Screen shake','Camera kick on leaks and big hits.'],
    ['hitFlash','Damage/heal flash','Full-screen red/green flash vignette when you take damage or get healed.'],
  ]},
  {title:'World',rows:[
    ['backgroundFx','Background ambience','Drifting glow motes and large organism silhouettes passing overhead.'],
    ['veins','Capillary veins','Pulsing vein network under the arena, synced to the Body\u2019s heartbeat.'],
  ]},
  {title:'UI & Readability',rows:[
    ['damageText','Damage text','Floating damage/heal/EP numbers.'],
    ['calloutFeed','Callout feed','Text callouts for downs, mimics, wave clears, squad buys.'],
    ['rangeRing','Range ring','Dashed ring around your cell showing your weapon\u2019s range while firing.'],
  ]},
  {title:'Aim Assist',rows:[
    ['aimAssist','Aim assist','Gently bends your aim toward a nearby enemy inside a narrow cone in front of your cursor/stick. Never overrides your own direction if nothing qualifies.'],
  ]},
];

function settingsRowToggleHtml(key,label,sub){
  const on=!!Settings[key];
  return `<div class="settings-row" data-toggle="${key}">
    <div><div class="settings-row-label">${escapeHtml(label)}</div>${sub?`<div class="settings-row-sub">${escapeHtml(sub)}</div>`:''}</div>
    <div class="settings-toggle ${on?'on':''}" data-key="${key}"></div>
  </div>`;
}

function renderSettingsScreen(){
  const body=$('settingsScreenBody');
  if(!body)return;
  const rec=recommendedPresetLabel();
  const recKey=estimateDeviceTier();

  let html='';
  html+=`<div class="settings-recommend">
    <div>Recommended for this device: <b>${escapeHtml(rec)}</b></div>
    ${Settings.preset===recKey?'':`<button id="btnApplyRecommended" data-preset="${recKey}">Use ${escapeHtml(rec)}</button>`}
  </div>`;

  html+='<div class="settings-preset-row">'+SETTINGS_PRESET_ORDER.map(p=>
    `<button class="settings-preset-btn ${Settings.preset===p?'active':''}" data-preset="${p}">${SETTINGS_PRESET_LABELS[p]}</button>`
  ).join('')+'</div>';
  html+=`<div class="settings-preset-note">${settingsPresetBlurb()}</div>`;

  html+=`<div class="settings-group">
    <div class="settings-group-title">Resolution</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Render scale</div><div class="settings-row-sub">Backing-store framebuffer size. Higher looks sharper, costs more GPU time.</div></div>
      <select class="settings-select" id="selResScale" ${Settings.autoRes?'disabled':''}>
        ${[0.6,0.7,0.8,0.9,1].map(v=>`<option value="${v}" ${Math.abs(Settings.resScale-v)<0.01?'selected':''}>${Math.round(v*100)}%</option>`).join('')}
      </select>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Sharpness (pixel density)</div><div class="settings-row-sub">Caps how many real device pixels the game draws per screen pixel. Low intentionally softens/blurs high-density screens to save GPU work; Ultra draws native-sharp.</div></div>
      <select class="settings-select" id="selDprCap">
        ${[1,1.5,2,3].map(v=>`<option value="${v}" ${Settings.dprCap===v?'selected':''}>${dprLabel(v)}</option>`).join('')}
      </select>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Frame rate cap</div><div class="settings-row-sub">Ultra unlocks 120fps for high-refresh screens.</div></div>
      <select class="settings-select" id="selFrameCap">
        ${[30,60,120].map(v=>`<option value="${v}" ${Settings.frameCap===v?'selected':''}>${v} fps</option>`).join('')}
      </select>
    </div>
    ${settingsRowToggleHtml('autoRes','Auto resolution','Let the game adapt resolution live to keep frame time steady instead of using the fixed value above.')}
  </div>`;

  html+=`<div class="settings-group">
    <div class="settings-group-title">Particles</div>
    <div class="settings-slider-row">
      <div class="settings-row-label">Particle density <span class="settings-slider-val" id="particleDensityVal">${Math.round(Settings.particleDensity*100)}%</span></div>
      <input type="range" id="rngParticleDensity" min="0.35" max="1.4" step="0.05" value="${Settings.particleDensity}">
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Glow / bloom quality</div><div class="settings-row-sub">Muzzle flashes, projectile glow, core pulse.</div></div>
      <select class="settings-select" id="selGlowQuality">
        <option value="off" ${Settings.glowQuality==='off'?'selected':''}>Off</option>
        <option value="reduced" ${Settings.glowQuality==='reduced'?'selected':''}>Reduced</option>
        <option value="full" ${Settings.glowQuality==='full'?'selected':''}>Full</option>
      </select>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Projectile trail length</div><div class="settings-row-sub">The one deliberate motion-blur streak in the game, so tracking shots stays readable — never removed, just shortened.</div></div>
      <select class="settings-select" id="selTrailLength">
        <option value="short" ${Settings.trailLength==='short'?'selected':''}>Short</option>
        <option value="long" ${Settings.trailLength==='long'?'selected':''}>Long</option>
      </select>
    </div>
    ${SETTINGS_TOGGLE_GROUPS[1].rows.map(r=>settingsRowToggleHtml(...r)).join('')}
  </div>`;

  html+=`<div class="settings-group"><div class="settings-group-title">${SETTINGS_TOGGLE_GROUPS[2].title}</div>${SETTINGS_TOGGLE_GROUPS[2].rows.map(r=>settingsRowToggleHtml(...r)).join('')}</div>`;
  html+=`<div class="settings-group"><div class="settings-group-title">${SETTINGS_TOGGLE_GROUPS[3].title}</div>${SETTINGS_TOGGLE_GROUPS[3].rows.map(r=>settingsRowToggleHtml(...r)).join('')}</div>`;

  html+=`<div class="settings-group">
    <div class="settings-group-title">Controls</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Touch control scheme</div><div class="settings-row-sub">${Settings.controlScheme==='fixed'?'Fixed: both sticks have a permanent base position, and the ability button is locked above the aim stick so it can never get covered.':'Floating: sticks appear wherever you first touch, like before.'}</div></div>
      <div class="settings-scheme-toggle">
        <button class="settings-scheme-btn ${Settings.controlScheme==='floating'?'active':''}" data-scheme="floating">Floating</button>
        <button class="settings-scheme-btn ${Settings.controlScheme==='fixed'?'active':''}" data-scheme="fixed">Fixed</button>
      </div>
    </div>
    ${settingsRowToggleHtml('tracer','Aim tracer','A guide line from your cell out to your weapon\u2019s range, along your current aim.')}
    <div class="settings-row">
      <div><div class="settings-row-label">Tracer style</div></div>
      <select class="settings-select" id="selTracerStyle" ${Settings.tracer?'':'disabled'}>
        <option value="laser" ${Settings.tracerStyle==='laser'?'selected':''}>Laser</option>
        <option value="solid" ${Settings.tracerStyle==='solid'?'selected':''}>Solid</option>
        <option value="dotted" ${Settings.tracerStyle==='dotted'?'selected':''}>Dotted</option>
        <option value="segmented" ${Settings.tracerStyle==='segmented'?'selected':''}>Segmented</option>
        <option value="pulse" ${Settings.tracerStyle==='pulse'?'selected':''}>Pulse</option>
      </select>
    </div>
  </div>`;

  html+=`<div class="settings-group">
    <div class="settings-group-title">Aim Assist</div>
    ${settingsRowToggleHtml('aimAssist','Aim assist',SETTINGS_TOGGLE_GROUPS[4].rows[0][2])}
    <div class="settings-slider-row">
      <div class="settings-row-label">Assist strength <span class="settings-slider-val" id="aimAssistStrengthVal">${Math.round(Settings.aimAssistStrength*100)}%</span></div>
      <input type="range" id="rngAimAssistStrength" min="0" max="1" step="0.05" value="${Settings.aimAssistStrength}" ${Settings.aimAssist?'':'disabled'}>
    </div>
  </div>`;

  body.innerHTML=html;
  wireSettingsControls();
}

function dprLabel(v){
  return{1:'Soft (1x)',1.5:'1.5x',2:'2x (default)',3:'Sharp (native)'}[v]||(v+'x');
}
function settingsPresetBlurb(){
  const blurbs={
    low:'Smallest, softest image and the fewest effects — built to keep frame time steady on weak/hot hardware.',
    medium:'Sharper and busier than Low, but still trims the priciest ambient layers for mid-range devices.',
    high:'Full resolution, full particle budget, ambience and veins on — this is how the game is meant to look.',
    ultra:'Everything High has, plus native pixel density, boosted particle density, and a 120fps cap for high-refresh screens.',
    custom:'Custom mix of settings — pick a preset above to reset to a known-good baseline.',
  };
  return blurbs[Settings.preset]||blurbs.custom;
}

function wireSettingsControls(){
  const body=$('settingsScreenBody');
  if(!body)return;
  body.querySelectorAll('.settings-preset-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{AudioSys.play('ui');applyPreset(btn.dataset.preset);});
  });
  const recBtn=$('btnApplyRecommended');
  if(recBtn)recBtn.addEventListener('click',()=>{AudioSys.play('ui');applyPreset(recBtn.dataset.preset);});
  body.querySelectorAll('.settings-toggle').forEach(t=>{
    t.addEventListener('click',()=>{
      AudioSys.play('ui');
      setSetting(t.dataset.key,!Settings[t.dataset.key]);
    });
  });
  const resSel=$('selResScale');
  if(resSel)resSel.addEventListener('change',()=>setSetting('resScale',parseFloat(resSel.value)));
  const dprSel=$('selDprCap');
  if(dprSel)dprSel.addEventListener('change',()=>setSetting('dprCap',parseFloat(dprSel.value)));
  const fcSel=$('selFrameCap');
  if(fcSel)fcSel.addEventListener('change',()=>setSetting('frameCap',parseInt(fcSel.value,10)));
  const glowSel=$('selGlowQuality');
  if(glowSel)glowSel.addEventListener('change',()=>setSetting('glowQuality',glowSel.value));
  const trailSel=$('selTrailLength');
  if(trailSel)trailSel.addEventListener('change',()=>setSetting('trailLength',trailSel.value));
  body.querySelectorAll('.settings-scheme-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{AudioSys.play('ui');setSetting('controlScheme',btn.dataset.scheme);});
  });
  const tracerSel=$('selTracerStyle');
  if(tracerSel)tracerSel.addEventListener('change',()=>setSetting('tracerStyle',tracerSel.value));
  const pdRange=$('rngParticleDensity');
  if(pdRange){
    // 'input' fires continuously while dragging — update the label + Settings
    // + persist without rebuilding the DOM (skipRender), so the thumb never
    // jumps under the finger/cursor mid-drag. 'change' (on release) does one
    // full re-render so preset buttons/labels catch up to the final value.
    pdRange.addEventListener('input',()=>{
      $('particleDensityVal').textContent=Math.round(pdRange.value*100)+'%';
      setSetting('particleDensity',parseFloat(pdRange.value),true);
    });
    pdRange.addEventListener('change',()=>setSetting('particleDensity',parseFloat(pdRange.value)));
  }
  const aaRange=$('rngAimAssistStrength');
  if(aaRange){
    aaRange.addEventListener('input',()=>{
      $('aimAssistStrengthVal').textContent=Math.round(aaRange.value*100)+'%';
      setSetting('aimAssistStrength',parseFloat(aaRange.value),true);
    });
    aaRange.addEventListener('change',()=>setSetting('aimAssistStrength',parseFloat(aaRange.value)));
  }
}
