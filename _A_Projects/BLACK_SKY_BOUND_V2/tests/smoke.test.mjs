import { assert, equal } from './assert.mjs';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState, getDragon } from '../src/game/state.js';

const map = createDemoMap();
const game = createInitialGameState(map);
assert(map.width > 0 && map.height > 0, 'demo map should have dimensions');
assert(map.blobMasks.forest.length > 0, 'demo map should include painted forest blobs');
equal(game.actors.length, 6, 'initial husk should spawn dragon plus pressure actors');
equal(getDragon(game).type, 'young_dragon', 'player actor should be the young dragon');
equal(game.status, 'playing', 'first playable should start in playing state');
