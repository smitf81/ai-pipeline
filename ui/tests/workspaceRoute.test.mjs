import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runWorkspaceRouteTests() {
  process.env.PORT = '3225';
  const { startServer } = require(path.resolve(process.cwd(), 'server.js'));
  const server = startServer();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    const response = await fetch('http://localhost:3225/api/spatial/workspace');
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.canonicalTruth.domain, 'workspace');
    assert.equal(payload.canonicalTruth.projectionId, 'workspace');
    assert.equal(payload.canonicalTruth.classification, 'projection');
    assert.equal(Boolean(payload.canonicalTruth.sourceOfTruth), true);
    assert.equal(Boolean(payload.canonicalTruth.owner), true);
    assert.equal(Boolean(payload.canonicalTruth.generatedAt), true);
    assert.equal(payload.canonicalTruthSections.route.derivation, 'workspace_live_projection');
    assert.equal(Boolean(payload.canonicalTruthSections.persistedWorkspace), true);
    assert.equal(Boolean(payload.canonicalTruthSections.pages), true);
    assert.equal(Boolean(payload.canonicalTruthSections.intentState), true);
    assert.equal(Boolean(payload.canonicalTruthSections.studioState), true);
    assert.equal(Boolean(payload.canonicalTruthSections.architectureMemory), true);
    assert.equal(Boolean(payload.canonicalTruthSections.orchestration), true);
    assert.equal(Boolean(payload.studio), true);
    assert.equal(Array.isArray(payload.pages), true);
    assert.equal(Boolean(payload.graphs), true);
    const faviconResponse = await fetch('http://localhost:3225/favicon.ico');
    assert.equal(faviconResponse.status, 204);
  } finally {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}
