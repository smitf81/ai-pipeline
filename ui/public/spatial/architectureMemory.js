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
      rules: [...DEFAULT_RULES],
      versions: [],
    };
  }

  syncFromGraph(graph) {
    this.model.subsystems = [...new Set(graph.nodes.filter((n) => n.type === 'module').map((n) => n.content))];
    this.model.modules = [...new Set(graph.nodes.filter((n) => ['module', 'file', 'code', 'service'].includes(n.type)).map((n) => n.content))];
  }

  validate(graph) {
    const errors = [];
    if (this.model.rules.includes('no circular dependencies') && hasCycle(graph)) {
      errors.push('Circular dependency detected in task graph.');
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
