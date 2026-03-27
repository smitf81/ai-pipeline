import { createDefensibilityIntent, createFlowIntent, createThreatIntent } from './intents.js';
import { createWorldPosition, GROUND_Z } from '../world/coordinates.js';

export const TRANSLATABLE_INTENT_TYPES = ['defensibility', 'flow', 'threat'];

const DEFAULT_RADIUS_BY_TYPE = {
  defensibility: 4,
  flow: 3,
  threat: 5
};

const DEFAULT_WEIGHT_BY_TYPE = {
  defensibility: 1,
  flow: 1.2,
  threat: 0.9
};

const MAX_INTENT_WEIGHT = 2;
const MIN_INTENT_WEIGHT = 0.1;

export function createIntentTranslationState() {
  return {
    prompt: '',
    status: 'idle',
    source: 'none',
    translatedIntent: null,
    error: '',
    appliedIntentId: null
  };
}

export function translateIntentPrompt({
  text,
  parser,
  map,
  existingIntents = [],
  selectedIntent = null
}) {
  const prompt = String(text ?? '').trim();
  if (!prompt) {
    return createTranslationFailure({
      prompt,
      error: 'Enter an intent request first.',
      source: 'none'
    });
  }

  const parseResult = parser?.parseNaturalLanguage?.({
    mode: 'intent-translation',
    text: prompt,
    supportedTypes: TRANSLATABLE_INTENT_TYPES,
    context: buildTranslationContext({ map, existingIntents, selectedIntent })
  }) ?? {
    ok: false,
    source: 'none',
    error: 'No conversational parser is available for intent translation.'
  };

  if (!parseResult.ok) {
    return createTranslationFailure({
      prompt,
      error: parseResult.error ?? 'Intent translation failed.',
      source: parseResult.source ?? 'none'
    });
  }

  const validation = validateTranslatedIntent(parseResult.intent, {
    mapWidth: map?.width ?? 0,
    mapHeight: map?.height ?? 0
  });

  if (!validation.ok) {
    return createTranslationFailure({
      prompt,
      error: validation.error,
      source: parseResult.source ?? 'unknown'
    });
  }

  return {
    prompt,
    status: 'ready',
    source: parseResult.source ?? 'unknown',
    translatedIntent: ensureIntentIdentity(validation.intent),
    error: '',
    appliedIntentId: null
  };
}

export function validateTranslatedIntent(candidate, { mapWidth, mapHeight }) {
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, error: 'Translator did not return an intent object.' };
  }

  const type = String(candidate.type ?? '').trim().toLowerCase();
  if (!TRANSLATABLE_INTENT_TYPES.includes(type)) {
    return {
      ok: false,
      error: `Unsupported intent type "${candidate.type ?? ''}". Supported types: ${TRANSLATABLE_INTENT_TYPES.join(', ')}.`
    };
  }

  const x = Number(candidate.position?.x);
  const y = Number(candidate.position?.y);
  const z = Number(candidate.position?.z ?? GROUND_Z);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: 'Translated intent is missing a valid position { x, y }.' };
  }
  if (!Number.isFinite(z)) {
    return { ok: false, error: 'Translated intent is missing a valid z elevation.' };
  }

  const position = createWorldPosition({ x, y, z });
  if (position.x < 0 || position.y < 0 || position.x >= mapWidth || position.y >= mapHeight) {
    return {
      ok: false,
      error: `Translated position (${position.x}, ${position.y}) is outside the current map bounds ${mapWidth}x${mapHeight}.`
    };
  }
  if (position.z < GROUND_Z) {
    return { ok: false, error: 'Translated z elevation cannot be below the current ground plane.' };
  }

  const radiusValue = Number(candidate.radius);
  if (!Number.isFinite(radiusValue)) {
    return { ok: false, error: 'Translated intent is missing a valid radius.' };
  }

  const radius = Math.max(0, Math.round(radiusValue));
  const maxRadius = Math.max(mapWidth, mapHeight);
  if (radius > maxRadius) {
    return {
      ok: false,
      error: `Translated radius ${radius} exceeds the current map limit ${maxRadius}.`
    };
  }

  const weightValue = Number(candidate.weight);
  if (!Number.isFinite(weightValue)) {
    return { ok: false, error: 'Translated intent is missing a valid weight.' };
  }

  const roundedWeight = roundToTenths(weightValue);
  if (roundedWeight < MIN_INTENT_WEIGHT || roundedWeight > MAX_INTENT_WEIGHT) {
    return {
      ok: false,
      error: `Translated weight ${roundedWeight.toFixed(1)} is outside the allowed range ${MIN_INTENT_WEIGHT.toFixed(1)}-${MAX_INTENT_WEIGHT.toFixed(1)}.`
    };
  }

  return {
    ok: true,
    intent: {
      type,
      position,
      radius,
      weight: roundedWeight,
      label: sanitizeLabel(candidate.label),
      id: sanitizeIdentifier(candidate.id)
    }
  };
}

export function createRuntimeIntentFromTranslation(translatedIntent) {
  const config = {
    id: translatedIntent.id,
    x: translatedIntent.position.x,
    y: translatedIntent.position.y,
    radius: translatedIntent.radius,
    weight: translatedIntent.weight
  };

  let runtimeIntent;
  switch (translatedIntent.type) {
    case 'defensibility':
      runtimeIntent = createDefensibilityIntent(config);
      break;
    case 'flow':
      runtimeIntent = createFlowIntent(config);
      break;
    default:
      runtimeIntent = createThreatIntent(config);
      break;
  }

  if (translatedIntent.label) {
    runtimeIntent.label = translatedIntent.label;
  }

  return runtimeIntent;
}

export function upsertTranslatedIntent(existingIntents, translatedIntent) {
  const runtimeIntent = createRuntimeIntentFromTranslation(translatedIntent);
  const index = existingIntents.findIndex((intent) => intent.id === runtimeIntent.id);

  if (index === -1) {
    return {
      mode: 'created',
      runtimeIntent,
      intents: [...existingIntents, runtimeIntent]
    };
  }

  const intents = existingIntents.slice();
  intents[index] = runtimeIntent;
  return {
    mode: 'updated',
    runtimeIntent,
    intents
  };
}

function buildTranslationContext({ map, existingIntents, selectedIntent }) {
  return {
    mapWidth: map?.width ?? 0,
    mapHeight: map?.height ?? 0,
    intents: existingIntents.map(toIntentReference),
    selectedIntent: selectedIntent ? toIntentReference(selectedIntent) : null,
    defaults: {
      radiusByType: { ...DEFAULT_RADIUS_BY_TYPE },
      weightByType: { ...DEFAULT_WEIGHT_BY_TYPE }
    }
  };
}

function toIntentReference(intent) {
  return {
    id: intent.id,
    label: intent.label ?? null,
    type: intent.type,
    position: createWorldPosition(intent.position),
    radius: intent.radius,
    weight: intent.weight
  };
}

function ensureIntentIdentity(intent) {
  return {
    ...intent,
    label: intent.label || createDefaultLabel(intent),
    id: intent.id || buildGeneratedIntentId(intent)
  };
}

function createDefaultLabel(intent) {
  return `${intent.type} ${intent.position.x},${intent.position.y}`;
}

function buildGeneratedIntentId(intent) {
  const slug = slugify(intent.label || `${intent.position.x}-${intent.position.y}`);
  return `nl-${intent.type}-${slug}`;
}

function slugify(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'intent';
}

function sanitizeIdentifier(value) {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }

  return trimmed
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function sanitizeLabel(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed.slice(0, 48) : '';
}

function createTranslationFailure({ prompt, error, source }) {
  return {
    prompt,
    status: 'error',
    source,
    translatedIntent: null,
    error,
    appliedIntentId: null
  };
}

function roundToTenths(value) {
  return Math.round(value * 10) / 10;
}
