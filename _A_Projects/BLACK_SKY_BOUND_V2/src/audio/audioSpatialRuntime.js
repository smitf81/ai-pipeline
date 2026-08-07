import { startDecodedFileVoice } from './audioFileVoice.js';
import { setAudioParam, setSignedAudioParam } from './audioBus.js';
import { audioSourceRefKey } from './audioSpatialFrame.js';
import { clamp01, rounded } from './audioStateMath.js';
import { buildProceduralOneShot, proceduralDuration, randomPitch } from './proceduralAudio.js';
import { getAudioSpatialProfile } from '../data/audio/spatialAudioProfiles.js';
import { getSoundCue } from './soundManifest.js';

export function startSpatialAwareOneShot(director, cue, payload, sequence = 0) {
  const pitch = randomPitch(cue, payload, sequence);
  const sourceKey = audioSourceRefKey(payload.sourceRef);
  const spatial = cue.spatialization === 'point_mono' ? director.spatialFrame?.emitters?.[sourceKey] : null;
  if (!director.bus.context || !director.unlocked) {
    const durationMs = proceduralDuration(cue);
    return { headless: true, source: 'headless', pitch, durationMs, endsAtMs: director.timeMs + durationMs, startedAtMs: director.timeMs, sourceKey, spatial };
  }
  const profile = spatial ? { ...spatial.profile, ...(getAudioSpatialProfile(cue.profileId) ?? {}) } : null;
  const enclosure = resolveVoiceEnclosure(director, spatial ?? profile);
  const chain = spatial
    ? director.bus.createSpatialVoiceChain(cue.bus, profile, enclosure)
    : { voiceGain: director.bus.createVoiceGain(cue.bus, 0) };
  const gain = chain?.voiceGain;
  if (!gain) return null;
  const intensity = clamp01(payload.intensity ?? 1);
  const gainScale = Math.max(0, Number(payload.gainScale ?? 1) || 0);
  const volume = cue.volume * (0.54 + intensity * 0.46) * gainScale;
  setAudioParam(gain.gain, director.bus.context.currentTime, volume, 0.012);
  const voice = cue.source === 'file'
    ? startDecodedFileVoice(director, cue, gain, pitch, sequence)
    : buildProceduralOneShot(director.bus.context, cue, gain, pitch);
  if (!voice) return null;
  if (spatial) applyPannerFrame(chain.panner, spatial, director.bus.context.currentTime);
  const environment = cue.environmentFiles?.length
    ? startEnvironmentReturn(director, cue, pitch, sequence, volume, enclosure)
    : null;
  return {
    gain, nodes: voice.nodes, source: voice.source ?? cue.source, file: voice.file ?? null,
    pitch, basePitch: pitch, sourceNode: voice.sourceNode ?? null, sourceKey, spatial, profile,
    panner: chain.panner ?? null, enclosureFilter: chain.enclosureFilter ?? null,
    transmissionGain: chain.transmissionGain ?? null, environment, durationMs: voice.durationMs,
    startedAtMs: director.timeMs, endsAtMs: director.timeMs + voice.durationMs
  };
}

export function updateSpatialVoices(director) {
  if (!director.spatialFrame) return;
  const now = director.bus.context?.currentTime ?? 0;
  for (const voices of director.activeVoices.values()) {
    for (const voice of voices) {
      if (!voice.sourceKey) continue;
      const current = director.spatialFrame.emitters[voice.sourceKey];
      if (current) voice.spatial = current;
      const frame = current ?? voice.spatial;
      if (!frame) continue;
      if (voice.panner && director.bus.context) applyPannerFrame(voice.panner, frame, now);
      if (voice.sourceNode?.playbackRate && director.bus.context) setAudioParam(voice.sourceNode.playbackRate, now, voice.basePitch * frame.dopplerRatio, 0.08);
      const enclosure = resolveVoiceEnclosure(director, frame);
      updateEnclosure(director, voice, enclosure, now);
      if (voice.environment) updateEnclosure(director, voice.environment, enclosure, now);
    }
  }
  for (const loop of director.spatialLoopVoices.values()) {
    const current = director.spatialFrame.emitters[loop.sourceKey];
    if (!current) continue;
    loop.spatial = current;
    if (loop.panner && director.bus.context) applyPannerFrame(loop.panner, current, now);
  }
}

export function syncSpatialLoops(director, paused = false) {
  const cue = getSoundCue('world.fire.smoulder_loop');
  const candidates = Object.values(director.spatialFrame?.emitters ?? {})
      .filter((emitter) => emitter.profile.profileId === cue.profileId && emitter.distanceMeters < emitter.profile.maxDistanceMeters)
    .sort((a, b) => {
      const aDistance = a.distanceMeters - (director.spatialLoopVoices.has(a.key) ? a.profile.virtualizationHysteresisMeters : 0);
      const bDistance = b.distanceMeters - (director.spatialLoopVoices.has(b.key) ? b.profile.virtualizationHysteresisMeters : 0);
      return aDistance - bDistance || a.key.localeCompare(b.key);
    });
  const selected = new Set((paused ? [] : candidates.slice(0, 6)).map((entry) => entry.key));
  director.suppressed.virtualized = Math.max(0, candidates.length - selected.size);
  for (const emitter of candidates) {
    if (!selected.has(emitter.key) || director.spatialLoopVoices.has(emitter.key)) continue;
    const voice = startSpatialLoop(director, cue, emitter);
    if (voice) director.spatialLoopVoices.set(emitter.key, voice);
  }
  for (const [key, voice] of director.spatialLoopVoices) {
    if (selected.has(key)) continue;
    if (voice.gain?.gain && director.bus.context) setAudioParam(voice.gain.gain, director.bus.context.currentTime, 0, 0.2);
    voice.stopAtMs ??= director.timeMs + 200;
    if (director.timeMs >= voice.stopAtMs) {
      for (const node of voice.nodes ?? []) node.stop?.();
      director.spatialLoopVoices.delete(key);
    }
  }
}

export function applyPannerFrame(panner, spatial, now) {
  if (!panner || !spatial) return;
  const position = spatial.position;
  const forward = spatial.forward ?? { x: 0, y: 0, z: -1 };
  setSignedAudioParam(panner.positionX, now, position.x, 0.02);
  setSignedAudioParam(panner.positionY, now, position.y, 0.02);
  setSignedAudioParam(panner.positionZ, now, position.z, 0.02);
  setSignedAudioParam(panner.orientationX, now, forward.x, 0.02);
  setSignedAudioParam(panner.orientationY, now, forward.y, 0.02);
  setSignedAudioParam(panner.orientationZ, now, forward.z, 0.02);
  if (!panner.positionX && panner.setPosition) panner.setPosition(position.x, position.y, position.z);
  if (!panner.orientationX && panner.setOrientation) panner.setOrientation(forward.x, forward.y, forward.z);
}

export function cloneSpatialListener(listener) {
  return {
    ownerKind: listener.ownerKind, ownerId: listener.ownerId, position: { ...listener.position },
    velocity: { ...listener.velocity }, forward: { ...listener.forward }, up: { ...listener.up },
    earHeightMeters: listener.earHeightMeters
  };
}

export function summarizeEmitter(emitter, activeLoop = false) {
  return {
    sourceRef: { ...emitter.sourceRef }, profileId: emitter.profile.profileId,
    position: { ...emitter.position }, velocity: { ...emitter.velocity },
    distanceMeters: rounded(emitter.distanceMeters), attenuationGain: rounded(emitter.attenuationGain),
    pan: rounded(emitter.pan), dopplerRatio: rounded(emitter.dopplerRatio),
    transmissionClass: emitter.profile.transmissionClass, occlusion: { ...emitter.occlusion },
    virtualized: emitter.profile.profileId === 'smoulder_fire_spatial_v1' && !activeLoop, activeLoop
  };
}

function startEnvironmentReturn(director, cue, pitch, sequence, volume, enclosure) {
  const chain = director.bus.createTransmissionVoiceChain(cue.bus, enclosure);
  if (!chain) return null;
  setAudioParam(chain.voiceGain.gain, director.bus.context.currentTime, volume * 0.32, 0.018);
  const result = startDecodedFileVoice(director, cue, chain.voiceGain, pitch, sequence, false, { environment: true });
  return result ? { ...chain, ...result } : null;
}

function resolveVoiceEnclosure(director, source) {
  const profile = source?.profile ?? source;
  const exterior = profile?.transmissionClass !== 'listener_internal';
  const enclosure = exterior ? {
    cutoffHz: director.opening.mix?.cutoffHz ?? director.tuning.bodyState.muffle.maxCutoffHz,
    gain: director.opening.mix?.exteriorGain ?? 1
  } : { cutoffHz: director.tuning.bodyState.muffle.maxCutoffHz, gain: 1 };
  return {
    cutoffHz: Math.min(enclosure.cutoffHz, source?.occlusion?.cutoffHz ?? enclosure.cutoffHz),
    gain: enclosure.gain * (source?.occlusion?.gain ?? 1)
  };
}

function updateEnclosure(director, voice, enclosure, now) {
  if (voice.enclosureFilter && director.bus.context) setAudioParam(voice.enclosureFilter.frequency, now, enclosure.cutoffHz, 0.08);
  if (voice.transmissionGain && director.bus.context) setAudioParam(voice.transmissionGain.gain, now, enclosure.gain, 0.08);
}

function startSpatialLoop(director, cue, spatial) {
  if (!director.bus.context || !director.unlocked) return null;
  const profile = { ...spatial.profile, ...(getAudioSpatialProfile(cue.profileId) ?? {}) };
  const chain = director.bus.createSpatialVoiceChain(cue.bus, profile, resolveVoiceEnclosure(director, spatial));
  if (!chain) return null;
  const phase = stablePhaseSeconds(spatial.key, director.assets.select(cue, 0)?.entry?.buffer?.duration ?? 0);
  const decoded = startDecodedFileVoice(director, cue, chain.voiceGain, 1, 0, true, { offsetSeconds: phase });
  if (!decoded) return null;
  applyPannerFrame(chain.panner, spatial, director.bus.context.currentTime);
  setAudioParam(chain.voiceGain.gain, director.bus.context.currentTime, cue.volume, 0.2);
  return { sourceKey: spatial.key, spatial, profile, gain: chain.voiceGain, panner: chain.panner, nodes: decoded.nodes, startedAtMs: director.timeMs, deterministicPhaseSeconds: phase };
}

function stablePhaseSeconds(key, duration) {
  if (!(duration > 0)) return 0;
  let hash = 2166136261;
  for (const character of String(key)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) / 4294967295) * duration;
}
