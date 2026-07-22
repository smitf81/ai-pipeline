function nowIso() {
  return new Date().toISOString();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function createEmptySpatialGhostProjectionRegistry() {
  return {
    currentProjectionId: null,
    latestProjectionId: null,
    byId: {},
    records: [],
  };
}

function resolveBuildDesirabilityPeak(fieldInfluence = null) {
  const layer = fieldInfluence?.field?.baseLayer;
  const values = Array.isArray(layer?.values) ? layer.values : [];
  let peak = null;
  values.forEach((row, y) => {
    (Array.isArray(row) ? row : []).forEach((sample, x) => {
      const value = Number(sample);
      if (!Number.isFinite(value)) return;
      if (!peak || value > peak.value) {
        peak = { x, y, value };
      }
    });
  });
  if (!peak) return null;
  const width = Math.max(1, Number(layer?.width) || values[0]?.length || 1);
  const height = Math.max(1, Number(layer?.height) || values.length || 1);
  return {
    ...peak,
    width,
    height,
    normalizedX: Number(((peak.x + 0.5) / width).toFixed(3)),
    normalizedY: Number(((peak.y + 0.5) / height).toFixed(3)),
  };
}

function resolveSpatialGhostProjection(canonicalIntent = null) {
  const intent = canonicalIntent && typeof canonicalIntent === 'object' ? canonicalIntent : {};
  const sourceIntentId = String(intent.intentId || intent.id || '').trim() || null;
  const fieldInfluence = intent.fieldInfluence && typeof intent.fieldInfluence === 'object'
    ? intent.fieldInfluence
    : null;
  const peak = resolveBuildDesirabilityPeak(fieldInfluence);
  const fieldKey = String(fieldInfluence?.fieldKey || '').trim() || null;
  const candidateReady = Boolean(sourceIntentId && fieldKey === 'buildDesirability' && peak);
  const status = candidateReady && fieldInfluence?.status === 'canonical' ? 'candidate' : 'blocked';
  const createdAt = String(intent.createdAt || fieldInfluence?.provenance?.createdAt || nowIso()).trim() || nowIso();
  const confidence = candidateReady
    ? Number(Math.min(clamp01(intent.confidence), clamp01(peak.value)).toFixed(2))
    : 0;
  const blockers = [
    !sourceIntentId ? 'missing-source-intent' : null,
    fieldKey !== 'buildDesirability' ? 'missing-build-desirability-field' : null,
    !peak ? 'missing-field-peak' : null,
    fieldInfluence?.status !== 'canonical' ? 'field-degraded' : null,
  ].filter(Boolean);
  return {
    id: sourceIntentId ? `ghost_field_${sourceIntentId}` : 'ghost_field_blocked',
    sourceIntentIds: sourceIntentId ? [sourceIntentId] : [],
    status,
    confidence,
    proposedChange: candidateReady ? {
      kind: 'pressure_anchor',
      summary: 'Project a build anchor at the strongest build desirability pressure.',
      description: 'Uncommitted resolver candidate derived from the canonical buildDesirability field.',
      fieldKey,
      targetLayer: 'world',
      committed: false,
      anchor: {
        gridX: peak.x,
        gridY: peak.y,
        normalizedX: peak.normalizedX,
        normalizedY: peak.normalizedY,
        influence: Number(peak.value.toFixed(2)),
      },
    } : {
      kind: 'pressure_anchor',
      summary: 'No governed ghost candidate available.',
      fieldKey,
      committed: false,
    },
    blockers,
    reasoning: uniqueStrings([
      'resolver=field-peak-v1',
      fieldKey ? `fieldKey=${fieldKey}` : null,
      peak ? `peak=${peak.x},${peak.y}:${Number(peak.value.toFixed(2))}` : null,
      `status=${status}`,
      'mutation=uncommitted',
    ]),
    provenance: {
      authority: 'ace-resolver-projection',
      sourceIntentId,
      sourceIntentIds: sourceIntentId ? [sourceIntentId] : [],
      sourceType: 'field-resolver',
      sourceRef: fieldKey,
      fieldKey,
      fieldInterpreter: fieldInfluence?.provenance?.interpreter || null,
      resolver: 'ui/spatialGhostResolver.js::resolveSpatialGhostProjection',
      interpreter: 'field-peak-v1',
      createdAt,
      usedFallback: false,
    },
  };
}

function upsertSpatialGhostProjectionRegistry(registry = null, projection = null) {
  const base = registry && typeof registry === 'object'
    ? registry
    : createEmptySpatialGhostProjectionRegistry();
  if (!projection || typeof projection !== 'object' || !String(projection.id || '').trim()) return base;
  const nextRecords = [
    ...(Array.isArray(base.records) ? base.records : []).filter((entry) => entry?.id !== projection.id),
    projection,
  ].slice(-32);
  const byId = Object.fromEntries(nextRecords.map((entry) => [entry.id, entry]));
  return {
    currentProjectionId: projection.id,
    latestProjectionId: projection.id,
    byId,
    records: nextRecords,
  };
}

module.exports = {
  createEmptySpatialGhostProjectionRegistry,
  resolveBuildDesirabilityPeak,
  resolveSpatialGhostProjection,
  upsertSpatialGhostProjectionRegistry,
};
