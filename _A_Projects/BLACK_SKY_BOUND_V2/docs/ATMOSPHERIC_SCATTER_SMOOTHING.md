# Atmospheric Scatter Smoothing v1

## Status

Historical note: this slice introduced bounded smoothing inside the former Canvas 2D atmosphere path. Canvas 2D runtime modules under `src/render/layers/` were removed in Canvas 2D Renderer Cull v1, and live post-process ownership now sits in `src/render/backends/webgl/WebGLPostProcessPipeline.js`.

Smoothing is still wanted, but it is now a central post-process responsibility rather than a smoke-layer responsibility.

## Current model

```txt
atmosphere layer:
  density
  base smoke
  lit smoke
  scatter contribution

post-process layer:
  low-resolution bloom
  final softening
  stable dither
```

## What changed from the original smoothing slice

- Scatter and bloom smoothing moved out of the atmosphere layer and into `src/render/layers/postProcessLayer.js`.
- Canvas image smoothing remains enabled for smoke/scatter offscreen layers and final upscaling.
- The distortion draw still avoids extra one-pixel slice overdraw.
- Stable dither is applied once by the post-process pipeline.
- Diagnostics now expose delegated atmosphere policy plus post-process pass counts.

## What this is not

- Not true volumetrics.
- Not new smoke simulation.
- Not extra per-particle lighting.
- Not SDF shadowing.
- Not fog gameplay.

## Rendering rule

Many smoke producers still feed one unified smoke source list. The renderer still builds one low-resolution density field, then composites smoke, light, and scatter. Final bloom, smoothing, and dither happen once in the central post-process stage.
