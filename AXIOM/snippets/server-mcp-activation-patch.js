// Add these to AXIOM server.js MCP_TOOLS:
{
  name: "axiom_plugin_activate",
  description: "Activate a registered AXIOM plugin in the browser runtime through the bounded plugin loader. Rolls back on activation failure.",
  inputSchema: {
    type: "object",
    required: ["plugin_id"],
    properties: {
      plugin_id: { type: "string" },
      builderUrl: { type: "string", default: "http://127.0.0.1:4242" }
    }
  }
},
{
  name: "axiom_plugin_deactivate",
  description: "Deactivate an active AXIOM runtime plugin and run its cleanup path.",
  inputSchema: {
    type: "object",
    required: ["plugin_id"],
    properties: { plugin_id: { type: "string" } }
  }
},
{
  name: "axiom_plugin_runtime_status",
  description: "Return browser runtime plugin activation status.",
  inputSchema: { type: "object", properties: {} }
}

// Add these cases inside async callTool(tool, params = {}), before fs/shell fallback:
if (tool === "axiom_plugin_activate") {
  const pluginId = String(params.plugin_id || "").trim();
  if (!pluginId) return { ok: false, error: "plugin_id is required" };
  return {
    ok: true,
    result: {
      requested: { plugin_id: pluginId },
      pendingClientApply: true,
      applied: false,
      note: "Browser client must activate this plugin through AXIOM_PLUGIN_RUNTIME."
    },
    clientAction: {
      type: "activate_plugin",
      payload: {
        plugin_id: pluginId,
        builderUrl: params.builderUrl || "http://127.0.0.1:4242"
      }
    },
    receipt: {
      tool,
      status: "proposed_for_client_apply",
      createdAt: now
    }
  };
}

if (tool === "axiom_plugin_deactivate") {
  const pluginId = String(params.plugin_id || "").trim();
  if (!pluginId) return { ok: false, error: "plugin_id is required" };
  return {
    ok: true,
    result: { requested: { plugin_id: pluginId }, pendingClientApply: true, applied: false },
    clientAction: { type: "deactivate_plugin", payload: { plugin_id: pluginId } },
    receipt: { tool, status: "proposed_for_client_apply", createdAt: now }
  };
}

if (tool === "axiom_plugin_runtime_status") {
  return {
    ok: true,
    result: { pendingClientApply: true, applied: false },
    clientAction: { type: "plugin_runtime_status", payload: {} },
    receipt: { tool, status: "proposed_for_client_apply", createdAt: now }
  };
}
