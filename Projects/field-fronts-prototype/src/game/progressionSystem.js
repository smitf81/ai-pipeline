export const PROGRESSION_STAGE_IDS = Object.freeze({
  tribalCamp: 'tribal_camp',
  village: 'village',
  town: 'town',
  city: 'city'
});

export const PROGRESSION_STAGE_ORDER = Object.freeze([
  PROGRESSION_STAGE_IDS.tribalCamp,
  PROGRESSION_STAGE_IDS.village,
  PROGRESSION_STAGE_IDS.town,
  PROGRESSION_STAGE_IDS.city
]);

export const PROGRESSION_STAGE_DEFINITIONS = deepFreeze({
  [PROGRESSION_STAGE_IDS.tribalCamp]: {
    id: PROGRESSION_STAGE_IDS.tribalCamp,
    label: 'Tribal Camp',
    description: 'Opening camp economy: command, builders, basic warriors, hunting, timber, and camp expansion.',
    units: ['builder', 'warrior'],
    buildings: ['outpost', 'hunting_tent', 'wood_gathering_post', 'builder_lodge']
  },
  [PROGRESSION_STAGE_IDS.village]: {
    id: PROGRESSION_STAGE_IDS.village,
    label: 'Village',
    description: 'Village logistics unlocks storage, organised infantry, simple defences, and forward supply nodes.',
    units: ['builder', 'warrior', 'infantry', 'recon'],
    buildings: ['outpost', 'hunting_tent', 'wood_gathering_post', 'builder_lodge', 'storage_tent', 'watchtower', 'trench_segment', 'wall_segment']
  },
  [PROGRESSION_STAGE_IDS.town]: {
    id: PROGRESSION_STAGE_IDS.town,
    label: 'Town',
    description: 'Town-level control unlocks gates, heavier organised forces, and stronger logistics routes.',
    units: ['builder', 'warrior', 'infantry', 'recon', 'artillery'],
    buildings: ['outpost', 'hunting_tent', 'wood_gathering_post', 'builder_lodge', 'storage_tent', 'watchtower', 'trench_segment', 'wall_segment', 'gate']
  },
  [PROGRESSION_STAGE_IDS.city]: {
    id: PROGRESSION_STAGE_IDS.city,
    label: 'City',
    description: 'City-level authority unlocks forts and command-scale military infrastructure.',
    units: ['builder', 'warrior', 'infantry', 'recon', 'artillery', 'command'],
    buildings: ['outpost', 'hunting_tent', 'wood_gathering_post', 'builder_lodge', 'storage_tent', 'watchtower', 'trench_segment', 'wall_segment', 'gate', 'fort']
  }
});

export function createInitialProgressionState(options = {}) {
  return normaliseProgressionState({
    stage: options.stage ?? PROGRESSION_STAGE_IDS.tribalCamp,
    unlockedUnits: options.unlockedUnits,
    unlockedBuildings: options.unlockedBuildings,
    notes: options.notes
  });
}

export function normaliseProgressionState(progression = {}) {
  const stage = PROGRESSION_STAGE_DEFINITIONS[progression?.stage]
    ? progression.stage
    : PROGRESSION_STAGE_IDS.tribalCamp;
  const stageDefinition = PROGRESSION_STAGE_DEFINITIONS[stage];
  return {
    contract: 'field-fronts.progression-state.v1',
    stage,
    stageLabel: stageDefinition.label,
    unlockedUnits: uniqueStrings(progression?.unlockedUnits ?? stageDefinition.units),
    unlockedBuildings: uniqueStrings(progression?.unlockedBuildings ?? stageDefinition.buildings),
    notes: Array.isArray(progression?.notes) ? progression.notes.filter((note) => typeof note === 'string') : []
  };
}

export function getProgressionStageDefinition(stage) {
  return PROGRESSION_STAGE_DEFINITIONS[stage] ?? PROGRESSION_STAGE_DEFINITIONS[PROGRESSION_STAGE_IDS.tribalCamp];
}

export function isBuildOptionUnlocked(progression, optionOrType, maybeId = null) {
  const state = normaliseProgressionState(progression);
  const option = typeof optionOrType === 'object'
    ? optionOrType
    : { type: optionOrType, id: maybeId };
  if (!option?.id) return false;
  if (option.type === 'unit') return state.unlockedUnits.includes(option.id);
  if (option.type === 'building') return state.unlockedBuildings.includes(option.id);
  return false;
}

export function getBuildOptionLockReason(progression, option) {
  if (isBuildOptionUnlocked(progression, option)) return null;
  const state = normaliseProgressionState(progression);
  const nextStage = findNextStageUnlocking(option);
  return {
    reason: 'progression-locked',
    stage: state.stage,
    stageLabel: state.stageLabel,
    unlockStage: nextStage?.id ?? null,
    unlockStageLabel: nextStage?.label ?? null,
    message: nextStage
      ? `${option.label ?? option.id} unlocks at ${nextStage.label}.`
      : `${option.label ?? option.id} is not available in this scenario.`
  };
}

export function listUnlockedBuildOptions(progression, options = []) {
  return options.filter((option) => isBuildOptionUnlocked(progression, option));
}

function findNextStageUnlocking(option) {
  return PROGRESSION_STAGE_ORDER
    .map((stageId) => PROGRESSION_STAGE_DEFINITIONS[stageId])
    .find((stage) => option?.type === 'unit'
      ? stage.units.includes(option.id)
      : option?.type === 'building' && stage.buildings.includes(option.id)) ?? null;
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))];
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  Object.values(value).forEach((entry) => deepFreeze(entry));
  return value;
}
