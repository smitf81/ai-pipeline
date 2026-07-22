import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { ACTORS } from '../src/data/actors.js';
import { setCreatureTuningValue } from '../src/data/creatures/creatureTuning.js';
import { HumanoidProjectionId, getHumanoidProjectionProfile } from '../src/data/humanoids/raiderHumanoid.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { CONFIG } from '../src/config.js';
import { createCamera } from '../src/render/camera.js';
import { buildWebGLRaiderHumanoidSilhouette } from '../src/render/backends/webgl/WebGLHumanoidSilhouette.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { createTuningState, selectTuningEntity } from '../src/tuning/tuningRuntime.js';
import { createDemoMap } from '../src/world/map.js';

equal(ACTORS[EntityKind.RAIDER].silhouette, 'humanoid', 'raider actor definition should declare humanoid silhouette');
equal(ACTORS[EntityKind.RAIDER].humanoidProjection, HumanoidProjectionId.RAIDER_TOP_DOWN_STICK, 'raider should use top-down stick humanoid profile');
assert(ACTORS[EntityKind.RAIDER].lightEmitter, 'raider should still carry a torch emitter');

const map = createDemoMap();
const game = createInitialGameState(map);
const raiderId = spawnActor(game.world, EntityKind.RAIDER, 12.5, 10.5);
const humanoid = getComponent(game.world, raiderId, ComponentType.HumanoidProjection);
const light = getComponent(game.world, raiderId, ComponentType.LightEmitter);
assert(humanoid, 'spawned raider should receive HumanoidProjection component');
assert(light, 'spawned raider should receive LightEmitter component');

humanoidProjectionSystem({ game, dt: 1 / 60 });
assert(humanoid.points.head && humanoid.points.leftHand && humanoid.points.rightFoot, 'humanoid projection should solve head, hands, and feet');
assert(humanoid.sockets.torchHand && humanoid.sockets.torchFlame, 'humanoid projection should expose torch hand and flame sockets');
equal(humanoid.collisionPolicy, 'single_collider_circle_body_v0', 'raider should keep simple body collider policy');
equal(humanoid.shadowPolicy, 'visual_actor_sdf_shadow_projection_v1', 'raider should declare visual SDF actor shadow policy');

syncGameViews(game);
const raiderView = game.actors.find((actor) => actor.id === raiderId);
const torchLight = game.lights.find((item) => item.id === raiderId);
equal(torchLight.sourceSocket, 'torch_flame_socket', 'torch light should bind to the projected flame socket');
equal(Number(torchLight.x.toFixed(4)), Number(raiderView.humanoidProjection.sockets.torchFlame.x.toFixed(4)), 'torch light x should follow flame socket');
equal(Number(torchLight.y.toFixed(4)), Number(raiderView.humanoidProjection.sockets.torchFlame.y.toFixed(4)), 'torch light y should follow flame socket');

const transform = getComponent(game.world, raiderId, ComponentType.Transform);
const phaseBefore = humanoid.gaitPhase;
transform.x += 0.25;
humanoidProjectionSystem({ game, dt: 1 / 60 });
assert(humanoid.gaitPhase > phaseBefore, 'humanoid gait phase should advance when the raider moves');
equal(humanoid.motionState, 'walk', 'moving raider should enter walk motion state');

syncGameViews(game);
const projection = buildRenderProjection({ game, map, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map), time: 0 }, CONFIG);
const actorPacket = projection.actors.find((actor) => actor.id === raiderId);
assert(actorPacket.humanoidProjection, 'render projection should include renderer-neutral humanoid packet');
equal(actorPacket.humanoidProjection.classification, 'renderer_neutral_humanoid_visual_projection', 'humanoid packet should declare renderer-neutral classification');
assert(actorPacket.humanoidProjection.sockets.torchFlame.worldX > 0, 'humanoid packet should project torch flame to world pixels');

const silhouette = buildWebGLRaiderHumanoidSilhouette(actorPacket);
assert(silhouette?.triangles.length > 20, 'raider WebGL silhouette should build visible mesh triangles');
assert(silhouette.triangles.every((triangle) => Number.isFinite(triangle.ax) && Number.isFinite(triangle.by) && Number.isFinite(triangle.cx)), 'raider WebGL triangles should use scene-root vertex fields');
assert(silhouette.torchAttached, 'raider WebGL silhouette should report attached torch socket');
equal(silhouette.torchSocketCount, 3, 'raider WebGL silhouette should see hand, tip, and flame sockets');

const tuningState = { game, tuning: createTuningState() };
assert(selectTuningEntity(tuningState, raiderId), 'tuning selection should accept raider humanoid actors');
equal(tuningState.tuning.selectedTuningKind, 'humanoid', 'raider tuning target should be humanoid');
equal(tuningState.tuning.selectedProfileId, HumanoidProjectionId.RAIDER_TOP_DOWN_STICK, 'raider tuning should select humanoid profile id');
assert(tuningState.tuning.manifest.some((field) => field.path === 'torch.length'), 'raider tuning manifest should expose torch fields');

const tuned = setCreatureTuningValue(game.creatureTuning, HumanoidProjectionId.RAIDER_TOP_DOWN_STICK, 'limbs.armLength', 0.66);
assert(tuned.ok, 'humanoid tuning should accept raider limb field');
equal(getHumanoidProjectionProfile(HumanoidProjectionId.RAIDER_TOP_DOWN_STICK, tuned.tuning).limbs.armLength, 0.66, 'humanoid profile resolver should apply raider override');
