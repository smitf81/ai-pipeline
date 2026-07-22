import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, equal } from './assert.mjs';
import { getSoundCue } from '../src/audio/soundManifest.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const targets = [
  {
    cueId: 'player.bite.snap',
    fileCount: 2,
    channels: 1,
    duration: [0.38, 0.5]
  },
  {
    cueId: 'combat.enemy.hit.flesh',
    fileCount: 2,
    channels: 1,
    duration: [0.42, 0.58]
  },
  {
    cueId: 'world.mama_wyvern.distant_roar',
    fileCount: 1,
    channels: 2,
    duration: [5.0, 5.4]
  }
];

for (const target of targets) {
  const cue = getSoundCue(target.cueId);
  equal(cue.source, 'file', `${target.cueId} should use decoded file playback`);
  equal(cue.required, true, `${target.cueId} should fail visibly when its production asset is unavailable`);
  equal(cue.procedural, null, `${target.cueId} should use only its authored production file`);
  equal(cue.files.length, target.fileCount, `${target.cueId} should expose the intended variation count`);

  for (const runtimeFile of cue.files) {
    assert(runtimeFile.startsWith('assets/audio/production/'), `${target.cueId} should use the production runtime asset root`);
    const runtimePath = join(root, runtimeFile);
    assert(existsSync(runtimePath), `runtime audio asset should exist: ${runtimeFile}`);
    const runtime = inspectPcmWav(runtimePath);
    equal(runtime.audioFormat, 1, `${runtimeFile} should be PCM`);
    equal(runtime.sampleRate, 48_000, `${runtimeFile} should use the 48 kHz runtime standard`);
    equal(runtime.bitsPerSample, 16, `${runtimeFile} should be a compact 16-bit runtime WAV`);
    equal(runtime.channels, target.channels, `${runtimeFile} should use the intended channel layout`);
    assert(runtime.durationSeconds >= target.duration[0] && runtime.durationSeconds <= target.duration[1], `${runtimeFile} duration should fit the authored event`);
    assert(runtime.peak > 0.5 && runtime.peak < 0.95, `${runtimeFile} should be audible with sensible peak headroom`);
    assert(runtime.clippedSampleCount === 0, `${runtimeFile} should contain no clipped samples`);
    assert(runtime.dcOffset < 0.002, `${runtimeFile} should have negligible DC offset`);
    assert(runtime.firstSignalMs < 20, `${runtimeFile} should start promptly`);

    const stem = basename(runtimeFile, '.wav');
    const masterPath = join(root, 'assets', 'audio', 'masters', `${stem}_master.wav`);
    assert(existsSync(masterPath), `lossless working master should exist for ${runtimeFile}`);
    const master = inspectPcmWav(masterPath);
    equal(master.audioFormat, 1, `${stem} master should be PCM`);
    equal(master.sampleRate, 48_000, `${stem} master should use 48 kHz`);
    equal(master.bitsPerSample, 24, `${stem} master should preserve 24-bit depth`);
    equal(master.channels, target.channels, `${stem} master should preserve channel layout`);
  }
}

const analysisPath = join(root, 'artifacts', 'production-sfx-v1', 'audio-analysis.json');
const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
equal(analysis.contract, 'black-sky-bound.production-sfx-generation.v1', 'audio analysis should identify the production render contract');
equal(analysis.externalComponents.length, 0, 'production SFX should contain no externally sourced components');
equal(analysis.assets.length, 5, 'analysis should cover every production runtime file');
equal(analysis.mamaRoarExploration.candidateCount, 3, 'Mama roar exploration should preserve three authored candidates');
equal(
  analysis.mamaRoarExploration.selectedCandidateId,
  'candidate_b_wet_marsh_fury',
  'Mama roar manifest should identify the promoted reptilian candidate'
);
equal(
  analysis.mamaRoarExploration.candidates.filter((candidate) => candidate.status === 'rejected').length,
  2,
  'Mama roar exploration should preserve explicit rejection decisions'
);
assert(
  analysis.mamaRoarExploration.candidates.every((candidate) => candidate.layers.length === 8),
  'every Mama candidate should preserve all eight authored stems'
);

const directorSource = readFileSync(join(root, 'src', 'audio', 'audioDirector.js'), 'utf8');
assert(directorSource.includes("cue.source === 'file'"), 'AudioDirector should route file cues through the buffer path');
assert(directorSource.includes('recordPlaybackError'), 'required file playback failures should be explicit in runtime diagnostics');
assert(!directorSource.includes('file_fallback_to_placeholder'), 'production file cues must not silently fall back to synthesis');

function inspectPcmWav(path) {
  const buffer = readFileSync(path);
  assert(buffer.toString('ascii', 0, 4) === 'RIFF', `${path} should use a RIFF container`);
  assert(buffer.toString('ascii', 8, 12) === 'WAVE', `${path} should use a WAVE container`);
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14)
      };
    } else if (id === 'data') {
      data = buffer.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  assert(format && data, `${path} should contain fmt and data chunks`);
  const samples = decodePcm(data, format.bitsPerSample);
  const peak = samples.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  const mean = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
  const threshold = 10 ** (-50 / 20);
  const firstSignalIndex = samples.findIndex((value) => Math.abs(value) >= threshold);
  const frameCount = samples.length / format.channels;
  return {
    ...format,
    durationSeconds: frameCount / format.sampleRate,
    peak,
    dcOffset: Math.abs(mean),
    clippedSampleCount: samples.filter((value) => Math.abs(value) >= 0.999).length,
    firstSignalMs: firstSignalIndex < 0
      ? Infinity
      : firstSignalIndex / format.channels / format.sampleRate * 1000
  };
}

function decodePcm(data, bitsPerSample) {
  if (bitsPerSample === 16) {
    const samples = [];
    for (let offset = 0; offset + 1 < data.length; offset += 2) {
      samples.push(data.readInt16LE(offset) / 32768);
    }
    return samples;
  }
  if (bitsPerSample === 24) {
    const samples = [];
    for (let offset = 0; offset + 2 < data.length; offset += 3) {
      let value = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
      if (value & 0x800000) value |= 0xFF000000;
      samples.push(value / 8_388_608);
    }
    return samples;
  }
  throw new Error(`unsupported PCM depth in test: ${bitsPerSample}`);
}
