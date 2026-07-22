import {
  InputActionId,
  wasInputActionPressed
} from '../data/inputActions.js';
import {
  TutorialTimeSlowMode,
  updateAudioSettings,
  updateTutorialSettings
} from './playerProfile.js';

export const PauseMenuSettingId = Object.freeze({
  AUDIO_MASTER: 'audio_master',
  AUDIO_AMBIENCE: 'audio_ambience',
  AUDIO_EFFECTS: 'audio_effects',
  TUTORIAL_PROMPTS: 'tutorial_prompts',
  TUTORIAL_TIME_SLOW: 'tutorial_time_slow'
});

const PAUSE_MENU_SETTINGS = Object.freeze([
  PauseMenuSettingId.AUDIO_MASTER,
  PauseMenuSettingId.AUDIO_AMBIENCE,
  PauseMenuSettingId.AUDIO_EFFECTS,
  PauseMenuSettingId.TUTORIAL_PROMPTS,
  PauseMenuSettingId.TUTORIAL_TIME_SLOW
]);

export function createPauseMenuState() {
  return { classification: 'pause_controls_instincts_menu_v0', selectedSettingIndex: 0, settingsChanged: false, lastChangedSettingId: null };
}

export function applyPauseInput(state, input) {
  if (!input?.wasPressed) return false;
  const pressedPause = wasInputActionPressed(input, InputActionId.PAUSE);
  if (!pressedPause) return false;
  state.paused = !state.paused;
  if (state.game) state.game.paused = state.paused;
  return true;
}

export function applyPauseMenuInput(state, input) {
  if (!state?.paused || !state.pauseMenu || !state.playerProfile) return false;
  state.pauseMenu.settingsChanged = false;
  state.pauseMenu.lastChangedSettingId = null;
  if (wasInputActionPressed(input, InputActionId.MENU_UP)) {
    state.pauseMenu.selectedSettingIndex = wrap(state.pauseMenu.selectedSettingIndex - 1, PAUSE_MENU_SETTINGS.length);
    return true;
  }
  if (wasInputActionPressed(input, InputActionId.MENU_DOWN)) {
    state.pauseMenu.selectedSettingIndex = wrap(state.pauseMenu.selectedSettingIndex + 1, PAUSE_MENU_SETTINGS.length);
    return true;
  }
  const direction = wasInputActionPressed(input, InputActionId.MENU_LEFT) ? -1
    : wasInputActionPressed(input, InputActionId.MENU_RIGHT) || wasInputActionPressed(input, InputActionId.MENU_CONFIRM) ? 1
      : 0;
  if (!direction) return false;
  const settingId = PAUSE_MENU_SETTINGS[state.pauseMenu.selectedSettingIndex];
  if (settingId.startsWith('audio_')) {
    const key = settingId.slice('audio_'.length);
    state.playerProfile = updateAudioSettings(state.playerProfile, {
      [key]: changeLevel(state.playerProfile.settings.audio[key], direction)
    });
  } else if (settingId === PauseMenuSettingId.TUTORIAL_PROMPTS) {
    state.playerProfile = updateTutorialSettings(state.playerProfile, {
      tutorialPrompts: !state.playerProfile.settings.tutorialPrompts
    });
  } else {
    state.playerProfile = updateTutorialSettings(state.playerProfile, {
      tutorialTimeSlow: cycleTimeSlow(state.playerProfile.settings.tutorialTimeSlow, direction)
    });
  }
  state.pauseMenu.settingsChanged = true;
  state.pauseMenu.lastChangedSettingId = settingId;
  return true;
}

function changeLevel(current, direction) {
  return Math.max(0, Math.min(1, Math.round((Number(current) + direction * 0.1) * 10) / 10));
}

function cycleTimeSlow(current, direction) {
  const modes = [TutorialTimeSlowMode.ON, TutorialTimeSlowMode.REDUCED, TutorialTimeSlowMode.OFF];
  return modes[wrap(modes.indexOf(current) + direction, modes.length)];
}

function wrap(value, length) {
  return ((value % length) + length) % length;
}
