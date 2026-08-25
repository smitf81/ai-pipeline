import { addComponent, createEntity, getComponent, removeEntity } from '../ecs/world.js';
import { ComponentType } from '../constants/componentTypes.js';
import { EntityKind } from '../constants/entityKinds.js';
import { Faction } from '../constants/factions.js';
import { AbilityId } from '../constants/abilityIds.js';
import { ACTORS, getDefaultActorFaction } from '../data/actors.js';
import { ABILITIES, getDefaultUnlockedAbilityIds } from '../data/abilities.js';
import { Components } from '../components/createComponents.js';
import { query } from '../ecs/query.js';
import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { getVisualRecipe } from '../data/visualRecipes.js';
import { getLightEmitterRecipe } from '../data/lightEmitters.js';
import { CreatureProjectionId } from '../data/creatureProjections.js';
import { NapalmEmitterId } from '../constants/napalmEmitterIds.js';
import { getNapalmDribbleRecipe } from '../data/napalmDribble.js';
import { addDecalStamp } from '../projection/renderLayerState.js';
import { getLocomotionProfile } from '../data/locomotionProfiles.js';
import { getBodyStateProfile } from '../data/bodyStateFeedback.js';
import { getCreatureRecipe, resolveCreatureRecipeInstance } from '../data/creatures/creatureRecipes.js';
import { createRaiderPhysicalMotionIntent } from '../components/raiderPhysicalMotionComponents.js';
import { AudioSpatialProfileId } from '../data/audio/spatialAudioProfiles.js';

export function spawnActor(world, type, x, y, team = null, options = {}) {
  const actorDef = ACTORS[type];
  if (!actorDef) throw new Error(`Unknown actor type: ${type}`);
  const teamId = team ?? getDefaultActorFaction(type);
  const sourceId = options.sourceId ?? `direct:${type}:${teamId}:${stableCoordinate(x)}:${stableCoordinate(y)}`;
  const creatureRecipe = resolveCreatureRecipeInstance({
    defaultRecipeId: actorDef.defaultCreatureRecipeId,
    creature: options.creature,
    sourceId,
    sourceKind: options.sourceKind ?? (options.sourceId ? 'stable_source_id' : 'direct_spawn_source')
  });
  if (creatureRecipe && creatureRecipe.actorKind !== type) {
    throw new Error(`creature_recipe_actor_kind_mismatch:${creatureRecipe.recipeId}:${type}`);
  }
  const def = creatureRecipe ? buildRecipeActorDefinition(actorDef, getCreatureRecipe(creatureRecipe.recipeId), creatureRecipe) : actorDef;
  const entity = createEntity(world, type);
  const isPlayerDragon = teamId === Faction.PLAYER && type === EntityKind.YOUNG_DRAGON;
  addComponent(world, entity, ComponentType.Kind, Components.kind(type, def.label));
  addComponent(world, entity, ComponentType.Transform, Components.transform(x, y));
  if (isPlayerDragon) addComponent(world, entity, ComponentType.AudioListener, Components.audioListener());
  addComponent(world, entity, ComponentType.AudioEmitter, Components.audioEmitter(resolveActorAudioEmitter(type, def, options.audioEmitter)));
  addComponent(world, entity, ComponentType.Motion, Components.motion(def.speed));
  const locomotionProfile = getLocomotionProfile(def.locomotionProfileId);
  addComponent(world, entity, ComponentType.Stamina, Components.stamina(locomotionProfile));
  addComponent(world, entity, ComponentType.DodgeState, Components.dodgeState(
    locomotionProfile,
    isPlayerDragon ? ABILITIES[AbilityId.DODGE] : null
  ));
  const bodyStateProfile = def.bodyStateProfileId ? getBodyStateProfile(def.bodyStateProfileId) : null;
  addComponent(world, entity, ComponentType.Health, Components.health(def.hp, bodyStateProfile?.health));
  addComponent(world, entity, ComponentType.Collider, Components.collider(def.radius));
  addComponent(world, entity, ComponentType.BodyContactRig, Components.bodyContactRig(def.radius));
  addComponent(world, entity, ComponentType.Team, Components.team(teamId));
  addComponent(world, entity, ComponentType.Renderable, Components.renderable(def));
  if (creatureRecipe) addComponent(world, entity, ComponentType.CreatureRecipe, Components.creatureRecipe(creatureRecipe));
  if (creatureRecipe && def.humanoidProjection) {
    addComponent(world, entity, ComponentType.RaiderPhysicalMotion, createRaiderPhysicalMotionIntent(x, y, 0));
  }
  addComponent(world, entity, ComponentType.Cooldowns, Components.cooldowns({ attack: 0, bite: 0, lunge: 0, smoke: 0 }));
  addComponent(world, entity, ComponentType.StatusEffects, Components.statusEffects());
  addComponent(world, entity, ComponentType.ImpactResponse, Components.impactResponse(def.physics));
  if (def.humanoidProjection) {
    const projection = Components.humanoidProjection(def.humanoidProjection, x, y);
    projection.idlePhase = creatureRecipe?.appearance?.idlePhaseOffset ?? 0;
    addComponent(world, entity, ComponentType.HumanoidProjection, projection);
  }
  if (def.predatorProjection) {
    addComponent(world, entity, ComponentType.PredatorProjection, Components.predatorProjection(def.predatorProjection, x, y));
  }

  if (def.lightEmitter) {
    const light = { ...getLightEmitterRecipe(def.lightEmitter) };
    light.flickerPhase = ((creatureRecipe?.seed ?? entity.length * 0.73) + x * 1.37 + y * 2.11) % (Math.PI * 2);
    addComponent(world, entity, ComponentType.LightEmitter, Components.lightEmitter(light));
  }

  if (isPlayerDragon) {
    const wyvernRecipeId = CreatureProjectionId.GROUNDED_WYVERN_HATCHLING;
    addComponent(world, entity, ComponentType.WyvernProjection, Components.wyvernProjection(wyvernRecipeId, x, y));
    addComponent(world, entity, ComponentType.MotionState, Components.motionState());
    addComponent(world, entity, ComponentType.ActionState, Components.actionState());
    addComponent(world, entity, ComponentType.ComboState, Components.comboState());
    addComponent(world, entity, ComponentType.LimbRig, Components.limbRig(wyvernRecipeId));
    addComponent(world, entity, ComponentType.ProceduralPose, Components.proceduralPose());
    addComponent(world, entity, ComponentType.CreatureRigPose, Components.creatureRigPose());
    addComponent(world, entity, ComponentType.PlayerControlled, Components.playerControlled());
    addComponent(world, entity, ComponentType.PlayerLifecycle, Components.playerLifecycle());
    addComponent(world, entity, ComponentType.PlayerIntent, Components.playerIntent());
    addComponent(world, entity, ComponentType.AbilityProgression, Components.abilityProgression(getDefaultUnlockedAbilityIds()));
    addComponent(world, entity, ComponentType.PounceCounterState, Components.pounceCounterState(ABILITIES[AbilityId.POUNCE_COUNTER]));
    addComponent(world, entity, ComponentType.AttackSet, Components.attackSet({
      bite: ABILITIES[AbilityId.BITE_CLAW],
      lunge: ABILITIES[AbilityId.BODY_LUNGE],
      smokeBurst: ABILITIES[AbilityId.SMOKE_BURST],
      smokeSpit: ABILITIES[AbilityId.SMOKE_SPIT],
      pounce: ABILITIES[AbilityId.POUNCE_COUNTER]
    }));
    addComponent(world, entity, ComponentType.SmokeEmitter, Components.smokeEmitter(ABILITIES[AbilityId.SMOKE_BURST]));
    addComponent(world, entity, ComponentType.NapalmDripEmitter, Components.napalmDripEmitter(getNapalmDribbleRecipe(NapalmEmitterId.WYVERN_MOUTH_DRIBBLE)));
  }

  if (def.ai) {
    addComponent(world, entity, ComponentType.EnemyPressureAI, Components.enemyPressureAI({
      ...def.ai,
      attackProfileIds: def.attackProfileIds
    }, x, y));
  }

  return entity;
}

function resolveActorAudioEmitter(type, def, override = null) {
  const fallbackHeight = type === EntityKind.WEREWOLF ? 0.82 : type === EntityKind.YOUNG_DRAGON ? 0.48 : 1.42;
  return {
    emitterId: 'voice',
    profileId: AudioSpatialProfileId.CREATURE_VOICE,
    anchor: type === EntityKind.WEREWOLF ? 'mouth' : 'head',
    anchorHeightMeters: fallbackHeight,
    cueRoles: { ...(def.audioCueIds ?? {}), ...(override?.cueRoles ?? {}) },
    ...override
  };
}

function buildRecipeActorDefinition(actorDef, recipe, instance) {
  const primaryRole = recipe.surface.primaryMaterialRole;
  const primaryMaterial = recipe.surface.materialRoles[primaryRole];
  return {
    ...actorDef,
    hp: recipe.physical.health,
    speed: recipe.physical.speed,
    radius: recipe.physical.collider.radius,
    colour: instance.appearance.palette[primaryRole] ?? recipe.surface.colour,
    stroke: recipe.surface.stroke,
    materialProfileId: primaryMaterial.profileId,
    silhouette: recipe.surface.silhouette,
    lightReadabilityProfileId: recipe.surface.lightReadabilityProfileId,
    humanoidProjection: recipe.bodyPlan.profileId,
    lightEmitter: instance.gameplay.lightEmitterId,
    locomotionProfileId: recipe.locomotion.profileId,
    attackProfileIds: recipe.attacks.map((entry) => entry.profileId),
    physics: recipe.physical.physics,
    ai: recipe.behaviour.parameters,
    audioCueIds: { ...recipe.audio.cues }
  };
}

function stableCoordinate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(4) : 'invalid';
}

export function spawnSmokeCloud(world, x, y, smokeData, diagnostics = null) {
  enforceEntityBudget(world, ComponentType.SmokeCloud, RENDER_BUDGETS.smokeClouds.maxActive, diagnostics, 'droppedSmokeClouds');
  const entity = createEntity(world, EntityKind.SMOKE_CLOUD);
  addComponent(world, entity, ComponentType.Kind, Components.kind(EntityKind.SMOKE_CLOUD, 'Smoke'));
  addComponent(world, entity, ComponentType.Transform, Components.transform(x, y));
  addComponent(world, entity, ComponentType.SmokeCloud, Components.smokeCloud(smokeData.radius, smokeData.slowMultiplier, smokeData));
  addComponent(world, entity, ComponentType.Lifetime, Components.lifetime(smokeData.duration));
  return entity;
}

export function spawnEffect(world, { kind, x, y, radius, lifetime, hits = 0, recipeId = null, style = {} }, diagnostics = null) {
  enforceEntityBudget(world, ComponentType.Effect, RENDER_BUDGETS.liveEffects.maxActive, diagnostics, 'droppedLiveEffects');
  const entity = createEntity(world, EntityKind.EFFECT);
  addComponent(world, entity, ComponentType.Kind, Components.kind(EntityKind.EFFECT, kind));
  addComponent(world, entity, ComponentType.Transform, Components.transform(x, y));
  addComponent(world, entity, ComponentType.Effect, Components.effect({ kind, radius, hits, recipeId, style }));
  addComponent(world, entity, ComponentType.Lifetime, Components.lifetime(lifetime));
  return entity;
}

export function spawnVisualRecipe(game, recipeId, { x, y, radius = 1, hits = 0, directionX = 0, directionY = 0 }) {
  const recipe = getVisualRecipe(recipeId);
  const diagnostics = game.renderLayers?.diagnostics ?? null;
  const spawned = { effects: [], decals: [] };

  for (const effect of recipe.liveEffects ?? []) {
    spawned.effects.push(spawnEffect(game.world, {
      kind: effect.kind,
      x,
      y,
      radius: radius * (effect.radiusScale ?? 1),
      lifetime: effect.lifetime,
      hits,
      recipeId,
      style: buildVisualEffectStyle(effect, directionX, directionY)
    }, diagnostics));
  }

  for (const decal of recipe.decals ?? []) {
    if ((decal.minHits ?? 0) > hits) continue;
    const stamp = addDecalStamp(game.renderLayers, {
      kind: decal.kind,
      x,
      y,
      radius: radius * (decal.radiusScale ?? 1),
      colour: decal.colour,
      opacity: decal.opacity,
      rimColour: decal.rimColour,
      softness: decal.softness,
      visualMaterial: decal.visualMaterial,
      poolShape: decal.poolShape
    });
    if (stamp) spawned.decals.push(stamp);
  }

  return spawned;
}

function buildVisualEffectStyle(effect, directionX, directionY) {
  const { kind, radiusScale, lifetime, ...style } = effect;
  if (Number.isFinite(directionX) && Number.isFinite(directionY)) {
    style.directionX = directionX;
    style.directionY = directionY;
  }
  return style;
}

function enforceEntityBudget(world, componentType, maxActive, diagnostics, diagnosticKey) {
  const entities = query(world, [componentType, ComponentType.Lifetime])
    .map((entity) => ({ entity, age: getComponent(world, entity, ComponentType.Lifetime)?.age ?? 0 }))
    .sort((a, b) => b.age - a.age);
  if (entities.length < maxActive) return;
  const dropCount = entities.length - maxActive + 1;
  for (const entry of entities.slice(0, dropCount)) removeEntity(world, entry.entity);
  if (diagnostics && diagnosticKey) diagnostics[diagnosticKey] = (diagnostics[diagnosticKey] ?? 0) + dropCount;
}
