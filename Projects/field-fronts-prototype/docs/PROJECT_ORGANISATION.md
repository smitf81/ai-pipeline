# Project Organisation

## Root folder policy

The root should stay small and launchable:

- `README.md`
- `progress.md`
- `package.json`
- `index.html`
- `styles.css`
- `run-game.cmd`
- `run-local.cmd`
- `src/`
- `tests/`
- `tools/`
- `data/`
- `assets/`
- `docs/`
- `artifacts/`

Historical apply notes, generated screenshots, old browser logs, and agent pack duplicates should not live loose in root.

## Runtime ownership

| Concern | Owner | Notes |
|---|---|---|
| Terrain/map truth | `src/world/mapModel.js`, `src/config/terrain.js` | Renderer must not invent terrain authority. |
| Scenario authored entities | `src/world/sceneEntity.js`, `src/world/scenario*` | Cover placements are authored here, then consumed by simulation. |
| Movement truth | `src/game/movementSystem.js` plus orchestration in `gameModel.js` | Route generation still needs future extraction. |
| Combat truth | `src/game/combatSystem.js` | Targeting must respect cover detection via dependency hook. |
| Corpse/body-wall truth | `src/game/corpseSystem.js` | Renderer draws corpse stacks from this source. |
| Cover/stealth truth | `src/game/coverSystem.js` | One canonical stealth state per field unit. |
| Construction/logistics | `src/game/constructionSystem.js`, `src/game/logisticsSystem.js` | No instant magic build authority in UI. |
| Rendering | `src/rendering/canvasRenderer.js` | Visual cues only; no local gameplay truth. |
| HUD/UI | `src/ui/gameUI.js`, `src/ui/components.js` | Display simulation state; do not decide it. |
| QA | `tests/`, `tools/`, `src/qa/` | Tests are the validation authority for slices. |

## Current folder cleanup performed

- Moved root `APPLY_*.md` files into `docs/apply-history/`.
- Moved the agent orientation pack into `docs/agent-orientation/`.
- Moved the packed orientation zip into `docs/archives/`.
- Moved historical generated QA screenshots/reports into `artifacts/qa-output/`.
- Moved historical Chromium GPU log into `artifacts/logs/`.
- Removed duplicate root `frontline.png`; `tests/frontline.png` remains where tests expect it.
- Removed empty HTTP server log files.

## What should happen next time

- New slice handover docs go into `docs/apply-history/`.
- New verification reports go into `docs/verification/`.
- Generated screenshots/reports can be produced under `output/` during a run, then archived to `artifacts/qa-output/` if worth keeping.
- Do not add new top-level folders unless they are source, data, docs, assets, tests, tools, or artifacts.
