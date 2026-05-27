export const WEATHER_QUALITY_MODES = Object.freeze({
  off: Object.freeze({
    id: 'off',
    label: 'Off',
    enabled: false,
    maxCloudCells: 0,
    minCloud: 1,
    opacityScale: 0,
    terrainDimScale: 0,
    rainScale: 0,
    lightningMaxEvents: 0,
    lightningThreshold: 1,
    scenarioEffectCap: 12
  }),
  low: Object.freeze({
    id: 'low',
    label: 'Low',
    enabled: true,
    maxCloudCells: 18,
    minCloud: 0.5,
    opacityScale: 0.48,
    terrainDimScale: 0.34,
    rainScale: 0.38,
    lightningMaxEvents: 1,
    lightningThreshold: 0.91,
    scenarioEffectCap: 18
  }),
  medium: Object.freeze({
    id: 'medium',
    label: 'Medium',
    enabled: true,
    maxCloudCells: 36,
    minCloud: 0.44,
    opacityScale: 0.72,
    terrainDimScale: 0.58,
    rainScale: 0.58,
    lightningMaxEvents: 1,
    lightningThreshold: 0.86,
    scenarioEffectCap: 28
  }),
  cinematic: Object.freeze({
    id: 'cinematic',
    label: 'Cinematic',
    enabled: true,
    maxCloudCells: 62,
    minCloud: 0.38,
    opacityScale: 0.95,
    terrainDimScale: 0.82,
    rainScale: 0.9,
    lightningMaxEvents: 2,
    lightningThreshold: 0.82,
    scenarioEffectCap: 44
  })
});

export const WEATHER_QUALITY_ORDER = Object.freeze(['off', 'low', 'medium', 'cinematic']);

export function createPlaytestSettings(settings = {}) {
  return {
    weatherQuality: normaliseWeatherQuality(settings.weatherQuality ?? 'medium'),
    mapClarityMode: Boolean(settings.mapClarityMode),
    aiDebug: Boolean(settings.aiDebug),
    routeDebug: settings.routeDebug !== false,
    lastResetSeed: typeof settings.lastResetSeed === 'string' ? settings.lastResetSeed : null,
    lastChapterId: typeof settings.lastChapterId === 'string' ? settings.lastChapterId : 'chapter_001'
  };
}

export function normaliseWeatherQuality(mode = 'medium') {
  return WEATHER_QUALITY_MODES[mode]?.id ?? 'medium';
}

export function cycleWeatherQuality(mode = 'medium') {
  const current = normaliseWeatherQuality(mode);
  const index = WEATHER_QUALITY_ORDER.indexOf(current);
  return WEATHER_QUALITY_ORDER[(index + 1) % WEATHER_QUALITY_ORDER.length];
}

export function getWeatherQualityLabel(mode = 'medium') {
  return WEATHER_QUALITY_MODES[normaliseWeatherQuality(mode)].label;
}

export function getWeatherRenderSettings(settings = {}, frameBudget = {}) {
  const playtest = createPlaytestSettings(settings);
  const effectiveMode = deriveEffectiveWeatherQuality(playtest.weatherQuality, frameBudget);
  const base = WEATHER_QUALITY_MODES[effectiveMode];
  const clarityScale = playtest.mapClarityMode ? 0.46 : 1;
  const clarityCellScale = playtest.mapClarityMode ? 0.62 : 1;
  return {
    contract: 'field-fronts.weather-render-settings.v0',
    requestedMode: playtest.weatherQuality,
    effectiveMode,
    label: base.label,
    enabled: base.enabled,
    mapClarityMode: playtest.mapClarityMode,
    maxCloudCells: Math.max(0, Math.floor(base.maxCloudCells * clarityCellScale)),
    minCloud: playtest.mapClarityMode ? Math.min(0.98, base.minCloud + 0.08) : base.minCloud,
    opacityScale: round3(base.opacityScale * clarityScale),
    terrainDimScale: round3(base.terrainDimScale * (playtest.mapClarityMode ? 0.32 : 1)),
    rainScale: round3(base.rainScale * (playtest.mapClarityMode ? 0.34 : 1)),
    lightningMaxEvents: playtest.mapClarityMode ? Math.min(1, base.lightningMaxEvents) : base.lightningMaxEvents,
    lightningThreshold: playtest.mapClarityMode ? Math.min(0.98, base.lightningThreshold + 0.06) : base.lightningThreshold,
    scenarioEffectCap: Math.max(6, Math.floor(base.scenarioEffectCap * (playtest.mapClarityMode ? 0.55 : 1))),
    degradedForFrameBudget: effectiveMode !== playtest.weatherQuality
  };
}

export function deriveEffectiveWeatherQuality(mode = 'medium', frameBudget = {}) {
  const requested = normaliseWeatherQuality(mode);
  if (requested === 'off' || requested === 'low') return requested;
  const averageFrameMs = Number(frameBudget?.averageFrameMs) || 0;
  const p95FrameMs = Number(frameBudget?.p95FrameMs) || 0;
  const badFrameRatio = Number(frameBudget?.badFrameRatio) || 0;
  if (averageFrameMs >= 29 || p95FrameMs >= 48 || badFrameRatio >= 0.08) {
    return requested === 'cinematic' ? 'medium' : 'low';
  }
  if (requested === 'cinematic' && (averageFrameMs >= 23 || p95FrameMs >= 38 || badFrameRatio >= 0.04)) {
    return 'medium';
  }
  return requested;
}

export function getNextWeatherQuality(mode = 'medium') {
  return cycleWeatherQuality(mode);
}

export function capRenderItems(items = [], cap = Infinity) {
  if (!Array.isArray(items)) return [];
  const limit = Math.max(0, Math.floor(Number(cap)));
  if (!Number.isFinite(limit)) return items.slice();
  return items.slice(0, limit);
}

export function createRouteFeedback(path = [], options = {}) {
  const anchors = normalisePath(path);
  const blocked = Array.isArray(options.blocked) ? options.blocked : [];
  return {
    contract: 'field-fronts.route-feedback.v0',
    anchorCount: anchors.length,
    anchors,
    preservesPaintedAnchors: anchors.length >= 2,
    blocked,
    warning: blocked.length > 0
      ? `${blocked.length} route issue${blocked.length === 1 ? '' : 's'} detected`
      : null
  };
}

export function buildPlaytestSnapshot(state = {}) {
  const game = state.game ?? {};
  const selected = findSelectedOrderableEntity(game);
  const weather = getWeatherRenderSettings(state.playtest, state.runtimeStats?.frameBudget);
  return {
    contract: 'field-fronts.playtest-snapshot.v0',
    fps: Number.isFinite(state.runtimeStats?.fps) ? Math.round(state.runtimeStats.fps) : null,
    frameMs: Number.isFinite(state.runtimeStats?.frameMs) ? state.runtimeStats.frameMs : null,
    scenario: state.activeScenarioId ?? state.map?.scenario?.activeScenarioId ?? 'chapter_001',
    commanderState: selected?.ai?.emotionalState ?? selected?.behavior?.intent ?? 'ready',
    latestCommand: state.commandFeedback?.status ?? null,
    weatherMode: weather.effectiveMode,
    requestedWeatherMode: weather.requestedMode,
    mapClarityMode: weather.mapClarityMode,
    aiDebug: Boolean(state.playtest?.aiDebug)
  };
}

function findSelectedOrderableEntity(game = {}) {
  const selectedId = game.selectedEntityId;
  const entities = [...(game.leaders ?? []), ...(game.squads ?? [])];
  return entities.find((entity) => entity.id === selectedId)
    ?? entities.find((entity) => entity.factionId === 'player' && entity.type === 'leader')
    ?? null;
}

function normalisePath(path = []) {
  return path
    .filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
    .map((point) => ({ x: Math.round(Number(point.x)), y: Math.round(Number(point.y)) }))
    .filter((point, index, arr) => index === 0 || point.x !== arr[index - 1].x || point.y !== arr[index - 1].y);
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
