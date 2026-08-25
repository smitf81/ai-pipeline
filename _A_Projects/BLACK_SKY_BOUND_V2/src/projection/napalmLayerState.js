import { RENDER_BUDGETS } from '../data/renderBudgets.js';

export function resolveNapalmDropletVisualState(droplet = {}) {
  const duration = Math.max(0.001, Number(droplet.duration) || 0.4);
  const age = Math.max(0, Number(droplet.age) || 0);
  const attachmentDuration = Math.max(0.001, Math.min(duration * 0.72, Number(droplet.attachmentDuration) || duration * 0.24));
  const attachment01 = clamp01(age / attachmentDuration);
  const separated = age >= attachmentDuration || droplet.separated === true;
  const flightDuration = Math.max(0.001, duration - attachmentDuration);
  const flight01 = clamp01((age - attachmentDuration) / flightDuration);
  const previousAge = Math.max(0, age - 1 / 30);
  const previousFlight01 = clamp01((previousAge - attachmentDuration) / flightDuration);
  const groundX = droplet.groundX ?? droplet.x ?? 0;
  const groundY = droplet.groundY ?? droplet.y ?? 0;
  const socketX = droplet.socketX ?? droplet.x ?? groundX;
  const socketY = droplet.socketY ?? droplet.y ?? groundY;
  const separationX = droplet.separationX ?? droplet.x ?? socketX;
  const separationY = droplet.separationY ?? droplet.y ?? socketY;
  const mouthHeightMeters = Math.max(0.08, Number(droplet.mouthHeightMeters) || 0.61);
  const hangingLengthMeters = Math.max(0.02, Number(droplet.hangingLengthMeters) || 0.12);
  const attachedHeight = mouthHeightMeters - hangingLengthMeters * easeInCubic(attachment01);
  const separatedHeight = Math.max(0.012, (mouthHeightMeters - hangingLengthMeters) * (1 - flight01 * flight01));
  const previousHeight = Math.max(0.012, (mouthHeightMeters - hangingLengthMeters) * (1 - previousFlight01 * previousFlight01));
  const x = separated ? lerp(separationX, groundX, easeInQuad(flight01)) : socketX;
  const y = separated ? lerp(separationY, groundY, easeInQuad(flight01)) : socketY;
  const previousX = separated ? lerp(separationX, groundX, easeInQuad(previousFlight01)) : socketX;
  const previousY = separated ? lerp(separationY, groundY, easeInQuad(previousFlight01)) : socketY;
  return {
    duration,
    age,
    drop01: clamp01(age / duration),
    life01: 1 - clamp01(age / duration),
    attachment01,
    flight01,
    separated,
    stage: separated ? 'airborne' : (attachment01 < 0.42 ? 'forming' : 'hanging'),
    x,
    y,
    previousX,
    previousY,
    heightMeters: separated ? separatedHeight : attachedHeight,
    previousHeightMeters: separated ? previousHeight : Math.min(mouthHeightMeters, attachedHeight + hangingLengthMeters * 0.24),
    mouthHeightMeters,
    socketX,
    socketY,
    groundX,
    groundY
  };
}

export function resolveNapalmPoolVisualState(pool = {}) {
  const age = Math.max(0, pool.age ?? 0);
  const lifetime = Math.max(0.001, pool.lifetime ?? 1);
  const spread01 = easeOutCubic(Math.max(0, Math.min(1, age / Math.max(0.001, pool.spreadDuration ?? 0.01))));
  const heat01 = Math.pow(Math.max(0, 1 - age / Math.max(0.001, pool.hotDuration ?? lifetime)), 0.72);
  const impactDuration = Math.max(0.001, pool.impactDuration ?? 0.2);
  const impact01 = clamp01(age / impactDuration);
  const flameDuration = Math.max(0.001, Math.min(pool.flameDuration ?? pool.hotDuration ?? lifetime, lifetime));
  return {
    life01: Math.max(0, Math.min(1, 1 - age / lifetime)),
    spread01,
    heat01,
    impact01,
    impactLife01: 1 - impact01,
    flame01: Math.pow(Math.max(0, 1 - age / flameDuration), 0.62) * Math.min(1, age / 0.08),
    spreadScale: 0.24 + spread01 * 0.76,
    cooling01: 1 - heat01
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

export function updateNapalmDropletAttachments(renderLayers, resolveSocket) {
  const droplets = renderLayers?.napalm?.droplets;
  if (!droplets) return;
  for (const droplet of droplets) {
    if (droplet.separated || droplet.age >= (droplet.attachmentDuration ?? 0)) {
      if (!droplet.separated) {
        droplet.separated = true;
        droplet.separationX = droplet.socketX ?? droplet.x;
        droplet.separationY = droplet.socketY ?? droplet.y;
      }
      continue;
    }
    const socket = resolveSocket?.(droplet);
    if (!socket) continue;
    droplet.socketX = socket.x;
    droplet.socketY = socket.y;
    droplet.x = socket.x;
    droplet.y = socket.y;
  }
}

export function buildNapalmLightViews(renderLayers, renderTime = 0) {
  const droplets = renderLayers?.napalm?.droplets ?? [];
  const pools = renderLayers?.napalm?.pools ?? [];
  const dropletLights = droplets.flatMap((droplet) => {
    const visual = resolveNapalmDropletVisualState(droplet);
    if (!droplet.emissionLight || !visual.separated || visual.age >= visual.duration) return [];
    const light = droplet.emissionLight;
    const sizeScale = droplet.secondary ? 0.62 : 1;
    return [{
      id: `${droplet.id}:airborne_light`,
      x: visual.x,
      y: visual.y,
      radius: light.radius * sizeScale,
      intensity: light.intensity * sizeScale * (0.82 + visual.life01 * 0.18),
      luminousPowerLumens: Math.max(0, Number(light.luminousPowerLumens) || 560) * sizeScale,
      softness: light.softness,
      colour: light.colour,
      innerColour: light.innerColour,
      flickerAmount: light.flickerAmount,
      flickerSpeed: light.flickerSpeed,
      flickerPhase: droplet.flickerPhase ?? 0,
      renderTime,
      enabled: visual.life01 > 0.02,
      castsShadows: false,
      shadow: { sourceHeight: visual.heightMeters },
      sourceEntity: null,
      sourceKind: 'baby_wyvern_droplet_light',
      sourceAnchor: { type: 'world_effect_object', id: droplet.id, stage: visual.stage }
    }];
  });
  const poolLights = pools
    .filter((pool) => pool.light && pool.age < pool.lifetime)
    .map((pool) => {
      const { life01, spread01, heat01 } = resolveNapalmPoolVisualState(pool);
      return {
        id: pool.id,
        x: pool.x,
        y: pool.y,
        radius: pool.light.radius * (0.42 + spread01 * 0.5) * (0.82 + heat01 * 0.18),
        intensity: pool.light.intensity * heat01 * (0.34 + spread01 * 0.66),
        luminousPowerLumens: Math.max(0, Number(pool.light.luminousPowerLumens) || 900),
        softness: pool.light.softness,
        colour: pool.light.colour,
        innerColour: pool.light.innerColour,
        flickerAmount: pool.light.flickerAmount,
        flickerSpeed: pool.light.flickerSpeed,
        flickerPhase: pool.flickerPhase ?? 0,
        renderTime,
        enabled: life01 > 0.02 && heat01 > 0.015,
        castsShadows: false,
        shadow: { sourceHeight: 0.045 },
        sourceEntity: null,
        sourceKind: 'baby_wyvern_drool_pool_light',
        sourceAnchor: { type: 'world_effect_object', id: pool.id }
      };
    });
  return [...dropletLights, ...poolLights];
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInCubic(value) { return value * value * value; }
function easeInQuad(value) { return value * value; }
function lerp(a, b, amount) { return a + (b - a) * amount; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

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
