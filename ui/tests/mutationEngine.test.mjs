import assert from 'node:assert/strict';
import path from 'node:path';

import { materializeModuleCopy } from './helpers/browser-module-loader.mjs';

const graphEnginePath = path.resolve(process.cwd(), 'public', 'spatial', 'graphEngine.js');
const mutationEnginePath = path.resolve(process.cwd(), 'public', 'spatial', 'mutationEngine.js');

async function loadMutationEngineModules() {
  const graphEngineModule = await materializeModuleCopy(graphEnginePath, { label: 'graphEngine-mutation' });
  const mutationEngineModule = await materializeModuleCopy(mutationEnginePath, {
    label: 'mutationEngine',
    transform: (source) => source.replace("'./graphEngine.js'", JSON.stringify(graphEngineModule.url)),
  });
  return {
    ...(await import(graphEngineModule.url)),
    ...(await import(mutationEngineModule.url)),
  };
}

function createSourceNode(createNode, id, content, position) {
  return {
    ...createNode({
      type: 'text',
      content,
      position,
      metadata: {
        graphLayer: 'system',
        role: 'thought',
      },
    }),
    id,
  };
}

export default async function runMutationEngineTests() {
  const { GraphEngine, MutationEngine, createNode } = await loadMutationEngineModules();

  const sourceNode = createSourceNode(createNode, 'node_source', 'Link planner and executor intent', { x: 160, y: 220 });
  const graphEngine = new GraphEngine({ nodes: [sourceNode], edges: [] });
  const mutationEngine = new MutationEngine(graphEngine);

  const firstPass = mutationEngine.syncDraftNodesFromReport(sourceNode, {
    summary: 'Draft nearby notes from parsed intent',
    confidence: 0.67,
    extractedIntent: {
      summary: 'Draft nearby notes from parsed intent',
      provenance: { usedFallback: false },
      candidateNodes: [
        { id: 'cand_1', label: 'Expose planner handoff', kind: 'module', basis: 'explicit', rationale: 'Directly stated', confidence: 0.91 },
        { id: 'cand_2', label: 'Show RSG activity', kind: 'task', basis: 'explicit', rationale: 'Directly stated', confidence: 0.83 },
        { id: 'cand_3', label: 'Create linked drafts', kind: 'task', basis: 'inferred', rationale: 'Natural next step', confidence: 0.88 },
        { id: 'cand_4', label: 'Ignore this fourth task', kind: 'task', basis: 'inferred', rationale: 'Should be capped out', confidence: 0.7 },
      ],
      candidateEdges: [
        { sourceCandidateId: 'cand_1', targetCandidateId: 'cand_2', kind: 'relates_to', basis: 'explicit', rationale: 'Used only for inspection metadata' },
      ],
    },
  }, {
    generationId: 'gen_primary',
    createdAt: '2026-03-16T09:00:00.000Z',
  });

  assert.equal(firstPass.generatedNodes.length, 3);
  assert.equal(firstPass.replacedNodeIds.length, 0);
  assert.equal(graphEngine.getState().nodes.length, 4);
  assert.equal(graphEngine.getState().edges.length, 3);
  assert.ok(firstPass.generatedNodes.every((node) => node.position.x > sourceNode.position.x));
  assert.ok(firstPass.generatedNodes.every((node) => node.metadata?.rsg?.sourceNodeId === sourceNode.id));
  assert.ok(firstPass.generatedNodes.every((node) => node.metadata?.rsg?.state === 'linked-draft'));
  assert.equal(firstPass.generatedNodes[0].content, 'Expose planner handoff');
  assert.equal(firstPass.generatedNodes[1].content, 'Show RSG activity');
  assert.equal(firstPass.generatedNodes[2].content, 'Create linked drafts');
  assert.equal(firstPass.generatedNodes[0].metadata?.rsg?.intentRef?.candidateNodeId, 'cand_1');
  assert.equal(firstPass.generatedNodes[2].metadata?.rsg?.intentRef?.basis, 'inferred');
  assert.ok(graphEngine.getState().edges.every((edge) => edge.source === sourceNode.id));
  assert.deepEqual(
    new Set(graphEngine.getState().edges.map((edge) => edge.target)),
    new Set(firstPass.generatedNodes.map((node) => node.id)),
  );

  const sourceA = createSourceNode(createNode, 'node_source_a', 'Draft the system graph', { x: 120, y: 140 });
  const sourceB = createSourceNode(createNode, 'node_source_b', 'Keep world graph untouched', { x: 120, y: 420 });
  const replacementGraph = new GraphEngine({ nodes: [sourceA, sourceB], edges: [] });
  const replacementEngine = new MutationEngine(replacementGraph);

  const sourceARun = replacementEngine.syncDraftNodesFromReport(sourceA, {
    summary: 'First source draft set',
    confidence: 0.81,
    extractedIntent: {
      summary: 'First source draft set',
      provenance: { usedFallback: false },
      candidateNodes: [
        { id: 'a_1', label: 'Alpha task', kind: 'task', basis: 'explicit', rationale: 'Direct request', confidence: 0.88 },
        { id: 'a_2', label: 'Beta task', kind: 'task', basis: 'inferred', rationale: 'Second inferred node', confidence: 0.52 },
      ],
      candidateEdges: [],
    },
  }, {
    generationId: 'gen_a_1',
    createdAt: '2026-03-16T09:30:00.000Z',
  });
  const sourceBRun = replacementEngine.syncDraftNodesFromReport(sourceB, {
    summary: 'Second source draft set',
    confidence: 0.73,
    extractedIntent: {
      summary: 'Second source draft set',
      provenance: { usedFallback: false },
      candidateNodes: [
        { id: 'b_1', label: 'Gamma task', kind: 'task', basis: 'explicit', rationale: 'Direct request', confidence: 0.73 },
      ],
      candidateEdges: [],
    },
  }, {
    generationId: 'gen_b_1',
    createdAt: '2026-03-16T09:45:00.000Z',
  });

  const adoptedDraft = sourceARun.generatedNodes[0];
  replacementGraph.updateNode(adoptedDraft.id, {
    content: 'Alpha task refined by user',
    metadata: {
      ...adoptedDraft.metadata,
      rsg: {
        ...adoptedDraft.metadata.rsg,
        state: 'adopted',
      },
    },
  });

  const rerun = replacementEngine.syncDraftNodesFromReport(sourceA, {
    summary: 'Replace only still-linked drafts',
    confidence: 0.9,
    extractedIntent: {
      summary: 'Replace only still-linked drafts',
      provenance: { usedFallback: false },
      candidateNodes: [
        { id: 'a_3', label: 'Delta task', kind: 'task', basis: 'explicit', rationale: 'Newest explicit candidate', confidence: 0.9 },
      ],
      candidateEdges: [],
    },
  }, {
    generationId: 'gen_a_2',
    createdAt: '2026-03-16T10:00:00.000Z',
  });

  assert.deepEqual(rerun.replacedNodeIds, [sourceARun.generatedNodes[1].id]);
  assert.equal(rerun.generatedNodes.length, 1);
  assert.ok(replacementGraph.getState().nodes.some((node) => node.id === adoptedDraft.id));
  assert.ok(replacementGraph.getState().nodes.some((node) => node.id === sourceBRun.generatedNodes[0].id));
  assert.ok(!replacementGraph.getState().nodes.some((node) => node.id === sourceARun.generatedNodes[1].id));
  assert.ok(replacementGraph.getState().nodes.some((node) => node.metadata?.rsg?.generationId === 'gen_a_2'));
  assert.equal(replacementGraph.getState().edges.filter((edge) => edge.source === sourceA.id).length, 2);
  assert.equal(replacementGraph.getState().edges.filter((edge) => edge.source === sourceB.id).length, 1);
}
