import { EntityKind } from '../constants/entityKinds.js';
import { WEREWOLF_PREDATOR_PROFILE } from './creatures/werewolfPredator.js';

export const ActorLightReadabilityProfileId = Object.freeze({
  WYVERN_HATCHLING: 'wyvern_hatchling_light_silhouette_v0',
  RAIDER: 'raider_light_silhouette_v0',
  HUSK: 'husk_light_silhouette_v0',
  WEREWOLF: 'werewolf_light_silhouette_v0'
});

const SHARED_CONTRACT = Object.freeze({
  contract: 'black-sky-bound.actor-light-silhouette-readability.v0',
  lightPolicy: 'nearest_local_non_scene_emitter',
  fillPolicy: 'preserve_dark_actor_material',
  outlinePolicy: 'emitter_facing_partial_edges_only_no_global_outline',
  contactShadowPolicy: 'small_actor_local_underlay_not_light_pool'
});

export const ACTOR_LIGHT_READABILITY_PROFILES = Object.freeze({
  [ActorLightReadabilityProfileId.WYVERN_HATCHLING]: profile({
    id: ActorLightReadabilityProfileId.WYVERN_HATCHLING,
    rimPartRoles: ['head', 'chest', 'hips', 'tail'],
    catchlightRoles: ['left_eye', 'right_eye', 'mouth'],
    rimWidthPx: 2.2,
    rimArcHalfAngle: 0.72,
    rimAlpha: 0.3,
    catchlightAlpha: 0.72,
    catchlightRadiusPx: 1.35,
    coreOcclusionAlpha: 0.15,
    contactShadowAlpha: 0.19,
    contactShadowScale: 1.22
  }),
  [ActorLightReadabilityProfileId.RAIDER]: profile({
    id: ActorLightReadabilityProfileId.RAIDER,
    rimPartRoles: ['head', 'torso', 'torch_arm', 'spear'],
    catchlightRoles: ['torch_flame', 'spear_tip'],
    rimWidthPx: 1.65,
    rimArcHalfAngle: 0.68,
    rimAlpha: 0.34,
    catchlightAlpha: 0.82,
    catchlightRadiusPx: 1.2,
    coreOcclusionAlpha: 0.18,
    contactShadowAlpha: 0.2,
    contactShadowScale: 1.05
  }),
  [ActorLightReadabilityProfileId.HUSK]: profile({
    id: ActorLightReadabilityProfileId.HUSK,
    rimPartRoles: ['head', 'torso', 'left_arm'],
    catchlightRoles: [],
    rimWidthPx: 1.45,
    rimArcHalfAngle: 0.62,
    rimAlpha: 0.23,
    catchlightAlpha: 0,
    catchlightRadiusPx: 0,
    coreOcclusionAlpha: 0.2,
    contactShadowAlpha: 0.21,
    contactShadowScale: 1
  }),
  [ActorLightReadabilityProfileId.WEREWOLF]: profile({
    id: ActorLightReadabilityProfileId.WEREWOLF,
    ...WEREWOLF_PREDATOR_PROFILE.readability
  })
});

export const ACTOR_LIGHT_READABILITY_PROFILE_BY_KIND = Object.freeze({
  [EntityKind.YOUNG_DRAGON]: ActorLightReadabilityProfileId.WYVERN_HATCHLING,
  [EntityKind.RAIDER]: ActorLightReadabilityProfileId.RAIDER,
  [EntityKind.HUSK]: ActorLightReadabilityProfileId.HUSK,
  [EntityKind.WEREWOLF]: ActorLightReadabilityProfileId.WEREWOLF
});

export function getActorLightReadabilityProfile(id) {
  return ACTOR_LIGHT_READABILITY_PROFILES[id] ?? null;
}

function profile(data) {
  return Object.freeze({
    ...SHARED_CONTRACT,
    maxRimParts: 4,
    maxCatchlights: 3,
    influenceRadiusScale: 1,
    minimumInfluence: 0.025,
    falloffExponent: 1.45,
    rimColourMix: 0.58,
    coreOcclusionScale: 0.72,
    contactShadowOffsetScale: 0.12,
    ...data,
    rimPartRoles: Object.freeze([...(data.rimPartRoles ?? [])]),
    catchlightRoles: Object.freeze([...(data.catchlightRoles ?? [])])
  });
}
