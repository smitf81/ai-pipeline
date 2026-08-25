import { randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { PLUGIN_STORE, VALIDATOR_VERSION, SCHEMA_VERSION } from '../paths.js';
import { PluginValidator } from '../validator.js';
import { PluginPackager } from '../packager.js';
import { PluginRegistry } from '../registry.js';
import { TEMPLATES, templateForCapabilityGap } from './templates.js';
import { classifyImplementationGap, viewportNavigationImplementation, safeWriteProjectFileImplementation } from './implementation-generators.js';

function now() { return new Date().toISOString(); }
function idFromName(name) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || `plugin-${Date.now()}`; }
function pluginDir(id) { return join(PLUGIN_STORE, id); }
function manifestPath(id) { return join(pluginDir(id), 'manifest.json'); }
function lifecyclePath(id) { return join(pluginDir(id), 'lifecycle.json'); }
function loadJson(path, fallback) { if (!existsSync(path)) return fallback; return JSON.parse(readFileSync(path, 'utf8')); }
function saveManifest(id, manifest) { mkdirSync(pluginDir(id), { recursive: true }); writeFileSync(manifestPath(id), JSON.stringify(manifest, null, 2)); }
function loadManifest(id) { return loadJson(manifestPath(id), null); }
function lifecycle(id) { return loadJson(lifecyclePath(id), []); }
function appendLifecycle(id, entry) { const log = lifecycle(id); log.push({ ...entry, timestamp: now() }); writeFileSync(lifecyclePath(id), JSON.stringify(log, null, 2)); }
function checksumManifest(manifest) { const stable = { ...manifest, validation_status: { ...manifest.validation_status, checksum: undefined } }; return createHash('sha256').update(JSON.stringify(stable)).digest('hex'); }

function receipt(plugin_id, operation, metadata = {}) {
  const payload = { receipt_id: `rcpt_${randomUUID()}`, plugin_id, operation, timestamp: now(), authorized_by: 'axiom-plugin-builder', metadata };
  payload.checksum = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return payload;
}

function response(tool, o = {}) {
  return { ok: o.ok ?? true, tool, request_id: o.request_id || randomUUID(), plugin_id: o.plugin_id || null, status: o.status || null, result: o.result || {}, validation: o.validation || { ran: false, passed: null }, errors: o.errors || [], warnings: o.warnings || [], receipt: o.receipt || null };
}
function fail(tool, request_id, plugin_id, errors, warnings = []) { return response(tool, { ok: false, request_id, plugin_id, status: 'error', validation: { ran: false, passed: false }, errors, warnings }); }

function safeCandidatePath(relativePath = '') {
  const raw = String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '').trim();
  const normalised = normalize(raw).replaceAll('\\', '/');
  if (!normalised || normalised.startsWith('../') || normalised === '..' || normalised.includes('/../')) return null;
  if (normalised === 'manifest.json' || normalised === 'lifecycle.json') return null;
  if (!/\.(js|mjs|ts|json|md|txt)$/i.test(normalised)) return null;
  return normalised;
}

function parseModelJson(text = '') {
  const raw = String(text || '').trim();
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]
    || raw.slice(Math.max(0, raw.indexOf('{')), raw.lastIndexOf('}') + 1);
  return JSON.parse(candidate || raw);
}

function retryPromptForCandidate({ capability_gap, target_area, validation }) {
  const errors = (validation?.errors || [])
    .map(error => `- ${error.rule || error.code || 'VALIDATION'} ${error.field || ''}: ${error.message}`)
    .join('\n') || '- Unknown validation failure.';
  return [
    'Regenerate the AXIOM plugin candidate as JSON only.',
    `Capability gap: ${capability_gap || 'unknown'}`,
    `Target area: ${target_area || 'unknown'}`,
    'Fix these validation failures:',
    errors,
    'Return shape: {"manifest": {...}, "files": {"src/index.js": "...", "tests/plugin.test.js": "...", "README.md": "..."}}.',
    'Do not include markdown fences or prose.'
  ].join('\n');
}

function mergeCandidateManifest(base, patch = {}, input = {}) {
  const manifest = { ...base };
  const allowedObjectFields = [
    'permissions',
    'lifecycle_hooks',
    'axiom_runtime',
    'safety',
    'compatibility',
    'implementation'
  ];
  const allowedArrayFields = [
    'capabilities',
    'mcp_tools',
    'event_subscriptions',
    'ui_surfaces'
  ];

  if (patch.name || input.name) manifest.name = String(patch.name || input.name);
  if (patch.description || input.description || input.capability_gap) {
    manifest.description = String(patch.description || input.description || `Model-generated plugin proposal for: ${input.capability_gap}`);
  }
  if (patch.entrypoint) manifest.entrypoint = String(patch.entrypoint);
  if (patch.version && /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(String(patch.version))) manifest.version = String(patch.version);

  for (const field of allowedArrayFields) {
    if (Array.isArray(patch[field])) manifest[field] = patch[field];
  }
  for (const field of allowedObjectFields) {
    if (patch[field] && typeof patch[field] === 'object' && !Array.isArray(patch[field])) manifest[field] = patch[field];
  }

  manifest.author = { name: 'AXIOM Local Model Agent', source: 'axiom-agent' };
  manifest.provenance = {
    ...(manifest.provenance || {}),
    request_id: input.request_id || manifest.provenance?.request_id || randomUUID(),
    generated_by: 'axiom-local-model-agent',
    template_used: input.template || manifest.provenance?.template_used || 'model_candidate',
    generated_from: input.capability_gap ? 'capability_gap' : manifest.provenance?.generated_from || 'model_candidate'
  };
  manifest.lifecycle = {
    ...(manifest.lifecycle || {}),
    status: 'generated',
    model_candidate_generated_at: now()
  };
  manifest.validation_status = {
    passed: false,
    validator_version: VALIDATOR_VERSION,
    schema_version: SCHEMA_VERSION,
    errors: [],
    warnings: [],
    checksum: null
  };
  if (input.acquisition_mode === 'bounded_runtime_tool') {
    const runtimeContract = input.runtime_contract && typeof input.runtime_contract === 'object'
      ? input.runtime_contract
      : {};
    const offeredRuntimeApis = Array.isArray(runtimeContract.apis)
      ? runtimeContract.apis.map(api => String(api?.id || '')).filter(Boolean)
      : [];
    const requestedRuntimeApis = Array.isArray(patch.implementation?.required_runtime_apis)
      ? patch.implementation.required_runtime_apis.map(String).filter(Boolean)
      : Array.isArray(patch.axiom_runtime?.apis)
        ? patch.axiom_runtime.apis.map(String).filter(Boolean)
        : [];
    manifest.capabilities = Array.from(new Set([...(manifest.capabilities || []), 'mcp-tool-expose']));
    manifest.permissions = {
      ...(manifest.permissions || {}),
      mcp: { ...(manifest.permissions?.mcp || {}), expose_tools: true }
    };
    manifest.axiom_runtime = {
      ...(manifest.axiom_runtime || {}),
      min_version: manifest.axiom_runtime?.min_version || '1.0.0',
      apis: requestedRuntimeApis
    };
    manifest.safety = {
      ...(manifest.safety || {}),
      may_modify_core: false,
      sandboxed: true,
      timeout_ms: Math.min(Number(manifest.safety?.timeout_ms || 30000), 30000)
    };
    manifest.implementation = {
      ...(manifest.implementation || {}),
      kind: 'implementation_bearing_plugin_proposal',
      implementation_kind: 'bounded_runtime_mcp_tool',
      target_area: input.target_area || 'editor.runtime_plugin',
      capability_gap: input.capability_gap || manifest.implementation?.capability_gap || '',
      required_runtime_apis: requestedRuntimeApis,
      available_runtime_apis: offeredRuntimeApis,
      runtime_contract: runtimeContract.contract || null,
      integration_contract_path: 'integration-contract.json',
      proposal_only: true
    };
    manifest.provenance = {
      ...(manifest.provenance || {}),
      acquisition_mode: 'bounded_runtime_tool',
      original_request: String(input.original_request || '').slice(0, 2000)
    };
  }
  return manifest;
}

function boundedRuntimeToolSpecSchema(input = {}) {
  const runtimeApis = Array.isArray(input.runtime_contract?.apis)
    ? input.runtime_contract.apis.map(api => String(api?.id || '')).filter(Boolean)
    : [];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['tool'],
    properties: {
      tool: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'input_schema', 'runtime_api', 'call_with', 'result_mode'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          input_schema: { type: 'object' },
          runtime_api: { type: 'string', enum: runtimeApis },
          call_with: { type: 'string', enum: ['none', 'input'] },
          result_mode: { type: 'string', enum: ['return_data', 'return_receipt'] }
        }
      }
    }
  };
}

function boundedToolName(value = '') {
  const id = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(id)) throw new Error(`MODEL_TOOL_SPEC_INVALID: invalid tool name ${value}`);
  return id;
}

function pascalName(value = '') {
  return String(value || '').split(/[^a-zA-Z0-9]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join('') || 'AcquiredTool';
}

function compileBoundedRuntimeToolCandidate(input = {}, specification = {}) {
  const spec = specification?.tool;
  if (!spec || typeof spec !== 'object') throw new Error('MODEL_TOOL_SPEC_INVALID: tool object missing');
  const offered = new Map((input.runtime_contract?.apis || []).map(api => [String(api?.id || ''), api]));
  const runtimeApi = String(spec.runtime_api || '');
  const apiContract = offered.get(runtimeApi);
  if (!apiContract) throw new Error(`MODEL_TOOL_SPEC_INVALID: runtime API not offered: ${runtimeApi}`);
  const apiParts = runtimeApi.split('.');
  if (!apiParts.length || apiParts.some(part => !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(part))) {
    throw new Error(`MODEL_TOOL_SPEC_INVALID: runtime API path invalid: ${runtimeApi}`);
  }
  const name = boundedToolName(spec.name);
  const description = String(spec.description || '').trim().slice(0, 500);
  if (description.length < 10) throw new Error('MODEL_TOOL_SPEC_INVALID: tool description too short');
  const inputSchema = spec.input_schema && typeof spec.input_schema === 'object' && !Array.isArray(spec.input_schema)
    ? { ...spec.input_schema, type: 'object' }
    : { type: 'object', properties: {} };
  const callWith = spec.call_with === 'input' ? 'input' : 'none';
  const resultMode = spec.result_mode === 'return_receipt' ? 'return_receipt' : 'return_data';
  const hostAccess = `ctx?.${apiParts.join('?.')}`;
  const runtimeAccess = `runtimeContext.${apiParts.join('.')}`;
  const callExpression = `${runtimeAccess}(${callWith === 'input' ? 'args' : ''})`;
  const functionName = pascalName(name);
  const mutation = apiContract.mode === 'mutation';
  const resultField = resultMode === 'return_receipt' ? 'receipt' : 'data';
  const source = `let runtimeContext = null;

export const tools = [{
  name: ${JSON.stringify(name)},
  description: ${JSON.stringify(description)},
  inputSchema: ${JSON.stringify(inputSchema, null, 2)},
  async handler(args = {}) {
    if (!runtimeContext) return { ok: false, applied: false, reason: 'missing_runtime_api' };
    const result = await ${callExpression};
    const ok = ${apiContract.mode === 'read'
      ? 'result !== null && result !== undefined'
      : 'result !== null && result !== undefined && result?.ok !== false'};
    const applied = ${mutation ? "result?.applied === true && (result?.verification?.ok === true || result?.ok === true)" : 'false'};
    return { ok, applied, runtimeApi: ${JSON.stringify(runtimeApi)}, ${resultField}: result };
  }
}];

export function install${functionName}(ctx) {
  if (!ctx || typeof ${hostAccess} !== 'function') return { ok: false, reason: 'missing_runtime_api', api: ${JSON.stringify(runtimeApi)} };
  runtimeContext = ctx;
  return { ok: true };
}

export function uninstall${functionName}() {
  runtimeContext = null;
  return { ok: true };
}

export async function onLoad(ctx) { return install${functionName}(ctx); }

export async function onActivate(ctx) {
  const installed = install${functionName}(ctx);
  if (!installed.ok) return installed;
  for (const tool of tools) ctx.mcp.registerTool(tool);
  return { ok: true, registered_tools: tools.map(tool => tool.name) };
}

export async function onDeactivate(ctx) {
  for (const tool of tools) ctx.mcp.unregisterTool(tool.name);
  return uninstall${functionName}();
}

export async function onUnload(ctx) { return onDeactivate(ctx); }
`;
  const test = `import assert from 'node:assert/strict';
import { install${functionName}, tools } from '../src/index.js';
assert.equal(tools.length, 1);
assert.equal(tools[0].name, ${JSON.stringify(name)});
assert.equal(tools[0].inputSchema.type, 'object');
assert.equal(install${functionName}(null).reason, 'missing_runtime_api');
console.log(${JSON.stringify(`${name} plugin contract passed`)});
`;
  return {
    manifest: {
      name: input.name || `Acquired ${name}`,
      description,
      version: '0.1.0',
      entrypoint: 'src/index.js',
      capabilities: ['mcp-tool-expose'],
      permissions: { mcp: { expose_tools: true } },
      mcp_tools: [{ name, description, input_schema: inputSchema }],
      lifecycle_hooks: { on_load: 'onLoad', on_activate: 'onActivate', on_deactivate: 'onDeactivate', on_unload: 'onUnload' },
      event_subscriptions: [],
      ui_surfaces: [],
      axiom_runtime: { min_version: '1.0.0', apis: [runtimeApi] },
      safety: { may_modify_core: false, sandboxed: true, timeout_ms: 30000 },
      compatibility: { os: ['any'], node_version: '>=18' },
      implementation: { required_runtime_apis: [runtimeApi] }
    },
    files: {
      'src/index.js': source,
      'tests/plugin.test.js': test,
      'README.md': `# ${input.name || name}\n\n${description}\n\nGenerated from a bounded local-model tool specification. Runtime API: \`${runtimeApi}\`.\n`
    },
    integration_contract: {
      contract: 'axiom.runtime-plugin-integration.v1',
      required_runtime_apis: [runtimeApi],
      activation: 'explicit_runtime_activation_and_callable_tool_verification',
      source: 'compiled_from_model_tool_spec'
    },
    tool_spec: { ...spec, name, description, input_schema: inputSchema, mutation: apiContract.mode === 'mutation' }
  };
}

function modelCandidatePrompt(input = {}, repair = null) {
  const bounded = input.acquisition_mode === 'bounded_runtime_tool';
  const runtimeContract = input.runtime_contract && typeof input.runtime_contract === 'object'
    ? input.runtime_contract
    : null;
  if (bounded) {
    const prompt = [
      'You are AXIOM local capability designer.',
      'Design one bounded MCP tool as strict JSON only. Do not write JavaScript, manifests, tests, markdown, or prose.',
      'The governed Plugin Builder compiles your semantic tool specification into the canonical host wrapper.',
      `Capability gap: ${input.capability_gap || ''}`,
      `Original user request: ${input.original_request || ''}`,
      'Choose exactly one runtime_api from the offered runtime contract.',
      'Use call_with none when the runtime API needs no arguments; otherwise use input.',
      'Use return_data for reads/projections and return_receipt for mutations.',
      'Tool name must be lowercase snake_case and describe the reusable ability, not this proof run.',
      `RUNTIME CONTRACT (${runtimeContract?.contract || 'missing'}):`,
      JSON.stringify(runtimeContract || {}, null, 2),
      'Return exactly: {"tool":{"name":"...","description":"...","input_schema":{"type":"object","properties":{}},"runtime_api":"one.offered.api","call_with":"none|input","result_mode":"return_data|return_receipt"}}'
    ];
    if (repair) {
      prompt.push(
        'This is the one permitted focused repair. Preserve the intended capability and correct the exact failure.',
        'FAILURE:',
        String(repair.feedback || ''),
        'PREVIOUS TOOL SPEC:',
        JSON.stringify(repair.candidate?.tool_spec || repair.candidate || {}).slice(0, 6000)
      );
    }
    return prompt.join('\n');
  }
  const base = [
    'You are AXIOM local implementation agent.',
    'Generate one concrete AXIOM plugin candidate as strict JSON only. No prose. No markdown fences.',
    'All file contents are JSON strings. Do not use JavaScript template literals or raw backtick strings.',
    `Plugin id: ${input.plugin_id || '(derive from name)'}`,
    `Name: ${input.name || input.plugin_id || 'AXIOM Plugin'}`,
    `Capability gap: ${input.capability_gap || ''}`,
    `Original user request: ${input.original_request || ''}`,
    `Target area: ${input.target_area || ''}`,
    'The candidate is a proposal until the host validates, packages, registers, explicitly activates, and behaviorally verifies it.',
    'Required files: src/index.js, tests/plugin.test.js, README.md.',
    'Keep src/index.js under 140 lines and tests under 60 lines. Prefer the smallest implementation that proves the one tool works.',
    'Entrypoint must export onLoad, onActivate, onDeactivate, onUnload.',
    'Never access window, document, globalThis, fetch, XMLHttpRequest, WebSocket, localStorage, indexedDB, navigator, child_process, eval, Function, or dynamic import.',
    'Never patch AXIOM core. Use only runtime APIs explicitly offered below.'
  ];
  base.push(
    'The plugin must pass AXIOM PluginValidator.',
    'Return exactly: {"manifest":{"description":"...","capabilities":["..."],"permissions":{},"mcp_tools":[],"lifecycle_hooks":{"on_load":"onLoad","on_activate":"onActivate","on_deactivate":"onDeactivate","on_unload":"onUnload"},"event_subscriptions":[],"ui_surfaces":[],"axiom_runtime":{"min_version":"1.0.0","apis":[]},"safety":{"may_modify_core":false,"sandboxed":true,"timeout_ms":30000},"compatibility":{"os":["any"],"node_version":">=18"}},"files":{"src/index.js":"...","tests/plugin.test.js":"...","README.md":"..."}}'
  );
  if (repair) {
    base.push(
      'This is the one permitted focused repair. Preserve the capability and tool identity; correct only the failed contract.',
      'VALIDATION FEEDBACK:',
      String(repair.feedback || ''),
      'PREVIOUS CANDIDATE:',
      JSON.stringify(repair.candidate || {}).slice(0, 18000)
    );
  }
  return base.join('\n');
}

async function requestLocalModelCandidate(input = {}, repair = null) {
  if (typeof fetch !== 'function') {
    throw new Error('No fetch implementation is available for local model generation.');
  }
  const host = String(input.host || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = input.model || 'qwen3.5:9b';
  const timeoutMs = Math.max(1000, Math.min(Number(input.timeout_ms || input.timeoutMs || 90000), 300000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const bounded = input.acquisition_mode === 'bounded_runtime_tool';
  function materializeCandidate(text) {
    const parsed = parseModelJson(text);
    if (!bounded) return { candidate: parsed, tool_spec: null };
    return {
      candidate: compileBoundedRuntimeToolCandidate(input, parsed),
      tool_spec: parsed
    };
  }
  async function generateText(prompt) {
    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: bounded ? boundedRuntimeToolSpecSchema(input) : 'json',
        think: false,
        options: {
          num_ctx: bounded ? 8192 : 24576,
          num_predict: bounded ? 2048 : 8192,
          temperature: 0,
          seed: 42
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const payload = await response.json();
    return String(payload?.response || '').trim();
  }

  const prompt = modelCandidatePrompt(input, repair);
  try {
    const generatedText = await generateText(prompt);
    try {
      return {
        text: generatedText,
        ...materializeCandidate(generatedText),
        model,
        host,
        repair_attempted: Boolean(repair),
        repair_kind: repair ? 'validation' : null
      };
    } catch (parseError) {
      if (repair) throw parseError;
      const repairPrompt = [
        bounded
          ? 'Repair this AXIOM bounded tool specification into strict valid JSON only.'
          : 'Repair this AXIOM plugin candidate into strict valid JSON only.',
        bounded
          ? 'No markdown fences, prose, JavaScript, manifest, tests, or files.'
          : 'No markdown fences. No prose. No JavaScript template literals. Escape every newline inside file strings.',
        `JSON parse error: ${parseError.message}`,
        bounded
          ? 'Return exactly the one-tool semantic specification shape requested previously.'
          : 'Return the exact same candidate shape.',
        bounded ? 'Broken tool specification:' : 'Broken candidate:',
        generatedText.slice(0, 16000)
      ].join('\n');
      const repairedText = await generateText(repairPrompt);
      try {
        return {
          text: repairedText,
          ...materializeCandidate(repairedText),
          model,
          host,
          repair_attempted: true,
          repair_kind: 'json_parse',
          first_parse_error: parseError.message
        };
      } catch (repairParseError) {
        repairParseError.first_parse_error = parseError.message;
        repairParseError.raw_model_response_preview = repairedText.slice(0, 1200);
        throw repairParseError;
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

function looksImplementationBearingGap(text = '') {
  const t = String(text).toLowerCase();
  if (t.includes('mcp') || t.includes('tool') || t.includes('api bridge')) return false;
  return [
    'import', 'export', 'mesh', 'model', 'gltf', 'glb', 'fbx', 'obj',
    'geometry', 'vertex', 'uv', 'material', 'texture', 'viewport',
    'camera', 'navigation', 'runtime', 'loader', 'edit mode'
  ].some(token => t.includes(token));
}

export async function axiom_plugin_create(input = {}) {
  const { name, description, template = 'base', capabilities, permissions, author_source = 'axiom-agent', request_id } = input;
  if (!name || !description) return fail('axiom_plugin_create', request_id, null, [{ code: 'MISSING_REQUIRED', message: 'name and description are required', severity: 'error' }]);
  const plugin_id = idFromName(input.plugin_id || name);
  if (existsSync(pluginDir(plugin_id))) return fail('axiom_plugin_create', request_id, plugin_id, [{ code: 'PLUGIN_EXISTS', message: `${plugin_id} already exists`, severity: 'error' }]);
  const tpl = TEMPLATES[template] || TEMPLATES.base;
  const manifest = {
    id: plugin_id,
    name,
    version: '0.1.0',
    description,
    author: { name: author_source === 'human' ? 'Human Developer' : author_source === 'external' ? 'External Tool' : 'AXIOM Agent', source: author_source },
    entrypoint: 'src/index.js',
    capabilities: capabilities?.length ? capabilities : tpl.default_capabilities,
    permissions: permissions || tpl.default_permissions,
    mcp_tools: template === 'mcp_tool' ? [{ name: `${plugin_id}_ping`, description: `Health check for ${name}`, input_schema: { type: 'object', properties: {} } }] : [],
    lifecycle_hooks: { on_load: 'onLoad', on_activate: 'onActivate', on_deactivate: 'onDeactivate', on_unload: 'onUnload' },
    event_subscriptions: [],
    ui_surfaces: template === 'ui_panel' ? [{ id: `${plugin_id}.panel`, type: 'panel' }] : [],
    axiom_runtime: { min_version: '1.0.0', apis: [] },
    lifecycle: { status: 'generated', created_at: now() },
    safety: { may_modify_core: false, sandboxed: true, timeout_ms: 30000 },
    provenance: { request_id: request_id || randomUUID(), generated_by: 'axiom-plugin-builder', template_used: template, generated_from: input.capability_gap ? 'capability_gap' : 'direct_request' },
    compatibility: { os: ['any'], node_version: '>=18' },
    validation_status: { passed: false, validator_version: VALIDATOR_VERSION, schema_version: SCHEMA_VERSION, errors: [], warnings: [], checksum: null }
  };
  mkdirSync(join(pluginDir(plugin_id), 'src'), { recursive: true });
  mkdirSync(join(pluginDir(plugin_id), 'tests'), { recursive: true });
  saveManifest(plugin_id, manifest);
  writeFileSync(join(pluginDir(plugin_id), 'src/index.js'), tpl.entry_file(manifest));
  writeFileSync(join(pluginDir(plugin_id), 'tests/plugin.test.js'), tpl.test_file(manifest));
  writeFileSync(join(pluginDir(plugin_id), 'README.md'), tpl.readme(manifest));
  appendLifecycle(plugin_id, { event: 'created', status: 'generated', request_id, note: `Created from template ${template}` });
  return response('axiom_plugin_create', { request_id, plugin_id, status: 'generated', result: { manifest, files: ['manifest.json','src/index.js','tests/plugin.test.js','README.md'], note: 'Generated plugin is a proposal. Validate before package/register/activate.' }, warnings: ['Plugin is generated only; it is not active truth.'], receipt: receipt(plugin_id, 'create', { template }) });
}

export async function axiom_plugin_create_from_gap(input = {}) {
  const gap = input.capability_gap || input.description || '';
  const classification = classifyImplementationGap(input);
  const explicitTemplate = Boolean(input.template || input.allow_template_placeholder);
  if (classification.kind === 'unsupported' && looksImplementationBearingGap(gap) && !explicitTemplate) {
    return fail('axiom_plugin_create_from_gap', input.request_id, input.plugin_id || null, [
      {
        code: 'UNSUPPORTED_IMPLEMENTATION_GAP',
        message: 'This gap appears to require real implementation code, but no generator exists for it. Refusing to create a placeholder plugin that would not actually do the work.',
        severity: 'error',
        supported_generators: ['viewport_navigation', 'safe_write_project_file'],
        received: { capability_gap: gap }
      }
    ], ['Use axiom_plugin_generate_patch for supported implementation gaps, add a dedicated generator, or pass allow_template_placeholder=true only when a non-functional scaffold is explicitly desired.']);
  }
  const template = input.template || templateForCapabilityGap(gap);
  return axiom_plugin_create({ ...input, template, description: input.description || `Bridge missing AXIOM capability: ${gap}`, name: input.name || `Bridge ${template} gap`, capability_gap: gap });
}


export async function axiom_plugin_generate_patch(input = {}) {
  const {
    plugin_id: requestedPluginId,
    capability_gap = '',
    target_area = 'editor.viewport',
    existing_context = {},
    template = 'editor',
    name,
    request_id
  } = input;

  if (!capability_gap) {
    return fail('axiom_plugin_generate_patch', request_id, requestedPluginId || null, [
      { code: 'MISSING_REQUIRED', message: 'capability_gap is required', severity: 'error' }
    ]);
  }

  const classification = classifyImplementationGap({ capability_gap, target_area, existing_context, template });
  if (classification.kind === 'unsupported') {
    return fail('axiom_plugin_generate_patch', request_id, requestedPluginId || null, [
      {
        code: 'UNSUPPORTED_PATCH_TARGET',
        message: 'No implementation generator exists for this capability gap. Refusing to emit a misleading template plugin.',
        severity: 'error',
        supported_generators: ['viewport_navigation', 'safe_write_project_file'],
        received: { capability_gap, target_area }
      }
    ], ['Plugin Builder refused rather than generating unrelated template code. Add a dedicated generator for this gap.']);
  }

  const effectiveTargetArea = classification.target_area || target_area;
  const effectiveTemplate = classification.template || template;
  const defaultName = classification.kind === 'safe_write_project_file'
    ? 'safe_write_project_file'
    : 'Viewport Navigation Plugin';
  const plugin_id = requestedPluginId || idFromName(name || `${effectiveTargetArea}-patch`);
  let manifest = loadManifest(plugin_id);
  const created = !manifest;

  if (!manifest) {
    const createResult = await axiom_plugin_create({
      plugin_id,
      name: name || defaultName,
      description: `Implementation-bearing plugin proposal for: ${capability_gap}`,
      template: effectiveTemplate,
      author_source: input.author_source || 'axiom-agent',
      capability_gap,
      request_id
    });
    if (!createResult.ok) return createResult;
    manifest = loadManifest(plugin_id);
  }

  if (!manifest) {
    return fail('axiom_plugin_generate_patch', request_id, plugin_id, [
      { code: 'PLUGIN_CREATE_FAILED', message: `Unable to create or load plugin: ${plugin_id}`, severity: 'error' }
    ]);
  }

  if (manifest.lifecycle?.status && !['draft', 'generated', 'rejected'].includes(manifest.lifecycle.status)) {
    return fail('axiom_plugin_generate_patch', request_id, plugin_id, [
      { code: 'UNSAFE_LIFECYCLE_FOR_PATCH', message: `Implementation patch can only update draft/generated/rejected proposals. Current: ${manifest.lifecycle.status}`, severity: 'error' }
    ]);
  }

  const generated = classification.kind === 'safe_write_project_file'
    ? safeWriteProjectFileImplementation(manifest, input)
    : viewportNavigationImplementation(manifest, input);
  const dir = pluginDir(plugin_id);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });

  writeFileSync(join(dir, 'src/index.js'), generated.index);
  writeFileSync(join(dir, 'tests/plugin.test.js'), generated.test);
  writeFileSync(join(dir, 'README.md'), generated.readme);
  writeFileSync(join(dir, 'integration-contract.json'), JSON.stringify(generated.integrationContract, null, 2));

  manifest.description = manifest.description || `Implementation-bearing plugin proposal for: ${capability_gap}`;
  if (classification.kind === 'safe_write_project_file') {
    manifest.capabilities = ['mcp-tool-expose', 'project-file-patch'];
    manifest.permissions = {
      mcp: { expose_tools: true },
      filesystem: {
        project_root_only: true,
        modes: ['documentation', 'config_patch', 'core_patch'],
        dry_run_default: true
      }
    };
    manifest.event_subscriptions = [];
    manifest.ui_surfaces = [];
    manifest.mcp_tools = [{
      name: 'safe_write_project_file',
      description: 'Guarded project file writer/patcher with documentation, config_patch, and core_patch modes.',
      input_schema: {
        type: 'object',
        required: ['mode', 'target_path'],
        properties: {
          mode: { type: 'string', enum: ['documentation', 'config_patch', 'core_patch'] },
          target_path: { type: 'string' },
          content: { type: 'string' },
          expected_find: { type: 'string' },
          replacement: { type: 'string' },
          dry_run: { type: 'boolean', default: true }
        }
      }
    }];
    manifest.safety = { ...(manifest.safety || {}), may_modify_core: true, sandboxed: true, timeout_ms: 30000, proposal_only: true };
    manifest.provenance = { ...(manifest.provenance || {}), template_used: 'mcp_tool' };
  } else {
    manifest.capabilities = Array.from(new Set([...(manifest.capabilities || []), 'event-subscribe', 'ui-command-palette']));
    manifest.permissions = manifest.permissions || {};
    manifest.permissions.editor = manifest.permissions.editor || { commands: ['register'] };
    manifest.permissions.input = { mouse: true, keyboard: true, bounded_to: 'editor.viewport' };
  }
  manifest.axiom_runtime = { ...(manifest.axiom_runtime || { min_version: '1.0.0' }), apis: generated.requiredApis };
  manifest.implementation = {
    kind: 'implementation_bearing_plugin_proposal',
    target_area: effectiveTargetArea,
    implementation_kind: classification.kind,
    capability_gap,
    generated_files: ['src/index.js', 'tests/plugin.test.js', 'README.md', 'integration-contract.json'],
    required_runtime_apis: generated.requiredApis,
    integration_contract_path: 'integration-contract.json',
    existing_context,
    proposal_only: true
  };
  manifest.lifecycle.status = 'generated';
  manifest.lifecycle.implementation_generated_at = now();
  manifest.validation_status = { passed: false, validator_version: VALIDATOR_VERSION, schema_version: SCHEMA_VERSION, errors: [], warnings: [], checksum: null };
  saveManifest(plugin_id, manifest);
  appendLifecycle(plugin_id, { event: 'implementation_generated', status: 'generated', request_id, target_area: effectiveTargetArea, implementation_kind: classification.kind, created });

  return response('axiom_plugin_generate_patch', {
    request_id,
    plugin_id,
    status: 'generated',
    result: {
      manifest,
      generated_files: manifest.implementation.generated_files,
      implementation: manifest.implementation,
      integration_contract: generated.integrationContract,
      note: 'Generated implementation-bearing plugin remains proposal-only. Validate/package/register before any activation seam.'
    },
    warnings: [
      'Generated plugin does not modify AXIOM core files.',
      'Runtime activation still requires AXIOM to provide the declared plugin context APIs.'
    ],
    receipt: receipt(plugin_id, 'generate_patch', { target_area: effectiveTargetArea, implementation_kind: classification.kind, required_runtime_apis: generated.requiredApis })
  });
}

export async function axiom_plugin_validate(input = {}) {
  const { plugin_id, strict = true, request_id } = input;
  const manifest = loadManifest(plugin_id);
  if (!manifest) return fail('axiom_plugin_validate', request_id, plugin_id, [{ code: 'PLUGIN_NOT_FOUND', message: `No plugin found: ${plugin_id}`, severity: 'error' }]);
  const report = await new PluginValidator({ strict }).validate(manifest, pluginDir(plugin_id));
  manifest.validation_status = { passed: report.passed, validator_version: VALIDATOR_VERSION, schema_version: SCHEMA_VERSION, errors: report.errors, warnings: report.warnings, checksum: report.passed ? checksumManifest(manifest) : null };
  manifest.lifecycle.status = report.passed ? 'validated' : 'rejected';
  if (report.passed) manifest.lifecycle.validated_at = now();
  else manifest.lifecycle.rejected_at = now();
  saveManifest(plugin_id, manifest);
  appendLifecycle(plugin_id, { event: manifest.lifecycle.status, status: manifest.lifecycle.status, request_id, error_count: report.errors.length, warning_count: report.warnings.length });
  return response('axiom_plugin_validate', { ok: report.passed, request_id, plugin_id, status: manifest.lifecycle.status, result: { passed: report.passed, rule_count: report.rule_count }, validation: { ran: true, ...report }, errors: report.errors, warnings: report.warnings, receipt: receipt(plugin_id, 'validate', { passed: report.passed }) });
}

export async function axiom_plugin_package(input = {}) {
  const { plugin_id, include_source_maps = false, request_id } = input;
  const manifest = loadManifest(plugin_id);
  if (!manifest) return fail('axiom_plugin_package', request_id, plugin_id, [{ code: 'PLUGIN_NOT_FOUND', message: `No plugin found: ${plugin_id}`, severity: 'error' }]);
  if (manifest.lifecycle.status !== 'validated') return fail('axiom_plugin_package', request_id, plugin_id, [{ code: 'NOT_VALIDATED', message: `Plugin must be validated before packaging. Current: ${manifest.lifecycle.status}`, severity: 'error' }]);
  const bundle = await new PluginPackager().pack(manifest, pluginDir(plugin_id), { include_source_maps });
  manifest.lifecycle.status = 'packaged';
  manifest.lifecycle.packaged_at = now();
  manifest.lifecycle.bundle_path = bundle.path;
  saveManifest(plugin_id, manifest);
  appendLifecycle(plugin_id, { event: 'packaged', status: 'packaged', request_id, bundle_path: bundle.path });
  return response('axiom_plugin_package', { request_id, plugin_id, status: 'packaged', result: { bundle_path: bundle.path, bundle_size_bytes: bundle.size, checksum: bundle.checksum, file_count: bundle.file_count }, receipt: receipt(plugin_id, 'package', { bundle_path: bundle.path, checksum: bundle.checksum }) });
}

export async function axiom_plugin_build_slice(input = {}) {
  const {
    request_id,
    plugin_id,
    capability_gap,
    target_area,
    existing_context = {},
    name,
    template,
    register = true
  } = input;

  const generated = await axiom_plugin_generate_patch({
    request_id,
    plugin_id,
    capability_gap,
    target_area,
    existing_context,
    name,
    template
  });
  if (!generated.ok) return generated;

  const validate = await axiom_plugin_validate({ request_id, plugin_id: generated.plugin_id });
  if (!validate.ok) {
    return response('axiom_plugin_build_slice', {
      ok: false,
      request_id,
      plugin_id: generated.plugin_id,
      status: validate.status,
      result: { generated, validate },
      validation: validate.validation,
      errors: validate.errors,
      warnings: [...(generated.warnings || []), ...(validate.warnings || [])]
    });
  }

  const pack = await axiom_plugin_package({ request_id, plugin_id: generated.plugin_id });
  if (!pack.ok) {
    return response('axiom_plugin_build_slice', {
      ok: false,
      request_id,
      plugin_id: generated.plugin_id,
      status: pack.status,
      result: { generated, validate, pack },
      validation: validate.validation,
      errors: pack.errors,
      warnings: [...(generated.warnings || []), ...(validate.warnings || []), ...(pack.warnings || [])]
    });
  }

  let registered = null;
  if (register) {
    registered = await axiom_plugin_register({ request_id, plugin_id: generated.plugin_id, activate: false });
    if (!registered.ok) {
      return response('axiom_plugin_build_slice', {
        ok: false,
        request_id,
        plugin_id: generated.plugin_id,
        status: registered.status,
        result: { generated, validate, pack, registered },
        validation: validate.validation,
        errors: registered.errors,
        warnings: [...(generated.warnings || []), ...(validate.warnings || []), ...(pack.warnings || []), ...(registered.warnings || [])]
      });
    }
  }

  return response('axiom_plugin_build_slice', {
    request_id,
    plugin_id: generated.plugin_id,
    status: registered?.status || pack.status,
    result: {
      generated: generated.result,
      validate: validate.result,
      package: pack.result,
      register: registered?.result || null,
      landed: true,
      activation: 'not_attempted_by_builder_use_runtime_activation_tool'
    },
    validation: validate.validation,
    warnings: [
      ...(generated.warnings || []),
      ...(validate.warnings || []),
      ...(pack.warnings || []),
      ...(registered?.warnings || [])
    ],
    receipt: registered?.receipt || pack.receipt
  });
}

export async function axiom_plugin_build_from_candidate(input = {}) {
  const {
    request_id,
    plugin_id: requestedPluginId,
    name,
    capability_gap,
    target_area,
    candidate,
    register = true,
    template = 'base',
    acquisition_mode,
    runtime_contract,
    original_request
  } = input;

  const plugin_id = requestedPluginId || idFromName(name || capability_gap || `model-plugin-${Date.now()}`);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return fail('axiom_plugin_build_from_candidate', request_id, plugin_id, [
      { code: 'CANDIDATE_REQUIRED', message: 'candidate object with manifest/files is required', severity: 'error' }
    ]);
  }

  let manifest = loadManifest(plugin_id);
  const created = !manifest;
  if (manifest?.lifecycle?.status && !['draft', 'generated', 'rejected'].includes(manifest.lifecycle.status)) {
    return fail('axiom_plugin_build_from_candidate', request_id, plugin_id, [
      { code: 'UNSAFE_LIFECYCLE_FOR_CANDIDATE', message: `Model candidate can only update draft/generated/rejected proposals. Current: ${manifest.lifecycle.status}`, severity: 'error' }
    ]);
  }

  if (!manifest) {
    const createResult = await axiom_plugin_create({
      request_id,
      plugin_id,
      name: name || candidate.manifest?.name || plugin_id,
      description: candidate.manifest?.description || `Model-generated plugin proposal for: ${capability_gap || plugin_id}`,
      template,
      author_source: 'axiom-agent',
      capability_gap
    });
    if (!createResult.ok) return createResult;
    manifest = loadManifest(plugin_id);
  }

  const dir = pluginDir(plugin_id);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });

  const files = candidate.files && typeof candidate.files === 'object' && !Array.isArray(candidate.files)
    ? candidate.files
    : {};
  const writtenFiles = [];
  const rejectedFiles = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const safePath = safeCandidatePath(relativePath);
    if (!safePath) {
      rejectedFiles.push(relativePath);
      continue;
    }
    const fullPath = join(dir, safePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    writtenFiles.push(safePath);
  }

  if (candidate.integration_contract && !writtenFiles.includes('integration-contract.json')) {
    writeFileSync(join(dir, 'integration-contract.json'), JSON.stringify(candidate.integration_contract, null, 2));
    writtenFiles.push('integration-contract.json');
  }

  manifest = mergeCandidateManifest(manifest, candidate.manifest || {}, {
    request_id,
    name,
    capability_gap,
    target_area,
    template,
    acquisition_mode,
    runtime_contract,
    original_request
  });
  if (target_area && manifest.implementation?.kind === 'implementation_bearing_plugin_proposal') {
    manifest.implementation.target_area = target_area;
    manifest.implementation.capability_gap = capability_gap || manifest.implementation.capability_gap;
  }
  saveManifest(plugin_id, manifest);
  appendLifecycle(plugin_id, {
    event: 'model_candidate_generated',
    status: 'generated',
    request_id,
    target_area,
    written_files: writtenFiles,
    rejected_files: rejectedFiles,
    created
  });

  const validate = await axiom_plugin_validate({ request_id, plugin_id });
  if (!validate.ok) {
    return response('axiom_plugin_build_from_candidate', {
      ok: false,
      request_id,
      plugin_id,
      status: validate.status,
      result: {
        candidate_written: true,
        written_files: writtenFiles,
        rejected_files: rejectedFiles,
        validate: validate.result,
        retry_prompt: retryPromptForCandidate({ capability_gap, target_area, validation: validate.validation })
      },
      validation: validate.validation,
      errors: validate.errors,
      warnings: validate.warnings,
      receipt: validate.receipt
    });
  }

  const pack = await axiom_plugin_package({ request_id, plugin_id });
  if (!pack.ok) {
    return response('axiom_plugin_build_from_candidate', {
      ok: false,
      request_id,
      plugin_id,
      status: pack.status,
      result: { candidate_written: true, written_files: writtenFiles, rejected_files: rejectedFiles, validate: validate.result, package: pack.result },
      validation: validate.validation,
      errors: pack.errors,
      warnings: [...(validate.warnings || []), ...(pack.warnings || [])],
      receipt: pack.receipt
    });
  }

  let registered = null;
  if (register) {
    registered = await axiom_plugin_register({ request_id, plugin_id, activate: false });
    if (!registered.ok) {
      return response('axiom_plugin_build_from_candidate', {
        ok: false,
        request_id,
        plugin_id,
        status: registered.status,
        result: { candidate_written: true, written_files: writtenFiles, rejected_files: rejectedFiles, validate: validate.result, package: pack.result, register: registered.result },
        validation: validate.validation,
        errors: registered.errors,
        warnings: [...(validate.warnings || []), ...(pack.warnings || []), ...(registered.warnings || [])],
        receipt: registered.receipt
      });
    }
  }

  return response('axiom_plugin_build_from_candidate', {
    request_id,
    plugin_id,
    status: registered?.status || pack.status,
    result: {
      candidate_written: true,
      written_files: writtenFiles,
      rejected_files: rejectedFiles,
      validate: validate.result,
      package: pack.result,
      register: registered?.result || null,
      landed: true,
      activation: 'not_attempted_by_builder_use_runtime_activation_tool'
    },
    validation: validate.validation,
    warnings: [...(validate.warnings || []), ...(pack.warnings || []), ...(registered?.warnings || [])],
    receipt: registered?.receipt || pack.receipt
  });
}

export async function axiom_plugin_model_build_slice(input = {}) {
  const { request_id, plugin_id, model_candidate } = input;
  if (model_candidate) {
    const built = await axiom_plugin_build_from_candidate({ ...input, candidate: model_candidate });
    return { ...built, tool: 'axiom_plugin_model_build_slice' };
  }
  try {
    const generated = await requestLocalModelCandidate(input);
    const built = await axiom_plugin_build_from_candidate({
      ...input,
      candidate: generated.candidate,
      request_id,
      plugin_id
    });
    if (built.ok === false
      && built.status === 'rejected'
      && built.result?.retry_prompt
      && generated.repair_attempted !== true) {
      const repaired = await requestLocalModelCandidate(input, {
        feedback: built.result.retry_prompt,
        candidate: generated.tool_spec || generated.candidate
      });
      const repairedBuild = await axiom_plugin_build_from_candidate({
        ...input,
        candidate: repaired.candidate,
        request_id,
        plugin_id
      });
      return {
        ...repairedBuild,
        tool: 'axiom_plugin_model_build_slice',
        result: {
          ...(repairedBuild.result || {}),
          model: repaired.model,
          host: repaired.host,
          repair_attempted: true,
          repair_kind: 'validation',
          first_attempt: {
            status: built.status,
           errors: built.errors || [],
           validation: built.validation || null,
            raw_model_response_preview: generated.text.slice(0, 500),
            bounded_tool_spec: generated.tool_spec || null
          },
          repair_attempt: {
            status: repairedBuild.status,
            errors: repairedBuild.errors || [],
            validation: repairedBuild.validation || null,
            raw_model_response_preview: repaired.text.slice(0, 500),
            bounded_tool_spec: repaired.tool_spec || null
          }
        }
      };
    }
    return {
      ...built,
      tool: 'axiom_plugin_model_build_slice',
      result: {
        ...(built.result || {}),
        model: generated.model,
        host: generated.host,
        repair_attempted: generated.repair_attempted,
        repair_kind: generated.repair_kind || null,
        first_parse_error: generated.first_parse_error || null,
        raw_model_response_preview: generated.text.slice(0, 500),
        bounded_tool_spec: generated.tool_spec || null
      }
    };
  } catch (error) {
    return response('axiom_plugin_model_build_slice', {
      ok: false,
      request_id,
      plugin_id: plugin_id || null,
      status: 'error',
      validation: { ran: false, passed: false },
      errors: [
        {
          code: error?.name === 'AbortError' ? 'MODEL_TIMEOUT' : 'MODEL_GENERATION_FAILED',
          message: error?.name === 'AbortError' ? 'Local model generation timed out.' : String(error.message || error),
          severity: 'error'
        }
      ],
      warnings: ['No plugin artifact was written because the local model did not return a usable candidate.'],
      result: {
        retry_prompt: retryPromptForCandidate({
          capability_gap: input.capability_gap,
          target_area: input.target_area,
          validation: { errors: [{ code: 'MODEL_GENERATION_FAILED', message: String(error.message || error) }] }
        }),
        first_parse_error: error.first_parse_error || null,
        raw_model_response_preview: error.raw_model_response_preview || null
      }
    });
  }
}

export async function axiom_plugin_register(input = {}) {
  const { plugin_id, activate = false, auto_activate = false, request_id } = input;
  const shouldActivate = Boolean(activate || auto_activate);
  const manifest = loadManifest(plugin_id);
  if (!manifest) return fail('axiom_plugin_register', request_id, plugin_id, [{ code: 'PLUGIN_NOT_FOUND', message: `No plugin found: ${plugin_id}`, severity: 'error' }]);
  if (manifest.lifecycle.status !== 'packaged') return fail('axiom_plugin_register', request_id, plugin_id, [{ code: 'NOT_PACKAGED', message: `Plugin must be packaged before registration. Current: ${manifest.lifecycle.status}`, severity: 'error' }]);
  if (manifest.validation_status?.passed !== true) return fail('axiom_plugin_register', request_id, plugin_id, [{ code: 'VALIDATION_NOT_PASSED', message: 'Unvalidated plugins cannot be registered.', severity: 'error' }]);
  if (shouldActivate) {
    return fail('axiom_plugin_register', request_id, plugin_id, [
      {
        code: 'RUNTIME_ACTIVATION_REQUIRED',
        message: 'Plugin Builder can register packaged plugins, but cannot honestly mark them active. Use the AXIOM runtime activation tool/client loader after registration.',
        severity: 'error'
      }
    ], ['Registration and runtime activation are separate truth domains.']);
  }
  manifest.lifecycle.status = 'registered';
  manifest.lifecycle.registered_at = now();
  const rcpt = receipt(plugin_id, 'register', { activated: false, status: manifest.lifecycle.status });
  saveManifest(plugin_id, manifest);
  await new PluginRegistry().register(manifest, rcpt);
  appendLifecycle(plugin_id, { event: 'registered', status: manifest.lifecycle.status, request_id });
  return response('axiom_plugin_register', { request_id, plugin_id, status: manifest.lifecycle.status, result: { registered: true, active: false, note: 'Plugin registered but not active. Runtime activation must be performed by AXIOM_PLUGIN_RUNTIME.' }, warnings: ['Explicit runtime activation still required before load.'], receipt: rcpt });
}

export async function axiom_plugin_list(input = {}) {
  const { status_filter, capability_filter, request_id } = input;
  mkdirSync(PLUGIN_STORE, { recursive: true });
  let plugins = readdirSync(PLUGIN_STORE, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => loadManifest(d.name)).filter(Boolean);
  if (status_filter) plugins = plugins.filter(p => p.lifecycle.status === status_filter);
  if (capability_filter) plugins = plugins.filter(p => p.capabilities?.includes(capability_filter));
  return response('axiom_plugin_list', { request_id, result: { count: plugins.length, plugins: plugins.map(p => ({ id: p.id, name: p.name, version: p.version, status: p.lifecycle.status, capabilities: p.capabilities, validated: p.validation_status?.passed === true, author: p.author })) } });
}

export async function axiom_plugin_inspect(input = {}) {
  const { plugin_id, include_files = false, request_id } = input;
  const manifest = loadManifest(plugin_id);
  if (!manifest) return fail('axiom_plugin_inspect', request_id, plugin_id, [{ code: 'PLUGIN_NOT_FOUND', message: `No plugin found: ${plugin_id}`, severity: 'error' }]);
  const result = { manifest, lifecycle_log: lifecycle(plugin_id) };
  if (include_files) {
    result.files = {};
    for (const rel of ['src/index.js','tests/plugin.test.js','README.md']) {
      const path = join(pluginDir(plugin_id), rel);
      result.files[rel] = existsSync(path) ? readFileSync(path, 'utf8') : null;
    }
  }
  return response('axiom_plugin_inspect', { request_id, plugin_id, status: manifest.lifecycle.status, result, validation: { ran: true, passed: manifest.validation_status?.passed === true, ...manifest.validation_status } });
}

function repairProposalId(plugin_id) {
  return `plugin_repair_${String(plugin_id || 'plugin').replace(/[^a-z0-9_.-]+/gi, '_')}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function fileHash(text = '') {
  return createHash('sha256').update(String(text || '')).digest('hex');
}

function normalisePluginTargetFile(target_file = '') {
  const safe = safeCandidatePath(target_file || 'src/index.js');
  if (!safe) return null;
  if (!/^src\//i.test(safe) && !/^tests\//i.test(safe) && safe !== 'README.md') return null;
  return safe;
}

function findRepairPatch({ source, target_file, expected_find, replacement, repair_instruction }) {
  const text = String(source || '');
  const exactFind = String(expected_find || '');
  const exactReplacement = typeof replacement === 'string' ? replacement : null;
  if (exactFind && exactReplacement != null) {
    const count = text.split(exactFind).length - 1;
    return [{
      target_file,
      operation: 'single_replace',
      expectedFind: exactFind,
      replacement: exactReplacement,
      matchCount: count,
      status: count === 1 ? 'ready_for_safe_edit' : count === 0 ? 'expected_find_not_found' : 'expected_find_not_unique',
      source: 'explicit_expected_find_replacement'
    }];
  }
  const instruction = String(repair_instruction || '');
  if (/orbitTarget\.set|\.set calls?|Vector3|plain objects?/i.test(instruction) && text.includes('orbitTarget.set')) {
    const matchCount = text.split('orbitTarget.set').length - 1;
    return [{
      target_file,
      operation: 'single_replace',
      expectedFind: 'orbitTarget.set',
      replacement: 'setOrbitTargetSafe',
      matchCount,
      status: 'candidate_needs_exact_expected_find',
      source: 'narrow_orbit_target_set_signal'
    }];
  }
  return [];
}

export async function axiom_plugin_repair(input = {}) {
  const {
    plugin_id,
    target_file,
    error,
    stack,
    message,
    repair_instruction,
    include_files = true,
    expected_find_required = true,
    expected_find,
    replacement,
    request_id
  } = input;
  const id = String(plugin_id || '').trim();
  if (!id) return fail('axiom_plugin_repair', request_id, id, [{ code: 'PLUGIN_ID_REQUIRED', message: 'plugin_id is required', severity: 'error' }]);
  const manifest = loadManifest(id);
  if (!manifest) return fail('axiom_plugin_repair', request_id, id, [{ code: 'PLUGIN_NOT_FOUND', message: `No plugin found: ${id}`, severity: 'error' }]);
  const targetFile = normalisePluginTargetFile(target_file || manifest.entrypoint || 'src/index.js');
  if (!targetFile) return fail('axiom_plugin_repair', request_id, id, [{ code: 'INVALID_TARGET_FILE', message: `Unsafe or unsupported target_file: ${target_file}`, severity: 'error' }]);
  const exactError = String(error || message || '').trim();
  const instruction = String(repair_instruction || '').trim();
  const exactStack = String(stack || '').trim();
  const errors = [];
  if (!exactError) errors.push({ code: 'RUNTIME_ERROR_REQUIRED', message: 'Exact runtime error is required.', severity: 'error' });
  if (!instruction) errors.push({ code: 'REPAIR_INSTRUCTION_REQUIRED', message: 'repair_instruction is required.', severity: 'error' });
  if (errors.length) return fail('axiom_plugin_repair', request_id, id, errors);

  const fullPath = join(pluginDir(id), targetFile);
  const source = existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : null;
  if (source == null) return fail('axiom_plugin_repair', request_id, id, [{ code: 'TARGET_FILE_NOT_FOUND', message: `Target file not found: ${targetFile}`, severity: 'error' }]);

  const patches = findRepairPatch({ source, target_file: targetFile, expected_find, replacement, repair_instruction: instruction });
  const readyPatches = patches.filter(patch => patch.status === 'ready_for_safe_edit');
  const expectedFindBlocked = Boolean(expected_find_required) && !readyPatches.length;
  const proposalId = repairProposalId(id);
  const files = include_files ? { [targetFile]: source } : undefined;
  const proposal = {
    schema: 'axiom.plugin.repair.proposal.v1',
    proposalId,
    type: 'FileMutationProposal',
    plugin_id: id,
    target_file: targetFile,
    targetPath: targetFile,
    status: expectedFindBlocked ? 'blocked_expected_find_required' : 'proposed',
    risk: readyPatches.length ? 'medium' : 'high',
    runtimeEvidence: {
      error: exactError,
      message: String(message || exactError),
      stack: exactStack || null
    },
    repair_instruction: instruction,
    expected_find_required: Boolean(expected_find_required),
    filesInspected: [{
      path: targetFile,
      exists: true,
      sha256: fileHash(source),
      sizeBytes: source.length,
      included: Boolean(include_files)
    }],
    patches,
    validationPlan: [
      'Review repair proposal evidence and target file.',
      'If a patch has status ready_for_safe_edit, pass expectedFind/replacement to FileManager propose_edit.',
      'Apply only through FileManager apply_edit and verify receipt.applied === true.',
      'Re-run plugin validation/runtime smoke after safe edit receipt.'
    ],
    createdAt: now(),
    source: 'axiom_plugin_repair'
  };
  const rcpt = receipt(id, 'repair_proposal', { proposalId, target_file: targetFile, patchCount: patches.length, readyPatchCount: readyPatches.length, expected_find_required: Boolean(expected_find_required), runtime_error: exactError });
  appendLifecycle(id, { event: 'repair_proposal_created', status: manifest.lifecycle?.status || 'unknown', request_id, proposalId, target_file: targetFile, runtime_error: exactError });
  return response('axiom_plugin_repair', {
    request_id,
    plugin_id: id,
    status: proposal.status,
    result: { ...proposal, files },
    validation: { ran: true, passed: !expectedFindBlocked, expected_find_required: Boolean(expected_find_required), readyPatchCount: readyPatches.length },
    warnings: expectedFindBlocked ? ['No ready exact expected-find patch was produced; safe edit proposal must supply exact expectedFind/replacement before apply.'] : [],
    receipt: rcpt
  });
}

export async function axiom_plugin_delete(input = {}) {
  const { plugin_id, force = false, request_id } = input;
  const manifest = loadManifest(plugin_id);
  if (!manifest) {
    return fail('axiom_plugin_delete', request_id, plugin_id, [
      { code: 'PLUGIN_NOT_FOUND', message: `No plugin found: ${plugin_id}`, severity: 'error' }
    ]);
  }

  const status = manifest.lifecycle?.status || 'unknown';
  const validated = manifest.validation_status?.passed === true;
  const protectedStatuses = new Set(['registered', 'active']);
  const deletable = !protectedStatuses.has(status) && !validated;
  if (!deletable && !force) {
    return fail('axiom_plugin_delete', request_id, plugin_id, [
      {
        code: 'PLUGIN_DELETE_BLOCKED',
        message: `Refusing to delete ${plugin_id} because status=${status} validated=${validated}. Deactivate/unregister or pass force=true intentionally.`,
        severity: 'error'
      }
    ], ['Default delete is limited to generated/rejected/unvalidated proposals.']);
  }

  const rcpt = receipt(plugin_id, 'delete', { status, validated, forced: Boolean(force) });
  rmSync(pluginDir(plugin_id), { recursive: true, force: true });
  await new PluginRegistry().remove(plugin_id, rcpt);
  return response('axiom_plugin_delete', {
    request_id,
    plugin_id,
    status: 'deleted',
    result: {
      deleted: true,
      plugin_id,
      previous_status: status,
      forced: Boolean(force)
    },
    warnings: force ? ['Forced plugin deletion bypassed generated/rejected guard.'] : [],
    receipt: rcpt
  });
}

export function list_plugin_templates(input = {}) {
  return response('list_plugin_templates', { request_id: input.request_id, result: { templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, description: t.description, default_capabilities: t.default_capabilities, default_permissions: t.default_permissions })) } });
}

export function explain_plugin_contract(input = {}) {
  return response('explain_plugin_contract', { request_id: input.request_id, result: { lifecycle_stages: ['draft','generated','validated','packaged','registered','active','suspended','rejected'], governance_rules: ['Generated plugin output is a proposal, not active truth.','Validation must run before registration.','Registration must produce a receipt.','Registration and runtime activation are separate truth domains.','Plugin Builder must not mark a plugin active without AXIOM runtime loader proof.','Failed validation returns structured errors.','Permissions must be declared before execution.','Plugins may not silently modify AXIOM core files.','AXIOM must never load an unvalidated plugin directly.'], required_manifest_fields: ['id','name','version','description','author','entrypoint','capabilities','permissions','mcp_tools','lifecycle_hooks','event_subscriptions','ui_surfaces','axiom_runtime','lifecycle','safety','provenance','compatibility','validation_status'], mcp_response_shape: ['ok','tool','request_id','plugin_id','status','result','validation','errors','warnings','receipt'] } });
}
