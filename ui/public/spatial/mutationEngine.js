import { createNode, createEdge } from './graphEngine.js';

export class MutationEngine {
  constructor(graphEngine) {
    this.graphEngine = graphEngine;
  }

  buildMutationRequestFromIntent(parentNode, decomposition) {
    const mutations = [];
    decomposition.tasks.forEach((task, idx) => {
      const newNode = createNode({
        type: 'task',
        content: task,
        position: { x: parentNode.position.x + 280, y: parentNode.position.y + idx * 120 },
      });
      mutations.push({ type: 'create_node', node: newNode });
      mutations.push({ type: 'create_edge', edge: createEdge({ source: parentNode.id, target: newNode.id }) });
    });
    return mutations;
  }

  applyMutations(mutations) {
    for (const m of mutations) {
      if (m.type === 'create_node') this.graphEngine.addNode(m.node);
      if (m.type === 'modify_node') this.graphEngine.updateNode(m.id, m.patch);
      if (m.type === 'create_edge') this.graphEngine.addEdge(m.edge);
    }
  }
}
