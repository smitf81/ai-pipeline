import { LightEmitterId } from '../constants/lightEmitterIds.js';
import { SceneObjectType } from '../data/sceneObjects.js';
import {
  AMBIENT_PARTICLE_PROJECTION_MODE,
  AmbientParticleKind,
  getAmbientParticleRecipe
} from '../data/ambientParticles.js';
import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { SmokeSourceKind } from '../data/smokeSources.js';

export function buildAmbientParticleProjection({
  lights = [],
  fogSmoke = [],
  groundHazards = [],
  scenery = [],
  renderTime = 0
} = {}) {
  const particles = [];
  for (const light of lights) {
    const kind = resolveLightAmbientParticleKind(light);
    if (light.enabled === false || !kind) continue;
    appendParticles(particles, light, kind, renderTime, positionForAmbientKind(kind));
  }
  for (const hazard of groundHazards) {
    if (hazard.sourceKind !== 'napalm_pool') continue;
    appendParticles(particles, hazard, AmbientParticleKind.NAPALM_EMBER, renderTime, emberPosition);
  }
  for (const source of fogSmoke) {
    if (source.sourceKind === SmokeSourceKind.DRAGON_SMOKE_PLUME) {
      appendParticles(particles, source, AmbientParticleKind.SMOKE_TRAIL_MOTE, renderTime, smokeTrailPosition);
    }
    if (source.sourceKind === SmokeSourceKind.NAPALM_SMOULDER || source.sourceKind === SmokeSourceKind.SMOULDER_PATCH_WISP) {
      appendParticles(particles, source, AmbientParticleKind.ASH_FLECK, renderTime, ashPosition);
    }
  }
  for (const object of scenery) {
    const kind = object.render?.ambientParticles?.kind
      ?? (object.type === SceneObjectType.TREE ? AmbientParticleKind.LEAF_DRIFT : null);
    if (!kind) continue;
    appendParticles(particles, object, kind, renderTime, leafPosition);
  }
  particles.sort((a, b) => (b.renderPriority ?? 0) - (a.renderPriority ?? 0));
  return particles.slice(0, RENDER_BUDGETS.ambientParticles.maxActive);
}

function appendParticles(particles, source, kind, renderTime, positionFor) {
  const recipe = getAmbientParticleRecipe(kind);
  for (let index = 0; index < recipe.count; index += 1) {
    const cycle = recipe.cycleSeconds * (0.84 + seeded01(source.id, kind, index, 'cycle') * 0.32);
    const phase = fract((renderTime + seeded01(source.id, kind, index, 'phase') * cycle) / cycle);
    const position = positionFor(source, recipe, phase, index, kind);
    const life = Math.sin(Math.PI * phase);
    const opacity = recipe.opacity * Math.max(0.08, life) * (position.opacityScale ?? 1);
    particles.push({
      classification: 'renderer_neutral_ambient_particle_projection',
      projectionMode: AMBIENT_PARTICLE_PROJECTION_MODE,
      id: `particle:${kind}:${source.id}:${index}`,
      kind,
      visualRole: recipe.visualRole,
      sourceId: source.id,
      sourceKind: source.sourceKind ?? source.type ?? 'ambient_source',
      worldX: position.x,
      worldY: position.y,
      radius: Math.max(0.8, recipe.radiusPx * (position.radiusScale ?? 1)),
      opacity: Math.max(0, Math.min(1, opacity)),
      colour: position.colour ?? recipe.colour,
      coreColour: recipe.coreColour,
      softness: recipe.softness,
      phase,
      renderPriority: recipe.renderPriority
    });
  }
}

function torchSparkPosition(source, recipe, phase, index, kind) {
  const sway = Math.sin((phase + seeded01(source.id, kind, index, 'sway')) * Math.PI * 2);
  const spread = recipe.spreadPx ?? 5;
  return {
    x: source.worldX + seededSigned(source.id, kind, index, 'x') * spread + sway * spread * 0.42,
    y: source.worldY - phase * recipe.driftPx - seeded01(source.id, kind, index, 'rise') * 5,
    radiusScale: 0.72 + seeded01(source.id, kind, index, 'radius') * 0.68,
    opacityScale: 0.86 + (source.effectiveIntensity ?? source.intensity ?? 1) * 0.28
  };
}

function resolveLightAmbientParticleKind(light) {
  if (light?.ambientParticleKind) return light.ambientParticleKind;
  if (light?.sourceKind === LightEmitterId.TORCH) return AmbientParticleKind.TORCH_SPARK;
  return null;
}

function positionForAmbientKind(kind) {
  if (kind === AmbientParticleKind.TORCH_SPARK
    || kind === AmbientParticleKind.RAID_FLAME_SPARK
    || kind === AmbientParticleKind.MAMA_INFERNO_EMBER
    || kind === AmbientParticleKind.TREE_FIRE_EMBER) return torchSparkPosition;
  if (kind === AmbientParticleKind.NAPALM_EMBER) return emberPosition;
  if (kind === AmbientParticleKind.SMOKE_TRAIL_MOTE) return smokeTrailPosition;
  if (kind === AmbientParticleKind.ASH_FLECK) return ashPosition;
  return leafPosition;
}

function emberPosition(source, recipe, phase, index, kind) {
  const angle = seeded01(source.id, kind, index, 'angle') * Math.PI * 2;
  const orbit = (source.radius ?? recipe.driftPx) * 0.34;
  return {
    x: source.worldX + Math.cos(angle + phase * 0.7) * orbit * (0.3 + phase * 0.7),
    y: source.worldY + Math.sin(angle) * orbit * 0.34 - phase * recipe.driftPx,
    radiusScale: 0.74 + seeded01(source.id, kind, index, 'radius') * 0.58,
    opacityScale: 0.72 + (source.life01 ?? 1) * 0.32
  };
}

function smokeTrailPosition(source, recipe, phase, index, kind) {
  const forward = sourceForward(source, kind, index);
  const side = { x: -forward.y, y: forward.x };
  const wobble = seededSigned(source.id, kind, index, 'side') * source.radius * 0.22;
  return {
    x: source.worldX - forward.x * phase * recipe.driftPx + side.x * wobble,
    y: source.worldY - forward.y * phase * recipe.driftPx + side.y * wobble - phase * 8,
    radiusScale: 0.84 + phase * 0.42,
    opacityScale: (source.life01 ?? 1) * 0.9
  };
}

function ashPosition(source, recipe, phase, index, kind) {
  const angle = seeded01(source.id, kind, index, 'angle') * Math.PI * 2;
  return {
    x: source.worldX + Math.cos(angle + phase * 1.3) * source.radius * 0.28,
    y: source.worldY + Math.sin(angle) * source.radius * 0.12 - phase * recipe.driftPx,
    radiusScale: 0.58 + seeded01(source.id, kind, index, 'radius') * 0.64,
    opacityScale: (source.life01 ?? 1) * 0.86
  };
}

function leafPosition(source, recipe, phase, index, kind) {
  const width = source.worldWidth ?? source.worldRadius * 2;
  const height = source.worldHeight ?? source.worldRadius * 2;
  const left = source.worldTileX ?? source.worldX - width * 0.5;
  const top = source.worldTileY ?? source.worldY - height * 0.5;
  const baseX = left + width * seeded01(source.id, kind, index, 'x');
  const baseY = top + height * (0.16 + seeded01(source.id, kind, index, 'y') * 0.52);
  return {
    x: baseX + Math.sin(phase * Math.PI * 2 + index) * recipe.driftPx * 0.18,
    y: baseY + phase * recipe.driftPx * 0.34,
    radiusScale: 0.7 + seeded01(source.id, kind, index, 'radius') * 0.5,
    opacityScale: 0.55 + seeded01(source.id, kind, index, 'opacity') * 0.3,
    colour: seeded01(source.id, kind, index, 'colour') > 0.58
      ? 'rgba(126,116,56,0.55)'
      : recipe.colour
  };
}

function sourceForward(source, kind, index) {
  const x = Number(source.forwardX);
  const y = Number(source.forwardY);
  const length = Math.hypot(x, y);
  if (length > 0.001) return { x: x / length, y: y / length };
  const angle = seeded01(source.id, kind, index, 'forward') * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function seededSigned(...parts) {
  return seeded01(...parts) * 2 - 1;
}

function seeded01(...parts) {
  const text = parts.join(':');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function fract(value) {
  return value - Math.floor(value);
}
