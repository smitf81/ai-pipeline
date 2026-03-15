import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const graphEnginePath = path.resolve(process.cwd(), 'public', 'spatial', 'graphEngine.js');

export default async function runGraphEngineTests() {
  const {
    GRAPH_LAYERS,
    getNodeTypesForLayer,
    normalizeGraphBundle,
    buildRsgState,
    proposalRequiresApproval,
  } = await loadModuleCopy(graphEnginePath, { label: 'graphEngine' });

  assert.deepEqual(GRAPH_LAYERS, ['system', 'world']);
  assert.ok(getNodeTypesForLayer('world').includes('gameplay-system'));

  const graphs = normalizeGraphBundle({
    graph: {
      nodes: [{ id: 'node_sys', type: 'module', content: 'Studio runtime', metadata: {} }],
      edges: [],
    },
  });
  assert.equal(graphs.system.nodes[0].id, 'node_sys');
  assert.deepEqual(graphs.world, { nodes: [], edges: [] });

  const rsg = buildRsgState({
    graphs: {
      system: {
        nodes: [
          { id: 'node_adapter', type: 'adapter', content: 'Gameplay adapter', metadata: {} },
        ],
        edges: [],
      },
      world: {
        nodes: [
          { id: 'node_world', type: 'gameplay-system', content: 'Combat loop', metadata: { proposalTarget: 'world-structure' } },
        ],
        edges: [],
      },
    },
    studio: {
      teamBoard: {
        cards: [
          {
            id: '0004',
            title: 'Apply studio patch',
            executionPackage: { status: 'ready' },
            applyStatus: 'queued',
            deployStatus: 'idle',
          },
        ],
      },
    },
  });

  assert.equal(rsg.summary.adapterTranslation, 1);
  assert.equal(rsg.summary.worldStructure, 1);
  assert.equal(rsg.summary.codeRuntimeMutation, 1);
  assert.equal(proposalRequiresApproval('code-runtime-mutation'), true);
  assert.equal(proposalRequiresApproval('world-structure'), false);
}
