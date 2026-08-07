import { ComponentType } from '../constants/componentTypes.js';
import { EntityKind } from '../constants/entityKinds.js';
import { EventType } from '../constants/eventTypes.js';
import { Components } from '../components/createComponents.js';
import {
  PlayerLifecycleState,
  PLAYER_LIFECYCLE_PROFILE,
  createWakeFlickerSequence,
  isPlayerInteractiveLifecycle
} from '../data/playerLifecycle.js';
import { DEATH_AFTERMATH_CAP, getDeathAftermathProfile, getDeathAftermathProfileById } from '../data/deathAftermath.js';
import { drainEvents } from '../ecs/events.js';
import { query } from '../ecs/query.js';
import { addComponent, createEntity, getComponent, removeComponent, removeEntity } from '../ecs/world.js';
import { resetEnemyAttack } from './enemyAttackSystem.js';
import { canEntityOccupy } from './movementSystem.js';
import { resetChargeCounterState } from './chargeCounterSystem.js';

const LIVE_AUTHORITY_COMPONENTS = Object.freeze([
  ComponentType.EnemyPressureAI,
  ComponentType.AttackSet,
  ComponentType.PlayerControlled,
  ComponentType.PlayerIntent,
  ComponentType.Motion,
  ComponentType.Stamina,
  ComponentType.DodgeState,
  ComponentType.Cooldowns,
  ComponentType.StatusEffects,
  ComponentType.ImpactResponse,
  ComponentType.SmokeEmitter,
  ComponentType.NapalmDripEmitter
]);

export function deathLifecycleSystem({ game, map = null, dt = 0 }) {
  const world = game.world;
  for (const event of drainEvents(world, EventType.ENTITY_DIED)) {
    handleEntityDeath(game, event.payload ?? {});
  }
  tickPlayerLifecycle(game, map, Math.max(0, Number(dt) || 0));
}

export function handleEntityDeath(game, payload) {
  const world = game.world;
  const entity = payload.entity;
  const health = getComponent(world, entity, ComponentType.Health);
  if (!entity || !world.entities.has(entity) || health?.alive !== false) return null;
  if (entity === game.dragonId || getComponent(world, entity, ComponentType.PlayerLifecycle)) {
    return handlePlayerDeath(game, entity, payload);
  }
  const existing = getComponent(world, entity, ComponentType.DeathState);
  if (existing?.handled) return existing.aftermathEntityId ?? null;

  clearTargetReferences(world, entity);
  const ai = getComponent(world, entity, ComponentType.EnemyPressureAI);
  if (ai) {
    ai.targetId = null;
    resetEnemyAttack(ai);
  }

  const kind = getComponent(world, entity, ComponentType.Kind)?.type;
  const transform = getComponent(world, entity, ComponentType.Transform);
  const creatureRecipe = getComponent(world, entity, ComponentType.CreatureRecipe);
  const profile = creatureRecipe?.gameplay?.deathProfileId
    ? getDeathAftermathProfileById(creatureRecipe.gameplay.deathProfileId)
    : getDeathAftermathProfile(kind);
  const aftermathEntityId = profile && transform
    ? createCorpseAftermath(world, entity, kind, transform, profile, creatureRecipe)
    : null;

  addComponent(world, entity, ComponentType.DeathState, Components.deathState({
    sourceEntityId: payload.source,
    damageType: payload.damageType,
    aftermathEntityId,
    handledAt: game.renderTime ?? 0
  }));
  for (const componentType of LIVE_AUTHORITY_COMPONENTS) removeComponent(world, entity, componentType);
  trimCorpseAftermath(world);
  return aftermathEntityId;
}

export function isPlayerInteractive(world, entity) {
  return isPlayerInteractiveLifecycle(getComponent(world, entity, ComponentType.PlayerLifecycle));
}

export function performCanonicalPlayerRespawn(game, map) {
  const world = game.world;
  const entity = game.dragonId;
  const lifecycle = getComponent(world, entity, ComponentType.PlayerLifecycle);
  const transform = getComponent(world, entity, ComponentType.Transform);
  if (!lifecycle || !transform) return null;
  const point = chooseRespawnPoint(world, entity, map);
  transform.x = point.x;
  transform.y = point.y;
  transform.rotation = point.rotation ?? 0;
  resetPlayerLiveState(world, entity);
  lifecycle.respawnCount += 1;
  lifecycle.lastRespawnSource = point.source;
  lifecycle.lastRespawnX = point.x;
  lifecycle.lastRespawnY = point.y;
  lifecycle.wakeFlicker = createWakeFlickerSequence(lifecycle.deathCount * 7919 + lifecycle.respawnCount);
  clearTargetReferences(world, entity);
  transitionPlayerLifecycle(lifecycle, PlayerLifecycleState.WAKING);
  return point;
}

function createCorpseAftermath(world, sourceEntityId, sourceKind, transform, profile, creatureRecipe = null) {
  const corpseEntity = createEntity(world, EntityKind.CORPSE);
  addComponent(world, corpseEntity, ComponentType.Kind, Components.kind(EntityKind.CORPSE, `${sourceKind} remains`));
  addComponent(world, corpseEntity, ComponentType.Transform, Components.transform(transform.x, transform.y, transform.rotation ?? 0));
  addComponent(world, corpseEntity, ComponentType.Corpse, Components.corpse({
    ...profile,
    profileId: profile.id,
    sourceEntityId,
    sourceKind,
    sourceRecipeId: creatureRecipe?.recipeId ?? null,
    sourceVariantSignature: creatureRecipe?.variantSignature ?? null,
    createdOrder: world.nextEntityId - 1
  }));
  return corpseEntity;
}

function handlePlayerDeath(game, entity, payload) {
  const lifecycle = ensurePlayerLifecycle(game.world, entity);
  if (!lifecycle) return null;
  if (lifecycle.state !== PlayerLifecycleState.ALIVE) return null;
  lifecycle.deathCount += 1;
  lifecycle.lastDeathSourceEntityId = payload.source ?? null;
  lifecycle.lastDeathDamageType = payload.damageType ?? 'unknown';
  clearTargetReferences(game.world, entity);
  resetPlayerActionState(game.world, entity);
  zeroPlayerIntent(game.world, entity);
  transitionPlayerLifecycle(lifecycle, PlayerLifecycleState.DYING);
  transitionPlayerLifecycle(lifecycle, PlayerLifecycleState.DEATH_FADE);
  return null;
}

function tickPlayerLifecycle(game, map, dt) {
  const lifecycle = ensurePlayerLifecycle(game.world, game.dragonId);
  if (!lifecycle) return;
  lifecycle.controlSuppressed = !isPlayerInteractiveLifecycle(lifecycle);
  if (lifecycle.controlSuppressed) zeroPlayerIntent(game.world, game.dragonId);
  if (lifecycle.state === PlayerLifecycleState.ALIVE) return;
  lifecycle.stateElapsed += dt;
  if (lifecycle.state === PlayerLifecycleState.DEATH_FADE
    && lifecycle.stateElapsed >= PLAYER_LIFECYCLE_PROFILE.deathFadeSeconds) {
    transitionPlayerLifecycle(lifecycle, PlayerLifecycleState.RESPAWN_PENDING);
    return;
  }
  if (lifecycle.state === PlayerLifecycleState.RESPAWN_PENDING
    && lifecycle.stateElapsed >= PLAYER_LIFECYCLE_PROFILE.respawnPendingSeconds) {
    performCanonicalPlayerRespawn(game, map);
    return;
  }
  if (lifecycle.state === PlayerLifecycleState.WAKING) {
    lifecycle.controlSuppressed = !isPlayerInteractiveLifecycle(lifecycle);
    if (lifecycle.controlSuppressed) zeroPlayerIntent(game.world, game.dragonId);
    if (lifecycle.stateElapsed >= PLAYER_LIFECYCLE_PROFILE.wakeSeconds) {
      lifecycle.wakeFlicker = [];
      transitionPlayerLifecycle(lifecycle, PlayerLifecycleState.ALIVE);
      lifecycle.controlSuppressed = false;
    }
  }
}

function chooseRespawnPoint(world, entity, map) {
  const source = map?.lastSafeCheckpoint ?? map?.checkpoint ?? map?.spawn ?? { x: 1, y: 1 };
  const base = {
    x: finiteNumber(source.x, 1) + 0.5,
    y: finiteNumber(source.y, 1) + 0.5,
    rotation: finiteNumber(source.rotation, 0),
    source: source.id ?? PLAYER_LIFECYCLE_PROFILE.respawn.sourcePolicy
  };
  if (!map || canEntityOccupy(world, entity, base.x, base.y, map)) return base;
  const offsets = [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2]
  ];
  for (const [ox, oy] of offsets) {
    const x = base.x + ox;
    const y = base.y + oy;
    if (canEntityOccupy(world, entity, x, y, map)) return { ...base, x, y, source: `${base.source}:nearest_safe_offset` };
  }
  return base;
}

function resetPlayerLiveState(world, entity) {
  const health = getComponent(world, entity, ComponentType.Health);
  if (health) {
    const ratio = PLAYER_LIFECYCLE_PROFILE.respawn.healthRatio;
    health.hp = Math.max(1, health.maxHp * ratio);
    health.alive = true;
    health.recoveryDelayRemainingMs = 0;
    health.hitPulseRemainingMs = 0;
    health.pressure = PLAYER_LIFECYCLE_PROFILE.respawn.pressure;
    health.recovering = false;
    health.lastDamageAmount = 0;
    health.lastDamageType = null;
  }
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  if (stamina) {
    stamina.current = stamina.max * PLAYER_LIFECYCLE_PROFILE.respawn.staminaRatio;
    stamina.recoveryTimer = 0;
    stamina.sprinting = false;
    stamina.exhausted = false;
    stamina.state = 'ready';
    stamina.lastSpendReason = null;
  }
  const cooldowns = getComponent(world, entity, ComponentType.Cooldowns);
  if (cooldowns) {
    for (const key of Object.keys(cooldowns)) cooldowns[key] = 0;
  }
  const motion = getComponent(world, entity, ComponentType.Motion);
  if (motion) {
    motion.speedMultiplier = 1;
    motion.corpseSlowdownMultiplier = 1;
  }
  resetPlayerActionState(world, entity);
  zeroPlayerIntent(world, entity);
}

function resetPlayerActionState(world, entity) {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  if (dodge) Object.assign(dodge, Components.dodgeState({
    id: dodge.profileId,
    stamina: {
      max: getComponent(world, entity, ComponentType.Stamina)?.max ?? 0,
      regenPerSecond: getComponent(world, entity, ComponentType.Stamina)?.regenPerSecond ?? 0,
      recoveryDelay: getComponent(world, entity, ComponentType.Stamina)?.recoveryDelay ?? 0
    },
    sprint: {
      enabled: getComponent(world, entity, ComponentType.Stamina)?.sprintEnabled === true,
      multiplier: getComponent(world, entity, ComponentType.Stamina)?.sprintMultiplier ?? 1,
      drainPerSecond: getComponent(world, entity, ComponentType.Stamina)?.sprintDrainPerSecond ?? 0,
      resumeThreshold: getComponent(world, entity, ComponentType.Stamina)?.sprintResumeThreshold ?? 0
    },
    dodge: {
      enabled: dodge.enabled,
      cost: dodge.cost,
      distance: dodge.distance,
      duration: dodge.duration,
      cooldown: dodge.cooldown,
      visualRecoveryDuration: dodge.visualRecoveryDuration,
      visualRecoveryStartPhase: dodge.visualRecoveryStartPhase,
      aiStyle: dodge.aiStyle,
      aiTriggerRange: dodge.aiTriggerRange
    }
  }));
  const impact = getComponent(world, entity, ComponentType.ImpactResponse);
  if (impact) {
    impact.knockbackVelocityX = 0;
    impact.knockbackVelocityY = 0;
    impact.staggerTimer = 0;
    impact.reactionDuration = 0;
    impact.lastImpact = null;
  }
  const action = getComponent(world, entity, ComponentType.ActionState);
  if (action) Object.assign(action, Components.actionState());
  resetChargeCounterState(getComponent(world, entity, ComponentType.ChargeCounterState));
  const combo = getComponent(world, entity, ComponentType.ComboState);
  if (combo) Object.assign(combo, Components.comboState());
  const motionState = getComponent(world, entity, ComponentType.MotionState);
  if (motionState) Object.assign(motionState, Components.motionState());
}

function zeroPlayerIntent(world, entity) {
  const intent = getComponent(world, entity, ComponentType.PlayerIntent);
  if (!intent) return;
  Object.assign(intent, Components.playerIntent());
}

function ensurePlayerLifecycle(world, entity) {
  if (!entity || !world.entities.has(entity)) return null;
  let lifecycle = getComponent(world, entity, ComponentType.PlayerLifecycle);
  if (!lifecycle) {
    addComponent(world, entity, ComponentType.PlayerLifecycle, Components.playerLifecycle());
    lifecycle = getComponent(world, entity, ComponentType.PlayerLifecycle);
  }
  return lifecycle;
}

function transitionPlayerLifecycle(lifecycle, nextState) {
  lifecycle.previousState = lifecycle.state ?? null;
  lifecycle.state = nextState;
  lifecycle.stateElapsed = 0;
  lifecycle.controlSuppressed = !isPlayerInteractiveLifecycle(lifecycle);
}

function clearTargetReferences(world, deadEntity) {
  for (const entity of query(world, [ComponentType.EnemyPressureAI])) {
    const ai = getComponent(world, entity, ComponentType.EnemyPressureAI);
    if (ai.targetId === deadEntity) ai.targetId = null;
    if (ai.pendingAttackTargetId === deadEntity) resetEnemyAttack(ai);
  }
}

function trimCorpseAftermath(world) {
  const corpses = query(world, [ComponentType.Corpse])
    .map((entity) => ({ entity, createdOrder: getComponent(world, entity, ComponentType.Corpse).createdOrder }))
    .sort((a, b) => a.createdOrder - b.createdOrder);
  const overflow = corpses.length - DEATH_AFTERMATH_CAP;
  for (const entry of corpses.slice(0, Math.max(0, overflow))) removeEntity(world, entry.entity);
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
