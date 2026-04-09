import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runTruthKernelProvenanceTests() {
  const modulePath = path.resolve(process.cwd(), 'public', 'spatial', 'truthKernelAdapter.js');
  const {
    buildTruthKernelProvenancePresentation,
    normalizeTruthKernelPayload,
  } = await loadModuleCopy(modulePath, { label: 'truthKernelAdapter' });

  const normalized = normalizeTruthKernelPayload({
    generatedAt: '2026-04-08T12:10:00.000Z',
    nodes: [
      { id: 'truth_1', kind: 'input', timestamp: '2026-04-08T12:00:00.000Z', status: 'healthy' },
      { id: 'truth_2', kind: 'artifact', timestamp: '2026-04-08T12:05:00.000Z', status: 'informational' },
    ],
    canonicalTruth: {
      domain: 'spatial',
      projectionId: 'truth_kernel',
      classification: 'projection',
      freshness: 'live',
      generatedAt: '2026-04-08T12:10:00.000Z',
      fallbackUsed: false,
    },
    canonicalTruthSections: {
      route: { classification: 'projection' },
      runtime: { classification: 'projection' },
    },
  });

  assert.equal(normalized.nodeCount, 2);
  assert.equal(normalized.canonicalTruth.domain, 'spatial');
  assert.equal(normalized.canonicalTruth.projectionId, 'truth_kernel');
  assert.equal(normalized.canonicalTruth.freshness, 'live');
  assert.equal(normalized.canonicalTruthSections.runtime.classification, 'projection');

  const governed = buildTruthKernelProvenancePresentation(normalized);
  assert.equal(governed.hasGovernedProvenance, true);
  assert.equal(governed.fallbackLabel, '');
  assert.equal(governed.chips.some((chip) => chip.label === 'Domain' && chip.value === 'spatial'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Projection' && chip.value === 'truth_kernel'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Freshness' && chip.value === 'Live'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Generated' && chip.value === '2026-04-08T12:10:00.000Z'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Nodes' && chip.value === '2'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Sections' && chip.value.startsWith('2')), true);

  const absent = buildTruthKernelProvenancePresentation({
    generatedAt: null,
    nodeCount: 0,
    nodes: [],
  });
  assert.equal(absent.hasGovernedProvenance, false);
  assert.equal(absent.fallbackLabel, 'No governed provenance');
  assert.equal(absent.chips.some((chip) => chip.label === 'Nodes' && chip.value === '0'), true);
}
