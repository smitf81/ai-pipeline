import assert from 'node:assert/strict';
import { createInitialGameState, advanceGameTick, deserializeGameState, issueAIBehaviourIntent, issuePlayerMoveCommand, serializeGameState, summarizeGame } from '../src/game/gameModel.js';
import { deserializeMap, serializeMap } from '../src/world/mapModel.js';
import { ensureScenarioCatalogueForMap } from '../src/world/scenarioCatalogue.js';
import {
  SCENE_ENTITY_VERSION,
  createBlankSceneEntity,
  getScenePresentation,
  placeSceneEntity,
  summarizeSceneEntity,
  updateScenePresentation
} from '../src/world/sceneEntity.js';
import { createBlankMap } from '../src/world/mapModel.js';
import { createFirstNightMap } from '../src/world/mapGenerator.js';
import { getShelterNodes, isNomadicSurvivalScene } from '../src/world/sceneEntity.js';
import { WORLD_ASSET_CATEGORIES, WORLD_ASSET_LIFECYCLE_CONTRACT, summarizeWorldAssetLifecycle } from '../src/world/assetLifecycle.js';

export function run() {
  const map = ensureScenarioCatalogueForMap(createBlankMap({ width: 32, height: 24, fill: 'land' }));
  assert.equal(map.scenario.sceneEntity.contract, SCENE_ENTITY_VERSION);
  assert.equal(getScenePresentation(map).ui.build, true, 'legacy/generated chapters keep their existing HUD by default');

  map.scenario.sceneEntity = createBlankSceneEntity();
  const blankPresentation = getScenePresentation(map);
  assert.equal(blankPresentation.ui.build, false);
  assert.equal(blankPresentation.ui.resources, false);
  assert.equal(blankPresentation.visuals.weather, false);

  const blankGame = createInitialGameState(map);
  assert.equal(blankGame.outposts.length, 0, 'blank authored scenes should not secretly seed outposts');
  assert.equal(blankGame.leaders.length, 0, 'blank authored scenes should not secretly seed commanders');
  assert.equal(blankGame.squads.length, 0, 'blank authored scenes should not secretly seed units');
  advanceGameTick(blankGame, map);
  assert.equal(blankGame.tick, 1, 'a blank scene can still be simulated while it is being composed');

  assert.equal(placeSceneEntity(map, 'player_start', { x: 5, y: 8 }).ok, true);
  assert.equal(placeSceneEntity(map, 'neutral_outpost', { x: 16, y: 12 }).ok, true);
  assert.equal(placeSceneEntity(map, 'player_infantry', { x: 7, y: 8 }).ok, true);
  assert.equal(placeSceneEntity(map, 'trigger', { x: 12, y: 11 }).ok, true);
  updateScenePresentation(map, 'ui', 'build', true);

  const authoredGame = createInitialGameState(map);
  assert.equal(authoredGame.outposts.length, 2);
  assert.equal(authoredGame.leaders.length, 1);
  assert.equal(authoredGame.squads.length, 1);
  assert.equal(getScenePresentation(map).ui.build, true);
  assert.equal(summarizeSceneEntity(map).placements.trigger, 1);

  const restored = deserializeMap(serializeMap(map));
  const restoredScene = summarizeSceneEntity(restored);
  assert.equal(restoredScene.template, 'blank');
  assert.equal(restoredScene.authoredEntityCount, 4);
  assert.equal(restoredScene.presentation.visuals.weather, false);
  assert.deepEqual(restored.scenario.starts.player, { x: 5, y: 8 });
  assert.equal(restored.scenario.neutralOutposts.length, 1);

  const openingMap = createFirstNightMap({ seed: 'qa-first-night-scene' });
  const openingGame = createInitialGameState(openingMap);
  const shelterNodes = getShelterNodes(openingMap);
  assert.equal(isNomadicSurvivalScene(openingMap), true);
  assert.equal(getScenePresentation(openingMap).ui.build, false);
  assert.equal(getScenePresentation(openingMap).ui.resources, false);
  assert.equal(openingGame.outposts.length, 0);
  assert.equal(openingGame.structures.length, 0);
  assert.equal(openingGame.builders.length, 0);
  assert.equal(openingGame.leaders[0].name, 'Tribal Leader');
  assert.equal(openingGame.squads.filter((squad) => squad.unitId === 'warrior').length, 2);
  assert.equal(openingGame.squads.filter((squad) => squad.unitId === 'scout').length, 2);
  assert.equal(openingGame.squads.find((squad) => squad.unitId === 'survivors').survivorCount, 5);
  assert.equal(openingGame.squads.find((squad) => squad.unitId === 'wounded_survivor').combat.enabled, false);
  assert.equal(openingGame.leaders[0].behavior.intent, 'guide-survivors');
  assert.equal(openingGame.squads[0].behavior.intent, 'follow-commander');
  assert.equal(openingGame.leaders[0].command.graph.some((node) => node.id === 'outpost-anchor'), false);
  assert.equal(shelterNodes.length, 12);
  assert.ok(shelterNodes.find((node) => node.shelterType === 'SHALLOW_CAVE').tags.includes('final_shelter'));

  const enemyRunsBeforeTick = openingGame.scheduler.enemyAI.runCount;
  const logisticsRunsBeforeTick = openingGame.scheduler.logistics.runCount;
  advanceGameTick(openingGame, openingMap);
  const openingSummary = summarizeGame(openingGame);
  assert.equal(openingGame.enemyAI.dormant, true);
  assert.match(openingGame.enemyAI.lastAction, /Dormant/);
  assert.equal(openingGame.scheduler.enemyAI.runCount, enemyRunsBeforeTick, 'the dormant opening should not tick an absent hostile director');
  assert.equal(openingGame.scheduler.logistics.runCount, logisticsRunsBeforeTick, 'the dormant opening should not tick hidden supply-line systems');
  assert.equal(openingGame.fields.foodResource, undefined, 'hidden resource fields should not be derived for the survival opening');
  assert.equal(openingSummary.runtime.dormancy.enabled, true);
  assert.ok(openingSummary.runtime.dormancy.dormantSystems.includes('constructionJobs'));

  const lifecycle = summarizeWorldAssetLifecycle(openingMap, openingGame);
  assert.equal(lifecycle.contract, WORLD_ASSET_LIFECYCLE_CONTRACT);
  assert.equal(lifecycle.runtimeProfile, 'nomadic_survival');
  assert.equal(lifecycle.categories[WORLD_ASSET_CATEGORIES.dormantStructure].count, 0);
  assert.equal(lifecycle.categories[WORLD_ASSET_CATEGORIES.activeStructure].count, 0);
  assert.equal(lifecycle.categories[WORLD_ASSET_CATEGORIES.dynamicThreat].count, 0);
  assert.ok(lifecycle.categories[WORLD_ASSET_CATEGORIES.staticVisual].count > 0);
  assert.ok(lifecycle.categories[WORLD_ASSET_CATEGORIES.staticGameplay].count >= shelterNodes.length);

  const finalShelter = shelterNodes.find((node) => node.shelterType === 'SHALLOW_CAVE').tile;
  const commander = openingGame.leaders[0];
  const commandRadius = openingMap.scenario.scenarioLayer.cameraRig.commandRadiusTiles;
  assert.ok(Math.hypot(finalShelter.x - commander.position.x, finalShelter.y - commander.position.y) > commandRadius);
  const farMove = issuePlayerMoveCommand(openingGame, openingMap, commander.id, [commander.position, finalShelter]);
  assert.equal(farMove.ok, false);
  assert.equal(farMove.reason, 'outside-commander-authority');
  const farWheelCommand = issueAIBehaviourIntent(openingGame, openingMap, { type: 'seek_shelter', target: finalShelter });
  assert.equal(farWheelCommand.ok, false);
  assert.equal(farWheelCommand.reason, 'outside-commander-authority');

  const restoredOpeningGame = deserializeGameState(serializeGameState(openingGame, openingMap), openingMap);
  assert.equal(restoredOpeningGame.outposts.length, 0, 'outpostless survival saves should restore cleanly');
  assert.equal(restoredOpeningGame.runtimeDormancy.enabled, true);
}
