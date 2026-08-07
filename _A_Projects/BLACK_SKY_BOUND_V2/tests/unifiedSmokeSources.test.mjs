import { assert, equal } from './assert.mjs';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { addNapalmDroplet, addNapalmPool } from '../src/projection/napalmLayerState.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { getRenderLayerStats } from '../src/projection/renderLayerState.js';
import { SMOKE_SOURCE_RECIPES, SmokeSourceKind } from '../src/data/smokeSources.js';

assert(SMOKE_SOURCE_RECIPES[SmokeSourceKind.DRAGON_SMOKE_CLOUD], 'dragon smoke source recipe should exist');
assert(SMOKE_SOURCE_RECIPES[SmokeSourceKind.DRAGON_SMOKE_PLUME], 'dragon smoke plume source recipe should exist');
assert(SMOKE_SOURCE_RECIPES[SmokeSourceKind.NAPALM_DROPLET_WISP], 'napalm droplet micro-wisp recipe should exist');
assert(SMOKE_SOURCE_RECIPES[SmokeSourceKind.NAPALM_SMOULDER], 'napalm smoulder source recipe should exist');
assert(SMOKE_SOURCE_RECIPES[SmokeSourceKind.TORCH_WISP], 'torch wisp source recipe should exist');
equal(RENDER_BUDGETS.smokeField.sourcePolicy, 'unified_source_projection', 'smoke field should declare unified source projection policy');

const game = createInitialGameState(createDemoMap());
assert(game.smokeSources.filter((source) => source.sourceKind === SmokeSourceKind.TORCH_WISP).length >= 2, 'raider torch lights should contribute both core and trailing smoke wisps');
assert(game.smokeSources.every((source) => source.classification === 'derived_smoke_source_view'), 'smoke source views should be classified as derived views');

addNapalmPool(game.renderLayers, {
  x: game.actors[0].x,
  y: game.actors[0].y,
  radius: 0.25,
  lifetime: 12,
  colour: 'rgba(218,68,18,0.56)',
  hotColour: 'rgba(255,184,66,0.82)',
  opacity: 0.9,
  light: null,
  flickerPhase: 0
});
addNapalmDroplet(game.renderLayers, {
  x: game.actors[0].x + 0.2,
  y: game.actors[0].y - 0.1,
  duration: 0.5,
  radius: 0.064,
  glowRadius: 0.24,
  colour: 'rgba(255,126,44,0.94)'
});
syncGameViews(game);
assert(game.smokeSources.some((source) => source.sourceKind === SmokeSourceKind.NAPALM_SMOULDER), 'napalm pools should contribute smoulder smoke sources');
assert(game.smokeSources.some((source) => source.sourceKind === SmokeSourceKind.NAPALM_DROPLET_WISP), 'live napalm droplets should contribute tiny smoke wisps');

const stats = getRenderLayerStats(game.renderLayers);
equal(stats.smokeFieldSourcePolicy, 'unified_source_projection', 'stats should surface unified smoke source policy');
assert(stats.smokeFieldSourceKinds[SmokeSourceKind.TORCH_WISP] >= 1, 'stats should count torch smoke source kind');
assert(stats.smokeFieldSourceKinds[SmokeSourceKind.NAPALM_DROPLET_WISP] >= 1, 'stats should count napalm droplet smoke source kind');
assert(stats.smokeFieldSourceKinds[SmokeSourceKind.NAPALM_SMOULDER] >= 1, 'stats should count napalm smoke source kind');
assert(stats.droppedSmokeFieldSources === 0, 'normal demo should not exceed smoke source budget');
