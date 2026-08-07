import { ComponentType } from '../constants/componentTypes.js';
import { EventType } from '../constants/eventTypes.js';
import { getComponent } from '../ecs/world.js';
import { emitEvent } from '../ecs/events.js';
import { query } from '../ecs/query.js';
import { applyDamageToEntity } from './healthSystem.js';
import { aliveEnemyEntities } from './combatSystem.js';
import { getWyvernActionProfile } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { VisualRecipeId } from '../data/visualRecipes.js';
import { spawnVisualRecipe } from '../game/spawn.js';
import { applyImpactToReceiver } from './impactResponseState.js';
import { collisionShapesIntersect } from '../physics/collisionShapes.js';

export function wyvernAttackContactSystem({ game }) {
  for (const source of query(game.world, [ComponentType.ActionState, ComponentType.ProceduralPose, ComponentType.AttackSet, ComponentType.Team])) {
    const actionState = getComponent(game.world, source, ComponentType.ActionState);
    const pose = getComponent(game.world, source, ComponentType.ProceduralPose);
    const attacks = getComponent(game.world, source, ComponentType.AttackSet);
    if (!actionState?.active || !pose?.attackContact?.active) continue;
    const profile = getWyvernActionProfile(actionState.actionId);
    const ability = attacks?.[profile?.abilitySlot];
    if (!profile || !ability) continue;
    for (const target of aliveEnemyEntities(game, source)) {
      if (target === source || actionState.resolvedContacts.includes(target)) continue;
      if (!entityIntersectsAttackContact(game.world, target, pose.attackContact, source)) continue;
      resolveWyvernImpact(game, source, target, pose.attackContact, profile, ability);
      actionState.resolvedContacts.push(target);
    }
  }
}

export function entityIntersectsAttackContact(world, entity, contact, sourceEntity = contact?.sourceEntity) {
  const targetRig = getComponent(world, entity, ComponentType.BodyContactRig);
  const sourceRig = sourceEntity ? getComponent(world, sourceEntity, ComponentType.BodyContactRig) : null;
  if (sourceRig?.attackVolumes?.length && targetRig?.hurtVolumes?.length) {
    return sourceRig.attackVolumes.some((attack) => targetRig.hurtVolumes.some((hurt) => collisionShapesIntersect(attack, hurt)));
  }
  const transform = getComponent(world, entity, ComponentType.Transform);
  const collider = getComponent(world, entity, ComponentType.Collider);
  if (!transform || !contact?.active) return false;
  const radius = collider?.radius ?? 0;
  if (contact.contactShape === 'capsule') return intersectsCapsule(transform, radius, contact);
  if (contact.contactShape === 'front_arc_band') return intersectsFrontBand(transform, radius, contact);
  return intersectsBox(transform, radius, contact);
}

export function resolveWyvernImpact(game, source, target, contact, profile, ability) {
  const killed = applyDamageToEntity(game.world, target, ability.damage, source, ability.damageType);
  const status = getComponent(game.world, target, ComponentType.StatusEffects);
  if (status) status.panicTimer = Math.max(status.panicTimer ?? 0, ability.panicDuration ?? 0);
  const impact = getComponent(game.world, target, ComponentType.ImpactResponse);
  const applied = applyImpactResponse(impact, contact, source, target, profile);
  spawnImpactVisualRecipe(game, target, contact, profile, ability, killed);
  emitEvent(game.world, EventType.IMPACT_APPLIED, {
    source,
    target,
    actionId: profile.id,
    contactBodyPart: contact.contactBodyPart,
    contactShape: contact.contactShape,
    phase: contact.phase,
    impulse: applied.impulse,
    stagger: applied.stagger,
    killed
  });
  return { killed, ...applied };
}

function spawnImpactVisualRecipe(game, target, contact, profile, ability, killed) {
  const recipeId = impactRecipeId(profile);
  if (!recipeId) return;
  const transform = getComponent(game.world, target, ComponentType.Transform);
  const collider = getComponent(game.world, target, ComponentType.Collider);
  const radius = Math.max(
    0.35,
    collider?.radius ?? 0,
    ability?.radius ?? 0,
    contact?.contactSize?.width ?? 0
  ) * (killed ? 1.12 : 1);
  const direction = contact?.impactDirectionVector ?? contact?.forward ?? { x: 0, y: 0 };
  spawnVisualRecipe(game, recipeId, {
    x: transform?.x ?? contact.x,
    y: transform?.y ?? contact.y,
    radius,
    hits: killed ? 2 : 1,
    directionX: direction.x ?? 0,
    directionY: direction.y ?? 0
  });
}

function impactRecipeId(profile) {
  if (profile?.abilitySlot === 'lunge' || profile?.abilitySlot === 'charge') return VisualRecipeId.BODY_LUNGE;
  if (profile?.abilitySlot === 'bite') return VisualRecipeId.BITE_HIT;
  return null;
}

export function applyImpactResponse(impact, contact, source, target, profile) {
  return applyImpactToReceiver(impact, {
    source,
    target,
    actionId: profile.id,
    contactBodyPart: contact.contactBodyPart,
    impactDirection: contact.impactDirection,
    directionX: contact.impactDirectionVector.x,
    directionY: contact.impactDirectionVector.y,
    impactStrength: contact.impactStrength,
    staggerStrength: contact.staggerStrength,
    phase: contact.phase
  });
}

function intersectsCapsule(transform, radius, contact) {
  const length = contact.contactSize.length;
  const width = contact.contactSize.width;
  const a = {
    x: contact.x - contact.forward.x * length * 0.5,
    y: contact.y - contact.forward.y * length * 0.5
  };
  const b = {
    x: contact.x + contact.forward.x * length * 0.5,
    y: contact.y + contact.forward.y * length * 0.5
  };
  return pointSegmentDistance({ x: transform.x, y: transform.y }, a, b) <= width * 0.5 + radius;
}

function intersectsFrontBand(transform, radius, contact) {
  const dx = transform.x - contact.x;
  const dy = transform.y - contact.y;
  const localForward = dx * contact.forward.x + dy * contact.forward.y;
  const localRight = dx * contact.right.x + dy * contact.right.y;
  return localForward >= -contact.contactSize.length * 0.45 - radius
    && localForward <= contact.contactSize.length * 0.65 + radius
    && Math.abs(localRight) <= contact.contactSize.width * 0.5 + radius;
}

function intersectsBox(transform, radius, contact) {
  const dx = transform.x - contact.x;
  const dy = transform.y - contact.y;
  const localForward = Math.abs(dx * contact.forward.x + dy * contact.forward.y);
  const localRight = Math.abs(dx * contact.right.x + dy * contact.right.y);
  return localForward <= contact.contactSize.length * 0.5 + radius
    && localRight <= contact.contactSize.width * 0.5 + radius;
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  const px = a.x + dx * t;
  const py = a.y + dy * t;
  return Math.hypot(point.x - px, point.y - py);
}
