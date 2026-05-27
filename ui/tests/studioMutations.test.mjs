import assert from 'node:assert/strict';
import path from 'node:path';

import { materializeModuleCopy } from './helpers/browser-module-loader.mjs';

const studioMutationsPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioMutations.js');

async function loadStudioMutationModules() {
  const moduleCopy = await materializeModuleCopy(studioMutationsPath, { label: 'studioMutations' });
  return import(moduleCopy.url);
}

export default async function runStudioMutationTests() {
  const {
    addDepartmentFromTemplate,
    addDeskToDepartment,
    studioMutationTemplates,
  } = await loadStudioMutationModules();

  const emptyHierarchy = { departments: [] };
  const departmentResult = addDepartmentFromTemplate(emptyHierarchy, 'context-intake');
  assert.equal(departmentResult.ok, true);
  assert.equal(departmentResult.reason, null);
  assert.equal(departmentResult.hierarchy.departments.length, 1);
  assert.equal(departmentResult.department.templateId, 'context-intake');
  assert.deepEqual(
    departmentResult.department.bounds,
    studioMutationTemplates.departments['context-intake'].bounds,
  );
  assert.equal(departmentResult.department.desks.length, 2);
  assert.deepEqual(
    departmentResult.department.desks.map((desk) => desk.templateId),
    ['context-manager', 'planner'],
  );
  assert.ok(departmentResult.department.desks.every((desk) => desk.departmentId === departmentResult.department.id));
  assert.ok(departmentResult.department.desks.every((desk) => desk.position.x > departmentResult.department.bounds.x));
  assert.ok(departmentResult.department.desks.every((desk) => desk.position.y > departmentResult.department.bounds.y));

  const invalidDepartmentResult = addDepartmentFromTemplate(emptyHierarchy, 'missing-template');
  assert.equal(invalidDepartmentResult.ok, false);
  assert.equal(invalidDepartmentResult.reason, 'unknown-department-template');
  assert.deepEqual(invalidDepartmentResult.hierarchy, emptyHierarchy);

  const duplicateDepartmentIdHierarchy = {
    departments: [
      {
        id: 'context-intake-department',
        templateId: 'context-intake',
        label: 'Context Intake',
        bounds: { x: 96, y: 132, width: 420, height: 236 },
        desks: [],
      },
    ],
  };
  const duplicateDepartmentResult = addDepartmentFromTemplate(duplicateDepartmentIdHierarchy, 'context-intake', {
    id: 'context-intake-department',
  });
  assert.equal(duplicateDepartmentResult.ok, false);
  assert.equal(duplicateDepartmentResult.reason, 'duplicate-department-id');

  const fallbackBoundsResult = addDepartmentFromTemplate(departmentResult.hierarchy, 'delivery', {
    bounds: { x: 'bad', y: null, width: undefined, height: NaN },
  });
  assert.equal(fallbackBoundsResult.ok, true);
  assert.deepEqual(
    fallbackBoundsResult.department.bounds,
    studioMutationTemplates.departments.delivery.bounds,
  );

  const deskTargetHierarchy = departmentResult.hierarchy;
  const deskResult = addDeskToDepartment(deskTargetHierarchy, departmentResult.department.id, 'executor');
  assert.equal(deskResult.ok, true);
  assert.equal(deskResult.reason, null);
  assert.equal(deskResult.department.desks.length, 3);
  assert.equal(deskResult.desk.templateId, 'executor');
  assert.equal(deskResult.desk.departmentId, departmentResult.department.id);
  assert.deepEqual(deskResult.desk.bounds, {
    x: deskResult.department.bounds.x + 24,
    y: deskResult.department.bounds.y + 52 + 92,
    width: 152,
    height: 72,
  });
  assert.equal(deskResult.desk.position.x, deskResult.desk.bounds.x + 76);
  assert.equal(deskResult.desk.position.y, deskResult.desk.bounds.y + 36);

  const missingDepartmentResult = addDeskToDepartment(emptyHierarchy, 'missing-department', 'qa-lead');
  assert.equal(missingDepartmentResult.ok, false);
  assert.equal(missingDepartmentResult.reason, 'unknown-department');

  const unknownDeskTemplateResult = addDeskToDepartment(deskTargetHierarchy, departmentResult.department.id, 'unknown-desk');
  assert.equal(unknownDeskTemplateResult.ok, false);
  assert.equal(unknownDeskTemplateResult.reason, 'unknown-desk-template');

  const duplicateDeskIdResult = addDeskToDepartment(deskResult.hierarchy, departmentResult.department.id, 'executor', {
    id: deskResult.desk.id,
  });
  assert.equal(duplicateDeskIdResult.ok, false);
  assert.equal(duplicateDeskIdResult.reason, 'duplicate-desk-id');
}
