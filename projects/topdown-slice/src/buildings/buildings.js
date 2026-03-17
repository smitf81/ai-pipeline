import { TILE_TYPES, getTileType } from '../world/tilemap.js';
import { nextEntityId } from '../entities/entityStore.js';

export const BUILDING_TYPES = {
  house: { color: '#d88954' },
  workshop: { color: '#ad58cc' }
};

export function canPlaceBuilding(store, map, x, y) {
  const tileType = getTileType(map, x, y);
  if (!tileType) {
    return { ok: false, error: 'Tile out of bounds.' };
  }
  if (!TILE_TYPES[tileType].buildable) {
    return { ok: false, error: `Cannot place building on ${tileType}.` };
  }

  const occupied = store.buildings.some((b) => b.x === x && b.y === y);
  if (occupied) {
    return { ok: false, error: 'Tile is already occupied by another building.' };
  }

  return { ok: true };
}

export function placeBuilding(store, map, { type, x, y, name }) {
  const placement = canPlaceBuilding(store, map, x, y);
  if (!placement.ok) {
    return placement;
  }

  const building = {
    id: nextEntityId(store, 'building'),
    type,
    x,
    y,
    name: name ?? `${type} ${store.counters.building - 1}`,
    owner: 'player'
  };

  store.buildings.push(building);
  return { ok: true, building };
}

export function updateBuilding(store, id, updates) {
  const building = store.buildings.find((b) => b.id === id);
  if (!building) {
    return { ok: false, error: `Building ${id} not found.` };
  }

  Object.assign(building, updates);
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
