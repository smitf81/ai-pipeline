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
  summarizeQARun,
  writeLocalGateReport,
  writeStructuredQAReport,
} = require('../qaRunner.js');

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
}
