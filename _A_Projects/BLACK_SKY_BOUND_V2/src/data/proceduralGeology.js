import { MaterialProfileId } from './materialProfiles.js';

export const GEOLOGY_DNA_CONTRACT = 'axiom.geology-dna.v1';
export const GEOLOGY_RECIPE_CONTRACT = 'axiom.geology-recipe.v1';
export const PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT = 'black-sky-bound.procedural-geology-definition.v1';

export const GEOLOGY_RECIPES = Object.freeze({
  fieldstone: recipe({
    id: 'fieldstone', label: 'Mossy Fieldstone', form: 'rounded_mass', palette: 'granite_moss',
    scale: [0.88, 1.18], heightMeters: [0.86, 1.28], angularity: 0.42,
    strataAngleDegrees: 14, strataDensity: 0.26, erosion: 0.5, crackDensity: 0.24,
    fracture: 0.18, moss: 0.56, wetness: 0.2,
    bodyColour: '#626a66', shadeColour: '#3f4645', strataColour: '#89918a', mossColour: '#314d35'
  }),
  fractured_basalt: recipe({
    id: 'fractured_basalt', label: 'Fractured Basalt', form: 'columnar_shard', palette: 'basalt_ash',
    scale: [0.96, 1.38], heightMeters: [1.22, 1.92], angularity: 0.84,
    strataAngleDegrees: 82, strataDensity: 0.58, erosion: 0.16, crackDensity: 0.72,
    fracture: 0.78, moss: 0.1, wetness: 0.32,
    bodyColour: '#4b5056', shadeColour: '#292d33', strataColour: '#737982', mossColour: '#293d31'
  }),
  weathered_outcrop: recipe({
    id: 'weathered_outcrop', label: 'Weathered Outcrop', form: 'layered_outcrop', palette: 'weathered_sandstone',
    scale: [1.12, 1.58], heightMeters: [1.05, 1.62], angularity: 0.56,
    strataAngleDegrees: 24, strataDensity: 0.8, erosion: 0.74, crackDensity: 0.4,
    fracture: 0.36, moss: 0.34, wetness: 0.16,
    bodyColour: '#746b5c', shadeColour: '#49443b', strataColour: '#a09783', mossColour: '#3f5138'
  })
});

const NUMBER_FIELDS = Object.freeze({
  scale: { min: 0.45, max: 2.4 }, heightMeters: { min: 0.3, max: 4.2 }, angularity: { min: 0, max: 1 },
  strataAngleDegrees: { min: 0, max: 180 }, strataDensity: { min: 0, max: 1 }, erosion: { min: 0, max: 1 },
  crackDensity: { min: 0, max: 1 }, fracture: { min: 0, max: 1 }, moss: { min: 0, max: 1 }, wetness: { min: 0, max: 1 }
});

export function isProceduralGeologyType(type) { return type === 'boulder'; }

export function getGeologyRecipe(formation) {
  const recipeValue = GEOLOGY_RECIPES[formation];
  if (!recipeValue) throw new Error(`procedural_geology_formation_invalid:${formation ?? 'missing'}`);
  return recipeValue;
}

export function resolveProceduralGeologyDefinition(source = {}, context = {}) {
  const formation = normalizeFormation(source.formation ?? 'fieldstone');
  const recipeValue = getGeologyRecipe(formation);
  const seed = normalizeSeed(source.seed ?? deriveSeed(context));
  const random = seededRandom(seed);
  const scale = number(source.scale ?? sampleRange(recipeValue.scale, random), NUMBER_FIELDS.scale);
  const heightMeters = number(source.heightMeters ?? sampleRange(recipeValue.heightMeters, random) * (0.72 + scale * 0.28), NUMBER_FIELDS.heightMeters);
  return Object.freeze({
    contract: PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT,
    sourceContract: source.contract ?? GEOLOGY_DNA_CONTRACT,
    recipeContract: source.recipe ?? GEOLOGY_RECIPE_CONTRACT,
    seed,
    formation,
    form: recipeValue.form,
    palette: normalizePalette(source.palette ?? recipeValue.palette),
    scale,
    heightMeters,
    angularity: number(source.angularity ?? recipeValue.angularity + jitter(random, 0.08), NUMBER_FIELDS.angularity),
    strataAngleDegrees: number(source.strataAngleDegrees ?? recipeValue.strataAngleDegrees + jitter(random, 9), NUMBER_FIELDS.strataAngleDegrees),
    strataDensity: number(source.strataDensity ?? recipeValue.strataDensity + jitter(random, 0.1), NUMBER_FIELDS.strataDensity),
    erosion: number(source.erosion ?? recipeValue.erosion + jitter(random, 0.08), NUMBER_FIELDS.erosion),
    crackDensity: number(source.crackDensity ?? recipeValue.crackDensity + jitter(random, 0.1), NUMBER_FIELDS.crackDensity),
    fracture: number(source.fracture ?? recipeValue.fracture + jitter(random, 0.08), NUMBER_FIELDS.fracture),
    moss: number(source.moss ?? recipeValue.moss + jitter(random, 0.1), NUMBER_FIELDS.moss),
    wetness: number(source.wetness ?? recipeValue.wetness + jitter(random, 0.08), NUMBER_FIELDS.wetness),
    bodyColour: colour(source.bodyColour, recipeValue.bodyColour),
    shadeColour: colour(source.shadeColour, recipeValue.shadeColour),
    strataColour: colour(source.strataColour, recipeValue.strataColour),
    mossColour: colour(source.mossColour, recipeValue.mossColour),
    projected: Object.freeze(resolveProjectedSize(scale, heightMeters))
  });
}

export function resolveProceduralGeologySceneProfile(value) {
  const definition = value?.contract === PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT ? value : resolveProceduralGeologyDefinition(value);
  return Object.freeze({
    materialProfileId: MaterialProfileId.STONE_MOSS,
    materialState: Object.freeze({ wetness: definition.wetness, integrity: 1 - definition.fracture * 0.22, density: 0.82 + definition.scale * 0.06 }),
    physical: Object.freeze({ widthMeters: Number(definition.scale.toFixed(3)), depthMeters: Number((definition.scale * 0.86).toFixed(3)), heightMeters: definition.heightMeters }),
    visualFootprint: Object.freeze({
      w: definition.projected.widthTiles,
      h: definition.projected.heightTiles,
      offsetX: Number(((2 - definition.projected.widthTiles) * 0.5).toFixed(3)),
      offsetY: Number(((2 - definition.projected.heightTiles) * 0.68).toFixed(3))
    }),
    render: Object.freeze({
      kind: 'procedural_geology',
      geometryContract: 'black-sky-bound.procedural-geology-hull-geometry.v1',
      scaleRead: `${definition.formation}_geology_dna_v1`,
      bodyColour: definition.bodyColour,
      shadeColour: definition.shadeColour,
      highlightColour: definition.strataColour,
      mossColour: definition.mossColour,
      baseShadow: 'rgba(0,0,0,0.3)'
    })
  });
}

function resolveProjectedSize(scale, heightMeters) {
  return {
    widthTiles: Number(clamp(2.4 * scale, 1.55, 5.4).toFixed(3)),
    heightTiles: Number(clamp(1.28 + heightMeters * 0.92, 1.7, 5.2).toFixed(3))
  };
}
function recipe(source) { return Object.freeze({ contract: GEOLOGY_RECIPE_CONTRACT, materialProfileId: MaterialProfileId.STONE_MOSS, ...source }); }
function deriveSeed(source) {
  const text = `${source.id ?? 'boulder'}:${source.x ?? source.tileX ?? 0}:${source.y ?? source.tileY ?? 0}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 2147483646 + 1;
}
function normalizeFormation(value) {
  const formation = String(value ?? '').trim().toLowerCase();
  if (!Object.hasOwn(GEOLOGY_RECIPES, formation)) throw new Error(`procedural_geology_formation_invalid:${formation || 'missing'}`);
  return formation;
}
function normalizePalette(value) {
  const palette = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(palette)) throw new Error(`procedural_geology_palette_invalid:${palette || 'missing'}`);
  return palette;
}
function normalizeSeed(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) throw new Error(`procedural_geology_seed_invalid:${value}`);
  return seed;
}
function number(value, spec) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`procedural_geology_number_invalid:${value}`);
  return Number(clamp(numeric, spec.min, spec.max).toFixed(3));
}
function colour(value, fallback) {
  const result = String(value ?? fallback).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(result)) throw new Error(`procedural_geology_colour_invalid:${result || 'missing'}`);
  return result;
}
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
