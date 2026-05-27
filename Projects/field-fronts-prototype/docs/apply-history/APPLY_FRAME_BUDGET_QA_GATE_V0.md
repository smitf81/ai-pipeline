# APPLY_FRAME_BUDGET_QA_GATE_V0

## Goal

Add a serious browser-level frame-budget/FPS validation gate before future slices are treated as valid.

This is aimed at the current playtest problem: FPS fluctuation/jank that appears to correlate more with blueprint placement and pathfinding than with combat math alone.

## What changed

### Runtime frame-budget telemetry

`src/main.js` now records bounded frame-budget telemetry from the real animation loop:

- average FPS
- average frame time
- p95 frame time
- p99 frame time
- worst frame time
- long-frame count
- bad-frame count
- long-frame ratio
- bad-frame ratio

This is exposed through `state.runtimeStats.frameBudget` and through the QA hook:

```js
window.__fieldFrontsQa.frameBudget()
```

### QA browser hook

`src/main.js` now exposes `window.__fieldFrontsQa` for deterministic browser QA only.

Useful methods:

- `start()`
- `resetFrameStats()`
- `snapshot()`
- `spawnInfantry(count)`
- `issuePathOrders(target)`
- `placeBlueprints(...)`
- `placeBlueprintPath(...)`
- `runFrameStressScenario()`

The stress scenario deliberately exercises:

- skirmish boot
- infantry spawning
- player path orders
- blueprint placement
- sketched blueprint path placement
- live frame sampling after the stress setup

### New browser FPS gate

Added:

```txt
tools/run-frame-budget-qa.mjs
```

Run with:

```txt
npm run test:fps
```

It starts the local static server, launches a Chromium/Chrome/Edge browser through the DevTools protocol, runs the stress scenario, waits for live frames, and writes:

```txt
output/frame-budget-qa/report.json
```

Default thresholds:

```txt
FIELD_FRONTS_FPS_MIN_AVG=45
FIELD_FRONTS_FPS_MAX_P95_MS=34
FIELD_FRONTS_FPS_MAX_WORST_MS=110
FIELD_FRONTS_FPS_MAX_LONG_RATIO=0.18
FIELD_FRONTS_FPS_MIN_SAMPLES=90
```

Override them with environment variables if needed.

### Validation script

`package.json` now includes:

```txt
npm run test:fps
npm run test:validation
```

`test:validation` currently runs:

```txt
node tests/runIsolatedTests.mjs runtimePerformanceQa.test.mjs && node tools/run-frame-budget-qa.mjs
```

That is the intended pre-slice gate going forward.

## RuntimePerformanceQa integration

`runtimePerformanceQa.test.mjs` now statically verifies that:

- frame-budget telemetry exists in `main.js`
- the browser gate exists
- the QA stress hook exists
- `package.json` exposes `test:fps` and `test:validation`

This keeps runtime QA from pretending FPS is covered when it is not.

## Validation run here

Passed:

```txt
node --check src/main.js
node --check src/qa/runtimePerformanceQa.js
node --check tests/runtimePerformanceQa.test.mjs
node --check tools/run-frame-budget-qa.mjs
node tests/runIsolatedTests.mjs runtimePerformanceQa.test.mjs
node tests/runIsolatedTests.mjs gameModel.test.mjs constructionJobs.test.mjs
node tests/runIsolatedTests.mjs navigationConstructionRegressionLock.test.mjs collisionAuthority.test.mjs
```

Blocked in this container:

```txt
npm run test:fps
```

Reason: the available Linux Chromium is managed by container policy and blocks local URLs, so it cannot load `http://127.0.0.1:*`. The gate writes a failing report instead of silently passing.

This is not ignored. It means the FPS gate is implemented but must be run on a machine/browser that can actually load the game page, e.g. Felix's normal Windows Chrome/Edge environment.

## Current rule going forward

Before claiming a gameplay slice is validated, run:

```txt
npm run test:validation
```

If `test:fps` fails because of actual low FPS/jank metrics, stop and profile. If it fails because the browser cannot launch or cannot load localhost, fix the test environment before claiming validation.

## Why this matters

The old QA could say the simulation architecture was broadly sensible while the actual browser still felt like a stuttering goblin cart.

This slice makes the browser itself part of the validation chain.
