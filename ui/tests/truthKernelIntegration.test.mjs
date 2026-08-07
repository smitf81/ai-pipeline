import assert from 'node:assert/strict';
import path from 'node:path';

import { smokeLoadSpatialApp } from './helpers/browser-module-loader.mjs';

export default async function runTruthKernelIntegrationTests() {
  const spatialAppPath = path.resolve(process.cwd(), 'public', 'spatial', 'spatialApp.js');
  const spatialApp = await smokeLoadSpatialApp(spatialAppPath, { locationHref: 'http://localhost/?mode=qa' });
  assert.equal(typeof spatialApp.resolveCanvasBackgroundFill, 'function');
  assert.equal(typeof spatialApp.formatTruthKernelTimestamp, 'function');
  assert.equal(typeof spatialApp.buildTruthKernelNodeInspectorModel, 'function');
  assert.equal(typeof spatialApp.buildTruthInspectionLegend, 'function');
  assert.equal(typeof spatialApp.resolveTruthInspectionPanelState, 'function');
  assert.equal(typeof spatialApp.resolveTruthKernelToggleState, 'function');
  assert.equal(typeof spatialApp.summarizeTruthKernelPositionOrigin, 'function');
  assert.equal(typeof spatialApp.summarizeTruthKernelSpread, 'function');
  assert.equal(typeof spatialApp.normalizeTruthKernelStageBounds, 'function');
  assert.equal(spatialApp.resolveCanvasBackgroundFill(false), '#08111d');
  assert.equal(spatialApp.resolveCanvasBackgroundFill(true), 'rgba(8, 17, 29, 0.72)');
  assert.deepEqual(spatialApp.normalizeTruthKernelStageBounds({ width: 1012.4, height: 703.7 }), { width: 1012, height: 704 });
  assert.deepEqual(spatialApp.normalizeTruthKernelStageBounds(null), { width: 1600, height: 920 });
  assert.equal(spatialApp.formatTruthKernelTimestamp(0), 'Unknown');
  assert.match(spatialApp.formatTruthKernelTimestamp(1712572800000), /^2024-04-08T/);
  const loadingToggle = spatialApp.resolveTruthKernelToggleState();
  assert.equal(loadingToggle.disabled, true);
  assert.equal(loadingToggle.title, 'Truth kernel loading...');
  assert.equal(loadingToggle.label, 'Truth (0)');
  const readyToggle = spatialApp.resolveTruthKernelToggleState({
    truthKernel: {
      nodeCount: 2,
      nodes: [
        { id: 'input_1', kind: 'input', timestamp: 1, parents: [], children: ['exec_1'], status: 'informational', confidence: 0.5, weight: 0.5 },
        { id: 'exec_1', kind: 'execution', timestamp: 2, parents: ['input_1'], children: [], status: 'healthy', confidence: 0.5, weight: 0.5 },
      ],
    },
    loadState: 'ready',
    visible: false,
  });
  assert.equal(readyToggle.disabled, false);
  assert.equal(readyToggle.title, 'Show truth kernel (2 real entities)');
  assert.equal(readyToggle.label, 'Truth (2)');
  const failedAfterReadyToggle = spatialApp.resolveTruthKernelToggleState({
    truthKernel: {
      nodeCount: 2,
      nodes: [],
    },
    loadState: 'error',
    visible: true,
  });
  assert.equal(failedAfterReadyToggle.disabled, false);
  assert.equal(failedAfterReadyToggle.title, 'Hide truth kernel (2 real entities)');
  assert.equal(failedAfterReadyToggle.label, 'Truth On (2)');
  const zeroDotToggle = spatialApp.resolveTruthKernelToggleState({
    truthKernel: {
      nodeCount: 0,
      meta: {
        reason: 'payload shape mismatch',
      },
    },
    loadState: 'ready',
    visible: false,
  });
  assert.equal(zeroDotToggle.disabled, true);
  assert.equal(zeroDotToggle.title, 'Truth kernel loaded with 0 entities: payload shape mismatch');
  const compactPanel = spatialApp.resolveTruthInspectionPanelState({
    truthKernelVisible: true,
    compactPreference: true,
  });
  assert.equal(compactPanel.compact, true);
  assert.equal(compactPanel.showObservabilityCards, false);
  assert.equal(compactPanel.railWidth, 256);
  assert.equal(compactPanel.toggleLabel, 'Expand');
  const expandedPanel = spatialApp.resolveTruthInspectionPanelState({
    truthKernelVisible: true,
    compactPreference: false,
  });
  assert.equal(expandedPanel.compact, false);
  assert.equal(expandedPanel.showObservabilityCards, true);
  assert.equal(expandedPanel.railWidth, 332);
  assert.equal(expandedPanel.toggleLabel, 'Compact');
  const legend = spatialApp.buildTruthInspectionLegend();
  assert.equal(Array.isArray(legend), true);
  assert.deepEqual(legend.map((entry) => entry.axis), ['R', 'G', 'B', 'A', 'SAT', 'NOISE']);
  const healthySpread = spatialApp.summarizeTruthKernelSpread({
    dots: [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 820, y: 410 },
      { id: 'c', x: 1420, y: 760 },
    ],
  }, { width: 1600, height: 920 });
  assert.equal(healthySpread.diagnosis, 'spread healthy');
  const narrowSpread = spatialApp.summarizeTruthKernelSpread({
    dots: [
      { id: 'a', x: 412, y: 120 },
      { id: 'b', x: 468, y: 910 },
    ],
  }, { width: 1600, height: 920 });
  assert.equal(narrowSpread.diagnosis, 'spread narrow');
  assert.equal(narrowSpread.causeClass, 'x-axis compression or vertical clustering');
  assert.equal(narrowSpread.boundsLine, 'render bounds: x 412-468, y 120-910');
  const pressuredSpread = spatialApp.summarizeTruthKernelSpread({
    dots: [
      { id: 'a', x: 120, y: 120 },
      { id: 'b', x: 136, y: 132 },
      { id: 'c', x: 1490, y: 820 },
      { id: 'd', x: 1502, y: 834 },
    ],
  }, { width: 1600, height: 920 });
  assert.equal(pressuredSpread.diagnosis, 'spread pressured');
  const sourceNarrowOrigin = spatialApp.summarizeTruthKernelPositionOrigin({
    dots: [
      { id: 'a', sourceX: 0.41, sourceY: 0.1, normalizedX: 0.41, normalizedY: 0.1, x: 412, y: 120 },
      { id: 'b', sourceX: 0.44, sourceY: 0.92, normalizedX: 0.44, normalizedY: 0.92, x: 468, y: 910 },
    ],
  }, { width: 1600, height: 920 });
  assert.equal(sourceNarrowOrigin.verdict, 'source narrow');
  assert.equal(sourceNarrowOrigin.likelyOrigin, 'upstream data clustering');
  const renderNarrowOrigin = spatialApp.summarizeTruthKernelPositionOrigin({
    dots: [
      { id: 'a', normalizedX: 120, normalizedY: 110, x: 412, y: 120 },
      { id: 'b', normalizedX: 1420, normalizedY: 860, x: 468, y: 910 },
    ],
  }, { width: 1600, height: 920 });
  assert.equal(renderNarrowOrigin.verdict, 'render narrow');
  assert.equal(renderNarrowOrigin.likelyOrigin, 'render scaling/compression');
  const inspector = spatialApp.buildTruthKernelNodeInspectorModel({
    id: 'truth_node_1',
    label: 'Planner handoff',
    classification: 'artifact',
    what: 'Planner handoff artifact',
    why: 'Carries routed work into planning.',
    represents: 'A planning checkpoint.',
    derivedSource: 'workspace.studio.handoffs',
    sourceNodeId: 'node_123',
    intentId: 'intent_123',
    agentRunId: 'run_123',
    status: 'blocked',
    statusOrigin: 'derived',
    blocker: 'Needs clarification.',
    reason: 'handoff_incomplete',
    confidence: 0.67,
    confidenceOrigin: 'derived',
    confidenceAvailable: true,
    recommendedOwner: 'planner',
    parents: ['a'],
    children: ['b'],
  }, { canonicalTruth: { domain: 'spatial', projectionId: 'truth_kernel' } });
  assert.equal(inspector.rows.find((row) => row.label === 'Status / verdict').value, 'blocked');
  assert.equal(inspector.rows.find((row) => row.label === 'Confidence score').value, '67');
  assert.equal(inspector.rows.find((row) => row.label === 'Recommended owner').value, 'planner');
  assert.equal(inspector.rows.find((row) => row.label === 'Source node').value, 'node_123');
  assert.match(inspector.rows.find((row) => row.label === 'Intent / run binding').value, /intent_123/);
  assert.equal(inspector.rows.find((row) => row.label === 'Reason').value, 'handoff_incomplete');
  const repairInspector = spatialApp.buildTruthKernelNodeInspectorModel({
    id: 'qa_repair_1',
    label: 'Validation Seam',
    classification: 'artifact',
    what: 'QA repair job state',
    why: 'Tracks the governed self-fix lifecycle separately from QA evidence artefacts.',
    represents: 'The current canonical repair state for one bounded QA repair lane.',
    canonicalSource: 'data/spatial/qa/repair-jobs.json',
    sourceType: 'qa-repair-job',
    sourceRef: 'qa_repair_1',
    verdict: 'applied_pending_verification',
    lane: 'validation_seam',
    targetType: 'external_validation_contract',
    truthApplicationStatus: 'applied_pending_verification',
    truthApplicationOrigin: 'canonical',
    postApplyVerificationVerdict: 'inconclusive',
    postApplyVerificationOrigin: 'derived',
    consistencyStatus: 'warning',
    consistencyOrigin: 'canonical',
    consistencyIssues: ['duplicate_apply_executed_event'],
    supportingEvidence: {
      classification: 'evidence_artefact',
      lastApplyReceiptId: 'qa_receipt_1',
      evidenceSources: ['data/spatial/qa/repair-attempts.json', 'data/spatial/qa/repair-apply-receipts.json'],
      eventStages: ['apply_executed', 'qa_revalidation_result'],
    },
    status: 'degraded',
    statusOrigin: 'canonical',
    blocker: 'Consistency warning: duplicate apply event.',
    confidence: 0.74,
    confidenceOrigin: 'derived',
    confidenceAvailable: true,
    recommendedOwner: 'qa',
    parents: ['qa_inv_1'],
    children: ['qa_attempt_1', 'qa_receipt_1'],
  }, { canonicalTruth: { domain: 'spatial', projectionId: 'truth_kernel' } });
  assert.equal(repairInspector.rows.find((row) => row.label === 'Repair lane').value, 'validation_seam');
  assert.equal(repairInspector.rows.find((row) => row.label === 'Target type').value, 'external_validation_contract');
  assert.equal(repairInspector.rows.find((row) => row.label === 'Apply lifecycle').value, 'applied_pending_verification');
  assert.equal(repairInspector.rows.find((row) => row.label === 'Verification verdict').value, 'inconclusive');
  assert.equal(repairInspector.rows.find((row) => row.label === 'Consistency').value, 'warning | duplicate_apply_executed_event');
  assert.match(repairInspector.rows.find((row) => row.label === 'Supporting evidence').value, /receipt qa_receipt_1/i);
}
