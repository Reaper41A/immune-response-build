/* ============================================================================
   IMMUNE RESPONSE — sim combat: firing, damage, kills, abilities
   ========================================================================== */
'use strict';

function fireWeapon(sh,tx,ty){
  const w=WEAPONS[sh.weapon];
  if(sh.fireCd>0||!canFire(sh))return;
  const od=sh.abilityActive>0&&CLASSES[sh.cls].ability.key==='overdrive';
  // Absolute Zero Heat (legendary): firing during Overdrive slowly heals nearby allies
  if(od&&sh._odApexPerk){
    for(const pl of SIM.players){
      if(pl.alive&&pl!==sh&&dist2(sh.x,sh.y,pl.x,pl.y)<200*200)pl.hp=Math.min(pl.hpMax,pl.hp+0.4);
    }
  }
  // fireRate/apexMetabolism read the accumulated diminishing-returns % —
  // NK's Bloodlust Cascade stacks a separate temporary per-kill bonus on top
  let rateMult=1-(SIM.upgrades._fireRatePct||0)/100;
  if(SIM.upgrades.apexMetabolism)rateMult*=1-0.15;
  if(sh._bloodlustPerk&&sh._bloodlustStacks)rateMult*=1-0.02*sh._bloodlustStacks;
  sh.fireCd=w.rate*rateMult*(od?0.4:1);
  const odFreeAmmo=od&&sh._odNoAmmoPerk;
  if(!odFreeAmmo)sh.ammo=Math.max(0,sh.ammo-1);
  if(!od){
    sh.heat=Math.min(1,sh.heat+w.heatPerShot*(sh._heatMod||1));
    if(sh.heat>=1){
      sh.overheated=true;sh.overheatTimer=w.overheatLock;
      ev({k:'overheat',x:sh.x,y:sh.y});
    }
  }
  const baseA=angleTo(sh.x,sh.y,tx,ty);
  sh.facing=baseA;
  const n=w.proj||1;
  const critBonus=sh._critBonus||0;
  const pierceBonus=(sh._pierceBonus||0)+(od&&sh._odPiercePerk?2:0);
  for(let i=0;i<n;i++){
    const spr=(Math.random()-0.5)*2*w.spread+(n>1?(i-(n-1)/2)*0.09:0);
    const a=baseA+spr;
    SIM.projectiles.push({
      id:uid(),x:sh.x,y:sh.y,
      vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,
      dmg:w.dmg*squadDamageMult(sh),color:w.color,
      pierce:(w.pierce||0)+pierceBonus,
      bounce:sh._bounceBonus||0,
      splash:(w.splash||0)*(sh._splashMult||1),
      ownerPid:sh.pid,life:1.4,
      critChance:(w.critChance||0)+critBonus,knockback:w.knockback||0,
      hitCount:0,trail:[],
    });
  }
  ev({k:'shot',x:sh.x,y:sh.y,a:baseA,color:w.color,weapon:sh.weapon});
}
function turretFire(t,target,dmgMult){
  const a=angleTo(t.x,t.y,target.x,target.y);
  SIM.projectiles.push({
    id:uid(),x:t.x,y:t.y,vx:Math.cos(a)*600,vy:Math.sin(a)*600,
    dmg:16*(dmgMult||1)*squadDamageMult(null),color:'#ffd166',
    pierce:0,bounce:0,splash:0,ownerPid:-1,life:1,
    critChance:0,knockback:0,hitCount:0,trail:[],
  });
  ev({k:'shot',x:t.x,y:t.y,a,color:'#ffd166',weapon:'shot_turret'});
}

function damageEnemy(en,amount,opts={}){
  if(!en.alive)return;
  en.lastHitT=SIM.time;
  if(en.shieldHp>0){
    const abs=Math.min(en.shieldHp,amount);
    en.shieldHp-=abs;amount-=abs;
    ev({k:'hit',x:en.x,y:en.y-en.radius,shield:true});
    if(amount<=0){en.hitFlash=0.15;return;}
  }
  if(en.reflect>0&&opts.shooterPid!=null&&opts.shooterPid>0){
    const sh=SIM.players.find(p=>p.pid===opts.shooterPid);
    if(sh&&sh.ammo>0&&Math.random()<en.reflect){
      sh.ammo--;ev({k:'reflect',x:sh.x,y:sh.y});
    }
  }
  if(en._tauntedDmgTakenMult)amount*=en._tauntedDmgTakenMult; // Reactive Membrane / Absolute Aggro / Phagocytic Retaliation
  en.hp-=amount;
  en.hitFlash=0.15;
  ev({k:'hit',x:en.x+rand(-4,4),y:en.y-en.radius-4,crit:!!opts.crit,amt:Math.round(amount)});
  if(en.hp<=0)killEnemy(en,opts);
}
function killEnemy(en,opts={}){
  en.alive=false;
  const gained=Math.round(en.epVal*epMult());
  SIM.ep+=gained;
  SIM.runStats.kills++;
  SIM.waveStats.killed++;
  const sh=opts.shooterPid!=null?SIM.players.find(p=>p.pid===opts.shooterPid):null;
  if(sh){
    sh.kills++;
    if(sh._lifestealFlat)sh.hp=Math.min(sh.hpMax,sh.hp+sh._lifestealFlat);
    if(en.el&&SIM.upgrades.bloodhoundEP)SIM.ep+=Math.round(gained*0.35);
    if(sh._bloodlustPerk){sh._bloodlustStacks=Math.min(5,(sh._bloodlustStacks||0)+1);sh._bloodlustTimer=4;}
    if(sh._dashResetPerk&&sh._justDashedTimer>0)sh.abilityCd=Math.max(0,sh.abilityCd-CLASSES[sh.cls].ability.cd*0.4);
    if(sh._odChainPerk&&sh.abilityActive>0)sh.abilityCd=Math.max(0,sh.abilityCd-CLASSES[sh.cls].ability.cd*0.15);
  }
  ev({k:'die',x:en.x,y:en.y,color:en.color,scale:en.isBoss?2.2:1,boss:en.isBoss,ep:gained,name:en.name});
  trySpawnPickup(en);
  if(en.defKey==='fungi'&&mutFlags(SIM.wave).fungiSpores){for(let i=0;i<2;i++)spawnSpore(en);}
  if(en.defKey==='mycovirus')spawnSpore(en);
  if(en.splits){
    for(let i=0;i<en.splits.count;i++){
      SIM.enemies.push(spawnEnemyEntity(en.splits.into,{
        noElite:true,hpMult:en.splits.hpFrac,
        at:{x:en.x+rand(-24,24),y:en.y+rand(-24,24),angle:en.angle},
      }));
    }
    ev({k:'split',x:en.x,y:en.y});
  }
  if(en.explodesOnDeath){
    // Spec fidelity (enemies.json): the cloud only forms when it dies NEAR a player.
    const near=SIM.players.some(p=>p.alive&&dist2(p.x,p.y,en.x,en.y)<140*140);
    if(near){
      SIM.hazards.push({x:en.x,y:en.y,radius:56,life:1.8,maxLife:1.8,dps:14,tickCd:0});
      ev({k:'hazardCloud',x:en.x,y:en.y});
    }
  }
}
function spawnSpore(fromEn){
  const s=spawnEnemyEntity('spore',{noElite:true,at:{x:fromEn.x,y:fromEn.y,angle:fromEn.angle}});
  s.x=fromEn.x+rand(-20,20);s.y=fromEn.y+rand(-20,20);
  SIM.enemies.push(s);
}
function trySpawnPickup(en){
  if(Math.random()>0.55)return;
  const tier=Math.floor((SIM.wave-1)/10);
  const mult=1+tier*0.35; // scavenging scales every 10 waves
  SIM.pickups.push({
    id:uid(),x:en.x+rand(-10,10),y:en.y+rand(-10,10),
    amount:Math.round((en.isBoss?24:randi(4,9))*mult),
    life:9,wobble:rand(0,Math.PI*2),
  });
}
function damagePlayer(p,amount,src){
  if(!p.alive||p.invuln>0)return;
  if(p._tauntShield)amount*=p._tauntApexPerk?0.4:0.7; // Absolute Aggro (legendary) improves the base Protective Aggro reduction
  if(SIM.upgrades._dmgReducedPct)amount*=1-SIM.upgrades._dmgReducedPct/100; // Thickened Membrane (squad-wide, stacks)
  if(p._healShield>0){const abs=Math.min(p._healShield,amount);p._healShield-=abs;amount-=abs;}
  if(amount<=0)return;
  p.hp-=amount;
  if(p.hp<=0){
    p.alive=false;p.hp=0;p.respawnTimer=RESPAWN_SECONDS;p.inFiring=false;
    onFireReleased(p);
    ev({k:'down',x:p.x,y:p.y,color:p.color,pid:p.pid,name:p.name});
  }else{
    ev({k:'hurt',x:p.x,y:p.y,pid:p.pid,amt:Math.round(amount)});
  }
}

/* ---------------------------------------------------------------- abilities */
function useAbility(p){
  const ab=CLASSES[p.cls].ability;
  // Blink Chain (epic) and Dual Synthesis (epic) grant a second charge that
  // doesn't consume the normal cooldown — checked before the cooldown gate.
  const hasChainPerk=(ab.key==='dash'&&p._dashChainPerk)||(ab.key==='heal'&&p._healDoublePerk)||(ab.key==='taunt'&&p._tauntDoublePerk);
  const usingBonusCharge=hasChainPerk&&p._bonusCharge>0;
  if(!p.alive||(p.abilityCd>0&&!usingBonusCharge))return;
  if(usingBonusCharge)p._bonusCharge--;
  else if(hasChainPerk)p._bonusCharge=1; // refill the spare charge on a fresh-cooldown use
  if(!usingBonusCharge)p.abilityCd=ab.cd*(p._cdMult||1)*(SIM.debuffs.lungs?1.25:1);
  p.abilityActive=(ab.duration||0.01)+(p._durBonus||0);
  if(ab.key==='taunt'){
    const range=240+(p._rangeBonus||0);
    for(const en of SIM.enemies){
      if(!en.alive||en.isBoss)continue;
      if(dist2(p.x,p.y,en.x,en.y)<range*range){
        en.tauntedBy=p.pid;
        if(p._tauntThornsPerk||p._tauntApexPerk||p._retaliatePerk)en._tauntedDmgTakenMult=p._tauntApexPerk?1.2:1.15;
      }
    }
    if(p._tauntShieldPerk||p._tauntApexPerk)p._tauntShield=true;
    ev({k:'taunt',x:p.x,y:p.y});
  }else if(ab.key==='overdrive'){
    if(p._odDmgPerk)p._overdriveDmg=true;
    if(p._heatVentPerk)p.heat=0;
    ev({k:'overdrive',x:p.x,y:p.y});
  }else if(ab.key==='heal'){
    const healMult=p._healMult||1;
    const amt=60*healMult;
    const pAmt=40*healMult;
    const range=260+(p._rangeBonus||0);
    const before=SIM.bodyHp;
    SIM.bodyHp=Math.min(SIM.bodyHpMax,SIM.bodyHp+amt);
    const healedBody=Math.round(SIM.bodyHp-before);
    const healedPlayers=[];
    // Miracle Cascade (legendary): also revive one downed ally at half HP.
    // Selfless Cascade (legendary personal perk): same, but keyed off the perk.
    if(p._healApexPerk||p._martyrPerk){
      const downed=SIM.players.find(pl=>!pl.alive&&pl.respawnTimer>0);
      if(downed){
        downed.alive=true;downed.hp=Math.round(downed.hpMax*0.5);downed.invuln=1.2;
        ev({k:'respawn',x:downed.x,y:downed.y,pid:downed.pid,name:downed.name,color:downed.color});
      }
    }
    for(const pl of SIM.players){
      if(pl.alive&&dist2(p.x,p.y,pl.x,pl.y)<range*range){
        const room=pl.hpMax-pl.hp;
        const h=Math.min(room,pAmt);
        pl.hp+=h;
        if(p._healShieldPerk||p._healShieldEvoPerk)pl._healShield=(pl._healShield||0)+(p._healShieldEvoPerk?pAmt*0.25:20);
        // Antibody Surplus (epic): heal that would've overflowed max HP
        // becomes a temporary squad damage buff instead of being wasted.
        if(p._overhealPerk&&pAmt>room)pl._overhealDmgBuff=6;
        if(h>0)healedPlayers.push(pl.pid===App.myPid?'you':pl.name);
      }
    }
    if(p._healCleansePerk){
      const k=Object.keys(SIM.debuffs).find(k=>SIM.debuffs[k]);
      if(k){SIM.debuffs[k]=false;SIM.organs[k]=Math.max(SIM.organs[k],30);ev({k:'organ',key:k});}
    }
    ev({k:'heal',x:p.x,y:p.y,body:healedBody,players:healedPlayers});
  }else if(ab.key==='dash'){
    const a=p.facing;
    const dashSpeed=720*(p._dashSpeedMult||1);
    p.dashVX=Math.cos(a)*dashSpeed;p.dashVY=Math.sin(a)*dashSpeed;
    p.invuln=(ab.duration)+(p._durBonus||0)+0.15;
    if(p._dashDmgPerk)p._dashDmg=true;
    // Ambush Predator (elite): next shot after a dash crits. Phantom
    // Predator (legendary) upgrades that same window to also pierce all.
    if(p._dashCritPerk||p._dashApexPerk)p._dashCritWindow=1.2;
    if(p._dashApexPerk)p._dashApexWindow=1.2;
    p._justDashedTimer=1;
    ev({k:'dash',x:p.x,y:p.y});
  }
}
function onAbilityEnd(p){
  const key=CLASSES[p.cls].ability.key;
  if(key==='taunt'){for(const en of SIM.enemies)if(en.tauntedBy===p.pid)en.tauntedBy=0;p._tauntShield=false;}
  if(key==='overdrive')p._overdriveDmg=false;
  if(key==='dash')p._dashDmg=false;
}

/* ---------------------------------------------------------------- passive perk upkeep
   Small per-frame effects that aren't tied to a single event (regen,
   taunt-sustained healing, bloodlust decay, dash-window tracking for
   Ambush Predator/Kill Momentum). Kept in one place so new passive perks
   have an obvious home instead of getting smeared across sim files. */
function tickPlayerPerks(p,dt){
  if(!p.alive)return;
  if(p._regenPct&&!p.inFiring&&p.hp<p.hpMax){
    p.hp=Math.min(p.hpMax,p.hp+p.hpMax*p._regenPct*dt);
  }
  if(p._tauntHealPerk&&p.abilityActive>0&&CLASSES[p.cls].ability.key==='taunt'){
    p.hp=Math.min(p.hpMax,p.hp+p.hpMax*0.03*dt);
  }
  if(p._bloodlustStacks){
    p._bloodlustTimer-=dt;
    if(p._bloodlustTimer<=0){p._bloodlustStacks=0;}
  }
  if(p._justDashedTimer>0)p._justDashedTimer-=dt;
  if(p._dashCritWindow>0)p._dashCritWindow-=dt;
  if(p._dashApexWindow>0)p._dashApexWindow-=dt;
  if(p._overhealDmgBuff>0)p._overhealDmgBuff-=dt;
}

/* ---------------------------------------------------------------- pickups */
function autoPickup(p){
  const range=26+(p._pickupBonus||0);
  for(const pk of SIM.pickups){
    if(pk.collected)continue;
    if(dist2(p.x,p.y,pk.x,pk.y)<range*range){
      pk.collected=true;
      p.ammo=Math.min(p.ammoMax,p.ammo+pk.amount);
      ev({k:'pickup',x:pk.x,y:pk.y,amount:pk.amount,pid:p.pid});
    }
  }
}
function clampToArena(p){
  const c=worldCore();
  const d=dist(c.x,c.y,p.x,p.y);
  if(d>arenaRadius()){
    const a=angleTo(c.x,c.y,p.x,p.y);
    p.x=c.x+Math.cos(a)*arenaRadius();p.y=c.y+Math.sin(a)*arenaRadius();
  }
}
