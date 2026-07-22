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
    minMovementForMovingCadence: 0.07,
    minDistanceBetweenDrips: 0.12,
    droplet: Object.freeze({
      fallDuration: 0.46,
      fallHeight: 0.22,
      radius: 0.036,
      glowRadius: 0.075,
      colour: 'rgba(238,76,24,0.9)',
      coreColour: 'rgba(255,210,100,0.94)',
      shadowColour: 'rgba(95,30,10,0.42)'
    }),
    pool: Object.freeze({
      lifetime: 12,
      spreadDuration: 0.38,
      hotDuration: 5.2,
      radius: 0.19,
      radiusJitter: 0.045,
      visualMaterial: 'residual_liquid_napalm_pool_v1',
      poolShape: 'irregular_low_pool',
      colour: 'rgba(126,31,14,0.48)',
      hotColour: 'rgba(255,112,30,0.38)',
      rimColour: 'rgba(25,8,6,0.5)',
      coolingColour: 'rgba(67,17,11,0.44)',
      opacity: 0.64,
      rimScale: 1.08,
      bodyScale: 0.86,
      hotSpotScale: 0.12,
      hotSpotCount: 2,
      scorchColour: 'rgba(31,11,7,0.32)',
      scorchOpacity: 0.44
    }),
    light: Object.freeze({
      radius: 0.5,
      intensity: 0.19,
      softness: 0.9,
      colour: 'rgba(255,92,26,0.32)',
      innerColour: 'rgba(255,186,88,0.42)',
      flickerAmount: 0.1,
      flickerSpeed: 6.5
    })
  })
});

export function getNapalmDribbleRecipe(id) {
  const recipe = NAPALM_DRIBBLE_RECIPES[id];
  if (!recipe) throw new Error(`Unknown napalm dribble recipe: ${id}`);
  return recipe;
}
