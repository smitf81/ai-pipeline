import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runDeskProvenanceTests() {
  const modulePath = path.resolve(process.cwd(), 'public', 'spatial', 'deskProvenance.js');
  const {
    normalizeDeskProvenance,
    summarizeDeskProvenanceSections,
  } = await loadModuleCopy(modulePath, { label: 'deskProvenance' });

  const governed = normalizeDeskProvenance({
    deskId: 'qa-lead',
    __canonicalTruthMeta: {
      classification: 'projection',
      freshness: 'live',
      fallbackUsed: false,
      generatedAt: '2026-04-08T12:00:00.000Z',
    },
    canonicalTruthSections: {
      desk: { classification: 'projection', fallbackUsed: false },
      truth: { classification: 'projection', fallbackUsed: false, sections: { department: {} } },
      modules: { classification: 'fallback', fallbackUsed: true },
    },
  }, 'qa-lead');

  assert.equal(governed.hasGovernedProvenance, true);
  assert.equal(governed.domain, 'desk_properties');
  assert.equal(governed.projectionId, 'qa-lead');
  assert.equal(governed.classification, 'projection');
  assert.equal(governed.freshness, 'live');
  assert.equal(governed.generatedAt, '2026-04-08T12:00:00.000Z');
  assert.equal(governed.fallbackUsed, false);
  assert.equal(governed.sectionSummary.count, 3);
  assert.deepEqual(governed.sectionSummary.keys, ['modules', 'truth']);

  const fallback = normalizeDeskProvenance({ deskId: 'desk-1' }, 'desk-1');
  assert.equal(fallback.hasGovernedProvenance, false);
  assert.equal(fallback.sectionSummary.count, 0);
  assert.deepEqual(fallback.sectionSummary.keys, []);
  assert.equal(fallback.domain, 'desk_properties');
  assert.equal(fallback.projectionId, 'desk-1');

  const summary = summarizeDeskProvenanceSections({
    route: { classification: 'projection', fallbackUsed: false },
    truth: { classification: 'projection', fallbackUsed: false, sections: { department: {} } },
    modules: { classification: 'fallback', fallbackUsed: true },
  });
  assert.equal(summary.count, 3);
  assert.deepEqual(summary.keys, ['modules', 'truth']);
}
