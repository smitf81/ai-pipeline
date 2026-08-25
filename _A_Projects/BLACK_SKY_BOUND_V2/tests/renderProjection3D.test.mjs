import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createRenderProjection3DCompiler, RENDER_PROJECTION_3D_CONTRACT } from '../src/projection/renderProjection3D.js';
import { createCamera } from '../src/render/camera.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
syncGameViews(game);
const state = { time: 0, map, game, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map) };
const compiler = createRenderProjection3DCompiler(CONFIG);
const first = compiler.compile(state);
const second = compiler.compile(state);

equal(first.contract, RENDER_PROJECTION_3D_CONTRACT, '3D compiler should publish its renderer-neutral contract');
equal(first.staticWorld, second.staticWorld, 'stable maps should reuse the exact static projection object');
equal(second.diagnostics.staticChanged, false, 'stable frame should report a static cache hit');
equal(second.diagnostics.staticCacheRebuilds, 1, 'stable frames should not rebuild terrain or scenery');
assert(!Object.hasOwn(second.dynamicWorld, 'occlusionShadows'), '3D dynamic projection should exclude SDF occlusion packets');
assert(!Object.hasOwn(second.dynamicWorld, 'lightSpaceCulling'), '3D dynamic projection should exclude legacy light-space culling');
equal(second.diagnostics.legacy2DProjectionActive, false, '3D diagnostics should explicitly report legacy projection retirement');

const dynamicObject = game.sceneObjects.find((object) => object.materialProfileId);
dynamicObject.materialState = { ...(dynamicObject.materialState ?? {}), burnAmount: 0.5, foliageFire: { family: 'tree', phase: 'ablaze', heatAmount: 1, emberAmount: 0.8, charAmount: 0.3 } };
game.worldEvents.diagnostics.activeFoliageFireCount = 1;
const materialFrame = compiler.compile(state);
assert(materialFrame.dynamicWorld.sceneryMaterialUpdates.some((packet) => packet.id === dynamicObject.id), 'mutable scenery material state should emit a narrow dynamic update');

const priorStatic = materialFrame.staticWorld;
map.revision += 1;
const revised = compiler.compile(state);
assert(revised.staticWorld !== priorStatic, 'map revision should invalidate the static projection');
equal(revised.diagnostics.staticCacheRebuilds, 2, 'revision invalidation should rebuild exactly once');

compiler.dispose();
let disposedFailure = null;
try { compiler.compile(state); } catch (error) { disposedFailure = error; }
assert(disposedFailure?.message === 'render_projection_3d_compiler_disposed', 'disposed compilers should fail loudly');
