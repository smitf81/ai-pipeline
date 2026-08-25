# Active BSB Production Slice

## Mama Flyover + Napalm Activation Performance v1

Status: Complete 2026-08-21.

### Interpreted task

Remove the reproducible frame-time hitch around the Mama Wyvern flyover and its napalm/inferno deployment while preserving the accepted Three.js silhouette, breath delivery, tree ignition, smoulder, and persistent burnt-out states. Treat this as a bounded evidence-led performance pass, not a visual rewrite.

### Canonical ownership

- `worldEventSystem` and `foliageFireStates` continue to own simulation timing, ignition caps, and state progression.
- Renderer-neutral projection continues to own changed material packets and world-event render packets.
- The Three.js backend owns resource prewarming, material application, render-distance/state LOD, and performance diagnostics.
- Tree source recipes and authored maps remain unchanged.

### Implemented slice

Profiled first-use and steady-state CPU/GPU frame time at flyover visibility, breath visibility, inferno/tree ignition, and the normal fire lifecycle. Implemented only the measured lifecycle fixes:

- hidden pooled Mama, dragonfire, fire-wall, foliage-flame/core and smoke paths are uploaded through the screen renderer before event use;
- cached tree render targets and shared per-object shader uniforms replace event-time custom-PBR material cloning;
- a reproducible 7,661-triangle Mama flyover LOD1, two instanced dragonfire batches, non-cubemap distributed-fire physical shadow LOD and camera-frustum foliage VFX LOD bound render cost;
- the current single canonical state machine, source Mama GLB, cached procedural tree recipes and authored map truth remain intact.

### Outcome

- First Mama visibility: 826.5 ms baseline → 41.6 ms final.
- Inferno/tree ignition: 1681.3 ms baseline → 29.8 ms final.
- Event-boundary shader/material growth: 3 programs + 2 materials baseline → zero final.
- Final resource count: 41 programs, 534 materials, zero dynamic scenery materials.
- Full tests, LOC, curated build, Mama browser smoke, performance regression and resource audit pass. The real browser lane covers the complete fire lifecycle and post-event movement with no unexpected browser failures.

### Explicit exclusions

- No new Mama geometry, animation, texturing, or additional visual detail in this slice.
- No gameplay damage, timing, ignition-cap, encounter, map, or progression changes.
- No global renderer replacement, terrain rewrite, or broad asset-pipeline redesign.
- No change to the accepted visual identity beyond performance-equivalent LOD at distance.

### Definition of done

- Before/after real Chromium evidence identifies the dominant activation costs and shows a material reduction in the worst Mama/napalm frame-time spikes.
- First flyover and first tree ignition do not create new render materials or shader programs on the event frame.
- Near-camera trees still visibly pass through ablaze, smoulder-high, smoulder-low, and persistent burnt-out states.
- Distance/state LOD is deterministic, diagnosed, and bounded; it does not mutate simulation truth.
- Mama remains the imported V5 Three.js asset, crosses the active camera, breathes through the pooled stream, and deposits exactly one inferno wall.
- Focused performance/regression tests, the existing Mama browser smoke, full BSB tests, LOC, and curated build pass with no unexpected browser errors.

### Likely follow-ups

1. Add Mama visual detail within the proven triangle, material, shadow, and activation budgets.
2. Extend distance LOD to additional transient VFX families only if frame captures show value.
3. Revisit broader scene/tree LOD separately with representative dense-region profiling.
