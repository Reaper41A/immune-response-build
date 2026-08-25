# IMMUNE RESPONSE

Co-op evolution shooter for up to 4 players defending a shared Body against
evolving pathogens. Zero dependencies — one file of server, a folder of
vanilla JS, no build step, no npm install.

Based on the prototype (`immune-response-prototype.html`) and the phase docs
in `immune-response-final-updated (4)` (Phases 1–4).

---

## Run it locally

```
node server.js          # Node >= 18, nothing else
```

Then open **http://localhost:3000**.

The boot banner also prints a LAN URL like `http://192.168.x.x:3000` — that's
the address friends on the same Wi-Fi open in their browser to join you.
Change the port with the `PORT` env var (`PORT=8080 node server.js`).

## Playing

- **Solo**: Play Solo fills empty seats with AI squadmates (bots vote in
  drafts, call out threats, revive on their own timers).
- **Multiplayer**: Multiplayer → Create Squad → share the 4-letter code.
  The lobby has **COPY** (code) and **COPY LINK** (`#join=CODE` invite URL)
  buttons right under the code. Squadmates pick a class (duplicates allowed)
  and ready up; the host deploys.
- **Rejoin**: dropped players keep their seat for a grace window (~90s in the
  lobby; mid-match seats persist for the whole run). The main menu shows a
  **Rejoin Squad CODE** button, and a dropped socket auto-reconnects on its
  own. Mid-run, your seat is covered by an AI bot until you're back — the
  host's sim hands control straight back to you when you rejoin.
- **Kick**: the host sees a KICK button on every squadmate row in the lobby
  (lobby phase only).
- In-run: WASD/arrows or left-half touch joystick to move, hold FIRE/SPACE
  (proximity auto-lock — no aiming), E for your class ability.
- Every cleared wave: a shared **squad draft** bought with EP, then a free
  **personal perk**; every 3rd wave adds an **ability evolution** draft.
- Leaks chip shared BODY HP and random organs; three organ failures are
  permanent run debuffs. Bosses every 5th wave.

## Arena stability

The battlefield lives in fixed virtual coordinates frozen at run start and
letterboxed into whatever the viewport becomes afterwards — rotating your
phone, the mobile URL bar collapsing, or resizing a desktop window can no
longer shift the arena, teleport entities, or shrink the playable radius
mid-fight.

## Deployment truth

| Host | Multiplayer | Notes |
|---|---|---|
| Any static host (**Netlify, Vercel, GitHub Pages**) | **SOLO ONLY** | Static hosting serves `public/`; there is no WebSocket endpoint, so squads can't form. Solo works because it runs a local sim with AI bots. |
| Any Node host (**Render, Railway, Fly.io, VPS**) | Full multiplayer | `node server.js` is all it takes. Set `PORT` if required; the server binds `0.0.0.0`. |
| **Supabase** | Not without a rewrite | Netcode is a raw WS relay (snapshots down, input intents up). Moving to Supabase means porting `netcode.js` onto Realtime channels — out of scope unless asked. |

Architecture in one line: the **lobby** is server-authoritative; once a match
starts, one client becomes the **sim host**, streams ~15 Hz snapshots +
events to guests, who stream back ~20 Hz input intents (see Phase 4
`architecture.md` / `sessionAuthority.js`). If the host disconnects mid-run,
a guest is promoted and rebuilds an approximate sim from its latest snapshot;
other disconnects convert seats to AI bots so the run continues.

Known platform behavior: like most browser games, the **sim host's tab must
stay visible** — heavily backgrounded/minimized tabs get their render loop
throttled by the browser, which stalls snapshot streaming for everyone.

## Design-decision log (where things come from)

- **Proximity auto-lock targeting** — Phase 2 `targetingSystem.js`
  semantics verbatim: edge-distance range check, nearest wins (ties break on
  lowest HP), sticky lock until death/out-of-range, structurally no aim
  input. Implemented in `public/js/sim.js`
  (`acquireOrRetainTarget`/`findBestTargetInRange`) and surfaced by the
  dashed range ring (`rangeIndicator`).
- **Continuous wave scaling** — Phase 2 `wave-config.json` "scaling" curves
  carried over as `scaledHp`/`scaledDmg` in `data.js` (+ elite chance, roster
  unlock table, spawn budget). The flat wave-50 jump was deliberately NOT
  carried over (superseded). Bosses scale slower, uncapped, per the Addendum.
- **Macrophage Mimic behavior** — Phase 1 ruling: it copies a squadmate
  present in *this* run (color comes from the victim), reveals at close
  range with a telegraph, lunge ×2.2. See
  `Phase1_Game_Design_and_Planning/Immune_Response_Phase1_Ruling_Macrophage_Mimic.docx`
  and `character-behavior-note-macrophage-mimic.md`.
- **Palette fixes** — Phase 3 `uiTheme.json` accessibility audit: YOU marker
  is unique magenta `#ff3ec8` (gold collided with B-Cell); worm/fungi/spore
  enemy colors reassigned away from player-class hexes; semantic colors
  (damage/heal/EP) stay consistent everywhere.
- **Duplicate classes allowed** — Director decision (Option A,
  `Director_Decisions/DECISION_LOG_duplicate-class.md`): enforced nowhere;
  the lobby shows both cells with YOU-markers instead.
- **Lobby contract** — `{squadCode, slots}` view, class pick, ready toggle,
  host-first ordering, max 4 humans, per Phase 4 `sessionAuthority.js`.
- **Tutorial as hint chips** — contextual one-shot hints reacting to real
  gameplay moments, dismissable, remembered per profile — the deliberate
  replacement for the prototype's blocking coach-marks (Phase 3 copy lives
  in `tutorialCopy.json`).
- **Organ debuffs, EP economy, diminishing returns** — Phase 2 systems
  (`organSystem`, `stackingDiminishingReturns`, `upgradeEffects`) folded into
  the sim; bot votes in drafts are advice, not law (whoever confirms buys
  their highlighted card).

## Repo layout

```
server.js            HTTP + RFC6455 WebSocket + lobby authority + relay
public/index.html    UI theme + screens
public/js/*.js       core/data/audio/sim/combat/waves/flow/enemies/
                     netcode/fx/render/entities/hud/input/ui/main
```

No build step, no dependencies. `node --check public/js/*.js` passes; the
server speaks plain WSS/WS on `/`.
