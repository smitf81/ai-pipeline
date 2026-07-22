export function buildLightProjection(lights, tileSize) {
  return lights.map((light) => {
    const flicker = resolveLightFlicker(light);
    const radiusTiles = Math.max(0, Number(light.radius ?? 0));
    const baseIntensity = clamp01(light.intensity ?? 1);
    const contribution = resolveProjectionContribution(light, radiusTiles, baseIntensity);
    const revealFlicker = 1 + (flicker.intensityMultiplier - 1) * 0.08;
    const baseRadius = Math.max(1, contribution.glowRadius * tileSize);
    const baseRevealRadius = Math.max(1, contribution.revealRadius * tileSize);
    const baseCoreRadius = Math.max(1, contribution.coreRadius * tileSize);
    const revealStrength = clamp01(contribution.revealStrength * revealFlicker);
    const effectiveIntensity = clamp01(contribution.glowStrength * flicker.intensityMultiplier);
    const coreStrength = clamp01(contribution.coreStrength * flicker.intensityMultiplier);
    return {
      classification: 'renderer_neutral_light_projection',
      id: light.id,
      enabled: light.enabled !== false,
      x: light.x,
      y: light.y,
      worldX: light.x * tileSize,
      worldY: light.y * tileSize,
      radius: Math.max(1, baseRadius * flicker.radiusMultiplier),
      baseRadius,
      revealRadius: Math.max(1, baseRevealRadius * (1 + (flicker.radiusMultiplier - 1) * 0.08)),
      baseRevealRadius,
      revealStrength,
      glowRadius: Math.max(1, baseRadius * flicker.radiusMultiplier),
      baseGlowRadius: baseRadius,
      glowStrength: effectiveIntensity,
      coreRadius: Math.max(1, baseCoreRadius * flicker.radiusMultiplier),
      baseCoreRadius,
      coreStrength,
      intensity: contribution.glowStrength,
      effectiveIntensity,
      colour: light.colour ?? 'rgba(255,154,72,0.85)',
      innerColour: light.innerColour ?? 'rgba(255,226,170,1)',
      softness: Math.max(0, Math.min(1, light.softness ?? 0.72)),
      flickerAmount: clamp01(light.flickerAmount ?? 0),
      flickerSpeed: Math.max(0, Number(light.flickerSpeed ?? 0)),
      flickerPhase: Number.isFinite(Number(light.flickerPhase)) ? Number(light.flickerPhase) : 0,
      renderTime: Number.isFinite(Number(light.renderTime)) ? Number(light.renderTime) : 0,
      flickerValue: flicker.value,
      flickerIntensityMultiplier: flicker.intensityMultiplier,
      flickerRadiusMultiplier: flicker.radiusMultiplier,
      sourceEntity: light.sourceEntity ?? null,
      sourceKind: light.sourceKind ?? 'unknown_light',
      sourceSocket: light.sourceSocket ?? null,
      sourceAnchor: cloneData(light.sourceAnchor),
      ambientParticleKind: light.ambientParticleKind ?? null,
      smokeSourceKind: light.smokeSourceKind ?? null,
      sceneLight: !!light.sceneLight,
      sourcePolicy: light.sourcePolicy ?? null,
      shadowPriority: finite(light.shadowPriority, 0),
      direction: normalizeDirection(light.direction),
      shadow: buildShadowProjection(light),
      cloudOcclusion: buildCloudOcclusionProjection(light, tileSize),
      flashStage: light.flashStage ?? null,
      flashElapsed: finite(light.flashElapsed, null),
      flashSeconds: finite(light.flashSeconds, null),
      burnoffSeconds: finite(light.burnoffSeconds, null),
      afterimageIntensity: clamp01(light.afterimageIntensity ?? 0),
      influenceAlphaScale: clampRange(light.influenceAlphaScale ?? 1, 0, 2),
      stormEvent: cloneData(light.stormEvent)
    };
  });
}

function buildShadowProjection(light) {
  const shadow = light.shadow ?? {};
  return {
    classification: 'renderer_neutral_light_shadow_metadata',
    sourceHeight: shadow.sourceHeight ?? null,
    lengthScale: clampRange(shadow.lengthScale ?? 1, 0.05, 2),
    opacityScale: clampRange(shadow.opacityScale ?? 1, 0.05, 2),
    heightScale: clampRange(shadow.heightScale ?? 1, 0.05, 2)
  };
}

function buildCloudOcclusionProjection(light, tileSize) {
  const cloud = light.cloudOcclusion;
  if (!cloud?.enabled) return null;
  const renderTime = Number.isFinite(Number(light.renderTime)) ? Number(light.renderTime) : 0;
  const drift = cloud.driftTilesPerSecond ?? {};
  const scaleTiles = Math.max(2, Number(cloud.scaleTiles ?? 10) || 10);
  const noise = cloud.shapeNoise ?? {};
  return {
    classification: 'renderer_neutral_moonlight_cloud_occlusion_projection',
    contract: cloud.contract ?? 'black-sky-bound.moonlight-cloud-occlusion.v0',
    enabled: true,
    mapPolicy: cloud.mapPolicy ?? 'procedural_light_attenuation_no_cloud_sprites',
    scaleTiles,
    scale: scaleTiles * tileSize,
    bandCount: Math.max(1, Math.min(12, Math.round(cloud.bandCount ?? 6))),
    opacity: clamp01(cloud.opacity ?? 0.1),
    contrast: clamp01(cloud.contrast ?? 0.4),
    minTransmission: clamp01(cloud.minTransmission ?? 0.5),
    maxTransmission: clamp01(cloud.maxTransmission ?? 1),
    driftWorldX: finite(drift.x, 0) * tileSize,
    driftWorldY: finite(drift.y, 0) * tileSize,
    phaseWorldX: finite(drift.x, 0) * tileSize * renderTime,
    phaseWorldY: finite(drift.y, 0) * tileSize * renderTime,
    shapeNoise: {
      enabled: noise.enabled !== false,
      amplitude: clampRange(noise.amplitudeTiles ?? 0, 0, 4) * tileSize,
      frequency: clampRange(noise.frequency ?? 0.7, 0.05, 3),
      morphPhase: finite(noise.morphSpeed, 0) * renderTime,
      segments: Math.max(1, Math.min(12, Math.round(noise.segments ?? 5)))
    }
  };
}

function resolveLightFlicker(light) {
  const amount = Math.max(0, Math.min(0.45, Number(light.flickerAmount ?? 0)));
  const speed = Math.max(0, Number(light.flickerSpeed ?? 0));
  const phase = Number.isFinite(Number(light.flickerPhase)) ? Number(light.flickerPhase) : 0;
  const time = Number.isFinite(Number(light.renderTime)) ? Number(light.renderTime) : 0;
  if (amount <= 0 || speed <= 0) return { value: 0, intensityMultiplier: 1, radiusMultiplier: 1 };
  const t = time * speed + phase;
  const value = clampSigned(
    Math.sin(t) * 0.58
      + Math.sin(t * 1.73 + 1.9) * 0.27
      + Math.sin(t * 3.11 + 0.4) * 0.15
  );
  return {
    value,
    intensityMultiplier: Math.max(0.72, Math.min(1.22, 1 + value * amount)),
    radiusMultiplier: Math.max(0.96, Math.min(1.04, 1 + value * amount * 0.18))
  };
}

function resolveProjectionContribution(light, radiusTiles, intensity) {
  const hasSplit = ['revealRadius', 'revealStrength', 'glowRadius', 'glowStrength', 'coreRadius', 'coreStrength']
    .some((key) => Number.isFinite(Number(light?.[key])));
  const sceneEmission = (light?.sceneLight || light?.sourceAnchor?.type === 'scene_light') && !hasSplit;
  if (sceneEmission) {
    return {
      revealRadius: radiusTiles,
      revealStrength: intensity,
      glowRadius: radiusTiles,
      glowStrength: intensity,
      coreRadius: Math.max(0.1, radiusTiles * 0.62),
      coreStrength: intensity
    };
  }
  const glowRadius = Math.max(0, finite(light?.glowRadius, hasSplit ? radiusTiles : radiusTiles * 0.46));
  const glowStrength = clamp01(finite(light?.glowStrength, hasSplit ? intensity : intensity * 0.5));
  return {
    revealRadius: Math.max(0, finite(light?.revealRadius, radiusTiles)),
    revealStrength: clamp01(finite(light?.revealStrength, intensity * 0.68)),
    glowRadius,
    glowStrength,
    coreRadius: Math.max(0, finite(light?.coreRadius, Math.max(0.08, glowRadius * 0.15))),
    coreStrength: clamp01(finite(light?.coreStrength, Math.max(intensity * 0.72, glowStrength)))
  };
}

function normalizeDirection(value) {
  const x = finite(value?.x, 0.58);
  const y = finite(value?.y, 0.82);
  const length = Math.hypot(x, y);
  if (length <= 0.001) return { x: 0.58, y: 0.82 };
  return { x: x / length, y: y / length };
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cloneData(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function clampSigned(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function clampRange(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}
