function stableHash(input = '') {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function componentKey(component = [], nodeMap = new Map()) {
  return component
    .map((id) => nodeMap.get(id))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
      if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
      return left.id.localeCompare(right.id);
    })[0]?.id || component[0] || '';
}

function buildComponents(nodes = []) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set();
  const components = [];
  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const queue = [node.id];
    const component = [];
    visited.add(node.id);
    while (queue.length) {
      const currentId = queue.shift();
      component.push(currentId);
      const current = nodeMap.get(currentId);
      const neighbors = [...(current?.parents || []), ...(current?.children || [])];
      neighbors.forEach((neighborId) => {
        if (!nodeMap.has(neighborId) || visited.has(neighborId)) return;
        visited.add(neighborId);
        queue.push(neighborId);
      });
    }
    components.push(component.sort((left, right) => left.localeCompare(right)));
  });
  return { components, nodeMap };
}

export function buildTruthKernelLayout(nodes = [], options = {}) {
  const width = options.width || 1600;
  const height = options.height || 920;
  const horizontalPadding = options.horizontalPadding || 96;
  const verticalPadding = options.verticalPadding || 72;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { positions: new Map(), bounds: { width, height } };
  }

  const orderedNodes = [...nodes].sort((left, right) => {
    if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
    return left.id.localeCompare(right.id);
  });
  const minTimestamp = orderedNodes[0].timestamp;
  const maxTimestamp = orderedNodes[orderedNodes.length - 1].timestamp;
  const timeSpan = Math.max(1, maxTimestamp - minTimestamp);
  const { components, nodeMap } = buildComponents(orderedNodes);
  const sortedComponents = [...components].sort((left, right) => componentKey(left, nodeMap).localeCompare(componentKey(right, nodeMap)));
  const componentOffsets = new Map();
  sortedComponents.forEach((component, index) => {
    const key = componentKey(component, nodeMap);
    const spread = sortedComponents.length <= 1 ? 0.5 : index / (sortedComponents.length - 1);
    componentOffsets.set(key, verticalPadding + spread * Math.max(1, height - verticalPadding * 2));
  });

  const positions = new Map();
  orderedNodes.forEach((node, index) => {
    const normalizedTime = (node.timestamp - minTimestamp) / timeSpan;
    const baseX = horizontalPadding + normalizedTime * Math.max(1, width - horizontalPadding * 2);
    const component = sortedComponents.find((entry) => entry.includes(node.id)) || [node.id];
    const key = componentKey(component, nodeMap);
    const componentCenterY = componentOffsets.get(key) || (height / 2);
    const ordinal = component.indexOf(node.id);
    const anchorBias = node.kind === 'input' ? -24 : node.kind === 'artifact' ? 20 : 0;
    const hashBias = ((stableHash(node.id) % 29) - 14) * 2;
    const spreadBias = (ordinal - ((component.length - 1) / 2)) * 22;
    positions.set(node.id, {
      x: baseX,
      y: Math.max(verticalPadding, Math.min(height - verticalPadding, componentCenterY + anchorBias + hashBias + spreadBias)),
    });
  });

  for (let iteration = 0; iteration < 6; iteration += 1) {
    orderedNodes.forEach((node) => {
      const current = positions.get(node.id);
      if (!current) return;
      const neighbors = [...(node.parents || []), ...(node.children || [])]
        .map((neighborId) => positions.get(neighborId))
        .filter(Boolean);
      if (!neighbors.length) return;
      const targetY = neighbors.reduce((sum, neighbor) => sum + neighbor.y, 0) / neighbors.length;
      current.y = Math.max(verticalPadding, Math.min(height - verticalPadding, current.y * 0.82 + targetY * 0.18));
    });
  }

  return {
    positions,
    bounds: { width, height },
  };
}
