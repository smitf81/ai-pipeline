import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { createAudioDirector } from '../src/audio/audioDirector.js';
import { startDecodedFileVoice } from '../src/audio/audioFileVoice.js';
import { AudioAssetBank } from '../src/audio/audioAssetBank.js';
import { getSoundCue, validateSoundManifest } from '../src/audio/soundManifest.js';
import { AudioEventType } from '../src/audio/soundEvents.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EventType } from '../src/constants/eventTypes.js';
import { WyvernActionId } from '../src/data/creatures/groundedWyvernMotionProfiles.js';
import { emitEvent } from '../src/ecs/events.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createAudioEventQueue } from '../src/audio/soundEvents.js';
import { startProceduralAction } from '../src/systems/proceduralActionState.js';
import { applyDamageToEntity } from '../src/systems/healthSystem.js';
import { createDemoMap } from '../src/world/map.js';
import { SceneLightSourceKind } from '../src/data/sceneLights.js';

const manifest = validateSoundManifest();
equal(manifest.ok, true, `sound manifest should validate: ${manifest.errors.join(', ')}`);
assert(manifest.cueCount >= 22, 'audio manifest should include loops, body, combat, enemy, storm, opening, and UI cues');

const queue = createAudioEventQueue();
queue.emit(AudioEventType.PLAYER_HIT, { intensity: 0.7 });
equal(queue.length, 1, 'audio event queue should accept gameplay-facing event names');
equal(queue.drain()[0].type, AudioEventType.PLAYER_HIT, 'audio event queue should drain emitted events');
equal(queue.length, 0, 'audio event queue should be empty after drain');

const harness = createHarness();
const director = createAudioDirector({ context: null });
let debug = director.update({ game: harness.game, time: 0, paused: false }, 1 / 60);
equal(debug.contract, 'black-sky-bound.audio-director.v0', 'debug state should expose the audio director contract');
assert(debug.loops['ambience.forest_night'], 'audio director should own the ambient loop');
assert(debug.loops['player.breath.calm'], 'audio director should own the calm breath loop');
assert(debug.loops['player.breath.strained'], 'audio director should own the strained breath loop');
assert(debug.loops['player.heartbeat'], 'audio director should own the heartbeat loop');
equal(debug.loops['player.heartbeat'].source, 'file', 'heartbeat diagnostics should expose decoded production playback');
equal(debug.loops['player.heartbeat'].file, 'assets/audio/production/player_heartbeat_01.wav', 'heartbeat diagnostics should expose the authored runtime asset');
equal(debug.loops['player.heartbeat'].tonal, false, 'heartbeat diagnostics should prove the loop is not a monitor-like tone');

const decodedHeartbeatSource = {
  buffer: null,
  loop: false,
  playbackRate: { setValueAtTime: (value) => { decodedHeartbeatSource.playbackRateValue = value; } },
  connect: (target) => { decodedHeartbeatSource.connectedTo = target; },
  start: (at) => { decodedHeartbeatSource.startedAt = at; }
};
const decodedHeartbeatOutput = {};
const decodedHeartbeatVoice = startDecodedFileVoice({
  assets: {
    select: () => ({
      file: 'assets/audio/production/player_heartbeat_01.wav',
      entry: { status: 'ready', buffer: { duration: 8.23025 } }
    })
  },
  bus: { context: { currentTime: 3.5, createBufferSource: () => decodedHeartbeatSource } },
  recordPlaybackError: () => { throw new Error('ready heartbeat asset should not record a playback error'); }
}, getSoundCue('player.heartbeat'), decodedHeartbeatOutput, 1, 0, true);
equal(decodedHeartbeatSource.loop, true, 'decoded heartbeat buffer source should be configured to loop');
equal(decodedHeartbeatSource.connectedTo, decodedHeartbeatOutput, 'decoded heartbeat should connect to the existing player-body gain');
equal(decodedHeartbeatSource.startedAt, 3.5, 'decoded heartbeat should begin at the current audio-context time');
equal(decodedHeartbeatVoice.mode, 'decoded_file_buffer_loop', 'decoded heartbeat diagnostics should identify the loop playback mode');

let finishDeferredPreload;
const deferredPreload = new Promise((resolve) => { finishDeferredPreload = resolve; });
const parameter = () => ({ value: 0, cancelScheduledValues() {}, setTargetAtTime(value) { this.value = value; } });
const node = () => ({ gain: parameter(), frequency: parameter(), Q: parameter(), connect() {}, disconnect() {} });
const delayedAssetBank = {
  preloadCues: () => deferredPreload,
  snapshot: () => ({ requiredReady: false, loadingCount: 1, errorCount: 0 }),
  select: () => null
};
const delayedDirector = createAudioDirector({
  context: {
    currentTime: 0,
    destination: {},
    createGain: node,
    createBiquadFilter: node,
    resume: () => Promise.resolve()
  },
  assetBank: delayedAssetBank
});
const delayedUnlock = delayedDirector.unlock();
equal(delayedDirector.unlocked, false, 'required file loops must remain locked while decoded assets are loading');
finishDeferredPreload([]);
await delayedUnlock;
equal(delayedDirector.unlocked, true, 'audio should unlock only after required preload work settles');

const stamina = getComponent(harness.game.world, harness.game.dragonId, ComponentType.Stamina);
stamina.current = 2;
stamina.state = 'exhausted';
syncGameViews(harness.game);
debug = director.update({ game: harness.game, time: 0.25, paused: false }, 1 / 60);
assert(debug.pressure.staminaPressure > 0.6, 'audio should read low stamina pressure from the shared body-state projection');
assert(
  debug.loops['player.breath.strained'].targetGain > debug.loops['player.breath.calm'].targetGain,
  'strained breath loop should overtake calm breath under low stamina'
);
assert(recentEvent(debug, AudioEventType.PLAYER_STAMINA_LOW), 'stamina pressure should emit a low-stamina audio event');

const eventCountBeforeHit = harness.game.world.events.length;
applyDamageToEntity(harness.game.world, harness.game.dragonId, 14, 'test_enemy', 'test_hit');
syncGameViews(harness.game);
debug = director.update({ game: harness.game, time: 0.32, paused: false }, 1 / 60);
assert(recentCue(debug, 'player.hit.light'), 'player damage should resolve to a player hit cue');
assert(debug.pressure.muffleIntensity > 0, 'player hit/health pressure should drive audio muffling');
equal(harness.game.world.events.length, eventCountBeforeHit + 1, 'audio observation should not drain ECS events');
const hitCueCount = recentCueCount(debug, 'player.hit.light');
debug = director.update({ game: harness.game, time: 0.34, paused: false }, 1 / 60);
equal(recentCueCount(debug, 'player.hit.light'), hitCueCount, 'a retained ECS event should not replay after the director has seen it');

startProceduralAction(harness.game.world, harness.game.dragonId, WyvernActionId.LEFT_CLAW_SWIPE, {
  aimX: playerTransform(harness.game).x + 4,
  aimY: playerTransform(harness.game).y
});
syncGameViews(harness.game);
debug = director.update({ game: harness.game, time: 0.42, paused: false }, 1 / 60);
assert(recentCue(debug, 'player.claw.swipe'), 'new claw actions should resolve to claw swipe audio');

emitEvent(harness.game.world, EventType.SMOKE_EMITTED, {
  source: harness.game.dragonId,
  radius: 0.92,
  puffCount: 7,
  sourceKind: 'dragon_smoke_plume'
});
debug = director.update({ game: harness.game, time: 0.5, paused: false }, 1 / 60);
assert(recentCue(debug, 'player.smoke.exhale'), 'smoke emission events should resolve to smoke exhale audio');

const pressureHarness = createHarness();
const pressureDirector = createAudioDirector({ context: null });
const enemy = pressureHarness.game.actors.find((actor) => actor.team !== 'player');
const enemyTransform = getComponent(pressureHarness.game.world, enemy.id, ComponentType.Transform);
enemyTransform.x = playerTransform(pressureHarness.game).x + 1.75;
enemyTransform.y = playerTransform(pressureHarness.game).y;
syncGameViews(pressureHarness.game);
debug = pressureDirector.update({ game: pressureHarness.game, time: 0, paused: false }, 1 / 60);
assert(debug.nearestEnemy && debug.nearestEnemy.distance < 2, 'audio director should inspect nearest enemy pressure');
assert(recentCue(debug, 'enemy.raider.near'), 'nearby enemies should emit a proximity warning cue');

const ai = getComponent(pressureHarness.game.world, enemy.id, ComponentType.EnemyPressureAI);
ai.attackPhase = 'windup';
ai.pendingAttackTargetId = pressureHarness.game.dragonId;
ai.activeAttackProfileId = 'raider_spear_thrust';
syncGameViews(pressureHarness.game);
debug = pressureDirector.update({ game: pressureHarness.game, time: 0.1, paused: false }, 1 / 60);
assert(recentCue(debug, 'enemy.raider.warn'), 'enemy attack windups should emit warning audio');
const warningCue = getSoundCue('enemy.raider.warn');
equal(warningCue.source, 'file', 'attack windups should resolve to recorded raider warnings');
equal(warningCue.required, true, 'raider warning assets should fail visibly rather than synthesize a fallback');
equal(warningCue.files.length, 5, 'raider warnings should expose enough recorded variants to avoid immediate repetition');
const warningBank = new AudioAssetBank({ context: null, fetchImpl: null });
const warningRotation = Array.from({ length: 10 }, (_, sequence) => warningBank.select(warningCue, sequence).file);
equal(new Set(warningRotation.slice(0, 5)).size, 5, 'the first warning cycle should select every authored variant once');
equal(warningRotation[5], warningRotation[0], 'raider warning selection should repeat only after a complete deterministic cycle');
const nearCueCountBeforePause = recentCueCount(debug, 'enemy.raider.near');
const warningCueCountBeforePause = recentCueCount(debug, 'enemy.raider.warn');
debug = pressureDirector.update({ game: pressureHarness.game, time: 0.1, paused: true }, 2);
equal(recentCueCount(debug, 'enemy.raider.near'), nearCueCountBeforePause, 'frozen nearby enemies must not repeat phantom proximity cues behind pause');
equal(recentCueCount(debug, 'enemy.raider.warn'), warningCueCountBeforePause, 'frozen attack windups must not repeat warning cues behind pause');
equal(debug.nearestEnemy, null, 'paused audio diagnostics should not imply a currently evaluated threat');
equal(debug.buses.enemies, 0, 'pause mix should silence active creature voices');
equal(debug.buses.combat, 0, 'pause mix should silence active combat voices');
assert(debug.buses.ambience > 0, 'pause mix should retain a quiet environmental bed for settings context');
assert(debug.buses.ui > 0, 'pause mix should retain UI feedback');
equal(debug.loops['player.heartbeat'].targetGain, 0, 'pause should zero the heartbeat voice target rather than only hiding it behind a bus');
equal(debug.loops['player.heartbeat'].active, false, 'pause should report the heartbeat voice as genuinely inactive');
equal(debug.loops['player.heartbeat'].suspended, true, 'pause diagnostics should expose the body-loop suspension contract');
equal(debug.loops['player.breath.calm'].active, false, 'calm breath should stop with the rest of the player body loops');
equal(debug.loops['player.breath.strained'].active, false, 'strained breath should stop with the rest of the player body loops');
equal(debug.pauseMix.active, true, 'audio diagnostics should expose that pause ducking is active');
equal(debug.pauseMix.mode, 'ui_live_ambience_duck_gameplay_silent', 'audio diagnostics should name the pause mix policy');

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const browserBootSource = readFileSync(new URL('../src/bootstrap/browserBoot.js', import.meta.url), 'utf8');
const runtimeTextSource = readFileSync(new URL('../src/debug/runtimeText.js', import.meta.url), 'utf8');
assert(appSource.includes("import { createAudioDirector } from './audio/audioDirector.js';"), 'app should import the audio director');
assert(appSource.includes('state.audio = audio.update(state, dt);'), 'app update loop should keep the audio director live');
assert(browserBootSource.includes('window.render_game_to_text = () => renderGameToText(app);'), 'browser boot should route runtime text through the debug serializer');
assert(runtimeTextSource.includes('audio: app.audio.getDebugState()'), 'runtime text output should expose audio debug state');

const openingDirector = createAudioDirector({ context: null });
const openingState = {
  game: harness.game,
  time: 0,
  paused: false,
  opening: {
    released: false,
    phase: 'cracking',
    emergenceProgress: 0,
    audio: {
      sequence: 2,
      cueId: 'opening.exterior.husk_through_shell',
      reason: 'test_husk',
      events: [
        { sequence: 1, cueId: 'opening.egg.crack', reason: 'test_crack', intensity: 0.72 },
        {
          sequence: 2,
          cueId: 'opening.exterior.husk_through_shell',
          reason: 'test_husk',
          intensity: 0.44,
          soundscapeId: 'husk_beyond_shell',
          perspective: 'deeply_muffled_nearby_threat'
          ,sourceRef: { ownerKind: 'actor', ownerId: harness.game.actors.find((actor) => actor.team !== 'player').id, emitterId: 'voice' }
        }
      ]
    }
  }
};
debug = openingDirector.update(openingState, 1 / 60);
assert(recentCue(debug, 'opening.egg.crack'), 'canonical opening audio state should route through the Audio Director');
assert(recentCue(debug, 'opening.exterior.husk_through_shell'), 'opening audio history should drain every unseen cue rather than dropping all but the latest one');
equal(debug.opening.active, true, 'audio diagnostics should expose the active inside-egg mix');
assert(debug.audioPerspective.effective.cutoffHz < 3000, 'inside-egg exterior voices should use the bounded shell-transmission filter');
const huskCue = debug.recentCues.find((cue) => cue.cueId === 'opening.exterior.husk_through_shell');
assert(huskCue.spatial?.distanceMeters > 0, 'opening cue diagnostics should prove the husk voice resolved from a world-space owner');
equal(huskCue.soundscapeId, 'husk_beyond_shell', 'opening cue diagnostics should retain authored soundscape provenance');

const playerVoiceRef = { ownerKind: 'actor', ownerId: harness.game.dragonId, emitterId: 'voice' };
openingState.opening.phase = 'emerging';
openingState.opening.openingProgress = 1;
openingState.opening.emergenceProgress = 0;
openingState.opening.audio.sequence = 3;
openingState.opening.audio.events.push({
  sequence: 3,
  cueId: 'player.voice.first_cry',
  reason: 'hatchling_first_cry_on_emergence',
  intensity: 1,
  soundscapeId: 'hatchling_first_cry',
  perspective: 'newborn_voice_inside_opening_shell',
  sourceRef: playerVoiceRef
});
debug = openingDirector.update(openingState, 1 / 60);
const firstCryCue = debug.recentCues.find((cue) => cue.cueId === 'player.voice.first_cry');
assert(firstCryCue?.spatial?.distanceMeters < 0.2, 'hatchling first cry should resolve at the player mouth instead of a distant or centred fallback');
equal(firstCryCue.sourceRef.ownerId, harness.game.dragonId, 'hatchling first cry should retain the exact player actor source ref');
equal(debug.recentCues.some((cue) => cue.reason === 'hatchling_first_cry_on_emergence' && cue.cueId.includes('mama')), false, 'first-cry transition must not invoke a Mama cue');
assert(debug.audioPerspective.effective.cutoffHz < 4000, 'the normal first-cry asset should receive live opening-enclosure filtering at emergence');

const lightningHarness = createHarness();
const lightningDirector = createAudioDirector({ context: null });
const lightningPlayer = lightningHarness.game.actors.find((actor) => actor.id === lightningHarness.game.dragonId);
lightningHarness.game.lights = [{
  id: 'storm_lightning:0:0',
  sourceKind: SceneLightSourceKind.LIGHTNING,
  flashStage: 'initial_flash',
  x: lightningPlayer.x + 18,
  y: lightningPlayer.y - 8,
  intensity: 1,
  stormEvent: {
    eventIndex: 0,
    eventStart: 21,
    sourceEventId: null
  }
}];
debug = lightningDirector.update({ game: lightningHarness.game, time: 21, paused: false }, 0.02);
equal(debug.lightning.pendingThunder.length, 1, 'lightning flash should schedule one distance-delayed thunder report');
assert(!recentCue(debug, 'world.storm.thunder'), 'thunder should not play on the lightning frame');
const thunderDelayMs = debug.lightning.pendingThunder[0].delayMs;
debug = lightningDirector.update({ game: lightningHarness.game, time: 21.5, paused: false }, thunderDelayMs / 1000 - 0.04);
assert(!recentCue(debug, 'world.storm.thunder'), 'thunder should remain pending until its distance delay expires');
debug = lightningDirector.update({ game: lightningHarness.game, time: 22, paused: false }, 0.08);
assert(recentCue(debug, 'world.storm.thunder'), 'storm thunder should succeed the visual lightning after the bounded delay');
assert(debug.lightning.cameraShake.active, 'thunder arrival should publish an active camera shake impulse');
equal(debug.lightning.cameraShake.sourcePolicy, 'delayed_thunder_arrival_only', 'camera shake should sync to thunder arrival rather than the earlier flash');
assert(
  debug.lightning.recentStrikes[0].firedAtMs > debug.lightning.recentStrikes[0].flashAtMs,
  'lightning diagnostics should preserve visible-flash-before-thunder ordering'
);

const mixDirector = createAudioDirector({ context: null });
debug = mixDirector.update({
  game: createHarness().game,
  time: 0,
  paused: false,
  playerProfile: { settings: { audio: { master: 0.5, ambience: 0.4, effects: 0.3 } } }
}, 1 / 60);
equal(debug.mix.master, 0.5, 'audio diagnostics should expose the live master preference');
equal(debug.mix.ambience, 0.4, 'audio diagnostics should expose the live ambience preference');
equal(debug.mix.effects, 0.3, 'audio diagnostics should expose the live effects preference');
equal(debug.buses.master, 0.41, 'master preference should scale the canonical master bus');
equal(debug.buses.ambience, 0.136, 'ambience preference should scale world and weather audio');
equal(debug.buses.player, 0.234, 'effects preference should scale player, enemy, combat, and UI audio');

function createHarness() {
  const map = createDemoMap();
  const game = createInitialGameState(map);
  syncGameViews(game);
  return { map, game };
}

function playerTransform(game) {
  return getComponent(game.world, game.dragonId, ComponentType.Transform);
}

function recentCue(debug, cueId) {
  return debug.recentCues.some((cue) => cue.cueId === cueId);
}

function recentCueCount(debug, cueId) {
  return debug.recentCues.filter((cue) => cue.cueId === cueId).length;
}

function recentEvent(debug, type) {
  return debug.recentEvents.some((event) => event.type === type);
}
