# Pre-Playtest Stabilisation v0

## Goal
Prepare Chapter 1 for an actual playtest by making launch/reset/readability/performance controls obvious before adding more systems.

## What changed

### Play Chapter 1 flow
- Main menu now presents **Play Chapter 1** instead of the vaguer Continue Mission card.
- Added playtest launch/restart event handlers:
  - `playtest:start-chapter`
  - `playtest:restart-chapter`
  - `playtest:random-seed`

### Compact playtest HUD
- Added a small in-game playtest HUD showing:
  - FPS/frame timing
  - active scenario
  - commander state
  - latest command response
  - weather quality/effective mode
  - AI debug state

### Weather render quality controls
- Added `src/game/playtestStabilization.js`.
- Weather quality modes:
  - Off
  - Low
  - Medium
  - Cinematic
- Default remains **Medium**.
- Weather can automatically step down when frame budget is poor.
- Added Map Clarity Mode to reduce weather opacity/dimming/rain/lightning while keeping gameplay readable.

### Render budget caps
- Storm cloud cells, rain intensity, lightning count, and scenario effects now respect playtest render settings.
- Visual weather can animate, but field recomputation remains cadenced/cached.
- No weather work was moved into `gameModel.js` per tick.

### Route/intent readability
- Painted path anchors are now tracked through `routeFeedback`.
- Dragged paths show intermediate anchor dots.
- Player-intended movement orders keep anchor markers visible while active.

### Playtest controls
- HUD buttons:
  - Weather quality cycle
  - Map clarity toggle
  - Restart Chapter
  - AI debug toggle
- Keyboard shortcuts while in-game:
  - `R` restart chapter
  - `W` cycle weather quality
  - `C` toggle clarity mode

## Files changed
- `src/game/playtestStabilization.js`
- `src/editor/editorState.js`
- `src/input/pointerController.js`
- `src/main.js`
- `src/rendering/canvasRenderer.js`
- `src/ui/gameUI.js`
- `styles.css`
- `tests/playtestStabilization.test.mjs`
- `tests/runInProcessTests.mjs`

## Validation
- `node --check` across `src/`, `tests/`, `tools` passed.
- `npm test` passed.
- Static HTTP smoke served `index.html` and `src/main.js` successfully.
- `npm run test:fps:sim` completed with WARN: avg `13.216ms`, p95/worst `64.135ms`.

## Notes
This is intentionally a stabilisation/readability pass. No pathfinding maths, combat, construction, economy, scenario spine, or AI behaviour logic was redesigned.
