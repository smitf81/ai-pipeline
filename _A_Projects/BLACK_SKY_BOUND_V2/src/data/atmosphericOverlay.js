export const ATMOSPHERIC_CAMERA_OVERLAY_MODE = 'camera_space_atmospheric_overlay_v0';

export const ATMOSPHERIC_CAMERA_OVERLAY_TUNING = Object.freeze({
  classification: 'camera_space_atmospheric_overlay_tuning',
  policy: 'screen_space_visual_only_no_gameplay_weather_or_fire_sim',
  debugToggleParam: 'atmosphere',
  rainToggleParam: 'rain',
  sparkToggleParam: 'sparks',
  rainEnabled: true,
  rainDensity: 1,
  rainSpeed: 1380,
  rainAngle: 18,
  sparkEnabled: true,
  sparkRate: 3.4,
  sparkDrift: Object.freeze({ x: -34, y: -118 }),
  overlayOpacity: 0.98,
  emitterReactiveOverlayEnabled: true,
  emitterReactiveToggleParam: 'atmosphereEmitters',
  maxAtmosphereEmitters: 16,
  rainLightCatchStrength: 1,
  rainWarmTintStrength: 0.5,
  sparkLightCatchStrength: 0.32,
  emitterInfluenceFalloff: 1.65
});

export function resolveAtmosphericOverlayTuning(overrides = null) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  const sparkDrift = source.sparkDrift && typeof source.sparkDrift === 'object'
    ? source.sparkDrift
    : ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkDrift;
  return {
    ...ATMOSPHERIC_CAMERA_OVERLAY_TUNING,
    rainEnabled: source.rainEnabled ?? ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainEnabled,
    rainDensity: clampNumber(source.rainDensity, 0, 1, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainDensity),
    rainSpeed: clampNumber(source.rainSpeed, 120, 2400, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainSpeed),
    rainAngle: clampNumber(source.rainAngle, -42, 42, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainAngle),
    sparkEnabled: source.sparkEnabled ?? ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkEnabled,
    sparkRate: clampNumber(source.sparkRate, 0, 8, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkRate),
    sparkDrift: {
      x: clampNumber(sparkDrift.x, -180, 180, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkDrift.x),
      y: clampNumber(sparkDrift.y, -240, 60, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkDrift.y)
    },
    overlayOpacity: clampNumber(source.overlayOpacity, 0, 1, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.overlayOpacity),
    emitterReactiveOverlayEnabled: source.emitterReactiveOverlayEnabled ?? ATMOSPHERIC_CAMERA_OVERLAY_TUNING.emitterReactiveOverlayEnabled,
    maxAtmosphereEmitters: Math.round(clampNumber(source.maxAtmosphereEmitters, 0, 16, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.maxAtmosphereEmitters)),
    rainLightCatchStrength: clampNumber(source.rainLightCatchStrength, 0, 1, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainLightCatchStrength),
    rainWarmTintStrength: clampNumber(source.rainWarmTintStrength, 0, 1, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.rainWarmTintStrength),
    sparkLightCatchStrength: clampNumber(source.sparkLightCatchStrength, 0, 1, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.sparkLightCatchStrength),
    emitterInfluenceFalloff: clampNumber(source.emitterInfluenceFalloff, 0.5, 4, ATMOSPHERIC_CAMERA_OVERLAY_TUNING.emitterInfluenceFalloff)
  };
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}
