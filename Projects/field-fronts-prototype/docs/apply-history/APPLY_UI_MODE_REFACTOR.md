# Apply Notes — UI Mode Refactor

## Goal
Separate gameplay-facing UI from simulation/debug and map-authoring tooling.

## Result
The main menu now routes into three explicit experiences:

- **Skirmish** — clean game HUD only; old prototype/debug side panel is hidden.
- **Sim / Debug** — simulation controls, manual tick, command overlays, command graph, and inspector are available.
- **Map Maker** — terrain palette, brush controls, terrain field overlays, lighting/bake tools, map import/export, and inspector are available.

## Files changed
- `index.html`
- `styles.css`
- `src/core/appModes.js`
- `src/editor/editorState.js`
- `src/main.js`
- `src/rendering/canvasRenderer.js`
- `src/ui/components.js`
- `src/ui/gameUI.js`
- `tests/appModeRouting.test.mjs`
- `tests/runInProcessTests.mjs`

## Behavioural changes
- Added a dedicated `experienceMode` state value.
- Added contextual shell routing via `data-experience-mode` and `data-tool-panel`.
- Hid the right-side prototype panel in Skirmish/game mode.
- Locked manual tick stepping to Sim / Debug mode.
- Locked command/tactical overlays to Sim / Debug mode.
- Locked terrain field overlays to Map Maker mode.
- Hid build/economy HUD controls while in Map Maker.
- Exit-to-menu clears transient debug overlays so Skirmish starts clean.

## Validation
- `node --check` passed for changed JS modules.
- `npm test` passed all in-process tests, including the new app mode routing lock.
- `npm run test:browser` was attempted but skipped because the expected Playwright client was not present in this sandbox path.

## Notes
This is intentionally a UI/context-routing refactor. It does not rewrite simulation mechanics, map authoring mechanics, enemy behaviour, construction logic, or renderer internals beyond gating debug visuals by mode.
