import { createCellAddress, createTileAddress, GROUND_Z } from './coordinates.js';

export const TILE_SIZE = 32;

export const TILE_TYPES = {
  grass: { color: '#4f8c3f', walkable: true, buildable: true },
  water: { color: '#2f5e9e', walkable: false, buildable: false },
  stone: { color: '#6b6f77', walkable: true, buildable: true }
};

export function createTilemap() {
  const width = 25;
  const height = 18;
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if ((x > 8 && x < 14 && y > 4 && y < 10) || (x === 2 && y > 11)) {
        return 'water';
      }
      if ((x + y) % 9 === 0) {
        return 'stone';
      }
      return 'grass';
    })
  );
  const elevation = Array.from({ length: height }, () => Array.from({ length: width }, () => GROUND_Z));

  return {
    width,
    height,
    tiles,
    elevation,
    bounds: {
      minZ: GROUND_Z,
      maxZ: GROUND_Z
    }
  };
}

export function isTileAddressInBounds(map, input, y) {
  const tile = createTileAddress(input, y);
  return tile.x >= 0 && tile.y >= 0 && tile.x < map.width && tile.y < map.height;
}

export function isCellAddressInBounds(map, input, y, z) {
  const cell = createCellAddress(input, y, z);
  const minZ = Number(map?.bounds?.minZ ?? GROUND_Z);
  const maxZ = Number(map?.bounds?.maxZ ?? GROUND_Z);

  return isTileAddressInBounds(map, cell) && cell.z >= minZ && cell.z <= maxZ;
}

export function getTileType(map, input, y) {
  const tile = createTileAddress(input, y);
  if (!isTileAddressInBounds(map, tile)) {
    return null;
  }

  return map.tiles[tile.y][tile.x];
}

export function getTileElevation(map, input, y) {
  const tile = createTileAddress(input, y);
  if (!isTileAddressInBounds(map, tile)) {
    return null;
  }

  return Number(map.elevation?.[tile.y]?.[tile.x] ?? GROUND_Z);
}

export function getGroundCellAddress(map, input, y) {
  const tile = createTileAddress(input, y);
  if (!isTileAddressInBounds(map, tile)) {
    return null;
  }

  return createCellAddress(tile.x, tile.y, getTileElevation(map, tile));
}
