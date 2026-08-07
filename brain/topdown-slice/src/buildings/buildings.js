import { TILE_TYPES, getTileType } from '../world/tilemap.js';
import { createTileAddress, withWorldPosition } from '../world/coordinates.js';
import { nextEntityId } from '../entities/entityStore.js';
import { BUILDER_SPAWNER_TYPE, createBuilderSpawnerState, isBuilderSpawner } from './builderSpawner.js';

export const BUILDING_TYPES = {
  house: { color: '#d88954', buildRequired: 6 },
  workshop: { color: '#ad58cc', buildRequired: 8 },
  [BUILDER_SPAWNER_TYPE]: { color: '#f0a54a', buildRequired: 6 },
  relay: { color: '#4cc9a6', buildRequired: 5 }
};

export const BUILDING_STATE = {
  UNDER_CONSTRUCTION: 'under_construction',
  COMPLETE: 'complete'
};

export function canPlaceBuilding(store, map, input, y) {
  const tile = createTileAddress(input, y);
  const tileType = getTileType(map, tile);
  if (!tileType) {
    return { ok: false, error: 'Tile out of bounds.' };
  }
  if (!TILE_TYPES[tileType].buildable) {
    return { ok: false, error: `Cannot place building on ${tileType}.` };
  }

  const occupied = store.buildings.some((b) => b.x === tile.x && b.y === tile.y);
  if (occupied) {
    return { ok: false, error: 'Tile is already occupied by another building.' };
  }

  return { ok: true };
}

export function placeBuilding(store, map, {
  type,
  x,
  y,
  z = 0,
  position = null,
  name,
  state = BUILDING_STATE.COMPLETE,
  buildProgress = 0,
  buildRequired,
  builderActorId = null,
  startedAt = null
}) {
  const tile = createTileAddress(position ?? { x, y, z });
  const placement = canPlaceBuilding(store, map, tile);
  if (!placement.ok) {
    return placement;
  }

  const required = buildRequired ?? BUILDING_TYPES[type]?.buildRequired ?? 6;
  const building = withWorldPosition({
    id: nextEntityId(store, 'building'),
    type,
    name: name ?? `${type} ${store.counters.building - 1}`,
    owner: 'player',
    state,
    buildProgress,
    buildRequired: required,
    builderActorId,
    startedAt,
    completedAt: state === BUILDING_STATE.COMPLETE ? new Date().toISOString() : null,
    ...(type === BUILDER_SPAWNER_TYPE ? { spawner: createBuilderSpawnerState() } : {}),
  }, position ?? { x: tile.x, y: tile.y, z });

  store.buildings.push(building);
  return { ok: true, building };
}

export function updateBuilding(store, id, updates) {
  const building = store.buildings.find((b) => b.id === id);
  if (!building) {
    return { ok: false, error: `Building ${id} not found.` };
  }

  Object.assign(building, updates);
  if (isBuilderSpawner(building)) {
    building.spawner = createBuilderSpawnerState(building.spawner || {});
  } else if (building.spawner) {
    delete building.spawner;
  }
  return { ok: true, building };
}

export function removeBuilding(store, id) {
  const index = store.buildings.findIndex((b) => b.id === id);
  if (index === -1) {
    return { ok: false, error: `Building ${id} not found.` };
  }

  store.buildings.splice(index, 1);
  return { ok: true };
}

export function findRechargeRelayInRange(store, actor, range = 1) {
  return store.buildings.find((building) =>
    building.type === 'relay'
    && building.state === BUILDING_STATE.COMPLETE
    && Math.abs(building.x - actor.x) + Math.abs(building.y - actor.y) <= range
  ) ?? null;
}
