import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runSpatialAppSmokeTest() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
  assert.equal(spatialApp.default.loaded, true);
  assert.ok(spatialApp.default.firstRender);
  assert.equal(typeof spatialApp.buildRsgActivityEntry, 'function');
  assert.equal(typeof spatialApp.pushRsgActivityEntry, 'function');
  assert.equal(typeof spatialApp.shouldRunFocusedRsgLoop, 'function');
  assert.equal(typeof spatialApp.resolveGeneratedNodeInspection, 'function');
  assert.equal(typeof spatialApp.renderDeskSection, 'function');
  assert.equal(typeof spatialApp.renderSimLaunchOverlay, 'function');

  const helpers = {
    runStructuredQA: () => undefined,
    runBrowserPass: () => undefined,
    openQARun: () => undefined,
  };
  assert.ok(spatialApp.renderDeskSection({
    id: 'qa-summary',
    label: 'QA Summary',
    kind: 'qa-summary',
    structuredStatus: 'running',
    structuredSummary: 'Structured QA suite is running now.',
    scorecardCount: 4,
    scorecardDeskCount: 4,
    latestBrowserRun: { scenario: 'layout-pass', verdict: 'pass', findingCount: 0 },
    localGate: {
      unit: { status: 'pass', failedCount: 0 },
      studioBoot: { verdict: 'pass', findingCount: 0 },
    },
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'structured',
    label: 'Structured QA',
    kind: 'qa-structured',
    busy: false,
    report: {
      status: 'pass',
      summary: 'Structured QA passed.',
      desks: [{ id: 'ui' }],
      failures: [],
    },
    scorecardCount: 1,
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'scorecards',
    label: 'Structured QA Scorecards',
    kind: 'qa-scorecards',
    suiteSummary: '1 scorecard ready.',
    cards: [{
      id: 'ui.contract_check',
      desk: 'ui',
      testId: 'contract_check',
      testName: 'Contract Check',
      status: 'pass',
      overallScore: { value: 4, max: 4 },
      validation: { summary: 'complete' },
    }],
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'browser',
    label: 'Browser Pass',
    kind: 'qa-browser',
    busy: false,
    latestRun: {
      id: 'qa_run_1',
      scenario: 'layout-pass',
      verdict: 'pass',
      trigger: 'manual',
      findingCount: 0,
      stepSummary: [],
    },
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'local-gates',
    label: 'Local UI Gate',
    kind: 'qa-local-gates',
    summary: 'Unit gate pass | Studio boot pass',
    gate: {
      unit: {
        status: 'pass',
        passedCount: 22,
        totalChecks: 22,
        failures: [],
      },
      studioBoot: {
        verdict: 'pass',
        findingCount: 0,
        consoleErrorCount: 0,
        networkFailureCount: 0,
        failedSteps: [],
      },
    },
  }, helpers));
  assert.ok(spatialApp.renderDeskSection({
    id: 'run-history',
    label: 'Recent QA Runs',
    kind: 'qa-run-history',
    items: [{
      id: 'qa_run_1',
      summary: 'layout-pass | pass',
      detail: 'Findings 0',
      at: '2026-03-25T09:00:00.000Z',
      runId: 'qa_run_1',
    }],
  }, helpers));

  assert.ok(spatialApp.renderSimLaunchOverlay({
    project: {
      key: 'topdown-slice',
      name: 'topdown-slice',
      launchable: true,
      supportedOrigin: 'http://127.0.0.1:4173/',
    },
    status: 'Ready to launch from the canvas layer.',
    launchedUrl: 'http://127.0.0.1:4173/',
    supportedOrigin: 'http://127.0.0.1:4173/',
    busy: false,
    error: '',
    onLaunch: () => undefined,
  }));
}
