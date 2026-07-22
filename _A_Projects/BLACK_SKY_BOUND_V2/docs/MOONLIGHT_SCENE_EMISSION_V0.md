# Moonlight Scene Emission v0

This slice adds a world-owned moonlight scene emission object without turning darkness into a bright ambient wash.

## Truth Flow

```text
src/data/sceneLights.js
  -> game.sceneLights
  -> buildSceneLightViews(...)
  -> buildLightProjection(...)
  -> light-space culling + occlusion shadow projection
  -> WebGLLightingLayer
```

The moonlight is not an ECS actor component, player aura, camera-follow light, cloud sprite, or gameplay visibility rule. It is a fixed world-space scene light with a large radius, low cool intensity, and explicit direction from an off-map source.

## Rendering Contract

- `moonlight_scene_emission` participates in the same renderer-neutral light packets as torches and napalm.
- Moonlight carries high-source shadow metadata so scene-object shadows read shorter than a horizon-adjacent source.
- The existing light-space culling and SDF-ready shadow field projection consume the moonlight, so explicit scene blockers and render-only actor silhouettes can cast moonlit shadows.
- WebGL draws moonlight before local torches, then applies world-space cloud attenuation bands only over the moonlight reveal.
- The cloud pass renders darkness/attenuation, not clouds. The map is procedural, scene-scaled, segmented, and morphing, so moonlight visibly crawls across the scene without ruler-straight cloud blockers.
- Cloud attenuation bands are anchored to a world-normal coordinate grid derived from the moonlight direction. The camera only selects the visible subset; it does not re-center the cloud pattern.
- Every radial light influence is anchored to a projected world entity, world effect object, or scene light. The renderer does not synthesize camera-centered reflected-light hints.

## Camera Anchoring Fix v1

`WebGLMoonlightOcclusion` now reports `world_anchored_moonlight_cloud_attenuation_v1` and `anchorPolicy: "world_normal_coordinate_grid_not_camera_centered"`.

The fix prevents the cloud light blocker from following the player camera:

- Band coordinates are chosen from global world-space normal coordinates, not from the current camera center.
- Edge ripple and width noise use world-space distance along the moonlight direction, so the organic cloud shape does not reset when the viewport moves.
- Existing SDF moonlight shadow packets remain screen-space render packets, but their kernel positions move by the camera transform because they are derived from world blockers and the fixed moonlight source.

## World-Source-Only Fix v2

The former moonlight bounce registers were centered on `camera.visibleWorldBounds(...)`. Although subtle, they were camera-following light primitives and violated the world-source rule, so their data, projection, rendering, diagnostics, and runtime text fields were removed.

The live source contract is now explicit:

- ECS emitters use `sourceAnchor.type: "world_entity"`.
- persistent world effects such as napalm pools use `sourceAnchor.type: "world_effect_object"`.
- authored scene emissions use `sourceAnchor.type: "scene_light"`.
- cloud attenuation may use the camera to select visible world geometry, but it emits no light of its own.

## Validation

Covered by:

```powershell
node tests\moonlightSceneEmission.test.mjs
node tests\lightingFoundation.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\occlusionShadowFoundation.test.mjs
node tests\locBudget.test.mjs
```

Browser proof should inspect `render_game_to_text()` for:

- `sceneLights[0].sourceKind: "moonlight_scene_emission"`
- `rendererLayerStats.lighting.moonlightCloudPrimitiveCount > 0`
- every `lightViews[*].sourceAnchor.type` names a world or scene source
- shadow field packets whose `lightId` is `moonlight`
- `artifacts/moonlight-world-anchored-clouds-v1/proof.mjs` for the camera-pan regression

## Deferred

This is not full ray tracing, texture-backed cloud shadows, physical global illumination, per-object normal lighting, or a weather simulation. Those can build on this scene-light projection path later.
