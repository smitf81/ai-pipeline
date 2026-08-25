export const BodyStateProfileId = Object.freeze({
  YOUNG_DRAGON_SURVIVAL: 'young_dragon_survival_body_state_v0'
});

export const BODY_STATE_PROFILES = Object.freeze({
  [BodyStateProfileId.YOUNG_DRAGON_SURVIVAL]: Object.freeze({
    id: BodyStateProfileId.YOUNG_DRAGON_SURVIVAL,
    enabled: true,
    health: Object.freeze({
      maxHealth: 56,
      maxPressure: 1,
      regenEnabled: true,
      regenDelayMs: 9000,
      regenPerSecond: 2.25,
      regenRampMs: 5000,
      regenStartMultiplier: 0.15,
      regenSprintingMultiplier: 0,
      regenActionMultiplier: 0.25,
      hitPulseDurationMs: 520,
      criticalHealthThreshold: 0.43,
      visualOnsetRatio: 0.62,
      visualCriticalRatio: 0.35,
      dangerCurveExponent: 1.4,
      dangerPulseHz: 1.16
    }),
    stamina: Object.freeze({
      lowThreshold: 0.42,
      exhaustedThreshold: 0.16,
      dangerCurveExponent: 1.25,
      breathPulseHz: 1.08,
      exertionPulseStrength: 0.32,
      exhaustionPulseStrength: 0.22,
      exertionPressureStrength: 0.16
    }),
    postProcess: Object.freeze({
      baseVignetteStrength: 0.18,
      healthEdgeStrength: 0.42,
      hitPulseEdgeStrength: 0.34,
      staminaEdgeStrength: 0.28,
      criticalDesaturation: 0.26,
      criticalContrast: 0.12,
      maxDarken: 0.2,
      healthMaxEdgeOpacity: 0.78,
      healthMaxBloodOpacity: 0.36,
      healthRestingClearRadius: 82,
      healthMaxContraction: 34,
      staminaMaxEdgeOpacity: 0.56,
      staminaMaxDesaturation: 0.32,
      staminaMaxContrastLoss: 0.16,
      staminaMaxBrightnessLoss: 0.12,
      staminaRestingClearRadius: 76,
      staminaMaxContraction: 28
    }),
    debug: Object.freeze({
      hudQueryParam: 'debugHud',
      bodyStateQueryParam: 'bodyState'
    })
  })
});

export function getBodyStateProfile(id) {
  const profile = BODY_STATE_PROFILES[id];
  if (!profile) throw new Error(`Unknown body state profile: ${id}`);
  return profile;
}
