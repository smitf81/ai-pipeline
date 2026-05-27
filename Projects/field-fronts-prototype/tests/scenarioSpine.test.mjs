import assert from 'node:assert/strict';
import { createFirstNightMap, createSeededMap } from '../src/world/mapGenerator.js';
import { createInitialGameState } from '../src/game/gameModel.js';
import { getScenarioSelectionSlots } from '../src/world/scenarioCatalogue.js';
import {
  SCENARIO_SPINE_STATES,
  advanceScenarioSpineRuntime,
  applyScenarioRuntimeProgress,
  createDefaultScenarioSpine,
  normaliseScenarioRuntime,
  validateScenarioSpine
} from '../src/world/scenarioSpine.js';

export function run() {
  const map = createSeededMap({ seed: 'qa-scenario-spine-001', preset: 'frontier_2k', scenarioPreset: 'black_sky_arrival' });
  const spine = map.scenario.scenarioSpine ?? createDefaultScenarioSpine(map, map.scenario.scenarioLayer);
  const validation = validateScenarioSpine(spine, { map });
  assert.equal(validation.status, 'playable');
  assert.equal(validation.beginningReady, true);
  assert.equal(validation.middleReady, true);
  assert.equal(validation.endingReady, true);
  assert.equal(validation.nextChapterTarget, 'chapter_002');
  assert.equal(spine.designIntent.includes('survival-command'), true);
  assert.ok(spine.middle.events.some((event) => event.id === 'middle_shelter_lane_revealed'), 'Chapter 1 should present a shelter-readability beat');
  assert.ok(spine.middle.events.some((event) => event.id === 'middle_dragon_shadow_over_outpost'), 'Chapter 1 should include a non-verbal silhouette/dragon-shadow beat');
  assert.ok(spine.middle.events.some((event) => event.effects.some((effect) => effect.type === 'corpse_warning')), 'Chapter 1 should foreshadow corpse/body-wall logistics');

  const incomplete = validateScenarioSpine({
    id: 'bad_spine',
    beginning: {},
    middle: { events: [] },
    ending: {}
  });
  assert.equal(incomplete.status, 'incomplete');
  assert.ok(incomplete.missing.includes('beginning commander start'));
  assert.ok(incomplete.missing.includes('at least one middle event'));
  assert.ok(incomplete.missing.includes('victory/end scenario condition'));

  const game = createInitialGameState(map);
  let runtime = normaliseScenarioRuntime({}, spine);
  let result = advanceScenarioSpineRuntime({ spine, runtime, game, map });
  runtime = result.runtime;
  assert.equal(runtime.status, SCENARIO_SPINE_STATES.opening);

  game.tick = 8;
  result = advanceScenarioSpineRuntime({ spine, runtime, game, map });
  runtime = result.runtime;
  assert.equal(runtime.status, SCENARIO_SPINE_STATES.active);
  assert.ok(runtime.triggeredEventIds.includes('middle_enemy_pressure'));
  assert.ok(runtime.triggeredEventIds.includes('middle_shelter_lane_revealed'));
  assert.ok(runtime.effectHistory.some((effect) => effect.type === 'attention_ping'));
  assert.ok(runtime.effectHistory.some((effect) => effect.type === 'corpse_warning'));

  const targetOutpost = game.outposts.find((outpost) => outpost.id === spine.ending.victory.outpostId) ?? game.outposts.find((outpost) => outpost.contestable);
  const commander = game.leaders.find((leader) => leader.id === 'leader_player_01');
  commander.tile = { ...targetOutpost.tile };
  game.tick = 12;
  result = advanceScenarioSpineRuntime({ spine, runtime, game, map });
  runtime = result.runtime;
  assert.equal(runtime.status, SCENARIO_SPINE_STATES.completed);
  assert.equal(runtime.nextScenarioId, 'chapter_002');

  applyScenarioRuntimeProgress(map, runtime, 'chapter_001');
  assert.ok(map.scenario.progress.completedScenarioIds.includes('chapter_001'));
  assert.ok(map.scenario.progress.unlockedScenarioIds.includes('chapter_002'));
  const slots = getScenarioSelectionSlots(map);
  const chapterTwo = slots.find((slot) => slot.id === 'chapter_002');
  assert.equal(chapterTwo.locked, false);
  assert.equal(chapterTwo.status, 'unlocked-placeholder');

  const failMap = createSeededMap({ seed: 'qa-scenario-spine-002', preset: 'frontier_2k' });
  const failSpine = failMap.scenario.scenarioSpine;
  const failGame = createInitialGameState(failMap);
  const failCommander = failGame.leaders.find((leader) => leader.id === 'leader_player_01');
  failCommander.health.health = 0;
  const fail = advanceScenarioSpineRuntime({ spine: failSpine, runtime: {}, game: failGame, map: failMap });
  assert.equal(fail.runtime.status, SCENARIO_SPINE_STATES.failed);

  const openingMap = createFirstNightMap({ seed: 'qa-first-night-spine' });
  const openingSpine = openingMap.scenario.scenarioSpine;
  const openingGame = createInitialGameState(openingMap);
  let openingRuntime = normaliseScenarioRuntime({}, openingSpine);
  const openingCommander = openingGame.leaders[0];
  const shelterById = new Map(openingMap.scenario.scenarioLayer.shelterNodes.map((node) => [node.id, node.position]));
  const moveCommanderForObjective = (index) => {
    const tile = shelterById.get(openingSpine.objectives[index].condition.shelterNodeId);
    openingCommander.tile = { ...tile };
    openingCommander.position = { ...tile };
    openingGame.tick += 1;
    openingRuntime = advanceScenarioSpineRuntime({ spine: openingSpine, runtime: openingRuntime, game: openingGame, map: openingMap }).runtime;
  };
  assert.equal(openingSpine.title, 'The First Night');
  assert.equal(openingSpine.beginning.openingCamera.mode, 'commander_follow_tactical_leash');
  assert.equal(openingSpine.objectives.length, 5);
  assert.equal(openingSpine.ending.victory.type, 'survivors_reach_shelter');
  moveCommanderForObjective(0);
  moveCommanderForObjective(1);
  moveCommanderForObjective(2);
  moveCommanderForObjective(3);
  const finalTile = shelterById.get(openingSpine.objectives[4].condition.shelterNodeId);
  [...openingGame.leaders, ...openingGame.squads].forEach((entity) => {
    entity.tile = { ...finalTile };
    entity.position = { ...finalTile };
  });
  openingGame.tick += 1;
  openingRuntime = advanceScenarioSpineRuntime({ spine: openingSpine, runtime: openingRuntime, game: openingGame, map: openingMap }).runtime;
  assert.equal(openingRuntime.status, SCENARIO_SPINE_STATES.completed);
  assert.equal(openingRuntime.completedObjectiveIds.length, 5);
  assert.equal(openingRuntime.unlockNextChapter, false);
  applyScenarioRuntimeProgress(openingMap, openingRuntime, 'chapter_001');
  assert.equal(getScenarioSelectionSlots(openingMap).find((slot) => slot.id === 'chapter_002').locked, true);
}
