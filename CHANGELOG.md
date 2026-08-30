# Changelog

All notable changes to Immune Response are documented in this file.

---

## [1.1.0] — Draft System Expansion

Major content and systems pass focused on build variety and fixing player
power outscaling enemy scaling over long runs.

### Added
- **Rarity system** for all three draft pools (squad upgrades, personal
  perks, class evolutions): Common (60%) / Elite (27%) / Epic (11%) /
  Legendary (2%), weighted per draft slot with tier fallback so a slot never
  dead-ends on unavailable content.
- **122 new draft cards** (79 → 201 total):
  - Squad upgrades: 22 → 30
  - Personal perks: 29 → 123 (universal pool + 4 full class trees,
    ~20 cards each spanning all four rarities)
  - Class evolutions: 28 → 48 (7–9 per ability, including a second
    "apex" legendary tier)
- **Status effect system**: Poison and Burn (stacking damage-over-time),
  Chill (stacking slow, escalates to a brief hard Freeze at 4 stacks).
  Available via squad upgrades, personal perks, and evolutions across
  multiple classes.
- **Orbiting familiars** (Phage Satellite line): personal perks that spawn
  independent orbiting damage-dealers around a player, stacking with
  repeated picks. Fully rendered in-world.
- **Curse cards**: high-risk/high-reward upgrades with a real drawback
  (e.g. Glass Body Protocol: -30% max Body HP for +35% squad damage).
  Always Epic/Legendary tier so a squad opts in deliberately.
- **Synergy cards**: perks/upgrades that check for another owned card
  before becoming eligible, rewarding combining specific picks
  (e.g. Frostfire Reaction: double DoT damage to Chilled enemies,
  requires a status-proc perk + Chill already owned).

### Changed
- **Damage / Fire Rate / Move Speed / Economy** squad upgrades now use
  **diminishing returns with hard stack caps** (e.g. damage: 12% → 9% →
  7% → 5% → 3%, capped at 5 stacks) instead of uncapped flat stacking.
  This was the main cause of players outscaling enemy HP/damage curves on
  long runs.
- Capped or situational cards (Turret, Barrier, Heal, Organ Repair, etc.)
  now drop out of the draft pool once maxed or irrelevant, instead of
  continuing to appear as dead picks.
- Personal perks and class evolutions now track per-player ownership, so
  a card already picked can never reappear in a later draft for that
  player — eliminates duplicate-effect stacking that wasn't intended to
  stack.
- Draft cards now display their rarity (colored border/glow, with a
  shimmer animation on Legendary pulls) instead of only a category tag.

### Fixed
- One-time cards (heal, organ repair) no longer appear in the draft once
  they'd have no effect (full HP, no damaged organ).
- Removed several dead/inert upgrade paths that occupied draft slots
  without a meaningful effect at the time they were offered.

### Internal
- Added `tests/draft-logic.test.js` and `tests/synergy-eligibility.test.js`
  — standalone Node harnesses that verify rarity distribution, stack-cap
  enforcement, no-duplicate-per-draft, ownership tracking, and synergy
  eligibility gating without needing a browser.
- Full pass to confirm every new perk/upgrade/evolution flag added this
  version is actually consumed somewhere in `combat.js` / `enemies.js` /
  `flow.js` / `sim.js` (no orphaned data-only cards).

---

## [1.0.0] — Initial Release

Baseline co-op evolution shooter: 4 classes, wave-based squad/personal/
evolution drafts, organ-damage debuff system, turret/barrier defense
upgrades, single-player and LAN multiplayer via `server.js`.
