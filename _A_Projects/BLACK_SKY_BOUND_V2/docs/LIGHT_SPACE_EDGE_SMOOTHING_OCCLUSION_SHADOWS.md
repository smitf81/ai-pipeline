# Light-Space Edge Smoothing + Occlusion Shadow Foundation v0

## Purpose

This slice keeps the Light-Space Render Culling v1 performance gate, but removes the obvious rectangular visual boundary it introduced.

It also keeps a cheap shadow-wedge foundation for future torch/napalm-style lights. The current pass now has a bounded WebGL consumer for the SDF-ready shadow-field bridge, but it still does not implement texture-backed SDF atlases, actor shadows, terrain-height shadows, gameplay line-of-sight, stealth, or full-screen ray casting.

## Edge smoothing

Light-space regions carry:

- `innerBounds` for full-detail rendering.
- `outerBounds` for hard render culling.
- `featherPx` for the transition band.
- `softness` for visual falloff.

Terrain, actors, effects, and napalm visuals still cull outside the outer bounds, but fade through the feather band before disappearing. The player wyvern remains readable even outside light-space detail gates.

Decals and smoke/scatter use a prepared feather mask instead of hard rectangular clips. Smoke still filters sources and contributing lights by light-space overlap; it does not return to unbounded full-viewport source work.

## Occlusion shadow v1

Shadow wedges are now projected from explicit physical occluder inputs only.

The current demo scene now supplies explicit tree and boulder scene objects as the first real occluder test cases. Painted floor/terrain tiles are still not shadow blockers.

The scene-object scale pass keeps literal physical size separate from the current cheap shadow math. The world-scale profile treats one movement tile as roughly half a meter; tree data records an 8m physical height, but the shadow projector receives a bounded gameplay-height scalar so the wedge remains readable instead of pretending to be a physically correct ray trace.

Accepted future blockers must be explicit objects with at least:

- `x`
- `y`
- `radius`
- `height` or `occlusionHeight`

Terrain remains visual/movement map data. It must not be promoted into height-bearing shadow truth just because a tile is dark, forest-coloured, rocky-looking, blocking, or obscuring.

For each active light, nearby explicit blockers are capped, then projected into a soft wedge away from the light. Each region now carries an `sdf_ready_anchored_shadow_field_v1` quality contract with direction, normal, contact radius, near/far widths, and length.

The projection also emits `black-sky-bound.render-shadow-field.sdf-ready.v1` packets. These are renderer-neutral derived shadow-field packets, not authored object truth. Each packet exposes a tapered capsule SDF kernel plus sampled field points. WebGL now consumes the kernel directly through `webgl_bounded_capsule_sdf_shadow_shader_v0`; scene-object blockers can emit multiple `scene_object_shadow_silhouette.v1` packets for trunk/crown lobes or boulder facets, while sampled points remain for diagnostics and CPU probes without re-mining blocker/light facts.

WebGL renders the shadow as an anchored contact patch, three fading core bands, a soft penumbra shell, and one bounded shader-evaluated tapered capsule field per accepted packet. Tree and boulder shadows originate at the physical base instead of reading as one flat translucent slab.

Shadow work is clipped to the active light-space region.

## Diagnostics

Render stats expose:

- `lightSpaceFeatherPx`
- `lightSpaceFeatheredCoverageRatio`
- `occlusionShadowEnabled`
- `occlusionBlockerPolicy`
- `occlusionMissingBlockerPolicy`
- `activeOcclusionBlockers`
- `droppedOcclusionBlockers`
- `shadowCastingLights`
- `approximateShadowRegions`
- `occlusionShadowsClippedToLightSpace`
- `occlusionShadowPolicy`
- `webglShadowContactTriangleCount`
- `webglShadowCoreTriangleCount`
- `webglShadowPenumbraTriangleCount`
- `webglShadowSegmentCount`
- `occlusionShadowFieldContract`
- `occlusionShadowFieldPacketCount`
- `occlusionShadowFieldSampleCount`
- `webglShadowFieldPacketCount`
- `webglShadowFieldSampleCount`
- `webglShadowFieldPrimitiveCount`
- `webglShadowSilhouettePrimitiveCount`
- `webglShadowShaderMode`
- `webglShadowShaderPacketCount`
- `webglShadowShaderPrimitiveCount`

Expected current scene values:

```json
{"activeOcclusionBlockers":6,"shadowCastingLights":">=1","approximateShadowRegions":">=1","webglShadowSegmentCount":">=3 per region","webglShadowFieldPrimitiveCount":">=3 per region"}
```

## Deliberately not implemented

- No terrain-tile shadows.
- No height map.
- No texture-backed or shader-evaluated SDF shadows yet.
- No actor shadows.
- No smoke blockers.
- No stealth or gameplay line-of-sight.
- No per-pixel full-screen ray casting.
- No blood/decals expansion.

## Validation

```powershell
npm.cmd test
node -e "import('./src/app.js')"
```

Direct projection probe after the scene-object foundation:

```json
{"blockerPolicy":"explicit_physical_occluder_entities_only","missingBlockerPolicy":"painted_terrain_has_no_height_no_shadows","currentBlockers":6,"shadowRegions":">=1"}
```

Rendered browser/playtest verification should be run through the project-local Playwright install.
