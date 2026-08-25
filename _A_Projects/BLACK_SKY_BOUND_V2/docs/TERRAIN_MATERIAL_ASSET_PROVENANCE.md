# Terrain Material Asset Provenance

## Original three-layer foundation

The original grass, compacted-dirt, and scorched-earth PBR foundation used no downloaded, scraped, AI-generated, or third-party texture assets. All original texels are produced deterministically by project source code in `src/render/backends/three/ThreeTerrainPbrTextures.js` from the authored definitions in `src/data/terrainMaterialLayers.js`.

As of 2026-08-11, the active runtime grass and compacted-dirt contributions are overridden by the reference-guided generated sets described below. Their procedural layers remain reproducible source data and valid array members, but they are no longer the lit grass or dirt surfaces shown by the active Three.js floor shader. Scorch continues to use its procedural array layer.

The source/licence record exposed by runtime diagnostics is:

- source: `deterministic_periodic_procedural_original`;
- definition source: `procedural_original_no_external_asset`;
- licence: `project_source_same_terms_no_external_asset`;
- external attribution required: none.

## Reproducible maps

Each material is a 128x128 layer in three same-sized `DataArrayTexture` objects:

1. sRGB-authored base colour (RGBA8; converted to linear in the terrain shader);
2. OpenGL-oriented tangent normal (RGBA8);
3. packed roughness, ambient occlusion, and conservative height/detail (R/G/B/A8).

The generator uses periodic lattice value noise whose integer lattice wraps in U and V. The normal map is derived with wrapped central differences from the generated height field, so the height and normal derivatives agree at the seam. The arrays use independent layers, `RepeatWrapping`, trilinear mip filtering, generated mipmaps, and up to 8x anisotropy. Texture-array layers cannot bleed into one another through atlas gutters because they are not atlas sub-rectangles.

All three definitions use the same `textureWorldMeters` value (1.6 m), giving consistent texel density. The shader samples a second rotated/scaled copy and applies broad world-space colour/roughness modulation to reduce obvious repetition across authored tiles.

## Validation contract

`tests/terrainMaterialSystem.test.mjs` checks:

- exact U/V periodicity for base colour and height;
- OpenGL normal orientation against the wrapped height gradient;
- roughness and AO range ceilings/floors;
- equal world texel density;
- repeat wrapping and trilinear mip configuration;
- texture-array depth and material-profile mapping;
- explicit magenta diagnostic rendering when a required material profile is missing.

Height remains a detail source for normal generation and diagnostics. It is not used for vertex displacement. This avoids silhouette instability, collision mismatch, and an unmeasured displacement cost.

## Material-specific intent

- `dark_wild_grass`: dark soil/short-grass base, muted green separation, high dielectric roughness, shallow fibrous variation.
- `compacted_dirt_path`: warmer compacted soil with restrained grit and lower normal amplitude so travelled ground stays visually calm.
- `scorched_earth`: near-black/brown ash with shallow crack/cavity response and the highest roughness of the three.

These layers intentionally avoid saturated green, high-contrast photographic noise, baked highlights, outlines, and emissive lift. Directional and local light remain responsible for readable form.

## Runtime-derived data (not source assets)

`src/render/backends/three/ThreeTerrainBlendMask.js` derives an 8-pixels-per-tile RGB contour mask from the already-projected terrain IDs whenever the static map revision changes. Its implicit shapes use rounded tile cores, cardinal and diagonal path capsules, deterministic edge lobes, variable shoulder widths, and independent multi-scale domain warps per material. The dominant visual contour therefore moves across the authored tile edge instead of merely feathering it. The final map moves 6,546 sampled pixels across underlying tile ownership while retaining the authored material at every target tile centre. The mask is renderer-only, never saved into Map Forge or runtime-map JSON, and has no external source/licence dependency.

Grass clumps are procedural geometry from `src/render/backends/three/ThreeGrassDetail.js`, not an image asset. Ten tapered, bent blades form one reusable 30-triangle clump; deterministic instance transforms, prevailing lean, scale, and colour are derived from map identity, revision, tile coordinates, and candidate index.

## Reference-derived rock addition (2026-08-11)

The later rock-material slice is intentionally separate from the three procedural array layers described above. It uses a user-supplied ChatGPT image as a visual reference, a newly generated neutral-lit albedo, and deterministic local derivation for matching normal, AO, roughness, height, metallic and packed ORM channels. The composite reference sheet is not shipped.

Runtime textures live under `assets/textures/terrain/stylized-rock-v1/`; the reproducible derivation is `tools/textures/generate_stylized_rock_pbr.py`; runtime ownership is `src/render/backends/three/ThreeRockTerrainMaterial.js`. All runtime maps are 1024x1024, opposite albedo/height edges match exactly after tapered periodic correction, normals are OpenGL-oriented, and the material remains dielectric with zero metallic response.

The provenance string is `user_reference_guided_openai_generated_albedo_with_deterministic_derived_channels`. The supplied reference's usage scope was not independently verified, and diagnostics preserve that fact rather than claiming a third-party licence conclusion. Full implementation and proof details are in `docs/ROCK_TERRAIN_PBR_MATERIAL_V1.md`.

## Reference-guided grass addition (2026-08-11)

The grass-material slice used the project-generated rock albedo only as a style-and-finish reference for a new ImageGen albedo. The output contains independently generated matted turf and soil structure rather than rock forms or copied rock texels. The accepted generated source is retained under `assets/textures/terrain/stylized-grass-v1/source-generated.png`; the exact prompt and rejection history are recorded in `docs/GRASS_TERRAIN_PBR_MATERIAL_V1.md`.

`tools/textures/generate_stylized_grass_pbr.py` deterministically derives the 1024x1024 seamless albedo, OpenGL normal, AO, roughness, height, zero-metallic and packed ORM outputs. Exact opposite-edge equality is enforced with a narrow 12-pixel tapered periodic correction. The initial 48-pixel pass was rejected because it created a visible height-border band and is not the shipped result.

Runtime ownership is split deliberately: `src/render/backends/three/ThreeGrassTerrainPbrTextures.js` owns loading, failure state, diagnostics and disposal; `src/render/backends/three/ThreeTerrainMaterialSystem.js` integrates the authored grass channels into the existing layered floor material. The grass set uses a 1.6-metre world scale and does not use height for vertex displacement.

The provenance string is `rock_style_reference_guided_openai_generated_albedo_with_deterministic_derived_channels`; licence scope is recorded as `project_generated_asset_reference_usage_scope_not_independently_verified`. No downloaded third-party texture is packaged, but the original user-supplied rock reference's usage scope was not independently verified and that uncertainty carries through the style-reference chain.

## Reference-guided mud addition (2026-08-11)

The mud slice used the project-generated grass and rock albedos only as style-and-finish references for one new neutral-lit trampled-earth albedo. The accepted generated source is retained at `assets/textures/terrain/stylized-mud-v1/source-generated.png`; the exact prompt is recorded in `docs/MUD_TERRAIN_PBR_MATERIAL_V1.md`.

`tools/textures/generate_stylized_mud_pbr.py` deterministically derives the seamless 1024x1024 albedo, OpenGL normal, AO, roughness, height, zero-metallic and packed ORM outputs. A narrow 20-pixel tapered periodic correction produces exact opposite-edge equality. Runtime ownership is split between `src/render/backends/three/ThreeMudTerrainPbrTextures.js` for loading/failure/disposal and `src/render/backends/three/ThreeTerrainMaterialSystem.js` for sampling the authored maps only under the existing dirt blend weight.

The set uses a 1.6-metre world scale and no vertex displacement. The original procedural dirt remains reproducible and packaged inside the shared texture arrays, but the active lit dirt/path surface uses this one authored set. Diagnostics expose `grass_and_rock_style_reference_guided_openai_generated_albedo_with_deterministic_derived_channels` and preserve the licence uncertainty as `project_generated_asset_reference_usage_scope_not_independently_verified`.

## Procedural water and rain-wetness addition (2026-08-11)

The reflective water and rain-driven wetness slice introduces no bitmap asset. Water colour variation, moving normals, Fresnel response and sparse rain rings are shader-derived from world position, render time, camera position, physical lights and the existing renderer-neutral atmospheric rain projection.

The cross-material wetness field is also procedural. It combines deterministic world-space fields with the already loaded height channels for grass, mud, scorch and rock; the legacy forest floor receives a bounded scalar response. No generated or downloaded rain mask is packaged. Runtime ownership and proof are documented in `docs/WATER_AND_RAIN_WETNESS_MATERIAL_V1.md`.
