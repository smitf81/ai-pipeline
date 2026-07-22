import { assert, equal } from './assert.mjs';
import { TerrainType } from '../src/world/terrain.js';
import { paintTerrainBlob, buildTerrainBlobMasks } from '../src/terrain/blobRules.js';

const map = {
  width: 12,
  height: 12,
  tiles: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => TerrainType.GRASS))
};
const painted = paintTerrainBlob(map, { cx: 5, cy: 5, radius: 3, type: TerrainType.FOREST, roughness: 0 });
assert(painted.length > 0, 'paintTerrainBlob should paint tiles');
const masks = buildTerrainBlobMasks(map, TerrainType.FOREST);
assert(masks.length === painted.length, 'mask builder should describe every painted tile');
assert(masks.every((item) => item.rule && item.rule.variant), 'every painted tile should resolve a 16-mask rule');
equal(new Set(Array.from({ length: 16 }, (_, mask) => mask)).size, 16, '16-mask tileset expectation should stay explicit');
