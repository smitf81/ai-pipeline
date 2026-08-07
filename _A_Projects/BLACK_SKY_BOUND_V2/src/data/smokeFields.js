export const SmokeFieldProfileId = Object.freeze({
  LOW_NIGHT_SMOKE: 'low_night_smoke'
});

export const SMOKE_FIELD_PROFILES = Object.freeze({
  [SmokeFieldProfileId.LOW_NIGHT_SMOKE]: Object.freeze({
    id: SmokeFieldProfileId.LOW_NIGHT_SMOKE,
    label: 'Low night smoke field',
    classification: 'derived_render_field_profile',
    densityScale: 0.38,
    baseOpacity: 0.24,
    litOpacity: 0.34,
    scatterStrength: 0.72,
    scatterOpacity: 0.42,
    radiusScale: 1.2,
    scrollSpeed: 0.11,
    driftStrength: 0.11,
    distortionStrengthPx: 7,
    distortionSlices: 28,
    densityColour: 'rgba(122,118,104,1)',
    shadowColour: 'rgba(28,28,28,1)',
    scatterColour: 'rgba(255,172,92,1)',
    scatterRadiusScale: 0.92,
    maxContributingLights: 16
  })
});

export function getSmokeFieldProfile(id = SmokeFieldProfileId.LOW_NIGHT_SMOKE) {
  const profile = SMOKE_FIELD_PROFILES[id];
  if (!profile) throw new Error(`Unknown smoke field profile: ${id}`);
  return profile;
}
