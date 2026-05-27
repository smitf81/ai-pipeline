# UI/UX Stability Merge

Merged Claude's UI/UX stability pass into the latest logistics stability build.

## Base preserved

This patch was applied on top of the latest logistics zip, preserving:

- Structure Joinery Coherence v1
- Marching Squares Map Maker v0
- Logistics Stability Pass

## Files changed

- `src/ui/components.js`
- `src/ui/gameUI.js`
- `src/editor/editorState.js`
- `src/rendering/canvasRenderer.js`
- `src/core/eventBus.js`

## Fixes included

- Restored `Lower` brush button into the terrain tool row.
- Prevented height step slider from silently forcing terrain sessions into height mode.
- Wrapped the shape selector in a normal control row.
- Cleared stale `dirtyRegion` state after non-drag paints and after renderer consumption.
- Removed duplicate economy toggle label ownership.
- Synced build tile `aria-pressed` during render.
- Added teardown-safe Escape listener handling for the pause menu.
- Added polite live-region metadata to the HUD status text.
- Guarded event bus handlers so one failing listener cannot stop subsequent listeners.
- Updated footer build year to 2026.

## Scope

UI/editor stability only. No intentional changes to gameplay logic, logistics, movement, pathfinding, structure joinery, marching squares extraction, or economy rules.
