import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runQaPanelHotfixTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });

  assert.equal(typeof spatialApp.latestKnownTimestamp, 'function');
  assert.equal(typeof spatialApp.buildQAReadableSectionsFromState, 'function');
  assert.equal(spatialApp.latestKnownTimestamp(null, '', undefined), null);
  assert.equal(
    spatialApp.latestKnownTimestamp('2026-04-08T10:00:00.000Z', '2026-04-08T10:05:00.000Z'),
    '2026-04-08T10:05:00.000Z',
  );

  const qaSections = spatialApp.buildQAReadableSectionsFromState({
    structuredSummary: {},
    externalValidation: {},
    researchState: { summary: {} },
    openInvestigations: [],
  });
  const overviewSection = qaSections.find((section) => section.id === 'qa-overview');
  assert.ok(overviewSection);
  assert.equal(overviewSection.overview.latestStructuredAt, null);
  assert.equal(overviewSection.overview.latestExternalAt, null);
  assert.equal(overviewSection.overview.latestResearchAt, null);
}
