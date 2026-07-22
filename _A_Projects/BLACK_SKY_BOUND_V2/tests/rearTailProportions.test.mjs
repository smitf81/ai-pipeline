import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { CreatureProjectionId, getCreatureProjectionRecipe } from '../src/data/creatureProjections.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { WYVERN_ACTION_PROFILES, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { buildWebGLPlayerWyvernSilhouette } from '../src/render/backends/webgl/WebGLWyvernSilhouette.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const recipe = getCreatureProjectionRecipe(CreatureProjectionId.GROUNDED_WYVERN_HATCHLING);
const profile = recipe.proportionProfile;
equal(profile.focus, 'template_slim_aesthetic_pass', 'profile should expose the active slim aesthetic pass focus');
assert(profile.completedPasses.includes('head_neck_shoulders_first_pass'), 'rear/tail pass should keep the previous head/neck/shoulder work active');
assert(profile.completedPasses.includes('rear_hips_tail_counterbalance_pass'), 'skeletal gait pass should keep the previous rear/tail pass active');
assert(profile.completedPasses.includes('template_slim_aesthetic_pass'), 'skeletal gait pass should record the slimmer aesthetic correction');
assert(profile.hips.width > profile.torso.width, 'hips should still support the rear gait while staying slimmer than the shoulder mass');
assert(profile.hindLeg.footLength > profile.jaw.width * 1.7, 'hind feet should remain readable supports after slimming');
assert(profile.tail.length > sum(recipe.chain.segmentLengthScales.slice(3)) * 1.8, 'tail skeleton should no longer be limited to the short rear body-chain span');
assert(profile.skeleton.tailBoneRoles.length === profile.tail.taper.length, 'tail skeleton roles should align with drawable taper widths');
assert(profile.tail.counterReach > 0 && profile.tail.counterbalanceLag > 0, 'tail profile should define counterbalance behavior');

const lunge = createHarness();
startActionAtPhase(lunge.game, WyvernActionId.LUNGE_ATTACK, AbilityId.BODY_LUNGE, 0.46);
const lungePose = poseOf(lunge.game);
equal(lungePose.actionId, WyvernActionId.LUNGE_ATTACK, 'lunge should drive the pose used for rear support proof');
assert(lungePose.bodyOffsets.hips.forward < 0, 'hips should settle rearward under front-drive load');
assert(lungePose.bodyOffsets.tailBase.forward < 0, 'tail base should counterbalance rearward');
assert(lungePose.bodyOffsets.tailMid.forward < lungePose.bodyOffsets.tailBase.forward, 'tail middle should extend farther back than the base');
assert(lungePose.bodyOffsets.tailTip.forward < lungePose.bodyOffsets.tailMid.forward, 'tail tip should extend farthest back for counterbalance');
assert(lungePose.bodyOffsets.tailTip.forward >= -profile.constraints.maxTailForward - 0.0001, 'tail reach should stay within profile constraints');
assert(lungePose.hindLegs.left.ankle.forward >= -profile.constraints.maxHindAnkleForward - 0.0001, 'left hind ankle brace should stay bounded');
assert(lungePose.hindLegs.right.ankle.forward >= -profile.constraints.maxHindAnkleForward - 0.0001, 'right hind ankle brace should stay bounded');

const claw = createHarness();
startActionAtPhase(claw.game, WyvernActionId.RIGHT_CLAW_SWIPE, AbilityId.BITE_CLAW, 0.5);
const clawPose = poseOf(claw.game);
assert(Math.abs(clawPose.bodyOffsets.chest.right) > 0.01, 'claw action should create lateral front-body drive');
assert(Math.sign(clawPose.bodyOffsets.tailTip.right) === -Math.sign(clawPose.bodyOffsets.chest.right), 'tail tip should counter-swing opposite lateral front-body drive');
assert(Math.abs(clawPose.bodyOffsets.tailTip.right) <= profile.constraints.maxTailBend * 1.9 + 0.0001, 'tail counter-swing should stay bounded');

syncGameViews(lunge.game);
const renderProjection = buildRenderProjection({
  time: 0,
  map: lunge.map,
  game: lunge.game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, lunge.map)
}, CONFIG);
const playerPacket = renderProjection.actors.find((actor) => actor.id === lunge.game.dragonId);
equal(playerPacket.wyvernProjection.proportionProfile.focus, 'template_slim_aesthetic_pass', 'render projection should carry the slim aesthetic profile focus');
equal(playerPacket.wyvernProjection.proceduralPose.constraintState.maxTailForward, profile.constraints.maxTailForward, 'render projection should carry tail constraint provenance');
const skeletalTail = playerPacket.wyvernProjection.rigPose.tail;
equal(skeletalTail.length, profile.skeleton.tailBoneRoles.length, 'render projection should carry every skeletal tail point');
const tailSpan = distance(skeletalTail[0], skeletalTail.at(-1));
assert(tailSpan >= playerPacket.worldRadius * 2.45, 'projected skeletal tail should have enough world-space span to read at gameplay scale');
assert(skeletalTail.at(-1).worldX < skeletalTail[0].worldX - playerPacket.worldRadius * 2.1, 'tail tip should extend clearly behind the hips at default facing');
assert(skeletalTail[0].worldWidth > skeletalTail.at(-1).worldWidth * 3.5, 'skeletal tail should visibly taper from root to tip');
const leftHind = playerPacket.wyvernProjection.rigPose.hindLegs.left;
assert(leftHind.ankle.worldX < leftHind.hip.worldX, 'skeletal hind ankle should sit behind the hip for grounded support');
const mesh = buildWebGLPlayerWyvernSilhouette(playerPacket);
assert(mesh.partCount >= 33, 'WebGL silhouette should include skeleton-driven hips, hind legs, and tail parts');
assert(mesh.triangles.length >= 930, 'skeletal tail pass should visibly enrich the WebGL mesh');

const wyvernSource = readFileSync(new URL('../src/render/backends/webgl/WebGLWyvernSilhouette.js', import.meta.url), 'utf8');
assert(wyvernSource.includes('addHipMass'), 'WebGL silhouette should draw profile-owned hip mass');
assert(wyvernSource.includes('rootMass'), 'WebGL silhouette should draw a profile-owned tail root');
assert(wyvernSource.includes('rigPose'), 'WebGL silhouette should consume projected creature rig pose data');
assert(wyvernSource.includes('hindLeg'), 'WebGL silhouette should consume projected hind-leg profile data');
assert(!wyvernSource.includes('getWyvernActionProfile'), 'WebGL silhouette should not own action truth');
equal(RENDER_BUDGETS.renderer.canvas2dRuntimeAvailable, false, 'Canvas 2D runtime fallback should remain unavailable');

function createHarness() {
  const map = createDemoMap();
  return { map, game: createInitialGameState(map) };
}

function startActionAtPhase(game, actionId, abilityId, phase) {
  const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  startProceduralAction(game.world, game.dragonId, actionId, {
    sourceAbilityId: abilityId,
    aimX: transform.x + 3,
    aimY: transform.y,
    force: true
  });
  const action = WYVERN_ACTION_PROFILES[actionId];
  proceduralActionSystem({ game, dt: action.duration * phase });
  wyvernProjectionSystem({ game, dt: action.duration * phase });
}

function poseOf(game) {
  return getComponent(game.world, game.dragonId, ComponentType.ProceduralPose);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function distance(a, b) {
  return Math.hypot(a.worldX - b.worldX, a.worldY - b.worldY);
}
