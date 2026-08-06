import { assert, equal } from './assert.mjs';
import {
  resolveShadowShapeProfile,
  SHADOW_SHAPE_PROFILE_CONTRACT,
  ShadowShapeProfileId
} from '../src/data/shadowShapeProfiles.js';
import { LightingProfileId, getLightingProfile } from '../src/data/lightingProfiles.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { buildLightSpaceRenderCulling } from '../src/projection/lightSpaceRenderCulling.js';
import { buildOcclusionShadowProjection } from '../src/projection/occlusionShadowState.js';
import { buildShadowGeometry } from '../src/render/backends/webgl/WebGLShadowGeometry.js';
import { createDemoMap } from '../src/world/map.js';

const broad = resolveShadowShapeProfile(ShadowShapeProfileId.BROAD_TREE);
const narrow = resolveShadowShapeProfile(ShadowShapeProfileId.NARROW_TRUNK);
const rock = resolveShadowShapeProfile(ShadowShapeProfileId.ROCK);
const creature = resolveShadowShapeProfile(ShadowShapeProfileId.CREATURE);
const tent = resolveShadowShapeProfile(ShadowShapeProfileId.TENT);
const wall = resolveShadowShapeProfile(ShadowShapeProfileId.WALL_SEGMENT);
const none = resolveShadowShapeProfile(ShadowShapeProfileId.NO_SHADOW);

assert([broad, narrow, rock, creature, tent, wall, none].every((shape) => shape.contract === SHADOW_SHAPE_PROFILE_CONTRACT), 'all shadow families should share one declarative contract');
equal(none.castsShadow, false, 'no-shadow should be an explicit family rather than a magic omission');
equal(broad.contact.shape, 'capsule', 'broad trees should use a compact authored ground capsule');
equal(rock.contact.shape, 'polygon', 'rocks should use an authored faceted ground footprint');
assert(broad.projection.lengthScale > rock.projection.lengthScale, 'tall trees should project longer streaks than rocks');
assert(narrow.projection.baseWidthScale < broad.projection.baseWidthScale, 'narrow trunks should begin with a tighter projected root');

const map = createDemoMap();
const game = createInitialGameState(map);
const blockerById = new Map(game.occlusionBlockers.map((blocker) => [blocker.id, blocker]));
const liveProfiles = new Set(game.occlusionBlockers.map((blocker) => blocker.shadowShape?.profileId));
assert(liveProfiles.has(ShadowShapeProfileId.BROAD_TREE), 'live tree objects should resolve the broad-tree family');
assert(liveProfiles.has(ShadowShapeProfileId.NARROW_TRUNK), 'live dead snags should resolve the narrow-trunk family');
assert(liveProfiles.has(ShadowShapeProfileId.ROCK), 'live boulders should resolve the rock family');
assert(game.sceneObjects.filter((object) => object.occlusion?.castsShadow !== false).every((object) => blockerById.get(object.id)?.shadowShape), 'each live scenery caster should carry a resolved shadow family');

const caster = game.occlusionBlockers.find((blocker) => blocker.shadowShape?.profileId === ShadowShapeProfileId.BROAD_TREE);
const camera = { x: caster.x * 32, y: caster.y * 32, zoom: 2, viewportW: 960, viewportH: 540 };
const light = { id: 'family-test-light', x: caster.x - 2, y: caster.y - 1.5, radius: 7, intensity: 1, enabled: true };
const culling = buildLightSpaceRenderCulling([light], camera, 32);
const projection = buildOcclusionShadowProjection([caster], [light], camera, 32, culling, getLightingProfile(LightingProfileId.EARLY_NIGHT));
const region = projection.shadowRegions[0];
assert(region.contactFootprint?.radiusX > region.contactFootprint?.radiusY, 'tree contact should stay short across the ground plane');
assert(region.shadowShapeProfileId === ShadowShapeProfileId.BROAD_TREE, 'projection should preserve family identity');
assert(projection.shadowFieldPackets.every((packet) => packet.contactSeparated === true), 'projected SDF streaks should declare separate contact ownership');
assert(projection.shadowFieldPackets.every((packet) => Math.hypot(packet.kernel.start.x - region.contactFootprint.center.x, packet.kernel.start.y - region.contactFootprint.center.y) > 0), 'projected streaks should begin beyond the contact center');

const geometry = buildShadowGeometry([region, { ...region, lightId: 'second-light' }], getLightingProfile(LightingProfileId.EARLY_NIGHT));
equal(geometry.contactFootprintCount, 1, 'contact geometry should be deduplicated per caster across overlapping lights');
assert(geometry.contactTriangleCount > 0, 'contact footprints should produce bounded soft geometry');
equal(geometry.penumbraTriangleCount + geometry.coreTriangleCount, 0, 'contact geometry should not rebuild the projected shadow wedge');
equal(geometry.coarseProjectedTriangleCount, 0, 'coarse projected geometry should remain retired');
