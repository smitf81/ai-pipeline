# Post-Process Pipeline Ownership v2

Historical note: this document describes the former Canvas 2D post-process ownership pass. Canvas 2D runtime modules under `src/render/layers/` were removed in Canvas 2D Renderer Cull v1. The live post-process owner is now `src/render/backends/webgl/WebGLPostProcessPipeline.js`.

## Purpose

Post-processing now has one renderer-owned stage instead of being scattered across individual render layers.

The goal is not to remove post-processing. The goal is to stop smoke, scatter, shadows, decals, and future effects from each growing their own private blur, mask, or glow chain.

## Render flow

```txt
terrain / decals / actors / material particles
scene colour multiplied by the additive RGB illumination field
emissive world events and effects
fog / smoke / scatter contribution
central post-process pipeline
camera atmosphere / overlays / HUD
```

HUD stays after post-process so debug and player-facing text remain crisp.

## Canonical owner

`src/render/backends/webgl/WebGLPostProcessPipeline.js` owns:

- low-resolution screen bloom
- final softening
- stable screen dither
- future exposure and colour-grade hooks

`src/render/backends/webgl/WebGLGameRenderer.js` owns the pass order.

`src/data/renderBudgets.js::postProcess` owns the budget and quality policy.

`src/projection/renderLayerState.js` exposes runtime pass counts and policy diagnostics.

`src/render/backends/webgl/WebGLIlluminationPipeline.js` owns illumination field generation and the multiplicative scene composite. It is deliberately separate from post-processing.

## What moved out of atmosphere

The atmosphere layer no longer owns:

- scatter bloom canvas
- scatter smoothing helper
- stable dither helper
- bloom, smoothing, or dither tuning on the smoke field profile

It still owns:

- smoke density texture
- base smoke texture
- light-over-density texture
- atmospheric scatter contribution
- light-space feather clipping for those textures

## Diagnostics

`getRenderLayerStats(...)` now exposes:

- `postProcessPolicy`
- `postProcessQualityProfile`
- `postProcessSourcePolicy`
- `postProcessBloomPolicy`
- `postProcessSmoothingPolicy`
- `postProcessExposurePolicy`
- `postProcessDitherPolicy`
- `postProcessTextureScale`
- `postProcessBloomPasses`
- `postProcessSmoothingPasses`
- `postProcessExposurePasses`
- `postProcessDitherPasses`
- `postProcessFilterSupported`

Atmospheric scatter diagnostics keep delegated policy fields so drift is visible if a layer tries to retake ownership.

## Non-goals

- No gameplay visibility rules.
- No new shadow model.
- No true volumetrics.
- No per-layer post-process pipelines.
- No quality menu UI yet.

## Validation

Protected by `tests/postProcessPipeline.test.mjs`, `tests/atmosphericScatter.test.mjs`, and the focused project test runner.
