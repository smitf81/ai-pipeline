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
  - **Place Building**: click tile to enqueue a construction task.
  - **Spawn Unit**: click tile to enqueue worker spawn task.
- Arrow keys: enqueue one-step move tasks for the embodied god-agent.
- God-agent panel:
  - current task + queued task list with IDs/status/reason
  - remove queued task
  - move queued task up/down
  - retry failed task
  - cancel current / clear queue
- Worker panel:
  - view active workers
  - select worker to inspect current/queued/failed tasks
  - same queued controls (remove/reorder) and failed retry controls
- Building inspector now shows:
  - building state (`under_construction` or `complete`)
  - build progress and completion percentage
  - active builder actor ID when available
- Command input supports:
  - `spawn worker at 5 5`
  - `assign worker unit-001 move to 8 6`
  - `assign worker unit-001 build house at 10 4`
  - `assign worker unit-001 paint tile 7 7 as stone`
  - `set assignment strategy nearest_worker`
  - `set assignment strategy least_loaded_worker`
  - `set assignment strategy manual`
  - `show assignment strategy`
  - `list workers`

## Hardcoded shortcuts (intentional for thin slice)
- Map is hardcoded (25x18 tile grid).
- Worker and building types are fixed small sets.
- Agent/worker movement is greedy tile-by-tile (no pathfinding).
- Construction progresses at 1 point per build tick while actor is in range.
- Assignment strategy is lightweight and local (no planner involvement yet).
- Debug checks are local synchronous validations only.

## Next slice ideas
1. Add multiple-worker assist for one construction site.
2. Add build speed modifiers by worker/building type.
3. Add paused/interrupted construction state and resume UX.
4. Add planner-authored multi-step build bundles.
