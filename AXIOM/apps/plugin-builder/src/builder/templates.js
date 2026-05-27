export const TEMPLATES = {
  base: {
    name: 'Base Plugin',
    description: 'Small general-purpose plugin with lifecycle hooks only.',
    default_capabilities: ['event-subscribe'],
    default_permissions: { storage: { namespaces: ['plugin-local'] } },
    entry_file: m => `export async function onLoad(ctx) {\n  ctx.log?.info?.('${m.id}: loaded');\n}\n\nexport async function onActivate(ctx) {\n  ctx.log?.info?.('${m.id}: activated');\n}\n\nexport async function onDeactivate(ctx) {\n  ctx.log?.info?.('${m.id}: deactivated');\n}\n\nexport async function onUnload(ctx) {\n  ctx.log?.info?.('${m.id}: unloaded');\n}\n`,
    test_file: m => `import * as plugin from '../src/index.js';\n\nif (typeof plugin.onLoad !== 'function') throw new Error('onLoad missing');\nif (typeof plugin.onActivate !== 'function') throw new Error('onActivate missing');\nconsole.log('${m.id} lifecycle exports OK');\n`,
    readme: m => `# ${m.name}\n\n${m.description}\n\nStatus: generated proposal. Validate before registration.\n`
  },

  ui_panel: {
    name: 'UI Panel Plugin',
    description: 'Registers a small AXIOM UI panel.',
    default_capabilities: ['ui-panel', 'event-subscribe'],
    default_permissions: { storage: { namespaces: ['plugin-local'] }, ui: { surfaces: ['panel'] } },
    entry_file: m => `export async function onLoad(ctx) {\n  ctx.log?.info?.('${m.id}: loaded');\n}\n\nexport async function onActivate(ctx) {\n  ctx.ui?.registerPanel?.('${m.id}', {\n    title: '${m.name}',\n    render() { return '<section><h3>${m.name}</h3><p>${m.description}</p></section>'; }\n  });\n}\n\nexport async function onDeactivate(ctx) {\n  ctx.ui?.removePanel?.('${m.id}');\n}\n\nexport async function onUnload(ctx) {\n  ctx.ui?.removePanel?.('${m.id}');\n}\n`,
    test_file: m => `import * as plugin from '../src/index.js';\nif (typeof plugin.onActivate !== 'function') throw new Error('onActivate missing');\nconsole.log('${m.id} UI panel exports OK');\n`,
    readme: m => `# ${m.name}\n\nUI panel plugin for AXIOM.\n`
  },

  mcp_tool: {
    name: 'MCP Tool Plugin',
    description: 'Exposes one small MCP tool through AXIOM.',
    default_capabilities: ['mcp-tool-expose', 'event-subscribe'],
    default_permissions: { mcp: { expose_tools: true }, storage: { namespaces: ['plugin-local'] } },
    entry_file: m => `export const tools = [{\n  name: '${m.id}_ping',\n  description: 'Health check tool for ${m.name}',\n  input_schema: { type: 'object', properties: {} },\n  async handler() { return { ok: true, plugin_id: '${m.id}' }; }\n}];\n\nexport async function onLoad(ctx) {\n  ctx.log?.info?.('${m.id}: loaded');\n}\n\nexport async function onActivate(ctx) {\n  for (const tool of tools) ctx.mcp?.registerTool?.(tool);\n}\n\nexport async function onDeactivate(ctx) {\n  for (const tool of tools) ctx.mcp?.unregisterTool?.(tool.name);\n}\n\nexport async function onUnload(ctx) {\n  for (const tool of tools) ctx.mcp?.unregisterTool?.(tool.name);\n}\n`,
    test_file: m => `import { tools, onActivate } from '../src/index.js';\nif (!Array.isArray(tools) || !tools[0]?.input_schema) throw new Error('tool schema missing');\nif (typeof onActivate !== 'function') throw new Error('onActivate missing');\nconsole.log('${m.id} MCP tool exports OK');\n`,
    readme: m => `# ${m.name}\n\nMCP tool plugin for AXIOM.\n`
  },

  editor: {
    name: 'Editor Capability Plugin',
    description: 'Adds a bounded editor command/capability.',
    default_capabilities: ['ui-command-palette', 'event-subscribe'],
    default_permissions: { editor: { commands: ['register'] }, storage: { namespaces: ['plugin-local'] } },
    entry_file: m => `export async function onLoad(ctx) {\n  ctx.log?.info?.('${m.id}: loaded');\n}\n\nexport async function onActivate(ctx) {\n  ctx.commands?.register?.('${m.id}.run', async () => ({ ok: true, plugin_id: '${m.id}' }));\n}\n\nexport async function onDeactivate(ctx) {\n  ctx.commands?.unregister?.('${m.id}.run');\n}\n\nexport async function onUnload(ctx) {\n  ctx.commands?.unregister?.('${m.id}.run');\n}\n`,
    test_file: m => `import * as plugin from '../src/index.js';\nif (typeof plugin.onActivate !== 'function') throw new Error('onActivate missing');\nconsole.log('${m.id} editor plugin exports OK');\n`,
    readme: m => `# ${m.name}\n\nBounded editor capability plugin for AXIOM.\n`
  }
};

export function templateForCapabilityGap(gap = '') {
  const text = String(gap).toLowerCase();
  if (text.includes('mcp') || text.includes('tool') || text.includes('api')) return 'mcp_tool';
  if (text.includes('panel') || text.includes('ui') || text.includes('sidebar')) return 'ui_panel';
  if (text.includes('command') || text.includes('editor') || text.includes('shortcut')) return 'editor';
  return 'base';
}
