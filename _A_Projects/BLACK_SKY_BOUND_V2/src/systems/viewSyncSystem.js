import { syncGameViews } from '../game/selectors.js';

export function viewSyncSystem({ game }) {
  syncGameViews(game);
}
