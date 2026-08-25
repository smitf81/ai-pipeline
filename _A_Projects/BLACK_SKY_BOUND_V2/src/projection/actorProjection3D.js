import { ACTORS } from '../data/actors.js';
import { MaterialFamily } from '../data/materialProfiles.js';
import { getCreatureProjectionRecipe } from '../data/creatureProjections.js';
import { getHumanoidProjectionProfile } from '../data/humanoids/raiderHumanoid.js';
import { getPredatorProjectionProfile } from '../data/creatures/werewolfPredator.js';
import { getCreatureAttachment } from '../data/creatures/creatureAttachments.js';
import { getCreatureRecipe, resolveCreatureHumanoidProfile } from '../data/creatures/creatureRecipes.js';
import {
  buildActorMaterialState,
  buildMaterialProjection
} from './materialProjection.js';

export const ACTOR_PROJECTION_3D_CONTRACT = 'black-sky-bound.actor-projection-3d.v1';

export function buildActorProjection3D(actors, tileSize, creatureTuning = null) {
  return actors.filter((actor) => actor.alive || actor.team === 'player').map((actor) => {
    const def = ACTORS[actor.type] ?? {};
    const materialProfileId = actor.materialProfileId ?? def.materialProfileId ?? null;
    const raiderPhysicalMotion = projectRaiderPhysicalMotion(actor.raiderPhysicalMotion, tileSize);
    return {
      classification: 'renderer_neutral_actor_projection_3d',
      contract: ACTOR_PROJECTION_3D_CONTRACT,
      id: actor.id,
      authoredId: actor.authoredId ?? null,
      type: actor.type,
      team: actor.team,
      alive: !!actor.alive,
      x: actor.x,
      y: actor.y,
      worldX: actor.x * tileSize,
      worldY: actor.y * tileSize,
      radius: actor.radius,
      worldRadius: Math.max(2, actor.radius * tileSize),
      rotation: actor.rotation ?? 0,
      hp: actor.hp,
      maxHp: actor.maxHp,
      stamina: actor.stamina ?? null,
      dodgeState: actor.dodgeState ?? null,
      playerLifecycle: actor.playerLifecycle ?? null,
      bodyContactRig: actor.bodyContactRig ?? null,
      colour: actor.colour ?? def.colour ?? '#d8d8d8',
      stroke: actor.stroke ?? def.stroke ?? '#111111',
      materialProfileId,
      material: materialProfileId ? buildMaterialProjection(materialProfileId, {
        family: MaterialFamily.ENTITY,
        state: buildActorMaterialState(actor, actor.team),
        source: { kind: 'actor', id: actor.id, type: actor.type, team: actor.team }
      }) : null,
      role: actor.role ?? def.role ?? 'actor',
      silhouette: actor.silhouette ?? def.silhouette ?? 'marker',
      lightReadabilityProfileId: actor.lightReadabilityProfileId ?? def.lightReadabilityProfileId ?? null,
      enemyBehaviour: actor.enemyBehaviour ?? null,
      creatureRecipe: buildCreatureRecipeProjection(actor.creatureRecipe),
      raiderPhysicalMotion,
      wyvernProjection: buildWyvernVisualProjection(actor.wyvernProjection, tileSize, creatureTuning),
      humanoidProjection: buildHumanoidVisualProjection(actor.humanoidProjection, tileSize, creatureTuning, actor.creatureRecipe, raiderPhysicalMotion),
      predatorProjection: buildPredatorVisualProjection(actor.predatorProjection, tileSize),
      impactResponse: actor.impactResponse ?? null,
      lightEmitter: actor.lightEmitter ?? null
    };
  });
}

function buildPredatorVisualProjection(projection, tileSize) {
  if (!projection?.profileId) return null;
  const profile = getPredatorProjectionProfile(projection.profileId);
  return {
    classification: 'renderer_neutral_predator_visual_projection',
    profileId: projection.profileId,
    profile,
    gaitPhase: projection.gaitPhase ?? 0,
    idlePhase: projection.idlePhase ?? 0,
    movement01: projection.movement01 ?? 0,
    motionState: projection.motionState ?? 'idle',
    facing: projection.facing ?? 0,
    animationState: projection.animationState ?? null,
    attackState: projection.attackState ?? null,
    reactionState: projection.reactionState ?? null,
    partCount: projection.partCount ?? 0,
    points: projectPointMap(projection.points, tileSize),
    sockets: projectPointMap(projection.sockets, tileSize),
    visualBounds: projectBounds(projection.visualBounds, tileSize)
  };
}

function projectRaiderPhysicalMotion(intent, tileSize) {
  if (!intent?.contract) return null;
  const projected = JSON.parse(JSON.stringify(intent));
  projectPhysicalPoint(projected.pelvis, tileSize);
  projectPhysicalPoint(projected.contacts?.left, tileSize);
  projectPhysicalPoint(projected.contacts?.right, tileSize);
  projectPhysicalPoint(projected.weapon?.predictedImpact, tileSize);
  projectPhysicalPoint(projected.weapon?.frozenImpact, tileSize);
  if (projected.attention) {
    if (Number.isFinite(projected.attention.targetX)) projected.attention.worldTargetX = projected.attention.targetX * tileSize;
    if (Number.isFinite(projected.attention.targetY)) projected.attention.worldTargetY = projected.attention.targetY * tileSize;
  }
  return projected;
}

function projectPhysicalPoint(value, tileSize) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
  value.worldX = value.x * tileSize;
  value.worldY = value.y * tileSize;
}

function buildHumanoidVisualProjection(projection, tileSize, creatureTuning, creatureRecipe, raiderPhysicalMotion) {
  if (!projection?.profileId) return null;
  const profile = resolveCreatureHumanoidProfile(
    getHumanoidProjectionProfile(projection.profileId, creatureTuning),
    creatureRecipe
  );
  return {
    classification: 'renderer_neutral_humanoid_visual_projection',
    profileId: projection.profileId,
    embodimentId: profile.embodimentId ?? creatureRecipe?.bodyPlan?.embodimentId ?? null,
    profile,
    scaleProfileId: projection.scaleProfileId ?? profile.scaleProfileId,
    gaitPhase: projection.gaitPhase ?? 0,
    idlePhase: projection.idlePhase ?? 0,
    movement01: projection.movement01 ?? 0,
    motionState: projection.motionState ?? 'idle',
    facing: projection.facing ?? 0,
    collisionPolicy: projection.collisionPolicy ?? profile.collision.policy,
    shadowPolicy: projection.shadowPolicy ?? profile.shadow.policy,
    animationState: projection.animationState ?? null,
    attackState: projection.attackState ?? null,
    guardState: projection.guardState ?? null,
    reactionState: projection.reactionState ?? null,
    physicalMotion: raiderPhysicalMotion,
    motionTrails: (projection.motionTrails ?? []).map((sample) => ({
      ...sample,
      worldX: sample.x * tileSize,
      worldY: sample.y * tileSize
    })),
    partCount: projection.partCount ?? 0,
    points: projectPointMap(projection.points, tileSize),
    sockets: projectPointMap(projection.sockets, tileSize),
    visualBounds: projectBounds(projection.visualBounds, tileSize)
  };
}

function buildCreatureRecipeProjection(instance) {
  if (!instance?.recipeId) return null;
  const recipe = getCreatureRecipe(instance.recipeId);
  const attachments = Object.fromEntries(Object.entries(instance.appearance?.equipment ?? {})
    .filter(([, selection]) => selection?.attachmentId)
    .map(([slot, selection]) => [slot, getCreatureAttachment(selection.attachmentId)]));
  const materialRoles = Object.fromEntries(Object.entries(recipe.surface.materialRoles).map(([role, material]) => [role, {
    ...material,
    colour: instance.appearance.palette?.[role] ?? recipe.surface.colour
  }]));
  return {
    ...instance,
    classification: 'renderer_neutral_creature_recipe_projection',
    bodyPlan: recipe.bodyPlan,
    surface: {
      primaryMaterialRole: recipe.surface.primaryMaterialRole,
      materialRoles
    },
    attachments,
    audio: recipe.audio,
    death: recipe.death
  };
}

function buildWyvernVisualProjection(projection, tileSize, creatureTuning) {
  if (!projection?.recipeId) return null;
  const recipe = getCreatureProjectionRecipe(projection.recipeId, creatureTuning);
  return {
    classification: 'renderer_neutral_wyvern_visual_projection',
    recipeId: projection.recipeId,
    bodyPlan: recipe.bodyPlan,
    locomotion: recipe.locomotion,
    anatomyContract: {
      wingLimbRole: recipe.wingAnatomy.limbRole,
      wingGroundedContact: recipe.wingAnatomy.groundedContact,
      wingDigitOrigin: recipe.wingAnatomy.digitOrigin,
      wingMembraneAttachment: recipe.wingAnatomy.bodyAttachmentRole,
      hindLegRole: recipe.hindLegAnatomy.limbRole
    },
    proportions: { ...recipe.proportions },
    proportionProfile: recipe.proportionProfile,
    wingAnatomy: {
      ...recipe.wingAnatomy,
      digitLengths: [...recipe.wingAnatomy.digitLengths],
      digitOut: [...recipe.wingAnatomy.digitOut],
      digitBack: [...recipe.wingAnatomy.digitBack],
      sweepDigitOutAdd: [...(recipe.wingAnatomy.sweepDigitOutAdd ?? [])],
      sweepDigitBackRelax: [...(recipe.wingAnatomy.sweepDigitBackRelax ?? [])],
      digitKnuckleFractions: [...recipe.wingAnatomy.digitKnuckleFractions]
    },
    hindLegAnatomy: { ...recipe.hindLegAnatomy },
    palette: { ...recipe.palette },
    gaitPhase: projection.gaitPhase ?? 0,
    idlePhase: projection.idlePhase ?? 0,
    movement01: projection.movement01 ?? 0,
    motionState: projection.motionState ?? null,
    axialTurn: projection.axialTurn ?? null,
    malformedTurnFrameCount: projection.malformedTurnFrameCount ?? 0,
    actionState: projection.actionState ?? null,
    comboState: projection.comboState ?? null,
    limbRig: projection.limbRig ?? null,
    proceduralPose: buildProceduralPoseProjection(projection.proceduralPose, tileSize),
    rigPose: projectCreatureRigPose(projection.rigPose, tileSize),
    bodyPoints: (projection.bodyPoints ?? []).map((point) => ({
      role: point.role,
      x: point.x,
      y: point.y,
      worldX: point.x * tileSize,
      worldY: point.y * tileSize
    }))
  };
}

function projectPointMap(points, tileSize) {
  return Object.fromEntries(Object.entries(points ?? {}).map(([key, point]) => [key, {
    ...point,
    worldX: point.x * tileSize,
    worldY: point.y * tileSize,
    worldRadius: Number.isFinite(point.radius) ? point.radius * tileSize : undefined
  }]));
}

function projectBounds(bounds, tileSize) {
  if (!bounds) return null;
  return {
    ...bounds,
    worldMinX: bounds.minX * tileSize,
    worldMinY: bounds.minY * tileSize,
    worldMaxX: bounds.maxX * tileSize,
    worldMaxY: bounds.maxY * tileSize,
    worldWidth: bounds.width * tileSize,
    worldHeight: bounds.height * tileSize
  };
}

function buildProceduralPoseProjection(pose, tileSize) {
  if (!pose) return null;
  return {
    ...pose,
    classification: 'renderer_neutral_procedural_pose_projection',
    sockets: Object.fromEntries(Object.entries(pose.sockets ?? {}).map(([key, socket]) => [key, {
      ...socket,
      worldX: socket.x * tileSize,
      worldY: socket.y * tileSize
    }])),
    attackContact: pose.attackContact ? {
      ...pose.attackContact,
      worldX: pose.attackContact.x * tileSize,
      worldY: pose.attackContact.y * tileSize,
      worldLength: (pose.attackContact.contactSize?.length ?? 0) * tileSize,
      worldWidth: (pose.attackContact.contactSize?.width ?? 0) * tileSize
    } : null
  };
}

function projectCreatureRigPose(rigPose, tileSize) {
  if (!rigPose) return null;
  const projected = projectRigValue(rigPose, tileSize);
  projected.classification = 'renderer_neutral_creature_rig_projection';
  if (rigPose.visualBounds) projected.visualBounds = projectBounds(rigPose.visualBounds, tileSize);
  projectMetricFields(projected.body, tileSize, ['neckWidth', 'shoulderWidth', 'chestWidth', 'chestLength', 'torsoWidth', 'hipWidth', 'hipLength', 'haunchWidth', 'haunchLength', 'hipAnchorBack']);
  projectMetricFields(projected.head, tileSize, ['headLength', 'headWidth', 'jawLength', 'jawWidth', 'openingSeparation']);
  return projected;
}

function projectRigValue(value, tileSize) {
  if (Array.isArray(value)) return value.map((item) => projectRigValue(item, tileSize));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = projectRigValue(child, tileSize);
  if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
    result.worldX = value.x * tileSize;
    result.worldY = value.y * tileSize;
  }
  if (Number.isFinite(value.width)) result.worldWidth = value.width * tileSize;
  return result;
}

function projectMetricFields(target, tileSize, keys) {
  if (!target) return;
  for (const key of keys) {
    if (Number.isFinite(target[key])) target[`world${key[0].toUpperCase()}${key.slice(1)}`] = target[key] * tileSize;
  }
}
