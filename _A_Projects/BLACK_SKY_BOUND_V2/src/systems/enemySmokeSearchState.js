import { clamp } from '../core/math.js';
import { EnemyPressureState } from '../constants/enemyPressureStates.js';
import { EventType } from '../constants/eventTypes.js';
import { emitEvent } from '../ecs/events.js';
import { SMOKE_TACTICS } from '../data/smokeTactics.js';
import { VisualRecipeId } from '../data/visualRecipes.js';
import { spawnVisualRecipe } from '../game/spawn.js';
import { isEnemyAttackBusy, resetEnemyAttack } from './enemyAttackSystem.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SEARCH_TARGET_DISTANCE = 0.3;

export function updateEnemySmokeTactics({
  game,
  map,
  enemy,
  transform,
  ai,
  cooldowns,
  playerTransform,
  playerHealth,
  playerSmoke,
  enemySmoke,
  delta,
  speedMultiplier,
  moveSearch
}) {
  ai.smokeSearchTimer = Math.max(0, ai.smokeSearchTimer - delta);
  ai.smokeReacquireTimer = Math.max(0, ai.smokeReacquireTimer - delta);
  ai.smokeSearchWaypointTimer = Math.max(0, ai.smokeSearchWaypointTimer - delta);
  const playerDistance = playerTransform
    ? Math.hypot(playerTransform.x - transform.x, playerTransform.y - transform.y)
    : Number.POSITIVE_INFINITY;
  const closeReveal = playerDistance <= SMOKE_TACTICS.closeRevealDistanceTiles;
  const playerHiddenFromEnemy = !closeReveal && !!(playerSmoke || enemySmoke);

  if (shouldBreakPlayerPursuit(ai, game.dragonId, playerTransform, playerHiddenFromEnemy)) {
    beginSmokeSearch(game, enemy, transform, ai, cooldowns, playerTransform, enemySmoke ?? playerSmoke);
  }

  if (ai.state !== EnemyPressureState.SEARCH) return { handled: false, playerHiddenFromEnemy };
  if (closeReveal && playerHealth?.alive) {
    finishSmokeSearch(ai);
    ai.targetId = game.dragonId;
    ai.decisionCooldown = ai.decisionInterval;
    return { handled: false, playerHiddenFromEnemy: false };
  }
  if (ai.smokeSearchTimer <= 0 && ai.smokeReacquireTimer <= 0 && !playerHiddenFromEnemy) {
    finishSmokeSearch(ai);
    ai.decisionCooldown = 0;
    return { handled: false, playerHiddenFromEnemy: false };
  }

  ai.targetId = null;
  resetEnemyAttack(ai);
  setState(ai, EnemyPressureState.SEARCH);
  updateSmokeSearchTarget(enemy, ai, transform, map);
  moveSearch(
    ai.smokeSearchTargetX,
    ai.smokeSearchTargetY,
    delta * speedMultiplier * SMOKE_TACTICS.searchSpeedMultiplier
  );
  return { handled: true, playerHiddenFromEnemy };
}

export function hydrateEnemySmokeSearchState(ai) {
  ai.smokeSearchTimer = Math.max(0, finiteNumber(ai.smokeSearchTimer, 0));
  ai.smokeReacquireTimer = Math.max(0, finiteNumber(ai.smokeReacquireTimer, 0));
  ai.smokeSearchCenterX = nullableFiniteNumber(ai.smokeSearchCenterX);
  ai.smokeSearchCenterY = nullableFiniteNumber(ai.smokeSearchCenterY);
  ai.smokeSearchTargetX = nullableFiniteNumber(ai.smokeSearchTargetX);
  ai.smokeSearchTargetY = nullableFiniteNumber(ai.smokeSearchTargetY);
  ai.smokeSearchWaypointTimer = Math.max(0, finiteNumber(ai.smokeSearchWaypointTimer, 0));
  ai.smokeSearchDecisionIndex = Math.max(0, Math.floor(finiteNumber(ai.smokeSearchDecisionIndex, 0)));
  ai.smokeBreakCount = Math.max(0, Math.floor(finiteNumber(ai.smokeBreakCount, 0)));
  ai.lastSmokeBreakAt = nullableFiniteNumber(ai.lastSmokeBreakAt);
  ai.lastSmokeBreakReason = typeof ai.lastSmokeBreakReason === 'string' ? ai.lastSmokeBreakReason : null;
  ai.lastSmokeSourceKind = typeof ai.lastSmokeSourceKind === 'string' ? ai.lastSmokeSourceKind : null;
}

function shouldBreakPlayerPursuit(ai, playerId, playerTransform, playerHiddenFromEnemy) {
  if (!playerTransform || !playerHiddenFromEnemy || ai.state === EnemyPressureState.SEARCH) return false;
  return ai.targetId === playerId || ai.pendingAttackTargetId === playerId;
}

function beginSmokeSearch(game, enemy, transform, ai, cooldowns, playerTransform, concealment) {
  const wasAttackCommitted = isEnemyAttackBusy(ai);
  ai.targetId = null;
  resetEnemyAttack(ai);
  cooldowns.attack = Math.max(
    Number(cooldowns.attack) || 0,
    wasAttackCommitted ? SMOKE_TACTICS.interruptedAttackCooldownSeconds : 0
  );
  ai.cooldownTimer = cooldowns.attack;
  ai.smokeSearchTimer = SMOKE_TACTICS.searchDurationSeconds;
  ai.smokeReacquireTimer = SMOKE_TACTICS.reacquireDelaySeconds;
  ai.smokeSearchCenterX = playerTransform.x;
  ai.smokeSearchCenterY = playerTransform.y;
  ai.smokeSearchTargetX = playerTransform.x;
  ai.smokeSearchTargetY = playerTransform.y;
  ai.smokeSearchWaypointTimer = 0;
  ai.smokeSearchDecisionIndex += 1;
  ai.smokeBreakCount += 1;
  ai.lastSmokeBreakAt = ai.elapsed;
  ai.lastSmokeBreakReason = concealment && concealment.sourceKind
    ? (Math.hypot(concealment.x - transform.x, concealment.y - transform.y) <= concealment.radius
      ? 'enemy_disoriented'
      : 'player_concealed')
    : 'dragon_smoke_occlusion';
  ai.lastSmokeSourceKind = concealment?.sourceKind ?? null;
  setState(ai, EnemyPressureState.SEARCH);
  spawnVisualRecipe(game, VisualRecipeId.SMOKE_PURSUIT_BREAK, {
    x: transform.x,
    y: transform.y,
    radius: SMOKE_TACTICS.breakEffectRadiusTiles
  });
  emitEvent(game.world, EventType.SMOKE_PURSUIT_BROKEN, {
    enemy,
    target: game.dragonId,
    reason: ai.lastSmokeBreakReason,
    sourceKind: ai.lastSmokeSourceKind,
    lastKnownX: ai.smokeSearchCenterX,
    lastKnownY: ai.smokeSearchCenterY,
    interruptedAttack: wasAttackCommitted
  });
}

function updateSmokeSearchTarget(entity, ai, transform, map) {
  const targetX = nullableFiniteNumber(ai.smokeSearchTargetX) ?? transform.x;
  const targetY = nullableFiniteNumber(ai.smokeSearchTargetY) ?? transform.y;
  if (ai.smokeSearchWaypointTimer > 0 && Math.hypot(targetX - transform.x, targetY - transform.y) > SEARCH_TARGET_DISTANCE) return;
  const index = ai.smokeSearchDecisionIndex + 1;
  const seed = hashEntityId(`${entity}:smoke_search`);
  const noise = deterministicNoise(seed, index);
  const angle = (seed * 0.009 + index * GOLDEN_ANGLE) % (Math.PI * 2);
  const radius = SMOKE_TACTICS.searchRadiusTiles * (0.62 + noise * 0.38);
  ai.smokeSearchDecisionIndex = index;
  ai.smokeSearchTargetX = clamp(finiteNumber(ai.smokeSearchCenterX, transform.x) + Math.cos(angle) * radius, 1.1, map.width - 1.1);
  ai.smokeSearchTargetY = clamp(finiteNumber(ai.smokeSearchCenterY, transform.y) + Math.sin(angle) * radius, 1.1, map.height - 1.1);
  ai.smokeSearchWaypointTimer = SMOKE_TACTICS.searchWaypointSeconds;
}

function finishSmokeSearch(ai) {
  ai.smokeSearchTimer = 0;
  ai.smokeReacquireTimer = 0;
  ai.smokeSearchWaypointTimer = 0;
  ai.smokeSearchTargetX = null;
  ai.smokeSearchTargetY = null;
  if (ai.state === EnemyPressureState.SEARCH) setState(ai, EnemyPressureState.ROAM);
}

function setState(ai, state) {
  if (ai.state === state) return;
  ai.state = state;
  ai.lastStateChangeAt = ai.elapsed;
}

function hashEntityId(entity) {
  let hash = 2166136261;
  for (const char of String(entity)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function deterministicNoise(seed, index) {
  const value = Math.sin((seed % 100000) * 0.017 + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nullableFiniteNumber(value) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
