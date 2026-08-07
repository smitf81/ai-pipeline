import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runSpatialGhostResolverTests() {
  const { buildCanonicalIntentContract } = require(path.resolve(process.cwd(), 'intentAnalysis.js'));
  const {
    resolveBuildDesirabilityPeak,
    resolveSpatialGhostProjection,
    upsertSpatialGhostProjectionRegistry,
  } = require(path.resolve(process.cwd(), 'spatialGhostResolver.js'));
  const contract = buildCanonicalIntentContract({
    packet: {
      geometry: {
        kind: 'stroke',
        stroke: [{ x: 10, y: 10 }, { x: 50, y: 25 }, { x: 90, y: 40 }],
      },
      sourceType: 'sketchpad-stroke',
      sourceRef: 'sketch_governed_1',
      requestedBy: 'sketchpad',
    },
    sourceType: 'sketchpad-stroke',
    sourceRef: 'sketch_governed_1',
    requestedBy: 'sketchpad',
    timestamp: '2026-05-27T10:00:00.000Z',
    intentId: 'sketch_governed_1',
  });
  const peak = resolveBuildDesirabilityPeak(contract.canonicalIntent.fieldInfluence);
  const ghost = resolveSpatialGhostProjection(contract.canonicalIntent);
  const registry = upsertSpatialGhostProjectionRegistry(null, ghost);

  assert.ok(peak);
  assert.equal(contract.canonicalIntent.fieldInfluence.fieldKey, 'buildDesirability');
  assert.equal(ghost.id, 'ghost_field_sketch_governed_1');
  assert.equal(ghost.status, 'candidate');
  assert.equal(ghost.proposedChange.committed, false);
  assert.equal(ghost.proposedChange.fieldKey, 'buildDesirability');
  assert.equal(ghost.provenance.authority, 'ace-resolver-projection');
  assert.equal(ghost.provenance.sourceIntentId, 'sketch_governed_1');
  assert.equal(ghost.reasoning.includes('resolver=field-peak-v1'), true);
  assert.equal(registry.currentProjectionId, ghost.id);
  assert.equal(registry.records.length, 1);
}
