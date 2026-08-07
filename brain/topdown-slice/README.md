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


## JFA sandbox (Slice 4)
- A standalone 2D Jump Flood Algorithm authoring sandbox now lives at `jfa-sandbox/index.html`.
- It supports sketch-to-seed translation with evenly spaced stroke seeds, optional pressure-based density + weighting, stroke tags (`ridge|flow|threat|build`), erase/move editing, ownership texture output, colour regions, border view, and Slice 3 field extraction with influence propagation plus Slice 4 ACE bridge export (anchors, field emitters, connectivity hints, semantic regions, and sketch provenance JSON).
- Run from the same local server and open `http://localhost:4173/jfa-sandbox/`.

## Tests
- Default Node test isolation can fail in the Codex sandbox with `spawn EPERM` because the built-in runner attempts per-file subprocess isolation.
- For in-process execution, run:

```bash
cd projects/topdown-slice
node --experimental-default-type=module tests/runInProcessTests.mjs
```

- To run targeted files in-process, pass one or more test paths or filenames:

```bash
node --experimental-default-type=module tests/runInProcessTests.mjs tests/builderSpawner.test.mjs adaptiveResolverWeights.test.mjs
```

- If you want to keep the built-in runner, this environment also works with:

```bash
node --experimental-default-type=module --test --experimental-test-isolation=none ./tests/builderSpawner.test.mjs
```

- Current diagnosis:
  Default `node --test` reproduces `spawn EPERM` in this sandbox even for a single trivial file, and the failure stack points into `node:internal/test_runner/runner` rather than repo code.
  Inference: the EPERM is caused by sandbox restrictions on Node's default child-process test isolation, not by a project-specific subprocess harness.
  Local unsandboxed reproduction has not been confirmed from this environment, so treat it as sandbox-specific unless the same command fails on your machine.

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
