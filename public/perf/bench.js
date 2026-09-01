'use strict';
/* svgFX perf bench — drives the REAL SvgFX.sync() (unmodified production
   code, loaded via <script> in svgfx-bench.html) against synthetic views,
   to answer the "never load-tested this" question with actual numbers
   instead of a guess.

   What this measures: wall-clock time inside SvgFX.sync() (DOM creation,
   style.transform writes, class toggles) as observed on the main thread,
   plus the resulting live node count under #svgLayer.

   What this does NOT measure: GPU compositing/paint cost, which is
   invisible to performance.now() and only shows up as dropped frames in
   a real Chrome/Safari performance trace. Node count is used as a proxy
   for that cost (more composited layers = more GPU work), but is not a
   substitute for an actual trace. Treat the "Verdict" column as a
   directional signal for iterating on entity counts, not a final answer —
   confirm anything borderline with a real DevTools performance recording
   on the target device class before shipping a tier's entity budget. */

const ENEMY_KEYS=['bacteria','virus','fungi','antigenCluster','worm_seg','toxinsac',
  'biofilmWall','mycovirus','macrophageMimic','prion','necroticDrifter',
  'cytokineStormCloud','retrovirus','parasite','spore'];
const PLAYER_CLASSES=['macrophage','tcell','bcell','nk'];

// vOffX/vOffY/vScale/VW/VH are real globals from core.js — set them to a
// plausible fitWorld() result so worldToScreen() inside svgFX.js does real
// (non-degenerate) math, same as it would mid-game.
VW=1280;VH=720;vScale=1;vOffX=0;vOffY=0;

function synthEnemy(i){
  const d=ENEMY_KEYS[i%ENEMY_KEYS.length];
  return{
    i,d,x:rand(40,VW-40),y:rand(40,VH-40),hp:rand(10,100),hm:100,
    el:Math.random()<0.15?choice(['armor','speed','shield','regen']):null,
    tf:Math.random()<0.1?0.1:0,tb:0,mg:0,dp:0,rg:0,cl:0,lg:0,seg:0,
    pt:0,pf:0,st:0,sf:0,ba:0,
    wseg:d==='worm_seg'?[{x:0,y:0},{x:5,y:5},{x:10,y:10}]:undefined,
  };
}
function synthPlayer(i){
  return{
    i,n:'P'+i,c:PLAYER_CLASSES[i%PLAYER_CLASSES.length],h:1,
    x:rand(40,VW-40),y:rand(40,VH-40),hp:rand(20,100),hm:100,
    col:'#7fd6ff',f:rand(0,Math.PI*2),a:1,rs:0,
    am:10,amx:10,ht:0,oh:0,ac:0,acd:5,aa:Math.random()<0.2?1:0,k:0,lg:0,
  };
}
function synthView(nE,nP,nPk,nT,nH){
  return{
    bodyHp:900,bodyHpMax:1000,
    players:Array.from({length:nP},(_,i)=>synthPlayer(i)),
    enemies:Array.from({length:nE},(_,i)=>synthEnemy(i)),
    pickups:Array.from({length:nPk},()=>({x:rand(0,VW),y:rand(0,VH),l:rand(1,10),w:rand(0,6)})),
    turrets:Array.from({length:nT},()=>({x:rand(0,VW),y:rand(0,VH),r:120,corrupted:Math.random()<0.3,hp:50,hpMax:100})),
    hazards:Array.from({length:nH},()=>({x:rand(0,VW),y:rand(0,VH),r:56,l:rand(0,1.8)})),
    invulnHint:null,lockOf:null,fireRingPid:null,
  };
}

// SvgFX loads sprite templates async via fetch(); makeInstance()'s wrapper
// isn't appended to #svgLayer / marked ready until that resolves. A cold
// sync() call therefore only measures pool-lookup + kick-off-a-fetch cost,
// not steady-state transform-write cost. Real steady state needs the
// templates already warm — this waits for the pool to settle (all fetches
// either resolved or failed) before timing.
function waitForPoolSettled(maxMs){
  return new Promise(resolve=>{
    const start=performance.now();
    (function poll(){
      // heuristic: run one more sync to populate the pool, then poll until
      // #svgLayer's child count stops changing for 3 consecutive checks
      // (fetch resolution is async/microtask-ish, not on a fixed schedule)
      let stableCount=0,lastN=-1;
      (function check(){
        const n=document.getElementById('svgLayer').children.length;
        if(n===lastN)stableCount++;else stableCount=0;
        lastN=n;
        if(stableCount>=3||performance.now()-start>maxMs){resolve();return;}
        setTimeout(check,50);
      })();
    })();
  });
}

function log(msg){
  const el=document.getElementById('log');
  el.textContent+=msg+'\n';
  el.scrollTop=el.scrollHeight;
}

function addRow(scenario,nEntities,domNodes,avgMs,p95Ms){
  const tbody=document.querySelector('#results tbody');
  const tr=document.createElement('tr');
  // Budget: at 60fps the whole frame is 16.6ms; sync() is one piece of
  // that alongside sim step + canvas draw + browser paint, so treat >2ms
  // avg as worth a closer look and >4ms as a real budget problem — these
  // thresholds are a starting heuristic, not a hard spec from the brief.
  let verdict='<span class="good">fine</span>',cls='';
  if(avgMs>4||p95Ms>8){verdict='<span class="bad">investigate</span>';}
  else if(avgMs>2||p95Ms>4){verdict='<span class="warn">borderline</span>';}
  tr.innerHTML=`<td>${scenario}</td><td class="num">${nEntities}</td><td class="num">${domNodes}</td>`+
    `<td class="num">${avgMs.toFixed(3)}</td><td class="num">${p95Ms.toFixed(3)}</td><td>${verdict}</td>`;
  tbody.appendChild(tr);
}

async function sampleScenario(label,nE,nP,nPk,nT,nH,frames){
  const view=synthView(nE,nP,nPk,nT,nH);
  // warm the pool: run sync a few times so makeInstance's fetch resolves
  // and every entity gets a real DOM node before we start timing.
  for(let i=0;i<3;i++)SvgFX.sync(view,0.016);
  await waitForPoolSettled(4000);

  const samples=[];
  for(let f=0;f<frames;f++){
    // jitter positions each frame like a real game would (static positions
    // would let the browser skip work a real moving-entity frame can't)
    for(const en of view.enemies)en.x+=rand(-2,2),en.y+=rand(-2,2);
    for(const p of view.players)p.x+=rand(-2,2),p.y+=rand(-2,2);
    const t0=performance.now();
    SvgFX.sync(view,0.016);
    samples.push(performance.now()-t0);
  }
  samples.sort((a,b)=>a-b);
  const avg=samples.reduce((a,b)=>a+b,0)/samples.length;
  const p95=samples[Math.floor(samples.length*0.95)];
  const domNodes=document.getElementById('svgLayer').children.length;
  addRow(label,nE+nP+nPk+nT+nH,domNodes,avg,p95);
  log(`${label}: ${samples.length} frames sampled, avg=${avg.toFixed(3)}ms p95=${p95.toFixed(3)}ms domNodes=${domNodes}`);
  return{avg,p95,domNodes};
}

document.getElementById('runOnce').addEventListener('click',async()=>{
  const nE=+document.getElementById('nEnemies').value;
  const nP=+document.getElementById('nPlayers').value;
  const nPk=+document.getElementById('nPickups').value;
  const nT=+document.getElementById('nTurrets').value;
  const nH=+document.getElementById('nHazards').value;
  document.getElementById('runOnce').disabled=true;
  log(`--- single sample: ${nE} enemies, ${nP} players, ${nPk} pickups, ${nT} turrets, ${nH} hazards ---`);
  await sampleScenario('manual',nE,nP,nPk,nT,nH,120);
  document.getElementById('runOnce').disabled=false;
});

document.getElementById('runSweep').addEventListener('click',async()=>{
  document.getElementById('runSweep').disabled=true;
  log('--- entity-count sweep (matches Low/Med/High/Ultra-ish live enemy counts) ---');
  const counts=[5,15,30,60,100];
  for(const n of counts){
    SvgFX.reset();
    await sampleScenario(`${n} enemies`,n,4,6,2,3,120);
  }
  document.getElementById('runSweep').disabled=false;
});

document.getElementById('runSustained').addEventListener('click',async()=>{
  document.getElementById('runSustained').disabled=true;
  log('--- 300-frame sustained run with churn (entities dying/spawning) — checks for pool leak / GC pressure drift ---');
  SvgFX.reset();
  let view=synthView(30,4,6,2,3);
  for(let i=0;i<3;i++)SvgFX.sync(view,0.016);
  await waitForPoolSettled(4000);
  const early=[],late=[];
  for(let f=0;f<300;f++){
    // simulate churn: every ~20 frames, swap out a chunk of enemy ids
    // (new ids = old pool entries get destroyed, new ones get created —
    // this is what a real wave clear + respawn looks like to syncEnemies)
    if(f%20===0){
      view=synthView(30,4,6,2,3);
      view.enemies.forEach((en,idx)=>en.i=f*1000+idx); // fresh ids force pool churn
    }
    for(const en of view.enemies)en.x+=rand(-2,2),en.y+=rand(-2,2);
    const t0=performance.now();
    SvgFX.sync(view,0.016);
    const dt=performance.now()-t0;
    (f<50?early:late).push(dt);
  }
  const avgEarly=early.reduce((a,b)=>a+b,0)/early.length;
  const avgLate=late.reduce((a,b)=>a+b,0)/late.length;
  const domNodes=document.getElementById('svgLayer').children.length;
  addRow('sustained(early avg)',30,domNodes,avgEarly,0);
  addRow('sustained(late avg)',30,domNodes,avgLate,0);
  log(`sustained: early(frames 0-49) avg=${avgEarly.toFixed(3)}ms, late(frames 250-299) avg=${avgLate.toFixed(3)}ms, `+
    `final domNodes=${domNodes}. If late >> early with stable entity count, that's a pool-churn cost regression worth digging into.`);
  document.getElementById('runSustained').disabled=false;
});

document.getElementById('clearPool').addEventListener('click',()=>{
  SvgFX.reset();
  document.querySelector('#results tbody').innerHTML='';
  document.getElementById('log').textContent='';
  log('pools reset.');
});

log('Ready. Note: sprite files are fetched relative to js/../assets/sprites — this page must be served over http(s) (not file://) for fetch() to work, e.g. `python3 -m http.server` from the public/ directory, then open /perf/svgfx-bench.html.');
