import * as THREE from 'three';
import { RENDER_BUDGETS } from '../../../data/renderBudgets.js';
import { WORLD_SCALE } from '../../../data/worldScale.js';

export const THREE_FOLIAGE_FIRE_EFFECTS_CONTRACT = 'black-sky-bound.three-foliage-fire-effects.v1';

const FLAME_CAPACITY = 64;
const SMOKE_CAPACITY = RENDER_BUDGETS.smokeField.maxSources;
const IDENTITY = new THREE.Quaternion();

export function isFoliageSmoke(packet) {
  return packet?.sourceKind === 'burning_foliage_smoke'
    || packet?.sourceKind === 'smoulder_patch_wisp';
}

export class ThreeFoliageFireEffects {
  constructor(root, tileSize) {
    this.root = new THREE.Group();
    this.root.name = 'three:foliage-fire-effects';
    this.root.userData.contract = THREE_FOLIAGE_FIRE_EFFECTS_CONTRACT;
    root.add(this.root);
    this.tileSize = tileSize;
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.colour = new THREE.Color();
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.visibilitySphere = new THREE.Sphere(new THREE.Vector3(), 1);
    this.geometries = [createFlameTuftGeometry(), createSmokeWispGeometry()];
    this.materials = [
      flameMaterial('#ffffff', '#ff6f22', 1.35),
      flameMaterial('#ffffff', '#ff9a3d', 1.8),
      smokeMaterial()
    ];
    this.flames = this.batch('flame-tufts', this.geometries[0], this.materials[0], FLAME_CAPACITY, 3);
    this.cores = this.batch('flame-cores', this.geometries[0], this.materials[1], FLAME_CAPACITY, 4);
    this.smoke = this.batch('smoke-wisps', this.geometries[1], this.materials[2], SMOKE_CAPACITY, 2);
    this.stats = emptyStats();
  }

  update(smokePackets = [], fires = [], renderTime = 0, view = {}) {
    let flameCount = 0;
    let smokeCount = 0;
    let culledFires = 0;
    let culledSmoke = 0;
    const frustumActive = this.updateFrustum(view.camera);
    for (const packet of smokePackets) {
      if (!isFoliageSmoke(packet) || smokeCount >= SMOKE_CAPACITY) continue;
      if (frustumActive && !this.packetVisible(packet, Number(packet.heightMeters) || 1, Math.max(0.5, pixelsToMeters(packet.radius, this.tileSize) * 3.2))) {
        culledSmoke += 1;
        continue;
      }
      this.writeSmoke(packet, smokeCount, renderTime);
      smokeCount += 1;
    }
    for (const fire of fires) {
      if (frustumActive && !this.packetVisible(fire, Math.max(0.5, Number(fire.physicalHeightMeters) * 0.5), fire.family === 'tree' ? 1.8 : 0.7)) {
        culledFires += 1;
        continue;
      }
      flameCount = this.writeFire(fire, flameCount, renderTime);
    }
    this.flush(this.flames, flameCount);
    this.flush(this.cores, flameCount);
    this.flush(this.smoke, smokeCount);
    this.stats = {
      contract: THREE_FOLIAGE_FIRE_EFFECTS_CONTRACT,
      flameTufts: flameCount,
      smokeWisps: smokeCount,
      culledFires,
      culledSmokeWisps: culledSmoke,
      drawCalls: [this.flames, this.cores, this.smoke].filter((mesh) => mesh.visible).length,
      primitiveFallbacks: 0,
      geometryPolicy: 'grounded_tapered_flame_tufts_and_crossed_rising_smoke_ribbons',
      lodPolicy: 'camera_frustum_sphere_cull_before_instance_upload_v1'
    };
  }

  updateFrustum(camera) {
    if (!camera?.isCamera) return false;
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return true;
  }

  packetVisible(packet, height, radius) {
    this.worldPoint(this.visibilitySphere.center, packet.worldX, packet.worldY, height);
    this.visibilitySphere.radius = radius;
    return this.frustum.intersectsSphere(this.visibilitySphere);
  }

  writeFire(fire, count, renderTime) {
    if (count >= FLAME_CAPACITY || fire.family !== 'tree' && fire.phase === 'burnt_out') return count;
    const tree = fire.family === 'tree';
    const nodeCount = tree && fire.phase !== 'burnt_out' ? 2 : 1;
    const heat = clamp01(fire.heatAmount);
    for (let index = 0; index < nodeCount && count < FLAME_CAPACITY; index += 1) {
      const side = nodeCount === 1 ? 0 : index === 0 ? -0.22 : 0.22;
      const seed = numericSeed(`${fire.id}:${index}`);
      const pulse = 0.88 + Math.sin(renderTime * (7.1 + seed * 1.8) + seed * 31) * 0.12;
      const height = (tree ? 0.68 + heat * 1.02 : 0.16 + heat * 0.3) * pulse;
      const width = (tree ? 0.14 + heat * 0.12 : 0.052 + heat * 0.055) * (0.92 + seed * 0.14);
      const rootHeight = tree ? Math.max(0.72, Number(fire.physicalHeightMeters) * 0.5) + index * 0.34 : 0.025;
      this.worldPoint(this.position, fire.worldX + side * this.tileSize, fire.worldY, rootHeight);
      this.quaternion.setFromEuler(this.euler.set(Math.sin(seed * 17 + renderTime * 3.2) * 0.06, seed * Math.PI * 2, Math.cos(seed * 19 + renderTime * 2.8) * 0.06));
      this.scale.set(width, height, width);
      this.write(this.flames, count, this.position, this.quaternion, this.scale, fireColour(fire, false));
      this.scale.set(width * 0.48, height * 0.72, width * 0.48);
      this.write(this.cores, count, this.position, this.quaternion, this.scale, fireColour(fire, true));
      count += 1;
    }
    return count;
  }

  writeSmoke(packet, index, renderTime) {
    const radius = Math.max(0.04, pixelsToMeters(packet.radius, this.tileSize));
    const tree = packet.shape === 'rising_burning_tree_plume';
    const smoulder = packet.sourceKind === 'smoulder_patch_wisp';
    const seed = numericSeed(packet.id ?? `${packet.worldX}:${packet.worldY}`);
    const sway = Math.sin(renderTime * (0.62 + seed * 0.26) + seed * 37);
    const width = radius * (tree ? 0.7 : smoulder ? 0.42 : 0.58);
    const height = radius * (tree ? 3.1 : smoulder ? 1.18 : 1.9);
    const baseHeight = Number.isFinite(packet.heightMeters) ? packet.heightMeters : tree ? 1.45 : 0.055;
    this.worldPoint(this.position, packet.worldX, packet.worldY, baseHeight);
    this.quaternion.setFromEuler(this.euler.set(sway * 0.075, seed * Math.PI * 2 + renderTime * 0.035, -sway * 0.055));
    this.scale.set(Math.max(0.035, width), Math.max(0.12, height), Math.max(0.035, width));
    this.write(this.smoke, index, this.position, this.quaternion, this.scale, smoulder ? '#5c493d' : '#55534c');
  }

  write(mesh, index, position, quaternion, scale, colour) {
    this.matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, this.matrix);
    mesh.setColorAt(index, this.colour.set(colour));
  }

  flush(mesh, count) {
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  batch(name, geometry, material, capacity, renderOrder) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `foliage-fire:${name}`;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(mesh);
    return mesh;
  }

  worldPoint(target, worldX, worldY, height) {
    return target.set(
      Number(worldX) / this.tileSize * WORLD_SCALE.tileMeters,
      Number(height) || 0,
      Number(worldY) / this.tileSize * WORLD_SCALE.tileMeters
    );
  }

  diagnostics() { return { ...this.stats }; }

  dispose() {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}

function createFlameTuftGeometry() {
  const positions = [];
  const indices = [];
  appendTongue(positions, indices, -0.26, 0.03, 0.66, 0.38);
  appendTongue(positions, indices, 0.18, -0.08, 1, 0.5);
  appendTongue(positions, indices, 0.34, 0.12, 0.52, 0.3);
  return finishGeometry(positions, indices);
}

function appendTongue(positions, indices, x, z, height, radius) {
  const start = positions.length / 3;
  positions.push(
    x - radius, 0, z - radius * 0.42,
    x + radius, 0, z - radius * 0.42,
    x + radius * 0.62, 0, z + radius * 0.52,
    x - radius * 0.62, 0, z + radius * 0.52,
    x + radius * 0.16, height, z - radius * 0.08
  );
  indices.push(start, start + 1, start + 4, start + 1, start + 2, start + 4, start + 2, start + 3, start + 4, start + 3, start, start + 4);
}

function createSmokeWispGeometry() {
  const positions = [];
  const indices = [];
  appendRibbon(positions, indices, 'x');
  appendRibbon(positions, indices, 'z');
  return finishGeometry(positions, indices);
}

function appendRibbon(positions, indices, axis) {
  const centers = [-0.08, 0.12, -0.04, 0.16, 0.04];
  const widths = [0.32, 0.46, 0.38, 0.25, 0.015];
  const start = positions.length / 3;
  for (let index = 0; index < centers.length; index += 1) {
    const y = index / (centers.length - 1);
    const center = centers[index];
    const width = widths[index];
    if (axis === 'x') positions.push(center - width, y, 0, center + width, y, 0);
    else positions.push(0, y, center - width, 0, y, center + width);
    if (index > 0) {
      const previous = start + (index - 1) * 2;
      const current = start + index * 2;
      indices.push(previous, previous + 1, current, previous + 1, current + 1, current);
    }
  }
}

function finishGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function flameMaterial(colour, emissive, emissiveIntensity) {
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    emissive,
    emissiveIntensity,
    roughness: 0.42,
    metalness: 0,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    flatShading: true,
    side: THREE.DoubleSide
  });
  material.forceSinglePass = true;
  return material;
}

function smokeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    flatShading: true,
    side: THREE.DoubleSide
  });
  material.forceSinglePass = true;
  return material;
}

function fireColour(fire, core) {
  if (fire.phase === 'burnt_out') return core ? '#8b3a1b' : '#4d2118';
  if (fire.phase === 'smoulder_low') return core ? '#ff8a3d' : '#8e2d17';
  if (fire.phase === 'smoulder_high') return core ? '#ffb45d' : '#c83b17';
  return core ? '#ffd08a' : '#ff5b18';
}

function numericSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function pixelsToMeters(value, tileSize) { return Math.max(0, Number(value ?? 0)) / tileSize * WORLD_SCALE.tileMeters; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function emptyStats() {
  return {
    contract: THREE_FOLIAGE_FIRE_EFFECTS_CONTRACT,
    flameTufts: 0,
    smokeWisps: 0,
    culledFires: 0,
    culledSmokeWisps: 0,
    drawCalls: 0,
    primitiveFallbacks: 0,
    geometryPolicy: 'grounded_tapered_flame_tufts_and_crossed_rising_smoke_ribbons',
    lodPolicy: 'camera_frustum_sphere_cull_before_instance_upload_v1'
  };
}
