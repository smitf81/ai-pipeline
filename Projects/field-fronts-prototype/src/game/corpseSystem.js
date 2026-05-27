export const CORPSE_SYSTEM_CONTRACT_ID = 'field-fronts.corpse-obstacle.v0';

export const CORPSE_MODEL = Object.freeze({
  defaultRadius: 0.52,
  leaderRadius: 0.58,
  squadRadius: 0.52,
  blockerMinAgeTicks: 0,
  horrorPressureRadius: 4.8,
  stackBlockThreshold: 4,
  stackClamberThreshold: 2,
  stackCoverPerCorpse: 0.08,
  stackMaxCoverBonus: 0.34,
  stackExposureReductionPerCorpse: 0.05,
  stackMaxExposureReduction: 0.22,
  stackMovementPenaltyPerCorpse: 0.16,
  stackMaxMovementPenalty: 0.72
});

export function createCorpseFromDeathEvent(event = {}, overrides = {}) {
  if (!event || !['leader', 'squad'].includes(event.entityType)) {
    return null;
  }
  const position = normalisePosition(event.position ?? event.tile);
  const tile = normaliseTile(event.tile ?? event.position ?? position);
  return normaliseCorpse({
    id: overrides.id ?? `corpse_${event.entityId}_${event.tick ?? 0}`,
    sourceDeathEventId: event.id ?? null,
    sourceEntityId: event.entityId ?? null,
    entityType: event.entityType,
    factionId: event.factionId ?? 'neutral',
    cause: event.cause ?? 'combat',
    position,
    tile,
    count: overrides.count ?? 1,
    createdAtTick: event.tick ?? 0,
    state: overrides.state ?? 'fresh',
    blocksMovement: overrides.blocksMovement ?? true,
    blocksProjectiles: overrides.blocksProjectiles ?? false,
    radius: overrides.radius ?? (event.entityType === 'leader' ? CORPSE_MODEL.leaderRadius : CORPSE_MODEL.squadRadius),
    horrorValue: overrides.horrorValue ?? (event.entityType === 'leader' ? 0.82 : 0.56),
    disposal: overrides.disposal ?? createCorpseDisposalState()
  });
}

export function createCorpseDisposalState(seed = {}) {
  return {
    state: typeof seed.state === 'string' ? seed.state : 'unclaimed',
    assignedWorkerId: typeof seed.assignedWorkerId === 'string' ? seed.assignedWorkerId : null,
    progress: clamp01(seed.progress ?? 0),
    createdJobId: typeof seed.createdJobId === 'string' ? seed.createdJobId : null
  };
}

export function normaliseCorpse(corpse = {}) {
  const position = normalisePosition(corpse.position ?? corpse.tile);
  return {
    contract: `${CORPSE_SYSTEM_CONTRACT_ID}.corpse`,
    id: typeof corpse.id === 'string' ? corpse.id : `corpse_${Math.round(position.x)}_${Math.round(position.y)}`,
    sourceDeathEventId: typeof corpse.sourceDeathEventId === 'string' ? corpse.sourceDeathEventId : null,
    sourceEntityId: typeof corpse.sourceEntityId === 'string' ? corpse.sourceEntityId : null,
    entityType: ['leader', 'squad'].includes(corpse.entityType) ? corpse.entityType : 'squad',
    factionId: typeof corpse.factionId === 'string' ? corpse.factionId : 'neutral',
    cause: typeof corpse.cause === 'string' ? corpse.cause : 'combat',
    position,
    tile: normaliseTile(corpse.tile ?? position),
    count: Math.max(1, Math.floor(Number(corpse.count) || 1)),
    radius: positiveNumber(corpse.radius, CORPSE_MODEL.defaultRadius),
    blocksMovement: corpse.blocksMovement !== false,
    blocksProjectiles: Boolean(corpse.blocksProjectiles),
    horrorValue: clamp01(corpse.horrorValue ?? 0.5),
    horrorValueTotal: nonNegativeNumber(corpse.horrorValueTotal, clamp01(corpse.horrorValue ?? 0.5) * Math.max(1, Math.floor(Number(corpse.count) || 1))),
    createdAtTick: Math.max(0, Math.floor(Number(corpse.createdAtTick) || 0)),
    state: ['fresh', 'decaying', 'disposed'].includes(corpse.state) ? corpse.state : 'fresh',
    disposal: createCorpseDisposalState(corpse.disposal)
  };
}

export function normaliseCorpses(corpses = []) {
  if (!Array.isArray(corpses)) return [];
  const seen = new Set();
  const sites = new Map();
  corpses
    .map(normaliseCorpse)
    .filter((corpse) => {
      if (!corpse.id || seen.has(corpse.id) || corpse.state === 'disposed') return false;
      seen.add(corpse.id);
      return true;
    })
    .forEach((corpse) => {
      const key = corpseStackTileKey(corpse.tile);
      const existing = sites.get(key);
      if (!existing) {
        sites.set(key, corpse);
        return;
      }
      sites.set(key, {
        ...existing,
        count: existing.count + corpse.count,
        horrorValueTotal: round3(existing.horrorValueTotal + corpse.horrorValueTotal),
        horrorValue: Math.max(existing.horrorValue, corpse.horrorValue),
        createdAtTick: Math.min(existing.createdAtTick, corpse.createdAtTick),
        state: existing.state === 'fresh' || corpse.state === 'fresh' ? 'fresh' : 'decaying',
        blocksMovement: existing.blocksMovement || corpse.blocksMovement,
        blocksProjectiles: existing.blocksProjectiles || corpse.blocksProjectiles
      });
    });
  return [...sites.values()];
}

export function collectCorpseStacks(game = {}) {
  const stacks = new Map();
  normaliseCorpses(game.corpses ?? [])
    .filter((corpse) => corpse.blocksMovement && corpse.state !== 'disposed')
    .forEach((corpse) => {
      const key = corpseStackTileKey(corpse.tile);
      const stack = stacks.get(key) ?? {
        id: `corpse_stack_${key.replace(',', '_')}`,
        type: 'corpse_stack',
        tile: corpse.tile,
        position: { x: corpse.tile.x, y: corpse.tile.y },
        count: 0,
        corpses: [],
        horrorValue: 0,
        blocksMovement: false,
        movementPenalty: 0,
        movementCostModifier: 1,
        coverBonus: 0,
        exposureReduction: 0,
        stackState: 'clear'
      };
      stack.count += corpse.count;
      stack.corpses.push(corpse.id);
      stack.horrorValue += corpse.horrorValueTotal;
      stacks.set(key, stack);
    });

  return [...stacks.values()].map(finaliseCorpseStack).sort((a, b) => a.id.localeCompare(b.id));
}

export function getCorpseStackAtTile(game = {}, tile = null) {
  if (!tile) return null;
  return collectCorpseStacks(game).find((stack) => stack.tile.x === Math.round(tile.x) && stack.tile.y === Math.round(tile.y)) ?? null;
}

export function getCorpseMovementCostModifier(game = {}, tile = null) {
  const stack = getCorpseStackAtTile(game, tile);
  return stack ? stack.movementCostModifier : 1;
}

export function getCorpseMovementSpeedMultiplier(game = {}, tile = null) {
  const modifier = getCorpseMovementCostModifier(game, tile);
  return modifier <= 0 ? 0 : clamp(0.18, 1, 1 / modifier);
}

export function collectCorpseBlockers(game = {}) {
  return collectCorpseStacks(game)
    .filter((stack) => stack.blocksMovement)
    .map((stack) => ({
      id: stack.id,
      type: 'corpse_stack',
      entityType: 'corpse_stack',
      factionId: 'neutral',
      position: stack.position,
      tile: stack.tile,
      shape: 'circle',
      radius: Math.max(CORPSE_MODEL.defaultRadius, 0.44 + stack.count * 0.18),
      blocksMovement: true,
      blocksProjectiles: stack.count >= CORPSE_MODEL.stackBlockThreshold + 1,
      horrorValue: stack.horrorValue,
      stackCount: stack.count,
      stackState: stack.stackState,
      movementPenalty: stack.movementPenalty,
      coverBonus: stack.coverBonus,
      exposureReduction: stack.exposureReduction
    }));
}

export function createCorpseBlockerSignature(game = {}) {
  return collectCorpseStacks(game)
    .filter((stack) => stack.count >= CORPSE_MODEL.stackClamberThreshold)
    .map((stack) => [
      stack.id,
      stack.count,
      stack.blocksMovement ? 'block' : 'slow',
      round3(stack.movementPenalty),
      round3(stack.coverBonus),
      round3(stack.exposureReduction)
    ].join(','))
    .sort()
    .join('|');
}

export function isTileBlockedByCorpse(game = {}, tile = null) {
  const stack = getCorpseStackAtTile(game, tile);
  return Boolean(stack?.blocksMovement);
}

export function summarizeCorpses(game = {}) {
  const corpses = normaliseCorpses(game.corpses ?? []);
  const stacks = collectCorpseStacks(game);
  return {
    total: corpses.reduce((sum, corpse) => sum + corpse.count, 0),
    blockers: stacks.filter((stack) => stack.blocksMovement).length,
    fresh: corpses.filter((corpse) => corpse.state === 'fresh').reduce((sum, corpse) => sum + corpse.count, 0),
    decaying: corpses.filter((corpse) => corpse.state === 'decaying').reduce((sum, corpse) => sum + corpse.count, 0),
    disposalPending: corpses.filter((corpse) => corpse.disposal?.state === 'unclaimed').reduce((sum, corpse) => sum + corpse.count, 0),
    horrorPressure: round3(corpses.reduce((sum, corpse) => sum + corpse.horrorValueTotal, 0)),
    stacks: stacks.length,
    clamberStacks: stacks.filter((stack) => stack.stackState === 'clamber').length,
    wallStacks: stacks.filter((stack) => stack.stackState === 'wall').length
  };
}

function finaliseCorpseStack(stack) {
  const count = Math.max(0, Math.floor(Number(stack.count) || 0));
  const movementPenalty = clamp01(Math.min(
    CORPSE_MODEL.stackMaxMovementPenalty,
    Math.max(0, count - 1) * CORPSE_MODEL.stackMovementPenaltyPerCorpse
  ));
  const coverBonus = clamp01(Math.min(CORPSE_MODEL.stackMaxCoverBonus, count * CORPSE_MODEL.stackCoverPerCorpse));
  const exposureReduction = clamp01(Math.min(CORPSE_MODEL.stackMaxExposureReduction, count * CORPSE_MODEL.stackExposureReductionPerCorpse));
  const blocksMovement = count >= CORPSE_MODEL.stackBlockThreshold;
  const stackState = blocksMovement ? 'wall' : count >= CORPSE_MODEL.stackClamberThreshold ? 'clamber' : 'step_over';
  return {
    ...stack,
    count,
    horrorValue: round3(stack.horrorValue),
    blocksMovement,
    movementPenalty: round3(movementPenalty),
    movementCostModifier: blocksMovement ? Number.POSITIVE_INFINITY : round3(1 + movementPenalty * 2.2),
    coverBonus: round3(coverBonus),
    exposureReduction: round3(exposureReduction),
    stackState
  };
}

function corpseStackTileKey(tile = {}) {
  return `${Math.round(Number(tile?.x) || 0)},${Math.round(Number(tile?.y) || 0)}`;
}

function normalisePosition(position = {}) {
  return {
    x: round3(Number.isFinite(Number(position?.x)) ? Number(position.x) : 0),
    y: round3(Number.isFinite(Number(position?.y)) ? Number(position.y) : Number.isFinite(Number(position?.z)) ? Number(position.z) : 0)
  };
}

function normaliseTile(tile = {}) {
  return {
    x: Math.round(Number.isFinite(Number(tile?.x)) ? Number(tile.x) : 0),
    y: Math.round(Number.isFinite(Number(tile?.y)) ? Number(tile.y) : Number.isFinite(Number(tile?.z)) ? Number(tile.z) : 0)
  };
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function nonNegativeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function clamp01(value) {
  const numeric = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : 0));
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
