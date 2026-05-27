# Path Following Smoothness & Stuck Recovery v0

## Goal

Improve the feel of movement after the navigation request queue pass by making units follow existing routes more smoothly and recover locally from small path-following obstructions without immediately treating the route as failed.

This slice does not replace the router, flow-field generation, or route queue. It only improves the follower layer.

## Changes

- Added bounded path lookahead waypoint selection.
  - Units can skip tiny intermediate route nodes when the direct segment is safely traversable.
  - Lookahead refuses unsafe corner cuts through sea/blocked tiles.
- Added local recovery steering in `resolveMovementStep()`.
  - If direct movement and simple axis slides fail, the follower tries a small bounded sidestep around the obstruction.
  - Recovery uses normal traversal checks, so it should not step into sea/blocked structures.
- Added slide-axis continuity.
  - If a unit was already sliding along X/Y, the next movement attempt prefers that same slide axis before switching, reducing axis-flip jitter.
- Added follower diagnostics on movement paths:
  - `followBlockedTicks`
  - `lastFollowFailureTick`
  - `lastFollowFailureReason`
  - `lastLookaheadCursor`
- Passed map/game/entity context into movement waypoint selection for leaders, squads, builders, resource workers, and supply transports.
- Added regression coverage for:
  - safe lookahead over micro-corners
  - no lookahead through blocked diagonal/corner cuts
  - local recovery sidestep when the direct waypoint is blocked

## Files changed

- `src/game/movementSystem.js`
- `src/game/gameModel.js`
- `src/game/constructionSystem.js`
- `src/game/logisticsSystem.js`
- `tests/navigationConstructionRegressionLock.test.mjs`

## Validation

Passed:

```txt
node --check src/game/movementSystem.js
node --check src/game/gameModel.js
node --check src/game/constructionSystem.js
node --check src/game/logisticsSystem.js
node --check tests/navigationConstructionRegressionLock.test.mjs
node tests/runIsolatedTests.mjs navigationConstructionRegressionLock.test.mjs
node tests/runIsolatedTests.mjs
npm run test:validation
```

Full isolated suite:

```txt
19 passed, 0 failed, 0 timed out
```

Sim frame-budget QA:

```txt
status: pass
averageFrameMs: ~10.91
p95FrameMs: ~46.02
worstFrameMs: ~46.02
```

## What this does not solve

- This is not an async pathfinding worker.
- This is not a full navmesh/A* rewrite.
- This does not yet add a visual path-following inspector.
- It improves route following, but live playtest may still reveal cases where the flow route itself needs better topology.

## Next recommended navigation slice

`Navigation Intent / Formation Spacing v0`

Likely focus:

- stop squads stacking on identical path nodes
- add small formation offsets for group commands
- make builders/resource workers queue around work/storage points instead of dogpiling the same access tile
- expose simple nav diagnostics in-game only if needed
