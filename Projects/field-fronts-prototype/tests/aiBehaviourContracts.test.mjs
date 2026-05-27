import assert from 'node:assert/strict';
import {
  AI_EMOTIONAL_STATES,
  AI_INTENT_RESPONSE_STATUSES,
  AI_INTENT_STATES,
  calculateOverrideCost,
  createIntentPacket,
  createIntentResponse,
  registerIntentPulse
} from '../src/game/aiContracts.js';
import { createSeededMap } from '../src/world/mapGenerator.js';
import { createInitialGameState, issueAIBehaviourIntent } from '../src/game/gameModel.js';
import {
  applyIntentResponseToEntityAI,
  classifyIntentAgainstEmotion,
  createAIEntityState,
  createAISystemState,
  issueIntentThroughAccumulator
} from '../src/game/aiStateMachine.js';

export function run() {
  const first = createIntentPacket({
    id: 'intent_a',
    sourceEntityId: 'leader_player_01',
    factionId: 'player',
    type: AI_INTENT_STATES.seekShelter,
    target: { x: 12, y: 9 },
    issuedAtTick: 4,
    priority: 0.44
  });
  const a1 = registerIntentPulse(null, first);
  const second = createIntentPacket({ ...first, id: 'intent_b', issuedAtTick: 5 });
  const a2 = registerIntentPulse(a1, second);
  const third = createIntentPacket({ ...first, id: 'intent_c', issuedAtTick: 6 });
  const a3 = registerIntentPulse(a2, third);
  assert.equal(a3.repeatCount, 3);
  assert.ok(a3.urgency > a1.urgency);
  assert.ok(a3.overrideRisk > a1.overrideRisk);
  assert.ok(a3.strainDebt > 0, 'repeated forced commands should accumulate strain debt');

  const system = createAISystemState();
  const issued1 = issueIntentThroughAccumulator(system, first);
  const issued2 = issueIntentThroughAccumulator(issued1.state, second);
  assert.equal(issued2.packet.repeatCount, 2);
  assert.ok(issued2.packet.urgency > issued1.packet.urgency);
  assert.ok(issued2.packet.metadata.overrideRisk > issued1.packet.metadata.overrideRisk);

  const panicked = createAIEntityState({
    emotionalState: AI_EMOTIONAL_STATES.panicked,
    intentState: AI_INTENT_STATES.idle,
    commandConfidence: 0.38
  });
  const degraded = classifyIntentAgainstEmotion(panicked, {
    id: 'move_under_panic',
    type: AI_INTENT_STATES.moveToTarget,
    target: { x: 20, y: 10 },
    urgency: 0.8
  }, {
    entityId: 'squad_player_01',
    shelterTarget: { x: 18, y: 10 },
    shelter: 0.18,
    threat: 0.9
  });
  assert.equal(degraded.status, AI_INTENT_RESPONSE_STATUSES.degraded);
  assert.equal(degraded.chosenState, AI_INTENT_STATES.seekShelter);

  const routed = createAIEntityState({ emotionalState: AI_EMOTIONAL_STATES.routed });
  const rejected = classifyIntentAgainstEmotion(routed, {
    id: 'attack_while_routed',
    type: AI_INTENT_STATES.engage,
    urgency: 0.96
  }, { entityId: 'squad_player_02' });
  assert.equal(rejected.status, AI_INTENT_RESPONSE_STATUSES.rejected);

  const response = createIntentResponse({
    status: AI_INTENT_RESPONSE_STATUSES.overriddenBySurvival,
    chosenState: AI_INTENT_STATES.flee,
    urgency: 0.9
  });
  const after = applyIntentResponseToEntityAI(panicked, response, { shelter: 0.05, threat: 0.9, tick: 9 });
  assert.ok(after.mentalStrain > panicked.mentalStrain);
  assert.ok(after.maxMoralePenalty > panicked.maxMoralePenalty);
  assert.ok(calculateOverrideCost({ urgency: 1, emotionalState: AI_EMOTIONAL_STATES.routed, threat: 1 }) > 0.7);

  const map = createSeededMap({ seed: 'qa-ai-intent-issue-001', preset: 'frontier_2k' });
  const game = createInitialGameState(map);
  const issued = issueAIBehaviourIntent(game, map, {
    type: AI_INTENT_STATES.seekShelter,
    target: { x: 10, y: 12 },
    scope: 'selected'
  });
  assert.equal(issued.ok, true);
  assert.ok(issued.packet.id);
  assert.ok(issued.targetEntityIds.includes(game.selectedEntityId));
  assert.equal(issued.game.dirty.ai, true);
  assert.ok(issued.game.versions.ai > 0);
  assert.ok(issued.responses.length >= 1);
  assert.ok(issued.game.events.some((event) => event.type === 'ai:intent_issued' && event.payload.intentId === issued.packet.id));
  assert.ok(issued.game.events.some((event) => event.type === 'ai:intent_response' && event.payload.intentId === issued.packet.id));
}

