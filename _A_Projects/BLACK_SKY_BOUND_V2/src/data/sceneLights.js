export const SceneLightId = Object.freeze({
  MOONLIGHT: 'moonlight',
  STORM_LIGHTNING: 'storm_lightning'
});

export const SceneLightSourceKind = Object.freeze({
  MOONLIGHT: 'moonlight_scene_emission',
  LIGHTNING: 'lightning_scene_flash'
});

const LIGHTNING_ORIGIN_CACHE = new WeakMap();

export const SCENE_LIGHTS = Object.freeze({
  [SceneLightId.MOONLIGHT]: Object.freeze({
    id: SceneLightId.MOONLIGHT,
    classification: 'world_owned_scene_emission_light',
    label: 'Cloud-broken moonlight',
    sourceKind: SceneLightSourceKind.MOONLIGHT,
    sourcePolicy: 'fixed_world_scene_emission_not_player_or_camera_following',
    x: -18,
    y: -24,
    radius: 96,
    intensity: 0.22,
    softness: 0.97,
    colour: 'rgba(96, 124, 184, 1)',
    innerColour: 'rgba(164, 184, 222, 1)',
    flickerAmount: 0,
    flickerSpeed: 0,
    direction: Object.freeze({ x: 0.58, y: 0.82 }),
    shadow: Object.freeze({
      sourceHeight: 'high_moon_disc_above_scene',
      lengthScale: 0.42,
      opacityScale: 0.86,
      heightScale: 0.76
    }),
    cloudOcclusion: Object.freeze({
      enabled: true,
      contract: 'black-sky-bound.moonlight-cloud-occlusion.v0',
      mapPolicy: 'procedural_drifting_light_attenuation_no_cloud_sprites',
      scaleTiles: 22,
      bandCount: 5,
      opacity: 0.24,
      contrast: 0.55,
      minTransmission: 0.46,
      maxTransmission: 1,
      driftTilesPerSecond: Object.freeze({ x: 0.026, y: 0.009 }),
      shapeNoise: Object.freeze({
        enabled: true,
        amplitudeTiles: 2.4,
        frequency: 0.55,
        morphSpeed: 0.02,
        segments: 9
      })
    }),
  }),
  [SceneLightId.STORM_LIGHTNING]: Object.freeze({
    id: SceneLightId.STORM_LIGHTNING,
    classification: 'world_owned_scene_emission_light',
    label: 'Storm lightning flashes',
    sourceKind: SceneLightSourceKind.LIGHTNING,
    sourcePolicy: 'world_scene_storm_scheduler_not_player_or_camera_following',
    enabled: true,
    radius: 122,
    intensity: 1,
    luminousPowerLumens: 45000,
    overheadIlluminationIntensity: 1.75,
    softness: 0.94,
    colour: 'rgba(180, 205, 255, 1)',
    innerColour: 'rgba(255, 252, 230, 1)',
    direction: Object.freeze({ x: 0.18, y: 0.98 }),
    shadow: Object.freeze({
      sourceHeight: 'high_cloud_to_ground_flash',
      lengthScale: 0.24,
      opacityScale: 1.18,
      heightScale: 0.58
    }),
    storm: Object.freeze({
      contract: 'black-sky-bound.scene-lightning-flash-scheduler.v0',
      policy: 'deterministic_semirandom_clustered_storm_light_scene_emission',
      firstStrikeAt: 21,
      intervalSeconds: Object.freeze({ min: 18, max: 32 }),
      clusterCount: Object.freeze({ min: 1, max: 4 }),
      clusterSpacingSeconds: Object.freeze({ min: 0.05, max: 0.24 }),
      flashSeconds: 0.085,
      burnoffSeconds: 0.78,
      originBounds: Object.freeze({ minX: 2, maxX: 40, minY: 1, maxY: 13 }),
      thunder: Object.freeze({
        delay: Object.freeze({ baseMs: 520, perTileMs: 24, maxDistanceMs: 1700 }),
        intensity: Object.freeze({ base: 0.62, flashWeight: 0.38 }),
        cameraShake: Object.freeze({ durationMs: 720, amplitudeTiles: 0.18, frequencyHz: 12.5, decayPower: 2.05 })
      })
    })
  })
});

export const DEFAULT_SCENE_LIGHT_IDS = Object.freeze([SceneLightId.STORM_LIGHTNING]);

export function createSceneLights(ids = DEFAULT_SCENE_LIGHT_IDS) {
  return ids.map((id) => cloneSceneLight(getSceneLightDefinition(id)));
}

export function getSceneLightDefinition(id) {
  const light = SCENE_LIGHTS[id];
  if (!light) throw new Error(`Unknown scene light: ${id}`);
  return light;
}

export function buildSceneLightViews(sceneLights = [], renderTime = 0, visibilityContext = null) {
  return sceneLights
    .filter((light) => light?.enabled !== false)
    .flatMap((light) => {
      if (light.sourceKind === SceneLightSourceKind.LIGHTNING) return buildLightningSceneLightViews(light, renderTime, visibilityContext);
      return [buildStaticSceneLightView(light, renderTime)];
    });
}

export function getLightningEventStart(sceneLight, eventIndex) {
  const storm = sceneLight?.storm ?? SCENE_LIGHTS[SceneLightId.STORM_LIGHTNING].storm;
  const index = Math.max(0, Math.floor(Number(eventIndex) || 0));
  let time = finite(storm.firstStrikeAt, 21);
  for (let i = 0; i < index; i += 1) time += lightningIntervalSeconds(storm, i);
  return time;
}

export function queueManualLightningFlash(sceneLights, startedAt, sourceEventId = 'manual_lightning_sync') {
  const light = (sceneLights ?? []).find((candidate) => candidate?.id === SceneLightId.STORM_LIGHTNING);
  if (!light) return null;
  if (!Array.isArray(light.manualStrikes)) light.manualStrikes = [];
  const strike = {
    sequence: light.manualStrikes.length > 0 ? light.manualStrikes.at(-1).sequence + 1 : 1,
    startedAt: Math.max(0, finite(startedAt, 0)),
    sourceEventId
  };
  light.manualStrikes.push(strike);
  if (light.manualStrikes.length > 8) light.manualStrikes.splice(0, light.manualStrikes.length - 8);
  return strike;
}

function buildStaticSceneLightView(light, renderTime) {
  return {
    id: light.id,
    x: light.x,
    y: light.y,
    radius: light.radius,
    intensity: light.intensity,
    luminousPowerLumens: light.luminousPowerLumens ?? null,
    overheadIlluminationIntensity: light.overheadIlluminationIntensity ?? null,
    softness: light.softness,
    colour: light.colour,
    innerColour: light.innerColour,
    flickerAmount: light.flickerAmount ?? 0,
    flickerSpeed: light.flickerSpeed ?? 0,
    flickerPhase: light.flickerPhase ?? 0,
    renderTime,
    enabled: light.enabled !== false,
    sourceEntity: null,
    sourceKind: light.sourceKind,
    sceneLight: true,
    sourcePolicy: light.sourcePolicy,
    visualAnchorPolicy: light.sourceKind === SceneLightSourceKind.LIGHTNING
      ? 'fixed_world_storm_event_origin_v1'
      : null,
    direction: cloneData(light.direction),
    shadow: cloneData(light.shadow),
    cloudOcclusion: cloneData(light.cloudOcclusion),
    sourceAnchor: { type: 'scene_light', id: light.id }
  };
}

function buildLightningSceneLightViews(light, renderTime, visibilityContext) {
  const storm = light.storm ?? {};
  const time = finite(renderTime, 0);
  const active = [];
  let eventIndex = 0;
  let eventStart = finite(storm.firstStrikeAt, 24);
  const searchEnd = time + finite(storm.burnoffSeconds, 0.86) + 1.2;
  while (eventStart <= searchEnd && eventIndex < 512) {
    active.push(...buildLightningClusterViews(light, storm, eventIndex, eventStart, time, visibilityContext));
    eventStart += lightningIntervalSeconds(storm, eventIndex);
    eventIndex += 1;
  }
  for (const strike of light.manualStrikes ?? []) {
    const manualIndex = 100000 + Math.max(0, Math.floor(strike.sequence ?? 0));
    const views = buildLightningClusterViews(light, storm, manualIndex, finite(strike.startedAt, time), time, visibilityContext);
    active.push(...views.map((view) => ({
      ...view,
      stormEvent: { ...view.stormEvent, manual: true, sourceEventId: strike.sourceEventId ?? null }
    })));
  }
  return active;
}

function buildLightningClusterViews(light, storm, eventIndex, eventStart, time, visibilityContext) {
  const clusterCount = rangedInteger(storm.clusterCount, hash01(eventIndex, 11), 1, 4);
  const flashSeconds = Math.max(0.025, finite(storm.flashSeconds, 0.095));
  const burnoffSeconds = Math.max(0.08, finite(storm.burnoffSeconds, 0.86));
  const lastFlashOffset = clusterOffsetSeconds(storm, eventIndex, Math.max(0, clusterCount - 1));
  if (time < eventStart || time > eventStart + lastFlashOffset + flashSeconds + burnoffSeconds) return [];
  const origin = acquireLightningOrigin(light, storm, eventIndex, eventStart, visibilityContext);
  const views = [];
  for (let flashIndex = 0; flashIndex < clusterCount; flashIndex += 1) {
    const offset = clusterOffsetSeconds(storm, eventIndex, flashIndex);
    const startedAt = eventStart + offset;
    const elapsed = time - startedAt;
    if (elapsed < 0 || elapsed > flashSeconds + burnoffSeconds) continue;
    const envelope = lightningEnvelope(elapsed, flashSeconds, burnoffSeconds);
    const flashEnergy = flashIndex === 0 ? 1 : 0.65 + hash01(eventIndex, flashIndex, 83) * 0.35;
    const clusterEnergyScale = envelope.stage === 'afterimage_burnoff' ? 1 / Math.max(1, clusterCount) : 1;
    views.push({
      ...buildStaticSceneLightView(light, time),
      id: `${light.id}:${eventIndex}:${flashIndex}`,
      x: origin.x,
      y: origin.y,
      radius: light.radius * (0.94 + hash01(eventIndex, flashIndex, 43) * 0.14),
      intensity: clamp01((light.intensity ?? 1) * envelope.intensity * flashEnergy * clusterEnergyScale),
      flashStage: envelope.stage,
      flashElapsed: round3(elapsed),
      flashSeconds,
      burnoffSeconds,
      afterimageIntensity: round3(envelope.afterimageIntensity * clusterEnergyScale),
      influenceAlphaScale: envelope.stage === 'afterimage_burnoff' ? Math.max(0.015, envelope.afterimageIntensity * clusterEnergyScale * 0.38) : 1.35,
      stormEvent: {
        contract: storm.contract ?? 'black-sky-bound.scene-lightning-flash-scheduler.v0',
        policy: storm.policy ?? 'deterministic_semirandom_clustered_storm_light_scene_emission',
        eventIndex,
        flashIndex,
        clusterCount,
        flashEnergy: round3(flashEnergy),
        eventStart: round3(eventStart),
        startedAt: round3(startedAt),
        nextEventStart: eventIndex >= 100000 ? null : round3(getLightningEventStart(light, eventIndex + 1)),
        origin: { x: round3(origin.x), y: round3(origin.y) },
        originAcquisition: cloneData(origin.acquisition),
        intervalClampSeconds: cloneData(storm.intervalSeconds),
        thunder: cloneData(storm.thunder)
      }
    });
  }
  return views;
}

function lightningEnvelope(elapsed, flashSeconds, burnoffSeconds) {
  if (elapsed <= flashSeconds) {
    const flashT = elapsed / flashSeconds;
    return {
      stage: 'initial_flash',
      intensity: clamp01(1 - flashT * 0.18),
      afterimageIntensity: 1
    };
  }
  const t = clamp01((elapsed - flashSeconds) / burnoffSeconds);
  const remnant = Math.pow(1 - t, 2.35);
  return {
    stage: 'afterimage_burnoff',
    intensity: clamp01(0.34 * remnant + 0.035 * Math.pow(1 - t, 0.72)),
    afterimageIntensity: clamp01(remnant)
  };
}

function lightningIntervalSeconds(storm, eventIndex) {
  const range = storm.intervalSeconds ?? {};
  const min = Math.max(1, finite(range.min, 18));
  const max = Math.max(min, finite(range.max, 32));
  return min + hash01(eventIndex, 5) * (max - min);
}

function clusterOffsetSeconds(storm, eventIndex, flashIndex) {
  if (flashIndex <= 0) return 0;
  const range = storm.clusterSpacingSeconds ?? {};
  const min = Math.max(0.02, finite(range.min, 0.075));
  const max = Math.max(min, finite(range.max, 0.28));
  let offset = 0;
  for (let i = 1; i <= flashIndex; i += 1) offset += min + hash01(eventIndex, i, 29) * (max - min);
  return offset;
}

function lightningOrigin(storm, eventIndex) {
  const bounds = storm.originBounds ?? {};
  const minX = finite(bounds.minX, -12);
  const maxX = Math.max(minX, finite(bounds.maxX, 48));
  const minY = finite(bounds.minY, -18);
  const maxY = Math.max(minY, finite(bounds.maxY, 8));
  return {
    x: minX + hash01(eventIndex, 17) * (maxX - minX),
    y: minY + hash01(eventIndex, 23) * (maxY - minY)
  };
}

function acquireLightningOrigin(light, storm, eventIndex, eventStart, visibilityContext) {
  const key = `${eventIndex}:${round3(eventStart)}`;
  const records = lightningOriginRecords(light);
  const existing = records.find((record) => record.key === key);
  if (existing) return existing;
  const acquired = viewportLightningOrigin(visibilityContext, eventIndex);
  const fallback = lightningOrigin(storm, eventIndex);
  const record = acquired ?? {
    key,
    eventIndex,
    eventStart: round3(eventStart),
    x: fallback.x,
    y: fallback.y,
    acquisition: {
      policy: 'deterministic_scene_bounds_fallback_no_viewport_v1',
      worldFrozen: true
    }
  };
  record.key = key;
  record.eventIndex = eventIndex;
  record.eventStart = round3(eventStart);
  records.push(record);
  while (records.length > 16) records.shift();
  return record;
}

function viewportLightningOrigin(context, eventIndex) {
  const camera = context?.camera;
  const tileSize = Math.max(1, finite(context?.tileSize, 32));
  const zoom = Math.max(0.1, finite(camera?.zoom, 0));
  const viewportW = finite(camera?.viewportW, 0);
  const viewportH = finite(camera?.viewportH, 0);
  if (!camera || !Number.isFinite(Number(camera.x)) || !Number.isFinite(Number(camera.y)) || viewportW <= 0 || viewportH <= 0) return null;
  const centerX = Number(camera.x) / tileSize;
  const centerY = Number(camera.y) / tileSize;
  const halfWidthTiles = viewportW / (2 * zoom * tileSize);
  const halfHeightTiles = viewportH / (2 * zoom * tileSize);
  const upperOffsetTiles = Math.max(0.8, Math.min(4, halfHeightTiles * 0.52));
  const lateralRangeTiles = Math.max(0.55, Math.min(2.4, halfWidthTiles * 0.18));
  const lateralOffsetTiles = hashSigned(eventIndex, 211) * lateralRangeTiles;
  const diagonal = Math.SQRT1_2;
  const rawX = centerX - diagonal * upperOffsetTiles + diagonal * lateralOffsetTiles;
  const rawY = centerY - diagonal * upperOffsetTiles - diagonal * lateralOffsetTiles;
  const margin = 0.75;
  const mapMaxX = Math.max(margin, finite(context?.map?.width, rawX + margin) - margin);
  const mapMaxY = Math.max(margin, finite(context?.map?.height, rawY + margin) - margin);
  const x = clampRange(rawX, margin, mapMaxX);
  const y = clampRange(rawY, margin, mapMaxY);
  return {
    x,
    y,
    acquisition: {
      policy: 'viewport_acquired_then_world_frozen_v1',
      worldFrozen: true,
      intendedScreenBand: 'upper_middle',
      intendedViewportX: round3(clampRange(0.5 + lateralOffsetTiles / Math.max(1, halfWidthTiles * 2), 0.38, 0.62)),
      intendedViewportY: round3(clampRange(0.5 - upperOffsetTiles / Math.max(1, halfHeightTiles * 2), 0.16, 0.42)),
      cameraSnapshot: {
        x: round3(centerX),
        y: round3(centerY),
        zoom: round3(zoom),
        halfWidthTiles: round3(halfWidthTiles),
        halfHeightTiles: round3(halfHeightTiles)
      },
      clampedToMap: x !== rawX || y !== rawY
    }
  };
}

function lightningOriginRecords(light) {
  if (Array.isArray(light?.stormEventOrigins)) return light.stormEventOrigins;
  if (light && Object.isExtensible(light)) {
    light.stormEventOrigins = [];
    return light.stormEventOrigins;
  }
  let records = LIGHTNING_ORIGIN_CACHE.get(light);
  if (!records) {
    records = [];
    LIGHTNING_ORIGIN_CACHE.set(light, records);
  }
  return records;
}

function rangedInteger(range, seed, fallbackMin, fallbackMax) {
  const min = Math.max(0, Math.round(finite(range?.min, fallbackMin)));
  const max = Math.max(min, Math.round(finite(range?.max, fallbackMax)));
  return Math.max(min, Math.min(max, min + Math.floor(seed * (max - min + 1))));
}

function cloneSceneLight(light) {
  const cloned = cloneData(light);
  if (cloned?.sourceKind === SceneLightSourceKind.LIGHTNING) cloned.stormEventOrigins = [];
  return cloned;
}

function cloneData(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function hashSigned(...values) {
  return hash01(...values) * 2 - 1;
}

function hash01(...values) {
  const seed = values.reduce((sum, value, index) => sum + finite(value, 0) * (12.9898 + index * 7.233), 78.233);
  return fract(Math.sin(seed) * 43758.5453);
}

function fract(value) {
  return value - Math.floor(value);
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function clampRange(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
