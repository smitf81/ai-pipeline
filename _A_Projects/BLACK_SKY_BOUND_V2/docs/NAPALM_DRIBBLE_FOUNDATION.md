# Wyvern Napalm Dribble Foundation v1

Historical note: this document originally described the former Canvas 2D napalm/decal renderer path. Canvas 2D runtime modules under `src/render/layers/` were removed in Canvas 2D Renderer Cull v1. The live ground hazard/decal renderer is now `src/render/backends/webgl/layers/WebGLDecalLayer.js`.

## Purpose

Adds the first player-owned visual emitter without giving the player a generic light aura.

The baby wyvern now has a mouth-socket driven napalm dribble:

```txt
wyvern projection mouth socket
  -> bounded live droplets
  -> landed napalm pools
  -> cached scorch decal stamps
  -> small warm pool lights
```

This is a projection/render-layer feature, not a player attack, fire-breath weapon, smoke system, or hazard system yet.

## Architecture rules

- The player remains one gameplay entity.
- The mouth is a projection socket on the wyvern projection.
- `NapalmDripEmitter` is a formal ECS component on the player entity.
- Live droplets and active pools live in `renderLayers.napalm`, not as unlimited ECS entities.
- Napalm pool lights are derived into the normal light view seam.
- Landed pools stamp cached scorch decals, so visual residue uses the existing decal layer.
- Active pools project reusable liquid material/shape metadata through `groundHazards`.
- Emission is cadence/distance bounded and never per-frame spawning.

## Liquid pool decal contract

Napalm pools are now tuned as residual ground liquid, not bright emission orbs:

- the recipe declares `visualMaterial: "residual_liquid_napalm_pool_v1"`;
- the recipe declares `poolShape: "irregular_low_pool"`;
- landed pool state preserves rim, body, cooling, and hot-spot colour facts;
- `buildRenderProjection` forwards those facts into renderer-neutral `groundHazards`;
- `WebGLDecalLayer` composes each pool from scorch/rim/body/lobe radials and a small bounded hot-spot count;
- the light view remains a local warm glow, while the decal shape carries the visual read.

This is deliberately structured for later blood spatter and blood pooling: new materials should be able to reuse the same source-to-state-to-projection-to-WebGL decal path without creating combat-hit visuals as live effects forever.

## Files

- `src/constants/napalmEmitterIds.js`
- `src/data/napalmDribble.js`
- `src/systems/napalmDripSystem.js`
- `src/projection/napalmLayerState.js`
- `src/projection/renderProjection.js`
- `src/render/backends/webgl/layers/WebGLDecalLayer.js`
- `tests/napalmDribble.test.mjs`
- `tests/webglNapalmDecalPipeline.test.mjs`

## Explicitly not included

- no smoke
- no embers
- no volumetrics
- no fire spread
- no damage/hazard gameplay
- no controllable fire breath
- no generic player LightEmitter
- no per-droplet permanent ECS entity spam

## Follow-on candidates

1. Tune mouth socket and droplet cadence visually.
2. Add ember particles sourced from landed pools.
3. Add smoke/heat projection sourced from active pools.
4. Reuse the liquid/decal contract for combat blood spatter and pooling.
5. Later, promote napalm pools into gameplay hazards if the design needs it.
