AXIOM Activation Seam Fix
=========================

This bundle preserves the original launcher/dependency layout and only patches the final browser runtime seam.

What changed:
1. axiom_plugin_activate / axiom_plugin_deactivate / axiom_plugin_runtime_status are AXIOM-local actions.
   They no longer call Plugin Builder as remote tools.

2. /mcp/call now broadcasts clientAction in mcp_result events.

3. The browser now applies plugin client actions:
   - activate_plugin -> window.AXIOM_PLUGIN_RUNTIME.activate(...)
   - deactivate_plugin -> window.AXIOM_PLUGIN_RUNTIME.deactivate(...)
   - plugin_runtime_status -> window.AXIOM_PLUGIN_RUNTIME.status()

4. AXIOM exposes the runtime APIs formerly required by the generated viewport plugin:
   - scene.getCamera()
   - scene.getOrbitTarget()
   - scene.getRendererDomElement()
   - scene.getSelected()
   - scene.focusSelected()

5. Browser runtime loader is installed in axiom-editor-v0.2.html.

Viewport update:
- The generated viewport-navigation plugin path is superseded and removed from the active Plugin Builder registry.
- Native AXIOM viewport controls now own lens switching, plane lock, layer-stack projections, orbit, pan, zoom, and focus.

Validated:
- axiom-launcher-bundle/server.js passes node syntax check.
- inline JS extracted from axiom-editor-v0.2.html passes node syntax check.
- server starts locally.
- local /mcp/call for axiom_plugin_runtime_status returns a clientAction.

Test after install:
1. Start Plugin Builder:
   cd C:\Users\felix\Desktop\Automated_AI_Pipeline\Projects\AXIOM\pluginbuilder_finished
   npm run start:http

2. Launch AXIOM normally.

3. Ask AXIOM chat:
   Use axiom_plugin_runtime_status.

Expected:
- You should see a client_apply event in the Stream tab.
- Runtime status should report AXIOM_PLUGIN_RUNTIME state instead of only pendingClientApply.

4. Do not activate ViewportNavigationImplementation. That generated plugin path has been culled.

Expected:
- The viewport controls are available natively in AXIOM.
- `1`, `2`, `3`, and `4` switch lenses.
- `P` toggles Plane Lock.
- `L` opens Layer Stack View.
