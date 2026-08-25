# Shared Tree Bark PBR Material v1

Completed and browser-gated on 2026-08-11.

## Outcome

All three procedural tree species now render their watertight wood meshes with one shared stylized bark PBR texture set. Old pine, silver birch and ancient oak do not duplicate image content or shader implementations: each recipe supplies only tint, saturation, brightness, texture scale, normal strength and roughness bias uniforms to the canonical bark material.

The bark uses object-space weighted triplanar projection. It therefore follows the existing marching-cubes trunk, roots and branches without requiring fragile generated UVs, visible texture seams, geometry changes or additional draw calls.

## Source and derivation

The existing project-generated rock and grass albedos were used as style-and-finish references only. Their shapes, colours and texels were not copied. One neutral recolourable bark albedo was generated with the built-in ImageGen workflow using this exact prompt:

```text
Use case: stylized-concept
Asset type: production tileable bark PBR albedo source for low-poly procedural trees in the dark top-down Three.js game Black Sky Bound
Input images: Image 1 and Image 2 are style-and-finish references only. Match their restrained hand-authored stylized realism, calm contrast, material scale, subtle surface variation, and muted finish. Do not copy their stone or grass patterns, shapes, colors, or individual texels.
Primary request: create exactly one perfectly seamless square tileable ALBEDO / base-colour texture of rugged mature tree bark. Build a broadly reusable neutral bark identity that can serve old pine, silver birch and ancient oak after shader-side hue, saturation and brightness changes. Use interlocking medium bark plates, shallow branching fissures, small fibrous ridges and mostly vertical flow, with enough cross-flow that object-space triplanar projection still looks natural on roots and angled branches.
Composition: orthographic straight-on material scan filling the square edge to edge; pattern wraps seamlessly across left/right and top/bottom; one tile represents about 0.75 metres; no central hero knot, no obvious repeating quadrant and no horizon or tree silhouette.
Color palette: neutral medium-dark umber and muted brown-grey, deliberately moderate saturation and midrange value so shader recoloring can produce dark pine, pale silver birch and warm ancient oak without clipping.
Lighting/material constraints: diffuse albedo only under flat neutral illumination; no directional light, cast shadow, ambient-occlusion shading, specular highlight, wet shine, baked edge light or bevel shine. Keep fissures dark enough to read but not crushed black.
Output: clean square texture with no border.
Avoid: stone slabs, grass, moss, lichen, leaves, needles, flowers, soil, roots as objects, cut logs, knots larger than a small bark plate, holes, faces, text, labels, frame, watermark, perspective, vignette, black margins, baked lighting, photographic noise, high-frequency splinters, obvious horizontal bands, obvious grid or checker repetition.
```

The retained generated source is `assets/textures/scenery/stylized-bark-v1/source-generated.png`. `tools/textures/generate_stylized_bark_pbr.py` deterministically produces:

- `albedo.png`;
- `normal-open-gl.png`;
- `orm.png` (`R = AO`, `G = roughness`, `B = metallic`);
- `height.png`;
- separate `ambient-occlusion.png`, `roughness.png` and `metallic.png` authoring outputs.

All outputs are 1024x1024. The generator removes broad illumination drift, applies a tapered 24-pixel periodic correction, derives one shared bark-height interpretation, and produces OpenGL-oriented normals. Opposing albedo and height edges have zero measured U/V error. Roughness is `0.7900–0.9721`, AO is `0.5829–0.9500`, normal Z is `0.6671–1.0`, and metallic is zero because bark is dielectric.

The new grass and bark images are project-generated, but the original user-supplied image upstream of the earlier rock style reference was not independently licence-verified. Runtime provenance preserves that uncertainty instead of inventing a rights conclusion.

## One set, three recipe variants

`src/data/proceduralTrees.js` owns the species adjustments:

| Recipe | Tint | Saturation | Brightness | Texture metres | Normal strength | Roughness bias |
|---|---|---:|---:|---:|---:|---:|
| Old pine | `#4a3020` | 1.08 | 0.90 | 0.68 | 0.78 | +0.035 |
| Silver birch | `#d7cfb7` | 0.18 | 1.04 | 0.54 | 0.50 | -0.025 |
| Ancient oak | `#563923` | 0.92 | 0.96 | 0.82 | 0.92 | +0.055 |

The resolved tree definition and spatial recipe carry this tuning to the renderer. Automated tests verify that all three bark materials reference the exact same shared texture-uniform object and texture-set ID.

## Runtime material

`src/render/backends/three/ThreeBarkPbrMaterial.js` owns the single asset descriptor, browser loading, PBR shader injection, error state and texture disposal. `src/render/backends/three/ThreeTreeMeshFactory.js` owns the three cheap material variants and keeps the existing geometry/material caches.

- Weighted object-space triplanar projection softens axis transitions on the curved implicit surface and remains stable when a tree group rotates.
- Albedo remains neutral in the files; recipe tinting happens in linear shader space.
- Normal, AO, roughness and zero metallic come from the shared packed set.
- Height is loaded and retained for inspection but does not displace geometry or collision.
- Failed or incomplete texture loading renders bark magenta and records a console error rather than silently returning to flat colour.
- Tree DNA, topology, one bark draw per tree, foliage instancing, shadows, collision and root traversal are unchanged.

## Validation

- `node tests/threeTreeSpatialRecipe.test.mjs` — passed; checks the four 1024 PNGs, one-set ownership, three recipe variants, exact shared uniforms, shader injection, fail-visible loading and unchanged watertight topology.
- `node tests/playtest/webgl3dReferenceGrove.playtest.mjs` — passed against the production Three.js tree path.
- Browser result: 15 captures, four of four bark textures ready, one texture set, three grove material variants, zero console errors, zero page errors and zero request failures.
- The three-tree grove remains 9 calls and 17,698 triangles. A single isolated bark close view uses 2 calls; the material change adds no geometry or draw-call duplication.
- Close pine, birch and oak captures were visually inspected, along with moon, moving-torch and gameplay-canopy views.
- `npm run build:playtest` — passed; Vite emitted the four bark runtime maps into the curated 49-file package with no raw source or source maps.
- `node tests/playtest/webgl3dBuiltPackage.playtest.mjs` — passed after explicitly waiting for the packaged bark state to report four loaded textures and one texture set; movement, raw-source 404 and zero console/page/request/HTTP failures were also verified.
- Full `npm test` is currently blocked by the unrelated `illuminationPerformancePolicy.test.mjs` storm-strike visibility assertion. `npm run test:loc` is independently blocked by the unrelated 560-line `ThreeEffectsLayer.js`; the new bark source remains below that 500-line limit.

Evidence root: `artifacts/webgl3d-bark-pbr-v1/`. The clearest recipe comparisons are `13-pine-bark-close.png`, `14-birch-bark-close.png` and `15-oak-bark-close.png`; the machine-readable result is `playtest-report.json`.

The reference-grove lane does not expose reliable GPU timer queries, so this proof does not make a new whole-game GPU-cost claim. The weighted triplanar shader is deliberately bounded to bark fragments and reuses one texture set, but a future forest-scale performance slice should measure it under the broader stress gate if the tree count grows materially.

## Deliberate boundary

This slice changes bark presentation only. It does not alter tree geometry, canopy art, species identity, procedural skeletons, collision, traversal, fire lifecycle, wind, tree counts or map authoring.
