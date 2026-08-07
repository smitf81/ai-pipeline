import { assert, equal } from './assert.mjs';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { getRenderLayerStats } from '../src/projection/renderLayerState.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { getSmokeFieldProfile, SmokeFieldProfileId } from '../src/data/smokeFields.js';

const profile = getSmokeFieldProfile(SmokeFieldProfileId.LOW_NIGHT_SMOKE);
assert(profile.scatterStrength > 0, 'smoke field profile should define atmospheric scatter strength');
assert(profile.scatterOpacity > 0, 'smoke field profile should define visible scatter opacity');
assert(!('scatterBloomOpacity' in profile), 'smoke field profile should not own bloom opacity');
assert(!('scatterSmoothingPasses' in profile), 'smoke field profile should not own smoothing passes');
assert(!('scatterDitherOpacity' in profile), 'smoke field profile should not own final dither');

equal(RENDER_BUDGETS.atmosphericScatter.passPolicy, 'density_texture_light_scatter_composite', 'scatter should be a density texture/light composite pass');
equal(RENDER_BUDGETS.atmosphericScatter.bloomPolicy, 'delegated_to_post_process_pipeline', 'scatter bloom should be owned by the post-process pipeline');
equal(RENDER_BUDGETS.atmosphericScatter.smoothingPolicy, 'delegated_to_post_process_pipeline', 'scatter smoothing should be owned by the post-process pipeline');

const game = createInitialGameState(createDemoMap());
const stats = getRenderLayerStats(game.renderLayers);
equal(stats.atmosphericScatterPolicy, 'density_texture_light_scatter_composite', 'stats should expose atmospheric scatter policy');
equal(stats.atmosphericScatterBloomPolicy, 'delegated_to_post_process_pipeline', 'stats should expose delegated scatter bloom policy');
equal(stats.atmosphericScatterSmoothingPolicy, 'delegated_to_post_process_pipeline', 'stats should expose delegated scatter smoothing policy');
equal(stats.atmosphericScatterBloomPasses, 0, 'atmosphere layer should not run local bloom passes');
equal(stats.atmosphericScatterSmoothingPasses, 0, 'atmosphere layer should not run local smoothing passes');
equal(stats.atmosphericScatterPasses, 0, 'scatter pass count starts at zero until the render layer draws');
assert(stats.smokeFieldContributingLights === 0, 'contributing light count is render-measured, not invented during projection sync');
assert(game.smokeSources.length > 0, 'demo should still provide smoke sources for the scatter pass to sample');
assert(game.lights.length > 0, 'demo should still provide lights for the smoke scatter pass to sample');
