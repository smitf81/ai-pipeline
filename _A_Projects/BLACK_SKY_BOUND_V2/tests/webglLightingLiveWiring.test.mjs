import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { LightingProfileId, LIGHTING_PROFILES } from '../src/data/lightingProfiles.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { buildLightViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { EMITTER_LIGHT_COMPOSITE_MODE } from '../src/render/backends/webgl/WebGLEmitterLightComposite.js';
import { WebGLActorLayer } from '../src/render/backends/webgl/layers/WebGLActorLayer.js';
import {
  WebGLLightingLayer,
  WEBGL_SHADOW_COMPOSITE_MODE,
  WEBGL_SHADOW_MODE
} from '../src/render/backends/webgl/layers/WebGLLightingLayer.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
const profile = LIGHTING_PROFILES[LightingProfileId.EARLY_NIGHT];

const projectionA = buildProjectionAt(0);
const projectionB = buildProjectionAt(0.37);

equal(projectionA.lightingProfile.classification, 'renderer_neutral_lighting_profile_projection', 'projection should expose the lighting profile as renderer-neutral data');
equal(projectionA.lightingProfile.id, profile.id, 'projection should use the active lighting profile id');
equal(projectionA.lightingProfile.darknessOpacity, profile.darknessOpacity, 'projection should carry profile darkness opacity');
equal(projectionA.lightingProfile.lightRevealStrength, profile.lightRevealStrength, 'projection should carry profile light reveal strength');
equal(projectionA.lightingProfile.warmBloomOpacity, profile.warmBloomOpacity, 'projection should carry profile warm bloom opacity');
equal(projectionA.lightingProfile.shadowFieldSampleCount, profile.shadowFieldSampleCount, 'projection should carry shadow-field sample count');
equal(projectionA.lightingProfile.shadowCompositeMode, WEBGL_SHADOW_COMPOSITE_MODE, 'projection should carry the light/shadow composite mode');
equal(projectionA.lightingProfile.shadowLightBlendStrength, profile.shadowLightBlendStrength, 'projection should carry shadow/light blend strength');
equal(projectionA.lightingProfile.shadowFieldEdgeSoftness, profile.shadowFieldEdgeSoftness, 'projection should carry SDF shadow edge softness');
equal(projectionA.lightingProfile.lightHaloBlendScale, profile.lightHaloBlendScale, 'projection should carry light halo blend scale');
assert(projectionA.lights.length > 0, 'projection should include light packets');
assert(projectionA.lights.every((light) => light.classification === 'renderer_neutral_light_projection'), 'all light packets should declare renderer-neutral classification');
assert(projectionA.lights.every((light) => typeof light.flickerAmount === 'number'), 'light packets should preserve flicker amount');
assert(projectionA.lights.every((light) => typeof light.flickerSpeed === 'number'), 'light packets should preserve flicker speed');
assert(projectionA.lights.every((light) => typeof light.flickerPhase === 'number'), 'light packets should preserve flicker phase');
assert(projectionA.lights.every((light) => typeof light.effectiveIntensity === 'number'), 'light packets should expose resolved effective intensity');
assert(projectionA.lights.every((light) => typeof light.revealRadius === 'number' && typeof light.glowRadius === 'number' && typeof light.coreRadius === 'number'), 'light packets should expose split reveal/glow/core radii');
assert(projectionA.lights.every((light) => typeof light.revealStrength === 'number' && typeof light.glowStrength === 'number' && typeof light.coreStrength === 'number'), 'light packets should expose split reveal/glow/core strengths');

const flickerA = projectionA.lights.find((light) => light.flickerAmount > 0);
const flickerB = projectionB.lights.find((light) => light.id === flickerA.id);
assert(Math.abs(flickerA.effectiveIntensity - flickerB.effectiveIntensity) > 0.0001, 'flicker should deterministically change projected light intensity when render time changes');
assert(Math.abs(flickerA.radius - flickerB.radius) > 0.0001, 'flicker should subtly change projected light radius when render time changes');
assert(Math.abs(flickerA.revealRadius - flickerB.revealRadius) < Math.abs(flickerA.radius - flickerB.radius), 'broad reveal should remain more stable than visible flickering glow for LoD readability');
assert(flickerA.effectiveIntensity < 1, 'projected torch intensity should stay bounded below harsh over-bright output');
assert(flickerA.revealRadius > flickerA.glowRadius && flickerA.glowRadius > flickerA.coreRadius, 'projected torch should separate reveal, glow, and core scale');

const lightingLayer = new WebGLLightingLayer();
lightingLayer.update(projectionA, fakeLightingContext(projectionA));
equal(lightingLayer.profileId, profile.id, 'WebGL lighting layer should consume the projected lighting profile id');
equal(lightingLayer.darknessOpacity, profile.darknessOpacity, 'WebGL darkness overlay should use profile darkness opacity');
equal(lightingLayer.lightRevealStrength, profile.lightRevealStrength, 'WebGL lighting should use profile reveal strength');
equal(lightingLayer.sourceLightCount, projectionA.lights.length, 'WebGL active light count should count source lights, not expanded primitives');
equal(lightingLayer.flickeringLightCount, projectionA.lights.filter((light) => light.flickerAmount > 0).length, 'WebGL diagnostics should count flickering lights');
equal(lightingLayer.lightInfluences.length, projectionA.lights.length * 3, 'WebGL should use reveal, glow, and core primitives per light');
assert(lightingLayer.lightInfluences.every((influence) => influence.color[3] <= 0.38), 'WebGL light alpha should be tuned below harsh additive blowout');
assert(lightingLayer.lightInfluences[0].color[0] > lightingLayer.lightInfluences[0].color[1], 'outer torch light should remain warm amber rather than white');
equal(lightingLayer.emitterCompositeMode, EMITTER_LIGHT_COMPOSITE_MODE, 'WebGL should report the split emitter composite mode');
assert(lightingLayer.localRevealInfluences.length > 0 && lightingLayer.localGlowInfluences.length > 0, 'WebGL should split local emitter reveal and glow primitives');
assert(lightingLayer.statsFields().localGlowInfluenceCount === lightingLayer.localGlowInfluences.length, 'WebGL should report local glow primitive count');
equal(lightingLayer.shadowCompositeMode, WEBGL_SHADOW_COMPOSITE_MODE, 'WebGL lighting layer should use the profiled light/shadow composite mode');
equal(lightingLayer.shadowBlendStrength, profile.shadowLightBlendStrength, 'WebGL lighting layer should use profiled shadow blend strength');
equal(lightingLayer.shadowFieldEdgeSoftness, profile.shadowFieldEdgeSoftness, 'WebGL lighting layer should use profiled SDF edge softness');
equal(lightingLayer.shadowFieldTailFloor, profile.shadowFieldTailFloor, 'WebGL lighting layer should use profiled tail fade floor');
equal(lightingLayer.statsFields().occlusionShadowRenderable, true, 'WebGL should mark explicit scene-object shadow wedges renderable');
equal(lightingLayer.statsFields().occlusionShadowMode, WEBGL_SHADOW_MODE, 'WebGL should report the SDF-ready shadow-field mode');
assert(lightingLayer.statsFields().shadowContactTriangleCount > 0, 'WebGL should report anchored contact shadow triangles');
assert(lightingLayer.statsFields().shadowSegmentCount > 0, 'WebGL should report segmented shadow falloff');
assert(lightingLayer.statsFields().shadowFieldPacketCount > 0, 'WebGL should report SDF-ready shadow field packets');
assert(lightingLayer.statsFields().shadowFieldSampleCount > 0, 'WebGL should report SDF-ready shadow field samples');
assert(lightingLayer.statsFields().shadowFieldPacketCount > projectionA.occlusionShadows.approximateShadowRegions, 'compound SDF silhouettes should produce more shader packets than broad shadow regions');
equal(lightingLayer.statsFields().shadowSilhouettePrimitiveCount, projectionA.occlusionShadows.shadowSilhouettePrimitiveCount, 'WebGL should report active silhouette SDF primitive count');
equal(lightingLayer.statsFields().shadowShaderMode, WEBGL_SHADOW_MODE, 'WebGL should report the bounded capsule SDF shader consumer mode');
equal(lightingLayer.statsFields().shadowCompositeMode, WEBGL_SHADOW_COMPOSITE_MODE, 'WebGL should report the light/shadow composite mode');
equal(lightingLayer.statsFields().shadowBlendStrength, profile.shadowLightBlendStrength, 'WebGL should report the profiled shadow blend strength');
equal(lightingLayer.statsFields().shadowShaderPacketCount, lightingLayer.statsFields().shadowFieldPacketCount, 'WebGL shader should consume accepted shadow-field packets');
equal(lightingLayer.statsFields().shadowShaderPrimitiveCount, lightingLayer.statsFields().shadowFieldPacketCount, 'WebGL should render one bounded SDF primitive per field packet');
equal(lightingLayer.statsFields().shadowFieldPrimitiveCount, lightingLayer.statsFields().shadowShaderPrimitiveCount, 'legacy field primitive count should report the active shader primitive count');
assert(lightingLayer.shadowShaderFields.every((field) => field.edgeGamma === profile.shadowFieldPenumbraGamma), 'SDF fields should carry profiled penumbra gamma into the shader packet');
assert(lightingLayer.shadowShaderFields.every((field) => field.tailFloor === profile.shadowFieldTailFloor), 'SDF fields should carry profiled tail fade into the shader packet');
const packetById = new Map(projectionA.occlusionShadows.shadowFieldPackets.map((packet) => [packet.id, packet]));
assert(lightingLayer.shadowShaderFields.every((field) => {
  const packet = packetById.get(field.packetId);
  const expectedStart = Math.max(3, packet.kernel.radiusStart * profile.shadowFieldRadiusScale);
  const expectedEnd = Math.max(3, packet.kernel.radiusEnd * profile.shadowFieldRadiusScale * profile.shadowFieldTailTaperScale);
  return Math.abs(field.radiusStart - expectedStart) < 0.001 && Math.abs(field.radiusEnd - expectedEnd) < 0.001;
}), 'SDF fields should apply profiled radius scale and far-tail taper relative to canonical packets');

equal(projectionA.lightSpaceCulling.classification, 'derived_render_budget_gate', 'projection should carry live light-space culling data');
equal(projectionA.debug.lightSpaceCullingMode, 'live_webgl_render_detail_gate', 'projection debug should label light-space culling as live');
equal(projectionA.occlusionShadows.classification, 'derived_render_shadow_projection', 'projection should carry occlusion shadow projection data');
assert(projectionA.occlusionShadows.activeBlockers > 0, 'current scene should expose explicit scene-object occlusion blockers');
assert(projectionA.occlusionShadows.approximateShadowRegions > 0, 'current scene should project visible scene-object shadow wedges');
assert(projectionA.occlusionShadows.shadowFieldPacketCount > 0, 'current scene should project SDF-ready shadow field packets');
assert(projectionA.occlusionShadows.shadowSilhouettePrimitiveCount > projectionA.occlusionShadows.approximateShadowRegions, 'current scene should project compound silhouette SDF primitives');
assert(projectionA.occlusionShadows.actorShadowBlockers > 0, 'current scene should derive render-only actor shadow blockers');
assert(projectionA.occlusionShadows.actorShadowFieldPacketCount > 0, 'current scene should project actor-sourced SDF shadow packets');
equal(projectionA.debug.occlusionShadowMode, 'projection_live_sdf_ready_shadow_field_v1', 'projection debug should label live SDF-ready shadow field rendering');

const actorLayer = new WebGLActorLayer();
actorLayer.update(fakeActorProjection(), fakeCullingContext());
equal(actorLayer.lightSpaceGateActive, true, 'WebGL actor layer should receive the live light-space gate');
equal(actorLayer.lightSpaceCulledCount, 0, 'WebGL actor layer should not fully cull unlit non-player actors');
equal(actorLayer.actorShadowLodCount, 1, 'WebGL actor layer should render unlit non-player actors as black shadow LoD');
assert(actorLayer.actorShadowLodPrimitiveCount > 0, 'shadow LoD should emit cheap actor presence primitives');
equal(actorLayer.rects.length, 3, 'player, lit enemy, and unlit enemy contact LoD should remain rendered after light-space gating');

const lightingSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLLightingLayer.js', import.meta.url), 'utf8');
assert(lightingSource.includes('profiled_flicker_light_cutouts_v2'), 'WebGL lighting mode should name profile/flicker ownership');
assert(lightingSource.includes('projection.lightingProfile'), 'WebGL lighting layer should consume projected lighting profile data');
assert(lightingSource.includes('drawWorldRadialSaturatedLights'), 'WebGL local emitter glow should use capped/saturated compositing');
assert(lightingSource.includes('webgl_bounded_capsule_sdf_shadow_shader_v0'), 'WebGL lighting layer should name the bounded SDF shader mode');
assert(lightingSource.includes('light_shadow_attenuation_blend_v0'), 'WebGL lighting layer should name the light/shadow attenuation blend mode');
assert(lightingSource.includes('drawScreenSdfShadowFields'), 'WebGL lighting layer should render shadow-field packets through the bounded SDF shader primitive');
assert(!lightingSource.includes("getContext('2d')"), 'WebGL lighting layer should not reintroduce Canvas 2D contexts');

function buildProjectionAt(time) {
  game.renderTime = time;
  game.lights = buildLightViews(game, time);
  return buildRenderProjection({ time, map, game, camera }, CONFIG);
}

function fakeLightingContext(projection) {
  return {
    camera: {
      x: camera.x,
      y: camera.y,
      zoom: camera.zoom,
      viewportW: camera.viewportW,
      viewportH: camera.viewportH,
      visibleWorldBounds() {
        return { left: -10000, top: -10000, right: 10000, bottom: 10000 };
      }
    },
    lightSpaceCulling: projection.lightSpaceCulling
  };
}

function fakeActorProjection() {
  return {
    actors: [
      { id: 'player:test', team: 'player', worldX: 420, worldY: 420, worldRadius: 8, colour: '#d65b28', silhouette: 'marker' },
      { id: 'enemy:lit', team: 'enemy', worldX: -10, worldY: 0, worldRadius: 4, colour: '#8f6a4a', silhouette: 'marker' },
      { id: 'enemy:dark', team: 'enemy', worldX: 420, worldY: 420, worldRadius: 4, colour: '#8f6a4a', silhouette: 'marker' }
    ]
  };
}

function fakeCullingContext() {
  return {
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      viewportW: 200,
      viewportH: 100,
      visibleWorldBounds() {
        return { left: -1000, top: -1000, right: 1000, bottom: 1000 };
      }
    },
    lightSpaceCulling: {
      enabled: true,
      softness: 1,
      regions: [{
        innerBounds: { x: 82, y: 42, w: 36, h: 28 },
        outerBounds: { x: 82, y: 42, w: 36, h: 28 },
        featherPx: 0
      }]
    }
  };
}
