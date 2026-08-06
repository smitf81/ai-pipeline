export const SmokeAwakeningPhase = Object.freeze({
  INACTIVE: 'inactive',
  IMPACT: 'impact',
  SCATTER: 'scatter',
  SMOKE_ROLL: 'smoke_roll',
  BLACKOUT_HOLD: 'blackout_hold',
  EXHALE: 'exhale',
  CLEARING: 'clearing',
  RELEASED: 'released'
});

export const SmokeAwakeningCueId = Object.freeze({
  IMPACT: 'instinct.smoke.impact',
  DEBRIS: 'instinct.smoke.debris',
  COUGH: 'instinct.smoke.cough',
  EXHALE: 'player.smoke.exhale',
  RAIDER_SHOUT: 'enemy.raider.distant_shout',
  MAMA_ROAR: 'world.mama_wyvern.distant_roar'
});

export const SMOKE_AWAKENING = Object.freeze({
  contract: 'black-sky-bound.smoke-instinct-transition.v1',
  classification: 'app_owned_level_transition_instinct_scene',
  arrivalSequenceId: 'smoke_instinct_awakening',
  requiredExhaleEdges: 3,
  timing: Object.freeze({
    impactSeconds: 1.05,
    scatterSeconds: 1.3,
    smokeRollSeconds: 1.65,
    blackoutHoldSeconds: 2.6,
    promptDelaySeconds: 0.62,
    inputCooldownSeconds: 0.56,
    pulseSeconds: 0.74,
    clearingSeconds: 1.85
  }),
  visual: Object.freeze({
    cameraZoom: 2.88,
    impactShakeWorld: 5.8,
    fullSmokeOpacity: 0.985,
    pocketStages: Object.freeze([0, 0.14, 0.36, 0.62])
  }),
  narrative: Object.freeze({
    timeOfDay: 'night',
    mamaVisibility: 'offscreen_only',
    revealLight: 'cold_moonlight_and_scattered_torches',
    playerInstruction: 'EXHALE'
  })
});
