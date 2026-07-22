export const ADAPTIVE_WEIGHT_KEYS = ['def', 'reg', 'mem', 'hold', 'flow', 'trav', 'corr'];
export const ADAPTIVE_WEIGHT_LIMIT = 0.12;

const CHANGE_EPSILON = 0.0001;
const PLATEAU_NUDGE_COOLDOWN = 3;
const PLATEAU_NUDGE_MAP = {
  def: 0.02,
  reg: 0.01,
  corr: 0.01
};
const PLATEAU_OPENNESS_RELEASE = {
  flow: 0.02,
  trav: 0.01
};

export function createAdaptiveResolverState() {
  return {
    def: 0,
    reg: 0,
    mem: 0,
    hold: 0,
    flow: 0,
    trav: 0,
    corr: 0,
    reasons: ['QA within target range: keep base resolver weights'],
    lastQaSignals: null,
    changed: false,
    changedTerms: [],
    plateauDetected: false,
    plateauReason: 'waiting for plateau signal',
    plateauNudgeApplied: false,
    plateauNudgeTerms: [],
    plateauNudgeSummary: 'none',
    lastPlateauNudgeCycle: null,
    summary: 'base resolver weights',
    lastUpdatedCycle: null
  };
}

export function deriveAdaptiveResolverState({
  qa,
  previousState = createAdaptiveResolverState(),
  resolveCycle = null,
  adaptiveMonitor = null
} = {}) {
  const next = createAdaptiveResolverState();
  next.lastUpdatedCycle = resolveCycle;
  next.lastQaSignals = extractQaSignals(qa);
  next.reasons = [];
  next.lastPlateauNudgeCycle = previousState?.lastPlateauNudgeCycle ?? null;

  const { blockersCount, opennessPreserved, structureCoherence, convergenceAchieved, stableCycles } = next.lastQaSignals;

  if (blockersCount > 2) {
    next.mem -= 0.02;
    next.hold -= 0.03;
    next.flow += 0.05;
    next.trav += 0.05;
    next.reasons.push('High blockers: favour openness/traversal and soften blocker stickiness');
  }

  if (opennessPreserved < 0.85) {
    next.flow += 0.05;
    next.trav += 0.05;
    next.reasons.push('Low openness preserved: increase flow/traversal preservation');
  }

  if (structureCoherence < 0.6) {
    next.reg += 0.03;
    next.corr += 0.05;
    next.reasons.push('Low structure coherence: increase regional and corridor bias');
  }

  if (convergenceAchieved <= 0.1 && stableCycles >= 2) {
    next.def += 0.04;
    next.reg += 0.02;
    next.reasons.push('Low convergence across stable cycles: slightly increase constructive bias');
  }

  next.plateauDetected = Boolean(adaptiveMonitor?.plateau?.detected);
  next.plateauReason = adaptiveMonitor?.plateau?.reason ?? 'waiting for plateau signal';
  if (shouldApplyPlateauNudge({ resolveCycle, previousState, plateauDetected: next.plateauDetected })) {
    next.plateauNudgeTerms = applyPlateauNudge(next);
    next.plateauNudgeApplied = next.plateauNudgeTerms.length > 0;
    next.plateauNudgeSummary = next.plateauNudgeApplied ? next.plateauNudgeTerms.join(', ') : 'none';
    if (next.plateauNudgeApplied) {
      next.lastPlateauNudgeCycle = resolveCycle;
      next.reasons.push(`Plateau guard: ${next.plateauReason}; applied ${next.plateauNudgeSummary}`);
    }
  } else {
    next.plateauNudgeSummary = 'none';
  }

  ADAPTIVE_WEIGHT_KEYS.forEach((key) => {
    next[key] = clamp(next[key], -ADAPTIVE_WEIGHT_LIMIT, ADAPTIVE_WEIGHT_LIMIT);
  });

  if (next.reasons.length === 0) {
    next.reasons.push('QA within target range: keep base resolver weights');
  }

  next.changedTerms = ADAPTIVE_WEIGHT_KEYS
    .filter((key) => Math.abs(next[key] - (previousState?.[key] ?? 0)) > CHANGE_EPSILON)
    .map((key) => `${key} ${formatSignedWeight(next[key])}`);
  next.changed = next.changedTerms.length > 0;
  next.summary = formatAdaptiveModifierSummary(next);

  return next;
}

export function formatAdaptiveModifierSummary(state) {
  const activeTerms = ADAPTIVE_WEIGHT_KEYS
    .filter((key) => Math.abs(state?.[key] ?? 0) > CHANGE_EPSILON)
    .map((key) => `${key} ${formatSignedWeight(state[key])}`);

  return activeTerms.length > 0 ? activeTerms.join(', ') : 'base resolver weights';
}

export function snapshotAdaptiveResolverState(state) {
  const snapshot = {
    lastUpdatedCycle: state?.lastUpdatedCycle ?? null,
    summary: formatAdaptiveModifierSummary(state),
    plateauDetected: Boolean(state?.plateauDetected),
    plateauReason: state?.plateauReason ?? 'waiting for plateau signal',
    plateauNudgeApplied: Boolean(state?.plateauNudgeApplied),
    plateauNudgeSummary: state?.plateauNudgeSummary ?? 'none'
  };
  ADAPTIVE_WEIGHT_KEYS.forEach((key) => {
    snapshot[key] = Number((state?.[key] ?? 0).toFixed(3));
  });
  return snapshot;
}

function shouldApplyPlateauNudge({ resolveCycle, previousState, plateauDetected }) {
  if (!plateauDetected || resolveCycle == null) {
    return false;
  }

  const lastCycle = Number(previousState?.lastPlateauNudgeCycle ?? -Infinity);
  return resolveCycle - lastCycle >= PLATEAU_NUDGE_COOLDOWN;
}

function applyPlateauNudge(state) {
  const terms = [];

  Object.entries(PLATEAU_NUDGE_MAP).forEach(([key, delta]) => {
    state[key] += delta;
    terms.push(`${key} ${formatSignedWeight(delta)}`);
  });

  const flowRelease = Math.min(PLATEAU_OPENNESS_RELEASE.flow, Math.max(0, state.flow));
  if (flowRelease > CHANGE_EPSILON) {
    state.flow -= flowRelease;
    terms.push(`flow ${formatSignedWeight(-flowRelease)}`);
  }

  const travRelease = Math.min(PLATEAU_OPENNESS_RELEASE.trav, Math.max(0, state.trav));
  if (travRelease > CHANGE_EPSILON) {
    state.trav -= travRelease;
    terms.push(`trav ${formatSignedWeight(-travRelease)}`);
  }

  return terms;
}

function extractQaSignals(qa) {
  const metrics = new Map((qa?.metrics ?? []).map((metric) => [metric.key, Number(metric.value ?? 0)]));
  const signals = qa?.signals ?? {};

  return {
    blockersCount: Number(signals.blockersCount ?? 0),
    opennessPreserved: Number(signals.opennessPreserved ?? metrics.get('opennessPreserved') ?? 1),
    structureCoherence: Number(signals.structureCoherence ?? metrics.get('structureCoherence') ?? 1),
    convergenceAchieved: Number(signals.convergenceAchieved ?? metrics.get('convergenceAchieved') ?? 0),
    stableCycles: Number(signals.stableCycles ?? 0)
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatSignedWeight(value) {
  const numeric = Number(value ?? 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
}
