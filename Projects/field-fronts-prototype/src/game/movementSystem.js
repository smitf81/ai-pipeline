import { getTerrain } from '../config/terrain.js';
import { getTerrainField } from '../world/fields.js';
import { getTile, isInBounds } from '../world/mapModel.js';
import { recordHardBlockerCheck } from './collisionAuthority.js';
import {
  createStructureNavigationSignature,
  isTileBlockedByStructure
} from './structureTopology.js';
import {
  createCorpseBlockerSignature,
  getCorpseMovementSpeedMultiplier,
  isTileBlockedByCorpse
} from './corpseSystem.js';

export const MOVEMENT_MODEL = Object.freeze({
  tickMinutes: 1,
  tileMeters: 100,
  baseFootSpeedTilesPerTick: 0.52,
  minimumFootSpeedTilesPerTick: 0.04,
  arrivalDistanceTiles: 0.16,
  impassableThreshold: 0.12,
  pathNodeArrivalDistanceTiles: 0.22,
  navigationFlowBuildBudgetPerTick: 1,
  pendingRouteRetryTicks: 1,
  failedRouteBaseCooldownTicks: 4,
  failedRouteMaxCooldownTicks: 18,
  pathLookaheadDistanceTiles: 1.35,
  pathLookaheadMaxNodes: 3,
  localRecoveryStepScale: 0.82,
  localRecoveryMaxAttempts: 6
});

export function normaliseMovementState(movement = {}, position) {
  return {
    status: typeof movement.status === 'string' ? movement.status : 'idle',
    target: normalisePosition(movement.target, position),
    waypoint: movement.waypoint ? normalisePosition(movement.waypoint, position) : null,
    targetMode: typeof movement.targetMode === 'string' ? movement.targetMode : 'staging',
    terrain: typeof movement.terrain === 'string' ? movement.terrain : 'land',
    speedTilesPerTick: Number.isFinite(movement.speedTilesPerTick) ? round3(Math.max(0, movement.speedTilesPerTick)) : 0,
    speedKph: Number.isFinite(movement.speedKph) ? round3(Math.max(0, movement.speedKph)) : 0,
    distanceToTarget: Number.isFinite(movement.distanceToTarget) ? round3(Math.max(0, movement.distanceToTarget)) : 0,
    lastStepTiles: Number.isFinite(movement.lastStepTiles) ? round3(Math.max(0, movement.lastStepTiles)) : 0
  };
}

export const normaliseLeaderMovement = normaliseMovementState;

export function normaliseMovementOrder(movementOrder) {
  if (!movementOrder || movementOrder.type !== 'path-hold') {
    return null;
  }
  const path = normaliseMovementOrderPath(movementOrder.path);
  if (path.length < 2) {
    return null;
  }
  return {
    type: 'path-hold',
    routeMode: ['player-intended', 'ai-director', 'sound-investigation'].includes(movementOrder.routeMode) ? movementOrder.routeMode : 'direct',
    path,
    target: normalisePosition(movementOrder.target, path[path.length - 1]),
    issuedAtTick: Number.isInteger(movementOrder.issuedAtTick) ? movementOrder.issuedAtTick : 0
  };
}

export function normaliseMovementPath(movementPath) {
  if (!movementPath || !Array.isArray(movementPath.nodes)) {
    return null;
  }
  const nodes = normaliseRuntimeMovementPathNodes(movementPath.nodes);
  if (nodes.length < 2) {
    return null;
  }
  return {
    kind: movementPath.kind === 'player-intended' ? 'player-intended' : 'auto',
    target: normalisePosition(movementPath.target, nodes[nodes.length - 1]),
    sourceSignature: typeof movementPath.sourceSignature === 'string' ? movementPath.sourceSignature : '',
    mapSignature: typeof movementPath.mapSignature === 'string' ? movementPath.mapSignature : '',
    routeCacheKey: typeof movementPath.routeCacheKey === 'string' ? movementPath.routeCacheKey : '',
    routeCacheHit: Boolean(movementPath.routeCacheHit),
    routeState: normaliseRouteState(movementPath.routeState, Boolean(movementPath.blocked)),
    routeFailureReason: typeof movementPath.routeFailureReason === 'string' ? movementPath.routeFailureReason : '',
    routeFailureCount: Math.max(0, Math.floor(Number(movementPath.routeFailureCount) || 0)),
    routeRequestedAtTick: Math.max(0, Math.floor(Number(movementPath.routeRequestedAtTick) || 0)),
    routeResolvedAtTick: Math.max(0, Math.floor(Number(movementPath.routeResolvedAtTick) || 0)),
    nextAllowedRepathTick: Math.max(0, Math.floor(Number(movementPath.nextAllowedRepathTick) || 0)),
    followBlockedTicks: Math.max(0, Math.floor(Number(movementPath.followBlockedTicks) || 0)),
    lastFollowFailureTick: Math.max(0, Math.floor(Number(movementPath.lastFollowFailureTick) || 0)),
    lastFollowFailureReason: typeof movementPath.lastFollowFailureReason === 'string' ? movementPath.lastFollowFailureReason : '',
    lastLookaheadCursor: Math.max(0, Math.floor(Number(movementPath.lastLookaheadCursor) || 0)),
    nodes,
    cursor: Number.isInteger(movementPath.cursor) ? clamp(0, nodes.length - 1, movementPath.cursor) : 1,
    blocked: Boolean(movementPath.blocked)
  };
}

export function normaliseMovementOrderPath(path) {
  if (!Array.isArray(path)) {
    return [];
  }
  return stabilizePath(path
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => roundPosition(point)));
}

export function normaliseRuntimeMovementPathNodes(path) {
  if (!Array.isArray(path)) {
    return [];
  }
  const nodes = [];
  path
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => roundPosition(point))
    .forEach((point) => {
      const previous = nodes[nodes.length - 1];
      if (!previous || tileDistance(previous, point) >= 0.001) {
        nodes.push(point);
      }
    });
  return nodes;
}

export function issuePlayerMoveCommand(game, map, entityId, path, deps) {
  const targetEntity = deps.getGameEntities(game).find((entity) => entity.id === entityId) ?? null;
  if (!targetEntity || !deps.isFactionPlayerControlled(targetEntity.factionId) || !['leader', 'squad'].includes(targetEntity.type)) {
    return {
      ok: false,
      reason: targetEntity && !deps.isFactionPlayerControlled(targetEntity.factionId) ? 'not-player-controlled' : 'invalid-target',
      message: targetEntity && !deps.isFactionPlayerControlled(targetEntity.factionId)
        ? 'Enemy units cannot be directly commanded.'
        : 'No friendly unit selected.',
      game: deps.recomputeGameState(game, map)
    };
  }
  const orderPath = normaliseMovementOrderPath(path);
  if (orderPath.length < 2) {
    return {
      ok: false,
      reason: 'invalid-path',
      message: 'Move order needs a start and target.',
      game: deps.recomputeGameState(game, map)
    };
  }
  const target = orderPath[orderPath.length - 1];
  game.leaders = game.leaders.map((leader) => {
    if (leader.id !== entityId || leader.factionId !== 'player') {
      return leader;
    }
    return {
      ...leader,
      movementOrder: {
        type: 'path-hold',
        routeMode: 'player-intended',
        path: orderPath,
        target,
        issuedAtTick: game.tick
      },
      movementPath: null,
      behavior: {
        ...deps.normaliseLeaderBehavior(leader.behavior, leader.factionId),
        stance: 'commit',
        intent: 'path-hold-objective',
        lastDecision: `Player ordered path hold at ${target.x}, ${target.y}`
      }
    };
  });
  game.squads = (game.squads ?? []).map((squad) => {
    if (squad.id !== entityId || squad.factionId !== 'player') {
      return squad;
    }
    return {
      ...squad,
      movementOrder: {
        type: 'path-hold',
        routeMode: 'player-intended',
        path: orderPath,
        target,
        issuedAtTick: game.tick
      },
      movementPath: null,
      behavior: {
        ...deps.normaliseSquadBehavior(squad.behavior, squad.factionId),
        stance: 'commit',
        intent: 'path-hold-objective',
        lastDecision: `Player ordered infantry path hold at ${target.x}, ${target.y}`
      }
    };
  });
  deps.emitRuntimeEvent(game, {
    type: 'movement:order_issued',
    factionId: 'player',
    payload: { entityId, target }
  });
  return {
    ok: true,
    entityId,
    target,
    game
  };
}

export function issueFactionMovementOrder(entity, target, tick, { routeMode = 'direct', stance = 'commit', intent = 'move', lastDecision = 'Move order issued' } = {}, deps) {
  const start = entity.position ?? entity.tile;
  const orderPath = normaliseRuntimeMovementPathNodes([start, target]);
  return {
    ...entity,
    movementOrder: {
      type: 'path-hold',
      routeMode,
      path: orderPath,
      target: orderPath[orderPath.length - 1],
      issuedAtTick: tick ?? 0
    },
    movementPath: null,
    behavior: entity.type === deps.ENTITY_TYPES.leader
      ? {
        ...deps.normaliseLeaderBehavior(entity.behavior, entity.factionId),
        stance,
        intent,
        lastDecision
      }
      : {
        ...deps.normaliseSquadBehavior(entity.behavior, entity.factionId),
        stance,
        intent,
        lastDecision
      }
  };
}

export function advanceMovableEntityMovement(entity, plan, map, game) {
  const distanceToTarget = tileDistance(plan.position, plan.target);

  if (hasReachedMovementTarget(plan.position, plan.target)) {
    return markMovementArrived(entity, plan, map, 0);
  }

  if (plan.blocked || !plan.waypoint) {
    return markMovementBlocked(entity, plan, map, distanceToTarget);
  }

  const stepSpeedTiles = applyCorpseStackMovementPenalty(map, game, entity, plan.position, applyUnderFireMovementPenalty(entity, plan.speedTilesPerTick, game));
  const step = resolveMovementStep(map, game, entity, plan.position, plan.waypoint, stepSpeedTiles);
  const nextTerrain = getTerrain(getTile(map, step.tile.x, step.tile.y));

  if (step.blocked) {
    return markMovementBlocked(entity, {
      ...plan,
      terrain: nextTerrain.id,
      movementPath: markMovementPathFollowBlocked(plan.movementPath, game?.tick, 'local-step-blocked')
    }, map, distanceToTarget);
  }

  const lastStepTiles = tileDistance(plan.position, step.position);
  const nextDistanceToTarget = tileDistance(step.position, plan.target);
  if (hasReachedMovementTarget(step.position, plan.target)) {
    return markMovementArrived(entity, { ...plan, terrain: nextTerrain.id }, map, tileDistance(plan.position, plan.target));
  }
  return applyMovablePosition(entity, step.position, {
    ...plan,
    status: step.slidAxis ? `sliding-${step.slidAxis}` : 'moving',
    terrain: nextTerrain.id,
    distanceToTarget: round3(nextDistanceToTarget),
    lastStepTiles: round3(lastStepTiles)
  }, map);
}


function applyCorpseStackMovementPenalty(map, game, entity, position, speedTilesPerTick) {
  const tile = positionToTile(map, position ?? entity?.position ?? entity?.tile);
  const multiplier = getCorpseMovementSpeedMultiplier(game, tile);
  return round3(speedTilesPerTick * multiplier);
}

function applyUnderFireMovementPenalty(entity, speedTilesPerTick, game = null) {
  const underFireUntilTick = Number(entity?.combat?.underFireUntilTick);
  if (!Number.isFinite(underFireUntilTick) || underFireUntilTick <= (game?.tick ?? 0)) {
    return speedTilesPerTick;
  }
  const incomingFireCount = Math.max(1, Math.floor(Number(entity?.combat?.incomingFireCount) || 1));
  const pressurePenalty = Math.min(0.45, incomingFireCount * 0.08);
  return round3(speedTilesPerTick * Math.max(0.48, 1 - pressurePenalty));
}

export function hasReachedMovementTarget(position, target) {
  return tileDistance(position, target) <= MOVEMENT_MODEL.arrivalDistanceTiles;
}

export function markMovementArrived(entity, plan, map, lastStepTiles = 0) {
  return applyMovablePosition(entity, plan.target, {
    ...plan,
    status: 'arrived',
    distanceToTarget: 0,
    lastStepTiles: round3(lastStepTiles)
  }, map);
}

export function markMovementBlocked(entity, plan, map, distanceToTarget = tileDistance(plan.position, plan.target)) {
  return applyMovablePosition(entity, plan.position, {
    ...plan,
    status: 'blocked',
    distanceToTarget: round3(distanceToTarget),
    lastStepTiles: 0
  }, map);
}

export function clearMovementOrder(entity) {
  const position = normalisePosition(entity.position, entity.tile);
  return {
    ...entity,
    movementOrder: null,
    movementPath: null,
    movement: normaliseMovementState({ status: 'idle', target: position }, position)
  };
}

export function resolveMovementStep(map, game, entity, position, waypoint, speedTilesPerTick) {
  const distanceToWaypoint = tileDistance(position, waypoint);
  const desired = movePositionTowards(position, waypoint, Math.min(speedTilesPerTick, distanceToWaypoint));
  const allowTile = positionToTile(map, position);
  const attempts = orderMovementStepAttempts(entity, [
    { axis: null, position: desired },
    { axis: 'x', position: roundPosition({ x: desired.x, y: position.y }) },
    { axis: 'y', position: roundPosition({ x: position.x, y: desired.y }) }
  ]);
  for (const attempt of attempts) {
    if (tileDistance(position, attempt.position) <= 0.0001) {
      continue;
    }
    const nextPosition = clampToMapPosition(map, attempt.position);
    const tile = positionToTile(map, nextPosition);
    if (canTraverseTileStep(map, allowTile, tile, game, entity.factionId, { allowTile })) {
      return {
        blocked: false,
        slidAxis: attempt.axis,
        recoveryAxis: attempt.recoveryAxis ?? null,
        position: roundPosition(nextPosition),
        tile
      };
    }
  }
  const recovery = resolveLocalRecoveryStep(map, game, entity, position, waypoint, speedTilesPerTick, allowTile);
  if (recovery) {
    return recovery;
  }
  return {
    blocked: true,
    slidAxis: null,
    recoveryAxis: null,
    position: roundPosition(position),
    tile: allowTile
  };
}



function orderMovementStepAttempts(entity, attempts) {
  const status = typeof entity?.movement?.status === 'string' ? entity.movement.status : '';
  const preferredAxis = status.startsWith('sliding-y') ? 'y' : status.startsWith('sliding-x') ? 'x' : null;
  if (!preferredAxis) {
    return attempts;
  }
  const direct = attempts.find((attempt) => attempt.axis === null);
  const preferred = attempts.find((attempt) => attempt.axis === preferredAxis);
  const other = attempts.find((attempt) => attempt.axis && attempt.axis !== preferredAxis);
  return [direct, preferred, other].filter(Boolean);
}

function resolveLocalRecoveryStep(map, game, entity, position, waypoint, speedTilesPerTick, allowTile) {
  const dx = waypoint.x - position.x;
  const dy = waypoint.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= 0.0001 || speedTilesPerTick <= 0) {
    return null;
  }
  const ux = dx / distance;
  const uy = dy / distance;
  const px = -uy;
  const py = ux;
  const recoveryStep = Math.max(
    MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
    speedTilesPerTick * MOVEMENT_MODEL.localRecoveryStepScale
  );
  const candidates = [
    { axis: 'recovery-left', x: px, y: py, weight: 0.92 },
    { axis: 'recovery-right', x: -px, y: -py, weight: 0.92 },
    { axis: 'recovery-forward-left', x: ux * 0.55 + px * 0.85, y: uy * 0.55 + py * 0.85, weight: 0.82 },
    { axis: 'recovery-forward-right', x: ux * 0.55 - px * 0.85, y: uy * 0.55 - py * 0.85, weight: 0.82 },
    { axis: 'recovery-back-left', x: -ux * 0.35 + px * 0.75, y: -uy * 0.35 + py * 0.75, weight: 0.58 },
    { axis: 'recovery-back-right', x: -ux * 0.35 - px * 0.75, y: -uy * 0.35 - py * 0.75, weight: 0.58 }
  ].slice(0, MOVEMENT_MODEL.localRecoveryMaxAttempts);

  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const length = Math.hypot(candidate.x, candidate.y);
    if (length <= 0.0001) continue;
    const attemptPosition = clampToMapPosition(map, {
      x: position.x + (candidate.x / length) * recoveryStep * candidate.weight,
      y: position.y + (candidate.y / length) * recoveryStep * candidate.weight
    });
    if (tileDistance(position, attemptPosition) <= 0.0001) continue;
    const tile = positionToTile(map, attemptPosition);
    if (!canTraverseTileStep(map, allowTile, tile, game, entity?.factionId, { allowTile })) {
      continue;
    }
    const score = tileDistance(position, waypoint) - tileDistance(attemptPosition, waypoint);
    if (score > bestScore) {
      bestScore = score;
      best = {
        blocked: false,
        slidAxis: candidate.axis,
        recoveryAxis: candidate.axis,
        position: roundPosition(attemptPosition),
        tile
      };
    }
  }
  return best;
}

export function resolveNavigableMovementTarget(map, entity, position, target) {
  const game = entity?._runtimeOwner;
  const targetTile = positionToTile(map, target);
  const startTile = positionToTile(map, position);
  if (!isMovementBlocked(map, targetTile, game, entity?.factionId, { allowTile: startTile })) {
    return roundPosition(target);
  }

  const fallback = findNearestNavigableTile(map, targetTile, game, entity?.factionId, startTile);
  return fallback ? tileToPosition(fallback) : roundPosition(position);
}

export function findNearestNavigableTile(map, origin, game, factionId, startTile) {
  const visited = new Set();
  const queue = [{ tile: origin, distance: 0 }];
  const maxRadius = 4;
  while (queue.length > 0) {
    const entry = queue.shift();
    const key = tileKey(entry.tile);
    if (visited.has(key) || entry.distance > maxRadius) {
      continue;
    }
    visited.add(key);
    if (
      isInBounds(map, entry.tile.x, entry.tile.y) &&
      !isMovementBlocked(map, entry.tile, game, factionId, { allowTile: startTile })
    ) {
      return entry.tile;
    }
    [
      { x: entry.tile.x + 1, y: entry.tile.y },
      { x: entry.tile.x - 1, y: entry.tile.y },
      { x: entry.tile.x, y: entry.tile.y + 1 },
      { x: entry.tile.x, y: entry.tile.y - 1 },
      { x: entry.tile.x + 1, y: entry.tile.y + 1 },
      { x: entry.tile.x + 1, y: entry.tile.y - 1 },
      { x: entry.tile.x - 1, y: entry.tile.y + 1 },
      { x: entry.tile.x - 1, y: entry.tile.y - 1 }
    ].forEach((tile) => {
      if (isInBounds(map, tile.x, tile.y) && !visited.has(tileKey(tile))) {
        queue.push({ tile, distance: entry.distance + 1 });
      }
    });
  }
  return null;
}

export function ensureMovementPath(map, entity, position, target, deps) {
  const cached = normaliseMovementPath(entity.movementPath);
  const sourceSignature = createMovementSourceSignature(entity, target);
  const mapSignature = entityNavigationMapSignature(map, entity?._runtimeOwner);
  const targetPosition = roundPosition(target);
  const tick = Math.max(0, Math.floor(Number(entity?._runtimeOwner?.tick) || 0));
  const cacheMatches = cached
    && cached.sourceSignature === sourceSignature
    && cached.mapSignature === mapSignature
    && tileDistance(cached.target, targetPosition) <= 0.05;

  if (
    cacheMatches &&
    cached.routeState === 'ready' &&
    !cached.blocked &&
    cached.cursor < cached.nodes.length
  ) {
    return advanceMovementPathCursor(cached, position);
  }

  if (cacheMatches && ['pending', 'failed'].includes(cached.routeState) && tick < cached.nextAllowedRepathTick) {
    return cached;
  }

  if (cacheMatches && cached.blocked && tick < cached.nextAllowedRepathTick) {
    return cached;
  }

  return buildMovementPath(map, entity, position, targetPosition, sourceSignature, mapSignature, deps, cached);
}

export function getMovementPathWaypoint(movementPath, position, context = {}) {
  const path = normaliseMovementPath(movementPath);
  if (!path || path.blocked || ['pending', 'failed'].includes(path.routeState)) return null;
  const advanced = advanceMovementPathCursor(path, position);
  return selectLookaheadWaypoint(advanced, position, context) ?? advanced.nodes[advanced.cursor] ?? advanced.target;
}

export function advanceMovementPathCursor(movementPath, position) {
  const path = normaliseMovementPath(movementPath);
  if (!path) return null;
  let cursor = path.cursor;
  while (
    cursor < path.nodes.length - 1 &&
    tileDistance(position, path.nodes[cursor]) <= MOVEMENT_MODEL.pathNodeArrivalDistanceTiles
  ) {
    cursor += 1;
  }
  return { ...path, cursor };
}


function selectLookaheadWaypoint(path, position, context = {}) {
  if (!path || !Array.isArray(path.nodes) || path.nodes.length === 0) {
    return null;
  }
  const cursor = clamp(0, path.nodes.length - 1, path.cursor);
  let selectedCursor = cursor;
  let selected = path.nodes[cursor] ?? path.target;
  const maxCursor = Math.min(path.nodes.length - 1, cursor + MOVEMENT_MODEL.pathLookaheadMaxNodes);
  for (let index = maxCursor; index > cursor; index -= 1) {
    const candidate = path.nodes[index];
    if (!candidate || tileDistance(position, candidate) > MOVEMENT_MODEL.pathLookaheadDistanceTiles) {
      continue;
    }
    if (canUseLookaheadWaypoint(position, candidate, context)) {
      selectedCursor = index;
      selected = candidate;
      break;
    }
  }
  if (selectedCursor > cursor && context?.record !== false) {
    path.lastLookaheadCursor = selectedCursor;
  }
  return selected ? roundPosition(selected) : null;
}

function canUseLookaheadWaypoint(position, candidate, context = {}) {
  const map = context.map;
  if (!map || !context.entity) {
    return true;
  }
  return Boolean(buildDirectMovementSegment(
    map,
    position,
    candidate,
    context.game ?? context.entity?._runtimeOwner,
    context.entity?.factionId
  ));
}

function markMovementPathFollowBlocked(movementPath, tick = 0, reason = 'blocked') {
  const path = normaliseMovementPath(movementPath);
  if (!path) return movementPath ?? null;
  return {
    ...path,
    followBlockedTicks: path.followBlockedTicks + 1,
    lastFollowFailureTick: Math.max(0, Math.floor(Number(tick) || 0)),
    lastFollowFailureReason: reason
  };
}

export function advanceMovementOrder(movementOrder, position) {
  const order = normaliseMovementOrder(movementOrder);
  if (!order) {
    return null;
  }
  const nextIndex = order.path.findIndex((point, index) => index > 0 && isMeaningfulOrderPoint(position, point));
  if (nextIndex > 1) {
    order.path.splice(1, nextIndex - 1);
  }
  return {
    ...order,
    target: order.path[order.path.length - 1]
  };
}

export function applyMovablePosition(entity, position, movement, map) {
  const nextPosition = roundPosition(clampToMapPosition(map, position));
  const movementPath = advanceMovementPathCursor(movement.movementPath, nextPosition);
  return {
    ...entity,
    position: nextPosition,
    tile: positionToTile(map, nextPosition),
    movement: normaliseMovementState(movement, nextPosition),
    movementOrder: advanceMovementOrder(entity.movementOrder, nextPosition),
    movementPath
  };
}

export const applyLeaderPosition = applyMovablePosition;
export const applySquadPosition = applyMovablePosition;

export function validateRuntimeMovementPathNodes(map, game, entity, nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return false;
  }
  const originTile = positionToTile(map, nodes[0]);
  let previousTile = originTile;
  return nodes.every((node, index) => {
    const tile = positionToTile(map, node);
    if (index === 0 && tile.x === originTile.x && tile.y === originTile.y) {
      return true;
    }
    const valid = canTraverseTileStep(map, previousTile, tile, game, entity?.factionId, { allowTile: originTile });
    previousTile = tile;
    return valid;
  });
}

export function entityNavigationMapSignature(map, game = null) {
  const base = `${entityPathMapSignature(map)}::structures:${createStructureNavigationSignature(game)}`;
  const corpseSignature = createCorpseBlockerSignature(game);
  return corpseSignature ? `${base}::corpses:${corpseSignature}` : base;
}

export function movementTerrainMultiplier(terrainField) {
  return clamp(0.18, 1, terrainField.passability * 0.64 + terrainField.logistics * 0.24 + (1 - terrainField.height) * 0.12);
}

export function isMovementBlocked(map, tile, game = null, factionId = null, { allowTile = null } = {}) {
  if (allowTile && allowTile.x === tile.x && allowTile.y === tile.y) {
    return false;
  }
  if (!map || !tile || !isInBounds(map, tile.x, tile.y)) {
    return true;
  }

  const cache = getMovementBlockedCache(game, map);
  const cacheKey = createMovementBlockedCacheEntryKey(tile, factionId);
  if (cache?.blockedByTile?.has(cacheKey)) {
    return cache.blockedByTile.get(cacheKey);
  }

  recordHardBlockerCheck(game);
  const terrainField = getTerrainField(map, tile.x, tile.y);
  const blocked = terrainField.passability < MOVEMENT_MODEL.impassableThreshold
    || terrainField.water >= 0.95
    || isTileBlockedByStructure(game, map, tile, factionId)
    || isTileBlockedByCorpse(game, tile);

  if (cache) {
    cache.blockedByTile.set(cacheKey, blocked);
  }
  return blocked;
}

export function canTraverseTileStep(map, fromTile, toTile, game = null, factionId = null, { allowTile = null } = {}) {
  if (!isInBounds(map, toTile.x, toTile.y) || isMovementBlocked(map, toTile, game, factionId, { allowTile })) {
    return false;
  }
  if (!fromTile || (fromTile.x === toTile.x && fromTile.y === toTile.y)) {
    return true;
  }

  const dx = Math.sign(toTile.x - fromTile.x);
  const dy = Math.sign(toTile.y - fromTile.y);
  if (dx === 0 || dy === 0) {
    return true;
  }

  const sideA = { x: fromTile.x + dx, y: fromTile.y };
  const sideB = { x: fromTile.x, y: fromTile.y + dy };
  return isInBounds(map, sideA.x, sideA.y)
    && isInBounds(map, sideB.x, sideB.y)
    && !isMovementBlocked(map, sideA, game, factionId, { allowTile })
    && !isMovementBlocked(map, sideB, game, factionId, { allowTile });
}

export function summarizeMovementPath(movementPath) {
  const path = normaliseMovementPath(movementPath);
  if (!path) return null;
  return {
    kind: path.kind,
    target: path.target,
    cursor: path.cursor,
    nodeCount: path.nodes.length,
    blocked: path.blocked,
    followBlockedTicks: path.followBlockedTicks,
    lastFollowFailureReason: path.lastFollowFailureReason,
    lastLookaheadCursor: path.lastLookaheadCursor,
    routeState: path.routeState,
    routeFailureReason: path.routeFailureReason,
    nextAllowedRepathTick: path.nextAllowedRepathTick
  };
}

function buildMovementPath(map, entity, position, target, sourceSignature, mapSignature, deps, previousPath = null) {
  const order = normaliseMovementOrder(entity.movementOrder);
  const anchors = order?.routeMode === 'player-intended'
    ? [position, ...order.path.slice(1)]
    : [position, target];
  const route = getSharedMovementRoute(map, entity, anchors, sourceSignature, mapSignature, deps);
  const tick = Math.max(0, Math.floor(Number(entity?._runtimeOwner?.tick) || 0));
  const nodes = route.nodes;
  const base = {
    kind: order?.routeMode === 'player-intended' ? 'player-intended' : 'auto',
    target,
    sourceSignature,
    mapSignature,
    routeCacheKey: route.cacheKey,
    routeCacheHit: route.cacheHit,
    nodes: [roundPosition(position), target],
    cursor: 1
  };

  if (route.deferred) {
    return {
      ...base,
      blocked: false,
      routeState: 'pending',
      routeFailureReason: 'route-build-deferred',
      routeFailureCount: Math.max(0, Number(previousPath?.routeFailureCount) || 0),
      routeRequestedAtTick: tick,
      routeResolvedAtTick: 0,
      nextAllowedRepathTick: tick + MOVEMENT_MODEL.pendingRouteRetryTicks
    };
  }

  const validRoute = nodes.length >= 2 && validateRuntimeMovementPathNodes(map, entity?._runtimeOwner, entity, nodes);
  if (!validRoute) {
    const failureReason = nodes.length < 2 ? (route.failureReason || 'empty-route') : 'blocked-route-node';
    const routeFailureCount = Math.max(1, (Number(previousPath?.routeFailureCount) || 0) + 1);
    return {
      ...base,
      blocked: true,
      routeState: 'failed',
      routeFailureReason: failureReason,
      routeFailureCount,
      routeRequestedAtTick: tick,
      routeResolvedAtTick: tick,
      nextAllowedRepathTick: tick + getRouteFailureCooldownTicks(routeFailureCount),
      validation: failureReason
    };
  }
  return {
    ...base,
    nodes,
    cursor: Math.min(1, nodes.length - 1),
    blocked: false,
    routeState: 'ready',
    routeFailureReason: '',
    routeFailureCount: 0,
    routeRequestedAtTick: tick,
    routeResolvedAtTick: tick,
    nextAllowedRepathTick: tick
  };
}

function getSharedMovementRoute(map, entity, anchors, sourceSignature, mapSignature, deps) {
  const cleanAnchors = normaliseMovementOrderPath(anchors);
  if (cleanAnchors.length < 2) {
    return { nodes: [], cacheKey: '', cacheHit: false };
  }

  const target = cleanAnchors[cleanAnchors.length - 1];
  const cache = getNavigationRouteCache(entity, map);
  const cacheKey = createSharedMovementRouteKey({
    mapSignature,
    sourceSignature,
    target,
    routeMode: normaliseMovementOrder(entity.movementOrder)?.routeMode ?? 'auto'
  });
  const start = cleanAnchors[0];
  const cachedRoute = cache.routes.get(cacheKey);
  if (cachedRoute) {
    if (cachedRoute.routeState === 'pending') {
      if (cachedRoute.playerIntended) {
        const rebuilt = buildPlayerIntendedAnchoredRoute(cache, cacheKey, map, entity, cleanAnchors, deps);
        if (rebuilt) {
          return { ...rebuilt, cacheHit: true };
        }
      }
      if (!claimNavigationFlowBuildBudget(entity?._runtimeOwner, normaliseMovementOrder(entity.movementOrder)?.routeMode)) {
        recordNavigationRouteStat(cache, 'queueWaits', 1);
        return {
          nodes: [],
          cacheKey,
          cacheHit: true,
          deferred: true
        };
      }
      return buildAndStoreQueuedFlowRoute(cache, cacheKey, map, entity, start, target, deps, true);
    }
    if (cachedRoute.routeState === 'failed') {
      recordNavigationRouteStat(cache, 'failedCacheHits', 1);
      return {
        nodes: [],
        cacheKey,
        cacheHit: true,
        failureReason: cachedRoute.failureReason ?? 'cached-route-failed'
      };
    }
    const startedAt = nowMs();
    const nodes = Array.isArray(cachedRoute.nodes)
      ? cachedRoute.nodes
      : deps.materialiseFlowRoute(cachedRoute.flow, start, target);
    recordNavigationRouteStat(cache, 'materialiseMs', nowMs() - startedAt);
    recordNavigationRouteStat(cache, 'cacheHits', 1);
    return {
      nodes,
      cacheKey,
      cacheHit: true
    };
  }

  const directNodes = buildDirectMovementRoute(map, cleanAnchors, entity?._runtimeOwner, entity?.factionId);
  if (directNodes) {
    const route = {
      nodes: directNodes,
      target: roundPosition(target),
      direct: true,
      builtAtTick: Number(entity?._runtimeOwner?.tick ?? 0)
    };
    cache.routes.set(cacheKey, route);
    recordNavigationRouteStat(cache, 'directRoutes', 1);
    recordNavigationRouteStat(cache, 'cacheMisses', 1);
    return {
      nodes: directNodes,
      cacheKey,
      cacheHit: false
    };
  }

  const routeMode = normaliseMovementOrder(entity.movementOrder)?.routeMode;
  if (routeMode === 'player-intended' && cleanAnchors.length > 2) {
    const anchoredRoute = buildPlayerIntendedAnchoredRoute(cache, cacheKey, map, entity, cleanAnchors, deps);
    if (anchoredRoute) {
      return anchoredRoute;
    }
  }

  if (!claimNavigationFlowBuildBudget(entity?._runtimeOwner, routeMode)) {
    cache.routes.set(cacheKey, {
      routeState: 'pending',
      target: roundPosition(target),
      requestedAtTick: Math.max(0, Math.floor(Number(entity?._runtimeOwner?.tick) || 0))
    });
    recordNavigationRouteStat(cache, 'flowBuildsDeferred', 1);
    recordNavigationRouteStat(cache, 'queueEnqueues', 1);
    return {
      nodes: [],
      cacheKey,
      cacheHit: false,
      deferred: true
    };
  }

  return buildAndStoreQueuedFlowRoute(cache, cacheKey, map, entity, start, target, deps, false);
}



function buildPlayerIntendedAnchoredRoute(cache, cacheKey, map, entity, anchors, deps) {
  const reducedAnchors = reducePlayerIntendedAnchors(anchors);
  if (reducedAnchors.length < 2) {
    return null;
  }

  const nodes = [roundPosition(reducedAnchors[0])];
  let usedFlow = false;
  for (let index = 1; index < reducedAnchors.length; index += 1) {
    const segmentStart = reducedAnchors[index - 1];
    const segmentTarget = reducedAnchors[index];
    let segment = buildDirectMovementSegment(map, segmentStart, segmentTarget, entity?._runtimeOwner, entity?.factionId);
    if (!segment) {
      if (!claimNavigationFlowBuildBudget(entity?._runtimeOwner, 'player-intended')) {
        cache.routes.set(cacheKey, {
          routeState: 'pending',
          target: roundPosition(reducedAnchors[reducedAnchors.length - 1]),
          requestedAtTick: Math.max(0, Math.floor(Number(entity?._runtimeOwner?.tick) || 0)),
          playerIntended: true
        });
        recordNavigationRouteStat(cache, 'playerAnchoredDeferred', 1);
        return {
          nodes: [],
          cacheKey,
          cacheHit: false,
          deferred: true
        };
      }
      const flow = deps.buildNavigationFlowField(map, segmentTarget, entity?._runtimeOwner, entity?.factionId);
      segment = deps.materialiseFlowRoute(flow, segmentStart, segmentTarget);
      usedFlow = true;
      if (!flow?.reachable || !Array.isArray(segment) || segment.length < 2) {
        cache.routes.set(cacheKey, {
          routeState: 'failed',
          failureReason: !flow?.reachable ? 'unreachable-player-anchor' : 'empty-player-anchor-route',
          target: roundPosition(reducedAnchors[reducedAnchors.length - 1]),
          builtAtTick: Math.max(0, Math.floor(Number(entity?._runtimeOwner?.tick) || 0)),
          playerIntended: true
        });
        recordNavigationRouteStat(cache, 'playerAnchoredFailures', 1);
        return {
          nodes: [],
          cacheKey,
          cacheHit: false,
          failureReason: !flow?.reachable ? 'unreachable-player-anchor' : 'empty-player-anchor-route'
        };
      }
    }
    segment.slice(1).forEach((node) => {
      const previous = nodes[nodes.length - 1];
      if (!previous || tileDistance(previous, node) >= 0.001) {
        nodes.push(roundPosition(node));
      }
    });
  }
  const cleanNodes = normaliseRuntimeMovementPathNodes(nodes);
  if (cleanNodes.length < 2) {
    return null;
  }
  cache.routes.set(cacheKey, {
    routeState: 'ready',
    nodes: cleanNodes,
    target: roundPosition(reducedAnchors[reducedAnchors.length - 1]),
    playerIntended: true,
    usedFlow,
    builtAtTick: Math.max(0, Math.floor(Number(entity?._runtimeOwner?.tick) || 0))
  });
  recordNavigationRouteStat(cache, usedFlow ? 'playerAnchoredFlowRoutes' : 'playerAnchoredDirectRoutes', 1);
  recordNavigationRouteStat(cache, 'cacheMisses', 1);
  return {
    nodes: cleanNodes,
    cacheKey,
    cacheHit: false
  };
}

function reducePlayerIntendedAnchors(anchors) {
  const clean = normaliseMovementOrderPath(anchors);
  if (clean.length <= 26) {
    return clean;
  }
  const reduced = [clean[0]];
  const stride = Math.ceil((clean.length - 2) / 24);
  for (let index = stride; index < clean.length - 1; index += stride) {
    reduced.push(clean[index]);
  }
  reduced.push(clean[clean.length - 1]);
  return reduced;
}

function getNavigationRouteCache(entity, map) {
  const game = entity?._runtimeOwner;
  if (!game) {
    return { routes: new Map() };
  }

  const mapSignature = entityNavigationMapSignature(map, game);
  const existing = game._runtimeCache?.navigationRoutes;
  if (existing?.mapSignature === mapSignature && existing.routes instanceof Map) {
    return existing;
  }

  const nextCache = {
    mapSignature,
    routes: new Map(),
    stats: {}
  };
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    navigationRoutes: nextCache
  };
  return nextCache;
}


function buildAndStoreQueuedFlowRoute(cache, cacheKey, map, entity, start, target, deps, fromQueue = false) {
  const buildStartedAt = nowMs();
  const flow = deps.buildNavigationFlowField(map, target, entity?._runtimeOwner, entity?.factionId);
  recordNavigationRouteStat(cache, 'flowBuildMs', nowMs() - buildStartedAt);
  recordNavigationRouteStat(cache, 'flowBuilds', 1);
  if (fromQueue) {
    recordNavigationRouteStat(cache, 'queueBuilds', 1);
  }

  const materialiseStartedAt = nowMs();
  const nodes = deps.materialiseFlowRoute(flow, start, target);
  recordNavigationRouteStat(cache, 'materialiseMs', nowMs() - materialiseStartedAt);
  recordNavigationRouteStat(cache, 'cacheMisses', fromQueue ? 0 : 1);

  if (!flow?.reachable || nodes.length < 2) {
    cache.routes.set(cacheKey, {
      routeState: 'failed',
      failureReason: !flow?.reachable ? 'unreachable-flow' : 'empty-flow-route',
      target: roundPosition(target),
      builtAtTick: Math.max(0, Math.floor(Number(entity?._runtimeOwner?.tick) || 0))
    });
    recordNavigationRouteStat(cache, 'flowFailures', 1);
    return {
      nodes: [],
      cacheKey,
      cacheHit: fromQueue,
      failureReason: !flow?.reachable ? 'unreachable-flow' : 'empty-flow-route'
    };
  }

  cache.routes.set(cacheKey, {
    routeState: 'ready',
    flow,
    target: roundPosition(target),
    builtAtTick: Math.max(0, Math.floor(Number(entity?._runtimeOwner?.tick) || 0))
  });
  return {
    nodes,
    cacheKey,
    cacheHit: fromQueue
  };
}

function getRouteFailureCooldownTicks(failureCount) {
  const count = Math.max(1, Math.floor(Number(failureCount) || 1));
  return Math.min(
    MOVEMENT_MODEL.failedRouteMaxCooldownTicks,
    MOVEMENT_MODEL.failedRouteBaseCooldownTicks * count
  );
}

function recordNavigationRouteStat(cache, key, amount) {
  cache.stats = cache.stats ?? {};
  cache.stats[key] = round3((cache.stats[key] ?? 0) + amount);
}

function createSharedMovementRouteKey({ mapSignature, sourceSignature, target, routeMode }) {
  return [
    mapSignature,
    routeMode ?? 'auto',
    sourceSignature,
    round3(target.x),
    round3(target.y)
  ].join(':');
}

function buildDirectMovementRoute(map, anchors, game = null, factionId = null) {
  const cleanAnchors = normaliseMovementOrderPath(anchors);
  if (cleanAnchors.length < 2) {
    return null;
  }
  const nodes = [roundPosition(cleanAnchors[0])];
  for (let index = 1; index < cleanAnchors.length; index += 1) {
    const segment = buildDirectMovementSegment(map, cleanAnchors[index - 1], cleanAnchors[index], game, factionId);
    if (!segment) {
      return null;
    }
    segment.slice(1).forEach((node) => {
      const previous = nodes[nodes.length - 1];
      if (!previous || tileDistance(previous, node) >= 0.001) {
        nodes.push(node);
      }
    });
  }
  return normaliseRuntimeMovementPathNodes(nodes);
}

function buildDirectMovementSegment(map, from, to, game = null, factionId = null) {
  const startTile = positionToTile(map, from);
  const targetTile = positionToTile(map, to);
  const dx = targetTile.x - startTile.x;
  const dy = targetTile.y - startTile.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) {
    return [roundPosition(from), roundPosition(to)];
  }

  let previousTile = startTile;
  const nodes = [roundPosition(from)];
  const visited = new Set([tileKey(startTile)]);
  for (let step = 1; step <= steps; step += 1) {
    const tile = {
      x: Math.round(startTile.x + (dx * step) / steps),
      y: Math.round(startTile.y + (dy * step) / steps)
    };
    const key = tileKey(tile);
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (!canTraverseTileStep(map, previousTile, tile, game, factionId, { allowTile: startTile })) {
      return null;
    }
    nodes.push(tileToPosition(tile));
    previousTile = tile;
  }
  const finalNode = roundPosition(to);
  if (tileDistance(nodes[nodes.length - 1], finalNode) >= 0.001) {
    nodes.push(finalNode);
  }
  return nodes;
}

function claimNavigationFlowBuildBudget(game, routeMode = null) {
  if (!game) {
    return true;
  }
  const hasExplicitBudget = Number.isFinite(Number(game.performanceBudgets?.navigationFlowBuildsPerTick));
  if (routeMode === 'player-intended' && !hasExplicitBudget) {
    return true;
  }
  const tick = Math.max(0, Math.floor(Number(game.tick) || 0));
  const budget = Math.max(0, Math.floor(hasExplicitBudget ? Number(game.performanceBudgets.navigationFlowBuildsPerTick) : MOVEMENT_MODEL.navigationFlowBuildBudgetPerTick));
  if (budget <= 0) {
    return false;
  }
  const existing = game._runtimeCache?.navigationFlowBudget;
  if (existing?.tick === tick) {
    if (existing.used >= budget) {
      return false;
    }
    existing.used += 1;
    return true;
  }
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    navigationFlowBudget: { tick, budget, used: 1 }
  };
  return true;
}

function createMovementSourceSignature(entity, target = null) {
  const order = normaliseMovementOrder(entity.movementOrder);
  if (order) {
    return `${entity.factionId}:${order.routeMode}:${pathSignature(order.path.slice(1))}`;
  }
  const stance = entity.behavior?.stance ?? 'probe';
  const targetSignature = target ? `${round3(target.x)},${round3(target.y)}` : 'no-target';
  return `ai:${entity.type}:${entity.factionId}:${stance}:${targetSignature}`;
}

function pathSignature(path) {
  return path.map((point) => `${round3(point.x)},${round3(point.y)}`).join('|');
}

function entityPathMapSignature(map) {
  return map.mapRef?.tileSignature ?? `${map.width}x${map.height}:${map.tiles.map((row) => row.join(',')).join('|')}`;
}

function getMovementBlockedCache(game, map) {
  if (!game || !map) {
    return null;
  }
  const cacheKey = [
    map.width,
    map.height,
    Math.max(0, Number(map.revision) || 0, Number(game.versions?.map) || 0),
    Math.max(0, Number(game.versions?.nav) || 0),
    createCorpseBlockerSignature(game)
  ].join(':');
  const existing = game._runtimeCache?.movementBlocked;
  if (existing?.key === cacheKey && existing.blockedByTile instanceof Map) {
    return existing;
  }
  const nextCache = {
    key: cacheKey,
    blockedByTile: new Map()
  };
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    movementBlocked: nextCache
  };
  return nextCache;
}

function createMovementBlockedCacheEntryKey(tile, factionId = null) {
  return `${Math.round(Number(tile?.x) || 0)},${Math.round(Number(tile?.y) || 0)}:${factionId ?? 'any'}`;
}


function normaliseRouteState(routeState, blocked = false) {
  if (['pending', 'ready', 'failed', 'stale'].includes(routeState)) {
    return routeState;
  }
  return blocked ? 'failed' : 'ready';
}

function normalisePosition(position, fallbackTile) {
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return roundPosition(position);
  }
  return tileToPosition(fallbackTile);
}

function stabilizePath(path) {
  const deduped = [];
  path.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || tileDistance(previous, point) >= 0.5) {
      deduped.push(point);
    }
  });
  if (deduped.length <= 2) {
    return deduped;
  }
  return deduped.map((point, index) => {
    if (index === 0 || index === deduped.length - 1) {
      return point;
    }
    const previous = deduped[index - 1];
    const next = deduped[index + 1];
    return roundPosition({
      x: previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
      y: previous.y * 0.25 + point.y * 0.5 + next.y * 0.25
    });
  });
}

function isMeaningfulOrderPoint(position, point) {
  return tileDistance(position, point) > MOVEMENT_MODEL.arrivalDistanceTiles * 2.5;
}

function tileToPosition(tile) {
  return {
    x: Number.isFinite(tile?.x) ? tile.x : 0,
    y: Number.isFinite(tile?.y) ? tile.y : 0
  };
}

function roundPosition(position) {
  return {
    x: round3(position.x),
    y: round3(position.y)
  };
}

function positionToTile(map, position) {
  return {
    x: clamp(0, map.width - 1, Math.round(position.x)),
    y: clamp(0, map.height - 1, Math.round(position.y))
  };
}

function clampToMapPosition(map, position) {
  return {
    x: clamp(0, map.width - 1, position.x),
    y: clamp(0, map.height - 1, position.y)
  };
}

function movePositionTowards(position, target, distance) {
  const fullDistance = tileDistance(position, target);
  if (fullDistance <= 0 || distance <= 0) {
    return roundPosition(position);
  }
  const ratio = Math.min(1, distance / fullDistance);
  return roundPosition({
    x: position.x + (target.x - position.x) * ratio,
    y: position.y + (target.y - position.y) * ratio
  });
}

function tileDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tileKey(tile) {
  return `${tile.x},${tile.y}`;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}
