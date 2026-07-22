import { MAMA_WYVERN_WORLD_EVENT, MamaWyvernEventPhase } from '../data/mamaWyvernWorldEvents.js';

export function buildWorldEventProjection(worldEvents, tileSize, scenery = []) {
  const active = worldEvents?.activeEvent ?? null;
  const flyovers = active?.phase === MamaWyvernEventPhase.FLYOVER
    ? [projectFlyover(active, tileSize)]
    : [];
  const fireWalls = (worldEvents?.fireWalls ?? []).map((wall) => projectFireWall(wall, tileSize));
  const treeFires = scenery.filter((object) => object.material?.state?.firePhase).map(projectTreeFire);
  return {
    classification: 'renderer_neutral_world_spatial_event_projection',
    contract: worldEvents?.contract ?? MAMA_WYVERN_WORLD_EVENT.contract,
    activePhase: active?.phase ?? null,
    activeKind: active?.kind ?? null,
    warningActive: active?.phase === MamaWyvernEventPhase.WARNING,
    flyovers,
    fireWalls,
    treeFires,
    completedCount: worldEvents?.completedCount ?? 0
  };
}

function projectTreeFire(object) {
  const state = object.material.state;
  return {
    id: object.id,
    classification: 'runtime_tree_fire_emissive_overlay_projection',
    phase: state.firePhase,
    phaseProgress: state.firePhaseProgress,
    heatAmount: state.heatAmount,
    emberAmount: state.emberAmount,
    smokeAmount: state.smokeAmount,
    charAmount: state.charAmount,
    fireAge: state.fireAge,
    worldX: object.worldX,
    worldY: object.worldY,
    worldTileX: object.worldTileX,
    worldTileY: object.worldTileY,
    worldWidth: object.worldWidth,
    worldHeight: object.worldHeight
  };
}

function projectFlyover(event, tileSize) {
  const progress = clamp01(event.progress);
  const opacityEnvelope = Math.pow(Math.sin(progress * Math.PI), 0.48);
  return {
    id: event.id,
    kind: event.kind,
    source: event.source,
    phase: event.phase,
    progress,
    worldX: event.worldX * tileSize,
    worldY: event.worldY * tileSize,
    headingRadians: event.headingRadians,
    forwardX: event.forwardX,
    forwardY: event.forwardY,
    rightX: event.rightX,
    rightY: event.rightY,
    crossingAnchorPolicy: event.crossingAnchorPolicy,
    crossingWorldX: event.centerX * tileSize,
    crossingWorldY: event.centerY * tileSize,
    scale: event.shadowScale,
    opacity: event.shadowOpacity * opacityEnvelope,
    penumbraOpacity: MAMA_WYVERN_WORLD_EVENT.shadow.penumbraOpacity * opacityEnvelope,
    worldScale: event.shadowScale * tileSize,
    trajectory: {
      source: event.trajectorySource,
      startWorldX: event.startX * tileSize,
      startWorldY: event.startY * tileSize,
      endWorldX: event.endX * tileSize,
      endWorldY: event.endY * tileSize,
      distanceTiles: event.trajectoryDistanceTiles,
      cameraBoundsAtStart: scaleBounds(event.cameraBoundsAtFlyoverStart, tileSize),
      expandedCameraBoundsAtStart: scaleBounds(event.expandedCameraBoundsAtFlyoverStart, tileSize)
    },
    breath: projectBreath(event.breath, tileSize),
    lightningSync: event.lightningSync === true,
    infernoDeployed: event.infernoDeployed === true,
    classification: 'dedicated_aerial_mama_wyvern_shadow_projection'
  };
}

function projectFireWall(wall, tileSize) {
  return {
    id: wall.id,
    sourceEventId: wall.sourceEventId,
    classification: 'world_spatial_fire_barrier_projection',
    worldAx: wall.ax * tileSize,
    worldAy: wall.ay * tileSize,
    worldBx: wall.bx * tileSize,
    worldBy: wall.by * tileSize,
    worldWidth: wall.width * tileSize * 1.34,
    headingRadians: wall.headingRadians,
    forwardX: wall.forwardX,
    forwardY: wall.forwardY,
    rightX: wall.rightX,
    rightY: wall.rightY,
    deliveryWorldX: wall.deliveryX * tileSize,
    deliveryWorldY: wall.deliveryY * tileSize,
    age: wall.age,
    lifetime: wall.lifetime,
    life01: clamp01(1 - wall.age / wall.lifetime),
    damageScale: wall.damageScale,
    slowMultiplier: wall.slowMultiplier,
    lightScale: wall.lightScale,
    smokeScale: wall.smokeScale,
    seed: wall.seed,
    lastHitCount: wall.lastHitCount,
    totalHitCount: wall.totalHitCount
  };
}

function projectBreath(breath, tileSize) {
  if (!breath) return null;
  return {
    mode: MAMA_WYVERN_WORLD_EVENT.breath.mode,
    active: breath.active === true,
    phase: breath.phase,
    opacity: breath.opacity,
    originWorldX: breath.originX * tileSize,
    originWorldY: breath.originY * tileSize,
    targetWorldX: breath.targetX * tileSize,
    targetWorldY: breath.targetY * tileSize
  };
}

function scaleBounds(bounds, scale) {
  if (!bounds) return null;
  return Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, value * scale]));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
