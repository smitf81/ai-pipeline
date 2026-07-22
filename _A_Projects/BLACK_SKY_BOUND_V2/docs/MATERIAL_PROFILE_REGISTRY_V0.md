# Material Profile Registry v0

This slice adds a shared material contract for entities, scene objects, and terrain without creating a single branch-heavy master shader.

## Contract

Canonical object truth and projected visual state now flow through:

```txt
actor / scene object / terrain truth
  -> materialProfileId
  -> renderer-neutral material projection
  -> WebGL material adapter
```

The registry lives in `src/data/materialProfiles.js` and exposes:

- Material families: `entity`, `sceneObject`, `terrain`, `effect`, `debug`.
- Stable profile ids for wyvern scale, raider cloth, flesh, fur, wood, stone, soil, water, lava, smoke, fire, and debug highlight.
- Shared uniforms: `baseColour`, `roughness`, `metalness`, `emissive`, `alpha`.
- Shared visual state: `damageAmount`, `burnAmount`, `wetness`, `factionTint`, `nightReveal`, `windSway`, `density`, `integrity`, `selectionHighlight`.

## Projection Boundary

`src/projection/materialProjection.js` builds renderer-neutral material packets. These packets carry profile id, family, shader variant, uniforms, state, source, and provenance. They do not carry backend objects or gameplay mutation.

Actors, scene objects, and terrain now project materials through the same contract:

- Wyvern: `scale_wyvern_copper`
- Raider: `cloth_raider`
- Tree: `wood_pine`
- Boulder: `stone_moss`
- Grass: `soil_grass`
- Dirt: `soil_dirt`

The render projection also emits a material summary so runtime/debug probes can verify active families without inspecting renderer internals.

## WebGL Adapter

`src/render/backends/webgl/WebGLMaterialAdapter.js` converts a material packet into WebGL-ready color and response values. The adapter applies faction tint, burn, damage, wetness, selection highlight, alpha, and surface response in one place.

Current WebGL consumers:

- Terrain palette generation.
- Boulder body facets.
- Tree trunk/base response.
- Fallback actor markers.
- Wyvern hide palette.
- Raider torso palette.

This is intentionally not full per-pixel physically based lighting. It is a structural material kernel that lets future shader variants consume the same profile/state contract without pushing object-type branches into one giant shader.

## Validation

```powershell
node tests\materialProfileRegistry.test.mjs
npm test
node -e "import('./src/app.js').then(()=>console.log('app import ok'))"
git -c safe.directory=C:/Users/felix/Desktop/Automated_AI_Pipeline -C C:\Users\felix\Desktop\Automated_AI_Pipeline diff --check -- _A_Projects/BLACK_SKY_BOUND_V2
$env:BSB_PROOF_URL='http://127.0.0.1:5224/'; $env:BSB_PLAYWRIGHT_CHANNEL='msedge'; node artifacts\material-profile-registry-v0\proof.mjs
```

## Residual

- This does not replace every authored palette detail. Tree foliage still has crown-specific shape colors, while the shared material adapter controls the reusable surface response.
- Effects and debug profiles are registered but not fully routed through all effect/debug render paths yet.
- This does not add new gameplay logic, terrain physics, or a shader preprocessor. It creates the canonical visual contract those later systems can consume.
