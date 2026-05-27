# APPLY_TRIBAL_CAMP_PROGRESSION_ECONOMY_V0

## Root cause
The early-game UI and economy were still exposing too much advanced capability too early. The prototype had already demoted `supplies` into an abstract logistics idea, but the player still needed a clearer grounded opening loop: camp-level units/buildings, gold/food/wood/population costs, and fewer advanced defences appearing before the settlement has earned them.

## Design change
The opening state now behaves more like a tribal camp:

- Advanced units and structures are hidden behind a progression/unlock system.
- The starting economy now fronts `Gold`, `Food`, `Wood`, and `Population`.
- `Supplies` remains as internal/compatibility logistics, not the main player-facing money resource.
- The first trainable fighting unit is now `Warrior`, a one-person spear/melee/thrown-style base unit.
- Organised infantry, scouts, artillery, towers, storage tents, walls, gates, trenches, forts, and command-scale units are staged behind later settlement progression.
- Builders now start construction jobs with paid/reserved wood available at the job, avoiding the dumb “paid for the building but waiting forever for someone else to bring the first plank” soft-lock.

## Progression model
New progression authority lives in:

```txt
src/game/progressionSystem.js
```

Current stages:

```txt
tribal_camp -> village -> town -> city
```

Opening `tribal_camp` unlocks:

```txt
Units:
- builder
- warrior

Buildings:
- outpost
- hunting_tent
- wood_gathering_post
- builder_lodge
```

Later stages unlock heavier military/logistics/defence options.

## Files changed

```txt
src/game/progressionSystem.js
src/game/economy.js
src/game/buildCatalog.js
src/game/structureRegistry.js
src/game/gameModel.js
src/game/constructionSystem.js
src/main.js
src/ui/gameUI.js
tools/run-sim-frame-budget-qa.mjs
tests/runIsolatedTests.mjs
tests/progressionSystem.test.mjs
tests/builderPopulation.test.mjs
tests/constructionJobs.test.mjs
tests/gameModel.test.mjs
tests/navigationConstructionRegressionLock.test.mjs
tests/openingCommanderSupplyRegression.test.mjs
tests/playerControlEnemyDirector.test.mjs
tests/storageSupplyLines.test.mjs
tests/structureJoinery.test.mjs
```

## Ownership check

- `progressionSystem.js` owns progression stages, unlock checks, lock reasons, and unlocked option filtering.
- `economy.js` owns resource definitions, storage-bound resource logic, and outpost gold/population trickle.
- `buildCatalog.js` owns unit/building catalogue costs and labels.
- `structureRegistry.js` owns structure construction resource costs.
- `constructionSystem.js` owns construction-job material reserve/delivery state.
- `gameUI.js` owns hiding locked build options and fronting Gold/Population/Food/Wood.
- `main.js` owns purchase/build request gating through progression.
- `gameModel.js` was touched for state orchestration, save/load normalisation, and adding the warrior squad spawn path. It did not become the progression/economy authority.

## Validation

Syntax checks passed:

```txt
node --check src/game/progressionSystem.js
node --check src/game/economy.js
node --check src/game/buildCatalog.js
node --check src/game/structureRegistry.js
node --check src/game/gameModel.js
node --check src/game/constructionSystem.js
node --check src/main.js
node --check src/ui/gameUI.js
node --check tools/run-sim-frame-budget-qa.mjs
```

Full isolated test suite passed:

```txt
node tests/runIsolatedTests.mjs
20 passed, 0 failed, 0 timed out
```

Validation command completed:

```txt
npm run test:validation
```

Frame-budget result:

```txt
Sim frame-budget QA: WARN
averageFrameMs: about 20.6ms
p95FrameMs: about 90.3ms
hardBlockerChecks: 1151
```

This is warning-level sandbox tick noise, not a high/failing gate. Path-order, blueprint validation, blueprint placement, summary, and hard-blocker budgets remain healthy.

## Known caveat
The commander remains a starting/scenario-owned command unit, not a trainable camp unit yet. That is intentional for v0: casually hiring multiple commanders from a tribal camp would make the opening roster less grounded. If we want a visible commander card later, it should probably be an inspect/status card, not a repeatable train button.

## Rollback
To roll back this slice, revert:

- `src/game/progressionSystem.js`
- progression imports/usage in `main.js`, `gameModel.js`, and `gameUI.js`
- gold/population resource additions in `economy.js`
- warrior option/spawn path
- construction job paid-wood reserve behaviour
- updated tests and sim-frame gate scenario
