export const BSB_V2_TREE_DNA_CONTRACT = 'axiom.tree-dna.v1';
export const BSB_V2_TREE_RECIPE_CONTRACT = 'axiom.tree-species-recipe.v1';
export const BSB_V2_TREE_OPERATION_CONTRACT = 'axiom.tree-operation.v1';

export const BSB_V2_TREE_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

export const BSB_V2_TREE_SPECIES_RECIPES = Object.freeze({
  old_pine: recipe({
    id: 'old_pine', label: 'Old Pine', form: 'conifer', evergreen: true,
    ageYears: 72, matureYears: 55, heightMeters: [7.6, 10.4], trunkRadiusMeters: [0.46, 0.72],
    taper: 0.72, bend: 0.13, twist: 0.18, branchLevels: [5, 7], branchDensity: 0.74,
    leafDensity: 0.9, canopySpread: 0.86, crownStart: 0.25, rootScale: 1.02, moss: 0.28,
    barkColour: '#4a3020', leafColour: '#244d33'
  }),
  silver_birch: recipe({
    id: 'silver_birch', label: 'Silver Birch', form: 'airy_broadleaf', evergreen: false,
    ageYears: 38, matureYears: 34, heightMeters: [6.4, 8.8], trunkRadiusMeters: [0.24, 0.4],
    taper: 0.64, bend: 0.22, twist: 0.24, branchLevels: [4, 6], branchDensity: 0.62,
    leafDensity: 0.64, canopySpread: 0.7, crownStart: 0.34, rootScale: 0.76, moss: 0.14,
    barkColour: '#d7cfb7', leafColour: '#728b4d'
  }),
  ancient_oak: recipe({
    id: 'ancient_oak', label: 'Ancient Oak', form: 'broadleaf', evergreen: false,
    ageYears: 180, matureYears: 75, heightMeters: [7.2, 10.2], trunkRadiusMeters: [0.64, 0.98],
    taper: 0.84, bend: 0.34, twist: 0.31, branchLevels: [5, 7], branchDensity: 0.82,
    leafDensity: 0.78, canopySpread: 1.22, crownStart: 0.43, rootScale: 1.42, moss: 0.66,
    barkColour: '#563923', leafColour: '#315b36'
  })
});

export const BSB_V2_TREE_SPECIES_OPTIONS = Object.freeze(
  Object.values(BSB_V2_TREE_SPECIES_RECIPES).map((entry) => Object.freeze([entry.id, entry.label]))
);

const TREE_NUMBER_FIELDS = Object.freeze({
  ageYears: Object.freeze({ min: 1, max: 800, decimals: 1 }),
  health: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  heightMeters: Object.freeze({ min: 1.5, max: 30, decimals: 3 }),
  trunkRadiusMeters: Object.freeze({ min: 0.08, max: 2.4, decimals: 3 }),
  taper: Object.freeze({ min: 0.2, max: 0.96, decimals: 3 }),
  bend: Object.freeze({ min: 0, max: 0.85, decimals: 3 }),
  twist: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  branchLevels: Object.freeze({ min: 1, max: 9, integer: true }),
  branchDensity: Object.freeze({ min: 0.1, max: 1, decimals: 3 }),
  leafDensity: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  canopySpread: Object.freeze({ min: 0.25, max: 1.8, decimals: 3 }),
  crownStart: Object.freeze({ min: 0.12, max: 0.72, decimals: 3 }),
  rootScale: Object.freeze({ min: 0.2, max: 2.2, decimals: 3 }),
  moss: Object.freeze({ min: 0, max: 1, decimals: 3 })
});

export function isBsbV2TreeRecord(record) {
  return record?.type === 'tree' || record?.type === 'birch_tree' || record?.tree?.contract === BSB_V2_TREE_DNA_CONTRACT;
}

export function deriveBsbV2TreeSeed(source = {}) {
  const text = `${source.id ?? 'tree'}:${source.x ?? 0}:${source.y ?? 0}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

export function createBsbV2TreeDefinition(source = {}, context = {}) {
  const legacySpecies = context.type === 'birch_tree' ? 'silver_birch' : 'old_pine';
  const species = normalizeSpecies(source.species ?? legacySpecies);
  const recipeValue = BSB_V2_TREE_SPECIES_RECIPES[species];
  const seed = normalizeSeed(source.seed ?? deriveBsbV2TreeSeed(context));
  const random = seededRandom(seed);
  const ageYears = normalizeNumber(source.ageYears ?? recipeValue.ageYears, TREE_NUMBER_FIELDS.ageYears);
  const health = normalizeNumber(source.health ?? 0.94, TREE_NUMBER_FIELDS.health);
  const season = normalizeSeason(source.season ?? 'summer');
  const maturity = clamp(ageYears / recipeValue.matureYears, 0.34, 1.28);
  const ageHeightScale = 0.58 + Math.min(1, maturity) * 0.42 + Math.max(0, maturity - 1) * 0.08;
  const oldGrowth = Math.max(0, maturity - 1);

  const definition = {
    contract: BSB_V2_TREE_DNA_CONTRACT,
    recipe: BSB_V2_TREE_RECIPE_CONTRACT,
    seed,
    species,
    ageYears,
    health,
    season,
    heightMeters: normalizeNumber(
      source.heightMeters ?? sampleRange(recipeValue.heightMeters, random) * ageHeightScale,
      TREE_NUMBER_FIELDS.heightMeters
    ),
    trunkRadiusMeters: normalizeNumber(
      source.trunkRadiusMeters ?? sampleRange(recipeValue.trunkRadiusMeters, random) * (0.72 + Math.min(1.3, maturity) * 0.28),
      TREE_NUMBER_FIELDS.trunkRadiusMeters
    ),
    taper: normalizeNumber(source.taper ?? recipeValue.taper + jitter(random, 0.035), TREE_NUMBER_FIELDS.taper),
    bend: normalizeNumber(source.bend ?? recipeValue.bend + jitter(random, 0.06) + oldGrowth * 0.1, TREE_NUMBER_FIELDS.bend),
    twist: normalizeNumber(source.twist ?? recipeValue.twist + jitter(random, 0.07), TREE_NUMBER_FIELDS.twist),
    branchLevels: normalizeNumber(source.branchLevels ?? sampleInteger(recipeValue.branchLevels, random), TREE_NUMBER_FIELDS.branchLevels),
    branchDensity: normalizeNumber(source.branchDensity ?? recipeValue.branchDensity + jitter(random, 0.08), TREE_NUMBER_FIELDS.branchDensity),
    leafDensity: normalizeNumber(source.leafDensity ?? recipeValue.leafDensity + jitter(random, 0.08), TREE_NUMBER_FIELDS.leafDensity),
    canopySpread: normalizeNumber(source.canopySpread ?? recipeValue.canopySpread + jitter(random, 0.09) + oldGrowth * 0.06, TREE_NUMBER_FIELDS.canopySpread),
    crownStart: normalizeNumber(source.crownStart ?? recipeValue.crownStart + jitter(random, 0.045), TREE_NUMBER_FIELDS.crownStart),
    rootScale: normalizeNumber(source.rootScale ?? recipeValue.rootScale + jitter(random, 0.08) + oldGrowth * 0.2, TREE_NUMBER_FIELDS.rootScale),
    moss: normalizeNumber(source.moss ?? recipeValue.moss + ageYears / 800, TREE_NUMBER_FIELDS.moss),
    barkColour: normalizeColour(source.barkColour, recipeValue.barkColour),
    leafColour: normalizeColour(source.leafColour, recipeValue.leafColour)
  };
  return Object.freeze(definition);
}

export function normalizeBsbV2TreeRecord(record = {}) {
  if (!isBsbV2TreeRecord(record)) return { ...record };
  const normalized = {
    ...record,
    type: 'tree',
    tree: createBsbV2TreeDefinition(record.tree ?? {}, record)
  };
  return normalized;
}

export function applyBsbV2TreeOperation(record, operation = {}) {
  if (!isBsbV2TreeRecord(record)) throw new Error(`bsb_tree_record_required:${record?.id ?? 'missing'}`);
  const op = String(operation.op ?? operation.operation ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!op) throw new Error('bsb_tree_operation_missing');
  const current = createBsbV2TreeDefinition(record.tree ?? {}, record);
  let nextInput = { ...current };

  if (op === 'set_species') {
    nextInput = {
      seed: current.seed,
      species: normalizeSpecies(operation.species ?? operation.value),
      ageYears: current.ageYears,
      health: current.health,
      season: current.season
    };
  } else if (op === 'set_height') {
    nextInput.heightMeters = operation.heightMeters ?? operation.value;
  } else if (op === 'set_leaf_density') {
    nextInput.leafDensity = operation.leafDensity ?? operation.value;
  } else if (op === 'randomise' || op === 'randomize') {
    nextInput = {
      seed: normalizeSeed(operation.seed ?? nextTreeSeed(current.seed)),
      species: current.species,
      ageYears: current.ageYears,
      health: current.health,
      season: current.season
    };
  } else if (op === 'age') {
    nextInput = {
      seed: current.seed,
      species: current.species,
      ageYears: current.ageYears + Number(operation.years ?? operation.amount ?? 1),
      health: current.health,
      season: current.season
    };
  } else if (op === 'damage') {
    nextInput.health = current.health - Math.abs(Number(operation.amount ?? 0.2));
    nextInput.leafDensity = current.leafDensity * (0.72 + Math.max(0, nextInput.health) * 0.28);
    nextInput.bend = current.bend + Math.abs(Number(operation.bend ?? 0.04));
  } else if (op === 'regrow') {
    const recipeValue = BSB_V2_TREE_SPECIES_RECIPES[current.species];
    nextInput.health = current.health + Math.abs(Number(operation.amount ?? 0.24));
    nextInput.leafDensity = current.leafDensity + (recipeValue.leafDensity - current.leafDensity) * 0.55;
  } else if (op === 'make_ancient') {
    const years = Math.abs(Number(operation.years ?? operation.amount ?? 160));
    nextInput = {
      ...current,
      ageYears: Math.max(current.ageYears, current.ageYears + years),
      bend: current.bend + 0.12,
      rootScale: current.rootScale + 0.3,
      moss: current.moss + 0.28,
      crownStart: current.crownStart + 0.04
    };
  } else if (op === 'patch') {
    nextInput = applyTreePatch(nextInput, operation.patch ?? operation.values ?? {});
  } else {
    throw new Error(`bsb_tree_operation_unknown:${op}`);
  }

  return normalizeBsbV2TreeRecord({
    ...record,
    type: 'tree',
    tree: createBsbV2TreeDefinition(nextInput, record)
  });
}

export function treeDefinitionSummary(definition) {
  const tree = createBsbV2TreeDefinition(definition, { id: 'tree-summary' });
  return `${BSB_V2_TREE_SPECIES_RECIPES[tree.species].label} · ${Math.round(tree.ageYears)}y · ${Math.round(tree.health * 100)}% · seed ${tree.seed}`;
}

function applyTreePatch(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('bsb_tree_patch_invalid');
  const next = { ...current };
  for (const field of Object.keys(TREE_NUMBER_FIELDS)) {
    if (Object.hasOwn(patch, field)) next[field] = patch[field];
  }
  if (Object.hasOwn(patch, 'species')) next.species = patch.species;
  if (Object.hasOwn(patch, 'season')) next.season = patch.season;
  if (Object.hasOwn(patch, 'seed')) next.seed = patch.seed;
  if (Object.hasOwn(patch, 'barkColour')) next.barkColour = patch.barkColour;
  if (Object.hasOwn(patch, 'leafColour')) next.leafColour = patch.leafColour;
  return next;
}

function recipe(source) {
  return Object.freeze({ contract: BSB_V2_TREE_RECIPE_CONTRACT, ...source });
}

function normalizeSpecies(value) {
  const species = String(value ?? '').trim().toLowerCase();
  if (!Object.hasOwn(BSB_V2_TREE_SPECIES_RECIPES, species)) throw new Error(`bsb_tree_species_invalid:${species || 'missing'}`);
  return species;
}

function normalizeSeason(value) {
  const season = String(value ?? '').trim().toLowerCase();
  if (!BSB_V2_TREE_SEASONS.includes(season)) throw new Error(`bsb_tree_season_invalid:${season || 'missing'}`);
  return season;
}

function normalizeSeed(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) throw new Error(`bsb_tree_seed_invalid:${value}`);
  return seed;
}

function normalizeNumber(value, spec) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`bsb_tree_number_invalid:${value}`);
  const clamped = clamp(numeric, spec.min, spec.max);
  if (spec.integer) return Math.round(clamped);
  const scale = 10 ** (spec.decimals ?? 3);
  return Math.round(clamped * scale) / scale;
}

function normalizeColour(value, fallback) {
  const colour = String(value ?? fallback).trim();
  if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new Error(`bsb_tree_colour_invalid:${colour || 'missing'}`);
  return colour.toLowerCase();
}

function sampleRange(range, random) {
  return range[0] + (range[1] - range[0]) * random();
}

function sampleInteger(range, random) {
  return Math.round(sampleRange(range, random));
}

function jitter(random, amount) {
  return (random() - 0.5) * amount * 2;
}

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

function nextTreeSeed(seed) {
  return (Math.imul(seed, 1664525) + 1013904223 >>> 0) % 2147483646 + 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
