import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';

export const WYVERN_BONE_POSE_ADAPTER_CONTRACT = 'black-sky-bound.wyvern-bone-pose-adapter.v3';

export const REQUIRED_WYVERN_BONES = Object.freeze([
  'body_hips', 'body_chest', 'neck', 'head', 'jaw',
  'tail_0', 'tail_1', 'tail_2', 'tail_3', 'tail_4',
  'wing_upper_L', 'wing_fore_L',
  'wing_digit_0_L', 'wing_digit_1_L', 'wing_digit_2_L', 'wing_digit_3_L',
  'hind_upper_L', 'hind_lower_L', 'hind_foot_L',
  'wing_upper_R', 'wing_fore_R',
  'wing_digit_0_R', 'wing_digit_1_R', 'wing_digit_2_R', 'wing_digit_3_R',
  'hind_upper_R', 'hind_lower_R', 'hind_foot_R'
]);

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const MODEL_SCALE = 1.22;
const HIP_HEIGHT = 0.16;
const TAIL_HEIGHTS = Object.freeze([0.16, 0.13, 0.1, 0.075, 0.055, 0.04]);
const TAIL_YAWS = Object.freeze([0.08, 0.11, 0.04, -0.08, -0.14]);

/**
 * Adapts renderer-neutral procedural points to the imported Blender rig.
 *
 * The exported mesh owns its grounded proportions and folded bind pose. Runtime
 * projection owns facing and articulation, but must not stretch the authored
 * surface onto every primitive point; doing so turns the continuous membrane
 * into a star-shaped cape. This adapter therefore aligns the whole bind pose to
 * the actor, resets exact local rest transforms each frame, and applies bounded
 * world-space aim rotations down each anatomical chain.
 */
export class ThreeWyvernBonePoseAdapter {
  constructor(scene) {
    this.scene = scene;
    this.armature = findArmature(scene);
    this.restLengths = readRestLengths(this.armature);
    this.bones = new Map();
    this.skinnedMeshes = [];
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.currentDirection = new THREE.Vector3();
    this.restForward = new THREE.Vector3();
    this.targetForward = new THREE.Vector3();
    this.restHip = new THREE.Vector3();
    this.restChest = new THREE.Vector3();
    this.scaledHip = new THREE.Vector3();
    this.targetHip = new THREE.Vector3();
    this.worldQuaternion = new THREE.Quaternion();
    this.parentQuaternion = new THREE.Quaternion();
    this.headingQuaternion = new THREE.Quaternion();
    this.deltaQuaternion = new THREE.Quaternion();
    this.blendedDelta = new THREE.Quaternion();
    this.targetWorldQuaternion = new THREE.Quaternion();
    this.localQuaternion = new THREE.Quaternion();
    this.jawDelta = new THREE.Quaternion();
    this.identityQuaternion = new THREE.Quaternion();
    this.poseUpdates = 0;

    scene.updateMatrixWorld(true);
    const sceneInverse = scene.matrixWorld.clone().invert();
    scene.traverse((object) => {
      if (object.isSkinnedMesh) this.skinnedMeshes.push(object);
      if (!object.isBone) return;
      const restLength = Number(this.restLengths[object.name]);
      if (!Number.isFinite(restLength) || restLength <= 0) return;
      const sceneMatrix = new THREE.Matrix4().multiplyMatrices(sceneInverse, object.matrixWorld);
      const scenePosition = new THREE.Vector3();
      const sceneQuaternion = new THREE.Quaternion();
      const sceneScale = new THREE.Vector3();
      sceneMatrix.decompose(scenePosition, sceneQuaternion, sceneScale);
      this.bones.set(object.name, {
        bone: object,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
        scenePosition,
        sceneQuaternion,
        length: restLength
      });
    });

    const missing = REQUIRED_WYVERN_BONES.filter((name) => !this.bones.has(name));
    if (missing.length) throw new Error(`baby_wyvern_bones_missing:${missing.join(',')}`);
    if (this.skinnedMeshes.length !== 1) throw new Error(`baby_wyvern_skinned_mesh_count:${this.skinnedMeshes.length}`);
    this.restHip.copy(this.bones.get('body_hips').scenePosition);
    this.restChest.copy(this.bones.get('body_chest').scenePosition);
    this.restForward.subVectors(this.restChest, this.restHip).setY(0).normalize();
  }

  apply(rig, poseState = {}) {
    const axial = rig?.axial ?? {};
    const head = rig?.head ?? {};
    if (!axial.hips || !axial.chest || !this.alignModel(axial.hips, axial.chest)) return false;
    this.resetBindPose();

    const actionId = poseState?.actionId ?? null;
    const biting = actionId === 'bite_attack';
    const actionPhase = clamp(Number(poseState?.phase) || 0, 0, 1);
    const biteExtension = biting ? smoothstep(0.14, 0.38, actionPhase) : 0;
    this.aim('neck', axial.neck, axial.head, 0.29, 0.34, 0.18 + biteExtension * 0.48);
    this.aim('head', head.center ?? axial.head, head.muzzle, 0.34, 0.31, 0.22 + biteExtension * 0.58);
    this.extendHead(biteExtension);
    this.openJaw(Math.max(Number(head.jawOpen) || 0, biteExtension * 0.62));

    for (let index = 0; index < 5; index += 1) {
      this.aim(
        `tail_${index}`,
        rig.tail?.[index],
        rig.tail?.[index + 1],
        TAIL_HEIGHTS[index],
        TAIL_HEIGHTS[index + 1],
        0.3 + index * 0.055,
        TAIL_YAWS[index]
      );
    }

    for (const [sideName, suffix] of [['left', 'L'], ['right', 'R']]) {
      const wing = rig.wingForelimbs?.[sideName];
      const attacking = actionId === `${sideName}_claw_swipe`;
      const clawExtension = attacking ? smoothstep(0.14, 0.36, actionPhase) : 0;
      const upperBlend = 0.035 + clawExtension * 0.72;
      const foreBlend = 0.055 + clawExtension * 0.82;
      const elbowHeight = lerp(0.13, 0.36, clawExtension);
      const wristHeight = lerp(0.035, 0.28, clawExtension);
      this.aim(`wing_upper_${suffix}`, wing?.shoulder, wing?.elbow, 0.25, elbowHeight, upperBlend);
      this.aim(`wing_fore_${suffix}`, wing?.elbow, wing?.wrist, elbowHeight, wristHeight, foreBlend);
      for (let index = 0; index < 4; index += 1) {
        this.aim(
          `wing_digit_${index}_${suffix}`,
          wing?.wrist,
          wing?.digits?.[index]?.tip,
          0.04,
          0.055,
          0.04 + clawExtension * (0.42 + index * 0.035)
        );
      }

      const leg = rig.hindLegs?.[sideName];
      const ankle = leg?.ankle ?? leg?.hock;
      const foot = leg?.foot ?? leg?.paw;
      const contact = Number(leg?.contactWeight ?? 0);
      const gaitBlend = 0.12 + clamp(contact, 0, 1) * 0.3;
      this.aim(`hind_upper_${suffix}`, leg?.hip, leg?.knee, 0.19, 0.105, gaitBlend);
      this.aim(`hind_lower_${suffix}`, leg?.knee, ankle, 0.105, 0.035, gaitBlend + 0.05);
      this.aim(`hind_foot_${suffix}`, ankle, foot, 0.035, 0.025, gaitBlend + 0.08);
    }

    this.scene.updateMatrixWorld(true);
    this.poseUpdates += 1;
    return true;
  }

  alignModel(hips, chest) {
    setPoint(this.targetHip, hips, HIP_HEIGHT);
    setPoint(this.a, hips, HIP_HEIGHT);
    setPoint(this.b, chest, HIP_HEIGHT);
    this.targetForward.subVectors(this.b, this.a).setY(0);
    if (this.targetForward.lengthSq() < 0.000001) return false;
    this.targetForward.normalize();
    this.headingQuaternion.setFromUnitVectors(this.restForward, this.targetForward);
    this.scene.scale.setScalar(MODEL_SCALE);
    this.scene.quaternion.copy(this.headingQuaternion);
    this.scaledHip.copy(this.restHip).multiplyScalar(MODEL_SCALE).applyQuaternion(this.headingQuaternion);
    this.scene.position.copy(this.targetHip).sub(this.scaledHip);
    this.scene.updateMatrixWorld(true);
    return true;
  }

  resetBindPose() {
    for (const rest of this.bones.values()) {
      rest.bone.position.copy(rest.position);
      rest.bone.quaternion.copy(rest.quaternion);
      rest.bone.scale.copy(rest.scale);
      rest.bone.updateMatrix();
    }
    this.scene.updateMatrixWorld(true);
  }

  aim(name, start, end, startHeight, endHeight, blend, yawBias = 0) {
    const rest = this.bones.get(name);
    if (!rest || !start || !end || blend <= 0) return false;
    setPoint(this.a, start, startHeight);
    setPoint(this.b, end, endHeight);
    this.direction.subVectors(this.b, this.a);
    if (this.direction.lengthSq() < 0.000001) return false;
    this.direction.normalize();
    if (yawBias) this.direction.applyAxisAngle(UP, yawBias).normalize();

    rest.bone.getWorldQuaternion(this.worldQuaternion);
    this.currentDirection.copy(UP).applyQuaternion(this.worldQuaternion).normalize();
    this.deltaQuaternion.setFromUnitVectors(this.currentDirection, this.direction);
    this.blendedDelta.copy(this.identityQuaternion).slerp(this.deltaQuaternion, clamp(blend, 0, 1));
    this.targetWorldQuaternion.copy(this.blendedDelta).multiply(this.worldQuaternion).normalize();
    rest.bone.parent.getWorldQuaternion(this.parentQuaternion).invert();
    this.localQuaternion.copy(this.parentQuaternion).multiply(this.targetWorldQuaternion).normalize();
    rest.bone.quaternion.copy(this.localQuaternion);
    rest.bone.updateMatrix();
    rest.bone.updateMatrixWorld(true);
    return true;
  }

  openJaw(value) {
    const rest = this.bones.get('jaw');
    const open = clamp(Number(value) || 0, 0, 0.72);
    if (!rest || open <= 0.005) return;
    this.jawDelta.setFromAxisAngle(X_AXIS, -open * 0.72);
    rest.bone.quaternion.copy(rest.quaternion).multiply(this.jawDelta).normalize();
    rest.bone.updateMatrix();
    rest.bone.updateMatrixWorld(true);
  }

  extendHead(extension) {
    const rest = this.bones.get('head');
    const amount = clamp(extension, 0, 1);
    if (!rest || amount <= 0.005) return;
    rest.bone.position.copy(rest.position);
    rest.bone.position.y += 0.052 * amount;
    rest.bone.scale.copy(rest.scale).multiplyScalar(1 + amount * 0.1);
    rest.bone.updateMatrix();
    rest.bone.updateMatrixWorld(true);
  }

  diagnostics() {
    return {
      contract: WYVERN_BONE_POSE_ADAPTER_CONTRACT,
      hierarchyPolicy: 'authored_grounded_bind_with_bounded_local_aim_v3',
      modelScale: MODEL_SCALE,
      requiredBoneCount: REQUIRED_WYVERN_BONES.length,
      boundBoneCount: this.bones.size,
      skinnedMeshCount: this.skinnedMeshes.length,
      poseUpdates: this.poseUpdates
    };
  }
}

function findArmature(scene) {
  let armature = null;
  scene.traverse((object) => {
    if (object.userData?.bsb_contract === 'black-sky-bound.skinned-baby-wyvern.v2' && object.userData?.bsb_rest_lengths_json) armature = object;
  });
  if (!armature) throw new Error('baby_wyvern_armature_contract_missing');
  return armature;
}

function readRestLengths(armature) {
  try { return JSON.parse(armature.userData.bsb_rest_lengths_json); }
  catch { throw new Error('baby_wyvern_rest_lengths_invalid'); }
}

function setPoint(target, point, height) {
  target.set(Number(point?.x ?? 0) * WORLD_SCALE.tileMeters, height, Number(point?.y ?? 0) * WORLD_SCALE.tileMeters);
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function lerp(start, end, amount) { return start + (end - start) * amount; }
function smoothstep(minimum, maximum, value) {
  const t = clamp((value - minimum) / Math.max(0.000001, maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
}
