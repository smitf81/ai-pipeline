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
    createNode,
    selectRepresentation,
    getSketchRepresentation,
    getWorldRepresentation,
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

  const canonicalNode = createNode({
    type: 'task',
    content: 'Dragon perch intent',
    metadata: {
      role: 'task',
      graphLayer: 'system',
    },
    representations: [
      {
        rep_id: 'dragon_perch_intent_01_sketch_icon',
        kind: 'icon',
        view_tags: ['sketch'],
        lod_min: 0,
        lod_max: 0.8,
        payload: { label: 'Perch' },
      },
      {
        rep_id: 'dragon_perch_intent_01_sketch_ghost',
        kind: 'ghost',
        view_tags: ['sketch'],
        lod_min: 0.25,
        lod_max: 0.6,
        payload: { summary: 'Ghost perch scaffold' },
      },
      {
        rep_id: 'dragon_perch_intent_01_world_mesh_stub',
        kind: 'mesh_stub',
        view_tags: ['world'],
        lod_min: 0.8,
        lod_max: 1.5,
        payload: { mesh: 'dragon-perch-stub' },
      },
    ],
  });
  const canonicalNodeId = canonicalNode.id;
  assert.equal(canonicalNode.representations.length, 3);
  assert.equal(canonicalNode.representations[0].rep_id, 'dragon_perch_intent_01_sketch_icon');
  assert.equal(canonicalNode.id, canonicalNodeId);
  assert.equal(selectRepresentation(canonicalNode, 0.5, 'sketch')?.rep_id, 'dragon_perch_intent_01_sketch_ghost');
  assert.equal(selectRepresentation(canonicalNode, 0.2, 'sketch')?.rep_id, 'dragon_perch_intent_01_sketch_icon');
  assert.equal(selectRepresentation(canonicalNode, 1.0, 'world')?.rep_id, 'dragon_perch_intent_01_world_mesh_stub');
  assert.equal(getSketchRepresentation(canonicalNode, 0.2)?.rep_id, 'dragon_perch_intent_01_sketch_icon');
  assert.equal(getWorldRepresentation(canonicalNode, 0.2)?.rep_id, 'dragon_perch_intent_01_world_mesh_stub');
  assert.equal(canonicalNode.id, canonicalNodeId);
  const fallbackNode = createNode({
    type: 'task',
    content: 'Fallback perch',
    representations: [
      {
        rep_id: 'fallback_sketch_icon',
        kind: 'icon',
        view_tags: ['sketch'],
        lod_min: 0,
        lod_max: 0.8,
        payload: { label: 'Fallback icon' },
      },
      {
        rep_id: 'fallback_sketch_ghost',
        kind: 'ghost',
        view_tags: ['sketch'],
        lod_min: 0.25,
        lod_max: 0.4,
        payload: { label: 'Fallback ghost' },
      },
    ],
  });
  const fallbackA = selectRepresentation(fallbackNode, 0.95, 'sketch');
  const fallbackB = selectRepresentation(fallbackNode, 0.95, 'sketch');
  assert.equal(fallbackA?.rep_id, 'fallback_sketch_icon');
  assert.equal(fallbackB?.rep_id, fallbackA?.rep_id);
  assert.equal(selectRepresentation({ id: 'legacy_node', content: 'Legacy node', metadata: {} }, 0.4, 'sketch'), null);
  assert.equal(getSketchRepresentation({ id: 'legacy_node', content: 'Legacy node', metadata: {} }, 0.4), null);

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
