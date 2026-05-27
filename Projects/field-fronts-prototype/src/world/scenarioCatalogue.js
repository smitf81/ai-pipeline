import { createScenarioLayerForMap, normaliseScenarioLayer, summarizeScenarioLayer } from './scenarioLayer.js';
import { ensureScenarioSpineForMap, summarizeScenarioSpine } from './scenarioSpine.js';
import { ensureSceneEntityForMap } from './sceneEntity.js';

export const SCENARIO_CATALOGUE_VERSION = 'field-fronts.scenario-catalogue.v0';
export const CHAPTER_ONE_SCENARIO_ID = 'chapter_001';

export const CHAPTER_SCENARIO_DEFINITIONS = Object.freeze([
  Object.freeze({ id: CHAPTER_ONE_SCENARIO_ID, chapter: 1, title: 'The First Night', status: 'unlocked', type: 'opening_survival_tutorial', biomeTheme: 'naturalistic_nomadic_wilderness', techLevel: 'tribal_nomadic', allowedHumanTech: ['bows', 'arrows', 'torches', 'rudimentary tents', 'hand-carried supplies'] }),
  Object.freeze({ id: 'chapter_002', chapter: 2, title: 'The Camp Beneath the Trees', subtitle: 'Temporary shelter and watchfire tension.', status: 'locked' }),
  Object.freeze({ id: 'chapter_003', chapter: 3, title: 'Shapes in the Mist', subtitle: 'Avoidance and distraction under uncertain threat.', status: 'locked' }),
  Object.freeze({ id: 'chapter_004', chapter: 4, title: 'When the Sky Moves', subtitle: 'Scatter, survive and regroup.', status: 'locked' }),
  Object.freeze({ id: 'chapter_005', chapter: 5, title: 'Smoke Through the Valley', subtitle: 'Fire and unstable paths.', status: 'locked' }),
  Object.freeze({ id: 'chapter_006', chapter: 6, title: 'Blood at the Nest', subtitle: 'A choice at the edge of creature territory.', status: 'locked' }),
  Object.freeze({ id: 'chapter_007', chapter: 7, title: 'The Young One', subtitle: 'A new point of view.', status: 'locked' }),
  Object.freeze({ id: 'chapter_008', chapter: 8, title: 'First Doctrine', subtitle: 'A commander takes shape.', status: 'locked' }),
  Object.freeze({ id: 'chapter_009', chapter: 9, title: 'The Wider Front', subtitle: 'Larger-scale systems await.', status: 'locked' })
]);

const DEFAULT_FUTURE_SCENARIOS = CHAPTER_SCENARIO_DEFINITIONS.slice(1);

export function ensureScenarioCatalogueForMap(map, { seed = null, preset = 'black_sky_arrival' } = {}) {
  if (!map || typeof map !== 'object') return map;

  map.scenario = map.scenario && typeof map.scenario === 'object' ? map.scenario : {};
  const selectedPreset = typeof map.scenario?.scenarioLayer?.preset === 'string'
    ? map.scenario.scenarioLayer.preset
    : preset;
  const selectedSeed = typeof map.scenario?.scenarioLayer?.seed === 'string'
    ? map.scenario.scenarioLayer.seed
    : seed ?? `${map.provenance?.seed ?? map.scenario?.generator?.seed ?? 'chapter-001'}:scenario`;

  if (!map.scenario.scenarioLayer) {
    map.scenario.scenarioLayer = createScenarioLayerForMap(map, { seed: selectedSeed, preset: selectedPreset });
  } else {
    map.scenario.scenarioLayer = normaliseScenarioLayer(map.scenario.scenarioLayer);
  }
  ensureSceneEntityForMap(map);
  ensureScenarioSpineForMap(map);

  const existingScenarios = Array.isArray(map.scenario.scenarios) ? map.scenario.scenarios : [];
  const chapterOne = normaliseScenarioEntry(
    existingScenarios.find((entry) => entry?.id === CHAPTER_ONE_SCENARIO_ID) ?? {},
    0,
    map
  );

  map.scenario.scenarios = [
    chapterOne,
    ...existingScenarios
      .filter((entry) => entry?.id && entry.id !== CHAPTER_ONE_SCENARIO_ID)
      .map((entry, index) => normaliseScenarioEntry(entry, index + 1, map))
      .filter(Boolean)
  ];

  map.scenario.progress = normaliseScenarioProgress(map.scenario.progress, map.scenario.scenarios);
  map.scenario.activeScenarioId = normaliseScenarioId(map.scenario.activeScenarioId, map.scenario.scenarios);
  map.scenario.progress.currentScenarioId = map.scenario.activeScenarioId;
  return map;
}

export function getScenarioSelectionSlots(map, { includeLocked = true } = {}) {
  const scenario = map?.scenario ?? {};
  const scenarios = Array.isArray(scenario.scenarios) && scenario.scenarios.length > 0
    ? scenario.scenarios.map((entry, index) => normaliseScenarioEntry(entry, index, map)).filter(Boolean)
    : [normaliseScenarioEntry({}, 0, map)].filter(Boolean);
  const usedIds = new Set(scenarios.map((entry) => entry.id));
  const unlockedIds = Array.isArray(scenario.progress?.unlockedScenarioIds) ? scenario.progress.unlockedScenarioIds : [];
  const future = includeLocked
    ? DEFAULT_FUTURE_SCENARIOS.filter((entry) => !usedIds.has(entry.id)).map((entry) => {
      const unlocked = unlockedIds.includes(entry.id);
      return {
        ...entry,
        subtitle: unlocked ? 'Placeholder scenario content is not authored yet.' : entry.subtitle,
        status: unlocked ? 'unlocked-placeholder' : entry.status,
        available: false,
        locked: !unlocked
      };
    })
    : [];
  const activeId = normaliseScenarioId(scenario.activeScenarioId ?? scenario.progress?.currentScenarioId, scenarios);
  return [...scenarios, ...future].map((entry) => ({
    ...entry,
    active: entry.id === activeId,
    available: entry.status === 'available' || entry.status === 'unlocked' || entry.available === true,
    locked: entry.status === 'locked' || entry.locked === true
  }));
}

export function getActiveScenario(map) {
  const slots = getScenarioSelectionSlots(map, { includeLocked: false });
  const active = slots.find((slot) => slot.active && slot.available);
  return active ?? slots.find((slot) => slot.available) ?? null;
}

export function selectScenario(map, scenarioId = CHAPTER_ONE_SCENARIO_ID) {
  ensureScenarioCatalogueForMap(map);
  const slots = getScenarioSelectionSlots(map, { includeLocked: true });
  const requested = slots.find((slot) => slot.id === scenarioId);
  if (requested && !requested.available) {
    return { ok: false, reason: 'scenario-locked', scenario: requested };
  }
  const selected = requested ?? slots.find((slot) => slot.available) ?? null;
  if (!selected) {
    return { ok: false, reason: 'no-available-scenario', scenario: null };
  }
  map.scenario.activeScenarioId = selected.id;
  map.scenario.progress = normaliseScenarioProgress({
    ...(map.scenario.progress ?? {}),
    currentScenarioId: selected.id
  }, map.scenario.scenarios);
  return { ok: true, scenario: selected };
}

export function summarizeScenarioCatalogue(map) {
  const slots = getScenarioSelectionSlots(map);
  const available = slots.filter((slot) => slot.available);
  const active = slots.find((slot) => slot.active) ?? available[0] ?? null;
  return {
    contract: SCENARIO_CATALOGUE_VERSION,
    activeScenarioId: active?.id ?? null,
    availableCount: available.length,
    lockedCount: slots.filter((slot) => slot.locked).length,
    chapters: slots.map((slot) => ({
      id: slot.id,
      chapter: slot.chapter,
      title: slot.title,
      status: slot.status,
      active: slot.active,
      beatCount: slot.beatCount ?? 0,
      spineStatus: slot.spineStatus ?? 'incomplete'
    }))
  };
}

function normaliseScenarioEntry(entry = {}, index = 0, map = null) {
  const layer = normaliseScenarioLayer(map?.scenario?.scenarioLayer);
  const summary = summarizeScenarioLayer(layer);
  const spineSummary = summarizeScenarioSpine(map?.scenario?.scenarioSpine, { map });
  const chapter = clampInteger(entry.chapter, 1, 99, index + 1);
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `chapter_${String(chapter).padStart(3, '0')}`;
  const isChapterOne = id === CHAPTER_ONE_SCENARIO_ID || chapter === 1;
  const opening = CHAPTER_SCENARIO_DEFINITIONS[0];
  return {
    id: isChapterOne ? CHAPTER_ONE_SCENARIO_ID : id,
    chapter: isChapterOne ? 1 : chapter,
    title: isChapterOne ? opening.title : typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : `Chapter ${chapter}`,
    subtitle: isChapterOne
      ? 'Opening survival command - shelter, concealment, regrouping and light risk.'
      : typeof entry.subtitle === 'string' && entry.subtitle.trim()
        ? entry.subtitle.trim()
        : 'Future scenario slot',
    status: isChapterOne ? 'unlocked' : (typeof entry.status === 'string' ? entry.status : 'locked'),
    available: isChapterOne || entry.status === 'available' || entry.status === 'unlocked' || entry.available === true,
    locked: !isChapterOne && (entry.status === 'locked' || entry.locked !== false),
    type: isChapterOne ? opening.type : typeof entry.type === 'string' ? entry.type : 'placeholder',
    biomeTheme: isChapterOne ? opening.biomeTheme : typeof entry.biomeTheme === 'string' ? entry.biomeTheme : null,
    techLevel: isChapterOne ? opening.techLevel : typeof entry.techLevel === 'string' ? entry.techLevel : null,
    allowedHumanTech: isChapterOne ? [...opening.allowedHumanTech] : Array.isArray(entry.allowedHumanTech) ? entry.allowedHumanTech.filter((item) => typeof item === 'string') : [],
    mapRef: typeof entry.mapRef === 'string' ? entry.mapRef : map?.scenario?.generator?.preset ?? 'current-map',
    scenarioLayerRef: typeof entry.scenarioLayerRef === 'string' ? entry.scenarioLayerRef : 'scenarioLayer',
    beatCount: isChapterOne ? summary.storyBeats : clampInteger(entry.beatCount, 0, 999, 0),
    locationCount: isChapterOne ? summary.locations : clampInteger(entry.locationCount, 0, 999, 0),
    seed: isChapterOne ? layer.seed : (typeof entry.seed === 'string' ? entry.seed : null),
    preset: isChapterOne ? layer.preset : (typeof entry.preset === 'string' ? entry.preset : null),
    spineStatus: isChapterOne ? spineSummary.status : (typeof entry.spineStatus === 'string' ? entry.spineStatus : 'locked'),
    spineCompletion: isChapterOne ? spineSummary.completionPercent : 0
  };
}

function normaliseScenarioProgress(progress = {}, scenarios = []) {
  const availableIds = scenarios.filter((entry) => entry.available !== false && entry.status !== 'locked').map((entry) => entry.id);
  const unlocked = Array.isArray(progress.unlockedScenarioIds) ? progress.unlockedScenarioIds.filter((id) => availableIds.includes(id)) : [];
  if (!unlocked.includes(CHAPTER_ONE_SCENARIO_ID) && availableIds.includes(CHAPTER_ONE_SCENARIO_ID)) {
    unlocked.unshift(CHAPTER_ONE_SCENARIO_ID);
  }
  const completed = Array.isArray(progress.completedScenarioIds)
    ? progress.completedScenarioIds.filter((id) => typeof id === 'string')
    : [];
  const currentScenarioId = normaliseScenarioId(progress.currentScenarioId, scenarios);
  return {
    contract: 'field-fronts.scenario-progress.v0',
    currentScenarioId,
    unlockedScenarioIds: unlocked.length > 0 ? unlocked : availableIds.slice(0, 1),
    completedScenarioIds: [...new Set(completed)],
    chapterIndex: scenarios.find((entry) => entry.id === currentScenarioId)?.chapter ?? 1
  };
}

function normaliseScenarioId(candidate, scenarios = []) {
  const available = scenarios.filter((entry) => entry.available !== false && entry.status !== 'locked');
  if (typeof candidate === 'string' && available.some((entry) => entry.id === candidate)) {
    return candidate;
  }
  return available[0]?.id ?? CHAPTER_ONE_SCENARIO_ID;
}

function clampInteger(value, min, max, fallback) {
  const next = Math.round(Number(value));
  return Number.isFinite(next) ? Math.max(min, Math.min(max, next)) : fallback;
}
