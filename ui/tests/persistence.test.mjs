import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const persistencePath = path.resolve(process.cwd(), 'public', 'spatial', 'persistence.js');
const layoutModelPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioLayoutModel.js');

export default async function runPersistenceTests() {
  const persistence = await loadModuleCopy(persistencePath, { label: 'persistence' });
  const layoutModel = await loadModuleCopy(layoutModelPath, { label: 'studioLayoutModel-persistence' });
  assert.equal(typeof persistence.buildStudioStatePayload, 'function');
  assert.equal(typeof persistence.normalizeLoadedWorkspace, 'function');

  const oversizedPayload = {
    handoffs: {
      contextToPlanner: { id: 'handoff_1', title: 'Planner brief' },
      history: [{ id: 'handoff_1' }, null, { id: 'handoff_0' }],
    },
    teamBoard: {
      selectedCardId: 'card_7',
      cards: Array.from({ length: 12 }, (_, index) => ({
        id: `card_${index}`,
        title: `Task ${index}`,
        executionPackage: {
          changedFiles: Array.from({ length: 6 }, (__, fileIndex) => `src/file_${index}_${fileIndex}.js`),
        },
      })),
      summary: { review: 12 },
    },
  };

  const compactPayload = persistence.buildStudioStatePayload(oversizedPayload);
  assert.deepEqual(compactPayload, {
    handoffs: {
      contextToPlanner: { id: 'handoff_1', title: 'Planner brief' },
      history: [{ id: 'handoff_1' }, { id: 'handoff_0' }],
    },
    teamBoard: {
      selectedCardId: 'card_7',
    },
  });
  assert.ok(JSON.stringify(compactPayload).length < JSON.stringify(oversizedPayload).length / 4);

  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  };

  try {
    await persistence.saveStudioState(oversizedPayload);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/spatial/studio-state');
  assert.equal(requests[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(requests[0].options.body), compactPayload);

  const emptyWorkspace = persistence.normalizeLoadedWorkspace({ studio: {} });
  assert.equal(emptyWorkspace.studio.layout.departments.length, 7);
  assert.equal(emptyWorkspace.studio.layout.controlCentreDeskId, 'cto-architect');
  assert.deepEqual(
    emptyWorkspace.studio.layout.departments.map((department) => department.id).sort(),
    layoutModel.createDefaultStudioLayout().departments.map((department) => department.id).sort(),
  );

  const baseLayout = layoutModel.createDefaultStudioLayout();
  const expandedLayout = {
    ...baseLayout,
    departments: [
      ...baseLayout.departments,
      {
        id: 'dept-research-1',
        label: 'Research Cell',
        templateId: 'research',
        kind: 'research',
        summary: 'Expansion room for exploratory analysis and discovery work.',
        editable: true,
        visible: true,
        slotId: 'expansion-a',
        bounds: { x: 850, y: 86, width: 250, height: 176 },
        deskIds: ['analysis-1'],
        controlCentreDeskId: 'cto-architect',
        staffing: {
          requiredLeadSeatId: 'analysis-1',
          minimumActiveSeats: 1,
          baselineRoleIds: ['analysis-1'],
          openSeatPlaceholders: [],
        },
      },
    ],
    desks: {
      ...baseLayout.desks,
      'analysis-1': {
        id: 'analysis-1',
        label: 'Analysis Desk',
        templateId: 'analysis-node',
        type: 'analysis',
        capabilities: ['research', 'reports', 'discovery'],
        editable: true,
        departmentId: 'dept-research-1',
        position: { x: 900, y: 150 },
        assignedAgentIds: [],
        reportsToDeskId: 'cto-architect',
        staffing: {
          roleId: 'analysis-1',
          seatKind: 'core',
          placeholder: false,
        },
      },
    },
  };
  const loadedExpandedWorkspace = persistence.normalizeLoadedWorkspace({
    studio: {
      layout: expandedLayout,
      handoffs: { contextToPlanner: { id: 'handoff_2', title: 'Keep me' } },
    },
  });
  assert.ok(loadedExpandedWorkspace.studio.layout.departments.some((department) => department.id.startsWith('dept-research-')));
  assert.equal(loadedExpandedWorkspace.studio.handoffs.contextToPlanner.id, 'handoff_2');

  const fetchCalls = [];
  const originalFetchImpl = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalls.push(url);
    return {
      ok: true,
      json: async () => ({ studio: { layout: {} }, pages: ['page_1'] }),
    };
  };

  try {
    const loadedWorkspace = await persistence.loadWorkspace();
    assert.equal(loadedWorkspace.studio.layout.departments.length, 7);
    assert.ok(fetchCalls.includes('/api/spatial/workspace'));
  } finally {
    globalThis.fetch = originalFetchImpl;
  }
}
