export const NODE_TYPES = ['text', 'task', 'module', 'file', 'constraint'];

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

export function buildStarterGraph() {
  return { nodes: [], edges: [] };
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
