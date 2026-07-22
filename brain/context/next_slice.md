# AXIOM / Black Sky Bound Next Slice

Status: Procedural Geology DNA v1 completed 2026-07-21. Canonical architectural authority remains in `brain/emergence/`. The recommended next slice is **Unified Procedural Scene Painting UX v1**.

## Completed Slice

Boulders now use one compact authored geology family rather than a fixed renderer shape.

Delivered behavior:

- `axiom.geology-dna.v1` intent containing seed, formation, palette, scale, height, angularity, strata direction/density, erosion, crack density, fracture, moss, wetness, and colours;
- Fieldstone, Fractured Basalt, and Weathered Outcrop recipes;
- deterministic renderer-neutral hull points, facets, strata polylines, crack polylines, moss patches, and wet edges;
- semantic create, collision-aware cluster, set-formation, set-scale, randomise, erode, fracture, moss, weather, and patch operations;
- Map Forge Geology DNA controls plus `EDITOR.procedural.geology`, `axiom_geology_apply`, and a local-agent `geology_action` lane;
- one-revision cluster receipts with requested/created/skipped counts and deterministic ids/positions;
- legacy `type: boulder` normalization without rewriting canonical maps;
- preserved 2x2 blocking collision, `stone_moss` material, occlusion role, authored ids, and runtime-map bake shape;
- removal of the fixed WebGL `buildBoulder` lit-detail path and addition of generated geology diagnostics.

## Canonical Ownership

- `bsb-v2-geology-authoring.js` owns Axiom recipes, compact authoring normalization, and per-record semantic mutation.
- `bsb-v2-map-authoring.js` owns document transactions, collision-aware clusters, selection, dirty/freshness state, inspector controls, and editor API receipts.
- `proceduralGeology.js` owns BSB runtime recipe resolution and scene profiles.
- `proceduralGeologyGenerator.js` owns disposable renderer-neutral formation projections.
- `geologyGeometry.js` owns WebGL adaptation only. It cannot become an authored-shape owner.
- Existing scene-object collision, material, and occlusion systems remain canonical for those concerns.

## Completion Evidence

- Axiom's complete launcher suite passes with deterministic DNA, legacy migration, semantic operation, cluster, runtime-bake, MCP, and local-lane coverage.
- Focused BSB geology, scene-object, collision, material, visibility, runtime-map, renderer, architecture, and LOC tests pass.
- The complete BSB runner reaches only the previously recorded unrelated `atmosphericCameraOverlay.test.mjs` readability-alpha baseline; all post-baseline modules pass separately.
- The shared web-game client completed its real input and text-state loop. Its known WebGL backing-store capture remains black, so dedicated Playwright screenshots provide visual acceptance.
- Real Chromium rendered three formations as 3 generated rocks with 35 hull points, 26 strata segments, 28 crack segments, and 10 moss patches through WebGL with zero browser issues.
- Real Chromium Axiom proof routed natural language through `geology_action`/MCP, applied erode/fracture/moss operations, created five collision-aware outcrops in one cluster receipt, displayed the selected Geology DNA, then reloaded the original source.
- Both authoring maps and both BSB runtime maps retained their exact protected SHA-256 hashes.

## Recommended Next Slice: Unified Procedural Scene Painting UX v1

Turn the proven undergrowth brush into one human-facing semantic painting system for the three procedural families.

Suggested bounded scope:

- extract a shared deterministic brush kernel from `bsb-v2-undergrowth-brush.js` instead of copying its sampling, revision, collision, preview, commit, or undo logic;
- add explicit Tree / Undergrowth / Geology brush modes, with one family selected per stroke;
- share radius, falloff, density, deterministic seed, drag batching, revision-bound preview, commit, and receipt-guarded undo behavior;
- expose recipe/species mixes appropriate to the active family and preserve emitter-capable undergrowth variants;
- preview the actual collision footprint separately from the visual marker, especially the geology 2x2 blocker and nonblocking undergrowth;
- show stable blocked-reason counts for terrain, map bounds, spawn/escape, scene objects, units, and spawners;
- commit one semantic batch revision through the existing family APIs and keep all generated geometry out of the editor document;
- retain direct single-object inspector operations as a precise alternative to painting.

Explicitly do not combine terrain painting, root/leaf decals, dead snags, fire-arrow emitters, or mesh editing into the shared procedural brush in this slice.

## Confidence / Uncertainty

Confidence is high in the truth flow: all three procedural families now expose compact authoring contracts and semantic APIs. The main design risk is interaction density in the left panel. The next slice should prioritize a clear mode switch, compact recipe controls, honest footprint preview, and one reusable transaction kernel over adding more per-family sliders.
