import * as THREE from 'three';
import { RENDER_BUDGETS } from '../../../data/renderBudgets.js';
import { WORLD_SCALE } from '../../../data/worldScale.js';

export const THREE_BABY_NAPALM_DROOL_CONTRACT = 'black-sky-bound.three-baby-wyvern-napalm-drool.v1';

const UP = new THREE.Vector3(0, 1, 0);
const GROUND_QUATERNION = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const IDENTITY_QUATERNION = new THREE.Quaternion();
const DROPLET_CAPACITY = RENDER_BUDGETS.napalmDroplets.maxActive;
const POOL_CAPACITY = RENDER_BUDGETS.napalmPools.maxActive;

export function isBabyDroolSmoke(packet) {
  return packet?.sourceKind === 'napalm_droplet_wisp' || packet?.sourceKind === 'napalm_smoulder';
}

export function isBabyDroolParticle(packet) {
  return packet?.kind === 'napalm_ember'
    || (packet?.kind === 'ash_fleck' && packet?.sourceKind === 'napalm_smoulder');
}

export class ThreeBabyNapalmDroolLayer {
  constructor(root, tileSize) {
    this.root = new THREE.Group();
    this.root.name = 'three:baby-wyvern-napalm-drool';
    this.root.userData.contract = THREE_BABY_NAPALM_DROOL_CONTRACT;
    root.add(this.root);
    this.tileSize = tileSize;
    this.batches = new Map();
    this.batchList = [];
    this.geometries = [];
    this.materials = [];
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.previous = new THREE.Vector3();
    this.mouth = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.midpoint = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.colour = new THREE.Color();
    this.coolColour = new THREE.Color();
    this.hotColour = new THREE.Color();
    this.counts = Object.create(null);
    this.stats = emptyStats();
    this.createBatches();
  }

  createBatches() {
    const lowSphere = this.geometry(new THREE.IcosahedronGeometry(1, 1));
    const coarseSphere = this.geometry(new THREE.IcosahedronGeometry(1, 0));
    const strand = this.geometry(new THREE.CylinderGeometry(1, 0.72, 1, 6, 1, false));
    const disc = this.geometry(new THREE.CircleGeometry(1, 11));
    const ring = this.geometry(new THREE.RingGeometry(0.68, 1, 11));
    const crown = this.geometry(new THREE.CylinderGeometry(0.72, 1, 0.18, 9, 1, true));
    const flame = this.geometry(new THREE.ConeGeometry(1, 1, 5, 1, false));

    // Instance colours carry the authored palette. A neutral base avoids multiplying
    // those already-dark hues a second time while retaining restrained emissive cores.
    this.batch('droplet-shadow', disc, DROPLET_CAPACITY, material('#ffffff', { basic: true, transparent: true, opacity: 0.3, depthWrite: false }));
    this.batch('droplet-strand', strand, DROPLET_CAPACITY, material('#ffffff', { roughness: 0.28, emissive: '#341008', emissiveIntensity: 0.42 }));
    this.batch('droplet-body', lowSphere, DROPLET_CAPACITY, material('#ffffff', { roughness: 0.24, emissive: '#441308', emissiveIntensity: 0.5 }));
    this.batch('droplet-core', coarseSphere, DROPLET_CAPACITY, material('#ffffff', { roughness: 0.2, emissive: '#ff641f', emissiveIntensity: 1.15 }));
    this.batch('smoke-wisp', lowSphere, (DROPLET_CAPACITY + POOL_CAPACITY) * 2, material('#ffffff', { transparent: true, opacity: 0.24, depthWrite: false, roughness: 1 }));
    this.batch('pool-lobe', disc, POOL_CAPACITY * 3, material('#ffffff', { transparent: true, opacity: 0.92, depthWrite: true, roughness: 0.44, polygonOffset: true }));
    this.batch('pool-edge', ring, POOL_CAPACITY * 3, material('#ffffff', { transparent: true, opacity: 0.68, depthWrite: false, emissive: '#7c210d', emissiveIntensity: 0.75, polygonOffset: true }));
    this.batch('hot-root', disc, POOL_CAPACITY * 2, material('#ffffff', { transparent: true, opacity: 0.7, depthWrite: false, emissive: '#ff6a20', emissiveIntensity: 1.05, polygonOffset: true }));
    this.batch('impact-crown', crown, POOL_CAPACITY, material('#ffffff', { transparent: true, opacity: 0.64, depthWrite: false, emissive: '#7f210d', emissiveIntensity: 0.7 }));
    this.batch('impact-bead', coarseSphere, POOL_CAPACITY * 4, material('#ffffff', { roughness: 0.3, emissive: '#7e210d', emissiveIntensity: 0.7 }));
    this.batch('flame', flame, POOL_CAPACITY * 2, material('#ffffff', { transparent: true, opacity: 0.86, depthWrite: false, emissive: '#ff5e1d', emissiveIntensity: 1.5 }));
    this.batch('spark', coarseSphere, RENDER_BUDGETS.ambientParticles.maxActive, material('#ffffff', { emissive: '#ff7b2a', emissiveIntensity: 1.4, roughness: 0.32 }));
  }

  update({ projectiles = [], hazards = [], smoke = [], particles = [], renderTime = 0 } = {}) {
    this.resetCounts();
    for (const packet of projectiles) this.addDroplet(packet);
    for (const packet of hazards) this.addPool(packet, renderTime);
    for (const packet of smoke) this.addSmoke(packet, renderTime);
    for (const packet of particles) this.addParticle(packet);
    this.flushBatches();
    this.stats = {
      contract: THREE_BABY_NAPALM_DROOL_CONTRACT,
      projectiles: projectiles.length,
      hazards: hazards.length,
      smokeSources: smoke.length,
      particles: particles.length,
      visibleInstances: this.visibleInstances(),
      drawFamilies: this.batchList.filter((entry) => entry.mesh.count > 0).length,
      batchCount: this.batchList.length,
      geometryCount: this.geometries.length,
      materialCount: this.materials.length,
      capacities: {
        droplets: DROPLET_CAPACITY,
        pools: POOL_CAPACITY,
        poolLobes: POOL_CAPACITY * 3,
        smokeWisps: (DROPLET_CAPACITY + POOL_CAPACITY) * 2,
        particles: RENDER_BUDGETS.ambientParticles.maxActive
      }
    };
  }

  addDroplet(packet) {
    const radius = Math.max(0.014, pixelsToMeters(packet.radius, this.tileSize));
    this.worldPoint(this.position, packet.worldX, packet.worldY, packet.heightMeters ?? 0.3);
    this.worldPoint(this.previous, packet.previousWorldX, packet.previousWorldY, packet.previousHeightMeters ?? packet.heightMeters ?? 0.3);
    this.direction.subVectors(this.position, this.previous);
    if (this.direction.lengthSq() < 0.00001) this.direction.set(0, -1, 0);
    this.quaternion.setFromUnitVectors(UP, this.direction.normalize());
    const stretch = Math.max(1, Math.min(2.5, Number(packet.stretch) || 1.25));
    this.scale.set(radius * 0.82, radius * stretch, radius * 0.92);
    this.write('droplet-body', this.position, this.quaternion, this.scale, packet.colour ?? '#7d2514');

    this.midpoint.copy(this.position).addScaledVector(this.direction, radius * 0.22);
    this.scale.set(radius * 0.38, radius * Math.min(1.18, stretch * 0.62), radius * 0.43);
    this.write('droplet-core', this.midpoint, this.quaternion, this.scale, packet.coreColour ?? '#d94a18');

    if (!packet.separated) {
      this.worldPoint(this.mouth, packet.socketWorldX, packet.socketWorldY, packet.mouthHeightMeters ?? 0.61);
      const strandRadius = Math.max(0.006, radius * (0.34 - (packet.attachment01 ?? 0) * 0.12));
      this.writeSegment('droplet-strand', this.mouth, this.position, strandRadius, packet.colour ?? '#6c1a10');
    }

    this.worldPoint(this.previous, packet.groundWorldX, packet.groundWorldY, 0.014);
    const shadowScale = radius * (0.66 + (packet.flight01 ?? 0) * 0.74);
    this.scale.set(shadowScale * 1.28, shadowScale * 0.72, 1);
    this.write('droplet-shadow', this.previous, GROUND_QUATERNION, this.scale, packet.shadowColour ?? '#160a08');
  }

  addPool(packet, renderTime) {
    const radius = Math.max(0.022, pixelsToMeters(packet.radius, this.tileSize));
    const lobeCount = Math.max(1, Math.min(3, packet.lobeCount ?? 3));
    const heat = clamp01(packet.heat01);
    const life = clamp01(packet.life01);
    const shrink = life < 0.24 ? 0.58 + life * 1.75 : 1;
    const seed = numericSeed(packet);
    const incomingLength = Math.hypot(packet.incomingX ?? 0, packet.incomingY ?? 0) || 1;
    const incomingX = (packet.incomingX ?? 0) / incomingLength;
    const incomingZ = (packet.incomingY ?? 0) / incomingLength;
    const body = this.blendColour(packet.coolingColour ?? '#22100e', packet.colour ?? '#46110c', heat * 0.72 + 0.18);

    for (let index = 0; index < lobeCount; index += 1) {
      const angle = seed * Math.PI * 2 + index * 2.17;
      const secondary = index > 0;
      const offset = secondary ? radius * (0.26 + seeded01(seed, index, 13) * 0.2) : 0;
      const bias = secondary ? radius * 0.11 * (index === 1 ? 1 : -0.5) : 0;
      const worldX = packet.worldX / this.tileSize * WORLD_SCALE.tileMeters
        + Math.cos(angle) * offset + incomingX * bias;
      const worldZ = packet.worldY / this.tileSize * WORLD_SCALE.tileMeters
        + Math.sin(angle) * offset + incomingZ * bias;
      const lobeScale = (secondary ? 0.5 + seeded01(seed, index, 29) * 0.2 : 0.9) * shrink;
      this.position.set(worldX, 0.015 + index * 0.0008, worldZ);
      this.quaternion.setFromEuler(this.euler.set(-Math.PI / 2, 0, angle));
      this.scale.set(radius * lobeScale * (1.08 + seeded01(seed, index, 41) * 0.3), radius * lobeScale * (0.7 + seeded01(seed, index, 53) * 0.18), 1);
      this.write('pool-lobe', this.position, this.quaternion, this.scale, body);
      if (heat > 0.045) {
        this.scale.multiplyScalar(0.94 + heat * 0.08);
        this.write('pool-edge', this.position, this.quaternion, this.scale, packet.hotColour ?? '#b53614');
      }
    }

    const hotSpotCount = heat > 0.06 ? Math.max(1, Math.min(2, packet.hotSpotCount ?? 2)) : 0;
    for (let index = 0; index < hotSpotCount; index += 1) {
      const angle = seed * 5.4 + index * 2.7;
      const offset = radius * (0.1 + index * 0.15);
      this.position.set(
        packet.worldX / this.tileSize * WORLD_SCALE.tileMeters + Math.cos(angle) * offset,
        0.019,
        packet.worldY / this.tileSize * WORLD_SCALE.tileMeters + Math.sin(angle) * offset
      );
      const size = radius * (0.16 + heat * 0.14) * (index ? 0.7 : 1);
      this.scale.set(size * 1.3, size * 0.72, 1);
      this.write('hot-root', this.position, GROUND_QUATERNION, this.scale, packet.hotColour ?? '#df4917');
    }

    if ((packet.impactLife01 ?? 0) > 0.01) this.addImpact(packet, radius, seed);
    if ((packet.flame01 ?? 0) > 0.025) this.addFlame(packet, radius, seed, renderTime);
  }

  addImpact(packet, radius, seed) {
    const impact = clamp01(packet.impact01);
    const impactLife = clamp01(packet.impactLife01);
    this.worldPoint(this.position, packet.worldX, packet.worldY, 0.025 + impact * 0.025);
    const crownScale = radius * (0.28 + impact * 1.1);
    this.scale.set(crownScale * 1.35, 0.22 + impactLife * 0.42, crownScale * 0.82);
    this.write('impact-crown', this.position, IDENTITY_QUATERNION, this.scale, packet.hotColour ?? '#9e2c12');
    for (let index = 0; index < 4; index += 1) {
      const angle = seed * Math.PI * 2 + index * 1.57 + seeded01(seed, index, 71) * 0.45;
      const travel = radius * (0.4 + index * 0.16) * impact;
      const height = 0.025 + 4 * impact * (1 - impact) * (0.07 + index * 0.012);
      this.position.set(
        packet.worldX / this.tileSize * WORLD_SCALE.tileMeters + Math.cos(angle) * travel,
        height,
        packet.worldY / this.tileSize * WORLD_SCALE.tileMeters + Math.sin(angle) * travel
      );
      const size = radius * (0.1 + seeded01(seed, index, 83) * 0.055) * (0.72 + impactLife * 0.28);
      this.scale.setScalar(size);
      this.write('impact-bead', this.position, IDENTITY_QUATERNION, this.scale, index % 2 ? packet.colour : packet.hotColour);
    }
  }

  addFlame(packet, radius, seed, renderTime) {
    const flame = clamp01(packet.flame01);
    const count = flame > 0.34 && seeded01(seed, 2, 107) > 0.42 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const pulse = 0.82 + Math.sin(renderTime * (8.2 + index * 1.3) + seed * 9.7 + index) * 0.18;
      const height = (0.12 + flame * 0.15) * pulse * (index ? 0.68 : 1);
      const angle = seed * 6.1 + index * 2.3;
      const offset = index ? radius * 0.22 : 0;
      this.position.set(
        packet.worldX / this.tileSize * WORLD_SCALE.tileMeters + Math.cos(angle) * offset,
        0.024 + height * 0.5,
        packet.worldY / this.tileSize * WORLD_SCALE.tileMeters + Math.sin(angle) * offset
      );
      this.quaternion.setFromEuler(this.euler.set(Math.sin(renderTime * 4 + angle) * 0.1, angle, Math.cos(renderTime * 5 + angle) * 0.08));
      this.scale.set((0.035 + radius * 0.08) * (index ? 0.72 : 1), height, (0.03 + radius * 0.06) * (index ? 0.72 : 1));
      this.write('flame', this.position, this.quaternion, this.scale, index ? '#8f2b12' : '#d54816');
    }
  }

  addSmoke(packet, renderTime) {
    const radius = Math.max(0.025, pixelsToMeters(packet.radius, this.tileSize));
    const droplet = packet.sourceKind === 'napalm_droplet_wisp';
    const seed = numericSeed(packet);
    const phase = fract(renderTime * (droplet ? 2.4 : 0.72) + seed);
    const forwardLength = Math.hypot(packet.forwardX ?? 0, packet.forwardY ?? 0) || 1;
    const forwardX = (packet.forwardX ?? 0) / forwardLength;
    const forwardZ = (packet.forwardY ?? -1) / forwardLength;
    const count = droplet || Number(packet.age ?? 0) < 2.2 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const trail = droplet ? (index + 1) * radius * 0.62 : radius * (0.12 + index * 0.18);
      const rise = droplet ? index * 0.025 : 0.055 + phase * 0.24 + index * 0.065;
      this.position.set(
        packet.worldX / this.tileSize * WORLD_SCALE.tileMeters - forwardX * trail + Math.sin(seed * 8 + index) * radius * 0.12,
        (packet.heightMeters ?? 0.045) + rise,
        packet.worldY / this.tileSize * WORLD_SCALE.tileMeters - forwardZ * trail + Math.cos(seed * 7 + index) * radius * 0.12
      );
      const size = radius * (droplet ? 0.45 + index * 0.22 : 0.36 + phase * 0.44 + index * 0.16);
      this.scale.set(size * 0.62, size * (1.05 + phase * 0.4), size * 0.62);
      this.write('smoke-wisp', this.position, IDENTITY_QUATERNION, this.scale, droplet ? '#3b302c' : '#292625');
    }
  }

  addParticle(packet) {
    this.worldPoint(this.position, packet.worldX, packet.worldY, 0.055 + (packet.phase ?? 0) * (packet.kind === 'ash_fleck' ? 0.28 : 0.44));
    const radius = Math.max(0.006, pixelsToMeters(packet.radius, this.tileSize) * (packet.kind === 'ash_fleck' ? 0.75 : 1.1));
    this.scale.set(radius * 0.72, radius * 1.7, radius * 0.72);
    this.write('spark', this.position, IDENTITY_QUATERNION, this.scale, packet.kind === 'ash_fleck' ? '#5b4437' : packet.colour ?? '#b83a18');
  }

  writeSegment(key, a, b, radius, colour) {
    this.direction.subVectors(b, a);
    const length = Math.max(0.001, this.direction.length());
    this.midpoint.copy(a).add(b).multiplyScalar(0.5);
    this.quaternion.setFromUnitVectors(UP, this.direction.normalize());
    this.scale.set(radius, length, radius);
    this.write(key, this.midpoint, this.quaternion, this.scale, colour);
  }

  write(key, position, quaternion, scale, colour) {
    const entry = this.batches.get(key);
    const index = this.counts[key] ?? 0;
    if (!entry || index >= entry.capacity) return false;
    this.matrix.compose(position, quaternion, scale);
    entry.mesh.setMatrixAt(index, this.matrix);
    entry.mesh.setColorAt(index, this.colour.set(parseColour(colour)));
    this.counts[key] = index + 1;
    return true;
  }

  batch(key, geometry, capacity, ownedMaterial) {
    const mesh = new THREE.InstancedMesh(geometry, ownedMaterial, capacity);
    mesh.name = `baby-drool:${key}`;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(mesh);
    const entry = { key, mesh, capacity };
    this.batches.set(key, entry);
    this.batchList.push(entry);
    this.materials.push(ownedMaterial);
    return entry;
  }

  geometry(value) { this.geometries.push(value); return value; }

  resetCounts() {
    for (const entry of this.batchList) this.counts[entry.key] = 0;
  }

  flushBatches() {
    for (const entry of this.batchList) {
      const count = this.counts[entry.key] ?? 0;
      entry.mesh.count = count;
      entry.mesh.visible = count > 0;
      if (count > 0) {
        entry.mesh.instanceMatrix.needsUpdate = true;
        if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  visibleInstances() {
    let total = 0;
    for (const entry of this.batchList) total += entry.mesh.count;
    return total;
  }

  blendColour(cool, hot, amount) {
    this.coolColour.set(parseColour(cool));
    this.hotColour.set(parseColour(hot));
    return this.colour.lerpColors(this.coolColour, this.hotColour, clamp01(amount)).getHex();
  }

  worldPoint(target, worldX, worldY, height) {
    return target.set(
      Number(worldX ?? 0) / this.tileSize * WORLD_SCALE.tileMeters,
      Number(height ?? 0),
      Number(worldY ?? 0) / this.tileSize * WORLD_SCALE.tileMeters
    );
  }

  diagnostics() { return { ...this.stats }; }

  dispose() {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const ownedMaterial of this.materials) ownedMaterial.dispose();
    this.batches.clear();
    this.batchList.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}

function material(colour, options = {}) {
  const Type = options.basic ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
  const parameters = {
    color: parseColour(colour),
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    side: options.side ?? THREE.DoubleSide,
    polygonOffset: options.polygonOffset ?? false,
    polygonOffsetFactor: options.polygonOffset ? -1 : 0,
    polygonOffsetUnits: options.polygonOffset ? -1 : 0,
    vertexColors: true
  };
  if (!options.basic) Object.assign(parameters, {
    roughness: options.roughness ?? 0.72,
    metalness: 0,
    emissive: options.emissive ? parseColour(options.emissive) : 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    flatShading: true
  });
  return new Type(parameters);
}

function emptyStats() {
  return { contract: THREE_BABY_NAPALM_DROOL_CONTRACT, projectiles: 0, hazards: 0, smokeSources: 0, particles: 0, visibleInstances: 0, drawFamilies: 0 };
}

function pixelsToMeters(value, tileSize) { return Math.max(0, Number(value ?? 0)) / tileSize * WORLD_SCALE.tileMeters; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function fract(value) { return value - Math.floor(value); }

function numericSeed(packet) {
  const direct = Number(packet.seed ?? packet.flickerPhase);
  if (Number.isFinite(direct)) return fract(Math.abs(direct) * 0.754877666);
  let hash = 2166136261;
  const text = String(packet.id ?? 'baby-drool');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function seeded01(seed, index, salt) {
  return fract(Math.sin((seed + 1) * 12.9898 + (index + 1) * 78.233 + salt * 37.719) * 43758.5453);
}

function parseColour(value) {
  if (Number.isFinite(value)) return value;
  const match = String(value ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return match ? (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]) : value ?? '#ffffff';
}
