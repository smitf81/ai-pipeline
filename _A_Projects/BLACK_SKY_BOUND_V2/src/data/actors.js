import { EntityKind } from '../constants/entityKinds.js';
import { Faction } from '../constants/factions.js';
import { HumanoidProjectionId } from './humanoids/raiderHumanoid.js';
import { MaterialProfileId } from './materialProfiles.js';
import { EnemyAttackProfileId } from './enemyAttackProfiles.js';
import { ImpactReactionProfileId } from './impactReactionProfiles.js';
import { PredatorProjectionId } from './creatures/werewolfPredator.js';
import { ACTOR_LOCOMOTION_PROFILE_IDS } from './locomotionProfiles.js';
import { ACTOR_LIGHT_READABILITY_PROFILE_BY_KIND } from './actorLightReadabilityProfiles.js';
import { BodyStateProfileId, getBodyStateProfile } from './bodyStateFeedback.js';
import { CreatureRecipeId } from './creatures/creatureRecipes.js';

const YOUNG_DRAGON_BODY_STATE = getBodyStateProfile(BodyStateProfileId.YOUNG_DRAGON_SURVIVAL);

export const ACTORS = Object.freeze({
  [EntityKind.YOUNG_DRAGON]: Object.freeze({
    kind: EntityKind.YOUNG_DRAGON,
    label: 'Wyvern Hatchling',
    defaultTeam: Faction.PLAYER,
    hp: YOUNG_DRAGON_BODY_STATE.health.maxHealth,
    bodyStateProfileId: BodyStateProfileId.YOUNG_DRAGON_SURVIVAL,
    speed: 4.65,
    radius: 0.34,
    colour: '#d65b28',
    stroke: '#ffd7a1',
    materialProfileId: MaterialProfileId.SCALE_WYVERN_COPPER,
    role: 'player_survivor',
    silhouette: 'grounded_wyvern',
    lightReadabilityProfileId: ACTOR_LIGHT_READABILITY_PROFILE_BY_KIND[EntityKind.YOUNG_DRAGON],
    locomotionProfileId: ACTOR_LOCOMOTION_PROFILE_IDS[EntityKind.YOUNG_DRAGON],
    physics: {
      mass: 1.15,
      separationMass: 1.5,
      impactResistance: 0.28,
      staggerResistance: 0.3,
      reactionProfileId: ImpactReactionProfileId.WYVERN_WEIGHTED
    }
  }),
  [EntityKind.RAIDER]: Object.freeze({
    kind: EntityKind.RAIDER,
    label: 'Raider',
    defaultTeam: Faction.RAIDERS,
    role: 'armed_pressure',
    defaultCreatureRecipeId: CreatureRecipeId.RAIDER_SCAVENGER
  }),
  [EntityKind.HUSK]: Object.freeze({
    kind: EntityKind.HUSK,
    label: 'Husk',
    defaultTeam: Faction.HUSKS,
    hp: 28,
    speed: 2.45,
    radius: 0.26,
    colour: '#b8b1a3',
    stroke: '#3d3a34',
    materialProfileId: MaterialProfileId.FLESH_HUSK,
    role: 'swarm_pressure',
    silhouette: 'humanoid',
    lightReadabilityProfileId: ACTOR_LIGHT_READABILITY_PROFILE_BY_KIND[EntityKind.HUSK],
    humanoidProjection: HumanoidProjectionId.HUSK_TOP_DOWN_SHAMBLER,
    attackProfileIds: Object.freeze([EnemyAttackProfileId.HUSK_CLAW_MAUL]),
    locomotionProfileId: ACTOR_LOCOMOTION_PROFILE_IDS[EntityKind.HUSK],
    physics: {
      mass: 0.86,
      separationMass: 0.75,
      impactResistance: 0.16,
      staggerResistance: 0.2,
      reactionProfileId: ImpactReactionProfileId.HUSK_LOOSE
    },
    ai: {
      damage: 6,
      attackRange: 0.76,
      attackCooldown: 1.45,
      roamRadius: 4.5,
      aggroRange: 10.5,
      leashRange: 16,
      decisionInterval: 0.72
    }
  }),
  [EntityKind.WEREWOLF]: Object.freeze({
    kind: EntityKind.WEREWOLF,
    label: 'Werewolf',
    defaultTeam: Faction.WOLVES,
    hp: 72,
    speed: 3.75,
    radius: 0.38,
    colour: '#564655',
    stroke: '#c7b4d5',
    materialProfileId: MaterialProfileId.FUR_WEREWOLF,
    role: 'fast_predator',
    silhouette: 'predator',
    lightReadabilityProfileId: ACTOR_LIGHT_READABILITY_PROFILE_BY_KIND[EntityKind.WEREWOLF],
    predatorProjection: PredatorProjectionId.WEREWOLF_TOP_DOWN,
    locomotionProfileId: ACTOR_LOCOMOTION_PROFILE_IDS[EntityKind.WEREWOLF],
    attackProfileIds: Object.freeze([EnemyAttackProfileId.WEREWOLF_LUNGE_BITE]),
    physics: {
      mass: 1.22,
      separationMass: 1.8,
      impactResistance: 0.42,
      staggerResistance: 0.4,
      reactionProfileId: ImpactReactionProfileId.WEREWOLF_BRACED
    },
    ai: {
      damage: 14,
      attackRange: 1.28,
      attackCooldown: 1.55,
      roamRadius: 8.5,
      aggroRange: 14,
      leashRange: 22,
      decisionInterval: 0.4
    }
  })
});

export function getDefaultActorFaction(type) {
  return ACTORS[type]?.defaultTeam ?? Faction.ENEMY;
}
