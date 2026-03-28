import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const staffingRulesPath = path.resolve(process.cwd(), 'public', 'spatial', 'staffingRules.js');

export default async function runStaffingRulesTests() {
  const {
    ENTITY_TYPES,
    STAFFING_HEALTH,
    STAFFING_RULES,
    buildStaffingAssignmentsFromTaHires,
    computeTaGapModel,
    evaluateStaffingModel,
    evaluateStaffingRule,
    getStaffingRule,
  } = await loadModuleCopy(staffingRulesPath, { label: 'staffingRules' });

  assert.deepEqual(ENTITY_TYPES, ['department', 'desk']);
  assert.deepEqual(STAFFING_HEALTH, ['healthy', 'degraded', 'blocked']);

  const intakeRule = getStaffingRule('department', 'context-intake');
  assert.equal(intakeRule.entityId, 'context-intake');
  assert.equal(intakeRule.entityType, 'department');
  assert.deepEqual(intakeRule.requiredRoles, ['context-manager', 'planner']);
  assert.deepEqual(intakeRule.optionalRoles, ['qa-lead']);
  assert.equal(intakeRule.minimumStaffing, 2);
  assert.equal(intakeRule.leadRequirement.roleId, 'planner');
  assert.equal(intakeRule.canExist.minimumStaffing, 1);
  assert.equal(intakeRule.canOperate.minimumStaffing, 2);

  const emptyDeskHealth = evaluateStaffingRule(getStaffingRule('desk', 'qa-lead'), []);
  assert.equal(emptyDeskHealth.health, 'degraded');
  assert.equal(emptyDeskHealth.blocked, true);
  assert.equal(emptyDeskHealth.canExist.met, true);
  assert.equal(emptyDeskHealth.canOperate.met, false);
  assert.ok(emptyDeskHealth.hiringNeeds.some((need) => need.kind === 'required-role' && need.roleId === 'qa-lead'));
  assert.ok(emptyDeskHealth.hiringNeeds.some((need) => need.kind === 'lead' && need.roleId === 'qa-lead'));

  const healthyDeskHealth = evaluateStaffingRule(getStaffingRule('desk', 'qa-lead'), [
    { roleId: 'qa-lead', isLead: true },
  ]);
  assert.equal(healthyDeskHealth.health, 'healthy');
  assert.equal(healthyDeskHealth.blocked, false);
  assert.deepEqual(healthyDeskHealth.optionalCoverage, []);

  const degradedDepartment = evaluateStaffingRule(intakeRule, [
    { roleId: 'context-manager' },
  ]);
  assert.equal(degradedDepartment.health, 'degraded');
  assert.equal(degradedDepartment.blocked, true);
  assert.equal(degradedDepartment.canExist.met, true);
  assert.equal(degradedDepartment.canOperate.met, false);
  assert.ok(degradedDepartment.hiringNeeds.some((need) => need.kind === 'required-role' && need.roleId === 'planner'));
  assert.ok(degradedDepartment.hiringNeeds.some((need) => need.kind === 'lead' && need.roleId === 'planner'));
  assert.ok(degradedDepartment.hiringNeeds.some((need) => need.kind === 'minimum-staffing'));

  const healthyDepartment = evaluateStaffingRule(intakeRule, [
    { roleId: 'context-manager' },
    { roleId: 'planner', isLead: true },
    { roleId: 'qa-lead' },
  ]);
  assert.equal(healthyDepartment.health, 'healthy');
  assert.equal(healthyDepartment.blocked, false);
  assert.ok(healthyDepartment.canExist.met);
  assert.ok(healthyDepartment.canOperate.met);
  assert.ok(healthyDepartment.optionalCoverage.includes('qa-lead'));

  const report = evaluateStaffingModel(STAFFING_RULES, {
    departments: {
      'context-intake': [
        { roleId: 'context-manager' },
        { roleId: 'planner', isLead: true },
      ],
      delivery: [
        { roleId: 'executor', isLead: true },
      ],
      governance: [
        { roleId: 'qa-lead' },
      ],
    },
    desks: {
      planner: [
        { roleId: 'planner', isLead: true },
      ],
      'qa-lead': [],
    },
  });

  assert.equal(report.entities.length, 11);
  assert.equal(report.summary.healthyCount, 2);
  assert.ok(report.summary.degradedCount >= 1);
  assert.ok(report.summary.blockedCount >= 1);
  assert.ok(report.hiringNeeds.some((need) => need.entityType === 'department' && need.entityId === 'delivery' && need.roleId === 'memory-archivist'));
  assert.ok(report.hiringNeeds.some((need) => need.entityType === 'department' && need.entityId === 'talent-acquisition' && need.roleId === 'integration_auditor'));
  assert.ok(report.hiringNeeds.some((need) => need.entityType === 'desk' && need.entityId === 'qa-lead' && need.roleId === 'qa-lead'));
  assert.equal(report.departments.find((entity) => entity.entityId === 'context-intake').health, 'healthy');
  assert.equal(report.departments.find((entity) => entity.entityId === 'talent-acquisition').health, 'blocked');
  assert.equal(report.desks.find((entity) => entity.entityId === 'planner').health, 'healthy');

  const assignments = buildStaffingAssignmentsFromTaHires([
    { hiredDeskId: 'planner', contractLocked: true },
  ]);
  assert.equal(assignments.desks.planner.length, 1);
  assert.equal(assignments.departments['context-intake'].length, 1);

  const gapModel = computeTaGapModel(STAFFING_RULES, []);
  assert.equal(gapModel.coverage.length, 11);
  assert.ok(gapModel.openRoles.some((entry) => entry.kind === 'missing lead'));
  assert.ok(gapModel.openRoles.some((entry) => entry.entityId === 'integration_auditor' && entry.kind === 'missing lead'));
  assert.ok(gapModel.blockers.every((entry) => entry.kind !== 'optional hire'));
  assert.ok(['critical', 'high', 'medium', 'low'].includes(gapModel.summary.urgency));
}
