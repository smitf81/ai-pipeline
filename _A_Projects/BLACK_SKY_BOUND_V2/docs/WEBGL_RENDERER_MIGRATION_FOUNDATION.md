# WebGL Renderer Migration Foundation

> Historical migration record. Its darkness-overlay passages describe the retired renderer. Current lighting ownership is defined by [Illumination-Primary Rendering v1](./ILLUMINATION_PRIMARY_RENDERING.md).

## Current decision

WebGL is now the default runtime backend.

Normal app boot uses the canonical `webgl` backend and its real layer hierarchy:

```txt
http://127.0.0.1:5177/
```

The explicit WebGL route selects the same backend:

```txt
http://127.0.0.1:5177/?renderer=webgl
```

or:

```js
localStorage.setItem('bsb.rendererBackend', 'webgl')
```

`canvas2d`, `canvas`, and `2d` renderer requests are no longer supported.

Canvas 2D runtime rendering was culled in Canvas 2D Renderer Cull v1. The browser `<canvas>` element remains because WebGL renders into it; the Canvas 2D renderer, backend, render layers, and selection flags are no longer live project architecture.

## What changed in Slice 2

The first WebGL candidate was a full-scene Canvas texture presenter. That bridge has been replaced as the active WebGL path.

The WebGL backend now owns:

- scene/root setup: `src/render/backends/webgl/WebGLSceneRoot.js`
- camera setup and resize: `src/render/backends/webgl/WebGLCamera2D.js`
- layer registration: `src/render/backends/webgl/WebGLRenderLayerRegistry.js`
- renderer orchestration: `src/render/backends/webgl/WebGLGameRenderer.js`
- per-layer stats: `src/render/backends/webgl/WebGLRenderStats.js`
- real layers for terrain, scenery, decals/ground hazards, actors, effects, lighting, fog/smoke, post-process, and HUD/debug
- a WebGL-owned post-process render target and final shader composite: `src/render/backends/webgl/WebGLPostProcessPipeline.js`

The renderer-neutral projection builder lives in:

```txt
src/projection/renderProjection.js
```

It emits these visual categories:

- lightingProfile
- terrain
- scenery
- actors
- projectiles
- effects
- decals
- groundHazards
- lights
- lightSpaceCulling
- occlusionShadows
- shadowBlockers
- fogSmoke
- postProcess
- hud
- debug

Projection packets describe visual facts. They do not create WebGL objects and do not mutate gameplay state.

## What changed in WebGL Lighting Live Wiring v1

`WebGLLightingLayer` now renders a profile-backed darkness/visibility pass instead of the earlier hardcoded light cutout pass.

The renderer-neutral projection now carries existing lighting/emitter facts into WebGL:

- `lightingProfile` from `src/data/lightingProfiles.js`;
- light radius, intensity, colour, inner colour, softness, source kind, render time, and flicker fields from emitter views;
- deterministic resolved flicker intensity/radius values;
- live `lightSpaceCulling` projection data for bounded WebGL render-detail gating;
- `occlusionShadows` projection data from explicit scene-object blockers, rendered as cheap WebGL screen-space wedges plus bounded SDF shadow-field shader primitives.

The lighting layer consumes only projection packets and camera bounds:

- it draws a camera-aligned dark world overlay using profile `darknessColour` and `darknessOpacity`;
- it draws a soft warm outer light plus a smaller warm core per source light;
- it uses profile `lightRevealStrength` and `warmBloomOpacity` for WebGL compositing;
- it renders after terrain, actors, and effects so darkness affects the WebGL-owned scene;
- it reports active light count, influence primitive count, flickering light count, profile id, darkness mode, and live occlusion wedge status through renderer diagnostics.

The mode is:

```txt
profiled_flicker_light_cutouts_v2
```

This is still not a full shadow/bloom parity pass. It makes existing lighting, emitter data, and explicit scene-object shadow wedges live in WebGL without restoring Canvas rendering or inventing a new visual truth path.

## What changed in WebGL Atmospheric Recovery v1

The first WebGL smoke and lighting passes were migration scaffolds. This slice keeps the same renderer-neutral projection packets, but makes their WebGL interpretation less flat:

- `WebGLLightingLayer` expands each projected light into an atmospheric halo, a soft outer reveal, and a warm core.
- Explicit occlusion wedges now render as anchored falloff geometry: a blocker contact patch, three fading core bands, and a soft penumbra shell.
- The shadow projection now also emits `black-sky-bound.render-shadow-field.sdf-ready.v1` packets: tapered capsule-kernel data plus sampled field points derived from the same explicit blocker/light facts.
- `WebGLLightingLayer` consumes those packets as bounded screen-space tapered-capsule SDF primitives without adding a texture-backed SDF atlas or full-screen ray-casting pass.
- Scene-object blockers now carry `scene_object_shadow_silhouette.v1` profiles. Trees emit trunk/crown-lobe SDF packets and boulders emit faceted stone SDF packets, so one physical blocker can produce several bounded SDF primitives.
- `WebGLLightingLayer` now applies profile-owned `light_shadow_attenuation_blend_v0` composite controls: softer light halos, SDF penumbra gamma, shadow/light blend strength, contact density, far-tail fade, radius scale, and tail taper.
- `WebGLFogSmokeLayer` breaks each projected smoke source into layered soft plume radials instead of one flat disc.
- Overlapping projected lights add bounded warm scatter radials inside smoke.
- Runtime layer diagnostics expose smoke primitive count, scatter primitive count, and contributing scatter light count through `rendererLayerStats.fogSmoke`.

The smoke mode is:

```txt
layered_lit_plume_smoke_v1
```

The shadow mode is:

```txt
webgl_bounded_capsule_sdf_shadow_shader_v0
```

The shadow/light composite mode is:

```txt
light_shadow_attenuation_blend_v0
```

This is the bounded scene-object SDF implementation for the current WebGL path. It renders one screen-space tapered-capsule SDF primitive per accepted `black-sky-bound.render-shadow-field.sdf-ready.v1` packet, and compound scene-object silhouettes can emit multiple packets per shadow region. It preserves the existing contact/core/penumbra geometry only as anchored mass, and it does not reintroduce Canvas 2D rendering, full-scene Canvas upload, texture-backed SDF atlases, terrain-height shadows, actor rig shadows, or full-screen ray casting.

## What changed in Grounded Scene Object Scale v0

The scene-object pass now has an explicit scale profile in:

```txt
src/data/worldScale.js
```

The current scale contract is:

- one movement/composition tile reads as roughly `0.5m`;
- the fresh hatchling reference is `1m` body plus `1m` tail, or about four tiles nose-to-tail;
- trees use a 2x2 coarse trunk/root collision footprint and a 6x7 visual crown footprint;
- boulders use a 2x2 collision footprint and a slightly larger visual silhouette;
- terrain tile size remains unchanged.

Projection keeps collision and visual scale separate: `widthTiles` / `heightTiles` describe the coarse movement blocker, while `visualWidthTiles` / `visualHeightTiles` and world visual bounds describe what WebGL draws. Trunk/base layering and behind-tree sorting are intentionally deferred to the next scene-object pass.

## What changed in Raider Humanoid Projection v0

Raiders now have a renderer-neutral humanoid projection profile instead of rendering as torch-only actor markers.

The canonical pieces are:

- `src/data/humanoids/raiderHumanoid.js` for the top-down stick-figure profile, scale metadata, simple collision policy, deferred shadow policy, torch socket data, palette, and raider-only tuning fields;
- `src/systems/humanoidProjectionSystem.js` for gait phase, head/torso/limb/hand/foot points, visual bounds, and torch-hand/flame sockets;
- `src/projection/renderProjection.js` for `renderer_neutral_humanoid_visual_projection` packets;
- `src/render/backends/webgl/WebGLHumanoidSilhouette.js` for WebGL mesh generation;
- `src/render/backends/webgl/layers/WebGLActorLayer.js` for consuming raider humanoid packets alongside the existing wyvern silhouette.

Torch light views now bind to the projected `torch_flame_socket` when a raider has a solved humanoid projection. Gameplay collision remains the actor's simple circular collider; detailed limb collisions and a full body-shadow pass remain deferred.

Renderer diagnostics expose:

```txt
raiderHumanoidMode: raider_top_down_articulated_humanoid_v1
raiderHumanoidSilhouetteActive
raiderHumanoidPartCount
raiderHumanoidTorchSocketCount
```

## What changed in WebGL HUD/Debug Overlay v0

`WebGLHudDebugLayer` now renders a compact WebGL-owned HUD/debug overlay after the scene layers.

The layer consumes projection HUD/debug packets and renderer diagnostics:

- player HP and enemy count;
- objective/message text;
- bite/lunge/smoke cooldown readiness;
- projected light/effect/smoke counts;
- flickering light count, light-space culling count, and scaffolded occlusion region count;
- WebGL backend health tag;
- darkness render timing from the prior renderer frame.

Text is drawn with a small WebGL pixel-font helper, not Canvas text, DOM text, or a full-scene upload. The mode is:

```txt
projection_debug_text_v0
```

## What changed in Player Wyvern Silhouette Parity v0

`WebGLActorLayer` now replaces the generic player marker with a WebGL-owned grounded wyvern silhouette.

The player actor packet carries a renderer-neutral `wyvernProjection` payload with:

- recipe id and body plan;
- grounded locomotion marker;
- body/head/neck/chest/hips/tail point chain;
- wing-forelimb anatomy, including wrist/claw digit origin;
- long wing digit offsets and low flank/hip membrane attachment;
- hind-leg anatomy;
- palette and proportion facts.

The WebGL mesh is built in:

```txt
src/render/backends/webgl/WebGLWyvernSilhouette.js
```

The mode is:

```txt
player_wyvern_silhouette_v0
```

This is not a full Canvas port, animation pass, or general actor polish pass. Enemies remain simple secondary markers.

## What changed in Procedural Motion + Action State Foundation v0

The player wyvern now projects live procedural pose data before WebGL builds its mesh.

The new motion path is:

```txt
ECS MotionState + ActionState + LimbRig + WyvernProjection
  -> wyvernProjectionSystem
  -> ProceduralPose
  -> renderProjection.wyvernProjection.proceduralPose
  -> WebGLWyvernSilhouette
```

`BITE_CLAW` starts `bite_attack`, which projects the head/neck forward and opens the jaw. `BODY_LUNGE` starts the v0 `claw_swipe_attack` pose foundation, which leads from the wing-forelimb wrist and sweeps across the body front. The follow-up contact slice resolves player attack damage from active projected contact windows instead of immediate invisible radius checks.

The mode remains:

```txt
player_wyvern_silhouette_v0
```

The silhouette now consumes a renderer-neutral `proceduralPose` packet for body, forelimb, hind-leg, jaw, contact anchor, socket, phase bucket, and cache-key data. The renderer does not own gait timing, action timing, or gameplay motion truth.

More detail lives in:

```txt
docs/PROCEDURAL_MOTION_ACTION_STATE_V0.md
docs/PHYSICS_INFORMED_WYVERN_ATTACK_V0.md
```

## What changed in WebGL Post-Process Pipeline v0

`WebGLGameRenderer` now renders the WebGL scene into a WebGL-owned framebuffer before the scene reaches the screen.

The final composite is owned by:

```txt
src/render/backends/webgl/WebGLPostProcessPipeline.js
```

`WebGLPostProcessLayer` remains in the existing layer order and now runs the final fullscreen shader pass. The first effect is deliberately small:

```txt
mild_vignette_v0
```

This is a migration slice, not a polish slice. It proves that the WebGL backend owns render-target setup, framebuffer resize, scene texture sampling, and final shader compositing without Canvas filters, Canvas text, or full-scene Canvas texture upload.

## What changed in WebGL Fog/Smoke Visibility Scaffold v0

`WebGLFogSmokeLayer` now renders a WebGL-owned layered smoke/scatter pass instead of the first flat visibility scaffold.

The layer consumes only renderer-neutral `fogSmoke` projection packets and camera bounds:

- it caps visible fog/smoke sources at `32`;
- it culls packets outside expanded camera bounds;
- it converts each visible packet into a bounded set of layered alpha-blended plume primitives;
- it emits additive warm scatter primitives when projected lights overlap smoke density;
- it renders after lighting/darkness and before the final post-process composite;
- it reports source count, primitive count, mode, active status, and render timing through renderer diagnostics.

The mode is:

```txt
layered_lit_plume_smoke_v1
```

This is not Canvas smoke/scatter parity yet. It proves that smoke/fog data can reach WebGL through projection and render through the owned WebGL layer/post-process path without Canvas texture upload.

## What changed in WebGL Liquid Ground Hazard Decals v1

`WebGLDecalLayer` gives persistent ground visuals and existing hazard pools an explicit WebGL-owned layer.

The layer consumes only renderer-neutral `decals` and `groundHazards` projection packets:

- `decals` currently represent existing cached scorch/stain stamp facts;
- `groundHazards` currently project existing napalm pool facts, including liquid material and shape metadata;
- it caps visible sources at `96`;
- it culls packets outside expanded camera bounds;
- it converts visible packets into alpha-blended radial world primitives;
- it renders after terrain and before actors/effects/lighting;
- it reports source count, primitive count, liquid-pool primitive count, hot-spot primitive count, mode, active status, and render timing through renderer diagnostics.

The mode is:

```txt
liquid_ground_hazard_decal_v1
```

Napalm pools now use `residual_liquid_napalm_pool_v1` and `irregular_low_pool` projection metadata. WebGL composes each visible pool from a low-alpha scorch/rim/body base, offset liquid lobes, and a bounded set of small hot flecks. The local light remains a warm glow; the pool shape is carried by the decal layer instead of by a bright emission orb.

This is not a full texture decal system yet. It proves that material-specific ground residue can reach WebGL through projection and stay world-aligned without Canvas rendering or texture upload, setting up the same route for later blood spatter and pooling.

## What is genuinely WebGL-owned now

The canonical `webgl` backend renders through `WebGLRenderLayerRegistry`. It is the only supported runtime renderer.

Currently active WebGL-owned drawing:

- `WebGLTerrainLayer` renders visible terrain tile rects from projection packets.
- `WebGLDecalLayer` renders bounded `liquid_ground_hazard_decal_v1` decal and napalm-pool liquid residue primitives from projection packets.
- `WebGLActorLayer` renders simple actor markers from projection packets.
- `WebGLEffectLayer` renders minimal effect/projectile markers.
- `WebGLLightingLayer` renders the `profiled_flicker_light_cutouts_v2` darkness overlay and warm flickering radial light influence regions.
- `WebGLHudDebugLayer` renders a compact status/debug overlay with WebGL screen-space primitives.
- `WebGLActorLayer` renders the player as a grounded wyvern mesh while keeping enemies as simple markers.
- `WebGLFogSmokeLayer` renders bounded `layered_lit_plume_smoke_v1` smoke/fog and warm scatter radials from projection packets.
- `WebGLPostProcessPipeline` renders the scene into an internal framebuffer and composites it to the screen through `WebGLPostProcessLayer`.
- `WebGLSceneryLayer` renders meter-scaled explicit tree and boulder scene objects from projection packets.
- `WebGLLightSpaceGate` applies the projection-owned light-space feather gate to scenery, secondary actor, effect, decal/hazard, and fog/smoke detail. Terrain base tiles remain visible outside the gate.
- `occlusionShadows` is projection-live in WebGL and renders SDF-ready anchored screen-space shadow fields from explicit scene-object blockers.

No registered WebGL visual layer is purely pending/noop after this slice, though several are still intentionally primitive migration scaffolds rather than parity-complete effects.

## Canvas 2D renderer cull

The old Canvas 2D renderer path has been removed from active source:

- no Canvas 2D backend is registered;
- `?renderer=canvas`, `?renderer=canvas2d`, and `?renderer=2d` are unsupported renderer requests;
- the old Canvas render loop branch has been removed;
- `src/render/layers/*`, `src/render/lightSpaceMask.js`, and `src/render/uiOverlay.js` were removed from live source;
- historical Canvas-only polish is not a fallback path.

Future visual work should target WebGL. Any desired historical Canvas-only polish must be reimplemented in WebGL rather than restoring the Canvas 2D runtime.

## Full-scene texture upload status

The active WebGL backend no longer uploads the full Canvas scene every frame.

Runtime diagnostics show:

- `rendererActiveBackend: "webgl"`
- `rendererMode: "real_layers"`
- `canvas2dRuntimeAvailable: false`
- `hiddenCanvasRenderLoopActive: false`
- `rendererFullSceneTextureUploadActive: false`
- `rendererLegacyCompositeActive: false`
- `rendererTextureUploads: 0`
- `webglLayerOrder: ["terrain", "scenery", "decals", "actors", "effects", "lighting", "fogSmoke", "postProcess", "hudDebug"]`
- `webglMigrationCoverageStatus: "webgl_only_canvas2d_renderer_culled"`
- `webglDarknessLayerActive: true` in the WebGL path
- `webglLightCount: <active projected light count>`
- `webglDarknessRenderMs: <lighting layer render timing>`
- `webglDarknessMode: "profiled_flicker_light_cutouts_v2"`
- `webglLightingProfileId: "early_night"`
- `webglLightingInfluenceCount: <expanded soft light primitive count>`
- `webglFlickeringLightCount: <lights with live flicker>`
- `webglLightSpaceCullingActive: true`
- `webglLightSpaceCulledCount: <detail packets skipped by the WebGL light-space gate>`
- `webglLightSpaceMode: "webgl_light_space_render_detail_gate_v0"`
- `webglOcclusionShadowMode: "webgl_bounded_capsule_sdf_shadow_shader_v0"`
- `webglOcclusionShadowRegions: <projected shadow wedge count>`
- `webglShadowContactTriangleCount: <anchored contact patch triangles>`
- `webglShadowCoreTriangleCount: <segmented core falloff triangles>`
- `webglShadowPenumbraTriangleCount: <soft shell triangles>`
- `webglShadowSegmentCount: <shadow core distance bands>`
- `webglShadowFieldPacketCount: <SDF-ready shadow field packets>`
- `webglShadowFieldSampleCount: <sampled shadow field points>`
- `webglShadowFieldPrimitiveCount: <active SDF shadow-field shader primitives>`
- `webglShadowSilhouettePrimitiveCount: <active scene-object SDF silhouette primitives>`
- `webglShadowShaderMode: "webgl_bounded_capsule_sdf_shadow_shader_v0"`
- `webglShadowCompositeMode: "light_shadow_attenuation_blend_v0"`
- `webglShadowBlendStrength: <profiled shadow/light blend strength>`
- `webglShadowFieldEdgeSoftness: <profiled SDF edge softening>`
- `webglShadowFieldPenumbraGamma: <profiled SDF penumbra alpha curve>`
- `webglShadowFieldTailFloor: <profiled far-tail shadow fade floor>`
- `webglShadowLightHaloBlendScale: <profiled light halo blend scale>`
- `webglShadowShaderPacketCount: <SDF-ready packets accepted by the shader path>`
- `webglShadowShaderPrimitiveCount: <bounded tapered-capsule SDF quads rendered>`
- `webglDecalLayerActive: true` when decal or ground-hazard projection packets are visible
- `webglDecalMode: "liquid_ground_hazard_decal_v1"`
- `webglDecalSourceCount: <visible projected decal/hazard sources>`
- `webglDecalPrimitiveCount: <rendered decal/hazard primitives>`
- `webglDecalRenderMs: <decal layer render timing>`
- `webglHudLayerActive: true` in the WebGL path
- `webglHudLineCount: 5`
- `webglHudRenderMs: <HUD layer render timing>`
- `webglHudMode: "projection_debug_text_v0"`
- `webglPlayerWyvernSilhouetteActive: true`
- `webglPlayerWyvernPartCount: <semantic wyvern part count>`
- `webglActorRenderMs: <actor layer render timing>`
- `webglActorMode: "player_wyvern_silhouette_v0"`
- `webglPostProcessActive: true` in the WebGL path
- `webglPostProcessMode: "mild_vignette_v0"`
- `webglPostProcessRenderMs: <post-process layer render timing>`
- `webglPostProcessPassCount: 1`
- `webglPostProcessRenderTargetActive: true`
- `webglFogSmokeLayerActive: true` when fog/smoke projection packets are visible
- `webglFogSmokeMode: "layered_lit_plume_smoke_v1"`
- `webglFogSmokeSourceCount: <visible projected smoke/fog sources>`
- `webglFogSmokePrimitiveCount: <rendered smoke/fog primitives>`
- `webglFogSmokeRenderMs: <fog/smoke layer render timing>`

## Failure behavior

If WebGL is selected by default or explicitly requested and cannot initialize, diagnostics report:

- `rendererActiveBackend: "webgl"`
- `rendererBackendStatus: "error"`
- `rendererFallbackReason: "webgl_initialization_failed"`
- `rendererInitializationError: <error>`
- `canvas2dRuntimeAvailable: false`
- `webglMigrationCoverageStatus: "webgl_boot_error_no_renderer_fallback"`

The renderer does not silently recover through another renderer.

If a removed renderer is requested, diagnostics report:

- `rendererActiveBackend: "unsupported_renderer"`
- `rendererBackendStatus: "error"`
- `rendererFallbackReason: "unsupported_renderer_backend"`
- `rendererRequestedBackend: <requested renderer>`
- `rendererInitializationError: "Renderer ... is unsupported. Canvas 2D runtime rendering was culled; use renderer=webgl."`
- `canvas2dRuntimeAvailable: false`
- `webglMigrationCoverageStatus: "unsupported_renderer_request_no_canvas2d_runtime"`

## Validation

```powershell
npm test
node -e "import('./src/app.js')"
```

Canvas 2D Renderer Cull v1 browser validation at `1280 x 720` covers:

| Path | Active backend | Mode | Texture uploads | Expected status |
| --- | --- | --- | ---: | ---: |
| Default route | `webgl` | `real_layers` | `0` | active, about `0.629ms` manual tick |
| Explicit WebGL | `webgl` | `real_layers` | `0` | active, about `0.563ms` manual tick |
| Removed Canvas 2D request | `unsupported_renderer` | `unsupported_renderer` | `0` | error |

Latest WebGL renderer diagnostics:

- `rendererTotalRenderMs: about 0.3`
- `renderTotalMs: about 0.5`
- `webglDarknessLayerActive: true`
- `webglLightCount: 5`
- `webglDarknessRenderMs: 0.0`
- `webglDarknessMode: "profiled_flicker_light_cutouts_v2"`
- `webglLightingProfileId: "early_night"`
- `webglLightingInfluenceCount: 10`
- `webglFlickeringLightCount: 5`
- `webglLightSpaceCullingActive: true`
- `webglLightSpaceMode: "webgl_light_space_render_detail_gate_v0"`
- `webglOcclusionShadowMode: "webgl_bounded_capsule_sdf_shadow_shader_v0"`
- `webglOcclusionShadowRegions: <projected shadow wedge count>`
- `webglShadowContactTriangleCount: <anchored contact patch triangles>`
- `webglShadowFieldPrimitiveCount: <active SDF shadow-field shader primitives>`
- `webglShadowShaderPrimitiveCount: <bounded tapered-capsule SDF quads rendered>`
- `webglDecalLayerActive: true`
- `webglDecalMode: "liquid_ground_hazard_decal_v1"`
- `webglDecalSourceCount: 6`
- `webglDecalPrimitiveCount: <expanded decal/hazard primitive count>`
- `webglDecalRenderMs: 0.0`
- `webglHudLayerActive: true`
- `webglHudLineCount: 5`
- `webglHudRenderMs: 0.0`
- `webglHudMode: "projection_debug_text_v0"`
- `webglPlayerWyvernSilhouetteActive: true`
- `webglPlayerWyvernPartCount: 22`
- `webglActorRenderMs: 0.0`
- `webglActorMode: "player_wyvern_silhouette_v0"`
- `webglPostProcessActive: true`
- `webglPostProcessMode: "mild_vignette_v0"`
- `webglPostProcessRenderMs: 0.0`
- `webglPostProcessPassCount: 1`
- `webglPostProcessRenderTargetActive: true`
- `webglFogSmokeLayerActive: true`
- `webglFogSmokeMode: "layered_lit_plume_smoke_v1"`
- `webglFogSmokeSourceCount: 6`
- `webglFogSmokePrimitiveCount: 6`
- `webglFogSmokeRenderMs: 0.0`
- `rendererFullSceneTextureUploadActive: false`
- `rendererTextureUploads: 0`
- `canvas2dRuntimeAvailable: false`
- `webglMigrationCoverageStatus: "webgl_only_canvas2d_renderer_culled"`
- layer order: `terrain`, `scenery`, `decals`, `actors`, `effects`, `lighting`, `fogSmoke`, `postProcess`, `hudDebug`

Screenshots:

- Default WebGL: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-default-promotion-v0-default.png`
- Explicit WebGL: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-default-promotion-v0-explicit-webgl.png`
- Canvas 2D Renderer Cull v1 default WebGL: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-only-cull-v1-default.png`
- Canvas 2D Renderer Cull v1 explicit WebGL: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-only-cull-v1-explicit-webgl.png`
- Removed Canvas 2D request diagnostic: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-only-cull-v1-unsupported-canvas2d.png`
- Shared web-game client state proof: `C:\Users\felix\AppData\Local\Temp\bsb-web-game-client-default-promotion-v0\state-1.json`
- Shared web-game client cull state proof: `C:\Users\felix\AppData\Local\Temp\bsb-web-game-client-canvas2d-cull-v1\state-1.json`
- WebGL layers: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-darkness-v0-smoke.png`
- WebGL HUD/debug: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-hud-debug-v0-final.png`
- WebGL player wyvern silhouette: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-player-wyvern-silhouette-v0-final.png`
- WebGL post-process pipeline: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-post-process-v0-smoke.png`
- WebGL fog/smoke scaffold: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-fog-smoke-v0-smoke.png`
- WebGL decal/ground-hazard scaffold: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-decal-hazard-v0-smoke.png`

Headless Chromium timings are not treated as the desktop frame-rate baseline. The useful result is architectural: WebGL is now drawing through owned layers with no full-scene upload.

The shared web-game client also passed against the default route and confirmed `rendererActiveBackend: "webgl"`, `canvas2dRuntimeAvailable: false`, `webglPostProcessRenderTargetActive: true`, and `rendererTextureUploads: 0` after an input burst. Its canvas-element screenshot remains black because that generic client captures WebGL canvases through the known `preserveDrawingBuffer: false` limitation; the project-specific page screenshots above are the visual proof.

## Next recommended renderer slice

Migration expansion is intentionally stopped here. The next renderer work should be WebGL-first feature work, not another Canvas parity sweep.

Recommended next slice:

1. Keep WebGL as the only runtime renderer.
2. Add one small WebGL layer visibility diagnostic toggle or a tiny hit/damage feedback scaffold, but do not add bloom chains yet.
3. Keep the neutral projection contract unchanged.
4. Compare screenshots and per-layer timings.
5. Reimplement any desired historical Canvas-only polish in WebGL.

Do not reintroduce the Canvas 2D renderer or a full-scene Canvas upload.
