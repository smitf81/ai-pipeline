import { buildQAEvidenceProvenancePresentation } from './qaEvidenceProvenance.js';
import { summarizeCanonicalTruthSections } from './qaReadableSections.js';

function emptyTruthKernelMeta() {
  return {
    canonicalTruthPresent: false,
    canonicalTruthSectionsPresent: false,
    fallbackUsed: false,
    reason: null,
    route: null,
  };
}

function emptyTruthKernelRenderStatus() {
  return {
    normalizedDotCount: 0,
    renderedDotCount: 0,
    reason: 'payload empty',
    spread: null,
  };
}

export const EMPTY_TRUTH_KERNEL = Object.freeze({
  source: 'truth-kernel',
  canonicalTruth: null,
  canonicalTruthSections: null,
  generatedAt: null,
  dots: [],
  meta: emptyTruthKernelMeta(),
  renderStatus: emptyTruthKernelRenderStatus(),
  nodeCount: 0,
  nodes: [],
});

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function isRenderObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRenderText(value) {
  return String(value || '').trim();
}

function normalizeRenderStringArray(values = []) {
  return Array.isArray(values)
    ? [...new Set(values.map((value) => normalizeRenderText(value)).filter(Boolean))]
    : [];
}

function normalizeSupportingEvidence(value = null) {
  if (!isRenderObject(value)) return null;
  const evidenceSources = normalizeRenderStringArray(value.evidenceSources || value.evidence_sources || []);
  const eventStages = normalizeRenderStringArray(value.eventStages || value.event_stages || []);
  const lastApplyReceiptId = normalizeRenderText(value.lastApplyReceiptId || value.last_apply_receipt_id || value.receiptId || value.receipt_id) || null;
  if (!evidenceSources.length && !eventStages.length && !lastApplyReceiptId) {
    return null;
  }
  return {
    classification: normalizeRenderText(value.classification) || 'evidence_artefact',
    lastApplyReceiptId,
    evidenceSources,
    eventStages,
  };
}

function normalizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'healthy' || normalized === 'degraded' || normalized === 'blocked' || normalized === 'orphaned' || normalized === 'informational') {
    return normalized;
  }
  return 'informational';
}

function normalizeCanonicalTruth(value = null) {
  return isRenderObject(value)
    ? {
        domain: String(value.domain || '').trim() || null,
        projectionId: String(value.projectionId || '').trim() || null,
        classification: String(value.classification || '').trim() || null,
        freshness: String(value.freshness || '').trim() || null,
        generatedAt: String(value.generatedAt || '').trim() || null,
        fallbackUsed: typeof value.fallbackUsed === 'boolean' ? value.fallbackUsed : null,
      }
    : null;
}

function extractCoordinate(node = {}, keys = []) {
  for (const key of keys) {
    const direct = node?.[key];
    if (Number.isFinite(Number(direct))) return Number(direct);
    const nested = node?.position?.[key];
    if (Number.isFinite(Number(nested))) return Number(nested);
  }
  return null;
}

function normalizeTruthKernelNode(node = {}) {
  return {
    id: String(node?.id || '').trim(),
    kind: ['input', 'execution', 'artifact'].includes(node?.kind) ? node.kind : 'artifact',
    label: String(node?.label || node?.title || '').trim() || null,
    summary: String(node?.summary || '').trim() || null,
    what: String(node?.what || '').trim() || null,
    why: String(node?.why || '').trim() || null,
    represents: String(node?.represents || '').trim() || null,
    classification: String(node?.classification || node?.kind || '').trim() || null,
    truthState: String(node?.truthState || node?.status || '').trim() || normalizeStatus(node?.status),
    sourceType: String(node?.sourceType || '').trim() || null,
    sourceRef: String(node?.sourceRef || '').trim() || null,
    canonicalSource: String(node?.canonicalSource || '').trim() || null,
    derivedSource: String(node?.derivedSource || '').trim() || null,
    verdict: String(node?.verdict || '').trim() || null,
    blocker: String(node?.blocker || '').trim() || null,
    owner: String(node?.owner || '').trim() || null,
    recommendedOwner: String(node?.recommendedOwner || '').trim() || null,
    sourceX: extractCoordinate(node, ['sourceX', 'x']),
    sourceY: extractCoordinate(node, ['sourceY', 'y']),
    sourceZ: extractCoordinate(node, ['sourceZ', 'z']),
    timestamp: Number.isFinite(node?.timestamp) ? node.timestamp : Date.parse(node?.timestamp || '') || 0,
    parents: Array.isArray(node?.parents) ? [...new Set(node.parents.filter(Boolean).map((value) => String(value)))] : [],
    children: Array.isArray(node?.children) ? [...new Set(node.children.filter(Boolean).map((value) => String(value)))] : [],
    status: normalizeStatus(node?.status),
    statusOrigin: ['canonical', 'derived', 'unavailable'].includes(String(node?.statusOrigin || '').trim()) ? String(node.statusOrigin).trim() : 'unavailable',
    confidence: clamp01(node?.confidence, 0.5),
    confidenceOrigin: ['canonical', 'derived', 'unavailable'].includes(String(node?.confidenceOrigin || '').trim()) ? String(node.confidenceOrigin).trim() : 'unavailable',
    confidenceAvailable: !!node?.confidenceAvailable || ['canonical', 'derived'].includes(String(node?.confidenceOrigin || '').trim()),
    healthScore: Number.isFinite(Number(node?.healthScore)) ? Number(node.healthScore) : null,
    healthOrigin: ['canonical', 'derived', 'unavailable'].includes(String(node?.healthOrigin || '').trim()) ? String(node.healthOrigin).trim() : 'unavailable',
    weight: clamp01(node?.weight, 0.5),
    lane: normalizeRenderText(node?.lane || node?.laneId || node?.lane_id) || null,
    targetType: normalizeRenderText(node?.targetType || node?.target_type) || null,
    truthApplicationStatus: normalizeRenderText(node?.truthApplicationStatus || node?.truth_application_status) || null,
    truthApplicationOrigin: ['canonical', 'derived', 'unavailable'].includes(normalizeRenderText(node?.truthApplicationOrigin || node?.truth_application_origin))
      ? normalizeRenderText(node?.truthApplicationOrigin || node?.truth_application_origin)
      : 'unavailable',
    postApplyVerificationVerdict: normalizeRenderText(node?.postApplyVerificationVerdict || node?.post_apply_verification_verdict) || null,
    postApplyVerificationOrigin: ['canonical', 'derived', 'unavailable'].includes(normalizeRenderText(node?.postApplyVerificationOrigin || node?.post_apply_verification_origin))
      ? normalizeRenderText(node?.postApplyVerificationOrigin || node?.post_apply_verification_origin)
      : 'unavailable',
    evaluatorDeltaScore: Number.isFinite(Number(node?.evaluatorDeltaScore ?? node?.evaluator_delta_score))
      ? Number(node.evaluatorDeltaScore ?? node.evaluator_delta_score)
      : null,
    evaluatorProgressState: normalizeRenderText(node?.evaluatorProgressState || node?.evaluator_progress_state) || null,
    evaluatorScorePressure: normalizeRenderText(node?.evaluatorScorePressure || node?.evaluator_score_pressure) || null,
    evaluatorCognitionMode: normalizeRenderText(node?.evaluatorCognitionMode || node?.evaluator_cognition_mode) || null,
    consistencyStatus: normalizeRenderText(node?.consistencyStatus || node?.consistency_status) || null,
    consistencyOrigin: ['canonical', 'derived', 'unavailable'].includes(normalizeRenderText(node?.consistencyOrigin || node?.consistency_origin))
      ? normalizeRenderText(node?.consistencyOrigin || node?.consistency_origin)
      : 'unavailable',
    consistencyIssues: normalizeRenderStringArray(node?.consistencyIssues || node?.consistency_issues || []),
    supportingEvidence: normalizeSupportingEvidence(node?.supportingEvidence || node?.supporting_evidence || null),
  };
}

function resolveTruthKernelPayloadRoot(payload = null) {
  if (isRenderObject(payload?.truthKernel)) {
    return {
      wrapper: isRenderObject(payload) ? payload : {},
      kernel: payload.truthKernel,
      source: String(payload?.source || '').trim() || 'runtime-fallback',
    };
  }
  return {
    wrapper: {},
    kernel: isRenderObject(payload) ? payload : {},
    source: String(payload?.source || '').trim() || 'truth-kernel',
  };
}

function resolveZeroDotReason({ kernel, dots, source, reason }) {
  const explicitReason = String(reason || '').trim();
  if (explicitReason) return explicitReason;
  if (!isRenderObject(kernel) || Object.keys(kernel).length === 0) return source === 'runtime-fallback' ? 'route unavailable' : 'payload shape mismatch';
  if (!Array.isArray(kernel.nodes) && !Array.isArray(kernel.dots)) return 'payload shape mismatch';
  if (!dots.length) return 'payload empty';
  return null;
}

export function normalizeTruthKernelPayload(payload = null, options = {}) {
  const { wrapper, kernel, source: detectedSource } = resolveTruthKernelPayloadRoot(payload);
  const source = String(options.source || detectedSource).trim() || 'truth-kernel';
  const route = String(options.route || payload?.route || wrapper?.route || payload?.meta?.route || wrapper?.meta?.route || '').trim()
    || (source === 'runtime-fallback' ? '/api/spatial/runtime' : '/api/spatial/truth-kernel');
  const rawDots = Array.isArray(kernel?.dots)
    ? kernel.dots
    : (Array.isArray(kernel?.nodes) ? kernel.nodes : []);
  const canonicalTruth = normalizeCanonicalTruth(kernel?.canonicalTruth || wrapper?.canonicalTruth);
  const canonicalTruthSections = isRenderObject(kernel?.canonicalTruthSections)
    ? kernel.canonicalTruthSections
    : (isRenderObject(wrapper?.canonicalTruthSections) ? wrapper.canonicalTruthSections : null);
  const dots = rawDots
    .map((node) => ({
      ...normalizeTruthKernelNode(node),
      x: extractCoordinate(node, ['x']),
      y: extractCoordinate(node, ['y']),
      z: extractCoordinate(node, ['z']),
    }))
    .filter((node) => node.id)
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
      return left.id.localeCompare(right.id);
    });
  const fallbackUsed = typeof options.fallbackUsed === 'boolean'
    ? options.fallbackUsed
    : (typeof payload?.fallbackUsed === 'boolean'
      ? payload.fallbackUsed
      : (typeof canonicalTruth?.fallbackUsed === 'boolean'
        ? canonicalTruth.fallbackUsed
        : source === 'runtime-fallback'));
  const reason = resolveZeroDotReason({
    kernel,
    dots,
    source,
    reason: options.reason || payload?.meta?.reason || wrapper?.meta?.reason,
  });
  const meta = {
    canonicalTruthPresent: !!canonicalTruth,
    canonicalTruthSectionsPresent: !!canonicalTruthSections,
    fallbackUsed,
    reason,
    route,
  };
  return {
    source,
    canonicalTruth,
    canonicalTruthSections,
    generatedAt: kernel?.generatedAt || wrapper?.generatedAt || null,
    dots,
    meta,
    renderStatus: {
      normalizedDotCount: dots.length,
      renderedDotCount: 0,
      reason,
      spread: null,
      positionOrigin: null,
    },
    nodeCount: dots.length,
    nodes: dots.map((dot) => ({
      id: dot.id,
      kind: dot.kind,
      label: dot.label,
      classification: dot.classification,
      truthState: dot.truthState,
      sourceX: dot.sourceX,
      sourceY: dot.sourceY,
      sourceZ: dot.sourceZ,
      x: dot.x,
      y: dot.y,
      z: dot.z,
      timestamp: dot.timestamp,
      parents: dot.parents,
      children: dot.children,
      status: dot.status,
      confidence: dot.confidence,
      weight: dot.weight,
      lane: dot.lane,
      targetType: dot.targetType,
      truthApplicationStatus: dot.truthApplicationStatus,
      postApplyVerificationVerdict: dot.postApplyVerificationVerdict,
      consistencyStatus: dot.consistencyStatus,
    })),
  };
}

export function buildTruthKernelRenderModel(truthKernel = EMPTY_TRUTH_KERNEL, layout = null) {
  const source = isRenderObject(truthKernel) ? truthKernel : EMPTY_TRUTH_KERNEL;
  const positions = layout?.positions || new Map();
  const normalizedDots = Array.isArray(source.dots) ? source.dots : [];
  const dots = normalizedDots
    .map((dot) => {
      const position = positions.get(dot.id);
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
      return {
        ...dot,
        normalizedX: dot.x,
        normalizedY: dot.y,
        normalizedZ: dot.z,
        x: position.x,
        y: position.y,
      };
    })
    .filter(Boolean);
  const reason = dots.length
    ? null
    : (source.renderStatus?.reason || source.meta?.reason || (normalizedDots.length ? 'payload shape mismatch' : 'payload empty'));
  return {
    source: String(source.source || '').trim() || 'truth-kernel',
    dots,
    meta: {
      ...emptyTruthKernelMeta(),
      ...(isRenderObject(source.meta) ? source.meta : {}),
      reason,
    },
    renderStatus: {
      normalizedDotCount: normalizedDots.length,
      renderedDotCount: dots.length,
      reason,
      spread: null,
      positionOrigin: null,
    },
  };
}

function formatBoundValue(value = null) {
  if (!Number.isFinite(Number(value))) return '?';
  const numeric = Number(value);
  if (Math.abs(numeric) >= 100) return String(Math.round(numeric));
  return String(Number(numeric.toFixed(2)));
}

function summarizeStageBounds(dots = [], xKey, yKey, bounds = {}) {
  const stageDots = (Array.isArray(dots) ? dots : []).filter((dot) => Number.isFinite(dot?.[xKey]) && Number.isFinite(dot?.[yKey]));
  if (!stageDots.length) {
    return {
      available: false,
      dotCount: 0,
      minX: null,
      maxX: null,
      minY: null,
      maxY: null,
      spanX: 0,
      spanY: 0,
      widthRatio: 0,
      heightRatio: 0,
      diagnosis: 'spread unavailable',
      line: 'bounds unavailable',
    };
  }
  const xValues = stageDots.map((dot) => Number(dot[xKey]));
  const yValues = stageDots.map((dot) => Number(dot[yKey]));
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, maxY - minY);
  const normalizedScale = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY)) <= 1.5;
  const canvasWidth = normalizedScale ? 1 : (Number.isFinite(Number(bounds?.width)) ? Math.max(1, Number(bounds.width)) : 1600);
  const canvasHeight = normalizedScale ? 1 : (Number.isFinite(Number(bounds?.height)) ? Math.max(1, Number(bounds.height)) : 920);
  const widthRatio = spanX / canvasWidth;
  const heightRatio = spanY / canvasHeight;
  let diagnosis = 'spread healthy';
  if (stageDots.length <= 1 || (widthRatio < 0.03 && heightRatio < 0.03)) {
    diagnosis = 'spread collapsed';
  } else if (widthRatio < 0.08 || heightRatio < 0.08) {
    diagnosis = 'spread narrow';
  }
  return {
    available: true,
    dotCount: stageDots.length,
    minX,
    maxX,
    minY,
    maxY,
    spanX,
    spanY,
    widthRatio,
    heightRatio,
    diagnosis,
    line: `x ${formatBoundValue(minX)}-${formatBoundValue(maxX)}, y ${formatBoundValue(minY)}-${formatBoundValue(maxY)}`,
  };
}

export function summarizeTruthKernelSpread(renderModel = null, bounds = {}) {
  const dots = Array.isArray(renderModel?.dots) ? renderModel.dots.filter((dot) => Number.isFinite(dot?.x) && Number.isFinite(dot?.y)) : [];
  const canvasWidth = Number.isFinite(Number(bounds?.width)) ? Math.max(1, Number(bounds.width)) : 1600;
  const canvasHeight = Number.isFinite(Number(bounds?.height)) ? Math.max(1, Number(bounds.height)) : 920;
  if (dots.length === 0) {
    return {
      dotCount: 0,
      minX: null,
      maxX: null,
      minY: null,
      maxY: null,
      spanX: 0,
      spanY: 0,
      widthRatio: 0,
      heightRatio: 0,
      diagnosis: 'spread unavailable',
      causeClass: 'no rendered dots',
      boundsLine: 'render bounds unavailable',
      spanLine: 'span 0 x 0',
      line: 'render bounds unavailable | span 0 x 0 | spread unavailable',
    };
  }
  const xValues = dots.map((dot) => dot.x);
  const yValues = dots.map((dot) => dot.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, maxY - minY);
  const widthRatio = spanX / canvasWidth;
  const heightRatio = spanY / canvasHeight;
  let diagnosis = 'spread healthy';
  let causeClass = 'distributed layout';
  if (dots.length <= 1 || (widthRatio < 0.03 && heightRatio < 0.03)) {
    diagnosis = 'spread collapsed';
    causeClass = dots.length <= 1 ? 'insufficient rendered dots' : 'projection compression or identical coordinates';
  } else if (widthRatio < 0.08 || heightRatio < 0.08) {
    diagnosis = 'spread narrow';
    causeClass = widthRatio < 0.08 && heightRatio >= 0.18
      ? 'x-axis compression or vertical clustering'
      : heightRatio < 0.08 && widthRatio >= 0.18
        ? 'y-axis compression or horizontal clustering'
        : 'tight data clustering or projection compression';
  }
  const boundsLine = `render bounds: x ${Math.round(minX)}-${Math.round(maxX)}, y ${Math.round(minY)}-${Math.round(maxY)}`;
  const spanLine = `span: ${Math.round(spanX)} x ${Math.round(spanY)}`;
  return {
    dotCount: dots.length,
    minX,
    maxX,
    minY,
    maxY,
    spanX,
    spanY,
    widthRatio,
    heightRatio,
    diagnosis,
    causeClass,
    boundsLine,
    spanLine,
    line: `${boundsLine} | ${spanLine} | ${diagnosis}`,
  };
}

export function summarizeTruthKernelPositionOrigin(renderModel = null, bounds = {}) {
  const dots = Array.isArray(renderModel?.dots) ? renderModel.dots : [];
  const source = summarizeStageBounds(dots, 'sourceX', 'sourceY', bounds);
  const normalized = summarizeStageBounds(dots, 'normalizedX', 'normalizedY', bounds);
  const render = summarizeStageBounds(dots, 'x', 'y', bounds);
  let verdict = 'positions healthy';
  let likelyOrigin = 'distributed layout';
  if (!render.available) {
    verdict = 'position origin unavailable';
    likelyOrigin = 'insufficient position data';
  } else if (source.available && source.diagnosis !== 'spread healthy') {
    verdict = source.diagnosis === 'spread collapsed' ? 'source collapsed' : 'source narrow';
    likelyOrigin = 'upstream data clustering';
  } else if (normalized.available && normalized.diagnosis !== 'spread healthy') {
    verdict = normalized.diagnosis === 'spread collapsed' ? 'normalized collapsed' : 'normalized narrow';
    likelyOrigin = 'adapter normalization compression';
  } else if (render.diagnosis !== 'spread healthy') {
    verdict = render.diagnosis === 'spread collapsed' ? 'render collapsed' : 'render narrow';
    likelyOrigin = (!source.available && !normalized.available)
      ? 'insufficient position data'
      : 'render scaling/compression';
  } else if (!source.available && !normalized.available) {
    verdict = 'position origin unavailable';
    likelyOrigin = 'insufficient position data';
  }
  return {
    source,
    normalized,
    render,
    verdict,
    likelyOrigin,
    line: `source ${source.line} | normalized ${normalized.line} | render ${render.line} | ${verdict} | ${likelyOrigin}`,
  };
}

export function buildTruthKernelNodeInspectorModel(node = null, truthKernel = EMPTY_TRUTH_KERNEL) {
  if (!node || typeof node !== 'object') return null;
  const canonicalTruth = truthKernel?.canonicalTruth && typeof truthKernel.canonicalTruth === 'object'
    ? truthKernel.canonicalTruth
    : null;
  const healthScoreValue = Number.isFinite(Number(node.healthScore)) ? Math.round(Number(node.healthScore)) : null;
  const confidenceScoreValue = node.confidenceAvailable ? Math.round(clamp01(node.confidence, 0) * 100) : null;
  const sourceDescriptor = node.canonicalSource
    ? { value: node.canonicalSource, origin: 'canonical' }
    : node.derivedSource
      ? { value: node.derivedSource, origin: 'derived' }
      : canonicalTruth?.projectionId
        ? { value: `${canonicalTruth.domain || 'spatial'}:${canonicalTruth.projectionId}`, origin: 'canonical' }
        : { value: 'Insufficient evidence surfaced.', origin: 'unavailable' };
  const repairLifecycleRows = (node.sourceType === 'qa-repair-job' || node.truthApplicationStatus || node.targetType || node.lane)
    ? [
        { label: 'Repair lane', value: node.lane || 'Insufficient evidence surfaced.', origin: node.lane ? 'canonical' : 'unavailable' },
        { label: 'Target type', value: node.targetType || 'Insufficient evidence surfaced.', origin: node.targetType ? 'canonical' : 'unavailable' },
        { label: 'Apply lifecycle', value: node.truthApplicationStatus || node.verdict || node.status || 'Insufficient evidence surfaced.', origin: node.truthApplicationStatus ? (node.truthApplicationOrigin || 'canonical') : (node.verdict || node.status ? (node.statusOrigin || 'derived') : 'unavailable') },
        { label: 'Verification verdict', value: node.postApplyVerificationVerdict || 'Insufficient evidence surfaced.', origin: node.postApplyVerificationVerdict ? (node.postApplyVerificationOrigin || 'derived') : 'unavailable' },
        { label: 'Consistency', value: node.consistencyStatus ? `${node.consistencyStatus}${node.consistencyIssues.length ? ` | ${node.consistencyIssues.join(', ')}` : ''}` : 'Insufficient evidence surfaced.', origin: node.consistencyStatus ? (node.consistencyOrigin || 'canonical') : 'unavailable' },
        { label: 'Supporting evidence', value: node.supportingEvidence ? [
          node.supportingEvidence.lastApplyReceiptId ? `receipt ${node.supportingEvidence.lastApplyReceiptId}` : null,
          node.supportingEvidence.eventStages.length ? `events ${node.supportingEvidence.eventStages.join(', ')}` : null,
          node.supportingEvidence.evidenceSources.length ? node.supportingEvidence.evidenceSources.join(' | ') : null,
        ].filter(Boolean).join(' | ') : 'Insufficient evidence surfaced.', origin: node.supportingEvidence ? 'derived' : 'unavailable' },
      ]
    : [];
  const evaluatorRows = (node.sourceType === 'ace-evaluator' || node.evaluatorProgressState || node.evaluatorCognitionMode || node.evaluatorDeltaScore !== null)
    ? [
        { label: 'Evaluator verdict', value: node.verdict || 'Insufficient evidence surfaced.', origin: node.verdict ? (node.statusOrigin || 'derived') : 'unavailable' },
        { label: 'Progress state', value: node.evaluatorProgressState || node.truthState || 'Insufficient evidence surfaced.', origin: node.evaluatorProgressState || node.truthState ? 'derived' : 'unavailable' },
        { label: 'Delta score', value: node.evaluatorDeltaScore === null ? 'Insufficient evidence surfaced.' : String(Number(node.evaluatorDeltaScore.toFixed(2))), origin: node.evaluatorDeltaScore === null ? 'unavailable' : 'derived' },
        { label: 'Score pressure', value: node.evaluatorScorePressure || 'Insufficient evidence surfaced.', origin: node.evaluatorScorePressure ? 'derived' : 'unavailable' },
        { label: 'Cognition mode', value: node.evaluatorCognitionMode || 'Insufficient evidence surfaced.', origin: node.evaluatorCognitionMode ? 'derived' : 'unavailable' },
      ]
    : [];
  return {
    id: node.id || 'unknown',
    label: node.label || node.summary || node.id || 'Unknown truth node',
    type: node.classification || node.kind || 'artifact',
    rows: [
      { label: 'What this is', value: node.what || 'Insufficient evidence surfaced.', origin: node.what ? 'derived' : 'unavailable' },
      { label: 'Why it exists', value: node.why || 'Insufficient evidence surfaced.', origin: node.why ? 'derived' : 'unavailable' },
      { label: 'Represents', value: node.represents || 'Insufficient evidence surfaced.', origin: node.represents ? 'derived' : 'unavailable' },
      { label: 'Canonical / derived source', value: sourceDescriptor.value, origin: sourceDescriptor.origin },
      ...repairLifecycleRows,
      ...evaluatorRows,
      { label: 'Status / verdict', value: node.verdict || node.status || 'Insufficient evidence surfaced.', origin: node.verdict || node.status ? (node.statusOrigin || 'derived') : 'unavailable' },
      { label: 'Blocker', value: node.blocker || 'Insufficient evidence surfaced.', origin: node.blocker ? 'derived' : 'unavailable' },
      { label: 'Health score', value: healthScoreValue === null ? 'Insufficient evidence surfaced.' : String(healthScoreValue), origin: healthScoreValue === null ? 'unavailable' : (node.healthOrigin || 'derived') },
      { label: 'Confidence score', value: confidenceScoreValue === null ? 'Insufficient evidence surfaced.' : String(confidenceScoreValue), origin: confidenceScoreValue === null ? 'unavailable' : (node.confidenceOrigin || 'derived') },
      { label: 'Recommended owner', value: node.recommendedOwner || node.owner || 'Insufficient evidence surfaced.', origin: node.recommendedOwner || node.owner ? 'derived' : 'unavailable' },
    ],
    meta: {
      sourceType: node.sourceType || 'unknown',
      sourceRef: node.sourceRef || node.id || 'unknown',
      parents: Array.isArray(node.parents) ? node.parents.length : 0,
      children: Array.isArray(node.children) ? node.children.length : 0,
      summary: node.summary || null,
    },
  };
}

export function summarizeTruthKernelRenderStatus(renderModel = null) {
  const source = String(renderModel?.source || '').trim() || 'truth-kernel';
  const normalizedDotCount = Number.isFinite(Number(renderModel?.renderStatus?.normalizedDotCount))
    ? Math.max(0, Number(renderModel.renderStatus.normalizedDotCount))
    : 0;
  const renderedDotCount = Number.isFinite(Number(renderModel?.renderStatus?.renderedDotCount))
    ? Math.max(0, Number(renderModel.renderStatus.renderedDotCount))
    : 0;
  const reason = String(renderModel?.renderStatus?.reason || renderModel?.meta?.reason || '').trim() || null;
  const spread = renderModel?.renderStatus?.spread || null;
  const positionOrigin = renderModel?.renderStatus?.positionOrigin || null;
  const route = String(renderModel?.meta?.route || '').trim() || (source === 'runtime-fallback' ? '/api/spatial/runtime' : '/api/spatial/truth-kernel');
  return {
    source,
    route,
    normalizedDotCount,
    renderedDotCount,
    fallbackUsed: !!renderModel?.meta?.fallbackUsed,
    reason: renderedDotCount > 0 ? null : (reason || 'payload empty'),
    spread,
    positionOrigin,
    line: `${source} | normalized ${normalizedDotCount} | rendered ${renderedDotCount}${renderModel?.meta?.fallbackUsed ? ' | fallback yes' : ' | fallback no'}${renderedDotCount > 0 ? (spread?.diagnosis ? ` | ${spread.diagnosis}` : '') : ` | ${reason || 'payload empty'}`}`,
  };
}

export function buildTruthKernelProvenancePresentation(truthKernel = EMPTY_TRUTH_KERNEL) {
  const source = truthKernel && typeof truthKernel === 'object' ? truthKernel : {};
  const canonicalTruth = source.canonicalTruth && typeof source.canonicalTruth === 'object' && !Array.isArray(source.canonicalTruth)
    ? source.canonicalTruth
    : {};
  const provenance = buildQAEvidenceProvenancePresentation({
    ...canonicalTruth,
    sourceLabel: canonicalTruth.label || 'truth-kernel',
    sourceClass: canonicalTruth.classification || null,
    freshnessClass: canonicalTruth.freshness || null,
    generatedAt: canonicalTruth.generatedAt || source.generatedAt || null,
    fallbackUsed: typeof canonicalTruth.fallbackUsed === 'boolean' ? canonicalTruth.fallbackUsed : null,
  }, {
    fallbackLabel: 'No governed provenance',
  });
  const sectionSummary = summarizeCanonicalTruthSections(source.canonicalTruthSections || {});
  const nodeCount = Number.isFinite(Number(source.nodeCount)) ? Math.max(0, Number(source.nodeCount)) : 0;
  const sourceLabel = String(source.source || '').trim() || 'truth-kernel';
  const chips = [...provenance.chips, {
    label: 'Source',
    value: sourceLabel,
    tone: sourceLabel === 'runtime-fallback' ? 'neutral' : 'good',
  }];
  if (Number.isFinite(nodeCount)) {
    chips.push({
      label: 'Nodes',
      value: String(nodeCount),
      tone: nodeCount > 0 ? 'good' : 'neutral',
    });
  }
  if (sectionSummary.count > 0) {
    chips.push({
      label: 'Sections',
      value: `${sectionSummary.count}${sectionSummary.preferredKeys.length ? ` | ${sectionSummary.preferredKeys.join(' / ')}` : ''}`,
      tone: 'neutral',
    });
  }
  return {
    ...provenance,
    chips,
    nodeCount,
    sectionSummary,
    hasGovernedProvenance: provenance.hasRenderableProvenance || sectionSummary.count > 0,
    hasRenderableProvenance: provenance.hasRenderableProvenance || nodeCount > 0 || sectionSummary.count > 0,
    fallbackLabel: provenance.fallbackLabel || 'No governed provenance',
  };
}
