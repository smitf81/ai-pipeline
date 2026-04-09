import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runIntentRouteTests() {
  process.env.PORT = '3218';
  const { startServer } = require(path.resolve(process.cwd(), 'server.js'));
  const server = startServer();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    const intentResponse = await fetch('http://localhost:3218/api/spatial/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Summarize the planner backlog and prepare a handoff.',
        nodeId: 'context-manager-node',
        source: 'context-intake',
      }),
    });
    const intentPayload = await intentResponse.json();
    assert.equal([200, 500, 503].includes(intentResponse.status), true);
    assert.equal(intentPayload.canonicalTruth.domain, 'intent');
    assert.equal(intentPayload.canonicalTruth.projectionId, 'intent');
    assert.equal(intentPayload.canonicalTruth.classification, 'projection');
    assert.equal(intentPayload.canonicalTruth.fallbackUsed, false);
    assert.equal(Boolean(intentPayload.canonicalTruth.sourceOfTruth), true);
    assert.equal(Boolean(intentPayload.canonicalTruth.owner), true);
    assert.equal(Boolean(intentPayload.canonicalTruth.generatedAt), true);
    assert.equal(Boolean(intentPayload.canonicalTruth.freshness), true);
    assert.equal(Boolean(intentPayload.canonicalTruthSections?.route?.derivation), true);
    assert.equal(
      ['context_manager_projection', 'worker_no_report', 'context_manager_degraded', 'server_error'].includes(
        intentPayload.canonicalTruthSections.route.derivation,
      ),
      true,
    );
    if (intentResponse.status === 200) {
      assert.equal(Boolean(intentPayload.report), true);
      assert.equal(Boolean(intentPayload.canonicalIntent), true);
      assert.equal(intentPayload.canonicalTruthSections.route.derivation, 'context_manager_projection');
      assert.equal(intentPayload.canonicalTruthSections.canonicalIntent.classification, 'canonical');
    } else {
      assert.equal(Boolean(intentPayload.error), true);
      assert.equal(Boolean(intentPayload.canonicalTruthSections?.canonicalIntent), true);
    }

    const moduleResponse = await fetch('http://localhost:3218/api/spatial/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Generate a material texture atlas for the terrain tiles.',
        nodeId: 'module-node',
        source: 'context-intake',
      }),
    });
    const modulePayload = await moduleResponse.json();
    assert.equal([200, 400, 422].includes(moduleResponse.status), true);
    assert.equal(modulePayload.canonicalTruth.domain, 'intent');
    assert.equal(modulePayload.canonicalTruth.projectionId, 'intent');
    assert.equal(modulePayload.canonicalTruth.classification, 'fallback');
    assert.equal(modulePayload.canonicalTruth.fallbackUsed, true);
    assert.equal(modulePayload.canonicalTruthSections.route.derivation, 'module_bypass');
    assert.equal(modulePayload.routedToModule, true);
  } finally {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}
