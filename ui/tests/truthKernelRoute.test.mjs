import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runTruthKernelRouteTests() {
  process.env.PORT = '3210';
  const { startServer } = require(path.resolve(process.cwd(), 'server.js'));
  const server = startServer();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    const truthResponse = await fetch('http://localhost:3210/api/spatial/truth-kernel');
    const truthPayload = await truthResponse.json();
    assert.equal(truthResponse.status, 200);
    assert.equal(Array.isArray(truthPayload.nodes), true);
    assert.equal(truthPayload.nodeCount > 0, true);
    assert.equal(truthPayload.canonicalTruth.domain, 'truth_kernel');
    assert.equal(truthPayload.canonicalTruth.projectionId, 'truth_kernel');
    assert.equal(Boolean(truthPayload.canonicalTruth.sourceOfTruth), true);
    assert.equal(Boolean(truthPayload.canonicalTruth.owner), true);
    assert.equal(Boolean(truthPayload.canonicalTruth.contractVersion), true);
    assert.equal(Boolean(truthPayload.canonicalTruth.generatedAt), true);
    assert.equal(Boolean(truthPayload.canonicalTruth.freshness), true);
    assert.equal(typeof truthPayload.canonicalTruth.fallbackUsed, 'boolean');

    const runtimeResponse = await fetch('http://localhost:3210/api/spatial/runtime');
    const runtimePayload = await runtimeResponse.json();
    assert.equal(runtimeResponse.status, 200);
    assert.equal(Array.isArray(runtimePayload.truthKernel?.nodes), true);
    assert.equal(runtimePayload.truthKernel.nodeCount > 0, true);
    assert.equal(runtimePayload.canonicalTruth.domain, 'runtime');
    assert.equal(runtimePayload.canonicalTruth.projectionId, 'runtime');
    assert.equal(Boolean(runtimePayload.canonicalTruth.sourceOfTruth), true);
    assert.equal(Boolean(runtimePayload.canonicalTruth.owner), true);
    assert.equal(Boolean(runtimePayload.canonicalTruth.contractVersion), true);
    assert.equal(Boolean(runtimePayload.canonicalTruth.generatedAt), true);
    assert.equal(Boolean(runtimePayload.canonicalTruth.freshness), true);
    assert.equal(typeof runtimePayload.canonicalTruth.fallbackUsed, 'boolean');
  } finally {
    server.close();
  }
}
