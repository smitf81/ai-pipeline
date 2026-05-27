export const BATTLEFIELD_TRACE_CONTRACT_ID = 'field-fronts.battlefield-trace.v0';

export const BATTLEFIELD_TRACE_MODEL = Object.freeze({
  maxBloodMarks: 148,
  maxChurnTiles: 180,
  maxProcessedImpactIds: 192,
  maxProcessedDeathIds: 96,
  footprintMinStepTiles: 0.018,
  footprintCellSize: 0.5,
  churnMudThreshold: 0.28
});

export function createBattlefieldTrace() {
  return {
    contract: BATTLEFIELD_TRACE_CONTRACT_ID,
    bloodMarks: [],
    footprints: [],
    churn: [],
    processedImpactIds: [],
    processedDeathIds: []
  };
}

export function normaliseBattlefieldTrace(trace = {}) {
  const source = trace && typeof trace === 'object' ? trace : {};
  return {
    contract: BATTLEFIELD_TRACE_CONTRACT_ID,
    bloodMarks: normaliseArray(source.bloodMarks, normaliseBloodMark, BATTLEFIELD_TRACE_MODEL.maxBloodMarks),
    footprints: compactFootprints(source.footprints),
    churn: normaliseArray(source.churn, normaliseChurnTile, BATTLEFIELD_TRACE_MODEL.maxChurnTiles),
    processedImpactIds: normaliseIds(source.processedImpactIds, BATTLEFIELD_TRACE_MODEL.maxProcessedImpactIds),
    processedDeathIds: normaliseIds(source.processedDeathIds, BATTLEFIELD_TRACE_MODEL.maxProcessedDeathIds)
  };
}

export function advanceBattlefieldTrace(game = {}) {
  const tick = Math.max(0, Math.floor(Number(game.tick) || 0));
  const trace = normaliseBattlefieldTrace(game.battlefieldTrace);
  depositMovementHistory(trace, game, tick);
  depositCombatHistory(trace, game, tick);
  game.battlefieldTrace = normaliseBattlefieldTrace(trace);
  return game.battlefieldTrace;
}

export function summarizeBattlefieldTrace(game = {}) {
  const trace = normaliseBattlefieldTrace(game.battlefieldTrace);
  const muddyTiles = trace.churn.filter((tile) => tile.intensity >= BATTLEFIELD_TRACE_MODEL.churnMudThreshold).length;
  return {
    bloodMarks: trace.bloodMarks.length,
    bloodPools: trace.bloodMarks.filter((mark) => mark.kind === 'pool').length,
    footprints: trace.footprints.length,
    churnTiles: trace.churn.length,
    muddyTiles,
    deepestMud: round3(trace.churn.reduce((maximum, tile) => Math.max(maximum, tile.intensity), 0))
  };
}

function depositMovementHistory(trace, game, tick) {
  const walkers = [
    ...(game.leaders ?? []),
    ...(game.squads ?? []),
    ...(game.builders ?? []),
    ...(game.resourceWorkers ?? []),
    ...(game.transports ?? [])
  ];
  walkers.forEach((entity) => {
    const position = normalisePosition(entity.position ?? entity.tile);
    const step = Math.max(0, Number(entity.movement?.lastStepTiles) || 0);
    if (!entity.id || !position || step < BATTLEFIELD_TRACE_MODEL.footprintMinStepTiles) {
      return;
    }
    const weight = getMovementWeight(entity);
    const angle = movementAngle(entity, tick);
    const seed = hashUnit(`${entity.id}:${tick}`);
    const lateral = ((tick + hashInt(entity.id)) % 2 === 0 ? -1 : 1) * (0.08 + weight * 0.024);
    addFootprint(trace, {
      id: `footprint_${entity.id}_${tick}`,
      entityId: entity.id,
      factionId: entity.factionId ?? 'neutral',
      position: {
        x: round3(position.x + Math.cos(angle + Math.PI / 2) * lateral),
        y: round3(position.y + Math.sin(angle + Math.PI / 2) * lateral)
      },
      angle: round3(angle),
      strength: round3(clamp01(0.26 + step * 1.9 + weight * 0.12)),
      size: round3(0.034 + weight * 0.012),
      tick,
      seed
    });
    addChurn(trace, position, weight * (0.05 + step * 0.3), tick, seed);
  });
}

function depositCombatHistory(trace, game, tick) {
  const processedImpacts = new Set(trace.processedImpactIds);
  for (const impact of game.impactEvents ?? []) {
    if (!impact?.id || processedImpacts.has(impact.id) || impact.entityType === 'structure' || impact.outcome === 'miss') {
      continue;
    }
    const position = normalisePosition(impact.position);
    if (!position) continue;
    const seed = hashUnit(impact.id);
    trace.bloodMarks.push({
      id: `blood_${impact.id}`,
      sourceId: impact.id,
      kind: 'spatter',
      position,
      radius: round3(0.13 + Math.min(0.3, Math.max(0, Number(impact.damageApplied) || 0) / 44)),
      strength: round3(0.42 + Math.min(0.4, Math.max(0, Number(impact.damageApplied) || 0) / 30)),
      angle: round3(Number.isFinite(Number(impact.angle)) ? Number(impact.angle) : seed * Math.PI * 2),
      tick: Math.max(0, Math.floor(Number(impact.tick) || tick)),
      seed
    });
    addChurn(trace, position, 0.03, tick, seed);
    processedImpacts.add(impact.id);
  }

  const processedDeaths = new Set(trace.processedDeathIds);
  for (const death of game.deathEvents ?? []) {
    if (!death?.id || processedDeaths.has(death.id) || death.entityType === 'structure') {
      continue;
    }
    const position = normalisePosition(death.position);
    if (!position) continue;
    const seed = hashUnit(death.id);
    trace.bloodMarks.push({
      id: `pool_${death.id}`,
      sourceId: death.id,
      kind: 'pool',
      position,
      radius: death.entityType === 'leader' ? 0.58 : 0.46,
      strength: death.entityType === 'leader' ? 0.95 : 0.82,
      angle: round3(seed * Math.PI * 2),
      tick: Math.max(0, Math.floor(Number(death.tick) || tick)),
      seed
    });
    addChurn(trace, position, death.entityType === 'leader' ? 0.2 : 0.14, tick, seed);
    processedDeaths.add(death.id);
  }

  trace.bloodMarks = trace.bloodMarks.slice(-BATTLEFIELD_TRACE_MODEL.maxBloodMarks);
  trace.processedImpactIds = [...processedImpacts].slice(-BATTLEFIELD_TRACE_MODEL.maxProcessedImpactIds);
  trace.processedDeathIds = [...processedDeaths].slice(-BATTLEFIELD_TRACE_MODEL.maxProcessedDeathIds);
}

function addChurn(trace, position, amount, tick, seed) {
  const tile = { x: Math.round(position.x), y: Math.round(position.y) };
  const key = `${tile.x},${tile.y}`;
  const existing = trace.churn.find((entry) => entry.key === key);
  if (existing) {
    existing.intensity = round3(Math.min(1, existing.intensity + amount));
    existing.lastTick = tick;
    return;
  }
  trace.churn.push({
    key,
    tile,
    intensity: round3(Math.min(1, amount)),
    createdAtTick: tick,
    lastTick: tick,
    seed
  });
  if (trace.churn.length > BATTLEFIELD_TRACE_MODEL.maxChurnTiles) {
    trace.churn.sort((a, b) => a.intensity - b.intensity || a.lastTick - b.lastTick);
    trace.churn.splice(0, trace.churn.length - BATTLEFIELD_TRACE_MODEL.maxChurnTiles);
  }
}

function addFootprint(trace, footprint) {
  const normalised = normaliseFootprint(footprint);
  if (!normalised) return;
  const existing = trace.footprints.find((entry) => entry.key === normalised.key);
  if (!existing) {
    trace.footprints.push(normalised);
    return;
  }
  existing.strength = round3(Math.min(1, Math.max(existing.strength, normalised.strength) + normalised.strength * 0.08));
}

function getMovementWeight(entity) {
  if (entity.type === 'squad') {
    return Math.min(1.8, 0.88 + Math.max(1, entity.members?.length ?? 1) * 0.17);
  }
  if (entity.type === 'leader') return 0.92;
  if (entity.type === 'transport') return 1.05;
  return 0.54;
}

function movementAngle(entity, tick) {
  const position = normalisePosition(entity.position ?? entity.tile);
  const target = normalisePosition(entity.movement?.waypoint ?? entity.movement?.target);
  if (position && target && Math.hypot(target.x - position.x, target.y - position.y) > 0.01) {
    return Math.atan2(target.y - position.y, target.x - position.x);
  }
  return hashUnit(`${entity.id}:${tick}:angle`) * Math.PI * 2;
}

function normaliseBloodMark(mark = {}) {
  const position = normalisePosition(mark.position);
  if (!position) return null;
  return {
    id: String(mark.id ?? `blood_${position.x}_${position.y}`),
    sourceId: typeof mark.sourceId === 'string' ? mark.sourceId : null,
    kind: mark.kind === 'pool' ? 'pool' : 'spatter',
    position,
    radius: round3(clamp(0.06, 0.9, Number(mark.radius) || 0.18)),
    strength: round3(clamp01(Number(mark.strength) || 0.5)),
    angle: round3(Number(mark.angle) || 0),
    tick: Math.max(0, Math.floor(Number(mark.tick) || 0)),
    seed: clamp01(Number(mark.seed) || hashUnit(String(mark.id ?? 'blood')))
  };
}

function normaliseFootprint(mark = {}) {
  const position = normalisePosition(mark.position);
  if (!position) return null;
  const key = footprintCellKey(position);
  return {
    id: String(mark.id ?? `footprint_${position.x}_${position.y}`),
    key,
    entityId: typeof mark.entityId === 'string' ? mark.entityId : null,
    factionId: typeof mark.factionId === 'string' ? mark.factionId : 'neutral',
    position,
    angle: round3(Number(mark.angle) || 0),
    strength: round3(clamp01(Number(mark.strength) || 0.3)),
    size: round3(clamp(0.028, 0.09, Number(mark.size) || 0.045)),
    tick: Math.max(0, Math.floor(Number(mark.tick) || 0)),
    seed: clamp01(Number(mark.seed) || hashUnit(String(mark.id ?? 'footprint')))
  };
}

function compactFootprints(footprints) {
  const compacted = [];
  (Array.isArray(footprints) ? footprints : []).forEach((footprint) => {
    addFootprint({ footprints: compacted }, footprint);
  });
  return compacted;
}

function footprintCellKey(position) {
  const scale = 1 / BATTLEFIELD_TRACE_MODEL.footprintCellSize;
  return `${Math.round(position.x * scale)},${Math.round(position.y * scale)}`;
}

function normaliseChurnTile(tile = {}) {
  const position = normalisePosition(tile.tile);
  if (!position) return null;
  const rounded = { x: Math.round(position.x), y: Math.round(position.y) };
  return {
    key: `${rounded.x},${rounded.y}`,
    tile: rounded,
    intensity: round3(clamp01(Number(tile.intensity) || 0)),
    createdAtTick: Math.max(0, Math.floor(Number(tile.createdAtTick) || 0)),
    lastTick: Math.max(0, Math.floor(Number(tile.lastTick) || 0)),
    seed: clamp01(Number(tile.seed) || hashUnit(`${rounded.x},${rounded.y}`))
  };
}

function normaliseArray(items, normalise, limit) {
  return (Array.isArray(items) ? items : []).map(normalise).filter(Boolean).slice(-limit);
}

function normaliseIds(ids, limit) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string'))].slice(-limit);
}

function normalisePosition(position) {
  if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) {
    return null;
  }
  return { x: round3(Number(position.x)), y: round3(Number(position.y)) };
}

function hashInt(value) {
  let hash = 2166136261;
  const input = String(value ?? '');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(value) {
  return (hashInt(value) % 10000) / 10000;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function clamp01(value) {
  return clamp(0, 1, value);
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
