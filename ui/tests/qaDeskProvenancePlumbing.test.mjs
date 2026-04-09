import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

const require = createRequire(import.meta.url);

export default async function runQaDeskProvenancePlumbingTests() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const {
    buildDeskPropertiesPayload,
    buildQAStatePayload,
    readSpatialWorkspace,
  } = require('../server.js');
  const modulePath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const {
    buildQaDeskReadableState,
    buildQAReadableSectionsFromState,
  } = await smokeLoadSpatialApp(modulePath, { locationHref: 'http://localhost/?mode=qa-desk' });

  const payload = buildDeskPropertiesPayload(
    readSpatialWorkspace(),
    'qa-lead',
    buildQAStatePayload(repoRoot, {}),
    { rootPath: repoRoot },
  );

  assert.equal(payload.deskId, 'qa-lead');
  assert.equal(payload.canonicalTruthSections?.qa?.classification, 'projection');
  assert.equal(payload.canonicalTruthSections?.qa?.sections?.structuredSummary?.classification, 'projection');
  assert.equal(Object.prototype.hasOwnProperty.call(payload.qa || {}, 'canonicalTruthSections'), false);

  const readableState = buildQaDeskReadableState({
    ...payload,
    qa: {
      ...(payload.qa || {}),
      canonicalTruthSections: {
        staleFallback: {
          classification: 'fallback',
        },
      },
    },
  });
  assert.equal(Boolean(readableState.canonicalTruthSections?.structuredSummary), true);
  assert.equal(Boolean(readableState.canonicalTruthSections?.staleFallback), false);

  const sections = buildQAReadableSectionsFromState(readableState);
  assert.equal(sections[0].label, 'Governed QA sections');
  assert.match(sections[0].value, /\d+ canonical section group/);
  assert.equal(sections[1].provenance.label, 'Derived');
  assert.match(sections[1].summary, /^Derived \| /);

  const fallbackSections = buildQAReadableSectionsFromState(buildQaDeskReadableState({
    qa: {
      structuredSummary: {
        summary: 'Structured QA report available.',
      },
    },
  }));
  assert.notEqual(fallbackSections[0].label, 'Governed QA sections');
}
