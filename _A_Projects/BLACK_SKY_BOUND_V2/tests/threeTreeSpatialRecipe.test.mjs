import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import {
  BARK_PBR_MATERIAL_CONTRACT,
  BARK_PBR_TEXTURE_SET,
  createSharedBarkPbrTextures
} from '../src/render/backends/three/ThreeBarkPbrMaterial.js';
import {
  FOLIAGE_PBR_MATERIAL_CONTRACT,
  FOLIAGE_PBR_TEXTURE_SET,
  createSharedFoliagePbrTextures
} from '../src/render/backends/three/ThreeFoliagePbrMaterial.js';

equal(BARK_PBR_TEXTURE_SET.size, 1024, 'the one shared bark set should retain its authored 1K size');
equal(BARK_PBR_TEXTURE_SET.normalOrientation, 'open_gl_positive_green_v', 'bark normal orientation should be explicit');
for (const kind of ['albedo', 'normal', 'orm', 'height']) {
  const png = readFileSync(fileURLToPath(BARK_PBR_TEXTURE_SET[kind]));
  equal(png.subarray(1, 4).toString('ascii'), 'PNG', `bark ${kind} should resolve to a PNG asset`);
  equal(png.readUInt32BE(16), 1024, `bark ${kind} width should match the manifest`);
  equal(png.readUInt32BE(20), 1024, `bark ${kind} height should match the manifest`);
}
const barkTextures = createSharedBarkPbrTextures({ anisotropy: 4 });
equal(barkTextures.state.contract, BARK_PBR_MATERIAL_CONTRACT, 'bark texture loader should expose its runtime contract');
equal(barkTextures.state.status, 'headless_descriptor', 'headless validation should not pretend browser bark loading completed');
equal(barkTextures.state.textureSetCount, 1, 'all species should use exactly one bark texture set');
equal(barkTextures.uniforms.uBarkTextureFailure.value, 1, 'unloaded bark textures should remain fail-visible');
barkTextures.dispose();

equal(FOLIAGE_PBR_TEXTURE_SET.size, 1024, 'the one shared foliage set should retain its authored 1K size');
equal(FOLIAGE_PBR_TEXTURE_SET.normalOrientation, 'open_gl_positive_green_v', 'foliage normal orientation should be explicit');
for (const kind of ['albedo', 'normal', 'orm', 'height']) {
  const png = readFileSync(fileURLToPath(FOLIAGE_PBR_TEXTURE_SET[kind]));
  equal(png.subarray(1, 4).toString('ascii'), 'PNG', `foliage ${kind} should resolve to a PNG asset`);
  equal(png.readUInt32BE(16), 1024, `foliage ${kind} width should match the manifest`);
  equal(png.readUInt32BE(20), 1024, `foliage ${kind} height should match the manifest`);
}
const foliageTextures = createSharedFoliagePbrTextures({ anisotropy: 4 });
equal(foliageTextures.state.contract, FOLIAGE_PBR_MATERIAL_CONTRACT, 'foliage texture loader should expose its runtime contract');
equal(foliageTextures.state.status, 'headless_descriptor', 'headless validation should not pretend browser foliage loading completed');
equal(foliageTextures.state.textureSetCount, 1, 'all species should use exactly one foliage texture set');
equal(foliageTextures.uniforms.uFoliageTextureFailure.value, 1, 'unloaded foliage textures should remain fail-visible');
foliageTextures.dispose();

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
const barkMaterials = [];
const foliageMaterials = [];
for (const [species, seed] of [['old_pine', 6371], ['silver_birch', 1997], ['ancient_oak', 8042]]) {
  const speciesDefinition = resolveProceduralTreeDefinition({ species, seed, season: 'summer' }, { id: `topology:${species}` });
  const mesh = speciesFactory.create(speciesDefinition);
  const woodMesh = mesh.children.find((child) => child.name.endsWith(':wood'));
  const foliageMesh = mesh.children.find((child) => child.name.endsWith(':foliage'));
  const wood = woodMesh.geometry;
  barkMaterials.push(woodMesh.material);
  foliageMaterials.push(foliageMesh.material);
  const speciesTopology = auditClosedTreeGeometry(wood);
  equal(speciesTopology.connectedComponents, 1, `${species} wood should resolve to one connected component`);
  equal(speciesTopology.boundaryEdges, 0, `${species} wood should have no open boundary edges`);
  equal(speciesTopology.nonManifoldEdges, 0, `${species} wood should have no over-shared edges`);
  equal(speciesTopology.degenerateTriangles, 0, `${species} wood should have no collapsed triangles`);
  assert(speciesTopology.signedVolume > 0, `${species} wood should use outward-facing winding`);
}
equal(speciesFactory.diagnostics().barkVariantMaterialCount, 3, 'three recipes should produce three cheap shader-uniform variants');
equal(speciesFactory.diagnostics().barkPbr.textureSetCount, 1, 'recipe variants should not duplicate bark texture content');
equal(speciesFactory.diagnostics().foliageVariantMaterialCount, 3, 'three recipes should produce three cheap foliage-uniform variants');
equal(speciesFactory.diagnostics().foliagePbr.textureSetCount, 1, 'recipe variants should not duplicate foliage texture content');
assert(barkMaterials.every((material) => material.userData.barkPbr.textureSetId === BARK_PBR_TEXTURE_SET.id), 'every recipe should point at the canonical bark set');
assert(barkMaterials.every((material) => material.userData.barkPbr.sharedTextureUniforms === barkMaterials[0].userData.barkPbr.sharedTextureUniforms), 'all recipe materials should share the exact same texture uniforms');
const [pineBark, birchBark, oakBark] = barkMaterials.map((material) => material.userData.barkPbr.tuning);
assert(birchBark.saturation < pineBark.saturation && birchBark.normalStrength < oakBark.normalStrength, 'birch should reuse the bark with restrained colour and relief');
assert(new Set([pineBark.tint, birchBark.tint, oakBark.tint]).size === 3, 'recipe variants should own distinct bark tint targets');
const barkShaderProbe = {
  uniforms: {},
  vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <project_vertex>',
  fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>\n#include <aomap_fragment>\n#include <opaque_fragment>'
};
pineBark && barkMaterials[0].onBeforeCompile(barkShaderProbe);
assert(barkShaderProbe.fragmentShader.includes('barkTriplanarWeights'), 'bark should use seam-softened object-space triplanar projection on implicit meshes');
assert(barkShaderProbe.fragmentShader.includes('uBarkTextureFailure'), 'bark should preserve fail-visible texture loading');
assert(barkShaderProbe.fragmentShader.includes('uBarkSaturation'), 'bark recipe variation should remain shader-uniform driven');
assert(barkShaderProbe.fragmentShader.includes('uSceneryCharAmount'), 'bark fire-state char should remain a shared shader uniform instead of allocating a material clone');
assert(barkShaderProbe.fragmentShader.includes('uSceneryHeatAmount'), 'bark fire-state heat should remain a shared shader uniform instead of allocating a material clone');
assert(barkMaterials.every((material) => material.userData.barkPbr.sceneryStateUniforms.uSceneryEmberAmount.value === 0), 'bark recipes should precreate their dormant ember uniform');
assert(foliageMaterials.every((material) => material.userData.foliagePbr.textureSetId === FOLIAGE_PBR_TEXTURE_SET.id), 'every recipe should point at the canonical foliage set');
assert(foliageMaterials.every((material) => material.userData.foliagePbr.sharedTextureUniforms === foliageMaterials[0].userData.foliagePbr.sharedTextureUniforms), 'all foliage recipe materials should share the exact same texture uniforms');
const [pineFoliage, birchFoliage, oakFoliage] = foliageMaterials.map((material) => material.userData.foliagePbr.tuning);
assert(birchFoliage.saturation < pineFoliage.saturation && birchFoliage.normalStrength < oakFoliage.normalStrength, 'birch should reuse the foliage with restrained colour and relief');
assert(pineFoliage.textureWorldMeters < oakFoliage.textureWorldMeters, 'pine should read as denser foliage through recipe scale rather than duplicate imagery');
assert(new Set([pineFoliage.tint, birchFoliage.tint, oakFoliage.tint]).size === 3, 'recipe variants should own distinct foliage tint targets');
const foliageShaderProbe = {
  uniforms: {},
  vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <project_vertex>',
  fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>\n#include <aomap_fragment>\n#include <opaque_fragment>'
};
foliageMaterials[0].onBeforeCompile(foliageShaderProbe);
assert(foliageShaderProbe.fragmentShader.includes('foliageDominantUv'), 'foliage should use the single-sample dominant-axis projection on instanced canopy blobs');
assert(foliageShaderProbe.fragmentShader.includes('uFoliageTextureFailure'), 'foliage should preserve fail-visible texture loading');
assert(foliageShaderProbe.fragmentShader.includes('uFoliageSaturation'), 'foliage recipe variation should remain shader-uniform driven');
assert(foliageShaderProbe.fragmentShader.includes('uSceneryCharAmount'), 'foliage fire-state char should remain a shared shader uniform instead of allocating a material clone');
assert(foliageShaderProbe.fragmentShader.includes('uSceneryHeatAmount'), 'foliage fire-state heat should remain a shared shader uniform instead of allocating a material clone');
assert(foliageMaterials.every((material) => material.userData.foliagePbr.sceneryStateUniforms.uSceneryEmberAmount.value === 0), 'foliage recipes should precreate their dormant ember uniform');
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
