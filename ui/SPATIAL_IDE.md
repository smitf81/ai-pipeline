# Spatial IDE Interface Layer

## Folder architecture

- `ui/public/spatial/sceneState.js` - scene constants, thresholds, and viewport helpers.
- `ui/public/spatial/studioData.js` - ACE Studio agent catalog plus status/throughput derivation.
- `ui/public/spatial/graphEngine.js` - task graph structure, node/edge factories, starter graph.
- `ui/public/spatial/aceConnector.js` - ACE API client hooks for intent parsing and mutation preview/apply.
- `ui/public/spatial/mutationEngine.js` - workspace mutation helper and local mutation applier.
- `ui/public/spatial/architectureMemory.js` - persistent architecture memory, validation rules, version snapshots.
- `ui/public/spatial/persistence.js` - load/save workspace JSON graph, sketches, annotations, comments, and studio state.
- `ui/public/spatial/spatialApp.js` - React scene shell for the canvas and ACE Studio views.
- `data/spatial/workspace.json` - persisted workspace graph, sketches, annotations, architecture memory, agent comments, and studio viewport state.
- `data/spatial/history.json` - architecture mutation/save history.
- `ui/server.js` - REST endpoints for workspace persistence, dashboard feeds, and mutation helpers.

## Scene model

### Canvas

- Primary work surface for planning, notes, links, and freehand sketches.
- Double-click adds a note in standard mode.
- Sketch mode (`K`) switches the canvas into annotation/stroke editing.
- Scroll zoom keeps the canvas primary until it crosses the studio threshold.

### ACE Studio

- Secondary architecture visualization layer triggered by zooming out or pressing `Tab`.
- Pixel-art inspired top-down office showing ACE agents as symbolic worker stations.
- Drag to pan, scroll to zoom, click a station or minimap dot to focus an agent.
- Side panel shows role, status, throughput, recent actions, and feedback thread.

## Layering model

- Layer 3 - Interface Layer: scene transitions, panel UI, canvas rendering, studio rendering.
- Layer 2 - Intelligence Layer: ACE connector, architecture memory, and agent snapshot derivation.
- Layer 1 - Execution Layer: persistence writes, dashboard/run feeds, mutation preview/apply.

## Workspace schema additions

```json
{
  "graph": { "nodes": [], "edges": [] },
  "sketches": [],
  "annotations": [],
  "architectureMemory": {},
  "agentComments": {
    "planner": [
      { "id": "comment_...", "text": "Tighten task scope", "createdAt": "2026-03-12T12:00:00.000Z" }
    ]
  },
  "studio": {
    "scene": "studio",
    "selectedAgentId": "planner",
    "canvasViewport": { "x": 0, "y": 0, "zoom": 1 },
    "studioViewport": { "x": 0, "y": 0, "zoom": 1.2 }
  }
}
```

## Extension points

- Replace `buildAgentSnapshots(...)` with real agent telemetry while keeping the same station UI.
- Feed task queues or logs into the side panel without changing scene navigation.
- Add richer workstation props or pixel sprites in CSS/DOM without introducing a game loop.
- Push collaborative comments into a shared store by swapping persistence implementation.
- Add more scene types later because scene state is isolated from graph engine logic.
