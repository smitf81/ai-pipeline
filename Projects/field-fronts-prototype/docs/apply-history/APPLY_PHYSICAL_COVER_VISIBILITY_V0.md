# APPLY_PHYSICAL_COVER_VISIBILITY_V0

## Purpose
Round up the interrupted Codex cover slice into a usable stealth-grounding pass.

## What Codex had already landed
- Added `src/game/coverSystem.js`.
- Started applying per-unit stealth state from `recomputeGameState()`.
- Exposed stealth fields in `summarizeGame()`.
- Added a combat dependency hook shape for detection, but did not actually consume it inside combat target selection.

## What this pass completed

### 1. Canonical cover/stealth state
`coverSystem.js` now owns:
- posture: `upright`, `crouched`, `garrisoned`
- cover state: `exposed`, `in_cover`, `hidden`
- cover source kind/label/rating
- concealment
- player visibility

Inputs include:
- forest / tall grass terrain
- completed cover-granting structures
- authored map-maker cover props
- corpse piles / body walls
- garrisoned squads

The cover context precomputes authored cover, completed cover structures and corpse stacks once per cover pass, rather than rediscovering them per unit.

### 2. Mobility/profile wiring
Quiet Move now resolves as crouched mobility:
- lower speed
- lower movement noise
- concealment bonus

`gameModel.js` applies this mobility multiplier in leader and squad movement planning.

### 3. Combat visibility wiring
`combatSystem.js` now consumes the detection hook:
- hidden targets are ignored by ranged target acquisition unless detected
- melee targeting also respects detection, with close reveal still allowing close-contact fighting
- firing/revealed targets remain detectable through `canObserverDetectEntity()`

### 4. Rendered physical cover objects
`canvasRenderer.js` now renders tangible cover factors:
- forest/tall-grass tree silhouettes on forest tiles
- low barricades for authored cover placements
- corpse piles/body walls from corpse stacks
- hidden/in-cover unit cues
- enemy hidden units are not drawn for the player unless debug visuals are active

### 5. HUD feedback
`gameUI.js` now shows selected unit cover information:
- Hidden / Cover chips
- Crouched chip
- Cover meter with source label

### 6. Tests
Added `tests/coverSystem.test.mjs` covering:
- forest/tall-grass concealment
- enemy hidden/not player-visible at range
- close reveal behaviour
- Quiet Move -> crouched profile
- Quiet Move speed reduction

Wired into:
- `tests/runInProcessTests.mjs`
- `tests/runIsolatedTests.mjs`

## Files changed
- `src/game/coverSystem.js`
- `src/game/gameModel.js`
- `src/game/combatSystem.js`
- `src/rendering/canvasRenderer.js`
- `src/ui/gameUI.js`
- `tests/coverSystem.test.mjs`
- `tests/runInProcessTests.mjs`
- `tests/runIsolatedTests.mjs`

## Validation performed

Passing:
- `node --check src/game/coverSystem.js src/game/gameModel.js src/game/combatSystem.js src/rendering/canvasRenderer.js src/ui/gameUI.js tests/coverSystem.test.mjs`
- `node tests/runIsolatedTests.mjs coverSystem.test.mjs`
- `node tests/runIsolatedTests.mjs coverSystem.test.mjs combatMechanics.test.mjs playerControlEnemyDirector.test.mjs runtimePerformanceQa.test.mjs uiHudRegression.test.mjs`
- remaining targeted isolated tests:
  - `gameModel.test.mjs`
  - `builderPopulation.test.mjs`
  - `progressionSystem.test.mjs`
  - `appModeRouting.test.mjs`
  - `openingCommanderSupplyRegression.test.mjs`
  - `uiHudRegression.test.mjs`

Observed limitation:
- Full in-process suite progressed through the cover/combat/navigation/player-control tests with no failures but hit the sandbox timeout before finishing the remaining tail tests.
- `npm run test:validation` currently fails the sim frame-budget proxy by a small average-frame breach and a p95 jank warning. Runtime static QA passes, but the sim budget report still flags tick-frame cost. Treat this as a performance warning to revisit, not a syntax/contract failure.

## Known next refinement
The physical cover visuals are deliberately simple and cheap. The next useful visual pass would be density management: reduce forest icon repetition, improve tree clustering, and make body walls read more clearly at low zoom.
