import { ComponentType } from '../constants/componentTypes.js';
import { addDecalStamp } from '../projection/renderLayerState.js';
import { addNapalmDroplet, addNapalmPool, updateNapalmDroplets, updateNapalmPools } from '../projection/napalmLayerState.js';
import { getNapalmDribbleRecipe } from '../data/napalmDribble.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';

export function napalmDripSystem({ game, dt }) {
  const renderLayers = game.renderLayers;
  updateNapalmDroplets(renderLayers, dt, (droplet) => landDroplet(game, droplet));
  updateNapalmPools(renderLayers, dt);

  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.WyvernProjection, ComponentType.NapalmDripEmitter])) {
    const projection = getComponent(game.world, entity, ComponentType.WyvernProjection);
    const emitter = getComponent(game.world, entity, ComponentType.NapalmDripEmitter);
    if (!emitter?.enabled) continue;
    const socket = projection?.sockets?.mouth;
    if (!socket) continue;
    const recipe = getNapalmDribbleRecipe(emitter.recipeId ?? emitter.id);
    tickEmitter(renderLayers, emitter, socket, projection, recipe, dt);
  }
}

function tickEmitter(renderLayers, emitter, socket, projection, recipe, dt) {
  const moving = (projection.movement01 ?? 0) >= recipe.minMovementForMovingCadence;
  emitter.cooldown = Math.max(0, (emitter.cooldown ?? 0) - dt);
  emitter.idleCooldown = Math.max(0, (emitter.idleCooldown ?? 0) - dt);

  const lastX = emitter.lastSocketX ?? socket.x;
  const lastY = emitter.lastSocketY ?? socket.y;
  const moved = Math.hypot(socket.x - lastX, socket.y - lastY);
  const cadenceReady = moving ? emitter.cooldown <= 0 : emitter.idleCooldown <= 0;
  const distanceReady = moved >= recipe.minDistanceBetweenDrips || !moving;

  if (cadenceReady && distanceReady) {
    spawnDroplet(renderLayers, socket, projection, recipe);
    emitter.lastSocketX = socket.x;
    emitter.lastSocketY = socket.y;
    emitter.cooldown = recipe.movingDripInterval;
    emitter.idleCooldown = recipe.idleDripInterval;
  }
}

function spawnDroplet(renderLayers, socket, projection, recipe) {
  const phase = projection.gaitPhase ?? 0;
  const side = Math.sin(phase * 1.7) * 0.035;
  const back = Math.cos(phase * 1.13) * 0.025;
  const x = socket.x + socket.right.x * side + socket.forward.x * back;
  const y = socket.y + socket.right.y * side + socket.forward.y * back;
  addNapalmDroplet(renderLayers, {
    x,
    y,
    groundX: x,
    groundY: y,
    duration: recipe.droplet.fallDuration,
    fallHeight: recipe.droplet.fallHeight,
    radius: recipe.droplet.radius,
    glowRadius: recipe.droplet.glowRadius,
    colour: recipe.droplet.colour,
    coreColour: recipe.droplet.coreColour,
    shadowColour: recipe.droplet.shadowColour,
    pool: recipe.pool,
    light: recipe.light,
    flickerPhase: phase * 0.9 + x * 2.1 + y * 1.7
  });
}

function landDroplet(game, droplet) {
  const poolRadius = droplet.pool.radius + Math.sin(droplet.flickerPhase ?? 0) * droplet.pool.radiusJitter;
  const pool = addNapalmPool(game.renderLayers, {
    x: droplet.groundX,
    y: droplet.groundY,
    radius: Math.max(0.05, poolRadius),
    lifetime: droplet.pool.lifetime,
    spreadDuration: droplet.pool.spreadDuration,
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
    light: droplet.light,
    flickerPhase: droplet.flickerPhase
  });

  if (pool) {
    addDecalStamp(game.renderLayers, {
      kind: 'napalm_scorch',
      x: pool.x,
      y: pool.y,
      radius: pool.radius * 1.12,
      colour: droplet.pool.scorchColour,
      opacity: droplet.pool.scorchOpacity
    });
  }
}
