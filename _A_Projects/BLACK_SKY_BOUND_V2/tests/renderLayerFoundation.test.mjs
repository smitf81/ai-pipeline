import { assert, equal } from './assert.mjs';
import { createWorld } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { VISUAL_RECIPES, VisualRecipeId } from '../src/data/visualRecipes.js';
import { createRenderLayerState, addDecalStamp, getRenderLayerStats } from '../src/projection/renderLayerState.js';
import { spawnEffect, spawnSmokeCloud, spawnVisualRecipe } from '../src/game/spawn.js';

for (const recipe of Object.values(VISUAL_RECIPES)) {
  assert(recipe.classification, `recipe ${recipe.id} should declare its classification`);
  for (const effect of recipe.liveEffects ?? []) {
    assert(effect.lifetime > 0 && effect.lifetime <= 1.5, `recipe ${recipe.id} live effect should be short-lived`);
  }
}

const effectWorld = createWorld();
const effectDiagnostics = { droppedLiveEffects: 0 };
for (let i = 0; i < RENDER_BUDGETS.liveEffects.maxActive + 12; i += 1) {
  spawnEffect(effectWorld, { kind: 'test_ring', x: i, y: 0, radius: 1, lifetime: 1 }, effectDiagnostics);
}
equal(query(effectWorld, [ComponentType.Effect]).length, RENDER_BUDGETS.liveEffects.maxActive, 'live effects should be capped');
assert(effectDiagnostics.droppedLiveEffects > 0, 'live effect budget drops should be recorded');

const smokeWorld = createWorld();
const smokeDiagnostics = { droppedSmokeClouds: 0 };
for (let i = 0; i < RENDER_BUDGETS.smokeClouds.maxActive + 4; i += 1) {
  spawnSmokeCloud(smokeWorld, i, 0, { radius: 2, slowMultiplier: 0.4, duration: 3 }, smokeDiagnostics);
}
equal(query(smokeWorld, [ComponentType.SmokeCloud]).length, RENDER_BUDGETS.smokeClouds.maxActive, 'smoke clouds should be capped');
assert(smokeDiagnostics.droppedSmokeClouds > 0, 'smoke cloud budget drops should be recorded');

const renderLayers = createRenderLayerState();
for (let i = 0; i < RENDER_BUDGETS.decalStamps.maxActive + 20; i += 1) {
  addDecalStamp(renderLayers, { kind: 'test_stamp', x: i, y: 0, radius: 0.5 });
}
const stats = getRenderLayerStats(renderLayers);
equal(stats.decalStamps, RENDER_BUDGETS.decalStamps.maxActive, 'decal stamps should be capped');
assert(stats.decalDirty, 'decal stamps should mark the cached layer dirty');
assert(stats.droppedDecalStamps > 0, 'decal budget drops should be recorded');

const recipeGame = { world: createWorld(), renderLayers: createRenderLayerState() };
const result = spawnVisualRecipe(recipeGame, VisualRecipeId.BITE_HIT, { x: 4, y: 5, radius: 1, hits: 1 });
equal(result.effects.length, 3, 'bite recipe should spawn attack flash plus bounded blood effects');
equal(result.decals.length, 2, 'bite recipe should stamp scuff plus blood stain decals on hit');
equal(query(recipeGame.world, [ComponentType.Effect]).length, 3, 'recipe live effects should be ECS-backed');
equal(recipeGame.renderLayers.decals.stamps.length, 2, 'recipe decals should be projection-state-backed');
assert(recipeGame.renderLayers.decals.stamps.some((stamp) => stamp.visualMaterial === 'residual_blood_spatter_stain_v0'), 'bite recipe should preserve blood stain material metadata');
