# Verification — Cadence Regression Recovery v0 — 2026-05-25

## Purpose
Verify that the project recovered previous runtime cadence discipline before starting a broader frame-budget refactor.

## Baseline observed before this pass

The project was failing `npm run test:validation`:

```txt
Sim frame-budget QA: FAIL
average frame proxy: ~25.588ms
p95 frame proxy: ~119.224ms
hard blocker checks: 1124
```

Important regression distinction:

- old pathfinding/blocker explosion had not returned
- hard blocker checks stayed low
- path-order p95 stayed cheap
- the issue was expensive systems waking too often through broad dirty/version dependencies

## Fixes verified

### Weather cadence
Before:

```txt
weatherFields dirtyKeys: ['fields']
weatherFields versionKeys: ['map', 'fields']
```

This allowed generic `fields` dirtiness to force weather recompute every tick.

After:

```txt
weatherFields dirtyKeys: []
weatherFields versionKeys: ['map']
```

Verified in sim report:

```txt
weatherFields runDelta: 0 across 3 QA ticks
weatherCadenceRestored: true
```

### AI appraisal cadence
Before:

AI appraisal could be woken by ordinary world churn through broad `fields/squads/structures/combatTargets` version dependencies and common events marking `ai` dirty.

After:

```txt
aiAppraisal dirtyKeys: ['ai']
aiAppraisal versionKeys: []
```

Only actual AI-native events mark `ai` dirty.

Verified in sim report:

```txt
aiAppraisal runDelta: 0 across 3 QA ticks
```

### Enemy director cadence
Before:

Enemy AI could be woken by economy/logistics/combat version churn.

After:

```txt
enemyAI dirtyKeys: []
enemyAI versionKeys: []
```

It remains controlled by decision cadence plus explicit bootstrap/survey state handling.

Verified in sim report:

```txt
enemyAI runDelta: 2 across 3 QA ticks
```

### Debug field overlay cadence
Before:

Field overlay listened to generic `fields` dirtiness.

After:

```txt
fieldOverlay dirtyKeys: []
fieldOverlay versionKeys: ['map']
```

Verified in sim report:

```txt
cadenceWarnings: []
```

## Construction access performance note

Blueprint validation p95 was also tripping the validation gate after cadence was repaired. The fix added a direct, step-checked construction access proof before falling back to full flood-fill reachability. This is not a heuristic: every tile step is still validated through movement traversal.

Post-fix repeated probes showed blueprint validation p95 around 3–5ms instead of ~59ms.

## Commands run

```txt
node --check src/game/runtimeEvents.js
node --check tools/run-sim-frame-budget-qa.mjs
node --check tests/runtimeEvents.test.mjs
node tests/runInProcessTests.mjs
npm run test:validation
```

## Latest validation result

```txt
npm run test:validation
PASS runtimePerformanceQa.test.mjs
Sim frame-budget QA: WARN
average frame proxy: 15.951ms
p95 frame proxy: 91.444ms
worst frame proxy: 91.444ms
```

`npm run test:validation` exits successfully because there are no high-severity findings after the cadence and construction-access repair. The remaining p95 warning is not ignored; it is the next optimisation target.

## Remaining concern

The remaining warning is stress-frame jank, not a generic cadence leak. It appears when several deliberately expensive QA actions land in the same proxy frame.

Next performance work should focus on spreading or staging stress-frame work, especially blueprint validation/placement and tick frames, without weakening gameplay truth.
