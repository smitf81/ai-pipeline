import { assert, equal } from './assert.mjs';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { createRenderLayerState, getRenderLayerStats } from '../src/projection/renderLayerState.js';
import {
  buildLightSpaceRenderCulling,
  getLightSpaceAlphaAtPoint,
  resetLightSpaceCullingStats,
  screenRectIntersectsLightSpace,
  selectActiveLightViews
} from '../src/projection/lightSpaceRenderCulling.js';

equal(RENDER_BUDGETS.lightSpaceCulling.enabled, true, 'light-space culling should be enabled by budget policy');
equal(RENDER_BUDGETS.lightSpaceCulling.policy, 'feathered_expanded_light_bounds_render_gate', 'light-space culling should declare its feathered render-gate policy');
equal(RENDER_BUDGETS.lightSpaceCulling.outsideDetailPolicy, 'cheap_base_fill_with_feathered_detail_transition', 'outside-light detail should fade down to cheap base fill');
equal(RENDER_BUDGETS.lightSpaceCulling.actorPolicy, 'black_shadow_lod_for_unlit_non_player_actors', 'actor culling should preserve cheap black presence outside light-space');
assert(RENDER_BUDGETS.lightSpaceCulling.featherPx > 0, 'light-space culling should define a feather margin');

const camera = { x: 0, y: 0, zoom: 1, viewportW: 200, viewportH: 120 };
const tileSize = 10;
const lights = [
  { id: 'torch:a', x: 3, y: 2, radius: 4, intensity: 1, enabled: true },
  { id: 'torch:b', x: 4, y: 2.2, radius: 4, intensity: 0.8, enabled: true },
  { id: 'torch:offscreen', x: 50, y: 50, radius: 3, intensity: 1, enabled: true },
  { id: 'torch:dark', x: 0, y: 0, radius: 4, intensity: 0, enabled: true }
];

const active = selectActiveLightViews(lights, 10);
equal(active.length, 3, 'active render lights should exclude disabled or zero-intensity emitters before culling');

const culling = buildLightSpaceRenderCulling(lights, camera, tileSize);
equal(culling.classification, 'derived_render_budget_gate', 'light-space culling should be explicitly render-derived');
equal(culling.activeLightCount, 3, 'culling should derive from active light views');
equal(culling.rawRegionCount, 2, 'offscreen lights should not create viewport regions');
equal(culling.regions.length, 1, 'overlapping light bubbles should merge before layer clipping');
assert(culling.coverageRatio > 0 && culling.coverageRatio < 1, 'light regions should cover only part of the viewport');
assert(culling.featheredCoverageRatio > culling.coverageRatio, 'feathered coverage should be larger than full-detail coverage');
equal(culling.featherPx, RENDER_BUDGETS.lightSpaceCulling.featherPx, 'culling should expose feather pixels');
assert(culling.regions[0].innerBounds, 'light-space regions should expose inner bounds');
assert(culling.regions[0].outerBounds, 'light-space regions should expose outer bounds');
assert(screenRectIntersectsLightSpace(culling, { x: 120, y: 70, w: 12, h: 12 }), 'detail inside a light bubble should render');
equal(screenRectIntersectsLightSpace(culling, { x: 0, y: 0, w: 8, h: 8 }), false, 'detail outside light bubbles should be culled');
equal(getLightSpaceAlphaAtPoint(culling, 0, 0), 0, 'detail outside outer bounds should have zero alpha');
assert(getLightSpaceAlphaAtPoint(culling, 120, 70) > 0.9, 'detail inside inner bounds should stay fully visible');

const renderLayers = createRenderLayerState();
resetLightSpaceCullingStats(renderLayers.lightSpaceCulling, culling);
renderLayers.lightSpaceCulling.skippedTerrainTiles = 9;
renderLayers.lightSpaceCulling.skippedActors = 2;
renderLayers.lightSpaceCulling.culledSmokeSources = 3;
const stats = getRenderLayerStats(renderLayers);
equal(stats.lightSpaceCullingPolicy, 'feathered_expanded_light_bounds_render_gate', 'stats should expose light-space culling policy');
equal(stats.lightSpaceMergedRegions, 1, 'stats should expose merged light-region count');
equal(stats.lightSpaceFeatherPx, RENDER_BUDGETS.lightSpaceCulling.featherPx, 'stats should expose feather pixels');
assert(stats.lightSpaceFeatheredCoverageRatio > stats.lightSpaceCoverageRatio, 'stats should expose feathered coverage');
equal(stats.skippedTerrainTilesOutsideLight, 9, 'stats should expose terrain detail skipped outside light');
equal(stats.skippedActorsOutsideLight, 2, 'stats should expose actor detail skipped outside light');
equal(stats.culledSmokeSourcesOutsideLight, 3, 'stats should expose smoke sources culled outside light');
