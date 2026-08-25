import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { getWyvernActionProfile } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { moveEntityRaw } from './movementSystem.js';
import { forceProceduralActionPhase } from './proceduralActionState.js';
import { applyImpactToReceiver } from './impactResponseState.js';

export function wyvernActionImpulseSystem({ game, map, dt = 0 }) {
  for (const entity of query(game.world, [ComponentType.ActionState, ComponentType.Transform])) {
    const actionState = getComponent(game.world, entity, ComponentType.ActionState);
    if (!actionState?.active) continue;
    const profile = getWyvernActionProfile(actionState.actionId);
    const impulse = profile?.movementImpulse;
    if (!impulse || actionState.phase < impulse.activePhaseStart || actionState.phase > impulse.activePhaseEnd) continue;
    const authoredDistance = Math.max(0, impulse.distance ?? 0);
    const distance = Math.min(authoredDistance, Math.max(0, actionState.movementDistanceLimit ?? authoredDistance));
    const applied = Math.max(0, actionState.movementImpulseApplied ?? 0);
    const remaining = Math.max(0, distance - applied);
    if (remaining <= 0) continue;
    const windowDuration = Math.max(0.001, (impulse.activePhaseEnd - impulse.activePhaseStart) * profile.duration);
    const windowProgress = Math.max(0, Math.min(1,
      (actionState.phase - impulse.activePhaseStart) / Math.max(0.001, impulse.activePhaseEnd - impulse.activePhaseStart)
    ));
    const accelerationExponent = Math.max(0.1, Number(impulse.accelerationExponent) || 1);
    const acceleratedTarget = distance * windowProgress ** accelerationExponent;
    const steadyStep = distance * Math.max(0, dt) / windowDuration;
    const step = Math.min(remaining, accelerationExponent === 1 ? steadyStep : Math.max(0, acceleratedTarget - applied));
    const direction = resolveImpulseDirection(actionState);
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const beforeX = transform.x;
    const beforeY = transform.y;
    moveEntityRaw(game.world, entity, direction.x * step, direction.y * step, map);
    const moved = Math.hypot(transform.x - beforeX, transform.y - beforeY);
    actionState.movementImpulseApplied = Math.min(distance, applied + moved);
    if (step > 0.0001 && moved + 0.0001 < step) {
      actionState.movementBlocked = true;
      if (impulse.stopOnBlocked) {
        const travelPolicy = impulse.impactTravel ?? {};
        const recoilResponse = applyImpactToReceiver(getComponent(game.world, entity, ComponentType.ImpactResponse), {
          source: 'terrain',
          target: entity,
          actionId: profile.id,
          contactBodyPart: 'chest_body_front',
          impactDirection: 'opposite_forward',
          directionX: -direction.x,
          directionY: -direction.y,
          impactStrength: travelPolicy.sourceRecoilImpactStrength ?? 0,
          staggerStrength: travelPolicy.sourceRecoilStaggerStrength ?? 0,
          phase: actionState.phase
        });
        actionState.movementDistanceLimit = actionState.movementImpulseApplied;
        actionState.impactLanding = true;
        actionState.contactClosed = true;
        actionState.lastImpactReceipt = Object.freeze({
          target: null,
          effectiveMass: null,
          ratio: null,
          retainedTravel: 0,
          interruptionKind: 'terrain',
          recoil: recoilResponse.impulse,
          stopped: true,
          requestedDistanceMeters: actionState.movementDistanceMeters,
          appliedDistanceTiles: actionState.movementImpulseApplied
        });
        forceProceduralActionPhase(actionState, profile.impactPhaseStart ?? impulse.activePhaseEnd);
      }
    }
  }
}

function resolveImpulseDirection(actionState) {
  const x = Number(actionState.directionX);
  const y = Number(actionState.directionY);
  const length = Math.hypot(x, y);
  if (length <= 0.001) return { x: 1, y: 0 };
  return { x: x / length, y: y / length };
}
