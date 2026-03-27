import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runGraphQueriesTests() {
  const graphQueriesPath = path.resolve(process.cwd(), 'graphQueries.js');
  const {
    normalizeGraphBundle,
    getNodeById,
    findNodesByType,
    findNodesByTag,
    getRelatedNodes,
    getContextManagerNode,
  } = require(graphQueriesPath);

  const normalizedWorkspace = {
    graphs: {
      system: {
        nodes: [
          {
            id: 'system_root',
            type: 'module',
            content: 'System root',
            metadata: { tags: ['core', 'system'], labels: ['entry'] },
          },
          {
            id: 'system_bridge',
            type: 'adapter',
            content: 'Bridge node',
            metadata: { tags: ['bridge'], labels: ['link'] },
          },
        ],
        edges: [
          { source: 'system_root', target: 'system_bridge', relationship_type: 'relates_to' },
          { source: 'system_bridge', target: 'world_anchor', relationship_type: 'relates_to' },
        ],
      },
      world: {
        nodes: [
          {
            id: 'world_anchor',
            type: 'text',
            content: 'World anchor',
            metadata: { agentId: 'context-manager', tags: ['context'], labels: ['planner'] },
          },
        ],
        edges: [
          { source: 'world_anchor', target: 'world_neighbor', relationship_type: 'relates_to' },
        ],
      },
    },
  };

  const normalizedBundle = normalizeGraphBundle(normalizedWorkspace);
  assert.equal(normalizedBundle.system.nodes.length, 2);
  assert.equal(normalizedBundle.world.nodes.length, 1);
  assert.equal(getNodeById(normalizedBundle, 'world_anchor')?.id, 'world_anchor');
  assert.equal(getContextManagerNode(normalizedBundle)?.id, 'world_anchor');
  assert.equal(findNodesByType(normalizedBundle, 'module')[0].id, 'system_root');
  assert.equal(findNodesByType(normalizedBundle, ['adapter', 'text']).length, 2);
  assert.equal(findNodesByTag(normalizedBundle, 'context')[0].id, 'world_anchor');
  assert.equal(findNodesByTag(normalizedBundle, 'planner')[0].id, 'world_anchor');

  const relatedFromSystem = getRelatedNodes(normalizedBundle, 'system_bridge');
  assert.deepEqual(
    relatedFromSystem.map((node) => node.id).sort(),
    ['system_root', 'world_anchor'],
  );
  assert.deepEqual(
    getRelatedNodes(normalizedBundle, 'world_anchor', { direction: 'incoming' }).map((node) => node.id),
    ['system_bridge'],
  );

  const legacyWorkspace = {
    graph: {
      nodes: [
        {
          id: 'legacy_context',
          type: 'module',
          content: 'Legacy context node',
          metadata: { role: 'context', tags: ['legacy'] },
        },
        {
          id: 'legacy_neighbor',
          type: 'text',
          content: 'Legacy neighbor node',
          metadata: { tags: ['legacy'] },
        },
      ],
      edges: [
        { source: 'legacy_context', target: 'legacy_neighbor', relationship_type: 'relates_to' },
      ],
    },
  };

  const legacyBundle = normalizeGraphBundle(legacyWorkspace);
  assert.equal(legacyBundle.system.nodes[0].id, 'legacy_context');
  assert.equal(legacyBundle.world.nodes.length, 0);
  assert.equal(getContextManagerNode(legacyBundle)?.id, 'legacy_context');
  assert.equal(getNodeById(legacyBundle, 'legacy_context')?.id, 'legacy_context');
  assert.equal(findNodesByTag(legacyBundle, 'legacy')[0].id, 'legacy_context');
  assert.equal(getRelatedNodes(legacyBundle, 'legacy_context')[0].id, 'legacy_neighbor');

  const partialBundle = normalizeGraphBundle({
    graphs: {
      system: { nodes: null, edges: null },
      world: { nodes: [], edges: null },
    },
  });

  assert.deepEqual(partialBundle, {
    system: { nodes: [], edges: [] },
    world: { nodes: [], edges: [] },
  });
  assert.equal(getNodeById(partialBundle, 'missing'), null);
  assert.deepEqual(findNodesByType(partialBundle, 'module'), []);
  assert.deepEqual(findNodesByTag(partialBundle, 'context'), []);
  assert.deepEqual(getRelatedNodes(partialBundle, 'missing'), []);
  assert.equal(getContextManagerNode(partialBundle), null);
}
