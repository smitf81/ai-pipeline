import {
  AUDIO_BUS_IDS,
  AUDIO_TUNING,
  normalizeAudioMix
} from '../data/audio/audioTuning.js';

export class AudioBusGraph {
  constructor(options = {}) {
    this.context = Object.hasOwn(options, 'context') ? options.context : createBrowserAudioContext();
    this.available = !!this.context;
    this.tuning = options.tuning ?? AUDIO_TUNING;
    this.baseGains = { ...this.tuning.buses };
    this.userMix = normalizeAudioMix(options.userMix);
    this.effectiveGains = new Map();
    this.busGains = new Map();
    this.masterGain = null;
    this.muffleFilter = null;
    this.muffleIntensity = 0;
    this.paused = false;
    if (this.context) this.createGraph(this.tuning);
    this.applyUserMix(this.userMix, 0);
  }

  createGraph(tuning) {
    const context = this.context;
    this.masterGain = context.createGain();
    this.masterGain.gain.value = tuning.buses.master ?? 1;
    this.muffleFilter = context.createBiquadFilter();
    this.muffleFilter.type = 'lowpass';
    this.muffleFilter.frequency.value = tuning.bodyState.muffle.maxCutoffHz;
    this.muffleFilter.Q.value = 0.0001;
    this.muffleFilter.connect(this.masterGain);
    this.masterGain.connect(context.destination);

    for (const id of AUDIO_BUS_IDS) {
      if (id === 'master') continue;
      const gain = context.createGain();
      gain.gain.value = tuning.buses[id] ?? 1;
      gain.connect(this.muffleFilter);
      this.busGains.set(id, gain);
    }
  }

  resume() {
    if (!this.context?.resume) return Promise.resolve(false);
    return this.context.resume().then(() => true, () => false);
  }

  createVoiceGain(busId, initialGain = 1) {
    if (!this.context) return null;
    const bus = this.busGains.get(busId) ?? this.busGains.get('ui');
    const gain = this.context.createGain();
    gain.gain.value = Math.max(0, Number(initialGain) || 0);
    gain.connect(bus);
    return gain;
  }

  setBusGain(busId, value, rampSeconds = 0.08) {
    const gain = busId === 'master' ? this.masterGain : this.busGains.get(busId);
    this.effectiveGains.set(busId, Math.max(0, Number(value) || 0));
    if (!gain) return;
    setAudioParam(gain.gain, this.context.currentTime, Math.max(0, Number(value) || 0), rampSeconds);
  }

  applyUserMix(mix, rampSeconds = 0.08, force = false) {
    const next = normalizeAudioMix(mix);
    if (
      !force
      &&
      this.effectiveGains.size > 0
      && next.master === this.userMix.master
      && next.ambience === this.userMix.ambience
      && next.effects === this.userMix.effects
    ) return false;
    this.userMix = next;
    for (const id of AUDIO_BUS_IDS) {
      const group = id === 'master' ? 'master'
        : id === 'ambience' || id === 'music' ? 'ambience'
          : 'effects';
      const pauseScale = this.paused ? (this.tuning.pause?.busMultipliers?.[id] ?? 0) : 1;
      this.setBusGain(id, (this.baseGains[id] ?? 1) * this.userMix[group] * pauseScale, rampSeconds);
    }
    return true;
  }

  setPaused(paused, rampSeconds = 0.06) {
    const next = paused === true;
    if (next === this.paused && this.effectiveGains.size > 0) return false;
    this.paused = next;
    this.applyUserMix(this.userMix, rampSeconds, true);
    return true;
  }

  setMuffleIntensity(intensity, rampSeconds = AUDIO_TUNING.bodyState.muffle.smoothingSeconds) {
    this.muffleIntensity = clamp01(intensity);
    if (!this.muffleFilter) return;
    const profile = AUDIO_TUNING.bodyState.muffle;
    const cutoff = profile.maxCutoffHz - (profile.maxCutoffHz - profile.minCutoffHz) * this.muffleIntensity;
    setAudioParam(this.muffleFilter.frequency, this.context.currentTime, cutoff, rampSeconds);
  }

  snapshot() {
    return {
      available: this.available,
      paused: this.paused,
      pauseMode: this.tuning.pause?.mode ?? null,
      muffleIntensity: Number(this.muffleIntensity.toFixed(3)),
      userMix: { ...this.userMix },
      buses: Object.fromEntries(AUDIO_BUS_IDS.map((id) => [
        id,
        Number((this.effectiveGains.get(id) ?? 0).toFixed(3))
      ]))
    };
  }
}

export function createBrowserAudioContext() {
  if (typeof globalThis === 'undefined') return null;
  const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
  if (!AudioContextCtor) return null;
  try {
    return new AudioContextCtor();
  } catch {
    return null;
  }
}

export function setAudioParam(param, now, value, rampSeconds = 0.04) {
  if (!param) return;
  const target = Math.max(0, Number(value) || 0);
  const start = Math.max(0, Number(now) || 0);
  if (param.cancelScheduledValues) param.cancelScheduledValues(start);
  if (param.setTargetAtTime && rampSeconds > 0) {
    param.setTargetAtTime(target, start, Math.max(0.001, rampSeconds));
  } else {
    param.value = target;
  }
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
