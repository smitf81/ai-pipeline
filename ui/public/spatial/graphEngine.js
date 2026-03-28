export const GRAPH_LAYERS = ['system', 'world'];
export const PROPOSAL_TARGETS = ['system-structure', 'world-structure', 'adapter-translation', 'code-runtime-mutation'];
export const SYSTEM_NODE_TYPES = ['text', 'task', 'module', 'file', 'constraint', 'adapter'];
export const WORLD_NODE_TYPES = ['gameplay-system', 'mechanic', 'quest', 'item', 'world-constraint', 'adapter'];
export const NODE_TYPES = [...new Set([...SYSTEM_NODE_TYPES, ...WORLD_NODE_TYPES])];
const STRONG_RELATIONSHIP_TYPES = new Set([
  'dependency',
  'handoff',
  'ownership',
  'pipeline',
  'data_flow',
  'reporting',
  'workflow',
  'support',
  'validated',
]);
const RELATIONSHIP_VISUAL_FORMS = ['string', 'bundle', 'woven-rope'];
const RSG_ACTIVITY_LIMIT = 24;

function clampRelationshipStrength(value = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.min(4, Math.round(numeric)));
}

function normalizeRelationshipType(value = 'relates_to') {
  return String(value || 'relates_to').trim().toLowerCase().replace(/\s+/g, '_') || 'relates_to';
}

function normalizeRelationshipList(value = []) {
  const source = Array.isArray(value) ? value : (value == null ? [] : [value]);
  return [...new Set(source.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function inferRelationshipStrength(edge = {}, supports = [], validatedBy = []) {
  const explicit = Number(edge?.strength);
  if (Number.isFinite(explicit) && explicit > 0) {
    return clampRelationshipStrength(explicit);
  }
  const relationshipType = normalizeRelationshipType(edge?.relationshipType || edge?.relationship_type || edge?.type);
  let score = 1;
  if (STRONG_RELATIONSHIP_TYPES.has(relationshipType)) score += 1;
  score += Math.min(2, supports.length);
  if (validatedBy.length) score += 1;
  if (edge?.lastActive) score += 1;
  return clampRelationshipStrength(score);
}

function inferRelationshipStrandCount(edge = {}, supports = [], validatedBy = []) {
  const explicit = Number(edge?.strandCount);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.round(explicit));
  }
  return Math.max(1, supports.length, validatedBy.length);
}

function inferRelationshipHealth(edge = {}, strength = 1, strandCount = 1) {
  const risk = String(edge?.risk || '').trim().toLowerCase();
  if (risk === 'high' || risk === 'blocked') return 'blocked';
  if (strength >= 3 && strandCount >= 2) return 'healthy';
  if (strength >= 2) return 'degraded';
  return 'fragile';
}

function inferRelationshipVisualForm(strength = 1, strandCount = 1) {
  if (strandCount >= 3 || strength >= 4) return 'woven-rope';
  if (strandCount === 2 || strength >= 2) return 'bundle';
  return 'string';
}

export function deriveRelationshipVisual(edge = {}) {
  const relationshipType = normalizeRelationshipType(edge?.relationshipType || edge?.relationship_type || edge?.type);
  const supports = normalizeRelationshipList(edge?.supports);
  const validatedBy = normalizeRelationshipList(edge?.validatedBy);
  const strandCount = inferRelationshipStrandCount(edge, supports, validatedBy);
  const strength = inferRelationshipStrength({ ...edge, relationshipType }, supports, validatedBy);
  const health = inferRelationshipHealth(edge, strength, strandCount);
  const visualForm = inferRelationshipVisualForm(strength, strandCount);
  const strokeWidth = strength === 1 ? 1.8 : strength === 2 ? 2.8 : strength === 3 ? 3.8 : 4.8;
  const dashArray = visualForm === 'string'
    ? [8, 7]
    : (visualForm === 'bundle' ? [12, 6, 4, 6] : []);
  const opacity = health === 'blocked' ? 0.72 : (health === 'healthy' ? 0.96 : 0.88);
  return {
    relationshipType,
    supports,
    validatedBy,
    strandCount,
    strength,
    health,
    visualForm,
    strokeWidth,
    dashArray,
    opacity,
  };
}

export function normalizeRelationshipEdge(edge = {}, { fallbackRelationshipType = 'relates_to' } = {}) {
  if (!edge || typeof edge !== 'object') return null;
  const source = String(edge.source || '').trim();
  const target = String(edge.target || '').trim();
  if (!source || !target) return null;
  const relationshipType = normalizeRelationshipType(edge.relationshipType || edge.relationship_type || edge.type || fallbackRelationshipType);
  const supports = normalizeRelationshipList(edge.supports);
  const validatedBy = normalizeRelationshipList(edge.validatedBy);
  const visual = deriveRelationshipVisual({
    ...edge,
    source,
    target,
    relationshipType,
    supports,
    validatedBy,
  });
  const id = String(edge.id || '').trim() || `${source}__${target}__${relationshipType}`;
  return {
    ...edge,
    id,
    source,
    target,
    relationshipType,
    relationship_type: relationshipType,
    label: String(edge.label || '').trim() || relationshipType.replace(/_/g, ' '),
    supports: visual.supports,
    validatedBy: visual.validatedBy,
    strandCount: visual.strandCount,
    strength: visual.strength,
    health: visual.health,
    visualForm: visual.visualForm,
    lastActive: edge.lastActive || null,
    risk: edge.risk || null,
  };
}

function normalizeGraphEdges(edges = []) {
  return (Array.isArray(edges) ? edges : [])
    .map((edge) => normalizeRelationshipEdge(edge))
    .filter(Boolean);
}

export function buildStarterGraph() {
  return { nodes: [], edges: [] };
}

export function buildGraphBundle(initial = {}) {
  return {
    system: {
      nodes: initial.system?.nodes || [],
      edges: normalizeGraphEdges(initial.system?.edges || []),
    },
    world: {
      nodes: initial.world?.nodes || [],
      edges: normalizeGraphEdges(initial.world?.edges || []),
    },
  };
}

export function normalizeGraphBundle(workspace = {}) {
  const graphs = workspace?.graphs || {};
  const legacyGraph = workspace?.graph || buildStarterGraph();
  return buildGraphBundle({
    system: graphs.system || legacyGraph,
    world: graphs.world || buildStarterGraph(),
  });
}

export function getNodeTypesForLayer(layer = 'system') {
  return layer === 'world' ? WORLD_NODE_TYPES : SYSTEM_NODE_TYPES;
}

export function defaultApprovalPolicy() {
  return {
    'system-structure': 'auto-record',
    'world-structure': 'auto-record',
    'adapter-translation': 'auto-record',
    'code-runtime-mutation': 'risk-gated-review',
  };
}

function normalizeRsgActivityEntries(activity = []) {
  return (Array.isArray(activity) ? activity : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: entry.id || null,
      type: entry.type || 'rsg-skip',
      at: entry.at || null,
      sourceNodeId: entry.sourceNodeId || null,
      sourceNodeLabel: entry.sourceNodeLabel || '',
      summary: entry.summary || '',
      confidence: Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : null,
      generatedCount: Number(entry.generatedCount || 0),
      replacedCount: Number(entry.replacedCount || 0),
      usedFallback: Boolean(entry.usedFallback),
      reason: entry.reason || '',
      trigger: entry.trigger || 'manual',
      generationId: entry.generationId || null,
    }))
    .slice(0, RSG_ACTIVITY_LIMIT);
}

export function createDefaultRsgState() {
  return {
    mode: 'dual-layer',
    worldDomain: 'gameplay-systems',
    approvalPolicy: defaultApprovalPolicy(),
    proposals: [],
    summary: {
      systemStructure: 0,
      worldStructure: 0,
      adapterTranslation: 0,
      codeRuntimeMutation: 0,
    },
    activity: [],
    lastSourceNodeId: null,
    lastGenerationAt: null,
    lastStatus: 'idle',
    lastEvaluatedAt: null,
  };
}

function inferNodeProposalTarget(node, layer = 'system') {
  if (node?.metadata?.proposalTarget && PROPOSAL_TARGETS.includes(node.metadata.proposalTarget)) return node.metadata.proposalTarget;
  if (node?.type === 'adapter') return 'adapter-translation';
  if (layer === 'world') return 'world-structure';
  return 'system-structure';
}

export function proposalRequiresApproval(target, approvalPolicy = defaultApprovalPolicy()) {
  return String(approvalPolicy?.[target] || '').includes('review');
}

export function buildRsgState(workspace = {}) {
  const graphs = normalizeGraphBundle(workspace);
  const persisted = workspace?.rsg || {};
  const base = {
    ...createDefaultRsgState(),
    ...persisted,
    approvalPolicy: {
      ...defaultApprovalPolicy(),
      ...(persisted.approvalPolicy || {}),
    },
    activity: normalizeRsgActivityEntries(persisted.activity),
    lastSourceNodeId: persisted.lastSourceNodeId || null,
    lastGenerationAt: persisted.lastGenerationAt || null,
    lastStatus: persisted.lastStatus || 'idle',
  };
  const graphProposals = GRAPH_LAYERS.flatMap((layer) => (graphs[layer]?.nodes || [])
    .filter((node) => node?.metadata?.proposalTarget || node?.metadata?.labels?.includes('proposal') || node?.type === 'adapter')
    .map((node) => {
      const target = inferNodeProposalTarget(node, layer);
      return {
        id: node.id,
        title: node.content || `${target} proposal`,
        target,
        sourceLayer: layer,
        sourceNodeId: node.id,
        approval: proposalRequiresApproval(target, base.approvalPolicy) ? 'required' : 'auto-record',
        status: 'proposed',
      };
    }));
  const mutationProposals = (workspace?.studio?.teamBoard?.cards || [])
    .filter((card) => card?.executionPackage?.status === 'ready' || card?.status === 'review' || card?.applyStatus === 'queued' || card?.deployStatus === 'queued')
    .map((card) => ({
      id: `mutation_${card.id}`,
      title: card.title || 'Mutation package',
      target: 'code-runtime-mutation',
      sourceLayer: 'system',
      sourceNodeId: card.sourceNodeId || null,
      approval: proposalRequiresApproval('code-runtime-mutation', base.approvalPolicy) ? 'required' : 'auto-record',
      status: card.status === 'review' ? 'awaiting-approval' : 'queued',
    }));
  const proposals = [...graphProposals, ...mutationProposals];
  return {
    ...base,
    proposals,
    summary: {
      systemStructure: proposals.filter((proposal) => proposal.target === 'system-structure').length,
      worldStructure: proposals.filter((proposal) => proposal.target === 'world-structure').length,
      adapterTranslation: proposals.filter((proposal) => proposal.target === 'adapter-translation').length,
      codeRuntimeMutation: proposals.filter((proposal) => proposal.target === 'code-runtime-mutation').length,
    },
    lastEvaluatedAt: new Date().toISOString(),
  };
}

export function createNode({ type = 'text', content = '', position = { x: 0, y: 0 }, metadata = {} } = {}) {
  return {
    id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    content,
    position,
    connections: [],
    metadata,
  };
}

export function createEdge({
  source,
  target,
  relationship_type = 'relates_to',
  relationshipType = relationship_type,
  label = '',
  supports = [],
  validatedBy = [],
  strandCount = null,
  strength = null,
  health = null,
  risk = null,
  lastActive = null,
} = {}) {
  return normalizeRelationshipEdge({
    id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source,
    target,
    relationshipType,
    relationship_type,
    label,
    supports,
    validatedBy,
    strandCount,
    strength,
    health,
    risk,
    lastActive,
  });
}

function mergeRelationshipEdge(existing = {}, incoming = {}) {
  const supports = normalizeRelationshipList([...(existing.supports || []), ...(incoming.supports || [])]);
  const validatedBy = normalizeRelationshipList([...(existing.validatedBy || []), ...(incoming.validatedBy || [])]);
  const relationshipType = existing.relationshipType && existing.relationshipType !== 'relates_to'
    ? existing.relationshipType
    : (incoming.relationshipType || incoming.relationship_type || 'relates_to');
  const merged = normalizeRelationshipEdge({
    ...existing,
    ...incoming,
    relationshipType,
    relationship_type: relationshipType,
    supports,
    validatedBy,
    lastActive: incoming.lastActive || existing.lastActive || null,
    risk: incoming.risk || existing.risk || null,
  });
  return merged || existing;
}

export class GraphEngine {
  constructor(initial = buildStarterGraph()) {
    this.graph = {
      nodes: initial.nodes || [],
      edges: normalizeGraphEdges(initial.edges || []),
    };
  }

  getState() {
    return this.graph;
  }

  setState(next) {
    this.graph = {
      nodes: next.nodes || [],
      edges: normalizeGraphEdges(next.edges || []),
    };
  }

  clear() {
    this.graph = buildStarterGraph();
  }

  addNode(node) {
    this.graph.nodes.push(node);
    return node;
  }

  updateNode(id, patch) {
    const node = this.graph.nodes.find((n) => n.id === id);
    if (!node) return null;
    Object.assign(node, patch);
    return node;
  }

  removeNode(id) {
    this.graph.nodes = this.graph.nodes.filter((node) => node.id !== id);
    this.graph.edges = this.graph.edges.filter((edge) => edge.source !== id && edge.target !== id);
  }

  addEdge(edge) {
    const normalized = normalizeRelationshipEdge(edge);
    if (!normalized || normalized.source === normalized.target) return normalized;
    const existingIndex = this.graph.edges.findIndex((e) => e.source === normalized.source && e.target === normalized.target);
    if (existingIndex >= 0) {
      this.graph.edges[existingIndex] = mergeRelationshipEdge(this.graph.edges[existingIndex], normalized);
      return this.graph.edges[existingIndex];
    }
    this.graph.edges.push(normalized);
    return normalized;
  }

  removeEdge(source, target) {
    this.graph.edges = this.graph.edges.filter((edge) => !(edge.source === source && edge.target === target));
  }
}
