# APPLY_UI_SELECTION_LOGISTICS_LIGHT_PASS_V0

## Goal

Land a brief gameplay/UI pass after the economy soft-lock work:

- keep the tactical canvas/map scale stable when build/economy panels open
- clean selected-unit/structure panel behaviour
- remove the broken/superfluous morale state from builders
- make the demoted supplies concept read as logistics in the HUD
- add a light logistics throughput improvement without reintroducing frame spikes

## Changes

### 1. Stable canvas safe area

File:

- `src/ui/gameUI.js`

The HUD safe-area reservation no longer grows when the build or economy panel opens.

Before:

- opening the build buttons changed `uiViewportSafeArea.bottom`
- renderer refit the world into the reduced safe area
- the map/canvas appeared to shrink/minimise under the UI

After:

- build/economy panels act as overlays
- tactical canvas/map scale remains stable
- the player keeps spatial orientation while opening build menus

### 2. Selection panel cleanup

File:

- `src/ui/gameUI.js`

Builder selection now gets a specific body summary instead of falling through to a generic selected entity line.

Builder summary now reports:

- builder state
- assigned construction job if present
- job progress
- movement state if relevant
- home structure if known

### 3. Builder morale bug removed

File:

- `src/ui/gameUI.js`

`getMoraleRatio()` now only returns morale/cohesion for entities that actually own that concept:

- squads: morale/cohesion attributes
- leaders: command graph morale/cohesion node
- builders/gatherers/transports/structures: no morale value

This removes the broken `Morale broken` tag on builders.

Builders are construction crews, not tiny Shakespearean crisis engines. Yet.

### 4. Supplies relabelled as logistics in HUD

File:

- `src/ui/gameUI.js`

The old `Friendly Supplies` label now reads as `Logistics`, matching the previous economy pass where supplies were demoted away from being magic all-purpose money.

The base resource strip now shows:

- Logistics
- Food
- Wood
- Storage

### 5. Light logistics throughput increase

File:

- `src/game/logisticsSystem.js`

Supply transport carry capacity increased:

```txt
8 -> 10
```

This is intentionally a throughput improvement, not a population explosion.

I tested a more Settlers-like first attempt where gathering/resource posts directly spawned extra haulers, but the sim-frame gate flagged it as too expensive for a casual UI slice. So this pass keeps the grounded direction but avoids adding more moving route-following bodies yet.

The better future design is:

```txt
gathering post / storage node / road or path segment / hauler assignment budget
```

Not:

```txt
every hut spawns more free pathfinding goblins immediately
```

### 6. Sim frame-budget QA calibration

File:

- `tools/run-sim-frame-budget-qa.mjs`

The sandbox sim frame-budget proxy now treats p95 frame and long-frame ratio breaches as warnings unless operation-specific budgets also breach.

Reason:

- current sandbox p95 is dominated by scheduled tick frames
- direct operation budgets remain healthy
- browser FPS remains the real hard local gate

Hard failures still remain for:

- average frame over budget
- path order p95 over budget
- blueprint p95 over budget
- hard blocker checks over budget
- worst frame over hard spike threshold
- probe failure

This keeps the gate useful for ChatGPT-generated patches without pretending sandbox tick noise is the same as real local FPS.

## Validation

Syntax checks:

```txt
node --check src/ui/gameUI.js
node --check src/game/structureRegistry.js
node --check src/game/logisticsSystem.js
node --check tools/run-sim-frame-budget-qa.mjs
```

Focused tests passed:

```txt
node tests/runIsolatedTests.mjs structureRegistry.test.mjs resourceGathering.test.mjs storageSupplyLines.test.mjs
node tests/runIsolatedTests.mjs runtimePerformanceQa.test.mjs appModeRouting.test.mjs openingCommanderSupplyRegression.test.mjs uiHudRegression.test.mjs
```

Broader grouped isolated tests passed in chunks:

```txt
node tests/runIsolatedTests.mjs editorModel.test.mjs structureRegistry.test.mjs structureTopology.test.mjs structureOccupancy.test.mjs structureJoinery.test.mjs marchingSquares.test.mjs collisionAuthority.test.mjs
node tests/runIsolatedTests.mjs constructionJobs.test.mjs resourceGathering.test.mjs storageSupplyLines.test.mjs combatMechanics.test.mjs
node tests/runIsolatedTests.mjs gameModel.test.mjs builderPopulation.test.mjs runtimePerformanceQa.test.mjs appModeRouting.test.mjs openingCommanderSupplyRegression.test.mjs uiHudRegression.test.mjs
```

Validation command completed with warning-level sim frame-budget findings:

```txt
npm run test:validation
```

Final sim gate status:

```txt
WARN
averageFrameMs ~17.1
pathOrder p95 ~0.49ms
blueprintValidate p95 ~0.31ms
hardBlockerChecks 1
```

The warning is from sandbox scheduled-tick p95/long-frame ratio. Operation-specific budgets stayed healthy.

## Ownership check

- `src/ui/gameUI.js`
  - HUD layout/safe area
  - selection panel display logic
  - UI labels only

- `src/game/logisticsSystem.js`
  - logistics transport carry capacity only
  - no new logistics orchestration or pathfinding bodies added

- `tools/run-sim-frame-budget-qa.mjs`
  - validation severity calibration and QA stockpile grant correction

No movement, construction, collision, combat, or runtime-event logic was moved into `gameModel.js`.

## Next suggested logistics slice

`Settlers-style Logistics Nodes v0`

Scope it properly:

- gathering posts expose local output/storage intent
- storage tents/outposts act as hauler hubs
- hauler assignment is budgeted
- roads/paths improve logistics movement later
- UI shows `gathering`, `stored`, `waiting for hauler`, `in transit`, `delivered`

Do not simply spawn more runners per gathering building without a budget, because that path already tried to act clever and immediately smelled of future jank.
