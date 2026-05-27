export const EXPERIENCE_MODES = Object.freeze({
  MENU: 'menu',
  GAME: 'game',
  SIM_DEBUG: 'sim-debug',
  MAP_MAKER: 'map-maker'
});

export function getExperienceMode(state) {
  return state?.experienceMode ?? EXPERIENCE_MODES.MENU;
}

export function isGameMode(state) {
  return getExperienceMode(state) === EXPERIENCE_MODES.GAME;
}

export function isSimDebugMode(state) {
  return getExperienceMode(state) === EXPERIENCE_MODES.SIM_DEBUG;
}

export function isMapMakerMode(state) {
  return getExperienceMode(state) === EXPERIENCE_MODES.MAP_MAKER;
}

export function shouldShowDeveloperPanel(state) {
  const mode = getExperienceMode(state);
  return state?.uiScreen === 'game' && (mode === EXPERIENCE_MODES.SIM_DEBUG || mode === EXPERIENCE_MODES.MAP_MAKER);
}

export function shouldShowGameDebugVisuals(state) {
  return isSimDebugMode(state);
}

export function shouldShowMapAuthoringVisuals(state) {
  return isMapMakerMode(state);
}
