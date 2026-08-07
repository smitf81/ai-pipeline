import { ComponentType } from '../constants/componentTypes.js';
import { DamageType } from '../constants/damageTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import {
  MAMA_WYVERN_WORLD_EVENT,
  MamaWyvernEventKind,
  MamaWyvernEventPhase,
  mamaWorldEventAngle,
  mamaWorldEventIntervalSeconds,
  mamaWorldEventKind
} from '../data/mamaWyvernWorldEvents.js';
import {
  bindMamaFlyoverTrajectory,
  normalizeHeadingRadians,
  resolveMamaInfernoSegment,
  updateMamaFlyoverPose
} from '../data/mamaWyvernTrajectory.js';
import { queueManualLightningFlash } from '../data/sceneLights.js';
import { updateTreeFireStates } from '../data/treeFireStates.js';
import { applyDamageToEntity } from './healthSystem.js';

export function worldEventSystem({ state = null, game, map, dt }) {
  const worldEvents = game?.worldEvents;
  if (!worldEvents?.enabled || !game?.world || !map) return;
  const delta = Math.max(0, Number(dt) || 0);
  worldEvents.elapsed += delta;
  updateFireWalls(game, map, delta);
  updateActiveMamaEvent(state, game, map, delta);
  const treeFire = updateTreeFireStates(game.sceneObjects, worldEvents.fireWalls, delta);
  worldEvents.diagnostics.treeIgnitionCount += treeFire.ignitedCount;
  worldEvents.diagnostics.activeBurningTreeCount = treeFire.burningCount;
  if (!worldEvents.activeEvent) startPendingMamaEvent(state, game, map);
  game.spatialHazards = buildSpatialHazardViews(worldEvents.fireWalls);
}

function startPendingMamaEvent(appState, game, map) {
  const state = game.worldEvents;
  const request = state.manualQueue.shift() ?? scheduledRequest(state);
  if (!request) return;
  const player = getComponent(game.world, game.dragonId, ComponentType.Transform);
  const centerX = finite(request.centerX, player?.x ?? map.spawn.x + 0.5);
  const centerY = finite(request.centerY, player?.y ?? map.spawn.y + 0.5);
  const headingRadians = normalizeHeadingRadians(finite(
    request.angle,
    mamaWorldEventAngle(state.eventIndex, state.lastHeadingRadians)
  ));
  const forwardX = Math.cos(headingRadians);
  const forwardY = Math.sin(headingRadians);
  const rightX = -forwardY;
  const rightY = forwardX;
  const event = {
    id: `mama_wyvern_event:${state.eventIndex}:${request.kind}`,
    kind: request.kind,
    source: request.source,
    phase: MamaWyvernEventPhase.WARNING,
    phaseElapsed: 0,
    progress: 0,
    headingRadians,
    forwardX,
    forwardY,
    rightX,
    rightY,
    requestedCenterX: request.centerX,
    requestedCenterY: request.centerY,
    centerX,
    centerY,
    crossingAnchorPolicy: request.centerX == null && request.centerY == null
      ? MAMA_WYVERN_WORLD_EVENT.shadow.crossingPolicy
      : 'authored_debug_center',
    startX: centerX,
    startY: centerY,
    endX: centerX,
    endY: centerY,
    worldX: centerX,
    worldY: centerY,
    shadowScale: MAMA_WYVERN_WORLD_EVENT.shadow.scale,
    shadowOpacity: MAMA_WYVERN_WORLD_EVENT.shadow.opacity,
    lightningSync: request.lightningSync === true,
    lightningQueued: false,
    infernoDeployed: false,
    napalmAudioPlayed: false,
    startedAt: state.elapsed
    ,audioEmitter: { ...MAMA_WYVERN_WORLD_EVENT.audio.emitter }
  };
  bindFlyoverPathToActiveCamera(appState, game, map, event);
  updateMamaFlyoverPose(event, 0, MAMA_WYVERN_WORLD_EVENT);
  state.activeEvent = event;
  state.lastHeadingRadians = headingRadians;
  publishMamaAudio(
    state,
    MAMA_WYVERN_WORLD_EVENT.audio.warningEventType,
    MAMA_WYVERN_WORLD_EVENT.audio.warningCueId,
    event.id
  );
  if (request.source === 'scheduled_world_event') state.diagnostics.scheduledTriggerCount += 1;
  state.eventIndex += 1;
  state.nextEventAt = state.elapsed + mamaWorldEventIntervalSeconds(state.eventIndex);
}

function scheduledRequest(state) {
  if (!state.autoEnabled || state.elapsed < state.nextEventAt) return null;
  return {
    kind: mamaWorldEventKind(state.eventIndex),
    lightningSync: false,
    angle: null,
    centerX: null,
    centerY: null,
    source: 'scheduled_world_event'
  };
}

function updateActiveMamaEvent(appState, game, map, delta) {
  const worldEvents = game.worldEvents;
  const event = worldEvents.activeEvent;
  if (!event) return;
  event.phaseElapsed += delta;
  if (event.phase === MamaWyvernEventPhase.WARNING) {
    if (event.phaseElapsed < MAMA_WYVERN_WORLD_EVENT.timing.warningSeconds) return;
    event.phase = MamaWyvernEventPhase.FLYOVER;
    event.phaseElapsed -= MAMA_WYVERN_WORLD_EVENT.timing.warningSeconds;
    publishMamaAudio(
      worldEvents,
      MAMA_WYVERN_WORLD_EVENT.audio.flyoverEventType,
      MAMA_WYVERN_WORLD_EVENT.audio.flyoverCueId,
      event.id
    );
  }
  if (event.phase === MamaWyvernEventPhase.FLYOVER) {
    updateMamaFlyoverPose(
      event,
      clamp01(event.phaseElapsed / MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds),
      MAMA_WYVERN_WORLD_EVENT
    );
    if (event.progress >= 0.42) queueSynchronizedLightning(game, event);
    if (event.kind === MamaWyvernEventKind.INFERNO && !event.napalmAudioPlayed
      && event.progress >= MAMA_WYVERN_WORLD_EVENT.breath.startProgress) {
      publishMamaAudio(
        worldEvents,
        MAMA_WYVERN_WORLD_EVENT.audio.napalmEventType,
        MAMA_WYVERN_WORLD_EVENT.audio.napalmCueId,
        event.id
      );
      event.napalmAudioPlayed = true;
    }
    if (event.kind === MamaWyvernEventKind.INFERNO && !event.infernoDeployed
      && event.progress >= MAMA_WYVERN_WORLD_EVENT.timing.infernoDeployProgress) {
      worldEvents.fireWalls.push(createInfernoWall(event, map, worldEvents.fireWalls.length));
      worldEvents.diagnostics.fireWallCount += 1;
      event.infernoDeployed = true;
      publishMamaAudio(
        worldEvents,
        MAMA_WYVERN_WORLD_EVENT.audio.aftermathEventType,
        MAMA_WYVERN_WORLD_EVENT.audio.aftermathCueId,
        event.id
      );
    }
    if (event.phaseElapsed < MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds) return;
    event.phase = MamaWyvernEventPhase.AFTERMATH;
    event.phaseElapsed -= MAMA_WYVERN_WORLD_EVENT.timing.flyoverSeconds;
    event.progress = 1;
  }
  if (event.phase === MamaWyvernEventPhase.AFTERMATH
    && event.phaseElapsed >= MAMA_WYVERN_WORLD_EVENT.timing.aftermathSeconds) {
    worldEvents.completedCount += 1;
    worldEvents.activeEvent = null;
  }
}

function publishMamaAudio(worldEvents, eventType, cueId, sourceEventId) {
  const audio = worldEvents.audio ?? { sequence: 0, events: [] };
  const receipt = {
    sequence: audio.sequence + 1,
    eventType,
    cueId,
    sourceEventId,
    sourceRef: { ownerKind: 'worldEvent', ownerId: sourceEventId, emitterId: 'voice' }
  };
  worldEvents.audio = {
    ...receipt,
    events: [...(audio.events ?? []), receipt].slice(-12)
  };
  return receipt;
}

function bindFlyoverPathToActiveCamera(appState, game, map, event) {
  const player = getComponent(game.world, game.dragonId, ComponentType.Transform);
  bindMamaFlyoverTrajectory(event, {
    camera: appState?.camera ?? null,
    map,
    player,
    tuning: MAMA_WYVERN_WORLD_EVENT
  });
}

function queueSynchronizedLightning(game, event) {
  if (!event.lightningSync || event.lightningQueued) return;
  const queued = queueManualLightningFlash(game.sceneLights, game.renderTime ?? game.worldEvents.elapsed, event.id);
  if (!queued) return;
  event.lightningQueued = true;
  game.worldEvents.diagnostics.lightningSyncCount += 1;
}

function createInfernoWall(event, map, ordinal) {
  const fire = MAMA_WYVERN_WORLD_EVENT.fire;
  const segment = resolveMamaInfernoSegment(event, map, fire);
  const wall = {
    id: `${event.id}:inferno:${ordinal}`,
    classification: 'world_spatial_fire_barrier',
    sourceEventId: event.id,
    ...segment,
    width: fire.widthTiles,
    age: 0,
    lifetime: fire.lifetimeSeconds,
    damageScale: 1,
    slowMultiplier: fire.slowMultiplierStart,
    lightScale: 1,
    smokeScale: 1,
    tickAccumulator: fire.damageTickSeconds,
    lastHitCount: 0,
    totalHitCount: 0,
    seed: stateHash(event.id)
  };
  wall.lightNodes = createStableWallNodes(wall, fire.lightNodeCount, 0.18);
  wall.smokeNodes = createStableWallNodes(wall, fire.smokeNodeCount, 0);
  return wall;
}

function createStableWallNodes(wall, count, sideAmplitude) {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const length = Math.hypot(dx, dy) || 1;
  return Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 0.5 : index / (count - 1);
    const side = index % 2 === 0 ? -sideAmplitude : sideAmplitude;
    return Object.freeze({
      index,
      t,
      x: lerp(wall.ax, wall.bx, t) - dy / length * side,
      y: lerp(wall.ay, wall.by, t) + dx / length * side,
      phase: wall.seed * 0.1 + index
    });
  });
}

function updateFireWalls(game, map, delta) {
  const state = game.worldEvents;
  const fire = MAMA_WYVERN_WORLD_EVENT.fire;
  for (const wall of state.fireWalls) {
    wall.age += delta;
    const life = clamp01(1 - wall.age / wall.lifetime);
    wall.damageScale = Math.max(fire.minimumDamageScale, Math.pow(life, 1.45));
    wall.slowMultiplier = lerp(fire.slowMultiplierEnd, fire.slowMultiplierStart, Math.pow(life, 0.72));
    wall.lightScale = Math.pow(life, 0.72);
    wall.smokeScale = Math.min(1, life * 1.36);
    wall.tickAccumulator += delta;
    while (wall.tickAccumulator >= fire.damageTickSeconds && wall.age < wall.lifetime) {
      wall.tickAccumulator -= fire.damageTickSeconds;
      applyInfernoDamage(game, wall);
    }
    applyInfernoAvoidancePressure(game, map, wall);
  }
  state.fireWalls = state.fireWalls.filter((wall) => wall.age < wall.lifetime);
}

function applyInfernoDamage(game, wall) {
  const fire = MAMA_WYVERN_WORLD_EVENT.fire;
  let hitCount = 0;
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.Health])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const health = getComponent(game.world, entity, ComponentType.Health);
    const radius = getComponent(game.world, entity, ComponentType.Collider)?.radius ?? 0;
    if (!health?.alive || distanceToSegment(transform.x, transform.y, wall) > wall.width * 0.5 + radius) continue;
    applyDamageToEntity(game.world, entity, fire.damagePerTick * wall.damageScale, wall.sourceEventId, DamageType.FIRE);
    applyInfernoSlow(game.world, entity, wall);
    hitCount += 1;
  }
  wall.lastHitCount = hitCount;
  wall.totalHitCount += hitCount;
  game.worldEvents.diagnostics.damageTicks += 1;
  game.worldEvents.diagnostics.damagedEntityCount += hitCount;
}

function applyInfernoSlow(world, entity, wall) {
  const status = getComponent(world, entity, ComponentType.StatusEffects);
  if (!status) return;
  status.movementSlowTimer = Math.max(status.movementSlowTimer ?? 0, MAMA_WYVERN_WORLD_EVENT.fire.slowSeconds);
  status.movementSlowMultiplier = Math.min(status.movementSlowMultiplier ?? 1, wall.slowMultiplier);
  status.movementSlowSource = wall.id;
}

function applyInfernoAvoidancePressure(game, map, wall) {
  const fire = MAMA_WYVERN_WORLD_EVENT.fire;
  const activeRadius = fire.avoidanceRadiusTiles * (0.62 + wall.lightScale * 0.38);
  for (const entity of query(game.world, [ComponentType.EnemyPressureAI, ComponentType.Transform, ComponentType.Health])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const health = getComponent(game.world, entity, ComponentType.Health);
    const ai = getComponent(game.world, entity, ComponentType.EnemyPressureAI);
    if (!health?.alive || distanceToSegment(transform.x, transform.y, wall) > activeRadius) continue;
    const nearest = closestPointOnSegment(transform.x, transform.y, wall);
    let awayX = transform.x - nearest.x;
    let awayY = transform.y - nearest.y;
    let length = Math.hypot(awayX, awayY);
    if (length < 0.01) {
      const side = stateHash(entity) % 2 === 0 ? 1 : -1;
      const dx = wall.bx - wall.ax;
      const dy = wall.by - wall.ay;
      length = Math.hypot(dx, dy) || 1;
      awayX = -dy / length * side;
      awayY = dx / length * side;
      length = 1;
    }
    ai.retreatTargetX = clamp(transform.x + awayX / length * fire.avoidanceDistanceTiles, 1.1, map.width - 1.1);
    ai.retreatTargetY = clamp(transform.y + awayY / length * fire.avoidanceDistanceTiles, 1.1, map.height - 1.1);
    ai.retreatTimer = Math.max(ai.retreatTimer ?? 0, 0.42);
    ai.repathPauseTimer = Math.max(ai.repathPauseTimer ?? 0, 0.2);
    ai.hazardAvoidanceCount = (ai.hazardAvoidanceCount ?? 0) + 1;
    ai.lastHazardAvoided = wall.id;
    game.worldEvents.diagnostics.avoidancePressureCount += 1;
  }
}

function buildSpatialHazardViews(walls) {
  return walls.map((wall) => ({
    id: wall.id,
    kind: 'mama_wyvern_inferno_wall',
    shape: 'line_barrier',
    ax: wall.ax,
    ay: wall.ay,
    bx: wall.bx,
    by: wall.by,
    width: wall.width,
    damageScale: wall.damageScale,
    slowMultiplier: wall.slowMultiplier,
    avoidancePressure: wall.lightScale,
    remainingSeconds: Math.max(0, wall.lifetime - wall.age)
  }));
}

export function distanceToMamaFireWall(x, y, wall) {
  return distanceToSegment(x, y, wall);
}

function distanceToSegment(x, y, wall) {
  const point = closestPointOnSegment(x, y, wall);
  return Math.hypot(x - point.x, y - point.y);
}

function closestPointOnSegment(x, y, wall) {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp(((x - wall.ax) * dx + (y - wall.ay) * dy) / lengthSquared, 0, 1);
  return { x: wall.ax + dx * t, y: wall.ay + dy * t };
}

function stateHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function finite(value, fallback) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(Number(value) || 0, 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
