import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runCanonicalTruthGovernanceTests() {
  const registry = require(path.resolve(process.cwd(), 'canonicalTruthRegistry.js'));
  const { createCanonicalTruthAccess } = require(path.resolve(process.cwd(), 'canonicalTruthAccess.js'));
  const {
    createCanonicalTruthEnvelope,
    decorateCanonicalTruthPayload,
  } = require(path.resolve(process.cwd(), 'canonicalTruthEnvelope.js'));

  const validation = registry.validateCanonicalTruthRegistry();
  assert.equal(validation.ok, true);
  assert.equal(Boolean(registry.getCanonicalTruthProjection('workspace')), true);
  assert.equal(Boolean(registry.getCanonicalTruthProjection('runtime')), true);
  assert.equal(Boolean(registry.getCanonicalTruthProjection('truth_kernel')), true);
  assert.equal(Boolean(registry.getCanonicalTruthProjection('desk_properties')), true);
  assert.equal(Boolean(registry.getCanonicalTruthProjection('intent')), true);
  assert.equal(Boolean(registry.getCanonicalTruthProjection('field_influence')), true);
  assert.equal(Boolean(registry.getCanonicalTruthProjection('ghost_projection')), true);
  assert.equal(Boolean(registry.getCanonicalTruthProjection('qa_evidence')), true);
  assert.equal(Boolean(registry.getCanonicalTruthDomain('workspace')), true);
  assert.equal(Boolean(registry.getCanonicalTruthDomain('runtime')), true);
  assert.equal(Boolean(registry.getCanonicalTruthDomain('desk_properties')), true);
  assert.equal(Boolean(registry.getCanonicalTruthDomain('intent')), true);
  assert.equal(Boolean(registry.getCanonicalTruthDomain('field_influence')), true);
  assert.equal(Boolean(registry.getCanonicalTruthDomain('ghost_projection')), true);
  assert.equal(Boolean(registry.getCanonicalTruthDomain('qa_evidence')), true);

  const access = createCanonicalTruthAccess({
    repositories: {
      workspace: async () => ({ workspaceId: 'workspace-live' }),
      intent: async () => ({ workspaceId: 'workspace-live', currentIntentId: 'intent_live_1' }),
      qa_evidence: async () => ({ latestRunId: 'qa_run_1' }),
    },
    builders: {
      buildWorkspaceProjectionPayload: async ({ sourceData }) => ({
        __canonicalTruthMeta: {
          classification: 'projection',
          freshness: 'live',
          fallbackUsed: false,
        },
        workspaceId: sourceData.workspaceId,
      }),
      buildSpatialRuntimePayload: async ({ sourceData }) => ({
        source: '/api/spatial/runtime',
        freshness: 'live',
        generatedAt: '2026-04-08T12:00:00.000Z',
        runtimeId: sourceData.workspaceId,
      }),
      buildTruthKernelPayload: async () => ({
        generatedAt: '2026-04-08T12:00:00.000Z',
        nodeCount: 1,
        nodes: [{ id: 'intent_1' }],
      }),
      buildDeskPropertiesPayload: async ({ deskId }) => ({
        deskId,
        truth: { throughput: '1 complete / 0 in progress' },
      }),
      buildIntentProjectionPayload: async ({ requestBody }) => ({
        __statusCode: 200,
        __canonicalTruthMeta: {
          classification: 'projection',
          freshness: 'live',
          fallbackUsed: false,
        },
        canonicalIntent: {
          id: 'intent_live_1',
          statement: String(requestBody?.text || ''),
        },
      }),
      buildFieldInfluenceProjectionPayload: async () => ({
        fieldInfluence: {
          fieldKey: 'buildDesirability',
          sourceIntentId: 'intent_live_1',
        },
      }),
      buildGhostProjectionPayload: async () => ({
        ghostProjection: {
          id: 'ghost_field_intent_live_1',
          status: 'candidate',
          proposedChange: { committed: false },
        },
      }),
      buildQaEvidenceProjectionPayload: async ({ qaView }) => ({
        __canonicalTruthMeta: {
          classification: 'projection',
          freshness: 'live',
          fallbackUsed: false,
        },
        generatedAt: '2026-04-08T12:00:00.000Z',
        view: qaView,
        latestRun: { id: 'qa_run_1' },
        runs: [{ id: 'qa_run_1' }],
      }),
    },
  });

  const runtimeEnvelope = await access.resolveProjection('runtime');
  assert.equal(runtimeEnvelope.domain, 'runtime');
  assert.equal(runtimeEnvelope.projectionId, 'runtime');
  assert.equal(runtimeEnvelope.classification, 'projection');
  assert.equal(runtimeEnvelope.sourceOfTruth.includes('workspace.json'), true);
  assert.equal(runtimeEnvelope.owner.includes('buildSpatialRuntimePayload'), true);
  assert.equal(runtimeEnvelope.freshness, 'live');
  assert.equal(runtimeEnvelope.fallbackUsed, false);
  assert.equal(runtimeEnvelope.data.runtimeId, 'workspace-live');

  const decoratedRuntime = decorateCanonicalTruthPayload(runtimeEnvelope);
  assert.equal(decoratedRuntime.runtimeId, 'workspace-live');
  assert.equal(decoratedRuntime.canonicalTruth.domain, 'runtime');
  assert.equal(decoratedRuntime.canonicalTruth.projectionId, 'runtime');

  const workspaceEnvelope = await access.resolveProjection('workspace');
  assert.equal(workspaceEnvelope.domain, 'workspace');
  assert.equal(workspaceEnvelope.projectionId, 'workspace');
  assert.equal(workspaceEnvelope.data.workspaceId, 'workspace-live');
  assert.equal(workspaceEnvelope.fallbackUsed, false);

  const deskEnvelope = await access.resolveProjection('desk_properties', { deskId: 'planner' });
  assert.equal(deskEnvelope.domain, 'desk_properties');
  assert.equal(deskEnvelope.projectionId, 'desk_properties');
  assert.equal(deskEnvelope.data.deskId, 'planner');

  const intentEnvelope = await access.resolveProjection('intent', { requestBody: { text: 'plan the task' } });
  assert.equal(intentEnvelope.domain, 'intent');
  assert.equal(intentEnvelope.projectionId, 'intent');
  assert.equal(intentEnvelope.data.canonicalIntent.id, 'intent_live_1');
  assert.equal(intentEnvelope.fallbackUsed, false);

  const fieldEnvelope = await access.resolveProjection('field_influence');
  assert.equal(fieldEnvelope.domain, 'field_influence');
  assert.equal(fieldEnvelope.data.fieldInfluence.fieldKey, 'buildDesirability');

  const ghostEnvelope = await access.resolveProjection('ghost_projection');
  assert.equal(ghostEnvelope.domain, 'ghost_projection');
  assert.equal(ghostEnvelope.data.ghostProjection.proposedChange.committed, false);

  const qaEvidenceEnvelope = await access.resolveProjection('qa_evidence', { qaView: 'qa_runs' });
  assert.equal(qaEvidenceEnvelope.domain, 'qa_evidence');
  assert.equal(qaEvidenceEnvelope.projectionId, 'qa_evidence');
  assert.equal(qaEvidenceEnvelope.data.latestRun.id, 'qa_run_1');
  assert.equal(qaEvidenceEnvelope.fallbackUsed, false);

  await assert.rejects(
    () => access.resolveProjection('missing_projection'),
    /not declared/i,
  );

  const envelope = createCanonicalTruthEnvelope({
    domain: 'truth_kernel',
    projectionId: 'truth_kernel',
    classification: 'projection',
    sourceOfTruth: 'workspace',
    owner: 'truth-kernel',
    generatedAt: '2026-04-08T12:00:00.000Z',
    freshness: 'live',
    fallbackUsed: false,
    data: { nodeCount: 2 },
  });
  assert.equal(envelope.contractVersion, 'canonical-truth-envelope.v0');
  assert.equal(envelope.data.nodeCount, 2);

  const drift = registry.listCanonicalTruthDrift();
  assert.equal(drift.some((entry) => entry.projectionId === 'workspace'), false);
  assert.equal(drift.some((entry) => entry.projectionId === 'desk_properties'), false);
  assert.equal(drift.some((entry) => entry.projectionId === 'intent'), false);
  assert.equal(drift.some((entry) => entry.projectionId === 'qa_evidence'), false);
}
