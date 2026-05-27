import { RESOURCE_IDS, describeResourceCost, normaliseResourceCost } from './economy.js';
import { getStructureDefinition, listStructureDefinitions } from './structureRegistry.js';

const STRUCTURE_BUILD_GLYPHS = Object.freeze({
  outpost: 'OP',
  watchtower: 'WT',
  hunting_tent: 'FD',
  wood_gathering_post: 'WD',
  builder_lodge: 'BL',
  storage_tent: 'ST',
  wall_segment: 'WL',
  gate: 'GT',
  trench_segment: 'TR',
  fort: 'FT'
});

export const BUILDING_OPTIONS = Object.freeze(listStructureDefinitions().map((definition) => {
  const resourceCost = normaliseResourceCost(definition.construction?.resourceCost ?? { supplies: definition.construction?.supplyCost ?? 0 });
  return Object.freeze({
    type: 'building',
    id: definition.id,
    glyph: STRUCTURE_BUILD_GLYPHS[definition.id] ?? 'ST',
    label: definition.label,
    cost: definition.construction?.supplyCost ?? 0,
    resourceCost,
    costLabel: describeResourceCost(resourceCost)
  });
}));

export const UNIT_OPTIONS = Object.freeze([
  createUnitOption({ id: 'builder', glyph: 'BLD', label: 'Builder', cost: 18, resourceCost: { [RESOURCE_IDS.gold]: 12, [RESOURCE_IDS.food]: 6, [RESOURCE_IDS.population]: 1 } }),
  createUnitOption({ id: 'warrior', glyph: 'WAR', label: 'Warrior', cost: 27, resourceCost: { [RESOURCE_IDS.gold]: 15, [RESOURCE_IDS.food]: 8, [RESOURCE_IDS.wood]: 4, [RESOURCE_IDS.population]: 1 } }),
  createUnitOption({ id: 'infantry', glyph: 'INF', label: 'Infantry', cost: 85, resourceCost: { [RESOURCE_IDS.gold]: 55, [RESOURCE_IDS.food]: 18, [RESOURCE_IDS.wood]: 12, [RESOURCE_IDS.population]: 4 } }),
  createUnitOption({ id: 'recon', glyph: 'REC', label: 'Scout', cost: 52, resourceCost: { [RESOURCE_IDS.gold]: 35, [RESOURCE_IDS.food]: 12, [RESOURCE_IDS.wood]: 4, [RESOURCE_IDS.population]: 1 } }),
  createUnitOption({ id: 'artillery', glyph: 'ART', label: 'Artillery', cost: 158, resourceCost: { [RESOURCE_IDS.gold]: 90, [RESOURCE_IDS.food]: 20, [RESOURCE_IDS.wood]: 45, [RESOURCE_IDS.population]: 3 } }),
  createUnitOption({ id: 'command', glyph: 'CMD', label: 'Commander', cost: 170, resourceCost: { [RESOURCE_IDS.gold]: 120, [RESOURCE_IDS.food]: 25, [RESOURCE_IDS.wood]: 20, [RESOURCE_IDS.population]: 5 } })
]);

function createUnitOption({ id, glyph, label, cost, resourceCost }) {
  const normalisedCost = normaliseResourceCost(resourceCost ?? { supplies: cost });
  return Object.freeze({
    type: 'unit',
    id,
    glyph,
    label,
    cost,
    resourceCost: normalisedCost,
    costLabel: describeResourceCost(normalisedCost)
  });
}

export function getBuildOption(type, id) {
  if (type === 'building' && !getStructureDefinition(id)) {
    return null;
  }
  const options = type === 'unit' ? UNIT_OPTIONS : BUILDING_OPTIONS;
  return options.find((option) => option.id === id) ?? null;
}
