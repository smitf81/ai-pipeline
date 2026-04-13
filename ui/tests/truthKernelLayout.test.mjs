import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runTruthKernelLayoutTests() {
  const modulePath = path.resolve(process.cwd(), 'public', 'spatial', 'truthKernelLayout.js');
  const { buildTruthKernelLayout } = await loadModuleCopy(modulePath, { label: 'truthKernelLayout' });
  const nodes = [{
    id: 'input_1',
    kind: 'input',
    timestamp: 100,
    parents: [],
    children: ['execution_1'],
    status: 'informational',
    confidence: 0.7,
    weight: 0.4,
  }, {
    id: 'execution_1',
    kind: 'execution',
    timestamp: 200,
    parents: ['input_1'],
    children: ['artifact_1'],
    status: 'healthy',
    confidence: 0.8,
    weight: 0.6,
  }, {
    id: 'artifact_1',
    kind: 'artifact',
    timestamp: 300,
    parents: ['execution_1'],
    children: [],
    status: 'healthy',
    confidence: 0.8,
    weight: 0.5,
  }, {
    id: 'orphan_1',
    kind: 'artifact',
    timestamp: 400,
    parents: [],
    children: [],
    status: 'orphaned',
    confidence: 0.5,
    weight: 0.3,
  }];

  const firstLayout = buildTruthKernelLayout(nodes, { width: 1000, height: 600 });
  const secondLayout = buildTruthKernelLayout(nodes, { width: 1000, height: 600 });
  assert.deepEqual([...firstLayout.positions.entries()], [...secondLayout.positions.entries()]);
  assert.equal(firstLayout.positions.get('input_1').x < firstLayout.positions.get('execution_1').x, true);
  assert.equal(firstLayout.positions.get('execution_1').x < firstLayout.positions.get('artifact_1').x, true);
  assert.equal(firstLayout.positions.get('input_1').y < firstLayout.positions.get('execution_1').y, true);
  assert.equal(firstLayout.positions.get('execution_1').y < firstLayout.positions.get('artifact_1').y, true);
  assert.ok(firstLayout.positions.has('orphan_1'));
  const connectedMidY = firstLayout.positions.get('execution_1').y;
  const orphanY = firstLayout.positions.get('orphan_1').y;
  assert.notEqual(connectedMidY, orphanY);

  const anchoredLayout = buildTruthKernelLayout([{
    id: 'intent_bound_1',
    kind: 'input',
    sourceNodeId: 'node_1',
    timestamp: 100,
    parents: [],
    children: [],
    status: 'informational',
    confidence: 0.42,
    weight: 0.4,
  }, {
    id: 'run_bound_1',
    kind: 'execution',
    sourceNodeId: 'node_1',
    timestamp: 110,
    parents: ['intent_bound_1'],
    children: [],
    status: 'degraded',
    confidence: 0.28,
    weight: 0.5,
  }], {
    width: 1000,
    height: 600,
    sourceAnchors: new Map([[
      'node_1',
      {
        nodeId: 'node_1',
        screenX: 420,
        screenY: 240,
      },
    ]]),
  });
  const intentBound = anchoredLayout.positions.get('intent_bound_1');
  const runBound = anchoredLayout.positions.get('run_bound_1');
  assert.ok(intentBound);
  assert.ok(runBound);
  assert.ok(Math.abs(intentBound.x - 420) <= 48);
  assert.ok(Math.abs(intentBound.y - 240) <= 48);
  assert.ok(Math.abs(runBound.x - 420) <= 64);
  assert.ok(Math.abs(runBound.y - 240) <= 64);
}
