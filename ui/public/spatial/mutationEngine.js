import { createNode, createEdge } from './graphEngine.js';

const MAX_DRAFT_NODES = 3;
const DRAFT_X_OFFSET = 280;
const DRAFT_Y_STEP = 116;
const OVERLAP_X_THRESHOLD = 210;
const OVERLAP_Y_THRESHOLD = 92;
const SYSTEM_NODE_TYPES = new Set(['text', 'task', 'module', 'file', 'constraint', 'adapter', 'ux']);

function normalizeCandidateConfidence(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCandidateBasis(value) {
  return String(value || '').trim().toLowerCase() === 'inferred' ? 'inferred' : 'explicit';
}

function normalizeCandidateKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (SYSTEM_NODE_TYPES.has(kind)) return kind;
  if (kind === 'thought') return 'text';
  return 'text';
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

function overlaps(position, nodes = []) {
  return nodes.some((node) => (
    Math.abs((node?.position?.x || 0) - position.x) < OVERLAP_X_THRESHOLD
    && Math.abs((node?.position?.y || 0) - position.y) < OVERLAP_Y_THRESHOLD
  ));
}

function resolveDraftPosition(parentNode, existingNodes, total, index) {
  const centerOffset = ((total - 1) * DRAFT_Y_STEP) / 2;
  let position = {
    x: (parentNode?.position?.x || 0) + DRAFT_X_OFFSET,
    y: (parentNode?.position?.y || 0) - centerOffset + index * DRAFT_Y_STEP,
  };
  let attempts = 0;
  while (overlaps(position, existingNodes) && attempts < 8) {
    position = {
      x: position.x,
      y: position.y + DRAFT_Y_STEP,
    };
    attempts += 1;
  }
  return position;
}

function buildDraftMetadata(parentNode, report, extractedIntent, candidateNode, generationId, createdAt, layer = 'system') {
  return {
    role: candidateNode.kind === 'text' ? 'thought' : candidateNode.kind,
    origin: 'ai',
    sourceNodeId: parentNode?.id || null,
    intentRef: {
      sourceNodeId: parentNode?.id || null,
      extractedIntentId: extractedIntent?.id || null,
      candidateNodeId: candidateNode.id,
      basis: candidateNode.basis,
    },
    basis: candidateNode.basis,
    confidence: candidateNode.confidence ?? normalizeCandidateConfidence(report?.confidence),
    usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || report?.usedFallback),
    graphLayer: layer,
    labels: ['proposal', 'generated', 'ai', candidateNode.basis],
    proposalTarget: 'system-structure',
    approvalPolicy: 'auto-record',
    intentStatus: 'ready',
    lastCommittedContent: '',
    rsg: {
      generationId,
      sourceNodeId: parentNode?.id || null,
      state: 'linked-draft',
      createdAt,
      confidence: candidateNode.confidence ?? normalizeCandidateConfidence(report?.confidence),
      summary: String(extractedIntent?.summary || report?.summary || '').trim(),
      usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || report?.usedFallback),
      intentRef: {
        sourceNodeId: parentNode?.id || null,
        extractedIntentId: extractedIntent?.id || null,
        candidateNodeId: candidateNode.id,
        basis: candidateNode.basis,
      },
    },
  };
}

export class MutationEngine {
  constructor(graphEngine) {
    this.graphEngine = graphEngine;
  }

  buildMutationRequestFromIntent(parentNode, decomposition = {}, options = {}) {
    const extractedIntent = resolveExtractedIntent(decomposition);
    const layer = options.layer || parentNode?.metadata?.graphLayer || 'system';
    const candidates = rankCandidateNodes(extractedIntent, parentNode, options.maxNodes || MAX_DRAFT_NODES);
    const generationId = options.generationId || `rsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = options.createdAt || new Date().toISOString();
    const baseNodes = [...(this.graphEngine.getState()?.nodes || [])];
    const mutations = [];
    candidates.forEach((candidateNode, index) => {
      const metadata = buildDraftMetadata(parentNode, decomposition, extractedIntent, candidateNode, generationId, createdAt, layer);
      const newNode = createNode({
        type: candidateNode.kind,
        content: candidateNode.label,
        position: resolveDraftPosition(parentNode, [...baseNodes, ...mutations.filter((entry) => entry.type === 'create_node').map((entry) => entry.node)], candidates.length, index),
        metadata: {
          ...metadata,
          lastCommittedContent: candidateNode.label,
        },
      });
      mutations.push({ type: 'create_node', node: newNode });
      mutations.push({ type: 'create_edge', edge: createEdge({ source: parentNode.id, target: newNode.id }) });
    });
    return mutations;
  }

  applyMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === 'create_node') this.graphEngine.addNode(mutation.node);
      if (mutation.type === 'modify_node') this.graphEngine.updateNode(mutation.id, mutation.patch);
      if (mutation.type === 'create_edge') this.graphEngine.addEdge(mutation.edge);
    }
  }

  removeLinkedDraftsForSource(sourceNodeId) {
    const nodes = this.graphEngine.getState()?.nodes || [];
    const linkedDraftIds = nodes
      .filter((node) => node?.metadata?.rsg?.sourceNodeId === sourceNodeId && node?.metadata?.rsg?.state === 'linked-draft')
      .map((node) => node.id);
    linkedDraftIds.forEach((nodeId) => this.graphEngine.removeNode(nodeId));
    return linkedDraftIds;
  }

  syncDraftNodesFromReport(parentNode, report = {}, options = {}) {
    if (!parentNode?.id) {
      return {
        generationId: null,
        createdAt: options.createdAt || new Date().toISOString(),
        generatedNodes: [],
        replacedNodeIds: [],
        reason: 'missing-source-node',
      };
    }

    const extractedIntent = resolveExtractedIntent(report);
    const createdAt = options.createdAt || new Date().toISOString();
    const generationId = options.generationId || `rsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const layer = options.layer || parentNode?.metadata?.graphLayer || 'system';
    const candidates = rankCandidateNodes(extractedIntent, parentNode, options.maxNodes || MAX_DRAFT_NODES);
    const replacedNodeIds = this.removeLinkedDraftsForSource(parentNode.id);
    const generatedNodes = [];
    const graphState = this.graphEngine.getState();
    const baseNodes = [...(graphState?.nodes || [])];

    candidates.forEach((candidateNode, index) => {
      const metadata = buildDraftMetadata(parentNode, report, extractedIntent, candidateNode, generationId, createdAt, layer);
      const draftNode = createNode({
        type: candidateNode.kind,
        content: candidateNode.label,
        position: resolveDraftPosition(parentNode, [...baseNodes, ...generatedNodes], candidates.length, index),
        metadata: {
          ...metadata,
          lastCommittedContent: candidateNode.label,
        },
      });
      generatedNodes.push(draftNode);
      this.graphEngine.addNode(draftNode);
      this.graphEngine.addEdge(createEdge({ source: parentNode.id, target: draftNode.id }));
    });

    return {
      generationId,
      createdAt,
      generatedNodes,
      replacedNodeIds,
      usedFallback: Boolean(extractedIntent?.provenance?.usedFallback || report?.usedFallback),
      reason: generatedNodes.length || replacedNodeIds.length ? '' : 'no-extracted-intent-candidates',
    };
  }
}
