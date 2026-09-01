/* ============================================================================
   IMMUNE RESPONSE — enemy behavior step + projectile step
   Every ENEMY_DEFS flag has matching logic here (enemies.json's own rule:
   "adding a flag without wiring the behavior is a no-op, not a feature").
   ========================================================================== */
'use strict';

function updateEnemies(dt){
  const core=worldCore();
  for(const en of SIM.enemies){
    if(!en.alive)continue;
    en.hitFlash=Math.max(0,en.hitFlash-dt);
    if(en._critShredT>0)en._critShredT-=dt;
    if(en._slamSlowT>0)en._slamSlowT-=dt;

    // Spore: sits still, matures into a bacterium if ignored.
    if(en.defKey==='spore'){
      en.matureTimer-=dt;
      if(en.matureTimer<=0){
        en.alive=false;
        const b=spawnEnemyEntity('bacteria',{noElite:true,at:{x:en.x,y:en.y,angle:en.angle}});
        b.x=en.x;b.y=en.y;
        SIM.enemies.push(b);
        ev({k:'split',x:en.x,y:en.y});
      }
      continue;
    }

    // Biofilm Wall: regenerates after 3s without damage.
    if(en.regen){
      en.regenShimmer=SIM.time-en.lastHitT>en.regen.delayAfterHit&&en.hp<en.hpMax;
      if(en.regenShimmer)en.hp=Math.min(en.hpMax,en.hp+en.regen.hpPerSecond*dt);
    }

    // Storm Cloud: periodic speed-buff PULSE (vs Parasite's continuous aura —
    // deliberately distinct counterplay per enemies.json).
    if(en.pulseCfg){
      en.pulseT-=dt;
      if(en.pulseT<=0){
        en.pulseT=en.pulseCfg.interval;
        // Duration-based flag (not a single-tick edge) so the SVG overlay
        // can reliably observe "a pulse just fired" even though simUpdate
        // can run several fixed steps per rendered frame (see main.js loop:
        // up to 6 catch-up ticks between view builds) — an exact "pulseT
        // just reset" check could get stepped past and missed entirely on a
        // slow frame. .35s comfortably covers the pulsing CSS animation's
        // .65s window being triggered at least once from any render cadence.
        en._justPulsed=0.35;
        ev({k:'pulse',x:en.x,y:en.y,r:en.pulseCfg.radius});
        for(const other of SIM.enemies){
          if(other===en||!other.alive)continue;
          if(dist2(en.x,en.y,other.x,other.y)<en.pulseCfg.radius*en.pulseCfg.radius)other._buffPulseT=en.pulseCfg.duration;
        }
      }
    }
    if(en._buffPulseT>0)en._buffPulseT-=dt;
    if(en._justPulsed>0)en._justPulsed-=dt;

    // Boss slam: periodic telegraphed AoE, two-phase like a state machine
    // rather than two independently-ticking timers (which would double-tick
    // once both were active). slamWindupT>0 means "currently telegraphing,
    // counting down to impact"; slamWindupT===0 with slamCfg present means
    // "counting down slamT to the NEXT windup's start". Only one of the two
    // timers is ever live at once.
    if(en.slamCfg){
      if(en.slamWindupT>0){
        en.slamWindupT=Math.max(0,en.slamWindupT-dt);
        if(en.slamWindupT===0){
          // windup complete: the slam actually lands now.
          ev({k:'slam',x:en.x,y:en.y,r:en.slamCfg.radius});
          for(const p of SIM.players){
            if(!p.alive)continue;
            if(dist2(en.x,en.y,p.x,p.y)<en.slamCfg.radius*en.slamCfg.radius){
              damagePlayer(p,en.slamCfg.dmg,'bossSlam');
            }
          }
          en._justSlammed=0.35; // short duration flag, same reasoning as _justPulsed above
          en.slamT=en.slamCfg.interval;
        }
      }else{
        en.slamT-=dt;
        if(en.slamT<=0){
          en.slamWindupT=en.slamCfg.windup; // enter telegraph phase
          ev({k:'slamWindup',x:en.x,y:en.y,r:en.slamCfg.radius,windup:en.slamCfg.windup});
        }
      }
    }
    if(en._justSlammed>0)en._justSlammed-=dt;

    // Retrovirus cloak cycle.
    if(en.cloakCfg){
      en.cloakT-=dt;
      if(en.cloakT<=0){en.cloakT=en.cloakCfg.interval;en.cloaked=true;en.cloakLeft=en.cloakCfg.duration;}
      if(en.cloaked){en.cloakLeft-=dt;if(en.cloakLeft<=0)en.cloaked=false;}
    }

    // Necrotic Drifter trail laying.
    if(en.trailCfg){
      en.trailT-=dt;
      if(en.trailT<=0){
        en.trailT=0.12;
        SIM.trails.push({x:en.x,y:en.y,life:en.trailCfg.linger,w:en.trailCfg.width/2});
        if(SIM.trails.length>320)SIM.trails.splice(0,SIM.trails.length-320);
      }
    }

    // Parasite continuous buff aura.
    if(en.buffAura){
      for(const other of SIM.enemies){
        if(other===en||!other.alive)continue;
        if(dist2(en.x,en.y,other.x,other.y)<140*140)other._buffed=true;
      }
    }

    /* ---- Macrophage Mimic (Phase 1 ruling, ratified):
       1. disguised — copies a squadmate present in the run, drifts toward
          players while firing HARMLESS tracers at other enemies
       2. within revealRange of any player → 0.4s telegraph (fair warning)
       3. lunge: disguise breaks, +120% speed burst toward the victim */
    if(en.defKey==='macrophageMimic'&&!en.revealed){
      en.shimmerT+=dt;
      let nearest=null,nd=Infinity;
      for(const v of SIM.players){
        if(!v.alive)continue;
        const d=edgeDistance(en.x,en.y,v);
        if(d<nd){nd=d;nearest=v;}
      }
      if(en.revealT>0){
        en.revealT-=dt; // telegraph window: stands still, flashes
        if(en.revealT<=0){
          en.revealed=true;
          en.lungeA=nearest?angleTo(en.x,en.y,nearest.x,nearest.y):en.angle;
          en.lungeT=0.6;
          ev({k:'reveal',x:en.x,y:en.y});
        }
        continue;
      }
      if(nearest&&nd<=90){en.revealT=0.4;continue;}
      if(nearest){
        const a=angleTo(en.x,en.y,nearest.x,nearest.y);
        en.x+=Math.cos(a)*en.speed*0.65*dt;
        en.y+=Math.sin(a)*en.speed*0.65*dt;
      }
      en.fakeCd-=dt;
      if(en.fakeCd<=0){
        en.fakeCd=rand(0.45,0.95);
        const prey=SIM.enemies.find(o=>o.alive&&o!==en&&dist2(en.x,en.y,o.x,o.y)<300*300&&!o.isBoss);
        if(prey){
          ev({k:'faketrace',x1:en.x,y1:en.y,x2:prey.x,y2:prey.y,color:disguiseColor(en)});
          if(Math.random()<0.4)ev({k:'fakeheal',x:prey.x,y:prey.y});
        }
      }
      continue;
    }
    if(en.defKey==='macrophageMimic'&&en.revealed&&en.lungeT>0){
      en.lungeT-=dt;
      en.x+=Math.cos(en.lungeA)*en.speed*2.2*dt;
      en.y+=Math.sin(en.lungeA)*en.speed*2.2*dt;
    }else{
      let sp=en.speed;
      if(en._buffed)sp*=1.25;
      if(en._buffPulseT>0)sp*=1.25;
      if(en._slamSlowT>0)sp*=0.6; // Ground Slam (macrophage personal perk)
      en._buffed=false;
      let targetPt=core;
      if(en.tauntedBy){
        const taunter=SIM.players.find(p=>p.pid===en.tauntedBy&&p.alive);
        if(taunter)targetPt=taunter;
      }
      const a0=angleTo(en.x,en.y,targetPt.x,targetPt.y);
      let a=a0;
      if(en.erratic){en.wobble+=dt*4;a+=Math.sin(en.wobble)*0.5;}
      en.x+=Math.cos(a)*sp*dt;
      en.y+=Math.sin(a)*sp*dt;
    }

    if(en.sporey){
      en.sporeCd-=dt;
      if(en.sporeCd<=0&&mutFlags(SIM.wave).fungiSpores){en.sporeCd=rand(3,5);spawnSpore(en);}
    }

    // reached the Body?
    if(dist(en.x,en.y,core.x,core.y)<coreRadius()*0.6){
      en.alive=false;
      applyLeak(en);
      continue;
    }

    // Contact damage against a friendly (non-corrupted) turret in the way —
    // only relevant when Unstable Turret Cores (curse) has thinned turret
    // HP down to something enemies can actually threaten; without that
    // curse turret HP is high enough this almost never matters, which is
    // intentional (it's the curse's real cost, not a baseline mechanic).
    if(SIM.upgrades.riskyTurrets){
      for(const t of SIM.turrets){
        if(t.corrupted)continue;
        if(dist2(en.x,en.y,t.x,t.y)<(en.radius+26)*(en.radius+26)){
          t.hp-=en.dmg*0.5*dt*4; // chip damage while an enemy is in contact, not a one-shot
          if(t.hp<=0)corruptTurret(t);
          break;
        }
      }
    }
  }

  // worm visual segments
  for(const en of SIM.enemies){
    if(en.defKey==='worm_seg'&&en.alive&&en.segments){
      en.segments.unshift({x:en.x,y:en.y});
      if(en.segments.length>6)en.segments.pop();
    }
  }
}

function stepProjectiles(dt){
  for(const pr of SIM.projectiles){
    pr.trail.push({x:pr.x,y:pr.y});
    if(pr.trail.length>5)pr.trail.shift();
    pr.x+=pr.vx*dt;pr.y+=pr.vy*dt;
    pr.life-=dt;
    if(pr.life<=0){pr.dead=true;continue;}
    // ricochet perk: bounce off arena edges while charges remain
    if(pr.bounce>0){
      let bounced=false;
      if(pr.x<8){pr.x=8;pr.vx=Math.abs(pr.vx);bounced=true;}
      else if(pr.x>VW-8){pr.x=VW-8;pr.vx=-Math.abs(pr.vx);bounced=true;}
      if(pr.y<8){pr.y=8;pr.vy=Math.abs(pr.vy);bounced=true;}
      else if(pr.y>VH-8){pr.y=VH-8;pr.vy=-Math.abs(pr.vy);bounced=true;}
      if(bounced){pr.bounce--;ev({k:'spark',x:pr.x,y:pr.y,color:pr.color});}
    }else if(pr.x<-60||pr.x>VW+60||pr.y<-60||pr.y>VH+60){pr.dead=true;continue;}
    for(const en of SIM.enemies){
      if(!en.alive||pr.dead)continue;
      if(dist2(pr.x,pr.y,en.x,en.y)<(en.radius+4)*(en.radius+4)){
        const owner=pr.ownerPid>0?SIM.players.find(p=>p.pid===pr.ownerPid):null;
        // NK: Ambush Predator guarantees a crit on the first shot after a dash;
        // Phantom Predator (legendary) also grants full pierce on that same shot.
        let isCrit=Math.random()<pr.critChance;
        if(owner&&owner._dashCritPerk&&owner._dashCritWindow>0){isCrit=true;owner._dashCritWindow=0;}
        if(!isCrit&&owner&&owner._followupPerk&&owner._followupCritWindow>0){isCrit=true;owner._followupCritWindow=0;}
        if(isCrit&&owner&&owner._followupPerk)owner._followupCritWindow=0.5;
        let apexPierce=false;
        if(owner&&owner._dashApexPerk&&owner._dashApexWindow>0){isCrit=true;apexPierce=true;owner._dashApexWindow=0;}
        let dmg=pr.dmg;
        if(isCrit)dmg*=1.8*(owner&&owner._critDmgMult?owner._critDmgMult:1)*(SIM.upgrades.critDmgSquad?1.4:1);
        // T-Cell: bonus damage to targets already pierced by this shot, and
        // Focused Beam's bonus applies only to the very first target hit.
        if(pr.hitCount>0&&owner){
          if(owner._pierceDmg)dmg*=owner._pierceDmg;
          if(owner._lancePerk)dmg=pr.dmg*(isCrit?1.8*(owner._critDmgMult||1):1); // Enzyme Lance: no falloff on pierced hits
        }else if(pr.hitCount===0&&owner&&owner._firstHitDmg){
          dmg*=owner._firstHitDmg;
        }
        // NK: Bloodlust Cascade fire-rate handled in fireWeapon; Executioner's Strike checked here
        if(isCrit&&owner&&owner._executionerPerk&&en.hp/en.hpMax<0.25)dmg=en.hp+9999;
        pr.hitCount++;
        damageEnemy(en,dmg,{crit:isCrit,shooterPid:pr.ownerPid});
        ev({k:'spark',x:pr.x,y:pr.y,color:pr.color});
        if(pr.knockback&&!en.isBoss){
          const kbMult=owner&&owner._knockbackMult?owner._knockbackMult:1;
          const ka=Math.atan2(pr.vy,pr.vx);
          en.x+=Math.cos(ka)*pr.knockback*kbMult*0.14;
          en.y+=Math.sin(ka)*pr.knockback*kbMult*0.14;
        }
        if(pr.splash>0){
          ev({k:'splash',x:en.x,y:en.y,r:pr.splash,color:pr.color});
          if(owner&&owner._slamPerk)en._slamSlowT=1.2; // Ground Slam: the direct-hit target is slowed too
          for(const other of SIM.enemies){
            if(other===en||!other.alive)continue;
            if(dist(other.x,other.y,en.x,en.y)<pr.splash){
              damageEnemy(other,pr.dmg*0.5,{shooterPid:pr.ownerPid});
              if(owner&&owner._slamPerk)other._slamSlowT=1.2;
            }
          }
        }
        // Bioluminescent Cascade (legendary, squad-wide): 25% chance on a
        // kill to chain a spark to a nearby enemy for 60% of this hit's dmg
        if(en.hp<=0&&SIM.upgrades.bioluminescence&&Math.random()<0.25){
          const chainTarget=SIM.enemies.find(o=>o!==en&&o.alive&&dist2(o.x,o.y,en.x,en.y)<180*180);
          if(chainTarget){damageEnemy(chainTarget,dmg*0.6,{shooterPid:pr.ownerPid});ev({k:'spark',x:chainTarget.x,y:chainTarget.y,color:'#ffd166'});}
        }
        if(pr.pierce>0||apexPierce)pr.pierce=apexPierce?99:pr.pierce-1;else pr.dead=true;
        break;
      }
    }
    // Squad fire vs a corrupted turret — a player-owned, non-hostile
    // projectile that reaches a corrupted turret damages and can destroy
    // it, giving the squad a way to fight back rather than just enduring
    // it for the rest of the run.
    if(!pr.dead&&!pr.hostileTurret&&pr.ownerPid>0){
      for(const t of SIM.turrets){
        if(!t.corrupted||pr.dead)continue;
        if(dist2(pr.x,pr.y,t.x,t.y)<26*26){
          t.hp-=pr.dmg;
          ev({k:'spark',x:pr.x,y:pr.y,color:pr.color});
          pr.dead=true;
          if(t.hp<=0){
            SIM.turrets=SIM.turrets.filter(o=>o!==t);
            ev({k:'say',sys:true,text:'Corrupted turret destroyed',color:'#7fd6ff'});
          }
        }
      }
    }
    // Hostile turret projectiles (see corruptedTurretFire in combat.js) hit
    // players or the Body core instead of enemies — kept as a separate
    // branch rather than folded into the enemy loop above since the
    // target set and damage math are both completely different.
    if(pr.hostileTurret&&!pr.dead){
      if(pr.targetType==='body'){
        const c=worldCore();
        if(dist2(pr.x,pr.y,c.x,c.y)<coreRadius()*coreRadius()){
          SIM.bodyHp=Math.max(0,SIM.bodyHp-pr.dmg);
          ev({k:'spark',x:pr.x,y:pr.y,color:pr.color});
          pr.dead=true;
        }
      }else{
        for(const p of SIM.players){
          if(!p.alive||pr.dead)continue;
          if(dist2(pr.x,pr.y,p.x,p.y)<(p.radius+4)*(p.radius+4)){
            damagePlayer(p,pr.dmg,'corruptedTurret');
            ev({k:'spark',x:pr.x,y:pr.y,color:pr.color});
            pr.dead=true;
          }
        }
      }
    }
  }
  SIM.projectiles=SIM.projectiles.filter(p=>!p.dead);
}
/* Turret HP hit 0 (see the contact-damage check above, only reachable when
   Unstable Turret Cores curse is active) — flips it hostile instead of
   removing it. Per the curse's design: gains bonus HP/damage/attack speed
   on top of its base stats and starts attacking the squad and the Body,
   so losing a turret to the curse is a real ongoing threat, not just a
   lost buff. */
function corruptTurret(t){
  t.corrupted=true;
  t.hpMax=Math.round(t.hpMax*1.8);
  t.hp=t.hpMax;
  t.cd=0.6;
  ev({k:'say',sys:true,text:'A turret has been corrupted!',color:'#ff4d6d'});
}
/* Corrupted turret upkeep: seek the nearest valid target (players first,
   falling back to the Body core if none are alive/reachable) and fire on
   its own cooldown — separate loop from the friendly turret-fire loop in
   flow.js since a corrupted turret's targeting priorities and fire rate
   are deliberately different (faster, and it explicitly targets players/
   Body instead of enemies). Called once per frame from stepProjectiles'
   caller (see updateEnemies/gameplay tick in flow.js). */
function updateCorruptedTurrets(dt){
  for(const t of SIM.turrets){
    if(!t.corrupted)continue;
    t.cd-=dt;
    if(t.cd<=0){
      let nearest=null,nd=Infinity;
      for(const p of SIM.players){
        if(!p.alive)continue;
        const d=dist2(t.x,t.y,p.x,p.y);
        if(d<nd){nd=d;nearest=p;}
      }
      if(nearest){
        t.cd=0.55; // corrupted turrets fire faster than friendly ones (0.4-0.55 baseline)
        corruptedTurretFire(t,'player',nearest);
      }else{
        t.cd=0.7;
        corruptedTurretFire(t,'body',worldCore());
      }
    }
  }
}

function flushEvents(){
  for(const e of SIM.events)queueEvent(e);
  SIM.flushedEvents=SIM.events.slice();
}
