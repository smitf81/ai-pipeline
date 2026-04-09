function normalizeRenderObject(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeRenderText(value = '') {
  return typeof value === 'string' ? value.trim() : String(value == null ? '' : value).trim();
}

function pickFirstNonEmptyObject(...values) {
  for (const value of values) {
    const normalized = normalizeRenderObject(value);
    if (Object.keys(normalized).length) return normalized;
  }
  return {};
}

function readDeskProvenanceSource(panelData = {}, targetDeskId = null) {
  const canonicalTruth = normalizeRenderObject(panelData?.canonicalTruth);
  const meta = pickFirstNonEmptyObject(panelData?.__canonicalTruthMeta, panelData?.canonicalTruthMeta);
  const source = {
    ...meta,
    ...canonicalTruth,
  };
  const fallbackUsed = source.fallbackUsed ?? source.fallback_used ?? null;
  return {
    domain: normalizeRenderText(source.domain || source.domainKey || source.domain_id || source.domainName || 'desk_properties'),
    projectionId: normalizeRenderText(
      source.projectionId
      || source.projection_id
      || panelData?.deskId
      || targetDeskId
      || '',
    ),
    classification: normalizeRenderText(source.classification || (panelData?.canonicalTruthSections ? 'projection' : '')),
    freshness: normalizeRenderText(source.freshness || ''),
    generatedAt: normalizeRenderText(source.generatedAt || source.generated_at || panelData?.generatedAt || ''),
    fallbackUsed: typeof fallbackUsed === 'boolean' ? fallbackUsed : null,
    route: normalizeRenderText(source.route || source.routePath || source.sourceRoute || '/api/spatial/desks/:deskId/properties'),
  };
}

function prioritizeProvenanceSection([key, value]) {
  const section = normalizeRenderObject(value);
  const classification = normalizeRenderText(section.classification || '');
  const hasNestedSections = Object.keys(normalizeRenderObject(section.sections)).length > 0;
  const fallbackUsed = Boolean(section.fallbackUsed ?? section.fallback_used);
  const routeKey = key === 'route';
  let score = 0;
  if (fallbackUsed) score += 4;
  if (classification && classification !== 'projection') score += 3;
  if (hasNestedSections) score += 2;
  if (!routeKey) score += 1;
  return score;
}

export function summarizeDeskProvenanceSections(sectionMap = {}) {
  const entries = Object.entries(normalizeRenderObject(sectionMap))
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value));
  const keys = entries
    .sort((left, right) => prioritizeProvenanceSection(right) - prioritizeProvenanceSection(left))
    .map(([key]) => key)
    .filter(Boolean);
  return {
    count: entries.length,
    keys: [...new Set(keys)].slice(0, 2),
  };
}

export function normalizeDeskProvenance(panelData = {}, targetDeskId = null) {
  const canonicalTruth = normalizeRenderObject(panelData?.canonicalTruth);
  const meta = pickFirstNonEmptyObject(panelData?.__canonicalTruthMeta, panelData?.canonicalTruthMeta);
  const canonicalTruthSections = pickFirstNonEmptyObject(
    panelData?.canonicalTruthSections,
    canonicalTruth.sections,
    meta.sections,
  );
  const source = readDeskProvenanceSource(panelData, targetDeskId);
  const sectionSummary = summarizeDeskProvenanceSections(canonicalTruthSections);
  const hasGovernedProvenance = Boolean(
    Object.keys(canonicalTruth).length
    || Object.keys(meta).length
    || sectionSummary.count,
  );
  return {
    ...source,
    sectionSummary,
    hasGovernedProvenance,
  };
}
