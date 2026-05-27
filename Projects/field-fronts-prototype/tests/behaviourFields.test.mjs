import assert from 'node:assert/strict';
import { createSeededMap } from '../src/world/mapGenerator.js';
import { createInitialGameState, getGameFieldValue } from '../src/game/gameModel.js';
import { createAttentionMarker } from '../src/game/aiStateMachine.js';
import {
  classifyCoverState,
  createBehaviourFieldSet,
  deriveBehaviourFields,
  sampleBehaviourFields,
  writeBehaviourFieldValue
} from '../src/world/behaviourFields.js';
import { AI_BEHAVIOUR_FIELD_IDS } from '../src/game/aiContracts.js';

export function run() {
  const map = createSeededMap({ seed: 'qa-behaviour-fields-001', preset: 'frontier_2k' });
  const fieldSet = createBehaviourFieldSet(map);
  assert.equal(fieldSet.width, map.width);
  assert.equal(fieldSet.height, map.height);
  assert.equal(sampleBehaviourFields(fieldSet, 2, 2).shelter, 0);

  assert.equal(writeBehaviourFieldValue(fieldSet, AI_BEHAVIOUR_FIELD_IDS.shelter, 2, 2, 0.85), true);
  assert.equal(writeBehaviourFieldValue(fieldSet, AI_BEHAVIOUR_FIELD_IDS.exposure, 2, 2, 0.2), true);
  const sample = sampleBehaviourFields(fieldSet, 2, 2);
  assert.equal(sample.shelter, 0.85);
  assert.equal(classifyCoverState(sample), 'sheltered');

  assert.equal(writeBehaviourFieldValue(fieldSet, AI_BEHAVIOUR_FIELD_IDS.shelter, 3, 3, 0.18), true);
  assert.equal(writeBehaviourFieldValue(fieldSet, AI_BEHAVIOUR_FIELD_IDS.exposure, 3, 3, 0.91), true);
  assert.equal(classifyCoverState(sampleBehaviourFields(fieldSet, 3, 3)), 'exposed');

  const game = createInitialGameState(map);
  const player = game.leaders.find((leader) => leader.factionId === 'player');
  const enemy = game.leaders.find((leader) => leader.factionId === 'enemy');
  assert.ok(player && enemy);

  const playerTile = player.tile;
  const enemyTile = enemy.tile;
  assert.ok(getGameFieldValue(game, AI_BEHAVIOUR_FIELD_IDS.shelter, playerTile.x, playerTile.y) > 0.25);
  assert.ok(getGameFieldValue(game, AI_BEHAVIOUR_FIELD_IDS.morale, playerTile.x, playerTile.y) > 0.35);
  assert.ok(getGameFieldValue(game, AI_BEHAVIOUR_FIELD_IDS.commandConfidence, playerTile.x, playerTile.y) > 0.35);
  assert.ok(getGameFieldValue(game, AI_BEHAVIOUR_FIELD_IDS.threat, enemyTile.x, enemyTile.y) > 0.1);

  const derived = deriveBehaviourFields(map, {
    ...game,
    tick: 10,
    corpses: [
      { id: 'corpse_cover_1', entityType: 'squad', tile: playerTile, position: playerTile, horrorValue: 0.4, createdAtTick: 10 },
      { id: 'corpse_cover_2', entityType: 'squad', tile: playerTile, position: playerTile, horrorValue: 0.4, createdAtTick: 10 },
      { id: 'corpse_cover_3', entityType: 'squad', tile: playerTile, position: playerTile, horrorValue: 0.4, createdAtTick: 10 }
    ],
    ai: {
      ...game.ai,
      attentionMarkers: [createAttentionMarker({
        id: 'noise_test',
        type: 'noise',
        position: playerTile,
        strength: 0.9,
        createdAtTick: 10,
        durationTicks: 8
      })]
    },
    deathEvents: [
      {
        id: 'death_test',
        factionId: 'player',
        position: enemyTile,
        tick: 10
      }
    ]
  }, game.fields);
  assert.ok(derived.fields.attention.values[playerTile.y][playerTile.x] > 0.5);
  assert.ok(derived.fields.threat.values[enemyTile.y][enemyTile.x] > 0.45);
  assert.ok(derived.fields.shelter.values[playerTile.y][playerTile.x] > 0.18, 'corpse piles can become crude cover/shelter');

  const firstCache = game._runtimeCache?.behaviourFields;
  const sameTick = createInitialGameState(map);
  const secondCache = sameTick._runtimeCache?.behaviourFields;
  assert.equal(Boolean(firstCache?.fields), true);
  assert.equal(Boolean(secondCache?.fields), true);
}
