import { getTerrainField } from '../world/fields.js';
import { isInBounds } from '../world/mapModel.js';
import { ENTITY_TYPES } from './contracts.js';
import { CONSTRUCTION_STATES } from './structureRegistry.js';
import { getStructureCollisionBody } from './structureTopology.js';
import { createCorpseFromDeathEvent, normaliseCorpses } from './corpseSystem.js';

export const COMBAT_MODEL = Object.freeze({
  weaponId: 'arrow',
  maxActiveProjectiles: 320,
  projectilePoolSize: 384,
  maxDeathEvents: 48,
  maxImpactEvents: 96,
  targetBucketSizeTiles: 8,
  projectileBlockerBucketSizeTiles: 6,
  lineOfSightThreshold: 0.08,
  projectileHitRadiusTiles: 0.22,
  maxVisualProjectileSpeedTilesPerTick: 1.45,
  projectileImpactDisplayTicks: 1,
  stoneMaxThrowRangeTiles: 8,
  stoneSpeedTilesPerTick: 1.18,
  projectileBlockerHitPaddingTiles: 0.18,
  projectileRangeLeewayTiles: 0.75,
  projectileBaseHitWindowTiles: 0.28,
  projectileAccuracyHitWindowTiles: 0.42,
  underFireMemoryTicks: 8,
  baseAimTicks: 1,
  longRangeAimThreshold: 0.72,
  maxAimTicks: 4,
  underFireAimPenaltyTicks: 1,
  underFireAccuracyPenalty: 0.12,
  suppressedIncomingFireThreshold: 3,
  meleeRangeTiles: 1.22,
  meleeEngageLeewayTiles: 0.18,
  meleeBaseDamage: 7,
  meleeRateOfFireTicks: 2,
  meleeArmourPierce: 0.18
});

export function normaliseHealthComponent(health = {}, defaults = {}) {
  const maxHealth = positiveNumber(health.maxHealth, positiveNumber(defaults.maxHealth, 1));
  const currentHealth = boundedNumber(health.health, 0, maxHealth, maxHealth);
  const state = currentHealth <= 0 || health.state === 'dead' ? 'dead' : 'alive';
  return {
    maxHealth,
    health: round3(currentHealth),
    armour: clamp01(Number.isFinite(health.armour) ? health.armour : (defaults.armour ?? 0)),
    state,
    destroyedAtTick: Number.isInteger(health.destroyedAtTick) ? Math.max(0, health.destroyedAtTick) : null
  };
}

export function normaliseCombatComponent(combat = {}, defaults = {}) {
  const rateOfFireTicks = Math.max(1, Math.floor(positiveNumber(combat.rateOfFireTicks, defaults.rateOfFireTicks ?? 3)));
  return {
    enabled: combat.enabled !== false && defaults.enabled !== false,
    weaponId: typeof combat.weaponId === 'string' ? combat.weaponId : (defaults.weaponId ?? COMBAT_MODEL.weaponId),
    weaponProfile: typeof combat.weaponProfile === 'string' ? combat.weaponProfile : (defaults.weaponProfile ?? 'bow'),
    attackRange: positiveNumber(combat.attackRange, defaults.attackRange ?? 1),
    baseDamage: positiveNumber(combat.baseDamage, defaults.baseDamage ?? 1),
    meleeRange: positiveNumber(combat.meleeRange, defaults.meleeRange ?? COMBAT_MODEL.meleeRangeTiles),
    meleeDamage: positiveNumber(combat.meleeDamage, defaults.meleeDamage ?? COMBAT_MODEL.meleeBaseDamage),
    meleeRateOfFireTicks: Math.max(1, Math.floor(positiveNumber(combat.meleeRateOfFireTicks, defaults.meleeRateOfFireTicks ?? COMBAT_MODEL.meleeRateOfFireTicks))),
    lastMeleeTick: Number.isInteger(combat.lastMeleeTick) ? combat.lastMeleeTick : -Math.max(1, Math.floor(positiveNumber(combat.meleeRateOfFireTicks, defaults.meleeRateOfFireTicks ?? COMBAT_MODEL.meleeRateOfFireTicks))),
    rateOfFireTicks,
    projectileSpeedTilesPerTick: positiveNumber(combat.projectileSpeedTilesPerTick, defaults.projectileSpeedTilesPerTick ?? 6),
    accuracy: clamp01(Number.isFinite(combat.accuracy) ? combat.accuracy : (defaults.accuracy ?? 0.65)),
    volleySize: Math.max(1, Math.floor(positiveNumber(combat.volleySize, defaults.volleySize ?? 1))),
    lastFiredTick: Number.isInteger(combat.lastFiredTick) ? combat.lastFiredTick : -rateOfFireTicks,
    targetId: typeof combat.targetId === 'string' ? combat.targetId : null,
    canAttack: Boolean(combat.canAttack),
    state: typeof combat.state === 'string' ? combat.state : 'idle',
    lastBlockedReason: typeof combat.lastBlockedReason === 'string' ? combat.lastBlockedReason : null,
    aimStartedTick: Number.isInteger(combat.aimStartedTick) ? Math.max(0, combat.aimStartedTick) : null,
    aimReadyTick: Number.isInteger(combat.aimReadyTick) ? Math.max(0, combat.aimReadyTick) : null,
    aimTargetId: typeof combat.aimTargetId === 'string' ? combat.aimTargetId : null,
    lastVolleyOutcome: typeof combat.lastVolleyOutcome === 'string' ? combat.lastVolleyOutcome : null,
    failedVolleyCount: Number.isInteger(combat.failedVolleyCount) ? Math.max(0, combat.failedVolleyCount) : 0,
    underFireUntilTick: Number.isInteger(combat.underFireUntilTick) ? Math.max(0, combat.underFireUntilTick) : null,
    incomingFireCount: Number.isInteger(combat.incomingFireCount) ? Math.max(0, combat.incomingFireCount) : 0,
    lastUnderFireFromId: typeof combat.lastUnderFireFromId === 'string' ? combat.lastUnderFireFromId : null,
    engagedTargetId: typeof combat.engagedTargetId === 'string' ? combat.engagedTargetId : null,
    lastMeleeOutcome: typeof combat.lastMeleeOutcome === 'string' ? combat.lastMeleeOutcome : null
  };
}

export function normaliseProjectile(projectile = {}) {
  if (!projectile || typeof projectile !== 'object') return null;
  const origin = normalisePosition(projectile.origin, projectile.position);
  const position = normalisePosition(projectile.position, origin);
  const targetPosition = normalisePosition(projectile.targetPosition, position);
  return {
    id: typeof projectile.id === 'string' ? projectile.id : `projectile_${COMBAT_MODEL.weaponId}_${Date.now()}`,
    weaponId: typeof projectile.weaponId === 'string' ? projectile.weaponId : COMBAT_MODEL.weaponId,
    factionId: typeof projectile.factionId === 'string' ? projectile.factionId : 'neutral',
    sourceId: typeof projectile.sourceId === 'string' ? projectile.sourceId : null,
    sourceIntentId: typeof projectile.sourceIntentId === 'string' ? projectile.sourceIntentId : null,
    sourceType: typeof projectile.sourceType === 'string' ? projectile.sourceType : null,
    sourceStructureId: typeof projectile.sourceStructureId === 'string' ? projectile.sourceStructureId : null,
    targetId: typeof projectile.targetId === 'string' ? projectile.targetId : null,
    targetType: typeof projectile.targetType === 'string' ? projectile.targetType : null,
    origin,
    previousPosition: normalisePosition(projectile.previousPosition, position),
    position,
    targetPosition,
    purpose: projectile.purpose === 'distraction' ? 'distraction' : 'combat',
    damage: projectile.purpose === 'distraction' ? 0 : positiveNumber(projectile.damage, 1),
    accuracy: clamp01(Number.isFinite(projectile.accuracy) ? projectile.accuracy : 0.65),
    speedTilesPerTick: normaliseProjectileTravelSpeed(projectile.speedTilesPerTick),
    spawnedAtTick: Number.isInteger(projectile.spawnedAtTick) ? Math.max(0, projectile.spawnedAtTick) : 0,
    ageTicks: Number.isInteger(projectile.ageTicks) ? Math.max(0, projectile.ageTicks) : 0,
    maxAgeTicks: Math.max(1, Math.floor(positiveNumber(projectile.maxAgeTicks, 8))),
    maxTravelDistance: positiveNumber(projectile.maxTravelDistance, tileDistance(origin, targetPosition) + COMBAT_MODEL.projectileRangeLeewayTiles),
    travelledDistance: Math.max(0, Number.isFinite(projectile.travelledDistance) ? projectile.travelledDistance : 0),
    state: ['flying', 'impacting'].includes(projectile.state) ? projectile.state : 'flying',
    impactTicksRemaining: Math.max(0, Math.floor(positiveNumber(projectile.impactTicksRemaining, 0))),
    impactApplied: Boolean(projectile.impactApplied),
    impactOutcome: ['hit', 'miss', 'blocked', 'expired', 'landed'].includes(projectile.impactOutcome) ? projectile.impactOutcome : null,
    impactTargetId: typeof projectile.impactTargetId === 'string' ? projectile.impactTargetId : null,
    impactTargetType: typeof projectile.impactTargetType === 'string' ? projectile.impactTargetType : null
  };
}

export function normaliseProjectiles(projectiles = []) {
  if (!Array.isArray(projectiles)) return [];
  return projectiles
    .map(normaliseProjectile)
    .filter(Boolean)
    .slice(0, COMBAT_MODEL.maxActiveProjectiles);
}

export function throwStoneProjectile(game, source, targetPosition, options = {}) {
  if (!game || !source || !targetPosition || (game.projectiles ?? []).length >= COMBAT_MODEL.maxActiveProjectiles) {
    return null;
  }
  const origin = getEntityPosition(source);
  const rawDistance = tileDistance(origin, targetPosition);
  const throwDistance = Math.min(COMBAT_MODEL.stoneMaxThrowRangeTiles, rawDistance);
  const scale = rawDistance > 0 ? throwDistance / rawDistance : 0;
  const landing = roundPosition({
    x: origin.x + (targetPosition.x - origin.x) * scale,
    y: origin.y + (targetPosition.y - origin.y) * scale
  });
  const projectile = normaliseProjectile({
    id: `projectile_stone_${source.id}_${game.tick ?? 0}_${(game.projectiles ?? []).length + 1}`,
    weaponId: 'stone',
    purpose: 'distraction',
    factionId: source.factionId,
    sourceId: source.id,
    sourceIntentId: typeof options.sourceIntentId === 'string' ? options.sourceIntentId : null,
    sourceType: source.type,
    origin,
    previousPosition: origin,
    position: origin,
    targetPosition: landing,
    damage: 0,
    accuracy: 1,
    speedTilesPerTick: COMBAT_MODEL.stoneSpeedTilesPerTick,
    spawnedAtTick: game.tick ?? 0,
    maxAgeTicks: Math.max(3, Math.ceil(throwDistance / COMBAT_MODEL.stoneSpeedTilesPerTick) + 3),
    maxTravelDistance: round3(throwDistance + 0.12)
  });
  game.projectiles = [...(game.projectiles ?? []), projectile];
  return projectile;
}

export function normaliseDeathEvents(events = []) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((event) => event && typeof event === 'object' && typeof event.entityId === 'string')
    .map((event) => ({
      id: typeof event.id === 'string' ? event.id : `death_${event.entityId}_${event.tick ?? 0}`,
      tick: Number.isInteger(event.tick) ? Math.max(0, event.tick) : 0,
      entityId: event.entityId,
      entityType: typeof event.entityType === 'string' ? event.entityType : 'unknown',
      factionId: typeof event.factionId === 'string' ? event.factionId : 'neutral',
      sourceId: typeof event.sourceId === 'string' ? event.sourceId : null,
      sourceType: typeof event.sourceType === 'string' ? event.sourceType : null,
      cause: typeof event.cause === 'string' ? event.cause : 'combat',
      onDeath: typeof event.onDeath === 'string' ? event.onDeath : 'default',
      deathState: typeof event.deathState === 'string' ? event.deathState : (event.entityType === ENTITY_TYPES.structure ? 'ruined' : 'fallen'),
      position: normalisePosition(event.position, event.tile ?? { x: 0, y: 0 }),
      summary: typeof event.summary === 'string' ? event.summary : null,
      damageApplied: round3(Number(event.damageApplied) || 0)
    }))
    .slice(-COMBAT_MODEL.maxDeathEvents);
}

export function normaliseImpactEvents(events = []) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((event) => event && typeof event === 'object' && typeof event.entityId === 'string')
    .map((event) => ({
      id: typeof event.id === 'string' ? event.id : `impact_${event.entityId}_${event.tick ?? 0}`,
      tick: Number.isInteger(event.tick) ? Math.max(0, event.tick) : 0,
      entityId: event.entityId,
      entityType: typeof event.entityType === 'string' ? event.entityType : 'unknown',
      factionId: typeof event.factionId === 'string' ? event.factionId : 'neutral',
      sourceId: typeof event.sourceId === 'string' ? event.sourceId : null,
      sourceType: typeof event.sourceType === 'string' ? event.sourceType : null,
      cause: typeof event.cause === 'string' ? event.cause : 'combat',
      outcome: event.outcome === 'death' ? 'death' : 'hit',
      position: normalisePosition(event.position, { x: 0, y: 0 }),
      angle: Number.isFinite(Number(event.angle)) ? round3(Number(event.angle)) : null,
      damageApplied: round3(Number(event.damageApplied) || 0)
    }))
    .slice(-COMBAT_MODEL.maxImpactEvents);
}

export function summarizeCombat(game, deps = {}) {
  const projectiles = game?.projectiles ?? [];
  const combatants = collectCombatAttackers(game ?? {}, deps);
  const damageable = collectDamageableTargets(game ?? {}, deps);
  const recentDeaths = normaliseDeathEvents(game?.deathEvents ?? []);
  return {
    activeProjectiles: projectiles.length,
    projectileCap: COMBAT_MODEL.maxActiveProjectiles,
    combatants: combatants.length,
    damageableTargets: damageable.length,
    volleysFired: Number.isInteger(game?.combatStats?.volleysFired) ? game.combatStats.volleysFired : 0,
    projectileHits: Number.isInteger(game?.combatStats?.projectileHits) ? game.combatStats.projectileHits : 0,
    projectileMisses: Number.isInteger(game?.combatStats?.projectileMisses) ? game.combatStats.projectileMisses : 0,
    projectileDamage: round3(Number(game?.combatStats?.projectileDamage) || 0),
    meleeStrikes: Number.isInteger(game?.combatStats?.meleeStrikes) ? game.combatStats.meleeStrikes : 0,
    meleeKills: Number.isInteger(game?.combatStats?.meleeKills) ? game.combatStats.meleeKills : 0,
    meleeDamage: round3(Number(game?.combatStats?.meleeDamage) || 0),
    meleeEngaged: combatants.filter((combatant) => combatant?.combat?.state === 'engaged-melee' || combatant?.combat?.state === 'melee-strike').length,
    aimingCombatants: combatants.filter((combatant) => combatant?.combat?.state === 'aiming').length,
    suppressedCombatants: combatants.filter((combatant) => isCombatantUnderFire(game, combatant)).length,
    failedVolleys: combatants.reduce((total, combatant) => total + Math.max(0, combatant?.combat?.failedVolleyCount ?? 0), 0),
    deaths: recentDeaths.length,
    lastDeath: recentDeaths[recentDeaths.length - 1] ?? null,
    projectilePool: {
      available: game?._runtimeCache?.projectilePool?.length ?? 0,
      reused: Number.isInteger(game?.combatStats?.projectilePool?.reused) ? game.combatStats.projectilePool.reused : 0,
      allocated: Number.isInteger(game?.combatStats?.projectilePool?.allocated) ? game.combatStats.projectilePool.allocated : 0
    }
  };
}

export function advanceCombat(game, map, deps = {}) {
  const previousStats = game.combatStats ?? {};
  const stats = {
    ...summarizeCombat(game, deps),
    volleysFired: Number.isInteger(previousStats.volleysFired) ? previousStats.volleysFired : 0,
    projectileHits: Number.isInteger(previousStats.projectileHits) ? previousStats.projectileHits : 0,
    projectileMisses: Number.isInteger(previousStats.projectileMisses) ? previousStats.projectileMisses : 0,
    projectileDamage: round3(Number(previousStats.projectileDamage) || 0),
    meleeStrikes: Number.isInteger(previousStats.meleeStrikes) ? previousStats.meleeStrikes : 0,
    meleeKills: Number.isInteger(previousStats.meleeKills) ? previousStats.meleeKills : 0,
    meleeDamage: round3(Number(previousStats.meleeDamage) || 0),
    projectilePool: {
      available: game?._runtimeCache?.projectilePool?.length ?? 0,
      reused: Number.isInteger(previousStats.projectilePool?.reused) ? previousStats.projectilePool.reused : 0,
      allocated: Number.isInteger(previousStats.projectilePool?.allocated) ? previousStats.projectilePool.allocated : 0
    }
  };
  game.projectiles = normaliseProjectiles(game.projectiles);
  game.deathEvents = normaliseDeathEvents(game.deathEvents);
  game.impactEvents = normaliseImpactEvents(game.impactEvents);

  const projectileTargets = collectDamageableTargets(game, deps);
  const targetById = buildDamageableTargetById(projectileTargets);
  let blockerIndex = buildProjectileBlockerIndex(game);
  const projectileContext = { targetById, blockerIndex };
  const projectileResult = advanceProjectiles(game, map, stats, deps, projectileContext);
  blockerIndex = projectileContext.blockerIndex ?? blockerIndex;
  if (projectileResult.structuresChanged > 0) {
    blockerIndex = buildProjectileBlockerIndex(game);
  }

  const targets = projectileResult.deaths > 0 || projectileResult.structuresChanged > 0
    ? collectDamageableTargets(game, deps)
    : projectileTargets;
  const targetIndex = buildCombatTargetIndex(targets);
  const lineOfSightCache = new Map();

  for (const attacker of collectCombatAttackers(game, deps)) {
    if (!isDamageableAlive(attacker, deps)) {
      continue;
    }
    const combat = normaliseCombatComponent(attacker.combat, getCombatDefaults(deps, attacker));
    const melee = resolveMeleeEngagement(game, attacker, targetIndex, combat, stats, deps);
    if (melee.handled) {
      attacker.combat = normaliseCombatComponent({
        ...combat,
        ...melee.combatPatch,
        canAttack: false
      }, getCombatDefaults(deps, attacker));
      continue;
    }
    const cooldownRemaining = Math.max(0, combat.rateOfFireTicks - ((game.tick ?? 0) - combat.lastFiredTick));
    if (cooldownRemaining > 0) {
      attacker.combat = normaliseCombatComponent({
        ...combat,
        canAttack: false,
        state: 'cooldown',
        lastBlockedReason: `cooldown:${cooldownRemaining}`
      }, getCombatDefaults(deps, attacker));
      continue;
    }

    const firing = getAttackerFiringContext(game, attacker, deps);
    if (!firing) {
      attacker.combat = normaliseCombatComponent({
        ...combat,
        canAttack: false,
        state: 'blocked',
        lastBlockedReason: 'no-firing-point'
      }, getCombatDefaults(deps, attacker));
      continue;
    }

    const target = chooseCombatTarget(game, map, attacker, firing, targetIndex, deps, {
      blockerIndex,
      lineOfSightCache
    });
    if (!target) {
      attacker.combat = normaliseCombatComponent({
        ...combat,
        canAttack: false,
        targetId: null,
        state: 'searching',
        lastBlockedReason: 'no-visible-target'
      }, getCombatDefaults(deps, attacker));
      continue;
    }

    const engagement = resolveCombatEngagement(game, map, attacker, firing, target, combat, deps, {
      blockerIndex,
      lineOfSightCache
    });
    if (!engagement.ready) {
      attacker.combat = normaliseCombatComponent({
        ...combat,
        ...engagement.combatPatch,
        canAttack: false,
        targetId: target.id
      }, getCombatDefaults(deps, attacker));
      continue;
    }

    const spawned = spawnProjectileVolley(game, attacker, firing, target, stats, deps);
    attacker.combat = normaliseCombatComponent({
      ...combat,
      canAttack: spawned > 0,
      targetId: target.id,
      state: spawned > 0 ? 'firing' : 'blocked',
      lastFiredTick: spawned > 0 ? (game.tick ?? 0) : combat.lastFiredTick,
      aimStartedTick: null,
      aimReadyTick: null,
      aimTargetId: null,
      lastVolleyOutcome: spawned > 0 ? 'fired' : 'failed:projectile-cap',
      failedVolleyCount: spawned > 0 ? combat.failedVolleyCount : combat.failedVolleyCount + 1,
      lastBlockedReason: spawned > 0 ? null : 'projectile-cap'
    }, getCombatDefaults(deps, attacker));
    if (spawned > 0) {
      stats.volleysFired += 1;
    }
  }

  game.combatStats = {
    ...summarizeCombat(game, deps),
    volleysFired: stats.volleysFired,
    projectileHits: stats.projectileHits,
    projectileMisses: stats.projectileMisses,
    projectileDamage: round3(stats.projectileDamage),
    meleeStrikes: stats.meleeStrikes,
    meleeKills: stats.meleeKills,
    meleeDamage: round3(stats.meleeDamage),
    projectilePool: {
      available: game?._runtimeCache?.projectilePool?.length ?? 0,
      reused: stats.projectilePool.reused,
      allocated: stats.projectilePool.allocated
    }
  };
  return { needsRecompute: projectileResult.deaths > 0 || projectileResult.structuresChanged > 0 || projectileResult.sounds > 0 };
}

function collectCombatAttackers(game, deps) {
  return [
    ...(game?.leaders ?? []),
    ...(game?.squads ?? [])
  ].filter((entity) => (
    entity?.factionId &&
    entity.factionId !== 'neutral' &&
    isDamageableAlive(entity, deps) &&
    normaliseCombatComponent(entity.combat, getCombatDefaults(deps, entity)).enabled &&
    !isCombatBlockedBySupply(entity, deps)
  ));
}

function isCombatBlockedBySupply(entity, deps) {
  return entity?.type === ENTITY_TYPES.squad && normaliseSquadSupply(deps, entity.supply).food <= 0;
}

function collectDamageableTargets(game, deps) {
  return [
    ...(game?.leaders ?? []),
    ...(game?.squads ?? []),
    ...(game?.structures ?? []).filter((structure) => (
      structure.construction?.state === CONSTRUCTION_STATES.complete &&
      structure.collision?.receivesProjectiles !== false
    ))
  ].filter((entity) => entity?.factionId && entity.factionId !== 'neutral' && isDamageableAlive(entity, deps));
}

function buildDamageableTargetById(targets = []) {
  const targetById = new Map();
  for (const target of targets) {
    if (target?.id) {
      targetById.set(target.id, target);
    }
  }
  return targetById;
}

function buildCombatTargetIndex(targets = []) {
  const buckets = new Map();
  for (const target of targets) {
    const position = getCombatTargetPosition(target);
    const key = combatBucketKey(position);
    const bucket = buckets.get(key) ?? [];
    bucket.push({ target, position });
    buckets.set(key, bucket);
  }
  return { buckets, targets };
}

function chooseCombatTarget(game, map, attacker, firing, targetIndex, deps, context = {}) {
  const range = getEffectiveAttackRange(attacker, firing, deps);
  const origin = firing.position;
  const nearby = queryCombatTargets(targetIndex, origin, range);
  const visibleCandidates = nearby
    .filter(({ target, position }) => target.id !== attacker.id && target.factionId !== attacker.factionId)
    .map(({ target, position }) => ({ target, position, distance: tileDistance(origin, position) }))
    .filter((entry) => entry.distance <= range)
    .filter((entry, index, all) => hasCombatLineOfSight(
      map,
      game,
      attacker.factionId,
      origin,
      entry.position,
      all.length,
      entry.target,
      firing.structure?.id ?? null,
      { ...context, observer: attacker },
      deps
    ));

  return visibleCandidates
    .sort((a, b) => {
      const priorityDelta = getDamageableTargetPriority(b.target) - getDamageableTargetPriority(a.target);
      if (Math.abs(priorityDelta) > 0.001) return priorityDelta;
      return a.distance - b.distance;
    })[0]?.target ?? null;
}

function queryCombatTargets(targetIndex, origin, range) {
  const bucketSize = COMBAT_MODEL.targetBucketSizeTiles;
  const minX = Math.floor((origin.x - range) / bucketSize);
  const maxX = Math.floor((origin.x + range) / bucketSize);
  const minY = Math.floor((origin.y - range) / bucketSize);
  const maxY = Math.floor((origin.y + range) / bucketSize);
  const results = [];
  const seen = new Set();
  for (let by = minY; by <= maxY; by += 1) {
    for (let bx = minX; bx <= maxX; bx += 1) {
      for (const entry of targetIndex.buckets.get(`${bx},${by}`) ?? []) {
        if (seen.has(entry.target.id)) continue;
        seen.add(entry.target.id);
        results.push(entry);
      }
    }
  }
  return results;
}

function combatBucketKey(position) {
  const bucketSize = COMBAT_MODEL.targetBucketSizeTiles;
  return `${Math.floor(position.x / bucketSize)},${Math.floor(position.y / bucketSize)}`;
}

function getAttackerFiringContext(game, attacker, deps) {
  if (attacker.type === ENTITY_TYPES.squad && isSquadOccupied(attacker)) {
    const structure = (game.structures ?? []).find((candidate) => candidate.id === attacker.occupancy.structureId);
    if (!structure || structure.construction?.state !== CONSTRUCTION_STATES.complete || !isDamageableAlive(structure, deps)) {
      return null;
    }
    return {
      position: normalisePosition(structure.position, structure.tile),
      structure,
      rangeModifier: positiveNumber(structure.combat?.rangeModifier, 1),
      accuracyModifier: positiveNumber(structure.combat?.accuracyModifier, 1),
      aimModifier: positiveNumber(structure.combat?.aimModifier, 1),
      occupancyMode: structure.occupancy?.mode ?? null
    };
  }
  return {
    position: getEntityPosition(attacker),
    structure: null,
    rangeModifier: 1,
    accuracyModifier: 1,
    aimModifier: 1,
    occupancyMode: null
  };
}

function getEffectiveAttackRange(attacker, firing, deps) {
  const combat = normaliseCombatComponent(attacker.combat, getCombatDefaults(deps, attacker));
  return combat.attackRange * positiveNumber(firing?.rangeModifier, 1);
}

function hasCombatLineOfSight(map, game, factionId, origin, targetPosition, candidateCount = 0, target = null, sourceStructureId = null, context = {}, deps = {}) {
  const cache = context.lineOfSightCache;
  const cacheKey = cache ? buildLineOfSightCacheKey(factionId, origin, targetPosition, candidateCount, target, sourceStructureId) : null;
  if (cacheKey && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const observer = context.observer ?? { factionId, position: origin, tile: positionToTile(map, origin) };
  if (target && deps.canDetectTarget && !deps.canDetectTarget(observer, target)) {
    if (cacheKey) cache.set(cacheKey, false);
    return false;
  }

  const tile = positionToTile(map, targetPosition);
  const fieldId = factionId === 'enemy' ? 'enemyLoS' : 'playerLoS';
  const fieldValue = game?.fields?.[fieldId]?.values?.[tile.y]?.[tile.x] ?? 0;
  const terrainClear = candidateCount <= 24
    ? traceLineOfSight(map, origin, tile) >= COMBAT_MODEL.lineOfSightThreshold
    : fieldValue >= COMBAT_MODEL.lineOfSightThreshold;
  const clear = terrainClear && !findBlockingProjectileStructure(context.blockerIndex ?? buildProjectileBlockerIndex(game), origin, targetPosition, {
    excludeIds: [target?.id, sourceStructureId].filter(Boolean)
  });
  if (cacheKey) {
    cache.set(cacheKey, clear);
  }
  return clear;
}

function buildLineOfSightCacheKey(factionId, origin, targetPosition, candidateCount, target, sourceStructureId) {
  const terrainMode = candidateCount <= 24 ? 'trace' : 'field';
  return [
    factionId,
    terrainMode,
    round3(origin.x),
    round3(origin.y),
    round3(targetPosition.x),
    round3(targetPosition.y),
    target?.id ?? '',
    sourceStructureId ?? ''
  ].join(':');
}


function resolveMeleeEngagement(game, attacker, targetIndex, combat, stats, deps) {
  if (!canEntityUseMelee(attacker)) {
    return { handled: false };
  }
  const target = chooseMeleeTarget(game, attacker, targetIndex, combat, deps);
  if (!target) {
    return { handled: false };
  }

  const tick = game.tick ?? 0;
  const cooldownRemaining = Math.max(0, combat.meleeRateOfFireTicks - (tick - combat.lastMeleeTick));
  if (cooldownRemaining > 0) {
    return {
      handled: true,
      combatPatch: {
        state: 'engaged-melee',
        targetId: target.id,
        engagedTargetId: target.id,
        lastMeleeOutcome: `recovering:${cooldownRemaining}`,
        lastBlockedReason: `melee-recovering:${cooldownRemaining}`,
        aimStartedTick: null,
        aimReadyTick: null,
        aimTargetId: null
      }
    };
  }

  const hit = applyMeleeDamage(game, attacker, target, combat, stats, deps);
  return {
    handled: true,
    combatPatch: {
      state: 'melee-strike',
      targetId: target.id,
      engagedTargetId: target.id,
      lastMeleeTick: tick,
      lastMeleeOutcome: hit.death ? 'killing-blow' : 'struck',
      lastBlockedReason: null,
      aimStartedTick: null,
      aimReadyTick: null,
      aimTargetId: null
    }
  };
}

function canEntityUseMelee(attacker) {
  if (!attacker || isSquadOccupied(attacker)) return false;
  if (getDamageableEntityType(attacker) === ENTITY_TYPES.structure) return false;
  return attacker.type === ENTITY_TYPES.squad || attacker.type === ENTITY_TYPES.leader;
}

function chooseMeleeTarget(game, attacker, targetIndex, combat, deps) {
  const origin = getCombatTargetPosition(attacker);
  const range = positiveNumber(combat.meleeRange, COMBAT_MODEL.meleeRangeTiles) + COMBAT_MODEL.meleeEngageLeewayTiles;
  let best = null;
  let bestPriority = -Infinity;
  let bestDistance = Infinity;
  for (const target of targetIndex?.targets ?? []) {
    if (!target || target.id === attacker.id || target.factionId === attacker.factionId) continue;
    if (getDamageableEntityType(target) === ENTITY_TYPES.structure || isSquadOccupied(target)) continue;
    if (!isDamageableAlive(target, deps)) continue;
    if (deps.canDetectTarget && !deps.canDetectTarget(attacker, target)) continue;
    const distance = tileDistance(origin, getCombatTargetPosition(target));
    if (distance > range) continue;
    const priority = getDamageableTargetPriority(target);
    if (priority > bestPriority || (priority === bestPriority && distance < bestDistance)) {
      best = target;
      bestPriority = priority;
      bestDistance = distance;
    }
  }
  return best;
}

function applyMeleeDamage(game, attacker, target, combat, stats, deps) {
  const damage = getEffectiveMeleeDamage(attacker, combat, target);
  const result = applyDamageToTarget(game, target, damage, {
    sourceId: attacker.id,
    sourceType: attacker.type,
    sourceName: attacker.name ?? attacker.id,
    cause: 'melee',
    weaponId: combat.weaponProfile ?? 'melee',
    damageApplied: damage,
    origin: getCombatTargetPosition(attacker),
    impactPosition: getCombatTargetPosition(target)
  }, deps);
  stats.meleeStrikes += 1;
  stats.meleeDamage = round3(stats.meleeDamage + result.damageApplied);
  if (result.death) {
    stats.meleeKills += 1;
  }
  markTargetUnderFire(game, target, attacker);
  deps.emitSoundEvent?.(game, {
    kind: 'melee_attack',
    sourceId: attacker.id,
    sourceFactionId: attacker.factionId,
    position: getCombatTargetPosition(target)
  });
  return result;
}

function getEffectiveMeleeDamage(attacker, combat, target) {
  const base = positiveNumber(combat.meleeDamage, COMBAT_MODEL.meleeBaseDamage);
  const activeBodies = attacker.type === ENTITY_TYPES.squad ? getEffectiveVolleySize(attacker, combat, {}) : 1;
  const cohesion = clamp01(Number(attacker?.attributes?.cohesion) || 0.55);
  const contactMass = attacker.type === ENTITY_TYPES.squad ? (0.65 + activeBodies * 0.35) : 1;
  const armour = Math.max(0, getTargetArmour(target) - COMBAT_MODEL.meleeArmourPierce);
  return round3(base * contactMass * (0.82 + cohesion * 0.28) * (1 - armour * 0.42));
}

function resolveCombatEngagement(game, map, attacker, firing, target, combat, deps, context = {}) {
  const tick = game.tick ?? 0;
  const range = getEffectiveAttackRange(attacker, firing, deps);
  const origin = firing.position;
  const targetPosition = getCombatTargetPosition(target);
  const distance = tileDistance(origin, targetPosition);
  if (distance > range + COMBAT_MODEL.projectileRangeLeewayTiles) {
    return {
      ready: false,
      combatPatch: failCombatVolley(combat, 'failed:out-of-range', 'target-left-range')
    };
  }
  if (!hasCombatLineOfSight(
    map,
    game,
    attacker.factionId,
    origin,
    targetPosition,
    1,
    target,
    firing.structure?.id ?? null,
    { ...context, observer: attacker },
    deps
  )) {
    return {
      ready: false,
      combatPatch: failCombatVolley(combat, 'failed:line-of-sight', 'line-of-sight-lost')
    };
  }

  const aimTicks = getAimTicksForShot(game, attacker, firing, target, combat, deps, { range, distance });
  const sameAim = combat.aimTargetId === target.id && Number.isInteger(combat.aimReadyTick);
  const aimStartedTick = sameAim ? combat.aimStartedTick : tick;
  const aimReadyTick = sameAim ? combat.aimReadyTick : tick + aimTicks;
  if (tick < aimReadyTick) {
    return {
      ready: false,
      combatPatch: {
        state: isCombatantUnderFire(game, attacker) ? 'suppressed' : 'aiming',
        aimStartedTick,
        aimReadyTick,
        aimTargetId: target.id,
        lastVolleyOutcome: 'aiming',
        lastBlockedReason: `aiming:${aimReadyTick - tick}`
      }
    };
  }
  return {
    ready: true,
    combatPatch: {
      state: 'ready',
      aimStartedTick,
      aimReadyTick,
      aimTargetId: target.id,
      lastVolleyOutcome: 'attempt:ready',
      lastBlockedReason: null
    }
  };
}

function failCombatVolley(combat, outcome, blockedReason) {
  return {
    state: 'blocked',
    aimStartedTick: null,
    aimReadyTick: null,
    aimTargetId: null,
    lastVolleyOutcome: outcome,
    failedVolleyCount: combat.failedVolleyCount + 1,
    lastBlockedReason: blockedReason
  };
}

function getAimTicksForShot(game, attacker, firing, target, combat, deps, { range, distance } = {}) {
  let ticks = COMBAT_MODEL.baseAimTicks;
  const safeRange = Math.max(0.1, positiveNumber(range, getEffectiveAttackRange(attacker, firing, deps)));
  const safeDistance = positiveNumber(distance, tileDistance(firing.position, getCombatTargetPosition(target)));
  if ((safeDistance / safeRange) >= COMBAT_MODEL.longRangeAimThreshold) {
    ticks += 1;
  }
  if (isCombatantUnderFire(game, attacker)) {
    ticks += COMBAT_MODEL.underFireAimPenaltyTicks;
  }
  const aimModifier = positiveNumber(firing?.aimModifier, 1);
  return clamp(0, COMBAT_MODEL.maxAimTicks, Math.ceil(ticks * aimModifier));
}

function getSuppressionAccuracyModifier(game, attacker) {
  if (!isCombatantUnderFire(game, attacker)) return 1;
  const incomingFireCount = Math.max(1, Math.floor(Number(attacker?.combat?.incomingFireCount) || 1));
  return clamp(0.62, 1, 1 - Math.min(0.32, incomingFireCount * COMBAT_MODEL.underFireAccuracyPenalty));
}

function isCombatantUnderFire(game, combatant) {
  const underFireUntilTick = Number(combatant?.combat?.underFireUntilTick);
  return Number.isFinite(underFireUntilTick) && underFireUntilTick > (game?.tick ?? 0);
}

function spawnProjectileVolley(game, attacker, firing, target, stats, deps) {
  const combat = normaliseCombatComponent(attacker.combat, getCombatDefaults(deps, attacker));
  const count = getEffectiveVolleySize(attacker, combat, deps);
  let spawned = 0;
  for (let index = 0; index < count; index += 1) {
    if ((game.projectiles ?? []).length >= COMBAT_MODEL.maxActiveProjectiles) {
      break;
    }
    const origin = getVolleyProjectileOrigin(attacker, firing.position, index);
    const projectile = acquireProjectile(game, stats);
    const targetPosition = getCombatTargetPosition(target);
    const shotDistance = tileDistance(origin, targetPosition);
    Object.assign(projectile, {
      id: nextProjectileId(game),
      weaponId: combat.weaponId,
      factionId: attacker.factionId,
      sourceId: attacker.id,
      sourceType: attacker.type,
      sourceStructureId: firing.structure?.id ?? null,
      targetId: target.id,
      targetType: getDamageableEntityType(target),
      origin,
      previousPosition: origin,
      position: origin,
      targetPosition,
      damage: combat.baseDamage,
      accuracy: clamp01(combat.accuracy * positiveNumber(firing.accuracyModifier, 1) * getSuppressionAccuracyModifier(game, attacker)),
      speedTilesPerTick: normaliseProjectileTravelSpeed(combat.projectileSpeedTilesPerTick),
      spawnedAtTick: game.tick ?? 0,
      ageTicks: 0,
      maxAgeTicks: Math.max(3, Math.ceil(shotDistance / Math.max(0.1, normaliseProjectileTravelSpeed(combat.projectileSpeedTilesPerTick))) + 4),
      maxTravelDistance: round3(shotDistance + COMBAT_MODEL.projectileRangeLeewayTiles),
      travelledDistance: 0,
      state: 'flying',
      impactTicksRemaining: 0,
      impactApplied: false,
      impactOutcome: null,
      impactTargetId: null,
      impactTargetType: null
    });
    game.projectiles.push(normaliseProjectile(projectile));
    markTargetUnderFire(game, target, attacker);
    spawned += 1;
  }
  return spawned;
}

function advanceProjectiles(game, map, stats, deps, context = {}) {
  const active = [];
  const targetById = context.targetById ?? buildDamageableTargetById(collectDamageableTargets(game, deps));
  let blockerIndex = context.blockerIndex ?? buildProjectileBlockerIndex(game);
  let deaths = 0;
  let structuresChanged = 0;
  let sounds = 0;
  for (const rawProjectile of normaliseProjectiles(game.projectiles)) {
    const projectile = rawProjectile;

    if (projectile.state === 'impacting') {
      projectile.impactTicksRemaining = Math.max(0, projectile.impactTicksRemaining - 1);
      if (projectile.impactTicksRemaining > 0) {
        active.push(projectile);
      } else {
        releaseProjectile(game, projectile);
      }
      continue;
    }

    const isDistraction = projectile.purpose === 'distraction';
    const target = findDamageableTargetById(targetById, projectile.targetId);
    if (!isDistraction && (!target || !isDamageableAlive(target, deps))) {
      releaseProjectile(game, projectile);
      continue;
    }

    const targetPosition = projectile.targetPosition;
    const distance = tileDistance(projectile.position, targetPosition);
    const nextAge = projectile.ageTicks + 1;
    if (nextAge > projectile.maxAgeTicks) {
      releaseProjectile(game, projectile);
      continue;
    }

    const remainingTravel = Math.max(0, projectile.maxTravelDistance - projectile.travelledDistance);
    if (remainingTravel <= 0) {
      projectile.state = 'impacting';
      projectile.impactTicksRemaining = COMBAT_MODEL.projectileImpactDisplayTicks + 1;
      projectile.impactApplied = true;
      projectile.impactOutcome = 'expired';
      active.push(projectile);
      continue;
    }

    const stepDistance = Math.min(projectile.speedTilesPerTick, remainingTravel);
    const travelT = clamp01(stepDistance / Math.max(0.001, distance));
    const nextPosition = roundPosition(distance <= COMBAT_MODEL.projectileHitRadiusTiles
      ? targetPosition
      : {
          x: lerp(projectile.position.x, targetPosition.x, travelT),
          y: lerp(projectile.position.y, targetPosition.y, travelT)
        });
    const blockerHit = findBlockingProjectileStructure(blockerIndex, projectile.position, nextPosition, {
      excludeIds: [projectile.sourceStructureId, target?.id].filter(Boolean)
    });

    const reachesAimPoint = distance <= stepDistance || distance <= COMBAT_MODEL.projectileHitRadiusTiles;
    const impact = blockerHit
      ? { target: blockerHit.structure, position: blockerHit.position, blockedByStructure: true, outcome: 'blocked' }
      : (reachesAimPoint
          ? (isDistraction
              ? { target: null, position: targetPosition, blockedByStructure: false, outcome: 'landed' }
              : resolveProjectileAimPointImpact(target, targetPosition, projectile, deps))
          : null);

    projectile.previousPosition = projectile.position;
    projectile.position = roundPosition(impact?.position ?? nextPosition);
    projectile.targetPosition = targetPosition;
    projectile.travelledDistance = round3(projectile.travelledDistance + tileDistance(projectile.previousPosition, projectile.position));
    projectile.ageTicks = nextAge;

    if (impact) {
      const impactTarget = impact.target;
      const canDamageImpact = !isDistraction && impact.outcome !== 'miss' && (
        !impact.blockedByStructure ||
        impactTarget?.collision?.receivesProjectiles !== false
      );
      if (canDamageImpact && isDamageableAlive(impactTarget, deps)) {
        const hit = applyProjectileDamage(game, impactTarget, projectile, stats, deps);
        deaths += hit.death ? 1 : 0;
        structuresChanged += hit.structureChanged ? 1 : 0;
        if (hit.structureChanged) {
          blockerIndex = buildProjectileBlockerIndex(game);
          context.blockerIndex = blockerIndex;
        }
      }
      projectile.state = 'impacting';
      projectile.impactTicksRemaining = COMBAT_MODEL.projectileImpactDisplayTicks + 1;
      projectile.impactApplied = true;
      projectile.impactOutcome = impact.outcome ?? (impact.blockedByStructure ? 'blocked' : 'hit');
      if (projectile.impactOutcome === 'miss') {
        stats.projectileMisses += 1;
      }
      projectile.impactTargetId = impactTarget?.id ?? null;
      projectile.impactTargetType = getDamageableEntityType(impactTarget) ?? null;
      const soundEvent = deps.emitSoundEvent?.(game, {
        kind: isDistraction ? 'stone_impact' : 'arrow_impact',
        sourceId: projectile.sourceId,
        sourceIntentId: projectile.sourceIntentId,
        sourceFactionId: projectile.factionId,
        position: projectile.position
      });
      sounds += soundEvent ? 1 : 0;
      active.push(projectile);
      continue;
    }

    if (isInBounds(map, Math.round(projectile.position.x), Math.round(projectile.position.y))) {
      active.push(projectile);
    } else {
      releaseProjectile(game, projectile);
    }
  }
  game.projectiles = active.slice(0, COMBAT_MODEL.maxActiveProjectiles);
  return { deaths, structuresChanged, sounds };
}


function resolveProjectileAimPointImpact(target, aimPosition, projectile, deps) {
  const currentTargetPosition = getCombatTargetPosition(target);
  const hitWindow = getProjectileHitWindow(projectile);
  const targetStillInWindow = isDamageableAlive(target, deps) && tileDistance(currentTargetPosition, aimPosition) <= hitWindow;
  return {
    target: targetStillInWindow ? target : null,
    position: aimPosition,
    blockedByStructure: false,
    outcome: targetStillInWindow ? 'hit' : 'miss'
  };
}

function getProjectileHitWindow(projectile) {
  return round3(COMBAT_MODEL.projectileBaseHitWindowTiles + clamp01(projectile.accuracy) * COMBAT_MODEL.projectileAccuracyHitWindowTiles);
}

function markTargetUnderFire(game, target, attacker) {
  if (!target || getDamageableEntityType(target) === ENTITY_TYPES.structure) return;
  const current = normaliseCombatComponent(target.combat, getCombatDefaults({}, target));
  const next = {
    ...current,
    underFireUntilTick: (game.tick ?? 0) + COMBAT_MODEL.underFireMemoryTicks,
    incomingFireCount: current.incomingFireCount + 1,
    lastUnderFireFromId: attacker?.id ?? null
  };
  if (target.type === ENTITY_TYPES.leader) {
    game.leaders = (game.leaders ?? []).map((leader) => leader.id === target.id ? { ...leader, combat: next } : leader);
  } else if (target.type === ENTITY_TYPES.squad) {
    game.squads = (game.squads ?? []).map((squad) => squad.id === target.id ? { ...squad, combat: next } : squad);
  }
  Object.assign(target, { combat: next });
}

function applyProjectileDamage(game, target, projectile, stats, deps) {
  const baseDamage = positiveNumber(projectile.damage, 1);
  const accuracyFactor = 0.78 + clamp01(projectile.accuracy) * 0.22;
  const cover = getTargetCoverRating(game, target);
  const armour = getTargetArmour(target);
  const damage = round3(baseDamage * accuracyFactor * (1 - cover * 0.45) * (1 - armour * 0.68));
  const result = applyDamageToTarget(game, target, damage, {
    sourceId: projectile.sourceId,
    sourceType: projectile.sourceType,
    cause: projectile.weaponId,
    origin: projectile.previousPosition ?? projectile.origin,
    impactPosition: projectile.position
  }, deps);
  stats.projectileHits += 1;
  stats.projectileDamage = round3(stats.projectileDamage + result.damageApplied);
  return result;
}

function applyDamageToTarget(game, target, damage, context = {}, deps = {}) {
  if (!target || damage <= 0 || !isDamageableAlive(target, deps)) {
    return { damageApplied: 0, death: false, structureChanged: false };
  }
  if (getDamageableEntityType(target) === ENTITY_TYPES.structure) {
    const integrity = target.integrity ?? {};
    const health = boundedNumber(integrity.health, 0, positiveNumber(integrity.maxHealth, 1), positiveNumber(integrity.maxHealth, 1));
    const nextHealth = round3(Math.max(0, health - damage));
    target.integrity = {
      ...integrity,
      health: nextHealth,
      breachState: nextHealth <= 0 ? 'destroyed' : getStructureBreachState(nextHealth, integrity.maxHealth)
    };
    if (nextHealth <= 0) {
      recordImpactEvent(game, target, round3(health), { ...context, outcome: 'death' });
      handleEntityDeath(game, target, { ...context, damageApplied: round3(health) }, deps);
      return { damageApplied: round3(health), death: true, structureChanged: true };
    }
    recordImpactEvent(game, target, round3(health - nextHealth), context);
    return { damageApplied: round3(health - nextHealth), death: false, structureChanged: false };
  }

  const health = normaliseHealthComponent(target.health, getHealthDefaults(deps, target));
  const nextHealth = round3(Math.max(0, health.health - damage));
  target.health = normaliseHealthComponent({
    ...health,
    health: nextHealth,
    state: nextHealth <= 0 ? 'dead' : 'alive',
    destroyedAtTick: nextHealth <= 0 ? (game.tick ?? 0) : health.destroyedAtTick
  }, getHealthDefaults(deps, target));
  if (nextHealth <= 0) {
    recordImpactEvent(game, target, round3(health.health), { ...context, outcome: 'death' });
    handleEntityDeath(game, target, { ...context, damageApplied: round3(health.health) }, deps);
    return { damageApplied: round3(health.health), death: true, structureChanged: false };
  }
  recordImpactEvent(game, target, round3(health.health - nextHealth), context);
  return { damageApplied: round3(health.health - nextHealth), death: false, structureChanged: false };
}

function recordImpactEvent(game, target, damageApplied, context = {}) {
  if (!target || damageApplied <= 0) return;
  const origin = normalisePosition(context.origin, target.position ?? target.tile);
  const position = normalisePosition(context.impactPosition, target.position ?? target.tile);
  const angle = Math.atan2(position.y - origin.y, position.x - origin.x);
  const event = {
    id: `impact_${game.tick ?? 0}_${target.id}_${normaliseImpactEvents(game.impactEvents).length}`,
    tick: game.tick ?? 0,
    entityId: target.id,
    entityType: getDamageableEntityType(target) ?? 'unknown',
    factionId: target.factionId ?? 'neutral',
    sourceId: context.sourceId ?? null,
    sourceType: context.sourceType ?? null,
    cause: context.cause ?? 'combat',
    outcome: context.outcome === 'death' ? 'death' : 'hit',
    position,
    angle,
    damageApplied
  };
  game.impactEvents = normaliseImpactEvents([...(game.impactEvents ?? []), event]);
}

function handleEntityDeath(game, entity, context = {}, deps = {}) {
  const entityType = getDamageableEntityType(entity);
  const position = normalisePosition(entity.position, entity.tile ?? { x: 0, y: 0 });
  const deathState = entityType === ENTITY_TYPES.structure ? 'ruined' : 'fallen';
  const onDeath = entityType === ENTITY_TYPES.structure ? 'ruin-structure' : 'leave-corpse-obstacle';
  const event = {
    id: `death_${entity.id}_${game.tick ?? 0}_${normaliseDeathEvents(game.deathEvents).length}`,
    tick: game.tick ?? 0,
    entityId: entity.id,
    entityType,
    factionId: entity.factionId,
    sourceId: context.sourceId ?? null,
    sourceType: context.sourceType ?? null,
    cause: context.cause ?? 'combat',
    onDeath,
    deathState,
    position,
    damageApplied: round3(Number(context.damageApplied) || 0),
    summary: `${entity.name ?? entity.id} ${deathState} by ${context.cause ?? 'combat'}`
  };
  game.deathEvents = normaliseDeathEvents([...(game.deathEvents ?? []), event]);
  const corpse = createCorpseFromDeathEvent(event);
  if (corpse) {
    game.corpses = normaliseCorpses([...(game.corpses ?? []), corpse]);
  }
  if (typeof deps.emitRuntimeEvent === 'function' && deps.RUNTIME_EVENTS?.entityDied) {
    deps.emitRuntimeEvent(game, {
      type: deps.RUNTIME_EVENTS.entityDied,
      factionId: entity.factionId,
      payload: {
        entityId: entity.id,
        entityType,
        sourceId: event.sourceId,
        sourceType: event.sourceType,
        cause: event.cause,
        onDeath: event.onDeath,
        deathState: event.deathState,
        position: event.position,
        corpseId: corpse?.id ?? null
      }
    });
  }

  if (entityType === ENTITY_TYPES.squad) {
    game.structures = (game.structures ?? []).map((structure) => normaliseStructure(deps, {
      ...structure,
      occupancy: {
        ...structure.occupancy,
        occupants: (structure.occupancy?.occupants ?? []).filter((id) => id !== entity.id)
      }
    }));
    game.squads = (game.squads ?? []).filter((squad) => squad.id !== entity.id);
  } else if (entityType === ENTITY_TYPES.leader) {
    game.leaders = (game.leaders ?? []).filter((leader) => leader.id !== entity.id);
  } else if (entityType === ENTITY_TYPES.structure) {
    const occupantIds = entity.occupancy?.occupants ?? [];
    game.structures = (game.structures ?? []).map((structure) => {
      if (structure.id !== entity.id) return structure;
      return normaliseStructure(deps, {
        ...structure,
        construction: { ...structure.construction, state: CONSTRUCTION_STATES.ruined },
        occupancy: { ...structure.occupancy, occupants: [] },
        nav: { ...structure.nav, blocksFlowField: false },
        collision: { ...structure.collision, blocksMovement: false, blocksProjectiles: false, solid: false },
        integrity: { ...structure.integrity, health: 0, breachState: 'destroyed' }
      });
    });
    game.squads = (game.squads ?? []).map((squad) => occupantIds.includes(squad.id)
      ? {
        ...normaliseSquad(deps, squad),
        occupancy: createFieldSquadOccupancy(deps),
        position: normalisePosition(entity.position, entity.tile),
        tile: positionToTileFromPosition(deps, entity.position ?? entity.tile),
        movement: normaliseLeaderMovement(deps, { status: 'idle', target: entity.position ?? entity.tile }, entity.position ?? entity.tile),
        movementOrder: null,
        movementPath: null
      }
      : squad);
  }

  if (game.selectedEntityId === entity.id) {
    game.selectedEntityId = game.leaders.find((leader) => leader.factionId === 'player')?.id
      ?? game.squads.find((squad) => squad.factionId === 'player')?.id
      ?? null;
  }
}

function getEffectiveVolleySize(attacker, combat, deps) {
  if (attacker.type !== ENTITY_TYPES.squad) {
    return 1;
  }
  const memberCount = Math.max(1, attacker.members?.length ?? combat.volleySize ?? 1);
  const health = normaliseHealthComponent(attacker.health, getHealthDefaults(deps, attacker));
  const healthRatio = clamp01(health.health / Math.max(1, health.maxHealth));
  return clamp(1, memberCount, Math.ceil(memberCount * healthRatio));
}

function getVolleyProjectileOrigin(attacker, origin, index) {
  if (attacker.type !== ENTITY_TYPES.squad || isSquadOccupied(attacker)) {
    return roundPosition(origin);
  }
  const offset = attacker.members?.[index % Math.max(1, attacker.members.length)]?.offset ?? { x: 0, y: 0 };
  return roundPosition({
    x: origin.x + offset.x,
    y: origin.y + offset.y
  });
}

function getCombatTargetPosition(target) {
  if (target?.type === ENTITY_TYPES.squad && isSquadOccupied(target)) {
    return normalisePosition(target.position, target.tile);
  }
  return normalisePosition(target?.position, target?.tile ?? { x: 0, y: 0 });
}

function getDamageableEntityType(entity) {
  return entity?.entityType === ENTITY_TYPES.structure ? ENTITY_TYPES.structure : entity?.type;
}

function isDamageableAlive(entity, deps) {
  if (!entity) return false;
  if (getDamageableEntityType(entity) === ENTITY_TYPES.structure) {
    return entity.construction?.state !== CONSTRUCTION_STATES.ruined && (entity.integrity?.health ?? 0) > 0;
  }
  const health = normaliseHealthComponent(entity.health, getHealthDefaults(deps, entity));
  return health.state !== 'dead' && health.health > 0;
}

function findDamageableTargetById(targetById, id) {
  if (!id) return null;
  return targetById?.get(id) ?? null;
}

function getDamageableTargetPriority(target) {
  const type = getDamageableEntityType(target);
  if (type === ENTITY_TYPES.leader) return 3;
  if (type === ENTITY_TYPES.squad) return 2;
  if (type === ENTITY_TYPES.structure) return 1;
  return 0;
}

function getTargetCoverRating(game, target) {
  if (target?.type === ENTITY_TYPES.squad && isSquadOccupied(target)) {
    const structure = (game.structures ?? []).find((candidate) => candidate.id === target.occupancy.structureId);
    return clamp01(structure?.combat?.coverRating ?? 0);
  }
  return 0;
}

function getTargetArmour(target) {
  if (getDamageableEntityType(target) === ENTITY_TYPES.structure) {
    return clamp01(target.integrity?.armour ?? 0);
  }
  return clamp01(target.health?.armour ?? 0);
}

function getStructureBreachState(health, maxHealth) {
  const ratio = clamp01(health / Math.max(1, maxHealth));
  if (ratio <= 0) return 'destroyed';
  if (ratio < 0.35) return 'breached';
  if (ratio < 0.68) return 'damaged';
  return 'intact';
}

function acquireProjectile(game, stats) {
  game._runtimeCache = game._runtimeCache ?? {};
  const pool = game._runtimeCache.projectilePool ?? [];
  game._runtimeCache.projectilePool = pool;
  const projectile = pool.pop() ?? {};
  if (projectile.id) {
    stats.projectilePool.reused += 1;
  } else {
    stats.projectilePool.allocated += 1;
  }
  return projectile;
}

function releaseProjectile(game, projectile) {
  game._runtimeCache = game._runtimeCache ?? {};
  const pool = game._runtimeCache.projectilePool ?? [];
  if (pool.length < COMBAT_MODEL.projectilePoolSize) {
    pool.push(projectile);
  }
  game._runtimeCache.projectilePool = pool;
}

function nextProjectileId(game) {
  game._runtimeCache = game._runtimeCache ?? {};
  const next = Number.isInteger(game._runtimeCache.nextProjectileId) ? game._runtimeCache.nextProjectileId + 1 : 1;
  game._runtimeCache.nextProjectileId = next;
  return `arrow_${game.tick ?? 0}_${next}`;
}


function buildProjectileBlockerIndex(game) {
  const bucketSize = COMBAT_MODEL.projectileBlockerBucketSizeTiles;
  const buckets = new Map();
  const entries = [];
  for (const structure of game?.structures ?? []) {
    if (!structure || structure.construction?.state !== CONSTRUCTION_STATES.complete) continue;
    if (!structure.collision?.blocksProjectiles) continue;
    const body = getStructureCollisionBody(structure);
    if (!body || !body.blocksProjectiles) continue;
    const entry = {
      structure,
      body,
      bounds: projectileBodyBounds(body, COMBAT_MODEL.projectileBlockerHitPaddingTiles)
    };
    entries.push(entry);
    forEachProjectileBucket(entry.bounds, bucketSize, (key) => {
      const bucket = buckets.get(key) ?? [];
      bucket.push(entry);
      buckets.set(key, bucket);
    });
  }
  return { bucketSize, buckets, entries };
}

function queryProjectileBlockers(blockerIndex, from, to) {
  if (!blockerIndex?.buckets) {
    return [];
  }
  const bounds = projectileSegmentBounds(from, to, COMBAT_MODEL.projectileBlockerHitPaddingTiles);
  const seen = new Set();
  const candidates = [];
  forEachProjectileBucket(bounds, blockerIndex.bucketSize, (key) => {
    for (const entry of blockerIndex.buckets.get(key) ?? []) {
      if (!entry?.structure?.id || seen.has(entry.structure.id)) continue;
      seen.add(entry.structure.id);
      candidates.push(entry);
    }
  });
  return candidates;
}

function forEachProjectileBucket(bounds, bucketSize, visit) {
  const safeSize = Math.max(1, bucketSize);
  const minX = Math.floor(bounds.minX / safeSize);
  const maxX = Math.floor(bounds.maxX / safeSize);
  const minY = Math.floor(bounds.minY / safeSize);
  const maxY = Math.floor(bounds.maxY / safeSize);
  for (let by = minY; by <= maxY; by += 1) {
    for (let bx = minX; bx <= maxX; bx += 1) {
      visit(`${bx},${by}`);
    }
  }
}

function projectileBodyBounds(body, padding = 0) {
  const radius = body.shape === 'circle'
    ? Math.max(body.radius, body.width / 2, body.height / 2) + padding
    : Math.hypot(body.width / 2, body.height / 2) + padding;
  return {
    minX: body.position.x - radius,
    maxX: body.position.x + radius,
    minY: body.position.y - radius,
    maxY: body.position.y + radius
  };
}

function projectileSegmentBounds(from, to, padding = 0) {
  return {
    minX: Math.min(from.x, to.x) - padding,
    maxX: Math.max(from.x, to.x) + padding,
    minY: Math.min(from.y, to.y) - padding,
    maxY: Math.max(from.y, to.y) + padding
  };
}

function findBlockingProjectileStructure(blockerIndex, from, to, { excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds.filter(Boolean));
  let best = null;
  const index = blockerIndex?.buckets ? blockerIndex : buildProjectileBlockerIndex(blockerIndex);
  for (const { structure, body } of queryProjectileBlockers(index, from, to)) {
    if (!structure || excluded.has(structure.id)) continue;
    if (structure.construction?.state !== CONSTRUCTION_STATES.complete) continue;
    if (!structure.collision?.blocksProjectiles) continue;
    if (!body || !body.blocksProjectiles) continue;
    const hit = segmentBodyHit(from, to, body, COMBAT_MODEL.projectileBlockerHitPaddingTiles);
    if (!hit) continue;
    if (!best || hit.t < best.t) {
      best = { structure, body, t: hit.t, position: hit.position };
    }
  }
  return best;
}

function segmentBodyHit(from, to, body, padding = 0) {
  if (body.shape === 'circle') {
    return segmentCircleHit(from, to, body.position, Math.max(0, body.radius + padding));
  }
  return segmentOrientedRectHit(
    from,
    to,
    body.position,
    Math.max(0, body.width / 2 + padding),
    Math.max(0, body.height / 2 + padding),
    body.orientation?.angleRadians ?? 0
  );
}

function segmentCircleHit(from, to, centre, radius) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.000001) {
    return tileDistance(from, centre) <= radius ? { t: 0, position: roundPosition(from) } : null;
  }
  const fx = from.x - centre.x;
  const fy = from.y - centre.y;
  const a = lengthSq;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const t = [t1, t2].find((candidate) => candidate >= 0 && candidate <= 1);
  return Number.isFinite(t) ? { t, position: roundPosition({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) }) } : null;
}

function segmentOrientedRectHit(from, to, centre, halfWidth, halfHeight, angleRadians = 0) {
  const localFrom = toRectLocal(from, centre, angleRadians);
  const localTo = toRectLocal(to, centre, angleRadians);
  const hit = segmentAabbHit(localFrom, localTo, -halfWidth, -halfHeight, halfWidth, halfHeight);
  if (!hit) return null;
  return {
    t: hit.t,
    position: roundPosition({ x: lerp(from.x, to.x, hit.t), y: lerp(from.y, to.y, hit.t) })
  };
}

function toRectLocal(point, centre, angleRadians) {
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  const cos = Math.cos(-angleRadians);
  const sin = Math.sin(-angleRadians);
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

function segmentAabbHit(from, to, minX, minY, maxX, maxY) {
  let tMin = 0;
  let tMax = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const axes = [
    { p: -dx, q: from.x - minX },
    { p: dx, q: maxX - from.x },
    { p: -dy, q: from.y - minY },
    { p: dy, q: maxY - from.y }
  ];
  for (const { p, q } of axes) {
    if (Math.abs(p) < 0.000001) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > tMax) return null;
      if (r > tMin) tMin = r;
    } else {
      if (r < tMin) return null;
      if (r < tMax) tMax = r;
    }
  }
  return { t: clamp01(tMin) };
}

function normaliseProjectileTravelSpeed(speed) {
  return Math.min(
    COMBAT_MODEL.maxVisualProjectileSpeedTilesPerTick,
    positiveNumber(speed, COMBAT_MODEL.maxVisualProjectileSpeedTilesPerTick)
  );
}

function traceLineOfSight(map, origin, target) {
  const distance = tileDistance(origin, target);
  const steps = Math.max(1, Math.ceil(distance * 2));
  let clarity = 1;
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const sample = {
      x: Math.round(lerp(origin.x, target.x, t)),
      y: Math.round(lerp(origin.y, target.y, t))
    };
    if (!isInBounds(map, sample.x, sample.y)) {
      return 0;
    }
    const field = getTerrainField(map, sample.x, sample.y);
    const block = field.water >= 0.95
      ? 0.06
      : clamp01(field.cover * 0.16 + field.height * 0.18 + (field.passability < 0.12 ? 0.35 : 0));
    clarity *= (1 - block);
    if (clarity < 0.08) {
      return 0;
    }
  }
  return clamp01(clarity);
}

function getCombatDefaults(deps, entity) {
  if (typeof deps.getCombatDefaultsForEntity === 'function') {
    return deps.getCombatDefaultsForEntity(entity);
  }
  return { enabled: true, weaponId: COMBAT_MODEL.weaponId };
}

function getHealthDefaults(deps, entity) {
  if (typeof deps.getHealthDefaultsForEntity === 'function') {
    return deps.getHealthDefaultsForEntity(entity);
  }
  return { maxHealth: 1, armour: 0 };
}

function normaliseSquadSupply(deps, supply) {
  if (typeof deps.normaliseSquadSupply === 'function') {
    return deps.normaliseSquadSupply(supply);
  }
  return { food: 0, foodCapacity: 0, hungryTicks: 0, status: 'unfed' };
}

function normaliseStructure(deps, structure) {
  return typeof deps.normaliseStructure === 'function' ? deps.normaliseStructure(structure) : structure;
}

function normaliseSquad(deps, squad) {
  return typeof deps.normaliseSquad === 'function' ? deps.normaliseSquad(squad) : squad;
}

function createFieldSquadOccupancy(deps) {
  return typeof deps.createFieldSquadOccupancy === 'function'
    ? deps.createFieldSquadOccupancy()
    : { state: 'field', structureId: null, enteredAtTick: null };
}

function normaliseLeaderMovement(deps, movement, position) {
  return typeof deps.normaliseLeaderMovement === 'function'
    ? deps.normaliseLeaderMovement(movement, position)
    : { status: 'idle', target: normalisePosition(movement?.target, position), waypoint: null };
}

function positionToTileFromPosition(deps, position) {
  return typeof deps.positionToTileFromPosition === 'function'
    ? deps.positionToTileFromPosition(position)
    : { x: Math.round(position.x), y: Math.round(position.y) };
}

function isSquadOccupied(squad) {
  return squad?.occupancy?.state === 'occupied';
}

function getEntityPosition(entity) {
  return normalisePosition(entity?.position, entity?.tile ?? { x: 0, y: 0 });
}

function normalisePosition(position, fallbackTile) {
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return roundPosition(position);
  }
  return tileToPosition(fallbackTile);
}

function tileToPosition(tile) {
  return {
    x: Number.isFinite(tile?.x) ? tile.x : 0,
    y: Number.isFinite(tile?.y) ? tile.y : 0
  };
}

function positionToTile(map, position) {
  return {
    x: clamp(0, map.width - 1, Math.round(position.x)),
    y: clamp(0, map.height - 1, Math.round(position.y))
  };
}

function roundPosition(position) {
  return {
    x: round3(position.x),
    y: round3(position.y)
  };
}

function tileDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function boundedNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(min, max, numeric) : fallback;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
