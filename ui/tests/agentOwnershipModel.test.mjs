import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const agentOwnershipModelPath = path.resolve(process.cwd(), 'public', 'spatial', 'agentOwnershipModel.js');

export default async function runAgentOwnershipModelTests() {
  const model = await loadModuleCopy(agentOwnershipModelPath, { label: 'agentOwnershipModel' });

  assert.ok(Array.isArray(model.AGENT_ASSIGNMENT_REGISTRY));
  assert.ok(Array.isArray(model.AGENT_MODULE_VOCABULARY));
  assert.deepEqual(model.AGENT_MODULE_VOCABULARY, ['layout', 'org', 'ta', 'qa', 'simulation', 'ui', 'core']);
  assert.equal(model.validateAgentOwnershipModel(model.AGENT_ASSIGNMENT_REGISTRY), true);
  assert.equal(new Set(model.AGENT_ASSIGNMENT_REGISTRY.map((entry) => entry.id)).size, model.AGENT_ASSIGNMENT_REGISTRY.length);

  for (const entry of model.AGENT_ASSIGNMENT_REGISTRY) {
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.agentId, 'string');
    assert.equal(typeof entry.roleId, 'string');
    assert.equal(typeof entry.departmentId, 'string');
    assert.equal(typeof entry.deskId, 'string');
    assert.ok(Array.isArray(entry.ownedModules));
    assert.ok(Array.isArray(entry.activeTasks));
    assert.ok(entry.contextScope && typeof entry.contextScope === 'object' && !Array.isArray(entry.contextScope));
    assert.ok(entry.ownedModules.every((moduleId) => model.AGENT_MODULE_VOCABULARY.includes(moduleId)));
  }

  assert.deepEqual(model.getAgentAssignments('planner').map((entry) => entry.id), ['assignment-planner']);
  assert.deepEqual(model.listModulesOwnedByAgent('planner'), ['layout', 'org']);
  assert.deepEqual(model.listAgentsByModule('qa'), ['qa-lead']);
  assert.deepEqual(model.listAgentsByModule('simulation'), []);
  assert.deepEqual(model.listUnownedModules(), ['simulation']);

  const deliveryLead = model.getLeadForDepartment('dept-delivery');
  assert.equal(deliveryLead.agentId, 'planner');
  assert.equal(deliveryLead.roleId, 'planner');
  assert.equal(deliveryLead.reportsTo, null);
  assert.deepEqual(deliveryLead.ownedModules, ['layout', 'org']);

  const controlLead = model.getLeadForDepartment('dept-control');
  assert.equal(controlLead.agentId, 'cto-architect');
  assert.equal(controlLead.contextScope.visibility, 'desk');

  assert.deepEqual(model.getAgentAssignments('missing-agent'), []);
  assert.deepEqual(model.listAgentsByModule('bogus-module'), []);
  assert.deepEqual(model.listModulesOwnedByAgent('missing-agent'), []);
  assert.equal(model.getLeadForDepartment('missing-department'), null);
}
