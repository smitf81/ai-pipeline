let runtimeContext = null;

export const tools = [{
  name: "mapforge_active_context_report",
  description: "Reads the active Map Forge document status, terrain context, and selected scene object to generate a reusable runtime capability report.",
  inputSchema: {
  "type": "object",
  "properties": {}
},
  async handler(args = {}) {
    if (!runtimeContext) return { ok: false, applied: false, reason: 'missing_runtime_api' };
    const result = await runtimeContext.mapforge.status();
    const ok = result !== null && result !== undefined;
    const applied = false;
    return { ok, applied, runtimeApi: "mapforge.status", data: result };
  }
}];

export function installMapforgeActiveContextReport(ctx) {
  if (!ctx || typeof ctx?.mapforge?.status !== 'function') return { ok: false, reason: 'missing_runtime_api', api: "mapforge.status" };
  runtimeContext = ctx;
  return { ok: true };
}

export function uninstallMapforgeActiveContextReport() {
  runtimeContext = null;
  return { ok: true };
}

export async function onLoad(ctx) { return installMapforgeActiveContextReport(ctx); }

export async function onActivate(ctx) {
  const installed = installMapforgeActiveContextReport(ctx);
  if (!installed.ok) return installed;
  for (const tool of tools) ctx.mcp.registerTool(tool);
  return { ok: true, registered_tools: tools.map(tool => tool.name) };
}

export async function onDeactivate(ctx) {
  for (const tool of tools) ctx.mcp.unregisterTool(tool.name);
  return uninstallMapforgeActiveContextReport();
}

export async function onUnload(ctx) { return onDeactivate(ctx); }
