# APPLY — Cadence Regression Recovery v0

## Goal
Recover the previous runtime cadence guarantees before doing fresh performance work.

This slice was not a new scheduler or broad refactor. It repaired later-system drift where ordinary world dirtiness was waking expensive systems earlier than their own cadence rules.

## Root cause
The old navigation/pathfinding budget work had not regressed. Hard blocker checks remained low and path-order generation stayed cheap.

The new regression was cadence drift:

- `weatherFields` subscribed to generic `fields` dirtiness and could recompute every tick instead of every 16 ticks.
- `aiAppraisal` was forced by ordinary spawn/movement/structure churn through broad version dependencies.
- `enemyAI` was forced by logistics/combat/economy version churn instead of decision cadence.
- `fieldOverlay` also listened to generic `fields` dirtiness despite being diagnostic/derived.

## Changes made

### `src/game/runtimeEvents.js`
- Restored `weatherFields` to cadence/map ownership:
  - `dirtyKeys: []`
  - `versionKeys: ['map']`
- Restored `fieldOverlay` to cadence/map ownership:
  - `dirtyKeys: []`
  - `versionKeys: ['map']`
- Restored `aiAppraisal` to cadence/explicit-AI ownership:
  - `dirtyKeys: ['ai']`
  - `versionKeys: []`
- Restored `enemyAI` to decision cadence ownership:
  - `dirtyKeys: []`
  - `versionKeys: []`
- Narrowed event impacts so ordinary world churn no longer marks `ai` dirty:
  - squad spawn
  - entity death
  - movement order
  - stance change
  - structure navigation change
- Kept actual AI events as AI dirtiness sources:
  - AI intent issued
  - AI intent response
  - AI attention marker
  - AI appraisal requested

### `tools/run-sim-frame-budget-qa.mjs`
- Added cadence diagnostics to the sim QA report:
  - dirty state at start/end
  - scheduler run-count deltas
  - scheduler `nextTick` / `lastRunTick`
  - dirty keys and version keys per scheduled system
  - cadence warnings
  - `weatherCadenceRestored` boolean
- Final runtime summary now reflects the actual `summarizeGame()` runtime coordinator payload.

### `tests/runtimeEvents.test.mjs`
- Added regression assertions to keep cadence ownership narrow:
  - weather must not listen to generic `fields`
  - field overlay must not listen to generic `fields`
  - AI appraisal must not be version-woken by ordinary world churn
  - enemy director must remain cadenced rather than waking from every logistics/combat/economy bump

## Validation

Passed:

```txt
node --check src/game/runtimeEvents.js
node --check tools/run-sim-frame-budget-qa.mjs
node --check tests/runtimeEvents.test.mjs
node tests/runInProcessTests.mjs
npm run test:validation
```

Latest sim QA result:

```txt
status: WARN
average frame proxy: 15.951ms
p95 frame proxy: 91.444ms
weatherFields run delta: 0 across 3 QA ticks
aiAppraisal run delta: 0 across 3 QA ticks
enemyAI run delta: 2 across 3 QA ticks
blueprint validation p95: ~4ms in repeated post-fix probes
cadence warnings: 0
```

## What improved

Compared with the failing baseline from this pass:

```txt
Before:
status: FAIL
average frame proxy: ~25.6ms
p95 frame proxy: ~119ms
weatherFields: reran every tick under generic fields dirtiness

After:
status: WARN / validation passable
average frame proxy: ~15.9ms
p95 frame proxy: ~91.4ms
weatherFields: did not rerun during the 3-tick QA scenario
AI appraisal: did not rerun from ordinary world churn
cadence warnings: none
```

## What this does not fix

The remaining p95 warning is still real. Blueprint validation is no longer the hard blocker; tick frames remain chunky, especially when a stress frame combines:

- spawn
- path orders
- blueprint validation/placement
- simulation tick
- summary

That is not the old blocker-check explosion, and not the weather/AI cadence leak anymore.

## Next recommended seam

Add a stricter **Cadence Obligation Guard v0** so future slices must declare:

- whether new runtime work is per-frame, per-tick, cadenced, event-driven, cached, or diagnostic-only
- what dirty key it owns, if any
- what scheduler it uses, if any
- what QA assertion proves it is not quietly waking every tick

Do this before more weather, stealth, AI, or field systems land.
