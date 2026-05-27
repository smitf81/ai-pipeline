export const DEFAULT_RULES = [
  'modular architecture',
  'no circular dependencies',
  'stateless services',
];

export class ArchitectureMemory {
  constructor() {
    this.model = {
      system: 'ACE',
      layers: {
        interface: ['Spatial IDE Interface Layer'],
        intelligence: ['Intent Engine', 'Task Planner'],
        execution: ['Code Generator', 'Test Generator'],
      },
      subsystems: [],
      modules: [],
      world: {
        domain: 'gameplay-systems',
        systems: [],
        mechanics: [],
        quests: [],
        items: [],
        constraints: [],
      },
      adapters: [],
      proposals: [],
      rules: [...DEFAULT_RULES],
      versions: [],
    };
  }

  syncFromGraph(graphOrBundle) {
    const graphBundle = graphOrBundle?.system && graphOrBundle?.world
      ? graphOrBundle
      : {
          system: graphOrBundle || { nodes: [], edges: [] },
          world: { nodes: [], edges: [] },
        };
    const systemGraph = graphBundle.system || { nodes: [], edges: [] };
    const worldGraph = graphBundle.world || { nodes: [], edges: [] };
    this.model.subsystems = [...new Set(systemGraph.nodes.filter((n) => n.type === 'module').map((n) => n.content))];
    this.model.modules = [...new Set(systemGraph.nodes.filter((n) => ['module', 'file', 'code', 'service'].includes(n.type)).map((n) => n.content))];
    this.model.world = {
      ...this.model.world,
      systems: [...new Set(worldGraph.nodes.filter((n) => n.type === 'gameplay-system').map((n) => n.content))],
      mechanics: [...new Set(worldGraph.nodes.filter((n) => n.type === 'mechanic').map((n) => n.content))],
      quests: [...new Set(worldGraph.nodes.filter((n) => n.type === 'quest').map((n) => n.content))],
      items: [...new Set(worldGraph.nodes.filter((n) => n.type === 'item').map((n) => n.content))],
      constraints: [...new Set(worldGraph.nodes.filter((n) => n.type === 'world-constraint').map((n) => n.content))],
    };
    this.model.adapters = [...new Set([
      ...systemGraph.nodes.filter((n) => n.type === 'adapter').map((n) => n.content),
      ...worldGraph.nodes.filter((n) => n.type === 'adapter').map((n) => n.content),
    ])];
    this.model.proposals = [...new Set([
      ...systemGraph.nodes.filter((n) => n.metadata?.proposalTarget).map((n) => `${n.metadata.proposalTarget}: ${n.content}`),
      ...worldGraph.nodes.filter((n) => n.metadata?.proposalTarget).map((n) => `${n.metadata.proposalTarget}: ${n.content}`),
    ])];
  }

  validate(graphOrBundle) {
    const graphBundle = graphOrBundle?.system && graphOrBundle?.world
      ? graphOrBundle
      : {
          system: graphOrBundle || { nodes: [], edges: [] },
          world: { nodes: [], edges: [] },
        };
    const errors = [];
    if (this.model.rules.includes('no circular dependencies') && hasCycle(graphBundle.system || { nodes: [], edges: [] })) {
      errors.push('Circular dependency detected in system graph.');
    }
    if (this.model.rules.includes('no circular dependencies') && hasCycle(graphBundle.world || { nodes: [], edges: [] })) {
      errors.push('Circular dependency detected in world graph.');
    }
    return { valid: errors.length === 0, errors };
  }

  snapshot(label, diff = {}) {
    this.model.versions.push({
      version: `v${this.model.versions.length + 1}`,
      label,
      timestamp: new Date().toISOString(),
      diff,
    });
  }
}

function hasCycle(graph) {
  const adj = new Map();
  graph.nodes.forEach((n) => adj.set(n.id, []));
  graph.edges.forEach((e) => {
    if (adj.has(e.source)) adj.get(e.source).push(e.target);
  });

  const visiting = new Set();
  const visited = new Set();

  function dfs(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adj.get(node) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  return graph.nodes.some((n) => dfs(n.id));
}
