import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runStudioLayoutModelTests() {
  const layoutModelPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioLayoutModel.js');
  const layoutModel = await loadModuleCopy(layoutModelPath, { label: 'studioLayoutModel-layout-test' });

  const expandedLayout = layoutModel.normalizeStudioLayout({
    departments: [
      {
        id: 'dept-research-1',
        label: 'Research Cell',
        kind: 'research',
        editable: true,
        visible: true,
        bounds: { x: 850, y: 86, width: 250, height: 176 },
        deskIds: ['analysis-1'],
      },
    ],
    desks: {
      'analysis-1': {
        id: 'analysis-1',
        label: 'Analysis Desk 1',
        departmentId: 'dept-research-1',
        type: 'analysis',
        capabilities: ['research', 'reports'],
        editable: true,
        assignedAgentIds: [],
        position: { x: 972, y: 160 },
      },
    },
  });

  assert.equal(expandedLayout.departments.length, 7);
  assert.equal(expandedLayout.desks['analysis-1'].departmentId, 'dept-research-1');
  assert.equal(layoutModel.getStudioDepartmentForDesk('analysis-1', expandedLayout).label, 'Research Cell');

  const renderModel = layoutModel.buildStudioRenderModel(expandedLayout, []);
  assert.equal(renderModel.departments.some((department) => department.id === 'dept-research-1'), true);
  assert.equal(renderModel.desks.some((desk) => desk.id === 'analysis-1'), true);
  assert.equal(renderModel.roomConnections.some((connection) => connection.id === 'dept-research-1-to-control'), true);
  assert.equal(renderModel.deskMap['analysis-1'].throughputLabel, 'No agent assigned');
  assert.equal(renderModel.departments.some((department) => department.id === 'dept-talent-acquisition'), true);
  assert.equal(renderModel.desks.some((desk) => desk.id === 'integration_auditor'), true);
  assert.equal(renderModel.departments.find((department) => department.id === 'dept-delivery').status, 'blocked');
  assert.ok(renderModel.departments.find((department) => department.id === 'dept-delivery').dependencyWarnings.length >= 1);
  assert.equal(renderModel.deskMap.planner.statusLabel, 'blocked');
  assert.ok(renderModel.deskMap.planner.dependencyWarnings.some((entry) => /No agent assigned/i.test(entry)));
  assert.equal(renderModel.desks.some((desk) => desk.id === 'context-manager'), false);
  assert.equal(renderModel.deskMap['context-manager'].visible, false);
  assert.equal(renderModel.deskMap['context-manager'].aliasOf, 'context');

  const defaultLayout = layoutModel.createDefaultStudioLayout();
  assert.equal(defaultLayout.departments.length, 6);
  assert.equal(defaultLayout.departments.some((department) => department.id === 'dept-talent-acquisition'), true);
  assert.equal(defaultLayout.departments.find((department) => department.id === 'dept-talent-acquisition').staffing.requiredLeadSeatId, 'integration_auditor');
  assert.equal(defaultLayout.departments.find((department) => department.id === 'dept-talent-acquisition').staffing.minimumActiveSeats, 1);
  assert.equal(defaultLayout.desks['context-manager'].visible, false);
  assert.equal(defaultLayout.desks['integration_auditor'].staffing.seatKind, 'lead');
  assert.equal(defaultLayout.desks['integration_auditor'].staffing.placeholder, true);
  const snappedPlannerPosition = layoutModel.snapDeskPositionToDepartment({ x: 40, y: 40 }, 'planner', defaultLayout);
  const plannerDepartment = defaultLayout.departments.find((department) => department.id === 'dept-delivery');
  assert.ok(snappedPlannerPosition.x >= plannerDepartment.bounds.x);
  assert.ok(snappedPlannerPosition.x <= plannerDepartment.bounds.x + plannerDepartment.bounds.width);
  assert.ok(snappedPlannerPosition.y >= plannerDepartment.bounds.y);
  assert.ok(snappedPlannerPosition.y <= plannerDepartment.bounds.y + plannerDepartment.bounds.height);
}
