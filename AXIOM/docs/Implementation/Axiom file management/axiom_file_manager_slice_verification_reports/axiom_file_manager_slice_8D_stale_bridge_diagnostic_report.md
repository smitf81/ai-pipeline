# AXIOM File Manager Verification Report - Slice 8D

Date: 2026-06-01

## Slice

**Slice 8D - Stale launcher bridge diagnostic and condensed backlog**

## Scope

This slice handles the case where the browser has current FileManager frontend
code but the running launcher bridge process still exposes an old registered
project table.

## Root cause

The live browser showed `Black Sky Bound is not authorised by the AXIOM bridge`
while direct validation of the patched source passed. A probe against the
running `3007` bridge confirmed it still returned the old
`Projects/field-fronts-prototype` selector. The running server process was
stale relative to source.

## What changed

- Added bridge version metadata to `/health`, `project_list`, and
  `project_open`.
- Added frontend stale-bridge diagnostics when project open fails.
- Migrated the browser's legacy Black Sky Bound root alias to
  `_A_Projects/BLACK_SKY_BOUND_FFP` before FileManager actions run.
- Added `axiom_file_manager_current_backlog.md` as the condensed current plan.

## Validation target

```txt
node --check AXIOM/apps/launcher/server.js
inline browser script parse for AXIOM/apps/launcher/public/axiom-editor.html
active bridge probe on 3007 identifies stale selector before restart
isolated bridge probe reports bridgeVersion axiom-file-manager-bridge.v0.4c
```

Observed before launcher restart:

```json
{
  "ok": true,
  "bridgeVersion": null,
  "blackSelector": "Projects/field-fronts-prototype",
  "stale": true
}
```

Observed from an isolated current-source bridge:

```json
{
  "bridgeVersion": "axiom-file-manager-bridge.v0.4c",
  "blackSelector": "_A_Projects/BLACK_SKY_BOUND_FFP",
  "blackStatus": "ready",
  "openNewOk": true,
  "openNewStatus": "ready"
}
```

Live `3007` restart status:

```txt
Attempted to restart the stale launcher bridge process, but the local command
policy rejected the process-stop/start command. Source validation passes; the
running browser session still needs the AXIOM launcher bridge restarted so port
3007 serves bridgeVersion axiom-file-manager-bridge.v0.4c.
```

## Boundary

This is still an Axiom project/file-management slice. Black Sky Bound is used
only as a read-only root/manifest/status probe.
