# AXIOM Runtime Plugin Loader v0

This slice lets AXIOM activate a registered Plugin Builder plugin in the browser runtime without Felix approving every sub-step.

It is not a marketplace, not broad hot reload, and not core-file self-mutation.

## What it does

- Adds browser-side runtime plugin loader.
- Loads a registered plugin source through Plugin Builder `axiom_plugin_inspect(include_files=true)`.
- Dynamically imports the plugin entry file.
- Provides bounded runtime context APIs.
- Calls `onLoad(context)` and `onActivate(context)`.
- Rolls back by calling `onDeactivate()` / `onUnload()` if activation fails.
- Supports deactivate without restarting AXIOM.

## Apply order

1. Replace Plugin Builder with `pluginbuilder_activation_ready` or copy the small generator fix from it.
2. Restart Plugin Builder:

```powershell
npm test
npm run start:http
```

3. Patch AXIOM `server.js` using `snippets/server-mcp-activation-patch.js`.
4. Patch AXIOM editor/browser file:
   - add SceneManager APIs from `snippets/scene-manager-api-patch.js`
   - add `snippets/browser-runtime-loader.js` after `window.EDITOR = {...}` exists
   - add `snippets/client-action-router-patch.js` into existing clientAction handling
5. Restart AXIOM server and refresh MCP tools.

## New AXIOM MCP tools

- `axiom_plugin_activate`
- `axiom_plugin_deactivate`
- `axiom_plugin_runtime_status`

## Viewport note

The old generated viewport-navigation plugins have been culled from the active Plugin Builder registry. Viewport lens switching, plane lock, layer-stack projections, orbit, pan, zoom, and focus now belong to the native AXIOM spatial viewport foundation instead of a runtime plugin activation path.

Use the viewport controls directly:

- `1` Planar authoring lens
- `2` Isometric game lens
- `3` Free 3D inspect lens
- `4` Truth overlay lens
- `P` Plane Lock
- `L` Layer Stack View
