export function createNoiseSource(context, durationMs, seed = 1) {
  const seconds = Math.max(0.08, durationMs / 1000);
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let state = (Math.abs(Math.trunc(seed * 104729)) || 1) >>> 0;
  let smooth = 0;
  for (let index = 0; index < data.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const white = state / 4294967295 * 2 - 1;
    smooth += (white - smooth) * 0.18;
    data[index] = white * 0.72 + smooth * 0.28;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

export function createGeneratedLoopSource(context, durationSeconds, sampleAt) {
  const length = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = clampSample(sampleAt(index / context.sampleRate, index));
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

export function createSeededNoise(seed = 1) {
  let state = (Math.abs(Math.trunc(seed * 104729)) || 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967295 * 2 - 1;
  };
}

export function scheduleEnvelope(param, now, durationSeconds, points) {
  const safeDuration = Math.max(0.001, durationSeconds);
  const first = points[0] ?? [0, 0.0001];
  param.setValueAtTime(Math.max(0.0001, first[1]), now + first[0] * safeDuration);
  for (const [phase, value, curve = 'linear'] of points.slice(1)) {
    const at = now + Math.max(0, Math.min(1, phase)) * safeDuration;
    const target = Math.max(0.0001, value);
    if (curve === 'exponential' && param.exponentialRampToValueAtTime) {
      param.exponentialRampToValueAtTime(target, at);
    } else {
      param.linearRampToValueAtTime(target, at);
    }
  }
}

export function connectNoiseLayer(context, outputGain, options = {}) {
  const durationMs = Math.max(80, options.durationMs ?? 220);
  const offsetSeconds = Math.max(0, options.offsetSeconds ?? 0);
  const now = context.currentTime + offsetSeconds;
  const durationSeconds = durationMs / 1000;
  const noise = createNoiseSource(context, durationMs, options.seed ?? 1);
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  filter.type = options.filterType ?? 'lowpass';
  filter.frequency.setValueAtTime(Math.max(20, options.frequencyHz ?? 900), now);
  if (options.endFrequencyHz) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequencyHz), now + durationSeconds);
  }
  filter.Q.value = Math.max(0.0001, options.q ?? 0.7);
  scheduleEnvelope(envelope.gain, now, durationSeconds, options.envelope ?? [
    [0, 0.0001],
    [0.06, options.gain ?? 0.8, 'exponential'],
    [1, 0.0001, 'exponential']
  ]);
  noise.connect(filter);
  filter.connect(envelope);
  envelope.connect(outputGain);
  noise.start(now);
  noise.stop(now + durationSeconds + 0.04);
  return [noise, filter, envelope];
}

export function connectOscillatorLayer(context, outputGain, options = {}) {
  const durationMs = Math.max(50, options.durationMs ?? 180);
  const offsetSeconds = Math.max(0, options.offsetSeconds ?? 0);
  const now = context.currentTime + offsetSeconds;
  const durationSeconds = durationMs / 1000;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = options.type ?? 'sine';
  oscillator.frequency.setValueAtTime(Math.max(20, options.frequencyHz ?? 80), now);
  if (options.endFrequencyHz) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequencyHz), now + durationSeconds);
  }
  scheduleEnvelope(envelope.gain, now, durationSeconds, options.envelope ?? [
    [0, 0.0001],
    [0.04, options.gain ?? 0.5, 'exponential'],
    [1, 0.0001, 'exponential']
  ]);
  oscillator.connect(envelope);
  envelope.connect(outputGain);
  oscillator.start(now);
  oscillator.stop(now + durationSeconds + 0.04);
  return [oscillator, envelope];
}

function clampSample(value) {
  return Math.max(-0.98, Math.min(0.98, Number(value) || 0));
}
