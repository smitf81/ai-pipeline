import { MaterialProfileId } from './materialProfiles.js';

export const TREE_DNA_CONTRACT = 'axiom.tree-dna.v1';
export const TREE_RECIPE_CONTRACT = 'axiom.tree-species-recipe.v1';
export const PROCEDURAL_TREE_DEFINITION_CONTRACT = 'black-sky-bound.procedural-tree-definition.v1';

export const TREE_SPECIES_RECIPES = Object.freeze({
  old_pine: recipe({
    id: 'old_pine', label: 'Old Pine', form: 'conifer', evergreen: true,
    materialProfileId: MaterialProfileId.WOOD_PINE,
    ageYears: 72, matureYears: 55, heightMeters: [7.6, 10.4], trunkRadiusMeters: [0.46, 0.72],
    taper: 0.72, bend: 0.13, twist: 0.18, branchLevels: [5, 7], branchDensity: 0.74,
    leafDensity: 0.9, canopySpread: 0.86, crownStart: 0.25, rootScale: 1.02, moss: 0.28,
    barkColour: '#4a3020', leafColour: '#244d33',
    crownWidthMeters: 3.1, crownDepthMeters: 3.7, projectedHeightTiles: 7.4
  }),
  silver_birch: recipe({
    id: 'silver_birch', label: 'Silver Birch', form: 'airy_broadleaf', evergreen: false,
    materialProfileId: MaterialProfileId.WOOD_BIRCH,
    ageYears: 38, matureYears: 34, heightMeters: [6.4, 8.8], trunkRadiusMeters: [0.24, 0.4],
    taper: 0.64, bend: 0.22, twist: 0.24, branchLevels: [4, 6], branchDensity: 0.62,
    leafDensity: 0.64, canopySpread: 0.7, crownStart: 0.34, rootScale: 0.76, moss: 0.14,
    barkColour: '#d7cfb7', leafColour: '#728b4d',
    crownWidthMeters: 2.5, crownDepthMeters: 3.2, projectedHeightTiles: 6.8
  }),
  ancient_oak: recipe({
    id: 'ancient_oak', label: 'Ancient Oak', form: 'broadleaf', evergreen: false,
    materialProfileId: MaterialProfileId.WOOD_PINE,
    ageYears: 180, matureYears: 75, heightMeters: [7.2, 10.2], trunkRadiusMeters: [0.64, 0.98],
    taper: 0.84, bend: 0.34, twist: 0.31, branchLevels: [5, 7], branchDensity: 0.82,
    leafDensity: 0.78, canopySpread: 1.22, crownStart: 0.43, rootScale: 1.42, moss: 0.66,
    barkColour: '#563923', leafColour: '#315b36',
    crownWidthMeters: 4.4, crownDepthMeters: 3.9, projectedHeightTiles: 7.8
  })
});

const NUMBER_FIELDS = Object.freeze({
  ageYears: { min: 1, max: 800 }, health: { min: 0, max: 1 }, heightMeters: { min: 1.5, max: 30 },
  trunkRadiusMeters: { min: 0.08, max: 2.4 }, taper: { min: 0.2, max: 0.96 }, bend: { min: 0, max: 0.85 },
  twist: { min: 0, max: 1 }, branchLevels: { min: 1, max: 9, integer: true }, branchDensity: { min: 0.1, max: 1 },
  leafDensity: { min: 0, max: 1 }, canopySpread: { min: 0.25, max: 1.8 }, crownStart: { min: 0.12, max: 0.72 },
  rootScale: { min: 0.2, max: 2.2 }, moss: { min: 0, max: 1 }
});

const SEASONS = new Set(['spring', 'summer', 'autumn', 'winter']);

export function isProceduralTreeType(type) {
  return type === 'tree' || type === 'birch_tree';
}

export function getTreeSpeciesRecipe(species) {
  const recipeValue = TREE_SPECIES_RECIPES[species];
  if (!recipeValue) throw new Error(`procedural_tree_species_invalid:${species ?? 'missing'}`);
  return recipeValue;
}

export function resolveProceduralTreeDefinition(source = {}, context = {}) {
  const legacySpecies = context.type === 'birch_tree' ? 'silver_birch' : 'old_pine';
  const species = normalizeSpecies(source.species ?? legacySpecies);
  const recipeValue = getTreeSpeciesRecipe(species);
  const seed = normalizeSeed(source.seed ?? deriveSeed(context));
  const random = seededRandom(seed);
  const ageYears = number(source.ageYears ?? recipeValue.ageYears, NUMBER_FIELDS.ageYears);
  const health = number(source.health ?? 0.94, NUMBER_FIELDS.health);
  const season = normalizeSeason(source.season ?? 'summer');
  const maturity = clamp(ageYears / recipeValue.matureYears, 0.34, 1.28);
  const oldGrowth = Math.max(0, maturity - 1);
  const ageHeightScale = 0.58 + Math.min(1, maturity) * 0.42 + oldGrowth * 0.08;

  return Object.freeze({
    contract: PROCEDURAL_TREE_DEFINITION_CONTRACT,
    sourceContract: source.contract ?? TREE_DNA_CONTRACT,
    recipeContract: source.recipe ?? TREE_RECIPE_CONTRACT,
    seed,
    species,
    form: recipeValue.form,
    evergreen: recipeValue.evergreen,
    ageYears,
    matureYears: recipeValue.matureYears,
    health,
    season,
    heightMeters: number(source.heightMeters ?? sampleRange(recipeValue.heightMeters, random) * ageHeightScale, NUMBER_FIELDS.heightMeters),
    trunkRadiusMeters: number(source.trunkRadiusMeters ?? sampleRange(recipeValue.trunkRadiusMeters, random) * (0.72 + Math.min(1.3, maturity) * 0.28), NUMBER_FIELDS.trunkRadiusMeters),
    taper: number(source.taper ?? recipeValue.taper + jitter(random, 0.035), NUMBER_FIELDS.taper),
    bend: number(source.bend ?? recipeValue.bend + jitter(random, 0.06) + oldGrowth * 0.1, NUMBER_FIELDS.bend),
    twist: number(source.twist ?? recipeValue.twist + jitter(random, 0.07), NUMBER_FIELDS.twist),
    branchLevels: number(source.branchLevels ?? Math.round(sampleRange(recipeValue.branchLevels, random)), NUMBER_FIELDS.branchLevels),
    branchDensity: number(source.branchDensity ?? recipeValue.branchDensity + jitter(random, 0.08), NUMBER_FIELDS.branchDensity),
    leafDensity: number(source.leafDensity ?? recipeValue.leafDensity + jitter(random, 0.08), NUMBER_FIELDS.leafDensity),
    canopySpread: number(source.canopySpread ?? recipeValue.canopySpread + jitter(random, 0.09) + oldGrowth * 0.06, NUMBER_FIELDS.canopySpread),
    crownStart: number(source.crownStart ?? recipeValue.crownStart + jitter(random, 0.045), NUMBER_FIELDS.crownStart),
    rootScale: number(source.rootScale ?? recipeValue.rootScale + jitter(random, 0.08) + oldGrowth * 0.2, NUMBER_FIELDS.rootScale),
    moss: number(source.moss ?? recipeValue.moss + ageYears / 800, NUMBER_FIELDS.moss),
    barkColour: colour(source.barkColour, recipeValue.barkColour),
    leafColour: colour(source.leafColour, recipeValue.leafColour),
    projected: Object.freeze(resolveProjectedSize(source, recipeValue))
  });
}

export function resolveProceduralTreeSceneProfile(tree) {
  const definition = tree?.contract === PROCEDURAL_TREE_DEFINITION_CONTRACT ? tree : resolveProceduralTreeDefinition(tree);
  const recipeValue = getTreeSpeciesRecipe(definition.species);
  return Object.freeze({
    materialProfileId: recipeValue.materialProfileId,
    physical: Object.freeze({
      trunkBaseMeters: Number((definition.trunkRadiusMeters * 2).toFixed(3)),
      crownWidthMeters: Number((definition.projected.widthTiles * 0.5).toFixed(3)),
      crownDepthMeters: Number((definition.projected.heightTiles * 0.5).toFixed(3)),
      heightMeters: definition.heightMeters
    }),
    visualFootprint: Object.freeze({
      w: definition.projected.widthTiles,
      h: definition.projected.heightTiles,
      offsetX: Number((1 - definition.projected.widthTiles * 0.5).toFixed(3)),
      offsetY: Number((1 - definition.projected.heightTiles + 0.3).toFixed(3))
    }),
    render: Object.freeze({
      kind: 'procedural_tree',
      geometryContract: 'black-sky-bound.procedural-tree-spline-geometry.v1',
      scaleRead: `${definition.species}_tree_dna_v1`,
      trunkColour: definition.barkColour,
      trunkShadow: darkenHex(definition.barkColour, 0.52),
      crownColour: definition.leafColour,
      crownShade: darkenHex(definition.leafColour, 0.52),
      crownHighlight: lightenHex(definition.leafColour, 0.28),
      baseShadow: 'rgba(0,0,0,0.32)'
    })
  });
}

function resolveProjectedSize(source, recipeValue) {
  const baseHeight = (recipeValue.heightMeters[0] + recipeValue.heightMeters[1]) * 0.5;
  const heightScale = clamp(Number(source.heightMeters ?? baseHeight) / baseHeight, 0.68, 1.45);
  const spreadScale = clamp(Number(source.canopySpread ?? recipeValue.canopySpread) / recipeValue.canopySpread, 0.68, 1.5);
  return {
    widthTiles: Number(((recipeValue.crownWidthMeters / 0.5) * spreadScale).toFixed(3)),
    heightTiles: Number((recipeValue.projectedHeightTiles * heightScale).toFixed(3))
  };
}

function recipe(source) {
  return Object.freeze({ contract: TREE_RECIPE_CONTRACT, ...source });
}

function deriveSeed(source) {
  const text = `${source.id ?? 'tree'}:${source.x ?? source.tileX ?? 0}:${source.y ?? source.tileY ?? 0}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

function normalizeSpecies(value) {
  const species = String(value ?? '').trim().toLowerCase();
  if (!Object.hasOwn(TREE_SPECIES_RECIPES, species)) throw new Error(`procedural_tree_species_invalid:${species || 'missing'}`);
  return species;
}

function normalizeSeason(value) {
  const season = String(value ?? '').trim().toLowerCase();
  if (!SEASONS.has(season)) throw new Error(`procedural_tree_season_invalid:${season || 'missing'}`);
  return season;
}

function normalizeSeed(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) throw new Error(`procedural_tree_seed_invalid:${value}`);
  return seed;
}

function number(value, spec) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`procedural_tree_number_invalid:${value}`);
  const result = clamp(numeric, spec.min, spec.max);
  return spec.integer ? Math.round(result) : Number(result.toFixed(3));
}

function colour(value, fallback) {
  const result = String(value ?? fallback).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(result)) throw new Error(`procedural_tree_colour_invalid:${result || 'missing'}`);
  return result;
}

function sampleRange(range, random) {
  return range[0] + (range[1] - range[0]) * random();
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

function darkenHex(value, amount) {
  return transformHex(value, (channel) => channel * (1 - amount));
}

function lightenHex(value, amount) {
  return transformHex(value, (channel) => channel + (255 - channel) * amount);
}

function transformHex(value, transform) {
  const rgb = [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  return `#${rgb.map((channel) => Math.round(clamp(transform(channel), 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
