# Scenario Camera Controls v0

## Scope
Adds a 2D-only camera authoring layer to Scenario Creator. This sits above Map Maker and does not alter terrain, passability, pathfinding, construction maths, or game simulation state.

## What changed
- Scenario layers now carry a `cameraRig` object.
- Scenario Creator UI now exposes variable 2D camera controls:
  - Full Scene
  - Commander Unit
  - Selected Unit
  - Selected Point
- Added camera zoom control for non-full-scene modes.
- Added authoring buttons:
  - Set Point From Tile
  - Focus First Beat
  - Preview Camera Cue
  - Reset Full Scene
- Renderer now applies the camera rig by changing viewport tile size and offsets only.
- Screen-to-tile input still uses the renderer view transform, so painting, placement, selection and movement commands remain aligned.

## Camera rig shape
```js
{
  mode: 'full_scene' | 'commander' | 'selected_unit' | 'selected_point',
  zoom: number,
  point: { x, y } | null,
  followEntityId: string | null,
  cueId: string | null
}
```

## Design notes
- Full Scene behaves like the previous camera: fit the whole map into the available canvas area.
- Commander follows the player commander/leader if available.
- Selected Unit follows the currently selected game entity if available.
- Selected Point centres on an authored tile with adjustable zoom.
- Viewport offsets are clamped so high zoom does not pan the map into nonsense off-screen space.

## Validation
- `node --check` across `src/`, `tests/`, `tools/`
- `npm test`

## Not included yet
- 3D camera rails
- timeline sequencing
- cinematic cuts between multiple cues
- runtime story trigger camera playback

Those can come later once the authoring rig proves useful.
