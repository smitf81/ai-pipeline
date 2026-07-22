import { ComponentType } from '../constants/componentTypes.js';
import { areFactionsHostile } from '../constants/factions.js';
import { isPlayerInteractiveLifecycle } from '../data/playerLifecycle.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';

export function findNearestHostileEntity(world, source, aggroRange = Number.POSITIVE_INFINITY, options = {}) {
  const sourceTeam = getComponent(world, source, ComponentType.Team)?.id;
  const sourceTransform = getComponent(world, source, ComponentType.Transform);
  if (!sourceTeam || !sourceTransform) return null;
  const maxDistance = Number.isFinite(aggroRange) ? Math.max(0, aggroRange) : Number.POSITIVE_INFINITY;
  const anchorX = finiteNumber(options.anchorX, sourceTransform.x);
  const anchorY = finiteNumber(options.anchorY, sourceTransform.y);
  const leashRange = Number.isFinite(options.leashRange) ? Math.max(0, options.leashRange) : Number.POSITIVE_INFINITY;
  const excludedEntityIds = new Set(Array.isArray(options.excludedEntityIds) ? options.excludedEntityIds : []);
  let nearest = null;
  let nearestDistance = maxDistance;
  for (const candidate of query(world, [ComponentType.Team, ComponentType.Health, ComponentType.Transform])) {
    if (candidate === source || excludedEntityIds.has(candidate)) continue;
    const health = getComponent(world, candidate, ComponentType.Health);
    const candidateTeam = getComponent(world, candidate, ComponentType.Team).id;
    if (!health.alive || !isAttackableLifecycleTarget(world, candidate) || !areFactionsHostile(sourceTeam, candidateTeam)) continue;
    const candidateTransform = getComponent(world, candidate, ComponentType.Transform);
    if (Math.hypot(candidateTransform.x - anchorX, candidateTransform.y - anchorY) > leashRange) continue;
    const distance = Math.hypot(candidateTransform.x - sourceTransform.x, candidateTransform.y - sourceTransform.y);
    if (distance <= nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function resolveValidEnemyTarget(world, source, ai) {
  if (!ai.targetId || ai.targetId === source || !world.entities.has(ai.targetId)) return null;
  const sourceTeam = getComponent(world, source, ComponentType.Team)?.id;
  const targetTeam = getComponent(world, ai.targetId, ComponentType.Team)?.id;
  const targetHealth = getComponent(world, ai.targetId, ComponentType.Health);
  const sourceTransform = getComponent(world, source, ComponentType.Transform);
  const targetTransform = getComponent(world, ai.targetId, ComponentType.Transform);
  if (!sourceTeam || !targetTeam || !targetHealth?.alive || !isAttackableLifecycleTarget(world, ai.targetId) || !sourceTransform || !targetTransform) return null;
  if (!areFactionsHostile(sourceTeam, targetTeam)) return null;
  if (Math.hypot(targetTransform.x - sourceTransform.x, targetTransform.y - sourceTransform.y) > ai.aggroRange) return null;
  if (Math.hypot(targetTransform.x - ai.anchorX, targetTransform.y - ai.anchorY) > ai.leashRange) return null;
  return ai.targetId;
}

function isAttackableLifecycleTarget(world, entity) {
  return isPlayerInteractiveLifecycle(getComponent(world, entity, ComponentType.PlayerLifecycle));
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
