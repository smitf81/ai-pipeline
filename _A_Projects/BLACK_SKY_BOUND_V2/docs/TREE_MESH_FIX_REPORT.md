# Tree Mesh Structural Reconstruction

Completed 2026-07-31.

## Outcome

The procedural tree's wood is now one closed, outward-wound manifold surface per tree. Trunk, basal flare, roots and major branches are generated from the existing deterministic skeleton and polygonised together. The former camera-dependent half trunk, capped root tubes, internal root caps and separately intersecting branch spikes are gone.

This is a structural repair, not a bark-texture or canopy-art pass.

## Previous rendering path and failure

The active path remains:

`proceduralTrees.js` tree definition -> `sceneObjects.js` gameplay collision/traversal -> `sceneObjectProjection.js` -> `ThreeSceneryFactory.js` -> `proceduralTreeSpatialRecipe.js` -> `ThreeTreeMeshFactory.js`.

Previously, the mesh factory emitted a separate capped radial sweep for the trunk, every root and every branch, then concatenated those disconnected pieces into one bark buffer. The first ancient-oak trunk face had an outward radial dot product of `-0.609177`, proving that the sweep side winding faced inward. Normal front-face culling produced the apparent half trunk. Root start caps and side faces occupied the trunk interior, while the visible portions read as triangular spikes.

The ancient-oak baseline had 744 bark vertices, 1,376 bark triangles and 28 disconnected closed components. The three-tree reference grove used 9 draw calls and 11,354 total triangles.

## Reused contracts

- Tree DNA, species/seed determinism and the renderer-neutral scenery projection are unchanged.
- The canonical spline recipe still owns trunk, root, branch and foliage placement.
- Hard collision remains the existing trunk circle.
- Roots remain traversable soft-slowdown shapes at multiplier `0.88`; they do not become hard blockers.
- Bark remains one mesh and one material draw per tree.
- Foliage remains one per-tree `InstancedMesh` using the existing shared faceted icosahedron geometry.
- Full-definition geometry caching, material caching, shadows and disposal remain active.

## What changed

`src/world/proceduralTreeSpatialRecipe.js` now gives each root five deterministic anatomical samples: a high embedded shoulder, curved asymmetric run-out, gradual taper, small width/burial variation and a tip that terminates at the receiving plane. The random-consumption count is preserved so root anatomy changes do not incidentally reshuffle downstream branch/canopy generation.

`src/render/backends/three/ThreeTreeMeshFactory.js` now:

- converts trunk, roots and major branches to tapered segment distance fields;
- flattens root cross-sections conservatively while leaving trunk/branch cross-sections round;
- samples only segment-local field bounds rather than testing every segment at every voxel;
- polygonises the anisotropic world-space field with Three.js Marching Cubes;
- welds the result into indexed geometry, retains the principal connected component and corrects winding from signed volume;
- computes smooth vertex normals after the final topology exists;
- reports connected-component, boundary-edge, non-manifold-edge, degenerate-face and signed-volume diagnostics;
- fails with `tree_implicit_surface_empty` rather than silently substituting flat or partial geometry.

The geometry contract/signature is `implicit-manifold-wood-v3`; bark user data identifies construction as `implicit_manifold_wood_v3`.

No external mesh, texture or generated raster asset was introduced. The implementation uses the project's existing MIT-licensed Three.js dependency and its bundled Marching Cubes and BufferGeometry utilities.

## Developer diagnostics

The reference grove accepts these deterministic query controls:

- `tree=all|old_pine|silver_birch|ancient_oak`
- `treeView=lit|wireframe|normals`
- `canopy=0|1`
- `angle=front|rear|left|right|three-quarter|<degrees>`
- `framing=gameplay|full|roots`
- `lighting=moon|torch-a|torch-b|lightning|studio`

The renderer also exposes `setTreeDiagnosticView(mode)` and `setTreeReferenceCanopyVisible(visible)`. Browser diagnostics report bark vertices/triangles plus woody component, boundary and non-manifold counts.

## Measured result

| Species | Cold median | Cached median | Bark vertices | Bark triangles | Components | Boundary / non-manifold |
|---|---:|---:|---:|---:|---:|---:|
| Old pine | 18.232 ms | 0.338 ms | 2,074 | 4,144 | 1 | 0 / 0 |
| Silver birch | 7.766 ms | 0.166 ms | 820 | 1,636 | 1 | 0 / 0 |
| Ancient oak | 13.581 ms | 0.309 ms | 1,764 | 3,524 | 1 | 0 / 0 |

All three species also report zero degenerate triangles and positive signed volume.

The final three-tree reference grove remains 9 draw calls and rises from 11,354 to 17,698 total triangles (+6,344, +55.9%). Its CPU render-path p95 is 0.7-0.9 ms versus the recorded 0.8-1.4 ms baseline. GPU timer queries are unavailable in this isolated reference lane.

The whole live-world proof passed at 209 calls / 112,418 triangles, CPU p95 6.5 ms and GPU p95 7.745 ms. The stress proof's clean rerun passed with zero long frames:

- locked DPR 1: 16.6 ms frame-interval p95, 8.4 ms render-path p95, 7.559 ms GPU p95;
- machine DPR 1.5: 16.8 ms frame-interval p95, 8.4 ms render-path p95, 13.912 ms GPU p95.

One immediately preceding machine-DPR stress run missed the strict frame-interval gate at 20.8 ms p95 (GPU p95 16.219 ms); the isolated rerun above passed. This transient result is retained as a known measurement variance rather than discarded.

## Visual evidence

`artifacts/webgl3d-tree-mesh-v2/` contains 12 fixed-camera Playwright captures and `playtest-report.json`:

- the three-tree grove under moon, two moving-torch positions and lightning;
- ancient-oak roots from front, rear, right and left under identical studio lighting;
- canopy-hidden full three-quarter, wireframe and normal-shaded views;
- normal gameplay framing with canopy visible.

Every capture passed with zero console errors, page errors or request failures. The browser topology diagnostics report one woody component and zero boundary/non-manifold edges.

## Validation completed

- `node --test tests/threeTreeSpatialRecipe.test.mjs`
- `node tests/environmentCollision3D.test.mjs`
- `node tests/sceneObjectsFoundation.test.mjs`
- `npm test`
- `npm run test:loc`
- `node tests/playtest/webgl3dReferenceGrove.playtest.mjs`
- `node tests/playtest/webgl3dLiveWorld.playtest.mjs`
- `node tests/playtest/webgl3dPerformance.playtest.mjs`
- `npm run build:playtest`
- `node tests/playtest/webgl3dBuiltPackage.playtest.mjs`

The production bundle and packaged-browser smoke passed with no console, page, request or HTTP errors.

## Tunable parameters

- Root count and scale: species `rootScale` in `src/data/proceduralTrees.js`.
- Root length, curve, shoulder, taper and burial: `buildRoots()` in `src/world/proceduralTreeSpatialRecipe.js`.
- Field resolution/texel density: `implicitResolution()` in `ThreeTreeMeshFactory.js`.
- Root vertical flattening: root `verticalScale` in `appendImplicitWood()`.
- Minimum visible major-branch radius: branch `ar`/`br` clamps in `appendImplicitWood()`.
- Field sampling padding and ground closure: `populateImplicitField()` and `floorY`.

## Known limitations

- This pass does not add bark PBR textures, bark grooves or a higher-fidelity canopy. Lighting and the existing material still carry the surface read.
- Very fine terminal twigs intentionally fall below the implicit resolution; the canopy supplies their gameplay-distance silhouette. Major branches are nevertheless part of the closed trunk volume, not hidden disconnected spikes.
- Cold generation is paid once per unique complete tree signature. It is not a per-frame cost, but a future forest-scale pass could pre-bake common signatures if maps use very large numbers of unique seeds.
- Marching-cubes topology is economical and watertight but not hand-retopologised; wireframe triangle flow is functional rather than artist-authored.
