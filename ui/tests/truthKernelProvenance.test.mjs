import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

export default async function runTruthKernelProvenanceTests() {
  const modulePath = path.resolve(process.cwd(), 'public', 'spatial', 'truthKernelAdapter.js');
  const {
    buildTruthKernelNodeInspectorModel,
    buildTruthKernelRenderModel,
    buildTruthKernelProvenancePresentation,
    normalizeTruthKernelPayload,
    summarizeTruthKernelPositionOrigin,
    summarizeTruthKernelRenderStatus,
  } = await loadModuleCopy(modulePath, { label: 'truthKernelAdapter' });

  const normalized = normalizeTruthKernelPayload({
    source: 'truth-kernel',
    generatedAt: '2026-04-08T12:10:00.000Z',
    nodes: [
      {
        id: 'truth_1',
        kind: 'input',
        label: 'Incoming intent',
        summary: 'Grounded intake signal',
        what: 'Canvas intake record',
        why: 'Captured before routing.',
        represents: 'The incoming request state.',
        sourceType: 'workspace.intake',
        sourceRef: 'intake_1',
        derivedSource: 'workspace.studio.intake.records',
        status: 'healthy',
        statusOrigin: 'derived',
        confidence: 0.82,
        confidenceOrigin: 'derived',
        confidenceAvailable: true,
        timestamp: '2026-04-08T12:00:00.000Z',
      },
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
  assert.equal(normalized.dots.length, 2);
  assert.equal(normalized.source, 'truth-kernel');
  assert.equal(normalized.meta.canonicalTruthPresent, true);
  assert.equal(normalized.meta.canonicalTruthSectionsPresent, true);
  assert.equal(normalized.meta.fallbackUsed, false);
  assert.equal(normalized.canonicalTruth.domain, 'spatial');
  assert.equal(normalized.canonicalTruth.projectionId, 'truth_kernel');
  assert.equal(normalized.canonicalTruth.freshness, 'live');
  assert.equal(normalized.canonicalTruthSections.runtime.classification, 'projection');

  const renderModel = buildTruthKernelRenderModel(normalized, {
    positions: new Map([
      ['truth_1', { x: 120, y: 200 }],
      ['truth_2', { x: 320, y: 260 }],
    ]),
  });
  const renderSummary = summarizeTruthKernelRenderStatus(renderModel);
  const renderOrigin = summarizeTruthKernelPositionOrigin({
    dots: renderModel.dots.map((dot) => ({
      ...dot,
      sourceX: dot.sourceX,
      sourceY: dot.sourceY,
      normalizedX: dot.normalizedX,
      normalizedY: dot.normalizedY,
    })),
  }, { width: 1600, height: 920 });
  assert.equal(renderModel.dots.length, 2);
  assert.equal(renderModel.dots[0].x, 120);
  assert.equal(renderModel.dots[0].y, 200);
  assert.equal(renderSummary.normalizedDotCount, 2);
  assert.equal(renderSummary.renderedDotCount, 2);
  assert.equal(renderSummary.reason, null);
  assert.match(renderSummary.line, /truth-kernel \| normalized 2 \| rendered 2/);
  assert.equal(renderOrigin.verdict, 'render narrow');
  assert.equal(renderOrigin.likelyOrigin, 'insufficient position data');
  const inspector = buildTruthKernelNodeInspectorModel(normalized.dots[0], normalized);
  assert.equal(inspector.label, 'Incoming intent');
  assert.equal(inspector.rows.find((row) => row.label === 'Status / verdict').origin, 'derived');
  assert.equal(inspector.rows.find((row) => row.label === 'Confidence score').value, '82');
  assert.equal(inspector.rows.find((row) => row.label === 'Health score').origin, 'unavailable');

  const governed = buildTruthKernelProvenancePresentation(normalized);
  assert.equal(governed.hasGovernedProvenance, true);
  assert.equal(governed.fallbackLabel, 'No governed provenance');
  assert.equal(governed.chips.some((chip) => chip.label === 'Source' && chip.value === 'truth-kernel'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Domain' && chip.value === 'spatial'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Projection' && chip.value === 'truth_kernel'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Freshness' && chip.value === 'Live'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Generated' && chip.value === '2026-04-08T12:10:00.000Z'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Nodes' && chip.value === '2'), true);
  assert.equal(governed.chips.some((chip) => chip.label === 'Sections' && chip.value.startsWith('2')), true);

  const absent = buildTruthKernelProvenancePresentation({
    source: 'runtime-fallback',
    generatedAt: null,
    nodeCount: 0,
    nodes: [],
  });
  assert.equal(absent.hasGovernedProvenance, false);
  assert.equal(absent.fallbackLabel, 'No governed provenance');
  assert.equal(absent.chips.some((chip) => chip.label === 'Source' && chip.value === 'runtime-fallback'), true);
  assert.equal(absent.chips.some((chip) => chip.label === 'Nodes' && chip.value === '0'), true);

  const mismatched = normalizeTruthKernelPayload({
    source: 'runtime-fallback',
    truthKernel: {
      generatedAt: '2026-04-08T12:12:00.000Z',
      nodes: [],
    },
  });
  const mismatchedRender = summarizeTruthKernelRenderStatus(buildTruthKernelRenderModel(mismatched, { positions: new Map() }));
  assert.equal(mismatchedRender.source, 'runtime-fallback');
  assert.equal(mismatchedRender.renderedDotCount, 0);
  assert.equal(mismatchedRender.reason, 'payload empty');

  const sourceNarrow = summarizeTruthKernelPositionOrigin({
    dots: [
      { id: 'a', sourceX: 0.41, sourceY: 0.1, normalizedX: 0.41, normalizedY: 0.1, x: 412, y: 120 },
      { id: 'b', sourceX: 0.44, sourceY: 0.92, normalizedX: 0.44, normalizedY: 0.92, x: 468, y: 910 },
    ],
  }, { width: 1600, height: 920 });
  assert.equal(sourceNarrow.verdict, 'source narrow');
  assert.equal(sourceNarrow.likelyOrigin, 'upstream data clustering');
}
