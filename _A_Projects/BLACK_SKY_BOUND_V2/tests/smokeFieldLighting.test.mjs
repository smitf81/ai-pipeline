import { assert, equal } from './assert.mjs';
import { createRenderLayerState, getRenderLayerStats } from '../src/projection/renderLayerState.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { SMOKE_FIELD_PROFILES, SmokeFieldProfileId } from '../src/data/smokeFields.js';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/createGame.js';

const profile = SMOKE_FIELD_PROFILES[SmokeFieldProfileId.LOW_NIGHT_SMOKE];
assert(profile, 'smoke field profile should exist');
equal(profile.classification, 'derived_render_field_profile', 'smoke field profile should declare derived render classification');
assert(profile.densityScale > 0 && profile.densityScale < 1, 'smoke field should render through a lower-resolution density texture');
assert(RENDER_BUDGETS.smokeField.maxSources > 0, 'smoke field should expose a source budget');
assert(RENDER_BUDGETS.smokeField.maxContributingLights > 0, 'smoke field should expose a light interaction budget');
equal(RENDER_BUDGETS.smokeField.updatePolicy, 'single_density_texture', 'smoke should be treated as one field texture, not sticker spam');

const renderLayers = createRenderLayerState();
renderLayers.smokeField.activeSources = 3;
renderLayers.smokeField.contributingLights = 2;
renderLayers.smokeField.texturePasses = 1;
const stats = getRenderLayerStats(renderLayers);
equal(stats.smokeFieldMode, 'single_density_texture', 'diagnostics should surface smoke field render mode');
equal(stats.smokeFieldActiveSources, 3, 'diagnostics should surface active smoke sources');
equal(stats.smokeFieldContributingLights, 2, 'diagnostics should surface light interaction count');
equal(stats.smokeFieldTexturePasses, 1, 'diagnostics should surface smoke texture passes');

const game = createInitialGameState(createDemoMap());
assert(game.smokeField.enabled, 'game should enable the smoke field projection seam');
equal(game.smokeField.profileId, SmokeFieldProfileId.LOW_NIGHT_SMOKE, 'game should use the low night smoke field profile');
