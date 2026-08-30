/* ============================================================================
   IMMUNE RESPONSE — changelog data
   ----------------------------------------------------------------------------
   ⚠️ DEV NOTE (including AI devs): Any balance, feature, or content change
   made in ANY session MUST be logged here before that session ends. Add a
   new object to CHANGELOG (top of the array = newest) or append to the
   current unreleased entry if one already exists for this version. This is
   what powers the in-game CHANGELOG tab and "Nerfs & Buffs" history —
   players rely on it to know what changed and why. Do not skip this step,
   even for "small" tuning passes. See the shape below for the expected
   format.
   ----------------------------------------------------------------------------
   Each entry:
   {
     version: "1.1.0",       // matches GAME_VERSION in core.js when shipped
     date: "2026-08-29",     // ISO date
     title: "Short player-facing title",
     sections: {
       added:   ["..."],   // new content/features — plain strings
       changed: ["..."],   // behavior/systems changes that aren't strictly a nerf/buff — plain strings
       nerfs:   [NerfBuffEntry, ...],   // anything that makes a class/enemy/weapon weaker
       buffs:   [NerfBuffEntry, ...],   // anything that makes a class/enemy/weapon stronger
       fixed:   ["..."],   // bug fixes — plain strings
     }
   }
   Any section can be omitted or left as an empty array — the renderer
   (changelog.js UI code + ui.js wiring) skips empty sections automatically.
   Keep entries written for players, not for other devs: plain language,
   short lines, no internal file/function names (the one exception is the
   `entity`/`weapon` keys below, which are internal keys used to look up
   display names/icons — they are never shown to the player as raw text).
   ----------------------------------------------------------------------------
   NerfBuffEntry shape (structured stat-comparison format, added in 1.4.2):
   {
     entityType: 'class' | 'enemy',     // which table `entity` is looked up in
     entity: 'tcell',                   // key into CLASSES or ENEMY_DEFS
     weapon: 'enzymeBeam',              // OPTIONAL — key into WEAPONS, only when
                                         // a weapon stat changed. Triggers an
                                         // auto-computed before/after DPS line.
     changes: [
       { stat:'hp', label:'HP', before:120, after:90 },
       { stat:'dmg', label:'Damage', before:14, after:50 },
       // `stat` is free-form (hp, speed, range, dmg, rate, pierce, spread,
       // critChance, cooldown, duration, etc.) — only 'dmg' and 'rate' on a
       // change with a `weapon` key trigger the DPS calc. `label` is the
       // player-facing stat name. `before`/`after` must be numbers actually
       // stated in the source patch notes — never invent or estimate one.
     ],
     note: 'optional short flavor/context sentence, plain language'
   }
   DPS for a `weapon` change is computed live by computeWeaponDps() from the
   actual WEAPONS entry (see combat.js for the real fire-resolution logic —
   pellet count, crit multiplier, pierce, etc. — before assuming a plain
   dmg/rate formula is correct for a given weapon). Do not hand-compute and
   hardcode a DPS number into the data; supply before/after stat values and
   let the renderer derive it, so the figure can never drift out of sync
   with the live WEAPONS table.
   ========================================================================== */
'use strict';

const CHANGELOG=[
  {
    version:'1.4.3',
    date:'2026-08-30',
    title:'Control & Settings Fixes',
    sections:{
      added:[],
      changed:[
        'Fixed control scheme: both sticks and the ability button now sit at the same on-screen height as the default Floating scheme\u2019s buttons, in portrait and landscape, instead of sitting noticeably lower and harder to reach one-handed.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[
        'The aim tracer line now actually appears while you\u2019re aiming (not just while firing) \u2014 a leftover condition meant it could only ever show up alongside a shot, making it effectively invisible for anyone who aims before pulling the trigger.',
        'Background ambience (drifting glow motes and the large organism silhouettes passing overhead) now actually shows up on phones when a graphics setting or preset \u2014 High or Ultra \u2014 has it turned on. It was previously being silently skipped on any phone-class screen regardless of your setting, so picking Ultra there never actually gave you the promised ambience.'
      ]
    }
  },
  {
    version:'1.4.2',
    date:'2026-08-30',
    title:'Structured Nerfs & Buffs',
    sections:{
      added:[
        'The Nerfs & Buffs tab now shows real stat comparisons instead of plain sentences: each entry names the class/enemy/weapon involved and lists the exact stat(s) that changed, before → after.',
        'Where damage or fire rate changed, the tab now also shows a computed single-target DPS comparison (before vs after), worked out from each weapon\u2019s actual fire pattern \u2014 pellet count, crit chance, and so on \u2014 not just a flat damage-over-cooldown guess.'
      ],
      changed:[
        'Retrofitted every existing nerf/buff entry (v1.1.0 and v1.2.0) into the new structured format so the whole history is consistent.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  },
  {
    version:'1.4.1',
    date:'2026-08-30',
    title:'Nerfs & Buffs, Grouped by Version',
    sections:{
      added:[],
      changed:[
        'The Nerfs & Buffs tab now groups every change by the version it shipped in, newest first, instead of dumping every nerf ever made into one list and every buff into another — it was easy to lose track of which patch did what.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  },
  {
    version:'1.4.0',
    date:'2026-08-30',
    title:'Fixed Controls & Aim Tracer',
    sections:{
      added:[
        'New touch control scheme option (Settings \u2192 Controls): "Fixed" gives both sticks a permanent base position instead of appearing wherever you first touch, and locks the ability button directly above the aim stick with a guaranteed gap — it can no longer end up covered by the fire/aim stick. Works in both portrait and landscape. "Floating" (the original behavior) is still there and stays the default.',
        'Aim tracer: an optional guide line from your cell out to your weapon\u2019s exact range, along wherever you\u2019re currently aiming.',
        'Five tracer styles to choose from — Laser, Solid, Dotted, Segmented, and Pulse — each with its own look, selectable in Settings \u2192 Controls.'
      ],
      changed:[],
      nerfs:[],
      buffs:[],
      fixed:[
        'On touch devices, the ability button could end up directly underneath the aim stick depending on where a drag started, making it hard or impossible to tap. Switching to the new Fixed control scheme resolves this — the ability button\u2019s position no longer depends on where you touch.'
      ]
    }
  },
  {
    version:'1.3.0',
    date:'2026-08-30',
    title:'Aim Assist & Settings',
    sections:{
      added:[
        'New Settings screen, reachable from the main menu and the pause menu — tune graphics and controls without leaving a run.',
        'Aim assist: while manually aiming, your shot gently bends toward a nearby enemy in front of your cursor/stick instead of demanding a pixel-perfect line. It never fires or picks targets on its own, and can be tuned or switched off entirely. In multiplayer, this is each player\u2019s own choice — a squadmate turning it off (or up) doesn\u2019t affect anyone else.',
        'Four graphics presets — Low, Medium, High, Ultra — each a genuinely different look, not just a label: Low softens and shrinks the image to save GPU time, Ultra draws at full native sharpness with a boosted particle budget and a 120fps cap for high-refresh screens.',
        'A "Recommended for this device" suggestion on the Settings screen, estimated from your device\u2019s CPU, memory, and screen.',
        'Every setting inside a preset can be overridden individually — render scale, sharpness, frame rate cap, particle density, glow/bloom quality, projectile trail length, destruction debris, screen shake, damage/heal screen flash, background ambience, capillary veins, damage text, callout feed, and the range ring.',
        'Destruction debris: jagged spinning fragments now fly out of a kill alongside the usual spark burst, for a more satisfying "that thing broke apart" read on High and Ultra.'
      ],
      changed:[
        'The How to Play screen and the FIRE tutorial hint now describe manual aiming (mouse/aim-stick) instead of the old auto-lock wording, matching how aiming has actually worked for a while.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  },
  {
    version:'1.2',
    date:'2026-08-29',
    title:'Meet the Changelog',
    sections:{
      added:[
        'New Changelog tab, reachable from the main menu — see exactly what changed, version by version.',
        'New "Nerfs & Buffs" view that pulls every balance change from every version into one running history, so you can look up how any class or enemy has been tuned over time instead of hunting through old patch notes.',
        'A small notification dot appears on the Changelog button whenever there\u2019s a new update you haven\u2019t looked at yet.'
      ],
      changed:[],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  },
  {
    version:'1.2.0',
    date:'2026-08-29',
    title:'Draft System Expansion',
    sections:{
      added:[
        'Every draft card (squad upgrades, personal perks, class evolutions) now has a rarity — Common, Elite, Epic, or Legendary — so pulling something rare actually feels rare.',
        'Squad upgrade pool grew from 9 to 22 cards. Personal perks grew from 12 to 29, including four full class-specific trees that each run common all the way up to legendary. Ability evolutions grew from 3 to 7 per class ability.',
        'Legendary cards now do things no lower rarity can: chain lightning, execute effects, guaranteed critical hits with full pierce, double ability charges, revives, and heavy sentries — not just bigger numbers on the same effect.',
        'Draft cards now show their rarity as a colored, glowing border, with Legendary pulls getting a shimmer animation.'
      ],
      changed:[
        'Personal perks and ability evolutions now track what you\u2019ve already picked, so a run can never offer you an exact duplicate that wasn\u2019t meant to stack.',
        'Cards that hit their stack cap or become irrelevant (full HP, no damaged organ, a maxed-out turret) now drop out of the draft pool automatically instead of wasting a pick.',
        'B-Cell re-spec\u2019d toward a pure healer: shorter range and slower Antibody Blaster, but Heal Burst hits much harder and comes back much faster.'
      ],
      nerfs:[
        'Damage, fire rate, economy, and move-speed upgrades now cap at 4\u20136 stacks with diminishing returns per stack, instead of scaling forever \u2014 this was the main fix for squads outgrowing what enemies could keep up with on long runs.',
        {entityType:'class',entity:'macrophage',
          changes:[{stat:'speed',label:'Move Speed',before:118,after:90}]},
        {entityType:'class',entity:'macrophage',weapon:'phagoShotgun',
          changes:[
            {stat:'dmg',label:'Damage per Pellet',before:8,after:6},
            {stat:'rate',label:'Fire Rate',before:0.55,after:0.60,unit:'s between shots',lowerIsBetter:true}
          ]},
        {entityType:'class',entity:'macrophage',
          changes:[{stat:'cooldown',label:'Taunt Cooldown',before:14,after:15,unit:'s',lowerIsBetter:true}]},
        {entityType:'class',entity:'tcell',
          changes:[{stat:'hp',label:'HP',before:120,after:90}]},
        {entityType:'class',entity:'tcell',
          changes:[{stat:'speed',label:'Move Speed',before:150,after:70}],
          note:'Now the slowest class in the game.'},
        {entityType:'class',entity:'tcell',weapon:'enzymeBeam',
          changes:[
            {stat:'dmg',label:'Damage',before:14,after:50},
            {stat:'rate',label:'Fire Rate',before:0.18,after:1.0,unit:'s between shots',lowerIsBetter:true}
          ],
          note:'Reworked from a rapid-fire weapon into a slow, hard-hitting burst weapon.'},
        {entityType:'class',entity:'tcell',
          changes:[{stat:'cooldown',label:'Overdrive Cooldown',before:16,after:20,unit:'s',lowerIsBetter:true}]},
        {entityType:'class',entity:'bcell',
          changes:[{stat:'range',label:'Range',before:300,after:260}]},
        {entityType:'class',entity:'bcell',weapon:'antibodyBlaster',
          changes:[{stat:'rate',label:'Fire Rate',before:0.14,after:0.20,unit:'s between shots',lowerIsBetter:true}]},
        {entityType:'class',entity:'nk',
          changes:[{stat:'range',label:'Range',before:380,after:290}],
          note:'The largest range cut of any class this patch.'},
        // Dual SMG's damage nerf and crit-chance buff shipped in the same
        // patch and both affect DPS — kept as ONE entry with both stats so
        // the before/after DPS reflects the real net change (6dmg/22%crit
        // -> 4dmg/32%crit), instead of two entries that would each hold the
        // other stat at its post-patch value and show a misleading "before".
        // Filed under nerfs since the headline change here is the damage cut;
        // the crit-chance side of this same entry is mirrored under buffs.
        {entityType:'class',entity:'nk',weapon:'dualSmg',
          changes:[
            {stat:'dmg',label:'Damage',before:6,after:4},
            {stat:'critChance',label:'Crit Chance',before:0.22,after:0.32,pct:true}
          ],
          note:'Crit chance was buffed in the same patch (see Buffs) \u2014 DPS below reflects both changes together.'},
        {entityType:'class',entity:'nk',
          changes:[{stat:'cooldown',label:'Dash Cooldown',before:8,after:10,unit:'s',lowerIsBetter:true}]}
      ],
      buffs:[
        {entityType:'class',entity:'macrophage',
          changes:[{stat:'hp',label:'HP',before:180,after:250}]},
        {entityType:'class',entity:'macrophage',weapon:'phagoShotgun',
          changes:[],
          note:'Pellet spread tightened, making its pellets group up more.'},
        {entityType:'class',entity:'macrophage',
          changes:[{stat:'duration',label:'Taunt Duration',before:2.5,after:3,unit:'s'}]},
        {entityType:'class',entity:'tcell',
          changes:[{stat:'range',label:'Range',before:320,after:350}]},
        {entityType:'class',entity:'bcell',
          changes:[
            {stat:'healAllies',label:'Heal Burst \u2014 Ally Heal',before:60,after:80},
            {stat:'healSelf',label:'Heal Burst \u2014 Caster Heal',before:40,after:60}
          ]},
        {entityType:'class',entity:'bcell',
          changes:[{stat:'cooldown',label:'Heal Burst Cooldown',before:20,after:10,unit:'s',lowerIsBetter:true}],
          note:'Roughly triples B-Cell\u2019s sustained healing output.'},
        // Same combined entry as under Nerfs — see note there. Shown here
        // too since the crit-chance change on its own is a buff, but the
        // DPS figure is only meaningful as the net of both stats together.
        {entityType:'class',entity:'nk',weapon:'dualSmg',
          changes:[
            {stat:'dmg',label:'Damage',before:6,after:4},
            {stat:'critChance',label:'Crit Chance',before:0.22,after:0.32,pct:true}
          ],
          note:'Damage was nerfed in the same patch (see Nerfs) \u2014 DPS below reflects both changes together.'},
        {entityType:'class',entity:'nk',
          changes:[{stat:'mult',label:'Piercing Strike Multiplier (Dash-through damage perk)',before:2,after:2.6,unit:'\u00d7'}]}
      ],
      fixed:[]
    }
  },
  {
    version:'1.1.9',
    date:'2026-08-28',
    title:'Squad Reconnect Fixes',
    sections:{
      added:[],
      changed:[
        'When your tab comes back to the foreground, the game now actively checks whether you\u2019re really still connected instead of just waiting for a disconnect signal that might never arrive \u2014 and reconnects you automatically if it finds you\u2019re not.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[
        'Fixed a bug where being disconnected while waiting in the squad lobby (as opposed to mid-run) wasn\u2019t being detected, so you could get stuck thinking you were still in a squad.',
        'Cleaned up a duplicate rejoin path that could try to reuse a dead connection instead of opening a fresh one.'
      ]
    }
  },
  {
    version:'1.1.8',
    date:'2026-08-28',
    title:'Living Arena',
    sections:{
      added:[
        'The Body\u2019s capillary network is now drawn live and pulses in time with its heartbeat, instead of being a static painted background \u2014 the whole arena reads as living tissue.'
      ],
      changed:[],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  },
  {
    version:'1.1.7',
    date:'2026-08-28',
    title:'Glossier Bestiary',
    sections:{
      added:[
        'Enemy icons in the Bestiary now have a glossy, lit-sphere look (highlight, shading, and a specular fleck) matching how they actually appear in-run, instead of flat color shapes.'
      ],
      changed:[],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  },
  {
    version:'1.1.6',
    date:'2026-08-28',
    title:'Bestiary Touch-Up',
    sections:{
      added:[],
      changed:[],
      nerfs:[],
      buffs:[],
      fixed:[
        'Small follow-up fix to the Bestiary display in How to Play.'
      ]
    }
  },
  {
    version:'1.1.5',
    date:'2026-08-28',
    title:'Bestiary Fixes',
    sections:{
      added:[],
      changed:[],
      nerfs:[],
      buffs:[],
      fixed:[
        'Fixed layout issues with the Bestiary section of How to Play.'
      ]
    }
  },
  {
    version:'1.1.4',
    date:'2026-08-28',
    title:'Fullscreen Reliability',
    sections:{
      added:[],
      changed:[
        'Reworked how fullscreen mode is requested and released around matches for more consistent behavior across browsers.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  },
  {
    version:'1.1.3',
    date:'2026-08-28',
    title:'Landscape Fixes',
    sections:{
      added:[],
      changed:[],
      nerfs:[],
      buffs:[],
      fixed:[
        'Further fixes to layout and sizing issues when playing in landscape orientation.'
      ]
    }
  },
  {
    version:'1.1.2',
    date:'2026-08-28',
    title:'Viewport & Letterbox Fix',
    sections:{
      added:[],
      changed:[
        'The arena now prefers to fill the screen (cropping a sliver of world edge) for small viewport shifts \u2014 like the browser\u2019s address bar showing or hiding \u2014 and only falls back to true letterboxing for a full device rotation, where cropping would actually cut off gameplay.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[
        'Fixed the game reading the browser\u2019s largest-possible viewport size on mobile instead of what\u2019s actually visible, which could leave visible dark bars down the sides once the address bar showed or hid.'
      ]
    }
  },
  {
    version:'1.1.1',
    date:'2026-08-28',
    title:'Draft UI Redesign & Real Enemy Art',
    sections:{
      added:[
        'Bestiary entries now use real in-game enemy art instead of placeholder shapes.'
      ],
      changed:[
        'Redesigned the draft screen layout.',
        'Improved fullscreen handling on match start.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[
        'Fixed a landscape-orientation sizing bug.'
      ]
    }
  },
  {
    version:'1.1.0',
    date:'2026-08-28',
    title:'Twin-Stick Aiming',
    sections:{
      added:[
        'Touch players now get a second on-screen stick for aiming: hold it out to auto-fire at whatever\u2019s nearest and in range, drag it past the outer ring to trigger your class ability. This replaces the old auto-aim-on-touch scheme.',
        'Matches now request fullscreen and lock to landscape on start (where the platform supports it), with a graceful fallback on platforms like iOS Safari that don\u2019t support it.',
        'Added a squad-wide skip vote for the shared squad-upgrade draft.'
      ],
      changed:[
        'Squad-upgrade prices now scale up with the wave instead of staying at their wave-1 price forever.'
      ],
      nerfs:[
        {entityType:'enemy',entity:'virus',
          changes:[{stat:'speed',label:'Speed',before:118,after:104}],
          note:'Keeps it dangerous without being unfairly hard to track at the new pace of play.'}
      ],
      buffs:[],
      fixed:[
        'Fixed wave 1 never earning enough EP to actually afford any squad upgrade.',
        'Fixed a double-scrollbar / off-center layout bug on the draft panel.'
      ]
    }
  },
  {
    version:'1.0.4',
    date:'2026-08-27',
    title:'Move During Drafts',
    sections:{
      added:[
        'You can now walk around while a squad, personal, or evolution draft is open, instead of being frozen in place \u2014 you still can\u2019t fire or target during that window, just reposition.'
      ],
      changed:[
        'Screens now fade out instead of vanishing instantly when they close.',
        'Personal-perk and evolution draft timers extended (25s and 20s, up from 18s/16s). The squad draft still has no timer.',
        'New waves now wait about a second and a half after a draft closes before the first enemy telegraph appears, giving you a moment to get back into position.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[
        'Fixed the draft screen hiding the joystick and fire button entirely on mobile \u2014 the HUD now stays visible and touchable underneath the draft panel.',
        'The draft panel no longer blocks touches outside the card list itself.'
      ]
    }
  },
  {
    version:'1.0.3',
    date:'2026-08-26',
    title:'Performance Pass',
    sections:{
      added:[],
      changed:[
        'Glow effects on enemies, players, projectiles, pickups, turrets, motes, hazards, and the core are now pre-rendered once and reused, instead of being rebuilt every frame \u2014 a big performance win on mobile.',
        'Rendering is now capped around 60fps (the simulation still runs every frame) so high-refresh-rate phones aren\u2019t doing pointless extra GPU work.',
        'Rendering resolution now adapts automatically \u2014 it steps down on phones that are struggling to keep up, and back up when they\u2019re not.',
        'Rendering fully pauses while a pause/menu screen covers the game.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  },
  {
    version:'1.0.2',
    date:'2026-08-25',
    title:'Rendering & Mobile Zoom Fixes',
    sections:{
      added:[],
      changed:[
        'The camera is zoomed in noticeably closer on phones (about 40% closer in portrait, 30% in landscape) \u2014 desktop and tablet are unaffected.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[
        'Fixed a bug where a Toxin Sac\u2019s acid cloud could trigger a rendering error starting around wave 9, causing the whole screen to smear with ghost trails until it was fixed by resizing the window.',
        'Fixed a related issue where a guest player on a different screen aspect ratio than the host could see the arena and entities slightly offset from where they actually were.'
      ]
    }
  },
  {
    version:'1.0.1',
    date:'2026-08-25',
    title:'Early Polish',
    sections:{
      added:[
        'Invite links now skip straight to the join screen with your squad code already filled in.'
      ],
      changed:[
        'Squad codes and lobby text can now be selected and copied by hand if the automatic copy button is blocked by the browser.'
      ],
      nerfs:[],
      buffs:[],
      fixed:[
        'Fixed enemies being able to spawn deep in off-screen space where they wouldn\u2019t become visible for a while; they now appear just outside the visible edge.',
        'Fixed the playable arena circle being able to extend slightly outside the visible play area in some cases.'
      ]
    }
  },
  {
    version:'1.0.0',
    date:'2026-08-25',
    title:'Initial Release',
    sections:{
      added:[
        'First release of Immune Response: a co-op evolution shooter for up to 4 players defending a shared body against waves of pathogens.',
        'Four playable classes, each with their own weapon and ability.',
        'Between-wave drafts for squad upgrades, personal perks, and ability evolutions.',
        'Organ-damage system \u2014 leaked pathogens chip away at the Heart, Lungs, or Brain, each with its own lasting debuff.',
        'Turret and Barrier defense upgrades to help hold the line.',
        'Solo play with an AI-controlled squad, and local multiplayer over the same Wi-Fi network.'
      ],
      changed:[],
      nerfs:[],
      buffs:[],
      fixed:[]
    }
  }
];

/* ============================================================================
   Changelog UI — hub/detail rendering + Nerfs & Buffs aggregate view +
   "unread update" notification dot.
   Self-contained like bestiary.js: data above, rendering below, wired up
   from main.js/ui.js by calling the functions in this section.
   ========================================================================== */

const CHANGELOG_SECTION_LABELS={added:'Added',changed:'Changed',nerfs:'Nerfs',buffs:'Buffs',fixed:'Fixed'};
const CHANGELOG_SECTION_ORDER=['added','changed','nerfs','buffs','fixed'];
const CHANGELOG_SEEN_KEY='ir_changelog_seen_version';

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// The most recent entry (array is newest-first) — used both for the notif
// dot and as the "latest version" reference elsewhere if ever needed.
function latestChangelogVersion(){
  return CHANGELOG.length?CHANGELOG[0].version:null;
}

function refreshChangelogNotifDot(){
  const dot=$('changelogNotifDot');
  if(!dot)return;
  const seen=localStorage.getItem(CHANGELOG_SEEN_KEY);
  const latest=latestChangelogVersion();
  dot.classList.toggle('hidden',!latest||seen===latest);
}

function markChangelogSeen(){
  const latest=latestChangelogVersion();
  if(latest)localStorage.setItem(CHANGELOG_SEEN_KEY,latest);
  refreshChangelogNotifDot();
}

function openChangelog(){
  AudioSys.play('ui');
  markChangelogSeen();
  showChangelogVersionList();
  showScreen('screenChangelog');
}

function setChangelogTab(active){
  const vBtn=$('btnChangelogTabVersions'),nbBtn=$('btnChangelogTabNerfsBuffs');
  if(vBtn)vBtn.classList.toggle('active',active==='versions');
  if(nbBtn)nbBtn.classList.toggle('active',active==='nerfsbuffs');
}

function renderChangelogSectionList(items){
  if(!items||!items.length)return '';
  // added/changed/fixed are always plain strings. nerfs/buffs can contain
  // either plain strings (rare, legacy-style one-off notes) or structured
  // NerfBuffEntry objects — route each accordingly.
  return `<ul>${items.map(t=>
    typeof t==='string'?`<li>${escapeHtml(t)}</li>`:`<li>${renderNerfBuffEntryInline(t)}</li>`
  ).join('')}</ul>`;
}

/* ----------------------------------------------------------------------
   Structured nerf/buff stat comparison
   ----------------------------------------------------------------------
   Looks up the entity's display name/icon from CLASSES or ENEMY_DEFS (data.js)
   and, when a `weapon` key is present alongside a dmg/rate stat change,
   derives an actual before/after DPS figure from the live WEAPONS table
   rather than trusting a hardcoded number — see computeWeaponDps() for the
   per-weapon fire-pattern handling (pellets, crit, etc.), sourced from the
   real resolution logic in combat.js/enemies.js. */

function nerfBuffEntityInfo(entry){
  const isEnemy=entry.entityType==='enemy';
  const table=isEnemy?ENEMY_DEFS:CLASSES;
  const def=table&&table[entry.entity];
  // ENEMY_DEFS entries have no `icon` field (only CLASSES does) — enemies
  // fall back to a generic pathogen icon rather than showing "undefined".
  return{
    name:def?def.name:entry.entity,
    icon:def&&def.icon?def.icon:(isEnemy?'🦠':'❓'),
  };
}

// Average per-shot multiplier from crit chance, matching the 1.8x crit
// multiplier applied in enemies.js's projectile-hit resolution.
const CRIT_MULT=1.8;

/* Computes sustained single-target DPS for a weapon given an optional stat
   override (e.g. {dmg:50} or {rate:1.0}), reading every other stat from the
   live WEAPONS table. Mirrors the actual fire-resolution path:
   - proj: multiple pellets (e.g. Phagocytosis Shotgun) all count toward
     single-target DPS since nothing in combat.js reduces per-pellet damage
     when several pellets connect with the same enemy at close range.
   - critChance: averaged in as (1 + critChance*(CRIT_MULT-1)) per shot,
     matching the 1.8x multiplier rolled per-projectile in enemies.js.
   - pierce/spread/knockback/splash don't change single-target sustained
     DPS against one enemy standing in the shot's path, so they're not
     factored in here.
   rate is time BETWEEN shots (seconds), so DPS = dmg*proj*critFactor/rate. */
function computeWeaponDps(weaponKey,overrides){
  const w=WEAPONS[weaponKey];
  if(!w)return null;
  const dmg=(overrides&&overrides.dmg!=null)?overrides.dmg:w.dmg;
  const rate=(overrides&&overrides.rate!=null)?overrides.rate:w.rate;
  const critChance=(overrides&&overrides.critChance!=null)?overrides.critChance:(w.critChance||0);
  const proj=w.proj||1;
  if(!rate)return null;
  const critFactor=1+critChance*(CRIT_MULT-1);
  return dmg*proj*critFactor/rate;
}

// For a NerfBuffEntry with a `weapon` key, find whichever dmg/rate/critChance
// changes are present and compute before/after DPS holding everything else
// at the CURRENT (post-patch) live WEAPONS value except the stat(s) that
// this specific entry states — so a patch that only touches dmg still shows
// an accurate DPS delta without needing rate re-stated redundantly.
function nerfBuffEntryDps(entry){
  if(!entry.weapon||!WEAPONS[entry.weapon])return null;
  const relevant={dmg:null,rate:null,critChance:null};
  let any=false;
  for(const c of entry.changes||[]){
    if(c.stat==='dmg'||c.stat==='rate'||c.stat==='critChance'){relevant[c.stat]=c;any=true;}
  }
  if(!any)return null;
  const beforeOverrides={},afterOverrides={};
  for(const k of Object.keys(relevant)){
    const c=relevant[k];
    if(c){beforeOverrides[k]=c.before;afterOverrides[k]=c.after;}
  }
  const before=computeWeaponDps(entry.weapon,beforeOverrides);
  const after=computeWeaponDps(entry.weapon,afterOverrides);
  if(before==null||after==null)return null;
  return{before,after};
}

function fmtStatNum(n){
  if(typeof n!=='number')return String(n);
  return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
}

function fmtStatValue(c){
  if(c.pct){
    return{before:Math.round(c.before*100)+'%',after:Math.round(c.after*100)+'%'};
  }
  const unit=c.unit?(c.unit.startsWith('s')||c.unit==='%'?c.unit:' '+c.unit):'';
  return{before:fmtStatNum(c.before)+(c.unit?(c.unit.match(/^[a-zA-Z]/)?' '+c.unit:c.unit):''),
         after:fmtStatNum(c.after)+(c.unit?(c.unit.match(/^[a-zA-Z]/)?' '+c.unit:c.unit):'')};
}

// direction: true if before->after is an improvement for the player-facing
// stat (used only for a small ▲/▼ visual cue, purely cosmetic).
function statDirectionUp(c){
  const better=c.after>c.before;
  return c.lowerIsBetter?!better:better;
}

function renderStatChangeRow(c){
  const {before,after}=fmtStatValue(c);
  const up=statDirectionUp(c);
  const arrow=up?'▲':(after===before?'•':'▼');
  return `<div class="nb-stat-row">
    <span class="nb-stat-label">${escapeHtml(c.label||c.stat)}</span>
    <span class="nb-stat-vals"><span class="nb-stat-before">${escapeHtml(before)}</span> → <span class="nb-stat-after">${escapeHtml(after)}</span></span>
    <span class="nb-stat-dir ${up?'up':'down'}">${arrow}</span>
  </div>`;
}

function renderDpsRow(dps){
  const delta=dps.after-dps.before;
  const pct=dps.before?Math.round((delta/dps.before)*1000)/10:0;
  const sign=delta>0?'+':'';
  const cls=delta>0?'up':(delta<0?'down':'flat');
  return `<div class="nb-dps-row ${cls}">
    <span class="nb-dps-label">Single-target DPS</span>
    <span class="nb-dps-vals">${fmtStatNum(dps.before)} → ${fmtStatNum(dps.after)}</span>
    <span class="nb-dps-delta">(${sign}${fmtStatNum(delta)}, ${sign}${pct}%)</span>
  </div>`;
}

// Full card rendering used in the Nerfs & Buffs tab.
function renderNerfBuffEntryCard(entry,cls){
  if(typeof entry==='string'){
    return `<div class="nb-item ${cls}">
      <span class="nb-tag">${cls}</span>
      <span class="nb-body">${escapeHtml(entry)}</span>
    </div>`;
  }
  const info=nerfBuffEntityInfo(entry);
  const weaponName=entry.weapon&&WEAPONS[entry.weapon]?WEAPONS[entry.weapon].name:null;
  const statRows=(entry.changes||[]).map(renderStatChangeRow).join('');
  const dps=nerfBuffEntryDps(entry);
  return `<div class="nb-item nb-item-structured ${cls}">
    <span class="nb-tag">${cls}</span>
    <div class="nb-body">
      <div class="nb-entity-head">
        <span class="nb-entity-icon">${escapeHtml(info.icon)}</span>
        <span class="nb-entity-name">${escapeHtml(info.name)}</span>
        ${weaponName?`<span class="nb-weapon-name">${escapeHtml(weaponName)}</span>`:''}
      </div>
      ${statRows?`<div class="nb-stat-list">${statRows}</div>`:''}
      ${dps?renderDpsRow(dps):''}
      ${entry.note?`<div class="nb-note">${escapeHtml(entry.note)}</div>`:''}
    </div>
  </div>`;
}

// Compact inline rendering used inside a single version's detail page
// (Nerfs/Buffs sections use the same bullet-list style as Added/Changed/
// Fixed there, so structured entries render as a single readable line).
function renderNerfBuffEntryInline(entry){
  const info=nerfBuffEntityInfo(entry);
  const weaponName=entry.weapon&&WEAPONS[entry.weapon]?WEAPONS[entry.weapon].name:null;
  const statBits=(entry.changes||[]).map(c=>{
    const {before,after}=fmtStatValue(c);
    return `${escapeHtml(c.label||c.stat)} ${escapeHtml(before)}→${escapeHtml(after)}`;
  }).join(', ');
  const dps=nerfBuffEntryDps(entry);
  const dpsBit=dps?` (DPS ${fmtStatNum(dps.before)}→${fmtStatNum(dps.after)})`:'';
  const head=`<b>${escapeHtml(info.name)}${weaponName?' — '+escapeHtml(weaponName):''}</b>`;
  return `${head}${statBits?': '+statBits:''}${dpsBit}${entry.note?(statBits?' — ':': ')+escapeHtml(entry.note):''}`;
}

function showChangelogVersionList(){
  setChangelogTab('versions');
  const body=$('changelogScreenBody');
  if(!body)return;
  if(!CHANGELOG.length){
    body.innerHTML='<div class="changelog-empty">No updates logged yet — check back after the next patch.</div>';
    return;
  }
  body.innerHTML=`<div class="changelog-list">${CHANGELOG.map((entry,i)=>{
    const chips=CHANGELOG_SECTION_ORDER.filter(k=>(entry.sections[k]||[]).length)
      .map(k=>`<span class="changelog-chip ${k}">${CHANGELOG_SECTION_LABELS[k]}</span>`).join('');
    return `<div class="changelog-entry" data-idx="${i}">
      <div class="changelog-entry-head">
        <div class="changelog-entry-version"><span class="v-num">v${escapeHtml(entry.version)}</span></div>
        <div class="changelog-entry-date">${escapeHtml(entry.date||'')}</div>
      </div>
      ${entry.title?`<div class="changelog-entry-title">${escapeHtml(entry.title)}</div>`:''}
      <div class="changelog-entry-chip-row">${chips}</div>
    </div>`;
  }).join('')}</div>`;
  body.querySelectorAll('.changelog-entry').forEach(el=>{
    el.addEventListener('click',()=>{
      AudioSys.play('ui');
      showChangelogDetail(parseInt(el.dataset.idx,10));
    });
  });
}

function showChangelogDetail(idx){
  setChangelogTab('versions');
  const entry=CHANGELOG[idx];
  const body=$('changelogScreenBody');
  if(!body||!entry)return;
  const sectionsHtml=CHANGELOG_SECTION_ORDER.filter(k=>(entry.sections[k]||[]).length).map(k=>`
    <div class="changelog-section">
      <div class="changelog-section-title ${k}">${CHANGELOG_SECTION_LABELS[k]}</div>
      ${renderChangelogSectionList(entry.sections[k])}
    </div>
  `).join('');
  body.innerHTML=`
    <button class="changelog-detail-back" id="btnChangelogDetailBack">‹ All versions</button>
    <div class="changelog-detail-head">
      <div class="changelog-detail-title">${escapeHtml(entry.title||('Version '+entry.version))}</div>
      <div class="changelog-detail-version">v${escapeHtml(entry.version)}</div>
      <div class="changelog-detail-date">${escapeHtml(entry.date||'')}</div>
    </div>
    ${sectionsHtml||'<div class="changelog-empty">No details for this version yet.</div>'}
  `;
  $('btnChangelogDetailBack').addEventListener('click',()=>{AudioSys.play('ui');showChangelogVersionList();});
}

// Groups nerfs and buffs by version, newest first — each version gets its
// own header with both its nerfs and buffs underneath, instead of the old
// layout that pooled every nerf from every version into one list and every
// buff from every version into a second list (so a v1.0 change and a v1.3
// change sat side by side with nothing showing which version did what).
function showChangelogNerfsBuffs(){
  setChangelogTab('nerfsbuffs');
  const body=$('changelogScreenBody');
  if(!body)return;
  const versionsWithChanges=CHANGELOG.filter(entry=>
    (entry.sections.nerfs||[]).length||(entry.sections.buffs||[]).length
  );
  if(!versionsWithChanges.length){
    body.innerHTML='<div class="changelog-empty">No balance changes logged yet — nerfs and buffs will show up here as soon as they happen.</div>';
    return;
  }
  const itemsHtml=(items,cls)=>items.map(t=>renderNerfBuffEntryCard(t,cls)).join('');
  body.innerHTML=`<div class="nb-version-list">${versionsWithChanges.map(entry=>{
    const nerfs=entry.sections.nerfs||[],buffs=entry.sections.buffs||[];
    return `<div class="nb-version-group">
      <div class="nb-version-head">
        <span class="nb-version-num">v${escapeHtml(entry.version)}</span>
        ${entry.title?`<span class="nb-version-title">${escapeHtml(entry.title)}</span>`:''}
        <span class="nb-version-date">${escapeHtml(entry.date||'')}</span>
      </div>
      ${nerfs.length?`<div class="nb-subgroup-head nerf">NERFS (${nerfs.length})</div>${itemsHtml(nerfs,'nerf')}`:''}
      ${buffs.length?`<div class="nb-subgroup-head buff">BUFFS (${buffs.length})</div>${itemsHtml(buffs,'buff')}`:''}
    </div>`;
  }).join('')}</div>`;
}
