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

  return { width, height, tiles };
}

export function getTileType(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return null;
  }
  return map.tiles[y][x];
}
