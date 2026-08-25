import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, equal } from './assert.mjs';
import { collectSoundAssetFiles, getSoundCue, SOUND_CUES } from '../src/audio/soundManifest.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifestAudioFiles = collectSoundAssetFiles();
const environmentFiles = Object.values(SOUND_CUES).flatMap((cue) => cue.environmentFiles ?? []);
assert(environmentFiles.length > 0, 'production manifest should expose authored environment-return assets');
assert(environmentFiles.every((file) => manifestAudioFiles.includes(file)), 'canonical asset enumeration should include every environment return');
const targets = [
  {
    cueId: 'player.voice.first_cry',
    fileCount: 2,
    channels: 1,
    duration: [1.84, 1.86],
    firstSignalMaxMs: 110,
    bus: 'player'
  },
  {
    cueId: 'player.bite.snap',
    fileCount: 3,
    channels: 1,
    duration: [0.47, 0.49],
    firstSignalMaxMs: 40
  },
  {
    cueId: 'combat.enemy.hit.flesh',
    fileCount: 2,
    channels: 1,
    duration: [0.42, 0.58]
  },
  {
    cueId: 'enemy.raider.warn',
    fileCount: 5,
    channels: 1,
    duration: [0.45, 0.55],
    firstSignalMaxMs: 5,
    bus: 'enemies'
  },
  {
    cueId: 'enemy.raider.distant_shout',
    fileCount: 2,
    channels: 1,
    duration: [1.57, 1.59],
    bus: 'enemies'
  },
  {
    cueId: 'opening.exterior.raider_through_shell',
    fileCount: 2,
    channels: 1,
    duration: [1.57, 1.59],
    bus: 'enemies'
  },
  {
    cueId: 'enemy.husk.distant_gargle',
    fileCount: 2,
    channels: 1,
    duration: [1.71, 1.73],
    bus: 'enemies'
  },
  {
    cueId: 'opening.exterior.husk_through_shell',
    fileCount: 2,
    channels: 1,
    duration: [1.71, 1.73],
    bus: 'enemies'
  },
  {
    cueId: 'enemy.werewolf.distant_howl',
    fileCount: 2,
    channels: 1,
    duration: [6.99, 7.01],
    bus: 'enemies'
  },
  {
    cueId: 'opening.exterior.werewolf_through_shell',
    fileCount: 2,
    channels: 1,
    duration: [6.99, 7.01],
    firstSignalMaxMs: 80,
    bus: 'enemies'
  },
  {
    cueId: 'world.storm.thunder',
    fileCount: 2,
    channels: 1,
    duration: [7.19, 7.21],
    bus: 'ambience'
  },
  {
    cueId: 'opening.exterior.thunder_through_shell',
    fileCount: 2,
    channels: 1,
    duration: [7.19, 7.21],
    bus: 'ambience'
  },
  {
    cueId: 'player.heartbeat',
    fileCount: 1,
    channels: 1,
    duration: [8.22, 8.24],
    bus: 'player',
    loop: true
  },
  {
    cueId: 'world.mama_wyvern.distant_roar',
    fileCount: 1,
    channels: 1,
    duration: [5.0, 5.4],
    firstSignalMaxMs: 50,
    bus: 'enemies'
  },
  {
    cueId: 'world.mama_wyvern.flyover_roar',
    fileCount: 1,
    channels: 1,
    duration: [3.0, 3.1],
    bus: 'enemies'
  },
  {
    cueId: 'world.mama_wyvern.napalm_projection',
    fileCount: 1,
    channels: 1,
    duration: [2.2, 2.3],
    firstSignalMaxMs: 100,
    bus: 'combat'
  },
  {
    cueId: 'world.mama_wyvern.inferno_aftermath',
    fileCount: 1,
    channels: 2,
    duration: [17.9, 18.1],
    bus: 'ambience'
  }
];

for (const target of targets) {
  const cue = getSoundCue(target.cueId);
  equal(cue.source, 'file', `${target.cueId} should use decoded file playback`);
  equal(cue.required, true, `${target.cueId} should fail visibly when its production asset is unavailable`);
  equal(cue.procedural, null, `${target.cueId} should use only its authored production file`);
  if (target.bus) equal(cue.bus, target.bus, `${target.cueId} should route through its visible pause-menu mix category`);
  if (target.loop) equal(cue.loop, true, `${target.cueId} should retain its single-voice loop contract`);
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
    assert(runtime.firstSignalMs < (target.firstSignalMaxMs ?? 20), `${runtimeFile} should start within its authored attack envelope`);

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
equal(analysis.assets.length, 3, 'legacy generator analysis should cover its remaining flesh-impact and Mama-roar assets');
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

const heartbeatSourceRoot = join(root, 'assets', 'audio', 'sources', 'player_heartbeat_v1');
const heartbeatLicence = readFileSync(join(heartbeatSourceRoot, 'SOURCE_AND_LICENSE.md'), 'utf8');
assert(heartbeatLicence.includes('Pixabay'), 'heartbeat source notes should identify Pixabay');
assert(heartbeatLicence.includes('Pixabay Content License'), 'heartbeat source notes should retain the licence');
assert(existsSync(join(root, 'assets', 'audio', 'projects', 'player_heartbeat_v1.aup3')), 'editable Audacity heartbeat project should exist');
assert(existsSync(join(heartbeatSourceRoot, 'originals')), 'unaltered heartbeat source directory should be retained');
assert(existsSync(join(heartbeatSourceRoot, 'processed_stems')), 'heartbeat processed stems should be retained');

const raiderSourceRoot = join(root, 'assets', 'audio', 'sources', 'raider_warning_v1');
const raiderLicence = readFileSync(join(raiderSourceRoot, 'SOURCE_AND_LICENSE.md'), 'utf8');
assert(raiderLicence.includes('Pixabay'), 'raider warning source notes should identify Pixabay');
assert(raiderLicence.includes('Pixabay Content License'), 'raider warning source notes should retain the licence');
assert(existsSync(join(raiderSourceRoot, 'audacity_session', 'raider_warning_v1.lof')), 'portable Audacity raider-warning session should exist');
assert(existsSync(join(raiderSourceRoot, 'originals')), 'unaltered raider vocal sources should be retained');
assert(existsSync(join(raiderSourceRoot, 'processed_stems')), 'raider warning processed stems should be retained');

const biteSourceRoot = join(root, 'assets', 'audio', 'sources', 'player_bite_v2');
const biteLicence = readFileSync(join(biteSourceRoot, 'SOURCE_AND_LICENSE.md'), 'utf8');
assert(biteLicence.includes('Pixabay'), 'player bite source notes should identify Pixabay');
assert(biteLicence.includes('Pixabay Content License'), 'player bite source notes should retain the licence');
equal(
  [...readFileSync(join(biteSourceRoot, 'audacity_session', 'player_bite_v2.lof'), 'utf8').matchAll(/^file /gm)].length,
  12,
  'portable Audacity bite session should open nine aligned stems and three reference mixes'
);
equal(
  readdirSync(join(biteSourceRoot, 'originals')).length,
  3,
  'all three unaltered bite source recordings should be retained'
);
equal(
  readdirSync(join(biteSourceRoot, 'processed_stems')).filter((name) => name.endsWith('.wav')).length,
  9,
  'three aligned production layers should be retained for each bite variant'
);

const biteAnalysis = JSON.parse(readFileSync(join(biteSourceRoot, 'PRODUCTION_ANALYSIS.json'), 'utf8'));
equal(biteAnalysis.contract, 'black-sky-bound.player-bite-production.v2', 'bite analysis should identify its production contract');
equal(biteAnalysis.syntheticLayersInProductionAssets, 0, 'the replacement bite palette should contain no generated sound layers');
equal(biteAnalysis.sources.length, 3, 'bite provenance should cover every retained real recording');
equal(biteAnalysis.variants.length, 3, 'bite analysis should cover all three production variants');
equal(
  readdirSync(join(biteSourceRoot, 'legacy_procedural')).filter((name) => name.endsWith('.wav')).length,
  2,
  'the two rejected procedural bite files should remain available for honest before/after comparison'
);
assert(
  biteAnalysis.sources.every((source) => source.provider === 'Pixabay' && source.license === 'Pixabay Content License'),
  'every bite source should retain provider and licence metadata'
);
assert(
  biteAnalysis.variants.every((variant) => variant.contactSeconds >= 0.18 && variant.contactSeconds <= 0.215),
  'every bite jaw closure should remain aligned with animation contact'
);
equal(new Set(biteAnalysis.variants.map((variant) => variant.runtimeFile)).size, 3, 'each bite variant should own a distinct runtime file');
equal(new Set(biteAnalysis.variants.map((variant) => variant.runtimeSha256)).size, 3, 'every bite variation should contain materially distinct audio');

const openingExteriorRoot = join(root, 'assets', 'audio', 'sources', 'opening_exterior_v1');
const openingExteriorLicence = readFileSync(join(openingExteriorRoot, 'SOURCE_AND_LICENSE.md'), 'utf8');
assert(openingExteriorLicence.includes('Pixabay Content License'), 'opening exterior source notes should retain the provider licence');
assert(openingExteriorLicence.includes('normal assets remain reusable after opening'), 'source notes should preserve the normal-gameplay versus shell-derivative boundary');
equal(readdirSync(join(openingExteriorRoot, 'originals')).length, 5, 'all five newly downloaded source recordings should remain unchanged');
const openingExteriorSession = join(openingExteriorRoot, 'audacity_session', 'opening_exterior_v1.lof');
const openingExteriorSessionFiles = [...readFileSync(openingExteriorSession, 'utf8').matchAll(/^file "([^"]+)"/gm)].map((match) => match[1]);
equal(openingExteriorSessionFiles.length, 48, 'portable Audacity session should open two aligned stems and one master for every production asset');
assert(openingExteriorSessionFiles.every((file) => existsSync(join(dirname(openingExteriorSession), file))), 'every portable Audacity session reference should resolve from the retained session directory');
const openingExteriorAnalysis = JSON.parse(readFileSync(join(openingExteriorRoot, 'PRODUCTION_ANALYSIS.json'), 'utf8'));
equal(openingExteriorAnalysis.contract, 'black-sky-bound.opening-exterior-production.v1', 'opening exterior analysis should identify its production contract');
equal(openingExteriorAnalysis.syntheticLayersInProductionAssets, 0, 'opening exterior production assets should contain no generated replacement layers');
equal(openingExteriorAnalysis.sources.length, 6, 'opening exterior provenance should cover five new sources and the reused retained raider recording');
equal(openingExteriorAnalysis.assets.length, 16, 'four families should expose two normal and two through-shell assets each');
assert(openingExteriorAnalysis.sources.every((source) => source.provider === 'Pixabay' && source.license === 'Pixabay Content License'), 'every opening exterior source should retain provider and licence metadata');
const openingExteriorById = new Map(openingExteriorAnalysis.assets.map((asset) => [asset.id, asset]));
for (const shellAsset of openingExteriorAnalysis.assets.filter((asset) => asset.perspective === 'opening_through_shell')) {
  const normalAsset = openingExteriorById.get(shellAsset.normalAssetId);
  assert(normalAsset?.perspective === 'normal_full_range', `${shellAsset.id} should derive from a retained normal full-range asset`);
  assert(shellAsset.highFrequencyEnergyRatioAbove3k < normalAsset.highFrequencyEnergyRatioAbove3k, `${shellAsset.id} should lose high-frequency air through the authored shell wall`);
  assert(shellAsset.sideRmsDbfs < normalAsset.sideRmsDbfs - 6, `${shellAsset.id} should collapse stereo width before the live opening muffle bus`);
}

const legacyGeneratorSource = readFileSync(join(root, 'tools', 'audio', 'generate_production_sfx.py'), 'utf8');
const biteGeneratorSource = readFileSync(join(root, 'tools', 'audio', 'generate_player_bite_v2.py'), 'utf8');
const openingExteriorGeneratorSource = readFileSync(join(root, 'tools', 'audio', 'generate_opening_exterior_v1.py'), 'utf8');
assert(!legacyGeneratorSource.includes('make_bite'), 'legacy procedural generator must not retain a callable bite renderer');
assert(!legacyGeneratorSource.includes('player_bite_snap'), 'legacy procedural generator must not overwrite source-based bite assets');
assert(biteGeneratorSource.includes('player_bite_snap'), 'the source-based bite generator should own the production files');
assert(openingExteriorGeneratorSource.includes('opening_through_shell'), 'the source-based opening exterior generator should own its normal/shell asset pairs');
assert(!readFileSync(join(root, 'src', 'audio', 'proceduralOneShots.js'), 'utf8').match(/thunderRoll|creatureHowl|huskGargle|distantShout/), 'removed opening placeholders should have no callable procedural implementation');

const directorSource = readFileSync(join(root, 'src', 'audio', 'audioDirector.js'), 'utf8');
const fileVoiceSource = readFileSync(join(root, 'src', 'audio', 'audioFileVoice.js'), 'utf8');
const buildSource = readFileSync(join(root, 'tools', 'buildPlaytest.mjs'), 'utf8');
assert(directorSource.includes("cue.source === 'file'"), 'AudioDirector should route file cues through the buffer path');
assert(fileVoiceSource.includes('source.loop = loop'), 'decoded file playback should loop production buffers for file-backed body cues');
assert(directorSource.includes('recordPlaybackError'), 'required file playback failures should be explicit in runtime diagnostics');
assert(!directorSource.includes('file_fallback_to_placeholder'), 'production file cues must not silently fall back to synthesis');
assert(buildSource.includes('collectSoundAssetFiles(SOUND_CUES)'), 'packaged playtests should use canonical direct-plus-environment asset enumeration');
assert(buildSource.includes('playtest_export_audio_scope_invalid'), 'packaged playtests should fail loudly when copied audio diverges from the manifest');
assert(!buildSource.includes("'enemy_hit_flesh_01.wav',"), 'packaged playtests should not retain a hand-maintained audio allowlist');

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
