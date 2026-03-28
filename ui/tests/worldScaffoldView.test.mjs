import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const worldScaffoldViewPath = path.resolve(process.cwd(), 'public', 'spatial', 'worldScaffoldView.js');
const spatialFieldBridgePath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialFieldBridge.js');

function createMockContext() {
  const calls = [];
  return {
    calls,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    closePath() { calls.push(['closePath']); },
    fill() { calls.push(['fill', this.fillStyle]); },
    stroke() { calls.push(['stroke', this.strokeStyle]); },
    fillRect(x, y, width, height) { calls.push(['fillRect', x, y, width, height, this.fillStyle]); },
    strokeRect(x, y, width, height) { calls.push(['strokeRect', x, y, width, height, this.strokeStyle]); },
    fillText(text, x, y) { calls.push(['fillText', text, x, y, this.fillStyle]); },
    setLineDash(value) { calls.push(['setLineDash', Array.isArray(value) ? [...value] : []]); },
  };
}

function createScaffoldNode() {
  return {
    id: 'world_scaffold_ground_grid',
    position: { x: 96, y: 72 },
    metadata: {
      scaffold: {
        kind: 'rect-ground-grid',
        summary: '2x2 grass/ground grid',
        dimensions: { width: 2, height: 2 },
        totalCells: 4,
        origin: { x: 0, y: 0, z: 0 },
        cellSize: 28,
        tileType: 'grass',
        surface: 'ground',
        field: {
          layers: {
            '0': {
              values: [
                ['grass', 'grass'],
                ['grass', 'grass'],
              ],
            },
          },
        },
      },
    },
  };
}

function hasRecentBadge(calls = []) {
  return calls
    .filter((entry) => entry[0] === 'fillText')
    .some((entry) => String(entry[1]).includes('Recent +4'));
}

function hasFieldBadge(calls = []) {
  return calls
    .filter((entry) => entry[0] === 'fillText')
    .some((entry) => String(entry[1]).includes('Field base 2x2 @1x | coarse 1x1 @2x'));
}

export default async function runWorldScaffoldViewTests() {
  const {
    drawWorldScaffolds,
    findWorldScaffoldNodes,
    normalizeWorldViewMode,
    describeWorldScaffoldField,
    describeActiveDeskSelection,
  } = await loadModuleCopy(worldScaffoldViewPath, { label: 'worldScaffoldView' });
  const {
    normalizeScaffoldFieldBundle,
    describeScaffoldFieldLayer,
  } = await loadModuleCopy(spatialFieldBridgePath, { label: 'spatialFieldBridge' });

  assert.equal(normalizeWorldViewMode('2.5d'), '2.5d');
  assert.equal(normalizeWorldViewMode('unexpected'), '2d');

  const graph = {
    nodes: [createScaffoldNode()],
    edges: [],
  };
  assert.equal(findWorldScaffoldNodes(graph).length, 1);
  const fieldBundle = normalizeScaffoldFieldBundle(createScaffoldNode().metadata.scaffold);
  assert.equal(fieldBundle.layerOrder.join(','), '0,1');
  assert.equal(fieldBundle.baseLayer.width, 2);
  assert.equal(fieldBundle.coarseLayer.width, 1);
  assert.equal(describeScaffoldFieldLayer(fieldBundle.baseLayer), 'base 2x2 @1x');
  assert.equal(describeScaffoldFieldLayer(fieldBundle.coarseLayer), 'coarse 1x1 @2x');
  assert.equal(describeWorldScaffoldField(createScaffoldNode().metadata.scaffold), 'Field base 2x2 @1x | coarse 1x1 @2x');
  assert.equal(describeActiveDeskSelection('planner', 'Planner'), 'Active desk: Planner');

  const recentChange = {
    items: [{
      kind: 'scaffold',
      nodeId: 'world_scaffold_ground_grid',
      changeType: 'added',
      counts: { addedCells: 4, modifiedCells: 0 },
      addedCells: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
      ],
      modifiedCells: [],
    }],
  };

  const ctx2d = createMockContext();
  drawWorldScaffolds(ctx2d, graph, { x: 0, y: 0, zoom: 1 }, {
    viewMode: '2d',
    recentChange,
    showRecentChanges: true,
  });
  assert.equal(hasFieldBadge(ctx2d.calls), true);
  assert.equal(hasRecentBadge(ctx2d.calls), true);

  const ctx25d = createMockContext();
  drawWorldScaffolds(ctx25d, graph, { x: 0, y: 0, zoom: 1 }, {
    viewMode: '2.5d',
    recentChange,
    showRecentChanges: true,
  });
  assert.equal(hasFieldBadge(ctx25d.calls), true);
  assert.equal(hasRecentBadge(ctx25d.calls), true);

  const hiddenCtx = createMockContext();
  drawWorldScaffolds(hiddenCtx, graph, { x: 0, y: 0, zoom: 1 }, {
    viewMode: '2d',
    recentChange,
    showRecentChanges: false,
  });
  assert.equal(hasFieldBadge(hiddenCtx.calls), true);
  assert.equal(hasRecentBadge(hiddenCtx.calls), false);

  const selectionCtx = createMockContext();
  drawWorldScaffolds(selectionCtx, graph, { x: 0, y: 0, zoom: 1 }, {
    viewMode: '2d',
    recentChange,
    showRecentChanges: true,
    selectedDeskId: 'planner',
    selectedDeskLabel: 'Planner',
  });
  assert.ok(selectionCtx.calls.some((entry) => entry[0] === 'fillText' && String(entry[1]).includes('Active desk: Planner')));
}
