import * as THREE from 'three';

export const TERRAIN_BLEND_MASK_CONTRACT = 'black-sky-bound.organic-terrain-contour-mask.v2';
export const TERRAIN_BLEND_MASK_PIXELS_PER_TILE = 8;

const FIELD_RADIUS_TILES = 2;
const DIRECTIONS = Object.freeze([
  { x: 0, y: -1, tangentX: 1, tangentY: 0, key: 11 },
  { x: 1, y: 0, tangentX: 0, tangentY: 1, key: 23 },
  { x: 0, y: 1, tangentX: 1, tangentY: 0, key: 37 },
  { x: -1, y: 0, tangentX: 0, tangentY: 1, key: 53 }
]);

export function createTerrainBlendMask(terrain, layerByType, options = {}) {
  const mapWidth = Number(terrain?.mapWidth ?? 0);
  const mapHeight = Number(terrain?.mapHeight ?? 0);
  if (!Number.isInteger(mapWidth) || !Number.isInteger(mapHeight) || mapWidth <= 0 || mapHeight <= 0) {
    throw new Error(`terrain_blend_mask_dimensions_invalid:${mapWidth}x${mapHeight}`);
  }
  const pixelsPerTile = options.pixelsPerTile ?? TERRAIN_BLEND_MASK_PIXELS_PER_TILE;
  const width = mapWidth * pixelsPerTile;
  const height = mapHeight * pixelsPerTile;
  const grid = Array.from({ length: mapHeight }, () => Array.from({ length: mapWidth }, () => null));
  for (const tile of terrain.tiles ?? []) grid[tile.y][tile.x] = tile;
  const context = createFieldContext(grid, mapWidth, mapHeight, layerByType, terrain.mapId);
  const data = new Uint8Array(width * height * 4);
  let blendedPixels = 0;
  let targetPixels = 0;
  let contourDisplacedPixels = 0;

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const tileX = (px + 0.5) / pixelsPerTile;
      const tileY = (py + 0.5) / pixelsPerTile;
      const weights = sampleOrganicLayerWeights(context, tileX, tileY);
      const offset = (py * width + px) * 4;
      data[offset] = byte(weights[0] * 255);
      data[offset + 1] = byte(weights[1] * 255);
      data[offset + 2] = byte(weights[2] * 255);
      data[offset + 3] = byte(Math.min(1, weights[0] + weights[1] + weights[2]) * 255);
      const active = weights.filter((value) => value > 0.04).length;
      if (active > 1) blendedPixels += 1;
      if (active > 0) targetPixels += 1;
      const authoredLayer = layerByType.get(grid[Math.floor(tileY)]?.[Math.floor(tileX)]?.type)?.index;
      if (Number.isInteger(authoredLayer) && dominantLayer(weights) !== authoredLayer) contourDisplacedPixels += 1;
    }
  }

  let authoredCentreMismatches = 0;
  for (const tile of terrain.tiles ?? []) {
    const layer = layerByType.get(tile.type);
    if (!layer) continue;
    const weights = sampleOrganicLayerWeights(context, tile.x + 0.5, tile.y + 0.5);
    if (dominantLayer(weights) !== layer.index) authoredCentreMismatches += 1;
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'terrain:organic-material-contour-mask';
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return {
    contract: TERRAIN_BLEND_MASK_CONTRACT,
    texture,
    width,
    height,
    pixelsPerTile,
    blendedPixels,
    targetPixels,
    contourDisplacedPixels,
    authoredCentreMismatches,
    source: 'derived_from_renderer_neutral_terrain_ids_on_static_rebuild',
    edgePolicy: 'implicit_rounded_regions_and_path_capsules_with_multiscale_domain_warp_and_deterministic_edge_lobes',
    identityPolicy: 'authored_ids_unchanged_renderer_mask_only_tile_centres_retain_authored_dominance',
    persistence: 'renderer_only_not_serialized_to_map_forge_or_runtime_map',
    dispose() { texture.dispose(); }
  };
}

function createFieldContext(grid, width, height, layerByType, mapId) {
  const layers = [...layerByType.values()].sort((a, b) => a.index - b.index);
  return {
    grid,
    width,
    height,
    layerByType,
    layers,
    seed: hashString(`${mapId ?? 'unknown'}:${width}x${height}`)
  };
}

function sampleOrganicLayerWeights(context, x, y) {
  const samplePoints = context.layers.map((layer) => warpPoint(x, y, layer.index, context.seed));
  const scores = new Array(context.layers.length).fill(-1);
  const minX = clampInt(Math.floor(x) - FIELD_RADIUS_TILES, 0, context.width - 1);
  const maxX = clampInt(Math.floor(x) + FIELD_RADIUS_TILES, 0, context.width - 1);
  const minY = clampInt(Math.floor(y) - FIELD_RADIUS_TILES, 0, context.height - 1);
  const maxY = clampInt(Math.floor(y) + FIELD_RADIUS_TILES, 0, context.height - 1);

  for (let tileY = minY; tileY <= maxY; tileY += 1) {
    for (let tileX = minX; tileX <= maxX; tileX += 1) {
      const tile = context.grid[tileY]?.[tileX];
      const layer = tile ? context.layerByType.get(tile.type) : null;
      if (!layer) continue;
      const point = samplePoints[layer.index];
      const centreX = tileX + 0.5;
      const centreY = tileY + 0.5;
      const joinMask = tile.terrainSpline?.joinery?.joinMask ?? null;
      const degree = joinMask ? Number(joinMask.n) + Number(joinMask.e) + Number(joinMask.s) + Number(joinMask.w) : 0;
      const coreRadius = featureRadius(layer.terrainType, degree, centreX, centreY, context.seed);
      scores[layer.index] = Math.max(scores[layer.index], featureScore(Math.hypot(point.x - centreX, point.y - centreY), coreRadius));

      // Capsules join authored neighbours through their centres. One-tile dirt becomes a
      // rounded path with uneven shoulders; larger grass/scorch regions merge as blobs.
      if (context.grid[tileY]?.[tileX + 1]?.type === tile.type) {
        const radius = connectionRadius(layer.terrainType, centreX + 0.5, centreY, context.seed);
        scores[layer.index] = Math.max(scores[layer.index], featureScore(pointSegmentDistance(point.x, point.y, centreX, centreY, centreX + 1, centreY), radius));
      }
      if (context.grid[tileY + 1]?.[tileX]?.type === tile.type) {
        const radius = connectionRadius(layer.terrainType, centreX, centreY + 0.5, context.seed);
        scores[layer.index] = Math.max(scores[layer.index], featureScore(pointSegmentDistance(point.x, point.y, centreX, centreY, centreX, centreY + 1), radius));
      }
      for (const diagonalX of [-1, 1]) {
        if (context.grid[tileY + 1]?.[tileX + diagonalX]?.type !== tile.type) continue;
        const radius = connectionRadius(layer.terrainType, centreX + diagonalX * 0.5, centreY + 0.5, context.seed) * 0.9;
        scores[layer.index] = Math.max(
          scores[layer.index],
          featureScore(pointSegmentDistance(point.x, point.y, centreX, centreY, centreX + diagonalX, centreY + 1), radius)
        );
      }

      // Deterministic off-centre lobes cross unlike edges. Opposing lobes naturally make
      // erosion pockets and small incursions instead of tracing the square tile border.
      for (const direction of DIRECTIONS) {
        const neighbour = context.grid[tileY + direction.y]?.[tileX + direction.x];
        if (!neighbour || neighbour.type === tile.type || !context.layerByType.has(neighbour.type)) continue;
        const edgeHash = hash2(tileX * 7 + direction.key, tileY * 11 - direction.key, context.seed + layer.index * 101);
        if (edgeHash < 0.24) continue;
        const tangent = (hash2(tileX - direction.key, tileY + direction.key, context.seed + 809) - 0.5) * 0.5;
        const reach = 0.43 + hash2(tileX + direction.key, tileY, context.seed + 1231) * 0.2;
        const lobeX = centreX + direction.x * reach + direction.tangentX * tangent;
        const lobeY = centreY + direction.y * reach + direction.tangentY * tangent;
        const lobeRadius = 0.11 + hash2(tileX, tileY + direction.key, context.seed + 2017) * 0.18;
        const lobeStrength = 0.53 + edgeHash * 0.38;
        scores[layer.index] = Math.max(
          scores[layer.index],
          featureScore(Math.hypot(point.x - lobeX, point.y - lobeY), lobeRadius) * lobeStrength
        );
      }
    }
  }

  for (const layer of context.layers) {
    if (scores[layer.index] <= 0) continue;
    const broad = valueNoise(x * 0.19 + layer.index * 8.7, y * 0.19 - layer.index * 5.3, context.seed + layer.index * 43);
    const detail = valueNoise(x * 0.83 - layer.index * 3.1, y * 0.83 + layer.index * 6.2, context.seed + layer.index * 97);
    scores[layer.index] += (broad - 0.5) * 0.13 + (detail - 0.5) * 0.045;
  }
  return featherScores(scores, x, y, context);
}

function warpPoint(x, y, layerIndex, seed) {
  const offset = layerIndex * 17.31;
  const broadX = valueNoise(x * 0.16 + offset, y * 0.16 - offset, seed + 313 + layerIndex * 71) - 0.5;
  const broadY = valueNoise(x * 0.16 - offset, y * 0.16 + offset, seed + 557 + layerIndex * 89) - 0.5;
  const mediumX = valueNoise(x * 0.61 + offset, y * 0.61, seed + 911 + layerIndex * 107) - 0.5;
  const mediumY = valueNoise(x * 0.61, y * 0.61 - offset, seed + 1217 + layerIndex * 131) - 0.5;
  return { x: x + broadX * 0.38 + mediumX * 0.12, y: y + broadY * 0.38 + mediumY * 0.12 };
}

function featureRadius(type, degree, x, y, seed) {
  const base = type === 'dirt' ? (degree >= 3 ? 0.52 : 0.44) : type === 'scorched' ? 0.61 : 0.64;
  return base * (0.84 + valueNoise(x * 0.42, y * 0.42, seed + typeSeed(type)) * 0.32);
}

function connectionRadius(type, x, y, seed) {
  const base = type === 'dirt' ? 0.37 : type === 'scorched' ? 0.56 : 0.59;
  return base * (0.82 + valueNoise(x * 0.37, y * 0.37, seed + typeSeed(type) + 149) * 0.38);
}

function featherScores(scores, x, y, context) {
  const maximum = Math.max(...scores);
  if (maximum <= 0) {
    const tile = context.grid[clampInt(Math.floor(y), 0, context.height - 1)]?.[clampInt(Math.floor(x), 0, context.width - 1)];
    const layer = tile ? context.layerByType.get(tile.type) : null;
    return context.layers.map((entry) => entry.index === layer?.index ? 1 : 0);
  }
  const feather = 0.07 + valueNoise(x * 0.31, y * 0.31, context.seed + 2657) * 0.085;
  const weights = scores.map((score) => {
    const nearTop = smoothRange(maximum - feather, maximum, score);
    return nearTop * nearTop;
  });
  const sum = weights.reduce((total, value) => total + value, 0) || 1;
  return weights.map((value) => value / sum);
}

function featureScore(distance, radius) { return Math.max(0, 1 - distance / Math.max(0.001, radius)); }

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth01(x - x0);
  const ty = smooth01(y - y0);
  return lerp(
    lerp(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), tx),
    lerp(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), tx),
    ty
  );
}

function hash2(x, y, seed) {
  let value = Math.imul((x | 0) ^ seed, 0x27d4eb2d) ^ Math.imul((y | 0) - seed, 0x165667b1);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967296;
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash | 0;
}

function typeSeed(type) { return type === 'dirt' ? 431 : type === 'scorched' ? 877 : 173; }
function dominantLayer(weights) { return weights.indexOf(Math.max(...weights)); }
function smoothRange(edge0, edge1, value) { const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0))); return smooth01(t); }
function smooth01(value) { return value * value * (3 - 2 * value); }
function lerp(a, b, amount) { return a + (b - a) * amount; }
function clampInt(value, min, max) { return Math.max(min, Math.min(max, value)); }
function byte(value) { return Math.max(0, Math.min(255, Math.round(value))); }
