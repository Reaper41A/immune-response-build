/* ============================================================================
   IMMUNE RESPONSE — bestiary icon renderer
   ----------------------------------------------------------------------------
   The How-To/Bestiary used to show a plain color swatch per enemy, which
   didn't help anyone actually recognize a pathogen mid-fight. This module
   draws a small static canvas icon per entry using the SAME shape paths as
   the real in-game renderer (entities.js) — so what you see in the bestiary
   is what you'll see on the battlefield, just bigger and standing still.
   Deliberately self-contained (its own <canvas>/ctx per icon) instead of
   reusing the global `ctx` from core.js, since that's a `const` bound to the
   live gameplay canvas and swapping it would risk the render loop.
   ========================================================================== */
'use strict';

function drawBeastIcon(canvas,defKey,def){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const size=48; // must match .beast-icon's CSS width/height in index.html
  canvas.width=size*dpr;canvas.height=size*dpr;
  canvas.style.width=size+'px';canvas.style.height=size+'px';
  const c=canvas.getContext('2d');
  c.scale(dpr,dpr);
  c.clearRect(0,0,size,size);
  c.save();
  c.translate(size/2,size/2);
  // Normalize every icon to roughly the same on-screen footprint (~17px
  // radius) regardless of the enemy's actual world-space radius — small
  // fry like the Worm (r10) would otherwise render as a speck, and bosses
  // (r30+) would blow out past the canvas edge.
  const scale=17/Math.max(6,def.radius||14);
  c.scale(scale,scale);
  const r=def.radius||14;
  const t=1.3; // frozen "mid-animation" phase — reads clearer than t=0

  // soft glow behind the shape, same palette as in-run
  c.save();
  const grad=c.createRadialGradient(0,0,0,0,0,r*2.4);
  grad.addColorStop(0,hexToRgba(def.glow||def.color,0.5));
  grad.addColorStop(1,hexToRgba(def.glow||def.color,0));
  c.fillStyle=grad;
  c.beginPath();c.arc(0,0,r*2.4,0,Math.PI*2);c.fill();
  c.restore();

  c.fillStyle=def.color;

  function blob(rr,irr){
    const pts=8;
    c.beginPath();
    for(let i=0;i<=pts;i++){
      const a=(i/pts)*Math.PI*2;
      const rad=rr*(1+Math.sin(a*3+t)*irr);
      const x=Math.cos(a)*rad,y=Math.sin(a)*rad;
      i===0?c.moveTo(x,y):c.lineTo(x,y);
    }
    c.closePath();c.fill();
  }
  function spiky(rr,spikes,inner){
    c.beginPath();
    for(let i=0;i<spikes*2;i++){
      const a=(i/(spikes*2))*Math.PI*2;
      const rad=(i%2===0?rr:rr*inner);
      const x=Math.cos(a)*rad,y=Math.sin(a)*rad;
      i===0?c.moveTo(x,y):c.lineTo(x,y);
    }
    c.closePath();c.fill();
  }
  function hexP(rr){
    c.beginPath();
    for(let i=0;i<=6;i++){
      const a=(i/6)*Math.PI*2;
      const x=Math.cos(a)*rr,y=Math.sin(a)*rr;
      i===0?c.moveTo(x,y):c.lineTo(x,y);
    }
    c.closePath();c.fill();
    c.strokeStyle='rgba(255,255,255,0.4)';c.lineWidth=1.5;c.stroke();
  }
  function cloud(rr){
    c.beginPath();
    c.arc(-rr*0.45,rr*0.1,rr*0.5,0,Math.PI*2);
    c.arc(rr*0.05,-rr*0.25,rr*0.62,0,Math.PI*2);
    c.arc(rr*0.55,rr*0.1,rr*0.48,0,Math.PI*2);
    c.arc(0,rr*0.28,rr*0.5,0,Math.PI*2);
    c.fill();
  }
  function dart(rr){
    c.beginPath();
    c.moveTo(rr*1.3,0);c.lineTo(-rr*0.7,-rr*0.75);c.lineTo(-rr*0.3,0);c.lineTo(-rr*0.7,rr*0.75);
    c.closePath();c.fill();
  }
  function roundRectF(x,y,w,h,rad){
    c.beginPath();
    c.moveTo(x+rad,y);
    c.arcTo(x+w,y,x+w,y+h,rad);
    c.arcTo(x+w,y+h,x,y+h,rad);
    c.arcTo(x,y+h,x,y,rad);
    c.arcTo(x,y,x+w,y,rad);
    c.closePath();c.fill();
  }

  switch(defKey){
    case'bacteria':blob(r,0.12);break;
    case'virus':spiky(r,8,0.55);break;
    case'fungi':
      blob(r,0.15);
      c.fillStyle='rgba(255,255,255,0.18)';
      for(let i=0;i<3;i++){
        const a=i/3*Math.PI*2;
        c.beginPath();c.arc(Math.cos(a)*r*0.45,Math.sin(a)*r*0.45,3,0,Math.PI*2);c.fill();
      }
      break;
    case'mycovirus':
      blob(r*1.15,0.2);
      c.fillStyle='#ff4d6d';
      spiky(r*0.6,7,0.55);
      break;
    case'prion':hexP(r);break;
    case'toxinsac':blob(r,0.28);break;
    case'antigenCluster':
      for(let i=0;i<4;i++){
        const a=i/4*Math.PI*2;
        c.beginPath();
        c.arc(Math.cos(a)*r*0.42,Math.sin(a)*r*0.42,r*0.5,0,Math.PI*2);
        c.fill();
      }
      break;
    case'worm_seg':
      // short chain of shrinking dots, matching the live worm-body trail
      for(let i=0;i<4;i++){
        const rr=Math.max(3,r*(1-i*0.2));
        c.globalAlpha=1-i*0.18;
        c.beginPath();c.arc(-i*r*0.85,0,rr,0,Math.PI*2);c.fill();
      }
      c.globalAlpha=1;
      break;
    case'biofilmWall':
      roundRectF(-r,-r*0.8,r*2,r*1.6,10);
      c.strokeStyle='rgba(255,255,255,0.35)';c.lineWidth=2;
      c.strokeRect(-r,-r*0.8,r*2,r*1.6);
      break;
    case'necroticDrifter':
      blob(r,0.22);
      c.fillStyle='rgba(138,154,91,0.7)';
      c.beginPath();c.arc(-r*0.3,r*0.7,2.5,0,Math.PI*2);c.fill();
      c.beginPath();c.arc(r*0.2,r*0.85,2.5,0,Math.PI*2);c.fill();
      break;
    case'cytokineStormCloud':cloud(r);break;
    case'retrovirus':dart(r);break;
    case'macrophageMimic':
      blob(r,0.3);
      c.fillStyle='#ff4d6d';
      c.beginPath();c.arc(0,0,r*0.35,0,Math.PI*2);c.fill();
      break;
    case'parasite':case'megaVirus':case'mutatedFungus':case'parasiteQueen':
      spiky(r,12,0.75);
      break;
    default:
      c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
  }

  // elite-style outline ring for bosses, echoes the in-run boss treatment
  if(defKey==='megaVirus'||defKey==='mutatedFungus'||defKey==='parasiteQueen'){
    c.strokeStyle='rgba(255,255,255,0.55)';c.lineWidth=2;
    c.beginPath();c.arc(0,0,r+5,0,Math.PI*2);c.stroke();
  }
  c.restore();
}

function buildBestiaryGrid(){
  const bg=$('bestiaryGrid');
  if(!bg)return;
  bg.innerHTML='';
  const entries=[
    ...Object.entries(ENEMY_DEFS).filter(([k])=>k!=='spore'),
    ['megaVirus',{...BOSS_DEFS.megaVirus,radius:32,tell:'BOSS — appears every 5th wave. Slow, heavy hitter — focus fire and dodge its lunges.'}],
    ['mutatedFungus',{...BOSS_DEFS.mutatedFungus,radius:34,tell:'BOSS — appears every 5th wave. Tanky spore-spreader; clear its spawns fast.'}],
    ['parasiteQueen',{...BOSS_DEFS.parasiteQueen,radius:33,tell:'BOSS — appears every 5th wave. Buffs everything nearby — kill priority.'}],
  ];
  for(const[key,d]of entries){
    const el=document.createElement('div');
    el.className='beast';
    const cv=document.createElement('canvas');
    cv.className='beast-icon';
    el.appendChild(cv);
    const body=document.createElement('div');
    body.innerHTML=`<div class="beast-name">${d.name}</div><div class="beast-desc">${d.tell}</div>`;
    el.appendChild(body);
    bg.appendChild(el);
    drawBeastIcon(cv,key,d);
  }
}
