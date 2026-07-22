# Smoke Field + Light Interaction v1

Historical note: this document describes the former Canvas 2D smoke-field renderer path. Canvas 2D runtime modules under `src/render/layers/` were removed in Canvas 2D Renderer Cull v1. The live smoke/fog renderer is now `src/render/backends/webgl/layers/WebGLFogSmokeLayer.js`.

## Goal

This pass replaces visible smoke as repeated radial cloud stickers with a bounded render-field approach.

The intended model is:

```txt
smoke truth/entities
  -> low-resolution density texture
  -> scrolled/distorted smoke composite
  -> light scatter pass clipped by smoke density
  -> one atmospheric layer over the lit scene
```

The player should read the result as a larger drifting smoke mass, while the renderer avoids treating every puff as a permanent live visual object.

## What this is

- A derived render projection.
- A low-resolution smoke density texture.
- A light-aware atmospheric composite.
- A foundation for later fog/ash/rain/volumetric-feeling passes.

## What this is not

- Not volumetric simulation.
- Not real fluid dynamics.
- Not SDF shadowing.
- Not fire spread.
- Not a gameplay visibility/stealth rule yet.
- Not per-particle smoke.

## Current implementation

The live WebGL renderer now implements the current smoke read in:

```txt
src/render/backends/webgl/layers/WebGLFogSmokeLayer.js
```

The WebGL path consumes renderer-neutral `fogSmoke` and `lights` packets, breaks visible smoke into layered soft radials, and adds bounded warm scatter radials where projected lights overlap smoke density. It does not restore the historical Canvas offscreen density canvases below.

Historical Canvas implementation:

Files:

```txt
src/data/smokeFields.js
src/render/layers/atmosphereLayer.js
src/projection/renderLayerState.js
src/data/renderBudgets.js
tests/smokeFieldLighting.test.mjs
```

The render layer builds three small offscreen canvases:

```txt
densityCanvas  = smoke density field
smokeCanvas    = base grey smoke clipped to density
lightCanvas    = warm light scatter clipped to density
```

The main renderer draws the smoke field after the darkness/light composite, so smoke can sit over the scene and pick up light from torches and napalm pools.

## Performance rules

- Smoke sources are capped by the existing smoke cloud budget.
- Smoke field uses a low-resolution texture via `densityScale`.
- Contributing lights are capped.
- Main scene does not draw every smoke source directly.
- Diagnostics expose active smoke sources, contributing lights, and texture pass count.

## Current tuning

Napalm pools were also tuned in this pass:

- smaller pool radius
- slightly smaller droplets
- brighter pool light emission

This keeps the mouth-dribble read tighter while making the little napalm pools more useful as light-scatter sources for smoke.

## Next obvious passes

1. SDF / simple occlusion shadow research spike.
2. Dynamic exposure / lightning reveal.
3. Bloom pass for hot light sources.
4. Smoke authored from napalm pools once embers/smoulder states exist.
