import { resolveCreatureProfile } from './creatures/creatureTuning.js';
import {
  buildGroundedWyvernHatchlingProjection,
  GROUNDED_WYVERN_HATCHLING_PROJECTION
} from './creatures/groundedWyvernHatchling.js';

export const CreatureProjectionId = Object.freeze({
  GROUNDED_WYVERN_HATCHLING: 'grounded_wyvern_hatchling'
});

export const CREATURE_PROJECTIONS = Object.freeze({
  [CreatureProjectionId.GROUNDED_WYVERN_HATCHLING]: GROUNDED_WYVERN_HATCHLING_PROJECTION
});

export function getCreatureProjectionRecipe(id, creatureTuning = null) {
  return resolveCreatureProjectionRecipe(id, creatureTuning);
}

export function resolveCreatureProjectionRecipe(id, creatureTuning = null) {
  const recipe = CREATURE_PROJECTIONS[id];
  if (!recipe) throw new Error(`Unknown creature projection recipe: ${id}`);
  if (id === CreatureProjectionId.GROUNDED_WYVERN_HATCHLING) {
    const profile = resolveCreatureProfile(recipe.proportionProfile, creatureTuning);
    return buildGroundedWyvernHatchlingProjection(profile);
  }
  return recipe;
}
