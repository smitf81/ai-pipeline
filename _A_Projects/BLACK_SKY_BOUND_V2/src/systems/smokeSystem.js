import { ComponentType } from '../constants/componentTypes.js';
import { EventType } from '../constants/eventTypes.js';
import { getComponent } from '../ecs/world.js';
import { emitEvent } from '../ecs/events.js';
import { query } from '../ecs/query.js';
import { spawnSmokeCloud, spawnVisualRecipe } from '../game/spawn.js';
import { VisualRecipeId } from '../data/visualRecipes.js';
import { SmokeSourceKind } from '../data/smokeSources.js';
import { getWyvernActionProfile, WyvernActionId } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { resolveSmokeCloudShape } from '../game/smokeCloudShape.js';

export function smokeSystem({ game }) {
  for (const entity of query(game.world, [ComponentType.ActionState, ComponentType.SmokeEmitter, ComponentType.Transform])) {
    const actionState = getComponent(game.world, entity, ComponentType.ActionState);
    if (!actionState?.active) continue;
    const profile = getWyvernActionProfile(actionState.actionId);
    const emission = profile?.smokeEmission;
    if (!emission || actionState.phase < emission.activePhaseStart || actionState.phase > emission.activePhaseEnd) continue;
    const eventKey = `${profile.id}:${emission.emissionKey}`;
    if ((actionState.emittedEvents ?? []).includes(eventKey)) continue;

    const emitter = getComponent(game.world, entity, ComponentType.SmokeEmitter);
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const socket = resolveSmokeEmitterSocket(game, entity, transform, emission.emitterSocket);
    const spawned = emission.shape === 'radial_soft_disc_burst'
      ? spawnRadialSmoke(game, entity, socket, emission, emitter, profile.id)
      : spawnSmokePlume(game, entity, socket, emission, emitter, actionState);
    actionState.emittedEvents = [...(actionState.emittedEvents ?? []), eventKey];
    spawnVisualRecipe(game, VisualRecipeId.SMOKE_BURST, { x: socket.x, y: socket.y, radius: emission.startRadius * 1.8 });
    emitEvent(game.world, EventType.SMOKE_EMITTED, {
      source: entity,
      actionId: profile.id,
      x: socket.x,
      y: socket.y,
      radius: emission.endRadius,
      puffCount: spawned.length,
      sourceKind: emission.sourceKind
    });
  }
}

export function emitRadialSmokeBurst(game, source, options = {}) {
  const profile = getWyvernActionProfile(WyvernActionId.SMOKE_BURST);
  const emission = profile?.smokeEmission;
  const transform = getComponent(game?.world, source, ComponentType.Transform);
  const emitter = getComponent(game?.world, source, ComponentType.SmokeEmitter);
  if (!emission || !transform || !emitter) return [];
  const socket = resolveSmokeEmitterSocket(game, source, transform, 'body');
  const spawned = spawnRadialSmoke(game, source, socket, emission, emitter, options.actionId ?? 'smoke_instinct_exhale');
  spawnVisualRecipe(game, VisualRecipeId.SMOKE_BURST, { x: socket.x, y: socket.y, radius: emission.startRadius * 2.4 });
  emitEvent(game.world, EventType.SMOKE_EMITTED, {
    source,
    actionId: options.actionId ?? profile.id,
    x: socket.x,
    y: socket.y,
    radius: emission.endRadius,
    puffCount: spawned.length,
    sourceKind: emission.sourceKind,
    reason: options.reason ?? null
  });
  return spawned;
}

export function smokeAt(game, x, y) {
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.SmokeCloud, ComponentType.Lifetime])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const smoke = getComponent(game.world, entity, ComponentType.SmokeCloud);
    const lifetime = getComponent(game.world, entity, ComponentType.Lifetime);
    const shape = resolveSmokeCloudShape(transform, smoke, lifetime);
    if (Math.hypot(shape.x - x, shape.y - y) <= shape.radius) return smoke;
  }
  return null;
}

export function findDragonSmokeConcealment(game, x, y, options = {}) {
  const minimumDensity = Math.max(0, Number(options.minimumDensity) || 0);
  let strongest = null;
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.SmokeCloud, ComponentType.Lifetime])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const smoke = getComponent(game.world, entity, ComponentType.SmokeCloud);
    if (!isDragonSmokeSourceKind(smoke.sourceKind)) continue;
    const lifetime = getComponent(game.world, entity, ComponentType.Lifetime);
    const shape = resolveSmokeCloudShape(transform, smoke, lifetime);
    const distance = Math.hypot(shape.x - x, shape.y - y);
    if (distance > shape.radius || shape.density < minimumDensity) continue;
    const coverage01 = Math.max(0, Math.min(1, 1 - distance / Math.max(0.01, shape.radius)));
    const strength = shape.density * (0.38 + Math.sqrt(coverage01) * 0.62);
    if (strongest && strongest.strength >= strength) continue;
    strongest = {
      entity,
      sourceKind: smoke.sourceKind,
      x: shape.x,
      y: shape.y,
      radius: shape.radius,
      density: shape.density,
      coverage01,
      strength
    };
  }
  return strongest;
}

export function isDragonSmokeSourceKind(sourceKind) {
  return sourceKind === SmokeSourceKind.DRAGON_SMOKE_CLOUD
    || sourceKind === SmokeSourceKind.DRAGON_SMOKE_PLUME;
}

function resolveSmokeEmitterSocket(game, entity, transform, socketName = 'mouth') {
  const rotation = transform.rotation ?? 0;
  if (socketName === 'body') {
    return {
      x: transform.x,
      y: transform.y,
      forward: { x: Math.cos(rotation), y: Math.sin(rotation) },
      right: { x: -Math.sin(rotation), y: Math.cos(rotation) },
      role: 'body_smoke_origin',
      classification: 'transform_owned_action_socket'
    };
  }
  const pose = getComponent(game.world, entity, ComponentType.ProceduralPose);
  const projection = getComponent(game.world, entity, ComponentType.WyvernProjection);
  const socket = pose?.sockets?.[socketName] ?? projection?.sockets?.[socketName];
  if (socket?.forward && socket?.right) return socket;
  return {
    x: transform.x + Math.cos(rotation) * 0.5,
    y: transform.y + Math.sin(rotation) * 0.5,
    forward: { x: Math.cos(rotation), y: Math.sin(rotation) },
    right: { x: -Math.sin(rotation), y: Math.cos(rotation) },
    role: `${socketName}_socket`,
    classification: 'fallback_action_socket'
  };
}

function spawnRadialSmoke(game, source, socket, emission, emitter, actionId) {
  const count = Math.max(5, emission.puffCount ?? 8);
  const burstId = `${source}:${actionId}:${Math.round((game.renderTime ?? 0) * 1000)}`;
  const spawned = [];
  for (let i = 0; i < count; i += 1) {
    const centerPuff = i === 0;
    const t = centerPuff ? 0 : (i - 1) / Math.max(1, count - 1);
    const angle = t * Math.PI * 2 + deterministicJitter(i) * 0.18;
    const outward = centerPuff ? 0 : (emission.ringRadius ?? 0.72) * (0.78 + Math.abs(deterministicJitter(i)) * 0.3);
    const radius = centerPuff
      ? (emission.endRadius ?? emitter.radius ?? 1) * 0.86
      : lerp(emission.startRadius ?? 0.3, emission.endRadius ?? emitter.radius ?? 1, 0.42 + Math.abs(deterministicJitter(i)) * 0.32);
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    spawned.push(spawnSmokeCloud(game.world,
      socket.x + direction.x * outward,
      socket.y + direction.y * outward,
      {
        radius,
        duration: (emission.lifetime ?? emitter.duration ?? 3) * (centerPuff ? 1.05 : 0.88 + Math.abs(deterministicJitter(i)) * 0.2),
        slowMultiplier: emission.slowMultiplier ?? emitter.slowMultiplier ?? 0.35,
        sourceKind: emission.sourceKind ?? SmokeSourceKind.DRAGON_SMOKE_CLOUD,
        shape: emission.shape ?? 'radial_soft_disc_burst',
        driftX: direction.x * (emission.radialSpeed ?? 0.8) * (centerPuff ? 0 : 0.74 + Math.abs(deterministicJitter(i)) * 0.3),
        driftY: direction.y * (emission.radialSpeed ?? 0.8) * (centerPuff ? 0 : 0.74 + Math.abs(deterministicJitter(i)) * 0.3),
        expandRate: (emission.expandRate ?? 0.3) * (centerPuff ? 0.72 : 1),
        density: (emission.density ?? 1) * (centerPuff ? 1.08 : 0.9),
        opacity: (emission.opacity ?? 1) * (centerPuff ? 1 : 0.9),
        fadeExponent: emission.fadeExponent ?? 1,
        softness: 0.95,
        plumeId: burstId,
        segmentIndex: i,
        plumeT: t,
        forwardX: direction.x,
        forwardY: direction.y
      },
      game.renderLayers?.diagnostics
    ));
  }
  return spawned;
}

function spawnSmokePlume(game, source, socket, emission, emitter, actionState) {
  const count = Math.max(1, emission.puffCount ?? 1);
  const plumeId = `${source}:${actionState.actionId}:${Math.round((actionState.elapsed ?? 0) * 1000)}`;
  const forward = normaliseVector(socket.forward?.x ?? 1, socket.forward?.y ?? 0);
  const right = normaliseVector(socket.right?.x ?? 0, socket.right?.y ?? 1);
  const spawned = [];
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0 : i / (count - 1);
    const jitter = deterministicJitter(i) * (emission.jitterAmplitude ?? 0);
    const lateral = jitter + alternating(i) * (emission.plumeSpread ?? 0) * t * 0.34;
    const distance = (emission.forwardOffset ?? 0) + i * (emission.segmentSpacing ?? 0.3);
    const radius = lerp(emission.startRadius ?? 0.2, emission.endRadius ?? emitter.radius ?? 0.8, t);
    spawned.push(spawnSmokeCloud(game.world,
      socket.x + forward.x * distance + right.x * lateral,
      socket.y + forward.y * distance + right.y * lateral,
      {
        radius,
        duration: (emission.lifetime ?? emitter.duration ?? 2) * (0.86 + t * 0.22),
        slowMultiplier: emission.slowMultiplier ?? emitter.slowMultiplier ?? 0.35,
        sourceKind: emission.sourceKind ?? SmokeSourceKind.DRAGON_SMOKE_PLUME,
        shape: emission.shape ?? 'forward_soft_disc_chain',
        driftX: forward.x * (emission.plumeSpeed ?? 1) * (0.58 + t * 0.42),
        driftY: forward.y * (emission.plumeSpeed ?? 1) * (0.58 + t * 0.42),
        expandRate: (emission.expandRate ?? 0.18) * (0.75 + t * 0.55),
        density: (emission.density ?? 1) * (1 - t * 0.18),
        opacity: (emission.opacity ?? 1) * (1 - t * 0.14),
        fadeExponent: emission.fadeExponent ?? 1,
        softness: 0.92,
        plumeId,
        segmentIndex: i,
        plumeT: t,
        forwardX: forward.x,
        forwardY: forward.y
      },
      game.renderLayers?.diagnostics
    ));
  }
  return spawned;
}

function deterministicJitter(index) {
  return Math.sin((index + 1) * 12.9898) * 0.5 + Math.sin((index + 1) * 4.1414) * 0.25;
}

function alternating(index) {
  return index % 2 === 0 ? -1 : 1;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normaliseVector(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
