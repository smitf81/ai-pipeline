import assert from 'node:assert/strict';
import {
  BSB_V2_FIRST_PLAYTHROUGH_CONTRACT,
  BSB_V2_INSTINCT_OPTIONS,
  buildBsbV2RuntimeMap,
  createDefaultBsbV2AuthoringDocument,
  createSecondApproachBsbV2AuthoringDocument,
  inspectBsbV2RuntimeBake,
  setBsbV2FirstPlaythroughInstinct,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';

assert.deepEqual(
  BSB_V2_INSTINCT_OPTIONS.map((entry) => entry.id),
  ['smoke_veil', 'smoke_stream', 'smouldering_spit', 'cinder_breath', 'napalm_spit'],
  'Map Forge should expose the five GDD Breath Instinct identities in canonical order'
);

const firstRegion = createDefaultBsbV2AuthoringDocument();
assert.deepEqual(firstRegion.firstPlaythrough, {
  contract: BSB_V2_FIRST_PLAYTHROUGH_CONTRACT,
  availableInstinctIds: []
}, 'First Flightless Night must not grant Smoke before its completion awakening');

const ashRegion = createSecondApproachBsbV2AuthoringDocument();
assert.deepEqual(ashRegion.firstPlaythrough.availableInstinctIds, ['smoke_veil']);

const withLaterInstincts = setBsbV2FirstPlaythroughInstinct(
  setBsbV2FirstPlaythroughInstinct(ashRegion, 'napalm_spit', true),
  'smoke_stream',
  true
);
assert.deepEqual(
  withLaterInstincts.firstPlaythrough.availableInstinctIds,
  ['smoke_veil', 'smoke_stream', 'napalm_spit'],
  'checkbox edits should normalize back to canonical GDD order'
);
assert.equal(withLaterInstincts.revision, ashRegion.revision + 2);

const runtime = buildBsbV2RuntimeMap(withLaterInstincts);
assert.deepEqual(runtime.firstPlaythrough, withLaterInstincts.firstPlaythrough, 'the authored region baseline must survive its runtime bake');
assert.deepEqual(inspectBsbV2RuntimeBake(withLaterInstincts, runtime).mismatches, []);

const removedSmoke = setBsbV2FirstPlaythroughInstinct(withLaterInstincts, 'smoke_veil', false);
assert.deepEqual(removedSmoke.firstPlaythrough.availableInstinctIds, ['smoke_stream', 'napalm_spit']);
assert.throws(
  () => setBsbV2FirstPlaythroughInstinct(removedSmoke, 'unwritten_instinct', true),
  /bsb_first_playthrough_instinct_unknown/
);
assert.throws(
  () => validateBsbV2AuthoringDocument({
    ...removedSmoke,
    firstPlaythrough: {
      contract: BSB_V2_FIRST_PLAYTHROUGH_CONTRACT,
      availableInstinctIds: ['unwritten_instinct']
    }
  }),
  /bsb_first_playthrough_instinct_unknown/
);

console.log(JSON.stringify({
  ok: true,
  contract: BSB_V2_FIRST_PLAYTHROUGH_CONTRACT,
  instinctCount: BSB_V2_INSTINCT_OPTIONS.length,
  ashBaseline: ashRegion.firstPlaythrough.availableInstinctIds,
  bakedAvailability: runtime.firstPlaythrough.availableInstinctIds
}, null, 2));
