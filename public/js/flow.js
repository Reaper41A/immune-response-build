/* ============================================================================
   IMMUNE RESPONSE — per-frame simulation flow + snapshots
   Bot AI, human input application, the master simUpdate(dt) step, and the
   snapshot format guests interpolate.
   ========================================================================== */
'use strict';

/* ---------------------------------------------------------------- bots */
const BOT_LINES={
  incoming:['Contacts inbound!','Got movement here','Something\u2019s coming through'],
  needHelp:['Need help over here!','I\u2019m overwhelmed!'],
  covering:['I\u2019ve got this','Holding steady','On it'],
  bossSpot:['Big one incoming!','Focus the boss!'],
  lowBody:['Body\u2019s getting low...','Watch the leaks!'],
  lowAmmo:['Running low on ammo!','Need organic matter!'],
};
function botSay(bot,key){ev({k:'say',who:bot.name,text:choice(BOT_LINES[key]),color:bot.color});}

function updateBot(bot,dt){
  // Bots use the same proximity auto-lock as humans, with their class range.
  const locked=acquireOrRetainTarget(bot,bot,SIM.enemies,true);
  const preferred=bot.range*(bot.cls==='macrophage'?0.68:0.75);
  if(locked){
    const d=edgeDistance(bot.x,bot.y,locked);
    if(d>preferred){
      const a=angleTo(bot.x,bot.y,locked.x,locked.y);
      bot.x+=Math.cos(a)*bot.speed*dt;bot.y+=Math.sin(a)*bot.speed*dt;
    }else if(d<preferred*0.5){
      const a=angleTo(locked.x,locked.y,bot.x,bot.y);
      bot.x+=Math.cos(a)*bot.speed*0.6*dt;bot.y+=Math.sin(a)*bot.speed*0.6*dt;
    }else{
      // light strafe so bots feel alive instead of glued to a radius
      bot.strafeT=(bot.strafeT||rand(0,6))+dt;
      const a=angleTo(bot.x,bot.y,locked.x,locked.y)+Math.PI/2*Math.sign(Math.sin(bot.strafeT*1.3));
      bot.x+=Math.cos(a)*bot.speed*0.3*dt;bot.y+=Math.sin(a)*bot.speed*0.3*dt;
    }
    bot.facing=angleTo(bot.x,bot.y,locked.x,locked.y);
    bot.inFiring=true;
    updateAmmoHeat(bot,dt);
    bot.fireCd-=dt;
    if(bot.fireCd<=0&&canFire(bot)&&isInRange(bot.x,bot.y,locked,bot.range))fireWeapon(bot,locked.x,locked.y);
    botAbilityLogic(bot,locked,d);
  }else{
    bot.wanderA+=rand(-0.4,0.4)*dt;
    const c=worldCore();
    if(dist(bot.x,bot.y,c.x,c.y)>arenaRadius()*0.5){
      const a=angleTo(bot.x,bot.y,c.x,c.y);
      bot.x+=Math.cos(a)*bot.speed*0.3*dt;bot.y+=Math.sin(a)*bot.speed*0.3*dt;
    }else{
      bot.x+=Math.cos(bot.wanderA)*bot.speed*0.22*dt;
      bot.y+=Math.sin(bot.wanderA)*bot.speed*0.22*dt;
    }
    bot.inFiring=false;
    updateAmmoHeat(bot,dt);
    bot.fireCd-=dt;
  }
  autoPickup(bot);
  clampToArena(bot);
  bot.calloutCd=(bot.calloutCd==null?rand(4,9):bot.calloutCd)-dt;
  if(bot.calloutCd<=0){
    bot.calloutCd=rand(7,14);
    const nearCount=SIM.enemies.filter(e=>e.alive&&dist2(bot.x,bot.y,e.x,e.y)<260*260).length;
    if(SIM.enemies.some(e=>e.alive&&e.isBoss))botSay(bot,'bossSpot');
    else if(SIM.bodyHp<SIM.bodyHpMax*0.35&&Math.random()<0.4)botSay(bot,'lowBody');
    else if(bot.ammo<bot.ammoMax*0.2&&Math.random()<0.5)botSay(bot,'lowAmmo');
    else if(nearCount>=4)botSay(bot,'needHelp');
    else if(nearCount>=1&&Math.random()<0.3)botSay(bot,'covering');
  }
}
function botAbilityLogic(bot,locked,d){
  if(bot.abilityCd>0)return;
  const key=CLASSES[bot.cls].ability.key;
  if(key==='taunt'){
    const cnt=SIM.enemies.filter(e=>e.alive&&!e.isBoss&&dist2(bot.x,bot.y,e.x,e.y)<220*220).length;
    if(cnt>=3)useAbility(bot);
  }else if(key==='heal'){
    if(SIM.bodyHp<SIM.bodyHpMax*0.5||bot.hp<bot.hpMax*0.5)useAbility(bot);
  }else if(key==='dash'){
    if(d>260)useAbility(bot);
  }else if(key==='overdrive'){
    if(locked&&(locked.isBoss||locked.hpMax>80))useAbility(bot);
  }
}

/* ---------------------------------------------------------------- humans */
function updateHumanPlayer(p,dt){
  if(!p.alive){p.inFiring=false;return;}
  // Host-local input bridge: guests' intents arrive via netcode ('pi'), but
  // the sim host's OWN cell had no bridge from Input -> its entity, which
  // left the host unable to move or fire. Read local devices here.
  if(App.isHost&&p.pid===App.myPid){
    p.inMove.x=Input.move.x;p.inMove.y=Input.move.y;p.inFiring=Input.firing;
  }
  let mx=p.inMove.x,my=p.inMove.y;
  const len=Math.hypot(mx,my);
  if(len>1){mx/=len;my/=len;}
  if(p.abilityActive>0&&CLASSES[p.cls].ability.key==='dash'){
    p.x+=p.dashVX*dt;p.y+=p.dashVY*dt;
    p.dashVX*=Math.pow(0.02,dt);p.dashVY*=Math.pow(0.02,dt);
    if(p._dashDmg){
      for(const en of SIM.enemies){
        if(!en.alive)continue;
        if(dist2(p.x,p.y,en.x,en.y)<(p.radius+en.radius)*(p.radius+en.radius)){
          damageEnemy(en,WEAPONS[p.weapon].dmg*2*squadDamageMult(p),{shooterPid:p.pid});
        }
      }
    }
  }else{
    p.x+=mx*p.speed*dt;p.y+=my*p.speed*dt;
    if(len>0.05)p.facing=Math.atan2(my,mx);
  }
  clampToArena(p);
  autoPickup(p);
  const locked=acquireOrRetainTarget(p,p,SIM.enemies,p.inFiring);
  p.fireCd-=dt;
  updateAmmoHeat(p,dt);
  if(p.inFiring&&locked){
    p.facing=angleTo(p.x,p.y,locked.x,locked.y);
    if(p.fireCd<=0&&canFire(p))fireWeapon(p,locked.x,locked.y);
  }
}

/* Movement-only tick used while a draft screen is up: squadmates can walk
   around and reposition, but nothing fires, targets, or takes/deals damage.
   Kept intentionally minimal and separate from updateHumanPlayer/updateBot
   so draft downtime can never accidentally trigger combat side effects. */
function updateDraftMovement(p,dt){
  if(!p.alive)return;
  if(App.isHost&&p.pid===App.myPid&&!p.isBot){
    p.inMove.x=Input.move.x;p.inMove.y=Input.move.y;
  }
  if(p.isBot)return; // bots hold position and wait like the humans decide
  let mx=p.inMove.x,my=p.inMove.y;
  const len=Math.hypot(mx,my);
  if(len>1){mx/=len;my/=len;}
  p.x+=mx*p.speed*dt;p.y+=my*p.speed*dt;
  if(len>0.05)p.facing=Math.atan2(my,mx);
  clampToArena(p);
  autoPickup(p);
}

/* ---------------------------------------------------------------- main step */
function simUpdate(dt){
  SIM.time+=dt;
  SIM.events.length=0;

  // Draft phases tick on wall-clock while combat holds its breath — but
  // players can still walk around and reposition for the wave ahead instead
  // of being frozen in place.
  if(SIM.phase!=='wave'){
    if(SIM.phase!=='squadDraft')SIM.phaseTimer-=dt; // squad draft has no timer — it's a group decision
    for(const p of SIM.players)updateDraftMovement(p,dt);
    resolveDraftTimeouts();
    if(SIM.phase==='squadDraft'&&allHumansVotedSquad())resolveSquadDraft();
    if(SIM.phase==='personalDraft'&&allHumansPicked(SIM.personalDrafts))finishPersonalDrafts(false);
    if(SIM.phase==='evolution'&&allHumansPicked(SIM.evolutions))finishEvolutions(false);
    flushEvents();
    return;
  }

  // spawn queue → telegraph warnings → actual spawns
  SIM.waveTimer+=dt;
  while(SIM.spawnQueue.length&&SIM.spawnQueue[0].warnDelay<=SIM.waveTimer){
    const item=SIM.spawnQueue.shift();
    const sp=randomSpawnPoint();
    item.at=sp;
    item.spawnAt=SIM.waveTimer+0.85; // fair-warning window before anything appears
    SIM.pendingSpawns.push(item);
    ev({k:'incoming',x:sp.x,y:sp.y,big:item.isBoss});
  }
  for(let i=SIM.pendingSpawns.length-1;i>=0;i--){
    const item=SIM.pendingSpawns[i];
    if(SIM.waveTimer>=item.spawnAt){
      const count=item.pack?3:1; // bacteria packs mutation
      for(let j=0;j<count;j++){
        const en=spawnEnemyEntity(item.key,{
          noElite:item.isBoss,
          at:{x:item.at.x+rand(-18,18),y:item.at.y+rand(-18,18),angle:item.at.angle},
        });
        SIM.enemies.push(en);
        if(item.isBoss)ev({k:'bossSpawn',name:en.name});
      }
      SIM.pendingSpawns.splice(i,1);
    }
  }

  // respawns
  for(const p of SIM.players){
    if(p.alive)continue;
    p.respawnTimer-=dt;
    if(p.respawnTimer<=0){
      p.alive=true;p.hp=p.hpMax;p.invuln=1.2;p.heat=0;p.overheated=false;p.overheatTimer=0;
      ev({k:'respawn',x:p.x,y:p.y,pid:p.pid,name:p.name,color:p.color});
    }
  }

  // players
  for(const p of SIM.players){
    if(p.abilityCd>0)p.abilityCd-=dt;
    if(p.abilityActive>0){p.abilityActive-=dt;if(p.abilityActive<=0)onAbilityEnd(p);}
    if(p.invuln>0)p.invuln-=dt;
    if(p.isBot)updateBot(p,dt);else updateHumanPlayer(p,dt);
  }
  // ability edge-triggers from inputs (local or networked)
  for(const p of SIM.players){
    if(p.human&&p.inAbility){p.inAbility=false;useAbility(p);}
  }
  for(const pk of SIM.pickups){pk.life-=dt;pk.wobble+=dt*3;}
  SIM.pickups=SIM.pickups.filter(pk=>pk.life>0&&!pk.collected);

  // hazard clouds (toxin sacs)
  for(const hz of SIM.hazards){
    hz.life-=dt;hz.tickCd-=dt;
    if(hz.tickCd<=0){
      hz.tickCd=0.5;
      for(const p of SIM.players){
        if(p.alive&&dist2(p.x,p.y,hz.x,hz.y)<hz.radius*hz.radius)damagePlayer(p,hz.dps*0.5,'hazard');
      }
    }
  }
  SIM.hazards=SIM.hazards.filter(h=>h.life>0);

  // necrotic trails
  for(const tr of SIM.trails)tr.life-=dt;
  SIM.trails=SIM.trails.filter(t=>t.life>0);
  SIM.trailTick-=dt;
  if(SIM.trailTick<=0){
    SIM.trailTick=0.5;
    for(const tr of SIM.trails){
      for(const p of SIM.players){
        if(p.alive&&dist2(p.x,p.y,tr.x,tr.y)<tr.w*tr.w)damagePlayer(p,5,'trail');
      }
    }
  }

  // melee contact chip
  for(const p of SIM.players){
    if(!p.alive)continue;
    p.meleeCd-=dt;
    if(p.meleeCd>0)continue;
    for(const en of SIM.enemies){
      if(!en.alive||en.defKey==='spore')continue;
      if(dist2(p.x,p.y,en.x,en.y)<(p.radius+en.radius)*(p.radius+en.radius)){
        damagePlayer(p,en.dmg*0.3,'contact');
        p.meleeCd=0.5;
        break;
      }
    }
  }

  // turrets
  for(const t of SIM.turrets){
    t.cd-=dt;
    if(t.cd<=0){
      let target=null,bd=Infinity;
      for(const en of SIM.enemies){
        if(!en.alive)continue;
        const d=dist2(t.x,t.y,en.x,en.y);
        if(d<t.range*t.range&&d<bd){bd=d;target=en;}
      }
      if(target){t.cd=0.4;turretFire(t,target);}
    }
  }

  updateEnemies(dt);

  // projectiles
  stepProjectiles(dt);

  SIM.enemies=SIM.enemies.filter(e=>e.alive||e.matureTimer>-999);
  SIM.enemies=SIM.enemies.filter(e=>e.alive);

  const threats=SIM.spawnQueue.length+SIM.pendingSpawns.length+SIM.enemies.length;
  if(threats===0&&SIM.waveActive){
    SIM.waveActive=false;
    SIM.runStats.wavesCleared++;
    if(SIM.waveStats.leaked===0)SIM.runStats.perfectWaves++;
    ev({k:'clear',perfect:SIM.waveStats.leaked===0});
    enterSquadDraft();
  }
  if(SIM.bodyHp<=0)endRun('The infection reached critical mass.');

  flushEvents();
}

function resolveDraftTimeouts(){
  if(!SIM||SIM.over)return;
  // Squad draft has no timeout — it only ever resolves once every human has
  // voted (see resolveSquadDraft, ticked in simUpdate).
  if(SIM.phase==='personalDraft'&&SIM.phaseTimer<=0){
    finishPersonalDrafts(true);
  }else if(SIM.phase==='evolution'&&SIM.phaseTimer<=0){
    finishEvolutions(true);
  }
}
