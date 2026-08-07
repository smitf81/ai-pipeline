export const BSB_V2_UNDERGROWTH_DNA_CONTRACT = 'axiom.undergrowth-dna.v1';
export const BSB_V2_UNDERGROWTH_RECIPE_CONTRACT = 'axiom.undergrowth-species-recipe.v1';
export const BSB_V2_UNDERGROWTH_OPERATION_CONTRACT = 'axiom.undergrowth-operation.v1';

export const BSB_V2_UNDERGROWTH_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

export const BSB_V2_UNDERGROWTH_SPECIES_RECIPES = Object.freeze({
  wood_fern: recipe({
    id: 'wood_fern', label: 'Wood Fern', form: 'radial_fronds', defaultType: 'fern_patch',
    ageYears: 5, matureYears: 4, heightMeters: [0.38, 0.62], spreadMeters: [1.2, 1.7],
    density: 0.72, stemCount: [8, 12], leafSize: 0.16, curl: 0.28, lean: 0.18,
    irregularity: 0.24, groundCover: 0.34, burn: 0, char: 0,
    stemColour: '#36513a', leafColour: '#2f6339'
  }),
  forest_shrub: recipe({
    id: 'forest_shrub', label: 'Forest Shrub', form: 'branching_shrub', defaultType: 'forest_shrub',
    ageYears: 12, matureYears: 8, heightMeters: [0.62, 1.05], spreadMeters: [1.3, 2],
    density: 0.8, stemCount: [6, 10], leafSize: 0.21, curl: 0.12, lean: 0.16,
    irregularity: 0.34, groundCover: 0.48, burn: 0, char: 0,
    stemColour: '#3f452b', leafColour: '#3f6b39'
  }),
  ember_bramble: recipe({
    id: 'ember_bramble', label: 'Ember Bramble', form: 'sprawling_bramble', defaultType: 'smouldering_bramble',
    ageYears: 9, matureYears: 7, heightMeters: [0.46, 0.78], spreadMeters: [1.5, 2.25],
    density: 0.64, stemCount: [7, 11], leafSize: 0.13, curl: 0.42, lean: 0.3,
    irregularity: 0.48, groundCover: 0.62, burn: 0.74, char: 0.5,
    stemColour: '#47372b', leafColour: '#344331'
  })
});

export const BSB_V2_UNDERGROWTH_SPECIES_OPTIONS = Object.freeze(
  Object.values(BSB_V2_UNDERGROWTH_SPECIES_RECIPES).map((entry) => Object.freeze([entry.id, entry.label]))
);

const NUMBER_FIELDS = Object.freeze({
  ageYears: Object.freeze({ min: 0.2, max: 120, decimals: 1 }),
  health: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  heightMeters: Object.freeze({ min: 0.08, max: 3, decimals: 3 }),
  spreadMeters: Object.freeze({ min: 0.2, max: 5, decimals: 3 }),
  density: Object.freeze({ min: 0.05, max: 1, decimals: 3 }),
  stemCount: Object.freeze({ min: 2, max: 28, integer: true }),
  leafSize: Object.freeze({ min: 0.04, max: 0.5, decimals: 3 }),
  curl: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  lean: Object.freeze({ min: 0, max: 0.8, decimals: 3 }),
  irregularity: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  groundCover: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  burn: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  char: Object.freeze({ min: 0, max: 1, decimals: 3 })
});

const UNDERGROWTH_TYPES = new Set(['fern_patch', 'forest_shrub', 'smouldering_fern', 'smouldering_bramble']);

export function isBsbV2UndergrowthRecord(record) {
  return UNDERGROWTH_TYPES.has(record?.type) || record?.undergrowth?.contract === BSB_V2_UNDERGROWTH_DNA_CONTRACT;
}

export function deriveBsbV2UndergrowthSeed(source = {}) {
  const text = `${source.id ?? 'undergrowth'}:${source.x ?? 0}:${source.y ?? 0}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

export function createBsbV2UndergrowthDefinition(source = {}, context = {}) {
  const species = normalizeSpecies(source.species ?? speciesForType(context.type));
  const recipeValue = BSB_V2_UNDERGROWTH_SPECIES_RECIPES[species];
  const seed = normalizeSeed(source.seed ?? deriveBsbV2UndergrowthSeed(context));
  const random = seededRandom(seed);
  const ageYears = normalizeNumber(source.ageYears ?? recipeValue.ageYears, NUMBER_FIELDS.ageYears);
  const maturity = clamp(ageYears / recipeValue.matureYears, 0.3, 1.35);
  const healthFallback = Number.isFinite(Number(context.materialState?.integrity)) ? Number(context.materialState.integrity) : 0.94;
  const burnFallback = context.type === 'smouldering_fern' ? 0.68
    : context.type === 'smouldering_bramble' ? 0.74
      : recipeValue.burn;
  return Object.freeze({
    contract: BSB_V2_UNDERGROWTH_DNA_CONTRACT,
    recipe: BSB_V2_UNDERGROWTH_RECIPE_CONTRACT,
    seed,
    species,
    ageYears,
    health: normalizeNumber(source.health ?? healthFallback, NUMBER_FIELDS.health),
    season: normalizeSeason(source.season ?? 'summer'),
    heightMeters: normalizeNumber(source.heightMeters ?? sampleRange(recipeValue.heightMeters, random) * (0.62 + Math.min(1, maturity) * 0.38), NUMBER_FIELDS.heightMeters),
    spreadMeters: normalizeNumber(source.spreadMeters ?? sampleRange(recipeValue.spreadMeters, random) * (0.72 + Math.min(1.2, maturity) * 0.28), NUMBER_FIELDS.spreadMeters),
    density: normalizeNumber(source.density ?? context.materialState?.density ?? recipeValue.density + jitter(random, 0.09), NUMBER_FIELDS.density),
    stemCount: normalizeNumber(source.stemCount ?? sampleInteger(recipeValue.stemCount, random), NUMBER_FIELDS.stemCount),
    leafSize: normalizeNumber(source.leafSize ?? recipeValue.leafSize + jitter(random, 0.025), NUMBER_FIELDS.leafSize),
    curl: normalizeNumber(source.curl ?? recipeValue.curl + jitter(random, 0.08), NUMBER_FIELDS.curl),
    lean: normalizeNumber(source.lean ?? recipeValue.lean + jitter(random, 0.06), NUMBER_FIELDS.lean),
    irregularity: normalizeNumber(source.irregularity ?? recipeValue.irregularity + jitter(random, 0.1), NUMBER_FIELDS.irregularity),
    groundCover: normalizeNumber(source.groundCover ?? recipeValue.groundCover + jitter(random, 0.08), NUMBER_FIELDS.groundCover),
    burn: normalizeNumber(source.burn ?? burnFallback, NUMBER_FIELDS.burn),
    char: normalizeNumber(source.char ?? Math.max(recipeValue.char, burnFallback * 0.68), NUMBER_FIELDS.char),
    stemColour: normalizeColour(source.stemColour, recipeValue.stemColour),
    leafColour: normalizeColour(source.leafColour, recipeValue.leafColour)
  });
}

export function normalizeBsbV2UndergrowthRecord(record = {}) {
  if (!isBsbV2UndergrowthRecord(record)) return { ...record };
  return {
    ...record,
    undergrowth: createBsbV2UndergrowthDefinition(record.undergrowth ?? {}, record)
  };
}

export function applyBsbV2UndergrowthOperation(record, operation = {}) {
  if (!isBsbV2UndergrowthRecord(record)) throw new Error(`bsb_undergrowth_record_required:${record?.id ?? 'missing'}`);
  const op = operationName(operation);
  const current = createBsbV2UndergrowthDefinition(record.undergrowth ?? {}, record);
  let nextInput = { ...current };
  let nextType = record.type;

  if (op === 'set_species') {
    const species = normalizeSpecies(operation.species ?? operation.value);
    nextInput = { seed: current.seed, species, ageYears: current.ageYears, health: current.health, season: current.season };
    nextType = BSB_V2_UNDERGROWTH_SPECIES_RECIPES[species].defaultType;
  } else if (op === 'set_height') {
    nextInput.heightMeters = operation.heightMeters ?? operation.value;
  } else if (op === 'set_spread') {
    nextInput.spreadMeters = operation.spreadMeters ?? operation.value;
  } else if (op === 'set_density') {
    nextInput.density = operation.density ?? operation.value;
  } else if (op === 'randomise' || op === 'randomize') {
    nextInput = { seed: normalizeSeed(operation.seed ?? nextSeed(current.seed)), species: current.species, ageYears: current.ageYears, health: current.health, season: current.season, burn: current.burn };
  } else if (op === 'age') {
    nextInput = { ...current, ageYears: current.ageYears + Number(operation.years ?? operation.amount ?? 1) };
  } else if (op === 'damage') {
    nextInput.health = current.health - Math.abs(Number(operation.amount ?? 0.2));
    nextInput.density = current.density * (0.68 + Math.max(0, nextInput.health) * 0.32);
    nextInput.irregularity = current.irregularity + 0.1;
  } else if (op === 'regrow') {
    const recipeValue = BSB_V2_UNDERGROWTH_SPECIES_RECIPES[current.species];
    nextInput.health = current.health + Math.abs(Number(operation.amount ?? 0.24));
    nextInput.density = current.density + (recipeValue.density - current.density) * 0.6;
    nextInput.groundCover = current.groundCover + 0.08;
  } else if (op === 'make_wild') {
    nextInput = { ...current, ageYears: current.ageYears + Math.abs(Number(operation.years ?? 4)), spreadMeters: current.spreadMeters + 0.32, density: current.density + 0.16, irregularity: current.irregularity + 0.16, groundCover: current.groundCover + 0.2 };
  } else if (op === 'patch') {
    nextInput = applyPatch(nextInput, operation.patch ?? operation.values ?? {});
    if (Object.hasOwn(operation.patch ?? operation.values ?? {}, 'species')) {
      nextType = BSB_V2_UNDERGROWTH_SPECIES_RECIPES[normalizeSpecies(nextInput.species)].defaultType;
    }
  } else {
    throw new Error(`bsb_undergrowth_operation_unknown:${op}`);
  }

  return normalizeBsbV2UndergrowthRecord({
    ...record,
    type: nextType,
    undergrowth: createBsbV2UndergrowthDefinition(nextInput, { ...record, type: nextType })
  });
}

export function undergrowthDefinitionSummary(definition) {
  const value = createBsbV2UndergrowthDefinition(definition, { id: 'undergrowth-summary', type: 'fern_patch' });
  return `${BSB_V2_UNDERGROWTH_SPECIES_RECIPES[value.species].label} · ${Math.round(value.ageYears)}y · ${Math.round(value.health * 100)}% · seed ${value.seed}`;
}

function applyPatch(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('bsb_undergrowth_patch_invalid');
  const next = { ...current };
  for (const field of Object.keys(NUMBER_FIELDS)) if (Object.hasOwn(patch, field)) next[field] = patch[field];
  for (const field of ['species', 'season', 'seed', 'stemColour', 'leafColour']) if (Object.hasOwn(patch, field)) next[field] = patch[field];
  return next;
}

function recipe(source) { return Object.freeze({ contract: BSB_V2_UNDERGROWTH_RECIPE_CONTRACT, ...source }); }
function operationName(operation) {
  const op = String(operation.op ?? operation.operation ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!op) throw new Error('bsb_undergrowth_operation_missing');
  return op;
}
function speciesForType(type) {
  if (type === 'forest_shrub') return 'forest_shrub';
  if (type === 'smouldering_bramble') return 'ember_bramble';
  return 'wood_fern';
}
function normalizeSpecies(value) {
  const species = String(value ?? '').trim().toLowerCase();
  if (!Object.hasOwn(BSB_V2_UNDERGROWTH_SPECIES_RECIPES, species)) throw new Error(`bsb_undergrowth_species_invalid:${species || 'missing'}`);
  return species;
}
function normalizeSeason(value) {
  const season = String(value ?? '').trim().toLowerCase();
  if (!BSB_V2_UNDERGROWTH_SEASONS.includes(season)) throw new Error(`bsb_undergrowth_season_invalid:${season || 'missing'}`);
  return season;
}
function normalizeSeed(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) throw new Error(`bsb_undergrowth_seed_invalid:${value}`);
  return seed;
}
function normalizeNumber(value, spec) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`bsb_undergrowth_number_invalid:${value}`);
  const clamped = clamp(numeric, spec.min, spec.max);
  if (spec.integer) return Math.round(clamped);
  const scale = 10 ** (spec.decimals ?? 3);
  return Math.round(clamped * scale) / scale;
}
function normalizeColour(value, fallback) {
  const colour = String(value ?? fallback).trim();
  if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new Error(`bsb_undergrowth_colour_invalid:${colour || 'missing'}`);
  return colour.toLowerCase();
}
function sampleRange(range, random) { return range[0] + (range[1] - range[0]) * random(); }
function sampleInteger(range, random) { return Math.round(sampleRange(range, random)); }
function jitter(random, amount) { return (random() - 0.5) * amount * 2; }
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}
function nextSeed(seed) { return (Math.imul(seed, 1664525) + 1013904223 >>> 0) % 2147483646 + 1; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
