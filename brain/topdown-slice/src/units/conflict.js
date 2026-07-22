import { TILE_TYPES, getTileType } from '../world/tilemap.js';

export const CONFLICT_UNIT_TYPE = 'fighter';
export const CONFLICT_FACTIONS = {
  RED: 'red',
  BLUE: 'blue'
};
export const CONFLICT_MAX_HEALTH = 6;
export const CONFLICT_ATTACK_DAMAGE = 1;
export const CONFLICT_ATTACK_RANGE = 1;
export const CONFLICT_ATTACK_COOLDOWN_FRAMES = 10;
export const CONFLICT_HISTORY_LIMIT = 24;
export const CONFLICT_ELIMINATION_HISTORY_LIMIT = 12;
export const CONFLICT_RULES = Object.freeze({
  health: CONFLICT_MAX_HEALTH,
  damage: CONFLICT_ATTACK_DAMAGE,
  range: CONFLICT_ATTACK_RANGE,
  cooldownFrames: CONFLICT_ATTACK_COOLDOWN_FRAMES
});

export function createConflictUnitState({ faction, label = '' } = {}) {
  const rules = getConflictRules();

  return {
    faction,
    role: 'skirmisher',
    hp: rules.health,
    maxHp: rules.health,
    attackDamage: rules.damage,
    attackRange: rules.range,
    attackCooldownFrames: 0,
    attackCooldownDuration: rules.cooldownFrames,
    label: String(label ?? '').trim() || null,
    lastDamagedByFaction: null,
    lastDamagedByUnitId: null,
    lastEliminationExplanation: null,
    combat: createConflictCombatTracker()
  };
}

export function isConflictUnit(unit) {
  return unit?.type === CONFLICT_UNIT_TYPE;
}

export function isConflictUnitAlive(unit) {
  return isConflictUnit(unit) && Number(unit?.hp ?? 0) > 0;
}

export function getConflictUnits(store, { faction = null, includeDefeated = false } = {}) {
  return (store?.units ?? []).filter((unit) => {
    if (!isConflictUnit(unit)) {
      return false;
    }
    if (faction && unit.faction !== faction) {
      return false;
    }
    return includeDefeated || isConflictUnitAlive(unit);
  });
}

export function getConflictAttackRange(unit) {
  return Math.max(1, Math.round(Number(unit?.attackRange ?? CONFLICT_ATTACK_RANGE)));
}

export function getConflictAttackDamage(unit) {
  return Math.max(1, Math.round(Number(unit?.attackDamage ?? CONFLICT_ATTACK_DAMAGE)));
}

export function getConflictAttackCooldownFrames(unit) {
  return Math.max(1, Math.round(Number(unit?.attackCooldownDuration ?? CONFLICT_ATTACK_COOLDOWN_FRAMES)));
}

export function getConflictRules(unit = null) {
  return {
    health: Math.max(1, Math.round(Number(unit?.maxHp ?? unit?.hp ?? CONFLICT_RULES.health))),
    damage: getConflictAttackDamage(unit),
    range: getConflictAttackRange(unit),
    cooldownFrames: getConflictAttackCooldownFrames(unit)
  };
}

export function tickConflictCooldowns(store) {
  getConflictUnits(store, { includeDefeated: true }).forEach((unit) => {
    unit.attackCooldownFrames = Math.max(0, Number(unit.attackCooldownFrames ?? 0) - 1);
  });
}

export function collectDefeatedConflictUnits(store) {
  return getConflictUnits(store, { includeDefeated: true }).filter((unit) => !isConflictUnitAlive(unit));
}

export function removeConflictUnits(store, unitIds) {
  const ids = new Set(unitIds ?? []);
  if (ids.size === 0) {
    return [];
  }

  const removed = [];
  store.units = (store?.units ?? []).filter((unit) => {
    if (!ids.has(unit.id)) {
      return true;
    }

    removed.push(unit);
    return false;
  });

  return removed;
}

export function getNearestConflictEnemy(state, actor) {
  const enemies = getConflictUnits(state?.store, { includeDefeated: false })
    .filter((candidate) => candidate.faction !== actor.faction);

  if (enemies.length === 0) {
    return null;
  }

  return enemies.reduce((best, candidate) => {
    const candidateDistance = getTileDistance(actor, candidate);
    const bestDistance = getTileDistance(actor, best);
    if (candidateDistance !== bestDistance) {
      return candidateDistance < bestDistance ? candidate : best;
    }
    if (candidate.y !== best.y) {
      return candidate.y < best.y ? candidate : best;
    }
    if (candidate.x !== best.x) {
      return candidate.x < best.x ? candidate : best;
    }
    return candidate.id < best.id ? candidate : best;
  }, enemies[0]);
}

export function buildConflictTaskSpec(state, actor) {
  const target = getNearestConflictEnemy(state, actor);
  if (!target) {
    return null;
  }

  const range = getConflictAttackRange(actor);
  const distance = getTileDistance(actor, target);
  if (distance <= range) {
    return {
      type: 'attackUnit',
      target: { x: target.x, y: target.y },
      payload: {
        targetUnitId: target.id,
        range,
        source: 'conflict-loop'
      }
    };
  }

  return {
    type: 'moveTo',
    target: { x: target.x, y: target.y },
    payload: {
      targetUnitId: target.id,
      range,
      source: 'conflict-loop'
    }
  };
}

export function executeConflictAttack(state, actor, task) {
  const targetUnitId = String(task?.payload?.targetUnitId ?? '').trim();
  const target = getConflictUnits(state?.store, { includeDefeated: false }).find((unit) => unit.id === targetUnitId);
  if (!target) {
    return { ok: false, error: 'target missing' };
  }

  const rules = getConflictRules(actor);
  const frame = Number(state?.emergence?.frame ?? 0);
  const range = Number(task?.payload?.range ?? rules.range);
  if (getTileDistance(actor, target) > range) {
    return { ok: false, error: 'target out of range' };
  }

  if (Number(actor.attackCooldownFrames ?? 0) > 0) {
    return {
      ok: true,
      done: false,
      reason: `weapon cooldown ${actor.attackCooldownFrames}`,
      consumeEnergy: false
    };
  }

  const attackerCombat = ensureConflictCombatTracker(actor);
  const targetCombat = ensureConflictCombatTracker(target);
  const damage = rules.damage;
  const hpBefore = Number(target.hp ?? target.maxHp ?? rules.health);
  const distance = getTileDistance(actor, target);
  target.hp = Math.max(0, hpBefore - damage);
  target.lastDamagedByFaction = actor.faction ?? null;
  target.lastDamagedByUnitId = actor.id;
  actor.attackCooldownFrames = rules.cooldownFrames;

  attackerCombat.attacksResolved += 1;
  attackerCombat.damageDealt += damage;
  attackerCombat.lastAttackFrame = frame;
  targetCombat.damageTaken += damage;
  targetCombat.lastDamageFrame = frame;

  const sourceKey = actor.id;
  targetCombat.hitsTakenBySource[sourceKey] = Number(targetCombat.hitsTakenBySource[sourceKey] ?? 0) + 1;
  targetCombat.damageTakenBySource[sourceKey] = Number(targetCombat.damageTakenBySource[sourceKey] ?? 0) + damage;
  targetCombat.firstDamageFrameBySource[sourceKey] ??= frame;
  targetCombat.lastDamageFrameBySource[sourceKey] = frame;

  const attackRecord = {
    frame,
    attackerId: actor.id,
    attackerFaction: actor.faction ?? null,
    targetId: target.id,
    targetFaction: target.faction ?? null,
    distance,
    hpBefore,
    hpAfter: target.hp,
    rules,
    explanation: buildAttackExplanation({
      actor,
      target,
      distance,
      hpBefore,
      hpAfter: target.hp,
      rules
    })
  };

  pushLimitedHistory(state?.conflict?.recentAttacks, attackRecord, CONFLICT_HISTORY_LIMIT);

  if (target.hp <= 0) {
    attackerCombat.kills += 1;
    target.lastEliminationExplanation = buildEliminationExplanation({
      actor,
      target,
      frame,
      rules,
      hpBefore,
      targetCombat
    });
    pushLimitedHistory(state?.conflict?.recentEliminations, {
      frame,
      attackerId: actor.id,
      attackerFaction: actor.faction ?? null,
      targetId: target.id,
      targetFaction: target.faction ?? null,
      explanation: target.lastEliminationExplanation,
      rules
    }, CONFLICT_ELIMINATION_HISTORY_LIMIT);
  }

  return {
    ok: true,
    done: true,
    eventText: attackRecord.explanation
  };
}

export function summarizeConflict(store) {
  const red = getConflictUnits(store, { faction: CONFLICT_FACTIONS.RED }).length;
  const blue = getConflictUnits(store, { faction: CONFLICT_FACTIONS.BLUE }).length;

  return {
    livingByFaction: {
      red,
      blue
    },
    totalLiving: red + blue,
    outcome: red === 0 && blue === 0
      ? 'draw'
      : red === 0
        ? CONFLICT_FACTIONS.BLUE
        : blue === 0
          ? CONFLICT_FACTIONS.RED
          : null
  };
}

export function isConflictSpawnTileOpen(map, store, x, y) {
  const tileType = getTileType(map, x, y);
  if (tileType !== 'grass' || !TILE_TYPES[tileType]?.walkable) {
    return false;
  }

  if ((store?.buildings ?? []).some((building) => building.x === x && building.y === y)) {
    return false;
  }

  if ((store?.units ?? []).some((unit) => unit.x === x && unit.y === y)) {
    return false;
  }

  if (store?.agent?.x === x && store?.agent?.y === y) {
    return false;
  }

  return true;
}

function ensureConflictCombatTracker(unit) {
  if (!unit.combat || typeof unit.combat !== 'object') {
    unit.combat = createConflictCombatTracker();
  }

  unit.combat.hitsTakenBySource ??= {};
  unit.combat.damageTakenBySource ??= {};
  unit.combat.firstDamageFrameBySource ??= {};
  unit.combat.lastDamageFrameBySource ??= {};

  return unit.combat;
}

function createConflictCombatTracker() {
  return {
    attacksResolved: 0,
    damageDealt: 0,
    damageTaken: 0,
    kills: 0,
    lastAttackFrame: null,
    lastDamageFrame: null,
    hitsTakenBySource: {},
    damageTakenBySource: {},
    firstDamageFrameBySource: {},
    lastDamageFrameBySource: {}
  };
}

function buildAttackExplanation({ actor, target, distance, hpBefore, hpAfter, rules }) {
  return `${actor.id} hit ${target.id} because deterministic combat uses range ${rules.range}, damage ${rules.damage}, cooldown ${rules.cooldownFrames}, health ${rules.health}; distance ${distance} was in range and hp changed ${hpBefore}->${hpAfter}.`;
}

function buildEliminationExplanation({ actor, target, frame, rules, targetCombat }) {
  const sourceKey = actor.id;
  const hits = Number(targetCombat.hitsTakenBySource[sourceKey] ?? 0);
  const damageTaken = Number(targetCombat.damageTakenBySource[sourceKey] ?? 0);
  const firstHitFrame = Number(targetCombat.firstDamageFrameBySource[sourceKey] ?? frame);
  const durationFrames = Math.max(0, frame - firstHitFrame);

  return `${actor.id} eliminated ${target.id} because deterministic combat applies ${rules.damage} damage per landed hit at range ${rules.range} with ${rules.cooldownFrames}-frame cooldown; ${hits} hits dealt ${damageTaken} total damage and reduced health ${target.maxHp}->0 over ${durationFrames} frames.`;
}

function pushLimitedHistory(history, entry, limit) {
  if (!Array.isArray(history)) {
    return;
  }

  history.unshift(entry);
  if (history.length > limit) {
    history.length = limit;
  }
}

function getTileDistance(left, right) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}
