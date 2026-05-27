# Apply: Weather Render Budget + Visibility v1.1

## Purpose
Hotfix the Weather Visual Coherence v1 pass after playtest showed two problems:

- the cloud layer tanked frame rate because it rendered layered gradients/lobes per weather tile
- the clouds visually overpowered the map and repeated like stamped objects

## What changed

### 1. Storm render cells are now capped/coarsened
Added `selectStormRenderCells()` in `src/rendering/weatherVisuals.js`.

Instead of drawing every qualifying weather tile, the renderer now samples weather fields into larger storm render cells and caps the visible cloud masses.

This keeps the weather field systemic while stopping the render layer from becoming thousands of radial gradients.

### 2. Clouds are dialled down
Cloud opacity, electric bloom, terrain dimming, and rain density were reduced so the map remains readable.

Clouds should now feel like an atmospheric layer above the board, not a blue-black blanket over the whole game.

### 3. Cloud repetition reduced
Each storm render cell now uses deterministic variation for:

- lobe count
- lobe size
- ellipse rotation
- drift offset
- rim-highlight strength

This should reduce the obvious stamped-object look.

### 4. Lightning reduced
Lightning now defaults to one active event at a time with a higher threshold.

Forked lightning is preserved, but it should no longer spam the scene.

## Performance rule preserved
No weather field recomputation was moved into `gameModel.js` per tick.

Weather fields remain cached/cadenced. This pass only reduces render workload and visual intensity.

## Files changed

- `src/rendering/weatherVisuals.js`
- `src/rendering/canvasRenderer.js`
- `tests/weatherVisuals.test.mjs`

## Validation

- `node --check` across `src/`, `tests/`, and `tools` passed
- `npm test` passed
- `npm run test:fps:sim` completed with WARN: avg 12.725ms, p95/worst 61.282ms

The sim frame-budget warning is not visual-render proof, but it is included honestly. Browser visual FPS capture is still not available in this sandbox.
