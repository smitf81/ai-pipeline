export const BodyStateProfileId = Object.freeze({
  YOUNG_DRAGON_SURVIVAL: 'young_dragon_survival_body_state_v0'
});

export const BODY_STATE_PROFILES = Object.freeze({
  [BodyStateProfileId.YOUNG_DRAGON_SURVIVAL]: Object.freeze({
    id: BodyStateProfileId.YOUNG_DRAGON_SURVIVAL,
    enabled: true,
    health: Object.freeze({
      maxHealth: 80,
      maxPressure: 1,
      regenEnabled: true,
      regenDelayMs: 3600,
      regenPerSecond: 6.5,
      regenRampMs: 2800,
      regenStartMultiplier: 0.28,
      regenSprintingMultiplier: 0.42,
      regenActionMultiplier: 0.62,
      hitPulseDurationMs: 360,
      criticalHealthThreshold: 0.34
    }),
    stamina: Object.freeze({
      lowThreshold: 0.38,
      exhaustedThreshold: 0.16,
      breathPulseHz: 1.08,
      exertionPulseStrength: 0.32,
      exhaustionPulseStrength: 0.22
    }),
    postProcess: Object.freeze({
      baseVignetteStrength: 0.18,
      healthEdgeStrength: 0.42,
      hitPulseEdgeStrength: 0.34,
      staminaEdgeStrength: 0.28,
      criticalDesaturation: 0.26,
      criticalContrast: 0.12,
      maxDarken: 0.2
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
