# Storm Lightning Scene Flash v0

This slice adds storm lightning as a world-owned scene-light scheduler. Flashes are not screen overlays: each active flash becomes a renderer-neutral light view with a scene origin, large radius, high-source shadow metadata, and a short burnoff envelope.

## Truth Flow

```text
src/data/sceneLights.js
  -> game.sceneLights
  -> buildSceneLightViews(...)
  -> buildLightProjection(...)
  -> light-space culling + occlusion shadow projection
  -> WebGLLightingLayer
```

## Rendering Contract

- `storm_lightning` owns a deterministic semi-random scheduler with event intervals clamped to 20-40 seconds.
- Each event can produce a 1-3 flash cluster with uneven intra-cluster spacing.
- Active flashes use `lightning_scene_flash` light views, retain scene origin metadata, and feed the same SDF-ready shadow-field projection as torches and moonlight.
- The initial flash is bright and scene-wide; the afterimage burnoff is a decaying light register, so it still participates in scene lighting and shadow truth instead of becoming a fake full-screen wash.
- Moonlight now carries high-source shadow tuning so moon shadows read shorter, while the cloud blocker uses segmented morphing attenuation ribbons rather than straight bands.

## Validation

Covered by:

```powershell
node tests\lightningSceneFlash.test.mjs
node tests\moonlightSceneEmission.test.mjs
npm test
```

Browser proof should inspect `render_game_to_text()` and projection state for:

- active `lightning_scene_flash` light views near strike time
- `stormEvent.origin`
- `flashStage: "initial_flash"` and later `flashStage: "afterimage_burnoff"`
- shadow field packets whose `lightId` is the active lightning flash id

## Deferred

This is not procedural lightning bolt rendering, thunder audio, weather gameplay, real volumetrics, or physically correct global illumination. The current contract establishes scene-owned flash lighting and shadow participation first.
