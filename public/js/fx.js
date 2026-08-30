/* ============================================================================
   IMMUNE RESPONSE — FX pipeline
   One event vocabulary for every client: the sim emits events; the HOST
   consumes them straight from sim.events each tick, and GUESTS consume them
   from snapshot payloads — same handleEvent(), same juice everywhere.
   ========================================================================== */
'use strict';

const evQueue=[];
function queueEvent(e){evQueue.push(e);}
function drainQueue(){while(evQueue.length)handleEvent(evQueue.shift());}

const FX={
  parts:[],popups:[],motes:[],warns:[],fakeTraces:[],
  shake:0,flashHurt:0,flashHeal:0,
};
function shake(n){if(!REDUCED&&Settings.screenShake)FX.shake=Math.min(22,FX.shake+n);} // settings gate: screenShake

function spawnParticle(x,y,vx,vy,life,size,color,type){
  if(!Settings.particles)return; // settings gate: particles
  const cap=COMPACT?240:420; // phones: smaller particle budget = less fill rate
  if(FX.parts.length>cap)FX.parts.shift();
  FX.parts.push({x,y,vx,vy,life,maxLife:life,size,color,type});
}
function deathBurst(x,y,color,scale=1){
  if(!Settings.particles)return; // settings gate: particles
  const n=Math.round(10*scale*(Settings.particleDensity||1)); // settings gate: particleDensity
  for(let i=0;i<n;i++){
    const a=rand(0,Math.PI*2),s=rand(60,220)*scale;
    spawnParticle(x,y,Math.cos(a)*s,Math.sin(a)*s,rand(0.3,0.6),rand(2,5)*scale,color,'burst');
  }
  // Destruction debris: fewer, larger, jagged fragments with spin — a
  // distinct "something broke apart" read layered on top of the round burst
  // sparks above. High/Ultra tiers only (settings gate: destructionParticles)
  // — it's the priciest-looking layer, so Low/Medium skip it by default.
  if(Settings.destructionParticles){
    const dn=Math.round(4*scale*(Settings.particleDensity||1));
    for(let i=0;i<dn;i++){
      const a=rand(0,Math.PI*2),s=rand(40,150)*scale;
      spawnParticle(x,y,Math.cos(a)*s,Math.sin(a)*s,rand(0.45,0.85),rand(4,9)*scale,color,'debris');
    }
  }
}
function ringFx(x,y,r,color,dur=0.45){
  FX.parts.push({x,y,vx:0,vy:0,life:dur,maxLife:dur,size:r,color,type:'pulse'});
}
function popup(x,y,text,color,small,crit,rise){
  if(FX.popups.length>70)FX.popups.shift();
  FX.popups.push({x,y,text:String(text),life:0.9,maxLife:0.9,color,small:!!small,crit:!!crit,vy:rise?-42:-26});
}
/* EP motes fly from a kill toward the HUD counter — makes income legible. */
function epMotes(x,y,n){
  try{
    const badge=$('epCount').getBoundingClientRect();
    const crect=canvas.getBoundingClientRect();
    const tx=badge.left-crect.left+badge.width/2;
    const ty=badge.top-crect.top+badge.height/2;
    for(let i=0;i<n;i++){
      if(FX.motes.length>60)FX.motes.shift();
      FX.motes.push({x:x+rand(-8,8),y:y+rand(-8,8),tx,ty,t:-rand(0,0.15)});
    }
    const eb=$('epCount').parentElement;
    eb.classList.remove('bump');void eb.offsetWidth;eb.classList.add('bump');
  }catch(_){}
}
function callout(text,color,sys,who){
  if(!Settings.calloutFeed)return; // settings gate: calloutFeed
  const feed=$('calloutFeed');
  if(!feed)return;
  const div=document.createElement('div');
  div.className='callout';
  div.style.borderLeftColor=color||'#3ee8c8';
  div.innerHTML=sys?escapeHtml(text):`<b>${escapeHtml(who||'')}</b> ${escapeHtml(text)}`;
  feed.appendChild(div);
  setTimeout(()=>div.remove(),3400);
  while(feed.children.length>4)feed.removeChild(feed.firstChild);
}

let lastHurtFlash=0;
function handleEvent(e){
  switch(e.k){
    case'shot':
      spawnParticle(e.x,e.y,Math.cos(e.a)*90,Math.sin(e.a)*90,0.1,5,e.color,'muzzle');
      AudioSys.play(SHOT_SFX[e.weapon]||'shot_turret');
      break;
    case'spark':
      for(let i=0;i<4;i++){
        const a=rand(0,Math.PI*2),s=rand(30,90);
        spawnParticle(e.x,e.y,Math.cos(a)*s,Math.sin(a)*s,0.18,2.5,e.color,'spark');
      }
      break;
    case'splash':ringFx(e.x,e.y,e.r,e.color,0.25);break;
    case'hit':
      if(e.shield){popup(e.x,e.y,'SHIELD','#7fd6ff',true,false);AudioSys.play('shield');}
      else if(e.amt>0){
        if(Settings.damageText)popup(e.x,e.y,String(e.amt),e.crit?'#ffd166':'#ffffff',false,e.crit); // settings gate: damageText
        AudioSys.play(e.crit?'crit':'hit');
      }
      break;
    case'die':
      deathBurst(e.x,e.y,e.color,e.scale||1);
      if(Settings.damageText)popup(e.x,e.y-14,'+'+e.ep+' EP','#3ee8c8',true,false,true); // settings gate: damageText
      AudioSys.play(e.boss?'bossdie':'kill');
      epMotes(e.x,e.y,e.boss?8:3);
      break;
    case'split':deathBurst(e.x,e.y,'#ffd6ee',0.7);AudioSys.play('split');break;
    case'leak':
      if(Settings.damageText)popup(e.x,e.y,'-'+e.dmg+' HP','#ff4d6d',false,false,true); // settings gate: damageText
      if(Settings.hitFlash)FX.flashHurt=Math.max(FX.flashHurt,0.55); // settings gate: hitFlash
      AudioSys.play('leak');shake(6);
      hintDone('leak');
      break;
    case'hurt':
      if(Settings.hitFlash&&e.pid===App.myPid&&performance.now()-lastHurtFlash>300){ // settings gate: hitFlash
        FX.flashHurt=Math.max(FX.flashHurt,0.3);
        lastHurtFlash=performance.now();
      }
      break;
    case'down':
      deathBurst(e.x,e.y,e.color,1.4);
      callout(e.pid===App.myPid?'You were overwhelmed!':e.name+' was overwhelmed!',e.color||'#ff4d6d',e.pid===App.myPid);
      if(e.pid===App.myPid)callout('Down — respawning in '+RESPAWN_SECONDS+'s','#ff4d6d',true);
      AudioSys.play('down');
      break;
    case'respawn':
      popup(e.x,e.y-30,'RESPAWNED','#8fe36a');
      callout((e.pid===App.myPid?'You are':e.name+' is')+' back in the fight','#8fe36a',false);
      AudioSys.play('respawn');
      break;
    case'heal':
      popup(e.x,e.y-30,'HEAL BURST','#8fe36a');
      if(Settings.hitFlash)FX.flashHeal=0.6; // settings gate: hitFlash
      if(e.body>0)callout('Heal Burst: +'+e.body+' Body HP'+(e.players.length?' & '+e.players.join(', '):''),'#8fe36a',false);
      AudioSys.play('heal');
      break;
    case'taunt':ringFx(e.x,e.y,150,'#7fd6ff');AudioSys.play('taunt');break;
    case'overdrive':ringFx(e.x,e.y,60,'#3ee8c8');AudioSys.play('overdrive');break;
    case'dash':AudioSys.play('dash');break;
    case'overheat':popup(e.x,e.y-24,'OVERHEAT','#ff4d6d',true);AudioSys.play('overheat');hintDone('heat');break;
    case'reflect':popup(e.x,e.y-26,'REFLECTED','#c9c9c9',true);break;
    case'reveal':
      deathBurst(e.x,e.y,'#ff4d6d',1.2);
      popup(e.x,e.y-30,'MACROPHAGE MIMIC!','#ff4d6d',false,true);
      callout('It was a MIMIC — disguise broken!','#ff4d6d',true);
      AudioSys.play('reveal');shake(8);
      hintOnce('mimic','🎭','That was no squadmate. Mimics copy your team and fake-fire — watch for \u201Cteammate\u201D shots that never land.');
      break;
    case'faketrace':
      FX.fakeTraces.push({x1:e.x1,y1:e.y1,x2:e.x2,y2:e.y2,life:0.18,maxLife:0.18,color:e.color});
      break;
    case'fakeheal':
      spawnParticle(e.x,e.y-10,0,-30,0.5,9,'#8fe36a','glyph');
      break;
    case'pulse':ringFx(e.x,e.y,e.r,'#ffe27a',0.6);AudioSys.play('pulse');break;
    case'hazardCloud':ringFx(e.x,e.y,56,'#d4ff4d',0.4);break;
    case'incoming':FX.warns.push({x:e.x,y:e.y,t:0.85,max:0.85,big:e.big});break;
    case'bossSpawn':
      callout(e.name.toUpperCase()+' detected!','#ffd166',true);
      AudioSys.play('wave');
      break;
    case'pickupSpawn':break;
    case'pickup':
      if(e.pid===App.myPid){
        popup(e.x,e.y-20,'+'+e.amount+' AMMO','#8fe36a',true,false,true);
        AudioSys.play('pick');
        hintDone('ammo');
      }
      break;
    case'wave':
      showWaveBanner(e.n,e.count,e.newType);
      AudioSys.play('wave');
      break;
    case'clear':
      callout(e.perfect?'Wave cleared — FLAWLESS!':'Wave cleared','#8fe36a',true);
      AudioSys.play('clear');
      break;
    case'phase':openDraftScreen(e.phase);break;
    case'buy':
      callout('Squad acquired: '+e.name,'#3ee8c8',true);
      AudioSys.play('confirm');
      hintDone('draft');
      break;
    case'perk':
      if(e.pid===App.myPid){toast('Perk acquired: '+e.name);AudioSys.play('confirm');}
      break;
    case'evolve':
      if(e.pid===App.myPid){toast(e.ability+' evolved: '+e.name);AudioSys.play('evolve');}
      break;
    case'organ':flashOrgan(e.key);break;
    case'say':callout(e.text,e.color,e.sys,e.who);break;
    case'cloak':AudioSys.play('cloak');break;
    case'gameover':showResults(e.stats,e.reason);break;
    default:break;
  }
}

function updateFx(dt){
  for(const p of FX.parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(0.05,dt*3);p.vy*=Math.pow(0.05,dt*3);p.life-=dt;}
  FX.parts=FX.parts.filter(p=>p.life>0);
  for(const pu of FX.popups){pu.y+=pu.vy*dt;pu.life-=dt;}
  FX.popups=FX.popups.filter(p=>p.life>0);
  for(const m of FX.motes)m.t+=dt*2.2;
  FX.motes=FX.motes.filter(m=>m.t<1);
  for(const w of FX.warns)w.t-=dt;
  FX.warns=FX.warns.filter(w=>w.t>0);
  for(const f of FX.fakeTraces)f.life-=dt;
  FX.fakeTraces=FX.fakeTraces.filter(f=>f.life>0);
  FX.flashHurt=Math.max(0,FX.flashHurt-dt*1.6);
  FX.flashHeal=Math.max(0,FX.flashHeal-dt*1.6);
}

/* ------------------------------------------------- banner / vignettes DOM */
let bannerTimer=null;
function showWaveBanner(n,count,newType){
  const b=$('waveBanner');
  $('wbMain').textContent='WAVE '+n;
  let sub=count+' signatures detected';
  if(newType&&ENEMY_DEFS[newType])sub+=' · NEW PATHOGEN: '+ENEMY_DEFS[newType].name+' — '+ENEMY_DEFS[newType].tell;
  $('wbSub').textContent=sub;
  b.classList.remove('show');void b.offsetWidth;b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer=setTimeout(()=>b.classList.remove('show'),2700);
}
function flashOrgan(key){
  const el=$('organ_'+key);
  if(!el)return;
  el.classList.remove('damaged');void el.offsetWidth; // restart shake anim
  const organs=currentView&&currentView.organs;
  const v=organs?organs[key]:null;
  if(v==null||v<=0){el.classList.add('damaged');} // stays red once destroyed
  else{el.classList.add('damaged');setTimeout(()=>el.classList.remove('damaged'),460);}
}
