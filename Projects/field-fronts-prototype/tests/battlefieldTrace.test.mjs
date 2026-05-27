import assert from 'node:assert/strict';

import {
  BATTLEFIELD_TRACE_MODEL,
  advanceBattlefieldTrace,
  createBattlefieldTrace,
  normaliseBattlefieldTrace,
  summarizeBattlefieldTrace
} from '../src/game/battlefieldTrace.js';

export function run() {
  const game = {
    tick: 1,
    battlefieldTrace: createBattlefieldTrace(),
    leaders: [{
      id: 'leader_player_01',
      type: 'leader',
      factionId: 'player',
      position: { x: 8.2, y: 7.4 },
      movement: { lastStepTiles: 0.34, target: { x: 14, y: 7 } }
    }],
    squads: [],
    builders: [],
    resourceWorkers: [],
    transports: [],
    impactEvents: [{
      id: 'impact_1_enemy',
      tick: 1,
      entityId: 'enemy_01',
      entityType: 'squad',
      position: { x: 12, y: 7 },
      angle: 0,
      damageApplied: 8
    }],
    deathEvents: [{
      id: 'death_enemy_01_1',
      tick: 1,
      entityId: 'enemy_01',
      entityType: 'squad',
      position: { x: 12, y: 7 }
    }]
  };

  advanceBattlefieldTrace(game);
  assert.equal(game.battlefieldTrace.footprints.length, 1);
  const firstFootprintId = game.battlefieldTrace.footprints[0].id;
  assert.equal(game.battlefieldTrace.bloodMarks.some((mark) => mark.kind === 'spatter'), true);
  assert.equal(game.battlefieldTrace.bloodMarks.some((mark) => mark.kind === 'pool'), true);

  advanceBattlefieldTrace(game);
  assert.equal(game.battlefieldTrace.bloodMarks.length, 2, 'combat facts should not deposit stains twice');

  for (let tick = 2; tick < 475; tick += 1) {
    game.tick = tick;
    advanceBattlefieldTrace(game);
  }
  const summary = summarizeBattlefieldTrace(game);
  assert.equal(summary.muddyTiles > 0, true, 'repeated traversal should build visible mud');
  assert.equal(game.battlefieldTrace.footprints.some((footprint) => footprint.id === firstFootprintId), true, 'settled footprints should not fade or fall out of history');
  assert.equal(game.battlefieldTrace.footprints.length <= 4, true, 'repeat traversal should reuse compact ground impressions');

  const restored = normaliseBattlefieldTrace(JSON.parse(JSON.stringify(game.battlefieldTrace)));
  assert.equal(restored.bloodMarks.length, game.battlefieldTrace.bloodMarks.length);
  assert.equal(restored.churn.length, game.battlefieldTrace.churn.length);
}
