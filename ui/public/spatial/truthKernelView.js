const STATUS_COLORS = {
  healthy: 'rgba(46, 214, 126, 0.92)',
  degraded: 'rgba(255, 176, 71, 0.9)',
  blocked: 'rgba(255, 96, 79, 0.92)',
  informational: 'rgba(103, 168, 255, 0.88)',
  orphaned: 'rgba(116, 126, 148, 0.82)',
};

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function roundChannel(value, fallback = 128) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(255, Math.round(numeric)));
}

function splitRgba(rgba = '') {
  const match = String(rgba || '').match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const [r, g, b, a] = match[1].split(',').map((part) => Number(String(part || '').trim()));
  if (![r, g, b].every(Number.isFinite)) return null;
  return {
    r: roundChannel(r),
    g: roundChannel(g),
    b: roundChannel(b),
    a: Number.isFinite(a) ? clamp01(a, 0.78) : 1,
  };
}

function colorFromChannels({ r, g, b, a }) {
  return `rgba(${roundChannel(r)}, ${roundChannel(g)}, ${roundChannel(b)}, ${Number(clamp01(a, 0.78).toFixed(3))})`;
}

function deriveFallbackVisual(node = {}) {
  const confidence = clamp01(node?.confidence, 0.5);
  const healthIntegrity = node.status === 'healthy'
    ? 0.92
    : node.status === 'degraded'
      ? 0.46
      : node.status === 'blocked'
        ? 0.12
        : node.status === 'orphaned'
          ? 0.28
          : 0.62;
  const activityLevel = clamp01(node?.activity_level, node.status === 'blocked' ? 0.18 : 0.32);
  const decayLevel = node.status === 'orphaned' ? 0.62 : 0.28;
  const alpha = 0.18 + ((1 - decayLevel) * 0.76);
  return {
    channels: {
      r: roundChannel((1 - healthIntegrity) * 255),
      g: roundChannel(healthIntegrity * 255),
      b: roundChannel(activityLevel * 255),
      a: Number(alpha.toFixed(3)),
    },
    confidence,
    vividness: clamp01(0.3 + (confidence * 0.7), 0.65),
    activity_level: activityLevel,
    decay_level: decayLevel,
    instability: clamp01(node?.visual?.instability, node.status === 'blocked' ? 0.56 : 0.08),
  };
}

export function resolveTruthKernelNodeVisual(node = {}, options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const source = node?.visual && typeof node.visual === 'object' ? node.visual : deriveFallbackVisual(node);
  const parsed = splitRgba(source.rgba) || {
    r: roundChannel(source.channels?.r, 128),
    g: roundChannel(source.channels?.g, 128),
    b: roundChannel(source.channels?.b, 128),
    a: clamp01(source.channels?.a, 0.82),
  };
  const activityLevel = clamp01(source.activity_level, 0.18);
  const vividness = clamp01(source.vividness, clamp01(source.confidence, 0.65));
  const instability = clamp01(source.instability, 0.08);
  const flicker = 1 - (instability * 0.14 * (0.5 + (Math.sin(nowMs / 240) * 0.5)));
  const pulse = 1 + (activityLevel * 0.32 * (0.5 + (Math.sin(nowMs / 420) * 0.5)));
  const fillAlpha = clamp01(parsed.a * (0.68 + (vividness * 0.28)) * flicker, 0.86);
  const glowAlpha = clamp01(parsed.a * (0.18 + (activityLevel * 0.42)), 0.52);
  const strokeAlpha = clamp01(parsed.a * (0.44 + (vividness * 0.36)), 0.92);
  return {
    fill: colorFromChannels({ ...parsed, a: fillAlpha }),
    glow: colorFromChannels({ ...parsed, a: glowAlpha }),
    stroke: colorFromChannels({ ...parsed, a: strokeAlpha }),
    pulse,
    activityLevel,
    instability,
    confidence: clamp01(source.confidence, 0.5),
    vividness,
  };
}

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
    const radius = Math.max(6, truthKernelNodeRadius(node) + 6);
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
  const nowMs = Number.isFinite(Number(options?.nowMs)) ? Number(options.nowMs) : Date.now();
  nodes.forEach((node) => {
    const radius = truthKernelNodeRadius(node);
    const visual = resolveTruthKernelNodeVisual(node, { nowMs });
    const pulseRadius = radius * visual.pulse;

    ctx.beginPath();
    ctx.fillStyle = visual.glow;
    ctx.globalAlpha = node.id === selectedNodeId ? 0.74 : 0.58;
    ctx.arc(node.x, node.y, pulseRadius + 10.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = visual.glow;
    ctx.globalAlpha = node.id === selectedNodeId ? 0.46 : 0.32;
    ctx.arc(node.x, node.y, pulseRadius + 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = visual.stroke;
    ctx.globalAlpha = node?.confidenceAvailable ? 0.76 : 0.4;
    ctx.lineWidth = truthKernelRingWidth(node);
    ctx.arc(node.x, node.y, radius + 2.4, 0, Math.PI * 2);
    ctx.stroke();

    if (node.id === selectedNodeId) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.94;
      ctx.arc(node.x, node.y, radius + 5.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.fillStyle = visual.fill;
    ctx.globalAlpha = node.id === selectedNodeId ? 0.98 : 0.84;
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}
