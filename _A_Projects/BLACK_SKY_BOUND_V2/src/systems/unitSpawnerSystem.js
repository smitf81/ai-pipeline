import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { spawnActor } from '../game/spawn.js';
import { syncUnitSpawnerFixtureLifecycle } from '../game/unitSpawners.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function unitSpawnerSystem({ game, dt }) {
  const spawners = Array.isArray(game?.unitSpawners) ? game.unitSpawners : [];
  if (spawners.length === 0) return;
  for (const spawner of spawners) {
    spawner.spawnedEntityIds = (spawner.spawnedEntityIds ?? []).filter((entityId) => {
      if (!game.world.entities.has(entityId)) return false;
      return getComponent(game.world, entityId, ComponentType.Health)?.alive !== false;
    });
    if (syncUnitSpawnerFixtureLifecycle(game, spawner)) continue;
    if (spawner.enabled === false) continue;
    spawner.cooldownSeconds = Math.max(0, Number(spawner.cooldownSeconds ?? spawner.initialDelaySeconds ?? 0) - dt);
    if (spawner.cooldownSeconds > 0) continue;
    const remainingByLimit = spawner.limit > 0 ? Math.max(0, spawner.limit - (spawner.spawnedCount ?? 0)) : Number.POSITIVE_INFINITY;
    const availableAliveSlots = Math.max(0, (spawner.maxAlive ?? 1) - spawner.spawnedEntityIds.length);
    const burstCount = Math.min(spawner.burstCount ?? 1, remainingByLimit, availableAliveSlots);
    if (burstCount <= 0) {
      spawner.cooldownSeconds = Math.max(0.1, Number(spawner.intervalSeconds) || 1);
      continue;
    }
    for (let index = 0; index < burstCount; index += 1) {
      const originIndex = (spawner.spawnedCount ?? 0) + index;
      const point = spawnPoint(spawner, originIndex);
      const entityId = spawnActor(game.world, spawner.type, point.x, point.y, spawner.team);
      spawner.spawnedEntityIds.push(entityId);
      spawner.spawnedCount = (spawner.spawnedCount ?? 0) + 1;
    }
    spawner.cooldownSeconds = Math.max(0.1, Number(spawner.intervalSeconds) || 1);
  }
}

function spawnPoint(spawner, originIndex) {
  const cx = Number(spawner.x) + 0.5;
  const cy = Number(spawner.y) + 0.5;
  const radius = Math.max(0, Number(spawner.spawnRadiusTiles) || 0);
  if (radius <= 0.001) return { x: cx, y: cy };
  const angle = originIndex * GOLDEN_ANGLE;
  const distance = Math.min(radius, radius * (0.4 + ((originIndex % 5) / 4) * 0.6));
  return {
    x: cx + Math.cos(angle) * distance,
    y: cy + Math.sin(angle) * distance
  };
}
