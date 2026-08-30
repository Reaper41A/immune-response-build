const fs=require('fs'),vm=require('vm');
const path='/home/claude/immunegame/immune-response-build/public/js/';
global.SIM={upgrades:{},barrierCharges:0,bodyHp:1000,bodyHpMax:1000,turrets:[],organs:{heart:100,lungs:100,brain:100}};
global.choice=arr=>arr[Math.floor(Math.random()*arr.length)];
global.randi=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
global.rand=(a,b)=>a+Math.random()*(b-a);
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
// Simulate a player picking up Toxic Secretion + Cryogenic Payload, then
// check Frostfire Reaction becomes eligible (and isn't before).
const p={cls:'nk',_ownedPerks:{}};
const pool=PERSONAL_PERK_POOL.filter(o=>!o.cls||o.cls===p.cls);
const frostfire=pool.find(c=>c.id==='p_synergyFrostfire');
console.log('Frostfire eligible before prereqs:',frostfire.eligible(p),'(expected false)');
p._poisonPerk=true;
console.log('Frostfire eligible with only poison:',frostfire.eligible(p),'(expected false)');
p._chillPerk=true;
console.log('Frostfire eligible with poison+chill:',frostfire.eligible(p),'(expected true)');

// Vampiric Orbit
const vampiric=pool.find(c=>c.id==='p_synergyVampiricOrbit');
const p2={cls:'macrophage'};
console.log('\nVampiric Orbit eligible with nothing:',vampiric.eligible(p2),'(expected false)');
p2._familiarPerk=true;p2._lifestealFlat=2;
console.log('Vampiric Orbit eligible with both prereqs:',vampiric.eligible(p2),'(expected true)');

// Squad synergy card: Necrotic Bloom requires venomGland+pyroVesicle owned
const nb=UPGRADE_POOL.find(c=>c.id==='synergyBurningVenom');
console.log('\nNecrotic Bloom eligible with nothing:',nb.eligible(),'(expected false)');
SIM.upgrades.venomGland=true;
console.log('Necrotic Bloom eligible with only venom:',nb.eligible(),'(expected false)');
SIM.upgrades.pyroVesicle=true;
console.log('Necrotic Bloom eligible with both:',nb.eligible(),'(expected true)');
