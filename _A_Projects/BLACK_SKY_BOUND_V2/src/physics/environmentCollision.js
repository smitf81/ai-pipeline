import { createConvexPolygonCollision, circleIntersectsCollisionShape } from './collisionShapes.js';
import { isTileBlocked } from '../world/terrain.js';

export const ENVIRONMENT_COLLISION_INDEX_CONTRACT = 'black-sky-bound.environment-collision-index.v1';
export const ENVIRONMENT_COLLISION_BUCKET_TILES = 4;

const CACHE = new WeakMap();

export function getEnvironmentCollisionIndex(map) {
  if (!map) return emptyIndex();
  const signature = `${map.revision ?? 0}:${map.width}:${map.height}:${map.sceneObjects?.length ?? 0}`;
  const cached = CACHE.get(map);
  if (cached?.signature === signature) return cached.index;
  const index = compileEnvironmentCollisionIndex(map);
  CACHE.set(map, { signature, index });
  return index;
}

export function compileEnvironmentCollisionIndex(map) {
  const shapes = [];
  const traversalModifiers = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (!isTileBlocked(map.tiles[y]?.[x])) continue;
      shapes.push(tilePolygon(x, y, { sourceKind: 'blocked_terrain', tileX: x, tileY: y }));
    }
  }
  for (const object of map.sceneObjects ?? []) {
    if (object.blocksMovement && object.collisionShape) shapes.push(object.collisionShape);
    for (const modifier of object.traversalModifiers ?? []) traversalModifiers.push(modifier);
  }
  const buckets = buildBuckets(shapes, (shape) => shape.bounds);
  const traversalBuckets = buildBuckets(traversalModifiers, (modifier) => modifier.shape.bounds);
  return Object.freeze({
    contract: ENVIRONMENT_COLLISION_INDEX_CONTRACT,
    revision: map.revision ?? 0,
    mapWidth: map.width,
    mapHeight: map.height,
    shapes: Object.freeze(shapes),
    buckets,
    traversalModifiers: Object.freeze(traversalModifiers),
    traversalBuckets,
    diagnostics: Object.freeze({
      shapeCount: shapes.length,
      terrainShapeCount: shapes.filter((shape) => shape.source?.sourceKind === 'blocked_terrain').length,
      recipeShapeCount: shapes.filter((shape) => shape.source?.sourceKind !== 'blocked_terrain').length,
      traversalModifierCount: traversalModifiers.length,
      bucketCount: buckets.size,
      traversalBucketCount: traversalBuckets.size
    })
  });
}

function buildBuckets(items, getBounds) {
  const buckets = new Map();
  items.forEach((item, index) => {
    const bounds = getBounds(item);
    const minX = Math.floor(bounds.left / ENVIRONMENT_COLLISION_BUCKET_TILES);
    const maxX = Math.floor(bounds.right / ENVIRONMENT_COLLISION_BUCKET_TILES);
    const minY = Math.floor(bounds.top / ENVIRONMENT_COLLISION_BUCKET_TILES);
    const maxY = Math.floor(bounds.bottom / ENVIRONMENT_COLLISION_BUCKET_TILES);
    for (let by = minY; by <= maxY; by += 1) {
      for (let bx = minX; bx <= maxX; bx += 1) {
        const key = `${bx}:${by}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(index);
      }
    }
  });
  return buckets;
}

export function circleIntersectsEnvironment(index, x, y, radius = 0) {
  if (!index || x - radius < 0 || y - radius < 0 || x + radius > index.mapWidth || y + radius > index.mapHeight) return true;
  const candidates = new Set();
  const minX = Math.floor((x - radius) / ENVIRONMENT_COLLISION_BUCKET_TILES);
  const maxX = Math.floor((x + radius) / ENVIRONMENT_COLLISION_BUCKET_TILES);
  const minY = Math.floor((y - radius) / ENVIRONMENT_COLLISION_BUCKET_TILES);
  const maxY = Math.floor((y + radius) / ENVIRONMENT_COLLISION_BUCKET_TILES);
  for (let by = minY; by <= maxY; by += 1) {
    for (let bx = minX; bx <= maxX; bx += 1) {
      for (const shapeIndex of index.buckets.get(`${bx}:${by}`) ?? []) candidates.add(shapeIndex);
    }
  }
  for (const shapeIndex of candidates) {
    if (circleIntersectsCollisionShape(x, y, radius, index.shapes[shapeIndex])) return true;
  }
  return false;
}

export function environmentTraversalMultiplier(index, x, y, radius = 0) {
  if (!index?.traversalModifiers?.length) return 1;
  const candidates = collectBucketCandidates(index.traversalBuckets, x, y, radius);
  let multiplier = 1;
  for (const modifierIndex of candidates) {
    const modifier = index.traversalModifiers[modifierIndex];
    if (circleIntersectsCollisionShape(x, y, radius, modifier.shape)) {
      multiplier = Math.min(multiplier, modifier.multiplier);
    }
  }
  return multiplier;
}

function collectBucketCandidates(buckets, x, y, radius) {
  const candidates = new Set();
  const minX = Math.floor((x - radius) / ENVIRONMENT_COLLISION_BUCKET_TILES);
  const maxX = Math.floor((x + radius) / ENVIRONMENT_COLLISION_BUCKET_TILES);
  const minY = Math.floor((y - radius) / ENVIRONMENT_COLLISION_BUCKET_TILES);
  const maxY = Math.floor((y + radius) / ENVIRONMENT_COLLISION_BUCKET_TILES);
  for (let by = minY; by <= maxY; by += 1) {
    for (let bx = minX; bx <= maxX; bx += 1) {
      for (const itemIndex of buckets?.get(`${bx}:${by}`) ?? []) candidates.add(itemIndex);
    }
  }
  return candidates;
}

function tilePolygon(x, y, source) {
  return createConvexPolygonCollision([
    { x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }
  ], source);
}

function emptyIndex() {
  return Object.freeze({ contract: ENVIRONMENT_COLLISION_INDEX_CONTRACT, mapWidth: 0, mapHeight: 0, shapes: Object.freeze([]), buckets: new Map(), traversalModifiers: Object.freeze([]), traversalBuckets: new Map(), diagnostics: Object.freeze({ shapeCount: 0, traversalModifierCount: 0 }) });
}
