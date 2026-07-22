# AXIOM File Manager Verification Report - Slice 11

Date: 2026-06-02

## Slice

**Slice 11 - CLI and menu unification**

## Scope

This slice routes save/load/file command surfaces through
`FileManagerRuntime.action(...)` so the Files panel, CLI, File menu, and
keyboard save no longer carry their own scene/file persistence behavior.

## Root cause

After Slice 10, the FileManager action API owned project scene save/load, but
some operator surfaces still called lower-level helpers or SceneManager
directly. That could create different receipt behavior depending on whether the
operator used the CLI, File menu, keyboard shortcut, or Files panel.

## What changed

- File menu:
  - `New Scene` calls `FileManagerRuntime.action('new_scene')`.
  - `Export Scene` calls `FileManagerRuntime.action('export_scene')`.
  - `Save` calls `FileManagerRuntime.action('save_scene_project')`.
- Keyboard:
  - `Ctrl+S` / `Cmd+S` calls `save_scene_project` through FileManager.
- Files panel scene buttons now call action routes instead of direct scene
  persistence helpers.
- CLI:
  - `save [project|local] [path]`
  - `load [project|local] [path]`
  - `saveproject [path]`
  - `loadproject [path]`
  - `verifyproject [path]`
  - `scene save|load|verify [project|local] [path]`
  - `scene export`
  - `scene clear`
  - `open <path>`
  - `files health`
  - `files scan <path>`
- CLI output now prints receipt summaries with operation, status, applied flag,
  receipt id, and target path when present.
- Added FileManager actions and receipts:
  - `new_scene` -> `scene.new`
  - `export_scene` -> `scene.export`

## Fail-loud behavior

- Menu Save and keyboard Save use project scene save. If project write is not
  authorised or `safe_write_project_file` is missing, the operation fails
  through the Slice 10 receipt path.
- Export Scene is explicitly export-only and non-applied.
- New Scene mutates SceneManager through the FileManager action route and emits
  a receipt.

## Validation run

Passed:

- `node --check AXIOM/apps/launcher/server.js`
- Inline browser script parse:
  - `script 1 ok (0 chars)`
  - `script 2 ok (521944 chars)`
- `git diff --check`
  - only CRLF normalization warnings were emitted
- Source invariant check:
  - File menu uses action helper functions
  - keyboard save uses `save_scene_project`
  - CLI centralises FileManager calls through `runFileAction`
  - CLI no longer directly calls scene persistence/file helper functions
  - Files-panel scene buttons use action routes
  - `new_scene` and `export_scene` action routes and receipt aliases exist

## Boundary

No Black Sky Bound gameplay files are touched. This is an AXIOM shell/FileManager
routing slice only.
