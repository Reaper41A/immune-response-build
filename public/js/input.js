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
  firing:false,
  abilityEdge:false,
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

/* desktop mouse-hold-to-fire anywhere on canvas */
canvas.addEventListener('mousedown',e=>{
  if(e.button!==0)return;
  if(App.screen==='playing')setFiring(true);
});
window.addEventListener('mouseup',()=>{if(Input.firing)setFiring(false);});
window.addEventListener('blur',()=>{if(Input.firing)setFiring(false);});

/* circular hit-test: only the visible circle counts, not the square box */
function isInsideCircularButton(el,cx,cy){
  const r=el.getBoundingClientRect();
  return Math.hypot(cx-(r.left+r.width/2),cy-(r.top+r.height/2))<=Math.min(r.width,r.height)/2;
}

const fireBtnEl=$('fireBtn');
let fireBtnTouchId=null;
fireBtnEl.addEventListener('touchstart',e=>{
  const t=e.changedTouches[0];
  if(!isInsideCircularButton(fireBtnEl,t.clientX,t.clientY))return;
  e.preventDefault();e.stopPropagation();
  fireBtnTouchId=t.identifier;
  setFiring(true);
},{passive:false});
function endFireBtn(e){
  for(const t of e.changedTouches){
    if(fireBtnTouchId!==null&&t.identifier!==fireBtnTouchId)continue;
    fireBtnTouchId=null;
    setFiring(false);
  }
}
fireBtnEl.addEventListener('touchend',endFireBtn);
fireBtnEl.addEventListener('touchcancel',endFireBtn);
fireBtnEl.addEventListener('mousedown',e=>{
  if(!isInsideCircularButton(fireBtnEl,e.clientX,e.clientY))return;
  e.stopPropagation();
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

/* virtual joystick — left half of screen */
const joyZone=$('joyZone'),joyBase=$('joyBase'),joyStick=$('joyStick');
let joyTouchId=null,joyActive=false,joyCX=0,joyCY=0;
joyZone.addEventListener('touchstart',e=>{
  e.preventDefault();
  const t=e.changedTouches[0];
  joyTouchId=t.identifier;
  const r=joyZone.getBoundingClientRect();
  joyCX=t.clientX-r.left;joyCY=t.clientY-r.top;
  joyBase.style.left=(joyCX-52)+'px';joyBase.style.top=(joyCY-52)+'px';
  joyStick.style.left=(joyCX-23)+'px';joyStick.style.top=(joyCY-23)+'px';
  joyBase.style.display='block';joyStick.style.display='block';
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
    Input.move={x:dx/max,y:dy/max};
  }
},{passive:false});
function endJoy(e){
  for(const t of e.changedTouches){
    if(t.identifier!==joyTouchId)continue;
    joyTouchId=null;joyActive=false;
    Input.move={x:0,y:0};
    joyBase.style.display='none';joyStick.style.display='none';
  }
}
joyZone.addEventListener('touchend',endJoy);
joyZone.addEventListener('touchcancel',endJoy);

/* block double-tap zoom & pinch during play */
document.addEventListener('touchmove',e=>{if(e.scale&&e.scale!==1)e.preventDefault();},{passive:false});
let lastTouchEnd=0;
document.addEventListener('touchend',e=>{
  const now=Date.now();
  if(now-lastTouchEnd<=300&&App.screen==='playing')e.preventDefault();
  lastTouchEnd=now;
},false);
