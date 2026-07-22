import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { CreatureProjectionId } from '../src/data/creatureProjections.js';
import { GroundedWyvernProportionProfileId } from '../src/data/creatures/groundedWyvernProportions.js';
import { WYVERN_ACTION_PROFILES, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { getComponent } from '../src/ecs/world.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { buildWebGLPlayerWyvernSilhouette } from '../src/render/backends/webgl/WebGLWyvernSilhouette.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const profileId = GroundedWyvernProportionProfileId.HATCHLING_SKELETAL_GAIT_V0;
const map = createDemoMap();
const game = createInitialGameState(map, {
  creatureTuning: {
    profiles: {
      [profileId]: {
        visual: { scale: 1.72 },
        tail: { length: 3.6, baseWidth: 0.82 }
      }
    }
  }
});
wyvernProjectionSystem({ game, dt: 1 / 60 });
const rigPose = getComponent(game.world, game.dragonId, ComponentType.CreatureRigPose);
equal(rigPose.classification, 'renderer_neutral_creature_rig_pose', 'runtime component should hold canonical rig pose output');
equal(rigPose.profileId, profileId, 'rig pose should record the resolved profile id');
equal(rigPose.visualScale, 1.72, 'rig pose should consume resolved visual scale override');
assert(rigPose.tail.length >= 6, 'rig pose should carry the skeletal tail directly');
assert(rigPose.visualBounds.width > 0 && rigPose.visualBounds.height > 0, 'rig pose should expose selectable visual bounds');

const folded = createDefaultHarness();
wyvernProjectionSystem({ game: folded.game, dt: 1 / 60 });
const foldedRigPose = getComponent(folded.game.world, folded.game.dragonId, ComponentType.CreatureRigPose);
const foldedRightWing = wingMetrics(foldedRigPose, 'right');
assert(foldedRightWing.trailingDepth > 0.55, 'folded wing digits should trail down the body toward the tail');
assert(foldedRightWing.span < 1.35, 'folded wing digits should stay mostly tucked rather than reading as flight span');
assert(foldedRigPose.wingForelimbs.right.digits.every((digit) => digit.foldProfile === 'folded_back_along_body_near_tail'), 'idle wing digits should advertise the folded trailing profile');

const swipe = createDefaultHarness();
startActionAtPhase(swipe.game, WyvernActionId.RIGHT_CLAW_SWIPE, AbilityId.BITE_CLAW, 0.56);
const swipePose = getComponent(swipe.game.world, swipe.game.dragonId, ComponentType.ProceduralPose);
const swipeRigPose = getComponent(swipe.game.world, swipe.game.dragonId, ComponentType.CreatureRigPose);
const swipeRightWing = wingMetrics(swipeRigPose, 'right');
const swipeLeftWing = wingMetrics(swipeRigPose, 'left');
assert(swipePose.wingForelimbs.right.digitSpread > 0.75, 'active swipe wing should fan digits only during the sweep action');
equal(swipePose.wingForelimbs.left.digitSpread, 0, 'bracing wing should remain folded while the opposite wing sweeps');
assert(swipeRightWing.span > foldedRightWing.span + 0.25, 'active swipe wing should show broader span than the folded idle profile');
assert(swipeLeftWing.span < foldedRightWing.span + 0.05, 'non-sweeping wing should not open into a broad flight silhouette');

syncGameViews(game);
const renderProjection = buildRenderProjection({
  time: 0,
  map,
  game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map)
}, CONFIG);
const playerPacket = renderProjection.actors.find((actor) => actor.id === game.dragonId);
equal(playerPacket.wyvernProjection.recipeId, CreatureProjectionId.GROUNDED_WYVERN_HATCHLING, 'player packet should preserve recipe id');
equal(playerPacket.wyvernProjection.rigPose.classification, 'renderer_neutral_creature_rig_projection', 'render projection should carry world-space rig pose');
equal(playerPacket.wyvernProjection.rigPose.visualScale, 1.72, 'render projection should preserve resolved visual scale');
assert(playerPacket.wyvernProjection.rigPose.visualBounds.worldWidth > playerPacket.worldRadius, 'world bounds should be projected for runtime selection/proof');
const mesh = buildWebGLPlayerWyvernSilhouette(playerPacket);
assert(mesh.triangles.length > 0 && mesh.partCount >= 33, 'WebGL silhouette should render from canonical rig packet');

function createDefaultHarness() {
  const defaultMap = createDemoMap();
  return { map: defaultMap, game: createInitialGameState(defaultMap) };
}

function startActionAtPhase(game, actionId, abilityId, phase) {
  const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  startProceduralAction(game.world, game.dragonId, actionId, {
    sourceAbilityId: abilityId,
    aimX: transform.x + 3,
    aimY: transform.y,
    sideOverride: actionId === WyvernActionId.RIGHT_CLAW_SWIPE ? 1 : undefined
  });
  const action = WYVERN_ACTION_PROFILES[actionId];
  proceduralActionSystem({ game, dt: action.duration * phase });
  wyvernProjectionSystem({ game, dt: action.duration * phase });
}

function wingMetrics(rigPose, side) {
  const wing = rigPose.wingForelimbs[side];
  const sideSign = side === 'left' ? -1 : 1;
  const basis = basisFromAxial(rigPose.axial);
  const digits = wing.digits ?? [];
  return {
    span: Math.max(0, ...digits.map((digit) => sideSign * project(digit.tip, rigPose.axial.chest, basis.right))),
    trailingDepth: Math.max(0, ...digits.map((digit) => -project(digit.tip, rigPose.axial.hips, basis.forward)))
  };
}

function basisFromAxial(axial) {
  const dx = axial.head.x - axial.hips.x;
  const dy = axial.head.y - axial.hips.y;
  const length = Math.hypot(dx, dy) || 1;
  const forward = { x: dx / length, y: dy / length };
  return { forward, right: { x: -forward.y, y: forward.x } };
}

function project(point, origin, axis) {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y;
}
