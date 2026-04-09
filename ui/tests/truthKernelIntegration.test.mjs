import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runTruthKernelIntegrationTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
  assert.equal(typeof spatialApp.resolveCanvasBackgroundFill, 'function');
  assert.equal(typeof spatialApp.formatTruthKernelTimestamp, 'function');
  assert.equal(typeof spatialApp.resolveTruthKernelToggleState, 'function');
  assert.equal(spatialApp.resolveCanvasBackgroundFill(false), '#08111d');
  assert.equal(spatialApp.resolveCanvasBackgroundFill(true), 'rgba(8, 17, 29, 0.72)');
  assert.equal(spatialApp.formatTruthKernelTimestamp(0), 'Unknown');
  assert.match(spatialApp.formatTruthKernelTimestamp(1712572800000), /^2024-04-08T/);
  const loadingToggle = spatialApp.resolveTruthKernelToggleState();
  assert.equal(loadingToggle.disabled, true);
  assert.equal(loadingToggle.title, 'Truth kernel loading...');
  assert.equal(loadingToggle.label, 'Truth (0)');
  const readyToggle = spatialApp.resolveTruthKernelToggleState({
    truthKernel: {
      nodeCount: 2,
      nodes: [
        { id: 'input_1', kind: 'input', timestamp: 1, parents: [], children: ['exec_1'], status: 'informational', confidence: 0.5, weight: 0.5 },
        { id: 'exec_1', kind: 'execution', timestamp: 2, parents: ['input_1'], children: [], status: 'healthy', confidence: 0.5, weight: 0.5 },
      ],
    },
    loadState: 'ready',
    visible: false,
  });
  assert.equal(readyToggle.disabled, false);
  assert.equal(readyToggle.title, 'Show truth kernel (2 real entities)');
  assert.equal(readyToggle.label, 'Truth (2)');
  const failedAfterReadyToggle = spatialApp.resolveTruthKernelToggleState({
    truthKernel: {
      nodeCount: 2,
      nodes: [],
    },
    loadState: 'error',
    visible: true,
  });
  assert.equal(failedAfterReadyToggle.disabled, false);
  assert.equal(failedAfterReadyToggle.title, 'Hide truth kernel (2 real entities)');
  assert.equal(failedAfterReadyToggle.label, 'Truth On (2)');
}
