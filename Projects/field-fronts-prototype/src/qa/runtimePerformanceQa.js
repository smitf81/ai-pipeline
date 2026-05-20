import { summarizeCollisionAuthority } from '../game/collisionAuthority.js';
import { summarizeConstruction } from '../game/gameModel.js';
import { summarizeStructureTopology } from '../game/structureTopology.js';

export function createFixedStepProbe({
  tickIntervalMs = 750,
  maxFrameDeltaMs = 100,
  maxTicksPerFrame = 1
} = {}) {
  return {
    tickIntervalMs: positiveNumber(tickIntervalMs, 750),
    maxFrameDeltaMs: positiveNumber(maxFrameDeltaMs, 100),
    maxTicksPerFrame: Math.max(1, Math.floor(Number(maxTicksPerFrame) || 1)),
    accumulatorMs: 0,
    totalTicks: 0
  };
}

export function advanceFixedStepProbe(probe, deltaMs) {
  const frameDeltaMs = Math.min(probe.maxFrameDeltaMs, Math.max(0, Number(deltaMs) || 0));
  probe.accumulatorMs += frameDeltaMs;
  let ticksThisFrame = 0;

  while (probe.accumulatorMs >= probe.tickIntervalMs && ticksThisFrame < probe.maxTicksPerFrame) {
    probe.accumulatorMs -= probe.tickIntervalMs;
    ticksThisFrame += 1;
    probe.totalTicks += 1;
  }

  if (ticksThisFrame >= probe.maxTicksPerFrame) {
    probe.accumulatorMs = Math.min(probe.accumulatorMs, probe.tickIntervalMs);
  }

  return {
    frameDeltaMs,
    ticksThisFrame,
    accumulatorRemainderMs: probe.accumulatorMs,
    interpolationAlpha: probe.accumulatorMs / probe.tickIntervalMs,
    totalTicks: probe.totalTicks
  };
}

export function cloneSquadHorde(seedSquad, {
  count = 500,
  columns = 40,
  start = { x: 4, y: 4 },
  spacing = { x: 0.32, y: 0.32 },
  factionId = 'player',
  target = null
} = {}) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const safeColumns = Math.max(1, Math.floor(Number(columns) || 1));

  return Array.from({ length: total }, (_, index) => {
    const row = Math.floor(index / safeColumns);
    const column = index % safeColumns;
    const position = {
      x: start.x + column * spacing.x,
      y: start.y + row * spacing.y
    };

    return {
      ...structuredClone(seedSquad),
      id: `qa_${factionId}_squad_${String(index + 1).padStart(4, '0')}`,
      factionId,
      name: `QA ${factionId} squad ${index + 1}`,
      tile: {
        x: Math.round(position.x),
        y: Math.round(position.y)
      },
      position,
      movement: {
        status: 'idle',
        target: null,
        waypoint: null,
        lastStepTiles: 0,
        speedKph: 0
      },
      movementPath: null,
      movementOrder: target
        ? {
          type: 'path-hold',
          routeMode: 'player-intended',
          path: [position, target],
          target,
          issuedAtTick: 0
        }
        : null,
      behavior: {
        ...seedSquad.behavior,
        controller: factionId === 'player' ? 'player' : 'ai',
        stance: 'commit',
        intent: target ? 'path-hold-objective' : 'contest-objective'
      }
    };
  });
}

export function measureGameTickProbe({ game, map, advanceTick, ticks = 1 }) {
  const startedAt = performance.now();
  const startTick = game.tick;
  const startPositions = snapshotEntityPositions(game);
  const tickCount = Math.max(0, Math.floor(Number(ticks) || 0));

  for (let index = 0; index < tickCount; index += 1) {
    advanceTick(game, map);
  }

  const elapsedMs = performance.now() - startedAt;
  const endPositions = snapshotEntityPositions(game);
  const pathStats = collectMovementPathStats(game);
  const collision = summarizeCollisionAuthority(game);

  return {
    requestedTicks: tickCount,
    ticksAdvanced: game.tick - startTick,
    elapsedMs: round3(elapsedMs),
    estimatedTps: elapsedMs > 0 ? round3((game.tick - startTick) / (elapsedMs / 1000)) : null,
    entities: {
      leaders: game.leaders?.length ?? 0,
      squads: game.squads?.length ?? 0,
      moving: countMovedEntities(startPositions, endPositions)
    },
    collision,
    pathfinding: pathStats
  };
}

export function createSpatialCullingProbe(entities, viewport) {
  const visible = [];
  const offscreen = [];

  for (const entity of entities) {
    const position = entity.position ?? entity.tile;
    if (isInRect(position, viewport)) {
      visible.push(entity);
    } else {
      offscreen.push(entity);
    }
  }

  return {
    total: entities.length,
    visible: visible.length,
    offscreen: offscreen.length,
    culledRatio: entities.length > 0 ? round3(offscreen.length / entities.length) : 0
  };
}

export function createStructureTopologyProbe(game) {
  return {
    testType: 'runtime-structure-topology',
    ...summarizeStructureTopology(game),
    construction: summarizeConstruction(game)
  };
}

export function buildRuntimeQaReport({
  cadence,
  detachment,
  horde,
  chokepoint,
  spatial,
  structureTopology,
  renderer
}) {
  const findings = [];

  if (!cadence?.fixedTickCap) {
    findings.push(finding('high', 'missing_fixed_tick_cap', 'The render loop does not prove a one-tick-per-frame catch-up cap.', 'Keep MAX_TICKS_PER_FRAME at 1 or add a deterministic replay-only exception with its own tests.'));
  }
  if (!cadence?.remainderAlpha) {
    findings.push(finding('medium', 'missing_accumulator_remainder', 'The accumulator remainder is not available for smoothing/interpolation math.', 'Expose the remainder or alpha as runtime diagnostics so jitter can be verified without browser guesswork.'));
  }
  if (!detachment?.visualSeparateFromLogical) {
    findings.push(finding('high', 'visual_transform_not_detached', 'Visual interpolation appears to mutate or alias authoritative entity position.', 'Keep renderMotion leaderPositions separate from game leaders/squads and assert no shared references.'));
  }
  const hordeElapsedMs = horde?.projectedElapsedMs ?? horde?.elapsedMs ?? 0;
  if (horde?.entities?.squads >= 500 && hordeElapsedMs > 80) {
    findings.push(finding('medium', 'horde_tick_cost_warning', `A ${horde.entities.squads}-squad tick is projected at ${hordeElapsedMs}ms in-process from a ${horde.entities.sampledSquads ?? horde.entities.squads}-squad sample.`, 'Profile field recompute and movement path caching; keep this below one simulation interval budget before adding more units.'));
  }
  const projectedChokepointPaths = chokepoint?.pathfinding?.projectedNewPathsBuilt ?? chokepoint?.pathfinding?.newPathsBuilt ?? 0;
  if (projectedChokepointPaths >= 500) {
    findings.push(finding('high', 'pathfinding_unbounded_chokepoint_batch', `${projectedChokepointPaths} movement paths are projected to build in one simulation tick for a shared chokepoint target.`, 'Introduce a path request queue, per-tick budget, shared flow field, or cached group route for mass orders.'));
  }
  const hordeSeparationChecks = horde?.collision?.softSeparationChecks ?? 0;
  const hordeBodies = Math.max(1, horde?.collision?.collisionBodies ?? horde?.entities?.sampledSquads ?? horde?.entities?.squads ?? 1);
  if (hordeSeparationChecks > hordeBodies * 24) {
    findings.push(finding('high', 'soft_collision_unbounded_horde_checks', `${hordeSeparationChecks} soft separation checks were recorded for ${hordeBodies} collision bodies.`, 'Keep unit collision spatially bucketed and local; avoid all-unit pair scans.'));
  }
  const chokepointSeparationChecks = chokepoint?.collision?.softSeparationChecks ?? 0;
  const chokepointBodies = Math.max(1, chokepoint?.collision?.collisionBodies ?? chokepoint?.pathfinding?.sampledUnits ?? chokepoint?.entities?.squads ?? 1);
  if (chokepointSeparationChecks > chokepointBodies * 28) {
    findings.push(finding('high', 'soft_collision_unbounded_chokepoint_checks', `${chokepointSeparationChecks} soft separation checks were recorded for ${chokepointBodies} chokepoint collision bodies.`, 'Keep chokepoint collision resolution local to neighbouring buckets.'));
  }
  if (spatial?.offscreen > 0 && !renderer?.hasViewportCulling) {
    findings.push(finding('medium', 'spatial_culling_not_render_bound', `${spatial.offscreen} entities are outside the probe viewport, but renderer code has no explicit entity viewport culling gate.`, 'Cull off-screen squads/leaders before expensive draw and path debug work when camera/zoom support expands.'));
  }

  return {
    status: findings.some((entry) => entry.severity === 'high') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
    generatedAt: new Date().toISOString(),
    summary: {
      high: findings.filter((entry) => entry.severity === 'high').length,
      medium: findings.filter((entry) => entry.severity === 'medium').length,
      low: findings.filter((entry) => entry.severity === 'low').length
    },
    metrics: {
      cadence,
      detachment,
      horde,
      chokepoint,
      spatial,
      structureTopology,
      renderer
    },
    findings
  };
}

function collectMovementPathStats(game) {
  const entities = [...(game.leaders ?? []), ...(game.squads ?? [])];
  const withPath = entities.filter((entity) => entity.movementPath?.nodes?.length >= 2);
  const blocked = entities.filter((entity) => entity.movementPath?.blocked);
  const routeKeys = new Set(withPath.map((entity) => entity.movementPath?.routeCacheKey).filter(Boolean));
  const cacheHits = withPath.filter((entity) => entity.movementPath?.routeCacheHit).length;
  return {
    entities: entities.length,
    withPath: withPath.length,
    blocked: blocked.length,
    newPathsBuilt: withPath.filter((entity) => entity.movementPath?.routeCacheHit === false).length,
    routeCacheHits: cacheHits,
    uniqueRouteKeys: routeKeys.size,
    averageNodes: withPath.length > 0
      ? round3(withPath.reduce((sum, entity) => sum + entity.movementPath.nodes.length, 0) / withPath.length)
      : 0
  };
}

function snapshotEntityPositions(game) {
  return new Map([...game.leaders, ...(game.squads ?? [])].map((entity) => [
    entity.id,
    { x: entity.position?.x ?? entity.tile.x, y: entity.position?.y ?? entity.tile.y }
  ]));
}

function countMovedEntities(startPositions, endPositions) {
  let moved = 0;
  for (const [id, end] of endPositions.entries()) {
    const start = startPositions.get(id);
    if (!start) continue;
    if (Math.hypot(end.x - start.x, end.y - start.y) > 0.001) {
      moved += 1;
    }
  }
  return moved;
}

function isInRect(position, rect) {
  const x = Number(position?.x ?? 0);
  const y = Number(position?.y ?? 0);
  return x >= rect.x
    && x <= rect.x + rect.width
    && y >= rect.y
    && y <= rect.y + rect.height;
}

function finding(severity, code, message, action) {
  return { severity, code, message, action };
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
