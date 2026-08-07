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

export const AUDIO_TUNING_SCHEMA_VERSION = 'bsb.audioTuning.v0';

export const OPENING_AUDIO_TUNING_FIELDS = Object.freeze([
  audioField('openingPerspective.sealedCutoffHz', 'Shell transmission', 'Sealed cutoff', 240, 4200, 20, 'Hz'),
  audioField('openingPerspective.sealedExteriorGain', 'Shell transmission', 'Exterior level', 0.1, 1, 0.01, 'gain'),
  audioField('openingPerspective.maxMuffleIntensity', 'Shell transmission', 'Maximum muffle', 0.5, 1, 0.01, 'ratio'),
  audioField('openingPerspective.shellOpeningLeakWeight', 'Exposure curve', 'Crack light leakage', 0.1, 0.8, 0.01, 'ratio'),
  audioField('openingPerspective.emergenceExposureRate', 'Exposure curve', 'Emergence exposure', 0.5, 2, 0.01, 'rate')
]);

const OPENING_AUDIO_FIELD_BY_PATH = new Map(OPENING_AUDIO_TUNING_FIELDS.map((item) => [item.path, item]));

export function normalizeAudioMix(source = null) {
  return {
    master: level(source?.master, AUDIO_USER_MIX_DEFAULTS.master),
    ambience: level(source?.ambience, AUDIO_USER_MIX_DEFAULTS.ambience),
    effects: level(source?.effects, AUDIO_USER_MIX_DEFAULTS.effects)
  };
}

export const AUDIO_TUNING = Object.freeze({
  contract: 'black-sky-bound.audio-tuning.v1',
  buses: Object.freeze({
    master: 0.82,
    ambience: 0.34,
    player: 0.78,
    enemies: 0.72,
    combat: 0.76,
    ui: 0.55,
    music: 0.18
  }),
  pause: Object.freeze({
    mode: 'ui_live_ambience_duck_gameplay_silent',
    busMultipliers: Object.freeze({
      master: 1,
      ambience: 0.16,
      player: 0,
      enemies: 0,
      combat: 0,
      ui: 1,
      music: 0.12
    })
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
  openingPerspective: Object.freeze({
    mode: 'authored_distance_non_positional_shell_transmission',
    listenerRelativeAttenuation: false,
    sealedCutoffHz: 560,
    sealedExteriorGain: 0.46,
    maxMuffleIntensity: 0.92,
    shellOpeningLeakWeight: 0.32,
    emergenceExposureRate: 1.15
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

export function createEmptyAudioTuning() {
  return { schemaVersion: AUDIO_TUNING_SCHEMA_VERSION, openingPerspective: {} };
}

export function normalizeAudioTuning(payload, options = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const result = createEmptyAudioTuning();
  const issues = [];
  for (const [path, value] of collectNumericLeaves(source.openingPerspective ?? {}, 'openingPerspective')) {
    const field = OPENING_AUDIO_FIELD_BY_PATH.get(path);
    if (!field) {
      issues.push({ code: 'unknown_audio_tuning_path', path });
      continue;
    }
    setAtPath(result, path, clamp(Number(value), field.min, field.max));
  }
  return {
    ok: !options.rejectUnknown || issues.length === 0,
    tuning: result,
    issues
  };
}

export function resolveAudioTuning(overrides = null) {
  const resolved = cloneData(AUDIO_TUNING);
  const normalized = normalizeAudioTuning(overrides).tuning;
  for (const [path, value] of collectNumericLeaves(normalized.openingPerspective, 'openingPerspective')) {
    setAtPath(resolved, path, value);
  }
  return freezeDeep(resolved);
}

export function setAudioTuningValue(tuning, path, value) {
  const field = OPENING_AUDIO_FIELD_BY_PATH.get(path);
  if (!field) return { ok: false, reason: 'unknown_audio_tuning_path', path };
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { ok: false, reason: 'invalid_audio_tuning_value', path };
  const next = cloneData(normalizeAudioTuning(tuning).tuning);
  const clamped = clamp(numeric, field.min, field.max);
  setAtPath(next, path, clamped);
  return { ok: true, tuning: normalizeAudioTuning(next).tuning, path, value: clamped };
}

export function getOpeningAudioTuningFields() {
  return OPENING_AUDIO_TUNING_FIELDS.map((item) => ({ ...item }));
}

export function getResolvedAudioTuningValue(tuning, path) {
  return getAtPath(resolveAudioTuning(tuning), path);
}

export function listAudioTuningOverridePaths(tuning) {
  return collectNumericLeaves(normalizeAudioTuning(tuning).tuning.openingPerspective, 'openingPerspective')
    .map(([path]) => path)
    .sort();
}

function level(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}

function audioField(path, group, label, min, max, step, unit) {
  return Object.freeze({ path, group, label, min, max, step, unit });
}

function collectNumericLeaves(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  const result = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'number' && Number.isFinite(child)) result.push([path, child]);
    else if (child && typeof child === 'object') result.push(...collectNumericLeaves(child, path));
  }
  return result;
}

function setAtPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function getAtPath(target, path) {
  let cursor = target;
  for (const part of path.split('.')) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
