# AXIOM File Manager Verification Report - Slice 9

Date: 2026-06-01

## Slice

**Slice 9 - Local scene persistence formalisation**

## Scope

This slice formalises browser-local AXIOM scene save/load before project-file
scene persistence. It is explicit localStorage persistence, not a project save
and not a fallback path.

## Root cause

The pre-slice implementation saved an informal wrapper payload, read loose
payload shapes, mirrored legacy keys, and verified only object count. That could
make broken scene persistence look healthy.

## What changed

- Uses exactly one local scene key: `axiom.scene.local.v1`.
- Saves exact `axiom.scene.v1` payloads with scene id, timestamp,
  editor version, object count, objects, camera, selection, and provenance.
- Removed legacy scene read/write behavior.
- Removed silent scene payload normalisation.
- Load fails loudly when the required key is missing, JSON is malformed, schema
  is wrong, object fields are missing, or object count is inconsistent.
- File Manager status reports malformed local scene state as `savedScene.ok:
  false` instead of hiding it.
- Verification compares object count, object names/types, and selected object.
- Receipts remain `scene.save.local`, `scene.load.local`, and
  `scene.verify.local`.

## Validation target

```txt
node --check AXIOM/apps/launcher/server.js
inline browser script parse for AXIOM/apps/launcher/public/axiom-editor.html
AXIOM_FILE_MANAGER.action('save_scene_local', {}) -> schema axiom.scene.v1
AXIOM_FILE_MANAGER.action('verify_save_load_local', {}) -> comparison.ok true
AXIOM_FILE_MANAGER.action('load_scene_local', {}) with missing key -> failed receipt with missing_required_scene_localStorage_key:axiom.scene.local.v1
FileManagerRuntime.status() with malformed axiom.scene.local.v1 -> savedScene.ok false
```

## Boundary

No Black Sky Bound gameplay files are touched. This slice only changes Axiom's
FileManager/SceneManager local persistence bridge and file-management docs.
