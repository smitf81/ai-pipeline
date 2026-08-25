import { assert, equal } from './assert.mjs';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { getLightingProfile, LightingProfileId } from '../src/data/lightingProfiles.js';
import { buildVisibleLightProjection, IlluminationState } from '../src/projection/lightProjection.js';
import { buildLightSpaceRenderCulling } from '../src/projection/lightSpaceRenderCulling.js';
import { buildOcclusionShadowProjection } from '../src/projection/occlusionShadowState.js';
import { WebGLShadowGeometryCache } from '../src/render/backends/webgl/WebGLShadowGeometryCache.js';
import { WebGLStaticLightInfluenceCache } from '../src/render/backends/webgl/WebGLStaticLightInfluenceCache.js';
import { WebGLLightingLayer } from '../src/render/backends/webgl/layers/WebGLLightingLayer.js';

const camera = { x: 0, y: 0, zoom: 1, viewportW: 800, viewportH: 600 };
const tileSize = 32;
const visible = Array.from({ length: 8 }, (_, index) => light(`visible:${index}`, index - 3.5, index % 2 ? 1.2 : -1.2, {
  flickerAmount: index % 2 ? 0.12 : 0,
  shadowPriority: 40 - index
}));
const offscreen = Array.from({ length: 24 }, (_, index) => light(`offscreen:${index}`, 80 + index, 0));
const selected = buildVisibleLightProjection([...visible, ...offscreen], camera, tileSize, RENDER_BUDGETS.lightEmitters);

equal(selected.diagnostics.inputCount, 32, 'light selection should report every source considered');
equal(selected.diagnostics.dormantCount, 24, 'off-screen lights should become dormant before projection');
equal(selected.diagnostics.projectedCount, 8, 'only camera-intersecting light influences should be projected');
equal(selected.diagnostics.nearbyStaticCount, 4, 'fixed visible lights should enter the nearby-static state');
equal(selected.diagnostics.activeDynamicCount, 4, 'flickering visible lights should enter the active-dynamic state');
assert(selected.lights.every((item) => item.illuminationState !== IlluminationState.DORMANT), 'dormant lights should not reach renderer packets');

const criticalBudget = buildVisibleLightProjection([
  ...visible,
  light('moon', 0, 0, { sourceKind: 'moonlight', shadowPriority: 200 })
], camera, tileSize, { ...RENDER_BUDGETS.lightEmitters, maxActive: 2 });
equal(criticalBudget.lights[0].illuminationState, IlluminationState.CRITICAL, 'critical world-event light should survive the active-light budget first');
assert(buildVisibleLightProjection([light('ember', 0, 0, { sourceKind: 'ember', radius: 2, revealRadius: 2 })], camera, tileSize).lights.every((item) => item.castsShadows === false), 'minor decorative emitters should illuminate without geometric shadows');
const rejectedOffscreenLightning = buildVisibleLightProjection([
  light('storm:far', 900, -700, { sourceKind: 'storm_lightning', sceneLight: true, stormEvent: { eventIndex: 4, flashIndex: 1 } })
], { ...camera, x: 640, y: 960 }, tileSize).lights[0];
equal(rejectedOffscreenLightning, undefined, 'projection should not move an invalid offscreen storm origin into the camera');
const acquiredLightningInput = light('storm:acquired', 20, 30, {
  sourceKind: 'storm_lightning',
  sceneLight: true,
  radius: 122,
  visualAnchorPolicy: 'fixed_world_storm_event_origin_v1',
  stormEvent: {
    eventIndex: 4,
    flashIndex: 1,
    originAcquisition: { policy: 'viewport_acquired_then_world_frozen_v1', worldFrozen: true }
  }
});
const acquiredLightning = buildVisibleLightProjection([acquiredLightningInput], { ...camera, x: 640, y: 960 }, tileSize).lights[0];
assert(acquiredLightning, 'a viewport-acquired storm strike should reach projection at its real world location');
equal(acquiredLightning.visualAnchorPolicy, 'fixed_world_storm_event_origin_v1', 'lightning should publish its fixed-world visual anchoring policy');
equal(acquiredLightning.x, 20, 'projection should preserve scheduler-owned world X');
equal(acquiredLightning.y, 30, 'projection should preserve scheduler-owned world Y');
equal(acquiredLightning.stormEvent.originAcquisition.policy, 'viewport_acquired_then_world_frozen_v1', 'projection should preserve acquisition provenance');

const projectedLights = selected.lights;
const culling = buildLightSpaceRenderCulling(projectedLights, camera, tileSize);
const blockers = Array.from({ length: 48 }, (_, index) => ({
  id: `blocker:${index}`,
  x: -0.7 + (index % 8) * 0.2,
  y: -0.7 + Math.floor(index / 8) * 0.22,
  radius: 0.13,
  height: 0.8,
  castsShadow: true,
  static: true
}));
const profile = getLightingProfile(LightingProfileId.EARLY_NIGHT);
const shadowA = buildOcclusionShadowProjection(blockers, projectedLights, camera, tileSize, culling, profile);
const shadowB = buildOcclusionShadowProjection(blockers, projectedLights, camera, tileSize, culling, profile);
assert(shadowA.shadowCastingLights <= RENDER_BUDGETS.occlusionShadows.maxShadowCastingLights, 'geometric shadow lights should respect the global cap');
assert(shadowA.shadowRegions.length <= RENDER_BUDGETS.occlusionShadows.maxShadowCastingLights * RENDER_BUDGETS.occlusionShadows.maxBlockersPerLight, 'shadow regions should respect the per-light blocker cap');
const regionsPerBlocker = new Map();
for (const region of shadowA.shadowRegions) regionsPerBlocker.set(region.blockerId, (regionsPerBlocker.get(region.blockerId) ?? 0) + 1);
assert([...regionsPerBlocker.values()].every((count) => count <= RENDER_BUDGETS.occlusionShadows.maxShadowLightsPerBlocker), 'each blocker should accept only the strongest bounded set of shadow lights');
equal(shadowB.staticBlockerCacheHits, blockers.length, 'static blocker silhouettes should be reused on later projections');

let geometryBuilds = 0;
let fieldBuilds = 0;
const geometryCache = new WebGLShadowGeometryCache({
  buildShadowGeometry(regions) {
    geometryBuilds += 1;
    return { triangles: regions.map((region) => region.id), penumbraTriangleCount: 0, coreTriangleCount: 0, contactTriangleCount: 0, segmentCount: 0 };
  },
  buildShadowShaderFields(packets) {
    fieldBuilds += 1;
    return packets.map((packet) => packet.id);
  }
});
const cacheableRegions = [{ id: 'region', lightId: 'static', blockerId: 'tree', cacheableGeometry: true, points: [{ x: 1, y: 2 }] }];
const cacheablePackets = [{ id: 'packet', cacheableGeometry: true, kernel: {}, samples: [] }];
equal(geometryCache.resolve(cacheableRegions, cacheablePackets, profile, {}).cacheHit, false, 'first static shadow preparation should populate the geometry cache');
equal(geometryCache.resolve(cacheableRegions, cacheablePackets, profile, {}).cacheHit, true, 'unchanged static shadow preparation should hit the geometry cache');
equal(geometryBuilds, 1, 'cached static shadow triangles should be built once');
equal(fieldBuilds, 1, 'cached static shadow shader fields should be built once');

let influenceBuilds = 0;
const influenceCache = new WebGLStaticLightInfluenceCache((item) => {
  influenceBuilds += 1;
  return [{ id: item.id }];
});
influenceCache.beginFrame();
influenceCache.resolve({ ...selected.lights.find((item) => item.illuminationState === IlluminationState.NEARBY_STATIC) }, profile, {});
influenceCache.endFrame();
influenceCache.beginFrame();
const staticLight = selected.lights.find((item) => item.illuminationState === IlluminationState.NEARBY_STATIC);
influenceCache.resolve({ ...staticLight }, profile, {});
const cacheStats = influenceCache.endFrame();
equal(influenceBuilds, 1, 'unchanged nearby-static light influences should be built once');
equal(cacheStats.hitCount, 1, 'nearby-static light cache should report the reuse');

const illuminationOnlyLayer = new WebGLLightingLayer({ renderShadows: false });
illuminationOnlyLayer.update({ lights: [], lightingProfile: profile, occlusionShadows: shadowA }, {
  camera: { visibleWorldBounds: () => ({ left: -1000, top: -1000, right: 1000, bottom: 1000 }) }
});
equal(illuminationOnlyLayer.shadowGeometryCacheRebuilds, 0, 'illumination-only layer should not duplicate shadow geometry preparation');
equal(illuminationOnlyLayer.shadowTriangles.length, 0, 'illumination-only layer should retain no unused shadow triangles');

function light(id, x, y, overrides = {}) {
  return {
    id,
    enabled: true,
    x,
    y,
    radius: 5,
    revealRadius: 7,
    intensity: 0.7,
    revealStrength: 0.7,
    glowStrength: 0.5,
    coreStrength: 0.7,
    sourceKind: 'torch',
    sourceAnchor: { type: 'performance_fixture' },
    ...overrides
  };
}
