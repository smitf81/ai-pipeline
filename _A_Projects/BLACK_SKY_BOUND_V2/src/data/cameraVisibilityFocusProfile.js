export const CAMERA_VISIBILITY_FOCUS_PROFILE_CONTRACT = 'black-sky-bound.camera-visibility-focus-profile.v1';

export const DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE = Object.freeze({
  contract: CAMERA_VISIBILITY_FOCUS_PROFILE_CONTRACT,
  enabled: true,
  radiusMeters: 1.15,
  featherMeters: 0.3,
  minimumOccluderOpacity: 0.04
});

export const CAMERA_VISIBILITY_FOCUS_TUNING_FIELDS = Object.freeze([
  field('visibilityFocus.radiusMeters', 'Sightline cut radius', 0.45, 2.5, 0.05, 'm'),
  field('visibilityFocus.featherMeters', 'Cut edge softness', 0.1, 1.25, 0.05, 'm'),
  field('visibilityFocus.minimumOccluderOpacity', 'Blocker opacity', 0.02, 0.55, 0.01, 'ratio')
]);

export function normalizeCameraVisibilityFocusProfile(value) {
  const source = value && typeof value === 'object' ? value : DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE;
  return Object.freeze({
    contract: CAMERA_VISIBILITY_FOCUS_PROFILE_CONTRACT,
    enabled: source.enabled !== false,
    radiusMeters: clamp(source.radiusMeters, 0.45, 2.5, DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE.radiusMeters),
    featherMeters: clamp(source.featherMeters, 0.1, 1.25, DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE.featherMeters),
    minimumOccluderOpacity: clamp(source.minimumOccluderOpacity, 0.02, 0.55, DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE.minimumOccluderOpacity)
  });
}

function field(path, label, min, max, step, units) {
  return Object.freeze({
    path,
    group: 'Camera focus',
    label,
    min,
    max,
    step,
    units,
    classification: 'presentation_tuning',
    affectedConsumer: 'ThreeCameraVisibilityFocus',
    validationRule: 'bounded_numeric'
  });
}

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}
