# Shared Tree Foliage PBR Material v1

Completed and browser-gated on 2026-08-11.

## Outcome

All three procedural tree species now render their existing instanced canopy clusters with one shared stylized foliage PBR texture set. Old pine, silver birch and ancient oak do not duplicate PNG content or shader implementations: each recipe supplies only tint, saturation, brightness, texture scale, normal strength and roughness bias uniforms.

This is an opaque canopy-surface material fitted to the current faceted icosahedral clusters. It is deliberately not a transparent leaf-card system and does not change canopy placement, geometry, instance counts, tree DNA, fire semantics or gameplay.

## Source and exact generation prompt

The project-generated bark and grass albedos were used as style-and-finish references only. Their subjects, shapes and texels were not copied. One neutral recolourable foliage albedo was generated with the built-in ImageGen workflow using this exact prompt:

```text
Use case: stylized-concept
Asset type: production-ready, seamless square foliage-surface ALBEDO texture for an opaque instanced low-poly tree canopy material in the dark top-down Three.js game BLACK SKY BOUND.

Use the two reference textures only to match their grounded, tactile, semi-real stylized finish and restrained micro-detail. Do not copy their subjects or layouts.

Create exactly one flat, edge-to-edge, perfectly tileable square material scan of dense overlapping tree foliage. Fill the entire image with tightly interlocking small pointed leaflets, short needle-like fronds, and layered compact leaf clusters, with subtle direction changes and no empty gaps. It must be a broadly reusable neutral master that can become old pine, silver birch, or ancient oak through shader tint, saturation, brightness, texture scale, normal strength, and roughness adjustments.

Composition/camera: orthographic straight-on material capture, uniform scale, no perspective, no border, no vignette, no central subject, no repeated quadrant, no obvious macro swirl. Physical tile scale approximately 0.45 metres. The leaf forms must stay readable when projected onto faceted icosahedral canopy blobs using object-space dominant-axis triplanar mapping.

Palette: neutral desaturated mid olive-green and grey-green, moderate value and restrained saturation, with enough albedo variation for later recolouring but no yellow autumn bias.

Lighting/material constraints: pure diffuse albedo only. Flat neutral illumination. No cast shadows, no ambient-occlusion cavities, no specular highlights, no gloss, no wetness, no baked directional light, no metallic response.

Avoid: transparent background, holes, sky, branches, twigs, bark, tree trunks, grass lawn or turf, rocks, soil, moss carpet, flowers, berries, fruit, large hero leaves, recognisable repeated motifs, text, labels, frames, watermarks, texture-map preview panels, normal-map colours.
```

The retained generated source is `assets/textures/scenery/stylized-foliage-v1/source-generated.png`. `tools/textures/generate_stylized_foliage_pbr.py` deterministically produces:

- `albedo.png`;
- `normal-open-gl.png`;
- `orm.png` (`R = AO`, `G = roughness`, `B = metallic`);
- `height.png`;
- separate `ambient-occlusion.png`, `roughness.png` and `metallic.png` authoring outputs.

All outputs are 1024x1024. The generator removes broad illumination drift, applies a tapered 20-pixel periodic correction and derives a vegetation-aware height interpretation from leaf mass, leaflet detail and cluster relief. Opposing albedo and height edges have zero measured U/V error. Roughness is `0.7800–0.9484`, AO is `0.6577–0.9600`, normal Z is `0.6904–1.0`, and metallic is zero because leaves are dielectric.

The foliage image is project-generated, but the original user-supplied image upstream of the earlier rock style reference was not independently licence-verified. Runtime provenance preserves that uncertainty instead of inventing a rights conclusion.

## One set, three recipe variants

`src/data/proceduralTrees.js` owns the species adjustments:

| Recipe | Tint | Saturation | Brightness | Texture metres | Normal strength | Roughness bias |
|---|---|---:|---:|---:|---:|---:|
| Old pine | `#244d33` | 0.88 | 0.90 | 0.90 | 0.34 | +0.055 |
| Silver birch | `#728b4d` | 0.68 | 0.98 | 1.25 | 0.26 | -0.015 |
| Ancient oak | `#315b36` | 1.04 | 0.82 | 1.60 | 0.46 | +0.035 |

The pine projection is the densest, birch is lighter and less relief-heavy, and oak uses the broadest, darkest read. Non-evergreen seasonal colours continue to replace only the resolved tint; the shared surface and other recipe tuning remain intact.

## Runtime material

`src/render/backends/three/ThreeFoliagePbrMaterial.js` owns the single asset descriptor, browser loading, PBR shader injection, error state and texture disposal. `src/render/backends/three/ThreeTreeMeshFactory.js` creates the three cheap material variants and retains the existing geometry/material caches.

- Tree-space dominant-axis projection keeps the surface stable across instanced non-uniform scale and tree rotation without generated UVs.
- Each foliage fragment samples one albedo, one normal and one packed ORM texel rather than a nine-fetch weighted triplanar set; this bounds the cost on screen-filling canopies.
- Albedo remains neutral in the files; recipe tinting happens in linear shader space.
- Normal, AO, roughness and zero metallic come from the shared packed set.
- Height is loaded and retained for inspection but does not displace canopy geometry or collision.
- Failed or incomplete texture loading renders foliage magenta and records a console error rather than silently falling back to flat green.
- Canopy geometry, instance counts, shadows, draw ownership, collision, traversal and map truth remain unchanged.

## Validation and evidence

- `node tests/threeTreeSpatialRecipe.test.mjs` — passed; checks the four 1024 PNGs, one-set ownership, three recipe variants, exact shared uniforms, dominant-axis shader injection, fail-visible loading and unchanged watertight wood topology.
- `node tests/playtest/webgl3dReferenceGrove.playtest.mjs` — passed twice during tuning against the production Three.js path.
- Final browser result: 18 captures, four of four foliage textures ready, one foliage texture set, three recipe variants, zero console errors, zero page errors and zero request failures.
- Pine, birch and oak foliage close views were visually inspected after the scale/value correction, along with moon, moving-torch and gameplay-canopy views.
- The three-tree grove remains 9 calls and 17,698 triangles. The material introduces no geometry or draw-call duplication.
- `npm run build:playtest` — passed; Vite emitted the four foliage runtime maps into the curated 53-file package with no raw source or source maps.
- `node tests/playtest/webgl3dBuiltPackage.playtest.mjs` — passed after explicitly waiting for both shared bark and foliage sets; movement, raw-source 404 and zero console/page/request/HTTP failures were verified.
- Full `npm test` remains blocked by the unrelated authored-storm visibility assertion in `illuminationPerformancePolicy.test.mjs`. `npm run test:loc` remains independently blocked by the unrelated 560-line `ThreeEffectsLayer.js`; the new foliage material and generator are 288 and 169 lines respectively.
- `git diff --check` passed; the repository emitted only its existing LF-to-CRLF notices.

Evidence root: `artifacts/webgl3d-foliage-pbr-v1/`. The clearest recipe comparisons are `16-pine-foliage-close.png`, `17-birch-foliage-close.png` and `18-oak-foliage-close.png`; the machine-readable result is `playtest-report.json`.

The reference-grove lane does not expose reliable GPU timer queries, so this proof does not make a new whole-game GPU-cost claim. It does prove preserved grove draw/triangle counts and a bounded three-texture-fetch foliage shader on the existing instances.

## Deliberate boundary

This slice changes the material presentation of existing canopy clusters only. It does not add transparent cards, individual leaf geometry, translucency, subsurface scattering, wind animation, alpha testing, new tree forms, changed canopy placement, modified fire lifecycle, collision, traversal or map authoring. A future silhouette pass could replace the cluster geometry while continuing to reuse this shared surface contract.
