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
       added:   ["..."],   // new content/features
       changed: ["..."],   // behavior/systems changes that aren't strictly a nerf/buff
       nerfs:   ["..."],   // anything that makes a class/enemy/item weaker
       buffs:   ["..."],   // anything that makes a class/enemy/item stronger
       fixed:   ["..."],   // bug fixes
     }
   }
   Any section can be omitted or left as an empty array — the renderer
   (changelog.js UI code + ui.js wiring) skips empty sections automatically.
   Keep entries written for players, not for other devs: plain language,
   short lines, no internal file/function names.
   ========================================================================== */
'use strict';

const CHANGELOG=[
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
        'Cards that hit their stack cap or become irrelevant (full HP, no damaged organ, a maxed-out turret) now drop out of the draft pool automatically instead of wasting a pick.'
      ],
      nerfs:[
        'Damage, fire rate, economy, and move-speed upgrades now cap at 4\u20136 stacks with diminishing returns per stack, instead of scaling forever \u2014 this was the main fix for squads outgrowing what enemies could keep up with on long runs.'
      ],
      buffs:[],
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
        'Virus enemy speed reduced (118 \u2192 104) to keep it dangerous without being unfairly hard to track at the new pace of play.'
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
  return `<ul>${items.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
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

// Aggregates every nerf/buff across all versions, newest first, into one
// scrollable history — so players can trace how a class/enemy/stat has
// been tuned over time without hunting through individual version entries.
function showChangelogNerfsBuffs(){
  setChangelogTab('nerfsbuffs');
  const body=$('changelogScreenBody');
  if(!body)return;
  const nerfItems=[],buffItems=[];
  for(const entry of CHANGELOG){
    for(const t of (entry.sections.nerfs||[]))nerfItems.push({text:t,version:entry.version});
    for(const t of (entry.sections.buffs||[]))buffItems.push({text:t,version:entry.version});
  }
  if(!nerfItems.length&&!buffItems.length){
    body.innerHTML='<div class="changelog-empty">No balance changes logged yet — nerfs and buffs will show up here as soon as they happen.</div>';
    return;
  }
  const group=(label,items,cls)=>{
    if(!items.length)return '';
    return `<div class="nb-group">
      <div class="nb-group-head">${label} (${items.length})</div>
      ${items.map(it=>`<div class="nb-item ${cls}">
        <span class="nb-tag">${cls}</span>
        <span class="nb-body">${escapeHtml(it.text)}<span class="nb-ver">v${escapeHtml(it.version)}</span></span>
      </div>`).join('')}
    </div>`;
  };
  body.innerHTML=group('NERFS',nerfItems,'nerf')+group('BUFFS',buffItems,'buff');
}
