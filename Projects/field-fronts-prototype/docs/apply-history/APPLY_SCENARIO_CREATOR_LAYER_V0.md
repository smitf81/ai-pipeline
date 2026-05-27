# Scenario Creator Layer v0

## Goal
Add a scenario authoring layer that sits above map generation. This layer lets a generated map carry story-facing metadata without changing terrain, passability, economy, pathfinding, construction maths, or enemy AI.

## What changed

### New scenario data layer
Added `src/world/scenarioLayer.js` with:

- `SCENARIO_LAYER_VERSION`
- `SCENARIO_STORY_PRESETS`
- deterministic scenario seed generation
- deterministic scenario layer generation from the current map
- normalisation and summary helpers

The scenario layer can now hold:

- story beats
- named locations
- items/clues
- ambient assets/props
- characters
- speech bubbles
- camera cues
- effects such as lightning flashes, distant thunder and story pulses

The layer is explicitly marked as an authoring layer above Map Maker and does not alter pathfinding.

### Seeded maps now include scenario metadata
`createSeededMap()` now creates a default scenario layer after starts and neutral outposts are chosen, so generated maps immediately carry a lightweight narrative scaffold.

### Map serialisation preserves the scenario layer
`cloneMap()` / `deserializeMap()` now preserve and normalise `scenario.scenarioLayer`.

### Scenario Creator UI
Added a separate `Scenario Creator` section in the Map Maker tools panel.

Controls include:

- scene seed input
- story preset selector
- New Scene Seed
- Generate Scenario
- Show scenario layer toggle
- Preview Camera Cue
- compact summary of beats, locations, items, assets, characters, speech bubbles, shakes and effects

### Renderer pass
The renderer now draws the scenario layer as map-space narrative glyphs:

- story trigger radii
- landmark/ruin markers
- clue/item markers
- ambient assets such as smoke/weather/crow/debris cues
- character silhouettes
- speech bubbles and non-verbal gesture notes
- animated blue lightning glows for weather assets

### Camera shake preview
Scenario camera cues can be previewed from the Scenario Creator. The shake is render-only and decays over time.

## Files changed

- `index.html`
- `styles.css`
- `src/main.js`
- `src/editor/editorState.js`
- `src/rendering/canvasRenderer.js`
- `src/ui/components.js`
- `src/world/mapGenerator.js`
- `src/world/mapModel.js`
- `src/world/scenarioLayer.js`
- `tests/runInProcessTests.mjs`
- `tests/scenarioLayer.test.mjs`

## Validation

- `node --check` across `src/`, `tests/`, and `tools/` passed.
- `npm test` passed all in-process suites, including the new scenario layer test.

## Design constraint
This pass deliberately keeps scenario logic as metadata and visual authoring. It does not yet create quest logic, interactable pickups, scripted AI behaviours, or real runtime cutscene sequencing.

That keeps this slice safe: story scaffolding is now present without turning the runtime into spaghetti.
