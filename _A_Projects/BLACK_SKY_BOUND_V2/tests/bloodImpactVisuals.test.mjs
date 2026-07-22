import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { Faction } from '../src/constants/factions.js';
import { WYVERN_ACTION_PROFILES, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { VisualRecipeId } from '../src/data/visualRecipes.js';
import { getComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { WebGLDecalLayer } from '../src/render/backends/webgl/layers/WebGLDecalLayer.js';
import { WebGLEffectLayer } from '../src/render/backends/webgl/layers/WebGLEffectLayer.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { wyvernAttackContactSystem } from '../src/systems/wyvernAttackContactSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
const target = firstEnemy(game);
const targetHealth = getComponent(game.world, target, ComponentType.Health);

startActionAtPhase(game, WyvernActionId.BITE_ATTACK, AbilityId.BITE_CLAW, 0.54);
const contact = getPlayerPose(game).attackContact;
placeAtContact(game, target, contact);
wyvernAttackContactSystem({ game });

assert(targetHealth.hp < targetHealth.maxHp, 'bite contact should still apply damage');
equal(query(game.world, [ComponentType.Effect]).length, 3, 'resolved bite contact should spawn recipe-owned attack and blood effects');
assert(game.renderLayers.decals.stamps.some((stamp) => stamp.visualMaterial === 'residual_blood_spatter_stain_v0'), 'resolved bite contact should stamp blood material into decal state');

syncGameViews(game);
const projection = buildRenderProjection({
  time: 0.08,
  map,
  game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map)
}, CONFIG);
const bloodEffects = projection.effects.filter((effect) => effect.visualRole?.startsWith('blood_'));
const bloodDecals = projection.decals.filter((decal) => decal.visualMaterial === 'residual_blood_spatter_stain_v0');

equal(bloodEffects.length, 2, 'projection should expose mist and spatter as renderer-neutral blood effect packets');
assert(bloodEffects.some((effect) => effect.kind === 'blood_mist'), 'projection should include blood mist');
assert(bloodEffects.some((effect) => effect.kind === 'blood_spatter_arc'), 'projection should include directional blood spatter');
assert(bloodEffects.every((effect) => effect.recipeId === VisualRecipeId.BITE_HIT), 'blood effects should preserve their originating visual recipe id');
equal(bloodDecals.length, 1, 'projection should expose one blood stain decal packet');

const effectLayer = new WebGLEffectLayer();
effectLayer.update(projection, fakeContext());
equal(effectLayer.bloodEffectCount, 2, 'WebGL effect layer should count visible blood effect packets');
assert(effectLayer.bloodPrimitiveCount > 0, 'WebGL effect layer should batch blood into visible primitives');
assert(effectLayer.radials.length > 0, 'blood mist should produce radial mist primitives');
assert(effectLayer.triangles.length > 0, 'blood spatter should produce directional streak triangles');

const decalLayer = new WebGLDecalLayer();
decalLayer.update(projection, fakeContext());
equal(decalLayer.bloodStainCount, 1, 'WebGL decal layer should count blood stain material packets');
assert(decalLayer.bloodStainPrimitiveCount > 1, 'blood stains should render as irregular multi-radial decals');

function startActionAtPhase(game, actionId, abilityId, phase) {
  const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  startProceduralAction(game.world, game.dragonId, actionId, {
    sourceAbilityId: abilityId,
    aimX: transform.x + 3,
    aimY: transform.y
  });
  const profile = WYVERN_ACTION_PROFILES[actionId];
  proceduralActionSystem({ game, dt: profile.duration * phase });
  wyvernProjectionSystem({ game, dt: profile.duration * phase });
}

function getPlayerPose(game) {
  return getComponent(game.world, game.dragonId, ComponentType.ProceduralPose);
}

function firstEnemy(game) {
  return query(game.world, [ComponentType.Team, ComponentType.Health])
    .find((entity) => getComponent(game.world, entity, ComponentType.Team).id === Faction.ENEMY);
}

function placeAtContact(game, entity, contact) {
  const transform = getComponent(game.world, entity, ComponentType.Transform);
  transform.x = contact.x;
  transform.y = contact.y;
}

function fakeContext() {
  return {
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      viewportW: 1280,
      viewportH: 720,
      visibleWorldBounds() {
        return { left: -1000, top: -1000, right: 3000, bottom: 3000 };
      }
    },
    lightSpaceCulling: { enabled: false }
  };
}
