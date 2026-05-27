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

## Latest completed slice

**First Night Shelter-Chain Truth Pass v0.**

- Replaced the misleading `visible` shelter claim with an explicit commander-known target contract and direct-visibility boundary.
- Removed completed objective shelters from Mouse's next offered choices and ranks the active objective shelter ahead of nearby support stops.
- Made the local-model example follow the current offered target, so a completed opening shelter cannot leak into a later decision.
- Added `npm.cmd run test:shelter-route`, which completes all five First Night objectives through real survival orders, including required route-support shelter stops.
- Extended `npm.cmd run test:mouse:live` to prove accepted first-shelter and follow-on dense-canopy commands.

## Recommended immediate next slice

**First Night consequence/readability v0.**

Why:

- The route is now commandable and mechanically provable end to end.
- The next visible payoff is making one existing decision point, preferably the crossing or final regroup, legible and consequential to the player.
- Keep survival objectives and command authority canonical; use existing cover, sound, visibility, or scenario-event truth rather than introducing parallel progress logic.

## Slice prompt skeleton

```txt
Implement First Night consequence/readability v0.

Scope:
- choose one existing shelter-route decision point, preferably the crossing or final regroup
- surface one readable gameplay consequence through current simulation/event ownership
- keep Mouse and player commands on the same commander-authority path

Must preserve:
- First Night five-objective scenario spine
- commander-known shelter target contract and direct-visibility honesty
- deterministic shelter-chain browser completion
- optional Mouse visibility with no direct simulation mutation

Validation:
- node --check changed JS
- npm.cmd test
- npm.cmd run test:mouse
- npm.cmd run test:shelter-route
- npm.cmd run test:mouse:live
- npm.cmd run test:validation
```
