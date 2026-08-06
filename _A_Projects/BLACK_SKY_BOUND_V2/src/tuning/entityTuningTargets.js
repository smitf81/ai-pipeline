import { resolveCreatureProjectionRecipe } from '../data/creatureProjections.js';
import { getCreatureTuningFields } from '../data/creatures/creatureTuning.js';
import { getPredatorProjectionProfile } from '../data/creatures/werewolfPredator.js';
import { getHumanoidProjectionProfile } from '../data/humanoids/raiderHumanoid.js';
import { getHumanoidTuningFields } from '../data/humanoids/humanoidTuningFields.js';

export const EntityTuningProviderId = Object.freeze({
  CREATURE_PROFILE: 'bsb.creature-profile-tuning',
  PREDATOR_PROFILE: 'bsb.predator-profile-tuning'
});

export function resolveCreatureTuningTarget(actor, tuning = null) {
  if (actor?.wyvernProjection?.recipeId) {
    const recipe = resolveCreatureProjectionRecipe(actor.wyvernProjection.recipeId, tuning);
    return {
      kind: 'wyvern',
      providerId: EntityTuningProviderId.CREATURE_PROFILE,
      profileId: recipe.proportionProfile.id,
      title: 'Wyvern Profile',
      manifest: getCreatureTuningFields(),
      profile: recipe.proportionProfile,
      visualBounds: actor.wyvernProjection.rigPose?.visualBounds ?? null,
      writeStatus: 'ready',
      capabilities: capabilitySet([
        ['anatomy', 'ready'], ['pose', 'runtime_projected'], ['gait', 'ready'],
        ['camera_focus', 'ready'], ['materials', 'read_only']
      ])
    };
  }
  if (actor?.humanoidProjection?.profileId) {
    const isRecipeBacked = Boolean(actor.creatureRecipe?.recipeId);
    return {
      kind: 'humanoid',
      providerId: EntityTuningProviderId.CREATURE_PROFILE,
      profileId: actor.humanoidProjection.profileId,
      title: isRecipeBacked ? 'Recipe Humanoid Profile' : 'Humanoid Profile',
      manifest: getHumanoidTuningFields(),
      profile: getHumanoidProjectionProfile(actor.humanoidProjection.profileId, tuning),
      visualBounds: actor.humanoidProjection.visualBounds ?? null,
      writeStatus: 'ready',
      capabilities: capabilitySet(isRecipeBacked ? [
        ['recipe', 'read_only'], ['anatomy', 'ready'], ['equipment', 'read_only'],
        ['motion', actor.raiderPhysicalMotion?.poseEnabled ? 'runtime_projected' : 'shadow_only'],
        ['combat_preview', 'runtime_projected'], ['camera_focus', 'ready'],
        ['materials', 'read_only'], ['lighting', 'read_only']
      ] : [
        ['anatomy', 'ready'], ['gait', 'ready'], ['combat_preview', 'runtime_projected'],
        ['camera_focus', 'ready'], ['materials', 'read_only']
      ])
    };
  }
  if (actor?.predatorProjection?.profileId) {
    return {
      kind: 'predator',
      providerId: EntityTuningProviderId.PREDATOR_PROFILE,
      profileId: actor.predatorProjection.profileId,
      title: 'Predator Profile',
      manifest: [],
      profile: getPredatorProjectionProfile(actor.predatorProjection.profileId),
      visualBounds: actor.predatorProjection.visualBounds ?? null,
      writeStatus: 'manifest_missing',
      capabilities: capabilitySet([
        ['predator_anatomy', 'manifest_missing'], ['gait', 'manifest_missing'],
        ['attack_pose', 'runtime_projected'], ['camera_focus', 'runtime_projected'], ['materials', 'read_only']
      ])
    };
  }
  return null;
}

function capabilitySet(entries) {
  return entries.map(([id, status]) => ({ id, status }));
}
