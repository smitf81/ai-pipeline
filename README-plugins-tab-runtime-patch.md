# AXIOM Plugins Tab Runtime Projection Patch

Replaces the Plugins tab renderer so it merges local PluginRegistry entries with active runtime plugins reported by window.AXIOM_PLUGIN_RUNTIME.status().

Changed file:
- AXIOM/apps/launcher/public/axiom-editor.html

Expected result:
- Axiom Core remains visible.
- Active runtime plugins such as viewportnavigationimplementation appear in the Plugins tab.
- Activation/deactivation/runtime-status client actions trigger renderPluginList().
