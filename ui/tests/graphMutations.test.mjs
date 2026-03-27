import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runGraphMutationsTests() {
  const graphMutationsPath = path.resolve(process.cwd(), 'graphMutations.js');
  const {
    GRAPH_MUTATION_TYPES,
    applyGraphMutations,
    buildGraphMutationPreview,
    normalizeGraphMutation,
    normalizeGraphMutations,
  } = require(graphMutationsPath);

  assert.deepEqual(GRAPH_MUTATION_TYPES, [
    'add_node',
    'remove_node',
    'set_prop',
    'add_tag',
    'remove_tag',
    'add_edge',
    'remove_edge',
  ]);

  const normalizedMutations = normalizeGraphMutations([
    {
      type: 'add_node',
      node: {
        id: 'node_new',
        label: 'Preview Node',
        kind: 'module',
        layer: 'system',
        metadata: { tags: ['preview'] },
      },
    },
    { type: 'remove_node', nodeId: 'node_old' },
    { type: 'set_prop', nodeId: 'node_new', key: 'metadata.preview.summary', value: 'Preview summary' },
    { type: 'add_tag', nodeId: 'node_new', tag: 'intent-preview' },
    { type: 'remove_tag', nodeId: 'node_new', tag: 'old-tag' },
    { type: 'add_edge', source: 'node_new', target: 'node_old', relationshipType: 'relates_to' },
    { type: 'remove_edge', edgeId: 'edge_1' },
  ]);

  assert.equal(normalizedMutations.length, 7);
  assert.deepEqual(normalizedMutations[0], {
    type: 'add_node',
    preview: true,
    node: {
      id: 'node_new',
      label: 'Preview Node',
      kind: 'module',
      layer: 'system',
      metadata: { tags: ['preview'] },
    },
  });
  assert.deepEqual(normalizedMutations[1], {
    type: 'remove_node',
    preview: true,
    nodeId: 'node_old',
  });
  assert.deepEqual(normalizedMutations[2], {
    type: 'set_prop',
    preview: true,
    nodeId: 'node_new',
    key: 'metadata.preview.summary',
    value: 'Preview summary',
  });
  assert.deepEqual(normalizedMutations[3], {
    type: 'add_tag',
    preview: true,
    nodeId: 'node_new',
    tag: 'intent-preview',
  });
  assert.deepEqual(normalizedMutations[4], {
    type: 'remove_tag',
    preview: true,
    nodeId: 'node_new',
    tag: 'old-tag',
  });
  assert.deepEqual(normalizedMutations[5], {
    type: 'add_edge',
    preview: true,
    source: 'node_new',
    target: 'node_old',
    relationshipType: 'relates_to',
  });
  assert.deepEqual(normalizedMutations[6], {
    type: 'remove_edge',
    preview: true,
    edgeId: 'edge_1',
  });

  assert.equal(normalizeGraphMutation({ type: 'add_tag', nodeId: '', tag: 'missing' }), null);
  assert.deepEqual(normalizeGraphMutations([null, {}, { type: 'not-a-mutation' }]), []);

  const normalizedPreview = buildGraphMutationPreview({
    graphBundle: {
      system: {
        nodes: [
          {
            id: 'system_context',
            type: 'text',
            content: 'System graph intent bridge',
            metadata: { tags: ['core'] },
          },
        ],
        edges: [],
      },
      world: {
        nodes: [
          {
            id: 'world_context',
            type: 'module',
            content: 'Context manager node',
            metadata: { agentId: 'context-manager', tags: ['context'] },
          },
        ],
        edges: [
          { source: 'world_context', target: 'system_context', relationship_type: 'relates_to' },
        ],
      },
    },
    projectContext: {
      currentFocus: 'Preview graph mutations',
      anchorRefs: ['brain/emergence/plan.md'],
    },
  });

  assert.ok(Array.isArray(normalizedPreview));
  assert.ok(normalizedPreview.length >= 1);
  assert.equal(normalizedPreview[0].type, 'set_prop');
  assert.equal(normalizedPreview[0].preview, true);
  assert.equal(normalizedPreview[0].nodeId, 'world_context');

  const legacyPreview = buildGraphMutationPreview({
    graphBundle: {
      graph: {
        nodes: [
          {
            id: 'legacy_context',
            type: 'module',
            content: 'Legacy context node',
            metadata: { role: 'context', tags: ['legacy'] },
          },
        ],
        edges: [],
      },
    },
    source: 'Bridge the legacy graph into preview mutations',
    projectContext: {
      currentFocus: 'Legacy preview bridge',
      anchorRefs: [],
    },
  });

  assert.ok(Array.isArray(legacyPreview));
  assert.equal(legacyPreview[0].nodeId, 'legacy_context');
  assert.equal(legacyPreview[0].type, 'set_prop');

  const missingPreview = buildGraphMutationPreview({
    graphBundle: {},
    projectContext: {
      currentFocus: 'Missing graph data',
    },
  });

  assert.deepEqual(missingPreview, []);

  const partialPreview = buildGraphMutationPreview({
    graphBundle: {
      system: {
        nodes: null,
        edges: null,
      },
      world: {
        nodes: [],
        edges: [],
      },
    },
    projectContext: {
      currentFocus: 'Partial graph safety',
    },
  });

  assert.deepEqual(partialPreview, []);

  const sourceBundle = {
    system: {
      nodes: [
        {
          id: 'system_context',
          type: 'module',
          content: 'System graph root',
          metadata: { tags: ['core'] },
        },
      ],
      edges: [
        { source: 'world_context', target: 'system_context', relationshipType: 'relates_to' },
      ],
    },
    world: {
      nodes: [
        {
          id: 'world_context',
          type: 'text',
          content: 'World context node',
          metadata: {
            agentId: 'context-manager',
            tags: ['context'],
            graphLayer: 'world',
          },
        },
      ],
      edges: [],
    },
  };
  const sourceSnapshot = JSON.parse(JSON.stringify(sourceBundle));
  const applied = applyGraphMutations(sourceBundle, [
    {
      type: 'add_node',
      node: {
        id: 'draft_node',
        label: 'Draft node',
        kind: 'task',
        layer: 'system',
        metadata: { tags: ['draft'] },
      },
    },
    {
      type: 'set_prop',
      nodeId: 'world_context',
      key: 'metadata.preview.summary',
      value: 'Preview summary',
    },
    {
      type: 'add_tag',
      nodeId: 'world_context',
      tag: 'intent-preview',
    },
    {
      type: 'remove_tag',
      nodeId: 'world_context',
      tag: 'context',
    },
    {
      type: 'add_edge',
      source: 'world_context',
      target: 'draft_node',
      relationshipType: 'relates_to',
    },
    {
      type: 'remove_edge',
      source: 'world_context',
      target: 'system_context',
      relationshipType: 'relates_to',
    },
  ]);

  assert.deepEqual(sourceBundle, sourceSnapshot);
  assert.equal(applied.applied.length, 6);
  assert.deepEqual(applied.rejected, []);
  assert.equal(applied.graphBundle.system.nodes.some((node) => node.id === 'draft_node'), true);
  assert.equal(applied.graphBundle.world.nodes.find((node) => node.id === 'world_context')?.metadata?.preview?.summary, 'Preview summary');
  assert.equal(applied.graphBundle.world.nodes.find((node) => node.id === 'world_context')?.metadata?.tags?.includes('intent-preview'), true);
  assert.equal(applied.graphBundle.world.nodes.find((node) => node.id === 'world_context')?.metadata?.tags?.includes('context'), false);
  assert.equal(
    applied.graphBundle.world.edges.some((edge) => edge.source === 'world_context' && edge.target === 'draft_node'),
    true,
  );
  assert.equal(
    applied.graphBundle.system.edges.some((edge) => edge.source === 'world_context' && edge.target === 'system_context'),
    false,
  );

  const rejected = applyGraphMutations(
    {
      system: { nodes: [], edges: [] },
      world: {
        nodes: [
          {
            id: 'world_context',
            type: 'text',
            content: 'World context node',
            metadata: { agentId: 'context-manager' },
          },
        ],
        edges: [],
      },
    },
    [
      { type: 'set_prop', nodeId: 'missing_node', key: 'metadata.preview.summary', value: 'No target' },
      { type: 'add_edge', source: 'missing_a', target: 'missing_b', relationshipType: 'relates_to' },
      { type: 'remove_node', nodeId: 'missing_node' },
      { type: 'add_tag', nodeId: '', tag: 'broken' },
      { type: 'set_prop', nodeId: 'world_context', key: '__proto__.danger', value: 'blocked' },
    ],
  );

  assert.equal(rejected.applied.length, 0);
  assert.equal(rejected.rejected.length, 5);
  assert.ok(rejected.rejected.some((entry) => entry.reason === 'missing-node'));
  assert.ok(rejected.rejected.some((entry) => entry.reason === 'missing-node-reference'));
  assert.ok(rejected.rejected.some((entry) => entry.reason === 'malformed-mutation'));
  assert.ok(rejected.rejected.some((entry) => entry.reason === 'unsafe-property-path'));

  const partialApplySource = {
    system: {
      nodes: null,
      edges: null,
    },
    world: {
      nodes: [],
      edges: [],
    },
  };
  const partialApplySnapshot = JSON.parse(JSON.stringify(partialApplySource));
  const partialApplied = applyGraphMutations(partialApplySource, [
    {
      type: 'add_node',
      node: {
        id: 'partial_node',
        label: 'Partial node',
        kind: 'text',
        layer: 'world',
        metadata: { tags: ['partial'] },
      },
    },
  ]);

  assert.deepEqual(partialApplySource, partialApplySnapshot);
  assert.equal(partialApplied.applied.length, 1);
  assert.equal(partialApplied.rejected.length, 0);
  assert.equal(partialApplied.graphBundle.world.nodes.some((node) => node.id === 'partial_node'), true);
}
