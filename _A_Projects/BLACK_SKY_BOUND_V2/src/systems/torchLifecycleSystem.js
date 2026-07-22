import { LightEmitterId } from '../constants/lightEmitterIds.js';
import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { resolveCarriedTorchAnchor } from '../game/torchLightState.js';

export function torchLifecycleSystem({ game, dt = 0 }) {
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.LightEmitter])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const light = getComponent(game.world, entity, ComponentType.LightEmitter);
    if (!transform || !light || light.id !== LightEmitterId.TORCH) continue;

    const health = getComponent(game.world, entity, ComponentType.Health);
    const humanoidProjection = getComponent(game.world, entity, ComponentType.HumanoidProjection);
    if (health?.alive !== false) {
      resetCarriedTorchState(transform, humanoidProjection, light);
      continue;
    }

    updateDroppedTorchState(entity, transform, humanoidProjection, light, Math.max(0, dt));
  }
}

function resetCarriedTorchState(transform, humanoidProjection, light) {
  const anchor = resolveCarriedTorchAnchor(transform, humanoidProjection, light);
  light.enabled = light.lifecycleState === 'carried'
    ? light.enabled !== false
    : true;
  light.emissionScale = 1;
  light.radiusScale = 1;
  light.lifecycleState = 'carried';
  light.defeatedElapsed = null;
  if (!humanoidProjection) return;
  humanoidProjection.torchState = {
    mode: 'carried',
    x: anchor.x,
    y: anchor.y,
    forwardX: anchor.forwardX,
    forwardY: anchor.forwardY,
    sourceSocket: anchor.sourceSocket,
    drop01: 0,
    fade01: 1,
    emissionScale: 1,
    radiusScale: 1,
    defeatedElapsed: null,
    groundContact: false
  };
}

function updateDroppedTorchState(entity, transform, humanoidProjection, light, dt) {
  const defeat = light.defeat ?? {};
  if (!humanoidProjection?.torchState || humanoidProjection.torchState.mode === 'carried') {
    initialiseDroppedTorchState(entity, transform, humanoidProjection, light, defeat);
  }

  light.defeatedElapsed = (light.defeatedElapsed ?? 0) + dt;
  const dropDuration = Math.max(0.08, Number(defeat.dropDuration ?? 0.42));
  const fadeDelay = Math.max(0, Number(defeat.fadeDelay ?? 0.16));
  const fadeDuration = Math.max(0.1, Number(defeat.fadeDuration ?? 4.8));
  const drop01 = clamp01(light.defeatedElapsed / dropDuration);
  const fadeElapsed = Math.max(0, light.defeatedElapsed - fadeDelay);
  const fadeOut = easeInCubic(clamp01(fadeElapsed / fadeDuration));
  const dropEmissionScale = clamp01(defeat.dropEmissionScale ?? 0.64);
  const dropRadiusScale = clamp01(defeat.dropRadiusScale ?? 0.8);
  const emissionFloor = clamp01(defeat.emissionFloor ?? 0.03);
  const radiusFloor = clamp01(defeat.radiusFloor ?? 0.18);
  const grounded = humanoidProjection?.torchState ?? null;
  const previousX = Number.isFinite(grounded?.x) ? grounded.x : grounded?.startX;
  const previousY = Number.isFinite(grounded?.y) ? grounded.y : grounded?.startY;
  const easedDrop = easeOutCubic(drop01);
  const x = lerp(grounded?.startX ?? transform.x, grounded?.groundX ?? transform.x, easedDrop);
  const y = lerp(grounded?.startY ?? transform.y, grounded?.groundY ?? transform.y, easedDrop);

  light.emissionScale = lerp(dropEmissionScale, emissionFloor, fadeOut);
  light.radiusScale = lerp(dropRadiusScale, radiusFloor, fadeOut);
  light.lifecycleState = fadeOut >= 1
    ? 'extinguished'
    : (drop01 < 1 ? 'falling' : 'grounded_fading');
  light.enabled = fadeOut < 1 && light.emissionScale > 0.035 && light.radiusScale > 0.08;

  if (!humanoidProjection) return;
  humanoidProjection.torchState = {
    ...grounded,
    mode: light.enabled ? (drop01 < 1 ? 'falling' : 'grounded') : 'extinguished',
    x,
    y,
    previousX,
    previousY,
    drop01,
    fade01: 1 - fadeOut,
    emissionScale: light.emissionScale,
    radiusScale: light.radiusScale,
    defeatedElapsed: light.defeatedElapsed,
    groundContact: drop01 >= 1,
    sourceSocket: 'defeated_torch_ground_socket'
  };
}

function initialiseDroppedTorchState(entity, transform, humanoidProjection, light, defeat) {
  if (!humanoidProjection) return;
  const carried = resolveCarriedTorchAnchor(transform, humanoidProjection, light);
  const sideSign = deterministicSide(entity);
  const groundForward = Number(defeat.groundOffsetForward ?? 0.46);
  const groundRight = Number(defeat.groundOffsetRight ?? 0.18) * sideSign;
  humanoidProjection.torchState = {
    mode: 'falling',
    startX: carried.x,
    startY: carried.y,
    groundX: carried.x + carried.forwardX * groundForward + carried.rightX * groundRight,
    groundY: carried.y + carried.forwardY * groundForward + carried.rightY * groundRight,
    x: carried.x,
    y: carried.y,
    forwardX: carried.forwardX,
    forwardY: carried.forwardY,
    sourceSocket: carried.sourceSocket ?? 'torch_flame_socket',
    drop01: 0,
    fade01: 1,
    emissionScale: clamp01(defeat.dropEmissionScale ?? 0.64),
    radiusScale: clamp01(defeat.dropRadiusScale ?? 0.8),
    defeatedElapsed: 0,
    groundContact: false
  };
}

function deterministicSide(entity) {
  const text = String(entity ?? 'torch');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash & 1) === 0 ? -1 : 1;
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

function easeInCubic(value) {
  const t = clamp01(value);
  return t ** 3;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
