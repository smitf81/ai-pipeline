export const GRAPH_LAYERS = ['system', 'world'];
export const PROPOSAL_TARGETS = ['system-structure', 'world-structure', 'adapter-translation', 'code-runtime-mutation'];
export const SYSTEM_NODE_TYPES = ['text', 'task', 'module', 'file', 'constraint', 'adapter'];
export const WORLD_NODE_TYPES = ['gameplay-system', 'mechanic', 'quest', 'item', 'world-constraint', 'adapter'];
export const NODE_TYPES = [...new Set([...SYSTEM_NODE_TYPES, ...WORLD_NODE_TYPES])];
const RSG_ACTIVITY_LIMIT = 24;

export function buildStarterGraph() {
  return { nodes: [], edges: [] };
}

export function buildGraphBundle(initial = {}) {
  return {
    system: {
      nodes: initial.system?.nodes || [],
      edges: initial.system?.edges || [],
    },
    world: {
      nodes: initial.world?.nodes || [],
      edges: initial.world?.edges || [],
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

export function createEdge({ source, target, relationship_type = 'relates_to' }) {
  return { source, target, relationship_type };
}

export class GraphEngine {
  constructor(initial = buildStarterGraph()) {
    this.graph = {
      nodes: initial.nodes || [],
      edges: initial.edges || [],
    };
  }

  getState() {
    return this.graph;
  }

  setState(next) {
    this.graph = {
      nodes: next.nodes || [],
      edges: next.edges || [],
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
    if (edge.source === edge.target) return edge;
    if (this.graph.edges.some((e) => e.source === edge.source && e.target === edge.target)) return edge;
    this.graph.edges.push(edge);
    return edge;
  }

  removeEdge(source, target) {
    this.graph.edges = this.graph.edges.filter((edge) => !(edge.source === source && edge.target === target));
  }
}
