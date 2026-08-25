export const STORM_CAMERA_PROJECTION_CONTRACT = 'black-sky-bound.storm-camera-impulse.v1';

export function buildStormCameraProjection(state, tileSize) {
  const source = state?.audio?.lightning?.cameraShake;
  const suppressedReason = state?.paused === true
    ? 'paused'
    : state?.playerProfile?.settings?.reducedMotion === true
      ? 'reduced_motion'
      : source?.active !== true
        ? 'no_active_thunder'
        : null;
  if (suppressedReason) return inactiveProjection(suppressedReason);

  const durationMs = Math.max(1, finite(source.durationMs, 720));
  const elapsedMs = Math.max(0, finite(source.elapsedMs, 0));
  const life = clamp01(1 - elapsedMs / durationMs);
  const decay = Math.pow(life, Math.max(0.5, finite(source.decayPower, 2.05)));
  const frequencyHz = Math.max(1, finite(source.frequencyHz, 12.5));
  const phase = hashText(source.key) * Math.PI * 2;
  const time = elapsedMs / 1000;
  const amplitudeWorld = Math.max(0, finite(source.amplitudeTiles, 0.18))
    * Math.max(1, finite(tileSize, 32))
    * clamp01(source.intensity ?? 1)
    * decay;
  const xWave = Math.sin(time * frequencyHz * Math.PI * 2 + phase) * 0.72
    + Math.sin(time * frequencyHz * 1.73 * Math.PI * 2 + phase * 0.37) * 0.28;
  const yWave = Math.cos(time * frequencyHz * 1.31 * Math.PI * 2 + phase * 1.19) * 0.68
    + Math.sin(time * frequencyHz * 2.11 * Math.PI * 2 + phase * 0.61) * 0.22;
  return {
    classification: 'renderer_neutral_storm_camera_impulse',
    contract: STORM_CAMERA_PROJECTION_CONTRACT,
    active: amplitudeWorld > 0.001,
    sourceKey: source.key ?? null,
    sourcePolicy: source.sourcePolicy ?? 'delayed_thunder_arrival_only',
    elapsedMs: Math.round(elapsedMs),
    durationMs,
    decay: round3(decay),
    impulseWorldX: round3(xWave * amplitudeWorld),
    impulseWorldY: round3(yWave * amplitudeWorld),
    suppressedReason: null
  };
}

function inactiveProjection(suppressedReason) {
  return {
    classification: 'renderer_neutral_storm_camera_impulse',
    contract: STORM_CAMERA_PROJECTION_CONTRACT,
    active: false,
    sourceKey: null,
    sourcePolicy: 'delayed_thunder_arrival_only',
    elapsedMs: 0,
    durationMs: 0,
    decay: 0,
    impulseWorldX: 0,
    impulseWorldY: 0,
    suppressedReason
  };
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value ?? 'storm')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function round3(value) { return Math.round(value * 1000) / 1000; }
