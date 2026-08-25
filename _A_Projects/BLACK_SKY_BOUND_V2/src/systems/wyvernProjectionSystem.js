import { clamp } from '../core/math.js';
import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { resolveCreatureProjectionRecipe } from '../data/creatureProjections.js';
import { WyvernMotionId } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { buildWyvernProceduralPose, phaseBucket } from '../projection/creatures/wyvernProceduralPose.js';
import { buildWyvernCreatureRigPose } from '../projection/creatures/wyvernCreatureRigPose.js';
import { transportWyvernAxialChain, updateWyvernAxialTurnChain } from './wyvernAxialTurnChain.js';

const TAU = Math.PI * 2;

export function wyvernProjectionSystem({ state = null, game, dt }) {
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.Collider, ComponentType.WyvernProjection])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const collider = getComponent(game.world, entity, ComponentType.Collider);
    const projection = getComponent(game.world, entity, ComponentType.WyvernProjection);
    const motionState = getComponent(game.world, entity, ComponentType.MotionState);
    const actionState = getComponent(game.world, entity, ComponentType.ActionState);
    const limbRig = getComponent(game.world, entity, ComponentType.LimbRig);
    const proceduralPose = getComponent(game.world, entity, ComponentType.ProceduralPose);
    const creatureRigPose = getComponent(game.world, entity, ComponentType.CreatureRigPose);
    const impactResponse = getComponent(game.world, entity, ComponentType.ImpactResponse);
    const dodgeState = getComponent(game.world, entity, ComponentType.DodgeState);
    if (!transform || !collider || !projection) continue;

    lockCommittedActionFacing(transform, actionState, motionState);

    const recipe = resolveCreatureProjectionRecipe(projection.recipeId, game.creatureTuning);
    ensureBodyPoints(projection, transform, collider.radius, recipe);
    transportWyvernAxialChain(projection, transform);

    const dx = transform.x - projection.lastX;
    const dy = transform.y - projection.lastY;
    const moved = Math.hypot(dx, dy);
    const speed = dt > 0 ? moved / dt : 0;
    projection.movement01 = clamp(speed / recipe.gait.maxMovementForFullGait, 0, 1);
    projection.gaitPhase += moved * recipe.gait.phasePerWorldUnit;
    projection.idlePhase += dt * recipe.gait.idleBreathSpeed;
    projection.lastX = transform.x;
    projection.lastY = transform.y;
    projection.lastRotation = transform.rotation ?? 0;

    updateMotionState(motionState, projection, transform, speed, dx, dy, dt, dodgeState);
    updateWyvernAxialTurnChain(projection, transform, collider.radius, recipe, dt, motionState, actionState);
    if (proceduralPose) {
      Object.assign(proceduralPose, buildWyvernProceduralPose({
        recipe,
        projection,
        transform,
        radius: collider.radius,
        motionState,
        actionState,
        impactResponse,
        limbRig,
        opening: state?.opening ?? null,
        smokeAwakening: state?.smokeAwakening ?? null
      }));
      if (creatureRigPose) {
        Object.assign(creatureRigPose, buildWyvernCreatureRigPose({
          proceduralPose,
          recipe,
          projection,
          transform,
          radius: collider.radius,
          motionPhase: motionState?.phase ?? (motionState?.locomotionId === WyvernMotionId.CRAWL ? projection.gaitPhase : projection.idlePhase),
          move: motionState?.movement01 ?? projection.movement01 ?? 0
        }));
      }
    }
    updateProjectionSockets(projection, transform, collider.radius, recipe, proceduralPose, creatureRigPose);
  }
}

function lockCommittedActionFacing(transform, actionState, motionState = null) {
  if (!actionState?.active) return;
  if (motionState) {
    motionState.turnError = 0;
    motionState.turnVelocity = 0;
    motionState.turnEffort = 0;
    motionState.turnDirection = 0;
    motionState.turningInPlace = false;
  }
  const facing = Number(actionState.committedFacing);
  if (Number.isFinite(facing)) {
    transform.rotation = facing;
    return;
  }
  const dx = Number(actionState.directionX);
  const dy = Number(actionState.directionY);
  if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0.001) {
    transform.rotation = Math.atan2(dy, dx);
  }
}

function updateMotionState(motionState, projection, transform, speed, dx, dy, dt, dodgeState = null) {
  if (!motionState) return;
  const dodgeVisualActive = dodgeState?.active || dodgeState?.recovering || dodgeState?.buffered;
  const locomotionId = dodgeVisualActive
    ? WyvernMotionId.DODGE
    : (projection.movement01 > 0.08 ? WyvernMotionId.CRAWL : WyvernMotionId.IDLE);
  const dodgeBlend = dodgeState?.recovering
    ? Math.max(0, 1 - (dodgeState.recoveryProgress ?? 0))
    : (dodgeState?.active ? 1 : (dodgeState?.buffered ? 0.35 : 0));
  const visualMovement01 = dodgeVisualActive
    ? Math.max(projection.movement01, dodgeBlend * 0.65)
    : projection.movement01;
  motionState.previousLocomotionId = motionState.locomotionId;
  motionState.locomotionId = locomotionId;
  motionState.speed = speed;
  motionState.movement01 = visualMovement01;
  motionState.velocityX = dt > 0 ? dx / dt : 0;
  motionState.velocityY = dt > 0 ? dy / dt : 0;
  motionState.facing = transform.rotation ?? 0;
  const forwardX = Math.cos(motionState.facing);
  const forwardY = Math.sin(motionState.facing);
  const rightX = -forwardY;
  const rightY = forwardX;
  motionState.localTravelForward = motionState.velocityX * forwardX + motionState.velocityY * forwardY;
  motionState.localTravelRight = motionState.velocityX * rightX + motionState.velocityY * rightY;
  motionState.dodgeMode = dodgeVisualActive ? (dodgeState.mode ?? dodgeState.bufferedMode ?? 'full') : null;
  motionState.dodgeEnergy01 = dodgeState?.buffered ? dodgeState.bufferedEnergy01 : (dodgeState?.energy01 ?? 1);
  motionState.dodgeEffectiveness = dodgeState?.buffered
    ? dodgeState.bufferedEffectiveness
    : (dodgeState?.effectiveness ?? 1);
  motionState.dodgeApexHeightMeters = dodgeState?.buffered
    ? dodgeState.bufferedApexHeightMeters
    : (dodgeState?.apexHeightMeters ?? 0.12);
  motionState.dodgeLandingCompressionMeters = dodgeState?.buffered
    ? dodgeState.bufferedLandingCompressionMeters
    : (dodgeState?.landingCompressionMeters ?? 0.06);
  motionState.dodgeBuffered = dodgeState?.buffered === true;
  projection.lastAimFacing = motionState.aimFacing ?? motionState.facing;
  projection.headLookYaw = motionState.headLookYaw ?? 0;
  projection.neckLookYaw = motionState.neckLookYaw ?? 0;
  motionState.phase = locomotionId === WyvernMotionId.DODGE
    ? (dodgeState.phase ?? 0) * TAU
    : (locomotionId === WyvernMotionId.CRAWL ? projection.gaitPhase : projection.idlePhase);
  motionState.phaseBucket = phaseBucket(motionState.phase / TAU);
}

function ensureBodyPoints(projection, transform, radius, recipe) {
  const roles = recipe.chain.pointRoles;
  if (projection.bodyPoints.length === roles.length) return;
  const back = { x: -Math.cos(transform.rotation ?? 0), y: -Math.sin(transform.rotation ?? 0) };
  let distance = 0;
  projection.bodyPoints = roles.map((role, index) => {
    if (index > 0) distance += radius * (recipe.chain.segmentLengthScales[index - 1] ?? 0.5);
    return {
      role,
      x: transform.x + back.x * distance,
      y: transform.y + back.y * distance
    };
  });
  projection.lastX = transform.x;
  projection.lastY = transform.y;
  projection.lastRotation = transform.rotation ?? 0;
}

function updateProjectionSockets(projection, transform, radius, recipe, proceduralPose = null, rigPose = null) {
  if (rigPose?.sockets?.mouth) {
    projection.sockets = {
      ...(projection.sockets ?? {}),
      mouth: { ...rigPose.sockets.mouth }
    };
    return;
  }
  if (proceduralPose?.sockets?.mouth) {
    projection.sockets = {
      ...(projection.sockets ?? {}),
      mouth: { ...proceduralPose.sockets.mouth }
    };
    return;
  }
  const head = projection.bodyPoints[0] ?? { x: transform.x, y: transform.y };
  const rotation = transform.rotation ?? 0;
  const forward = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const right = { x: -Math.sin(rotation), y: Math.cos(rotation) };
  const snout = (recipe.proportions.snout ?? 0.4) * radius;
  projection.sockets = {
    ...(projection.sockets ?? {}),
    mouth: {
      x: head.x + forward.x * snout * 0.92,
      y: head.y + forward.y * snout * 0.92,
      forward,
      right,
      role: 'mouth_socket',
      classification: 'projection_socket'
    }
  };
}
