# Progress Log

Original prompt: Inside BLACK_SKY_BOUND_V2_ATMOSPHERIC_SCATTER_SMOOTHING_v1, shouldn't we still be getting a lot more headway from only needing to render what's in our light bubbles?

## 2026-07-31 - Tree trunk/root structural reconstruction (complete)

Current request:

- Treat the referenced Tree Mesh Fix conversation as the acceptance brief: replace the apparent half-shell trunk and intersecting triangular roots with a coherent, closed, economical low-poly trunk/root form, then prove it from isolated and gameplay views rather than applying a cosmetic smoothing pass.

Pre-change audit:

- Documented the active tree DNA -> spatial recipe -> scenery projection -> Three.js factory/cache path in `docs/TREE_MESH_RENDERING_BASELINE.md` before editing tree geometry.
- Confirmed the apparent half trunk is caused by reversed sweep winding: the first ancient-oak trunk face points inward (`radial dot = -0.609177`) and is culled by the normal front-side material.
- Confirmed roots are individually capped six-sided tubes that begin inside the trunk. They are closed components, but their hidden caps/intersections create the visible spike assembly instead of one root plate.
- Locked the existing reference-grove baseline at 9 calls and 11,354 triangles for three trees; reported CPU render-path p95 is 0.8-1.4 ms and browser GPU timer queries are unavailable.

Implementation and validation:

- Rejected the first welded polar root-plate prototype after screenshots still read as a starfish skirt; the completed path polygonises trunk, roots and major branches as one deterministic implicit manifold.
- Replaced disconnected capped sweeps with one indexed outward-wound woody surface. All three species report one component, zero boundary/non-manifold/degenerate faces and positive signed volume.
- Preserved trunk-circle hard collision, root-only soft traversal slowdown, renderer-neutral projection, one bark draw, per-tree instanced foliage, shadows, full-signature caches and explicit disposal.
- Added isolated front/rear/left/right root views, full canopy-hidden, wireframe, normal-shaded and normal gameplay proof. The 12-view Playwright report contains zero console, page or request errors.
- Ancient oak is now 1,764 bark vertices / 3,524 triangles / one woody component, versus 744 / 1,376 / 28 components. The three-tree grove remains 9 calls and measures 17,698 triangles with 0.7-0.9 ms CPU p95.
- Generation medians are 18.232/7.766/13.581 ms cold and 0.338/0.166/0.309 ms cached for pine/birch/oak respectively.
- Live-world proof passed at 209 calls, 112,418 triangles, 6.5 ms CPU p95 and 7.745 ms GPU p95. The isolated stress rerun passed at 16.6/16.8 ms frame-interval p95 for DPR 1/1.5 with zero long frames; one preceding machine-DPR run transiently measured 20.8 ms and is recorded in the report.
- Full unit, collision, scene-object, line-count, reference-browser, live-world, stress, production-build and packaged-browser gates pass. See `docs/TREE_MESH_FIX_REPORT.md`.

## 2026-07-31 - Three-material terrain foundation (complete)

Current request:

- Replace the flat-looking active Three.js floor with a coherent, performant layered material foundation for dark wild grass, compacted dirt/path, and scorched earth while preserving Map Forge terrain IDs, collision/gameplay semantics, batching, deterministic detail placement, and illumination-led art direction.

Pre-change audit and baseline:

- Documented the complete Map Forge -> runtime-map tile ID -> terrain definition/material profile -> renderer-neutral projection -> static 3D compiler -> ThreeLiveWorld instanced-box path in `docs/TERRAIN_MATERIAL_RENDERING_BASELINE.md` before changing terrain source or assets.
- Confirmed the active renderer has no tilesheet/atlas or PBR maps. It issues one instanced draw per terrain type using constant-colour `MeshStandardMaterial`; default box UVs are currently irrelevant because no maps are bound.
- Confirmed the retired legacy WebGL terrain layer contains a cached procedural colour texture and 16-mask dirt boundary experiment, but it is unreachable from the default Three.js backend.
- Captured and visually inspected the locked Playwright baseline under `artifacts/terrain-material-v1/baseline/`: 155 calls, 130,168 triangles, 2.4 ms manual render-path p95, 8.816 ms GPU p95, and zero browser errors at 1440x900 DPR 1.

Implementation boundary:

- Derive renderer-only textures, blend masks, and detail scatter from canonical IDs; do not add biome/gameplay truth to Map Forge or runtime JSON.
- Use seamless same-density procedural PBR layers and a renderer-owned splat mask rather than a decorative tile atlas.
- Keep non-target terrain on its current presentation path and avoid displacement.

Implementation progress:

- Added three explicit material-layer definitions and deterministic periodic PBR texture-array generation. Base colour, OpenGL normal, and packed roughness/AO/height layers share 128x128 dimensions, 1.6 m world scale, repeat wrapping, trilinear mipmaps, and anisotropy.
- Replaced the three separate target terrain batches with one shared instanced plane batch. A renderer-only 8-pixels-per-tile organic contour mask uses rounded cores, path/region capsules, multi-scale domain warp, variable shoulders, and edge lobes without changing authored tile IDs.
- Kept forest, water, and rock on their prior instanced `MeshStandardMaterial` path. Blocked rock collision and raised presentation remain unchanged.
- Added deterministic sparse grass clumps with one 30-triangle reusable tapered-blade geometry, static-object/spawn/escape exclusions, dirt/scorch clearance, natural-feature and forest/rock boundary bias, density tuning, distance culling, and one draw call.
- Added F6 lit/material-ID/normal-only cycling, F7 detail toggle, F3 grass cull-bounds/count reporting, runtime methods for browser proof, and explicit magenta diagnostic rendering for missing material data.
- Final reference-gated browser proof is error-free. At the clear material camera detail off/on measures 123/124 calls, 130,432/139,522 triangles, and 8.768/8.886 ms GPU p95; 303 visible clumps add exactly 9,090 triangles. Full unit, LOC, fixed-camera browser, stress, production-build, and packaged-browser gates pass.
- Recorded asset provenance in `docs/TERRAIN_MATERIAL_ASSET_PROVENANCE.md`; there are no external assets or external licences in this slice.

## 2026-06-15 — GCD anchor

Created the focused Black Sky Bound GCD:

- top-down 2D action survival;
- young dragon player;
- tooth, claw, smoke, speed, escape;
- dragonfire as later payoff;
- no stealth, flight, base-building, strategy, morale, or complex fire sim for first playable.

## 2026-06-15 — Dragon survival pivot v0

Pivoted the stripped husk toward the GCD:

- controllable young dragon;
- raider/husk/werewolf pressure actors;
- tooth/claw, lunge, smoke;
- escape-zone win and overwhelmed loss;
- preserved 16-mask blob terrain rules;
- removed stale RTS docs from the package.

## 2026-06-15 — ECS foundation v1

Refactored gameplay state out of the actor/state monolith into a lightweight ECS:

- added `src/ecs` world, query, event, interface, and system runner modules;
- added enum-like constants for components, entity kinds, factions, damage types, ability ids, status effects, and events;
- added component factories and data-driven actor/ability definitions;
- split behaviour into input, movement, combat, smoke, enemy pressure, health, lifetime, scenario, and view-sync systems;
- kept `src/game/state.js` as a thin compatibility facade;
- preserved renderer/test compatibility via derived actor/smoke/effect views;
- added ECS foundation test coverage.

Validation:

```bash
npm test
```

Status: passing.

## 2026-06-15 — ECS foundation four-slice completion

Finished the originally intended four-slice foundation instead of stopping at the first structural split:

- hardened ECS v1 with explicit `systemOrder`, debug snapshots, world validation, and architecture tests;
- moved scenario setup into `src/data/scenarios.js` so map setup, enemy spawns, escape zone, and authored terrain blobs are data-driven;
- moved enemy AI tuning into actor data rather than leaving damage/ranges hidden in systems;
- preserved 16-mask ruled blob painting and rebuilt all blob masks through a single map helper;
- improved first-playable readability with dragon silhouette, enemy silhouette differences, cooldown HUD, escape hint, and ECS validation warning;
- kept docs lean and updated architecture/next-slice notes around the ECS methodology.

Validation:

```bash
node -e "import('./src/app.js')"
npm test
```

Status: passing.

## 2026-06-15 — Launcher and end-of-day handover

Added a proper local launcher/wrapper so tomorrow's session can start with a playtest instead of setup friction:

- `LAUNCH_BSB.bat` for simple Windows double-click launch;
- `LAUNCH_BSB.ps1` as a PowerShell alternative;
- `tools/launch.mjs` as a dependency-free Node static server that opens `http://127.0.0.1:5177`;
- changed `npm start` to use the launcher instead of relying on Python's `http.server`.

Updated documentation for end-of-day continuity:

- added `docs/HANDOVER_2026-06-15.md`;
- updated `README.md` with fast launch instructions;
- updated `docs/START_HERE.md` to include tomorrow's reading order;
- updated `docs/NEXT_SLICES.md` to start with manual playtest hardening;
- updated `docs/TESTING_AND_QA.md` with launcher/manual QA checks.

Tomorrow's recommended first action:

1. Launch with `LAUNCH_BSB.bat`.
2. Manual playtest once.
3. Record the first three obvious gameplay/readability problems.
4. Fix only those before adding anything new.

Validation:

```bash
node -e "import('./src/app.js')"
npm test
```

Status: passing.

## 2026-06-16 — Render Layer Foundation v1

- Split the renderer into named layer modules: terrain, decals, atmosphere, actors, effects, HUD orchestration.
- Added data-owned visual recipes in `src/data/visualRecipes.js`.
- Added render budgets in `src/data/renderBudgets.js`.
- Added projection-owned render layer state in `src/projection/renderLayerState.js`.
- Added a cached decal canvas layer skeleton so persistent marks can be stamped and composited instead of kept as live effects forever.
- Converted bite, lunge, and smoke burst visuals to route through `spawnVisualRecipe(...)`.
- Added caps for live effects, smoke clouds, and decal stamps.
- Added render-layer diagnostics into debug snapshots.

## 2026-06-16 — FPS Tracker + Pause Control v1

- Added surfaced FPS/frame-time readout in the top-right HUD.
- Added Escape/Tab pause input, with Tab/Escape browser defaults suppressed so the game keeps focus.
- Pause currently freezes simulation updates while the render loop continues, allowing the pause icon/FPS surface to remain visible.
- Added a simple top-right pause icon only; no menu, no UI toggle, no settings surface.
- Added focused tests for performance diagnostics and pause input behaviour.

Validation:

```bash
npm test
```

Status: passing.

## Grounded Wyvern Player Projection v1

- Replaced the placeholder player dragon visual with a grounded baby wyvern projection.
- Added `WyvernProjection` as projection-owned state on the single player gameplay entity.
- Added `creatureProjections.js` with a four-limb grounded wyvern hatchling recipe.
- Added `wyvernProjectionSystem` to maintain body/tail chain positions and gait projection state.
- Updated actor rendering so the player draws as a low grounded wyvern with wing-forelimbs, hind legs, body chain, tail and faint eye glints.
- Preserved constraints: no player light emitter, no fog, no trails, no attacks/special animation state, no per-part collision.
- Added focused tests in `tests/wyvernProjection.test.mjs`.
- Validation: `npm test` passed.

## Grounded Wyvern Wing Anatomy Correction v1.1

- Corrected the first wyvern silhouette pass after it read too much like a centipede.
- Added explicit wing-forelimb anatomy to the creature recipe:
  - shoulder
  - elbow
  - wrist/claw grounded contact
  - digit spars
  - digit knuckles
  - connected webbing membrane
- Replaced stick-triangle wings with connected membrane + bone/joint rendering.
- Added a cheap two-bone IK-style projection solve for shoulder → elbow → wrist/claw placement.
- Reduced frantic wing motion and kept ordinary locomotion as grounded crawling, not flapping.
- Shortened body/tail segment spacing and connected the torso silhouette to reduce bead/centipede readability.
- Preserved constraints: one player gameplay entity, no per-limb collision, no player LightEmitter, no trails, no attacks/state-machine pass.

Validation:

```bash
npm test
```

Status: passing.

## Grounded Wyvern Wing Membrane & Crawl Correction v1.2

- Lengthened the wyvern wing digits so the silhouette reads as folded batlike wings rather than short insect legs.
- Reworked the wing membrane to attach down the body/flank near the hip area.
- Added faint membrane tension folds from the body anchor to the digit tips.
- Made the wrist/claw contact point visibly lead the grounded crawl with alternating forward reach and outward bracing.
- Kept the correction projection-only: no extra entities, no per-limb collision, no player LightEmitter, no trails, and no attack/state-machine pass.
- Slightly reduced player movement speed/gait cadence so the crawl visual has more weight.
- Added focused assertions for long wing digits, low membrane anchor, and visible wrist-led crawl data.

Validation:

```bash
npm test
```

Status: passing.

## Grounded Wyvern Wing Joint-Origin Correction v1.3

- Corrected the wing rendering so visible digit spars clearly originate from the wrist/claw hub rather than visually appearing to grow from the low body/flank membrane anchor.
- Added explicit anatomy metadata for `digitOrigin`, `membraneFoldOrigin`, and `bodyAttachmentRole`.
- Added a body/chest-to-shoulder connector, then preserved the shoulder → elbow → wrist/claw → digit knuckle chain.
- Reworked membrane tension folds so they are subtle surface lines from the wrist/claw area, not fake bones from the hip.
- Preserved the low flank/hip membrane attachment and grounded wrist-led crawl.
- Kept the correction projection-only: no extra entities, no per-limb collision, no player LightEmitter, no trails, and no attack/state-machine pass.

Validation:

```bash
npm test
```

Status: passing.

## Grounded Wyvern Folded Digit Readability v1.4

- Separated the folded wing digit fan so the visible tips no longer collapse into one shared triangular path.
- Expanded the wing recipe from three to four visible wrist-origin digit spars.
- Added distinct lateral/back offsets for each digit tip so the leading edge, support digits, and lower trailing digit read as separate folded membrane points.
- Added subtle membrane-tip marks and scalloped membrane curves between tips without over-highlighting the bones.
- Kept digit lines lower contrast so they read as anatomy inside the membrane rather than UI strokes.
- Increased wrist/claw stride and slightly slowed gait cadence so each crawl plant has a clearer reach.
- Preserved constraints: one player gameplay entity, no per-limb collision, no player LightEmitter, no trails, no attacks/state-machine pass.

Validation:

```bash
npm test
```

Status: passing.

## Grounded Wyvern Hind Leg Relationship v1.5

- Reworked hind legs from simple rear strokes into explicit hip → knee → ankle/foot projected limbs.
- Added hind-leg recipe data for spread, step length, IK-style segment lengths, foot size, and girth.
- Used a cheap two-bone projection solve for hind legs, keeping them data-driven and bounded rather than a hidden physics sim.
- Preserved the four-limb wyvern rule: wing-forelimbs remain the front limbs; hind legs are the rear support limbs.
- Increased hind-foot spread and step reach so the gait reads less like tiny shuffling taps and more like a weighted crawl/push.
- Kept the pass projection-only: no limb colliders, no extra entities, no player LightEmitter, no trails, and no attack/state-machine work.

Validation:

```bash
npm test
```

Status: passing.

## Wyvern Projection Partition v1

- Formalised grounded wyvern projection into dedicated data, kinematics, and render modules.
- Moved grounded wyvern hatchling recipe to `src/data/creatures/groundedWyvernHatchling.js`.
- Added shared creature projection maths in `src/projection/creatures/creatureKinematics.js`.
- Split wyvern drawing into focused modules under `src/render/layers/wyvern/`.
- Kept the player as one gameplay entity; limbs remain projection-only.
- Added `tests/wyvernPartition.test.mjs` to guard the data/code split and prevent duplicated IK glue from creeping back into limb renderers.

## Wyvern Napalm Dribble Foundation v1

Added the first player-owned visual emitter chain without introducing a generic player light aura.

- Added a formal `NapalmDripEmitter` component to the player wyvern.
- Added a wyvern mouth projection socket.
- Added bounded live napalm droplets from the mouth socket.
- Landed droplets now become active napalm pools.
- Napalm pools stamp cached scorch decals.
- Active napalm pools contribute small warm lights through the existing lighting view seam.
- Added napalm render-layer diagnostics and budget caps.
- Added `docs/NAPALM_DRIBBLE_FOUNDATION.md` and `tests/napalmDribble.test.mjs`.

Kept out deliberately: smoke, embers, volumetrics, fire spread, damage, player fire-breath control, trails beyond the napalm pool chain.

## Smoke Field + Light Interaction v1

- Tuned wyvern napalm pools smaller while making their light emission brighter.
- Added `smokeFields.js` profile data for low-night smoke projection.
- Replaced main-canvas smoke blob drawing with a low-resolution smoke density texture pass.
- Added base smoke + warm light-scatter pass clipped by smoke density.
- Smoke now relates to existing light views, including raider torches and napalm pool lights.
- Added render diagnostics for active smoke sources, contributing lights, texture passes, and render mode.
- Added focused smoke-field lighting tests.
- Kept out: volumetrics, SDF shadows, bloom, fire spread, smoke damage, and gameplay visibility rules.


## Unified Smoke Sources v1

- Added formal smoke source recipes in `src/data/smokeSources.js`.
- Added `src/projection/smokeLayerState.js` to build one bounded source list from dragon smoke clouds, napalm pools, and torch LightEmitters.
- Renderer now consumes `game.smokeSources` instead of treating only `game.smokeClouds` as density inputs.
- Napalm pools now smoulder into the same smoke field.
- Raider torches now contribute small smoke wisps to the same smoke field.
- Smoke diagnostics now include source policy, per-kind source counts, and dropped source count.
- Added `tests/unifiedSmokeSources.test.mjs`.

Kept out: no fire spread, no smoke damage, no stealth/visibility rules, no SDF shadows, no true volumetrics.

## Atmospheric Light Scatter v1

- Added a density-texture/light-buffer scatter composite for smoke.
- Added cheap bloom-ish scatter glow around bright light overlapping dense smoke.
- Raider torches and napalm pool lights now make nearby smoke feel visibly lit in the air.
- Kept this as 2D compositing only: no true volumetrics, no SDF shadows, no fog gameplay, no blood yet.
- Added atmospheric scatter diagnostics and focused tests.



## Atmospheric Scatter Smoothing v1

- Added bounded smoothing for atmospheric scatter/bloom textures.
- Enabled high-quality canvas smoothing on smoke field offscreen layers and final scatter upscaling.
- Removed extra one-pixel slice overdraw from the distorted smoke/scatter draw path to reduce horizontal seam brightening under screen compositing.
- Added faint stable dither to break visible low-res banding.
- Exposed scatter smoothing policy/pass count in render diagnostics.
- Added `docs/ATMOSPHERIC_SCATTER_SMOOTHING.md`.
- Validation: `npm test` passes.

## Light-Space Render Culling v1

- Added a projection-owned light-space render gate derived from active ECS light views.
- Added render budget policy and diagnostics for expanded light-bounds culling.
- Renderer now builds one shared culling object per frame and passes it through terrain, decal, actor, effect, napalm, and smoke layers.
- Terrain detail, decals, non-player actor detail, effects, napalm visuals, and smoke/scatter source contribution are skipped or clipped outside expanded light regions.
- Player wyvern rendering remains visible outside light regions for playability; this is render-only and not a player light emitter or stealth rule.
- Smoke/scatter now filters off-light sources/lights and clips low-resolution texture/composite work to merged light regions.
- Added `docs/LIGHT_SPACE_RENDER_CULLING.md` and `tests/lightSpaceRenderCulling.test.mjs`.

Validation:

```bash
npm.cmd test
node -e "import('./src/app.js')"
```

Status: passing.

## Light-Space Edge Smoothing + Occlusion Shadow Foundation v0

Current request: implement a narrow combined slice for light-space edge smoothing plus bounded occlusion shadow foundation.

- Extended light-space render culling with `innerBounds`, `outerBounds`, `featherPx`, `softness`, and feathered coverage diagnostics.
- Kept the hard budget gate outside outer bounds while fading terrain, non-player actors, effects, and napalm visuals through the feather band.
- Added a prepared feather mask for cached decals and smoke/scatter textures so hard rectangular clips are no longer the visible transition.
- Initially added terrain-derived occlusion blockers; this was corrected later because painted floor tiles have no height and trees/rocks must become explicit entities.
- Added cheap soft shadow wedges that subtract from the light buffer before darkness compositing.
- Kept shadows clipped to light-space regions and render-only: no actor shadows, player shadows, smoke blockers, stealth, gameplay LoS, or SDF.
- Added `docs/LIGHT_SPACE_EDGE_SMOOTHING_OCCLUSION_SHADOWS.md`.
- Added focused tests in `tests/occlusionShadowFoundation.test.mjs` and expanded `tests/lightSpaceRenderCulling.test.mjs`.

Validation:

```powershell
npm.cmd test
node -e "import('./src/app.js')"
```

Direct projection probe:

```json
{"lights":2,"raw":2,"merged":1,"coverage":0.422,"feathered":0.534,"featherPx":44,"blockers":96,"shadowLights":2,"shadowRegions":20,"clipped":true,"status":"superseded_by_explicit_blocker_correction"}
```

Status: tests and module load passing. Rendered Playwright proof is blocked because `C:\Users\felix\.codex\skills\develop-web-game\scripts\web_game_playwright_client.js` cannot import the missing `playwright` package in this environment.

## Post-Process Pipeline Ownership v1

Current request: keep post-processing, but centralise it so render layers do not each become their own post-processing pipeline.

- Added `src/render/layers/postProcessLayer.js` as the single renderer-owned final polish stage.
- Renderer now runs post-process after lighting/atmosphere and before HUD.
- Added `RENDER_BUDGETS.postProcess` with balanced low-resolution bloom, final softening, dither, exposure placeholder, and ownership policy.
- Added `renderLayers.postProcess` diagnostics plus `getRenderLayerStats(...)` fields for policy and pass counts.
- Rerouted atmospheric scatter bloom/smoothing policies to `delegated_to_post_process_pipeline`.
- Removed atmosphere-owned bloom canvas, soften canvas, scatter smoothing helper, stable dither helper, and bloom/smoothing/dither knobs from the smoke field profile.
- Added `docs/POST_PROCESS_PIPELINE_OWNERSHIP.md`.
- Added `tests/postProcessPipeline.test.mjs` and updated atmospheric scatter tests to guard the ownership boundary.

Kept out: no quality menu UI, no gameplay visibility rules, no new shadow model, no true volumetrics.

## Occlusion Shadow Blocker Truth Correction v1

Current correction: painted forest/rock terrain tiles were incorrectly treated as shadow blockers even though the scene has no tree/rock entities and no tile height data.

- Removed terrain-map sampling from `src/projection/occlusionShadowState.js`.
- Shadow projection now consumes `game.occlusionBlockers`, which is currently an empty explicit blocker list.
- Added `buildExplicitOcclusionBlockers(...)` so future tree/rock entities can project shadows only when they provide position, radius, and height/occlusionHeight.
- Changed the render budget policy to `explicit_physical_occluder_entities_only`.
- Added `missingBlockerPolicy: painted_terrain_has_no_height_no_shadows`.
- Updated lighting to pass explicit blocker state rather than `state.map`.
- Updated tests to prove painted terrain maps produce zero blockers while explicit height-bearing blockers still produce cheap shadow wedges.
- Updated the occlusion-shadow docs and README to remove the stale terrain-blocker claim.

Expected current scene truth: zero occlusion blockers, zero shadow-casting lights, zero shadow wedges. The shadow wedge machinery stays ready for real physical occluder entities later.

Validation:

```powershell
npm.cmd test
node -e "import('./src/app.js')"
```

Direct projection probe:

```json
{"occlusionBlockers":0,"policy":"explicit_physical_occluder_entities_only","missingPolicy":"painted_terrain_has_no_height_no_shadows","activeBlockers":0,"shadowLights":0,"shadowRegions":0}
```

Rendered Playwright fallback proof:

- Used project-local `playwright` because the shared `.codex` web-game client still resolves packages from `.codex` and cannot import the project-local install.
- Served `http://127.0.0.1:5187/`.
- Advanced gameplay with `window.advanceTime(...)`.
- `window.render_game_to_text()` reported 5 lights, 6 smoke sources, 0 occlusion blockers, 0 active occlusion blockers, 0 shadow-casting lights, and 0 approximate shadow regions.
- Canvas probe sampled 4/4 nonblank points.
- Console/page errors: none.
- Screenshot: `C:\Users\felix\AppData\Local\Temp\bsb-shadow-correction-playwright.png`.

Next safe shadow slice: add real tree/rock entities or an `OcclusionBlocker` component/list with height data, then feed that explicit source into `game.occlusionBlockers`. Do not re-enable terrain-tile inference.

## WebGL Renderer Migration Foundation v1

Current request: use the new performance audit to choose the next slice, with special attention to whether the renderer architecture should migrate toward WebGL/Three.js without losing the current 60-70fps feel.

- Read `docs/Audits/Game Performance Optimization.pdf`.
- Added an explicit renderer backend seam in `src/render/backends/renderBackend.js`.
- Kept Canvas 2D as the default backend because it is the proven runtime path.
- Added a WebGL composite candidate backend that can be tested with `?renderer=webgl`.
- The WebGL candidate uses the visible canvas as a WebGL presentation surface while existing Canvas 2D render layers draw into an internal scene canvas.
- Added explicit runtime diagnostics for preferred backend, candidate backend, active backend, fallback reason, WebGL context, texture uploads, activation policy, and migration policy.
- Added per-phase render timings so future dips identify terrain, lighting, smoke, post-process, HUD, or backend-present cost.
- Added a terrain world cache with visible-range blitting and light-space feather masking, replacing the old every-frame full-map terrain scan path.
- Added `docs/WEBGL_RENDERER_MIGRATION_FOUNDATION.md`.
- Added `tests/rendererMigration.test.mjs`.

Important performance finding:

- Headless Chromium is slow for both Canvas and WebGL here, so its FPS is not treated as the user's desktop baseline.
- Relative timing still matters: WebGL candidate rendered correctly but added about `12.6ms` in `backendPresentMs` because it uploads the full scene texture each frame.
- The largest measured cost remains the existing Canvas post-process blur path (`renderPostProcessMs`), not terrain.
- Therefore WebGL is real but opt-in until a shader-owned post-process pass can beat Canvas total frame cost.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Canvas default: no console/page errors, 4/4 nonblank canvas samples, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-default-final-renderer-smoke.png`.
- WebGL candidate: no console/page errors, active `WebGL2RenderingContext`, 4/4 nonblank canvas samples, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-candidate-final-renderer-smoke.png`.

Next recommended renderer slice:

1. Keep Canvas default.
2. Move central post-process behind the backend interface.
3. Implement WebGL-owned shader post-process for the candidate path.
4. Compare `renderPostProcessMs`, `renderBackendPresentMs`, total render time, and screenshots before promoting WebGL.

## WebGL Renderer Foundation Slice 2

Current request: replace the WebGL composite bridge with the first real WebGL-owned rendering hierarchy while keeping Canvas default and keeping gameplay state renderer-agnostic.

- Added renderer-neutral visual projection packets in `src/projection/renderProjection.js`.
- Projection categories now include terrain, scenery, actors, projectiles, effects, decals, lights, shadowBlockers, fogSmoke, postProcess, hud, and debug.
- Added the required WebGL runtime hierarchy under `src/render/backends/webgl/`:
  - `WebGLGameRenderer.js`
  - `WebGLSceneRoot.js`
  - `WebGLCamera2D.js`
  - `WebGLRenderLayerRegistry.js`
  - `WebGLRenderStats.js`
  - layer modules for terrain, actors, effects, lighting, fog/smoke, and post-process.
- Replaced the active `?renderer=webgl` path with `webgl_layers`.
- Removed the active full-scene Canvas texture upload from the WebGL path.
- The old `webgl_composite` preference is now only accepted as an alias to `webgl_layers`; it is not the renderer mode.
- `WebGLTerrainLayer` renders visible tile rects from projection packets.
- `WebGLActorLayer` renders simple actor markers from projection packets.
- `WebGLEffectLayer` and `WebGLLightingLayer` render minimal marker passes.
- `WebGLFogSmokeLayer` and `WebGLPostProcessLayer` register and report pending/noop status.
- Explicit WebGL initialization failure now reports `rendererBackendStatus: error` and `rendererFallbackReason: webgl_initialization_failed` instead of silently becoming Canvas.
- Added `tests/webglRendererHierarchy.test.mjs` and updated `tests/rendererMigration.test.mjs`.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Canvas default: active backend `canvas2d`, no console/page errors, 4/4 nonblank samples, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-default-slice2-smoke.png`.
- WebGL opt-in: active backend `webgl_layers`, mode `real_layers`, WebGL2 context active, 0 texture uploads, full-scene texture upload false, 4/4 nonblank samples, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-layers-slice2-smoke.png`.
- WebGL layer stats: terrain active with 575 objects, actors active with 6 objects, effects active, lighting minimal marker pass, fog/smoke and post-process registered as pending/noop.

Current truth:

- Canvas remains the quality/default backend.
- WebGL is now architecturally real but visually primitive.
- Full-scene Canvas upload is not active in the WebGL path.

Next safe renderer slice:

1. Keep Canvas default.
2. Add one WebGL visual parity layer, likely HUD/debug overlay or light-space darkness.
3. Keep projection packets renderer-neutral.
4. Compare screenshots and `rendererLayerStats` before broadening.

## WebGL Light-Space Darkness Layer v0

Current request: add the first gameplay-relevant WebGL parity layer by making the opt-in WebGL path own a darkness/visibility pass without touching Canvas default quality rendering.

- Extended renderer-neutral light projection packets with `softness`.
- Added a radial WebGL primitive path in `WebGLSceneRoot.drawWorldRadialLights`.
- Converted `WebGLLightingLayer` from a minimal marker pass into `simple_light_cutouts_v0`:
  - camera-aligned dark world overlay;
  - radial light influence regions from projected light packets;
  - render order after terrain, actors, and effects;
  - no direct gameplay-state reads.
- Extended WebGL layer stats with mode, active light count, overlay count, and influence count.
- Added renderer diagnostics:
  - `webglDarknessLayerActive`
  - `webglLightCount`
  - `webglDarknessRenderMs`
  - `webglDarknessMode`
- Confirmed `rendererFullSceneTextureUploadActive` remains false and texture uploads remain zero.
- Updated `docs/WEBGL_RENDERER_MIGRATION_FOUNDATION.md`, `docs/NEXT_SLICES.md`, `README.md`, and focused renderer tests.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Canvas default: active backend `canvas2d`, mode `canvas2d_layers`, no console/page errors, full-scene texture upload false, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-darkness-v0-smoke.png`, headless manual frame average about `59.37ms`.
- WebGL opt-in: active backend `webgl_layers`, mode `real_layers`, no console/page errors, texture uploads `0`, full-scene texture upload false, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-darkness-v0-smoke.png`, headless manual frame average about `0.303ms`.
- WebGL darkness stats: active `true`, mode `simple_light_cutouts_v0`, active projected lights `3`, darkness render about `0.1ms`, layer order `terrain -> actors -> effects -> lighting -> fogSmoke -> postProcess`.

Current truth:

- WebGL now owns terrain, actor/effect markers, and a real darkness/light-influence layer.
- Canvas still owns the detailed quality stack: HUD text, grounded creature rendering, smoke/scatter, warm bloom, occlusion shadows, post-process smoothing/dither, and decal cache compositing.
- WebGL remains explicit via `?renderer=webgl` and is not the default.

Next safe renderer slice:

1. Keep Canvas default.
2. Add a WebGL HUD/debug overlay so WebGL playtests expose state and diagnostics.
3. Then move toward actor silhouette/detail parity before smoke/fog/post-process ports.

## WebGL HUD/Debug Overlay v0

Current request: proceed with the next renderer slice after darkness by making the opt-in WebGL path visibly self-diagnosing without depending on the Canvas HUD.

- Added renderer-neutral HUD projection facts:
  - player HP / max HP;
  - enemy count;
  - objective/message;
  - bite, lunge, and smoke cooldowns.
- Added `WebGLSceneRoot.drawScreenRects` for WebGL-owned screen-space overlay primitives.
- Added `WebGLPixelFont` as a tiny built-in WebGL pixel-font helper.
- Added `WebGLHudDebugLayer` with mode `projection_debug_text_v0`.
- Registered HUD/debug last in the WebGL layer order after post-process.
- Added HUD diagnostics:
  - `webglHudLayerActive`
  - `webglHudLineCount`
  - `webglHudRenderMs`
  - `webglHudMode`
- Updated renderer stats, tests, docs, and README.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Canvas default: active backend `canvas2d`, mode `canvas2d_layers`, no console/page errors, full-scene texture upload false, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-webgl-hud-v0-smoke.png`, headless manual frame average about `57.063ms`.
- WebGL opt-in: active backend `webgl_layers`, mode `real_layers`, no console/page errors, texture uploads `0`, full-scene texture upload false, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-hud-debug-v0-final.png`.
- WebGL HUD stats: active `true`, mode `projection_debug_text_v0`, line count `5`, HUD render about `0.1ms`, renderer total about `0.2ms`, layer order `terrain -> actors -> effects -> lighting -> fogSmoke -> postProcess -> hudDebug`.

Current truth:

- WebGL can now be playtested with its own minimal status/debug overlay.
- Canvas remains the default quality backend and still owns the richer Canvas HUD.
- Full-scene Canvas upload remains disabled.

Next safe renderer slice:

1. Keep Canvas default.
2. Add actor silhouette/detail parity in WebGL so the player/enemies read better under darkness.
3. Continue avoiding smoke/fog/post-process ports until actor readability and diagnostics hold.

## WebGL Player Wyvern Silhouette Parity v0

Current request: replace the generic WebGL player marker with a WebGL-owned grounded wyvern silhouette while preserving the existing Canvas wyvern design contract and keeping Canvas as the default quality backend.

- Extended the renderer-neutral actor projection with a `wyvernProjection` visual packet for the player.
- Preserved the four-limb grounded wyvern contract in projection data: wing forelimbs, wrist-origin digits, long wing digits, low flank/hip membrane attachment, hind legs, body chain, head, neck, spine, and tail.
- Added `src/render/backends/webgl/WebGLWyvernSilhouette.js` to build a renderer-owned triangle silhouette from projection facts.
- Added `WebGLSceneRoot.drawTriangles` so WebGL actor rendering can draw mesh primitives without Canvas texture upload.
- Updated `WebGLActorLayer` so only the player wyvern uses the new silhouette path; enemies remain simple secondary markers.
- Added renderer diagnostics:
  - `webglPlayerWyvernSilhouetteActive`
  - `webglPlayerWyvernPartCount`
  - `webglActorRenderMs`
  - `webglActorMode`
- Updated renderer stats, migration tests, docs, and README.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Canvas default: active backend `canvas2d`, mode `canvas2d_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-wyvern-silhouette-v0-final.png`, headless manual frame about `56.66ms`.
- WebGL opt-in: active backend `webgl_layers`, mode `real_layers`, no console/page errors, texture uploads `0`, full-scene texture upload false, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-player-wyvern-silhouette-v0-final.png`, headless manual frame about `0.52ms`.
- WebGL actor stats: active `true`, mode `player_wyvern_silhouette_v0`, player silhouette active `true`, semantic part count `22`, triangle count `735`, rect count `3`, actor render about `0.0ms` in the latest smoke.

Current truth:

- WebGL now owns terrain, player wyvern silhouette, secondary actor markers, effect markers, darkness/light influence, and compact HUD/debug overlay.
- Canvas still owns the richer creature gait/detail rendering, smoke/scatter, bloom, shadow composition, post-process smoothing/dither, decal cache compositing, and full quality HUD.
- Full-scene Canvas upload remains disabled in WebGL.
- WebGL remains explicit via `?renderer=webgl` and is not the default.

Next safe renderer slice:

1. Keep Canvas default.
2. Add one small WebGL player readability refinement, such as mouth/eye/socket accent parity or a minimal grounded gait offset.
3. Keep avoiding smoke/fog/post-process ports until the player silhouette remains readable and cheap under darkness.

## WebGL Post-Process Pipeline v0

Current request: move central post-processing ownership into the opt-in WebGL backend with a real render-target/shader-composite path, while keeping Canvas default and avoiding Canvas filters or full-scene texture upload.

- Added `src/render/backends/webgl/WebGLPostProcessPipeline.js`.
- WebGL now allocates an internal framebuffer/render-target texture for the scene.
- `WebGLGameRenderer` calls `postProcess.beginScene(...)` before rendering the layer registry.
- `WebGLPostProcessLayer` now composites that render target back to the screen in the existing layer order before `WebGLHudDebugLayer`.
- Added the first deliberately cheap shader effect mode: `mild_vignette_v0`.
- Kept `WebGLFogSmokeLayer` as the only noop/pending WebGL visual layer.
- Added renderer diagnostics:
  - `webglPostProcessActive`
  - `webglPostProcessMode`
  - `webglPostProcessRenderMs`
  - `webglPostProcessPassCount`
  - `webglPostProcessRenderTargetActive`
- Updated renderer stats, migration tests, docs, README, and next-slice notes.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Canvas default: active backend `canvas2d`, mode `canvas2d_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-post-process-v0-smoke.png`, headless manual frame about `56.94ms`.
- WebGL opt-in: active backend `webgl_layers`, mode `real_layers`, no console/page errors, texture uploads `0`, full-scene texture upload false, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-post-process-v0-smoke.png`, headless manual frame about `0.48ms`.
- WebGL post-process stats: active `true`, mode `mild_vignette_v0`, render target active `true`, pass count `1`, render about `0.1ms`, renderer total about `0.3ms`.
- The installed web-game Playwright client ran successfully via a temporary local copy so it could resolve project Playwright. Its `state-0.json` confirmed `webglPostProcessRenderTargetActive: true`; its canvas-element screenshots were black because that generic client captures WebGL canvases with `preserveDrawingBuffer: false`, so the project-specific Playwright screenshot above is the visual proof.

Current truth:

- WebGL now owns terrain, player wyvern silhouette, secondary actor markers, effect markers, darkness/light influence, post-process render-target compositing, and compact HUD/debug overlay.
- Canvas still owns richer creature gait/detail rendering, smoke/scatter, bloom chains, shadow composition, smoothing/dither parity, decal cache compositing, and full quality HUD.
- Full-scene Canvas upload remains disabled in WebGL.
- WebGL remains explicit via `?renderer=webgl` and is not the default.

Next safe renderer slice:

1. Keep Canvas default.
2. Add a small WebGL fog/smoke visibility scaffold or post-process diagnostics toggle.
3. Do not add bloom chains until smoke/fog and post-process timing are measurable under real play.

## WebGL Fog/Smoke Visibility Scaffold v0

Current request: add a small WebGL-owned fog/smoke visibility scaffold fed by renderer-neutral projection packets, while keeping Canvas default and keeping full-scene Canvas texture upload disabled.

- Formalised `fogSmoke` projection packets as renderer-neutral visual facts with source kind, world position, radius, density, lifetime, drift scale, render priority, and softness.
- Upgraded `WebGLFogSmokeLayer` from pending/noop to `simple_radial_smoke_scaffold_v0`.
- The layer consumes only `projection.fogSmoke`, culls against camera bounds, caps visible sources at `32`, and renders one alpha radial world primitive per visible packet.
- Added `WebGLSceneRoot.drawWorldRadialDiscs` for non-additive alpha radial discs while keeping the existing additive light cutout path intact.
- Kept fog/smoke in the layer order after lighting/darkness and before post-process, so it renders through the WebGL render target and final shader composite.
- Added renderer diagnostics:
  - `webglFogSmokeLayerActive`
  - `webglFogSmokeMode`
  - `webglFogSmokeSourceCount`
  - `webglFogSmokePrimitiveCount`
  - `webglFogSmokeRenderMs`
- Updated renderer stats, migration tests, docs, README, and next-slice notes.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Canvas default with a smoke burst: active backend `canvas2d`, mode `canvas2d_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-fog-smoke-v0-smoke.png`, headless manual update/render tick about `57.3ms`.
- WebGL opt-in with a smoke burst: active backend `webgl_layers`, mode `real_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, `webglPostProcessRenderTargetActive: true`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-fog-smoke-v0-smoke.png`, headless manual update/render tick about `0.98ms`.
- WebGL fog/smoke stats: active `true`, mode `simple_radial_smoke_scaffold_v0`, source count `4`, primitive count `4`, render about `0.0ms`, renderer total about `0.5ms`.

Current truth:

- WebGL now owns terrain, player wyvern silhouette, secondary actor markers, effect markers, darkness/light influence, fog/smoke scaffold rendering, post-process render-target compositing, and compact HUD/debug overlay.
- Canvas still owns richer creature gait/detail rendering, full smoke density/scatter/lit-smoke parity, bloom chains, shadow composition, smoothing/dither parity, decal cache compositing, and full quality HUD.
- Full-scene Canvas upload remains disabled in WebGL.
- WebGL remains explicit via `?renderer=webgl` and is not the default.

Next safe renderer slice:

1. Keep Canvas default.
2. Add a small WebGL decal/ground-hazard visibility scaffold or layer visibility diagnostics.
3. Do not add bloom chains until fog/smoke, decals, and post-process timing are measurable under real play.

## WebGL Ground Hazard / Decal Visibility Scaffold v0

Current request: add a small WebGL-owned ground hazard/decal scaffold fed by renderer-neutral projection packets, while keeping Canvas default and keeping full-scene Canvas texture upload disabled.

- Added renderer-neutral `groundHazards` projection packets from existing napalm pools.
- Formalised decal projection packets with `renderer_neutral_decal_projection`, source kind, visual role, opacity, and softness facts.
- Added `src/render/backends/webgl/layers/WebGLDecalLayer.js` with mode `ground_hazard_decal_scaffold_v0`.
- The layer consumes only `projection.decals` and `projection.groundHazards`, culls against camera bounds, caps visible sources at `96`, and renders bounded alpha radial world primitives.
- Registered `WebGLDecalLayer` after terrain and before actors/effects/lighting.
- Removed decal packet drawing from `WebGLEffectLayer` so WebGL decal ownership is not duplicated.
- Added renderer diagnostics:
  - `webglDecalLayerActive`
  - `webglDecalMode`
  - `webglDecalSourceCount`
  - `webglDecalPrimitiveCount`
  - `webglDecalRenderMs`
- Updated renderer stats, migration tests, docs, README, and next-slice notes.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Canvas default with smoke and napalm/scorch hazards: active backend `canvas2d`, mode `canvas2d_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-decal-hazard-v0-smoke.png`, headless manual update/render tick about `63.86ms`.
- WebGL opt-in with smoke and napalm/scorch hazards: active backend `webgl_layers`, mode `real_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, `webglPostProcessRenderTargetActive: true`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-decal-hazard-v0-smoke.png`, headless manual update/render tick about `0.94ms`.
- WebGL decal stats: active `true`, mode `ground_hazard_decal_scaffold_v0`, source count `8`, primitive count `12`, render about `0.0ms`, renderer total about `0.5ms`, layer order `terrain -> decals -> actors -> effects -> lighting -> fogSmoke -> postProcess -> hudDebug`.
- The installed web-game Playwright client ran successfully via a temporary local copy so it could resolve project Playwright. Its `state-1.json` confirmed `webglDecalLayerActive: true`, source count `10`, primitive count `15`, `webglPostProcessRenderTargetActive: true`, and texture uploads `0`; its canvas screenshot was black because the generic client still hits the WebGL capture limitation seen in the post-process slice, so the project-specific screenshot above is the visual proof.

Current truth:

- WebGL now owns terrain, decal/ground-hazard scaffold rendering, player wyvern silhouette, secondary actor markers, effect markers, darkness/light influence, fog/smoke scaffold rendering, post-process render-target compositing, and compact HUD/debug overlay.
- Canvas still owns richer creature gait/detail rendering, full smoke density/scatter/lit-smoke parity, bloom chains, shadow composition, full decal cache compositing with feather masks, smoothing/dither parity, and full quality HUD.
- Full-scene Canvas upload remains disabled in WebGL.
- WebGL remains explicit via `?renderer=webgl` and is not the default.

Next safe renderer slice:

1. Keep Canvas default.
2. Add layer visibility diagnostics/toggles or a tiny hit/damage feedback scaffold.
3. Do not add bloom chains until WebGL layer visibility, decals, fog/smoke, and post-process timing remain measurable under real play.

## WebGL Default Promotion + Canvas Legacy Quarantine v0

Superseded historical entry: Canvas 2D legacy/debug support described in this section was removed by the Canvas 2D Renderer Cull v1 entry below. It remains here only as the chronological record of the previous migration step.

Current request: promote the real WebGL layer renderer to the normal/default boot path and quarantine Canvas as an explicit legacy/debug fallback without adding new visual features.

- Changed renderer budgets so `preferredBackend` and `candidateBackend` are now canonical `webgl`.
- Historical: at that slice boundary, `canvas2d` was kept as the explicit fallback id for deliberate legacy/debug selection via `?renderer=canvas`, `?renderer=canvas2d`, or `?renderer=2d`.
- Historical: that slice added canonical `RenderBackendId.WEBGL` while retaining `webgl_layers` as a compatibility alias that normalized to `webgl`.
- Historical: WebGL initialization failure reported `rendererActiveBackend: webgl`, `rendererBackendStatus: error`, `rendererFallbackReason: webgl_initialization_failed`, and `canvasLegacyActive: false`; it did not silently become Canvas.
- Historical: the then-live Canvas diagnostics reported `rendererMode: canvas2d_legacy_layers`, `canvasLegacyAvailable: true`, `canvasLegacyActive: true`, and `webglMigrationCoverageStatus: canvas_legacy_debug_fallback_active`.
- Historical: WebGL diagnostics reported `canvasLegacyAvailable: true`, `canvasLegacyActive: false`, `hiddenCanvasRenderLoopActive: false`, `webglLayerOrder`, and `webglMigrationCoverageStatus: webgl_default_core_stack_canvas_legacy_parked`.
- Marked the Canvas renderer branch as legacy/debug in code comments and updated README, `docs/WEBGL_RENDERER_MIGRATION_FOUNDATION.md`, and `docs/NEXT_SLICES.md`.

Validation:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Historical default route proof: active backend `webgl`, mode `real_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, `canvasLegacyActive: false`, `webglPostProcessRenderTargetActive: true`, layer order `terrain -> decals -> actors -> effects -> lighting -> fogSmoke -> postProcess -> hudDebug`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-default-promotion-v0-default.png`, headless manual tick about `0.554ms`.
- Historical explicit WebGL route proof: active backend `webgl`, mode `real_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, `canvasLegacyActive: false`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-default-promotion-v0-explicit-webgl.png`, headless manual tick about `0.550ms`.
- Historical explicit Canvas legacy route proof before cull: active backend `canvas2d`, mode `canvas2d_legacy_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, `canvasLegacyActive: true`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-canvas-legacy-quarantine-v0.png`, headless manual tick about `58.492ms`.
- Historical shared web-game Playwright client proof: its `state-1.json` confirmed `rendererActiveBackend: webgl`, `rendererMode: real_layers`, `canvasLegacyActive: false`, `webglPostProcessRenderTargetActive: true`, layer stats active, and texture uploads `0`; its canvas screenshot was black because the generic client hit the known WebGL canvas capture limitation, so the project-specific screenshots above were the visual proof.

Historical truth at that slice boundary:

- WebGL is now the default renderer path.
- Canvas was available only as an explicit legacy/debug fallback before the cull slice removed it.
- Full-scene Canvas texture upload remains disabled.
- Hidden Canvas rendering is not active in WebGL mode.
- Future visual work should target WebGL first; Canvas-only polish is parked unless deliberately reimplemented in WebGL.

Historical next safe renderer slice:

1. Keep WebGL default and Canvas legacy/debug only.
2. Stop expanding migration scaffolds unless a WebGL-default smoke reveals a parity blocker.
3. Add a small WebGL-first feature/readability slice next, such as hit/damage feedback or layer visibility controls, with screenshots and per-layer timings.

## Canvas 2D Renderer Cull v1

Current request: remove Canvas 2D renderer runtime support now that WebGL is the default real-layer renderer.

- Removed Canvas 2D as a selectable backend. `RenderBackendId` now exposes only `webgl` and `unsupported_renderer`.
- Removed `?renderer=canvas`, `?renderer=canvas2d`, and `?renderer=2d` support. Those requests now produce `rendererBackendStatus: error`, `rendererFallbackReason: unsupported_renderer_backend`, and a clear message that Canvas 2D runtime rendering was culled.
- Removed the Canvas 2D backend registration, `createCanvas2DBackend`, Canvas fallback policy, and Canvas render-loop branch.
- Collapsed `src/render/renderer.js` to a WebGL-only projection handoff.
- Deleted live Canvas 2D renderer modules:
  - `src/render/layers/*`
  - `src/render/lightSpaceMask.js`
  - `src/render/uiOverlay.js`
- Updated diagnostics from Canvas legacy quarantine fields to `canvas2dRuntimeAvailable: false`.
- Updated tests so WebGL is the only supported runtime renderer and old Canvas requests are unsupported.
- Updated active docs so Canvas 2D is no longer described as legacy/debug runtime support; old Canvas-era docs are labelled historical where they still mention removed files.

Validation so far:

```powershell
npm test
node -e "import('./src/app.js')"
```

Browser proof:

- Default route: active backend `webgl`, mode `real_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, `canvas2dRuntimeAvailable: false`, `hiddenCanvasRenderLoopActive: false`, `webglPostProcessRenderTargetActive: true`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-only-cull-v1-default.png`, headless manual tick about `0.629ms`.
- Explicit WebGL route: active backend `webgl`, mode `real_layers`, no console/page errors, full-scene texture upload false, texture uploads `0`, `canvas2dRuntimeAvailable: false`, `hiddenCanvasRenderLoopActive: false`, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-only-cull-v1-explicit-webgl.png`, headless manual tick about `0.563ms`.
- Removed Canvas 2D route: `?renderer=canvas2d` reports active backend `unsupported_renderer`, mode `unsupported_renderer`, backend status `error`, fallback reason `unsupported_renderer_backend`, `rendererRequestedBackend: canvas2d`, `canvas2dRuntimeAvailable: false`, no page errors, expected unsupported-renderer console error, screenshot `C:\Users\felix\AppData\Local\Temp\bsb-webgl-only-cull-v1-unsupported-canvas2d.png`.
- Shared web-game Playwright client ran against the default route. Its `state-1.json` confirmed `rendererActiveBackend: webgl`, `rendererMode: real_layers`, `canvas2dRuntimeAvailable: false`, `webglPostProcessRenderTargetActive: true`, layer order intact, and texture uploads `0`; its canvas screenshot was black because the generic client still hits the known WebGL canvas capture limitation, so the project-specific screenshots above are the visual proof.

Current truth:

- WebGL is the only supported active runtime renderer.
- The HTML canvas element remains as the WebGL drawing surface.
- Canvas 2D renderer modules are no longer live source.
- WebGL failure and unsupported renderer requests are explicit errors, not fallbacks.
- Full-scene Canvas texture upload remains disabled.

## WebGL Lighting Live Wiring v1

Current request: implement a narrow WebGL renderer live-wiring pass so existing lighting profiles, emitter flicker data, light-space culling, and occlusion-shadow scaffolds truthfully drive or describe the WebGL runtime.

- Extended renderer-neutral projection with `lightingProfile`, flicker-resolved light packets, live `lightSpaceCulling`, and `occlusionShadows`.
- Preserved emitter fields through projection: `flickerAmount`, `flickerSpeed`, `flickerPhase`, colour, inner colour, radius, intensity, softness, source kind, and render time.
- Updated `WebGLLightingLayer` from hardcoded `simple_light_cutouts_v0` output to `profiled_flicker_light_cutouts_v1`.
- WebGL lighting now uses profile-backed darkness colour/opacity, profile reveal strength, warm bloom opacity, and soft two-radius amber light primitives.
- Reduced harsh additive output by lowering light alpha and using warm outer colour plus a small mixed warm core instead of one bright inner-colour disc.
- Added `WebGLLightSpaceGate` so secondary actors, effects, decals/ground hazards, and fog/smoke respect the projection-owned light-space feather gate. Player and terrain base visibility remain protected.
- Kept occlusion shadows honest: projection data is live, but WebGL shadow compositing remains scaffolded/diagnostic-only because the current scene has zero explicit height-bearing occluders.
- Added compact HUD/debug counters for flickering lights, light-space culling, and scaffolded occlusion regions.
- Added `tests/webglLightingLiveWiring.test.mjs` and updated hierarchy tests to protect profile/flicker consumption, light-space WebGL gating, scaffolded occlusion labels, and no Canvas 2D reintroduction.

Validation so far:

```powershell
npm test
node -e "import('./src/app.js')"
```

Status: passing. Browser proof completed below.

Browser proof:

- Shared web-game client: direct `.codex` script still cannot resolve `playwright` from the skill directory, so it was run through a temporary local copy and then removed.
- Shared client output: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-live-wiring-client\state-2.json` confirmed `rendererActiveBackend: "webgl"`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, `webglDarknessMode: "profiled_flicker_light_cutouts_v1"`, `webglLightingProfileId: "early_night"`, `webglLightingInfluenceCount: 12`, `webglFlickeringLightCount: 6`, `webglLightSpaceCullingActive: true`, `webglLightSpaceCulledCount: 1`, `webglOcclusionShadowMode: "projection_live_render_composite_scaffolded"`, and `webglOcclusionShadowRegions: 0`.
- Shared client screenshots remain black for WebGL due to the known `preserveDrawingBuffer: false` capture limitation.
- Project-specific Playwright page screenshot: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-live-wiring-project.png`.
- Project-specific state: `C:\Users\felix\AppData\Local\Temp\bsb-webgl-live-wiring-project-state.json`.
- Visual check: screenshot is nonblank, darker, and warm amber around torch/napalm lights; HUD shows `LT 6 FLK 6 LSP 1 OCC S0`.
- Pixel sanity check sampled 5/5 nonblack points; light samples were warm amber, for example `(735,358) = rgba(208,132,63,255)`.
- Console/page errors: no page errors. Chromium emitted ReadPixels performance warnings during screenshot capture only.

Current truth:

- Lighting profile data is live in WebGL.
- Emitter flicker data is live through projection and WebGL light primitives.
- Light-space render culling is live as a WebGL render-detail gate for secondary actors/effects/decals/fog-smoke.
- Occlusion shadow projection is live, but WebGL shadow compositing remains scaffolded/diagnostic-only until explicit occluder entities and a composite pass exist.
- Canvas 2D runtime rendering remains removed; no fallback or full-scene Canvas upload was reintroduced.

## Procedural Motion + Action State Foundation v0

Current request: wire existing procedural gait/limb concepts into the live ECS -> projection -> WebGL renderer path so player movement and attacks read as body/limb motion before new hit feedback is added.

- Found live gait ownership in `wyvernProjectionSystem`: body-chain points, `gaitPhase`, `idlePhase`, `movement01`, and mouth sockets were already updated from actual movement.
- Found parked reusable helper code in `projection/creatures/creatureKinematics.js`: facing vectors, role indexing, offsets, and a cheap two-bone IK helper. The active WebGL silhouette had not been consuming it.
- Added player-owned `MotionState`, `ActionState`, `LimbRig`, and `ProceduralPose` components.
- Added lightweight wyvern profile data for `idle`, `crawl`, `bite_attack`, and `claw_swipe_attack`.
- Added `wyvernProceduralPose` as the projection-side solver. It emits body offsets, wing-forelimb wrist/elbow offsets, hind-leg offsets, contact anchors, mouth socket output, jaw amount, phase buckets, and deterministic cache keys.
- Kept combat behavior stable: `BITE_CLAW` now starts the `bite_attack` pose; existing `BODY_LUNGE` now starts the v0 `claw_swipe_attack` pose foundation while preserving lunge damage/movement.
- Extended actor views and `renderProjection` so `wyvernProjection.proceduralPose` reaches WebGL as `renderer_neutral_procedural_pose_projection`.
- Updated `WebGLWyvernSilhouette` to consume projected pose data for body role offsets, forelimb wrist sweeps, hind-leg stepping, and bite jaw visibility. The renderer does not own gait or action timing.
- Documented the cache/bake path: v0 live solve for the unique player wyvern, v1 phase-bucket cache by rig/motion/action/side, later optional baked pose tables.
- Documented that GPU instancing is later work for repeated simple actors, decals, and effects, not this unique articulated player slice.
- Left hit sparks, blood puffs, slash decals, death feedback, full skeletal animation, offline baking, pathfinding changes, GPU instancing, and Canvas revival intentionally out of scope.

Validation so far:

```powershell
npm test
node -e "import('./src/app.js')"
```

Status: passing. Browser proof completed below.

Browser proof:

- Shared web-game client completed against `http://127.0.0.1:5188/` using a temporary local copy of the client script, then the temporary file was removed.
- Shared client artifacts: `C:\Users\felix\AppData\Local\Temp\bsb-procedural-motion-client\state-0.json` through `state-2.json` and `shot-0.png` through `shot-2.png`.
- Shared client state confirmed `rendererActiveBackend: "webgl"`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, `webglPlayerWyvernSilhouetteActive: true`, `webglPlayerWyvernPartCount: 22`, and actor layer triangle output.
- Project-specific Playwright input pass drove movement, `J` bite, and `K` lunge/claw. State proof: `C:\Users\felix\AppData\Local\Temp\bsb-procedural-motion-project\procedural-motion-state.json`.
- Project-specific screenshot: `C:\Users\felix\AppData\Local\Temp\bsb-procedural-motion-project\procedural-motion.png`.
- Runtime pose facts from the browser:
  - movement: `locomotionId: "crawl"`, `movement01: 1`, `leftWristForward: -0.1588`;
  - bite: `actionId: "bite_attack"`, `jawOpen: 0.6160`, `headForward: 0.4569`;
  - claw: `actionId: "claw_swipe_attack"`, `rightWristForward: 0.4117`, `rightWristRight: -0.3741`;
  - WebGL: active backend `webgl`, Canvas 2D unavailable, player wyvern silhouette active, actor triangles `735`.
- Console/page errors: `0`.
- Screenshot pixel sanity sampled nonblack HUD, terrain/light, and player-area pixels.

## Physics-Informed Wyvern Attack Definition v0

Current request: use the procedural motion/action framework to define the first readable, physics-informed wyvern attack motions.

- Extended `bite_attack` and `claw_swipe_attack` profiles with contact contracts:
  - `contactBodyPart`
  - `activePhaseStart`
  - `activePhaseEnd`
  - `contactShape`
  - `contactOffset`
  - `contactSize`
  - `impactDirection`
  - `impactStrength`
  - `staggerStrength`
- `bite_attack` is now a head/jaw/front-neck capsule contact window with mostly forward impulse near max extension.
- `claw_swipe_attack` is now a primary wrist/foreclaw front-band contact window with lateral/diagonal impulse during the sweep.
- Added actor `ImpactResponse` data: mass, impact resistance, stagger resistance, knockback velocity, stagger timer, and last impact record.
- Rerouted player attack damage out of immediate button-press radius checks. `combatSystem` now starts cooldown/action state only.
- Added `wyvernAttackContactSystem` to resolve damage and impact only when `ProceduralPose.attackContact.active` is true.
- Added `impactResponseSystem` to apply and damp bounded knockback velocity.
- Enemy pressure now respects stagger by reducing movement while `ImpactResponse.staggerTimer` is active.
- Projection now carries active contact debug data with world-space dimensions.
- WebGL draws a tiny debug-only contact marker from projected contact data and still owns no hit logic.
- Added `docs/PHYSICS_INFORMED_WYVERN_ATTACK_V0.md` and focused tests in `tests/physicsInformedWyvernAttack.test.mjs`.

Validation so far:

```powershell
npm test
```

Status: passing after fixing the initial component schema to include `attackContact: null`. Browser proof completed below.

Browser proof:

- Shared web-game client completed against `http://127.0.0.1:5188/` using a temporary local copy of the client script, then the temporary file was removed.
- Shared client artifacts: `C:\Users\felix\AppData\Local\Temp\bsb-physics-attack-client\state-0.json` through `state-2.json` and `shot-0.png` through `shot-2.png`.
- Project-specific Playwright probe drove `J` bite and `K` claw/lunge in fresh page states, placed an enemy inside the projected contact window, and advanced deterministic frames.
- Project-specific state proof: `C:\Users\felix\AppData\Local\Temp\bsb-physics-attack-project\physics-attack-state.json`.
- Project-specific screenshot: `C:\Users\felix\AppData\Local\Temp\bsb-physics-attack-project\physics-attack-contact.png`.
- Runtime impact facts:
  - bite: inactive before the window, active at phase `0.441`, HP `42 -> 20`, `contactBodyPart: "jaw_head_front"`, impact direction `"forward"`, knockback velocity about `[2.2415, 0]`, resolved once against `raider_2`;
  - claw: inactive before the window, active at phase `0.357`, HP `42 -> 26`, `contactBodyPart: "primary_wrist_claw"`, impact direction `"side_diagonal"`, knockback velocity about `[1.5564, 0.7075]`, resolved once against `raider_2`;
  - WebGL: active backend `webgl`, Canvas 2D unavailable, player wyvern silhouette active, actor debug rects `4`, actor triangles `735`.
- Console/page errors: `0`.
- Visual sanity: screenshot is nonblank with the wyvern pose, lighting, HUD, and the small debug-only contact marker visible.

## Grounded Wyvern Silhouette + Proportion Pass v0

Current request: improve the player wyvern's grounded silhouette, especially head, neck, and shoulders, without turning this into a new combat, wing overhaul, skeleton, renderer backend, or asset-pipeline pass.

- Added a recipe-owned `grounded_wyvern_hatchling_front_heavy_v0` proportion profile with explicit head, jaw, neck, shoulders/chest, torso, hips, forelimb, hind-leg, tail, and constraint data.
- Kept this pass focused on head/neck/shoulders: shoulders/chest now carry visibly more mass than hips, head/jaw dimensions are explicit, and neck/head extension is bounded instead of rubber-band elastic.
- Left the established wing anatomy mostly intact, only letting WebGL consume profile-owned forelimb anchor widths so the wrist supports stay grounded with the heavier front body.
- Tightened `wyvernProjectionSystem` body-chain initialization and stretch clamping so body points cannot explode into long elastic segments.
- Extended `ProceduralPose` with `proportionProfileId` and `constraintState` so the solver reports which profile clamped jaw/head/neck/limb offsets.
- Extended render projection to carry `wyvernProjection.proportionProfile` as renderer-neutral data.
- Updated `WebGLWyvernSilhouette` to consume projected proportions for heavier shoulder/chest masses, neck/head capsules, bounded jaw separation, tail taper, and forelimb anchor width. WebGL still does not own action timing, pose solving, or gameplay truth.
- Added focused tests in `tests/groundedWyvernProportions.test.mjs` and extended existing hierarchy/partition/projection tests to protect the profile, projection, and WebGL consumption path.

Validation:

```powershell
npm test
node -e "import('./src/app.js').then(() => console.log('import ok'))"
node tests\locBudget.test.mjs
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Git note: the parent repository currently reports `BLACK_SKY_BOUND_V2` as an untracked project folder, so `git diff --check` has no tracked-file diff to inspect for this slice.

Browser proof:

- Local server: `http://127.0.0.1:5186/`.
- Shared web-game client direct run still cannot resolve `playwright` from the `.codex` skill directory; a project-local hard link workaround ran successfully with `--click 760,360`, then the hard link was removed.
- Shared client screenshots: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-proportion-web-game-client\shot-0.png` and `shot-1.png`.
- Project-specific Playwright proof forced a mid-bite pose through ECS, synced game views, rendered WebGL, and captured:
  - full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-proportion-browser-proof\wyvern-proportion-bite-full.png`;
  - crop screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-proportion-browser-proof\wyvern-proportion-bite-crop.png`;
  - state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-proportion-browser-proof\wyvern-proportion-bite-proof.json`.
- Runtime facts: `profileId: "grounded_wyvern_hatchling_front_heavy_v0"`, `profileFocus: "head_neck_shoulders_first_pass"`, `shoulderWidth: 1.2`, `hipWidth: 0.7`, `actionId: "bite_attack"`, `actionPhase: 0.54`, `jawOpen: 0.56`, `headForward: 0.44`, `neckForward: 0.26`, `constraintsApplied: true`, `meshPartCount: 26`, `meshTriangleCount: 819`, `canvas2dRuntimeAvailable: false`.
- Console/page errors: `0`.

Residuals:

- This is not the final body/hips/tail pass. Tail taper and body-chain clamps are improved, but deeper hindquarter/tail counterbalance should be a separate focused slice if the next visual read still feels off.
- Wing layout was intentionally not reworked beyond support-anchor proportion consumption.

## Rear / Tail Grounding Proportion Pass v0

Current request: focus the next anatomy pass on rear mass, hind-leg support, and tail counterbalance while preserving the previous head/neck/shoulder and wing work.

- Advanced the recipe-owned proportion profile to `grounded_wyvern_hatchling_grounded_balance_v0`.
- Changed active profile focus to `rear_hips_tail_counterbalance_pass` while retaining `head_neck_shoulders_first_pass` in `completedPasses`.
- Broadened the pelvis/hips and added explicit haunch dimensions.
- Strengthened hind-leg profile data: wider hip anchors, larger thighs/shins, longer grounded feet, and wider contact spacing.
- Lengthened the rear body chain and tail profile so the tail reads as a real counterbalance instead of a short rear nub.
- Added pose-level rear counterbalance: front-drive actions settle the hips rearward and extend tail base/mid/tip progressively backward.
- Extended pose constraints with hip, tail, hind-knee, and hind-ankle bounds plus tail constraint provenance.
- Updated WebGL silhouette to consume profile-owned hip mass, tail root/taper data, and hind-leg/foot dimensions.
- Added `tests/rearTailProportions.test.mjs` and tightened the partition test around haunch/counterReach profile vocabulary.

Validation:

```powershell
npm test
node -e "import('./src/app.js').then(() => console.log('import ok'))"
node tests\locBudget.test.mjs
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5187/`.
- Shared web-game client ran through the project-local hard-link workaround with `--click 760,360`, then the hard link was removed.
- Shared client artifacts: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-rear-tail-web-game-client\shot-0.png`, `shot-1.png`, `state-0.json`, and `state-1.json`.
- Project-specific Playwright proof forced a mid-lunge pose through ECS, synced game views, rendered WebGL, and captured:
  - full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-rear-tail-browser-proof\wyvern-rear-tail-lunge-full.png`;
  - crop screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-rear-tail-browser-proof\wyvern-rear-tail-lunge-crop.png`;
  - state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-rear-tail-browser-proof\wyvern-rear-tail-lunge-proof.json`.
- Runtime facts: `profileId: "grounded_wyvern_hatchling_grounded_balance_v0"`, `profileFocus: "rear_hips_tail_counterbalance_pass"`, `hipWidth: 0.86`, `haunchWidth: 0.48`, `tailLength: 1.46`, `tailBaseWidth: 0.5`, `hindFootLength: 0.44`, `actionId: "lunge_attack"`, `actionPhase: 0.46`, `hipsForward: -0.047`, `tailBaseForward: -0.039`, `tailMidForward: -0.072`, `tailTipForward: -0.11`, `meshPartCount: 31`, `meshTriangleCount: 909`, `rendererActiveBackend: "webgl"`, `canvas2dRuntimeAvailable: false`.
- Console/page errors: `0`.

Residuals:

- The rear/tail silhouette is visibly stronger, but full body animation is still procedural offsets, not a skeletal solve.
- A future gait-focused pass could make alternating hind-foot plants more readable during crawl without changing proportions again.

## Skeletal Tail + Gait Foundation v0

Current request: correct the rear/tail pass because the previous visual evidence was too weak and the tail still did not read at runtime scale. Move from body-chain/proportion offsets toward an explicit skeletal/gait solve.

- Registered the prior rear/tail browser proof as insufficient: it proved profile values and a crop, but not normal-viewport tail readability.
- Advanced the active profile to `grounded_wyvern_hatchling_skeletal_gait_v0`.
- Changed active focus to `skeletal_tail_gait_foundation_pass` while preserving `head_neck_shoulders_first_pass` and `rear_hips_tail_counterbalance_pass` in `completedPasses`.
- Added canonical skeleton profile data: axial roles, six tail bone roles, hind-leg roles, and diagonal wrist/hind-foot contact policy.
- Added explicit tail bone lengths/taper widths and decoupled visible tail length from the short collider-radius body chain.
- Added `src/projection/creatures/wyvernSkeletalPose.js` as the projection-owned skeletal solve. It emits renderer-neutral axial points, six-point tail skeleton, and left/right hind-leg skeleton points with contact phase/planted state.
- Extended render projection to convert skeletal points into world-space packets.
- Updated WebGL silhouette to draw tail and hind legs from projected skeleton data, with tail rendered after wing membranes so it is not buried.
- Added tests that assert world-space tail screen span rather than only mesh size.

Validation:

```powershell
npm test
node -e "import('./src/app.js').then(() => console.log('import ok'))"
node tests\locBudget.test.mjs
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5189/`.
- Shared web-game client ran through the project-local hard-link workaround with `--click 760,360`, then the hard link was removed.
- Project-specific Playwright proof captured both crawl/gait and lunge scenarios:
  - crawl full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-skeletal-gait-browser-proof\wyvern-skeletal-gait-crawl-full.png`;
  - crawl tail crop: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-skeletal-gait-browser-proof\wyvern-skeletal-gait-crawl-tail-crop.png`;
  - lunge full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-skeletal-gait-browser-proof\wyvern-skeletal-gait-lunge-full.png`;
  - lunge tail crop: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-skeletal-gait-browser-proof\wyvern-skeletal-gait-lunge-tail-crop.png`;
  - state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-skeletal-gait-browser-proof\wyvern-skeletal-gait-proof.json`.
- Runtime facts:
  - crawl: `motionId: "crawl"`, `movement01: 1`, six tail points, tail screen span `65.2px`, root width `8.7px`, tip width `1.88px`, left hind contact `plant`, right hind contact `reach`, mesh `33` parts / `997` triangles;
  - lunge: `actionId: "lunge_attack"`, tail screen span `63.9px`, mesh `33` parts / `997` triangles;
  - WebGL active, Canvas 2D unavailable, console/page errors `0`.

Residuals:

- This is a real skeletal/gait foundation for tail and hind legs, but not yet a full anatomical animation system for every joint.
- The tail is now readable at gameplay scale, but the segment styling is intentionally a little explicit; a later art pass can soften the bands once readability is no longer at risk.

## Canonical Wyvern Rig + File-Backed Tuning Overlay v0

Current request: resolve duplicate/competing wyvern proportion, skeleton, constraint, bounds, and renderer scale truth; make the player wyvern the first canonical test case; add a file-backed tuning overlay on backtick for faster human and AI-observable visual tuning.

- Added bounded creature tuning data and persistence:
  - `src/data/creatures/creatureTuning.js` owns the editable manifest, bounded override normalization, profile merge, and editable-path validation.
  - `tuning/creature-overrides.json` stores values-only profile overrides with schema version `bsb.creatureTuning.v0`.
  - `tools/tuningApi.mjs` adds local-only `GET`/`PUT /api/tuning/creature-overrides` and writes atomically through a temp file rename.
- Made the active player wyvern recipe resolve from one canonical profile path:
  - base profile data remains immutable source data;
  - `resolveCreatureProjectionRecipe(recipeId, game.creatureTuning)` applies bounded file-backed overrides;
  - legacy recipe fields such as `proportions`, `hindLegAnatomy`, and `wingAnatomy` are derived from the resolved profile instead of copied by hand;
  - renderer-local visual scale moved into profile-owned `visual.scale`.
- Added `CreatureRigPose` as the canonical renderer-neutral body output:
  - axial body, head/jaw, neck, shoulders, hips, wing-forelimbs, hind legs, tail, gait contacts, sockets, constraint state, visual scale, and visual bounds now live in the rig pose.
  - `ProceduralPose` remains motion/action drive and attack-contact provenance, not renderer anatomy truth.
  - `wyvernProjectionSystem` writes `CreatureRigPose`; `renderProjection` emits world-space `wyvernProjection.rigPose`; `WebGLWyvernSilhouette` prefers `rigPose`.
- Added the backtick DOM tuning overlay:
  - backtick toggles tuning mode;
  - tuning mode pauses simulation, suppresses player intent, and consumes canvas clicks for selection;
  - sliders hot-refresh the selected rig and autosave to the local tuning API;
  - `window.BSB_V2_DEMO.tuning` and `render_game_to_text` expose active state, selected entity/profile, override count, changed paths, save status, and rig bounds.
- Updated partition docs so future passes know `CreatureRigPose` is the anatomy/skeleton/bounds contract and `ProceduralPose` is motion/action drive.
- Added focused tests for tuning merge/clamping/API, rig pose output, render projection, WebGL rig consumption, and tuning-mode input suppression.

Validation:

```powershell
npm test
node -e "import('./src/app.js').then(() => console.log('import ok'))"
node tests\locBudget.test.mjs
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5190/`.
- Backtick opened the overlay, selected `young_dragon_1`, edited `visual.scale` from `1.45` to `1.52`, autosaved, and reload preserved the edit.
- Current persisted override: `grounded_wyvern_hatchling_skeletal_gait_v0.visual.scale = 1.52`.
- Overlay proof artifacts:
  - full overlay screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-tuning-overlay-proof\wyvern-tuning-overlay-full.png`;
  - panel screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-tuning-overlay-proof\wyvern-tuning-overlay-panel.png`;
  - edited screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-tuning-overlay-proof\wyvern-tuning-overlay-edited.png`;
  - reload screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-tuning-overlay-proof\wyvern-tuning-overlay-reloaded.png`;
  - centered runtime screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-tuning-overlay-proof\wyvern-tuning-overlay-visible-runtime.png`;
  - state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-tuning-overlay-proof\wyvern-tuning-overlay-proof.json`.
- Runtime facts: `profileId: "grounded_wyvern_hatchling_skeletal_gait_v0"`, `changedPaths: ["visual.scale"]`, live rig `visualScale: 1.52`, reloaded rig `visualScale: 1.52`, centered runtime `rendererBackendStatus: "active"`, `rendererActiveBackend: "webgl"`, `overrideCount: 1`, visible rig bounds about `2.76 x 3.75`.
- Shared web-game client direct run still cannot resolve `playwright` from the `.codex` skill directory; the project-local temporary copy workaround ran successfully, then the temporary file was removed.
- Shared client artifacts: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\wyvern-tuning-web-game-client\shot-0.png`, `shot-1.png`, `state-0.json`, and `state-1.json`.
- Shared client console/page errors: `0`.

Residuals:

- v0 only exposes the player wyvern rig/profile tuning surface. Enemy actors, smoke tuning, cooldowns, and combat profile editing remain outside this pass.
- The overlay is intentionally a local developer tool served by the launcher API; it is not a production network feature.
- The shared client screenshots are not centered on the wyvern in this dark scene, so the centered project-specific screenshot is the meaningful visual proof for the overlay and rig readability.

## Scene Object Foundation v0

Current request: create the foundations, structure, and world/terrain scene objects, starting with trees and boulders as Pokemon-simple one-tile objects before returning to terrain blob rules.

- Added explicit scene object definitions for `tree` and `boulder` with one-tile footprints, simple movement blocking, render palette data, and occlusion radius/height.
- Added map-owned scene object normalization and scenario seeding for the first escape route.
- Wired scene object blocking into the central movement seam so player movement, enemy chase, and lunge impulses all respect the same object tiles.
- Projected scene objects through renderer-neutral `scenery` packets and into explicit occlusion blockers.
- Added a WebGL scenery layer for tile-sized tree/boulder shapes.
- Upgraded occlusion shadows from diagnostic-only to visible screen-space WebGL shadow wedges from explicit scene object blockers.
- Updated debug/text state and docs so scene object counts, scenery diagnostics, and shadow renderability are inspectable.

Validation:

```powershell
npm test
node -e "import('./src/app.js').then(() => console.log('import ok'))"
node tests\locBudget.test.mjs
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5197/`.
- Browser state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\scene-object-browser-proof\scene-object-proof.json`.
- Visible WebGL screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\scene-object-browser-proof\scene-object-full.png`.
- Runtime facts: `sceneObjectCount: 6`, `occlusionBlockers: 6`, `rendererActiveBackend: "webgl"`, `canvas2dRuntimeAvailable: false`, `webglSceneryLayerActive: true`, `webglScenerySourceCount: 6`, `webglSceneryPrimitiveCount: 16`, `webglOcclusionShadowRegions: 2`, `webglOcclusionShadowRenderable: true`, app console/page errors `0`.
- Shared web-game client state also passed with scene objects and shadow diagnostics under `artifacts\scene-object-web-game-client`; its screenshot capture was black in this headless run, so the project-specific screenshot above is the visual proof artifact.

## Grounded Scene Object Scale v0

Current request: ground tree/boulder tile scale in reality relative to the hatchling: assume the baby wyvern is about `1m` body plus `1m` tail, make trees dwarf the player, and leave detailed base/trunk traversal plus shadow-base behaviour for the next pass.

- Added `src/data/worldScale.js` with `hatchling_half_meter_tiles_v0`.
- Set one movement/composition tile to about `0.5m`, so the `1m` body plus `1m` tail hatchling reads as about four tiles nose-to-tail.
- Kept `CONFIG.tileSize` at `32px`; terrain tile size did not change.
- Changed scene objects from one-tile props to grounded multi-tile data:
  - trees: 2x2 coarse trunk/root collision footprint, 6x7 visual crown footprint, 8m physical-height metadata, bounded shadow-height scalar;
  - boulders: 2x2 coarse collision footprint with a slightly larger visual silhouette.
- Split collision footprint and visual footprint through map normalization and renderer-neutral `scenery` projection.
- Updated `WebGLSceneryLayer` to render meter-scaled trees from the large visual crown while anchoring trunk/base on the collision footprint.
- Shifted two scenario objects so the new 2x2 blockers do not overlap enemy starts.
- Expanded `render_game_to_text` scene-object facts with collision size, visual size, scale profile, physical height, collision policy, and occlusion fields.
- Updated architecture/render/shadow docs and next-slice notes. The next scene-object pass should handle base/trunk/crown layering, whether the player can move behind tree parts, and more intentional shadow origin behaviour.

Validation:

```powershell
npm test
node -e "import('./src/app.js').then(() => console.log('import ok'))"
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5197/`.
- Shared web-game client state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\scene-object-scale-web-game-client\state-1.json`.
- Shared client screenshot remained black due the known headless WebGL capture limitation.
- Project-specific visible screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\scene-object-scale-browser-proof\scene-object-scale-full.png`.
- Project-specific state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\scene-object-scale-browser-proof\scene-object-scale-proof.json`.
- Runtime facts: `worldScaleProfileId: "hatchling_half_meter_tiles_v0"`, tree count `3`, boulder count `3`, tree collision `2x2`, tree visual `6x7`, boulder collision `2x2`, wyvern bounds about `2.77 x 3.75` tiles, tree-to-wyvern width ratio `2.17`, tree-to-wyvern height ratio `1.87`, `webglSceneryMode: "meter_scaled_scene_objects_v0"`, `webglSceneryLayerActive: true`, `webglOcclusionShadowRenderable: true`, app console/page errors `0`.

## Raider Humanoid Projection v0

Current request: make the first enemy unit render pass for raiders. Keep the same top-down perspective as the wyvern, use a simple stick-figure projection with visible legs, arms, hands, and head, have the torch/light belong to the carried torch rather than the body, stay aligned with world scale, and leave full shadow polish for a later pass while accounting for collision/shadow/animation state.

- Added `HumanoidProjection` as an ECS component and `humanoidProjectionSystem` as the renderer-neutral raider pose solver.
- Added `raider_top_down_stick_v0` in `src/data/humanoids/raiderHumanoid.js` with scale metadata, body/limb/head/torch dimensions, palette, simple body-collider policy, and deferred body-shadow policy.
- Wired raiders to receive the humanoid projection on spawn while keeping their existing torch `LightEmitter`.
- Solved raider gait into head, shoulders, hips, hands, feet, torch tip, and torch flame points/sockets.
- Bound torch light views to `torch_flame_socket` so the carried torch emits the light, not the unit center.
- Projected raider humanoids through `renderer_neutral_humanoid_visual_projection`.
- Added `WebGLHumanoidSilhouette.js` and actor-layer diagnostics for `raider_top_down_stick_figure_v0`.
- Extended the tuning overlay/runtime so selecting a raider exposes humanoid tuning fields such as limb length, gait stride, and torch length instead of wyvern anatomy fields.
- Expanded browser debug text with raider humanoid profile, part count, motion state, torch socket, and light view socket facts.

Validation:

```powershell
npm test
node tests\locBudget.test.mjs
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5177/`.
- Project-specific visible screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\raider-humanoid-proof\raider-camera.png`.
- Project-specific state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\raider-humanoid-proof\raider-state.json`.
- Shared web-game client proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\raider-humanoid-web-game-client\state-1.json`.
- Runtime facts: raider count `2`, torch light sockets `["torch_flame_socket", "torch_flame_socket"]`, `webglRaiderHumanoidSilhouetteActive: true`, `webglRaiderHumanoidPartCount: 24`, `webglRaiderHumanoidTorchSocketCount: 6`, `webglRaiderHumanoidMode: "raider_top_down_stick_figure_v0"`, active backend `"webgl"`, app console/page errors `0`.

## WebGL Atmospheric Recovery v1

Current request: revisit atmospherics that regressed slightly after the WebGL migration; beautify smoke, lighting, and shadows first, then leave decals/particle effects next and shaders after that.

- Replaced the flat WebGL smoke scaffold with `layered_lit_plume_smoke_v1`.
- `WebGLFogSmokeLayer` now breaks each renderer-neutral smoke source into layered soft radials instead of one flat disc.
- Overlapping renderer-neutral light packets now add bounded warm scatter radials inside smoke, using the existing WebGL radial primitive path rather than a new shader pass.
- `WebGLLightingLayer` now reports `profiled_flicker_light_cutouts_v2` and expands each light into atmospheric halo, soft outer reveal, and warm core primitives.
- Explicit occlusion shadows now report `webgl_layered_soft_shadow_wedges_v1` and render as penumbra plus darker core triangles from the existing projection shadow regions.
- Added fog/smoke layer diagnostics for smoke primitive count, scatter primitive count, contributing scatter light count, and max primitive count in `rendererLayerStats.fogSmoke`.
- Updated renderer docs/README/next-slice notes to keep decals and particles next, with shader work deferred.

Validation so far:

```powershell
node tests\wyvernInputComboSmokeSpit.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\sceneObjectsFoundation.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
```

Status: static and focused runtime-contract validation passing.

Browser proof:

- Local server: `http://127.0.0.1:5207/`.
- Project-specific Playwright proof triggered smoke with right-click input, advanced the real app, captured a visible page screenshot, and saved runtime state:
  - screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-atmospheric-recovery-v1\atmospheric-recovery-full.png`;
  - state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-atmospheric-recovery-v1\atmospheric-recovery-state.json`.
- Project-specific runtime facts: `rendererActiveBackend: "webgl"`, `webglDarknessMode: "profiled_flicker_light_cutouts_v2"`, `webglFogSmokeMode: "layered_lit_plume_smoke_v1"`, fog/smoke `sourceCount: 10`, `primitiveCount: 42`, `smokePrimitiveCount: 28`, `scatterPrimitiveCount: 14`, `contributingLightCount: 14`, lighting `influenceCount: 9`, `occlusionShadowMode: "webgl_layered_soft_shadow_wedges_v1"`, `triangleCount: 16`, console/page errors `0`.
- Shared web-game client ran through the project-local temporary copy workaround, then the temporary client file was removed.
- Shared client artifacts:
  - actions: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-atmospheric-recovery-v1\actions-smoke.json`;
  - screenshots/state: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-atmospheric-recovery-v1\web-game-client\`.
- Shared client runtime facts from `state-1.json`: `rendererActiveBackend: "webgl"`, `webglDarknessMode: "profiled_flicker_light_cutouts_v2"`, `webglLightingInfluenceCount: 21`, `webglOcclusionShadowMode: "webgl_layered_soft_shadow_wedges_v1"`, `webglFogSmokeMode: "layered_lit_plume_smoke_v1"`, `webglFogSmokePrimitiveCount: 63`, fog/smoke layer `smokePrimitiveCount: 22`, `scatterPrimitiveCount: 41`, `contributingLightCount: 41`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`.
- Shared client screenshots remained black due the known headless WebGL capture limitation, so the project-specific screenshot above is the visual proof artifact.

## Liquid Napalm Decal Pools v1

Current request: focus on decals by making wyvern napalm drool/droplets land as smaller residual flaming liquid pools instead of bright emission orbs, while proving a reusable decal/pooling pipeline for later combat blood spatter and pooling.

- Retuned the wyvern napalm pool recipe toward small residue: radius `0.21`, bounded jitter, lower-opacity body/hot colours, local light radius `0.44`, and light intensity `0.22`.
- Added renderer-neutral liquid metadata to napalm pool state and `groundHazards` projection: `visualMaterial: "residual_liquid_napalm_pool_v1"`, `poolShape: "irregular_low_pool"`, rim/cooling colours, body/rim/hot-spot scales, and bounded hot-spot count.
- Replaced the WebGL decal scaffold mode with `liquid_ground_hazard_decal_v1`.
- `WebGLDecalLayer` now expands one visible napalm pool into scorch/rim/body/lobe/hot-spot radial primitives instead of two centered hot discs.
- Added decal-layer diagnostics for `liquidPoolCount`, `liquidPoolPrimitiveCount`, and `hotSpotPrimitiveCount`.
- Added `tests/webglNapalmDecalPipeline.test.mjs` and expanded napalm/projection hierarchy tests so the recipe, projection, WebGL mode, and primitive expansion contract are locked.
- Updated renderer/napalm docs and next-slice notes so particles remain next and shader work stays deferred.

Validation:

```powershell
node tests\napalmDribble.test.mjs
node tests\webglNapalmDecalPipeline.test.mjs
node tests\webglRendererHierarchy.test.mjs
npm test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5213/`.
- Project-specific proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\napalm-liquid-pool-v1\proof.mjs`.
- Project-specific full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\napalm-liquid-pool-v1\napalm-liquid-pool-full.png`.
- Project-specific zoomed inspection screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\napalm-liquid-pool-v1\napalm-liquid-pool-zoom.png`.
- Project-specific state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\napalm-liquid-pool-v1\napalm-liquid-pool-state.json`.
- Project-specific runtime facts: `napalmPools: 5`, `webglDecalMode: "liquid_ground_hazard_decal_v1"`, decal layer `sourceCount: 10`, `primitiveCount: 50`, `liquidPoolCount: 5`, `liquidPoolPrimitiveCount: 45`, `hotSpotPrimitiveCount: 15`, app console issues `0`, page errors `0`. Raw Chromium WebGL `ReadPixels` warnings appeared during screenshot capture only.
- Shared web-game client actions: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\napalm-liquid-pool-v1\actions-left-trail.json`.
- Shared web-game client artifacts: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\napalm-liquid-pool-v1\web-game-client\`.
- Shared client runtime facts from `state-1.json`: `rendererActiveBackend: "webgl"`, `webglDecalMode: "liquid_ground_hazard_decal_v1"`, `napalmPools: 12`, decal layer `sourceCount: 24`, `primitiveCount: 120`, `liquidPoolCount: 12`, `liquidPoolPrimitiveCount: 108`, `hotSpotPrimitiveCount: 36`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`.
- Shared client produced no `errors-*.json` files. Its screenshots remained black due the known headless WebGL capture limitation, so the project-specific screenshots above remain the visual proof.

## WebGL Anchored Shadow Falloff v1

Current request: focus this pass on shadows after the atmospheric and decal improvements, improving the visible WebGL shadow read without jumping ahead to shader work.

- Replaced the renderer-neutral occlusion policy with `nearby_static_blocker_anchored_falloff_wedge_v1`.
- Added lighting-profile shadow controls for contact scale, penumbra scale, and core falloff bands.
- Expanded projected shadow regions with explicit direction, normal, length, near/far width, contact radius, light radius, blocker kind, and `anchored_falloff_shadow_wedge_v1` quality metadata.
- Replaced WebGL shadow slabs with `webgl_anchored_falloff_shadow_wedges_v2`.
- Each region now renders one soft penumbra quad, three darker falloff core bands, and an oriented contact patch at the blocker base.
- Added WebGL diagnostics for penumbra, core, contact, and segment counts through layer stats and flattened render status.
- Updated shadow, renderer migration, README, and next-slice docs so shader/per-pixel shadow work remains deferred.

Validation:

```powershell
node tests\occlusionShadowFoundation.test.mjs
node tests\sceneObjectsFoundation.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\webglRendererHierarchy.test.mjs
npm test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5215/`.
- Project-specific proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\shadow-anchored-falloff-v1\proof.mjs`.
- Project-specific full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\shadow-anchored-falloff-v1\shadow-falloff-full.png`.
- Project-specific zoomed inspection screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\shadow-anchored-falloff-v1\shadow-falloff-zoom.png`.
- Project-specific state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\shadow-anchored-falloff-v1\shadow-falloff-state.json`.
- Project-specific runtime facts: `webglOcclusionShadowMode: "webgl_anchored_falloff_shadow_wedges_v2"`, `webglOcclusionShadowRegions: 2`, `webglShadowPenumbraTriangleCount: 4`, `webglShadowCoreTriangleCount: 12`, `webglShadowContactTriangleCount: 16`, `webglShadowSegmentCount: 6`, app console issues `0`, page errors `0`. Raw Chromium WebGL `ReadPixels` warnings appeared during screenshot capture only.
- Shared web-game client actions: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\shadow-anchored-falloff-v1\actions-shadow-idle.json`.
- Shared web-game client artifacts: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\shadow-anchored-falloff-v1\web-game-client\`.
- Shared client runtime facts from `state-1.json`: `rendererActiveBackend: "webgl"`, `webglOcclusionShadowMode: "webgl_anchored_falloff_shadow_wedges_v2"`, lighting layer `occlusionShadowRegions: 3`, `shadowPenumbraTriangleCount: 6`, `shadowCoreTriangleCount: 18`, `shadowContactTriangleCount: 24`, `shadowSegmentCount: 9`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`.
- Shared client produced no `errors-*.json` files. The project-specific screenshots above remain the visual proof artifacts.

## SDF-Ready Shadow Field Bridge v1

Current request: make the next shadow slice the best structural step toward SDF shadows, reusing useful pre-WebGL seams without jumping into a full shader pass.

- Reused the pre-migration architectural lesson from `BLACK_SKY_BOUND_FFP`: final shadows are derived from physical object/light truth, not authored per-object shadow blobs.
- Replaced the shadow policy with `nearby_static_blocker_sdf_ready_shadow_field_v1`.
- Added the renderer-neutral field contract `black-sky-bound.render-shadow-field.sdf-ready.v1`.
- `occlusionShadows` now emits SDF-ready `derived_sdf_ready_shadow_field_packet` packets beside the existing shadow regions.
- Each field packet carries a `screen_space_tapered_capsule_sdf` kernel, blocker/light provenance, sampled field points, radius, dimness, softness, and a future-shader note.
- `WebGLLightingLayer` now reports `webgl_sdf_ready_shadow_field_wedges_v3` and renders the sampled field points as soft screen-space radial primitives alongside the existing contact/core/penumbra geometry.
- Added WebGL and renderer-layer diagnostics for `shadowFieldPacketCount`, `shadowFieldSampleCount`, and `shadowFieldPrimitiveCount`.
- Updated shadow, renderer migration, README, and next-slice docs to mark this as SDF-ready structure, not texture-backed or shader-evaluated SDF yet.

Validation:

```powershell
node tests\occlusionShadowFoundation.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\sceneObjectsFoundation.test.mjs
node tests\webglRendererHierarchy.test.mjs
npm test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5216/`.
- Project-specific proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\sdf-ready-shadow-field-v1\proof.mjs`.
- Project-specific full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\sdf-ready-shadow-field-v1\sdf-ready-shadow-field-full.png`.
- Project-specific zoomed inspection screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\sdf-ready-shadow-field-v1\sdf-ready-shadow-field-zoom.png`.
- Project-specific state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\sdf-ready-shadow-field-v1\sdf-ready-shadow-field-state.json`.
- Project-specific runtime facts: `webglOcclusionShadowMode: "webgl_sdf_ready_shadow_field_wedges_v3"`, `webglOcclusionShadowRegions: 2`, `webglShadowFieldPacketCount: 2`, `webglShadowFieldSampleCount: 10`, `webglShadowFieldPrimitiveCount: 10`, probe contract `black-sky-bound.render-shadow-field.sdf-ready.v1`, probe packet count `2`, app console issues `0`, page errors `0`. Raw Chromium WebGL `ReadPixels` warnings appeared during screenshot capture only.
- Shared web-game client direct skill-path run failed because the skill script could not resolve the project-local `playwright` package from `C:\Users\felix\.codex\skills\develop-web-game\scripts\`. The project-local temporary copy workaround was used, then the temporary client was removed.
- Shared web-game client actions: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\sdf-ready-shadow-field-v1\actions-shadow-idle.json`.
- Shared web-game client artifacts: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\sdf-ready-shadow-field-v1\web-game-client\`.
- Shared client runtime facts from `state-1.json`: `rendererActiveBackend: "webgl"`, `webglOcclusionShadowMode: "webgl_sdf_ready_shadow_field_wedges_v3"`, lighting layer `occlusionShadowRegions: 3`, `shadowFieldPacketCount: 3`, `shadowFieldSampleCount: 15`, `shadowFieldPrimitiveCount: 15`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`.
- Shared client produced no `errors-*.json` files. Its screenshots remain black due the known generic headless WebGL capture limitation, so the project-specific screenshots above remain the visual proof.

## WebGL SDF Shadow Shader Consumer v0

Current request: proceed from the SDF-ready shadow field bridge into the best structural step toward SDF shadows, while keeping FPS/frame packet diagnostics visible.

- Added a bounded screen-space tapered-capsule SDF shader primitive to `WebGLSceneRoot`.
- Switched `WebGLLightingLayer` to consume `black-sky-bound.render-shadow-field.sdf-ready.v1` kernels directly through `webgl_bounded_capsule_sdf_shadow_shader_v0`.
- Kept explicit scene-object blockers and `occlusionShadows` as the canonical truth/projection source; no FFP renderer path, terrain-height shadows, actor shadows, LoS, stealth, or gameplay dimness authority moved across.
- Preserved sampled field points as packet/probe diagnostics while the active WebGL field path now renders one bounded shader primitive per accepted packet instead of one radial primitive per sample.
- Added a debug-only CPU field probe (`sampleSdfReadyShadowFieldAt`) so future shader work can compare against the packet contract without making shadows gameplay truth.
- Added frame-packet diagnostics for `webglShadowShaderMode`, `webglShadowShaderPacketCount`, and `webglShadowShaderPrimitiveCount` alongside existing packet/sample/primitive fields.
- Added `performance` to `render_game_to_text()` so FPS, frame ms, and frame number are captured in browser proof packets.

Validation:

```powershell
node tests\occlusionShadowFoundation.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\sceneObjectsFoundation.test.mjs
node tests\webglRendererHierarchy.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing. Direct `npm test` through PowerShell is still blocked by the local `npm.ps1` execution policy, so `npm.cmd test` is the passing test command on this machine.

Browser proof:

- Local server: `http://127.0.0.1:5220/`.
- Project-specific proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-sdf-shadow-shader-v0\proof.mjs`.
- Bundled Playwright Chromium launch hit local `spawn EPERM`; the proof script fell back to installed Edge (`msedge`) and passed.
- Project-specific full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-sdf-shadow-shader-v0\webgl-sdf-shadow-shader-full.png`.
- Project-specific zoomed inspection screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-sdf-shadow-shader-v0\webgl-sdf-shadow-shader-zoom.png`.
- Project-specific state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-sdf-shadow-shader-v0\webgl-sdf-shadow-shader-state.json`.
- Runtime facts: `rendererActiveBackend: "webgl"`, `webglOcclusionShadowMode: "webgl_bounded_capsule_sdf_shadow_shader_v0"`, `webglShadowFieldPacketCount: 2`, `webglShadowFieldSampleCount: 10`, `webglShadowFieldPrimitiveCount: 2`, `webglShadowShaderPacketCount: 2`, `webglShadowShaderPrimitiveCount: 2`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, `renderTimingFrame: 310`, `renderTotalMs: 0.8`, `rendererTotalRenderMs: 0.3`, FPS packet `240`, frame ms `3.2`, app console/page errors `0`.
- Shared web-game client direct skill-path run still cannot resolve `playwright` from the `.codex` skill folder. The project-local temporary copy workaround was used with Edge, then the temporary client file was removed.
- Shared web-game client artifacts: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-sdf-shadow-shader-v0\web-game-client\`.
- Shared client runtime facts from `state-1.json`: `rendererActiveBackend: "webgl"`, `webglOcclusionShadowMode: "webgl_bounded_capsule_sdf_shadow_shader_v0"`, lighting layer `shadowFieldPacketCount: 4`, `shadowFieldSampleCount: 20`, `shadowFieldPrimitiveCount: 4`, `shadowShaderPacketCount: 4`, `shadowShaderPrimitiveCount: 4`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, FPS packet `119.45`, frame ms `1.7`.
- Shared client produced no `errors-*.json` files. Its screenshots remain black due the known generic WebGL capture limitation, so the project-specific screenshots above remain the visual proof.

## WebGL Shadow Composite Tuning v0

Current request: make the active SDF shadow path look smoother, rounder, and more naturally blended against torch light/darkness while preserving FPS/frame packet visibility.

- Added profile-owned `light_shadow_attenuation_blend_v0` controls to the early-night lighting profile and projected lighting profile packet.
- Extended the WebGL SDF shadow primitive with a compact blend vector for penumbra gamma, shadow/light blend strength, far-tail fade, and contact boost.
- Tuned `WebGLLightingLayer` to apply profiled SDF radius scale, far-tail taper, edge softness, density, contact strength, and softer light halo/core balance.
- Kept explicit blockers, `occlusionShadows`, and `black-sky-bound.render-shadow-field.sdf-ready.v1` as the canonical projection truth; this is a renderer-side composite/beauty pass, not terrain-height shadows, actor shadows, LoS, gameplay dimness, or a full SDF atlas.
- Added diagnostics for `webglShadowCompositeMode`, `webglShadowBlendStrength`, `webglShadowFieldEdgeSoftness`, `webglShadowFieldPenumbraGamma`, `webglShadowFieldTailFloor`, and `webglShadowLightHaloBlendScale`.

Validation:

```powershell
node tests\webglLightingLiveWiring.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\sceneObjectsFoundation.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
git diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5220/`.
- Project-specific proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-composite-tuning-v0\proof.mjs`.
- Project-specific full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-composite-tuning-v0\webgl-shadow-composite-full.png`.
- Project-specific zoomed inspection screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-composite-tuning-v0\webgl-shadow-composite-zoom.png`.
- Project-specific state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-composite-tuning-v0\webgl-shadow-composite-state.json`.
- Runtime facts: `rendererActiveBackend: "webgl"`, `webglOcclusionShadowMode: "webgl_bounded_capsule_sdf_shadow_shader_v0"`, `webglShadowCompositeMode: "light_shadow_attenuation_blend_v0"`, `webglShadowBlendStrength: 0.82`, `webglShadowFieldEdgeSoftness: 1.22`, `webglShadowFieldPenumbraGamma: 1.32`, `webglShadowFieldTailFloor: 0.34`, `webglShadowLightHaloBlendScale: 1.16`, `webglShadowFieldPacketCount: 2`, `webglShadowFieldSampleCount: 10`, `webglShadowShaderPrimitiveCount: 2`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, `renderTimingFrame: 312`, `renderTotalMs: 0.8`, `rendererTotalRenderMs: 0.5`, FPS packet `239.9`, frame ms `3.6`, app console/page errors `0`.

## WebGL Scene-Object SDF Silhouettes v0

Current request: complete the current bounded SDF shadow implementation enough that scene-object shadows visibly change shape, and compare screenshots before calling the pass finished.

- Added renderer-neutral `scene_object_shadow_silhouette.v1` profiles to scene-object occlusion data.
- Trees now emit trunk and crown-lobe SDF packets; boulders emit core and faceted stone packets.
- `buildSceneObjectOcclusionBlockers` carries silhouette data into explicit blocker truth without changing movement/collision truth.
- `occlusionShadows` now emits multiple `black-sky-bound.render-shadow-field.sdf-ready.v1` packets per visible shadow region when the blocker has a compound silhouette.
- `WebGLLightingLayer`, renderer status, and render-layer stats now report `webglShadowSilhouettePrimitiveCount`.
- Retuned the lighting profile so broad legacy wedge geometry is lower-density and the compound SDF primitives carry the visible shadow mass.
- This completes the current bounded scene-object SDF path; full-screen SDF atlases, terrain-height shadows, actor/wyvern rig shadows, and gameplay visibility remain separate future slices.

Focused validation:

```powershell
node tests\occlusionShadowFoundation.test.mjs
node tests\sceneObjectsFoundation.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\webglRendererHierarchy.test.mjs
```

Browser proof:

- Local server: `http://127.0.0.1:5220/`.
- Proof command: `node artifacts\webgl-shadow-composite-tuning-v0\proof.mjs`.
- Slice proof folder: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-silhouette-sdf-v0\`.
- Current full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-silhouette-sdf-v0\webgl-shadow-silhouette-full.png`.
- Current zoom screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-silhouette-sdf-v0\webgl-shadow-silhouette-zoom.png`.
- Current state proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-silhouette-sdf-v0\webgl-shadow-silhouette-state.json`.
- Before/after comparison: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-silhouette-sdf-v0\compare-sdf-v0-vs-silhouette-sdf-v0.png`.
- Difference map: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-shadow-silhouette-sdf-v0\diff-sdf-v0-vs-silhouette-sdf-v0.png`.
- Runtime facts from focused proof: `rendererActiveBackend: "webgl"`, `webglShadowFieldPacketCount: 6`, `webglShadowSilhouettePrimitiveCount: 6`, `webglShadowShaderPrimitiveCount: 6`, `webglShadowFieldSampleCount: 30`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`.
- Before/after pixel comparison against `webgl-sdf-shadow-shader-v0`: average channel delta `5.283 / 255`, changed pixels over threshold 12: `44.309%`, max RGB-sum delta `136`.

## WebGL Dynamic Actor SDF Shadows v0

Current request: continue the SDF shadow implementation by making the next structural step toward smoother, rounder dynamic shadows, with screenshot comparison against the previous pass and FPS/frame packet evidence.

- Added render-only actor shadow blockers in `src/projection/actorShadowSilhouettes.js`.
- Dynamic actor blockers derive from renderer-neutral actor visual projection data, not gameplay collision or `game.occlusionBlockers`.
- Wyvern shadows use rig-derived multi-lobe silhouettes for head/chest/hips/tail/wings/hind legs.
- Humanoid shadows use body/head/limb lobes from humanoid projection points, so torch-bearing raiders now contribute actor-shaped SDF packets instead of only scene-object shadows.
- Generic alive actors get a small fallback visual actor lobe so future creature silhouettes have a structural landing point.
- Split generic shadow-blocker projection into `src/projection/shadowBlockerProjection.js` to keep `renderProjection.js` under the 500-LoC budget.
- Extended SDF field packets with `blockerSource`, `staticBlocker`, actor silhouette contract propagation, actor blocker count, and actor packet count diagnostics.
- Updated occlusion/lighting policy strings to `nearby_scene_and_dynamic_actor_sdf_ready_shadow_field_v1` and raider humanoid shadow policy to `visual_actor_sdf_shadow_projection_v1`.

Validation:

```powershell
node tests\actorShadowSilhouettes.test.mjs
node tests\occlusionShadowFoundation.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\webglLightingLiveWiring.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
git diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5221/`.
- Proof command: `$env:BSB_PROOF_URL='http://127.0.0.1:5221/'; node artifacts\webgl-actor-sdf-shadows-v0\proof.mjs`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-actor-sdf-shadows-v0\proof.mjs`.
- Full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-actor-sdf-shadows-v0\webgl-actor-sdf-shadows-full.png`.
- Actor-focused screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-actor-sdf-shadows-v0\webgl-actor-sdf-shadows-focus.png`.
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-actor-sdf-shadows-v0\webgl-actor-sdf-shadows-state.json`.
- Before/after comparison against previous scene-object SDF pass: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-actor-sdf-shadows-v0\compare-silhouette-vs-actor-sdf-full.png`.
- Difference map: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-actor-sdf-shadows-v0\diff-silhouette-vs-actor-sdf-full.png`.
- Runtime facts: `rendererActiveBackend: "webgl"`, `webglShadowFieldPacketCount: 45`, `webglShadowShaderPrimitiveCount: 45`, `webglShadowSilhouettePrimitiveCount: 45`, `activeActorShadowBlockers: 6`, `occlusionActorShadowFieldPacketCount: 39`, previous artifact `webglShadowFieldPacketCount: 6`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, FPS packet `239.9`, frame ms `4.2`, app console/page errors `0`.

Residual:

- This pass establishes dynamic actor SDF packet ownership and visible humanoid actor self-shadows from torch light. Wyvern SDF shadow generation is covered by `tests\actorShadowSilhouettes.test.mjs` with a validation light, but the default browser scenario does not naturally place the player inside a strong nearby light yet.
- Shadow lobes are still bounded capsule SDF packets, not a full actor SDF atlas or per-pixel alpha mask. The next visual quality step is to add silhouette-aware orientation/atlas shaping in the shader path.

## WebGL Z-Layer Ordering v0

Current request: broad z-layer ordering fixes so shadow pools no longer render over unit bodies, and scenery can foreground/background actors by world depth rather than all units always drawing on top.

- Reordered the WebGL registry to render terrain, decals, and lighting/shadow pools before the sortable world layer.
- Added `WebGLWorldDepthLayer` with mode `y_sorted_world_depth_v0`; it combines scenery and actors into one depth-sorted draw list.
- Split actor and scenery layer builders into reusable depth-item helpers while preserving their legacy direct layer behavior for tests and diagnostics.
- World-depth items sort by `depthY`, then `sortBias`, so actors above a trunk/base render behind it and actors below the base render in front.
- Renderer diagnostics now expose `webglWorldDepthLayerActive`, `webglWorldDepthMode`, `webglWorldDepthItemCount`, and split scenery/actor source and primitive counts from the world-depth layer.
- Lighting still owns darkness, light influence, shadow packets, and SDF shadow fields; this slice changes compositing order and depth ownership, not shadow shape generation.

Validation:

```powershell
node tests\webglWorldDepthLayer.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\sceneObjectsFoundation.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
git diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5221/`.
- Proof command: `$env:BSB_PROOF_URL='http://127.0.0.1:5221/'; node artifacts\webgl-z-layer-ordering-v0\proof.mjs`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-z-layer-ordering-v0\proof.mjs`.
- Full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-z-layer-ordering-v0\webgl-z-layer-ordering-full.png`.
- Shadow/actor stacking screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-z-layer-ordering-v0\webgl-z-layer-ordering-shadow-focus.png`.
- Tree-behind screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-z-layer-ordering-v0\webgl-z-layer-ordering-tree-behind.png`.
- Tree-front screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-z-layer-ordering-v0\webgl-z-layer-ordering-tree-front.png`.
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\webgl-z-layer-ordering-v0\webgl-z-layer-ordering-state.json`.
- Runtime facts: `rendererActiveBackend: "webgl"`, `webglLayerOrder: ["terrain","decals","lighting","worldDepth","effects","fogSmoke","postProcess","hudDebug"]`, `webglWorldDepthMode: "y_sorted_world_depth_v0"`, `webglWorldDepthItemCount: 3`, `webglShadowFieldPacketCount: 40`, `webglShadowShaderPrimitiveCount: 40`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, FPS packet `239.95`, frame ms `3.9`, app console/page errors `0`.
- Comparison notes: the previous actor-SDF focus artifact showed a shadow mass/tint composited over a raider body; the new shadow focus frame keeps unit silhouettes crisp above lighting/shadow material. The staged tree proof reports player/tree draw order `playerIndex 0 < treeIndex 2` when behind, and `playerIndex 2 > treeIndex 1` when in front.

Residual:

- This establishes the broad draw-order contract. Future polish can add richer per-object occluder silhouettes, trunk/canopy masks, and actor footprint anchors, but those now land on top of a stable world-depth layer instead of fighting the base layer stack.

## Ambient Particles v0

Current request: start the smoke trails, flame/sparks, ash, and leaves work by laying proper structural groundwork rather than adding one-off visual hacks.

- Added `ambient_particles_projection_v0` as a renderer-neutral projection path.
- Added particle recipes for `torch_spark`, `napalm_ember`, `smoke_trail_mote`, `ash_fleck`, and `leaf_drift`, each with explicit source authority and visual role metadata.
- Particle packets are derived from existing truth/projection sources: torch light sockets, active napalm pools, smoke source views, and projected tree scenery.
- Added `RENDER_BUDGETS.ambientParticles` with a 96-particle cap and high-priority overflow policy.
- Split projectile/live-effect packet builders into `src/projection/effectProjection.js` so `renderProjection.js` stays under the LoC budget while adding the particle key.
- Upgraded `WebGLEffectLayer` to `webgl_effects_particles_v0`; it now consumes `projection.particles` and batches particles into cheap WebGL radial, triangle, and rect primitives.
- Renderer/frame diagnostics now expose `webglEffectMode`, `webglParticleCount`, `webglParticlePrimitiveCount`, and `webglParticleBudgetMax`.
- This pass does not make particles gameplay truth. The particles are deterministic render projections, not ECS actors, decals, status effects, or persisted simulation entities.

Validation:

```powershell
node tests\ambientParticles.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\renderLayerFoundation.test.mjs
node tests\unifiedSmokeSources.test.mjs
node tests\wyvernInputComboSmokeSpit.test.mjs
node tests\webglNapalmDecalPipeline.test.mjs
node tests\webglLightingLiveWiring.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('import ok'))"
git diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5221/`.
- Proof command: `$env:BSB_PROOF_URL='http://127.0.0.1:5221/'; node artifacts\ambient-particles-v0\proof.mjs`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\ambient-particles-v0\proof.mjs`.
- Full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\ambient-particles-v0\ambient-particles-full.png`.
- Focus screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\ambient-particles-v0\ambient-particles-focus.png`.
- Before/after comparison against the previous z-layer proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\ambient-particles-v0\compare-zlayer-vs-ambient-particles-full.png`.
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\ambient-particles-v0\ambient-particles-state.json`.
- Runtime facts: `rendererActiveBackend: "webgl"`, `webglEffectMode: "webgl_effects_particles_v0"`, `webglParticleCount: 64`, `webglParticlePrimitiveCount: 57`, `webglParticleBudgetMax: 96`, effect-layer `radialCount: 26`, `triangleCount: 9`, `rectCount: 23`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, FPS packet `240.32`, frame ms `5.3`, app console/page errors `0`.
- Particle kinds observed in the proof: `ash_fleck`, `leaf_drift`, `napalm_ember`, `smoke_trail_mote`, `torch_spark`.

Residual:

- This is the structural particle lane, not final VFX art. The next polish slice can tune density, colour, scale, source placement, and source-specific motion once we see it in longer play.
- Smoke body rendering still belongs to `WebGLFogSmokeLayer`; this particle pass only adds small trail/mote/fleck detail around that existing smoke field.
- Blood spatter/pooling should reuse this separation later: transient particles in the effect/particle lane, persistent pools/stains in decal or ground-hazard projection.

## Blood Impact v0

Current request: begin combat blood readability/beautification with the first visible seam, proving the future spatter/pooling pipeline through real attack hits rather than a renderer-only demo.

- Wired wyvern attack contact resolution into recipe-owned visuals: bite/claw contacts now emit `BITE_HIT`, and lunge contacts emit `BODY_LUNGE`.
- Upgraded `BITE_HIT` and `BODY_LUNGE` recipes with dark blood mist, directional spatter, and `residual_blood_spatter_stain_v0` decal material metadata while preserving the existing attack flash/scuff beats.
- Extended live-effect projection packets with renderer-neutral visual role, recipe id, life, opacity, softness, particle count, spread, and impact direction fields.
- Added WebGL blood rendering in the effect layer: blood mist batches to soft radial motes, spatter batches to directional streak triangles plus droplet radials, and counters report `bloodEffectCount`/`bloodPrimitiveCount`.
- Added WebGL blood stain rendering in the decal layer: blood decals render as irregular multi-radial stains and report `bloodStainCount`/`bloodStainPrimitiveCount`.
- Converted old square slash/lunge/hurt live-effect fills into directional primitive flashes so combat hits no longer produce pale slab artifacts over units.
- Made projected attack-contact debug fills opt-in instead of always visible during active contact phases, keeping contact data available without blocking gameplay readability.

Validation:

```powershell
node tests\bloodImpactVisuals.test.mjs
node tests\physicsInformedWyvernAttack.test.mjs
node tests\renderLayerFoundation.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\ambientParticles.test.mjs
node tests\webglNapalmDecalPipeline.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5221/`.
- Proof command: `$env:BSB_PROOF_URL='http://127.0.0.1:5221/'; node artifacts\blood-impact-v0\proof.mjs`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\blood-impact-v0\proof.mjs`.
- Baseline screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\blood-impact-v0\blood-impact-baseline.png`.
- Active blood screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\blood-impact-v0\blood-impact-active.png`.
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\blood-impact-v0\blood-impact-state.json`.
- Runtime facts: `rendererActiveBackend: "webgl"`, `webglEffectMode: "webgl_effects_particles_v0"`, baseline blood effects/primitives `0/0`, active blood effects/primitives `2/23`, active blood stain count/primitives `1/7`, `damageApplied: 22`, `effectKinds: ["blood_mist","blood_spatter_arc"]`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, render timing `rendererTotalRenderMs: 1.1`, `renderTotalMs: 2.3`, app console/page errors `0`.
- Comparison notes: the baseline proof frame has no blood packets. The active proof frame shows a real bite contact producing red mist/spatter and a grounded stain; screenshot inspection also caught and removed the old pale square debug/hurt artifacts before this pass was accepted.

Residual:

- This proves transient blood mist/spatter plus a small stain/decal route. Full blood pooling, surface spreading, expiry/fade rules, corpse/kill variants, and hit-source-specific silhouettes remain future slices.
- Enemy contact now avoids the old square `hurt` slab, but it still uses a generic impact flash rather than a full recipe-owned blood/contact visual. That is a good follow-up if we want all unit attacks to share the same blood material pipeline.

## Terrain Connected Tiles v0

Current request: bring forward the dormant blob/connected terrain rules and the old FFP spline shape for drawing grass/dirt terrain tiles, then visually test on the playtest map. A later AXIOM IDE tile-painting panel pass stays out of scope.

- Promoted grass into `buildAllBlobMasks()` so both grass and dirt have prebuilt 16-mask terrain records.
- Enriched resolved 4-way rules with a terrain rule contract, model, directions, connection counts, rotation, and cap/tee metadata.
- Added `black-sky-bound.terrain-tile-spline.v0` as a compact derived projection segment for terrain tiles, using connected-rule joinery/orientation without creating a new authored spline truth store.
- Terrain projection now emits renderer-neutral terrain tile packets with `connectedRule` and `terrainSpline` for grass and dirt.
- WebGL terrain rendering now consumes those packets through `webgl_connected_terrain_16mask_spline_v0`, drawing subtle grass boundary treatment and clearer dirt edge/stem/corner primitives.
- The pass keeps terrain visual-only: no height, shadow, collision, occlusion, AXIOM panel, or 47-rule blob autotile promotion yet.

Validation so far:

```powershell
node tests\connectedRules.test.mjs
node tests\blobRules.test.mjs
node tests\terrainConnectedTiles.test.mjs
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
```

Full validation:

```powershell
node tests\connectedRules.test.mjs
node tests\blobRules.test.mjs
node tests\terrainConnectedTiles.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5221/`.
- Proof command: `$env:BSB_PROOF_URL='http://127.0.0.1:5221/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\terrain-connected-tiles-v0\proof.mjs`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-connected-tiles-v0\proof.mjs`.
- Full screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-connected-tiles-v0\terrain-connected-full.png`.
- Focus screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-connected-tiles-v0\terrain-connected-focus.png`.
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-connected-tiles-v0\terrain-connected-state.json`.
- Runtime facts: `rendererActiveBackend: "webgl"`, terrain mode `webgl_connected_terrain_16mask_spline_v0`, visible base tiles `77`, terrain primitives `259`, terrain rects `243`, terrain triangles `16`, terrain light-space mode `webgl_light_space_render_detail_gate_v0`, connected grass tiles `787`, connected dirt tiles `50`, dirt roles `cap/corner/cross/tee`, terrain spline contract `black-sky-bound.terrain-tile-spline.v0`, `rendererTextureUploads: 0`, `canvas2dRuntimeAvailable: false`, app console/page errors `0`.
- Screenshot inspection: the normal play view remains low-clutter, and the focused proof shows the lit dirt patch with connected edge/stem/corner treatment against grass.
- Generic `$WEB_GAME_CLIENT` attempt remains tooling-blocked: running `C:\Users\felix\.codex\skills\develop-web-game\scripts\web_game_playwright_client.js` cannot resolve its own `playwright` import from the skill directory even though project-local `node_modules\playwright` exists.

## Terrain Connected Tiles v1 Repair

Current correction: replace the visible dirt grid/stem treatment with a proper blended terrain surface, repair the screenshot evidence loop, and investigate the reported player rubber-band.

- Added a WebGL texture-quad helper and changed the terrain layer to render a cached sampled terrain texture instead of visible per-tile base rectangles in the browser.
- Ported the relevant FFP sampled-terrain idea into the WebGL terrain layer: neighbour terrain membership blending, material noise, dirt/grass colour variation, and 16-mask dirt corner shaping.
- Kept the 16-mask/spline projection contracts intact for grass and dirt, but now use the rule output for texture shaping and subtle exposed dirt boundary details rather than central grid/stem marks.
- Added a runtime proof toggle: `?terrainTexture=off` forces the old rect fallback for before/after screenshot comparison.
- Split `WebGLTextureQuad.js` out of `WebGLSceneRoot.js` after the LoC gate caught the first implementation crossing 500 lines.
- Added repair proof scripts for terrain visual comparison, movement/camera tracing, and multi-direction rubber-band sweeping.

Validation:

```powershell
node tests\terrainConnectedTiles.test.mjs
node tests\connectedRules.test.mjs
npm test
$env:BSB_PROOF_URL='http://127.0.0.1:5222/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\terrain-repair-v1\terrain-visual-proof.mjs
$env:BSB_PROOF_URL='http://127.0.0.1:5222/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\terrain-repair-v1\movement-and-visual-probe.mjs
$env:BSB_PROOF_URL='http://127.0.0.1:5222/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\terrain-repair-v1\camera-follow-probe.mjs
$env:BSB_PROOF_URL='http://127.0.0.1:5222/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\terrain-repair-v1\rubber-band-sweep.mjs
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5222/`.
- Before/fallback screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-repair-v1\terrain-legacy-rects.png`.
- After/texture screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-repair-v1\terrain-texture-blend.png`.
- Terrain proof state: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-repair-v1\terrain-visual-proof-state.json`.
- Movement screenshots: `current-before.png`, `current-after-move.png`, `current-after-release.png` under `artifacts\terrain-repair-v1`.
- Movement proof state: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-repair-v1\movement-and-visual-state.json`.
- Camera proof state: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-repair-v1\camera-follow-probe-state.json`.
- Rubber-band sweep state: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\terrain-repair-v1\rubber-band-sweep-state.json`.
- Runtime terrain facts: fallback path `terrainTextureActive: false`, `terrainTextureDisabledByRuntime: true`, `objectCount: 228`; texture path `terrainTextureActive: true`, `terrainTextureUploadCount: 1`, `objectCount: 1`, `rectCount: 36`, `radialCount: 66`, `triangleCount: 16`, console/page errors `0`.
- Movement facts: right-move probe started at `6.5,15.5`, moved to `7.97,15.5`, ended at `7.97,15.5`, `snappedNearStart: false`, console/page errors `0`.
- Camera facts: default-load camera followed from `208,496` to `255.04,496` and did not snap back; player HP dropped under enemy pressure, but the player transform stayed at the moved position.
- Sweep facts: `d/a/w/s/ArrowRight/ArrowUp` all ended away from start with `snappedNearStart: false`.

Residual:

- I could not reproduce a player-position or camera snap-back in automated Edge runs. The evidence does show fast HP loss and start-area enemy pressure when moving right into the boulder/raider cluster, so a player-observed "rubber band" may need an exact input/browser/state repro clip if it still happens locally.
- Terrain now removes the dirt-grid read and proves a texture-backed path, but fuller biome art direction, a real atlas/autotile set, and AXIOM first-class painting panels remain later slices.

## World-Depth Light/Shadow Relationship v0

Current request: make light and shadows affect generic scene objects/entities without letting local shadow pooling turn trees, boulders, wyvern, or stickmen into black blobs.

- Split WebGL lighting ownership into two compositing positions:
  - `shadows` renders ground/contact SDF shadow material after terrain/decals but before `worldDepth`;
  - `lighting` renders darkness plus emitted light reveal after `worldDepth`.
- Updated the layer contract to `black-sky-bound.webgl-ground-shadows-under-world-depth-light-over-world-depth.v0`.
- Kept the relationship generic: world-depth scenery and actors receive darkness/light influence together, while shadow/contact pooling stays underneath their silhouettes.
- Exposed raider humanoid world-depth diagnostics in flattened render stats so proof output reports stickman participation without digging into nested layer state.
- Added a browser proof script that stages boulders, tree, wyvern, and torch-bearing raiders, captures a lit frame and a no-light dark-composite frame, and asserts:
  - `shadows < worldDepth < lighting`;
  - wyvern plus raider humanoids are active in `worldDepth`;
  - lit frame has light influence plus SDF shadow primitives;
  - no-light comparison has the same world-depth silhouettes but zero light influence.

Validation:

```powershell
node tests\webglRendererHierarchy.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\sceneObjectsFoundation.test.mjs
node tests\actorShadowSilhouettes.test.mjs
npm test
node -e "import('./src/app.js')"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_PROOF_URL='http://127.0.0.1:5223/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\light-shadow-world-depth-v0\proof.mjs
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5223/`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\light-shadow-world-depth-v0\proof.mjs`.
- Lit screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\light-shadow-world-depth-v0\world-depth-lit.png`.
- Dark comparison screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\light-shadow-world-depth-v0\world-depth-no-lights.png`.
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\light-shadow-world-depth-v0\world-depth-lighting-state.json`.
- Runtime facts: layer order `terrain, decals, shadows, worldDepth, lighting, effects, fogSmoke, postProcess, hudDebug`; lit frame `webglWorldDepthItemCount: 6`, `webglPlayerWyvernSilhouetteActive: true`, `webglRaiderHumanoidSilhouetteActive: true`, `webglLightCount: 3`, `webglLightingInfluenceCount: 9`, `webglShadowShaderPrimitiveCount: 64`, app console/page errors `0`; dark comparison `webglLightCount: 0`, `webglLightingInfluenceCount: 0`, with wyvern and raider silhouettes still active.

Residual:

- This is a compositing relationship fix, not a full surface-lighting model. Objects now participate in darkness/light while contact shadows stay below them; per-object normals, rim lights, material response, and more intentional occlusion masks remain future art/renderer passes.

## Moonlight Scene Emission v0

Current request: add moonlight as a scene light source that affects the whole scene and shadows without becoming a bright global wash, a camera-follow object, or rendered cloud sprites.

- Added `src/data/sceneLights.js` with a fixed off-map `moonlight_scene_emission` world light, low cool intensity, source policy, cloud occlusion metadata, direction vector, and two bounded indirect-light registers.
- Routed scene lights through `game.sceneLights -> buildSceneLightViews(...) -> buildLightProjection(...)`, so moonlight joins the same renderer-neutral light packets as torches and napalm instead of becoming a WebGL-only shortcut.
- Split light projection into `src/projection/lightProjection.js` so cloud occlusion and bounce metadata stay owned by the projection layer while `renderProjection.js` remains under the LoC budget.
- Updated WebGL lighting so moonlight renders first, drifting world-space cloud attenuation bands darken only the moonlight reveal, two subtle bounce registers add narrow-camera reflected-light hints, and local torches render afterward.
- Kept shadows in the existing split-layer contract: moonlight feeds light-space culling and SDF-ready occlusion shadow packets, while ground/contact shadow material still renders under `worldDepth` and darkness/light reveal still renders over it.
- Added runtime diagnostics for moonlight source count, cloud occlusion mode/primitive count/phase/scale, and bounce register count.
- Added `docs/MOONLIGHT_SCENE_EMISSION_V0.md` and README slice notes.

Validation so far:

```powershell
node tests\moonlightSceneEmission.test.mjs
node tests\lightingFoundation.test.mjs
node tests\webglLightingLiveWiring.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\occlusionShadowFoundation.test.mjs
node tests\sceneObjectsFoundation.test.mjs
node tests\locBudget.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_PROOF_URL='http://127.0.0.1:5224/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\moonlight-scene-emission-v0\proof.mjs
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5224/`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-scene-emission-v0\proof.mjs`.
- Screenshots:
  - `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-scene-emission-v0\moonlight-t0.png`
  - `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-scene-emission-v0\moonlight-t1-cloud-phase.png`
  - `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-scene-emission-v0\moonlight-disabled-darkness.png`
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-scene-emission-v0\moonlight-scene-emission-state.json`.
- Runtime facts: renderer `webgl`; scene moonlight count `1`; moonlight-only light count `1`; cloud attenuation primitives `14`; cloud scale `416px / 13 tiles`; cloud phase moved from `2.912, 1.008` to `11.856, 4.104`; bounce register/primitive count `2/2`; moonlight shadow-field packets `35`; no-moon baseline had `0` lights, `0` cloud primitives, `0` bounce registers, darkness active, and app console/page errors `0`.
- Screenshot inspection: moonlit frames are nonblank, cool/dim, and visibly cloud-broken without a bright global wash; the no-moon frame is materially darker while preserving the existing player readability exception.
- Generic `$WEB_GAME_CLIENT` attempt remains tooling-blocked: `C:\Users\felix\.codex\skills\develop-web-game\scripts\web_game_playwright_client.js` still cannot resolve package `playwright` from the skill directory despite project-local Playwright being installed.

Residual:

- This is still a bounded 2D WebGL approximation, not ray tracing or texture-backed cloud shadows.
- The indirect registers are deliberately subtle render projections. Future lighting polish can add material-specific response, per-object normals, or a texture-backed moonlight attenuation shader if needed.

## Storm Lightning Scene Flash v0

Current request: raise the moonlight's implied source height so shadows are not horizon-long, make the cloud light blocker more organic/morphing, and add lightning flashes that semi-randomly occur every 20-40 seconds with clustered strikes, scene origins, shadow participation, and a short afterimage burnoff.

- Tuned `moonlight_scene_emission` with high-source shadow metadata (`lengthScale: 0.42`, `heightScale: 0.76`) so scene-object shadows read shorter without changing torch shadow behavior globally.
- Added segmented morphing `shapeNoise` to the moonlight cloud attenuation projection. WebGL now builds shaped attenuation ribbons instead of straight bands; this remains light occlusion only, not rendered cloud sprites.
- Added `storm_lightning` as a world-owned scene-light scheduler in `src/data/sceneLights.js`.
- Lightning events are deterministic for tests/proof, but uneven: interval starts are clamped to 20-40 seconds and events can cluster 1-3 flash views with separate offsets.
- Each active flash becomes a `lightning_scene_flash` light view with a scene position origin, bright initial intensity, high-source shadow metadata, and an afterimage burnoff envelope.
- Routed lightning through the same renderer-neutral light projection, light-space culling, SDF-ready shadow-field projection, and WebGL light influence path as existing lights.
- Added `influenceAlphaScale` so lightning afterimage tails can fade below the generic local-light minimum alpha without weakening normal torch lights.
- Updated runtime text/debug output, README, docs, and tests.

Validation:

```powershell
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_PROOF_URL='http://127.0.0.1:5224/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\storm-lightning-scene-flash-v0\proof.mjs
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5224/`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\storm-lightning-scene-flash-v0\proof.mjs`.
- Screenshots:
  - `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\storm-lightning-scene-flash-v0\storm-pre-flash.png`
  - `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\storm-lightning-scene-flash-v0\storm-initial-flash.png`
  - `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\storm-lightning-scene-flash-v0\storm-afterimage-burnoff.png`
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\storm-lightning-scene-flash-v0\storm-lightning-scene-flash-state.json`.
- Runtime facts: renderer `webgl`; first/second/third strike starts `24s`, `47.665s`, `82.653s`; pre-flash lightning views `0`; initial flash lightning views `1`, intensity `0.943`, cluster count `3`, scene origin `{ x: 31.472, y: -14.752 }`, lightning shadow-field packets `35`; burnoff lightning views `3`, per-flash intensity `0.040`, afterimage intensity `0.095`, lightning shadow-field packets `35`; moonlight shadow length scale `0.42`; moonlight cloud attenuation primitives `98`; app console/page errors `0`.
- Screenshot inspection: pre-flash frame stays dark with local torch/moon readability, initial flash visibly lights the whole scene, and burnoff leaves a cooler afterimage veil instead of a second full-strength strike.

Residual:

- This is still bounded 2D scene-light compositing, not procedural bolt geometry, thunder audio, real volumetrics, texture-backed cloud shadows, or physical global illumination.
- The lightning scheduler is deterministic semi-random for reproducible tests and screenshots; future weather work can add seeded campaign state or authored storm fronts without moving lighting/shadow truth out of the scene-light path.

## Material Profile Registry v0

Current request: decide whether to code a master shader for in-game entities and scene objects, then implement the useful version: a shared material/profile system rather than a single huge shader.

- Added `src/data/materialProfiles.js` with a stable `MaterialProfile` registry, family enum, shader variant names, reusable uniforms, and shared visual state defaults.
- Added `src/projection/materialProjection.js` so actors, scene objects, and terrain emit renderer-neutral material packets with provenance instead of backend-specific objects or object-type branches.
- Added `src/render/backends/webgl/WebGLMaterialAdapter.js` to convert material packets into WebGL-ready surface response values for color, shadow, highlight, wetness, burn, damage, faction tint, integrity, and night reveal.
- Wired profile ids through actor definitions, scene object definitions, terrain definitions, renderable components, game selectors, scene object projection, terrain projection, and actor render projection.
- WebGL now consumes the shared adapter for terrain palette generation, boulder facets, tree trunks, fallback actor markers, wyvern hide palette, and raider torso palette.
- Runtime text/debug output now exposes active material profile groups across actors, scene objects, and terrain.
- Added `tests/materialProfileRegistry.test.mjs`, included it in `tests/runTests.mjs`, added `docs/MATERIAL_PROFILE_REGISTRY_V0.md`, and updated the README latest-slice note.

Validation:

```powershell
node tests\materialProfileRegistry.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_PROOF_URL='http://127.0.0.1:5224/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\material-profile-registry-v0\proof.mjs
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5224/`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\material-profile-registry-v0\proof.mjs`.
- Screenshot: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\material-profile-registry-v0\material-profile-registry.png`.
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\material-profile-registry-v0\material-profile-registry-state.json`.
- Runtime facts: renderer `webgl`; runtime material contract `black-sky-bound.material-profile.v0`; actor profiles `cloth_raider`, `flesh_husk`, `fur_werewolf`, `scale_wyvern_copper`; scene object profiles `stone_moss`, `wood_pine`; terrain profiles `forest_understory`, `scorched_soil`, `soil_dirt`, `soil_grass`, `stone_rock`, `water_dark`; runtime/projection profile count `12`; families `entity`, `sceneObject`, `terrain`; WebGL adapter mode `webgl_material_profile_uniform_adapter_v0`; canvas probe `6/6` non-dark samples and `6` unique sampled colors; app console/page errors `0`.
- Screenshot inspection: the frame is nonblank, still dark/night-readable, and shows material-colored wyvern, raider, tree, boulder, and terrain surfaces under the existing light system without introducing a washed-out surface pass.

Residual:

- This is a material kernel, not a monolithic shader or full physically based lighting model.
- Tree foliage still keeps authored crown color details while the material adapter owns the reusable trunk/base response.
- Effect and debug profiles exist in the registry but are not fully routed through every effect/debug render path yet.

## Moonlight World-Anchored Clouds v1

Current request: after landing the material registry, revisit the moonlight/cloud layer because the cloud/shadow pattern was following player camera movement.

- Found the camera-space leak in `src/render/backends/webgl/WebGLMoonlightOcclusion.js`: cloud attenuation bands were generated around the current visible-bounds center, and edge ripple/noise used local along-band coordinates.
- Reworked moonlight cloud attenuation to `world_anchored_moonlight_cloud_attenuation_v1`.
- Cloud band coordinates now come from a global world-normal coordinate grid derived from the moonlight direction. The camera only selects visible bands.
- Organic edge ripple and width noise now use world-space along coordinates, so the cloud shape does not reset as the viewport moves.
- Added `anchorPolicy: "world_normal_coordinate_grid_not_camera_centered"` and exposed `bandNormalCoordinates` for regression proof.
- Extended `tests/moonlightSceneEmission.test.mjs` to assert that a camera pan retains overlapping world cloud bands, and that moonlight SDF shadow packets move by the camera transform rather than sticking to the screen.
- Added browser proof under `artifacts/moonlight-world-anchored-clouds-v1/`.

Validation:

```powershell
node tests\moonlightSceneEmission.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_PROOF_URL='http://127.0.0.1:5224/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\moonlight-world-anchored-clouds-v1\proof.mjs
```

Status: passing.

Browser proof:

- Local server: `http://127.0.0.1:5224/`.
- Proof script: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-world-anchored-clouds-v1\proof.mjs`.
- Screenshots:
  - `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-world-anchored-clouds-v1\moonlight-camera-a.png`
  - `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-world-anchored-clouds-v1\moonlight-camera-b.png`
- State proof: `C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2\artifacts\moonlight-world-anchored-clouds-v1\moonlight-world-anchored-clouds-state.json`.
- Runtime facts: renderer `webgl`; camera shift `96` world pixels; cloud anchor policy `world_normal_coordinate_grid_not_camera_centered`; cloud band overlap `8/8`; moonlight shadow packet `shadow_field:moonlight:explicit_occlusion_blocker:tree:torch-edge:trunk`; expected screen delta `{ x: 176.346, y: -124.733 }`; actual screen delta `{ x: 176.346, y: -124.732 }`; app console/page errors `0`.
- Screenshot inspection: both frames are nonblank and dark/night-readable; the viewport pans over the scene while the moonlight/cloud modulation remains world anchored rather than reading as a fixed screen veil.

Residual:

- Moonlight cloud occlusion is still procedural geometry, not a texture-backed cloud shadow map.
- Moonlight bounce registers remain intentionally camera-bounded render hints; the bug fix applies to cloud attenuation and shadow anchoring, not to the bounded bounce-light design.

## Wyvern Aesthetic Slimming Pass v0

Current request: make a visual/aesthetic pass on the player wyvern using the attached dragon template only as proportion reference, with before/after screenshots as required proof.

Proof setup:

- Added `artifacts/wyvern-aesthetic-pass-v0/proof.mjs` to stage the running WebGL game, isolate the player wyvern, capture a full frame plus crop, and record profile/rig metrics.
- Baseline proof captured before changing anatomy:
  - `artifacts/wyvern-aesthetic-pass-v0/wyvern-aesthetic-before-full.png`
  - `artifacts/wyvern-aesthetic-pass-v0/wyvern-aesthetic-before-crop.png`
  - `artifacts/wyvern-aesthetic-pass-v0/wyvern-aesthetic-before-state.json`
- Baseline runtime facts: renderer `webgl`, profile `grounded_wyvern_hatchling_skeletal_gait_v0`, visual scale `1.52`, neck length `0.66`, torso width `0.76`, hip width `0.86`, tail base width `0.56`, mesh `33` parts / `997` triangles, console/page errors `0`.
- Visual read from baseline crop: body reads too oval/chunky, neck is short, and tail base/root mass are still too thick for the requested template-like narrowness.

What changed:

- Reclassified the active proportion focus as `template_slim_aesthetic_pass` while preserving the earlier head/neck/shoulder, rear/tail, and skeletal-gait pass provenance.
- Lengthened and narrowed the neck, narrowed head/jaw width, reduced chest/torso/hip/haunch width, and pushed the tail toward a longer thin taper.
- Kept material/shader ownership unchanged: the player still uses `scale_wyvern_copper` through the shared material/profile adapter and the WebGL silhouette path.
- Kept the player as one gameplay entity with renderer-neutral `CreatureRigPose`; no limb entities, collision changes, special shader, or player light emitter were added.
- Lowered tuning editor field minima for chest, torso, hips, and haunch width so the local parameter editor range remains compatible with the new slimmer profile values.

Final proof:

- Browser proof after edits passed:
  - `artifacts/wyvern-aesthetic-pass-v0/wyvern-aesthetic-after-full.png`
  - `artifacts/wyvern-aesthetic-pass-v0/wyvern-aesthetic-after-crop.png`
  - `artifacts/wyvern-aesthetic-pass-v0/wyvern-aesthetic-after-state.json`
- Before -> after profile/proof metrics:
  - visual scale `1.52 -> 1.44`
  - neck length `0.66 -> 1.04`
  - neck width `0.30 -> 0.18`
  - chest width `1.04 -> 0.54`
  - torso width `0.76 -> 0.42`
  - hip width `0.86 -> 0.48`
  - tail length `3.28 -> 3.92`
  - tail base width `0.56 -> 0.36`
  - tail root mass `0.51 -> 0.28`
  - bounds slenderness `0.736 -> 0.912`
  - tail-base/length ratio `0.171 -> 0.092`
- Final browser facts: renderer `webgl`, player wyvern silhouette active, mesh `33` parts / `997` triangles, canvas probe `7/7` non-dark samples, app console/page errors `0`.

Validation:

```powershell
node tests\groundedWyvernProportions.test.mjs
node tests\rearTailProportions.test.mjs
node tests\wyvernProjection.test.mjs
node tests\creatureRigPose.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\creatureTuning.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_PROOF_URL='http://127.0.0.1:5225/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; $env:BSB_WYVERN_PROOF_LABEL='before'; node artifacts\wyvern-aesthetic-pass-v0\proof.mjs
$env:BSB_PROOF_URL='http://127.0.0.1:5225/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; $env:BSB_WYVERN_PROOF_LABEL='after'; node artifacts\wyvern-aesthetic-pass-v0\proof.mjs
```

Status: passing. Visual evidence inspected: baseline and final crop screenshots both opened and reviewed.

Residual:

- The backtick tuning overlay issue was noted but not fixed in this slice; the visual pass used direct browser proof instead.
- This is an aesthetic/proportion pass only. It does not add new animation states, attacks, body-part collision, flight/flapping, or a new shader/material model.

## Wyvern Attack Profile Visual Pass v0

Current request: make the player wyvern attacks less constrained/reserved, with wing swipes that read longer and louder, and a more aggressive bite that lunges the shoulders forward to extend the neck.

Proof setup:

- Added `artifacts/wyvern-attack-profile-pass-v0/proof.mjs` to stage fixed bite and right-swipe action phases in the running WebGL game, capture full frames/crops, and record action profile plus procedural pose metrics.
- Baseline proof captured before changing attack profiles:
  - `artifacts/wyvern-attack-profile-pass-v0/wyvern-attack-before-bite-crop.png`
  - `artifacts/wyvern-attack-profile-pass-v0/wyvern-attack-before-right-swipe-crop.png`
  - `artifacts/wyvern-attack-profile-pass-v0/wyvern-attack-before-state.json`
- Baseline runtime facts: renderer `webgl`; bite chest forward `-0.06`, head/neck `0.44/0.276`, jaw `0.56`; right-swipe duration `0.42`, wrist forward/across `0.413/-0.615`, contact length/width `29.44/37.12`, app console/page errors `0`.

What changed:

- Expanded claw-swipe profile timing from `0.42s` to `0.52s`, moved hit timing later, widened the sweep/contact band, and increased wrist/elbow reach plus body counter-sway.
- Reworked bite posing so the strike now coils briefly, then drives the chest/shoulders forward instead of pulling the chest backward.
- Increased bite head, neck, jaw, shoulder-drive, and brace offsets, with matching proportion constraints so the stronger pose is not clipped back to the older reserved silhouette.
- Kept ownership in the canonical action profile/procedural pose/proportion constraint path; no renderer-only attack hack or special player material path was added.

After proof:

- Browser proof after edits passed:
  - `artifacts/wyvern-attack-profile-pass-v0/wyvern-attack-after-bite-crop.png`
  - `artifacts/wyvern-attack-profile-pass-v0/wyvern-attack-after-right-swipe-crop.png`
  - `artifacts/wyvern-attack-profile-pass-v0/wyvern-attack-after-state.json`
- Before -> after profile/proof metrics:
  - bite chest forward `-0.06 -> 0.176`
  - bite head/neck forward `0.44/0.276 -> 0.5/0.385`
  - bite jaw open `0.56 -> 0.62`
  - bite contact length `24.96 -> 29.44`
  - swipe duration `0.42 -> 0.52`
  - swipe wrist forward/across `0.413/-0.615 -> 0.609/-0.749`
  - swipe elbow forward/across `0.216/-0.197 -> 0.314/-0.314`
  - swipe contact length/width `29.44/37.12 -> 34.56/45.44`
- Final browser facts so far: renderer `webgl`, player wyvern silhouette active, mesh checks passed, canvas probes nonblank, app console/page errors `0`.

Validation:

```powershell
node tests\proceduralMotionActionState.test.mjs
node tests\physicsInformedWyvernAttack.test.mjs
node tests\groundedWyvernProportions.test.mjs
node tests\wyvernInputComboSmokeSpit.test.mjs
node tests\rearTailProportions.test.mjs
node tests\wyvernProjection.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_WYVERN_ATTACK_PROOF_LABEL='before'; $env:BSB_PROOF_URL='http://127.0.0.1:5231/'; node artifacts\wyvern-attack-profile-pass-v0\proof.mjs
$env:BSB_WYVERN_ATTACK_PROOF_LABEL='after'; $env:BSB_PROOF_URL='http://127.0.0.1:5231/'; node artifacts\wyvern-attack-profile-pass-v0\proof.mjs
```

Status: passing. Visual evidence inspected: baseline and final bite/right-swipe crop screenshots both opened and reviewed.

Git note: the parent repository still reports `BLACK_SKY_BOUND_V2` as an untracked project folder, so `git diff --check` has no tracked-file diff to inspect for this slice.

## World-Source-Only Lighting v2

Current request: remove the remaining lighting that appears to follow the player/player camera; only world or scene objects may be light sources.

Diagnosis and implementation:

- Found two moonlight indirect-light registers generated from the center and span of `camera.visibleWorldBounds(...)`.
- Removed those camera-centered registers from scene-light data, light projection, WebGL rendering, diagnostics, and runtime text output.
- Added explicit `sourceAnchor` provenance for the live source paths: `world_entity`, `world_effect_object`, and `scene_light`.
- Kept camera use only for view selection and world-to-screen transformation; moonlight cloud attenuation remains world-anchored darkness geometry and is not a light source.
- Replaced the old positive bounce-register assertions with regression checks that forbid camera-derived bounce fields and require every rendered radial light influence to share a world position with a projected source light.

Validation:

- Focused lighting, moonlight, lightning, WebGL wiring, and napalm tests passed.
- Full `npm test` passed (`42` focused test modules through `tests/runTests.mjs`).
- `artifacts/moonlight-world-anchored-clouds-v1/proof.mjs` passed against Edge/WebGL at `http://127.0.0.1:5224/`:
  - camera shift `96` world pixels;
  - identical `8/8` world cloud-band coordinates across both camera positions;
  - shadow packet screen delta matched the expected camera transform;
  - source anchors were `scene_light` in both staged views;
  - camera-derived bounce diagnostics absent;
  - app console/page errors `0`.
- Updated and reran `artifacts/moonlight-scene-emission-v0/proof.mjs`; moonlight produced exactly `3` source-anchored radial influences, while the no-moon frame produced `0` light influences.
- Both project-specific camera screenshots and moonlight/no-moon screenshots were opened and visually inspected; they are nonblank and night-readable.
- The required generic web-game client ran headless and headed with a movement burst. Text-state showed player movement and `6-8` active lights, all anchored as `world_entity`, `world_effect_object`, or `scene_light`, with no console-error artifact. Its WebGL canvas captures were black in both modes, so the project-specific Edge proof remains the visual evidence lane.

Status: passed. No runtime source, projection, renderer, diagnostics, or runtime-text bounce path remains.

## Forest Scene Object Asset Library v0

Current request: broaden the scene-object asset list beyond boulders and trees with tree variants, more leaf particles, shrubbery/forest undergrowth like ferns, and ground decals, with examples placed in-scene as validation.

What changed:

- Expanded the scene object registry from 2 object types to 8: old pine, birch tree, dead snag, moss boulder, fern patch, forest shrub, leaf litter, and root decal.
- Added scene-object material profiles for birch wood, dead snag wood, fern foliage, shrub foliage, and forest floor decals.
- Seeded 16 explicit scene objects into the first escape scenario: 8 blocking/shadow-capable objects and 8 nonblocking visual details.
- Kept undergrowth and ground decals gameplay-neutral with `non_blocking_*` collision policies and no occlusion blockers.
- Extended ambient leaf particles so birch variants and shrubs opt into `leaf_drift` alongside old pines.
- Extended the WebGL scenery layer with renderer-neutral branches for dead snags, fern fans, shrub clusters, and low ground decals.
- Updated the moonlight pan-stability test to follow a moonlight shadow packet that is visible in both camera positions, avoiding incidental ordering dependence now that there are more occluders.

Proof:

- Added `artifacts/forest-scene-object-library-v0/proof.mjs` to run a local Playwright/WebGL proof server, stage an overview and detail camera, capture screenshots, and write runtime metrics.
- Browser proof output:
  - `artifacts/forest-scene-object-library-v0/forest-scene-object-library-overview.png`
  - `artifacts/forest-scene-object-library-v0/forest-scene-object-library-focus.png`
  - `artifacts/forest-scene-object-library-v0/forest-scene-object-library-focus-crop.png`
  - `artifacts/forest-scene-object-library-v0/forest-scene-object-library-state.json`
- Final proof facts: renderer `webgl`; scene objects `16`; type counts include all 8 object types; nonblocking details `8`; shadow casters `8`; scene-object material profiles `7`; WebGL scenery source count `16`; WebGL scenery primitives `49`; leaf particle sources include `tree`, `birch_tree`, and `forest_shrub`; app console/page errors `0`.
- Visual evidence inspected: overview and focus crop screenshots opened and reviewed.

Validation:

```powershell
node tests\ecsArchitectureV1.test.mjs
node tests\materialProfileRegistry.test.mjs
node tests\ambientParticles.test.mjs
node tests\sceneObjectsFoundation.test.mjs
node artifacts\forest-scene-object-library-v0\proof.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
```

Status: passing.

## Wyvern Folded Wing Digit Profile Pass v0

Current request: extend the wing digits from the wrist joints so the folded wings trail farther down the body past the hind legs and read larger near the tail, while only exposing broader wingspan during wing-swipe attacks.

Intent read:

- Literal ask: make wing digits longer/trailing from the wrist, mostly folded against the body, not flight-spread.
- Required latent split: idle/folded anatomy and attack-sweep fan must be separate so larger folded wings do not accidentally become a permanent broad wingspan.

Proof setup:

- Added `artifacts/wyvern-folded-wing-profile-pass-v0/proof.mjs` to stage a folded idle pose plus a right wing-swipe pose in the running WebGL game, capture full frames/crops, and record wing digit anatomy/rig metrics.
- Baseline proof captured before edits:
  - `artifacts/wyvern-folded-wing-profile-pass-v0/wyvern-wing-profile-before-folded-crop.png`
  - `artifacts/wyvern-folded-wing-profile-pass-v0/wyvern-wing-profile-before-right-swipe-crop.png`
  - `artifacts/wyvern-folded-wing-profile-pass-v0/wyvern-wing-profile-before-state.json`
- Baseline runtime facts: renderer `webgl`; folded digit lengths `[2.24, 1.96, 1.66, 1.38]`; folded right wing span `1.536`; folded right trailing depth `0.067`; right-swipe primary span `1.152`; app console/page errors `0`.

What changed:

- Rebalanced wing digit anatomy in `groundedWyvernHatchling.js` from wide sideways spars to longer backward-trailing spars: longer digit lengths, lower folded lateral out values, and much deeper folded back values.
- Added anatomy-owned sweep fan controls (`sweepDigitOutAdd`, `sweepDigitBackRelax`) so broad span is available only to procedural action poses.
- Added procedural pose offsets for `digitSpread` and `digitTrailRelax` during claw/wing swipes; only the primary sweeping wing receives them.
- Updated `wyvernCreatureRigPose.js` to consume the new digit spread/trail-relax fields while preserving renderer-neutral rig ownership; WebGL still only consumes projected rig packets.
- Added tests so folded wings trail near the tail, idle stays tucked, and the active swipe wing alone opens into a broader fan.

After proof:

- Browser proof after edits passed:
  - `artifacts/wyvern-folded-wing-profile-pass-v0/wyvern-wing-profile-after-folded-crop.png`
  - `artifacts/wyvern-folded-wing-profile-pass-v0/wyvern-wing-profile-after-right-swipe-crop.png`
  - `artifacts/wyvern-folded-wing-profile-pass-v0/wyvern-wing-profile-after-state.json`
- Before -> after profile/proof metrics:
  - folded digit lengths `[2.24, 1.96, 1.66, 1.38] -> [2.92, 2.82, 2.64, 2.46]`
  - folded digit out `[1.66, 1.34, 1.02, 0.72] -> [1.02, 0.78, 0.56, 0.38]`
  - folded digit back `[0.58, 0.96, 1.28, 1.56] -> [1.36, 1.88, 2.38, 2.78]`
  - folded right wing span `1.536 -> 1.227`
  - folded right trailing depth `0.067 -> 0.637`
  - right-swipe primary span `1.152 -> 1.566`
  - right-swipe primary digit spread `null -> 0.928`
  - bracing/non-sweeping wing digit spread remains `0`
- Final browser facts so far: renderer `webgl`, player wyvern silhouette active, mesh checks passed, canvas probes nonblank, app console/page errors `0`.

Validation:

```powershell
node tests\creatureRigPose.test.mjs
node tests\proceduralMotionActionState.test.mjs
node tests\groundedWyvernProportions.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\wyvernProjection.test.mjs
node tests\physicsInformedWyvernAttack.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_WYVERN_WING_PROOF_LABEL='before'; $env:BSB_PROOF_URL='http://127.0.0.1:5232/'; node artifacts\wyvern-folded-wing-profile-pass-v0\proof.mjs
$env:BSB_WYVERN_WING_PROOF_LABEL='after'; $env:BSB_PROOF_URL='http://127.0.0.1:5232/'; node artifacts\wyvern-folded-wing-profile-pass-v0\proof.mjs
```

Status: passing. Visual evidence inspected: baseline and final folded/right-swipe crop screenshots both opened and reviewed.

Git note: the parent repository still reports `BLACK_SKY_BOUND_V2` as an untracked project folder, so `git diff --check` has no tracked-file diff to inspect for this slice.

## Smoke, Torch Lifecycle, and Contrast Pass v0

Current request: make the smoke read more clearly in motion, add missing smoke sources/wisps from torch and napalm emitters, pull back the overly bright inner light bubble so the outer scene returns toward near-black contrast, and ensure defeated raider torches drop, darken, and almost fully fade instead of remaining as permanent floating light sources. Stretch goal: visible flame sparks from flame-light emitters.

Intent read:

- Literal ask: more noticeable smoke and better light contrast.
- Required hidden completion bar: the pass only counts if the extra smoke is visibly distinct in staged gameplay frames, the darker scene still preserves readable light sources, and torch defeat/fade is owned by the real runtime lifecycle instead of fake screenshot-only state.

Baseline before edits:

- Browser proof baseline was captured in `artifacts/smoke-light-contrast-pass-v0/` as:
  - `smoke-light-before-live.png`
  - `smoke-light-before-defeated.png`
  - `smoke-light-before-faded.png`
  - `smoke-light-before-state.json`
- Baseline proof facts:
  - live torch smoke read as only `1` visible `torch_wisp` source;
  - no `napalm_droplet_wisp` source existed;
  - the faded defeated torch stayed enabled with effective intensity `0.8092`;
  - faded torch smoke still remained present.

What changed:

- Added canonical torch defeat/drop/fade lifecycle ownership through `torchLifecycleSystem`, including carried, falling, grounded, fading, and extinguished torch state.
- Routed torch light anchoring through explicit carried-vs-dropped torch anchor resolution so dead raiders no longer leave immortal floating lights behind.
- Added projection-visible dropped torch state into runtime text/debug output for proof and inspection.
- Tuned torch emitter light composition down slightly so the inner sphere is less blown out and the scene exterior returns to a stronger dark-field contrast.
- Tightened the early-night lighting profile so warm bloom and halo spread reveal less of the scene outside the immediate light bubble.
- Expanded smoke source coverage:
  - torch wisps now project as distinct core + trailing smoke sources rather than a single weak blob;
  - napalm droplets now emit tiny `napalm_droplet_wisp` packets;
  - napalm smoulder and torch wisp tuning were both nudged upward for readability.
- Strengthened torch spark particles so flame-light emitters now throw a more obvious spark read without introducing a second particle architecture.
- Added focused tests for torch lifecycle ownership and smoke-source coverage, and updated the proof harness to stage live, defeated, and fully faded torch states with assertions.

After proof:

- Passing proof outputs:
  - `artifacts/smoke-light-contrast-pass-v0/smoke-light-after-live.png`
  - `artifacts/smoke-light-contrast-pass-v0/smoke-light-after-defeated.png`
  - `artifacts/smoke-light-contrast-pass-v0/smoke-light-after-faded.png`
  - `artifacts/smoke-light-contrast-pass-v0/smoke-light-after-state.json`
- Before -> after proof facts:
  - live `torch_wisp` count `1 -> 2`
  - live `napalm_droplet_wisp` count `0 -> 4`
  - live torch sparks `0/implicit -> 8` visible `torch_spark` particle sources in the staged frame
  - live target torch effective intensity `0.8117 -> 0.7289`
  - faded defeated torch effective intensity `0.8092 -> 0.0218`
  - faded defeated torch `enabled: true -> false`
  - faded torch smoke lingering `1 -> 0`
- Final staged runtime facts:
  - renderer backend `webgl`
  - defeated torch state reaches `grounded`
  - faded torch state reaches `extinguished`
  - actor packet is absent after defeat while the dropped torch still resolves/fades correctly
  - app console issues `0`
  - page errors `0`
- Visual inspection:
  - live before/after screenshots were opened and compared; the after frame keeps the same composition but reads with a darker outer field, tighter light bubble, and more obvious torch smoke/spark activity.
  - defeated/faded after screenshots were opened and reviewed; the torch no longer persists as a permanent invasive light source and the final frame clears lingering torch smoke.

Validation:

```powershell
node tests\unifiedSmokeSources.test.mjs
node tests\torchLifecycle.test.mjs
node tests\ambientParticles.test.mjs
node tests\webglLightingLiveWiring.test.mjs
npm test
$env:BSB_SMOKE_LIGHT_PROOF_LABEL='after'; $env:BSB_PROOF_URL='http://127.0.0.1:5233/'; node artifacts\smoke-light-contrast-pass-v0\proof.mjs
```

Status: passing. This pass materially improves visible smoke variety, restores stronger dark-vs-light separation, and makes defeated torches decay out of the scene instead of polluting the runtime forever.

## Dropped Torch Embodiment Follow-up v0

Current request: make the torch object itself physically drop onto the ground so the fading defeated-torch light remains visibly embodied in a dropped prop after the raider actor disappears.

Intent read:

- Literal ask: show the dropped torch object, not only the light.
- Required hidden completion bar: the dead raider must still stay absent as an actor packet, but a separate grounded torch prop must remain in world depth and follow the same defeat/fade lifecycle as the torch light.

What changed:

- Added a renderer-neutral `droppedTorches` projection lane sourced from defeated raiders' existing `humanoidProjection.torchState` rather than resurrecting dead actors.
- Derived grounded torch shaft/tip/flame geometry from the canonical raider humanoid torch profile, so carried and dropped torches share the same authored dimensions.
- Routed dropped torch rendering through the WebGL `worldDepth` layer as a separate ground prop with y-sorting, light-space gating, contact shadowing, and fade-aware flame/shaft darkening.
- Preserved the existing contract that defeated raiders do not render as actor packets.
- Extended torch lifecycle tests and the smoke/light browser proof to assert dropped torch prop presence in defeated and extinguished stages.

Proof:

- Reused `artifacts/smoke-light-contrast-pass-v0/proof.mjs` and updated it to validate dropped torch prop packets.
- Updated proof outputs:
  - `artifacts/smoke-light-contrast-pass-v0/smoke-light-after-defeated.png`
  - `artifacts/smoke-light-contrast-pass-v0/smoke-light-after-faded.png`
  - `artifacts/smoke-light-contrast-pass-v0/smoke-light-after-state.json`
- Final proof facts:
  - live stage: `droppedTorch = null`
  - defeated stage: `actorPacketPresent = false`, but `droppedTorch.mode = grounded`
  - defeated dropped torch packet remains aligned with the fading torch light:
    - flame world position `339.85, 501.14`
    - shaft/body world position `346.77, 496.41`
    - `flameAlpha = 0.9986`
  - faded stage: `droppedTorch.mode = extinguished`, `flameAlpha = 0`, `shaftAlpha = 0.674`
  - app console issues `0`
  - page errors `0`
- Visual inspection:
  - the defeated screenshot was opened and reviewed; the light now reads as sitting on a small grounded torch shaft rather than hovering after the raider vanishes.

Validation:

```powershell
node tests\torchLifecycle.test.mjs
node tests\webglWorldDepthLayer.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\ambientParticles.test.mjs
node tests\webglLightingLiveWiring.test.mjs
npm test
$env:BSB_SMOKE_LIGHT_PROOF_LABEL='after'; $env:BSB_PROOF_URL='http://127.0.0.1:5233/'; node artifacts\smoke-light-contrast-pass-v0\proof.mjs
```

Status: passing. The torch light now hands off into a real dropped prop, so defeat reads as a physical object falling to the ground rather than a disappearing actor with a detached light.

## Ember Linger and Husk Projection Pass v0

Current request: slow the decay of the dropped torch flame so it falls off harder on death but smolders longer before fully extinguishing, then make a visual pass on husk units using only the existing projection/render rules so they read as grey, ancient, zombie-like humans rather than anonymous placeholders.

Intent read:

- Literal ask: tweak torch fade variables and improve husk visuals.
- Required hidden completion bar: the torch must feel more physically credible in its dim-on-drop then ember-linger arc, and husks must gain an actual humanoid gait/silhouette lane instead of staying a square fallback body that cannot express cadence or posture.

Baseline before edits:

- Torch baseline already existed in `artifacts/smoke-light-contrast-pass-v0/smoke-light-after-state.json` from the previous pass:
  - defeated dropped torch light intensity `0.7789`
  - defeated dropped torch prop `flameAlpha = 0.9986`
  - full extinguish reached by the earlier `5.9s` faded snapshot
- Husk baseline was captured before edits in `artifacts/husk-projection-pass-v0/`:
  - `husk-projection-before.png`
  - `husk-projection-before-state.json`
- Baseline husk proof facts:
  - `silhouette = husk`
  - `humanoidProfileId = null`
  - `motionState = null`
  - `visualBounds = null`
  - the screenshot shows a plain square fallback body beside the projected raider.

What changed:

- Retuned torch defeat/linger recipe values:
  - longer ember tail through `fadeDuration: 8.4`
  - stronger immediate drop dim via `dropEmissionScale: 0.64`
  - tighter early drop bubble via `dropRadiusScale: 0.8`
  - slightly longer pause before the ember tail through `fadeDelay: 0.22`
- Extended `torchLifecycleSystem` so dropped torch state carries resolved `emissionScale` and `radiusScale`, allowing the prop flame and light to dim together instead of the prop staying visually over-bright.
- Updated dropped torch rendering so the flame brightness follows the reduced post-death emission, while the shaft still lingers as a darkened prop until extinguish.
- Moved husks onto the shared humanoid projection family with a dedicated `husk_top_down_shambler_v0` profile instead of the old fallback silhouette.
- Added a shambler-specific humanoid profile:
  - narrower, longer-limbed body proportions
  - forward-reaching hands
  - reduced stride
  - asymmetrical sway/lurch
  - torch disabled
  - desaturated grey/dirty palette
  - locomotion state `shamble`
- Generalized the humanoid pose solver and WebGL humanoid silhouette path so torchless humanoids can exist inside the same renderer-neutral ruleset as raiders.
- Added focused husk projection coverage plus updated tuning/material/test seams that had previously assumed “humanoid means raider.”

Proof:

- Husk proof outputs:
  - `artifacts/husk-projection-pass-v0/husk-projection-before.png`
  - `artifacts/husk-projection-pass-v0/husk-projection-after.png`
  - `artifacts/husk-projection-pass-v0/husk-projection-before-state.json`
  - `artifacts/husk-projection-pass-v0/husk-projection-after-state.json`
- Husk before -> after proof facts:
  - `silhouette`: `husk -> humanoid`
  - `humanoidProfileId`: `null -> husk_top_down_shambler_v0`
  - `motionState`: `null -> shamble`
  - `humanoidSocketCount`: `0 -> 5`
  - `torchSocketCount`: `0 -> 0`
  - `visualBounds`: `null -> 52.45 x 59.81`
- Torch proof outputs were refreshed in `artifacts/smoke-light-contrast-pass-v0/`.
- Torch defeated-stage before -> after facts:
  - target light intensity `0.7789 -> 0.4991`
  - target light radius `138.39 -> 110.83`
  - dropped torch prop flame alpha `0.9986 -> 0.7167`
  - extinguish timing now lands at the later `9.3s` faded proof snapshot instead of the earlier `5.9s` snapshot
- Final torch faded-stage facts:
  - `mode = extinguished`
  - `emissionScale = 0.03`
  - `flameAlpha = 0`
  - app console issues `0`
  - page errors `0`
- Visual inspection:
  - husk before/after screenshots were opened and compared; the placeholder square is replaced by a smaller, crooked, grey humanoid with a shambling read that sits naturally beside the raider.
  - updated dropped-torch defeated and faded screenshots were opened and reviewed; the torch now drops to a visibly dimmer flame immediately after death while lingering longer before full blackout.

Validation:

```powershell
node tests\raiderHumanoidProjection.test.mjs
node tests\huskHumanoidProjection.test.mjs
node tests\materialProfileRegistry.test.mjs
node tests\torchLifecycle.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\webglWorldDepthLayer.test.mjs
npm test
$env:BSB_HUSK_PROOF_LABEL='before'; $env:BSB_PROOF_URL='http://127.0.0.1:5233/'; node artifacts\husk-projection-pass-v0\proof.mjs
$env:BSB_HUSK_PROOF_LABEL='after'; $env:BSB_PROOF_URL='http://127.0.0.1:5233/'; node artifacts\husk-projection-pass-v0\proof.mjs
$env:BSB_SMOKE_LIGHT_PROOF_LABEL='after'; $env:BSB_PROOF_URL='http://127.0.0.1:5233/'; node artifacts\smoke-light-contrast-pass-v0\proof.mjs
```

Status: passing. The torch now behaves more like a dropped dying flame rather than an instantly bright then abruptly gone emitter, and husks now live inside the same visual grammar as other units while reading as shambling undead instead of generic placeholders.

## 2026-06-29 - Scene Maker v0

- Added a lightweight in-game Scene Maker for BSB_V2 rather than doing a partial AXIOM embed first.
- Added an authored scene document pipeline with import/export helpers so terrain, scene objects, unit placements, and unit spawners can round-trip through JSON without hand-editing runtime code.
- Added runtime-compatible unit spawner authoring plus a `unitSpawnerSystem` so authored spawners exist both in exported scene JSON and in the live simulation state.
- Added a right-side scene editor overlay with:
  - terrain painting
  - scene object placement
  - unit placement
  - spawner placement
  - select/edit/delete inspector flow
  - local scene library save/load
  - JSON export/import
- Exposed the editor through `window.BSB_V2_SCENE_EDITOR` so browser proofing and later AXIOM integration have a stable control seam.
- Tightened the editor default brush radius to `0` so object, unit, and spawner placement starts in precise single-tile mode instead of surprising multi-tile stamping.
- Hardened the browser proof to choose visible non-occluded tiles instead of clicking behind the editor panel.

Proof:

- Scene Maker proof outputs:
  - `artifacts/scene-editor-browser-proof/scene-editor-proof.png`
  - `artifacts/scene-editor-browser-proof/scene-editor-proof.json`
- Latest proof facts:
  - painted terrain tile: `(2, 16) -> water`
  - placed scene object: `tree @ (2, 17)`
  - placed spawner: `husk @ (3, 16)`
  - patched spawner settings: `intervalSeconds=1.7`, `burstCount=2`, `maxAlive=4`
  - runtime spawner present in `render_game_to_text()`
  - console issues: `0`
  - page errors: `0`

Validation:

```powershell
node --check src\editor\sceneEditorController.js
node --check src\editor\sceneEditorOverlay.js
node --check artifacts\scene-editor-browser-proof\proof.mjs
npm test
node artifacts\scene-editor-browser-proof\proof.mjs
```

Status: passing. BSB_V2 now has a usable first-pass scene authoring surface with real runtime import/export and proof-backed terrain, object, and spawner editing.

## 2026-06-29 - Raid Emitter Scene Objects

- Expanded the scene-object roster with diegetic raid aftermath emitters that fit a primitive human assault on a dragon nest:
  - `fire_arrow_left`
  - `fire_arrow_right`
  - `fire_arrow_steep`
  - `fire_arrow_cluster`
  - `smouldering_fern`
  - `smouldering_bramble`
- Added a scene-object emitter lane so authored scenery can now own light, smoke, and ambient particle behaviour instead of relying only on hardcoded torch-style sources.
- Wired scene-object emitters through runtime projection and rendering so Scene Maker placements now show up as:
  - live light views
  - smoke source views
  - ember and ash ambience where appropriate
- Updated the Scene Maker catalog so these new ambience props read as light-emitting scene objects and can be painted directly into authored scenes.
- Seeded the `FIRST_ESCAPE` demo scene with six new ambience props to prove the lane in a live map:
  - `smoulder:start-fern`
  - `fire-arrow:start-left`
  - `fire-arrow:start-right`
  - `fire-arrow:torch-edge-cluster`
  - `smoulder:old-lightning-bramble`
  - `fire-arrow:wolf-edge-steep`
- Refactored the larger scene-object data addition into `src/data/sceneObjectRaidEmitterDefs.js` so the new roster stays modular and inside the repo's LoC guardrails.

Proof:

- Scene Maker proof outputs:
  - `artifacts/scene-editor-browser-proof/scene-editor-proof.png`
  - `artifacts/scene-editor-browser-proof/scene-editor-proof.json`
- Scene Maker proof facts:
  - baseline demo scene scene-object light count: `6`
  - placed emitter object from the editor: `fire_arrow_cluster_23`
  - final object count after editor placement: `23`
  - console issues: `0`
  - page errors: `0`
- Library proof outputs:
  - `artifacts/forest-scene-object-library-v0/forest-scene-object-library-overview.png`
  - `artifacts/forest-scene-object-library-v0/forest-scene-object-library-focus.png`
  - `artifacts/forest-scene-object-library-v0/forest-scene-object-library-focus-crop.png`
- Library proof facts:
  - seeded scene object count: `22`
  - emitter scene object count: `6`
  - scene-object light count: `6`
  - smoke source kinds observed: `raid_flame_wisp`, `smoulder_patch_wisp`, `torch_wisp`, `napalm_smoulder`
  - app console issues: `0`
  - page errors: `0`
- Visual inspection:
  - the Scene Maker proof screenshot was opened and checked; the new fire-arrow and smouldering props read as warm, localized ambient light sources instead of generic decoration.
  - the scene-editor-placed `fire_arrow_cluster` produced a matching runtime scene-object light anchor, confirming authored editor placement and live illumination are wired together.

Validation:

```powershell
node --check src/data/sceneObjects.js
node --check src/data/sceneObjectRaidEmitterDefs.js
node --check src/game/selectors.js
node --check src/projection/smokeLayerState.js
node --check src/projection/ambientParticleProjection.js
node --check src/render/backends/webgl/layers/WebGLSceneryLayer.js
node --check artifacts/scene-editor-browser-proof/proof.mjs
node --check artifacts/forest-scene-object-library-v0/proof.mjs
node tests/locBudget.test.mjs
npm test
node artifacts/scene-editor-browser-proof/proof.mjs
node artifacts/forest-scene-object-library-v0/proof.mjs
```

Status: passing. BSB_V2 now supports paintable ambience emitters as first-class scene objects, with proof that they can be authored in Scene Maker, seeded into the demo scene, and projected into live light, smoke, and ember ambience without console or runtime errors.

## 2026-06-30 - Runtime-Only Map Boundary Rollback v0

Current request: substantially roll BSB_V2 back to its pre-editor runtime shape because the in-game map editor polluted runtime performance/resolution and violated the BSB/AXIOM tooling boundary.

Intent read:

- Literal ask: remove the BSB map editor and restore runtime behaviour.
- Goal frame: BSB is the lean game runtime; AXIOM owns authoring and eventually exports baked runtime maps.
- Required latent completion bar: remove every hot-loop, browser-global, DOM-overlay, guide-canvas, debug-payload, test-runner, and proof-artifact editor landing point while preserving gameplay/runtime map consumers.
- Intentionally deferred: AXIOM authoring UI, bake/export, filesystem import, validation panels, and a BSB external-file loader.

Root cause:

- `src/app.js` constructed editor controller/overlay state inside `createApp()` and called editor/controller/DOM guide updates from the main update and render paths.
- The browser exposed `window.BSB_V2_SCENE_EDITOR`, while `render_game_to_text()` serialized scene authoring state beside runtime truth.
- `src/editor/*` owned localStorage scene libraries, editing input, scene-document conversion, and a second full-screen guide canvas inside the game runtime.

What changed:

- Removed `src/editor/*`, `tests/sceneEditorDocument.test.mjs`, and `artifacts/scene-editor-browser-proof/`.
- Removed editor imports, construction, input interception, overlay refreshes, returned controller state, global exposure, and runtime-text fields from `src/app.js`.
- Preserved `createDemoMap()`, runtime unit placements/spawners, scene objects/emitters, gameplay, tuning, diagnostics, and WebGL rendering.
- Added passive `black-sky-bound.runtime-map.v0` metadata in `src/world/runtimeMapContract.js` and stamped built-in demo maps with it.
- Added `tests/runtimeMapContract.test.mjs` so the runtime map shape is covered without restoring authoring logic.
- Documented the BSB runtime / AXIOM toolbench boundary in `docs/RUNTIME_MAP_BOUNDARY.md` and `docs/TECH_BOUNDARIES.md`.

Browser proof:

- `artifacts/runtime-only-rollback-v0/runtime-only-gameplay.png`
- `artifacts/runtime-only-rollback-v0/runtime-only-state.json`
- normal `npm start -- 5242` launcher path
- dragon moved from x `6.5` to `7.97`
- F2 did not create or activate editor UI
- `BSB_V2_SCENE_EDITOR` absent
- scene-editor DOM count `0`
- `render_game_to_text()` scene-editor field absent
- WebGL active
- CSS viewport `1440x900`; backing buffer `2160x1350` at DPR `1.5`
- app console issues `0`; page errors `0`

Validation:

```powershell
node --check src/app.js
node --check src/world/map.js
node --check src/world/runtimeMapContract.js
node --check tests/runtimeMapContract.test.mjs
npm test
npm start -- 5242
$env:BSB_PROOF_URL='http://127.0.0.1:5242/'; node artifacts/runtime-only-rollback-v0/proof.mjs
```

Status: passing. BSB_V2 is runtime-only again at the map boundary; external map loading remains an explicit future consumer seam rather than an editor sneaking back into the game loop.

## 2026-06-30 - AXIOM-Owned Map Authoring Consumer Seam v0

Current request: continue the runtime/tooling separation by making AXIOM properly able to author BSB V2 maps.

What changed:

- Added strict `src/world/runtimeMapLoader.js` support for bounded `?map=/data/maps/*.runtime-map.json` requests.
- Requested maps are contract-validated, stripped of authoring authority, normalized for runtime use, and deeply frozen.
- Invalid requested maps now block boot visibly rather than silently falling back.
- `createApp()` accepts the validated map and reports exact runtime-map provenance through `render_game_to_text()`.
- AXIOM now owns a planar map canvas, tools, editable draft, governed source save, deterministic runtime bake, and Author / Runtime preview switching.
- The canonical editable source lives under AXIOM; `data/maps/axiom-first-escape.runtime-map.json` is a derived runtime artifact only.
- No editor UI, editor input, authoring storage, or scene-document controller was restored inside BSB.

Proof:

- AXIOM authoring screenshot: `AXIOM/apps/launcher/output/playwright/axiom-bsb-v2-map-authoring.png`
- baked runtime screenshot: `AXIOM/apps/launcher/output/playwright/axiom-bsb-v2-baked-runtime.png`
- proof state: `AXIOM/apps/launcher/output/playwright/axiom-bsb-v2-map-authoring-state.json`
- source and bake writes returned independent SHA-256 receipts;
- BSB reported contract `black-sky-bound.runtime-map.v0`, exact baked source path, and `immutable: true`;
- authored water, tree, and player-spawn changes survived into the runtime preview;
- WebGL active, unclassified HTTP failures `0`, app console issues `0`, page errors `0`.

Validation:

```powershell
cd _A_Projects/BLACK_SKY_BOUND_V2
node tests/runtimeMapLoader.test.mjs
npm test

cd AXIOM/apps/launcher
node tests/bsb-v2-map-authoring.test.mjs
npm test
npm run test:bsb-v2-authoring
```

Status: passing. AXIOM is now the authoring owner and BSB is the immutable runtime-map consumer.

## 2026-07-01 - Enemy Encounter Foundation v0 / Slice 1

Current request: replace dragon-only enemy pressure with the smallest faction-aware hostile-targeting foundation, while preserving the legacy `enemy` team and existing contact attacks.

Planned truth boundary:

- `src/constants/factions.js` will own faction ids and relationship answers.
- actor data will own type-specific default teams for raiders, husks, and werewolves.
- legacy `enemySpawns` and explicit `team: "enemy"` remain compatibility inputs.
- `EnemyPressureAI` will select the nearest alive hostile in range from ECS team/health/transform truth rather than `game.dragonId`.
- no pathfinding, behaviour trees, squads, cover, tactics, map-authoring UI, or attack-profile changes.

Validation planned: focused relationship/target-selection tests, full `npm test`, and a real first-escape browser playtest with screenshot, runtime state, and console/page-error inspection.

Implementation result:

- Expanded faction ids to `player`, `raiders`, `husks`, `wolves`, `allies`, `enemy`, and `neutral`.
- Added canonical symmetric `areFactionsHostile(a, b)` and `areFactionsFriendly(a, b)` answers in `src/constants/factions.js`.
- Kept `enemy` as a compatibility umbrella: it is hostile to player/allies and friendly with raiders/husks/wolves, so mixed legacy enemy maps do not begin infighting.
- Made raider, husk, and werewolf actor defaults resolve to their specific factions for direct units and spawners.
- Preserved legacy `enemySpawns` and explicit `team: "enemy"` as generic enemy inputs.
- Attached pressure AI from actor capability data rather than `team === enemy`, allowing faction-specific and allied actor variants to use the same simple pressure system.
- Replaced `game.dragonId` targeting in `enemyPressureSystem` with nearest alive hostile selection inside each actor's aggro range.
- Rerouted player hostile views/contact targeting through the same relationship helper so new faction ids remain attackable.
- Preserved the current movement, smoke slowdown, stagger slowdown, contact range, cooldown, damage, and hurt-effect behavior.

Validation:

```powershell
node tests\factionRelationships.test.mjs
node tests\enemyPressureTargeting.test.mjs
node tests\runtimeMapLoader.test.mjs
npm.cmd test
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
node tests\locBudget.test.mjs
node artifacts\enemy-encounter-foundation-v0\proof.mjs
```

Status: passing.

- Full suite: 50 focused test modules passed.
- First-escape browser proof: dragon moved from x `6.50` to `7.97`; all five legacy scenario enemies retained team `enemy`; WebGL remained active.
- Hostile non-player browser proof: staged raider team `raiders` selected a nearer husk team `husks`; husk HP changed `28 -> 19`; farther dragon HP stayed `100`.
- App console issues: `0`; page errors: `0`.
- Visible proof screenshots were opened and inspected:
  - `artifacts/enemy-encounter-foundation-v0/first-escape-gameplay.png`
  - `artifacts/enemy-encounter-foundation-v0/hostile-non-player-target.png`
- Runtime evidence: `artifacts/enemy-encounter-foundation-v0/enemy-encounter-foundation-state.json`.
- The shared web-game client also completed through the established project-local hard-link workaround; its WebGL canvas-only captures remained black as expected, so the project-specific full-page screenshots are the visual evidence.

Deliberately left for Slice 2: attack profiles/ranges/shapes/telegraphs and any attack-specific improvements. Pathfinding, behaviour trees, squads, cover, group tactics, and map-authoring UI remain outside this foundation.

## 2026-07-01 - Enemy Encounter Foundation v0 / Slice 2

Current request: extend faction-aware enemy pressure into a minimal authored-encounter state model: `roam`, `alert`, `attack`, and `return`.

Planned ownership:

- Extend the existing `EnemyPressureAI` component in place; do not add a parallel enemy-brain component or array.
- `src/data/actors.js` owns per-kind roam, aggro, leash, and decision cadence defaults.
- `src/game/spawn.js` stamps the actual spawn position as the behavior anchor.
- `src/systems/enemyPressureSystem.js` owns target validity, cadence-limited nearest-hostile decisions, state transitions, roaming, leashing, return movement, and the existing contact attack.
- Actor views plus `render_game_to_text()` expose current behavior state for browser proof without changing rendering.

Constraints: no behavior trees, pathfinding expansion, attack-profile work, squads, tactics, cover, map-authoring UI, renderer changes, GPU instancing, or unit separation.

Validation planned: focused state-transition/leash/compatibility tests, full `npm.cmd test`, the installed web-game client, and a project-specific first-escape Playwright proof with visible screenshots and runtime state.

Implementation checkpoint:

- Extended `EnemyPressureAI` in place with anchored `roam`, `alert`, `attack`, and `return` state; no parallel brain component was added.
- Spawned actors now stamp their actual position into `anchorX`/`anchorY`.
- Added actor-owned tuning:
  - raider: roam `6`, aggro `11`, leash `18`, decision interval `0.65s`;
  - husk: roam `4`, aggro `9`, leash `16`, decision interval `0.9s`;
  - werewolf: roam `8.5`, aggro `14`, leash `22`, decision interval `0.4s`.
- Nearest-hostile scans run only when `decisionCooldown` expires; current-target validity and leash checks remain cheap per-frame component reads.
- Roam targets are deterministic, local to the anchor, and changed on a bounded cadence rather than every frame.
- Existing contact damage, smoke slowdown, stagger slowdown, factions, and legacy `enemy` compatibility remain on the same system path.
- Actor compatibility views and `render_game_to_text()` now expose behavior state and tuning for proof/debugging.
- Added focused coverage for roam, alert, cadence-limited retargeting, attack, neutral/dead target clearing, leash return, old-shape `EnemyPressureAI` hydration, and spawner anchor/default inheritance.

Checkpoint validation: focused tests, full `npm.cmd test`, app import, and LoC budget all pass. Browser proof remains pending.

Final validation:

```powershell
node tests\enemyPressureTargeting.test.mjs
node tests\enemyBehaviourStates.test.mjs
node tests\unitSpawnerSystem.test.mjs
npm.cmd test
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
node tests\locBudget.test.mjs
$env:BSB_PROOF_URL='http://127.0.0.1:5248/'
$env:BSB_PLAYWRIGHT_CHANNEL='msedge'
node artifacts\enemy-encounter-foundation-v0-slice2\proof.mjs
```

Status: passing.

- Full suite: 51 focused test modules passed.
- First escape remained `playing`; dragon moved from x `6.50` to `7.97`; all five legacy enemies retained team `enemy`; raider 2 entered `alert` against the dragon.
- Installed web-game client state after live inputs showed WebGL active, player HP `82`, one legacy raider in `attack`, one in `alert`, and the distant husks/werewolf in `roam`; error files `0`.
- Project-specific state proof covered:
  - `roam`, target `null`, roam target inside radius `6`;
  - `alert` targeting hostile husk;
  - `attack`, husk HP `28 -> 19` using unchanged contact damage;
  - dead target clear to `roam`;
  - leash breach clear to `return`, moving x `33.50 -> 33.41` toward anchor;
  - return completion back to `roam`.
- WebGL active; app console issues `0`; page errors `0`.
- Visible screenshots opened and inspected:
  - `artifacts/enemy-encounter-foundation-v0-slice2/first-escape-state-model.png`
  - `artifacts/enemy-encounter-foundation-v0-slice2/enemy-state-attack.png`
  - `artifacts/enemy-encounter-foundation-v0-slice2/enemy-state-return.png`
- Runtime evidence: `artifacts/enemy-encounter-foundation-v0-slice2/enemy-state-model-state.json`.
- No dependencies or browsers were installed. The generic client's known WebGL canvas-only capture stayed black; project-specific full-page screenshots provided the visual evidence lane.

Deliberately left for Slice 3: attack profiles, telegraphs, windups, wolf pounce, husk grab, raider spear/torch attacks, corpse/blood/on-death work, and attack readability. Encounter groups, pathfinding expansion, squads/tactics/cover, authoring UI, GPU instancing, renderer work, and unit separation also remain out of scope.

## 2026-07-01 - Enemy Encounter Foundation v0 / Slice 3

Current request: replace shared contact attacks with data-driven raider, husk, and werewolf profiles, with the adjusted raider loadout explicitly supporting both spear jab and carried-torch swing.

Ownership and implementation:

- Added `src/data/enemyAttackProfiles.js` as the canonical profile registry.
- Raiders alternate `raider_spear_jab` and `raider_torch_swing`; the torch profile uses fire damage and the existing `torch_flame_socket`, so the same carried light visibly swings and still follows the established drop-on-death lifecycle.
- Husks use `husk_claw_maul`; werewolves use `werewolf_lunge_bite`; old-shape `EnemyPressureAI` payloads hydrate to `legacy_enemy_contact` using their historical range/damage/cooldown values.
- Extended `EnemyPressureAI` in place with idle/windup/recover phase state, timers, pending target, active/last profile, and last-hit evidence. Existing `Cooldowns.attack` remains the canonical cooldown owner.
- Added `enemyAttackSystem` after pressure targeting. Pressure AI still deliberately chooses hostiles only; the attack system resolves one hit after windup, then recovery/cooldown, using circle/arc/capsule checks only at hit time.
- Collateral policy is profile-owned: raider attacks are `hostile_and_friendly`, husk is `all_damageable`, werewolf is `target_only`, and legacy contact is `target_only`. Attackers and dead entities are always excluded; neutral entities are ignored unless mode is `all_damageable`.
- Added projection-only jab/maul/torch timing poses without new lights, shadows, particles, renderer paths, or weapon entities.

Profile values:

- Spear jab: range `1.15`, damage `9`, cooldown `1.10s`, windup `0.28s`, recovery `0.34s`.
- Torch swing: range `0.98`, damage `8`, cooldown `1.25s`, windup `0.36s`, recovery `0.42s`.
- Husk maul: range `0.78`, damage `6`, cooldown `1.30s`, windup `0.42s`, recovery `0.48s`.
- Werewolf bite: range `1.28`, damage `14`, cooldown `1.55s`, windup `0.20s`, recovery `0.62s`.

Validation:

```powershell
node tests\enemyPressureTargeting.test.mjs
node tests\enemyBehaviourStates.test.mjs
node tests\enemyAttackProfiles.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
$env:BSB_PROOF_URL='http://127.0.0.1:5253/'
$env:BSB_PLAYWRIGHT_CHANNEL='msedge'
node artifacts\enemy-encounter-foundation-v0-slice3\proof.mjs
```

Status: passing.

- Full suite: 52 focused test modules passed.
- Tests cover delayed damage, cooldown/recovery, deterministic raider spear-to-torch selection, target-only/hostile-only/hostile-and-friendly/all-damageable filtering, dead/self immunity, neutral handling, target death, target leaving range, hostile-only intent selection, legacy enemy compatibility, and torch socket motion.
- Browser proof kept first escape `playing`, moved the dragon x `6.50 -> 7.97`, retained all five generic `enemy` teams, and showed their type-specific attack loadouts.
- Live proof: spear target `28 -> 19` and packed friendly `42 -> 33`; torch target `19 -> 11` and packed friendly `33 -> 25`; neutral stayed `28`; husk target `42 -> 36`; werewolf target `100 -> 86`.
- WebGL active; app console issues `0`; page errors `0`.
- Visible captures inspected: `artifacts/enemy-encounter-foundation-v0-slice3/first-escape-attack-profiles.png`, `raider-spear-windup.png`, and `raider-carried-torch-windup.png`.
- Runtime evidence: `artifacts/enemy-encounter-foundation-v0-slice3/enemy-attack-profile-state.json`.

Deliberately left for Slice 4: on-death events, corpse/body decals, blood pooling, live enemy cleanup, and spawner dead-id cleanup verification. Full smoke confusion, projectile combat, advanced AI/tactics, complex hitboxes, map-authoring UI, renderer rewrites, and unit separation remain out of scope.

## 2026-07-01 - Enemy Encounter Foundation v0 / Slice 3.5

Current request: improve enemy obstacle handling, collider spacing, local avoidance, and approach positioning without adding pathfinding, physics-engine, squad, or renderer work.

Root cause and ownership:

- Movement collision used a point sample plus axis fallback, so actor radii could clip blocker edges and enemies could stall against the same tangent.
- Every enemy approached the target centre, and there was no live-actor separation pass, so shared pursuits collapsed into one spatial path.
- `src/systems/movementSystem.js` remains the canonical map-collision owner; it now supplies radius-aware occupancy and deterministic sampled steering.
- Added `src/systems/actorSeparationSystem.js` as an ECS system over live `Transform + Collider + Health` entities; it does not create a parallel actor list.
- `src/systems/enemyPressureSystem.js` remains the intent/state owner and now derives deterministic target-relative engagement points.

Implementation:

- Radius-aware collision tests each actor circle against blocked terrain and coarse scene-object tiles, including playable-map bounds.
- Enemy movement tries `0`, `+/-25`, `+/-50`, and `+/-80` degrees in closest-to-intent order. Entity-id parity chooses a stable left/right tie order; non-zero samples may slide along their valid axis. If every sample is blocked, movement stops cleanly.
- Live actors are bucketed into `2.5`-unit cells and inspect only the surrounding 3x3 cells, capped at `20` neighbours per actor.
- Overlap correction is accumulated, soft, and capped before collision-safe application. Separation padding is `0.16` world units.
- Separation mass defaults: dragon `3.2`, werewolf `1.8`, raider `1.2`, husk `0.75`, so lighter enemies yield more than the player.
- Engagement positions use eight deterministic angular sectors derived from source entity id and target id; preferred distance accounts for both collider radii, profile range, and padding without formal reservation.
- Runtime text now exposes engagement targets, steering counters, blocked state, and bucket diagnostics.
- Fixed a discovered Slice 3 interaction: separation displacement can no longer overwrite a humanoid attack's committed windup facing.

Validation:

```powershell
node tests\enemyMovementSpacing.test.mjs
node tests\enemyAttackProfiles.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
$env:BSB_PROOF_URL='http://127.0.0.1:5255/'
$env:BSB_PLAYWRIGHT_CHANNEL='msedge'
node artifacts\enemy-encounter-foundation-v0-slice3-5\proof.mjs
```

Status: passing.

- Full suite: 53 focused test modules passed.
- Focused tests cover radius-aware blockers, fixed-angle steering, soft separation, dragon/husk mass priority, dead-actor exclusion, bucket broadphase reduction, distinct engagement offsets, scene/terrain safety, and attack-facing preservation during separation.
- First escape stayed `playing`; dragon moved x `6.50 -> 7.64`; all five legacy `enemy` units remained compatible.
- Six staged husks improved from minimum pair distance `0.054` to `0.532`, retained six distinct engagement angles, and remained at least `0.672` from the dragon.
- The staged raider recorded `129` successful steering samples around the first boulder, reduced target distance `3.53 -> 1.62`, and ended collision-safe.
- Slice 3 spear regression proof remained `28 -> 19` after windup and separation.
- Browser proof: WebGL active; app console issues `0`; page errors `0`.
- Inspected captures: `artifacts/enemy-encounter-foundation-v0-slice3-5/first-escape-movement-spacing.png`, `husk-swarm-separation.png`, and `obstacle-steering.png`.
- Runtime evidence: `artifacts/enemy-encounter-foundation-v0-slice3-5/enemy-movement-spacing-state.json`.
- Shared web-game client completed two input iterations with WebGL runtime state and zero error files; its known canvas-only screenshot remained black, so the project-specific full-page captures are the visual evidence.
- No dependencies or browsers were installed.

Deliberately out of scope: navmesh/A*, physics engine, squads, cover, formations, formal slot reservations, renderer/GPU work, map authoring UI, and the Slice 4 corpse/blood/on-death cleanup pass.

## 2026-07-01 - Enemy Encounter Foundation v0 / Slice 4

Completed the basic enemy death lifecycle as one ECS-owned path:

- `applyDamageToEntity` remains the alive-to-dead event source; `deathLifecycleSystem` consumes each `ENTITY_DIED` event once and leaves a `DeathState` receipt on the defeated actor.
- Defeated actors lose live AI, targeting, attacks, motion, cooldowns, player intent/control, emitters, status, and impact authority. Minimal dead actor data remains only where existing aftermath systems need it, notably the raider's dropped-torch fade.
- A separate capped `Corpse` ECS entity owns aftermath provenance, final position/orientation, actor-type body profile, blood-pool profile, and local slowdown field. Corpse entities have no health, team, collider, light, AI, or attack components.
- Raider, husk, and werewolf profiles project distinct prone/sprawled/predator silhouettes plus bounded blood stains through the existing renderer-neutral decal layer.
- Corpse count is capped at 24 and removes oldest aftermath first. Movement samples at most that bounded set, takes the strongest local penalty rather than multiplying stacks, and clamps safely; the dragon's higher mass reduces the effect.
- Spawner tracking continues to preserve total spawn limits while discarding dead/removed IDs, so `maxAlive` capacity recovers.
- `render_game_to_text()` now exposes corpse provenance/profile/tuning and the currently applied locomotion multiplier for browser evidence.

Validation:

```powershell
node tests\deathLifecycle.test.mjs
node tests\unitSpawnerSystem.test.mjs
npm.cmd test
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
$env:BSB_PROOF_URL='http://127.0.0.1:5257/'
$env:BSB_PLAYWRIGHT_CHANNEL='msedge'
node artifacts\enemy-encounter-foundation-v0-slice4\proof.mjs
```

Status: passing.

- Full suite: 54 focused test modules passed.
- One lethal transition emitted one death event; repeated damage and repeated lifecycle passes did not duplicate aftermath.
- Dead AI, pending targets, and attack windups cleared; corpse entities remained untargetable and undamageable.
- Spawner proof replaced `husk_10` with `husk_12` at `maxAlive: 1` while keeping `spawnedCount: 2` and `aliveCount: 1`.
- Browser proof rendered all three distinct corpse profiles, three blood pools, 8 visible decal sources / 101 decal primitives, and retained the dropped raider torch.
- Dragon corpse traversal applied multiplier `0.935` and moved `0.458` tiles in the proof step, confirming mild slowdown without blocking.
- First escape remained `playing`; dragon moved x `6.50 -> 7.64`; all five legacy `enemy` actors remained compatible.
- WebGL2 active; app console issues `0`; page errors `0`.
- Screenshots inspected: `artifacts/enemy-encounter-foundation-v0-slice4/first-escape-death-lifecycle.png` and `raider-husk-werewolf-aftermath.png`.
- Runtime evidence: `artifacts/enemy-encounter-foundation-v0-slice4/enemy-death-lifecycle-state.json`.
- No dependencies or browsers were installed.

Deliberately out of scope: ragdolls, corpse physics/targeting/eating, dismemberment, fluid blood, hard corpse collision, corpse-aware pathfinding, attack-profile expansion, new enemy types, map authoring UI, GPU instancing, and renderer rewrites.

## 2026-07-01 - Combat Readability / Procedural Fronting Pass (in progress)

Current request: make enemy swing, gait, reach, held spear/torch attacks, moving-fire trails, hit reactions, forces/pushes, and attack/receive procedural profiles visibly readable; also sense-check the player wyvern bite so its head and body cannot disagree about attack direction.

Baseline findings:

- enemy attack profile timing and hit shapes already exist and remain the canonical combat truth;
- the raider spear jab has no rendered spear despite having a live profile;
- the carried torch socket moves during its swing, but there is no retained flame path or strike accent;
- knockback changes transforms, while humanoid/wyvern poses do not yet consume the receiving impact as a readable recoil;
- player actions snapshot an aim direction, but later movement can rotate the body during the committed action;
- the werewolf bite is combat-authored but still renders through the non-procedural fallback actor shape.

Planned landing points: attack and receive profile data, ECS impact receipts, humanoid/wyvern/predator projections, WebGL silhouettes/effects, focused tests, runtime text evidence, and a real browser playtest. Balance, hit damage, AI targeting, map authoring, and renderer architecture remain out of scope.

Baseline validation: `npm.cmd test` passes before edits.

Implementation checkpoint:

- Added data-owned receive profiles for weighted wyvern, human raider, loose husk, and braced werewolf reactions.
- Unified wyvern and enemy force application through one impact receipt, including direction, impulse, stagger, duration, and receive-profile provenance.
- Added a visible carried spear with grip/tip sockets and a jab animation that separates anticipation from strike.
- Added bounded projection-owned trails for moving flame, spear-tip jabs, and husk claw motion; the falling defeated torch also trails only while moving.
- Added profile-owned source strike accents so spear, torch, claw, and predator attacks remain visible even when the target is missed or obscured.
- Added a renderer-neutral werewolf predator projection with gait, bite extension, recovery state, and a WebGL quadruped silhouette.
- Added procedural receive poses for humanoids and the wyvern while preserving transform-based knockback and actor-owned resistance.
- Added committed action facing to the player action state; the wyvern projection now restores that facing after movement input so head, body, mouth socket, and contact volume agree.
- Added `combatReadability.test.mjs` for weapons, trails, strike accents, receive profiles, pushes, werewolf bite projection, and wyvern head/body fronting.

Checkpoint validation:

```powershell
node tests\combatReadability.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
```

Status: passing. Real browser proof and screenshot inspection remain pending.

Final validation:

```powershell
node tests\combatReadability.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
$env:BSB_PROOF_URL='http://127.0.0.1:5262/'
$env:BSB_PLAYWRIGHT_CHANNEL='msedge'
node artifacts\combat-readability-v0\proof.mjs
```

Status: passing.

- Full suite: 55 focused modules passed, including the new combat-readability regression.
- Shared web-game client completed two live-input iterations through the established temporary hard-link workaround; the link was removed afterward. Its WebGL canvas-only captures remained black, while runtime state proved normal first-escape movement, two moving carried-flame trails, the new spear sockets, and the predator projection.
- Project-specific Playwright proof covered spear windup/strike reach, torch strike plus flame trail and wyvern recoil, husk twin-claw motion, werewolf bite plus weighted wyvern receive profile, and a real pointer-triggered player bite while rightward movement attempted to rotate the body.
- Runtime proof: two rendered spear sockets; 9 torch trail samples; husk `claw_left`/`claw_right` trails; procedural predator active with 10 parts; torch hit `100 -> 92`; wolf hit `100 -> 86`; perpendicular player bite direction agreement `1.0`; bite target `42 -> 20`.
- Browser proof: WebGL active; app console issues `0`; page errors `0`; no dependencies or browsers installed.
- Screenshots opened and inspected:
  - `artifacts/combat-readability-v0/spear-readability.png`
  - `artifacts/combat-readability-v0/torch-readability.png`
  - `artifacts/combat-readability-v0/husk-readability.png`
  - `artifacts/combat-readability-v0/wolf-readability.png`
  - `artifacts/combat-readability-v0/wyvern-readability.png`
- Runtime evidence: `artifacts/combat-readability-v0/combat-readability-state.json`.

Intentionally unchanged: attack damage/ranges/cooldowns, faction targeting, collateral policy, AI decision structure, map authoring, lighting architecture, and renderer backend policy. The pass adds readable embodiment and receiving response around existing combat truth rather than rebalance or replace it.

## 2026-07-02 - Flame, Light Emitter, and Napalm Readability Pass v1

Reworked the small-fire path around the existing WebGL light and shadow ownership instead of making the flame body carry the light volume:

- added one shared layered teardrop flame recipe for fire-arrow scene objects, carried raider torches, and dropped torches;
- replaced rectangular spark particles with restrained tapered micro-streaks and gave raid flames a smaller dedicated spark recipe;
- redirected torch and raid-flame smoke into subtle upward wisps while preserving unified smoke-source projection and light scatter;
- replaced the legacy square napalm projectile with a small descending liquid bead, short trailing filament, contact shadow, and micro-wisp;
- added canonical droplet and pool visual-state resolvers so projectile, smoke, light, and decal consumers share fall, spread, heat, and cooling progress;
- changed residual napalm from instant full-size glow to a short pooling spread, bounded hot seams, cooling light, oily dark body, and persistent residue;
- reduced the carried/dropped torch motion-trail width and opacity so movement leaves a short lick rather than a thick orange ribbon;
- replaced round smouldering-plant embers with thin ember slits and trimmed oversized ash flecks.

Validation:

```powershell
npm test
node artifacts\flame-light-emitter-pass-v1\proof.mjs
$env:BSB_PROOF_URL='http://127.0.0.1:5177/'
node artifacts\combat-readability-v0\proof.mjs
```

Status: passing.

- Full focused suite passed, including explicit protection against the old napalm rectangle fallback.
- Flame/emitter browser proof: WebGL active; 4 raid lights, 12 bounded raid sparks, and 8 raid smoke sources projected in the staged scene.
- Napalm lifecycle proof: three falling droplets exposed distinct descent progress; three pools exposed spreading, hot, and cooled states; each pool stayed at two bounded hot seams.
- Combat browser proof retained 9 carried-flame motion-trail samples during the staged torch strike.
- App console issues `0`; page errors `0`; no dependencies or browsers installed.
- Screenshots inspected: `artifacts/flame-light-emitter-pass-v1/flame-light-overview.png`, `flame-light-emitters.png`, `napalm-lifecycle.png`, and `artifacts/combat-readability-v0/torch-readability.png`.

Intentionally unchanged: gameplay damage, fire simulation, AI decisions, global lighting profiles, light/shadow architecture, renderer backend policy, and particle budgets. A later dedicated torch-motion pass can add velocity-aware flame deformation; this slice keeps the existing trail ownership and makes its output restrained and readable.

## 2026-07-02 - Stamina, Dodge, and Sprint Foundation v0 (in progress)

Current request: add a short evasive dodge for the baby wyvern, raiders, and werewolf; introduce stamina across living actors so dodge cannot be spammed; and give the player a quick, restrained sprint that feels sharp without giving a hatchling an adult-sized endurance pool.

Intent and ownership:

- `Stamina` will be the canonical runtime resource on every spawned actor.
- Actor-owned locomotion profiles will define stamina capacity/recovery, sprint tuning, and dodge capability/cost; husks will carry stamina state but will not gain a dodge in this slice.
- One shared `startDodge(...)` path will serve both player input and enemy threat response.
- `movementSystem` remains the only map/scene collision owner; dodge displacement must use the same collision-safe movement seam.
- Required visibility includes player stamina in the normal HUD and stamina/dodge facts in `render_game_to_text()`; enemy stamina bars are intentionally excluded to keep the play view calm.

Constraints:

- no physics engine, invulnerability frames, animation graph, new enemy tactics system, HUD redesign, or movement-authority fork;
- player dodge must not combine with a same-frame attack/smoke action;
- raider/werewolf evasion must be deterministic, stamina/cooldown limited, and react only to a legible incoming hostile attack.

Baseline validation:

```powershell
npm.cmd test
```

Status: passing before edits.

Implementation:

- Added actor locomotion profiles for the baby wyvern, raider, husk, and werewolf.
- Every spawned actor now owns canonical `Stamina`; the player, raider, and werewolf also receive enabled `DodgeState`, while husk dodge remains explicitly disabled.
- Added one shared `startDodge(...)` function with explicit denial reasons for active dodge, cooldown, insufficient stamina, active attacks, stagger, and invalid direction.
- Player controls now use held `Shift` for sprint and `Q` for dodge. A held move direction chooses the hop; without movement, dodge goes away from the current aim/facing.
- Sprint resolves before movement and uses the existing terrain/corpse movement path. The hatchling has `48` stamina, a `1.48x` sprint, and `28/s` drain, making a full sprint last about `1.7s` before the recovery delay.
- Dodge displacement uses the existing collision-safe `moveEntityRaw(...)` path and resolves before actor separation. The hatchling spends `19` stamina per `1.12`-tile hop, allowing two immediate dodges but denying a third.
- Raider threat response uses a short deterministic side-step (`24` stamina); werewolf threat response uses a faster back-diagonal jump (`24` stamina). Both react only to a nearby, directionally relevant hostile windup/action and remain attack/cooldown/stamina limited.
- Wyvern, humanoid, and predator projection state now report `dodge`; the hatchling consumes a dedicated quick brace/spring/land motion profile during the hop.
- Added a subdued amber stamina meter and dodge readiness to the existing WebGL HUD. Enemy stamina remains available through runtime text rather than adding combat-screen bars.
- `render_game_to_text()` now exposes player and actor stamina, sprint multiplier, dodge phase/distance/cooldown/count, denial reason, and trigger provenance.
- Added a headless-launch opt-out (`BSB_NO_OPEN=1`) so browser proof can use the real tuning-aware project server without opening an unrelated desktop browser.

Validation:

```powershell
node tests\staminaDodgeSprint.test.mjs
npm.cmd test
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
node tests\locBudget.test.mjs
$env:BSB_NO_OPEN='1'; node tools\launch.mjs 5264
$env:BSB_PROOF_URL='http://127.0.0.1:5264/'
$env:BSB_PLAYWRIGHT_CHANNEL='msedge'
node artifacts\stamina-dodge-sprint-v0\proof.mjs
```

Status: passing.

- Full focused suite passed, including stamina capacity/recovery/capping, sprint drain/exhaustion, collision-safe player dodge, two-dodge restraint, explicit third-dodge denial, raider/werewolf threat evasion, husk non-evasion, HUD projection, and system-order contracts.
- Browser sprint: player x `10.00 -> 14.47` over `620ms`; stamina `48 -> 30.73`; live speed multiplier `1.48`.
- Browser player dodge: y `20.00 -> 21.12`; active midpoint phase `0.417`; stamina `48 -> 29`; final dodge count `1`.
- Browser enemy dodge: raider stamina `42 -> 18` with `dodge` motion; werewolf stamina `58 -> 34` with `dodge` motion; both retained `incoming_attack:young_dragon_1` provenance and completed exactly one jump.
- WebGL active; app console issues `0`; page errors `0`.
- Project-specific screenshots opened and inspected:
  - `artifacts/stamina-dodge-sprint-v0/player-sprint-active.png`
  - `artifacts/stamina-dodge-sprint-v0/player-dodge-active.png`
  - `artifacts/stamina-dodge-sprint-v0/raider-werewolf-dodge.png`
- Runtime evidence: `artifacts/stamina-dodge-sprint-v0/stamina-dodge-sprint-state.json`.
- The required shared web-game client completed two live-input iterations through the established project-local hard-link workaround with error files `0`. Its canvas-only captures remained black under the known WebGL `preserveDrawingBuffer: false` limitation; the project-specific full-page captures are the visual evidence lane.

Intentionally unchanged: attack damage and invulnerability, faction relationships, map authoring, renderer backend ownership, physics-engine scope, advanced enemy tactics, and enemy stamina bars. A later balance pass can tune costs/regen after longer human play without changing the ownership path.

## 2026-07-02 - AXIOM map publication into standalone BSB (in progress)

Current request: make standalone BSB load the latest AXIOM-baked First Escape / First Flightless Night runtime map, with one canonical path and explicit load/fallback evidence.

Baseline finding:

- AXIOM writes the runtime bake to `_A_Projects/BLACK_SKY_BOUND_V2/data/maps/axiom-first-escape.runtime-map.json` through the registered `black-sky-bound-v2-demo` project root.
- The standalone server already serves that same BSB project root.
- Standalone startup without `?map=` does not fetch a runtime map. `src/app.js` calls `createDemoMap()` and reports `runtimeMap.source: "built_in_demo"`, `id: "first_escape"`, `revision: 0`, `immutable: false`.
- The baked file reports `id: "axiom_first_escape"`, `revision: 560`, and SHA-256 `496e39e62b2b01c9032effd441311ae564f6a95d329dea95d4d453e72e2b5507`.
- The old map is therefore a default-selection divergence, not a static-server-root or browser-cache failure.

Planned ownership: the existing BSB map-catalogue area will own one manifest-backed First Escape publication path; AXIOM will resolve its bake destination from that contract, and BSB will fail visibly if the manifest or map cannot load. The FFP menu remains reference-only and no editor/menu redesign is included.

Implementation:

- Added one `black-sky-bound.map-manifest.v0` owner at `data/maps/manifest.json`. Its standalone default `first_flightless_night` binds scenario `first_escape` and runtime map id `axiom_first_escape` to `/data/maps/axiom-first-escape.runtime-map.json`.
- Reworked the previously unused `src/data/maps.js` catalogue module into the manifest validator/selector rather than creating a second catalogue.
- Added `src/world/runtimeMapBootstrap.js` so browser startup always resolves the manifest default, while bounded `?map=` requests remain explicit import overrides.
- Extended the runtime-map loader with no-store fetching, SHA-256 receipts, contract/revision versions, expected map/scenario checks, and explicit `fallbackUsed: false` provenance.
- Standalone load success and failure now log `[BSB map]` entries and expose the receipt through `window.BSB_V2_MAP_LOAD`; failures expose `window.BSB_V2_BOOT_ERROR` and stop boot.
- AXIOM now reads the BSB manifest through the registered `black-sky-bound-v2-demo` project root before each bake and writes to the manifest-owned path. Missing/mismatched publication contracts block bake visibly.
- The built-in `createDemoMap()` remains available to programmatic tests but is no longer the browser's no-query fallback.

Validation:

```powershell
npm.cmd test # _A_Projects/BLACK_SKY_BOUND_V2
npm.cmd test # AXIOM/apps/launcher
node artifacts/map-publication-v0/proof.mjs
node artifacts/map-publication-v0/web_game_playwright_client.mjs --url http://127.0.0.1:5177/ --actions-file C:/Users/felix/.codex/skills/develop-web-game/references/action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts/map-publication-v0/web-game-client
```

Status: passing.

- AXIOM performed an idempotent terrain paint, saved authoring revision `560 -> 561`, resolved the BSB manifest, and baked revision `561`.
- Bake receipt SHA-256 and both embedded/standalone runtime hashes matched: `5ef886d7b172811d8608b7c45e044fc51b6053a8c2e7642283c4193aa76d42c6`.
- Bare standalone `http://127.0.0.1:5177/` used no map query and reported path `/data/maps/axiom-first-escape.runtime-map.json`, id `axiom_first_escape`, selection source `manifest_default`, immutable `true`, and fallback `false`.
- Standalone browser proof recorded console errors `0`, page errors `0`, and request failures `0`.
- Explicit missing-map browser probe stopped boot with `runtime_map_fetch_failed:404` and `fallbackUsed: false`.
- Screenshots inspected: `artifacts/map-publication-v0/axiom-bake-publication.png` and `standalone-bsb-published-map.png`.
- Shared web-game client state independently reported the same path/hash/revision and no error file. Its canvas-only screenshot was black under the known WebGL capture limitation; the project-specific full-page screenshot is the visual proof.

Intentionally unchanged: authoring-map retention, runtime simulation/rendering, editor layout, FFP runtime/menu code, and BSB's independence from a running AXIOM process. The FFP selection/import menu remains follow-up reference material for a future V2 map-library slice.

## 2026-07-02 - AXIOM Map Bounds Expansion v0 (in progress)

Current request: grow the canonical AXIOM-authored BSB V2 map from `42×30` to a bounded larger map, preserve existing content, make the expanded area reachable in Map Forge, bake it, and prove standalone BSB consumes and renders it through the existing manifest default.

Baseline:

- Canonical dimensions live in the AXIOM `axiom.bsb-map-authoring.v0` document as `width`, `height`, and the matching `tiles` matrix.
- `createDefaultBsbV2AuthoringDocument()` hardcodes the initial `42×30`; no authoring resize transform or UI control exists.
- Map Forge currently scales the entire map into the canvas with a minimum cell size and has no viewport pan/zoom state, so expansion would become increasingly hard to edit.
- BSB runtime-map validation already accepts dimensions from `4..256`; terrain projection, movement bounds, and enemy steering already use `map.width` / `map.height`.
- BSB has no pathfinding/A* subsystem; its current collision-safe movement and steering grid are map-dimension-driven.
- The runtime camera follows the player but does not explicitly clamp its centre to loaded map bounds.
- Baseline source: `42×30`, revision `561`, SHA-256 `aef248154382e60b8d260948211e87ba704786c07c00c39b05c2565a81a77354`, spawn `21,26`, escape `20,2,4×5`, 68 objects, 5 units, 0 spawners.
- Terrain counts: grass 806, water 106, rock 140, dirt 122, scorched 17, forest 69.
- Both BSB and AXIOM full test suites pass before edits.

Chosen contract: growth-only centre anchoring. `42×30 -> 80×60` produces offset `+19,+15`; all old tiles, spawn/escape markers, scene objects, units, and spawners shift by the same offset. New cells use explicit default terrain. Shrinking/cropping is rejected rather than silently discarding data.

Implementation checkpoint:

- Added a pure `axiom.bsb-map-resize.v0` transform that supports bounded growth from `4..256`, centre anchors the prior map, fills new cells explicitly, shifts every coordinate-bearing authoring record, increments revision, and records preserved counts.
- Added a clamped tile-camera viewport for Map Forge with wheel/button zoom, Fit, and middle/right/Shift-drag panning. Fit shows the entire map; zoomed panning can reach every outer edge.
- Added a compact Map bounds disclosure with width/height inputs and an explicit `Expand · centre` action. Shrink/no-change requests fail visibly.
- Source and bake receipts now display dimensions; AXIOM console provenance reports authoring save dimensions, resize offsets/preserved tiles, and baked dimensions/path/hash.
- BSB load receipts and `[BSB map]` logs now include loaded width/height; `render_game_to_text()` exposes runtime dimensions and camera/map dimensions.
- Runtime camera clamping now derives world extents from the loaded map. Existing movement collision and enemy steering already use `map.width` / `map.height`; no separate pathfinding grid exists.
- AXIOM and BSB full suites pass after the implementation checkpoint, including centre-preservation, outer paint, pan-edge reachability, 80×60 runtime validation, and map-derived camera bounds.

Final implementation and proof:

- Expanded the persisted First Escape source from `42x30` to `80x60` with centre offset `+19,+15`. All 1,260 old terrain cells, 68 scene objects, 5 units, player spawn, and escape zone were preserved; newly exposed cells began as grass.
- Painted water at outer tile `76,56`, then saved source revision `564` and baked the existing manifest-owned runtime path `/data/maps/axiom-first-escape.runtime-map.json`.
- The runtime interchange now omits the redundant serialized blob-mask cache; BSB validates canonical tiles and rebuilds masks before deep-freezing the map. This resolved the first real `80x60` bake exceeding AXIOM's `2mb` JSON body limit (`2,762,317` bytes with masks versus about `84kb` without them).
- Expanded authoring JSON is 5,419 lines. Governed full project-file reads now use a bounded 100,000-line ceiling, resolving the initial 5,000-line truncation on Map Forge reload.
- Standalone BSB without `?map=` loaded `80x60`, revision `564`, hash `a4f4d6c45e2d058aa49fef4e101f1b45afa1a0a07689d00d22a4a2c8b43da2c3`, selection source `manifest_default`, and `fallbackUsed: false`.
- The standalone proof observed outer tile `76,56` as water and reported console errors `0`, page errors `0`, and request failures `0`. AXIOM had one classified, unrelated local-model probe failure at `localhost:1234/v1/models`; map save, bake, preview, and publication were unaffected.
- Full AXIOM and BSB suites pass. Browser evidence is recorded in `artifacts/map-bounds-expansion-v0/map-bounds-expansion-state.json`, with authoring, standalone, and narrow-layout screenshots beside it.

Status: passing.

Intentionally unchanged: map catalogue ownership, procedural generation, streaming/infinite-world scope, runtime dependence on AXIOM, shrinking/cropping, and the FFP map-selection UI. The latent requirement to reach and verify newly added terrain is covered by Map Forge pan/zoom plus standalone outer-cell evidence; a broader V2 map-library/menu slice remains separate.

## 2026-07-03 - Wyvern Projection Continuity + Recovery v1

Current request: fix the disembodied wyvern head/body seen after attacks by removing root-transform lag from the live body chain, applying lunge movement before projection, and giving actions/dodges an explicit visual recovery stage.

Implementation checkpoint:

- Body-chain points are now transported by the canonical root translation and shortest-angle rotation before secondary follow/sway is solved, so sudden movement or facing changes cannot leave the torso/tail in the old world-space pose.
- Action timing moved into an explicit `proceduralActionSystem`; system order is now timing -> lunge impulse -> wyvern projection -> smoke/contact consumers.
- Completed actions unlock gameplay state while retaining a short data-owned visual recovery pose. Recovery has no attack contact, emitted event, or movement authority and can be interrupted by a new action/dodge.
- Completed dodges enter a bounded visual landing/settle stage. The fading dodge pose adds no displacement and is interruptible by a new action.
- Runtime text now exposes action/dodge recovery state for browser proof.
- Added `tests/wyvernProjectionContinuity.test.mjs` to guard root transport, segment attachment, same-tick lunge projection, contact-free action recovery, and displacement-free dodge recovery.

Final validation and browser proof:

- `npm.cmd test` passes, including the new continuity/recovery regression.
- The required shared web-game client booted `http://127.0.0.1:5197/`, exercised lunge input, wrote runtime state, and produced no error file. Its canvas-only screenshot was black under the repo's known WebGL capture limitation, so it is classified as state/input evidence rather than visual proof.
- Project-local Playwright then exercised real Space, left-click combo, and Q inputs through active and recovery frames using the WebGL runtime.
- All six inspected active/recovery screenshots show one connected wyvern silhouette with the head, torso, limbs, and tail attached.
- Browser probes reported maximum root gap `0`, maximum chain stretch ratio `1.0826` under the anatomical cap `1.09`, recovery action contacts `null`, and console errors `0`, page errors `0`, request failures `0`.
- Evidence: `artifacts/wyvern-projection-continuity-v1/proof-state.json`, `lunge-active.png`, `lunge-recovery.png`, `claw-active.png`, `claw-recovery.png`, `dodge-active.png`, and `dodge-recovery.png`.

Status: passing.

Intentionally unchanged: gameplay collision authority, action damage/contact windows, cooldown values, stamina costs, enemy attack recovery, renderer anatomy, and the broader animation/state-machine architecture outside the player wyvern seam.

## 2026-07-03 - Actor Light-Silhouette Readability v0

Current request: improve player/enemy legibility in the night forest by letting local lights reveal narrow, physically directed edges and tiny existing sockets while actor materials remain dark.

Implementation checkpoint:

- Added data-owned readability profiles for the wyvern, raider, husk, and werewolf. Profiles bound major rim parts, socket roles, core occlusion, contact shadow, widths, alpha ceilings, and primitive budgets without changing actor base materials.
- Added a renderer-neutral projection pass that selects the nearest still-influential local emitter, excludes broad scene light anchors, records actor-to-emitter direction/provenance, and projects only partial emitter-facing rims, tiny catchlights, one dark core, and one small grounded contact shadow.
- Added the WebGL geometry to the existing actor depth item: contact shadow before the body; preserved dark base silhouette; then dark core, partial rim arcs/edge strips, and catchlights. This adds no actor draw call and does not create a screen-space or full-body outline pass.
- Reused existing torch flame, spear tip, and wyvern mouth sockets where available; derived eye points remain small profile-owned catchlights.
- Added renderer diagnostics and focused regressions for light selection, directional rim flipping, scene-light exclusion, socket reuse, dark-core/contact geometry, profile ownership, and the no-extra-draw-call budget.

Final validation and browser proof:

- `node tests/actorLightReadability.test.mjs` passes.
- `node tests/locBudget.test.mjs` passes.
- `npm.cmd test` passes.
- Project-local Playwright staged the wyvern, raider, husk, and werewolf around a real carried-torch emitter in the published night forest. All four resolved the torch as their nearest relevant emitter and the left/right source probes flipped the wyvern direction from negative to positive X.
- WebGL diagnostics reported 4 influenced actors, 78 bounded rim primitives, 42 catchlight primitives, 32 contact-shadow primitives, and 14 core-occlusion primitives, with zero texture uploads and no Canvas fallback.
- The disabled/enabled capture comparison changed 915 pixels (0.099% of the frame): 575 brighter edge/catchlight pixels and 340 darker core/contact pixels. Base actor material/visual packets remained unchanged.
- Browser proof reported console errors `0`, page errors `0`, and request failures `0`. The only console messages were the expected screenshot `ReadPixels` driver warnings.
- The required shared web-game client exercised real movement input and independently reported the readability pass active in the WebGL world-depth layer. Its canvas-only screenshot was black under the repo's known WebGL capture limitation, so it is state/input evidence; the inspected project-local full-page captures are the visual evidence.
- Evidence: `artifacts/actor-light-silhouette-readability-v0/proof-state.json`, `readability-disabled.png`, `readability-enabled.png`, `disabled-enabled-comparison.png`, `emitter-left.png`, and `emitter-right.png`.

Status: passing.

Intentionally unchanged: actor fill/material colours, global lighting/post-processing, artificial outline effects, gameplay visibility/targeting logic, and light simulation authority.

## 2026-07-03 - Documentation Scope Reset and First-Playable Lock

Current request: update documentation because project docs had fallen behind the live BSB V2 state, especially after rapid WebGL, map publication, wyvern continuity, stamina/dodge, enemy, and visual-readability work.

Findings:

- Entry docs still pointed fresh sessions at the 2026-06-15 handover even though the active project state has moved on significantly.
- Several docs still described the runtime as Canvas/simple canvas even though WebGL is now the only supported runtime renderer.
- Controls were inconsistent across docs after sprint/dodge/lunge/smoke changes.
- The active next-step plan had become obscured by renderer history and old foundation slices.
- The project needed an explicit scope line: no 2.5D fake-height renderer, no spritesheet/art factory, no AXIOM/editor expansion, and no more tiny rendering passes before game-loop/UX work.

Documentation changes:

- Rewrote `README.md` as a compact current entry point instead of a long renderer-history list.
- Updated `docs/START_HERE.md` to point at the current 2026-07-03 handover and game-loop priority.
- Rewrote `docs/NEXT_SLICES.md` around the next production phase: title/start, pause/restart, death/retry, win/completion, objective/controls, scenario tuning, then one bounded atmosphere/readability pass.
- Updated `docs/TECH_BOUNDARIES.md` to reflect WebGL-only runtime, asset-light visual scope, runtime-map boundary, and parked 2.5D/art-tool scope.
- Updated `docs/FIRST_PLAYABLE_SPEC.md` with current controls, WebGL runtime, map-manifest load, stamina/dodge, retry, menu, pause, and objective requirements.
- Updated `docs/ARCHITECTURE.md` to describe the current ECS -> projection -> WebGL path and key data owners.
- Updated `docs/TESTING_AND_QA.md` with current controls, proof expectations, and visual QA caveat.
- Cleaned `GCD.md` Markdown escaping so it renders as a normal document.
- Added `docs/HANDOVER_2026-07-03.md`, `docs/VISUAL_SCOPE_AND_ART_DIRECTION.md`, `docs/PLAYABLE_LOOP_AND_UX_LOCK.md`, and `docs/DOCS_AUDIT_2026-07-03.md`.

Decision captured:

> 2.5D fake-height/depth work is a later-game or post-release technology, not part of this first-game first-playable lock.

Next action:

Start next week with game-loop UX: menu/start, pause, death/retry, win/completion, objective/controls, and scenario tuning. Atmosphere/readability can follow only after the loop behaves like a game.

Status: documentation-only update. No runtime code changed.

## 2026-07-07 - Scale Audit: Fire-Arrow Emitters v0

Current request: audit the shared scene scale contract against the visible scene, identify which props follow it, and fix props that do not, with before/after visual evidence. Specific example: flaming arrows were reading as oversized barrier props and their flame/smoke needed to stay synchronized with the fire source.

Findings:

- The active universal scale owner is `src/data/worldScale.js`: `hatchling_half_meter_tiles_v0`, with one tile reading as roughly half a metre and a two-metre hatchling reading as about four tiles nose-to-tail.
- Trees, birches, boulders, fern/shrub undergrowth, leaf/root decals, smouldering fern/bramble, humanoids, and the wyvern already carry the active scale profile or use data-owned proportion profiles.
- Fire-arrow clusters carried the active `scaleProfileId`, but failed the practical scale read: `2.2x1.8` visual tiles, `0.42m` physical height, a `3.97` tile light radius, and smoke/particle output that visually sat under a barrier-sized arrow group.

Implementation:

- Added `WORLD_SCALE.sceneObjectTargets.fireArrowEmitter` so fire-arrow single/cluster sizing is owned by the same scale table as trees and boulders.
- Reduced fire-arrow single/cluster physical and visual footprints to small embedded emitter sockets.
- Reduced raid-flame light radius/intensity, spark count/drift/spread, and smoke radius/drift so particles and smoke read as small flame-source wisps.
- Adjusted WebGL fire-arrow shaft/flame geometry to use data-owned length/width scales instead of stretching across the old footprint.
- Added tests for fire-arrow scale limits, local light radius/intensity limits, smoke-core synchronization at the flame socket, spark socket proximity, and bounded WebGL cluster geometry.

Evidence:

- Before screenshot: `artifacts/scale-audit-fire-emitters-v0/before-fire-arrow-scale.png`
- After screenshot: `artifacts/scale-audit-fire-emitters-v0/after-fire-arrow-scale.png`
- Runtime state: `before-state.json`, `after-state.json`
- Before to after metrics for the first published cluster: visual `2.2x1.8 -> 0.96x0.72` tiles, physical height `0.42m -> 0.2m`, average raid-flame light radius `3.97 -> 1.89`, average raid-flame smoke radius `0.49 -> 0.16`.

Validation:

```powershell
node tests/sceneObjectsFoundation.test.mjs
node tests/sceneObjectEmitters.test.mjs
npm.cmd test
node -e "import('./src/app.js')"
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url http://127.0.0.1:5198/ --actions-file C:/Users/felix/.codex/skills/develop-web-game/references/action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts/scale-audit-fire-emitters-v0/web-game-client
```

Status: passing.

Note: the shared `.codex` web-game client still fails when run directly from `.codex` because it cannot resolve `playwright` from that directory. The established project-local copy workaround passed and produced runtime state. Its canvas screenshot is black under the known WebGL capture limitation; the inspected full-page before/after captures are the visual proof lane.

## 2026-07-07 - Audio Director First Pass v0

Current request: handle sound as game-state feedback first, with a small Audio Director, data-driven cue manifest, buses, placeholder sounds, breath/stamina/health pressure, hit muffling, smoke exhale, claw/lunge cues, ambient forest loop, and one enemy proximity warning path.

Implementation:

- Added `src/audio/audioDirector.js` as the canonical audio owner. Gameplay emits/produces state; the director translates ECS events and player/enemy state into audio cues, applies cooldown/max-voice suppression, updates loops, and exposes a debug snapshot.
- Added `src/audio/audioBus.js`, `src/audio/soundManifest.js`, and `src/audio/soundEvents.js`.
- Added `src/data/audio/audioTuning.js` for bus gains, body-pressure mapping, muffling, heartbeat, breath, and proximity thresholds.
- Wired `createApp` to create/update the audio director once per tick and unlock Web Audio from canvas/key input.
- Extracted the large browser `render_game_to_text()` serializer into `src/debug/runtimeText.js`, keeping `src/app.js` under the 500-LoC production budget while exposing the new `audio` debug state.
- The first pass uses synthesized Web Audio placeholders. Manifest file IDs are already stable for later `.ogg` replacement.
- Repaired the generated published runtime map after the browser-proof window rewrote direct actor placements to generic `"enemy"` teams. Direct raider/husk/werewolf placements are back on their type-owned factions so the published-map contract and faction tests pass.

Truth flow:

`ECS events/body-state projection/enemy state -> Audio Director -> data cue manifest -> bus graph -> Web Audio placeholder voice`

Validation:

```powershell
node tests/audioDirector.test.mjs
node -e "import('./src/app.js')"
npm.cmd test
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url http://127.0.0.1:5177/ --actions-file C:/Users/felix/.codex/skills/develop-web-game/references/action_payloads.json --iterations 2 --pause-ms 250 --screenshot-dir artifacts/audio-director-v0/web-game-client
node --input-type=module -e "<project-local Playwright proof captured artifacts/audio-director-v0/audio-director-runtime.png and audio-director-proof-state.json>"
```

Status: passing.

Browser evidence:

- Shared web-game client state files recorded `black-sky-bound.audio-director.v0`, Web Audio available/unlocked, active ambience/breath/heartbeat loops, and `player.lunge.body` cues from Space input.
- The shared client canvas screenshots are black under the known WebGL capture limitation.
- Project-local full-page Playwright proof rendered the WebGL scene on runtime-map revision `2265` and recorded console errors `0`, page errors `0`, request failures `0`, audio unlocked `true`, loops active, and a combat cue in `audio-director-proof-state.json`.

Follow-up:

- Replace synthesized placeholders with real short `.ogg` assets while preserving cue IDs.
- Add richer off-screen spatial panning after camera/off-screen classification is needed.
- Add explicit smoke/stamina browser scenarios once the gameplay loop UX pass provides a repeatable encounter harness.

## 2026-07-07 - Runtime Faction Conflict Restoration v0

Current request: raiders and husks have relationship/profile logic saying they should be hostile, but in the BSB V2 runtime they were not fighting when they intersected.

Root cause:

- The faction relationship table and targeting systems were already correct: `raiders` and `husks` are hostile, and direct-spawn tests already proved a raider can target and damage a husk.
- The published AXIOM-authored runtime map had every direct unit authored as the legacy generic `enemy` team.
- BSB still treats generic `enemy` as a compatibility faction that is friendly with raiders, husks, and wolves, so all published encounter units spawned on one friendly side.
- AXIOM Map Forge was also creating new units and spawners as `team: "enemy"`, so future bakes would have reintroduced the issue.

Implementation:

- AXIOM Map Forge now defaults authored raiders to `raiders`, husks to `husks`, and werewolves to `wolves`.
- AXIOM validation migrates old generic `enemy` unit/spawner records to their actor default teams.
- The persisted AXIOM source and BSB baked runtime map were migrated to revision `2239`.
- The stale baked `enemySpawns` compatibility mirror was emptied so `unitPlacements` remains the runtime source for authored direct units.
- BSB runtime bootstrap tests now assert the published map preserves raider/husk factions and that a raider can acquire a non-player husk target from the manifest-loaded map.

Validation:

```powershell
node tests/bsb-v2-map-authoring.test.mjs # AXIOM/apps/launcher
node tests/runtimeMapBootstrap.test.mjs # _A_Projects/BLACK_SKY_BOUND_V2
node tests/enemyPressureTargeting.test.mjs # _A_Projects/BLACK_SKY_BOUND_V2
node tests/factionRelationships.test.mjs # _A_Projects/BLACK_SKY_BOUND_V2
npm.cmd test # AXIOM/apps/launcher
npm.cmd test # _A_Projects/BLACK_SKY_BOUND_V2
```

Direct before/after runtime probe:

- Before: published map unit team counts were `enemy: 16`; sampled raiders returned `nearestHostile: null`.
- After: published map unit team counts are `raiders: 9`, `husks: 5`, `wolves: 2`; sampled raiders select husks and sampled husks select raiders.

Browser proof:

- Served BSB at `http://127.0.0.1:5207/`.
- Shared `.codex` web-game client is still blocked by missing `playwright` resolution from `.codex`.
- Project-local web-game client passed and wrote `artifacts/faction-conflict-v0/web-game-client/state-0.json`; its canvas-only screenshot is black under the known capture caveat.
- Project-local full-page Playwright proof passed with console errors `0`, page errors `0`, request failures `0`.
- Proof JSON: `artifacts/faction-conflict-v0/runtime-proof.json`
- Full-page screenshot: `artifacts/faction-conflict-v0/runtime-full.png`
- Runtime proof counts: player `1`, raiders `9`, husks `8` after spawner activity, wolves `2`, raider-to-husk targets `4`, husk-to-raider targets `5`, total active faction conflicts `13`.

Status: passing.

## 2026-07-07 - Health Pressure + Stamina Breath UI v0

Current request: replace permanent stock health/stamina bars with subtle body-state screen feedback, add recover-after-safe-delay health pressure, keep debug values development-only, and avoid combat/control/renderer redesign.

Implementation:

- Added `src/data/bodyStateFeedback.js` as the tuning owner for the young dragon body-state profile: max health, max pressure, regen delay/rate, hit-pulse duration, critical threshold, stamina breath thresholds, post-process strengths, and debug query names.
- Player health now carries pressure state, no-hit recovery delay, hit-pulse timer, recovery flag, and regen totals. Regen is player-only; enemies do not inherit it.
- `healthSystem` now decrements hit/recovery timers and only regenerates the player after the no-hit delay. Damage through `applyDamageToEntity` resets recovery and starts the hit pulse.
- Added renderer-neutral `bodyState` projection consumed by the existing WebGL post-process composite. The effect adds dark/red injury edge pressure, brief hit pulse, critical desaturation/contrast, and cool stamina/breath edge pressure in the existing single fullscreen pass.
- The old WebGL HUD HP/ST bars and raw numbers are hidden in normal gameplay. `?debugHud=1` re-enables the development diagnostics panel with raw HP/ST values.
- `?bodyState=0` disables the body-state post-process signal for debugging.

Validation:

```powershell
node tests\bodyStateFeedback.test.mjs
npm.cmd test
node -e "import('./src/app.js')"
node tests\locBudget.test.mjs
node C:\Users\felix\.codex\skills\develop-web-game\scripts\web_game_playwright_client.js --url http://127.0.0.1:5199/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\body-state-feedback-v0\web-game-client
node artifacts\scale-audit-fire-emitters-v0\web_game_playwright_client.mjs --url http://127.0.0.1:5199/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\body-state-feedback-v0\web-game-client
node artifacts\body-state-feedback-v0\proof.mjs http://127.0.0.1:5199/
```

Status: passing.

Browser proof:

- Normal HUD layer inactive with no permanent HP/stamina bars.
- Damage pressure raised from `0` to `0.75`; hit pulse captured at `0.954`.
- Health stayed at `25` before the no-hit delay elapsed, then recovered to `27.375`.
- Stamina exhaustion raised stamina pressure to `0.956` with breath pulse `0.183`.
- `?debugHud=1` activated the raw values panel; normal gameplay kept it hidden.
- Console errors, page errors, and request failures were all `0`.
- Evidence: `artifacts/body-state-feedback-v0/baseline-no-bars.png`, `damage-pressure.png`, `recovery-pressure-fading.png`, `stamina-breath-pressure.png`, `debug-hud-values.png`, and `body-state-feedback-state.json`.

Known validation note: the shared `.codex` web-game client still fails from `.codex` because it cannot resolve `playwright`; the established project-local client and directed Playwright proof passed. Its canvas-only screenshot remains black under the known WebGL capture limitation, so full-page project-local screenshots are the visual proof lane.

Next suggestions:

- If later playtests find the pressure too strong at 25% HP, tune only `bodyStateFeedback.js`; no code change should be needed.
- Consider a future objective/control micro-HUD pass separately; this slice intentionally removed only stock health/stamina dependence from normal gameplay.

## 2026-07-08 - Player Death Respawn Restoration v0

Current request: restore player death/respawn after recent fadeout, health, stamina, pressure, and overlay changes.

Root cause:

- Player death was flowing through the generic corpse death lifecycle, which strips live components from dead entities and has no player restoration path.
- `scenarioSystem` also marked the game `lost` as soon as player health reached zero. Because `updateActionSystems` only runs while status is `playing`, the death lifecycle advanced one frame and then stalled forever.

Implementation:

- Added a canonical `PlayerLifecycle` component and profile-owned state sequence: `alive -> dying -> deathFade -> respawnPending -> waking -> alive`.
- Kept enemy deaths on the existing corpse aftermath path, but routed player death through the player lifecycle without removing player control/movement/stamina/action components.
- Added a canonical respawn function that chooses the map spawn safe point, resets transform, intent, action/dodge/impact state, cooldowns, health pressure, and stamina.
- Updated scenario failure handling so active player death/respawn lifecycle keeps the game loop alive instead of freezing in `lost`.
- Gated player input/combat and enemy target/attack validity through the same lifecycle interactivity check.
- Added a separate lifecycle darkness screen mask in the post-process layer. Health/stamina pressure remains body-state post-process; death/wake opacity is owned by player lifecycle.
- Added deterministic wake flicker pulses from a stored sequence, not fresh random per frame.
- Exposed lifecycle state and overlay opacity through runtime text/render stats for proof.

Validation:

```powershell
node tests\deathLifecycle.test.mjs
node tests\bodyStateFeedback.test.mjs
npm.cmd test
node -e "import('./src/app.js')"
```

Browser proof:

- Served `http://127.0.0.1:5215/` with `BSB_NO_OPEN=1`.
- Shared `.codex` web-game client still failed from `.codex` because it cannot resolve `playwright`.
- Project-local Playwright proof passed: `node artifacts\player-respawn-v0\proof.mjs http://127.0.0.1:5215/`.
- Proof state: `artifacts/player-respawn-v0/proof-state.json`.
- Screenshots: `death-fade.png`, `wake-start.png`, `wake-control-return.png`, `awake-cleared.png`.
- Recorded checks: death fade happened, respawn happened, health/stamina reset, wake overlay started at opacity `0.9396`, controls returned after the configured wake point, player moved only after control return, overlay cleared to `0`, and console/page/request errors were `0`.

Status: passing.

## 2026-07-08 - Enemy Stuck Recovery + SceneObject Collision Check v0

Current request: stop raiders visibly vibrating when pursuit movement fails in a navigable-looking tree/rock gap, without importing heavy pathfinding or ghosting through obstacles. Also check whether scene-object collision boundaries, especially tree bases and root details, are too obstructive.

Root cause:

- Enemy pursuit already had fixed-angle steering and axis slide, but once a pursuit vector repeatedly failed it could keep recomputing the same blocked engagement vector every frame.
- The stuck detector treated small lateral movement as meaningful progress even when distance to target did not improve, which allowed a sidestep to be immediately undone by normal pursuit.
- Scene-object data confirmed trees and boulders are intentional coarse 2x2 blockers; root/leaf ground decals and undergrowth remain nonblocking. The over-obstructive feel comes from hard square blocker boundaries plus per-frame pursuit retry, not hidden root colliders.

Implementation:

- Added bounded stuck state to `EnemyPressureAI`: previous position, attempted target, target-distance progress timer, failed move count, held unstick direction/mode/cooldown, short repath pause, retreat target/timer, recovery/retreat counters, and last progress delta.
- Enemy pursuit now detects failed or non-progressing movement, tries a small fixed local candidate set around the desired direction, and holds the chosen direction briefly to avoid frame-to-frame jitter.
- Candidate recovery remains collision-safe because it still routes through `moveEntityWithSteering(...)` and `canEntityOccupy(...)`.
- If local pursuit remains stuck too long, the enemy drops target briefly and starts a short retreat/reacquire pause instead of teleporting or hammering the target vector.
- Runtime text now exposes quiet recovery counters and current unstick state; no noisy logs are enabled by default.
- Added regression coverage for a tree/boulder pinch with a nonblocking root decal, plus scene-object collision metadata assertions.

Validation:

```powershell
node tests\enemyMovementSpacing.test.mjs
node tests\sceneObjectsFoundation.test.mjs
node tests\enemyBehaviourStates.test.mjs
node tests\performanceAndPause.test.mjs
node -e "import('./src/app.js')"
```

Status: passing.

Full suite note:

```powershell
npm.cmd test
```

Reached the pre-existing LoC budget gate and failed on `src\projection\renderProjection.js: 508`; that file was not touched in this slice.

Browser proof:

- Served locally at `http://127.0.0.1:5223/`.
- Shared `.codex` web-game client is still blocked by missing `playwright` package resolution from `.codex`.
- Project-local web-game client passed and wrote `artifacts/stuck-recovery-v0/web-game-client/state-0.json`; the canvas-only screenshot is black under the known WebGL capture caveat.
- Directed project-local Playwright staged a mutable proof map with a tree, boulder, and visual-only root decal. The raider started unblocked at `(12.35, 10.5)`, recovered to `(10.448, 8.511)`, moved `2.752` tiles net / `2.953` total path, recorded `8` stuck-recovery events, had `0` blocked samples, and produced `0` console errors, `0` page errors, and `0` request failures.
- Evidence: `artifacts/stuck-recovery-v0/stuck-recovery-proof.json` and `artifacts/stuck-recovery-v0/stuck-recovery-proof-full.png`.

Follow-up:

- If playtests still find tree bases too visually misleading, tune the scene-object collision policy deliberately as an art/physics readability slice. Do not silently shrink blockers inside AI movement.

## 2026-07-08 - Sceneobject Visibility Stability v0

Current request: make sceneobjects stop popping/flickering aggressively at the edge of light influence without brightening the whole scene, adding outlines, increasing shadow/light work, or touching actor/player rendering.

Root cause:

- WebGL sceneobjects used the live light-space render gate alpha directly.
- Anything at or below `0.015` was culled outright, so tiny motion near the light-space feather edge could flip an object from full detail to absent in one frame.

Implementation:

- Added a sceneobject-only visibility policy in `RENDER_BUDGETS.sceneObjectVisibility`.
- Added `WebGLSceneObjectVisibility` as the narrow owner for sceneobject presence/detail hysteresis, hold, fade, and cheap dark silhouette geometry.
- Kept visibility state in the WebGL renderer context as a per-object `Map`, keyed by stable object id.
- Split sceneobject rendering into:
  - presence visibility: low-alpha, low-detail dark silhouette primitives;
  - lit detail visibility: existing full sceneobject geometry only above a stronger threshold.
- Added enter/exit hysteresis for both presence and lit detail.
- Added a short hold plus fade after influence drops below the presence exit threshold.
- Kept the path sceneobject-only. Actors, player, terrain, decals, effects, smoke, shadows, global exposure, post-process, and Canvas renderer paths were not changed.

Validation:

```powershell
node tests\sceneObjectVisibilityStability.test.mjs
node tests\locBudget.test.mjs
node -e "import('./src/app.js')"
npm.cmd test
node artifacts\sceneobject-visibility-stability-v0\proof.mjs http://127.0.0.1:5211/
node C:\Users\felix\.codex\skills\develop-web-game\scripts\web_game_playwright_client.js --url http://127.0.0.1:5211/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\sceneobject-visibility-stability-v0\web-game-client
node artifacts\scale-audit-fire-emitters-v0\web_game_playwright_client.mjs --url http://127.0.0.1:5211/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\sceneobject-visibility-stability-v0\web-game-client
```

Status:

- Focused and full tests passed.
- Directed Playwright proof passed with console errors `0`, page errors `0`, and request failures `0`.
- Proof staged `boulder:start-route` at a light boundary: weak frame reported `sceneObjectPresenceVisibleCount: 1`, `sceneObjectLitDetailVisibleCount: 0`, and only `3` scenery primitives; after light removal it reported hold, then fade.
- Full-page visual evidence stayed dark and nonblank: `artifacts/sceneobject-visibility-stability-v0/baseline-runtime.png` and `staged-boundary-presence.png`.
- Shared `.codex` web-game client remains blocked by missing `playwright` resolution from `.codex`; the established project-local copy passed and wrote runtime state. Its canvas-only screenshot is black under the known WebGL capture limitation.

## 2026-07-08 - Combat Balance First Pass v0

Current request: make the player wyvern feel less tanky and harder to casually sprint out of danger while preserving readable raider/husk faction fights. Avoid broad enemy damage buffs; prefer player survivability/recovery tuning, temporary hit slow, enemy-vs-enemy scaling, husk swarm pressure, and raider blocking/guard behaviour.

Implementation:

- Kept player survivability owned by `src/data/bodyStateFeedback.js`.
- Reduced player max health from `100` to `80`.
- Increased player regen delay from `2200ms` to `3600ms`.
- Reduced regen rate from `7.5/s` to `6.5/s`.
- Added player regen ramp: `2800ms`, starting at `0.28x` and reaching `1.0x` only after sustained safety.
- Added player regen activity penalties: `0.42x` while sprinting and `0.62x` while attacking.
- Added `src/data/combatBalance.js` as the cross-cutting owner for first-pass combat balance:
  - player hit slow: `0.46s` at `0.68x` movement;
  - enemy-vs-enemy damage multiplier: `0.68x`, minimum damage `1`.
- Wired hit slow through `StatusEffects` and `movementSystem`, so it slows movement briefly without stun-locking, disabling sprint outright, or touching dodge authority.
- Kept enemy attack profile damage values unchanged against the player.
- Scaled enemy-origin damage only when both source and target are non-player combat factions, preserving player vulnerability while slowing raider/husk deletion.
- Tuned husks for swarm pressure rather than damage:
  - speed `1.95 -> 2.08`;
  - aggro range `9 -> 10.5`;
  - roam radius `4 -> 4.5`;
  - decision interval `0.9 -> 0.72`;
  - attack cooldown `1.3 -> 1.45`;
  - attack range `0.78 -> 0.76`;
  - maul windup/recovery shortened `0.42/0.48 -> 0.34/0.36`;
  - damage remains `6`.
- Added raider guard/hold tuning:
  - enabled guard band at `1.75` tiles;
  - hold `0.42s`;
  - cooldown `1.4s`;
  - guards face the target and briefly hold ground instead of perfectly chasing.
- Runtime text now exposes actor movement slow and raider guard counters.

Validation:

```powershell
node tests\combatBalanceTuning.test.mjs
node tests\enemyAttackProfiles.test.mjs
node tests\bodyStateFeedback.test.mjs
node tests\enemyMovementSpacing.test.mjs
node -e "import('./src/app.js')"
npm.cmd test
node C:\Users\felix\.codex\skills\develop-web-game\scripts\web_game_playwright_client.js --url http://127.0.0.1:5177/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\combat-balance-v0\web-game-client
node artifacts\scale-audit-fire-emitters-v0\web_game_playwright_client.mjs --url http://127.0.0.1:5177/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\combat-balance-v0\web-game-client
node artifacts\combat-balance-v0\proof.mjs http://127.0.0.1:5177/
```

Status:

- Focused tests passed.
- Full `npm.cmd test` passed.
- Module load passed.
- Shared `.codex` web-game client remains blocked by missing `playwright` resolution from `.codex`.
- Project-local web-game client passed and wrote `artifacts/combat-balance-v0/web-game-client/state-0.json`; its canvas screenshot is black under the known WebGL capture limitation.
- Directed Playwright proof passed with console errors `0`, page errors `0`, and request failures `0`.
- Runtime proof showed player max HP `80`, raider hit damage `9`, player hit slow `0.46s` at `0.68x`, slowed movement `0.833` tiles vs cleared movement `1.225` tiles over the same step, regen delay `3600ms`, and regen ramp multiplier rising from `0.383` to `1`.
- Raider/husk conflicts remained visible after five seconds: conflict count `10 -> 8`, live raiders `9`, live husks `4`, damaged husks `3`, damaged raiders `4`, raider guard holds `1 -> 12`.
- Evidence: `artifacts/combat-balance-v0/combat-balance-proof-state.json`, `encounter-baseline.png`, `encounter-after-5s.png`, `encounter-focused.png`, and `player-pressure-after-hit.png`.

Follow-up:

- If playtests still feel too easy, tune the body-state profile first: health, regen delay, ramp duration/start, or hit slow duration. Avoid enemy global damage until player recovery and positioning pressure are exhausted.
- If faction fights last too long, tune only `COMBAT_BALANCE.enemyVsEnemyDamage.multiplier` before touching profile damage.
- A later slice could add richer raider group blocking or formation behaviour, but this pass deliberately keeps guard behaviour simple and bounded.

## 2026-07-08 - Atmospheric Camera Overlay v0

Current request: add a cheap screen-space atmospheric overlay with windstrewn rain from the top/north camera side and sparse warm sparks from the lower/south side. Keep it visual-only: no weather simulation, no world-space rain particles, no fire spread, no lighting/shadow interaction, and no combat readability loss.

Root cause / intent:

- Existing atmosphere mostly came from world/source-bound smoke, scatter, torches, napalm, and lighting.
- The scene needed a stronger global weather/fire mood without adding expensive or gameplay-bearing world simulation.
- A camera-space render pass is the correct owner because the effect should follow the view, stay independent from sceneobject lighting, and be disabled instantly if needed.

Implementation:

- Added `src/data/atmosphericOverlay.js` as the tuning owner for `rainEnabled`, `rainDensity`, `rainSpeed`, `rainAngle`, `sparkEnabled`, `sparkRate`, `sparkDrift`, and `overlayOpacity`.
- Added `src/projection/atmosphericOverlayProjection.js` so render projection carries a renderer-neutral `camera_space_atmospheric_overlay_v0` packet.
- Added `WebGLAtmosphericOverlayLayer` after post-process and before HUD/debug.
- Rain uses pooled screen-space tapered triangles with deterministic seeded variation, moving diagonally from the top side.
- Sparks use a small pooled deterministic cycle with rare active windows, warm glow radials, and short upward streaks from the lower screen edge.
- `?atmosphere=0` disables the whole pass; `?rain=0` and `?sparks=0` disable channels independently.

Default tuning:

- `rainEnabled: true`
- `rainDensity: 0.58`
- `rainSpeed: 1180`
- `rainAngle: 16`
- `sparkEnabled: true`
- `sparkRate: 1.35`
- `sparkDrift: { x: -34, y: -118 }`
- `overlayOpacity: 0.62`

Validation:

```powershell
node tests\atmosphericCameraOverlay.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\postProcessPipeline.test.mjs
node tests\locBudget.test.mjs
node -e "import('./src/app.js')"
npm.cmd test
node C:\Users\felix\.codex\skills\develop-web-game\scripts\web_game_playwright_client.js --url http://127.0.0.1:5177/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\atmospheric-camera-overlay-v0\web-game-client-shared
node artifacts\scale-audit-fire-emitters-v0\web_game_playwright_client.mjs --url http://127.0.0.1:5177/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\atmospheric-camera-overlay-v0\web-game-client
node artifacts\atmospheric-camera-overlay-v0\proof.mjs http://127.0.0.1:5177/
git diff --check -- <scoped atmospheric overlay files>
```

Status:

- Focused tests passed.
- Full `npm.cmd test` passed.
- Module import passed.
- LoC budget passed.
- Scoped diff whitespace check passed.
- Shared `.codex` web-game client is still blocked by missing `playwright` resolution from `.codex`.
- Project-local web-game client passed and wrote `artifacts/atmospheric-camera-overlay-v0/web-game-client/state-0.json`.
- Directed Playwright proof passed with app console errors `0`, page errors `0`, request failures `0`.

Browser proof:

- Served/reused confirmed BSB runtime at `http://127.0.0.1:5177/`.
- Layer order: `terrain -> decals -> shadows -> worldDepth -> lighting -> effects -> fogSmoke -> postProcess -> atmosphere -> hudDebug`.
- Enabled capture: `43` rain streaks, `2` sparks, `47` primitives, atmosphere render time `0ms`, total renderer time `1.3ms`.
- Disabled capture with `?atmosphere=0`: atmosphere `inactive`, `0` primitives.
- Debug HUD capture with `?debugHud=1`: HUD remained active and legible above the overlay.
- Expected WebGL ReadPixels warnings were recorded during screenshot capture; no app/browser errors were recorded.
- Evidence: `artifacts/atmospheric-camera-overlay-v0/atmosphere-enabled.png`, `atmosphere-disabled.png`, `atmosphere-debug-hud.png`, and `atmosphere-proof-state.json`.

Follow-up:

- If playtests find the rain too hard to see on some displays, tune only `rainDensity`, `rainSpeed`, or `overlayOpacity` in `src/data/atmosphericOverlay.js`.
- If sparks feel too present, reduce `sparkRate` before touching renderer code.

## 2026-07-08 - Emitter-Reactive Atmospheric Overlay Lighting v0

Current request: let the screen-space atmospheric overlay react subtly to real warm in-game emitters without converting rain into world-space particles or adding real particle lighting.

Implementation:

- Added a capped renderer-neutral screen-space emitter projection helper fed by existing `game.lights` / `lightProjection` data.
- Warm emitter projection filters out broad cold scene lights such as moonlight/lightning, keeps torches/flames/napalm/smoulder-like sources, projects visible emitters through the camera, and caps the overlay list at `12`.
- Added emitter-reactive tuning: `emitterReactiveOverlayEnabled`, `maxAtmosphereEmitters`, `rainLightCatchStrength`, `rainWarmTintStrength`, `sparkLightCatchStrength`, and `emitterInfluenceFalloff`.
- Added `?atmosphereEmitters=0` as an instant debug kill switch for the emitter reaction while leaving base rain/sparks active.
- Rain and sparks now sample only the capped screen-space list, use max influence rather than additive stacking, and keep highlights soft/local.
- Removed per-streak color-array allocation from the overlay hot path while preserving pooled particle/primitive reuse.

Validation:

```powershell
node tests\atmosphericCameraOverlay.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\postProcessPipeline.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js')"
node artifacts\emitter-reactive-atmospheric-overlay-v0\proof.mjs http://127.0.0.1:5177/
node artifacts\atmospheric-camera-overlay-v0\proof.mjs http://127.0.0.1:5177/
node C:\Users\felix\.codex\skills\develop-web-game\scripts\web_game_playwright_client.js --url http://127.0.0.1:5177/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\emitter-reactive-atmospheric-overlay-v0\web-game-client-shared
node artifacts\scale-audit-fire-emitters-v0\web_game_playwright_client.mjs --url http://127.0.0.1:5177/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\emitter-reactive-atmospheric-overlay-v0\web-game-client
git diff --check -- <scoped emitter-reactive atmospheric overlay files>
```

Status:

- Focused tests, full suite, module import, LoC budget, and scoped whitespace checks passed.
- Directed Playwright proof passed with app console errors `0`, page errors `0`, request failures `0`, and nonblank canvas probes.
- Original atmosphere proof was rerun after the change; HUD/debug still renders above the overlay and `?atmosphere=0` still disables the pass.
- Near selected torch: `3` projected atmosphere emitters, `6` reactive rain hits, max emitter influence `0.426`, atmosphere render time `0ms`.
- Away from warm emitters: `0` projected emitters, `0` reactive rain hits, cold/dark overlay remained active.
- Multi-emitter framing: `10` projected emitters under the cap of `12`, max influence stayed below `1` so emitters did not stack into orange fog.
- `?atmosphereEmitters=0` left base rain/sparks active but dropped emitter count and hit count to `0`.
- Shared `.codex` web-game client remains blocked by missing `playwright` resolution from `.codex`; project-local web-game client passed. Its canvas-only screenshot remains black under the known WebGL capture limitation.

Evidence:

- `artifacts/emitter-reactive-atmospheric-overlay-v0/near-emitter.png`
- `artifacts/emitter-reactive-atmospheric-overlay-v0/away-from-emitter.png`
- `artifacts/emitter-reactive-atmospheric-overlay-v0/multi-emitter.png`
- `artifacts/emitter-reactive-atmospheric-overlay-v0/emitter-toggle-off.png`
- `artifacts/emitter-reactive-atmospheric-overlay-v0/emitter-reactive-proof-state.json`

## 2026-07-08 - Atmospheric Post-Processing Polish v0

Current request: add a cheap final screen-space world composite pass for a darker, colder, wetter forest mood while preserving warm emitters, HUD readability, gameplay overlays, and FPS stability.

Root cause / intent:

- The existing WebGL post-process foundation was only a mild vignette/body-state shader and also carried lifecycle fade drawing.
- The world needed a single cohesive mood pass, but death/wake overlays and HUD needed to remain separate so post-processing does not own gameplay mask opacity or UI clarity.
- Visual validation also showed the camera rain/sparks existed numerically but were too faint in screenshots/playtest, so this slice includes a restrained visibility retune of the camera atmosphere overlay.

Implementation:

- Added `src/data/postProcessPolish.js` as the tuning owner for the polish profile and `?post=0` kill switch.
- Expanded `WebGLPostProcessPipeline` into `atmospheric_post_process_polish_v0`: cool shadow grade, warm emitter preservation, subtle vignette, controlled grain, and a capped warm-luma glow proxy in the existing single composite pass.
- Kept body-state pressure feedback in post, but moved player lifecycle darkness into new `WebGLGameplayOverlayLayer`.
- Updated WebGL order to `terrain -> decals -> shadows -> worldDepth -> lighting -> effects -> fogSmoke -> postProcess -> atmosphere -> gameplayOverlay -> hudDebug`.
- Updated render budget diagnostics to name the no-blur glow proxy and disabled smoothing/bloom chain.
- Retuned camera atmosphere visibility after playtest feedback: rain is now visibly thin/diagonal, and sparse embers are readable without becoming orange noise.

Default tuning:

- `postEnabled: true`
- `gradeStrength: 0.34`
- `shadowCoolStrength: 0.3`
- `fireWarmStrength: 0.22`
- `vignetteStrength: 0.2`
- `vignetteRadius: 0.72`
- `grainStrength: 0.014`
- `glowProxyStrength: 0.1`
- `lowHealthPostStrength: 0.18`
- camera atmosphere visibility correction: `rainDensity: 0.72`, `sparkRate: 1.85`, `overlayOpacity: 0.74`

Disabled expensive features:

- No multi-pass bloom.
- No full-screen blur chain.
- No chromatic aberration.
- No world-space rain/fire/weather simulation.
- No shadow/light interaction rewrite.

Validation:

```powershell
node tests\atmosphericCameraOverlay.test.mjs
node tests\postProcessPipeline.test.mjs
node tests\webglRendererHierarchy.test.mjs
node tests\bodyStateFeedback.test.mjs
node tests\deathLifecycle.test.mjs
npm.cmd test
node tests\locBudget.test.mjs
node -e "import('./src/app.js')"
node artifacts\atmospheric-camera-overlay-v0\proof.mjs http://127.0.0.1:5177/
node artifacts\emitter-reactive-atmospheric-overlay-v0\proof.mjs http://127.0.0.1:5177/
node artifacts\atmospheric-post-processing-polish-v0\proof.mjs http://127.0.0.1:5177/
node artifacts\scale-audit-fire-emitters-v0\web_game_playwright_client.mjs --url http://127.0.0.1:5177/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\atmospheric-post-processing-polish-v0\web-game-client
```

Status:

- Focused tests, full suite, LoC budget, and module import passed.
- Directed post-process proof passed with app console errors `0`, page errors `0`, request failures `0`, and nonblank WebGL canvas probes.
- `?post=0` correctly switched the post layer to `copy_passthrough_v0`.
- Debug HUD rendered after post/atmosphere/gameplay overlays and remained sharp.
- Lifecycle darkness rendered in `gameplayOverlay` after atmosphere; post layer reported lifecycle overlay opacity `0`.
- Camera atmosphere proof was rerun and visually inspected: rain streaks and rare warm sparks are now visible in screenshots while staying subtle.
- Emitter-reactive proof was rerun after the visibility retune: near torch rain caught warm influence, away-from-emitter returned to cold rain, multi-emitter view stayed capped, and `?atmosphereEmitters=0` disabled only emitter reaction.
- Shared `.codex` web-game client still fails from its known `playwright` package resolution issue outside the project; project-local web-game client passed.

Performance:

- Directed post proof: post-process render time `0.1-0.2ms`, atmosphere render time `0-0.1ms`.
- Atmosphere proof after visibility correction: enabled atmosphere render time `0ms`, total renderer time around `2ms`; disabled atmosphere render time `0ms`.
- Emitter-reactive proof after retune: atmosphere render time `0ms` in near/away/multi/toggle captures.

Evidence:

- `artifacts/atmospheric-post-processing-polish-v0/post-enabled.png`
- `artifacts/atmospheric-post-processing-polish-v0/post-disabled.png`
- `artifacts/atmospheric-post-processing-polish-v0/post-debug-hud.png`
- `artifacts/atmospheric-post-processing-polish-v0/post-lifecycle-overlay.png`
- `artifacts/atmospheric-post-processing-polish-v0/post-process-polish-proof-state.json`
- `artifacts/atmospheric-camera-overlay-v0/atmosphere-enabled.png`
- `artifacts/atmospheric-camera-overlay-v0/atmosphere-debug-hud.png`

## 2026-07-09 - Emitter light readability/compositing v0

Original prompt: implement emitter light readability/compositing v0 so torches reveal nearby scenery without overlapping into huge orange fog circles.

Root cause / intent:

- Emitter `radius` and `intensity` were effectively doing two jobs: broad scenery reveal and visible warm haze.
- The WebGL lighting layer expanded every local light into additive warm radials, so increasing radius improved readability but also made stacked orange wash.
- Downstream consumers such as light-space culling, actor readability, atmosphere, and smoke did not distinguish broad reveal from local visible glow.

Implementation:

- Added split emitter profile fields: `revealRadius`, `revealStrength`, `glowRadius`, `glowStrength`, `coreRadius`, and `coreStrength`.
- Added backward-compatible emitter contribution resolution so legacy radius/intensity inputs still map to sane split defaults.
- Changed light view/projection flow so legacy `radius`/`intensity` now represent controlled visible glow while broad reveal fields remain available for readability systems.
- Updated light-space culling and actor readability to use reveal radius/strength.
- Updated rain/spark atmosphere and fog/smoke scatter to use local glow radius/strength instead of broad reveal.
- Added `WebGLEmitterLightComposite` and saturated local emitter compositing:
  - broad neutral reveal;
  - smaller warm glow;
  - tiny flame core;
  - local reveal/glow/core groups drawn through `drawWorldRadialSaturatedLights`.
- Kept moonlight and scene-scale light additive paths separate.
- Restored the documented camera-atmosphere baseline after full-suite validation showed drift in rain/spark defaults and emitter influence budget.

Validation:

```powershell
node .\tests\emitterLightCompositing.test.mjs
node .\tests\lightingFoundation.test.mjs
node .\tests\sceneObjectEmitters.test.mjs
node .\tests\webglLightingLiveWiring.test.mjs
node .\tests\webglRendererHierarchy.test.mjs
npm.cmd test
node .\tests\locBudget.test.mjs
node -e "import('./src/app.js')"
node .\artifacts\emitter-light-readability-compositing-v0\proof.mjs http://127.0.0.1:5244/
node .\artifacts\scale-audit-fire-emitters-v0\web_game_playwright_client.mjs --url http://127.0.0.1:5244/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\emitter-light-readability-compositing-v0\web-game-client
```

Status:

- Focused tests, full suite, LoC budget, and module import passed.
- Directed Playwright proof passed with app console errors `0`, page errors `0`, and request failures `0`.
- Single-torch capture showed controlled core/glow with subtle local scenery reveal.
- Torch-cluster capture showed a broader readable pool without a single opaque orange blob.
- Dark-control capture preserved darkness outside emitter influence.
- Project-local web-game client passed; its screenshot remains affected by the known canvas-only black capture limitation, but recorded runtime state confirmed WebGL active and `split_reveal_saturated_glow_core_v0` live.
- Shared `.codex` web-game client still fails from its known `playwright` package resolution issue outside the project.

Performance:

- Directed proof lighting render time was `0-0.1ms` for single/cluster/dark captures.
- Project-local smoke state reported WebGL lighting render time `0.1ms`, total renderer time `1.6ms`, and rain atmosphere still active with `maxAtmosphereEmitters: 12`.

Evidence:

- `docs/EMITTER_LIGHT_READABILITY_COMPOSITING.md`
- `artifacts/emitter-light-readability-compositing-v0/single-torch-reveal.png`
- `artifacts/emitter-light-readability-compositing-v0/torch-cluster-capped.png`
- `artifacts/emitter-light-readability-compositing-v0/dark-control.png`
- `artifacts/emitter-light-readability-compositing-v0/emitter-light-readability-compositing-state.json`
- `artifacts/emitter-light-readability-compositing-v0/web-game-client/state-0.json`

## 2026-07-09 - Emitter readability follow-up

Original prompt: restore deliberate rain/spark presence, improve lit-region contrast, reduce sceneObject flicker, and fix fire-arrow emitter offset shown in the attached screenshot.

Root cause / intent:

- The rain/spark values restored in the previous slice were not drift; they overwrote deliberate manual tuning intended to make weather visible and interesting.
- Lit-detail sceneObject alpha was tied too directly to feathered light-space influence, so edge objects could read too dim and swap too sharply between full geometry and cheap silhouette.
- Broad reveal still inherited small flicker changes, which made it a poor input for LoD stability.
- Fire-arrow scene-object lights were anchored from shifted `visualX/visualY`, while WebGL arrow geometry is drawn from the object anchor. That made clustered arrow flames visibly offset from their glow.

Implementation:

- Restored stronger user-authored atmosphere presence:
  - `rainDensity: 0.92`
  - `sparkRate: 3.4`
  - `overlayOpacity: 0.88`
  - `maxAtmosphereEmitters: 16`
- Increased neutral reveal/readability strength without increasing local orange glow:
  - stronger torch/raid/smoulder `revealStrength`;
  - lighting profile `lightRevealStrength: 0.94`;
  - broader neutral reveal alpha in `WebGLEmitterLightComposite`;
  - local glow/core remain capped and small.
- Stabilized sceneObject visibility:
  - broader light-space padding and feathering;
  - light-space active emitter budget raised to `32`;
  - reveal flicker reduced as an LoD input;
  - sceneObject visibility now decays stabilized influence before falling back;
  - lit detail has an opacity floor so illuminated objects read with contrast.
- Fixed fire-arrow emitter anchoring:
  - fire-arrow definitions now use `anchorSpace: "object_anchor"`;
  - scene-object light views resolve emitter anchors from the object socket when requested.

Validation:

```powershell
node .\tests\atmosphericCameraOverlay.test.mjs
node .\tests\sceneObjectVisibilityStability.test.mjs
node .\tests\sceneObjectEmitters.test.mjs
node .\tests\webglLightingLiveWiring.test.mjs
node .\tests\emitterLightCompositing.test.mjs
node .\tests\lightingFoundation.test.mjs
node .\tests\webglRendererHierarchy.test.mjs
npm.cmd test
node .\tests\locBudget.test.mjs
node -e "import('./src/app.js')"
node .\artifacts\emitter-readability-followup-v0\proof.mjs http://127.0.0.1:5245/
node .\artifacts\emitter-light-readability-compositing-v0\proof.mjs http://127.0.0.1:5245/
node .\artifacts\scale-audit-fire-emitters-v0\web_game_playwright_client.mjs --url http://127.0.0.1:5245/ --actions-file C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json --iterations 1 --pause-ms 250 --screenshot-dir artifacts\emitter-readability-followup-v0\web-game-client
```

Status:

- Focused tests, full suite, LoC budget, module import, directed browser proofs, and project-local web-game client passed.
- Follow-up proof reported arrow cluster `anchorDistanceTiles: 0`, while the old shifted visual-center distance remained `0.5116` tiles, proving the light now follows the arrow anchor rather than the visual footprint.
- Follow-up proof kept sceneObject lit-detail count stable at `9` across five sampled frames.
- Refreshed light-pool proof passed for single, cluster, and dark-control captures using the updated torch reveal profile.
- Browser proof issues: app console errors `0`, page errors `0`, request failures `0`.
- Shared `.codex` web-game client still fails from the known missing `playwright` package outside the project; project-local client passed.

Evidence:

- `artifacts/emitter-readability-followup-v0/arrow-cluster-emitter-aligned.png`
- `artifacts/emitter-readability-followup-v0/emitter-readability-followup-state.json`
- `artifacts/emitter-readability-followup-v0/web-game-client/state-0.json`
- `artifacts/emitter-light-readability-compositing-v0/single-torch-reveal-followup.png`
- `artifacts/emitter-light-readability-compositing-v0/torch-cluster-capped-followup.png`
- `artifacts/emitter-light-readability-compositing-v0/dark-control-followup.png`
- `artifacts/emitter-light-readability-compositing-v0/emitter-light-readability-compositing-state-followup.json`

## 2026-07-09 - Map forge spawner fixtures and moonlight hold

Original prompt: diagnose scene-object popping/top-left darkness, turn off moonlight/cloud occlusion for now, add AXIOM map forge object/spawner variable editing, and make BSB spawners visible and destroyable.

Implementation:

- Disabled default moonlight creation while keeping the authored moonlight definition opt-in for later tuning; default WebGL lighting now reports no moonlight/cloud primitives.
- Changed scene-object visibility to keep a subtle authored dark silhouette floor and raised lit-detail opacity, reducing pop-in without brightening the whole dark scene.
- Added AXIOM map forge inspector editing for scene objects, units, and spawners. Spawner payload, team, timing, burst/max/limit, spawn radius, fixture health, and fixture radius persist through the existing AXIOM source -> runtime map bake.
- Added BSB runtime spawner fixture entities with `Kind`, `Transform`, `Health`, `Collider`, `Team`, and a separate `unitSpawnerFixtures` view/projection so they are targetable/damageable without becoming actor fallbacks.
- Added y-sorted WebGL placeholder fixture geometry and health strip in the world-depth layer.
- Preserved deliberate atmosphere presence: `rainDensity: 0.92`, `sparkRate: 3.4`, `overlayOpacity: 0.88`, `maxAtmosphereEmitters: 16`.

Validation:

```powershell
npm test
node tests/unitSpawnerSystem.test.mjs
node tests/runtimeMapLoader.test.mjs
node tests/lightingFoundation.test.mjs
node tests/moonlightSceneEmission.test.mjs
node tests/sceneObjectVisibilityStability.test.mjs
node tests/lightningSceneFlash.test.mjs
node tests/webglRendererHierarchy.test.mjs
node tests/atmosphericCameraOverlay.test.mjs
node tests/renderLayerFoundation.test.mjs
npm test # AXIOM/apps/launcher
npm run test:bsb-v2-authoring # AXIOM/apps/launcher
node artifacts/spawner-fixture-map-forge-v0/bsb-browser-proof.mjs
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url "http://127.0.0.1:5177/?map=%2Fdata%2Fmaps%2Faxiom-first-escape.runtime-map.json&source=codex-web-game-client" --actions-file "C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json" --iterations 1 --pause-ms 250 --screenshot-dir "artifacts\spawner-fixture-map-forge-v0\web-game-client"
```

Status:

- Full BSB test suite, AXIOM launcher unit tests, AXIOM browser author/bake proof, BSB browser proof, and project-local web-game client passed.
- BSB browser proof loaded the baked AXIOM runtime map, reported `moonlightViews: 0`, `fixtureCount: 4`, `sceneObjectCount: 261`, `rainDensity: 0.92`, `sparkRate: 3.4`, WebGL active, app page errors `0`, and HTTP failures `0`.
- AXIOM browser proof edited a spawner to werewolf/wolves with `hitPoints: 64` and `fixtureRadiusTiles: 0.7`, then saved and baked the runtime map.

Evidence:

- `artifacts/spawner-fixture-map-forge-v0/bsb-spawner-fixture-moonlight-off.png`
- `artifacts/spawner-fixture-map-forge-v0/bsb-spawner-fixture-moonlight-off.json`
- `artifacts/spawner-fixture-map-forge-v0/web-game-client/state-0.json`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\launcher\output\playwright\axiom-bsb-v2-map-authoring-state.json`

## 2026-07-10 - Mama Wyvern World Spatial Event v0 (implementation checkpoint)

Current request: bring Mama Wyvern's off-screen rampage into the game as occasional distant-roar-preluded shadow flyovers, sometimes followed by a persistent wall of inferno that damages and slows all entities, pressures enemy avoidance, lights/smokes the scene, and can be manually synchronized with lightning for validation.

Implementation checkpoint:

- Added `black-sky-bound.world-spatial-event.mama-wyvern.v0` as world-owned event state with bounded automatic scheduling and alternating visual/inferno variants.
- Added manual browser API and query controls for flyover, inferno, lightning-flyover, and lightning-inferno proof scenarios without adding permanent UI clutter.
- Added a distant Mama roar cue through the existing Audio Director and placeholder manifest.
- Added a renderer-neutral world-event projection and a dedicated WebGL layer that duplicates the live player wyvern mesh, enlarges/darkens it, and sweeps it through world space at variable angles.
- Added non-propagating 18-second inferno walls with falling damage, slow strength, warm light, flame height, and smoke.
- Inferno damage is faction-neutral and checks all `Transform + Health` entities, including player, enemies, and damageable spawner fixtures.
- Enemy avoidance pressure reuses the existing retreat/steering state instead of adding pathfinding or collision bypasses.
- Slightly increased natural lightning frequency from `20-40s` to `18-32s`; manual sync queues a real lightning scene flash once the silhouette is on-screen.
- Added focused coverage in `tests/mamaWyvernWorldEvent.test.mjs` and updated lightning/WebGL hierarchy contracts.

Checkpoint validation:

```powershell
node tests/mamaWyvernWorldEvent.test.mjs
node tests/lightningSceneFlash.test.mjs
node tests/locBudget.test.mjs
node -e "import('./src/app.js')"
npm.cmd test
```

Final validation:

```powershell
node artifacts/mama-wyvern-world-event-v0/proof.mjs
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url "http://127.0.0.1:5268/?mamaEvent=lightning-inferno&mamaAuto=0" --actions-file artifacts/mama-wyvern-world-event-v0/actions-warning.json --iterations 1 --pause-ms 50 --screenshot-dir artifacts/mama-wyvern-world-event-v0/web-game-client-warning
node tests/mamaWyvernWorldEvent.test.mjs
npm.cmd test
node tests/locBudget.test.mjs
node -e "import('./src/app.js')"
```

Status: complete. Focused tests, full suite, LoC gate, module import, the project-specific real-browser proof, and the established web-game client pass. The proof observed the player-derived 1,994-triangle shadow packet, one real manual lightning flash while that shadow was on-screen, faction-neutral fire damage against player/enemy/fixture, enemy avoidance pressure, seven residual lights, six smoke sources, and nine-second damage/light falloff. Console issues, application console issues, page errors, and request failures were all empty.

Evidence:

- `artifacts/mama-wyvern-world-event-v0/mama-shadow-flyover.png`
- `artifacts/mama-wyvern-world-event-v0/mama-shadow-lightning-highlight.png`
- `artifacts/mama-wyvern-world-event-v0/mama-inferno-wall-early.png`
- `artifacts/mama-wyvern-world-event-v0/mama-inferno-wall-burnout.png`
- `artifacts/mama-wyvern-world-event-v0/mama-wyvern-world-event-state.json`
- `artifacts/mama-wyvern-world-event-v0/web-game-client-warning/state-0.json`

Intentionally unchanged: egg emergence, targetable Mama actor logic, propagating fire, navmesh/pathfinding, new dragon art assets, and permanent debug UI.

## 2026-07-09 - Black shadow LoD for unlit scene objects and actors

Request:

- Stop scene objects and hostile actors popping out of existence outside light-influenced render space.
- Render low-detail black silhouettes instead, then verify the actual failure by moving through the game with a real browser playtest.

Root cause:

- The WebGL actor layer had a hard unlit non-player early return. Actors could continue simulating and attacking while the renderer returned no drawable actor for them.
- Scene objects already had a dark-presence path, but it was too faint to read as deliberate black shadow LoD during heavy darkness.

Implementation:

- Added `actorShadowLod` render budget policy and diagnostics for unlit non-player black shadow LoDs.
- Replaced the unlit non-player actor disappearance path with cheap black silhouette primitives plus contact shadow, while preserving full lit detail when actors enter light space.
- Raised scene-object dark-presence alpha and forced the presence LoD to black silhouette colour instead of low-alpha material colour.
- Threaded actor shadow-LoD counts through world-depth and top-level WebGL render diagnostics.
- Updated light-space culling docs and regression tests to require black shadow LoD instead of invisible hostile culling.

Validation:

```powershell
node .\tests\sceneObjectVisibilityStability.test.mjs
node .\tests\lightSpaceRenderCulling.test.mjs
node .\tests\webglLightingLiveWiring.test.mjs
node .\tests\webglWorldDepthLayer.test.mjs
node -e "import('./src/app.js')"
npm test
node .\tests\locBudget.test.mjs
node .\artifacts\shadow-lod-render-space-v0\proof.mjs "http://127.0.0.1:5250/?map=%2Fdata%2Fmaps%2Faxiom-first-escape.runtime-map.json&source=shadow-lod-proof"
```

Status:

- Focused tests, full BSB test suite, LoC gate, app import, and project-local Playwright proof passed.
- Playtest moved through the live map, then staged the player beside a live unlit `husk_24` with `targetLightInfluence: 0`.
- With scene lights forced to `0`, WebGL reported `actorShadowLodCount: 3`, `sceneObjectPresenceVisibleCount: 10`, browser console/page/http issues all empty, and the player still took damage while the hostile cluster remained visible as black silhouettes.

Evidence:

- `artifacts/shadow-lod-render-space-v0/01-start.png`
- `artifacts/shadow-lod-render-space-v0/05-southeast-danger.png`
- `artifacts/shadow-lod-render-space-v0/07-staged-hostile-before-light-disable.png`
- `artifacts/shadow-lod-render-space-v0/08-no-light-shadow-lod-debug.png`
- `artifacts/shadow-lod-render-space-v0/proof-state.json`

## 2026-07-09 - Managed escape-zone transition into a second AXIOM-authored region

Request:

- Treat the opening map's escape zone as a managed end that loads a next map instead of ending the scenario.
- Use AXIOM map forge to create and manage a placeholder next region, then bake/load it into BSB.

Implementation:

- Added manifest-backed `nextMapId` validation and runtime-map `transitions.escapeZone` validation.
- Added BSB transition loading through `loadRuntimeMapTransition()`, with manifest registration required before a target can load.
- Added a `transitioning` scenario phase, map-transition request state, async app-level map swap, camera reset, fresh ECS state creation, and a runtime transition receipt in `render_game_to_text()`.
- Preserved old terminal win behaviour for maps with no authored escape transition.
- Added the `Ash Road Threshold` placeholder region to the BSB manifest, AXIOM authoring data, and baked runtime maps.
- Updated AXIOM map forge to load the BSB manifest as a region library, select regions by catalogue id, block dirty region switches, save per-region authoring files, and bake the selected region to its own runtime path.

Validation:

```powershell
node .\tests\mapManifest.test.mjs
node .\tests\runtimeMapLoader.test.mjs
node .\tests\runtimeMapBootstrap.test.mjs
node .\tests\mapTransition.test.mjs
node -e "import('./src/app.js')"
npm test
node .\tests\locBudget.test.mjs
npm test # AXIOM/apps/launcher
npm run test:bsb-v2-authoring # AXIOM/apps/launcher
node .\artifacts\escape-zone-next-map-v0\proof.mjs
```

Status:

- Focused BSB map tests, full BSB suite, app import, LoC gate, AXIOM launcher unit suite, AXIOM browser author/bake proof, and direct BSB escape transition proof passed.
- AXIOM browser proof loaded both registered regions, edited/saved/baked the opening map and `Ash Road Threshold`, and verified both embedded WebGL runtime previews with no app console issues, page errors, or unclassified HTTP failures.
- BSB proof loaded `axiom_first_escape`, moved the real player ECS transform into the escape zone, observed the transition request enter `loading`, then loaded `axiom_second_approach` with `selectionSource: "escape_zone_transition"` and respawned the player at `6.5,17.5`.

Evidence:

- `artifacts/escape-zone-next-map-v0/escape-zone-before.png`
- `artifacts/escape-zone-next-map-v0/escape-zone-after.png`
- `artifacts/escape-zone-next-map-v0/escape-zone-proof-state.json`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\launcher\output\playwright\axiom-bsb-v2-map-authoring.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\launcher\output\playwright\axiom-bsb-v2-baked-runtime.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\launcher\output\playwright\axiom-bsb-v2-second-region-authoring.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\launcher\output\playwright\axiom-bsb-v2-second-region-runtime.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\launcher\output\playwright\axiom-bsb-v2-map-authoring-state.json`

## 2026-07-13 - Mama Wyvern flyover finish

Original prompt: finish the dragon flyover event so the flyover is genuinely in player camera scope, inferno lighting is strong enough to create readable shadows, trees gain engulfed/simmer/burnt-out shader state with smoke and low residual light, and the flame wall reads more like liquid napalm with stronger particle influence.

Implementation:

- Re-anchors ordinary flyover crossings beside the live player when the warning phase ends, while preserving explicit debug centers for directed proof.
- Adds viewport-intersection diagnostics to the world-event WebGL layer so mesh existence cannot be confused with camera visibility.
- Strengthens inferno reveal/glow/core light contributions, marks the bounded inferno chain as high-priority shadow lights, and adds hot ember particles.
- Gives gameplay a mutable runtime scene-object copy so temporary tree-fire state never mutates deep-frozen authored/runtime-map truth.
- Adds `engulfed -> simmer_high -> simmer_low -> burnt_out` tree material state with heat, ember, smoke, char, integrity, and shader-variant projection.
- Burning trees now add layered canopy flames and char/coal detail inside the scenery material path plus a post-light emissive overlay, shared smoke-field sources, ember particles, and phase-scaled canopy lights; burnt trees retain a low ember light and fading smoke.
- Reworks inferno geometry toward an irregular liquid-napalm bed with layered dark/hot ribbons, asymmetric primary/secondary flame licks, pools, and spatters.
- Adds `tests/mamaWyvernFlyoverFinish.test.mjs` covering live-player crossing, viewport intersection, immutable authored truth, tree phase transitions, fire shaders, post-light tree-fire projection, smoke/particles/lights, and real inferno-produced shadow packets.

Validation:

```powershell
node tests/mamaWyvernFlyoverFinish.test.mjs
node tests/mamaWyvernWorldEvent.test.mjs
node tests/webglRendererHierarchy.test.mjs
npm.cmd test
node tests/locBudget.test.mjs
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
node artifacts/mama-wyvern-flyover-finish-v1/proof.mjs http://127.0.0.1:5273/
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url "http://127.0.0.1:5273/?mamaEvent=lightning-inferno&mamaAuto=0" --actions-file "C:\Users\felix\.codex\skills\develop-web-game\references\action_payloads.json" --iterations 1 --pause-ms 250 --screenshot-dir "artifacts\mama-wyvern-flyover-finish-v1\web-game-client"
```

Status:

- Complete. Focused tests, full BSB suite, LoC gate, app import, project-local web-game client, and the dedicated real-browser proof pass.
- The flyover proof recorded 1,559 Mama triangles intersecting the camera, 56.3% viewport coverage, and 1,994 total flyover triangles.
- The inferno published eight strong high-priority lights and produced 34 scene-object shadow packets. The target tree projected the fire shader contract and progressed through `engulfed`, `simmer_high`, `simmer_low`, and persistent `burnt_out`; lighting reduced from two active canopy lights to one residual ember light while smoke reduced from two sources to one.
- The dedicated Playwright run captured all four acceptance frames at 1440x900 with empty console issues, application console issues, page errors, and request failures.
- Visual review confirms the event now reads as a camera-scale flyover followed by a continuous hot ground ribbon with asymmetric eruptions, ember particulate, strong environmental shadows, and a visibly charred post-fire tree.
- The centrally installed web-game client remains unable to resolve its own `playwright` dependency; the identical client/actions completed through the project's installed Playwright runtime. Its canvas-only screenshot was black, so visual acceptance relies on the dedicated real-browser screenshots and state assertions rather than that generic capture.

Evidence:

- `artifacts/mama-wyvern-flyover-finish-v1/01-flyover-in-camera.png`
- `artifacts/mama-wyvern-flyover-finish-v1/02-liquid-inferno-tree-engulfed.png`
- `artifacts/mama-wyvern-flyover-finish-v1/03-tree-simmer-high.png`
- `artifacts/mama-wyvern-flyover-finish-v1/04-tree-burnt-out.png`
- `artifacts/mama-wyvern-flyover-finish-v1/mama-wyvern-flyover-finish-state.json`

## 2026-07-13 - Mama Inferno liquid-napalm refinement

Visual reference: the alpha-dragon attack beginning near 2:48 in the supplied *Reign of Fire* clip. The adapted principles are a fast peripheral dragon silhouette, a brief delivery connection, and a grounded deposit that rapidly swells into heavy, asymmetric rolling combustion.

Implementation:

- Replaced the ribbon/sample composition with one cached SDF batch containing three dominant rolling masses, three merging secondary masses, and two wide low-combustion bridges.
- Uses overlapping rounded outer combustion, orange internal lobes, only two embedded pale cores, broken pooled fuel/contact forms, and two sparse rounded tongue accents; there is no continuous flame sheet or generic inferno triangle/radial list.
- Adds a short geometry-free ignition bloom plus seeded fold, swell, and screen-up roll in the fragment shader. Runtime mutation remains limited to age, lifetime, and life scale.
- Exposes retained inferno geometry diagnostics through the normal renderer stats summary and removes the temporary private profiling hook.
- Preserves the authored event contract: eight lights, seven smoke sources, damage, slow, lifetime, collision/avoidance, flyover camera anchoring, and tree-fire lifecycle.

Status:

- Implementation status: complete and fully validated.
- Gameplay/visual acceptance: ready for Felix review; not treated as closed until the close still and in-game motion are accepted.
- Final proof records one static-buffer upload, 206 buffer reuses, one batch/draw, 17.47% visible blended-pixel coverage, 8.03% alpha-weighted coverage, eight inferno lights, seven smoke sources, and 54 inferno shadow packets in the forest scene.
- Paired subsystem removal testing identifies grouped dynamic lights as the only material measured owner in that run (about 0.92 ms average); inferno geometry, shadows, smoke/embers, and burning-tree removal were within run noise. Visual geometry was therefore retained.
- Full test suite, LoC gate, app import, focused flyover/tree/inferno tests, and final Playwright proof pass with no console issues, page errors, or request failures.

Evidence:

- `artifacts/mama-inferno-liquid-napalm-v2/acceptance-final-01-full-wall.png`
- `artifacts/mama-inferno-liquid-napalm-v2/acceptance-final-02-fuel-body-close.png`
- `artifacts/mama-inferno-liquid-napalm-v2/acceptance-final-03-motion-a.png`
- `artifacts/mama-inferno-liquid-napalm-v2/acceptance-final-04-motion-b.png`
- `artifacts/mama-inferno-liquid-napalm-v2/acceptance-final-05-forest-lighting.png`
- `artifacts/mama-inferno-liquid-napalm-v2/acceptance-final-state.json`
- `artifacts/mama-inferno-liquid-napalm-v2/ownership-profile.json`

## 2026-07-13 - Mama Wyvern directional flyover and aerial silhouette

Root cause:

- The world-event WebGL layer directly imported `buildWebGLPlayerWyvernSilhouette`, whose authored body plan is the player's grounded crawl pose. Scaling that rig produced the rejected thick gecko/crawling read.
- Flyover travel and rendering shared a path, but the inferno segment was laid along the path normal, so the deposited wall could be 90 degrees away from Mama's strafe.

Implementation:

- Adds one event-owned normalized heading plus orthogonal forward/right basis. At warning-to-flyover transition, the event intersects that line with an expanded snapshot of the active camera bounds to produce guaranteed off-screen entry and exit points.
- Scheduled headings cover the full circle with deterministic variation and a minimum near-repeat separation; position, rotation, breath origin/target, delivery provenance, and inferno line all consume the same basis.
- Adds a dedicated cached static aerial silhouette: 15.4-tile authored wingspan, 9.95-tile body length, 1.02-tile torso width, eight tapered wing fingers, extended neck/head and tail, and zero leg primitives. The world scale is 0.46 so it remains enormous but readable at the normal 2.75 camera zoom.
- Restricts the bounded eight-lobe head-rooted delivery plume to inferno events; visual-only flyovers remain clean silhouette passes. The existing cached rolling inferno composition, eight lights, seven smoke sources, tree lifecycle, damage, slow, avoidance, and scheduling frequency are unchanged.
- Reduces the configured crossing to 1.22 seconds. Browser sampling measured 0.98 seconds of meaningful visible silhouette.

Validation and evidence:

- `npm.cmd test`, the LoC budget, app import, proof syntax, focused Mama/inferno tests, and the independent browser state client pass.
- The dedicated browser proof covers horizontal, vertical, diagonal, and reverse-diagonal entries; all intersect the active viewport. Inferno-to-flight heading error is exactly zero radians.
- The final 90-frame paired run measured 11.59 ms baseline versus 11.84 ms inferno-active full-scene rendering, a 0.25 ms average delta. World-event geometry remained one cached eight-instance batch; light and smoke counts remain 8/7.
- Console warnings/errors, page errors, and request failures are empty. The generic client's WebGL-only screenshot remains black in this environment, but its semantic runtime export is valid; visual acceptance uses the dedicated rendered captures.

Evidence:

- `artifacts/mama-wyvern-flyover-finish-v1/01-flyover-in-camera.png` (rejected grounded-rig baseline)
- `artifacts/mama-directional-flyover-v1/01-horizontal-heading.png`
- `artifacts/mama-directional-flyover-v1/02-vertical-heading.png`
- `artifacts/mama-directional-flyover-v1/03-diagonal-heading.png`
- `artifacts/mama-directional-flyover-v1/04-reverse-diagonal-heading.png`
- `artifacts/mama-directional-flyover-v1/05-mama-beginning-breath.png`
- `artifacts/mama-directional-flyover-v1/06-aligned-inferno.png`
- `artifacts/mama-directional-flyover-v1/07-aerial-silhouette-close.png`
- `artifacts/mama-directional-flyover-v1/mama-directional-flyover-state.json`

## 2026-07-14 - Enemy projections and attack readability v1 (in progress)

Current request: improve raider-first enemy articulation, truthful weapon reach, attack phase readability, bounded directional guarding, and distinct husk/werewolf telegraphs without redesigning enemy AI or combat architecture.

Initial ownership map:

- `src/data/enemyAttackProfiles.js` owns canonical timing, hit shape, reach, strike sockets, and telegraph metadata.
- `src/systems/enemyAttackSystem.js` owns attack phase transitions and damage resolution.
- `src/systems/enemyPressureSystem.js` owns the existing bounded raider guard hold.
- `src/systems/humanoidProjectionSystem.js` and `src/systems/predatorProjectionSystem.js` own articulated pose output.
- WebGL silhouette builders consume projection points and must not redefine combat truth.
- Focused tests plus inspected Playwright screenshots are required before completion.

Baseline finding: raider arms and legs currently render as single shoulder/hip-to-extremity segments; damage fires at the windup-to-recovery boundary with no canonical active phase; spear geometry is based on one hand and forward-facing renderer-neutral pose heuristics; the existing guard is a movement hold only, with no directional mitigation contract.

Completion:

- Canonical enemy attack profiles now own windup/active/recovery timing, damage timing, motion/pose identity, hit shape, weapon reach, commitment, strike sockets, and optional debug shape metadata. `enemyAttackSystem` resolves the explicit active phase and damage moment; projections and renderers only consume that state.
- Raider and husk projection now emits deterministic shoulders, elbows, hands, hips, knees, feet, head, chest, weapon grips, and endpoints. Spear phases use a two-hand retract/angle/commit/recover sequence; torch phases use a side windup and across-body sweep with the spear stowed; guard braces the spear across the body; death clears attack, guard, and trail residue.
- Raider guard is a bounded physical mechanic: a living, non-attacking raider can mitigate blockable attacks inside a 129.6-degree forward sector to 62% damage, then enters a 0.28-second recovery. Rear attacks bypass it, and guard/attack are mutually exclusive.
- Husk maul compresses before a two-hand rake; werewolf bite coils low, commits forward during its active window, and lands into recovery. Optional canonical hit/guard geometry is enabled only by `?attackDebug=1` and is off by default.
- The final visual pass increased elbow separation, strengthened spear windup retraction/twist, reduced stowed-torch clutter, and moved the spear out of the torch swing silhouette. Inspected staged captures answer yes to distinct spear phases, articulated joints, weapon alignment, guard readability, husk/wolf contrast, and multi-raider faction readability.

Validation:

- `npm.cmd test`: passed, including new finite-pose, reach, diagonal alignment, torch arc, directional guard, guard exclusion/recovery, husk/wolf, death cleanup, debug-default, and 50-raider tests.
- App import and the 500-nonblank-line source gate passed.
- Project-local standard web-game client completed two live interaction iterations and produced valid semantic state. Its screenshots retain the known black WebGL readback limitation; dedicated full-page Playwright captures provide the visual proof.
- Dedicated Playwright proof: 13 screenshots / 12 staged states; zero console errors, page errors, or request failures; every staged pose finite; canonical spear tip reach measured 1.15 at damage time; 50-raider/90-frame browser render loop averaged 14.59 ms (loose gate below 20 ms), with no persistent combat debug geometry.

Evidence:

- `artifacts/enemy-combat-readability-v1/enemy-combat-readability-contact-sheet.png`
- `artifacts/enemy-combat-readability-v1/02-spear-ready.png`
- `artifacts/enemy-combat-readability-v1/03-spear-windup.png`
- `artifacts/enemy-combat-readability-v1/04-spear-active-edge-reach.png`
- `artifacts/enemy-combat-readability-v1/06-torch-windup.png`
- `artifacts/enemy-combat-readability-v1/07-torch-active.png`
- `artifacts/enemy-combat-readability-v1/08-raider-guard.png`
- `artifacts/enemy-combat-readability-v1/09-husk-maul-windup-dark.png`
- `artifacts/enemy-combat-readability-v1/10-werewolf-lunge-telegraph.png`
- `artifacts/enemy-combat-readability-v1/11-werewolf-lunge-active.png`
- `artifacts/enemy-combat-readability-v1/12-multiple-raider-faction-fight.png`
- `artifacts/enemy-combat-readability-v1/enemy-combat-readability-state.json`

## 2026-07-14 - Heavy werewolf predator projection v1

Current objective: make the normal werewolf the physically dominant non-boss enemy through the existing predator profile, projection, light-readability, shadow, and WebGL actor paths, without changing combat values or adding a parallel renderer.

Ownership and baseline:

- `src/data/creatures/werewolfPredator.js` is the canonical visual-profile owner and is currently used only by werewolves.
- `src/data/enemyAttackProfiles.js` remains the canonical lunge timing, 1.28-tile reach, hit-shape, and damage owner.
- `src/systems/predatorProjectionSystem.js` is the procedural pose owner; `src/projection/renderProjection.js` projects that state; `src/render/backends/webgl/WebGLPredatorSilhouette.js` is the single mesh consumer; `WebGLActorLayer` owns the existing draw and shadow paths.
- The current rig has only chest/hips/head/muzzle plus four direct root-to-paw limbs. It has no elbows, knees, hocks, neck, jaw, ears, mane, claws, or authored asymmetry, and renderer widths are mostly fixed pixel constants.
- Baseline neutral mesh cost is 145 triangles / 10 reported parts. Baseline visual bounds are 2.33 by 1.04 tiles with a 0.38-tile collider; much of the length is tail, while transverse body mass remains close to humanoid scale.
- The existing additive active pose can project the muzzle beyond canonical bite reach. The new projection must instead consume the attack profile endpoint and place the muzzle at 1.28 tiles at damage time.

Completion:

- Replaced the thin ten-part puppet with a 31-part procedural predator: tapered chest/waist/haunches, thick neck, long lowered muzzle, jaw, asymmetric ears, shoulders/elbows/wrists/claws, hips/knees/hocks/paws, a two-section tail, and bounded fur breakup. The planted stance is deliberately transverse so forearms and hocks remain visible outside the body mass.
- Added deterministic loaded-idle breathing/weight shift, shoulder-led prowl, compressed windup with planted haunches, exact-reach jaw release, and slumped/braced recovery. The same pose remains finite and directionally aligned across multiple angles.
- Kept one canonical profile -> projection -> existing WebGL silhouette path. Actor lighting now consumes the werewolf profile's rim/catchlight/contact-shadow tuning; the actor layer consumes its shadow scale. No combat, AI, damage, timing, collider, or alternate rendering path was added.
- Added `createWerewolfPredatorProfile(overrides)` as an immutable bounded inheritance seam. A later alpha/boss can override scale, mass, detail, palette, pose exaggeration, and readability from the same normal-werewolf vocabulary without embedding boss conditionals in projection or rendering.
- Active release places the muzzle at exactly the canonical 1.28-tile damaging endpoint. The fur, limbs, tail, and 0.38-tile body collider remain deliberately projection/collision-policy disclosures; active claw extent measured 1.289 tiles, a non-damaging 0.009-tile visual overhang rather than a second damage promise.

Validation:

- `npm.cmd test`, `npm.cmd run test:loc`, app import, and `git diff --check`: passed.
- Focused tests cover unchanged collider/reach/damage truth, variant inheritance, scale comparison, finite articulation, idle/prowl/windup/active/recovery phases, exact endpoint alignment at several angles, renderer ownership, darkness readability, and a sixteen-wolf projection loop.
- Dedicated real Playwright proof passed nine staged screenshots/states with zero console errors, page errors, or request failures. It covers humanoid comparison, near/away torch lighting, prowl, windup, release, recovery, multiple attack angles, and a twelve-wolf pack.
- Final mesh cost is 280 triangles idle / 282 active versus the 145-triangle baseline: +135 idle triangles (+93.1%), still within the focused 270-320 budget. Twelve visible wolves produce 3,360 triangles.
- Browser render probe over 90 frames measured 13.952 ms for one wolf and 15.953 ms for twelve, a 2.001 ms delta in this run.

Evidence:

- `artifacts/werewolf-heavy-predator-v1/werewolf-heavy-predator-contact-sheet.png`
- `artifacts/werewolf-heavy-predator-v1/01-idle-scale-comparison.png`
- `artifacts/werewolf-heavy-predator-v1/02-idle-near-torch.png`
- `artifacts/werewolf-heavy-predator-v1/03-idle-away-from-torch.png`
- `artifacts/werewolf-heavy-predator-v1/04-heavy-prowl.png`
- `artifacts/werewolf-heavy-predator-v1/05-lunge-windup.png`
- `artifacts/werewolf-heavy-predator-v1/06-lunge-release.png`
- `artifacts/werewolf-heavy-predator-v1/07-heavy-recovery.png`
- `artifacts/werewolf-heavy-predator-v1/08-lunge-multiple-angles.png`
- `artifacts/werewolf-heavy-predator-v1/09-multiple-werewolves.png`
- `artifacts/werewolf-heavy-predator-v1/werewolf-heavy-predator-state.json`

## 2026-07-14 - Space dodge + charge counter v0

Current request: make Space trigger an immediate normal dodge, accept a buffered second Space press as a stamina-heavy charge counter, keep lunge available on Q, and put both dodge and charge behind progression-owned unlocked ability state.

Ownership map:

- `src/data/abilities.js` remains the canonical owner for ability costs, timing, collision/contact, impact, input-action, and default-unlock tuning.
- `AbilityProgression` owns the player's unlocked ability ids and consumed unlock-event receipts; input and action systems may query it but may not invent availability.
- `DodgeState` remains the collision-safe immediate defensive displacement owner.
- `ChargeCounterState` owns only the follow-up buffer/queue/receipt state; the existing procedural action path owns the plant, committed drive, contact, and recovery pose.
- `staminaSystem` owns same-frame dodge/follow-up arbitration and resource spending; `chargeCounterSystem` owns the queued transition after the dodge.
- `wyvernActionImpulseSystem` remains the collision-safe action displacement owner and gains data-driven acceleration/stop-on-block support rather than a parallel mover.
- `wyvernAttackContactSystem` remains the player contact/damage/impact owner; charge supplies a broader canonical body contact through the existing path.
- Progression event data is separate from ability implementation; the first-scenario event trigger/tutorial remains deliberately later work.

Implementation chunk:

- Added `AbilityProgression` with default-unlocked ids derived from the ability registry; movement, melee, smoke, lunge, dodge, and charge input all query that state.
- Added a separate one-shot `instinct_charge_awakened` event definition and grant receipt path without wiring a scenario trigger/tutorial yet.
- Rebound Space to immediate 20-stamina dodge and Q to the preserved body lunge; normal dodge fallback now follows aim/facing instead of jumping backwards from it.
- Added a 320 ms second-Space window, pre-acceptance 36-stamina check/spend, 40-degree redirect clamp, dodge-to-plant transition, accelerated 2.55-tile committed drive, broad body contact, heavy impact/stagger, collision stop, and 480 ms recovery.
- Reused the existing procedural wyvern action, collision-safe impulse, attack contact, damage, impact, effect, and projection paths.
- Raised the player stamina pool to the requested 100-point scale; the combined dodge/charge sequence costs 56.
- Added focused tests for same-frame dodge, input rebinding, buffer/resource arbitration, progression event grants, plant/drive/recovery, clustered raider/husk/werewolf contacts, predator resistance, redirect limits, wall collision, receipts, and system order.

Focused validation:

```powershell
node tests/staminaDodgeSprint.test.mjs
node tests/wyvernInputComboSmokeSpit.test.mjs
node tests/chargeCounter.test.mjs
node -e "import('./src/app.js')"
```

Final validation:

```powershell
npm.cmd test
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url "http://127.0.0.1:5274/" --actions-file "artifacts/space-dodge-charge-v0/web-game-actions.json" --iterations 1 --pause-ms 100 --screenshot-dir "artifacts/space-dodge-charge-v0/web-game-client-local-immediate-double"
node artifacts/space-dodge-charge-v0/proof.mjs http://127.0.0.1:5274/
```

Status:

- Complete. Focused tests, full BSB suite, 500-line source gate, app import, project-local standard web-game client, and dedicated staged Playwright proof pass.
- Standard client semantic state recorded one dodge plus one completed charge receipt. Its known WebGL canvas-only capture remains black; the dedicated full-page proof supplied the visual acceptance frames.
- Dedicated proof verified immediate dodge at 80/100 stamina, accepted follow-up at 44/100, `plant -> drive -> recover -> idle`, a completion receipt, and Q starting `lunge_attack`.
- Inspected full-page captures show distinct dodge, compressed plant, committed drive, recovery posture, and preserved lunge projection in the live rain/night scene.
- No application console errors, page errors, or request failures. Chromium emitted only screenshot-induced WebGL `ReadPixels` performance warnings.

Evidence:

- `artifacts/space-dodge-charge-v0/01-dodge-immediate.png`
- `artifacts/space-dodge-charge-v0/02-followup-queued.png`
- `artifacts/space-dodge-charge-v0/03-charge-plant.png`
- `artifacts/space-dodge-charge-v0/04-charge-drive.png`
- `artifacts/space-dodge-charge-v0/05-charge-recovery.png`
- `artifacts/space-dodge-charge-v0/06-charge-finished.png`
- `artifacts/space-dodge-charge-v0/07-q-lunge.png`
- `artifacts/space-dodge-charge-v0/proof-state.json`

Later work deliberately left out: scenario trigger/tutorial presentation for `instinct_charge_awakened`; the event and grant contract are ready for that slice.

## 2026-07-14 - Gameplay tutorial prompts and instincts review (complete)

Current objective:

- Add a polished, lightweight, reusable tutorial cue system for first movement, first close enemy engagement, first committed incoming attack, and the first hostile near-death instinct event.
- Persist tutorial history and ability unlock receipts at player-profile scope, keep gameplay live during prompts, and add a pause-menu `CONTROLS & INSTINCTS` review plus bounded tutorial/time-slow settings.

Canonical domain owners:

- `src/core/input.js` owns raw device state; a new `src/data/inputActions.js` registry will become the single binding/label source consumed by gameplay, tutorials, and pause review.
- `AbilityProgression` plus `src/game/playerAbilities.js` remains the ability-availability and unlock owner.
- A new `src/game/playerProfile.js` contract will own persisted tutorial history, settings, and the profile copy of ability progression; ECS progression remains the live gameplay authority hydrated from that profile.
- `enemyPressureSystem`, `enemyAttackSystem`, and `healthSystem` remain the proximity, committed-attack, and health-pressure owners and may emit semantic events without constructing UI.
- The app loop remains the sole gameplay-time authority through one bounded time-scale request contract.
- `buildRenderProjection` plus the WebGL layer registry remains the overlay/UI rendering boundary; render code will receive projected cue state only.

Current divergent or missing paths:

- Bindings are hardcoded inside `inputSystem`, so UI cannot read them canonically.
- Ability/tutorial state is scenario-local ECS data and does not survive reloads or map transitions.
- Pause is a boolean toggle with no menu/settings surface.
- Enemy windup and near-death crossings have no semantic events for a cue system.
- No bounded cue queue or time-scale request owner exists.

Exact implementation area:

- Input/profile/time/tutorial data and runtime modules under `src/data`, `src/game`, and `src/systems`.
- Semantic event additions in existing combat/health owners.
- One renderer-neutral tutorial projection and one bounded WebGL tutorial/pause layer.
- Focused tests in `tests/tutorialPromptSystem.test.mjs`, existing pause coverage, the full BSB suite, and dedicated Playwright evidence under `artifacts/tutorial-prompts-v1/`.

Constraints:

- Do not put tutorial truth in renderers or enemy visuals.
- Do not create a second ability, persistence, or time-scale owner.
- Do not pause gameplay for ordinary cues; slow-time must be bounded, settings-aware, non-stacking, and safely released.
- Do not replay completed profile tutorials on reload, respawn, map transition, or retained New Game Plus profile state.
- Keep production modules below the existing 500 nonblank-line gate.

Expected reroutes/deletions:

- Reroute hardcoded gameplay input checks through the canonical input-action registry.
- No unrelated subsystem deletions are expected; no parallel DOM overlay or renderer path will be added.

Validation plan:

- Focused tests for fresh/reloaded/respawn/NG+ persistence, close-versus-distant engagement, committed attack trigger, immediate dodge, slow-time restoration, near-death hysteresis/one-shot unlock, disabled prompts with active progression, pause review, and locked ability visibility.
- `npm.cmd test`, `npm.cmd run test:loc`, app import, `git diff --check` where meaningful, standard web-game client, and a dedicated Playwright proof with inspected frames for all four cues plus the pause menu.

Implementation checkpoint 1:

- Added `src/data/inputActions.js` as the canonical action/binding/label registry and rerouted live player input through it.
- Added persisted `black-sky-bound.player-profile.v1` state with separate ability unlocks, consumed unlock events, cue shown/completed/reviewable history, tutorial settings, and retained NG+ counters.
- Added semantic committed-attack, resolved-attack, accepted-player-action, and one-shot hostile near-death events in their existing gameplay owners.
- Added one bounded priority cue runtime with interruption/postponement, accepted-action progress, disabled-prompt progression independence, and profile persistence.
- Added one app-owned time-scale request authority; tutorial slow-time uses a single bounded request and releases on success, interrupt, settings change, game replacement, or timeout.
- Added the renderer-neutral tutorial projection plus one WebGL tutorial/pause layer with safe-zone adjustment, key depression feedback, restrained ash/ember movement, and `CONTROLS & INSTINCTS` review/settings.

Checkpoint validation:

- App module import: passed.
- 500 nonblank-line production source gate: passed.
- Focused behavioral tests and live visual tuning remain in progress.

Implementation checkpoint 2:

- Added `tests/tutorialPromptSystem.test.mjs` covering canonical binding reads, profile reload, respawn/runtime reset, retained NG+, close-versus-distant engagement, accepted combo/smoke progress, priority interruption, immediate dodge, all slow-time restoration paths, time-slow settings, hostile near-death hysteresis, unlock persistence, disabled prompts, temporary dismissal, and pause review visibility.
- Extended `render_game_to_text` with active cue, progress, profile history, pause controls, queue depth, and time-scale/request state for browser proof.

Checkpoint validation:

- Focused tutorial suite: passed.
- Full `npm.cmd test`: passed.
- `npm.cmd run test:loc`: passed.
- App module import: passed.
- Remaining work: live Playwright gameplay proof, visual inspection/tuning, requested screenshot set, and final scope/documentation audit.

Final validation:

```powershell
node tests/tutorialPromptSystem.test.mjs
npm.cmd test
npm.cmd run test:loc
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url http://127.0.0.1:5279/ --actions-file artifacts/tutorial-prompts-v1/standard-actions.json --iterations 2 --pause-ms 100 --screenshot-dir artifacts/tutorial-prompts-v1/standard-client-local
node artifacts/tutorial-prompts-v1/proof.mjs http://127.0.0.1:5279/
```

Status:

- Complete. Focused tests, the full BSB suite, 500 nonblank-line source gate, app import, project-local standard web-game client, and dedicated staged Playwright proof pass.
- Dedicated browser proof exercised a fresh profile through WASD onboarding, persistent completion, close-hostile combat introduction, canonical committed-attack dodge slow-time, immediate Space dodge/time restoration, canonical hostile near-death damage, persisted instinct receipt, two-press dodge-charge progression, and pause review.
- Six full-page browser captures were inspected at 1440 x 900. Prompts remain legible over the live rain/night scene without hiding the player or threat; pressed keys use a restrained ember highlight; the unframed pause review shows unlocked charge and hides locked dragonfire.
- Browser result: 0 application console errors, 0 page errors, and 0 request failures. Chromium emitted only screenshot-induced WebGL `ReadPixels` performance warnings.
- The skill-bundled standard client could not resolve Playwright from its external directory; the repository-local equivalent ran successfully against the same action file. Its canvas-only frames retain the known black WebGL capture limitation, so the dedicated full-page proof is the visual authority.
- The recovered repository still reports the entire `BLACK_SKY_BOUND_V2` directory as untracked, so a baseline Git diff is unavailable. No unrelated tracked files were changed.

Evidence:

- `artifacts/tutorial-prompts-v1/01-wasd-onboarding.png`
- `artifacts/tutorial-prompts-v1/02-attack-smoke-introduction.png`
- `artifacts/tutorial-prompts-v1/03-dodge-slow-time.png`
- `artifacts/tutorial-prompts-v1/04-dodge-charge-instinct.png`
- `artifacts/tutorial-prompts-v1/04b-dodge-charge-first-press.png`
- `artifacts/tutorial-prompts-v1/05-pause-controls-instincts.png`
- `artifacts/tutorial-prompts-v1/proof-state.json`

Deliberate boundaries:

- No parallel DOM tutorial overlay, second ability owner, second time-scale owner, or enemy-renderer-owned trigger path was introduced.
- Charge remains enabled by the current development ability defaults; the near-death event still records and consumes the canonical unlock receipt, ready for a future locked progression table.
- The profile contract retains tutorials and unlocks when a future New Game Plus flow reuses the profile, but this slice does not invent a New Game Plus launch UI or a full key-rebinding screen.

## 2026-07-16 - Production SFX Creation and Replacement Pass v1

Current request: replace at least three reachable synthesized audio placeholders with tangible original production files, integrate them through the existing Audio Director, preserve commercial-use provenance, attempt browser/desktop sound tooling, audition the results, and prove live playback. The Mama refinement called for a genuinely enormous reptilian animal with wet crocodilian/alligator throat anatomy, unstable multi-chamber resonance, a tearing central exhale, restrained upper rasp, and forest/flyover scale without copying any film or game roar.

Selected targets:

- `player.bite.snap`: third committed player combo action, `bite_attack`.
- `combat.enemy.hit.flesh`: accepted player damage against an enemy.
- `world.mama_wyvern.distant_roar`: existing Mama world-event `warning_roar` phase.

Implementation:

- Added `tools/audio/generate_production_sfx.py`, a seeded NumPy/Pillow authoring and evidence pipeline with no external samples.
- Rendered two 0.43-second mono bite variants, two 0.49-second mono flesh-impact variants, and one 5.2-second stereo Mama roar at 48 kHz.
- Preserved 24-bit masters separately from 16-bit runtime WAVs.
- Authored three complete Mama candidates and 24 preserved 24-bit stems. Candidate B, `candidate_b_wet_marsh_fury`, was selected; A was rejected as too stable/generic-dragon, and C as too bright/torn/scream-adjacent.
- The selected Mama mix layers throat-load inhale, body/lung rumble, multi-chamber warble, reptilian growl, wet gargle, tearing peak exhale, restrained rasp, and an asymmetric forest tail.
- Added `src/audio/audioAssetBank.js` for file preload/decode and explicit required-asset diagnostics.
- Updated `src/audio/audioDirector.js` and `src/audio/soundManifest.js` so the three cues use decoded file buffers, retain restrained runtime variation, and never silently fall back to synthesis.
- Moved the existing untouched-cue synth helpers to `src/audio/placeholderSynth.js`, preserving the 500 nonblank-line production-source gate.
- Added WAV/OGG MIME handling in `tools/launch.mjs`.
- Added `tests/productionSfx.test.mjs` and included it in `tests/runTests.mjs`.
- Added the complete target, process, stem, licensing, integration, verification, and assessment record in `docs/PRODUCTION_SFX_V1.md`.

Tool-use and failure register:

- AudioMass opened successfully in a real browser with no console errors.
- Two import attempts failed because its visible load command did not expose a controllable file chooser and no file input existed; switched to the local reproducible Python path.
- Audacity, FFmpeg, FFprobe, and SoX were unavailable.
- An early Mama tuning was discarded because broad upper-frequency energy obscured the body and wet throat structure.
- The A-B-C audition reel, all final runtime files, and selected-candidate stems completed Windows `System.Media.SoundPlayer` playback.
- The skill-bundled web-game client could not resolve Playwright from its external directory; the established repository-local equivalent passed.
- Playback/decode/output is proven, but this agent cannot claim human auditory perception. All three promoted effects remain `strong first pass` pending Felix's by-ear mix approval.

Validation:

```powershell
node tests/audioDirector.test.mjs
node tests/productionSfx.test.mjs
npm.cmd run test:loc
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
node artifacts/production-sfx-v1/proof.mjs http://127.0.0.1:5288/
node artifacts/production-sfx-v1/fail-loud-proof.mjs http://127.0.0.1:5288/
```

Status:

- Focused audio tests, LoC budget, app import, project-local standard browser client, live bite/flesh/Mama playback proof, and deliberate fail-loud proof pass.
- Headed Chromium decoded all five required files at 48 kHz, ran the real third combo hit from 28 to 6 target HP, entered the existing Mama `warning_roar` phase, and played the selected 5.2-second stereo roar with zero application console errors, page errors, or request failures.
- Deliberately blocking both bite files produced explicit asset/cue diagnostics and no synthesized fallback.
- `npm.cmd test` reaches one unrelated pre-existing failure in `tests/atmosphericCameraOverlay.test.mjs`: `screen-space overlay alpha should stay low for readability`.
- All other 76 test modules pass when that single atmospheric assertion is excluded. No atmospheric/rendering code was changed.

Evidence:

- `artifacts/production-sfx-v1/mama-roar-candidates/mama_roar_candidate_audition_reel.wav`
- `artifacts/production-sfx-v1/mama-roar-exploration.json`
- `artifacts/production-sfx-v1/mama-roar-candidate-contact-sheet.png`
- `artifacts/production-sfx-v1/waveform-spectral-contact-sheet.png`
- `artifacts/production-sfx-v1/01-bite-and-flesh-impact.png`
- `artifacts/production-sfx-v1/02-mama-roar-warning.png`
- `artifacts/production-sfx-v1/browser-proof-state.json`
- `artifacts/production-sfx-v1/fail-loud-proof-state.json`

Deliberate boundaries:

- No second manifest, duplicate gameplay trigger, renderer-owned audio path, paid service, downloaded recording, or copyrighted roar sample was introduced.
- The existing audio path has no positional panner/distance falloff. Mama's scale is authored into the stereo forest tail and ambience-bus mix; a general spatial-audio redesign remains out of scope.

## 2026-07-16 - AXIOM-authored opening scene and authoring workflow pass

Current request: use the live AXIOM IDE to author the BSB opening from the existing Blender layout reference, improve AXIOM where the authoring task exposed friction, and make the local AI more useful for the same level-design workflow.

Opening design:

- Translated the reference layout as rhythm rather than literal tracing: quiet scorched nest basin, left-bending S-route, central snag/blocker split, two-raider choke/reveal, eastern river-bank shortcut, and northern release into the existing map.
- Retained the canonical player spawn at `40,53`.
- Moved immediate hostiles and cross-faction acquisition overlaps out of the teaching space.
- Named and isolated the authored encounter roles:
  - `Ash-road choke guard` at `39,32`;
  - `Choke reserve` at `44,32`;
  - `Eastern bypass hunter` at `58,43`;
  - western husks and unrelated patrols moved outside the opening route envelopes.
- Cut a collision-clear eastern corridor south of the old rock shelf, relocated two blocking boulders, and added restrained fire-arrow breadcrumbs.
- Final authoring/runtime revision: `2522`.
- Final runtime hash: `d9090ea6962132b4acb19a3ecebd0061a6113b00a985ecbbc98691b6ccfe950e`.

Runtime playtest:

- Main route, continuous fresh-profile run:
  - no actor targeted the player at spawn or the first bend;
  - the choke first acquired the player at about `7.0s`;
  - both raiders were active by about `9.15s`;
  - the canonical combat tutorial appeared at the encounter.
- Eastern bypass, continuous fresh-profile run:
  - no actor targeted the player at spawn or the route split;
  - the bypass werewolf acquired the player at about `5.6s`;
  - the shortcut remained traversable;
  - the werewolf was the only actor targeting the player at the reveal.
- Standalone BSB loaded `/data/maps/axiom-first-escape.runtime-map.json` with revision `2522`, the expected hash, `fallbackUsed: false`, and zero browser console errors.

AXIOM improvements:

- Replaced generic `O/U/S` map dots with type-specific scenery shapes, colours, and actor/spawner glyphs.
- Replaced the newest-24 outliner truncation with all `320` authored records plus text search and scenery/unit/spawner filters.
- Verified the named bypass hunter filters to `1/320` and spawners to `3/320`.
- Made the editor bridge and SSE client use the active browser origin. `127.0.0.1:3007` now reports a live 41-tool bridge and makes no launcher requests to `localhost:3007`.
- Made Project Diary preserve the FileManager-declared AXIOM authoring owner and rank `data/bsb-v2/maps/first_escape.authoring.json` before runtime consumer code for map/layout intent.
- Filtered unrelated high-confidence constraints from map-intent evidence. A live `qwen3.5:9b` interpretation now recommends `local_handling`, stays within map/encounter systems, and does not invent lighting, napalm, weather, or player-death work.
- Fixed the authoring Playwright proof so all four mutable canonical files are snapshotted and restored in `finally`. A forced assertion failure and a passing rerun both retained exact before/after hashes.

Validation:

```powershell
cd AXIOM/apps/launcher
npm test
npm run test:bsb-v2-authoring
npm run test:workspace-context

cd _A_Projects/BLACK_SKY_BOUND_V2
npm test
```

Status:

- AXIOM unit suite passes.
- Guarded authoring browser proof passes with zero application console issues, zero page errors, and zero unclassified HTTP failures; canonical source/runtime hashes remain unchanged after the proof.
- Workspace-context browser proof passes with protected map hashes unchanged.
- Manual headed AXIOM author/save/bake operations and headed standalone BSB main/bypass playtests pass.
- The broad BSB suite retains the same unrelated baseline failure in `tests/atmosphericCameraOverlay.test.mjs`: `screen-space overlay alpha should stay low for readability`.

Evidence:

- `C:\Users\felix\Desktop\Automated_AI_Pipeline\.playwright-cli\axiom-forge-ux-after.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\.playwright-cli\axiom-diary-filtered-evidence-proof.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\.playwright-cli\axiom-loopback-origin-proof.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\.playwright-cli\bsb-opening-final-main-00.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\.playwright-cli\bsb-opening-final-main-03.png`
- `C:\Users\felix\Desktop\Automated_AI_Pipeline\.playwright-cli\bsb-opening-bypass-proof-03.png`
- `AXIOM/apps/launcher/output/playwright/axiom-bsb-v2-map-authoring-state.json`
- `AXIOM/apps/launcher/output/playwright/workspace-context/workspace-context-proof.json`

## 2026-07-16 - Lead product pass: Smoke Veil pursuit break

Product bet:

- The existing game already had atmosphere, authored encounter space, procedural combat, spawning, death/respawn, and tutorials, but the hatchling's most distinctive ability only slowed enemies.
- Converted dragon smoke into a tactical pressure-breaking verb: a human player can now cancel a committed attack, sever pursuit, reposition while enemies search the last-known location, and then re-enter a bounded chase.
- Kept the slice deliberately smaller than a full stealth system so it deepens the existing one-area survival loop instead of inventing a disconnected progression layer.

Implementation:

- Added the `dragon_smoke_veil_v1` tuning contract with dense-smoke threshold, body-contact reveal, 2.35-second search duration, reacquisition delay, search sweep radius, search speed, and interrupted-attack cooldown.
- Added explicit `search` state to `EnemyPressureAI`, including last-known position, current search waypoint, timers, break count, reason, and smoke-source provenance.
- Dense player-created dragon smoke now clears the target lock outside close contact, resets a committed attack before delayed damage can resolve, sends the enemy through bounded search waypoints, blocks immediate reacquisition while concealed, and returns to normal pressure after the window expires.
- Torch, napalm, raid-flame, and scenery smoke cannot grant player concealment.
- Added semantic `smoke_pursuit_broken` events, a one-time `PURSUIT BROKEN / MOVE BEFORE THEY FIND YOU` message, runtime-text observability, and a restrained broken-lock visual.
- Replaced the legacy rectangular `smoke_pop` WebGL fallback after browser screenshots exposed it as an opaque square; smoke onset now uses a soft expanding particulate bloom.
- Extracted smoke search, target selection, debug projection, and WebGL effect drawing into focused modules to retain the 500 nonblank-line production-source gate.
- Updated the published-map conflict test to search all raiders for a valid non-player faction conflict instead of assuming the first quiet-opening raider must have a nearby target.

Playtest result:

- A canonical raider spear-jab windup targeted the player at 1.02 tiles.
- Real RMB input emitted the normal seven-puff dragon plume.
- Smoke cancelled the windup with player HP unchanged at `80`, cleared the target, entered `search`, and registered exactly one break.
- Real A-key movement created `3.86` tiles of separation while the raider searched the old position without reacquiring.
- After the bounded window, the raider reacquired the player and resumed `alert` pressure.
- The proof completed with zero application errors, zero page errors, zero request failures, and zero unclassified console issues. Four OpenGL `ReadPixels` warnings were classified as Playwright WebGL screenshot-readback stalls.

Validation:

```powershell
node tests/smokeTactics.test.mjs
node tests/tutorialPromptSystem.test.mjs
node tests/locBudget.test.mjs
node tests/runtimeMapBootstrap.test.mjs
node artifacts/lead-product-pass/smoke-veil-proof.mjs http://127.0.0.1:5290/
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url http://127.0.0.1:5290/ --actions-file artifacts/tutorial-prompts-v1/standard-actions.json --iterations 2 --pause-ms 120 --screenshot-dir artifacts/lead-product-pass/smoke-veil-final-standard-client
```

Status:

- Every individual test module passes except the recorded unrelated atmospheric-overlay baseline.
- `npm.cmd test` reaches only `tests/atmosphericCameraOverlay.test.mjs`: `screen-space overlay alpha should stay low for readability`.
- The repository-standard browser client passes after the final visual repair.
- A short verified WebM proof was captured. FFmpeg, FFprobe, MoviePy, OpenCV, and imageio-ffmpeg were unavailable, so no claim is made that the footage is a polished edit.

Evidence:

- `artifacts/lead-product-pass/smoke-veil-proof/01-committed-attack.png`
- `artifacts/lead-product-pass/smoke-veil-proof/02-pursuit-broken.png`
- `artifacts/lead-product-pass/smoke-veil-proof/03-reposition-window.png`
- `artifacts/lead-product-pass/smoke-veil-proof/04-bounded-reacquisition.png`
- `artifacts/lead-product-pass/smoke-veil-proof/proof-state.json`
- `artifacts/lead-product-pass/smoke-veil-proof/smoke-veil-playtest.webm`

## 2026-07-16 - Embodied Hatch Start v1

Outcome:

- Fresh launches now begin as the egg instead of dropping directly into ordinary gameplay.
- A restrained canonical `MOVE` prompt appears after a quiet delay. Three separate movement-input edges rock, crack, and break the shell; holding a key cannot skip stages.
- The opening reveals cold moonlight through deterministic cracks and nine bounded shell fragments, drives the existing hatchling through a curl/brace/unfold pose, then releases into the authored rainy nest.
- Gameplay time, Mama scheduling, enemy simulation, tutorial activation, and unit spawners remain frozen until release. The existing `first_movement` tutorial then takes over without a second scenario or tutorial path.
- Reduced-motion mode removes opening shake and limits fragment travel while preserving the same lifecycle.

Implementation:

- Added an app-owned `black-sky-bound.embodied-hatch-start.v1` lifecycle and simulation gate.
- Reused canonical movement actions, the existing wyvern procedural-pose owner, renderer-neutral projections, one WebGL opening layer, the Audio Director, and runtime text.
- Added explicit synth-placeholder rock/crack/break cues with opening-specific muffle, ambience, breathing, and heartbeat mix diagnostics.
- Preserved a deliberate `?skipHatch=1` debug bypass for existing specialist proofs; normal launches do not bypass the opening.
- Added focused lifecycle, pose, audio, renderer hierarchy, runtime projection, and line-budget coverage.

Browser result:

- Fresh launch began at `inside_egg`, accepted exactly three edges, exposed nine WebGL fragments, and released at `emergenceProgress: 1`.
- Held W input remained at one accepted edge after 0.9 seconds.
- World-event elapsed time, tutorial active time, gameplay time, and all three spawner cooldowns stayed unchanged through the release frame.
- Audio Director observed `opening.egg.rock`, `opening.egg.crack`, and `opening.egg.break`.
- The existing movement tutorial activated after release, and real W input moved the hatchling from `(40.5, 53.5)` to `(40.5, 48.4)`.
- Normal and reduced-motion passes completed with zero console errors, page errors, request failures, or HTTP failures.

Validation:

```powershell
node tests/openingSequence.test.mjs
node tests/audioDirector.test.mjs
node tests/webglRendererHierarchy.test.mjs
node tests/locBudget.test.mjs
node -e "Promise.all([import('./src/app.js'), import('./src/render/backends/webgl/layers/WebGLOpeningLayer.js'), import('./src/projection/creatures/wyvernOpeningPose.js')])"
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url http://127.0.0.1:5292/ --iterations 1 --pause-ms 250 --headless true --screenshot-dir artifacts/embodied-hatch-start-v1/client-smoke --actions-file artifacts/embodied-hatch-start-v1/actions.json
node artifacts/embodied-hatch-start-v1/proof.mjs http://127.0.0.1:5292/
```

Status:

- All 78 independently executed non-baseline test files pass.
- `npm.cmd test` retains only the previously recorded unrelated failure in `tests/atmosphericCameraOverlay.test.mjs`: `screen-space overlay alpha should stay low for readability`.
- The installed reusable web-game client was attempted first but could not resolve its external `playwright` package. The project-local equivalent completed successfully, followed by the stricter dedicated proof.

Evidence:

- `artifacts/embodied-hatch-start-v1/01-inside-egg.png`
- `artifacts/embodied-hatch-start-v1/04-second-crack.png`
- `artifacts/embodied-hatch-start-v1/06-mid-emergence.png`
- `artifacts/embodied-hatch-start-v1/08-existing-movement-tutorial.png`
- `artifacts/embodied-hatch-start-v1/10-reduced-motion-mid-emergence.png`
- `artifacts/embodied-hatch-start-v1/proof-state.json`

## 2026-07-16 - Embodied Hatch Opening v2

Outcome:

- Rebuilt the first proof into a 15.7-second embodied birth sequence requiring six separate canonical movement edges.
- Internal struggle now produces directional shell movement, 33 branching cracks, 10 restrained cold-light shafts, stronger audio/muffle transitions, and 14 non-uniform crown fragments.
- Added a real world-space egg at the authored spawn. Eleven irregular back/foreground shell pieces bracket the player in depth, occlude the lower body during emergence, separate into broken remains, and persist after release.
- Reworked the procedural hatch pose into anatomical stages: tight curl, crown lift, head exit, shoulder/forelimb brace, torso crawl, hips/tail clearance, and newborn recovery.
- The canonical player transform now exits the shell during the sequence and follows a collision-verified up-right path, preventing both visual snap-back and a blocked post-hatch landing.
- Camera zoom eases from intimate trapped framing to the normal gameplay view; reduced-motion mode suppresses impact impulses without removing any lifecycle beat.

Playtest-driven repairs:

- Narrowed and softened the first light-ray pass after headed inspection showed broad graphic wedges obscuring the egg.
- Faded screen-space fracture treatment earlier so the physical head emergence receives a clean world-space moment.
- Brightened shell bone tones and increased persistent piece separation after the first exterior reveal read too faintly and uniformly.
- Increased the body egress distance after release still left the torso inside the shell.
- Redirected the final exit by roughly 25 degrees after map collision checks proved the straight-right landing overlapped the authored boulder at `(44,54)`.

Browser result:

- Dedicated Playwright proof completed 14 normal checkpoints plus one reduced-motion checkpoint with zero console, page, request, or HTTP errors.
- Release occurred at `elapsedReal: 15.667`; gameplay time, Mama-event elapsed time, tutorial active time, and spawner clocks stayed frozen through release.
- Physical egg stats reported one source, eleven shell pieces, and 204 world-depth primitives.
- Canonical player position moved from `(40.5, 53.5)` to `(42.72, 52.46)` during emergence. Real post-release W input then moved the player to `(42.72, 49.38)`.
- The independent project-local browser client also reached `released` with the egg still visible and no error artifact. Its WebGL canvas snapshot path produced a black capture, so visual acceptance uses the dedicated canvas screenshots rather than that client image.

Validation:

```powershell
node tests/openingSequence.test.mjs
node tests/audioDirector.test.mjs
node tests/webglRendererHierarchy.test.mjs
node tests/groundedWyvernProportions.test.mjs
node tests/locBudget.test.mjs
node tests/runTests.mjs
node artifacts/embodied-hatch-opening-v2/proof.mjs http://127.0.0.1:5177/
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url http://127.0.0.1:5177/ --iterations 1 --pause-ms 180 --headless true --screenshot-dir artifacts/embodied-hatch-opening-v2/client-smoke --actions-file artifacts/embodied-hatch-opening-v2/actions.json
```

Status:

- All 78 independently executed non-baseline test modules pass.
- `node tests/runTests.mjs` retains only the previously recorded unrelated failure in `tests/atmosphericCameraOverlay.test.mjs`: `screen-space overlay alpha should stay low for readability`.
- Normal and reduced-motion browser proofs pass the real interaction, screenshot, runtime-state, timer-gating, renderer-stat, control-handoff, and zero-error gates.

Evidence:

- `artifacts/embodied-hatch-opening-v2/05-fifth-struggle.png`
- `artifacts/embodied-hatch-opening-v2/07-shell-opening-egg-reveal.png`
- `artifacts/embodied-hatch-opening-v2/08-head-emergence.png`
- `artifacts/embodied-hatch-opening-v2/09-shoulders-torso-emergence.png`
- `artifacts/embodied-hatch-opening-v2/10-hips-tail-emergence.png`
- `artifacts/embodied-hatch-opening-v2/11-newborn-settling.png`
- `artifacts/embodied-hatch-opening-v2/12-released-shell-remains.png`
- `artifacts/embodied-hatch-opening-v2/15-reduced-motion-emergence.png`
- `artifacts/embodied-hatch-opening-v2/proof-state.json`

## 2026-07-16 - Hatch Opening Sensory Polish v2.1

Outcome:

- The opening now carries six authored exterior sound beats: delayed thunder, a muffled husk gargle, distant werewolf howl, raider alarm, Mama's answering roar, and the husk returning after the hatchling is exposed.
- Sound cues are anchored after deliberate input or shell break, so browser audio unlock happens before the first atmospheric beat instead of silently losing pre-input sounds.
- Opening audio now retains a bounded event history. The Audio Director drains every unseen event, preserving cue order even when deterministic tests or slow frames cross several thresholds at once.
- The same husk voice changes from opaque shell noise to a much clearer world threat as the low-pass opening mix recedes.
- Storm lightning now schedules one distance-delayed thunder report per flash cluster rather than playing thunder on the visual flash.
- Early emergence now pulls the neck with the head and constrains their separation in two axes, removing the detached stretched-neck read without losing newborn strain.

Audio implementation:

- Mama continues to use the required production file `assets/audio/production/mama_wyvern_distant_roar_01.wav`.
- Added distinct bounded procedural placeholders for thunder roll, raider shout, werewolf howl, and husk gargle; cue provenance, reason, perspective, opening phase, and muffle-at-play are exposed in runtime diagnostics.
- Extracted the lightning/thunder relationship and opening audio math into focused helpers, keeping `src/audio/audioDirector.js` at the 500-line production cap.

Playtest-driven repair:

- The first browser pass showed the repeated husk voice was still too filtered to read as exterior. The emergence exposure curve was accelerated while leaving early storm/husk/howl cues at full `0.8` shell muffling.
- Final captured values are Mama `0.62`, exposed husk `0.334`, and early head-neck offset gap `0.196`.
- Live browser lightning proof records thunder `973 ms` after its flash.

Validation:

```powershell
node tests/audioDirector.test.mjs
node tests/openingSequence.test.mjs
node tests/groundedWyvernProportions.test.mjs
node tests/lightningSceneFlash.test.mjs
node tests/mamaWyvernWorldEvent.test.mjs
node tests/locBudget.test.mjs
node artifacts/embodied-hatch-opening-v2/proof.mjs http://127.0.0.1:5177/
node artifacts/scale-audit-fire-emitters-v0/web_game_playwright_client.mjs --url http://127.0.0.1:5177/ --iterations 1 --pause-ms 0 --screenshot-dir artifacts/embodied-hatch-opening-v2/independent-client --actions-file artifacts/embodied-hatch-opening-v2/independent-actions.json
```

Status:

- All 78 independently executed non-baseline test modules pass.
- `npm test` retains only the previously recorded unrelated failure in `tests/atmosphericCameraOverlay.test.mjs`: `screen-space overlay alpha should stay low for readability`.
- Dedicated normal and reduced-motion browser proof passes 15 checkpoints with zero console, page, request, HTTP, decode, or audio errors.
- The independent browser client reaches `released`, records all six soundscape beats, confirms Mama's file source, and reports zero audio errors.

Evidence:

- `artifacts/embodied-hatch-opening-v2/03-first-struggle.png`
- `artifacts/embodied-hatch-opening-v2/07-shell-opening-egg-reveal.png`
- `artifacts/embodied-hatch-opening-v2/08-head-emergence.png`
- `artifacts/embodied-hatch-opening-v2/09-shoulders-torso-emergence.png`
- `artifacts/embodied-hatch-opening-v2/proof-state.json`
- `artifacts/embodied-hatch-opening-v2/independent-client/state-0.json`

## 2026-07-16 - Procedural SFX and Sound Controls Pass

Implementation:

- Removed the legacy placeholder synthesizer and all dead placeholder asset paths from the live sound manifest.
- Replaced the square-modulated heartbeat with an irregular organic double-thump rendered into a low-frequency loop buffer; the loop creates no live oscillator and explicitly reports `tonal: false`.
- Added layered procedural forest air, calm/strained airway cycles, shell rocking, shell fractures, shell collapse/debris, storm thunder, predator howl, husk gargle, human calls, air gestures, and body impacts under the explicit `procedural_sfx` source contract.
- Added persistent `MASTER`, `WORLD & WEATHER`, and `CREATURES & COMBAT` controls to the existing pause/settings flow, with ten-percent keyboard increments and canonical profile storage.
- Audio bus diagnostics now expose the user mix and the scaled master, ambience/music, and effects-family bus values.

Focused validation:

```powershell
node tests/proceduralAudio.test.mjs
node tests/audioDirector.test.mjs
node tests/tutorialPromptSystem.test.mjs
node tests/productionSfx.test.mjs
node tests/openingSequence.test.mjs
node tests/performanceAndPause.test.mjs
node tests/webglRendererHierarchy.test.mjs
node tests/architectureBoundary.test.mjs
node tests/locBudget.test.mjs
node artifacts/procedural-audio-controls-v1/proof.mjs http://127.0.0.1:5177/
node artifacts/embodied-hatch-opening-v2/proof.mjs http://127.0.0.1:5177/
```

Status:

- All 79 independently executed non-baseline test modules pass.
- `npm test` retains only the previously recorded unrelated failure in `tests/atmosphericCameraOverlay.test.mjs`: `screen-space overlay alpha should stay low for readability`.
- Desktop and `760x600` browser proofs pass with zero console, page, request, HTTP, decode, or audio errors.
- Browser evidence proves `0.9` master/ambience/effects values reach the expected scaled buses and survive reload.
- The complete 15-checkpoint normal/reduced-motion hatch proof still passes after the procedural SFX migration.

Evidence:

- `artifacts/procedural-audio-controls-v1/01-desktop-sound-controls.png`
- `artifacts/procedural-audio-controls-v1/02-desktop-adjusted-mix.png`
- `artifacts/procedural-audio-controls-v1/03-compact-sound-controls.png`
- `artifacts/procedural-audio-controls-v1/proof-state.json`
- `artifacts/embodied-hatch-opening-v2/proof-state.json`

## 2026-07-20 - Smoke Instinct Transition v1 (in progress)

Current objective:

- Remove smoke from the hatchling's Level 1 starting kit and tutorial prompts.
- Reuse the embodied hatch-opening lessons for a deterministic Level 1-to-2 transition vignette: off-screen Mama impact, camera/debris shock, scattering raider silhouettes, a rolling blackout-smoke front, three deliberate `EXHALE` inputs, and a final radial smoke burst that unlocks the instinct.
- Hand control back inside Ash Road Threshold with a one-time radial-smoke escape prompt and an authored hunting-party pressure beat.

Canonical owners and divergent paths:

- `src/data/abilities.js`, `src/data/abilityUnlockEvents.js`, and player-profile unlock receipts own smoke availability. The current stale path marks the directionally controlled smoke action as unlocked by default.
- `src/game/tutorialRuntime.js` and `src/data/tutorialCues.js` own tutorial sequencing. The current stale first-combat cue requires both melee and smoke in Level 1.
- `src/app.js` owns runtime-map transition application and simulation gating. The new transition lifecycle will attach here without introducing a second map loader.
- The existing opening lifecycle/projection/WebGL pattern remains the architectural reference, while the smoke vignette receives its own bounded state and projection instead of overloading egg state.
- The existing smoke system remains the gameplay smoke source owner. Its forward-plume-only emission path will be split into radial-burst and later targeted-plume modes.

Constraints:

- Night lighting throughout: cold moonlight, torch scatter, ash and smoke; no sunlight treatment.
- No visible Mama silhouette in the landing beat.
- Preserve AXIOM-authored map source as canonical and regenerate the BSB runtime bake for any encounter placement edits.
- Preserve reduced-motion semantics, profile persistence, runtime observability, the 500 nonblank-line production-source limit, and real Playwright proof.

Validation plan:

- Focused progression, tutorial, smoke emission, transition lifecycle, runtime-map, renderer-hierarchy, audio, and line-budget tests.
- Real browser playthrough across the transition with separate exhale edges, screenshots at impact/smoke/each exhale/release, runtime-state capture, and console/page/request error classification.

Implementation checkpoint:

- Canonical progression now receipt-gates radial `smoke_burst`; prior profiles lose legacy default smoke without that receipt, while directional `smoke_spit` stays wired but later-locked.
- Level 1 teaching is movement/melee/dodge/charge only; the first combat cue no longer references or waits for smoke.
- The Level 1-to-2 scene now has dedicated app-owned state, projection, WebGL layer, audio bridge, and embodied pose, culminating in a real radial smoke-system emission and persisted unlock.
- AXIOM's canonical `second_approach.authoring.json` is revision 5 with a five-raider smoke-screen formation; the BSB runtime map was regenerated from that source and now contains eight placed threats.

Validation completed:

- Focused passes: `smokeAwakening.test.mjs`, `tutorialPromptSystem.test.mjs`, and `wyvernInputComboSmokeSpit.test.mjs`.
- The full BSB suite passes through all feature-adjacent tests and stops only at the previously known `atmosphericCameraOverlay.test.mjs` readability-alpha baseline; all post-baseline renderer, hierarchy, architecture-boundary, and LOC-budget modules pass when run separately.
- AXIOM `bsb-v2-map-authoring.test.mjs` passes; a fresh canonical rebuild byte-matches the committed runtime JSON at revision 5 with 6 raiders / 8 total threats.
- Real Chromium proof at 1280×720 covers Level 1 lock, live transition, impact/scatter/smoke/exhale stages, three separate RMB edges, persisted radial unlock, Level 2 escape cue, six-raider pressure, first gameplay radial use, and repeat-playthrough skip.
- Browser telemetry: zero console errors, zero page errors, zero failed requests. Screenshots and runtime evidence live under `artifacts/smoke-instinct-transition-v1/`.

## 2026-07-20 - Smoke instinct adversarial playtest and projection-truth audit (in progress)

Objective:

- Adversarially replay the locked Level 1, transition awakening, unlocked Level 2, compact viewport, reduced-motion, and remembered-playthrough paths in real Chromium.
- Find and repair bugs in the smoke-transition slice, with particular attention to placeholder heuristics, inactive state masquerading as completed state, ungrounded vignette elements, and render layers that survive beyond their canonical lifecycle.
- Treat runtime state, projection state, and visual staging as separate surfaces: story presentation may stylise canonical facts, but must not invent them.

Initial audit hypotheses:

- The disabled awakening state's completion-looking booleans and derived clear-air pocket may report actions that never occurred.
- Raider silhouettes may be projected from fixed presentation constants without provenance from the actual destination-map actor roster.
- Runtime debug actor output may retain a stale `kind` field that no canonical actor view owns.

Validation plan:

- Run the develop-web-game shared client (or an exact project-local copy if its global Playwright import cannot resolve), followed by the dedicated project proof harness.
- Capture screenshots plus `render_game_to_text` at locked, impact, smoke-front, exhale, release, gameplay-smoke, and repeat-playthrough checkpoints.
- Record console, page, request, HTTP, rendering, reduced-motion, and compact-viewport evidence; run focused and broad automated tests after repairs.

Completion checkpoint:

- Reclassified never-run smoke-awakening state as `inactive` and removed every completion-looking sentinel: accepted inputs, clear-air pocket, unlock/emission flags, release timestamp, and release count now remain empty/false until the scene actually produces them.
- Replaced unconditional four-raider screen projection with bounded staging sourced from unique living raiders in the destination runtime. Each silhouette carries actor/team/type/torch provenance; a no-raider runtime now projects no raiders.
- Removed stale undefined `actor.kind` output from render/debug projections; `actor.type` remains canonical.
- Replaced the “any transition while smoke is locked” heuristic with AXIOM-authored `arrivalSequenceId: smoke_instinct_awakening`, preserved through authoring validation, runtime bake revision 2523, BSB loader, scenario request, and transition receipt.
- Fixed the remembered-playthrough camera seam by establishing the new map's scene/player camera immediately even when the already-owned instinct causes the vignette to skip.

Validation completed:

- Focused smoke awakening, tutorial, input/combat, runtime-map, transition, pause/performance, architecture-boundary, renderer-hierarchy, and LOC gates pass.
- AXIOM `bsb-v2-map-authoring.test.mjs` passes; a fresh runtime build byte-matches the committed first-map bake at revision 2523.
- All 80 BSB test modules other than the pre-existing atmospheric-overlay readability baseline pass independently. `npm test` still stops only at `atmosphericCameraOverlay.test.mjs` (`screen-space overlay alpha should stay low for readability`).
- The exact develop-web-game client completes interaction and text-state capture after being copied project-local for Playwright resolution. Its WebGL backing-store screenshot remains opaque black, so visual proof uses full-page Playwright capture.
- `artifacts/smoke-instinct-debug-v1/proof.mjs` passes desktop first-run, early/cooldown input rejection, first radial emission, Level 2 gameplay use, persisted repeat skip, immediate repeat camera, `760x600`, and reduced-motion checks with zero console, page, request, or HTTP issues.
- Final evidence is stored in `artifacts/smoke-instinct-debug-v1/proof-state.json` and screenshots `01-level1-locked.png` through `14-compact-reduced-prompt.png`.

## 2026-07-21 - Procedural Tree DNA v1

Outcome:

- Replaced the fixed tree rectangle/triangle geometry with deterministic spline-grown trunks, roots, branches, twigs, and seeded foliage clusters.
- Added Old Pine, Silver Birch, and Ancient Oak recipes plus per-tree seed, age, health, season, height, trunk radius, taper, bend, twist, branching, foliage, crown, roots, moss, and colour intent.
- Preserved existing authored maps through boundary migration: legacy `birch_tree` becomes a canonical live `tree` with `silver_birch` DNA, while legacy pine trees receive deterministic defaults.
- Added Map Forge Tree DNA controls and semantic operations, the `EDITOR.procedural.trees` API, `axiom_tree_apply` MCP tool, and the local-agent `tree_action` lane.
- Deleted the stale `treeGeometry_OLD.js` path; WebGL now only triangulates the renderer-neutral procedural definition and publishes generated tree/spline/foliage counts.

Validation:

- AXIOM unit suite and Tree DNA authoring tests pass.
- Focused BSB procedural tree, scene-object, material, world-depth, ambient-particle, and line-budget tests pass.
- The broad BSB suite reaches only the previously recorded unrelated `atmosphericCameraOverlay.test.mjs` readability-alpha baseline.
- Real Chromium BSB proof renders three species as 3 procedural trees, 45 splines, and 34 foliage clusters with zero unclassified browser issues.
- Real Chromium Axiom proof routes natural language through `tree_action` and `axiom_tree_apply`, then exercises direct age/damage/regrow API receipts; reload restores the original 107-tree document and all canonical maps remain byte-identical.

Evidence:

- `artifacts/procedural-tree-dna-v1/01-species-lineup.png`
- `artifacts/procedural-tree-dna-v1/02-ancient-oak-focus.png`
- `artifacts/procedural-tree-dna-v1/proof-state.json`
- `AXIOM/apps/launcher/artifacts/procedural-tree-dna-v1/01-axiom-tree-dna-inspector.png`
- `AXIOM/apps/launcher/artifacts/procedural-tree-dna-v1/proof-state.json`

## 2026-07-21 - Procedural Undergrowth DNA v1

Outcome:

- Migrated all `fern_patch`, `forest_shrub`, `smouldering_fern`, and `smouldering_bramble` records into one runtime procedural family without forcing canonical map rewrites.
- Added Wood Fern, Forest Shrub, and Ember Bramble recipes plus compact seed, age, health, season, height, spread, density, stems, leaf size, curl, lean, irregularity, ground cover, burn, char, and colour intent.
- Added deterministic fern-frond, shrub-stem, and bramble-vine splines with generated leaf and ground clusters; removed the four fixed WebGL geometry builders.
- Preserved smouldering emitter/smoke/light ownership and nonblocking collision behavior while adding procedural ember nodes and render diagnostics.
- Added Map Forge Undergrowth DNA controls, `EDITOR.procedural.undergrowth`, `axiom_undergrowth_apply`, and a local-agent `undergrowth_action` lane.

Validation:

- Axiom's full launcher test suite passes, including legacy normalization, semantic family operations, runtime bake shape, and age parameter preservation.
- Focused BSB procedural-undergrowth, scene-object, emitter, visibility, world-depth, renderer-hierarchy, and line-budget tests pass.
- The full BSB suite reaches only the previously recorded unrelated `atmosphericCameraOverlay.test.mjs` readability-alpha baseline; all post-baseline renderer and architecture tests pass separately.
- Real Chromium BSB proof renders three procedural species as 3 objects, 40 stem splines, 172 leaf clusters, and 5 ember nodes through WebGL with zero console, page, HTTP, or request errors.
- Real Chromium Axiom proof routes “Create a wild forest shrub at tile 30, 25” through `undergrowth_action` and MCP, applies direct age/damage/regrow receipts, shows the selected DNA inspector and dirty state, then reloads the original document. Protected canonical maps remain byte-identical.

Next slice:

- Human scene painting UX v1: radius, falloff, density, species mix, deterministic preview, drag batching, collision-aware placement, preview/commit, and one undo receipt over `EDITOR.procedural.undergrowth`.

## 2026-07-21 - Procedural Geology DNA v1

Outcome:

- Added Fieldstone, Fractured Basalt, and Weathered Outcrop recipes over compact seed, palette, scale, height, angularity, strata direction/density, erosion, crack density, fracture, moss, wetness, and colour intent.
- Added deterministic renderer-neutral hulls, facets, strata polylines, crack polylines, moss patches, and wet edges; removed the fixed WebGL `buildBoulder` lit-detail path.
- Normalized legacy `type: boulder` records at the Axiom and BSB boundaries without requiring canonical map rewrites.
- Preserved the established 2x2 blocking collision footprint, `stone_moss` material, occlusion role, authored ids, and runtime-map bake contract.
- Added Map Forge Geology DNA controls, `EDITOR.procedural.geology`, `axiom_geology_apply`, and a local-agent `geology_action` lane.
- Added semantic create, set-formation, set-scale, randomise, erode, fracture, moss, weather, patch, and deterministic collision-aware cluster operations. One cluster commits in one authoring revision with requested/created/skipped evidence.

Validation:

- Axiom's complete launcher suite passes, including deterministic DNA, legacy migration, semantic single/cluster operations, geometry-free runtime bake, MCP availability, and local-agent lane coverage.
- Focused BSB procedural-geology, scene-object, collision, material, visibility, runtime-map, renderer, architecture-boundary, and LOC tests pass.
- The full BSB runner reaches only the previously recorded unrelated `atmosphericCameraOverlay.test.mjs` readability-alpha baseline; all post-baseline tests pass separately.
- The mandated shared web-game client completed real input and text-state capture. Its known WebGL backing-store screenshot remains black; dedicated Playwright screenshots were visually inspected instead.
- Real Chromium BSB proof renders three formations as 3 procedural rocks, 35 hull points, 26 strata segments, 28 crack segments, and 10 moss patches with zero console, page, request, or HTTP issues.
- Real Chromium Axiom proof routes a basalt request through `geology_action` and MCP, applies erode/fracture/moss receipts, creates five Weathered Outcrops in one collision-aware cluster receipt, displays the selected Geology DNA inspector, then reloads the original source.
- Both Axiom authoring maps and both BSB runtime maps retain their exact protected SHA-256 hashes.

Evidence:

- `artifacts/procedural-geology-dna-v1/01-formation-lineup.png`
- `artifacts/procedural-geology-dna-v1/02-fractured-basalt-focus.png`
- `artifacts/procedural-geology-dna-v1/proof-state.json`
- `AXIOM/apps/launcher/artifacts/procedural-geology-dna-v1/01-axiom-geology-dna-inspector.png`
- `AXIOM/apps/launcher/artifacts/procedural-geology-dna-v1/proof-state.json`

Next slice:

- Unified Procedural Scene Painting UX v1: extract a shared deterministic brush kernel and add family-aware Tree, Undergrowth, and Geology modes with footprint-honest preview, recipe mixes, one-revision batch commit, and receipt-guarded undo.

## 2026-07-27 - Smoke instinct first-beat diagnostic playtest

Current request:

- Properly playtest and visually analyse the first half of the scene-one to scene-two smoke unlock, stopping before redesigning the destination breathing/reveal segment.

Observed runtime truth:

- The map swaps to `axiom_second_approach` before the impact beat starts, so scenario-one geography is absent from the entire landing, raider, and smoke sequence.
- The player is recreated at the destination spawn facing east instead of retaining the north-facing scene-one endpoint.
- Impact debris is an 18-triangle screen-space cluster confined to the upper-right of the destination view; it travels downward but does not establish one offscreen-north landing source across the scene.
- The first raider frame appears only in `scatter`, approximately 1.05 seconds after impact. Four screen-space stick silhouettes are selected from the nearest living destination-map raiders, ignore their authored world positions, and travel outward rather than charging north toward Mama.
- Smoke coverage begins during `impact`, grows during `scatter`, and reaches the explicit `smoke_roll` phase only after the raiders have already started fleeing. This weakens the requested cause-and-effect order.
- The dedicated vignette is therefore internally consistent with its existing `impact -> scatter -> smoke_roll` contract, but that contract encodes the wrong story beat and wrong map ownership.

Recommended bounded repair:

- Run a pre-transition `impact -> authored_raider_charge -> mama_smoke_cover` segment while the first runtime map and north-facing player transform remain live.
- Use authored first-map raider ids and explicit world-space path nodes toward an offscreen-north landing anchor; temporarily gate their ordinary combat AI during the authored charge.
- Emit rumble and a broad north-to-south debris cascade from that anchor, then let Mama's smoke enter from the north only after the charge reads.
- Delay the actual map load until scenario one is substantially obscured, preserving the existing destination breathing/reveal work for the requested second pass.

Validation:

- Real Chromium at `http://127.0.0.1:5177/?skipHatch=1`, 1440x900, project-local Playwright 1.61.0.
- Eight screenshots and matching `render_game_to_text()` captures were inspected under `artifacts/playtest/smoke-awakening-first-beat-2026-07-27/`.
- No page errors or application console errors. Chromium emitted only expected `ReadPixels` GPU-stall warnings while screenshots were captured.
- Diagnostic only: no gameplay source, map, timing, or test behavior changed in this pass.

## 2026-07-27 - Smoke awakening handoff v2 implementation

Current request:

- Repair the second half of the first transition so Smoke Attack is earned during the Level 1-to-2 breathing scene, the player re-emerges south-to-north through a held blackout, and the subsequent raider charge teaches a genuine smoke line-of-sight break followed by escape.

Implemented runtime truth:

- Smoke Attack and its awakening receipt are now run-scoped. Legacy saved copies are stripped during profile normalization, profile capture excludes them, and a transient run snapshot carries live abilities across later map transitions.
- The destination arrival now starts in a dedicated 2.6-second `blackout_hold` phase at 98.5% full-screen smoke opacity. Three deliberate exhale edges progressively open the view; the third grants Smoke Attack without prematurely deploying tactical smoke.
- The outgoing first-map smoke threshold increased from 0.92 to 0.995 and the renderer's full-screen smoke alpha increased to 0.98 before handoff.
- AXIOM's second-region source now owns a south-edge spawn at `(24, 31)` facing north and a five-raider pursuit line at y 22-24. Both runtime maps were regenerated through AXIOM's canonical builder.
- The post-release EXHALE cue no longer completes on input acceptance alone. It completes only after the semantic `smoke_pursuit_broken` event, then hands off to `RUN NORTH BEFORE THEY FIND YOU`. Both smoke teaching cues are run-scoped so they replay when the ability is earned in a future run.

Validation so far:

- Focused BSB smoke-awakening, tutorial, runtime-map, authored-transition, map-transition, and smoke-tactics tests pass.
- AXIOM `bsb-v2-map-authoring.test.mjs` passes, including exact second-source-to-runtime bake equivalence.
- Full-suite and real-browser visual/playtest evidence are pending.

Final validation:

- Real Chromium completed the full stopped-loop transition with actual RMB and W input at 1440x900. Twelve fresh frames and matching runtime state were captured under `artifacts/playtest/smoke-awakening-handoff-v2/`.
- Inspected visual sequence: outgoing map almost completely black at 0.982 pre-threshold coverage; destination geometry absent during the 0.985-opacity hold; progressive pocket values 0.14, 0.36, and 0.62; north-side five-raider line charging south; explicit `BREAK SIGHT · THEN RUN NORTH`; visible pursuit-break markers; and bright `RUN NORTH BEFORE THEY FIND YOU` feedback during northward movement.
- Runtime proof: Level 1 smoke locked even after seeding a legacy persisted receipt; destination spawn `24.5,31.5` at rotation `-1.571`; Smoke Attack absent through breaths one and two and granted on breath three; five authored raiders acquired and then entered search; player moved 3.1 tiles north inside the search window; reload returned to a fresh locked Level 1.
- Browser issues: zero console errors, page errors, and request failures.
- Focused BSB smoke-awakening, tutorial, runtime-map, authored-transition, map-transition, and smoke-tactics tests pass after the final visual tune.
- Full AXIOM `npm test` passes. Both AXIOM sources compare exactly with their regenerated BSB runtime-map JSON.
- Full BSB `npm test` remains blocked by the unrelated pre-existing `atmosphericCameraOverlay.test.mjs` alpha baseline. An explicit all-tests-except-that run additionally exposes pre-existing production LoC budget failures in `src/app.js` and `src/debug/runtimeText.js`; all other BSB test files pass.
- `self_validate_change` passes all mandatory checks in `artifacts/playtest/smoke-awakening-handoff-v2/self-validation.json`.

Deferred by design:

- Global hatchling health/regeneration, enemy speed, and anti-run-past pressure remain a separate balance slice so this transition proof is not confounded by unrelated combat tuning.

## 2026-07-27 - Vulnerable Hatchling Pressure v1 and dormant transition raiders

Current request:

- Make the freshly hatched wyvern feel vulnerable enough that head-on combat and running directly through enemies are losing decisions, using subjective browser playtesting to tune the connected variables.
- Keep the two authored Mama-charge raiders completely absent before the transition cue, then make them read as entering from behind the player under a slightly tighter impact camera.

Implemented runtime truth:

- Player health is 56. Spear/torch attacks deal 12/10 damage, with readable wind-ups, stronger hit pressure, bounded hostile body-contact slowing, and attack tracking through wind-up before the strike locks.
- Raider approach speed is 3.1 against player speed 4.65, but hatchling stamina is a constrained 60 with a 1.42 sprint multiplier, 30-per-second drain, and 24-cost dodge. The player can escape through committed movement but cannot safely body-run through a line.
- Health recovery waits 9 seconds, ramps slowly, is suppressed while sprinting/acting, and is fully re-armed while a living hostile AI directly pursues or attacks the player.
- Reserved transition placements no longer spawn actors, render projections, lights, colliders, or AI during normal Level 1 play. They materialise once from their AXIOM-authored records when the departure sequence begins and immediately enter their authored tracks.
- AXIOM owns the 3.25 impact zoom and behind-player track starts. The canonical first-map runtime bake is asserted equal to the AXIOM source.

Subjective and measured playtest result:

- Baseline single-raider idle lethality was 9 hits / 13.45 seconds; final is 5 hits / 7.35 seconds. The raider now feels dangerous without becoming an instant or unreadable kill.
- Baseline two-raider idle lethality was 6.1 seconds; final is about 3.8 seconds. Trading into a pair is decisively losing.
- A 2.4-second straight sprint through two spear raiders changed from 0 damage and 10.1 tiles of progress to 24 of 56 health lost, 7.51 tiles, and zero stamina. Contact visibly holds the hatchling in the weapon line before both spears land.
- An early lateral dodge followed by continued diagonal escape takes 0 damage and still gains about 9.84 tiles north. The successful lesson is therefore route commitment, not dodge-button immunity.
- Active pursuit recovery changed from 5.225 health regained to zero; after a full safe delay the same scenario regains 1.695 health, preserving slow recovery without erasing pursuit pressure.
- Before the scene, both reserved raider bindings and rendered actors are absent. At impact exactly two authored actors exist at zoom 3.25 but remain outside the visible frame; during the charge the lead spear enters from the bottom edge, reading as emergence from behind rather than a pop-in.

Validation:

- The final real Chromium gate passed twice consecutively at 1440x900 with zero console errors, page errors, or request failures. Evidence and inspected frames live under `artifacts/playtest/vulnerability-pressure-v1/final/`.
- The complete smoke-awakening browser handoff still passes with 12 captures and zero browser issues, preserving the blackout, breaths, unlock timing, Level 2 reveal, smoke LoS break, and run-north lesson.
- All 83 BSB tests outside the two known repository baselines pass. Full `npm test` reaches the unrelated pre-existing atmospheric overlay alpha assertion. The LoC gate now reports only the pre-existing `src/app.js` 532-line excess.
- Full AXIOM launcher `npm test` passes, including exact first- and second-map source/runtime bake equivalence.

## 2026-07-28 - Illumination-primary rendering v1

Current request:

- "Refactor the lighting system so illumination is the primary quantity and darkness is represented only by the absence of illumination. Remove any global darkness overlay from the lighting model, preserving atmospheric effects as a separate post-process. Validate visually with side-by-side captures in the same scenes under torchlight, moonlight, rain, and lightning, ensuring light reveals the world rather than punching holes through a black layer."

Implemented runtime truth:

- Added a WebGL-owned RGB illumination framebuffer and a fullscreen `scene colour × illumination` shader composite. The field starts from low profile-owned ambient RGB, adds bounded local/scene light contributions, clamps at one, and hands the illuminated scene target back to the central post-process pipeline.
- Removed the lighting profile's global `darknessOpacity` / `darknessColour`, the lighting layer's full-screen black rectangle, and retired darkness diagnostics. Runtime proof now reports `overlayCount: 0` and `scene_colour_times_additive_illumination_field_v1`.
- Moonlight is broad cold illumination; cloud bands attenuate that contribution inside the field. Torch, fire, and lightning values are additive illumination rather than translucent glow stickers over a black veil.
- Preserved world events, fog/smoke, camera rain/sparks, post-processing, overlays, and HUD downstream of the illumination composite. Non-emissive leaf drift now renders with world materials before illumination, while sparks/embers and readability effects remain post-illumination.
- Replaced the stale blanket atmospheric-alpha assertion with effect-kind ceilings matching the authored rain and spark contracts. Added ownership, wiring, stage-order, profile, diagnostics, and particle-stage tests plus a deterministic real-browser proof harness.

Validation:

- All 85 registered BSB tests outside the known LoC gate pass. Full `npm test` reaches only `src/app.js: 532`, the pre-existing 500-line budget failure; the former atmospheric-overlay failure is resolved.
- All changed/new JavaScript files pass `node --check`; the scoped tracked diff passes `git diff --check`. Every touched production module remains at or below 500 nonblank lines (`WebGLGameRenderer.js` and `renderProjection.js` are exactly 500).
- Real Edge/Chromium at a local free-port URL rendered deterministic 1440x900 torch, moonlight, rain plus smoke, and lightning scenes. All four report active illumination compositing, zero darkness overlays, and the required downstream atmosphere ordering.
- Captured pixel evidence is non-zero and scenario-distinct: mean luma 24.11 torch, 8.17 moonlight, 27.53 rain/smoke, and 46.57 lightning; lightning mean chroma is 29.1. Browser proof reports zero console errors/warnings, page errors, or request failures.
- Fresh paired before/after captures and structured runtime evidence live under `C:/Users/felix/Documents/Codex/2026-07-28/bsb-v2-smoke-unlock-fix-chatgpt/outputs/illumination-primary-v1/`.

Remaining unrelated baseline:

- `src/app.js` is still 532 nonblank lines against the 500-line budget. It was deliberately not mixed into this renderer slice.

## 2026-07-29 - Illumination performance policy v1

Current request:

- Measure the post-refactor renderer before reducing visual quality, then cull illuminators before GPU preparation, introduce dormant/static/dynamic/critical illumination states, cache static work, and limit which lights cast geometric shadows. Preserve fog, smoke, rain, moonlight, lightning, and the illumination-first visual contract.

Measured cause:

- A deterministic 1440x900 Edge/Chromium benchmark recorded CPU projection/backend timings and opt-in asynchronous `EXT_disjoint_timer_query_webgl2` timings for every render layer.
- The composite-only case cost 0.640 ms GPU. Shadow stress cost 3.220 ms total GPU, including 1.542 ms in shadows, with 8 lights producing 80 fields. Adding 24 off-screen lights still projected all 32 sources. Atmosphere was not the primary regression.
- Both `shadows` and `lighting` layer instances were preparing the same shadow geometry even though the illumination instance never rendered it.

Implemented runtime truth:

- Camera-expanded influence culling now runs before light projection. Dormant sources never reach renderer packets; an off-screen stress scene now projects only the 8 sources whose illumination reaches the viewport.
- Projected lights carry `nearby_static`, `active_dynamic`, or `critical` state. Critical sources win the active budget; nearby-static reveal/glow/core payloads are cached; dynamic lights continue to update.
- Minor smoulder, ember, and spark sources illuminate without geometric shadows. Shadow work is capped at 4 lights, 8 blockers per light, and 2 lights per blocker.
- Static blocker silhouette normalization and stable nearby-static light/blocker WebGL geometry are cached with invalidation signatures. The illumination-only layer no longer builds unused shadow triangles or SDF fields.
- GPU timing remains opt-in through `?gpuTiming=1`; normal play performs no timer-query work. Fog, smoke, rain, and all illumination quality settings were preserved.

Validation:

- Same-scenario shadow stress improved from 12.70 to 10.80 ms CPU median (-15.0%) and 2.494 to 1.833 ms steady-layer GPU median (-26.5%); its targeted shadow pass fell from 1.542 to 0.828 ms (-46.3%). The off-screen case improved from 12.30 to 10.55 ms CPU (-14.2%) and 2.460 to 1.831 ms steady GPU (-25.6%). Atmosphere stress improved from 12.40 to 10.70 ms CPU (-13.7%) and 2.607 to 2.019 ms steady GPU (-22.6%) while retaining 204 rain streaks and the smoke workload.
- The final stress projection is bounded at 4 shadow lights and 32 fields instead of 80. It reports 96 static blocker-cache hits, a stable geometry-cache hit, and four static light-cache hits.
- A second complete optimized benchmark confirmed steady GPU totals of 1.791 ms shadow stress, 1.787 ms off-screen stress, and 1.957 ms atmosphere stress with the same workloads. Composite-only returned to 0.646 ms versus 0.640 ms baseline; visible-light-only varied upward and is explicitly treated as inconclusive rather than a claimed win.
- All registered functional BSB tests pass. Full `npm test` reaches only the known unrelated `src/app.js: 532` line-budget failure. Changed JavaScript passes syntax checks and the scoped diff passes whitespace validation.
- Fresh real-browser torch, moonlight, rain/smoke, lightning, and five performance-stress captures pass with zero console errors, page errors, or request failures. All visual captures were inspected; the illumination-first contrast and downstream atmospheric treatment remain intact.
- Torch, moonlight, rain/smoke, and lightning retain their exact pre-performance mean luma/chroma pairs: 24.11/15.00, 8.17/5.79, 27.53/14.57, and 46.57/29.10.
- Raw evidence lives under `C:/Users/felix/Documents/Codex/2026-07-28/bsb-v2-smoke-unlock-fix-chatgpt/outputs/illumination-performance-v1/`.

Next slice:

- Define and implement families of shadow shapes on top of this bounded participation and cache policy.

## 2026-07-29 - Declarative shadow-shape families v1

Current request:

- Replace square/chunky caster roots with authored ground footprints, separate contact shadow from projected shadow, use a small family vocabulary, avoid automatic sprite-derived geometry, and preserve the graphic streaks.

Implemented runtime truth:

- Added the shared `black-sky-bound.shadow-shape-profile.v1` registry with broad-tree, narrow-trunk, rock, creature, tent, wall-segment, and no-shadow families. Pine, birch, dead snag, boulder, wyvern, humanoid, and generic actor paths now resolve family data rather than owning scattered shape records.
- Contact footprint and projected streak are separate contracts. Contact is a short soft capsule/ellipse/polygon rendered once per caster; projection starts beyond its root inset and continues through the existing compound tapered-capsule SDF fields.
- Retired the duplicate broad penumbra/core wedge. It now reports zero coarse projected triangles while retaining renderer-neutral region bounds for diagnostics.
- Replaced the dead snag's literal rectangular painted base with a small elliptical grounding patch. No sprite analysis or per-pixel height subsystem was added.

Validation:

- Deterministic 1440x900 real-browser captures pass for broad pine, airy birch, dead snag, rock, and the player wyvern. Each reports one contact footprint, its expected family ID, active projected SDF fields, zero coarse projected triangles, and zero browser errors/page errors/request failures.
- The full functional suite passes; `npm test` reaches only the known unrelated `src/app.js: 532` line-budget baseline. The two shadow modules previously at risk are exactly 500 nonblank lines.
- The illumination-first torch, moonlight, rain/smoke, and lightning browser gate still passes. A fresh performance benchmark retains 32 bounded shadow fields and records 1.622 ms shadow stress, 1.363 ms off-screen stress, and 1.587 ms atmosphere stress steady GPU medians.
- Evidence lives under `C:/Users/felix/Documents/Codex/2026-07-28/bsb-v2-smoke-unlock-fix-chatgpt/outputs/shadow-shape-families-v1/`.

Next slice:

- Expose family selection plus anchor/scale/rotation overrides in Forge only if authoring variation is needed; keep the current small declarative vocabulary as canonical truth.

## 2026-07-29 - Sound/pause reconciliation into launcher-owned Desktop checkout (in progress)

Current request:

- The pause-menu sound UX, paused heartbeat shutdown, and sampled Mama flyover/napalm work were not visible when launching `LAUNCH_BSB.bat` from the Desktop project.

Root cause and integration seam:

- The completed work had landed in a separate Documents checkout, while `LAUNCH_BSB.bat` resolves and serves `C:/Users/felix/Desktop/Automated_AI_Pipeline/_A_Projects/BLACK_SKY_BOUND_V2`.
- This is an `apply_activation_gap`: valid source changes and browser proof existed, but not in the launcher-owned runtime copy the user was exercising.
- The Desktop checkout contains newer illumination, transition, and shadow work plus uncommitted changes, so the reconciliation is being applied as focused module-level patches rather than replacing the project tree.

Checkpoint:

- Ported the audio bus, Audio Director, sampled-cue manifest/events/tuning, input actions, pause control, shared pause layout, world-event audio bridge, Mama scheduling/event flow, renderer projection/layer, runtime diagnostics, and focused tests into the Desktop tree.
- Preserved the Desktop-only authored-transition suppression in `tutorialProjection.js` while adding the shared pause-menu projection/layout contract.
- Copied the four runtime WAVs, four 24-bit masters, processed/source palette, and both editable Audacity projects into the Desktop checkout without overwriting any existing asset.

Completion and proof:

- The launch path remains `LAUNCH_BSB.bat -> tools/launch.mjs -> the Desktop project root`; both browser proofs spawned that exact Desktop launcher module with browser auto-open disabled and isolated local ports.
- Desktop pause-menu browser proof passed at 1280x720 and 760x600. It exercised rail click, plus click, drag scrubbing, wheel stepping, arrow selection/stepping, and Home/End; the live mix reached 50% master / 90% ambience / 90% effects.
- Paused buses were master 0.410, ambience 0.049, player 0, enemies 0, combat 0, UI 0.495, and music 0.019. The controls remained legible and non-overlapping in all three inspected screenshots.
- Desktop audio-activation proof changed the low-health heartbeat from active at gain 0.089 to stopped/suspended at gain 0 during pause, then recreated it at gain 0.088 after resume. Calm and strained breathing were also inactive and suspended while paused.
- The first natural Mama event was `mama_wyvern_inferno`. Distant roar, close flyover roar, napalm projection, and aftermath all resolved as `source: file`; every production WAV returned HTTP 200 on its intended enemy/combat/ambience bus.
- Both proofs reported zero console/page errors, Audio Director errors, and failed requests. Five fresh screenshots from the Desktop tree were opened and visually inspected.
- The user's already-running default launcher on port 5177 was also probed directly. Its served `app.js` contains the Desktop-only authored-transition wiring plus the new pause projection, and a real Edge pass at `http://127.0.0.1:5177/?skipHatch=1&mamaAuto=0` exposed the shared pause layout and all four sampled Mama manifest files with zero browser/request errors. Its fresh screenshot was inspected.
- Focused Audio Director, production-SFX, Mama lifecycle/directional/finish/inferno, tutorial/pause, and architecture tests pass; `src/app.js` imports successfully.
- Full `npm test` runs all functional modules and stops only at the unchanged pre-existing `src/app.js: 532` line-budget baseline. The reconciliation removed its temporary size increase and leaves `runtimeText.js` at the 500-line limit.
- Scoped `git diff --check` reports no whitespace errors. Existing unrelated Desktop modifications were preserved.

Evidence:

- `artifacts/pause-menu-sound-ux-v1/playtest-report.json`
- `artifacts/pause-menu-sound-ux-v1/01-pause-desktop.png`
- `artifacts/pause-menu-sound-ux-v1/02-pause-edited.png`
- `artifacts/pause-menu-sound-ux-v1/03-pause-compact.png`
- `artifacts/audio-activation-followup-v1/playtest-report.json`
- `artifacts/audio-activation-followup-v1/01-paused-body-loops-off.png`
- `artifacts/audio-activation-followup-v1/02-first-natural-inferno-sampled.png`
- `artifacts/launcher-5177-reconciliation-v1/playtest-report.json`
- `artifacts/launcher-5177-reconciliation-v1/01-live-launcher-pause.png`

Remaining unrelated baseline:

- `src/app.js` remains 532 nonblank lines against the repository's 500-line gate, exactly matching the Desktop baseline before this reconciliation. No audio, pause, Mama, renderer, or browser proof gap remains.

## 2026-07-29 - Crown of Cinders public-demo arena slice

Original request:

- "Could you follow-up in the next pass on those recommendations now please, can you evidence this particularly for me by authoring with axiom a nice lofty interesting demo arena map with spawners, increasing difficulty over time for the published available playtest, I'll leave you to decide creatively how to increase difficulty over time, maybe waves, maybe extra spawners(?) i think maybe we make the instincts unlock per wave rather than givinng the playtester everything from open, but we still allow for progression. i don't think we worry about the invite code yet, think we worry about that when we have a complete game we want to share more publically but a demo is just a demo"

Canonical ownership and implemented checkpoint:

- AXIOM now owns `data/bsb-v2/maps/crown_of_cinders.authoring.json`; the BSB runtime owns only the explicit bake at `data/maps/axiom-crown-of-cinders.runtime-map.json`.
- The 64x48 Crown of Cinders is an irregular elevated eyrie with a rock rim, scorched central crown, four pressure approaches, cover islands, dead snags, embers, boulders, and fifteen authored spawners.
- The arena contract groups those spawners into five finite waves. Only the current wave's fixtures exist at runtime, preventing future-wave foreknowledge or early destruction.
- Starting progression is Move + Bite/Claw. Wave clears award Dodge, Body Lunge, Smoke Burst, then Dodge Charge; bounded health recovery and full stamina refill make each intermission useful without erasing attrition.
- Focused Axiom authoring/bake tests, runtime-map/manifest tests, arena progression tests, and ECS architecture tests pass. The full BSB suite reaches only the unchanged pre-existing `src/app.js: 532` line-budget failure.

Published completion and external proof:

- The curated export contains one minified game bundle, the Crown runtime map, its single-entry manifest, and eight required production WAVs. It contains no raw `src` tree, source maps, First Escape map, or Ash Road map.
- Sites version 2 was saved from pushed source commit `76641a192c54fd9c46f9cae68f81313203555389` and deployed successfully to `https://black-sky-bound-playtest.kerrypain.chatgpt.site` while retaining public access.
- A fresh Playwright pass against that production URL confirmed the Crown as the immutable manifest default, campaign maps and `/play/src/app.js` as HTTP 404, Wave I as two fixtures / six threats, Dodge awarded at the first clear, and Wave II as three fixtures / ten threats at the compact viewport.
- The production browser proof reported zero console issues, page errors, or failed requests. The Axiom Map Forge proof independently loaded the 64x48 source, fifteen spawners, five waves, four rewards, and baked the exact unchanged runtime hash through `safe_write_project_file`.
- Both the canonical BSB package and the Sites wrapper report zero npm vulnerabilities. The Sites production build and its two packaging/render tests pass. The only full-suite stop remains the pre-existing `src/app.js: 532` line-budget baseline; all targeted arena, authoring, map-loader, manifest, ECS, and live-browser checks pass.

Evidence:

- `artifacts/public-demo-arena-v1/playtest-report.json`
- `artifacts/public-demo-arena-v1/03-wave-one-active.png`
- `artifacts/public-demo-arena-v1/04-dodge-unlocked.png`
- `artifacts/public-demo-arena-v1/05-compact-wave-hud.png`
- `AXIOM/apps/launcher/output/playwright/bsb-demo-arena-v1/playtest-report.json`
- `AXIOM/apps/launcher/output/playwright/bsb-demo-arena-v1/01-crown-of-cinders-axiom-source.png`
## 2026-07-30 — Full 3D isometric migration, Slice 1

- Added the opt-in `webgl3d` Three.js backend and the runtime-integrated `?renderer=webgl3d&reference=tree-grove` regression scene. The legacy renderer remains the default and candidate initialization failures are surfaced without fallback.
- Added `black-sky-bound.world-transform-3d.v1`, deterministic `black-sky-bound.procedural-tree-spatial-recipe.v1`, and `black-sky-bound.collision-shape-2d.v1` contracts.
- Existing Tree DNA now produces shared 3D trunk/branch/root/foliage geometry plus a trunk/root convex gameplay footprint; foliage is deliberately excluded from collision.
- Added a fixed 45-degree / 50-degree orthographic camera, wheel zoom support, Three.js resource caches/disposal, physical moon/torch/lightning sources, real cast/receive shadows, ACES tone mapping, sRGB output, and F3 diagnostics.
- Added focused unit coverage and a real-browser 1440x900 grove gate. Four locked lighting-state captures pass with zero console, page, or request failures. Visual inspection rejected the first underexposed pass; the accepted pass uses data-owned physical source values and camera exposure.
- Evidence: `artifacts/webgl3d-reference-grove-v1/{01-moon,02-torch-a,03-torch-b,04-lightning}.png` and `playtest-report.json`.

## 2026-07-30 - Full 3D isometric migration, Slices 2-4 and default cutover

Landscape and collision:

- The candidate backend now consumes live runtime-map projections. Terrain is instanced, blocked tiles are raised into visible cliff shelves, and every authored scenery kind is converted; unsupported kinds become visible magenta diagnostics and block the browser gate.
- Static collision now comes from bucketed circles, capsules, and convex polygons emitted by terrain and scenery recipes. Tree trunk/root footprints block; canopy does not. The old tile-centre prop test and invisible one-tile map inset are no longer movement authority.
- Physical moon and local source profiles replace reveal discs and global darkness. Local point-shadow ownership is capped at two with criticality/proximity selection and 500 ms hysteresis.

Actors, contact, and effects:

- Added simulation-owned body contact rigs after procedural pose solving and before contact resolution. Broad-phase locomotion capsules, pose-following hurt volumes, and fixed-step swept attack/weapon capsules now feed player, enemy, and separation contact.
- Added faceted articulated Three.js wyvern, humanoid, and predator bodies from the existing solved poses.
- Ported decals, hazards, projectiles, smoke, rain, particles, dropped torches, tree fire, dragonfire, lightning, Mama flyovers, fog, the opening egg, authored transitions, smoke awakening, tutorial, HUD, pause, and player death/respawn presentation.
- Added terrain/rain instancing, normal frustum culling, static-shadow invalidation, bounded scenery/actor caster LODs, transparent-effect diagnostics, asynchronous GPU timing, and explicit resource disposal.

Cutover:

- `webgl3d` is now the default backend. `renderer=webgl` maps to Three.js for compatibility, initialization fails visibly without fallback, and the legacy WebGL2D scene root is absent from the runtime import graph and production bundle.
- The production graph fell from 274 to 221 modules and the minified JavaScript bundle from about 1.425 MB to 1.139 MB after runtime retirement of the old scene root.
- The pre-existing dirty legacy renderer source remains on disk, unregistered and unbundled, to preserve unrelated in-progress illumination work as required by the implementation boundary.

Validation:

- Complete `npm test`, LoC, and JavaScript syntax gates pass. `src/app.js` is back inside the 500-nonblank-line budget after browser boot extraction.
- The 1440x900 live forest gate passes with 4,800 terrain tiles, 996 cliffs, 293 scenery objects, 107 procedural trees, 28 actors, 178 draw calls, about 104k triangles, CPU p95 5.1 ms, and GPU p95 11.565 ms. Pause, live dodge, death fade, canonical respawn, and screen-relative movement pass with zero browser/page/request errors.
- The smoke-awakening/map-handoff gate passes all 12 captures in Three.js; the Mama flyover gate passes and resumes live movement; the representative contact timings remain about 7.4 s for one idle raider and 3.8 s for two.
- The standalone built-package gate boots the Crown of Cinders with Three.js as the default, starts Wave I, moves screen-relative, displays the pause UI, serves no raw source, requests no `node_modules`, and reports zero browser/page/request errors.
- Accepted evidence lives in `artifacts/webgl3d-reference-grove-v1/`, `artifacts/webgl3d-live-world-v1/`, `artifacts/webgl3d-built-package-v1/`, `artifacts/playtest/smoke-awakening-handoff-v2/`, and `artifacts/mama-wyvern-flyover-smoke/`.

## 2026-07-30 - 3D stabilisation and visual completion

Performance truth and runtime retirement:

- Replaced the live broad 2D-era projection builder with lifecycle-owned `black-sky-bound.renderer-neutral-3d-projection.v1`. Static terrain, connected tiles, immutable scenery transforms, Tree DNA, geology, undergrowth, fixtures, and collision-visible metadata are cached by map signature; actors, lights, effects, hazards, particles, opening state, and changed scenery material state remain dynamic.
- Added full-frame `black-sky-bound.render-frame-timing.v2` diagnostics for simulation, static/dynamic projection, Three world update, overlay, submission, GPU, frame interval, cold start, cache activity, allocations, and long frames. F3 explicitly reports `legacy2DProjectionActive: false`.
- The production bundle now fails its build if `WebGLGameRenderer`, `WebGLOpeningLayer`, the old SDF occlusion builder, or light-space culling enters the emitted graph. Dirty legacy source remains preserved on disk and has no runtime cost.

Allocation and visual completion:

- Replaced per-frame effect reconstruction with bounded pools and instancing; actor topology and pose buffers are reused; HUD/pause DOM updates are signature-diffed; static shadow-caster selection is spatial-cell invalidated; effect variants and 32 unshadowed/two shadow-proxy light slots are prewarmed to prevent runtime shader recompilation stalls.
- Added `black-sky-bound.procedural-wyvern-mesh-recipe.v1`: a reusable faceted hatchling with chest, torso, haunches, neck, head, jaw, muzzle, tail, articulated wing-forelimbs, hind legs, feet, claws, eyes, and mutable double-sided membranes. It consumes the authoritative solved rig for idle, crawl, dodge, bite, alternating claws, smoke, impact, death, and hatch emergence. F3 contact capsules remain simulation-owned overlays.
- Restored the opening through `renderer_neutral_embodied_hatch_projection_v2`: persistent world-space shell pieces plus a separate camera-space shell interior for trapped/cracking phases, including authored cracks, rays, fragments, opacity, impulses, reduced motion, emergence, and control release.

Validation and measured boundary:

- Unit suite, line-count gate, JavaScript syntax checks, bundle inspection, built-package launch, live world, wyvern pose matrix, cold hatch flow, smoke handoff, Mama event, and reference-grove lighting gates pass with zero console, page, request, renderer, unsupported-scenery, or resource-growth errors.
- Locked 1440x900 DPR 1 stress result: frame interval p95 12.5 ms, projection p95 1.6 ms, full CPU render-path p95 4.4 ms, GPU p95 8.134 ms, and zero post-ready frames above 50 ms. Resources remain stable after warm-up at 116 geometries, 3 textures, 2,418 meshes, 586 materials, and 10 overlay DOM nodes.
- The same stress run at the machine's actual DPR 1.5 reports projection p95 1.6 ms, render-path p95 4.2 ms, GPU p95 16.426 ms, zero frames above 50 ms, but frame-interval p95 20.9 ms. This high-DPI cadence miss is retained as an explicit future quality/performance slice; no hidden render-scale reduction, weaker lighting, or shadow-slot reduction was introduced.
- Evidence: `artifacts/webgl3d-performance-v2/`, `artifacts/webgl3d-wyvern-poses-v1/`, `artifacts/webgl3d-opening-wyvern-v1/`, `artifacts/webgl3d-live-world-v1/`, `artifacts/webgl3d-reference-grove-v1/`, `artifacts/mama-wyvern-flyover-smoke/`, and `artifacts/webgl3d-built-package-v1/`.

## 2026-07-30 - Native-DPR lighting and hatchling refinement

Measured cause and correction:

- A fresh unchanged DPR 1.5 run failed at GPU p95 18.635 ms. Three.js was compiling 32 permanent unshadowed point-light slots to avoid runtime shader churn even though the full inferno stress scene uses 22 local sources. Every fragment therefore paid for ten unused light evaluations.
- The renderer-neutral selection budget remains 32, while the Three.js shader now owns 24 fixed content-complete slots. The inferno proof retains all 22 sources: eight wall flames, four napalm-pool lights, seven raid flames, and three smoulder patches, plus the moon and both local point-shadow slots.
- Overflow is not silent: diagnostics expose capacity, occupancy, source families, dropped count, and `qualityState`; exceeding 24 automatically opens F3 in `degraded_visible` state.
- The final native 2160x1350 DPR 1.5 run reaches frame-interval p95 16.7 ms and GPU p95 15.037 ms, down from the previous 20.9 ms cadence and today's fresh 18.635 ms GPU failure. DPR 1 remains 12.5 ms frame p95 / 7.199 ms GPU p95. Projection is 1.8 ms and CPU render path 4.9 ms in both profiles, with no frame above 50 ms or warm resource growth.

Playable hatchling refinement:

- Added batched paired hornlets, a seven-spine dorsal taper, separate shoulder/haunch silhouette plates, three grounded toes per hind foot, and paired talons on each wing wrist. The old six separate claw draws became reusable instanced anatomy, so the richer silhouette adds only three net draw calls in the contact-debug pose scene.
- Added deterministic per-face tonal variation to every reusable body geometry and both membranes. Physical `MeshStandardMaterial` lighting remains authoritative, but bright torch/lightning exposure no longer erases all low-poly facet structure.
- Clean pose captures now keep F3 hidden for idle, crawl, both claw sides, bite, smoke, moon, and lightning, followed by one explicit contact-alignment frame. Simulation pose and body/attack contacts are unchanged.

Evidence and boundary:

- `artifacts/webgl3d-performance-v2/report.json`
- `artifacts/webgl3d-performance-v2/{locked-1x,machine-dpr}.png`
- `artifacts/webgl3d-wyvern-poses-v1/report.json`
- `artifacts/webgl3d-wyvern-poses-v1/{01-idle-torch,02-crawl-torch,03-left_claw_swipe-torch,05-bite_attack-torch,07-idle-moon,08-idle-lightning,09-contact-alignment}.png`
- Mama and non-player creature-family mesh refinement remains outside this bounded pass.

Final gates:

- Complete `npm test`, line-count, targeted shader-budget/wyvern tests, and JavaScript syntax checks pass; scoped `git diff --check` has no whitespace errors.
- `npm run build:playtest` transforms 221 modules and emits the curated 14-file Crown package with no raw source, source maps, campaign maps, legacy renderer, opening layer, or 2D shadow modules.
- The standalone built-package browser gate passes movement, Wave I, pause, raw-source 404, and no-`node_modules` runtime at 124 calls / 43,780 triangles with zero console, page, request, or HTTP errors.
- Live First Escape movement, the complete pose/action matrix, the real six-input hatch/release flow, and final DPR 1 / DPR 1.5 stress captures were visually inspected. No new dependencies or browsers were installed.

## 2026-07-30 - Three.js screen-space parity restoration

Restored presentation paths:

- Replaced the minimal Three overlay with bounded, independently disposable screen layers for the authored pause menu, typed tutorial cues, authored map-transition/smoke-awakening vignettes, arena and instinct banners, and health/stamina body-state feedback. Gameplay, projection, opening, combat, and pause-input state remain authoritative outside the renderer.
- The pause layer now renders the canonical `pauseMenu.layout` geometry used by pointer hit-testing, including responsive compact layout, exact rails, knobs, increment/decrement targets, tutorial toggles, learned controls, and the restored footer guidance.
- Tutorial presentation preserves movement key groups, combo progress, dodge/charge sequencing, message-only cues, pressed/completed state, fade phases, and reduced-motion updates. Smoke awakening now consumes nested authored smoke coverage, full blackout opacity, breath-pocket growth, accepted-breath stages, and canonical prompt timing without raw debug phase labels.
- Added quiet top-centred arena banners, including a dedicated `NEW INSTINCT` treatment for authored unlock rewards, and bounded screen feedback for recent damage, critical-health desaturation/contrast, stamina pressure, and breath pulse.
- Three diagnostics now include screen-layer contracts and active state, while live resize synchronises the gameplay camera viewport so canonical pause geometry remains aligned after viewport changes.

Validation:

- `npm test`, line-count and JavaScript syntax gates pass. The focused Three presentation test covers all screen-layer view models and the live test proves pause pointer control, compact geometry, body-state feedback, dodge, death, and respawn.
- Browser captures prove fresh movement onboarding, Crown countdown, first-wave Dodge awakening, all twelve smoke-handoff stages, and the full hatch/release flow with zero console, page, request, renderer, or unsupported-content errors.
- The current stress result passes at both DPR 1 and DPR 1.5: respectively 5.4/7.255 ms and 4.6/14.112 ms CPU/GPU p95, projection p95 at or below 2.1 ms, no post-ready frame above 50 ms, and stable resource bounds.
- `npm run build:playtest` emits the curated 14-file package. The emitted graph contains no `WebGLGameRenderer`, `WebGLOpeningLayer`, old occlusion/light-culling builders, or other checked 2D scene-root symbols; the packaged browser requests no `node_modules` and serves raw source as 404.

Evidence:

- `artifacts/webgl3d-screen-presentation-v1/`
- `artifacts/webgl3d-live-world-v1/`
- `artifacts/playtest/smoke-awakening-handoff-v2/`
- `artifacts/webgl3d-opening-wyvern-v1/`
- `artifacts/webgl3d-performance-v2/`
- `artifacts/webgl3d-built-package-v1/`

## 2026-07-30 - Tree Family v2 and live shadow grounding (in progress)

- Replaced segment-by-segment woody prisms with one coherent capped sweep per trunk, branch, and root. Rings now share joints, use transported frames, retain deterministic low-poly facets, and ground-clamp the trunk/root base instead of showing disconnected rectangular fins.
- Tree DNA now emits a trunk-only circle as hard collision plus `black-sky-bound.traversal-modifier-2d.v1` capsules along each visible root. Movement consumes the compiled root field at an explicit 0.88 multiplier; canopy and root gaps remain nonblocking.
- Focused tree-recipe and environment-collision tests pass. Live-map shadow centring, visible lightning embodiment, browser captures, performance, build, and full-suite gates remain to be completed in this slice.
- Live directional-shadow coverage now follows the player in bounded spatial cells, and changing the selected nearby static caster set explicitly refreshes Three.js's deliberately frozen shadow maps. Unit coverage proves both invalidation rules without restoring per-frame shadow rendering.
- Storm scheduler origins remain canonical, while the renderer-neutral projection publishes a deterministic camera-local high-cloud strike plus its scheduled-origin provenance. The Three effects layer reuses two prewarmed jagged emissive bolt groups; the physical lightning point light continues to pre-empt a local shadow slot.
- Fresh reference-grove and live-map/wyvern browser gates pass with zero console, page, or request errors. Inspected grove captures show continuous trunk silhouettes and real torch/lightning shadows changing direction; the live lightning capture contains world-space bolts and physical-light shadow ownership. Full suite currently passes; final performance/build packaging gates remain.
- Removed an allocation-heavy dynamic path exposed by the new root metadata: changing tree-fire material and fire-placement packets no longer rebuild full scenery projections or clone static collision/traversal arrays.
- Final `npm test`, line-count, syntax, reference-grove, live-world, wyvern/lightning, build, and standalone built-package gates pass. The packaged Crown scene moves and pauses at 124 calls / 43,780 triangles with zero console, page, request, or HTTP errors; raw source remains a 404 and the bundle-content retirement assertion passes.
- The strict performance gate is the one incomplete proof. Repeated locked-DPR runs currently settle at 20.8 ms frame interval with 9.9 ms render-path CPU, 3.6 ms projection, and 7.732 ms GPU. A report-only measurement at DPR 1.5 records 20.9 ms frame interval, 11.1 ms render-path CPU, 3.7 ms projection, and 14.679 ms GPU. Both profiles have zero >50 ms frames and stable resources. This is a CPU cadence/projection miss relative to the last accepted 12.5/16.8 ms frame results; no render scale, light slot, shadow quality, or threshold was reduced to conceal it.

Next recommended action:

- Treat the current CPU-wide cadence change as a separate measured performance investigation. Preserve the accepted Tree Family v2 visuals and first profile whether the fixed-step catch-up loop, actor projection cloning, or current workstation/browser scheduling is producing the roughly 1.7-2x CPU-phase increase while GPU timing remains stable.

## 2026-07-30 - Post-migration CPU cadence stabilisation

Measured root cause and repair:

- A fresh locked-DPR failure reproduced the Tree Family v2 boundary at 20.8 ms frame-interval p95, 7.4 ms simulation p95, 3.4 ms projection p95, and 9.9 ms render-path p95 while GPU p95 remained healthy at 7.822 ms.
- An 8-second Chromium CPU profile identified repeated JSON cloning in the compatibility actor view and renderer-neutral actor compiler, repeated immutable creature-profile resolution, and twice-per-frame percentile sorting as the dominant avoidable CPU paths. Root traversal collision was measured but was not the primary regression.
- Creature profiles now cache by immutable base profile and replace-on-write tuning identity. A new tuning object produces a new resolved profile, so tuning edits remain immediately truthful.
- The Three.js compiler now reuses the already-detached compatibility-view state for read-only nested actor packets instead of serialising it again. World-space point and creature-rig projection remains freshly derived, and ECS simulation state remains the canonical owner.
- Frame timing continues to record every phase every frame, but warm percentile summaries publish every four frames and only once per browser frame. F3 remains a one-action optional debug surface rather than a hidden frame-budget tax.
- `tools/profileWebgl3dCpu.mjs` preserves the repeatable CDP sampling lane and writes raw/summary evidence to `artifacts/webgl3d-cpu-profile-v1/`.

Validation and final boundary:

- The strict two-profile browser gate passes. Locked 1440x900 DPR 1 is 12.6 ms frame p95 / 6.6 ms simulation / 1.2 ms projection / 7.4 ms render path / 7.566 ms GPU. Native 2160x1350 DPR 1.5 is 16.8 ms frame p95 / 6.5 ms simulation / 1.1 ms projection / 7.8 ms render path / 14.769 ms GPU.
- Both profiles retain native DPR, all 24 physical-light slots, both local shadow slots, 32 smoke packets, 96 particles, and the accepted Tree Family v2 scene. Neither profile records a post-ready frame above 50 ms or warm resource growth.
- The complete unit suite, line-count and syntax gates, production playtest build, and standalone packaged-browser gate pass. The package moves, pauses, rejects raw source with 404, and reports zero console, page, request, or HTTP errors.
- Inspected DPR 1 and DPR 1.5 stress screenshots preserve the accepted scene composition, tree silhouettes, physical lighting, rain, smoke, hatchling, tutorial, and body-state presentation.

Next recommended slice:

- Keep actor compatibility-view cloning as a separately measured reserve optimisation. It remains the largest CPU scripting leaf, but the accepted 60 FPS/native-DPR boundary is restored and changing that ownership seam now would add risk without a current user-visible payoff.

## 2026-07-30 - Blender V5 Mama flyover mesh proof

- Exported the selected evaluated `Cube` from the open, unsaved `Dragon_Main_March_V5.blend` scene as a selection-only GLB. Mirror and subdivision output are baked; Blender materials, armature data, and animation are excluded. The source scene was not saved or otherwise rewritten.
- Replaced the temporary Three.js capsule/cone Mama with the real one-mesh V5 silhouette. Runtime diagnostics fail visibly through `status`/`error` instead of substituting the removed procedural placeholder.
- Kept world-event timing, heading, crossing anchor, and scale canonical. The existing `0.46` scale produces a measured 4.542 m wingspan and 3.666 m length; the new 9.2 m altitude clears the authored 8 m mature canopy.
- Added fixed-camera orthographic parallax compensation so the high mesh still crosses the canonical screen anchor. Inferno breath retains its ground target and applies the same compensation to its elevated source.
- The runtime owns an unlit near-black translucent `MeshBasicMaterial`; the stale retired WebGL shader path remains excluded.
- Asset provenance records 37,286 vertices, 62,848 triangles, 1,571,404 bytes, and SHA-256 `FB5F27E44470E1B3575792E3D969997A92CFCE32B3F901FD63CF60EBE71327BE`.

Validation:

- `npm test`, targeted GLB/Three/Mama tests, JavaScript syntax, and scoped diff checks pass.
- `npm run smoke:mama-flyover` proves the imported mesh is ready and visible through the complete event with zero console, page, or request failures, followed by continued player movement.
- `npm run build:playtest` emits the hashed GLB in the curated 15-file package. The standalone built-package browser proof confirms the asset request succeeds, raw source remains 404, and no browser/HTTP errors occur.
- Visual evidence: `artifacts/mama-wyvern-flyover-smoke/02-during.png`.

## 2026-07-30 - Blender V5 skinned baby wyvern proof

- Added a reproducible Blender pipeline at `tools/blender/rig_baby_wyvern_v5.py`. It duplicates the open `Dragon_Main_March_V5` source non-destructively, bakes Mirror plus the unsubdivided source cage, creates a named 29-bone runtime armature (28 deform segments), assigns deterministic four-influence skin weights, exports a GLB, and saves a separate rigged `.blend` without overwriting the source scene.
- The accepted player asset is one real `SkinnedMesh`, 2,048 authored vertices / 3,928 triangles, 2.47 m wingspan, 1.996 m nose-to-tail, and 157,940 bytes. The first 15,712-triangle subdivision-one attempt was rejected after the native-DPR stress gate exposed a GPU regression.
- Replaced the 58-surface primitive hatchling renderer with the imported mesh. `black-sky-bound.wyvern-bone-pose-adapter.v1` maps the existing canonical axial, jaw, tail, wing-forelimb/digit, and hind-leg pose targets into the GLB's named bones; gameplay actions, swept contacts, hurt volumes, sockets, and progression remain unchanged.
- Grounded idle/crawl preserves a coherent whole-body transform and restrained folded-wing articulation. Left/right claw states raise articulation only on the attacking wing and digits; bite retains full neck/head/jaw authority. No flap cycle or authored animation clip was added.
- The player uses the stale-shader direction as a cheap fogged unlit hide silhouette. This prevents nearby torch volumes from bleaching the entire mesh and avoids running a tiny skinned player through the full 24-light fragment shader.
- Asset SHA-256: GLB `261276C473EEFAFE68BDFCBA4D1497AA369176677A6B9E6AAA26A6561166D896`; rigged blend `58C21BFCC594D782092945AE4B7048F08A2752F85938A305D37B576CE7746AAD`.

Validation and measured boundary:

- `npm test`, the focused GLB/skin/bone test, `npm run build:playtest`, the complete nine-state pose/action browser matrix, and the real opening/emergence browser path pass. Both browser gates report zero console, page, or request errors; the production package emits the hashed 157.94 kB GLB.
- Pose-proof comparison reduces the player from 58 draw surfaces to one and moves final contact-debug CPU render-path p95 from 9.5 ms to 7.7 ms. The same comparison moves GPU p95 from 12.401 ms to 13.356 ms, so this is a CPU/draw-submission improvement, not a blanket GPU win.
- The broader inferno stress gate remains red on the current workstation state: 182 calls / 113,872 triangles at the failed native-DPR sample, with frame p95 29.2 ms and GPU p95 21.055 ms. The last accepted pre-slice stress report was 239 calls / 112,076 triangles / 14.769 ms GPU. No threshold, native DPR, light capacity, shadow count, or fallback was weakened to conceal the regression.
- Evidence: `artifacts/webgl3d-wyvern-poses-v2/`, `artifacts/webgl3d-opening-wyvern-v1/`, and `assets/models/player/dragon_main_march_v5_baby_rig.json`.

## 2026-07-30 - Baby wyvern visual rig remediation v2 (active)

Hard visual baseline:

- Added a dedicated close-up browser diagnostic covering clean idle, two crawl samples, windup/contact for both claw sides, windup/contact for bite, and F3 contact alignment. It zooms the real gameplay camera and walks the live actor away from its spawn before capturing; no isolated model viewer or substitute animation path is used.
- Fresh evidence at `artifacts/webgl3d-wyvern-rig-diagnostic/baseline-independent-bones-v2/` passes mechanically with one skinned mesh, 3,928 triangles, 28 driven bones, active canonical attack volumes, and zero browser errors, but fails visual acceptance.
- Inspection confirms the current player does not read as a grounded hatchling: the broad membrane collapses into a cape/slab, the torso and head merge, the tail becomes a rigid spear, crawl samples are difficult to distinguish, claw reach is expressed through whole-silhouette stretching, and bite lacks a legible jaw/head lead.
- Root cause is structural. The v1 Blender script parents every deform bone directly to the armature while each continuous vertex blends up to four influences. Runtime then writes unrelated absolute transforms into those bones, so blended membrane/body vertices shear between disconnected frames. This cannot be accepted as pose tuning alone; the next correction is a real anatomical hierarchy plus hierarchy-aware armature-space solving and stricter regional skin ownership.

## 2026-07-30 - Baby wyvern visual rig remediation v2 (complete)

Visual diagnosis and repair:

- The failed proof combined a flying source bind, disconnected deform ownership, and an absolute point-to-bone solver. That forced one continuous surface toward unrelated primitive targets, producing the observed star/cape silhouette, rigid tail spear, membrane shearing, and nearly indistinguishable attacks.
- Rebuilt the export as `black-sky-bound.skinned-baby-wyvern.v2`: a grounded crawl bind, real axial/tail/wing/hind anatomical hierarchy, regional skin ownership with no more than three influences, a folded wing-forelimb stance, lowered contacts, and a curved tail. The open source `Dragon_Main_March_V5.blend` was not overwritten; the accepted GLB, rigged Blend, and provenance JSON are separate outputs.
- Replaced absolute deformation with `black-sky-bound.wyvern-bone-pose-adapter.v3`. Every frame now resets exact authored local rest transforms, aligns the whole bind to actor heading/scale, and applies bounded hierarchy-aware aims. Crawl retains the crouched authored silhouette; claw and bite changes are driven by the canonical action id and phase rather than a renderer-owned animation state machine.
- Added low-cost anatomical vertex colour separation to the unlit hide material and a head-attached dark mouth accent during bite contact. This preserves the dark BSB read while keeping head, torso, folded wings, hindquarters, and tail separable under close inspection.
- Added an explicit `rigDiagnostic=1` browser lane that suppresses unrelated effects only for close rig evidence. It removes the torch/smoke obstruction seen in the normal pose matrix without changing the production scene path.

Hard visual gate:

- Fresh close captures at `artifacts/webgl3d-wyvern-rig-diagnostic/current/` cover idle, two crawl plants, left/right claw windup and contact, bite windup and contact, and F3 alignment. All ten screenshots were manually inspected after the final code edit.
- The accepted result reads as one low, continuous grounded animal with a preserved head/torso, folded wing-forelimbs, hind contacts, and curved tail. Crawl changes weight without slab collapse; claw contacts create clear side-specific raised reaches; bite leads with the head and mouth cue; F3 volumes remain under the embodied contacts.
- The live diagnostic reports one skinned mesh, 3,928 triangles, 28 driven deform bones, active canonical contact volumes for every captured attack contact, and zero console, page, or request failures.

Post-edit validation:

- `npm test`, `tests/threeWyvernMesh.test.mjs`, the ten-state close rig diagnostic, the nine-state normal-world pose matrix, the complete hatch/opening path, `npm run build:playtest`, and the standalone built-package browser gate pass.
- The packaged scene loads the hashed rig, moves the player, returns raw source as 404, and reports zero console, page, request, HTTP, or asset errors. Vite retains its existing large-chunk warning.
- Final asset SHA-256: GLB `2DE6EBCD2534C244D0039F20218EBC0431DD809618345796197E11DFB9597D20`; rigged Blend `E9FD959B85218B2C83F40CE7734C2DFFDA1A1DADCC27843329BA3895C79A6B15`; metadata `3B14D2B1CEC8B47B5D5405F4DB21B149297274526446261906C59652DE2C5680`.
- The separate machine-DPR inferno stress run remains red at 29.1 ms frame-interval p95 / 20.688 ms GPU p95 with 182 calls and 113,872 triangles. The baby is one 3,928-triangle skin plus one tiny bite accent, so this broader renderer stress boundary is recorded honestly rather than attributed to or concealed inside the accepted visual-rig slice.

Next recommended slice:

- Preserve this accepted baby silhouette and investigate the renderer-wide native-DPR stress regression as its own measured performance slice, targeting frame and GPU p95 without lowering DPR, scene density, light capacity, or shadow quality.

## 2026-07-31 - Selective baby-wyvern Blender rollback

Production embodiment:

- Rejected the Blender V5 skinned baby experiment on visual grounds and restored the exact previously accepted `black-sky-bound.procedural-wyvern-mesh-recipe.v1` implementation. The live player is again the 58-surface faceted hatchling with reusable body topology, two mutable wing membranes, instanced toes, talons, hornlets, dorsal spines, and silhouette plates.
- Simulation-owned pose, sockets, hurt volumes, swept attack capsules, combat semantics, opening state, and gameplay balance were not changed. Actor diagnostics again report procedural mesh, membrane, and pose-update counts rather than loader, skin, bone, or imported-triangle state.
- Removed the Blender-remediation-only `rigDiagnostic` effects suppression from the runtime. The generated player GLB, rigged Blend, metadata, export script, and bone adapter remain preserved as rejected research evidence on disk, but the browser entry graph does not import or bundle them.
- Preserved the successful Mama boundary unchanged. `ThreeMamaFlyoverMesh` still loads `dragon_main_march_v5_flyover.glb`, and the live flyover smoke gate proves the imported silhouette completes its event and returns control to normal play.
- No terrain, tile, floor-material, map, or PBR asset source was edited in this rollback, keeping the parallel floor-texture slice isolated.

Learning encoded as gates:

- The focused player test now fails if the production embodiment imports `GLTFLoader`, references the rejected baby-rig asset, or introduces `SkinnedMesh` before a replacement clears comparative visual acceptance.
- `npm run smoke:wyvern-visual` is now a reusable close live-game acceptance lane covering idle, two crawl plants, bilateral claw windup/contact, bite windup/contact, and F3 contact alignment. It uses the real gameplay camera, authoritative action state, and real contact volumes rather than an isolated model viewer.
- The production build now fails if the rejected baby rig or adapter enters the emitted graph, if the procedural player contract disappears, or if the accepted Mama GLB/contract is lost. This makes the selective import boundary executable rather than relying on implementation notes.

Validation:

- `npm test`, `npm run test:loc`, JavaScript syntax checks, the focused procedural-player and Mama-asset tests, the close visual-acceptance lane, the nine-state world pose matrix, the complete hatch/opening route, and `npm run smoke:mama-flyover` pass.
- All fresh player/opening/Mama screenshots were visually inspected. Browser gates report zero console, page, or request failures.
- `npm run build:playtest` emits the procedural player plus exactly one hashed `dragon_main_march_v5_flyover` GLB; no baby-rig asset or adapter symbol is emitted. The standalone package moves the player at 123 calls / 43,700 triangles, serves raw source as 404, and reports zero console, page, request, or HTTP failures.

Evidence:

- `artifacts/webgl3d-wyvern-visual-acceptance/procedural-baseline/`
- `artifacts/webgl3d-wyvern-poses-v1/`
- `artifacts/webgl3d-opening-wyvern-v1/`
- `artifacts/mama-wyvern-flyover-smoke/`
- `artifacts/webgl3d-built-package-v1/`

Next boundary:

- Keep the procedural hatchling as the production reference. Any future imported-player candidate must first run beside it through the comparative visual lane and receive an explicit visual acceptance decision before production wiring or performance claims can promote it.

## 2026-07-31 - Three-material terrain foundation and organic contour remediation

Architecture and ownership:

- Audited the real Map Forge-to-Three path before implementation. Map Forge and runtime maps retain stable terrain string IDs; collision, movement, blocking, and obscuring semantics are unchanged. Renderer-neutral projection remains the only handoff into the cached Three static world.
- Replaced the flat constant-colour Three floor only for grass, dirt, and scorched earth with one instanced layered PBR batch. Forest, water, and rock remain on their prior instanced scalar-material path.
- Added deterministic project-authored 128x128x3 base-colour, OpenGL-normal, and packed roughness/AO/detail-height arrays with repeat wrapping, trilinear mipmaps, equal world texel density, and no atlas gutters. Height is normal detail only; no displacement was introduced.

Reference-driven visual correction:

- The first proof was rejected as visually inadequate. Reviewed official No Rest for the Wicked, V Rising, Last Epoch, and Diablo IV screenshots and recorded the reference links/lessons without packaging or copying their imagery.
- Reduced and reshaped grass into sparse deterministic 30-triangle clumps with coherent prevailing lean, patch-density variation, natural-boundary bias, travelled/occupied/spawn/escape suppression, distance culling, and one additional draw call.
- Replaced tile-edge interpolation with `black-sky-bound.organic-terrain-contour-mask.v2`: rounded cores, cardinal/diagonal path capsules, region merging, variable shoulders, multi-scale per-material domain warps, and opposing edge lobes. The final 640x480 renderer-only field moves 6,546 sampled pixels across authored tile ownership while retaining the correct dominant material at all authored target tile centres.

Diagnostics and evidence:

- F6 cycles lit/material-ID/normal-only views; F7 toggles ground detail; F3 reports grass instance counts and culling bounds. Missing material data remains an explicit magenta diagnostic failure, never a hidden flat-colour fallback.
- Final browser evidence at `artifacts/terrain-material-v1/final-reference-gated/` covers close grass, normal gameplay height, organic grass/dirt and scorch boundaries, moving light, low-light readability, broad repetition, debug views, and original locked baseline coordinates. The real browser reports zero console, page, and request failures.
- At the clear proof camera detail off/on is 123/124 calls, 130,432/139,522 triangles, 10.2/10.3 ms frame p95, and 8.768/8.886 ms GPU p95; 303 visible clumps add exactly 9,090 triangles. At the original locked camera 159 clumps add one call and 4,770 triangles.
- The full stress gate passes at locked DPR 1 (16.7 ms frame, 7.615 ms GPU) and native DPR 1.5 (16.8 ms frame, 14.213 ms GPU), preserving quality budgets.
- `npm test`, `npm run test:loc`, focused terrain tests, the final material browser lane, production build, standalone package smoke, and both performance profiles pass. Completion detail is in `docs/TERRAIN_MATERIAL_FOUNDATION_COMPLETION.md`.

## 2026-08-03 - Procedural raider recipe-to-gameplay pipeline (in progress)

Current request:

- Implement the approved two-slice deterministic creature-recipe pipeline for raiders, carrying recipe identity and seed through map/spawner spawning, ECS, pose, 3D rendering, gameplay consumers, audio, lighting, and death aftermath.
- Replace the live Three.js stick figure with a visibly stronger faceted low-poly raider, then prove a coherent seeded family at population scale while leaving AXIOM recipe controls for a later slice.

Pre-change boundary:

- Preserve raider HP, speed, collider, stamina/dodge, attack timings/damage, guard behavior, torch lighting, faction AI, blood/corpse aftermath, map layouts, and all non-raider creatures.
- Treat `src/data/creatures` as recipe truth, runtime-map/spawner records as optional recipe references, ECS as the resolved instance owner, humanoid projection as pose authority, and Three.js as presentation only.
- Require contract/determinism/integration/renderer tests plus fresh Playwright captures, screenshot inspection, browser error inspection, and the existing frame-budget gates before completion.

Recipe/runtime implementation:

- Added `black-sky-bound.creature-recipe.v1` and immutable `black-sky-bound.creature-recipe-instance.v1` contracts. `ACTORS.raider` now owns only identity/faction/role/default-recipe selection; the canonical recipe owns the unchanged 42 HP, 3.1 speed, 0.28 collider, stamina profile, attacks, guard AI, impact response, materials, equipment, audio, torch light, and death profile.
- Added deterministic palette/proportion/head/shoulder/wrap/belt/pack/spear/torch selection with stable variant signatures. Sequential explicit seeds 1-100 now produce 100 signatures and exercise all four restrained palette families while retaining required spear and torch slots.
- Preserved optional `{ creature: { recipeId, seed } }` through runtime-map placements, reserved transition actors, unit spawners, serialization, ECS actor views, and renderer-neutral 3D projection. Authored ids and spawner id+ordinal now provide stable seed provenance; invalid ids, seeds, kind mismatches, registry references, and sockets fail loudly.
- Routed recipe cues through existing audio events and recipe death profiles through corpse creation, preserving recipe/signature provenance in aftermath state.

Procedural Three implementation:

- Added a shared instanced faceted humanoid layer. Recipe-backed raiders bypass the legacy cylinder-and-white-joint path and render solid torso/hips/head/limbs/hands/feet, cloth shell, head covering/mask, asymmetric shoulder armour, torso wrap, belt, optional pack/bedroll, spear variants, torch variants, role-separated materials, emissive flame, and real shadows from the existing solved pose and sockets.
- F3 diagnostics now expose recipe ids, seed provenance, variant signatures, attachments, primitive/draw-family counts, pool allocations/topology builds, and missing-socket errors while remaining hidden in normal play.
- Focused contract, determinism, pipeline, gameplay-regression, death-provenance, and 100-raider instanced-renderer tests pass. The 100-raider test verifies finite matrices, bounded draw families, required equipment, zero missing sockets, stable topology after pose updates, and clean disposal.

Visual refinement and browser evidence:

- Added `npm run smoke:raider-visual`, a real Edge/Chromium gameplay lane with a twelve-seed lineup; close idle, walk, spear, torch, guard, and impact poses; smoke/lightning; live faction combat; death aftermath; a 100-raider stress scene; and F3 diagnostics.
- Manual inspection rejected the first mechanically passing contact sheet because existing exposure and torch shadows crushed the new body into black silhouettes. Added recipe-owned per-material night readability, separated shadowed/unshadowed instancing for bounded core body masses, and moved the carried-torch shadow near plane past the carrier to retain real shadows without screen-filling self-shadow.
- The accepted contact sheet at `artifacts/webgl3d-raider-visual-v1/contact-sheet.png` shows solid faceted raiders without white joint spheres. The browser report records zero console/page/request failures, 100 stable variants, 2,786 active primitives, 80 bounded draw families, zero missing sockets, and stable topology after warm-up.
- Final measured 100-raider proof: 4.4 ms CPU render-path p95, 8.4 ms frame-interval p95, 1.6 ms projection p95, and 5.714 ms GPU p95 on the captured run. Full regression/build/browser validation follows this log entry.

Final validation:

- `npm test`, `npm run test:loc`, and `npm run build:playtest` pass. The final bundle contains 15 curated files, no raw source or source maps, and retains the existing Vite large-chunk warning.
- `webgl3dLiveWorld`, `webgl3dBuiltPackage`, `smokeAwakeningHandoff`, and the accepted procedural-wyvern visual lane pass with zero browser errors in their final standalone runs.
- The full performance lane passes at DPR 1 and DPR 1.5. Final native-DPR p95 is 16.9 ms frame interval, 9.9 ms CPU render path, 1.8 ms projection, and 14.34 ms GPU with zero new long frames. The first native-DPR attempt sampled 20.8 ms frame interval despite sub-budget CPU/GPU and was recorded as red; its immediate isolated repeat produced the passing result above.
- A combined built-package/transition command aborted outstanding model/audio requests between browser suites; the transition lane passed with zero failures when rerun alone. No threshold, quality setting, content count, or fallback was weakened for either retry.
- Completion evidence and the exact self-validation contract are stored beside the visual report in `artifacts/webgl3d-raider-visual-v1/`.

## 2026-08-03 - Raider Physical Motion Greybox v0 (in progress)

Current correction:

- The recipe pipeline, deterministic family, and instanced renderer are retained as delivery infrastructure, but the prior visual acceptance is explicitly rejected as character-motion proof. This slice freezes recipe variation and targets one fixed-seed, one-spear raider on flat terrain.
- The acceptance authority is now visible physical intention at the real gameplay camera: persistent foot contacts, pelvis/weight continuity, independent travel/chest/head attention, and a spear jab with anticipation, bounded lead prediction, a frozen commit point, contact recoil, and recovery over the planted feet.

Implementation boundary and first landing:

- Added `black-sky-bound.raider-physical-motion-intent.v0` as a recipe-raider ECS component. It owns filtered/measured velocity, pelvis shift, persistent left/right contacts, support/swing state, attention headings, target velocity tracking, predicted/frozen impact, recoil, and continuity counters.
- Inserted the intent solver between movement/AI and humanoid projection in normal system order and the authored-transition special path. Recipe-backed raiders receive it at spawn; non-recipe humanoids retain their compatibility path.
- The real spear attack transition now freezes the most recent bounded prediction as wind-up becomes active. Existing body-contact volumes consume the solved spear-tip socket, so dodge fairness is on the gameplay damage path rather than a debug-only line.
- Added a 3D two-bone physical pose mapping for idle, locomotion, spear ready/wind-up/active/recovery. Torch, guard, dodge, reaction, and death remain on their established compatibility poses in this deliberately narrow v0.
- Added the renderer-neutral physical-motion projection and an optional `raiderMotionGreybox=1` Three.js lane. It suppresses finished recipe attachments and unrelated actors, drawing one coloured 14-point body, planted/support markers, CoM marker, travel/chest/head axes, one spear, and predicted/frozen attack path.

Checks so far:

- Pre-change focused raider pose, enemy attack, and procedural-humanoid renderer tests passed.
- Initial integration correctly tripped the 500-line gate and a legacy direct-pose test. Diagnostics were extracted into their own serializer, and the physical pose activates only after the intent owner has solved a frame; live system order still activates it immediately while direct legacy test callers remain compatible.
- Added focused motion, two-bone IK, bounded prediction, frozen-commit, real contact, fair-dodge, recoil, renderer topology, disposal, and projection tests. The solved support contact retains identical x/y coordinates while its plant id is unchanged; a post-commit dodge preserves 56 HP, while a static target is damaged and registers recoil.

Visual rejection and refinement:

- Rejected the first mechanically passing browser capture because the black terrain, oversized head, weak torso, and near-invisible spear made the physical states unreadable. Rebalanced the coloured masses, widened and staggered the stance, increased the pose-only anticipation/drive shift, added a controlled flat proof stage, distinct spearhead, ground attack-line/impact marker, and a 1.55 m proof spear whose tip remains the real gameplay socket.
- Rejected the first video artifact because Playwright had recorded browser boot/setup rather than the proof interval. Replaced it with post-setup `canvas.captureStream` recording and added a sampled normal/slow video contact sheet. The final still and video sheets were inspected at original resolution; idle/locomotion, red wind-up, yellow frozen commitment, active miss, contact recoil, and recovery are visually separable at gameplay zoom.
- Added an explicit promotion hold: recipe raiders compute physical intent in shadow mode, but `poseEnabled` defaults false. Only the fixed-seed proof actor opts in. The finished faceted body, masks, armour, packs, and recipe variation therefore remain on their established compatibility pose until human visual approval promotes this solver.

Final browser and performance evidence:

- `npm run smoke:raider-motion-greybox` passes with 13 still captures, normal-speed and slow-motion WebM captures, sampled video frames, one topology build, zero finished-body actors in the proof lane, and zero console/page/request failures. The report is `artifacts/raider-physical-motion-greybox-v0/report.json`.
- The full 3D performance lane passes at DPR 1 and 1.5 with 16.8 ms frame-interval p95, 2.1/1.0 ms projection p95, 9.4/4.5 ms CPU render-path p95, 8.19/15.031 ms GPU p95, and zero post-ready long frames.
- `npm test`, `npm run test:loc`, `npm run build:playtest`, live-world, rebuilt-package, and smoke-awakening transition browser gates pass. Final browser runs report zero console, page, request, or HTTP errors; the built package exposes no raw source.

Next boundary:

- Hold recipe/family variation and production-body pose promotion. The next decision is human acceptance or one more greybox motion-tuning pass; only an accepted result may enable the solver for the finished faceted raider.

## 2026-08-03 - AXIOM Entity Studio Foundation v0

Delivered foundation:

- Added a versioned BSB entity-authoring bridge with provider-backed target discovery, exact field manifests, non-committed candidates, reversible runtime preview, stale-write rejection, persistence, runtime refresh, and hash/readback-verified apply receipts.
- Added an entity-agnostic AXIOM Entity Studio module. The same Outliner, contextual Details, capability states, candidate diff, Preview/Apply/Revert controls, and receipt footer now serve the baby wyvern, raiders, husks, the explicit werewolf manifest gap, and procedural geology records without a universal guessed schema.
- Human edits and `axiom_entity_tuning_propose` agent proposals enter the same candidate contract. Agent proposals cannot apply automatically or mutate canonical files before review.
- Animated selection pauses and focuses the real BSB runtime while temporarily suspending the hatch/pause/tuning overlays, then restores the prior camera and state when the studio closes. A low-occlusion live raider is preferred for inspection. Stationary geology selection switches to the real Map Forge authoring viewport and frames its canonical record.
- Reused the existing hidden tuning hold only as a simulation/cinematic ownership seam; its old panel is suppressed during the AXIOM session and is not a second authoring authority.
- Hardened `LAUNCH_BSB.bat`'s live-source server: port 5177 is now accepted only when the existing process returns the matching BSB project/root identity. Stale or unrelated port occupants fail loudly instead of being opened as a successful launch.

UX validation and evidence:

- Compared the tail-end layout with Epic's official Unreal Editor/Outliner/Details documentation. The final surface keeps the runtime/map viewport dominant, bounds the searchable Outliner, keeps selection framed, places context-sensitive categorized Details immediately below it, and pins unapplied candidate actions visibly above connection/readback status.
- `npm run test:entity-studio` proves animated target discovery, live focus, human candidate preview, persisted apply/readback, a genuine iframe reload round-trip, non-committed agent proposals, an explicit werewolf manifest gap, stationary geology candidate non-mutation, panel salience bounds, protected-file restoration, and zero unexpected browser errors.
- Evidence: `AXIOM/apps/launcher/output/playwright/entity-studio/entity-studio-proof.json` plus the raider, agent-candidate, and stationary-candidate screenshots in the same directory.

Honest boundary:

- This foundation does not make the current raider production ready. The live studio deliberately exposes the existing faceted body and reports motion as `shadow_only_pending_visual_acceptance`; it does not promote the rejected greybox solver, add new shaders/materials, or pretend the existing silhouette has passed visual review.
- Immediate next slice remains one fixed-seed production raider: rebuild its canonical silhouette around the accepted physical-intention/contact architecture, make the motion readable at gameplay zoom, and require normal-speed plus slow-motion human visual acceptance before family variation returns.

## 2026-08-03 - Camera visibility focus sphere v0 (superseded)

Current request:

- Keep the player wyvern visible when tree canopy, cave ceilings, or other scenery crosses the camera line of sight, and make the same focus treatment available for the currently selected entity in AXIOM Entity Studio.
- Expose the useful visual parameters through the existing provider-backed candidate/Preview/Apply workflow so they are live in the runtime viewport and persist through the canonical tuning owner.

Implementation boundary:

- Add one explicit runtime camera-visibility-focus component with a stable target entity id; normal gameplay targets the player and Entity Studio temporarily targets the selected animated entity.
- Keep per-entity focus presentation values in the existing creature-profile tuning/readback path rather than creating browser-local editor truth.
- Apply a feathered dither-opacity sphere only to scenery materials and add one fixed-slot, non-shadow readability light. Preserve terrain, collision, simulation, gameplay lighting selection, and shared material reuse.
- Require focused projection/renderer tests plus real BSB canopy and AXIOM candidate-preview browser evidence with screenshot and console/page-error inspection.

Implementation progress:

- Added `black-sky-bound.camera-visibility-focus-state.v0` as the single runtime camera target owner. Fresh games target the exact player entity id; Entity Studio selection temporarily retargets it with explicit provenance and restores the prior player component on close.
- Added provider-owned `Camera focus` fields for reveal radius, edge softness, minimum occluder opacity, and readability-light power. They resolve through the existing creature-profile tuning file, candidate preview, persistence, and readback path.
- Added a renderer-neutral focus packet and `ThreeCameraVisibilityFocus`. Cached scenery materials are shader-patched once with a feathered world-space sphere and stable screen-space dither discard; terrain and actor materials are not patched. One fixed non-shadow point light follows the target for low-light legibility without entering gameplay light selection or shadow ownership.
- Focused camera projection, shader patching, cloned-material registration, light lifecycle, creature tuning, Entity Studio session, candidate preview/revert, render-projection, and AXIOM static tests pass.

Final validation and evidence:

- `npm test` passes in BSB V2, `npm test` passes in the AXIOM launcher, and `npm run build:playtest` produces the curated 15-file package with no raw source or source maps. The existing Vite large-chunk advisory remains unchanged.
- `npm run smoke:camera-focus` passes in a fresh real WebGL runtime. The disabled capture loses the hatchling beneath the authored canopy; the enabled capture reveals and lights the exact `young_dragon_1` target through ten patched scenery materials. The report and inspected images are in `artifacts/camera-visibility-focus-v0/`, with zero console, page, request, or HTTP failures.
- `npm run test:entity-studio` passes against a fresh isolated BSB runtime. It proves exact selection retargeting, live camera-focus candidate preview, persisted Apply/readback after iframe reload, protected tuning-file restoration, and zero unexpected browser errors. Evidence is in `AXIOM/apps/launcher/output/playwright/entity-studio/`.
- The full performance lane was run twice and remained red for nondeterministic whole-simulation gates: first for a 20.7 ms frame-interval p95 despite sub-budget 9.9 ms CPU and 11.765 ms GPU p95, then for a tail mesh-count fluctuation as live actor/effect counts changed. The focus owner adds zero meshes; a focused test now asserts its only scene object is one fixed non-shadow point light. No threshold or visual quality setting was weakened.

Operational note:

- A BSB server that was already running on port 5177 before this slice retains Node's old tuning-validator module cache and must be restarted before manual AXIOM Apply accepts the new fields. Fresh launches, including the hermetic AXIOM proof server, accept and persist them correctly.

## 2026-08-03 - Camera visibility focus visual correction

Rejected result:

- Human review correctly rejected the target-centred v0 sphere. Although its bridge, persistence, and shader wiring worked, it faded every eligible fragment around the actor without proving that the fragment lay between the camera and target. At close authoring zoom this produced a broad stippled clearing rather than a deliberate visibility cut.

Correction implemented:

- Replaced sphere semantics with a camera-to-target corridor appropriate to the orthographic renderer. Nine parallel rays sample the target-sized circular cross-section; only exact static occluder objects hit before the target activate their existing material uniforms.
- The fragment shader now measures distance to the finite camera-target segment. Objects beside the corridor and surfaces behind the target stay opaque even when they share a patched material.
- All projected scenery is registered with stable object identity. Terrain surfaces must opt in as camera occluders; current ordinary ground is excluded, while blocked terrain obstacles and future eligible ceiling surfaces use the same trace registry.
- Retuned the default cross-section from a 3.6 m sphere to a 1.15 m sightline cut with a 0.3 m feather, 4% blocker opacity, and 650 lm readability light. AXIOM now labels the control as a traced sightline rather than a sphere.

Proof so far:

- Focused projection, cross-section trace, off-sight rejection, behind-target rejection, ceiling-role, shader, light, tuning, Entity Studio runtime, and AXIOM static tests pass.
- `npm run smoke:camera-focus` passes in a fresh real WebGL runtime. It identifies the exact authored canopy tree plus two additional trees crossing the sampled corridor, activates two shared blocker materials, and reports zero browser errors. The inspected v1 capture visibly reveals the full hatchling through a localized circular cut while the surrounding canopy remains solid.
- A first v1 browser attempt failed because normalization allowed 2.5% opacity while the tuning manifest still clamped to 3%; the bounds were unified and the proof was rerun successfully. No silent fallback was accepted.

Final validation:

- The complete BSB V2 `npm test` suite and `npm run build:playtest` pass after the trace correction. The curated playtest remains 15 files with no raw source or source maps; the existing Vite large-chunk advisory is unchanged.
- The final `npm run smoke:camera-focus` browser run passes against the corrected source with a 9-sample trace, 17 broad-phase candidates, three exact tree blockers, two active blocker materials, and zero console, page, or request failures. Evidence is in `artifacts/camera-visibility-focus-v1/`.
- The final AXIOM static and Playwright Entity Studio gates pass. The selected runtime entity remains visible through its localized sightline cut while candidate radius edits preview in the real embedded runtime; protected tuning files are restored. Evidence is in `AXIOM/apps/launcher/output/playwright/entity-studio/`.
- Hidden-iframe readiness now uses time-based polling and a 30-second cold-WebGL command window. Redundant delayed bridge forwarding was removed because `postMessage` already provides the required asynchronous boundary; direct snapshot measurement remains only a few milliseconds once the runtime is ready.

## 2026-08-04 - Baby-wyvern drool visual approval candidate

Regression and ownership:

- The pre-3D WebGL drool used stretched liquid triangles, a previous-position trail, contact shadow, and layered irregular pool radials. The first Three.js path collapsed that into detached emissive icosahedra and one circular ground disc, ignored the forming/separation stages and real height, and lost most pool material metadata.
- The baby source remains the canonical `WyvernProjection.sockets.mouth` plus bounded napalm render-layer state. Mama flyovers, projected breath, fire walls, tree fire, and inferno pools remain on their existing world-event path and were not changed.

Focused implementation:

- Added an explicit forming/hanging/separated lifecycle that follows the live mouth until separation, then freezes its separation anchor and falls through real Three.js height with motion carry. Cadence and optional every-fourth secondary splits use deterministic variation; secondary liquid lands and may merge into a nearby bounded patch.
- Added a dedicated baby-only Three.js presentation root with twelve fixed instanced families for contact shadow, strand, weighted body/core, short smoke, two-to-three pool lobes, active edge/hot root, impact crown/beads, rooted flame, and sparks. It reuses the existing budgets and physical-light seam, owns no per-frame mesh/material construction, and disposes its fixed geometry/material set.
- Shortened the baby pool lifecycle to 6.8 s, limited flame to 2.4 s and heat to 3.1 s, reduced the local light to 0.42 tile radius / 0.10 intensity, retained dark viscous/cooling colours, and preserved the legacy WebGL material and irregular-pool contracts.

Visual and performance proof:

- The fixed pre-change proof is `artifacts/baby-wyvern-drool-visual-approval/baseline-pre-upgrade/report.json`. The inspected candidate proof is `artifacts/baby-wyvern-drool-visual-approval/approval-candidate-final/report.json`, with nine captures covering mouth formation, stretch, airborne travel, impact, deposit/flame, cooling, moving/turning at normal and close zoom, and sustained use. Both runs use 1440x900, the same clear arena and renderer path; the candidate reports zero console, page, request, droplet-budget, or pool-budget failures and zero Mama flyovers.
- In the same 720-frame deterministic moving/turning scenario, P95 frame interval stayed at 17 ms, measured tick P95 improved from 13.2 to 10.7 ms, and render-path P95 improved from 9.1 to 6.2 ms. Draw calls fell from 241 to 125, pooled objects from 559 to 487, meshes from 699 to 639, and materials from 598 to 538. The candidate adds a small triangle cost (43,710 to 45,644) for the liquid silhouettes; GPU-query P95 was 8.628 ms versus 7.507 ms in this individual run while repeat candidate runs varied materially, so frame interval and end-to-end tick/render path remain the acceptance signals.

Validation and remaining boundary:

- `npm test` and `npm run build:playtest` pass. Focused mouth-follow, turn/separation, real-height fall, secondary landing, pool stage, instancing/capacity, renderer reuse, light, smoke, Mama event, and Mama mesh tests pass. The curated build remains dependency-free beyond the existing project and retains the existing Vite large-chunk advisory.
- The intentionally tiny effect remains subtle in a single still and its smoke is visibly faceted at close inspection because the renderer uses bounded low-poly instancing rather than soft-particle shaders. The artificial 12.24 s orbit stress frame exposes the full live 15-pool/75-ember envelope, but counts stay capped, no emissions are dropped, and the 6.8 s lifecycle cleans old droplets, pools, lights, and fading scorch decals. Final aesthetic approval remains human-owned.

## 2026-08-06 - Desktop launcher consolidation and production threat audio

Runtime repair:

- Consolidated the accepted heartbeat and raider-warning work into the Desktop checkout owned by `LAUNCH_BSB.bat`; normal playtesting no longer depends on selecting a Codex worktree.
- Replaced the procedural heartbeat with one decoded 8.23-second mono production loop and the oscillator raider warning with five short recorded human variants. Both cues are required file assets, expose decoded-file provenance in runtime diagnostics, and have no synthetic fallback branch.
- Retained 24-bit masters, the editable Audacity heartbeat project, a portable Audacity raider session, unaltered source recordings, processed stems, and Pixabay licence notes beside the runtime assets.
- Extracted shared decoded-buffer playback so file-backed one-shots and loops use the same asset bank, error reporting, pitch, routing, and lifecycle contract.

Launcher durability:

- `tools/launch.mjs` now verifies both project identity and exact checkout root before reusing an occupied port. A different worktree or unrelated process is skipped automatically; the launcher advances to a free local port and opens the correct Desktop checkout.
- Runtime identity reports the preferred and active ports. Every served source and audio response retains `Cache-Control: no-store`.
- Added a deterministic launcher regression covering wrong-worktree collision recovery, exact-root reuse, runtime identity, production-audio HTTP availability, and cache policy.

Validation:

- The full `npm test` suite, focused production-audio tests, syntax checks, `git diff --check`, and `npm run test:launcher` pass.
- Real Edge/Chromium proof launched the Desktop root with a deliberately occupied preferred port, recovered from port 53702 to 53703, decoded all six new runtime files at 48 kHz, activated the low-health file-backed heartbeat, and exercised all five raider-warning variants.
- The browser proof reports zero console errors, page errors, failed requests, HTTP errors, or audio errors. Evidence is in `artifacts/local-launcher-consolidation-v1/`.

## 2026-08-06 - Baby wyvern bite production replacement v2

Playtest correction:

- Rejected the two seeded procedural bite files as cartoon-like and bonk-y. Their generated noise, chirps, resonances and tooth clicks were not retuned or disguised; `make_bite` and both legacy output calls were removed from the old production generator.
- Built three new 0.48-second mono variants from retained real recordings: animal breath/snarl, jaw-on-bone closure and a restrained wet-food detail. Original downloads, Pixabay source/artist/licence notes, source hashes, aligned 24-bit stems, 24-bit masters and a portable Audacity LOF session are retained.
- Moved the authored jaw closure from the old 128-142 ms range to 195 ms, matching the bite profile's 0.34 s duration x 0.58 hit timing (197 ms). Kept the wet layer quiet because the bite action can miss and `combat.enemy.hit.flesh` separately owns confirmed contact.
- Added a third real variation and narrowed runtime pitch randomisation from `0.96-1.035` to `0.985-1.015`, so variation comes from actual source performance rather than cartoon pitch movement.

Evidence and validation:

- The deterministic source-based generator emits masters, runtime assets, aligned stems, comparison reel, contact sheet and a machine-readable analysis contract with zero synthetic production layers.
- The exact Desktop launcher browser proof used the real third-combo `bite_attack` input, observed the decoded file cue, rotated all three variants, and verified every asset as 0.48-second mono 48 kHz audio served with HTTP 200 and `Cache-Control: no-store`.
- Browser proof reported zero audio, console, page, request or HTTP errors. `npm test`, `npm run test:launcher`, `npm run build:playtest` and `git diff --check` pass; the curated build contains all three bite files among 15 manifest-derived production audio files.
- Evidence is in `artifacts/player-bite-v2/`; design, provenance and reproduction notes are in `docs/PLAYER_BITE_PRODUCTION_V2.md`.

Next audio ownership:

- Opening Exterior Soundscape v1 is now the active slice: replace procedural thunder, husk, werewolf and distant-raider cues with recorded sources authored through the closed-shell perspective.
- The dedicated hatchling first cry follows separately. The current full Mama roar must stop owning that newborn release beat; Mama may answer later if the story mix supports it.

## 2026-08-07 - Opening exterior soundscape v1

Production replacement:

- Replaced the oscillator/noise thunder roll, werewolf howl, husk gargle and distant raider shout with recorded-source required file cues. Deleted their four callable procedural renderers rather than leaving hidden fallback paths.
- Retained five new unchanged Pixabay downloads: a dry rolling field thunder, a solo wolf, a second wolf-pack performance, a human-performed gurgling creature vocal and a real gargle recording. Reused the already retained `(Male) Grunts and Yells` raider source and its existing licence record.
- Authored two reusable stereo normal variations per family first, then two separately rendered opening-only shell derivatives per family. No generated vocal, oscillator, synthetic noise layer or Mama-wyvern vocal is present in the sixteen new production files.

Perspective ownership:

- Normal cues remain `world.storm.thunder`, `enemy.werewolf.distant_howl`, `enemy.husk.distant_gargle` and `enemy.raider.distant_shout`; they retain full useful bandwidth and source-derived normal-distance reflections for post-opening events.
- Added four explicit opening cue identities under `opening.exterior.*_through_shell`. Each has a family-specific wall-transmission ceiling, body-conduction band, source-derived cavity smear and narrowed stereo field.
- Kept `resolveOpeningMix()` and the Audio Bus low-pass as the live shell-opening transition. The first four exterior events use the shell derivatives; `husk_now_exposed` switches back to the normal husk cue as the hatchling emerges.

Source and editability evidence:

- Retained provider pages, artist names, Pixabay Content License, hashes, exact source windows, processing notes and master/runtime hashes in `assets/audio/sources/opening_exterior_v1/`.
- Added 32 aligned 24-bit source-derived stems, 16 lossless masters, 16 runtime WAVs, a portable 48-reference Audacity LOF, a normal-versus-shell A/B reel and a waveform/spectrum comparison sheet.
- Added the deterministic source-based generator `tools/audio/generate_opening_exterior_v1.py` and pinned dependency list.

Validation:

- Focused opening, Audio Director and production-SFX tests pass; the production test proves every cue is required file audio, every shell asset loses high-frequency air and at least 6 dB of stereo-side energy versus its normal parent, every LOF reference resolves, and the removed placeholder modes have no callable implementation.
- Full `npm test`, `npm run test:launcher`, `npm run build:playtest` and syntax checks pass. The curated package now contains 31 manifest-derived production audio files among 38 total files, with no raw source or source maps; the existing Vite large-chunk advisory remains unchanged.
- Fresh exact-Desktop launcher proof drove the real six-input opening. It observed the four shell cues in authored order at live muffle values `0.800`, `0.800`, `0.800` and `0.748`, then the exposed normal husk at `0.334`.
- The same browser run decoded all sixteen new assets as required stereo 48 kHz files, rotated both normal variants of every family at zero muffle after release, received HTTP 200 plus `Cache-Control: no-store` for every file, and reported zero audio, console, page, request or HTTP errors.
- Evidence is in `artifacts/opening-exterior-v1/`; design and reproduction notes are in `docs/OPENING_EXTERIOR_SOUNDSCAPE_V1.md`.

Next audio ownership:

- The dedicated hatchling first cry remains next. It must be a newborn baby-wyvern identity and must not reuse or pitch-shift the Mama roar.
- Egg rock/crack/break production replacements follow separately, then the opening mix/transition pass and remaining combat palette.

## 2026-08-07 - Opening audio perspective authoring v1

Current request and boundary:

- Make the through-egg perspective tunable from AXIOM before balancing the next production vocal, especially shell thickness, muffling and perceived exterior distance.
- Confirmed the existing opening path is non-positional: its distance is authored into source assets and event intensity. There are no listener/source positions or Web Audio `PannerNode` emitters, so true 3D attenuation is explicitly a later slice.

Canonical implementation:

- Added a dedicated BSB audio override schema and five-field opening manifest: sealed cutoff, sealed exterior gain, maximum muffle, crack-light leakage and emergence exposure rate.
- Separated opening shell cutoff from the health-muffle floor, added real exterior gain scaling for authored opening soundscape events, and published effective cutoff/gain plus the non-positional boundary in Audio Director diagnostics.
- Added validated `GET`/`PUT /api/tuning/audio-overrides`, a separate `tuning/audio-overrides.json` owner and browser boot loading without borrowing creature tuning.
- Added one BSB runtime-profile provider to AXIOM Entity Studio. Candidate creation, Preview, revert, Apply and receipt/readback use the existing governed runtime bridge; selecting the profile restarts the real opening for audition.
- Repaired audio unlock readiness so `unlocked` becomes true only after the AudioContext resumes and every required production preload settles. This prevents required loops from entering the player while their decoded asset is still in `loading` state.

Evidence and validation:

- The real AXIOM Entity Studio proof changed the sealed cutoff from 560 Hz to 520 Hz, previewed it in a restarted opening, drove four egg-opening inputs and observed three exterior shell cues. The bus consumed 520 Hz; the storm cue consumed 0.46 exterior gain at 0.92 muffle.
- Apply persisted through `tuning/audio-overrides.json`, returned verified readback, and an iframe reload read 520 Hz from the canonical target. The proof restored every protected source file and reported zero unexpected console, page, HTTP or request failures.
- AXIOM visibly labels the target `authored distance · non-positional` and `3D falloff not active`. Runtime diagnostics report `listenerRelativeAttenuation: false` and `spatialEmitterCount: 0`; no false spatial authoring claim was introduced.
- Focused schema, Audio Director, unlock-lifecycle, Entity Authoring and AXIOM static tests pass. Full BSB and AXIOM suites, the exact-root launcher test, line-of-code gate, curated build and `git diff --check` pass.
- Design, field ranges, ownership and the current attenuation boundary are recorded in `docs/OPENING_AUDIO_PERSPECTIVE_AUTHORING_V1.md`. Browser evidence is in `AXIOM/apps/launcher/output/playwright/entity-studio/`.

Next audio ownership:

- Baby Wyvern First Cry v1 is active again. It must start from a normal, reusable newborn hatchling vocal and derive any through-shell opening variation from it; it must not reuse or pitch-shift Mama's roar.
- Spatial Audio Emitter Foundation v1 follows as a separate infrastructure slice for listener/source coordinates, reference distance, rolloff and panning.
