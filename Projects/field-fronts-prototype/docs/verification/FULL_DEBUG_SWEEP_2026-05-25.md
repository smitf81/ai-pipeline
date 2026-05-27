# Full Debug Sweep — 2026-05-25

## Scope

Audit and validation pass over the physical cover/visibility build. This pass checked code health, regression risk against the previous uploaded zip, folder organisation, documentation drift, and QA coverage.

## Executive verdict

The cover slice is structurally sound enough to keep. No broad unintended regressions were found: the diff against the previous package is limited to the intended cover/visibility files, new cover tests, test runner registration, and generated QA reports.

The main unresolved blocker is still performance: `npm run test:validation` fails the sim frame-budget proxy on tick jank. This blocker predates the cover pass and was already present in the previous package, though the current run is slightly better on average than the previous stored report.

## Regression comparison against previous zip

Compared source package: `field-fronts-prototype (2).zip`.

Only intentional code/test files changed:

- `src/game/coverSystem.js`
- `src/game/gameModel.js`
- `src/game/combatSystem.js`
- `src/rendering/canvasRenderer.js`
- `src/ui/gameUI.js`
- `tests/coverSystem.test.mjs`
- `tests/runInProcessTests.mjs`
- `tests/runIsolatedTests.mjs`

No accidental loss of scenario, economy, command wheel, movement extraction, construction, logistics, melee/death, weather, UI mode, or autonomous enemy files was detected by file-level comparison.

## Debug sweep findings

### Pass

- JavaScript syntax check passed for `src/`, `tests/`, and `tools/`.
- Full in-process test suite passed.
- Targeted isolated regression groups passed.
- Cover/stealth truth is owned by `src/game/coverSystem.js`, not the renderer/UI.
- Rendering reads stealth visibility and cover sources from simulation state.
- Combat target acquisition consumes the detection dependency hook.
- Quiet movement now affects mobility and noise through the mobility profile.

### Hardened during this sweep

Added extra regression coverage:

- Authored cover placements feed canonical cover state.
- Corpse stacks/body walls feed canonical cover state.
- Hidden forest targets do not attract ranged volleys until a unit is close enough to reveal them.

Files strengthened:

- `tests/coverSystem.test.mjs`
- `tests/combatMechanics.test.mjs`

### Concerns

- Several model constants are still tuning values rather than authored data. They are at least centralised in model objects such as `COVER_MODEL`, `MOBILITY_PROFILES`, `COMBAT_MODEL`, and terrain config. Do not scatter new cover/range/noise numbers inside renderer or UI code.
- `gameModel.js` is still too large. This is not a new regression, but it remains the biggest maintainability pressure.
- `canvasRenderer.js` has grown again with physical cover drawing. It is still presentation-only, but a later renderer extraction should split cover/environment presentation helpers into smaller files.

## Validation performed

### Passed

```txt
node --check src tests tools
npm test
node tests/runIsolatedTests.mjs structureTopology structureOccupancy structureJoinery marchingSquares collisionAuthority constructionJobs resourceGathering storageSupplyLines --timeout=60000
node tests/runIsolatedTests.mjs combatMechanics navigationConstructionRegressionLock playerControlEnemyDirector gameModel --timeout=60000
node tests/runIsolatedTests.mjs builderPopulation progressionSystem coverSystem runtimePerformanceQa appModeRouting openingCommanderSupplyRegression uiHudRegression --timeout=60000
```

### Browser smoke

```txt
npm run test:browser
```

Result in this sandbox: skipped because the Codex Playwright client path is not present. This is an environment limitation here, not a source failure.

### Failing validation gate

```txt
npm run test:validation
```

Current result:

- `runtimePerformanceQa.test.mjs` passed.
- `run-sim-frame-budget-qa.mjs` failed.
- Average frame proxy: about `25.7ms`, threshold `22ms`.
- p95: about `121ms`, threshold `55ms`.
- Worst: about `121ms`, threshold allows `180ms`.

Previous stored package already failed this same gate:

- Previous average frame proxy: about `31.9ms`.
- Previous p95: about `117ms`.
- Previous blueprint p95 also breached; current blueprint p95 no longer breaches in the latest run.

Interpretation: not caused by the cover slice, but still a real blocker for the next optimisation pass.

## Documentation and organisation work

- Root apply-note clutter moved to `docs/apply-history/`.
- Agent orientation pack moved to `docs/agent-orientation/`.
- Historical generated QA artifacts moved to `artifacts/qa-output/`.
- Historical logs moved to `artifacts/logs/`.
- Added `docs/INDEX.md`.
- Added `docs/PROJECT_ORGANISATION.md`.
- Updated `README.md` to describe the current prototype rather than the old early-loop state.
- Updated `progress.md` with the physical cover and audit/organisation pass.

## Current recommended next validation passes

1. **Performance pass:** profile tick-frame jank, especially simulation tick bursts and render-summary generation under construction/combat pressure.
2. **Renderer decomposition:** split physical cover/environment drawing out of the now-heavy `canvasRenderer.js` while preserving simulation ownership.
3. **Documentation hygiene:** keep root clean; future slice docs belong in `docs/apply-history/`, not loose at root.
