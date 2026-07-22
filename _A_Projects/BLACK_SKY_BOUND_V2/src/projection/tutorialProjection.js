import { ABILITIES } from '../data/abilities.js';
import {
  formatInputActionBindings,
  getInputAction,
  getInputActionPromptLabels
} from '../data/inputActions.js';
import { getWyvernActionProfile } from '../data/creatures/groundedWyvernMotionProfiles.js';

export function buildTutorialProjection(state) {
  const player = findPlayer(state.game);
  const comboLabels = buildComboLabels(player);
  return {
    classification: 'renderer_neutral_tutorial_prompt_projection_v1',
    activeCue: buildActiveCueProjection(state.tutorial?.activeCue, comboLabels),
    paused: state.paused === true,
    pauseMenu: state.paused ? buildPauseMenuProjection(state, player, comboLabels) : null,
    settings: { ...(state.playerProfile?.settings ?? {}) },
    timeScale: state.gameTime?.currentScale ?? 1,
    queueDepth: state.tutorial?.queue?.length ?? 0
  };
}

function buildActiveCueProjection(active, comboLabels) {
  if (!active) return null;
  return {
    id: active.id,
    priority: active.priority,
    presentationType: active.presentationType,
    title: active.title,
    supportingText: active.supportingText,
    phase: active.phase,
    elapsedReal: active.elapsedReal,
    exitElapsed: active.exitElapsed,
    context: { ...active.context },
    inputRows: active.inputActions.map((actionId) => ({
      actionId,
      label: getInputAction(actionId)?.label ?? actionId,
      bindings: getInputActionPromptLabels(actionId)
    })),
    comboLabels,
    progress: {
      ...active.progress,
      pressedLabels: [...active.progress.pressedLabels],
      movementLabels: [...active.progress.movementLabels]
    }
  };
}

function buildPauseMenuProjection(state, player, comboLabels) {
  const unlocked = new Set(player?.abilityProgression?.unlockedAbilities ?? []);
  const controls = Object.values(ABILITIES)
    .filter((ability) => unlocked.has(ability.id) && getInputAction(ability.inputAction))
    .sort((a, b) => (a.reviewOrder ?? 999) - (b.reviewOrder ?? 999))
    .map((ability) => ({
      abilityId: ability.id,
      label: ability.displayName ?? ability.id,
      bindings: formatInputActionBindings(ability.inputAction),
      detail: ability.id === 'move' ? 'ARROW KEYS ALSO'
        : ability.id === 'bite_claw' ? comboLabels.join(' · ')
        : ability.id === 'charge_counter' ? 'DODGE AGAIN TO COUNTER'
          : null
    }));
  const settings = state.playerProfile?.settings ?? {};
  return {
    title: 'CONTROLS & INSTINCTS',
    controls,
    learnedCueIds: [...(state.playerProfile?.tutorial?.reviewableCueIds ?? [])],
    selectedSettingIndex: state.pauseMenu?.selectedSettingIndex ?? 0,
    settings: [
      levelSetting('audio_master', 'MASTER', settings.audio?.master),
      levelSetting('audio_ambience', 'WORLD & WEATHER', settings.audio?.ambience),
      levelSetting('audio_effects', 'CREATURES & COMBAT', settings.audio?.effects),
      { id: 'tutorial_prompts', section: 'TUTORIAL', label: 'PROMPTS', value: settings.tutorialPrompts === false ? 'OFF' : 'ON' },
      { id: 'tutorial_time_slow', section: 'TUTORIAL', label: 'TIME SLOW', value: String(settings.tutorialTimeSlow ?? 'on').toUpperCase() }
    ],
    footer: 'W/S SELECT   A/D CHANGE   ESC RESUME'
  };
}

function levelSetting(id, label, value = 1) {
  const level = Math.max(0, Math.min(1, Number(value) || 0));
  return { id, section: 'SOUND', kind: 'level', label, value: `${Math.round(level * 100)}%`, level };
}

function buildComboLabels(player) {
  return (player?.wyvernProjection?.comboState?.sequence ?? [])
    .map((actionId) => getWyvernActionProfile(actionId)?.displayName ?? actionId.replaceAll('_', ' ').toUpperCase());
}

function findPlayer(game) {
  return (game?.actors ?? []).find((actor) => actor.id === game.dragonId) ?? null;
}
