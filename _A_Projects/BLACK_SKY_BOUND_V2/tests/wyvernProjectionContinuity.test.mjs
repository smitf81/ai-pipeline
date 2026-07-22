import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { ACTION_SYSTEM_NAMES } from '../src/game/systemOrder.js';
import { WYVERN_ACTION_PROFILES, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getCreatureProjectionRecipe } from '../src/data/creatureProjections.js';
import { dodgeSystem } from '../src/systems/dodgeSystem.js';
import { startDodge } from '../src/systems/dodgeState.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { wyvernActionImpulseSystem } from '../src/systems/wyvernActionImpulseSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

assert(
  ACTION_SYSTEM_NAMES.indexOf('proceduralActionSystem') < ACTION_SYSTEM_NAMES.indexOf('wyvernActionImpulseSystem'),
  'action timing should resolve before action movement'
);
assert(
  ACTION_SYSTEM_NAMES.indexOf('wyvernActionImpulseSystem') < ACTION_SYSTEM_NAMES.indexOf('wyvernProjectionSystem'),
  'lunge movement should update the canonical transform before wyvern projection'
);

const transported = createHarness();
wyvernProjectionSystem({ game: transported.game, dt: 1 / 60 });
const transportedTransform = component(transported, ComponentType.Transform);
const transportedProjection = component(transported, ComponentType.WyvernProjection);
const transportedCollider = component(transported, ComponentType.Collider);
const recipe = getCreatureProjectionRecipe(transportedProjection.recipeId);
transportedTransform.x += 1.7;
transportedTransform.y -= 0.8;
transportedTransform.rotation = Math.PI / 2;
wyvernProjectionSystem({ game: transported.game, dt: 1 / 60 });
assert(distance(transportedProjection.bodyPoints[0], transportedTransform) < 0.001, 'root transport should keep the axial head attached after sudden movement');
const forward = { x: Math.cos(transportedTransform.rotation), y: Math.sin(transportedTransform.rotation) };
const tail = transportedProjection.bodyPoints.at(-1);
assert(dot({ x: tail.x - transportedTransform.x, y: tail.y - transportedTransform.y }, forward) < -0.5, 'root transport should carry the chain through a sudden facing change');
for (let index = 1; index < transportedProjection.bodyPoints.length; index += 1) {
  const maxDistance = recipe.chain.segmentLengthScales[index - 1] * transportedCollider.radius * recipe.proportionProfile.constraints.maxBodyChainStretch + 0.0001;
  assert(distance(transportedProjection.bodyPoints[index - 1], transportedProjection.bodyPoints[index]) <= maxDistance, 'transported chain segments should remain connected');
}

const lunge = createHarness();
const lungeTransform = component(lunge, ComponentType.Transform);
startProceduralAction(lunge.game.world, lunge.game.dragonId, WyvernActionId.LUNGE_ATTACK, {
  sourceAbilityId: AbilityId.BODY_LUNGE,
  aimX: lungeTransform.x + 4,
  aimY: lungeTransform.y
});
const lungeProfile = WYVERN_ACTION_PROFILES[WyvernActionId.LUNGE_ATTACK];
proceduralActionSystem({ game: lunge.game, dt: lungeProfile.duration * 0.35 });
const lungeStartX = lungeTransform.x;
wyvernActionImpulseSystem({ game: lunge.game, map: lunge.map, dt: 1 / 30 });
wyvernProjectionSystem({ game: lunge.game, dt: 1 / 30 });
const lungeProjection = component(lunge, ComponentType.WyvernProjection);
assert(lungeTransform.x > lungeStartX, 'lunge impulse should move the canonical transform');
assert(distance(lungeProjection.bodyPoints[0], lungeTransform) < 0.001, 'same-tick lunge projection should stay attached to the moved transform');
equal(lungeProjection.lastX, lungeTransform.x, 'projection should consume the post-lunge transform in the same tick');

const actionRecovery = createHarness();
const recoveryTransform = component(actionRecovery, ComponentType.Transform);
const biteProfile = WYVERN_ACTION_PROFILES[WyvernActionId.BITE_ATTACK];
startProceduralAction(actionRecovery.game.world, actionRecovery.game.dragonId, WyvernActionId.BITE_ATTACK, {
  sourceAbilityId: AbilityId.BITE_CLAW,
  aimX: recoveryTransform.x + 3,
  aimY: recoveryTransform.y
});
proceduralActionSystem({ game: actionRecovery.game, dt: biteProfile.duration * 0.75 });
wyvernProjectionSystem({ game: actionRecovery.game, dt: 1 / 60 });
proceduralActionSystem({ game: actionRecovery.game, dt: biteProfile.duration * 0.1 });
wyvernProjectionSystem({ game: actionRecovery.game, dt: 1 / 60 });
const actionState = component(actionRecovery, ComponentType.ActionState);
const recoveryPose = component(actionRecovery, ComponentType.ProceduralPose);
assert(!actionState.active && actionState.recovering, 'completed action should unlock gameplay while retaining visual recovery');
equal(actionState.recoveryActionId, WyvernActionId.BITE_ATTACK, 'visual recovery should retain action provenance');
equal(recoveryPose.actionStateKind, 'visual_recovery', 'procedural pose should expose the recovery stage');
equal(recoveryPose.actionId, WyvernActionId.BITE_ATTACK, 'recovery should blend the previous action pose instead of snapping to idle');
equal(recoveryPose.attackContact, null, 'visual-only recovery must not retain gameplay contact authority');
proceduralActionSystem({ game: actionRecovery.game, dt: actionState.recoveryDuration + 0.01 });
wyvernProjectionSystem({ game: actionRecovery.game, dt: 1 / 60 });
assert(!actionState.recovering, 'action recovery should finish within its bounded blend duration');
equal(component(actionRecovery, ComponentType.ProceduralPose).actionId, null, 'finished recovery should settle into locomotion pose');

const dodgeRecovery = createHarness();
const dodgeTransform = component(dodgeRecovery, ComponentType.Transform);
assert(startDodge(dodgeRecovery.game.world, dodgeRecovery.game.dragonId, { x: 1, y: 0 }, 'projection_continuity_test'), 'dodge recovery fixture should start');
dodgeSystem({ game: dodgeRecovery.game, map: dodgeRecovery.map, dt: 0.08 });
wyvernProjectionSystem({ game: dodgeRecovery.game, dt: 0.08 });
dodgeSystem({ game: dodgeRecovery.game, map: dodgeRecovery.map, dt: 0.08 });
wyvernProjectionSystem({ game: dodgeRecovery.game, dt: 0.08 });
const dodgeState = component(dodgeRecovery, ComponentType.DodgeState);
const dodgeLandingX = dodgeTransform.x;
assert(!dodgeState.active && dodgeState.recovering, 'dodge should enter visual landing recovery after displacement ends');
equal(component(dodgeRecovery, ComponentType.MotionState).locomotionId, 'dodge', 'landing recovery should keep the explicit dodge pose active');
dodgeSystem({ game: dodgeRecovery.game, map: dodgeRecovery.map, dt: dodgeState.visualRecoveryDuration * 0.5 });
wyvernProjectionSystem({ game: dodgeRecovery.game, dt: dodgeState.visualRecoveryDuration * 0.5 });
equal(dodgeTransform.x, dodgeLandingX, 'visual dodge recovery should not add hidden gameplay displacement');
assert(component(dodgeRecovery, ComponentType.MotionState).movement01 > 0, 'landing recovery should retain a fading visual motion weight');
dodgeSystem({ game: dodgeRecovery.game, map: dodgeRecovery.map, dt: dodgeState.visualRecoveryDuration * 0.5 + 0.001 });
wyvernProjectionSystem({ game: dodgeRecovery.game, dt: 1 / 60 });
assert(!dodgeState.recovering, 'dodge recovery should finish deterministically');
equal(component(dodgeRecovery, ComponentType.MotionState).locomotionId, 'idle', 'finished dodge recovery should settle into idle locomotion');

function createHarness() {
  const map = createDemoMap();
  map.enemySpawns = [];
  map.unitPlacements = [];
  map.unitSpawners = [];
  return { map, game: createInitialGameState(map) };
}

function component(harness, type) {
  return getComponent(harness.game.world, harness.game.dragonId, type);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}
