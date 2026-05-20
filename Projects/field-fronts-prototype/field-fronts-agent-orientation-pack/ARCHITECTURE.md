# Architecture Overview

This prototype is intentionally static and modular. It should stay runnable without a build step while avoiding a monolithic HTML file.

## Modules

- `src/config`: terrain definitions and field overlay metadata.
- `src/world`: serializable map model and deterministic field derivation.
- `src/editor`: brush stamping, undo/redo, map import/export, editor state.
- `src/game`: runtime contracts, leaders, outposts, command graphs, game-state save/load, and derived command fields.
- `src/rendering`: canvas-only playfield rendering and screen-to-tile mapping.
- `src/input`: pointer-to-editor command plumbing.
- `src/ui`: DOM component mounts for tools, controls, and inspection.
- `src/core`: tiny shared utilities such as the event bus.

## Boundaries

- The map is the source of truth for terrain.
- Terrain fields are derived from the map, not hand-edited state.
- Runtime game state is separate from authored MapData and uses `field-fronts.game-state.v1`.
- Command fields are derived from MapData + GameState and are not persisted.
- The renderer never owns gameplay/editor truth.
- UI components mutate only through editor commands and then request a render.
- Exported maps include provenance so later ACE-style intent and projection records can be attached cleanly.
- Game-state export/import must never write leaders, outposts, ticks, or contestation state into the map-maker JSON.

## Next Attachment Points

- `src/world/fields.js`: add evolving pressure fields for fronts, supply, threat, and control.
- `src/world/mapModel.js`: add regions, roads, chokepoints, and authored landmarks.
- `src/editor`: add intent painting as a second layer beside terrain painting.
- `src/rendering`: add animated field interpolation and front overlays.
- `src/ui`: add faction/unit tools only after map authoring feels good.
