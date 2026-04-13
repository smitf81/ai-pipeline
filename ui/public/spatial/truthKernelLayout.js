import { resolveAnchoredTruthKernelPosition } from './spatialSeamContract.js';

function stableHash(input = '') {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeText(value = '') {
  return String(value || '').trim();
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

function resolveKindBand(kind = 'artifact') {
  if (kind === 'input') {
    return { min: 0.08, max: 0.3, center: 0.19 };
  }
  if (kind === 'execution') {
    return { min: 0.36, max: 0.64, center: 0.5 };
  }
  return { min: 0.7, max: 0.92, center: 0.81 };
}

function resolveSemanticClusterKey(node = {}, fallback = '') {
  const lane = normalizeText(node?.lane);
  const owner = normalizeText(node?.owner || node?.recommendedOwner);
  const targetType = normalizeText(node?.targetType);
  const sourceType = normalizeText(node?.sourceType)
    .split(/[/:]/)
    .filter(Boolean)
    .at(-1) || '';
  const classification = normalizeText(node?.classification);
  return [
    normalizeText(node?.kind) || 'artifact',
    lane || owner || sourceType || targetType || classification || fallback || 'ungrouped',
  ].join(':');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function buildTruthKernelLayout(nodes = [], options = {}) {
  const width = options.width || 1600;
  const height = options.height || 920;
  const horizontalPadding = options.horizontalPadding || 132;
  const verticalPadding = options.verticalPadding || 96;
  const sourceAnchors = options.sourceAnchors instanceof Map ? options.sourceAnchors : new Map();
  const anchoredNodeIds = new Set();
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
  const componentByNodeId = new Map();
  sortedComponents.forEach((component) => {
    const key = componentKey(component, nodeMap);
    component.forEach((id) => componentByNodeId.set(id, key));
  });

  const clusterByNodeId = new Map();
  const clustersByKind = new Map([
    ['input', new Map()],
    ['execution', new Map()],
    ['artifact', new Map()],
  ]);
  orderedNodes.forEach((node) => {
    const componentGroup = componentByNodeId.get(node.id) || node.id;
    const clusterKey = resolveSemanticClusterKey(node, componentGroup);
    clusterByNodeId.set(node.id, clusterKey);
    const kindMap = clustersByKind.get(node.kind) || clustersByKind.get('artifact');
    if (!kindMap.has(clusterKey)) kindMap.set(clusterKey, []);
    kindMap.get(clusterKey).push(node.id);
  });

  const clusterCenters = new Map();
  [...clustersByKind.entries()].forEach(([kind, clusterMap]) => {
    const band = resolveKindBand(kind);
    const entries = [...clusterMap.keys()].sort((left, right) => left.localeCompare(right));
    entries.forEach((clusterKey, index) => {
      const ratio = entries.length <= 1 ? 0.5 : index / (entries.length - 1);
      const normalizedY = band.min + ((band.max - band.min) * ratio);
      clusterCenters.set(
        clusterKey,
        verticalPadding + (normalizedY * Math.max(1, height - (verticalPadding * 2))),
      );
    });
  });

  const timeBucketMap = new Map();
  orderedNodes.forEach((node) => {
    const normalizedTime = (node.timestamp - minTimestamp) / timeSpan;
    const bucketId = `${node.kind}:${Math.round(normalizedTime * 10)}:${clusterByNodeId.get(node.id) || 'cluster'}`;
    if (!timeBucketMap.has(bucketId)) timeBucketMap.set(bucketId, []);
    timeBucketMap.get(bucketId).push(node.id);
  });

  const positions = new Map();
  orderedNodes.forEach((node, index) => {
    const anchoredPosition = resolveAnchoredTruthKernelPosition(node, sourceAnchors, { width, height });
    if (anchoredPosition) {
      anchoredNodeIds.add(node.id);
      positions.set(node.id, {
        x: anchoredPosition.x,
        y: anchoredPosition.y,
      });
      return;
    }
    const normalizedTime = (node.timestamp - minTimestamp) / timeSpan;
    const component = sortedComponents.find((entry) => entry.includes(node.id)) || [node.id];
    const componentKeyValue = componentByNodeId.get(node.id) || componentKey(component, nodeMap);
    const clusterKey = clusterByNodeId.get(node.id) || resolveSemanticClusterKey(node, componentKeyValue);
    const kindBand = resolveKindBand(node.kind);
    const bucketId = `${node.kind}:${Math.round(normalizedTime * 10)}:${clusterKey}`;
    const bucket = timeBucketMap.get(bucketId) || [node.id];
    const bucketOrdinal = bucket.indexOf(node.id);
    const componentOrdinal = component.indexOf(node.id);
    const componentBias = (componentOrdinal - ((component.length - 1) / 2)) * 18;
    const bucketBias = (bucketOrdinal - ((bucket.length - 1) / 2)) * 26;
    const hashBias = ((stableHash(`${node.id}:${index}`) % 17) - 8) * 4;
    const statusBias = node.status === 'blocked'
      ? -18
      : node.status === 'orphaned'
        ? 22
        : node.status === 'degraded'
          ? 8
          : 0;
    const anchorBias = node.kind === 'input'
      ? -18
      : node.kind === 'artifact'
        ? 18
        : 0;
    const baseX = horizontalPadding
      + normalizedTime * Math.max(1, width - (horizontalPadding * 2))
      + bucketBias
      + ((stableHash(clusterKey) % 9) - 4) * 3;
    const componentCenterY = clusterCenters.get(clusterKey)
      || (verticalPadding + (kindBand.center * Math.max(1, height - (verticalPadding * 2))));
    positions.set(node.id, {
      x: clamp(baseX, horizontalPadding, width - horizontalPadding),
      y: clamp(componentCenterY + anchorBias + statusBias + hashBias + componentBias, verticalPadding, height - verticalPadding),
    });
  });

  for (let iteration = 0; iteration < 10; iteration += 1) {
    orderedNodes.forEach((node) => {
      if (anchoredNodeIds.has(node.id)) return;
      const current = positions.get(node.id);
      if (!current) return;
      const neighbors = [...(node.parents || []), ...(node.children || [])]
        .map((neighborId) => positions.get(neighborId))
        .filter(Boolean);
      if (!neighbors.length) return;
      const targetY = neighbors.reduce((sum, neighbor) => sum + neighbor.y, 0) / neighbors.length;
      current.y = clamp((current.y * 0.84) + (targetY * 0.16), verticalPadding, height - verticalPadding);
    });

    for (let leftIndex = 0; leftIndex < orderedNodes.length; leftIndex += 1) {
      const leftNode = orderedNodes[leftIndex];
      const left = positions.get(leftNode.id);
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < orderedNodes.length; rightIndex += 1) {
        const rightNode = orderedNodes[rightIndex];
        const right = positions.get(rightNode.id);
        if (!right) continue;
        if (anchoredNodeIds.has(leftNode.id) && anchoredNodeIds.has(rightNode.id)) continue;
        const deltaX = right.x - left.x;
        const deltaY = right.y - left.y;
        const distance = Math.hypot(deltaX, deltaY) || 0.001;
        const minDistance = leftNode.kind === rightNode.kind ? 40 : 34;
        if (distance >= minDistance) continue;
        const overlap = (minDistance - distance) / minDistance;
        const xPush = ((Math.abs(deltaX) < 22 ? 16 : 7) * overlap) * (deltaX >= 0 ? 1 : -1);
        const yPush = ((Math.abs(deltaY) < 24 ? 18 : 8) * overlap) * (deltaY >= 0 ? 1 : -1);
        if (anchoredNodeIds.has(leftNode.id)) {
          right.x = clamp(right.x + (xPush * 2), horizontalPadding, width - horizontalPadding);
          right.y = clamp(right.y + (yPush * 2), verticalPadding, height - verticalPadding);
          continue;
        }
        if (anchoredNodeIds.has(rightNode.id)) {
          left.x = clamp(left.x - (xPush * 2), horizontalPadding, width - horizontalPadding);
          left.y = clamp(left.y - (yPush * 2), verticalPadding, height - verticalPadding);
          continue;
        }
        left.x = clamp(left.x - xPush, horizontalPadding, width - horizontalPadding);
        right.x = clamp(right.x + xPush, horizontalPadding, width - horizontalPadding);
        left.y = clamp(left.y - yPush, verticalPadding, height - verticalPadding);
        right.y = clamp(right.y + yPush, verticalPadding, height - verticalPadding);
      }
    }
  }

  return {
    positions,
    bounds: { width, height },
  };
}
