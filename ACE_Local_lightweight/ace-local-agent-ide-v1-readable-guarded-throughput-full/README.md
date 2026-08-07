# ACE Local Agent IDE v1

This is a local, workspace-constrained multi-agent coding cockpit.

It is not a toy browser mock-up:
- The backend calls Ollama for real model output.
- The backend reads/writes files from one selected workspace folder only.
- CLI commands run from that selected workspace folder only.
- Model outputs must be JSON.
- Invalid plans go through QA/repair loops.
- Edits are proposed first and applied only when you click Apply.

## Start

```powershell
cd ace-local-agent-ide-v1
node server.js
```

Open:

```text
http://127.0.0.1:3177
```

## First setup

1. Put your project folder path into "Selected workspace folder path".
2. Click Save.
3. Click Models.
4. Pick a model per agent.
5. Click Load tree.
6. Select one or two files for context.
7. Give it a very small coding slice.
8. Review the JSON plan.
9. Click Apply proposed edits only when happy.

## Guardrails

The server rejects:
- absolute model-supplied edit paths
- `..` path traversal
- binary file edits
- writes outside the selected workspace
- obviously dangerous shell commands
- stale file writes when an expected hash no longer matches

Backups are saved in:

```text
.ace-local-agent-ide/backups
```

## Useful commands

For a hardcoded HTML/JS mini game:

```powershell
python -m http.server 4174
```

For a Node project:

```powershell
npm test
```

For Git inspection:

```powershell
git status --short
git diff --stat
```
