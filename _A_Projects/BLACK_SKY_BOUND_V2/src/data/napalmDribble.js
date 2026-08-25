import { NapalmEmitterId } from '../constants/napalmEmitterIds.js';

export const NAPALM_DRIBBLE_RECIPES = Object.freeze({
  [NapalmEmitterId.WYVERN_MOUTH_DRIBBLE]: Object.freeze({
    id: NapalmEmitterId.WYVERN_MOUTH_DRIBBLE,
    label: 'Wyvern mouth napalm dribble',
    classification: 'projection_emitter_recipe',
    sourceSocket: 'mouth',
    emits: 'bounded_live_droplets_to_decal_pools',
    movingDripInterval: 0.34,
    idleDripInterval: 1.15,
    movingCadenceJitter: 0.09,
    idleCadenceJitter: 0.28,
    minMovementForMovingCadence: 0.07,
    minDistanceBetweenDrips: 0.12,
    droplet: Object.freeze({
      fallDuration: 0.52,
      attachmentDuration: 0.14,
      mouthHeightMeters: 0.61,
      hangingLengthMeters: 0.17,
      forwardCarry: 0.09,
      movementCarrySeconds: 0.035,
      radius: 0.05,
      radiusJitter: 0.007,
      glowRadius: 0.068,
      splitEvery: 4,
      splitDelay: 0.075,
      splitRadiusScale: 0.52,
      colour: 'rgba(126,35,17,0.98)',
      coreColour: 'rgba(255,126,42,0.9)',
      rimColour: 'rgba(255,185,80,0.72)',
      shadowColour: 'rgba(44,10,7,0.58)',
      smokeColour: 'rgba(39,31,29,0.34)',
      emissionLight: Object.freeze({
        radius: 0.28,
        intensity: 0.11,
        softness: 0.94,
        luminousPowerLumens: 560,
        colour: 'rgba(255,92,28,0.72)',
        innerColour: 'rgba(255,184,84,0.82)',
        flickerAmount: 0.08,
        flickerSpeed: 8.6
      })
    }),
    pool: Object.freeze({
      lifetime: 6.8,
      spreadDuration: 0.3,
      impactDuration: 0.22,
      flameDuration: 2.4,
      hotDuration: 3.1,
      radius: 0.17,
      radiusJitter: 0.035,
      mergeDistance: 0.26,
      visualMaterial: 'residual_liquid_napalm_pool_v1',
      poolShape: 'irregular_low_pool',
      colour: 'rgba(67,15,11,0.9)',
      hotColour: 'rgba(206,58,18,0.74)',
      rimColour: 'rgba(24,7,6,0.94)',
      coolingColour: 'rgba(34,15,14,0.88)',
      opacity: 0.88,
      rimScale: 1.08,
      bodyScale: 0.86,
      hotSpotScale: 0.16,
      hotSpotCount: 2,
      lobeCount: 2,
      scorchColour: 'rgba(20,9,8,0.44)',
      scorchOpacity: 0.36
    }),
    light: Object.freeze({
      radius: 0.42,
      intensity: 0.1,
      softness: 0.9,
      luminousPowerLumens: 900,
      colour: 'rgba(255,76,22,0.3)',
      innerColour: 'rgba(255,174,74,0.38)',
      flickerAmount: 0.13,
      flickerSpeed: 7.2
    })
  })
});

export function getNapalmDribbleRecipe(id) {
  const recipe = NAPALM_DRIBBLE_RECIPES[id];
  if (!recipe) throw new Error(`Unknown napalm dribble recipe: ${id}`);
  return recipe;
}
