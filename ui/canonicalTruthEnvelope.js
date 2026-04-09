const CONTRACT_VERSION = 'canonical-truth-envelope.v0';
const CLASSIFICATIONS = new Set(['canonical', 'projection', 'historical', 'fallback']);
const FRESHNESS_VALUES = new Set(['live', 'stale', 'cached', 'unknown']);

function normalizeClassification(value, fallback = 'projection') {
  const normalized = String(value || '').trim().toLowerCase();
  return CLASSIFICATIONS.has(normalized) ? normalized : fallback;
}

function normalizeFreshness(value, fallback = 'unknown') {
  const normalized = String(value || '').trim().toLowerCase();
  return FRESHNESS_VALUES.has(normalized) ? normalized : fallback;
}

function createCanonicalTruthEnvelope({
  domain,
  projectionId,
  classification = 'projection',
  sourceOfTruth,
  owner,
  generatedAt = new Date().toISOString(),
  freshness = 'unknown',
  fallbackUsed = false,
  data = {},
} = {}) {
  return {
    domain: String(domain || '').trim(),
    projectionId: String(projectionId || '').trim(),
    classification: normalizeClassification(classification),
    sourceOfTruth: String(sourceOfTruth || '').trim(),
    owner: String(owner || '').trim(),
    contractVersion: CONTRACT_VERSION,
    generatedAt: String(generatedAt || '').trim() || new Date().toISOString(),
    freshness: normalizeFreshness(freshness),
    fallbackUsed: Boolean(fallbackUsed),
    data: data && typeof data === 'object' ? data : {},
  };
}

function extractCanonicalTruthMetadata(envelope = {}) {
  return {
    domain: String(envelope.domain || '').trim(),
    projectionId: String(envelope.projectionId || '').trim(),
    classification: normalizeClassification(envelope.classification),
    sourceOfTruth: String(envelope.sourceOfTruth || '').trim(),
    owner: String(envelope.owner || '').trim(),
    contractVersion: String(envelope.contractVersion || CONTRACT_VERSION).trim() || CONTRACT_VERSION,
    generatedAt: String(envelope.generatedAt || '').trim() || new Date().toISOString(),
    freshness: normalizeFreshness(envelope.freshness),
    fallbackUsed: Boolean(envelope.fallbackUsed),
  };
}

function decorateCanonicalTruthPayload(envelope = {}) {
  const data = envelope?.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
    ? Object.fromEntries(
        Object.entries(envelope.data).filter(([key]) => !key.startsWith('__')),
      )
    : {};
  return {
    ...data,
    canonicalTruth: extractCanonicalTruthMetadata(envelope),
  };
}

module.exports = {
  CONTRACT_VERSION,
  createCanonicalTruthEnvelope,
  extractCanonicalTruthMetadata,
  decorateCanonicalTruthPayload,
};
