import { ACTION_SYSTEM_NAMES } from '../game/systemOrder.js';
import { getRenderLayerStats } from '../projection/renderLayerState.js';

export function createDebugSnapshot(game) {
  const componentCounts = {};
  for (const [name, store] of game.world.components.entries()) componentCounts[name] = store.size;
  return {
    architecture: game.architecture,
    status: game.status,
    entityCount: game.world.entities.size,
    eventCount: game.world.events.length,
    componentCounts,
    systemOrder: [...ACTION_SYSTEM_NAMES],
    sceneObjectCount: game.sceneObjects?.length ?? 0,
    occlusionBlockerCount: game.occlusionBlockers?.length ?? 0,
    actorViewCount: game.actors.length,
    smokeViewCount: game.smokeClouds.length,
    lightViewCount: game.lights?.length ?? 0,
    effectViewCount: game.effects.length,
    renderLayerStats: getRenderLayerStats(game.renderLayers)
  };
}
