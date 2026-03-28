import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const resourceSignalModelPath = path.resolve(process.cwd(), 'public', 'spatial', 'resourceSignalModel.js');

function createDepartment({
  id,
  label,
  status,
  blockerCount = 0,
  staffingGapCount = 0,
  weakRelationshipCount = 0,
  missingLead = false,
} = {}) {
  const missingRequirements = [];
  for (let index = 0; index < blockerCount; index += 1) {
    missingRequirements.push({
      kind: index === 0 && missingLead ? 'staffing' : 'dependency',
      code: index === 0 && missingLead ? 'missing-lead' : `blocker-${index + 1}`,
      severity: 'block',
      reason: index === 0 && missingLead ? 'Missing lead.' : `Blocking dependency ${index + 1}.`,
    });
  }
  for (let index = 0; index < staffingGapCount; index += 1) {
    missingRequirements.push({
      kind: 'staffing',
      code: `gap-${index + 1}`,
      severity: 'warn',
      reason: `Staffing gap ${index + 1}.`,
    });
  }
  if (missingLead && blockerCount === 0) {
    missingRequirements.push({
      kind: 'staffing',
      code: 'missing-lead',
      severity: 'block',
      reason: 'Missing lead.',
    });
  }
  return {
    id,
    label,
    status,
    health: {
      status,
      missingRequirements,
      staffing: {
        openRoleCount: staffingGapCount,
        optionalRoleCount: 0,
        blockerCount,
      },
      dependency: {
        dependencyBlocked: blockerCount > 0,
      },
    },
    weakRelationshipCount,
  };
}

export default async function runResourceSignalModelTests() {
  const modelModule = await loadModuleCopy(resourceSignalModelPath, { label: 'resourceSignalModel' });

  const resourceSignalModel = modelModule.buildResourceSignalModel({
    orgHealthModel: {
      departments: [
        createDepartment({
          id: 'dept-delivery',
          label: 'Delivery',
          status: 'blocked',
          blockerCount: 1,
          staffingGapCount: 2,
          weakRelationshipCount: 1,
          missingLead: true,
        }),
        createDepartment({
          id: 'dept-quality',
          label: 'Quality',
          status: 'blocked',
          blockerCount: 1,
          staffingGapCount: 2,
          weakRelationshipCount: 1,
          missingLead: false,
        }),
        createDepartment({
          id: 'dept-archive',
          label: 'Archive',
          status: 'understaffed',
          blockerCount: 0,
          staffingGapCount: 2,
          weakRelationshipCount: 0,
          missingLead: false,
        }),
        createDepartment({
          id: 'dept-intake',
          label: 'Intake',
          status: 'active',
          blockerCount: 0,
          staffingGapCount: 0,
          weakRelationshipCount: 2,
          missingLead: false,
        }),
      ],
    },
    relationshipSignals: [
      { subjectType: 'department', subjectId: 'dept-delivery' },
      { subjectType: 'department', subjectId: 'dept-quality' },
      { subjectType: 'department', subjectId: 'dept-archive' },
      { subjectType: 'department', subjectId: 'dept-intake' },
      { subjectType: 'department', subjectId: 'dept-intake' },
    ],
  });

  assert.equal(resourceSignalModel.summary.totalDepartments, 4);
  assert.equal(resourceSignalModel.summary.highPressureCount >= 2, true);
  assert.equal(resourceSignalModel.summary.lowPressureCount >= 1, true);

  const delivery = modelModule.getDepartmentResourceSignal('dept-delivery', resourceSignalModel);
  const quality = modelModule.getDepartmentResourceSignal('dept-quality', resourceSignalModel);
  const archive = modelModule.getDepartmentResourceSignal('dept-archive', resourceSignalModel);
  const intake = modelModule.getDepartmentResourceSignal('dept-intake', resourceSignalModel);

  assert.ok(delivery.priorityScore > quality.priorityScore);
  assert.ok(quality.priorityScore > archive.priorityScore);
  assert.ok(archive.priorityScore > intake.priorityScore);
  assert.equal(delivery.resourcePressure, 'high');
  assert.equal(delivery.missingLead, true);
  assert.ok(delivery.reasonSummary.includes('Missing lead'));
  assert.ok(delivery.reasonSummary.some((reason) => reason.includes('staffing gap')));
  assert.equal(archive.resourcePressure, 'medium');
  assert.equal(intake.resourcePressure, 'low');
  assert.equal(intake.weakRelationshipCount, 2);

  const sortedIds = modelModule.listDepartmentsByPriority(resourceSignalModel).map((entry) => entry.departmentId);
  assert.deepEqual(sortedIds, ['dept-delivery', 'dept-quality', 'dept-archive', 'dept-intake']);
  assert.deepEqual(modelModule.getDepartmentResourceSignal('missing-department', resourceSignalModel), null);

  const tieModel = modelModule.buildResourceSignalModel({
    orgHealthModel: {
      departments: [
        createDepartment({ id: 'dept-alpha', label: 'Alpha', status: 'active' }),
        createDepartment({ id: 'dept-beta', label: 'Beta', status: 'active' }),
      ],
    },
    relationshipSignals: [],
  });
  assert.deepEqual(modelModule.listDepartmentsByPriority(tieModel).map((entry) => entry.departmentId), ['dept-alpha', 'dept-beta']);
}
