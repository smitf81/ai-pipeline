# APPLY — Navigation Request Queue & Path Stability v0

## Goal

Reduce remaining pathfinding jank by making route construction a managed lifecycle instead of letting units repeatedly convert every path problem into immediate blocked/repath churn.

This slice keeps the current pathfinding algorithm. It does **not** introduce a new navmesh, worker thread, or full route rewrite.

## Root cause

The previous frame-budget pass correctly killed the worst hard-blocker explosion and capped flow-field builds. However, when route work was deferred or failed, movement paths had no explicit lifecycle. That meant path results could collapse into generic blocked/empty states, encouraging noisy retries and making units look twitchy around obstacles, coastlines, construction sites, and delayed route builds.

## Files changed

- `src/game/movementSystem.js`
- `tests/navigationConstructionRegressionLock.test.mjs`
- `tests/structureRegistry.test.mjs`

## What changed

### Route lifecycle state

Movement paths now preserve explicit route lifecycle fields:

- `routeState`: `pending`, `ready`, `failed`, or `stale`
- `routeFailureReason`
- `routeFailureCount`
- `routeRequestedAtTick`
- `routeResolvedAtTick`
- `nextAllowedRepathTick`

This lets the runtime distinguish between:

- route still waiting for budget
- route successfully ready
- route genuinely failed
- route blocked and cooling down before retry

### Queued/deferred flow builds

When flow-field construction is over budget, the route is now stored as `pending` instead of vanishing into a generic empty route.

When budget becomes available, the pending route is built through the same shared route cache seam and becomes `ready` or `failed` with a recorded reason.

### Repath cooldown/backoff

Failed routes now receive bounded cooldowns before the next repath attempt. This prevents repeated failed requests from hammering the movement planner every tick.

### Navigation stats

The navigation route cache now records extra queue-related stats:

- `queueEnqueues`
- `queueWaits`
- `queueBuilds`
- `failedCacheHits`
- `flowFailures`

### Regression coverage

Added a navigation regression asserting that:

1. a route is marked `pending` when flow-field budget is unavailable,
2. it remains pending while budget is still unavailable,
3. it resolves to `ready` when budget becomes available,
4. the resolved path avoids sea tiles.

Also corrected the structure registry expectation for wall-top occupancy, since the combat doctrine slice intentionally made wall segments occupiable by one squad.

## Validation

Passed:

```txt
node --check src/game/movementSystem.js
node --check tests/navigationConstructionRegressionLock.test.mjs
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
averageFrameMs: 11
p95FrameMs: 52.567
worstFrameMs: 52.567
hardBlockerChecks: 2244
findings: []
```

## What this does not solve yet

This is still not a full navigation brain rewrite.

Still worth doing later:

- smoother lookahead path following
- local avoidance between groups
- path corridor/funnel smoothing
- explicit stuck detector with recovery intents
- visual route/debug overlay for route state and failure reason

## Next recommended navigation slice

`Path Following Smoothness & Stuck Recovery v0`

Focus that pass on how units follow a valid route once they have one: lookahead waypointing, anti-oscillation, stuck timers, and cleaner slide/recover behaviour along coastlines and structure edges.
