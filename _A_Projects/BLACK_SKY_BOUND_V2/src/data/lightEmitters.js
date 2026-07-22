import { LightEmitterId } from '../constants/lightEmitterIds.js';
import { AmbientParticleKind } from './ambientParticles.js';
import { SmokeSourceKind } from './smokeSources.js';

export const LIGHT_EMITTERS = Object.freeze({
  [LightEmitterId.TORCH]: Object.freeze({
    id: LightEmitterId.TORCH,
    classification: 'component_visual_authoring_recipe',
    label: 'Torch',
    colour: 'rgba(255, 154, 72, 1)',
    innerColour: 'rgba(255, 223, 156, 1)',
    radius: 5.2,
    intensity: 0.75,
    revealRadius: 6.35,
    revealStrength: 0.68,
    glowRadius: 2.24,
    glowStrength: 0.38,
    coreRadius: 0.34,
    coreStrength: 0.6,
    softness: 0.68,
    flickerAmount: 0.14,
    flickerSpeed: 8.5,
    visual: {
      coreRadius: 0.11,
      offsetX: 0.22,
      offsetY: -0.12
    },
    smokeSourceKind: SmokeSourceKind.TORCH_WISP,
    ambientParticleKind: AmbientParticleKind.TORCH_SPARK,
    defeat: {
      dropDuration: 0.42,
      fadeDelay: 0.22,
      fadeDuration: 8.4,
      groundOffsetForward: 0.46,
      groundOffsetRight: 0.18,
      dropEmissionScale: 0.64,
      dropRadiusScale: 0.8,
      emissionFloor: 0.03,
      radiusFloor: 0.16
    }
  }),
  [LightEmitterId.RAID_FLAME]: Object.freeze({
    id: LightEmitterId.RAID_FLAME,
    classification: 'scene_object_visual_authoring_recipe',
    label: 'Raid Flame',
    colour: 'rgba(255, 134, 64, 1)',
    innerColour: 'rgba(255, 216, 138, 1)',
    radius: 3.5,
    intensity: 0.6,
    revealRadius: 6,
    revealStrength: 0.76,
    glowRadius: 1.28,
    glowStrength: 0.33,
    coreRadius: 0.2,
    coreStrength: 0.56,
    softness: 0.64,
    flickerAmount: 0.16,
    flickerSpeed: 9.2,
    visual: {
      coreRadius: 0.065,
      offsetX: 0,
      offsetY: -0.04
    },
    smokeSourceKind: SmokeSourceKind.RAID_FLAME_WISP,
    ambientParticleKind: AmbientParticleKind.RAID_FLAME_SPARK
  }),
  [LightEmitterId.SMOULDER_PATCH]: Object.freeze({
    id: LightEmitterId.SMOULDER_PATCH,
    classification: 'scene_object_visual_authoring_recipe',
    label: 'Smoulder Patch',
    colour: 'rgba(238, 108, 52, 1)',
    innerColour: 'rgba(255, 168, 96, 1)',
    radius: 2.4,
    intensity: 0.28,
    revealRadius: 2.8,
    revealStrength: 0.28,
    glowRadius: 1.04,
    glowStrength: 0.18,
    coreRadius: 0.16,
    coreStrength: 0.28,
    softness: 0.86,
    flickerAmount: 0.08,
    flickerSpeed: 5.2,
    visual: {
      coreRadius: 0.05,
      offsetX: 0,
      offsetY: -0.04
    },
    smokeSourceKind: SmokeSourceKind.SMOULDER_PATCH_WISP
  })
});

export function getLightEmitterRecipe(id) {
  const recipe = LIGHT_EMITTERS[id];
  if (!recipe) throw new Error(`Unknown light emitter recipe: ${id}`);
  return recipe;
}

export function resolveEmitterLightContribution(source = {}, { radiusScale = 1, emissionScale = 1 } = {}) {
  const baseRadius = Math.max(0, finiteNumber(source.baseRadius ?? source.radius, 0));
  const baseIntensity = clamp01(source.baseIntensity ?? source.intensity ?? 0);
  const baseGlowRadius = Math.max(0, finiteNumber(source.baseGlowRadius ?? source.glowRadius, baseRadius * 0.46));
  const baseGlowStrength = finiteNumber(source.baseGlowStrength ?? source.glowStrength, baseIntensity * 0.5);
  return {
    revealRadius: Math.max(0, finiteNumber(source.baseRevealRadius ?? source.revealRadius, baseRadius) * radiusScale),
    revealStrength: clamp01(finiteNumber(source.baseRevealStrength ?? source.revealStrength, baseIntensity * 0.68) * emissionScale),
    glowRadius: baseGlowRadius * radiusScale,
    glowStrength: clamp01(baseGlowStrength * emissionScale),
    coreRadius: Math.max(0, finiteNumber(source.baseCoreRadius ?? source.coreRadius, Math.max(0.08, baseGlowRadius * 0.15)) * radiusScale),
    coreStrength: clamp01(finiteNumber(source.baseCoreStrength ?? source.coreStrength, Math.max(baseIntensity * 0.72, baseGlowStrength)) * emissionScale)
  };
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
