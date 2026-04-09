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
  assert.ok(firstLayout.positions.has('orphan_1'));
  const connectedMidY = firstLayout.positions.get('execution_1').y;
  const orphanY = firstLayout.positions.get('orphan_1').y;
  assert.notEqual(connectedMidY, orphanY);
}
