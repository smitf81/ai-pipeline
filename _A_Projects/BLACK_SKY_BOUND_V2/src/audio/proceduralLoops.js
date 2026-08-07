import {
  createGeneratedLoopSource,
  createSeededNoise
} from './proceduralPrimitives.js';

export function buildProceduralLoop(context, cue, outputGain) {
  const profile = cue?.procedural ?? {};
  if (profile.type === 'breathCycleLoop') return createBreathCycleLoop(context, outputGain, profile.mode);
  return createForestNightLoop(context, outputGain);
}

function createForestNightLoop(context, outputGain) {
  const durationSeconds = 9.6;
  const noise = createSeededNoise(811);
  let low = 0;
  let mid = 0;
  const source = createGeneratedLoopSource(context, durationSeconds, (time) => {
    const white = noise();
    low += (white - low) * 0.0035;
    mid += (white - mid) * 0.055;
    const gust = 0.48
      + Math.sin(time * Math.PI * 2 / durationSeconds) * 0.14
      + Math.sin(time * 0.83 + 1.7) * 0.09;
    const leafPulse = Math.pow(Math.max(0, Math.sin(time * 1.91 + 0.4)), 9) * mid * 0.2;
    return low * gust * 0.56 + mid * 0.08 + leafPulse;
  });
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 42;
  highpass.Q.value = 0.4;
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1850;
  lowpass.Q.value = 0.55;
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(outputGain);
  source.start();
  return {
    source: 'procedural_sfx',
    mode: 'layered_forest_air_buffer_loop',
    tonal: false,
    nodes: [source, highpass, lowpass]
  };
}

function createBreathCycleLoop(context, outputGain, mode = 'calm') {
  const strained = mode === 'strained';
  const cycleSeconds = strained ? 1.8 : 4.8;
  const durationSeconds = cycleSeconds * 2;
  const noise = createSeededNoise(strained ? 337 : 223);
  let smooth = 0;
  const source = createGeneratedLoopSource(context, durationSeconds, (time) => {
    const phase = (time % cycleSeconds) / cycleSeconds;
    const inhale = phase < 0.42
      ? Math.sin(Math.PI * phase / 0.42)
      : 0;
    const exhalePhase = Math.max(0, (phase - 0.48) / 0.52);
    const exhale = phase >= 0.48 ? Math.sin(Math.PI * exhalePhase) : 0;
    const white = noise();
    smooth += (white - smooth) * (strained ? 0.28 : 0.18);
    const throat = smooth * (strained ? 0.24 : 0.12);
    const air = white * (inhale * (strained ? 0.34 : 0.22) + exhale * (strained ? 0.48 : 0.3));
    return (air + throat * Math.max(inhale, exhale)) * 0.64;
  });
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = strained ? 95 : 68;
  highpass.Q.value = 0.5;
  lowpass.type = 'lowpass';
  lowpass.frequency.value = strained ? 1250 : 780;
  lowpass.Q.value = strained ? 1.1 : 0.7;
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(outputGain);
  source.start();
  return {
    source: 'procedural_sfx',
    mode: strained ? 'strained_airway_buffer_loop' : 'calm_airway_buffer_loop',
    tonal: false,
    nodes: [source, highpass, lowpass]
  };
}
