import { buildBodyStateProjection } from '../projection/bodyStateProjection.js';
import { clamp01, resolveOpeningMix, rounded } from './audioStateMath.js';

export function resolveAudioPressureMix(state, tuning, ambienceVolume) {
  const bodyState = buildBodyStateProjection(state?.game, state?.time ?? state?.game?.renderTime ?? 0);
  const muffle = tuning.bodyState.muffle;
  const muffleIntensity = clamp01(
    bodyState.health.pressure * muffle.healthWeight
    + bodyState.health.hitPulse * muffle.hitPulseWeight
  );
  const breath = tuning.bodyState.breath;
  const breathStrain = clamp01(
    bodyState.stamina.pressure * breath.staminaWeight
    + bodyState.health.pressure * breath.healthWeight
    + bodyState.stamina.breathPulse * breath.pulseWeight
  );
  const heart = tuning.bodyState.heartbeat;
  const heartbeat = clamp01(
    (bodyState.health.pressure - heart.startsAtPressure) / Math.max(0.001, 1 - heart.startsAtPressure)
    + bodyState.health.hitPulse * heart.hitPulseBoost
  );
  const openingMix = resolveOpeningMix(state?.opening, tuning);
  const healthCutoffHz = muffle.maxCutoffHz - (muffle.maxCutoffHz - muffle.minCutoffHz) * muffleIntensity;
  const muffleCutoffHz = Math.min(healthCutoffHz, openingMix.cutoffHz);
  const bodyLoopScale = state?.paused === true ? 0 : 1;
  return {
    openingMix,
    muffleCutoffHz,
    pressure: {
      healthPressure: rounded(bodyState.health.pressure),
      staminaPressure: rounded(bodyState.stamina.pressure),
      hitPulse: rounded(bodyState.health.hitPulse),
      muffleIntensity: rounded(Math.max(muffleIntensity, openingMix.muffle)),
      muffleCutoffHz: Math.round(muffleCutoffHz),
      breathStrain: rounded(breathStrain),
      heartbeat: rounded(Math.max(heartbeat, openingMix.heartbeat))
    },
    loopGains: {
      'ambience.forest_night': ambienceVolume * (1 - bodyState.health.pressure * 0.24) * openingMix.ambience,
      'player.breath.calm': breath.calmBaseGain * (1 - breathStrain * breath.calmPressureDuck) * openingMix.breath * bodyLoopScale,
      'player.breath.strained': breath.strainedBaseGain * breathStrain * bodyLoopScale,
      'player.heartbeat': heart.baseGain * Math.max(heartbeat, openingMix.heartbeat) * bodyLoopScale
    }
  };
}
