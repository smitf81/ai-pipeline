import assert from 'node:assert/strict';
import { createDefaultMap, deserializeMap, serializeMap } from '../src/world/mapModel.js';
import { createFirstNightMap, createSeededMap } from '../src/world/mapGenerator.js';
import { createEditorState, activateScenario } from '../src/editor/editorState.js';
import { CHAPTER_ONE_SCENARIO_ID, SCENARIO_CATALOGUE_VERSION, ensureScenarioCatalogueForMap, getActiveScenario, getScenarioSelectionSlots, selectScenario, summarizeScenarioCatalogue } from '../src/world/scenarioCatalogue.js';

export function run() {
  const defaultMap = ensureScenarioCatalogueForMap(createDefaultMap());
  const slots = getScenarioSelectionSlots(defaultMap);
  assert.equal(slots[0].id, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(slots[0].title, 'The First Night');
  assert.equal(slots[0].available, true);
  assert.equal(slots[0].active, true);
  assert.ok(defaultMap.scenario.scenarioLayer.storyBeats.length >= 4, 'chapter 1 should own a generated scenario layer');

  const summary = summarizeScenarioCatalogue(defaultMap);
  assert.equal(summary.contract, SCENARIO_CATALOGUE_VERSION);
  assert.equal(summary.activeScenarioId, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(summary.availableCount, 1);
  assert.ok(summary.lockedCount >= 1, 'future chapter slots should be present but locked');

  const restored = deserializeMap(serializeMap(defaultMap));
  const restoredSlots = getScenarioSelectionSlots(restored);
  assert.equal(restoredSlots[0].id, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(getActiveScenario(restored).title, 'The First Night');

  const generated = createSeededMap({ seed: 'qa-campaign-001', preset: 'frontier_2k', scenarioPreset: 'silent_ruins' });
  assert.equal(generated.scenario.activeScenarioId, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(generated.scenario.progress.currentScenarioId, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(generated.scenario.scenarios[0].title, 'The First Night');
  assert.equal(generated.scenario.scenarios[0].preset, 'silent_ruins');

  const state = createEditorState(generated);
  const activation = activateScenario(state, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(activation.ok, true);
  assert.equal(state.activeScenarioId, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(state.map.scenario.progress.currentScenarioId, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(state.showScenarioLayer, true);

  const opening = createFirstNightMap({ seed: 'qa-first-night-catalogue' });
  const openingSlots = getScenarioSelectionSlots(opening);
  assert.equal(openingSlots.length, 9);
  assert.equal(openingSlots[0].status, 'unlocked');
  assert.equal(openingSlots[0].type, 'opening_survival_tutorial');
  assert.equal(openingSlots[0].biomeTheme, 'naturalistic_nomadic_wilderness');
  assert.equal(openingSlots[0].techLevel, 'tribal_nomadic');
  assert.deepEqual(openingSlots[0].allowedHumanTech, ['bows', 'arrows', 'torches', 'rudimentary tents', 'hand-carried supplies']);
  assert.equal(openingSlots.slice(1).every((slot) => slot.locked && !slot.available), true);
  assert.deepEqual(openingSlots.slice(1).map((slot) => slot.title), [
    'The Camp Beneath the Trees',
    'Shapes in the Mist',
    'When the Sky Moves',
    'Smoke Through the Valley',
    'Blood at the Nest',
    'The Young One',
    'First Doctrine',
    'The Wider Front'
  ]);
  assert.equal(selectScenario(opening, 'chapter_002').reason, 'scenario-locked');
}
