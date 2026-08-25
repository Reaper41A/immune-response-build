/* ============================================================================
   IMMUNE RESPONSE — renderer part 1: world (background, Body core, hazards,
   pickups, spawn telegraphs, turrets, projectiles, particles, overlays)
   Pure function of the VIEW — identical for host and guests.
   ========================================================================== */
'use strict';

let ambientSeeds=null;
function drawBackground(){
  if(!bgCache){
    const k=Math.min(2,Math.max(1,DPR*vScale)); // backing-store quality
    bgCache=document.createElement('canvas');
    bgCache.width=Math.round(VW*k);bgCache.height=Math.round(VH*k);
    const b=bgCache.getContext('2d');
    b.setTransform(k,0,0,k,0,0);
    const g=b.createRadialGradient(VW*0.5,VH*0.45,0,VW*0.5,VH*0.45,Math.max(VW,VH)*0.72);
    g.addColorStop(0,'#0d1b2a');g.addColorStop(0.6,'#091120');g.addColorStop(1,'#05080f');
    b.fillStyle=g;b.fillRect(0,0,VW,VH);
    // capillaries radiating from the core quietly teach "threats come from anywhere"
    const c={x:VW*0.5,y:VH*0.52};
    b.strokeStyle='rgba(127,214,255,0.05)';
    b.lineCap='round';
    for(let i=0;i<14;i++){
      const a=(i/14)*Math.PI*2+0.3;
      b.lineWidth=rand(6,13);
      b.beginPath();
      b.moveTo(c.x+Math.cos(a)*coreRadius()*1.2,c.y+Math.sin(a)*coreRadius()*1.2);
      const midR=Math.max(VW,VH)*0.33;
      b.quadraticCurveTo(
        c.x+Math.cos(a+0.35)*midR,c.y+Math.sin(a+0.35)*midR,
        c.x+Math.cos(a-0.15)*Math.max(VW,VH)*0.78,c.y+Math.sin(a-0.15)*Math.max(VW,VH)*0.78
      );
      b.stroke();
    }
    // tissue speckle
    for(let i=0;i<130;i++){
      const x=rand(0,VW),y=rand(0,VH),r=rand(1,4);
      b.fillStyle=`rgba(${randi(90,150)},${randi(160,210)},${randi(170,215)},${rand(0.02,0.06)})`;
      b.beginPath();b.arc(x,y,r,0,Math.PI*2);b.fill();
    }
  }
  ctx.drawImage(bgCache,0,0,VW,VH);
  if(!ambientSeeds){
    ambientSeeds=[];
    for(let i=0;i<9;i++)ambientSeeds.push({sx:rand(0,1000),sy:rand(0,1000),r:rand(26,64),hue:i%2});
  }
  if(!REDUCED){
    const t=performance.now()/1000;
    ctx.globalAlpha=0.045;
    for(const s of ambientSeeds){
      const x=((Math.sin(t*0.05+s.sx)*0.5+0.5)*VW*1.2)-VW*0.1;
      const y=((Math.cos(t*0.04+s.sy)*0.5+0.5)*VH*1.2)-VH*0.1;
      ctx.fillStyle=s.hue?'#3ee8c8':'#7fd6ff';
      ctx.beginPath();ctx.arc(x,y,s.r,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
}

function drawPerimeter(){
  const c=worldCore();
  ctx.save();
  ctx.translate(c.x,c.y);
  if(!REDUCED)ctx.rotate(performance.now()/1000*0.04);
  ctx.strokeStyle='rgba(255,77,109,0.10)';
  ctx.lineWidth=2;
  ctx.setLineDash([14,18]);
  ctx.beginPath();ctx.arc(0,0,arenaRadius()+30,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawCore(view,hbBeat){
  const c=worldCore(),r=coreRadius();
  const pct=clamp(view.bodyHp/view.bodyHpMax,0,1);
  const healthy={r:62,g:232,b:200},dying={r:122,g:44,b:66};
  const col={r:Math.round(lerp(dying.r,healthy.r,pct)),g:Math.round(lerp(dying.g,healthy.g,pct)),b:Math.round(lerp(dying.b,healthy.b,pct))};
  const pulse=1+hbBeat*0.03*pct;
  ctx.save();
  ctx.translate(c.x,c.y);ctx.scale(pulse,pulse);
  const grad=ctx.createRadialGradient(0,0,0,0,0,r*1.5);
  grad.addColorStop(0,`rgba(${col.r},${col.g},${col.b},${0.30+hbBeat*0.10})`);
  grad.addColorStop(1,`rgba(${col.r},${col.g},${col.b},0)`);
  ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,r*1.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=`rgb(${col.r},${col.g},${col.b})`;
  ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.28)';ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,0.18)';ctx.lineWidth=3;
  const tt=performance.now()/1000;
  for(let i=0;i<5;i++){
    const a=i/5*Math.PI*2+tt*0.1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*r*0.15,Math.sin(a)*r*0.15);
    ctx.lineTo(Math.cos(a+0.6)*r*0.7,Math.sin(a+0.6)*r*0.7);
    ctx.stroke();
  }
  ctx.fillStyle='rgba(255,255,255,0.62)';
  ctx.font='bold 11px Cascadia Mono, Consolas, monospace';
  ctx.textAlign='center';
  ctx.fillText('BODY',0,-2);
  ctx.font='9px Cascadia Mono, Consolas, monospace';
  ctx.fillStyle='rgba(255,255,255,0.42)';
  ctx.fillText(Math.round(view.bodyHp)+' HP',0,11);
  ctx.restore();
  if(pct<=0.3){ // critical state ring
    ctx.strokeStyle=`rgba(255,77,109,${0.25+hbBeat*0.35})`;
    ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(c.x,c.y,r+8+hbBeat*4,0,Math.PI*2);ctx.stroke();
  }
}

function drawTrails(view){
  for(const tr of view.trails||[]){
    const a=clamp(tr.l/3,0,1)*0.35;
    ctx.fillStyle=`rgba(138,154,91,${a})`;
    ctx.beginPath();ctx.arc(tr.x,tr.y,tr.w,0,Math.PI*2);ctx.fill();
  }
}
function drawHazards(view){
  const t=performance.now()/1000;
  for(const hz of view.hazards||[]){
    const fade=clamp(hz.l/1.8,0,1);
    ctx.save();
    ctx.globalAlpha=fade*0.4;
    const g=ctx.createRadialGradient(hz.x,hz.y,0,hz.x,hz.y,hz.radius);
    g.addColorStop(0,'rgba(212,255,77,0.55)');g.addColorStop(1,'rgba(212,255,77,0)');
    ctx.fillStyle=g;
    ctx.beginPath();ctx.arc(hz.x,hz.y,hz.radius*(0.9+Math.sin(t*3)*0.08),0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
}
/* Spawn telegraphs: an expanding warning ring appears ~0.9s BEFORE anything
   exists at that spot — fairness first, and it reads from across the arena. */
function drawWarns(){
  for(const w of FX.warns){
    const p=1-w.t/w.max;
    const r=(w.big?46:22)+p*(w.big?60:30);
    ctx.save();
    ctx.globalAlpha=(1-p)*0.85;
    ctx.strokeStyle=w.big?'#ffd166':'#ff8ea0';
    ctx.lineWidth=w.big?3:2;
    ctx.setLineDash([8,7]);
    ctx.beginPath();ctx.arc(w.x,w.y,r,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha=(1-p)*0.5;
    ctx.beginPath();ctx.arc(w.x,w.y,6+p*4,0,Math.PI*2);ctx.fillStyle=w.big?'#ffd166':'#ff8ea0';ctx.fill();
    ctx.restore();
  }
}
function drawTurrets(view){
  for(const t of view.turrets||[]){
    ctx.save();
    ctx.translate(t.x,t.y);
    ctx.fillStyle='rgba(255,209,102,0.08)';
    ctx.beginPath();ctx.arc(0,0,t.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffd166';
    ctx.shadowColor='#ffd166';ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }
}
function drawPickups(view){
  const t=performance.now()/1000;
  for(const pk of view.pickups||[]){
    const bob=Math.sin(t*3+(pk.w||0))*4;
    const fadeOut=pk.l<2?clamp(pk.l/2,0,1):1;
    ctx.save();
    ctx.globalAlpha=fadeOut;
    const g=ctx.createRadialGradient(pk.x,pk.y+bob,0,pk.x,pk.y+bob,16);
    g.addColorStop(0,'rgba(143,227,106,0.5)');g.addColorStop(1,'rgba(143,227,106,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(pk.x,pk.y+bob,16,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#8fe36a';
    ctx.shadowColor='#8fe36a';ctx.shadowBlur=8;
    ctx.beginPath();ctx.arc(pk.x,pk.y+bob,5,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1;ctx.stroke();
    ctx.restore();
  }
}
function drawProjectiles(view){
  ctx.lineCap='round';
  for(const pr of view.projs||[]){
    ctx.strokeStyle=hexToRgba(pr.c,0.5);
    ctx.lineWidth=pr.sp?4:3;
    ctx.beginPath();
    for(let i=0;i<(pr.tr||[]).length;i++){
      const pt=pr.tr[i];
      i===0?ctx.moveTo(pt[0],pt[1]):ctx.lineTo(pt[0],pt[1]);
    }
    ctx.lineTo(pr.x,pr.y);ctx.stroke();
    ctx.fillStyle=pr.c;
    ctx.shadowColor=pr.c;ctx.shadowBlur=6;
    ctx.beginPath();ctx.arc(pr.x,pr.y,pr.sp?5:4,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
  }
}
function drawFakeTraces(){
  for(const f of FX.fakeTraces){
    ctx.save();
    ctx.globalAlpha=f.life/f.maxLife*0.6;
    ctx.strokeStyle=f.color;
    ctx.lineWidth=2;
    ctx.setLineDash([6,5]);
    ctx.beginPath();ctx.moveTo(f.x1,f.y1);ctx.lineTo(f.x2,f.y2);ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
function drawParticles(){
  for(const pt of FX.parts){
    const a=clamp(pt.life/pt.maxLife,0,1);
    ctx.globalAlpha=a;
    if(pt.type==='pulse'){
      ctx.strokeStyle=pt.color;ctx.lineWidth=2.5*a+0.5;
      ctx.beginPath();ctx.arc(pt.x,pt.y,pt.size*(1.05-a*0.65),0,Math.PI*2);ctx.stroke();
    }else if(pt.type==='glyph'){
      ctx.fillStyle=pt.color;
      ctx.font='11px sans-serif';ctx.textAlign='center';
      ctx.fillText('✚',pt.x,pt.y);
    }else{
      ctx.fillStyle=pt.color;
      ctx.beginPath();ctx.arc(pt.x,pt.y,pt.size*(pt.type==='muzzle'?a:1),0,Math.PI*2);ctx.fill();
    }
  }
  ctx.globalAlpha=1;
}
function drawMotes(){
  for(const m of FX.motes){
    if(m.t<0)continue;
    const x=lerp(m.x,m.tx,m.t);
    const y=lerp(m.y,m.ty,m.t)-Math.sin(m.t*Math.PI)*40;
    ctx.globalAlpha=1-m.t*m.t;
    ctx.fillStyle='#3ee8c8';
    ctx.shadowColor='#3ee8c8';ctx.shadowBlur=6;
    ctx.beginPath();ctx.arc(x,y,2.6,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
  }
  ctx.globalAlpha=1;
}
function drawPopups(){
  ctx.textAlign='center';
  for(const pu of FX.popups){
    ctx.globalAlpha=clamp(pu.life/pu.maxLife,0,1);
    ctx.fillStyle=pu.color;
    ctx.font=(pu.crit?'bold ':'')+(pu.small?'10px':'13px')+' Cascadia Mono, Consolas, monospace';
    ctx.fillText(pu.text,pu.x,pu.y);
  }
  ctx.globalAlpha=1;
}
/* Off-screen threat arrows: dim red for regular enemies (they spawn outside
   the viewport), bright gold for bosses — nothing sneaks up unseen. */
function drawEdgeArrows(view){
  const margin=18;
  for(const en of view.enemies||[]){
    if(en.x>-20&&en.x<VW+20&&en.y>-20&&en.y<VH+20)continue;
    const cx=clamp(en.x,margin,VW-margin);
    const cy=clamp(en.y,margin,VH-margin);
    const a=Math.atan2(en.y-cy,en.x-cx)||0;
    const isBoss=en.d==='megaVirus'||en.d==='mutatedFungus'||en.d==='parasiteQueen';
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(a);
    ctx.globalAlpha=isBoss?0.95:0.45;
    ctx.fillStyle=isBoss?'#ffd166':'#ff8ea0';
    ctx.beginPath();
    ctx.moveTo(isBoss?12:8,0);ctx.lineTo(-5,-5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
