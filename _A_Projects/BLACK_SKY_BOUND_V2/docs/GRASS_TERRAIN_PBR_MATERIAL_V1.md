# Grass Terrain PBR Material v1

Completed and browser-gated on 2026-08-11.

## Outcome

Authored `grass` floor tiles now use a generated, project-owned 1024x1024 stylized PBR set instead of the original 128x128 procedural grass layer. The new surface is dark, short, matted wild turf over damp soil: readable from the gameplay camera, restrained under moonlight, and detailed enough to support close views without competing with the existing sparse 3D grass clumps.

Only the grass contribution was replaced. The shared layered floor batch, renderer-owned organic contour mask, dirt and scorched layers, tile IDs, collision, movement cost, saved map data, shadows, diagnostics and grass-detail scatter remain under their existing owners.

## Source and derivation

The already-created Black Sky Bound rock albedo was used only as a style-and-finish reference. No rock shapes or texels were copied into the grass surface. A new neutral-lit grass albedo was generated with the built-in ImageGen workflow using this production prompt:

> Use case: stylized-concept. Asset type: production PBR terrain texture source for the grass floor of a dark top-down Three.js action game. Image 1 is a style and finish reference only. Match its restrained hand-authored stylized realism, material scale, subtle surface variation, and muted Black Sky Bound palette; do not include stones or copy its pattern. Create one perfectly seamless square tileable albedo/base-colour texture of dense very short matted wild grass and low turf over dark damp soil. Use organic interlocking patches with occasional thin soil breaks and small flattened leaf/fibre shapes, readable from an isometric gameplay camera without becoming noisy. Use orthographic top-down framing, flat neutral illumination, deep desaturated moss, olive and forest greens over charcoal-brown soil, and no baked light, shadows, highlights, wet shine, long upright blades, flowers, rocks, labels, borders or watermarks. One tile represents about 1.6 metres.

The grass output is project-generated, but the upstream user-supplied image that informed the earlier rock generation was not independently licence-verified. Runtime diagnostics preserve that uncertainty rather than making a new rights claim.

The retained generated source is `assets/textures/terrain/stylized-grass-v1/source-generated.png`. `tools/textures/generate_stylized_grass_pbr.py` then deterministically:

- normalizes the source to a power-of-two 1024x1024 runtime set;
- removes broad baked-light drift while preserving the turf/soil colour structure;
- applies a narrow tapered periodic correction so opposing U/V edges match exactly;
- derives a vegetation-aware shared height interpretation;
- derives an OpenGL normal, AO, dielectric roughness, zero metallic and packed ORM set.

An initial 48-pixel periodic correction was rejected during visual inspection because its height output created an unnecessarily broad edge band. The accepted version uses a 12-pixel correction and retains exact opposing edges without a visible border treatment.

The runtime set is:

- `albedo.png`;
- `normal-open-gl.png`;
- `orm.png` (`R = AO`, `G = roughness`, `B = metallic`);
- `height.png`.

Separate `ambient-occlusion.png`, `roughness.png` and `metallic.png` authoring outputs are retained for inspection and future tooling. Metallic is black because grass and soil are dielectric materials.

## Runtime material

`src/render/backends/three/ThreeGrassTerrainPbrTextures.js` owns the texture descriptor, browser loading, headless state, diagnostics and disposal. `src/render/backends/three/ThreeTerrainMaterialSystem.js` samples the authored grass channels while continuing to sample procedural dirt and scorch from the existing texture arrays.

- Texture scale is 1.6 metres, matching the existing three-layer terrain contract.
- Continuous world-space UVs and the existing dual rotated micro-sample prevent phase resets at gameplay tile boundaries.
- The existing broad macro variation and organic material blend mask remain active.
- The packed ORM response replaces only the grass surface contribution; dirt and scorch keep their existing roughness/AO/detail values.
- Height is retained for inspection and future tooling but does not displace geometry or collision.
- All grass/dirt/scorch tiles remain one shared `InstancedMesh` and one floor draw batch.
- Texture loading is fail-visible: incomplete or failed browser loads render grass contributions magenta and emit a console error. Headless source tests report `headless_descriptor`, never a false `ready` state.
- F6 material-ID and normal-only views work with the authored grass normal.

## Validation

- `node tests/terrainMaterialSystem.test.mjs` — passed; asset resolution, 1024 dimensions, scale, OpenGL normal orientation, headless/fail-visible state, shader wiring and the four-map runtime contract are covered.
- `node tests/playtest/terrainMaterials.playtest.mjs grass-pbr-v1` — passed in the production Three.js browser path with all four grass textures ready and zero texture, console, page or request errors.
- The focused browser camera measured 123 calls and 130,432 triangles with detail off. Detail on retained 303 of 1,397 deterministic clumps, added exactly one draw and 9,090 triangles, and measured 16.0 ms frame-interval p95, 3.0 ms render-path p95 and 14.663 ms GPU p95 in the off sample.
- `npm test` is currently blocked before the grass tests by an unrelated missing `src/data/treeFireStates.js` import from the in-progress tree-fire work.
- `npm run build:playtest` is blocked by the same unrelated missing module, so a fresh built-package browser smoke cannot be claimed for this slice. The focused source-browser material gate above is the current visual/runtime proof.

Browser evidence is under `artifacts/terrain-material-v1/grass-pbr-v1/`. The acceptance views include `01-close-grass.png`, `02-gameplay-height.png`, `03-grass-dirt-boundary.png`, `08-large-grass-area.png` and `debug-normal-only.png`.

The separate whole-game stress gate is not claimed by this focused material proof. Its preceding rock-material runs exposed a known frame-interval failure despite lower render-path timings, so stable full-game 60 FPS remains a named project proof gap rather than being inferred from the grass camera.

## Deliberate boundary

This is a surface-material change. It does not alter canonical terrain IDs, collision, movement, Map Forge serialization, dirt/scorch art, the organic contour algorithm, grass-clump geometry, wind, interaction bending or displacement.
