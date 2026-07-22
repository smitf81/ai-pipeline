export const ATMOSPHERIC_POST_PROCESS_POLISH_MODE = 'atmospheric_post_process_polish_v0';

export const POST_PROCESS_POLISH_TUNING = Object.freeze({
  classification: 'atmospheric_post_process_polish_tuning_v0',
  policy: 'single_world_composite_pass_no_gameplay_overlay_ownership',
  postEnabled: true,
  debugToggleParam: 'post',
  gradeStrength: 0.34,
  shadowCoolStrength: 0.3,
  fireWarmStrength: 0.22,
  vignetteStrength: 0.2,
  vignetteRadius: 0.72,
  grainStrength: 0.014,
  glowProxyStrength: 0.1,
  lowHealthPostStrength: 0.18
});

export function resolvePostProcessPolishTuning(overrides = null) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  return Object.freeze({
    classification: POST_PROCESS_POLISH_TUNING.classification,
    policy: POST_PROCESS_POLISH_TUNING.policy,
    postEnabled: source.postEnabled !== false,
    debugToggleParam: pickString(source.debugToggleParam, POST_PROCESS_POLISH_TUNING.debugToggleParam),
    gradeStrength: pickNumber(source.gradeStrength, POST_PROCESS_POLISH_TUNING.gradeStrength, 0, 1),
    shadowCoolStrength: pickNumber(source.shadowCoolStrength, POST_PROCESS_POLISH_TUNING.shadowCoolStrength, 0, 1),
    fireWarmStrength: pickNumber(source.fireWarmStrength, POST_PROCESS_POLISH_TUNING.fireWarmStrength, 0, 1),
    vignetteStrength: pickNumber(source.vignetteStrength, POST_PROCESS_POLISH_TUNING.vignetteStrength, 0, 0.6),
    vignetteRadius: pickNumber(source.vignetteRadius, POST_PROCESS_POLISH_TUNING.vignetteRadius, 0.45, 1.25),
    grainStrength: pickNumber(source.grainStrength, POST_PROCESS_POLISH_TUNING.grainStrength, 0, 0.06),
    glowProxyStrength: pickNumber(source.glowProxyStrength, POST_PROCESS_POLISH_TUNING.glowProxyStrength, 0, 0.3),
    lowHealthPostStrength: pickNumber(source.lowHealthPostStrength, POST_PROCESS_POLISH_TUNING.lowHealthPostStrength, 0, 0.5)
  });
}

function pickNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function pickString(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
