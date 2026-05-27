// Wherever AXIOM already applies clientAction for create_object, add these cases:
async function applyAxiomClientAction(clientAction) {
  if (!clientAction) return { ok: false, reason: 'missing_clientAction' };

  if (["activate_plugin", "deactivate_plugin", "plugin_runtime_status"].includes(clientAction.type)) {
    if (!window.AXIOM_PLUGIN_RUNTIME) {
      return { ok: false, reason: 'plugin_runtime_loader_missing' };
    }
    return await window.AXIOM_PLUGIN_RUNTIME.applyClientAction(clientAction);
  }

  // Existing create_object handling stays unchanged below this point.
}
