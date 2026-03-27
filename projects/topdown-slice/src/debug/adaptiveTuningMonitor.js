import { ADAPTIVE_WEIGHT_KEYS, formatAdaptiveModifierSummary } from '../ai/adaptiveResolverWeights.js';

const DEFAULT_HISTORY_LIMIT = 12;
const DEFAULT_TREND_WINDOW = 8;
const TREND_EPSILON = 0.0001;
const PLATEAU_MIN_HISTORY = 4;
const PLATEAU_SCORE_DELTA = 0.02;
const PLATEAU_BLOCKER_DELTA = 0.5;
const PLATEAU_OPENNESS_DELTA = 0.03;
const PLATEAU_CONVERGENCE_DELTA = 0.03;
const PLATEAU_LOW_CONVERGENCE = 0.12;
const PLATEAU_WEIGHT_SPREAD = 0.01;

export function createAdaptiveTuningMonitor({ historyLimit = DEFAULT_HISTORY_LIMIT, trendWindow = DEFAULT_TREND_WINDOW } = {}) {
  return {
    historyLimit,
    trendWindow,
    history: [],
    trends: createEmptyTrendSet(),
    plateau: createPlateauState()
  };
}

export function recordAdaptiveTuningCycle(
  monitor = createAdaptiveTuningMonitor(),
  { resolveCycle = 0, adaptiveResolver = null, qa = null, candidates = [] } = {}
) {
  const nextHistory = [
    buildCycleSnapshot({ resolveCycle, adaptiveResolver, qa, candidates }),
    ...(monitor.history ?? []).filter((entry) => entry.resolveCycle !== resolveCycle)
  ].slice(0, monitor.historyLimit ?? DEFAULT_HISTORY_LIMIT);

  return {
    ...monitor,
    history: nextHistory,
    trends: computeAdaptiveTrends(nextHistory, monitor.trendWindow ?? DEFAULT_TREND_WINDOW),
    plateau: detectAdaptivePlateau(nextHistory, monitor.trendWindow ?? DEFAULT_TREND_WINDOW)
  };
}

export function formatAdaptiveTrendLine(label, trend, formatter = formatNumber) {
  if (!trend || trend.direction === 'insufficient') {
    return `${label}: waiting for more cycles`;
  }

  const deltaLabel = trend.delta >= 0 ? `+${formatter(trend.delta)}` : formatter(trend.delta);
  return `${label}: ${trend.direction} (${formatter(trend.start)} -> ${formatter(trend.end)}, ${deltaLabel})`;
}

export function formatAdaptiveHistoryLine(entry) {
  const plateauSummary = entry.plateauNudgeSummary
    ? ` | nudge ${entry.plateauNudgeSummary}`
    : entry.plateauDetected
      ? ' | plateau'
      : '';
  return `C${entry.resolveCycle} | ${entry.weightSummary} | score ${formatNumber(entry.topScore)} | blockers ${Math.round(entry.blockersCount)} | open ${formatPercent(entry.opennessPreserved)} | conv ${formatPercent(entry.convergenceAchieved)}${plateauSummary}`;
}

function buildCycleSnapshot({ resolveCycle, adaptiveResolver, qa, candidates }) {
  const signals = qa?.signals ?? {};

  return {
    resolveCycle,
    weightSummary: formatAdaptiveModifierSummary(adaptiveResolver),
    weights: Object.fromEntries(ADAPTIVE_WEIGHT_KEYS.map((key) => [key, Number(adaptiveResolver?.[key] ?? 0)])),
    topScore: Number(candidates?.[0]?.scoreBreakdown?.finalScore ?? candidates?.[0]?.score ?? 0),
    blockersCount: Number(signals.blockersCount ?? 0),
    opennessPreserved: Number(signals.opennessPreserved ?? 1),
    convergenceAchieved: Number(signals.convergenceAchieved ?? 0),
    plateauDetected: Boolean(adaptiveResolver?.plateauDetected),
    plateauReason: adaptiveResolver?.plateauReason ?? '',
    plateauNudgeSummary: adaptiveResolver?.plateauNudgeSummary ?? ''
  };
}

function computeAdaptiveTrends(history, trendWindow) {
  const entries = (history ?? []).slice(0, trendWindow).reverse();

  return {
    score: computeTrend(entries, (entry) => entry.topScore),
    blockers: computeTrend(entries, (entry) => entry.blockersCount),
    openness: computeTrend(entries, (entry) => entry.opennessPreserved),
    convergence: computeTrend(entries, (entry) => entry.convergenceAchieved)
  };
}

function computeTrend(entries, readValue) {
  if (!entries || entries.length < 2) {
    return createTrend('insufficient', 0, 0, 0, 0);
  }

  const start = Number(readValue(entries[0]) ?? 0);
  const end = Number(readValue(entries[entries.length - 1]) ?? 0);
  const delta = end - start;

  if (Math.abs(delta) <= TREND_EPSILON) {
    return createTrend('flat', start, end, 0, entries.length);
  }

  return createTrend(delta > 0 ? 'rising' : 'falling', start, end, delta, entries.length);
}

function createTrend(direction, start, end, delta, windowSize) {
  return {
    direction,
    start,
    end,
    delta,
    windowSize
  };
}

function createEmptyTrendSet() {
  return {
    score: createTrend('insufficient', 0, 0, 0, 0),
    blockers: createTrend('insufficient', 0, 0, 0, 0),
    openness: createTrend('insufficient', 0, 0, 0, 0),
    convergence: createTrend('insufficient', 0, 0, 0, 0)
  };
}

export function detectAdaptivePlateau(history, trendWindow = DEFAULT_TREND_WINDOW) {
  const entries = (history ?? []).slice(0, trendWindow).reverse();
  if (entries.length < PLATEAU_MIN_HISTORY) {
    return createPlateauState('insufficient history');
  }

  const scoreDelta = Math.abs(Number(entries[entries.length - 1].topScore ?? 0) - Number(entries[0].topScore ?? 0));
  const blockerDelta = Math.abs(Number(entries[entries.length - 1].blockersCount ?? 0) - Number(entries[0].blockersCount ?? 0));
  const opennessDelta = Math.abs(Number(entries[entries.length - 1].opennessPreserved ?? 0) - Number(entries[0].opennessPreserved ?? 0));
  const convergenceStart = Number(entries[0].convergenceAchieved ?? 0);
  const convergenceEnd = Number(entries[entries.length - 1].convergenceAchieved ?? 0);
  const convergenceDelta = Math.abs(convergenceEnd - convergenceStart);
  const weightSpread = getWeightSpread(entries);
  const stableWeights = ADAPTIVE_WEIGHT_KEYS.every((key) => (weightSpread[key] ?? 0) <= PLATEAU_WEIGHT_SPREAD);

  const plateauDetected = scoreDelta <= PLATEAU_SCORE_DELTA
    && blockerDelta <= PLATEAU_BLOCKER_DELTA
    && opennessDelta <= PLATEAU_OPENNESS_DELTA
    && convergenceEnd <= PLATEAU_LOW_CONVERGENCE
    && convergenceDelta <= PLATEAU_CONVERGENCE_DELTA
    && stableWeights;

  if (!plateauDetected) {
    return createPlateauState('plateau guard inactive', {
      windowSize: entries.length,
      metrics: {
        scoreDelta,
        blockerDelta,
        opennessDelta,
        convergenceDelta,
        convergenceEnd,
        weightSpread
      }
    });
  }

  return createPlateauState(
    `flat score/blockers/openness with convergence ${formatPercent(convergenceEnd)} and near-static adaptive weights`,
    {
      detected: true,
      windowSize: entries.length,
      metrics: {
        scoreDelta,
        blockerDelta,
        opennessDelta,
        convergenceDelta,
        convergenceEnd,
        weightSpread
      }
    }
  );
}

function getWeightSpread(entries) {
  return Object.fromEntries(ADAPTIVE_WEIGHT_KEYS.map((key) => {
    const values = entries.map((entry) => Number(entry.weights?.[key] ?? 0));
    const spread = Math.max(...values) - Math.min(...values);
    return [key, Number(spread.toFixed(4))];
  }));
}

function createPlateauState(reason = 'waiting for plateau signal', overrides = {}) {
  return {
    detected: false,
    reason,
    windowSize: 0,
    metrics: null,
    ...overrides
  };
}

function formatNumber(value) {
  return Number(value ?? 0).toFixed(2);
}

function formatPercent(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}
