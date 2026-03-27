import { getTileType, TILE_TYPES } from '../world/tilemap.js';
import { createTileAddress } from '../world/coordinates.js';

export const BUILDER_SPAWNER_TYPE = 'builder-spawner';
export const BUILDER_SPAWNER_DEFAULT_CAP = 1;
export const BUILDER_SPAWNER_DEFAULT_COOLDOWN_CYCLES = 3;

const ACTIVE_TASK_STATUSES = new Set(['queued', 'in_progress', 'blocked']);
const BUILDER_SPAWN_OFFSETS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export function createBuilderSpawnerState(overrides = {}) {
  return {
    spawnCap: Number.isFinite(Number(overrides.spawnCap)) ? Math.max(1, Math.round(Number(overrides.spawnCap))) : BUILDER_SPAWNER_DEFAULT_CAP,
    cooldownCycles: Number.isFinite(Number(overrides.cooldownCycles))
      ? Math.max(1, Math.round(Number(overrides.cooldownCycles)))
      : BUILDER_SPAWNER_DEFAULT_COOLDOWN_CYCLES,
    cooldownRemaining: Number.isFinite(Number(overrides.cooldownRemaining)) ? Math.max(0, Math.round(Number(overrides.cooldownRemaining))) : 0,
    activeBuilderIds: Array.isArray(overrides.activeBuilderIds) ? [...new Set(overrides.activeBuilderIds.filter(Boolean))] : [],
    lastSpawnedCycle: Number.isFinite(Number(overrides.lastSpawnedCycle)) ? Math.round(Number(overrides.lastSpawnedCycle)) : null,
  };
}

export function isBuilderSpawner(building) {
  return String(building?.type || '').trim() === BUILDER_SPAWNER_TYPE;
}

export function ensureBuilderSpawnerState(building) {
  if (!isBuilderSpawner(building)) {
    return null;
  }

  building.spawner = createBuilderSpawnerState(building.spawner || {});
  return building.spawner;
}

export function getBuilderUnitsForSpawner(state, spawnerId) {
  const targetId = String(spawnerId || '').trim();
  if (!targetId) {
    return [];
  }

  return (state?.store?.units || []).filter((unit) =>
    unit?.type === 'worker'
    && String(unit?.role || '').trim() === 'builder'
    && String(unit?.spawnedBySpawnerId || '').trim() === targetId
  );
}

export function syncBuilderSpawnerState(state, building) {
  const spawner = ensureBuilderSpawnerState(building);
  if (!spawner) {
    return null;
  }

  spawner.activeBuilderIds = getBuilderUnitsForSpawner(state, building.id).map((unit) => unit.id);
  spawner.cooldownRemaining = Math.max(0, Math.round(Number(spawner.cooldownRemaining || 0)));
  return spawner;
}

export function getPendingSpawnerTasks(state, spawnerId) {
  const targetId = String(spawnerId || '').trim();
  if (!targetId) {
    return [];
  }

  const actors = [state?.store?.agent, ...((state?.store?.units || []))].filter(Boolean);
  return actors
    .flatMap((actor) => [actor.currentTask, ...(actor.taskQueue || [])])
    .filter((task) =>
      task
      && task.type === 'spawnUnit'
      && task.payload?.source === 'builder-spawner'
      && String(task.payload?.spawnerId || '').trim() === targetId
      && ACTIVE_TASK_STATUSES.has(task.status)
    );
}

export function resolveBuilderSpawnTile(state, building) {
  if (!isBuilderSpawner(building)) {
    return null;
  }

  return BUILDER_SPAWN_OFFSETS
    .map((offset) => createTileAddress({ x: building.x + offset.x, y: building.y + offset.y }))
    .find((tile) => canBuilderSpawnAtTile(state, tile.x, tile.y)) || null;
}

export function getBuilderSpawnerActivation(state, building) {
  if (!isBuilderSpawner(building)) {
    return {
      ok: false,
      status: 'invalid',
      reason: 'Selected building is not a builder spawner.',
      activeBuilders: [],
      pendingTasks: [],
      cooldownRemaining: 0,
      spawnCap: BUILDER_SPAWNER_DEFAULT_CAP,
      spawnTile: null,
    };
  }

  const spawner = syncBuilderSpawnerState(state, building);
  const activeBuilders = getBuilderUnitsForSpawner(state, building.id);
  const pendingTasks = getPendingSpawnerTasks(state, building.id);
  const spawnTile = resolveBuilderSpawnTile(state, building);

  if (activeBuilders.length >= spawner.spawnCap) {
    return {
      ok: false,
      status: 'cap',
      reason: 'Builder cap reached for this spawner.',
      activeBuilders,
      pendingTasks,
      cooldownRemaining: spawner.cooldownRemaining,
      spawnCap: spawner.spawnCap,
      spawnTile,
    };
  }

  if (pendingTasks.length > 0) {
    return {
      ok: false,
      status: 'pending',
      reason: 'Builder spawn already queued for this spawner.',
      activeBuilders,
      pendingTasks,
      cooldownRemaining: spawner.cooldownRemaining,
      spawnCap: spawner.spawnCap,
      spawnTile,
    };
  }

  if (spawner.cooldownRemaining > 0) {
    return {
      ok: false,
      status: 'cooldown',
      reason: `Spawner cooldown active for ${spawner.cooldownRemaining} more cycle(s).`,
      activeBuilders,
      pendingTasks,
      cooldownRemaining: spawner.cooldownRemaining,
      spawnCap: spawner.spawnCap,
      spawnTile,
    };
  }

  if (!spawnTile) {
    return {
      ok: false,
      status: 'occupied',
      reason: 'No free adjacent tile is available for a builder spawn.',
      activeBuilders,
      pendingTasks,
      cooldownRemaining: spawner.cooldownRemaining,
      spawnCap: spawner.spawnCap,
      spawnTile: null,
    };
  }

  return {
    ok: true,
    status: 'ready',
    reason: 'Spawner ready.',
    activeBuilders,
    pendingTasks,
    cooldownRemaining: spawner.cooldownRemaining,
    spawnCap: spawner.spawnCap,
    spawnTile,
  };
}

export function getBuilderSpawnerSummary(state, building) {
  const activation = getBuilderSpawnerActivation(state, building);
  return {
    ...activation,
    activeCount: activation.activeBuilders.length,
    pendingCount: activation.pendingTasks.length,
  };
}

export function advanceBuilderSpawnerCooldowns(state) {
  (state?.store?.buildings || []).forEach((building) => {
    if (!isBuilderSpawner(building)) {
      return;
    }

    const spawner = syncBuilderSpawnerState(state, building);
    if (spawner.cooldownRemaining > 0) {
      spawner.cooldownRemaining -= 1;
    }
  });
}

export function registerSpawnedBuilder(state, spawnerId, unit, resolveCycle = null) {
  const targetId = String(spawnerId || '').trim();
  if (!targetId || !unit) {
    return { ok: false, error: 'Spawner id and unit are required.' };
  }

  const building = (state?.store?.buildings || []).find((entry) => entry?.id === targetId);
  if (!building || !isBuilderSpawner(building)) {
    return { ok: false, error: 'Builder spawner not found.' };
  }

  const spawner = syncBuilderSpawnerState(state, building);
  unit.role = 'builder';
  unit.spawnedBySpawnerId = building.id;
  spawner.activeBuilderIds = [...new Set([...spawner.activeBuilderIds, unit.id])];
  spawner.cooldownRemaining = spawner.cooldownCycles;
  spawner.lastSpawnedCycle = Number.isFinite(Number(resolveCycle)) ? Math.round(Number(resolveCycle)) : spawner.lastSpawnedCycle;

  return { ok: true, building, unit, spawner };
}

function canBuilderSpawnAtTile(state, x, y) {
  const tileType = getTileType(state?.map, x, y);
  if (!tileType || !TILE_TYPES[tileType]?.walkable) {
    return false;
  }

  if ((state?.store?.buildings || []).some((building) => building.x === x && building.y === y)) {
    return false;
  }

  if ((state?.store?.units || []).some((unit) => unit.x === x && unit.y === y)) {
    return false;
  }

  if (state?.store?.agent?.x === x && state?.store?.agent?.y === y) {
    return false;
  }

  return true;
}
