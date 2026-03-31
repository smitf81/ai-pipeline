import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const taxonomyPath = path.resolve(process.cwd(), 'public', 'spatial', 'roleTaxonomy.mjs');

export default async function runRoleTaxonomyTests() {
  const taxonomy = await loadModuleCopy(taxonomyPath, { label: 'roleTaxonomy' });

  assert.equal(taxonomy.ROLE_TAXONOMY.version, 'role-taxonomy.v1');
  assert.equal(taxonomy.getOperationalRoles().length, 10);
  assert.equal(taxonomy.getTalentRoles().length, 6);
  assert.deepEqual(taxonomy.getDesignatedLeadRoleIds(), [
    'context-manager',
    'planner',
    'memory-archivist',
    'qa-lead',
    'cto-architect',
    'integration_auditor',
    'rnd-lead',
  ]);
  assert.deepEqual(taxonomy.ROLE_TAXONOMY.canonicalMappings.planner, {
    deskId: 'planner',
    roleId: 'planner',
    agentId: 'planner',
    modelProfileId: 'model-profile.planner-default',
  });
  assert.deepEqual(taxonomy.getAssignableRoleIdsForDesk('executor'), [
    'executor',
    'integration_auditor',
    'pipeline_observer',
  ]);

  const planner = taxonomy.getRoleById('planner');
  assert.equal(planner.label, 'Planner');
  assert.ok(planner.capabilities.includes('break intent into steps'));
  assert.equal(planner.allowedDepartmentIds[0], 'delivery');

  const synthesisRole = taxonomy.getRoleById('systems-synthesiser');
  assert.equal(synthesisRole.label, 'Systems Synthesiser');
  assert.equal(synthesisRole.allowedDepartmentIds[0], 'research');

  assert.deepEqual(taxonomy.getAssignableRoleIdsForDesk('rnd-lead'), [
    'rnd-lead',
    'prototype-engineer',
    'systems-synthesiser',
    'validation-analyst',
  ]);

  const deliveryDepartment = taxonomy.getDepartmentById('delivery');
  assert.equal(deliveryDepartment.leadRoleId, 'planner');
  assert.deepEqual(taxonomy.buildRoleAssignmentIndex().delivery.deskIds, ['planner', 'executor']);
  assert.equal(taxonomy.getStarterRoleTemplates().length, 12);
}
