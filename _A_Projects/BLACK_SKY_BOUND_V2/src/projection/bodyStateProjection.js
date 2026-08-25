import { BodyStateProfileId, getBodyStateProfile } from '../data/bodyStateFeedback.js';

const PROFILE = getBodyStateProfile(BodyStateProfileId.YOUNG_DRAGON_SURVIVAL);

export function buildBodyStateProjection(game, renderTime = 0) {
  const player = (game.actors ?? []).find((actor) => actor.alive && actor.team === 'player')
    ?? (game.actors ?? []).find((actor) => actor.team === 'player')
    ?? null;
  const health = buildHealthPressure(player, renderTime);
  const stamina = buildStaminaBreath(player, renderTime);
  return {
    classification: 'renderer_neutral_body_state_feedback_v0',
    profileId: PROFILE.id,
    enabled: PROFILE.enabled,
    health,
    stamina,
    postProcess: {
      ...PROFILE.postProcess,
      healthPressure: health.pressure,
      hitPulse: health.hitPulse,
      staminaPressure: stamina.pressure,
      breathPulse: stamina.breathPulse,
      desaturation: health.desaturation,
      contrast: health.contrast
    },
    debug: PROFILE.debug
  };
}

function buildHealthPressure(player, renderTime) {
  const maxHp = Math.max(1, player?.maxHp ?? PROFILE.health.maxHealth);
  const hp = clamp(player?.hp ?? maxHp, 0, maxHp);
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  const missing01 = 1 - ratio;
  const pressure = resolveDangerPressure(
    ratio,
    PROFILE.health.visualOnsetRatio,
    PROFILE.health.dangerCurveExponent
  ) * PROFILE.health.maxPressure;
  const hitPulse = clamp01((player?.health?.hitPulseRemainingMs ?? 0) / Math.max(1, PROFILE.health.hitPulseDurationMs));
  const critical01 = clamp01((PROFILE.health.visualCriticalRatio - ratio) / Math.max(0.001, PROFILE.health.visualCriticalRatio));
  const pulseWave = 0.5 + 0.5 * Math.sin(Math.max(0, renderTime) * Math.PI * 2 * PROFILE.health.dangerPulseHz);
  const dangerPulse = critical01 * pulseWave;
  return {
    hp,
    maxHp,
    ratio,
    missing01,
    pressure,
    hitPulse,
    critical: ratio <= PROFILE.health.visualCriticalRatio,
    critical01,
    dangerPulse,
    recovering: player?.health?.recovering === true,
    recoveryBlockedByThreat: player?.health?.recoveryBlockedByThreat === true,
    directPursuerCount: player?.health?.directPursuerCount ?? 0,
    regenDelayRemainingMs: player?.health?.recoveryDelayRemainingMs ?? 0,
    desaturation: 0,
    contrast: critical01 * PROFILE.postProcess.criticalContrast
  };
}

function buildStaminaBreath(player, renderTime) {
  const stamina = player?.stamina ?? null;
  const max = Math.max(1, stamina?.max ?? 1);
  const current = clamp(stamina?.current ?? max, 0, max);
  const ratio = current / max;
  const lowPressure = resolveDangerPressure(ratio, PROFILE.stamina.lowThreshold, PROFILE.stamina.dangerCurveExponent);
  const exhausted = stamina?.state === 'exhausted' || ratio <= PROFILE.stamina.exhaustedThreshold;
  const exerting = stamina?.sprinting === true
    || stamina?.state === 'dodging'
    || stamina?.state === 'emergency_dodging'
    || stamina?.state === 'dodge_buffered';
  const wave = 0.5 + 0.5 * Math.sin(Math.max(0, renderTime) * Math.PI * 2 * PROFILE.stamina.breathPulseHz);
  const pulseStrength = exhausted ? PROFILE.stamina.exhaustionPulseStrength : (exerting ? PROFILE.stamina.exertionPulseStrength : 0);
  const breathPulse = clamp01(wave * pulseStrength + (exerting ? 0.08 : 0));
  return {
    current,
    max,
    ratio,
    state: stamina?.state ?? 'inactive',
    sprinting: stamina?.sprinting === true,
    exhausted,
    exerting,
    pressure: clamp01(lowPressure + breathPulse * PROFILE.stamina.exertionPressureStrength),
    breathPulse,
    recoveryDelayRemainingMs: Math.max(0, (stamina?.recoveryTimer ?? 0) * 1000)
  };
}

export function resolveDangerPressure(ratio, onsetRatio, curveExponent) {
  const onset = Math.max(0.001, clamp(onsetRatio, 0.001, 1));
  const remapped = clamp01((onset - clamp01(ratio)) / onset);
  return Math.pow(remapped, Math.max(0.1, Number(curveExponent) || 1));
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}
