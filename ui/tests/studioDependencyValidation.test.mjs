import assert from 'node:assert/strict';
import path from 'node:path';

import { materializeModuleCopy } from './helpers/browser-module-loader.mjs';

const studioMutationsPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioMutations.js');

async function loadStudioMutationModules() {
  const moduleCopy = await materializeModuleCopy(studioMutationsPath, { label: 'studioMutations-dependency' });
  return import(moduleCopy.url);
}

export default async function runStudioDependencyValidationTests() {
  const {
    addDepartmentFromTemplate,
    addDeskToDepartment,
    validateStudioDependencies,
  } = await loadStudioMutationModules();

  const emptyHierarchy = { departments: [] };

  const blockedDepartmentValidation = validateStudioDependencies({
    hierarchy: emptyHierarchy,
    action: 'add-department',
    templateId: 'delivery',
    targetId: 'delivery-department',
  });
  assert.equal(blockedDepartmentValidation.status, 'block');
  assert.ok(blockedDepartmentValidation.issues.some((issue) => issue.code === 'missing-parent-department'));
  assert.ok(blockedDepartmentValidation.issues.some((issue) => issue.code === 'missing-lead-dependency'));

  const blockedDepartmentResult = addDepartmentFromTemplate(emptyHierarchy, 'delivery');
  assert.equal(blockedDepartmentResult.ok, false);
  assert.equal(blockedDepartmentResult.reason, 'dependency-validation-blocked');
  assert.equal(blockedDepartmentResult.validation.status, 'block');

  const contextDepartment = addDepartmentFromTemplate(emptyHierarchy, 'context-intake');
  assert.equal(contextDepartment.ok, true);

  const warnedDepartmentResult = addDepartmentFromTemplate(contextDepartment.hierarchy, 'delivery');
  assert.equal(warnedDepartmentResult.ok, true);
  assert.equal(warnedDepartmentResult.validation.status, 'warn');
  assert.ok(warnedDepartmentResult.validation.warnings.some((issue) => issue.code === 'missing-support-dependency'));
  assert.equal(warnedDepartmentResult.department.templateId, 'delivery');

  const customDepartmentHierarchy = {
    departments: [
      {
        id: 'dept_misc',
        templateId: 'context-intake',
        label: 'Misc',
        bounds: { x: 96, y: 132, width: 420, height: 236 },
        desks: [
          {
            id: 'desk_context',
            templateId: 'context-manager',
            departmentId: 'dept_misc',
            label: 'Context Manager',
            role: 'Captures intent and routes context into the archive lane.',
            bounds: { x: 120, y: 184, width: 152, height: 72 },
            position: { x: 196, y: 220 },
          },
        ],
      },
    ],
  };

  const warningDeskValidation = validateStudioDependencies({
    hierarchy: customDepartmentHierarchy,
    action: 'add-desk',
    templateId: 'memory-archivist',
    departmentId: 'dept_misc',
    targetId: 'desk_memory',
  });
  assert.equal(warningDeskValidation.status, 'warn');
  assert.ok(warningDeskValidation.issues.some((issue) => issue.code === 'missing-support-dependency'));

  const warningDeskResult = addDeskToDepartment(customDepartmentHierarchy, 'dept_misc', 'memory-archivist');
  assert.equal(warningDeskResult.ok, true);
  assert.equal(warningDeskResult.validation.status, 'warn');
  assert.ok(warningDeskResult.validation.warnings.some((issue) => issue.code === 'missing-support-dependency'));
  assert.equal(warningDeskResult.desk.templateId, 'memory-archivist');

  const blockedDeskResult = addDeskToDepartment(customDepartmentHierarchy, 'dept_misc', 'executor');
  assert.equal(blockedDeskResult.ok, false);
  assert.equal(blockedDeskResult.reason, 'dependency-validation-blocked');
  assert.equal(blockedDeskResult.validation.status, 'block');
  assert.ok(blockedDeskResult.validation.blockers.some((issue) => issue.code === 'missing-lead-dependency'));
}

