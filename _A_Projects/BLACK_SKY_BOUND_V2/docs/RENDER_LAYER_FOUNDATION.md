# Render Layer Foundation v1

Historical note: this document describes the former Canvas 2D render-layer foundation. Canvas 2D runtime modules under `src/render/layers/` were removed in Canvas 2D Renderer Cull v1. The live renderer layer registry is now `src/render/backends/webgl/WebGLRenderLayerRegistry.js`.

## Purpose

This slice exists to stop BSB v2 falling back into the BSB v1 failure mode where interesting visuals become hundreds of live overlapping canvas stickers.

The rule is:

> ECS owns truth, systems emit visual recipes, projection state accumulates bounded render-layer data, and the renderer only composites cached layers plus capped live visuals.

## Layer ownership

| Layer | Owner | Update rule | Notes |
|---|---|---|---|
| Terrain | map data + terrain renderer | Drawn from map truth | Still direct for now; can become cached later. |
| Persistent decals | projection/render-layer state | Dirty only when stamps are added | Blood/scuffs/scorch marks belong here, not in live effects forever. |
| Atmosphere/smoke | ECS smoke truth + renderer | Smoke gameplay entities are capped | Current smoke remains simple radial smoke, but cloud count is budgeted. |
| Actors | ECS actor views | Live every render | Dragon/enemies only. |
| Live effects | ECS effect entities | Short lifetime, capped pool | Slashes, lunge rings, smoke pops. |
| HUD | UI overlay | Live every render | Read-only view surface. |

## Data/code split

Visual tuning lives in:

- `src/data/visualRecipes.js`
- `src/data/renderBudgets.js`

Reusable behaviour lives in:

- `src/game/spawn.js` via `spawnVisualRecipe(...)`
- `src/projection/renderLayerState.js`
- `src/render/layers/*`

Gameplay systems should call a recipe by id. They should not manually invent stroke colours, particle counts, or long-lived render objects.

## Current recipe flow

```txt
combat/smoke system
  -> spawnVisualRecipe(game, recipeId, position/radius/hits)
  -> capped live effect ECS entity, if recipe asks for one
  -> cached decal stamp, if recipe asks for one
  -> renderer composites named layers
```

## Current guardrails

- Live effects are capped by `RENDER_BUDGETS.liveEffects.maxActive`.
- Smoke clouds are capped by `RENDER_BUDGETS.smokeClouds.maxActive`.
- Decal stamps are capped by `RENDER_BUDGETS.decalStamps.maxActive`.
- Decals are projection/cache inputs, not gameplay truth.
- Render diagnostics expose dropped live effects, smoke clouds, and decal stamps.

## What this is not yet

This is not full weather, fire propagation, lighting, or blood pooling.

It is the foundation that lets those arrive safely later without putting all visual complexity on the frame loop.


## Follow-up: Lighting & Visibility Foundation v1

The first follow-up render layer is a darkness-first lighting foundation. Light now comes from ECS `LightEmitter` components and data-backed emitter recipes, not ad hoc renderer inventions. Raider torches are the only first test case; player light and fog are intentionally pinned for later. See `docs/LIGHTING_VISIBILITY_FOUNDATION.md`.
