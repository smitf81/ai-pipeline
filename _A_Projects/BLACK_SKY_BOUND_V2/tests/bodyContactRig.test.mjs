import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { WyvernActionId, WYVERN_ACTION_PROFILES } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { createDemoMap } from '../src/world/map.js';
import { startProceduralAction, proceduralActionSystem } from '../src/systems/proceduralActionState.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { predatorProjectionSystem } from '../src/systems/predatorProjectionSystem.js';
import { BODY_CONTACT_RIG_CONTRACT, bodyContactRigSystem } from '../src/systems/bodyContactRigSystem.js';

const map = createDemoMap();
const game = createInitialGameState(map);
const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
startProceduralAction(game.world, game.dragonId, WyvernActionId.BITE_ATTACK, {
  sourceAbilityId: AbilityId.BITE_CLAW,
  aimX: transform.x + 3,
  aimY: transform.y
});
const profile = WYVERN_ACTION_PROFILES[WyvernActionId.BITE_ATTACK];
proceduralActionSystem({ game, dt: profile.duration * 0.54 });
wyvernProjectionSystem({ game, dt: profile.duration * 0.54 });
humanoidProjectionSystem({ game, dt: 0 });
predatorProjectionSystem({ game, dt: 0 });
bodyContactRigSystem({ game });

const playerRig = getComponent(game.world, game.dragonId, ComponentType.BodyContactRig);
equal(playerRig.contract, BODY_CONTACT_RIG_CONTRACT, 'simulation should own the body-contact rig contract');
equal(playerRig.broadPhase.kind, 'capsule', 'locomotion and separation should consume a stable body capsule');
assert(playerRig.hurtVolumes.some((shape) => shape.source.role === 'torso_hurt'), 'pose solver should emit a torso hurt volume');
assert(playerRig.hurtVolumes.some((shape) => shape.source.role === 'head_hurt'), 'pose solver should emit a pose-driven head hurt volume');
assert(playerRig.attackVolumes.length === 1 && playerRig.attackVolumes[0].kind === 'capsule', 'active bite should emit one swept attack capsule');
equal(playerRig.attackVolumes[0].source.policy, 'fixed_step_swept_contact_once_per_authored_window', 'attack sweep should declare its fixed-step contact policy');
const firstSweep = playerRig.attackVolumes[0];

proceduralActionSystem({ game, dt: profile.duration * 0.03 });
transform.x += 0.18;
wyvernProjectionSystem({ game, dt: profile.duration * 0.03 });
bodyContactRigSystem({ game });
const nextSweep = getComponent(game.world, game.dragonId, ComponentType.BodyContactRig).attackVolumes[0];
assert(Math.hypot(nextSweep.ax - nextSweep.bx, nextSweep.ay - nextSweep.by) > 0, 'successive fixed steps should sweep from the previous posed contact point');
assert(firstSweep.source.actionId === nextSweep.source.actionId, 'sweep continuity should preserve the authored action window');

const enemy = game.actors.find((actor) => actor.team !== 'player');
const enemyRig = getComponent(game.world, enemy.id, ComponentType.BodyContactRig);
assert(enemyRig.hurtVolumes.length >= 2, 'humanoid and predator actors should expose pose-driven hurt regions with the player');
