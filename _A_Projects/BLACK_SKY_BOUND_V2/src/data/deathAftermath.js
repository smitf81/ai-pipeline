import { EntityKind } from '../constants/entityKinds.js';

export const DEATH_AFTERMATH_CAP = 24;
export const CORPSE_SLOWDOWN_MINIMUM = 0.72;

export const DEATH_AFTERMATH_PROFILES = Object.freeze({
  [EntityKind.RAIDER]: profile({
    id: 'raider_fallen_body',
    bodyLength: 1.08,
    bodyWidth: 0.34,
    bodyColour: '#6b493b',
    detailColour: '#30221e',
    bloodRadius: 0.46,
    bloodOffsetX: -0.08,
    bloodOffsetY: 0.04,
    slowdownRadius: 0.72,
    slowdownMultiplier: 0.84
  }),
  [EntityKind.HUSK]: profile({
    id: 'husk_sprawled_body',
    bodyLength: 0.94,
    bodyWidth: 0.4,
    bodyColour: '#8b8377',
    detailColour: '#403b35',
    bloodRadius: 0.4,
    bloodOffsetX: 0.08,
    bloodOffsetY: -0.04,
    slowdownRadius: 0.66,
    slowdownMultiplier: 0.86
  }),
  [EntityKind.WEREWOLF]: profile({
    id: 'werewolf_fallen_body',
    bodyLength: 1.34,
    bodyWidth: 0.5,
    bodyColour: '#554557',
    detailColour: '#29212b',
    bloodRadius: 0.56,
    bloodOffsetX: -0.14,
    bloodOffsetY: 0,
    slowdownRadius: 0.88,
    slowdownMultiplier: 0.8
  })
});

export function getDeathAftermathProfile(entityKind) {
  return DEATH_AFTERMATH_PROFILES[entityKind] ?? null;
}

function profile(data) {
  return Object.freeze({
    classification: 'actor_type_death_aftermath_profile_v0',
    bloodColour: 'rgba(92,8,21,0.72)',
    bloodRimColour: 'rgba(25,2,8,0.58)',
    ...data
  });
}
