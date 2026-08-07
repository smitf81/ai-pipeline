import { assert, equal } from './assert.mjs';
import {
  PROCEDURAL_TREE_DEFINITION_CONTRACT,
  TREE_DNA_CONTRACT,
  resolveProceduralTreeDefinition
} from '../src/data/proceduralTrees.js';
import { generateProceduralTreeSkeleton, PROCEDURAL_TREE_SKELETON_CONTRACT } from '../src/world/proceduralTreeGenerator.js';
import { createSceneObject } from '../src/world/sceneObjects.js';

const authored = {
  contract: TREE_DNA_CONTRACT,
  seed: 18273,
  species: 'ancient_oak',
  ageYears: 242,
  health: 0.91,
  season: 'summer',
  heightMeters: 9.4,
  trunkRadiusMeters: 0.82,
  taper: 0.82,
  bend: 0.38,
  twist: 0.31,
  branchLevels: 6,
  branchDensity: 0.82,
  leafDensity: 0.78,
  canopySpread: 1.24,
  crownStart: 0.45,
  rootScale: 1.55,
  moss: 0.72,
  barkColour: '#563923',
  leafColour: '#315b36'
};

const definition = resolveProceduralTreeDefinition(authored, { id: 'tree:ancient-proof', type: 'tree', x: 8, y: 6 });
equal(definition.contract, PROCEDURAL_TREE_DEFINITION_CONTRACT, 'authored Tree DNA should resolve into the BSB procedural definition contract');
equal(definition.seed, 18273, 'Tree DNA seed should remain authored truth');
equal(definition.species, 'ancient_oak', 'species should select a recipe without becoming geometry');

const first = generateProceduralTreeSkeleton(definition);
const second = generateProceduralTreeSkeleton(definition);
equal(first.contract, PROCEDURAL_TREE_SKELETON_CONTRACT, 'generator should publish one inspectable skeleton contract');
assert(JSON.stringify(first) === JSON.stringify(second), 'the same Tree DNA seed should generate the same skeleton');
assert(first.trunk.points.length >= 8, 'trunk should be a sampled spline, not a rectangle');
assert(first.branches.length >= 5, 'branches should be child splines');
assert(first.branches.every((branch) => branch.parentId === 'trunk' || branch.parentId.startsWith('branch:')), 'branch hierarchy should remain explicit');
assert(first.roots.length >= 5 && first.roots.every((root) => root.parentId === 'trunk'), 'root flares should be child splines');
assert(first.foliageClusters.length >= 6, 'healthy summer trees should generate bounded foliage lobes');
equal(first.diagnostics.lowerBranchesRemoved, 1, 'ancient trees should remove their lowest branch level procedurally');

const winter = generateProceduralTreeSkeleton(resolveProceduralTreeDefinition({ ...authored, season: 'winter' }, { id: 'tree:winter' }));
assert(winter.foliageClusters.length < first.foliageClusters.length, 'deciduous winter DNA should reduce foliage without rewriting geometry code');

const alternate = generateProceduralTreeSkeleton(resolveProceduralTreeDefinition({ ...authored, seed: 18274 }, { id: 'tree:alternate' }));
assert(JSON.stringify(alternate.trunk.points) !== JSON.stringify(first.trunk.points), 'changing only the seed should create a distinct trunk spline');

const legacyBirch = createSceneObject({ id: 'legacy-birch', type: 'birch_tree', x: 3, y: 4 });
equal(legacyBirch.type, 'tree', 'legacy species-as-type records should migrate to the canonical tree type');
equal(legacyBirch.authoredType, 'birch_tree', 'legacy provenance should remain inspectable');
equal(legacyBirch.treeDefinition.species, 'silver_birch', 'legacy birch type should resolve through the birch species recipe');
equal(legacyBirch.render.kind, 'procedural_tree', 'all living tree variants should use one procedural renderer path');
assert(legacyBirch.visualWidthTiles > legacyBirch.collisionFootprint.w, 'procedural canopy size should remain separate from collision truth');

