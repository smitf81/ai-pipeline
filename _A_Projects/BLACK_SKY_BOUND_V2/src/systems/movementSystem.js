import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { getTile } from '../world/map.js';
import { getTerrainDef } from '../world/terrain.js';
import { circleIntersectsEnvironment, environmentTraversalMultiplier, getEnvironmentCollisionIndex } from '../physics/environmentCollision.js';
import { CORPSE_SLOWDOWN_MINIMUM } from '../data/deathAftermath.js';

export const ENEMY_STEERING_ANGLES_DEGREES = Object.freeze([0, 25, -25, 50, -50, 80, -80]);

export function movementSystem({ game, map, dt }) {
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.Motion, ComponentType.PlayerIntent])) {
    if (getComponent(game.world, entity, ComponentType.DodgeState)?.active) continue;
    const charge = getComponent(game.world, entity, ComponentType.ChargeCounterState);
    if (charge?.active || charge?.queued) continue;
    const intent = getComponent(game.world, entity, ComponentType.PlayerIntent);
    moveEntityOnMap(game.world, entity, intent.moveX, intent.moveY, dt, map);
  }
}

export function moveEntityOnMap(world, entity, dx, dy, dt, map) {
  const transform = getComponent(world, entity, ComponentType.Transform);
  const motion = getComponent(world, entity, ComponentType.Motion);
  if (!transform || !motion) return false;
  const len = Math.hypot(dx, dy);
  if (!len) return false;
  transform.rotation = Math.atan2(dy, dx);
  const terrain = getTerrainDef(getTile(map, Math.floor(transform.x), Math.floor(transform.y)));
  const corpseSlowdown = getCorpseSlowdownMultiplier(world, entity, transform.x, transform.y);
  const traversalSlowdown = getEnvironmentTraversalMultiplier(map, transform.x, transform.y, getComponent(world, entity, ComponentType.Collider)?.radius ?? 0);
  const speedMultiplier = getMovementSpeedMultiplier(world, entity);
  motion.corpseSlowdownMultiplier = corpseSlowdown;
  motion.environmentTraversalMultiplier = traversalSlowdown;
  motion.speedMultiplier = speedMultiplier;
  const step = motion.speed * speedMultiplier * dt / terrain.moveCost * corpseSlowdown * traversalSlowdown;
  return moveEntityRaw(world, entity, (dx / len) * step, (dy / len) * step, map);
}

export function moveEntityRaw(world, entity, dx, dy, map) {
  const transform = getComponent(world, entity, ComponentType.Transform);
  if (!transform) return false;
  const radius = getComponent(world, entity, ComponentType.Collider)?.radius ?? 0;
  const next = { x: transform.x + dx, y: transform.y + dy };
  if (canEntityOccupy(world, entity, next.x, next.y, map)) {
    transform.x = next.x;
    transform.y = next.y;
    return true;
  }
  let moved = false;
  const slideX = { x: transform.x + dx, y: transform.y };
  if (canEntityOccupy(world, entity, slideX.x, slideX.y, map)) {
    transform.x = slideX.x;
    moved = true;
  }
  const slideY = { x: transform.x, y: transform.y + dy };
  if (canEntityOccupy(world, entity, slideY.x, slideY.y, map)) {
    transform.y = slideY.y;
    moved = true;
  }
  return moved;
}

export function moveEntityWithSteering(world, entity, dx, dy, dt, map) {
  const transform = getComponent(world, entity, ComponentType.Transform);
  const motion = getComponent(world, entity, ComponentType.Motion);
  if (!transform || !motion) return { moved: false, blocked: false, steeringAngleDegrees: 0 };
  const length = Math.hypot(dx, dy);
  if (!length || dt <= 0) return { moved: false, blocked: false, steeringAngleDegrees: 0 };
  const intendedX = dx / length;
  const intendedY = dy / length;
  const terrain = getTerrainDef(getTile(map, Math.floor(transform.x), Math.floor(transform.y)));
  const corpseSlowdown = getCorpseSlowdownMultiplier(world, entity, transform.x, transform.y);
  const traversalSlowdown = getEnvironmentTraversalMultiplier(map, transform.x, transform.y, getComponent(world, entity, ComponentType.Collider)?.radius ?? 0);
  const speedMultiplier = getMovementSpeedMultiplier(world, entity);
  motion.corpseSlowdownMultiplier = corpseSlowdown;
  motion.environmentTraversalMultiplier = traversalSlowdown;
  motion.speedMultiplier = speedMultiplier;
  const step = motion.speed * speedMultiplier * dt / terrain.moveCost * corpseSlowdown * traversalSlowdown;
  const radius = getComponent(world, entity, ComponentType.Collider)?.radius ?? 0;
  const side = deterministicSide(entity);
  const angles = side > 0
    ? ENEMY_STEERING_ANGLES_DEGREES
    : ENEMY_STEERING_ANGLES_DEGREES.map((angle) => -angle);

  for (const angleDegrees of angles) {
    const angle = angleDegrees * Math.PI / 180;
    const moveX = intendedX * Math.cos(angle) - intendedY * Math.sin(angle);
    const moveY = intendedX * Math.sin(angle) + intendedY * Math.cos(angle);
    const next = findSteeredPosition(world, entity, transform, moveX * step, moveY * step, radius, map, angleDegrees !== 0);
    if (!next) continue;
    transform.x = next.x;
    transform.y = next.y;
    transform.rotation = Math.atan2(moveY, moveX);
    return { moved: true, blocked: angleDegrees !== 0, steeringAngleDegrees: angleDegrees };
  }
  transform.rotation = Math.atan2(intendedY, intendedX);
  return { moved: false, blocked: true, steeringAngleDegrees: 0 };
}

function findSteeredPosition(world, entity, transform, dx, dy, radius, map, allowComponentSlide) {
  const candidates = [{ x: transform.x + dx, y: transform.y + dy }];
  if (allowComponentSlide) {
    const components = [
      { magnitude: Math.abs(dx), position: { x: transform.x + dx, y: transform.y } },
      { magnitude: Math.abs(dy), position: { x: transform.x, y: transform.y + dy } }
    ].sort((a, b) => b.magnitude - a.magnitude);
    for (const component of components) {
      if (component.magnitude > 0.00001) candidates.push(component.position);
    }
  }
  return candidates.find((candidate) => (
    Math.hypot(candidate.x - transform.x, candidate.y - transform.y) > 0.00001
    && canEntityOccupy(world, entity, candidate.x, candidate.y, map)
  )) ?? null;
}

export function canEntityOccupy(world, entity, x, y, map) {
  const radius = Math.max(0, getComponent(world, entity, ComponentType.Collider)?.radius ?? 0);
  return !isPositionBlocked(map, x, y, radius);
}

export function isPositionBlocked(map, x, y, radius = 0) {
  const safeRadius = Math.max(0, Number(radius) || 0);
  return circleIntersectsEnvironment(getEnvironmentCollisionIndex(map), x, y, safeRadius);
}

export function getEnvironmentTraversalMultiplier(map, x, y, radius = 0) {
  return environmentTraversalMultiplier(getEnvironmentCollisionIndex(map), x, y, Math.max(0, Number(radius) || 0));
}

export function getCorpseSlowdownMultiplier(world, entity, x, y) {
  const impact = getComponent(world, entity, ComponentType.ImpactResponse);
  const separationMass = Math.max(0.1, Number(impact?.separationMass ?? impact?.mass ?? 1) || 1);
  const responseWeight = Math.max(0.4, Math.min(1, 1.3 / separationMass));
  let multiplier = 1;
  for (const corpseEntity of query(world, [ComponentType.Transform, ComponentType.Corpse])) {
    const transform = getComponent(world, corpseEntity, ComponentType.Transform);
    const corpse = getComponent(world, corpseEntity, ComponentType.Corpse);
    if (Math.hypot(x - transform.x, y - transform.y) > corpse.slowdownRadius) continue;
    const localMultiplier = 1 - (1 - corpse.slowdownMultiplier) * responseWeight;
    multiplier = Math.min(multiplier, localMultiplier);
  }
  return Math.max(CORPSE_SLOWDOWN_MINIMUM, Math.min(1, multiplier));
}

export function getMovementSpeedMultiplier(world, entity) {
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const status = getComponent(world, entity, ComponentType.StatusEffects);
  const sprintMultiplier = stamina?.sprinting ? Math.max(1, Number(stamina.sprintMultiplier) || 1) : 1;
  const slowMultiplier = status?.movementSlowTimer > 0
    ? Math.max(0.1, Math.min(1, Number(status.movementSlowMultiplier) || 1))
    : 1;
  return sprintMultiplier * slowMultiplier;
}

function deterministicSide(entity) {
  let hash = 2166136261;
  for (const char of String(entity)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash & 1) === 0 ? 1 : -1;
}
