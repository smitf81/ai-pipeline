import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runSpatialAppRsgTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath);

  const {
    RSG_IDLE_DELAY_MS,
    buildRsgActivityEntry,
    buildMutationTraceEmptyReason,
    getExtractedIntent,
    isAdoptedDraftNode,
    isLinkedDraftNode,
    pushRsgActivityEntry,
    resolveIntentTraceReport,
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
    shouldRunFocusedRsgLoop({
      node: {
        ...normalNode,
        metadata: {
          ...normalNode.metadata,
          agentId: 'context-manager',
          labels: ['primary-input'],
        },
      },
      trigger: 'enter',
    }),
    { ok: false, reason: 'primary-intent-node' },
  );
  assert.deepEqual(
    shouldRunFocusedRsgLoop({ node: normalNode, activeGraphLayer: 'world' }),
    { ok: false, reason: 'not-system-layer' },
  );
  assert.equal(isLinkedDraftNode({ metadata: { rsg: { state: 'linked-draft' } } }), true);
  assert.equal(isAdoptedDraftNode({ metadata: { rsg: { state: 'adopted' } } }), true);
  assert.equal(getExtractedIntent({ extractedIntent: { id: 'intent_1' } }).id, 'intent_1');
  assert.equal(getExtractedIntent(null), null);
  assert.equal(
    resolveIntentTraceReport({
      scanPreview: { trace_id: 'trace_old', summary: 'stale route summary' },
      latestIntentReport: { summary: 'persisted summary' },
      canvasIntentRunState: { traceId: 'trace_new', phase: 'routing' },
    }),
    null,
  );
  assert.equal(
    resolveIntentTraceReport({
      scanPreview: { trace_id: 'trace_new', summary: 'fresh route summary' },
      latestIntentReport: { summary: 'persisted summary' },
      canvasIntentRunState: { traceId: 'trace_new', phase: 'complete' },
    }).summary,
    'fresh route summary',
  );
  assert.equal(
    resolveIntentTraceReport({
      scanPreview: null,
      latestIntentReport: { summary: 'persisted summary' },
      canvasIntentRunState: { traceId: null, phase: 'idle' },
    }).summary,
    'persisted summary',
  );
  assert.equal(
    buildMutationTraceEmptyReason({
      canvasIntentRunState: { traceId: 'trace_1', phase: 'routing' },
    }),
    'Waiting for the current route to produce a mutation package.',
  );
  assert.equal(
    buildMutationTraceEmptyReason({
      canvasIntentRunState: { traceId: 'trace_2', phase: 'complete', route: 'debug-intent-scan', forceIntentScan: true },
    }),
    'Debug scan only. The current run did not request world mutations.',
  );
  assert.equal(
    buildMutationTraceEmptyReason({
      canvasIntentRunState: { traceId: 'trace_3', phase: 'complete', route: 'world-edit' },
      executiveResult: {
        route: 'world-edit',
        mutationGeneration: {
          reason: 'Existing-world tile edits are not implemented yet. Supported today: scaffold creation only.',
        },
      },
    }),
    'Existing-world tile edits are not implemented yet. Supported today: scaffold creation only.',
  );
  assert.equal(
    buildMutationTraceEmptyReason({
      canvasIntentRunState: { traceId: 'trace_4', phase: 'complete', route: 'module' },
      executiveResult: { route: 'module' },
    }),
    'Module routes do not generate world mutations.',
  );

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
