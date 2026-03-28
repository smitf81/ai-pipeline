const FIELD_BUNDLE_KIND = 'spatial-field-bundle';
const FIELD_BUNDLE_VERSION = 'v1';
const BASE_LAYER_KEY = '0';
const COARSE_LAYER_KEY = '1';
const BASE_LAYER_ROLE = 'base';
const COARSE_LAYER_ROLE = 'coarse';

function normalizePositiveInt(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(1, Math.round(Number(fallback) || 1));
  }
  return Math.max(1, Math.round(numeric));
}

function cloneFieldValues(values = [], width = 1, height = 1, fallbackValue = 'grass') {
  const resolvedWidth = normalizePositiveInt(width, 1);
  const resolvedHeight = normalizePositiveInt(height, 1);
  return Array.from({ length: resolvedHeight }, (_, y) => Array.from({ length: resolvedWidth }, (_, x) => {
    const sample = values?.[y]?.[x];
    return sample == null || sample === '' ? fallbackValue : sample;
  }));
}

function createFieldLayer({
  role,
  resolution,
  width,
  height,
  values,
  fallbackValue = 'grass',
  aggregateStrategy = 'majority',
} = {}) {
  const resolvedWidth = normalizePositiveInt(width, 1);
  const resolvedHeight = normalizePositiveInt(height, 1);
  const resolvedResolution = normalizePositiveInt(resolution, 1);
  const resolvedValues = cloneFieldValues(values, resolvedWidth, resolvedHeight, fallbackValue);
  return {
    kind: 'field-layer',
    role,
    resolution: resolvedResolution,
    width: resolvedWidth,
    height: resolvedHeight,
    aggregateStrategy,
    fallbackValue,
    values: resolvedValues,
  };
}

function deriveMajorityValue(samples = [], fallbackValue = 'grass') {
  const counts = new Map();
  let bestValue = fallbackValue;
  let bestCount = -1;

  samples.filter((value) => value != null && value !== '').forEach((value) => {
    const nextCount = (counts.get(value) || 0) + 1;
    counts.set(value, nextCount);
    if (nextCount > bestCount) {
      bestValue = value;
      bestCount = nextCount;
    }
  });

  return bestCount < 0 ? fallbackValue : bestValue;
}

function deriveCoarseLayer(baseLayer, factor = 2) {
  const resolution = normalizePositiveInt(factor, 2);
  const width = Math.max(1, Math.ceil(normalizePositiveInt(baseLayer?.width, 1) / resolution));
  const height = Math.max(1, Math.ceil(normalizePositiveInt(baseLayer?.height, 1) / resolution));
  const baseValues = baseLayer?.values || [];
  const fallbackValue = baseLayer?.fallbackValue || 'grass';
  const values = Array.from({ length: height }, (_, coarseY) => Array.from({ length: width }, (_, coarseX) => {
    const samples = [];
    for (let y = coarseY * resolution; y < Math.min(baseLayer?.height || 0, (coarseY + 1) * resolution); y += 1) {
      for (let x = coarseX * resolution; x < Math.min(baseLayer?.width || 0, (coarseX + 1) * resolution); x += 1) {
        samples.push(baseValues?.[y]?.[x]);
      }
    }
    return deriveMajorityValue(samples, fallbackValue);
  }));

  return createFieldLayer({
    role: COARSE_LAYER_ROLE,
    resolution,
    width,
    height,
    values,
    fallbackValue,
    aggregateStrategy: 'majority',
  });
}

function normalizeFieldLayer(layer = null, defaults = {}) {
  if (!layer || typeof layer !== 'object') {
    return null;
  }

  const fallbackValue = defaults.fallbackValue || layer.fallbackValue || 'grass';
  const resolution = normalizePositiveInt(layer.resolution ?? defaults.resolution ?? 1, 1);
  const width = normalizePositiveInt(layer.width ?? defaults.width ?? 1, 1);
  const height = normalizePositiveInt(layer.height ?? defaults.height ?? 1, 1);
  return createFieldLayer({
    role: layer.role || defaults.role || BASE_LAYER_ROLE,
    resolution,
    width,
    height,
    values: layer.values,
    fallbackValue,
    aggregateStrategy: layer.aggregateStrategy || defaults.aggregateStrategy || (resolution > 1 ? 'majority' : 'identity'),
  });
}

function describeScaffoldFieldLayer(layer = null) {
  if (!layer) {
    return 'missing layer';
  }
  return `${layer.role || BASE_LAYER_ROLE} ${layer.width}x${layer.height} @${layer.resolution || 1}x`;
}

function normalizeScaffoldFieldBundle(scaffoldOrField = {}) {
  const scaffold = scaffoldOrField?.field && typeof scaffoldOrField.field === 'object'
    ? scaffoldOrField
    : { field: scaffoldOrField };
  const sourceField = scaffold.field && typeof scaffold.field === 'object' ? scaffold.field : {};
  const fallbackValue = sourceField.fallbackValue || scaffold.tileType || scaffold.material || 'grass';
  const baseLayerKey = String(sourceField.baseLayerKey || BASE_LAYER_KEY);
  const coarseLayerKey = String(sourceField.coarseLayerKey || COARSE_LAYER_KEY);
  const baseLayer = normalizeFieldLayer(
    sourceField.layers?.[baseLayerKey] || sourceField.layers?.[BASE_LAYER_KEY],
    {
      role: BASE_LAYER_ROLE,
      resolution: sourceField.baseLayerResolution || 1,
      width: sourceField.width || scaffold.dimensions?.width || 1,
      height: sourceField.height || scaffold.dimensions?.height || 1,
      fallbackValue,
      aggregateStrategy: 'identity',
    },
  ) || createFieldLayer({
    role: BASE_LAYER_ROLE,
    resolution: 1,
    width: scaffold.dimensions?.width || 1,
    height: scaffold.dimensions?.height || 1,
    fallbackValue,
    aggregateStrategy: 'identity',
  });

  const coarseLayer = normalizeFieldLayer(
    sourceField.layers?.[coarseLayerKey] || sourceField.layers?.[COARSE_LAYER_KEY],
    {
      role: COARSE_LAYER_ROLE,
      resolution: sourceField.coarseLayerResolution || 2,
      fallbackValue,
      aggregateStrategy: 'majority',
    },
  ) || deriveCoarseLayer(baseLayer, sourceField.coarseLayerResolution || 2);

  const layers = {
    [BASE_LAYER_KEY]: baseLayer,
    [COARSE_LAYER_KEY]: coarseLayer,
  };

  return {
    kind: sourceField.kind || FIELD_BUNDLE_KIND,
    version: sourceField.version || FIELD_BUNDLE_VERSION,
    aggregateStrategy: sourceField.aggregateStrategy || 'majority',
    baseLayerKey,
    coarseLayerKey,
    layerOrder: [BASE_LAYER_KEY, COARSE_LAYER_KEY],
    layers,
    baseLayer,
    coarseLayer,
    summary: `Field ${describeScaffoldFieldLayer(baseLayer)} | ${describeScaffoldFieldLayer(coarseLayer)}`,
  };
}

function getScaffoldBaseFieldValues(scaffoldOrField = {}) {
  return normalizeScaffoldFieldBundle(scaffoldOrField).baseLayer.values;
}

export {
  BASE_LAYER_KEY,
  COARSE_LAYER_KEY,
  FIELD_BUNDLE_KIND,
  FIELD_BUNDLE_VERSION,
  describeScaffoldFieldLayer,
  deriveCoarseLayer,
  getScaffoldBaseFieldValues,
  normalizeFieldLayer,
  normalizeScaffoldFieldBundle,
};
