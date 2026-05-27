# Combat Projectile Visual Stability v0

## Goal

Stabilise the newly extracted combat system so arrows/volleys behave like visible battlefield projectiles instead of instant spreadsheet damage.

This pass is intentionally scoped to combat/projectile lifecycle and projectile rendering.

## Files changed

- `src/game/combatSystem.js`
- `src/rendering/canvasRenderer.js`
- `tests/combatMechanics.test.mjs`

## What changed

### 1. Projectile travel is now visually paced

Combat data can still declare high projectile speed, but runtime projectile travel is capped by:

```js
COMBAT_MODEL.maxVisualProjectileSpeedTilesPerTick
```

This means arrows now move across several ticks instead of usually hitting immediately on the next combat update.

### 2. Damage occurs when the projectile reaches/collides

Projectiles now:

1. spawn at the firing origin,
2. move towards the target over ticks,
3. apply damage only when they reach the target or collide with a projectile blocker,
4. remain briefly in an `impacting` state so the renderer can show the hit.

### 3. Projectile impact state added

Projectile state now supports:

```js
state: 'flying' | 'impacting'
impactTicksRemaining
impactApplied
impactTargetId
impactTargetType
```

This lets the UI/rendering layer distinguish flying arrows from hit flashes.

### 4. Structure projectile blockers now matter

Completed structures with:

```js
collision.blocksProjectiles === true
```

now block combat line-of-sight and can intercept arrows in flight.

Source firing structures are excluded so garrisoned troops do not immediately shoot their own tower/outpost.

### 5. Renderer shows moving arrows and impact flashes

`drawProjectiles()` now draws:

- arrow shaft/trail between previous and current projectile position,
- arrow head while flying,
- small impact ring/flash while impacting.

## What did not change

- No movement/pathfinding changes.
- No logistics changes.
- No unit selection changes.
- No new combat units/weapons.
- No combat balance pass beyond visual projectile travel pacing.
- No renderer architecture rewrite.

## Tests added/updated

`tests/combatMechanics.test.mjs` now covers:

- visible projectile travel before damage,
- delayed damage on projectile arrival,
- impact state after hit,
- projectile blockers preventing line-of-sight,
- projectile collision with a blocker added after firing,
- existing volley/death/garrison/cap behaviours.

## Validation run

Passed:

```txt
node --check src/game/combatSystem.js
node --check src/game/gameModel.js
node --check src/rendering/canvasRenderer.js
node --check tests/combatMechanics.test.mjs

combatMechanics.test.mjs
api smoke/import checks via dependent tests

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

Known existing issue:

`npm test` still hits the existing in-process runner hang after several modules. Focused tests pass.

## Remaining combat work after this pass

Recommended next combat passes:

1. proper projectile/structure intersection tuning for wall/gate silhouettes,
2. battlefield readability pass for volley arcs/smoke/suppression,
3. ammo/supply gating polish,
4. cover/garrison targeting rules,
5. separate weapon profiles for melee, arrows, siege, and commander abilities.
