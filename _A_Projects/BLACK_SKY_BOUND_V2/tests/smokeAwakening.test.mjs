import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { getComponent } from '../src/ecs/world.js';
import { AbilityUnlockEventId } from '../src/data/abilityUnlockEvents.js';
import { SMOKE_AWAKENING, SmokeAwakeningCueId, SmokeAwakeningPhase } from '../src/data/smokeAwakening.js';
import { createDefaultPlayerProfile } from '../src/game/playerProfile.js';
import { applyAbilityUnlockEvent, canUseAbility } from '../src/game/playerAbilities.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { createSmokeAwakeningState, updateSmokeAwakening } from '../src/game/smokeAwakening.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildSmokeAwakeningProjection } from '../src/projection/smokeAwakeningProjection.js';
import { WebGLSmokeAwakeningLayer } from '../src/render/backends/webgl/layers/WebGLSmokeAwakeningLayer.js';
import { emitRadialSmokeBurst } from '../src/systems/smokeSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const game = createInitialGameState(createDemoMap(), { playerProfile: createDefaultPlayerProfile() });
const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
const scene = createSmokeAwakeningState({
  enabled: true,
  source: 'test_level_transition',
  startPhase: SmokeAwakeningPhase.BLACKOUT_HOLD,
  fromMapId: 'axiom_first_escape',
  mapId: 'axiom_second_approach',
  worldX: transform.x * 32,
  worldY: transform.y * 32,
  rotation: transform.rotation
});
const input = createInputHarness();
const state = { map: { id: 'axiom_second_approach' }, game, smokeAwakening: scene, playerProfile: createDefaultPlayerProfile() };

const inactive = createSmokeAwakeningState();
const inactiveProjection = buildSmokeAwakeningProjection({ game, smokeAwakening: inactive, playerProfile: createDefaultPlayerProfile() });
equal(inactive.phase, SmokeAwakeningPhase.INACTIVE, 'an awakening that never ran should identify itself as inactive rather than released');
equal(inactive.acceptedInputCount, 0, 'an awakening that never ran must not pre-fill accepted exhale input');
equal(inactive.unlockApplied, false, 'an awakening that never ran must not claim it applied an unlock');
equal(inactive.radialSmokeEmitted, false, 'an awakening that never ran must not claim it emitted smoke');
equal(inactive.diagnostics.releaseCount, 0, 'an awakening that never ran must not claim a release transition');
equal(inactiveProjection.pocket01, 0, 'an awakening that never ran must not project a stale clear-air pocket');

equal(scene.phase, SmokeAwakeningPhase.BLACKOUT_HOLD, 'destination awakening should preserve the opaque handoff before asking for breath input');
equal(scene.audio.events.length, 0, 'destination awakening must not replay the outgoing landing audio');
assert(!canUseAbility(game.world, game.dragonId, AbilityId.SMOKE_BURST), 'hatchling should enter the scene without smoke available');
let projection = buildSmokeAwakeningProjection(state);
equal(projection.smokeCoverage, 1, 'destination hold should preserve complete smoke coverage');
assert(projection.fullSmokeOpacity >= 0.98, 'blackout contract should be effectively opaque rather than a light vignette');
const blackoutLayer = new WebGLSmokeAwakeningLayer();
blackoutLayer.update({ smokeAwakening: projection }, { camera: { viewportW: 1280, viewportH: 720 } });
assert(blackoutLayer.rects.some((entry) => entry.color[3] >= 0.98), 'arrival renderer should contain a full-screen opaque smoke primitive');
equal(projection.raiderShadows.length, 0, 'destination projection must never fabricate screen-space raider substitutes');
equal(projection.narrative.mamaVisibility, 'offscreen_only', 'scene contract should explicitly keep Mama outside the frame');
equal(projection.narrative.timeOfDay, 'night', 'smoke awakening must preserve the story-wide night setting');

updateSmokeAwakening({ scene, input, realDt: SMOKE_AWAKENING.timing.blackoutHoldSeconds - 0.1 });
equal(scene.phase, SmokeAwakeningPhase.BLACKOUT_HOLD, 'blackout should remain held for a noticeable multi-second interval');
equal(scene.acceptedInputCount, 0, 'held blackout must not advance the breathing lesson');
updateSmokeAwakening({ scene, input, realDt: 0.11 });
equal(scene.phase, SmokeAwakeningPhase.EXHALE, 'the held blackout should hand off to the breathing beat');
input.click(2);
updateSmokeAwakening({ scene, input, realDt: 0.1 });
equal(scene.acceptedInputCount, 0, 'RMB before the restrained prompt reveal must not skip the first cough');
updateSmokeAwakening({ scene, input, realDt: SMOKE_AWAKENING.timing.promptDelaySeconds });
projection = buildSmokeAwakeningProjection(state);
equal(projection.prompt?.title, 'EXHALE', 'interactive language should describe breathing rather than announcing an ability unlock');
assert(projection.prompt?.bindings.includes('RMB'), 'instinct projection should carry the canonical smoke binding');

for (let stage = 1; stage <= scene.requiredInputCount; stage += 1) {
  input.click(2);
  const result = updateSmokeAwakening({ scene, input, realDt: 0.01 });
  equal(scene.acceptedInputCount, stage, `deliberate exhale edge ${stage} should advance exactly one stage`);
  if (stage < scene.requiredInputCount) {
    assert(!result.finalExhaleNow, 'weak coughs should not unlock smoke early');
    updateSmokeAwakening({ scene, input, realDt: SMOKE_AWAKENING.timing.inputCooldownSeconds + 0.01 });
  } else {
    assert(result.finalExhaleNow, 'third exhale should publish the one-shot unlock seam');
  }
}
equal(scene.phase, SmokeAwakeningPhase.CLEARING, 'final exhale should open a clear-air pocket before gameplay resumes');

const receipt = applyAbilityUnlockEvent(game.world, game.dragonId, AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED);
assert(receipt.ok && receipt.grants.includes(AbilityId.SMOKE_BURST), 'scene completion should grant radial smoke through canonical progression');
const spawned = emitRadialSmokeBurst(game, game.dragonId, { actionId: 'smoke_instinct_exhale', reason: 'test_first_exhale' });
equal(spawned.length, 8, 'first full exhale should use the real radial smoke emission within the active-cloud budget');
syncGameViews(game);
const awakeningSmoke = game.smokeSources.filter((source) => source.sourceKind === 'dragon_smoke_cloud');
equal(awakeningSmoke.length, spawned.length, 'runtime views should expose every awakening smoke puff');
assert(awakeningSmoke.every((source) => source.shape === 'radial_soft_disc_burst'), 'awakening smoke should remain radial in renderer-neutral runtime views');

scene.unlockApplied = true;
scene.radialSmokeEmitted = true;
wyvernProjectionSystem({ state, game, dt: 1 / 60 });
syncGameViews(game);
const player = game.actors.find((actor) => actor.id === game.dragonId);
assert(player.wyvernProjection.proceduralPose.smokeAwakeningState?.fullExhale01 > 0.9, 'clear-pocket beat should be embodied in the canonical hatchling rig');

projection = buildSmokeAwakeningProjection(state);
assert(projection.pocket01 >= 0.5 && projection.smokeCoverage > 0.7, 'full exhale should reveal a local pocket while heavy smoke remains at the edges');
const layer = new WebGLSmokeAwakeningLayer();
layer.update({ smokeAwakening: projection }, { camera: { viewportW: 1280, viewportH: 720 } });
assert(layer.objectCount > 12 && layer.status === 'active', 'WebGL scene layer should build a substantial but bounded smoke vignette packet');

updateSmokeAwakening({ scene, input, realDt: SMOKE_AWAKENING.timing.clearingSeconds + 0.01 });
equal(scene.phase, SmokeAwakeningPhase.RELEASED, 'bounded clearing beat should return control inside Level 2');
equal(scene.diagnostics.releaseCount, 1, 'instinct scene should release exactly once');

const reduced = createSmokeAwakeningState({ enabled: true, worldX: 200, worldY: 300 });
const reducedProjection = buildSmokeAwakeningProjection({
  map: { id: 'axiom_second_approach' },
  smokeAwakening: reduced,
  playerProfile: { settings: { reducedMotion: true } }
});
equal(reducedProjection.camera.impulseWorldX, 0, 'destination breathing beat should not replay impact camera shake');
equal(reducedProjection.camera.impulseWorldY, 0, 'destination breathing beat should keep its camera anchored');

const noRaiderGame = { ...game, actors: game.actors.filter((actor) => actor.type !== 'raider') };
const noRaiderProjection = buildSmokeAwakeningProjection({
  game: noRaiderGame,
  smokeAwakening: { ...reduced, phase: SmokeAwakeningPhase.SCATTER },
  playerProfile: { settings: { reducedMotion: false } }
});
equal(noRaiderProjection.raiderShadows.length, 0, 'the vignette must not invent raiders when the destination roster contains none');

function createInputHarness() {
  const clicks = new Set();
  return {
    pointer: { x: 0, y: 0, down: false, button: -1 },
    click(button) { clicks.add(button); },
    consumePointerClick(button) {
      const pressed = clicks.has(button);
      clicks.delete(button);
      return pressed;
    },
    wasPointerPressed(button) { return clicks.has(button); },
    isDown() { return false; },
    wasPressed() { return false; }
  };
}
