# Performance Risk Map

This prototype lives in a browser and should stay playable on normal hardware. The RTX 2060 laptop will tolerate a fair bit, but JavaScript-per-frame stupidity still wins every time.

## Runtime risk heatmap

| System | Risk level | Why risky | Safe cadence | Existing mitigation | QA proof | Next hardening idea |
|---|---|---|---|---|---|---|
| Render loop | High | Easy to hide heavy work in `requestAnimationFrame` | Every frame, visual-only | Frame delta clamp, one tick cap, render/interp separation | `runtimePerformanceQa.test.mjs`, browser smoke | Add lightweight frame-cost HUD/debug stat if needed |
| Tactical overlay rendering | High | Contours/frontlines/fields can explode in pixel/tile work | Only while visible, cached per sim state | Hidden overlays skipped by rule | browser smoke, runtime QA | Overlay dirty signatures + resolution tiers |
| Field recomputation | High | Full-map + entity calculations scale quickly | Simulation tick or dirty-event | Derived/cadenced field rules | `gameModel.test.mjs`, runtime QA | Dirty-region rebuilds, spatial partitioning |
| LoS derivation | High future risk | Rays/visibility can become brutal | Dirty + cadence + culling | Not fully implemented yet | future tests | Shadowcasting/field-of-view grid with budget cap |
| Pathfinding | High | Many moving units can hammer route builds | Simulation tick, route cache | Route cache and path signatures in QA metrics | runtime QA report pathfinding metrics | Shared flow fields / path intent lanes |
| Collision/separation | High | Naive pairwise checks scale horribly | Simulation tick, spatial buckets | Collision buckets + separation metrics | `collisionAuthority.test.mjs`, runtime QA | Broader spatial index / neighbourhood caps |
| Construction job advancement | Medium | Builder scan/claim/path can grow with jobs | Simulation tick, claim cadence | Builder claim cadence, job states | `constructionJobs.test.mjs` | Job queues by faction/base/region |
| Structure topology/nav | Medium | Rebuilding blocker index too often is wasteful | On structure nav signature change | `createStructureNavigationSignature`, runtime cache | `structureTopology.test.mjs` | Dirty invalidation per region |
| Autosave/persistence | Medium | localStorage writes can hitch | Debounced, dirty only | Persistence lane rules | browser smoke + runtime cadence review | Explicit save queue/status |
| Browser smoke capture | Low/Medium | Screenshots can be slow/flaky on Windows | Test run only | Separate `test:browser` command | browser output artefacts | Keep deterministic seeds + minimal screenshot count |
| UI summaries | Medium | Can accidentally recompute whole world for text | On state change/tick, not per frame | Mostly component-driven | browser smoke | Memoised summaries / snapshot builders |

## Current known warning

The runtime performance report can warn that a 520-squad horde/chokepoint tick projects above the comfortable budget. Treat that as a real warning before adding:

- more per-unit pathfinding
- more field recomputes
- more collision checks
- per-frame LoS
- default visible tactical overlays

## Good patterns

| Pattern | Why it helps |
|---|---|
| `MAX_TICKS_PER_FRAME = 1` style cap | Avoids catch-up spirals after hitches. |
| Clamped frame delta | Stops background tab/Windows nonsense causing giant steps. |
| Visual interpolation store | Smooths visuals without mutating truth. |
| Signature-based nav cache | Rebuilds structure navigation only when blockers/modifiers change. |
| Route cache hits | Avoids rebuilding same paths for many units. |
| Overlay hidden skip | Makes diagnostics optional rather than constant tax. |
| Runtime QA report | Gives agents evidence instead of vibes. |

## Bad patterns to reject

```txt
for every frame:
  for every tile:
    for every unit:
      calculate cleverness
```

That is not “emergent AI”. That is a space heater with delusions.

## Agent check before performance-sensitive patches

A patch touching movement, fields, collisions, construction scanning, or rendering must answer:

1. What cadence does this run on?
2. What is its worst-case loop shape?
3. What cache/dirty flag prevents repetition?
4. What test or report proves it didn’t tank runtime?
5. What happens when overlays are hidden?
