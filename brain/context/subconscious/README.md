# Subconscious Advisory Context

This directory is the generated evidence store for the local subconscious observer.

## Authority

- Classification: derived advisory context.
- Canonical truth remains in `brain/emergence/`.
- No agent should treat observations or compressed memory here as confirmed facts without checking canonical sources and runtime evidence.

## Outputs

- `status.json`: current daemon/model/load/control status.
- `latest-thought.md`: newest model-generated commentary.
- `memory.md`: bounded model-compressed advisory memory.
- `activity.ndjson`: append-only generation receipt stream.
- `thoughts/*.md`: retained text-only observation history.
- `settings.json`: bounded cadence/model/resource configuration written on first run.
- `control.json`: manual pause state.

## Controls

From `ui/`:

```powershell
npm run subconscious:once
node subconsciousDaemon.js --pause
node subconsciousDaemon.js --resume
node subconsciousDaemon.js --once --force
```

When the resident daemon is active, it listens only on `127.0.0.1:43171`:

- `GET /api/subconscious/status`
- `GET /api/subconscious/memory`
- `POST /api/subconscious/control` with `{"action":"pause"}`, `{"action":"resume"}`, or `{"action":"wake"}`

`ui/scripts/Install-Subconscious-Task.ps1` installs a hidden logon task. The resident process sleeps between scans, defers model work during configured high-load conditions, and asks Ollama to unload the model after every completed generation.
