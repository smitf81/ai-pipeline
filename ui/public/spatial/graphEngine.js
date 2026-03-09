export const NODE_TYPES = ['text', 'task', 'module', 'code', 'file'];

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

export function createEdge({ source, target, relationship_type = 'depends_on' }) {
  return { source, target, relationship_type };
}

export function buildStarterGraph() {
  const root = createNode({ type: 'task', content: 'Make backend intent extractor', position: { x: 120, y: 120 } });
  const module = createNode({ type: 'module', content: 'intent_engine', position: { x: 420, y: 220 }, metadata: { subcomponents: ['parser', 'classifier'], expanded: false, code: '// intent engine module' } });
  const file = createNode({ type: 'file', content: 'src/intent_classifier.py', position: { x: 760, y: 220 } });
  const edges = [
    createEdge({ source: root.id, target: module.id }),
    createEdge({ source: module.id, target: file.id, relationship_type: 'implements' }),
  ];
  return { nodes: [root, module, file], edges };
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

  addEdge(edge) {
    if (this.graph.edges.some((e) => e.source === edge.source && e.target === edge.target)) return edge;
    this.graph.edges.push(edge);
    return edge;
  }
}
