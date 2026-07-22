# AXIOM File Manager Verification Report - Slice 8A

## Slice

**Slice 8A - Live external project root bridge: Black Sky Bound**

Target version: **v0.4a**

## Verification verdict

```txt
PASS_BACKEND_LIVE_PROJECT_CONTRACT_WITH_BROWSER_ACCEPTANCE_BLOCKED_BY_SANDBOX
```

## Root cause

Slice 8 stored an active project root in browser state, while the launcher
filesystem tools still resolved every file request under
`AXIOM/apps/launcher`. A selected external project therefore was not the
project actually being scanned or read.

The same pass exposed a second Slice 8 defect: normalising `.` returned an
empty path, so a valid project manifest with `"root": "."` could fail root
validation.

## Canonical owners

- `AXIOM/apps/launcher/server.js` owns the authorised project registry and
  server-side path containment check.
- `FileManagerRuntime` owns selected project state, manifest display, and
  operation receipts in the editor.
- `Projects/field-fronts-prototype/.axiom/project.json` owns the persisted
  AXIOM project metadata for Black Sky Bound.

## Delivered files

```txt
AXIOM/apps/launcher/server.js
AXIOM/apps/launcher/public/axiom-editor.html
AXIOM/docs/Implementation/Axiom file management/axiom_file_manager_external_files_spec.md
AXIOM/docs/Implementation/Axiom file management/axiom_file_manager_v_0_to_v_1_implementation_plan.md
Projects/field-fronts-prototype/.axiom/project.json
```

## What changed

- Registered `black-sky-bound` as an authorised live File Manager project at
  `Projects/field-fronts-prototype`.
- Added MCP actions `project_list` and `project_open`.
- Scoped filesystem read/list/find/stat/hash/validate/write operations by an
  explicit `projectRoot` or `projectId` and rejected unregistered roots.
- Replaced prefix-only path containment with relative-path containment for
  scoped project access.
- Enforced protected-folder write rejection for `.git` and `node_modules`
  under an authorised project root.
- Made File Manager calls carry the selected project scope.
- Added the Files-panel `Load Black Sky Bound` action, which authorises the
  project, reads its manifest, scans its root, and emits a live-project
  receipt.
- Fixed `.` path normalisation for manifest/root validation.
- Added the Black Sky Bound `.axiom/project.json` manifest with its
  `index.html` / `npm.cmd start` browser-prototype entrypoint.

## Before / after truth flow

Before:

```txt
Files-panel selected root -> browser local state
MCP fs_* call -> fixed AXIOM/apps/launcher root
```

After:

```txt
Files-panel project selection
  -> launcher project_open authorisation
  -> explicit projectRoot on each MCP filesystem call
  -> server containment check within registered Black Sky Bound root
  -> real manifest/file response
  -> FileManager receipt and display state
```

## Validation performed

Passed:

```txt
node --check AXIOM/apps/launcher/server.js
node inline extraction/new Function syntax check for AXIOM/apps/launcher/public/axiom-editor.html
PowerShell ConvertFrom-Json for Projects/field-fronts-prototype/.axiom/project.json
```

Passed direct live launcher probe on an isolated port:

```txt
project_open(Projects/field-fronts-prototype) -> project id black-sky-bound, manifest exists
fs_ls(., scoped to Black Sky Bound) -> README.md and .axiom visible
fs_cat(.axiom/project.json, scoped) -> projectId black-sky-bound
fs_cat(README.md, scoped) -> Black Sky Bound / Field Fronts content
project_open(Projects/not-registered) -> blocked
fs_cat(../README.md, scoped) -> blocked as project-root escape
safe_write_project_file(.git/blocked.md, scoped) -> blocked as protected folder
```

Blocked browser acceptance:

```txt
Browser plugin runtime setup failed under the Windows sandbox before a tab was available.
Regular Playwright fallback also failed to launch Chromium with spawn EPERM.
```

## Remaining acceptance check

In an environment permitted to launch the AXIOM browser, run:

```js
await AXIOM_FILE_MANAGER.openBlackSkyBound()
FileManagerRuntime.getState().projectManifest
FileManagerRuntime.getState().lastScan
FileManagerRuntime.getReceipts(5)
```

Confirm that the Files panel shows `Black Sky Bound`, root
`Projects/field-fronts-prototype`, manifest status `loaded`, and that opening
`README.md` in Code displays the prototype content.

## Residual issues

- This slice integrates Black Sky Bound as a real file-managed AXIOM project;
  it does not import the game's running world into AXIOM's scene graph.
- Arbitrary external roots remain intentionally blocked until a governed
  project-registration workflow is specified and validated.
- UI interaction acceptance remains pending solely because this sandbox could
  not launch a browser process.
