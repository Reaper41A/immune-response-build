/* ============================================================================
   IMMUNE RESPONSE — simulation core (runs ONLY on the sim host)
   Waves, targeting, combat, enemy AI (incl. the Macrophage Mimic deception
   cycle), pickups and defeat are decided here. The rest of the game learns
   about the world through SNAPSHOTS (flow.js) and EVENTS (fx.js).
   ========================================================================== */
'use strict';

let SIM=null;

function newSim(){
  return{
    time:0,wave:1,
    phase:'wave',            // wave | squadDraft | personalDraft | evolution | over
    phaseTimer:0,phaseDur:0,
    bodyHp:1000,bodyHpMax:1000,
    organs:{heart:100,lungs:100,brain:100},
    debuffs:{heart:false,lungs:false,brain:false},
    ep:0,barrierCharges:0,upgrades:{},
    runStats:{kills:0,leaks:0,wavesCleared:0,perfectWaves:0},
    players:[],enemies:[],projectiles:[],pickups:[],turrets:[],hazards:[],trails:[],
    spawnQueue:[],pendingSpawns:[],
    waveTimer:0,waveActive:false,
    waveStats:{leaked:0,killed:0,spawned:0},
    seenEnemies:{},
    draft:null,personalDrafts:{},evolutions:{},
    evSeq:0,events:[],over:false,trailTick:0,
  };
}
function ev(data){if(SIM){SIM.evSeq++;data.seq=SIM.evSeq;SIM.events.push(data);}}
function disguiseColor(en){
  const t=SIM.players.find(p=>p.pid===en.disguisePid);
  return t?t.color:'#7fd6ff';
}

function makePlayerEntity(pid,name,clsKey,isBot){
  const c=CLASSES[clsKey]||CLASSES.tcell;
  const w=WEAPONS[c.weapon];
  const co=worldCore();
  const idx=SIM.players.length;
  return{
    pid,name,cls:clsKey,isBot,human:!isBot,
    x:co.x+(idx-1.5)*46,y:co.y+90,radius:14,
    hp:c.hp,hpMax:c.hp,color:c.color,speed:c.speed,range:c.range,
    weapon:c.weapon,facing:-Math.PI/2,
    fireCd:0,meleeCd:0,
    ammo:w.ammoMax,ammoMax:w.ammoMax,
    heat:0,overheated:false,overheatTimer:0,
    abilityCd:0,abilityActive:0,invuln:0.8,
    dashVX:0,dashVY:0,
    alive:true,respawnTimer:0,kills:0,
    lockId:null,lockRef:null,
    inMove:{x:0,y:0},inAim:{x:0,y:0},inFiring:false,inAbility:false,inSkillEdge:false,
    wanderA:rand(0,Math.PI*2),
  };
}

function spawnEnemyEntity(defKey,opts={}){
  const isBoss=!!BOSS_DEFS[defKey];
  const def=BOSS_DEFS[defKey]||ENEMY_DEFS[defKey];
  const sp=opts.at||randomSpawnPoint();
  let hp=scaledHp(def.hp,SIM.wave,isBoss)*(opts.hpMult||1);
  let speed=def.speed*(opts.speedMult||1);
  if(defKey==='virus'&&mutFlags(SIM.wave).virusSpeed)speed*=1.2;
  const dmg=scaledDmg(def.dmg,SIM.wave);
  const isElite=!opts.noElite&&!isBoss&&Math.random()<eliteChance(SIM.wave);
  let eliteMods=null;
  if(isElite){
    eliteMods=choice(['armor','speed','shield','regen']);
    if(eliteMods==='armor')hp*=1.8;
    if(eliteMods==='speed')speed*=1.5;
    if(eliteMods==='shield')hp*=1.3;
    if(eliteMods==='regen')hp*=1.2;
  }
  const en={
    id:uid(),defKey,isBoss,name:def.name,
    x:sp.x,y:sp.y,radius:def.radius*(isElite?1.25:1),
    hp,hpMax:hp,speed,dmg,color:def.color,glow:def.glow,
    epVal:def.ep,angle:sp.angle,
    erratic:!!def.erratic,wobble:rand(0,Math.PI*2),
    sporey:!!def.spore,sporeCd:rand(2,4),
    buffAura:!!def.buffAura,reflect:def.reflect||0,
    explodesOnDeath:!!def.explodesOnDeath,
    splits:def.splits||null,regen:def.regen||null,
    pulseCfg:def.pulse||null,pulseT:def.pulse?rand(1,def.pulse.interval):0,
    trailCfg:def.trail||null,trailT:0,
    cloakCfg:def.cloak||null,cloakT:def.cloak?def.cloak.interval:0,cloaked:false,cloakLeft:0,
    isElite,eliteMods,shieldHp:eliteMods==='shield'?hp*0.3:0,
    hitFlash:0,lastHitT:-99,tauntedBy:0,_buffed:false,_buffPulseT:0,
    alive:true,regenShimmer:false,
    segments:defKey==='worm_seg'?makeWormSegments(sp):null,
    matureTimer:defKey==='spore'?rand(4,7):0,
    disguisePid:0,revealed:false,revealT:0,lungeT:0,lungeA:0,
    fakeCd:rand(0.4,0.9),shimmerT:rand(0,3),
  };
  if(defKey==='macrophageMimic'){
    // Ratified design: impersonate a squad member PRESENT IN THIS RUN.
    const candidates=SIM.players.filter(p=>p.alive);
    if(candidates.length)en.disguisePid=choice(candidates).pid;
  }
  return en;
}
function makeWormSegments(sp){
  const segs=[];for(let i=0;i<5;i++)segs.push({x:sp.x,y:sp.y});
  return segs;
}

/* ---------------------------------------------------------------- targeting
   Phase2 targetingSystem.js semantics: edge-distance range check, nearest
   wins with ties broken by lowest current HP, sticky lock until death or
   out-of-range with same-call re-acquire, and structurally NO aim parameter
   — movement can never influence what gets shot. */
function edgeDistance(px,py,en){return Math.max(0,dist(px,py,en.x,en.y)-(en.radius||0));}
function isInRange(px,py,en,range){return en.alive&&edgeDistance(px,py,en)<=range;}
function findBestTargetInRange(px,py,enemies,range){
  let best=null,bestDist=Infinity,bestHp=Infinity;
  for(const en of enemies){
    if(!en.alive)continue;
    const d=edgeDistance(px,py,en);
    if(d>range)continue;
    if(d<bestDist-1e-9||(Math.abs(d-bestDist)<=1e-9&&en.hp<bestHp)){best=en;bestDist=d;bestHp=en.hp;}
  }
  return best;
}
function acquireOrRetainTarget(state,player,enemies,firing){
  if(state.lockId!=null){
    const cur=enemies.find(e=>e.id===state.lockId);
    if(cur&&isInRange(player.x,player.y,cur,player.range)){state.lockRef=cur;return cur;}
    state.lockId=null;state.lockRef=null;
  }
  if(!firing)return null;
  const found=findBestTargetInRange(player.x,player.y,enemies,player.range);
  if(found){state.lockId=found.id;state.lockRef=found;}
  return found;
}
function onFireReleased(state){state.lockId=null;state.lockRef=null;}

/* ---------------------------------------------------------------- combat */
/* _dmgPct/_economyPct/_fireRatePct accumulate the diminishing-returns
   amount from each individual stack (see applyUpgrade/nextStackAmount) —
   they are NOT stackCount*flatAmount, since later stacks are worth less. */
function epMult(){
  let m=1+(SIM.upgrades._economyPct||0)/100;
  if(SIM.upgrades.bloodhoundEP)m*=1; // elite-kill-only bonus applied at the kill site, not here
  return m;
}
function squadDamageMult(shooter){
  let m=1+(SIM.upgrades._dmgPct||0)/100;
  if(SIM.upgrades.apexMetabolism)m*=1.25;
  // BODY buff: full +25% above 60% HP, linear taper, gone below 30%
  const pct=SIM.bodyHpMax>0?SIM.bodyHp/SIM.bodyHpMax:0;
  if(pct>=0.6)m*=1.25;
  else if(pct>0.3)m*=1+0.25*((pct-0.3)/0.3);
  if(SIM.debuffs.brain)m*=0.88;
  const bcell=SIM.players.find(p=>p.cls==='bcell'&&p.alive&&p._teamDmgAura&&p.abilityCd<=0);
  if(bcell)m*=1+bcell._teamDmgAura;
  if(shooter&&shooter._overdriveDmg)m*=1.2;
  if(shooter&&shooter._overhealDmgBuff>0)m*=1.15;
  return m;
}
function updateAmmoHeat(sh,dt){
  const w=WEAPONS[sh.weapon];
  const od=sh.abilityActive>0&&CLASSES[sh.cls].ability.key==='overdrive';
  if(sh.overheated){
    sh.overheatTimer-=dt;
    sh.heat=Math.max(0,sh.heat-w.heatDecay*dt*1.5);
    if(sh.overheatTimer<=0)sh.overheated=false;
  }else if(!od&&!sh.inFiring){
    sh.heat=Math.max(0,sh.heat-w.heatDecay*dt);
  }
}
function canFire(sh){return !sh.overheated&&sh.ammo>0;}
