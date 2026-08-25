import { ComponentType } from '../constants/componentTypes.js';
import { resolveCreatureProjectionRecipe } from '../data/creatureProjections.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';

export const PLAYER_FACING_PROFILE = Object.freeze({
  bodyTurnRateRadiansPerSecond: radians(420),
  bodyTurnAccelerationRadiansPerSecond2: radians(1800),
  bodyTurnBrakingRadiansPerSecond2: radians(2400),
  settleAngleRadians: radians(1),
  settleRateRadiansPerSecond: radians(8),
  headLeadMaxRadians: 65 * Math.PI / 180,
  neckLeadMaxRadians: 32 * Math.PI / 180,
  headLookSharpness: 22,
  neckLookSharpness: 14,
  recenterSharpness: 22
});

export function playerFacingSystem({ game, dt = 0 }) {
  const deltaTime = Math.max(0, Number(dt) || 0);
  for (const entity of query(game.world, [ComponentType.PlayerControlled, ComponentType.Transform, ComponentType.PlayerIntent])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const intent = getComponent(game.world, entity, ComponentType.PlayerIntent);
    const motion = getComponent(game.world, entity, ComponentType.MotionState);
    const action = getComponent(game.world, entity, ComponentType.ActionState);
    const pounce = getComponent(game.world, entity, ComponentType.PounceCounterState);
    const projection = getComponent(game.world, entity, ComponentType.WyvernProjection);
    const profile = resolveFacingProfile(game, projection);
    const committed = action?.active || pounce?.queued || pounce?.active;
    const aim = intent?.aimActive ? normalise(intent.aimX - transform.x, intent.aimY - transform.y) : null;
    const aimFacing = aim ? Math.atan2(aim.y, aim.x) : (motion?.aimFacing ?? transform.rotation ?? 0);
    const previous = transform.rotation ?? 0;
    let velocity = Number(motion?.turnVelocity) || 0;
    let error = aim && !committed ? shortestAngle(aimFacing - previous) : 0;
    if (aim && !committed) {
      const targetVelocity = brakingVelocity(error, profile);
      const sameDirection = velocity === 0 || Math.sign(targetVelocity) === Math.sign(velocity);
      const increasing = sameDirection && Math.abs(targetVelocity) > Math.abs(velocity);
      const rate = increasing ? profile.bodyTurnAccelerationRadiansPerSecond2 : profile.bodyTurnBrakingRadiansPerSecond2;
      velocity = moveToward(velocity, targetVelocity, rate * deltaTime);
      const step = velocity * deltaTime;
      if (Math.abs(step) >= Math.abs(error) && Math.sign(step) === Math.sign(error)) {
        transform.rotation = previous + error;
        velocity = 0;
        error = 0;
      } else {
        transform.rotation = previous + step;
        error = shortestAngle(aimFacing - transform.rotation);
      }
      if (Math.abs(error) <= profile.settleAngleRadians && Math.abs(velocity) <= profile.settleRateRadiansPerSecond) {
        transform.rotation = previous + shortestAngle(aimFacing - previous);
        velocity = 0;
        error = 0;
      }
    } else {
      velocity = 0;
    }
    const appliedDelta = shortestAngle((transform.rotation ?? 0) - previous);
    const lookDelta = committed || !aim ? 0 : shortestAngle(aimFacing - (transform.rotation ?? 0));
    if (motion) {
      motion.aimActive = !!aim;
      motion.aimFacing = aimFacing;
      motion.turnError = error;
      motion.turnVelocity = velocity;
      motion.turnDirection = Math.sign(velocity || error);
      motion.turnPhase = wrapAngle((motion.turnPhase ?? 0) + Math.abs(appliedDelta) * 2);
      motion.turnPlantSide = Math.sin(motion.turnPhase) >= 0 ? 1 : -1;
      const velocityEffort = Math.abs(velocity) / Math.max(0.001, profile.bodyTurnRateRadiansPerSecond);
      const errorEffort = Math.abs(error) / (Math.PI / 2);
      motion.turnEffort = committed ? 0 : clamp(velocityEffort * 0.78 + errorEffort * 0.32, 0, 1);
      motion.turningInPlace = !committed && motion.turnEffort > 0.08 && (motion.speed ?? 0) < 0.2;
      motion.headLookYaw = committed ? 0 : smoothLook(motion.headLookYaw, lookDelta, PLAYER_FACING_PROFILE.headLeadMaxRadians, profile.headLookSharpness, deltaTime);
      motion.neckLookYaw = committed ? 0 : smoothLook(motion.neckLookYaw, lookDelta * 0.55, PLAYER_FACING_PROFILE.neckLeadMaxRadians, profile.neckLookSharpness, deltaTime);
    }
  }
}

function resolveFacingProfile(game, projection) {
  const turning = projection ? resolveCreatureProjectionRecipe(projection.recipeId, game.creatureTuning).proportionProfile?.turning : null;
  return {
    bodyTurnRateRadiansPerSecond: radians(turning?.maxRateDegreesPerSecond ?? 420),
    bodyTurnAccelerationRadiansPerSecond2: radians(turning?.accelerationDegreesPerSecond2 ?? 1800),
    bodyTurnBrakingRadiansPerSecond2: radians(turning?.brakingDegreesPerSecond2 ?? 2400),
    settleAngleRadians: radians(turning?.settleAngleDegrees ?? 1),
    settleRateRadiansPerSecond: radians(turning?.settleRateDegreesPerSecond ?? 8),
    headLookSharpness: turning?.headSharpness ?? 22,
    neckLookSharpness: turning?.neckSharpness ?? 14,
    recenterSharpness: PLAYER_FACING_PROFILE.recenterSharpness
  };
}

function brakingVelocity(error, profile) {
  const speed = Math.min(profile.bodyTurnRateRadiansPerSecond, Math.sqrt(2 * profile.bodyTurnBrakingRadiansPerSecond2 * Math.abs(error)));
  return Math.sign(error) * speed;
}

function smoothLook(current, target, limit, sharpness, dt) {
  const blend = 1 - Math.exp(-sharpness * dt);
  return lerpAngle(current ?? 0, clamp(target, -limit, limit), blend);
}

function normalise(x, y) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= 0.001) return null;
  return { x: x / length, y: y / length };
}

function shortestAngle(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function lerpAngle(from, to, amount) { return from + shortestAngle(to - from) * clamp(amount, 0, 1); }
function moveToward(value, target, amount) { return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target); }
function wrapAngle(value) { return ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); }
function radians(degrees) { return degrees * Math.PI / 180; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
