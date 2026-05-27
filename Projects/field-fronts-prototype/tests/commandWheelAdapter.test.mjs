import assert from 'node:assert/strict';
import { createEditorState } from '../src/editor/editorState.js';
import { createCommandWheelIntentArgs } from '../src/game/commandWheel.js';
import {
  collectCommandTargetCandidates,
  executeCommandIntent,
  getAvailableCommands,
  validateCommandIntent
} from '../src/game/commandWheelAdapter.js';
import { issueAIBehaviourIntent } from '../src/game/gameModel.js';
import { createFirstNightMap } from '../src/world/mapGenerator.js';

export function run() {
  const state = createEditorState(createFirstNightMap({ seed: 'mouse-command-wheel-adapter' }));
  const commander = state.game.leaders.find((leader) => leader.factionId === 'player');
  const commands = getAvailableCommands(state, commander.id);
  assert.ok(commands.some((command) => command.id === 'observe'));
  assert.ok(commands.some((command) => command.id === 'seek_shelter'));
  assert.ok(commands.some((command) => command.id === 'regroup'));
  assert.equal(commands.some((command) => command.id === 'scatter'), false, 'Mouse must not invent missing wheel commands');

  const targets = collectCommandTargetCandidates(state, commander.id);
  assert.ok(targets.some((target) => target.id === 'shelter_first_trees'), 'Mouse should see first local shelter');
  const firstShelterTarget = targets.find((target) => target.id === 'shelter_first_trees');
  assert.equal(firstShelterTarget.label, 'light tree cover');
  assert.equal(firstShelterTarget.commandSuitability, 'actionable');
  assert.equal(firstShelterTarget.objectiveState, 'active');
  assert.equal(firstShelterTarget.knowledgeState, 'objective_revealed');
  assert.equal(firstShelterTarget.directVisibility, 'not_asserted');
  assert.equal(firstShelterTarget.tags.includes('visible'), false, 'command reach must not be reported as direct sight');
  assert.ok(firstShelterTarget.position, 'legal shelter target should have an anchor position');
  assert.equal(targets.some((target) => target.id === 'shelter_final_cave'), false, 'Mouse must not see far final shelter at the opening');

  state.scenarioRuntime.completedObjectiveIds = ['objective_first_shelter'];
  commander.tile = { x: 18, y: 19 };
  commander.position = { x: 18, y: 19 };
  let nextTargets = collectCommandTargetCandidates(state, commander.id);
  assert.equal(nextTargets.some((target) => target.id === 'shelter_first_trees'), false, 'completed shelter stop must not remain the default next choice');
  assert.equal(nextTargets.find((target) => target.id === 'shelter_canopy_01')?.objectiveState, 'active');

  state.scenarioRuntime.completedObjectiveIds.push('objective_canopy_chain');
  commander.tile = { x: 26, y: 16 };
  commander.position = { x: 26, y: 16 };
  nextTargets = collectCommandTargetCandidates(state, commander.id);
  assert.equal(nextTargets.some((target) => target.objectiveState === 'active'), false, 'distant active objective should not bypass commander reach');
  assert.ok(nextTargets.some((target) => target.id === 'shelter_boulders' && target.objectiveState === 'route_support'), 'route-support cover remains available between distant objectives');

  commander.tile = { x: 37, y: 19 };
  commander.position = { x: 37, y: 19 };
  nextTargets = collectCommandTargetCandidates(state, commander.id);
  assert.equal(nextTargets[0].id, 'shelter_bank_hollow');
  assert.equal(nextTargets[0].objectiveState, 'active', 'active objective outranks nearby route-support shelter');

  state.scenarioRuntime.completedObjectiveIds = [
    'objective_first_shelter',
    'objective_canopy_chain',
    'objective_crossing'
  ];
  commander.tile = { x: 43, y: 23 };
  commander.position = { x: 43, y: 23 };
  nextTargets = collectCommandTargetCandidates(state, commander.id);
  assert.equal(nextTargets.some((target) => target.id === 'shelter_final_cave'), false, 'the commander must not offer the final cave before it is in command reach');
  assert.equal(nextTargets.find((target) => target.id === 'shelter_fallen_tree')?.objectiveState, 'route_support');

  commander.tile = { x: 52, y: 20 };
  commander.position = { x: 52, y: 20 };
  nextTargets = collectCommandTargetCandidates(state, commander.id);
  assert.equal(nextTargets.find((target) => target.id === 'shelter_final_cave')?.objectiveState, 'active', 'final shelter remains selectable while survivors regroup there');

  state.scenarioRuntime.completedObjectiveIds = [];
  commander.tile = { x: 7, y: 21 };
  commander.position = { x: 7, y: 21 };

  const invalidCommand = validateCommandIntent({ commandId: 'teleport', targetId: 'shelter_first_trees' }, state);
  assert.equal(invalidCommand.ok, false);
  assert.equal(invalidCommand.reason, 'unavailable_command');
  const invalidTarget = validateCommandIntent({ commandId: 'seek_shelter', targetId: 'shelter_final_cave' }, state);
  assert.equal(invalidTarget.ok, false);
  assert.equal(invalidTarget.reason, 'invalid_target');
  const mismatchedPosition = validateCommandIntent({ commandId: 'seek_shelter', targetId: 'shelter_first_trees', targetPosition: { x: 10, y: 12 } }, state);
  assert.equal(mismatchedPosition.ok, false);
  assert.equal(mismatchedPosition.reason, 'invalid_target');
  assert.equal(validateCommandIntent({ commandId: 'seek_shelter', targetId: 'shelter_first_trees', targetPosition: { x: 18, y: 19 } }, state).ok, true);

  const observe = validateCommandIntent({ commandId: 'observe' }, state);
  assert.equal(observe.ok, true);
  assert.equal(observe.observeOnly, true);
  assert.equal(validateCommandIntent({ commandId: 'observe', targetId: 'imagined_target' }, state).reason, 'invalid_target');

  const validated = validateCommandIntent({
    actionId: 'mouse_action_001',
    commandId: 'seek_shelter',
    targetId: 'shelter_first_trees',
    audienceId: 'all_band'
  }, state);
  assert.equal(validated.ok, true);
  assert.equal(validated.intent.sourceEntityId, commander.id);
  assert.equal(validated.intent.scope, 'faction');
  assert.equal(validated.intent.commandTarget.id, 'shelter_first_trees');
  assert.equal(validated.intent.commandTarget.shelterType, 'LIGHT_TREE_COVER');
  assert.equal(validated.intent.commandTarget.commandSuitability, 'actionable');
  assert.equal(validated.intent.commandTarget.knownToCommander, true);
  assert.equal(validated.intent.commandTarget.directVisibility, 'not_asserted');
  assert.equal(Object.prototype.hasOwnProperty.call(validated.intent.commandTarget, 'visibleKnownToCommander'), false);

  let emitted = null;
  assert.equal(executeCommandIntent(validated, { emit: (type, payload) => { emitted = { type, payload }; } }), true);
  assert.equal(emitted.type, 'orders:survival-intent');
  assert.equal(emitted.payload.source, 'mouse-command-wheel');

  const args = createCommandWheelIntentArgs(emitted.payload.actionId, emitted.payload.tile, {
    scope: emitted.payload.scope,
    sourceEntityId: emitted.payload.sourceEntityId,
    metadata: { commandTarget: emitted.payload.commandTarget }
  });
  const issued = issueAIBehaviourIntent(state.game, state.map, args);
  assert.equal(issued.ok, true);
  assert.equal(issued.packet.sourceEntityId, commander.id);
  assert.equal(issued.packet.scope, 'faction');
  assert.ok(issued.targetEntityIds.length > 1, 'all-band wheel intent should receive follower responses');
  assert.equal(issued.responses[0].status, 'accepted');
  assert.equal(issued.responses[0].targetHonoured, true);
  assert.equal(issued.responses[0].shelterTargetId, 'shelter_first_trees');
  assert.match(issued.responses[0].reason, /selected shelter target/);
}
