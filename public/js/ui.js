/* ============================================================================
   IMMUNE RESPONSE — UI orchestration: screens, lobby, drafts, results, loop
   ========================================================================== */
'use strict';

const DRAFT_KINDS=['squadDraft','personalDraft','evolution'];
const BOT_SEEDS=[['Rho-2','macrophage'],['Kai-9','bcell'],['Iyo-4','nk']];
let hbBeat=0;

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  $('hud').classList.remove('active');
  if(id){
    $(id).classList.remove('hidden');
    App.screen=id.replace('screen','').toLowerCase();
    if(id==='screenSplash')refreshRejoinButton();
  }else{
    $('hud').classList.add('active');
    App.screen='playing';
  }
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
  $('btnConfirmDraft').style.display='';
  $('btnSkipDraft').style.display='';
  if(phase==='squadDraft'){
    title.textContent='SQUAD DRAFT';title.style.color='var(--gold)';
    sub.textContent='One shared upgrade, bought with squad EP.';
    note.innerHTML='Click a card, then <b>Confirm</b>. Whoever confirms buys their highlighted card — bot votes are advice, not law. Skipping buys nothing.';
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
  optIds.forEach((id,idx)=>{
    const meta=draftKind==='squadDraft'?UPG_BY_ID[id]:(draftKind==='personalDraft'?PERK_BY_ID[id]:EVO_BY_ID[id]);
    if(!meta)return;
    const afford=draftKind!=='squadDraft'||ep>=meta.cost;
    const card=document.createElement('div');
    card.className='upgrade-card'+(draftSelId===id?' picked':'')+(afford?'':' disabled');
    card.style.setProperty('--oc',draftKind==='squadDraft'?CAT_COLOR[meta.cat]:CLASSES[App.myClass].color);
    const costHtml=draftKind==='squadDraft'
      ?(afford?`<div class="upgrade-cost">◈${meta.cost}</div>`:`<div class="upgrade-cost cant">NEED ◈${meta.cost}</div>`)
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
    card.innerHTML=`<div class="num-key">${idx+1}</div><div class="upgrade-icon">${meta.icon}</div>`+
      `<div class="upgrade-body"><div class="upgrade-name">${meta.name}</div><div class="upgrade-desc">${meta.desc}${meta.cat?` · <span style="color:${CAT_COLOR[meta.cat]}">${meta.cat}</span>`:''}</div></div>`+
      costHtml+votesHtml;
    card.addEventListener('click',()=>selectDraftOption(id,afford));
    list.appendChild(card);
  });
}
function selectDraftOption(id,afford){
  AudioSys.play('ui');
  if(draftKind==='squadDraft'){
    if(!afford){toast('Not enough EP for that upgrade',true);return;}
    draftSelId=id;
    renderDraftList(currentView&&currentView.votes);
    if(App.mode==='mp'&&!App.isHost)netSend({t:'g',d:{a:'vote',id}});
    else if(SIM&&SIM.draft)SIM.draft.votes[App.myPid]=id;
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
function confirmSquad(){
  if(draftKind!=='squadDraft')return;
  if(draftSelId==null){toast('Pick a card first — or Skip',true);return;}
  AudioSys.play('confirm');
  draftLocalDone=true;
  if(App.isHost&&SIM)confirmSquadDraftHost(App.myPid,draftSelId);
  else netSend({t:'g',d:{a:'confirm',id:draftSelId}});
  closeDraftSoon();
}
function skipSquad(){
  if(draftKind!=='squadDraft')return;
  draftLocalDone=true;
  if(App.isHost&&SIM)confirmSquadDraftHost(App.myPid,null,false);
  else netSend({t:'g',d:{a:'confirm',id:null}});
  closeDraftSoon();
}
function closeDraftSoon(){setTimeout(()=>{
    // Only auto-close if the sim has left draft phases entirely — if the
    // next draft (e.g. personal perks) already began, the modal must stay
    // open and re-render for the new phase instead.
    if(App.screen==='draft'&&currentView&&!DRAFT_KINDS.includes(currentView.phase))showScreen(null);
  },200);}
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
      $('draftKicker').textContent='WAVE '+view.wave+' CLEARED';
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
/* host-side wrapper so UI + network land in one place */
function confirmSquadDraftHost(pid,id){
  if(!SIM||SIM.phase!=='squadDraft'||SIM.draft.confirmedBy)return;
  SIM.draft.confirmedBy=pid!=null?pid:-1;
  if(id&&SIM.ep>=UPG_BY_ID[id].cost){
    SIM.ep-=UPG_BY_ID[id].cost;
    applyUpgrade(id);
    ev({k:'buy',name:UPG_BY_ID[id].name,pid});
  }else if(id){
    ev({k:'say',sys:true,text:`Not enough EP for ${UPG_BY_ID[id].name} — draft skipped`,color:'#ff8ea0'});
  }
  enterPersonalDrafts();
}
function applyGuestAction(pid,d){
  if(!SIM)return;
  if(d.a==='vote'&&SIM.phase==='squadDraft')SIM.draft.votes[pid]=d.id;
  else if(d.a==='confirm'&&SIM.phase==='squadDraft')confirmSquadDraftHost(pid,d.id);
  else if(d.a==='perk'&&SIM.phase==='personalDraft')pickPersonal(pid,d.id);
  else if(d.a==='evo'&&SIM.phase==='evolution')pickEvolution(pid,d.id);
}

/* ---------------------------------------------------------------- results */
function showResults(stats,reason){
  if(App.screen==='results')return; // host event + relay can both arrive
  App.inRun=false;
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
  App.leaving=true; // suppress auto-reconnect — this exit was intentional
  App.inRun=false;App.mode=null;App.isHost=false;SIM=null;
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
