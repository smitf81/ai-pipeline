import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy, smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runChiefOfStaffStudioUiTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const aceConnectorPath = path.resolve(process.cwd(), 'public', 'spatial', 'aceConnector.js');
  const windowStatePath = path.resolve(process.cwd(), 'public', 'spatial', 'windowState.js');
  const layoutModelPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioLayoutModel.js');

  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa-chief' });
  const { AceConnector } = await loadModuleCopy(aceConnectorPath, { label: 'chiefOfStaffStudioUi-connector' });
  const windowState = await loadModuleCopy(windowStatePath, { label: 'chiefOfStaffStudioUi-windowState' });
  const layoutModel = await loadModuleCopy(layoutModelPath, { label: 'chiefOfStaffStudioUi-layout' });

  const defaultLayout = layoutModel.createDefaultStudioLayout();
  const controlCentre = defaultLayout.departments.find((department) => department.id === 'dept-control');
  assert.deepEqual(controlCentre.deskIds, ['cto-chief-of-staff', 'cto-architect']);
  assert.equal(defaultLayout.desks['cto-chief-of-staff'].position.x < defaultLayout.desks['cto-architect'].position.x, true);

  const defaultUtilityWindows = windowState.createDefaultUtilityWindows();
  assert.equal(defaultUtilityWindows['executive-advisory'].docked, false);
  assert.equal(defaultUtilityWindows['executive-advisory'].targetDeskId, 'cto-chief-of-staff');

  const fallbackView = spatialApp.buildChiefOfStaffAdvisoryViewModel({
    payload: {
      reply_text: 'Planning is blocked by dirty_repo_blocked.',
      reply_source: 'deterministic_fallback',
      model_backend: 'ollama_http',
      model_name: 'qwen2.5-coder:1.5b',
      model_status: 'timeout',
      advisory_generated_at: '2026-04-10T10:15:00.000Z',
      recommendation: {
        id: 'resolve_blocker',
        title: 'Resolve system blocker',
        category: 'unblock',
        blocker: 'dirty_repo_blocked',
        why_now: 'System execution is currently blocked',
        execution_ready: false,
        confidence: 0.9,
      },
      posture: {
        blocked: true,
        blocker: { failure_key: 'dirty_repo_blocked', stage: 'planning', count: 4 },
        canonical_available: false,
        system_confidence: 0.9,
      },
    },
  });
  assert.equal(fallbackView.panelTitle, 'Executive Advisory');
  assert.equal(fallbackView.panelKind, 'executive-advisory');
  assert.equal(fallbackView.renderMode, 'dedicated-panel');
  assert.equal(fallbackView.relationshipLabel, 'Advises CTO Architect');
  assert.equal(fallbackView.replyText, 'Planning is blocked by dirty_repo_blocked.');
  assert.equal(fallbackView.recommendation.title, 'Resolve system blocker');
  assert.equal(fallbackView.recommendation.category, 'unblock');
  assert.equal(fallbackView.recommendation.confidence_percent, 90);
  assert.equal(fallbackView.executionReady, false);
  assert.equal(fallbackView.blocker, 'dirty_repo_blocked');
  assert.equal(fallbackView.replySource, 'deterministic_fallback');
  assert.equal(fallbackView.modelStatus, 'timeout');
  assert.ok(fallbackView.quickPrompts.includes('Why is planning blocked?'));

  const partialView = spatialApp.buildChiefOfStaffAdvisoryViewModel({
    payload: {
      reply_text: 'Canonical truth is unavailable, so visibility is limited.',
      reply_source: 'deterministic_fallback',
      model_status: 'fallback',
      recommendation: {
        title: 'No critical blockers detected',
        category: 'info',
        confidence: 0.5,
        execution_ready: false,
      },
      posture: {
        blocked: false,
        canonical_available: false,
      },
    },
  });
  assert.equal(partialView.replyText.length > 0, true);
  assert.equal(partialView.executionReady, false);
  assert.equal(partialView.posture.canonical_available, false);

  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(url);
    return {
      ok: true,
      json: async () => ({
        reply_text: 'Planning is blocked by dirty_repo_blocked.',
        reply_source: 'model_live',
        model_backend: 'ollama_http',
        model_name: 'qwen2.5-coder:1.5b',
        model_status: 'ok',
        recommendation: {
          title: 'Resolve system blocker',
          category: 'unblock',
          blocker: 'dirty_repo_blocked',
          confidence: 0.9,
          execution_ready: false,
        },
        posture: {
          blocked: true,
          blocker: { failure_key: 'dirty_repo_blocked', count: 2 },
          canonical_available: true,
          system_confidence: 0.9,
        },
      }),
    };
  };

  try {
    const connector = new AceConnector();
    const response = await connector.askChiefOfStaff('Why is planning failing?');
    assert.equal(response.recommendation.blocker, 'dirty_repo_blocked');
    assert.equal(requests[0], '/api/cto-chief-of-staff/query?q=Why%20is%20planning%20failing%3F');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
