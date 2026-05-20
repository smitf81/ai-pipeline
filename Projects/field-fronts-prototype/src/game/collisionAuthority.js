import { collectCompletedStructureBlockers } from './structureTopology.js';

export const COLLISION_LAYERS = Object.freeze({
  unit: 'unit',
  building: 'building'
});

export const COLLISION_STATS_TEMPLATE = Object.freeze({
  collisionBodies: 0,
  hardBlockerChecks: 0,
  softSeparationChecks: 0,
  softSeparationCorrections: 0,
  collisionBuckets: 0
});

const UNIT_COLLISION_DEFAULTS = Object.freeze({
  leader: Object.freeze({
    radius: 0.36,
    separationWeight: 1.25,
    priority: 3
  }),
  squad: Object.freeze({
    radius: 0.46,
    separationWeight: 1,
    priority: 1
  }),
  builder: Object.freeze({
    radius: 0.36,
    separationWeight: 0.9,
    priority: 1.4
  })
});

const COLLISION_BUCKET_SIZE = 0.85;
const SEPARATION_STRENGTH = 0.34;
const MAX_SEPARATION_PUSH_TILES = 0.13;
const OVERLAP_EPSILON = 0.025;

export function normaliseMovableCollisionMetadata(entity, overrides = {}) {
  const defaults = UNIT_COLLISION_DEFAULTS[entity?.type] ?? UNIT_COLLISION_DEFAULTS.squad;
  const priorityBoost = entity?.type === 'leader' && entity?.factionId === 'player' ? 0.7 : 0;
  return {
    layer: COLLISION_LAYERS.unit,
    shape: 'circle',
    radius: positiveNumber(overrides.radius, defaults.radius),
    solid: false,
    blocksMovement: false,
    softSeparation: true,
    separationWeight: positiveNumber(overrides.separationWeight, defaults.separationWeight),
    priority: positiveNumber(overrides.priority, defaults.priority + priorityBoost)
  };
}

export function getMovableCollisionBody(entity) {
  const collision = normaliseMovableCollisionMetadata(entity, entity?.collision);
  const position = entity?.position ?? entity?.tile;
  if (!entity?.id || !position) {
    return null;
  }
  return {
    id: entity.id,
    entityType: entity.type,
    factionId: entity.factionId,
    position: {
      x: Number(position.x) || 0,
      y: Number(position.y) || 0
    },
    tile: {
      x: Math.round(Number(entity.tile?.x ?? position.x) || 0),
      y: Math.round(Number(entity.tile?.y ?? position.y) || 0)
    },
    ...collision
  };
}

export function collectMovableCollisionBodies(game) {
  return [...(game?.leaders ?? []), ...(game?.squads ?? []), ...(game?.builders ?? [])]
    .map(getMovableCollisionBody)
    .filter(Boolean);
}

export function beginCollisionFrame(game) {
  if (!game) return null;
  game.collisionStats = createCollisionStats();
  return game.collisionStats;
}

export function ensureCollisionStats(game) {
  if (!game) {
    return createCollisionStats();
  }
  game.collisionStats = {
    ...createCollisionStats(),
    ...(game.collisionStats ?? {})
  };
  return game.collisionStats;
}

export function recordHardBlockerCheck(game, amount = 1) {
  if (!game) return;
  const stats = ensureCollisionStats(game);
  stats.hardBlockerChecks += Math.max(0, Math.floor(Number(amount) || 0));
}

export function summarizeCollisionAuthority(game) {
  return {
    ...createCollisionStats(),
    ...(game?.collisionStats ?? {})
  };
}

export function resolveSoftUnitSeparation(game, map, { isHardBlocked = null } = {}) {
  if (!game || !map) {
    return createCollisionStats();
  }
  const stats = ensureCollisionStats(game);
  const movableBodies = collectMovableCollisionBodies(game);
  const hardBodies = collectCompletedStructureBlockers(game);
  const index = createCollisionSpatialIndex(movableBodies);
  const corrections = new Map();
  const pairKeys = new Set();

  stats.collisionBodies = movableBodies.length + hardBodies.length;
  stats.collisionBuckets = index.buckets.size;

  movableBodies.forEach((body) => {
    getNearbyCollisionBodies(index, body).forEach((other) => {
      if (body.id === other.id) {
        return;
      }
      const pairKey = body.id < other.id ? `${body.id}|${other.id}` : `${other.id}|${body.id}`;
      if (pairKeys.has(pairKey)) {
        return;
      }
      pairKeys.add(pairKey);
      stats.softSeparationChecks += 1;
      resolveSoftPair(body, other, corrections, stats);
    });
  });

  if (corrections.size === 0) {
    return stats;
  }

  game.leaders = game.leaders.map((leader) => applySeparationCorrection(leader, corrections.get(leader.id), map, isHardBlocked));
  game.squads = (game.squads ?? []).map((squad) => applySeparationCorrection(squad, corrections.get(squad.id), map, isHardBlocked));
  game.builders = (game.builders ?? []).map((builder) => applySeparationCorrection(builder, corrections.get(builder.id), map, isHardBlocked));
  return stats;
}

export function createCollisionSpatialIndex(bodies, bucketSize = COLLISION_BUCKET_SIZE) {
  const buckets = new Map();
  bodies.forEach((body) => {
    const key = bucketKey(body.position, bucketSize);
    const bucket = buckets.get(key) ?? [];
    bucket.push(body);
    buckets.set(key, bucket);
  });
  return {
    bucketSize,
    buckets
  };
}

export function getNearbyCollisionBodies(index, body) {
  const origin = bucketCoords(body.position, index.bucketSize);
  const nearby = [];
  for (let y = origin.y - 1; y <= origin.y + 1; y += 1) {
    for (let x = origin.x - 1; x <= origin.x + 1; x += 1) {
      nearby.push(...(index.buckets.get(`${x},${y}`) ?? []));
    }
  }
  return nearby;
}

function resolveSoftPair(a, b, corrections, stats) {
  const minimumDistance = (a.radius + b.radius) * 0.86;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const distance = Math.hypot(dx, dy);
  const overlap = minimumDistance - distance;
  if (overlap <= OVERLAP_EPSILON) {
    return;
  }

  const direction = distance > 0.0001 ? { x: dx / distance, y: dy / distance } : fallbackPairDirection(a.id, b.id);
  const push = Math.min(MAX_SEPARATION_PUSH_TILES, overlap * SEPARATION_STRENGTH);
  const totalPriority = Math.max(0.001, a.priority + b.priority);
  const aShare = (b.priority / totalPriority) * a.separationWeight;
  const bShare = (a.priority / totalPriority) * b.separationWeight;
  addCorrection(corrections, a.id, {
    x: -direction.x * push * aShare,
    y: -direction.y * push * aShare
  });
  addCorrection(corrections, b.id, {
    x: direction.x * push * bShare,
    y: direction.y * push * bShare
  });
  stats.softSeparationCorrections += 1;
}

function applySeparationCorrection(entity, correction, map, isHardBlocked) {
  if (!correction) {
    return entity;
  }
  const current = entity.position ?? entity.tile;
  const nextPosition = clampToMap(map, {
    x: current.x + correction.x,
    y: current.y + correction.y
  });
  const currentTile = positionToTile(map, current);
  const nextTile = positionToTile(map, nextPosition);
  if (isHardBlocked?.(nextTile, entity.factionId, currentTile)) {
    return entity;
  }
  return {
    ...entity,
    position: roundPosition(nextPosition),
    tile: nextTile
  };
}

function addCorrection(corrections, id, delta) {
  const current = corrections.get(id) ?? { x: 0, y: 0 };
  corrections.set(id, {
    x: clamp(-MAX_SEPARATION_PUSH_TILES, MAX_SEPARATION_PUSH_TILES, current.x + delta.x),
    y: clamp(-MAX_SEPARATION_PUSH_TILES, MAX_SEPARATION_PUSH_TILES, current.y + delta.y)
  });
}

function createCollisionStats() {
  return { ...COLLISION_STATS_TEMPLATE };
}

function bucketKey(position, bucketSize) {
  const coords = bucketCoords(position, bucketSize);
  return `${coords.x},${coords.y}`;
}

function bucketCoords(position, bucketSize) {
  return {
    x: Math.floor(position.x / bucketSize),
    y: Math.floor(position.y / bucketSize)
  };
}

function fallbackPairDirection(a, b) {
  const hash = hashString(`${a}:${b}`);
  const angle = (hash % 6283) / 1000;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function positionToTile(map, position) {
  return {
    x: clamp(0, map.width - 1, Math.round(position.x)),
    y: clamp(0, map.height - 1, Math.round(position.y))
  };
}

function clampToMap(map, position) {
  return {
    x: clamp(0, map.width - 1, position.x),
    y: clamp(0, map.height - 1, position.y)
  };
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function roundPosition(position) {
  return {
    x: round3(position.x),
    y: round3(position.y)
  };
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
