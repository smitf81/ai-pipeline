# Movement / Construction Frame Budget Pass v0

## Goal

Fix the frame-budget regression exposed by the sandbox-safe sim FPS proxy without pretending this is a full navigation redesign.

The failing signal before this pass was not mainly combat projectile cost. It was excessive movement/pathfinding/construction blocker work during normal tick and path-order churn.

## Root cause

The refactor made the system easier to inspect, and the sim frame-budget gate exposed the real hot path:

- hard blocker checks were repeatedly recalculated for the same tiles/factions inside the same nav/map version
- builder work-point selection could preview expensive route paths while scoring candidate build edges
- path orders forced an immediate full game-state recompute after order creation
- shared movement routing could stampede into expensive full flow-field construction in one simulation step

Before this pass, the sim frame-budget report showed roughly:

```txt
hardBlockerChecks: 203290
average proxy frame: ~235ms
p95 proxy frame: ~2239ms
```

## Changes made

### 1. Movement hard-blocker cache

Added a per-game movement blocked cache keyed by map/nav version, tile, and faction.

This prevents repeated identical blocker queries inside the same stable navigation state.

Touched:

```txt
src/game/movementSystem.js
src/game/gameModel.js
```

`emitStructureNavigationChange()` now clears the movement blocked cache alongside route/navigation caches.

### 2. Direct movement route fast path

Added a cheap direct-route builder before falling back to full shared route/flow planning.

Simple movement no longer pays the full route-generation cost when the straight path is clear.

Touched:

```txt
src/game/movementSystem.js
```

### 3. Navigation flow build budget

Added a per-tick budget for expensive shared movement flow builds.

This is a pressure valve: complex full flow paths can be deferred instead of all building inside one frame.

Touched:

```txt
src/game/movementSystem.js
```

The sandbox sim gate explicitly sets:

```txt
navigationFlowBuildsPerTick: 0
```

so it proves the frame does not explode when expensive path builds are deferred. Normal gameplay code keeps a small default budget.

### 4. Builder work-point selection no longer previews full routes per candidate

Builder construction edge selection now tries direct reachability first and only falls back to cached reachability when needed.

This avoids accidental flow-field construction while merely choosing a work edge.

Touched:

```txt
src/game/constructionSystem.js
```

### 5. Construction BFS queue micro-fix

Changed construction reachability queue processing from `shift()` to indexed traversal to avoid avoidable array churn.

Touched:

```txt
src/game/constructionSystem.js
```

### 6. Movement order recompute removal

`issuePlayerMoveCommand()` no longer recomputes the whole game state immediately after a successful order.

Movement order creation is now cheap; the simulation/summary cadence owns later updates.

Touched:

```txt
src/game/movementSystem.js
```

### 7. Tiny under-fire movement reaction

Units now receive a small movement penalty while under fire.

This is not full morale/suppression doctrine yet, but it makes the new under-fire combat signal physically matter without expanding the combat slice.

Touched:

```txt
src/game/movementSystem.js
```

### 8. Combat miss stat persistence bug

`projectileMisses` was incremented but not persisted back into `game.combatStats` after combat advancement.

Fixed while validating the combat tests.

Touched:

```txt
src/game/combatSystem.js
```

## Current validation result

Syntax checks passed:

```txt
node --check src/game/movementSystem.js
node --check src/game/constructionSystem.js
node --check src/game/gameModel.js
node --check src/game/combatSystem.js
node --check tools/run-sim-frame-budget-qa.mjs
```

Focused isolated tests passed:

```txt
node tests/runIsolatedTests.mjs gameModel.test.mjs constructionJobs.test.mjs navigationConstructionRegressionLock.test.mjs collisionAuthority.test.mjs runtimePerformanceQa.test.mjs builderPopulation.test.mjs structureTopology.test.mjs structureOccupancy.test.mjs combatMechanics.test.mjs
```

Validation gate passed:

```txt
npm run test:validation
```

Latest sim frame-budget result:

```txt
status: pass
averageFrameMs: 10.076
p95FrameMs: 48.986
worstFrameMs: 48.986
hardBlockerChecks: 2244
```

## What this does not solve

This does not mean navigation is finished.

It means the system no longer allows expensive route/flow construction and blocker checks to stampede the frame during common movement/construction scenarios.

The proper future structural slice is still:

```txt
Navigation Request Queue / Async Flow Planner v0
```

That would make deferred complex path requests explicit, observable, and prioritised instead of simply budget-limited.

## Next recommended slice

Now that the frame-budget fire is contained, the next gameplay slice can return to:

```txt
Combat Engagement Doctrine v0
```

Suggested focus:

- aiming/acquire time
- volley pass/fail reasons
- suppression/under-fire behaviour
- tower/trench/wall garrison combat rules
- combat debug output explaining why a unit did or did not fire

