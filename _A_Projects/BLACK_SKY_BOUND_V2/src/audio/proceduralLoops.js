import {
  createGeneratedLoopSource,
  createSeededNoise
} from './proceduralPrimitives.js';

export function buildProceduralLoop(context, cue, outputGain) {
  const profile = cue?.procedural ?? {};
  if (profile.type === 'organicHeartbeatLoop') return createOrganicHeartbeatLoop(context, outputGain);
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

function createOrganicHeartbeatLoop(context, outputGain) {
  const durationSeconds = 6.4;
  const beatTimes = [0.42, 0.74, 1.55, 1.86, 2.79, 3.11, 4.08, 4.39, 5.34, 5.67];
  const noise = createSeededNoise(557);
  const source = createGeneratedLoopSource(context, durationSeconds, (time) => {
    let sample = 0;
    for (let index = 0; index < beatTimes.length; index += 1) {
      const age = time - beatTimes[index];
      if (age < 0 || age > 0.24) continue;
      const isSecondThump = index % 2 === 1;
      const frequency = isSecondThump ? 48 : 39;
      const decay = isSecondThump ? 28 : 20;
      const body = Math.sin(age * Math.PI * 2 * frequency) * Math.exp(-age * decay);
      const chest = Math.sin(age * Math.PI * 2 * frequency * 0.52) * Math.exp(-age * 15);
      sample += body * (isSecondThump ? 0.34 : 0.62) + chest * 0.2;
    }
    return sample * 0.48 + noise() * Math.min(0.018, Math.abs(sample) * 0.025);
  });
  const lowpass = context.createBiquadFilter();
  const bodyResonance = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 165;
  lowpass.Q.value = 0.55;
  bodyResonance.type = 'peaking';
  bodyResonance.frequency.value = 58;
  bodyResonance.Q.value = 0.8;
  bodyResonance.gain.value = 3.5;
  source.connect(lowpass);
  lowpass.connect(bodyResonance);
  bodyResonance.connect(outputGain);
  source.start();
  return {
    source: 'procedural_sfx',
    mode: 'irregular_organic_double_thump_buffer_loop',
    tonal: false,
    nodes: [source, lowpass, bodyResonance]
  };
}
