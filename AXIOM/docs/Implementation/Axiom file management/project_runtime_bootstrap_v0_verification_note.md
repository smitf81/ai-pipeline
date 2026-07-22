# Project Runtime Bootstrap v0 Verification Note

Date: 2026-06-02

## Purpose

Verify and repair the missing active-project runtime lifecycle seam after the
AXIOM FileManager v0-to-v1 plan completed.

## Questions Answered

1. AXIOM now reads project runtime URL, healthcheck URL, port, cwd, and start
   command from `.axiom/project.json`.
2. AXIOM probes the runtime before viewport load.
3. If the runtime is offline, AXIOM starts the declared project server itself.
4. AXIOM waits for healthcheck readiness before loading the iframe viewport.
5. The UI shows bootstrapping, ready/frame-loaded, `runtime_start_failed`, and
   `project_boot_failed` states.
6. Runtime bootstrap is manifest-driven. Black Sky Bound is only the first
   manifest using the contract.

## Files Changed

- `AXIOM/apps/launcher/server.js`
- `AXIOM/apps/launcher/public/axiom-editor.html`
- `_A_Projects/BLACK_SKY_BOUND_FFP/.axiom/project.json`
- `AXIOM/docs/Implementation/Axiom file management/project_runtime_bootstrap_v0_verification_note.md`

## Exact Launch Path Tested

Test bridge:

```txt
PORT=3019 node AXIOM/apps/launcher/server.js
```

Bootstrap request:

```txt
POST http://127.0.0.1:3019/mcp/call
tool: project_runtime_bootstrap
params:
  projectId: black-sky-bound
  entrypointId: prototype
  timeoutMs: 25000
  probeTimeoutMs: 1500
```

Observed result:

```txt
BOOT_HTTP_STATUS=200
BOOT_STATUS=ready startedByAxiom=true preProbe=false readyProbe=true
ENTRY_STATUS=200 length=1532
```

This proves the offline runtime was detected before viewport load, the declared
project runtime was started automatically, healthcheck readiness succeeded, and
the browser entry URL was reachable.

## Failure Surface

Before repair, bootstrap failed loudly with:

```txt
runtime_start_failed
detail: spawn EINVAL
```

Root cause:

```txt
Windows cannot spawn the declared npm.cmd runtime directly with shell:false.
```

Repair:

```txt
Declared .cmd/.bat project runtime commands are launched through the Windows
command processor adapter with windowsHide:true, while preserving the manifest
command/args and rejecting shell metacharacters.
```

## Scope Guard

No Black Sky Bound gameplay files were changed. The only Black Sky Bound file
changed is `.axiom/project.json`, which declares AXIOM project/runtime metadata.
