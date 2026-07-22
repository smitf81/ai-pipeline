import {
  buildGhostProjectionFromIntent,
  buildGhostProjectionRegistryPayload,
  createEmptyGhostProjectionRegistry,
  removeGhostProjectionBySourceIntentId,
  upsertGhostProjectionRegistry,
} from './ghostProjection.js';
import { createEdge, createNode } from './graphEngine.js';

const MAX_DRAFT_NODES = 3;

function normalizeCandidateConfidence(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCandidateBasis(value) {
  return String(value || '').trim().toLowerCase() === 'inferred' ? 'inferred' : 'explicit';
}

function normalizeCandidateKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'thought') return 'text';
  return kind === 'module' || kind === 'file' || kind === 'constraint' || kind === 'adapter' || kind === 'ux' || kind === 'ghost' ? kind : 'text';
}

function resolveExtractedIntent(decomposition = {}) {
  if (decomposition?.extractedIntent && typeof decomposition.extractedIntent === 'object') {
    return decomposition.extractedIntent;
  }
  return decomposition && typeof decomposition === 'object' ? decomposition : {};
}

function rankCandidateNodes(extractedIntent = {}, sourceNode = null, limit = MAX_DRAFT_NODES) {
  const sourceText = String(sourceNode?.content || '').trim().toLowerCase();
  const seen = new Set();
  return (Array.isArray(extractedIntent?.candidateNodes) ? extractedIntent.candidateNodes : [])
    .map((candidate, index) => ({
      candidate,
      index,
      basis: normalizeCandidateBasis(candidate?.basis),
      confidence: normalizeCandidateConfidence(candidate?.confidence),
      label: String(candidate?.label || '').trim(),
    }))
    .filter((entry) => entry.label)
    .filter((entry) => entry.label.toLowerCase() !== sourceText)
    .sort((left, right) => {
      if (left.basis !== right.basis) return left.basis === 'explicit' ? -1 : 1;
      const leftConfidence = left.confidence ?? -1;
      const rightConfidence = right.confidence ?? -1;
      if (leftConfidence !== rightConfidence) return rightConfidence - leftConfidence;
      return left.index - right.index;
    })
    .filter((entry) => {
      const key = entry.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((entry) => ({
      id: String(entry.candidate?.id || `candidate_${entry.index}`).trim() || `candidate_${entry.index}`,
      label: entry.label,
      kind: normalizeCandidateKind(entry.candidate?.kind),
      basis: entry.basis,
      rationale: String(entry.candidate?.rationale || '').trim(),
      confidence: entry.confidence,
    }));
}

function buildGhostProjectionReasoning({
  parentNode,
  report,
  extractedIntent,
  candidateNode,
  status,
}) {
  return [
    `sourceIntentId=${String(report?.intentId || report?.id || parentNode?.id || 'unknown').trim() || 'unknown'}`,
    `candidateId=${candidateNode.id}`,
    `candidateKind=${candidateNode.kind}`,
    `basis=${candidateNode.basis}`,
    `status=${String(status || 'candidate').trim().toLowerCase()}`,
    String(extractedIntent?.summary || report?.summary || '').trim() ? `summary=${String(extractedIntent.summary || report.summary).trim()}` : null,
    candidateNode.rationale ? `rationale=${candidateNode.rationale}` : null,
  ].filter(Boolean);
}

function buildProposedChange({
  parentNode,
  report,
  extractedIntent,
  candidateNode,
  generationId,
  createdAt,
  layer,
}) {
  const summary = String(candidateNode.label || extractedIntent?.summary || report?.summary || '').trim();
  return {
    summary,
    description: candidateNode.rationale || String(extractedIntent?.statement || extractedIntent?.goal || report?.statement || report?.goal || '').trim(),
    targetNodeId: parentNode?.id || null,
    targetLayer: layer,
    kind: candidateNode.kind,
    basis: candidateNode.basis,
    generationId,
    createdAt,
  };
}

function resolveGhostSourceIntentId(parentNode, report, extractedIntent) {
  return String(report?.intentId || report?.id || extractedIntent?.id || parentNode?.id || '').trim();
}

function isLinkedDraftForSource(node = null, sourceNodeId = '') {
  const rsg = node?.metadata?.rsg || {};
  return (
    String(rsg.state || '').trim().toLowerCase() === 'linked-draft'
    && String(rsg.sourceNodeId || node?.metadata?.sourceNodeId || '').trim() === sourceNodeId
  );
}

function buildDraftNode(parentNode, candidateNode, { generationId, createdAt, layer, index } = {}) {
  const sourceNodeId = parentNode?.id || null;
  return createNode({
    type: candidateNode.kind === 'text' ? 'text' : candidateNode.kind,
    content: candidateNode.label,
    position: {
      x: Number(parentNode?.position?.x || 0) + 220,
      y: Number(parentNode?.position?.y || 0) + (index * 96),
    },
    metadata: {
      graphLayer: layer,
      origin: 'ai',
      sourceNodeId,
      basis: candidateNode.basis,
      confidence: candidateNode.confidence,
      labels: ['ai', 'rsg', candidateNode.basis].filter(Boolean),
      intentRef: {
        sourceNodeId,
        candidateNodeId: candidateNode.id,
        basis: candidateNode.basis,
      },
      rsg: {
        state: 'linked-draft',
        sourceNodeId,
        generationId,
        createdAt,
        intentRef: {
          candidateNodeId: candidateNode.id,
          basis: candidateNode.basis,
        },
      },
    },
  });
}

export class MutationEngine {
  constructor(graphEngine) {
    this.graphEngine = graphEngine;
    this.ghostProjectionRegistry = createEmptyGhostProjectionRegistry();
  }

  getGhostProjectionRegistry() {
    return buildGhostProjectionRegistryPayload(this.ghostProjectionRegistry);
  }

  setGhostProjectionRegistry(registry = createEmptyGhostProjectionRegistry()) {
    this.ghostProjectionRegistry = buildGhostProjectionRegistryPayload(registry);
    return this.getGhostProjectionRegistry();
  }

  upsertGhostProjection(projection = null) {
    this.ghostProjectionRegistry = upsertGhostProjectionRegistry(this.ghostProjectionRegistry, projection);
    return this.getGhostProjectionRegistry();
  }

  removeGhostProjectionsForSource(sourceIntentId) {
    const normalized = String(sourceIntentId || '').trim();
    if (!normalized) {
      return {
        removedProjectionIds: [],
        registry: this.getGhostProjectionRegistry(),
      };
    }
    const previousRecords = Array.isArray(this.ghostProjectionRegistry.records) ? this.ghostProjectionRegistry.records : [];
    const removedProjectionIds = previousRecords
      .filter((record) => Array.isArray(record.sourceIntentIds) && record.sourceIntentIds.includes(normalized))
      .map((record) => record.id);
    this.ghostProjectionRegistry = removeGhostProjectionBySourceIntentId(this.ghostProjectionRegistry, normalized);
    return {
      removedProjectionIds,
      registry: this.getGhostProjectionRegistry(),
    };
  }

  buildMutationRequestFromIntent(parentNode, decomposition = {}, options = {}) {
    const extractedIntent = resolveExtractedIntent(decomposition);
    const layer = options.layer || parentNode?.metadata?.graphLayer || 'system';
    const rankedCandidates = rankCandidateNodes(extractedIntent, parentNode, options.maxNodes || MAX_DRAFT_NODES);
    const generationId = options.generationId || `ghost_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = options.createdAt || new Date().toISOString();
    const sourceIntentId = resolveGhostSourceIntentId(parentNode, decomposition, extractedIntent);
    const removal = this.removeGhostProjectionsForSource(sourceIntentId);
    if (!rankedCandidates.length) {
      return {
        generationId,
        createdAt,
        projectionRecords: [],
        replacedProjectionIds: removal.removedProjectionIds,
        usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || decomposition?.usedFallback),
        status: 'blocked',
        reason: 'no-extracted-intent-candidates',
        registry: this.getGhostProjectionRegistry(),
      };
    }
    const candidateNode = rankedCandidates[0];
    const projectionRecords = [buildGhostProjectionFromIntent({
      sourceIntent: decomposition?.intentRecord || decomposition?.canonicalIntent || decomposition || parentNode || {},
      proposedChange: buildProposedChange({
        parentNode,
        report: decomposition,
        extractedIntent,
        candidateNode,
        generationId,
        createdAt,
        layer,
      }),
      confidence: candidateNode.confidence ?? normalizeCandidateConfidence(decomposition?.confidence),
      status: options.status || 'candidate',
      reasoning: buildGhostProjectionReasoning({
        parentNode,
        report: decomposition,
        extractedIntent,
        candidateNode,
        status: options.status || 'candidate',
      }),
      provenance: {
        sourceType: parentNode?.metadata?.graphLayer || options.sourceType || 'system',
        sourceRef: parentNode?.id || sourceIntentId || null,
        sourceNodeId: parentNode?.id || null,
        sourceIntentId: sourceIntentId || null,
        generationId,
        createdAt,
        usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || decomposition?.usedFallback),
      },
    })];
    projectionRecords.forEach((projection) => this.upsertGhostProjection(projection));
    return {
      generationId,
      createdAt,
      projectionRecords,
      replacedProjectionIds: removal.removedProjectionIds,
      usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || decomposition?.usedFallback),
      status: 'ready',
      reason: '',
      registry: this.getGhostProjectionRegistry(),
    };
  }

  applyMutations() {
    return [];
  }

  syncDraftNodesFromReport(parentNode, report = {}, options = {}) {
    if (!parentNode?.id) {
      return {
        generationId: null,
        createdAt: options.createdAt || new Date().toISOString(),
        generatedNodes: [],
        replacedNodeIds: [],
        projectionRecords: [],
        replacedProjectionIds: [],
        reason: 'missing-source-node',
        registry: this.getGhostProjectionRegistry(),
      };
    }

    const extractedIntent = resolveExtractedIntent(report);
    const createdAt = options.createdAt || new Date().toISOString();
    const generationId = options.generationId || `ghost_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const layer = options.layer || parentNode?.metadata?.graphLayer || 'system';
    const rankedCandidates = rankCandidateNodes(extractedIntent, parentNode, options.maxNodes || MAX_DRAFT_NODES);
    const sourceIntentId = resolveGhostSourceIntentId(parentNode, report, extractedIntent);
    const removal = this.removeGhostProjectionsForSource(sourceIntentId);
    const graphState = this.graphEngine?.getState?.() || { nodes: [], edges: [] };
    const replacedNodeIds = (Array.isArray(graphState.nodes) ? graphState.nodes : [])
      .filter((node) => isLinkedDraftForSource(node, parentNode.id))
      .map((node) => node.id);
    replacedNodeIds.forEach((nodeId) => this.graphEngine?.removeNode?.(nodeId));
    if (!rankedCandidates.length) {
      return {
        generationId,
        createdAt,
        generatedNodes: [],
        replacedNodeIds,
        projectionRecords: [],
        replacedProjectionIds: removal.removedProjectionIds,
        usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || report?.usedFallback),
        status: 'blocked',
        reason: 'no-extracted-intent-candidates',
        registry: this.getGhostProjectionRegistry(),
      };
    }
    const candidateNode = rankedCandidates[0];
    const projectionRecords = [buildGhostProjectionFromIntent({
      sourceIntent: report || extractedIntent || parentNode || {},
      proposedChange: buildProposedChange({
        parentNode,
        report,
        extractedIntent,
        candidateNode,
        generationId,
        createdAt,
        layer,
      }),
      confidence: candidateNode.confidence ?? normalizeCandidateConfidence(report?.confidence),
      status: options.status || 'candidate',
      reasoning: buildGhostProjectionReasoning({
        parentNode,
        report,
        extractedIntent,
        candidateNode,
        status: options.status || 'candidate',
      }),
      provenance: {
        sourceType: report?.sourceType || parentNode?.metadata?.graphLayer || options.sourceType || 'system',
        sourceRef: report?.sourceRef || parentNode?.id || sourceIntentId || null,
        sourceNodeId: parentNode?.id || report?.nodeId || null,
        sourceIntentId: sourceIntentId || null,
        generationId,
        createdAt,
        usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || report?.usedFallback),
      },
    })];

    projectionRecords.forEach((projection) => this.upsertGhostProjection(projection));
    const generatedNodes = rankedCandidates.map((candidate, index) => buildDraftNode(parentNode, candidate, {
      generationId,
      createdAt,
      layer,
      index,
    }));
    generatedNodes.forEach((node) => {
      this.graphEngine?.addNode?.(node);
      this.graphEngine?.addEdge?.(createEdge({
        source: parentNode.id,
        target: node.id,
        relationshipType: 'rsg_draft',
        label: 'RSG draft',
        supports: ['intent_projection'],
      }));
    });

    return {
      generationId,
      createdAt,
      generatedNodes,
      replacedNodeIds,
      projectionRecords,
      replacedProjectionIds: removal.removedProjectionIds,
      usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || report?.usedFallback),
      status: 'ready',
      reason: '',
      registry: this.getGhostProjectionRegistry(),
    };
  }
}
