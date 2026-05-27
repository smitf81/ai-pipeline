# APPLY_FRAME_BUDGET_QA_GATE_V01

## Slice

Frame Budget QA Gate v0.1 — sandbox/local split.

## Problem

The previous browser FPS gate was useful on a real Windows/Codex machine, but it is not reliably runnable in this ChatGPT sandbox because the hosted browser can block local URLs through managed policy. That made the gate honest locally but unusable for many ChatGPT-generated patch passes.

## Change

Added a second frame-budget gate:

```txt
npm run test:fps:sim
```

This runs without a browser and stresses the likely FPS regression seams:

- blueprint placement validation
- path blueprint placement/validation
- player path order churn
- game tick advancement
- render-summary generation
- collision/path blocker pressure

It writes:

```txt
output/sim-frame-budget-qa/report.json
```

The existing real browser gate remains available as:

```txt
npm run test:fps:browser
```

## Validation scripts

For ChatGPT/sandbox patch validation:

```txt
npm run test:validation
```

This now runs:

```txt
node tests/runIsolatedTests.mjs runtimePerformanceQa.test.mjs
node tools/run-sim-frame-budget-qa.mjs
```

For local Windows/Codex acceptance:

```txt
npm run test:validation:local
```

This runs the same sim gate, then the real browser FPS gate.

## Important current finding

The new sim frame-budget gate currently fails on this baseline. This is expected and useful: it confirms the user's playtest report that FPS/jank has regressed.

Latest observed report in this environment:

```txt
status: fail
average frame-proxy cost: ~235ms
p95 frame-proxy cost: ~2239ms
long-frame ratio: ~0.333
hard blocker checks: 203290
```

The strongest signal is not combat projectile cost. It is movement/path/blocker pressure, especially the hard blocker check count.

## Files changed

```txt
package.json
tools/run-sim-frame-budget-qa.mjs
src/qa/runtimePerformanceQa.js
tests/runtimePerformanceQa.test.mjs
output/sim-frame-budget-qa/report.json
```

## What this does not prove

The sim gate does not replace real FPS measurement. It is a deterministic proxy that ChatGPT can run here. Real FPS/jank still needs:

```txt
npm run test:validation:local
```

on the Windows machine.

## Next recommended slice

Do not proceed to Combat Engagement Doctrine yet.

Next slice should be:

```txt
Movement / Construction Hard-Blocker Budget Pass v0
```

Goal:

- identify why `advanceGameTick()` generates ~200k hard blocker checks under a tiny stress scenario
- cache or budget repeated blocker checks
- ensure blueprint placement/pathfinding does not trigger repeated full blocker scans
- rerun `npm run test:fps:sim` until it passes or the remaining bottleneck is isolated

