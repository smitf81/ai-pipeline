import assert from 'node:assert/strict';
import { createBlankMap } from '../src/world/mapModel.js';
import { advanceGameTick, createInitialGameState, issueAIBehaviourIntent } from '../src/game/gameModel.js';
import { AI_INTENT_RESPONSE_STATUSES, AI_INTENT_STATES } from '../src/game/aiContracts.js';
import { COMMAND_WHEEL_ACTIONS, createCommandFeedback, createCommandWheelIntentArgs, getCommandWheelAction, resolveCommandWheelHover } from '../src/game/commandWheel.js';

export function run() {
  assert.ok(COMMAND_WHEEL_ACTIONS.some((action) => action.id === 'seek_shelter'));
  assert.ok(COMMAND_WHEEL_ACTIONS.some((action) => action.id === 'quiet_move'));
  assert.ok(COMMAND_WHEEL_ACTIONS.some((action) => action.id === 'distract'));
  assert.ok(COMMAND_WHEEL_ACTIONS.some((action) => action.id === 'regroup'));

  const shelterAction = getCommandWheelAction('seek_shelter');
  const args = createCommandWheelIntentArgs(shelterAction.id, { x: 12, y: 8 });
  assert.equal(args.type, AI_INTENT_STATES.seekShelter);
  assert.deepEqual(args.target, { x: 12, y: 8 });
  assert.equal(args.metadata.inputSurface, 'command-wheel');


  const hoverMove = resolveCommandWheelHover({ x: 100, y: 100 }, { x: 103, y: 102 });
  assert.equal(hoverMove.id, 'move_to_target', 'deadzone hover should preserve default right-click MoveTo');
  const hoverShelter = resolveCommandWheelHover({ x: 100, y: 100 }, { x: 150, y: 55 });
  assert.equal(hoverShelter.id, 'seek_shelter', 'north-east hover should highlight Shelter for release confirm');
  const hoverDistract = resolveCommandWheelHover({ x: 100, y: 100 }, { x: 55, y: 145 });
  assert.equal(hoverDistract.id, 'distract', 'south-west hover should highlight Distract for release confirm');

  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const issued = issueAIBehaviourIntent(game, map, args);
  assert.equal(issued.ok, true);
  assert.equal(issued.packet.type, AI_INTENT_STATES.seekShelter);
  assert.ok(issued.responses.length >= 1);
  assert.ok([AI_INTENT_RESPONSE_STATUSES.accepted, AI_INTENT_RESPONSE_STATUSES.degraded].includes(issued.responses[0].status));

  const feedback = createCommandFeedback({ action: shelterAction, result: issued, tile: { x: 12, y: 8 }, source: 'test' });
  assert.equal(feedback.label, 'Shelter');
  assert.ok(['accepted', 'degraded', 'rejected', 'overridden_by_survival'].includes(feedback.status));
  assert.ok(feedback.target);

  const stealthGame = createInitialGameState(map);
  stealthGame.leaders = stealthGame.leaders.map((leader) => ({
    ...leader,
    position: leader.factionId === 'player' ? { x: 10, y: 10 } : { x: 18, y: 10 }
  }));
  const distract = issueAIBehaviourIntent(stealthGame, map, createCommandWheelIntentArgs('distract', { x: 15, y: 10 }));
  assert.equal(distract.packet.type, AI_INTENT_STATES.distract);
  assert.ok(distract.game.projectiles.some((projectile) => projectile.weaponId === 'stone'));
  assert.equal(distract.game.ai.attentionMarkers.some((marker) => marker.sourceIntentId === distract.packet.id), false, 'noise should not exist until the stone lands');
  for (let tick = 0; tick < 6; tick += 1) {
    advanceGameTick(distract.game, map);
  }
  assert.ok(distract.game.soundEvents.some((event) => event.kind === 'stone_impact' && event.sourceIntentId === distract.packet.id));
  assert.ok(distract.game.ai.attentionMarkers.some((marker) => marker.sourceIntentId === distract.packet.id));
  const enemy = distract.game.leaders.find((leader) => leader.factionId === 'enemy');
  assert.equal(enemy.ai.perceptionState, 'investigating');
  assert.equal(enemy.movementOrder.routeMode, 'sound-investigation');
}
