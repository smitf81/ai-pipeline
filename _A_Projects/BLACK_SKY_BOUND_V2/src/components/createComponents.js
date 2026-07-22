import { EnemyPressureState } from '../constants/enemyPressureStates.js';
import { EnemyAttackPhase, EnemyAttackProfileId, getEnemyAttackRange } from '../data/enemyAttackProfiles.js';
import { PlayerLifecycleState, PLAYER_LIFECYCLE_PROFILE } from '../data/playerLifecycle.js';
import { createAbilityProgression, createChargeCounterState } from './abilityComponents.js';

export const Components = Object.freeze({
  kind(type, label) { return { type, label }; },
  transform(x, y, rotation = 0) { return { x, y, rotation }; },
  motion(speed) { return { speed }; },
  stamina(profile) {
    const max = Math.max(0, finiteNumber(profile?.stamina?.max, 0));
    return {
      classification: 'actor_stamina_resource_v0',
      profileId: profile?.id ?? 'unknown_locomotion_profile',
      current: max,
      max,
      regenPerSecond: Math.max(0, finiteNumber(profile?.stamina?.regenPerSecond, 0)),
      recoveryDelay: Math.max(0, finiteNumber(profile?.stamina?.recoveryDelay, 0)),
      recoveryTimer: 0,
      sprintEnabled: profile?.sprint?.enabled === true,
      sprintMultiplier: Math.max(1, finiteNumber(profile?.sprint?.multiplier, 1)),
      sprintDrainPerSecond: Math.max(0, finiteNumber(profile?.sprint?.drainPerSecond, 0)),
      sprintResumeThreshold: Math.max(0, finiteNumber(profile?.sprint?.resumeThreshold, 0)),
      sprinting: false,
      exhausted: false,
      state: 'ready',
      lastSpendReason: null,
      spentTotal: 0,
      regeneratedTotal: 0
    };
  },
  dodgeState(profile, ability = null) {
    return {
      classification: 'shared_collision_safe_dodge_state_v0',
      enabled: profile?.dodge?.enabled === true,
      active: false,
      recovering: false,
      cost: Math.max(0, finiteNumber(ability?.staminaCost, profile?.dodge?.cost ?? 0)),
      distance: Math.max(0, finiteNumber(profile?.dodge?.distance, 0)),
      duration: Math.max(0.01, finiteNumber(profile?.dodge?.duration, 0.01)),
      cooldown: Math.max(0, finiteNumber(profile?.dodge?.cooldown, 0)),
      cooldownRemaining: 0,
      directionX: 0,
      directionY: 0,
      elapsed: 0,
      phase: 0,
      visualRecoveryDuration: Math.max(0, finiteNumber(profile?.dodge?.visualRecoveryDuration, 0)),
      visualRecoveryStartPhase: Math.max(0, Math.min(1, finiteNumber(profile?.dodge?.visualRecoveryStartPhase, 1))),
      recoveryElapsed: 0,
      recoveryProgress: 0,
      recoveryStartPhase: 1,
      distanceApplied: 0,
      blocked: false,
      aiStyle: profile?.dodge?.aiStyle ?? null,
      aiTriggerRange: Math.max(0, finiteNumber(profile?.dodge?.aiTriggerRange, 0)),
      count: 0,
      lastReason: null,
      lastDeniedReason: null
    };
  },
  chargeCounterState: createChargeCounterState,
  abilityProgression: createAbilityProgression,
  health(hp, profile = null) {
    const maxHp = Math.max(1, finiteNumber(profile?.maxHealth, hp));
    return {
      classification: 'actor_health_pressure_v0',
      hp: maxHp,
      maxHp,
      alive: true,
      regenEnabled: profile?.regenEnabled === true,
      regenDelayMs: Math.max(0, finiteNumber(profile?.regenDelayMs, 0)),
      regenPerSecond: Math.max(0, finiteNumber(profile?.regenPerSecond, 0)),
      regenRampMs: Math.max(0, finiteNumber(profile?.regenRampMs, 0)),
      regenStartMultiplier: clamp01(finiteNumber(profile?.regenStartMultiplier, 1)),
      regenSprintingMultiplier: clamp01(finiteNumber(profile?.regenSprintingMultiplier, 1)),
      regenActionMultiplier: clamp01(finiteNumber(profile?.regenActionMultiplier, 1)),
      hitPulseDurationMs: Math.max(1, finiteNumber(profile?.hitPulseDurationMs, 1)),
      criticalHealthThreshold: Math.max(0, Math.min(1, finiteNumber(profile?.criticalHealthThreshold, 0.34))),
      maxPressure: Math.max(0.0001, finiteNumber(profile?.maxPressure, 1)),
      recoveryDelayRemainingMs: 0,
      safeRecoveryElapsedMs: 0,
      regenRampMultiplier: 0,
      regenActivityMultiplier: 1,
      hitPulseRemainingMs: 0,
      pressure: 0,
      recovering: false,
      regeneratedTotal: 0,
      lastDamageAmount: 0,
      lastDamageType: null,
      nearDeathSignaled: false,
      nearDeathSignalCount: 0
    };
  },
  collider(radius, blocksMovement = true) { return { radius, blocksMovement }; },
  team(id) { return { id }; },
  renderable({ label, colour, stroke, radius, layer = 'actors', materialProfileId = null }) { return { label, colour, stroke, radius, layer, materialProfileId }; },
  playerControlled() { return {}; },
  playerLifecycle() {
    return {
      classification: 'player_lifecycle_respawn_state_v0',
      profileId: PLAYER_LIFECYCLE_PROFILE.id,
      state: PlayerLifecycleState.ALIVE,
      previousState: null,
      stateElapsed: 0,
      deathCount: 0,
      respawnCount: 0,
      controlSuppressed: false,
      lastRespawnSource: null,
      lastRespawnX: null,
      lastRespawnY: null,
      wakeFlicker: []
    };
  },
  playerIntent() {
    return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, sprint: false, dodge: false, dodgeFollowup: false, melee: false, bite: false, lunge: false, smoke: false, smokeAbilityId: null };
  },
  enemyPressureAI(data = {}, spawnX = 0, spawnY = 0) {
    const aggroRange = finiteNumber(data.aggroRange, 14);
    const roamRadius = finiteNumber(data.roamRadius, 5);
    const anchorX = finiteNumber(data.anchorX, spawnX);
    const anchorY = finiteNumber(data.anchorY, spawnY);
    const attackProfileIds = Array.isArray(data.attackProfileIds) && data.attackProfileIds.length > 0
      ? [...data.attackProfileIds]
      : [EnemyAttackProfileId.LEGACY_CONTACT];
    return {
      classification: 'enemy_pressure_ai_state_v3_smoke_search',
      state: EnemyPressureState.ROAM,
      targetId: null,
      anchorX,
      anchorY,
      roamRadius,
      aggroRange,
      attackRange: getEnemyAttackRange(attackProfileIds, finiteNumber(data.attackRange, 0.82)),
      attackCooldown: finiteNumber(data.attackCooldown, 0.95),
      damage: finiteNumber(data.damage, 1),
      attackProfileIds,
      nextAttackProfileIndex: 0,
      activeAttackProfileId: null,
      attackPhase: EnemyAttackPhase.IDLE,
      attackTimer: 0,
      attackDamageApplied: false,
      cooldownTimer: 0,
      pendingAttackCooldown: null,
      pendingAttackTargetId: null,
      lastAttackAt: null,
      lastAttackProfileId: null,
      lastAttackHitIds: [],
      smokeSearchTimer: 0,
      smokeReacquireTimer: 0,
      smokeSearchCenterX: null,
      smokeSearchCenterY: null,
      smokeSearchTargetX: null,
      smokeSearchTargetY: null,
      smokeSearchWaypointTimer: 0,
      smokeSearchDecisionIndex: 0,
      smokeBreakCount: 0,
      lastSmokeBreakAt: null,
      lastSmokeBreakReason: null,
      lastSmokeSourceKind: null,
      engagementTargetX: null,
      engagementTargetY: null,
      engagementSlotAngle: null,
      engagementDistance: null,
      previousPositionX: spawnX,
      previousPositionY: spawnY,
      attemptedTargetX: null,
      attemptedTargetY: null,
      previousTargetDistance: null,
      timeSinceMeaningfulProgress: 0,
      failedMoveCount: 0,
      currentUnstickDirectionX: 0,
      currentUnstickDirectionY: 0,
      currentUnstickMode: null,
      unstickCooldown: 0,
      repathPauseTimer: 0,
      retreatTimer: 0,
      retreatTargetX: null,
      retreatTargetY: null,
      stuckRecoveryCount: 0,
      stuckRetreatCount: 0,
      lastProgressDelta: 0,
      lastSteeringAngleDegrees: 0,
      usedObstacleSteering: false,
      usedStuckRecovery: false,
      movementBlocked: false,
      steeringSuccessCount: 0,
      blockedMoveCount: 0,
      guardEnabled: data.guard?.enabled === true, guardHoldDistance: Math.max(0, finiteNumber(data.guard?.holdDistance, 0)),
      guardHoldSeconds: Math.max(0, finiteNumber(data.guard?.holdSeconds, 0)), guardCooldownSeconds: Math.max(0, finiteNumber(data.guard?.cooldownSeconds, 0)),
      guardProtectedArcRadians: Math.max(0, finiteNumber(data.guard?.protectedArcRadians, 0)), guardDamageMultiplier: Math.max(0, Math.min(1, finiteNumber(data.guard?.damageMultiplier, 1))),
      guardRecoverySeconds: Math.max(0, finiteNumber(data.guard?.recoverySeconds, 0)), guardHoldTimer: 0,
      guardCooldownTimer: 0, guardRecoveryTimer: 0,
      guardHoldCount: 0, guardBlockedCount: 0,
      guardLastAttackerId: null, guardLastDamageBefore: null, guardLastDamageAfter: null,
      guardLastReason: null,
      leashRange: finiteNumber(data.leashRange, Math.max(aggroRange * 1.5, roamRadius * 2)),
      roamTargetX: anchorX,
      roamTargetY: anchorY,
      roamTargetCooldown: 0,
      roamDecisionIndex: 0,
      decisionCooldown: 0,
      decisionInterval: finiteNumber(data.decisionInterval, 0.7),
      elapsed: 0,
      lastStateChangeAt: 0
    };
  },
  deathState(data = {}) {
    return {
      classification: 'one_shot_entity_death_lifecycle_v0',
      handled: true,
      sourceEntityId: data.sourceEntityId ?? null,
      damageType: data.damageType ?? 'unknown',
      aftermathEntityId: data.aftermathEntityId ?? null,
      handledAt: finiteNumber(data.handledAt, 0)
    };
  },
  corpse(data = {}) {
    return {
      classification: 'bounded_corpse_aftermath_v0',
      sourceEntityId: data.sourceEntityId ?? null,
      sourceKind: data.sourceKind ?? 'unknown',
      profileId: data.profileId ?? 'unknown_corpse',
      createdOrder: finiteNumber(data.createdOrder, 0),
      bodyLength: finiteNumber(data.bodyLength, 1),
      bodyWidth: finiteNumber(data.bodyWidth, 0.35),
      bodyColour: data.bodyColour ?? '#554b45',
      detailColour: data.detailColour ?? '#241d1c',
      bloodColour: data.bloodColour ?? 'rgba(82,8,18,0.72)',
      bloodRimColour: data.bloodRimColour ?? 'rgba(26,3,9,0.58)',
      bloodRadius: finiteNumber(data.bloodRadius, 0.42),
      bloodOffsetX: finiteNumber(data.bloodOffsetX, 0),
      bloodOffsetY: finiteNumber(data.bloodOffsetY, 0),
      slowdownRadius: finiteNumber(data.slowdownRadius, 0.7),
      slowdownMultiplier: finiteNumber(data.slowdownMultiplier, 0.84)
    };
  },
  attackSet(data) { return { ...data }; },
  cooldowns(seed = {}) { return { ...seed }; },
  statusEffects(seed = {}) {
    return {
      panicTimer: 0,
      movementSlowTimer: 0,
      movementSlowMultiplier: 1,
      movementSlowSource: null,
      ...seed
    };
  },
  impactResponse(seed = {}) {
    return {
      mass: 1,
      impactResistance: 0,
      staggerResistance: 0,
      knockbackVelocityX: 0,
      knockbackVelocityY: 0,
      staggerTimer: 0,
      reactionDuration: 0,
      lastImpact: null,
      ...seed
    };
  },
  smokeEmitter(data) { return { ...data }; },
  lightEmitter(data) {
    const intensity = data?.intensity ?? 1;
    const radius = data?.radius ?? 0;
    const revealRadius = data?.revealRadius ?? radius;
    const revealStrength = data?.revealStrength ?? intensity;
    const glowRadius = data?.glowRadius ?? radius;
    const glowStrength = data?.glowStrength ?? intensity;
    const coreRadius = data?.coreRadius ?? (data?.visual?.coreRadius ?? Math.max(0.08, glowRadius * 0.15));
    const coreStrength = data?.coreStrength ?? intensity;
    return {
      enabled: true,
      intensity,
      radius,
      revealRadius,
      revealStrength,
      glowRadius,
      glowStrength,
      coreRadius,
      coreStrength,
      baseIntensity: intensity,
      baseRadius: radius,
      baseRevealRadius: revealRadius,
      baseRevealStrength: revealStrength,
      baseGlowRadius: glowRadius,
      baseGlowStrength: glowStrength,
      baseCoreRadius: coreRadius,
      baseCoreStrength: coreStrength,
      emissionScale: 1,
      radiusScale: 1,
      lifecycleState: 'carried',
      defeatedElapsed: null,
      ...data
    };
  },
  napalmDripEmitter(data) {
    return {
      enabled: true,
      recipeId: data?.id,
      cooldown: 0,
      idleCooldown: 0,
      lastSocketX: null,
      lastSocketY: null,
      ...data
    };
  },
  motionState() {
    return {
      locomotionId: 'idle',
      previousLocomotionId: 'idle',
      speed: 0,
      movement01: 0,
      velocityX: 0,
      velocityY: 0,
      facing: 0,
      phase: 0,
      phaseBucket: 0
    };
  },
  actionState() {
    return {
      active: false,
      recovering: false,
      actionId: null,
      previousActionId: null,
      sourceAbilityId: null,
      elapsed: 0,
      duration: 0,
      phase: 0,
      phaseLabel: 'none',
      recoveryActionId: null,
      recoveryElapsed: 0,
      recoveryDuration: 0,
      recoveryProgress: 0,
      recoveryStartPhase: 1,
      recoveryPhase: 1,
      side: 1,
      aimX: 0,
      aimY: 0,
      directionX: 1,
      directionY: 0,
      committedFacing: 0,
      movementImpulseApplied: 0,
      movementBlocked: false,
      emittedEvents: [],
      resolvedContacts: []
    };
  },
  comboState() {
    return {
      classification: 'player_action_combo_state',
      sequence: ['left_claw_swipe', 'right_claw_swipe', 'bite_attack'],
      index: 0,
      resetTimer: 0,
      resetTimeout: 0.92,
      lastActionId: null
    };
  },
  limbRig(recipeId) {
    return {
      recipeId,
      rigId: `${recipeId}:grounded_wyvern_limb_rig_v0`,
      contactPolicy: 'wrist_and_hind_foot_anchors_v0'
    };
  },
  proceduralPose() {
    return {
      classification: 'procedural_pose_component',
      solverId: 'wyvern_procedural_pose_v0',
      cachePolicy: 'v0_live_solve_v1_phase_bucket_cache',
      cacheKey: null,
      motionId: 'idle',
      actionId: null,
      phaseBucket: 0,
      actionPhaseBucket: 0,
      bodyOffsets: {},
      wingForelimbs: {},
      hindLegs: {},
      contactAnchors: {},
      sockets: {},
      proportionProfileId: null,
      constraintState: null,
      attackContact: null,
      jawOpen: 0
    };
  },
  creatureRigPose() {
    return {
      classification: 'creature_rig_pose_component',
      solverId: null,
      profileId: null,
      visualScale: 1,
      axial: {},
      head: null,
      body: null,
      wingForelimbs: {},
      hindLegs: {},
      tail: [],
      gaitContacts: {},
      sockets: {},
      visualBounds: null,
      constraintState: null
    };
  },
  wyvernProjection(recipeId, x, y) {
    return {
      recipeId,
      lastX: x,
      lastY: y,
      lastRotation: 0,
      gaitPhase: 0,
      idlePhase: 0,
      movement01: 0,
      bodyPoints: [],
      sockets: {}
    };
  },
  humanoidProjection(profileId, x, y) {
    return {
      classification: 'humanoid_projection_component',
      profileId,
      lastX: x,
      lastY: y,
      gaitPhase: 0,
      idlePhase: 0,
      movement01: 0,
      motionState: 'idle',
      facing: 0,
      points: {},
      sockets: {},
      visualBounds: null,
      partCount: 0,
      collisionPolicy: 'single_collider_circle_body_v0',
      shadowPolicy: 'visual_actor_sdf_shadow_projection_v1',
      animationState: {
        locomotionId: 'idle',
        step: 0,
        stride: 0,
        armSwing: 0
      },
      attackState: null,
      reactionState: null,
      motionTrails: [],
      torchState: null
    };
  },
  predatorProjection(profileId, x, y) {
    return {
      classification: 'predator_projection_component',
      profileId,
      lastX: x,
      lastY: y,
      gaitPhase: 0,
      idlePhase: 0,
      movement01: 0,
      facing: 0,
      motionState: 'idle',
      points: {},
      visualBounds: null,
      partCount: 0,
      attackState: null,
      reactionState: null
    };
  },
  smokeCloud(radius, slowMultiplier = 0.35, data = {}) {
    return {
      radius,
      slowMultiplier,
      sourceKind: data.sourceKind ?? 'dragon_smoke_cloud',
      shape: data.shape ?? 'soft_disc',
      driftX: data.driftX ?? 0,
      driftY: data.driftY ?? 0,
      expandRate: data.expandRate ?? 0,
      density: data.density ?? 1,
      opacity: data.opacity ?? 1,
      fadeExponent: data.fadeExponent ?? 1,
      softness: data.softness ?? 0.86,
      plumeId: data.plumeId ?? null,
      segmentIndex: data.segmentIndex ?? null,
      plumeT: data.plumeT ?? null,
      forwardX: data.forwardX ?? null,
      forwardY: data.forwardY ?? null
    };
  },
  lifetime(duration) { return { age: 0, duration }; },
  effect({ kind, radius, hits = 0, recipeId = null, style = {} }) { return { kind, radius, hits, recipeId, style }; },
  scenarioObjective(data) { return { ...data }; }
});

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
