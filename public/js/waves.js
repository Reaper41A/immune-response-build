/* ============================================================================
   IMMUNE RESPONSE — waves, leaks, organs, host-side draft flow
   ========================================================================== */
'use strict';

/* Spawn planning: budget curve + roster unlocks are kept verbatim from
   wave-config.json ("keep the existing roster-unlock and spawn-budget
   systems entirely — they're sound"). Bosses every 5th wave. */
function planWave(waveNum){
  const q=[];
  // Wave 1 is a special case: the standard 40+n*14 curve gives it a ~72 EP
  // ceiling even on a flawless clear (18 bacteria @ 4 EP each), but the
  // cheapest squad upgrade costs 80 — so the very first squad draft was
  // guaranteed to be unaffordable no matter how well the squad played.
  // Bumping wave 1's budget alone (not the curve) fixes that without
  // touching wave 2+ pacing.
  const budget=waveNum===1?78:40+waveNum*14;
  let spent=0;
  const flags=mutFlags(waveNum);
  const roster=ROSTER.filter(([k,w])=>waveNum>=w).map(([k])=>k);
  if(flags.parasitesAppear)roster.push('parasite');
  const preliminary=[];
  while(spent<budget){
    const key=choice(roster);
    const cost=SPAWN_COST[key];
    if(spent+cost>budget+10)break;
    spent+=cost;
    preliminary.push(key);
  }
  // Cap how long the trickle can stretch — more enemies = tighter gaps.
  const maxWindow=16;
  const gap=preliminary.length?Math.min(0.75,maxWindow/preliminary.length):0.5;
  preliminary.forEach((key,i)=>{
    const d=i*gap*rand(0.7,1.3);
    q.push({
      key,delay:d,
      warnDelay:Math.max(0.05,d-0.9),
      pack:key==='bacteria'&&flags.bacteriaPacks&&Math.random()<0.5,
      isBoss:false,at:null,spawnAt:0,
    });
  });
  if(waveNum%5===0){
    const bossKey=choice(['megaVirus','mutatedFungus','parasiteQueen']);
    const last=q.length?q[q.length-1].delay:0;
    const bd=Math.min(last*0.5+3,maxWindow*0.6);
    q.push({key:bossKey,delay:bd,warnDelay:Math.max(0.05,bd-1.3),isBoss:true,pack:false,at:null,spawnAt:0});
  }
  q.sort((a,b)=>a.delay-b.delay);
  return q;
}
function startWave(){
  SIM.waveActive=true;
  SIM.spawnQueue=planWave(SIM.wave);
  SIM.pendingSpawns=[];
  // Small negative lead-in: the draft screen has just closed, so give the
  // squad a breath to reposition before the first telegraph appears instead
  // of enemies queuing up the instant the screen disappears.
  SIM.waveTimer=-1.4;
  SIM.waveStats={leaked:0,killed:0,spawned:SIM.spawnQueue.length};
  for(const p of SIM.players){p.ammo=p.ammoMax;p.heat=0;p.overheated=false;p.overheatTimer=0;}
  // "New pathogen" education: banner names a type's first-ever appearance.
  const nowKeys=ROSTER.filter(([k,w])=>SIM.wave>=w).map(([k])=>k);
  const prevKeys=new Set(ROSTER.filter(([k,w])=>SIM.wave>w).map(([k])=>k));
  let newType=null;
  for(const k of nowKeys){if(!prevKeys.has(k)&&!SIM.seenEnemies[k]){newType=k;break;}}
  if(mutFlags(SIM.wave).parasitesAppear&&!SIM.seenEnemies.parasite)newType='parasite';
  for(const k of nowKeys)SIM.seenEnemies[k]=true;
  if(newType)SIM.seenEnemies[newType]=true;
  ev({k:'wave',n:SIM.wave,count:SIM.spawnQueue.length,newType});
}

/* Leak → shared Body HP damage + random organ chip; an organ at zero applies
   a permanent, explicitly-announced squad debuff (all three wired & shown). */
function applyLeak(en){
  let dmg=en.dmg;
  if(SIM.barrierCharges>0){dmg*=0.7;SIM.barrierCharges--;}
  SIM.bodyHp=Math.max(0,SIM.bodyHp-dmg);
  SIM.runStats.leaks++;
  SIM.waveStats.leaked++;
  const c=worldCore();
  ev({k:'leak',x:c.x,y:c.y-coreRadius(),dmg:Math.round(dmg),fromAngle:angleTo(c.x,c.y,en.x,en.y)});
  maybeDamageOrgan();
}
function maybeDamageOrgan(){
  const k=choice(Object.keys(SIM.organs));
  if(SIM.organs[k]>0){
    SIM.organs[k]=Math.max(0,SIM.organs[k]-randi(8,16));
    ev({k:'organ',key:k});
    if(SIM.organs[k]<=0&&!SIM.debuffs[k]){
      SIM.debuffs[k]=true;
      const msgs={
        heart:'Heart failing — squad move speed -15%',
        lungs:'Lungs scarred — ability cooldowns +25%',
        brain:'Brain swelling — squad damage -12%',
      };
      ev({k:'say',sys:true,text:msgs[k],color:'#ff4d6d'});
      if(k==='heart')for(const p of SIM.players)p.speed*=0.85;
    }
  }
}

/* ---------------------------------------------------------------- drafts */
function enterSquadDraft(){
  SIM.phase='squadDraft';
  const pool=[...UPGRADE_POOL.map(u=>u.id)];
  const opts=[];
  while(opts.length<3&&pool.length)opts.push(pool.splice(randi(0,pool.length-1),1)[0]);
  // Guarantee the squad can always afford at least the cheapest of the three
  // offered cards. Early waves (esp. wave 1) can't realistically earn enough
  // kill EP to afford anything — the draft would silently resolve to
  // "nothing affordable" every single time, which read as a dead/broken
  // screen. This tops EP up to the floor needed, never lowers it.
  const cheapest=Math.min(...opts.map(id=>scaledCost(UPG_BY_ID[id],SIM.wave)));
  if(SIM.ep<cheapest){
    const shortfall=cheapest-SIM.ep;
    SIM.ep=cheapest;
    ev({k:'say',sys:true,text:`Squad short on EP this wave — topped up +${shortfall} so a pick is always affordable`,color:'#ffd166'});
  }
  // Squad draft is a group decision: everyone selects, nobody can close it
  // alone. No countdown either — the screen waits as long as it takes for
  // every human to lock in a choice (or explicitly abstain).
  SIM.draft={options:opts,votes:{},locked:{}};
  SIM.phaseTimer=Infinity;SIM.phaseDur=Infinity;
  ev({k:'phase',phase:'squadDraft'});
  for(const p of SIM.players){
    if(!p.isBot)continue;
    setTimeout(()=>{
      if(!SIM||SIM.over||SIM.phase!=='squadDraft')return;
      let pick;
      if(SIM.bodyHp<SIM.bodyHpMax*0.4)pick=SIM.draft.options.find(id=>UPG_BY_ID[id].cat==='survival')||choice(SIM.draft.options);
      else pick=choice(SIM.draft.options);
      SIM.draft.votes[p.pid]=pick;
      SIM.draft.locked[p.pid]=true;
      ev({k:'say',who:p.name,text:`Voting ${UPG_BY_ID[pick].name}`,color:p.color});
    },rand(700,2600));
  }
}
function topVotedAffordable(){
  const tally={};
  for(const v of Object.values(SIM.draft.votes)){
    if(v==='skip')continue; // skip votes don't compete for a card
    tally[v]=(tally[v]||0)+1;
  }
  let best=null,bn=0;
  for(const[id,n]of Object.entries(tally)){
    if(SIM.ep>=scaledCost(UPG_BY_ID[id],SIM.wave)&&n>bn){best=id;bn=n;}
  }
  return best;
}
/* A player selects/changes their vote — this is not a confirm, just a pick.
   The draft only resolves once every human has locked one in (see
   allHumansVotedSquad + resolveSquadDraft, ticked from simUpdate). A vote
   of 'skip' means "I'd rather not spend EP this round" and never competes
   for a card, but still counts toward everyone-has-voted. */
function voteSquad(pid,id){
  if(!SIM||SIM.over||SIM.phase!=='squadDraft')return;
  SIM.draft.votes[pid]=id;
  SIM.draft.locked[pid]=true;
}
function allHumansVotedSquad(){
  for(const p of SIM.players){if(p.human&&!SIM.draft.locked[p.pid])return false;}
  return true;
}
/* Resolves the group's shared pick once everyone has voted. No single
   player's action can force this early or skip it for the rest of the squad.
   If every human voted skip, or nothing affordable got the most votes, no
   upgrade is bought and EP carries over to the next draft. */
function resolveSquadDraft(){
  const id=topVotedAffordable();
  const opt=id?UPG_BY_ID[id]:null;
  if(opt){
    const cost=scaledCost(opt,SIM.wave);
    if(SIM.ep>=cost){
      SIM.ep-=cost;
      applyUpgrade(opt.id);
      ev({k:'buy',name:opt.name,pid:-1});
    }else{
      ev({k:'say',sys:true,text:`Not enough EP for ${opt.name} — draft skipped`,color:'#ff8ea0'});
    }
  }else{
    ev({k:'say',sys:true,text:'Squad skipped this pick',color:'#7fd6ff'});
  }
  enterPersonalDrafts();
}
function applyUpgrade(id){
  switch(id){
    case'healBody':SIM.bodyHp=Math.min(SIM.bodyHpMax,SIM.bodyHp+200);break;
    case'bodyMax':SIM.bodyHpMax+=150;SIM.bodyHp+=150;break;
    case'damage':SIM.upgrades.damage=(SIM.upgrades.damage||0)+1;break;
    case'fireRate':SIM.upgrades.fireRate=(SIM.upgrades.fireRate||0)+1;break;
    case'economy':SIM.upgrades.economy=(SIM.upgrades.economy||0)+1;break;
    case'moveSpeed':for(const p of SIM.players)p.speed*=1.1;break;
    case'turret':
      if(SIM.turrets.length<4){
        const c=worldCore(),a=rand(0,Math.PI*2);
        SIM.turrets.push({x:c.x+Math.cos(a)*170,y:c.y+Math.sin(a)*170,cd:0,range:220});
      }else{
        SIM.ep+=scaledCost(UPG_BY_ID[id],SIM.wave);
        ev({k:'say',sys:true,text:'Turret limit reached (4) — EP refunded',color:'#ffd166'});
      }
      break;
    case'barrier':SIM.barrierCharges++;break;
    case'organRepair':repairWorstOrgan();break;
  }
}
function repairWorstOrgan(){
  let worst=null,worstV=Infinity;
  for(const k in SIM.organs)if(SIM.organs[k]<worstV){worstV=SIM.organs[k];worst=k;}
  if(worst){SIM.organs[worst]=100;SIM.debuffs[worst]=false;ev({k:'organ',key:worst});}
}
function enterPersonalDrafts(){
  SIM.phase='personalDraft';
  SIM.personalDrafts={};
  for(const p of SIM.players){
    const pool=PERSONAL_PERK_POOL.filter(o=>!o.cls||o.cls===p.cls).map(o=>o.id);
    const opts=[];
    while(opts.length<3&&pool.length)opts.push(pool.splice(randi(0,pool.length-1),1)[0]);
    SIM.personalDrafts[p.pid]={options:opts,picked:null};
  }
  SIM.phaseTimer=DRAFT_DURATIONS.personal;SIM.phaseDur=DRAFT_DURATIONS.personal;
  ev({k:'phase',phase:'personalDraft'});
}
function pickPersonal(pid,id){const d=SIM.personalDrafts[pid];if(d&&!d.picked)d.picked=id;}
function enterEvolutions(){
  SIM.phase='evolution';
  SIM.evolutions={};
  for(const p of SIM.players){
    const abKey=CLASSES[p.cls].ability.key;
    const pool=(CLASS_EVOLUTIONS[abKey]||[]).map(e=>e.id);
    const opts=[];
    while(opts.length<3&&pool.length)opts.push(pool.splice(randi(0,pool.length-1),1)[0]);
    SIM.evolutions[p.pid]={options:opts,picked:null};
  }
  SIM.phaseTimer=DRAFT_DURATIONS.evolution;SIM.phaseDur=DRAFT_DURATIONS.evolution;
  ev({k:'phase',phase:'evolution'});
}
function pickEvolution(pid,id){const d=SIM.evolutions[pid];if(d&&!d.picked)d.picked=id;}
function allHumansPicked(map){
  for(const p of SIM.players){if(p.human&&(!map[p.pid]||!map[p.pid].picked))return false;}
  return true;
}
function finishPersonalDrafts(timedOut){
  for(const p of SIM.players){
    const d=SIM.personalDrafts[p.pid];
    if(d&&d.picked)applyPerk(p,d.picked);
  }
  if(timedOut)ev({k:'say',sys:true,text:'Perk draft timed out — unpicked slots skipped',color:'#93a9b4'});
  if(SIM.wave%EVOLUTION_INTERVAL===0)enterEvolutions();
  else nextWave();
}
function finishEvolutions(timedOut){
  for(const p of SIM.players){
    const d=SIM.evolutions[p.pid];
    if(d&&d.picked){
      const opt=EVO_BY_ID[d.picked];
      applyEvolution(p,opt.id);
      ev({k:'evolve',name:opt.name,pid:p.pid,ability:CLASSES[p.cls].ability.name});
    }
  }
  if(timedOut)ev({k:'say',sys:true,text:'Evolution timed out — unpicked slots skipped',color:'#93a9b4'});
  nextWave();
}
function nextWave(){SIM.wave++;SIM.phase='wave';startWave();}
function applyPerk(p,id){
  switch(id){
    case'p_ammoMax':p.ammoMax=Math.round(p.ammoMax*1.25);p.ammo=p.ammoMax;break;
    case'p_heatEff':p._heatMod=(p._heatMod||1)*0.8;break;
    case'p_abilityCd':p._cdMult=(p._cdMult||1)*0.8;break;
    case'p_speed':p.speed*=1.12;break;
    case'p_hp':p.hpMax+=20;p.hp+=20;break;
    case'p_pickupRange':p._pickupBonus=(p._pickupBonus||0)+14;break;
    case'p_pierce':p._pierceBonus=(p._pierceBonus||0)+1;break;
    case'p_bounce':p._bounceBonus=(p._bounceBonus||0)+2;break;
    case'p_dmg_nk':p._critBonus=(p._critBonus||0)+0.15;break;
    case'p_dmg_macrophage':p._splashMult=(p._splashMult||1)*1.4;break;
    case'p_dmg_tcell':p._pierceDmg=(p._pierceDmg||1)*1.18;break;
    case'p_dmg_bcell':p._teamDmgAura=(p._teamDmgAura||0)+0.1;break;
  }
  ev({k:'perk',name:PERK_BY_ID[id].name,pid:p.pid});
}
function applyEvolution(p,id){
  switch(id){
    case'ev_taunt_dur':p._durBonus=(p._durBonus||0)+1.5;break;
    case'ev_od_dur':p._durBonus=(p._durBonus||0)+1.5;break;
    case'ev_dash_dur':p._durBonus=(p._durBonus||0)+0.2;break;
    case'ev_heal_amt':p._healMult=(p._healMult||1)*1.5;break;
    case'ev_taunt_range':p._rangeBonus=(p._rangeBonus||0)+60;break;
    case'ev_heal_range':p._rangeBonus=(p._rangeBonus||0)+80;break;
    case'ev_taunt_shield':p._tauntShieldPerk=true;break;
    case'ev_od_cd':case'ev_heal_cd':case'ev_dash_cd':p._cdMult=(p._cdMult||1)*0.75;break;
    case'ev_od_dmg':p._odDmgPerk=true;break;
    case'ev_dash_dmg':p._dashDmgPerk=true;break;
  }
}
function endRun(reason){
  if(SIM.over)return;
  SIM.over=true;
  const stats={waves:SIM.wave,kills:SIM.runStats.kills,perfect:SIM.runStats.perfectWaves,leaks:SIM.runStats.leaks};
  ev({k:'gameover',stats,reason});
  AudioSys.play('defeat');
  if(App.mode==='mp')netSend({t:'over',won:false,stats,reason});
}
