# Emitter Light Readability Compositing v0

## Purpose

Warm gameplay emitters now separate what the light reveals from what the player sees as a warm glow.

The renderer should make nearby scenery, actors, tents, trees, rain, and smoke easier to read without turning overlapping torches into broad orange fog.

## Light Contract

Emitter profiles may define three related contributions:

- `revealRadius` / `revealStrength`: broad, subtle light-space and scenery readability.
- `glowRadius` / `glowStrength`: smaller visible warm aura.
- `coreRadius` / `coreStrength`: tiny flame point.

Legacy `radius` and `intensity` are still accepted. They map to split defaults, but projected light views expose legacy `radius` and `intensity` as the controlled glow values so older visual consumers do not inherit broad reveal radii as broad orange blobs.

## Render Rule

The WebGL lighting layer treats local emitter reveal, glow, and core as separate radial influence groups.

- Reveal is broad and mostly neutral brightness/contrast.
- Glow is local and warm.
- Core is tiny and warm.
- Local emitter groups use saturated alpha compositing through `drawWorldRadialSaturatedLights`.
- Moonlight and scene-scale light paths keep their existing additive behaviour.

This keeps overlapping emitters readable while limiting orange accumulation.

## Atmosphere Rule

Atmosphere and smoke should react to local visible emitter glow, not the broad reveal radius.

Rain can catch nearby warm light subtly, but the broad reveal contribution should not make the whole weather layer orange.

## Validation Evidence

Directed evidence lives under:

```txt
artifacts/emitter-light-readability-compositing-v0/
```

Key captures:

- `single-torch-reveal.png`
- `torch-cluster-capped.png`
- `dark-control.png`
- `emitter-light-readability-compositing-state.json`

Expected visual result:

- a single torch softly reveals nearby scenery;
- clustered torches increase readability without becoming one opaque orange patch;
- darkness remains dark outside emitter influence;
- torch cores stay visible but controlled;
- rain and smoke retain only subtle warm local reaction.

## Follow-up Tuning Notes

The camera rain/spark overlay is intentionally visible. The defaults should not be "normalized" back to the original subtle atmospheric baseline without fresh visual evidence.

Current authored atmosphere defaults:

```txt
rainDensity: 0.92
sparkRate: 3.4
overlayOpacity: 0.88
maxAtmosphereEmitters: 16
```

SceneObject detail visibility now uses stabilized light-space influence for LoD decisions. Brief reveal dips should not flip objects between full geometry and cheap silhouettes, but darkness should recover after the stabilized influence decays.

Fire-arrow scene-object emitters use `anchorSpace: "object_anchor"` so the flame light follows the arrow socket geometry rather than the shifted visual footprint center.
