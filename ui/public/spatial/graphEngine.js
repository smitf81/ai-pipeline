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
  const prompt = createNode({ type: 'text', content: 'What are we building?', position: { x: 160, y: 120 } });
  const task = createNode({ type: 'task', content: 'Sketch first architecture pass', position: { x: 480, y: 220 } });
  const module = createNode({ type: 'module', content: 'workspace canvas layer', position: { x: 820, y: 180 } });
  const rule = createNode({ type: 'constraint', content: 'Keep UI minimal and direct', position: { x: 520, y: 420 } });
  const edges = [
    createEdge({ source: prompt.id, target: task.id }),
    createEdge({ source: task.id, target: module.id, relationship_type: 'drives' }),
    createEdge({ source: rule.id, target: module.id, relationship_type: 'constrains' }),
  ];
  return { nodes: [prompt, task, module, rule], edges };
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
