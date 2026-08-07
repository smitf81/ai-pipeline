import { runSystems } from '../ecs/systemRunner.js';
import { createInitialGameState as createEcsGameState } from './createGame.js';
import { getDragon } from './selectors.js';
import { ACTION_SYSTEMS } from './systemOrder.js';

export function createInitialGameState(map, options = {}) {
  return createEcsGameState(map, options);
}

export { getDragon };

export function updateActionSystems(state, input, dt) {
  if (state.game.status !== 'playing') return;
  runSystems(ACTION_SYSTEMS, { state, game: state.game, map: state.map, input, dt });
}
