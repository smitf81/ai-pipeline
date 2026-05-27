import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runQaReadableSectionsTests() {
  const modulePath = path.resolve(process.cwd(), 'public', 'spatial', 'qaReadableSections.js');
  const {
    decorateQaReadableSections,
    summarizeCanonicalTruthSections,
  } = await loadModuleCopy(modulePath, { label: 'qaReadableSections' });

  const governedSections = decorateQaReadableSections([
    {
      id: 'qa-overview',
      label: 'QA Health Overview',
      kind: 'qa-overview',
      summary: 'Overall QA health at a glance.',
    },
    {
      id: 'qa-research',
      label: 'Advisory / Research',
      kind: 'qa-research',
      summary: 'Research notes stay advisory and read-only.',
    },
  ], {
    provenanceLabel: 'Derived',
    canonicalTruthSections: {
      route: { classification: 'projection' },
      qaMcpLiveStatus: { classification: 'projection' },
      auditTrail: { classification: 'projection' },
    },
  });

  assert.equal(governedSections[0].kind, 'summary');
  assert.equal(governedSections[0].label, 'Governed QA sections');
  assert.equal(governedSections[0].value, '3 canonical section groups');
  assert.equal(governedSections[0].detail, 'Keys: qaMcpLiveStatus / auditTrail');
  assert.equal(governedSections[1].summary.startsWith('Derived | '), true);
  assert.equal(governedSections[1].provenance.label, 'Derived');
  assert.equal(governedSections[1].provenance.classification, 'derived');

  const governedExplicitSections = decorateQaReadableSections([
    {
      id: 'qa-run-history',
      label: 'Run History',
      kind: 'qa-run-history',
      summary: 'Latest browser runs and histories.',
    },
  ], {
    provenanceLabel: 'Governed',
  });
  assert.equal(governedExplicitSections[0].summary, 'Governed | Latest browser runs and histories.');
  assert.equal(governedExplicitSections[0].provenance.classification, 'governed');

  const fallbackSections = decorateQaReadableSections([
    {
      id: 'qa-local-gates',
      label: 'Freshness & Hygiene',
      kind: 'qa-local-gates',
      summary: 'Local gates stay read-only.',
    },
  ], {
    provenanceLabel: 'Derived',
  });
  assert.equal(fallbackSections[0].summary, 'Derived | Local gates stay read-only.');
  assert.equal(fallbackSections[0].provenance.source, 'qaState synthesis');

  const sectionSummary = summarizeCanonicalTruthSections({
    route: { classification: 'projection' },
    auditTrail: { classification: 'projection' },
    qaMcpLiveStatus: { classification: 'projection' },
  });
  assert.equal(sectionSummary.count, 3);
  assert.deepEqual(sectionSummary.preferredKeys, ['auditTrail', 'qaMcpLiveStatus']);
}
