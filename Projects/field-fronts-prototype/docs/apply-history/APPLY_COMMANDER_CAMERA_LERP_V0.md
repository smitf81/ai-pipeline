# Commander Camera Lerp v0

## Goal
Smooth the 2D scenario camera when it follows the commander or selected unit, so camera movement feels deliberate rather than snapping between tick positions.

## What changed
- Added renderer-local camera smoothing in `src/rendering/canvasRenderer.js`.
- Commander and selected-unit camera modes now resolve against visual/interpolated entity positions when render motion exists.
- Full-scene and selected-point modes still snap intentionally.
- Resize, camera mode changes, zoom changes, and very large jumps snap instead of easing awkwardly across the map.

## Behaviour
- Commander-follow camera lerps towards its target offset.
- Selected-unit camera also benefits from the same follow smoothing.
- The smoothing is render-only and does not mutate map, pathfinding, movement, selection, combat, construction, or scenario state.

## Performance note
This does not add gameplay-side camera simulation. It lives inside the renderer viewport transform and uses the existing render loop/motion interpolation path.

## Validation
- `node --check` across `src/`, `tests/`, `tools`
- `npm test`
