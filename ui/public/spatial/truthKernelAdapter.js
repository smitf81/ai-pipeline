import { buildQAEvidenceProvenancePresentation } from './qaEvidenceProvenance.js';
import { summarizeCanonicalTruthSections } from './qaReadableSections.js';

export const EMPTY_TRUTH_KERNEL = Object.freeze({
  canonicalTruth: null,
  canonicalTruthSections: null,
  generatedAt: null,
  nodeCount: 0,
  nodes: [],
});

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'healthy' || normalized === 'degraded' || normalized === 'blocked' || normalized === 'orphaned' || normalized === 'informational') {
    return normalized;
  }
  return 'informational';
}

export function normalizeTruthKernelPayload(payload = null) {
  const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const canonicalTruth = payload?.canonicalTruth && typeof payload.canonicalTruth === 'object' && !Array.isArray(payload.canonicalTruth)
    ? {
        domain: String(payload.canonicalTruth.domain || '').trim() || null,
        projectionId: String(payload.canonicalTruth.projectionId || '').trim() || null,
        classification: String(payload.canonicalTruth.classification || '').trim() || null,
        freshness: String(payload.canonicalTruth.freshness || '').trim() || null,
        generatedAt: String(payload.canonicalTruth.generatedAt || '').trim() || null,
        fallbackUsed: typeof payload.canonicalTruth.fallbackUsed === 'boolean' ? payload.canonicalTruth.fallbackUsed : null,
      }
    : null;
  const canonicalTruthSections = payload?.canonicalTruthSections && typeof payload.canonicalTruthSections === 'object' && !Array.isArray(payload.canonicalTruthSections)
    ? payload.canonicalTruthSections
    : null;
  const normalizedNodes = nodes
    .map((node) => ({
      id: String(node?.id || '').trim(),
      kind: ['input', 'execution', 'artifact'].includes(node?.kind) ? node.kind : 'artifact',
      timestamp: Number.isFinite(node?.timestamp) ? node.timestamp : Date.parse(node?.timestamp || '') || 0,
      parents: Array.isArray(node?.parents) ? [...new Set(node.parents.filter(Boolean).map((value) => String(value)))] : [],
      children: Array.isArray(node?.children) ? [...new Set(node.children.filter(Boolean).map((value) => String(value)))] : [],
      status: normalizeStatus(node?.status),
      confidence: clamp01(node?.confidence, 0.5),
      weight: clamp01(node?.weight, 0.5),
    }))
    .filter((node) => node.id)
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
      return left.id.localeCompare(right.id);
    });
  return {
    canonicalTruth,
    canonicalTruthSections,
    generatedAt: payload?.generatedAt || null,
    nodeCount: normalizedNodes.length,
    nodes: normalizedNodes,
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
  const chips = [...provenance.chips];
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
