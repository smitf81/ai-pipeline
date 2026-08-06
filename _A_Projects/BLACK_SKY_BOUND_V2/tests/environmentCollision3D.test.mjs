import { assert, equal } from './assert.mjs';
import { SceneObjectType } from '../src/data/sceneObjects.js';
import { createDemoMap } from '../src/world/map.js';
import { createSceneObjects } from '../src/world/sceneObjects.js';
import { circleIntersectsEnvironment, compileEnvironmentCollisionIndex, environmentTraversalMultiplier } from '../src/physics/environmentCollision.js';
import { getEnvironmentTraversalMultiplier, isPositionBlocked } from '../src/systems/movementSystem.js';

const map = createDemoMap();
const tree = map.sceneObjects.find((object) => object.treeDefinition?.species === 'old_pine');
assert(tree.collisionShape?.source?.policy === 'visible_trunk_circle_roots_traversable_canopy_excluded', 'Tree DNA should own its visible trunk-only hard collision policy');
const index = compileEnvironmentCollisionIndex(map);
equal(index.contract, 'black-sky-bound.environment-collision-index.v1', 'environment collision should publish its index contract');
assert(index.diagnostics.terrainShapeCount > 0 && index.diagnostics.recipeShapeCount > 0, 'one spatial index should include visible cliffs and recipe props');
assert(index.diagnostics.traversalModifierCount > 0, 'the environment index should separately compile visible root traversal fields');
assert(circleIntersectsEnvironment(index, tree.x, tree.y, 0.1), 'tree trunk center should block');
const outerRoot = tree.traversalModifiers.map((modifier) => modifier.shape)
  .flatMap((shape) => [{ x: shape.ax, y: shape.ay }, { x: shape.bx, y: shape.by }])
  .sort((a, b) => Math.hypot(b.x - tree.x, b.y - tree.y) - Math.hypot(a.x - tree.x, a.y - tree.y))[0];
assert(!circleIntersectsEnvironment(index, outerRoot.x, outerRoot.y, 0.02), 'visible outer roots should not hard-stop movement');
assert(environmentTraversalMultiplier(index, outerRoot.x, outerRoot.y, 0.02) < 1, 'visible outer roots should apply a slight traversal slowdown');
equal(getEnvironmentTraversalMultiplier(map, outerRoot.x, outerRoot.y, 0.02), environmentTraversalMultiplier(index, outerRoot.x, outerRoot.y, 0.02), 'movement should consume the compiled root traversal field');
const canopyOnlyX = tree.x + tree.visualWidthTiles * 0.46;
assert(!circleIntersectsEnvironment(index, canopyOnlyX, tree.y, 0.05), 'tree canopy spread should not create gameplay collision');
assert(!isPositionBlocked(map, 1.08, map.height * 0.5, 0.04), 'space immediately inside the visible border cliff should not be rejected by a hidden inset clamp');
assert(isPositionBlocked(map, 0.96, map.height * 0.5, 0.04), 'the visible raised border terrain should block at its actual edge');

const wallMap = createDemoMap();
wallMap.sceneObjects = createSceneObjects([
  { id: 'wall-tree-a', type: SceneObjectType.TREE, x: 10, y: 10, tree: { seed: 611 } },
  { id: 'wall-tree-b', type: SceneObjectType.TREE, x: 14, y: 10, tree: { seed: 612 } }
]);
const wallIndex = compileEnvironmentCollisionIndex(wallMap);
assert(circleIntersectsEnvironment(wallIndex, 11, 11, 0.18), 'the first visible trunk should block');
assert(circleIntersectsEnvironment(wallIndex, 15, 11, 0.18), 'the second visible trunk should block');
assert(!circleIntersectsEnvironment(wallIndex, 13, 11, 0.12), 'space between non-overlapping trunks should remain traversable instead of being filled by root hulls');
