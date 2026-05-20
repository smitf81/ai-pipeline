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
| Performance QA tightening | Make runtime cost warnings more actionable | `runtimePerformanceQa.js`, tests | No runtime behaviour change | `npm.cmd test` | Add thresholds, summaries, maybe per-system timings. |
| Future tech/progression modifiers | Add scalable modifiers for structures/units/research | `structureRegistry.js`, `gameModel.js`, economy docs/tests | No scattered magic constants | focused tests + `npm.cmd test` | Do after base construction loop is readable. |
| LoS / visibility v0 | Add first fog/vision layer | likely `fields.js`, `gameModel.js`, renderer | No full-map per-frame rays | runtime QA + browser smoke | High risk. Budget it before coding. |
| Supply route pressure | Make logistics matter spatially | `gameModel.js`, `fields.js`, economy docs | Supply contract remains expandable | `gameModel`, runtime QA | Keep it pressure-based first, not a full transport sim. |

## Recommended immediate next slice

**Blueprint visual language v1 + builder readability**, docs/tests aware.

Why:

- The construction job path now exists.
- The player needs to read planned vs under-construction vs complete at a glance.
- It is mostly rendering/UI, so less danger than deeper economy/pathfinding.
- It supports the “based/grounded” feel without making wall segments take three real-life business days.

## Slice prompt skeleton

```txt
Implement a narrow visual/readability pass for construction state.

Scope:
- improve blueprint and under-construction visuals
- optionally expose selected builder/job summary in existing UI
- no construction logic rewrite
- no new structure types
- no economy changes
- no performance-heavy per-frame field work

Must preserve:
- supplies spent once on placement commit
- construction job progression over simulation ticks
- completed structure topology activation
- trench as movement modifier not blocker

Validation:
- node --check changed JS
- npm.cmd test
- npm.cmd run test:browser if UI/rendering changed
```
