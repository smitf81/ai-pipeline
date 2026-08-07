# Unified Spatial Viewport Mode Model v0

Date: 2026-06-02

## Slice continued

Canonical AXIOM viewport foundations for a unified spatial viewport: one 3D-capable scene with multiple camera and editing lenses, rather than separate 2D and 3D editors.

## Target

The prior viewport-control work existed as generated Plugin Builder proposals. That made core viewport behavior depend on optional runtime plugin activation and left AXIOM able to steer itself toward stale patch proposals.

This slice moves the foundation into the native AXIOM editor runtime.

## Implemented

- Added four viewport lenses: `planar_authoring`, `isometric_game`, `free_3d_inspect`, and `truth_agent_overlay`.
- Added visible viewport controls for `1` Planar, `2` Iso, `3` Free, `4` Truth, Plane Lock, and Layer Stack.
- Added keyboard shortcuts: `1`, `2`, `3`, `4`, `P`, and `L`.
- Added native plane-lock state and active-plane reporting.
- Added native 2D authoring to 3D world mapping through `map2DToWorld`.
- Added pointer-to-active-plane projection through `projectPointerToActivePlane`.
- Added a Layer Stack View contract with layer ids, source types, base planes, depth offsets, opacity, lock state, visibility, selectability, editability, and projection object slots.
- Added a viewport object projection contract with `object_id`, `source_ref`, `projection_type`, `world_transform`, and `edit_policy`.
- Exposed the native viewport API at `window.EDITOR.viewport`.
- Converted the chat viewport-navigation shortcut away from Plugin Builder activation and toward the native viewport foundation.

## Culled legacy attempts

- Removed the active generated viewport navigation plugin files from `AXIOM/apps/plugin-builder/plugins`.
- Removed `viewportnavigationplugin` and `viewportnavigationimplementation` from the active Plugin Builder registry.
- Removed stale registry receipts for the culled viewport plugins.
- Removed an unreachable legacy runtime-plugin listing branch in the editor.
- Updated active docs that previously instructed users to activate `ViewportNavigationImplementation`.

Archived version-history copies were left untouched because they are inactive history, not current runtime truth.

## Not implemented

- No rendering rewrite.
- No extruded geometry authoring.
- No direct edits to derived truth, diagnostic, weather, visibility, or nav layers.
- No Black Sky Bound gameplay code changes.

## Validation

Commands run:

```powershell
node --check AXIOM/apps/launcher/server.js
node tools/check-axiom-editor-inline-js.mjs
node -e "JSON.parse(require('fs').readFileSync('AXIOM/apps/plugin-builder/registry.json','utf8')); console.log('registry json ok')"
git diff --check -- AXIOM/apps/launcher/public/axiom-editor.html AXIOM/apps/plugin-builder/registry.json AXIOM/README.md AXIOM/docs
```

Additional checks run:

```powershell
node -e "/* source marker assertions for VIEWPORT_LENSES, VIEWPORT_LAYER_STACK_CONTRACT, window.EDITOR.viewport, and native_spatial_viewport_v0 */"
node -e "/* active Plugin Builder registry assertion that culled viewport plugins are absent */"
rg --files AXIOM/apps/plugin-builder/plugins | rg -i "viewportnavigation"
Invoke-WebRequest http://127.0.0.1:3007/axiom-editor.html
npm.cmd test
```

Results:

- `node --check AXIOM/apps/launcher/server.js`: passed.
- `node tools/check-axiom-editor-inline-js.mjs`: passed, 1 inline script parsed.
- Plugin Builder registry JSON parse: passed.
- `git diff --check`: passed with line-ending warnings only.
- Source marker assertions: passed.
- Culled plugin registry assertion: passed.
- Culled plugin file assertion: passed.
- HTTP smoke against the running AXIOM server on `3007`: passed, editor HTML served with new viewport markers.
- Rendered Playwright smoke: blocked by local Chromium `spawn EPERM`.
- `npm.cmd test`: unit runner passed through the touched/nearby UI tests and reached `talentUi`, then the full gate timed out before completing the whole command.

Expected source assertions:

- `VIEWPORT_LENSES` exists in `axiom-editor.html`.
- `VIEWPORT_LAYER_STACK_CONTRACT` exists in `axiom-editor.html`.
- `window.EDITOR.viewport` exposes the native viewport API.
- Active Plugin Builder registry no longer contains the culled viewport navigation plugins.
