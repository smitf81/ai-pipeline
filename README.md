# AI Pipeline

Control repo for local AI / agent-driven tooling.

## Apply a task patch safely

Use the runner to validate and apply a generated task patch:

`python runner/ai.py apply --project <key> --task 0001`

Dry-run mode (validation only):

`python runner/ai.py apply --project <key> --task 0001 --dry-run`

## UI updates (MVP)

The dashboard now auto-refreshes every 10 seconds (configurable via `DASHBOARD_REFRESH_MS`) and can be manually refreshed. It reads the latest project files and surfaces read errors inline.

Pipeline controls were simplified into one flow:
- pick project
- pick task (or manual override)
- pick action
- optionally choose run preset for `Run`
- click one **Execute** button

Output is now live and structured via SSE streaming, with status, exit code, duration, artifacts/log locations, and persisted run history (last 20 runs in-memory).

Apply actions now go through a review modal:
- dry-run: preview validation, changed files, branch, refusal reasons
- apply: requires confirmation before execution
- success: surfaces branch, commit, changed files, and suggested next step

Add menu supports lightweight creation flows from UI:
- Add Idea (`idea.txt` append with timestamp)
- Add Task (creates scaffold in `work/tasks/<id>-<slug>/`)
- Add Project (updates `projects.json` after path validation)

## API endpoints

- `GET /api/dashboard` – returns live dashboard file contents, parsed state, timestamps, refresh interval, errors
- `GET /api/projects` – project list with friendly key + path
- `GET /api/tasks` – task folders from `work/tasks`
- `GET /api/presets` – available run presets with descriptions
- `GET /api/runs` – in-memory run history (last 20)
- `POST /api/execute` – unified action endpoint for scan/manage/build/run/apply/dry-run-preview
- `GET /api/stream/:runId` – SSE log/event stream for a run
- `POST /api/open-task-folder` – opens task folder in OS file explorer (Windows supported)
- `POST /api/add/idea` – append to `idea.txt`
- `POST /api/add/task` – create task scaffold
- `POST /api/add/project` – register project in `projects.json`
