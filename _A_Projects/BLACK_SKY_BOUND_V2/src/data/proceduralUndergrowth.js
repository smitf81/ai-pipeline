import { MaterialProfileId } from './materialProfiles.js';

export const UNDERGROWTH_DNA_CONTRACT = 'axiom.undergrowth-dna.v1';
export const UNDERGROWTH_RECIPE_CONTRACT = 'axiom.undergrowth-species-recipe.v1';
export const PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT = 'black-sky-bound.procedural-undergrowth-definition.v1';

export const UNDERGROWTH_SPECIES_RECIPES = Object.freeze({
  wood_fern: recipe({
    id: 'wood_fern', label: 'Wood Fern', form: 'radial_fronds', materialProfileId: MaterialProfileId.FOLIAGE_FERN,
    ageYears: 5, matureYears: 4, heightMeters: [0.38, 0.62], spreadMeters: [1.2, 1.7], density: 0.72,
    stemCount: [8, 12], leafSize: 0.16, curl: 0.28, lean: 0.18, irregularity: 0.24, groundCover: 0.34,
    burn: 0, char: 0, stemColour: '#36513a', leafColour: '#2f6339'
  }),
  forest_shrub: recipe({
    id: 'forest_shrub', label: 'Forest Shrub', form: 'branching_shrub', materialProfileId: MaterialProfileId.FOLIAGE_SHRUB,
    ageYears: 12, matureYears: 8, heightMeters: [0.62, 1.05], spreadMeters: [1.3, 2], density: 0.8,
    stemCount: [6, 10], leafSize: 0.21, curl: 0.12, lean: 0.16, irregularity: 0.34, groundCover: 0.48,
    burn: 0, char: 0, stemColour: '#3f452b', leafColour: '#3f6b39'
  }),
  ember_bramble: recipe({
    id: 'ember_bramble', label: 'Ember Bramble', form: 'sprawling_bramble', materialProfileId: MaterialProfileId.FOLIAGE_SHRUB,
    ageYears: 9, matureYears: 7, heightMeters: [0.46, 0.78], spreadMeters: [1.5, 2.25], density: 0.64,
    stemCount: [7, 11], leafSize: 0.13, curl: 0.42, lean: 0.3, irregularity: 0.48, groundCover: 0.62,
    burn: 0.74, char: 0.5, stemColour: '#47372b', leafColour: '#344331'
  })
});

const NUMBER_FIELDS = Object.freeze({
  ageYears: { min: 0.2, max: 120 }, health: { min: 0, max: 1 }, heightMeters: { min: 0.08, max: 3 },
  spreadMeters: { min: 0.2, max: 5 }, density: { min: 0.05, max: 1 }, stemCount: { min: 2, max: 28, integer: true },
  leafSize: { min: 0.04, max: 0.5 }, curl: { min: 0, max: 1 }, lean: { min: 0, max: 0.8 },
  irregularity: { min: 0, max: 1 }, groundCover: { min: 0, max: 1 }, burn: { min: 0, max: 1 }, char: { min: 0, max: 1 }
});
const UNDERGROWTH_TYPES = new Set(['fern_patch', 'forest_shrub', 'smouldering_fern', 'smouldering_bramble']);
const SEASONS = new Set(['spring', 'summer', 'autumn', 'winter']);

export function isProceduralUndergrowthType(type) {
  return UNDERGROWTH_TYPES.has(type);
}

export function getUndergrowthSpeciesRecipe(species) {
  const recipeValue = UNDERGROWTH_SPECIES_RECIPES[species];
  if (!recipeValue) throw new Error(`procedural_undergrowth_species_invalid:${species ?? 'missing'}`);
  return recipeValue;
}

export function resolveProceduralUndergrowthDefinition(source = {}, context = {}) {
  const species = normalizeSpecies(source.species ?? speciesForType(context.type));
  const recipeValue = getUndergrowthSpeciesRecipe(species);
  const seed = normalizeSeed(source.seed ?? deriveSeed(context));
  const random = seededRandom(seed);
  const ageYears = number(source.ageYears ?? recipeValue.ageYears, NUMBER_FIELDS.ageYears);
  const maturity = clamp(ageYears / recipeValue.matureYears, 0.3, 1.35);
  const healthFallback = finite(context.materialState?.integrity) ? Number(context.materialState.integrity) : 0.94;
  const burnFallback = context.type === 'smouldering_fern' ? 0.68
    : context.type === 'smouldering_bramble' ? 0.74
      : recipeValue.burn;
  const heightMeters = number(source.heightMeters ?? sampleRange(recipeValue.heightMeters, random) * (0.62 + Math.min(1, maturity) * 0.38), NUMBER_FIELDS.heightMeters);
  const spreadMeters = number(source.spreadMeters ?? sampleRange(recipeValue.spreadMeters, random) * (0.72 + Math.min(1.2, maturity) * 0.28), NUMBER_FIELDS.spreadMeters);
  return Object.freeze({
    contract: PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT,
    sourceContract: source.contract ?? UNDERGROWTH_DNA_CONTRACT,
    recipeContract: source.recipe ?? UNDERGROWTH_RECIPE_CONTRACT,
    seed,
    species,
    form: recipeValue.form,
    ageYears,
    matureYears: recipeValue.matureYears,
    health: number(source.health ?? healthFallback, NUMBER_FIELDS.health),
    season: normalizeSeason(source.season ?? 'summer'),
    heightMeters,
    spreadMeters,
    density: number(source.density ?? context.materialState?.density ?? recipeValue.density + jitter(random, 0.09), NUMBER_FIELDS.density),
    stemCount: number(source.stemCount ?? sampleRange(recipeValue.stemCount, random), NUMBER_FIELDS.stemCount),
    leafSize: number(source.leafSize ?? recipeValue.leafSize + jitter(random, 0.025), NUMBER_FIELDS.leafSize),
    curl: number(source.curl ?? recipeValue.curl + jitter(random, 0.08), NUMBER_FIELDS.curl),
    lean: number(source.lean ?? recipeValue.lean + jitter(random, 0.06), NUMBER_FIELDS.lean),
    irregularity: number(source.irregularity ?? recipeValue.irregularity + jitter(random, 0.1), NUMBER_FIELDS.irregularity),
    groundCover: number(source.groundCover ?? recipeValue.groundCover + jitter(random, 0.08), NUMBER_FIELDS.groundCover),
    burn: number(source.burn ?? burnFallback, NUMBER_FIELDS.burn),
    char: number(source.char ?? Math.max(recipeValue.char, burnFallback * 0.68), NUMBER_FIELDS.char),
    stemColour: colour(source.stemColour, recipeValue.stemColour),
    leafColour: colour(source.leafColour, recipeValue.leafColour),
    projected: Object.freeze(resolveProjectedSize(heightMeters, spreadMeters))
  });
}

export function resolveProceduralUndergrowthSceneProfile(value) {
  const definition = value?.contract === PROCEDURAL_UNDERGROWTH_DEFINITION_CONTRACT ? value : resolveProceduralUndergrowthDefinition(value);
  const recipeValue = getUndergrowthSpeciesRecipe(definition.species);
  return Object.freeze({
    materialProfileId: recipeValue.materialProfileId,
    materialState: Object.freeze({ density: definition.density, integrity: definition.health, burnAmount: definition.burn, charAmount: definition.char }),
    physical: Object.freeze({ widthMeters: definition.spreadMeters, depthMeters: Number((definition.spreadMeters * 0.62).toFixed(3)), heightMeters: definition.heightMeters }),
    visualFootprint: Object.freeze({
      w: definition.projected.widthTiles,
      h: definition.projected.heightTiles,
      offsetX: Number(((1 - definition.projected.widthTiles) * 0.5).toFixed(3)),
      offsetY: Number(((1 - definition.projected.heightTiles) * 0.58).toFixed(3))
    }),
    render: Object.freeze({
      kind: 'procedural_undergrowth',
      geometryContract: 'black-sky-bound.procedural-undergrowth-spline-geometry.v2',
      scaleRead: `${definition.species}_undergrowth_dna_v1`,
      stemColour: definition.stemColour,
      leafColour: definition.leafColour,
      baseShadow: 'rgba(0,0,0,0.2)'
    })
  });
}

function resolveProjectedSize(heightMeters, spreadMeters) {
  return {
    widthTiles: Number(clamp(spreadMeters / 0.5, 0.8, 7).toFixed(3)),
    heightTiles: Number(clamp(heightMeters / 0.5 + 0.72, 0.8, 6).toFixed(3))
  };
}
function recipe(source) { return Object.freeze({ contract: UNDERGROWTH_RECIPE_CONTRACT, ...source }); }
function speciesForType(type) {
  if (type === 'forest_shrub') return 'forest_shrub';
  if (type === 'smouldering_bramble') return 'ember_bramble';
  return 'wood_fern';
}
function deriveSeed(source) {
  const text = `${source.id ?? 'undergrowth'}:${source.x ?? source.tileX ?? 0}:${source.y ?? source.tileY ?? 0}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 2147483646 + 1;
}
function normalizeSpecies(value) {
  const species = String(value ?? '').trim().toLowerCase();
  if (!Object.hasOwn(UNDERGROWTH_SPECIES_RECIPES, species)) throw new Error(`procedural_undergrowth_species_invalid:${species || 'missing'}`);
  return species;
}
function normalizeSeason(value) {
  const season = String(value ?? '').trim().toLowerCase();
  if (!SEASONS.has(season)) throw new Error(`procedural_undergrowth_season_invalid:${season || 'missing'}`);
  return season;
}
function normalizeSeed(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) throw new Error(`procedural_undergrowth_seed_invalid:${value}`);
  return seed;
}
function number(value, spec) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`procedural_undergrowth_number_invalid:${value}`);
  const result = clamp(numeric, spec.min, spec.max);
  return spec.integer ? Math.round(result) : Number(result.toFixed(3));
}
function colour(value, fallback) {
  const result = String(value ?? fallback).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(result)) throw new Error(`procedural_undergrowth_colour_invalid:${result || 'missing'}`);
  return result;
}
function finite(value) { return Number.isFinite(Number(value)); }
function sampleRange(range, random) { return range[0] + (range[1] - range[0]) * random(); }
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
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
