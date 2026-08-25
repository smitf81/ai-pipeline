# Black Sky Bound 3D renderer/resource pipeline audit

Audit date: 2026-08-11  
Scope: mesh/geometry instancing, resource reuse, first-use work, gameplay-time creation, and repeatable preprocessing opportunities.  
Runtime: the fixed gameplay camera in the browser playtest, with the existing fixed-isometric render envelope enabled.  
Evidence: `artifacts/three-resource-pipeline-audit-v1/report.json`, `active-play.png`, and `boot-cpu-profile.json`.

The initial evidence pass was audit-only. A bounded follow-up implementation was completed on 2026-08-11 for the three smallest measured costs: overflow/debug state coupling, atmospheric material invalidation, and transparent double-sided VFX passes. Gameplay simulation and fixed-isometric culling were not changed.

## Executive conclusion

The current renderer already uses instancing and boot-time loading well in the high-volume terrain, grass, rain, atmospheric spark, foliage-fire, baby-drool, and particle paths. The fixed-isometric envelope remained active throughout the audit: 217 renderables, 30 visible, 16 in the safety margin, and 171 culled (78.8%). No texture or model requests occurred during the active-play sample.

The highest-value small next slice is not a broad instancing rewrite. A one-frame local-light overflow currently auto-enables the full diagnostics state, which in turn enables contact-debug world geometry. The measured event created 180 meshes, two geometries, two materials, two additional shader programs, and averaged 7.47 extra main-pass draw calls per sampled frame after activation. The overflow later cleared, but the debug geometry stayed enabled. Decoupling the overflow warning from explicit world-debug visualization is narrow, low-risk, and directly removes measured gameplay-time resource creation and draw work.

With those narrow fixes complete, the next resource-focused candidates are immutable tree/undergrowth primitive sharing followed by preprocessing/caching terrain blend masks and procedural tree bark geometry. The preprocessing work has larger startup/map-transition upside but needs its own bounded cache/versioning slice.

## Implementation follow-up

The first three recommendations are now implemented:

- Local-light overflow displays a compact, automatic warning without entering explicit F3 debug mode or invoking `ThreeLiveWorld.setDebugVisible`.
- Stable rain and spark updates no longer set `material.needsUpdate`; render-state changes still invalidate when required.
- Transparent double-sided baby-drool and foliage-fire materials retain double-sided shading but opt into Three.js single-pass rendering.

In the equivalent active stress lane:

- diagnostic contact draws fell from 7.47 to 0 calls/frame;
- baby-drool draws fell from 13.13 to 7.53 calls/frame;
- foliage-fire draws fell from 2 to 1 call/frame;
- total renderer calls fell from 110.31 to 93.74 per sampled frame (15.0%; state-dependent VFX composition means the class deltas are the stronger attribution);
- deterministic 32-light browser overflow reported eight dropped lights at the fixed 24-slot capacity while contact debug remained disabled with a zero-sized pool;
- rain and spark material-version changes both fell from 45 per 45 sampled frames to zero;
- the render envelope remained 217 total, 30 visible, 16 margin, and 171 culled.

Evidence is recorded in `artifacts/three-resource-pipeline-optimization-v1/report.json`, `overflow-warning.png`, and `active-play.png`. The dedicated nine-stage baby-drool proof also passed under `artifacts/baby-wyvern-drool-visual-approval/resource-optimization-v1/` with no browser errors or visible missing-face/sorting regression in the inspected close captures.

## Method and limits

The query-gated browser audit walks the live Three.js scene, fingerprints attached geometries/materials/textures, records material versions and renderer program/memory counts, classifies main-pass render callbacks, records network activity, and stresses rain plus recurring fire/dragon VFX. Draw counts for transparent double-sided materials include Three.js's two main render passes. Shadow callbacks were collected but are not used as class draw counts because point-light cube faces make callbacks differ from renderer-level calls.

The run completed without console errors, page errors, or failed requests. Headless software rendering and DevTools CPU profiling distort absolute frame and compilation times, so FPS and raw profiled milliseconds are not used to rank findings. Resource counts, network events, per-frame draw-call classification, material-version deltas, call stacks, and relative CPU attribution are suitable evidence.

## Draw calls by major object class

The active sample averaged 110.31 renderer calls and 184,891 triangles per rendered frame. Major main-pass calls per frame were:

| Object class | Calls/frame | Current shape |
| --- | ---: | --- |
| Trees | 18.00 | 107 foliage `InstancedMesh` objects, but bark and foliage are separate per tree group |
| Scenery/props | 15.00 | 257 mesh objects sharing four geometries and two materials |
| Baby drool | 13.13 | 12 instanced batch families; transparent double-sided batches can render twice |
| Undergrowth | 13.00 | 27 instanced meshes across 10 chunks, plus non-instanced chunk data |
| Actors | 10.00 | Outside this audit's optimization scope |
| Recurring VFX | 8.11 | Pool-backed individual meshes; highly state-dependent |
| Diagnostic contact geometry | 7.47 | Unintentionally enabled by local-light overflow during the run |
| Rocks/props | 7.00 | 20 meshes sharing one geometry and one material |
| Terrain floor | 6.00 | 18 instanced chunk/batch meshes, envelope-culled |
| Terrain rock | 4.00 | 12 instanced batches, envelope-culled |
| Foliage fire | 2.00 | One visible transparent double-sided instanced batch |
| Dragonfire | 1.80 | State-dependent recurring VFX |
| Water | 1.00 | Instanced and envelope-culled |
| Grass detail | 1.00 | One instanced draw; 73 active instances in this sample |
| Rain | 1.00 | One instanced draw, 300 logical instances |
| Atmospheric sparks | 1.00 | One instanced draw, 30 logical instances |

The fixed envelope is already doing meaningful work before these calls reach Three.js: only 46 of 217 scoped terrain/foliage/scenery renderables were retained as visible or safety-margin content.

## 1. Already efficient

### High-volume geometry is generally instanced

- The scene contained 19,384 logical instances represented by 195 `InstancedMesh` objects.
- Terrain floor used 18 instanced meshes for 3,461 instances; rock terrain used 12 for 996; water used seven for 343.
- Grass detail used one instanced mesh, rain one, atmospheric sparks one, foliage fire three, and baby drool 12 fixed batch families.
- Undergrowth used 27 instanced meshes for most of its 8,949 logical instances.
- Tree foliage was instanced within each procedural tree: 107 `InstancedMesh` objects carried 4,033 logical instances.

### Textures are reused and loaded before active play

- The live scene referenced 24 unique textures and the renderer reported 25 uploaded textures.
- No duplicate texture fingerprints were found.
- Boot recorded 20 PBR image requests (bark, foliage, grass, mud, and rock sets) and one Mama flyover GLB request.
- Active play recorded zero asset requests, zero new texture handles, and zero active resource entries.
- Bark/foliage and terrain material variants share their texture handles rather than cloning maps per object.

### Runtime VFX pools prevent most first-use object allocation

- The general effect layer preallocates fixed decal, ring, smoke, flame, firewall, lightning, and related pools.
- Its allocation counter moved only from 458 to 459 during the rain/inferno/dragonfire stress sample.
- Particles, rain, sparks, baby drool, and foliage fire use fixed-capacity instanced paths.
- The physical light adapter preallocates 24 local-light slots and two shadow-light slots; lights are updated rather than recreated every frame.

### Static projection and render culling remain effective

- Projection diagnostics reported 135 static-cache hits and one rebuild; the sampled frame spent no time rebuilding static projection data.
- The fixed-isometric envelope remained unchanged and active at 30 visible, 16 margin, and 171 culled renderables.
- Terrain, rocks, scenery, trees, and undergrowth all showed materially lower visible mesh/draw counts than their total scene inventories.

## 2. Measurable waste

### Local-light overflow enabled persistent contact-debug geometry (resolved)

At frame 112, 24 local-light slots were used and one light was dropped. At frame 114, overflow had cleared, but diagnostics had enabled world debug and allocated a contact pool of 60 volumes. Each contact volume owns three meshes.

Measured change during active play:

- mesh objects: 1,132 to 1,320 (`+188`), of which 180 were contact-debug meshes;
- attached unique geometries: 307 to 309 (`+2`);
- attached unique materials: 535 to 538 (`+3`, including two contact-debug materials);
- renderer shader programs: 42 to 46 (`+4`, with two appearing when debug enabled);
- diagnostic main-pass work: 7.47 draw calls/frame averaged over the sample after mid-run activation;
- contact debug stayed enabled after the transient overflow ended.

The causal path is explicit in code: light overflow calls `ThreeDiagnosticsOverlay.setEnabled(true)`; its `onChange` callback calls `ThreeLiveWorld.setDebugVisible`; that enables `ThreeContactDebugLayer` through the actor layer.

### Recurring VFX pool resources are allocation-safe but resource-heavy

The recurring VFX class held 477 mesh objects, nine geometries, and 456 materials while only 41 mesh objects were visible in the final sample. Before stress, repeated material fingerprints included:

- 234 identical decal materials;
- 80 identical smoke materials;
- 41 identical ring materials;
- 32 identical dropped-torch materials;
- 32 identical flame materials.

This is a deliberate pooling tradeoff that avoids hitches, so it should not be dismantled blindly. It is nevertheless measurable CPU object/material overhead and makes decals, smoke, and rings candidates for a later instanced or shared-material pool design.

### Rain and atmospheric sparks invalidated their material every update (resolved)

Both material versions increased exactly 45 times across 45 active rendered frames. `ThreeAtmosphericOverlayEffects.updateMaterial` sets `material.needsUpdate = true` unconditionally even though the regular updates are color, opacity, and related values that do not require a new program variant. This is avoidable renderer state/program-cache revalidation work.

### Transparent double-sided effects added duplicate passes and material churn (resolved)

The scene contained 35 recurring-VFX, seven baby-drool, and three foliage-fire meshes using transparent `DoubleSide` materials. Five visible baby-drool meshes and one visible foliage-fire mesh used that mode in the final inventory.

Three.js renders transparent double-sided materials in separate back/front passes unless `forceSinglePass` is enabled. This explains why six baby-drool batch families produced about 13 main calls/frame and why one visible foliage-fire batch produced two. Several such material versions increased by 90 over 45 frames as Three.js switched render sides for the two passes. The follow-up enabled single-pass rendering and passed the active stress and dedicated nine-stage drool visual captures without an observed missing-face or sorting regression.

### Identical geometry/material resources are recreated per procedural owner

- 113 distinct `IcosahedronGeometry` instances had the same 240-vertex fingerprint; tree foliage accounts for most of them. `ThreeTreeMeshFactory` creates the same unit foliage geometry once per unique tree recipe cache entry.
- Undergrowth created 10 identical circle geometries and repeated identical leaf, ground, and related chunk materials across its 10 chunks.
- Trees used 214 unique geometries for 214 mesh objects even though all 107 foliage units can share one immutable geometry. Tree bark remains recipe-specific.

These are straightforward reuse opportunities that reduce construction, disposal, and memory overhead. They will not by themselves reduce the current 18 tree draw calls/frame because tree groups remain separate.

### Props and rocks share resources but remain individual meshes

- Scenery/props: 257 mesh objects, four geometries, two materials, 47 visible objects, 15 calls/frame.
- Rock props: 20 mesh objects, one geometry, one material, 10 visible objects, seven calls/frame.

Resource reuse is already good. Chunk-local instancing is an obvious draw-call candidate, but the envelope has reduced the present cost enough that this is lower priority than the measured debug and material churn.

## 3. Likely hitch/stutter sources

### Procedural tree bark construction at boot or map rebuild

There were 107 tree groups and 107 tree geometry-cache entries, so the initial map's procedural signatures mostly defeated cross-tree bark reuse. CPU profile attribution placed the Marching-Cubes distance field, polygonization, vertex merge, and closed-geometry audit among the dominant app-owned boot work. The cache helps later rebuilds, but first construction is still substantial.

Recommended later direction: serialize/pre-bake bark `BufferGeometry` by stable tree recipe/version, or keep a durable cross-map cache. This is a high-upside preprocessing slice, but it needs asset/version/disposal design and is larger than the immediate fix.

### Terrain blend-mask generation is large static CPU work

The terrain material system built a 640 by 480 mask (307,200 pixels) during static construction. Organic layer-weight sampling, point-to-segment distance, hashing, and connection-radius calculations dominated app-owned boot profile attribution. It correctly does not rebuild per frame, but it is a strong preprocess-once candidate.

Recommended later direction: cache or author the blend mask by stable runtime-map/material-profile hash, preserving the current runtime fallback for changed authoring data.

### Shader variants not covered by static scene warm-up

The renderer explicitly calls `renderer.compile(scene, camera)` after static invalidation and had 42 programs after warm-up. Active stress raised the program count to 46. Two variants appeared before contact debug and two when contact debug became visible. Invisible preallocated resources are not guaranteed to be compiled by a scene-only warm-up, so rare VFX/debug first visibility can still compile variants.

The headless profile cannot assign a trustworthy real-device stall duration, but new program creation during active play is observable. After removing accidental debug activation, a small representative warm-up scene for production VFX variants is preferable to compiling every dormant pool object.

### Rock texture handles are rebuilt on terrain surface rebuild

Grass, mud, bark, and foliage systems retain texture handles, but `ThreeTerrainMaterialSystem.clearSurfaces()` disposes rock material textures and the next surface build recreates/reloads them. No active-play request occurred in this sample, so this is a medium-confidence map-transition/static-rebuild hitch risk rather than a measured gameplay stall.

### Allocation-prone VFX math remains, despite pooled render objects

The general effects update code creates temporary `Vector3` values and dragonfire point arrays/clones while positioning pooled objects. The audit proved render-object pooling works, but did not isolate garbage-collection time from these temporary math allocations. Treat this as a profiling target, not an optimization mandate.

## 4. Highest-value optimization — implemented

Implement one narrow slice: **separate fail-visible light-overflow reporting from explicit world-debug geometry**.

Proposed behavior:

1. A local-light overflow may show the diagnostics warning/text automatically.
2. It must not call the same state transition used by F3 or an explicit diagnostics query flag.
3. Contact/terrain debug geometry is enabled only by explicit user/debug intent.
4. Add a browser regression that briefly exceeds 24 local lights and verifies: overflow is reported, contact-debug stays disabled, its pool stays at zero, no debug geometry/material/program delta occurs, and the fixed-isometric culling counts remain active.

Measured result: the deterministic overflow displayed its warning with no contact-debug pool, no diagnostic meshes, and no diagnostic draw calls. The previous audit's 180 unwanted debug meshes and two debug shader variants did not appear.

### Ordered follow-ups, not part of this slice

1. Share immutable unit tree-foliage and undergrowth primitive/material resources.
2. Cache/pre-bake the terrain blend mask and procedural tree bark geometry by stable content hash.
3. Re-profile before considering chunk-local prop/rock instancing or a larger instanced VFX-pool redesign.

Validation status: focused unit tests, the full BSB suite, production playtest build, resource stress browser proof, and baby-drool browser proof passed. The broader Mama flyover smoke script remains blocked by its pre-existing/stale assertion that Three.js undergrowth must use four global batches; the current chunked renderer exceeds that before the script reaches its inferno capture. This slice does not change undergrowth batching.

## Preserve as-is

- Fixed-isometric render-envelope culling and its 1.5 m safety margin.
- Gameplay simulation independent from render visibility.
- Current terrain/rain/spark/particle/foliage-fire/baby-drool instancing.
- Boot asset loading and shared PBR texture handles.
- Fixed light slots and shadow-owner cap.
- Existing VFX pools until a replacement demonstrates equal first-use stability.
