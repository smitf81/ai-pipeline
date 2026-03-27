import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runSpatialAppRsgTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath);

  const {
    RSG_IDLE_DELAY_MS,
    buildRsgActivityEntry,
    getExtractedIntent,
    isAdoptedDraftNode,
    isLinkedDraftNode,
    pushRsgActivityEntry,
    resolveGeneratedNodeInspection,
    shouldRunFocusedRsgLoop,
  } = spatialApp;

  const normalNode = {
    id: 'node_ctx',
    content: 'Expose intent extraction on the system canvas',
    metadata: {
      intentStatus: 'ready',
    },
  };

  assert.equal(RSG_IDLE_DELAY_MS, 1200);
  assert.deepEqual(
    shouldRunFocusedRsgLoop({ node: normalNode, trigger: 'enter' }),
    { ok: true, reason: '' },
  );
  assert.deepEqual(
    shouldRunFocusedRsgLoop({ node: normalNode, trigger: 'idle', selectedId: normalNode.id }),
    { ok: true, reason: '' },
  );
  assert.deepEqual(
    shouldRunFocusedRsgLoop({
      node: {
        ...normalNode,
        metadata: {
          ...normalNode.metadata,
          rsg: { state: 'linked-draft' },
        },
      },
      trigger: 'enter',
    }),
    { ok: false, reason: 'linked-draft' },
  );
  assert.deepEqual(
    shouldRunFocusedRsgLoop({ node: normalNode, activeGraphLayer: 'world' }),
    { ok: false, reason: 'not-system-layer' },
  );
  assert.equal(isLinkedDraftNode({ metadata: { rsg: { state: 'linked-draft' } } }), true);
  assert.equal(isAdoptedDraftNode({ metadata: { rsg: { state: 'adopted' } } }), true);
  assert.equal(getExtractedIntent({ extractedIntent: { id: 'intent_1' } }).id, 'intent_1');
  assert.equal(getExtractedIntent(null), null);

  const activityEntry = buildRsgActivityEntry({
    type: 'rsg-generate',
    sourceNode: normalNode,
    report: {
      summary: 'Drafted system-adjacent notes',
      confidence: 0.72,
    },
    generatedCount: 2,
    trigger: 'enter',
    at: '2026-03-16T11:00:00.000Z',
  });
  const nextState = pushRsgActivityEntry(undefined, activityEntry);
  assert.equal(nextState.activity[0].id, activityEntry.id);
  assert.equal(nextState.lastSourceNodeId, normalNode.id);
  assert.equal(nextState.lastGenerationAt, '2026-03-16T11:00:00.000Z');
  assert.equal(nextState.lastStatus, 'rsg-generate');

  const graph = {
    nodes: [
      {
        id: 'node_source',
        content: 'Expose intent extraction on the system canvas',
        metadata: {
          intentAnalysis: {
            extractedIntent: {
              id: 'intent_1',
              summary: 'Show the extracted intent directly in generated nodes',
              explicitClaims: ['Generated nodes should expose their provenance'],
              inferredClaims: ['Users may want expandable inspection'],
              candidateNodes: [
                { id: 'candidate_1', label: 'Show extracted intent inline', basis: 'explicit', rationale: 'This is directly requested.', confidence: 0.84 },
              ],
              candidateEdges: [
                { sourceCandidateId: 'candidate_1', targetCandidateId: 'candidate_1', kind: 'relates_to', basis: 'explicit', rationale: 'Self edge is just test metadata.' },
              ],
              gaps: ['Decide how deep expansion goes'],
              provenance: { usedFallback: false },
            },
          },
        },
      },
      {
        id: 'node_generated',
        content: 'Show extracted intent inline',
        metadata: {
          origin: 'agent_generated',
          rsg: {
            intentRef: {
              sourceNodeId: 'node_source',
              extractedIntentId: 'intent_1',
              candidateNodeId: 'candidate_1',
              basis: 'explicit',
            },
            confidence: 0.84,
          },
        },
      },
    ],
  };
  const inspection = resolveGeneratedNodeInspection(graph.nodes[1], graph);
  assert.ok(inspection);
  assert.equal(inspection.candidate.id, 'candidate_1');
  assert.equal(inspection.extractedIntent.summary, 'Show the extracted intent directly in generated nodes');
  assert.equal(inspection.sourceNode.id, 'node_source');
  assert.equal(inspection.basis, 'explicit');
  assert.equal(inspection.confidence, 0.84);
  assert.equal(inspection.relatedEdges.length, 1);

  assert.equal(resolveGeneratedNodeInspection({ id: 'node_plain', content: 'Plain note', metadata: {} }, graph), null);
}
