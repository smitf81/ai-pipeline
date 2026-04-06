import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeJson(rootPath, relativePath, payload) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode || 0,
          json: responseBody ? JSON.parse(responseBody) : null,
        });
      });
    }).on('error', reject);
  });
}

export default async function runGovernedLoopContractTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-governed-loop-'));
  const {
    app,
    buildGovernedLoopContract,
  } = require('../server.js');
  const {
    writePlannerQaQueue,
  } = require('../plannerQaQueue.js');
  const {
    writePlannerOuttray,
  } = require('../plannerOuttray.js');
  const {
    writeStructuredQAReport,
  } = require('../qaRunner.js');
  const {
    writeQaLeadRun,
  } = require('../qaLeadRunner.js');
  const {
    recordRepairAttempt,
    writeQaRepairJobs,
  } = require('../qaRepairLoop.js');

  writeJson(rootPath, 'data/spatial/workspace.json', {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    annotations: [{ id: 'annotation_1', text: 'Boot failure evidence' }],
    sketches: [{ id: 'sketch_1', label: 'Repair sketch' }],
    pages: [],
    activePageId: 'page_1',
    studio: {
      ctoPipeline: {
        id: 'cto_pipeline_1',
        roleIndex: 1,
        step: 'request-execution',
        executionRunId: 'throughput_1',
        createdAt: '2026-04-06T08:10:00.000Z',
        updatedAt: '2026-04-06T08:12:00.000Z',
      },
    },
  });
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: [
      { id: 'page_1', title: 'Recovery board' },
    ],
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: {
      currentIntentId: 'intent_1',
      latestIntentId: 'intent_1',
      byId: {
        intent_1: {
          id: 'intent_1',
          source: { type: 'cto-chat', ref: 'chat_1', requestedBy: 'cto' },
          semanticMeaning: {
            summary: 'Restore governed loop contract.',
            statement: 'Restore governed loop contract.',
            goal: 'Restore governed loop contract.',
            requestType: 'planning_request',
            requestedOutcomes: ['Lock governed loop contract'],
            targets: ['planner', 'qa-lead'],
            constraints: ['Canonical sources only'],
            urgency: 'high',
            labels: ['contract'],
          },
          confidence: 0.92,
          createdAt: '2026-04-06T08:00:00.000Z',
          provenance: { sourceType: 'cto-chat', sourceRef: 'chat_1' },
          missingFields: [],
          status: 'canonical',
        },
      },
      records: [],
    },
    currentIntentId: 'intent_1',
    summary: 'Restore governed loop contract.',
    status: 'canonical',
  });
  writeJson(rootPath, 'data/spatial/studio-state.json', {
    handoffs: {
      contextToPlanner: {
        id: 'handoff_1',
        intentId: 'intent_1',
        summary: 'Planner owns the next bounded slice.',
      },
    },
    teamBoard: {
      cards: [],
      selectedCardId: null,
    },
  });
  writeJson(rootPath, 'data/spatial/throughput/throughput_1.json', {
    id: 'throughput_1',
    status: 'running',
    verdict: 'pending',
    runnerTaskId: 'task_0001',
    qaRunId: 'qa_lead_1',
    createdAt: '2026-04-06T08:11:00.000Z',
    finishedAt: null,
    provenance: {
      sourceIntentId: 'intent_1',
    },
  });
  writePlannerQaQueue(rootPath, {
    updatedAt: '2026-04-06T08:13:00.000Z',
    entries: [{
      queueKey: 'planner_queue_1',
      plannerRunId: 'planner_run_1',
      planBundleId: 'plan_bundle_1',
      qaRequestId: 'qa_request_1',
      planIds: ['plan_1'],
      qaStatus: 'pending',
      summary: 'Planner bundle awaiting QA.',
    }],
  });
  writePlannerOuttray(rootPath, {
    updatedAt: '2026-04-06T08:14:00.000Z',
    entries: [{
      queueKey: 'outtray_1',
      plannerRunId: 'planner_run_1',
      planBundleId: 'plan_bundle_1',
      intentId: 'intent_1',
      summary: 'Planner handoff deposited.',
      items: [{
        laneId: 'executor',
        status: 'ready_for_handoff',
        targetDesk: 'executor',
        targetRole: 'Executor',
      }],
    }],
  });
  writeStructuredQAReport(rootPath, {
    id: 'structured_latest',
    status: 'fail',
    summary: 'Structured QA sees a governed loop mismatch.',
    finishedAt: '2026-04-06T08:15:00.000Z',
  });
  writeQaLeadRun(rootPath, {
    id: 'qa_lead_1',
    run_type: 'scheduled_cycle',
    status: 'completed',
    summary: 'QA reviewed the planner handoff.',
    started_at: '2026-04-06T08:15:00.000Z',
    finished_at: '2026-04-06T08:16:00.000Z',
  });
  writeQaRepairJobs(rootPath, [{
    id: 'qa_repair_001',
    lane: 'validation_seam',
    status: 'open',
    investigation_id: 'qa_inv_001',
    summary: 'Bounded repair queued.',
    created_at: '2026-04-06T08:17:00.000Z',
    updated_at: '2026-04-06T08:17:00.000Z',
  }]);
  recordRepairAttempt(rootPath, {
    attempt_id: 'qa_repair_attempt_001',
    repair_job_id: 'qa_repair_001',
    investigation_id: 'qa_inv_001',
    lane: 'validation_seam',
    status: 'completed',
    validation_verdict: 'blocked',
    summary: 'Repair attempt blocked by policy.',
    created_at: '2026-04-06T08:18:00.000Z',
    updated_at: '2026-04-06T08:18:00.000Z',
  });
  writeJson(rootPath, 'brain/context/archivist_context_bundle.json', {
    bundleId: 'arch_bundle_1',
    summary: 'Archivist wrote the current runtime bundle.',
  });
  writeJson(rootPath, 'data/spatial/cto-diagnostics.json', {
    version: '1',
    updated_at: '2026-04-06T08:19:00.000Z',
    entries: [{
      id: 'cto_diag_1',
      timestamp: '2026-04-06T08:19:00.000Z',
      category: 'contract_invalid',
      status: 'degraded',
      reason: 'CTO contract validation rejected malformed action.',
    }],
  });

  const contract = buildGovernedLoopContract(null, { rootPath });
  assert.equal(contract.contractVersion, 'governed-loop.v1');
  assert.equal(contract.source, '/api/spatial/governed-loop/contract');
  assert.equal(contract.domains.input.currentIntentId, 'intent_1');
  assert.equal(contract.domains.input.currentIntent.semanticMeaning.summary, 'Restore governed loop contract.');
  assert.deepEqual(contract.domains.input.pageIds, ['page_1']);
  assert.deepEqual(contract.domains.input.annotationIds, ['annotation_1']);
  assert.deepEqual(contract.domains.input.sketchIds, ['sketch_1']);
  assert.equal(contract.domains.planner.contextToPlanner.id, 'handoff_1');
  assert.equal(contract.domains.planner.qaQueue.latestEntry.queueKey, 'planner_queue_1');
  assert.equal(contract.domains.planner.outtray.latestEntry.queueKey, 'outtray_1');
  assert.equal(contract.domains.execution.latestSession.id, 'throughput_1');
  assert.equal(contract.domains.execution.latestSession.intentId, 'intent_1');
  assert.equal(contract.domains.qa.structuredReport.status, 'fail');
  assert.equal(contract.domains.qa.qaLead.latestRun.id, 'qa_lead_1');
  assert.equal(contract.domains.qa.repairLoop.latestJob.id, 'qa_repair_001');
  assert.equal(contract.domains.archivist.latestBundle.bundleId, 'arch_bundle_1');
  assert.equal(contract.domains.cto.pipeline.id, 'cto_pipeline_1');
  assert.equal(contract.domains.cto.diagnostics.latestEntry.id, 'cto_diag_1');
  assert.equal('runs' in contract.domains.execution, false);
  assert.equal('freshness' in contract, false);
  assert.ok(contract.domains.input.sources.some((source) => source.path === 'data/spatial/intent-state.json'));
  assert.ok(contract.domains.planner.sources.some((source) => source.path === 'data/spatial/planner/planner-outtray.json'));
  assert.ok(contract.domains.qa.sources.some((source) => source.path === 'data/spatial/qa/repair-jobs.json'));
  assert.ok(contract.domains.cto.sources.some((source) => source.path === 'data/spatial/cto-diagnostics.json'));

  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await getJson(`http://127.0.0.1:${address.port}/api/spatial/governed-loop/contract`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.source, '/api/spatial/governed-loop/contract');
    assert.ok(response.json.domains);
    assert.ok(response.json.domains.input);
    assert.ok(response.json.domains.planner);
    assert.ok(response.json.domains.qa);
    assert.ok(response.json.domains.cto);
    assert.ok(response.json.domains.cto.sources.some((source) => source.route === '/api/spatial/cto/diagnostics'));
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
