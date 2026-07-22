export const WEBGL_LIQUID_INFERNO_MODE = 'cached_batched_macro_rolling_cluster_sdf_v10';
export const INFERNO_CLUSTER_MIN = 6;
export const INFERNO_CLUSTER_MAX = 10;
export const INFERNO_CLUSTER_TARGET = 8;

export function createInfernoGeometryStats() {
  return {
    mode: WEBGL_LIQUID_INFERNO_MODE,
    wallCount: 0,
    clusterCount: 0,
    dominantMassCount: 0,
    secondaryMassCount: 0,
    bridgeMassCount: 0,
    fuelPoolCount: 0,
    tallAccentCount: 0,
    apparentCombustionLobeCount: 0,
    compositionBuildCount: 0,
    compositionReuseCount: 0,
    retainedCompositionCount: 0,
    cachedStaticInstanceCount: 0,
    runtimeMutableFieldCount: 0,
    continuousFlameSheetCount: 0,
    triangleCount: 0,
    radialCount: 0,
    drawCallCount: 0,
    batchCount: 0,
    boundingAreaWorld: 0,
    estimatedCoveredAreaWorld: 0,
    maxClusterBoundingAreaWorld: 0,
    bufferUploadCount: 0,
    bufferReuseCount: 0
  };
}

export function resetInfernoGeometryStats(stats) {
  const fresh = createInfernoGeometryStats();
  for (const key of Object.keys(fresh)) stats[key] = fresh[key];
  return stats;
}

export function createLiquidInfernoComposition(wall) {
  const dx = wall.worldBx - wall.worldAx;
  const dy = wall.worldBy - wall.worldAy;
  const length = Math.hypot(dx, dy);
  if (length <= 1) return null;
  const tangentX = dx / length;
  const tangentY = dy / length;
  const normalX = -tangentY;
  const normalY = tangentX;
  const naturalCount = Math.round(length / Math.max(1, wall.worldWidth * 1.35));
  const count = clampInt(
    length > wall.worldWidth * 7 ? Math.max(INFERNO_CLUSTER_TARGET, naturalCount) : naturalCount,
    INFERNO_CLUSTER_MIN,
    INFERNO_CLUSTER_MAX
  );
  const layout = buildMacroClusterLayout(count, wall.seed);
  const dominantEntries = layout.filter((entry) => entry.role === 2);
  const accentLayoutIndices = new Set(
    [...dominantEntries]
      .sort((a, b) => pseudo(wall.seed + b.layoutIndex * 241) - pseudo(wall.seed + a.layoutIndex * 241))
      .slice(0, 2)
      .map((entry) => entry.layoutIndex)
  );
  const clusters = [];
  let boundingAreaWorld = 0;
  let maxClusterBoundingAreaWorld = 0;

  for (let index = 0; index < layout.length; index += 1) {
    const entry = layout[index];
    const seed = wall.seed + entry.layoutIndex * 193 + entry.macroIndex * 61;
    const t = clamp(entry.t, 0.035, 0.965);
    const edgeFade = Math.sin(t * Math.PI);
    const pathAmplitude = entry.role === 2 ? 0.06 : entry.role === 1 ? 0.1 : 0.035;
    const pathOffset = signedNoise(seed + 11) * wall.worldWidth * pathAmplitude * edgeFade;
    const dominant = entry.role === 2;
    const secondary = entry.role === 1;
    const scale = dominant
      ? 1.02 + pseudo(seed + 17) * 0.22
      : secondary
        ? 0.82 + pseudo(seed + 17) * 0.23
        : 0.82 + pseudo(seed + 17) * 0.16;
    const accent = accentLayoutIndices.has(entry.layoutIndex) ? 1 : 0;
    const widthFactor = dominant ? 1.82 : secondary ? 1.42 : 1.94;
    const heightFactor = dominant ? (accent ? 2.02 : 1.78) : secondary ? 1.44 : 1.18;
    const halfWidth = wall.worldWidth * scale * widthFactor;
    const halfHeight = wall.worldWidth * scale * heightFactor;
    const screenRise = dominant
      ? 0.47 + pseudo(seed + 19) * 0.11
      : secondary
        ? 0.34 + pseudo(seed + 19) * 0.1
        : 0.28 + pseudo(seed + 19) * 0.06;
    const area = halfWidth * halfHeight * 4;
    boundingAreaWorld += area;
    maxClusterBoundingAreaWorld = Math.max(maxClusterBoundingAreaWorld, area);
    clusters.push(Object.freeze({
      id: `${wall.id}:rolling_cluster:${index}`,
      index,
      macroIndex: entry.macroIndex,
      role: entry.role,
      worldX: wall.worldAx + dx * t + normalX * pathOffset,
      worldY: wall.worldAy + dy * t + normalY * pathOffset - wall.worldWidth * screenRise,
      halfWidth,
      halfHeight,
      tangentLocalX: tangentX / halfWidth,
      tangentLocalY: tangentY / halfHeight,
      seed01: pseudo(seed + 23),
      phase: pseudo(seed + 29) * Math.PI * 2 + entry.macroIndex * 0.72,
      variant: (index + Math.floor(pseudo(seed + 31) * 4)) % 4,
      accent
    }));
  }

  return {
    id: wall.id,
    signature: compositionSignature(wall),
    mode: WEBGL_LIQUID_INFERNO_MODE,
    clusters: Object.freeze(clusters),
    clusterCount: clusters.length,
    dominantMassCount: dominantEntries.length,
    secondaryMassCount: layout.filter((entry) => entry.role === 1).length,
    bridgeMassCount: layout.filter((entry) => entry.role === 0).length,
    fuelPoolCount: clusters.length,
    tallAccentCount: accentLayoutIndices.size,
    apparentCombustionLobeCount: layout.reduce((sum, entry) => sum + (entry.role === 2 ? 7 : entry.role === 1 ? 5 : 3), 0) + accentLayoutIndices.size * 2,
    boundingAreaWorld,
    estimatedCoveredAreaWorld: boundingAreaWorld * 0.46,
    maxClusterBoundingAreaWorld,
    age: wall.age,
    lifetime: wall.lifetime,
    lifeScale: wall.lightScale,
    bufferState: 'pending_upload',
    bufferUploadCount: 0,
    bufferReuseCount: 0
  };
}

export function syncLiquidInfernoComposition(composition, wall) {
  composition.age = wall.age;
  composition.lifetime = wall.lifetime;
  composition.lifeScale = wall.lightScale;
  return composition;
}

export function recordInfernoComposition(stats, composition, { built = false } = {}) {
  if (!composition) return stats;
  stats.wallCount += 1;
  stats.clusterCount += composition.clusterCount;
  stats.dominantMassCount += composition.dominantMassCount;
  stats.secondaryMassCount += composition.secondaryMassCount;
  stats.bridgeMassCount += composition.bridgeMassCount;
  stats.fuelPoolCount += composition.fuelPoolCount;
  stats.tallAccentCount += composition.tallAccentCount;
  stats.apparentCombustionLobeCount += composition.apparentCombustionLobeCount;
  stats.compositionBuildCount += built ? 1 : 0;
  stats.compositionReuseCount += built ? 0 : 1;
  stats.retainedCompositionCount += 1;
  stats.cachedStaticInstanceCount += composition.clusterCount;
  stats.runtimeMutableFieldCount += 3;
  stats.batchCount += 1;
  stats.drawCallCount += 1;
  stats.boundingAreaWorld += composition.boundingAreaWorld;
  stats.estimatedCoveredAreaWorld += composition.estimatedCoveredAreaWorld;
  stats.maxClusterBoundingAreaWorld = Math.max(stats.maxClusterBoundingAreaWorld, composition.maxClusterBoundingAreaWorld);
  stats.bufferUploadCount += composition.bufferUploadCount;
  stats.bufferReuseCount += composition.bufferReuseCount;
  return stats;
}

export function compositionSignature(wall) {
  return [
    wall.id,
    round3(wall.worldAx),
    round3(wall.worldAy),
    round3(wall.worldBx),
    round3(wall.worldBy),
    round3(wall.worldWidth),
    wall.seed
  ].join(':');
}

function buildMacroClusterLayout(count, seed) {
  const dominantCount = count >= 7 ? 3 : 2;
  const bridgeCount = dominantCount - 1;
  const secondaryCount = count - dominantCount - bridgeCount;
  const centers = Array.from({ length: dominantCount }, (_, macroIndex) => {
    const base = (macroIndex + 0.55) / (dominantCount + 0.1);
    return clamp(base + signedNoise(seed + 101 + macroIndex * 37) * (macroIndex === 1 ? 0.035 : 0.024), 0.1, 0.9);
  });
  const layout = [];
  let layoutIndex = 0;
  for (let macroIndex = 0; macroIndex < bridgeCount; macroIndex += 1) {
    const midpoint = (centers[macroIndex] + centers[macroIndex + 1]) * 0.5;
    layout.push({
      layoutIndex: layoutIndex++,
      macroIndex,
      role: 0,
      t: midpoint + signedNoise(seed + 211 + macroIndex * 43) * 0.018
    });
  }
  for (let index = 0; index < secondaryCount; index += 1) {
    const macroIndex = index % dominantCount;
    const direction = macroIndex === 0
      ? 1
      : macroIndex === dominantCount - 1
        ? -1
        : pseudo(seed + 307 + index * 47) > 0.5 ? 1 : -1;
    const offset = 0.045 + pseudo(seed + 313 + index * 53) * 0.035;
    layout.push({
      layoutIndex: layoutIndex++,
      macroIndex,
      role: 1,
      t: centers[macroIndex] + direction * offset
    });
  }
  for (let macroIndex = 0; macroIndex < dominantCount; macroIndex += 1) {
    layout.push({ layoutIndex: layoutIndex++, macroIndex, role: 2, t: centers[macroIndex] });
  }
  return layout;
}

function pseudo(seed) {
  let value = Math.imul(seed ^ 0x9e3779b9, 1597334677);
  value ^= value >>> 15;
  value = Math.imul(value, 3812015801);
  value ^= value >>> 13;
  return ((value >>> 0) % 10000) / 10000;
}

function signedNoise(seed) {
  return pseudo(seed) * 2 - 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
