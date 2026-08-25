# Rock Terrain PBR Material v1

Completed and browser-gated on 2026-08-11.

## Outcome

Authored `rock` terrain is no longer rendered by the legacy constant `#565a60` material. The existing blocked-tile geometry, collision ownership, height, shadows, instancing, map IDs and runtime-map contract are unchanged, while one dedicated material now samples a reference-derived stylized rock PBR set in world space.

The visual result is a continuous field of irregular charcoal stone slabs and dark packed seams. The same scale continues across adjacent tile tops and projects onto the vertical cliff faces instead of restarting a UV square on every tile.

## Source and derivation

The user supplied `ChatGPT Image Aug 11, 2026, 09_49_26 AM.png` as the visual brief. That composite sheet is not shipped. It was used as a reference for one clean generated albedo with this production prompt:

> Create a perfectly seamless square tileable albedo of closely packed irregular slate-grey rock slabs with narrow dark earthy seams and small stone chips, matching the reference's restrained stylized realism. Use orthographic top-down framing and neutral diffuse illumination. Exclude labels, swatches, sphere, borders, baked lighting, highlights, moss and watermarks.

The retained generated source is `assets/textures/terrain/stylized-rock-v1/source-generated.png`. `tools/textures/generate_stylized_rock_pbr.py` then deterministically:

- resizes to a power-of-two 1024x1024 runtime source;
- removes broad baked-light drift without flattening the authored stone identity;
- makes opposing edges exactly equal through a 48-pixel tapered periodic correction;
- derives one shared height interpretation;
- derives OpenGL normal, AO, roughness, metallic and packed ORM from that height/albedo pair.

The runtime set is:

- `albedo.png`;
- `normal-open-gl.png`;
- `orm.png` (`R = AO`, `G = roughness`, `B = metallic`);
- `height.png`.

Separate `ambient-occlusion.png`, `roughness.png` and `metallic.png` authoring outputs are retained for inspection and future tooling. Metallic is black because this is a dielectric stone surface.

The user-provided reference's usage scope was not independently verified. Runtime diagnostics state that provenance explicitly rather than claiming an external licence determination.

## Runtime material

`src/render/backends/three/ThreeRockTerrainMaterial.js` owns the rock texture descriptor, browser loading, dominant-axis triplanar shader injection, normal transformation, packed PBR response, diagnostics and disposal.

- Texture scale is two metres, matching the reference intent and spanning four current half-metre gameplay tiles.
- World-space dominant-axis triplanar projection prevents per-tile UV resets and maps the same material onto top and side faces. Because the current box faces are axis aligned, it samples only the active projection rather than paying for three blended axes per pixel.
- Macro value variation reduces long-range repetition without adding another texture.
- Height is sampled and retained as an authored channel but does not displace geometry or collision.
- All authored rock tiles remain one `InstancedMesh` and one draw batch.
- Texture loading is fail-visible: incomplete or failed browser loads render magenta and emit a console error. Headless source tests report `headless_descriptor`, never a false `ready` state.
- F6 material-ID and normal-only views include the new rock material.

## Validation

- `node tests/terrainMaterialSystem.test.mjs` — passed; asset resolution/dimensions, texture scale, shader injection, fail-visible state, instancing and debug-mode wiring are covered.
- `npm test` — passed.
- `node tests/playtest/terrainMaterials.playtest.mjs rock-pbr-v1` — passed at the exact project root with all four runtime textures ready, zero texture errors, zero console/page/request failures and inspected close, gameplay, material-ID and normal-only rock captures.
- `npm run build:playtest` — passed; Vite emitted all four referenced rock textures into the curated package.
- `node tests/playtest/webgl3dBuiltPackage.playtest.mjs` — passed with movement, raw-source 404 and zero console/page/request/HTTP failures.

The broader `webgl3dPerformance.playtest.mjs` stress gate was also attempted twice and is a recorded proof gap, not a pass. The locked DPR-1 profile reported frame-interval p95 values of 45.7 ms and 41.8 ms against its 17.2 ms limit. CPU render-path p95 remained 4.7-4.9 ms; the immediate GPU query at failure was 10.486-11.443 ms, while the accumulated GPU p95 was 10.824 ms on the first run and 28.944 ms on the second. Those conflicting signals do not isolate the rock material as the cause, but they also do not prove the current whole game holds stable 60 FPS. This material slice therefore makes no full-game 60 FPS claim.

Browser evidence is under `artifacts/terrain-material-v1/rock-pbr-v1/`. The close lit capture is `10-close-rock-pbr.png`, gameplay-height capture is `11-gameplay-rock-pbr.png`, and normal proof is `debug-rock-normal-only.png`.

## Deliberate boundary

This slice replaces the material, not the canonical rock geometry. The authored rock wall still uses stepped blocked boxes. Breaking that silhouette into irregular boulders or adding displacement would be a separate geometry/collision slice and is not hidden inside this presentation change.
