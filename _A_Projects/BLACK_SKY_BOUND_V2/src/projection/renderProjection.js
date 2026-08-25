import { ACTORS } from '../data/actors.js';
import { MaterialFamily } from '../data/materialProfiles.js';
import { getCreatureProjectionRecipe } from '../data/creatureProjections.js';
import { getLightingProfile } from '../data/lightingProfiles.js';
import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { resolvePostProcessPolishTuning } from '../data/postProcessPolish.js';
import { buildActorShadowBlockers } from './actorShadowSilhouettes.js';
import { buildLightSpaceRenderCulling, resetLightSpaceCullingStats } from './lightSpaceRenderCulling.js';
import { buildVisibleLightProjection } from './lightProjection.js';
import { buildActorMaterialState, buildMaterialProjection, buildMaterialSummary } from './materialProjection.js';
import { buildOcclusionShadowProjection, resetOcclusionShadowStats } from './occlusionShadowState.js';
import { buildSceneryProjection } from './sceneObjectProjection.js';
import { buildShadowBlockerProjection } from './shadowBlockerProjection.js';
import { getHumanoidProjectionProfile } from '../data/humanoids/raiderHumanoid.js'; import { resolveCreatureHumanoidProfile } from '../data/creatures/creatureRecipes.js';
import { buildTerrainProjection } from './terrainProjection.js';
import { buildAmbientParticleProjection } from './ambientParticleProjection.js';
import { buildEffectProjection, buildProjectileProjection } from './effectProjection.js';
import { buildDroppedTorchProjection } from './droppedTorchProjection.js';
import { resolveNapalmPoolVisualState } from './napalmLayerState.js';
import { buildCorpseDecalProjection } from './corpseAftermathProjection.js';
import { getPredatorProjectionProfile } from '../data/creatures/werewolfPredator.js';
import { buildHudProjection } from './hudProjection.js';
import { applyActorLightReadabilityProjection } from './actorLightReadabilityProjection.js';
import { buildBodyStateProjection } from './bodyStateProjection.js';
import { buildPlayerLifecycleProjection } from './playerLifecycleProjection.js';
import { buildAtmosphericOverlayProjection } from './atmosphericOverlayProjection.js';
import { buildUnitSpawnerFixtureProjection } from './unitSpawnerFixtureProjection.js';
import { buildWorldEventProjection } from './worldEventProjection.js';
import { buildTutorialProjection } from './tutorialProjection.js';
import { buildOpeningSequenceProjection } from './openingSequenceProjection.js';
import { buildSmokeAwakeningProjection } from './smokeAwakeningProjection.js';
import { buildAuthoredTransitionSequenceProjection } from './authoredTransitionSequenceProjection.js';

export function buildRenderProjection(state, config) {
  const game = state.game ?? {};
  const map = state.map;
  const tileSize = config.tileSize;
  const renderTime = game.renderTime ?? state.time ?? 0;
  const lightingProfile = getLightingProfile(game.lighting?.profileId);
  const lights = game.lights ?? []; const camera = state.camera ?? createFallbackCamera();
  const lightSelection = buildVisibleLightProjection(lights, camera, tileSize, { ...RENDER_BUDGETS.lightEmitters, criticalEntityId: game.dragonId }); const lightProjection = lightSelection.lights;
  const lightSpaceLights = lightProjection.map((light) => ({
    id: light.id,
    x: light.x,
    y: light.y,
    radius: Math.max(0, (light.baseRevealRadius ?? light.revealRadius ?? light.radius) / tileSize),
    intensity: light.revealStrength ?? light.effectiveIntensity,
    enabled: light.enabled,
    sourceKind: light.sourceKind,
    sceneLight: light.sceneLight,
    shadowLengthScale: light.shadow?.lengthScale ?? 1,
    shadowOpacityScale: light.shadow?.opacityScale ?? 1,
    shadowHeightScale: light.shadow?.heightScale ?? 1,
    flashStage: light.flashStage ?? null,
    afterimageIntensity: light.afterimageIntensity ?? 0,
    shadowPriority: light.shadowPriority ?? 0, castsShadows: light.castsShadows !== false, illuminationState: light.illuminationState
  }));
  const lightSpaceCulling = buildLightSpaceRenderCulling(lightSpaceLights, camera, tileSize);
  const actors = applyActorLightReadabilityProjection(
    buildActorProjection(game.actors ?? [], tileSize, game.creatureTuning),
    lightProjection
  );
  const scenery = buildSceneryProjection(game.sceneObjects ?? map?.sceneObjects ?? [], tileSize);
  const unitSpawnerFixtures = buildUnitSpawnerFixtureProjection(game.unitSpawnerFixtures ?? [], tileSize);
  const terrain = buildTerrainProjection(map, tileSize);
  const projectiles = buildProjectileProjection(game.renderLayers?.napalm?.droplets ?? [], tileSize);
  const effects = buildEffectProjection(game.effects ?? [], tileSize);
  const corpseDecals = buildCorpseDecalProjection(game.corpses ?? [], tileSize);
  const groundHazards = buildGroundHazardProjection(game.renderLayers?.napalm?.pools ?? [], tileSize);
  const droppedTorches = buildDroppedTorchProjection(game.actors ?? [], tileSize, game.creatureTuning);
  const fogSmoke = buildFogSmokeProjection(game.smokeSources ?? [], tileSize);
  const playerLifecycle = buildPlayerLifecycleProjection(game.actors ?? []);
  const atmosphericOverlay = buildAtmosphericOverlayProjection({ renderTime, overrides: game.renderLayers?.atmosphericOverlay, lights: lightProjection, camera });
  const worldEvents = buildWorldEventProjection(game.worldEvents, tileSize, scenery);
  const particles = buildAmbientParticleProjection({
    lights: lightProjection,
    fogSmoke,
    groundHazards,
    scenery,
    renderTime
  });
  const shadowBlockers = [...(game.occlusionBlockers ?? []), ...buildActorShadowBlockers(actors)];
  const occlusionShadows = buildOcclusionShadowProjection(shadowBlockers, lightSpaceLights, camera, tileSize, lightSpaceCulling, lightingProfile);
  syncRenderProjectionStats(game.renderLayers, {
    lightingProfile,
    lights,
    lightProjection,
    lightSelection: lightSelection.diagnostics,
    lightSpaceCulling,
    occlusionShadows
  });
  return {
    classification: 'renderer_neutral_visual_projection',
    source: { status: game.status ?? 'unknown', mapId: map?.id ?? 'unknown', mapRevision: map?.revision ?? 0, renderTime },
    lightingProfile: buildLightingProfileProjection(lightingProfile),
    terrain,
    scenery,
    unitSpawnerFixtures,
    actors,
    materials: buildMaterialSummary([
      ...actors.map((actor) => actor.material),
      ...scenery.map((object) => object.material),
      ...terrain.tiles.map((tile) => tile.material)
    ]),
    projectiles,
    effects,
    particles,
    decals: [...buildDecalProjection(game.renderLayers?.decals?.stamps ?? [], tileSize), ...corpseDecals],
    groundHazards,
    droppedTorches,
    lights: lightProjection, illuminationSelection: lightSelection.diagnostics,
    lightSpaceCulling,
    occlusionShadows,
    shadowBlockers: buildShadowBlockerProjection(shadowBlockers, tileSize),
    fogSmoke,
    atmosphericOverlay,
    worldEvents,
    postProcess: {
      enabled: game.renderLayers?.postProcess?.enabled !== false,
      policy: game.renderLayers?.postProcess?.policy ?? 'unknown',
      tuning: resolvePostProcessPolishTuning(game.renderLayers?.postProcess)
    },
    playerLifecycle,
    bodyState: buildBodyStateProjection(game, renderTime),
    hud: buildHudProjection(game),
    opening: buildOpeningSequenceProjection(state),
    authoredTransition: buildAuthoredTransitionSequenceProjection(state),
    smokeAwakening: buildSmokeAwakeningProjection(state),
    tutorial: buildTutorialProjection(state),
    debug: {
      actorCount: game.actors?.length ?? 0,
      unitSpawnerFixtureCount: unitSpawnerFixtures.length,
      effectCount: game.effects?.length ?? 0,
      corpseCount: game.corpses?.length ?? 0,
      particleCount: particles.length,
      lightCount: game.lights?.length ?? 0,
      droppedTorchCount: droppedTorches.length,
      smokeSourceCount: game.smokeSources?.length ?? 0,
      lightingProfileId: lightingProfile.id,
      lightSpaceCullingMode: 'live_webgl_render_detail_gate',
      occlusionShadowMode: 'projection_live_sdf_ready_shadow_field_v1',
      occlusionShadowRegions: occlusionShadows.approximateShadowRegions ?? 0,
      actorShadowBlockerCount: occlusionShadows.actorShadowBlockers ?? 0,
      actorLightReadabilityCount: actors.filter((actor) => actor.lightReadability?.active).length
    }
  };
}

function buildActorProjection(actors, tileSize, creatureTuning = null) {
  return actors
    .filter((actor) => actor.alive)
    .map((actor) => {
      const def = ACTORS[actor.type] ?? {};
      return {
        id: actor.id,
        authoredId: actor.authoredId ?? null,
        type: actor.type,
        team: actor.team,
        alive: !!actor.alive,
        x: actor.x,
        y: actor.y,
        worldX: actor.x * tileSize,
        worldY: actor.y * tileSize,
        radius: actor.radius, bodyContactRig: cloneProjectionData(actor.bodyContactRig),
        worldRadius: Math.max(2, actor.radius * tileSize),
        rotation: actor.rotation ?? 0,
        hp: actor.hp,
        maxHp: actor.maxHp,
        stamina: cloneProjectionData(actor.stamina),
        dodgeState: cloneProjectionData(actor.dodgeState),
        colour: actor.colour ?? def.colour ?? '#d8d8d8',
        stroke: actor.stroke ?? def.stroke ?? '#111111',
        materialProfileId: actor.materialProfileId ?? def.materialProfileId ?? null,
        material: (actor.materialProfileId ?? def.materialProfileId) ? buildMaterialProjection(actor.materialProfileId ?? def.materialProfileId, {
          family: MaterialFamily.ENTITY,
          state: buildActorMaterialState(actor, actor.team),
          source: { kind: 'actor', id: actor.id, type: actor.type, team: actor.team }
        }) : null,
        role: actor.role ?? def.role ?? 'actor',
        silhouette: actor.silhouette ?? def.silhouette ?? 'marker',
        lightReadabilityProfileId: actor.lightReadabilityProfileId ?? def.lightReadabilityProfileId ?? null,
        enemyBehaviour: cloneProjectionData(actor.enemyBehaviour),
        wyvernProjection: buildWyvernVisualProjection(actor.wyvernProjection, tileSize, creatureTuning),
        humanoidProjection: buildHumanoidVisualProjection(actor.humanoidProjection, tileSize, creatureTuning, actor.creatureRecipe),
        predatorProjection: buildPredatorVisualProjection(actor.predatorProjection, tileSize),
        impactResponse: cloneProjectionData(actor.impactResponse),
        lightEmitter: actor.lightEmitter ?? null
      };
    });
}

function buildPredatorVisualProjection(projection, tileSize) {
  if (!projection?.profileId) return null;
  const profile = getPredatorProjectionProfile(projection.profileId);
  return {
    classification: 'renderer_neutral_predator_visual_projection',
    profileId: projection.profileId,
    profile: cloneProjectionData(profile),
    gaitPhase: projection.gaitPhase ?? 0,
    idlePhase: projection.idlePhase ?? 0,
    movement01: projection.movement01 ?? 0,
    motionState: projection.motionState ?? 'idle',
    facing: projection.facing ?? 0,
    animationState: cloneProjectionData(projection.animationState),
    attackState: cloneProjectionData(projection.attackState),
    reactionState: cloneProjectionData(projection.reactionState),
    partCount: projection.partCount ?? 0,
    points: projectPointMap(projection.points, tileSize),
    sockets: projectPointMap(projection.sockets, tileSize),
    visualBounds: projectBounds(projection.visualBounds, tileSize)
  };
}

function buildHumanoidVisualProjection(projection, tileSize, creatureTuning = null, creatureRecipe = null) {
  if (!projection?.profileId) return null;
  const profile = resolveCreatureHumanoidProfile(getHumanoidProjectionProfile(projection.profileId, creatureTuning), creatureRecipe);
  return {
    classification: 'renderer_neutral_humanoid_visual_projection',
    profileId: projection.profileId,
    profile: cloneProjectionData(profile),
    scaleProfileId: projection.scaleProfileId ?? profile.scaleProfileId,
    gaitPhase: projection.gaitPhase ?? 0,
    idlePhase: projection.idlePhase ?? 0,
    movement01: projection.movement01 ?? 0,
    motionState: projection.motionState ?? 'idle',
    facing: projection.facing ?? 0,
    collisionPolicy: projection.collisionPolicy ?? profile.collision.policy,
    shadowPolicy: projection.shadowPolicy ?? profile.shadow.policy,
    animationState: cloneProjectionData(projection.animationState),
    attackState: cloneProjectionData(projection.attackState),
    guardState: cloneProjectionData(projection.guardState),
    reactionState: cloneProjectionData(projection.reactionState),
    motionTrails: (projection.motionTrails ?? []).map((sample) => ({
      ...sample,
      worldX: sample.x * tileSize,
      worldY: sample.y * tileSize
    })),
    partCount: projection.partCount ?? 0,
    points: projectPointMap(projection.points, tileSize),
    sockets: projectPointMap(projection.sockets, tileSize),
    visualBounds: projectBounds(projection.visualBounds, tileSize)
  };
}

function buildWyvernVisualProjection(projection, tileSize, creatureTuning = null) {
  if (!projection?.recipeId) return null;
  const recipe = getCreatureProjectionRecipe(projection.recipeId, creatureTuning);
  return {
    classification: 'renderer_neutral_wyvern_visual_projection',
    recipeId: projection.recipeId,
    bodyPlan: recipe.bodyPlan,
    locomotion: recipe.locomotion,
    anatomyContract: {
      wingLimbRole: recipe.wingAnatomy.limbRole,
      wingGroundedContact: recipe.wingAnatomy.groundedContact,
      wingDigitOrigin: recipe.wingAnatomy.digitOrigin,
      wingMembraneAttachment: recipe.wingAnatomy.bodyAttachmentRole,
      hindLegRole: recipe.hindLegAnatomy.limbRole
    },
    proportions: { ...recipe.proportions },
    proportionProfile: cloneProjectionData(recipe.proportionProfile),
    wingAnatomy: {
      ...recipe.wingAnatomy,
      digitLengths: [...recipe.wingAnatomy.digitLengths],
      digitOut: [...recipe.wingAnatomy.digitOut],
      digitBack: [...recipe.wingAnatomy.digitBack],
      sweepDigitOutAdd: [...(recipe.wingAnatomy.sweepDigitOutAdd ?? [])],
      sweepDigitBackRelax: [...(recipe.wingAnatomy.sweepDigitBackRelax ?? [])],
      digitKnuckleFractions: [...recipe.wingAnatomy.digitKnuckleFractions]
    },
    hindLegAnatomy: { ...recipe.hindLegAnatomy },
    palette: { ...recipe.palette },
    gaitPhase: projection.gaitPhase ?? 0,
    idlePhase: projection.idlePhase ?? 0,
    movement01: projection.movement01 ?? 0,
    motionState: cloneProjectionData(projection.motionState), axialTurn: cloneProjectionData(projection.axialTurn), malformedTurnFrameCount: projection.malformedTurnFrameCount ?? 0,
    actionState: cloneProjectionData(projection.actionState),
    comboState: cloneProjectionData(projection.comboState),
    limbRig: cloneProjectionData(projection.limbRig),
    proceduralPose: buildProceduralPoseProjection(projection.proceduralPose, tileSize),
    rigPose: projectCreatureRigPose(projection.rigPose, tileSize),
    bodyPoints: (projection.bodyPoints ?? []).map((point) => ({
      role: point.role,
      x: point.x,
      y: point.y,
      worldX: point.x * tileSize,
      worldY: point.y * tileSize
    }))
  };
}

function projectPointMap(points, tileSize) {
  return Object.fromEntries(Object.entries(points ?? {}).map(([key, point]) => [key, {
    ...point,
    worldX: point.x * tileSize,
    worldY: point.y * tileSize,
    worldRadius: Number.isFinite(point.radius) ? point.radius * tileSize : undefined
  }]));
}

function projectBounds(bounds, tileSize) {
  if (!bounds) return null;
  return {
    ...bounds,
    worldMinX: bounds.minX * tileSize,
    worldMinY: bounds.minY * tileSize,
    worldMaxX: bounds.maxX * tileSize,
    worldMaxY: bounds.maxY * tileSize,
    worldWidth: bounds.width * tileSize,
    worldHeight: bounds.height * tileSize
  };
}

function buildProceduralPoseProjection(pose, tileSize) {
  if (!pose) return null;
  const projected = cloneProjectionData(pose);
  projected.classification = 'renderer_neutral_procedural_pose_projection';
  projected.sockets = Object.fromEntries(Object.entries(pose.sockets ?? {}).map(([key, socket]) => [key, {
    ...socket,
    worldX: socket.x * tileSize,
    worldY: socket.y * tileSize
  }]));
  if (pose.attackContact) {
    projected.attackContact = {
      ...(projected.attackContact ?? {}),
      worldX: pose.attackContact.x * tileSize,
      worldY: pose.attackContact.y * tileSize,
      worldLength: (pose.attackContact.contactSize?.length ?? 0) * tileSize,
      worldWidth: (pose.attackContact.contactSize?.width ?? 0) * tileSize
    };
  }
  return projected;
}

function projectCreatureRigPose(rigPose, tileSize) {
  if (!rigPose) return null;
  const projected = projectRigValue(rigPose, tileSize);
  projected.classification = 'renderer_neutral_creature_rig_projection';
  if (rigPose.visualBounds) {
    projected.visualBounds = {
      ...rigPose.visualBounds,
      worldMinX: rigPose.visualBounds.minX * tileSize,
      worldMinY: rigPose.visualBounds.minY * tileSize,
      worldMaxX: rigPose.visualBounds.maxX * tileSize,
      worldMaxY: rigPose.visualBounds.maxY * tileSize,
      worldWidth: rigPose.visualBounds.width * tileSize,
      worldHeight: rigPose.visualBounds.height * tileSize
    };
  }
  projectMetricFields(projected.body, tileSize, ['neckWidth', 'shoulderWidth', 'chestWidth', 'chestLength', 'torsoWidth', 'hipWidth', 'hipLength', 'haunchWidth', 'haunchLength', 'hipAnchorBack']);
  projectMetricFields(projected.head, tileSize, ['headLength', 'headWidth', 'jawLength', 'jawWidth', 'openingSeparation']);
  return projected;
}

function projectRigValue(value, tileSize) {
  if (Array.isArray(value)) return value.map((item) => projectRigValue(item, tileSize));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = projectRigValue(child, tileSize);
  if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
    result.worldX = value.x * tileSize;
    result.worldY = value.y * tileSize;
  }
  if (Number.isFinite(value.width)) result.worldWidth = value.width * tileSize;
  return result;
}

function projectMetricFields(target, tileSize, keys) {
  if (!target) return;
  for (const key of keys) {
    if (!Number.isFinite(target[key])) continue;
    target[`world${key[0].toUpperCase()}${key.slice(1)}`] = target[key] * tileSize;
  }
}

function cloneProjectionData(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function buildDecalProjection(stamps, tileSize) {
  return stamps.map((stamp, index) => ({
    classification: 'renderer_neutral_decal_projection',
    id: `${stamp.kind ?? 'decal'}:${index}`,
    kind: stamp.kind ?? 'decal',
    sourceKind: stamp.kind ?? 'decal',
    visualRole: 'ground_decal',
    worldX: stamp.x * tileSize,
    worldY: stamp.y * tileSize,
    radius: Math.max(1, stamp.radius * tileSize),
    colour: stamp.colour ?? 'rgba(40,30,24,0.24)',
    rimColour: stamp.rimColour ?? null,
    opacity: stamp.opacity ?? 1,
    softness: stamp.softness ?? 0.9,
    visualMaterial: stamp.visualMaterial ?? null,
    poolShape: stamp.poolShape ?? null
  }));
}

function buildGroundHazardProjection(pools, tileSize) {
  return pools
    .filter((pool) => pool.age < pool.lifetime)
    .map((pool) => {
      const { life01, spread01, heat01, spreadScale } = resolveNapalmPoolVisualState(pool);
      return {
        classification: 'renderer_neutral_ground_hazard_projection',
        id: pool.id,
        kind: pool.kind ?? 'napalm_pool',
        sourceKind: 'napalm_pool',
        visualRole: 'ground_hazard',
        visualMaterial: pool.visualMaterial ?? 'residual_liquid_napalm_pool_v1',
        poolShape: pool.poolShape ?? 'irregular_low_pool',
        worldX: pool.x * tileSize,
        worldY: pool.y * tileSize,
        radius: Math.max(0.8, (pool.radius ?? 0.2) * tileSize * spreadScale),
        colour: pool.colour ?? 'rgba(218,68,18,0.56)',
        hotColour: pool.hotColour ?? 'rgba(255,184,66,0.82)',
        rimColour: pool.rimColour ?? 'rgba(33,11,7,0.42)',
        coolingColour: pool.coolingColour ?? 'rgba(82,20,12,0.38)',
        opacity: pool.opacity ?? 0.9,
        rimScale: pool.rimScale ?? 1.08,
        bodyScale: pool.bodyScale ?? 0.82,
        hotSpotScale: pool.hotSpotScale ?? 0.2,
        hotSpotCount: pool.hotSpotCount ?? 3,
        flickerPhase: pool.flickerPhase ?? 0,
        age: pool.age ?? 0,
        lifetime: pool.lifetime ?? null,
        life01,
        spread01,
        heat01,
        softness: 0.72,
        renderPriority: 20
      };
    });
}

function buildLightingProfileProjection(profile) {
  return {
    classification: 'renderer_neutral_lighting_profile_projection',
    id: profile.id,
    illuminationModel: profile.illuminationModel ?? 'ambient_plus_world_light_rgb_field_v1', illuminationCompositeMode: profile.illuminationCompositeMode ?? 'scene_colour_times_additive_illumination_field_v1',
    ambientIllumination: clamp01(profile.ambientIllumination ?? 0.14), ambientIlluminationColour: profile.ambientIlluminationColour ?? 'rgba(108, 124, 154, 1)', shadowColour: profile.shadowColour ?? 'rgba(0, 0, 0, 1)',
    lightRevealStrength: clamp01(profile.lightRevealStrength ?? 0.9),
    warmBloomOpacity: clamp01(profile.warmBloomOpacity ?? 0.2),
    shadowPassEnabled: profile.shadowPassEnabled !== false,
    shadowOpacity: clamp01(profile.shadowOpacity ?? 0.32),
    shadowSoftness: clamp01(profile.shadowSoftness ?? 0.6),
    shadowLengthScale: profile.shadowLengthScale ?? 1.1,
    shadowSpreadScale: profile.shadowSpreadScale ?? 1.2,
    shadowContactScale: profile.shadowContactScale ?? 0.72,
    shadowPenumbraScale: profile.shadowPenumbraScale ?? 1.2,
    shadowPenumbraAlphaScale: profile.shadowPenumbraAlphaScale ?? 0.44, shadowCoreDensityScale: profile.shadowCoreDensityScale ?? 0.38, shadowContactDensity: profile.shadowContactDensity ?? 1.08,
    shadowCoreFalloff: Array.isArray(profile.shadowCoreFalloff) ? [...profile.shadowCoreFalloff] : [0.58, 0.34, 0.16],
    shadowFieldSampleCount: profile.shadowFieldSampleCount ?? 5, shadowFieldSoftnessScale: profile.shadowFieldSoftnessScale ?? 1.12,
    shadowCompositeMode: profile.shadowCompositeMode ?? 'light_shadow_attenuation_blend_v0', shadowLightBlendStrength: profile.shadowLightBlendStrength ?? 1.08, shadowFieldAlphaScale: profile.shadowFieldAlphaScale ?? 2.05,
    shadowFieldRadiusScale: profile.shadowFieldRadiusScale ?? 0.72, shadowFieldTailTaperScale: profile.shadowFieldTailTaperScale ?? 0.54, shadowFieldEdgeSoftness: profile.shadowFieldEdgeSoftness ?? 1.08,
    shadowFieldPenumbraGamma: profile.shadowFieldPenumbraGamma ?? 1.08, shadowFieldTailFloor: profile.shadowFieldTailFloor ?? 0.24,
    lightHaloBlendScale: profile.lightHaloBlendScale ?? 1.16, lightHaloRadiusScale: profile.lightHaloRadiusScale ?? 1.08, lightOuterBlendScale: profile.lightOuterBlendScale ?? 0.92, lightCoreBlendScale: profile.lightCoreBlendScale ?? 0.84,
    shadowPolicy: profile.shadowPolicy ?? RENDER_BUDGETS.occlusionShadows.shadowPolicy
  };
}

function buildFogSmokeProjection(smokeSources, tileSize) {
  return smokeSources.map((source) => ({
    classification: 'renderer_neutral_fog_smoke_projection',
    id: source.id,
    kind: source.sourceKind ?? source.kind ?? 'smoke',
    sourceKind: source.sourceKind ?? source.kind ?? 'smoke',
    sourceId: source.sourceId ?? source.id,
    worldX: source.x * tileSize,
    worldY: source.y * tileSize,
    radius: Math.max(1, source.radius * tileSize),
    density: source.density ?? 1,
    opacity: source.opacity ?? 1,
    age: source.age ?? 0,
    lifetime: source.lifetime ?? null,
    life01: normalisedLife(source.age ?? 0, source.lifetime),
    driftScale: source.driftScale ?? 1,
    renderPriority: source.renderPriority ?? 0,
    softness: source.softness ?? 0.86,
    shape: source.shape ?? 'soft_disc',
    plumeId: source.plumeId ?? null,
    segmentIndex: source.segmentIndex ?? null,
    plumeT: source.plumeT ?? null,
    forwardX: source.forwardX ?? null,
    forwardY: source.forwardY ?? null
  }));
}

function normalisedLife(age, lifetime) {
  if (!Number.isFinite(lifetime) || lifetime <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - age / lifetime));
}

function syncRenderProjectionStats(renderLayers, data) {
  if (!renderLayers) return;
  if (renderLayers.lighting) {
    renderLayers.lighting.profileId = data.lightingProfile.id;
    renderLayers.lighting.activeLights = data.lightProjection.filter((light) => light.enabled && (light.revealStrength ?? light.effectiveIntensity) > 0).length;
    renderLayers.lighting.droppedLights = (data.lightSelection?.dormantCount ?? 0) + (data.lightSelection?.budgetDroppedCount ?? 0);
    renderLayers.lighting.budgetMax = RENDER_BUDGETS.lightEmitters.maxActive;
  }
  resetLightSpaceCullingStats(renderLayers.lightSpaceCulling, data.lightSpaceCulling);
  resetOcclusionShadowStats(renderLayers.occlusionShadows, data.occlusionShadows);
}

function createFallbackCamera() {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    viewportW: 1280,
    viewportH: 720
  };
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
