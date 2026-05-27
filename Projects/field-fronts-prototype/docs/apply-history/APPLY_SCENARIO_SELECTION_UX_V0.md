# Scenario Selection UX v0

## Goal
Add a lightweight campaign/chapter selection scaffold above the existing Scenario Creator and Map Maker layers.

This is a UI/UX and metadata pass only. It does not alter pathfinding, terrain passability, construction placement, movement, combat, or map resolution maths.

## What changed

- Added `src/world/scenarioCatalogue.js` as the scenario/chapter catalogue seam.
- Normalises every authored/generated map into a Chapter 1 scenario entry.
- Adds a minimal progression object:
  - current scenario id
  - unlocked scenario ids
  - completed scenario ids
  - chapter index
- Main menu now shows Story / Chapter Select instead of fake map slots.
- First scenario is labelled `Chapter 1`.
- Future chapter slots are scaffolded as locked placeholders.
- Scenario Creator now has an Available Scenario selector and `Use Selected Chapter` action.
- Seeded maps now stamp the scenario catalogue after generating scenario metadata.
- Editor state now ensures a scenario catalogue exists whenever a map is created, reset, replaced, or loaded.

## Files changed

- `src/world/scenarioCatalogue.js`
- `src/world/mapGenerator.js`
- `src/editor/editorState.js`
- `src/ui/components.js`
- `src/ui/gameUI.js`
- `styles.css`
- `tests/scenarioCatalogue.test.mjs`
- `tests/runInProcessTests.mjs`

## Validation

- `node --check` across `src/`, `tests/`, and `tools/` passed.
- `npm test` passed all in-process tests, including the new scenario catalogue regression test.

## Notes

This is deliberately not a full campaign system yet. It creates the correct seam so later passes can add chapter titles, completion gates, unlock conditions, branching scenarios, and authored campaign packs without tangling that logic into map generation or pathfinding.
