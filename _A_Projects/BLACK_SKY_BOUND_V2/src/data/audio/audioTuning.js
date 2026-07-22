export const AUDIO_BUS_IDS = Object.freeze([
  'master',
  'ambience',
  'player',
  'enemies',
  'combat',
  'ui',
  'music'
]);

export const AUDIO_USER_MIX_DEFAULTS = Object.freeze({
  master: 1,
  ambience: 1,
  effects: 1
});

export function normalizeAudioMix(source = null) {
  return {
    master: level(source?.master, AUDIO_USER_MIX_DEFAULTS.master),
    ambience: level(source?.ambience, AUDIO_USER_MIX_DEFAULTS.ambience),
    effects: level(source?.effects, AUDIO_USER_MIX_DEFAULTS.effects)
  };
}

export const AUDIO_TUNING = Object.freeze({
  contract: 'black-sky-bound.audio-tuning.v0',
  buses: Object.freeze({
    master: 0.82,
    ambience: 0.34,
    player: 0.78,
    enemies: 0.72,
    combat: 0.76,
    ui: 0.55,
    music: 0.18
  }),
  bodyState: Object.freeze({
    muffle: Object.freeze({
      minCutoffHz: 720,
      maxCutoffHz: 18000,
      healthWeight: 0.76,
      hitPulseWeight: 0.58,
      smoothingSeconds: 0.08
    }),
    breath: Object.freeze({
      calmBaseGain: 0.038,
      calmPressureDuck: 0.7,
      strainedBaseGain: 0.108,
      staminaWeight: 0.78,
      healthWeight: 0.34,
      pulseWeight: 0.44
    }),
    heartbeat: Object.freeze({
      startsAtPressure: 0.42,
      baseGain: 0.12,
      hitPulseBoost: 0.32
    })
  }),
  proximity: Object.freeze({
    warningRangeTiles: 13,
    nearRangeTiles: 7,
    repeatCooldownMs: 1150,
    attackWarningCooldownMs: 420
  }),
  cueDefaults: Object.freeze({
    cooldownMs: 0,
    maxVoices: 8,
    pitchRandom: Object.freeze([1, 1]),
    volume: 1
  })
});

function level(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}
