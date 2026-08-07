import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import {
  getWyvernActionPhaseLabel,
  getWyvernActionProfile
} from '../data/creatures/groundedWyvernMotionProfiles.js';

export function startProceduralAction(world, entity, actionId, options = {}) {
  const actionState = getComponent(world, entity, ComponentType.ActionState);
  if (!actionState) return false;
  const profile = getWyvernActionProfile(actionId);
  if (!profile) return false;
  if (!options.force && !canStartProceduralAction(world, entity)) return false;
  const transform = getComponent(world, entity, ComponentType.Transform);
  cancelDodgeRecovery(getComponent(world, entity, ComponentType.DodgeState));
  const direction = resolveActionDirection(transform, options.aimX, options.aimY);
  const committedFacing = Math.atan2(direction.y, direction.x);
  const side = resolveActionSide(transform, options.aimX, options.aimY, options.sideOverride ?? profile.fixedSide);
  if (transform) transform.rotation = committedFacing;
  Object.assign(actionState, {
    active: true,
    recovering: false,
    actionId,
    previousActionId: actionState.actionId ?? actionState.previousActionId,
    sourceAbilityId: options.sourceAbilityId ?? null,
    elapsed: 0,
    duration: profile.duration,
    phase: 0,
    phaseLabel: getWyvernActionPhaseLabel(profile, 0),
    recoveryActionId: null,
    recoveryElapsed: 0,
    recoveryDuration: 0,
    recoveryProgress: 0,
    recoveryStartPhase: 1,
    recoveryPhase: 1,
    side,
    aimX: options.aimX ?? transform?.x ?? 0,
    aimY: options.aimY ?? transform?.y ?? 0,
    directionX: direction.x,
    directionY: direction.y,
    committedFacing,
    movementImpulseApplied: 0,
    movementBlocked: false,
    emittedEvents: [],
    resolvedContacts: []
  });
  return true;
}

export function canStartProceduralAction(world, entity) {
  const actionState = getComponent(world, entity, ComponentType.ActionState);
  const charge = getComponent(world, entity, ComponentType.ChargeCounterState);
  if (charge?.active) return false;
  if (!actionState?.active) return true;
  const currentProfile = getWyvernActionProfile(actionState.actionId);
  return currentProfile?.interruptible === true;
}

export function proceduralActionSystem({ game, dt }) {
  for (const entity of query(game.world, [ComponentType.ActionState])) {
    advanceProceduralAction(getComponent(game.world, entity, ComponentType.ActionState), dt);
  }
}

export function advanceProceduralAction(actionState, dt) {
  if (!actionState) return;
  const delta = Math.max(0, Number(dt) || 0);
  if (!actionState.active) {
    if (actionState.recovering) advanceVisualRecovery(actionState, delta);
    return;
  }
  const profile = getWyvernActionProfile(actionState.actionId);
  if (!profile) {
    clearAction(actionState);
    return;
  }
  const recoveryStartPhase = Math.max(0, Math.min(1, Number(profile.visualRecovery?.startPhase) || 1));
  const activeDuration = profile.duration * recoveryStartPhase;
  const nextElapsed = actionState.elapsed + delta;
  actionState.elapsed = Math.min(activeDuration, nextElapsed);
  actionState.duration = profile.duration;
  actionState.phase = Math.max(0, Math.min(1, actionState.elapsed / profile.duration));
  actionState.phaseLabel = getWyvernActionPhaseLabel(profile, actionState.phase);
  if (nextElapsed >= activeDuration) {
    beginVisualRecovery(actionState, profile);
    advanceVisualRecovery(actionState, Math.max(0, nextElapsed - activeDuration));
  }
}

function clearAction(actionState) {
  actionState.previousActionId = actionState.actionId ?? actionState.previousActionId;
  actionState.active = false;
  actionState.actionId = null;
  actionState.sourceAbilityId = null;
  actionState.elapsed = 0;
  actionState.duration = 0;
  actionState.phase = 0;
  actionState.phaseLabel = 'none';
  actionState.directionX = 1;
  actionState.directionY = 0;
  actionState.committedFacing = 0;
  actionState.movementImpulseApplied = 0;
  actionState.movementBlocked = false;
  actionState.emittedEvents = [];
  actionState.resolvedContacts = [];
  clearVisualRecovery(actionState);
}

export function cancelProceduralRecovery(actionState) {
  if (!actionState?.recovering) return false;
  clearVisualRecovery(actionState);
  return true;
}

function beginVisualRecovery(actionState, profile) {
  const recovery = profile.visualRecovery ?? {};
  const duration = Math.max(0, Number(recovery.duration) || 0);
  const startPhase = Math.max(0, Math.min(1, Number(recovery.startPhase) || 0));
  actionState.previousActionId = actionState.actionId ?? actionState.previousActionId;
  actionState.recovering = duration > 0 && startPhase < 1;
  actionState.recoveryActionId = actionState.actionId;
  actionState.recoveryElapsed = 0;
  actionState.recoveryDuration = duration;
  actionState.recoveryProgress = 0;
  actionState.recoveryStartPhase = startPhase;
  actionState.recoveryPhase = startPhase;
  actionState.active = false;
  actionState.actionId = null;
  actionState.sourceAbilityId = null;
  actionState.elapsed = 0;
  actionState.duration = 0;
  actionState.phase = 0;
  actionState.phaseLabel = 'none';
  actionState.movementImpulseApplied = 0;
  actionState.emittedEvents = [];
  actionState.resolvedContacts = [];
  if (!actionState.recovering) clearVisualRecovery(actionState);
}

function advanceVisualRecovery(actionState, delta) {
  if (!actionState.recovering) return;
  actionState.recoveryElapsed = Math.min(actionState.recoveryDuration, actionState.recoveryElapsed + delta);
  actionState.recoveryProgress = actionState.recoveryDuration > 0
    ? Math.min(1, actionState.recoveryElapsed / actionState.recoveryDuration)
    : 1;
  actionState.recoveryPhase = lerp(actionState.recoveryStartPhase, 1, smooth01(actionState.recoveryProgress));
  if (actionState.recoveryProgress >= 1) clearVisualRecovery(actionState);
}

function clearVisualRecovery(actionState) {
  actionState.recovering = false;
  actionState.recoveryActionId = null;
  actionState.recoveryElapsed = 0;
  actionState.recoveryDuration = 0;
  actionState.recoveryProgress = 0;
  actionState.recoveryStartPhase = 1;
  actionState.recoveryPhase = 1;
}

function cancelDodgeRecovery(dodgeState) {
  if (!dodgeState?.recovering) return;
  dodgeState.recovering = false;
  dodgeState.recoveryElapsed = 0;
  dodgeState.recoveryProgress = 0;
  dodgeState.recoveryStartPhase = 1;
  dodgeState.phase = 1;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function resolveActionSide(transform, aimX, aimY, sideOverride = null) {
  if (sideOverride === -1 || sideOverride === 1) return sideOverride;
  if (!transform || !Number.isFinite(aimX) || !Number.isFinite(aimY)) return 1;
  const rotation = transform.rotation ?? 0;
  const right = { x: -Math.sin(rotation), y: Math.cos(rotation) };
  const dx = aimX - transform.x;
  const dy = aimY - transform.y;
  return dx * right.x + dy * right.y < 0 ? -1 : 1;
}

function resolveActionDirection(transform, aimX, aimY) {
  if (!transform || !Number.isFinite(aimX) || !Number.isFinite(aimY)) {
    return { x: Math.cos(transform?.rotation ?? 0), y: Math.sin(transform?.rotation ?? 0) };
  }
  const dx = aimX - transform.x;
  const dy = aimY - transform.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) return { x: Math.cos(transform.rotation ?? 0), y: Math.sin(transform.rotation ?? 0) };
  return { x: dx / length, y: dy / length };
}
