const STATUS_COLORS = {
  healthy: '#f6f7fb',
  degraded: '#ffbf5c',
  blocked: '#ff6a5d',
  informational: '#63a8ff',
  orphaned: '#6a7284',
};

export function truthKernelNodeRadius(node = {}) {
  return 2.4 + ((Number(node?.weight) || 0) * 1.6);
}

export function hitTestTruthKernelNode(point = null, truthKernel = {}, layout = null) {
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return null;
  const nodes = Array.isArray(truthKernel?.nodes) ? truthKernel.nodes : [];
  const positions = layout?.positions || new Map();
  let selected = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  nodes.forEach((node) => {
    const position = positions.get(node.id);
    if (!position) return;
    const radius = Math.max(6, truthKernelNodeRadius(node) + 4);
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
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
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const nodes = Array.isArray(truthKernel?.nodes) ? truthKernel.nodes : [];
  const positions = layout?.positions || new Map();
  const selectedNodeId = String(options?.selectedNodeId || '').trim();
  nodes.forEach((node) => {
    const point = positions.get(node.id);
    if (!point) return;
    const radius = truthKernelNodeRadius(node);
    if (node.id === selectedNodeId) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.9;
      ctx.arc(point.x, point.y, radius + 3.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.fillStyle = STATUS_COLORS[node.status] || STATUS_COLORS.informational;
    ctx.globalAlpha = node.id === selectedNodeId ? 0.98 : (0.72 + (node.confidence * 0.22));
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}
