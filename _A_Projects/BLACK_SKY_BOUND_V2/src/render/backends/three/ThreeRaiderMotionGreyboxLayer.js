import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';

export const THREE_RAIDER_MOTION_GREYBOX_CONTRACT = 'black-sky-bound.three-raider-physical-motion-greybox.v0';

const UP = new THREE.Vector3(0, 1, 0);
const SEGMENTS = Object.freeze([
  ['hips', 'chest', 'core'], ['chest', 'head', 'attention'],
  ['leftShoulder', 'rightShoulder', 'core'], ['leftHip', 'rightHip', 'pelvis'],
  ['leftShoulder', 'leftElbow', 'limb'], ['leftElbow', 'leftHand', 'limb'],
  ['rightShoulder', 'rightElbow', 'limb'], ['rightElbow', 'rightHand', 'limb'],
  ['leftHip', 'leftKnee', 'leg'], ['leftKnee', 'leftFoot', 'leg'],
  ['rightHip', 'rightKnee', 'leg'], ['rightKnee', 'rightFoot', 'leg'],
  ['spearButt', 'spearTip', 'weapon']
]);
const MASSES = Object.freeze([
  ['hips', 'pelvis', [0.25, 0.18, 0.2]],
  ['chest', 'core', [0.33, 0.27, 0.21]],
  ['head', 'attention', [0.125, 0.15, 0.12]],
  ['leftHand', 'hand', [0.075, 0.075, 0.075]],
  ['rightHand', 'hand', [0.075, 0.075, 0.075]],
  ['leftFoot', 'foot', [0.145, 0.065, 0.22]],
  ['rightFoot', 'foot', [0.145, 0.065, 0.22]]
]);

export class ThreeRaiderMotionGreyboxLayer {
  constructor(root, enabled = false) {
    this.enabled = !!enabled;
    this.root = new THREE.Group();
    this.root.name = 'actors:raider-physical-motion-greybox';
    this.root.userData.contract = THREE_RAIDER_MOTION_GREYBOX_CONTRACT;
    this.root.visible = this.enabled;
    root.add(this.root);
    this.entries = new Map();
    this.segmentGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
    this.massGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.contactGeometry = new THREE.CylinderGeometry(1, 1, 0.035, 20, 1, false);
    this.markerGeometry = new THREE.OctahedronGeometry(1, 0);
    this.stageGeometry = new THREE.BoxGeometry(4.8, 0.018, 4.8);
    this.materials = createMaterials();
    this.stats = emptyStats(this.enabled);
    this.topologyBuilds = 0;
  }

  update(actors = []) {
    if (!this.enabled) {
      this.stats = emptyStats(false);
      return;
    }
    const active = new Set();
    let segmentCount = 0;
    let plantedContactCount = 0;
    let supportFoot = null;
    let attackPhase = 'idle';
    let impactFrozen = false;
    let predictionClamped = false;
    for (const actor of actors) {
      if (actor.humanoidProjection?.physicalMotion?.poseEnabled !== true || !actor.humanoidProjection?.points?.chest) continue;
      active.add(actor.id);
      let entry = this.entries.get(actor.id);
      if (!entry) {
        entry = this.createEntry(actor.id);
        this.entries.set(actor.id, entry);
      }
      this.updateEntry(entry, actor);
      segmentCount += SEGMENTS.length;
      const motion = actor.humanoidProjection.physicalMotion;
      plantedContactCount += Number(motion.contacts?.left?.planted === true) + Number(motion.contacts?.right?.planted === true);
      supportFoot = motion.locomotion?.supportFoot ?? supportFoot;
      attackPhase = motion.weapon?.phase ?? attackPhase;
      impactFrozen ||= motion.weapon?.committed === true;
      predictionClamped ||= motion.weapon?.predictionClamped === true;
    }
    for (const [id, entry] of this.entries) {
      if (active.has(id)) continue;
      entry.group.removeFromParent();
      this.entries.delete(id);
    }
    this.stats = {
      contract: THREE_RAIDER_MOTION_GREYBOX_CONTRACT,
      enabled: true,
      actorCount: active.size,
      segmentCount,
      massCount: active.size * MASSES.length,
      contactMarkerCount: active.size * 2,
      plantedContactCount,
      supportFoot,
      attackPhase,
      impactFrozen,
      predictionClamped,
      topologyBuilds: this.topologyBuilds,
      weaponProofLengthMeters: 1.55,
      visualPolicy: 'one_body_one_spear_coloured_constraint_geometry_no_finished_attachments'
    };
  }

  createEntry(id) {
    const group = new THREE.Group();
    group.name = `raider-motion-greybox:${id}`;
    const stage = new THREE.Mesh(this.stageGeometry, this.materials.stage);
    stage.name = 'flat-terrain-proof-stage';
    stage.position.y = 0.04;
    stage.renderOrder = -1;
    group.add(stage);
    const segments = SEGMENTS.map(([, , role]) => {
      const mesh = new THREE.Mesh(this.segmentGeometry, this.materials[role]);
      mesh.castShadow = role === 'core' || role === 'pelvis';
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    });
    const masses = MASSES.map(([, role]) => {
      const mesh = new THREE.Mesh(role === 'pelvis' || role === 'core' || role === 'foot' ? this.boxGeometry : this.massGeometry, this.materials[role]);
      mesh.castShadow = role === 'pelvis' || role === 'core';
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    });
    const contacts = ['left', 'right'].map(() => {
      const mesh = new THREE.Mesh(this.contactGeometry, this.materials.planted);
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    });
    const pelvisMarker = new THREE.Mesh(this.markerGeometry, this.materials.com);
    pelvisMarker.scale.setScalar(0.11);
    group.add(pelvisMarker);
    const impactMarker = new THREE.Mesh(this.markerGeometry, this.materials.impact);
    impactMarker.scale.setScalar(0.15);
    group.add(impactMarker);
    const spearHead = new THREE.Mesh(this.markerGeometry, this.materials.weaponHead);
    spearHead.scale.set(0.055, 0.09, 0.055);
    group.add(spearHead);
    const path = new THREE.Mesh(this.segmentGeometry, this.materials.path);
    group.add(path);
    const directions = ['travel', 'chest', 'head'].map((role) => {
      const mesh = new THREE.Mesh(this.segmentGeometry, this.materials[role]);
      group.add(mesh);
      return mesh;
    });
    this.root.add(group);
    this.topologyBuilds += 1;
    return { group, stage, segments, masses, contacts, pelvisMarker, impactMarker, spearHead, path, directions };
  }

  updateEntry(entry, actor) {
    const points = actor.humanoidProjection.points;
    const physical = actor.humanoidProjection.physicalMotion;
    entry.stage.position.x = physical.pelvis.x * WORLD_SCALE.tileMeters;
    entry.stage.position.z = physical.pelvis.y * WORLD_SCALE.tileMeters;
    SEGMENTS.forEach(([from, to, role], index) => {
      let a = actorPoint(points[from]);
      const b = actorPoint(points[to]);
      if (role === 'weapon') a = b.clone().add(a.sub(b).normalize().multiplyScalar(1.55));
      const radius = role === 'weapon' ? 0.038 : role === 'core' ? 0.115 : role === 'pelvis' ? 0.09 : role === 'leg' ? 0.062 : 0.055;
      placeSegment(entry.segments[index], a, b, radius);
    });
    MASSES.forEach(([name, , dimensions], index) => {
      const mesh = entry.masses[index];
      mesh.position.copy(actorPoint(points[name]));
      mesh.scale.set(...dimensions);
      mesh.rotation.y = -(physical.attention?.chestFacing ?? actor.rotation ?? 0);
    });
    for (const [index, name] of ['left', 'right'].entries()) {
      const contact = physical.contacts?.[name];
      const marker = entry.contacts[index];
      marker.position.set(contact.x * WORLD_SCALE.tileMeters, 0.062, contact.y * WORLD_SCALE.tileMeters);
      marker.scale.set(contact.support ? 0.17 : 0.13, 1, contact.support ? 0.17 : 0.13);
      marker.material = contact.support ? this.materials.support : contact.planted ? this.materials.planted : this.materials.swing;
    }
    entry.pelvisMarker.position.set(physical.pelvis.x * WORLD_SCALE.tileMeters, 1.02, physical.pelvis.y * WORLD_SCALE.tileMeters);
    entry.spearHead.position.copy(actorPoint(points.spearTip));
    const goal = physical.weapon?.frozenImpact ?? physical.weapon?.predictedImpact;
    entry.impactMarker.visible = !!goal;
    entry.path.visible = !!goal;
    if (goal) {
      entry.impactMarker.position.set(goal.x * WORLD_SCALE.tileMeters, 0.12, goal.y * WORLD_SCALE.tileMeters);
      entry.impactMarker.material = physical.weapon.committed ? this.materials.frozenImpact : this.materials.impact;
      const spearTip = actorPoint(points.spearTip);
      const groundTip = new THREE.Vector3(spearTip.x, 0.105, spearTip.z);
      placeSegment(entry.path, groundTip, new THREE.Vector3(goal.x * WORLD_SCALE.tileMeters, 0.105, goal.y * WORLD_SCALE.tileMeters), 0.04);
      entry.path.material = physical.weapon.committed ? this.materials.frozenPath : this.materials.path;
    }
    updateDirection(entry.directions[0], physical.pelvis, physical.locomotion.travelFacing, 0.18, 0.48);
    updateDirection(entry.directions[1], points.chest, physical.attention.chestFacing, points.chest.height, 0.42);
    updateDirection(entry.directions[2], points.head, physical.attention.headFacing, points.head.height, 0.32);
    entry.group.userData.physicalMotion = physical;
  }

  diagnostics() { return { ...this.stats }; }

  dispose() {
    this.entries.clear();
    this.segmentGeometry.dispose();
    this.massGeometry.dispose();
    this.boxGeometry.dispose();
    this.contactGeometry.dispose();
    this.markerGeometry.dispose();
    this.stageGeometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.root.removeFromParent();
  }
}

function createMaterials() {
  const standard = (colour) => new THREE.MeshBasicMaterial({ color: colour, toneMapped: false });
  return {
    core: standard(0x3aa7d8), pelvis: standard(0xe19a3d), attention: standard(0xdad3bd),
    limb: standard(0x79b8ce), leg: standard(0x6d8fa2), hand: standard(0xe06c55), foot: standard(0x78949d),
    weapon: standard(0xd8dddc), com: standard(0xffa83d), planted: standard(0x45b99a),
    support: standard(0x89efaa), swing: standard(0xf0bd55), impact: standard(0xff684a),
    frozenImpact: standard(0xffe36b), travel: standard(0x4f9f91), chest: standard(0x65c8ef), head: standard(0xf0dfad),
    weaponHead: standard(0xff8e4b), path: standard(0xff684a), frozenPath: standard(0xffe36b),
    stage: standard(0x3a4b54)
  };
}

function actorPoint(value) {
  return new THREE.Vector3(value.x * WORLD_SCALE.tileMeters, Number.isFinite(value.height) ? value.height : 1, value.y * WORLD_SCALE.tileMeters);
}

function updateDirection(mesh, origin, facing, height, length) {
  const a = new THREE.Vector3(origin.x * WORLD_SCALE.tileMeters, height, origin.y * WORLD_SCALE.tileMeters);
  const b = new THREE.Vector3(a.x + Math.cos(facing) * length, a.y, a.z + Math.sin(facing) * length);
  placeSegment(mesh, a, b, 0.012);
}

function placeSegment(mesh, a, b, radius) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(0.0001, direction.length());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.scale.set(radius, length, radius);
}

function emptyStats(enabled) {
  return {
    contract: THREE_RAIDER_MOTION_GREYBOX_CONTRACT,
    enabled,
    actorCount: 0,
    segmentCount: 0,
    massCount: 0,
    contactMarkerCount: 0,
    plantedContactCount: 0,
    supportFoot: null,
    attackPhase: 'idle',
    impactFrozen: false,
    predictionClamped: false,
    topologyBuilds: 0,
    weaponProofLengthMeters: 1.55,
    visualPolicy: 'one_body_one_spear_coloured_constraint_geometry_no_finished_attachments'
  };
}
