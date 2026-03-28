import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runStudioOrgHealthModelTests() {
  const layoutModelPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioLayoutModel.js');
  const layoutModel = await loadModuleCopy(layoutModelPath, { label: 'studioOrgHealthModel-test' });

  const baseLayout = layoutModel.createDefaultStudioLayout();
  const healthyLayout = {
    ...baseLayout,
    departments: [
      ...baseLayout.departments,
      {
        id: 'dept-support-1',
        label: 'Support Cell',
        kind: 'support',
        editable: true,
        visible: true,
        bounds: { x: 820, y: 120, width: 180, height: 140 },
        deskIds: ['support-1'],
        controlCentreDeskId: 'cto-architect',
      },
      {
        id: 'dept-research-1',
        label: 'Research Cell',
        kind: 'research',
        editable: true,
        visible: true,
        bounds: { x: 820, y: 300, width: 180, height: 140 },
        deskIds: ['research-1'],
        controlCentreDeskId: 'cto-architect',
      },
    ],
    desks: {
      ...baseLayout.desks,
      'support-1': {
        id: 'support-1',
        label: 'Support Desk 1',
        departmentId: 'dept-support-1',
        type: 'support',
        capabilities: ['ops'],
        editable: true,
        assignedAgentIds: ['support-1'],
        position: { x: 892, y: 180 },
        reportsToDeskId: 'cto-architect',
      },
      'research-1': {
        id: 'research-1',
        label: 'Research Desk 1',
        departmentId: 'dept-research-1',
        type: 'analysis',
        capabilities: ['research'],
        editable: true,
        assignedAgentIds: [],
        position: { x: 892, y: 360 },
        reportsToDeskId: 'cto-architect',
      },
    },
  };

  const healthyHealth = layoutModel.buildStudioOrgHealthModel(healthyLayout, [
    { id: 'context-manager', name: 'Context Manager', status: 'idle' },
    { id: 'planner', name: 'Planner', status: 'idle' },
    { id: 'executor', name: 'Executor', status: 'idle' },
    { id: 'qa-lead', name: 'QA Lead', status: 'idle' },
    { id: 'memory-archivist', name: 'Memory Archivist', status: 'idle' },
    { id: 'cto-architect', name: 'CTO / Architect', status: 'idle' },
    { id: 'support-1', name: 'Support Agent', status: 'idle' },
  ]);

  assert.equal(healthyHealth.summary.activeCount >= 5, true);
  assert.equal(healthyHealth.departments.find((entry) => entry.id === 'dept-delivery').health.status, 'active');
  assert.equal(healthyHealth.departments.find((entry) => entry.id === 'dept-support-1').health.status, 'support-only');
  assert.equal(healthyHealth.departments.find((entry) => entry.id === 'dept-research-1').health.status, 'understaffed');
  assert.equal(healthyHealth.departments.find((entry) => entry.id === 'dept-research-1').health.missingRequirements[0].code, 'no-live-staffing');
  assert.match(healthyHealth.departments.find((entry) => entry.id === 'dept-support-1').health.summary, /support-only/i);
  assert.equal(healthyHealth.departments.find((entry) => entry.id === 'dept-research-1').health.missingRequirementCount >= 1, true);
  assert.equal(healthyHealth.departments.find((entry) => entry.id === 'dept-delivery').health.missingRequirementCount, 0);

  const blockedHealth = layoutModel.buildStudioOrgHealthModel(healthyLayout, [
    { id: 'context-manager', name: 'Context Manager', status: 'idle' },
    { id: 'planner', name: 'Planner', status: 'idle' },
    { id: 'executor', name: 'Executor', status: 'idle' },
    { id: 'qa-lead', name: 'QA Lead', status: 'idle' },
    { id: 'memory-archivist', name: 'Memory Archivist', status: 'idle' },
    { id: 'cto-architect', name: 'CTO / Architect', status: 'blocked' },
    { id: 'support-1', name: 'Support Agent', status: 'idle' },
  ]);

  assert.equal(blockedHealth.departments.find((entry) => entry.id === 'dept-delivery').health.status, 'blocked');
  assert.ok(blockedHealth.departments.find((entry) => entry.id === 'dept-delivery').health.missingRequirements.some((entry) => entry.code === 'missing-control-centre'));
  assert.ok(blockedHealth.departments.find((entry) => entry.id === 'dept-delivery').health.reasons.some((reason) => /Control Centre/i.test(reason)));
  assert.equal(blockedHealth.summary.blockedCount >= 1, true);
}
