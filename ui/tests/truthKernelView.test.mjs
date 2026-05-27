import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

function createMockCanvas() {
  const operations = [];
  const context = {
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
    setTransform: (...args) => operations.push(['setTransform', ...args]),
    setLineDash: (...args) => operations.push(['setLineDash', ...args]),
    clearRect: (...args) => operations.push(['clearRect', ...args]),
    fillRect: (...args) => operations.push(['fillRect', context.fillStyle, ...args]),
    beginPath: () => operations.push(['beginPath']),
    moveTo: (...args) => operations.push(['moveTo', ...args]),
    lineTo: (...args) => operations.push(['lineTo', ...args]),
    arc: (...args) => operations.push(['arc', ...args]),
    fillText: (...args) => operations.push(['fillText', context.fillStyle, context.font, ...args]),
    fill: () => operations.push(['fill', context.fillStyle, context.globalAlpha]),
    stroke: () => operations.push(['stroke', context.strokeStyle, context.lineWidth, context.globalAlpha]),
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
  const { drawTruthKernelScene, hitTestTruthKernelNode, resolveTruthKernelNodeVisual, truthKernelNodeRadius } = await loadModuleCopy(modulePath, { label: 'truthKernelView' });
  assert.equal(truthKernelNodeRadius({ weight: 0.5 }) > truthKernelNodeRadius({ weight: 0.2 }), true);
  const resolvedVisual = resolveTruthKernelNodeVisual({
    visual: {
      rgba: 'rgba(64, 210, 180, 0.72)',
      activity_level: 0.8,
      confidence: 0.76,
      instability: 0.2,
    },
  }, { nowMs: 1710000000000 });
  assert.match(resolvedVisual.fill, /^rgba\(/);
  assert.match(resolvedVisual.stroke, /^rgba\(/);
  assert.equal(resolvedVisual.activityLevel > 0.5, true);
  const canvas = createMockCanvas();
  const truthKernel = {
    nodes: [{
      id: 'healthy_node',
      status: 'healthy',
      confidence: 0.8,
      confidenceAvailable: true,
      weight: 0.5,
      visual: {
        rgba: 'rgba(36, 218, 106, 0.92)',
        activity_level: 0.42,
        confidence: 0.8,
        instability: 0.08,
      },
    }, {
      id: 'blocked_node',
      status: 'blocked',
      confidence: 0.6,
      confidenceAvailable: true,
      weight: 0.4,
      visual: {
        rgba: 'rgba(232, 88, 72, 0.9)',
        activity_level: 0.24,
        confidence: 0.6,
        instability: 0.42,
      },
    }, {
      id: 'orphan_node',
      status: 'orphaned',
      confidence: 0.5,
      confidenceAvailable: false,
      weight: 0.3,
      visual: {
        rgba: 'rgba(124, 132, 154, 0.38)',
        activity_level: 0.1,
        confidence: 0.42,
        decay_level: 0.8,
        instability: 0.12,
      },
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
  assert.equal(fills.length, 9);
  assert.equal(fills.every((entry) => /^rgba\(/.test(String(entry[1] || ''))), true);
  assert.equal(fills.some((entry) => String(entry[1] || '').includes('36, 218, 106')), true);
  assert.equal(fills.some((entry) => String(entry[1] || '').includes('232, 88, 72')), true);
  assert.equal(fills.some((entry) => String(entry[1] || '').includes('124, 132, 154')), true);
  const arcs = canvas.operations.filter((entry) => entry[0] === 'arc');
  assert.equal(arcs.length, 15);
  assert.equal(canvas.operations.some((entry) => entry[0] === 'fillRect'), true);
  assert.equal(canvas.operations.filter((entry) => entry[0] === 'lineTo').length >= 2, true);
  assert.equal(canvas.operations.filter((entry) => entry[0] === 'fillText').length >= 2, true);
  assert.equal(canvas.operations.filter((entry) => entry[0] === 'stroke').length >= 6, true);
  assert.equal(hitTestTruthKernelNode({ x: 200, y: 140 }, truthKernel, layout)?.id, 'blocked_node');
  assert.equal(hitTestTruthKernelNode({ x: 20, y: 20 }, truthKernel, layout), null);
}
