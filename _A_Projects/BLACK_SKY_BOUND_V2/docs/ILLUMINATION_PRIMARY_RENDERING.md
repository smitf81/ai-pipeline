# Illumination-Primary Rendering v1

## Intent

Black Sky Bound represents darkness as the absence of illumination. The live WebGL renderer does not paint a global translucent black layer over the scene and does not ask lights to punch holes through one.

The canonical flow is:

```txt
terrain / decals / ground shadows / world depth / material particles
  -> RGB illumination field (ambient + authored light emitters - light occlusion)
  -> scene colour multiplied by illumination
  -> emissive world events and readable combat effects
  -> fog, smoke, and atmospheric scatter
  -> central post-process and stylisation
  -> camera atmosphere, overlays, and HUD
```

This preserves the colour relationships of revealed materials. A torch reveals bark and foliage with warm illumination; moonlight contributes broad cold illumination; clouds attenuate moonlight rather than adding darkness; lightning contributes a brief high-energy field.

## Canonical owners

- `src/render/backends/webgl/WebGLIlluminationPipeline.js` owns the RGB illumination framebuffer and the `scene colour × illumination` composite.
- `src/render/backends/webgl/layers/WebGLLightingLayer.js` translates renderer-neutral light projections into additive illumination contributions and local light-derived shadow attenuation.
- `src/data/lightingProfiles.js` owns ambient illumination and light/shadow tuning. It contains no global darkness opacity or darkness colour.
- `src/render/backends/webgl/WebGLPostProcessPipeline.js` owns scene render targets and final stylisation. Its active target is replaced by the illuminated scene after the lighting pass.
- `src/render/backends/webgl/layers/WebGLFogSmokeLayer.js` and `WebGLAtmosphericOverlayLayer.js` stay downstream so atmosphere scatters over an already-lit world instead of muddying the light calculation.

## Material versus emissive particles

Non-emissive leaf drift is rendered in the world before illumination and is multiplied like every other material. Sparks, embers, smoke motes, and combat readability effects remain post-illumination. This prevents ordinary foliage particles from appearing self-lit while preserving authored emissive energy.

## Runtime contract and diagnostics

The renderer exports `black-sky-bound.webgl-world-depth-times-additive-illumination.v1` and reports:

- `illuminationModel: ambient_plus_world_light_rgb_field_v1`
- `illuminationCompositeMode: scene_colour_times_additive_illumination_field_v1`
- `illuminationCompositeActive`
- ambient RGB coefficients and bounded illumination pass counts
- `overlayCount: 0`

The retired `darknessMode`, `darknessOpacity`, and full-screen darkness rectangle are intentionally absent.

## Validation

- `tests/illuminationPrimary.test.mjs` protects ownership, multiplication, and the absence of a global darkness overlay.
- `tests/webglLightingLiveWiring.test.mjs`, `tests/emitterLightCompositing.test.mjs`, and `tests/webglRendererHierarchy.test.mjs` protect live data flow and pass order.
- `tests/atmosphericCameraOverlay.test.mjs` protects separate authored atmosphere ceilings by effect kind.
- `tests/playtest/illuminationPrimary.playtest.mjs` renders the same scene and camera under torch, moonlight, rain plus smoke, and lightning, records browser/runtime evidence, and can build paired before/after captures.

Performance selection, illumination states, shadow participation limits, static caches, opt-in GPU timing, and measured before/after results are specified in `docs/ILLUMINATION_PERFORMANCE_POLICY.md`.
