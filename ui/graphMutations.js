const {
  getContextManagerNode,
  normalizeGraphBundle,
} = require('./graphQueries');

const GRAPH_MUTATION_TYPES = Object.freeze([
  'add_node',
  'remove_node',
  'set_prop',
  'add_tag',
  'remove_tag',
  'add_edge',
  'remove_edge',
]);

const GRAPH_MUTATION_TYPE_SET = new Set(GRAPH_MUTATION_TYPES);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => normalizeText(value)).filter(Boolean))];
}

function cloneJsonValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (typeof value !== 'object') return value;
  const clone = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (typeof entry !== 'function' && entry !== undefined) {
      clone[key] = cloneJsonValue(entry);
    }
  });
  return clone;
}

function cloneGraphBundle(graphBundle = {}) {
  const bundle = resolveGraphBundle(graphBundle);
  return {
    system: {
      nodes: cloneJsonValue(bundle.system?.nodes || []),
      edges: cloneJsonValue(bundle.system?.edges || []),
    },
    world: {
      nodes: cloneJsonValue(bundle.world?.nodes || []),
      edges: cloneJsonValue(bundle.world?.edges || []),
    },
  };
}

function resolveGraphBundle(graphBundleOrWorkspace = {}) {
  if (graphBundleOrWorkspace?.system || graphBundleOrWorkspace?.world) {
    return {
      system: {
        nodes: Array.isArray(graphBundleOrWorkspace.system?.nodes) ? graphBundleOrWorkspace.system.nodes : [],
        edges: Array.isArray(graphBundleOrWorkspace.system?.edges) ? graphBundleOrWorkspace.system.edges : [],
      },
      world: {
        nodes: Array.isArray(graphBundleOrWorkspace.world?.nodes) ? graphBundleOrWorkspace.world.nodes : [],
        edges: Array.isArray(graphBundleOrWorkspace.world?.edges) ? graphBundleOrWorkspace.world.edges : [],
      },
    };
  }
  return normalizeGraphBundle(graphBundleOrWorkspace);
}

function normalizeGraphMutation(mutation = {}) {
  if (!isPlainObject(mutation)) return null;
  const type = normalizeText(mutation.type).toLowerCase();
  if (!GRAPH_MUTATION_TYPE_SET.has(type)) return null;
  const preview = mutation.preview === false ? false : true;
  const origin = normalizeText(mutation.origin);
  const note = normalizeText(mutation.note || mutation.reason);

  if (type === 'add_node') {
    const node = isPlainObject(mutation.node) ? mutation.node : {};
    const id = normalizeText(node.id || mutation.nodeId);
    const label = normalizeText(node.label || node.content || mutation.label || mutation.content);
    if (!id && !label) return null;
    const normalized = {
      type,
      preview,
      node: {
        id: id || null,
        label,
        kind: normalizeText(node.kind || node.type || mutation.kind || 'text') || 'text',
        layer: normalizeText(node.layer || node.graphLayer || mutation.layer || 'system') || 'system',
        metadata: isPlainObject(node.metadata) ? cloneJsonValue(node.metadata) : {},
      },
    };
    if (normalizeText(node.role)) {
      normalized.node.role = normalizeText(node.role);
    }
    if (Array.isArray(node.representations) && node.representations.length) {
      normalized.node.representations = cloneJsonValue(node.representations);
    }
    if (origin) normalized.origin = origin;
    if (note) normalized.note = note;
    return normalized;
  }

  if (type === 'remove_node') {
    const nodeId = normalizeText(mutation.nodeId || mutation.id || mutation.node?.id);
    if (!nodeId) return null;
    const normalized = { type, preview, nodeId };
    if (origin) normalized.origin = origin;
    if (note) normalized.note = note;
    return normalized;
  }

  if (type === 'set_prop') {
    const nodeId = normalizeText(mutation.nodeId || mutation.id || mutation.node?.id);
    const key = normalizeText(mutation.key || mutation.prop || mutation.path);
    if (!nodeId || !key) return null;
    const normalized = {
      type,
      preview,
      nodeId,
      key,
      value: cloneJsonValue(mutation.value),
    };
    if (origin) normalized.origin = origin;
    if (note) normalized.note = note;
    return normalized;
  }

  if (type === 'add_tag' || type === 'remove_tag') {
    const nodeId = normalizeText(mutation.nodeId || mutation.id || mutation.node?.id);
    const tag = normalizeText(mutation.tag || mutation.value);
    if (!nodeId || !tag) return null;
    const normalized = { type, preview, nodeId, tag };
    if (origin) normalized.origin = origin;
    if (note) normalized.note = note;
    return normalized;
  }

  if (type === 'add_edge' || type === 'remove_edge') {
    const edge = isPlainObject(mutation.edge) ? mutation.edge : mutation;
    const source = normalizeText(edge.source || edge.from || edge.sourceId);
    const target = normalizeText(edge.target || edge.to || edge.targetId);
    const relationshipType = normalizeText(edge.relationshipType || edge.relationship_type || edge.kind || mutation.relationshipType || mutation.kind);
    const edgeId = normalizeText(edge.id || mutation.edgeId);
    if (!source && !target && !edgeId) return null;
    const normalized = { type, preview };
    if (edgeId) normalized.edgeId = edgeId;
    if (source) normalized.source = source;
    if (target) normalized.target = target;
    if (relationshipType) normalized.relationshipType = relationshipType;
    if (origin) normalized.origin = origin;
    if (note) normalized.note = note;
    return normalized;
  }

  return null;
}

function normalizeGraphMutations(mutations = []) {
  return (Array.isArray(mutations) ? mutations : [])
    .map((mutation) => normalizeGraphMutation(mutation))
    .filter(Boolean);
}

function isUnsafePathPart(part = '') {
  return ['__proto__', 'prototype', 'constructor'].includes(normalizeText(part));
}

function isSafePathKey(key = '') {
  const parts = normalizeText(key).split('.').map((part) => normalizeText(part)).filter(Boolean);
  return parts.length > 0 && !parts.some(isUnsafePathPart);
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function findNodeLocation(graphBundle = {}, nodeId = '') {
  const id = normalizeText(nodeId);
  if (!id) return null;
  for (const layer of ['system', 'world']) {
    const nodes = Array.isArray(graphBundle?.[layer]?.nodes) ? graphBundle[layer].nodes : [];
    const index = nodes.findIndex((node) => normalizeText(node?.id) === id);
    if (index >= 0) {
      return {
        layer,
        index,
        node: nodes[index],
      };
    }
  }
  return null;
}

function findEdgeLocations(graphBundle = {}, mutation = {}) {
  const edgeId = normalizeText(mutation.edgeId);
  const source = normalizeText(mutation.source);
  const target = normalizeText(mutation.target);
  const relationshipType = normalizeText(mutation.relationshipType);
  const locations = [];
  ['system', 'world'].forEach((layer) => {
    const edges = Array.isArray(graphBundle?.[layer]?.edges) ? graphBundle[layer].edges : [];
    edges.forEach((edge, index) => {
      const edgeSource = normalizeText(edge?.source);
      const edgeTarget = normalizeText(edge?.target);
      const edgeRelationshipType = normalizeText(edge?.relationshipType || edge?.relationship_type || edge?.kind);
      const edgeMatches = edgeId
        ? normalizeText(edge?.id) === edgeId
        : source && target
          ? edgeSource === source
            && edgeTarget === target
            && (!relationshipType || edgeRelationshipType === relationshipType)
          : false;
      if (edgeMatches) {
        locations.push({
          layer,
          index,
          edge,
        });
      }
    });
  });
  return locations;
}

function setPathValue(target = {}, key = '', value = null) {
  const path = normalizeText(key);
  if (!path) return false;
  const parts = path.split('.').map((part) => normalizeText(part)).filter(Boolean);
  if (!parts.length || parts.some(isUnsafePathPart)) return false;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isPlainObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  const lastPart = parts[parts.length - 1];
  const changed = !sameJsonValue(cursor[lastPart], value);
  cursor[lastPart] = cloneJsonValue(value);
  return changed;
}

function collectEdgeNodes(graphBundle = {}, mutation = {}) {
  const sourceLocation = findNodeLocation(graphBundle, mutation.source);
  const targetLocation = findNodeLocation(graphBundle, mutation.target);
  return {
    sourceLocation,
    targetLocation,
  };
}

function buildNodeFromMutation(mutation = {}) {
  const node = mutation.node || {};
  const nodeId = normalizeText(node.id);
  const label = normalizeText(node.label);
  const metadata = {
    ...(isPlainObject(node.metadata) ? cloneJsonValue(node.metadata) : {}),
  };
  if (node.role && !metadata.role) {
    metadata.role = normalizeText(node.role);
  }
  const built = {
    id: nodeId,
    type: normalizeText(node.kind || 'text') || 'text',
    content: label || nodeId,
    metadata: {
      ...metadata,
      graphLayer: normalizeText(node.layer || 'system') || 'system',
    },
  };
  if (Array.isArray(node.representations) && node.representations.length) {
    built.representations = cloneJsonValue(node.representations);
  }
  return built;
}

function applyGraphMutation(graphBundle = {}, mutation = {}) {
  const normalized = normalizeGraphMutation(mutation);
  if (!normalized) {
    return {
      applied: false,
      changed: false,
      reason: 'malformed-mutation',
      mutation: null,
    };
  }
  if (normalized.preview === false) {
    return {
      applied: false,
      changed: false,
      reason: 'preview-only-mutation-required',
      mutation: normalized,
    };
  }

  const bundle = graphBundle;

  if (normalized.type === 'add_node') {
    if (!normalized.node?.id) {
      return {
        applied: false,
        changed: false,
        reason: 'missing-node-id',
        mutation: normalized,
      };
    }
    if (findNodeLocation(bundle, normalized.node.id)) {
      return {
        applied: false,
        changed: false,
        reason: 'node-already-exists',
        mutation: normalized,
      };
    }
    const layer = normalized.node.layer === 'world' ? 'world' : 'system';
    const node = buildNodeFromMutation(normalized);
    node.metadata.graphLayer = layer;
    bundle[layer].nodes.push(node);
    return {
      applied: true,
      changed: true,
      reason: null,
      mutation: normalized,
      result: { nodeId: node.id, layer },
    };
  }

  if (normalized.type === 'remove_node') {
    const location = findNodeLocation(bundle, normalized.nodeId);
    if (!location) {
      return {
        applied: false,
        changed: false,
        reason: 'missing-node',
        mutation: normalized,
      };
    }
    const removedNode = location.node;
    bundle[location.layer].nodes.splice(location.index, 1);
    let removedEdges = 0;
    ['system', 'world'].forEach((layer) => {
      const edges = Array.isArray(bundle?.[layer]?.edges) ? bundle[layer].edges : [];
      for (let index = edges.length - 1; index >= 0; index -= 1) {
        const edge = edges[index];
        if (normalizeText(edge?.source) === location.node.id || normalizeText(edge?.target) === location.node.id) {
          edges.splice(index, 1);
          removedEdges += 1;
        }
      }
    });
    return {
      applied: true,
      changed: true,
      reason: null,
      mutation: normalized,
      result: { nodeId: removedNode.id, removedEdges, layer: location.layer },
    };
  }

  if (normalized.type === 'set_prop') {
    const location = findNodeLocation(bundle, normalized.nodeId);
    if (!location) {
      return {
        applied: false,
        changed: false,
        reason: 'missing-node',
        mutation: normalized,
      };
    }
    if (!isSafePathKey(normalized.key)) {
      return {
        applied: false,
        changed: false,
        reason: 'unsafe-property-path',
        mutation: normalized,
      };
    }
    const changed = setPathValue(location.node, normalized.key, normalized.value);
    return {
      applied: true,
      changed,
      reason: null,
      mutation: normalized,
      result: { nodeId: location.node.id, key: normalized.key },
    };
  }

  if (normalized.type === 'add_tag' || normalized.type === 'remove_tag') {
    const location = findNodeLocation(bundle, normalized.nodeId);
    if (!location) {
      return {
        applied: false,
        changed: false,
        reason: 'missing-node',
        mutation: normalized,
      };
    }
    const metadata = location.node.metadata && typeof location.node.metadata === 'object'
      ? location.node.metadata
      : (location.node.metadata = {});
    const tags = Array.isArray(metadata.tags) ? metadata.tags : (metadata.tags = []);
    const tag = normalized.tag;
    const existingIndex = tags.findIndex((entry) => normalizeText(entry) === tag);
    if (normalized.type === 'add_tag') {
      if (existingIndex >= 0) {
        return {
          applied: true,
          changed: false,
          reason: null,
          mutation: normalized,
          result: { nodeId: location.node.id, tag, layer: location.layer },
        };
      }
      tags.push(tag);
      return {
        applied: true,
        changed: true,
        reason: null,
        mutation: normalized,
        result: { nodeId: location.node.id, tag, layer: location.layer },
      };
    }
    if (existingIndex < 0) {
      return {
        applied: true,
        changed: false,
        reason: null,
        mutation: normalized,
        result: { nodeId: location.node.id, tag, layer: location.layer },
      };
    }
    tags.splice(existingIndex, 1);
    return {
      applied: true,
      changed: true,
      reason: null,
      mutation: normalized,
      result: { nodeId: location.node.id, tag, layer: location.layer },
    };
  }

  if (normalized.type === 'add_edge') {
    const { sourceLocation, targetLocation } = collectEdgeNodes(bundle, normalized);
    if (!sourceLocation || !targetLocation) {
      return {
        applied: false,
        changed: false,
        reason: 'missing-node-reference',
        mutation: normalized,
      };
    }
    const layer = normalizeText(normalized.layer || normalized.graphLayer)
      || sourceLocation.layer
      || targetLocation.layer
      || 'system';
    const edges = Array.isArray(bundle?.[layer]?.edges) ? bundle[layer].edges : null;
    if (!edges) {
      return {
        applied: false,
        changed: false,
        reason: 'missing-graph-layer',
        mutation: normalized,
      };
    }
    const duplicate = edges.some((edge) => (
      normalizeText(edge?.source) === normalized.source
      && normalizeText(edge?.target) === normalized.target
      && normalizeText(edge?.relationshipType || edge?.relationship_type || edge?.kind) === normalizeText(normalized.relationshipType)
    ));
    if (duplicate) {
      return {
        applied: true,
        changed: false,
        reason: null,
        mutation: normalized,
        result: { source: normalized.source, target: normalized.target, layer, duplicate: true },
      };
    }
    edges.push({
      source: normalized.source,
      target: normalized.target,
      relationshipType: normalized.relationshipType || 'relates_to',
    });
    return {
      applied: true,
      changed: true,
      reason: null,
      mutation: normalized,
      result: { source: normalized.source, target: normalized.target, layer },
    };
  }

  if (normalized.type === 'remove_edge') {
    const locations = findEdgeLocations(bundle, normalized);
    if (!locations.length) {
      return {
        applied: true,
        changed: false,
        reason: null,
        mutation: normalized,
        result: { removedEdges: 0 },
      };
    }
    locations
      .slice()
      .sort((left, right) => right.index - left.index)
      .forEach((location) => {
        bundle[location.layer].edges.splice(location.index, 1);
      });
    return {
      applied: true,
      changed: true,
      reason: null,
      mutation: normalized,
      result: { removedEdges: locations.length },
    };
  }

  return {
    applied: false,
    changed: false,
    reason: 'unsupported-mutation',
    mutation: normalized,
  };
}

function applyGraphMutations(graphBundle = {}, mutations = []) {
  const nextBundle = cloneGraphBundle(graphBundle);
  const applied = [];
  const rejected = [];
  (Array.isArray(mutations) ? mutations : []).forEach((mutation, index) => {
    const outcome = applyGraphMutation(nextBundle, mutation);
    const record = {
      index,
      mutation: cloneJsonValue(outcome.mutation || mutation),
      reason: outcome.reason || null,
      changed: Boolean(outcome.changed),
      result: outcome.result || null,
    };
    if (outcome.applied) {
      applied.push(record);
    } else {
      rejected.push(record);
    }
  });
  return {
    graphBundle: nextBundle,
    applied,
    rejected,
  };
}

function tokenizePreviewText(text = '') {
  return uniqueStrings(String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []);
}

function collectNodeTags(node = {}) {
  const metadata = node?.metadata || {};
  return uniqueStrings([
    ...(Array.isArray(metadata.tags) ? metadata.tags : []),
    ...(Array.isArray(metadata.labels) ? metadata.labels : []),
    metadata.tag,
    metadata.label,
    metadata.role,
    metadata.agentId,
  ]);
}

function buildGraphMutationPreview({
  graphBundle = {},
  projectContext = {},
  source = '',
  limit = 3,
} = {}) {
  const bundle = resolveGraphBundle(graphBundle);
  const contextNode = getContextManagerNode(bundle);
  if (!contextNode) return [];

  const mutations = [];
  const previewText = normalizeText(
    projectContext?.currentFocus
    || projectContext?.activeMilestone
    || source
    || contextNode.content
    || '',
  );
  if (previewText) {
    mutations.push(normalizeGraphMutation({
      type: 'set_prop',
      nodeId: contextNode.id,
      key: 'metadata.preview.summary',
      value: previewText,
      origin: 'intent-analysis',
    }));
  }

  const existingTags = new Set(collectNodeTags(contextNode).map((tag) => tag.toLowerCase()));
  const candidateTags = uniqueStrings([
    ...tokenizePreviewText(projectContext?.currentFocus || ''),
    ...tokenizePreviewText(projectContext?.activeMilestone || ''),
    ...(Array.isArray(projectContext?.anchorRefs)
      ? projectContext.anchorRefs.map((ref) => String(ref || '').split('/').filter(Boolean).pop())
      : []),
    'intent-preview',
  ]);
  const nextTag = candidateTags.find((tag) => tag && !existingTags.has(tag.toLowerCase()));
  if (nextTag) {
    mutations.push(normalizeGraphMutation({
      type: 'add_tag',
      nodeId: contextNode.id,
      tag: nextTag,
      origin: 'intent-analysis',
    }));
  }

  return normalizeGraphMutations(mutations).slice(0, limit);
}

module.exports = {
  GRAPH_MUTATION_TYPES,
  applyGraphMutation,
  applyGraphMutations,
  buildGraphMutationPreview,
  normalizeGraphMutation,
  normalizeGraphMutations,
};
