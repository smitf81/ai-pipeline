import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runDeskPropertiesRouteTests() {
  process.env.PORT = '3216';
  const { startServer } = require(path.resolve(process.cwd(), 'server.js'));
  const server = startServer();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    const response = await fetch('http://localhost:3216/api/spatial/desks/planner/properties');
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.deskId, 'planner');
    assert.equal(payload.canonicalTruth.domain, 'desk_properties');
    assert.equal(payload.canonicalTruth.projectionId, 'desk_properties');
    assert.equal(Boolean(payload.canonicalTruth.sourceOfTruth), true);
    assert.equal(Boolean(payload.canonicalTruth.owner), true);
    assert.equal(Boolean(payload.canonicalTruth.contractVersion), true);
    assert.equal(Boolean(payload.canonicalTruth.generatedAt), true);
    assert.equal(Boolean(payload.canonicalTruth.freshness), true);
    assert.equal(typeof payload.canonicalTruth.fallbackUsed, 'boolean');
    assert.equal(payload.canonicalTruthSections.truth.sections.throughput.derivation, 'heuristic_summary');
    assert.equal(typeof payload.canonicalTruthSections.truth.sections.department.fallbackUsed, 'boolean');
    assert.equal(typeof payload.canonicalTruthSections.agents.fallbackUsed, 'boolean');
  } finally {
    server.close();
  }
}
