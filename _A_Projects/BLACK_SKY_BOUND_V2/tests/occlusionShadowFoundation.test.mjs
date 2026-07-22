import { assert, equal } from './assert.mjs';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { LightingProfileId, getLightingProfile } from '../src/data/lightingProfiles.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { createDemoMap } from '../src/world/map.js';
import { TerrainType } from '../src/world/terrain.js';
import { createRenderLayerState, getRenderLayerStats } from '../src/projection/renderLayerState.js';
import { buildLightSpaceRenderCulling } from '../src/projection/lightSpaceRenderCulling.js';
import {
  buildExplicitOcclusionBlockers,
  buildOcclusionShadowProjection,
  resetOcclusionShadowStats,
  sampleSdfReadyShadowFieldAt,
  SHADOW_FIELD_CONTRACT
} from '../src/projection/occlusionShadowState.js';

equal(RENDER_BUDGETS.occlusionShadows.enabled, true, 'occlusion shadow pass should be enabled by budget policy');
equal(RENDER_BUDGETS.occlusionShadows.blockerPolicy, 'explicit_scene_and_visual_actor_occluder_projection', 'shadow blockers should come from scene occluders and visual actor projections');
equal(RENDER_BUDGETS.occlusionShadows.missingBlockerPolicy, 'painted_terrain_has_no_height_no_shadows', 'painted terrain should not be promoted into height blockers');
equal(RENDER_BUDGETS.occlusionShadows.shadowPolicy, 'nearby_scene_and_dynamic_actor_sdf_ready_shadow_field_v1', 'shadow policy should use the SDF-ready shadow-field bridge');
equal(RENDER_BUDGETS.occlusionShadows.shadowFieldContract, SHADOW_FIELD_CONTRACT, 'shadow budget should expose the SDF-ready field contract');
equal(RENDER_BUDGETS.occlusionShadows.lightSpaceClippingPolicy, 'clip_shadow_work_to_light_space_regions', 'shadow work should declare light-space clipping');

const paintedTerrainMap = {
  width: 8,
  height: 8,
  tiles: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => TerrainType.GRASS))
};
paintedTerrainMap.tiles[3][3] = TerrainType.ROCK;
paintedTerrainMap.tiles[3][5] = TerrainType.FOREST;

const terrainBlockers = buildExplicitOcclusionBlockers(paintedTerrainMap);
equal(terrainBlockers.blockers.length, 0, 'terrain maps should not be accepted as occlusion blocker input');

const explicitBlockerSource = [
  { id: 'tree:future', kind: 'tree', x: 3.5, y: 3.5, radius: 0.45, height: 1.4, static: true },
  { id: 'floor-paint', kind: 'painted_floor', x: 5.5, y: 3.5, radius: 0.5 }
];
const blockers = buildExplicitOcclusionBlockers(explicitBlockerSource);
equal(blockers.blockers.length, 1, 'only explicit blockers with height should project shadows');
equal(blockers.ignoredBlockers, 1, 'blocker-like inputs without height should be ignored');
assert(blockers.blockers.every((blocker) => blocker.id.startsWith('explicit_occlusion_blocker:')), 'blockers should not be inferred from terrain labels');
assert(blockers.blockers.every((blocker) => blocker.height > 0), 'all accepted blockers should carry height data');

const game = createInitialGameState(createDemoMap());
assert(game.occlusionBlockers.length > 0, 'current demo should expose explicit tree/boulder occluder entities');
assert(game.occlusionBlockers.every((blocker) => blocker.source === 'scenario.sceneObjects'), 'demo blockers should come from explicit scene objects');
assert(game.occlusionBlockers.some((blocker) => blocker.shadowSilhouette?.contract === 'scene_object_shadow_silhouette.v1'), 'demo blockers should carry renderer-neutral SDF silhouette profiles');

const camera = { x: 0, y: 0, zoom: 1, viewportW: 220, viewportH: 160 };
const tileSize = 10;
const lights = [{ id: 'torch:test', x: 2.5, y: 3.5, radius: 6, intensity: 1, enabled: true }];
const culling = buildLightSpaceRenderCulling(lights, camera, tileSize);
const profile = getLightingProfile(LightingProfileId.EARLY_NIGHT);
const emptyProjection = buildOcclusionShadowProjection([], lights, camera, tileSize, culling, profile);

equal(emptyProjection.enabled, true, 'shadow projection can remain enabled while awaiting real blockers');
equal(emptyProjection.blockerPolicy, 'explicit_scene_and_visual_actor_occluder_projection', 'projection should expose explicit blocker policy');
equal(emptyProjection.activeBlockers, 0, 'empty blocker input should have no shadow blockers');
equal(emptyProjection.shadowCastingLights, 0, 'no explicit blockers means no shadow-casting lights');
equal(emptyProjection.approximateShadowRegions, 0, 'no explicit blockers means no fake shadow wedges');

const projection = buildOcclusionShadowProjection(explicitBlockerSource, lights, camera, tileSize, culling, profile);
equal(projection.enabled, true, 'shadow projection should be enabled by the lighting profile');
equal(projection.clippedToLightSpace, true, 'shadow projection should be clipped to light-space');
equal(projection.activeBlockers, 1, 'projection should expose active explicit blocker count');
equal(projection.shadowCastingLights, 1, 'nearby explicit blockers should create a shadow-casting light');
assert(projection.approximateShadowRegions >= 1, 'nearby explicit blockers should project shadow regions');
assert(projection.shadowRegions.every((region) => region.points.length === 4), 'shadow regions should be cheap wedges');
assert(projection.shadowRegions.every((region) => region.quality === 'sdf_ready_anchored_shadow_field_v1'), 'shadow regions should declare the SDF-ready anchored field quality contract');
assert(projection.shadowRegions.every((region) => region.contactRadius > 0 && region.length > 0), 'shadow regions should expose contact and length facts for WebGL falloff composition');
assert(projection.shadowRegions.every((region) => region.direction && region.normal), 'shadow regions should expose direction and normal vectors for anchored rendering');
equal(projection.shadowFieldContract, SHADOW_FIELD_CONTRACT, 'projection should expose the SDF-ready shadow-field contract');
equal(projection.shadowFieldPacketCount, projection.approximateShadowRegions, 'radius-only blockers should still produce one fallback field packet per region');
assert(projection.shadowFieldSampleCount >= projection.shadowFieldPacketCount * 3, 'shadow field packets should expose multiple SDF bridge samples');
assert(projection.shadowFieldPackets.every((packet) => packet.contract === SHADOW_FIELD_CONTRACT), 'all shadow field packets should use the declared contract');
assert(projection.shadowFieldPackets.every((packet) => packet.classification === 'derived_sdf_ready_shadow_field_packet'), 'shadow field packets should be derived projection data');
assert(projection.shadowFieldPackets.every((packet) => packet.kernel?.type === 'screen_space_tapered_capsule_sdf'), 'field packets should expose the shader kernel');
assert(projection.shadowFieldPackets.every((packet) => packet.samples.every((sample) => sample.radius > 0 && sample.dimness > 0)), 'field samples should carry visible radius and dimness data');
const fieldPacket = projection.shadowFieldPackets[0];
const midpointProbe = sampleSdfReadyShadowFieldAt(projection.shadowFieldPackets, {
  x: (fieldPacket.kernel.start.x + fieldPacket.kernel.end.x) * 0.5,
  y: (fieldPacket.kernel.start.y + fieldPacket.kernel.end.y) * 0.5
});
const outsideProbe = sampleSdfReadyShadowFieldAt(projection.shadowFieldPackets, {
  x: fieldPacket.kernel.start.x - fieldPacket.kernel.normal.x * fieldPacket.kernel.radiusStart * 5,
  y: fieldPacket.kernel.start.y - fieldPacket.kernel.normal.y * fieldPacket.kernel.radiusStart * 5
});
equal(midpointProbe.classification, 'debug_shadow_field_probe', 'field sampler should label itself as debug probe data');
equal(midpointProbe.authority, 'validation_probe_only_not_gameplay_visibility_truth', 'field sampler should not become gameplay visibility authority');
assert(midpointProbe.dimness > 0, 'field sampler should report dimness inside the SDF field');
equal(outsideProbe.dimness, 0, 'field sampler should report no dimness outside the SDF field');

const renderLayers = createRenderLayerState();
resetOcclusionShadowStats(renderLayers.occlusionShadows, emptyProjection);
const stats = getRenderLayerStats(renderLayers);
equal(stats.occlusionShadowEnabled, true, 'stats should expose shadow pass status');
equal(stats.occlusionBlockerPolicy, 'explicit_scene_and_visual_actor_occluder_projection', 'stats should expose explicit blocker policy');
equal(stats.occlusionMissingBlockerPolicy, 'painted_terrain_has_no_height_no_shadows', 'stats should expose why painted terrain is not a blocker');
equal(stats.occlusionShadowPolicy, 'nearby_scene_and_dynamic_actor_sdf_ready_shadow_field_v1', 'stats should expose shadow policy');
equal(stats.occlusionShadowsClippedToLightSpace, true, 'stats should expose light-space clipping');
equal(stats.activeOcclusionBlockers, 0, 'stats should expose zero current blockers');
equal(stats.shadowCastingLights, 0, 'stats should expose no fake shadow-casting lights');
equal(stats.approximateShadowRegions, 0, 'stats should expose no fake shadow regions');
equal(stats.occlusionShadowFieldContract, SHADOW_FIELD_CONTRACT, 'stats should expose the shadow-field contract');
equal(stats.occlusionShadowFieldPacketCount, 0, 'stats should expose no shadow-field packets for empty projection');
equal(stats.occlusionShadowSilhouettePrimitiveCount, 0, 'stats should expose no silhouette primitives for empty projection');
