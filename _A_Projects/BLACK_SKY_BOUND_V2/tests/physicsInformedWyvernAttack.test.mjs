import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { Faction } from '../src/constants/factions.js';
import { CONFIG } from '../src/config.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { WYVERN_ACTION_PROFILES, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { getComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { createDemoMap } from '../src/world/map.js';
import { createCamera } from '../src/render/camera.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { buildWebGLPlayerWyvernSilhouette } from '../src/render/backends/webgl/WebGLWyvernSilhouette.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { wyvernAttackContactSystem } from '../src/systems/wyvernAttackContactSystem.js';
import { impactResponseSystem } from '../src/systems/impactResponseSystem.js';

const biteProfile = WYVERN_ACTION_PROFILES[WyvernActionId.BITE_ATTACK];
const clawProfile = WYVERN_ACTION_PROFILES[WyvernActionId.RIGHT_CLAW_SWIPE];
const lungeProfile = WYVERN_ACTION_PROFILES[WyvernActionId.LUNGE_ATTACK];
assertContactContract(biteProfile, 'jaw_head_front', 'capsule');
assertContactContract(clawProfile, 'primary_wrist_claw', 'front_arc_band');
assertContactContract(lungeProfile, 'chest_body_front', 'capsule');
assert(biteProfile.contact.impactDirection !== clawProfile.contact.impactDirection, 'bite and claw should declare different impact direction modes');
assert(biteProfile.poseOffsets.chestForward > 0.12, 'bite profile should drive shoulders forward instead of only pulling the head out');
assert(clawProfile.duration >= 0.5, 'claw profile should hold a longer readable swipe window');
assert(clawProfile.poseOffsets.wristAcross > 0.85, 'claw profile should carry an audibly broad wing-swipe arc');

const inactive = createHarness();
const inactiveTarget = firstEnemy(inactive.game);
const inactiveTargetHealth = getComponent(inactive.game.world, inactiveTarget, ComponentType.Health);
startActionAtPhase(inactive.game, WyvernActionId.BITE_ATTACK, AbilityId.BITE_CLAW, 0.18);
const inactivePose = getPlayerPose(inactive.game);
equal(inactivePose.attackContact.active, false, 'bite contact should be inactive before the impact phase');
placeAtContact(inactive.game, inactiveTarget, inactivePose.attackContact);
wyvernAttackContactSystem({ game: inactive.game });
equal(inactiveTargetHealth.hp, inactiveTargetHealth.maxHp, 'inactive contact window should not apply damage');

const bite = createHarness();
const biteTarget = firstEnemy(bite.game);
const biteTargetTransform = getComponent(bite.game.world, biteTarget, ComponentType.Transform);
const biteTargetHealth = getComponent(bite.game.world, biteTarget, ComponentType.Health);
const biteImpact = getComponent(bite.game.world, biteTarget, ComponentType.ImpactResponse);
startActionAtPhase(bite.game, WyvernActionId.BITE_ATTACK, AbilityId.BITE_CLAW, 0.54);
const bitePose = getPlayerPose(bite.game);
assert(bitePose.attackContact.active, 'bite contact should be active near max extension');
assert(bitePose.bodyOffsets.chest.forward > 0.1, 'active bite pose should lunge the shoulders forward');
placeAtContact(bite.game, biteTarget, bitePose.attackContact);
wyvernAttackContactSystem({ game: bite.game });
assert(biteTargetHealth.hp < biteTargetHealth.maxHp, 'active bite contact should apply damage');
assert(biteImpact.staggerTimer > 0, 'bite impact should write stagger response');
assert(Math.hypot(biteImpact.knockbackVelocityX, biteImpact.knockbackVelocityY) > 0, 'bite impact should write bounded knockback velocity');
assert(biteImpact.lastImpact.contactBodyPart === 'jaw_head_front', 'bite impact should record the driving body part');
const hpAfterBite = biteTargetHealth.hp;
wyvernAttackContactSystem({ game: bite.game });
equal(biteTargetHealth.hp, hpAfterBite, 'one contact window should not damage the same target repeatedly');
impactResponseSystem({ game: bite.game, map: bite.map, dt: 1 / 12 });
assert(Math.hypot(biteTargetTransform.x - bitePose.attackContact.x, biteTargetTransform.y - bitePose.attackContact.y) > 0.01, 'impact response should move the target from knockback');

const claw = createHarness();
startActionAtPhase(claw.game, WyvernActionId.RIGHT_CLAW_SWIPE, AbilityId.BITE_CLAW, 0.5, { aimX: playerTransform(claw.game).x, aimY: playerTransform(claw.game).y + 4 });
const clawPose = getPlayerPose(claw.game);
assert(clawPose.attackContact.active, 'claw contact should be active during the sweep phase');
equal(clawPose.attackContact.contactShape, 'front_arc_band', 'claw contact should be a front-band arc approximation, not a generic circle');
assert(Math.abs(dot(clawPose.attackContact.impactDirectionVector, clawPose.attackContact.right)) > 0.5, 'claw impact should carry a lateral/diagonal vector relative to its committed facing');
assert(dot(bitePose.attackContact.impactDirectionVector, bitePose.attackContact.forward) > Math.abs(dot(bitePose.attackContact.impactDirectionVector, bitePose.attackContact.right)), 'bite impact should be mostly forward relative to its committed facing');
equal(clawPose.attackContact.side, 1, 'right claw profile should lock the contact side to the right sweep');

syncGameViews(claw.game);
const projection = buildRenderProjection({
  time: 0,
  map: claw.map,
  game: claw.game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, claw.map)
}, CONFIG);
const playerPacket = projection.actors.find((actor) => actor.id === claw.game.dragonId);
const projectedContact = playerPacket.wyvernProjection.proceduralPose.attackContact;
equal(projectedContact.classification, 'procedural_attack_contact_volume', 'render projection should receive the contact contract');
assert(projectedContact.active && projectedContact.worldWidth > 0 && projectedContact.worldLength > 0, 'projected contact should expose active world-space debug dimensions');
const mesh = buildWebGLPlayerWyvernSilhouette(playerPacket);
equal(mesh.rects.length, 0, 'WebGL wyvern silhouette should keep attack contact debug fills opt-in for gameplay readability');

const silhouetteSource = readFileSync(new URL('../src/render/backends/webgl/WebGLWyvernSilhouette.js', import.meta.url), 'utf8');
assert(!silhouetteSource.includes('applyDamageToEntity'), 'WebGL silhouette should not own hit logic');
equal(RENDER_BUDGETS.renderer.canvas2dRuntimeAvailable, false, 'Canvas 2D runtime fallback should remain unavailable');

function assertContactContract(profile, bodyPart, shape) {
  assert(profile.contact, `${profile.id} should define a contact window`);
  equal(profile.contact.contactBodyPart, bodyPart, `${profile.id} should name its driving contact body part`);
  equal(profile.contact.contactShape, shape, `${profile.id} should define its v0 contact shape`);
  assert(profile.contact.activePhaseStart < profile.contact.activePhaseEnd, `${profile.id} contact window should have ordered phase bounds`);
  for (const key of ['contactOffset', 'contactSize', 'impactStrength', 'staggerStrength']) {
    assert(key in profile.contact, `${profile.id} contact should include ${key}`);
  }
}

function createHarness() {
  const map = createDemoMap();
  return { map, game: createInitialGameState(map) };
}

function startActionAtPhase(game, actionId, abilityId, phase, options = {}) {
  const transform = playerTransform(game);
  startProceduralAction(game.world, game.dragonId, actionId, {
    sourceAbilityId: abilityId,
    aimX: options.aimX ?? transform.x + 3,
    aimY: options.aimY ?? transform.y
  });
  const profile = WYVERN_ACTION_PROFILES[actionId];
  proceduralActionSystem({ game, dt: profile.duration * phase });
  wyvernProjectionSystem({ game, dt: profile.duration * phase });
}

function getPlayerPose(game) {
  return getComponent(game.world, game.dragonId, ComponentType.ProceduralPose);
}

function playerTransform(game) {
  return getComponent(game.world, game.dragonId, ComponentType.Transform);
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

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}
