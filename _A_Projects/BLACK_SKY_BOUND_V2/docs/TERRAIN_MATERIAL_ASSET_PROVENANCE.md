# Terrain Material Asset Provenance

## Summary

The grass, compacted-dirt, and scorched-earth PBR layers in this slice use no downloaded, scraped, AI-generated, or third-party texture assets. All texels are produced deterministically by project source code in `src/render/backends/three/ThreeTerrainPbrTextures.js` from the authored definitions in `src/data/terrainMaterialLayers.js`.

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
