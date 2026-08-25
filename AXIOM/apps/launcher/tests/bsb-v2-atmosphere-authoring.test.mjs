import assert from 'node:assert/strict';
import {
  BSB_V2_REGION_ATMOSPHERE_CONTRACT,
  buildBsbV2RuntimeMap,
  createBsbV2RegionDraft,
  inspectBsbV2RuntimeBake,
  setBsbV2RainAndSparksAtmosphere,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';

const region = createBsbV2RegionDraft({
  mapId: 'atmosphere_contract_proof',
  title: 'Atmosphere Contract Proof',
  scenarioId: 'first_escape'
});

assert.deepEqual(region.atmosphere, {
  contract: BSB_V2_REGION_ATMOSPHERE_CONTRACT,
  rainAndSparksEnabled: true
}, 'new regions should default rain and sparks on');

const legacy = validateBsbV2AuthoringDocument({ ...region, atmosphere: undefined });
assert.equal(legacy.atmosphere.rainAndSparksEnabled, true, 'legacy authoring documents should normalize to atmosphere enabled');

const disabled = setBsbV2RainAndSparksAtmosphere(region, false);
assert.equal(disabled.atmosphere.rainAndSparksEnabled, false, 'Map Forge should author a local clear-atmosphere override');
assert.equal(disabled.revision, region.revision + 1, 'atmosphere changes should increment the region revision once');

const baked = buildBsbV2RuntimeMap(disabled);
assert.deepEqual(baked.atmosphere, disabled.atmosphere, 'runtime bake should carry region atmosphere unchanged');
assert.equal(inspectBsbV2RuntimeBake(disabled, baked, { runtimeMapId: disabled.mapId }).status, 'current', 'bake inspection should include atmosphere parity');
assert.equal(
  inspectBsbV2RuntimeBake(region, baked, { runtimeMapId: region.mapId }).mismatches.includes('region_atmosphere_mismatch'),
  true,
  'bake inspection should detect atmosphere drift'
);

assert.throws(
  () => validateBsbV2AuthoringDocument({ ...region, atmosphere: { rainAndSparksEnabled: 'yes' } }),
  /bsb_region_atmosphere_enabled_invalid/,
  'ambiguous atmosphere values should be rejected'
);

console.log('BSB v2 region atmosphere authoring tests passed.');
