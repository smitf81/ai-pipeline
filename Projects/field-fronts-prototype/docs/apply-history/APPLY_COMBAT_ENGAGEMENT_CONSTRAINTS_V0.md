# APPLY_COMBAT_ENGAGEMENT_CONSTRAINTS_V0

## Slice
Combat Engagement Constraints v0

## Why this pass exists
Playtesting showed arrows appearing to fly from odd directions and distances. The debug pass found two practical causes:

1. Projectiles were effectively homing. While spawned from a valid line-of-sight/range check, in-flight arrows recalculated the target's current position every combat tick. If a target moved, the arrow chased the unit rather than travelling to the point it was fired at.
2. The game summary sent to rendering dropped projectile fields that the renderer expects, including origin, previousPosition, state, and impact fields. That made projectile visuals less grounded than the simulation state.

The broader design issue is also real: combat still lacks fuller engagement doctrine, aiming states, suppression behaviour, formation reaction, and garrison-vs-cover rules. This slice deliberately fixes only the glaring projectile constraint bugs and adds the first under-fire state hook.

## Files changed

- `src/game/combatSystem.js`
- `src/game/gameModel.js`
- `tests/combatMechanics.test.mjs`

## What changed

### 1. Arrows no longer home onto moving targets

Projectile target position is now locked at volley spawn.

Before:
- arrow chooses target
- arrow recomputes target position every tick
- arrow curves/chases if target moves

After:
- arrow chooses target
- arrow stores the aim point at fire time
- arrow travels to that aim point
- if the target moved away from the impact window, the projectile misses

### 2. Projectile travel now has a leash

Each projectile stores:

- `maxTravelDistance`
- `travelledDistance`

This prevents future tuning from accidentally letting arrows fly indefinitely or behave like magic missiles.

### 3. Misses are now represented

Projectiles now carry:

- `impactOutcome: "hit" | "miss" | "blocked" | "expired" | null`

Combat stats now include:

- `projectileMisses`

This gives us the beginning of a real volley pass/fail model instead of treating accuracy as damage flavour only.

### 4. Incoming fire state now exists

Volley targets now get lightweight under-fire metadata:

- `underFireUntilTick`
- `incomingFireCount`
- `lastUnderFireFromId`

This does not yet make units react. It creates the state seam needed for the next pass: suppression, ducking into trench cover, morale wobble, retreat, counter-volley, etc.

### 5. Projectile render summary now preserves sim truth

`summarizeGame()` now includes the projectile fields the renderer needs:

- origin
- previousPosition
- state
- impact outcome
- impact tick state
- travel leash fields
- source/target type metadata

This should make projectile interpolation/direction much less cursed.

## Validation run

Syntax checks:

```txt
node --check src/game/combatSystem.js
node --check src/game/gameModel.js
node --check tests/combatMechanics.test.mjs
```

Focused tests:

```txt
node tests/combatMechanics.test.mjs
node tests/gameModel.test.mjs
node tests/structureOccupancy.test.mjs
node tests/structureRegistry.test.mjs
node tests/builderPopulation.test.mjs
node tests/runtimePerformanceQa.test.mjs
node tests/collisionAuthority.test.mjs
node tests/structureTopology.test.mjs
```

All focused checks passed.

## Added/updated test coverage

- Projectiles still spawn and damage visible stationary targets.
- Projectile render summaries preserve origin/previousPosition/state.
- Projectile damage is delayed until impact.
- Projectiles lock aim point and can miss a moved target.
- Incoming volleys mark the target as under fire.
- Projectile blockers still prevent LoS.
- Projectiles still collide with new blockers in flight.
- Destroyed blockers still emit navigation change.
- Out-of-range targets still do not fire.
- Garrisoned squads still fire from their structure.
- Projectile caps still bound mass volleys.

## Current combat reality after this slice

Better:

- arrows are less magical
- projectile visuals have enough state to draw honestly
- volley outcomes can now be hit/miss/blocked/expired
- targets can know they are under fire

Still missing:

- explicit aim/acquire time before firing
- suppression/morale reaction to under-fire state
- unit stance behaviour under fire
- melee/ranged weapon classes
- proper wall-top occupancy
- trench reaction and cover behaviour
- tower/firing-arc constraints
- target leading or intentional ballistic spread
- friendly fire / blocked friendly lanes
- combat UI explanation of why a volley fired, missed, or was blocked

## Recommended next combat slice

`Combat Engagement Doctrine v0`

Narrow target:

- add engagement states: `idle`, `acquiring`, `aiming`, `firing`, `reload`, `suppressed`, `seeking_cover`
- make `underFireUntilTick` affect movement/stance lightly
- define structure combat roles:
  - trench = cover + suppression resistance, low range
  - watchtower = range/vision/accuracy, exposed if breached
  - fort = strong garrison fire + high cover
  - wall = blocker/cover first; wall-top firing later
- add debug fields explaining why a volley did or did not happen

Do not add artillery, complex ballistics, or broad morale systems yet. Keep it brick-by-brick, not fireworks in a wardrobe.
