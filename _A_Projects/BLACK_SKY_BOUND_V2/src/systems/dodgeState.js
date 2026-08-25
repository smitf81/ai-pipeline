import { ComponentType } from '../constants/componentTypes.js';
import { EnemyAttackPhase } from '../data/enemyAttackProfiles.js';
import { getWyvernActionProfile } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { getComponent } from '../ecs/world.js';
import {
  canDodgeInterruptProceduralAction,
  cancelProceduralRecovery,
  interruptProceduralActionForDodge
} from './proceduralActionState.js';
import { resolvePlayerDodgeGradient } from './dodgeStaminaGradient.js';
import { isPlayerInteractiveLifecycle } from '../data/playerLifecycle.js';

export function startDodge(world, entity, direction, reason = 'manual', options = {}) {
  const check = canStartDodge(world, entity, options);
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  if (!check.ok) {
    if (dodge) dodge.lastDeniedReason = check.reason;
    return false;
  }
  const normalized = normalizeDirection(direction?.x, direction?.y);
  if (!normalized) {
    dodge.lastDeniedReason = 'missing_direction';
    return false;
  }
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const resolved = options.resolvedGradient ?? defaultDodgeResolution(stamina, dodge);
  if (options.preserveActionRecovery !== true) cancelProceduralRecovery(getComponent(world, entity, ComponentType.ActionState));
  if (options.costAlreadyPaid !== true) spendDodgeCost(stamina, resolved.staminaSpend, reason, resolved.mode);
  clearQueuedDodge(dodge);
  Object.assign(dodge, {
    active: true,
    recovering: false,
    directionX: normalized.x,
    directionY: normalized.y,
    elapsed: 0,
    phase: 0,
    recoveryElapsed: 0,
    recoveryProgress: 0,
    recoveryStartPhase: 1,
    landingHoldRemaining: 0,
    distance: resolved.distanceTiles,
    distanceRequestedMeters: resolved.distanceMeters,
    distanceApplied: 0,
    blocked: false,
    cooldownRemaining: resolved.cooldownSeconds,
    cooldownApplied: resolved.cooldownSeconds,
    mode: resolved.mode,
    energy01: resolved.energy01,
    effectiveness: resolved.effectiveness,
    gradient01: resolved.curve01,
    apexHeightMeters: resolved.apexHeightMeters,
    landingCompressionMeters: resolved.landingCompressionMeters,
    staminaSpent: resolved.staminaSpend,
    followupsEnabled: resolved.followupsEnabled,
    count: dodge.count + 1,
    chainIndex: Math.max(1, Number(options.chainIndex) || 1),
    queuedChain: false,
    queuedDirectionX: 0,
    queuedDirectionY: 0,
    reservedChainCost: 0,
    queuedMode: null,
    committedBranch: null,
    lastReason: reason,
    lastDeniedReason: null
  });
  return true;
}

export function requestPlayerDodge(world, entity, direction, reason = 'player_input') {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const normalized = normalizeDirection(direction?.x, direction?.y);
  const gradient = dodge && stamina ? resolvePlayerDodgeGradient(stamina, dodge) : null;
  const denial = playerDodgeRequestDenial(world, entity, normalized);
  if (denial) return denyPlayerDodge(dodge, denial, normalized, gradient);

  const action = getComponent(world, entity, ComponentType.ActionState);
  if (dodge.cooldownRemaining > 0) {
    const staminaBefore = snapshotStamina(stamina);
    spendDodgeCost(stamina, gradient.staminaSpend, 'dodge_buffer', gradient.mode);
    const interruption = interruptProceduralActionForDodge(world, entity, {
      reason,
      blendSeconds: dodge.interruptionBlendSeconds
    });
    storeBufferedDodge(dodge, normalized, gradient, staminaBefore);
    const receipt = dodgeReceipt('buffered', null, normalized, gradient, interruption.receipt, 1);
    dodge.lastRequestReceipt = receipt;
    dodge.lastDeniedReason = null;
    return { ok: true, outcome: 'buffered', receipt };
  }

  const interruption = interruptProceduralActionForDodge(world, entity, {
    reason,
    blendSeconds: dodge.interruptionBlendSeconds
  });
  const started = startDodge(world, entity, normalized, reason, {
    allowPartialStamina: true,
    allowActionBypass: interruption.interrupted === true || !action?.active,
    preserveActionRecovery: interruption.interrupted === true,
    resolvedGradient: gradient
  });
  if (!started) return denyPlayerDodge(dodge, dodge.lastDeniedReason ?? 'dodge_start_failed', normalized, gradient);
  const receipt = dodgeReceipt('started', null, normalized, gradient, interruption.receipt, 1);
  dodge.lastRequestReceipt = receipt;
  return { ok: true, outcome: 'started', receipt };
}

export function advanceBufferedPlayerDodge(world, entity, dt) {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  if (!dodge?.buffered) return null;
  const delta = Math.max(0, Number(dt) || 0);
  dodge.bufferRemaining = Math.max(0, dodge.bufferRemaining - delta);
  const hardLock = bufferedDodgeHardLock(world, entity);
  if (hardLock) return cancelBufferedPlayerDodge(world, entity, hardLock);
  if (dodge.cooldownRemaining > 0.0001) {
    if (dodge.bufferRemaining <= 0) return cancelBufferedPlayerDodge(world, entity, 'dodge_buffer_expired');
    return { ok: true, outcome: 'pending', receipt: dodge.lastRequestReceipt };
  }

  const direction = { x: dodge.bufferedDirectionX, y: dodge.bufferedDirectionY };
  const resolved = bufferedResolution(dodge);
  const interruption = dodge.lastRequestReceipt?.interruptedAction ?? null;
  const started = startDodge(world, entity, direction, 'buffered_player_input', {
    allowCooldownBypass: true,
    allowPartialStamina: true,
    allowActionBypass: true,
    preserveActionRecovery: true,
    costAlreadyPaid: true,
    resolvedGradient: resolved
  });
  if (!started) return cancelBufferedPlayerDodge(world, entity, dodge.lastDeniedReason ?? 'dodge_buffer_launch_failed');
  clearBufferedDodge(dodge);
  const receipt = dodgeReceipt('started', null, direction, resolved, interruption, 1, true);
  dodge.lastRequestReceipt = receipt;
  return { ok: true, outcome: 'started', receipt };
}

export function cancelBufferedPlayerDodge(world, entity, reason = 'dodge_buffer_cancelled') {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  if (!dodge?.buffered) return { ok: false, outcome: 'none', receipt: null };
  const direction = { x: dodge.bufferedDirectionX, y: dodge.bufferedDirectionY };
  const resolved = bufferedResolution(dodge);
  const interruption = dodge.lastRequestReceipt?.interruptedAction ?? null;
  restoreReservedStamina(
    getComponent(world, entity, ComponentType.Stamina),
    dodge.bufferedReservedCost,
    dodge.bufferedStaminaBefore,
    dodge.bufferedRecoveryTimerBefore,
    dodge.bufferedExhaustedBefore,
    reason
  );
  clearBufferedDodge(dodge);
  const receipt = dodgeReceipt('cancelled', reason, direction, resolved, interruption, 1, true);
  dodge.lastRequestReceipt = receipt;
  dodge.lastDeniedReason = reason;
  return { ok: false, outcome: 'cancelled', receipt };
}

export function canStartDodge(world, entity, options = {}) {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const health = getComponent(world, entity, ComponentType.Health);
  const action = getComponent(world, entity, ComponentType.ActionState);
  const pounce = getComponent(world, entity, ComponentType.PounceCounterState);
  const enemyAI = getComponent(world, entity, ComponentType.EnemyPressureAI);
  const impact = getComponent(world, entity, ComponentType.ImpactResponse);
  const lifecycle = getComponent(world, entity, ComponentType.PlayerLifecycle);
  if (!dodge?.enabled) return { ok: false, reason: 'dodge_disabled' };
  if (!health?.alive) return { ok: false, reason: 'not_alive' };
  if (lifecycle && !isPlayerInteractiveLifecycle(lifecycle)) return { ok: false, reason: 'lifecycle_locked' };
  if (dodge.active) return { ok: false, reason: 'dodge_active' };
  if (pounce?.active || pounce?.queued) return { ok: false, reason: 'pounce_counter_committed' };
  if (dodge.cooldownRemaining > 0 && options.allowCooldownBypass !== true) return { ok: false, reason: 'dodge_cooldown' };
  if (options.costAlreadyPaid !== true && options.allowPartialStamina !== true
    && (!stamina || stamina.current + 0.0001 < dodge.cost)) return { ok: false, reason: 'insufficient_stamina' };
  if (action?.active && options.allowActionBypass !== true) return { ok: false, reason: 'procedural_action_active' };
  if (enemyAI?.attackPhase === EnemyAttackPhase.WINDUP
    || enemyAI?.attackPhase === EnemyAttackPhase.ACTIVE
    || enemyAI?.attackPhase === EnemyAttackPhase.RECOVER) {
    return { ok: false, reason: 'enemy_attack_active' };
  }
  if ((impact?.staggerTimer ?? 0) > 0) return { ok: false, reason: 'staggered' };
  return { ok: true, reason: null };
}

export function resolvePlayerDodgeDirection(intent, transform) {
  const movement = normalizeDirection(intent?.moveX, intent?.moveY);
  if (movement) return movement;
  const aim = transform && intent?.aimActive
    ? normalizeDirection((intent?.aimX ?? transform.x) - transform.x, (intent?.aimY ?? transform.y) - transform.y)
    : null;
  if (aim) return { x: -aim.x, y: -aim.y };
  const rotation = transform?.rotation ?? 0;
  return { x: -Math.cos(rotation), y: -Math.sin(rotation) };
}

export function queueDodgeChain(world, entity, direction) {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const health = getComponent(world, entity, ComponentType.Health);
  const pounce = getComponent(world, entity, ComponentType.PounceCounterState);
  const normalized = normalizeDirection(direction?.x, direction?.y);
  let denied = null;
  if (!dodge?.enabled) denied = 'dodge_disabled';
  else if (!health?.alive) denied = 'not_alive';
  else if (!(dodge.active || dodge.recovering)) denied = 'dodge_chain_window_closed';
  else if (dodge.followupsEnabled === false) denied = 'emergency_dodge_no_followup';
  else if (dodge.committedBranch || pounce?.queued || pounce?.active) denied = 'followup_committed';
  else if ((dodge.chainIndex ?? 0) >= 2) denied = 'dodge_chain_limit';
  else if (!normalized) denied = 'missing_direction';
  if (denied) {
    if (dodge) dodge.lastDeniedReason = denied;
    return false;
  }
  const gradient = resolvePlayerDodgeGradient(stamina, dodge);
  const staminaBefore = snapshotStamina(stamina);
  spendDodgeCost(stamina, gradient.staminaSpend, 'dodge_chain', gradient.mode);
  Object.assign(dodge, {
    queuedChain: true,
    queuedDirectionX: normalized.x,
    queuedDirectionY: normalized.y,
    reservedChainCost: gradient.staminaSpend,
    queuedMode: gradient.mode,
    queuedEnergy01: gradient.energy01,
    queuedEffectiveness: gradient.effectiveness,
    queuedGradient01: gradient.curve01,
    queuedDistance: gradient.distanceTiles,
    queuedDistanceMeters: gradient.distanceMeters,
    queuedApexHeightMeters: gradient.apexHeightMeters,
    queuedLandingCompressionMeters: gradient.landingCompressionMeters,
    queuedCooldown: gradient.cooldownSeconds,
    queuedFollowupsEnabled: gradient.followupsEnabled,
    queuedStaminaBefore: staminaBefore.current,
    queuedRecoveryTimerBefore: staminaBefore.recoveryTimer,
    queuedExhaustedBefore: staminaBefore.exhausted,
    committedBranch: 'dodge_chain',
    lastDeniedReason: null,
    lastRequestReceipt: dodgeReceipt('queued_chain', null, normalized, gradient, null, (dodge.chainIndex ?? 1) + 1)
  });
  if (pounce) pounce.followupWindowRemaining = 0;
  return true;
}

export function queuedDodgeResolution(dodge) {
  return Object.freeze({
    energy01: dodge.queuedEnergy01,
    curve01: dodge.queuedGradient01,
    effectiveness: dodge.queuedEffectiveness,
    mode: dodge.queuedMode ?? 'full',
    followupsEnabled: dodge.queuedFollowupsEnabled !== false,
    staminaBefore: dodge.queuedStaminaBefore,
    staminaSpend: dodge.reservedChainCost,
    distanceTiles: dodge.queuedDistance,
    distanceMeters: dodge.queuedDistanceMeters,
    apexHeightMeters: dodge.queuedApexHeightMeters,
    landingCompressionMeters: dodge.queuedLandingCompressionMeters,
    cooldownSeconds: dodge.queuedCooldown
  });
}

export function refundQueuedDodgeCost(world, entity, reason = 'dodge_chain_cancelled') {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  restoreReservedStamina(
    stamina,
    dodge?.reservedChainCost ?? 0,
    dodge?.queuedStaminaBefore ?? stamina?.current ?? 0,
    dodge?.queuedRecoveryTimerBefore ?? stamina?.recoveryTimer ?? 0,
    dodge?.queuedExhaustedBefore ?? stamina?.exhausted ?? false,
    reason
  );
  if (dodge) clearQueuedDodge(dodge);
}

export function tryStartThreatDodge(world, defender, attacker) {
  const dodge = getComponent(world, defender, ComponentType.DodgeState);
  if (!dodge?.enabled || !dodge.aiStyle || !isIncomingAttackThreat(world, defender, attacker, dodge.aiTriggerRange)) return false;
  return startDodge(world, defender, resolveThreatDodgeDirection(world, defender, attacker), `incoming_attack:${attacker}`);
}

export function isIncomingAttackThreat(world, defender, attacker, triggerRange) {
  if (!attacker || attacker === defender) return false;
  const defenderTransform = getComponent(world, defender, ComponentType.Transform);
  const attackerTransform = getComponent(world, attacker, ComponentType.Transform);
  if (!defenderTransform || !attackerTransform) return false;
  if (Math.hypot(defenderTransform.x - attackerTransform.x, defenderTransform.y - attackerTransform.y) > triggerRange) return false;
  const enemyAI = getComponent(world, attacker, ComponentType.EnemyPressureAI);
  if (enemyAI?.attackPhase === EnemyAttackPhase.WINDUP && enemyAI.pendingAttackTargetId === defender) return true;
  const action = getComponent(world, attacker, ComponentType.ActionState);
  if (!action?.active) return false;
  const profile = getWyvernActionProfile(action.actionId);
  if (!profile?.contact || action.phase > profile.contact.activePhaseEnd) return false;
  const towardDefender = normalizeDirection(defenderTransform.x - attackerTransform.x, defenderTransform.y - attackerTransform.y);
  const attackDirection = normalizeDirection(action.directionX, action.directionY);
  return !!towardDefender && !!attackDirection && towardDefender.x * attackDirection.x + towardDefender.y * attackDirection.y >= 0.42;
}

export function resolveThreatDodgeDirection(world, defender, attacker) {
  const defenderTransform = getComponent(world, defender, ComponentType.Transform);
  const attackerTransform = getComponent(world, attacker, ComponentType.Transform);
  const dodge = getComponent(world, defender, ComponentType.DodgeState);
  const away = normalizeDirection(defenderTransform.x - attackerTransform.x, defenderTransform.y - attackerTransform.y) ?? { x: 1, y: 0 };
  const sideSign = deterministicSide(`${defender}:${dodge?.count ?? 0}`);
  const side = { x: -away.y * sideSign, y: away.x * sideSign };
  if (dodge?.aiStyle === 'side') return side;
  return normalizeDirection(away.x * 0.72 + side.x * 0.7, away.y * 0.72 + side.y * 0.7) ?? away;
}

function playerDodgeRequestDenial(world, entity, direction) {
  const dodge = getComponent(world, entity, ComponentType.DodgeState);
  const health = getComponent(world, entity, ComponentType.Health);
  const pounce = getComponent(world, entity, ComponentType.PounceCounterState);
  const impact = getComponent(world, entity, ComponentType.ImpactResponse);
  const lifecycle = getComponent(world, entity, ComponentType.PlayerLifecycle);
  if (!dodge?.enabled) return 'dodge_disabled';
  if (!health?.alive) return 'not_alive';
  if (lifecycle && !isPlayerInteractiveLifecycle(lifecycle)) return 'lifecycle_locked';
  if (!direction) return 'missing_direction';
  if (dodge.buffered) return 'dodge_buffer_occupied';
  if (dodge.active) return 'dodge_active';
  if (dodge.recovering) return 'dodge_recovering';
  if (pounce?.active || pounce?.queued) return 'pounce_counter_committed';
  if ((impact?.staggerTimer ?? 0) > 0) return 'staggered';
  const actionCheck = canDodgeInterruptProceduralAction(world, entity);
  if (!actionCheck.ok) return actionCheck.reason;
  if (dodge.cooldownRemaining > dodge.inputBufferSeconds + 0.0001) return 'dodge_cooldown';
  return null;
}

function bufferedDodgeHardLock(world, entity) {
  const health = getComponent(world, entity, ComponentType.Health);
  const pounce = getComponent(world, entity, ComponentType.PounceCounterState);
  const impact = getComponent(world, entity, ComponentType.ImpactResponse);
  const action = getComponent(world, entity, ComponentType.ActionState);
  const lifecycle = getComponent(world, entity, ComponentType.PlayerLifecycle);
  if (!health?.alive) return 'not_alive';
  if (lifecycle && !isPlayerInteractiveLifecycle(lifecycle)) return 'lifecycle_locked';
  if (pounce?.active || pounce?.queued) return 'pounce_counter_committed';
  if ((impact?.staggerTimer ?? 0) > 0) return 'staggered';
  if (action?.active) return 'procedural_action_active';
  return null;
}

function denyPlayerDodge(dodge, reason, direction, gradient) {
  const receipt = dodgeReceipt('denied', reason, direction, gradient, null, 1);
  if (dodge) {
    dodge.lastDeniedReason = reason;
    dodge.lastRequestReceipt = receipt;
  }
  return { ok: false, outcome: 'denied', receipt };
}

function storeBufferedDodge(dodge, direction, gradient, staminaBefore) {
  Object.assign(dodge, {
    buffered: true,
    bufferRemaining: dodge.inputBufferSeconds,
    bufferedMode: gradient.mode,
    bufferedDirectionX: direction.x,
    bufferedDirectionY: direction.y,
    bufferedEnergy01: gradient.energy01,
    bufferedEffectiveness: gradient.effectiveness,
    bufferedGradient01: gradient.curve01,
    bufferedDistance: gradient.distanceTiles,
    bufferedDistanceMeters: gradient.distanceMeters,
    bufferedApexHeightMeters: gradient.apexHeightMeters,
    bufferedLandingCompressionMeters: gradient.landingCompressionMeters,
    bufferedCooldown: gradient.cooldownSeconds,
    bufferedReservedCost: gradient.staminaSpend,
    bufferedFollowupsEnabled: gradient.followupsEnabled,
    bufferedStaminaBefore: staminaBefore.current,
    bufferedRecoveryTimerBefore: staminaBefore.recoveryTimer,
    bufferedExhaustedBefore: staminaBefore.exhausted
  });
}

function bufferedResolution(dodge) {
  return Object.freeze({
    energy01: dodge.bufferedEnergy01,
    curve01: dodge.bufferedGradient01,
    effectiveness: dodge.bufferedEffectiveness,
    mode: dodge.bufferedMode ?? 'full',
    followupsEnabled: dodge.bufferedFollowupsEnabled !== false,
    staminaBefore: dodge.bufferedStaminaBefore,
    staminaSpend: dodge.bufferedReservedCost,
    distanceTiles: dodge.bufferedDistance,
    distanceMeters: dodge.bufferedDistanceMeters,
    apexHeightMeters: dodge.bufferedApexHeightMeters,
    landingCompressionMeters: dodge.bufferedLandingCompressionMeters,
    cooldownSeconds: dodge.bufferedCooldown
  });
}

function clearBufferedDodge(dodge) {
  Object.assign(dodge, {
    buffered: false,
    bufferRemaining: 0,
    bufferedMode: null,
    bufferedDirectionX: 0,
    bufferedDirectionY: 0,
    bufferedEnergy01: 0,
    bufferedEffectiveness: 0,
    bufferedGradient01: 0,
    bufferedDistance: 0,
    bufferedDistanceMeters: 0,
    bufferedApexHeightMeters: 0,
    bufferedLandingCompressionMeters: 0,
    bufferedCooldown: 0,
    bufferedReservedCost: 0,
    bufferedFollowupsEnabled: false,
    bufferedStaminaBefore: 0,
    bufferedRecoveryTimerBefore: 0,
    bufferedExhaustedBefore: false
  });
}

function clearQueuedDodge(dodge) {
  Object.assign(dodge, {
    queuedChain: false,
    queuedDirectionX: 0,
    queuedDirectionY: 0,
    reservedChainCost: 0,
    queuedMode: null,
    queuedEnergy01: 0,
    queuedEffectiveness: 0,
    queuedGradient01: 0,
    queuedDistance: 0,
    queuedDistanceMeters: 0,
    queuedApexHeightMeters: 0,
    queuedLandingCompressionMeters: 0,
    queuedCooldown: 0,
    queuedFollowupsEnabled: false,
    queuedStaminaBefore: 0,
    queuedRecoveryTimerBefore: 0,
    queuedExhaustedBefore: false,
    committedBranch: null
  });
}

function defaultDodgeResolution(stamina, dodge) {
  const current = Math.max(0, Number(stamina?.current) || 0);
  const max = Math.max(0.001, Number(stamina?.max) || 1);
  return Object.freeze({
    energy01: Math.max(0, Math.min(1, current / max)),
    curve01: 1,
    effectiveness: 1,
    mode: 'full',
    followupsEnabled: true,
    staminaBefore: current,
    staminaSpend: dodge.cost,
    distanceTiles: dodge.baseDistance ?? dodge.distance,
    distanceMeters: dodge.distanceMaxMeters ?? (dodge.baseDistance ?? dodge.distance) * 0.5,
    apexHeightMeters: dodge.apexMaxMeters ?? 0.12,
    landingCompressionMeters: dodge.landingCompressionFullEnergyMeters ?? 0.06,
    cooldownSeconds: dodge.baseCooldown ?? dodge.cooldown
  });
}

function dodgeReceipt(outcome, reason, direction, resolved, interruption, chainIndex, buffered = false) {
  return Object.freeze({
    classification: 'player_dodge_request_receipt_v1',
    outcome,
    reason: reason ?? null,
    mode: resolved?.mode ?? null,
    energy01: resolved?.energy01 ?? null,
    effectiveness: resolved?.effectiveness ?? null,
    gradient01: resolved?.curve01 ?? null,
    directionX: direction?.x ?? null,
    directionY: direction?.y ?? null,
    staminaBefore: resolved?.staminaBefore ?? null,
    staminaSpent: resolved?.staminaSpend ?? 0,
    distanceMeters: resolved?.distanceMeters ?? 0,
    distanceTiles: resolved?.distanceTiles ?? 0,
    cooldownSeconds: resolved?.cooldownSeconds ?? 0,
    followupsEnabled: resolved?.followupsEnabled === true,
    chainIndex,
    buffered,
    interruptedAction: interruption ?? null
  });
}

function snapshotStamina(stamina) {
  return {
    current: Math.max(0, Number(stamina?.current) || 0),
    recoveryTimer: Math.max(0, Number(stamina?.recoveryTimer) || 0),
    exhausted: stamina?.exhausted === true
  };
}

function restoreReservedStamina(stamina, amount, currentBefore, recoveryTimerBefore, exhaustedBefore, reason) {
  if (!stamina) return;
  const refund = Math.max(0, Number(amount) || 0);
  stamina.current = Math.min(stamina.max, Math.max(Number(currentBefore) || 0, stamina.current + refund));
  stamina.spentTotal = Math.max(0, stamina.spentTotal - refund);
  stamina.recoveryTimer = Math.max(0, Number(recoveryTimerBefore) || 0);
  stamina.exhausted = exhaustedBefore === true;
  stamina.lastSpendReason = reason;
}

function spendDodgeCost(stamina, cost, reason, mode = 'full') {
  const amount = Math.min(Math.max(0, Number(stamina?.current) || 0), Math.max(0, Number(cost) || 0));
  stamina.current = Math.max(0, stamina.current - amount);
  stamina.spentTotal += amount;
  stamina.lastSpendReason = reason === 'dodge_chain'
    ? (mode === 'emergency' ? 'emergency_dodge_chain' : 'dodge_chain')
    : (mode === 'emergency' ? 'emergency_dodge' : reason === 'dodge_buffer' ? 'dodge_buffer' : 'dodge');
  stamina.recoveryTimer = stamina.recoveryDelay;
  stamina.sprinting = false;
  if (stamina.current <= 0) stamina.exhausted = true;
}

function normalizeDirection(x, y) {
  const nx = Number(x);
  const ny = Number(y);
  const length = Math.hypot(nx, ny);
  if (!Number.isFinite(length) || length <= 0.001) return null;
  return { x: nx / length, y: ny / length };
}

function deterministicSide(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash & 1) === 0 ? 1 : -1;
}
