# Atmospheric Light Scatter v1

## Goal

Make smoke feel like air catching light without introducing true volumetrics, SDF shadows, or per-particle lighting.

This pass keeps the existing rule:

```txt
many smoke producers
-> one smoke source list
-> one low-resolution smoke density texture
-> light/scatter composite
-> central post-process polish
```

## What this is

Atmospheric scatter is a derived render pass. It samples:

- the unified smoke source projection
- the low-resolution smoke density texture
- the current light views, including raider torches and napalm pool lights

It then composites warm scatter where dense smoke overlaps bright light.

## What this is not

This is not:

- true volumetric simulation
- fog gameplay logic
- SDF shadowing
- fire spread
- blood or decal gameplay
- a new smoke source model
- a private post-processing pipeline

## Render flow

```txt
smoke sources
-> density texture
-> base smoke texture
-> light-over-density texture
-> atmospheric scatter texture
-> central post-process bloom / softening / dither
```

The atmosphere layer now stops at density, lit smoke, and scatter contribution. Final glow and smoothing are owned by the central post-process pipeline so this layer does not become a private compositor.

## Diagnostics

`renderLayers.smokeField` exposes:

- `scatterStrength`
- `scatterSourceCount`
- `scatterTextureScale`
- `scatterPasses`
- `scatterBloomPasses`
- `scatterPolicy`
- `scatterBloomPolicy`
- `scatterSmoothingPolicy`
- `scatterSmoothingPasses`

These are surfaced via `getRenderLayerStats(...)` as atmospheric scatter values.

`scatterBloomPolicy` and `scatterSmoothingPolicy` should read `delegated_to_post_process_pipeline`.

## WebGL Atmospheric Recovery v1

After the WebGL-only migration, the live renderer no longer owns the historical Canvas smoke density canvases described above. The current WebGL recovery keeps the same conceptual model but implements it with existing WebGL primitives:

```txt
renderer-neutral fogSmoke packets
-> layered soft plume radials
-> projected light overlap test
-> additive warm scatter radials
-> central WebGL post-process target
```

This is intentionally not a shader/volumetric pass. It restores visible smoke/light interaction in the WebGL path while leaving the later shader work separate.
