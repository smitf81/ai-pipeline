# AXIOM File Manager Verification Report - Slice 10

Date: 2026-06-02

## Slice

**Slice 10 - Project scene file save/load**

## Scope

This slice moves AXIOM scene persistence from browser-local verification toward
authorised project-file persistence. It keeps browser localStorage as the
separate Slice 9 local path and adds strict project scene operations under the
FileManager authority contract.

## Root cause

AXIOM could verify a scene round trip in localStorage, but it had no governed
route for writing a real scene file into the active project, validating it
before load, updating the project manifest, or reporting partial filesystem
application. That left agent-authored scene data with too many ways to land
outside the intended project file placement.

## What changed

- Added default project scene path `scenes/default.scene.json`.
- Added strict project scene path validation:
  - relative paths only
  - no traversal
  - must live under `scenes/`
  - must end in `.scene.json`
- Added project scene schema validation for:
  - `schema === axiom.scene.v1`
  - object count consistency
  - supported SceneManager object types
  - numeric position, rotation, scale, and camera position values
- Added FileManager project scene operations:
  - `saveSceneToProject(path)`
  - `readSceneFile(path)`
  - `previewSceneLoad(path)`
  - `applySceneLoad(validatedScene)`
  - `loadSceneFromProject(path)`
  - `verifyProjectSceneSaveLoad(path)`
- Added action API routes:
  - `save_scene_project`
  - `read_scene_project`
  - `preview_scene_project`
  - `load_scene_project`
  - `apply_scene_project`
  - `verify_scene_project`
- Added receipts:
  - `scene.save.project`
  - `scene.read.project`
  - `scene.preview.project`
  - `scene.load.project`
  - `scene.apply.project`
  - `scene.verify.project`
- Added compact Files-panel controls for project scene save, preview, load, and
  verify.
- Added CLI commands `saveproject`, `loadproject`, and `verifyproject`.
- Added bounded full-read support to the launcher bridge so project scene JSON
  is not silently truncated by the default text preview line limit.

## Fail-loud behavior

- Project scene save requires `safe_write_project_file`; if it is missing, the
  save is blocked and receipted as failed.
- Project scene read requires `safe_read_project_file`; if it is missing, the
  read is blocked and receipted as failed.
- Truncated project scene reads fail with
  `safe_read_project_file_truncated`.
- The project manifest must be read from the authorised project filesystem
  before scene save. No default manifest or browser-local manifest is promoted
  as a project save.
- If the scene file write succeeds but the manifest update fails, the result is
  reported as partial instead of successful.

## Validation target

```txt
node --check AXIOM/apps/launcher/server.js
inline browser script parse for AXIOM/apps/launcher/public/axiom-editor.html
source invariant check for project scene actions, safe write/read requirements,
path placement policy, and full-read truncation guard
git diff --check
```

## Validation run

Passed:

- `node --check AXIOM/apps/launcher/server.js`
- Inline browser script parse:
  - `script 1 ok (0 chars)`
  - `script 2 ok (517844 chars)`
- `git diff --check`
  - only CRLF normalization warnings were emitted
- Source invariant check:
  - default project scene path exists
  - `scenes/*.scene.json` placement policy exists
  - all project scene action routes exist
  - project scene save requires `safe_write_project_file`
  - project scene read requires `safe_read_project_file`
  - project scene save block does not call browser localStorage
  - project scene save block does not call the degraded manifest helpers
  - bounded full-read and truncation guard exist

## Boundary

No Black Sky Bound gameplay files are touched. Live project write acceptance is
not run against Black Sky Bound in this slice.
