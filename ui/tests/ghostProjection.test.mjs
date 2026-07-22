import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runGhostProjectionTests() {
  const modulePath = path.resolve(process.cwd(), 'public', 'spatial', 'ghostProjection.js');
  const {
    buildGhostProjectionRegistryPayload,
    getCurrentGhostProjection,
    summarizeGhostProjection,
  } = await loadModuleCopy(modulePath, { label: 'ghostProjection' });
  const governedProjection = {
    id: 'ghost_field_sketch_probe_001',
    sourceIntentIds: ['sketch_probe_001'],
    status: 'candidate',
    confidence: 0.88,
    proposedChange: {
      summary: 'Project a build anchor at the strongest build desirability pressure.',
      committed: false,
    },
    reasoning: ['resolver=field-peak-v1', 'mutation=uncommitted'],
    provenance: {
      authority: 'ace-resolver-projection',
      sourceIntentId: 'sketch_probe_001',
      sourceType: 'field-resolver',
      sourceRef: 'buildDesirability',
      createdAt: '2026-05-27T10:00:00.000Z',
    },
  };
  const registry = buildGhostProjectionRegistryPayload({
    currentProjectionId: governedProjection.id,
    latestProjectionId: governedProjection.id,
    byId: { [governedProjection.id]: governedProjection },
    records: [governedProjection],
  });
  const projection = getCurrentGhostProjection(registry);

  assert.equal(registry.records.length, 1);
  assert.equal(projection.id, governedProjection.id);
  assert.equal(projection.provenance.authority, 'ace-resolver-projection');
  assert.equal(projection.proposedChange.committed, false);
  assert.match(summarizeGhostProjection(projection), /confidence 88%/);
  assert.match(summarizeGhostProjection(projection), /Project a build anchor/);
}
