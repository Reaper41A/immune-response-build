/* ============================================================================
   IMMUNE RESPONSE — settings: resolution/graphics options, quality presets,
   spec-based recommendation, and aim assist strength.
   Everything here is player-tweakable independent of everything else — a
   preset (Low/Medium/High/Ultra) is just a bundle of starting values for the
   options below, not a locked mode. Picking a preset writes its values into
   Settings then the player can still flip any individual option afterward,
   at which point the preset indicator switches to "Custom".

   Crispness vs blur, on purpose: `dprCap` is the actual sharpness lever —
   it's how many real device pixels the canvas backing store gets per CSS
   pixel, capped at each tier below. Low deliberately caps it at 1 (soft,
   slightly blurred upscale on any high-DPR phone/monitor) while Ultra allows
   the device's full native DPR (crisp, no upscale blur at all). `resScale`
   is a SEPARATE multiplier on top of that for raw framebuffer size, so a
   struggling device can drop resScale for speed without Low's blur being
   forced on it, or vice versa. The only *intentional* blur in the game is
   the existing projectile trail streak (drawProjectiles/drawTrails, motion
   directionality for tracking a shot) and the glow sprites used for muzzle
   flashes/hit sparks/motes — those stay at every tier because they're a
   deliberate motion/impact cue, not a resolution artifact.

   `controlScheme`/`tracer`/`tracerStyle` are player preference, not graphics
   quality, so — like `aimAssist` — none of the four presets below touch
   them; switching Low/Medium/High/Ultra never silently changes how you
   control the game.
   ========================================================================== */
'use strict';

const SETTINGS_KEY='ir_settings_v1';

/* Individual toggle/slider options a player can set directly. `resScale`
   feeds the existing RES backing-store scale (core.js/main.js PERF loop);
   `dprCap` feeds a new cap on devicePixelRatio (core.js resize()) — together
   they're the two axes of "how sharp/how big is the canvas actually drawn".
   Setting either manually disables the automatic PERF resolution stepping so
   a manual choice sticks. Every other flag gates a draw call or FX spawn
   already present in render.js/fx.js/hud.js — see call sites tagged
   "settings gate". */
const DEFAULT_SETTINGS={
  preset:'high',          // 'low'|'medium'|'high'|'ultra'|'custom' — label only, doesn't itself do anything

  // ---- resolution / sharpness ----
  resScale:1,             // 0.6–1: backing-store render scale (framebuffer size)
  dprCap:2,                // 1–3: device-pixel cap — THE crispness lever (1 = soft, 3 = native-sharp on high-DPR screens)
  autoRes:false,           // true = let the PERF controller adapt resScale live (Low/Medium default)
  frameCap:60,             // 30|60|120: render loop's own fps ceiling (main.js loop)

  // ---- particles / FX ----
  particles:true,          // hit sparks, death bursts, muzzle flashes, motes
  particleDensity:1,       // 0.35–1.4 multiplier on how many particles/burst
  destructionParticles:true,// extra jagged debris/gib fragments layered on top of a kill's death burst
  glowQuality:'full',      // 'off'|'reduced'|'full' — glow-sprite bloom on projectiles/hits/core pulse
  screenShake:true,        // hit/leak camera shake
  hitFlash:true,           // full-screen red/green damage & heal flash vignette

  // ---- world / background ----
  backgroundFx:true,       // ambient glow drift + drifting organism silhouettes
  veins:true,              // pulsing capillary network under the arena
  trailLength:'long',      // 'short'|'long' — projectile motion-trail length (the one deliberate blur/streak)

  // ---- UI / readability ----
  damageText:true,         // floating damage/heal/EP number popups
  calloutFeed:true,        // squad text callouts ("X was overwhelmed!", buy/perk confirmations)
  rangeRing:true,          // dashed range indicator ring under your own cell

  // ---- controls ----
  controlScheme:'floating', // 'floating'|'fixed' — see input.js: floating = original touch-anywhere sticks, fixed = sticks locked to a set base position with a permanently-cleared ability button
  tracer:true,              // show an aim-direction guide line from your cell out to weapon range
  tracerStyle:'laser',      // 'solid'|'dotted'|'segmented'|'laser'|'pulse' — see render.js drawAimTracer

  // ---- aim assist ----
  aimAssist:true,          // magnetism toward nearby enemies while manually aiming
  aimAssistStrength:0.5,   // 0–1: how strongly aim bends toward a target
};

/* Every value below is chosen so the tiers are actually visibly different,
   not just flags flipped for their own sake:
   - LOW: smallest framebuffer + DPR cap 1 (soft/blurry on purpose — this is
     the tier that trades looks for frame time), thin particle budget, no
     background ambience/veins, no destruction debris, glow off, 30fps cap.
   - MEDIUM: sharper (DPR cap 1.5, resScale up), particles restored to a
     comfortable middle, veins back on, reduced glow, still no ambient drift
     or destruction debris (those are the priciest fill-rate items), 60fps.
   - HIGH: full native-ish resolution (DPR cap 2, resScale 1), full particle
     density, ambient drift + veins + destruction debris + full glow on,
     60fps. This is "the game looks like it's supposed to".
   - ULTRA: everything High has, plus native DPR uncapped (3, covers modern
     high-refresh phones/monitors), boosted particle density above baseline,
     long trails, uncapped 120fps render loop for high-refresh displays. */
const QUALITY_PRESETS={
  low:{
    resScale:0.6, dprCap:1,   autoRes:true,  frameCap:30,
    particles:true, particleDensity:0.35, destructionParticles:false, glowQuality:'off',
    screenShake:false, hitFlash:true,
    backgroundFx:false, veins:false, trailLength:'short',
    damageText:true, calloutFeed:true, rangeRing:true,
  },
  medium:{
    resScale:0.8, dprCap:1.5, autoRes:true,  frameCap:60,
    particles:true, particleDensity:0.7,  destructionParticles:false, glowQuality:'reduced',
    screenShake:true,  hitFlash:true,
    backgroundFx:false, veins:true,  trailLength:'short',
    damageText:true, calloutFeed:true, rangeRing:true,
  },
  high:{
    resScale:1,   dprCap:2,   autoRes:false, frameCap:60,
    particles:true, particleDensity:1,    destructionParticles:true,  glowQuality:'full',
    screenShake:true,  hitFlash:true,
    backgroundFx:true,  veins:true,  trailLength:'long',
    damageText:true, calloutFeed:true, rangeRing:true,
  },
  ultra:{
    resScale:1,   dprCap:3,   autoRes:false, frameCap:120,
    particles:true, particleDensity:1.4,  destructionParticles:true,  glowQuality:'full',
    screenShake:true,  hitFlash:true,
    backgroundFx:true,  veins:true,  trailLength:'long',
    damageText:true, calloutFeed:true, rangeRing:true,
  },
};

function loadSettings(){
  let s={...DEFAULT_SETTINGS};
  try{
    const raw=localStorage.getItem(SETTINGS_KEY);
    if(raw)s={...s,...JSON.parse(raw)};
  }catch(_){}
  return s;
}
const Settings=loadSettings();

function saveSettings(){
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(Settings));}catch(_){}
}

/* Applies a named preset's values into Settings (does not touch `preset`
   itself — caller sets that). Individual values can still be edited after. */
function applyPreset(name){
  const p=QUALITY_PRESETS[name];
  if(!p)return;
  Object.assign(Settings,p);
  Settings.preset=name;
  onSettingsChanged();
}
function setSetting(key,value,skipRender){
  Settings[key]=value;
  if(key!=='preset')Settings.preset='custom'; // any manual tweak breaks away from the named preset
  onSettingsChanged(skipRender);
}
/* Called after any change — pushes resolution/DPR/frame-cap changes live and
   persists. Cosmetic flags (particles/veins/etc.) are read directly at draw
   time by render.js/fx.js, so no extra push is needed for those.
   `skipRender` lets a slider's own input handler update Settings + persist
   without rebuilding the whole settings screen on every tick (which would
   destroy/recreate the <input> mid-drag and jump the thumb under the
   player's finger/cursor) — the slider updates its own label directly and
   only triggers a full re-render on release (see wireSettingsControls). */
function onSettingsChanged(skipRender){
  saveSettings();
  if(!Settings.autoRes)setRes(Settings.resScale);
  resize(); // re-applies dprCap immediately (core.js reads Settings.dprCap)
  applyControlScheme();
  if(!skipRender&&typeof renderSettingsScreen==='function'&&App.screen==='settings')renderSettingsScreen();
}

/* -------------------------------------------------------- spec estimate
   Best-effort, heuristic-only "what would probably run well" guess from
   cheap, synchronous, widely-supported signals — never claims certainty.
   Screen used here is deliberately physical-pixel based via devicePixelRatio
   so a small high-DPR phone doesn't get over-rated off logical CSS pixels. */
function estimateDeviceTier(){
  const cores=navigator.hardwareConcurrency||4;
  const mem=navigator.deviceMemory||4; // Chrome-only; undefined elsewhere, defaults to "unknown-ish middle"
  const dpr=window.devicePixelRatio||1;
  const shortSide=Math.min(screen.width||900,screen.height||900)*dpr;
  const isCoarsePointer=matchMedia('(pointer:coarse)').matches; // touch-primary device
  let score=0;
  score+=cores>=8?3:cores>=6?2:cores>=4?1:0;
  score+=mem>=8?3:mem>=4?2:mem>=2?1:0;
  score+=shortSide>=1000?2:shortSide>=700?1:0;
  if(isCoarsePointer)score-=1; // phones/tablets thermal-throttle sooner than the same silicon in a laptop
  if(score>=7)return'ultra';
  if(score>=5)return'high';
  if(score>=3)return'medium';
  return'low';
}
function recommendedPresetLabel(){
  return{low:'Low',medium:'Medium',high:'High',ultra:'Ultra'}[estimateDeviceTier()];
}

/* Toggles the CSS hook the Fixed control scheme's layout hangs off (see
   index.html #gameWrap.fixed-scheme rules) and resets any touch currently
   in progress on either stick — switching schemes mid-drag would otherwise
   leave a stuck touchId pointing at a base that just moved out from under
   it, reading as a phantom held direction until the finger lifts. */
function applyControlScheme(){
  const wrap=typeof $==='function'?$('gameWrap'):null;
  if(!wrap)return;
  wrap.classList.toggle('fixed-scheme',Settings.controlScheme==='fixed');
  if(typeof resetStickTouches==='function')resetStickTouches();
}
