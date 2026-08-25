const ACQUISITION_CONTRACT = 'axiom.capability-acquisition.v1';
const PROPOSAL_CONTRACT = 'axiom.capability-acquisition-proposal.v1';
const ACTIVATION_RECEIPT_CONTRACT = 'axiom.capability-acquisition-activation-receipt.v1';
const RUNTIME_AUTHORING_CONTRACT = 'axiom.runtime-plugin-authoring.v1';

function text(value) {
  return String(value ?? '').trim();
}

function slug(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'missing-capability';
}

export function pluginIdForCapability(requiredCapability) {
  return `acquired-${slug(requiredCapability)}`.slice(0, 63).replace(/-+$/g, '');
}

function toolResult(response) {
  return response?.result || response || {};
}

function errorSummary(response, fallback) {
  const errors = Array.isArray(response?.errors) ? response.errors : [];
  const detail = errors
    .map(error => text(error.message || error.rule || error.code))
    .filter(Boolean)
    .join('; ');
  return detail || text(response?.error || response?.reason) || fallback;
}

function runtimeApiIds(runtimeContract) {
  return new Set((runtimeContract?.apis || []).map(api => text(api?.id)).filter(Boolean));
}

function inspectManifest(response) {
  return toolResult(response)?.manifest || null;
}

function executableManifestCheck(manifest, runtimeContract) {
  const errors = [];
  if (!manifest) errors.push('plugin_manifest_missing');
  if (manifest && manifest.validation_status?.passed !== true) errors.push('plugin_validation_not_passed');
  if (manifest && manifest.lifecycle?.status !== 'registered') errors.push(`plugin_not_registered:${manifest.lifecycle?.status || 'unknown'}`);
  const declaredTools = Array.isArray(manifest?.mcp_tools) ? manifest.mcp_tools : [];
  if (declaredTools.length !== 1) errors.push(`bounded_plugin_requires_exactly_one_mcp_tool:${declaredTools.length}`);
  for (const declared of declaredTools) {
    if (!text(declared?.name)) errors.push('declared_tool_name_missing');
    if (!declared?.input_schema || declared.input_schema.type !== 'object') errors.push(`declared_tool_schema_missing:${declared?.name || 'unknown'}`);
  }
  const allowedApis = runtimeApiIds(runtimeContract);
  const requiredApis = Array.isArray(manifest?.implementation?.required_runtime_apis)
    ? manifest.implementation.required_runtime_apis.map(text).filter(Boolean)
    : [];
  if (!requiredApis.length) errors.push('required_runtime_apis_missing');
  for (const api of requiredApis) {
    if (!allowedApis.has(api)) errors.push(`runtime_api_not_offered:${api}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    declaredTools,
    requiredApis
  };
}

async function callStage(callTool, tool, parameters, stage, events) {
  events?.onStage?.({ stage, status: 'running', tool, parameters });
  const response = await callTool(tool, parameters);
  events?.onReceipt?.({ stage, tool, response });
  events?.onStage?.({
    stage,
    status: response?.ok === false ? 'failed' : 'completed',
    tool,
    summary: response?.ok === false ? errorSummary(response, `${tool}_failed`) : `${tool}_completed`
  });
  return response;
}

export async function prepareCapabilityAcquisition(input = {}) {
  const requiredCapability = text(input.requiredCapability);
  const reason = text(input.reason);
  const originalRequest = text(input.originalRequest);
  const runtimeContract = input.runtimeContract;
  const callTool = input.callTool;
  const events = input.events || {};

  if (!requiredCapability) throw new Error('required_capability_missing');
  if (!originalRequest) throw new Error('original_request_missing');
  if (typeof callTool !== 'function') throw new Error('capability_acquisition_call_tool_missing');
  if (runtimeContract?.contract !== RUNTIME_AUTHORING_CONTRACT) throw new Error('runtime_plugin_authoring_contract_missing');

  const pluginId = text(input.pluginId) || pluginIdForCapability(requiredCapability);
  const requestId = text(input.requestId) || `acquire_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const receipts = [];
  const stageEvents = {
    onStage: events.onStage,
    onReceipt(receipt) {
      receipts.push(receipt);
      events.onReceipt?.(receipt);
    }
  };

  events.onStage?.({ stage: 'inventory', status: 'running', pluginId, summary: 'Checking for an existing governed capability.' });
  let inspect = await callTool('axiom_plugin_inspect', { plugin_id: pluginId, include_files: false, request_id: requestId });
  receipts.push({ stage: 'inventory', tool: 'axiom_plugin_inspect', response: inspect });
  let manifest = inspect?.ok === false ? null : inspectManifest(inspect);
  events.onStage?.({
    stage: 'inventory',
    status: 'completed',
    pluginId,
    summary: manifest ? `Existing plugin found at ${manifest.lifecycle?.status || 'unknown'}.` : 'No existing plugin can satisfy this gap.'
  });

  let lifecycle = text(manifest?.lifecycle?.status);
  const needsBuild = !manifest || ['draft', 'generated', 'rejected'].includes(lifecycle);
  if (manifest && lifecycle === 'validated') {
    const packaged = await callStage(callTool, 'axiom_plugin_package', { plugin_id: pluginId, request_id: requestId }, 'package', stageEvents);
    if (packaged?.ok === false) throw Object.assign(new Error(errorSummary(packaged, 'plugin_package_failed')), { code: 'plugin_package_failed', detail: packaged, receipts });
    lifecycle = 'packaged';
  }
  if (manifest && lifecycle === 'packaged') {
    const registered = await callStage(callTool, 'axiom_plugin_register', { plugin_id: pluginId, request_id: requestId }, 'register', stageEvents);
    if (registered?.ok === false) throw Object.assign(new Error(errorSummary(registered, 'plugin_register_failed')), { code: 'plugin_register_failed', detail: registered, receipts });
    lifecycle = 'registered';
  }

  if (needsBuild) {
    const built = await callStage(callTool, 'axiom_plugin_model_build_slice', {
      plugin_id: pluginId,
      name: `Acquired ${requiredCapability}`.slice(0, 100),
      capability_gap: `${requiredCapability}: ${reason || 'No registered executor can complete the original request.'}`,
      original_request: originalRequest,
      target_area: 'editor.runtime_plugin',
      template: 'mcp_tool',
      register: true,
      acquisition_mode: 'bounded_runtime_tool',
      runtime_contract: runtimeContract,
      model: text(input.model) || 'qwen3.5:9b',
      host: text(input.host) || 'http://127.0.0.1:11434',
      timeout_ms: Number(input.timeoutMs) || 90000,
      request_id: requestId
    }, 'build_validate_register', stageEvents);
    if (built?.ok === false) {
      const error = new Error(errorSummary(built, 'plugin_model_build_failed'));
      error.code = 'plugin_model_build_failed';
      error.detail = built;
      error.receipts = receipts;
      throw error;
    }
  }

  inspect = await callStage(callTool, 'axiom_plugin_inspect', { plugin_id: pluginId, include_files: false, request_id: requestId }, 'inspect_registered', stageEvents);
  manifest = inspectManifest(inspect);
  const executable = executableManifestCheck(manifest, runtimeContract);
  if (!executable.ok) {
    const error = new Error(executable.errors.join(', '));
    error.code = 'registered_plugin_not_executable';
    error.detail = { inspect, executable };
    error.receipts = receipts;
    throw error;
  }

  const proposal = {
    contract: PROPOSAL_CONTRACT,
    acquisitionContract: ACQUISITION_CONTRACT,
    classification: 'projection',
    state: 'registered',
    pluginId,
    requiredCapability,
    reason,
    originalRequest,
    requestId,
    declaredTools: executable.declaredTools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.input_schema
    })),
    requiredRuntimeApis: executable.requiredApis,
    lifecycle: manifest.lifecycle,
    validationStatus: manifest.validation_status,
    receipts,
    promotionGate: 'explicit_runtime_activation_and_callable_tool_verification',
    createdAt: new Date().toISOString()
  };
  events.onStage?.({
    stage: 'awaiting_activation',
    status: 'awaiting_user',
    pluginId,
    summary: `${proposal.declaredTools[0].name} is registered but remains inactive.`
  });
  return proposal;
}

export async function activateAndVerifyCapability(input = {}) {
  const proposal = input.proposal;
  if (proposal?.contract !== PROPOSAL_CONTRACT) throw new Error('capability_acquisition_proposal_invalid');
  if (typeof input.activate !== 'function') throw new Error('capability_activation_function_missing');
  if (typeof input.runtimeStatus !== 'function') throw new Error('capability_runtime_status_function_missing');
  if (typeof input.runtimeTools !== 'function') throw new Error('capability_runtime_tools_function_missing');

  input.events?.onStage?.({ stage: 'activate', status: 'running', pluginId: proposal.pluginId });
  const activation = await input.activate(proposal.pluginId);
  input.events?.onReceipt?.({ stage: 'activate', tool: 'axiom_plugin_activate', response: activation });
  if (activation?.ok === false) {
    const error = new Error(errorSummary(activation, 'plugin_activation_failed'));
    error.code = 'plugin_activation_failed';
    error.detail = activation;
    throw error;
  }

  const status = await input.runtimeStatus();
  const tools = await input.runtimeTools();
  const active = (status?.active_plugins || []).some(plugin => plugin.plugin_id === proposal.pluginId);
  const names = new Set((tools || []).map(tool => text(tool?.name)).filter(Boolean));
  const missingTools = proposal.declaredTools.map(tool => tool.name).filter(name => !names.has(name));
  const ok = active && missingTools.length === 0;
  const receipt = {
    contract: ACTIVATION_RECEIPT_CONTRACT,
    acquisitionContract: ACQUISITION_CONTRACT,
    ok,
    pluginId: proposal.pluginId,
    active,
    callableTools: proposal.declaredTools.map(tool => tool.name).filter(name => names.has(name)),
    missingTools,
    activation,
    runtimeStatus: status,
    verifiedAt: new Date().toISOString(),
    continuation: ok ? 'resume_original_request_with_fresh_model_observation' : 'blocked'
  };
  input.events?.onReceipt?.({ stage: 'verify_activation', response: receipt });
  input.events?.onStage?.({
    stage: 'verify_activation',
    status: ok ? 'completed' : 'failed',
    pluginId: proposal.pluginId,
    summary: ok ? `${receipt.callableTools.join(', ')} is active and callable.` : `Activation verification failed: ${missingTools.join(', ') || 'plugin not active'}`
  });
  if (!ok) {
    const error = new Error(`runtime_plugin_verification_failed:${missingTools.join(',') || 'not_active'}`);
    error.code = 'runtime_plugin_verification_failed';
    error.detail = receipt;
    throw error;
  }
  return receipt;
}

if (typeof window !== 'undefined') {
  window.AxiomCapabilityAcquisition = {
    contract: ACQUISITION_CONTRACT,
    proposalContract: PROPOSAL_CONTRACT,
    activationReceiptContract: ACTIVATION_RECEIPT_CONTRACT,
    runtimeAuthoringContract: RUNTIME_AUTHORING_CONTRACT,
    pluginIdForCapability,
    prepare: prepareCapabilityAcquisition,
    activateAndVerify: activateAndVerifyCapability
  };
}

export {
  ACQUISITION_CONTRACT,
  PROPOSAL_CONTRACT,
  ACTIVATION_RECEIPT_CONTRACT,
  RUNTIME_AUTHORING_CONTRACT
};
