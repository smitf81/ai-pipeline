# APPLY — Cadence Obligation Guard v0

## Goal
Make future runtime work prove it obeys the cadence machinery before it can quietly become every-tick work.

This borrows the project discipline of a truth registry, but keeps it small and practical for the prototype: runtime systems now have a declared cadence contract with owner, cadence, dirty inputs, version inputs, forbidden wake sources, budget risk, and proof expectations.

## Root cause addressed
Cadence Regression Recovery v0 fixed the immediate leak, but the protection was still scattered across scheduler defaults, tests, and the sim QA tool.

That meant a future pass could accidentally reintroduce the same problem by adding:

- a new heavy runtime system without declaring ownership
- generic `fields` dirty wake-ups
- broad version dependencies like `combatTargets` or `renderUi`
- a scheduler default that drifted away from its intended contract

## Changes made

### `src/game/cadenceRegistry.js`
Added a central cadence registry for scheduled/heavy runtime systems.

Current declared systems:

- `enemyAI`
- `logistics`
- `fieldOverlay`
- `aiAppraisal`
- `weatherFields`

Each contract declares:

- owner path/function
- classification
- `everyTicks`
- allowed `dirtyKeys`
- allowed `versionKeys`
- forbidden dirty/version keys
- budget risk
- proof expectations

### `src/game/runtimeEvents.js`
- Scheduler defaults now derive from the cadence registry.
- Runtime summaries expose `cadenceRegistry` context.
- `scheduleRuntimeSystem()` records a contract violation if a caller tries to schedule:
  - an undeclared system
  - a system with a forbidden dirty key
  - a system with a forbidden version key
  - a cadence differing from its registry contract

This does not add a new scheduler. It adds a contract over the existing scheduler.

### `tools/audit-runtime-cadence.mjs`
Added a registry-backed cadence audit tool.

It validates:

- every scheduled system is declared
- registry and scheduler defaults match
- forbidden generic dirty/version keys are not present
- owners use `shouldRunScheduledSystem()` where required
- owners use `completeScheduledSystem()` where required
- package validation includes the cadence audit

### `package.json`
Added:

```txt
npm run test:cadence
```

`npm run test:validation` and `npm run test:validation:local` now include the cadence audit before the sim frame-budget probe.

### Tests
Added:

- `tests/cadenceRegistry.test.mjs`

Updated runners to include cadence registry checks.

## Validation

Passed:

```txt
node --check src/game/cadenceRegistry.js
node --check src/game/runtimeEvents.js
node --check tools/audit-runtime-cadence.mjs
node --check tests/cadenceRegistry.test.mjs
node tests/runIsolatedTests.mjs cadenceRegistry.test.mjs runtimeEvents.test.mjs
npm run test:cadence
node tests/runIsolatedTests.mjs runtimePerformanceQa.test.mjs
npm test
npm run test:validation
```

Latest cadence audit:

```txt
Cadence obligation audit: PASS (0 findings)
```

Latest sim QA still exits through validation successfully. It remains a p95 warning area rather than a cadence leak.

## What this does not do

- It does not create a new broad scheduler.
- It does not loosen performance thresholds.
- It does not remove the remaining stress-frame p95 warning.
- It does not make render/UI systems obey this registry unless they become scheduled/heavy simulation systems.

## Rule going forward

Any future heavy runtime system must answer:

1. Who owns this work?
2. Is it per-frame, per-tick, cadenced, event-driven, cached, or diagnostic-only?
3. What dirty/version keys are allowed to wake it?
4. What dirty/version keys are explicitly forbidden?
5. What test or QA proof catches drift?

If the answer is “dunno”, it does not belong in runtime yet. Cheeky little chaos goblin can wait.

## Next recommended seam

Now that cadence obligations are guarded, move to:

**Tick-frame p95 smoothing v0**

Focus on reducing remaining stress-frame spikes without changing gameplay truth or loosening QA.
