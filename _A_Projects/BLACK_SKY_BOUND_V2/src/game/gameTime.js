export const GAME_TIME_DEFAULT_REQUEST_ID = 'tutorial-cue';

export function createGameTimeState(baseScale = 1) {
  const base = safeScale(baseScale, 1);
  return {
    classification: 'single_gameplay_time_scale_authority_v0',
    baseScale: base,
    currentScale: base,
    requests: new Map(),
    lastRestoreReason: null
  };
}

export function requestGameTimeScale(state, request = {}) {
  if (!state?.requests) return false;
  const id = request.id ?? GAME_TIME_DEFAULT_REQUEST_ID;
  state.requests.set(id, {
    id,
    source: request.source ?? 'unknown',
    scale: safeScale(request.scale, state.baseScale),
    remainingRealSeconds: Math.max(0, Number(request.durationRealSeconds) || 0),
    priority: Number(request.priority) || 0
  });
  resolveCurrentScale(state);
  return true;
}

export function releaseGameTimeScale(state, id = GAME_TIME_DEFAULT_REQUEST_ID, reason = 'released') {
  if (!state?.requests?.delete(id)) return false;
  state.lastRestoreReason = reason;
  resolveCurrentScale(state);
  return true;
}

export function advanceGameTime(state, realDt) {
  if (!state?.requests) return 1;
  const delta = Math.max(0, Number(realDt) || 0);
  for (const [id, request] of state.requests) {
    request.remainingRealSeconds = Math.max(0, request.remainingRealSeconds - delta);
    if (request.remainingRealSeconds <= 0) {
      state.requests.delete(id);
      state.lastRestoreReason = 'request_timeout';
    }
  }
  return resolveCurrentScale(state);
}

export function resolveCurrentScale(state) {
  if (!state) return 1;
  let scale = safeScale(state.baseScale, 1);
  let priority = -Infinity;
  for (const request of state.requests?.values?.() ?? []) {
    if (request.priority > priority) {
      priority = request.priority;
      scale = request.scale;
    } else if (request.priority === priority) {
      scale = Math.min(scale, request.scale);
    }
  }
  state.currentScale = scale;
  return scale;
}

export function clearGameTimeRequests(state, reason = 'cleared') {
  if (!state?.requests) return;
  state.requests.clear();
  state.lastRestoreReason = reason;
  resolveCurrentScale(state);
}

function safeScale(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0.05, Math.min(2, number)) : fallback;
}
