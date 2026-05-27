# Current Next Slices

These are safe next implementation slices, not promises. Pick one, keep it narrow, then validate it.

| Slice | Goal | Main files | Must not regress | QA required | Notes |
|---|---|---|---|---|---|
| Construction placement polish | Make build placement feel clearer and more grounded | `editorState.js`, `pointerController.js`, `canvasRenderer.js`, `components.js` | Supplies spend once; invalid preview does not commit | `npm.cmd test`, browser smoke | Improve feedback before adding new structure types. |
| Blueprint visual language v1 | Make planned/under-construction structures readable without blue boxes | `canvasRenderer.js`, maybe `components.js` | Construction state/progress truth remains in GameState | `npm.cmd test`, browser smoke/screenshots | Stakes, chalk lines, scaffold arcs, worker flags. No behaviour change. |
| Builder autonomy readability | Surface builder state/job/progress in UI | `components.js`, `gameUI.js`, maybe renderer labels | Builder logic unchanged unless explicitly scoped | `npm.cmd test`, browser smoke | Helps debug jobs without making a new dashboard monster. |
| Route/path smoothing | Reduce movement jitter and path line ugliness | `gameModel.js`, `canvasRenderer.js` | Authoritative movement not mutated by interpolation | `npm.cmd test`, runtime QA, browser smoke | Be strict about visual-only smoothing vs true position. |
| Tile resolution / terrain smoothing | Improve landscape feel without rewriting terrain truth | `canvasRenderer.js`, maybe `mapModel.js` later | MapData contract, terrain paint/import/export | `editorModel`, browser smoke | Start visual-only; actual resolution change is bigger. |
| Diagnostic overlay toggle discipline | Hide/toggle tactical/debug layers cleanly | `components.js`, `canvasRenderer.js`, `main.js` | Overlay hidden skip, default player readability | runtime QA, browser smoke | Later make overlays unlockable/diegetic. |
| Map maker improvements | Better authored terrain/tools | `editorState.js`, `brush.js`, `components.js`, `mapModel.js` | GameState separation | `editorModel`, browser smoke | Good when play loop stabilises. |
| Tick/frame-budget p95 smoothing | Reduce remaining stress-frame p95 warning after cadence recovery | `gameModel.js`, `tools/run-sim-frame-budget-qa.mjs`, possibly extracted tick subsystems | Average budget remains under 22ms; gameplay unchanged | `npm.cmd test`, `npm.cmd run test:validation` | Blueprint validation is back under budget; focus tick-frame staging/recompute bursts. |
| Future tech/progression modifiers | Add scalable modifiers for structures/units/research | `structureRegistry.js`, `gameModel.js`, economy docs/tests | No scattered magic constants | focused tests + `npm.cmd test` | Do after base construction loop is readable. |
| Cover/visibility refinement | Improve visual density and readability of physical cover after v0 | `coverSystem.js`, `canvasRenderer.js`, `gameUI.js` | Cover truth remains in simulation, not renderer | cover/combat tests + browser smoke | v0 landed; next is readability/perf, not a second stealth engine. |
| Supply route pressure | Make logistics matter spatially | `gameModel.js`, `fields.js`, economy docs | Supply contract remains expandable | `gameModel`, runtime QA | Keep it pressure-based first, not a full transport sim. |

## Recommended immediate next slice

**Tick-frame p95 smoothing v0.**

Why:

- Cadence Regression Recovery v0 restored the major leaked cadence paths.
- `npm.cmd run test:validation` now exits successfully, but the sim frame-budget report still warns on p95 stress-frame jank.
- Cadence Obligation Guard v0 is now in place.
- Future runtime systems must declare cadence/dirty/version ownership in `src/game/cadenceRegistry.js`.
- The next optimisation should focus on tick-frame staging/recompute bursts. Blueprint validation has already been brought back under budget by direct access proofing.

## Slice prompt skeleton

```txt
Implement Tick-frame p95 smoothing v0.

Scope:
- reduce remaining sim-frame p95 warning without changing gameplay truth
- use the cadence registry as a guardrail, not as a new scheduler
- identify which stress-frame phase spikes most: spawn, path order, blueprint validation/place, tick, or summary
- stage/cache only the expensive work that proves up in the report

Must preserve:
- average frame proxy under budget
- existing cadence registry contracts
- movement, construction, logistics, combat and cover behaviour
- player/enemy starting state
- progression locks

Validation:
- node --check changed JS
- npm.cmd test
- npm.cmd run test:validation
- inspect output/cadence-obligation-audit/report.json
- inspect output/sim-frame-budget-qa/report.json
```
