import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runCanonicalTruthRegistryDriftTests() {
  const registry = require(path.resolve(process.cwd(), 'canonicalTruthRegistry.js'));
  const validation = registry.validateCanonicalTruthRegistry();
  assert.equal(validation.ok, true, validation.errors.join('; '));

  const governedRoutes = new Set(validation.projections.flatMap((entry) => registry.getProjectionGovernedRoutes(entry)));
  assert.equal(governedRoutes.has('/api/spatial/workspace'), true);
  assert.equal(governedRoutes.has('/api/spatial/runtime'), true);
  assert.equal(governedRoutes.has('/api/spatial/truth-kernel'), true);
  assert.equal(governedRoutes.has('/api/spatial/desks/:deskId/properties'), true);
  assert.equal(governedRoutes.has('/api/spatial/intent'), true);
  assert.equal(governedRoutes.has('/api/qa/lead/state'), true);
  assert.equal(governedRoutes.has('/api/qa/repair-loop/state'), true);
  assert.equal(governedRoutes.has('/api/spatial/qa/runs'), true);

  validation.projections.forEach((projection) => {
    assert.equal(Boolean(String(projection.builder || '').trim()), true, `${projection.projectionId} missing builder`);
    assert.equal(Boolean(String(projection.route || '').trim()), true, `${projection.projectionId} missing route`);
    assert.equal(Array.isArray(projection.consumers) && projection.consumers.length > 0, true, `${projection.projectionId} missing consumers`);
    assert.equal(typeof projection.readOnly, 'boolean', `${projection.projectionId} missing readOnly`);
    assert.equal(Boolean(String(projection.readinessSemantics || '').trim()), true, `${projection.projectionId} missing readinessSemantics`);
    const targetDomain = validation.domains.find((entry) => entry.domainId === projection.projectionId) || null;
    assert.equal(Boolean(targetDomain), true, `${projection.projectionId} missing target domain`);
    assert.equal(Boolean(String(targetDomain?.canonicalOwner || '').trim()), true, `${projection.projectionId} missing canonicalOwner`);
  });

  const trackedRoutes = new Set([
    ...validation.projections.flatMap((entry) => registry.getProjectionGovernedRoutes(entry)),
    ...registry.listCanonicalTruthDrift().map((entry) => entry.route),
  ]);
  registry.KNOWN_TRUTH_BEARING_ROUTES.forEach((route) => {
    assert.equal(trackedRoutes.has(route), true, `${route} is a known truth-bearing route but is neither declared nor tracked as drift`);
  });
}
