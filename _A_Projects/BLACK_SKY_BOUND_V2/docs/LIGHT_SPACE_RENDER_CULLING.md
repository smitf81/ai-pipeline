# Light-Space Render Culling v1

## Purpose

This slice makes light bubbles part of the render budget instead of using darkness only as a final visual mask.

The rule is:

```txt
ECS light views
  -> derived light-space screen regions
  -> render layers skip or clip expensive detail outside those regions
  -> lighting/darkness still composites as the final visibility layer
```

This is render-only. It does not change enemy awareness, player stealth, collision, targeting, damage, or simulation truth.

## What changed

- Added a projection-owned light-space render gate in `src/projection/lightSpaceRenderCulling.js`.
- Added explicit budget policy in `src/data/renderBudgets.js`.
- Added diagnostics under `renderLayers.lightSpaceCulling`.
- Renderer derives one shared culling object per frame from active light views.
- Terrain draws a cheap base fill outside lit regions and skips full tile detail there.
- Decals are clipped to merged light regions.
- Non-player actor detail is downgraded to a cheap black shadow LoD outside light-space bounds; actors must not disappear while they can still damage the player.
- Effects, napalm visuals, and smoke sources are skipped when outside light-space bounds.
- The player wyvern remains visible even outside light regions for playability; this is not a player light emitter.
- Smoke/scatter now filters sources/lights by light-space overlap and clips low-resolution texture/composite work to the merged regions.

## Current limits

- The smoke textures are still viewport-sized low-resolution canvases; this pass reduces sources, draw coverage, and compositing regions, but it does not allocate per-region texture atlases yet.
- Atmospheric cadence remains every rendered frame; caching/rebuild cadence belongs in a later slice.
- SDF shadows are still out of scope until this render budget gate proves stable.

## Diagnostics

`getRenderLayerStats(...)` now exposes:

- `lightSpaceCullingPolicy`
- `lightSpaceMergedRegions`
- `lightSpaceCoverageRatio`
- `skippedTerrainTilesOutsideLight`
- `skippedActorsOutsideLight`
- `skippedEffectsOutsideLight`
- `skippedNapalmPoolsOutsideLight`
- `skippedNapalmDropletsOutsideLight`
- `culledSmokeSourcesOutsideLight`
- `webglActorShadowLodCount`
- `webglActorShadowLodPrimitiveCount`

These counters should move during play. If they stay at zero while lights cover only part of the viewport, the culling path has drifted.

## Validation

```bash
npm.cmd test
node -e "import('./src/app.js')"
```

Status: passing after implementation.
