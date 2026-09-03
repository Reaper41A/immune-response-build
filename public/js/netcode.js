/* ============================================================================
   IMMUNE RESPONSE — netcode
   Host → guests: world snapshots (~15Hz) carrying continuous state plus the
   event stream since the last snap. Guests interpolate positions across a
   140ms buffer so movement stays smooth between packets, and play FX from
   events through the same pipeline the host uses locally.
   Guest → host: input intents (~20Hz) — move vector, fire bool, ability edge.
   ========================================================================== */
'use strict';

function buildSnapshot(){
  const s=SIM;
  return{
    ts:r1(s.time),
    vw:VW,vh:VH, // guests must project the host's frozen arena, not their own
    phase:s.phase,
    // squadDraft has no timer (Infinity) — JSON can't carry that, so guests
    // just get 0/0 and the UI treats squadDraft as timerless regardless.
    phaseLeft:Number.isFinite(s.phaseTimer)?r1(Math.max(0,s.phaseTimer)):0,
    phaseDur:Number.isFinite(s.phaseDur)?s.phaseDur:0,
    wave:s.wave,
    ep:Math.round(s.ep),
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
      x:r1(p.x),y:r1(p.y),hp:Math.round(p.hp),hm:p.hmFix||p.hpMax,col:p.color,
      f:r1(p.facing),a:p.alive?1:0,rs:r1(Math.max(0,p.respawnTimer)),
      am:p.ammo,amx:p.ammoMax,ht:r1(p.heat),oh:p.overheated?1:0,
      ac:r1(Math.max(0,p.abilityCd)),acd:CLASSES[p.cls].ability.cd,
      aa:r1(p.abilityActive),k:p.kills,lg:p.lockId||0,
      sh:Math.round(p._healShield||0),
      bl:p._bloodlustStacks||0,dc:p._dashCritWindow>0?1:0,da:p._dashApexWindow>0?1:0,
      dm:p._dashMomentumStacks||0,ob:p._overhealDmgBuff>0?1:0,fc:p._followupCritWindow>0?1:0,
      iv:p.invuln>0?1:0,hf:r1(p.hitFlash),
    })),
    enemies:s.enemies.map(e=>({
      i:e.id,d:e.defKey,x:r1(e.x),y:r1(e.y),hp:Math.round(e.hp),hm:Math.round(e.hpMax),
      el:e.eliteMods||null,tf:r1(e.hitFlash),tb:e.tauntedBy||0,
      mg:e.defKey==='macrophageMimic'?(e.revealed?2:(e.revealT>0?3:1)):0,
      dp:e.disguisePid||0,rg:e.regenShimmer?1:0,cl:e.cloaked?1:0,
      lg:e.lungeT>0?1:0,seg:e.segments?1:0,
      bf:(e._buffed||e._buffPulseT>0)?1:0,
    })),
    projs:s.projectiles.map(p=>({x:r1(p.x),y:r1(p.y),c:p.color,tr:p.trail.map(t=>[r1(t.x),r1(t.y)]),sp:p.splash>0?1:0})),
    pickups:s.pickups.map(p=>({x:r1(p.x),y:r1(p.y),l:r1(p.life),w:r1(p.wobble)})),
    turrets:s.turrets.map(t=>({x:r1(t.x),y:r1(t.y),r:t.range,corrupted:t.corrupted,hp:t.hp?Math.round(t.hp):0,hpMax:t.hpMax})),
    hazards:s.hazards.map(h=>({x:r1(h.x),y:r1(h.y),r:h.radius,l:r1(h.life)})),
    trails:s.trails.slice(-140).map(t=>({x:r1(t.x),y:r1(t.y),l:r1(t.life),w:t.w})),
    evs:s.flushedEvents||[],
  };
}
function mapDraftOpts(m){
  const out={};
  if(m)for(const k of Object.keys(m))out[k]=m[k].options;
  return out;
}

/* ---------------------------------------------------------------- guest view */
const Guest={
  snaps:[],
  lastSeq:0,
};
function guestReset(){Guest.snaps=[];Guest.lastSeq=0;}
function guestPushSnap(d){
  if(d.vw&&d.vh&&(d.vw!==VW||d.vh!==VH)){VW=d.vw;VH=d.vh;fitWorld();}
  if(d.evs)for(const e of d.evs){
    if(e.seq>Guest.lastSeq){Guest.lastSeq=e.seq;queueEvent(e);}
  }
  Guest.snaps.push({recv:performance.now(),d});
  while(Guest.snaps.length>40)Guest.snaps.shift();
}
/* Interpolated view at now-140ms; scalars always come from the newest snap. */
function guestBuildView(){
  const arr=Guest.snaps;
  if(!arr.length)return null;
  const target=performance.now()-140;
  let a=arr[0],b=arr[arr.length-1];
  for(let i=arr.length-1;i>=0;i--){
    if(arr[i].recv<=target){a=arr[i];b=arr[Math.min(arr.length-1,i+1)];break;}
  }
  const span=b.recv-a.recv;
  const t=span>0?clamp((target-a.recv)/span,0,1):1;
  const da=a.d,db=b.d;
  return{
    phase:db.phase,phaseLeft:db.phaseLeft,phaseDur:db.phaseDur,
    wave:db.wave,ep:db.ep,bodyHp:db.bodyHp,bodyHpMax:db.bodyHpMax,
    organs:db.organs,debuffs:db.debuffs,threats:db.threats,
    squadOptions:db.squadOptions,votes:db.votes,voteLocks:db.voteLocks,
    personalOptions:db.personalOptions,evoOptions:db.evoOptions,
    players:db.players.map(pb=>{
      const pa=da.players.find(x=>x.i===pb.i);
      if(pa)return{...pb,x:lerp(pa.x,pb.x,t),y:lerp(pa.y,pb.y,t)};
      return{...pb};
    }),
    enemies:db.enemies.map(eb=>{
      const ea=da.enemies.find(x=>x.i===eb.i);
      if(ea)return{...eb,x:lerp(ea.x,eb.x,t),y:lerp(ea.y,eb.y,t)};
      return{...eb};
    }),
    projs:db.projs,pickups:db.pickups,turrets:db.turrets,hazards:db.hazards,trails:db.trails,
    boss:null,
  };
}
function findBossInView(view){
  if(!view)return null;
  for(const e of view.enemies){
    if(e.d==='megaVirus'||e.d==='mutatedFungus'||e.d==='parasiteQueen')return e;
  }
  return null;
}

/* ---------------------------------------------------------------- ws client */
let inputTimer=0;
/* Squad identity — remembered so a dropped player (app closed, wifi blip,
   accidental leave) can claw their seat back through the server's grace
   window instead of being locked out of a deployed squad forever. */
function saveSquadIdentity(code,pid,name){
  try{localStorage.setItem('ir_squad',JSON.stringify({code,pid,name}));}catch(_){}
}
function loadSquadIdentity(){
  try{
    const s=JSON.parse(localStorage.getItem('ir_squad'));
    return s&&s.code&&s.pid?s:null;
  }catch(_){return null;}
}
function clearSquadIdentity(){try{localStorage.removeItem('ir_squad');}catch(_){}}
function refreshRejoinButton(){
  const btn=$('btnRejoin');
  if(!btn)return;
  const saved=loadSquadIdentity();
  if(saved&&App.mode!=='mp'){
    btn.classList.remove('hidden');
    btn.textContent='Rejoin Squad '+saved.code+(saved.name?' as '+saved.name:'');
  }else{
    btn.classList.add('hidden');
  }
}
let reconnectTimer=null;
/* Two flavors of auto-reconnect:
   'run'    — socket blip while in a squad (lobby or mid-match)
   'rejoin' — manual Rejoin button pressed but the server isn't reachable yet */
function scheduleReconnect(kind){
  if(App.leaving||App.reconnectTimer)return;
  const isRun=kind!=='rejoin';
  // A squad member can be sitting in the lobby (App.mode isn't 'mp' yet —
  // that's only set once the match actually starts) or mid-run (App.mode
  // ==='mp'). Both need auto-reconnect; only bail if we were never in a
  // squad context at all.
  if(isRun&&App.mode!=='mp'&&App.screen!=='lobby')return;
  App.reconnectAttempts=(App.reconnectAttempts||0)+1;
  const max=isRun?12:6;
  if(App.reconnectAttempts>max){
    toast(isRun?'Lost connection to the squad':'Could not reach the squad server',true);
    App.reconnectAttempts=0;
    if(isRun&&App.inRun)leaveToMenu();
    else{showScreen('screenConnect');setStatus('Disconnected from server.');}
    return;
  }
  const saved=loadSquadIdentity();
  if(!saved&&!isRun){refreshRejoinButton();return;}
  if(isRun&&!saved){ // never joined a room (shouldn't happen) — bail the old way
    if(App.inRun)leaveToMenu();
    return;
  }
  const note='Reconnecting… ('+App.reconnectAttempts+')';
  if(isRun&&App.inRun)callout('Connection lost — '+note,'#ff8ea0',true);
  else setStatus(note);
  const delay=Math.min(500*App.reconnectAttempts,2500);
  App.reconnectTimer=setTimeout(()=>{
    App.reconnectTimer=null;
    if(App.leaving)return;
    if(isRun)requestRejoin(true);
    else requestRejoin(false);
  },delay);
}
function requestRejoin(auto){
  const saved=loadSquadIdentity();
  if(!saved){refreshRejoinButton();return;}
  App.leaving=false;App.reconnectAttempts=0;
  const sendRejoin=()=>{
    App.rejoinPending={code:saved.code,pid:saved.pid};
    netSend({t:'rejoin',code:saved.code,pid:saved.pid});
  };
  // Never trust a stale App.ws here: a backgrounded/suspended tab can leave
  // the socket object reporting readyState===1 (OPEN) long after the
  // underlying TCP connection is dead, because the browser froze the JS
  // that would have fired 'close'. Force a brand-new connection whenever
  // we're explicitly trying to rejoin, so a zombie socket can never block
  // the handshake. connectWS() marks any older ws as superseded.
  if(App.ws){try{App.ws.close();}catch(_){}App.ws=null;}
  connectWS(sendRejoin,!auto);
}
function connectWS(onOpen,retryOnFail){
  const proto=location.protocol==='https:'?'wss':'ws';
  let ws;
  try{ws=new WebSocket(`${proto}://${location.host}`);}
  catch(_){
    if(retryOnFail)scheduleReconnect('rejoin');
    return;
  }
  App.ws=ws;
  ws.onopen=()=>{
    App.connected=true;
    App.reconnectAttempts=0;
    if(onOpen)onOpen();
  };
  ws.onclose=()=>{
    if(App.ws!==ws)return; // a newer connection superseded this one
    App.connected=false;App.ws=null;
    if(App.leaving)return; // intentional exit — stay put
    if(App.mode==='mp'||App.inRun||App.screen==='lobby')scheduleReconnect('run');
    else if(retryOnFail)scheduleReconnect('rejoin');
    else if(App.screen==='connect')setStatus('Disconnected from server.');
  };
  ws.onerror=()=>{};
  ws.onmessage=e=>{
    App.lastServerMsgAt=Date.now();
    let msg=null;
    try{msg=JSON.parse(e.data);}catch(_){return;}
    handleServerMsg(msg);
  };
}
function handleServerMsg(msg){
  switch(msg.t){
    case'welcome':
      App.myPid=msg.pid;
      if(App.rejoinPending){App.rejoinPending=null;App.leaving=false;}
      break;
    case'lobby':
      App.lobbyCode=msg.room.code;
      App.lobbySlots=msg.room.slots;
      App.lobbyPhase=msg.room.phase;
      saveSquadIdentity(msg.room.code,App.myPid,App.playerName);
      renderLobby();
      break;
    case'started':{
      App.roster=msg.roster.map(r=>({
        pid:r.pid,name:r.name,cls:r.cls,human:r.human,
        color:(CLASSES[r.cls]||CLASSES.tcell).color,
      }));
      App.hostPid=msg.hostPid;
      startMultiplayerRun();
      break;
    }
    case'resume':{ // rejoin accepted mid-match (or after the run ended)
      const wasInRun=App.inRun;
      App.roster=msg.roster.map(r=>({
        pid:r.pid,name:r.name,cls:r.cls,human:r.human,
        color:(CLASSES[r.cls]||CLASSES.tcell).color,
      }));
      App.hostPid=msg.hostPid;
      App.mode='mp';
      App.reconnectAttempts=0;App.rejoinPending=null;
      const prevSaved=loadSquadIdentity();
      saveSquadIdentity(msg.code||(prevSaved?prevSaved.code:''),App.myPid,App.playerName);
      if(!wasInRun){
        App.inRun=true;App.paused=false;guestReset();
        beginRunUi();
      }
      callout(wasInRun?'Reconnected — welcome back':'Back in the fight','#3ee8c8',true);
      if(msg.phase==='ended'&&msg.over)showResults(msg.over.stats,msg.over.reason);
      break;
    }
    case'peerBack': // a reconnected squadmate takes their seat back from the AI
      callout((msg.name||'A squadmate')+' rejoined','#8fe36a',true);
      if(SIM){const p=SIM.players.find(pl=>pl.pid===msg.pid);if(p){p.isBot=false;p.human=true;}}
      if(App.roster){const r=App.roster.find(x=>x.pid===msg.pid);if(r)r.human=true;}
      break;
    case'kicked':
      App.leaving=true;
      toast('You were removed from the squad',true);
      AudioSys.play('error');
      leaveToMenu();
      break;
    case'pi':{ // peer input → apply to that player entity (host only)
      if(!SIM)break;
      const p=SIM.players.find(pl=>pl.pid===msg.pid);
      if(p&&p.human&&!p.isBot&&p.pid!==App.myPid){
        p.inMove.x=(msg.mx-64)/64;
        p.inMove.y=(msg.my-64)/64;
        // ax/ay may be absent from an older cached client — default to "no
        // aim" (0,0) rather than unquantizing undefined into (-1,-1).
        p.inAim.x=msg.ax!=null?(msg.ax-64)/64:0;
        p.inAim.y=msg.ay!=null?(msg.ay-64)/64:0;
        p.inFiring=!!msg.f;
        if(msg.a)p.inAbility=true;
        if(msg.sk)p.inSkillEdge=true;
        // Aim assist is per-player (each guest's own Settings), not the
        // host's — default to assist-on at 50% for older cached clients
        // that predate this field, matching DEFAULT_SETTINGS.
        p.inAimAssist=msg.aa!=null?!!msg.aa:true;
        p.inAimAssistStrength=msg.aas!=null?clamp(msg.aas/100,0,1):0.5;
      }
      break;
    }
    case'snap':
      guestPushSnap(msg.d);
      break;
    case'gh': // server-relayed guest draft action (host only)
      if(App.isHost&&SIM)applyGuestAction(msg.pid,msg.d);
      break;
    case'over':
      // host announced results while we were still waiting on snapshots
      showResults(msg.stats,msg.reason);
      break;
    case'youHost':
      App.isHost=true;App.hostPid=App.myPid;
      toast('You are the squad host now');
      hydrateHostFromSnap(); // resume the simulation from our latest snapshot
      break;
    case'hostMigrated':
      App.hostPid=msg.pid;
      callout(msg.name+' is hosting the match now','#ffd166',true);
      break;
    case'peerLeft':
      callout((msg.name||'A squadmate')+' disconnected — AI takes over','#ff8ea0',true);
      if(SIM){const p=SIM.players.find(pl=>pl.pid===msg.pid);if(p){p.isBot=true;p.human=false;}}
      if(!App.isHost&&App.roster){
        const r=App.roster.find(x=>x.pid===msg.pid);
        if(r)r.human=false;
      }
      break;
    case'err':
      setStatus(msg.msg);
      AudioSys.play('error');
      if(msg.fatal){ // seat no longer exists — stop hammering reconnect
        App.leaving=true;
        clearSquadIdentity();
        toast(msg.msg,true);
        App.reconnectAttempts=0;
        if(App.inRun)leaveToMenu();
      }
      break;
    default:break;
  }
}
/* guests stream inputs at ~20Hz; host applies them in simUpdate */
function sendInputsIfGuest(dt){
  if(App.isHost||!App.inRun)return;
  inputTimer-=dt;
  if(inputTimer>0)return;
  inputTimer=0.05;
  const inp=Input;
  netSend({
    t:'i',
    mx:clamp(Math.round(inp.move.x*64)+64,0,128),
    my:clamp(Math.round(inp.move.y*64)+64,0,128),
    ax:clamp(Math.round(inp.aim.x*64)+64,0,128),
    ay:clamp(Math.round(inp.aim.y*64)+64,0,128),
    f:(inp.firing||inp.aiming)?1:0,
    a:inp.abilityEdge?1:0,
    sk:inp.skillEdge?1:0,
    // Aim assist is a per-player preference (Settings tab), so each guest
    // sends its OWN choice rather than the host's — without this, whichever
    // machine happened to be hosting would silently decide aim assist for
    // the entire squad regardless of what a guest picked in their own
    // Settings screen.
    aa:Settings.aimAssist?1:0,
    aas:Math.round(clamp(Settings.aimAssistStrength,0,1)*100),
  });
  inp.abilityEdge=false;
  inp.skillEdge=false;
}
