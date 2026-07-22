import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { worldToScreen } from '../render/camera.js';
import { selectActiveLightViews, worldCircleIntersectsLightSpace } from './lightSpaceRenderCulling.js';

export const SHADOW_FIELD_CONTRACT = 'black-sky-bound.render-shadow-field.sdf-ready.v1';

export function buildExplicitOcclusionBlockers(sourceBlockers = [], options = RENDER_BUDGETS.occlusionShadows) {
  const inputs = Array.isArray(sourceBlockers) ? sourceBlockers : [];
  const candidates = [];
  let ignoredBlockers = 0;
  for (let i = 0; i < inputs.length; i += 1) {
    const blocker = normalizeExplicitBlocker(inputs[i], i);
    if (!blocker) {
      ignoredBlockers += 1;
      continue;
    }
    candidates.push(blocker);
  }
  const max = options.maxPhysicalBlockers ?? 0;
  return {
    blockers: candidates.slice(0, max),
    droppedBlockers: Math.max(0, candidates.length - max),
    ignoredBlockers,
    candidateCount: candidates.length,
    policy: options.blockerPolicy
  };
}

export function buildOcclusionShadowProjection(sourceBlockers, lights, camera, tileSize, lightSpaceCulling, profile, options = RENDER_BUDGETS.occlusionShadows) {
  const enabled = options.enabled !== false && profile.shadowPassEnabled !== false;
  if (!enabled) return emptyProjection(false, options);
  const blockerProjection = buildExplicitOcclusionBlockers(sourceBlockers, options);
  const shadowLights = selectActiveLightViews(
    [...(lights ?? [])].sort((a, b) => (b.shadowPriority ?? 0) - (a.shadowPriority ?? 0)),
    options.maxShadowCastingLights
  );
  const shadowRegions = [];
  const shadowFieldPackets = [];
  let shadowCastingLightCount = 0;
  for (const light of shadowLights) {
    const nearby = collectNearbyBlockers(light, blockerProjection.blockers, lightSpaceCulling, camera, tileSize, options);
    if (!nearby.length) continue;
    shadowCastingLightCount += 1;
    for (const blocker of nearby) {
      const shadow = projectBlockerShadow(light, blocker, camera, tileSize, profile, options);
      if (!shadow) continue;
      shadowRegions.push(shadow.region);
      shadowFieldPackets.push(...shadow.fieldPackets);
    }
  }
  return {
    classification: 'derived_render_shadow_projection',
    enabled: true,
    blockerPolicy: options.blockerPolicy,
    missingBlockerPolicy: options.missingBlockerPolicy,
    shadowPolicy: options.shadowPolicy,
    lightSpaceClippingPolicy: options.lightSpaceClippingPolicy,
    clippedToLightSpace: true,
    activeBlockers: blockerProjection.blockers.length,
    actorShadowBlockers: blockerProjection.blockers.filter(isActorShadowBlocker).length,
    droppedBlockers: blockerProjection.droppedBlockers,
    ignoredBlockers: blockerProjection.ignoredBlockers,
    shadowCastingLights: shadowCastingLightCount,
    shadowRegions,
    approximateShadowRegions: shadowRegions.length,
    shadowFieldContract: options.shadowFieldContract ?? SHADOW_FIELD_CONTRACT,
    shadowFieldSource: 'explicit_occlusion_blocker_and_visual_actor_light_distance_projection',
    shadowFieldPackets,
    shadowFieldPacketCount: shadowFieldPackets.length,
    actorShadowFieldPacketCount: shadowFieldPackets.filter(isActorShadowPacket).length,
    shadowFieldSampleCount: shadowFieldPackets.reduce((sum, packet) => sum + (packet.samples?.length ?? 0), 0),
    shadowSilhouettePrimitiveCount: shadowFieldPackets.filter((packet) => packet.silhouettePrimitive).length
  };
}

export function resetOcclusionShadowStats(stats, projection) {
  if (!stats) return;
  const current = projection ?? emptyProjection(false, RENDER_BUDGETS.occlusionShadows);
  stats.enabled = current.enabled;
  stats.blockerPolicy = current.blockerPolicy;
  stats.missingBlockerPolicy = current.missingBlockerPolicy;
  stats.shadowPolicy = current.shadowPolicy;
  stats.lightSpaceClippingPolicy = current.lightSpaceClippingPolicy;
  stats.clippedToLightSpace = current.clippedToLightSpace;
  stats.activeBlockers = current.activeBlockers;
  stats.actorShadowBlockers = current.actorShadowBlockers ?? 0;
  stats.droppedBlockers = current.droppedBlockers;
  stats.shadowCastingLights = current.shadowCastingLights;
  stats.approximateShadowRegions = current.approximateShadowRegions;
  stats.shadowFieldContract = current.shadowFieldContract;
  stats.shadowFieldPacketCount = current.shadowFieldPacketCount;
  stats.actorShadowFieldPacketCount = current.actorShadowFieldPacketCount ?? 0;
  stats.shadowFieldSampleCount = current.shadowFieldSampleCount;
  stats.shadowSilhouettePrimitiveCount = current.shadowSilhouettePrimitiveCount ?? 0;
}

export function sampleSdfReadyShadowFieldAt(packets = [], point = {}) {
  const inputs = Array.isArray(packets) ? packets : [];
  let dimness = 0;
  let contributingPacketCount = 0;
  for (const packet of inputs) {
    const contribution = sampleShadowFieldPacketAt(packet, point);
    if (contribution <= 0) continue;
    contributingPacketCount += 1;
    dimness = 1 - (1 - dimness) * (1 - contribution);
  }
  return {
    classification: 'debug_shadow_field_probe',
    contract: SHADOW_FIELD_CONTRACT,
    authority: 'validation_probe_only_not_gameplay_visibility_truth',
    dimness: round3(clamp01(dimness)),
    contributingPacketCount
  };
}

export function sampleShadowFieldPacketAt(packet, point = {}) {
  if (packet?.contract !== SHADOW_FIELD_CONTRACT) return 0;
  if (packet.kernel?.type !== 'screen_space_tapered_capsule_sdf') return 0;
  const kernel = packet.kernel;
  const px = Number(point.x);
  const py = Number(point.y);
  const sx = Number(kernel.start?.x);
  const sy = Number(kernel.start?.y);
  const ex = Number(kernel.end?.x);
  const ey = Number(kernel.end?.y);
  if (![px, py, sx, sy, ex, ey].every(Number.isFinite)) return 0;
  const ax = ex - sx;
  const ay = ey - sy;
  const axisLengthSq = Math.max(ax * ax + ay * ay, 0.0001);
  const along = clamp01(((px - sx) * ax + (py - sy) * ay) / axisLengthSq);
  const cx = sx + ax * along;
  const cy = sy + ay * along;
  const radius = lerp(Number(kernel.radiusStart) || 0, Number(kernel.radiusEnd) || 0, along) * 0.82;
  if (radius <= 0) return 0;
  const signedDistance = Math.hypot(px - cx, py - cy) - radius;
  const samples = packet.samples ?? [];
  const sampleAlpha = samples.reduce((max, sample) => Math.max(max, Number(sample.dimness) || 0), 0);
  const averageSoftness = samples.length
    ? samples.reduce((sum, sample) => sum + (Number(sample.softness) || 0.72), 0) / samples.length
    : Number(kernel.softness) || 0.62;
  const edge = Math.max(1, radius * Math.max(0.08, Math.min(1.6, averageSoftness)) * 0.42);
  const coverage = 1 - smoothstep(-edge, edge, signedDistance);
  const tailFade = lerp(1, 0.58, smoothstep(0.28, 1, along));
  return clamp01(sampleAlpha * 1.42 * coverage * tailFade);
}

function normalizeExplicitBlocker(input, index) {
  if (!input || input.castsShadow === false) return null;
  const x = Number(input.x);
  const y = Number(input.y);
  const radius = Number(input.radius);
  const height = Number(input.height ?? input.occlusionHeight);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) return null;
  if (!Number.isFinite(height) || height <= 0) return null;
  const sourceId = input.id ?? input.entityId ?? `physical:${index}`;
  return {
    id: `explicit_occlusion_blocker:${sourceId}`,
    classification: 'derived_explicit_occlusion_blocker',
    source: input.source ?? 'explicit_physical_occluder',
    entityId: input.entityId ?? null,
    blockerKind: input.blockerKind ?? input.kind ?? 'physical_occluder',
    x,
    y,
    radius,
    height,
    shadowSilhouette: normalizeShadowSilhouette(input.shadowSilhouette),
    static: input.static !== false
  };
}

function collectNearbyBlockers(light, blockers, lightSpaceCulling, camera, tileSize, options) {
  const max = options.maxBlockersPerLight;
  const nearby = [];
  for (const blocker of blockers) {
    const dx = blocker.x - light.x;
    const dy = blocker.y - light.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.01 || distance > light.radius * 0.96) continue;
    if (!worldCircleIntersectsLightSpace(lightSpaceCulling, camera, tileSize, blocker.x, blocker.y, blocker.radius)) continue;
    nearby.push({ ...blocker, distance });
  }
  nearby.sort((a, b) => a.distance - b.distance);
  return nearby.slice(0, max);
}

function projectBlockerShadow(light, blocker, camera, tileSize, profile, options) {
  const lightScreen = worldToScreen(camera, light.x * tileSize, light.y * tileSize);
  const blockerScreen = worldToScreen(camera, blocker.x * tileSize, blocker.y * tileSize);
  const vx = blockerScreen.x - lightScreen.x;
  const vy = blockerScreen.y - lightScreen.y;
  const distancePx = Math.hypot(vx, vy);
  if (distancePx <= 1) return null;
  const nx = vx / distancePx;
  const ny = vy / distancePx;
  const px = -ny;
  const py = nx;
  const blockerRadiusPx = Math.max(3, blocker.radius * tileSize * camera.zoom);
  const lightRadiusPx = Math.max(4, light.radius * tileSize * camera.zoom);
  const remaining = Math.max(0, lightRadiusPx - distancePx);
  const heightScale = clampRange(blocker.height * (light.shadowHeightScale ?? 1), 0.2, 2.5);
  const length = remaining * (profile.shadowLengthScale ?? 1.1) * heightScale * clampRange(light.shadowLengthScale ?? 1, 0.05, 2);
  if (length <= 2) return null;
  const nearWidth = blockerRadiusPx * (profile.shadowSpreadScale ?? 1.2);
  const farWidth = nearWidth + length * 0.34;
  const endX = blockerScreen.x + nx * length;
  const endY = blockerScreen.y + ny * length;
  const region = {
    blockerId: blocker.id,
    lightId: light.id,
    quality: 'sdf_ready_anchored_shadow_field_v1',
    blockerKind: blocker.blockerKind,
    fieldPacketId: `shadow_field:${light.id}:${blocker.id}`,
    points: [
      { x: blockerScreen.x + px * nearWidth, y: blockerScreen.y + py * nearWidth },
      { x: blockerScreen.x - px * nearWidth, y: blockerScreen.y - py * nearWidth },
      { x: endX - px * farWidth, y: endY - py * farWidth },
      { x: endX + px * farWidth, y: endY + py * farWidth }
    ],
    start: blockerScreen,
    end: { x: endX, y: endY },
    direction: { x: nx, y: ny },
    normal: { x: px, y: py },
    length,
    nearWidth,
    farWidth,
    screenScale: tileSize * camera.zoom,
    contactRadius: blockerRadiusPx * (profile.shadowContactScale ?? 0.72),
    distanceToLight: distancePx,
    lightRadius: lightRadiusPx,
    opacity: (profile.shadowOpacity ?? 0.32) * clampRange(light.shadowOpacityScale ?? 1, 0.05, 2),
    softness: profile.shadowSoftness ?? 0.6
  };
  return {
    region,
    fieldPackets: buildShadowFieldPackets(region, light, blocker, profile, options)
  };
}

function buildShadowFieldPackets(region, light, blocker, profile, options) {
  return shadowSilhouettePrimitives(blocker).map((primitive, index) => {
    const offsetX = (primitive.offsetX ?? 0) * region.screenScale;
    const offsetY = (primitive.offsetY ?? 0) * region.screenScale;
    const length = Math.max(3, region.length * primitive.lengthScale);
    const nearWidth = Math.max(3, region.nearWidth * primitive.widthScale);
    const farWidth = Math.max(3, region.farWidth * primitive.widthScale * primitive.tailWidthScale);
    return buildShadowFieldPacket({
      ...region,
      fieldPacketId: `${region.fieldPacketId}:${primitive.id}`,
      start: { x: region.start.x + offsetX, y: region.start.y + offsetY },
      end: { x: region.start.x + offsetX + region.direction.x * length, y: region.start.y + offsetY + region.direction.y * length },
      length,
      nearWidth,
      farWidth,
      opacity: (region.opacity ?? profile.shadowOpacity ?? 0.32) * primitive.dimnessScale,
      softness: (region.softness ?? profile.shadowSoftness ?? 0.6) * primitive.softnessScale,
      silhouetteShape: blocker.shadowSilhouette?.shape ?? 'radial_blocker_fallback_sdf_v0',
      silhouetteContract: blocker.shadowSilhouette?.contract ?? 'radius_blocker_shadow_silhouette.v1',
      silhouettePrimitive: primitive
    }, light, blocker, profile, options);
  });
}

function buildShadowFieldPacket(region, light, blocker, profile, options) {
  const sampleCount = Math.max(3, Math.min(7, Math.round(profile.shadowFieldSampleCount ?? 5)));
  const tValues = Array.from({ length: sampleCount }, (_, index) => (index + 0.5) / sampleCount);
  const baseAlpha = clamp01((region.opacity ?? profile.shadowOpacity ?? 0.32) * 0.72);
  const softnessScale = Math.max(0.7, Math.min(1.8, profile.shadowFieldSoftnessScale ?? 1.12));
  const samples = tValues.map((t, index) => {
    const radius = lerp(region.nearWidth, region.farWidth, t) * (0.58 + t * 0.22);
    const tail = Math.pow(1 - t, 0.72);
    return {
      index,
      t: round3(t),
      x: round3(region.start.x + region.direction.x * region.length * t),
      y: round3(region.start.y + region.direction.y * region.length * t),
      radius: round3(Math.max(4, radius)),
      dimness: round3(baseAlpha * (0.16 + tail * 0.24)),
      softness: round3(clamp01((region.softness ?? 0.6) * softnessScale + t * 0.08)),
      signedDistanceHint: 'negative_inside_radius_positive_outside'
    };
  });
  return {
    contract: options.shadowFieldContract ?? SHADOW_FIELD_CONTRACT,
    classification: 'derived_sdf_ready_shadow_field_packet',
    id: region.fieldPacketId,
    sourceRegionId: `${region.lightId}:${region.blockerId}`,
    blockerId: region.blockerId,
    lightId: region.lightId,
    blockerKind: blocker.blockerKind,
    blockerSource: blocker.source,
    staticBlocker: blocker.static !== false,
    source: `${blocker.source}.light_distance_shadow_field`,
    shape: region.silhouetteShape ?? 'tapered_capsule_chain',
    silhouettePrimitive: region.silhouettePrimitive ? {
      id: region.silhouettePrimitive.id,
      kind: region.silhouettePrimitive.kind,
      contract: region.silhouettePrimitive.contract ?? region.silhouetteContract ?? 'scene_object_shadow_silhouette.v1'
    } : null,
    kernel: {
      type: 'screen_space_tapered_capsule_sdf',
      start: { x: round3(region.start.x), y: round3(region.start.y) },
      end: { x: round3(region.end.x), y: round3(region.end.y) },
      direction: { x: round3(region.direction.x), y: round3(region.direction.y) },
      normal: { x: round3(region.normal.x), y: round3(region.normal.y) },
      radiusStart: round3(region.nearWidth),
      radiusEnd: round3(region.farWidth),
      length: round3(region.length),
      softness: round3(region.softness ?? 0.6)
    },
    light: {
      id: light.id,
      radius: round3(region.lightRadius),
      distanceToBlocker: round3(region.distanceToLight)
    },
    samples,
    sampleCount: samples.length,
    dimnessModel: 'compound_silhouette_sdf_capsule_falloff_v2',
    provenance: {
      owner: 'src/projection/occlusionShadowState.js',
      truthSource: 'explicit scene blocker or renderer-neutral actor visual silhouette plus active light position/radius',
      note: 'field packet is renderer-neutral derived projection; shader consumers consume silhouette SDF primitives directly'
    }
  };
}

function shadowSilhouettePrimitives(blocker) {
  const primitives = blocker.shadowSilhouette?.primitives;
  if (!Array.isArray(primitives) || !primitives.length) {
    return [normalizeShadowPrimitive({ id: 'radius_core', kind: 'radial_blocker' }, 0)];
  }
  return primitives.map(normalizeShadowPrimitive);
}

function normalizeShadowSilhouette(value) {
  if (!value || !Array.isArray(value.primitives)) return null;
  const contract = value.contract ?? 'scene_object_shadow_silhouette.v1';
  return {
    contract,
    shape: value.shape ?? 'compound_shadow_silhouette_sdf_v0',
    primitives: value.primitives.map((primitive, index) => ({
      ...normalizeShadowPrimitive(primitive, index),
      contract: primitive.contract ?? contract
    }))
  };
}

function normalizeShadowPrimitive(value = {}, index = 0) {
  return {
    id: String(value.id ?? `primitive_${index}`),
    kind: String(value.kind ?? 'silhouette_lobe'),
    offsetX: finite(value.offsetX, 0),
    offsetY: finite(value.offsetY, 0),
    widthScale: clampRange(value.widthScale ?? 1, 0.12, 1.4),
    lengthScale: clampRange(value.lengthScale ?? 1, 0.2, 1.6),
    tailWidthScale: clampRange(value.tailWidthScale ?? 0.72, 0.16, 1.1),
    dimnessScale: clampRange(value.dimnessScale ?? 1, 0.15, 1.6),
    softnessScale: clampRange(value.softnessScale ?? 1, 0.45, 1.8)
  };
}

function emptyProjection(enabled, options) {
  return {
    classification: 'derived_render_shadow_projection',
    enabled,
    blockerPolicy: options.blockerPolicy,
    missingBlockerPolicy: options.missingBlockerPolicy,
    shadowPolicy: options.shadowPolicy,
    lightSpaceClippingPolicy: options.lightSpaceClippingPolicy,
    clippedToLightSpace: true,
    activeBlockers: 0,
    droppedBlockers: 0,
    ignoredBlockers: 0,
    shadowCastingLights: 0,
    shadowRegions: [],
    approximateShadowRegions: 0,
    shadowFieldContract: options.shadowFieldContract ?? SHADOW_FIELD_CONTRACT,
    shadowFieldSource: 'explicit_occlusion_blocker_and_visual_actor_light_distance_projection',
    shadowFieldPackets: [],
    shadowFieldPacketCount: 0,
    actorShadowBlockers: 0,
    actorShadowFieldPacketCount: 0,
    shadowFieldSampleCount: 0,
    shadowSilhouettePrimitiveCount: 0
  };
}

function isActorShadowBlocker(blocker) {
  return blocker?.source === 'renderer_neutral_actor_visual_projection';
}

function isActorShadowPacket(packet) {
  return packet?.blockerSource === 'renderer_neutral_actor_visual_projection';
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
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

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
