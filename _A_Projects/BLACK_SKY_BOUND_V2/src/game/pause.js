import {
  InputActionId,
  wasInputActionPressed
} from '../data/inputActions.js';
import {
  TutorialTimeSlowMode,
  updateAudioSettings,
  updateTutorialSettings
} from './playerProfile.js';
import {
  hitTestPauseMenu,
  levelFromPauseMenuPointer
} from './pauseMenuLayout.js';

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
  return {
    classification: 'pause_controls_instincts_menu_v1',
    selectedSettingIndex: 0,
    settingsChanged: false,
    lastChangedSettingId: null,
    lastInputMethod: 'keyboard',
    draggedSettingId: null,
    pointerOverControl: false
  };
}

export function applyPauseInput(state, input) {
  if (!input?.wasPressed) return false;
  const pressedPause = wasInputActionPressed(input, InputActionId.PAUSE);
  if (!pressedPause) return false;
  state.paused = !state.paused;
  if (state.game) state.game.paused = state.paused;
  if (!state.paused && state.pauseMenu) {
    state.pauseMenu.draggedSettingId = null;
    state.pauseMenu.pointerOverControl = false;
  }
  return true;
}

export function applyPauseMenuInput(state, input, menu = null, canvas = null) {
  syncPauseMenuCursor(canvas, state);
  if (!state?.paused || !state.pauseMenu || !state.playerProfile) return false;
  state.pauseMenu.settingsChanged = false;
  state.pauseMenu.lastChangedSettingId = null;
  const pointerHandled = applyPointerInput(state, input, menu);
  syncPauseMenuCursor(canvas, state);
  if (pointerHandled) return true;
  if (wasInputActionPressed(input, InputActionId.MENU_UP)) {
    state.pauseMenu.selectedSettingIndex = wrap(state.pauseMenu.selectedSettingIndex - 1, PAUSE_MENU_SETTINGS.length);
    state.pauseMenu.lastInputMethod = 'keyboard';
    state.pauseMenu.draggedSettingId = null;
    return true;
  }
  if (wasInputActionPressed(input, InputActionId.MENU_DOWN)) {
    state.pauseMenu.selectedSettingIndex = wrap(state.pauseMenu.selectedSettingIndex + 1, PAUSE_MENU_SETTINGS.length);
    state.pauseMenu.lastInputMethod = 'keyboard';
    state.pauseMenu.draggedSettingId = null;
    return true;
  }
  const settingId = PAUSE_MENU_SETTINGS[state.pauseMenu.selectedSettingIndex];
  if (settingId.startsWith('audio_') && wasInputActionPressed(input, InputActionId.MENU_MIN)) {
    return setAudioLevel(state, settingId, 0, 'keyboard');
  }
  if (settingId.startsWith('audio_') && wasInputActionPressed(input, InputActionId.MENU_MAX)) {
    return setAudioLevel(state, settingId, 1, 'keyboard');
  }
  const direction = wasInputActionPressed(input, InputActionId.MENU_LEFT) ? -1
    : wasInputActionPressed(input, InputActionId.MENU_RIGHT) || wasInputActionPressed(input, InputActionId.MENU_CONFIRM) ? 1
      : 0;
  if (!direction) return false;
  state.pauseMenu.lastInputMethod = 'keyboard';
  return changeSetting(state, settingId, direction);
}

function applyPointerInput(state, input, menu) {
  const layout = menu?.layout;
  const pointer = input?.pointer;
  if (!layout || !pointer) {
    state.pauseMenu.pointerOverControl = false;
    state.pauseMenu.draggedSettingId = null;
    return false;
  }
  const hit = hitTestPauseMenu(layout, pointer.x, pointer.y);
  state.pauseMenu.pointerOverControl = !!hit;
  const pointerMoved = Math.abs(pointer.deltaX ?? 0) + Math.abs(pointer.deltaY ?? 0) > 0;
  const pressed = input.wasPointerPressed?.(0) === true;
  if (hit && (pointerMoved || pressed)) {
    state.pauseMenu.selectedSettingIndex = hit.row.index;
    state.pauseMenu.lastInputMethod = 'mouse';
  }

  const draggedRow = layout.settingsRows?.find((row) => row.id === state.pauseMenu.draggedSettingId);
  if (draggedRow && pointer.down === true && pointer.button === 0) {
    return setAudioLevel(state, draggedRow.id, levelFromPauseMenuPointer(draggedRow, pointer.x), 'mouse');
  }
  if (state.pauseMenu.draggedSettingId && pointer.down !== true) state.pauseMenu.draggedSettingId = null;

  const wheel = hit?.row.kind === 'level' ? (input.consumeWheel?.() ?? 0) : 0;
  if (wheel) {
    state.pauseMenu.selectedSettingIndex = hit.row.index;
    return changeSetting(state, hit.row.id, -Math.sign(wheel), 'mouse');
  }
  if (!pressed || !hit) return false;
  if (hit.row.kind !== 'level') return changeSetting(state, hit.row.id, 1, 'mouse');
  if (hit.target === 'decrease') return changeSetting(state, hit.row.id, -1, 'mouse');
  if (hit.target === 'increase') return changeSetting(state, hit.row.id, 1, 'mouse');
  if (hit.target !== 'rail') return true;
  state.pauseMenu.draggedSettingId = hit.row.id;
  return setAudioLevel(state, hit.row.id, levelFromPauseMenuPointer(hit.row, pointer.x), 'mouse');
}

function changeSetting(state, settingId, direction, inputMethod = 'keyboard') {
  state.pauseMenu.lastInputMethod = inputMethod;
  if (settingId.startsWith('audio_')) {
    const key = settingId.slice('audio_'.length);
    return setAudioLevel(state, settingId, changeLevel(state.playerProfile.settings.audio[key], direction), inputMethod);
  } else if (settingId === PauseMenuSettingId.TUTORIAL_PROMPTS) {
    state.playerProfile = updateTutorialSettings(state.playerProfile, {
      tutorialPrompts: !state.playerProfile.settings.tutorialPrompts
    });
  } else {
    state.playerProfile = updateTutorialSettings(state.playerProfile, {
      tutorialTimeSlow: cycleTimeSlow(state.playerProfile.settings.tutorialTimeSlow, direction)
    });
  }
  markChanged(state, settingId);
  return true;
}

function setAudioLevel(state, settingId, level, inputMethod) {
  const key = settingId.slice('audio_'.length);
  const current = state.playerProfile.settings.audio[key];
  const next = Math.max(0, Math.min(1, Number(level) || 0));
  state.pauseMenu.lastInputMethod = inputMethod;
  if (Math.abs(current - next) < 0.0001) return true;
  state.playerProfile = updateAudioSettings(state.playerProfile, { [key]: next });
  markChanged(state, settingId);
  return true;
}

function markChanged(state, settingId) {
  state.pauseMenu.settingsChanged = true;
  state.pauseMenu.lastChangedSettingId = settingId;
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

function syncPauseMenuCursor(canvas, state) {
  if (!canvas?.style) return;
  canvas.style.cursor = state?.paused && state.pauseMenu?.pointerOverControl
    ? state.pauseMenu.draggedSettingId ? 'ew-resize' : 'pointer'
    : 'default';
}
