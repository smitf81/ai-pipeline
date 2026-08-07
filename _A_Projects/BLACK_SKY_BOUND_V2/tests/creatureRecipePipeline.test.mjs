import { assert, deepEqual, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { ACTORS } from '../src/data/actors.js';
import {
  CREATURE_RECIPE_CONTRACT,
  CREATURE_RECIPE_INSTANCE_CONTRACT,
  CreatureRecipeId,
  getCreatureRecipe,
  hashStringToSeed,
  normalizeCreatureRecipeReference,
  resolveCreatureRecipeInstance,
  validateCreatureRecipe
} from '../src/data/creatures/creatureRecipes.js';
import { createWorld, getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import { createRenderProjection3DCompiler } from '../src/projection/renderProjection3D.js';
import { createCamera } from '../src/render/camera.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { unitSpawnerSystem } from '../src/systems/unitSpawnerSystem.js';
import { createDemoMap } from '../src/world/map.js';
import { normalizeRuntimeMap } from '../src/world/runtimeMapLoader.js';

const recipe = getCreatureRecipe(CreatureRecipeId.RAIDER_SCAVENGER);
equal(recipe.contract, CREATURE_RECIPE_CONTRACT, 'raider recipe should publish the v1 public contract');
equal(ACTORS[EntityKind.RAIDER].defaultCreatureRecipeId, recipe.identity.id, 'actor identity should select recipe truth');
assert(!Object.hasOwn(ACTORS[EntityKind.RAIDER], 'hp'), 'raider HP must no longer have a second owner in ACTORS');
assert(!Object.hasOwn(ACTORS[EntityKind.RAIDER], 'ai'), 'raider AI tuning must no longer have a second owner in ACTORS');
equal(validateCreatureRecipe(recipe).ok, true, 'canonical raider recipe should validate every live registry reference');

const invalid = JSON.parse(JSON.stringify(recipe));
invalid.bodyPlan.profileId = 'unknown_humanoid';
invalid.surface.materialRoles.metal.profileId = 'unknown_material';
invalid.equipment.slots[0].attachmentIds = ['unknown_attachment'];
invalid.bodyPlan.declaredSocketIds = invalid.bodyPlan.declaredSocketIds.filter((id) => id !== 'torch_flame_socket');
invalid.attacks[0].profileId = 'unknown_attack';
invalid.audio.cues.proximity = 'unknown.audio.cue';
invalid.death.profileId = 'unknown_death';
const invalidResult = validateCreatureRecipe(invalid);
equal(invalidResult.ok, false, 'invalid referenced registries should fail the recipe contract');
for (const prefix of ['humanoid_profile_unknown', 'material_profile_unknown:metal', 'attachment_unknown:primaryWeapon', 'attack_profile_unknown:unknown_attack', 'audio_cue_unknown:proximity', 'death_profile_unknown:unknown_death']) {
  assert(invalidResult.errors.some((error) => error.startsWith(prefix)), `validator should expose ${prefix}`);
}
assert(invalidResult.errors.some((error) => error.includes('torch_flame_socket')), 'validator should expose missing authoritative sockets');

assertThrows(() => normalizeCreatureRecipeReference({ recipeId: 'missing_recipe' }), /Unknown creature recipe/, 'unknown explicit recipe should fail loudly');
assertThrows(() => normalizeCreatureRecipeReference({ recipeId: recipe.identity.id, seed: -1 }), /creature_recipe_seed_invalid/, 'negative explicit seed should fail loudly');
assertThrows(() => normalizeCreatureRecipeReference({ recipeId: recipe.identity.id, seed: 1.5 }), /creature_recipe_seed_invalid/, 'fractional explicit seed should fail loudly');

const explicit = resolveCreatureRecipeInstance({
  defaultRecipeId: recipe.identity.id,
  creature: { recipeId: recipe.identity.id, seed: 77 },
  sourceId: 'ignored-by-explicit-seed',
  sourceKind: 'authored_placement_id'
});
const explicitAgain = resolveCreatureRecipeInstance({
  defaultRecipeId: recipe.identity.id,
  creature: { recipeId: recipe.identity.id, seed: 77 },
  sourceId: 'different-source',
  sourceKind: 'unit_spawner_ordinal'
});
equal(explicit.contract, CREATURE_RECIPE_INSTANCE_CONTRACT, 'resolved instance should publish its v1 component contract');
equal(explicit.seed, 77, 'explicit seed should have highest precedence');
equal(explicit.seedProvenance.kind, 'explicit_seed', 'explicit seed provenance should remain inspectable');
equal(JSON.stringify(explicit.appearance), JSON.stringify(explicitAgain.appearance), 'identical recipe and explicit seed should produce byte-equivalent resolved variants');
equal(explicit.variantSignature, explicitAgain.variantSignature, 'variant signature should ignore spawn provenance when recipe and seed match');
equal(Object.isFrozen(explicit), true, 'resolved recipe component should be immutable');

const family = Array.from({ length: 100 }, (_, index) => resolveCreatureRecipeInstance({
  defaultRecipeId: recipe.identity.id,
  creature: { recipeId: recipe.identity.id, seed: index + 1 },
  sourceId: `family:${index + 1}`
}));
equal(new Set(family.map((entry) => entry.variantSignature)).size, 100, 'seeds 1-100 should produce 100 stable signatures');
assert(new Set(family.map((entry) => entry.appearance.paletteFamilyId)).size >= 4, 'seeded family should exercise every restrained palette family');
assert(new Set(family.map((entry) => entry.appearance.equipment.head.attachmentId)).size >= 3, 'seeded family should vary head treatments');
assert(new Set(family.map((entry) => entry.appearance.equipment.shoulder.attachmentId)).size >= 2, 'seeded family should vary shoulder-pad side');
assert(family.some((entry) => entry.appearance.equipment.back) && family.some((entry) => !entry.appearance.equipment.back), 'seeded family should vary optional packs');
assert(family.every((entry) => entry.appearance.equipment.primaryWeapon && entry.appearance.equipment.light), 'every visual seed should retain gameplay-required spear and torch slots');

const world = createWorld();
const raiderId = spawnActor(world, EntityKind.RAIDER, 4, 5, Faction.RAIDERS, {
  creature: { recipeId: recipe.identity.id, seed: 91 },
  sourceId: 'direct-proof'
});
const component = getComponent(world, raiderId, ComponentType.CreatureRecipe);
equal(component.seed, 91, 'spawn should install the resolved recipe component');
equal(getComponent(world, raiderId, ComponentType.Health).maxHp, 42, 'recipe-backed raider should retain HP 42');
equal(getComponent(world, raiderId, ComponentType.Motion).speed, 3.1, 'recipe-backed raider should retain speed 3.1');
equal(getComponent(world, raiderId, ComponentType.Collider).radius, 0.28, 'recipe-backed raider should retain collider radius 0.28');
equal(getComponent(world, raiderId, ComponentType.Stamina).max, 42, 'recipe-backed raider should retain stamina 42');
deepEqual(getComponent(world, raiderId, ComponentType.EnemyPressureAI).attackProfileIds, recipe.attacks.map((entry) => entry.profileId), 'recipe attack references should drive live EnemyPressureAI');
assert(getComponent(world, raiderId, ComponentType.LightEmitter), 'recipe light equipment should drive the live torch emitter');
assertThrows(() => spawnActor(createWorld(), EntityKind.HUSK, 1, 1, Faction.HUSKS, { creature: { recipeId: recipe.identity.id, seed: 1 } }), /creature_recipe_actor_kind_mismatch/, 'recipe must reject the wrong actor kind');

const payload = JSON.parse(JSON.stringify(createDemoMap()));
payload.enemySpawns = [];
payload.unitPlacements = [{
  id: 'recipe-raider-authored',
  label: 'Recipe Raider',
  type: EntityKind.RAIDER,
  team: Faction.RAIDERS,
  x: 12,
  y: 11,
  creature: { recipeId: recipe.identity.id, seed: 1234 }
}];
payload.unitSpawners = [];
payload.sceneSequences = [];
const normalized = normalizeRuntimeMap(payload);
equal(normalized.unitPlacements[0].creature.seed, 1234, 'runtime-map normalization should preserve the recipe reference');
const game = createInitialGameState(normalized);
const authoredEntity = game.authoredEntities['recipe-raider-authored'];
equal(getComponent(game.world, authoredEntity, ComponentType.CreatureRecipe).seed, 1234, 'authored placement should survive load to ECS');
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
const compiler = createRenderProjection3DCompiler(CONFIG);
const projection = compiler.compile({ time: 0, map: normalized, game, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, normalized) });
const actorPacket = projection.dynamicWorld.actors.find((actor) => actor.id === authoredEntity);
equal(actorPacket.creatureRecipe.recipeId, recipe.identity.id, 'recipe identity should survive ECS to renderer-neutral 3D projection');
equal(actorPacket.creatureRecipe.seed, 1234, 'seed should survive ECS to renderer-neutral 3D projection');
equal(actorPacket.creatureRecipe.attachments.primaryWeapon.kind, 'spear', 'projection should expose resolved equipment attachment recipes');
equal(actorPacket.creatureRecipe.surface.materialRoles.metal.profileId, recipe.surface.materialRoles.metal.profileId, 'projection should expose role-based material truth');
compiler.dispose();

const spawnerMap = createDemoMap();
spawnerMap.enemySpawns = [];
spawnerMap.unitPlacements = [];
spawnerMap.unitSpawners = [{
  id: 'recipe-raider-spawner', type: EntityKind.RAIDER, team: Faction.RAIDERS, x: 9, y: 9,
  enabled: true, intervalSeconds: 1, initialDelaySeconds: 0, burstCount: 2, maxAlive: 2, limit: 2,
  spawnRadiusTiles: 0, creature: { recipeId: recipe.identity.id }
}];
const spawnedGame = createInitialGameState(spawnerMap);
unitSpawnerSystem({ game: spawnedGame, dt: 0 });
const spawnedRecipes = spawnedGame.unitSpawners[0].spawnedEntityIds.map((id) => getComponent(spawnedGame.world, id, ComponentType.CreatureRecipe));
equal(spawnedRecipes.length, 2, 'recipe spawner should produce its authored burst');
equal(spawnedRecipes[0].seed, hashStringToSeed('recipe-raider-spawner:0'), 'first spawned seed should derive from spawner id and ordinal');
equal(spawnedRecipes[1].seed, hashStringToSeed('recipe-raider-spawner:1'), 'second spawned seed should derive from spawner id and ordinal');
assert(spawnedRecipes[0].variantSignature !== spawnedRecipes[1].variantSignature, 'spawn ordinals should create distinct stable family members');
assert(spawnedRecipes.every((entry) => entry.seedProvenance.kind === 'unit_spawner_ordinal'), 'spawned provenance should identify its deterministic source');

const reloadedGame = createInitialGameState(spawnerMap);
unitSpawnerSystem({ game: reloadedGame, dt: 0 });
deepEqual(
  reloadedGame.unitSpawners[0].spawnedEntityIds.map((id) => getComponent(reloadedGame.world, id, ComponentType.CreatureRecipe).variantSignature),
  spawnedRecipes.map((entry) => entry.variantSignature),
  'reloading the same authored spawner should reproduce the same variants'
);

function assertThrows(run, pattern, message) {
  let error = null;
  try { run(); } catch (caught) { error = caught; }
  assert(error && pattern.test(String(error.message ?? error)), message);
}
