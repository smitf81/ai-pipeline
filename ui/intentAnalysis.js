const INTENT_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'have', 'will',
  'about', 'would', 'should', 'could', 'there', 'their', 'them', 'then', 'than', 'when',
  'what', 'where', 'while', 'were', 'been', 'being', 'also', 'just', 'over', 'under',
  'onto', 'need', 'needs', 'want', 'wants', 'able', 'make', 'lets',
]);
const {
  DEFAULT_DOMAIN_KEY,
  buildAnchorBundle,
  resolveAnchorIntentWeight,
  tokenizeKeywordSource,
  topKeywordsFromCounts,
} = require('./anchorResolver');
const {
  getContextManagerNode,
  normalizeGraphBundle,
} = require('./graphQueries');
const {
  buildGraphMutationPreview,
  applyGraphMutations,
} = require('./graphMutations');

const LEGACY_ACTION_PATTERN = /\b(build|fix|create|implement|wire|connect|review|scan|plan|design|update|remove|delete|disable|support)\b/gi;
const CURRENT_ACTION_PATTERN = /\b(build|fix|create|implement|wire|connect|review|scan|plan|design|update|remove|delete|disable|support|add|introduce|expose|enable|allow|test|verify|document)\b/gi;
const FEATURE_REQUEST_PATTERN = /\b(we should|should add|let's add|add a desk|add an agent|add a qa agent|introduce a desk|introduce an agent|support a qa desk|allow a qa agent)\b/gi;
const EXECUTION_HINT_PATTERN = /\b(file|patch|build|deploy|restart|compile|test|apply|execute|run)\b/gi;
const ARCHITECTURE_PATTERN = /\b(agent|desk|context|planner|executor|memory|archivist|studio|canvas|node|backend|frontend|api|service|module|architecture|overlay|orchestrator|kanban|board|qa)\b/gi;
const CONSTRAINT_PATTERN = /\b(must|should|avoid|blocker|needs|review|constraint|guardrail|boundary|approval|permission|deploy)\b/gi;

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function averageScores(items = []) {
  if (!items.length) return 0;
  return Number((items.reduce((sum, item) => sum + Number(item.score || 0), 0) / items.length).toFixed(2));
}

function countMatches(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeIntentPriority(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['low', 'normal', 'medium', 'high'].includes(normalized)) {
    return normalized === 'medium' ? 'normal' : normalized;
  }
  return 'normal';
}

function normalizeSpatialIntentGeometry(geometryInput = {}, fallbackInput = {}) {
  const geometry = geometryInput && typeof geometryInput === 'object' ? geometryInput : {};
  const fallback = fallbackInput && typeof fallbackInput === 'object' ? fallbackInput : {};
  const region = geometry.region || geometry.bounds || fallback.region || fallback.bounds || null;
  const stroke = geometry.stroke || geometry.path || fallback.stroke || fallback.path || null;
  const kind = String(
    geometry.kind
    || geometry.type
    || fallback.kind
    || fallback.type
    || (stroke ? 'stroke' : region ? 'region' : 'unknown'),
  ).trim().toLowerCase() || 'unknown';
  return {
    kind,
    region: region || null,
    stroke: stroke || null,
  };
}

function countGeometryPoints(geometry = {}) {
  if (Array.isArray(geometry?.stroke)) return geometry.stroke.length;
  if (Array.isArray(geometry?.region?.points)) return geometry.region.points.length;
  if (Array.isArray(geometry?.path)) return geometry.path.length;
  return 0;
}

function buildSpatialGeometryReasoning({ kind, pointCount, regionPresent, strokePresent, confidence } = {}) {
  const reasoning = [];
  reasoning.push(`kind=${kind}`);
  reasoning.push(`pointCount=${pointCount}`);
  reasoning.push(regionPresent ? 'region-present' : 'region-missing');
  reasoning.push(strokePresent ? 'stroke-present' : 'stroke-missing');
  reasoning.push(`confidence=${Number(confidence).toFixed(2)}`);
  return reasoning;
}

function normalizeFieldDimension(value = 7, fallback = 7) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(3, Math.round(Number(fallback) || 7));
  }
  return Math.max(3, Math.min(11, Math.round(numeric)));
}

function createFieldGrid(width = 7, height = 7, fallbackValue = 0.08) {
  const resolvedWidth = normalizeFieldDimension(width, 7);
  const resolvedHeight = normalizeFieldDimension(height, 7);
  return Array.from({ length: resolvedHeight }, () => Array.from({ length: resolvedWidth }, () => fallbackValue));
}

function cloneFieldLayer(values = [], width = 7, height = 7, fallbackValue = 0.08, role = 'build-desirability', resolution = 1) {
  const resolvedWidth = normalizeFieldDimension(width, 7);
  const resolvedHeight = normalizeFieldDimension(height, 7);
  const resolvedValues = Array.from({ length: resolvedHeight }, (_, y) => Array.from({ length: resolvedWidth }, (_, x) => {
    const sample = values?.[y]?.[x];
    return Number.isFinite(Number(sample)) ? Number(sample) : fallbackValue;
  }));
  return {
    kind: 'field-layer',
    role,
    resolution,
    width: resolvedWidth,
    height: resolvedHeight,
    aggregateStrategy: resolution > 1 ? 'majority' : 'identity',
    fallbackValue,
    values: resolvedValues,
  };
}

function describeFieldLayer(layer = null) {
  if (!layer) {
    return 'missing layer';
  }
  return `${layer.role || 'build-desirability'} ${layer.width}x${layer.height} @${layer.resolution || 1}x`;
}

function deriveCoarseFieldLayer(baseLayer, factor = 2, role = 'build-desirability-coarse') {
  const resolution = Math.max(1, Math.round(Number(factor) || 2));
  const width = Math.max(1, Math.ceil(Number(baseLayer?.width || 1) / resolution));
  const height = Math.max(1, Math.ceil(Number(baseLayer?.height || 1) / resolution));
  const fallbackValue = Number.isFinite(Number(baseLayer?.fallbackValue)) ? Number(baseLayer.fallbackValue) : 0.08;
  const values = Array.from({ length: height }, (_, coarseY) => Array.from({ length: width }, (_, coarseX) => {
    const samples = [];
    for (let y = coarseY * resolution; y < Math.min(Number(baseLayer?.height || 0), (coarseY + 1) * resolution); y += 1) {
      for (let x = coarseX * resolution; x < Math.min(Number(baseLayer?.width || 0), (coarseX + 1) * resolution); x += 1) {
        const sample = baseLayer?.values?.[y]?.[x];
        if (Number.isFinite(Number(sample))) {
          samples.push(Number(sample));
        }
      }
    }
    if (!samples.length) {
      return fallbackValue;
    }
    return Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(2));
  }));

  return cloneFieldLayer(values, width, height, fallbackValue, role, resolution);
}

function paintFieldCell(values = [], x = 0, y = 0, nextValue = 0.9) {
  if (!Array.isArray(values) || !values.length) return;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  if (y < 0 || y >= values.length) return;
  if (x < 0 || x >= (values[y] || []).length) return;
  values[y][x] = nextValue;
}

function pointFromGeometrySample(sample = {}, fallbackX = 0, fallbackY = 0) {
  if (Array.isArray(sample)) {
    const [x = fallbackX, y = fallbackY] = sample;
    return { x: Number(x), y: Number(y) };
  }
  if (sample && typeof sample === 'object') {
    return {
      x: Number.isFinite(Number(sample.x)) ? Number(sample.x) : fallbackX,
      y: Number.isFinite(Number(sample.y)) ? Number(sample.y) : fallbackY,
    };
  }
  return { x: fallbackX, y: fallbackY };
}

function normalizeGeometryPointList(geometry = {}) {
  const rawPoints = Array.isArray(geometry?.stroke)
    ? geometry.stroke
    : Array.isArray(geometry?.path)
      ? geometry.path
      : Array.isArray(geometry?.region?.points)
        ? geometry.region.points
        : [];
  return rawPoints
    .map((sample, index) => pointFromGeometrySample(sample, index, index))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function mapPointsToFieldCells(points = [], width = 7, height = 7) {
  const resolvedWidth = normalizeFieldDimension(width, 7);
  const resolvedHeight = normalizeFieldDimension(height, 7);
  if (!points.length) return [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;
  return points.map((point) => ({
    x: Math.max(0, Math.min(resolvedWidth - 1, Math.round(((point.x - minX) / xSpan) * (resolvedWidth - 1)))),
    y: Math.max(0, Math.min(resolvedHeight - 1, Math.round(((point.y - minY) / ySpan) * (resolvedHeight - 1)))),
  }));
}

function paintStrokeInfluence(values = [], points = [], activeValue = 0.9, secondaryValue = 0.62) {
  const cells = mapPointsToFieldCells(points, values?.[0]?.length || 7, values.length || 7);
  let affected = 0;
  cells.forEach((cell, index) => {
    const nextValue = index === cells.length - 1 ? activeValue : Math.max(secondaryValue, activeValue - (index * 0.02));
    const before = values?.[cell.y]?.[cell.x];
    paintFieldCell(values, cell.x, cell.y, nextValue);
    if (before !== values?.[cell.y]?.[cell.x]) affected += 1;
    paintFieldCell(values, cell.x - 1, cell.y, Math.max(secondaryValue - 0.08, 0.1));
    paintFieldCell(values, cell.x + 1, cell.y, Math.max(secondaryValue - 0.08, 0.1));
    paintFieldCell(values, cell.x, cell.y - 1, Math.max(secondaryValue - 0.08, 0.1));
    paintFieldCell(values, cell.x, cell.y + 1, Math.max(secondaryValue - 0.08, 0.1));
  });
  return { affectedCells: affected || cells.length };
}

function paintRegionInfluence(values = [], region = {}, activeValue = 0.88, secondaryValue = 0.66) {
  const width = values?.[0]?.length || 7;
  const height = values.length || 7;
  const bounds = region?.bounds && typeof region.bounds === 'object' ? region.bounds : {};
  const rawWidth = Number(bounds.width || bounds.w || region.width || 0);
  const rawHeight = Number(bounds.height || bounds.h || region.height || 0);
  const span = normalizeFieldDimension(Math.max(3, Math.round(Math.max(rawWidth, rawHeight, 3) / 8) + 2), 5);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const halfSpan = Math.floor(span / 2);
  let affected = 0;

  for (let y = centerY - halfSpan; y <= centerY + halfSpan; y += 1) {
    for (let x = centerX - halfSpan; x <= centerX + halfSpan; x += 1) {
      const isEdge = x === centerX - halfSpan || x === centerX + halfSpan || y === centerY - halfSpan || y === centerY + halfSpan;
      const nextValue = isEdge ? secondaryValue : activeValue;
      const before = values?.[y]?.[x];
      paintFieldCell(values, x, y, nextValue);
      if (before !== values?.[y]?.[x]) affected += 1;
    }
  }

  return { affectedCells: affected || (span * span) };
}

function buildIntentFieldReasoning({ kind, pointCount, affectedCells, confidence, status } = {}) {
  return [
    'field=build_desirability',
    `kind=${kind}`,
    `pointCount=${pointCount}`,
    `affectedCells=${affectedCells}`,
    `confidence=${Number(confidence).toFixed(2)}`,
    `status=${status}`,
  ];
}

function deriveSpatialIntentFieldInfluence(spatialIntent = {}) {
  const geometry = normalizeSpatialIntentGeometry(spatialIntent.geometry || {}, spatialIntent.geometry || {});
  const pointCount = countGeometryPoints(geometry);
  const sourceConfidence = Number(spatialIntent.confidence);
  const confidence = Number.isFinite(sourceConfidence) ? clamp01(sourceConfidence) : 0;
  const width = geometry.kind === 'stroke' ? normalizeFieldDimension(Math.max(5, Math.min(11, pointCount + 3)), 7) : 7;
  const height = width;
  const fallbackValue = 0.08;
  const baseValues = createFieldGrid(width, height, fallbackValue);
  const semanticMeaning = spatialIntent.semanticMeaning || {};
  const status = spatialIntent.status === 'degraded' || geometry.kind === 'unknown' ? 'degraded' : 'canonical';
  let affectedCells = 0;

  if (geometry.kind === 'stroke' && geometry.stroke) {
    const points = normalizeGeometryPointList(geometry);
    const paintResult = paintStrokeInfluence(baseValues, points.length ? points : [{ x: 0, y: 0 }, { x: 1, y: 1 }], 0.9, 0.62);
    affectedCells = paintResult.affectedCells;
  } else if (geometry.kind === 'region' && geometry.region) {
    const paintResult = paintRegionInfluence(baseValues, geometry.region, 0.88, 0.66);
    affectedCells = paintResult.affectedCells;
  }

  const baseLayer = cloneFieldLayer(baseValues, width, height, fallbackValue, 'build-desirability', 1);
  const coarseLayer = deriveCoarseFieldLayer(baseLayer, 2, 'build-desirability-coarse');
  const reasoning = buildIntentFieldReasoning({
    kind: geometry.kind,
    pointCount,
    affectedCells,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    status,
  });

  return {
    kind: 'intent-field-bundle',
    version: 'v1',
    fieldKey: 'buildDesirability',
    status,
    missingFields: [...new Set([
      ...(Array.isArray(spatialIntent.missingFields) ? spatialIntent.missingFields : []),
      ...(geometry.kind === 'unknown' ? ['geometry'] : []),
      ...(status === 'degraded' && !String(semanticMeaning.summary || semanticMeaning.statement || semanticMeaning.goal || '').trim() ? ['semanticMeaning'] : []),
    ])],
    sourceIntentId: spatialIntent.intentId || spatialIntent.id || null,
    sourceIntentStatus: spatialIntent.status || 'canonical',
    sourceIntentConfidence: Number.isFinite(confidence) ? Number(confidence.toFixed(2)) : 0,
    summary: `Build desirability ${describeFieldLayer(baseLayer)} | ${describeFieldLayer(coarseLayer)}`,
    field: {
      kind: 'intent-field',
      version: 'v1',
      fieldKey: 'buildDesirability',
      baseLayerKey: '0',
      coarseLayerKey: '1',
      layerOrder: ['0', '1'],
      aggregateStrategy: 'majority',
      layers: {
        0: baseLayer,
        1: coarseLayer,
      },
      baseLayer,
      coarseLayer,
      summary: `Build desirability ${describeFieldLayer(baseLayer)} | ${describeFieldLayer(coarseLayer)}`,
    },
    provenance: {
      ...(spatialIntent.provenance || {}),
      field: 'build_desirability',
      fieldKind: 'intent-field-bundle',
      interpreter: 'deterministic-geometry-v1',
      reasoning,
      usedFallback: false,
    },
  };
}

function interpretSpatialGeometry(geometryInput = {}, provenance = {}) {
  const geometry = normalizeSpatialIntentGeometry(geometryInput);
  const pointCount = countGeometryPoints(geometryInput);
  const regionPresent = geometry.kind === 'region' && Boolean(geometry.region);
  const strokePresent = geometry.kind === 'stroke' && Boolean(geometry.stroke);

  let semanticMeaning;
  let confidence;
  let status = 'canonical';

  if (geometry.kind === 'region') {
    semanticMeaning = {
      summary: 'Build pressure over the selected region.',
      statement: 'Build pressure over the selected region.',
      goal: 'Build pressure over the selected region.',
      requestType: 'build_pressure',
      requestedOutcomes: ['Build pressure over the selected region'],
      targets: ['selected region'],
      constraints: [],
      urgency: 'normal',
      labels: ['build', 'pressure', 'region'],
    };
    confidence = regionPresent ? 0.92 : 0.64;
    if (!regionPresent) {
      status = 'degraded';
    }
  } else if (geometry.kind === 'stroke') {
    semanticMeaning = {
      summary: 'Flow influence along the drawn stroke.',
      statement: 'Flow influence along the drawn stroke.',
      goal: 'Flow influence along the drawn stroke.',
      requestType: 'flow_influence',
      requestedOutcomes: ['Flow influence along the drawn stroke'],
      targets: ['drawn stroke'],
      constraints: [],
      urgency: 'normal',
      labels: ['flow', 'influence', 'stroke'],
    };
    confidence = strokePresent ? 0.88 : 0.61;
    if (!strokePresent) {
      status = 'degraded';
    }
  } else {
    semanticMeaning = {
      summary: 'Spatial intent is incomplete.',
      statement: 'Spatial intent is incomplete.',
      goal: 'Spatial intent is incomplete.',
      requestType: 'unresolved_spatial_intent',
      requestedOutcomes: ['Surface missing geometry before execution'],
      targets: [],
      constraints: ['geometry missing or unrecognized'],
      urgency: 'normal',
      labels: ['unresolved'],
    };
    confidence = 0.24;
    status = 'degraded';
  }

  const missingFields = [];
  if (geometry.kind === 'unknown') missingFields.push('geometry');
  if (!semanticMeaning?.summary) missingFields.push('semanticMeaning');
  if (!Number.isFinite(Number(confidence))) missingFields.push('confidence');
  if (status === 'degraded' && !missingFields.includes('semanticMeaning')) missingFields.push('semanticMeaning');

  const reasoning = buildSpatialGeometryReasoning({
    kind: geometry.kind,
    pointCount,
    regionPresent,
    strokePresent,
    confidence,
  });

  return {
    geometry,
    semanticMeaning,
    confidence: Number(clamp01(confidence).toFixed(2)),
    missingFields,
    status,
    provenance: {
      ...provenance,
      interpreter: 'deterministic-geometry-v1',
      reasoning,
      usedFallback: false,
    },
  };
}

function buildSpatialIntentSemanticMeaning({
  summary = '',
  goal = '',
  requestType = 'context_request',
  requestedOutcomes = [],
  targets = [],
  constraints = [],
  urgency = 'normal',
  labels = [],
} = {}) {
  return {
    summary: String(summary || '').trim(),
    statement: String(summary || goal || '').trim(),
    goal: String(goal || summary || '').trim(),
    requestType: String(requestType || 'context_request').trim() || 'context_request',
    requestedOutcomes: uniqueStrings(requestedOutcomes),
    targets: uniqueStrings(targets),
    constraints: uniqueStrings(constraints),
    urgency: normalizeIntentPriority(urgency),
    labels: uniqueStrings(labels),
  };
}

function buildSpatialIntentMissingFields(spatialIntent = {}) {
  const missingFields = [];
  if (!spatialIntent?.geometry || spatialIntent.geometry.kind === 'unknown') missingFields.push('geometry');
  const meaning = spatialIntent?.semanticMeaning || {};
  if (!String(meaning.summary || meaning.statement || meaning.goal || '').trim()) {
    missingFields.push('semanticMeaning');
  }
  if (!Number.isFinite(Number(spatialIntent?.confidence))) missingFields.push('confidence');
  return missingFields;
}

function buildCanonicalIntentContract({
  report = {},
  packet = {},
  sourceType = 'sanctioned-intent-parser',
  sourceRef = null,
  requestedBy = null,
  priority = null,
  timestamp = null,
  provenance = {},
  intentId = null,
} = {}) {
  const resolvedTimestamp = String(timestamp || report.createdAt || report.judgedAt || nowIso()).trim() || nowIso();
  const resolvedSourceType = String(sourceType || packet.sourceType || report.source || 'sanctioned-intent-parser').trim() || 'sanctioned-intent-parser';
  const resolvedSourceRef = String(sourceRef || packet.sourceRef || report.nodeId || report.sourceNodeId || report.projectContext?.currentFocus || 'unknown').trim() || 'unknown';
  const resolvedRequestedBy = String(requestedBy || packet.requestedBy || report.requestedBy || report.agent?.id || 'context-manager').trim() || 'context-manager';
  const resolvedPriority = normalizeIntentPriority(priority || packet.priority || packet.urgency || report.priority || report.urgency);
  const requestedOutcomes = uniqueStrings([
    ...(Array.isArray(packet.requestedOutcomes) ? packet.requestedOutcomes : []),
    ...(Array.isArray(packet.tasks) ? packet.tasks : []),
    ...(Array.isArray(report.requestedOutcomes) ? report.requestedOutcomes : []),
    ...(Array.isArray(report.tasks) ? report.tasks : []),
  ]).slice(0, 6);
  const targets = uniqueStrings([
    ...(Array.isArray(packet.targets) ? packet.targets : []),
    ...(Array.isArray(report.targets) ? report.targets : []),
  ]).slice(0, 8);
  const constraints = uniqueStrings([
    ...(Array.isArray(packet.constraints) ? packet.constraints : []),
    ...(Array.isArray(report.constraints) ? report.constraints : []),
  ]).slice(0, 8);
  const anchorRefs = uniqueStrings([
    ...(Array.isArray(report.anchorRefs) ? report.anchorRefs : []),
    ...(Array.isArray(report.projectContext?.anchorRefs) ? report.projectContext.anchorRefs : []),
    ...(Array.isArray(packet.anchorRefs) ? packet.anchorRefs : []),
  ]).slice(0, 8);
  const contractId = String(intentId || packet.intentId || report.intentId || `intent_${resolvedSourceType}_${resolvedSourceRef}_${resolvedTimestamp}`).trim() || `intent_${resolvedSourceType}_${resolvedSourceRef}_${resolvedTimestamp}`;
  const geometry = normalizeSpatialIntentGeometry(
    packet.geometry || report.geometry || packet.region || report.region || packet.stroke || report.stroke || {},
    {
      kind: packet.geometry?.kind || report.geometry?.kind || packet.geometry?.type || report.geometry?.type || null,
      type: packet.geometry?.type || report.geometry?.type || null,
      region: packet.region || report.region || null,
      bounds: packet.bounds || report.bounds || null,
      stroke: packet.stroke || report.stroke || null,
      path: packet.path || report.path || null,
    },
  );
  const hasMeaning = Boolean(String(report.summary || report.statement || report.goal || packet.summary || packet.statement || packet.goal || '').trim())
    || requestedOutcomes.length > 0
    || targets.length > 0
    || constraints.length > 0
    || uniqueStrings(report.labels || packet.labels || []).length > 0;
  const geometryInterpretation = !hasMeaning && geometry.kind !== 'unknown'
    ? interpretSpatialGeometry(geometry, {
        sourceType: resolvedSourceType,
        sourceRef: resolvedSourceRef,
        requestedBy: resolvedRequestedBy,
      })
    : null;
  const semanticMeaning = hasMeaning
    ? buildSpatialIntentSemanticMeaning({
        summary: String(report.statement || report.summary || packet.statement || packet.summary || '').trim(),
        goal: String(report.goal || packet.goal || report.statement || report.summary || '').trim(),
        requestType: String(report.requestType || packet.requestType || 'context_request').trim() || 'context_request',
        requestedOutcomes,
        targets,
        constraints,
        urgency: resolvedPriority,
        labels: uniqueStrings(report.labels || packet.labels || []),
      })
    : geometryInterpretation.semanticMeaning;
  const confidenceSource = [report.confidence, packet.confidence, geometryInterpretation?.confidence]
    .find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  const normalizedConfidence = Number(clamp01(Number(confidenceSource || 0)).toFixed(2));
  const mergedProvenance = {
    ...provenance,
    anchorRefs,
    sourceType: resolvedSourceType,
    sourceRef: resolvedSourceRef,
    requestedBy: resolvedRequestedBy,
    usedFallback: Boolean(report?.provenance?.usedFallback || packet?.provenance?.usedFallback || provenance.usedFallback || geometryInterpretation?.provenance?.usedFallback),
    backend: report?.provenance?.backend || packet?.provenance?.backend || provenance.backend || null,
    model: report?.provenance?.model || packet?.provenance?.model || provenance.model || null,
    runId: report?.provenance?.runId || packet?.provenance?.runId || provenance.runId || null,
    inferenceMode: report?.provenance?.inferenceMode || packet?.provenance?.inferenceMode || provenance.inferenceMode || geometryInterpretation?.provenance?.interpreter || null,
    interpreter: geometryInterpretation?.provenance?.interpreter || provenance.interpreter || null,
    reasoning: geometryInterpretation?.provenance?.reasoning || provenance.reasoning || [],
  };
  const canonicalIntent = {
    id: contractId,
    source: {
      type: resolvedSourceType,
      ref: resolvedSourceRef,
      requestedBy: resolvedRequestedBy,
    },
    geometry,
    semanticMeaning,
    confidence: normalizedConfidence,
    createdAt: resolvedTimestamp,
    provenance: mergedProvenance,
    missingFields: buildSpatialIntentMissingFields({
      geometry,
      semanticMeaning,
      confidence: normalizedConfidence,
    }),
    status: geometryInterpretation?.status || 'canonical',
    // Compatibility aliases remain read-only and derived from the canonical fields.
    summary: semanticMeaning.summary,
    statement: semanticMeaning.statement,
    goal: semanticMeaning.goal,
    requestType: semanticMeaning.requestType,
    requestedOutcomes: semanticMeaning.requestedOutcomes,
    tasks: semanticMeaning.requestedOutcomes,
    targets: semanticMeaning.targets,
    constraints: semanticMeaning.constraints,
    projectContext: {
      currentFocus: resolvedSourceRef,
      matchedTerms: semanticMeaning.labels,
      blockers: semanticMeaning.constraints,
      anchorRefs,
    },
    priority: resolvedPriority,
    requestedBy: resolvedRequestedBy,
    timestamp: resolvedTimestamp,
    sourceType: resolvedSourceType,
    sourceRef: resolvedSourceRef,
    nodeId: provenance.sourceNodeId || resolvedSourceRef,
    anchorRefs,
    intentId: contractId,
  };
  const fieldInfluence = deriveSpatialIntentFieldInfluence(canonicalIntent);
  canonicalIntent.fieldInfluence = fieldInfluence;
  return {
    intentId: contractId,
    sourceType: resolvedSourceType,
    sourceRef: resolvedSourceRef,
    canonicalIntent,
    spatialIntent: canonicalIntent,
    fieldInfluence,
    provenance: canonicalIntent.provenance,
    constraints,
    priority: resolvedPriority,
    requestedBy: resolvedRequestedBy,
    timestamp: resolvedTimestamp,
    confidence: canonicalIntent.confidence,
    geometry: canonicalIntent.geometry,
    semanticMeaning: canonicalIntent.semanticMeaning,
    missingFields: canonicalIntent.missingFields,
  };
}

function tokenizeIntentText(text) {
  return [...new Set((String(text || '').toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || []).filter((token) => !INTENT_STOPWORDS.has(token)))];
}

function topKeywords(text, limit = 24) {
  const counts = new Map();
  for (const token of tokenizeIntentText(text)) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([token]) => token);
}

function inferIntentLabels(text) {
  const value = String(text || '').toLowerCase();
  const labels = [];
  if (/context|brief|constraint|intent|memory/.test(value)) labels.push('context');
  if (/plan|task|roadmap|sequence|todo|queue|desk|agent|workflow|kanban|board/.test(value)) labels.push('plan');
  if (/build|fix|implement|patch|wire|connect|ship|code|module|service|deploy|restart|compile|test/.test(value)) labels.push('execution');
  if (/ui|ux|canvas|studio|node|overlay|panel/.test(value)) labels.push('ux');
  if (/review|guardrail|architect|rule|boundary|ace|approval|permission|orchestrator/.test(value)) labels.push('governance');
  return labels.length ? labels : ['general'];
}

function inferIntentRole(text, labels) {
  const value = String(text || '').toLowerCase();
  if (/rule|constraint|must|never|guardrail|approval|permission/.test(value)) return 'constraint';
  if (/desk|agent|api|service|module|architecture|system|orchestrator|planner|executor|studio/.test(value)) return 'module';
  if (/file|patch|fix|implement|build|wire|deploy|restart|compile/.test(value) || labels.includes('execution')) return 'task';
  if (/ux|ui|screen|flow|overlay|panel/.test(value)) return 'ux';
  return 'thought';
}

function inferRequestType(classification = {}, labels = [], source = '') {
  const role = String(classification?.role || '').trim().toLowerCase();
  if (role === 'task') return 'execution_request';
  if (role === 'module') return 'architecture_request';
  if (role === 'constraint') return 'constraint_request';
  if (labels.includes('plan') || /\b(plan|task|roadmap|sequence|queue)\b/i.test(source)) return 'planning_request';
  if (/ui|ux|screen|flow|overlay|panel/i.test(source)) return 'ui_request';
  if (/build|fix|implement|wire|connect|deploy|restart|compile|test/i.test(source) || labels.includes('execution')) return 'execution_request';
  return 'context_request';
}

function inferUrgency(source, scores = {}, requestedOutcomes = []) {
  const value = String(source || '').toLowerCase();
  if (/\b(urgent|asap|now|blocker|blocked|critical|immediately|today)\b/.test(value)) return 'high';
  if (Number(scores?.executionReadiness || 0) < 0.25) return 'high';
  if (requestedOutcomes.length > 2) return 'medium';
  return 'normal';
}

function buildIntentTargets(projectContext = {}, requestedOutcomes = [], source = '') {
  const targets = uniqueStrings([
    ...(Array.isArray(projectContext?.matchedTerms) ? projectContext.matchedTerms : []),
    ...(Array.isArray(projectContext?.referenceKeywords) ? projectContext.referenceKeywords : []),
    ...(Array.isArray(projectContext?.anchorRefs) ? projectContext.anchorRefs : []),
    ...(String(projectContext?.currentFocus || '').trim() ? [projectContext.currentFocus] : []),
    ...requestedOutcomes,
  ]).slice(0, 8);
  if (targets.length) return targets;
  return tokenizeIntentText(source).slice(0, 8);
}

function buildIntentSignals({
  source,
  criteria = [],
  scores = {},
  projectContext = {},
  labels = [],
  classification = {},
  requestedOutcomes = [],
}) {
  return {
    actionSignals: countMatches(source, CURRENT_ACTION_PATTERN),
    constraintSignals: countMatches(source, CONSTRAINT_PATTERN),
    architectureSignals: countMatches(source, ARCHITECTURE_PATTERN),
    executionSignals: countMatches(source, EXECUTION_HINT_PATTERN),
    featureSignals: countMatches(source, FEATURE_REQUEST_PATTERN),
    matchedProjectTerms: Array.isArray(projectContext?.matchedTerms) ? projectContext.matchedTerms.length : 0,
    anchorRefs: Array.isArray(projectContext?.anchorRefs) ? projectContext.anchorRefs.length : 0,
    lowConfidenceCriteria: (criteria || []).filter((criterion) => Number(criterion.score || 0) < 0.55).length,
    plannerUsefulness: Number(scores?.plannerUsefulness || 0),
    executionReadiness: Number(scores?.executionReadiness || 0),
    deployReadiness: Number(scores?.deployReadiness || 0),
    labels: uniqueStrings(labels).slice(0, 4),
    role: classification?.role || 'thought',
    requestedOutcomeCount: uniqueStrings(requestedOutcomes).length,
  };
}

function buildIntentConstraints(criteria = [], projectContext = {}, source = '', requestedOutcomes = []) {
  return uniqueStrings([
    ...(Array.isArray(projectContext?.blockers) ? projectContext.blockers : []),
    ...(criteria || [])
      .filter((criterion) => Number(criterion.score || 0) < 0.55)
      .map((criterion) => `${criterion.label}: ${criterion.reason || 'Needs clarification.'}`),
    !requestedOutcomes.length ? 'No concrete requested outcomes were extracted yet.' : '',
    /\b(blocker|blocked|guardrail|approval|permission|review)\b/i.test(source) ? 'Request includes a constraint or review gate.' : '',
  ]).slice(0, 8);
}

function buildIntentTasksFromPattern(text, pattern) {
  const fragments = String(text || '')
    .split(/[\n,.!?;:]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const actionFirst = fragments.filter((entry) => pattern.test(entry));
  pattern.lastIndex = 0;
  const chosen = [...actionFirst, ...fragments].slice(0, 4);
  return chosen.length ? chosen : ['analyze requirements', 'decompose tasks', 'prepare implementation plan'];
}

function buildIntentTasks(text) {
  return buildIntentTasksFromPattern(text, CURRENT_ACTION_PATTERN);
}

function buildLegacyIntentTasks(text) {
  return buildIntentTasksFromPattern(text, LEGACY_ACTION_PATTERN);
}

function buildWeightedKeywordCounts(anchorBundle, contextNode) {
  const counts = new Map();
  const canonicalSeeds = new Map();
  Object.values(anchorBundle?.anchors || {}).forEach((anchor) => {
    const intentWeight = resolveAnchorIntentWeight(anchor);
    const seededKeywords = [];
    (anchor?.keywords || []).forEach((token) => {
      counts.set(token, (counts.get(token) || 0) + intentWeight);
      if (seededKeywords.length < 3) seededKeywords.push(token);
    });
    if (anchor?.authority === 'canonical-anchor' && seededKeywords.length > 0) {
      canonicalSeeds.set(anchor.id, seededKeywords);
    }
  });
  tokenizeKeywordSource(contextNode?.content || '').forEach((token) => {
    counts.set(token, (counts.get(token) || 0) + 4);
  });
  return { counts, canonicalSeeds };
}

function buildBalancedProjectKeywords({ counts, canonicalSeeds }, limit = 28) {
  const prioritized = [];
  (canonicalSeeds instanceof Map ? [...canonicalSeeds.values()] : []).forEach((tokens) => {
    tokens.forEach((token) => {
      if (!prioritized.includes(token)) prioritized.push(token);
    });
  });
  const weighted = topKeywordsFromCounts(counts, limit * 2);
  const merged = [...prioritized, ...weighted];
  return [...new Set(merged)].slice(0, limit);
}

function buildAnchorCatalog(anchorBundle) {
  return Object.values(anchorBundle?.anchors || {})
    .filter((anchor) => anchor?.exists)
    .map((anchor) => ({
      id: anchor.id,
      relativePath: anchor.relativePath,
      sourceRelativePath: anchor.sourceRelativePath,
      source: anchor.source,
      weight: anchor.weight,
      intentWeight: resolveAnchorIntentWeight(anchor),
      authority: anchor.authority || 'canonical-anchor',
      keywords: (anchor.keywords || []).slice(0, 24),
    }));
}

function buildIntentProjectContext({
  workspace = {},
  readDashboardFile = null,
  rootPath = null,
  domainKey = DEFAULT_DOMAIN_KEY,
}) {
  const anchorBundle = buildAnchorBundle({
    rootPath,
    domainKey,
    readEntry: readDashboardFile,
  });
  const graphs = normalizeGraphBundle(workspace);
  const contextNode = getContextManagerNode(graphs);
  const weightedKeywords = buildWeightedKeywordCounts(anchorBundle, contextNode);
  const managerSummary = anchorBundle.managerSummary || {};
  const graphMutationsPreview = buildGraphMutationPreview({
    graphBundle: graphs,
    projectContext: {
      currentFocus: managerSummary.current_focus || '',
      activeMilestone: managerSummary.active_milestone || '',
      anchorRefs: anchorBundle.anchorRefs || [],
    },
    source: managerSummary.current_focus || managerSummary.active_milestone || '',
  });
  const graphMutationApplyResult = applyGraphMutations(graphs, graphMutationsPreview);
  return {
    domainKey,
    brainRoot: anchorBundle.brainRoot,
    currentFocus: managerSummary.current_focus || '',
    activeMilestone: managerSummary.active_milestone || '',
    blockers: managerSummary.blockers || [],
    graphBundle: graphs,
    graphMutationsPreview,
    graphMutationApplyResult,
    keywords: buildBalancedProjectKeywords(weightedKeywords, 28),
    sourcesRead: [
      ...anchorBundle.truthSources.filter((source) => source.exists).map((source) => source.relativePath),
      ...(contextNode ? ['workspace.graph.context-manager-node'] : []),
    ],
    anchorRefs: anchorBundle.anchorRefs || [],
    anchorCatalog: buildAnchorCatalog(anchorBundle),
    truthSources: anchorBundle.truthSources || [],
    drift: anchorBundle.drift || [],
    managerSummary,
  };
}

function buildAnchorMatches(tokens = [], project = {}) {
  const tokenSet = new Set(tokens || []);
  const catalog = Array.isArray(project.anchorCatalog) ? project.anchorCatalog : [];
  const matches = catalog
    .map((anchor) => {
      const matchedTerms = (anchor.keywords || []).filter((token) => tokenSet.has(token)).slice(0, 8);
      const intentWeight = Number(anchor.intentWeight || anchor.weight || 1);
      const canonicalBonus = anchor.authority === 'canonical-anchor' ? 1 : 0;
      return {
        anchorRef: anchor.relativePath,
        sourceRef: anchor.sourceRelativePath,
        source: anchor.source,
        weight: anchor.weight,
        intentWeight,
        matchedTerms,
        score: matchedTerms.length ? Number((matchedTerms.length * intentWeight + canonicalBonus).toFixed(2)) : 0,
      };
    })
    .filter((entry) => entry.matchedTerms.length > 0)
    .sort((left, right) => right.score - left.score || right.matchedTerms.length - left.matchedTerms.length || right.intentWeight - left.intentWeight);
  return matches;
}

function buildLegacyCriteria({ source, project, labels, tokens, sentences, matchedTerms }) {
  const actionMatches = countMatches(source, LEGACY_ACTION_PATTERN);
  const constraintMatches = countMatches(source, CONSTRAINT_PATTERN);
  const architectureMatches = countMatches(source, ARCHITECTURE_PATTERN);
  const legacyTasks = buildLegacyIntentTasks(source);
  return [
    {
      id: 'project-alignment',
      label: 'Project alignment',
      score: clamp01((matchedTerms.length + ((project.currentFocus && source.toLowerCase().includes(String(project.currentFocus).toLowerCase())) ? 2 : 0)) / 6),
      reason: matchedTerms.length ? `Matched project terms: ${matchedTerms.slice(0, 5).join(', ')}` : 'Few direct overlaps with current project context.',
    },
    {
      id: 'actionability',
      label: 'Actionability',
      score: clamp01((actionMatches + legacyTasks.length) / 6),
      reason: actionMatches ? `Detected ${actionMatches} implementation/planning verb signals.` : 'Input reads more like a note than a concrete action.',
    },
    {
      id: 'architecture-fit',
      label: 'Architecture fit',
      score: clamp01((architectureMatches + labels.length) / 7),
      reason: architectureMatches ? 'References ACE system structure, agents, or implementation surfaces.' : 'Little direct architecture language found.',
    },
    {
      id: 'constraint-coverage',
      label: 'Constraint coverage',
      score: clamp01((constraintMatches + (project.blockers.length ? 1 : 0)) / 5),
      reason: constraintMatches ? 'Includes guardrails, blockers, or review-oriented language.' : 'No clear constraints or review gates were stated.',
    },
    {
      id: 'clarity',
      label: 'Clarity',
      score: clamp01((Math.min(tokens.length, 14) / 14 + Math.min(sentences.length, 3) / 3) / 2),
      reason: tokens.length >= 6 ? 'Input includes enough detail to classify intent reliably.' : 'Short input limits confidence.',
    },
  ];
}

function buildCurrentCriteria({ source, project, labels, tokens, sentences, matchedTerms, tasks }) {
  const actionMatches = countMatches(source, CURRENT_ACTION_PATTERN);
  const featureRequestSignals = countMatches(source, FEATURE_REQUEST_PATTERN);
  const executionHints = countMatches(source, EXECUTION_HINT_PATTERN);
  const constraintMatches = countMatches(source, CONSTRAINT_PATTERN);
  const architectureMatches = countMatches(source, ARCHITECTURE_PATTERN);
  const currentFocusMatch = project.currentFocus && source.toLowerCase().includes(String(project.currentFocus).toLowerCase());
  return [
    {
      id: 'project-alignment',
      label: 'Project alignment',
      score: clamp01((matchedTerms.length + (currentFocusMatch ? 2 : 0) + (labels.includes('plan') ? 1 : 0)) / 7),
      reason: matchedTerms.length ? `Matched project terms: ${matchedTerms.slice(0, 5).join(', ')}` : 'Few direct overlaps with current project context.',
    },
    {
      id: 'actionability',
      label: 'Actionability',
      score: clamp01((actionMatches + featureRequestSignals * 2 + Math.min(tasks.length, 3) + executionHints) / 8),
      reason: featureRequestSignals
        ? 'Feature-request phrasing reads like actionable planning work.'
        : actionMatches
          ? `Detected ${actionMatches} implementation/planning verb signals.`
          : 'Input still reads more like a note than a concrete action.',
    },
    {
      id: 'architecture-fit',
      label: 'Architecture fit',
      score: clamp01((architectureMatches + labels.length + (/\bqa\b/i.test(source) ? 1 : 0)) / 9),
      reason: architectureMatches ? 'References ACE desks, agents, architecture surfaces, or orchestration flow.' : 'Little direct architecture language found.',
    },
    {
      id: 'constraint-coverage',
      label: 'Constraint coverage',
      score: clamp01((constraintMatches + (project.blockers.length ? 1 : 0) + (/\breview|approval|guardrail|deploy\b/i.test(source) ? 1 : 0)) / 6),
      reason: constraintMatches ? 'Includes guardrails, blockers, or review-oriented language.' : 'No clear constraints or review gates were stated.',
    },
    {
      id: 'clarity',
      label: 'Clarity',
      score: clamp01((Math.min(tokens.length, 18) / 18 + Math.min(sentences.length, 3) / 3 + Math.min(tasks.length, 3) / 3) / 3),
      reason: tokens.length >= 6 ? 'Input includes enough detail to classify intent reliably.' : 'Short input limits confidence.',
    },
  ];
}

function buildIntentReadinessScores({ confidence, criteria, tasks, source, labels, projectContext, classification }) {
  const criterionMap = Object.fromEntries((criteria || []).map((criterion) => [criterion.id, Number(criterion.score || 0)]));
  const taskCount = Math.min((tasks || []).length, 3);
  const featureSignals = countMatches(source, FEATURE_REQUEST_PATTERN);
  const executionHints = countMatches(source, EXECUTION_HINT_PATTERN);
  const reviewSignals = countMatches(source, /\b(review|approval|deploy|permission)\b/gi);
  const matchedTerms = Math.min((projectContext?.matchedTerms || []).length, 3);
  return {
    intentConfidence: Number(confidence.toFixed(2)),
    executionReadiness: Number(clamp01((
      (criterionMap.actionability || 0)
      + (criterionMap.clarity || 0)
      + Math.min(taskCount / 3, 1)
      + Math.min(executionHints / 2, 1)
    ) / 4).toFixed(2)),
    plannerUsefulness: Number(clamp01((
      (criterionMap['project-alignment'] || 0)
      + (criterionMap['architecture-fit'] || 0)
      + (criterionMap.clarity || 0)
      + Math.min((taskCount + featureSignals + matchedTerms) / 5, 1)
    ) / 4).toFixed(2)),
    deployReadiness: Number(clamp01((
      (criterionMap.actionability || 0)
      + (criterionMap['constraint-coverage'] || 0)
      + Math.min(executionHints / 2, 1)
      + (reviewSignals ? 0.25 : 0)
      + (classification?.role === 'task' ? 0.25 : 0)
    ) / 4.5).toFixed(2)),
  };
}

function buildIntentTruth({
  source,
  summary,
  requestedOutcomes = [],
  tasks = [],
  criteria,
  classification,
  projectContext,
  scores,
}) {
  const requestedOutcomesList = uniqueStrings(requestedOutcomes.length ? requestedOutcomes : tasks).slice(0, 4);
  const anchorRefs = Array.isArray(projectContext?.anchorRefs) ? projectContext.anchorRefs.slice(0, 8) : [];
  const goal = String(summary || requestedOutcomesList[0] || source || 'Intent capture is empty.').trim();
  const requestType = inferRequestType(classification, classification?.labels || [], source);
  const urgency = inferUrgency(source, scores, requestedOutcomesList);
  const targets = buildIntentTargets(projectContext || {}, requestedOutcomesList, source);
  const constraints = buildIntentConstraints(criteria || [], projectContext || {}, source, requestedOutcomesList);
  const signals = buildIntentSignals({
    source,
    criteria,
    scores,
    projectContext,
    labels: classification?.labels || [],
    classification,
    requestedOutcomes: requestedOutcomesList,
  });
  const unresolved = (criteria || [])
    .filter((criterion) => Number(criterion.score || 0) < 0.55)
    .map((criterion) => `${criterion.label}: ${criterion.reason || 'Needs clarification.'}`);
  if (!requestedOutcomesList.length) unresolved.push('No concrete requested outcomes were extracted yet.');
  if (!(projectContext?.matchedTerms || []).length) unresolved.push('Project alignment is weak, so the request may still need anchoring to current ACE work.');
  const evidence = (criteria || [])
    .slice()
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, 3)
    .map((criterion) => `${criterion.label}: ${criterion.reason || `${Math.round((criterion.score || 0) * 100)}%`}`);
  const intentType = classification?.role === 'module'
    ? 'ACE architecture / capability request'
    : classification?.role === 'task'
      ? 'Direct implementation request'
      : classification?.role === 'constraint'
        ? 'Constraint / guardrail request'
        : 'General context signal';
  return {
    rawSource: source,
    rawInput: source,
    statement: goal,
    goal,
    intentType,
    requestType,
    requestedOutcomes: requestedOutcomesList,
    tasks: requestedOutcomesList,
    targets,
    constraints,
    urgency,
    signals,
    unresolved,
    evidence,
    anchorRefs,
    plannerBrief: requestedOutcomesList.length
      ? `Planner should treat this as: ${requestedOutcomesList.join('; ')}`
      : 'Planner should clarify the request before expanding execution.',
    readiness: {
      intentConfidence: Number(scores?.intentConfidence || 0),
      plannerUsefulness: Number(scores?.plannerUsefulness || 0),
      executionReadiness: Number(scores?.executionReadiness || 0),
      deployReadiness: Number(scores?.deployReadiness || 0),
    },
  };
}

function analyzeSpatialIntent(text, project, intentMeta = {}) {
  const source = String(text || '').trim();
  const safeProject = project || {
    currentFocus: '',
    blockers: [],
    keywords: [],
    sourcesRead: [],
    anchorRefs: [],
    graphMutationsPreview: [],
    graphMutationApplyResult: {
      graphBundle: {
        system: { nodes: [], edges: [] },
        world: { nodes: [], edges: [] },
      },
      applied: [],
      rejected: [],
    },
    anchorCatalog: [],
    truthSources: [],
    drift: [],
    managerSummary: null,
  };
  const labels = inferIntentLabels(source);
  const role = inferIntentRole(source, labels);
  const tokens = tokenizeIntentText(source);
  const projectTerms = new Set(safeProject.keywords || []);
  const matchedTerms = tokens.filter((token) => projectTerms.has(token));
  const anchorMatches = buildAnchorMatches(tokens, safeProject);
  const anchorRefs = anchorMatches.length
    ? anchorMatches.map((entry) => entry.anchorRef)
    : (safeProject.anchorRefs || []).slice(0, 8);
  const sentences = source.split(/[.!?\n]+/).map((entry) => entry.trim()).filter(Boolean);
  const tasks = buildIntentTasks(source);
  const legacyCriteria = buildLegacyCriteria({
    source,
    project: safeProject,
    labels,
    tokens,
    sentences,
    matchedTerms,
  });
  const criteria = buildCurrentCriteria({
    source,
    project: safeProject,
    labels,
    tokens,
    sentences,
    matchedTerms,
    tasks,
  });
  const legacyConfidence = averageScores(legacyCriteria);
  const confidence = averageScores(criteria);
  const summary = source.length > 140 ? `${source.slice(0, 137).trim()}...` : (source || 'Intent capture is empty.');
  const requestedOutcomes = buildIntentTasks(source);
  const scores = buildIntentReadinessScores({
    confidence,
    criteria,
    tasks: requestedOutcomes,
    source,
    labels,
    projectContext: {
      ...safeProject,
      matchedTerms,
    },
    classification: { role, labels },
  });
  const truth = buildIntentTruth({
    source,
    summary,
    requestedOutcomes,
    criteria,
    classification: { role, labels },
    projectContext: {
      ...safeProject,
      matchedTerms,
    },
    scores,
  });
  const intentContract = buildCanonicalIntentContract({
    report: {
      ...truth,
      summary,
      requestedOutcomes,
      tasks: requestedOutcomes,
      targets: truth.targets,
      constraints: truth.constraints,
      urgency: truth.urgency,
      requestType: truth.requestType,
      anchorRefs,
      nodeId: safeProject?.sourceNodeId || intentMeta.sourceRef || null,
      requestedBy: intentMeta.requestedBy || 'context-manager',
      priority: intentMeta.priority || truth.urgency || 'normal',
      source: intentMeta.sourceType || 'sanctioned-intent-parser',
    },
    packet: {
      summary,
      statement: truth.goal,
      goal: truth.goal,
      requestedOutcomes,
      tasks: requestedOutcomes,
      targets: truth.targets,
      constraints: truth.constraints,
      urgency: truth.urgency,
      requestType: truth.requestType,
      requestedBy: intentMeta.requestedBy || 'context-manager',
      sourceType: intentMeta.sourceType || 'sanctioned-intent-parser',
      sourceRef: intentMeta.sourceRef || safeProject?.sourceNodeId || null,
      priority: intentMeta.priority || truth.urgency || 'normal',
      anchorRefs,
    },
    sourceType: intentMeta.sourceType || 'sanctioned-intent-parser',
    sourceRef: intentMeta.sourceRef || safeProject?.sourceNodeId || null,
    requestedBy: intentMeta.requestedBy || 'context-manager',
    priority: intentMeta.priority || truth.urgency || 'normal',
    timestamp: intentMeta.timestamp || nowIso(),
    provenance: {
      anchors: anchorMatches,
      managerSummary: safeProject.managerSummary || null,
      sourceNodeId: safeProject?.sourceNodeId || intentMeta.sourceRef || null,
    },
    intentId: intentMeta.intentId || null,
  });
  return {
    agent: {
      id: 'context-manager',
      name: 'Context Manager',
      criteriaVersion: 'ace-intent-v2',
      legacyCriteriaVersion: 'ace-intent-v1',
      remit: 'Judge incoming notes against ACE project context and surface confidence-scored intent for the frontend.',
    },
    summary,
    confidence,
    legacyConfidence,
    criteria,
    legacyCriteria,
    scores,
    truth,
    intentContract,
    canonicalIntent: intentContract.canonicalIntent,
    goal: truth.goal,
    targets: truth.targets,
    constraints: truth.constraints,
    urgency: truth.urgency,
    requestType: truth.requestType,
    requestedOutcomes,
    tasks: requestedOutcomes,
    signals: truth.signals,
    anchorRefs,
    provenance: {
      anchors: anchorMatches,
      managerSummary: safeProject.managerSummary || null,
    },
    classification: {
      role,
      labels,
    },
    metrics: {
      tokenCount: tokens.length,
      sentenceCount: sentences.length,
      matchedProjectTerms: matchedTerms,
      actionSignals: countMatches(source, CURRENT_ACTION_PATTERN),
      featureRequestSignals: countMatches(source, FEATURE_REQUEST_PATTERN),
      architectureSignals: countMatches(source, ARCHITECTURE_PATTERN),
      constraintSignals: countMatches(source, CONSTRAINT_PATTERN),
      executionSignals: countMatches(source, EXECUTION_HINT_PATTERN),
    },
    projectContext: {
      domainKey: safeProject.domainKey || DEFAULT_DOMAIN_KEY,
      brainRoot: safeProject.brainRoot || '',
      currentFocus: safeProject.currentFocus,
      activeMilestone: safeProject.activeMilestone || '',
      blockers: safeProject.blockers.slice(0, 3),
      matchedTerms: matchedTerms.slice(0, 8),
      referenceKeywords: (safeProject.keywords || []).slice(0, 8),
      sourcesRead: (safeProject.sourcesRead || []).slice(0, 8),
      anchorRefs,
      graphMutationsPreview: Array.isArray(safeProject.graphMutationsPreview) ? safeProject.graphMutationsPreview : [],
      graphMutationApplyResult: safeProject.graphMutationApplyResult || {
        graphBundle: {
          system: { nodes: [], edges: [] },
          world: { nodes: [], edges: [] },
        },
        applied: [],
        rejected: [],
      },
      truthSources: (safeProject.truthSources || []).slice(0, 8),
      drift: (safeProject.drift || []).slice(0, 8),
      managerSummary: safeProject.managerSummary || null,
    },
    judgedAt: nowIso(),
  };
}

module.exports = {
  buildCanonicalIntentContract,
  buildIntentProjectContext,
  buildIntentTasks,
  buildIntentTruth,
  deriveSpatialIntentFieldInfluence,
  interpretSpatialGeometry,
  inferIntentLabels,
  inferIntentRole,
  tokenizeIntentText,
  topKeywords,
  analyzeSpatialIntent,
};
