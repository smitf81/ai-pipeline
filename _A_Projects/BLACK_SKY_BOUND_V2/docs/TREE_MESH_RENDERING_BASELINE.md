# Tree Mesh Rendering Baseline

Recorded before the tree-mesh reconstruction on 2026-07-31.

## Active rendering path

1. Authored tree data is resolved to `black-sky-bound.procedural-tree-definition.v1` by `src/data/proceduralTrees.js`.
2. `src/world/sceneObjects.js` derives gameplay collision from the same tree definition. Hard collision remains a trunk circle; visible roots remain traversal slowdown shapes rather than hard blockers.
3. `src/projection/sceneObjectProjection.js` copies the renderer-neutral tree definition into the scenery packet without changing gameplay semantics.
4. `src/render/backends/three/ThreeSceneryFactory.js` routes tree packets to `ThreeTreeMeshFactory` and applies the normal world anchor transform.
5. `src/world/proceduralTreeSpatialRecipe.js` deterministically generates the 3D trunk, root, branch and foliage paths from species plus seed.
6. `src/render/backends/three/ThreeTreeMeshFactory.js` converts every woody path to an indexed radial sweep. All sweeps are concatenated into one bark `BufferGeometry`; foliage clusters use one shared `IcosahedronGeometry` in an `InstancedMesh` per tree.
7. Geometry and materials are cached by the complete tree-definition signature. A live tree still submits one bark draw and one foliage draw; this pass must not add per-root or per-branch draws.

## Confirmed structural failures

- The side triangles of every woody sweep have reversed winding. The ancient-oak baseline's first trunk face has an outward radial dot product of `-0.609177`; Three.js front-face culling therefore hides the exterior and exposes the silhouette mainly through end caps and favourable angles. This is the apparent half trunk.
- Each root is a separate closed six-sided tube beginning at the trunk centre. Its start cap and several side faces sit inside the trunk, while the exposed portions read as intersecting spikes. The trunk and roots are closed individually but are not one anatomical root plate.
- The bark material explicitly requests flat shading. On the sparse rings this amplifies arbitrary triangles instead of describing controlled low-poly planes.
- The baseline ancient oak contains 744 bark vertices and 1,376 bark triangles across 28 disconnected closed woody components: one trunk, six roots and 21 branches.
- The existing browser reference grove submits 9 calls and 11,354 triangles for three trees. Its recorded CPU render-path p95 is 0.8-1.4 ms depending on lighting; GPU timer queries are unavailable in the current browser environment.

## Preserved contracts

- Tree DNA, deterministic species/seed variation, height, canopy, collision and root traversal semantics remain authoritative outside the mesh factory.
- The shared bark draw, per-tree instanced foliage draw, geometry/material caches, shadows and renderer-neutral projection path remain in use.
- Foliage may continue to use icosahedra. The trunk and root plate must not.

## Initial reconstruction boundary

The smallest justified repair is a correctly wound, smooth-normal radial trunk joined to one deterministic polar root plate. The root plate will consume the existing root paths to shape 4-7 uneven ground-following lobes, share the trunk's basal ring, close below the receiving plane, and eliminate separate root tubes and internal root caps. Branch sweeps remain economical closed low-sided forms in the same bark buffer and draw call, but their winding and normals must also be corrected.

Visual validation rejected that initial polar-plate prototype because it still read as a star-shaped skirt. The completed implementation instead uses one sampled implicit volume for trunk, roots and major branches; see `docs/TREE_MESH_FIX_REPORT.md`.
