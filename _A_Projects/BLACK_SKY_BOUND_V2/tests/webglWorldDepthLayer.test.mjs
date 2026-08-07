import { assert, equal } from './assert.mjs';
import { WebGLWorldDepthLayer, WEBGL_WORLD_DEPTH_MODE } from '../src/render/backends/webgl/layers/WebGLWorldDepthLayer.js';

const layer = new WebGLWorldDepthLayer();
layer.update(fakeProjection(), fakeContext());

equal(layer.mode, WEBGL_WORLD_DEPTH_MODE, 'world-depth layer should expose the y-sorted mode');
equal(layer.items.length, 3, 'world-depth layer should combine scenery and actor draw items');
equal(layer.items[0].id, 'actor:behind-tree', 'actor above a tree base should sort behind the tree');
equal(layer.items[1].id, 'tree:test', 'tree should sort at its anchor/base y');
equal(layer.items[2].id, 'actor:front-of-tree', 'actor below a tree base should sort in front of the tree');
assert(layer.items[1].rects.length === 0 && layer.items[1].triangles.length > 40, 'healthy trees should derive trunk, roots, branches, and foliage from spline triangles without a rectangle trunk');
assert(layer.items[1].proceduralTree?.splineCount >= 8, 'world-depth item should retain procedural tree diagnostics');
equal(layer.proceduralTreeCount, 1, 'world-depth diagnostics should count generated trees');
assert(layer.proceduralTreeSplineCount >= 8, 'world-depth diagnostics should expose generated spline count');
equal(layer.scenerySourceCount, 1, 'world-depth layer should report scenery source count separately');
equal(layer.actorSourceCount, 2, 'world-depth layer should report actor source count separately');
assert(layer.statsFields().depthSortedItemCount === 3, 'world-depth diagnostics should expose sorted item count');

function fakeProjection() {
  return {
    scenery: [fakeTree()],
    actors: [
      fakeActor('actor:behind-tree', 100, 86),
      fakeActor('actor:front-of-tree', 100, 132)
    ]
  };
}

function fakeTree() {
  return {
    id: 'tree:test',
    type: 'tree',
    worldX: 100,
    worldY: 80,
    worldTileX: 64,
    worldTileY: 32,
    worldWidth: 96,
    worldHeight: 128,
    worldRadius: 64,
    anchorWorldX: 112,
    anchorWorldY: 112,
    collisionWorldWidth: 32,
    treeDefinition: {
      contract: 'black-sky-bound.procedural-tree-definition.v1', sourceContract: 'axiom.tree-dna.v1', recipeContract: 'axiom.tree-species-recipe.v1',
      seed: 18273, species: 'old_pine', form: 'conifer', evergreen: true, ageYears: 82, matureYears: 55, health: 0.94, season: 'summer',
      heightMeters: 8.6, trunkRadiusMeters: 0.56, taper: 0.72, bend: 0.16, twist: 0.2, branchLevels: 6, branchDensity: 0.74,
      leafDensity: 0.9, canopySpread: 0.86, crownStart: 0.25, rootScale: 1.05, moss: 0.31, barkColour: '#4a3020', leafColour: '#244d33',
      projected: { widthTiles: 6.2, heightTiles: 7.4 }
    },
    render: {
      baseShadow: 'rgba(0,0,0,0.28)',
      trunkColour: '#5a3620',
      trunkShadow: '#2a170d',
      crownHighlight: '#47633d',
      crownColour: '#2c4a32',
      crownShade: '#183322'
    }
  };
}

function fakeActor(id, worldX, worldY) {
  return {
    id,
    team: 'player',
    worldX,
    worldY,
    worldRadius: 8,
    colour: '#d65b28',
    silhouette: 'marker'
  };
}

function fakeContext() {
  return {
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      viewportW: 320,
      viewportH: 240,
      visibleWorldBounds() {
        return { left: -1000, top: -1000, right: 1000, bottom: 1000 };
      }
    },
    lightSpaceCulling: { enabled: false }
  };
}
