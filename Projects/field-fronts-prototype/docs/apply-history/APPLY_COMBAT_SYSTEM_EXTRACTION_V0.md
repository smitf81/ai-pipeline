# Combat System Extraction v0

## Goal
Extract combat/projectile behaviour out of `src/game/gameModel.js` into a focused combat module without changing gameplay behaviour.

This is a refactor-only pass.

## Files changed

- `src/game/combatSystem.js` — new focused combat/projectile module.
- `src/game/gameModel.js` — now imports combat normalisers, model constants, summary, and tick advancement from `combatSystem.js`.

## What moved

The new combat module owns:

- `COMBAT_MODEL`
- projectile normalisation
- death-event normalisation
- combat component normalisation
- health component normalisation
- combat summary shaping
- combat tick advancement
- target acquisition
- projectile volley spawning
- projectile movement
- projectile hit/damage/death handling
- projectile pool management
- combat line-of-sight sampling used by targeting

## What stayed in gameModel.js

`gameModel.js` still owns overall game-state construction and orchestration:

- tick order
- movement
- construction
- logistics
- enemy AI
- structure normalisation
- squad normalisation
- field recomputation

Combat receives a narrow dependency bundle from `gameModel.js` for state-specific normalisers/defaults. This avoids a circular import and keeps ownership clear.

## Behaviour changes

None intended.

This pass does not alter:

- arrow speed
- damage
- range
- accuracy
- volley size rules
- collision rules
- pathfinding
- construction
- logistics
- rendering
- UI

## Architecture note

`combatSystem.js` does not import `gameModel.js`.

`gameModel.js` imports `combatSystem.js` and passes the small dependency bundle needed for structure/squad normalisation and faction-specific default combat values.

That keeps the dependency direction clean:

```txt
gameModel.js → combatSystem.js
combatSystem.js ↛ gameModel.js
```

## Validation run

Passed:

```txt
node --check src/game/combatSystem.js
node --check src/game/gameModel.js
combatMechanics.test.mjs
gameModel.test.mjs
collisionAuthority.test.mjs
structureTopology.test.mjs
navigationConstructionRegressionLock.test.mjs
constructionJobs.test.mjs
storageSupplyLines.test.mjs
playerControlEnemyDirector.test.mjs
uiHudRegression.test.mjs
marchingSquares.test.mjs
resourceGathering.test.mjs
structureJoinery.test.mjs
```

Also passed import smoke checks:

```txt
import('./src/game/gameModel.js')
import('./src/game/combatSystem.js')
```

## Known unrelated issue

`npm test` still hits the existing in-process runner timeout/hang pattern after several tests. In this run it reached:

```txt
PASS editor model
PASS structure registry
PASS structure topology
PASS structure occupancy
PASS structure joinery
PASS marching squares
PASS collision authority
PASS construction jobs
PASS resource gathering
```

Then the runner timed out before printing the next module. Focused tests pass individually, so this remains the known shared in-process test-runner contamination issue rather than a combat extraction failure.

## Result

`gameModel.js` is smaller and future arrow/volley/targeting/projectile changes now have a focused home:

```txt
src/game/combatSystem.js
```
