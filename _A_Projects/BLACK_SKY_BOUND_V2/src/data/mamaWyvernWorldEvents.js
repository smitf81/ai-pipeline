export const MamaWyvernEventKind = Object.freeze({
  FLYOVER: 'mama_wyvern_flyover',
  INFERNO: 'mama_wyvern_inferno'
});

export const MamaWyvernEventPhase = Object.freeze({
  WARNING: 'warning_roar',
  FLYOVER: 'shadow_flyover',
  AFTERMATH: 'aftermath'
});

export const MAMA_WYVERN_HEADING_POLICY = Object.freeze({
  mode: 'deterministic_full_circle_avoid_near_repeat_v1',
  minimumRepeatSeparationRadians: 0.72
});

export const MAMA_WYVERN_WORLD_EVENT = Object.freeze({
  id: 'mama_wyvern_rampage_v0',
  contract: 'black-sky-bound.world-spatial-event.mama-wyvern.v0',
  policy: 'world_owned_spatial_event_not_actor_or_renderer_truth',
  schedule: Object.freeze({
    firstEventAtSeconds: 36,
    intervalSeconds: Object.freeze({ min: 52, max: 78 }),
    kindPolicy: 'inferno_first_then_alternating_flyover_and_inferno'
  }),
  timing: Object.freeze({
    warningSeconds: 1.65,
    flyoverSeconds: 1.22,
    aftermathSeconds: 0.45,
    infernoDeployProgress: 0.67
  }),
  shadow: Object.freeze({
    cameraPeripheryOffsetTiles: 1.35,
    crossingInsetTiles: 0.7,
    entryExitMarginTiles: 3.2,
    fallbackViewportWidthTiles: 16,
    fallbackViewportHeightTiles: 10,
    crossingPolicy: 'active_camera_frustum_heading_crossing_v1',
    scale: 0.46,
    altitudeMeters: 9.2,
    opacity: 0.82,
    penumbraOpacity: 0.12
  }),
  breath: Object.freeze({
    mode: 'mama_head_rooted_directional_delivery_v1',
    startProgress: 0.16,
    endProgress: 0.84,
    headForwardTiles: 2,
    groundForwardTiles: 4.35,
    rightOffsetTiles: 0.16
  }),
  fire: Object.freeze({
    lifetimeSeconds: 18,
    lengthTiles: 15.5,
    depositForwardTiles: 2.45,
    widthTiles: 1.15,
    damageTickSeconds: 0.45,
    damagePerTick: 7,
    minimumDamageScale: 0.16,
    slowSeconds: 1.15,
    slowMultiplierStart: 0.48,
    slowMultiplierEnd: 0.82,
    avoidanceRadiusTiles: 3.1,
    avoidanceDistanceTiles: 3.4,
    lightNodeCount: 8,
    smokeNodeCount: 7
  }),
  audio: Object.freeze({
    emitter: Object.freeze({
      emitterId: 'voice',
      profileId: 'mama_voice_spatial_v1',
      anchor: 'transform',
      anchorHeightMeters: 9.2,
      shape: 'point',
      enabled: true
    }),
    warningEventType: 'world.mama_wyvern.roar',
    warningCueId: 'world.mama_wyvern.distant_roar',
    flyoverEventType: 'world.mama_wyvern.flyover',
    flyoverCueId: 'world.mama_wyvern.flyover_roar',
    napalmEventType: 'world.mama_wyvern.napalm',
    napalmCueId: 'world.mama_wyvern.napalm_projection',
    aftermathEventType: 'world.mama_wyvern.aftermath',
    aftermathCueId: 'world.mama_wyvern.inferno_aftermath'
  })
});

export function createMamaWyvernWorldEventState() {
  return {
    classification: 'world_spatial_event_state',
    contract: MAMA_WYVERN_WORLD_EVENT.contract,
    policy: MAMA_WYVERN_WORLD_EVENT.policy,
    enabled: true,
    autoEnabled: true,
    elapsed: 0,
    eventIndex: 0,
    lastHeadingRadians: null,
    nextEventAt: MAMA_WYVERN_WORLD_EVENT.schedule.firstEventAtSeconds,
    activeEvent: null,
    fireWalls: [],
    manualQueue: [],
    completedCount: 0,
    audio: {
      sequence: 0,
      eventType: null,
      cueId: null,
      sourceEventId: null,
      sourceRef: null,
      events: []
    },
    diagnostics: {
      manualTriggerCount: 0,
      scheduledTriggerCount: 0,
      fireWallCount: 0,
      damageTicks: 0,
      damagedEntityCount: 0,
      avoidancePressureCount: 0,
      lightningSyncCount: 0,
      treeIgnitionCount: 0,
      activeBurningTreeCount: 0
    }
  };
}

export function queueMamaWyvernWorldEvent(worldEvents, kind = MamaWyvernEventKind.FLYOVER, options = {}) {
  if (!worldEvents?.manualQueue) throw new Error('mama_world_event_state_required');
  if (!Object.values(MamaWyvernEventKind).includes(kind)) throw new Error(`unknown_mama_world_event_kind:${kind}`);
  const request = {
    id: `manual_mama_event:${worldEvents.manualQueue.length}:${worldEvents.eventIndex}`,
    kind,
    lightningSync: options.lightningSync === true,
    angle: finiteOrNull(options.angle),
    centerX: finiteOrNull(options.centerX),
    centerY: finiteOrNull(options.centerY),
    source: options.source ?? 'manual_debug_control'
  };
  worldEvents.manualQueue.push(request);
  worldEvents.diagnostics.manualTriggerCount += 1;
  return request;
}

export function setMamaWyvernAutoEventsEnabled(worldEvents, enabled) {
  if (!worldEvents) return false;
  worldEvents.autoEnabled = enabled !== false;
  return worldEvents.autoEnabled;
}

export function buildMamaWorldEventLightViews(worldEvents, renderTime = 0) {
  const walls = worldEvents?.fireWalls ?? [];
  const count = MAMA_WYVERN_WORLD_EVENT.fire.lightNodeCount;
  return walls.flatMap((wall) => {
    if (wall.age >= wall.lifetime || wall.lightScale <= 0.01) return [];
    const nodes = wall.lightNodes ?? fallbackWallNodes(wall, count, 0.18);
    return nodes.map((node, index) => {
      const pulse = 0.94 + Math.sin(renderTime * 8.4 + wall.seed * 0.17 + index * 1.7) * 0.06;
      const strength = clamp01(wall.lightScale * pulse);
      return {
        id: `${wall.id}:light:${index}`,
        x: node.x,
        y: node.y,
        radius: 3.15,
        intensity: strength * 0.88,
        revealRadius: 4.9,
        revealStrength: strength * 0.96,
        glowRadius: 2.55,
        glowStrength: strength * 0.86,
        coreRadius: 0.46,
        coreStrength: strength,
        softness: 0.84,
        colour: 'rgba(255, 92, 24, 1)',
        innerColour: 'rgba(255, 226, 112, 1)',
        flickerAmount: 0.18,
        flickerSpeed: 7.6,
        flickerPhase: node.phase,
        renderTime,
        enabled: true,
        sourceEntity: wall.id,
        sourceKind: 'mama_wyvern_inferno_wall',
        ambientParticleKind: 'mama_inferno_ember',
        shadowPriority: 200,
        sceneLight: false,
        sourcePolicy: 'world_event_residual_fire_light_nodes',
        sourceAnchor: { type: 'world_event', id: wall.id },
        shadow: { sourceHeight: 'liquid_napalm_fire_wall', lengthScale: 1.08, opacityScale: 0.88, heightScale: 0.54 }
      };
    });
  });
}

export function buildMamaWorldEventSmokeSourceViews(worldEvents) {
  const count = MAMA_WYVERN_WORLD_EVENT.fire.smokeNodeCount;
  return (worldEvents?.fireWalls ?? []).flatMap((wall) => {
    if (wall.age >= wall.lifetime || wall.smokeScale <= 0.01) return [];
    const nodes = wall.smokeNodes ?? fallbackWallNodes(wall, count, 0);
    return nodes.map((node, index) => {
      return {
        id: `${wall.id}:smoke:${index}`,
        sourceKind: 'mama_inferno_wall_smoke',
        sourceId: wall.id,
        x: node.x,
        y: node.y - 0.12,
        radius: (0.92 + (index % 3) * 0.16) * wall.smokeScale,
        density: 0.86 * wall.smokeScale,
        opacity: 0.8 * wall.smokeScale,
        age: wall.age,
        lifetime: wall.lifetime,
        driftScale: 0.48,
        renderPriority: 120,
        classification: 'derived_smoke_source_view',
        shape: 'rising_inferno_wall_plume',
        forwardX: 0,
        forwardY: -1
      };
    });
  });
}

function fallbackWallNodes(wall, count, sideAmplitude) {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const length = Math.hypot(dx, dy) || 1;
  return Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 0.5 : index / (count - 1);
    const side = index % 2 === 0 ? -sideAmplitude : sideAmplitude;
    return {
      x: lerp(wall.ax, wall.bx, t) - dy / length * side,
      y: lerp(wall.ay, wall.by, t) + dx / length * side,
      phase: wall.seed * 0.1 + index
    };
  });
}

export function mamaWorldEventIntervalSeconds(eventIndex) {
  const range = MAMA_WYVERN_WORLD_EVENT.schedule.intervalSeconds;
  return range.min + hash01(eventIndex, 31) * (range.max - range.min);
}

export function mamaWorldEventAngle(eventIndex, previousHeadingRadians = null) {
  const tau = Math.PI * 2;
  let heading = hash01(eventIndex, 47) * tau;
  if (Number.isFinite(previousHeadingRadians)) {
    const previous = normalizeHeading(previousHeadingRadians);
    const distance = angularDistance(heading, previous);
    if (distance < MAMA_WYVERN_HEADING_POLICY.minimumRepeatSeparationRadians) {
      const direction = hash01(eventIndex, 83) < 0.5 ? -1 : 1;
      heading = previous + direction * (
        MAMA_WYVERN_HEADING_POLICY.minimumRepeatSeparationRadians + hash01(eventIndex, 97) * 0.46
      );
    }
  }
  return normalizeHeading(heading);
}

export function mamaWorldEventKind(eventIndex) {
  return eventIndex % 2 === 0 ? MamaWyvernEventKind.INFERNO : MamaWyvernEventKind.FLYOVER;
}

function hash01(...values) {
  const seed = values.reduce((sum, value, index) => sum + (Number(value) || 0) * (12.9898 + index * 7.233), 78.233);
  const value = Math.sin(seed) * 43758.5453;
  return value - Math.floor(value);
}

function angularDistance(a, b) {
  const tau = Math.PI * 2;
  const delta = Math.abs(normalizeHeading(a) - normalizeHeading(b));
  return Math.min(delta, tau - delta);
}

function normalizeHeading(value) {
  const tau = Math.PI * 2;
  return ((value % tau) + tau) % tau;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
