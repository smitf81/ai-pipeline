import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const studioLayoutSchemaPath = path.resolve(process.cwd(), 'studioLayoutSchema.js');
const {
  DEPARTMENT_RELATIONSHIP_TYPES,
  addDepartmentToLayout,
  addDeskToLayout,
  buildDepartmentOrganizationModel,
  createDefaultStudioLayoutSchema,
  normalizeStudioLayoutSchema,
  listStudioDeskIds,
} = require(studioLayoutSchemaPath);

export default async function runStudioLayoutRelationshipTests() {
  assert.deepEqual(DEPARTMENT_RELATIONSHIP_TYPES, {
    parent: 'parent',
    peer: 'peer',
    support: 'support',
    dependency: 'dependency',
  });

  const defaultLayout = createDefaultStudioLayoutSchema();
  assert.ok(defaultLayout.organization);
  assert.equal(defaultLayout.organization.schemaVersion, 'studio-relationships.v1');
  assert.equal(defaultLayout.departments.length, 7);
  assert.equal(listStudioDeskIds(defaultLayout).length, 8);
  assert.ok(defaultLayout.organization.departments['dept-talent-acquisition']);
  assert.equal(defaultLayout.organization.departments['dept-talent-acquisition'].staffing.requiredLeadSeatId, 'integration_auditor');
  assert.equal(defaultLayout.organization.departments['dept-talent-acquisition'].staffing.minimumActiveSeats, 1);
  assert.equal(defaultLayout.organization.desks.integration_auditor.staffing.seatKind, 'lead');
  assert.equal(defaultLayout.organization.desks.integration_auditor.staffing.placeholder, true);
  assert.equal(defaultLayout.organization.departments['dept-control'].parentDepartmentId, null);
  assert.equal(defaultLayout.organization.departments['dept-delivery'].parentDepartmentId, 'dept-control');
  assert.ok(defaultLayout.organization.departments['dept-delivery'].peerDepartmentIds.includes('dept-intake'));
  assert.ok(defaultLayout.organization.departments['dept-delivery'].dependencyDepartmentIds.includes('dept-intake'));
  assert.ok(defaultLayout.organization.departments['dept-delivery'].supportDeskIds.includes('qa-lead'));
  assert.ok(defaultLayout.organization.desks.planner.peerDeskIds.includes('executor'));
  assert.equal(defaultLayout.organization.desks.planner.ownerDepartmentId, 'dept-delivery');
  assert.ok(defaultLayout.organization.desks.planner.assignedAgentIds.includes('planner'));
  assert.equal(defaultLayout.organization.agents.planner.roleId, 'planner');
  assert.equal(defaultLayout.organization.agents.planner.deskId, 'planner');
  assert.equal(defaultLayout.organization.agents.planner.modelProfileId, 'model-profile.planner-default');
  assert.deepEqual(defaultLayout.organization.planner, {
    deskId: 'planner',
    roleId: 'planner',
    agentId: 'planner',
    modelProfileId: 'model-profile.planner-default',
  });
  assert.deepEqual(defaultLayout.organization.qaLead, {
    id: 'qa-lead',
    agentId: 'qa-lead',
    roleId: 'qa-lead',
    deskId: 'qa-lead',
    departmentId: 'dept-quality',
    modelProfileId: 'model-profile.default.qa-lead',
  });
  assert.ok(defaultLayout.organization.desks.planner.dependencyDepartmentIds.includes('dept-intake'));
  assert.ok(defaultLayout.organization.desks.planner.supportDeskIds.includes('qa-lead'));

  const seededLayout = addDepartmentToLayout(defaultLayout, { templateId: 'research' });
  const seededDepartmentId = seededLayout.departments.find((entry) => entry.id.startsWith('dept-research-'))?.id || null;
  assert.ok(seededDepartmentId);
  assert.equal(seededLayout.organization.departments[seededDepartmentId].parentDepartmentId, 'dept-control');
  assert.ok(seededLayout.organization.departments[seededDepartmentId].supportDepartmentIds.includes('dept-delivery'));
  assert.ok(seededLayout.organization.departments[seededDepartmentId].supportDeskIds.includes('planner'));
  assert.ok(seededLayout.organization.departments[seededDepartmentId].dependencyDepartmentIds.includes('dept-intake'));
  assert.ok(seededLayout.organization.departments[seededDepartmentId].dependencyDeskIds.includes('context-manager'));

  const expandedLayout = addDeskToLayout(seededLayout, {
    departmentId: seededDepartmentId,
    templateId: 'analysis-node',
  });
  const addedDeskId = listStudioDeskIds(expandedLayout).find((deskId) => !listStudioDeskIds(seededLayout).includes(deskId)) || null;
  assert.ok(addedDeskId);
  assert.equal(expandedLayout.organization.desks[addedDeskId].parentDepartmentId, seededDepartmentId);
  assert.deepEqual(expandedLayout.organization.desks[addedDeskId].peerDeskIds, []);
  assert.ok(expandedLayout.organization.desks[addedDeskId].supportDepartmentIds.includes('dept-delivery'));
  assert.ok(expandedLayout.organization.desks[addedDeskId].dependencyDepartmentIds.includes('dept-intake'));

  const roundTripLayout = normalizeStudioLayoutSchema(expandedLayout);
  assert.equal(roundTripLayout.organization.desks[addedDeskId].parentDepartmentId, seededDepartmentId);
  assert.equal(Object.keys(roundTripLayout.organization.departments).length, roundTripLayout.departments.length);
  assert.equal(Object.keys(roundTripLayout.organization.desks).length, listStudioDeskIds(roundTripLayout).length);

  const rebuiltOrganization = buildDepartmentOrganizationModel(roundTripLayout.departments, roundTripLayout.desks, roundTripLayout.controlCentreDeskId);
  assert.equal(rebuiltOrganization.departments[seededDepartmentId].parentDepartmentId, 'dept-control');
  assert.equal(rebuiltOrganization.desks[addedDeskId].parentDepartmentId, seededDepartmentId);
}
