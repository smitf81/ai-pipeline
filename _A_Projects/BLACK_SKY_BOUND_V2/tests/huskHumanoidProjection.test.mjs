import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { ACTORS } from '../src/data/actors.js';
import { setCreatureTuningValue } from '../src/data/creatures/creatureTuning.js';
import { HumanoidEmbodimentId, HumanoidProjectionId, getHumanoidProjectionProfile } from '../src/data/humanoids/raiderHumanoid.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { CONFIG } from '../src/config.js';
import { buildActorProjection3D } from '../src/projection/actorProjection3D.js';
import { createCamera } from '../src/render/camera.js';
import { buildWebGLRaiderHumanoidSilhouette } from '../src/render/backends/webgl/WebGLHumanoidSilhouette.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { createTuningState, selectTuningEntity } from '../src/tuning/tuningRuntime.js';
import { createDemoMap } from '../src/world/map.js';

equal(ACTORS[EntityKind.HUSK].silhouette, 'humanoid', 'husk should now use the shared humanoid silhouette family');
equal(ACTORS[EntityKind.HUSK].humanoidProjection, HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER, 'husk should use the shambler humanoid profile');
equal(ACTORS[EntityKind.HUSK].lightEmitter, undefined, 'husk should remain unlit and torchless');
equal(getHumanoidProjectionProfile(HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER).embodimentId, HumanoidEmbodimentId.INK_STICK, 'husk profile should own the shared bold stick embodiment');

const map = createDemoMap();
const game = createInitialGameState(map);
const huskId = spawnActor(game.world, EntityKind.HUSK, 18.5, 12.5);
const humanoid = getComponent(game.world, huskId, ComponentType.HumanoidProjection);
const light = getComponent(game.world, huskId, ComponentType.LightEmitter);
assert(humanoid, 'spawned husk should receive HumanoidProjection');
equal(light, null, 'spawned husk should not receive a torch light emitter');

humanoidProjectionSystem({ game, dt: 1 / 60 });
assert(humanoid.points.head && humanoid.points.leftHand && humanoid.points.rightFoot, 'husk projection should solve core humanoid points');
assert(humanoid.sockets.leftHand && humanoid.sockets.rightHand && humanoid.sockets.head, 'husk projection should expose shared humanoid sockets');
equal(humanoid.sockets.torchHand, undefined, 'husk projection should not expose torch sockets');
equal(humanoid.motionState, 'idle', 'stationary husk should idle before movement');

const transform = getComponent(game.world, huskId, ComponentType.Transform);
const phaseBefore = humanoid.gaitPhase;
transform.x += 0.18;
transform.y += 0.03;
humanoidProjectionSystem({ game, dt: 1 / 60 });
assert(humanoid.gaitPhase > phaseBefore, 'husk gait phase should advance when it moves');
equal(humanoid.motionState, 'shamble', 'moving husk should enter the shamble motion state');

syncGameViews(game);
const huskView = game.actors.find((actor) => actor.id === huskId);
assert(huskView.humanoidProjection, 'projected husk actor should carry the humanoid projection payload');
equal(huskView.lightEmitter, null, 'projected husk actor should remain unlit');

const projection = buildRenderProjection({ game, map, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map), time: 0 }, CONFIG);
const actorPacket = projection.actors.find((actor) => actor.id === huskId);
assert(actorPacket?.humanoidProjection, 'render projection should include the husk humanoid packet');
equal(actorPacket.humanoidProjection.classification, 'renderer_neutral_humanoid_visual_projection', 'husk humanoid packet should stay renderer-neutral');
equal(actorPacket.humanoidProjection.profileId, HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER, 'husk packet should preserve the shambler profile id');
equal(actorPacket.humanoidProjection.motionState, 'shamble', 'husk packet should preserve the shamble motion state');
equal(actorPacket.humanoidProjection.sockets.torchHand, undefined, 'husk packet should not invent torch sockets');

const actorPacket3D = buildActorProjection3D(game.actors, CONFIG.tileSize, game.creatureTuning).find((actor) => actor.id === huskId);
equal(actorPacket3D.humanoidProjection.embodimentId, HumanoidEmbodimentId.INK_STICK, '3D husk packet should route the shared stick embodiment without a creature recipe');

const silhouette = buildWebGLRaiderHumanoidSilhouette(actorPacket);
assert(silhouette?.triangles.length > 18, 'husk humanoid silhouette should build visible mesh triangles');
equal(silhouette.torchAttached, false, 'husk silhouette should not report a torch attachment');
equal(silhouette.torchSocketCount, 0, 'husk silhouette should not report torch sockets');

const tuningState = { game, tuning: createTuningState() };
assert(selectTuningEntity(tuningState, huskId), 'tuning selection should accept husk humanoid actors');
equal(tuningState.tuning.selectedTuningKind, 'humanoid', 'husk tuning target should use the humanoid tuning lane');
equal(tuningState.tuning.selectedProfileId, HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER, 'husk tuning should select the shambler profile id');

const tuned = setCreatureTuningValue(game.creatureTuning, HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER, 'limbs.armLength', 0.7);
assert(tuned.ok, 'humanoid tuning should accept husk limb overrides');
equal(getHumanoidProjectionProfile(HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER, tuned.tuning).limbs.armLength, 0.7, 'humanoid profile resolver should apply husk overrides');
