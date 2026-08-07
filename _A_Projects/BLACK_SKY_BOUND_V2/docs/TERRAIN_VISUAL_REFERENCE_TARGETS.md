# Terrain visual reference targets

Date reviewed: 2026-07-31

These images were used only as visual reference. They are not copied, traced, packaged, or used as source textures. The game continues to ship only its deterministic project-authored procedural terrain data.

## Reference set

- [No Rest for the Wicked — forest floor](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1371980/56066f44f29e8b042c482e0b0680bc101bf1ecd5/ss_56066f44f29e8b042c482e0b0680bc101bf1ecd5.1920x1080.jpg): quiet moss/soil base, detail concentrated around roots and banks, lighting creates the drama.
- [No Rest for the Wicked — grass/path edge](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1371980/ss_01a87d9ec6cef10244eb5dd8d3f55047060da954.1920x1080.jpg): grass forms broad irregular masses with a soft taper into a clean, readable path; blades share a prevailing lean rather than radiating like starbursts.
- [V Rising — subdued forest path](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1604030/3101acbd497584ac6f8ecb91c05cbb66378d62a1/ss_3101acbd497584ac6f8ecb91c05cbb66378d62a1.1920x1080.jpg): low-saturation blue-green ground, sparse upright accents beside rocks, and continuous dirt rather than decorated square tiles.
- [Last Epoch — dirt/undergrowth boundary](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/899770/6a329eefc0bd1545843f235b4fac5564b7b6dba7/ss_6a329eefc0bd1545843f235b4fac5564b7b6dba7.1920x1080.jpg): dense plants are kept out of the traversal band and grouped against natural boundaries.
- [Last Epoch — damaged grass and exposed earth](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/899770/b429c579742dcc789265f16e8c8ec78f10ad3ef6/ss_b429c579742dcc789265f16e8c8ec78f10ad3ef6.1920x1080.jpg): broken patches of base earth prevent a uniform lawn while the grass still reads as a mass.
- [Diablo IV — dark cracked ground](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2344520/24952fc1c8779c9a7a555c01489c76f9814f70a7/ss_24952fc1c8779c9a7a555c01489c76f9814f70a7.1920x1080.jpg): very dark ground remains legible through restrained albedo separation, roughness, cracks, and directional light instead of outlines.
- [Diablo IV — scorched landscape](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2344520/7eda1d661ffde2750d56517e1a46406f340675e5/ss_7eda1d661ffde2750d56517e1a46406f340675e5.1920x1080.jpg): ash and char stay low saturation while fire supplies the warm focal colour.

## Black Sky Bound comparison and resulting correction

The first browser proof did not meet this bar. Its camera targets were dominated by near-black tree crowns; the grass base collapsed into black; randomly rotated six-triangle clumps read as isolated starbursts; and the saturated proof torch made the ground look orange rather than revealing its material response.

The correction target is deliberately narrower than copying any one reference:

- retain Black Sky Bound's darker value range, but lift plausible ground albedo enough for normal and roughness response to survive moonlight;
- replace radial clumps with tapered, bent blade clusters that share a slowly varying prevailing lean;
- vary density in deterministic low-frequency patches, with additional concentration around natural features and suppression beside dirt/scorched edges, occupied space, spawn, and escape zones;
- preserve clear continuous paths with renderer-only implicit contours: rounded centres, cardinal/diagonal capsules, variable shoulders, multi-scale domain warp, and opposing edge lobes that create incursions and erosion pockets while authored tile centres remain authoritative;
- use less saturated validation torch light and choose camera targets with measured canopy clearance, so the screenshots actually validate terrain rather than foreground occlusion.

## Acceptance result

The final reference-gated proof is `artifacts/terrain-material-v1/final-reference-gated/report.json`. Against the reference set, it now meets the deliberately scoped targets: a quiet continuous ground layer; organic, non-rectilinear dirt/grass/scorch silhouettes; clean traversal bands; sparse clumps in deterministic patches; a shared prevailing lean; material response driven by local/directional light; and a broad neutral-light capture that exposes repetition. It does not attempt to match the references' production budgets, dense biome dressing, or hand-authored hero areas.
