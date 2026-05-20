import { getStructureDefinition, listStructureDefinitions } from './structureRegistry.js';

const STRUCTURE_BUILD_GLYPHS = Object.freeze({
  outpost: 'OP',
  watchtower: 'WT',
  wall_segment: 'WL',
  gate: 'GT',
  trench_segment: 'TR',
  fort: 'FT'
});

export const BUILDING_OPTIONS = Object.freeze(listStructureDefinitions().map((definition) => Object.freeze({
  type: 'building',
  id: definition.id,
  glyph: STRUCTURE_BUILD_GLYPHS[definition.id] ?? 'ST',
  label: definition.label,
  cost: definition.construction?.supplyCost ?? 0
})));

export const UNIT_OPTIONS = Object.freeze([
  Object.freeze({ type: 'unit', id: 'infantry', glyph: 'INF', label: 'Infantry', cost: 50 }),
  Object.freeze({ type: 'unit', id: 'recon', glyph: 'REC', label: 'Recon', cost: 45 }),
  Object.freeze({ type: 'unit', id: 'artillery', glyph: 'ART', label: 'Artillery', cost: 90 }),
  Object.freeze({ type: 'unit', id: 'command', glyph: 'CMD', label: 'Command', cost: 110 })
]);

export function getBuildOption(type, id) {
  if (type === 'building' && !getStructureDefinition(id)) {
    return null;
  }
  const options = type === 'unit' ? UNIT_OPTIONS : BUILDING_OPTIONS;
  return options.find((option) => option.id === id) ?? null;
}
