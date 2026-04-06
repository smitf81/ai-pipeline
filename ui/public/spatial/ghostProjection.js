function nowIso() {
  return new Date().toISOString();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeGhostProjectionStatus(value = 'candidate') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['candidate', 'blocked', 'ready'].includes(normalized)) {
    return normalized;
  }
  return 'candidate';
}

function normalizeGhostProjectionRecord(record = {}) {
  const sourceIntentIds = uniqueStrings(
    Array.isArray(record.sourceIntentIds)
      ? record.sourceIntentIds
      : Array.isArray(record.intentIds)
        ? record.intentIds
        : record.sourceIntentId
          ? [record.sourceIntentId]
          : [],
  );
  const proposedChange = record.proposedChange && typeof record.proposedChange === 'object'
    ? { ...record.proposedChange }
    : { summary: String(record.summary || '').trim() };
  const provenance = record.provenance && typeof record.provenance === 'object' ? { ...record.provenance } : {};
  const reasoning = uniqueStrings(Array.isArray(record.reasoning) ? record.reasoning : Array.isArray(provenance.reasoning) ? provenance.reasoning : [])
    .filter((entry) => !/^sourceintentid=/i.test(entry));
  return {
    id: String(record.id || `ghost_${nowIso()}`).trim(),
    sourceIntentIds,
    proposedChange,
    confidence: Number.isFinite(Number(record.confidence)) ? Number(clamp01(record.confidence).toFixed(2)) : 0,
    status: normalizeGhostProjectionStatus(record.status),
    reasoning,
    provenance: {
      ...provenance,
      createdAt: provenance.createdAt || record.createdAt || nowIso(),
      usedFallback: Boolean(provenance.usedFallback || record.usedFallback),
    },
  };
}

function createEmptyGhostProjectionRegistry() {
  return {
    currentProjectionId: null,
    latestProjectionId: null,
    byId: {},
    records: [],
  };
}

function buildGhostProjectionRecord({
  id = null,
  sourceIntentIds = [],
  proposedChange = {},
  confidence = 0,
  status = 'candidate',
  reasoning = [],
  provenance = {},
} = {}) {
  return normalizeGhostProjectionRecord({
    id,
    sourceIntentIds,
    proposedChange,
    confidence,
    status,
    reasoning,
    provenance,
  });
}

function buildGhostProjectionFromIntent({
  sourceIntent = {},
  proposedChange = {},
  confidence = null,
  status = 'candidate',
  reasoning = [],
  provenance = {},
} = {}) {
  const sourceIntentId = String(sourceIntent?.intentId || sourceIntent?.id || provenance?.sourceIntentId || '').trim();
  const resolvedConfidence = Number.isFinite(Number(confidence))
    ? Number(clamp01(confidence).toFixed(2))
    : (Number.isFinite(Number(sourceIntent?.confidence)) ? Number(clamp01(sourceIntent.confidence).toFixed(2)) : 0);
  const resolvedReasoning = [
    `status=${normalizeGhostProjectionStatus(status)}`,
    ...uniqueStrings(reasoning).filter((entry) => !/^sourceintentid=/i.test(entry)),
  ];
  const change = proposedChange && typeof proposedChange === 'object'
    ? proposedChange
    : { summary: String(proposedChange || '').trim() };
  return buildGhostProjectionRecord({
    id: provenance?.projectionId || sourceIntent?.ghostProjectionId || `ghost_${sourceIntentId || 'unknown'}_${Date.now()}`,
    sourceIntentIds: sourceIntentId ? [sourceIntentId] : uniqueStrings(sourceIntent?.sourceIntentIds || []),
    proposedChange: change,
    confidence: resolvedConfidence,
    status: normalizeGhostProjectionStatus(status),
    reasoning: resolvedReasoning,
    provenance: {
      ...provenance,
      sourceIntentId: sourceIntentId || provenance?.sourceIntentId || null,
      sourceIntentIds: sourceIntentId ? [sourceIntentId] : uniqueStrings(provenance?.sourceIntentIds || []),
      sourceType: provenance?.sourceType || sourceIntent?.sourceType || null,
      sourceRef: provenance?.sourceRef || sourceIntent?.sourceRef || null,
      interpreter: provenance?.interpreter || sourceIntent?.provenance?.interpreter || 'deterministic-ghost-v1',
      createdAt: provenance?.createdAt || sourceIntent?.createdAt || nowIso(),
      usedFallback: Boolean(provenance?.usedFallback || sourceIntent?.provenance?.usedFallback),
    },
  });
}

function upsertGhostProjectionRegistry(registry = createEmptyGhostProjectionRegistry(), projection = null) {
  const base = registry && typeof registry === 'object' ? registry : createEmptyGhostProjectionRegistry();
  const nextProjection = projection && typeof projection === 'object' ? normalizeGhostProjectionRecord(projection) : null;
  if (!nextProjection) return base;
  const nextById = { ...(base.byId || {}) };
  const currentRecords = Array.isArray(base.records) ? base.records.filter((record) => String(record?.id || '') !== nextProjection.id) : [];
  nextById[nextProjection.id] = nextProjection;
  const nextRecords = [...currentRecords, nextProjection];
  return {
    currentProjectionId: nextProjection.id,
    latestProjectionId: nextProjection.id,
    byId: nextById,
    records: nextRecords,
  };
}

function removeGhostProjectionBySourceIntentId(registry = createEmptyGhostProjectionRegistry(), sourceIntentId = null) {
  const normalized = String(sourceIntentId || '').trim();
  if (!normalized) return registry;
  const base = registry && typeof registry === 'object' ? registry : createEmptyGhostProjectionRegistry();
  const nextRecords = (Array.isArray(base.records) ? base.records : []).filter((record) => !(Array.isArray(record.sourceIntentIds) && record.sourceIntentIds.includes(normalized)));
  const nextById = {};
  nextRecords.forEach((record) => {
    nextById[record.id] = record;
  });
  const nextCurrent = base.currentProjectionId && nextById[base.currentProjectionId] ? base.currentProjectionId : (nextRecords[0]?.id || null);
  return {
    currentProjectionId: nextCurrent,
    latestProjectionId: nextRecords[nextRecords.length - 1]?.id || null,
    byId: nextById,
    records: nextRecords,
  };
}

function getCurrentGhostProjection(registry = createEmptyGhostProjectionRegistry()) {
  const currentProjectionId = registry?.currentProjectionId || null;
  if (!currentProjectionId) return null;
  return registry.byId?.[currentProjectionId] || null;
}

function summarizeGhostProjection(projection = null) {
  if (!projection) return 'No ghost projection';
  const intents = Array.isArray(projection.sourceIntentIds) ? projection.sourceIntentIds.join(', ') : 'unknown';
  const proposalSummary = String(projection.proposedChange?.summary || projection.proposedChange?.description || '').trim();
  return `${projection.status} ghost ${projection.id} | intents: ${intents} | confidence ${(Number(projection.confidence) * 100).toFixed(0)}%${proposalSummary ? ` | ${proposalSummary}` : ''}`;
}

function buildGhostProjectionRegistryPayload(registry = createEmptyGhostProjectionRegistry()) {
  const normalized = registry && typeof registry === 'object' ? registry : createEmptyGhostProjectionRegistry();
  return {
    currentProjectionId: normalized.currentProjectionId || null,
    latestProjectionId: normalized.latestProjectionId || null,
    byId: { ...(normalized.byId || {}) },
    records: Array.isArray(normalized.records) ? normalized.records.map((record) => normalizeGhostProjectionRecord(record)) : [],
  };
}

export {
  buildGhostProjectionFromIntent,
  buildGhostProjectionRegistryPayload,
  buildGhostProjectionRecord,
  createEmptyGhostProjectionRegistry,
  getCurrentGhostProjection,
  normalizeGhostProjectionRecord,
  normalizeGhostProjectionStatus,
  removeGhostProjectionBySourceIntentId,
  summarizeGhostProjection,
  upsertGhostProjectionRegistry,
};
