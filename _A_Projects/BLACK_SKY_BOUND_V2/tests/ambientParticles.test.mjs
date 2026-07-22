import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { AmbientParticleKind } from '../src/data/ambientParticles.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { SmokeSourceKind } from '../src/data/smokeSources.js';
import { createInitialGameState } from '../src/game/state.js';
import { spawnSmokeCloud } from '../src/game/spawn.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createCamera } from '../src/render/camera.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { addNapalmPool } from '../src/projection/napalmLayerState.js';
import { WebGLEffectLayer } from '../src/render/backends/webgl/layers/WebGLEffectLayer.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
wyvernProjectionSystem({ game, dt: 1 / 60 });
humanoidProjectionSystem({ game, dt: 1 / 60 });

spawnSmokeCloud(game.world, 14, 13, {
  radius: 1.1,
  slowMultiplier: 0.4,
  duration: 3,
  sourceKind: SmokeSourceKind.DRAGON_SMOKE_PLUME,
  shape: 'forward_plume',
  forwardX: 1,
  forwardY: -0.15
});
addNapalmPool(game.renderLayers, {
  x: 15,
  y: 13,
  radius: 0.36,
  lifetime: 8,
  life01: 1,
  light: {
    radius: 3.2,
    intensity: 0.7,
    softness: 0.72,
    colour: 'rgba(255,124,48,0.9)',
    innerColour: 'rgba(255,214,128,0.95)',
    flickerAmount: 0.12,
    flickerSpeed: 7
  }
});
syncGameViews(game);

const state = {
  time: 1.25,
  map,
  game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map)
};
const projection = buildRenderProjection(state, CONFIG);
const kinds = new Set(projection.particles.map((particle) => particle.kind));

assert(projection.particles.length > 0, 'ambient particle projection should produce visible packets');
assert(projection.particles.length <= RENDER_BUDGETS.ambientParticles.maxActive, 'ambient particles should respect the render budget');
assert(projection.particles.every((particle) => particle.classification === 'renderer_neutral_ambient_particle_projection'), 'particle packets should declare renderer-neutral classification');
assert(projection.particles.every((particle) => typeof particle.visualRole === 'string'), 'particle packets should expose visual role metadata');
assert(kinds.has(AmbientParticleKind.TORCH_SPARK), 'torch lights should project flame/spark particles');
assert(kinds.has(AmbientParticleKind.RAID_FLAME_SPARK), 'raid flame scene objects should project restrained micro-sparks');
assert(kinds.has(AmbientParticleKind.SMOKE_TRAIL_MOTE), 'smoke plumes should project trail motes');
assert(kinds.has(AmbientParticleKind.NAPALM_EMBER), 'napalm pools should project ember particles');
assert(kinds.has(AmbientParticleKind.ASH_FLECK), 'napalm smoulder smoke should project ash flecks');
assert(kinds.has(AmbientParticleKind.LEAF_DRIFT), 'tree scenery should project drifting leaf particles');
assert(projection.particles.some((particle) => particle.kind === AmbientParticleKind.LEAF_DRIFT && particle.sourceKind === 'tree'), 'canonical tree species should opt into drifting leaf particles');
assert(projection.particles.some((particle) => particle.kind === AmbientParticleKind.LEAF_DRIFT && particle.sourceKind === 'forest_shrub'), 'leafy undergrowth should opt into subtle leaf particles');
assert(projection.particles.filter((particle) => particle.kind === AmbientParticleKind.RAID_FLAME_SPARK).every((particle) => particle.radius < 1.6), 'raid-flame sparks should stay smaller than the flame body');

const layer = new WebGLEffectLayer();
layer.update(projection, fakeContext());
equal(layer.mode, 'webgl_effects_particles_v0', 'WebGL effect layer should expose the particle-aware mode');
equal(layer.particleCount, projection.particles.length, 'WebGL effect layer should count projected particles');
assert(layer.particlePrimitiveCount > 0, 'WebGL effect layer should batch particles into primitives');
assert(layer.radials.length > 0, 'spark/smoke particles should produce radial primitives');
assert(layer.triangles.length > 0, 'leaf/ash particles should produce triangle primitives');

function fakeContext() {
  return {
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      viewportW: 1280,
      viewportH: 720,
      visibleWorldBounds() {
        return { left: -1000, top: -1000, right: 3000, bottom: 3000 };
      }
    },
    lightSpaceCulling: { enabled: false }
  };
}
