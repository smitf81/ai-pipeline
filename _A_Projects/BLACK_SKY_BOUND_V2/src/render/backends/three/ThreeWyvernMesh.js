import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';

export const PROCEDURAL_WYVERN_MESH_RECIPE_CONTRACT = 'black-sky-bound.procedural-wyvern-mesh-recipe.v1';

const UP = new THREE.Vector3(0, 1, 0);
const DORSAL_SPINE_COUNT = 7;
const CLAW_COUNT = 10;
const HORN_COUNT = 2;
const SILHOUETTE_PLATE_COUNT = 4;
const SPINE_HEIGHTS = Object.freeze([0.74, 0.66, 0.56, 0.46, 0.37, 0.29, 0.22]);

export class ThreeWyvernMesh {
  constructor(root, actor) {
    this.group = new THREE.Group();
    this.group.name = `actor:${actor.id}:faceted-wyvern`;
    this.group.userData.contract = PROCEDURAL_WYVERN_MESH_RECIPE_CONTRACT;
    this.group.userData.visualFacing = { x: 0, z: 1 };
    root.add(this.group);
    this.geometries = createGeometries();
    this.materials = createMaterials(actor.wyvernProjection?.palette ?? {});
    this.direction = new THREE.Vector3();
    this.midpoint = new THREE.Vector3();
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this.lateral = new THREE.Vector3();
    this.instanceScale = new THREE.Vector3();
    this.instanceQuaternion = new THREE.Quaternion();
    this.instanceMatrix = new THREE.Matrix4();
    this.spinePoints = Array(DORSAL_SPINE_COUNT).fill(null);
    this.platePoints = Array(SILHOUETTE_PLATE_COUNT).fill(null);
    this.axial = createMeshArray(this.group, this.geometries.tapered, this.materials.hide, 3);
    this.tail = createMeshArray(this.group, this.geometries.tapered, this.materials.hideDark, Math.max(0, (actor.wyvernProjection?.rigPose?.tail?.length ?? 1) - 1));
    this.wings = Object.fromEntries(['left', 'right'].map((side) => [side, this.createWing(side, actor)]));
    this.hindLegs = Object.fromEntries(['left', 'right'].map((side) => [side, this.createHindLeg(side)]));
    this.masses = {
      chest: this.mesh(this.geometries.mass, this.materials.hide),
      torso: this.mesh(this.geometries.mass, this.materials.hide),
      hips: this.mesh(this.geometries.mass, this.materials.hideDark),
      leftHaunch: this.mesh(this.geometries.mass, this.materials.hideDark),
      rightHaunch: this.mesh(this.geometries.mass, this.materials.hideDark),
      head: this.mesh(this.geometries.head, this.materials.hide),
      muzzle: this.mesh(this.geometries.head, this.materials.hideDark),
      jaw: this.mesh(this.geometries.head, this.materials.hideDark)
    };
    this.eyes = [this.mesh(this.geometries.eye, this.materials.eye), this.mesh(this.geometries.eye, this.materials.eye)];
    this.claws = createInstancedMesh(this.group, this.geometries.claw, this.materials.claw, CLAW_COUNT, 'wyvern:claws');
    this.horns = createInstancedMesh(this.group, this.geometries.claw, this.materials.claw, HORN_COUNT, 'wyvern:horns');
    this.dorsalSpines = createInstancedMesh(this.group, this.geometries.spine, this.materials.hideRim, DORSAL_SPINE_COUNT, 'wyvern:dorsal-spines');
    this.silhouettePlates = createInstancedMesh(this.group, this.geometries.mass, this.materials.hideRim, SILHOUETTE_PLATE_COUNT, 'wyvern:silhouette-plates');
    this.stats = {
      contract: PROCEDURAL_WYVERN_MESH_RECIPE_CONTRACT,
      meshCount: countMeshes(this.group),
      membraneCount: 2,
      clawCount: CLAW_COUNT,
      hornCount: HORN_COUNT,
      dorsalSpineCount: DORSAL_SPINE_COUNT,
      silhouettePlateCount: SILHOUETTE_PLATE_COUNT,
      detailInstanceCount: CLAW_COUNT + HORN_COUNT + DORSAL_SPINE_COUNT + SILHOUETTE_PLATE_COUNT,
      topologyBuilds: 1,
      poseUpdates: 0
    };
  }

  createWing(side, actor) {
    const rig = actor.wyvernProjection?.rigPose?.wingForelimbs?.[side];
    const digits = rig?.digits ?? [];
    return {
      arm: createMeshArray(this.group, this.geometries.tapered, this.materials.hide, 2),
      digits: digits.map((digit) => createMeshArray(this.group, this.geometries.bone, this.materials.hideRim, (digit.knuckles?.length ?? 0) + 1)),
      membrane: this.createMembrane(side, Math.max(3, digits.length + 2))
    };
  }

  createHindLeg(side) {
    return { segments: createMeshArray(this.group, this.geometries.tapered, this.materials.hideDark, 3), side };
  }

  createMembrane(side, vertexCount) {
    const positions = new Float32Array(vertexCount * 3);
    const colours = new Float32Array(vertexCount * 3);
    const indices = [];
    for (let index = 0; index < vertexCount; index += 1) {
      const tone = 0.5 + (index % 3) * 0.16;
      colours[index * 3] = tone;
      colours[index * 3 + 1] = tone;
      colours[index * 3 + 2] = tone;
    }
    for (let index = 1; index < vertexCount - 1; index += 1) indices.push(0, index, index + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.materials.membrane);
    mesh.name = `wyvern:${side}:membrane`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  mesh(geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  update(actor) {
    const rig = actor.wyvernProjection?.rigPose;
    if (!rig) { this.group.visible = false; return; }
    this.group.visible = actor.alive !== false || actor.team === 'player';
    const axial = [rig.axial?.head, rig.axial?.neck, rig.axial?.chest, rig.axial?.hips];
    for (let index = 0; index < this.axial.length; index += 1) {
      this.place(this.axial[index], axial[index], axial[index + 1], axialHeight(index), axialHeight(index + 1), widthMeters(axial[index], 0.09), widthMeters(axial[index + 1], 0.08));
    }
    for (let index = 0; index < this.tail.length; index += 1) {
      const t = index / Math.max(1, this.tail.length);
      this.place(this.tail[index], rig.tail[index], rig.tail[index + 1], 0.34 - t * 0.24, 0.34 - (t + 1 / this.tail.length) * 0.24, widthMeters(rig.tail[index], 0.07) * (1 - t * 0.5));
    }
    this.updateMasses(rig);
    this.updateWings(rig);
    this.updateHindLegs(rig);
    this.updateEyesAndClaws(rig);
    this.updateSilhouetteDetails(rig);
    this.group.userData.bodyContactRig = actor.bodyContactRig;
    this.group.userData.sockets = actor.wyvernProjection?.proceduralPose?.sockets ?? null;
    this.group.userData.poseState = actor.wyvernProjection?.actionState ?? actor.wyvernProjection?.motionState ?? null;
    this.stats.poseUpdates += 1;
  }

  updateMasses(rig) {
    const body = rig.body ?? {};
    const chestWidth = Math.max(0.18, Number(body.chestWidth ?? 0.4) * 0.5);
    const hipWidth = Math.max(0.16, Number(body.hipWidth ?? 0.34) * 0.5);
    this.placeMass(this.masses.chest, rig.axial?.neck, rig.axial?.chest, 0.59, 0.48, chestWidth, 0.26);
    this.placeMass(this.masses.torso, rig.axial?.chest, rig.axial?.hips, 0.48, 0.38, Math.max(chestWidth * 0.78, hipWidth * 0.9), 0.22);
    this.placeMass(this.masses.hips, rig.axial?.chest, rig.axial?.hips, 0.42, 0.37, hipWidth, 0.23);
    this.placeHaunch(this.masses.leftHaunch, rig.hindLegs?.left?.hip, rig.axial?.hips, -1);
    this.placeHaunch(this.masses.rightHaunch, rig.hindLegs?.right?.hip, rig.axial?.hips, 1);
    setPoint(this.masses.head.position, rig.head?.center ?? rig.axial?.head, 0.7);
    this.masses.head.scale.set(Math.max(0.13, Number(rig.head?.headWidth ?? 0.28) * 0.5), 0.2, Math.max(0.18, Number(rig.head?.headLength ?? 0.42) * 0.5));
    orientToward(this.masses.head, rig.head?.center ?? rig.axial?.head, rig.head?.muzzle);
    this.place(this.masses.muzzle, rig.head?.center, rig.head?.muzzle, 0.68, 0.66, Math.max(0.07, Number(rig.head?.jawWidth ?? 0.12) * 0.5));
    this.place(this.masses.jaw, rig.head?.center, rig.head?.muzzle, 0.64 - Number(rig.head?.jawOpen ?? 0) * 0.08, 0.62 - Number(rig.head?.jawOpen ?? 0) * 0.12, Math.max(0.055, Number(rig.head?.jawWidth ?? 0.1) * 0.42));
  }

  placeMass(mesh, a, b, heightA, heightB, width, height) {
    if (!a || !b) { mesh.visible = false; return; }
    mesh.visible = true;
    setPoint(this.a, a, heightA);
    setPoint(this.b, b, heightB);
    this.direction.subVectors(this.b, this.a);
    mesh.position.copy(this.a).add(this.b).multiplyScalar(0.5);
    mesh.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
    mesh.scale.set(width, height, Math.max(width * 1.15, Math.hypot(this.direction.x, this.direction.z) * 0.68));
  }

  placeHaunch(mesh, hip, center, side) {
    if (!hip) { mesh.visible = false; return; }
    mesh.visible = true;
    setPoint(mesh.position, hip, 0.35);
    mesh.scale.set(0.14, 0.2, 0.19);
    orientToward(mesh, center, hip);
    mesh.rotation.z = side * 0.08;
  }

  updateWings(rig) {
    for (const sideName of ['left', 'right']) {
      const wingRig = rig.wingForelimbs?.[sideName];
      const wing = this.wings[sideName];
      if (!wingRig) continue;
      this.place(wing.arm[0], wingRig.shoulder, wingRig.elbow, 0.52, 0.3, widthMeters(wingRig.shoulder, 0.06));
      this.place(wing.arm[1], wingRig.elbow, wingRig.wrist, 0.3, 0.08, widthMeters(wingRig.elbow, 0.05));
      for (let digitIndex = 0; digitIndex < wing.digits.length; digitIndex += 1) {
        const digitRig = wingRig.digits[digitIndex];
        const points = [wingRig.wrist, ...(digitRig.knuckles ?? []), digitRig.tip];
        for (let segment = 0; segment < wing.digits[digitIndex].length; segment += 1) {
          const t0 = segment / Math.max(1, points.length - 1);
          const t1 = (segment + 1) / Math.max(1, points.length - 1);
          this.place(wing.digits[digitIndex][segment], points[segment], points[segment + 1], 0.1 + t0 * 0.06, 0.1 + t1 * 0.06, 0.018 * (1 - t0 * 0.45));
        }
      }
      this.updateMembrane(wing.membrane, wingRig);
    }
  }

  updateMembrane(mesh, wingRig) {
    const points = [wingRig.membraneRoot, wingRig.wrist, ...(wingRig.digits ?? []).map((digit) => digit.tip)];
    const attribute = mesh.geometry.getAttribute('position');
    for (let index = 0; index < attribute.count; index += 1) {
      const point = points[index] ?? points.at(-1);
      const height = index === 0 ? 0.36 : index === 1 ? 0.1 : 0.14 + (index - 2) * 0.008;
      this.tmp.set(Number(point?.x ?? 0) * WORLD_SCALE.tileMeters, height, Number(point?.y ?? 0) * WORLD_SCALE.tileMeters);
      attribute.setXYZ(index, this.tmp.x, this.tmp.y, this.tmp.z);
    }
    attribute.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }

  updateHindLegs(rig) {
    for (const sideName of ['left', 'right']) {
      const legRig = rig.hindLegs?.[sideName];
      const leg = this.hindLegs[sideName];
      if (!legRig) continue;
      const points = [legRig.hip, legRig.knee, legRig.ankle ?? legRig.hock, legRig.foot ?? legRig.paw];
      const heights = [0.4, 0.24, 0.1, 0.055];
      for (let index = 0; index < leg.segments.length; index += 1) {
        this.place(leg.segments[index], points[index], points[index + 1], heights[index], heights[index + 1], widthMeters(points[index], index ? 0.05 : 0.09));
      }
    }
  }

  updateEyesAndClaws(rig) {
    const head = rig.head?.center ?? rig.axial?.head;
    const muzzle = rig.head?.muzzle ?? rig.axial?.head;
    const dx = Number(muzzle?.x ?? 0) - Number(head?.x ?? 0);
    const dz = Number(muzzle?.y ?? 0) - Number(head?.y ?? 0);
    const length = Math.hypot(dx, dz) || 1;
    for (let index = 0; index < 2; index += 1) {
      const side = index ? 1 : -1;
      this.eyes[index].position.set((Number(head?.x ?? 0) - dz / length * side * 0.08) * 0.5, 0.79, (Number(head?.y ?? 0) + dx / length * side * 0.08) * 0.5);
      this.eyes[index].scale.setScalar(0.035);
    }
    this.direction.set(dx * WORLD_SCALE.tileMeters, 0, dz * WORLD_SCALE.tileMeters).normalize();
    this.lateral.set(-this.direction.z, 0, this.direction.x);
    let clawIndex = 0;
    for (const sideName of ['left', 'right']) {
      const side = sideName === 'left' ? -1 : 1;
      const foot = rig.hindLegs?.[sideName]?.foot ?? rig.hindLegs?.[sideName]?.paw;
      setPoint(this.base, foot, 0.075);
      for (let toe = -1; toe <= 1; toe += 1) {
        this.a.copy(this.base).addScaledVector(this.lateral, toe * 0.035);
        this.tmp.copy(this.direction).addScaledVector(this.lateral, toe * 0.28).normalize();
        this.b.copy(this.a).addScaledVector(this.tmp, 0.115);
        this.b.y = 0.035;
        this.writeConeInstance(this.claws, clawIndex, this.a, this.b, 0.022);
        clawIndex += 1;
      }
      const wrist = rig.wingForelimbs?.[sideName]?.wrist;
      setPoint(this.base, wrist, 0.09);
      for (let talon = 0; talon < 2; talon += 1) {
        this.a.copy(this.base).addScaledVector(this.lateral, side * (0.012 + talon * 0.025));
        this.tmp.copy(this.direction).addScaledVector(this.lateral, side * (0.5 + talon * 0.18)).normalize();
        this.b.copy(this.a).addScaledVector(this.tmp, 0.1 - talon * 0.012);
        this.b.y = 0.035;
        this.writeConeInstance(this.claws, clawIndex, this.a, this.b, 0.02);
        clawIndex += 1;
      }
    }
    this.claws.instanceMatrix.needsUpdate = true;
  }

  updateSilhouetteDetails(rig) {
    const head = rig.head?.center ?? rig.axial?.head;
    const muzzle = rig.head?.muzzle ?? rig.axial?.head;
    setPoint(this.base, head, 0.79);
    for (let index = 0; index < HORN_COUNT; index += 1) {
      const side = index ? 1 : -1;
      this.a.copy(this.base).addScaledVector(this.lateral, side * 0.055);
      this.b.copy(this.a).addScaledVector(this.direction, -0.15).addScaledVector(this.lateral, side * 0.032);
      this.b.y += 0.025;
      this.writeConeInstance(this.horns, index, this.a, this.b, 0.026);
    }
    this.horns.instanceMatrix.needsUpdate = true;

    this.spinePoints[0] = rig.axial?.neck;
    this.spinePoints[1] = rig.axial?.chest;
    this.spinePoints[2] = rig.axial?.hips;
    for (let index = 3; index < DORSAL_SPINE_COUNT; index += 1) this.spinePoints[index] = rig.tail?.[index - 3] ?? rig.tail?.at(-1);
    for (let index = 0; index < DORSAL_SPINE_COUNT; index += 1) {
      setPoint(this.a, this.spinePoints[index], SPINE_HEIGHTS[index]);
      const height = 0.105 - index * 0.009;
      this.writeUprightInstance(this.dorsalSpines, index, this.a, 0.035 - index * 0.0025, height);
    }
    this.dorsalSpines.instanceMatrix.needsUpdate = true;

    this.platePoints[0] = rig.wingForelimbs?.left?.shoulder;
    this.platePoints[1] = rig.wingForelimbs?.right?.shoulder;
    this.platePoints[2] = rig.hindLegs?.left?.hip;
    this.platePoints[3] = rig.hindLegs?.right?.hip;
    for (let index = 0; index < SILHOUETTE_PLATE_COUNT; index += 1) {
      const shoulder = index < 2;
      setPoint(this.a, this.platePoints[index], shoulder ? 0.555 : 0.415);
      this.writeMassInstance(this.silhouettePlates, index, this.a, shoulder ? 0.105 : 0.115, shoulder ? 0.058 : 0.07, shoulder ? 0.135 : 0.145);
    }
    this.silhouettePlates.instanceMatrix.needsUpdate = true;
    this.group.userData.visualFacing.x = this.direction.x;
    this.group.userData.visualFacing.z = this.direction.z;
  }

  writeConeInstance(mesh, index, start, end, radius) {
    this.tmp.subVectors(end, start);
    const length = Math.max(0.001, this.tmp.length());
    this.midpoint.copy(start).add(end).multiplyScalar(0.5);
    this.instanceQuaternion.setFromUnitVectors(UP, this.tmp.normalize());
    this.instanceScale.set(radius, length / 2.6, radius);
    this.instanceMatrix.compose(this.midpoint, this.instanceQuaternion, this.instanceScale);
    mesh.setMatrixAt(index, this.instanceMatrix);
  }

  writeUprightInstance(mesh, index, position, radius, height) {
    this.instanceQuaternion.identity();
    this.instanceScale.set(radius, height / 2.2, radius);
    this.instanceMatrix.compose(position, this.instanceQuaternion, this.instanceScale);
    mesh.setMatrixAt(index, this.instanceMatrix);
  }

  writeMassInstance(mesh, index, position, x, y, z) {
    this.instanceQuaternion.setFromAxisAngle(UP, Math.atan2(this.direction.x, this.direction.z));
    this.instanceScale.set(x, y, z);
    this.instanceMatrix.compose(position, this.instanceQuaternion, this.instanceScale);
    mesh.setMatrixAt(index, this.instanceMatrix);
  }

  place(mesh, a, b, heightA, heightB, radiusA, radiusB = radiusA) {
    if (!a || !b) { mesh.visible = false; return; }
    mesh.visible = true;
    setPoint(this.a, a, heightA);
    setPoint(this.b, b, heightB);
    this.direction.subVectors(this.b, this.a);
    const length = Math.max(0.0001, this.direction.length());
    this.midpoint.copy(this.a).add(this.b).multiplyScalar(0.5);
    mesh.position.copy(this.midpoint);
    mesh.quaternion.setFromUnitVectors(UP, this.direction.normalize());
    mesh.scale.set(Math.max(0.008, radiusA), length, Math.max(0.008, radiusB));
  }

  diagnostics() { return { ...this.stats }; }

  dispose() {
    this.group.removeFromParent();
    for (const wing of Object.values(this.wings)) wing.membrane.geometry.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}

function createGeometries() {
  return {
    tapered: withFacetTones(new THREE.CylinderGeometry(0.68, 1, 1, 7, 1, false), [0.52, 0.66, 0.82, 1]),
    bone: withFacetTones(new THREE.CylinderGeometry(0.62, 1, 1, 5, 1, false), [0.58, 0.74, 0.9, 1]),
    mass: withFacetTones(new THREE.IcosahedronGeometry(1, 1), [0.5, 0.64, 0.8, 0.96]),
    head: withFacetTones(new THREE.DodecahedronGeometry(1, 0), [0.54, 0.7, 0.86, 1]),
    eye: withFacetTones(new THREE.IcosahedronGeometry(1, 1), [0.72, 0.84, 1]),
    claw: withFacetTones(new THREE.ConeGeometry(1, 2.6, 4, 1), [0.58, 0.76, 0.94]),
    spine: withFacetTones(new THREE.ConeGeometry(1, 2.2, 4, 1), [0.5, 0.68, 0.86])
  };
}

function createMaterials(palette) {
  const standard = (colour, options = {}) => new THREE.MeshStandardMaterial({ color: cssColour(colour), roughness: options.roughness ?? 0.78, metalness: 0, flatShading: true, vertexColors: true, side: options.side ?? THREE.FrontSide, emissive: options.emissive ? cssColour(options.emissive) : 0x000000, emissiveIntensity: options.emissive ? 1.8 : 0 });
  return {
    hide: standard(palette.hide ?? '#5c2f25'),
    hideDark: standard(palette.hideDark ?? '#2d1714'),
    hideRim: standard(palette.hideRim ?? '#d18355', { roughness: 0.64 }),
    membrane: standard(palette.wingMembrane ?? '#2d1714', { side: THREE.DoubleSide, roughness: 0.9 }),
    eye: standard(palette.eye ?? '#ffd684', { emissive: palette.eye ?? '#ffd684', roughness: 0.25 }),
    claw: standard('#c5a887', { roughness: 0.66 })
  };
}

function withFacetTones(source, tones) {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 3) {
    const face = index / 3;
    const tone = tones[(face * 5 + Math.floor(face / 3)) % tones.length];
    for (let vertex = 0; vertex < 3 && index + vertex < position.count; vertex += 1) {
      const offset = (index + vertex) * 3;
      colours[offset] = tone;
      colours[offset + 1] = tone;
      colours[offset + 2] = tone;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

function createMeshArray(group, geometry, material, count) {
  return Array.from({ length: count }, () => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });
}

function createInstancedMesh(group, geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}

function setPoint(target, point, height) {
  target.set(Number(point?.x ?? 0) * WORLD_SCALE.tileMeters, height, Number(point?.y ?? 0) * WORLD_SCALE.tileMeters);
}

function orientToward(mesh, from, to) {
  if (!from || !to) return;
  const dx = (Number(to.x) - Number(from.x)) * WORLD_SCALE.tileMeters;
  const dz = (Number(to.y) - Number(from.y)) * WORLD_SCALE.tileMeters;
  mesh.rotation.y = Math.atan2(dx, dz);
}

function widthMeters(point, fallback) { return Math.max(0.025, Number(point?.width ?? fallback) * WORLD_SCALE.tileMeters); }
function axialHeight(index) { return [0.7, 0.61, 0.48, 0.38][index] ?? 0.38; }

function cssColour(value) {
  const match = String(value ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return match ? (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]) : value ?? '#ffffff';
}

function countMeshes(root) {
  let count = 0;
  root.traverse((object) => { if (object.isMesh) count += 1; });
  return count;
}
