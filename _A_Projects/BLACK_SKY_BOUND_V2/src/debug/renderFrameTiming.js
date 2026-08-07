export const RENDER_FRAME_TIMING_CONTRACT = 'black-sky-bound.render-frame-timing.v2';

const PHASES = Object.freeze([
  'frameIntervalMs',
  'simulationMs',
  'projectionStaticMs',
  'projectionDynamicMs',
  'projectionMs',
  'worldUpdateMs',
  'overlayUpdateMs',
  'renderSubmitMs',
  'gpuMs',
  'renderPathMs',
  'coldStartMs'
]);
const SUMMARY_INTERVAL_FRAMES = 4;

export function createRenderFrameTiming() {
  const histories = Object.fromEntries(PHASES.map((phase) => [phase, []]));
  const current = Object.fromEntries(PHASES.map((phase) => [phase, 0]));
  let frame = 0;
  let coldStartMaxMs = 0;
  let longFrameCount = 0;
  const longFrames = [];
  let summaryFrame = -1;
  let cachedDiagnostics = null;

  function record(phase, value) {
    if (!histories[phase]) return;
    const numeric = Math.max(0, Number(value) || 0);
    current[phase] = numeric;
    const history = histories[phase];
    history.push(numeric);
    if (history.length > 240) history.shift();
    if (phase === 'frameIntervalMs') {
      frame += 1;
      if (frame <= 60) coldStartMaxMs = Math.max(coldStartMaxMs, numeric);
      else if (numeric > 50) {
        longFrameCount += 1;
        longFrames.push({ frame, frameIntervalMs: round(numeric), simulationMs: round(current.simulationMs), renderPathMs: round(current.renderPathMs) });
        if (longFrames.length > 12) longFrames.shift();
      }
    }
  }

  function diagnostics() {
    if (cachedDiagnostics && frame > 60 && frame - summaryFrame < SUMMARY_INTERVAL_FRAMES) return cachedDiagnostics;
    summaryFrame = frame;
    cachedDiagnostics = {
      contract: RENDER_FRAME_TIMING_CONTRACT,
      frame,
      warmupFrames: 60,
      warmedUp: frame > 60,
      coldStartMaxMs: round(coldStartMaxMs),
      longFrameCount,
      longFrames: longFrames.map((entry) => ({ ...entry })),
      current: roundedRecord(current),
      median: summarize(histories, percentile50),
      p95: summarize(histories, percentile95),
      max: summarize(histories, maximum)
    };
    return cachedDiagnostics;
  }

  return { record, diagnostics };
}

function summarize(histories, reducer) {
  return Object.fromEntries(Object.entries(histories).map(([key, values]) => [key, round(reducer(values))]));
}

function roundedRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, round(value)]));
}

function percentile50(values) { return percentile(values, 0.5); }
function percentile95(values) { return percentile(values, 0.95); }
function maximum(values) { return values.length ? Math.max(...values) : 0; }

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function round(value) { return Math.round((Number(value) || 0) * 1000) / 1000; }
