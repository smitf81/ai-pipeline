export const ImpactReactionProfileId = Object.freeze({
  WYVERN_WEIGHTED: 'wyvern_weighted_recoil',
  RAIDER_HUMAN: 'raider_human_recoil',
  HUSK_LOOSE: 'husk_loose_recoil',
  WEREWOLF_BRACED: 'werewolf_braced_recoil',
  DEFAULT: 'default_recoil'
});

export const IMPACT_REACTION_PROFILES = Object.freeze({
  [ImpactReactionProfileId.WYVERN_WEIGHTED]: freezeProfile({
    id: ImpactReactionProfileId.WYVERN_WEIGHTED,
    minDuration: 0.16,
    durationPerStagger: 0.42,
    maxDuration: 0.42,
    centerPush: 0.045,
    headPush: 0.11,
    chestPush: 0.075,
    hipPush: 0.035,
    lateralRoll: 0.065,
    tailCounter: 0.11
  }),
  [ImpactReactionProfileId.RAIDER_HUMAN]: freezeProfile({
    id: ImpactReactionProfileId.RAIDER_HUMAN,
    minDuration: 0.18,
    durationPerStagger: 0.52,
    maxDuration: 0.56,
    centerPush: 0.075,
    headPush: 0.16,
    chestPush: 0.13,
    hipPush: 0.055,
    lateralRoll: 0.12,
    tailCounter: 0
  }),
  [ImpactReactionProfileId.HUSK_LOOSE]: freezeProfile({
    id: ImpactReactionProfileId.HUSK_LOOSE,
    minDuration: 0.22,
    durationPerStagger: 0.62,
    maxDuration: 0.68,
    centerPush: 0.095,
    headPush: 0.22,
    chestPush: 0.17,
    hipPush: 0.065,
    lateralRoll: 0.17,
    tailCounter: 0
  }),
  [ImpactReactionProfileId.WEREWOLF_BRACED]: freezeProfile({
    id: ImpactReactionProfileId.WEREWOLF_BRACED,
    minDuration: 0.16,
    durationPerStagger: 0.46,
    maxDuration: 0.48,
    centerPush: 0.06,
    headPush: 0.12,
    chestPush: 0.09,
    hipPush: 0.045,
    lateralRoll: 0.08,
    tailCounter: 0.09
  }),
  [ImpactReactionProfileId.DEFAULT]: freezeProfile({
    id: ImpactReactionProfileId.DEFAULT,
    minDuration: 0.16,
    durationPerStagger: 0.48,
    maxDuration: 0.5,
    centerPush: 0.07,
    headPush: 0.14,
    chestPush: 0.11,
    hipPush: 0.05,
    lateralRoll: 0.1,
    tailCounter: 0.06
  })
});

export function getImpactReactionProfile(profileId) {
  return IMPACT_REACTION_PROFILES[profileId] ?? IMPACT_REACTION_PROFILES[ImpactReactionProfileId.DEFAULT];
}

function freezeProfile(profile) {
  return Object.freeze({ ...profile, classification: 'procedural_impact_receive_profile' });
}
