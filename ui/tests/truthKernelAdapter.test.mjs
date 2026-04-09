import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTruthKernelPayload } = require(path.resolve(process.cwd(), 'truthKernelAdapter.js'));

function writeJson(rootPath, relativePath, value) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2), 'utf8');
}

export default async function runTruthKernelAdapterTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-kernel-adapter-'));
  writeJson(rootPath, 'data/spatial/agent-runs/context-manager/context_manager_1.json', {
    id: 'context_manager_1',
    startedAt: '2026-04-01T09:15:00.000Z',
    completedAt: '2026-04-01T09:16:00.000Z',
    status: 'completed',
    sourceNodeId: 'node_input_1',
    handoffId: 'handoff_1',
    report: { confidence: 0.71 },
    handoff: {
      id: 'handoff_1',
      createdAt: '2026-04-01T09:16:05.000Z',
      status: 'needs-clarification',
      confidence: 0.66,
      sourceNodeId: 'node_input_1',
    },
  });
  writeJson(rootPath, 'data/spatial/qa/qa_1/runtime.json', {
    runtime: {
      id: 'qa_run_1',
      finishedAt: '2026-04-01T09:20:00.000Z',
      status: 'pass',
      failures: [],
    },
  });
  writeJson(rootPath, 'data/spatial/qa/investigations.json', [{
    id: 'qa_inv_1',
    created_at: '2026-04-01T09:21:00.000Z',
    last_seen_at: '2026-04-01T09:22:00.000Z',
    status: 'open',
  }]);
  writeJson(rootPath, 'data/spatial/cto-diagnostics.json', {
    entries: [{
      id: 'cto_diag_1',
      timestamp: '2026-04-01T09:23:00.000Z',
      status: 'degraded',
    }],
  });

  const workspace = {
    studio: {
      intake: {
        records: [{
          id: 'intake_1',
          createdAt: '2026-04-01T09:00:00.000Z',
          status: 'captured',
          intentExtraction: {
            canonicalIntentId: 'intent_1',
            confidence: 0.77,
          },
        }],
      },
      handoffs: {
        contextToPlanner: {
          id: 'handoff_1',
          createdAt: '2026-04-01T09:16:05.000Z',
          sourceNodeId: 'node_input_1',
          status: 'needs-clarification',
          confidence: 0.66,
        },
        history: [],
      },
    },
    intentState: {
      registry: {
        records: [{
          id: 'intent_1',
          canonicalIntentId: 'intent_1',
          sourceNodeId: 'node_input_1',
          createdAt: '2026-04-01T09:05:00.000Z',
          updatedAt: '2026-04-01T09:05:30.000Z',
          status: 'active',
          confidence: 0.82,
        }, {
          id: 'intent_orphan_1',
          canonicalIntentId: 'intent_orphan_1',
          sourceNodeId: 'node_orphan_1',
          createdAt: '2026-04-01T10:00:00.000Z',
          updatedAt: '2026-04-01T10:01:00.000Z',
          status: 'active',
          confidence: 0.61,
        }],
      },
    },
  };

  const payload = buildTruthKernelPayload({ rootPath, workspace });
  assert.ok(payload.nodeCount >= 6);
  const ids = new Set(payload.nodes.map((node) => node.id));
  assert.equal(ids.has('intake_1'), true);
  assert.equal(ids.has('intent_1'), true);
  assert.equal(ids.has('context_manager_1'), true);
  assert.equal(ids.has('handoff_1'), true);
  assert.equal(ids.has('qa_run_1'), true);
  assert.equal(ids.has('cto_diag_1'), true);
  const intakeNode = payload.nodes.find((node) => node.id === 'intake_1');
  const intentNode = payload.nodes.find((node) => node.id === 'intent_1');
  const orphanIntentNode = payload.nodes.find((node) => node.id === 'intent_orphan_1');
  const handoffNode = payload.nodes.find((node) => node.id === 'handoff_1');
  assert.equal(intakeNode.kind, 'input');
  assert.equal(intentNode.kind, 'input');
  assert.equal(handoffNode.kind, 'artifact');
  assert.equal(intakeNode.children.includes('intent_1'), true);
  assert.equal(intentNode.parents.includes('intake_1'), true);
  assert.equal(intentNode.children.includes('handoff_1') || intentNode.children.includes('context_manager_1'), true);
  assert.equal(orphanIntentNode.status, 'orphaned');
  assert.equal(payload.nodes.every((node) => ['input', 'execution', 'artifact'].includes(node.kind)), true);
}
