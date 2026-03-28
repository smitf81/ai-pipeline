import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const require = createRequire(import.meta.url);
const uiActionRegistryPath = path.resolve(process.cwd(), 'public', 'spatial', 'uiActionRegistry.js');
const studioLayoutSchemaPath = path.resolve(process.cwd(), 'studioLayoutSchema.js');
const {
  createDefaultStudioLayoutSchema,
} = require(studioLayoutSchemaPath);

export default async function runUiActionRegistryTests() {
  const {
    buildActionPayload,
    runUiAction,
  } = await loadModuleCopy(uiActionRegistryPath, { label: 'uiActionRegistry' });

  assert.deepEqual(buildActionPayload('add_department', {
    layoutMutationDraft: { departmentTemplateId: 'research' },
  }), {
    templateId: 'research',
  });
  assert.deepEqual(buildActionPayload('add_desk', {
    layoutMutationDraft: { deskDepartmentId: 'dept-delivery', deskTemplateId: 'analysis-node' },
  }), {
    departmentId: 'dept-delivery',
    templateId: 'analysis-node',
  });
  assert.deepEqual(buildActionPayload('toggle_utility_dock', {
    utilityDockOpen: false,
  }), {
    nextValue: true,
  });

  const actionStatuses = [];
  const canonicalLayout = createDefaultStudioLayoutSchema();
  const blockedDepartmentResult = {
    ok: false,
    validation: {
      status: 'block',
      issues: [{ reason: 'Parent department is missing.' }],
      blockers: [{ reason: 'Parent department is missing.' }],
      warnings: [],
    },
    layout: canonicalLayout,
    createdDepartmentId: null,
    createdDeskId: null,
    focusDeskId: null,
  };
  const warningDeskResult = {
    ok: true,
    validation: {
      status: 'warn',
      issues: [{ reason: 'Support room is incomplete.' }],
      blockers: [],
      warnings: [{ reason: 'Support room is incomplete.' }],
    },
    layout: {
      ...canonicalLayout,
      marker: 'warning-canonical-layout',
    },
    createdDepartmentId: null,
    createdDeskId: 'analysis-1',
    focusDeskId: 'analysis-1',
  };
  const successDepartmentResult = {
    ok: true,
    validation: {
      status: 'pass',
      issues: [],
      blockers: [],
      warnings: [],
    },
    layout: {
      ...canonicalLayout,
      marker: 'canonical-server-truth',
    },
    createdDepartmentId: 'dept-research-1',
    createdDeskId: null,
    focusDeskId: null,
  };

  const blockedDepartmentOutcome = await runUiAction('add_department', {
    ace: {
      addDepartment: async (payload) => {
        assert.deepEqual(payload, { templateId: 'research' });
        return blockedDepartmentResult;
      },
    },
    layoutMutationDraft: { departmentTemplateId: 'research' },
    setActionStatus: (actionId, status) => actionStatuses.push({ actionId, status }),
  });
  assert.equal(blockedDepartmentOutcome.ok, false);
  assert.equal(blockedDepartmentOutcome.status.phase, 'blocked');
  assert.match(blockedDepartmentOutcome.status.label, /Parent department is missing/i);
  assert.ok(actionStatuses.some((entry) => entry.actionId === 'add_department' && entry.status.phase === 'running'));
  assert.ok(actionStatuses.some((entry) => entry.actionId === 'add_department' && entry.status.phase === 'blocked'));
  assert.ok(!actionStatuses.some((entry) => entry.actionId === 'add_department' && entry.status.phase === 'success'));

  const warningDeskOutcome = await runUiAction('add_desk', {
    ace: {
      addDesk: async (payload) => {
        assert.deepEqual(payload, {
          departmentId: 'dept-delivery',
          templateId: 'analysis-node',
        });
        return warningDeskResult;
      },
    },
    layoutMutationDraft: {
      deskDepartmentId: 'dept-delivery',
      deskTemplateId: 'analysis-node',
    },
    setActionStatus: (actionId, status) => actionStatuses.push({ actionId, status }),
  });
  assert.equal(warningDeskOutcome.ok, true);
  assert.equal(warningDeskOutcome.status.phase, 'warning');
  assert.match(warningDeskOutcome.status.label, /added with warnings/i);
  assert.equal(warningDeskOutcome.result.layout.marker, 'warning-canonical-layout');
  assert.ok(actionStatuses.some((entry) => entry.actionId === 'add_desk' && entry.status.phase === 'running'));
  assert.ok(actionStatuses.some((entry) => entry.actionId === 'add_desk' && entry.status.phase === 'warning'));

  const successDepartmentOutcome = await runUiAction('add_department', {
    ace: {
      addDepartment: async () => successDepartmentResult,
    },
    layoutMutationDraft: { departmentTemplateId: 'research' },
    setActionStatus: (actionId, status) => actionStatuses.push({ actionId, status }),
  });
  assert.equal(successDepartmentOutcome.ok, true);
  assert.equal(successDepartmentOutcome.status.phase, 'success');
  assert.equal(successDepartmentOutcome.result.layout.marker, 'canonical-server-truth');
  assert.equal(successDepartmentOutcome.result.createdDepartmentId, 'dept-research-1');

  const utilityState = { value: false };
  const utilityOutcome = await runUiAction('toggle_utility_dock', {
    utilityDockOpen: utilityState.value,
    setUtilityDockOpen: (nextValue) => {
      utilityState.value = nextValue;
    },
    setActionStatus: (actionId, status) => actionStatuses.push({ actionId, status }),
  });
  assert.equal(utilityState.value, true);
  assert.equal(utilityOutcome.result.utilityDockOpen, true);
  assert.ok(actionStatuses.some((entry) => entry.actionId === 'toggle_utility_dock' && entry.status.phase === 'success'));
}
