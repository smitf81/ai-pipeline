export const BSB_V2_GEOLOGY_DNA_CONTRACT = 'axiom.geology-dna.v1';
export const BSB_V2_GEOLOGY_RECIPE_CONTRACT = 'axiom.geology-recipe.v1';
export const BSB_V2_GEOLOGY_OPERATION_CONTRACT = 'axiom.geology-operation.v1';

export const BSB_V2_GEOLOGY_RECIPES = Object.freeze({
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

export const BSB_V2_GEOLOGY_RECIPE_OPTIONS = Object.freeze(
  Object.values(BSB_V2_GEOLOGY_RECIPES).map((entry) => Object.freeze([entry.id, entry.label]))
);

const NUMBER_FIELDS = Object.freeze({
  scale: Object.freeze({ min: 0.45, max: 2.4, decimals: 3 }),
  heightMeters: Object.freeze({ min: 0.3, max: 4.2, decimals: 3 }),
  angularity: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  strataAngleDegrees: Object.freeze({ min: 0, max: 180, decimals: 1 }),
  strataDensity: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  erosion: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  crackDensity: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  fracture: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  moss: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  wetness: Object.freeze({ min: 0, max: 1, decimals: 3 })
});

export function isBsbV2GeologyRecord(record) {
  return record?.type === 'boulder' || record?.geology?.contract === BSB_V2_GEOLOGY_DNA_CONTRACT;
}

export function deriveBsbV2GeologySeed(source = {}) {
  const text = `${source.id ?? 'boulder'}:${source.x ?? 0}:${source.y ?? 0}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

export function createBsbV2GeologyDefinition(source = {}, context = {}) {
  const formation = normalizeFormation(source.formation ?? 'fieldstone');
  const recipeValue = BSB_V2_GEOLOGY_RECIPES[formation];
  const seed = normalizeSeed(source.seed ?? deriveBsbV2GeologySeed(context));
  const random = seededRandom(seed);
  const scale = normalizeNumber(source.scale ?? sampleRange(recipeValue.scale, random), NUMBER_FIELDS.scale);
  return Object.freeze({
    contract: BSB_V2_GEOLOGY_DNA_CONTRACT,
    recipe: BSB_V2_GEOLOGY_RECIPE_CONTRACT,
    seed,
    formation,
    palette: normalizePalette(source.palette ?? recipeValue.palette),
    scale,
    heightMeters: normalizeNumber(source.heightMeters ?? sampleRange(recipeValue.heightMeters, random) * (0.72 + scale * 0.28), NUMBER_FIELDS.heightMeters),
    angularity: normalizeNumber(source.angularity ?? recipeValue.angularity + jitter(random, 0.08), NUMBER_FIELDS.angularity),
    strataAngleDegrees: normalizeNumber(source.strataAngleDegrees ?? recipeValue.strataAngleDegrees + jitter(random, 9), NUMBER_FIELDS.strataAngleDegrees),
    strataDensity: normalizeNumber(source.strataDensity ?? recipeValue.strataDensity + jitter(random, 0.1), NUMBER_FIELDS.strataDensity),
    erosion: normalizeNumber(source.erosion ?? recipeValue.erosion + jitter(random, 0.08), NUMBER_FIELDS.erosion),
    crackDensity: normalizeNumber(source.crackDensity ?? recipeValue.crackDensity + jitter(random, 0.1), NUMBER_FIELDS.crackDensity),
    fracture: normalizeNumber(source.fracture ?? recipeValue.fracture + jitter(random, 0.08), NUMBER_FIELDS.fracture),
    moss: normalizeNumber(source.moss ?? recipeValue.moss + jitter(random, 0.1), NUMBER_FIELDS.moss),
    wetness: normalizeNumber(source.wetness ?? recipeValue.wetness + jitter(random, 0.08), NUMBER_FIELDS.wetness),
    bodyColour: normalizeColour(source.bodyColour, recipeValue.bodyColour),
    shadeColour: normalizeColour(source.shadeColour, recipeValue.shadeColour),
    strataColour: normalizeColour(source.strataColour, recipeValue.strataColour),
    mossColour: normalizeColour(source.mossColour, recipeValue.mossColour)
  });
}

export function normalizeBsbV2GeologyRecord(record = {}) {
  if (!isBsbV2GeologyRecord(record)) return { ...record };
  return {
    ...record,
    type: 'boulder',
    geology: createBsbV2GeologyDefinition(record.geology ?? {}, record)
  };
}

export function applyBsbV2GeologyOperation(record, operation = {}) {
  if (!isBsbV2GeologyRecord(record)) throw new Error(`bsb_geology_record_required:${record?.id ?? 'missing'}`);
  const op = operationName(operation);
  const current = createBsbV2GeologyDefinition(record.geology ?? {}, record);
  let nextInput = { ...current };

  if (op === 'set_formation') {
    nextInput = {
      seed: current.seed,
      formation: normalizeFormation(operation.formation ?? operation.value),
      scale: current.scale
    };
  } else if (op === 'set_scale') {
    nextInput.scale = operation.scale ?? operation.value;
  } else if (op === 'randomise' || op === 'randomize') {
    nextInput.seed = normalizeSeed(operation.seed ?? nextSeed(current.seed));
  } else if (op === 'erode') {
    const amount = positiveAmount(operation.amount, 0.18);
    nextInput.erosion = current.erosion + amount;
    nextInput.angularity = current.angularity - amount * 0.32;
    nextInput.moss = current.moss + amount * 0.16;
  } else if (op === 'fracture') {
    const amount = positiveAmount(operation.amount, 0.2);
    nextInput.fracture = current.fracture + amount;
    nextInput.crackDensity = current.crackDensity + amount * 0.82;
    nextInput.angularity = current.angularity + amount * 0.28;
  } else if (op === 'moss') {
    nextInput.moss = current.moss + positiveAmount(operation.amount, 0.2);
  } else if (op === 'weather') {
    const amount = positiveAmount(operation.amount, 0.18);
    nextInput.erosion = current.erosion + amount;
    nextInput.crackDensity = current.crackDensity + amount * 0.28;
    nextInput.moss = current.moss + amount * 0.42;
    nextInput.wetness = current.wetness + amount * 0.18;
    nextInput.angularity = current.angularity - amount * 0.18;
  } else if (op === 'patch') {
    nextInput = applyPatch(nextInput, operation.patch ?? operation.values ?? {});
  } else {
    throw new Error(`bsb_geology_operation_unknown:${op}`);
  }

  return normalizeBsbV2GeologyRecord({
    ...record,
    type: 'boulder',
    geology: createBsbV2GeologyDefinition(nextInput, record)
  });
}

export function geologyDefinitionSummary(definition) {
  const geology = createBsbV2GeologyDefinition(definition, { id: 'geology-summary' });
  return `${BSB_V2_GEOLOGY_RECIPES[geology.formation].label} - ${geology.scale.toFixed(2)}x - ${Math.round(geology.erosion * 100)}% eroded - seed ${geology.seed}`;
}

function applyPatch(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('bsb_geology_patch_invalid');
  const next = { ...current };
  for (const field of Object.keys(NUMBER_FIELDS)) if (Object.hasOwn(patch, field)) next[field] = patch[field];
  if (Object.hasOwn(patch, 'seed')) next.seed = patch.seed;
  if (Object.hasOwn(patch, 'formation')) next.formation = patch.formation;
  if (Object.hasOwn(patch, 'palette')) next.palette = patch.palette;
  for (const field of ['bodyColour', 'shadeColour', 'strataColour', 'mossColour']) {
    if (Object.hasOwn(patch, field)) next[field] = patch[field];
  }
  return next;
}

function recipe(source) { return Object.freeze({ contract: BSB_V2_GEOLOGY_RECIPE_CONTRACT, ...source }); }
function operationName(operation) {
  const op = String(operation.op ?? operation.operation ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!op) throw new Error('bsb_geology_operation_missing');
  return op;
}
function normalizeFormation(value) {
  const formation = String(value ?? '').trim().toLowerCase();
  if (!Object.hasOwn(BSB_V2_GEOLOGY_RECIPES, formation)) throw new Error(`bsb_geology_formation_invalid:${formation || 'missing'}`);
  return formation;
}
function normalizePalette(value) {
  const palette = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(palette)) throw new Error(`bsb_geology_palette_invalid:${palette || 'missing'}`);
  return palette;
}
function normalizeSeed(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) throw new Error(`bsb_geology_seed_invalid:${value}`);
  return seed;
}
function normalizeNumber(value, spec) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`bsb_geology_number_invalid:${value}`);
  const scale = 10 ** (spec.decimals ?? 3);
  return Math.round(clamp(numeric, spec.min, spec.max) * scale) / scale;
}
function normalizeColour(value, fallback) {
  const colour = String(value ?? fallback).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(colour)) throw new Error(`bsb_geology_colour_invalid:${colour || 'missing'}`);
  return colour;
}
function positiveAmount(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) throw new Error(`bsb_geology_amount_invalid:${value}`);
  return Math.abs(numeric);
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
function nextSeed(seed) { return (Math.imul(seed, 1664525) + 1013904223 >>> 0) % 2147483646 + 1; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
