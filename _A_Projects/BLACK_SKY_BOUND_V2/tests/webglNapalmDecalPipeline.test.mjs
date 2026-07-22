import { assert, equal } from './assert.mjs';
import { WebGLDecalLayer } from '../src/render/backends/webgl/layers/WebGLDecalLayer.js';

const layer = new WebGLDecalLayer();
const projection = {
  decals: [],
  groundHazards: [{
    classification: 'renderer_neutral_ground_hazard_projection',
    id: 'napalm_pool_test',
    kind: 'napalm_pool',
    sourceKind: 'napalm_pool',
    visualRole: 'ground_hazard',
    visualMaterial: 'residual_liquid_napalm_pool_v1',
    poolShape: 'irregular_low_pool',
    worldX: 180,
    worldY: 120,
    radius: 16,
    colour: 'rgba(148,38,16,0.46)',
    hotColour: 'rgba(255,126,40,0.42)',
    rimColour: 'rgba(33,11,7,0.42)',
    coolingColour: 'rgba(82,20,12,0.38)',
    opacity: 0.68,
    rimScale: 1.08,
    bodyScale: 0.82,
    hotSpotScale: 0.12,
    hotSpotCount: 2,
    flickerPhase: 0.4,
    age: 0.2,
    lifetime: 12,
    life01: 0.98,
    spread01: 0.74,
    heat01: 0.92,
    softness: 0.72,
    renderPriority: 20
  }]
};
const context = {
  camera: {
    x: 0,
    y: 0,
    zoom: 1,
    viewportW: 640,
    viewportH: 360,
    visibleWorldBounds: () => ({ left: -320, top: -180, right: 320, bottom: 180 })
  },
  lightSpaceCulling: { enabled: false }
};

layer.update(projection, context);
const stats = layer.statsFields();

equal(layer.mode, 'liquid_ground_hazard_decal_v1', 'WebGL decal layer should expose the liquid ground-hazard mode');
equal(stats.decalMode, 'liquid_ground_hazard_decal_v1', 'WebGL decal diagnostics should report the liquid mode');
equal(stats.sourceCount, 1, 'one projected napalm pool should remain one decal source');
equal(stats.liquidPoolCount, 1, 'napalm pool packets should be counted as liquid pools');
equal(stats.hotSpotPrimitiveCount, 2, 'napalm liquid pools should render two bounded hot seams rather than bright dots');
assert(stats.primitiveCount >= 8, 'one napalm pool should expand into rim, body, lobe, and hot-seam primitives');
assert(stats.liquidPoolPrimitiveCount === stats.primitiveCount, 'liquid primitive diagnostics should match rendered pool primitive count');
assert(layer.radials.some((radial) => radial.liquidHotSpot), 'hot spots should stay explicit in the WebGL composition data');
assert(Math.max(...layer.radials.map((radial) => radial.color[3])) < 0.3, 'liquid pool alpha should stay below bright orb emission levels');
