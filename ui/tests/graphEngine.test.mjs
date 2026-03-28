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
    createEdge,
    deriveRelationshipVisual,
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
    rsg: {
      activity: [
        {
          id: 'rsg_activity_1',
          type: 'rsg-generate',
          at: '2026-03-16T08:00:00.000Z',
          sourceNodeId: 'node_sys',
          sourceNodeLabel: 'Studio runtime',
          summary: 'Drafted linked runtime notes',
          confidence: 0.63,
          generatedCount: 2,
          replacedCount: 1,
          usedFallback: true,
          trigger: 'enter',
          generationId: 'gen_1',
        },
      ],
      lastSourceNodeId: 'node_sys',
      lastGenerationAt: '2026-03-16T08:00:00.000Z',
      lastStatus: 'rsg-generate',
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
  assert.equal(rsg.activity[0].id, 'rsg_activity_1');
  assert.equal(rsg.lastSourceNodeId, 'node_sys');
  assert.equal(rsg.lastGenerationAt, '2026-03-16T08:00:00.000Z');
  assert.equal(rsg.lastStatus, 'rsg-generate');
  assert.equal(proposalRequiresApproval('code-runtime-mutation'), true);
  assert.equal(proposalRequiresApproval('world-structure'), false);

  const ropeEdge = createEdge({
    source: 'node_adapter',
    target: 'node_world',
    relationshipType: 'workflow',
    supports: ['direct-dependency', 'qa-validation'],
    validatedBy: ['planner'],
  });
  assert.equal(ropeEdge.source, 'node_adapter');
  assert.equal(ropeEdge.target, 'node_world');
  assert.equal(ropeEdge.relationshipType, 'workflow');
  assert.equal(ropeEdge.relationship_type, 'workflow');
  assert.equal(ropeEdge.strength >= 3, true);
  assert.equal(ropeEdge.strandCount >= 2, true);
  assert.equal(ropeEdge.visualForm, 'woven-rope');
  assert.equal(ropeEdge.health, 'healthy');

  const bundleVisual = deriveRelationshipVisual({
    relationshipType: 'handoff',
    supports: ['anchor-ref'],
    validatedBy: ['context-manager', 'planner'],
    lastActive: '2026-03-16T09:00:00.000Z',
  });
  assert.equal(bundleVisual.strength >= 3, true);
  assert.equal(bundleVisual.strandCount >= 2, true);
  assert.equal(bundleVisual.visualForm, 'woven-rope');
}
