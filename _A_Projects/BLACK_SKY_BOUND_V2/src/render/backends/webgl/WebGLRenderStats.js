export function createWebGLRenderStats(layerIds = []) {
  const layers = {};
  for (const id of layerIds) layers[id] = createLayerStats(id);
  return {
    classification: 'webgl_renderer_runtime_stats',
    mode: 'real_layers',
    fullSceneTextureUploadActive: false,
    textureUploads: 0,
    totalMs: 0,
    backendPresentMs: 0,
    layerOrder: [...layerIds],
    layers
  };
}

export function ensureWebGLLayerStats(stats, layerId) {
  if (!stats.layers[layerId]) {
    stats.layers[layerId] = createLayerStats(layerId);
    stats.layerOrder.push(layerId);
  }
  return stats.layers[layerId];
}

export function resetWebGLFrameStats(stats) {
  stats.totalMs = 0; stats.backendPresentMs = 0;
  for (const layerId of stats.layerOrder) {
    const layer = ensureWebGLLayerStats(stats, layerId);
    layer.updateMs = 0; layer.renderMs = 0;
    layer.objectCount = 0; layer.status = 'inactive';
    layer.mode = null;
    layer.illuminationModel = null;
    layer.activeLightCount = 0;
    layer.overlayCount = 0;
    layer.influenceCount = 0;
    layer.lightingProfileId = null;
    layer.illuminationCompositeMode = null; layer.illuminationCompositeActive = false; layer.illuminationFieldPassCount = 0; layer.illuminationCompositePassCount = 0; layer.ambientIllumination = 0; layer.ambientIlluminationColour = null;
    layer.lightRevealStrength = 0;
    layer.warmBloomOpacity = 0;
    layer.flickeringLightCount = 0;
    layer.moonlightSceneLightCount = 0;
    layer.moonlightCloudOcclusionMode = null;
    layer.moonlightCloudPrimitiveCount = 0;
    layer.moonlightCloudScaleWorld = 0;
    layer.moonlightCloudPhaseWorldX = 0;
    layer.moonlightCloudPhaseWorldY = 0;
    layer.occlusionShadowMode = null;
    layer.occlusionShadowRegions = 0;
    layer.occlusionShadowRenderable = false;
    layer.shadowShaderMode = null;
    layer.shadowCompositeMode = null;
    layer.shadowBlendStrength = 0;
    layer.shadowFieldEdgeSoftness = 0;
    layer.shadowFieldPenumbraGamma = 0;
    layer.shadowFieldTailFloor = 0;
    layer.shadowLightHaloBlendScale = 0;
    layer.shadowPenumbraTriangleCount = 0;
    layer.shadowCoreTriangleCount = 0;
    layer.shadowContactTriangleCount = 0;
    layer.shadowContactFootprintCount = 0; layer.coarseProjectedShadowTriangleCount = 0;
    layer.shadowSegmentCount = 0;
    layer.shadowFieldPacketCount = 0;
    layer.shadowFieldSampleCount = 0;
    layer.shadowFieldPrimitiveCount = 0;
    layer.shadowSilhouettePrimitiveCount = 0;
    layer.shadowShaderPacketCount = 0;
    layer.shadowShaderPrimitiveCount = 0;
    layer.sceneryMode = null;
    layer.worldDepthMode = null;
    layer.depthSortedItemCount = 0;
    layer.scenerySourceCount = 0;
    layer.actorSourceCount = 0;
    layer.sceneryPrimitiveCount = 0;
    layer.actorPrimitiveCount = 0;
    layer.sceneObjectPresenceVisibleCount = 0;
    layer.sceneObjectLitDetailVisibleCount = 0;
    layer.sceneObjectVisibilityHeldCount = 0;
    layer.sceneObjectVisibilityFadingCount = 0; layer.treeFireActiveCount = 0; layer.treeFireBurntOutCount = 0; layer.proceduralTreeCount = 0; layer.proceduralTreeSplineCount = 0; layer.proceduralTreeFoliageClusterCount = 0; layer.proceduralUndergrowthCount = 0; layer.proceduralUndergrowthSplineCount = 0; layer.proceduralUndergrowthLeafClusterCount = 0; layer.proceduralUndergrowthEmberNodeCount = 0; layer.proceduralGeologyCount = 0; layer.proceduralGeologyHullPointCount = 0; layer.proceduralGeologyFacetCount = 0; layer.proceduralGeologyStrataSegmentCount = 0; layer.proceduralGeologyCrackSegmentCount = 0; layer.proceduralGeologyMossPatchCount = 0;
    layer.lightSpaceMode = null;
    layer.lightSpaceCullingActive = false;
    layer.lightSpaceCulledCount = 0;
    layer.hudMode = null;
    layer.lineCount = 0;
    layer.glyphCount = 0;
    layer.rectCount = 0;
    layer.radialCount = 0;
    layer.effectMode = null;
    layer.projectileCount = 0;
    layer.liveEffectCount = 0;
    layer.particleCount = 0;
    layer.particlePrimitiveCount = 0;
    layer.maxParticleCount = 0;
    layer.bloodEffectCount = 0;
    layer.bloodPrimitiveCount = 0;
    layer.decalMode = null;
    layer.liquidPoolCount = 0;
    layer.liquidPoolPrimitiveCount = 0;
    layer.hotSpotPrimitiveCount = 0;
    layer.bloodStainCount = 0;
    layer.bloodStainPrimitiveCount = 0;
    layer.actorMode = null;
    layer.playerWyvernSilhouetteActive = false;
    layer.playerWyvernPartCount = 0;
    layer.raiderHumanoidMode = null;
    layer.raiderHumanoidSilhouetteActive = false;
    layer.raiderHumanoidPartCount = 0;
    layer.raiderHumanoidTorchSocketCount = 0;
    layer.raiderHumanoidSpearSocketCount = 0;
    layer.predatorMode = null;
    layer.predatorSilhouetteActive = false;
    layer.predatorPartCount = 0;
    layer.actorLightReadabilityMode = null;
    layer.actorLightReadabilityCount = 0;
    layer.actorLightInfluenceCount = 0;
    layer.actorRimPrimitiveCount = 0;
    layer.actorCatchlightPrimitiveCount = 0;
    layer.actorContactShadowPrimitiveCount = 0;
    layer.actorCoreOcclusionPrimitiveCount = 0; layer.actorShadowLodMode = null; layer.actorShadowLodPolicy = null; layer.actorShadowLodCount = 0; layer.actorShadowLodPrimitiveCount = 0;
    layer.triangleCount = 0; layer.flyoverViewportIntersecting = false; layer.flyoverViewportTriangleCount = 0; layer.flyoverViewportCoverage = 0; layer.flyoverWorldBounds = null;
    layer.terrainTextureActive = false;
    layer.terrainTextureDisabledByRuntime = false;
    layer.terrainTextureUploadCount = 0;
    layer.terrainTextureKey = null;
    layer.postProcessMode = null;
    layer.passCount = 0;
    layer.renderTargetActive = false;
    layer.bodyStateEnabled = false;
    layer.healthPressure = 0;
    layer.hitPulse = 0;
    layer.staminaPressure = 0;
    layer.breathPulse = 0;
    layer.lifecycleState = 'alive';
    layer.lifecycleOverlayOpacity = 0;
    layer.lifecycleOverlayPolicy = null;
    layer.cameraAtmosphereMode = null;
    layer.cameraAtmosphereEnabled = false;
    layer.cameraAtmospherePolicy = null;
    layer.cameraAtmosphereToggleParam = null;
    layer.overlayOpacity = 0;
    layer.rainEnabled = false;
    layer.rainDensity = 0;
    layer.rainSpeed = 0;
    layer.rainAngle = 0;
    layer.rainStreakCount = 0;
    layer.rainPrimitiveCount = 0;
    layer.sparkEnabled = false;
    layer.sparkRate = 0;
    layer.sparkDriftX = 0;
    layer.sparkDriftY = 0;
    layer.sparkActiveCount = 0;
    layer.sparkPrimitiveCount = 0;
    layer.maxRainStreaks = 0;
    layer.maxSparkCount = 0;
    layer.fogSmokeMode = null;
    layer.sourceCount = 0;
    layer.primitiveCount = 0;
    layer.smokePrimitiveCount = 0;
    layer.scatterPrimitiveCount = 0;
    layer.contributingLightCount = 0;
    layer.maxSourceCount = 0;
    layer.maxPrimitiveCount = 0;
  }
}

export function timeWebGLPhase(stats, key, fn) {
  const start = readNowMs();
  const result = fn();
  stats[key] = roundMs((stats[key] ?? 0) + readNowMs() - start);
  return result;
}

export function timeWebGLLayer(stats, layerId, key, fn) {
  const layer = ensureWebGLLayerStats(stats, layerId);
  const start = readNowMs();
  const result = fn();
  layer[key] = roundMs((layer[key] ?? 0) + readNowMs() - start);
  return result;
}

export function recordWebGLLayerStats(stats, layerId, fields) {
  Object.assign(ensureWebGLLayerStats(stats, layerId), fields);
}

export function buildWebGLStatsSummary(stats) {
  const layers = {};
  for (const layerId of stats.layerOrder) {
    const layer = ensureWebGLLayerStats(stats, layerId);
    layers[layerId] = {
      status: layer.status,
      objectCount: layer.objectCount,
      updateMs: layer.updateMs,
      renderMs: layer.renderMs,
      gpuTimingMode: layer.gpuTimingMode ?? null, gpuTimingSupported: !!layer.gpuTimingSupported, gpuTimingDisjoint: !!layer.gpuTimingDisjoint, gpuRenderMs: layer.gpuRenderMs ?? 0, gpuSampleFrame: layer.gpuSampleFrame ?? -1, gpuSampleAgeFrames: layer.gpuSampleAgeFrames ?? -1,
      mode: layer.mode ?? null, phase: layer.phase ?? null, crackStage: layer.crackStage ?? 0, fragmentCount: layer.fragmentCount ?? 0, rayCount: layer.rayCount ?? 0,
      illuminationModel: layer.illuminationModel ?? null,
      activeLightCount: layer.activeLightCount ?? 0,
      overlayCount: layer.overlayCount ?? 0,
      influenceCount: layer.influenceCount ?? 0,
      lightingProfileId: layer.lightingProfileId ?? null,
      illuminationCompositeMode: layer.illuminationCompositeMode ?? null, illuminationCompositeActive: !!layer.illuminationCompositeActive, illuminationFieldPassCount: layer.illuminationFieldPassCount ?? 0, illuminationCompositePassCount: layer.illuminationCompositePassCount ?? 0, ambientIllumination: layer.ambientIllumination ?? 0, ambientIlluminationColour: layer.ambientIlluminationColour ?? null,
      lightRevealStrength: layer.lightRevealStrength ?? 0,
      warmBloomOpacity: layer.warmBloomOpacity ?? 0,
      emitterCompositeMode: layer.emitterCompositeMode ?? null,
      localRevealInfluenceCount: layer.localRevealInfluenceCount ?? 0,
      localGlowInfluenceCount: layer.localGlowInfluenceCount ?? 0,
      localCoreInfluenceCount: layer.localCoreInfluenceCount ?? 0,
      flickeringLightCount: layer.flickeringLightCount ?? 0,
      moonlightSceneLightCount: layer.moonlightSceneLightCount ?? 0,
      moonlightCloudOcclusionMode: layer.moonlightCloudOcclusionMode ?? null,
      moonlightCloudPrimitiveCount: layer.moonlightCloudPrimitiveCount ?? 0,
      moonlightCloudScaleWorld: layer.moonlightCloudScaleWorld ?? 0,
      moonlightCloudPhaseWorldX: layer.moonlightCloudPhaseWorldX ?? 0,
      moonlightCloudPhaseWorldY: layer.moonlightCloudPhaseWorldY ?? 0,
      occlusionShadowMode: layer.occlusionShadowMode ?? null,
      occlusionShadowRegions: layer.occlusionShadowRegions ?? 0,
      occlusionShadowRenderable: !!layer.occlusionShadowRenderable,
      shadowShaderMode: layer.shadowShaderMode ?? null,
      shadowCompositeMode: layer.shadowCompositeMode ?? null,
      shadowBlendStrength: layer.shadowBlendStrength ?? 0,
      shadowFieldEdgeSoftness: layer.shadowFieldEdgeSoftness ?? 0,
      shadowFieldPenumbraGamma: layer.shadowFieldPenumbraGamma ?? 0,
      shadowFieldTailFloor: layer.shadowFieldTailFloor ?? 0,
      shadowLightHaloBlendScale: layer.shadowLightHaloBlendScale ?? 0,
      shadowPenumbraTriangleCount: layer.shadowPenumbraTriangleCount ?? 0,
      shadowCoreTriangleCount: layer.shadowCoreTriangleCount ?? 0,
      shadowContactTriangleCount: layer.shadowContactTriangleCount ?? 0,
      shadowContactFootprintCount: layer.shadowContactFootprintCount ?? 0, coarseProjectedShadowTriangleCount: layer.coarseProjectedShadowTriangleCount ?? 0,
      shadowSegmentCount: layer.shadowSegmentCount ?? 0,
      shadowFieldPacketCount: layer.shadowFieldPacketCount ?? 0,
      shadowFieldSampleCount: layer.shadowFieldSampleCount ?? 0,
      shadowFieldPrimitiveCount: layer.shadowFieldPrimitiveCount ?? 0,
      shadowSilhouettePrimitiveCount: layer.shadowSilhouettePrimitiveCount ?? 0,
      shadowShaderPacketCount: layer.shadowShaderPacketCount ?? 0,
      shadowShaderPrimitiveCount: layer.shadowShaderPrimitiveCount ?? 0,
      shadowGeometryCacheHit: !!layer.shadowGeometryCacheHit, shadowGeometryCacheRebuilds: layer.shadowGeometryCacheRebuilds ?? 0, staticShadowPacketCount: layer.staticShadowPacketCount ?? 0, dynamicShadowPacketCount: layer.dynamicShadowPacketCount ?? 0, staticLightCacheHits: layer.staticLightCacheHits ?? 0, staticLightCacheMisses: layer.staticLightCacheMisses ?? 0,
      sceneryMode: layer.sceneryMode ?? null,
      worldDepthMode: layer.worldDepthMode ?? null,
      depthSortedItemCount: layer.depthSortedItemCount ?? 0,
      scenerySourceCount: layer.scenerySourceCount ?? 0,
      actorSourceCount: layer.actorSourceCount ?? 0,
      unitSpawnerFixtureSourceCount: layer.unitSpawnerFixtureSourceCount ?? 0, openingEggMode: layer.openingEggMode ?? null, openingEggSourceCount: layer.openingEggSourceCount ?? 0, openingEggShellPieceCount: layer.openingEggShellPieceCount ?? 0,
      sceneryPrimitiveCount: layer.sceneryPrimitiveCount ?? 0,
      actorPrimitiveCount: layer.actorPrimitiveCount ?? 0,
      unitSpawnerFixturePrimitiveCount: layer.unitSpawnerFixturePrimitiveCount ?? 0, openingEggPrimitiveCount: layer.openingEggPrimitiveCount ?? 0,
      sceneObjectPresenceVisibleCount: layer.sceneObjectPresenceVisibleCount ?? 0,
      sceneObjectLitDetailVisibleCount: layer.sceneObjectLitDetailVisibleCount ?? 0,
      sceneObjectVisibilityHeldCount: layer.sceneObjectVisibilityHeldCount ?? 0,
      sceneObjectVisibilityFadingCount: layer.sceneObjectVisibilityFadingCount ?? 0, treeFireActiveCount: layer.treeFireActiveCount ?? 0, treeFireBurntOutCount: layer.treeFireBurntOutCount ?? 0, proceduralTreeCount: layer.proceduralTreeCount ?? 0, proceduralTreeSplineCount: layer.proceduralTreeSplineCount ?? 0, proceduralTreeFoliageClusterCount: layer.proceduralTreeFoliageClusterCount ?? 0, proceduralUndergrowthCount: layer.proceduralUndergrowthCount ?? 0, proceduralUndergrowthSplineCount: layer.proceduralUndergrowthSplineCount ?? 0, proceduralUndergrowthLeafClusterCount: layer.proceduralUndergrowthLeafClusterCount ?? 0, proceduralUndergrowthEmberNodeCount: layer.proceduralUndergrowthEmberNodeCount ?? 0, proceduralGeologyCount: layer.proceduralGeologyCount ?? 0, proceduralGeologyHullPointCount: layer.proceduralGeologyHullPointCount ?? 0, proceduralGeologyFacetCount: layer.proceduralGeologyFacetCount ?? 0, proceduralGeologyStrataSegmentCount: layer.proceduralGeologyStrataSegmentCount ?? 0, proceduralGeologyCrackSegmentCount: layer.proceduralGeologyCrackSegmentCount ?? 0, proceduralGeologyMossPatchCount: layer.proceduralGeologyMossPatchCount ?? 0,
      lightSpaceMode: layer.lightSpaceMode ?? null,
      lightSpaceCullingActive: !!layer.lightSpaceCullingActive,
      lightSpaceCulledCount: layer.lightSpaceCulledCount ?? 0,
      hudMode: layer.hudMode ?? null,
      lineCount: layer.lineCount ?? 0,
      glyphCount: layer.glyphCount ?? 0,
      rectCount: layer.rectCount ?? 0,
      radialCount: layer.radialCount ?? 0,
      effectMode: layer.effectMode ?? null,
      projectileCount: layer.projectileCount ?? 0,
      liveEffectCount: layer.liveEffectCount ?? 0,
      particleCount: layer.particleCount ?? 0,
      particlePrimitiveCount: layer.particlePrimitiveCount ?? 0,
      maxParticleCount: layer.maxParticleCount ?? 0,
      bloodEffectCount: layer.bloodEffectCount ?? 0,
      bloodPrimitiveCount: layer.bloodPrimitiveCount ?? 0,
      decalMode: layer.decalMode ?? null,
      liquidPoolCount: layer.liquidPoolCount ?? 0,
      liquidPoolPrimitiveCount: layer.liquidPoolPrimitiveCount ?? 0,
      hotSpotPrimitiveCount: layer.hotSpotPrimitiveCount ?? 0,
      bloodStainCount: layer.bloodStainCount ?? 0,
      bloodStainPrimitiveCount: layer.bloodStainPrimitiveCount ?? 0,
      actorMode: layer.actorMode ?? null,
      playerWyvernSilhouetteActive: !!layer.playerWyvernSilhouetteActive,
      playerWyvernPartCount: layer.playerWyvernPartCount ?? 0,
      raiderHumanoidMode: layer.raiderHumanoidMode ?? null,
      raiderHumanoidSilhouetteActive: !!layer.raiderHumanoidSilhouetteActive,
      raiderHumanoidPartCount: layer.raiderHumanoidPartCount ?? 0,
      raiderHumanoidTorchSocketCount: layer.raiderHumanoidTorchSocketCount ?? 0,
      raiderHumanoidSpearSocketCount: layer.raiderHumanoidSpearSocketCount ?? 0,
      predatorMode: layer.predatorMode ?? null,
      predatorSilhouetteActive: !!layer.predatorSilhouetteActive,
      predatorPartCount: layer.predatorPartCount ?? 0,
      actorLightReadabilityMode: layer.actorLightReadabilityMode ?? null,
      actorLightReadabilityCount: layer.actorLightReadabilityCount ?? 0,
      actorLightInfluenceCount: layer.actorLightInfluenceCount ?? 0,
      actorRimPrimitiveCount: layer.actorRimPrimitiveCount ?? 0,
      actorCatchlightPrimitiveCount: layer.actorCatchlightPrimitiveCount ?? 0,
      actorContactShadowPrimitiveCount: layer.actorContactShadowPrimitiveCount ?? 0,
      actorCoreOcclusionPrimitiveCount: layer.actorCoreOcclusionPrimitiveCount ?? 0, actorShadowLodMode: layer.actorShadowLodMode ?? null, actorShadowLodPolicy: layer.actorShadowLodPolicy ?? null, actorShadowLodCount: layer.actorShadowLodCount ?? 0, actorShadowLodPrimitiveCount: layer.actorShadowLodPrimitiveCount ?? 0,
      triangleCount: layer.triangleCount ?? 0, flyoverViewportIntersecting: !!layer.flyoverViewportIntersecting, flyoverViewportTriangleCount: layer.flyoverViewportTriangleCount ?? 0, flyoverViewportCoverage: layer.flyoverViewportCoverage ?? 0, flyoverWorldBounds: layer.flyoverWorldBounds ?? null, infernoGeometry: layer.infernoGeometry ?? null,
      terrainTextureActive: !!layer.terrainTextureActive, terrainTextureDisabledByRuntime: !!layer.terrainTextureDisabledByRuntime,
      terrainTextureUploadCount: layer.terrainTextureUploadCount ?? 0,
      terrainTextureKey: layer.terrainTextureKey ?? null,
      postProcessMode: layer.postProcessMode ?? null,
      passCount: layer.passCount ?? 0,
      renderTargetActive: !!layer.renderTargetActive,
      postEnabled: !!layer.postEnabled,
      postProcessToggleParam: layer.postProcessToggleParam ?? null,
      gradeStrength: layer.gradeStrength ?? 0,
      shadowCoolStrength: layer.shadowCoolStrength ?? 0,
      fireWarmStrength: layer.fireWarmStrength ?? 0,
      vignetteStrength: layer.vignetteStrength ?? 0,
      vignetteRadius: layer.vignetteRadius ?? 0,
      grainStrength: layer.grainStrength ?? 0,
      glowProxyStrength: layer.glowProxyStrength ?? 0,
      lowHealthPostStrength: layer.lowHealthPostStrength ?? 0,
      bodyStateEnabled: !!layer.bodyStateEnabled,
      healthPressure: layer.healthPressure ?? 0,
      hitPulse: layer.hitPulse ?? 0,
      staminaPressure: layer.staminaPressure ?? 0,
      breathPulse: layer.breathPulse ?? 0,
      lifecycleState: layer.lifecycleState ?? 'alive',
      lifecycleOverlayOpacity: layer.lifecycleOverlayOpacity ?? 0,
      lifecycleOverlayPolicy: layer.lifecycleOverlayPolicy ?? null,
      cameraAtmosphereMode: layer.cameraAtmosphereMode ?? null,
      cameraAtmosphereEnabled: !!layer.cameraAtmosphereEnabled,
      cameraAtmospherePolicy: layer.cameraAtmospherePolicy ?? null,
      cameraAtmosphereToggleParam: layer.cameraAtmosphereToggleParam ?? null,
      overlayOpacity: layer.overlayOpacity ?? 0,
      rainEnabled: !!layer.rainEnabled,
      rainDensity: layer.rainDensity ?? 0,
      rainSpeed: layer.rainSpeed ?? 0,
      rainAngle: layer.rainAngle ?? 0,
      rainStreakCount: layer.rainStreakCount ?? 0,
      rainPrimitiveCount: layer.rainPrimitiveCount ?? 0,
      sparkEnabled: !!layer.sparkEnabled,
      sparkRate: layer.sparkRate ?? 0,
      sparkDriftX: layer.sparkDriftX ?? 0,
      sparkDriftY: layer.sparkDriftY ?? 0,
      sparkActiveCount: layer.sparkActiveCount ?? 0,
      sparkPrimitiveCount: layer.sparkPrimitiveCount ?? 0,
      emitterReactiveOverlayEnabled: !!layer.emitterReactiveOverlayEnabled,
      atmosphereEmitterCount: layer.atmosphereEmitterCount ?? 0,
      maxAtmosphereEmitters: layer.maxAtmosphereEmitters ?? 0,
      rainLightCatchStrength: layer.rainLightCatchStrength ?? 0,
      rainWarmTintStrength: layer.rainWarmTintStrength ?? 0,
      sparkLightCatchStrength: layer.sparkLightCatchStrength ?? 0,
      emitterInfluenceFalloff: layer.emitterInfluenceFalloff ?? 0,
      rainEmitterHitCount: layer.rainEmitterHitCount ?? 0,
      sparkEmitterHitCount: layer.sparkEmitterHitCount ?? 0,
      emitterInfluenceMax: layer.emitterInfluenceMax ?? 0,
      maxRainStreaks: layer.maxRainStreaks ?? 0,
      maxSparkCount: layer.maxSparkCount ?? 0,
      fogSmokeMode: layer.fogSmokeMode ?? null,
      sourceCount: layer.sourceCount ?? 0,
      primitiveCount: layer.primitiveCount ?? 0,
      smokePrimitiveCount: layer.smokePrimitiveCount ?? 0,
      scatterPrimitiveCount: layer.scatterPrimitiveCount ?? 0,
      contributingLightCount: layer.contributingLightCount ?? 0,
      maxSourceCount: layer.maxSourceCount ?? 0,
      maxPrimitiveCount: layer.maxPrimitiveCount ?? 0
    };
  }
  return {
    mode: stats.mode,
    fullSceneTextureUploadActive: stats.fullSceneTextureUploadActive, textureUploads: stats.textureUploads,
    totalMs: stats.totalMs, backendPresentMs: stats.backendPresentMs, gpuTimingMode: stats.gpuTimingMode ?? null, gpuTimingSupported: !!stats.gpuTimingSupported, gpuTimingDisjoint: !!stats.gpuTimingDisjoint, gpuPendingSamples: stats.gpuPendingSamples ?? 0,
    layerOrder: [...stats.layerOrder],
    layers
  };
}

function createLayerStats(id) {
  return {
    id,
    status: 'inactive',
    objectCount: 0,
    updateMs: 0,
    renderMs: 0,
    gpuTimingMode: null, gpuTimingSupported: false, gpuTimingDisjoint: false, gpuRenderMs: 0, gpuSampleFrame: -1, gpuSampleAgeFrames: -1,
    mode: null,
    illuminationModel: null,
    activeLightCount: 0,
    overlayCount: 0,
    influenceCount: 0,
    lightingProfileId: null,
    illuminationCompositeMode: null, illuminationCompositeActive: false, illuminationFieldPassCount: 0, illuminationCompositePassCount: 0, ambientIllumination: 0, ambientIlluminationColour: null,
    lightRevealStrength: 0,
    warmBloomOpacity: 0,
    flickeringLightCount: 0,
    moonlightSceneLightCount: 0,
    moonlightCloudOcclusionMode: null,
    moonlightCloudPrimitiveCount: 0,
    moonlightCloudScaleWorld: 0,
    moonlightCloudPhaseWorldX: 0,
    moonlightCloudPhaseWorldY: 0,
    occlusionShadowMode: null,
    occlusionShadowRegions: 0,
    occlusionShadowRenderable: false,
    shadowShaderMode: null,
    shadowCompositeMode: null,
    shadowBlendStrength: 0,
    shadowFieldEdgeSoftness: 0,
    shadowFieldPenumbraGamma: 0,
    shadowFieldTailFloor: 0,
    shadowLightHaloBlendScale: 0,
    shadowPenumbraTriangleCount: 0,
    shadowCoreTriangleCount: 0,
    shadowContactTriangleCount: 0,
    shadowContactFootprintCount: 0, coarseProjectedShadowTriangleCount: 0,
    shadowSegmentCount: 0,
    shadowFieldPacketCount: 0,
    shadowFieldSampleCount: 0,
    shadowFieldPrimitiveCount: 0,
    shadowSilhouettePrimitiveCount: 0,
    shadowShaderPacketCount: 0,
    shadowShaderPrimitiveCount: 0,
    sceneryMode: null,
    worldDepthMode: null,
    depthSortedItemCount: 0,
    scenerySourceCount: 0,
    actorSourceCount: 0,
    sceneryPrimitiveCount: 0,
    actorPrimitiveCount: 0,
    sceneObjectPresenceVisibleCount: 0,
    sceneObjectLitDetailVisibleCount: 0,
    sceneObjectVisibilityHeldCount: 0,
    sceneObjectVisibilityFadingCount: 0, treeFireActiveCount: 0, treeFireBurntOutCount: 0, proceduralTreeCount: 0, proceduralTreeSplineCount: 0, proceduralTreeFoliageClusterCount: 0, proceduralUndergrowthCount: 0, proceduralUndergrowthSplineCount: 0, proceduralUndergrowthLeafClusterCount: 0, proceduralUndergrowthEmberNodeCount: 0, proceduralGeologyCount: 0, proceduralGeologyHullPointCount: 0, proceduralGeologyFacetCount: 0, proceduralGeologyStrataSegmentCount: 0, proceduralGeologyCrackSegmentCount: 0, proceduralGeologyMossPatchCount: 0,
    lightSpaceMode: null,
    lightSpaceCullingActive: false,
    lightSpaceCulledCount: 0,
    hudMode: null,
    lineCount: 0,
    glyphCount: 0,
    rectCount: 0,
    radialCount: 0,
    effectMode: null,
    projectileCount: 0,
    liveEffectCount: 0,
    particleCount: 0,
    particlePrimitiveCount: 0,
    maxParticleCount: 0,
    bloodEffectCount: 0,
    bloodPrimitiveCount: 0,
    decalMode: null,
    liquidPoolCount: 0,
    liquidPoolPrimitiveCount: 0,
    hotSpotPrimitiveCount: 0,
    bloodStainCount: 0,
    bloodStainPrimitiveCount: 0,
    actorMode: null,
    playerWyvernSilhouetteActive: false,
    playerWyvernPartCount: 0,
    raiderHumanoidMode: null,
    raiderHumanoidSilhouetteActive: false,
    raiderHumanoidPartCount: 0,
    raiderHumanoidTorchSocketCount: 0,
    raiderHumanoidSpearSocketCount: 0,
    predatorMode: null,
    predatorSilhouetteActive: false,
    predatorPartCount: 0,
    actorLightReadabilityMode: null,
    actorLightReadabilityCount: 0,
    actorLightInfluenceCount: 0,
    actorRimPrimitiveCount: 0,
    actorCatchlightPrimitiveCount: 0,
    actorContactShadowPrimitiveCount: 0,
    actorCoreOcclusionPrimitiveCount: 0, actorShadowLodMode: null, actorShadowLodPolicy: null, actorShadowLodCount: 0, actorShadowLodPrimitiveCount: 0,
    triangleCount: 0, flyoverViewportIntersecting: false, flyoverViewportTriangleCount: 0, flyoverViewportCoverage: 0, flyoverWorldBounds: null,
    terrainTextureActive: false,
    terrainTextureDisabledByRuntime: false,
    terrainTextureUploadCount: 0,
    terrainTextureKey: null,
    postProcessMode: null,
    passCount: 0,
    renderTargetActive: false,
    bodyStateEnabled: false,
    healthPressure: 0,
    hitPulse: 0,
    staminaPressure: 0,
    breathPulse: 0,
    lifecycleState: 'alive',
    lifecycleOverlayOpacity: 0,
    lifecycleOverlayPolicy: null,
    cameraAtmosphereMode: null,
    cameraAtmosphereEnabled: false,
    cameraAtmospherePolicy: null,
    cameraAtmosphereToggleParam: null,
    overlayOpacity: 0,
    rainEnabled: false,
    rainDensity: 0,
    rainSpeed: 0,
    rainAngle: 0,
    rainStreakCount: 0,
    rainPrimitiveCount: 0,
    sparkEnabled: false,
    sparkRate: 0,
    sparkDriftX: 0,
    sparkDriftY: 0,
    sparkActiveCount: 0,
    sparkPrimitiveCount: 0,
    maxRainStreaks: 0,
    maxSparkCount: 0,
    fogSmokeMode: null,
    sourceCount: 0,
    primitiveCount: 0,
    smokePrimitiveCount: 0,
    scatterPrimitiveCount: 0,
    contributingLightCount: 0,
    maxSourceCount: 0,
    maxPrimitiveCount: 0
  };
}

function readNowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}
