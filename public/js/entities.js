/* ============================================================================
   IMMUNE RESPONSE — renderer part 2: enemies & players
   ========================================================================== */
'use strict';

function drawEnemies(view){
  const t=performance.now()/1000;
  for(const en of view.enemies||[]){
    const def=ENEMY_DEFS[en.d]||BOSS_DEFS[en.d]||{color:'#fff',glow:'#fff',radius:12,name:'?'};
    // worm body chain (position history is tracked per-frame in finalizeView)
    if(en.wseg){
      for(let i=en.wseg.length-1;i>=1;i--){
        const s=en.wseg[i];
        const rr=Math.max(3,def.radius*(1-i*0.09));
        ctx.globalAlpha=(1-i/en.wseg.length)*0.55+0.15;
        ctx.fillStyle=def.color;
        ctx.beginPath();ctx.arc(s.x,s.y,rr,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    // Mimic in disguise renders as a PLAYER of its victim's color — that is
    // the entire point (Phase 1 ruling). Revealed form is a pale husk.
    if(en.mg===1&&en.dp){
      const victim=(view.players||[]).find(p=>p.i===en.dp);
      drawMimicDisguised(en,t,victim);
      continue;
    }
    ctx.save();
    ctx.translate(en.x,en.y);
    let alpha=1;
    if(en.cl)alpha=0.35;
    if(en.mg===3)alpha=0.5+Math.abs(Math.sin(t*30))*0.4; // telegraph flicker
    const gr=en.hm>500?def.radius*2.6:def.radius*2.2;
    blitGlow(glowSprite(def.glow,Math.ceil(gr)),0,0,alpha*0.32);
    ctx.globalAlpha=alpha;

    const flash=en.tf>0?en.tf/0.15:0;
    ctx.fillStyle=flash>0?`rgba(255,255,255,${0.55+flash*0.45})`:def.color;
    switch(en.d){
      case'bacteria':blobPath(def.radius,t*3.3+en.i);break;
      case'virus':spikyPath(def.radius,8,t*5+en.i);break;
      case'fungi':
        blobPath(def.radius,t*1.1+en.i,0.15);
        ctx.fillStyle='rgba(255,255,255,0.18)';
        for(let i=0;i<3;i++){
          const a=i/3*Math.PI*2+t*0.3;
          ctx.beginPath();ctx.arc(Math.cos(a)*def.radius*0.45,Math.sin(a)*def.radius*0.45,3,0,Math.PI*2);ctx.fill();
        }
        break;
      case'mycovirus':
        blobPath(def.radius*1.15,t*1.4+en.i,0.2);
        ctx.fillStyle=flash>0?'#fff':'#ff4d6d';
        spikyPath(def.radius*0.6,7,t*4.5+en.i);
        break;
      case'prion':hexPath(def.radius);break;
      case'toxinsac':blobPath(def.radius,t*6+en.i,0.28);break;
      case'antigenCluster':
        for(let i=0;i<4;i++){
          const a=i/4*Math.PI*2+t;
          const px=Math.cos(a)*def.radius*0.42,py=Math.sin(a)*def.radius*0.42,pr=def.radius*0.5;
          ctx.save();ctx.translate(px,py);
          ctx.beginPath();ctx.arc(0,0,pr,0,Math.PI*2);ctx.fill();
          shade3D(ctx,pr,{hiAlpha:0.45});
          ctx.restore();
        }
        break;
      case'biofilmWall':
        roundRect(-def.radius,-def.radius*0.8,def.radius*2,def.radius*1.6,10);
        ctx.strokeStyle=flash>0?'#fff':'rgba(255,255,255,0.35)';
        ctx.lineWidth=2;ctx.stroke();
        if(en.rg){ctx.strokeStyle=`rgba(143,227,106,${0.4+Math.sin(t*6)*0.25})`;ctx.lineWidth=2.5;roundRect(-def.radius-4,-def.radius*0.8-4,(def.radius+4)*2,def.radius*1.6+8,12);}
        break;
      case'necroticDrifter':
        blobPath(def.radius,t*2+en.i,0.22);
        drip(def.radius,t,en.i);
        break;
      case'cytokineStormCloud':cloudPath(def.radius,t+en.i);break;
      case'retrovirus':dartPath(def.radius,t+en.i);break;
      case'spore':
        ctx.beginPath();ctx.arc(0,0,def.radius*(0.85+Math.sin(t*3+en.i)*0.12),0,Math.PI*2);ctx.fill();
        break;
      case'parasite':case'megaVirus':case'mutatedFungus':case'parasiteQueen':
        spikyPath(def.radius,12,t*2+en.i,0.25);
        break;
      case'macrophageMimic': // revealed husk
        blobPath(def.radius,t*2.5,0.3);
        ctx.fillStyle='#ff4d6d';
        ctx.beginPath();ctx.arc(0,0,def.radius*0.35,0,Math.PI*2);ctx.fill();
        shade3D(ctx,def.radius*0.35,{hiAlpha:0.5});
        break;
      default:
        ctx.beginPath();ctx.arc(0,0,def.radius,0,Math.PI*2);ctx.fill();
        shade3D(ctx,def.radius);
    }

    // elite ring + glyph
    if(en.el){
      const ec={armor:'#c9c9c9',speed:'#ffd166',shield:'#7fd6ff',regen:'#8fe36a'}[en.el]||'#fff';
      ctx.strokeStyle=ec;ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(0,0,def.radius+4,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=ec;
      ctx.font='bold 9px Cascadia Mono, Consolas, monospace';ctx.textAlign='center';
      ctx.fillText({armor:'A',speed:'S',shield:'S+',regen:'R'}[en.el]||'',0,-def.radius-8);
    }
    // taunt ring
    if(en.tb){ctx.strokeStyle='rgba(127,214,255,0.75)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,def.radius+7,0,Math.PI*2);ctx.stroke();}
    // parasite aura tether hint
    if(en.d==='parasite'){
      ctx.strokeStyle='rgba(255,159,90,0.25)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(0,0,140,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();

    // hp bar (tanky units only — trash dies fast enough not to need one)
    if(!isBossDef(en.d)&&en.hm>40){
      const w=en.hm>400?60:30;
      const pct=clamp(en.hp/en.hm,0,1);
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.fillRect(en.x-w/2,en.y-def.radius-14,w,4);
      ctx.fillStyle=pct>0.5?'#8fe36a':pct>0.25?'#ffd166':'#ff4d6d';
      ctx.fillRect(en.x-w/2,en.y-def.radius-14,w*pct,4);
    }
    if(isBossDef(en.d)){
      ctx.fillStyle='#ffb3c0';
      ctx.font='bold 11px Cascadia Mono, Consolas, monospace';ctx.textAlign='center';
      ctx.fillText(def.name.toUpperCase(),en.x,en.y-def.radius-16);
    }
  }
}
function isBossDef(d){return d==='megaVirus'||d==='mutatedFungus'||d==='parasiteQueen';}

function drawMimicDisguised(en,t,victim){
  const color=victim?victim.col:'#7fd6ff';
  const name=victim?victim.n:'???';
  ctx.save();
  ctx.translate(en.x,en.y);
  // the tell: periodic glitch shimmer + slightly desaturated body
  const glitch=Math.sin(t*1.7+en.i)>0.93?rand(-2,2):0;
  if(glitch)ctx.translate(glitch,glitch);
  blitGlow(glowSprite(color,26),0,0,0.28);
  ctx.globalAlpha*=0.94;
  ctx.fillStyle=color;
  ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.fill();
  shade3D(ctx,13);
  ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1.5;ctx.stroke();
  ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.75)';
  ctx.font='9px Cascadia Mono, Consolas, monospace';ctx.textAlign='center';
  ctx.fillText(name,en.x,en.y+27);
}

function blobPath(r,t,irr=0.12){
  const pts=8;
  ctx.beginPath();
  for(let i=0;i<=pts;i++){
    const a=(i/pts)*Math.PI*2;
    const rr=r*(1+Math.sin(a*3+t)*irr);
    const x=Math.cos(a)*rr,y=Math.sin(a)*rr;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.fill();
  shade3D(ctx,r);
}
function spikyPath(r,spikes,t,inner=0.55){
  ctx.beginPath();
  for(let i=0;i<spikes*2;i++){
    const a=(i/(spikes*2))*Math.PI*2;
    const rr=(i%2===0?r:r*inner)*(1+Math.sin(t+i)*0.06);
    const x=Math.cos(a)*rr,y=Math.sin(a)*rr;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.fill();
  shade3D(ctx,r,{hiAlpha:0.4,specular:false}); // spikes read busy w/ a hard fleck; keep it soft
}
function hexPath(r){
  ctx.beginPath();
  for(let i=0;i<=6;i++){
    const a=(i/6)*Math.PI*2;
    const x=Math.cos(a)*r,y=Math.sin(a)*r;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.fill();
  shade3D(ctx,r,{hiAlpha:0.5});
  ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1.5;ctx.stroke();
}
function cloudPath(r,t){
  ctx.beginPath();
  ctx.arc(-r*0.45,r*0.1,r*0.5,0,Math.PI*2);
  ctx.arc(r*0.05,-r*0.25,r*0.62,0,Math.PI*2);
  ctx.arc(r*0.55,r*0.1,r*0.48,0,Math.PI*2);
  ctx.arc(0,r*0.28,r*0.5,0,Math.PI*2);
  ctx.fill();
  shade3D(ctx,r,{ly:-r*0.55,hiAlpha:0.5,specular:false});
  ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(0,0,r*(1.15+((t%1)<0.5?(t%1):1-(t%1))*0.15),0,Math.PI*2);ctx.stroke();
}
function dartPath(r,t){
  const wob=Math.sin(t*4)*0.15;
  ctx.rotate(wob);
  ctx.beginPath();
  ctx.moveTo(r*1.3,0);ctx.lineTo(-r*0.7,-r*0.75);ctx.lineTo(-r*0.3,0);ctx.lineTo(-r*0.7,r*0.75);
  ctx.closePath();ctx.fill();
  shade3D(ctx,r,{lx:r*0.15,ly:-r*0.25});
}
function drip(r,t,seed){
  ctx.fillStyle='rgba(138,154,91,0.6)';
  for(let i=0;i<2;i++){
    const phase=t*1.4+seed+i*2.1;
    const dy=r*(0.6+((phase%1)))*0.9;
    ctx.beginPath();ctx.arc(Math.sin(seed+i*3)*r*0.5,dy,2.5,0,Math.PI*2);ctx.fill();
  }
}
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();ctx.fill();
  shade3D(ctx,Math.max(w,h)*0.5,{lx:x+w*0.28,ly:y+h*0.22,hiAlpha:0.35,specular:false});
}

/* ---------------------------------------------------------------- players */
const YOU_COLOR='#ff3ec8'; // Phase 3 audit fix — unique vs every class/enemy
function drawPlayers(view,firingRingFor){
  const t=performance.now()/1000;
  for(const p of view.players||[]){
    const cls=CLASSES[p.c]||CLASSES.tcell;
    if(!p.a){
      // downed marker + respawn arc
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.globalAlpha=0.55;
      ctx.strokeStyle=hexToRgba(p.col,0.7);ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,p.hm?17:17,0,Math.PI*2);ctx.stroke();
      const rp=p.rs!=null?1-clamp(p.rs/RESPAWN_SECONDS,0,1):1;
      ctx.strokeStyle='#8fe36a';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(0,0,21,-Math.PI/2,-Math.PI/2+rp*Math.PI*2);ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.7)';
      ctx.font='bold 10px Cascadia Mono, Consolas, monospace';ctx.textAlign='center';
      ctx.fillText(Math.ceil(p.rs||0)+'s',0,3);
      ctx.restore();
      continue;
    }
    // range indicator while firing: shows exactly how far your weapon can
    // reach so manual aim (or aim assist) knows when a shot can connect.
    // settings gate: rangeRing
    if(firingRingFor===p.i&&Settings.rangeRing){
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.strokeStyle=`rgba(62,232,200,${0.20+Math.sin(t*6)*0.08})`;
      ctx.lineWidth=1.5;
      ctx.setLineDash([10,12]);
      ctx.beginPath();ctx.arc(0,0,p.rangeCache||clsRange(p),0,Math.PI*2);ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // aim tracer: a guide line from your cell out to weapon range along
    // your current aim direction — settings gate: tracer. Shown for the
    // local player while aiming OR firing. Note this is intentionally NOT
    // gated on `firingRingFor` like the range ring above — firingRingFor
    // only equals the local player's index while Input.firing is true, so
    // gating on it here would make the "or aiming" half of the condition
    // below unreachable (aiming-without-firing could never pass), leaving
    // the tracer effectively dead outside of also-firing. Use the same
    // local-player check used everywhere else instead (p.i===App.myPid).
    if(p.i===App.myPid&&Settings.tracer&&(Input.firing||Input.aiming)){
      const aimLen=Math.hypot(Input.aim.x,Input.aim.y);
      if(aimLen>0.01)drawAimTracer(p.x,p.y,Input.aim.x/aimLen,Input.aim.y/aimLen,p.rangeCache||clsRange(p),t);
    }
    ctx.save();
    ctx.translate(p.x,p.y);
    const baseA=view.invulnHint===p.i?0.6+Math.sin(performance.now()/40)*0.3:1;
    blitGlow(glowSprite(p.col,34),0,0,baseA*0.3);
    ctx.globalAlpha=baseA;

    // YOU ring — magenta, pulsing, ONLY on the local player
    if(p.i===App.myPid){
      ctx.strokeStyle='rgba(255,62,200,0.92)';
      ctx.lineWidth=2.5;
      const pulse=1+(REDUCED?0:Math.sin(t*4)*0.07);
      ctx.beginPath();ctx.arc(0,0,22*pulse,0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle=p.col;
    ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();
    shade3D(ctx,14,{hiAlpha:0.6});
    ctx.strokeStyle=p.oh?'rgba(255,77,109,0.95)':'rgba(255,255,255,0.65)';
    ctx.lineWidth=1.5;ctx.stroke();
    // facing nub
    ctx.strokeStyle='rgba(255,255,255,0.85)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(p.f||0)*21,Math.sin(p.f||0)*21);ctx.stroke();
    // overdrive aura
    if(p.aa>0){
      ctx.strokeStyle='rgba(62,232,200,0.7)';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,19+Math.sin(t*10)*2,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();

    // chevron above YOU
    if(p.i===App.myPid){
      const bobY=REDUCED?0:Math.sin(t*5)*2.5;
      ctx.save();
      ctx.translate(p.x,p.y-34+bobY);
      ctx.fillStyle=YOU_COLOR;
      ctx.beginPath();
      ctx.moveTo(-6,-5);ctx.lineTo(6,-5);ctx.lineTo(0,4);ctx.closePath();ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle=p.i===App.myPid?YOU_COLOR:'rgba(255,255,255,0.78)';
    ctx.font=(p.i===App.myPid?'bold ':'')+'10px Cascadia Mono, Consolas, monospace';
    ctx.textAlign='center';
    ctx.fillText(p.i===App.myPid?'YOU':p.n,p.x,p.y+27);
    // mini hp bar
    const pct=clamp(p.hp/p.hm,0,1);
    ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(p.x-14,p.y-24,28,3);
    ctx.fillStyle=pct>0.35?p.col:'#ff4d6d';ctx.fillRect(p.x-14,p.y-24,28*pct,3);
    // target reticle on this player's lock (host view only)
    if(view.lockOf&&view.lockOf[p.i]){
      const en=view.enemies.find(e=>e.i===view.lockOf[p.i]);
      if(en)drawReticle(en,t);
    }
  }
}
function clsRange(p){const c=CLASSES[p.c];return c?c.range:300;}
function drawReticle(en,t){
  ctx.save();
  ctx.translate(en.x,en.y);
  ctx.rotate(t*2);
  ctx.strokeStyle='#ff4d6d';ctx.lineWidth=2;
  const rr=22;
  for(let i=0;i<4;i++){
    const a0=i*Math.PI/2,a1=a0+Math.PI/3.2;
    ctx.beginPath();ctx.arc(0,0,rr,a0,a1);ctx.stroke();
  }
  ctx.rotate(-t*2);
  ctx.fillStyle='rgba(255,77,109,0.9)';
  ctx.fillRect(-1,-1,2,2);
  ctx.restore();
}
