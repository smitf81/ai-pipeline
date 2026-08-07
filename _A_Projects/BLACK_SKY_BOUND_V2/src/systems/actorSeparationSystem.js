import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { moveEntityRaw } from './movementSystem.js';
import { areFactionsHostile } from '../constants/factions.js';
import { COMBAT_BALANCE } from '../data/combatBalance.js';
import { collisionShapesIntersect } from '../physics/collisionShapes.js';

export const ACTOR_SEPARATION_BUCKET_SIZE = 2.5;
export const ACTOR_SEPARATION_PADDING = 0.16;
const SEPARATION_RESPONSE = 14;
const MAX_SEPARATION_SPEED = 3;
const MAX_NEIGHBOURS_PER_ACTOR = 20;

export function actorSeparationSystem({ game, map, dt }) {
  const delta = Math.max(0, Number(dt) || 0);
  const actors = query(game.world, [ComponentType.Transform, ComponentType.Collider, ComponentType.Health])
    .filter((entity) => getComponent(game.world, entity, ComponentType.Health).alive)
    .map((entity, index) => ({
      entity,
      index,
      transform: getComponent(game.world, entity, ComponentType.Transform),
      collider: getComponent(game.world, entity, ComponentType.Collider),
      bodyContactRig: getComponent(game.world, entity, ComponentType.BodyContactRig),
      mass: separationMass(game.world, entity)
    }));
  const buckets = buildBuckets(actors);
  const displacement = new Map(actors.map((actor) => [actor.entity, { x: 0, y: 0 }]));
  let pairChecks = 0;
  let overlapsResolved = 0;
  let hostilePlayerContacts = 0;

  if (delta > 0) {
    for (const actor of actors) {
      let neighbours = 0;
      const bucketX = Math.floor(actor.transform.x / ACTOR_SEPARATION_BUCKET_SIZE);
      const bucketY = Math.floor(actor.transform.y / ACTOR_SEPARATION_BUCKET_SIZE);
      for (let offsetY = -1; offsetY <= 1 && neighbours < MAX_NEIGHBOURS_PER_ACTOR; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1 && neighbours < MAX_NEIGHBOURS_PER_ACTOR; offsetX += 1) {
          const nearby = buckets.get(bucketKey(bucketX + offsetX, bucketY + offsetY)) ?? [];
          for (const other of nearby) {
            if (other.index <= actor.index) continue;
            neighbours += 1;
            pairChecks += 1;
            if (resolvePair(game.world, actor, other, displacement, delta)) hostilePlayerContacts += 1;
            if (pairOverlaps(actor, other)) overlapsResolved += 1;
            if (neighbours >= MAX_NEIGHBOURS_PER_ACTOR) break;
          }
        }
      }
    }
  }

  const maxStep = MAX_SEPARATION_SPEED * delta;
  for (const actor of actors) {
    const push = displacement.get(actor.entity);
    const length = Math.hypot(push.x, push.y);
    if (length <= 0.00001) continue;
    const scale = length > maxStep ? maxStep / length : 1;
    moveEntityRaw(game.world, actor.entity, push.x * scale, push.y * scale, map);
  }

  game.movementSpacing = {
    classification: 'bucketed_soft_actor_separation_v0',
    bucketSize: ACTOR_SEPARATION_BUCKET_SIZE,
    actorCount: actors.length,
    bucketCount: buckets.size,
    maxBucketOccupancy: Math.max(0, ...[...buckets.values()].map((bucket) => bucket.length)),
    pairChecks,
    overlapsResolved,
    hostilePlayerContacts,
    neighbourCap: MAX_NEIGHBOURS_PER_ACTOR
  };
}

function resolvePair(world, actor, other, displacement, dt) {
  const dx = other.transform.x - actor.transform.x;
  const dy = other.transform.y - actor.transform.y;
  const distance = Math.hypot(dx, dy);
  const desiredDistance = bodyReach(actor) + bodyReach(other) + ACTOR_SEPARATION_PADDING;
  if (distance >= desiredDistance) return false;
  const pressuredPlayer = applyHostileBodyContactPressure(world, actor.entity, other.entity);
  const direction = distance > 0.0001 ? { x: dx / distance, y: dy / distance } : deterministicPairDirection(actor.entity, other.entity);
  const correction = Math.min((desiredDistance - distance) * SEPARATION_RESPONSE * dt, MAX_SEPARATION_SPEED * dt);
  const inverseActorMass = 1 / actor.mass;
  const inverseOtherMass = 1 / other.mass;
  const inverseTotal = inverseActorMass + inverseOtherMass;
  const actorShare = inverseActorMass / inverseTotal;
  const otherShare = inverseOtherMass / inverseTotal;
  const actorPush = displacement.get(actor.entity);
  const otherPush = displacement.get(other.entity);
  actorPush.x -= direction.x * correction * actorShare;
  actorPush.y -= direction.y * correction * actorShare;
  otherPush.x += direction.x * correction * otherShare;
  otherPush.y += direction.y * correction * otherShare;
  return pressuredPlayer;
}

function applyHostileBodyContactPressure(world, first, second) {
  const profile = COMBAT_BALANCE.hostileBodyContact;
  if (!profile.enabled) return false;
  const firstTeam = getComponent(world, first, ComponentType.Team)?.id;
  const secondTeam = getComponent(world, second, ComponentType.Team)?.id;
  if (!areFactionsHostile(firstTeam, secondTeam)) return false;
  return applyToPlayer(first, second) || applyToPlayer(second, first);

  function applyToPlayer(target, source) {
    if (!getComponent(world, target, ComponentType.PlayerControlled)) return false;
    const status = getComponent(world, target, ComponentType.StatusEffects);
    if (!status) return false;
    status.movementSlowTimer = Math.max(status.movementSlowTimer ?? 0, profile.durationSeconds);
    status.movementSlowMultiplier = Math.min(status.movementSlowMultiplier ?? 1, profile.movementMultiplier);
    status.movementSlowSource = source;
    return true;
  }
}

function pairOverlaps(actor, other) {
  if (actor.bodyContactRig?.broadPhase && other.bodyContactRig?.broadPhase) {
    return collisionShapesIntersect(actor.bodyContactRig.broadPhase, other.bodyContactRig.broadPhase);
  }
  return Math.hypot(other.transform.x - actor.transform.x, other.transform.y - actor.transform.y)
    < actor.collider.radius + other.collider.radius + ACTOR_SEPARATION_PADDING;
}

function bodyReach(actor) {
  const shape = actor.bodyContactRig?.broadPhase;
  if (shape?.kind === 'capsule') return shape.radius + Math.hypot(shape.bx - shape.ax, shape.by - shape.ay) * 0.5;
  return actor.collider.radius;
}

function buildBuckets(actors) {
  const buckets = new Map();
  for (const actor of actors) {
    const x = Math.floor(actor.transform.x / ACTOR_SEPARATION_BUCKET_SIZE);
    const y = Math.floor(actor.transform.y / ACTOR_SEPARATION_BUCKET_SIZE);
    const key = bucketKey(x, y);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(actor);
  }
  return buckets;
}

function bucketKey(x, y) {
  return `${x}:${y}`;
}

function separationMass(world, entity) {
  const impact = getComponent(world, entity, ComponentType.ImpactResponse);
  return Math.max(0.1, Number(impact?.separationMass ?? impact?.mass ?? 1) || 1);
}

function deterministicPairDirection(a, b) {
  const text = `${a}|${b}`;
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const angle = (hash >>> 0) / 4294967296 * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}
