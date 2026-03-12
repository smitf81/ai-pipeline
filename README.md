# AI Pipeline

Control repo for local AI / agent-driven tooling.

## Apply a task patch safely

Use the runner to validate and apply a generated task patch:

`python runner/ai.py apply --project <key> --task 0001`

Dry-run mode (validation only):

`python runner/ai.py apply --project <key> --task 0001 --dry-run`

## yt_transcript_exporter - YouTube transcript to Markdown

This repository includes a small Python CLI tool, `yt_transcript_exporter.py`, which downloads a YouTube video transcript (when available) and saves it as a clean Markdown file suitable for LLMs.

### Installation

- Ensure you have Python 3.8+ installed.
- From this directory, install dependencies:

```bash
pip install -r requirements.txt
```

### Usage

```bash
python yt_transcript_exporter.py <youtube_url>
python yt_transcript_exporter.py <youtube_url> --timestamps
python yt_transcript_exporter.py <youtube_url> --summary
python yt_transcript_exporter.py <youtube_url> --timestamps --summary
```

### Output

- The transcript is written to `transcripts/<video_title_sanitised>.md`.
- If `--summary` is used, a `<video_title_sanitised>_summary.txt` file is also created next to the transcript.

## UI updates (ACE Studio MVP)

The spatial UI is now a two-scene local-first overlay for ACE:

- `Canvas` remains the primary working surface for notes, cards, links, and sketches.
- `ACE Studio` is a secondary pixel-art management scene for agent and architecture inspection.
- Transition paths:
  - zoom the canvas out below the studio threshold
  - press `Tab` to toggle scenes directly
  - click scene controls in the in-canvas toolbar

### ACE Studio capabilities

- Clickable agent stations for:
  - Context Manager
  - Planner
  - Executor
  - Memory Archivist
  - CTO / Architect
- Agent detail panel with:
  - role and workstation summary
  - live status badge
  - recent actions
  - throughput bars
  - feedback thread and comment box
- Studio camera controls:
  - drag to pan
  - scroll to zoom
  - click a station or minimap dot to focus that agent

### Architecture and extension points

The studio overlay is intentionally split so future feeds can replace the current heuristics without rewriting the UI shell:

- `ui/public/spatial/sceneState.js`
  - scene constants, zoom thresholds, and viewport helpers
- `ui/public/spatial/studioData.js`
  - agent definitions plus current status / throughput derivation from workspace and run history
- `ui/public/spatial/spatialApp.js`
  - scene composition, interaction wiring, rendering, autosave, and side-panel UI
- `ui/public/spatial/persistence.js`
  - workspace load/save
- `data/spatial/workspace.json`
  - persisted graph, sketches, annotations, studio state, and agent comments

Current data is sourced from existing project state only:

- workspace graph and annotations
- architecture memory snapshots
- dashboard state from `/api/dashboard`
- run history from `/api/runs`

That means the MVP stays local-first and lightweight, but the following can be swapped in later with minimal UI churn:

- real agent status feeds
- task queues and throughput metrics
- context synchronization streams
- comment backends / collaboration storage
- system logs and review events

## Legacy UI and API endpoints

The legacy dashboard remains available from the right-side drawer and still exposes:

- `GET /api/dashboard`
- `GET /api/projects`
- `GET /api/tasks`
- `GET /api/presets`
- `GET /api/runs`
- `POST /api/execute`
- `GET /api/stream/:runId`
- `POST /api/open-task-folder`
- `POST /api/add/idea`
- `POST /api/add/task`
- `POST /api/add/project`
- `GET /api/spatial/workspace`
- `PUT /api/spatial/workspace`
- `GET /api/spatial/history`
- `POST /api/spatial/intent`
- `POST /api/spatial/mutations/preview`
- `POST /api/spatial/mutations/apply`
