# Seeded Map Generator v0

## Goal
Add deterministic random map generation for replayability without turning the tactical map into a literal 2,000 x 2,000 tile performance grenade.

This slice treats **2K / 4K** as the high-resolution terrain bake target, while keeping the live simulation grid deliberately bounded:

- `frontier_2k`: 96 x 64 gameplay cells, 2048px terrain bake target
- `frontier_4k`: 128 x 80 gameplay cells, 4096px terrain bake target

That gives us prettier map cells and exportable high-resolution terrain buffers without smashing pathfinding, command fields, collision, construction reachability, or enemy AI cadence.

## What changed

### New seeded generator
- Added `src/world/mapGenerator.js`
- Deterministic terrain generation from a seed string
- Generates:
  - coastline / sea
  - landmass
  - forests
  - mountains
  - rivers
  - player start
  - enemy start
  - multiple neutral outposts

Same seed + same preset should produce the same terrain, elevation, starts, and neutral outposts.

### Map maker UI
- Added seeded generator controls to the Map panel:
  - seed input
  - preset selector
  - New Seed
  - Generate Map
- Generated maps reset/reseed the game immediately.
- Export filenames include the seed when available.

### Scenario metadata
Generated maps now carry:

```js
map.scenario = {
  generator: { id, seed, preset, targetTextureSize, generatedAt },
  starts: { player, enemy },
  neutralOutposts: [...]
}
```

`serializeMap()` / `deserializeMap()` now preserve this scenario metadata.

### Game seeding
`createInitialGameState()` now:
- uses generated map start locations when present
- creates all generated neutral outposts as contestable outposts
- falls back to the original single Signal Knoll behaviour for legacy/default maps

### Render/bake resolution
The terrain buffer now uses generated-map bake metadata:
- default maps keep the old low-cost buffer size
- generated 2K/4K maps use larger terrain buffers for cleaner rendered terrain and exported normal/displacement bakes

## Guardrails
- Did not make live simulation maps 2048x2048 or 4096x4096 tiles. That would be wildly stupid at this stage.
- Did not rewrite pathfinding.
- Did not change movement maths.
- Did not change enemy AI state machine logic beyond letting it consume generated starts/outposts through the normal game state.
- Legacy/default map behaviour remains compatible.

## Validation
- `node --check` across `src/`, `tests/`, and `tools/`
- `npm test`
- Added `tests/seededMapGenerator.test.mjs`

## Files changed
- `src/world/mapGenerator.js`
- `src/world/mapModel.js`
- `src/game/gameModel.js`
- `src/game/contracts.js`
- `src/editor/editorState.js`
- `src/ui/components.js`
- `src/rendering/canvasRenderer.js`
- `tests/seededMapGenerator.test.mjs`
- `tests/runInProcessTests.mjs`

## Known sensible limitation
4K preset generation/baking is intentionally heavier than 2K. It is there for high-quality map output, not as the default “every click while streaming sixteen debug overlays” mode. Use 2K as the normal iteration preset.
