import { RENDER_BUDGETS } from '../data/renderBudgets.js';

export function resolveNapalmDropletVisualState(droplet = {}) {
  const duration = Math.max(0.001, Number(droplet.duration) || 0.4);
  const drop01 = Math.max(0, Math.min(1, (droplet.age ?? 0) / duration));
  const previousDrop01 = Math.max(0, drop01 - 0.2);
  const groundX = droplet.groundX ?? droplet.x ?? 0;
  const groundY = droplet.groundY ?? droplet.y ?? 0;
  const fallHeight = Math.max(0, droplet.fallHeight ?? 0.16);
  const liftAt = (progress) => fallHeight * Math.pow(1 - progress, 1.7);
  return {
    duration,
    drop01,
    life01: 1 - drop01,
    x: droplet.x ?? groundX,
    y: groundY - liftAt(drop01),
    previousX: droplet.x ?? groundX,
    previousY: groundY - liftAt(previousDrop01),
    groundX,
    groundY
  };
}

export function resolveNapalmPoolVisualState(pool = {}) {
  const age = Math.max(0, pool.age ?? 0);
  const lifetime = Math.max(0.001, pool.lifetime ?? 1);
  const spread01 = easeOutCubic(Math.max(0, Math.min(1, age / Math.max(0.001, pool.spreadDuration ?? 0.01))));
  const heat01 = Math.pow(Math.max(0, 1 - age / Math.max(0.001, pool.hotDuration ?? lifetime)), 0.72);
  return {
    life01: Math.max(0, Math.min(1, 1 - age / lifetime)),
    spread01,
    heat01,
    spreadScale: 0.24 + spread01 * 0.76
  };
}

export function addNapalmDroplet(renderLayers, droplet) {
  const napalm = renderLayers?.napalm;
  if (!napalm) return null;
  const next = {
    id: `napalm_droplet_${napalm.nextId++}`,
    age: 0,
    ...droplet
  };
  napalm.droplets.push(next);
  trimNapalmList(napalm.droplets, RENDER_BUDGETS.napalmDroplets.maxActive, napalm, 'droppedDroplets');
  return next;
}

export function addNapalmPool(renderLayers, pool) {
  const napalm = renderLayers?.napalm;
  if (!napalm) return null;
  const next = {
    id: `napalm_pool_${napalm.nextId++}`,
    age: 0,
    ...pool
  };
  napalm.pools.push(next);
  trimNapalmList(napalm.pools, RENDER_BUDGETS.napalmPools.maxActive, napalm, 'droppedPools');
  return next;
}

export function updateNapalmPools(renderLayers, dt) {
  const pools = renderLayers?.napalm?.pools;
  if (!pools) return;
  for (const pool of pools) pool.age += dt;
  removeExpired(pools);
}

export function updateNapalmDroplets(renderLayers, dt, onLand) {
  const droplets = renderLayers?.napalm?.droplets;
  if (!droplets) return;
  for (const droplet of droplets) droplet.age += dt;
  for (const droplet of [...droplets]) {
    if (droplet.age < droplet.duration) continue;
    onLand?.(droplet);
    const index = droplets.indexOf(droplet);
    if (index >= 0) droplets.splice(index, 1);
  }
}

export function buildNapalmPoolLightViews(renderLayers, renderTime = 0) {
  const pools = renderLayers?.napalm?.pools ?? [];
  return pools
    .filter((pool) => pool.light && pool.age < pool.lifetime)
    .map((pool) => {
      const { life01, spread01, heat01 } = resolveNapalmPoolVisualState(pool);
      return {
        id: pool.id,
        x: pool.x,
        y: pool.y,
        radius: pool.light.radius * (0.42 + spread01 * 0.5) * (0.82 + heat01 * 0.18),
        intensity: pool.light.intensity * heat01 * (0.34 + spread01 * 0.66),
        softness: pool.light.softness,
        colour: pool.light.colour,
        innerColour: pool.light.innerColour,
        flickerAmount: pool.light.flickerAmount,
        flickerSpeed: pool.light.flickerSpeed,
        flickerPhase: pool.flickerPhase ?? 0,
        renderTime,
        enabled: life01 > 0.02 && heat01 > 0.015,
        sourceEntity: null,
        sourceKind: 'napalm_pool_light',
        sourceAnchor: { type: 'world_effect_object', id: pool.id }
      };
    });
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function trimNapalmList(list, max, napalm, counterKey) {
  if (list.length <= max) return;
  const dropCount = list.length - max;
  list.splice(0, dropCount);
  napalm[counterKey] = (napalm[counterKey] ?? 0) + dropCount;
}

function removeExpired(items) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i].age >= items[i].lifetime) items.splice(i, 1);
  }
}
