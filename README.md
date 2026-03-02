# AI Pipeline

Control repo for local AI / agent-driven tooling.

## Apply a task patch safely

Use the runner to validate and apply a generated task patch:

`python runner/ai.py apply --project <key> --task 0001`

Dry-run mode (validation only):

`python runner/ai.py apply --project <key> --task 0001 --dry-run`

## `yt_transcript_exporter` – YouTube transcript to Markdown

This repository includes a small Python CLI tool, `yt_transcript_exporter.py`, which downloads a YouTube video transcript (when available) and saves it as a clean Markdown file suitable for LLMs.

### Installation

- Ensure you have Python 3.8+ installed.
- From this directory, install dependencies:

```bash
pip install -r requirements.txt
```

### Usage

Basic usage:

```bash
python yt_transcript_exporter.py <youtube_url>
```

Include timestamps at the start of each paragraph:

```bash
python yt_transcript_exporter.py <youtube_url> --timestamps
```

Also create a separate summary notes placeholder:

```bash
python yt_transcript_exporter.py <youtube_url> --summary
```

You can combine flags:

```bash
python yt_transcript_exporter.py <youtube_url> --timestamps --summary
```

### Output

- The transcript is written to `transcripts/<video_title_sanitised>.md`.
- The Markdown format is:

  - `# <Video Title>`
  - `Source: <YouTube URL>`
  - `## Transcript`
  - `Well‑formed paragraphs containing the transcript (optionally prefixed with timestamps).`

If `--summary` is used, a `<video_title_sanitised>_summary.txt` file is also created next to the transcript as a placeholder for your own LLM notes.

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
