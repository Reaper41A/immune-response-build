/* ============================================================================
   IMMUNE RESPONSE — data layer
   ----------------------------------------------------------------------------
   Single source of truth for classes, weapons, enemies, upgrades, perks,
   evolutions, roster unlocks, and the continuous wave-scaling curves.
   Sources:
   • Class ranges  → Phase2 classes.json (drives auto-lock radius AND reach)
   • Scaling       → Phase2 wave-config.json "scaling" (flat wave-50 jump is
                     deliberately NOT carried over — superseded)
   • Enemy table   → Phase2 enemies.json incl. all six content-expansion
                     pathogens, with Phase 3's audited color swaps applied
                     (worm/fungi/spore no longer collide with class colors)
   ========================================================================== */
'use strict';

const CLASSES={
  macrophage:{name:'Macrophage',icon:'🛡️',color:'#7fd6ff',role:'Tank',
    desc:'High HP, spread shotgun. Taunt drags enemies onto you.',
    hp:180,speed:118,range:220,weapon:'phagoShotgun',
    ability:{key:'taunt',name:'Taunt',icon:'📣',desc:'Pull nearby enemies to you for 2.5s',cd:14,duration:2.5}},
  tcell:{name:'T-Cell',icon:'🎯',color:'#3ee8c8',role:'DPS',
    desc:'Precise piercing rifle. Overdrive: +60% fire rate, no heat.',
    hp:120,speed:150,range:320,weapon:'enzymeBeam',
    ability:{key:'overdrive',name:'Overdrive',icon:'⚙️',desc:'+60% fire rate, no heat for 4s',cd:16,duration:4}},
  bcell:{name:'B-Cell',icon:'✚',color:'#ffd166',role:'Support',
    desc:'Antibody blaster. Heal Burst repairs allies + Body HP.',
    hp:100,speed:145,range:300,weapon:'antibodyBlaster',
    ability:{key:'heal',name:'Heal Burst',icon:'💠',desc:'Heals nearby allies 40 HP + 60 Body HP',cd:20,duration:0}},
  nk:{name:'Natural Killer',icon:'⚡',color:'#c084fc',role:'Assassin',
    desc:'Dual SMGs, crit-focused. Dash grants brief invulnerability.',
    hp:90,speed:185,range:380,weapon:'dualSmg',
    ability:{key:'dash',name:'Dash',icon:'💨',desc:'Burst forward, brief invulnerability',cd:8,duration:0.25}},
};

const WEAPONS={
  antibodyBlaster:{name:'Antibody Blaster',dmg:9,rate:0.14,spread:0.05,speed:640,pierce:0,color:'#7fd6ff',proj:1,ammoMax:36,heatPerShot:0.05,heatDecay:0.45,overheatLock:1.4},
  enzymeBeam:{name:'Enzyme Beam',dmg:14,rate:0.18,spread:0.015,speed:900,pierce:3,color:'#3ee8c8',proj:1,ammoMax:28,heatPerShot:0.065,heatDecay:0.4,overheatLock:1.5},
  phagoShotgun:{name:'Phagocytosis Shotgun',dmg:8,rate:0.55,spread:0.34,speed:560,pierce:0,color:'#7fd6ff',proj:6,knockback:60,ammoMax:14,heatPerShot:0.13,heatDecay:0.35,overheatLock:1.6},
  dualSmg:{name:'Dual SMG',dmg:6,rate:0.075,spread:0.12,speed:700,pierce:0,color:'#c084fc',proj:1,critChance:0.22,ammoMax:44,heatPerShot:0.045,heatDecay:0.5,overheatLock:1.3},
};
const SHOT_SFX={phagoShotgun:'shot_shotgun',enzymeBeam:'shot_beam',dualSmg:'shot_smg',antibodyBlaster:'shot_blaster'};

/* Enemy table = Phase2 enemies.json. Flags map 1:1 to behaviors in sim.js.
   Palette swaps from Phase 3's audit: worm_seg #ffd166→#c97b3d (was B-Cell's
   gold), fungi #c084fc→#6fae5f and spore #e8a6c9→(was NK purple).
   The Mimic keeps NO fixed identity color on purpose — it copies a present
   squadmate (Phase 1 ruling), so its render color comes from its victim. */
const ENEMY_DEFS={
  bacteria:{name:'Bacteria',hp:14,speed:96,dmg:10,radius:11,color:'#8fe36a',glow:'#c8ffb0',ep:4,
    tell:'Basic swarm unit.'},
  virus:{name:'Virus',hp:26,speed:118,dmg:30,radius:13,color:'#ff4d6d',glow:'#ff9fb0',ep:8,erratic:true,minWave:2,
    tell:'Erratic zig-zag — hard to track.'},
  fungi:{name:'Fungi',hp:70,speed:52,dmg:20,radius:18,color:'#6fae5f',glow:'#d7f5c9',ep:14,spore:true,minWave:4,
    tell:'Slow tank that sheds spores when hurt.'},
  antigenCluster:{name:'Antigen Cluster',hp:60,speed:42,dmg:22,radius:20,color:'#ff9fd6',glow:'#ffd6ee',ep:13,minWave:6,
    splits:{into:'bacteria',count:3,hpFrac:0.35},
    tell:'Splits into three smaller bacteria on death.'},
  worm_seg:{name:'Worm',hp:18,speed:80,dmg:15,radius:10,color:'#c97b3d',glow:'#ffe0c2',ep:3,minWave:7,
    tell:'Fast serpent — squirm priority.'},
  toxinsac:{name:'Toxin Sac',hp:16,speed:130,dmg:18,radius:12,color:'#d4ff4d',glow:'#eaffb0',ep:10,minWave:9,
    explodesOnDeath:true,
    tell:'Explodes into an acid cloud near you — kill it at range.'},
  biofilmWall:{name:'Biofilm Wall',hp:260,speed:8,dmg:12,radius:30,color:'#7de3c8',glow:'#c8fff0',ep:28,minWave:10,
    regen:{hpPerSecond:6,delayAfterHit:3},
    tell:'Nearly-stationary wall; regenerates if you ignore it.'},
  mycovirus:{name:'Mycovirus',hp:48,speed:98,dmg:24,radius:15,color:'#ff8ecf',glow:'#ffd6ef',ep:16,minWave:12,erratic:true,spore:true,
    tell:'Hybrid: erratic like a virus, sheds spores like fungi.'},
  macrophageMimic:{name:'Macrophage Mimic',hp:55,speed:70,dmg:34,radius:17,color:'#b9c4cf',glow:'#e2e8ee',ep:18,minWave:13,
    mimic:{revealRange:90,telegraph:0.4,lungeMult:2.2,lungeDur:0.6},
    tell:'Wears a squadmate\u2019s face until close. Its \u201Cshots\u201D never land — if a teammate looks off, back away.'},
  prion:{name:'Prion',hp:130,speed:34,dmg:26,radius:20,color:'#c9c9c9',glow:'#ececec',ep:22,minWave:14,reflect:0.25,
    tell:'Armored hexagon; some hits drain 1 extra ammo.'},
  necroticDrifter:{name:'Necrotic Drifter',hp:45,speed:58,dmg:14,radius:14,color:'#8a9a5b',glow:'#c9d9a0',ep:12,minWave:16,
    trail:{dps:10,linger:3,width:26},
    tell:'Leaves a corrosive trail — do not stand in it.'},
  cytokineStormCloud:{name:'Storm Cloud',hp:30,speed:30,dmg:8,radius:16,color:'#ffe27a',glow:'#fff6cf',ep:15,minWave:18,
    pulse:{radius:140,mult:1.25,interval:4,duration:2.5},
    tell:'Pulses speed boosts to nearby pathogens. Burst it down.'},
  retrovirus:{name:'Retrovirus',hp:38,speed:140,dmg:28,radius:12,color:'#e35bff',glow:'#f5c8ff',ep:19,minWave:22,erratic:true,
    cloak:{opacity:0.35,interval:5,duration:1.5},
    tell:'Periodically cloaks — track the faint shimmer.'},
  parasite:{name:'Parasite',hp:220,speed:60,dmg:50,radius:24,color:'#ff9f5a',glow:'#ffd9ad',ep:40,minWave:30,buffAura:true,
    tell:'Continuously buffs everything near it. Focus it down.'},
  spore:{name:'Spore',hp:6,speed:0,dmg:0,radius:6,color:'#e8a6c9',glow:'#ffd9ec',ep:1,
    tell:'Harmless until it matures into a bacterium.'},
};
const BOSS_DEFS={
  megaVirus:{name:'Mega Virus',hp:1400,speed:38,dmg:150,radius:46,color:'#ff4d6d',glow:'#ffb3c0',ep:200},
  mutatedFungus:{name:'Mutated Fungus',hp:2000,speed:26,dmg:150,radius:52,color:'#6fae5f',glow:'#d7f5c9',ep:260},
  parasiteQueen:{name:'Parasite Queen',hp:2600,speed:30,dmg:150,radius:50,color:'#ff9f5a',glow:'#ffe0bd',ep:320},
};

/* Continuous per-wave scaling (wave-config.json "scaling"). Boss curve is
   intentionally slower and uncapped per the Addendum's stated intent. */
function scaledHp(base,wave,isBoss){
  if(isBoss)return base*(1+0.05*(wave/5));
  return base*Math.min(1+0.035*wave,4.0);
}
function scaledDmg(base,wave){
  return base*Math.min(1+0.02*wave,2.5);
}
function eliteChance(w){return clamp(0.03+w*0.006,0.03,0.28);}
function mutFlags(w){
  return{virusSpeed:w>=5,bacteriaPacks:w>=10,fungiSpores:w>=15,parasitesAppear:w>=30};
}
/* Roster unlocks interleaved by wave exactly as wave-config.json specifies. */
const ROSTER=[
  ['bacteria',1],['virus',2],['fungi',4],['antigenCluster',6],['worm_seg',7],
  ['toxinsac',9],['biofilmWall',10],['mycovirus',12],['macrophageMimic',13],
  ['prion',14],['necroticDrifter',16],['cytokineStormCloud',18],['retrovirus',22],
];
const SPAWN_COST={bacteria:3,virus:5,fungi:9,worm_seg:6,toxinsac:5,mycovirus:8,macrophageMimic:9,prion:11,necroticDrifter:8,antigenCluster:10,biofilmWall:16,cytokineStormCloud:12,retrovirus:10,parasite:22};

/* ------------------------------- upgrades / perks / evolutions */
const UPGRADE_POOL=[
  {id:'healBody',name:'Medicine Administered',icon:'💉',cat:'survival',cost:120,desc:'Restore 200 Body HP right now'},
  {id:'bodyMax',name:'Expand Body HP',icon:'❤️',cat:'survival',cost:160,desc:'+150 max Body HP, healed to match'},
  {id:'damage',name:'Corrosive Enzymes',icon:'🧪',cat:'weapons',cost:90,desc:'+12% weapon damage for the whole squad (stacks)'},
  {id:'fireRate',name:'Rapid Mitosis',icon:'🔁',cat:'weapons',cost:100,desc:'+8% fire rate for the whole squad (stacks)'},
  {id:'economy',name:'Antigen Memory',icon:'📈',cat:'economy',cost:110,desc:'+15% Evolution Points earned'},
  {id:'moveSpeed',name:'Chemotaxis Boost',icon:'💨',cat:'mobility',cost:80,desc:'+10% move speed for the whole squad'},
  {id:'turret',name:'Antibody Turret',icon:'🗼',cat:'defense',cost:150,desc:'Deploy an auto-firing turret near the Body (max 4)'},
  {id:'barrier',name:'Barrier Field',icon:'🔮',cat:'defense',cost:130,desc:'Next wave\u2019s leaks deal 30% less damage'},
  {id:'organRepair',name:'Regenerative Tissue',icon:'🩹',cat:'survival',cost:140,desc:'Fully restore the most damaged organ & clear its debuff'},
];
const CAT_COLOR={survival:'#8fe36a',weapons:'#ff8ea0',economy:'#3ee8c8',mobility:'#7fd6ff',defense:'#ffd166'};
const UPG_BY_ID={};UPGRADE_POOL.forEach(u=>UPG_BY_ID[u.id]=u);

const PERSONAL_PERK_POOL=[
  {id:'p_ammoMax',name:'Larger Vesicles',icon:'🔋',desc:'+25% max ammo capacity'},
  {id:'p_heatEff',name:'Thermal Regulation',icon:'❄️',desc:'-20% heat generated per shot'},
  {id:'p_abilityCd',name:'Faster Signaling',icon:'⏱️',desc:'-20% ability cooldown'},
  {id:'p_speed',name:'Cytoskeleton Boost',icon:'🏃',desc:'+12% personal move speed'},
  {id:'p_hp',name:'Membrane Reinforcement',icon:'🧬',desc:'+20 max HP, healed to match'},
  {id:'p_pickupRange',name:'Chemoreceptors',icon:'📡',desc:'Collect organic matter from further away'},
  {id:'p_pierce',name:'Penetrating Enzyme',icon:'🗡️',desc:'Shots pierce 1 additional enemy'},
  {id:'p_bounce',name:'Ricochet Membrane',icon:'💫',desc:'Shots bounce off arena edges twice'},
  {id:'p_dmg_nk',name:'Perforin Overdrive',icon:'🔪',cls:'nk',desc:'+15% crit chance'},
  {id:'p_dmg_macrophage',name:'Digestive Enzymes',icon:'💥',cls:'macrophage',desc:'+40% splash radius on shotgun hits'},
  {id:'p_dmg_tcell',name:'Cytotoxic Payload',icon:'☣️',cls:'tcell',desc:'+18% damage to pierced targets'},
  {id:'p_dmg_bcell',name:'Amplified Antibodies',icon:'✨',cls:'bcell',desc:'+10% squad damage while Heal Burst is ready'},
];
const PERK_BY_ID={};PERSONAL_PERK_POOL.forEach(p=>PERK_BY_ID[p.id]=p);

const EVOLUTION_INTERVAL=3;
const CLASS_EVOLUTIONS={
  taunt:[
    {id:'ev_taunt_dur',name:'Prolonged Taunt',icon:'⏳',desc:'Taunt duration +1.5s'},
    {id:'ev_taunt_range',name:'Wider Broadcast',icon:'📶',desc:'Taunt pull radius +60'},
    {id:'ev_taunt_shield',name:'Protective Aggro',icon:'🛡️',desc:'Taunting grants 30% damage resistance while active'},
  ],
  overdrive:[
    {id:'ev_od_dur',name:'Extended Focus',icon:'⏳',desc:'Overdrive duration +1.5s'},
    {id:'ev_od_cd',name:'Rapid Recovery',icon:'🔁',desc:'Overdrive cooldown -25%'},
    {id:'ev_od_dmg',name:'Enzyme Surge',icon:'⚡',desc:'Overdrive also grants +20% damage while active'},
  ],
  heal:[
    {id:'ev_heal_amt',name:'Concentrated Dose',icon:'💉',desc:'Heal Burst restores 50% more'},
    {id:'ev_heal_range',name:'Broadcast Signal',icon:'📡',desc:'Heal Burst range +80'},
    {id:'ev_heal_cd',name:'Fast Synthesis',icon:'🔁',desc:'Heal Burst cooldown -25%'},
  ],
  dash:[
    {id:'ev_dash_dur',name:'Extended Invulnerability',icon:'⏳',desc:'Dash invulnerability +0.2s'},
    {id:'ev_dash_cd',name:'Fast Twitch',icon:'🔁',desc:'Dash cooldown -25%'},
    {id:'ev_dash_dmg',name:'Piercing Strike',icon:'🗡️',desc:'Dashing through an enemy damages it'},
  ],
};
const EVO_BY_ID={};Object.values(CLASS_EVOLUTIONS).flat().forEach(e=>EVO_BY_ID[e.id]=e);

const DRAFT_DURATIONS={squad:20,personal:18,evolution:16};
const RESPAWN_SECONDS=8;
