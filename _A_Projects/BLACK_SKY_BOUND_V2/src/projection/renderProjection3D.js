import { getLightingProfile } from '../data/lightingProfiles.js';
import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { buildActorProjection3D } from './actorProjection3D.js';
import { buildAmbientParticleProjection } from './ambientParticleProjection.js';
import { buildAtmosphericOverlayProjection } from './atmosphericOverlayProjection.js';
import { buildAuthoredTransitionSequenceProjection } from './authoredTransitionSequenceProjection.js';
import { buildBodyStateProjection } from './bodyStateProjection.js';
import { buildCorpseDecalProjection } from './corpseAftermathProjection.js';
import { buildDroppedTorchProjection } from './droppedTorchProjection.js';
import { buildEffectProjection, buildProjectileProjection } from './effectProjection.js';
import { buildHudProjection } from './hudProjection.js';
import { buildVisibleLightProjection } from './lightProjection.js';
import { resolveNapalmPoolVisualState } from './napalmLayerState.js';
import { buildOpeningSequenceProjection } from './openingSequenceProjection.js';
import { buildPlayerLifecycleProjection } from './playerLifecycleProjection.js';
import { buildFoliageFireSceneryProjection, buildSceneryMaterialProjection, buildSceneryProjection } from './sceneObjectProjection.js';
import { buildSmokeAwakeningProjection } from './smokeAwakeningProjection.js';
import { buildStormCameraProjection } from './stormCameraProjection.js';
import { buildTerrainProjection } from './terrainProjection.js';
import { buildTutorialProjection } from './tutorialProjection.js';
import { buildUnitSpawnerFixtureProjection } from './unitSpawnerFixtureProjection.js';
import { buildWorldEventProjection } from './worldEventProjection.js';
import { buildCameraVisibilityFocusProjection } from './cameraVisibilityFocusProjection.js';

export const RENDER_PROJECTION_3D_CONTRACT = 'black-sky-bound.renderer-neutral-3d-projection.v1';

export function createRenderProjection3DCompiler(config) {
  const tileSize = config.tileSize;
  let staticWorld = null;
  let staticKey = '';
  let staticMap = null;
  let staticSceneObjects = null;
  let cacheHits = 0;
  let cacheRebuilds = 0;
  let disposed = false;
  let activeBurningScenery = [];
  let activeBurningCount = -1;
  let materialScanFrame = 0;
  const sceneryMaterialSignatures = new Map();

  function compile(state) {
    if (disposed) throw new Error('render_projection_3d_compiler_disposed');
    const game = state.game ?? {};
    const map = state.map;
    const sceneObjects = game.sceneObjects ?? map?.sceneObjects ?? [];
    const key = staticSignature(map, sceneObjects, tileSize);
    const staticStart = nowMs();
    const staticChanged = key !== staticKey || map !== staticMap || sceneObjects !== staticSceneObjects;
    if (staticChanged) {
      staticWorld = buildStaticWorld(map, sceneObjects, game, tileSize, key);
      staticKey = key;
      staticMap = map;
      staticSceneObjects = sceneObjects;
      cacheRebuilds += 1;
      resetMaterialSignatures(sceneObjects, sceneryMaterialSignatures);
      activeBurningScenery = [];
      activeBurningCount = -1;
    } else {
      cacheHits += 1;
    }
    const staticMs = nowMs() - staticStart;
    const dynamicStart = nowMs();
    const burningCount = Number(game.worldEvents?.diagnostics?.activeFoliageFireCount ?? 0)
      + Number(game.worldEvents?.diagnostics?.burntOutFoliageCount ?? 0);
    if (burningCount !== activeBurningCount) {
      activeBurningScenery = sceneObjects.filter((object) => object.materialState?.foliageFire);
      activeBurningCount = burningCount;
    }
    materialScanFrame += 1;
    const materialCandidates = materialScanFrame % 30 === 0 ? sceneObjects : activeBurningScenery;
    const dynamicWorld = buildDynamicWorld(state, config, staticWorld, sceneryMaterialSignatures, materialCandidates, activeBurningScenery);
    const screen = buildScreenProjection(state, dynamicWorld.renderTime, tileSize);
    const dynamicMs = nowMs() - dynamicStart;
    const diagnostics = {
      contract: RENDER_PROJECTION_3D_CONTRACT,
      legacy2DProjectionActive: false,
      staticKey,
      staticChanged,
      staticCacheHits: cacheHits,
      staticCacheRebuilds: cacheRebuilds,
      staticProjectionMs: roundMs(staticMs),
      dynamicProjectionMs: roundMs(dynamicMs),
      projectionMs: roundMs(staticMs + dynamicMs),
      dynamicCounts: {
        actors: dynamicWorld.actors.length,
        lights: dynamicWorld.lights.length,
        effects: dynamicWorld.effects.length,
        smoke: dynamicWorld.fogSmoke.length,
        particles: dynamicWorld.particles.length,
        sceneryMaterialUpdates: dynamicWorld.sceneryMaterialUpdates.length
      },
      retired2DWork: ['actor_light_readability_rims', 'actor_contact_shadow_projection', 'actor_catchlight_projection']
    };
    syncRuntimeStats(game.renderLayers, dynamicWorld, diagnostics);
    return {
      classification: 'renderer_neutral_visual_projection_3d',
      contract: RENDER_PROJECTION_3D_CONTRACT,
      source: {
        status: game.status ?? 'unknown',
        mapId: map?.id ?? 'unknown',
        mapRevision: map?.revision ?? 0,
        renderTime: dynamicWorld.renderTime
      },
      staticWorld,
      dynamicWorld,
      screen,
      diagnostics
    };
  }

  function dispose() {
    disposed = true;
    staticWorld = null;
    staticMap = null;
    staticSceneObjects = null;
    activeBurningScenery = [];
    sceneryMaterialSignatures.clear();
  }

  return { compile, dispose, get diagnostics() { return { staticKey, cacheHits, cacheRebuilds, disposed }; } };
}

function buildStaticWorld(map, sceneObjects, game, tileSize, signature) {
  return Object.freeze({
    classification: 'renderer_neutral_static_world_projection_3d',
    signature,
    terrain: buildTerrainProjection(map, tileSize),
    scenery: buildSceneryProjection(sceneObjects, tileSize),
    unitSpawnerFixtures: buildUnitSpawnerFixtureProjection(game.unitSpawnerFixtures ?? [], tileSize)
  });
}

function buildDynamicWorld(state, config, staticWorld, materialSignatures, materialCandidates, activeBurningScenery) {
  const game = state.game ?? {};
  const tileSize = config.tileSize;
  const renderTime = game.renderTime ?? state.time ?? 0;
  const lightingProfile = getLightingProfile(game.lighting?.profileId);
  const camera = state.camera ?? createFallbackCamera();
  const lightSelection = buildVisibleLightProjection(game.lights ?? [], camera, tileSize, {
    ...RENDER_BUDGETS.lightEmitters,
    criticalEntityId: game.dragonId
  });
  const lights = lightSelection.lights;
  const actors = buildActorProjection3D(game.actors ?? [], tileSize, game.creatureTuning);
  const cameraVisibilityFocus = buildCameraVisibilityFocusProjection(game.cameraVisibilityFocus, actors);
  const sceneObjects = game.sceneObjects ?? state.map?.sceneObjects ?? [];
  const burningScenery = buildChangedSceneryMaterialPackets(materialCandidates, tileSize, materialSignatures);
  const projectiles = buildProjectileProjection(game.renderLayers?.napalm?.droplets ?? [], tileSize);
  const effects = buildEffectProjection(game.effects ?? [], tileSize);
  const corpseDecals = buildCorpseDecalProjection(game.corpses ?? [], tileSize);
  const groundHazards = buildGroundHazardProjection(game.renderLayers?.napalm?.pools ?? [], tileSize);
  const droppedTorches = buildDroppedTorchProjection(game.actors ?? [], tileSize, game.creatureTuning);
  const fogSmoke = buildFogSmokeProjection(game.smokeSources ?? [], tileSize);
  const atmosphericOverlay = buildAtmosphericOverlayProjection({
    renderTime,
    overrides: game.renderLayers?.atmosphericOverlay,
    lights,
    camera
  });
  const burningWorldPackets = buildFoliageFireSceneryProjection(activeBurningScenery, tileSize);
  const worldEvents = buildWorldEventProjection(game.worldEvents, tileSize, burningWorldPackets);
  const particles = buildAmbientParticleProjection({
    lights,
    fogSmoke,
    groundHazards,
    scenery: staticWorld.scenery,
    renderTime
  });
  return {
    classification: 'renderer_neutral_dynamic_world_projection_3d',
    renderTime,
    lightingProfile: {
      id: lightingProfile.id,
      ambientIllumination: lightingProfile.ambientIllumination,
      ambientIlluminationColour: lightingProfile.ambientIlluminationColour
    },
    cameraVisibilityFocus,
    actors,
    sceneryMaterialUpdates: burningScenery,
    projectiles,
    effects,
    particles,
    decals: [...buildDecalProjection(game.renderLayers?.decals?.stamps ?? [], tileSize), ...corpseDecals],
    groundHazards,
    droppedTorches,
    lights,
    illuminationSelection: lightSelection.diagnostics,
    fogSmoke,
    atmosphericOverlay,
    worldEvents
  };
}

function buildScreenProjection(state, renderTime, tileSize) {
  const game = state.game ?? {};
  return {
    classification: 'renderer_neutral_screen_projection_3d',
    playerLifecycle: buildPlayerLifecycleProjection(game.actors ?? []),
    bodyState: buildBodyStateProjection(game, renderTime),
    hud: buildHudProjection(game),
    opening: buildOpeningSequenceProjection(state),
    authoredTransition: buildAuthoredTransitionSequenceProjection(state),
    smokeAwakening: buildSmokeAwakeningProjection(state),
    stormCamera: buildStormCameraProjection(state, tileSize),
    tutorial: buildTutorialProjection(state)
  };
}

function buildChangedSceneryMaterialPackets(sceneObjects, tileSize, signatures) {
  const changed = [];
  for (const object of sceneObjects) {
    const signature = materialSignature(object);
    if (signatures.get(object.id) === signature) continue;
    signatures.set(object.id, signature);
    changed.push({ id: object.id, material: buildSceneryMaterialProjection(object) });
  }
  return changed;
}

function resetMaterialSignatures(sceneObjects, signatures) {
  signatures.clear();
  for (const object of sceneObjects) signatures.set(object.id, materialSignature(object));
}

function materialSignature(object) {
  const state = object.materialState ?? {};
  const fire = state.foliageFire ?? {};
  return [object.selected ? 1 : 0, state.burnAmount ?? 0, state.wetness ?? 0, state.damageAmount ?? 0,
    state.integrity ?? 1, state.nightReveal ?? 0, fire.phase ?? '', roundSignature(fire.heatAmount),
    roundSignature(fire.emberAmount), roundSignature(fire.charAmount)].join(':');
}

function staticSignature(map, sceneObjects, tileSize) {
  return `${map?.id ?? 'none'}:${map?.revision ?? 0}:${map?.width ?? 0}:${map?.height ?? 0}:${sceneObjects.length}:${tileSize}`;
}

function buildDecalProjection(stamps, tileSize) {
  return stamps.map((stamp, index) => ({
    id: `${stamp.kind ?? 'decal'}:${index}`,
    kind: stamp.kind ?? 'decal',
    sourceKind: stamp.kind ?? 'decal',
    worldX: stamp.x * tileSize,
    worldY: stamp.y * tileSize,
    radius: Math.max(1, stamp.radius * tileSize),
    colour: stamp.colour ?? 'rgba(40,30,24,0.24)',
    rimColour: stamp.rimColour ?? null,
    opacity: stamp.opacity ?? 1
  }));
}

function buildGroundHazardProjection(pools, tileSize) {
  return pools.filter((pool) => pool.age < pool.lifetime).map((pool) => {
    const visual = resolveNapalmPoolVisualState(pool);
    return {
      id: pool.id,
      kind: pool.kind ?? 'napalm_pool',
      sourceKind: 'napalm_pool',
      visualMaterial: pool.visualMaterial ?? 'baby_wyvern_viscous_napalm_pool_v2',
      poolShape: pool.poolShape ?? 'connected_irregular_lobes',
      worldX: pool.x * tileSize,
      worldY: pool.y * tileSize,
      radius: Math.max(0.8, (pool.radius ?? 0.2) * tileSize * visual.spreadScale),
      colour: pool.colour ?? 'rgba(218,68,18,0.56)',
      hotColour: pool.hotColour ?? 'rgba(255,184,66,0.82)',
      rimColour: pool.rimColour ?? 'rgba(33,11,7,0.82)',
      coolingColour: pool.coolingColour ?? 'rgba(48,22,19,0.86)',
      opacity: pool.opacity ?? 0.9,
      rimScale: pool.rimScale ?? 1.08,
      bodyScale: pool.bodyScale ?? 0.86,
      hotSpotScale: pool.hotSpotScale ?? 0.16,
      hotSpotCount: pool.hotSpotCount ?? 2,
      lobeCount: Math.max(1, Math.min(3, pool.lobeCount ?? 3)),
      incomingX: pool.incomingX ?? 0,
      incomingY: pool.incomingY ?? 0,
      flickerPhase: pool.flickerPhase ?? 0,
      age: pool.age ?? 0,
      lifetime: pool.lifetime ?? null,
      life01: visual.life01,
      spread01: visual.spread01,
      heat01: visual.heat01,
      impact01: visual.impact01,
      impactLife01: visual.impactLife01,
      flame01: visual.flame01,
      cooling01: visual.cooling01
    };
  });
}

function buildFogSmokeProjection(smokeSources, tileSize) {
  return smokeSources.map((source) => ({
    id: source.id,
    kind: source.sourceKind ?? source.kind ?? 'smoke',
    sourceKind: source.sourceKind ?? source.kind ?? 'smoke',
    worldX: source.x * tileSize,
    worldY: source.y * tileSize,
    radius: Math.max(1, source.radius * tileSize),
    heightMeters: Number.isFinite(source.heightMeters) ? source.heightMeters : null,
    density: source.density ?? 1,
    opacity: source.opacity ?? 1,
    age: source.age ?? 0,
    lifetime: source.lifetime ?? null,
    life01: normalisedLife(source.age ?? 0, source.lifetime),
    driftScale: source.driftScale ?? 1,
    shape: source.shape ?? 'soft_disc',
    forwardX: source.forwardX ?? null,
    forwardY: source.forwardY ?? null
  }));
}

function normalisedLife(age, lifetime) {
  return Number.isFinite(lifetime) && lifetime > 0 ? Math.max(0, Math.min(1, 1 - age / lifetime)) : 1;
}

function syncRuntimeStats(renderLayers, dynamicWorld, diagnostics) {
  if (!renderLayers) return;
  if (renderLayers.lighting) {
    renderLayers.lighting.profileId = dynamicWorld.lightingProfile.id;
    renderLayers.lighting.activeLights = dynamicWorld.lights.filter((light) => light.enabled && (light.revealStrength ?? light.effectiveIntensity) > 0).length;
    renderLayers.lighting.droppedLights = (dynamicWorld.illuminationSelection?.dormantCount ?? 0) + (dynamicWorld.illuminationSelection?.budgetDroppedCount ?? 0);
  }
  renderLayers.projection3d = { ...(renderLayers.projection3d ?? {}), ...diagnostics };
}

function createFallbackCamera() {
  return { x: 0, y: 0, zoom: 1, viewportW: 1280, viewportH: 720 };
}

function roundSignature(value) { return Math.round((Number(value) || 0) * 32); }
function nowMs() { return globalThis.performance?.now?.() ?? Date.now(); }
function roundMs(value) { return Math.round(value * 1000) / 1000; }
