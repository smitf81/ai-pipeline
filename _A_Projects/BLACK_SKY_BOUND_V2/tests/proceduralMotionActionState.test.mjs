import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { AbilityId } from '../src/constants/abilityIds.js';
import { CONFIG } from '../src/config.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { getComponent } from '../src/ecs/world.js';
import { createDemoMap } from '../src/world/map.js';
import { createCamera } from '../src/render/camera.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { buildWebGLPlayerWyvernSilhouette } from '../src/render/backends/webgl/WebGLWyvernSilhouette.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { WYVERN_ACTION_PROFILES, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';

const idleHarness = createHarness();
const idle = getWyvernComponents(idleHarness.game);
assert(idle.motionState, 'player wyvern should own MotionState');
assert(idle.actionState, 'player wyvern should own ActionState');
assert(idle.limbRig, 'player wyvern should own LimbRig');
assert(idle.proceduralPose, 'player wyvern should own ProceduralPose');
equal(idle.limbRig.contactPolicy, 'wrist_and_hind_foot_anchors_v0', 'limb rig should declare wrist/hind-foot contact anchors');

wyvernProjectionSystem({ game: idleHarness.game, dt: 1 / 60 });
equal(idle.motionState.locomotionId, 'idle', 'stationary wyvern should resolve idle locomotion');
equal(idle.proceduralPose.motionId, 'idle', 'procedural pose should carry idle motion id');
equal(idle.proceduralPose.cachePolicy, 'v0_live_solve_v1_phase_bucket_cache', 'pose should declare the v0/v1 cache strategy');
assert(idle.proceduralPose.sockets.mouth, 'procedural pose should expose a mouth socket');

const moveHarness = createHarness();
const move = getWyvernComponents(moveHarness.game);
wyvernProjectionSystem({ game: moveHarness.game, dt: 1 / 60 });
const startPhase = move.wyvernProjection.gaitPhase;
move.transform.x += 0.32;
wyvernProjectionSystem({ game: moveHarness.game, dt: 1 / 60 });
assert(move.wyvernProjection.gaitPhase > startPhase, 'gait phase should advance from actual movement');
equal(move.motionState.locomotionId, 'crawl', 'movement should switch MotionState to crawl');
assert(move.motionState.speed > 0, 'MotionState should track movement speed');
assert(Math.abs(move.proceduralPose.wingForelimbs.left.wrist.forward) > 0, 'crawl pose should move wing-forelimb wrist offsets');
assert(move.proceduralPose.contactAnchors.leftWrist.role === 'wrist_claw_contact', 'crawl pose should expose wrist contact anchors');

const biteHarness = createHarness();
const bite = getWyvernComponents(biteHarness.game);
wyvernProjectionSystem({ game: biteHarness.game, dt: 1 / 60 });
const idleHeadForward = bite.proceduralPose.bodyOffsets.head.forward;
startProceduralAction(biteHarness.game.world, biteHarness.game.dragonId, WyvernActionId.BITE_ATTACK, {
  sourceAbilityId: AbilityId.BITE_CLAW,
  aimX: bite.transform.x + 2,
  aimY: bite.transform.y
});
proceduralActionSystem({ game: biteHarness.game, dt: 0.17 });
wyvernProjectionSystem({ game: biteHarness.game, dt: 0.17 });
assert(bite.actionState.active, 'bite action state should remain active mid-strike');
assert(bite.actionState.phase > 0, 'bite action phase should advance over time');
equal(bite.proceduralPose.actionId, 'bite_attack', 'bite action should drive bite_attack pose');
assert(bite.proceduralPose.bodyOffsets.head.forward > idleHeadForward, 'bite pose should project the head forward versus idle');
assert(bite.proceduralPose.bodyOffsets.chest.forward > 0.08, 'bite pose should drive the chest and shoulders forward into the lunge');
assert(bite.proceduralPose.bodyOffsets.neck.forward > 0.3, 'bite pose should visibly extend the neck during the strike');
assert(bite.proceduralPose.jawOpen > 0.05, 'bite pose should open/jut the jaw');

const clawHarness = createHarness();
const claw = getWyvernComponents(clawHarness.game);
startProceduralAction(clawHarness.game.world, clawHarness.game.dragonId, WyvernActionId.CLAW_SWIPE_ATTACK, {
  sourceAbilityId: AbilityId.BODY_LUNGE,
  aimX: claw.transform.x,
  aimY: claw.transform.y + 3
});
proceduralActionSystem({ game: clawHarness.game, dt: WYVERN_ACTION_PROFILES[WyvernActionId.CLAW_SWIPE_ATTACK].duration * 0.56 });
wyvernProjectionSystem({ game: clawHarness.game, dt: WYVERN_ACTION_PROFILES[WyvernActionId.CLAW_SWIPE_ATTACK].duration * 0.56 });
equal(claw.proceduralPose.actionId, 'claw_swipe_attack', 'legacy claw action should still drive the claw_swipe_attack pose foundation');
assert(claw.proceduralPose.wingForelimbs.right.wrist.forward > 0.35, 'claw pose should lead from the primary wrist with a readable reach');
assert(claw.proceduralPose.wingForelimbs.right.wrist.right < -0.6, 'claw pose should sweep the wrist broadly across the body front');
assert(claw.proceduralPose.wingForelimbs.right.digitSpread > 0.75, 'claw pose should fan the primary wing digits during the sweep');
equal(claw.proceduralPose.wingForelimbs.left.digitSpread, 0, 'opposite wing should stay folded during a one-sided wing sweep');
assert(Math.abs(claw.proceduralPose.bodyOffsets.chest.right) > 0.06, 'claw pose should counter-shift the body');

syncGameViews(clawHarness.game);
const projected = buildRenderProjection({
  time: 0,
  map: clawHarness.map,
  game: clawHarness.game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, clawHarness.map)
}, CONFIG);
const playerPacket = projected.actors.find((actor) => actor.id === clawHarness.game.dragonId);
equal(playerPacket.wyvernProjection.proceduralPose.classification, 'renderer_neutral_procedural_pose_projection', 'render projection should carry a neutral procedural pose packet');
equal(playerPacket.wyvernProjection.proceduralPose.actionId, 'claw_swipe_attack', 'projected pose should preserve the legacy action id');
assert(playerPacket.wyvernProjection.proceduralPose.sockets.mouth.worldX > 0, 'projected pose sockets should include world coordinates');
assert(playerPacket.wyvernProjection.comboState, 'projected wyvern packet should include combo state for debug visibility');

const idleMesh = buildWebGLPlayerWyvernSilhouette(projectPlayerPacket(createHarness()));
const clawMesh = buildWebGLPlayerWyvernSilhouette(playerPacket);
assert(meshSignature(idleMesh) !== meshSignature(clawMesh), 'WebGL wyvern silhouette should consume procedural pose data and change mesh coordinates');

equal(RENDER_BUDGETS.renderer.canvas2dRuntimeAvailable, false, 'Canvas 2D runtime fallback should remain unavailable');

function createHarness() {
  const map = createDemoMap();
  return { map, game: createInitialGameState(map) };
}

function getWyvernComponents(game) {
  const world = game.world;
  const entity = game.dragonId;
  return {
    transform: getComponent(world, entity, ComponentType.Transform),
    wyvernProjection: getComponent(world, entity, ComponentType.WyvernProjection),
    motionState: getComponent(world, entity, ComponentType.MotionState),
    actionState: getComponent(world, entity, ComponentType.ActionState),
    limbRig: getComponent(world, entity, ComponentType.LimbRig),
    proceduralPose: getComponent(world, entity, ComponentType.ProceduralPose)
  };
}

function projectPlayerPacket(harness) {
  wyvernProjectionSystem({ game: harness.game, dt: 1 / 60 });
  syncGameViews(harness.game);
  const projection = buildRenderProjection({
    time: 0,
    map: harness.map,
    game: harness.game,
    camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, harness.map)
  }, CONFIG);
  return projection.actors.find((actor) => actor.id === harness.game.dragonId);
}

function meshSignature(mesh) {
  return mesh.triangles.map((triangle) => [
    triangle.ax.toFixed(2),
    triangle.ay.toFixed(2),
    triangle.bx.toFixed(2),
    triangle.by.toFixed(2),
    triangle.cx.toFixed(2),
    triangle.cy.toFixed(2)
  ].join(',')).join('|');
}
