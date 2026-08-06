import { existsSync, readFileSync } from 'node:fs';
import { assert, deepEqual, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/state.js';
import { createCamera } from '../src/render/camera.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { addDecalStamp } from '../src/projection/renderLayerState.js';
import { addNapalmPool } from '../src/projection/napalmLayerState.js';
import { syncGameViews } from '../src/game/selectors.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import {
  createWebGLLayers,
  WEBGL_LAYER_ORDER,
  WEBGL_ILLUMINATION_WORLD_DEPTH_COMPOSITE_CONTRACT
} from '../src/render/backends/webgl/WebGLGameRenderer.js';

const requiredFiles = [
  'src/render/backends/webgl/WebGLGameRenderer.js',
  'src/render/backends/webgl/WebGLSceneRoot.js',
  'src/render/backends/webgl/WebGLCamera2D.js',
  'src/render/backends/webgl/WebGLRenderLayerRegistry.js',
  'src/render/backends/webgl/WebGLPostProcessPipeline.js',
  'src/render/backends/webgl/WebGLIlluminationPipeline.js',
  'src/render/backends/webgl/layers/WebGLTerrainLayer.js',
  'src/render/backends/webgl/WebGLLightSpaceGate.js',
  'src/render/backends/webgl/layers/WebGLDecalLayer.js',
  'src/render/backends/webgl/layers/WebGLActorLayer.js',
  'src/render/backends/webgl/layers/WebGLWorldDepthLayer.js',
  'src/render/backends/webgl/layers/WebGLEffectLayer.js',
  'src/render/backends/webgl/layers/WebGLLightingLayer.js',
  'src/render/backends/webgl/layers/WebGLFogSmokeLayer.js',
  'src/render/backends/webgl/layers/WebGLPostProcessLayer.js',
  'src/render/backends/webgl/layers/WebGLAtmosphericOverlayLayer.js',
  'src/render/backends/webgl/layers/WebGLGameplayOverlayLayer.js',
  'src/render/backends/webgl/layers/WebGLWorldEventLayer.js',
  'src/render/backends/webgl/layers/WebGLHudDebugLayer.js',
  'src/render/backends/webgl/WebGLPixelFont.js',
  'src/render/backends/webgl/WebGLWyvernSilhouette.js',
  'src/render/backends/webgl/WebGLHumanoidSilhouette.js',
  'src/render/backends/webgl/WebGLFlameGeometry.js',
  'src/render/backends/webgl/WebGLRenderStats.js',
  'src/data/worldScale.js',
  'src/data/humanoids/raiderHumanoid.js',
  'src/data/creatures/groundedWyvernMotionProfiles.js',
  'src/data/creatures/groundedWyvernProportions.js',
  'src/data/creatures/creatureTuning.js',
  'src/projection/creatures/wyvernProceduralPose.js',
  'src/data/ambientParticles.js',
  'src/data/atmosphericOverlay.js',
  'src/data/postProcessPolish.js',
  'src/projection/ambientParticleProjection.js',
  'src/projection/atmosphericEmitterProjection.js',
  'src/projection/atmosphericOverlayProjection.js',
  'src/projection/effectProjection.js',
  'src/projection/droppedTorchProjection.js'
];

for (const file of requiredFiles) assert(existsSync(new URL(`../${file}`, import.meta.url)), `${file} should exist`);

const map = createDemoMap();
const game = createInitialGameState(map);
wyvernProjectionSystem({ game, dt: 1 / 60 });
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);
addDecalStamp(game.renderLayers, {
  kind: 'test_scorch',
  x: 18,
  y: 12,
  radius: 0.42,
  colour: 'rgba(42,14,8,0.34)',
  opacity: 0.5
});
addNapalmPool(game.renderLayers, {
  x: 20,
  y: 12,
  radius: 0.32,
  lifetime: 12,
  colour: 'rgba(218,68,18,0.56)',
  hotColour: 'rgba(255,184,66,0.82)',
  opacity: 0.9
});
const canvas = { clientWidth: 1280, clientHeight: 720 };
const state = {
  time: 0,
  map,
  game,
  camera: createCamera(canvas, map)
};
const projection = buildRenderProjection(state, CONFIG);

equal(projection.classification, 'renderer_neutral_visual_projection', 'projection should declare neutral classification');
for (const key of ['lightingProfile', 'terrain', 'scenery', 'actors', 'projectiles', 'effects', 'particles', 'decals', 'groundHazards', 'droppedTorches', 'lights', 'lightSpaceCulling', 'occlusionShadows', 'shadowBlockers', 'fogSmoke', 'atmosphericOverlay', 'worldEvents', 'postProcess', 'hud', 'debug']) {
  assert(key in projection, `projection should include ${key}`);
}
equal(projection.terrain.tiles.length, map.width * map.height, 'terrain projection should describe map tiles');
assert(projection.actors.length > 0, 'actor projection should include active actor packets');
const playerActor = projection.actors.find((actor) => actor.team === 'player');
assert(playerActor?.wyvernProjection, 'player actor packet should include renderer-neutral wyvern visual projection');
equal(playerActor.wyvernProjection.bodyPlan, 'four_limb_wyvern', 'wyvern packet should preserve the four-limb body plan');
equal(playerActor.wyvernProjection.anatomyContract.wingDigitOrigin, 'wrist_claw', 'wyvern packet should preserve wrist-origin wing digits');
equal(playerActor.wyvernProjection.anatomyContract.wingMembraneAttachment, 'low_flank_hip', 'wyvern packet should preserve low flank/hip membrane attachment');
equal(playerActor.wyvernProjection.proportionProfile.classification, 'wyvern_proportion_profile', 'wyvern packet should carry renderer-neutral proportion data');
equal(playerActor.wyvernProjection.proportionProfile.focus, 'template_slim_aesthetic_pass', 'wyvern packet should preserve the active slim aesthetic pass scope');
assert(playerActor.wyvernProjection.proportionProfile.completedPasses.includes('head_neck_shoulders_first_pass'), 'wyvern packet should preserve earlier proportion pass provenance');
assert(playerActor.wyvernProjection.proportionProfile.completedPasses.includes('template_slim_aesthetic_pass'), 'wyvern packet should preserve slim aesthetic pass provenance');
equal(playerActor.wyvernProjection.proceduralPose.classification, 'renderer_neutral_procedural_pose_projection', 'wyvern packet should carry renderer-neutral procedural pose output');
equal(playerActor.wyvernProjection.proceduralPose.cachePolicy, 'v0_live_solve_v1_phase_bucket_cache', 'wyvern pose should declare the phase-bucket cache path');
equal(playerActor.wyvernProjection.rigPose.classification, 'renderer_neutral_creature_rig_projection', 'wyvern packet should carry renderer-neutral creature rig output');
assert(playerActor.wyvernProjection.rigPose.visualBounds.worldWidth > playerActor.worldRadius, 'wyvern rig should expose projected visual bounds');
assert('attackContact' in playerActor.wyvernProjection.proceduralPose, 'wyvern pose packet should expose attack contact debug contract state');
assert(projection.lights.length > 0, 'light projection should include light packets');
assert(projection.lights.every((light) => typeof light.softness === 'number'), 'light packets should include renderer-neutral softness');
assert(projection.lights.every((light) => typeof light.flickerAmount === 'number'), 'light packets should preserve emitter flicker amount');
assert(projection.lights.every((light) => typeof light.effectiveIntensity === 'number'), 'light packets should expose resolved flicker intensity');
assert(projection.lightingProfile.ambientIllumination > 0, 'lighting profile projection should expose low ambient illumination');
assert(projection.lightingProfile.illuminationModel === 'ambient_plus_world_light_rgb_field_v1', 'lighting profile projection should expose its additive illumination model');
assert(!Object.hasOwn(projection.lightingProfile, 'darknessOpacity'), 'lighting profile projection should omit the retired darkness-overlay contract');
assert(projection.lightingProfile.shadowCompositeMode === 'light_shadow_attenuation_blend_v0', 'lighting profile projection should expose shadow/light composite tuning');
assert(projection.lightingProfile.shadowFieldEdgeSoftness > 1, 'lighting profile projection should expose SDF edge softening');
assert(projection.lightSpaceCulling.classification === 'derived_render_budget_gate', 'projection should carry light-space culling data');
assert(projection.occlusionShadows.classification === 'derived_render_shadow_projection', 'projection should carry honest occlusion shadow projection data');
assert(projection.occlusionShadows.shadowFieldContract === 'black-sky-bound.render-shadow-field.sdf-ready.v1', 'projection should expose the SDF-ready shadow field contract');
assert(projection.occlusionShadows.shadowFieldPacketCount > 0, 'projection should expose SDF-ready shadow field packets');
assert(projection.occlusionShadows.shadowSilhouettePrimitiveCount > projection.occlusionShadows.approximateShadowRegions, 'projection should expose compound scene-object SDF silhouette primitives');
assert(projection.occlusionShadows.actorShadowBlockers > 0, 'projection should expose render-only actor shadow blockers');
assert(projection.shadowBlockers.some((blocker) => blocker.source === 'renderer_neutral_actor_visual_projection' && blocker.shadowShapeProfileId === 'creature'), 'projection should expose the creature family on render-only actor shadow blockers');
assert(projection.occlusionShadows.shadowFieldSampleCount >= projection.occlusionShadows.shadowFieldPacketCount * 3, 'projection should expose sampled shadow-field data');
assert(projection.fogSmoke.length > 0, 'fog/smoke projection should include smoke source packets');
assert(projection.fogSmoke.every((source) => source.classification === 'renderer_neutral_fog_smoke_projection'), 'fog/smoke packets should declare renderer-neutral classification');
assert(projection.fogSmoke.every((source) => typeof source.sourceKind === 'string'), 'fog/smoke packets should expose renderer-neutral source kind');
assert(projection.fogSmoke.every((source) => typeof source.softness === 'number'), 'fog/smoke packets should expose cheap radial softness');
assert(projection.particles.length > 0, 'ambient particle projection should include visible packets');
assert(projection.particles.every((particle) => particle.classification === 'renderer_neutral_ambient_particle_projection'), 'ambient particle packets should declare renderer-neutral classification');
assert(projection.particles.every((particle) => typeof particle.visualRole === 'string'), 'ambient particle packets should expose visual role metadata');
assert(projection.particles.some((particle) => particle.kind === 'torch_spark'), 'torch lights should project spark particles');
assert(projection.particles.some((particle) => particle.kind === 'leaf_drift'), 'tree scenery should project leaf drift particles');
assert(projection.decals.length > 0, 'decal projection should include existing decal stamp packets');
assert(projection.decals.every((decal) => decal.classification === 'renderer_neutral_decal_projection'), 'decal packets should declare renderer-neutral classification');
assert(projection.decals.every((decal) => decal.visualRole === 'ground_decal'), 'decal packets should expose visual role only, not gameplay truth');
assert(projection.groundHazards.length > 0, 'ground hazard projection should include existing napalm pool packets');
assert(projection.groundHazards.every((hazard) => hazard.classification === 'renderer_neutral_ground_hazard_projection'), 'ground hazard packets should declare renderer-neutral classification');
assert(projection.groundHazards.every((hazard) => hazard.sourceKind === 'napalm_pool'), 'ground hazard packets should expose existing source kind');
assert(projection.groundHazards.every((hazard) => hazard.visualMaterial === 'residual_liquid_napalm_pool_v1'), 'ground hazard packets should preserve liquid material metadata');
assert(projection.groundHazards.every((hazard) => hazard.poolShape === 'irregular_low_pool'), 'ground hazard packets should preserve reusable pool shape metadata');
assert(Array.isArray(projection.droppedTorches), 'projection should expose dropped torch ground-prop packets even when none are active');
assert(typeof projection.hud.playerHp === 'number', 'HUD projection should include player HP');
assert(typeof projection.hud.enemyCount === 'number', 'HUD projection should include enemy count');
assert(projection.hud.cooldowns && typeof projection.hud.cooldowns.smoke === 'number', 'HUD projection should include cooldown facts');
assert(Array.isArray(projection.atmosphericOverlay.emitters), 'camera atmosphere should carry a renderer-neutral emitter influence list');
assert(projection.atmosphericOverlay.emitters.length <= projection.atmosphericOverlay.tuning.maxAtmosphereEmitters, 'camera atmosphere emitter list should stay capped');
assert(!JSON.stringify(projection).includes('WebGL'), 'projection packets should not contain renderer objects');

const gameRendererSource = readFileSync(new URL('../src/render/backends/webgl/WebGLGameRenderer.js', import.meta.url), 'utf8');
for (const layerName of ['WebGLTerrainLayer', 'WebGLDecalLayer', 'WebGLLightingLayer', 'WebGLWorldDepthLayer', 'WebGLEffectLayer', 'WebGLFogSmokeLayer', 'WebGLPostProcessLayer', 'WebGLAtmosphericOverlayLayer', 'WebGLGameplayOverlayLayer', 'WebGLHudDebugLayer']) {
  assert(gameRendererSource.includes(layerName), `WebGLGameRenderer should register ${layerName}`);
}
const runtimeLayerIds = createWebGLLayers().map((layer) => layer.id);
deepEqual(runtimeLayerIds, WEBGL_LAYER_ORDER, 'WebGL layer factory should match the exported diagnostic layer order contract');
equal(WEBGL_ILLUMINATION_WORLD_DEPTH_COMPOSITE_CONTRACT, 'black-sky-bound.webgl-world-depth-times-additive-illumination.v1', 'WebGL should name the multiplicative world/illumination relationship');
const indexOfLayer = (layerId) => runtimeLayerIds.indexOf(layerId);
assert(indexOfLayer('terrain') < indexOfLayer('decals'), 'WebGL ground decals should render after terrain');
assert(indexOfLayer('decals') < indexOfLayer('shadows'), 'WebGL ground/contact shadows should render over terrain and decals');
assert(indexOfLayer('shadows') < indexOfLayer('worldDepth'), 'WebGL ground/contact shadows should stay under scene objects and actors');
assert(indexOfLayer('worldDepth') < indexOfLayer('worldParticles'), 'non-emissive world particles should render with world materials');
assert(indexOfLayer('worldParticles') < indexOfLayer('lighting'), 'non-emissive world particles should be multiplied by illumination');
assert(indexOfLayer('worldDepth') < indexOfLayer('lighting'), 'WebGL illumination should composite after scene objects and actors');
assert(indexOfLayer('lighting') < indexOfLayer('worldEvents'), 'mama shadow and inferno should composite over the lit world');
assert(indexOfLayer('worldEvents') < indexOfLayer('effects'), 'ordinary combat effects should stay legible above world events');
assert(indexOfLayer('lighting') < indexOfLayer('effects'), 'WebGL effects should render after scene light reveal');
assert(indexOfLayer('fogSmoke') < indexOfLayer('postProcess'), 'WebGL post-process should run after fog/smoke');
assert(indexOfLayer('postProcess') < indexOfLayer('atmosphere'), 'camera atmosphere should render after post-process');
assert(indexOfLayer('atmosphere') < indexOfLayer('gameplayOverlay'), 'gameplay screen overlays should render after camera atmosphere');
assert(indexOfLayer('gameplayOverlay') < indexOfLayer('hudDebug'), 'WebGL HUD/debug should render after gameplay screen overlays');
assert(gameRendererSource.indexOf('new WebGLTerrainLayer()') < gameRendererSource.indexOf('new WebGLDecalLayer()'), 'WebGL ground decals should render after terrain');
assert(gameRendererSource.indexOf("id: 'shadows'") < gameRendererSource.indexOf('new WebGLWorldDepthLayer()'), 'WebGL ground/contact shadows should be registered before y-sorted world depth');
assert(gameRendererSource.indexOf('new WebGLWorldDepthLayer()') < gameRendererSource.indexOf("id: 'lighting'"), 'WebGL light reveal should be registered after y-sorted world depth');
assert(gameRendererSource.indexOf("id: 'lighting'") < gameRendererSource.indexOf("stage: 'post_illumination_effects'"), 'WebGL emissive and combat effects should render after scene light reveal');
assert(gameRendererSource.indexOf('new WebGLPostProcessLayer()') < gameRendererSource.indexOf('new WebGLAtmosphericOverlayLayer()'), 'camera atmosphere should be registered after post-process');
assert(gameRendererSource.indexOf('new WebGLAtmosphericOverlayLayer()') < gameRendererSource.indexOf('new WebGLGameplayOverlayLayer()'), 'gameplay screen overlays should render above camera atmosphere');
assert(gameRendererSource.indexOf('new WebGLGameplayOverlayLayer()') < gameRendererSource.indexOf('new WebGLHudDebugLayer()'), 'WebGL HUD/debug should render above gameplay screen overlays');
assert(gameRendererSource.includes('new WebGLPostProcessPipeline'), 'WebGLGameRenderer should own the post-process pipeline');
assert(gameRendererSource.includes('postProcess.beginScene'), 'WebGLGameRenderer should render layers into a post-process render target first');
assert(gameRendererSource.includes('recordPostProcessDiagnostics'), 'WebGLGameRenderer should expose post-process diagnostics');
assert(gameRendererSource.includes("activeBackend: 'webgl'"), 'WebGLGameRenderer should report canonical WebGL as the active backend');
assert(gameRendererSource.includes('canvas2dRuntimeAvailable: false'), 'WebGLGameRenderer should prove Canvas 2D runtime rendering is unavailable');
assert(gameRendererSource.includes('webglLayerOrder'), 'WebGLGameRenderer should expose WebGL layer order diagnostics');
assert(gameRendererSource.includes('webglMigrationCoverageStatus'), 'WebGLGameRenderer should expose migration coverage diagnostics');
assert(gameRendererSource.includes('webglShadowShaderPrimitiveCount'), 'WebGLGameRenderer should roll shader shadow primitive diagnostics into frame status');
assert(gameRendererSource.includes('webglShadowCompositeMode'), 'WebGLGameRenderer should roll light/shadow composite diagnostics into frame status');
assert(gameRendererSource.includes('webglShadowSilhouettePrimitiveCount'), 'WebGLGameRenderer should roll silhouette SDF primitive diagnostics into frame status');
assert(gameRendererSource.includes('webglWorldDepthMode'), 'WebGLGameRenderer should expose world-depth layer diagnostics');
assert(gameRendererSource.includes('recordEffectDiagnostics'), 'WebGLGameRenderer should expose effect/particle diagnostics');

const renderLayerStateSource = readFileSync(new URL('../src/projection/renderLayerState.js', import.meta.url), 'utf8');
assert(renderLayerStateSource.includes('webglShadowShaderMode'), 'render-layer stats should expose the shader shadow mode in frame packets');
assert(renderLayerStateSource.includes('webglShadowShaderPrimitiveCount'), 'render-layer stats should expose shader shadow primitive counts in frame packets');
assert(renderLayerStateSource.includes('webglShadowCompositeMode'), 'render-layer stats should expose the light/shadow composite mode in frame packets');
assert(renderLayerStateSource.includes('webglShadowSilhouettePrimitiveCount'), 'render-layer stats should expose silhouette SDF primitive counts in frame packets');
assert(renderLayerStateSource.includes('webglWorldDepthItemCount'), 'render-layer stats should expose world-depth item counts in frame packets');
assert(renderLayerStateSource.includes('webglParticleCount'), 'render-layer stats should expose particle counts in frame packets');

const sceneSource = readFileSync(new URL('../src/render/backends/webgl/WebGLSceneRoot.js', import.meta.url), 'utf8');
assert(sceneSource.includes('drawRects'), 'WebGL scene root should own primitive draw calls');
assert(sceneSource.includes('drawTriangles'), 'WebGL scene root should own mesh triangle draw calls');
assert(sceneSource.includes('drawScreenRects'), 'WebGL scene root should own screen-space overlay draw calls');
assert(sceneSource.includes('drawScreenTriangles'), 'WebGL scene root should own screen-space shadow triangle draw calls');
assert(sceneSource.includes('drawWorldRadialLights'), 'WebGL scene root should own radial light influence draw calls');
assert(sceneSource.includes('drawWorldRadialDiscs'), 'WebGL scene root should own alpha-blended radial fog/smoke draw calls');
assert(sceneSource.includes('drawScreenRadialDiscs'), 'WebGL scene root should still own screen-space radial utility draw calls');
assert(sceneSource.includes('drawScreenSdfShadowFields'), 'WebGL scene root should own bounded screen-space SDF shadow-field draw calls');
assert(sceneSource.includes('taperedCapsuleSdf'), 'WebGL scene root should evaluate tapered capsule shadow fields in shader code');
assert(sceneSource.includes('a_blend'), 'WebGL scene root should pass profile-owned SDF shadow blend controls into the shader');
assert(!sceneSource.includes('drawImage'), 'WebGL scene root should not use Canvas drawImage compositing');

const lightingSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLLightingLayer.js', import.meta.url), 'utf8');
assert(lightingSource.includes('WEBGL_ILLUMINATION_COMPOSITE_MODE'), 'WebGL lighting layer should expose illumination-composite ownership');
assert(lightingSource.includes('context.illumination.compositeWorld'), 'WebGL lighting layer should composite the world through the shared illumination target');
assert(!lightingSource.includes('overlayRects'), 'WebGL lighting layer should not retain a global darkness rectangle');
assert(lightingSource.includes('drawScreenTriangles'), 'WebGL lighting layer should render contact footprints through WebGL-owned primitives');
assert(lightingSource.includes('drawScreenSdfShadowFields'), 'WebGL lighting layer should render shadow-field packets through the WebGL-owned SDF shader primitive');
assert(lightingSource.includes('projection.lights'), 'WebGL lighting layer should consume projection light packets');
assert(lightingSource.includes('projection.lightingProfile'), 'WebGL lighting layer should consume profile projection packets');
assert(lightingSource.includes('webgl_bounded_capsule_sdf_shadow_shader_v0'), 'WebGL lighting layer should expose the bounded SDF shader shadow-field mode');
assert(lightingSource.includes('light_shadow_attenuation_blend_v0'), 'WebGL lighting layer should expose the shadow/light attenuation blend mode');
assert(lightingSource.includes('shadowContactTriangleCount'), 'WebGL lighting layer should report contact shadow diagnostics');
assert(lightingSource.includes('shadowContactFootprintCount'), 'WebGL lighting layer should report authored contact-footprint diagnostics');
assert(lightingSource.includes('coarseProjectedShadowTriangleCount'), 'WebGL lighting layer should prove the coarse projected wedge remains retired');
assert(lightingSource.includes('shadowFieldPrimitiveCount'), 'WebGL lighting layer should report shadow-field primitive diagnostics');
assert(lightingSource.includes('shadowShaderPrimitiveCount'), 'WebGL lighting layer should report shader primitive diagnostics');
assert(lightingSource.includes('shadowCompositeMode'), 'WebGL lighting layer should report light/shadow composite diagnostics');
assert(lightingSource.includes('shadowSilhouettePrimitiveCount'), 'WebGL lighting layer should report silhouette SDF primitive diagnostics');
assert(lightingSource.includes('occlusionShadowRenderable: shadowRenderable'), 'WebGL lighting layer should report live split-layer shadow renderability');
assert(lightingSource.includes('this.renderShadows'), 'WebGL lighting layer should support under-world-depth shadow-only rendering');
assert(!lightingSource.includes('state.game'), 'WebGL lighting layer should not read gameplay state directly');

const scenerySource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLSceneryLayer.js', import.meta.url), 'utf8');
assert(scenerySource.includes('meter_scaled_scene_objects_v0'), 'WebGL scenery layer should expose grounded scale scene object mode');
assert(scenerySource.includes('projection.scenery'), 'WebGL scenery layer should consume projection scenery packets');
assert(scenerySource.includes('buildWebGLSceneryDepthItems'), 'WebGL scenery layer should export reusable depth items');
assert(scenerySource.includes('lightSpaceAlphaForWorldCircle'), 'WebGL scenery layer should use live light-space gating');
assert(!scenerySource.includes('state.game'), 'WebGL scenery layer should not read gameplay state directly');
assert(scenerySource.includes('appendLayeredFlame'), 'scene-object flames should use the shared layered teardrop recipe');

const worldDepthSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLWorldDepthLayer.js', import.meta.url), 'utf8');
assert(worldDepthSource.includes('y_sorted_world_depth_v0'), 'WebGL world-depth layer should name the z-ordering contract');
assert(worldDepthSource.includes('buildWebGLSceneryDepthItems'), 'WebGL world-depth layer should consume scenery depth items');
assert(worldDepthSource.includes('buildWebGLActorDepthItems'), 'WebGL world-depth layer should consume actor depth items');
assert(worldDepthSource.includes('projection.droppedTorches'), 'WebGL world-depth layer should consume dropped torch ground-prop packets');
assert(worldDepthSource.includes('droppedTorchCount'), 'WebGL world-depth layer should expose dropped torch diagnostics');
assert(worldDepthSource.includes('compareDepthItems'), 'WebGL world-depth layer should sort scenery and actors together');
assert(worldDepthSource.includes('depthSortedItemCount'), 'WebGL world-depth layer should report sorted item diagnostics');
assert(worldDepthSource.includes('appendLayeredFlame'), 'dropped torches should keep the layered flame recipe through world-depth rendering');
assert(!worldDepthSource.includes('state.game'), 'WebGL world-depth layer should not read gameplay state directly');

const renderProjectionSource = readFileSync(new URL('../src/projection/renderProjection.js', import.meta.url), 'utf8');
assert(renderProjectionSource.includes('buildDroppedTorchProjection'), 'render projection should derive dropped torch props before WebGL rendering');
assert(renderProjectionSource.includes('buildAtmosphericOverlayProjection'), 'render projection should derive camera-space atmosphere before WebGL rendering');
assert(renderProjectionSource.includes('lights: lightProjection'), 'camera atmosphere should consume renderer-neutral light projection packets');
assert(renderProjectionSource.includes('droppedTorchCount'), 'render projection debug should expose dropped torch counts');

const lightSpaceGateSource = readFileSync(new URL('../src/render/backends/webgl/WebGLLightSpaceGate.js', import.meta.url), 'utf8');
assert(lightSpaceGateSource.includes('getLightSpaceAlphaForCircle'), 'WebGL light-space helper should reuse the projection-owned feather math');
assert(!lightSpaceGateSource.includes("getContext('2d')"), 'WebGL light-space helper should not use Canvas 2D contexts');

const decalSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLDecalLayer.js', import.meta.url), 'utf8');
assert(decalSource.includes('liquid_ground_hazard_decal_v1'), 'WebGL decal layer should expose the liquid ground hazard mode');
assert(decalSource.includes('residual_liquid_napalm_pool_v1'), 'WebGL decal layer should consume the projected napalm liquid material');
assert(decalSource.includes('residual_blood_spatter_stain_v0'), 'WebGL decal layer should consume the projected blood stain material');
assert(decalSource.includes('liquidPoolPrimitiveCount'), 'WebGL decal layer should report liquid pool primitive diagnostics');
assert(decalSource.includes('bloodStainPrimitiveCount'), 'WebGL decal layer should report blood stain primitive diagnostics');
assert(decalSource.includes('projection.decals'), 'WebGL decal layer should consume projection decal packets');
assert(decalSource.includes('projection.groundHazards'), 'WebGL decal layer should consume projection ground hazard packets');
assert(decalSource.includes('MAX_DECAL_SOURCES'), 'WebGL decal layer should cap source count');
assert(decalSource.includes('drawWorldRadialDiscs'), 'WebGL decal layer should render through WebGL radial primitives');
assert(decalSource.includes('decalMode'), 'WebGL decal layer should report mode diagnostics');
assert(decalSource.includes('lightSpaceAlphaForWorldCircle'), 'WebGL decal layer should use live light-space gating');
assert(!decalSource.includes('state.game'), 'WebGL decal layer should not read gameplay state directly');

const effectSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLEffectLayer.js', import.meta.url), 'utf8');
assert(!effectSource.includes('projection.decals'), 'WebGL effect layer should not keep owning decal packets after decal layer migration');
assert(effectSource.includes('lightSpaceAlphaForWorldCircle'), 'WebGL effect layer should use live light-space gating');
assert(effectSource.includes('webgl_effects_particles_v0'), 'WebGL effect layer should expose the particle-aware mode');
assert(effectSource.includes('projection.particles'), 'WebGL effect layer should consume renderer-neutral particle packets');
assert(effectSource.includes('blood_mist'), 'WebGL effect layer should consume projected blood mist packets');
assert(effectSource.includes('bloodPrimitiveCount'), 'WebGL effect layer should report blood primitive diagnostics');
assert(effectSource.includes('drawWorldRadialDiscs'), 'WebGL effect layer should render particle glow through WebGL radial primitives');

const ambientParticleSource = readFileSync(new URL('../src/projection/ambientParticleProjection.js', import.meta.url), 'utf8');
assert(ambientParticleSource.includes('renderer_neutral_ambient_particle_projection'), 'ambient particles should be projected before WebGL rendering');
assert(ambientParticleSource.includes('RENDER_BUDGETS.ambientParticles.maxActive'), 'ambient particle projection should respect the particle budget');

const fogSmokeSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLFogSmokeLayer.js', import.meta.url), 'utf8');
assert(fogSmokeSource.includes('layered_lit_plume_smoke_v1'), 'WebGL fog/smoke layer should expose the layered lit plume mode');
assert(fogSmokeSource.includes('projection.fogSmoke'), 'WebGL fog/smoke layer should consume projection fog/smoke packets');
assert(fogSmokeSource.includes('MAX_FOG_SMOKE_SOURCES'), 'WebGL fog/smoke layer should cap source count');
assert(fogSmokeSource.includes('drawWorldRadialDiscs'), 'WebGL fog/smoke layer should render through WebGL radial primitives');
assert(fogSmokeSource.includes('drawWorldRadialLights'), 'WebGL fog/smoke layer should render smoke/light scatter through WebGL additive radial primitives');
assert(fogSmokeSource.includes('fogSmokeMode'), 'WebGL fog/smoke layer should report mode diagnostics');
assert(fogSmokeSource.includes('lightSpaceAlphaForWorldCircle'), 'WebGL fog/smoke layer should use live light-space gating');
assert(!fogSmokeSource.includes('state.game'), 'WebGL fog/smoke layer should not read gameplay state directly');

const atmosphereSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLAtmosphericOverlayLayer.js', import.meta.url), 'utf8');
assert(atmosphereSource.includes('ATMOSPHERIC_CAMERA_OVERLAY_MODE'), 'WebGL atmosphere layer should expose the camera overlay mode');
assert(atmosphereSource.includes('projection.atmosphericOverlay'), 'WebGL atmosphere layer should consume the renderer-neutral overlay packet');
assert(atmosphereSource.includes('drawScreenTriangles'), 'WebGL atmosphere layer should draw rain/spark streaks in screen space');
assert(atmosphereSource.includes('drawWorldRadials'), 'WebGL atmosphere layer should draw spark glow through batched WebGL radials');
assert(atmosphereSource.includes('sampleEmitterInfluence'), 'WebGL atmosphere layer should sample capped screen-space emitter influence');
assert(atmosphereSource.includes('emitterReactiveOverlayEnabled'), 'WebGL atmosphere layer should support disabling emitter reaction independently');
assert(atmosphereSource.includes('isToggleEnabled'), 'WebGL atmosphere layer should support instant query toggles');
assert(!atmosphereSource.includes('state.game'), 'WebGL atmosphere layer should not read gameplay state directly');

const atmosphereEmitterSource = readFileSync(new URL('../src/projection/atmosphericEmitterProjection.js', import.meta.url), 'utf8');
assert(atmosphereEmitterSource.includes('capped_screen_space_warm_emitter_influence_v0'), 'atmosphere emitter projection should expose the capped screen-space mode');
assert(atmosphereEmitterSource.includes('moonlight'), 'atmosphere emitter projection should filter broad cold scene light');
assert(atmosphereEmitterSource.includes('return []'), 'atmosphere emitter projection should fail closed to no emitter reaction');

const hudSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLHudDebugLayer.js', import.meta.url), 'utf8');
assert(hudSource.includes('projection_debug_text_v0'), 'WebGL HUD layer should expose the HUD/debug v0 mode');
assert(hudSource.includes('projection.hud'), 'WebGL HUD layer should consume projection HUD packets');
assert(hudSource.includes('drawScreenRects'), 'WebGL HUD layer should render through screen-space WebGL primitives');
assert(!hudSource.includes('state.game'), 'WebGL HUD layer should not read gameplay state directly');

const actorSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLActorLayer.js', import.meta.url), 'utf8');
assert(actorSource.includes('WEBGL_PLAYER_WYVERN_MODE'), 'WebGL actor layer should expose the player wyvern silhouette mode');
assert(actorSource.includes('buildWebGLPlayerWyvernSilhouette'), 'WebGL actor layer should delegate player silhouette mesh construction');
assert(actorSource.includes('buildWebGLActorDepthItems'), 'WebGL actor layer should export reusable depth items');
assert(actorSource.includes('WEBGL_RAIDER_HUMANOID_MODE'), 'WebGL actor layer should expose the raider humanoid silhouette mode');
assert(actorSource.includes('buildWebGLRaiderHumanoidSilhouette'), 'WebGL actor layer should delegate raider silhouette mesh construction');
assert(actorSource.includes('drawTriangles'), 'WebGL actor layer should render the player silhouette through WebGL mesh primitives');
assert(actorSource.includes('lightSpaceAlphaForWorldCircle'), 'WebGL actor layer should use live light-space gating for non-player detail');
assert(!actorSource.includes('state.game'), 'WebGL actor layer should not read gameplay state directly');

const wyvernSource = readFileSync(new URL('../src/render/backends/webgl/WebGLWyvernSilhouette.js', import.meta.url), 'utf8');
assert(wyvernSource.includes('player_wyvern_silhouette_v0'), 'WebGL wyvern silhouette should name the player silhouette mode');
assert(wyvernSource.includes('actor.wyvernProjection'), 'WebGL wyvern silhouette should consume projection packets');
assert(wyvernSource.includes('proceduralPose'), 'WebGL wyvern silhouette should consume projected procedural pose data');
assert(wyvernSource.includes('rigPose'), 'WebGL wyvern silhouette should consume projected creature rig pose data');
assert(wyvernSource.includes('proportionProfile'), 'WebGL wyvern silhouette should consume projected proportion data');
assert(wyvernSource.includes('attackContact'), 'WebGL wyvern silhouette may render projected contact debug markers');
assert(!wyvernSource.includes('applyDamageToEntity'), 'WebGL wyvern silhouette should not own hit resolution');
for (const contractWord of ['wing_forelimb', 'wrist_claw', 'low_flank_hip', 'digitLengths', 'hindLegAnatomy']) {
  assert(wyvernSource.includes(contractWord), `WebGL wyvern silhouette should preserve ${contractWord}`);
}
assert(!wyvernSource.includes('canvas'), 'WebGL wyvern silhouette should not use Canvas rendering');

const humanoidSource = readFileSync(new URL('../src/render/backends/webgl/WebGLHumanoidSilhouette.js', import.meta.url), 'utf8');
assert(humanoidSource.includes('raider_top_down_articulated_humanoid_v1'), 'WebGL humanoid silhouette should name the articulated raider mode');
assert(humanoidSource.includes('actor.humanoidProjection'), 'WebGL humanoid silhouette should consume projection packets');
assert(humanoidSource.includes('torchAttached'), 'WebGL humanoid silhouette should report torch socket attachment');
assert(humanoidSource.includes('appendLayeredFlame'), 'carried torches should use the shared layered flame recipe');
assert(humanoidSource.includes('addSegment'), 'WebGL humanoid silhouette should render limbs through mesh segments');
assert(humanoidSource.includes('addLimbChain'), 'WebGL humanoid silhouette should render upper/lower limb chains through projected joints');
assert(!humanoidSource.includes('state.game'), 'WebGL humanoid silhouette should not read gameplay state directly');

const predatorSource = readFileSync(new URL('../src/render/backends/webgl/WebGLPredatorSilhouette.js', import.meta.url), 'utf8');
assert(predatorSource.includes('werewolf_top_down_heavy_predator_v1'), 'WebGL predator silhouette should name the heavy articulated werewolf mode');
assert(predatorSource.includes('points.leftElbow'), 'WebGL predator silhouette should consume projected elbow articulation');
assert(predatorSource.includes('points.leftHock'), 'WebGL predator silhouette should consume projected hock articulation');
assert(predatorSource.includes('addFurSilhouette'), 'WebGL predator silhouette should consume bounded mane and fur breakup');
assert(!predatorSource.includes('getEnemyAttackProfile'), 'WebGL predator silhouette should not recreate canonical attack truth');
assert(!predatorSource.includes('state.game'), 'WebGL predator silhouette should not read gameplay state directly');

const postProcessSource = readFileSync(new URL('../src/render/backends/webgl/WebGLPostProcessPipeline.js', import.meta.url), 'utf8');
assert(postProcessSource.includes('ATMOSPHERIC_POST_PROCESS_POLISH_MODE'), 'WebGL post-process pipeline should expose the polish v0 effect mode');
assert(postProcessSource.includes('u_shadowCoolStrength'), 'WebGL post-process pipeline should expose cold shadow grade tuning');
assert(postProcessSource.includes('u_fireWarmStrength'), 'WebGL post-process pipeline should expose warm emitter preservation tuning');
assert(postProcessSource.includes('u_glowProxyStrength'), 'WebGL post-process pipeline should expose capped glow proxy tuning');
assert(postProcessSource.includes('createFramebuffer'), 'WebGL post-process pipeline should allocate an owned framebuffer');
assert(postProcessSource.includes('framebufferTexture2D'), 'WebGL post-process pipeline should attach a render-target texture');
assert(postProcessSource.includes('texImage2D'), 'WebGL post-process pipeline should allocate GPU texture storage');
assert(postProcessSource.includes('texture2D'), 'WebGL post-process pipeline should composite through a shader texture sample');
assert(!postProcessSource.includes('drawImage'), 'WebGL post-process pipeline should not use Canvas image compositing');
assert(!postProcessSource.includes('Canvas'), 'WebGL post-process pipeline should not depend on Canvas rendering');

const postProcessLayerSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLPostProcessLayer.js', import.meta.url), 'utf8');
assert(postProcessLayerSource.includes('compositeToScreen'), 'WebGL post-process layer should run the final shader composite pass');
assert(postProcessLayerSource.includes('renderTargetActive'), 'WebGL post-process layer should report render-target activity');
assert(!postProcessLayerSource.includes('drawScreenRects'), 'WebGL post-process layer should not own lifecycle screen fades');
const gameplayOverlaySource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLGameplayOverlayLayer.js', import.meta.url), 'utf8');
assert(gameplayOverlaySource.includes('projection.playerLifecycle'), 'gameplay overlay layer should consume lifecycle projection packets');
assert(gameplayOverlaySource.includes('drawScreenRects'), 'gameplay overlay layer should own screen-mask drawing after atmosphere');
const openingSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLOpeningLayer.js', import.meta.url), 'utf8');
const renderStatsSource = readFileSync(new URL('../src/render/backends/webgl/WebGLRenderStats.js', import.meta.url), 'utf8');
assert(openingSource.includes('embodied_hatch_screen_projection_v2'), 'opening layer should expose the richer hatch presentation mode');
assert(openingSource.includes('projection.opening'), 'opening layer should consume renderer-neutral opening packets');
assert(openingSource.includes('drawScreenTriangles'), 'opening layer should render deterministic cracks and shell fragments through WebGL');
assert(renderStatsSource.includes('fragmentCount: layer.fragmentCount ?? 0'), 'renderer stats summary should preserve opening fragment diagnostics');
assert(renderStatsSource.includes('openingEggShellPieceCount: layer.openingEggShellPieceCount ?? 0'), 'renderer stats should preserve physical egg-shell diagnostics');
assert(!openingSource.includes('state.game'), 'opening layer should not read gameplay state directly');
assert(indexOfLayer('gameplayOverlay') < indexOfLayer('opening'), 'opening should cover ordinary gameplay overlays while the player is inside the egg');
assert(indexOfLayer('opening') < indexOfLayer('tutorial'), 'post-hatch tutorials should remain above the released opening layer');
