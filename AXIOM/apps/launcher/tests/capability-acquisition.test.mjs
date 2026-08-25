import assert from 'node:assert/strict';
import {
  ACQUISITION_CONTRACT,
  RUNTIME_AUTHORING_CONTRACT,
  activateAndVerifyCapability,
  pluginIdForCapability,
  prepareCapabilityAcquisition
} from '../public/capability-acquisition.js';

const runtimeContract = {
  contract: RUNTIME_AUTHORING_CONTRACT,
  apis: [
    { id: 'mapforge.describeTerrain', mode: 'read' },
    { id: 'workspace.getContext', mode: 'read' }
  ]
};

const registeredManifest = {
  id: 'acquired-mapforge-document-report',
  name: 'Map Forge Document Report',
  validation_status: { passed: true },
  lifecycle: { status: 'registered' },
  mcp_tools: [{
    name: 'mapforge_document_report',
    description: 'Report the active Map Forge document and revision.',
    input_schema: { type: 'object', additionalProperties: false, properties: {} }
  }],
  implementation: {
    required_runtime_apis: ['mapforge.describeTerrain']
  }
};

{
  const calls = [];
  let inspectCount = 0;
  const proposal = await prepareCapabilityAcquisition({
    requiredCapability: 'mapforge.document.report',
    reason: 'The user asked for a canonical active-map report.',
    originalRequest: 'Report the active Map Forge map and revision.',
    runtimeContract,
    callTool: async (tool, parameters) => {
      calls.push({ tool, parameters });
      if (tool === 'axiom_plugin_inspect') {
        inspectCount += 1;
        if (inspectCount === 1) return { ok: false, errors: [{ message: 'No plugin found' }] };
        return { ok: true, result: { manifest: registeredManifest } };
      }
      if (tool === 'axiom_plugin_model_build_slice') return { ok: true, plugin_id: registeredManifest.id, status: 'registered' };
      throw new Error(`unexpected_tool:${tool}`);
    }
  });

  assert.equal(proposal.acquisitionContract, ACQUISITION_CONTRACT);
  assert.equal(proposal.classification, 'projection');
  assert.equal(proposal.state, 'registered');
  assert.equal(proposal.declaredTools[0].name, 'mapforge_document_report');
  assert.equal(calls.filter(call => call.tool === 'axiom_plugin_model_build_slice').length, 1);
  assert.equal(calls[1].parameters.acquisition_mode, 'bounded_runtime_tool');
  assert.equal(calls[1].parameters.model, 'qwen3.5:9b');

  const activation = await activateAndVerifyCapability({
    proposal,
    activate: async pluginId => ({ ok: true, pluginId }),
    runtimeStatus: async () => ({ active_plugins: [{ plugin_id: proposal.pluginId }] }),
    runtimeTools: async () => proposal.declaredTools
  });
  assert.equal(activation.ok, true);
  assert.deepEqual(activation.callableTools, ['mapforge_document_report']);
  assert.equal(activation.continuation, 'resume_original_request_with_fresh_model_observation');
}

{
  const calls = [];
  const proposal = await prepareCapabilityAcquisition({
    requiredCapability: 'mapforge.document.report',
    reason: 'Reuse the already registered plugin.',
    originalRequest: 'Report the active map.',
    runtimeContract,
    callTool: async (tool) => {
      calls.push(tool);
      if (tool === 'axiom_plugin_inspect') return { ok: true, result: { manifest: registeredManifest } };
      throw new Error(`unexpected_tool:${tool}`);
    }
  });
  assert.equal(proposal.state, 'registered');
  assert.deepEqual(calls, ['axiom_plugin_inspect', 'axiom_plugin_inspect']);
}

{
  const invalidManifest = {
    ...registeredManifest,
    implementation: { required_runtime_apis: ['unoffered.runtime.api'] }
  };
  await assert.rejects(
    prepareCapabilityAcquisition({
      requiredCapability: 'unsafe.capability',
      reason: 'Requests an API outside the host contract.',
      originalRequest: 'Do something unsupported.',
      runtimeContract,
      callTool: async () => ({ ok: true, result: { manifest: invalidManifest } })
    }),
    error => error.code === 'registered_plugin_not_executable' && error.message.includes('runtime_api_not_offered')
  );
}

{
  const proposal = {
    contract: 'axiom.capability-acquisition-proposal.v1',
    pluginId: registeredManifest.id,
    declaredTools: [{ name: 'mapforge_document_report' }]
  };
  await assert.rejects(
    activateAndVerifyCapability({
      proposal,
      activate: async () => ({ ok: true }),
      runtimeStatus: async () => ({ active_plugins: [{ plugin_id: proposal.pluginId }] }),
      runtimeTools: async () => []
    }),
    error => error.code === 'runtime_plugin_verification_failed' && error.detail.missingTools.includes('mapforge_document_report')
  );
}

assert.equal(pluginIdForCapability('MapForge Document Report'), 'acquired-mapforge-document-report');
console.log('Capability acquisition contract tests passed');
