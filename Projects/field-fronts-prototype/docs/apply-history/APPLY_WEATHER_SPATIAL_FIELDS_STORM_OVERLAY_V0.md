# Weather Spatial Fields + Storm Overlay v0

## Goal
Add heat and humidity spatial fields, plus derived uplift, storm potential, cloud cover, and rainfall fields, then render a stormy raincloud overlay from those fields.

This is intentionally a field/readout/environment pass, not a fog-of-war gameplay pass yet.

## What changed

### New field module
- Added `src/world/weatherFields.js`.
- Derives:
  - `heat`
  - `humidity`
  - `uplift`
  - `stormPotential`
  - `cloudCover`
  - `rainfall`

The derivation uses terrain, water proximity, elevation, slope/uplift, forest cover, deterministic weather noise, a slow weather phase, and a seeded storm anchor so the system reliably proves storm formation.

### Game model integration
- Weather fields are merged into `game.fields`.
- `game.weather` stores a compact derived summary:
  - dominant state
  - storm cell count
  - rain cell count
  - field min/max/average values
  - storm anchor
- Weather fields are cached and cadenced through the runtime scheduler as `weatherFields`.

### UI/debug integration
- Added command/debug overlay options:
  - Heat Field
  - Humidity Field
  - Uplift Field
  - Storm Potential
  - Cloud Cover
  - Rainfall
- Sim/debug summary now shows weather state and storm/rain cells.

### Renderer
- Added render-only storm cloud layer generated from `cloudCover`, `rainfall`, `humidity`, and `stormPotential`.
- Adds:
  - dark blue raincloud blobs
  - rain streaks
  - sporadic lightning glows/bolts over high storm-potential zones
- This does not affect movement/pathfinding/combat.

## Performance discipline
- No heavy weather logic was added to per-frame game logic.
- Game weather fields are cadenced/cached.
- Renderer visualises the current field values without mutating gameplay state.
- No pathfinding, command wheel, combat, economy, construction, or scenario spine logic was changed.

## Validation
- `node --check` across `src/`, `tests/`, `tools` passed.
- `npm test` passed.
- Added `tests/weatherFields.test.mjs`.

## Next obvious pass
Turn cloud cover into the first atmospheric visibility/fog-of-war style layer, but only after playtesting the visual density so we do not obscure command readability.
