import { assert, equal } from './assert.mjs';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EventType } from '../src/constants/eventTypes.js';
import { emitEvent } from '../src/ecs/events.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { advanceGameTime, createGameTimeState } from '../src/game/gameTime.js';
import { applyPauseMenuInput, createPauseMenuState } from '../src/game/pause.js';
import {
  captureAbilityProgressionInProfile,
  createDefaultPlayerProfile,
  createPlayerProfileStore,
  normalizePlayerProfile,
  startNewGamePlusProfile,
  TutorialTimeSlowMode
} from '../src/game/playerProfile.js';
import {
  createTutorialRuntime,
  requestTutorialCue,
  resetTutorialRuntimeForGame,
  temporarilyDismissActiveTutorialCue,
  updateTutorialRuntime
} from '../src/game/tutorialRuntime.js';
import { applyAbilityUnlockEvent, canUseAbility, captureRunAbilityProgression } from '../src/game/playerAbilities.js';
import { InputActionId, formatInputActionBindings } from '../src/data/inputActions.js';
import { AbilityUnlockEventId } from '../src/data/abilityUnlockEvents.js';
import { TutorialCueId } from '../src/data/tutorialCues.js';
import { buildTutorialProjection } from '../src/projection/tutorialProjection.js';
import { applyDamageToEntity } from '../src/systems/healthSystem.js';
import { staminaSystem } from '../src/systems/staminaSystem.js';
import { viewSyncSystem } from '../src/systems/viewSyncSystem.js';
import { createDemoMap } from '../src/world/map.js';

equal(formatInputActionBindings(InputActionId.MOVE), 'W A S D', 'movement review should read the canonical primary bindings');
equal(formatInputActionBindings(InputActionId.MELEE), 'LMB / J', 'attack review should include both canonical bindings');
equal(formatInputActionBindings(InputActionId.DODGE), 'SPACE', 'dodge review should read the canonical Space binding');

const storage = memoryStorage();
const store = createPlayerProfileStore(storage);
let persisted = createDefaultPlayerProfile();
persisted.tutorial.shownCueIds.push(TutorialCueId.FIRST_MOVEMENT);
persisted.tutorial.completedCueIds.push(TutorialCueId.FIRST_MOVEMENT);
persisted.tutorial.reviewableCueIds.push(TutorialCueId.FIRST_MOVEMENT);
persisted.progression.consumedUnlockEventIds.push(AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED);
store.save(persisted);
const loaded = store.load();
assert(loaded.tutorial.completedCueIds.includes(TutorialCueId.FIRST_MOVEMENT), 'profile tutorial completion should survive reload');
assert(loaded.progression.consumedUnlockEventIds.includes(AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED), 'unlock receipts should survive reload');
const legacySmoke = createDefaultPlayerProfile();
legacySmoke.progression.unlockedAbilityIds.push(AbilityId.SMOKE_BURST);
assert(!normalizePlayerProfile(legacySmoke).progression.unlockedAbilityIds.includes(AbilityId.SMOKE_BURST), 'legacy profiles must lose the former default smoke ability without its awakening receipt');
legacySmoke.progression.consumedUnlockEventIds.push(AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED);
assert(!normalizePlayerProfile(legacySmoke).progression.unlockedAbilityIds.includes(AbilityId.SMOKE_BURST), 'transition-earned smoke must be stripped even when an old profile contains its receipt');
assert(!normalizePlayerProfile(legacySmoke).progression.consumedUnlockEventIds.includes(AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED), 'old smoke receipts must not leak a run-scoped unlock into Level 1');
const ngPlus = startNewGamePlusProfile(loaded);
equal(ngPlus.runs.newGamePlusCount, 1, 'New Game Plus should increment retained run metadata');
assert(ngPlus.tutorial.completedCueIds.includes(TutorialCueId.FIRST_MOVEMENT), 'New Game Plus should retain completed tutorial history');

const movement = createState();
step(movement, 0.8);
equal(movement.tutorial.activeCue?.id, TutorialCueId.FIRST_MOVEMENT, 'fresh profile should receive movement onboarding');
const playerTransform = component(movement, movement.game.dragonId, ComponentType.Transform);
playerTransform.x += 0.82;
viewSyncSystem({ game: movement.game });
step(movement, 0.05, input({ down: ['d'] }));
equal(movement.tutorial.activeCue?.phase, 'exiting', 'accepted meaningful movement should dismiss onboarding early');
assert(movement.playerProfile.tutorial.completedCueIds.includes(TutorialCueId.FIRST_MOVEMENT), 'movement completion should persist at profile scope');

resetTutorialRuntimeForGame(movement.tutorial, movement);
step(movement, 0.8);
assert(movement.tutorial.activeCue?.id !== TutorialCueId.FIRST_MOVEMENT, 'scenario reload should not replay completed onboarding');
resetTutorialRuntimeForGame(movement.tutorial, movement);
step(movement, 0.8);
assert(movement.tutorial.activeCue?.id !== TutorialCueId.FIRST_MOVEMENT, 'respawn-style runtime reset should not replay completed onboarding');

const retained = createState(startNewGamePlusProfile(movement.playerProfile));
step(retained, 0.8);
assert(retained.tutorial.activeCue?.id !== TutorialCueId.FIRST_MOVEMENT, 'retained NG+ profile should not replay completed onboarding');

const combat = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT));
step(combat, 0.2);
assert(combat.tutorial.activeCue?.id !== TutorialCueId.FIRST_COMBAT, 'distant enemies should not trigger combat introduction');
moveFirstEnemy(combat, 4.4);
step(combat, 0.05);
equal(combat.tutorial.activeCue?.id, TutorialCueId.FIRST_COMBAT, 'close hostile approach should trigger combat introduction');
for (let comboStep = 0; comboStep < 3; comboStep += 1) {
  emitAccepted(combat, InputActionId.MELEE, { comboStep });
}
step(combat, 0.05);
equal(combat.tutorial.activeCue?.phase, 'exiting', 'three accepted melee actions should dismiss the Level 1 combat introduction without smoke');

const interrupt = createState();
step(interrupt, 0.8);
equal(interrupt.tutorial.activeCue?.id, TutorialCueId.FIRST_MOVEMENT, 'movement should begin as the low-priority cue');
emitEvent(interrupt.game.world, EventType.ENEMY_ATTACK_COMMITTED, {
  attacker: firstEnemy(interrupt).id,
  target: interrupt.game.dragonId,
  profileId: 'test_attack'
});
step(interrupt, 0.016);
equal(interrupt.tutorial.activeCue?.id, TutorialCueId.FIRST_DODGE, 'survival dodge should interrupt a lower-priority cue');
assert(interrupt.tutorial.queue.some((entry) => entry.id === TutorialCueId.FIRST_MOVEMENT), 'interrupted movement cue should remain postponed in the queue');
equal(Number(interrupt.gameTime.currentScale.toFixed(2)), 0.32, 'full tutorial slow-time should use the bounded configured scale');

const intent = component(interrupt, interrupt.game.dragonId, ComponentType.PlayerIntent);
intent.dodge = true;
staminaSystem({ game: interrupt.game, dt: 0 });
assert(component(interrupt, interrupt.game.dragonId, ComponentType.DodgeState).active, 'Space intent should perform dodge immediately while the cue is visible');
step(interrupt, 0.016);
equal(interrupt.tutorial.activeCue?.phase, 'exiting', 'accepted dodge should complete the survival cue');
equal(interrupt.gameTime.currentScale, 1, 'successful dodge should restore normal gameplay time immediately');

const resolved = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT, TutorialCueId.FIRST_COMBAT));
emitEvent(resolved.game.world, EventType.ENEMY_ATTACK_COMMITTED, { attacker: firstEnemy(resolved).id, target: resolved.game.dragonId, profileId: 'test_attack' });
step(resolved, 0.016);
emitEvent(resolved.game.world, EventType.ENEMY_ATTACK_RESOLVED, { attacker: firstEnemy(resolved).id, target: resolved.game.dragonId, profileId: 'test_attack' });
step(resolved, 0.016);
equal(resolved.gameTime.currentScale, 1, 'resolved incoming attack should safely restore normal time');

const timedOut = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT, TutorialCueId.FIRST_COMBAT));
emitEvent(timedOut.game.world, EventType.ENEMY_ATTACK_COMMITTED, { attacker: firstEnemy(timedOut).id, target: timedOut.game.dragonId, profileId: 'test_attack' });
step(timedOut, 0.016);
equal(advanceGameTime(timedOut.gameTime, 1.1), 1, 'strict slow-time request timeout should restore the base scale');
step(timedOut, 2.3);
assert(timedOut.playerProfile.tutorial.completedCueIds.includes(TutorialCueId.FIRST_DODGE), 'bounded dodge cue timeout should complete without replay loops');

const reduced = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT, TutorialCueId.FIRST_COMBAT));
reduced.playerProfile.settings.tutorialTimeSlow = TutorialTimeSlowMode.REDUCED;
emitEvent(reduced.game.world, EventType.ENEMY_ATTACK_COMMITTED, { attacker: firstEnemy(reduced).id, target: reduced.game.dragonId, profileId: 'test_attack' });
step(reduced, 0.016);
equal(Number(reduced.gameTime.currentScale.toFixed(2)), 0.58, 'reduced setting should use the gentler canonical slow scale');
const noSlow = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT, TutorialCueId.FIRST_COMBAT));
noSlow.playerProfile.settings.tutorialTimeSlow = TutorialTimeSlowMode.OFF;
emitEvent(noSlow.game.world, EventType.ENEMY_ATTACK_COMMITTED, { attacker: firstEnemy(noSlow).id, target: noSlow.game.dragonId, profileId: 'test_attack' });
step(noSlow, 0.016);
equal(noSlow.gameTime.currentScale, 1, 'disabled time slow should still show the cue without slowing gameplay');
equal(noSlow.tutorial.activeCue?.id, TutorialCueId.FIRST_DODGE, 'disabled time slow must not suppress the dodge prompt');

const smokeVeil = createState(profileCompleted(
  TutorialCueId.FIRST_MOVEMENT,
  TutorialCueId.FIRST_COMBAT,
  TutorialCueId.FIRST_DODGE
));
unlockSmoke(smokeVeil);
emitEvent(smokeVeil.game.world, EventType.SMOKE_PURSUIT_BROKEN, {
  enemy: firstEnemy(smokeVeil).id,
  target: smokeVeil.game.dragonId,
  reason: 'player_concealed',
  sourceKind: 'dragon_smoke_plume'
});
step(smokeVeil, 0.016);
equal(smokeVeil.tutorial.activeCue?.id, TutorialCueId.SMOKE_VEIL, 'first successful smoke break should explain the reposition window');
equal(smokeVeil.tutorial.activeCue?.presentationType, 'message', 'smoke veil explanation should be a low-clutter message rather than another key prompt');
equal(smokeVeil.gameTime.currentScale, 1, 'smoke veil explanation should preserve the live combat tempo');
step(smokeVeil, 2.9);
assert(smokeVeil.tutorial.completedRunCueIds.has(TutorialCueId.SMOKE_VEIL), 'smoke veil explanation should complete once within the active run');
assert(!smokeVeil.playerProfile.tutorial.completedCueIds.includes(TutorialCueId.SMOKE_VEIL), 'run-scoped smoke teaching must remain replayable on a future transition');

const smokeEscape = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT, TutorialCueId.FIRST_COMBAT));
unlockSmoke(smokeEscape);
const runSnapshot = captureRunAbilityProgression(smokeEscape.game.world, smokeEscape.game.dragonId);
const capturedProfile = captureAbilityProgressionInProfile(smokeEscape.game.world, smokeEscape.game.dragonId, smokeEscape.playerProfile);
assert(!capturedProfile.progression.unlockedAbilityIds.includes(AbilityId.SMOKE_BURST), 'profile capture must exclude the run-scoped smoke unlock');
assert(!capturedProfile.progression.consumedUnlockEventIds.includes(AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED), 'profile capture must exclude the run-scoped smoke receipt');
const nextRegionGame = createInitialGameState(createDemoMap(), { playerProfile: capturedProfile, runAbilityProgression: runSnapshot });
assert(canUseAbility(nextRegionGame.world, nextRegionGame.dragonId, AbilityId.SMOKE_BURST), 'live run progression should carry smoke through later map transitions');
const freshRunGame = createInitialGameState(createDemoMap(), { playerProfile: capturedProfile });
assert(!canUseAbility(freshRunGame.world, freshRunGame.dragonId, AbilityId.SMOKE_BURST), 'a fresh Level 1 game should start with smoke locked');
assert(requestTutorialCue(smokeEscape.tutorial, smokeEscape, TutorialCueId.SMOKE_ESCAPE), 'scene release should be able to request the high-priority exhale-and-run cue');
equal(smokeEscape.tutorial.activeCue?.title, 'EXHALE', 'post-awakening gameplay cue should preserve the instinct language');
emitAccepted(smokeEscape, InputActionId.SMOKE);
step(smokeEscape, 0.016);
equal(smokeEscape.tutorial.activeCue?.phase, 'entering', 'accepted smoke alone must not claim that enemy line of sight was broken');
emitEvent(smokeEscape.game.world, EventType.SMOKE_PURSUIT_BROKEN, {
  enemy: firstEnemy(smokeEscape).id,
  target: smokeEscape.game.dragonId,
  reason: 'player_concealed',
  sourceKind: 'dragon_smoke_plume'
});
step(smokeEscape, 0.016);
equal(smokeEscape.tutorial.activeCue?.phase, 'exiting', 'the escape cue should complete only after smoke genuinely breaks pursuit');
assert(!smokeEscape.playerProfile.tutorial.completedCueIds.includes(TutorialCueId.SMOKE_ESCAPE), 'run-scoped smoke teaching must replay when the ability is earned in a future run');

const instinct = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT, TutorialCueId.FIRST_COMBAT, TutorialCueId.FIRST_DODGE));
const health = component(instinct, instinct.game.dragonId, ComponentType.Health);
health.hp = health.maxHp * 0.5;
applyDamageToEntity(instinct.game.world, instinct.game.dragonId, health.maxHp * 0.2, firstEnemy(instinct).id, 'test_hostile');
equal(instinct.game.world.events.filter((event) => event.type === EventType.PLAYER_NEAR_DEATH).length, 1, 'first hostile threshold crossing should emit one near-death signal');
health.hp = health.maxHp * 0.5;
applyDamageToEntity(instinct.game.world, instinct.game.dragonId, health.maxHp * 0.2, firstEnemy(instinct).id, 'test_hostile');
equal(instinct.game.world.events.filter((event) => event.type === EventType.PLAYER_NEAR_DEATH).length, 1, 'threshold oscillation should not emit repeated near-death signals');
step(instinct, 0.016);
equal(instinct.tutorial.activeCue?.id, TutorialCueId.CHARGE_INSTINCT, 'near-death signal should introduce the charge instinct once');
assert(instinct.playerProfile.progression.consumedUnlockEventIds.includes(AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED), 'near-death should persist the progression unlock receipt');
assert(instinct.playerProfile.tutorial.reviewableCueIds.includes(TutorialCueId.CHARGE_INSTINCT), 'unlocked instinct should become manually reviewable');
emitAccepted(instinct, InputActionId.DODGE);
step(instinct, 0.016);
equal(instinct.gameTime.currentScale, 1, 'first instinct dodge should promptly release slow-time while leaving the follow-up readable');
emitAccepted(instinct, InputActionId.DODGE_FOLLOWUP);
step(instinct, 0.016);
equal(instinct.tutorial.activeCue?.phase, 'exiting', 'accepted second Space should complete the dodge-charge sequence');

const disabled = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT, TutorialCueId.FIRST_COMBAT, TutorialCueId.FIRST_DODGE));
disabled.playerProfile.settings.tutorialPrompts = false;
const disabledHealth = component(disabled, disabled.game.dragonId, ComponentType.Health);
disabledHealth.hp = disabledHealth.maxHp * 0.5;
applyDamageToEntity(disabled.game.world, disabled.game.dragonId, disabledHealth.maxHp * 0.2, firstEnemy(disabled).id, 'test_hostile');
step(disabled, 0.016);
equal(disabled.tutorial.activeCue, null, 'disabled prompts should keep gameplay tutorial UI hidden');
assert(disabled.playerProfile.progression.consumedUnlockEventIds.includes(AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED), 'disabled prompts must not block ability progression');

const dismiss = createState();
step(dismiss, 0.8);
temporarilyDismissActiveTutorialCue(dismiss.tutorial, dismiss, 'manual_test_dismiss');
assert(dismiss.tutorial.temporarilyDismissedCueIds.has(TutorialCueId.FIRST_MOVEMENT), 'temporary dismissal should live in runtime state');
assert(!dismiss.playerProfile.tutorial.completedCueIds.includes(TutorialCueId.FIRST_MOVEMENT), 'temporary dismissal must remain distinct from persistent completion');

const pause = createState(profileCompleted(TutorialCueId.FIRST_MOVEMENT));
pause.paused = true;
pause.pauseMenu = createPauseMenuState();
let pauseProjection = buildTutorialProjection(pause);
assert(pauseProjection.pauseMenu.controls.some((control) => control.abilityId === AbilityId.MOVE), 'pause review should list movement');
assert(pauseProjection.pauseMenu.controls.some((control) => control.abilityId === AbilityId.BITE_CLAW && control.detail.includes('LEFT CLAW')), 'pause review should derive the live canonical combo structure');
assert(pauseProjection.pauseMenu.controls.some((control) => control.abilityId === AbilityId.CHARGE_COUNTER), 'pause review should list unlocked charge instinct');
assert(!pauseProjection.pauseMenu.controls.some((control) => control.abilityId === AbilityId.SMOKE_BURST), 'Level 1 pause review must not advertise smoke before its awakening');
assert(!pauseProjection.pauseMenu.controls.some((control) => control.abilityId === AbilityId.DRAGONFIRE), 'locked future abilities must not appear as usable');
equal(pauseProjection.pauseMenu.settings[0].id, 'audio_master', 'pause settings should lead with the master sound control');
equal(pauseProjection.pauseMenu.settings[0].value, '100%', 'sound controls should expose readable percentages');
applyPauseMenuInput(pause, input({ pressed: ['a'] }));
equal(pause.playerProfile.settings.audio.master, 0.9, 'pause menu should adjust master volume in bounded ten-percent steps');
equal(pause.pauseMenu.settingsChanged, true, 'audio changes should use the existing persistent settings signal');
equal(pause.pauseMenu.lastChangedSettingId, 'audio_master', 'pause menu should identify audio changes without misclassifying them as tutorial changes');
applyPauseMenuInput(pause, input({ pressed: ['home'] }));
equal(pause.playerProfile.settings.audio.master, 0, 'Home should apply the standard slider minimum');
equal(buildTutorialProjection(pause).pauseMenu.settings[0].value, 'MUTED', 'zero level should read as an explicit muted state');
applyPauseMenuInput(pause, input({ pressed: ['end'] }));
equal(pause.playerProfile.settings.audio.master, 1, 'End should apply the standard slider maximum');
applyPauseMenuInput(pause, input({ pressed: ['a'] }));

pauseProjection = buildTutorialProjection(pause);
let ambienceRow = pauseProjection.pauseMenu.layout.settingsRows[1];
applyPauseMenuInput(pause, input({
  pointerPressed: [0],
  pointer: { x: ambienceRow.rail.x + ambienceRow.rail.w * 0.37, y: ambienceRow.rail.y + 2, down: true, button: 0 }
}), pauseProjection.pauseMenu);
equal(pause.playerProfile.settings.audio.ambience, 0.37, 'clicking a sound rail should set its exact pointer-relative level');
equal(pause.pauseMenu.draggedSettingId, 'audio_ambience', 'pressing a sound rail should begin drag scrubbing');
equal(pause.pauseMenu.selectedSettingIndex, 1, 'pointer editing should focus the same row the renderer exposes');

pauseProjection = buildTutorialProjection(pause);
ambienceRow = pauseProjection.pauseMenu.layout.settingsRows[1];
applyPauseMenuInput(pause, input({
  pointer: { x: ambienceRow.rail.x + ambienceRow.rail.w * 0.64, y: ambienceRow.rail.y + 2, down: true, button: 0, deltaX: 18 }
}), pauseProjection.pauseMenu);
equal(pause.playerProfile.settings.audio.ambience, 0.64, 'holding the pointer should continuously scrub the active sound rail');

pauseProjection = buildTutorialProjection(pause);
const effectsRow = pauseProjection.pauseMenu.layout.settingsRows[2];
applyPauseMenuInput(pause, input({ pointer: { x: effectsRow.rail.x, y: effectsRow.rail.y }, wheel: 1 }), pauseProjection.pauseMenu);
equal(pause.playerProfile.settings.audio.effects, 0.9, 'wheel-down over a sound rail should lower it by one keyboard-sized step');
equal(pause.pauseMenu.selectedSettingIndex, 2, 'wheel adjustment should focus the affected row');
for (let index = 0; index < 4; index += 1) applyPauseMenuInput(pause, input({ pressed: ['arrowdown'] }));
equal(pause.pauseMenu.selectedSettingIndex, 1, 'pause menu should wrap navigation across sound and tutorial settings as one list');
for (let index = 0; index < 3; index += 1) applyPauseMenuInput(pause, input({ pressed: ['arrowdown'] }));
equal(pause.pauseMenu.selectedSettingIndex, 4, 'keyboard navigation should remain independent after pointer editing');
applyPauseMenuInput(pause, input({ pressed: ['d'] }));
equal(pause.playerProfile.settings.tutorialTimeSlow, TutorialTimeSlowMode.REDUCED, 'pause menu should retain tutorial preference controls after sound settings');
store.save(pause.playerProfile);
equal(store.load().settings.audio.master, 0.9, 'audio preferences should survive profile persistence');

function createState(profile = createDefaultPlayerProfile()) {
  const map = createDemoMap();
  const normalized = normalizePlayerProfile(profile);
  const game = createInitialGameState(map, { playerProfile: normalized });
  const state = {
    map,
    game,
    playerProfile: normalized,
    tutorial: createTutorialRuntime(),
    gameTime: createGameTimeState(),
    paused: false,
    pauseMenu: createPauseMenuState()
  };
  moveEnemiesFar(state);
  return state;
}

function step(state, realDt, actionInput = input()) {
  viewSyncSystem({ game: state.game });
  updateTutorialRuntime({ state, input: actionInput, realDt, gameplayDt: realDt });
}

function profileCompleted(...cueIds) {
  const profile = createDefaultPlayerProfile();
  profile.tutorial.shownCueIds.push(...cueIds);
  profile.tutorial.completedCueIds.push(...cueIds);
  profile.tutorial.reviewableCueIds.push(...cueIds);
  return profile;
}

function moveEnemiesFar(state) {
  const player = component(state, state.game.dragonId, ComponentType.Transform);
  for (const actor of state.game.actors) {
    if (actor.id === state.game.dragonId) continue;
    const transform = component(state, actor.id, ComponentType.Transform);
    transform.x = player.x + 12 + actor.id.length * 0.02;
    transform.y = player.y + 8;
  }
  viewSyncSystem({ game: state.game });
}

function moveFirstEnemy(state, distance) {
  const enemy = firstEnemy(state);
  const player = component(state, state.game.dragonId, ComponentType.Transform);
  const transform = component(state, enemy.id, ComponentType.Transform);
  transform.x = player.x + distance;
  transform.y = player.y;
  viewSyncSystem({ game: state.game });
}

function firstEnemy(state) {
  return state.game.actors.find((actor) => actor.id !== state.game.dragonId && actor.alive);
}

function emitAccepted(state, inputAction, extra = {}) {
  emitEvent(state.game.world, EventType.PLAYER_ACTION_ACCEPTED, {
    source: state.game.dragonId,
    inputAction,
    ...extra
  });
}

function unlockSmoke(state) {
  const receipt = applyAbilityUnlockEvent(state.game.world, state.game.dragonId, AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED);
  assert(receipt.ok, 'smoke test setup should consume the canonical awakening event');
  viewSyncSystem({ game: state.game });
}

function component(state, entity, type) {
  return getComponent(state.game.world, entity, type);
}

function input({ down = [], pressed = [], pointerPressed = [], pointer = {}, wheel = 0 } = {}) {
  const held = new Set(down);
  const fresh = new Set(pressed);
  const pointers = new Set(pointerPressed);
  let wheelConsumed = false;
  return {
    pointer: { x: 0, y: 0, deltaX: 0, deltaY: 0, down: false, button: -1, ...pointer },
    isDown: (key) => held.has(key),
    wasPressed: (key) => fresh.has(key),
    wasPointerPressed: (button) => pointers.has(button),
    consumePointerClick: () => false,
    consumeWheel: () => {
      if (wheelConsumed) return 0;
      wheelConsumed = true;
      return wheel;
    }
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}
