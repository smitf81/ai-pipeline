export const LightingProfileId = Object.freeze({
  EARLY_NIGHT: 'early_night'
});

export const LIGHTING_PROFILES = Object.freeze({
  [LightingProfileId.EARLY_NIGHT]: Object.freeze({
    id: LightingProfileId.EARLY_NIGHT,
    classification: 'environment_lighting_profile',
    label: 'Early Night',
    darknessOpacity: 0.8,
    darknessColour: 'rgba(3, 7, 14, 1)',
    lightRevealStrength: 0.94,
    warmBloomOpacity: 0.16,
    shadowPassEnabled: true,
    shadowOpacity: 0.34,
    shadowSoftness: 0.62,
    shadowLengthScale: 1.25,
    shadowSpreadScale: 1.35,
    shadowContactScale: 0.74,
    shadowPenumbraScale: 1.28,
    shadowPenumbraAlphaScale: 0.44,
    shadowCoreDensityScale: 0.38,
    shadowContactDensity: 1.08,
    shadowCoreFalloff: Object.freeze([0.58, 0.34, 0.16]),
    shadowFieldSampleCount: 5,
    shadowFieldSoftnessScale: 1.16,
    shadowCompositeMode: 'light_shadow_attenuation_blend_v0',
    shadowLightBlendStrength: 1.08,
    shadowFieldAlphaScale: 2.05,
    shadowFieldRadiusScale: 0.72,
    shadowFieldTailTaperScale: 0.54,
    shadowFieldEdgeSoftness: 1.08,
    shadowFieldPenumbraGamma: 1.08,
    shadowFieldTailFloor: 0.24,
    lightHaloBlendScale: 1.14,
    lightHaloRadiusScale: 1,
    lightOuterBlendScale: 0.78,
    lightCoreBlendScale: 0.68,
    shadowPolicy: 'nearby_scene_and_dynamic_actor_sdf_ready_shadow_field_v1'
  })
});

export function getLightingProfile(id = LightingProfileId.EARLY_NIGHT) {
  return LIGHTING_PROFILES[id] ?? LIGHTING_PROFILES[LightingProfileId.EARLY_NIGHT];
}
