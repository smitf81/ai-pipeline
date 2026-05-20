# QA Suite Map

Use this when deciding what to run before claiming a patch landed.

## Test ownership table

| Test file / command | What it protects | Main systems touched | Failure meaning | Agent response |
|---|---|---|---|---|
| `tests/editorModel.test.mjs` | Map/editor behaviour, paint/import/export, editor state | `src/editor`, `src/world/mapModel.js` | Map/editor contract regression | Fix editor/map seam; do not patch renderer first. |
| `tests/gameModel.test.mjs` | GameState, leaders, movement, economy, fields, serialisation | `src/game/gameModel.js`, `src/world/fields.js` | Runtime truth drift | Inspect GameState contract and recompute rules. |
| `tests/constructionJobs.test.mjs` | Placement, spending once, blueprint/job creation, builders, progress/completion | `gameModel`, `economy`, `structureRegistry`, `structureTopology` | Construction path broken | Do not paper over with UI-only fix. |
| `tests/collisionAuthority.test.mjs` | Movement blockage/separation authority | `collisionAuthority.js`, `structureTopology.js` | Units may phase/clip/block wrongly | Fix collision/topology authority. |
| `tests/structureRegistry.test.mjs` | Structure definitions, normalisation, serialisation | `structureRegistry.js`, `contracts.js` | Registry shape drift | Fix data definitions/contracts. |
| `tests/structureTopology.test.mjs` | Completed blockers, trenches as modifiers, gates, nav signatures | `structureTopology.js`, `gameModel.js` | Structures not affecting movement correctly | Fix topology, not renderer. |
| `tests/runtimePerformanceQa.test.mjs` | Runtime cadence, interpolation detachment, horde/chokepoint probes, structure topology metrics | `src/qa/runtimePerformanceQa.js`, `main.js`, `gameModel.js` | Performance/cadence regression | Profile before adding more work. |
| `tests/runInProcessTests.mjs` / `npm.cmd test` | Full in-process suite | all model/QA tests | Any model contract break | Required for most runtime patches. |
| `npm.cmd run test:browser` | Browser boot, UI click path, screenshots/state evidence | UI, renderer, static server, Playwright client | Browser integration/visual path broken | Inspect console and screenshots; don’t assume model tests are enough. |
| `node --check <changed JS>` | Syntax sanity | changed JS files | Dumb syntax error | Fix before anything else. Honestly, this should not be heroic. |

## Minimum validation by patch type

| Patch type | Required validation |
|---|---|
| Docs only | File existence/readability check. No runtime tests required unless docs include generated code snippets. |
| UI-only DOM text/layout | `node --check` changed JS + `npm.cmd run test:browser` if UI JS changed. |
| Rendering | `node --check src/rendering/canvasRenderer.js`, `npm.cmd test`, browser smoke/screenshots. |
| Editor placement | `node --check` editor/input/game files, `npm.cmd test`, browser smoke. |
| Economy/build purchase | `npm.cmd test`, with focus on `gameModel` + `constructionJobs`. |
| Construction jobs | `npm.cmd test`, specifically `constructionJobs`, `structureRegistry`, `structureTopology`. Browser smoke if UI path touched. |
| Movement/pathfinding | `npm.cmd test`, `collisionAuthority`, `structureTopology`, runtime performance QA. |
| Field/LoS/frontline | `npm.cmd test`, runtime performance QA, browser smoke/screenshots. |
| Collision/nav/structure topology | `npm.cmd test`, especially `collisionAuthority` and `structureTopology`. |
| Performance-sensitive runtime changes | `npm.cmd test`, inspect `output/runtime-performance-qa/report.json`, browser smoke if visible behaviour changed. |

## Expected Windows commands

Run from project root:

```powershell
npm.cmd test
```

Browser smoke:

```powershell
npm.cmd run test:browser
```

Syntax checks for changed JS:

```powershell
node --check src\game\gameModel.js
node --check src\rendering\canvasRenderer.js
node --check src\ui\components.js
```

Adjust file paths to whatever was changed. Don’t run checks against random files just for vibes.

## Runtime QA report interpretation

`output/runtime-performance-qa/report.json` is evidence. It is not automatic authority. Current known pattern:

- `status: warn` can be acceptable if warnings are understood.
- A horde/chokepoint warning means tick cost is near/over budget under load.
- High-risk findings should block performance-sensitive patches.
- Medium warnings should be reported honestly and not hand-waved.

## QA response discipline

When reporting validation, say:

```txt
Ran:
- command 1
- command 2

Result:
- pass/fail

Evidence:
- changed files
- tests passed
- warnings remaining

Not validated:
- anything I could not run
```

No “should work”. No “probably fine”. No “compiled in my aura”.
