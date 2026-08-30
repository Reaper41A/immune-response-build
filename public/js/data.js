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
    hp:250,speed:90,range:220,weapon:'phagoShotgun',
    ability:{key:'taunt',name:'Taunt',icon:'📣',desc:'Pull nearby enemies to you for 3s',cd:15,duration:3.0}},
  tcell:{name:'T-Cell',icon:'🎯',color:'#3ee8c8',role:'DPS',
    desc:'Precise piercing rifle. Overdrive: +60% fire rate, no heat.',
    hp:90,speed:70,range:350,weapon:'enzymeBeam',
    ability:{key:'overdrive',name:'Overdrive',icon:'⚙️',desc:'+60% fire rate, no heat for 4s',cd:20,duration:4}},
  bcell:{name:'B-Cell',icon:'✚',color:'#ffd166',role:'Support',
    desc:'Antibody blaster. Heal Burst repairs allies + Body HP.',
    hp:100,speed:145,range:260,weapon:'antibodyBlaster',
    ability:{key:'heal',name:'Heal Burst',icon:'💠',desc:'Heals nearby allies 60 HP + 80 Body HP',cd:10,duration:0}},
  nk:{name:'Natural Killer',icon:'⚡',color:'#c084fc',role:'Assassin',
    desc:'Dual SMGs, crit-focused. Dash grants brief invulnerability.',
    hp:90,speed:185,range:290,weapon:'dualSmg',
    ability:{key:'dash',name:'Dash',icon:'💨',desc:'Burst forward, brief invulnerability',cd:10,duration:0.25}},
};

const WEAPONS={
  antibodyBlaster:{name:'Antibody Blaster',dmg:9,rate:0.20,spread:0.05,speed:640,pierce:0,color:'#7fd6ff',proj:1,ammoMax:36,heatPerShot:0.05,heatDecay:0.45,overheatLock:1.4},
  enzymeBeam:{name:'Enzyme Beam',dmg:50,rate:1.0,spread:0.015,speed:900,pierce:3,color:'#3ee8c8',proj:1,ammoMax:28,heatPerShot:0.065,heatDecay:0.4,overheatLock:1.5},
  phagoShotgun:{name:'Phagocytosis Shotgun',dmg:6,rate:0.60,spread:0.29,speed:560,pierce:0,color:'#7fd6ff',proj:6,knockback:60,ammoMax:14,heatPerShot:0.13,heatDecay:0.35,overheatLock:1.6},
  dualSmg:{name:'Dual SMG',dmg:4,rate:0.065,spread:0.12,speed:700,pierce:0,color:'#c084fc',proj:1,critChance:0.32,ammoMax:44,heatPerShot:0.045,heatDecay:0.5,overheatLock:1.3},
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
  virus:{name:'Virus',hp:26,speed:104,dmg:30,radius:13,color:'#ff4d6d',glow:'#ff9fb0',ep:8,erratic:true,minWave:2,
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

/* ------------------------------- rarity system
   Four tiers shared by all three draft pools. Each draft slot rolls a tier
   independently (weighted), then draws a random eligible card of that tier.
   If a tier has nothing eligible left (maxed stacks, class mismatch, already
   owned, unmet prereqs), we fall back a tier rather than reroll blind — a
   legendary roll with no legendary content available becomes an epic roll,
   etc., so a slot is never wasted and early waves never dead-end reaching
   for content that isn't unlocked yet. */
const RARITY=['common','elite','epic','legendary'];
const RARITY_WEIGHT={common:0.60,elite:0.275,epic:0.115,legendary:0.01};
const RARITY_COLOR={common:'#b7c4cc',elite:'#5eb6ff',epic:'#c084fc',legendary:'#ffd166'};
const RARITY_LABEL={common:'COMMON',elite:'ELITE',epic:'EPIC',legendary:'LEGENDARY'};
function rollRarity(){
  const r=Math.random();let acc=0;
  for(const t of RARITY){acc+=RARITY_WEIGHT[t];if(r<acc)return t;}
  return'common';
}
function rarityBelow(t){const i=RARITY.indexOf(t);return i>0?RARITY[i-1]:null;}

/* ------------------------------- upgrades / perks / evolutions
   Squad draft: shared upgrades bought with pooled EP, whole-squad group vote.
   Repeatable cards (damage/fireRate/moveSpeed/economy/turret/barrier) carry
   maxStacks + a diminishing per-stack scale so no card is a free infinite
   scale-past-the-enemy-curve button; once a repeatable hits its cap it is
   filtered out of future draws entirely (see eligibleSquadUpgrades). One-time
   cards (healBody/organRepair) are conditionally eligible — they simply
   don't get drawn when there's nothing for them to do, instead of showing up
   dead. bodyMax and the class-neutral "capstone" legendaries are one-time
   per run. */
const UPGRADE_POOL=[
  // ---- COMMON: cheap, small, always relevant early
  {id:'healBody',name:'Medicine Administered',icon:'💉',cat:'survival',rarity:'common',cost:90,
    desc:'Restore 200 Body HP right now',oneTime:true,
    eligible:()=>SIM.bodyHp<SIM.bodyHpMax*0.8},
  {id:'damage',name:'Corrosive Enzymes',icon:'🧪',cat:'weapons',rarity:'common',cost:90,
    desc:'+{amt}% weapon damage for the whole squad',stack:{max:5,amounts:[12,9,7,5,3]}},
  {id:'fireRate',name:'Rapid Mitosis',icon:'🔁',cat:'weapons',rarity:'common',cost:100,
    desc:'+{amt}% fire rate for the whole squad',stack:{max:5,amounts:[8,6,5,4,3]}},
  {id:'moveSpeed',name:'Chemotaxis Boost',icon:'💨',cat:'mobility',rarity:'common',cost:80,
    desc:'+{amt}% move speed for the whole squad',stack:{max:4,amounts:[10,7,5,3]}},
  {id:'economy',name:'Antigen Memory',icon:'📈',cat:'economy',rarity:'common',cost:110,
    desc:'+{amt}% Evolution Points earned',stack:{max:4,amounts:[15,11,8,5]}},
  {id:'barrier',name:'Barrier Field',icon:'🔮',cat:'defense',rarity:'common',cost:110,
    desc:'+1 charge: next leak deals 30% less damage (max 3 charges)',
    eligible:()=>SIM.barrierCharges<3},
  // ---- ELITE: bigger, single dedicated tools
  {id:'bodyMax',name:'Expand Body HP',icon:'❤️',cat:'survival',rarity:'elite',cost:160,
    desc:'+150 max Body HP, healed to match',stack:{max:6,amounts:[150,150,150,150,150,150]}},
  {id:'turret',name:'Antibody Turret',icon:'🗼',cat:'defense',rarity:'elite',cost:150,
    desc:'Deploy an auto-firing turret near the Body (max 4)',
    eligible:()=>SIM.turrets.length<4},
  {id:'organRepair',name:'Regenerative Tissue',icon:'🩹',cat:'survival',rarity:'elite',cost:140,
    desc:'Fully restore the most damaged organ & clear its debuff',oneTime:true,
    eligible:()=>Object.values(SIM.organs).some(v=>v<100)},
  {id:'ricochetRounds',name:'Ricochet Rounds',icon:'💫',cat:'weapons',rarity:'elite',cost:150,
    desc:'Squad shots bounce off the arena edge +1 additional time',
    stack:{max:2,amounts:[1,1]}},
  {id:'thickMembrane',name:'Thickened Membrane',icon:'🛡️',cat:'survival',rarity:'elite',cost:150,
    desc:'-10% damage taken by all players (stacks)',stack:{max:3,amounts:[10,7,5]}},
  {id:'scavengeDrive',name:'Scavenger Instinct',icon:'🔍',cat:'economy',rarity:'elite',cost:140,
    desc:'+20% chance enemies drop ammo pickups',stack:{max:3,amounts:[20,15,10]}},
  // ---- EPIC: strong, mostly one-shot toolkit pieces
  {id:'secondTurretRow',name:'Turret Overclock',icon:'⚙️',cat:'defense',rarity:'epic',cost:220,
    desc:'All deployed turrets fire 35% faster',oneTime:true},
  {id:'organShield',name:'Organ Ward',icon:'🫀',cat:'survival',rarity:'epic',cost:230,
    desc:'Organs take 40% less chip damage from leaks for the rest of the run',oneTime:true},
  {id:'bloodhoundEP',name:'Bloodhound Enzymes',icon:'🧭',cat:'economy',rarity:'epic',cost:210,
    desc:'+35% EP from elite-tagged kills specifically',oneTime:true},
  {id:'overflowAmmo',name:'Overflow Vesicles',icon:'🔋',cat:'weapons',rarity:'epic',cost:200,
    desc:'Squad ammo capacity +30%, all players refilled now',oneTime:true},
  {id:'secondWindShield',name:'Second Wind',icon:'💠',cat:'survival',rarity:'epic',cost:240,
    desc:'The next time Body HP would hit 0 this run, it survives at 15% instead (one charge)',oneTime:true},
  // ---- LEGENDARY: rare, build-defining, unique mechanics not just numbers
  {id:'bioluminescence',name:'Bioluminescent Cascade',icon:'✨',cat:'weapons',rarity:'legendary',cost:420,
    desc:'On kill, 25% chance to fire a chain spark that jumps to a nearby enemy for 60% damage',oneTime:true},
  {id:'hiveMind',name:'Hive Mind Protocol',icon:'🧠',cat:'economy',rarity:'legendary',cost:400,
    desc:'All squad ability cooldowns -20%, permanently, for every player',oneTime:true},
  {id:'lastLine',name:'Last Line of Defense',icon:'⚔️',cat:'defense',rarity:'legendary',cost:450,
    desc:'Deploy 2 heavy sentry turrets (don\u2019t count toward the normal turret cap) that deal double damage',oneTime:true},
  {id:'apexMetabolism',name:'Apex Metabolism',icon:'🔥',cat:'weapons',rarity:'legendary',cost:440,
    desc:'+25% squad damage AND +15% fire rate — bypasses normal stacking caps',oneTime:true},
];
const CAT_COLOR={survival:'#8fe36a',weapons:'#ff8ea0',economy:'#3ee8c8',mobility:'#7fd6ff',defense:'#ffd166'};
const UPG_BY_ID={};UPGRADE_POOL.forEach(u=>UPG_BY_ID[u.id]=u);

/* Squad-EP income grows with the wave (wave 1 ~70-100 EP -> wave 5
   ~150-170 EP), but upgrade.cost was a flat wave-1 baseline forever, so
   later drafts became trivially affordable and stopped being a real
   choice. Scale cost with the wave instead of mutating the base pool —
   every read site below goes through this so the pool stays the single
   source of truth for the wave-1 price. +9%/wave, mirroring the roughly
   +25-30% per-wave EP growth from planWave's budget curve but slightly
   gentler so upgrades still get relatively more affordable over a run,
   just not so fast that wave 5+ drafts become no-brainers. Rarer tiers
   also cost more outright, on top of the wave scaling, so a legendary pull
   still represents a real spend, not a strictly-better freebie. */
const RARITY_COST_MULT={common:1,elite:1.35,epic:1.7,legendary:2.1};
function scaledCost(upg,wave){
  const base=upg.cost*(RARITY_COST_MULT[upg.rarity]||1);
  return Math.round(base*(1+0.09*Math.max(0,(wave||1)-1)));
}
/* Current stack count for a repeatable upgrade, and whether it's maxed. */
function upgStacks(id){return(SIM.upgrades[id]||0);}
function upgMaxed(upg){return!!upg.stack&&upgStacks(upg.id)>=upg.stack.max;}
/* The % (or flat) amount the NEXT stack of a repeatable card grants —
   diminishing returns baked into the amounts array so late stacks are
   real but small, instead of every stack being equally strong forever. */
function nextStackAmount(upg){
  if(!upg.stack)return null;
  const n=upgStacks(upg.id);
  return upg.stack.amounts[Math.min(n,upg.stack.amounts.length-1)];
}
/* A card is eligible for the current game state if: any one-time already-
   owned flag isn't set, any repeatable isn't maxed, and any custom eligible()
   predicate (body-hp threshold, organ damaged, turret slots free, etc.)
   passes. Used both when building draft options and as the tier-fallback
   filter. */
function upgradeEligible(upg){
  if(upg.oneTime&&SIM.upgrades[upg.id])return false;
  if(upg.stack&&upgMaxed(upg))return false;
  if(upg.eligible&&!upg.eligible())return false;
  return true;
}

const PERSONAL_PERK_POOL=[
  // ---- COMMON: universal, small
  {id:'p_ammoMax',name:'Larger Vesicles',icon:'🔋',rarity:'common',desc:'+25% max ammo capacity'},
  {id:'p_heatEff',name:'Thermal Regulation',icon:'❄️',rarity:'common',desc:'-20% heat generated per shot'},
  {id:'p_abilityCd',name:'Faster Signaling',icon:'⏱️',rarity:'common',desc:'-20% ability cooldown'},
  {id:'p_speed',name:'Cytoskeleton Boost',icon:'🏃',rarity:'common',desc:'+12% personal move speed'},
  {id:'p_hp',name:'Membrane Reinforcement',icon:'🧬',rarity:'common',desc:'+20 max HP, healed to match'},
  {id:'p_pickupRange',name:'Chemoreceptors',icon:'📡',rarity:'common',desc:'Collect organic matter from further away'},
  // ---- ELITE: universal, stronger single tools
  {id:'p_pierce',name:'Penetrating Enzyme',icon:'🗡️',rarity:'elite',desc:'Shots pierce 1 additional enemy'},
  {id:'p_bounce',name:'Ricochet Membrane',icon:'💫',rarity:'elite',desc:'Shots bounce off arena edges twice'},
  {id:'p_regen',name:'Cellular Repair',icon:'💚',rarity:'elite',desc:'Regenerate 1.5% max HP per second while out of combat'},
  {id:'p_lifesteal',name:'Necrotrophic Feed',icon:'🩸',rarity:'elite',desc:'Killing an enemy heals you for 2 HP'},
  // ---- Macrophage (Tank) tree
  {id:'p_dmg_macrophage',name:'Digestive Enzymes',icon:'💥',cls:'macrophage',rarity:'common',desc:'+40% splash radius on shotgun hits'},
  {id:'p_mac_knockback',name:'Concussive Burst',icon:'👊',cls:'macrophage',rarity:'common',desc:'+50% shotgun knockback'},
  {id:'p_mac_tauntheal',name:'Aggro Metabolism',icon:'🛡️',cls:'macrophage',rarity:'elite',desc:'Regenerate 3% max HP per second while Taunt is active'},
  {id:'p_mac_bulwark',name:'Living Bulwark',icon:'🧱',cls:'macrophage',rarity:'epic',desc:'+25% max HP, but -8% move speed'},
  {id:'p_mac_retaliate',name:'Phagocytic Retaliation',icon:'☠️',cls:'macrophage',rarity:'legendary',desc:'Enemies taunted by you take 15% more damage from the whole squad'},
  // ---- T-Cell (DPS) tree
  {id:'p_dmg_tcell',name:'Cytotoxic Payload',icon:'☣️',cls:'tcell',rarity:'common',desc:'+18% damage to pierced targets'},
  {id:'p_tcell_focus',name:'Focused Beam',icon:'🎯',cls:'tcell',rarity:'common',desc:'+10% damage to the first enemy hit each shot'},
  {id:'p_tcell_heatvent',name:'Heat Venting',icon:'♨️',cls:'tcell',rarity:'elite',desc:'Overdrive also purges all current heat on activation'},
  {id:'p_tcell_railgun',name:'Railgun Focus',icon:'🚀',cls:'tcell',rarity:'epic',desc:'+3 pierce, -20% projectile spread'},
  {id:'p_tcell_lance',name:'Enzyme Lance',icon:'⚡',cls:'tcell',rarity:'legendary',desc:'Beam shots deal full damage to every enemy pierced instead of falling off'},
  // ---- B-Cell (Support) tree
  {id:'p_dmg_bcell',name:'Amplified Antibodies',icon:'✨',cls:'bcell',rarity:'common',desc:'+10% squad damage while Heal Burst is ready'},
  {id:'p_bcell_shield',name:'Antibody Shielding',icon:'🔵',cls:'bcell',rarity:'common',desc:'Heal Burst also grants allies a 20 HP shield'},
  {id:'p_bcell_reach',name:'Wide Broadcast',icon:'📶',cls:'bcell',rarity:'elite',desc:'+25% weapon range'},
  {id:'p_bcell_overheal',name:'Antibody Surplus',icon:'💫',cls:'bcell',rarity:'epic',desc:'Heal Burst overheal converts to a temporary 15% damage buff for 6s'},
  {id:'p_bcell_martyr',name:'Selfless Cascade',icon:'👼',cls:'bcell',rarity:'legendary',desc:'When Heal Burst is used, fully revive the lowest-HP downed ally if any exist'},
  // ---- Natural Killer (Assassin) tree
  {id:'p_dmg_nk',name:'Perforin Overdrive',icon:'🔪',cls:'nk',rarity:'common',desc:'+15% crit chance'},
  {id:'p_nk_critdmg',name:'Serrated Granules',icon:'🗡️',cls:'nk',rarity:'common',desc:'+30% critical hit damage'},
  {id:'p_nk_dashcrit',name:'Ambush Predator',icon:'💨',cls:'nk',rarity:'elite',desc:'The first shot after a Dash is a guaranteed critical hit'},
  {id:'p_nk_bloodlust',name:'Bloodlust Cascade',icon:'🩸',cls:'nk',rarity:'epic',desc:'Each kill grants +2% fire rate for 4s, stacking up to 5 times'},
  {id:'p_nk_executioner',name:'Executioner\u2019s Strike',icon:'💀',cls:'nk',rarity:'legendary',desc:'Critical hits against enemies below 25% HP instantly execute them'},
];
const PERK_BY_ID={};PERSONAL_PERK_POOL.forEach(p=>PERK_BY_ID[p.id]=p);

const EVOLUTION_INTERVAL=3;
/* ------------------------------- evolutions (branching, per-class-locked)
   Each ability key (taunt/overdrive/heal/dash — one per class, so this is
   still fully class-locked, never cross-class) now has:
     shared:   small common/elite pool anyone on that ability can draw from,
               available before AND after a branch is chosen.
     branches: named sub-paths (2 today, more can be appended later — the
               system doesn't assume exactly 2) that only unlock once picked
               and only offer their own epic/legendary capstone card to
               players who went down that path. This replaces the old
               single linear list — a player is no longer locked into one
               fixed tree with a dead end at 7 cards; they pick a path
               *shape*, not a single predetermined card order, roughly
               doubling total content per ability. Even so, a long enough
               run can still exhaust a branch eventually — see
               drawDraftOptions/makeEpFillerCard in waves.js, which
               guarantees every slot is filled regardless. */
const CLASS_EVOLUTIONS={
  taunt:{
    shared:[
      {id:'ev_taunt_dur',name:'Prolonged Taunt',icon:'⏳',rarity:'common',desc:'Taunt duration +1.5s'},
      {id:'ev_taunt_range',name:'Wider Broadcast',icon:'📶',rarity:'common',desc:'Taunt pull radius +60'},
      {id:'ev_taunt_cd',name:'Faster Recovery',icon:'🔁',rarity:'common',desc:'Taunt cooldown -20%'},
      {id:'ev_taunt_uptime',name:'Persistent Signal',icon:'📶',rarity:'common',desc:'Taunt duration +1s and cooldown -10%'},
    ],
    branches:{
      bulwark:{
        name:'Bulwark',icon:'🛡️',
        desc:'Turn Taunt into a defensive anchor — soak more, survive more.',
        cards:[
          {id:'ev_taunt_shield',name:'Protective Aggro',icon:'🛡️',rarity:'elite',desc:'Taunting grants 30% damage resistance while active'},
          {id:'ev_taunt_regen',name:'Aggro Metabolism II',icon:'💚',rarity:'elite',desc:'Regenerate 2% max HP per second while Taunt is active'},
          {id:'ev_taunt_apex',name:'Absolute Aggro',icon:'👑',rarity:'legendary',desc:'While Taunt is active, you take 60% less damage and reflect 20% of it back'},
        ],
      },
      retaliation:{
        name:'Retaliation',icon:'🦔',
        desc:'Turn Taunt into a punishment tool — every enemy it grabs pays for it.',
        cards:[
          {id:'ev_taunt_thorns',name:'Reactive Membrane',icon:'🦔',rarity:'elite',desc:'Enemies taunted by you take 15% more damage'},
          {id:'ev_taunt_double',name:'Split Signal',icon:'📡',rarity:'elite',desc:'Taunt can be re-activated once more before going on cooldown'},
          {id:'ev_taunt_thornsapex',name:'Perfect Storm',icon:'👑',rarity:'legendary',desc:'Enemies taunted by you take 15% more damage from the whole squad, not just you'},
        ],
      },
    },
  },
  overdrive:{
    shared:[
      {id:'ev_od_dur',name:'Extended Focus',icon:'⏳',rarity:'common',desc:'Overdrive duration +1.5s'},
      {id:'ev_od_cd',name:'Rapid Recovery',icon:'🔁',rarity:'common',desc:'Overdrive cooldown -25%'},
      {id:'ev_od_ammo',name:'Efficient Cycling',icon:'🔋',rarity:'common',desc:'Overdrive no longer consumes ammo'},
      {id:'ev_od_windup',name:'Fast Ignition',icon:'⚡',rarity:'common',desc:'Overdrive reaches full fire rate instantly instead of ramping up'},
    ],
    branches:{
      offense:{
        name:'Offense',icon:'⚡',
        desc:'Overdrive hits harder while it\u2019s up.',
        cards:[
          {id:'ev_od_dmg',name:'Enzyme Surge',icon:'⚡',rarity:'elite',desc:'Overdrive also grants +20% damage while active'},
          {id:'ev_od_pierce',name:'Overcharged Beam',icon:'🗡️',rarity:'elite',desc:'+2 pierce while Overdrive is active'},
          {id:'ev_od_apex',name:'Absolute Zero Heat',icon:'👑',rarity:'legendary',desc:'Overdrive duration doubled, and firing during it slowly heals nearby allies'},
        ],
      },
      sustain:{
        name:'Sustain',icon:'🔗',
        desc:'Overdrive keeps itself going.',
        cards:[
          {id:'ev_od_chain',name:'Resonant Cascade',icon:'🔗',rarity:'elite',desc:'While Overdrive is active, killing an enemy resets 15% of the cooldown'},
          {id:'ev_od_heatvent2',name:'Deep Venting',icon:'♨️',rarity:'elite',desc:'Overdrive purges all heat on activation AND on expiry'},
          {id:'ev_od_chainapex',name:'Endless Cycle',icon:'👑',rarity:'legendary',desc:'Every 3rd kill during Overdrive fully resets its cooldown'},
        ],
      },
    },
  },
  heal:{
    shared:[
      {id:'ev_heal_amt',name:'Concentrated Dose',icon:'💉',rarity:'common',desc:'Heal Burst restores 50% more'},
      {id:'ev_heal_range',name:'Broadcast Signal',icon:'📡',rarity:'common',desc:'Heal Burst range +80'},
      {id:'ev_heal_cd',name:'Fast Synthesis',icon:'🔁',rarity:'common',desc:'Heal Burst cooldown -25%'},
      {id:'ev_heal_cleanse',name:'Detox Pulse',icon:'🧪',rarity:'common',desc:'Heal Burst also clears one damaged-organ debuff if any is active'},
    ],
    branches:{
      shielding:{
        name:'Shielding',icon:'🔵',
        desc:'Heal Burst protects as much as it repairs.',
        cards:[
          {id:'ev_heal_shield',name:'Antibody Barrier',icon:'🔵',rarity:'elite',desc:'Heal Burst grants allies a temporary shield equal to 25% of the heal'},
          {id:'ev_heal_shield2',name:'Reinforced Barrier',icon:'🔵',rarity:'elite',desc:'Shields granted by Heal Burst last 3s longer and absorb 15% more'},
          {id:'ev_heal_apex',name:'Miracle Cascade',icon:'👑',rarity:'legendary',desc:'Heal Burst also fully revives one downed ally at half HP'},
        ],
      },
      overflow:{
        name:'Overflow',icon:'✨',
        desc:'Heal Burst becomes a resource you can spend more often, harder.',
        cards:[
          {id:'ev_heal_double',name:'Dual Synthesis',icon:'✨',rarity:'elite',desc:'Heal Burst can be stored as 2 charges'},
          {id:'ev_heal_overheal2',name:'Antibody Surplus II',icon:'💫',rarity:'elite',desc:'Heal Burst overheal converts to a 20% damage buff for 8s'},
          {id:'ev_heal_martyrapex',name:'Selfless Cascade',icon:'👑',rarity:'legendary',desc:'When Heal Burst is used, fully revive the lowest-HP downed ally if any exist'},
        ],
      },
    },
  },
  dash:{
    shared:[
      {id:'ev_dash_dur',name:'Extended Invulnerability',icon:'⏳',rarity:'common',desc:'Dash invulnerability +0.2s'},
      {id:'ev_dash_cd',name:'Fast Twitch',icon:'🔁',rarity:'common',desc:'Dash cooldown -25%'},
      {id:'ev_dash_speed',name:'Explosive Burst',icon:'💨',rarity:'common',desc:'Dash travel distance +30%'},
      {id:'ev_dash_windup',name:'Instant Reflex',icon:'💨',rarity:'common',desc:'Dash has no startup delay'},
    ],
    branches:{
      striker:{
        name:'Striker',icon:'🗡️',
        desc:'Dash becomes an attack, not just a getaway.',
        cards:[
          {id:'ev_dash_dmg',name:'Piercing Strike',icon:'🗡️',rarity:'elite',desc:'Dashing through an enemy damages it'},
          {id:'ev_dash_dmg2',name:'Serrated Momentum',icon:'🗡️',rarity:'elite',desc:'Dash damage +50%, and it now knocks enemies back'},
          {id:'ev_dash_apex',name:'Phantom Predator',icon:'👑',rarity:'legendary',desc:'While invulnerable from Dash, your next shot after it is a guaranteed critical hit that pierces all enemies'},
        ],
      },
      momentum:{
        name:'Momentum',icon:'🔗',
        desc:'Dash chains into itself the more you use it.',
        cards:[
          {id:'ev_dash_reset',name:'Kill Momentum',icon:'🔁',rarity:'elite',desc:'Killing an enemy within 1s of dashing refunds 40% of the cooldown'},
          {id:'ev_dash_chain',name:'Blink Chain',icon:'🔗',rarity:'elite',desc:'Dash can be used twice in a row before going on cooldown'},
          {id:'ev_dash_chainapex',name:'Flicker Step',icon:'👑',rarity:'legendary',desc:'Each consecutive Dash within 2s of the last is 20% stronger (damage/refund), stacking up to 3 times'},
        ],
      },
    },
  },
};
/* Flat id->card lookup across shared + every branch of every ability, built
   once at load. Adding a new branch or card to CLASS_EVOLUTIONS above is
   automatically picked up here — nothing else needs touching. */
const EVO_BY_ID={};
for(const abKey in CLASS_EVOLUTIONS){
  const tree=CLASS_EVOLUTIONS[abKey];
  tree.shared.forEach(e=>EVO_BY_ID[e.id]=e);
  for(const bKey in tree.branches)tree.branches[bKey].cards.forEach(e=>EVO_BY_ID[e.id]=e);
}

// squad: timeout for the shared body-draft vote — group decision, but capped
// so one AFK/disconnected squadmate can't stall the run forever (unvoted
// members count as an implicit skip once time runs out; see resolveSquadDraft)
const DRAFT_DURATIONS={squad:20,personal:25,evolution:20};
const RESPAWN_SECONDS=8;
