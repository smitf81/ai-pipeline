import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = mkdtempSync(join(tmpdir(), 'axiom-plugin-builder-test-'));
process.env.AXIOM_PLUGIN_BUILDER_HOME = home;

const builder = await import('../src/builder/index.js');

const create = await builder.axiom_plugin_create({ request_id: 'test-create', name: 'Git Status Bar', description: 'Shows current git branch and workspace status in the AXIOM status bar.', template: 'ui_panel' });
assert.equal(create.ok, true);
assert.equal(create.status, 'generated');

const blockedRegister = await builder.axiom_plugin_register({ request_id: 'test-bad-register', plugin_id: create.plugin_id });
assert.equal(blockedRegister.ok, false);
assert.equal(blockedRegister.errors[0].code, 'NOT_PACKAGED');

const validate = await builder.axiom_plugin_validate({ request_id: 'test-validate', plugin_id: create.plugin_id });
assert.equal(validate.ok, true);
assert.equal(validate.status, 'validated');

const pack = await builder.axiom_plugin_package({ request_id: 'test-package', plugin_id: create.plugin_id });
assert.equal(pack.ok, true);
assert.equal(pack.status, 'packaged');
assert.ok(pack.result.bundle_path.endsWith('.axpkg'));

const register = await builder.axiom_plugin_register({ request_id: 'test-register', plugin_id: create.plugin_id, activate: false });
assert.equal(register.ok, true);
assert.equal(register.status, 'registered');
assert.equal(register.result.active, false);
assert.ok(register.receipt.checksum);

const blockedActivateRegister = await builder.axiom_plugin_register({ request_id: 'test-register-activate-blocked', plugin_id: create.plugin_id, activate: true });
assert.equal(blockedActivateRegister.ok, false);
assert.equal(blockedActivateRegister.errors[0].code, 'NOT_PACKAGED');

const inspect = await builder.axiom_plugin_inspect({ plugin_id: create.plugin_id, include_files: true });
assert.equal(inspect.ok, true);
assert.equal(inspect.result.manifest.lifecycle.status, 'registered');
assert.ok(inspect.result.files['src/index.js'].includes('onActivate'));

const gap = await builder.axiom_plugin_create_from_gap({ request_id: 'test-gap', capability_gap: 'AXIOM needs a missing MCP tool bridge for viewport camera controls', name: 'Viewport Camera MCP Bridge' });
assert.equal(gap.ok, true);
assert.equal(gap.result.manifest.provenance.generated_from, 'capability_gap');
assert.equal(gap.result.manifest.provenance.template_used, 'mcp_tool');

const unsupportedGap = await builder.axiom_plugin_create_from_gap({
  request_id: 'test-unsupported-gap',
  capability_gap: 'AXIOM needs a mesh import plugin for glb and fbx files',
  name: 'Mesh Import Plugin'
});
assert.equal(unsupportedGap.ok, false);
assert.equal(unsupportedGap.errors[0].code, 'UNSUPPORTED_IMPLEMENTATION_GAP');


const impl = await builder.axiom_plugin_generate_patch({
  request_id: 'test-implementation-patch',
  plugin_id: 'viewport-navigation-impl',
  name: 'Viewport Navigation Impl',
  capability_gap: 'AXIOM viewport navigation needs middle mouse orbit, WASD movement while middle mouse is held, and F focus.',
  target_area: 'editor.viewport',
  existing_context: {
    known_functions: ['SceneManager', 'focusSelected'],
    constraints: ['do not break object selection', 'do not patch core files']
  }
});
assert.equal(impl.ok, true);
assert.equal(impl.status, 'generated');
assert.ok(impl.result.generated_files.includes('integration-contract.json'));
assert.ok(impl.result.implementation.required_runtime_apis.includes('scene.getCamera'));

const implValidate = await builder.axiom_plugin_validate({ request_id: 'test-implementation-validate', plugin_id: impl.plugin_id });
assert.equal(implValidate.ok, true);
assert.equal(implValidate.status, 'validated');
assert.equal(implValidate.validation.rule_count, 26);

const implInspect = await builder.axiom_plugin_inspect({ plugin_id: impl.plugin_id, include_files: true });
assert.ok(implInspect.result.files['src/index.js'].includes('installViewportNavigation'));
assert.ok(implInspect.result.files['src/index.js'].includes('missing_runtime_api'));

const slice = await builder.axiom_plugin_build_slice({
  request_id: 'test-build-slice',
  plugin_id: 'safe-write-project-file-smoke',
  name: 'Safe Write Project File Smoke',
  capability_gap: 'safe_write_project_file',
  target_area: 'mcp.project_file_write',
  template: 'mcp_tool',
  register: true
});
assert.equal(slice.ok, true);
assert.equal(slice.status, 'registered');
assert.equal(slice.result.landed, true);
assert.ok(slice.result.package.bundle_path.endsWith('.axpkg'));

const modelCandidate = await builder.axiom_plugin_build_from_candidate({
  request_id: 'test-model-candidate-build',
  plugin_id: 'model-candidate-mesh-plan',
  name: 'Model Candidate Mesh Plan',
  capability_gap: 'Create a mesh import planning MCP tool candidate',
  target_area: 'mcp.mesh_import_plan',
  template: 'mcp_tool',
  register: true,
  candidate: {
    manifest: {
      description: 'Model-generated MCP tool proposal that prepares mesh import requests for later runtime integration.',
      capabilities: ['mcp-tool-expose'],
      permissions: { mcp: { expose_tools: true } },
      mcp_tools: [{
        name: 'mesh_import_plan',
        description: 'Return a guarded mesh import plan for a local asset path.',
        input_schema: {
          type: 'object',
          required: ['asset_path'],
          properties: { asset_path: { type: 'string' }, import_mode: { type: 'string' } }
        }
      }],
      lifecycle_hooks: { on_load: 'onLoad', on_activate: 'onActivate', on_deactivate: 'onDeactivate', on_unload: 'onUnload' },
      event_subscriptions: [],
      ui_surfaces: [],
      axiom_runtime: { min_version: '1.0.0', apis: [] },
      safety: { may_modify_core: false, sandboxed: true, timeout_ms: 30000 },
      compatibility: { os: ['any'], node_version: '>=18' }
    },
    files: {
      'src/index.js': `export function createMeshImportPlanTool() {
  return {
    name: 'mesh_import_plan',
    description: 'Return a guarded mesh import plan for a local asset path.',
    inputSchema: {
      type: 'object',
      required: ['asset_path'],
      properties: { asset_path: { type: 'string' }, import_mode: { type: 'string' } }
    },
    async handler(args = {}) {
      const assetPath = String(args.asset_path || '').trim();
      if (!assetPath) return { ok: false, reason: 'asset_path_required' };
      return {
        ok: true,
        applied: false,
        import_mode: args.import_mode || 'link',
        asset_path: assetPath,
        next_step: 'Runtime mesh loader must consume this plan and create scene objects.'
      };
    }
  };
}

export const tools = [createMeshImportPlanTool()];
export async function onLoad(ctx) { ctx?.log?.info?.('model-candidate-mesh-plan loaded'); }
export async function onActivate(ctx) {
  for (const tool of tools) ctx?.mcp?.registerTool?.(tool);
  return { ok: true, registered_tools: tools.map(tool => tool.name) };
}
export async function onDeactivate(ctx) {
  for (const tool of tools) ctx?.mcp?.unregisterTool?.(tool.name);
  return { ok: true };
}
export async function onUnload(ctx) { return onDeactivate(ctx); }
`,
      'tests/plugin.test.js': `import { createMeshImportPlanTool, onActivate } from '../src/index.js';
const tool = createMeshImportPlanTool();
if (tool.name !== 'mesh_import_plan') throw new Error('tool name mismatch');
const missing = await tool.handler({});
if (missing.ok !== false || missing.reason !== 'asset_path_required') throw new Error('missing asset guard failed');
const planned = await tool.handler({ asset_path: 'assets/model.glb' });
if (!planned.ok || planned.applied !== false) throw new Error('mesh import plan failed');
const registered = [];
await onActivate({ mcp: { registerTool: tool => registered.push(tool.name) } });
if (!registered.includes('mesh_import_plan')) throw new Error('tool registration failed');
`,
      'README.md': '# Model Candidate Mesh Plan\n\nModel-generated MCP tool proposal for planning mesh imports before runtime loader integration.\n'
    }
  }
});
assert.equal(modelCandidate.ok, true);
assert.equal(modelCandidate.status, 'registered');
assert.equal(modelCandidate.result.landed, true);

const boundedRuntimeCandidate = await builder.axiom_plugin_model_build_slice({
  request_id: 'test-bounded-runtime-candidate',
  plugin_id: 'acquired-mapforge-document-report',
  name: 'Acquired Map Forge Document Report',
  capability_gap: 'mapforge.document.report: report the canonical active map and revision',
  original_request: 'Report the active Map Forge map and revision.',
  target_area: 'editor.runtime_plugin',
  template: 'mcp_tool',
  register: true,
  acquisition_mode: 'bounded_runtime_tool',
  runtime_contract: {
    contract: 'axiom.runtime-plugin-authoring.v1',
    apis: [{ id: 'mapforge.describeTerrain', mode: 'read' }]
  },
  model_candidate: {
    manifest: {
      description: 'Bounded runtime MCP tool that reports the canonical active Map Forge document and revision.',
      capabilities: ['mcp-tool-expose'],
      permissions: { mcp: { expose_tools: true } },
      mcp_tools: [{
        name: 'mapforge_document_report',
        description: 'Report the canonical active Map Forge map id and revision.',
        input_schema: { type: 'object', additionalProperties: false, properties: {} }
      }],
      lifecycle_hooks: { on_load: 'onLoad', on_activate: 'onActivate', on_deactivate: 'onDeactivate', on_unload: 'onUnload' },
      event_subscriptions: [],
      ui_surfaces: [],
      axiom_runtime: { min_version: '1.0.0', apis: ['mapforge.describeTerrain'] },
      safety: { may_modify_core: false, sandboxed: true, timeout_ms: 30000 },
      compatibility: { os: ['any'], node_version: '>=18' },
      implementation: { required_runtime_apis: ['mapforge.describeTerrain'] }
    },
    files: {
      'src/index.js': `let runtimeContext = null;
export function installMapForgeDocumentReport(ctx) {
  if (!ctx || !ctx.mapforge || typeof ctx.mapforge.describeTerrain !== 'function') return { ok: false, reason: 'missing_runtime_api', api: 'mapforge.describeTerrain' };
  runtimeContext = ctx;
  return { ok: true };
}
export function uninstallMapForgeDocumentReport() { runtimeContext = null; return { ok: true }; }
export const tools = [{
  name: 'mapforge_document_report',
  description: 'Report the canonical active Map Forge document id and revision.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  async handler() {
    if (!runtimeContext) return { ok: false, applied: false, reason: 'missing_runtime_api' };
    const terrain = runtimeContext.mapforge.describeTerrain();
    return { ok: !!terrain, applied: false, contract: terrain?.contract || null, mapId: terrain?.mapId || null, revision: terrain?.revision ?? null };
  }
}];
export async function onLoad(ctx) { return installMapForgeDocumentReport(ctx); }
export async function onActivate(ctx) {
  const installed = installMapForgeDocumentReport(ctx);
  if (!installed.ok) return installed;
  for (const tool of tools) ctx.mcp.registerTool(tool);
  return { ok: true, registered_tools: tools.map(tool => tool.name) };
}
export async function onDeactivate(ctx) {
  for (const tool of tools) ctx.mcp.unregisterTool(tool.name);
  return uninstallMapForgeDocumentReport();
}
export async function onUnload(ctx) { return onDeactivate(ctx); }
`,
      'tests/plugin.test.js': `import { tools } from '../src/index.js';
if (tools.length !== 1 || tools[0].name !== 'mapforge_document_report') throw new Error('tool contract mismatch');
`,
      'README.md': '# Map Forge Document Report\n\nBounded runtime tool for reporting the active canonical Map Forge document.\n'
    },
    integration_contract: {
      contract: 'axiom.runtime-plugin-integration.v1',
      required_runtime_apis: ['mapforge.describeTerrain'],
      activation: 'explicit_runtime_activation_and_callable_tool_verification'
    }
  }
});
assert.equal(boundedRuntimeCandidate.ok, true);
assert.equal(boundedRuntimeCandidate.status, 'registered');
const boundedInspect = await builder.axiom_plugin_inspect({ plugin_id: boundedRuntimeCandidate.plugin_id, include_files: true });
assert.equal(boundedInspect.result.manifest.implementation.implementation_kind, 'bounded_runtime_mcp_tool');
assert.deepEqual(boundedInspect.result.manifest.implementation.required_runtime_apis, ['mapforge.describeTerrain']);
assert.equal(boundedInspect.result.manifest.mcp_tools.length, 1);
assert.ok(boundedInspect.result.files['src/index.js'].includes('ctx.mcp.registerTool'));

const failedCandidate = await builder.axiom_plugin_build_from_candidate({
  request_id: 'test-model-candidate-validation-feedback',
  plugin_id: 'bad-model-candidate',
  name: 'Bad Model Candidate',
  capability_gap: 'prove failed model candidates return retry feedback',
  register: true,
  candidate: {
    manifest: {
      description: 'Invalid model candidate missing required lifecycle exports.',
      capabilities: ['mcp-tool-expose'],
      permissions: { mcp: { expose_tools: true } },
      mcp_tools: [],
      lifecycle_hooks: { on_load: 'onLoad', on_activate: 'onActivate', on_deactivate: 'onDeactivate', on_unload: 'onUnload' },
      event_subscriptions: [],
      ui_surfaces: [],
      axiom_runtime: { min_version: '1.0.0', apis: [] },
      safety: { may_modify_core: false, sandboxed: true, timeout_ms: 30000 },
      compatibility: { os: ['any'], node_version: '>=18' }
    },
    files: {
      'src/index.js': 'export async function onLoad() { return { ok: true }; }\n',
      'README.md': '# Bad Model Candidate\n'
    }
  }
});
assert.equal(failedCandidate.ok, false);
assert.equal(failedCandidate.status, 'rejected');
assert.ok(failedCandidate.validation.errors.some(error => error.rule === 'ENTRYPOINT_EXPORTS_LIFECYCLE'));
assert.ok(failedCandidate.result.retry_prompt.includes('Fix these validation failures'));

console.log('AXIOM Plugin Builder smoke test passed');
rmSync(home, { recursive: true, force: true });
