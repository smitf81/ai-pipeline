# Spatial IDE Interface Layer

## Folder architecture

- `ui/public/spatial/graphEngine.js` – task graph structure, node/edge factories, starter graph.
- `ui/public/spatial/aceConnector.js` – ACE API client (intent parsing, decomposition, mutation preview/apply, code/test generation hooks).
- `ui/public/spatial/mutationEngine.js` – workspace mutation API helper and local mutation applier.
- `ui/public/spatial/architectureMemory.js` – persistent architecture memory, design rules validation, architecture version snapshots.
- `ui/public/spatial/persistence.js` – load/save workspace JSON graph.
- `ui/public/spatial/spatialApp.js` – React canvas-first notebook workspace UI.
- `data/spatial/workspace.json` – persisted workspace graph + architectural model.
- `data/spatial/history.json` – architecture mutation/save history.
- `ui/server.js` – REST endpoints for spatial workspace, intent decomposition, mutation preview/apply.

## Interaction model (notebook first)

- Default node creation is **double-click → thought/text node**.
- Type is inferred from content and links; user can adopt suggested role.
- Shift-drag from one node to another sketches directional dependencies.
- Smooth WASD panning, middle/right mouse panning, and scroll zoom are canvas-priority interactions.
- Legacy control panel is preserved in a right-side drawer and hidden by default.

## Canvas-first layout

- Main viewport is dedicated to the workspace (`.spatial-main`) with full-height canvas and a slim inspector sidebar.
- A lightweight in-canvas toolbar contains save/simulate controls and long status messaging.
- Legacy UI lives outside the workspace container to avoid resizing/reflow of the sketchpad when opened.

## Layering model

- **Layer 3 – Interface Layer**: React canvas interaction and visualization.
- **Layer 2 – Intelligence Layer**: ACE connector + architecture memory + decomposition/mutation planning.
- **Layer 1 – Execution Layer**: mutation apply endpoints and persistence writes.

## Workspace node schema

```json
{
  "id": "node_...",
  "type": "task",
  "content": "Build parser",
  "position": { "x": 100, "y": 200 },
  "connections": [],
  "metadata": {}
}
```

## Edge schema

```json
{
  "source": "node_a",
  "target": "node_b",
  "relationship_type": "relates_to"
}
```
