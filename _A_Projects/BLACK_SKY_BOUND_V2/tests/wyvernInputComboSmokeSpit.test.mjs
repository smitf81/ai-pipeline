import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { AbilityId } from '../src/constants/abilityIds.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { WYVERN_ACTION_PROFILES, WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { SmokeSourceKind } from '../src/data/smokeSources.js';
import { getComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createDemoMap } from '../src/world/map.js';
import { createCamera, worldToScreen } from '../src/render/camera.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { WebGLFogSmokeLayer } from '../src/render/backends/webgl/layers/WebGLFogSmokeLayer.js';
import { inputSystem } from '../src/systems/inputSystem.js';
import { combatSystem } from '../src/systems/combatSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { wyvernActionImpulseSystem } from '../src/systems/wyvernActionImpulseSystem.js';
import { smokeSystem } from '../src/systems/smokeSystem.js';
import { lifetimeSystem } from '../src/systems/lifetimeSystem.js';
import { proceduralActionSystem, startProceduralAction } from '../src/systems/proceduralActionState.js';
import { applyAbilityUnlockEvent, grantAbility } from '../src/game/playerAbilities.js';
import { AbilityUnlockEventId } from '../src/data/abilityUnlockEvents.js';

const inputHarness = createHarness();
applyInput(inputHarness, { clicks: [0] });
let intent = playerIntent(inputHarness.game);
assert(intent.melee && intent.bite, 'left click should request melee combo intent');
assert(!intent.smoke && !intent.lunge, 'left click should not request smoke or lunge');

applyInput(inputHarness, { clicks: [2] });
intent = playerIntent(inputHarness.game);
assert(!intent.smoke && intent.smokeAbilityId === null, 'right click should not request smoke before the Level 2 instinct unlock');
assert(!intent.melee && !intent.lunge, 'right click should not request melee or lunge');
applyAbilityUnlockEvent(inputHarness.game.world, inputHarness.game.dragonId, AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED);
applyInput(inputHarness, { clicks: [2] });
intent = playerIntent(inputHarness.game);
assert(intent.smoke && intent.smokeAbilityId === AbilityId.SMOKE_BURST, 'awakened smoke input should resolve to the first uncontrolled radial burst');

applyInput(inputHarness, { pressed: [' '] });
intent = playerIntent(inputHarness.game);
assert(intent.dodge, 'Spacebar should request immediate dodge intent');
assert(!intent.lunge && !intent.melee && !intent.smoke, 'Spacebar should not request lunge, melee, or smoke');

applyInput(inputHarness, { pressed: ['q'] });
intent = playerIntent(inputHarness.game);
assert(intent.lunge, 'Q should preserve the body-lunge action intent');
assert(!intent.dodge && !intent.melee && !intent.smoke, 'Q should not request dodge, melee, or smoke');

const combo = createHarness();
requestMelee(combo, 0);
equal(actionState(combo.game).actionId, WyvernActionId.LEFT_CLAW_SWIPE, 'first valid melee click should start left claw');
equal(comboState(combo.game).index, 1, 'combo should advance after left claw starts');

const firstAction = actionState(combo.game).actionId;
cooldowns(combo.game).bite = 0;
requestMelee(combo, 0);
equal(actionState(combo.game).actionId, firstAction, 'active non-interruptible action should not be replaced by another combo click');
equal(comboState(combo.game).index, 1, 'blocked combo click should not advance the combo index');

finishAction(combo);
requestMelee(combo, 0.12);
equal(actionState(combo.game).actionId, WyvernActionId.RIGHT_CLAW_SWIPE, 'second valid melee click should start right claw');
equal(actionState(combo.game).side, 1, 'right claw action should lock the right side');

finishAction(combo);
requestMelee(combo, 0.12);
equal(actionState(combo.game).actionId, WyvernActionId.BITE_ATTACK, 'third valid melee click should start bite attack');

finishAction(combo);
combatSystem({ game: combo.game, dt: comboState(combo.game).resetTimeout + 0.05 });
requestMelee(combo, 0);
equal(actionState(combo.game).actionId, WyvernActionId.LEFT_CLAW_SWIPE, 'combo should reset to left claw after timeout');

const smokeInput = createHarness();
applyAbilityUnlockEvent(smokeInput.game.world, smokeInput.game.dragonId, AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED);
applyInput(smokeInput, { clicks: [2] });
combatSystem({ game: smokeInput.game, dt: 0 });
equal(actionState(smokeInput.game).actionId, WyvernActionId.SMOKE_BURST, 'first unlocked right click should start the uncontrolled radial smoke action');
const radialProfile = WYVERN_ACTION_PROFILES[WyvernActionId.SMOKE_BURST];
proceduralActionSystem({ game: smokeInput.game, dt: radialProfile.duration * 0.5 });
wyvernProjectionSystem({ game: smokeInput.game, dt: radialProfile.duration * 0.5 });
smokeSystem({ game: smokeInput.game });
syncGameViews(smokeInput.game);
const radialViews = smokeInput.game.smokeSources.filter((source) => source.sourceKind === SmokeSourceKind.DRAGON_SMOKE_CLOUD);
equal(radialViews.length, radialProfile.smokeEmission.puffCount, 'radial action should emit one bounded ring and core through the canonical smoke system');
assert(radialViews.every((source) => source.shape === 'radial_soft_disc_burst'), 'first smoke packets should declare uncontrolled radial geometry');
const radialOrigin = playerTransform(smokeInput.game);
assert(Math.min(...radialViews.map((source) => source.x)) < radialOrigin.x && Math.max(...radialViews.map((source) => source.x)) > radialOrigin.x, 'radial smoke should expand to both sides of the hatchling rather than target the pointer');

const laterSmokeInput = createHarness();
grantAbility(laterSmokeInput.game.world, laterSmokeInput.game.dragonId, AbilityId.SMOKE_SPIT, 'future_control_test');
applyInput(laterSmokeInput, { clicks: [2] });
combatSystem({ game: laterSmokeInput.game, dt: 0 });
equal(actionState(laterSmokeInput.game).actionId, WyvernActionId.SMOKE_SPIT, 'the existing directional smoke action should remain wired behind its later progression lock');

const lunge = createHarness();
applyInput(lunge, { pressed: ['q'] });
combatSystem({ game: lunge.game, dt: 0 });
equal(actionState(lunge.game).actionId, WyvernActionId.LUNGE_ATTACK, 'Q should start lunge_attack action through combat wiring');
const beforeLungeX = playerTransform(lunge.game).x;
proceduralActionSystem({ game: lunge.game, dt: WYVERN_ACTION_PROFILES[WyvernActionId.LUNGE_ATTACK].duration * 0.35 });
wyvernActionImpulseSystem({ game: lunge.game, map: lunge.map, dt: 1 / 30 });
wyvernProjectionSystem({ game: lunge.game, dt: 1 / 30 });
assert(playerTransform(lunge.game).x > beforeLungeX, 'lunge impulse should move the player forward through collision-safe movement');

const smoke = createHarness();
const transform = playerTransform(smoke.game);
transform.rotation = 0;
startProceduralAction(smoke.game.world, smoke.game.dragonId, WyvernActionId.SMOKE_SPIT, {
  sourceAbilityId: AbilityId.SMOKE_SPIT,
  aimX: transform.x + 5,
  aimY: transform.y
});
const profile = WYVERN_ACTION_PROFILES[WyvernActionId.SMOKE_SPIT];
proceduralActionSystem({ game: smoke.game, dt: profile.duration * 0.2 });
wyvernProjectionSystem({ game: smoke.game, dt: profile.duration * 0.2 });
smokeSystem({ game: smoke.game });
equal(smokeCloudCount(smoke.game), 0, 'smoke should not emit before the profile emission phase');

proceduralActionSystem({ game: smoke.game, dt: profile.duration * 0.2 });
wyvernProjectionSystem({ game: smoke.game, dt: profile.duration * 0.2 });
const mouth = getComponent(smoke.game.world, smoke.game.dragonId, ComponentType.ProceduralPose).sockets.mouth;
smokeSystem({ game: smoke.game });
equal(smokeCloudCount(smoke.game), profile.smokeEmission.puffCount, 'smoke should emit one bounded puff chain during the emission phase');
smokeSystem({ game: smoke.game });
equal(smokeCloudCount(smoke.game), profile.smokeEmission.puffCount, 'same smoke action should not spawn forever while still in the emission phase');

syncGameViews(smoke.game);
const plumeViews = smoke.game.smokeSources.filter((source) => source.sourceKind === SmokeSourceKind.DRAGON_SMOKE_PLUME);
equal(plumeViews.length, profile.smokeEmission.puffCount, 'smoke source views should expose the forward plume puffs');
assert(plumeViews.every((source) => source.shape === 'forward_soft_disc_chain'), 'plume packets should declare a soft disc chain shape');
assert(Math.max(...plumeViews.map((source) => source.x)) > mouth.x + 0.5, 'plume should project forward from the mouth socket');
assert(plumeViews.every((source) => source.opacity > 0 && source.softness >= 0.9), 'plume packets should carry fade/softness values');

const projection = buildRenderProjection({
  time: 0,
  map: smoke.map,
  game: smoke.game,
  camera: smoke.camera
}, CONFIG);
const plumePackets = projection.fogSmoke.filter((source) => source.sourceKind === SmokeSourceKind.DRAGON_SMOKE_PLUME);
equal(plumePackets.length, profile.smokeEmission.puffCount, 'render projection should carry smoke plume packets');
assert(plumePackets.every((packet) => packet.classification === 'renderer_neutral_fog_smoke_projection'), 'plume render packets should remain renderer-neutral');
assert(plumePackets.every((packet) => packet.plumeId && Number.isInteger(packet.segmentIndex)), 'plume render packets should carry segment metadata');

const fogLayer = new WebGLFogSmokeLayer();
fogLayer.update({ fogSmoke: plumePackets }, { camera: fakeLayerCamera(), lightSpaceCulling: null });
equal(fogLayer.sourceCount, plumePackets.length, 'WebGL fog/smoke layer should receive plume packets as source primitives');
assert(fogLayer.smokePrimitiveCount > plumePackets.length, 'WebGL plume rendering should break source packets into layered smoke radials');
equal(fogLayer.scatterPrimitiveCount, 0, 'WebGL smoke scatter should stay inactive without projected lights');
assert(fogLayer.radials.every((radial) => radial.softness >= 0.9), 'WebGL plume radials should stay soft discs, not square packets');

fogLayer.update({
  fogSmoke: plumePackets,
  lights: [{
    id: 'test:torch-near-smoke',
    enabled: true,
    worldX: plumePackets[0].worldX + plumePackets[0].radius * 0.25,
    worldY: plumePackets[0].worldY,
    radius: plumePackets[0].radius * 1.4,
    intensity: 1,
    effectiveIntensity: 1,
    colour: 'rgba(255,154,72,0.85)',
    innerColour: 'rgba(255,226,170,1)'
  }]
}, { camera: fakeLayerCamera(), lightSpaceCulling: null });
assert(fogLayer.scatterPrimitiveCount > 0, 'WebGL smoke should add warm scatter radials when projected lights overlap plume density');
assert(fogLayer.contributingLightCount > 0, 'WebGL smoke diagnostics should count overlapping scatter lights');

lifetimeSystem({ game: smoke.game, dt: 10 });
equal(smokeCloudCount(smoke.game), 0, 'smoke plume puffs should expire and clean up through lifetime system');

const fogSmokeSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLFogSmokeLayer.js', import.meta.url), 'utf8');
assert(!fogSmokeSource.includes('state.game'), 'WebGL fog/smoke layer should not read gameplay state directly');
equal(RENDER_BUDGETS.renderer.canvas2dRuntimeAvailable, false, 'Canvas 2D runtime fallback should remain unavailable');

function createHarness() {
  const map = createDemoMap();
  const game = createInitialGameState(map);
  const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
  return { map, game, camera, state: { map, game, camera } };
}

function applyInput(harness, options) {
  inputSystem({ state: harness.state, input: fakeInput(harness, options) });
}

function fakeInput(harness, { clicks = [], pressed = [] } = {}) {
  const transform = playerTransform(harness.game);
  const pointer = worldToScreen(harness.camera, (transform.x + 5) * CONFIG.tileSize, transform.y * CONFIG.tileSize);
  const clickSet = new Set(clicks);
  const pressedSet = new Set(pressed.map((key) => key.toLowerCase()));
  return {
    pointer,
    isDown() { return false; },
    wasPressed(key) { return pressedSet.has(key.toLowerCase()); },
    consumePointerClick(button) {
      const value = clickSet.has(button);
      clickSet.delete(button);
      return value;
    }
  };
}

function requestMelee(harness, dt) {
  const intent = playerIntent(harness.game);
  intent.melee = true;
  intent.bite = true;
  intent.smoke = false;
  intent.lunge = false;
  intent.aimX = playerTransform(harness.game).x + 5;
  intent.aimY = playerTransform(harness.game).y;
  combatSystem({ game: harness.game, dt });
  intent.melee = false;
  intent.bite = false;
  cooldowns(harness.game).bite = 0;
}

function finishAction(harness) {
  const active = actionState(harness.game).actionId;
  const duration = WYVERN_ACTION_PROFILES[active]?.duration ?? 1;
  proceduralActionSystem({ game: harness.game, dt: duration + 0.02 });
  wyvernProjectionSystem({ game: harness.game, dt: duration + 0.02 });
  cooldowns(harness.game).bite = 0;
}

function fakeLayerCamera() {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    viewportW: 4096,
    viewportH: 4096,
    visibleWorldBounds() {
      return { left: -10000, top: -10000, right: 10000, bottom: 10000 };
    }
  };
}

function playerIntent(game) {
  return getComponent(game.world, game.dragonId, ComponentType.PlayerIntent);
}

function actionState(game) {
  return getComponent(game.world, game.dragonId, ComponentType.ActionState);
}

function comboState(game) {
  return getComponent(game.world, game.dragonId, ComponentType.ComboState);
}

function cooldowns(game) {
  return getComponent(game.world, game.dragonId, ComponentType.Cooldowns);
}

function playerTransform(game) {
  return getComponent(game.world, game.dragonId, ComponentType.Transform);
}

function smokeCloudCount(game) {
  return query(game.world, [ComponentType.SmokeCloud]).length;
}
