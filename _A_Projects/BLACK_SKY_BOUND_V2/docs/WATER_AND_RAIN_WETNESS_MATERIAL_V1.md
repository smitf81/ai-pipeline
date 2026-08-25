# Reflective water and rain-driven terrain wetness v1

Completed and browser-proved on 2026-08-11.

## Outcome

Authored water tiles now render through one continuous world-space physical material instead of the former flat teal scalar material. The shader uses a dark dielectric water body, `0.07..0.13` roughness, IOR `1.333`, clearcoat, dual moving wave normals, restrained Fresnel sky response, direct-light specular highlights, and small sparse rain rings. All water tiles remain one instanced draw batch.

The same renderer-neutral atmospheric rain projection now drives an irregular wetness mask across the compatible ground materials. Mud collects the strongest low-roughness pockets; rock and scorched earth receive pronounced but bounded sheen; grass remains comparatively matte; the legacy forest floor receives a conservative response. Water remains intrinsically wet and uses rain intensity to strengthen disturbance rather than to become wet.

This is a renderer-only visual response. Terrain IDs, water movement cost, collision, map serialization, atmospheric gameplay, and material-profile ownership are unchanged.

## Canonical signal and landing points

`src/projection/atmosphericOverlayProjection.js` remains the canonical renderer-neutral source for whether rain is enabled and its `0..1` density. `src/render/backends/three/ThreeLiveWorld.js` forwards that existing packet and render time to the terrain system every frame.

`src/render/backends/three/ThreeTerrainWetness.js` resolves the packet into `black-sky-bound.three-rain-terrain-wetness.v1`, publishes the per-material response table, and owns the shared GLSL field/pooling/reflection functions. The policy is explicitly `visual_only_instant_rain_response_no_gameplay_weather_or_persistence`: turning rain off dries the presentation immediately rather than inventing an unowned weather simulation.

The shared mask combines broad and fine world-space fields with each PBR surface's derived height. Lower pockets receive more sheen, but every receiving material retains a smaller sheet-wetness component so rain does not appear only in isolated circles.

| Surface | Response | Wet roughness | Wet colour scale |
|---|---:|---:|---:|
| Grass | 0.32 | 0.48 | 0.90 |
| Trampled mud | 0.98 | 0.13 | 0.72 |
| Scorched earth | 0.72 | 0.20 | 0.78 |
| Rock | 0.86 | 0.16 | 0.74 |
| Forest floor | 0.42 | 0.48 | 0.83 |
| Water | intrinsic | 0.07..0.13 | 1.00 |

## Runtime ownership

- `src/render/backends/three/ThreeWaterTerrainMaterial.js` owns reflective water, moving normals, rain rings, debug output, and water diagnostics.
- `src/render/backends/three/ThreeLayeredTerrainMaterial.js` owns the extracted grass/mud/scorch shader and applies material-weighted wetness without adding another floor draw.
- `src/render/backends/three/ThreeRockTerrainMaterial.js` applies the shared mask to the authored triplanar rock PBR, biased toward upward-facing surfaces.
- `src/render/backends/three/ThreeTerrainMaterialSystem.js` owns water instancing, live uniform updates, conservative legacy forest response, lifecycle, and combined diagnostics.
- `src/data/materialProfiles.js` advertises `terrainMaterial.water_reflective_physical_v1` with reflective/Fresnel tags and a physical roughness of `0.10`.

F6 now cycles lit, material-ID, normal-only, and wetness views. Wetness mode uses a quiet dark-to-cyan scale and remains optional rather than contaminating normal play.

## Validation and evidence

- `node tests/terrainMaterialSystem.test.mjs` passes water shader, canonical rain resolution, response ordering, uniform propagation, single water batch, and wetness-debug contracts.
- `node tests/materialProfileRegistry.test.mjs` passes the reflective water profile and intrinsic-water wetness contract.
- `node tests/playtest/terrainMaterials.playtest.mjs water-wetness-v1` passes against the real Three.js renderer with 343 water tiles in one batch, full rain intensity in rainy captures, explicit zero intensity in the dry control, and zero console/page/request errors.
- `npm test` and `npm run test:loc` pass.
- `npm run build:playtest` passes with 57 curated files, no raw source, and no source maps.
- `node tests/playtest/webgl3dBuiltPackage.playtest.mjs` passes movement, active packaged wetness, raw-source 404, and zero console/page/request/HTTP errors. The curated campaign map contains no water IDs, so dedicated water visibility is proved by the terrain-material map rather than fabricated in the package smoke.

Primary visual evidence:

- `artifacts/terrain-material-v1/water-wetness-v1/18-calm-reflective-water.png`;
- `artifacts/terrain-material-v1/water-wetness-v1/19-rain-ripple-water.png`;
- `artifacts/terrain-material-v1/water-wetness-v1/20-dry-ground-control.png`;
- `artifacts/terrain-material-v1/water-wetness-v1/21-rain-wet-ground.png`;
- `artifacts/terrain-material-v1/water-wetness-v1/debug-wetness.png`;
- `artifacts/terrain-material-v1/water-wetness-v1/report.json`.

The final focused CPU render-path p95 is `4.7 ms` with sparse grass detail off and `4.9 ms` with it on. Current dirty whole-world samples remain above the historical 60 FPS target (`35.4/35.3 ms` frame p95 and `19.678/20.053 ms` GPU p95), so no universal 60 FPS or isolated performance improvement is claimed.

## Deliberate limitations

- Reflection is a restrained physical/direct-light plus procedural storm-sky Fresnel response, not planar reflection, screen-space reflection, or a second scene render.
- Wetness is immediate visual state; there is no accumulation, drying timer, runoff, puddle geometry, hydro simulation, or gameplay traction change.
- The rain mask covers terrain floors. Bark, foliage, undergrowth, actors, props, and decals retain their existing material-state paths and were not silently folded into this floor slice.
- Water boundaries still follow authored water tile ownership. Organic shoreline deformation is a separate visual-contour task.
- No new image asset or external licence dependency was introduced.
