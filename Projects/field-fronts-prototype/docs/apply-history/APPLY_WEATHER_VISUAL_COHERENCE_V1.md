# Weather Visual Coherence v1

## Goal
Improve storm cloud and fork-lightning presentation while keeping the existing weather spatial fields as the source of truth.

This is a render/visualisation polish pass only. It does not change pathfinding, combat, construction, economy, AI, command wheel, or scenario logic.

## What changed

### Cloud layer model
Cloud rendering now uses layered storm masses rather than single flat blobs:

- terrain dimming / cloud shadow under dense cloud cover
- soft dark blue/black cloud body
- rolling lumpy cloud lobes
- subtle silver-blue rim/ridge highlights
- internal electric glow driven by storm charge
- localised rain streaks under rainfall-heavy cells

Cloud visuals are still derived from weather fields:

- `humidity + uplift + cloudCover` -> cloud density
- `stormPotential` -> dark core / electric charge
- `rainfall` -> local rain streak density
- `cloud density + storm core` -> terrain dimming

### Fork lightning model
Lightning is now derived from event-style storm charge windows rather than pure flicker.

High-charge storm cells can emit short-lived lightning events. Each event has:

- source storm tile
- strength
- created time
- TTL/fade window
- jagged main bolt path
- 2-5 fork branches
- cloud bloom
- terrain flash / strike afterglow

The render still animates opacity every frame, but it does not recompute weather fields every frame.

### New module
Added:

- `src/rendering/weatherVisuals.js`

This holds pure visual derivation helpers for:

- weather visual cell sampling
- storm cloud cell selection
- lightning event selection
- fork bolt geometry generation

### Tests
Added:

- `tests/weatherVisuals.test.mjs`

Updated:

- `tests/runInProcessTests.mjs`

## Validation

Passed:

- `node --check` across `src/`, `tests/`, `tools`
- `npm test`

## Explicitly not changed

- weather field derivation cadence
- `gameModel.js` tick behaviour
- pathfinding
- combat
- economy
- construction
- command wheel contracts
- scenario spine

## Next visual ideas

Later, we can add:

- cloud-cell connected contour smoothing
- fog-of-war blend with weather fields
- wet ground / puddle shimmer under rainfall
- lightning revealing enemy silhouettes in hidden areas
- thunder delay / camera rumble hooks
