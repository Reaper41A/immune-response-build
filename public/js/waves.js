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
  // Second Wind (legendary, one-time): the first time this run Body HP would
  // hit 0, survive at 15% instead. Consumed immediately so it can't loop.
  if(SIM.bodyHp<=0&&SIM.upgrades.secondWindShield){
    SIM.upgrades.secondWindShield=false;
    SIM.bodyHp=Math.round(SIM.bodyHpMax*0.15);
    ev({k:'say',sys:true,text:'Second Wind triggered — the Body survives at 15%!',color:'#ffd166'});
  }
  SIM.runStats.leaks++;
  SIM.waveStats.leaked++;
  const c=worldCore();
  ev({k:'leak',x:c.x,y:c.y-coreRadius(),dmg:Math.round(dmg),fromAngle:angleTo(c.x,c.y,en.x,en.y)});
  maybeDamageOrgan();
}
function maybeDamageOrgan(){
  const k=choice(Object.keys(SIM.organs));
  const chip=Math.round(randi(8,16)*(SIM.upgrades.organShield?0.6:1));
  if(SIM.organs[k]>0){
    SIM.organs[k]=Math.max(0,SIM.organs[k]-chip);
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
/* Rarity-weighted draw shared by all three draft pools: roll a tier per
   slot, draw a random ELIGIBLE card of that tier, falling back a tier at a
   time if nothing's eligible there, and never repeat a card already
   offered in this same draft. `pool` is the full card array, `eligibleFn`
   filters by current game state, `excludeIds` is a running set of ids
   already placed in this draft's option list (so slot 2 can't just repeat
   slot 1). Returns null only if every rarity tier in `pool` is exhausted —
   drawDraftOptions below is what guarantees the slot still gets filled. */
function drawRarityCard(pool,eligibleFn,excludeIds){
  let tier=rollRarity();
  while(tier){
    const candidates=pool.filter(c=>c.rarity===tier&&!excludeIds.has(c.id)&&eligibleFn(c));
    if(candidates.length)return choice(candidates);
    tier=rarityBelow(tier);
  }
  return null;
}
/* Fills every requested slot, no exceptions — a draft screen with fewer
   cards than it advertised reads as broken, and with enough hours in a run
   a pool WILL eventually run dry of fresh content no matter how big we make
   it, so "the pool might not have enough" has to be handled here rather
   than assumed away. Fallback order once the normal rarity draw comes up
   empty (same spirit as StS/Hades-style keep-the-offer-full decks):
     1. any remaining eligible card in the pool, ignoring rarity entirely
        (still no duplicates within this draft)
     2. a scaled EP/consumable filler card generated on the fly — never a
        blank slot, and never a reoffered already-owned card standing in
        at a discount, since that would just be a worse version of a pick
        the player already made deliberately.
   `fillerFactory`, if provided, is called to build filler card #2 above;
   callers that have nothing sensible to fill with (there always will be
   something — EP exists in every draft context) must still supply one. */
function drawDraftOptions(pool,eligibleFn,count,fillerFactory){
  const excludeIds=new Set();
  const opts=[];
  for(let i=0;i<count;i++){
    let card=drawRarityCard(pool,eligibleFn,excludeIds);
    if(!card){
      // Tier fallback exhausted — try ANY still-eligible card regardless of
      // rarity before giving up on the pool entirely.
      const any=pool.filter(c=>!excludeIds.has(c.id)&&eligibleFn(c));
      card=any.length?choice(any):null;
    }
    if(!card&&fillerFactory){
      // Pool is fully exhausted (every card owned/maxed/ineligible) — mint
      // a one-off filler instead of leaving the slot blank.
      card=fillerFactory(i,excludeIds);
    }
    if(!card)break; // only reachable if no fillerFactory was given at all
    excludeIds.add(card.id);
    opts.push(card.id);
  }
  return opts;
}
/* Filler card factories: last-resort fallback once a pool is completely
   tapped out (every card owned/maxed/ineligible) — see drawDraftOptions.
   Each mints a fresh id per call so it never collides with a draft's
   excludeIds, and registers itself in FILLER_BY_ID so cost lookups
   (scaledCost reads upg.cost/upg.rarity) and the apply path can treat it
   like any other card without special-casing "is this a filler" at every
   call site. Never a blank slot, never a reoffered already-owned card. */
let fillerSeq=0;
const FILLER_BY_ID={};
// Squad draft spends EP, so its filler needs a cost like any UPGRADE_POOL
// card — priced as a cheap common so it's always the safety-net option,
// never competitive with an actual roll.
function makeSquadFillerCard(){
  const id='fill_sq_'+(fillerSeq++);
  const card={id,name:'Improvised Remedy',icon:'🧫',cat:'survival',rarity:'common',cost:70,
    desc:'Restore 120 Body HP right now',isFiller:true,oneTime:false};
  FILLER_BY_ID[id]=card;UPG_BY_ID[id]=card;
  return card;
}
// Personal/evolution drafts grant EP outright instead — there's no
// meaningful "cost", they're always free picks.
function makeEpFillerCard(){
  const id='fill_ep_'+(fillerSeq++);
  const amt=60+SIM.wave*8;
  const card={id,name:'Reserve Nutrients',icon:'🧫',rarity:'common',
    desc:`Grants +${amt} EP`,isFiller:true,epAmt:amt};
  FILLER_BY_ID[id]=card;
  return card;
}
function enterSquadDraft(){
  SIM.phase='squadDraft';
  const opts=drawDraftOptions(UPGRADE_POOL,upgradeEligible,3,makeSquadFillerCard);
  // Guarantee the squad can always afford at least the cheapest of the three
  // offered cards. Early waves (esp. wave 1) can't realistically earn enough
  // kill EP to afford anything — the draft would silently resolve to
  // "nothing affordable" every single time, which read as a dead/broken
  // screen. This tops EP up to the floor needed, never lowers it.
  const cheapest=opts.length?Math.min(...opts.map(id=>scaledCost(UPG_BY_ID[id],SIM.wave))):0;
  if(SIM.ep<cheapest){
    const shortfall=cheapest-SIM.ep;
    SIM.ep=cheapest;
    ev({k:'say',sys:true,text:`Squad short on EP this wave — topped up +${shortfall} so a pick is always affordable`,color:'#ffd166'});
  }
  // Squad draft is a group decision, but it still needs a timer — without
  // one, a single AFK/disconnected player (see the lobby/tab-drop issue)
  // can stall the whole squad's run indefinitely since resolution only
  // ever fires once everyone has voted. Whoever hasn't voted when time
  // runs out is treated as an implicit "skip" (see resolveDraftTimeouts).
  SIM.draft={options:opts,votes:{},locked:{}};
  SIM.phaseTimer=DRAFT_DURATIONS.squad;SIM.phaseDur=DRAFT_DURATIONS.squad;
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
/* Resolves the group's shared pick once everyone has voted, or once the
   timer runs out. No single player's action can force this early. Anyone
   who hasn't voted by the deadline is treated as an implicit skip — same
   spirit as personal/evolution drafts leaving unpicked slots skipped —
   so one AFK or disconnected squadmate can't stall the run forever.
   If every human voted skip, or nothing affordable got the most votes, no
   upgrade is bought and EP carries over to the next draft. */
function resolveSquadDraft(timedOut){
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
    ev({k:'say',sys:true,text:timedOut?'Squad draft timed out — no pick made':'Squad skipped this pick',color:'#7fd6ff'});
  }
  enterPersonalDrafts();
}
/* Repeatable cards (damage/fireRate/moveSpeed/economy/bodyMax/ricochetRounds/
   thickMembrane/scavengeDrive) store their stack count in SIM.upgrades[id]
   and read the diminishing-returns amount for THIS stack from the card's
   own amounts array, so every stack after the first is deliberately weaker
   — the pool-eligibility check (upgradeEligible/upgMaxed) already keeps a
   card from being drawn once it hits stack.max, so this never over-applies.
   One-time cards set a truthy flag in SIM.upgrades[id] so upgradeEligible
   filters them out of all future draws once bought. */
function applyUpgrade(id){
  const upg=UPG_BY_ID[id];
  // Filler cards (see makeSquadFillerCard) carry a dynamically-generated id
  // that can't be a switch case below — handle them generically instead.
  if(upg&&upg.isFiller){SIM.bodyHp=Math.min(SIM.bodyHpMax,SIM.bodyHp+120);return;}
  const amt=nextStackAmount(upg); // % or flat, per this specific stack
  switch(id){
    case'healBody':SIM.bodyHp=Math.min(SIM.bodyHpMax,SIM.bodyHp+200);SIM.upgrades.healBody=true;break;
    case'bodyMax':SIM.bodyHpMax+=amt;SIM.bodyHp+=amt;SIM.upgrades.bodyMax=(SIM.upgrades.bodyMax||0)+1;break;
    case'damage':SIM.upgrades.damage=(SIM.upgrades.damage||0)+1;SIM.upgrades._dmgPct=(SIM.upgrades._dmgPct||0)+amt;break;
    case'fireRate':SIM.upgrades.fireRate=(SIM.upgrades.fireRate||0)+1;SIM.upgrades._fireRatePct=(SIM.upgrades._fireRatePct||0)+amt;break;
    case'economy':SIM.upgrades.economy=(SIM.upgrades.economy||0)+1;SIM.upgrades._economyPct=(SIM.upgrades._economyPct||0)+amt;break;
    case'moveSpeed':SIM.upgrades.moveSpeed=(SIM.upgrades.moveSpeed||0)+1;for(const p of SIM.players)p.speed*=1+amt/100;break;
    case'turret':
      if(SIM.turrets.length<4){
        const c=worldCore(),a=rand(0,Math.PI*2);
        SIM.turrets.push({x:c.x+Math.cos(a)*170,y:c.y+Math.sin(a)*170,cd:0,range:220});
      }
      break;
    case'barrier':SIM.barrierCharges=Math.min(3,SIM.barrierCharges+1);break;
    case'organRepair':repairWorstOrgan();SIM.upgrades.organRepair=true;break;
    case'ricochetRounds':SIM.upgrades.ricochetRounds=(SIM.upgrades.ricochetRounds||0)+1;for(const p of SIM.players)p._bounceBonus=(p._bounceBonus||0)+amt;break;
    case'thickMembrane':SIM.upgrades.thickMembrane=(SIM.upgrades.thickMembrane||0)+1;SIM.upgrades._dmgReducedPct=Math.min(60,(SIM.upgrades._dmgReducedPct||0)+amt);break;
    case'scavengeDrive':SIM.upgrades.scavengeDrive=(SIM.upgrades.scavengeDrive||0)+1;SIM.upgrades._scavengePct=(SIM.upgrades._scavengePct||0)+amt;break;
    case'secondTurretRow':SIM.upgrades.secondTurretRow=true;break;
    case'organShield':SIM.upgrades.organShield=true;break;
    case'bloodhoundEP':SIM.upgrades.bloodhoundEP=true;break;
    case'overflowAmmo':SIM.upgrades.overflowAmmo=true;for(const p of SIM.players){p.ammoMax=Math.round(p.ammoMax*1.3);p.ammo=p.ammoMax;}break;
    case'secondWindShield':SIM.upgrades.secondWindShield=true;break;
    case'bioluminescence':SIM.upgrades.bioluminescence=true;break;
    case'hiveMind':SIM.upgrades.hiveMind=true;for(const p of SIM.players)p._cdMult=(p._cdMult||1)*0.8;break;
    case'lastLine':
      SIM.upgrades.lastLine=true;
      {const c=worldCore();
       for(let i=0;i<2;i++){const a=rand(0,Math.PI*2);SIM.turrets.push({x:c.x+Math.cos(a)*190,y:c.y+Math.sin(a)*190,cd:0,range:240,heavy:true});}}
      break;
    case'apexMetabolism':SIM.upgrades.apexMetabolism=true;break;
  }
}
function repairWorstOrgan(){
  let worst=null,worstV=Infinity;
  for(const k in SIM.organs)if(SIM.organs[k]<worstV){worstV=SIM.organs[k];worst=k;}
  if(worst){SIM.organs[worst]=100;SIM.debuffs[worst]=false;ev({k:'organ',key:worst});}
}
/* Personal perks and class evolutions are permanent, non-repeatable picks —
   once a player owns one it's tracked in p._ownedPerks / p._ownedEvos and
   never offered to that player again, so a run can't accumulate duplicate
   "Extended Focus" style cards from every subsequent draft. */
function enterPersonalDrafts(){
  SIM.phase='personalDraft';
  SIM.personalDrafts={};
  for(const p of SIM.players){
    if(!p._ownedPerks)p._ownedPerks={};
    const pool=PERSONAL_PERK_POOL.filter(o=>!o.cls||o.cls===p.cls);
    const eligible=c=>!p._ownedPerks[c.id];
    const opts=drawDraftOptions(pool,eligible,3,makeEpFillerCard);
    SIM.personalDrafts[p.pid]={options:opts,picked:null};
  }
  SIM.phaseTimer=DRAFT_DURATIONS.personal;SIM.phaseDur=DRAFT_DURATIONS.personal;
  ev({k:'phase',phase:'personalDraft'});
}
function pickPersonal(pid,id){const d=SIM.personalDrafts[pid];if(d&&!d.picked)d.picked=id;}
/* Evolutions are branching and class-locked (see CLASS_EVOLUTIONS in
   data.js): each player's ability key (taunt/overdrive/heal/dash — fixed by
   their class, never cross-class) has a small shared pool plus 2+ named
   sub-paths. Once a player has taken any card from a branch, p._evoBranch
   locks them to that branch for all FUTURE evolution drafts — this is the
   deliberate "pick a path, commit to it" identity moment you'd expect from
   the genre, whereas before there was no path choice at all, just one fixed
   list that ran out. Before a branch is chosen, both branches' cards are
   eligible (so the choice itself doubles as the branch pick); once locked,
   only the shared pool + that one branch's cards are offered — the other
   branch's cards simply never come up again for that player, same as any
   other build-defining commitment in this genre. */
function evolutionPoolFor(p,abKey){
  const tree=CLASS_EVOLUTIONS[abKey];
  if(!tree)return[];
  const branchKeys=Object.keys(tree.branches);
  const lockedBranch=p._evoBranch&&p._evoBranch[abKey];
  const activeBranches=lockedBranch?[lockedBranch]:branchKeys;
  return tree.shared.concat(activeBranches.flatMap(bk=>tree.branches[bk].cards));
}
function enterEvolutions(){
  SIM.phase='evolution';
  SIM.evolutions={};
  for(const p of SIM.players){
    if(!p._ownedEvos)p._ownedEvos={};
    if(!p._evoBranch)p._evoBranch={};
    const abKey=CLASSES[p.cls].ability.key;
    const pool=evolutionPoolFor(p,abKey);
    const eligible=c=>!p._ownedEvos[c.id];
    const opts=drawDraftOptions(pool,eligible,3,makeEpFillerCard);
    SIM.evolutions[p.pid]={options:opts,picked:null,abKey};
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
    if(d&&d.picked){
      if(FILLER_BY_ID[d.picked])SIM.ep+=FILLER_BY_ID[d.picked].epAmt;
      else{applyPerk(p,d.picked);if(!p._ownedPerks)p._ownedPerks={};p._ownedPerks[d.picked]=true;}
    }
  }
  if(timedOut)ev({k:'say',sys:true,text:'Perk draft timed out — unpicked slots skipped',color:'#93a9b4'});
  if(SIM.wave%EVOLUTION_INTERVAL===0)enterEvolutions();
  else nextWave();
}
/* Which named branch (if any) a given evolution card id belongs to, for the
   ability key it was drawn under — used to lock the player into that branch
   the moment they take their first card from it. Shared-pool cards return
   null (they never lock anything). */
function branchOfCard(abKey,cardId){
  const tree=CLASS_EVOLUTIONS[abKey];
  if(!tree)return null;
  for(const bKey in tree.branches){
    if(tree.branches[bKey].cards.some(c=>c.id===cardId))return bKey;
  }
  return null;
}
function finishEvolutions(timedOut){
  for(const p of SIM.players){
    const d=SIM.evolutions[p.pid];
    if(d&&d.picked){
      if(FILLER_BY_ID[d.picked]){
        SIM.ep+=FILLER_BY_ID[d.picked].epAmt;
      }else{
        const opt=EVO_BY_ID[d.picked];
        applyEvolution(p,opt.id);
        if(!p._ownedEvos)p._ownedEvos={};p._ownedEvos[opt.id]=true;
        const b=branchOfCard(d.abKey,opt.id);
        if(b){
          if(!p._evoBranch)p._evoBranch={};
          if(!p._evoBranch[d.abKey]){
            p._evoBranch[d.abKey]=b;
            const branchName=CLASS_EVOLUTIONS[d.abKey].branches[b].name;
            ev({k:'say',sys:true,text:`${p.name} committed to the ${branchName} path`,color:p.color});
          }
        }
        ev({k:'evolve',name:opt.name,pid:p.pid,ability:CLASSES[p.cls].ability.name});
      }
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
    case'p_regen':p._regenPct=(p._regenPct||0)+0.015;break;
    case'p_lifesteal':p._lifestealFlat=(p._lifestealFlat||0)+2;break;
    case'p_dmg_nk':p._critBonus=(p._critBonus||0)+0.15;break;
    case'p_nk_critdmg':p._critDmgMult=(p._critDmgMult||1)*1.3;break;
    case'p_nk_dashcrit':p._dashCritPerk=true;break;
    case'p_nk_bloodlust':p._bloodlustPerk=true;break;
    case'p_nk_executioner':p._executionerPerk=true;break;
    case'p_dmg_macrophage':p._splashMult=(p._splashMult||1)*1.4;break;
    case'p_mac_knockback':p._knockbackMult=(p._knockbackMult||1)*1.5;break;
    case'p_mac_tauntheal':p._tauntHealPerk=true;break;
    case'p_mac_bulwark':p.hpMax=Math.round(p.hpMax*1.25);p.hp=Math.round(p.hp*1.25);p.speed*=0.92;break;
    case'p_mac_retaliate':p._retaliatePerk=true;break;
    case'p_dmg_tcell':p._pierceDmg=(p._pierceDmg||1)*1.18;break;
    case'p_tcell_focus':p._firstHitDmg=(p._firstHitDmg||1)*1.1;break;
    case'p_tcell_heatvent':p._heatVentPerk=true;break;
    case'p_tcell_railgun':p._pierceBonus=(p._pierceBonus||0)+3;break;
    case'p_tcell_lance':p._lancePerk=true;break;
    case'p_dmg_bcell':p._teamDmgAura=(p._teamDmgAura||0)+0.1;break;
    case'p_bcell_shield':p._healShieldPerk=true;break;
    case'p_bcell_reach':p._rangeBonus=(p._rangeBonus||0)+80;break;
    case'p_bcell_overheal':p._overhealPerk=true;break;
    case'p_bcell_martyr':p._martyrPerk=true;break;
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
    case'ev_od_cd':case'ev_heal_cd':case'ev_dash_cd':case'ev_taunt_cd':p._cdMult=(p._cdMult||1)*0.75;break;
    case'ev_od_dmg':p._odDmgPerk=true;break;
    case'ev_dash_dmg':p._dashDmgPerk=true;break;
    case'ev_od_ammo':p._odNoAmmoPerk=true;break;
    case'ev_od_pierce':p._odPiercePerk=true;break;
    case'ev_od_chain':p._odChainPerk=true;break;
    case'ev_od_apex':p._durBonus=(p._durBonus||0)+4;p._odApexPerk=true;break;
    case'ev_taunt_thorns':p._tauntThornsPerk=true;break;
    case'ev_taunt_double':p._tauntDoublePerk=true;break;
    case'ev_taunt_apex':p._tauntApexPerk=true;break;
    case'ev_heal_cleanse':p._healCleansePerk=true;break;
    case'ev_heal_shield':p._healShieldEvoPerk=true;break;
    case'ev_heal_double':p._healDoublePerk=true;break;
    case'ev_heal_apex':p._healApexPerk=true;break;
    case'ev_dash_speed':p._dashSpeedMult=(p._dashSpeedMult||1)*1.3;break;
    case'ev_dash_reset':p._dashResetPerk=true;break;
    case'ev_dash_chain':p._dashChainPerk=true;break;
    case'ev_dash_apex':p._dashApexPerk=true;break;
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
