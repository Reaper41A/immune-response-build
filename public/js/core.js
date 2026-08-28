/* ============================================================================
   IMMUNE RESPONSE — core: utilities, canvas, app/session state
   ========================================================================== */
'use strict';

/* ---------------------------------------------------------------- utils */
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const choice=arr=>arr[Math.floor(Math.random()*arr.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
const dist=(ax,ay,bx,by)=>Math.sqrt(dist2(ax,ay,bx,by));
const lerp=(a,b,t)=>a+(b-a)*t;
const angleTo=(ax,ay,bx,by)=>Math.atan2(by-ay,bx-ax);
let _uid=0;
const uid=()=>++_uid;
const r1=v=>Math.round(v*10)/10;
const $=id=>document.getElementById(id);
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function hexToRgba(hex,a){
  const h=hex.replace('#','');
  const r=parseInt(h.substring(0,2),16),g=parseInt(h.substring(2,4),16),b=parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------------------------------------------------------------- canvas */
const canvas=$('gameCanvas');
const ctx=canvas.getContext('2d',{alpha:false}); // opaque → compositor skips per-frame blending (big mobile heat win)
let W=0,H=0,DPR=1;
let RES=1;          // adaptive backing-store scale (PERF controller in main.js)
let COMPACT=false;  // phone-class viewport — drives world size, FX budgets
let bgCache=null;
/* The battle arena lives in FIXED virtual coordinates (VW×VH), frozen at run
   start. Resizes (phone URL bar, rotation, window dragging) only rescale the
   letterboxed projection — the arena, spawns and entity positions never
   shift mid-fight. */
let VW=1280,VH=720,vScale=1,vOffX=0,vOffY=0;
function resize(){
  const wrap=$('gameWrap');
  const rect=wrap.getBoundingClientRect();
  DPR=Math.min(window.devicePixelRatio||1,2);
  W=Math.max(1,Math.round(rect.width));H=Math.max(1,Math.round(rect.height));
  COMPACT=Math.min(W,H)<520;
  if(!resize.init){resize.init=true;RES=COMPACT?0.85:1;} // phones start cooler, PERF adapts from there
  canvas.width=Math.max(1,Math.round(W*DPR*RES));
  canvas.height=Math.max(1,Math.round(H*DPR*RES));
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  fitWorld();
}
function fitWorld(){
  vScale=Math.min(W/VW,H/VH);
  vOffX=(W-VW*vScale)/2;vOffY=(H-VH*vScale)/2;
  bgCache=null;
}
function initWorld(){
  const ar=clamp(W/Math.max(1,H),0.62,2.2);
  // phones get a physically smaller arena so the projection scale (and thus
  // every entity on screen) stays readable instead of shrinking into the distance
  VH=COMPACT?700:900;
  VW=Math.round(clamp(VH*ar,COMPACT?500:700,1760));
  fitWorld();
}
window.addEventListener('resize',resize);
window.addEventListener('orientationchange',()=>setTimeout(resize,80));

/* ------------------------------------------------------- fullscreen/landscape
   Must be called synchronously from inside a user-gesture click handler —
   browsers reject fullscreen/orientation-lock requests made any other way
   (e.g. after an awaited network round-trip). Both APIs are best-effort:
   iOS Safari has no orientation-lock API at all (landscape there is just a
   hint via CSS/rotate-to-play), and fullscreen itself can be denied by the
   user or blocked in an embedded webview — every failure here is caught
   and swallowed so a run always starts even if neither takes effect. */
function requestGameFullscreen(){
  const el=document.documentElement;
  const req=el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen;
  if(!req)return;
  try{
    const p=req.call(el);
    if(p&&p.then)p.then(lockLandscape).catch(()=>{});
    else lockLandscape(); // older vendor-prefixed APIs don't return a promise
  }catch(_){}
}
function lockLandscape(){
  try{
    const so=screen.orientation;
    if(so&&so.lock)so.lock('landscape').catch(()=>{});
  }catch(_){}
}
function exitGameFullscreen(){
  try{
    if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();
  }catch(_){}
  try{
    if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  }catch(_){}
}

/* World-space helpers — pure functions of the FROZEN virtual size. */
function worldCore(){return{x:VW*0.5,y:VH*0.52};}
function coreRadius(){return Math.min(VW,VH)*0.10;}
/* The playable circle must fit ENTIRELY inside the world rectangle (the core
   sits slightly below center, so the bottom edge is the tight one) — otherwise
   players get clamped into letterbox dead space where nothing can reach them. */
function arenaRadius(){
  return Math.min(VW*0.5,VH*0.52,VH*0.48)*0.92;
}
/* Spawn just OUTSIDE the visible world edge (never deep in off-screen space):
   march a ray from the core until it exits the inflated rect. Enemies walk
   into view within moments instead of lurking unseen beyond it. */
function randomSpawnPoint(){
  const c=worldCore();
  const a=rand(0,Math.PI*2);
  const dx=Math.cos(a),dy=Math.sin(a);
  const pad=44;
  const tx=dx>0?(VW-c.x+pad)/dx:(dx<0?(pad-c.x)/dx:Infinity);
  const ty=dy>0?(VH-c.y+pad)/dy:(dy<0?(pad-c.y)/dy:Infinity);
  const r=Math.min(tx,ty);
  return{x:c.x+dx*r,y:c.y+dy*r,angle:a};
}

/* ---------------------------------------------------------------- app */
const App={
  screen:'splash',
  mode:null,                 // 'solo' | 'mp'
  playerName:localStorage.getItem('ir_name')||'',
  myPid:null,
  isHost:false,              // true for solo AND mp-host
  inRun:false,
  paused:false,              // local pause overlay (solo freezes sim)
  // networking
  ws:null,connected:false,
  leaving:false,             // true once the user intentionally exits mp
  rejoinPending:null,        // rejoin handshake queued for the next 'welcome'
  reconnectAttempts:0,reconnectTimer:null,
  lobbyCode:null,lobbySlots:[],lobbyPhase:'lobby',
  // run identity
  roster:[],hostPid:null,
  hintsEnabled:localStorage.getItem('ir_hints')!=='off',
};
function netSend(obj){if(App.ws&&App.ws.readyState===1)App.ws.send(JSON.stringify(obj));}
function toast(msg,isError){
  const t=document.createElement('div');
  t.className='toast'+(isError?' error':'');
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2800);
}
/* Clipboard that tells the truth: navigator.clipboard only exists in secure
   contexts (https / localhost) — on a LAN http URL it's absent, so fall back
   to a hidden textarea and report actual success. */
function copyText(text){
  try{
    if(navigator.clipboard&&window.isSecureContext){
      navigator.clipboard.writeText(text).catch(()=>{});
      return true;
    }
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);
    ta.focus();ta.select();
    let ok=false;
    try{ok=document.execCommand('copy');}catch(_){}
    ta.remove();
    return ok;
  }catch(_){return false;}
}
