import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { buildProceduralLoop } from '../src/audio/proceduralAudio.js';
import { getSoundCue, SOUND_CUES } from '../src/audio/soundManifest.js';

const proceduralCues = Object.values(SOUND_CUES).filter((cue) => cue.source !== 'file');
assert(proceduralCues.length > 0, 'manifest should expose non-file procedural sound cues');
assert(proceduralCues.every((cue) => cue.source === 'procedural_sfx'), 'every non-file cue should use the production procedural contract');
assert(proceduralCues.every((cue) => cue.files.length === 0), 'procedural cues should not retain dead placeholder file paths');
assert(proceduralCues.every((cue) => cue.procedural?.type), 'procedural cues should expose an authored synthesis profile');

equal(getSoundCue('opening.egg.rock').procedural.type, 'shellRock', 'egg movement should use a shell-mass-specific sound');
equal(getSoundCue('opening.egg.crack').procedural.type, 'shellCrack', 'egg cracking should use layered shell fractures');
equal(getSoundCue('opening.egg.break').procedural.type, 'shellBreak', 'egg release should use a shell collapse and debris sound');
equal(getSoundCue('player.heartbeat').procedural.type, 'organicHeartbeatLoop', 'heartbeat should use the organic buffered pulse');

const context = fakeLoopContext();
const output = context.createGain();
const heartbeat = buildProceduralLoop(context, getSoundCue('player.heartbeat'), output);
equal(heartbeat.source, 'procedural_sfx', 'heartbeat loop should report the procedural source contract');
equal(heartbeat.mode, 'irregular_organic_double_thump_buffer_loop', 'heartbeat diagnostics should identify the irregular body-thump render');
equal(heartbeat.tonal, false, 'heartbeat should explicitly reject a tonal monitor-beep design');
equal(context.oscillatorCount, 0, 'heartbeat loop construction should create no live oscillators');
assert(context.startedSources === 1, 'heartbeat buffer should start one bounded loop source');

const source = readFileSync(new URL('../src/audio/proceduralLoops.js', import.meta.url), 'utf8');
assert(!source.includes("type = 'square'"), 'procedural loops must not contain square-wave monitor modulation');
assert(!source.includes('createPulseLoop'), 'legacy regular pulse-loop synthesis should be removed');

function fakeLoopContext() {
  const context = {
    sampleRate: 2000,
    currentTime: 0,
    oscillatorCount: 0,
    startedSources: 0,
    createBuffer: (_channels, length) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      connect: () => {},
      start: () => { context.startedSources += 1; }
    }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: { value: 0 },
      connect: () => {}
    }),
    createGain: () => ({
      gain: { value: 1 },
      connect: () => {}
    }),
    createOscillator: () => {
      context.oscillatorCount += 1;
      throw new Error('heartbeat loop must not create an oscillator');
    }
  };
  return context;
}
