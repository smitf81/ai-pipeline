import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { ACTORS } from '../src/data/actors.js';
import { BodyStateProfileId, getBodyStateProfile } from '../src/data/bodyStateFeedback.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createCamera } from '../src/render/camera.js';
import { WebGLHudDebugLayer } from '../src/render/backends/webgl/layers/WebGLHudDebugLayer.js';
import { WebGLPostProcessLayer } from '../src/render/backends/webgl/layers/WebGLPostProcessLayer.js';
import { buildBodyStateProjection, resolveDangerPressure } from '../src/projection/bodyStateProjection.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { applyDamageToEntity, healthSystem } from '../src/systems/healthSystem.js';
import { createDemoMap } from '../src/world/map.js';

const profile = getBodyStateProfile(BodyStateProfileId.YOUNG_DRAGON_SURVIVAL);
equal(ACTORS[EntityKind.YOUNG_DRAGON].hp, profile.health.maxHealth, 'player max health should be owned by body-state tuning');
equal(resolveDangerPressure(.62, profile.health.visualOnsetRatio, profile.health.dangerCurveExponent), 0, 'health pressure should remain absent at its visual onset');
assert(resolveDangerPressure(.5, profile.health.visualOnsetRatio, profile.health.dangerCurveExponent) < .15, 'moderate damage should retain only a faint pressure signal');
assert(resolveDangerPressure(.35, profile.health.visualOnsetRatio, profile.health.dangerCurveExponent) > .25, 'health pressure should become clearly legible at the critical boundary');
assert(resolveDangerPressure(.15, profile.health.visualOnsetRatio, profile.health.dangerCurveExponent) > .65, 'near-death pressure should accelerate into the terminal range');
equal(resolveDangerPressure(.42, profile.stamina.lowThreshold, profile.stamina.dangerCurveExponent), 0, 'stamina pressure should remain absent at its onset');
assert(resolveDangerPressure(.3, profile.stamina.lowThreshold, profile.stamina.dangerCurveExponent) > .18, 'thirty-percent stamina should begin constraining peripheral vision');
assert(resolveDangerPressure(.15, profile.stamina.lowThreshold, profile.stamina.dangerCurveExponent) > .55, 'critical stamina should be unmistakable without a whole-screen wash');

const harness = createHarness();
const playerHealth = component(harness, harness.game.dragonId, ComponentType.Health);
equal(playerHealth.regenDelayMs, profile.health.regenDelayMs, 'player health should carry the tuned no-hit recovery delay');
equal(playerHealth.regenPerSecond, profile.health.regenPerSecond, 'player health should carry the tuned regen rate');

applyDamageToEntity(harness.game.world, harness.game.dragonId, 40, 'test', 'test_pressure');
equal(playerHealth.hp, profile.health.maxHealth - 40, 'damage should still reduce canonical health immediately');
equal(playerHealth.recoveryDelayRemainingMs, profile.health.regenDelayMs, 'damage should pause health recovery');
equal(playerHealth.hitPulseRemainingMs, profile.health.hitPulseDurationMs, 'damage should start a bounded hit pulse');

healthSystem({ game: harness.game, dt: (profile.health.regenDelayMs - 200) / 1000 });
equal(playerHealth.hp, profile.health.maxHealth - 40, 'health should not recover before the no-hit delay expires');

healthSystem({ game: harness.game, dt: 0.5 });
assert(playerHealth.hp > profile.health.maxHealth - 40, 'health should recover after the safe delay');
assert(playerHealth.hp < profile.health.maxHealth - 35, 'health recovery should be gradual rather than a full refill');
assert(playerHealth.pressure > 0 && playerHealth.pressure < 1, 'health pressure should track missing health');

const hpBeforeResetHit = playerHealth.hp;
applyDamageToEntity(harness.game.world, harness.game.dragonId, 5, 'test', 'delay_reset');
equal(playerHealth.recoveryDelayRemainingMs, profile.health.regenDelayMs, 'new damage should reset the recovery delay');
syncGameViews(harness.game);
const hitBodyState = buildBodyStateProjection(harness.game, 0.25);
assert(hitBodyState.health.pressure > 0, 'body-state projection should expose health pressure');
assert(hitBodyState.health.hitPulse > 0, 'body-state projection should expose recent-damage pulse');
equal(hitBodyState.health.recoveryBlockedByThreat, false, 'non-hostile test damage should not invent a pursuit blocker');
healthSystem({ game: harness.game, dt: (profile.health.regenDelayMs - 100) / 1000 });
equal(playerHealth.hp, hpBeforeResetHit - 5, 'reset delay should prevent immediate regen after a new hit');

const enemy = harness.game.actors.find((actor) => actor.team !== 'player');
const enemyHealth = component(harness, enemy.id, ComponentType.Health);
applyDamageToEntity(harness.game.world, enemy.id, 5, harness.game.dragonId, 'enemy_no_regen');
healthSystem({ game: harness.game, dt: 10 });
equal(enemyHealth.hp, enemy.maxHp - 5, 'enemy health should not inherit player pressure regeneration');

applyDamageToEntity(harness.game.world, harness.game.dragonId, 20, 'test', 'projection_pressure');
syncGameViews(harness.game);
let bodyState = buildBodyStateProjection(harness.game, 0.25);
assert(bodyState.health.pressure > 0, 'body-state projection should expose health pressure');

const stamina = component(harness, harness.game.dragonId, ComponentType.Stamina);
stamina.current = 4;
stamina.state = 'exhausted';
syncGameViews(harness.game);
bodyState = buildBodyStateProjection(harness.game, 0.35);
assert(bodyState.stamina.pressure > 0.55, 'low stamina should project cool edge pressure');
assert(bodyState.stamina.breathPulse > 0, 'stamina exhaustion should project a breath pulse');

const renderProjection = buildRenderProjection({
  time: 0.35,
  map: harness.map,
  game: harness.game,
  camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, harness.map)
}, CONFIG);
equal(renderProjection.bodyState.classification, 'renderer_neutral_body_state_feedback_v0', 'render projection should carry body-state feedback');
assert(renderProjection.bodyState.postProcess.healthPressure > 0, 'post-process packet should include health pressure');
assert(renderProjection.bodyState.postProcess.staminaPressure > 0, 'post-process packet should include stamina pressure');

const hudLayer = new WebGLHudDebugLayer();
const oldLocation = globalThis.location;
globalThis.location = { search: '' };
hudLayer.update(renderProjection, { camera: { viewportW: 1280, viewportH: 720 }, status: {} });
equal(hudLayer.rects.length, 0, 'normal gameplay should not render permanent HP/stamina bars');
globalThis.location = { search: '?debugHud=1' };
hudLayer.update(renderProjection, { camera: { viewportW: 1280, viewportH: 720 }, status: {} });
assert(hudLayer.rects.length > 0 && hudLayer.debugVisible, 'debug HUD query should expose raw body values');
const postProcessLayer = new WebGLPostProcessLayer();
globalThis.location = { search: '?bodyState=0' };
postProcessLayer.update(renderProjection);
equal(postProcessLayer.statsFields().bodyStateEnabled, false, 'body-state overlay should support query disable');
globalThis.location = { search: '' };
postProcessLayer.update(renderProjection);
equal(postProcessLayer.statsFields().bodyStateEnabled, true, 'body-state overlay should default on from config');
globalThis.location = oldLocation;

const postProcessSource = readFileSync(new URL('../src/render/backends/webgl/WebGLPostProcessPipeline.js', import.meta.url), 'utf8');
assert(postProcessSource.includes('u_healthPressure'), 'post-process shader should own health pressure feedback');
assert(postProcessSource.includes('u_staminaPressure'), 'post-process shader should own stamina pressure feedback');
assert(postProcessSource.includes('WEBGL_BODY_STATE_POST_PROCESS_MODE'), 'post-process diagnostics should name the body-state mode');

function createHarness() {
  const map = createDemoMap();
  const game = createInitialGameState(map);
  return { map, game };
}

function component(harness, entity, type) {
  return getComponent(harness.game.world, entity, type);
}
