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
import { rotateScreenRelativeInput } from '../render/three/worldTransform3D.js';

export function inputSystem({ state, input }) {
  if (zeroPlayerIntentWhileTuning(state, input)) return;
  for (const entity of query(state.game.world, [ComponentType.PlayerControlled, ComponentType.PlayerIntent])) {
    const intent = getComponent(state.game.world, entity, ComponentType.PlayerIntent);
    if (!isPlayerInteractiveLifecycle(getComponent(state.game.world, entity, ComponentType.PlayerLifecycle))) {
      Object.assign(intent, { moveX: 0, moveY: 0, aimActive: false, sprint: false, dodge: false, dodgeChain: false, pounceCounter: false, melee: false, bite: false, lunge: false, smoke: false, smokeAbilityId: null });
      continue;
    }
    const rawMovement = resolveMovementInput(input);
    const screenRelative3D = isWebGL3DRequested();
    const movement = screenRelative3D ? rotateScreenRelativeInput(rawMovement.x, rawMovement.y) : rawMovement;
    const pointerWorld2D = screenToWorld(state.camera, input.pointer.x, input.pointer.y);
    const pointerDelta = screenRelative3D ? rotateScreenRelativeInput(
      pointerWorld2D.x - state.camera.x,
      pointerWorld2D.y - state.camera.y
    ) : null;
    const pointerWorld = pointerDelta
      ? { x: state.camera.x + pointerDelta.x, y: state.camera.y + pointerDelta.y }
      : pointerWorld2D;
    const canMove = canUseAbility(state.game.world, entity, AbilityId.MOVE);
    intent.moveX = canMove ? movement.x : 0;
    intent.moveY = canMove ? movement.y : 0;
    const pointerValid = Number.isFinite(input.pointer?.x)
      && Number.isFinite(input.pointer?.y)
      && input.pointer?.hasPosition !== false
      && input.pointer?.inside !== false;
    intent.aimActive = pointerValid;
    if (pointerValid) {
      intent.aimX = pointerWorld.x / CONFIG.tileSize;
      intent.aimY = pointerWorld.y / CONFIG.tileSize;
    }
    intent.sprint = canMove && isInputActionDown(input, InputActionId.SPRINT);
    const spacePressed = wasInputActionPressed(input, InputActionId.DODGE);
    const dodge = getComponent(state.game.world, entity, ComponentType.DodgeState);
    const pounce = getComponent(state.game.world, entity, ComponentType.PounceCounterState);
    const dodgeVisualActive = dodge?.active || dodge?.recovering;
    const emergencyDodgeVisual = dodgeVisualActive && dodge?.followupsEnabled === false;
    const followupWindowOpen = (dodgeVisualActive && dodge?.followupsEnabled !== false)
      || pounce?.followupWindowRemaining > 0;
    const branchCommitted = dodge?.committedBranch !== null || pounce?.queued || pounce?.active;
    if (spacePressed && dodgeVisualActive && branchCommitted && dodge) dodge.lastDeniedReason = 'followup_committed';
    intent.dodgeChain = spacePressed
      && dodgeVisualActive
      && dodge?.followupsEnabled !== false
      && !branchCommitted
      && canUseAbility(state.game.world, entity, AbilityId.DODGE);
    intent.dodge = spacePressed
      && !dodgeVisualActive
      && canUseAbility(state.game.world, entity, AbilityId.DODGE);
    const contextualLmbPressed = !spacePressed
      && (followupWindowOpen || emergencyDodgeVisual)
      && consumeInputActionPressed(input, InputActionId.POUNCE_COUNTER);
    if (contextualLmbPressed && emergencyDodgeVisual) {
      dodge.lastDeniedReason = 'emergency_dodge_no_followup';
      if (pounce) pounce.lastDeniedReason = 'emergency_dodge_no_followup';
    }
    if (contextualLmbPressed && branchCommitted) {
      if (dodge) dodge.lastDeniedReason = 'followup_committed';
      if (pounce) pounce.lastDeniedReason = 'followup_committed';
    }
    const pounceAvailable = canUseAbility(state.game.world, entity, AbilityId.POUNCE_COUNTER);
    if (contextualLmbPressed && !branchCommitted && !pounceAvailable && pounce) pounce.lastDeniedReason = 'pounce_locked';
    const pouncePressed = contextualLmbPressed && !emergencyDodgeVisual && !branchCommitted && pounceAvailable;
    intent.pounceCounter = pouncePressed;
    const meleePressed = !contextualLmbPressed && consumeInputActionPressed(input, InputActionId.MELEE);
    intent.melee = meleePressed && canUseAbility(state.game.world, entity, AbilityId.BITE_CLAW);
    intent.bite = intent.melee;
    const smokePressed = consumeInputActionPressed(input, InputActionId.SMOKE);
    intent.smokeAbilityId = resolveAvailableSmokeAbility(state.game.world, entity);
    intent.smoke = smokePressed && intent.smokeAbilityId !== null;
    intent.lunge = wasInputActionPressed(input, InputActionId.LUNGE) && canUseAbility(state.game.world, entity, AbilityId.BODY_LUNGE);
  }
}

function isWebGL3DRequested() {
  try {
    const requested = new URLSearchParams(globalThis.location?.search ?? '').get('renderer')
      ?? globalThis.localStorage?.getItem?.('bsb.rendererBackend');
    return requested === null || requested === 'webgl3d' || requested === 'webgl';
  } catch {
    return true;
  }
}

function resolveAvailableSmokeAbility(world, entity) {
  if (canUseAbility(world, entity, AbilityId.SMOKE_SPIT)) return AbilityId.SMOKE_SPIT;
  if (canUseAbility(world, entity, AbilityId.SMOKE_BURST)) return AbilityId.SMOKE_BURST;
  return null;
}
