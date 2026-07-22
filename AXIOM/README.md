# AXIOM

The canonical editor and MCP runtime lives in `apps/launcher`. Plugin generation and repair services live in `apps/plugin-builder`.

Run the launcher from `apps/launcher`:

```powershell
npm test
npm start
```

The runtime plugin loader, SceneManager APIs, MCP activation routes, SSE bridge, and browser client are integrated source. No patch snippets or secondary bridge service need to be applied.

## New AXIOM MCP tools

- `axiom_plugin_activate`
- `axiom_plugin_deactivate`
- `axiom_plugin_runtime_status`

## Viewport note

The old generated viewport-navigation plugins have been culled from the active Plugin Builder registry. Viewport lens switching, plane lock, layer-stack projections, orbit, pan, zoom, and focus belong to the native AXIOM spatial viewport foundation instead of a runtime plugin activation path.

Use the viewport controls directly:

- `1` Planar authoring lens
- `2` Isometric game lens
- `3` Free 3D inspect lens
- `4` Truth overlay lens
- `P` Plane Lock
- `L` Layer Stack View
