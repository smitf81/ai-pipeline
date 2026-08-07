export const FIXED_SIMULATION_STEP_MS = 1000 / 60;
export const SIMULATION_SPEED_OPTIONS = [1, 10, 100];

export function createSimulationHarnessState(overrides = {}) {
  return {
    mode: overrides.mode === 'paused' ? 'paused' : 'running',
    speedMultiplier: sanitizeSimulationSpeed(overrides.speedMultiplier),
    fixedStepMs: sanitizeFixedStepMs(overrides.fixedStepMs),
    totalFrames: sanitizeFrameCount(overrides.totalFrames),
    lastAdvanceFrames: sanitizeFrameCount(overrides.lastAdvanceFrames),
    lastAdvanceSource: String(overrides.lastAdvanceSource ?? 'boot')
  };
}

export function sanitizeSimulationSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  return SIMULATION_SPEED_OPTIONS.reduce((best, option) =>
    Math.abs(option - numeric) < Math.abs(best - numeric) ? option : best
  , SIMULATION_SPEED_OPTIONS[0]);
}

export function setSimulationSpeed(state, value) {
  state.speedMultiplier = sanitizeSimulationSpeed(value);
  return state.speedMultiplier;
}

export function pauseSimulation(state) {
  state.mode = 'paused';
  return state.mode;
}

export function resumeSimulation(state) {
  state.mode = 'running';
  return state.mode;
}

export function getRealtimeFrameBudget(state) {
  if (!state || state.mode === 'paused') {
    return 0;
  }

  return sanitizeSimulationSpeed(state.speedMultiplier);
}

export function getStepCountForDurationMs(state, durationMs = FIXED_SIMULATION_STEP_MS) {
  const fixedStepMs = sanitizeFixedStepMs(state?.fixedStepMs);
  const numeric = Number(durationMs);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  return Math.max(1, Math.round(numeric / fixedStepMs));
}

export function recordSimulationAdvance(state, frames, source = 'manual') {
  const appliedFrames = sanitizeFrameCount(frames);
  state.totalFrames = sanitizeFrameCount(state.totalFrames) + appliedFrames;
  state.lastAdvanceFrames = appliedFrames;
  state.lastAdvanceSource = String(source ?? 'manual');
  return appliedFrames;
}

export function getSimulationStatusSummary(state) {
  const totalFrames = sanitizeFrameCount(state?.totalFrames);
  const speedMultiplier = sanitizeSimulationSpeed(state?.speedMultiplier);
  const fixedStepMs = sanitizeFixedStepMs(state?.fixedStepMs);
  const paused = state?.mode === 'paused';
  const elapsedSeconds = Number(((totalFrames * fixedStepMs) / 1000).toFixed(2));

  return {
    mode: paused ? 'paused' : 'running',
    paused,
    speedMultiplier,
    fixedStepMs,
    totalFrames,
    elapsedSeconds,
    lastAdvanceFrames: sanitizeFrameCount(state?.lastAdvanceFrames),
    lastAdvanceSource: String(state?.lastAdvanceSource ?? 'boot'),
    label: `${paused ? 'Paused' : 'Running'} | ${speedMultiplier}x | frame ${totalFrames} | ${elapsedSeconds.toFixed(2)}s sim`
  };
}

function sanitizeFixedStepMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return FIXED_SIMULATION_STEP_MS;
  }

  return numeric;
}

function sanitizeFrameCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.floor(numeric);
}
