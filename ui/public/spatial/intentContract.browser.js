function normalizeText(value = '') {
  return String(value || '').trim();
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean))];
}

function normalizeIntentPriority(value = '') {
  const normalized = normalizeText(value).toLowerCase();
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
  const kind = normalizeText(
    geometry.kind
    || geometry.type
    || fallback.kind
    || fallback.type
    || (stroke ? 'stroke' : region ? 'region' : 'unknown'),
  ).toLowerCase() || 'unknown';
  return {
    kind,
    region: region || null,
    stroke: stroke || null,
  };
}

function buildSemanticMeaning(report = {}, packet = {}, priority = 'normal') {
  const summary = normalizeText(report.summary || report.statement || packet.summary || packet.statement || '');
  const statement = normalizeText(report.statement || packet.statement || summary);
  const goal = normalizeText(report.goal || packet.goal || statement || summary);
  return {
    summary,
    statement: statement || goal || summary,
    goal: goal || statement || summary,
    requestType: normalizeText(report.requestType || packet.requestType || 'context_request') || 'context_request',
    requestedOutcomes: uniqueStrings([
      ...(Array.isArray(report.requestedOutcomes) ? report.requestedOutcomes : []),
      ...(Array.isArray(report.tasks) ? report.tasks : []),
      ...(Array.isArray(packet.requestedOutcomes) ? packet.requestedOutcomes : []),
      ...(Array.isArray(packet.tasks) ? packet.tasks : []),
    ]).slice(0, 6),
    targets: uniqueStrings([
      ...(Array.isArray(report.targets) ? report.targets : []),
      ...(Array.isArray(packet.targets) ? packet.targets : []),
    ]).slice(0, 8),
    constraints: uniqueStrings([
      ...(Array.isArray(report.constraints) ? report.constraints : []),
      ...(Array.isArray(packet.constraints) ? packet.constraints : []),
    ]).slice(0, 8),
    urgency: priority,
    labels: uniqueStrings([
      ...(Array.isArray(report.labels) ? report.labels : []),
      ...(Array.isArray(packet.labels) ? packet.labels : []),
    ]).slice(0, 8),
  };
}

function buildMissingFields(record = {}) {
  const missing = [];
  if (!record.geometry || record.geometry.kind === 'unknown') missing.push('geometry');
  if (!normalizeText(record.semanticMeaning?.summary || record.semanticMeaning?.statement || record.semanticMeaning?.goal || '')) {
    missing.push('semanticMeaning');
  }
  if (!Number.isFinite(record.confidence)) missing.push('confidence');
  return missing;
}

export function buildCanonicalIntentContract({
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
  const resolvedTimestamp = normalizeText(timestamp || report.createdAt || report.judgedAt || new Date().toISOString()) || new Date().toISOString();
  const resolvedSourceType = normalizeText(sourceType || packet.sourceType || report.source || 'sanctioned-intent-parser') || 'sanctioned-intent-parser';
  const resolvedSourceRef = normalizeText(sourceRef || packet.sourceRef || report.nodeId || report.sourceNodeId || `browser_${resolvedTimestamp}`) || `browser_${resolvedTimestamp}`;
  const resolvedRequestedBy = normalizeText(requestedBy || packet.requestedBy || report.requestedBy || 'context-manager') || 'context-manager';
  const resolvedPriority = normalizeIntentPriority(priority || packet.priority || packet.urgency || report.priority || report.urgency);
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
  const semanticMeaning = buildSemanticMeaning(report, packet, resolvedPriority);
  const confidenceSource = [report.confidence, packet.confidence].find((value) => Number.isFinite(Number(value)));
  const confidence = Number(Number.isFinite(Number(confidenceSource)) ? Number(confidenceSource) : 0);
  const contractId = normalizeText(intentId || packet.intentId || report.intentId || `intent_${resolvedSourceType}_${resolvedSourceRef}_${resolvedTimestamp}`) || `intent_${resolvedSourceType}_${resolvedSourceRef}_${resolvedTimestamp}`;
  const canonicalIntent = {
    id: contractId,
    source: {
      type: resolvedSourceType,
      ref: resolvedSourceRef,
      requestedBy: resolvedRequestedBy,
    },
    geometry,
    semanticMeaning,
    confidence: Number(confidence.toFixed(2)),
    createdAt: resolvedTimestamp,
    provenance: {
      ...(provenance && typeof provenance === 'object' ? provenance : {}),
      sourceType: resolvedSourceType,
      sourceRef: resolvedSourceRef,
      requestedBy: resolvedRequestedBy,
    },
  };
  canonicalIntent.missingFields = buildMissingFields(canonicalIntent);
  canonicalIntent.status = canonicalIntent.missingFields.length ? 'degraded' : 'canonical';
  canonicalIntent.intentId = canonicalIntent.id;
  canonicalIntent.sourceType = canonicalIntent.source.type;
  canonicalIntent.sourceRef = canonicalIntent.source.ref;
  canonicalIntent.nodeId = resolvedSourceRef;
  canonicalIntent.requestedBy = resolvedRequestedBy;
  canonicalIntent.timestamp = canonicalIntent.createdAt;
  canonicalIntent.priority = canonicalIntent.semanticMeaning.urgency;
  canonicalIntent.summary = canonicalIntent.semanticMeaning.summary;
  canonicalIntent.statement = canonicalIntent.semanticMeaning.statement;
  canonicalIntent.goal = canonicalIntent.semanticMeaning.goal;
  canonicalIntent.requestType = canonicalIntent.semanticMeaning.requestType;
  canonicalIntent.requestedOutcomes = canonicalIntent.semanticMeaning.requestedOutcomes;
  canonicalIntent.tasks = canonicalIntent.semanticMeaning.requestedOutcomes;
  canonicalIntent.targets = canonicalIntent.semanticMeaning.targets;
  canonicalIntent.constraints = canonicalIntent.semanticMeaning.constraints;
  canonicalIntent.projectContext = {
    currentFocus: canonicalIntent.nodeId || canonicalIntent.source.ref || null,
    matchedTerms: canonicalIntent.semanticMeaning.labels,
    blockers: canonicalIntent.semanticMeaning.constraints,
    anchorRefs: Array.isArray(canonicalIntent.provenance?.anchorRefs) ? canonicalIntent.provenance.anchorRefs : [],
  };
  return {
    canonicalIntent,
    summary: canonicalIntent.summary,
    confidence: canonicalIntent.confidence,
    goal: canonicalIntent.goal,
    targets: canonicalIntent.targets,
    constraints: canonicalIntent.constraints,
    urgency: canonicalIntent.priority,
    requestType: canonicalIntent.requestType,
    requestedOutcomes: canonicalIntent.requestedOutcomes,
    tasks: canonicalIntent.tasks,
    signals: [],
    judgedAt: resolvedTimestamp,
  };
}
