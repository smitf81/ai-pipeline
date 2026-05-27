# Blueprint Environment Stability Pass

## Goal
Stabilise how structure blueprints relate to terrain/buildability and stop builders repeatedly claiming jobs they cannot physically reach.

## Scope
No new gameplay features. This pass only tightens existing construction placement and builder approach behaviour.

## Files changed
- `src/game/gameModel.js`
- `tests/constructionJobs.test.mjs`
- `tests/navigationConstructionRegressionLock.test.mjs`

## What changed

### 1. Blueprint footprint support validation
Single-structure placement now validates the actual supported footprint instead of only checking the centre tile. Larger structures such as forts now reject placements where part of the footprint spills onto sea/impassable terrain.

Line/path structures remain centre-tile supported for now so walls/trenches do not become over-strict near coasts.

### 2. Builder access validation
Placement now checks for at least one reachable work edge from the faction builder base before accepting the blueprint. This prevents placing jobs that immediately soft-lock builders into unreachable work.

If no reachable work point exists, placement fails with:

```txt
no-builder-access
```

### 3. Path blueprint access validation
Sketchable wall/trench path blueprints now validate builder access for generated segments before purchase/job creation.

### 4. Builder work-point rerouting
Builders now track a small runtime blacklist of failed construction work points. If a builder gets blocked while approaching a job, it retries a different usable work point before releasing the job back to pending.

This keeps them from repeatedly committing to the same bad edge like absolute muppets.

### 5. Reachability cache
Construction reachability checks are cached against the current map/navigation signature so repeated placement validation does not rebuild access from scratch for the same base and nav state.

## Behavioural result
- Blueprints are less likely to be accepted in physically unserviceable locations.
- Isolated build sites surrounded by sea are rejected at placement time.
- Builders should not endlessly re-claim the same unreachable construction edge.
- Completed structure navigation still remains authoritative only after construction completes.

## Validation run
Passed focused checks:

```txt
node --check src/game/gameModel.js
node --check tests/constructionJobs.test.mjs
node --check tests/navigationConstructionRegressionLock.test.mjs

constructionJobs.test.mjs
navigationConstructionRegressionLock.test.mjs
storageSupplyLines.test.mjs
gameModel.test.mjs
structureTopology.test.mjs
structureJoinery.test.mjs
collisionAuthority.test.mjs
resourceGathering.test.mjs
playerControlEnemyDirector.test.mjs
uiHudRegression.test.mjs
marchingSquares.test.mjs
```

## Known limitation
This is still tile-authoritative construction. It does not turn placement into full vector terrain/building geometry. That remains a later vector/marching-boundary style pass.
