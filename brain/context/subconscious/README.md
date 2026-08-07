# Subconscious Advisory Context

This directory is the generated evidence store for the local subconscious observer.

## Authority

- Classification: derived advisory context.
- Canonical truth remains in `brain/emergence/`.
- No agent should treat observations or compressed memory here as confirmed facts without checking canonical sources and runtime evidence.
- The daemon may compress memory, but it may never destroy memory: empty or truncated updates are recorded and rejected while a substantive current summary is preserved.

## Outputs

- `observer-ledger.txt`: current daemon/model/load/control status as JSON text.
- `latest-observation.md`: newest model-generated commentary.
- `subconscious-memory.sqlite`: derived structured SQLite store for observations, memory events, snapshots, file mentions, agent activity, and compression runs.
- `subconscious-memory.md`: protected current readable memory summary, replaced only by an accepted substantive update.
- `memory-events.jsonl`: append-only JSON-lines ledger of accepted and rejected memory updates.
- `memory-snapshots/`: immutable readable snapshots of accepted or preserved summary states.
- `observer-events.txt`: append-only JSON-lines generation receipt stream.
- `observation-history.md`: bounded text-only observation history.
- `observer-index.txt`: bounded workspace scan metadata used to detect later activity.
- `observer-toggle.txt`: manual pause state as JSON text.
- `ui/subconscious.config.json`: reviewed cadence/model/resource configuration source.

## Controls

From the project root:

```powershell
node ui/subconsciousDaemon.js --pause
node ui/subconsciousDaemon.js --resume
node ui/subconsciousDaemon.js --once --force
```

From `ui/`, the npm wrappers switch to the project root before starting the daemon: `npm run subconscious:once` or `npm run subconscious`.

When the resident daemon is active, it listens only on `127.0.0.1:43171`:

- `GET /api/subconscious/status`
- `GET /api/subconscious/memory`
- `POST /api/subconscious/control` with `{"action":"pause"}`, `{"action":"resume"}`, or `{"action":"wake"}`

`ui/scripts/Install-Subconscious-Task.ps1` installs a hidden logon task. The resident process sleeps between scans, defers model work during configured high-load conditions, and asks Ollama to unload the model after every completed generation.

## SQLite Store

The SQLite file is generated derived context, not source and not canonical truth. It uses the schema contract `subconscious.memory.sqlite.v1` and keeps the human-readable Markdown files as exports. If an export is missing or stale, the daemon can restore the current memory view from the SQLite store on startup.
