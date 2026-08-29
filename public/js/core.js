/* ============================================================================
   IMMUNE RESPONSE — core: utilities, canvas, app/session state
   ========================================================================== */
'use strict';

const GAME_VERSION='1.2.0'; // see js/changelog.js (drives in-game CHANGELOG tab)

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

/* ---------------------------------------------------------- pseudo-3D shading
   Every enemy/player shape is a flat canvas fill, which reads flat and a bit
   cheap. This gives any already-filled path a light "glossy sphere" pass —
   a soft highlight toward the light source, a darker rim toward the shadow
   side, and a crisp specular fleck — using ONLY the path already on `ctx`
   (caller must fill the path with the base color, then call this while the
   SAME path is still current, then stroke/restore as before). Cheap: two
   radial gradients + one clip, no per-shape sprite caching needed since
   these are small (~20-50px) paths drawn a few dozen times a frame.
   `r` = the shape's approximate radius, used to scale offsets/sizes. */
function shade3D(ctxr,r,opts){
  const o=opts||{};
  const lx=o.lx!=null?o.lx:-r*0.32, ly=o.ly!=null?o.ly:-r*0.38; // light upper-left
  ctxr.save();
  ctxr.clip();
  // ambient occlusion — darker crescent toward lower-right (away from light)
  const shG=ctxr.createRadialGradient(r*0.4,r*0.46,r*0.15,r*0.4,r*0.46,r*1.5);
  shG.addColorStop(0,'rgba(0,0,0,0.32)');
  shG.addColorStop(0.7,'rgba(0,0,0,0.1)');
  shG.addColorStop(1,'rgba(0,0,0,0)');
  ctxr.fillStyle=shG;
  ctxr.fillRect(-r*2,-r*2,r*4,r*4);
  // core highlight — soft bright patch toward the light
  const hiG=ctxr.createRadialGradient(lx,ly,0,lx,ly,r*1.3);
  hiG.addColorStop(0,'rgba(255,255,255,'+(o.hiAlpha!=null?o.hiAlpha:0.55)+')');
  hiG.addColorStop(0.35,'rgba(255,255,255,'+(o.hiAlpha!=null?o.hiAlpha*0.35:0.18)+')');
  hiG.addColorStop(1,'rgba(255,255,255,0)');
  ctxr.fillStyle=hiG;
  ctxr.fillRect(-r*2,-r*2,r*4,r*4);
  // tight specular fleck — the "wet highlight" that sells glossy/3D
  if(o.specular!==false){
    ctxr.beginPath();
    ctxr.arc(lx*1.15,ly*1.15,Math.max(1.2,r*0.16),0,Math.PI*2);
    ctxr.fillStyle='rgba(255,255,255,0.65)';
    ctxr.fill();
  }
  ctxr.restore();
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
  // Phone-class detection uses the SHORT side of the device, not the short
  // side of the current orientation — a phone rotated to landscape still
  // has a small physical screen, but its *height* in that orientation
  // (~360-420px) used to trip the old `min(W,H)<520` test and, combined
  // with a tall fixed VH, shrank every on-screen entity to a fraction of
  // its intended size. screen.width/height are orientation-stable so this
  // reads the same phone in portrait or landscape.
  const shortSide=Math.min(screen.width||W,screen.height||H);
  COMPACT=shortSide<560;
  if(!resize.init){resize.init=true;RES=1;} // start at full resolution; PERF backs off only if frame time actually demands it
  canvas.width=Math.max(1,Math.round(W*DPR*RES));
  canvas.height=Math.max(1,Math.round(H*DPR*RES));
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  // Orientation is no longer locked, so a player can flip their phone mid-
  // run. The arena's frozen VW/VH stays put for small viewport wobble (URL
  // bar, keyboard) but a genuine portrait<->landscape flip re-freezes it to
  // the new shape — otherwise "cover" fitting the old shape into the new,
  // very different one forced a heavy crop that read as "the view is too
  // large / zoomed in".
  const wasLandscape=resize.lastLandscape;
  const isLandscape=W>=H;
  resize.lastLandscape=isLandscape;
  if(VW&&wasLandscape!==undefined&&wasLandscape!==isLandscape)initWorld();
  else fitWorld();
}
function fitWorld(){
  // Always "cover" (fill the screen edge-to-edge, cropping world edges if
  // needed) rather than "contain" (letterbox, black bars). A letterboxed
  // fit was the direct cause of the "too small with a black edge" look on
  // mobile landscape — any drift between the live viewport ratio and the
  // ratio VW/VH was frozen at (URL bar show/hide, orientation-lock failing
  // on iOS, notches) snapped the fit down to a small boxed rectangle
  // surrounded by bars. Cropping a sliver of arena is far less noticeable
  // than shrinking to a box — but crop is bounded below so a bad mismatch
  // can't zoom in so far it feels like a magnifying glass instead of a
  // slightly tighter frame.
  const coverScale=Math.max(W/VW,H/VH);
  const containScale=Math.min(W/VW,H/VH);
  // Never crop more than ~18% beyond what a plain contain fit would show.
  vScale=Math.min(coverScale,containScale*1.18);
  vOffX=(W-VW*vScale)/2;vOffY=(H-VH*vScale)/2;
  bgCache=null;
}
function initWorld(){
  const ar=clamp(W/Math.max(1,H),0.62,2.6);
  // Phone landscape is the common phone play orientation — give it its own,
  // shorter VH so the projection scale stays close to the portrait-phone
  // scale instead of stretching a tall 700-900 world across a ~380px-tall
  // viewport. This is what made players/enemies/HUD read as "too small" in
  // landscape. Portrait phones keep the taller default world.
  const landscapePhone=COMPACT&&W>H;
  VH=landscapePhone?460:(COMPACT?700:900);
  VW=Math.round(clamp(VH*ar,COMPACT?500:700,1900));
  fitWorld();
}
window.addEventListener('resize',resize);
window.addEventListener('orientationchange',()=>setTimeout(resize,80));
// visualViewport fires when the URL bar shows/hides or on-screen keyboard
// opens — 'resize' alone can miss these on some mobile browsers, leaving
// stale W/H (and therefore stale letterboxing) until the next full resize.
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',resize);
  window.visualViewport.addEventListener('scroll',resize);
}

/* ------------------------------------------------------- fullscreen
   Must be called synchronously from inside a user-gesture click handler —
   browsers reject fullscreen requests made any other way (e.g. after an
   awaited network round-trip). Best-effort: fullscreen can be denied by the
   user or blocked in an embedded webview, and every failure here is caught
   and swallowed so a run always starts even if it doesn't take effect.
   NOTE: this deliberately does NOT lock screen orientation. The game used
   to force landscape on every run start, which fought players who genuinely
   wanted to play in portrait — orientation is now left entirely up to
   however the player is physically holding their phone, and the layout
   (resize/fitWorld below) adapts live to whichever way that is.

   Portrait fullscreen quirk: on stock Android Chrome, requestFullscreen()
   is granted in portrait exactly the same as in landscape (there's no API-
   level restriction), but on many devices the OS keeps a thin status-bar
   strip reserved in portrait for cutout/notch handling and only reclaims
   that space in landscape — so fullscreen can be "on" per the API while
   still showing a sliver of system UI at the top in portrait. Re-issuing
   the request is a documented, supported way to nudge this (Chrome
   explicitly allows requestFullscreen calls tied to orientation changes,
   not just the original click), so it's retried on every orientation flip
   while a run is active below. */
function requestGameFullscreen(){
  const el=document.documentElement;
  const req=el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen;
  if(!req){toast('Fullscreen isn\u2019t available in this browser',true);return;}
  try{
    const p=req.call(el);
    if(p&&p.catch)p.catch(err=>toast('Fullscreen blocked: '+(err&&err.message?err.message:'browser denied it'),true));
  }catch(err){toast('Fullscreen blocked: '+(err&&err.message?err.message:'browser denied it'),true);}
}
window.addEventListener('orientationchange',()=>{
  // Re-request fullscreen shortly after a rotation while in a run — this is
  // what actually reclaims the reserved status-bar strip some Android/Chrome
  // builds leave in place in portrait. No-ops harmlessly if not in a run or
  // already fullscreen.
  setTimeout(()=>{
    if(typeof App!=='undefined'&&App.inRun&&!isGameFullscreen())requestGameFullscreen();
  },150);
});
function exitGameFullscreen(){
  try{
    if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  }catch(_){}
}
function isGameFullscreen(){
  return !!(document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement);
}
/* Browsers silently drop fullscreen on their own (backgrounding, a system
   dialog, some Android chrome gestures) and there's no way to re-request it
   without a fresh user gesture — so instead of trying to force it back
   automatically, surface a small always-available button the moment we're
   in a run but NOT fullscreen. Tapping it is a genuine user gesture, so the
   request succeeds. On browsers with no Fullscreen API at all (iOS Safari
   without "Add to Home Screen"), the button hides itself instead of
   pretending to do something impossible. */
function fullscreenApiAvailable(){
  const el=document.documentElement;
  return !!(el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen);
}
function updateFullscreenBtn(){
  const btn=$('fullscreenBtn');
  if(!btn)return;
  if(!fullscreenApiAvailable()){btn.classList.add('hidden');return;}
  const inRunNow=App.screen==='playing'||App.screen==='pause'||App.screen==='draft';
  if(!inRunNow){btn.classList.add('hidden');return;}
  btn.classList.remove('hidden');
  const fs=isGameFullscreen();
  btn.textContent=fs?'⛶':'⛶';
  btn.classList.toggle('suggest',!fs);
  btn.setAttribute('data-tip',fs?'Exit fullscreen':'Hide browser bar / go fullscreen');
}
['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
  .forEach(ev=>document.addEventListener(ev,()=>updateFullscreenBtn()));

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
