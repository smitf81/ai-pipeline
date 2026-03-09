# Spatial IDE Interface Layer

## Folder architecture

- `ui/public/spatial/graphEngine.js` – task graph structure, node/edge factories, starter graph.
- `ui/public/spatial/aceConnector.js` – ACE API client (intent parsing, decomposition, mutation preview/apply, code/test generation hooks).
- `ui/public/spatial/mutationEngine.js` – workspace mutation API helper and local mutation applier.
- `ui/public/spatial/architectureMemory.js` – persistent architecture memory, design rules validation, architecture version snapshots.
- `ui/public/spatial/persistence.js` – load/save workspace JSON graph.
- `ui/public/spatial/spatialApp.js` – React notebook-style canvas UI with adaptive node roles and simulation.
- `data/spatial/workspace.json` – persisted workspace graph + architectural model.
- `data/spatial/history.json` – architecture mutation/save history.
- `ui/server.js` – REST endpoints for spatial workspace, intent decomposition, mutation preview/apply.

## Interaction model (notebook first)

- Default node creation is **double-click → thought/text node**.
- Type is inferred from content and links; user can adopt suggested role.
- Shift-drag from one node to another sketches directional dependencies.
- Smooth WASD panning, middle/right mouse panning, and scroll zoom are canvas-priority interactions.
- Legacy control panel is hidden by default behind a toggle.

## Abstraction zoom levels

- **Overview**: compact nodes, relationship reading.
- **Structure**: readable content + role suggestions.
- **Detail**: inline code panes for module/code nodes.

## Layering model

- **Layer 3 – Interface Layer**: React canvas interaction and visualization.
- **Layer 2 – Intelligence Layer**: ACE connector + architecture memory + decomposition/mutation planning.
- **Layer 1 – Execution Layer**: mutation apply endpoints and persistence writes.
