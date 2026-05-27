# APPLY_BUILDER_UNIT_HOME_V0

## Goal
Add a narrow Builder Unit / Builder Home v0 pass without redesigning the wider population or economy systems.

## What changed
- Added a trainable `Builder` unit option to the Units UI catalogue.
- Added a new buildable `builder_lodge` / `Builder Lodge` structure.
- Added a lightweight workforce metadata layer on structures:
  - completed Outposts grant `builderCapacityBonus: 2`
  - completed Builder Lodges grant `builderCapacityBonus: 2`
  - starting Outposts still seed one initial construction crew
- Added builder training validation and spawning APIs:
  - `summarizeBuilderCapacity()`
  - `validateBuilderCrewTraining()`
  - `spawnBuilderCrew()`
- Hooked the main purchase flow so Builder training checks cap before spending Supplies.
- Added a base overview chip showing `Builders used/cap`.
- Added basic Builder Lodge rendering glyph/shape support.
- Added focused builder population tests.

## Files changed
- `src/game/buildCatalog.js`
- `src/game/structureRegistry.js`
- `src/game/gameModel.js`
- `src/main.js`
- `src/ui/gameUI.js`
- `src/rendering/canvasRenderer.js`
- `tests/builderPopulation.test.mjs`
- `tests/runInProcessTests.mjs`
- `tests/runIsolatedTests.mjs`
- `tests/structureRegistry.test.mjs`

## Behaviour
- Player starts with 1 builder and 2 builder capacity from the starting Outpost.
- Training one more Builder succeeds.
- Trying to train above cap fails with `builder-capacity-reached` and does not spend Supplies.
- Building/completing a Builder Lodge increases player builder capacity by 2.
- Builder Lodges are normal structures: they place as blueprints, require construction, and only increase cap once complete.

## Validation run
Passed:
- `node --check src/game/structureRegistry.js`
- `node --check src/game/gameModel.js`
- `node --check src/main.js`
- `node --check src/ui/gameUI.js`
- `node --check src/rendering/canvasRenderer.js`
- `node --check tests/builderPopulation.test.mjs`
- `node -e "import('./tests/builderPopulation.test.mjs').then(m=>{m.run(); console.log('PASS builder population')})"`
- `node -e "import('./tests/structureRegistry.test.mjs').then(m=>{m.run(); console.log('PASS structure registry')})"`
- `node -e "import('./tests/gameModel.test.mjs').then(m=>{m.run(); console.log('PASS game model')})"`
- `node tests/runIsolatedTests.mjs builderPopulation structureRegistry gameModel --timeout=60000`

## Validation caveat
The full all-test runner was attempted, but the suite stalled after the existing resource-gathering area while entering the storage/supply-line run. The targeted impacted tests above passed, and `storageSupplyLines.test.mjs` also passed when run standalone during investigation. I have not marked the full suite as clean.

## Rollback
Revert the files listed above, or restore the previous zip baseline.
