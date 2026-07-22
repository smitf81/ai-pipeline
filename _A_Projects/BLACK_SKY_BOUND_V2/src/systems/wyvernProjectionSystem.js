import { clamp, lerp } from '../core/math.js';
import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { resolveCreatureProjectionRecipe } from '../data/creatureProjections.js';
import { WyvernMotionId } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { buildWyvernProceduralPose, phaseBucket } from '../projection/creatures/wyvernProceduralPose.js';
import { buildWyvernCreatureRigPose } from '../projection/creatures/wyvernCreatureRigPose.js';

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

    lockCommittedActionFacing(transform, actionState);

    const recipe = resolveCreatureProjectionRecipe(projection.recipeId, game.creatureTuning);
    ensureBodyPoints(projection, transform, collider.radius, recipe);
    transportChainWithRoot(projection, transform);

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
    updateChain(projection, transform, collider.radius, recipe, dt);
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

function lockCommittedActionFacing(transform, actionState) {
  if (!actionState?.active) return;
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
  const dodgeVisualActive = dodgeState?.active || dodgeState?.recovering;
  const locomotionId = dodgeVisualActive
    ? WyvernMotionId.DODGE
    : (projection.movement01 > 0.08 ? WyvernMotionId.CRAWL : WyvernMotionId.IDLE);
  const dodgeBlend = dodgeState?.recovering
    ? Math.max(0, 1 - (dodgeState.recoveryProgress ?? 0))
    : (dodgeState?.active ? 1 : 0);
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

function transportChainWithRoot(projection, transform) {
  const previousX = Number.isFinite(projection.lastX) ? projection.lastX : transform.x;
  const previousY = Number.isFinite(projection.lastY) ? projection.lastY : transform.y;
  const previousRotation = Number.isFinite(projection.lastRotation)
    ? projection.lastRotation
    : (transform.rotation ?? 0);
  const nextRotation = transform.rotation ?? 0;
  const rotationDelta = shortestAngle(nextRotation - previousRotation);
  const cosine = Math.cos(rotationDelta);
  const sine = Math.sin(rotationDelta);
  for (const point of projection.bodyPoints ?? []) {
    const localX = point.x - previousX;
    const localY = point.y - previousY;
    point.x = transform.x + localX * cosine - localY * sine;
    point.y = transform.y + localX * sine + localY * cosine;
  }
  projection.rootTransport = {
    classification: 'wyvern_root_transform_transport_v0',
    deltaX: transform.x - previousX,
    deltaY: transform.y - previousY,
    rotationDelta
  };
}

function shortestAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function updateChain(projection, transform, radius, recipe, dt) {
  const points = projection.bodyPoints;
  const follow = 1 - Math.exp(-recipe.chain.followSharpness * dt);
  points[0].x = lerp(points[0].x, transform.x, follow);
  points[0].y = lerp(points[0].y, transform.y, follow);

  const idleSway = Math.sin(projection.idlePhase * 0.7) * recipe.chain.idleTailSway * radius;
  const right = { x: -Math.sin(transform.rotation ?? 0), y: Math.cos(transform.rotation ?? 0) };
  const limits = recipe.proportionProfile?.constraints ?? {};
  const maxStretch = limits.maxBodyChainStretch ?? 1.12;
  const maxTailBend = limits.maxTailBend ?? 0.22;

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const desiredDistance = radius * recipe.chain.segmentLengthScales[i - 1];
    let dx = current.x - previous.x;
    let dy = current.y - previous.y;
    let distance = Math.hypot(dx, dy);
    if (distance < 0.0001) {
      dx = -Math.cos(transform.rotation ?? 0);
      dy = -Math.sin(transform.rotation ?? 0);
      distance = 1;
    }
    const swayLimit = radius * maxTailBend * Math.max(1, i - 3);
    const sway = i >= 4 ? clamp(idleSway * (i - 3) * (1 - projection.movement01 * 0.65), -swayLimit, swayLimit) : 0;
    const targetX = previous.x + (dx / distance) * desiredDistance + right.x * sway;
    const targetY = previous.y + (dy / distance) * desiredDistance + right.y * sway;
    current.x = lerp(current.x, targetX, follow);
    current.y = lerp(current.y, targetY, follow);
    clampSegmentDistance(previous, current, desiredDistance * maxStretch);
  }
}

function clampSegmentDistance(anchor, point, maxDistance) {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= maxDistance || maxDistance <= 0) return;
  point.x = anchor.x + (dx / distance) * maxDistance;
  point.y = anchor.y + (dy / distance) * maxDistance;
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
