import { buildTutorialProjection } from '../projection/tutorialProjection.js';

export function buildTutorialText(state) {
  const projection = buildTutorialProjection(state);
  const cue = projection.activeCue;
  return {
    profileSchema: state.playerProfile?.schema ?? null,
    settings: projection.settings,
    shownCueIds: [...(state.playerProfile?.tutorial?.shownCueIds ?? [])],
    completedCueIds: [...(state.playerProfile?.tutorial?.completedCueIds ?? [])],
    reviewableCueIds: [...(state.playerProfile?.tutorial?.reviewableCueIds ?? [])],
    activeCue: cue ? {
      id: cue.id,
      phase: cue.phase,
      presentationType: cue.presentationType,
      elapsedReal: Number(cue.elapsedReal.toFixed(3)),
      progress: cue.progress,
      context: cue.context
    } : null,
    queueDepth: projection.queueDepth,
    pauseMenuVisible: !!projection.pauseMenu,
    pauseControls: projection.pauseMenu?.controls ?? [],
    pauseSettings: projection.pauseMenu?.settings ?? [],
    selectedPauseSettingIndex: projection.pauseMenu?.selectedSettingIndex ?? null,
    timeScale: projection.timeScale,
    timeScaleRequests: state.gameTime?.requests?.size ?? 0,
    lastTimeRestoreReason: state.gameTime?.lastRestoreReason ?? null
  };
}
