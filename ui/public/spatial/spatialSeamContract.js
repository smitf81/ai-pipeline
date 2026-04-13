export const SPATIAL_SEAM_CONTRACT = Object.freeze({
  sketch_world: Object.freeze({
    id: 'sketch_world',
    role: 'authorial_surface',
    classification: 'speculative_surface',
    owns: Object.freeze(['graph_node', 'graph_edge', 'page_note']),
    linksBy: Object.freeze(['nodeId', 'canvasLayer', 'worldLayer']),
    projectsInto: Object.freeze(['truth_kernel']),
  }),
  truth_kernel: Object.freeze({
    id: 'truth_kernel',
    role: 'grounded_runtime',
    classification: 'grounded_truth',
    owns: Object.freeze(['intent_artifact', 'agent_run', 'handoff', 'qa_artifact']),
    linksBy: Object.freeze(['sourceNodeId', 'intentId', 'agentRunId']),
    projectsInto: Object.freeze([]),
  }),
  spatial_field: Object.freeze({
    id: 'spatial_field',
    role: 'ambient_influence',
    classification: 'ambient_field',
    owns: Object.freeze(['pressure_region', 'salience_gradient', 'routing_field']),
    linksBy: Object.freeze(['fieldKey', 'regionId']),
    projectsInto: Object.freeze(['layout_pressure']),
  }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(input = '') {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function classifySpatialEntityLayer(entity = {}) {
  if (entity?.sourceNodeId || entity?.intentId || entity?.agentRunId) return SPATIAL_SEAM_CONTRACT.truth_kernel;
  if (entity?.fieldKey || entity?.regionId) return SPATIAL_SEAM_CONTRACT.spatial_field;
  return SPATIAL_SEAM_CONTRACT.sketch_world;
}

export function buildTruthKernelBinding(entity = {}) {
  return {
    sourceNodeId: String(entity?.sourceNodeId || entity?.nodeId || '').trim() || null,
    intentId: String(entity?.intentId || '').trim() || null,
    agentRunId: String(entity?.agentRunId || entity?.id || '').trim() || null,
  };
}

export function buildSketchNodeAnchorMap(graphBundle = {}, viewport = {}) {
  const anchors = new Map();
  const zoom = Number.isFinite(Number(viewport?.zoom)) ? Number(viewport.zoom) : 1;
  const offsetX = Number.isFinite(Number(viewport?.x)) ? Number(viewport.x) : 0;
  const offsetY = Number.isFinite(Number(viewport?.y)) ? Number(viewport.y) : 0;

  Object.entries(graphBundle || {}).forEach(([layerId, graph]) => {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    nodes.forEach((node) => {
      const nodeId = String(node?.id || '').trim();
      const x = Number(node?.position?.x);
      const y = Number(node?.position?.y);
      if (!nodeId || !Number.isFinite(x) || !Number.isFinite(y)) return;
      anchors.set(nodeId, {
        nodeId,
        canvasLayer: String(node?.metadata?.graphLayer || layerId || '').trim() || 'system',
        worldLayer: String(layerId || '').trim() || 'system',
        worldX: x,
        worldY: y,
        screenX: x * zoom + offsetX,
        screenY: y * zoom + offsetY,
      });
    });
  });

  return anchors;
}

export function resolveTruthKernelAnchorOffset(node = {}) {
  const binding = buildTruthKernelBinding(node);
  const anchorKey = [binding.sourceNodeId, node?.id, node?.kind, node?.status].filter(Boolean).join(':');
  const hash = stableHash(anchorKey);
  const ring = node?.kind === 'execution' ? 20 : (node?.kind === 'artifact' ? 30 : 14);
  const angle = (hash % 360) * (Math.PI / 180);
  const xBias = node?.status === 'blocked' ? 6 : (node?.status === 'degraded' ? 2 : -2);
  const yBias = node?.kind === 'execution' ? -8 : (node?.kind === 'artifact' ? 10 : -12);
  return {
    x: Math.round(Math.cos(angle) * ring) + xBias,
    y: Math.round(Math.sin(angle) * ring) + yBias,
  };
}

export function resolveAnchoredTruthKernelPosition(node = {}, sourceAnchors = new Map(), bounds = {}) {
  const binding = buildTruthKernelBinding(node);
  const anchor = binding.sourceNodeId && sourceAnchors instanceof Map ? sourceAnchors.get(binding.sourceNodeId) : null;
  if (!anchor) return null;
  const offset = resolveTruthKernelAnchorOffset(node);
  const width = Number.isFinite(Number(bounds?.width)) ? Number(bounds.width) : 1600;
  const height = Number.isFinite(Number(bounds?.height)) ? Number(bounds.height) : 920;
  return {
    x: clamp(anchor.screenX + offset.x, 48, Math.max(48, width - 48)),
    y: clamp(anchor.screenY + offset.y, 48, Math.max(48, height - 48)),
    anchor,
  };
}
