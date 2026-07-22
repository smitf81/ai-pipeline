import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { createInitialGameState } from '../src/game/state.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { WebGLTerrainLayer } from '../src/render/backends/webgl/layers/WebGLTerrainLayer.js';
import { TerrainType } from '../src/world/terrain.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
const projection = buildRenderProjection({
  time: 0,
  map,
  game,
  camera: {
    x: (map.width * CONFIG.tileSize) / 2,
    y: (map.height * CONFIG.tileSize) / 2,
    zoom: 1,
    viewportW: 1600,
    viewportH: 960
  }
}, CONFIG);

equal(projection.terrain.classification, 'renderer_neutral_terrain_projection', 'terrain projection should declare its neutral contract');
equal(projection.terrain.connectedRuleModel, 'orthogonal_4way_16_mask', 'terrain projection should use the 16-mask rule model first');
assert(projection.terrain.connectedRuleTypes.includes(TerrainType.GRASS), 'grass should be promoted into connected terrain rules');
assert(projection.terrain.connectedRuleTypes.includes(TerrainType.DIRT), 'dirt should be promoted into connected terrain rules');
assert(map.blobMasks.grass.length > 0, 'demo map should prebuild grass connected masks');
assert(map.blobMasks.dirt.length > 0, 'demo map should prebuild dirt connected masks');

const grassTiles = projection.terrain.tiles.filter((tile) => tile.type === TerrainType.GRASS);
const dirtTiles = projection.terrain.tiles.filter((tile) => tile.type === TerrainType.DIRT);
assert(grassTiles.length > 0, 'playtest map should include grass tiles');
assert(dirtTiles.length > 0, 'playtest map should include dirt tiles');
assert(grassTiles.every((tile) => tile.connectedRule?.model === 'orthogonal_4way_16_mask'), 'grass packets should carry 16-mask rules');
assert(dirtTiles.every((tile) => tile.connectedRule?.model === 'orthogonal_4way_16_mask'), 'dirt packets should carry 16-mask rules');
assert(grassTiles.every((tile) => tile.terrainSpline?.contract === 'black-sky-bound.terrain-tile-spline.v0'), 'grass packets should carry terrain spline metadata');
assert(dirtTiles.every((tile) => tile.terrainSpline?.contract === 'black-sky-bound.terrain-tile-spline.v0'), 'dirt packets should carry terrain spline metadata');
assert(dirtTiles.some((tile) => tile.connectedRule.connectionCount < 4), 'dirt blob should expose edge/cap/corner rules, not only filled interiors');
assert(dirtTiles.some((tile) => tile.terrainSpline.joinery.junction.degree === tile.connectedRule.connectionCount), 'terrain spline joinery should mirror the connected rule degree');

const terrainLayer = new WebGLTerrainLayer();
terrainLayer.update(projection, {
  camera: {
    visibleWorldBounds: () => ({
      left: 0,
      top: 0,
      right: map.width * CONFIG.tileSize,
      bottom: map.height * CONFIG.tileSize
    })
  },
  lightSpaceCulling: null
});

const stats = terrainLayer.statsFields();
equal(stats.mode, 'webgl_connected_terrain_16mask_spline_texture_v1', 'WebGL terrain layer should expose the connected terrain texture mode');
equal(terrainLayer.rects.length, map.width * map.height, 'terrain layer should still draw one base rect per visible tile');
assert(terrainLayer.detailRects.length > 0, 'terrain layer should draw connected-rule edge/stem rects');
assert(terrainLayer.detailTriangles.length > 0, 'terrain layer should draw connected-rule corner triangles');
assert(terrainLayer.detailRadials.length > 0, 'terrain layer should draw connected-rule soft terrain boundary radials');
equal(stats.terrainTextureActive, false, 'headless unit context should use the non-texture fallback path');
equal(stats.rectCount, terrainLayer.rects.length + terrainLayer.detailRects.length, 'terrain stats should include base and detail rects');
equal(stats.triangleCount, terrainLayer.detailTriangles.length, 'terrain stats should include detail triangles');
assert(stats.primitiveCount > terrainLayer.rects.length, 'connected terrain should add visible primitives beyond flat base tiles');
