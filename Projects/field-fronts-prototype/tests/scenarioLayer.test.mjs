import assert from 'node:assert/strict';
import { createFirstNightMap, createSeededMap } from '../src/world/mapGenerator.js';
import { deserializeMap, serializeMap } from '../src/world/mapModel.js';
import { COMMANDER_AUTHORITY_CAMERA_CONTRACT, SCENARIO_CAMERA_MODES, SCENARIO_LAYER_VERSION, createScenarioLayerForMap, normaliseScenarioCameraRig, normaliseScenarioLayer, summarizeScenarioLayer, updateScenarioCameraRig } from '../src/world/scenarioLayer.js';

function stripVolatile(layer) {
  return {
    ...layer,
    generatedAt: null
  };
}

export function run() {
  const map = createSeededMap({ seed: 'qa-scenario-001', preset: 'frontier_2k', scenarioPreset: 'black_sky_arrival' });
  const layer = map.scenario.scenarioLayer;
  assert.equal(layer.contract, SCENARIO_LAYER_VERSION);
  assert.equal(layer.authoringLayer, 'above-map-maker');
  assert.ok(layer.storyBeats.length >= 4, 'scenario layer should create story beats');
  assert.ok(layer.locations.length >= 4, 'scenario layer should create locations');
  assert.ok(layer.items.length >= 4, 'scenario layer should create items');
  assert.ok(layer.assets.length >= 4, 'scenario layer should create authored ambient assets');
  assert.ok(layer.characters.length >= 3, 'scenario layer should create characters');
  assert.ok(layer.speechBubbles.length >= layer.characters.length, 'characters should have speech/non-verbal bubbles');
  assert.ok(layer.cameraCues.length >= 4, 'scenario layer should include camera cues');
  assert.ok(layer.effects.some((effect) => effect.kind === 'lightning_flash'), 'scenario layer should include storm/lightning effect data');
  assert.equal(layer.cameraRig.mode, SCENARIO_CAMERA_MODES.full_scene.id, 'scenario layer should default to a full-scene 2D camera');
  assert.equal(layer.cameraRig.zoom, 1, 'full scene camera should not zoom by default');

  const repeat = createScenarioLayerForMap(map, { seed: 'fixed-scene-seed', preset: 'silent_ruins' });
  const repeatAgain = createScenarioLayerForMap(map, { seed: 'fixed-scene-seed', preset: 'silent_ruins' });
  assert.deepEqual(stripVolatile(repeat), stripVolatile(repeatAgain));

  const restored = deserializeMap(serializeMap(map));
  const summary = summarizeScenarioLayer(restored.scenario.scenarioLayer);
  assert.equal(summary.present, true);
  assert.equal(summary.contract, SCENARIO_LAYER_VERSION);
  assert.equal(summary.storyBeats, layer.storyBeats.length);
  assert.equal(summary.cameraCues, layer.cameraCues.length);
  assert.equal(summary.cameraRig.mode, 'full_scene');
  const focused = updateScenarioCameraRig(restored.scenario.scenarioLayer, { mode: 'selected_point', point: { x: 12.4, y: 8.6 }, zoom: 2.5 });
  assert.equal(focused.cameraRig.mode, 'selected_point');
  assert.deepEqual(focused.cameraRig.point, { x: 12, y: 9 });
  assert.equal(focused.cameraRig.zoom, 2.5);
  const invalid = normaliseScenarioCameraRig({ mode: 'absolute_madness', zoom: 99 });
  assert.equal(invalid.mode, 'full_scene');
  assert.equal(invalid.zoom, 1);
  assert.ok(restored.scenario.scenarioLayer.notes.includes('does not alter pathfinding')); 

  const opening = createFirstNightMap({ seed: 'qa-first-night-layer' });
  const openingLayer = opening.scenario.scenarioLayer;
  assert.equal(openingLayer.preset, 'first_night');
  assert.equal(openingLayer.type, 'opening_survival_tutorial');
  assert.equal(openingLayer.biomeTheme, 'naturalistic_nomadic_wilderness');
  assert.equal(openingLayer.techLevel, 'tribal_nomadic');
  assert.equal(openingLayer.cameraRig.mode, SCENARIO_CAMERA_MODES.commander_follow_tactical_leash.id);
  assert.equal(openingLayer.cameraRig.followEntityId, 'leader_player_01');
  assert.equal(openingLayer.cameraRig.fogOfWarMode, 'commander_los');
  assert.ok(openingLayer.cameraRig.detailRadiusTiles < openingLayer.cameraRig.farDetailRadiusTiles);
  const legacyOpeningCamera = normaliseScenarioLayer({ ...openingLayer, cameraAuthorityContract: null, cameraRig: { mode: 'full_scene', zoom: 1 } });
  assert.equal(legacyOpeningCamera.cameraRig.mode, 'commander_follow_tactical_leash', 'persisted opening maps should migrate once to commander-local camera authority');
  const editedOpeningCamera = normaliseScenarioLayer({ ...openingLayer, cameraAuthorityContract: COMMANDER_AUTHORITY_CAMERA_CONTRACT, cameraRig: { mode: 'full_scene', zoom: 1 } });
  assert.equal(editedOpeningCamera.cameraRig.mode, 'full_scene', 'camera edits made after the authority contract exists should be preserved');
  assert.equal(openingLayer.shelterNodes.length, 12);
  assert.ok(openingLayer.locations.some((location) => location.kind === 'final_shelter'));
  assert.ok(openingLayer.storyBeats.some((beat) => beat.type === 'light_risk_instruction'));

  const worldContent = JSON.stringify({
    metadata: opening.scenario.metadata,
    sections: opening.scenario.sections,
    shelterNodes: openingLayer.shelterNodes,
    locations: openingLayer.locations,
    items: openingLayer.items,
    assets: openingLayer.assets,
    characters: openingLayer.characters,
    storyBeats: openingLayer.storyBeats
  });
  const bannedScenery = /\b(farm|barn|fence|road|village|cart|wall|ruin|shrine|watchtower|field|gate|house|hut|tower|masonry|crop|plough|settlement)s?\b/i;
  assert.equal(bannedScenery.test(worldContent), false, `opening world data includes banned scenery language: ${worldContent.match(bannedScenery)?.[0] ?? ''}`);
}
