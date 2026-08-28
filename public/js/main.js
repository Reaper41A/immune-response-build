/* ============================================================================
   IMMUNE RESPONSE — main loop, host view assembly, boot & wiring
   ========================================================================== */
'use strict';

/* ------------------------------------------------ host view assembly
   The host renders its own SIM through the exact same VIEW shape guests get
   from snapshots — one renderer, zero divergence. */
function buildHostView(){
  const s=SIM;
  return{
    phase:s.phase,phaseLeft:s.phaseTimer,phaseDur:s.phaseDur,
    wave:s.wave,ep:Math.round(s.ep),
    bodyHp:Math.round(s.bodyHp),bodyHpMax:s.bodyHpMax,
    organs:s.organs,debuffs:s.debuffs,
    threats:s.spawnQueue.length+s.pendingSpawns.length+s.enemies.length,
    squadOptions:s.draft?s.draft.options:null,
    votes:s.draft?s.draft.votes:null,
    voteLocks:s.draft?s.draft.locked:null,
    personalOptions:mapDraftOpts(s.personalDrafts),
    evoOptions:mapDraftOpts(s.evolutions),
    players:s.players.map(p=>({
      i:p.pid,n:p.name,c:p.cls,h:p.human?1:0,
      x:p.x,y:p.y,hp:p.hp,hm:p.hpMax,col:p.color,f:p.facing,
      a:p.alive?1:0,rs:Math.max(0,p.respawnTimer),
      am:p.ammo,amx:p.ammoMax,ht:r1(p.heat),oh:p.overheated?1:0,
      ac:Math.max(0,p.abilityCd),acd:CLASSES[p.cls].ability.cd,
      aa:p.abilityActive,k:p.kills,lg:p.lockId||0,
    })),
    enemies:s.enemies.map(e=>({
      i:e.id,d:e.defKey,x:e.x,y:e.y,hp:e.hp,hm:e.hpMax,
      el:e.eliteMods||null,tf:e.hitFlash,tb:e.tauntedBy||0,
      mg:e.defKey==='macrophageMimic'?(e.revealed?2:(e.revealT>0?3:1)):0,
      dp:e.disguisePid||0,rg:e.regenShimmer?1:0,cl:e.cloaked?1:0,
      lg:e.lungeT>0?1:0,seg:e.segments?1:0,
    })),
    projs:s.projectiles.map(p=>({x:p.x,y:p.y,c:p.color,tr:p.trail.map(t=>[t.x,t.y]),sp:p.splash>0?1:0})),
    pickups:s.pickups.map(p=>({x:p.x,y:p.y,l:p.life,w:p.wobble})),
    turrets:s.turrets.map(t=>({x:t.x,y:t.y,r:t.range})),
    hazards:s.hazards.map(h=>({x:h.x,y:h.y,r:h.radius,l:h.life})),
    trails:s.trails.slice(COMPACT?-100:-200),
    boss:null,
  };
}

const wormHist=new Map();
/* Host migration: a promoted guest rebuilds an approximate SIM from the most
   recent snapshot it holds. Upgrades/perks can't be recovered from snapshots
   (documented trade-off) — the fight itself continues seamlessly. */
function hydrateHostFromSnap(){
  if(!Guest.snaps.length)return;
  const d=Guest.snaps[Guest.snaps.length-1].d;
  if(d.vw&&d.vh){VW=d.vw;VH=d.vh;fitWorld();} // resume in the OLD host's arena
  else initWorld(); // promoted host freezes its own arena before resuming the sim
  SIM=newSim();
  SIM.wave=d.wave;
  SIM.bodyHp=d.bodyHp;SIM.bodyHpMax=d.bodyHpMax;
  SIM.organs={...d.organs};SIM.debuffs={...d.debuffs};
  SIM.ep=d.ep;
  for(const rp of d.players){
    // roster is kept live by peerLeft/peerBack — trust it over the possibly
    // stale snapshot flag so abandoned seats don't hydrate as inputless humans
    const rr=(App.roster||[]).find(x=>x.pid===rp.i);
    const human=rr?!!rr.human:!!rp.h;
    const p=makePlayerEntity(rp.i,rp.n,rp.c,!human);
    p.x=rp.x;p.y=rp.y;p.hp=rp.hp;p.hpMax=rp.hm;p.ammo=rp.am;p.ammoMax=rp.amx;
    p.heat=rp.ht;p.overheated=!!rp.oh;p.alive=!!p.a||!!rp.a;p.respawnTimer=rp.rs;
    p.abilityCd=rp.ac;p.abilityActive=rp.aa;p.kills=rp.k;
    if(!rp.a)p.alive=false;
    SIM.players.push(p);
  }
  for(const re of d.enemies){
    const en=spawnEnemyEntity(re.d,{noElite:true,at:{x:re.x,y:re.y,angle:0}});
    en.id=re.i;en.x=re.x;en.y=re.y;en.hp=Math.max(1,re.hp);en.hpMax=re.hm;
    en.eliteMods=re.el||null;en.disguisePid=re.dp||0;
    if(re.d==='macrophageMimic'){en.revealed=re.mg===2;if(en.revealed)en.color=ENEMY_DEFS[re.d].color;}
    SIM.enemies.push(en);
  }
  for(const tp of d.turrets)SIM.turrets.push({x:tp.x,y:tp.y,cd:0,range:tp.r});
  for(const hp of d.hazards)SIM.hazards.push({x:hp.x,y:hp.y,radius:hp.r,life:Math.max(0.3,hp.l),maxLife:1.8,dps:14,tickCd:0});
  // resume cleanly into combat with whatever is still alive on the field
  SIM.phase='wave';SIM.waveActive=true;
  SIM.spawnQueue=[];SIM.pendingSpawns=[];
  ev({k:'say',sys:true,text:'Squad host migrated — simulation resumed here',color:'#ffd166'});
}

function finalizeView(view){
  if(!view)return;
  if(!view.boss)view.boss=findBossInView(view);
  view.lockOf={};
  for(const p of view.players)if(p.lg)view.lockOf[p.i]=p.lg;
  for(const p of view.players)p.rangeCache=clsRange(p);
  view.fireRingPid=Input.firing?App.myPid:0;
  const seen=new Set();
  for(const en of view.enemies){
    if(en.d==='worm_seg'){
      seen.add(en.i);
      let arr=wormHist.get(en.i);
      if(!arr){arr=[];wormHist.set(en.i,arr);}
      arr.unshift({x:en.x,y:en.y});
      if(arr.length>7)arr.length=7;
      en.wseg=arr;
    }
  }
  for(const id of [...wormHist.keys()])if(!seen.has(id))wormHist.delete(id);
}

/* ---------------------------------------------------------------- render */
function render(view,dtReal){
  // bullet-proof frame reset: an error mid-draw must never leak canvas state
  // (a leaked globalAlpha makes every later clear semi-transparent = ghost trails)
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha=1;
  ctx.globalCompositeOperation='source-over';
  ctx.shadowBlur=0;ctx.shadowColor='rgba(0,0,0,0)';
  ctx.setLineDash([]);
  ctx.fillStyle='#05080f';           // opaque fill overwrites every pixel (no clearRect needed)
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(DPR*RES,0,0,DPR*RES,0,0);
  ctx.save();
  try{
    // hard-clip everything to the world rectangle: entities beyond the arena
    // (spawns walking in, knockback drift) can never smear into the bars
    ctx.beginPath();
    ctx.rect(vOffX,vOffY,VW*vScale,VH*vScale);
    ctx.clip();
    ctx.translate(vOffX,vOffY);
    ctx.scale(vScale,vScale);
    if(FX.shake>0.2&&!REDUCED)ctx.translate(rand(-1,1)*FX.shake*0.4,rand(-1,1)*FX.shake*0.4);
    drawBackground();
    if(view){
      drawTrails(view);
      drawPerimeter();
      drawCore(view,hbBeat);
      drawTurrets(view);
      drawHazards(view);
      drawWarns();
      drawPickups(view);
      drawEnemies(view);
      drawProjectiles(view);
      drawFakeTraces();
      drawPlayers(view,view.fireRingPid);
    }else{
      drawPerimeter();
      drawCore({bodyHp:1000,bodyHpMax:1000},hbBeat);
    }
    drawParticles();
    drawMotes();
    drawPopups();
    if(view)drawEdgeArrows(view);
  }finally{
    ctx.restore();
    ctx.globalAlpha=1;
    ctx.globalCompositeOperation='source-over';
    ctx.shadowBlur=0;
  }
  FX.shake=Math.max(0,FX.shake-dtReal*40);
}

/* ---------------------------------------------------------------- loop */
let lastTs=0,simAcc=0,snapTimer=0,hbT=0;
let lastRenderTs=0;
/* Adaptive resolution: sustained slow frames step the backing-store scale
   down (less GPU fill rate = less heat), sustained fast frames step it back
   up. Bounded 0.6–1.0, re-evaluates at most every ~1.5s of rendered frames. */
const PERF={ema:16.7,cool:0,last:0};
function trackPerf(ts){
  if(!PERF.last){PERF.last=ts;return;}
  const d=ts-PERF.last;PERF.last=ts;
  if(d<=0||d>60)return; // ignore tab-switch / stall spikes
  PERF.ema=PERF.ema*0.9+d*0.1;
  if(PERF.cool>0){PERF.cool--;return;}
  if(PERF.ema>21.5&&RES>0.6)setRes(RES-0.15);
  else if(PERF.ema<17.3&&RES<1)setRes(RES+0.15);
}
function setRes(v){
  RES=Math.max(0.6,Math.min(1,Math.round(v*100)/100));
  PERF.cool=90;PERF.ema=16.7;
  resize();
}
function loop(ts){
  requestAnimationFrame(loop);
  if(!lastTs)lastTs=ts;
  let dt=(ts-lastTs)/1000;
  lastTs=ts;
  dt=clamp(dt,0,0.08);

  // host sim + snapshots tick every rAF (cheap, fixed-step)…
  if(App.inRun&&App.isHost&&SIM&&!App.paused&&!SIM.over){
    simAcc+=dt;
    const step=1/60;
    let guard=0;
    while(simAcc>=step&&guard<6){simUpdate(step);simAcc-=step;guard++;}
    if(SIM)hbT+=dt*(1.4+(1-clamp(SIM.bodyHp/SIM.bodyHpMax,0,1))*1.8);
    if(App.mode==='mp'){
      snapTimer-=dt;
      if(snapTimer<=0){snapTimer=1/15;netSend({t:'snap',d:buildSnapshot()});}
    }
  }
  sendInputsIfGuest(dt);

  // …but rendering is capped at ~60fps: on 120Hz phones this halves the
  // GPU work (and the heat) with zero visual difference at this art scale
  if(ts-lastRenderTs<15.4)return;
  lastRenderTs=ts;

  if(App.inRun&&App.paused){ // pause overlay covers the canvas — skip entirely
    evQueue.length=0; // drop queued FX/sounds so resume doesn't replay a burst
    return;
  }

  currentView=null;
  if(App.inRun){
    if(App.isHost&&SIM){
      currentView=buildHostView();
    }else if(!App.isHost){
      currentView=guestBuildView();
      if(currentView)hbT+=dt*2;
    }
    if(currentView){
      hbBeat=Math.pow(Math.abs(Math.sin(hbT*Math.PI)),3);
      finalizeView(currentView);
      drainQueue();
      updateFx(dt);
      render(currentView,dt);
      updateHud(currentView,dt);
      tutorialTriggers(currentView,dt);
      syncDraftScreens(currentView);
    }
  }else{
    hbT+=dt*1.4;
    hbBeat=Math.pow(Math.abs(Math.sin(hbT*Math.PI)),3);
    updateFx(dt);
    render(null,dt);
  }
  trackPerf(ts);
}

/* ---------------------------------------------------------------- boot */
function saveName(){
  const v=$('nameInput').value.trim().slice(0,14);
  if(v){App.playerName=v;localStorage.setItem('ir_name',v);}
}
let howtoReturn='screenSplash';
function wireUi(){
  cacheHudRefs();

  $('btnSolo').addEventListener('click',()=>{AudioSys.play('ui');showScreen('screenSoloSelect');});
  function buildSoloGrid(){
    buildClassGrid($('soloClassGrid'),k=>{
      App.myClass=k;localStorage.setItem('ir_class',k);buildSoloGrid();
    });
  }
  buildSoloGrid();
  $('btnMultiplayer').addEventListener('click',()=>{
    AudioSys.play('ui');
    $('nameInput').value=App.playerName||'';
    // Invite links carry the squad code in the hash (#join=CODE)
    const m=/^#join=([A-Z0-9]{4})$/i.exec(location.hash||'');
    if(m)$('codeInput').value=m[1].toUpperCase();
    showScreen('screenConnect');
    setStatus(m?'Squad code loaded from invite link':'');
  });
  $('btnHowToFromSplash').addEventListener('click',()=>{howtoReturn='screenSplash';showScreen('screenHowTo');});
  $('btnHowToBack').addEventListener('click',()=>showScreen(howtoReturn));
  $('btnConnectBack').addEventListener('click',()=>showScreen('screenSplash'));

  function ensureConnected(cb){
    App.leaving=false;App.reconnectAttempts=0;
    if(App.ws&&App.ws.readyState===1){cb();return;}
    setStatus('Connecting…');
    connectWS(()=>cb());
  }
  $('btnCreateSquad').addEventListener('click',()=>{
    saveName();
    if(!App.playerName){setStatus('Give your cell a name first.');return;}
    ensureConnected(()=>netSend({t:'create',name:App.playerName}));
  });
  $('btnJoinSquad').addEventListener('click',()=>{
    saveName();
    const code=$('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(code.length!==4){setStatus('Enter the 4-letter squad code.');return;}
    if(!App.playerName){setStatus('Give your cell a name first.');return;}
    ensureConnected(()=>netSend({t:'join',code,name:App.playerName}));
  });
  $('codeInput').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g,'').slice(0,4);});
  $('codeInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('btnJoinSquad').click();});

  $('btnCopyCode').addEventListener('click',()=>{
    const c=$('lobbyCode').textContent;
    if(copyText(c))toast('Code '+c+' copied');
    else toast('Copy blocked — select the code text and copy manually',true);
  });
  $('btnCopyLink').addEventListener('click',()=>{
    const c=$('lobbyCode').textContent;
    const url=location.origin+location.pathname+'#join='+c;
    if(copyText(url))toast('Invite link copied — send it to your squad');
    else toast('Copy blocked — share the code '+c+' instead',true);
  });
  $('btnReady').addEventListener('click',()=>{requestGameFullscreen();netSend({t:'ready'});});
  $('btnLaunch').addEventListener('click',()=>{requestGameFullscreen();netSend({t:'startGame'});});
  $('btnRejoin').addEventListener('click',()=>{
    AudioSys.play('ui');
    requestRejoin();
  });
  wireLobbyKick();
  $('btnLeaveLobby').addEventListener('click',()=>{
    try{if(App.ws)App.ws.close();}catch(_){}
    App.ws=null;showScreen('screenSplash');
  });

  $('btnSoloDeploy').addEventListener('click',()=>{requestGameFullscreen();startSoloRun();});
  $('btnSoloBack').addEventListener('click',()=>showScreen('screenSplash'));

  $('pauseBtn').addEventListener('click',togglePause);
  $('btnResume').addEventListener('click',resumeFromPause);
  $('btnPauseHowTo').addEventListener('click',()=>{howtoReturn='screenPause';showScreen('screenHowTo');});
  $('btnReplayHints').addEventListener('click',resetHints);
  $('btnQuit').addEventListener('click',()=>{
    if(App.mode==='mp')leaveToMenu(); // leaveToMenu() exits fullscreen itself
    else{exitGameFullscreen();App.inRun=false;SIM=null;showScreen('screenSplash');}
  });
  $('btnSkipDraft').addEventListener('click',skipSquadDraft);

  $('btnRetry').addEventListener('click',()=>{
    // Solo retry goes straight back into a run — stay fullscreen, no reason
    // to drop out and immediately re-prompt. MP retry returns the whole
    // squad to the lobby, which is menu-like, so exit there.
    if(App.mode==='mp'){exitGameFullscreen();netSend({t:'toLobby'});toast('Returning squad to lobby…');}
    else startSoloRun();
  });
  $('btnMainMenu2').addEventListener('click',()=>leaveToMenu());

  $('soundBtn').addEventListener('click',()=>{
    AudioSys.init();
    AudioSys.setMuted(!AudioSys.muted);
    $('soundBtn').textContent=AudioSys.muted?'🔇':'🔊';
  });
  $('soundBtn').textContent=AudioSys.muted?'🔇':'🔊';

  window.addEventListener('keydown',e=>{
    if(App.screen==='draft'){
      if(['1','2','3'].includes(e.key)){
        const cards=document.querySelectorAll('#draftList .upgrade-card');
        const card=cards[Number(e.key)-1];
        if(card)card.click();
      }
      // Squad draft no longer has a separate confirm step — picking a card
      // (click or number key) casts the vote immediately.
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&App.screen==='playing'&&App.mode==='solo')togglePause();
  });

  // bestiary
  const bg=$('bestiaryGrid');
  const entries=[...Object.entries(ENEMY_DEFS).filter(([k])=>k!=='spore'),
    ['megaVirus',{name:'Mega Virus',color:'#ff4d6d',tell:'BOSS — every 5th wave.'}],
    ['mutatedFungus',{name:'Mutated Fungus',color:'#6fae5f',tell:'BOSS — every 5th wave.'}],
    ['parasiteQueen',{name:'Parasite Queen',color:'#ff9f5a',tell:'BOSS — every 5th wave.'}]];
  for(const[,d]of entries){
    const el=document.createElement('div');
    el.className='beast';
    el.innerHTML=`<div class="beast-swatch" style="color:${d.color}"></div>`+
      `<div><div class="beast-name">${d.name}</div><div class="beast-desc">${d.tell}</div></div>`;
    bg.appendChild(el);
  }

  resize();
  showScreen('screenSplash');
  // Invite links (#join=CODE) skip the menu entirely: land straight on the
  // connect screen with the code filled in — one name + one tap to join.
  const invite=/^#join=([A-Z0-9]{4})$/i.exec(location.hash||'');
  if(invite){
    App.playerName=App.playerName||'';
    $('nameInput').value=App.playerName;
    $('codeInput').value=invite[1].toUpperCase();
    showScreen('screenConnect');
    setStatus('Invite loaded — enter your name, then tap Join');
    $('nameInput').focus();
  }
  requestAnimationFrame(loop);
}
wireUi();
