import assert from 'node:assert/strict';
import { createFirstNightMap, createSeededMap } from '../src/world/mapGenerator.js';
import { createInitialGameState } from '../src/game/gameModel.js';
import { deserializeMap, serializeMap, summarizeTerrain } from '../src/world/mapModel.js';

export function run() {
  const first = createSeededMap({ seed: 'qa-seed-001', preset: 'frontier_2k' });
  const second = createSeededMap({ seed: 'qa-seed-001', preset: 'frontier_2k' });
  assert.equal(first.width, 96);
  assert.equal(first.height, 64);
  assert.equal(first.scenario.generator.targetTextureSize, 2048);
  assert.equal(JSON.stringify(first.tiles), JSON.stringify(second.tiles));
  assert.equal(JSON.stringify(first.elevation), JSON.stringify(second.elevation));
  assert.deepEqual(first.scenario.starts, second.scenario.starts);
  assert.deepEqual(first.scenario.neutralOutposts, second.scenario.neutralOutposts);

  const counts = summarizeTerrain(first);
  assert.equal(counts.land + counts.forest + counts.river + counts.sea + counts.mountains, first.width * first.height);
  assert.ok(counts.land + counts.forest > 1000, 'generated map should contain a playable landmass');
  assert.ok(counts.sea > 100, 'generated map should contain coast/sea cells');
  assert.equal(first.scenario.neutralOutposts.length, 4);

  const restored = deserializeMap(serializeMap(first));
  assert.equal(restored.scenario.generator.seed, 'qa-seed-001');
  assert.equal(restored.scenario.neutralOutposts.length, 4);

  const game = createInitialGameState(restored);
  assert.equal(game.outposts.filter((outpost) => outpost.contestable).length, 4);
  assert.equal(game.outposts.length, 6);
  assert.ok(game.outposts.every((outpost) => outpost.tile.x >= 0 && outpost.tile.x < restored.width));
  assert.ok(game.outposts.every((outpost) => outpost.tile.y >= 0 && outpost.tile.y < restored.height));

  const opening = createFirstNightMap({ seed: 'qa-opening-blockout' });
  const openingRepeat = createFirstNightMap({ seed: 'qa-opening-blockout' });
  assert.equal(opening.width, 64);
  assert.equal(opening.height, 40);
  assert.equal(opening.scenario.generator.preset, 'first_night_blockout');
  assert.equal(opening.scenario.neutralOutposts.length, 0);
  assert.deepEqual(opening.scenario.sections, openingRepeat.scenario.sections);
  assert.deepEqual(opening.scenario.sections.map((section) => section.id), [
    'exposed_start',
    'animal_trail',
    'canopy_chain',
    'boulder_cluster',
    'muddy_crossing',
    'thorn_choke',
    'final_shelter'
  ]);
}
