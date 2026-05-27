export const DEFAULT_FIXED_STEP_MS = 1000 / 60;
export const DEFAULT_MAX_DELTA_MS = 100;

export function createFixedStepAccumulator({
  fixedStepMs = DEFAULT_FIXED_STEP_MS,
  maxDeltaMs = DEFAULT_MAX_DELTA_MS,
  nowMs = 0
} = {}) {
  return {
    fixedStepMs: sanitizePositiveNumber(fixedStepMs, DEFAULT_FIXED_STEP_MS),
    maxDeltaMs: sanitizePositiveNumber(maxDeltaMs, DEFAULT_MAX_DELTA_MS),
    lastTimeMs: Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0,
    accumulatorMs: 0,
    totalFixedSteps: 0,
    frameCount: 0
  };
}

export function advanceFixedStepAccumulator(clock, nowMs, {
  fixedUpdate = () => {},
  interpolate = () => {}
} = {}) {
  const nextTimeMs = Number(nowMs);
  const rawDeltaMs = Math.max(0, Number.isFinite(nextTimeMs) ? nextTimeMs - clock.lastTimeMs : 0);
  const frameDeltaMs = Math.min(rawDeltaMs, clock.maxDeltaMs);
  const fixedStepMs = clock.fixedStepMs;
  const fixedSteps = [];

  clock.lastTimeMs = Number.isFinite(nextTimeMs) ? nextTimeMs : clock.lastTimeMs;
  clock.accumulatorMs += frameDeltaMs;
  clock.frameCount += 1;

  while (clock.accumulatorMs + Number.EPSILON >= fixedStepMs) {
    fixedUpdate(fixedStepMs, {
      frameDeltaMs,
      stepIndex: fixedSteps.length,
      totalFixedSteps: clock.totalFixedSteps
    });
    fixedSteps.push(fixedStepMs);
    clock.totalFixedSteps += 1;
    clock.accumulatorMs = Math.max(0, clock.accumulatorMs - fixedStepMs);
  }

  const interpolationAlpha = Math.max(0, Math.min(1, clock.accumulatorMs / fixedStepMs));
  interpolate({
    frameDeltaMs,
    rawDeltaMs,
    fixedStepMs,
    fixedStepsThisFrame: fixedSteps.length,
    accumulatorRemainderMs: clock.accumulatorMs,
    interpolationAlpha
  });

  return {
    rawDeltaMs,
    frameDeltaMs,
    fixedStepMs,
    fixedStepsThisFrame: fixedSteps.length,
    accumulatorRemainderMs: clock.accumulatorMs,
    interpolationAlpha,
    totalFixedSteps: clock.totalFixedSteps
  };
}

export function createDetachedVisualTransform({
  collider = { x: 0, y: 0, z: 0 },
  visual = null
} = {}) {
  const colliderTransform = cloneVector(collider);
  return {
    collider: colliderTransform,
    visual: cloneVector(visual ?? colliderTransform),
    previousCollider: cloneVector(colliderTransform),
    nextCollider: cloneVector(colliderTransform)
  };
}

export function stepDetachedCollider(binding, nextCollider) {
  binding.previousCollider = cloneVector(binding.nextCollider);
  binding.nextCollider = cloneVector(nextCollider);
  binding.collider = cloneVector(nextCollider);
  return binding.collider;
}

export function interpolateDetachedVisual(binding, alpha) {
  const t = Math.max(0, Math.min(1, Number(alpha) || 0));
  binding.visual = {
    x: lerp(binding.previousCollider.x, binding.nextCollider.x, t),
    y: lerp(binding.previousCollider.y, binding.nextCollider.y, t),
    z: lerp(binding.previousCollider.z, binding.nextCollider.z, t)
  };
  return binding.visual;
}

export function createSpatialHashGrid({ cellSize = 32 } = {}) {
  const safeCellSize = sanitizePositiveNumber(cellSize, 32);
  const buckets = new Map();

  return {
    cellSize: safeCellSize,
    buckets,
    insert(entity) {
      const key = getBucketKey(entity.position ?? entity, safeCellSize);
      const bucket = buckets.get(key) ?? [];
      bucket.push(entity);
      buckets.set(key, bucket);
      return key;
    },
    queryRect(rect) {
      const minX = Math.floor(Number(rect.x ?? 0) / safeCellSize);
      const minY = Math.floor(Number(rect.y ?? 0) / safeCellSize);
      const maxX = Math.floor(Number((rect.x ?? 0) + (rect.width ?? 0)) / safeCellSize);
      const maxY = Math.floor(Number((rect.y ?? 0) + (rect.height ?? 0)) / safeCellSize);
      const results = [];

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          results.push(...(buckets.get(`${x},${y}`) ?? []));
        }
      }

      return results.filter((entity) => pointInRect(entity.position ?? entity, rect));
    }
  };
}

export function createMassUnitScenario({
  count = 500,
  columns = 50,
  spacing = 10,
  startX = 0,
  startY = 0,
  velocity = { x: 1, y: 0 }
} = {}) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const safeColumns = Math.max(1, Math.floor(Number(columns) || 1));
  return Array.from({ length: total }, (_, index) => ({
    id: `qa-unit-${String(index + 1).padStart(4, '0')}`,
    position: {
      x: startX + (index % safeColumns) * spacing,
      y: startY + Math.floor(index / safeColumns) * spacing,
      z: 0
    },
    velocity: { ...velocity },
    updateCount: 0
  }));
}

export function runMassEntityProbe(units, {
  frames = 60,
  fixedStepMs = DEFAULT_FIXED_STEP_MS,
  viewport = null,
  spatialGrid = null
} = {}) {
  const frameCount = Math.max(0, Math.floor(Number(frames) || 0));
  const dtSeconds = sanitizePositiveNumber(fixedStepMs, DEFAULT_FIXED_STEP_MS) / 1000;
  const grid = spatialGrid ?? createSpatialHashGrid();
  const metrics = {
    unitCount: units.length,
    frames: frameCount,
    visibleUpdates: 0,
    culledUpdates: 0,
    logicalUpdates: 0,
    simulatedSeconds: Number((frameCount * dtSeconds).toFixed(3)),
    estimatedFps: frameCount,
    estimatedTps: frameCount
  };

  for (const unit of units) {
    grid.insert(unit);
  }

  for (let frame = 0; frame < frameCount; frame += 1) {
    const visible = viewport ? new Set(grid.queryRect(viewport).map((unit) => unit.id)) : null;
    for (const unit of units) {
      metrics.logicalUpdates += 1;
      if (visible && !visible.has(unit.id)) {
        metrics.culledUpdates += 1;
        continue;
      }

      unit.position.x += unit.velocity.x * dtSeconds;
      unit.position.y += unit.velocity.y * dtSeconds;
      unit.updateCount += 1;
      metrics.visibleUpdates += 1;
    }
  }

  return metrics;
}

export function createChokepointPathRequests(units, target = { x: 0, y: 0 }) {
  return units.map((unit) => ({
    id: `path-${unit.id}`,
    unitId: unit.id,
    from: cloneVector(unit.position),
    target: cloneVector(target),
    status: 'queued'
  }));
}

export function processPathfindingBudget(requests, {
  maxRequestsPerTick = 32,
  ticks = 1,
  pathfinder = defaultPathfinder
} = {}) {
  const maxPerTick = Math.max(0, Math.floor(Number(maxRequestsPerTick) || 0));
  const tickCount = Math.max(0, Math.floor(Number(ticks) || 0));
  const pending = [...requests];
  const batches = [];
  let processed = 0;

  for (let tick = 0; tick < tickCount && pending.length > 0; tick += 1) {
    const batch = pending.splice(0, maxPerTick);
    batch.forEach((request) => {
      request.status = 'done';
      request.path = pathfinder(request.from, request.target);
    });
    processed += batch.length;
    batches.push(batch.length);
  }

  return {
    queued: requests.length,
    processed,
    deferred: pending.length,
    maxBatch: batches.length > 0 ? Math.max(...batches) : 0,
    batches
  };
}

export function buildRuntimePerformanceReport({
  cadence = null,
  massEntity = null,
  pathfinding = null,
  spatial = null,
  thresholds = {}
} = {}) {
  const findings = [];

  if (cadence && cadence.fixedStepsThisFrame > Number(thresholds.maxFixedStepsPerFrame ?? 5)) {
    findings.push({
      severity: 'high',
      code: 'fixed_step_spiral_risk',
      message: 'Fixed simulation performed too many catch-up steps in one render frame.',
      action: 'Clamp frame delta lower, cap catch-up steps, or degrade non-critical simulation lanes first.'
    });
  }

  if (massEntity && massEntity.unitCount >= 500 && massEntity.culledUpdates === 0) {
    findings.push({
      severity: 'medium',
      code: 'mass_entity_no_culling',
      message: 'Mass-entity scenario updated every unit visually with no culling evidence.',
      action: 'Route visual/expensive updates through a spatial partition and viewport query.'
    });
  }

  if (pathfinding && pathfinding.deferred === 0 && pathfinding.queued >= 500) {
    findings.push({
      severity: 'medium',
      code: 'pathfinding_unbounded_batch',
      message: 'Chokepoint path requests all completed in one batch.',
      action: 'Budget pathfinding requests across ticks or move large batches to a worker/background lane.'
    });
  }

  if (spatial && spatial.offscreenUpdated > 0) {
    findings.push({
      severity: 'high',
      code: 'offscreen_update_leak',
      message: 'Off-screen units received visual updates despite spatial culling.',
      action: 'Check query bounds, bucket assignment, and visual update call sites.'
    });
  }

  return {
    status: findings.some((finding) => finding.severity === 'high')
      ? 'fail'
      : findings.length > 0
        ? 'warn'
        : 'pass',
    generatedAt: 'deterministic-test-run',
    metrics: {
      cadence,
      massEntity,
      pathfinding,
      spatial
    },
    findings
  };
}

function defaultPathfinder(from, target) {
  return [cloneVector(from), cloneVector(target)];
}

function sanitizePositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function cloneVector(value = {}) {
  return {
    x: Number(value.x ?? 0),
    y: Number(value.y ?? 0),
    z: Number(value.z ?? 0)
  };
}

function lerp(left, right, alpha) {
  return left + (right - left) * alpha;
}

function getBucketKey(position, cellSize) {
  return `${Math.floor(Number(position.x ?? 0) / cellSize)},${Math.floor(Number(position.y ?? 0) / cellSize)}`;
}

function pointInRect(position, rect) {
  const x = Number(position.x ?? 0);
  const y = Number(position.y ?? 0);
  const left = Number(rect.x ?? 0);
  const top = Number(rect.y ?? 0);
  const right = left + Number(rect.width ?? 0);
  const bottom = top + Number(rect.height ?? 0);
  return x >= left && x <= right && y >= top && y <= bottom;
}
