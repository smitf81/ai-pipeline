import { CONFIG } from '../config.js';
import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { screenToWorld } from '../render/camera.js';
import { zeroPlayerIntentWhileTuning } from '../tuning/tuningRuntime.js';
import { isPlayerInteractiveLifecycle } from '../data/playerLifecycle.js';
import { AbilityId } from '../constants/abilityIds.js';
import { canUseAbility } from '../game/playerAbilities.js';
import {
  InputActionId,
  consumeInputActionPressed,
  isInputActionDown,
  resolveMovementInput,
  wasInputActionPressed
} from '../data/inputActions.js';

export function inputSystem({ state, input }) {
  if (zeroPlayerIntentWhileTuning(state, input)) return;
  for (const entity of query(state.game.world, [ComponentType.PlayerControlled, ComponentType.PlayerIntent])) {
    const intent = getComponent(state.game.world, entity, ComponentType.PlayerIntent);
    if (!isPlayerInteractiveLifecycle(getComponent(state.game.world, entity, ComponentType.PlayerLifecycle))) {
      Object.assign(intent, { moveX: 0, moveY: 0, sprint: false, dodge: false, dodgeFollowup: false, melee: false, bite: false, lunge: false, smoke: false, smokeAbilityId: null });
      continue;
    }
    const movement = resolveMovementInput(input);
    const pointerWorld = screenToWorld(state.camera, input.pointer.x, input.pointer.y);
    const canMove = canUseAbility(state.game.world, entity, AbilityId.MOVE);
    intent.moveX = canMove ? movement.x : 0;
    intent.moveY = canMove ? movement.y : 0;
    intent.aimX = pointerWorld.x / CONFIG.tileSize;
    intent.aimY = pointerWorld.y / CONFIG.tileSize;
    intent.sprint = canMove && isInputActionDown(input, InputActionId.SPRINT);
    const spacePressed = wasInputActionPressed(input, InputActionId.DODGE);
    const dodge = getComponent(state.game.world, entity, ComponentType.DodgeState);
    const charge = getComponent(state.game.world, entity, ComponentType.ChargeCounterState);
    const inFollowupWindow = dodge?.active || dodge?.recovering || charge?.followupWindowRemaining > 0;
    intent.dodgeFollowup = spacePressed
      && inFollowupWindow
      && canUseAbility(state.game.world, entity, AbilityId.CHARGE_COUNTER);
    intent.dodge = spacePressed
      && !inFollowupWindow
      && canUseAbility(state.game.world, entity, AbilityId.DODGE);
    const meleePressed = consumeInputActionPressed(input, InputActionId.MELEE);
    intent.melee = meleePressed && canUseAbility(state.game.world, entity, AbilityId.BITE_CLAW);
    intent.bite = intent.melee;
    const smokePressed = consumeInputActionPressed(input, InputActionId.SMOKE);
    intent.smokeAbilityId = resolveAvailableSmokeAbility(state.game.world, entity);
    intent.smoke = smokePressed && intent.smokeAbilityId !== null;
    intent.lunge = wasInputActionPressed(input, InputActionId.LUNGE) && canUseAbility(state.game.world, entity, AbilityId.BODY_LUNGE);
  }
}

function resolveAvailableSmokeAbility(world, entity) {
  if (canUseAbility(world, entity, AbilityId.SMOKE_SPIT)) return AbilityId.SMOKE_SPIT;
  if (canUseAbility(world, entity, AbilityId.SMOKE_BURST)) return AbilityId.SMOKE_BURST;
  return null;
}
