import { AbilityId } from '../constants/abilityIds.js';
import { InstinctId } from '../constants/instinctIds.js';

export const FIRST_PLAYTHROUGH_REGION_CONTRACT = 'black-sky-bound.first-playthrough-region.v1';

const STONE_ASSET_URLS = Object.freeze({
  [InstinctId.SMOKE_VEIL]: new URL('../../assets/ui/instincts/smoke-veil-stone.png', import.meta.url).href,
  [InstinctId.SMOKE_STREAM]: new URL('../../assets/ui/instincts/smoke-stream-stone.png', import.meta.url).href,
  [InstinctId.SMOULDERING_SPIT]: new URL('../../assets/ui/instincts/smouldering-spit-stone.png', import.meta.url).href,
  [InstinctId.CINDER_BREATH]: new URL('../../assets/ui/instincts/cinder-breath-stone.png', import.meta.url).href,
  [InstinctId.NAPALM_SPIT]: new URL('../../assets/ui/instincts/napalm-spit-stone.png', import.meta.url).href
});

export const INSTINCTS = Object.freeze([
  instinct({
    id: InstinctId.SMOKE_VEIL,
    displayName: 'SMOKE VEIL',
    inputSummary: 'TAP RMB',
    nature: 'Defensive radial smoke burst',
    description: 'Cast smoke around the body to break pressure and slow nearby threats.',
    abilityIds: [AbilityId.SMOKE_BURST],
    unlockEventId: 'instinct_smoke_awakened',
    arrivalSequenceId: 'smoke_instinct_awakening',
    stoneAssetUrl: STONE_ASSET_URLS[InstinctId.SMOKE_VEIL]
  }),
  instinct({
    id: InstinctId.SMOKE_STREAM,
    displayName: 'SMOKE STREAM',
    inputSummary: 'HOLD RMB',
    nature: 'Controlled directional smoke',
    description: 'Hold and shape smoke into a forward stream instead of a surrounding veil.',
    abilityIds: [AbilityId.SMOKE_SPIT],
    stoneAssetUrl: STONE_ASSET_URLS[InstinctId.SMOKE_STREAM]
  }),
  instinct({
    id: InstinctId.SMOULDERING_SPIT,
    displayName: 'SMOULDERING SPIT',
    inputSummary: 'HOLD RMB · TAP LMB',
    nature: 'Compressed smoking glob',
    description: 'Compress the breath into a thrown glob that smoulders where it lands.',
    abilityIds: [],
    stoneAssetUrl: STONE_ASSET_URLS[InstinctId.SMOULDERING_SPIT]
  }),
  instinct({
    id: InstinctId.CINDER_BREATH,
    displayName: 'CINDER BREATH',
    inputSummary: 'HEAT LEARNED',
    nature: 'Hot ash and ignition',
    description: 'Kindle smoke into scorching cinder breath as the hatchling learns heat.',
    abilityIds: [AbilityId.DRAGONFIRE],
    stoneAssetUrl: STONE_ASSET_URLS[InstinctId.CINDER_BREATH]
  }),
  instinct({
    id: InstinctId.NAPALM_SPIT,
    displayName: 'NAPALM SPIT',
    inputSummary: 'HOLD RMB + LMB · RELEASE',
    nature: 'Charged sticky fire glob',
    description: 'Charge and release a heavy burning glob that clings to its target area.',
    abilityIds: [],
    stoneAssetUrl: STONE_ASSET_URLS[InstinctId.NAPALM_SPIT]
  })
]);

const INSTINCT_BY_ID = new Map(INSTINCTS.map((entry) => [entry.id, entry]));

export function getInstinctDefinition(id) {
  return INSTINCT_BY_ID.get(id) ?? null;
}

export function getInstinctIdsForAbility(abilityId) {
  return INSTINCTS.filter((entry) => entry.abilityIds.includes(abilityId)).map((entry) => entry.id);
}

export function getInstinctIdsForArrivalSequence(arrivalSequenceId) {
  return INSTINCTS.filter((entry) => entry.arrivalSequenceId === arrivalSequenceId).map((entry) => entry.id);
}

function instinct(source) {
  return Object.freeze({ ...source, abilityIds: Object.freeze([...source.abilityIds]) });
}
