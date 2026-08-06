import { EntityKind } from '../../constants/entityKinds.js';
import { createSeededRandom } from '../../core/random.js';
import { getSoundCue } from '../../audio/soundManifest.js';
import { DEATH_AFTERMATH_PROFILES } from '../deathAftermath.js';
import { getEnemyAttackProfile } from '../enemyAttackProfiles.js';
import { getHumanoidProjectionProfile } from '../humanoids/raiderHumanoid.js';
import { IMPACT_REACTION_PROFILES } from '../impactReactionProfiles.js';
import { getLightEmitterRecipe } from '../lightEmitters.js';
import { getLocomotionProfile } from '../locomotionProfiles.js';
import { getMaterialProfile } from '../materialProfiles.js';
import { getCreatureAttachment } from './creatureAttachments.js';
import {
  CREATURE_RECIPE_CONTRACT,
  CREATURE_RECIPE_INSTANCE_CONTRACT,
  CreatureRecipeId,
  RAIDER_CREATURE_RECIPE
} from './raiderCreatureRecipe.js';

export { CREATURE_RECIPE_CONTRACT, CREATURE_RECIPE_INSTANCE_CONTRACT, CreatureRecipeId };

export const CREATURE_RECIPES = Object.freeze({
  [CreatureRecipeId.RAIDER_SCAVENGER]: RAIDER_CREATURE_RECIPE
});

const ENTITY_KINDS = new Set(Object.values(EntityKind));

for (const recipe of Object.values(CREATURE_RECIPES)) assertValidCreatureRecipe(recipe);

export function getCreatureRecipe(id) {
  const recipe = CREATURE_RECIPES[id];
  if (!recipe) throw new Error(`Unknown creature recipe: ${id}`);
  return recipe;
}

export function normalizeCreatureRecipeReference(value, { allowNull = true } = {}) {
  if (value == null && allowNull) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('creature_recipe_reference_invalid');
  const recipeId = String(value.recipeId ?? '').trim();
  if (!recipeId) throw new Error('creature_recipe_reference_recipe_id_missing');
  getCreatureRecipe(recipeId);
  const normalized = { recipeId };
  if (Object.hasOwn(value, 'seed')) normalized.seed = normalizeUnsignedSeed(value.seed);
  return Object.freeze(normalized);
}

export function resolveCreatureRecipeInstance({ defaultRecipeId = null, creature = null, sourceId = null, sourceKind = 'direct_spawn' } = {}) {
  const reference = creature == null ? null : normalizeCreatureRecipeReference(creature, { allowNull: false });
  const recipeId = reference?.recipeId ?? defaultRecipeId;
  if (!recipeId) return null;
  const recipe = getCreatureRecipe(recipeId);
  const explicitSeed = reference && Object.hasOwn(reference, 'seed');
  const stableSourceId = String(sourceId ?? `${recipeId}:direct`).trim();
  const seed = explicitSeed ? reference.seed : hashStringToSeed(stableSourceId);
  const random = createSeededRandom(hashStringToSeed(`${recipeId}:${seed}`));
  const paletteFamily = choose(recipe.surface.paletteFamilies, random);
  const equipment = resolveEquipment(recipe, random);
  const bodyModifiers = Object.fromEntries(Object.entries(recipe.bodyPlan.proportionVariation ?? {})
    .map(([key, range]) => [key, numberInRange(range, random)]));
  const attachmentIds = Object.values(equipment).filter(Boolean).map((entry) => entry.attachmentId);
  const lightAttachment = Object.values(equipment).filter(Boolean)
    .map((entry) => getCreatureAttachment(entry.attachmentId))
    .find((entry) => entry.lightEmitterId);
  const variantSignature = buildVariantSignature(recipeId, seed, paletteFamily.id, equipment, bodyModifiers);
  return deepFreeze({
    contract: CREATURE_RECIPE_INSTANCE_CONTRACT,
    classification: 'resolved_procedural_creature_recipe_instance',
    recipeId,
    recipeContract: recipe.contract,
    species: recipe.identity.species,
    actorKind: recipe.identity.actorKind,
    seed,
    seedProvenance: {
      kind: explicitSeed ? 'explicit_seed' : sourceKind,
      sourceId: stableSourceId
    },
    gameplay: {
      physicalProfileId: recipeId,
      locomotionProfileId: recipe.locomotion.profileId,
      attackProfileIds: recipe.attacks.map((entry) => entry.profileId),
      behaviourControllerId: recipe.behaviour.controllerId,
      audioProfileId: recipe.audio.profileId,
      audioCueIds: { ...recipe.audio.cues },
      deathProfileId: recipe.death.profileId,
      lightEmitterId: lightAttachment?.lightEmitterId ?? recipe.lighting?.lightEmitterId ?? null
    },
    appearance: {
      bodyModifiers,
      paletteFamilyId: paletteFamily.id,
      palette: { ...paletteFamily.roles },
      equipment,
      attachmentIds,
      idlePhaseOffset: Number((random() * Math.PI * 2).toFixed(6))
    },
    variantSignature
  });
}

export function resolveCreatureHumanoidProfile(baseProfile, instance) {
  if (!instance?.appearance?.bodyModifiers) return baseProfile;
  const value = instance.appearance.bodyModifiers;
  const profile = clone(baseProfile);
  profile.body.torsoLength *= value.torsoScale ?? 1;
  profile.body.shoulderWidth *= value.shoulderScale ?? 1;
  profile.body.hipWidth *= value.hipScale ?? 1;
  profile.head.radius *= value.headScale ?? 1;
  profile.head.forward *= value.headScale ?? 1;
  scaleFields(profile.limbs, ['armLength', 'upperArmLength', 'forearmLength', 'armWidth', 'handRadius'], value.armScale ?? 1);
  scaleFields(profile.limbs, ['legLength', 'thighLength', 'calfLength', 'legWidth', 'footRadius'], value.legScale ?? 1);
  return profile;
}

export function validateCreatureRecipe(recipe) {
  const errors = [];
  if (recipe?.contract !== CREATURE_RECIPE_CONTRACT) errors.push(`contract_invalid:${recipe?.contract ?? 'missing'}`);
  if (!recipe?.identity?.id) errors.push('identity_id_missing');
  if (!ENTITY_KINDS.has(recipe?.identity?.actorKind)) errors.push(`actor_kind_unknown:${recipe?.identity?.actorKind ?? 'missing'}`);
  probe(errors, 'humanoid_profile_unknown', () => getHumanoidProjectionProfile(recipe?.bodyPlan?.profileId));
  probe(errors, 'locomotion_profile_unknown', () => getLocomotionProfile(recipe?.locomotion?.profileId));
  if (!IMPACT_REACTION_PROFILES[recipe?.physical?.physics?.reactionProfileId]) errors.push(`impact_profile_unknown:${recipe?.physical?.physics?.reactionProfileId ?? 'missing'}`);
  const roles = recipe?.surface?.materialRoles ?? {};
  for (const [role, material] of Object.entries(roles)) probe(errors, `material_profile_unknown:${role}`, () => getMaterialProfile(material.profileId));
  const declaredSockets = new Set(recipe?.bodyPlan?.declaredSocketIds ?? []);
  const slotIds = new Set((recipe?.equipment?.slots ?? []).map((slot) => slot.id));
  for (const slot of recipe?.equipment?.slots ?? []) {
    if (!Array.isArray(slot.attachmentIds) || slot.attachmentIds.length === 0) errors.push(`equipment_slot_empty:${slot.id}`);
    for (const attachmentId of slot.attachmentIds ?? []) {
      let attachment;
      try { attachment = getCreatureAttachment(attachmentId); } catch { errors.push(`attachment_unknown:${slot.id}:${attachmentId}`); continue; }
      if (attachment.slot !== slot.id) errors.push(`attachment_slot_mismatch:${slot.id}:${attachmentId}:${attachment.slot}`);
      for (const socketId of attachment.socketIds) if (!declaredSockets.has(socketId)) errors.push(`attachment_socket_unknown:${attachmentId}:${socketId}`);
      for (const role of attachment.materialRoles) if (!roles[role]) errors.push(`attachment_material_role_unknown:${attachmentId}:${role}`);
      if (attachment.lightEmitterId) probe(errors, `light_emitter_unknown:${attachmentId}`, () => getLightEmitterRecipe(attachment.lightEmitterId));
    }
  }
  for (const attack of recipe?.attacks ?? []) {
    let profile;
    try { profile = getEnemyAttackProfile(attack.profileId); } catch { errors.push(`attack_profile_unknown:${attack.profileId}`); continue; }
    if (!slotIds.has(attack.equipmentSlot)) errors.push(`attack_equipment_slot_unknown:${attack.profileId}:${attack.equipmentSlot}`);
    for (const socketId of [attack.sourceSocketId, attack.endpointSocketId, profile.strikeOriginSocket, profile.strikeEndpointSocket].filter(Boolean)) {
      if (!declaredSockets.has(socketId)) errors.push(`attack_socket_unknown:${attack.profileId}:${socketId}`);
    }
  }
  for (const [role, cueId] of Object.entries(recipe?.audio?.cues ?? {})) if (!getSoundCue(cueId)) errors.push(`audio_cue_unknown:${role}:${cueId}`);
  if (!Object.values(DEATH_AFTERMATH_PROFILES).some((profile) => profile.id === recipe?.death?.profileId)) errors.push(`death_profile_unknown:${recipe?.death?.profileId ?? 'missing'}`);
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function assertValidCreatureRecipe(recipe) {
  const result = validateCreatureRecipe(recipe);
  if (!result.ok) throw new Error(`creature_recipe_invalid:${recipe?.identity?.id ?? 'unknown'}:${result.errors.join(',')}`);
  return recipe;
}

export function hashStringToSeed(value) {
  let hash = 2166136261;
  for (const character of String(value ?? '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveEquipment(recipe, random) {
  const result = {};
  for (const slot of recipe.equipment.slots) {
    if (!slot.required && random() > slot.chance) {
      result[slot.id] = null;
      continue;
    }
    const attachmentId = choose(slot.attachmentIds, random);
    const attachment = getCreatureAttachment(attachmentId);
    result[slot.id] = { attachmentId, kind: attachment.kind, style: attachment.style };
  }
  return result;
}

function buildVariantSignature(recipeId, seed, paletteId, equipment, modifiers) {
  const equipmentKey = Object.entries(equipment).map(([slot, value]) => `${slot}=${value?.attachmentId ?? 'none'}`).join('|');
  const bodyKey = Object.entries(modifiers).map(([key, value]) => `${key}=${Number(value).toFixed(4)}`).join('|');
  return `${recipeId}:${seed.toString(16).padStart(8, '0')}:${paletteId}:${hashStringToSeed(`${equipmentKey}|${bodyKey}`).toString(16).padStart(8, '0')}`;
}

function normalizeUnsignedSeed(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0xffffffff) throw new Error(`creature_recipe_seed_invalid:${value}`);
  return numeric >>> 0;
}

function choose(values, random) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('creature_recipe_choice_empty');
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))];
}

function numberInRange(range, random) {
  const [min, max] = Array.isArray(range) ? range : [1, 1];
  return Number((Number(min) + (Number(max) - Number(min)) * random()).toFixed(6));
}

function scaleFields(target, keys, scale) {
  for (const key of keys) if (Number.isFinite(target[key])) target[key] *= scale;
}

function probe(errors, label, run) {
  try { run(); } catch { errors.push(label); }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
