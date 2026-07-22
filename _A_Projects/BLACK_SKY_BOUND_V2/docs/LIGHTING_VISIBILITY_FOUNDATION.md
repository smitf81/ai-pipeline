# Lighting & Visibility Foundation v1

## Purpose

This slice introduces a darkness-first lighting foundation without making it night-specific.

The goal is not to build fog, stealth, day/night cycles, ray tracing, or player vision yet. The goal is to make the renderer support a reusable visibility stack:

```txt
world scene
↓
light buffer
↓
darkness overlay
↓
lighting composite
↓
HUD
```

This keeps future work easier for night/day cycles, caves, interiors, fires, storms, and later fog because darkness and light are now handled as explicit render layers instead of ad hoc circles drawn by actor code.

## What changed

- Added `LightEmitter` as a real ECS component.
- Added `LightEmitterId.TORCH` and a data-backed torch recipe.
- Added `LIGHTING_PROFILES.early_night` as the first environment lighting profile.
- Raider-type actors now receive torch `LightEmitter` components when spawned.
- Player/dragon does **not** emit light in this slice.
- Renderer now owns a bounded lighting composite pass:
  - builds a light buffer from projected light views
  - fills a darkness overlay
  - cuts visibility through that darkness using the light buffer
  - draws a cheap warm bloom from the same component-backed lights
- Render diagnostics now expose active light count, light budget, dropped lights, and lighting profile id.

## Architectural rule

Light sources must come from data/components.

Do not add one-off emitter code like:

```txt
if actor is raider draw a light circle here
```

Correct flow:

```txt
actor data
  ↓
LightEmitter component
  ↓
light projection view
  ↓
light buffer render layer
  ↓
darkness composite
```

The renderer may composite lights, but it must not invent gameplay truth.

## Current test case

The only intentional in-game test case is:

```txt
raider entities carry torches
```

This should make the world darker by default while raiders reveal warm moving pools of visibility.

## Explicitly not included yet

- player-emitted light
- fog
- smoke/light interaction
- day/night cycle
- indoor/outdoor volumes
- line-of-sight or stealth rules
- SDF shadows
- ray tracing

Those belong later, on top of this foundation.

## Performance guardrails

- Active lights are capped by `RENDER_BUDGETS.lightEmitters.maxActive`.
- Light flicker is mathematical and bounded; no extra entities are spawned.
- Darkness/light compositing uses offscreen canvases rather than hundreds of object overlays.
- Lights are derived from ECS component data during view sync.

## Next sensible slice

After playtesting the torch visibility, the likely next slice is tuning rather than expansion:

```txt
Lighting readability/tuning pass:
- darkness opacity
- torch radius/intensity
- actor readability inside/outside light
- optional debug overlay for light counts
```

Do not add fog until the darkness overlay and light buffer feel correct.
