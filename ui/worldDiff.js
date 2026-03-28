const { isWorldScaffold } = require('./worldScaffold');

function cloneJsonValue(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function buildRecentWorldChangeId(at = new Date().toISOString()) {
  return `world_change_${String(at).replace(/[^0-9]/g, '').slice(0, 17)}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildEdgeKey(edge = {}) {
  const source = String(edge?.source || '').trim();
  const target = String(edge?.target || '').trim();
  return `${source}->${target}`;
}

function pluralize(word, count) {
  return Number(count) === 1 ? word : `${word}s`;
}

function getNodeLabel(node = {}) {
  const scaffoldSummary = node?.metadata?.scaffold?.summary;
  const content = String(node?.content || '').trim();
  return String(scaffoldSummary || content || node?.id || 'world node').trim();
}

function normalizeCellCoordinate(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function createCellRef(x = 0, y = 0, z = 0) {
  return {
    x: normalizeCellCoordinate(x),
    y: normalizeCellCoordinate(y),
    z: normalizeCellCoordinate(z),
  };
}

function getScaffoldDimensions(scaffold = {}) {
  return {
    width: Math.max(0, normalizeCellCoordinate(scaffold?.dimensions?.width || 0)),
    height: Math.max(0, normalizeCellCoordinate(scaffold?.dimensions?.height || 0)),
  };
}

function getScaffoldOrigin(scaffold = {}) {
  return {
    x: normalizeCellCoordinate(scaffold?.origin?.x || 0),
    y: normalizeCellCoordinate(scaffold?.origin?.y || 0),
    z: normalizeCellCoordinate(scaffold?.origin?.z || 0),
  };
}

function getScaffoldLayerValues(scaffold = {}) {
  const origin = getScaffoldOrigin(scaffold);
  const layerKey = String(origin.z);
  return scaffold?.field?.layers?.[layerKey]?.values
    || scaffold?.field?.layers?.['0']?.values
    || [];
}

function buildScaffoldCellDiff(previousScaffold = null, nextScaffold = {}) {
  const nextDimensions = getScaffoldDimensions(nextScaffold);
  const previousDimensions = getScaffoldDimensions(previousScaffold || {});
  const nextOrigin = getScaffoldOrigin(nextScaffold);
  const nextValues = getScaffoldLayerValues(nextScaffold);
  const previousValues = getScaffoldLayerValues(previousScaffold || {});
  const addedCells = [];
  const modifiedCells = [];
  const visualDefaultsChanged = Boolean(previousScaffold)
    && (
      String(previousScaffold?.surface || 'ground') !== String(nextScaffold?.surface || 'ground')
      || String(previousScaffold?.tileType || 'grass') !== String(nextScaffold?.tileType || 'grass')
    );

  for (let y = 0; y < nextDimensions.height; y += 1) {
    for (let x = 0; x < nextDimensions.width; x += 1) {
      const nextValue = nextValues?.[y]?.[x] ?? nextScaffold?.tileType ?? 'grass';
      const previousInBounds = Boolean(previousScaffold)
        && y < previousDimensions.height
        && x < previousDimensions.width;
      if (!previousInBounds) {
        addedCells.push(createCellRef(x, y, nextOrigin.z));
        continue;
      }
      const previousValue = previousValues?.[y]?.[x] ?? previousScaffold?.tileType ?? 'grass';
      if (visualDefaultsChanged || previousValue !== nextValue) {
        modifiedCells.push(createCellRef(x, y, nextOrigin.z));
      }
    }
  }

  return {
    origin: nextOrigin,
    region: {
      x: nextOrigin.x,
      y: nextOrigin.y,
      z: nextOrigin.z,
      width: nextDimensions.width,
      height: nextDimensions.height,
    },
    addedCells,
    modifiedCells,
  };
}

function buildScaffoldItem(changeType = 'modified', node = {}, previousNode = null) {
  const scaffold = node?.metadata?.scaffold || {};
  const previousScaffold = previousNode?.metadata?.scaffold || null;
  const cellDiff = buildScaffoldCellDiff(previousScaffold, scaffold);
  const counts = {
    addedCells: cellDiff.addedCells.length,
    modifiedCells: cellDiff.modifiedCells.length,
  };
  const label = changeType === 'added' ? 'World scaffold created' : 'World scaffold updated';
  const detailParts = [String(scaffold.summary || getNodeLabel(node)).trim()];
  if (counts.addedCells) {
    detailParts.push(`${counts.addedCells} ${pluralize('cell', counts.addedCells)} added`);
  }
  if (counts.modifiedCells) {
    detailParts.push(`${counts.modifiedCells} ${pluralize('cell', counts.modifiedCells)} modified`);
  }
  if (!counts.addedCells && !counts.modifiedCells) {
    detailParts.push('scaffold node modified');
  }
  return {
    id: `scaffold:${node?.id || 'world-scaffold'}`,
    kind: 'scaffold',
    changeType,
    layer: 'world',
    nodeId: node?.id || null,
    label,
    detail: detailParts.join(' | '),
    summary: String(scaffold.summary || getNodeLabel(node)).trim(),
    dimensions: cloneJsonValue(scaffold.dimensions, { width: 0, height: 0 }),
    totalCells: Number(scaffold.totalCells || 0),
    tileType: String(scaffold.tileType || 'grass'),
    surface: String(scaffold.surface || 'ground'),
    origin: cellDiff.origin,
    region: cellDiff.region,
    counts,
    addedCells: cellDiff.addedCells,
    modifiedCells: cellDiff.modifiedCells,
  };
}

function buildNodeItem(changeType = 'modified', node = {}) {
  return {
    id: `node:${node?.id || 'world-node'}`,
    kind: 'node',
    changeType,
    layer: 'world',
    nodeId: node?.id || null,
    label: changeType === 'added' ? 'World node added' : 'World node modified',
    detail: `${String(node?.type || 'node')} | ${getNodeLabel(node)}`,
    nodeType: String(node?.type || 'node'),
    nodeLabel: getNodeLabel(node),
  };
}

function buildEdgeItem(edge = {}) {
  return {
    id: `edge:${buildEdgeKey(edge)}`,
    kind: 'edge',
    changeType: 'added',
    layer: 'world',
    source: String(edge?.source || '').trim() || null,
    target: String(edge?.target || '').trim() || null,
    relationshipType: String(edge?.relationship_type || edge?.type || 'edge'),
    label: 'World edge added',
    detail: `${String(edge?.source || '?')} -> ${String(edge?.target || '?')}`,
  };
}

function summarizeRecentWorldChange(items = [], counts = {}) {
  const scaffoldItem = items.find((item) => item?.kind === 'scaffold');
  if (scaffoldItem) {
    const summaryParts = [
      scaffoldItem.changeType === 'added' ? 'World scaffold created' : 'World scaffold updated',
      scaffoldItem.summary,
    ];
    if (scaffoldItem.counts?.addedCells) {
      summaryParts.push(`${scaffoldItem.counts.addedCells} ${pluralize('cell', scaffoldItem.counts.addedCells)} added`);
    }
    if (scaffoldItem.counts?.modifiedCells) {
      summaryParts.push(`${scaffoldItem.counts.modifiedCells} ${pluralize('cell', scaffoldItem.counts.modifiedCells)} modified`);
    }
    return summaryParts.join(' | ');
  }

  const parts = [];
  if (counts.addedNodes) parts.push(`${counts.addedNodes} world ${pluralize('node', counts.addedNodes)} added`);
  if (counts.modifiedNodes) parts.push(`${counts.modifiedNodes} world ${pluralize('node', counts.modifiedNodes)} modified`);
  if (counts.addedEdges) parts.push(`${counts.addedEdges} ${pluralize('edge', counts.addedEdges)} added`);
  return parts.join(' | ');
}

function deriveRecentWorldChange({
  previousGraphs = {},
  nextGraphs = {},
  results = [],
  status = 'applied',
  changedLayers = [],
  at = new Date().toISOString(),
} = {}) {
  const nextWorld = nextGraphs?.world || { nodes: [], edges: [] };
  const previousWorld = previousGraphs?.world || { nodes: [], edges: [] };
  const worldResults = (Array.isArray(results) ? results : [])
    .filter((entry) => entry?.layer === 'world' && entry?.status === 'auto-applied');
  if (!worldResults.length || !Array.isArray(changedLayers) || !changedLayers.includes('world')) {
    return null;
  }

  const items = [];
  worldResults.forEach((entry) => {
    const mutation = entry?.mutation || {};
    if (mutation.type === 'create_node') {
      const nodeId = mutation?.node?.id;
      const nextNode = nextWorld.nodes.find((node) => node?.id === nodeId) || mutation?.node || null;
      if (!nextNode) return;
      items.push(
        isWorldScaffold(nextNode?.metadata?.scaffold)
          ? buildScaffoldItem('added', nextNode, null)
          : buildNodeItem('added', nextNode),
      );
      return;
    }

    if (mutation.type === 'modify_node') {
      const nodeId = mutation?.id;
      const previousNode = previousWorld.nodes.find((node) => node?.id === nodeId) || null;
      const nextNode = nextWorld.nodes.find((node) => node?.id === nodeId) || null;
      if (!nextNode) return;
      items.push(
        (isWorldScaffold(nextNode?.metadata?.scaffold) || isWorldScaffold(previousNode?.metadata?.scaffold))
          ? buildScaffoldItem('modified', nextNode, previousNode)
          : buildNodeItem('modified', nextNode),
      );
      return;
    }

    if (mutation.type === 'create_edge') {
      const source = mutation?.edge?.source;
      const target = mutation?.edge?.target;
      const edge = nextWorld.edges.find((candidate) => candidate?.source === source && candidate?.target === target)
        || mutation?.edge
        || null;
      if (!edge) return;
      items.push(buildEdgeItem(edge));
    }
  });

  if (!items.length) {
    return null;
  }

  const counts = items.reduce((totals, item) => {
    if (item.kind === 'scaffold' || item.kind === 'node') {
      if (item.changeType === 'added') totals.addedNodes += 1;
      if (item.changeType === 'modified') totals.modifiedNodes += 1;
    }
    if (item.kind === 'edge' && item.changeType === 'added') {
      totals.addedEdges += 1;
    }
    if (item.kind === 'scaffold') {
      totals.addedCells += Number(item?.counts?.addedCells || 0);
      totals.modifiedCells += Number(item?.counts?.modifiedCells || 0);
    }
    return totals;
  }, {
    addedNodes: 0,
    modifiedNodes: 0,
    addedEdges: 0,
    addedCells: 0,
    modifiedCells: 0,
  });

  const highlights = {
    nodeIds: [...new Set(items.map((item) => item?.nodeId).filter(Boolean))],
    edgeKeys: [...new Set(items.filter((item) => item?.kind === 'edge').map((item) => buildEdgeKey(item)).filter(Boolean))],
  };

  return {
    id: buildRecentWorldChangeId(at),
    at,
    scope: 'session-local',
    status,
    summary: summarizeRecentWorldChange(items, counts),
    changedLayers: ['world'],
    counts,
    highlights,
    items,
  };
}

module.exports = {
  buildEdgeKey,
  deriveRecentWorldChange,
};
