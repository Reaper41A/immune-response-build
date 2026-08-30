/* ============================================================================
   IMMUNE RESPONSE — input
   Desktop: WASD/arrows move, SPACE or hold-mouse fires, E = ability.
   Mobile: floating joystick (left half), FIRE + ability buttons bottom-right
   with circular hit-tests (a tap in the square bounding box corner must NOT
   count — the prototype learned this the hard way).
   Guests route everything through Input; netcode streams it to the host.
   ========================================================================== */
'use strict';

const Input={
  move:{x:0,y:0},
  aim:{x:0,y:0},
  firing:false,
  aiming:false,       // true while the aim stick is held out past its dead zone
  abilityEdge:false,
  skillEdge:false,    // one-shot: aim stick just crossed the outer ring
  keys:{},
};
function updateMoveFromKeys(){
  const k=Input.keys;
  let x=0,y=0;
  if(k['a']||k['arrowleft'])x-=1;
  if(k['d']||k['arrowright'])x+=1;
  if(k['w']||k['arrowup'])y-=1;
  if(k['s']||k['arrowdown'])y+=1;
  // keyboard composes with (doesn't fight) the touch joystick
  if(x||y||!joyActive){Input.move.x=x;Input.move.y=y;}
}
window.addEventListener('keydown',e=>{
  const tag=(e.target&&e.target.tagName)||'';
  if(tag==='INPUT'||tag==='TEXTAREA')return;
  Input.keys[e.key.toLowerCase()]=true;
  updateMoveFromKeys();
  if(e.code==='Space'){
    e.preventDefault();
    setFiring(true);
  }
  if(e.key.toLowerCase()==='e')pressAbility();
  if(e.key==='Escape')togglePause();
});
window.addEventListener('keyup',e=>{
  Input.keys[e.key.toLowerCase()]=false;
  updateMoveFromKeys();
  if(e.code==='Space')setFiring(false);
});
function setFiring(v){
  const was=Input.firing;
  Input.firing=v;
  $('fireBtn').classList.toggle('firing',v);
  if(App.isHost&&SIM){
    const me=SIM.players.find(p=>p.pid===App.myPid);
    if(me&&!v&&was)onFireReleased(me); // release clears lock (Phase2 decision)
  }
  if(!v)fireBtnTouchId=null;
}
function pressAbility(){
  Input.abilityEdge=true;
  if(App.isHost&&SIM){
    const me=SIM.players.find(p=>p.pid===App.myPid);
    if(me)useAbility(me);
    Input.abilityEdge=false;
  }
}

/* desktop: mouse position sets aim direction (relative to your own player's
   on-screen position); hold left-click or Space to fire that direction.
   Movement stays WASD/arrows — this only replaces "always shoot nearest
   enemy" with "shoot where you're actually pointing". */
let mouseScreenX=0,mouseScreenY=0,mouseInWorld=false;
canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  mouseScreenX=e.clientX-r.left;mouseScreenY=e.clientY-r.top;
  mouseInWorld=true;
  updateMouseAim();
});
function updateMouseAim(){
  if(!mouseInWorld||!SIM||App.screen!=='playing')return;
  const me=SIM.players.find(p=>p.pid===App.myPid);
  if(!me)return;
  const sx=vOffX+me.x*vScale,sy=vOffY+me.y*vScale;
  const dx=mouseScreenX-sx,dy=mouseScreenY-sy;
  const d=Math.hypot(dx,dy);
  if(d>4){Input.aim.x=dx/d;Input.aim.y=dy/d;} // ignore the dead-still case (cursor sitting on the player)
}

/* desktop mouse-hold-to-fire anywhere on canvas */
canvas.addEventListener('mousedown',e=>{
  if(e.button!==0)return;
  if(App.screen==='playing'){updateMouseAim();setFiring(true);}
});
window.addEventListener('mouseup',()=>{if(Input.firing)setFiring(false);});
window.addEventListener('blur',()=>{if(Input.firing)setFiring(false);});

/* circular hit-test: only the visible circle counts, not the square box */
function isInsideCircularButton(el,cx,cy){
  const r=el.getBoundingClientRect();
  return Math.hypot(cx-(r.left+r.width/2),cy-(r.top+r.height/2))<=Math.min(r.width,r.height)/2;
}

/* fireBtn keeps working for desktop-with-mouse (click-and-hold), but on
   touch devices firing is now implicit in the aim stick below — holding it
   out past the dead zone auto-fires that direction, so the old dedicated
   FIRE touch target is gone (see CSS: fire-btn/ability-btn are hidden
   whenever the aim stick is present). */
const fireBtnEl=$('fireBtn');
fireBtnEl.addEventListener('mousedown',e=>{
  if(!isInsideCircularButton(fireBtnEl,e.clientX,e.clientY))return;
  e.stopPropagation();
  updateMouseAim();
  setFiring(true);
});

const abilityBtnEl=$('abilityBtn');
abilityBtnEl.addEventListener('touchstart',e=>{
  const t=e.changedTouches[0];
  if(!isInsideCircularButton(abilityBtnEl,t.clientX,t.clientY))return;
  e.preventDefault();e.stopPropagation();
  abilityBtnTouchId=t.identifier;
  pressAbility();
},{passive:false});
let abilityBtnTouchId=null;
abilityBtnEl.addEventListener('touchend',e=>{
  for(const t of e.changedTouches)if(t.identifier===abilityBtnTouchId)abilityBtnTouchId=null;
});
abilityBtnEl.addEventListener('click',e=>{
  if(e.pointerType==='touch')return; // handled above with reliable touchstart
  pressAbility();
});

/* Fixed control scheme's ability button — same touch handling as abilityBtn
   above, separate element because it's positioned differently (locked above
   the aim stick's fixed base) and the two are mutually exclusive via CSS
   (only one is ever visible, gated on Settings.controlScheme). */
const fixedAbilityBtnEl=$('fixedAbilityBtn');
let fixedAbilityBtnTouchId=null;
fixedAbilityBtnEl.addEventListener('touchstart',e=>{
  const t=e.changedTouches[0];
  if(!isInsideCircularButton(fixedAbilityBtnEl,t.clientX,t.clientY))return;
  e.preventDefault();e.stopPropagation();
  fixedAbilityBtnTouchId=t.identifier;
  pressAbility();
},{passive:false});
fixedAbilityBtnEl.addEventListener('touchend',e=>{
  for(const t of e.changedTouches)if(t.identifier===fixedAbilityBtnTouchId)fixedAbilityBtnTouchId=null;
});

/* virtual joystick — left half of screen */
const joyZone=$('joyZone'),joyBase=$('joyBase'),joyStick=$('joyStick');
let joyTouchId=null,joyActive=false,joyCX=0,joyCY=0;

/* Fixed control scheme: the base's resting position comes from its own CSS
   (see index.html — #gameWrap.fixed-scheme pins #joyBase/#aimBase to a
   permanent spot) instead of wherever the finger first lands. Floating mode
   is unchanged — origin is the touchdown point, base spawns there and is
   hidden until touched. Everything downstream (dead zone, ramp, outer-ring
   skill trigger) reads off `cx,cy` the same way in both modes; only how
   `cx,cy` get set differs. */
function stickOrigin(zone,base){
  if(Settings.controlScheme==='fixed'){
    const zr=zone.getBoundingClientRect(),br=base.getBoundingClientRect();
    return{x:br.left+br.width/2-zr.left,y:br.top+br.height/2-zr.top};
  }
  return null; // floating mode: caller uses the touch point itself
}
joyZone.addEventListener('touchstart',e=>{
  e.preventDefault();
  const t=e.changedTouches[0];
  joyTouchId=t.identifier;
  const r=joyZone.getBoundingClientRect();
  const fixed=stickOrigin(joyZone,joyBase);
  joyCX=fixed?fixed.x:t.clientX-r.left;joyCY=fixed?fixed.y:t.clientY-r.top;
  if(!fixed){
    joyBase.style.left=(joyCX-52)+'px';joyBase.style.top=(joyCY-52)+'px';
    joyBase.style.display='block';
  }
  joyStick.style.left=(joyCX-23)+'px';joyStick.style.top=(joyCY-23)+'px';
  joyStick.style.display='block';
  joyActive=true;
},{passive:false});
joyZone.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier!==joyTouchId)continue;
    const r=joyZone.getBoundingClientRect();
    let dx=(t.clientX-r.left)-joyCX,dy=(t.clientY-r.top)-joyCY;
    const d=Math.hypot(dx,dy),max=52;
    if(d>max){dx=dx/d*max;dy=dy/d*max;}
    joyStick.style.left=(joyCX+dx-23)+'px';joyStick.style.top=(joyCY+dy-23)+'px';
    // Dead zone: a resting thumb drifts a few pixels from touchdown even when
    // the player means to stand still. Below ~14% of the stick's travel,
    // that drift produced a tiny nonzero move vector every frame, which
    // read as constant jittery creep/facing-snap instead of "standing
    // still" — a big part of controls feeling twitchy and hard to trust.
    const DEAD=0.14;
    const mag=d/max;
    if(mag<DEAD){Input.move.x=0;Input.move.y=0;}
    else{
      // rescale so output ramps 0→1 across the remaining travel instead of
      // jumping straight to 14% the instant the dead zone is cleared
      const scaled=(mag-DEAD)/(1-DEAD);
      Input.move.x=(dx/d)*scaled;Input.move.y=(dy/d)*scaled;
    }
  }
},{passive:false});
function endJoy(e){
  for(const t of e.changedTouches){
    if(t.identifier!==joyTouchId)continue;
    joyTouchId=null;joyActive=false;
    Input.move={x:0,y:0};
    if(Settings.controlScheme==='fixed'){
      // base stays put — it's a permanent fixture in Fixed mode; only the
      // thumb needs to spring back to center
      joyStick.style.left=(joyCX-23)+'px';joyStick.style.top=(joyCY-23)+'px';
    }else{
      joyBase.style.display='none';joyStick.style.display='none';
    }
  }
}
joyZone.addEventListener('touchend',endJoy);
joyZone.addEventListener('touchcancel',endJoy);

/* virtual aim stick — right half of screen. Replaces the old FIRE/ability
   buttons on touch: holding the stick out past its dead zone aims AND
   fires in that direction (twin-stick-shooter style, per design decision),
   and dragging further out past a distinct OUTER RING triggers the class
   skill once per drag-out. The ring sits well past the normal aim radius
   specifically so it can't be crossed by accident while just aiming —
   you have to deliberately push past where aiming alone ever needs to go. */
const aimZone=$('aimZone'),aimBase=$('aimBase'),aimStick=$('aimStick'),aimRing=$('aimRing');
let aimTouchId=null,aimCX=0,aimCY=0,aimPastRing=false;
const AIM_MAX=52;      // normal full-deflection radius — matches the move stick
const AIM_RING=82;     // outer ring: drag past this to trigger the skill
const AIM_DEAD=0.16;
aimZone.addEventListener('touchstart',e=>{
  e.preventDefault();
  const t=e.changedTouches[0];
  aimTouchId=t.identifier;
  const r=aimZone.getBoundingClientRect();
  const fixed=stickOrigin(aimZone,aimBase);
  aimCX=fixed?fixed.x:t.clientX-r.left;aimCY=fixed?fixed.y:t.clientY-r.top;
  if(!fixed){
    aimBase.style.left=(aimCX-AIM_MAX)+'px';aimBase.style.top=(aimCY-AIM_MAX)+'px';
    aimRing.style.left=(aimCX-AIM_RING)+'px';aimRing.style.top=(aimCY-AIM_RING)+'px';
    aimBase.style.display='block';aimRing.style.display='block';
  }
  aimStick.style.left=(aimCX-23)+'px';aimStick.style.top=(aimCY-23)+'px';
  aimStick.style.display='block';
  aimPastRing=false;
},{passive:false});
aimZone.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier!==aimTouchId)continue;
    const r=aimZone.getBoundingClientRect();
    const rawDx=(t.clientX-r.left)-aimCX,rawDy=(t.clientY-r.top)-aimCY;
    const d=Math.hypot(rawDx,rawDy);
    // Visible stick clamps at AIM_MAX regardless of ring state — the ring
    // is a distance *threshold* you push through, not a bigger aim range,
    // so aiming itself never gets more or less precise once you're past it.
    const clampD=Math.min(d,AIM_MAX);
    const nx=d>0?rawDx/d:0,ny=d>0?rawDy/d:0;
    aimStick.style.left=(aimCX+nx*clampD-23)+'px';aimStick.style.top=(aimCY+ny*clampD-23)+'px';
    const mag=clampD/AIM_MAX;
    if(mag<AIM_DEAD){
      Input.aiming=false;
    }else{
      Input.aiming=true;
      Input.aim.x=nx;Input.aim.y=ny;
    }
    // Outer-ring skill trigger: edge-detected so holding past the ring
    // fires the skill exactly once, not every frame. Resets on release
    // (touchend below) so the next deliberate drag-out can trigger again.
    // Fixed control scheme drops this entirely — the skill instead fires
    // off the always-visible fixed ability button (see CSS: #aimRing is
    // display:none in Fixed mode), so a drag past AIM_RING there would be
    // an invisible, undiscoverable trigger with no ring to show for it.
    if(Settings.controlScheme!=='fixed'&&d>=AIM_RING&&!aimPastRing){
      aimPastRing=true;
      Input.skillEdge=true;
      aimRing.classList.add('triggered');
    }
  }
},{passive:false});
function endAim(e){
  for(const t of e.changedTouches){
    if(t.identifier!==aimTouchId)continue;
    aimTouchId=null;aimPastRing=false;
    Input.aiming=false;Input.aim={x:0,y:0};
    if(Settings.controlScheme==='fixed'){
      aimStick.style.left=(aimCX-23)+'px';aimStick.style.top=(aimCY-23)+'px';
    }else{
      aimBase.style.display='none';aimStick.style.display='none';aimRing.style.display='none';
    }
    aimRing.classList.remove('triggered');
  }
}
aimZone.addEventListener('touchend',endAim);
aimZone.addEventListener('touchcancel',endAim);

/* block double-tap zoom & pinch during play */
document.addEventListener('touchmove',e=>{if(e.scale&&e.scale!==1)e.preventDefault();},{passive:false});
let lastTouchEnd=0;
document.addEventListener('touchend',e=>{
  const now=Date.now();
  if(now-lastTouchEnd<=300&&App.screen==='playing')e.preventDefault();
  lastTouchEnd=now;
},false);

/* Called by settings.js applyControlScheme() whenever Settings.controlScheme
   changes — clears any touch currently mid-drag on either stick so a scheme
   swap mid-run can't leave a stale touchId aiming at a base that just moved. */
function resetStickTouches(){
  if(joyTouchId!=null){
    joyTouchId=null;joyActive=false;Input.move={x:0,y:0};
    joyBase.style.display=Settings.controlScheme==='fixed'?'block':'none';
    joyStick.style.display=Settings.controlScheme==='fixed'?'block':'none';
  }
  if(aimTouchId!=null){
    aimTouchId=null;aimPastRing=false;
    Input.aiming=false;Input.aim={x:0,y:0};
    aimBase.style.display=Settings.controlScheme==='fixed'?'block':'none';
    aimStick.style.display=Settings.controlScheme==='fixed'?'block':'none';
    aimRing.style.display='none';aimRing.classList.remove('triggered');
  }
}
