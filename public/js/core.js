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
const ctx=canvas.getContext('2d');
let W=0,H=0,DPR=1;
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
  canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);
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
  VH=900;VW=Math.round(clamp(VH*ar,700,1760));
  fitWorld();
}
window.addEventListener('resize',resize);
window.addEventListener('orientationchange',()=>setTimeout(resize,80));

/* World-space helpers — pure functions of the FROZEN virtual size. */
function worldCore(){return{x:VW*0.5,y:VH*0.52};}
function coreRadius(){return Math.min(VW,VH)*0.10;}
function arenaRadius(){return Math.min(VW,VH)*0.62;}
function randomSpawnPoint(){
  const c=worldCore();
  const a=rand(0,Math.PI*2);
  const r=Math.max(VW,VH)*0.72;
  return{x:c.x+Math.cos(a)*r,y:c.y+Math.sin(a)*r,angle:a};
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
