import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';
import { DynamicWyvernMembraneBatch, DynamicWyvernSweepBatch } from './ThreeWyvernSurfaceTopology.js';

export const PROCEDURAL_WYVERN_SURFACE_V2_CONTRACT = 'black-sky-bound.procedural-wyvern-mesh-recipe.v2';

const DETAIL_COUNT = 21;
const CLAW_COUNT = 10;
const HORN_COUNT = 2;
const BROW_COUNT = 2;
const SPINE_COUNT = 7;
const TAIL_BIND_CURVE_METERS = 0.1;
const UP = new THREE.Vector3(0, 1, 0);

export class ThreeWyvernSurfaceV2 {
  constructor(root, actor) {
    const rig = requireRig(actor);
    this.group = new THREE.Group();
    this.group.name = `actor:${actor.id}:procedural-wyvern-surface-v2`;
    this.group.userData.contract = PROCEDURAL_WYVERN_SURFACE_V2_CONTRACT;
    root.add(this.group);
    this.materials = createMaterials(actor.wyvernProjection?.palette ?? {});
    this.sweeps = new DynamicWyvernSweepBatch(buildSweepDefinitions(rig, actor.wyvernProjection?.palette ?? {}));
    this.membranes = new DynamicWyvernMembraneBatch();
    this.opaqueMesh = createMesh(this.group, this.sweeps.geometry, this.materials.hide, 'wyvern-v2:opaque-surface');
    this.membraneMesh = createMesh(this.group, this.membranes.geometry, this.materials.membrane, 'wyvern-v2:wing-membranes');
    this.detailGeometry = new THREE.ConeGeometry(1, 2, 5, 1, false);
    this.details = new THREE.InstancedMesh(this.detailGeometry, this.materials.detail, DETAIL_COUNT);
    this.details.name = 'wyvern-v2:claws-horns-spines';
    this.details.castShadow = this.details.receiveShadow = true;
    this.details.frustumCulled = false;
    this.group.add(this.details);
    this.eyeGeometry = new THREE.OctahedronGeometry(1, 0);
    this.eyes = new THREE.InstancedMesh(this.eyeGeometry, this.materials.eye, 2);
    this.eyes.name = 'wyvern-v2:eyes';
    this.eyes.frustumCulled = false;
    this.group.add(this.eyes);
    this.midTorso = surfacePoint('mid_torso');
    this.tailSurfacePoints = rig.tail.map((point) => surfacePoint(`${point.role}_surface`));
    this.direction = new THREE.Vector3();
    this.lateral = new THREE.Vector3();
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this.tip = new THREE.Vector3();
    this.midpoint = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.matrix = new THREE.Matrix4();
    this.spineSources = Array(SPINE_COUNT).fill(null);
    this.poseUpdates = 0;
    this.malformedFrameCount = 0;
    this.nonFiniteVertexCount = 0;
    this.disposed = false;
    this.colourDetails();
    const sweepTopology = this.sweeps.topology;
    const membraneTopology = this.membranes.topology;
    this.topology = Object.freeze({
      vertexCount: sweepTopology.vertexCount + membraneTopology.vertexCount
        + this.detailGeometry.getAttribute('position').count * DETAIL_COUNT
        + this.eyeGeometry.getAttribute('position').count * 2,
      triangleCount: sweepTopology.triangleCount + membraneTopology.triangleCount
        + triangleCount(this.detailGeometry) * DETAIL_COUNT
        + triangleCount(this.eyeGeometry) * 2,
      drawCallCount: 4,
      materialFamilyCount: 4,
      membranePanelCount: membraneTopology.panelCount,
      topologyBuilds: 1
    });
    this.stats = {
      contract: PROCEDURAL_WYVERN_SURFACE_V2_CONTRACT,
      embodimentVersion: 'surface-v2-production',
      meshCount: 4,
      membraneCount: 2,
      membranePanelCount: this.topology.membranePanelCount,
      vertexCount: this.topology.vertexCount,
      triangleCount: this.topology.triangleCount,
      drawCallCount: this.topology.drawCallCount,
      materialFamilyCount: this.topology.materialFamilyCount,
      topologyBuilds: this.topology.topologyBuilds,
      poseUpdates: 0,
      malformedFrameCount: 0,
      nonFiniteVertexCount: 0,
      tailBindCurveMeters: TAIL_BIND_CURVE_METERS,
      disposed: false
    };
  }

  update(actor) {
    this.group.visible = actor.alive !== false || actor.team === 'player';
    try {
      const rig = requireRig(actor);
      this.readFacing(rig);
      this.updateSurfacePoints(rig);
      this.sweeps.update();
      this.membranes.update();
      this.updateDetails(rig);
      this.updateEyes(rig);
      this.nonFiniteVertexCount = countNonFinite(this.sweeps.geometry) + countNonFinite(this.membranes.geometry);
      if (this.nonFiniteVertexCount) throw new Error(`wyvern_surface_non_finite_vertices:${this.nonFiniteVertexCount}`);
    } catch (error) {
      this.malformedFrameCount += 1;
      this.group.userData.error = String(error?.message ?? error);
      throw error;
    }
    this.group.userData.error = null;
    this.group.userData.bodyContactRig = actor.bodyContactRig;
    this.group.userData.sockets = actor.wyvernProjection?.proceduralPose?.sockets ?? null;
    this.group.userData.poseState = actor.wyvernProjection?.actionState ?? actor.wyvernProjection?.motionState ?? null;
    this.poseUpdates += 1;
  }

  updateSurfacePoints(rig) {
    const axial = this.sweeps.points('axial');
    interpolatePoint(this.midTorso, rig.axial.chest, rig.axial.hips, 0.54);
    axial[0] = rig.head.snoutTip;
    axial[1] = rig.head.muzzle;
    axial[2] = rig.head.center;
    axial[3] = rig.axial.head;
    axial[4] = rig.axial.neck;
    axial[5] = rig.axial.chest;
    axial[6] = this.midTorso;
    axial[7] = rig.axial.hips;
    for (let index = 0; index < rig.tail.length; index += 1) {
      const source = rig.tail[index];
      const point = this.tailSurfacePoints[index];
      const t = index / Math.max(1, rig.tail.length - 1);
      const offsetMeters = Math.sin(Math.PI * t) * TAIL_BIND_CURVE_METERS;
      point.x = source.x + this.lateral.x * offsetMeters / WORLD_SCALE.tileMeters;
      point.y = source.y + this.lateral.z * offsetMeters / WORLD_SCALE.tileMeters;
      point.width = source.width;
      point.height = source.height;
      point.verticalRadius = source.verticalRadius;
      axial[8 + index] = point;
    }

    const jaw = this.sweeps.points('jaw');
    jaw[0] = rig.head.jawHinge;
    jaw[1] = rig.head.jawTip;

    for (let sideIndex = 0; sideIndex < SIDE_NAMES.length; sideIndex += 1) {
      const side = SIDE_NAMES[sideIndex];
      const wing = rig.wingForelimbs[side];
      const arm = this.sweeps.points(`${side}:wing-arm`);
      arm[0] = rig.axial.chest;
      arm[1] = wing.shoulder;
      arm[2] = wing.elbow;
      arm[3] = wing.wrist;
      for (let digitIndex = 0; digitIndex < 4; digitIndex += 1) {
        const digit = wing.digits[digitIndex];
        const points = this.sweeps.points(`${side}:digit:${digitIndex}`);
        points[0] = wing.wrist;
        points[1] = digit.knuckles[0];
        points[2] = digit.knuckles[1];
        points[3] = digit.tip;
      }
      const leg = rig.hindLegs[side];
      const hind = this.sweeps.points(`${side}:hind-leg`);
      hind[0] = rig.axial.hips;
      hind[1] = leg.hip;
      hind[2] = leg.knee;
      hind[3] = leg.ankle;
      hind[4] = leg.foot;
      const membrane = this.membranes.points(side);
      membrane[0] = wing.membraneRoot;
      membrane[1] = wing.shoulder;
      membrane[2] = wing.elbow;
      membrane[3] = wing.wrist;
      for (let digitIndex = 0; digitIndex < 4; digitIndex += 1) membrane[4 + digitIndex] = wing.digits[digitIndex].tip;
    }
  }

  updateDetails(rig) {
    let index = 0;
    for (let sideIndex = 0; sideIndex < SIDE_NAMES.length; sideIndex += 1) {
      const side = SIDE_NAMES[sideIndex];
      const sideSign = side === 'left' ? -1 : 1;
      const foot = rig.hindLegs[side].foot;
      toVector(this.base, foot);
      for (let toe = -1; toe <= 1; toe += 1) {
        this.a.copy(this.base).addScaledVector(this.lateral, toe * 0.035);
        this.tip.copy(this.direction).addScaledVector(this.lateral, toe * 0.28).normalize();
        this.b.copy(this.a).addScaledVector(this.tip, 0.12);
        this.b.y = Math.max(0.018, foot.height - foot.verticalRadius * 0.7);
        this.writeCone(index++, this.a, this.b, 0.018);
      }
      const wrist = rig.wingForelimbs[side].wrist;
      toVector(this.base, wrist);
      for (let talon = 0; talon < 2; talon += 1) {
        this.a.copy(this.base).addScaledVector(this.lateral, sideSign * (0.015 + talon * 0.026));
        this.tip.copy(this.direction).addScaledVector(this.lateral, sideSign * (0.52 + talon * 0.18)).normalize();
        this.b.copy(this.a).addScaledVector(this.tip, 0.105 - talon * 0.014);
        this.b.y = Math.max(0.018, wrist.height - wrist.verticalRadius * 0.72);
        this.writeCone(index++, this.a, this.b, 0.017);
      }
    }
    toVector(this.base, rig.head.center);
    for (let horn = 0; horn < HORN_COUNT; horn += 1) {
      const side = horn ? 1 : -1;
      this.a.copy(this.base).addScaledVector(this.lateral, side * 0.052);
      this.a.y += rig.head.center.verticalRadius * 0.55;
      this.b.copy(this.a).addScaledVector(this.direction, -0.09).addScaledVector(this.lateral, side * 0.028);
      this.b.y += 0.032;
      this.writeCone(index++, this.a, this.b, 0.016);
    }
    for (let brow = 0; brow < BROW_COUNT; brow += 1) {
      const side = brow ? 1 : -1;
      this.a.copy(this.base).addScaledVector(this.lateral, side * 0.026).addScaledVector(this.direction, 0.05);
      this.a.y += rig.head.center.verticalRadius * 0.44;
      this.b.copy(this.a).addScaledVector(this.lateral, side * 0.052).addScaledVector(this.direction, -0.012);
      this.b.y += 0.008;
      this.writeCone(index++, this.a, this.b, 0.012, 0.22);
    }
    this.spineSources[0] = rig.axial.neck;
    this.spineSources[1] = rig.axial.chest;
    this.spineSources[2] = rig.axial.hips;
    for (let spine = 3; spine < SPINE_COUNT; spine += 1) this.spineSources[spine] = rig.tail[spine - 3] ?? rig.tail.at(-1);
    for (let spine = 0; spine < SPINE_COUNT; spine += 1) {
      const source = this.spineSources[spine];
      toVector(this.a, source);
      this.a.y += source.verticalRadius * 0.72;
      this.b.copy(this.a);
      this.b.y += 0.062 - spine * 0.006;
      this.writeCone(index++, this.a, this.b, 0.018 - spine * 0.0015);
    }
    this.details.instanceMatrix.needsUpdate = true;
  }

  updateEyes(rig) {
    toVector(this.base, rig.head.center);
    for (let eye = 0; eye < 2; eye += 1) {
      const side = eye ? 1 : -1;
      this.a.copy(this.base)
        .addScaledVector(this.direction, 0.045)
        .addScaledVector(this.lateral, side * Math.max(0.025, rig.head.center.width * WORLD_SCALE.tileMeters * 0.34));
      this.a.y += rig.head.center.verticalRadius * 0.26;
      this.quaternion.setFromAxisAngle(UP, Math.atan2(this.direction.x, this.direction.z) + side * 0.12);
      this.scale.set(0.027, 0.012, 0.036);
      this.matrix.compose(this.a, this.quaternion, this.scale);
      this.eyes.setMatrixAt(eye, this.matrix);
    }
    this.eyes.instanceMatrix.needsUpdate = true;
  }

  readFacing(rig) {
    toVector(this.a, rig.head.center);
    toVector(this.b, rig.head.muzzle);
    this.direction.subVectors(this.b, this.a).setY(0);
    if (this.direction.lengthSq() < 1e-8) throw new Error('wyvern_surface_facing_invalid');
    this.direction.normalize();
    this.lateral.set(-this.direction.z, 0, this.direction.x);
  }

  writeCone(index, start, end, radius, depthScale = 1) {
    this.tip.subVectors(end, start);
    const length = Math.max(0.001, this.tip.length());
    this.midpoint.copy(start).add(end).multiplyScalar(0.5);
    this.quaternion.setFromUnitVectors(UP, this.tip.normalize());
    this.scale.set(radius, length * 0.5, radius * depthScale);
    this.matrix.compose(this.midpoint, this.quaternion, this.scale);
    this.details.setMatrixAt(index, this.matrix);
  }

  colourDetails() {
    const claw = new THREE.Color('#89715d');
    const spine = new THREE.Color('#53261e');
    for (let index = 0; index < DETAIL_COUNT; index += 1) this.details.setColorAt(index, index < CLAW_COUNT + HORN_COUNT ? claw : spine);
    if (this.details.instanceColor) this.details.instanceColor.needsUpdate = true;
  }

  diagnostics() {
    this.stats.poseUpdates = this.poseUpdates;
    this.stats.malformedFrameCount = this.malformedFrameCount;
    this.stats.nonFiniteVertexCount = this.nonFiniteVertexCount;
    this.stats.disposed = this.disposed;
    return this.stats;
  }

  dispose() {
    this.disposed = true;
    this.group.removeFromParent();
    this.sweeps.dispose();
    this.membranes.dispose();
    this.detailGeometry.dispose();
    this.eyeGeometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}

function buildSweepDefinitions(rig, palette) {
  const definitions = [
    { id: 'axial', pointCount: 8 + rig.tail.length, sides: 8, colour: palette.hide ?? '#5c2f25' },
    { id: 'jaw', pointCount: 2, sides: 6, colour: palette.hideDark ?? '#2d1714', radiusScale: 1.08 }
  ];
  for (const side of SIDE_NAMES) {
    definitions.push(
      { id: `${side}:wing-arm`, pointCount: 4, sides: 6, colour: palette.hide ?? '#5c2f25', radiusScale: 1.12 },
      { id: `${side}:hind-leg`, pointCount: 5, sides: 6, colour: palette.hideDark ?? '#2d1714', radiusScale: 1.18 }
    );
    for (let digit = 0; digit < 4; digit += 1) definitions.push({
      id: `${side}:digit:${digit}`,
      pointCount: 4,
      sides: 4,
      colour: palette.hideRim ?? '#d18355',
      radiusScale: 1.32
    });
  }
  return definitions;
}

function createMaterials(palette) {
  const standard = (colour, options = {}) => new THREE.MeshStandardMaterial({
    color: cssColour(colour),
    roughness: options.roughness ?? 0.78,
    metalness: 0,
    flatShading: true,
    vertexColors: options.vertexColors ?? true,
    side: options.side ?? THREE.FrontSide,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ? cssColour(options.emissive) : 0x000000,
    emissiveIntensity: options.emissive ? 1.45 : 0
  });
  return {
    hide: standard('#ffffff'),
    membrane: standard(palette.wingMembrane ?? '#2d1714', { side: THREE.DoubleSide, transparent: true, opacity: 0.82, roughness: 0.92 }),
    detail: standard('#ffffff', { vertexColors: false, roughness: 0.68 }),
    eye: standard(palette.eye ?? '#ffd684', { vertexColors: false, emissive: palette.eye ?? '#ffd684', roughness: 0.24 })
  };
}

function createMesh(group, geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}

function requireRig(actor) {
  const rig = actor?.wyvernProjection?.rigPose;
  if (!rig?.axial?.head || !rig?.head?.snoutTip || rig.tail?.length < 2) throw new Error('wyvern_surface_v2_rig_contract_missing');
  for (let sideIndex = 0; sideIndex < SIDE_NAMES.length; sideIndex += 1) {
    const side = SIDE_NAMES[sideIndex];
    if (rig.wingForelimbs?.[side]?.digits?.length !== 4) throw new Error(`wyvern_surface_v2_wing_contract:${side}`);
    if (!rig.hindLegs?.[side]?.foot) throw new Error(`wyvern_surface_v2_hind_contract:${side}`);
  }
  return rig;
}

function interpolatePoint(target, start, end, amount) {
  const t = Math.max(0, Math.min(1, amount));
  target.x = start.x + (end.x - start.x) * t;
  target.y = start.y + (end.y - start.y) * t;
  target.width = start.width + (end.width - start.width) * t;
  target.height = start.height + (end.height - start.height) * t;
  target.verticalRadius = start.verticalRadius + (end.verticalRadius - start.verticalRadius) * t;
  return target;
}

function surfacePoint(role) { return { role, x: 0, y: 0, width: 0, height: 0, verticalRadius: 0 }; }
function toVector(target, point) { target.set(point.x * WORLD_SCALE.tileMeters, point.height, point.y * WORLD_SCALE.tileMeters); }
function triangleCount(geometry) { return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3; }
function countNonFinite(geometry) {
  const values = geometry.getAttribute('position').array;
  let count = 0;
  for (let index = 0; index < values.length; index += 1) if (!Number.isFinite(values[index])) count += 1;
  return count;
}
function cssColour(value) {
  const match = String(value ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return match ? (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]) : value ?? '#ffffff';
}

const SIDE_NAMES = Object.freeze(['left', 'right']);
