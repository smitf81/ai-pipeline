import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { CreatureProjectionId, getCreatureProjectionRecipe } from '../src/data/creatureProjections.js';
import { GroundedWyvernProportionProfileId } from '../src/data/creatures/groundedWyvernProportions.js';
import { WYVERN_ACTION_PROFILES, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createCamera } from '../src/render/camera.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { buildWebGLPlayerWyvernSilhouette } from '../src/render/backends/webgl/WebGLWyvernSilhouette.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { createDemoMap } from '../src/world/map.js';

const recipe = getCreatureProjectionRecipe(CreatureProjectionId.GROUNDED_WYVERN_HATCHLING);
const profile = recipe.proportionProfile;
equal(profile.id, GroundedWyvernProportionProfileId.HATCHLING_SKELETAL_GAIT_V0, 'wyvern recipe should own the skeletal gait proportion profile');
equal(profile.classification, 'wyvern_proportion_profile', 'proportion profile should declare its authority class');
assert(profile.completedPasses.includes('head_neck_shoulders_first_pass'), 'grounded balance profile should retain the prior front-body pass contract');
assert(profile.completedPasses.includes('rear_hips_tail_counterbalance_pass'), 'grounded balance profile should name the rear/tail pass contract');
assert(profile.completedPasses.includes('skeletal_tail_gait_foundation_pass'), 'grounded balance profile should name the skeletal gait pass contract');
assert(profile.completedPasses.includes('template_slim_aesthetic_pass'), 'grounded balance profile should record the slim aesthetic pass contract');
assert(profile.skeleton.tailBoneRoles.length >= 6, 'skeletal profile should define enough tail bones for runtime readability');
assert(profile.head.length > profile.head.width, 'head should define readable forward mass');
assert(profile.neck.segmentCount >= 4 && profile.neck.chainLength > profile.torso.width, 'neck profile should define a longer segmented silhouette');
assert(profile.shoulders.width > profile.hips.width, 'shoulders should read heavier than hips in this pass');
assert(profile.forelimb.groundContactSpacing > profile.hindLeg.groundContactSpacing, 'front wrist anchors should define the wider grounded support stance');
assert(profile.tail.taper[0] > profile.tail.taper.at(-1), 'tail profile should define taper for counterbalance readability');
assert(profile.torso.width < profile.shoulders.width * 0.55, 'torso should stay slim relative to shoulder sockets');
assert(profile.hips.width < profile.shoulders.width * 0.65 && profile.hips.haunchWidth < profile.torso.width, 'rear mass should support the gait without making the body chunky');
assert(profile.tail.baseWidth / profile.tail.length < 0.14, 'tail base should stay narrow relative to total tail length');
assert(profile.tail.length > profile.torso.length, 'tail should be long enough to read as a counterbalance');
equal(recipe.wingAnatomy.foldedTrailBias, 'folded_back_along_body_near_tail', 'wing anatomy should name the folded trailing wing profile');
assert(recipe.wingAnatomy.digitBack.at(-1) > recipe.wingAnatomy.digitOut.at(-1) * 6, 'folded wing digits should bias backward along the body more than outward into span');
assert(recipe.wingAnatomy.sweepDigitOutAdd[0] > recipe.wingAnatomy.digitOut[0], 'wing sweep should own the broad-span digit fan rather than idle anatomy');

const bite = createHarness();
startActionAtPhase(bite.game, WyvernActionId.BITE_ATTACK, AbilityId.BITE_CLAW, 0.54);
const bitePose = poseOf(bite.game);
equal(bitePose.proportionProfileId, profile.id, 'procedural pose should record the consumed proportion profile');
assert(bitePose.constraintState?.clamped, 'bite pose should report that anatomy constraints were applied');
assert(bitePose.bodyOffsets.head.forward <= profile.constraints.maxHeadForward + 0.0001, 'head extension should be clamped by the proportion profile');
assert(bitePose.bodyOffsets.neck.forward <= profile.constraints.maxNeckForward + 0.0001, 'neck extension should be clamped by the proportion profile');
assert(bitePose.bodyOffsets.chest.forward > 0.1, 'bite shoulder drive should remain visibly forward after proportion constraints');
assert(bitePose.bodyOffsets.head.forward - bitePose.bodyOffsets.neck.forward <= profile.constraints.maxNeckHeadSeparation + 0.0001, 'head and neck should stay connected as mass');
assert(bitePose.jawOpen <= profile.constraints.maxJawOpen + 0.0001, 'jaw opening should be readable but bounded');
assert(bitePose.sockets.mouth, 'mouth socket should remain available for smoke spit after proportion constraints');

const claw = createHarness();
startActionAtPhase(claw.game, WyvernActionId.RIGHT_CLAW_SWIPE, AbilityId.BITE_CLAW, 0.5);
const clawPose = poseOf(claw.game);
assert(clawPose.wingForelimbs.right.wrist.forward <= profile.constraints.maxWristForward + 0.0001, 'claw wrist forward reach should stay within believable range');
assert(Math.abs(clawPose.wingForelimbs.right.wrist.right) <= profile.constraints.maxWristLateral + 0.0001, 'claw wrist lateral sweep should stay within believable range');
assert(clawPose.wingForelimbs.left.wrist.forward <= profile.constraints.maxWristForward + 0.0001, 'bracing wrist should stay within reach constraints');

const chain = createHarness();
wyvernProjectionSystem({ game: chain.game, dt: 1 / 60 });
const projection = getComponent(chain.game.world, chain.game.dragonId, ComponentType.WyvernProjection);
projection.bodyPoints.at(-1).x += 20;
projection.bodyPoints.at(-1).y += 20;
wyvernProjectionSystem({ game: chain.game, dt: 1 / 60 });
const collider = getComponent(chain.game.world, chain.game.dragonId, ComponentType.Collider);
for (let i = 1; i < projection.bodyPoints.length; i += 1) {
  const previous = projection.bodyPoints[i - 1];
  const current = projection.bodyPoints[i];
  const maxDistance = recipe.chain.segmentLengthScales[i - 1] * collider.radius * profile.constraints.maxBodyChainStretch + 0.0001;
  assert(distance(previous, current) <= maxDistance, `body chain segment ${i} should clamp rubber-band stretch`);
}

syncGameViews(bite.game);
const renderProjection = buildRenderProjection({
  time: 0,
  map: bite.map,
  game: bite.game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, bite.map)
}, CONFIG);
const playerPacket = renderProjection.actors.find((actor) => actor.id === bite.game.dragonId);
equal(playerPacket.wyvernProjection.proportionProfile.id, profile.id, 'render projection should carry the renderer-neutral proportion profile');
equal(playerPacket.wyvernProjection.proceduralPose.constraintState.profileId, profile.id, 'render projection should carry constraint provenance');
const mesh = buildWebGLPlayerWyvernSilhouette(playerPacket);
assert(mesh.triangles.length > 0 && mesh.partCount >= 24, 'WebGL silhouette should draw the proportion-enriched wyvern packet');

const wyvernSource = readFileSync(new URL('../src/render/backends/webgl/WebGLWyvernSilhouette.js', import.meta.url), 'utf8');
assert(wyvernSource.includes('proportionProfile'), 'WebGL silhouette should consume projected proportions');
assert(!wyvernSource.includes('getWyvernActionProfile'), 'WebGL silhouette should not own action truth');
assert(!wyvernSource.includes('advanceProceduralAction'), 'WebGL silhouette should not own procedural timing');
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
    aimY: transform.y
  });
  const action = WYVERN_ACTION_PROFILES[actionId];
  proceduralActionSystem({ game, dt: action.duration * phase });
  wyvernProjectionSystem({ game, dt: action.duration * phase });
}

function poseOf(game) {
  return getComponent(game.world, game.dragonId, ComponentType.ProceduralPose);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
