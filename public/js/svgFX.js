/* ============================================================================
   IMMUNE RESPONSE — svgFX: animated SVG sprite overlay

   Bridges the sim's per-frame VIEW to the animated SVG assets in
   /assets/sprites. Everything here is ADDITIVE: the canvas renderer in
   render.js/entities.js is completely untouched and keeps drawing exactly
   as before, underneath this layer. If this file is deleted or SvgFX.sync()
   is never called, the game behaves exactly as it did before this system
   existed — the SVG layer is a pure visual overlay, never a dependency.

   Architecture:
   - A DOM div (#svgLayer, positioned/sized to match the canvas exactly via
     the same vOffX/vOffY/vScale transform core.js already computes) holds
     one wrapper <div class="svgSprite"> per visible entity.
   - Each wrapper's inline <svg> content is a clone of the matching prototype
     loaded once from /assets/sprites/*.svg and cached in memory.
   - Every frame, SvgFX.sync(view, dt) walks the current enemies/players/
     pickups/turrets/hazards/core and: (a) creates a pooled instance the
     first time an id is seen, (b) positions/rotates/scales it to match the
     live sim entity using the exact same screen-space transform the canvas
     uses, (c) toggles CSS state classes (state-hit / state-critical /
     ability-active / etc.) based on the same fields entities.js already
     reads off the view, (d) removes instances for ids no longer present.
   - Death is handled separately via a short-lived "ghost" pool fed by the
     sim's own 'die' event, since a dead enemy is removed from view.enemies
     on the same frame it dies (see combat.js killEnemy) — the death
     animation needs to keep playing after the entity is gone from the sim.

   This module has ONE required call site: render() in main.js should call
   `SvgFX.sync(view, dtReal)` once per frame, after the canvas draw calls (so
   it can reuse the same view object). That's the only touch point outside
   this file, aside from the one-line `d:en.defKey` addition to the 'die'
   event payload in combat.js (needed so the death ghost knows which sprite
   to play) and the #svgLayer div + its CSS in index.html.
   ========================================================================== */
'use strict';

const SvgFX=(()=>{

  /* ---------------------------------------------------------------- config
     Maps sim keys to sprite files + each sprite's root element id (the id
     the CSS state classes in that file are scoped under, e.g.
     "#bacteria.state-hit"). Verified against every sprite file directly —
     see the project's own build notes for the full audit. */
  const ENEMY_SPRITES={
    bacteria:{file:'bacteria_prototype.svg',root:'bacteria'},
    virus:{file:'virus_prototype.svg',root:'virus'},
    fungi:{file:'fungi_prototype.svg',root:'fungi'},
    antigenCluster:{file:'antigen_cluster_prototype.svg',root:'antigenCluster'},
    worm_seg:{file:'worm_seg_prototype.svg',root:'worm_seg'},
    toxinsac:{file:'toxin_sac_prototype.svg',root:'toxinsac'},
    biofilmWall:{file:'biofilm_wall_prototype.svg',root:'biofilmWall'},
    mycovirus:{file:'mycovirus_prototype.svg',root:'mycovirus'},
    macrophageMimic:{file:'macrophage_mimic_prototype.svg',root:'macrophageMimic'},
    prion:{file:'prion_prototype.svg',root:'prion'},
    necroticDrifter:{file:'necrotic_drifter_prototype.svg',root:'necroticDrifter'},
    cytokineStormCloud:{file:'storm_cloud_prototype.svg',root:'cytokineStormCloud'},
    retrovirus:{file:'retrovirus.svg',root:'retrovirus'},
    parasite:{file:'parasite.svg',root:'parasite'},
    spore:{file:'spore.svg',root:'spore'},
    // Bosses: art supplied separately (not built in this pass) — filenames
    // are the agreed convention (matches every other *_prototype.svg entry
    // above) so dropping the 3 files into /assets/sprites with these exact
    // names + root ids is the only step needed to activate them; no other
    // code change required. See boss sprite contract: root <g id> must
    // match the `root` value below, viewBox centered on 0,0, and state
    // classes state-hit/state-critical/state-move/state-death plus
    // .state-telegraph (driven by slam windup, see syncEnemies below) all
    // scoped under that root exactly like virus_prototype.svg's own <style>.
    megaVirus:{file:'mega_virus_boss.svg',root:'megaVirus'},
    mutatedFungus:{file:'mutated_fungus_boss.svg',root:'mutatedFungus'},
    parasiteQueen:{file:'parasite_queen_boss.svg',root:'parasiteQueen'},
  };
  const PLAYER_SPRITES={
    macrophage:{file:'macrophage_player-1.svg',root:'macrophage'},
    tcell:{file:'tcell_player-1.svg',root:'tcell'},
    bcell:{file:'bcell_player.svg',root:'bcell'},
    nk:{file:'natural_killer_player.svg',root:'nk'},
  };
  const SPRITE_BASE='assets/sprites/';

  /* ------------------------------------------------------------- sprite cache
     Each sprite file is fetched + parsed ONCE, then every instance we need
     is a cheap cloneNode(true) of the cached template. */
  const _templates=new Map(); // file -> Promise<SVGElement>
  function loadTemplate(file){
    let p=_templates.get(file);
    if(p)return p;
    p=fetch(SPRITE_BASE+file)
      .then(r=>{
        if(!r.ok)throw new Error('svgFX: failed to load '+file+' ('+r.status+')');
        return r.text();
      })
      .then(text=>{
        const doc=new DOMParser().parseFromString(text,'image/svg+xml');
        const svg=doc.documentElement;
        if(svg.nodeName==='parsererror'||svg.querySelector('parsererror')){
          throw new Error('svgFX: parse error in '+file);
        }
        return svg;
      })
      .catch(err=>{
        console.error(err);
        return null; // a failed sprite degrades to "nothing drawn", never a crash
      });
    _templates.set(file,p);
    return p;
  }

  /* ------------------------------------------------------------ instance pool
     One pooled instance per live entity id (+ a separate pool for the
     handful of always-on singletons: player-count-many players, the one
     body core, and short-lived death ghosts). Instances are plain objects
     wrapping a DOM node; nothing here is a class, matching the rest of the
     codebase's plain-object style. */
  const enemyPool=new Map();   // enemy id -> instance
  const playerPool=new Map();  // player id -> instance
  const pickupPool=new Map();  // pickup identity key -> instance
  const turretPool=new Map();  // turret identity key -> instance
  const hazardPool=new Map();  // hazard identity key -> instance
  const ghostPool=[];          // short-lived death/collect/destroy ghosts (array, not keyed)
  let coreInstance=null;

  function makeInstance(kind,spriteInfo,opts){
    const inst={kind,root:null,svg:null,el:null,ready:false,failed:false,lastSeen:0,extra:{}};
    if(!spriteInfo){inst.ready=true;return inst;} // callers without a sprite file (shouldn't happen) degrade silently
    loadTemplate(spriteInfo.file).then(svg=>{
      if(!svg){inst.ready=true;inst.failed=true;return;} // load/parse failed — mark settled so callers (e.g. spawnDeathGhost's poll) stop waiting instead of looping forever
      const wrap=document.createElement('div');
      wrap.className='svgSprite';
      const clone=svg.cloneNode(true);
      wrap.appendChild(clone);
      inst.el=wrap;
      inst.svg=clone;
      inst.root=clone.getElementById(spriteInfo.root)||clone.querySelector('g[id]')||clone;
      inst.ready=true;
      const layer=$('svgLayer');
      if(layer){
        // background must paint BEHIND every entity — #svgLayer's stacking
        // is DOM order (later = on top), and entity instances are appended
        // as they're first seen, which can be before the background loads
        // (e.g. background's own fetch is slower than an already-cached
        // enemy sprite). prependEntity forces first-child placement so
        // this is correct regardless of load-order race; every other
        // caller keeps the normal end-of-list append.
        if(opts&&opts.prependEntity)layer.insertBefore(wrap,layer.firstChild);
        else layer.appendChild(wrap);
      }
    });
    return inst;
  }

  function destroyInstance(inst){
    if(inst&&inst.el&&inst.el.parentNode)inst.el.parentNode.removeChild(inst.el);
  }

  /* --------------------------------------------------------- screen transform
     Identical math to what render.js already applies to the canvas
     (vOffX/vOffY/vScale from core.js's fitWorld) so SVG sprites land exactly
     on top of where the canvas would have drawn the same entity. */
  function worldToScreen(x,y){
    return{x:vOffX+x*vScale,y:vOffY+y*vScale};
  }
  function setTransform(inst,x,y,rotRad,scale){
    if(!inst.el)return;
    const p=worldToScreen(x,y);
    const s=(scale==null?1:scale)*vScale;
    const rot=rotRad?(rotRad*180/Math.PI):0;
    inst.el.style.transform=`translate(${p.x}px,${p.y}px) rotate(${rot}deg) scale(${s})`;
  }
  function setClass(inst,name,on){
    if(!inst.root)return;
    inst.root.classList.toggle(name,!!on);
  }
  function setVar(inst,name,val){
    if(!inst.el)return;
    inst.el.style.setProperty(name,val);
  }

  /* ------------------------------------------------------------ background
     SVG replacement for render.js's drawVeins/drawFloatingCells/
     drawDriftingOrganisms. Unlike every sync* below, this reads no `view`
     at all — same as the canvas versions, it's driven purely by hbBeat
     (a plain global set once per frame in main.js's loop, same value
     drawCore/drawBackground already receive) and its own internal timers.
     One singleton instance (backgroundInstance), never pooled per-entity. */
  let backgroundInstance=null;
  const veinSeedsSvg=[]; // mirrors render.js's veinSeeds shape/generation exactly, kept separate so this file has no dependency on render.js's module-scope array
  const cellSeedsSvg=[]; // mirrors render.js's floatCells
  const glowSeedsSvg=[]; // mirrors render.js's ambientSeeds (the soft round wash, separate from the hex-shaped floating cells)
  const bgOrganisms=[];  // mirrors render.js's driftOrganisms (dynamic array, spawn/despawn over time)
  let bgOrganismTemplate=null; // cached <g id="drifting-organism-template"> node, cloned per spawned organism
  let cellTemplateApplied=false;

  function ensureVeinSeeds(){
    if(veinSeedsSvg.length)return;
    const c=worldCore();
    for(let i=0;i<14;i++){
      const a=(i/14)*Math.PI*2+0.3;
      const midR=Math.max(VW,VH)*0.33;
      veinSeedsSvg.push({
        a,w:rand(6,13),
        x0:c.x+Math.cos(a)*coreRadius()*1.2,y0:c.y+Math.sin(a)*coreRadius()*1.2,
        cx:c.x+Math.cos(a+0.35)*midR,cy:c.y+Math.sin(a+0.35)*midR,
        x1:c.x+Math.cos(a-0.15)*Math.max(VW,VH)*0.78,y1:c.y+Math.sin(a-0.15)*Math.max(VW,VH)*0.78,
        phase:rand(0,1),
      });
    }
  }
  function ensureCellSeeds(){
    if(cellSeedsSvg.length)return;
    for(let i=0;i<7;i++){
      cellSeedsSvg.push({
        r:rand(9,20),speed:rand(0.008,0.02),drift:rand(0,1000),
        hue:choice(['#8fe36a','#7fd6ff','#ffd166','#c084fc']),
        spin:rand(-0.3,0.3),
      });
    }
  }
  function ensureGlowSeeds(){
    if(glowSeedsSvg.length)return;
    for(let i=0;i<9;i++)glowSeedsSvg.push({sx:rand(0,1000),sy:rand(0,1000),r:rand(26,64),hue:i%2});
  }
  function hexPathD(r,pts){ // same star-ish outline math as drawFloatingCells' per-frame path, baked once here since cell shape is a static outline (only position/rotation animate, not silhouette wobble — the ~0.15 per-frame vertex jitter in canvas is a subtlety not worth the extra per-frame SVG path rewrite it would cost)
    let d='';
    for(let i=0;i<=pts;i++){
      const ang=(i/pts)*Math.PI*2;
      const x=Math.cos(ang)*r,y=Math.sin(ang)*r;
      d+=(i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1)+' ';
    }
    return d+'Z';
  }
  function organismPathD(r,legs){ // static approximation of drawDriftingOrganisms' per-frame wobbling silhouette — see hexPathD's note on why wobble isn't reproduced per-frame here
    let d='';
    for(let j=0;j<=legs*2;j++){
      const ang=(j/(legs*2))*Math.PI*2;
      const rr=r*(j%2===0?1:0.72);
      const x=Math.cos(ang)*rr,y=Math.sin(ang)*rr*0.8;
      d+=(j===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1)+' ';
    }
    return d+'Z';
  }

  function syncBackground(hbBeatVal,dt){
    if(!Settings.svgBackground)return; // tier gate — see settings.js QUALITY_PRESETS for the High(off)/Ultra(on) split
    if(!backgroundInstance){
      backgroundInstance=makeInstance('background',{file:'ambient_background.svg',root:'ambient-bg'},{prependEntity:true});
    }
    const inst=backgroundInstance;
    if(!inst.ready||!inst.el||inst.failed)return;

    // Placement: unlike a per-entity instance (a point + scale), this SVG
    // is stretched to cover exactly the world rect main.js clips canvas
    // drawing to (vOffX,vOffY,VW*vScale,VH*vScale — see main.js's
    // ctx.rect(...) call), so its internal 0..VW/0..VH viewBox coordinates
    // land on the same screen pixels canvas would have used.
    inst.el.style.transform=`translate(${vOffX}px,${vOffY}px)`;
    inst.el.style.width=(VW*vScale)+'px';
    inst.el.style.height=(VH*vScale)+'px';
    const svgEl=inst.svg;
    if(svgEl){svgEl.setAttribute('width',VW*vScale);svgEl.setAttribute('height',VH*vScale);}

    const veinLayer=svgEl&&svgEl.getElementById('vein-layer');
    const glowLayer=svgEl&&svgEl.getElementById('glow-layer');
    const cellLayer=svgEl&&svgEl.getElementById('cell-layer');
    const organismLayer=svgEl&&svgEl.getElementById('organism-layer');

    // ---- veins: 14 static-position curves, pulsing on hbBeat ----
    // Tempo/intensity is NOT a CSS keyframe — hbT's own rate changes
    // continuously with Body HP (see main.js loop: hbT+=dt*(1.4+...)), so
    // there is no fixed period a CSS @keyframes could lock to. Driven
    // inline every frame instead, same technique as body_core.svg's
    // health-tissue color lerp in syncCore above.
    if(veinLayer&&Settings.veins){
      ensureVeinSeeds();
      const beat=REDUCED?0:hbBeatVal;
      if(veinLayer.childElementCount===0){
        // build once: 14 base strokes + 14 pulse strokes, in DOM order so
        // pulses paint over their own base vein (matches canvas draw order)
        for(const v of veinSeedsSvg){
          const base=document.createElementNS('http://www.w3.org/2000/svg','path');
          base.setAttribute('class','vein-stroke');
          // no blur filter — canvas's drawVeins uses a plain stroke with no
          // shadowBlur, so applying one here would be a visual deviation,
          // not a faithful port. The #veinGlow filter def stays in the
          // asset for potential future use but isn't applied by default.
          base.setAttribute('d',`M${v.x0},${v.y0} Q${v.cx},${v.cy} ${v.x1},${v.y1}`);
          veinLayer.appendChild(base);
        }
        for(const v of veinSeedsSvg){
          const pulse=document.createElementNS('http://www.w3.org/2000/svg','line');
          pulse.setAttribute('class','vein-pulse');
          veinLayer.appendChild(pulse);
        }
        // cache the NodeLists once at build time rather than re-querying
        // the DOM every frame (60x/sec) for something that never changes
        // shape after construction — this loop exists specifically to cut
        // per-frame cost, so re-querying here would work against the point.
        inst.extra.veinBases=veinLayer.querySelectorAll('.vein-stroke');
        inst.extra.veinPulses=veinLayer.querySelectorAll('.vein-pulse');
      }
      const bases=inst.extra.veinBases,pulses=inst.extra.veinPulses;
      const glow=0.05+beat*0.09;
      for(let i=0;i<veinSeedsSvg.length;i++){
        const v=veinSeedsSvg[i],b=bases[i];
        if(!b)continue;
        b.setAttribute('stroke',`rgba(127,214,255,${glow.toFixed(3)})`);
        b.setAttribute('stroke-width',String(v.w*(1+beat*0.22)));
      }
      const showPulse=!REDUCED&&beat>0.15;
      for(let i=0;i<veinSeedsSvg.length;i++){
        const v=veinSeedsSvg[i],p=pulses[i];
        if(!p)continue;
        if(!showPulse){p.style.opacity='0';continue;}
        const tt=clamp(beat+v.phase*0.001,0,1);
        const px=lerp(lerp(v.x0,v.cx,tt),lerp(v.cx,v.x1,tt),tt);
        const py=lerp(lerp(v.y0,v.cy,tt),lerp(v.cy,v.y1,tt),tt);
        p.setAttribute('x1',String(px-Math.cos(v.a)*10));p.setAttribute('y1',String(py-Math.sin(v.a)*10));
        p.setAttribute('x2',String(px+Math.cos(v.a)*10));p.setAttribute('y2',String(py+Math.sin(v.a)*10));
        p.setAttribute('stroke',`rgba(200,255,240,${(beat*0.35).toFixed(3)})`);
        p.setAttribute('stroke-width',String(v.w*0.55));
        p.style.opacity='1';
      }
    }else if(veinLayer){
      veinLayer.textContent=''; // Settings.veins toggled off mid-run — clear rather than leave stale strokes
      inst.extra.veinBases=null;inst.extra.veinPulses=null; // querySelectorAll returns a static snapshot, not a live list — must invalidate so a later re-enable rebuilds instead of animating detached nodes
    }

    // ---- ambient glow wash: soft round blobs, alpha 0.045, slow drift.
    // Same Settings.backgroundFx gate as floating cells below (canvas draws
    // both inside the same `if(Settings.backgroundFx)` block), same
    // REDUCED behavior (skipped entirely, not just frozen, matching
    // drawFloatingCells' own early-return under REDUCED).
    if(glowLayer&&Settings.backgroundFx&&!REDUCED){
      ensureGlowSeeds();
      if(glowLayer.childElementCount===0){
        const tmpl=svgEl.getElementById('ambient-glow-template');
        for(const s of glowSeedsSvg){
          const g=tmpl.cloneNode(true);
          g.removeAttribute('id');
          g.style.color=s.hue?'#3ee8c8':'#7fd6ff';
          g.querySelector('.glow-body').setAttribute('r',String(s.r));
          g.style.opacity='0.045';
          glowLayer.appendChild(g);
        }
      }
      const t=performance.now()/1000;
      const glowGroups=glowLayer.children;
      for(let i=0;i<glowSeedsSvg.length;i++){
        const s=glowSeedsSvg[i],g=glowGroups[i];
        if(!g)continue;
        const x=((Math.sin(t*0.05+s.sx)*0.5+0.5)*VW*1.2)-VW*0.1;
        const y=((Math.cos(t*0.04+s.sy)*0.5+0.5)*VH*1.2)-VH*0.1;
        g.setAttribute('transform',`translate(${x.toFixed(1)},${y.toFixed(1)})`);
      }
    }else if(glowLayer){
      glowLayer.textContent='';
    }

    // ---- floating cells: slow ambient drift, position JS-driven to match
    // the canvas sin/cos formula exactly; spin is the one part handed to a
    // CSS animation since it's constant-rate and untied to any game state.
    // Same Settings.backgroundFx/REDUCED gating as the glow wash above —
    // canvas's drawFloatingCells() is only ever called from inside
    // drawBackground's `if(Settings.backgroundFx)` block.
    if(cellLayer&&Settings.backgroundFx&&!REDUCED){
      ensureCellSeeds();
      if(cellLayer.childElementCount===0){
        const tmpl=svgEl.getElementById('floating-cell-template');
        for(const fc of cellSeedsSvg){
          const g=tmpl.cloneNode(true);
          g.removeAttribute('id');
          g.style.color=fc.hue;
          const body=g.querySelector('.cell-body');
          body.setAttribute('d',hexPathD(fc.r,6));
          body.style.animationDuration=(Math.abs(1/fc.spin)*Math.PI*2/3).toFixed(2)+'s'; // spin is rad/s in canvas; convert to a CSS loop duration for a full 360° turn
          body.style.animationDirection=fc.spin<0?'reverse':'normal';
          const nucleus=g.querySelector('.cell-nucleus');
          nucleus.setAttribute('r',String(fc.r*0.32));
          nucleus.setAttribute('cx',String(fc.r*0.15));
          nucleus.setAttribute('cy',String(-fc.r*0.1));
          cellLayer.appendChild(g);
        }
      }
      const t=performance.now()/1000;
      const groups=cellLayer.children;
      for(let i=0;i<cellSeedsSvg.length;i++){
        const fc=cellSeedsSvg[i],g=groups[i];
        if(!g)continue;
        const x=((Math.sin(t*fc.speed+fc.drift)*0.5+0.5))*VW*1.1-VW*0.05;
        const y=((Math.cos(t*fc.speed*0.7+fc.drift*1.3)*0.5+0.5))*VH*1.1-VH*0.05;
        g.setAttribute('transform',`translate(${x.toFixed(1)},${y.toFixed(1)})`);
      }
    }else if(cellLayer){
      cellLayer.textContent=''; // backgroundFx off, or reduced-motion (cells are motion so they're skipped entirely, not just frozen)
    }

    // ---- drifting organisms: occasional large silhouettes crossing the
    // arena. Spawn/despawn timing mirrors render.js's driftOrganisms array
    // exactly (same spawn probability, same count cap, same life range) so
    // switching svgBackground on/off mid-run doesn't change pacing.
    if(organismLayer&&!REDUCED&&Settings.backgroundFx){
      if(!bgOrganismTemplate)bgOrganismTemplate=svgEl.getElementById('drifting-organism-template');
      if(Math.random()<dt*0.045&&bgOrganisms.length<2){
        const a=rand(0,Math.PI*2);
        const speed=rand(14,26);
        const R=Math.max(VW,VH)*0.75;
        const c=worldCore();
        const o={
          x:c.x+Math.cos(a)*R,y:c.y+Math.sin(a)*R,
          vx:-Math.cos(a)*speed,vy:-Math.sin(a)*speed,
          r:rand(70,130),life:0,maxLife:rand(9,14),wob:rand(0,1000),
          legs:randi(5,8),hue:choice(['#3ee8c8','#7fd6ff','#c084fc']),
          el:null,
        };
        const g=bgOrganismTemplate.cloneNode(true);
        g.removeAttribute('id');
        g.style.color=o.hue;
        g.querySelector('.organism-body').setAttribute('d',organismPathD(o.r,o.legs));
        const coreEl=g.querySelector('.organism-core');
        coreEl.setAttribute('r',String(o.r*0.22));
        organismLayer.appendChild(g);
        o.el=g;
        o.coreEl=coreEl; // cached once at spawn — only 0-2 organisms alive at a time so this isn't the same cost concern as the 14-vein re-query above, but no reason to re-query per frame when spawn-time caching is free
        bgOrganisms.push(o);
      }
      for(let i=bgOrganisms.length-1;i>=0;i--){
        const o=bgOrganisms[i];
        o.life+=dt;
        o.x+=o.vx*dt;o.y+=o.vy*dt;
        const fadeIn=clamp(o.life/1.5,0,1);
        const fadeOut=clamp((o.maxLife-o.life)/1.5,0,1);
        const alpha=Math.min(fadeIn,fadeOut)*0.09;
        if(o.life>=o.maxLife){
          if(o.el&&o.el.parentNode)o.el.parentNode.removeChild(o.el);
          bgOrganisms.splice(i,1);
          continue;
        }
        if(!o.el)continue;
        o.el.setAttribute('transform',`translate(${o.x.toFixed(1)},${o.y.toFixed(1)})`);
        o.el.style.opacity=alpha.toFixed(3);
        if(o.coreEl)o.coreEl.style.opacity=Math.min(1,alpha*1.6).toFixed(3); // matches canvas's globalAlpha=a*1.6 for the core circle
      }
    }else if(organismLayer&&(REDUCED||!Settings.backgroundFx)){
      for(const o of bgOrganisms){if(o.el&&o.el.parentNode)o.el.parentNode.removeChild(o.el);}
      bgOrganisms.length=0;
    }
  }

  /* --------------------------------------------------------------- enemies */
  function syncEnemies(view,t){
    const seen=new Set();
    for(const en of view.enemies||[]){
      const info=ENEMY_SPRITES[en.d];
      if(!info)continue; // boss defs / unmapped types fall back to the existing canvas draw automatically
      seen.add(en.i);
      let inst=enemyPool.get(en.i);
      if(!inst){inst=makeInstance('enemy',info);enemyPool.set(en.i,inst);}
      inst.lastSeen=t;
      if(!inst.ready||!inst.el)continue;

      // worm segments position themselves from wseg history rather than a
      // single x/y — CSS only owns rotation/scale for these (see
      // worm_seg_prototype.svg's own comment), so translate is JS-owned here.
      if(en.d==='worm_seg'&&en.wseg&&en.wseg.length){
        setTransform(inst,en.wseg[0].x,en.wseg[0].y,0,1);
        const segIds=['seg-head','seg-2','seg-3','seg-4','seg-tail'];
        for(let i=0;i<segIds.length;i++){
          const segEl=inst.svg&&inst.svg.getElementById(segIds[i]);
          if(!segEl)continue;
          const hp=en.wseg[i]||en.wseg[en.wseg.length-1];
          const p0=worldToScreen(en.wseg[0].x,en.wseg[0].y);
          const p1=worldToScreen(hp.x,hp.y);
          segEl.style.transform=`translate(${(p1.x-p0.x)/vScale}px,${(p1.y-p0.y)/vScale}px)`;
        }
      }else{
        setTransform(inst,en.x,en.y,0,1);
      }

      // No velocity field exists on the view's enemy entries (buildHostView
      // only sends x/y), so movement is derived locally by comparing this
      // frame's position to the last frame we saw this same pooled instance
      // — cheap, and self-corrects if an entity teleports (e.g. respawn).
      const prevX=inst.extra.px,prevY=inst.extra.py;
      const moved=prevX!=null&&(Math.abs(en.x-prevX)>0.05||Math.abs(en.y-prevY)>0.05);
      inst.extra.px=en.x;inst.extra.py=en.y;
      setClass(inst,'state-move',moved);
      setClass(inst,'state-hit',en.tf>0);
      setClass(inst,'regen-active',!!en.rg);
      setClass(inst,'cloak-active',!!en.cl);

      const hpFrac=en.hm>0?en.hp/en.hm:1;
      setClass(inst,'state-critical',hpFrac>0&&hpFrac<=0.3);

      // Storm Cloud pulse telegraph: en.pt ramps 0→1 as the next pulse
      // approaches (see main.js buildHostView / netcode.js buildSnapshot for
      // where these are computed). .charging is on for the final 35% of the
      // interval so the glow-up reads as an anticipation window, not just an
      // instant flash; the CSS charging animation is itself ~1s, matched to
      // roughly that window at the default 4s interval. en.pf stays true for
      // a short WINDOW (~0.35s, not a single tick — see enemies.js), so this
      // is edge-detected against the instance's own last-seen state rather
      // than re-triggering .pulsing (and stacking redundant removal timers)
      // on every one of the several frames that window spans.
      if(en.d==='cytokineStormCloud'){
        setClass(inst,'charging',en.pt>=0.65);
        if(en.pf&&!inst.extra.pulseFiring){
          inst.extra.pulseFiring=true;
          setClass(inst,'pulsing',true);
          setTimeout(()=>{setClass(inst,'pulsing',false);},650);
        }else if(!en.pf){
          inst.extra.pulseFiring=false;
        }
      }
      // Boss slam telegraph: same shape as the Storm Cloud pulse above —
      // .state-telegraph is a level (on for the whole windup, driven by
      // en.st>0 rather than a threshold like charging's 0.65, since a boss
      // windup is the ENTIRE point of the animation rather than a last-
      // portion glow-up) and .state-slam is an edge-detected momentary hit
      // flash, same debounce-against-multi-frame-window technique as
      // pulsing above (en.sf stays true for a short duration, not one tick).
      // Gated on en.st/en.sf directly (not a def lookup) since the view
      // only ever carries st/sf as 0 for non-slam enemies — no need to
      // special-case by defKey the way cytokineStormCloud's pulse is above.
      setClass(inst,'state-telegraph',en.st>0);
      if(en.sf&&!inst.extra.slamFiring){
        inst.extra.slamFiring=true;
        setClass(inst,'state-slam',true);
        setTimeout(()=>{setClass(inst,'state-slam',false);},400);
      }else if(!en.sf){
        inst.extra.slamFiring=false;
      }
      // Parasite (and any other buffAura enemy): continuous, so the class is
      // just "is this entity alive and buffAura-flagged" — no timer needed.
      if(en.ba)setClass(inst,'buffing',true);
    }
    // remove pooled instances for enemies no longer in the view (kill/despawn
    // without a 'die' event, e.g. mid-transition) — death VISUALS are handled
    // separately by the ghost pool fed off the 'die' event, so this is just
    // pool hygiene, not where the death animation plays.
    for(const [id,inst] of enemyPool){
      if(!seen.has(id)){destroyInstance(inst);enemyPool.delete(id);}
    }
  }

  /* --------------------------------------------------------------- players */
  function syncPlayers(view,t){
    const seen=new Set();
    for(const p of view.players||[]){
      if(!p.a)continue; // downed players keep the existing canvas-drawn respawn ring; no sprite needed
      const info=PLAYER_SPRITES[p.c];
      if(!info)continue;
      seen.add(p.i);
      let inst=playerPool.get(p.i);
      if(!inst){inst=makeInstance('player',info);playerPool.set(p.i,inst);}
      inst.lastSeen=t;
      if(!inst.ready||!inst.el)continue;

      setTransform(inst,p.x,p.y,0,1);
      const facing=inst.svg&&inst.svg.getElementById('facing-indicator');
      if(facing)facing.style.transform=`rotate(${(p.f||0)*180/Math.PI}deg)`;

      setClass(inst,'ability-active',p.aa>0);
      const hpFrac=p.hm>0?p.hp/p.hm:1;
      // No per-player hit-flash timer exists on the view (unlike enemies'
      // en.tf) — derive a brief hit pulse locally from a frame-to-frame HP
      // drop instead, cleared automatically after ~200ms.
      const prevHp=inst.extra.hp;
      if(prevHp!=null&&p.hp<prevHp-0.01){inst.extra.hitUntil=t+200;}
      inst.extra.hp=p.hp;
      setClass(inst,'state-hit',!!(inst.extra.hitUntil&&t<inst.extra.hitUntil));
      setClass(inst,'state-critical',hpFrac>0&&hpFrac<=0.3);
    }
    for(const [id,inst] of playerPool){
      if(!seen.has(id)){destroyInstance(inst);playerPool.delete(id);}
    }
  }

  /* ---------------------------------------------------------------- pickups */
  function syncPickups(view,t){
    const seen=new Set();
    for(const pk of view.pickups||[]){
      const key=pk.x.toFixed(0)+':'+pk.y.toFixed(0)+':'+(pk.w||0); // pickups have no id in the view; position+wobble-seed is stable per pickup for its lifetime
      seen.add(key);
      let inst=pickupPool.get(key);
      const isNew=!inst;
      if(!inst){inst=makeInstance('pickup',{file:'pickup.svg',root:'pickup'});pickupPool.set(key,inst);}
      inst.lastSeen=t;
      if(!inst.ready||!inst.el)continue;
      setTransform(inst,pk.x,pk.y,0,1);
      if(isNew){
        setClass(inst,'spawning',true);
        setTimeout(()=>setClass(inst,'spawning',false),400);
      }
    }
    for(const [key,inst] of pickupPool){
      if(!seen.has(key)){
        // play the collect animation instead of an instant removal when a
        // pickup vanishes early (collected) vs its natural life running out
        // (both look the same from here — either way it's gone from the
        // view — so we always play the short collect burst; a pickup that
        // simply expired reads as "dissolved" via the same clip, which is
        // an acceptable shared outcome for a decorative pickup).
        setClass(inst,'collected',true);
        const el=inst.el;
        setTimeout(()=>{if(el&&el.parentNode)el.parentNode.removeChild(el);},320);
        pickupPool.delete(key);
      }
    }
  }

  /* ---------------------------------------------------------------- turrets */
  function syncTurrets(view,t){
    const seen=new Set();
    for(let idx=0;idx<(view.turrets||[]).length;idx++){
      const tu=view.turrets[idx];
      const key=idx+':'+Math.round(tu.x)+':'+Math.round(tu.y);
      seen.add(key);
      let inst=turretPool.get(key);
      if(!inst){inst=makeInstance('turret',{file:'turret.svg',root:'turret'});turretPool.set(key,inst);}
      inst.lastSeen=t;
      if(!inst.ready||!inst.el)continue;
      setTransform(inst,tu.x,tu.y,0,1);
      setClass(inst,'corrupted',!!tu.corrupted);
    }
    for(const [key,inst] of turretPool){
      if(!seen.has(key)){destroyInstance(inst);turretPool.delete(key);}
    }
  }

  /* --------------------------------------------------------------- hazards */
  function syncHazards(view,t){
    const seen=new Set();
    for(let idx=0;idx<(view.hazards||[]).length;idx++){
      const hz=view.hazards[idx];
      const key=idx+':'+Math.round(hz.x)+':'+Math.round(hz.y);
      seen.add(key);
      let inst=hazardPool.get(key);
      const isNew=!inst;
      if(!inst){inst=makeInstance('hazard',{file:'acid_cloud_hazard.svg',root:'acid-cloud'});hazardPool.set(key,inst);}
      inst.lastSeen=t;
      if(!inst.ready||!inst.el)continue;
      const R=hz.r||hz.radius||56;
      setTransform(inst,hz.x,hz.y,0,R/56); // 56 = the hazard's designed base radius (matches drawHazards' own glow sprite sizing)
      setVar(inst,'--life-frac',String(hz.l!=null?Math.max(0,Math.min(1,hz.l/1.8)):1));
      if(isNew){
        setClass(inst,'spawning',true);
        setTimeout(()=>setClass(inst,'spawning',false),350);
      }
    }
    for(const [key,inst] of hazardPool){
      if(!seen.has(key)){destroyInstance(inst);hazardPool.delete(key);}
    }
  }

  /* ------------------------------------------------------------------ core */
  function syncCore(view){
    if(!coreInstance)coreInstance=makeInstance('core',{file:'body_core.svg',root:'body-core'});
    const inst=coreInstance;
    if(!inst.ready||!inst.el)return;
    const c=worldCore();
    setTransform(inst,c.x,c.y,0,coreRadius()/220); // 220 = body_core.svg's own designed half-width (viewBox -220..220)
    const pct=view.bodyHpMax>0?view.bodyHp/view.bodyHpMax:1;
    setClass(inst,'critical',pct<=0.3);
    // health-tissue color lerp + sickness-texture opacity: driven continuously
    // here rather than as a CSS keyframe, per the sprite's own comment.
    const tissue=inst.svg&&inst.svg.getElementById('health-tissue');
    const sickness=inst.svg&&inst.svg.getElementById('sickness-texture');
    if(sickness)sickness.style.opacity=String(Math.max(0,Math.min(1,(0.5-pct)/0.5)));
    if(tissue){
      const healthy={r:67,g:207,b:187},sick={r:196,g:90,b:99};
      const lerpP=Math.max(0,Math.min(1,1-pct));
      const r=Math.round(healthy.r+(sick.r-healthy.r)*lerpP);
      const g=Math.round(healthy.g+(sick.g-healthy.g)*lerpP);
      const b=Math.round(healthy.b+(sick.b-healthy.b)*lerpP);
      const use=tissue.querySelector('use');
      if(use)use.setAttribute('fill',`rgb(${r},${g},${b})`);
    }
  }

  /* -------------------------------------------------------- death ghosts
     Fed by the 'die' event (see main event handler hookup below). A ghost
     is a fire-and-forget instance that plays its death animation once and
     removes itself — it is NOT part of enemyPool since the enemy is already
     gone from view.enemies by the time this fires. */
  function spawnDeathGhost(evData){
    const info=ENEMY_SPRITES[evData.d];
    if(!info)return; // unmapped/boss defs: canvas deathBurst (already wired in fx.js) is the only visual, unaffected
    const inst=makeInstance('ghost',info);
    ghostPool.push(inst);
    const x=evData.x,y=evData.y;
    const check=()=>{
      if(!inst.ready){requestAnimationFrame(check);return;}
      const cleanup=()=>{
        destroyInstance(inst);
        const i=ghostPool.indexOf(inst);
        if(i>=0)ghostPool.splice(i,1);
      };
      if(inst.failed||!inst.el){cleanup();return;} // sprite failed to load — nothing to animate, just drop the pooled entry
      setTransform(inst,x,y,0,evData.scale||1);
      setClass(inst,'state-death',true);
      setTimeout(cleanup,1200); // generous — longest death anim in the roster (worm scatter/necrotic dissolve) is ~1.0-1.1s
    };
    check();
  }

  /* ------------------------------------------------------------- background
     useCanvasBackground() tells callers (nothing currently reads it — see
     note in the original wiring pass) whether canvas should skip its own
     drawVeins/drawFloatingCells/drawDriftingOrganisms now that syncBackground
     above provides an SVG replacement. Tier-gated on Settings.svgBackground,
     same source of truth syncBackground itself checks, so the two can never
     disagree about which tier the SVG background is active in.
     ------------------------------------------------------------- */
  function useCanvasBackground(){
    return!Settings.svgBackground;
  }

  /* --------------------------------------------------------------- public */
  function sync(view,dt,hbBeatVal){
    const layer=$('svgLayer');
    if(!layer)return; // svgLayer missing from this page (shouldn't happen) — no-op, canvas unaffected
    const t=performance.now();
    // Background runs unconditionally (view can be null — main menu/lobby
    // still wants ambient veins+drift, matching drawBackground's own
    // unconditional call in render()). It has its own Settings.svgBackground
    // gate internally, and its own dt-based timers, so a null/undefined dt
    // is guarded there too (defaults to 0, meaning no organism spawns that
    // frame — never a crash, just a quiet frame, self-corrects next call).
    syncBackground(hbBeatVal||0,dt||0);
    if(!view)return;
    // Entity-category gate (Low/Medium: canvas-only, see settings.js
    // QUALITY_PRESETS comment for the tier reasoning).
    if(!Settings.svgEntities)return;
    syncEnemies(view,t);
    syncPlayers(view,t);
    syncPickups(view,t);
    syncTurrets(view,t);
    syncHazards(view,t);
    syncCore(view);
  }

  function onEvent(e){
    if(e.k==='die')spawnDeathGhost(e);
    if(e.k==='gameover'&&coreInstance)setClass(coreInstance,'destroyed',true);
  }

  function reset(){
    for(const inst of enemyPool.values())destroyInstance(inst);
    for(const inst of playerPool.values())destroyInstance(inst);
    for(const inst of pickupPool.values())destroyInstance(inst);
    for(const inst of turretPool.values())destroyInstance(inst);
    for(const inst of hazardPool.values())destroyInstance(inst);
    for(const inst of ghostPool)destroyInstance(inst);
    enemyPool.clear();playerPool.clear();pickupPool.clear();
    turretPool.clear();hazardPool.clear();ghostPool.length=0;
    if(coreInstance){destroyInstance(coreInstance);coreInstance=null;}
    resetBackground();
  }

  function resetBackground(){
    if(backgroundInstance){destroyInstance(backgroundInstance);backgroundInstance=null;}
    for(const o of bgOrganisms){if(o.el&&o.el.parentNode)o.el.parentNode.removeChild(o.el);}
    bgOrganisms.length=0;
    // veinSeedsSvg/cellSeedsSvg/glowSeedsSvg are intentionally NOT cleared —
    // they're pure layout data (positions/colors/speeds), not DOM, and
    // re-deriving them would just reroll different-looking (but equally
    // valid) veins/cells on next enable. Destroying backgroundInstance
    // above is what actually frees the DOM; the seed arrays are cheap to
    // keep and keeping them means a re-enable looks the same as before the
    // reset rather than randomly reshuffling, which reads as more stable.
  }

  function hasReadyEnemy(en){
    const inst=enemyPool.get(en.i);
    return!!(inst&&inst.ready&&!inst.failed&&inst.el);
  }
  function hasReadyPlayer(p){
    const inst=playerPool.get(p.i);
    return!!(inst&&inst.ready&&!inst.failed&&inst.el);
  }
  function hasReadyCore(){
    return!!(coreInstance&&coreInstance.ready&&!coreInstance.failed&&coreInstance.el);
  }

  return{sync,onEvent,reset,resetBackground,useCanvasBackground,hasReadyEnemy,hasReadyPlayer,hasReadyCore};
})();
