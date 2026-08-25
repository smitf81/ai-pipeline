export const AUDIO_SPATIAL_PROFILE_CONTRACT = 'black-sky-bound.audio-spatial-profile.v1';

export const AudioSpatialProfileId = Object.freeze({
  MAMA_VOICE: 'mama_voice_spatial_v1',
  CREATURE_VOICE: 'creature_voice_spatial_v1',
  CREATURE_IMPACT: 'creature_impact_spatial_v1',
  SMOULDER_FIRE: 'smoulder_fire_spatial_v1',
  STORM: 'storm_spatial_v1'
});

export const AUDIO_SPATIAL_PROFILES = Object.freeze({
  [AudioSpatialProfileId.MAMA_VOICE]: profile({
    id: AudioSpatialProfileId.MAMA_VOICE,
    referenceDistanceMeters: 8,
    maxDistanceMeters: 160,
    rolloffFactor: 0.65,
    coneInnerAngle: 150,
    coneOuterAngle: 240,
    coneOuterGain: 0.32,
    sourceHeightMeters: 9.2,
    dopplerScale: 1,
    priority: 100
  }),
  [AudioSpatialProfileId.CREATURE_VOICE]: profile({
    id: AudioSpatialProfileId.CREATURE_VOICE,
    referenceDistanceMeters: 2,
    maxDistanceMeters: 45,
    rolloffFactor: 1.15,
    coneInnerAngle: 220,
    coneOuterAngle: 300,
    coneOuterGain: 0.42,
    sourceHeightMeters: 1.35,
    dopplerScale: 0.65,
    priority: 70
  }),
  [AudioSpatialProfileId.CREATURE_IMPACT]: profile({
    id: AudioSpatialProfileId.CREATURE_IMPACT,
    referenceDistanceMeters: 2,
    maxDistanceMeters: 45,
    rolloffFactor: 1.15,
    sourceHeightMeters: 0.8,
    dopplerScale: 0.35,
    priority: 82
  }),
  [AudioSpatialProfileId.SMOULDER_FIRE]: profile({
    id: AudioSpatialProfileId.SMOULDER_FIRE,
    referenceDistanceMeters: 1.5,
    maxDistanceMeters: 28,
    rolloffFactor: 1.35,
    sourceHeightMeters: 0.35,
    dopplerScale: 0,
    priority: 32,
    maxAudibleEmitters: 6,
    virtualizationHysteresisMeters: 1.5,
    virtualizationFadeSeconds: 0.2
  }),
  [AudioSpatialProfileId.STORM]: profile({
    id: AudioSpatialProfileId.STORM,
    referenceDistanceMeters: 18,
    maxDistanceMeters: 220,
    rolloffFactor: 0.18,
    sourceHeightMeters: 7,
    dopplerScale: 0,
    priority: 88
  })
});

export function getAudioSpatialProfile(id) {
  return AUDIO_SPATIAL_PROFILES[id] ?? null;
}

export function resolveAudioEmitter(definition = {}, fallbackProfileId = AudioSpatialProfileId.CREATURE_VOICE) {
  const profileId = definition.profileId && AUDIO_SPATIAL_PROFILES[definition.profileId]
    ? definition.profileId
    : fallbackProfileId;
  const base = getAudioSpatialProfile(profileId) ?? AUDIO_SPATIAL_PROFILES[AudioSpatialProfileId.CREATURE_VOICE];
  return Object.freeze({
    ...base,
    ...pickOverrides(definition),
    contract: 'black-sky-bound.audio-emitter.v1',
    emitterId: text(definition.emitterId, 'voice'),
    profileId,
    cueRoles: Object.freeze({ ...(definition.cueRoles ?? {}) }),
    shape: definition.shape === 'area' ? 'area' : 'point',
    anchor: text(definition.anchor, 'transform'),
    anchorOffsetX: finite(definition.anchorOffsetX, 0),
    anchorOffsetY: finite(definition.anchorOffsetY, 0),
    anchorHeightMeters: finite(definition.anchorHeightMeters, base.sourceHeightMeters),
    transmissionClass: text(definition.transmissionClass, 'exterior_world'),
    enabled: definition.enabled !== false
  });
}

function profile(definition) {
  return Object.freeze({
    contract: AUDIO_SPATIAL_PROFILE_CONTRACT,
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    shape: 'point',
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    coneOuterGain: 1,
    acousticTransmission: 'exterior_world',
    maxAudibleEmitters: null,
    virtualizationHysteresisMeters: 0,
    virtualizationFadeSeconds: 0.2,
    ...definition
  });
}

function pickOverrides(value) {
  const result = {};
  for (const key of [
    'referenceDistanceMeters', 'maxDistanceMeters', 'rolloffFactor', 'coneInnerAngle',
    'coneOuterAngle', 'coneOuterGain', 'dopplerScale', 'priority', 'panningModel',
    'distanceModel', 'maxAudibleEmitters', 'virtualizationHysteresisMeters', 'virtualizationFadeSeconds'
  ]) {
    if (value[key] != null && (typeof value[key] === 'string' || Number.isFinite(Number(value[key])))) {
      result[key] = typeof value[key] === 'string' ? value[key] : Number(value[key]);
    }
  }
  return result;
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function text(value, fallback) {
  return String(value ?? '').trim() || fallback;
}
