import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { WORLD_SCALE } from '../../../data/worldScale.js';
import { HumanoidEmbodimentId } from '../../../data/humanoids/raiderHumanoid.js';

export const THREE_INK_HUMANOID_CONTRACT = 'black-sky-bound.three-ink-humanoid-layer.v1';

const HEAD_RING_SEGMENTS = 24;
const BODY_LINE_WIDTH_PX = 7;
const PROP_LINE_WIDTH_PX = 4;
const DEFAULT_RIGHT = new THREE.Vector3(1, 0, 0);
const DEFAULT_UP = new THREE.Vector3(0, 1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const BODY_INK = new THREE.Color('#000000');
const SPEAR_SHAFT = new THREE.Color('#5b3219');
const TORCH_SHAFT = new THREE.Color('#713816');

export class ThreeInkHumanoidLayer {
  constructor(root) {
    this.root = new THREE.Group();
    this.root.name = 'actors:ink-humanoids';
    this.root.userData.contract = THREE_INK_HUMANOID_CONTRACT;
    root.add(this.root);
    this.bodyLines = new DynamicWideLineBatch(this.root, 'ink-humanoid:body-and-head', BODY_LINE_WIDTH_PX);
    this.propLines = new DynamicWideLineBatch(this.root, 'ink-humanoid:prop-shafts', PROP_LINE_WIDTH_PX);
    this.spearheads = new DynamicInstancedBatch(
      this.root,
      'ink-humanoid:spearheads',
      new THREE.ConeGeometry(1, 1, 6, 1, false),
      new THREE.MeshStandardMaterial({ color: '#aeb9c2', roughness: 0.58, metalness: 0.28, flatShading: true })
    );
    this.flameOuter = new DynamicInstancedBatch(
      this.root,
      'ink-humanoid:flame-outer',
      new THREE.ConeGeometry(1, 2, 7, 1, false),
      new THREE.MeshBasicMaterial({ color: '#ff7a20', transparent: true, opacity: 0.88, depthWrite: false })
    );
    this.flameInner = new DynamicInstancedBatch(
      this.root,
      'ink-humanoid:flame-inner',
      new THREE.ConeGeometry(1, 2, 7, 1, false),
      new THREE.MeshBasicMaterial({ color: '#ffe3a3', transparent: true, opacity: 0.94, depthWrite: false })
    );
    this.stats = emptyStats();
  }

  update(actors = [], view = {}) {
    const bodySegments = [];
    const propSegments = [];
    const spearheads = [];
    const flameOuter = [];
    const flameInner = [];
    const recipeIds = new Set();
    const profileIds = new Set();
    const actorKinds = new Set();
    const missingPointErrors = [];
    const right = cameraAxis(view.cameraRight, DEFAULT_RIGHT);
    const up = cameraAxis(view.cameraUp, DEFAULT_UP);
    let readyActorCount = 0;
    let bodySegmentCount = 0;
    let headRingSegmentCount = 0;
    let nonFiniteSegmentCount = 0;

    for (const actor of actors) {
      if (actor.creatureRecipe?.recipeId) recipeIds.add(actor.creatureRecipe.recipeId);
      if (actor.humanoidProjection?.profileId) profileIds.add(actor.humanoidProjection.profileId);
      if (actor.type) actorKinds.add(actor.type);
      const points = actor.humanoidProjection?.points;
      if (!points?.chest || !points?.head) {
        missingPointErrors.push(`${actor.id}:production_pose_missing`);
        continue;
      }
      const bodyBefore = bodySegments.length;
      addBody(actor, bodySegments, BODY_INK, missingPointErrors);
      bodySegmentCount += bodySegments.length - bodyBefore;
      const ringBefore = bodySegments.length;
      addHollowHead(actor, bodySegments, BODY_INK, right, up, missingPointErrors);
      headRingSegmentCount += bodySegments.length - ringBefore;
      addProps(actor, propSegments, spearheads, flameOuter, flameInner, missingPointErrors);
      readyActorCount += 1;
    }

    for (const segment of [...bodySegments, ...propSegments]) {
      if (!finiteVector(segment.a) || !finiteVector(segment.b)) nonFiniteSegmentCount += 1;
    }
    this.bodyLines.update(bodySegments);
    this.propLines.update(propSegments);
    this.spearheads.update(spearheads);
    this.flameOuter.update(flameOuter);
    this.flameInner.update(flameInner);
    const batches = [this.bodyLines, this.propLines, this.spearheads, this.flameOuter, this.flameInner];
    this.stats = {
      contract: THREE_INK_HUMANOID_CONTRACT,
      embodimentId: HumanoidEmbodimentId.INK_STICK,
      actorCount: actors.length,
      readyActorCount,
      bodySegmentCount,
      headRingSegmentCount,
      propSegmentCount: propSegments.length,
      spearCount: spearheads.length,
      torchCount: flameOuter.length,
      flameCount: flameOuter.length + flameInner.length,
      drawFamilyCount: batches.filter((batch) => batch.count > 0).length,
      pooledDrawFamilyCount: batches.length,
      capacity: batches.reduce((sum, batch) => sum + batch.capacity, 0),
      allocations: batches.reduce((sum, batch) => sum + batch.allocations, 0),
      topologyBuilds: batches.reduce((sum, batch) => sum + batch.topologyBuilds, 0),
      topologyRebuilds: batches.reduce((sum, batch) => sum + batch.topologyRebuilds, 0),
      missingPointErrors,
      nonFiniteSegmentCount,
      recipeIds: [...recipeIds].sort(),
      profileIds: [...profileIds].sort(),
      actorKinds: [...actorKinds].sort(),
      equipmentPolicy: 'profile_owned_props_v1',
      colourPolicy: 'absolute_black_unlit_v1',
      bodyLineWidthPx: BODY_LINE_WIDTH_PX,
      propLineWidthPx: PROP_LINE_WIDTH_PX,
      lightReactiveActorCount: 0
    };
  }

  diagnostics() { return { ...this.stats, missingPointErrors: [...this.stats.missingPointErrors] }; }

  dispose() {
    this.bodyLines.dispose();
    this.propLines.dispose();
    this.spearheads.dispose();
    this.flameOuter.dispose();
    this.flameInner.dispose();
    this.root.removeFromParent();
  }
}

function addBody(actor, output, colour, errors) {
  const requiredPairs = [
    ['hips', 'chest'],
    ['leftShoulder', 'rightShoulder'],
    ['leftHip', 'rightHip'],
    ['leftShoulder', 'leftElbow'],
    ['leftElbow', 'leftHand'],
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightHand'],
    ['leftHip', 'leftKnee'],
    ['leftKnee', 'leftFoot'],
    ['rightHip', 'rightKnee'],
    ['rightKnee', 'rightFoot']
  ];
  for (const [from, to] of requiredPairs) addPointSegment(actor, output, from, to, colour, errors);
  addOptionalPointSegment(actor, output, 'chest', 'neck', colour);
  addOptionalPointSegment(actor, output, 'leftFoot', 'leftToe', colour);
  addOptionalPointSegment(actor, output, 'rightFoot', 'rightToe', colour);
}

function addHollowHead(actor, output, colour, cameraRight, cameraUp, errors) {
  const head = actorPoint(actor, 'head');
  const neck = actorPoint(actor, 'neck') ?? actorPoint(actor, 'chest');
  if (!head || !neck) {
    errors.push(`${actor.id}:head_or_neck_missing`);
    return;
  }
  const radius = clamp(Number(actor.humanoidProjection.points.head.radius ?? 0.18), 0.14, 0.21);
  const bottom = head.clone().addScaledVector(cameraUp, -radius);
  output.push({ a: neck, b: bottom, colour });
  for (let index = 0; index < HEAD_RING_SEGMENTS; index += 1) {
    const a = index / HEAD_RING_SEGMENTS * Math.PI * 2;
    const b = (index + 1) / HEAD_RING_SEGMENTS * Math.PI * 2;
    output.push({
      a: head.clone().addScaledVector(cameraRight, Math.cos(a) * radius).addScaledVector(cameraUp, Math.sin(a) * radius),
      b: head.clone().addScaledVector(cameraRight, Math.cos(b) * radius).addScaledVector(cameraUp, Math.sin(b) * radius),
      colour
    });
  }
}

function addProps(actor, segments, spearheads, flameOuter, flameInner, errors) {
  const profile = actor.humanoidProjection?.profile ?? {};
  const expectsSpear = profile.spear?.enabled === true;
  const expectsTorch = profile.torch?.enabled !== false;
  const spearButt = actorPoint(actor, 'spearButt');
  const spearTip = actorPoint(actor, 'spearTip');
  if (spearButt && spearTip) {
    segments.push({ a: spearButt, b: spearTip, colour: SPEAR_SHAFT });
    const direction = spearTip.clone().sub(spearButt);
    const length = direction.length();
    if (length > 0.0001) {
      direction.normalize();
      const headLength = 0.18;
      const center = spearTip.clone().addScaledVector(direction, -headLength * 0.48);
      spearheads.push(segmentMatrix(center, direction, 0.075, headLength));
    }
  } else if (expectsSpear) errors.push(`${actor.id}:spear_points_missing`);

  const torchGrip = actorPoint(actor, 'torchGrip');
  const torchTip = actorPoint(actor, 'torchTip');
  const flame = actorPoint(actor, 'torchFlame');
  if (torchGrip && torchTip && flame) {
    segments.push({ a: torchGrip, b: torchTip, colour: TORCH_SHAFT });
    const radius = clamp(Number(actor.humanoidProjection.points.torchFlame.radius ?? 0.13) * 0.56, 0.052, 0.09);
    flameOuter.push(scaleMatrix(flame, radius, radius * 0.72, radius));
    flameInner.push(scaleMatrix(flame.clone().add(new THREE.Vector3(0, -radius * 0.18, 0)), radius * 0.48, radius * 0.44, radius * 0.48));
  } else if (expectsTorch) errors.push(`${actor.id}:torch_points_missing`);
}

function addPointSegment(actor, output, from, to, colour, errors) {
  const a = actorPoint(actor, from);
  const b = actorPoint(actor, to);
  if (!a || !b) {
    errors.push(`${actor.id}:${from}_${to}:pose_point_missing`);
    return;
  }
  output.push({ a, b, colour });
}

function addOptionalPointSegment(actor, output, from, to, colour) {
  const a = actorPoint(actor, from);
  const b = actorPoint(actor, to);
  if (a && b) output.push({ a, b, colour });
}

class DynamicWideLineBatch {
  constructor(root, name, lineWidth) {
    this.root = root;
    this.name = name;
    this.lineWidth = lineWidth;
    this.capacity = 0;
    this.count = 0;
    this.allocations = 0;
    this.topologyBuilds = 0;
    this.topologyRebuilds = 0;
    this.geometry = null;
    this.material = new LineMaterial({
      color: 0xffffff,
      linewidth: lineWidth,
      vertexColors: true,
      worldUnits: false,
      alphaToCoverage: true,
      depthTest: true,
      depthWrite: false
    });
    this.mesh = null;
    this.resize(8);
  }

  resize(required) {
    const capacity = nextCapacity(required);
    const replacing = this.mesh != null;
    if (this.mesh) this.mesh.removeFromParent();
    this.geometry?.dispose();
    this.capacity = capacity;
    this.geometry = new LineSegmentsGeometry();
    this.geometry.setPositions(new Float32Array(capacity * 6));
    this.geometry.setColors(new Float32Array(capacity * 6));
    this.geometry.attributes.instanceStart.data.setUsage(THREE.DynamicDrawUsage);
    this.geometry.attributes.instanceColorStart.data.setUsage(THREE.DynamicDrawUsage);
    this.geometry.instanceCount = 0;
    this.mesh = new LineSegments2(this.geometry, this.material);
    this.mesh.name = this.name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.root.add(this.mesh);
    this.allocations += 1;
    this.topologyBuilds += 1;
    if (replacing) this.topologyRebuilds += 1;
  }

  update(segments) {
    if (segments.length > this.capacity) this.resize(segments.length);
    const positions = this.geometry.attributes.instanceStart.data.array;
    const colours = this.geometry.attributes.instanceColorStart.data.array;
    segments.forEach((segment, index) => {
      const offset = index * 6;
      positions[offset] = segment.a.x;
      positions[offset + 1] = segment.a.y;
      positions[offset + 2] = segment.a.z;
      positions[offset + 3] = segment.b.x;
      positions[offset + 4] = segment.b.y;
      positions[offset + 5] = segment.b.z;
      colours[offset] = colours[offset + 3] = segment.colour.r;
      colours[offset + 1] = colours[offset + 4] = segment.colour.g;
      colours[offset + 2] = colours[offset + 5] = segment.colour.b;
    });
    this.geometry.attributes.instanceStart.data.needsUpdate = segments.length > 0;
    this.geometry.attributes.instanceColorStart.data.needsUpdate = segments.length > 0;
    this.geometry.instanceCount = segments.length;
    this.mesh.visible = segments.length > 0;
    this.count = segments.length;
  }

  dispose() {
    this.mesh?.removeFromParent();
    this.geometry?.dispose();
    this.material.dispose();
  }
}

class DynamicInstancedBatch {
  constructor(root, name, geometry, material) {
    this.root = root;
    this.name = name;
    this.geometry = geometry;
    this.material = material;
    this.capacity = 0;
    this.count = 0;
    this.allocations = 0;
    this.topologyBuilds = 0;
    this.topologyRebuilds = 0;
    this.mesh = null;
    this.resize(8);
  }

  resize(required) {
    const capacity = nextCapacity(required);
    const replacing = this.mesh != null;
    if (this.mesh) this.mesh.removeFromParent();
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = this.name;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.mesh);
    this.allocations += 1;
    this.topologyBuilds += 1;
    if (replacing) this.topologyRebuilds += 1;
  }

  update(matrices) {
    if (matrices.length > this.capacity) this.resize(matrices.length);
    matrices.forEach((matrix, index) => this.mesh.setMatrixAt(index, matrix));
    this.mesh.count = matrices.length;
    this.mesh.visible = matrices.length > 0;
    this.mesh.instanceMatrix.needsUpdate = matrices.length > 0;
    this.count = matrices.length;
  }

  dispose() {
    this.mesh?.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

function actorPoint(actor, name) {
  const value = actor.humanoidProjection?.points?.[name];
  if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) return null;
  const height = Number.isFinite(value.height) ? value.height : heightFor(name);
  return new THREE.Vector3(value.x * WORLD_SCALE.tileMeters, height, value.y * WORLD_SCALE.tileMeters);
}

function heightFor(name) {
  if (/Toe|Foot/.test(name)) return 0.08;
  if (/Knee/.test(name)) return 0.53;
  if (/Hip|hips/.test(name)) return 0.94;
  if (/chest|Shoulder/.test(name)) return 1.34;
  if (/head|neck/.test(name)) return 1.68;
  if (/Elbow|Hand|Grip/.test(name)) return 1.05;
  if (/spearTip/.test(name)) return 1.2;
  if (/spearButt/.test(name)) return 0.9;
  if (/torchFlame/.test(name)) return 1.5;
  if (/torchTip/.test(name)) return 1.36;
  return 1;
}

function segmentMatrix(center, direction, radius, length) {
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction);
  return new THREE.Matrix4().compose(center, quaternion, new THREE.Vector3(radius, length, radius));
}

function scaleMatrix(center, x, y, z) {
  return new THREE.Matrix4().compose(center, new THREE.Quaternion(), new THREE.Vector3(x, y, z));
}

function cameraAxis(value, fallback) {
  if (value?.isVector3 && finiteVector(value) && value.lengthSq() > 0.000001) return value.clone().normalize();
  return fallback.clone();
}

function finiteVector(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z);
}

function nextCapacity(count) {
  let capacity = 8;
  while (capacity < Math.max(1, count)) capacity *= 2;
  return capacity;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

function emptyStats() {
  return {
    contract: THREE_INK_HUMANOID_CONTRACT,
    embodimentId: HumanoidEmbodimentId.INK_STICK,
    actorCount: 0,
    readyActorCount: 0,
    bodySegmentCount: 0,
    headRingSegmentCount: 0,
    propSegmentCount: 0,
    spearCount: 0,
    torchCount: 0,
    flameCount: 0,
    drawFamilyCount: 0,
    pooledDrawFamilyCount: 5,
    capacity: 0,
    allocations: 0,
    topologyBuilds: 0,
    topologyRebuilds: 0,
    missingPointErrors: [],
    nonFiniteSegmentCount: 0,
    recipeIds: [],
    profileIds: [],
    actorKinds: [],
    equipmentPolicy: 'profile_owned_props_v1',
    colourPolicy: 'absolute_black_unlit_v1',
    bodyLineWidthPx: BODY_LINE_WIDTH_PX,
    propLineWidthPx: PROP_LINE_WIDTH_PX,
    lightReactiveActorCount: 0
  };
}
