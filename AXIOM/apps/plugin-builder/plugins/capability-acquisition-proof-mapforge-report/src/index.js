let runtimeContext = null;

export const tools = [{
  name: "mapforge_status_report",
  description: "Reports the active Map Forge map identity, revision, dimensions, terrain regions, and authoring status for planning context.",
  inputSchema: {
  "type": "object",
  "properties": {}
},
  async handler(args = {}) {
    if (!runtimeContext) return { ok: false, applied: false, reason: 'missing_runtime_api' };
    const result = await runtimeContext.mapforge.status();
    const ok = result !== null && result !== undefined && result?.ok !== false;
    const applied = false;
    return { ok, applied, runtimeApi: "mapforge.status", data: result };
  }
}];

export function installMapforgeStatusReport(ctx) {
  if (!ctx || typeof ctx?.mapforge?.status !== 'function') return { ok: false, reason: 'missing_runtime_api', api: "mapforge.status" };
  runtimeContext = ctx;
  return { ok: true };
}

export function uninstallMapforgeStatusReport() {
  runtimeContext = null;
  return { ok: true };
}

export async function onLoad(ctx) { return installMapforgeStatusReport(ctx); }

export async function onActivate(ctx) {
  const installed = installMapforgeStatusReport(ctx);
  if (!installed.ok) return installed;
  for (const tool of tools) ctx.mcp.registerTool(tool);
  return { ok: true, registered_tools: tools.map(tool => tool.name) };
}

export async function onDeactivate(ctx) {
  for (const tool of tools) ctx.mcp.unregisterTool(tool.name);
  return uninstallMapforgeStatusReport();
}

export async function onUnload(ctx) { return onDeactivate(ctx); }
