const STATUS_COLORS = {
  healthy: '#f6f7fb',
  degraded: '#ffbf5c',
  blocked: '#ff6a5d',
  informational: '#63a8ff',
  orphaned: '#6a7284',
};

export function truthKernelNodeRadius(node = {}) {
  return 3.8 + ((Number(node?.weight) || 0) * 3.2);
}

export function truthKernelRingWidth(node = {}) {
  if (!node?.confidenceAvailable) return 1.2;
  return 1.2 + ((Number(node?.confidence) || 0) * 1.8);
}

function resolveTruthKernelDots(truthKernel = {}, layout = null) {
  const directDots = Array.isArray(truthKernel?.dots) ? truthKernel.dots : [];
  if (directDots.length && typeof directDots[0]?.x === 'number' && typeof directDots[0]?.y === 'number') {
    return directDots;
  }
  const nodes = Array.isArray(truthKernel?.nodes) ? truthKernel.nodes : directDots;
  const positions = layout?.positions || new Map();
  return nodes
    .map((node) => {
      const point = positions.get(node.id);
      if (!point) return null;
      return {
        ...node,
        x: point.x,
        y: point.y,
      };
    })
    .filter(Boolean);
}

export function hitTestTruthKernelNode(point = null, truthKernel = {}, layout = null) {
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return null;
  const nodes = resolveTruthKernelDots(truthKernel, layout);
  let selected = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  nodes.forEach((node) => {
    const radius = Math.max(6, truthKernelNodeRadius(node) + 4);
    const distance = Math.hypot(point.x - node.x, point.y - node.y);
    if (distance <= radius && distance < selectedDistance) {
      selected = node;
      selectedDistance = distance;
    }
  });
  return selected;
}

export function drawTruthKernelScene(canvas, truthKernel, layout, options = {}) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width || canvas.clientWidth || canvas.width || options.width || 1600;
  const height = rect.height || canvas.clientHeight || canvas.height || options.height || 920;
  const scaledWidth = Math.max(1, Math.round(width * dpr));
  const scaledHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const nodes = resolveTruthKernelDots(truthKernel, layout);
  const selectedNodeId = String(options?.selectedNodeId || '').trim();
  nodes.forEach((node) => {
    const radius = truthKernelNodeRadius(node);
    ctx.beginPath();
    ctx.fillStyle = STATUS_COLORS[node.status] || STATUS_COLORS.informational;
    ctx.globalAlpha = node.id === selectedNodeId ? 0.34 : 0.18;
    ctx.arc(node.x, node.y, radius + 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = STATUS_COLORS[node.status] || STATUS_COLORS.informational;
    ctx.globalAlpha = node?.confidenceAvailable ? 0.42 : 0.2;
    ctx.lineWidth = truthKernelRingWidth(node);
    ctx.arc(node.x, node.y, radius + 2.2, 0, Math.PI * 2);
    ctx.stroke();
    if (node.id === selectedNodeId) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.9;
      ctx.arc(node.x, node.y, radius + 4.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.fillStyle = STATUS_COLORS[node.status] || STATUS_COLORS.informational;
    ctx.globalAlpha = node.id === selectedNodeId ? 0.98 : (0.72 + (node.confidence * 0.22));
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}
