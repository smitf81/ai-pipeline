const GROUND_Z = 0;
const WORLD_SCAFFOLD_KIND = 'rect-ground-grid';
const WORLD_SCAFFOLD_NODE_ID = 'world_scaffold_ground_grid';
const WORLD_SCAFFOLD_MAX_DIMENSION = 100;
const WORLD_SCAFFOLD_SUPPORTED_MATERIALS = Object.freeze(['grass', 'stone', 'dirt']);
const DEFAULT_WORLD_SCAFFOLD_POSITION = Object.freeze({ x: 96, y: 72 });
const DEFAULT_WORLD_SCAFFOLD_ORIGIN = Object.freeze({ x: 0, y: 0, z: GROUND_Z });
const DEFAULT_WORLD_SCAFFOLD_CELL_SIZE = 28;
const WORLD_SCAFFOLD_METADATA_KEYS = new Set(['graphLayer', 'role', 'proposalTarget', 'labels', 'origin', 'scaffold']);
const GRID_DIMENSION_PATTERN = /(?:^|\b)(-?\d{1,3})\s*(?:x|by)\s*(-?\d{1,3})(?:\b|$)/i;
const GRID_KEYWORD_PATTERN = /\b(grid|tiles?|cells?)\b/i;
const LEGACY_GRASS_GROUND_PATTERN = /\bgrass\s*\/\s*ground\s+(?:grid|tiles?|cells?)\b/i;
const MATERIAL_BEFORE_GRID_PATTERN = /\b([a-z]+)(?:\s+ground)?\s+(?:grid|tiles?|cells?)\b/i;
const POSITION_PATTERN = /\bat\s*\(?\s*(-?\d{1,4})\s*[, ]\s*(-?\d{1,4})(?:\s*[, ]\s*(-?\d{1,4}))?\s*\)?/i;
const MODEL_SCAFFOLD_ACTION_PATTERN = /\b(create|make|build|give|start|setup|set up)\b/i;
const MODEL_SCAFFOLD_NOUN_PATTERN = /\b(grid|platform|area|floor|pad|base)\b/i;
const MODEL_SCAFFOLD_TERRAIN_PATTERN = /\b(grass|grassy|stone|dirt|ground)\b/i;
const MODEL_SCAFFOLD_CONTEXT_PATTERN = /\b(starter|village|build on|buildable|build\b)\b/i;
const MODEL_SCAFFOLD_QUALIFIER_PATTERN = /\b(small|basic|decent)\b/i;
const MODEL_SCAFFOLD_DIRECT_HINT_PATTERN = /\b(build on|starter area)\b/i;
const WORLD_SCAFFOLD_MIN_STARTER_DIMENSION = 8;
const WORLD_SCAFFOLD_STARTER_CUES = Object.freeze([
  { id: 'starter_area', label: 'starter area', pattern: /\bstarter area\b/i },
  { id: 'build_on', label: 'build on', pattern: /\bbuild on\b/i },
  { id: 'basic_ground_grid', label: 'basic ground grid', pattern: /\bbasic ground grid\b/i },
  { id: 'first_village', label: 'first village', pattern: /\bfirst village\b/i },
]);
const WORLD_SCAFFOLD_NON_MATERIAL_WORDS = new Set([
  'basic',
  'big',
  'decent',
  'first',
  'huge',
  'infinite',
  'small',
  'starter',
  'something',
]);

function normalizeGridCoordinate(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function normalizeGridSize(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(1, Math.round(numeric)) : 1;
}

function getCoordinateSource(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (value.position && typeof value.position === 'object') {
    return value.position;
  }
  return value;
}

function createTileAddress(input = 0, y = 0) {
  const source = getCoordinateSource(input);
  return {
    x: normalizeGridCoordinate(source?.x ?? input),
    y: normalizeGridCoordinate(source?.y ?? y),
  };
}

function createCellAddress(input = 0, y = 0, z = GROUND_Z) {
  const source = getCoordinateSource(input);
  return {
    x: normalizeGridCoordinate(source?.x ?? input),
    y: normalizeGridCoordinate(source?.y ?? y),
    z: normalizeGridCoordinate(source?.z ?? z),
  };
}

function createWorldPosition(input = 0, y = 0, z = GROUND_Z) {
  return createCellAddress(input, y, z);
}

function getTileKey(input) {
  const tile = createTileAddress(input);
  return `${tile.x},${tile.y}`;
}

function getCellKey(input) {
  const cell = createCellAddress(input);
  return `${cell.x},${cell.y},${cell.z}`;
}

function createField(width, height, defaultValue = 0) {
  const normalizedWidth = normalizeGridSize(width);
  const normalizedHeight = normalizeGridSize(height);
  return {
    width: normalizedWidth,
    height: normalizedHeight,
    values: Array.from({ length: normalizedHeight }, () => Array.from({ length: normalizedWidth }, () => defaultValue)),
  };
}

function createLayeredField(width, height, layers = [GROUND_Z], defaultValue = 0) {
  const normalizedWidth = normalizeGridSize(width);
  const normalizedHeight = normalizeGridSize(height);
  const layerOrder = [...new Set((layers || [GROUND_Z]).map((layer) => normalizeGridCoordinate(layer)))];
  return {
    width: normalizedWidth,
    height: normalizedHeight,
    layers: Object.fromEntries(layerOrder.map((layer) => [String(layer), createField(normalizedWidth, normalizedHeight, defaultValue)])),
    layerOrder,
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

function deriveCoarseFieldLayer(baseValues = [], width = 1, height = 1, factor = 2, fallbackValue = 'grass') {
  const normalizedWidth = normalizeGridSize(width);
  const normalizedHeight = normalizeGridSize(height);
  const resolution = normalizeGridSize(factor);
  const coarseWidth = Math.max(1, Math.ceil(normalizedWidth / resolution));
  const coarseHeight = Math.max(1, Math.ceil(normalizedHeight / resolution));
  const values = Array.from({ length: coarseHeight }, (_, coarseY) => Array.from({ length: coarseWidth }, (_, coarseX) => {
    const samples = [];
    for (let y = coarseY * resolution; y < Math.min(normalizedHeight, (coarseY + 1) * resolution); y += 1) {
      for (let x = coarseX * resolution; x < Math.min(normalizedWidth, (coarseX + 1) * resolution); x += 1) {
        samples.push(baseValues?.[y]?.[x]);
      }
    }
    return deriveMajorityValue(samples, fallbackValue);
  }));

  return {
    kind: 'field-layer',
    role: 'coarse',
    resolution,
    width: coarseWidth,
    height: coarseHeight,
    aggregateStrategy: 'majority',
    fallbackValue,
    values,
  };
}

function buildSpatialFieldBundle(width, height, material = 'grass') {
  const baseWidth = normalizeGridSize(width);
  const baseHeight = normalizeGridSize(height);
  const baseLayer = {
    kind: 'field-layer',
    role: 'base',
    resolution: 1,
    width: baseWidth,
    height: baseHeight,
    aggregateStrategy: 'identity',
    fallbackValue: material,
    values: createField(baseWidth, baseHeight, material).values,
  };
  const coarseLayer = deriveCoarseFieldLayer(baseLayer.values, baseWidth, baseHeight, 2, material);

  return {
    kind: 'spatial-field-bundle',
    version: 'v1',
    aggregateStrategy: 'majority',
    baseLayerKey: '0',
    coarseLayerKey: '1',
    layerOrder: ['0', '1'],
    layers: {
      '0': baseLayer,
      '1': coarseLayer,
    },
    baseLayer,
    coarseLayer,
    summary: `Field base ${baseWidth}x${baseHeight} @1x | coarse ${coarseLayer.width}x${coarseLayer.height} @2x`,
  };
}

function normalizeMaterial(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isSupportedMaterial(value = '') {
  return WORLD_SCAFFOLD_SUPPORTED_MATERIALS.includes(normalizeMaterial(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFiniteCoordinate(value) {
  return Number.isFinite(Number(value));
}

function hasValidPositionCoordinates(position = null) {
  if (!isPlainObject(position)) return false;
  if (!isFiniteCoordinate(position.x) || !isFiniteCoordinate(position.y)) return false;
  if (position.z !== undefined && !isFiniteCoordinate(position.z)) return false;
  return true;
}

function summarizeWorldScaffold({ width = null, height = null, material = '' } = {}) {
  const parts = [];
  if (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) {
    parts.push(`${width}x${height}`);
  }
  if (material) {
    parts.push(normalizeMaterial(material));
  }
  parts.push('grid');
  return parts.join(' ');
}

function extractDimensions(text = '') {
  const match = String(text || '').match(GRID_DIMENSION_PATTERN);
  if (!match) {
    return {
      width: null,
      height: null,
      syntax: null,
      matchedText: '',
    };
  }
  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
    syntax: String(match[0]).includes('by') ? 'by' : 'x',
    matchedText: match[0],
  };
}

function extractMaterial(text = '') {
  const normalizedText = String(text || '').toLowerCase();
  if (!normalizedText) {
    return {
      material: '',
      source: null,
      matchedText: '',
      usedLegacyAlias: false,
      usedGroundDescriptor: false,
    };
  }
  if (LEGACY_GRASS_GROUND_PATTERN.test(normalizedText)) {
    return {
      material: 'grass',
      source: 'legacy_grass_ground',
      matchedText: 'grass/ground',
      usedLegacyAlias: true,
      usedGroundDescriptor: true,
    };
  }
  const match = normalizedText.match(MATERIAL_BEFORE_GRID_PATTERN);
  if (!match) {
    return {
      material: '',
      source: null,
      matchedText: '',
      usedLegacyAlias: false,
      usedGroundDescriptor: false,
    };
  }
  const normalizedCandidate = normalizeMaterial(match[1]);
  if (WORLD_SCAFFOLD_NON_MATERIAL_WORDS.has(normalizedCandidate)) {
    return {
      material: '',
      source: 'non_material_qualifier',
      matchedText: match[0],
      usedLegacyAlias: false,
      usedGroundDescriptor: /\bground\b/.test(match[0]),
    };
  }
  if (normalizedCandidate === 'ground') {
    return {
      material: '',
      source: 'ground_descriptor',
      matchedText: match[0],
      usedLegacyAlias: false,
      usedGroundDescriptor: true,
    };
  }
  return {
    material: normalizedCandidate,
    source: 'grid_descriptor',
    matchedText: match[0],
    usedLegacyAlias: false,
    usedGroundDescriptor: /\bground\b/.test(match[0]),
  };
}

function extractPosition(text = '') {
  const match = String(text || '').match(POSITION_PATTERN);
  if (!match) {
    return {
      position: createWorldPosition(DEFAULT_WORLD_SCAFFOLD_ORIGIN),
      source: 'default',
      matchedText: '',
      usedDefaultPosition: true,
    };
  }
  return {
    position: createWorldPosition({
      x: Number.parseInt(match[1], 10),
      y: Number.parseInt(match[2], 10),
      z: match[3] == null ? GROUND_Z : Number.parseInt(match[3], 10),
    }),
    source: 'explicit',
    matchedText: match[0],
    usedDefaultPosition: false,
  };
}

function looksLikeWorldScaffoldPrompt(text = '') {
  const normalizedText = String(text || '').trim().toLowerCase();
  if (!normalizedText || !GRID_KEYWORD_PATTERN.test(normalizedText)) {
    return false;
  }
  const dimensions = extractDimensions(normalizedText);
  const material = extractMaterial(normalizedText);
  return Boolean(
    (Number.isInteger(dimensions.width) && Number.isInteger(dimensions.height))
    || material.material
    || /\bground\b/.test(normalizedText)
  );
}

function detectPotentialWorldScaffoldPrompt(text = '') {
  const normalizedText = String(text || '').trim().toLowerCase();
  if (!normalizedText || /\bmaterial(s)?\b/.test(normalizedText)) {
    return false;
  }
  if (looksLikeWorldScaffoldPrompt(normalizedText)) {
    return true;
  }
  const mentionsTerrain = MODEL_SCAFFOLD_TERRAIN_PATTERN.test(normalizedText);
  const mentionsStructure = MODEL_SCAFFOLD_NOUN_PATTERN.test(normalizedText);
  const mentionsAction = MODEL_SCAFFOLD_ACTION_PATTERN.test(normalizedText);
  const mentionsContext = MODEL_SCAFFOLD_CONTEXT_PATTERN.test(normalizedText);
  const mentionsQualifier = MODEL_SCAFFOLD_QUALIFIER_PATTERN.test(normalizedText);
  if (MODEL_SCAFFOLD_DIRECT_HINT_PATTERN.test(normalizedText)) {
    return true;
  }
  if (mentionsStructure && mentionsQualifier) {
    return true;
  }
  return mentionsTerrain && ((mentionsStructure && mentionsAction) || (mentionsStructure && mentionsContext));
}

function shouldAttemptModelScaffoldInterpretation(text = '', intent = null) {
  if (!detectPotentialWorldScaffoldPrompt(text)) {
    return false;
  }
  if (!intent) {
    return true;
  }
  if (intent.validation?.ok) {
    return false;
  }
  return intent.validation?.code === 'missing_dimensions' || intent.validation?.code === 'missing_material';
}

function buildWorldScaffoldValidation({
  type = 'world_scaffold',
  shape = 'grid',
  width = null,
  height = null,
  material = '',
  position = DEFAULT_WORLD_SCAFFOLD_ORIGIN,
  positionProvided = true,
} = {}) {
  const issues = [];

  if (type && String(type).trim() !== 'world_scaffold') {
    issues.push({
      field: 'type',
      code: 'unsupported_type',
      message: `Unsupported scaffold type "${type}".`,
    });
  }

  if (shape && String(shape).trim().toLowerCase() !== 'grid') {
    issues.push({
      field: 'shape',
      code: 'unsupported_shape',
      message: `Unsupported scaffold shape "${shape}".`,
    });
  }

  if (positionProvided && !hasValidPositionCoordinates(position)) {
    issues.push({
      field: 'position',
      code: 'invalid_position',
      message: 'Position must include numeric x, y, and optional z coordinates.',
    });
  }

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    issues.push({
      field: 'dimensions',
      code: 'missing_dimensions',
      message: 'Could not parse grid dimensions.',
    });
  } else {
    if (width < 1 || height < 1) {
      issues.push({
        field: 'dimensions',
        code: 'non_positive_dimensions',
        message: 'Grid dimensions must be positive integers.',
      });
    }
    if (width > WORLD_SCAFFOLD_MAX_DIMENSION || height > WORLD_SCAFFOLD_MAX_DIMENSION) {
      issues.push({
        field: 'dimensions',
        code: 'dimensions_out_of_bounds',
        message: `Grid dimensions must be ${WORLD_SCAFFOLD_MAX_DIMENSION}x${WORLD_SCAFFOLD_MAX_DIMENSION} or smaller.`,
      });
    }
  }

  if (!material) {
    issues.push({
      field: 'material',
      code: 'missing_material',
      message: 'Could not parse scaffold material.',
    });
  } else if (!isSupportedMaterial(material)) {
    issues.push({
      field: 'material',
      code: 'unsupported_material',
      message: `Unsupported scaffold material "${material}". Supported materials: ${WORLD_SCAFFOLD_SUPPORTED_MATERIALS.join(', ')}.`,
    });
  }

  return {
    ok: issues.length === 0,
    code: issues[0]?.code || 'ok',
    reason: issues[0]?.message || '',
    issues,
    maxDimension: WORLD_SCAFFOLD_MAX_DIMENSION,
    supportedMaterials: [...WORLD_SCAFFOLD_SUPPORTED_MATERIALS],
  };
}

function buildWorldScaffoldConfidence({ validation, dimensions, material, usedLegacyAlias = false, usedGroundDescriptor = false } = {}) {
  if (!validation?.ok) {
    return {
      label: 'low',
      score: 0.32,
      reason: validation?.reason || 'Scaffold parsing is incomplete.',
    };
  }
  const usedVariantSyntax = dimensions?.syntax === 'by' || usedLegacyAlias || usedGroundDescriptor;
  if (usedVariantSyntax) {
    return {
      label: 'medium',
      score: 0.74,
      reason: `Parsed a supported ${dimensions?.syntax === 'by' ? '"by"' : 'variant'} scaffold phrase for ${material}.`,
    };
  }
  return {
    label: 'high',
    score: 0.96,
    reason: 'Parsed dimensions, material, and grid shape directly.',
  };
}

function normalizeWorldScaffoldIntent(text = '') {
  const rawText = String(text || '').trim();
  const normalizedText = rawText.toLowerCase();
  if (!normalizedText || !looksLikeWorldScaffoldPrompt(normalizedText)) {
    return null;
  }

  const dimensions = extractDimensions(normalizedText);
  const materialInfo = extractMaterial(normalizedText);
  const positionInfo = extractPosition(normalizedText);
  const validation = buildWorldScaffoldValidation({
    type: 'world_scaffold',
    shape: 'grid',
    width: dimensions.width,
    height: dimensions.height,
    material: materialInfo.material,
    position: positionInfo.position,
    positionProvided: true,
  });
  const material = validation.ok ? normalizeMaterial(materialInfo.material) : materialInfo.material;
  const width = Number.isInteger(dimensions.width) ? dimensions.width : null;
  const height = Number.isInteger(dimensions.height) ? dimensions.height : null;
  const position = positionInfo.position;
  const summary = summarizeWorldScaffold({ width, height, material });

  return {
    type: 'world_scaffold',
    shape: 'grid',
    kind: WORLD_SCAFFOLD_KIND,
    summary,
    rawInput: rawText,
    requestText: rawText,
    width,
    height,
    material,
    position,
    origin: createWorldPosition(position),
    tileType: material || null,
    surface: 'ground',
    totalCells: Number.isInteger(width) && Number.isInteger(height) ? width * height : 0,
    cellSize: DEFAULT_WORLD_SCAFFOLD_CELL_SIZE,
    viewModes: ['2d', '2.5d'],
    source: 'deterministic',
    parse: {
      dimensionSyntax: dimensions.syntax,
      dimensionText: dimensions.matchedText,
      materialSource: materialInfo.source,
      materialText: materialInfo.matchedText,
      usedLegacyAlias: materialInfo.usedLegacyAlias,
      usedGroundDescriptor: materialInfo.usedGroundDescriptor,
      positionSource: positionInfo.source,
      positionText: positionInfo.matchedText,
      usedDefaultPosition: positionInfo.usedDefaultPosition,
    },
    validation,
    confidence: buildWorldScaffoldConfidence({
      validation,
      dimensions,
      material,
      usedLegacyAlias: materialInfo.usedLegacyAlias,
      usedGroundDescriptor: materialInfo.usedGroundDescriptor,
    }),
  };
}

function parseWorldScaffoldIntent(text = '') {
  return normalizeWorldScaffoldIntent(text);
}

function normalizeWorldScaffoldCandidate(candidate = null, { requestText = '', source = 'model-assisted' } = {}) {
  const rawCandidate = isPlainObject(candidate) ? candidate : null;
  const type = rawCandidate?.type === undefined || rawCandidate?.type === null
    ? 'world_scaffold'
    : String(rawCandidate.type).trim();
  const shape = rawCandidate?.shape === undefined || rawCandidate?.shape === null
    ? 'grid'
    : String(rawCandidate.shape).trim().toLowerCase();
  const width = Number.isInteger(Number(rawCandidate?.width)) ? Number(rawCandidate.width) : null;
  const height = Number.isInteger(Number(rawCandidate?.height)) ? Number(rawCandidate.height) : null;
  const material = normalizeMaterial(rawCandidate?.material || '');
  const positionProvided = rawCandidate?.position !== undefined;
  const position = positionProvided && hasValidPositionCoordinates(rawCandidate?.position)
    ? createWorldPosition(rawCandidate.position)
    : createWorldPosition(DEFAULT_WORLD_SCAFFOLD_ORIGIN);
  const validation = rawCandidate
    ? buildWorldScaffoldValidation({
        type,
        shape,
        width,
        height,
        material,
        position: rawCandidate.position,
        positionProvided,
      })
    : {
        ok: false,
        code: 'malformed_candidate',
        reason: 'Model scaffold candidate must be an object.',
        issues: [{
          field: 'candidate',
          code: 'malformed_candidate',
          message: 'Model scaffold candidate must be an object.',
        }],
        maxDimension: WORLD_SCAFFOLD_MAX_DIMENSION,
        supportedMaterials: [...WORLD_SCAFFOLD_SUPPORTED_MATERIALS],
      };
  return {
    type,
    shape,
    kind: WORLD_SCAFFOLD_KIND,
    summary: summarizeWorldScaffold({ width, height, material }),
    rawInput: String(requestText || ''),
    requestText: String(requestText || ''),
    width,
    height,
    material,
    position,
    origin: createWorldPosition(position),
    tileType: material || null,
    surface: 'ground',
    totalCells: Number.isInteger(width) && Number.isInteger(height) ? width * height : 0,
    cellSize: DEFAULT_WORLD_SCAFFOLD_CELL_SIZE,
    viewModes: ['2d', '2.5d'],
    source,
    parse: {
      source,
      candidateProvided: Boolean(rawCandidate),
      usedDefaultPosition: !positionProvided || !hasValidPositionCoordinates(rawCandidate?.position),
    },
    validation,
    notes: rawCandidate?.notes || '',
    alternatives: Array.isArray(rawCandidate?.alternatives) ? rawCandidate.alternatives : [],
    confidence: null,
    rawCandidate,
  };
}

function rebuildWorldScaffoldIntent(intent = {}, overrides = {}) {
  const rebuilt = normalizeWorldScaffoldCandidate({
    type: overrides.type ?? intent.type ?? 'world_scaffold',
    shape: overrides.shape ?? intent.shape ?? 'grid',
    width: overrides.width ?? intent.width ?? null,
    height: overrides.height ?? intent.height ?? null,
    material: overrides.material ?? intent.material ?? intent.tileType ?? '',
    position: overrides.position ?? intent.position ?? intent.origin ?? DEFAULT_WORLD_SCAFFOLD_ORIGIN,
    notes: overrides.notes ?? intent.notes ?? '',
    alternatives: overrides.alternatives ?? intent.alternatives ?? [],
  }, {
    requestText: overrides.requestText ?? intent.requestText ?? '',
    source: overrides.source ?? intent.source ?? 'deterministic',
  });
  return {
    ...intent,
    ...rebuilt,
    source: overrides.source ?? intent.source ?? rebuilt.source,
    parse: {
      ...(intent.parse && typeof intent.parse === 'object' ? intent.parse : {}),
      ...(rebuilt.parse && typeof rebuilt.parse === 'object' ? rebuilt.parse : {}),
      ...(overrides.parse && typeof overrides.parse === 'object' ? overrides.parse : {}),
    },
    confidence: overrides.confidence !== undefined ? overrides.confidence : (intent.confidence ?? rebuilt.confidence),
    rawCandidate: overrides.rawCandidate !== undefined ? overrides.rawCandidate : (intent.rawCandidate ?? rebuilt.rawCandidate),
  };
}

function collectWorldScaffoldEvaluationCues(text = '') {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return [];
  return WORLD_SCAFFOLD_STARTER_CUES
    .filter((entry) => entry.pattern.test(normalizedText))
    .map((entry) => entry.label);
}

function createWorldScaffoldEvaluationScorecard({
  validity = 'fail',
  suitability = 'fail',
  sizeAdequacy = 'fail',
  materialSupport = 'fail',
  shapeSupport = 'fail',
  positionSanity = 'fail',
  correctionApplied = false,
  correctionReason = '',
  interpretationSource = 'unknown',
  acceptedForMutationGeneration = false,
} = {}) {
  return {
    validity,
    suitability,
    sizeAdequacy,
    materialSupport,
    shapeSupport,
    positionSanity,
    correctionApplied: Boolean(correctionApplied),
    correctionReason: String(correctionReason || '').trim() || '',
    interpretationSource: interpretationSource || 'unknown',
    acceptedForMutationGeneration: Boolean(acceptedForMutationGeneration),
  };
}

function evaluateWorldScaffoldCandidate(candidate = null, { requestText = '', interpretationSource = 'unknown' } = {}) {
  if (!candidate || typeof candidate !== 'object') {
    return {
      originalCandidate: null,
      correctedCandidate: null,
      finalCandidate: null,
      cues: collectWorldScaffoldEvaluationCues(requestText),
      accepted: false,
      reason: 'No scaffold candidate to evaluate.',
      scorecard: createWorldScaffoldEvaluationScorecard({
        interpretationSource,
      }),
    };
  }

  const originalCandidate = rebuildWorldScaffoldIntent(candidate, {
    source: candidate.source || interpretationSource,
  });
  const cues = collectWorldScaffoldEvaluationCues(requestText || originalCandidate.requestText);
  const requiresStarterMinimum = cues.length > 0;
  const starterMinimum = requiresStarterMinimum ? WORLD_SCAFFOLD_MIN_STARTER_DIMENSION : 1;
  const validity = originalCandidate.validation?.ok ? 'pass' : 'fail';
  const materialSupport = isSupportedMaterial(originalCandidate.material) ? 'pass' : 'fail';
  const shapeSupport = String(originalCandidate.shape || '').trim().toLowerCase() === 'grid' ? 'pass' : 'fail';
  const positionSanity = hasValidPositionCoordinates(originalCandidate.position || originalCandidate.origin) ? 'pass' : 'fail';

  let correctedCandidate = null;
  let correctionReason = '';
  let sizeAdequacy = 'pass';

  if (!originalCandidate.validation?.ok) {
    sizeAdequacy = originalCandidate.validation?.code === 'dimensions_out_of_bounds'
      || originalCandidate.validation?.code === 'missing_dimensions'
      || originalCandidate.validation?.code === 'non_positive_dimensions'
      ? 'fail'
      : 'pass';
  } else if (requiresStarterMinimum && (Number(originalCandidate.width || 0) < starterMinimum || Number(originalCandidate.height || 0) < starterMinimum)) {
    correctedCandidate = rebuildWorldScaffoldIntent(originalCandidate, {
      width: Math.max(starterMinimum, Number(originalCandidate.width || 0)),
      height: Math.max(starterMinimum, Number(originalCandidate.height || 0)),
      parse: {
        evaluationCorrected: true,
        evaluationCorrection: `minimum starter grid size ${starterMinimum}x${starterMinimum}`,
      },
    });
    correctionReason = `Raised undersized scaffold to the minimum starter grid size of ${starterMinimum}x${starterMinimum}.`;
    sizeAdequacy = 'warn';
  }

  const finalCandidate = correctedCandidate || originalCandidate;
  const suitability = !finalCandidate.validation?.ok || materialSupport === 'fail' || shapeSupport === 'fail' || positionSanity === 'fail'
    ? 'fail'
    : (correctedCandidate ? 'warn' : 'pass');
  const acceptedForMutationGeneration = Boolean(finalCandidate.validation?.ok && suitability !== 'fail');

  return {
    originalCandidate,
    correctedCandidate,
    finalCandidate,
    cues,
    accepted: acceptedForMutationGeneration,
    reason: acceptedForMutationGeneration ? '' : (finalCandidate.validation?.reason || 'Scaffold candidate was not suitable.'),
    scorecard: createWorldScaffoldEvaluationScorecard({
      validity,
      suitability,
      sizeAdequacy,
      materialSupport,
      shapeSupport,
      positionSanity,
      correctionApplied: Boolean(correctedCandidate),
      correctionReason,
      interpretationSource,
      acceptedForMutationGeneration,
    }),
  };
}

function createWorldScaffold(intent = {}) {
  const width = normalizeGridSize(intent.width || 1);
  const height = normalizeGridSize(intent.height || 1);
  const material = normalizeMaterial(intent.material || intent.tileType || 'grass') || 'grass';
  const surface = normalizeMaterial(intent.surface || 'ground') || 'ground';
  return {
    kind: WORLD_SCAFFOLD_KIND,
    version: 'v1',
    summary: summarizeWorldScaffold({ width, height, material }),
    dimensions: {
      width,
      height,
    },
    totalCells: width * height,
    origin: createWorldPosition(intent.position || intent.origin || DEFAULT_WORLD_SCAFFOLD_ORIGIN),
    cellSize: normalizeGridSize(intent.cellSize || DEFAULT_WORLD_SCAFFOLD_CELL_SIZE),
    material,
    tileType: material,
    surface,
    field: buildSpatialFieldBundle(width, height, material),
  };
}

function isWorldScaffold(value = {}) {
  const scaffold = value && typeof value === 'object'
    ? (value.kind ? value : value?.metadata?.scaffold)
    : null;
  return Boolean(
    scaffold
    && scaffold.kind === WORLD_SCAFFOLD_KIND
    && Number.isFinite(Number(scaffold?.dimensions?.width))
    && Number.isFinite(Number(scaffold?.dimensions?.height))
    && scaffold?.field?.layers
  );
}

function isWorldScaffoldNode(node = {}) {
  return isWorldScaffold(node?.metadata?.scaffold);
}

function findWorldScaffoldNode(graphs = {}) {
  const nodes = graphs?.world?.nodes || [];
  const node = nodes.find((entry) => entry?.id === WORLD_SCAFFOLD_NODE_ID) || nodes.find((entry) => isWorldScaffoldNode(entry)) || null;
  return node ? { layer: 'world', node } : null;
}

function normalizeScaffoldLabels(tileType = 'grass', surface = 'ground') {
  return ['world-scaffold', 'grid', normalizeMaterial(tileType) || 'grass', normalizeMaterial(surface) || 'ground'];
}

function buildWorldScaffoldNode(intent = {}, existingNode = null) {
  const scaffold = createWorldScaffold(intent);
  const existingMetadata = existingNode?.metadata && typeof existingNode.metadata === 'object'
    ? { ...existingNode.metadata }
    : {};
  return {
    id: existingNode?.id || WORLD_SCAFFOLD_NODE_ID,
    type: 'gameplay-system',
    content: scaffold.summary,
    position: existingNode?.position && Number.isFinite(Number(existingNode.position.x)) && Number.isFinite(Number(existingNode.position.y))
      ? {
          x: Number(existingNode.position.x),
          y: Number(existingNode.position.y),
        }
      : { ...DEFAULT_WORLD_SCAFFOLD_POSITION },
    connections: Array.isArray(existingNode?.connections) ? [...existingNode.connections] : [],
    metadata: {
      ...existingMetadata,
      graphLayer: 'world',
      role: 'gameplay-system',
      proposalTarget: 'world-structure',
      origin: existingMetadata.origin || 'system_generated',
      labels: normalizeScaffoldLabels(scaffold.tileType, scaffold.surface),
      scaffold,
    },
  };
}

function buildWorldScaffoldMutations(graphs = {}, intent = {}) {
  if (intent?.validation?.ok === false) {
    return [];
  }
  const existing = findWorldScaffoldNode(graphs);
  const nextNode = buildWorldScaffoldNode(intent, existing?.node || null);
  if (existing?.node) {
    return [{
      type: 'modify_node',
      id: existing.node.id,
      patch: {
        content: nextNode.content,
        metadata: nextNode.metadata,
      },
    }];
  }
  return [{
    type: 'create_node',
    layer: 'world',
    node: nextNode,
  }];
}

function buildWorldScaffoldMutationPlan(graphs = {}, intent = {}) {
  if (!intent || typeof intent !== 'object') {
    return {
      ok: false,
      deterministic: true,
      mutationCount: 0,
      reason: 'World scaffold intent is missing.',
      mutations: [],
      mode: 'none',
      targetNodeId: null,
    };
  }
  if (intent.validation?.ok === false) {
    return {
      ok: false,
      deterministic: true,
      mutationCount: 0,
      reason: intent.validation.reason || 'World scaffold intent is invalid.',
      mutations: [],
      mode: 'none',
      targetNodeId: findWorldScaffoldNode(graphs)?.node?.id || null,
    };
  }
  const existing = findWorldScaffoldNode(graphs);
  const mutations = buildWorldScaffoldMutations(graphs, intent);
  return {
    ok: true,
    deterministic: true,
    mutationCount: mutations.length,
    reason: '',
    mutations,
    mode: existing?.node ? 'modify_node' : 'create_node',
    targetNodeId: existing?.node?.id || WORLD_SCAFFOLD_NODE_ID,
  };
}

module.exports = {
  GROUND_Z,
  WORLD_SCAFFOLD_KIND,
  WORLD_SCAFFOLD_NODE_ID,
  WORLD_SCAFFOLD_MAX_DIMENSION,
  WORLD_SCAFFOLD_SUPPORTED_MATERIALS,
  WORLD_SCAFFOLD_METADATA_KEYS,
  DEFAULT_WORLD_SCAFFOLD_CELL_SIZE,
  createWorldPosition,
  getTileKey,
  getCellKey,
  createField,
  createLayeredField,
  buildSpatialFieldBundle,
  summarizeWorldScaffold,
  detectPotentialWorldScaffoldPrompt,
  shouldAttemptModelScaffoldInterpretation,
  normalizeWorldScaffoldIntent,
  normalizeWorldScaffoldCandidate,
  collectWorldScaffoldEvaluationCues,
  evaluateWorldScaffoldCandidate,
  parseWorldScaffoldIntent,
  createWorldScaffold,
  isWorldScaffold,
  isWorldScaffoldNode,
  findWorldScaffoldNode,
  buildWorldScaffoldNode,
  buildWorldScaffoldMutations,
  buildWorldScaffoldMutationPlan,
};
