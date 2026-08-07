import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, equal } from './assert.mjs';
import {
  createEmptyAudioTuning,
  getOpeningAudioTuningFields,
  listAudioTuningOverridePaths,
  normalizeAudioTuning,
  resolveAudioTuning,
  setAudioTuningValue
} from '../src/data/audio/audioTuning.js';
import { resolveOpeningMix } from '../src/audio/audioStateMath.js';
import { readAudioTuningFile, writeAudioTuningFile } from '../tools/tuningApi.mjs';

let tuning = createEmptyAudioTuning();
equal(getOpeningAudioTuningFields().length, 5, 'opening audio provider should expose only the five real runtime controls');

const unknown = setAudioTuningValue(tuning, 'openingPerspective.fakeDistance', 2);
equal(unknown.ok, false, 'unknown audio tuning paths should fail before persistence');

const cutoff = setAudioTuningValue(tuning, 'openingPerspective.sealedCutoffHz', 10);
assert(cutoff.ok, 'sealed shell cutoff should be editable');
equal(cutoff.value, 240, 'sealed shell cutoff should clamp to its manifest minimum');
tuning = cutoff.tuning;

const gain = setAudioTuningValue(tuning, 'openingPerspective.sealedExteriorGain', 0.31);
assert(gain.ok, 'sealed exterior gain should be editable');
tuning = gain.tuning;
equal(listAudioTuningOverridePaths(tuning).join(','), 'openingPerspective.sealedCutoffHz,openingPerspective.sealedExteriorGain', 'audio override paths should be inspectable');

const resolved = resolveAudioTuning(tuning);
equal(resolved.openingPerspective.sealedCutoffHz, 240, 'resolved runtime tuning should consume the override');
equal(resolved.openingPerspective.listenerRelativeAttenuation, false, 'opening perspective must not claim listener-relative 3D attenuation');

const sealed = resolveOpeningMix({ released: false, openingProgress: 0, emergenceProgress: 0, settleProgress: 0 }, resolved);
equal(sealed.cutoffHz, 240, 'fully sealed opening mix should use the authored shell cutoff');
equal(Number(sealed.exteriorGain.toFixed(2)), 0.31, 'fully sealed opening mix should use the authored exterior level');
const exposed = resolveOpeningMix({ released: false, openingProgress: 1, emergenceProgress: 1, settleProgress: 1 }, resolved);
equal(exposed.cutoffHz, resolved.bodyState.muffle.maxCutoffHz, 'full exposure should restore the open-air cutoff');
equal(exposed.exteriorGain, 1, 'full exposure should restore full exterior level');

const invalid = normalizeAudioTuning({ openingPerspective: { inventedRolloff: 3 } }, { rejectUnknown: true });
equal(invalid.ok, false, 'persisted audio tuning should reject invented controls');

const tempRoot = await mkdtemp(join(tmpdir(), 'bsb-audio-tuning-'));
try {
  const saved = await writeAudioTuningFile(tempRoot, tuning);
  equal(saved.openingPerspective.sealedExteriorGain, 0.31, 'audio tuning writer should persist normalized values');
  const raw = await readFile(join(tempRoot, 'tuning', 'audio-overrides.json'), 'utf8');
  assert(raw.includes('sealedExteriorGain'), 'audio override JSON should contain the saved field');
  const loaded = await readAudioTuningFile(tempRoot);
  equal(loaded.openingPerspective.sealedCutoffHz, 240, 'audio tuning reader should reload persisted values');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
