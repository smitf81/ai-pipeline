# Trampled mud terrain PBR material v1

Completed and browser-proved on 2026-08-11.

## Outcome

The active `dirt` contribution in the shared grass/dirt/scorched floor shader now uses one authored trampled-mud PBR texture set. It reads as compacted forest loam with shallow tread, dragged scuffs, soil clods, grit, and damp compression pockets while the existing renderer-owned contour field still supplies the irregular grass-to-path boundary.

This is a visual-only replacement. Terrain IDs, movement cost, collision, saved map data, path topology, tile-centre identity, sparse grass placement, and the existing single layered floor batch are unchanged. Height contributes surface detail only; it does not displace geometry.

## Accepted generated source

ImageGen used the already generated project grass and rock albedos as style/finish references. They guided the restrained semi-real treatment only; the resulting mud contains independently generated earth structure and does not reproduce their grass blades, stones, layouts, or texels.

The original generated image is retained unchanged at `assets/textures/terrain/stylized-mud-v1/source-generated.png`. Its exact prompt was:

```text
Use case: stylized-concept
Asset type: production-ready seamless square ALBEDO texture for the trampled mud and compacted ground-path layer in the dark top-down Three.js game BLACK SKY BOUND.

Input images: Image 1 is the project's grass-material style reference and Image 2 is the project's rock-material style reference. Match their grounded, tactile, restrained semi-real stylized finish, material clarity, calm contrast, and muted detail. Do not copy their grass blades, stones, layouts, colours, or texels.

Primary request: create exactly one flat, edge-to-edge, perfectly tileable square base-colour texture of a heavily travelled forest-earth path. The surface is compacted dark loam and clay with irregular shallow tread and hoof-like compression marks, soft dragged arcs, scuffed flattened areas, small broken soil clods, fine grit, and occasional tiny embedded pebbles. Marks must overlap organically in varied directions and remain abstract enough that no single boot print, hoof shape, wheel track, or repeated motif is recognisable.

Composition/camera: orthographic straight-down material capture; uniform physical scale; no perspective, border, vignette, central subject, horizon, path edge, path direction, or repeated quadrant. The whole tile is only the mud material and represents approximately 1.6 metres, because the runtime already supplies the organic grass-to-path boundary and world-space dual-sample anti-repetition.

Palette: deep muted umber, cool brown-grey, restrained clay brown, and almost-black damp compression pockets. Keep midrange information available for PBR derivation; no orange soil, bright beige sand, or saturated red clay.

Lighting/material constraints: diffuse albedo only under flat neutral illumination. Damp value variation is welcome, but bake no wet gloss, reflection, specular highlight, puddle, cast shadow, ambient-occlusion cavity, directional light, bevel shine, or black crushed crevice. The later deterministic process will derive height, OpenGL normal, AO, roughness, metallic, and packed ORM.

Avoid: grass lawn, moss carpet, leaves, roots, branches, large rocks, cobblestones, paving, gravel road, water, puddles, mirror-like wetness, snow, flowers, blood, footprints with obvious soles or toes, clean horseshoes, tyre tracks, straight parallel ruts, path borders, text, labels, panels, watermark, normal-map colours, baked lighting, photographic sensor noise.
```

## Deterministic PBR derivation

`tools/textures/generate_stylized_mud_pbr.py` is the reproducible authoring path. It flattens broad illumination, applies a neutral dark/cool loam grade, derives one coherent height interpretation from compacted mass, grit and churn, and produces:

- `albedo.png`;
- `normal-open-gl.png`;
- `ambient-occlusion.png`;
- `roughness.png`;
- `height.png`;
- `metallic.png`;
- `orm.png` with AO/roughness/metallic in RGB.

All outputs are 1024x1024. A narrow 20-pixel tapered periodic correction makes opposing albedo and height edges exactly equal. The accepted numeric ranges are roughness `0.760293..0.960000`, AO `0.636932..0.959590`, and normal Z `0.685036..1.000000`; metallic is identically zero.

## Runtime ownership

`src/render/backends/three/ThreeMudTerrainPbrTextures.js` owns loading, colour-space/wrap/filter configuration, diagnostics, explicit magenta failure textures, and disposal. It exposes exactly one texture-set ID, `stylized_mud_trampled_path_v1`, at a 1.6-metre world scale.

`src/render/backends/three/ThreeTerrainMaterialSystem.js` samples the authored albedo, OpenGL normal, ORM and height only for the existing dirt weight. Grass continues to use its authored set; scorch continues to use its procedural array layer. Continuous world X/Z coordinates, dual rotated samples, macro variation, the organic contour mask, material-ID view, normal-only view, and one instanced layered-floor draw batch remain intact.

## Validation and visual proof

- `node tests/terrainMaterialSystem.test.mjs` passes map dimensions, loader contract, one-set ownership, shader wiring, normal orientation, fail-visible handling, blend displacement, and tile-centre identity checks.
- `node tests/playtest/terrainMaterials.playtest.mjs mud-pbr-v1` passes with all four runtime maps ready and zero console, page, request, or texture errors.
- `npm run build:playtest` passes with 57 curated files, zero raw source files, and zero source maps.
- `node tests/playtest/webgl3dBuiltPackage.playtest.mjs` passes movement and rendering against the production export with zero browser or HTTP errors.

The clearest evidence is `artifacts/terrain-material-v1/mud-pbr-v1/16-close-trampled-mud.png`; `03-grass-dirt-boundary.png`, `17-gameplay-mud-path.png`, and `debug-normal-only.png` cover the blended boundary, normal gameplay view, and active surface normals. The browser report is `artifacts/terrain-material-v1/mud-pbr-v1/report.json`.

The material lane's CPU render-path proof passes at 3.1 ms p95 with ground detail off and 4.8 ms with it on, while preserving one layered floor draw batch and zero authored-centre mismatches. Whole-scene frame/GPU samples in the current dirty world were above the historical 60 FPS target (35.7/38.1 ms frame p95 and 19.882/23.977 ms GPU p95 off/on), so this evidence does not claim a mud-isolated performance improvement or universal 60 FPS.

## Provenance and licence boundary

Runtime diagnostics expose `grass_and_rock_style_reference_guided_openai_generated_albedo_with_deterministic_derived_channels`. No downloaded third-party texture is packaged. The source references are project-generated assets, but their upstream reference-usage scope was not independently verified; diagnostics therefore retain `project_generated_asset_reference_usage_scope_not_independently_verified` instead of asserting a broader licence conclusion.
