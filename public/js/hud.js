/* ============================================================================
   IMMUNE RESPONSE — HUD bindings + non-intrusive tutorial
   HUD writes go through cached refs; heavy innerHTML rebuilds are throttled.
   Tutorial: contextual hint chips that react to what the player actually
   does, show once ever (localStorage), never block input, and can be
   dismissed or disabled — onboarding that respects the player.
   ========================================================================== */
'use strict';

const HUDREF={};
function cacheHudRefs(){
  ['bodyHpFill','bodyHpText','buffBadge','waveBadge','threatBadge','epCount',
   'organIcons','debuffRow','bossBar','bossName','bossFill','squadPanel',
   'weaponName','ammoFill','ammoLabel','heatFill','heatLabel','ammoBanner',
   'abilityBtn','abilityIcon','abilityCdRing','abilityCdNum','fireBtn',
   'vignetteLow'].forEach(id=>HUDREF[id]=$(id));
}
let hudSlowTimer=0;
let hudFastTimer=0;
let lastSquadKey='';
function updateHud(view,dt){
  if(!view)return;
  // 15Hz ceiling: every style/text write here costs layout+paint on phones,
  // and the CSS transitions smooth the steps anyway
  hudFastTimer-=dt;
  if(hudFastTimer>0)return;
  hudFastTimer=1/15;
  const pct=clamp(view.bodyHp/view.bodyHpMax,0,1);
  HUDREF.bodyHpFill.style.width=(pct*100)+'%';
  let c1='#2fd18f',c2='#3ee8c8';
  if(pct<0.6){c1='#ffd166';c2='#ffb347';}
  if(pct<0.3){c1='#ff4d6d';c2='#ff7a90';}
  HUDREF.bodyHpFill.style.background=`linear-gradient(90deg,${c1},${c2})`;
  HUDREF.bodyHpText.textContent=`${Math.round(view.bodyHp)} / ${view.bodyHpMax}`;
  HUDREF.vignetteLow.style.opacity=pct<0.3?String(0.5+(0.3-pct)*2):'0';

  const buffPct=Math.round((bodyBuffOf(pct)-1)*100);
  const bb=HUDREF.buffBadge;
  bb.textContent=buffPct>0?`+${buffPct}% DMG`:'NO DMG BUFF';
  bb.classList.toggle('tapering',pct>=0.3&&pct<0.6);
  bb.classList.toggle('gone',pct<0.3);

  HUDREF.waveBadge.textContent='WAVE '+view.wave;
  const threats=view.threats||0;
  HUDREF.threatBadge.textContent=threats>0?('THREATS '+threats):'';

  // slow lane (10Hz): EP, squad panel, debuff badges
  hudSlowTimer-=dt;
  if(hudSlowTimer<=0){
    hudSlowTimer=0.1;
    HUDREF.epCount.textContent=view.ep;
    renderDebuffBadges(view.debuffs||{});
    const me=view.players.find(p=>p.i===App.myPid);
    if(me)updateWeaponPanel(me);
    updateAbilityButton(me);
    updateBossBar(view);
    const key=view.players.map(p=>`${p.i}:${p.a?1:0}`).join('|');
    if(key!==lastSquadKey){lastSquadKey=key;renderSquadPanel(view);}
    else refreshSquadValues(view);
  }
}
function bodyBuffOf(pct){
  if(pct>=0.6)return 1.25;
  if(pct<=0.3)return 1;
  return 1+0.25*((pct-0.3)/0.3);
}
function updateWeaponPanel(me){
  if(!me)return;
  const w=WEAPONS[CLASSES[me.c].weapon];
  HUDREF.weaponName.textContent=w.name.toUpperCase();
  const ammoPct=clamp(me.am/me.amx,0,1);
  HUDREF.ammoFill.style.width=(ammoPct*100)+'%';
  HUDREF.ammoFill.classList.toggle('empty',me.am<=0);
  HUDREF.ammoLabel.textContent=`${me.am} / ${me.amx}`;
  HUDREF.heatFill.style.width=((me.ht||0)*100)+'%';
  HUDREF.heatFill.classList.toggle('hot',!!me.oh);
  HUDREF.heatLabel.textContent=me.oh?'OVERHEATED':'HEAT';
  HUDREF.heatLabel.classList.toggle('overheated',!!me.oh);
  HUDREF.ammoBanner.classList.toggle('show',me.am<=0&&!me.oh);
}
function updateAbilityButton(me){
  if(!me)return;
  const ab=CLASSES[me.c].ability;
  HUDREF.abilityIcon.textContent=ab.icon;
  const cdFrac=me.ac>0?clamp(me.ac/me.acd,0,1):0;
  HUDREF.abilityCdRing.style.setProperty('--pct',(cdFrac*100)+'%');
  HUDREF.abilityCdNum.textContent=me.ac>0?Math.ceil(me.ac):'';
  HUDREF.abilityBtn.classList.toggle('on-cd',me.ac>0);
  HUDREF.abilityBtn.classList.toggle('ready-pulse',!(me.ac>0));
}
function updateBossBar(view){
  const b=view.boss; // finalizeView fills this on both host & guest paths
  if(b){
    HUDREF.bossBar.classList.add('show');
    const def=ENEMY_DEFS[b.d]||{};
    HUDREF.bossName.textContent=(def.name||'BOSS').toUpperCase();
    HUDREF.bossFill.style.width=(clamp(b.hp/b.hm,0,1)*100)+'%';
  }else{
    HUDREF.bossBar.classList.remove('show');
  }
}
function renderDebuffBadges(debuffs){
  const row=HUDREF.debuffRow;
  const wanted=Object.keys(debuffs).filter(k=>debuffs[k]);
  const key=wanted.join(',');
  if(key===row.dataset.key)return;
  row.dataset.key=key;
  row.innerHTML='';
  const tips={
    heart:'HEART FAILED: squad move speed -15% for the rest of the run. Restore it with the Regenerative Tissue squad upgrade.',
    lungs:'LUNGS SCARRED: ability cooldowns +25% for the rest of the run.',
    brain:'BRAIN SWELLING: squad damage -12% for the rest of the run.',
  };
  for(const k of wanted){
    const el=document.createElement('span');
    el.className='debuff-badge';
    el.setAttribute('data-tip',tips[k]);
    el.textContent={heart:'♥ DOWN',lungs:'⌇ DOWN',brain:'◈ DOWN'}[k];
    row.appendChild(el);
  }
}
function renderSquadPanel(view){
  const panel=HUDREF.squadPanel;
  panel.innerHTML='';
  for(const p of view.players){
    const row=document.createElement('div');
    row.className='squad-mate'+(p.i===App.myPid?' you':'');
    row.id='sq_'+p.i;
    const clsIcon=(CLASSES[p.c]||CLASSES.tcell).icon;
    row.innerHTML=
      `<div class="squad-dot" style="background:${p.col}"></div>`+
      `<span>${clsIcon}</span>`+
      `<span class="squad-name${p.i===App.myPid?' you':''}">${p.i===App.myPid?'YOU':escapeHtml(p.n)}</span>`+
      `<div class="squad-hp-track"><div class="squad-hp-fill" data-sq="${p.i}" style="width:${clamp(p.hp/p.hm,0,1)*100}%;background:${p.col}"></div></div>`+
      (!p.a?`<span class="squad-down" id="sqd_${p.i}">DOWN</span>`:'');
    panel.appendChild(row);
  }
}
function refreshSquadValues(view){
  for(const p of view.players){
    const fill=document.querySelector(`[data-sq="${p.i}"]`);
    if(fill)fill.style.width=(clamp(p.hp/p.hm,0,1)*100)+'%';
    const down=$('sqd_'+p.i);
    if(down&&p.a)down.remove();
  }
}
/* organ icons built once per run */
const ORGAN_META={
  heart:{icon:'♥',tip:'HEART — when it hits 0 the whole squad moves 15% slower for the rest of the run.'},
  lungs:{icon:'⌇',tip:'LUNGS — at 0, all ability cooldowns +25% for the rest of the run.'},
  brain:{icon:'◈',tip:'BRAIN — at 0, squad damage -12% for the rest of the run.'},
};
function buildOrganIcons(){
  const wrap=$('organIcons');
  wrap.innerHTML='';
  for(const k of Object.keys(ORGAN_META)){
    const d=document.createElement('div');
    d.className='organ-icon';
    d.id='organ_'+k;
    d.textContent=ORGAN_META[k].icon;
    d.setAttribute('data-tip',ORGAN_META[k].tip+' Leaks chip a random organ.');
    wrap.appendChild(d);
  }
}

/* ---------------------------------------------------------------- tutorial */
/* Contextual one-shot hints. They observe real gameplay moments, appear as
   small non-blocking chips at the bottom-center, auto-expire in ~7s, and
   remember dismissal forever (per profile). No forced pacing, no modal —
   the fix for the intrusive coach-mark tutorial the prototype dropped. */
const HINT_DEFS={
  move:{icon:'🕹️',html:'Drag anywhere on the <b>left half</b> to move — or <span class="kbd">WASD</span>.'},
  fire:{icon:'🔥',html:'Hold <b>FIRE</b> (or <span class="kbd">SPACE</span>) — the nearest pathogen <b>in range</b> locks automatically. The dashed ring is your range.'},
  switch:{icon:'🎯',html:'Release fire to drop your lock; hold again to switch targets.'},
  ammo:{icon:'🟢',html:'Green motes = <b>organic matter</b>. Walk over them to reload ammo.'},
  heat:{icon:'🌡️',html:'Heat climbs as you fire — ease off before it <b>overheats</b> and jams.'},
  leak:{icon:'💔',html:'Leaks drain shared <b>BODY HP</b> — everyone loses together. Intercept pathogens before they reach the core.'},
  draft:{icon:'🧬',html:'Pick a <b>squad upgrade</b>. Whoever confirms buys their highlighted card — bot votes are advice, not law.'},
};
const hintShown=new Set(JSON.parse(localStorage.getItem('ir_hints_shown')||'[]'));
let activeHint=null,hintTimeout=null;
function hintOnce(id,iconOverride,htmlOverride){
  if(!App.hintsEnabled||hintShown.has(id))return;
  hintShown.add(id);
  localStorage.setItem('ir_hints_shown',JSON.stringify([...hintShown]));
  showHint(id,iconOverride,htmlOverride);
}
function showHint(id,iconOverride,htmlOverride){
  const def=HINT_DEFS[id];if(!def&&!htmlOverride)return;
  hideHint(true);
  const layer=$('hintLayer');
  const chip=document.createElement('div');
  chip.className='hint-chip';
  chip.innerHTML=`<span class="hint-icon">${iconOverride||def.icon}</span><span>${htmlOverride||def.html}</span><button class="hint-x" title="Dismiss hints like this">✕</button>`;
  layer.appendChild(chip);
  activeHint={id,el:chip};
  chip.querySelector('.hint-x').addEventListener('click',()=>hideHint(true));
  hintTimeout=setTimeout(()=>hideHint(false),7000);
}
function hideHint(permanent){
  if(!activeHint)return;
  clearTimeout(hintTimeout);
  const el=activeHint.el;
  activeHint=null;
  el.classList.add('leaving');
  setTimeout(()=>el.remove(),350);
}
function hintDone(id){hintDoneInternal(id);}
function hintDoneInternal(id){
  // completing the action retires the pending hint instantly + permanently
  if(!hintShown.has(id))hintShown.add(id),localStorage.setItem('ir_hints_shown',JSON.stringify([...hintShown]));
  if(activeHint&&activeHint.id===id)hideHint(false);
}
function resetHints(){
  try{
    localStorage.removeItem('ir_hints_shown');
    localStorage.setItem('ir_hints','on');
    App.hintsEnabled=true;
    toast('Tutorial hints will replay next run');
  }catch(_){}
}

/* tutorial trigger checks — cheap, run a few times per second while playing */
let tutTick=0;
function tutorialTriggers(view,dt){
  tutTick-=dt;if(tutTick>0)return;tutTick=0.4;
  const me=view.players.find(p=>p.i===App.myPid);
  if(!me||!me.a)return;
  const wavePhase=view.phase==='wave';
  if(wavePhase){
    if(!hintShown.has('move')&&view.wave===1)hintOnce('move');
    else if(!hintShown.has('fire')&&(Input.firing||view.enemies.some(e=>dist2(e.x,e.y,me.x,me.y)<400*400)))hintOnce('fire');
    else if(hintShown.has('fire')&&!hintShown.has('switch')&&Input.firing)hintOnce('switch');
    else if(!hintShown.has('heat')&&(me.ht||0)>0.55)hintOnce('heat');
  }
}
