# Unified Smoke Sources v1

## Purpose

Smoke is now produced through one formal source model and rendered through one smoke field texture.

This avoids separate per-feature smoke renderers such as torch smoke, napalm smoke, dragon smoke, fire smoke, and so on. Different systems can contribute sources, but the renderer still receives one bounded source list and composites one field.

## Current source kinds

- `dragon_smoke_cloud` — derived from existing `SmokeCloud` component views.
- `napalm_smoulder` — derived from active napalm pool projection state.
- `torch_wisp` — derived from torch `LightEmitter` views.

All source recipes live in:

```txt
src/data/smokeSources.js
```

Source views are built in:

```txt
src/projection/smokeLayerState.js
```

The renderer consumes:

```txt
game.smokeSources
```

not separate feature-specific smoke lists.

## Flow

```txt
SmokeCloud / napalm pool / torch light
  ↓
smoke source view
  ↓
one bounded source list
  ↓
one low-resolution density texture
  ↓
drift / distortion / fade
  ↓
light scatter from existing light buffer views
```

## Important constraints

- Smoke source views are derived projection data, not canonical gameplay truth.
- Torches and napalm pools do not draw their own smoke blobs.
- All smoke density enters the same field texture.
- Smoke source count is capped by `RENDER_BUDGETS.smokeField.maxSources`.
- The smoke field still has no damage, stealth, fire spread, or real volumetric simulation.

## Diagnostics

Render diagnostics now expose:

- total active smoke field sources
- contributing lights
- texture passes
- source policy
- per-source-kind counts
- dropped smoke sources

This gives us a quick way to see whether smoke is coming from dragon smoke, napalm smoulder, torches, or future fire systems without creating separate renderers.
