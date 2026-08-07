import { assert, equal } from './assert.mjs';
import { resolveProceduralTreeDefinition } from '../src/data/proceduralTrees.js';
import {
  generateProceduralTreeSpatialRecipe,
  PROCEDURAL_TREE_SPATIAL_RECIPE_CONTRACT,
  PROCEDURAL_TREE_SKELETON_3D_CONTRACT
} from '../src/world/proceduralTreeSpatialRecipe.js';
import { COLLISION_SHAPE_2D_CONTRACT, CollisionShape2DKind, circleIntersectsCollisionShape } from '../src/physics/collisionShapes.js';
import { TRAVERSAL_MODIFIER_2D_CONTRACT } from '../src/physics/traversalModifiers.js';
import { ThreeTreeMeshFactory, auditClosedTreeGeometry } from '../src/render/backends/three/ThreeTreeMeshFactory.js';

for (const [species, seed] of [['old_pine', 6371], ['silver_birch', 1997], ['ancient_oak', 8042]]) {
  const definition = resolveProceduralTreeDefinition({ species, seed, season: 'summer' }, { id: `test:${species}` });
  const first = generateProceduralTreeSpatialRecipe(definition);
  const second = generateProceduralTreeSpatialRecipe(definition);
  equal(first.contract, PROCEDURAL_TREE_SPATIAL_RECIPE_CONTRACT, `${species} should resolve one spatial recipe`);
  equal(first.skeleton.contract, PROCEDURAL_TREE_SKELETON_3D_CONTRACT, `${species} should expose a 3D skeleton`);
  equal(first.collision.contract, COLLISION_SHAPE_2D_CONTRACT, `${species} should expose recipe-derived collision`);
  equal(first.collision.kind, CollisionShape2DKind.CIRCLE, `${species} hard collision should follow only the visible trunk`);
  assert(JSON.stringify(first) === JSON.stringify(second), `${species} spatial recipe should be deterministic`);
  assert(first.skeleton.trunk.points.every((point) => Number.isFinite(point.z)), `${species} trunk should have real depth coordinates`);
  assert(first.skeleton.branches.some((branch) => branch.points.some((point) => Math.abs(point.z) > 0.05)), `${species} branches should distribute through depth`);
  assert(first.skeleton.roots.every((root) => root.points.length >= 5), `${species} roots should curve through a continuous multi-ring sweep`);
  assert(first.traversalModifiers.length >= first.skeleton.roots.length * 4, `${species} visible roots should emit segmented traversal fields`);
  assert(first.traversalModifiers.every((modifier) => modifier.contract === TRAVERSAL_MODIFIER_2D_CONTRACT && modifier.multiplier < 1), `${species} roots should slow traversal without becoming hard colliders`);
  assert(circleIntersectsCollisionShape(0, 0, 0.12, first.collision), `${species} trunk center should collide`);
  const rootTip = first.skeleton.roots[0].points.at(-1);
  assert(!circleIntersectsCollisionShape(rootTip.x / 0.5, rootTip.z / 0.5, 0.02, first.collision), `${species} root tip should be outside trunk-only hard collision`);
  assert(!circleIntersectsCollisionShape(20, 20, 0.12, first.collision), `${species} canopy-independent distant point should not collide`);
}

const speciesFactory = new ThreeTreeMeshFactory();
for (const [species, seed] of [['old_pine', 6371], ['silver_birch', 1997], ['ancient_oak', 8042]]) {
  const speciesDefinition = resolveProceduralTreeDefinition({ species, seed, season: 'summer' }, { id: `topology:${species}` });
  const mesh = speciesFactory.create(speciesDefinition);
  const wood = mesh.children.find((child) => child.name.endsWith(':wood')).geometry;
  const speciesTopology = auditClosedTreeGeometry(wood);
  equal(speciesTopology.connectedComponents, 1, `${species} wood should resolve to one connected component`);
  equal(speciesTopology.boundaryEdges, 0, `${species} wood should have no open boundary edges`);
  equal(speciesTopology.nonManifoldEdges, 0, `${species} wood should have no over-shared edges`);
  equal(speciesTopology.degenerateTriangles, 0, `${species} wood should have no collapsed triangles`);
  assert(speciesTopology.signedVolume > 0, `${species} wood should use outward-facing winding`);
}
speciesFactory.dispose();

const definition = resolveProceduralTreeDefinition({ species: 'ancient_oak', seed: 8042 }, { id: 'mesh-cache' });
const factory = new ThreeTreeMeshFactory();
const firstMesh = factory.create(definition);
const secondMesh = factory.create(definition);
equal(factory.diagnostics().geometryCacheEntries, 1, 'identical Tree DNA should share cached geometry');
assert(firstMesh.children.some((child) => child.isInstancedMesh), 'foliage should use an instanced faceted mesh');
assert(firstMesh.children.every((child) => child.castShadow && child.receiveShadow), 'tree surfaces should cast and receive real shadows');
assert(secondMesh.userData.recipe.collision.contract === COLLISION_SHAPE_2D_CONTRACT, 'render mesh should expose the same derived spatial recipe collider');
const barkGeometry = firstMesh.children.find((child) => child.name.endsWith(':wood')).geometry;
const recipe = firstMesh.userData.recipe;
assert(barkGeometry.attributes.position.count < 2400, 'the unified woody surface should remain within the per-tree vertex budget');
assert(barkGeometry.boundingBox.min.y >= -0.12, 'the closed root surface should terminate just beneath the receiving plane without deep fins');
const topology = auditClosedTreeGeometry(barkGeometry);
equal(firstMesh.userData.topology.construction, 'implicit_manifold_wood_v3', 'tree mesh should declare the unified implicit construction');
equal(firstMesh.userData.topology.integratedRootCount, recipe.skeleton.roots.length, 'every authored root path should shape the shared woody surface');
equal(firstMesh.userData.topology.branchComponentCount, 0, 'branches should no longer survive as separately capped intersecting components');
equal(topology.connectedComponents, 1, 'trunk, roots and major branches should be one connected component');
equal(topology.boundaryEdges, 0, 'the woody component should be closed');
equal(topology.nonManifoldEdges, 0, 'woody topology should not contain over-shared edges');
equal(topology.degenerateTriangles, 0, 'woody topology should not contain collapsed faces');
assert(topology.signedVolume > 0, 'closed woody components should use outward-facing winding');
assert(barkGeometry.attributes.normal.count === barkGeometry.attributes.position.count, 'smooth vertex normals should cover the complete bark mesh');
factory.dispose();
assert(factory.diagnostics().disposed, 'tree factory should explicitly dispose cached resources');
