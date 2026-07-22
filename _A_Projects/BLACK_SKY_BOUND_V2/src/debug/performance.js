export function createPerformanceDiagnostics() {
  return {
    fps: 0,
    frameMs: 0,
    lastFrameAt: 0,
    sampleElapsedMs: 0,
    sampleFrames: 0,
    sampleWindowMs: 500
  };
}

export function updateFramePerformance(performanceState, nowMs) {
  if (!performanceState) return createPerformanceDiagnostics();
  if (!performanceState.lastFrameAt) {
    performanceState.lastFrameAt = nowMs;
    return performanceState;
  }

  const delta = Math.max(0.001, nowMs - performanceState.lastFrameAt);
  performanceState.lastFrameAt = nowMs;
  performanceState.frameMs = delta;
  performanceState.sampleElapsedMs += delta;
  performanceState.sampleFrames += 1;

  const windowMs = performanceState.sampleWindowMs || 500;
  if (performanceState.sampleElapsedMs >= windowMs) {
    performanceState.fps = (performanceState.sampleFrames * 1000) / performanceState.sampleElapsedMs;
    performanceState.sampleElapsedMs = 0;
    performanceState.sampleFrames = 0;
  }

  return performanceState;
}
