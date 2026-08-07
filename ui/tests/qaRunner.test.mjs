import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  QA_RELATIVE_DIR,
  STRUCTURED_QA_RELATIVE_DIR,
  LOCAL_GATE_RELATIVE_DIR,
  analyzeStudioSnapshot,
  ensureLocalGateStorage,
  ensureQAStorage,
  ensureStructuredQAStorage,
  listQARuns,
  readLocalGateReport,
  readQARun,
  readStructuredQAReport,
  runQARun,
  summarizeQARun,
  writeLocalGateReport,
  writeStructuredQAReport,
} = require('../qaRunner.js');

function createHealthyStudioSnapshot() {
  return {
    room: { x: 72, y: 86, width: 1056, height: 642 },
    desks: [
      { id: 'planner', label: 'Planner', x: 220, y: 220 },
      { id: 'cto-architect', label: 'CTO / Architect', x: 460, y: 220 },
    ],
    whiteboards: [],
    links: [],
    controls: [
      { id: 'scene-canvas-button', label: 'Canvas button', visible: true },
      { id: 'scene-studio-button', label: 'ACE Studio button', visible: true },
      { id: 'recent-saves-select', label: 'Recent Saves', visible: true },
      { id: 'reset-view-button', label: 'Reset View', visible: true },
    ],
  };
}

function createMockBrowserFactory(snapshot = createHealthyStudioSnapshot()) {
  return async () => ({
    newContext: async () => ({
      newPage: async () => ({
        on: () => {},
        goto: async () => {},
        locator: () => ({
          waitFor: async () => {},
          click: async () => {},
        }),
        waitForTimeout: async () => {},
        screenshot: async () => Buffer.from('png'),
        content: async () => '<html><body>ACE</body></html>',
        evaluate: async () => snapshot,
        close: async () => {},
      }),
      close: async () => {},
    }),
    close: async () => {},
  });
}

async function withMockFetch(testFn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
  try {
    await testFn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export default async function runQARunnerTests() {
  const snapshot = {
    room: { x: 56, y: 72, width: 1088, height: 664 },
    roomRect: { left: 60, top: 40, width: 960, height: 610 },
    shellRect: { left: 0, top: 0, width: 1600, height: 900 },
    desks: [
      { id: 'planner', label: 'Planner', x: 590, y: 210 },
      { id: 'cto-architect', label: 'CTO', x: 930, y: 422 },
    ],
    whiteboards: [
      { id: 'teamBoard', label: 'Team Board', x: 284, y: 88, width: 584, height: 208 },
    ],
    links: [
      {
        id: 'handoff-1',
        label: 'Problem brief',
        kind: 'handoff',
        fromDeskId: 'planner',
        toDeskId: 'cto-architect',
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
      },
    ],
    controls: [
      { id: 'reset-view-button', label: 'Reset View', visible: false },
    ],
  };
  assert.ok(snapshot.whiteboards[0].x >= snapshot.room.x);
  assert.ok(snapshot.whiteboards[0].y >= snapshot.room.y);
  assert.ok(snapshot.whiteboards[0].x + snapshot.whiteboards[0].width <= snapshot.room.x + snapshot.room.width);
  assert.ok(snapshot.whiteboards[0].y + snapshot.whiteboards[0].height <= snapshot.room.y + snapshot.room.height);
  const findings = analyzeStudioSnapshot(snapshot);
  assert.ok(findings.some((finding) => finding.id === 'camera-off-center'));
  assert.ok(findings.some((finding) => finding.id === 'whiteboard-overlap-teamBoard-planner'));
  assert.ok(findings.some((finding) => finding.id === 'control-hidden-reset-view-button'));
  assert.ok(findings.some((finding) => finding.id === 'stale-anchor-handoff-1'));

  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-'));
  const storage = ensureQAStorage(rootPath);
  assert.equal(storage, path.join(rootPath, QA_RELATIVE_DIR));
  assert.equal(ensureStructuredQAStorage(rootPath), path.join(rootPath, STRUCTURED_QA_RELATIVE_DIR));
  assert.equal(ensureLocalGateStorage(rootPath), path.join(rootPath, LOCAL_GATE_RELATIVE_DIR));
  const run = {
    id: 'qa_001',
    scenario: 'layout-pass',
    mode: 'interactive',
    trigger: 'manual',
    status: 'completed',
    verdict: 'weak',
    createdAt: '2026-03-14T10:00:00.000Z',
    finishedAt: '2026-03-14T10:00:05.000Z',
    linked: { throughputSessionId: 'throughput_1' },
    artifacts: {
      screenshots: [{ name: '01-layout.png', label: 'Layout', path: path.join(rootPath, 'artifact.png') }],
    },
    findings: [{ id: 'warning-1', severity: 'warning', summary: 'Overlap detected.' }],
    steps: [{ id: 'capture', label: 'Capture', status: 'completed', verdict: 'pass' }],
  };
  fs.writeFileSync(path.join(storage, 'qa_001.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  const structuredReport = {
    status: 'pass',
    summary: 'all structured desks passed',
    desks: [{ desk: 'ui', status: 'pass', tests: [] }],
  };
  const localGateReport = {
    id: 'test-unit-latest',
    status: 'pass',
    summary: 'All 22 UI checks passed.',
    totalChecks: 22,
    passedCount: 22,
    failedCount: 0,
    failures: [],
  };
  writeStructuredQAReport(rootPath, structuredReport, 'latest');
  writeLocalGateReport(rootPath, 'test-unit-latest', localGateReport);

  const listed = listQARuns(rootPath);
  assert.equal(listed.length, 1);
  assert.equal(readQARun(rootPath, 'qa_001').id, 'qa_001');
  assert.equal(readStructuredQAReport(rootPath, 'latest').summary, 'all structured desks passed');
  assert.equal(readLocalGateReport(rootPath, 'test-unit-latest').passedCount, 22);
  const summary = summarizeQARun(listed[0]);
  assert.equal(summary.id, 'qa_001');
  assert.equal(summary.primaryScreenshot.url, '/api/spatial/qa/runs/qa_001/artifacts/01-layout.png');
  assert.equal(summary.highestSeverity, 'warning');

  await withMockFetch(async () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-runtime-'));
    try {
      const chromiumRun = await runQARun({
        rootPath: runtimeRoot,
        baseUrl: 'http://127.0.0.1:3000',
        scenario: 'studio-smoke',
        mode: 'observation',
        trigger: 'test',
        getRuntimeSnapshot: async () => ({ teamBoard: { summary: { review: 0 } } }),
        getHealthSnapshot: async () => ({ ok: true }),
        playwrightModule: {
          chromium: { launch: createMockBrowserFactory() },
          firefox: { launch: async () => { throw new Error('firefox should not be used'); } },
        },
      });
      assert.equal(chromiumRun.browser_status, 'pass');
      assert.deepEqual(chromiumRun.browser_runtime_target.attempted, ['chromium']);
      assert.equal(chromiumRun.browser_runtime_target.used, 'chromium');
      assert.equal(chromiumRun.browser_runtime_target.fallbackUsed, false);
      assert.equal(chromiumRun.browser.executablePath, null);
      assert.equal(chromiumRun.browser.engine, 'chromium');
      assert.equal(chromiumRun.browser_failure_stage, null);
      assert.ok(!JSON.stringify(chromiumRun).includes('msedge'));

      const firefoxFallbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-runtime-firefox-'));
      try {
        const firefoxRun = await runQARun({
          rootPath: firefoxFallbackRoot,
          baseUrl: 'http://127.0.0.1:3000',
          scenario: 'studio-smoke',
          mode: 'observation',
          trigger: 'test',
          getRuntimeSnapshot: async () => ({ teamBoard: { summary: { review: 0 } } }),
          getHealthSnapshot: async () => ({ ok: true }),
          playwrightModule: {
            chromium: {
              launch: async () => {
                const error = new Error('browserType.launch: spawn EPERM');
                error.code = 'EPERM';
                throw error;
              },
            },
            firefox: { launch: createMockBrowserFactory() },
          },
          systemBrowserFallback: false,
        });
        assert.equal(firefoxRun.browser_status, 'pass');
        assert.deepEqual(firefoxRun.browser_runtime_target.attempted, ['chromium', 'firefox']);
        assert.equal(firefoxRun.browser_runtime_target.used, 'firefox');
        assert.equal(firefoxRun.browser_runtime_target.fallbackUsed, true);
        assert.equal(firefoxRun.browser_failure_stage, null);
      } finally {
        fs.rmSync(firefoxFallbackRoot, { recursive: true, force: true });
      }

      const blockedLaunchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-runtime-blocked-'));
      try {
        const blockedRun = await runQARun({
          rootPath: blockedLaunchRoot,
          baseUrl: 'http://127.0.0.1:3000',
          scenario: 'studio-smoke',
          mode: 'observation',
          trigger: 'test',
          playwrightModule: {
            chromium: {
              launch: async () => {
                const error = new Error('browserType.launch: spawn EPERM');
                error.code = 'EPERM';
                throw error;
              },
            },
            firefox: {
              launch: async () => {
                const error = new Error('browserType.launch: spawn EPERM');
                error.code = 'EPERM';
                throw error;
              },
            },
          },
          systemBrowserFallback: false,
        });
        assert.equal(blockedRun.status, 'failed');
        assert.equal(blockedRun.browser_status, 'blocked_machine_launch');
        assert.equal(blockedRun.browser_failure_stage, 'launch');
        assert.equal(blockedRun.browser_failure_code, 'windows_spawn_eperm');
        assert.deepEqual(blockedRun.browser_runtime_target.attempted, ['chromium', 'firefox']);
        assert.equal(blockedRun.browser_runtime_target.used, null);
        assert.equal(blockedRun.browser_runtime_target.fallbackUsed, true);
        assert.match(blockedRun.browser_failure_summary || '', /chromium/i);
        assert.match(blockedRun.browser_failure_summary || '', /firefox/i);
      } finally {
        fs.rmSync(blockedLaunchRoot, { recursive: true, force: true });
      }

      const systemFallbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-runtime-system-browser-'));
      try {
        const systemExecutable = path.join(systemFallbackRoot, 'chrome.exe');
        fs.writeFileSync(systemExecutable, '', 'utf8');
        const systemRun = await runQARun({
          rootPath: systemFallbackRoot,
          baseUrl: 'http://127.0.0.1:3000',
          scenario: 'studio-smoke',
          mode: 'observation',
          trigger: 'test',
          getRuntimeSnapshot: async () => ({ teamBoard: { summary: { review: 0 } } }),
          getHealthSnapshot: async () => ({ ok: true }),
          systemBrowserExecutable: systemExecutable,
          playwrightModule: {
            chromium: {
              launch: async (options = {}) => {
                if (options.executablePath === systemExecutable) return createMockBrowserFactory()();
                throw new Error('managed chromium missing');
              },
            },
            firefox: { launch: async () => { throw new Error('managed firefox missing'); } },
          },
        });
        assert.equal(systemRun.browser_status, 'pass');
        assert.deepEqual(systemRun.browser_runtime_target.attempted, ['chromium', 'firefox', 'system-chromium']);
        assert.equal(systemRun.browser_runtime_target.used, 'system-chromium');
        assert.equal(systemRun.browser_runtime_target.fallbackUsed, true);
        assert.equal(systemRun.browser.executablePath, systemExecutable);
      } finally {
        fs.rmSync(systemFallbackRoot, { recursive: true, force: true });
      }

      const skippedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-runtime-skipped-'));
      try {
        const skippedRun = await runQARun({
          rootPath: skippedRoot,
          browserDisabled: true,
        });
        assert.equal(skippedRun.browser_status, 'skipped_by_policy');
        assert.equal(skippedRun.browser_failure_stage, null);
        assert.equal(skippedRun.browser_runtime_target.used, null);
        assert.deepEqual(skippedRun.browser_runtime_target.attempted, ['chromium', 'firefox']);
      } finally {
        fs.rmSync(skippedRoot, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });
}
