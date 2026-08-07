import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createRenderProjection3DCompiler } from '../src/projection/renderProjection3D.js';
import { ThreeBabyNapalmDroolLayer, THREE_BABY_NAPALM_DROOL_CONTRACT } from '../src/render/backends/three/ThreeBabyNapalmDroolLayer.js';
import { napalmDripSystem } from '../src/systems/napalmDripSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
const emitter = getComponent(game.world, game.dragonId, ComponentType.NapalmDripEmitter);
emitter.emissionSerial = 3;

wyvernProjectionSystem({ game, dt: 1 / 30 });
napalmDripSystem({ game, dt: 0.04 });
equal(game.renderLayers.napalm.droplets.length, 2, 'deterministic split cadence should create one bounded secondary droplet on the authored interval');
const main = game.renderLayers.napalm.droplets.find((droplet) => !droplet.secondary);
const secondary = game.renderLayers.napalm.droplets.find((droplet) => droplet.secondary);
assert(main && secondary, 'split emission should retain explicit main/secondary roles');
assert(secondary.radius < main.radius, 'secondary liquid should remain subordinate to the main droplet silhouette');

const firstSocket = { x: main.socketX, y: main.socketY };
transform.x += 0.08;
transform.y += 0.03;
transform.rotation += 0.34;
wyvernProjectionSystem({ game, dt: 0.04 });
napalmDripSystem({ game, dt: 0.04 });
assert(Math.hypot(main.socketX - firstSocket.x, main.socketY - firstSocket.y) > 0.02, 'forming droplet should follow the canonical mouth socket through movement and turning');
equal(main.separated ?? false, false, 'main droplet should remain attached during its forming interval');

wyvernProjectionSystem({ game, dt: 0.11 });
napalmDripSystem({ game, dt: 0.11 });
equal(main.separated, true, 'main droplet should explicitly transition from mouth attachment to airborne motion');
const separation = { x: main.separationX, y: main.separationY };
transform.x += 0.12;
transform.rotation -= 0.5;
wyvernProjectionSystem({ game, dt: 0.04 });
napalmDripSystem({ game, dt: 0.04 });
equal(main.separationX, separation.x, 'airborne droplet should no longer be dragged by the moving mouth');
equal(main.separationY, separation.y, 'airborne droplet separation anchor should remain stable');

syncGameViews(game);
const compiler = createRenderProjection3DCompiler(CONFIG);
let compiled = compiler.compile({ time: 0.2, map, game, camera: { x: transform.x * CONFIG.tileSize, y: transform.y * CONFIG.tileSize, zoom: 2.75, viewportW: 1280, viewportH: 720 } });
const projectile = compiled.dynamicWorld.projectiles.find((packet) => packet.id === main.id);
assert(projectile.heightMeters > 0.1 && projectile.heightMeters < projectile.mouthHeightMeters, 'airborne droplet should descend through renderer height instead of moving its gameplay-plane y as fake gravity');
equal(projectile.separated, true, 'renderer-neutral projectile should preserve separation state');

for (let index = 0; index < 12; index += 1) {
  wyvernProjectionSystem({ game, dt: 0.05 });
  napalmDripSystem({ game, dt: 0.05 });
}
syncGameViews(game);
compiled = compiler.compile({ time: 0.9, map, game, camera: { x: transform.x * CONFIG.tileSize, y: transform.y * CONFIG.tileSize, zoom: 2.75, viewportW: 1280, viewportH: 720 } });
assert(compiled.dynamicWorld.groundHazards.length >= 1, 'landed main and secondary droplets should produce a bounded ground deposit');
const hazard = compiled.dynamicWorld.groundHazards[0];
equal(hazard.poolShape, 'irregular_low_pool', '3D deposit should preserve the canonical liquid-pool contract');
assert(hazard.lobeCount >= 2 && hazard.lobeCount <= 3, 'deposit should expose two or three connected deterministic lobes');
assert(hazard.impactLife01 >= 0 && hazard.impactLife01 <= 1, 'deposit should expose a bounded impact-crown stage');
assert(hazard.flame01 > 0, 'fresh deposit should expose a brief flame stage rooted in liquid');

const root = new THREE.Group();
const layer = new ThreeBabyNapalmDroolLayer(root, CONFIG.tileSize);
const napalmSmoke = compiled.dynamicWorld.fogSmoke.filter((packet) => /napalm_(droplet_wisp|smoulder)/.test(packet.sourceKind));
const napalmParticles = compiled.dynamicWorld.particles.filter((packet) => packet.kind === 'napalm_ember' || packet.sourceKind === 'napalm_smoulder');
layer.update({
  projectiles: compiled.dynamicWorld.projectiles,
  hazards: compiled.dynamicWorld.groundHazards,
  smoke: napalmSmoke,
  particles: napalmParticles,
  renderTime: compiled.dynamicWorld.renderTime
});
const firstStats = layer.diagnostics();
equal(firstStats.contract, THREE_BABY_NAPALM_DROOL_CONTRACT, 'dedicated renderer should expose the baby-only drool contract');
assert(firstStats.visibleInstances > 0 && firstStats.drawFamilies > 0, 'baby drool should render through bounded instanced families');
assert(root.getObjectByName('three:baby-wyvern-napalm-drool'), 'baby drool should own one isolated Three.js root');
assert(layer.batchList.every((entry) => entry.mesh.isInstancedMesh), 'droplet, splash, pool, flame, smoke and spark details should use instanced batches');
layer.update({
  projectiles: compiled.dynamicWorld.projectiles,
  hazards: compiled.dynamicWorld.groundHazards,
  smoke: napalmSmoke,
  particles: napalmParticles,
  renderTime: compiled.dynamicWorld.renderTime + 1 / 60
});
equal(layer.diagnostics().batchCount, firstStats.batchCount, 'stable repeated use should not allocate new batch families');
assert(layer.diagnostics().visibleInstances <= firstStats.capacities.poolLobes + firstStats.capacities.smokeWisps + firstStats.capacities.particles + firstStats.capacities.droplets * 4 + firstStats.capacities.pools * 9, 'visible instances should remain within declared bounded capacities');
layer.dispose();
equal(layer.batchList.length, 0, 'baby drool disposal should release its batch registry');
compiler.dispose();
