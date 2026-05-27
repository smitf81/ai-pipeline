import assert from 'node:assert/strict';
import { createBlankMap } from '../src/world/mapModel.js';
import { createInitialGameState, issueAIBehaviourIntent, spawnWarriorSquad, recomputeGameState, advanceGameTick } from '../src/game/gameModel.js';
import { AI_EMOTIONAL_STATES, AI_INTENT_RESPONSE_STATUSES, AI_INTENT_STATES } from '../src/game/aiContracts.js';
import { appraiseEntityBehaviour, resolveIntentResponseForEntity } from '../src/game/aiStateMachine.js';
import { isMovementBlocked } from '../src/game/movementSystem.js';
import { collectCorpseStacks, getCorpseMovementCostModifier } from '../src/game/corpseSystem.js';

export function run() {
  const pressured = appraiseEntityBehaviour({
    id: 'squad_test',
    ai: { emotionalState: AI_EMOTIONAL_STATES.calm, morale: 0.7, commandConfidence: 0.68 }
  }, {
    shelter: 0.05,
    exposure: 0.96,
    threat: 0.92,
    morale: 0.25,
    commandConfidence: 0.35
  }, {
    deathPressure: 0.7,
    isolation: 0.4,
    tick: 3
  });
  assert.ok([AI_EMOTIONAL_STATES.pressured, AI_EMOTIONAL_STATES.panicked].includes(pressured.emotionalState));
  assert.ok(pressured.flags.lastDangerPressure > pressured.flags.lastRecoveryPressure);

  const recovering = appraiseEntityBehaviour({
    id: 'squad_recover',
    ai: { emotionalState: AI_EMOTIONAL_STATES.pressured, morale: 0.45, commandConfidence: 0.42, mentalStrain: 0.2 }
  }, {
    shelter: 0.9,
    exposure: 0.05,
    threat: 0.04,
    morale: 0.8,
    commandConfidence: 0.75
  }, {
    nearCommander: true,
    tick: 4
  });
  assert.ok([AI_EMOTIONAL_STATES.alert, AI_EMOTIONAL_STATES.calm].includes(recovering.emotionalState));
  assert.ok(recovering.commandConfidence > 0.45);

  const urgentOverride = resolveIntentResponseForEntity({
    id: 'squad_override',
    ai: { emotionalState: AI_EMOTIONAL_STATES.panicked, commandConfidence: 0.42 }
  }, {
    id: 'intent_force_move',
    type: AI_INTENT_STATES.moveToTarget,
    target: { x: 14, y: 12 },
    urgency: 0.96
  }, {
    shelter: 0.1,
    threat: 0.85,
    commandConfidence: 0.42
  });
  assert.equal(urgentOverride.status, AI_INTENT_RESPONSE_STATUSES.overriddenBySurvival);
  assert.equal(urgentOverride.chosenState, AI_INTENT_STATES.moveToTarget);
  assert.ok(urgentOverride.overrideCost > 0.4);

  const distraction = appraiseEntityBehaviour({
    id: 'enemy_scout',
    ai: { perceptionState: 'unaware' }
  }, {
    attention: 0.75,
    threat: 0.1,
    shelter: 0.4,
    exposure: 0.3
  });
  assert.equal(distraction.perceptionState, 'investigating');

  const map = createBlankMap({ width: 48, height: 32, fill: 'land' });
  const game = createInitialGameState(map);
  const player = spawnWarriorSquad(game, map, { factionId: 'player' }).squad;
  game.selectedEntityId = player.id;
  const issued = issueAIBehaviourIntent(game, map, {
    type: AI_INTENT_STATES.seekShelter,
    target: { x: 12, y: 12 },
    scope: 'selected'
  });
  assert.ok(issued.responses.some((response) => response.entityId === player.id));
  assert.ok(issued.game.ai.intentResponses[`${issued.packet.id}:${player.id}`]);

  const enemy = spawnWarriorSquad(issued.game, map, { factionId: 'enemy', select: false }).squad;
  issued.game.squads = issued.game.squads.map((squad) => squad.id === enemy.id
    ? { ...squad, health: { ...squad.health, health: 1 }, position: { x: 17, y: 12 }, tile: { x: 17, y: 12 } }
    : squad);
  issued.game.squads = issued.game.squads.map((squad) => squad.id === player.id
    ? { ...squad, position: { x: 16.4, y: 12 }, tile: { x: 16, y: 12 }, combat: { ...squad.combat, meleeDamage: 20, lastMeleeTick: -99 } }
    : squad);
  issued.game.leaders = issued.game.leaders.map((leader) => ({ ...leader, combat: { ...leader.combat, enabled: false } }));
  recomputeGameState(issued.game, map);
  advanceGameTick(issued.game, map);
  assert.ok(issued.game.corpses.some((corpse) => corpse.sourceEntityId === enemy.id));
  const corpse = issued.game.corpses.find((candidate) => candidate.sourceEntityId === enemy.id);
  assert.equal(isMovementBlocked(map, corpse.tile, issued.game, 'player'), false, 'a single corpse should be step-over terrain, not a magic wall');

  issued.game.corpses.push(
    { ...corpse, id: 'corpse_stack_extra_1', sourceEntityId: 'stack_1' },
    { ...corpse, id: 'corpse_stack_extra_2', sourceEntityId: 'stack_2' },
    { ...corpse, id: 'corpse_stack_extra_3', sourceEntityId: 'stack_3' }
  );
  const stacks = collectCorpseStacks(issued.game);
  const stack = stacks.find((candidate) => candidate.tile.x === corpse.tile.x && candidate.tile.y === corpse.tile.y);
  assert.equal(stack.count, 4);
  assert.equal(stack.blocksMovement, true, 'four bodies on one tile should become a body-wall obstacle');
  assert.equal(isMovementBlocked(map, corpse.tile, issued.game, 'player'), true);
  assert.ok(getCorpseMovementCostModifier(issued.game, corpse.tile) > 1);
}
