import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { CONFIG } from '../src/config.js';
import { getComponent } from '../src/ecs/world.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { napalmDripSystem } from '../src/systems/napalmDripSystem.js';
import { buildLightViews } from '../src/game/selectors.js';
import { createCamera } from '../src/render/camera.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { addNapalmDroplet, addNapalmPool } from '../src/projection/napalmLayerState.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { getNapalmDribbleRecipe } from '../src/data/napalmDribble.js';
import { NapalmEmitterId } from '../src/constants/napalmEmitterIds.js';
import { createRenderLayerState, getRenderLayerStats } from '../src/projection/renderLayerState.js';
import { WebGLEffectLayer } from '../src/render/backends/webgl/layers/WebGLEffectLayer.js';

const map = createDemoMap();
const game = createInitialGameState(map);
const dragonNapalm = getComponent(game.world, game.dragonId, ComponentType.NapalmDripEmitter);
const dragonLight = getComponent(game.world, game.dragonId, ComponentType.LightEmitter);
assert(dragonNapalm, 'player wyvern should own a formal napalm drip emitter');
equal(dragonLight, null, 'napalm dribble should not reintroduce a generic player LightEmitter');

wyvernProjectionSystem({ game, dt: 1 / 30 });
const projection = getComponent(game.world, game.dragonId, ComponentType.WyvernProjection);
assert(projection.sockets?.mouth, 'wyvern projection should expose a mouth socket for dribble origin');

napalmDripSystem({ game, dt: 0.05 });
equal(game.renderLayers.napalm.droplets.length, 1, 'napalm emitter should spawn bounded live droplets from the mouth socket');
equal(game.renderLayers.napalm.pools.length, 0, 'fresh droplets should not instantly become pools');
const fallingProjection = buildRenderProjection({
  time: 0,
  map,
  game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map)
}, CONFIG);
const fallingDrip = fallingProjection.projectiles[0];
assert(fallingDrip, 'fresh napalm should reach the projectile projection while falling');
equal(fallingDrip.visualRole, 'falling_napalm_drip', 'napalm projection should identify the authored liquid-drip renderer path');
assert(fallingDrip.heightMeters > 0.4 && fallingDrip.heightMeters <= fallingDrip.mouthHeightMeters, 'fresh napalm should form below the mouth before descending through real 3D height');
equal(fallingDrip.stage, 'forming', 'fresh napalm should begin as a mouth-attached forming bead');
equal(fallingDrip.separated, false, 'fresh napalm should not spawn as an already detached ball');
assert(fallingDrip.glowRadius < CONFIG.tileSize * 0.2, 'droplet glow should stay local instead of becoming a large orange blob');
const dripLayer = new WebGLEffectLayer();
dripLayer.update({ projectiles: [fallingDrip], effects: [], particles: [] }, fakeContext());
equal(dripLayer.rects.length, 0, 'napalm droplets should never fall back to the blocky legacy effect rectangle');
assert(dripLayer.triangles.length >= 3 && dripLayer.radials.length >= 2, 'napalm droplets should render a liquid body, hot core, trail, and contact shadow');

for (let i = 0; i < 12; i += 1) napalmDripSystem({ game, dt: 0.05 });
assert(game.renderLayers.napalm.pools.length >= 1, 'landed droplets should become active napalm decal pools');
assert(game.renderLayers.decals.stamps.some((stamp) => stamp.kind === 'napalm_scorch'), 'landed pools should leave cached scorch decal stamps');

const poolLights = buildLightViews(game, 3.2).filter((light) => light.sourceKind === 'baby_wyvern_drool_pool_light');
assert(poolLights.length >= 1, 'active napalm pools should contribute small warm lights through the normal light view seam');
assert(poolLights.every((light) => light.intensity > 0 && light.intensity <= 1), 'napalm pool light intensity should remain bounded');

const napalmRecipe = getNapalmDribbleRecipe(NapalmEmitterId.WYVERN_MOUTH_DRIBBLE);
assert(napalmRecipe.pool.radius < 0.26, 'napalm pools should stay small enough to read as residue, not large orbs');
assert(napalmRecipe.pool.spreadDuration > 0 && napalmRecipe.pool.spreadDuration < 0.6, 'napalm pools should own a short visible spreading stage');
assert(napalmRecipe.pool.hotDuration < napalmRecipe.pool.lifetime, 'napalm heat should cool before the dark residue expires');
equal(napalmRecipe.pool.visualMaterial, 'residual_liquid_napalm_pool_v1', 'napalm recipe should declare the liquid pool material contract');
equal(napalmRecipe.pool.poolShape, 'irregular_low_pool', 'napalm recipe should declare an irregular low-pool shape for decal rendering');
assert(napalmRecipe.light.intensity >= 0.06 && napalmRecipe.light.intensity < 0.16, 'baby drool light should reveal local ground without inheriting Mama-scale energy');
assert(napalmRecipe.light.radius < 0.6, 'napalm pool light radius should stay local to the residual pool');

const canvas = { clientWidth: 1280, clientHeight: 720 };
const renderProjection = buildRenderProjection({
  time: 0,
  map,
  game,
  camera: createCamera(canvas, map)
}, CONFIG);
const hazard = renderProjection.groundHazards.find((packet) => packet.sourceKind === 'napalm_pool');
assert(hazard, 'landed napalm pools should reach renderer-neutral ground hazard projection');
equal(hazard.visualMaterial, 'residual_liquid_napalm_pool_v1', 'ground hazard projection should preserve liquid material metadata');
equal(hazard.poolShape, 'irregular_low_pool', 'ground hazard projection should preserve liquid pool shape metadata');
equal(hazard.hotSpotCount, 2, 'ground hazard projection should expose two bounded hot seams for WebGL composition');
assert(hazard.spread01 > 0 && hazard.spread01 <= 1, 'ground hazard projection should expose pooling spread progress');
assert(hazard.heat01 > 0 && hazard.heat01 <= 1, 'ground hazard projection should expose cooling heat progress');

const renderLayers = createRenderLayerState();
for (let i = 0; i < RENDER_BUDGETS.napalmDroplets.maxActive + 8; i += 1) {
  addNapalmDroplet(renderLayers, { x: i, y: 0, groundX: i, groundY: 0, duration: 1, lifetime: 1 });
}
for (let i = 0; i < RENDER_BUDGETS.napalmPools.maxActive + 8; i += 1) {
  addNapalmPool(renderLayers, { x: i, y: 0, radius: 0.2, age: 0, lifetime: 4, light: null });
}
const stats = getRenderLayerStats(renderLayers);
equal(stats.napalmDroplets, RENDER_BUDGETS.napalmDroplets.maxActive, 'live napalm droplets should be capped');
equal(stats.napalmPools, RENDER_BUDGETS.napalmPools.maxActive, 'active napalm pools should be capped');
assert(stats.droppedNapalmDroplets > 0, 'dropped napalm droplets should be counted');
assert(stats.droppedNapalmPools > 0, 'dropped napalm pools should be counted');

dragonNapalm.enabled = false;
game.renderLayers.napalm.droplets.length = 0;
napalmDripSystem({ game, dt: napalmRecipe.pool.lifetime + 0.1 });
equal(game.renderLayers.napalm.pools.length, 0, 'expired baby napalm pools should be removed from live state');
equal(game.renderLayers.decals.stamps.filter((stamp) => stamp.kind === 'napalm_scorch').length, 0, 'baby napalm scorch decals should expire with their defined lifecycle');
equal(buildLightViews(game, 20).filter((light) => light.sourceKind === 'baby_wyvern_drool_pool_light').length, 0, 'expired baby napalm pools should leave no live local lights');

function fakeContext() {
  return {
    camera: {
      visibleWorldBounds: () => ({ left: -1000, top: -1000, right: 3000, bottom: 3000 })
    },
    lightSpaceCulling: { enabled: false }
  };
}
