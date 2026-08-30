/* ============================================================================
   IMMUNE RESPONSE — renderer part 1: world (background, Body core, hazards,
   pickups, spawn telegraphs, turrets, projectiles, particles, overlays)
   Pure function of the VIEW — identical for host and guests.
   ========================================================================== */
'use strict';

/* Cached glow sprites: shadowBlur and per-frame createRadialGradient are the
   two most expensive 2D-canvas operations on mobile GPUs. Each glow shape is
   rasterized ONCE (keyed by color+radius) and blitted with drawImage after. */
const _glowCache=new Map();
function glowSprite(color,r){
  const key=color+'|'+r;
  let s=_glowCache.get(key);
  if(!s){
    const rr=Math.max(1,Math.ceil(r)),pad=8,size=rr*2+pad*2;
    s=document.createElement('canvas');
    s.width=size;s.height=size;
    const g=s.getContext('2d');
    const grad=g.createRadialGradient(size/2,size/2,0,size/2,size/2,rr);
    grad.addColorStop(0,hexToRgba(color,1));
    grad.addColorStop(1,hexToRgba(color,0));
    g.fillStyle=grad;g.fillRect(0,0,size,size);
    _glowCache.set(key,s);
  }
  return s;
}
function blitGlow(spr,x,y,alpha){
  // glowQuality settings gate: 'off' skips bloom entirely (cheapest, used by
  // Low), 'reduced' keeps the cue but dimmer/smaller (Medium), 'full' is
  // unchanged (High/Ultra) — every caller passes through this one spot so
  // there's a single place that decides how much bloom the game spends.
  const q=Settings.glowQuality;
  if(q==='off')return;
  const mul=q==='reduced'?0.55:1;
  ctx.globalAlpha=alpha*mul;
  ctx.drawImage(spr,x-spr.width/2,y-spr.height/2);
  ctx.globalAlpha=1;
}

let ambientSeeds=null;
let veinSeeds=null;
let floatCells=null;
let driftOrganisms=null;

function drawBackground(hbBeat){
  if(!bgCache){
    const k=Math.min(2,Math.max(1,DPR*RES*vScale)); // backing-store quality
    bgCache=document.createElement('canvas');
    bgCache.width=Math.round(VW*k);bgCache.height=Math.round(VH*k);
    const b=bgCache.getContext('2d');
    b.setTransform(k,0,0,k,0,0);
    const g=b.createRadialGradient(VW*0.5,VH*0.45,0,VW*0.5,VH*0.45,Math.max(VW,VH)*0.72);
    g.addColorStop(0,'#0d1b2a');g.addColorStop(0.6,'#091120');g.addColorStop(1,'#05080f');
    b.fillStyle=g;b.fillRect(0,0,VW,VH);
    // tissue speckle
    for(let i=0;i<130;i++){
      const x=rand(0,VW),y=rand(0,VH),r=rand(1,4);
      b.fillStyle=`rgba(${randi(90,150)},${randi(160,210)},${randi(170,215)},${rand(0.02,0.06)})`;
      b.beginPath();b.arc(x,y,r,0,Math.PI*2);b.fill();
    }
  }
  ctx.drawImage(bgCache,0,0,VW,VH);

  // Capillaries used to be baked into bgCache as static lines. Now drawn live
  // each frame so they can pulse with the Body's heartbeat (hbBeat, same
  // signal that scales the core in drawCore) — the whole arena reads as
  // living tissue instead of a painted backdrop.
  if(Settings.veins)drawVeins(hbBeat||0); // settings gate: veins

  if(Settings.backgroundFx){ // settings gate: backgroundFx — the player's own
    // choice is authoritative here. COMPACT/REDUCED no longer silently veto
    // this the way they used to: Low/Medium presets already set
    // backgroundFx:false themselves (see settings.js QUALITY_PRESETS), so a
    // phone on Low/Medium already skips this block via the setting, and a
    // phone on High/Ultra now actually gets what those presets promise
    // instead of a silent phone-only downgrade underneath the setting.
    // REDUCED (prefers-reduced-motion) is a genuine accessibility signal
    // and still applies — it's a request to minimize motion, not a
    // performance heuristic, so it stays as a hard override.
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
    drawFloatingCells();
  }
}

/* Capillary network radiating from the Body core. Redrawn live (not baked)
   so width + brightness can pulse on `hbBeat` — a vein "throb" that travels
   outward on each beat, same cadence as the core's own pulse. */
function drawVeins(hbBeat){
  if(!veinSeeds){
    veinSeeds=[];
    const c=worldCore();
    for(let i=0;i<14;i++){
      const a=(i/14)*Math.PI*2+0.3;
      const midR=Math.max(VW,VH)*0.33;
      veinSeeds.push({
        a,w:rand(6,13),
        x0:c.x+Math.cos(a)*coreRadius()*1.2,y0:c.y+Math.sin(a)*coreRadius()*1.2,
        cx:c.x+Math.cos(a+0.35)*midR,cy:c.y+Math.sin(a+0.35)*midR,
        x1:c.x+Math.cos(a-0.15)*Math.max(VW,VH)*0.78,y1:c.y+Math.sin(a-0.15)*Math.max(VW,VH)*0.78,
        phase:rand(0,1)
      });
    }
  }
  const beat=REDUCED?0:hbBeat;
  ctx.lineCap='round';
  for(const v of veinSeeds){
    const glow=0.05+beat*0.09;
    ctx.strokeStyle=`rgba(127,214,255,${glow.toFixed(3)})`;
    ctx.lineWidth=v.w*(1+beat*0.22);
    ctx.beginPath();
    ctx.moveTo(v.x0,v.y0);
    ctx.quadraticCurveTo(v.cx,v.cy,v.x1,v.y1);
    ctx.stroke();
  }
  // a brighter pulse-of-light travels outward along each vein on the beat —
  // small in cost (14 short strokes) but reads as blood actually moving
  if(!REDUCED&&beat>0.15){
    const travel=beat; // 0→1 across the beat window, reused as the travel fraction
    ctx.lineCap='round';
    for(const v of veinSeeds){
      const tt=clamp(travel+v.phase*0.001,0,1);
      const px=lerp(lerp(v.x0,v.cx,tt),lerp(v.cx,v.x1,tt),tt);
      const py=lerp(lerp(v.y0,v.cy,tt),lerp(v.cy,v.y1,tt),tt);
      ctx.strokeStyle=`rgba(200,255,240,${(beat*0.35).toFixed(3)})`;
      ctx.lineWidth=v.w*0.55;
      ctx.beginPath();
      ctx.moveTo(px-Math.cos(v.a)*10,py-Math.sin(v.a)*10);
      ctx.lineTo(px+Math.cos(v.a)*10,py+Math.sin(v.a)*10);
      ctx.stroke();
    }
  }
}

/* Small free-floating background cells — lazily wandering organelle-like
   blobs well behind the play layer (drawn before entities, low alpha, no
   collision). Pure decoration: makes the tissue read as alive even in a
   quiet moment between spawns. */
function drawFloatingCells(){
  if(REDUCED)return; // backgroundFx itself is checked by the caller; COMPACT no longer vetoes this — see drawBackground
  if(!floatCells){
    floatCells=[];
    for(let i=0;i<7;i++){
      floatCells.push({
        sx:rand(0,1),sy:rand(0,1),
        r:rand(9,20),
        speed:rand(0.008,0.02),
        drift:rand(0,1000),
        hue:choice(['#8fe36a','#7fd6ff','#ffd166','#c084fc']),
        spin:rand(-0.3,0.3)
      });
    }
  }
  const t=performance.now()/1000;
  for(const fc of floatCells){
    const x=((Math.sin(t*fc.speed+fc.drift)*0.5+0.5))*VW*1.1-VW*0.05;
    const y=((Math.cos(t*fc.speed*0.7+fc.drift*1.3)*0.5+0.5))*VH*1.1-VH*0.05;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(t*fc.spin);
    ctx.globalAlpha=0.16;
    ctx.fillStyle=fc.hue;
    ctx.beginPath();
    const pts=6;
    for(let i=0;i<=pts;i++){
      const a=(i/pts)*Math.PI*2;
      const rr=fc.r*(1+Math.sin(a*2+t*0.6)*0.15);
      const px=Math.cos(a)*rr,py=Math.sin(a)*rr;
      i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }
    ctx.closePath();ctx.fill();
    // faint nucleus fleck sells "cell" over "blob"
    ctx.globalAlpha=0.22;
    ctx.beginPath();ctx.arc(fc.r*0.15,-fc.r*0.1,fc.r*0.32,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha=1;
}

/* Large drifting organism silhouettes passing OVER the arena — occasional,
   slow, translucent shapes (bigger than any real enemy) that cross the play
   field and fade out, like something large swimming past overhead. Purely
   atmospheric: no collision, no gameplay effect. Called late in the render
   order so it sits above entities, same visual idea as a cloud shadow. */
function drawDriftingOrganisms(dt){
  if(REDUCED||!Settings.backgroundFx)return; // settings gate: backgroundFx
  if(!driftOrganisms)driftOrganisms=[];
  // spawn a new one occasionally — COMPACT no longer blocks this; the
  // backgroundFx check above (and Low/Medium presets already setting it
  // false) is the single gate now, so an explicit High/Ultra choice on a
  // phone actually spawns these instead of being silently skipped.
  if(Math.random()<dt*0.045&&driftOrganisms.length<2){
    const a=rand(0,Math.PI*2);
    const speed=rand(14,26);
    const R=Math.max(VW,VH)*0.75;
    const c=worldCore();
    driftOrganisms.push({
      x:c.x+Math.cos(a)*R,y:c.y+Math.sin(a)*R,
      vx:-Math.cos(a)*speed,vy:-Math.sin(a)*speed,
      r:rand(70,130),
      life:0,maxLife:rand(9,14),
      wob:rand(0,1000),
      legs:randi(5,8),
      hue:choice(['#3ee8c8','#7fd6ff','#c084fc'])
    });
  }
  for(let i=driftOrganisms.length-1;i>=0;i--){
    const o=driftOrganisms[i];
    o.life+=dt;
    o.x+=o.vx*dt;o.y+=o.vy*dt;
    const fadeIn=clamp(o.life/1.5,0,1);
    const fadeOut=clamp((o.maxLife-o.life)/1.5,0,1);
    const a=Math.min(fadeIn,fadeOut)*0.09;
    if(o.life>=o.maxLife){driftOrganisms.splice(i,1);continue;}
    if(a<=0)continue;
    const t=performance.now()/1000;
    ctx.save();
    ctx.translate(o.x,o.y);
    ctx.globalAlpha=a;
    ctx.fillStyle=o.hue;
    // soft many-legged silhouette, like a jellyfish/plankton seen from below
    ctx.beginPath();
    for(let j=0;j<=o.legs*2;j++){
      const ang=(j/(o.legs*2))*Math.PI*2;
      const rr=o.r*(j%2===0?1:0.72)*(1+Math.sin(ang*3+t*0.8+o.wob)*0.06);
      const px=Math.cos(ang)*rr,py=Math.sin(ang)*rr*0.8; // slightly flattened
      j===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }
    ctx.closePath();ctx.fill();
    ctx.globalAlpha=a*1.6;
    ctx.beginPath();ctx.arc(0,0,o.r*0.22,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha=1;
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
  const pc=Math.round(clamp(view.bodyHp/view.bodyHpMax,0,1)*20)/20; // bucketed → bounded sprite cache
  const healthy={r:62,g:232,b:200},dying={r:122,g:44,b:66};
  const col={r:Math.round(lerp(dying.r,healthy.r,pc)),g:Math.round(lerp(dying.g,healthy.g,pc)),b:Math.round(lerp(dying.b,healthy.b,pc))};
  const pulse=1+hbBeat*0.03*pc;
  ctx.save();
  ctx.translate(c.x,c.y);ctx.scale(pulse,pulse);
  const spr=glowSprite('#'+((1<<24)|(col.r<<16)|(col.g<<8)|col.b).toString(16).slice(1),Math.round(r*1.5));
  blitGlow(spr,0,0,0.30+hbBeat*0.10);
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
  if(pc<=0.3){ // critical state ring
    ctx.strokeStyle=`rgba(255,77,109,${0.25+hbBeat*0.35})`;
    ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(c.x,c.y,r+8+hbBeat*4,0,Math.PI*2);ctx.stroke();
  }
}

function drawTrails(view){
  const trs=view.trails||[];
  if(!trs.length)return;
  for(let b=0;b<4;b++){ // 4 batched fills instead of one fill per trail blob
    const lo=b*0.25,hi=lo+0.25;
    ctx.beginPath();
    let n=0;
    for(const tr of trs){
      const a=clamp(tr.l/3,0,1);
      if(a<lo||a>=hi)continue;
      ctx.moveTo(tr.x+tr.w,tr.y);
      ctx.arc(tr.x,tr.y,tr.w,0,Math.PI*2);
      n++;
    }
    if(!n)continue;
    ctx.fillStyle=`rgba(138,154,91,${(hi*0.35).toFixed(3)})`;
    ctx.fill();
  }
}
function drawHazards(view){
  const t=performance.now()/1000;
  const spr=glowSprite('#d4ff4d',56);
  for(const hz of view.hazards||[]){
    const R=hz.r||hz.radius||0; // views carry `r` (host + snapshot); SIM carries `radius`
    if(!(R>0))continue;
    const fade=clamp(hz.l/1.8,0,1);
    const s=R*(0.9+Math.sin(t*3)*0.08)/56;
    ctx.save();
    ctx.globalAlpha=fade*0.22;
    ctx.translate(hz.x,hz.y);ctx.scale(s,s);
    ctx.drawImage(spr,-spr.width/2,-spr.height/2);
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
  const spr=glowSprite('#ffd166',16);
  for(const t of view.turrets||[]){
    blitGlow(spr,t.x,t.y,0.4);
    ctx.fillStyle='#ffd166';
    ctx.beginPath();ctx.arc(t.x,t.y,9,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(t.x,t.y,4,0,Math.PI*2);ctx.stroke();
  }
}
function drawPickups(view){
  const t=performance.now()/1000;
  const spr=glowSprite('#8fe36a',16);
  for(const pk of view.pickups||[]){
    const bob=Math.sin(t*3+(pk.w||0))*4;
    const fadeOut=pk.l<2?clamp(pk.l/2,0,1):1;
    blitGlow(spr,pk.x,pk.y+bob,0.5*fadeOut);
    ctx.globalAlpha=fadeOut;
    ctx.fillStyle='#8fe36a';
    ctx.beginPath();ctx.arc(pk.x,pk.y+bob,5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1;ctx.stroke();
    ctx.globalAlpha=1;
  }
}
function drawProjectiles(view){
  ctx.lineCap='round';
  // trailLength settings gate: 'short' shows fewer of the trail points the
  // sim already tracks (cheaper to stroke, snappier look), 'long' shows all
  // of them (the full motion-streak). This is display-only — the sim's own
  // trail history (enemies.js stepProjectiles) is unchanged either way, so
  // it stays deterministic/host-authoritative regardless of a viewer's
  // local settings.
  const trailN=Settings.trailLength==='short'?2:5;
  for(const pr of view.projs||[]){
    ctx.strokeStyle=hexToRgba(pr.c,0.5);
    ctx.lineWidth=pr.sp?4:3;
    ctx.beginPath();
    const tr=(pr.tr||[]).slice(-trailN);
    for(let i=0;i<tr.length;i++){
      const pt=tr[i];
      i===0?ctx.moveTo(pt[0],pt[1]):ctx.lineTo(pt[0],pt[1]);
    }
    ctx.lineTo(pr.x,pr.y);ctx.stroke();
    const spr=glowSprite(pr.c,pr.sp?12:9);
    blitGlow(spr,pr.x,pr.y,0.55);
    ctx.fillStyle=pr.c;
    ctx.beginPath();ctx.arc(pr.x,pr.y,pr.sp?5:4,0,Math.PI*2);ctx.fill();
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
/* ------------------------------------------------------------- aim tracer
   A guide line from the player's cell out to weapon range along the current
   aim direction (settings gate: tracer). ux,uy is a unit vector — caller
   normalizes. Five selectable styles (Settings → Controls → Tracer Style):
   solid/dotted/segmented are cheap canvas strokes, laser reuses the glow-
   sprite machinery for a bright bloomed core, pulse sends small traveling
   blips outward (same visual language as the game's existing EP motes) for
   a more "alive" read. All five stop exactly at `range`, never implying
   reach the weapon doesn't have. */
function drawAimTracer(px,py,ux,uy,range,t){
  const ex=px+ux*range,ey=py+uy*range;
  const style=Settings.tracerStyle;
  ctx.save();
  if(style==='dotted'){
    const gap=14,n=Math.floor(range/gap);
    ctx.fillStyle='rgba(62,232,200,0.55)';
    for(let i=1;i<n;i++){
      const d=i*gap;
      ctx.beginPath();ctx.arc(px+ux*d,py+uy*d,1.8,0,Math.PI*2);ctx.fill();
    }
  }else if(style==='segmented'){
    ctx.strokeStyle='rgba(62,232,200,0.5)';
    ctx.lineWidth=2;
    ctx.setLineDash([16,10]);
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(ex,ey);ctx.stroke();
    ctx.setLineDash([]);
  }else if(style==='laser'){
    const flicker=0.75+Math.sin(t*22)*0.08; // subtle live-wire shimmer, not a strobe
    ctx.strokeStyle=`rgba(62,232,200,${0.55*flicker})`;
    ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(ex,ey);ctx.stroke();
    const spr=glowSprite('#3ee8c8',10);
    // a few glow blits spaced along the line reads as a bloomed beam without
    // the cost of a gradient-filled thick stroke every frame
    const steps=5;
    for(let i=1;i<=steps;i++){
      const f=i/steps;
      blitGlow(spr,px+ux*range*f,py+uy*range*f,0.18*flicker);
    }
  }else if(style==='pulse'){
    ctx.strokeStyle='rgba(62,232,200,0.18)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(ex,ey);ctx.stroke();
    // 3 blips traveling outward on a shared loop, evenly spaced in phase —
    // same "energy moving along a line" read as the game's EP motes, just
    // constrained to the aim line instead of drifting toward the core.
    const speed=340,period=range/speed;
    for(let i=0;i<3;i++){
      const phase=((t/period)+i/3)%1;
      const d=phase*range;
      const a=Math.sin(phase*Math.PI); // fade in/out at both ends, brightest mid-travel
      ctx.fillStyle=`rgba(62,232,200,${0.7*a})`;
      ctx.beginPath();ctx.arc(px+ux*d,py+uy*d,2.4,0,Math.PI*2);ctx.fill();
    }
  }else{ // 'solid' (default fallback)
    const grad=ctx.createLinearGradient(px,py,ex,ey);
    grad.addColorStop(0,'rgba(62,232,200,0.5)');
    grad.addColorStop(1,'rgba(62,232,200,0.08)');
    ctx.strokeStyle=grad;
    ctx.lineWidth=1.8;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(ex,ey);ctx.stroke();
  }
  ctx.restore();
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
    }else if(pt.type==='debris'){
      // Jagged irregular fragment (destruction particles, settings gate:
      // destructionParticles) — an angular polygon that spins as it flies,
      // reads distinctly from the round burst sparks alongside it.
      if(!pt.rot)pt.rot=rand(0,Math.PI*2);
      if(!pt.spin)pt.spin=rand(-9,9);
      pt.rot+=pt.spin*0.016;
      ctx.save();
      ctx.translate(pt.x,pt.y);
      ctx.rotate(pt.rot);
      ctx.fillStyle=pt.color;
      const r=pt.size;
      ctx.beginPath();
      ctx.moveTo(r,0);
      ctx.lineTo(r*0.2,r*0.85);
      ctx.lineTo(-r*0.9,r*0.3);
      ctx.lineTo(-r*0.5,-r*0.8);
      ctx.lineTo(r*0.3,-r*0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }else{
      ctx.fillStyle=pt.color;
      ctx.beginPath();ctx.arc(pt.x,pt.y,pt.size*(pt.type==='muzzle'?a:1),0,Math.PI*2);ctx.fill();
    }
  }
  ctx.globalAlpha=1;
}
function drawMotes(){
  const spr=glowSprite('#3ee8c8',8);
  for(const m of FX.motes){
    if(m.t<0)continue;
    const x=lerp(m.x,m.tx,m.t);
    const y=lerp(m.y,m.ty,m.t)-Math.sin(m.t*Math.PI)*40;
    blitGlow(spr,x,y,(1-m.t*m.t)*0.7);
  }
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
