function buildStarterGraph() {
  return { nodes: [], edges: [] };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeGraphBundle(workspace = {}) {
  const graphs = workspace?.graphs || {};
  const legacyGraph = workspace?.graph || buildStarterGraph();
  return {
    system: {
      nodes: Array.isArray(graphs?.system?.nodes) ? asArray(graphs.system.nodes) : asArray(legacyGraph?.nodes),
      edges: Array.isArray(graphs?.system?.edges) ? asArray(graphs.system.edges) : asArray(legacyGraph?.edges),
    },
    world: {
      nodes: Array.isArray(graphs?.world?.nodes) ? asArray(graphs.world.nodes) : [],
      edges: Array.isArray(graphs?.world?.edges) ? asArray(graphs.world.edges) : [],
    },
  };
}

function getGraphLayers(graphBundleOrWorkspace = {}) {
  if (graphBundleOrWorkspace?.system || graphBundleOrWorkspace?.world) {
    return {
      system: {
        nodes: asArray(graphBundleOrWorkspace?.system?.nodes),
        edges: asArray(graphBundleOrWorkspace?.system?.edges),
      },
      world: {
        nodes: asArray(graphBundleOrWorkspace?.world?.nodes),
        edges: asArray(graphBundleOrWorkspace?.world?.edges),
      },
    };
  }
  return normalizeGraphBundle(graphBundleOrWorkspace);
}

function uniqueNodes(nodes = []) {
  const seen = new Set();
  return nodes.filter((node) => {
    if (!node || typeof node !== 'object') return false;
    const key = node.id || JSON.stringify(node);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findAllNodes(graphBundleOrWorkspace = {}) {
  const graphs = getGraphLayers(graphBundleOrWorkspace);
  return uniqueNodes([
    ...asArray(graphs.system?.nodes),
    ...asArray(graphs.world?.nodes),
  ]);
}

function getNodeById(graphBundleOrWorkspace = {}, nodeId = '') {
  const id = String(nodeId || '').trim();
  if (!id) return null;
  return findAllNodes(graphBundleOrWorkspace).find((node) => String(node?.id || '') === id) || null;
}

function findNodesByType(graphBundleOrWorkspace = {}, types = []) {
  const typeSet = new Set((Array.isArray(types) ? types : [types]).map((type) => String(type || '').trim()).filter(Boolean));
  if (!typeSet.size) return [];
  return findAllNodes(graphBundleOrWorkspace).filter((node) => typeSet.has(String(node?.type || '').trim()));
}

function nodeHasTag(node, tag) {
  const needle = String(tag || '').trim().toLowerCase();
  if (!needle) return false;
  const metadata = node?.metadata || {};
  const tags = [
    ...(Array.isArray(metadata.tags) ? metadata.tags : []),
    ...(Array.isArray(metadata.labels) ? metadata.labels : []),
    metadata.tag,
    metadata.label,
    metadata.role,
    metadata.agentId,
  ];
  return tags.map((value) => String(value || '').trim().toLowerCase()).includes(needle);
}

function findNodesByTag(graphBundleOrWorkspace = {}, tag = '') {
  const needle = String(tag || '').trim();
  if (!needle) return [];
  return findAllNodes(graphBundleOrWorkspace).filter((node) => nodeHasTag(node, needle));
}

function getRelatedNodes(graphBundleOrWorkspace = {}, nodeId = '', options = {}) {
  const graphs = getGraphLayers(graphBundleOrWorkspace);
  const id = String(nodeId || '').trim();
  if (!id) return [];
  const direction = String(options?.direction || 'both').trim();
  const includeSelf = Boolean(options?.includeSelf);
  const relatedIds = new Set();
  const addNeighbor = (neighborId) => {
    const value = String(neighborId || '').trim();
    if (value) relatedIds.add(value);
  };
  ['system', 'world'].forEach((layer) => {
    asArray(graphs[layer]?.edges).forEach((edge) => {
      const source = String(edge?.source || '').trim();
      const target = String(edge?.target || '').trim();
      if (direction !== 'incoming' && source === id) addNeighbor(target);
      if (direction !== 'outgoing' && target === id) addNeighbor(source);
    });
  });
  if (includeSelf) addNeighbor(id);
  return findAllNodes(graphBundleOrWorkspace).filter((node) => relatedIds.has(String(node?.id || '').trim()));
}

function getContextManagerNode(graphBundleOrWorkspace = {}) {
  return findAllNodes(graphBundleOrWorkspace).find((node) => {
    const metadata = node?.metadata || {};
    return metadata.agentId === 'context-manager' || metadata.role === 'context';
  }) || null;
}

module.exports = {
  buildStarterGraph,
  normalizeGraphBundle,
  getNodeById,
  findNodesByType,
  findNodesByTag,
  getRelatedNodes,
  getContextManagerNode,
};
