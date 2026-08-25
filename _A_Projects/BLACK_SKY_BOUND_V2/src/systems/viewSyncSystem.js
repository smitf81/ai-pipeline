import { syncGameViews } from '../game/selectors.js';

export function viewSyncSystem({ game, state, map }) {
  syncGameViews(game, { camera: state?.camera ?? null, map, tileSize: 32 });
}
