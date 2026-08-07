import {
  connectNoiseLayer,
  connectOscillatorLayer,
  createNoiseSource,
  scheduleEnvelope
} from './proceduralPrimitives.js';

export function buildProceduralOneShot(context, cue, outputGain, pitch = 1) {
  const profile = cue?.procedural ?? {};
  const durationMs = Math.max(80, profile.durationMs ?? 220);
  const frequencyHz = Math.max(20, (profile.frequencyHz ?? 180) * pitch);
  if (profile.type === 'shellRock') return createShellRock(context, outputGain, frequencyHz, durationMs);
  if (profile.type === 'shellCrack') return createShellCrack(context, outputGain, frequencyHz, durationMs);
  if (profile.type === 'shellBreak') return createShellBreak(context, outputGain, frequencyHz, durationMs);
  if (profile.type === 'distantCall') return createHumanVoice(context, outputGain, frequencyHz, durationMs);
  if (['smokeExhale', 'breathBurst', 'airSlice'].includes(profile.type)) {
    return createAirGesture(context, outputGain, frequencyHz, durationMs, profile.type);
  }
  return createBodyImpact(context, outputGain, frequencyHz, durationMs, profile.noise ?? 0.3);
}

function createShellRock(context, outputGain, frequencyHz, durationMs) {
  const nodes = [
    ...connectOscillatorLayer(context, outputGain, {
      frequencyHz: Math.max(34, frequencyHz * 0.72),
      endFrequencyHz: Math.max(24, frequencyHz * 0.4),
      durationMs,
      gain: 0.62,
      type: 'sine'
    }),
    ...connectNoiseLayer(context, outputGain, {
      durationMs: durationMs * 1.15,
      filterType: 'bandpass',
      frequencyHz: 310,
      endFrequencyHz: 150,
      q: 0.7,
      gain: 0.38,
      seed: 31
    }),
    ...connectNoiseLayer(context, outputGain, {
      durationMs: durationMs * 0.82,
      offsetSeconds: 0.045,
      filterType: 'highpass',
      frequencyHz: 1150,
      q: 0.4,
      gain: 0.12,
      seed: 47
    })
  ];
  return voice(durationMs * 1.15, 'shell_mass_scrape_and_body_knock', nodes);
}

function createShellCrack(context, outputGain, frequencyHz, durationMs) {
  const nodes = [];
  const splinters = [
    { offsetSeconds: 0, frequencyHz: 1900, gain: 0.72, seed: 71 },
    { offsetSeconds: 0.032, frequencyHz: 2850, gain: 0.54, seed: 73 },
    { offsetSeconds: 0.078, frequencyHz: 1320, gain: 0.42, seed: 79 }
  ];
  for (const splinter of splinters) {
    nodes.push(...connectNoiseLayer(context, outputGain, {
      durationMs: 74,
      filterType: 'bandpass',
      q: 2.2,
      envelope: [[0, 0.0001], [0.03, splinter.gain], [0.16, splinter.gain * 0.44], [1, 0.0001]],
      ...splinter
    }));
  }
  nodes.push(...connectOscillatorLayer(context, outputGain, {
    frequencyHz: Math.max(84, frequencyHz * 0.24),
    endFrequencyHz: Math.max(48, frequencyHz * 0.12),
    durationMs: durationMs * 0.86,
    gain: 0.24,
    type: 'triangle'
  }));
  nodes.push(...connectNoiseLayer(context, outputGain, {
    durationMs: durationMs * 1.4,
    filterType: 'highpass',
    frequencyHz: 620,
    endFrequencyHz: 1900,
    q: 0.55,
    gain: 0.18,
    seed: 83
  }));
  return voice(durationMs * 1.4, 'layered_shell_fracture_splinters', nodes);
}

function createShellBreak(context, outputGain, frequencyHz, durationMs) {
  const nodes = [
    ...connectOscillatorLayer(context, outputGain, {
      frequencyHz: Math.max(38, frequencyHz * 0.7),
      endFrequencyHz: 24,
      durationMs,
      gain: 0.7,
      type: 'sine'
    }),
    ...connectNoiseLayer(context, outputGain, {
      durationMs: durationMs * 1.35,
      filterType: 'lowpass',
      frequencyHz: 1500,
      endFrequencyHz: 280,
      q: 0.65,
      gain: 0.66,
      seed: 101,
      envelope: [[0, 0.0001], [0.025, 0.72], [0.18, 0.38], [0.44, 0.58], [1, 0.0001]]
    })
  ];
  for (let index = 0; index < 5; index += 1) {
    nodes.push(...connectNoiseLayer(context, outputGain, {
      durationMs: 86 + index * 16,
      offsetSeconds: 0.025 + index * 0.055,
      filterType: 'bandpass',
      frequencyHz: 2350 - index * 270,
      q: 1.8,
      gain: 0.36 - index * 0.035,
      seed: 109 + index * 7
    }));
  }
  return voice(durationMs * 1.35, 'shell_crown_collapse_and_debris', nodes);
}

function createHumanVoice(context, outputGain, frequencyHz, durationMs) {
  const now = context.currentTime;
  const end = now + durationMs / 1000;
  const fundamental = context.createOscillator();
  const grit = context.createOscillator();
  const formant = context.createBiquadFilter();
  const envelope = context.createGain();
  fundamental.type = 'sawtooth';
  grit.type = 'triangle';
  const start = frequencyHz * 0.82;
  const peak = frequencyHz * 1.34;
  fundamental.frequency.setValueAtTime(start, now);
  fundamental.frequency.linearRampToValueAtTime(peak, now + durationMs / 3500);
  fundamental.frequency.linearRampToValueAtTime(frequencyHz * 0.72, end);
  grit.frequency.setValueAtTime(start * 0.5, now);
  grit.frequency.linearRampToValueAtTime(peak * 0.48, end);
  formant.type = 'bandpass';
  formant.frequency.value = 760;
  formant.Q.value = 1.05;
  scheduleEnvelope(envelope.gain, now, durationMs / 1000,
    [[0, 0.0001], [0.06, 0.68], [0.38, 0.82], [0.72, 0.34], [1, 0.0001]]);
  fundamental.connect(formant);
  grit.connect(formant);
  formant.connect(envelope);
  envelope.connect(outputGain);
  fundamental.start(now);
  grit.start(now);
  fundamental.stop(end + 0.04);
  grit.stop(end + 0.04);
  const breath = connectNoiseLayer(context, outputGain, {
    durationMs,
    filterType: 'bandpass',
    frequencyHz: 1280,
    q: 0.7,
    gain: 0.2,
    seed: 227
  });
  return voice(durationMs, 'distant_human_call', [fundamental, grit, formant, envelope, ...breath]);
}

function createAirGesture(context, outputGain, frequencyHz, durationMs, mode) {
  const high = mode === 'airSlice';
  const nodes = connectNoiseLayer(context, outputGain, {
    durationMs,
    filterType: high ? 'bandpass' : 'lowpass',
    frequencyHz: high ? Math.max(900, frequencyHz * 2.8) : Math.max(220, frequencyHz * 2.1),
    endFrequencyHz: high ? Math.max(2100, frequencyHz * 5.1) : Math.max(90, frequencyHz * 0.8),
    q: high ? 1.35 : 0.65,
    gain: high ? 0.72 : 0.78,
    seed: high ? 263 : 251,
    envelope: high
      ? [[0, 0.0001], [0.08, 0.82], [0.28, 0.46], [1, 0.0001]]
      : [[0, 0.0001], [0.08, 0.34], [0.35, 0.86], [0.72, 0.42], [1, 0.0001]]
  });
  return voice(durationMs, high ? 'broadband_claw_air_cut' : 'shaped_breath_air_release', nodes);
}

function createBodyImpact(context, outputGain, frequencyHz, durationMs, noiseAmount) {
  const nodes = [
    ...connectOscillatorLayer(context, outputGain, {
      frequencyHz,
      endFrequencyHz: Math.max(22, frequencyHz * 0.42),
      durationMs,
      gain: 0.68,
      type: 'sine'
    }),
    ...connectNoiseLayer(context, outputGain, {
      durationMs: durationMs * 0.92,
      filterType: 'lowpass',
      frequencyHz: Math.max(360, frequencyHz * 5),
      endFrequencyHz: Math.max(100, frequencyHz * 1.4),
      q: 0.6,
      gain: Math.max(0.08, noiseAmount),
      seed: 293
    })
  ];
  return voice(durationMs, 'layered_body_impact', nodes);
}

function voice(durationMs, mode, nodes) {
  return { source: 'procedural_sfx', mode, durationMs, nodes };
}
