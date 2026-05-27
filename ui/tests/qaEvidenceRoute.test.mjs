import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function assertQaLeadPostureShape(payload) {
  assert.equal(typeof payload?.qaLeadPosture, 'object');
  assert.equal(typeof payload.qaLeadPosture.posture_id, 'string');
  assert.equal(payload.qaLeadPosture.posture_id.startsWith('qa_posture_'), true);
  assert.equal(payload.qaLeadPosture.posture_id.length > 11, true);
  assert.equal(payload.qaLeadPosture.adjudicated_at == null || typeof payload.qaLeadPosture.adjudicated_at === 'string', true);
  assert.equal(typeof payload.qaLeadPosture.adjudicator, 'object');
  assert.equal(typeof payload.qaLeadPosture.adjudicator.source, 'string');
  assert.equal(typeof payload.qaLeadPosture.adjudicator.role, 'string');
  assert.equal(typeof payload.qaLeadPosture.verdict, 'string');
  assert.equal(typeof payload.qaLeadPosture.status, 'string');
  assert.equal(typeof payload.qaLeadPosture.summary, 'string');
  assert.equal(Array.isArray(payload.qaLeadPosture.inputs), true);
  assert.equal(payload.qaLeadPosture.inputs.length >= 2, true);
  assert.equal(payload.qaLeadPosture.inputs.some((input) => input?.type === 'adjudication_cycle'), true);
  assert.equal(payload.qaLeadPosture.inputs.some((input) => input?.type === 'structured_suite_report'), true);
  assert.equal(typeof payload.qaLeadPosture.evidence_counts, 'object');
  assert.equal(typeof payload.qaLeadPosture.evidence_counts.investigations, 'number');
  assert.equal(typeof payload.qaLeadPosture.evidence_counts.browser_runs, 'number');
  assert.equal(typeof payload.qaLeadPosture.provenance, 'object');
  assert.equal(payload.qaLeadPosture.provenance.source_projection, 'qa_evidence');
}

export default async function runQaEvidenceRouteTests() {
  process.env.PORT = '3221';
  const { startServer, buildCtoQaLeadPostureReference } = require(path.resolve(process.cwd(), 'server.js'));
  const server = startServer();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    const leadResponse = await fetch('http://localhost:3221/api/qa/lead/state');
    const leadPayload = await leadResponse.json();
    assert.equal(leadResponse.status, 200);
    assert.equal(leadPayload.ok, true);
    assert.equal(leadPayload.canonicalTruth.domain, 'qa_evidence');
    assert.equal(leadPayload.canonicalTruth.projectionId, 'qa_evidence');
    assert.equal(leadPayload.canonicalTruth.classification, 'projection');
    assert.equal(Boolean(leadPayload.canonicalTruth.sourceOfTruth), true);
    assert.equal(Boolean(leadPayload.canonicalTruth.owner), true);
    assert.equal(Boolean(leadPayload.canonicalTruth.generatedAt), true);
    assert.equal(Boolean(leadPayload.structuredReport || leadPayload.qaLead || leadPayload.repairLoop), true);
    assert.equal(leadPayload.canonicalTruthSections.route.derivation, 'qa_lead_state_projection');
    assert.equal(Boolean(leadPayload.canonicalTruthSections.qaLead), true);
    assertQaLeadPostureShape(leadPayload);
    assert.equal(Boolean(leadPayload.canonicalTruthSections.qaLeadPosture), true);

    const repairResponse = await fetch('http://localhost:3221/api/qa/repair-loop/state');
    const repairPayload = await repairResponse.json();
    assert.equal(repairResponse.status, 200);
    assert.equal(repairPayload.ok, true);
    assert.equal(repairPayload.canonicalTruth.domain, 'qa_evidence');
    assert.equal(repairPayload.canonicalTruth.projectionId, 'qa_evidence');
    assert.equal(repairPayload.canonicalTruthSections.route.derivation, 'repair_loop_state_projection');
    assert.equal(Boolean(repairPayload.repairLoop), true);
    assertQaLeadPostureShape(repairPayload);
    assert.equal(Boolean(repairPayload.canonicalTruthSections.qaLeadPosture), true);

    const runsResponse = await fetch('http://localhost:3221/api/spatial/qa/runs');
    const runsPayload = await runsResponse.json();
    assert.equal(runsResponse.status, 200);
    assert.equal(runsPayload.canonicalTruth.domain, 'qa_evidence');
    assert.equal(runsPayload.canonicalTruth.projectionId, 'qa_evidence');
    assert.equal(runsPayload.canonicalTruth.classification, 'projection');
    assert.equal(Array.isArray(runsPayload.runs), true);
    assert.equal(Boolean(runsPayload.canonicalTruthSections.latestRun), true);
    assert.equal(runsPayload.canonicalTruthSections.route.derivation, 'qa_runs_projection');
    assertQaLeadPostureShape(runsPayload);
    assert.equal(Boolean(runsPayload.canonicalTruthSections.qaLeadPosture), true);

    const ctoQaPostureRef = buildCtoQaLeadPostureReference(leadPayload);
    assert.equal(typeof ctoQaPostureRef, 'object');
    assert.equal(ctoQaPostureRef.source_projection, 'qa_evidence');
    assert.equal(ctoQaPostureRef.projection_id, 'qa_evidence');
    assert.equal(typeof ctoQaPostureRef.posture_id, 'string');
    assert.equal(ctoQaPostureRef.posture_id.startsWith('qa_posture_'), true);
    assert.equal(typeof ctoQaPostureRef.verdict, 'string');
    assert.equal(typeof ctoQaPostureRef.status, 'string');
    assert.equal(
      ctoQaPostureRef.adjudicated_at == null
      || typeof ctoQaPostureRef.adjudicated_at === 'string',
      true,
    );
    assert.equal(
      ctoQaPostureRef.derived_from_posture_id,
      ctoQaPostureRef.posture_id,
    );
  } finally {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}
