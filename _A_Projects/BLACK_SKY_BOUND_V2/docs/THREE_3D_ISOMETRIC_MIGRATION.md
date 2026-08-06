# Three.js 3D Isometric Runtime

Status: default runtime renderer as of 2026-07-30.

## Ownership

- The ECS and fixed-step systems own transforms, poses, collision, contact windows, damage, and map progression.
- Renderer-neutral projections are read-only inputs to Three.js.
- `black-sky-bound.world-transform-3d.v1` maps gameplay X/Y to render X/Z and metres to render Y. One tile is 0.5 metres.
- `black-sky-bound.procedural-tree-spatial-recipe.v1` resolves Tree DNA into one deterministic spatial skeleton, render geometry metadata, and a trunk/root footprint. Canopy geometry is never a gameplay collider.
- `black-sky-bound.collision-shape-2d.v1` and the environment collision index own static planar collision.
- `black-sky-bound.body-contact-rig.v1` owns stable body capsules, pose-following hurt volumes, and swept attack capsules.

## Renderer policy

- `webgl3d` is the default. `renderer=webgl` is a compatibility alias to the same backend.
- Initialization and unsupported renderer failures are visible errors; there is no silent renderer fallback.
- The gameplay camera is a fixed 45-degree bearing and 50-degree elevation orthographic camera. Wheel input changes zoom; normal play cannot rotate it.
- Three.js uses sRGB output, ACES filmic tone mapping, physical inverse-square local lights, and `MeshStandardMaterial` surfaces.
- The moon may cast a directional shadow. At most two local point sources own point shadows, with criticality/proximity selection and 500 ms hysteresis.

## Runtime scene

- Terrain uses instanced geometry; blocked terrain is visibly raised and emits matching planar collision.
- All authored scenery kinds are converted. Unsupported kinds render magenta, enter diagnostics, and fail the live browser gate.
- Trees cache geometry by resolved DNA signature. Scenery, actors, effects, and UI own explicit disposal lifecycles.
- Procedural wyvern, humanoid, and predator bodies consume the solved simulation poses.
- Decals, hazards, projectiles, smoke, rain, particles, fire, dragonfire, lightning, Mama flyovers, fog, transitions, tutorial, HUD, pause, and player lifecycle are represented in the 3D or screen-space layer appropriate to their contract.

## Performance and retirement

- Terrain and rain use instancing; normal frustum culling remains enabled.
- Static shadow maps invalidate only when light ownership changes. Static scenery and actor shadow casters use bounded proximity LODs.
- The legacy WebGL2D factory is not registered, imported, or included in the production bundle. Its dirty in-progress source modules remain on disk to preserve the pre-existing worktree, but they are unreachable from runtime.
- The permanent regression scene is `?reference=tree-grove`; diagnostics toggle with F3 or `?debug3d=1`.

## Gates

- `npm test`
- `node tests/locBudget.test.mjs`
- `npm run build:playtest`
- `node tests/playtest/webgl3dReferenceGrove.playtest.mjs`
- `node tests/playtest/webgl3dLiveWorld.playtest.mjs`
- `node tests/playtest/webgl3dBuiltPackage.playtest.mjs`
- `BSB_RENDERER=webgl3d node tests/playtest/smokeAwakeningHandoff.playtest.mjs`
- `BSB_RENDERER=webgl3d node tests/playtest/mamaWyvernFlyover.smoke.mjs`

## Stabilisation contracts

- `black-sky-bound.renderer-neutral-3d-projection.v1` is the live browser projection. Its compiler owns an immutable static-world cache plus dynamic-world and screen packets, and exposes `compile(state)` / `dispose()` lifecycle boundaries without importing Three.js objects.
- `black-sky-bound.render-frame-timing.v2` measures the complete frame, including simulation and projection work outside `ThreeGameRenderer.renderProjection`, and separates cold-start work from warm runtime samples.
- Immutable creature profiles are cached by base-profile and replace-on-write tuning identity. The 3D compiler reuses already-detached actor-view subtrees instead of serialising them a second time, while world-coordinate rig projection remains freshly derived each frame.
- Frame timing still records every frame; percentile snapshots are published every four warm frames so optional diagnostics do not become a frame-budget cost themselves.
- `black-sky-bound.procedural-wyvern-mesh-recipe.v1` owns reusable render topology only. The solved rig and `black-sky-bound.body-contact-rig.v1` remain authoritative for pose and contact.
- The opening continues to consume `renderer_neutral_embodied_hatch_projection_v2`. World shell visibility and the narrative camera-space shell interior have independent opacity rules.

## Current measured baseline

- At locked 1440x900 DPR 1: frame-interval p95 12.6 ms, simulation p95 6.6 ms, projection p95 1.2 ms, CPU render-path p95 7.4 ms, GPU p95 7.566 ms, and no post-ready frame above 50 ms.
- At the playtest machine's actual DPR 1.5 and native 2160x1350 render surface: frame-interval p95 16.8 ms, simulation p95 6.5 ms, projection p95 1.1 ms, CPU render-path p95 7.8 ms, GPU p95 14.769 ms, and no frame above 50 ms.
- The renderer-neutral budget remains 32 selected sources. The live stress scene uses 22, so Three.js precompiles 24 content-complete physical slots rather than evaluating 32 slots per fragment. No source is dropped; any future overflow automatically reveals F3 with `degraded_visible` diagnostics.
- No automatic render-scale change, physical-light reduction, or shadow-slot reduction is permitted to conceal a high-DPI failure.

## Playable hatchling surface

- The rig-driven mesh now batches paired hornlets, seven dorsal spines, four shoulder/haunch plates, six hind toes, and four wing talons as reusable instances.
- Deterministic per-face albedo tones preserve faceted head, chest, haunch, limb, membrane, horn, claw, and spine structure under moon, torch, smoke, and lightning illumination.
- Normal play keeps diagnostics hidden. The pose regression scene captures clean visual frames and one explicit F3 contact-alignment frame.

Additional gates:

- `node tests/playtest/webgl3dPerformance.playtest.mjs`
- `node tests/playtest/webgl3dWyvernPoses.playtest.mjs`
- `node tests/playtest/webgl3dOpeningWyvern.playtest.mjs`
