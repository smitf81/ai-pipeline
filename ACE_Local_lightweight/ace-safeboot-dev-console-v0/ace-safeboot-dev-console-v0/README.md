# ACE SafeBoot Dev Console v0

This is a hardened, independent maintenance cockpit for ACE.

It is designed to run when the full ACE Studio/spatial UI is broken or unsafe to load.

## What it does

- Runs independently from the ACE Studio UI bundle.
- Talks to ACE if ACE server is alive.
- Posts user intent into ACE via `/api/spatial/intent`.
- Reads ACE state from:
  - `/api/spatial/boot-status`
  - `/api/health`
  - `/api/spatial/runtime`
  - `/api/spatial/workspace`
  - `/api/spatial/truth-kernel`
  - `/api/qa/repair-loop/state`
  - `/api/qa/lead/state`
  - `/api/spatial/qa/runs`
- Provides workspace-scoped emergency file read/write.
- Provides workspace-scoped CLI.
- Backs up overwritten files.
- Blocks obvious dangerous commands.
- Stores local SafeBoot event receipts.

## Start

```powershell
cd ace-safeboot-dev-console-v0
node server.js
```

Open:

```text
http://127.0.0.1:3188
```

## Intended role

Normal flow:

```text
ACE Studio UI → full spatial/canvas/entity mode
```

Fallback flow:

```text
ACE SafeBoot Dev Console → software dev / repair cockpit
```

## Important

This should not become another full ACE UI.

Keep it boring:
- no frontend framework
- no canvas dependency
- no asset chain
- no visual flourish required
- no duplicate agent architecture

It is an emergency bridge into ACE's existing orchestration, QA, repair, and canonical truth spine.
