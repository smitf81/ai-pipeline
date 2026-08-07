# Terrain Material Rendering Baseline

Recorded before the terrain-material implementation on 2026-07-31.

## Scope boundary

This document describes the renderer that was active before the grass, compacted-dirt, and scorched-earth material slice. It distinguishes active runtime code from retained legacy experiments so the new work does not accidentally create a second terrain authority.

The slice may change terrain presentation, material data, deterministic detail geometry, and renderer diagnostics. It must not change Map Forge's terrain IDs, runtime-map interchange, collision, movement costs, terrain blocking, scene-object ownership, or gameplay state.

## Current terrain truth and Map Forge path

1. AXIOM Map Forge owns a rectangular `tiles[y][x]` array. Its terrain palette contains the stable string identities `grass`, `forest`, `dirt`, `water`, `rock`, and `scorched` in `../../AXIOM/apps/launcher/public/bsb-v2-map-authoring.js`.
2. `buildBsbV2RuntimeMap()` copies that tile array unchanged into `black-sky-bound.runtime-map.v0`. It does not bake renderer meshes, UVs, texture coordinates, material indices, splat maps, or derived connected-tile caches.
3. `src/world/runtimeMapLoader.js` validates every tile against `TerrainType`, rejects unknown identities, creates scene objects, and derives `blobMasks` after loading. It does not silently replace an invalid map.
4. `src/world/terrain.js` owns gameplay-facing terrain definitions: label, fallback/editor colour, movement cost, blocking/obscuring semantics, and the stable terrain material-profile ID.
5. Collision reads the same tile identities through `isTileBlocked()` in `src/physics/environmentCollision.js`. The renderer is not a collision or movement authority.

Map Forge therefore already provides the right durable contract for layered rendering: an authored terrain identity per tile. Renderer-only blend masks, scatter candidates, textures, and mesh batches should continue to be derived from that identity grid.

## Renderer-neutral projection path

`src/projection/terrainProjection.js` expands the map to one renderer-neutral packet per tile. Each packet carries:

- tile/world position and dimensions;
- the canonical terrain `type`;
- fallback colour;
- `materialProfileId` and a projected material packet;
- blocking and obscuring flags;
- a 4-way connected rule and terrain-spline record for grass and dirt.

The material registry is `src/data/materialProfiles.js`. Grass maps to `soil_grass`, dirt to `soil_dirt`, and scorched terrain to `scorched_soil`. Before this slice those profiles contain scalar base colour, roughness, metalness, emissive, alpha, and visual-state defaults only. They do not identify colour, normal, roughness, AO, height, or blend textures.

`src/projection/renderProjection3D.js` caches the complete static terrain/scenery projection by map identity, revision, dimensions, scene-object count, and tile size. A stable map does not rebuild terrain projection every frame.

## Active Three.js rendering path

The default and only supported runtime backend is `webgl3d`; a `renderer=webgl` request is normalized to the same Three.js backend. `src/render/renderer.js` compiles the renderer-neutral 3D projection, and `src/render/backends/three/ThreeLiveWorld.js` consumes it.

Before this slice, `ThreeLiveWorld.buildTerrain()`:

- groups projected tiles by terrain type;
- creates one `BoxGeometry` and one `MeshStandardMaterial` per present type;
- creates one `InstancedMesh` per present type;
- submits one instance per tile at a common floor height, except shallow water and raised blocked terrain;
- uses the profile's flat base colour and scalar roughness;
- enables receive-shadow for all terrain and cast-shadow only for blocked terrain.

This is already batched by terrain type and does not issue per-tile draw calls. A typical six-terrain map costs up to six terrain draw calls. The static world is rebuilt only when its cached signature changes.

The floor geometry uses Three.js's default `BoxGeometry` UVs independently on every tile. No UV transform or world-space coordinate is supplied. Because no texture maps are bound, there is currently no active atlas bleeding, mipmapping, texel-density, normal-orientation, or texture-seam handling to inherit. The visible flatness comes directly from constant material colour/roughness on repeated coplanar boxes.

## Existing groundwork that can be reused

- Stable terrain IDs from Map Forge and runtime maps.
- `TerrainType` gameplay/collision ownership.
- Terrain-to-material-profile mapping and fail-fast profile lookup.
- Static projection caching.
- One `InstancedMesh` per terrain type rather than per-tile meshes.
- Deterministic 4-way connected masks for grass and dirt.
- Terrain spline/joinery metadata derived from those masks.
- Three.js physical moon/local lights, shadows, fog, tone mapping, GPU timer queries, draw/triangle diagnostics, and the F3 diagnostics overlay.
- Authored scene-object positions and physical bounds, which can inform deterministic detail exclusion and natural-boundary bias without becoming terrain truth.
- Procedural tree, fern, shrub, leaf-litter, and root-decal work. These are scenery objects, not a general grass-detail system.

## Retained but inactive experiments

`src/render/backends/webgl/layers/WebGLTerrainLayer.js` belongs to the retired pre-Three WebGL renderer. It contains useful research:

- a cached Canvas-generated whole-map colour texture uploaded once per terrain revision;
- continuous low/high-frequency procedural colour variation;
- bilinear terrain membership blending;
- connected-rule rounding and dirt edge/corner/mottle primitives;
- a flat-colour fallback when the texture path is disabled.

This code is not reached by the current backend. Its colour-generation and connected-boundary ideas may inform the new system, but its Canvas upload, no-mipmap `CLAMP_TO_EDGE` texture, and flat fallback should not be revived as a parallel runtime renderer.

No active normal maps, roughness maps, AO maps, height maps, displacement, texture arrays, atlas pages, splat masks, terrain chunks, or grass instancing were found. Normal/roughness/AO groundwork exists only as scalar material fields and standard Three.js lighting support.

## Tilesheet/atlas assessment before implementation

There is no active terrain tilesheet to preserve or replace. Introducing a decorative tile atlas would add UV borders and mip bleeding while encouraging each authored tile to read as a self-contained square. Separate repeat-wrapped PBR textures or same-sized texture-array layers are a better fit for continuous world-space sampling.

The smallest justified direction is:

- retain the authored tile grid and existing static projection cache;
- retain instancing and collapse the three target floor types into a shared material batch where practical;
- derive a renderer-owned, map-sized blend/splat mask from terrain IDs at static rebuild time;
- sample same-density seamless material layers in world space, with mipmaps and repeat wrapping, so no atlas gutter is required;
- keep forest, water, and blocked rock on their current path unless a small adapter is required for correct overlap;
- add one instanced grass-detail batch with deterministic candidates, occupied-area exclusion, density tuning, and distance culling.

This is narrower than a biome system and leaves Map Forge, runtime-map JSON, collision, and gameplay semantics unchanged.

## Baseline risks and measurements still required

- The current terrain has no visual blending in the active backend; authored boundaries are hard box edges.
- The connected grass/dirt metadata is projected but ignored by the active Three.js terrain renderer.
- Existing whole-frame performance varies by machine and scene. A fixed-camera baseline must be captured before implementation, then repeated with the same map, camera, lighting, viewport, DPR, and warm-up.
- The shared repository is already dirty with unrelated work. Terrain changes must be limited to the documented slice and must not rewrite existing map or gameplay files.

## Locked visual/performance baseline

The pre-change browser proof is `artifacts/terrain-material-v1/baseline/report.json`. It used real Chromium/Edge through project-local Playwright at 1440x900, DPR 1, with the production Three.js backend and GPU timer queries enabled. The fixture stopped simulation, removed transient actors/effects/weather, installed deterministic moon/torch packets, and rendered fixed frames at these authored-map coordinates:

- close grass: `(40.5, 15.5)`;
- broad repeated grass: `(40.5, 11.5)`;
- grass/dirt boundary: `(34, 45.5)`;
- scorched/grass boundary: `(47, 52.5)`.

The same script, coordinates, zooms, render time, lights, viewport, and DPR are the required after-change comparison.

Baseline measurements at the grass/dirt proof camera:

- draw calls: 155;
- triangles: 130,168;
- manual render-path p95: 2.4 ms over 120 measured frames;
- GPU p95: 8.816 ms (`EXT_disjoint_timer_query_webgl2` supported, not disjoint);
- renderer resources: 153 geometries, 3 textures, 1,927 meshes, 579 materials, 65 overlay DOM nodes;
- ground-detail toggle: absent;
- terrain material-ID and normal-only views: absent;
- browser console errors, page errors, and request failures: zero.

Visual inspection of `01-close-grass.png`, `03-grass-dirt-boundary.png`, and `08-large-grass-area.png` confirms constant-colour floor surfaces, straight square joins, no normal response, no world-scale variation, and no grass detail geometry. Large dark areas rely almost entirely on silhouettes and lighting, as intended, but the floor itself contributes no material read.
