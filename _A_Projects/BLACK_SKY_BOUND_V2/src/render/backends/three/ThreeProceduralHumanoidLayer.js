import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';

export const THREE_PROCEDURAL_HUMANOID_CONTRACT = 'black-sky-bound.three-procedural-humanoid-layer.v1';

const UP = new THREE.Vector3(0, 1, 0);

export class ThreeProceduralHumanoidLayer {
  constructor(root) {
    this.root = new THREE.Group();
    this.root.name = 'actors:procedural-humanoids';
    this.root.userData.contract = THREE_PROCEDURAL_HUMANOID_CONTRACT;
    root.add(this.root);
    this.geometries = createGeometries();
    this.materials = new Map();
    this.buckets = new Map();
    this.allocations = 0;
    this.topologyBuilds = 0;
    this.topologyRebuilds = 0;
    this.stats = emptyStats();
  }

  update(actors = [], player = null) {
    const requests = new Map();
    const recipeIds = new Set();
    const signatures = new Set();
    const seedProvenance = new Set();
    const attachmentIds = new Set();
    const missingSocketErrors = [];
    let readyActorCount = 0;
    for (const actor of actors) {
      recipeIds.add(actor.creatureRecipe?.recipeId ?? 'missing');
      if (actor.creatureRecipe?.variantSignature) signatures.add(actor.creatureRecipe.variantSignature);
      if (actor.creatureRecipe?.seedProvenance) seedProvenance.add(`${actor.creatureRecipe.seed}:${actor.creatureRecipe.seedProvenance.kind}:${actor.creatureRecipe.seedProvenance.sourceId}`);
      for (const id of actor.creatureRecipe?.appearance?.attachmentIds ?? []) attachmentIds.add(id);
      if (!actor.humanoidProjection?.points?.chest) continue;
      readyActorCount += 1;
      buildActorRequests(actor, requests, missingSocketErrors, isShadowEligible(actor, player));
    }
    let primitiveCount = 0;
    let capacity = 0;
    let activeDrawFamilies = 0;
    for (const [key, bucket] of this.buckets) {
      const values = requests.get(key) ?? [];
      if (values.length > bucket.capacity) this.replaceBucket(key, bucket, values[0], values.length);
    }
    for (const [key, values] of requests) {
      let bucket = this.buckets.get(key);
      if (!bucket) bucket = this.createBucket(key, values[0], values.length);
      bucket.mesh.count = values.length;
      bucket.mesh.castShadow = values.some((value) => value.castShadow);
      bucket.mesh.receiveShadow = true;
      values.forEach((value, index) => bucket.mesh.setMatrixAt(index, value.matrix));
      bucket.mesh.instanceMatrix.needsUpdate = values.length > 0;
      primitiveCount += values.length;
      capacity += bucket.capacity;
      if (values.length > 0) activeDrawFamilies += 1;
    }
    for (const [key, bucket] of this.buckets) {
      if (requests.has(key)) continue;
      bucket.mesh.count = 0;
      capacity += bucket.capacity;
    }
    this.stats = {
      contract: THREE_PROCEDURAL_HUMANOID_CONTRACT,
      actorCount: actors.length,
      readyActorCount,
      primitiveCount,
      drawFamilyCount: activeDrawFamilies,
      pooledDrawFamilyCount: this.buckets.size,
      capacity,
      allocations: this.allocations,
      topologyBuilds: this.topologyBuilds,
      topologyRebuilds: this.topologyRebuilds,
      materialCount: this.materials.size,
      recipeIds: [...recipeIds].sort(),
      variantSignatures: [...signatures].sort(),
      seedProvenance: [...seedProvenance].sort(),
      attachmentIds: [...attachmentIds].sort(),
      missingSocketErrors
    };
  }

  createBucket(key, request, count) {
    const capacity = nextCapacity(count);
    const material = this.material(request.material);
    const geometry = this.geometries[request.geometryRole];
    if (!geometry) throw new Error(`procedural_humanoid_geometry_role_unknown:${request.geometryRole}`);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `procedural-humanoid:${key}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(mesh);
    const bucket = { mesh, capacity, geometryRole: request.geometryRole, materialKey: materialKey(request.material) };
    this.buckets.set(key, bucket);
    this.allocations += 1;
    this.topologyBuilds += 1;
    return bucket;
  }

  replaceBucket(key, bucket, request, count) {
    bucket.mesh.removeFromParent();
    this.buckets.delete(key);
    this.topologyRebuilds += 1;
    return this.createBucket(key, request, count);
  }

  material(definition) {
    const key = materialKey(definition);
    if (!this.materials.has(key)) {
      const emissiveIntensity = definition.emissiveIntensity > 0 ? definition.emissiveIntensity : definition.nightReveal;
      const emissive = emissiveIntensity > 0 ? definition.colour : '#000000';
      this.materials.set(key, new THREE.MeshStandardMaterial({
        color: definition.colour,
        roughness: definition.roughness,
        metalness: definition.metalness,
        emissive,
        emissiveIntensity,
        flatShading: true
      }));
    }
    return this.materials.get(key);
  }

  diagnostics() { return { ...this.stats }; }

  dispose() {
    for (const bucket of this.buckets.values()) bucket.mesh.removeFromParent();
    this.buckets.clear();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.root.removeFromParent();
  }
}

function buildActorRequests(actor, requests, errors, castShadow) {
  const projection = actor.humanoidProjection;
  const recipe = actor.creatureRecipe;
  const assembly = recipe.bodyPlan?.meshAssembly;
  if (!assembly) throw new Error(`procedural_humanoid_mesh_assembly_missing:${recipe.recipeId}`);
  for (const segment of assembly.segments ?? []) {
    const a = actorPoint(projection.points, segment.from);
    const b = actorPoint(projection.points, segment.to);
    if (!a || !b) { errors.push(`${actor.id}:${segment.id}:pose_point_missing`); continue; }
    const radius = Math.max(0.035, Number(projection.profile?.limbs?.[segment.radiusField] ?? 0.055) * 1.18);
    queue(requests, 'faceted_segment', material(recipe, segment.materialRole), segmentMatrix(a, b, radius), actor, segment.id, castShadow);
  }
  for (const mass of assembly.masses ?? []) addBodyMass(requests, actor, mass, castShadow, errors);
  addTorsoShell(requests, actor, castShadow);
  addHeadwear(requests, actor, castShadow, errors);
  addShoulderPad(requests, actor, castShadow, errors);
  addTorsoWrap(requests, actor, castShadow, errors);
  addBelt(requests, actor, castShadow, errors);
  addPack(requests, actor, castShadow, errors);
  addSpear(requests, actor, castShadow, errors);
  addTorch(requests, actor, castShadow, errors);
}

function addBodyMass(requests, actor, mass, castShadow, errors) {
  const point = actorPoint(actor.humanoidProjection.points, mass.anchor);
  if (!point) { errors.push(`${actor.id}:${mass.id}:pose_point_missing`); return; }
  const profile = actor.humanoidProjection.profile;
  const forward = actorForward(actor);
  let scale;
  if (mass.geometryRole === 'torso_mass') scale = [profile.body.shoulderWidth * 0.56, 0.34, 0.2];
  else if (mass.geometryRole === 'hip_mass') scale = [profile.body.hipWidth * 0.62, 0.22, 0.2];
  else if (mass.geometryRole === 'head_mass') scale = [profile.head.radius * 0.92, profile.head.radius * 1.08, profile.head.radius * 0.86];
  else if (mass.geometryRole === 'hand_mass') scale = [profile.limbs.handRadius * 0.82, profile.limbs.handRadius, profile.limbs.handRadius * 0.68];
  else scale = [profile.limbs.footRadius * 1.18, profile.limbs.footRadius * 0.62, profile.limbs.footRadius * 0.82];
  queue(requests, 'faceted_mass', material(actor.creatureRecipe, mass.materialRole), boxMatrix(point, scale, forward), actor, mass.id, castShadow);
}

function addTorsoShell(requests, actor, castShadow) {
  const points = actor.humanoidProjection.points;
  const chest = actorPoint(points, 'chest');
  const hips = actorPoint(points, 'hips');
  const profile = actor.humanoidProjection.profile;
  const center = chest.clone().lerp(hips, 0.48);
  const height = Math.max(0.36, chest.distanceTo(hips) + 0.24);
  const scale = [profile.body.shoulderWidth * 0.48, height, profile.body.hipWidth * 0.48];
  queue(requests, 'cloth_shell', material(actor.creatureRecipe, 'cloth'), boxMatrix(center, scale, actorForward(actor)), actor, 'cloth_torso_shell', castShadow);
}

function addHeadwear(requests, actor, castShadow, errors) {
  const attachment = actor.creatureRecipe.attachments?.head;
  const socket = actorSocket(actor, 'head', errors);
  if (!attachment || !socket) return;
  const radius = actor.humanoidProjection.profile.head.radius;
  const cowlScale = attachment.style === 'wrapped_mask' ? 1.03 : 1.18;
  queue(requests, 'faceted_mass', material(actor.creatureRecipe, 'cloth'), boxMatrix(socket.point, [radius * cowlScale, radius * 1.16, radius * cowlScale], socket.forward), actor, attachment.id, castShadow);
  const maskCenter = socket.point.clone().add(mapVector(socket.forward).multiplyScalar(radius * 0.82)).add(new THREE.Vector3(0, -radius * 0.12, 0));
  const maskRole = attachment.style === 'wrapped_mask' ? 'cloth' : 'leather';
  queue(requests, 'box_detail', material(actor.creatureRecipe, maskRole), boxMatrix(maskCenter, [radius * 0.72, radius * 0.52, radius * 0.16], socket.forward), actor, `${attachment.id}:mask`, castShadow);
}

function addShoulderPad(requests, actor, castShadow, errors) {
  const attachment = actor.creatureRecipe.attachments?.shoulder;
  if (!attachment) return;
  const socketName = attachment.style === 'left' ? 'leftShoulder' : 'rightShoulder';
  const socket = actorSocket(actor, socketName, errors);
  if (!socket) return;
  const offset = mapVector(socket.right).multiplyScalar(attachment.style === 'left' ? -0.045 : 0.045);
  const center = socket.point.clone().add(offset).add(new THREE.Vector3(0, 0.04, 0));
  queue(requests, 'faceted_mass', material(actor.creatureRecipe, 'metal'), boxMatrix(center, [0.17, 0.1, 0.2], socket.forward), actor, attachment.id, castShadow);
}

function addTorsoWrap(requests, actor, castShadow, errors) {
  const attachment = actor.creatureRecipe.attachments?.torso;
  if (!attachment) return;
  const p = actor.humanoidProjection.points;
  const leftShoulder = actorPoint(p, 'leftShoulder');
  const rightShoulder = actorPoint(p, 'rightShoulder');
  const leftHip = actorPoint(p, 'leftHip');
  const rightHip = actorPoint(p, 'rightHip');
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) { errors.push(`${actor.id}:${attachment.id}:torso_points_missing`); return; }
  queue(requests, 'faceted_segment', material(actor.creatureRecipe, 'cloth'), segmentMatrix(leftShoulder, rightHip, 0.043), actor, `${attachment.id}:a`, castShadow);
  if (attachment.style === 'cross_wrap') queue(requests, 'faceted_segment', material(actor.creatureRecipe, 'cloth'), segmentMatrix(rightShoulder, leftHip, 0.037), actor, `${attachment.id}:b`, castShadow);
}

function addBelt(requests, actor, castShadow, errors) {
  const attachment = actor.creatureRecipe.attachments?.belt;
  const socket = actorSocket(actor, 'hips', errors);
  if (!attachment || !socket) return;
  queue(requests, 'box_detail', material(actor.creatureRecipe, 'leather'), boxMatrix(socket.point, [0.38, 0.07, 0.25], socket.forward), actor, attachment.id, castShadow);
  if (attachment.style === 'studded') {
    const front = socket.point.clone().add(mapVector(socket.forward).multiplyScalar(0.14));
    queue(requests, 'faceted_mass', material(actor.creatureRecipe, 'metal'), boxMatrix(front, [0.055, 0.055, 0.035], socket.forward), actor, `${attachment.id}:buckle`, castShadow);
  }
}

function addPack(requests, actor, castShadow, errors) {
  const attachment = actor.creatureRecipe.attachments?.back;
  const socket = actorSocket(actor, 'back', errors);
  if (!attachment || !socket) return;
  const back = socket.point.clone().add(mapVector(socket.forward).multiplyScalar(-0.11));
  if (attachment.style === 'bedroll') {
    const right = mapVector(socket.right).multiplyScalar(0.2);
    queue(requests, 'roll_detail', material(actor.creatureRecipe, 'cloth'), segmentMatrix(back.clone().sub(right), back.clone().add(right), 0.105), actor, attachment.id, castShadow);
  } else {
    queue(requests, 'box_detail', material(actor.creatureRecipe, 'leather'), boxMatrix(back, [0.24, 0.3, 0.15], socket.forward), actor, attachment.id, castShadow);
  }
}

function addSpear(requests, actor, castShadow, errors) {
  const attachment = actor.creatureRecipe.attachments?.primaryWeapon;
  if (!attachment) return;
  const butt = actorPoint(actor.humanoidProjection.points, 'spearButt');
  const tip = actorPoint(actor.humanoidProjection.points, 'spearTip');
  if (!butt || !tip) { errors.push(`${actor.id}:${attachment.id}:spear_points_missing`); return; }
  const axis = tip.clone().sub(butt).normalize();
  const headLength = attachment.style === 'broad' ? 0.22 : 0.17;
  const shaftTip = tip.clone().addScaledVector(axis, -headLength * 0.72);
  queue(requests, 'faceted_segment', material(actor.creatureRecipe, 'wood'), segmentMatrix(butt, shaftTip, 0.027), actor, `${attachment.id}:shaft`, castShadow);
  const width = attachment.style === 'broad' ? 0.115 : attachment.style === 'barbed' ? 0.085 : 0.072;
  queue(requests, 'cone_detail', material(actor.creatureRecipe, 'metal'), segmentMatrix(shaftTip, tip, width), actor, `${attachment.id}:head`, castShadow);
  if (attachment.style === 'barbed') {
    const barbEnd = shaftTip.clone().add(new THREE.Vector3(0, -0.08, 0)).addScaledVector(axis, -0.05);
    queue(requests, 'cone_detail', material(actor.creatureRecipe, 'metal'), segmentMatrix(shaftTip, barbEnd, 0.045), actor, `${attachment.id}:barb`, castShadow);
  }
}

function addTorch(requests, actor, castShadow, errors) {
  const attachment = actor.creatureRecipe.attachments?.light;
  if (!attachment) return;
  const grip = actorPoint(actor.humanoidProjection.points, 'torchGrip');
  const tip = actorPoint(actor.humanoidProjection.points, 'torchTip');
  const flame = actorPoint(actor.humanoidProjection.points, 'torchFlame');
  if (!grip || !tip || !flame) { errors.push(`${actor.id}:${attachment.id}:torch_points_missing`); return; }
  queue(requests, 'faceted_segment', material(actor.creatureRecipe, 'wood'), segmentMatrix(grip, tip, 0.034), actor, `${attachment.id}:shaft`, castShadow);
  const headRole = attachment.style === 'iron_basket' ? 'metal' : attachment.style === 'bound_reeds' ? 'cloth' : 'leather';
  const headScale = attachment.style === 'iron_basket' ? [0.105, 0.13, 0.105] : [0.09, 0.15, 0.09];
  queue(requests, attachment.style === 'iron_basket' ? 'faceted_mass' : 'cloth_shell', material(actor.creatureRecipe, headRole), boxMatrix(tip, headScale, actorForward(actor)), actor, `${attachment.id}:head`, castShadow);
  queue(requests, 'flame_detail', material(actor.creatureRecipe, 'fire'), segmentMatrix(tip, flame, 0.13), actor, `${attachment.id}:flame`, false);
}

function queue(requests, geometryRole, materialDef, matrix, actor, partId, castShadow) {
  const partCastsShadow = castShadow && /^(torso|hips|head|left_thigh|right_thigh|cloth_torso_shell)$/.test(partId);
  const key = `${geometryRole}:${materialKey(materialDef)}`;
  if (!requests.has(key)) requests.set(key, []);
  requests.get(key).push({ geometryRole, material: materialDef, matrix, actorId: actor.id, partId, castShadow: partCastsShadow });
}

function actorPoint(points, name) {
  const value = points?.[name];
  if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) return null;
  return new THREE.Vector3(value.x * WORLD_SCALE.tileMeters, Number.isFinite(value.height) ? value.height : heightFor(name), value.y * WORLD_SCALE.tileMeters);
}

function actorSocket(actor, name, errors) {
  const value = actor.humanoidProjection.sockets?.[name];
  if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) {
    errors.push(`${actor.id}:${name}:socket_missing`);
    return null;
  }
  return {
    point: new THREE.Vector3(value.x * WORLD_SCALE.tileMeters, Number.isFinite(value.height) ? value.height : heightFor(name), value.y * WORLD_SCALE.tileMeters),
    forward: value.forward ?? actorForward(actor),
    right: value.right ?? { x: -(value.forward?.y ?? 0), y: value.forward?.x ?? 1 }
  };
}

function actorForward(actor) {
  const socketForward = actor.humanoidProjection.sockets?.chest?.forward;
  if (socketForward) return socketForward;
  return { x: Math.cos(actor.rotation ?? 0), y: Math.sin(actor.rotation ?? 0) };
}

function material(recipe, role) {
  const value = recipe.surface?.materialRoles?.[role];
  if (!value) throw new Error(`procedural_humanoid_material_role_missing:${recipe.recipeId}:${role}`);
  return {
    role,
    paletteFamilyId: recipe.appearance?.paletteFamilyId ?? 'default',
    profileId: value.profileId,
    colour: value.colour,
    roughness: Number(value.roughness ?? 0.82),
    metalness: Number(value.metalness ?? 0),
    emissiveIntensity: Number(value.emissiveIntensity ?? 0),
    nightReveal: Number(value.nightReveal ?? 0)
  };
}

function materialKey(value) {
  return `${value.paletteFamilyId}:${value.role}:${value.profileId}:${value.colour}:${value.roughness}:${value.metalness}:${value.emissiveIntensity}:${value.nightReveal}`;
}

function segmentMatrix(a, b, radius) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(0.0001, direction.length());
  const position = a.clone().add(b).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(radius, length, radius));
}

function boxMatrix(position, dimensions, forward) {
  const z = mapVector(forward).normalize();
  const x = new THREE.Vector3(-z.z, 0, z.x).normalize();
  const basis = new THREE.Matrix4().makeBasis(x, UP, z);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(...dimensions));
}

function mapVector(value) { return new THREE.Vector3(Number(value?.x) || 0, 0, Number(value?.y) || 0); }

function isShadowEligible(actor, player) {
  return actor.team === 'player' || !player || Math.hypot(actor.x - player.x, actor.y - player.y) <= 9;
}

function nextCapacity(count) {
  let capacity = 8;
  while (capacity < Math.max(1, count)) capacity *= 2;
  return capacity;
}

function heightFor(name) {
  if (/Foot/.test(name)) return 0.08;
  if (/Knee/.test(name)) return 0.53;
  if (/Hip|hips/.test(name)) return 0.94;
  if (/chest|Shoulder/.test(name)) return 1.34;
  if (/head/.test(name)) return 1.68;
  if (/Elbow|Hand|Grip/.test(name)) return 1.05;
  if (/spearTip/.test(name)) return 1.2;
  if (/spearButt/.test(name)) return 0.9;
  if (/torchFlame/.test(name)) return 1.5;
  if (/torchTip/.test(name)) return 1.36;
  if (/back/.test(name)) return 1.3;
  return 1;
}

function createGeometries() {
  return {
    faceted_segment: new THREE.CylinderGeometry(1, 0.88, 1, 6, 1, false),
    faceted_mass: new THREE.IcosahedronGeometry(1, 1),
    cloth_shell: new THREE.CylinderGeometry(0.78, 1, 1, 6, 1, false),
    box_detail: new THREE.BoxGeometry(1, 1, 1),
    cone_detail: new THREE.ConeGeometry(1, 1, 5, 1, false),
    roll_detail: new THREE.CylinderGeometry(1, 1, 1, 8, 1, false),
    flame_detail: new THREE.ConeGeometry(1, 1, 6, 1, false)
  };
}

function emptyStats() {
  return {
    contract: THREE_PROCEDURAL_HUMANOID_CONTRACT,
    actorCount: 0,
    readyActorCount: 0,
    primitiveCount: 0,
    drawFamilyCount: 0,
    pooledDrawFamilyCount: 0,
    capacity: 0,
    allocations: 0,
    topologyBuilds: 0,
    topologyRebuilds: 0,
    materialCount: 0,
    recipeIds: [],
    variantSignatures: [],
    seedProvenance: [],
    attachmentIds: [],
    missingSocketErrors: []
  };
}
