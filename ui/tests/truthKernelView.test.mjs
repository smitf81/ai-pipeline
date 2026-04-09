import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

function createMockCanvas() {
  const operations = [];
  const context = {
    fillStyle: null,
    globalAlpha: 1,
    setTransform: (...args) => operations.push(['setTransform', ...args]),
    clearRect: (...args) => operations.push(['clearRect', ...args]),
    fillRect: (...args) => operations.push(['fillRect', context.fillStyle, ...args]),
    beginPath: () => operations.push(['beginPath']),
    arc: (...args) => operations.push(['arc', ...args]),
    fill: () => operations.push(['fill', context.fillStyle, context.globalAlpha]),
  };
  return {
    width: 1600,
    height: 920,
    clientWidth: 1600,
    clientHeight: 920,
    getBoundingClientRect: () => ({ width: 1600, height: 920 }),
    getContext: () => context,
    operations,
  };
}

export default async function runTruthKernelViewTests() {
  globalThis.window = { devicePixelRatio: 1 };
  const modulePath = path.resolve(process.cwd(), 'public', 'spatial', 'truthKernelView.js');
  const { drawTruthKernelScene, hitTestTruthKernelNode, truthKernelNodeRadius } = await loadModuleCopy(modulePath, { label: 'truthKernelView' });
  assert.equal(truthKernelNodeRadius({ weight: 0.5 }) > truthKernelNodeRadius({ weight: 0.2 }), true);
  const canvas = createMockCanvas();
  const truthKernel = {
    nodes: [{
      id: 'healthy_node',
      status: 'healthy',
      confidence: 0.8,
      weight: 0.5,
    }, {
      id: 'blocked_node',
      status: 'blocked',
      confidence: 0.6,
      weight: 0.4,
    }, {
      id: 'orphan_node',
      status: 'orphaned',
      confidence: 0.5,
      weight: 0.3,
    }],
  };
  const layout = {
    positions: new Map([
      ['healthy_node', { x: 100, y: 100 }],
      ['blocked_node', { x: 200, y: 140 }],
      ['orphan_node', { x: 300, y: 180 }],
    ]),
  };
  drawTruthKernelScene(canvas, truthKernel, layout, { selectedNodeId: 'blocked_node' });
  const fills = canvas.operations.filter((entry) => entry[0] === 'fill');
  assert.equal(fills.length, 3);
  assert.equal(fills.some((entry) => entry[1] === '#f6f7fb'), true);
  assert.equal(fills.some((entry) => entry[1] === '#ff6a5d'), true);
  assert.equal(fills.some((entry) => entry[1] === '#6a7284'), true);
  const arcs = canvas.operations.filter((entry) => entry[0] === 'arc');
  assert.equal(arcs.length, 4);
  assert.equal(hitTestTruthKernelNode({ x: 200, y: 140 }, truthKernel, layout)?.id, 'blocked_node');
  assert.equal(hitTestTruthKernelNode({ x: 20, y: 20 }, truthKernel, layout), null);
}
