# AXIOM Bake Cache v0 for Black Sky Bound

Pipeline:

`Canonical Truth -> Projection Spec -> Bake Cache -> Render Object`

## v0 scope

AXIOM now has a disposable bake cache for BSB projected layer planes. The first working proof is the existing BSB runtime layer texture path, routed through a bake entry before a Three.js plane is updated.

Useful v0 bake targets:

- `cloud_fog_mist_volume`: BSB weather/cloud/rain/storm projections.
- `tile_mask_cover_visibility_layer`: BSB LoS, fog-of-war, cover, terrain-field, and command-field projection layers.
- `wall_trench_path_joinery`: BSB structure/joinery projections.
- `large_scenery_object_group`: BSB scenario/authored-scene/VFX projection layers.

Each bake item stores `bakeId`, `bakeType`, `sourceCanonicalIds`, `dirtyKeys`, `createdAtVersion`, cached render output, and traceability back to canonical owners. Clean bakes are reused. Dirty or missing bakes are regenerated from BSB canonical runtime output.

## Canonical boundary

BSB remains authoritative for map truth, game state, simulation, fields, visibility, entities, unit state, orders, AI intent, selection, health, and resources. AXIOM baked outputs are cached projection consequences only.

Editor selection and hit-testing on baked projection planes must resolve through `canonicalSourceIds` and bake traceability, not through baked objects as source truth.

## QA checks

The bake cache audit reports:

- orphan baked outputs,
- stale dirty cache usage,
- baked outputs that no longer trace to a live canonical source.

The cache rejects baked output that claims gameplay/editor authority or contains forbidden gameplay-state keys.

## v1 target

v1 should split the current layer-plane proof into typed producers with dependency indexes:

- cloud/fog/mist volumes as bounded volumetric impostors or instanced sprites,
- wall/trench/path joinery as topology-keyed meshes,
- large scenery groups as pooled instances with per-source traceability,
- tile masks/cover/visibility layers as packed textures or atlas regions.

Dirtying should move from broad snapshot marks to source-key invalidation, such as `field:playerLoS`, `weather:fields`, `structureJoinery:canonical`, `scenario:<id>`, and entity/source IDs. Renderers should consume bake handles and update pooled objects without per-frame BSB queries or material churn.
