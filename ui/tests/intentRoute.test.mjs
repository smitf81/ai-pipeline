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
    const bootStatusResponse = await fetch('http://localhost:3218/api/spatial/boot-status');
    const bootStatusPayload = await bootStatusResponse.json();
    assert.equal(bootStatusResponse.status, 200);
    assert.equal(bootStatusPayload.ok, true);
    assert.equal(Boolean(bootStatusPayload.status?.dependencies?.ollama), true);
    assert.equal(Boolean(bootStatusPayload.status?.dependencies?.qa_mcp_helper), true);
    assert.equal(
      ['live', 'warming', 'degraded', 'unavailable'].includes(bootStatusPayload.status.dependencies.ollama.status),
      true,
    );

    const intentResponse = await fetch('http://localhost:3218/api/spatial/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Summarize the planner backlog and prepare a handoff.',
        nodeId: 'context-manager-node',
        source: 'context-intake',
        host: 'http://127.0.0.1:9',
        timeoutMs: 25,
      }),
    });
    const intentPayload = await intentResponse.json();
    assert.equal(intentResponse.status, 200);
    assert.equal(intentPayload.canonicalTruth.domain, 'intent');
    assert.equal(intentPayload.canonicalTruth.projectionId, 'intent');
    assert.equal(intentPayload.canonicalTruth.classification, 'projection');
    assert.equal(intentPayload.canonicalTruth.fallbackUsed, true);
    assert.equal(Boolean(intentPayload.canonicalTruth.sourceOfTruth), true);
    assert.equal(Boolean(intentPayload.canonicalTruth.owner), true);
    assert.equal(Boolean(intentPayload.canonicalTruth.generatedAt), true);
    assert.equal(Boolean(intentPayload.canonicalTruth.freshness), true);
    assert.equal(Boolean(intentPayload.canonicalTruthSections?.route?.derivation), true);
    assert.equal(intentPayload.canonicalTruthSections.route.derivation, 'context_manager_projection');
    assert.equal(Boolean(intentPayload.report), true);
    assert.equal(Boolean(intentPayload.canonicalIntent), true);
    assert.equal(Boolean(intentPayload.extractedIntent), true);
    assert.equal(Boolean(intentPayload.worker), true);
    assert.equal(Boolean(intentPayload.preflight), true);
    assert.equal(Boolean(intentPayload.dependencyStatus?.ollama), true);
    assert.equal(Boolean(intentPayload.dependencyStatus?.qa_mcp_helper), true);
    assert.equal(intentPayload.worker.usedFallback, true);
    assert.equal(intentPayload.canonicalTruthSections.report.derivation, 'worker_report');
    assert.equal(intentPayload.canonicalTruthSections.extractedIntent.classification, 'fallback');
    assert.equal(intentPayload.canonicalTruthSections.extractedIntent.derivation, 'worker_fallback_extracted_intent');
    assert.equal(intentPayload.canonicalTruthSections.canonicalIntent.classification, 'canonical');
    assert.equal(intentPayload.canonicalTruthSections.dependencyStatus.derivation, 'server_dependency_registry');

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
