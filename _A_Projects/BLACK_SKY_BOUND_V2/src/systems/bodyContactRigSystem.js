import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { createCapsuleCollision, createCircleCollision } from '../physics/collisionShapes.js';
import { EnemyAttackPhase, getEnemyAttackProfile } from '../data/enemyAttackProfiles.js';

export const BODY_CONTACT_RIG_CONTRACT = 'black-sky-bound.body-contact-rig.v1';

export function bodyContactRigSystem({ game }) {
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.Collider, ComponentType.BodyContactRig])) {
    solveBodyContactRig(game.world, entity);
  }
}

export function solveBodyContactRig(world, entity) {
  const transform = getComponent(world, entity, ComponentType.Transform);
  const collider = getComponent(world, entity, ComponentType.Collider);
  const rig = getComponent(world, entity, ComponentType.BodyContactRig);
  if (!transform || !collider || !rig) return null;
  const forward = { x: Math.cos(transform.rotation ?? 0), y: Math.sin(transform.rotation ?? 0) };
  const bodyRadius = Math.max(0.05, Number(collider.radius ?? rig.bodyRadius ?? 0));
  const halfLength = bodyRadius * 0.32;
  rig.contract = BODY_CONTACT_RIG_CONTRACT;
  rig.broadPhase = createCapsuleCollision(
    transform.x - forward.x * halfLength, transform.y - forward.y * halfLength,
    transform.x + forward.x * halfLength, transform.y + forward.y * halfLength,
    bodyRadius * 0.76,
    { entity, role: 'locomotion_body', policy: 'stable_planar_body_capsule' }
  );
  rig.hurtVolumes = solveHurtVolumes(world, entity, transform, bodyRadius);
  rig.attackVolumes = solveAttackVolumes(world, entity, rig, transform, forward, bodyRadius);
  rig.poseSource = resolvePoseSource(world, entity);
  rig.solvedFrame = (rig.solvedFrame ?? 0) + 1;
  return rig;
}

function resolvePoseSource(world, entity) {
  if (getComponent(world, entity, ComponentType.CreatureRigPose)) return 'simulation_creature_rig_pose';
  if (getComponent(world, entity, ComponentType.HumanoidProjection)) return 'simulation_humanoid_pose';
  if (getComponent(world, entity, ComponentType.PredatorProjection)) return 'simulation_predator_pose';
  return 'stable_body_capsule_fallback';
}

function solveHurtVolumes(world, entity, transform, radius) {
  const wyvern = getComponent(world, entity, ComponentType.CreatureRigPose);
  const humanoid = getComponent(world, entity, ComponentType.HumanoidProjection);
  const predator = getComponent(world, entity, ComponentType.PredatorProjection);
  if (wyvern?.axial?.chest) {
    const chest = wyvern.axial.chest;
    const hips = wyvern.axial.hips ?? chest;
    const head = wyvern.head?.center ?? wyvern.axial.head;
    return [
      createCapsuleCollision(chest.x, chest.y, hips.x, hips.y, Math.max(radius * 0.5, wyvern.body?.torsoWidth ?? 0), { entity, role: 'torso_hurt' }),
      createCircleCollision(head.x, head.y, Math.max(radius * 0.34, head.width ?? 0), { entity, role: 'head_hurt' })
    ];
  }
  if (humanoid?.points?.chest) {
    const points = humanoid.points;
    return [
      createCapsuleCollision(points.chest.x, points.chest.y, points.hips.x, points.hips.y, radius * 0.56, { entity, role: 'torso_hurt' }),
      createCircleCollision(points.head.x, points.head.y, Math.max(radius * 0.34, points.head.radius ?? 0), { entity, role: 'head_hurt' })
    ];
  }
  if (predator?.points?.chest) {
    const points = predator.points;
    return [
      createCapsuleCollision(points.chest.x, points.chest.y, points.hips.x, points.hips.y, radius * 0.62, { entity, role: 'body_hurt' }),
      createCircleCollision(points.head.x, points.head.y, Math.max(radius * 0.3, points.head.radius ?? 0), { entity, role: 'head_hurt' })
    ];
  }
  return [createCircleCollision(transform.x, transform.y, radius, { entity, role: 'body_hurt_fallback' })];
}

function solveAttackVolumes(world, entity, rig, transform, forward, radius) {
  const pose = getComponent(world, entity, ComponentType.ProceduralPose);
  if (pose?.attackContact?.active) {
    const contact = pose.attackContact;
    const point = { x: Number(contact.x ?? transform.x), y: Number(contact.y ?? transform.y) };
    const previous = rig.previousAttackPoint ?? point;
    rig.previousAttackPoint = point;
    return [createCapsuleCollision(previous.x, previous.y, point.x, point.y, Math.max(0.05, Number(contact.contactSize?.width ?? radius) * 0.5), {
      entity, role: 'pose_driven_attack_sweep', actionId: contact.actionId, contactBodyPart: contact.contactBodyPart,
      policy: 'fixed_step_swept_contact_once_per_authored_window'
    })];
  }
  const ai = getComponent(world, entity, ComponentType.EnemyPressureAI);
  if (ai?.attackPhase === EnemyAttackPhase.ACTIVE && ai.activeAttackProfileId) {
    const profile = getEnemyAttackProfile(ai.activeAttackProfileId);
    const endpoint = resolveEnemyEndpoint(world, entity, profile, transform, forward);
    const previous = rig.previousAttackPoint ?? { x: transform.x, y: transform.y };
    rig.previousAttackPoint = endpoint;
    return [createCapsuleCollision(previous.x, previous.y, endpoint.x, endpoint.y, Math.max(0.08, profile.hitShape?.halfWidth ?? radius * 0.42), {
      entity, role: 'pose_driven_weapon_sweep', profileId: profile.id, socket: profile.strikeEndpointSocket,
      policy: 'fixed_step_swept_contact_once_per_authored_window'
    })];
  }
  rig.previousAttackPoint = null;
  return [];
}

function resolveEnemyEndpoint(world, entity, profile, transform, forward) {
  const humanoid = getComponent(world, entity, ComponentType.HumanoidProjection);
  const predator = getComponent(world, entity, ComponentType.PredatorProjection);
  const key = profile.strikeEndpointSocket;
  const socket = humanoid?.sockets?.[key]
    ?? socketAlias(humanoid?.points, key)
    ?? predator?.sockets?.[key]
    ?? socketAlias(predator?.points, key);
  if (Number.isFinite(socket?.x) && Number.isFinite(socket?.y)) return { x: socket.x, y: socket.y };
  return { x: transform.x + forward.x * profile.range, y: transform.y + forward.y * profile.range };
}

function socketAlias(points, key) {
  const aliases = {
    spear_tip_socket: 'spearTip', torch_flame_socket: 'torchFlame', claw_hand_midpoint_socket: 'rightHand',
    muzzle_socket: 'muzzle', body_front_socket: 'head', chest_socket: 'chest'
  };
  return points?.[aliases[key]] ?? null;
}
