import test from 'node:test';
import assert from 'node:assert/strict';

import { createConversationalParserStub } from '../src/ai/agentStub.js';
import {
  createRuntimeIntentFromTranslation,
  translateIntentPrompt,
  upsertTranslatedIntent
} from '../src/ai/intentTranslator.js';

const map = { width: 25, height: 18 };
const parser = createConversationalParserStub();
const existingIntents = [
  {
    id: 'demo-defensibility-east-ridge',
    type: 'defensibility',
    position: { x: 17, y: 8, z: 0 },
    radius: 4,
    weight: 1
  },
  {
    id: 'demo-flow-east-opening',
    type: 'flow',
    position: { x: 18, y: 8, z: 0 },
    radius: 3,
    weight: 1.2
  },
  {
    id: 'demo-threat-east-ridge',
    type: 'threat',
    position: { x: 16, y: 8, z: 0 },
    radius: 5,
    weight: 0.9
  }
];

test('translates a flow-oriented prompt into a validated intent object', () => {
  const translation = translateIntentPrompt({
    text: 'make this east opening more open',
    parser,
    map,
    existingIntents,
    selectedIntent: existingIntents[1]
  });

  assert.equal(translation.status, 'ready');
  assert.equal(translation.source, 'stub-heuristic');
  assert.deepEqual(translation.translatedIntent, {
    id: 'nl-flow-east-opening',
    label: 'east opening',
    type: 'flow',
    position: { x: 18, y: 8, z: 0 },
    radius: 3,
    weight: 1.2
  });
});

test('fails safely when the prompt does not map to a supported intent request', () => {
  const translation = translateIntentPrompt({
    text: 'make it better somehow',
    parser,
    map,
    existingIntents,
    selectedIntent: null
  });

  assert.equal(translation.status, 'error');
  assert.match(translation.error, /supported intent type/i);
});

test('upserts a translated intent through the existing sim schema', () => {
  const translation = translateIntentPrompt({
    text: 'make the ridge area more defensible',
    parser,
    map,
    existingIntents,
    selectedIntent: existingIntents[0]
  });

  assert.equal(translation.status, 'ready');

  const result = upsertTranslatedIntent(existingIntents, translation.translatedIntent);
  const runtimeIntent = createRuntimeIntentFromTranslation(translation.translatedIntent);

  assert.equal(result.mode, 'created');
  assert.equal(runtimeIntent.id, 'nl-defensibility-east-ridge');
  assert.equal(runtimeIntent.type, 'defensibility');
  assert.deepEqual(runtimeIntent.position, { x: 17, y: 8, z: 0 });
  assert.equal(runtimeIntent.radius, 4);
  assert.equal(runtimeIntent.weight, 1);
});
