import { ComponentType } from '../constants/componentTypes.js';
import { addDecalStamp } from '../projection/renderLayerState.js';
import { addNapalmDroplet, addNapalmPool, updateNapalmDropletAttachments, updateNapalmDroplets, updateNapalmPools } from '../projection/napalmLayerState.js';
import { getNapalmDribbleRecipe } from '../data/napalmDribble.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';

export function napalmDripSystem({ game, dt }) {
  const renderLayers = game.renderLayers;
  updateNapalmScorchDecals(renderLayers, dt);
  updateNapalmDroplets(renderLayers, dt, (droplet) => landDroplet(game, droplet));
  updateNapalmPools(renderLayers, dt);
  updateNapalmDropletAttachments(renderLayers, (droplet) => (
    getComponent(game.world, droplet.sourceEntity, ComponentType.WyvernProjection)?.sockets?.mouth
  ));

  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.WyvernProjection, ComponentType.NapalmDripEmitter])) {
    const projection = getComponent(game.world, entity, ComponentType.WyvernProjection);
    const emitter = getComponent(game.world, entity, ComponentType.NapalmDripEmitter);
    if (!emitter?.enabled) continue;
    const socket = projection?.sockets?.mouth;
    if (!socket) continue;
    const recipe = getNapalmDribbleRecipe(emitter.recipeId ?? emitter.id);
    const motionState = getComponent(game.world, entity, ComponentType.MotionState);
    tickEmitter(renderLayers, emitter, socket, projection, motionState, recipe, dt, entity);
  }
}

function tickEmitter(renderLayers, emitter, socket, projection, motionState, recipe, dt, entity) {
  const moving = (projection.movement01 ?? 0) >= recipe.minMovementForMovingCadence;
  emitter.cooldown = Math.max(0, (emitter.cooldown ?? 0) - dt);
  emitter.idleCooldown = Math.max(0, (emitter.idleCooldown ?? 0) - dt);

  const lastX = emitter.lastSocketX ?? socket.x;
  const lastY = emitter.lastSocketY ?? socket.y;
  const moved = Math.hypot(socket.x - lastX, socket.y - lastY);
  const cadenceReady = moving ? emitter.cooldown <= 0 : emitter.idleCooldown <= 0;
  const distanceReady = moved >= recipe.minDistanceBetweenDrips || !moving;

  if (cadenceReady && distanceReady) {
    const serial = emitter.emissionSerial ?? 0;
    spawnDroplet(renderLayers, socket, projection, motionState, recipe, entity, serial, false);
    if (serial % recipe.droplet.splitEvery === recipe.droplet.splitEvery - 1) {
      spawnDroplet(renderLayers, socket, projection, motionState, recipe, entity, serial, true);
    }
    emitter.emissionSerial = serial + 1;
    emitter.lastSocketX = socket.x;
    emitter.lastSocketY = socket.y;
    emitter.cooldown = jitteredCadence(recipe.movingDripInterval, recipe.movingCadenceJitter, serial, 17);
    emitter.idleCooldown = jitteredCadence(recipe.idleDripInterval, recipe.idleCadenceJitter, serial, 43);
  }
}

function spawnDroplet(renderLayers, socket, projection, motionState, recipe, entity, serial, secondary) {
  const phase = projection.gaitPhase ?? 0;
  const seed = seeded01(entity, serial, secondary ? 97 : 31);
  const side = (seed - 0.5) * 0.055 + Math.sin(phase * 1.7) * 0.018;
  const back = (seeded01(entity, serial, 61) - 0.5) * 0.035;
  const x = socket.x + socket.right.x * side + socket.forward.x * back;
  const y = socket.y + socket.right.y * side + socket.forward.y * back;
  const speed = Math.hypot(motionState?.velocityX ?? 0, motionState?.velocityY ?? 0);
  const carryX = (motionState?.velocityX ?? 0) * recipe.droplet.movementCarrySeconds;
  const carryY = (motionState?.velocityY ?? 0) * recipe.droplet.movementCarrySeconds;
  const forwardCarry = recipe.droplet.forwardCarry * (0.74 + seed * 0.52);
  const splitSide = secondary ? (seed > 0.5 ? 1 : -1) * 0.075 : 0;
  const radius = (recipe.droplet.radius + (seed - 0.5) * recipe.droplet.radiusJitter * 2)
    * (secondary ? recipe.droplet.splitRadiusScale : 1);
  const attachmentDuration = recipe.droplet.attachmentDuration + (secondary ? recipe.droplet.splitDelay : 0);
  addNapalmDroplet(renderLayers, {
    kind: secondary ? 'napalm_secondary_droplet' : 'napalm_droplet',
    sourceEntity: entity,
    serial,
    seed,
    secondary,
    x,
    y,
    socketX: x,
    socketY: y,
    groundX: x + socket.forward.x * forwardCarry + socket.right.x * splitSide + carryX,
    groundY: y + socket.forward.y * forwardCarry + socket.right.y * splitSide + carryY,
    duration: recipe.droplet.fallDuration + (secondary ? recipe.droplet.splitDelay * 1.35 : 0) + Math.min(0.04, speed * 0.002),
    attachmentDuration,
    mouthHeightMeters: recipe.droplet.mouthHeightMeters,
    hangingLengthMeters: recipe.droplet.hangingLengthMeters * (secondary ? 0.58 : 1),
    radius: Math.max(0.014, radius),
    glowRadius: recipe.droplet.glowRadius,
    colour: recipe.droplet.colour,
    coreColour: recipe.droplet.coreColour,
    rimColour: recipe.droplet.rimColour,
    shadowColour: recipe.droplet.shadowColour,
    smokeColour: recipe.droplet.smokeColour,
    pool: recipe.pool,
    light: recipe.light,
    flickerPhase: phase * 0.9 + x * 2.1 + y * 1.7 + seed * 4.7
  });
}

function landDroplet(game, droplet) {
  const merge = findMergePool(game.renderLayers.napalm.pools, droplet);
  if (merge) {
    merge.lobeCount = Math.min(3, (merge.lobeCount ?? 1) + 1);
    merge.age = Math.min(merge.age, 0.18);
    merge.hotDuration = Math.max(merge.hotDuration, droplet.pool.hotDuration);
    merge.flickerPhase = (merge.flickerPhase + droplet.flickerPhase) * 0.5;
    return;
  }
  const poolRadius = droplet.pool.radius + Math.sin(droplet.flickerPhase ?? 0) * droplet.pool.radiusJitter;
  const pool = addNapalmPool(game.renderLayers, {
    x: droplet.groundX,
    y: droplet.groundY,
    radius: Math.max(0.045, poolRadius * (droplet.secondary ? 0.42 : 1)),
    lifetime: droplet.pool.lifetime,
    spreadDuration: droplet.pool.spreadDuration,
    impactDuration: droplet.pool.impactDuration,
    flameDuration: droplet.pool.flameDuration,
    hotDuration: droplet.pool.hotDuration,
    visualMaterial: droplet.pool.visualMaterial,
    poolShape: droplet.pool.poolShape,
    colour: droplet.pool.colour,
    hotColour: droplet.pool.hotColour,
    rimColour: droplet.pool.rimColour,
    coolingColour: droplet.pool.coolingColour,
    opacity: droplet.pool.opacity,
    rimScale: droplet.pool.rimScale,
    bodyScale: droplet.pool.bodyScale,
    hotSpotScale: droplet.pool.hotSpotScale,
    hotSpotCount: droplet.pool.hotSpotCount,
    lobeCount: droplet.secondary ? 1 : droplet.pool.lobeCount,
    incomingX: droplet.groundX - (droplet.separationX ?? droplet.x),
    incomingY: droplet.groundY - (droplet.separationY ?? droplet.y),
    light: droplet.secondary ? null : droplet.light,
    flickerPhase: droplet.flickerPhase
  });

  if (pool) {
    const scorch = addDecalStamp(game.renderLayers, {
      kind: 'napalm_scorch',
      x: pool.x,
      y: pool.y,
      radius: pool.radius * 1.12,
      colour: droplet.pool.scorchColour,
      opacity: droplet.pool.scorchOpacity
    });
    if (scorch) Object.assign(scorch, { age: 0, lifetime: pool.lifetime, baseOpacity: scorch.opacity });
  }
}

function updateNapalmScorchDecals(renderLayers, dt) {
  const decals = renderLayers?.decals;
  if (!decals) return;
  let changed = false;
  for (let index = decals.stamps.length - 1; index >= 0; index -= 1) {
    const stamp = decals.stamps[index];
    if (stamp.kind !== 'napalm_scorch' || !Number.isFinite(stamp.lifetime)) continue;
    stamp.age = Math.max(0, (stamp.age ?? 0) + dt);
    if (stamp.age >= stamp.lifetime) {
      decals.stamps.splice(index, 1);
      changed = true;
      continue;
    }
    const remaining = stamp.lifetime - stamp.age;
    if (remaining >= 1.2) continue;
    const opacity = (stamp.baseOpacity ?? stamp.opacity ?? 0) * Math.max(0, Math.min(1, remaining / 1.2));
    if (Math.abs(opacity - stamp.opacity) < 0.001) continue;
    stamp.opacity = opacity;
    changed = true;
  }
  if (!changed) return;
  decals.revision += 1;
  decals.dirty = true;
}

function findMergePool(pools, droplet) {
  const threshold = droplet.pool.mergeDistance ?? 0;
  if (threshold <= 0) return null;
  let nearest = null;
  let nearestDistance = threshold;
  for (const pool of pools) {
    const distance = Math.hypot(pool.x - droplet.groundX, pool.y - droplet.groundY);
    if (distance > nearestDistance) continue;
    nearest = pool;
    nearestDistance = distance;
  }
  return nearest;
}

function jitteredCadence(base, amount, serial, salt) {
  return Math.max(0.08, base + (seeded01(serial, salt, 11) - 0.5) * amount * 2);
}

function seeded01(a, b, c) {
  let hash = 2166136261;
  const text = `${a}:${b}:${c}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}
