# Top-Down Thin Slice Prototype

A minimal single-window 2D top-down game + world editor skeleton using plain HTML/CSS/JS + Canvas.

## Why this stack
- No build step, no backend, minimal setup friction.
- Fast local iteration in Cursor/Antigravity.
- Small modules keep architecture explicit and ready for future AI/MCP integration.

## Run locally
From repository root:

```bash
cd projects/topdown-slice
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Controls
- Tool dropdown:
  - **Select**: click building to inspect/edit/delete.
  - **Place Building**: click tile to place `house` or `workshop`.
  - **Spawn Unit**: click tile to spawn worker unit.
- Arrow keys: move the embodied god-agent.
- Command input supports:
  - `spawn unit worker at 5 5`
  - `place building house at 7 4`
  - `move agent to 3 8`
  - `delete building building-001`

## Hardcoded shortcuts (intentional for thin slice)
- Map is hardcoded (25x18 tile grid).
- Unit type and building types are fixed small sets.
- Agent movement is immediate tile movement (no pathfinding).
- Command parser uses simple regex patterns.
- Debug checks are local synchronous validations only.

## Next slice ideas
1. Introduce an explicit agent action queue visualizer + per-tick execution diagnostics.
2. Add typed command history and a parser adapter layer for conversational intents.
3. Add map-edit commands (`replace tile x y type`) using same command bus.
4. Add lightweight persistence (export/import JSON snapshot).
