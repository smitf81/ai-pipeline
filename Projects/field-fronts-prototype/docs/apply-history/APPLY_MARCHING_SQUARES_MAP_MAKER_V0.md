# Apply Report — Marching Squares Map Maker v0

## Goal
Add a focused marching-squares visual projection for the map maker so land/water boundaries can render as smoother continuous contours instead of only softened tile blobs.

## Scope discipline
This pass is visual-only and map-maker-only.

It does **not** change:
- tile data ownership
- gameplay pathfinding
- unit movement
- structure joinery
- collision/nav blockers
- logistics/supplies
- battle simulation behaviour

Tile data remains canonical. Marching squares is a derived visual projection.

## Files changed
- `src/rendering/marchingSquares.js`
- `src/rendering/canvasRenderer.js`
- `tests/marchingSquares.test.mjs`
- `tests/runInProcessTests.mjs`

## What landed
- New marching-squares helper module.
- Land/water scalar field derived from the existing tile grid:
  - `sea` / `river` = `0`
  - all other terrain = `1`
  - threshold = `0.5`
- Full 16-case marching-squares segment generation.
- Deterministic saddle-case handling for cases 5 and 10.
- Contour segment stitching into paths.
- Optional Chaikin smoothing for contour paths.
- Map-maker-only coastline contour overlay drawn above the terrain buffer.
- Dev-only raw segment toggle support via `MAP_MAKER_MARCHING_SQUARES_DEBUG_RAW` or `state.showRawMarchingSquares`.

## Renderer behaviour
In Map Maker mode only, the renderer now draws a derived coastline contour layer after the terrain buffer and before tactical/game overlays.

The layer uses:
- a dark grounding stroke
- a muted sand/shore stroke
- a fine highlight stroke

This should make coastlines and river/land boundaries read more as continuous contours while leaving the underlying tile renderer intact.

## Validation run
Focused checks passed:

```txt
node --check src/rendering/canvasRenderer.js
node --check src/rendering/marchingSquares.js
node --check tests/marchingSquares.test.mjs
node -e "import('./tests/marchingSquares.test.mjs').then(m=>m.run())"
node -e "import('./tests/editorModel.test.mjs').then(m=>m.run())"
node -e "import('./tests/structureJoinery.test.mjs').then(m=>m.run())"
node -e "import('./tests/structureTopology.test.mjs').then(m=>m.run())"
node -e "import('./tests/gameModel.test.mjs').then(m=>m.run())"
node -e "import('./src/rendering/canvasRenderer.js').then(()=>console.log('renderer import ok'))"
```

`npm test` still times out in the full in-process runner after the already-passing early tests, matching the known existing full-runner timeout pattern rather than a marching-squares failure.

## Marching-squares tests added
- all-water field produces no contours
- all-land field produces no contours
- single land tile in water produces a closed contour
- diagonal saddle case produces deterministic two-segment output
- straight coastline stitches into one connected path
- output is deterministic
- smoothing preserves closed loops

## Known limitations
- This pass only contours land/water boundaries.
- It does not yet vectorise mountains, forests, influence fields, or territory regions.
- It draws contours as strokes, not filled terrain polygons.
- It does not replace tile-authoritative gameplay data.
- It will not fully solve all rounded-square terrain aesthetics until terrain regions themselves are rendered as filled polygon projections or higher-resolution scalar fields.
