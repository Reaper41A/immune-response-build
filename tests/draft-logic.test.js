global.choice=arr=>arr[Math.floor(Math.random()*arr.length)];
global.randi=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
global.rand=(a,b)=>a+Math.random()*(b-a);
global.clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
global.SIM={upgrades:{},barrierCharges:0,bodyHp:1000,bodyHpMax:1000,turrets:[],organs:{heart:100,lungs:100,brain:100}};

const fs=require('fs');
const vm=require('vm');
const path='/home/claude/immunegame/immune-response-build/public/js/';
vm.runInThisContext(fs.readFileSync(path+'data.js','utf8'),{filename:'data.js'});

function drawRarityCard(pool,eligibleFn,excludeIds){
  let tier=rollRarity();
  while(tier){
    const candidates=pool.filter(c=>c.rarity===tier&&!excludeIds.has(c.id)&&eligibleFn(c));
    if(candidates.length)return choice(candidates);
    tier=rarityBelow(tier);
  }
  return null;
}
function drawDraftOptions(pool,eligibleFn,count){
  const excludeIds=new Set();
  const opts=[];
  for(let i=0;i<count;i++){
    const card=drawRarityCard(pool,eligibleFn,excludeIds);
    if(!card)break;
    excludeIds.add(card.id);
    opts.push(card.id);
  }
  return opts;
}

// 1) Rarity distribution over many slot draws
let tally={common:0,elite:0,epic:0,legendary:0};
let cardCount={};
for(let i=0;i<3000;i++){
  const opts=drawDraftOptions(UPGRADE_POOL,upgradeEligible,3);
  for(const id of opts){
    const c=UPG_BY_ID[id];
    tally[c.rarity]++;
    cardCount[id]=(cardCount[id]||0)+1;
  }
}
console.log("Rarity distribution over 9000 slot draws:",tally);
const pct=k=>(100*tally[k]/9000).toFixed(1)+'%';
console.log(`common=${pct('common')} elite=${pct('elite')} epic=${pct('epic')} legendary=${pct('legendary')}`);
console.log("Unique squad cards ever drawn:",Object.keys(cardCount).length,"/",UPGRADE_POOL.length);

// 2) Stack cap enforcement
SIM.upgrades={};
const dmgCard=UPG_BY_ID.damage;
for(let i=0;i<10;i++){
  if(upgradeEligible(dmgCard)){
    const amt=nextStackAmount(dmgCard);
    SIM.upgrades.damage=(SIM.upgrades.damage||0)+1;
    SIM.upgrades._dmgPct=(SIM.upgrades._dmgPct||0)+amt;
  }
}
console.log("\nDamage stacks after 10 attempts (cap=5):",SIM.upgrades.damage,"total dmgPct:",SIM.upgrades._dmgPct,"(expected 12+9+7+5+3=36)");
console.log("Still eligible after cap?",upgradeEligible(dmgCard),"(expected false)");

// 3) No duplicate cards within a single draft's 3 options
let dupFound=false;
for(let i=0;i<500;i++){
  const opts=drawDraftOptions(UPGRADE_POOL,upgradeEligible,3);
  if(new Set(opts).size!==opts.length)dupFound=true;
}
console.log("\nDuplicate cards within a single draft ever found?",dupFound,"(expected false)");

// 4) One-time card eligibility (healBody should vanish once full HP)
SIM.bodyHp=1000;SIM.bodyHpMax=1000;
console.log("\nhealBody eligible at full HP?",upgradeEligible(UPG_BY_ID.healBody),"(expected false)");
SIM.bodyHp=500;
console.log("healBody eligible at 50% HP?",upgradeEligible(UPG_BY_ID.healBody),"(expected true)");

// 5) Personal perk pool never offers duplicate/owned cards to a player
const fakePlayer={cls:'nk',_ownedPerks:{}};
let allPicked=new Set();
for(let round=0;round<8;round++){
  const pool=PERSONAL_PERK_POOL.filter(o=>!o.cls||o.cls===fakePlayer.cls);
  const eligible=c=>!fakePlayer._ownedPerks[c.id];
  const opts=drawDraftOptions(pool,eligible,3);
  if(opts.length===0)break;
  const picked=opts[0];
  fakePlayer._ownedPerks[picked]=true;
  allPicked.add(picked);
}
console.log("\nNK player picked",allPicked.size,"unique perks across 8 rounds with no repeats (pool has",PERSONAL_PERK_POOL.filter(o=>!o.cls||o.cls==='nk').length,"eligible cards)");
