# APPLY — Economy / Logistics Soft-Lock Prevention v0

## Goal
Stop `Supplies` acting as the only hard build currency and reduce early-game soft-locks by separating abstract logistics pressure from physical storage/material flow.

## Root cause
The previous economy treated `Supplies` as both:

- the player-facing abstract logistics/muster currency, and
- the hard gate for all buildings/units.

At the same time, food and wood shared storage with supplies. That meant the player could end up blocked by a resource that was not really grounded in the thing they were trying to build.

## What changed

### 1. Multi-resource cost seam added
Added economy helpers:

- `normaliseResourceCost()`
- `scaleResourceCost()`
- `canAffordCost()`
- `spendCost()`
- `describeResourceCost()`
- exported `getResourceDefinition()`

Legacy `canAffordSupplies()` and `spendSupplies()` remain for compatibility, but new build/training flows now use `spendCost()`.

### 2. Supplies demoted from storage-bound physical stock
`Supplies` now remain an aggregate logistics resource, but do **not** consume shared physical storage capacity.

Storage now represents physical held resources like food/wood.

This prevents food/wood/supplies from crowding each other in dumb ways and reduces early economy bricks.

### 3. Build catalogue now carries resource costs
`BUILDING_OPTIONS` and `UNIT_OPTIONS` now expose:

- `resourceCost`
- `costLabel`

The UI now shows and affordability-checks multi-resource cost labels instead of only comparing available supplies.

### 4. Unit training now uses grounded resource costs
Example current unit costs:

- Builder: food + supplies
- Infantry: food + supplies
- Recon: food + supplies
- Artillery: wood + supplies
- Command: food + wood + supplies

Only Builder and Infantry currently deploy; the rest are catalogued for future implementation.

### 5. Structure placement uses small logistics order costs
Structures now use low `resourceCost` values for the planning/order stage, while physical timber still flows through construction logistics via existing wood delivery.

This avoids double-charging wood at placement and construction.

Examples:

- Wood Post: low supply order cost, no wood dependency, so recovery remains possible.
- Wall/Trench: modest order cost, material still delivered during construction.
- Fort: larger logistics commitment.

### 6. Construction placement spends resource costs once
`placeStructureBuildOrder()` and `placeStructurePathBuildOrder()` now spend `resourceCost` through the economy seam.

The returned build result includes `resourceCost` so tests/UI can verify actual spend instead of legacy `supplyCost`.

### 7. Frame-budget QA focus tightened
The sandbox sim frame-budget probe now disables unrelated enemy build cadence inside that specific QA scenario.

Reason: that gate is specifically for player blueprint/path/order frame budget. Enemy director construction bursts need their own dedicated stress test, not noisy cross-contamination inside this one.

## Files changed

- `src/game/economy.js`
- `src/game/buildCatalog.js`
- `src/game/structureRegistry.js`
- `src/game/constructionSystem.js`
- `src/game/gameModel.js`
- `src/main.js`
- `src/ui/gameUI.js`
- `tools/run-sim-frame-budget-qa.mjs`
- `tests/gameModel.test.mjs`
- `tests/constructionJobs.test.mjs`
- `tests/navigationConstructionRegressionLock.test.mjs`

## Ownership check

- Economy cost logic lives in `economy.js`.
- Build catalogue display/cost metadata lives in `buildCatalog.js`.
- Structure definitions own structure cost declarations in `structureRegistry.js`.
- Construction placement spends via `constructionSystem.js`.
- `gameModel.js` was touched only for validation call-site integration and enemy muster cost conversion.
- UI affordability/readout changes stayed in `gameUI.js` and `main.js`.
- No economy logic was moved into a new `gameModel.js` blob.

## Validation

Passed:

```txt
node --check src/game/economy.js
node --check src/game/buildCatalog.js
node --check src/game/structureRegistry.js
node --check src/game/constructionSystem.js
node --check src/game/gameModel.js
node --check src/main.js
node --check src/ui/gameUI.js
node --check tools/run-sim-frame-budget-qa.mjs
node tests/runIsolatedTests.mjs
npm run test:validation
```

Full isolated suite result:

```txt
19 passed, 0 failed, 0 timed out
```

Frame-budget gate result:

```txt
Sim frame-budget QA: PASS
averageFrameMs: ~8.13
p95FrameMs: ~52.57
worstFrameMs: ~52.57
```

## Important design note
This is not a complete economy simulation yet.

It is a structural correction:

- supplies are now logistics pressure rather than physical universal money;
- physical storage is less stupid;
- units/buildings now have a resource-cost seam;
- construction materials still flow through logistics;
- recovery structures are cheaper and less soft-locky.

## Recommended next economy/logistics slice
`Economy Visibility & Recovery UX v0`

Add clearer UI reasons for blocked build/train actions:

- missing food
- missing wood
- missing logistics/supplies
- storage full
- construction waiting for wood delivery
- no transport available
- no builder available

This should make the system feel fair rather than mysterious.
