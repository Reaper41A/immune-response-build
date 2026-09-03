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
      sh:Math.round(p._healShield||0),
      bl:p._bloodlustStacks||0,dc:p._dashCritWindow>0?1:0,da:p._dashApexWindow>0?1:0,
      dm:p._dashMomentumStacks||0,ob:p._overhealDmgBuff>0?1:0,fc:p._followupCritWindow>0?1:0,
      iv:p.invuln>0?1:0,hf:p.hitFlash,
    })),
    enemies:s.enemies.map(e=>({
      i:e.id,d:e.defKey,x:e.x,y:e.y,hp:e.hp,hm:e.hpMax,
      el:e.eliteMods||null,tf:e.hitFlash,tb:e.tauntedBy||0,
      mg:e.defKey==='macrophageMimic'?(e.revealed?2:(e.revealT>0?3:1)):0,
      dp:e.disguisePid||0,rg:e.regenShimmer?1:0,cl:e.cloaked?1:0,
      lg:e.lungeT>0?1:0,seg:e.segments?1:0,
      bf:(e._buffed||e._buffPulseT>0)?1:0,
    })),
    projs:s.projectiles.map(p=>({x:p.x,y:p.y,c:p.color,tr:p.trail.map(t=>[t.x,t.y]),sp:p.splash>0?1:0})),
    pickups:s.pickups.map(p=>({x:p.x,y:p.y,l:p.life,w:p.wobble})),
    turrets:s.turrets.map(t=>({x:t.x,y:t.y,r:t.range,corrupted:t.corrupted,hp:t.hp,hpMax:t.hpMax})),
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
    drawBackground(hbBeat);
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
    drawDriftingOrganisms(dtReal);
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
  if(!Settings.autoRes)return; // player picked a fixed resolution — PERF stays hands-off
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

  // Render cap is settings-driven (Low/Med/High = 60fps for a stable GPU
  // budget on modest hardware; Ultra lifts this to 120 for high-refresh
  // displays, since Ultra is explicitly the "device can take it" tier).
  const capMs=1000/(Settings.frameCap||60);
  if(ts-lastRenderTs<capMs)return;
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

/* ---------------------------------------------------------------- boot gate
   Studio-logo screen shown before ANYTHING else, on every entry point. Two
   jobs:
     1) Force one real user gesture up front so AudioSys.init() — which
        WebAudio's autoplay policy requires to run inside a gesture handler —
        fires reliably instead of depending on incidental clicks later, and
     2) Play the Howtzer Games logo assembly (reused from the standalone
        emblem animation) as a proper studio splash.
   `onDone` is called exactly once, after the gate fades out — main.js passes
   it wireUi, so nothing else boots (menus, invite auto-routing, the render
   loop) until this has resolved. */
function runBootGate(onDone){
  const gate=$('bootGate');
  const ring=$('bgRing'),hBarL=$('bgHBarL'),hBarR=$('bgHBarR'),hBarM=$('bgHBarM'),
        diamond=$('bgDiamond'),slash=$('bgSlash'),nodeL=$('bgNodeL'),nodeR=$('bgNodeR'),
        emblem=$('bgEmblem'),glow=$('bootGateGlow'),sceneWrap=$('bootGateSceneWrap'),
        word=$('bootGateWord'),sub=$('bootGateSub'),skip=$('bootGateSkip'),
        promptEl=$('bootGatePrompt');

  let launched=false,done=false;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let bgMaster=null;

  function bgTone({freq=440,dur=.3,type='sine',gain=.15,glideTo=null,delay=0,attack=.01}={}){
    if(!AudioSys.ctx||!bgMaster)return;
    const t0=AudioSys.ctx.currentTime+delay;
    const osc=AudioSys.ctx.createOscillator(),g=AudioSys.ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,t0);
    if(glideTo)osc.frequency.exponentialRampToValueAtTime(glideTo,t0+dur);
    g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(gain,t0+attack);
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    osc.connect(g);g.connect(bgMaster);
    osc.start(t0);osc.stop(t0+dur+.05);
  }
  function bgNoise({dur=.12,gain=.18,delay=0,freq=180}={}){
    if(!AudioSys.ctx||!bgMaster)return;
    const t0=AudioSys.ctx.currentTime+delay;
    const len=Math.max(1,Math.floor(AudioSys.ctx.sampleRate*dur));
    const buf=AudioSys.ctx.createBuffer(1,len,AudioSys.ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const src=AudioSys.ctx.createBufferSource();src.buffer=buf;
    const flt=AudioSys.ctx.createBiquadFilter();flt.type='lowpass';flt.frequency.value=freq;
    const g=AudioSys.ctx.createGain();g.gain.setValueAtTime(gain,t0);
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    src.connect(flt);flt.connect(g);g.connect(bgMaster);
    src.start(t0);
  }

  async function playSequence(){
    await wait(600);

    ring.classList.add('draw');
    bgTone({freq:180,glideTo:520,dur:.9,gain:.11,attack:.15});
    await wait(1250);

    ring.classList.add('gapped');
    bgNoise({dur:.15,gain:.27,freq:900});
    await wait(500);

    hBarL.classList.add('slide');hBarR.classList.add('slide');
    bgNoise({dur:.14,gain:.4,freq:220});bgTone({freq:110,dur:.18,type:'triangle',gain:.18});
    await wait(420);
    hBarM.classList.add('slide');
    await wait(600);

    diamond.classList.add('drop');
    bgNoise({dur:.22,gain:.5,freq:160});bgTone({freq:80,dur:.4,gain:.32,attack:.005});
    await wait(680);

    slash.classList.add('flash');
    bgTone({freq:1400,glideTo:2600,dur:.14,type:'sawtooth',gain:.09});
    await wait(320);

    nodeL.classList.add('pop');nodeR.classList.add('pop');
    bgTone({freq:1200,dur:.12,gain:.14});
    await wait(400);

    emblem.classList.add('punch');
    glow.style.transition='opacity .5s ease';glow.style.opacity='1';
    emblem.classList.add('lit');glow.classList.add('pulse');
    bgTone({freq:220,dur:.6,gain:.29,attack:.01});
    bgTone({freq:330,dur:.6,gain:.18,delay:.02});
    bgTone({freq:440,dur:.7,gain:.14,delay:.04});

    // hold so the assembled mark is properly appreciated — matches the
    // source emblem file's 2400ms hold exactly (this was 1400ms before,
    // which is why the whole sequence felt rushed)
    await wait(2400);

    glow.classList.add('outro'); // no .remove('pulse') in the source — outro's own opacity animation supersedes it
    sceneWrap.classList.add('outro');
    bgTone({freq:500,glideTo:120,dur:.45,gain:.22});
    await wait(600);

    word.classList.add('slam');sub.classList.add('slam');
    bgTone({freq:440,dur:.5,gain:.18});
    bgTone({freq:660,dur:.6,gain:.14,delay:.05});
    bgTone({freq:880,dur:.7,gain:.11,delay:.1});

    // Let the wordmark's own slam (.55s) + subline's delayed rise-in
    // (.3s delay + .5s duration = .8s) fully finish reading before this
    // screen dismisses.
    await wait(900);

    // Gloss sweeps across the wordmark first, then the subline — reads as
    // the light flowing from one line of text down to the next, rather
    // than both lighting up at once.
    word.querySelector('.glossLayer').classList.add('sweep');
    await wait(650);
    sub.querySelector('.glossLayer').classList.add('sweep');
    await wait(900);

    finish();
  }

  function finish(){
    if(done)return;
    done=true;
    gate.classList.add('fading');
    setTimeout(()=>{gate.classList.add('hidden');},1300);
    onDone();
  }

  function launch(){
    if(launched)return;
    launched=true;
    // Runs inside the click handler → satisfies the autoplay-policy user
    // gesture requirement, same as the existing pointerdown/keydown
    // listeners in audio.js, just guaranteed instead of incidental.
    AudioSys.init();
    if(AudioSys.ctx){
      // Dedicated gain node straight to destination — NOT routed through
      // AudioSys.gain (which sits at master 0.5 and reflects the in-game
      // mute toggle). The logo stinger is a one-time studio moment before
      // the player has even reached a mute button, so it gets its own
      // fuller-volume bus instead of inheriting the in-run default.
      bgMaster=AudioSys.ctx.createGain();
      bgMaster.gain.value=0.9;
      bgMaster.connect(AudioSys.ctx.destination);
    }
    // Class-driven fade (not inline styles) so it's a single unambiguous
    // state change — .fadeOut drops opacity AND visibility together, so
    // the button can't visually "stick around" mid-transition or still
    // catch taps while faded.
    promptEl.classList.add('fadeOut');
    skip.classList.add('fadeOut');
    playSequence();
  }

  $('bootGateBtn').addEventListener('click',e=>{e.stopPropagation();launch();});
  gate.addEventListener('click',launch);
  skip.addEventListener('click',e=>{e.stopPropagation();if(launched)finish();});
}

/* ---------------------------------------------------------------- boot */
function saveName(){
  const v=$('nameInput').value.trim().slice(0,14);
  if(v){App.playerName=v;localStorage.setItem('ir_name',v);}
}
let howtoReturn='screenSplash';
let settingsReturn='screenSplash';
function wireUi(){
  cacheHudRefs();
  applyControlScheme(); // apply the player's saved control scheme before the first frame renders

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
  $('btnChangelogFromSplash').addEventListener('click',()=>{openChangelog();});
  $('btnChangelogBack').addEventListener('click',()=>showScreen('screenSplash'));
  $('btnSettingsFromSplash').addEventListener('click',()=>{settingsReturn='screenSplash';openSettings();});
  $('btnSettingsBack').addEventListener('click',()=>showScreen(settingsReturn));
  $('btnChangelogTabVersions').addEventListener('click',()=>showChangelogVersionList());
  $('btnChangelogTabNerfsBuffs').addEventListener('click',()=>showChangelogNerfsBuffs());

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
  $('btnPauseSettings').addEventListener('click',()=>{settingsReturn='screenPause';openSettings();});
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

  $('fullscreenBtn').addEventListener('click',()=>{
    if(isGameFullscreen())exitGameFullscreen();
    else requestGameFullscreen();
  });

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
    if(document.hidden){
      if(App.screen==='playing'&&App.mode==='solo')togglePause();
      return;
    }
    // Tab just came back to the foreground. A backgrounded tab can leave a
    // WebSocket that LOOKS open (readyState===1) but is actually dead —
    // mobile browsers freeze JS timers and network callbacks while hidden,
    // so 'close' never fires until something pokes the socket. If we're
    // supposed to be in a squad (lobby or an active run) but the socket is
    // missing/not OPEN, force a rejoin immediately instead of waiting for
    // the player to notice they're stuck and manually leave/rejoin.
    const inSquadContext=App.mode==='mp'||App.screen==='lobby';
    if(inSquadContext&&loadSquadIdentity()){
      const alive=App.ws&&App.ws.readyState===1;
      if(!alive){requestRejoin(true);}
      else{
        // Socket claims to be open — verify it actually still works by
        // pinging the server and forcing a fresh connection if nothing
        // comes back in time. This catches the zombie-socket case that
        // readyState alone can't detect.
        const pingedAt=Date.now();
        App.visibilityPingSeq=(App.visibilityPingSeq||0)+1;
        const seq=App.visibilityPingSeq;
        try{netSend({t:'hi'});}catch(_){}
        setTimeout(()=>{
          if(App.visibilityPingSeq!==seq)return; // superseded by a newer check
          if(!App.ws||App.ws.readyState!==1||(App.lastServerMsgAt||0)<pingedAt){
            requestRejoin(true);
          }
        },1500);
      }
    }
  });

  buildBestiaryGrid();

  resize();
  refreshChangelogNotifDot();
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

/* Boot gate runs first on every entry point — including #join=CODE invite
   links, which used to call wireUi() (and therefore route straight to the
   connect screen) before any user gesture had happened. Now wireUi() is
   the gate's completion callback, so the tap that dismisses the logo is
   also the tap that satisfies WebAudio's autoplay policy, and the invite
   auto-routing above still runs immediately afterward — the join flow just
   no longer skips the loading/launch step to get there. */
runBootGate(wireUi);
