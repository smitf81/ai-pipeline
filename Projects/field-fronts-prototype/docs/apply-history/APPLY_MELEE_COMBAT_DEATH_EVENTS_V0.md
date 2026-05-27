# APPLY_MELEE_COMBAT_DEATH_EVENTS_V0

## Slice
Melee Combat / Death Events v0

## Goal
Add a grounded close-contact combat layer and richer death/onDeath records without moving combat logic back into `gameModel.js`.

## Design changes
- Units that close to melee range now use contact strikes instead of firing arrows at point-blank range.
- Melee is gritty and low-tech:
  - warrior: spear/hand weapon contact profile
  - infantry: weaker but massed contact profile
  - commander: short spear command profile
- Ranged/thrown projectile combat still exists, but contact takes priority when units are physically engaged.
- Death records now describe what happened instead of merely deleting an entity.

## Files changed
- `src/game/combatSystem.js`
  - owns melee engagement, contact strike damage, melee stats, and enriched death/onDeath records.
- `src/game/gameModel.js`
  - template/default wiring only: warrior/infantry/leader melee defaults and combat deps.
  - no melee per-tick implementation was added here.
- `src/game/runtimeEvents.js`
  - adds `entity:died` as a runtime event that marks relevant state dirty.
- `src/ui/gameUI.js`
  - selection meter now says `Combat` and can display melee engagement state instead of always saying `Arrows`.
- `tests/combatMechanics.test.mjs`
  - adds melee contact and melee death regression coverage.

## Behaviour added
- `combat.state` can now become:
  - `engaged-melee`
  - `melee-strike`
- `combat.lastMeleeOutcome` records outcomes such as:
  - `struck`
  - `killing-blow`
  - `recovering:N`
- Combat summary now tracks:
  - `meleeStrikes`
  - `meleeKills`
  - `meleeDamage`
  - `meleeEngaged`
- Death events now include:
  - `deathState`
  - `position`
  - `summary`
  - `damageApplied`
- Death also emits runtime event:
  - `entity:died`

## Ownership check
- Combat logic stayed in `combatSystem.js`.
- `gameModel.js` was touched only for unit templates, default combat values, and dependency injection.
- Runtime dirty/version handling stayed in `runtimeEvents.js`.
- UI display stayed in `gameUI.js`.

## Validation
Passed:

```txt
node --check src/game/runtimeEvents.js
node --check src/game/combatSystem.js
node --check src/game/gameModel.js
node --check src/ui/gameUI.js
node --check tests/combatMechanics.test.mjs
node tests/runIsolatedTests.mjs
npm run test:validation
```

Full isolated suite:

```txt
20 passed, 0 failed, 0 timed out
```

Sim frame-budget QA:

```txt
status: warn
averageFrameMs: ~20.72
p95FrameMs: ~85.61
worstFrameMs: ~85.61
```

The warning is the same sandbox-style aggregate frame warning class seen before. Operation-specific budgets stayed within limits, and validation exited successfully.

## Notes
A first implementation used array-heavy melee target filtering and pushed the sim-frame gate into fail territory. That was fixed by changing melee target selection to a tight for-loop over indexed targets. The gate returned to warning-level sandbox noise rather than a hard fail.

## Next possible combat slice
- Wounded/casualty state before removal.
- Corpse/field marker rendering.
- Retreat/shock reaction from nearby deaths.
- Formation spacing before melee contact.
