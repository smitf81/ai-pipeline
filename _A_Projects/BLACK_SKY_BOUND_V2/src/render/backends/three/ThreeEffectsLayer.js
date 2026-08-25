import * as THREE from 'three';
import { renderWorldPointToWorld3D } from '../../three/worldTransform3D.js';
import { RENDER_BUDGETS } from '../../../data/renderBudgets.js';
import { ThreeMamaFlyoverMesh } from './ThreeMamaFlyoverMesh.js';
import { isBabyDroolParticle, isBabyDroolSmoke, ThreeBabyNapalmDroolLayer } from './ThreeBabyNapalmDroolLayer.js';
import { prewarmThreeAtmosphere, updateThreeAtmosphericRain, updateThreeAtmosphericSparks } from './ThreeAtmosphericOverlayEffects.js';
import { isFoliageSmoke, ThreeFoliageFireEffects } from './ThreeFoliageFireEffects.js';
import { createDragonfireFlyoverGroup, updateDragonfireStream } from './ThreeDragonfireStream.js';
import { isMamaInfernoSmoke, ThreeMamaNapalmFirewall } from './ThreeMamaNapalmFirewall.js';
export const THREE_EFFECTS_LAYER_CONTRACT = 'black-sky-bound.three-effects-layer.v1';
export class ThreeEffectsLayer {
  constructor(root, tileSize) {
    this.root = new THREE.Group();
    this.root.name = 'three:effects';
    root.add(this.root);
    this.tileSize = tileSize;
    this.geometries = new Map();
    this.pools = new Map();
    this.poolCursors = new Map();
    this.instanced = new Map();
    this.ownedMaterials = new Set();
    this.allocations = 0;
    this.reuses = 0;
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.stats = {};
    this.lightningAnchors = [];
    this.mamaFlyover = new ThreeMamaFlyoverMesh();
    this.babyNapalmDrool = new ThreeBabyNapalmDroolLayer(this.root, tileSize);
    this.foliageFireEffects = new ThreeFoliageFireEffects(this.root, tileSize);
    this.mamaNapalmFirewall = new ThreeMamaNapalmFirewall(this.root, tileSize);
    this.screenWarmup = { status: 'pending', count: 0 };
    this.screenWarmupRestore = null;
    this.prewarmPools();
  }
  prewarmPools() {
    this.preallocate('decal', RENDER_BUDGETS.decalStamps.maxActive, () => this.mesh('disc', () => new THREE.CircleGeometry(1, 16), '#442218', { transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.preallocate('effect-ring', RENDER_BUDGETS.liveEffects.maxActive, () => this.mesh('effect-ring', () => new THREE.RingGeometry(0.7, 1, 18), '#d5ab65', { transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.preallocate('smoke', RENDER_BUDGETS.smokeField.maxSources + RENDER_BUDGETS.liveEffects.maxActive, () => this.mesh('smoke-mass', () => new THREE.IcosahedronGeometry(1, 1), '#777b79', { transparent: true, depthWrite: false }));
    this.preallocate('dropped-torch', RENDER_BUDGETS.lightEmitters.maxActive, () => this.mesh('dropped-torch', () => new THREE.CylinderGeometry(0.018, 0.024, 1, 5), '#6d3f1e'));
    this.preallocate('torch-flame', RENDER_BUDGETS.lightEmitters.maxActive, () => this.mesh('effect-orb', () => new THREE.IcosahedronGeometry(1, 1), '#ffb45b'));
    this.preallocate('lightning-bolt', 2, () => createLightningBolt(this));
    this.preallocate('mama-flyover', 1, () => createDragonfireFlyoverGroup(this));
    prewarmThreeAtmosphere(this);
    const particles = this.ensureInstanced('particles', RENDER_BUDGETS.ambientParticles.maxActive, 'particle', () => new THREE.IcosahedronGeometry(0.025, 0), '#d6a466', { emissive: '#c87932', opacity: 0.72, transparent: true, depthWrite: false });
    if (particles) { particles.count = 0; particles.visible = false; }
    this.poolCursors.clear();
    this.hideUnusedPools();
  }
  preallocate(key, count, factory) {
    const pool = this.pools.get(key) ?? [];
    while (pool.length < count) {
      const object = factory();
      object.name = `effects:${key}:${pool.length}`;
      object.visible = false;
      pool.push(object);
      this.root.add(object);
      this.allocations += 1;
    }
    this.pools.set(key, pool);
  }
  update(projection, screen = {}, view = {}) {
    this.poolCursors.clear();
    this.reuses = 0;
    const babySmoke = (projection.fogSmoke ?? []).filter(isBabyDroolSmoke);
    const babyParticles = (projection.particles ?? []).filter(isBabyDroolParticle);
    this.babyNapalmDrool.update({
      projectiles: projection.projectiles ?? [],
      hazards: projection.groundHazards ?? [],
      smoke: babySmoke,
      particles: babyParticles,
      renderTime: projection.renderTime ?? 0
    });
    const foliageSmoke = (projection.fogSmoke ?? []).filter(isFoliageSmoke);
    this.foliageFireEffects.update(foliageSmoke, projection.worldEvents?.foliageFires ?? [], projection.renderTime ?? 0, view);
    this.mamaNapalmFirewall.update(projection.worldEvents?.fireWalls ?? [], projection.renderTime ?? 0, view);
    for (const decal of projection.decals ?? []) this.addDisc('decal', decal, 0.012, false);
    for (const effect of projection.effects ?? []) this.addEffect(effect);
    for (const smoke of projection.fogSmoke ?? []) if (!isBabyDroolSmoke(smoke) && !isFoliageSmoke(smoke) && !isMamaInfernoSmoke(smoke)) this.addSmoke(smoke);
    for (const torch of projection.droppedTorches ?? []) this.addDroppedTorch(torch);
    this.addParticles((projection.particles ?? []).filter((particle) => !isBabyDroolParticle(particle)));
    const rainStreaks = updateThreeAtmosphericRain(this, projection.atmosphericOverlay, projection.actors ?? [], view);
    const atmosphereSparks = updateThreeAtmosphericSparks(this, projection.atmosphericOverlay, projection.actors ?? [], view);
    const lightningBolts = this.addLightning(projection.lights ?? []);
    this.addWorldEvents(projection.worldEvents);
    this.hideUnusedPools();
    this.updatePooledScreenWarmup();
    this.mamaFlyover.updateScreenWarmup(view, (projection.worldEvents?.flyovers?.length ?? 0) === 0);
    this.stats = {
      decals: projection.decals?.length ?? 0,
      hazards: projection.groundHazards?.length ?? 0,
      projectiles: projection.projectiles?.length ?? 0,
      effects: projection.effects?.length ?? 0,
      smoke: projection.fogSmoke?.length ?? 0,
      particles: projection.particles?.length ?? 0,
      rainStreaks,
      atmosphereSparks,
      atmosphereSparkPresentation: { ...this.atmosphereSparkStats },
      flyovers: projection.worldEvents?.flyovers?.length ?? 0,
      fireWalls: projection.worldEvents?.fireWalls?.length ?? 0,
      mamaNapalmFirewall: this.mamaNapalmFirewall.diagnostics(),
      foliageFires: projection.worldEvents?.foliageFires?.length ?? 0,
      foliageFire: this.foliageFireEffects.diagnostics(),
      lightningBolts,
      lightningAnchors: this.lightningAnchors.map((anchor) => ({ ...anchor })),
      dragonfire: (projection.worldEvents?.flyovers ?? []).filter((flyover) => flyover.breath?.active).length,
      dragonfireStream: this.pools.get('mama-flyover')?.[0]?.userData?.dragonfireAlignment ?? null,
      transparentBudgetUsed: (projection.fogSmoke?.length ?? 0) + (projection.effects?.length ?? 0),
      poolCount: this.pools.size + this.instanced.size + this.babyNapalmDrool.diagnostics().batchCount + 9,
      pooledObjects: [...this.pools.values()].reduce((sum, pool) => sum + pool.length, 0),
      allocations: this.allocations,
      reuses: this.reuses,
      mamaFlyoverAsset: this.mamaFlyover.diagnostics(),
      babyWyvernDrool: this.babyNapalmDrool.diagnostics(),
      screenWarmup: { ...this.screenWarmup }
    };
  }

  updatePooledScreenWarmup() {
    if (this.screenWarmup.status === 'screen_upload') {
      this.screenWarmupRestore?.();
      this.screenWarmupRestore = null;
      this.screenWarmup = { status: 'ready', count: this.screenWarmup.count + 1 };
      return;
    }
    if (this.screenWarmup.status !== 'pending') return;
    const restores = [];
    const warmMaterial = (material) => {
      if (!material) return;
      const opacity = material.opacity;
      material.opacity = 0;
      restores.push(() => { material.opacity = opacity; });
    };
    const fireRoot = this.pools.get('mama-flyover')?.[0]?.userData?.fireRoot;
    if (fireRoot) {
      fireRoot.visible = true;
      restores.push(() => { fireRoot.visible = false; });
      fireRoot.traverse((object) => {
        if (!object.isMesh) return;
        const frustumCulled = object.frustumCulled;
        object.frustumCulled = false;
        warmMaterial(object.material);
        restores.push(() => { object.frustumCulled = frustumCulled; });
      });
    }
    restores.push(this.mamaNapalmFirewall.beginScreenWarmup());
    for (const mesh of [this.foliageFireEffects.flames, this.foliageFireEffects.cores, this.foliageFireEffects.smoke]) {
      const count = mesh.count;
      const visible = mesh.visible;
      mesh.setMatrixAt(0, this.matrix.identity());
      mesh.count = 1;
      mesh.visible = true;
      mesh.instanceMatrix.needsUpdate = true;
      warmMaterial(mesh.material);
      restores.push(() => { mesh.count = count; mesh.visible = visible; });
    }
    this.screenWarmupRestore = () => { for (const restore of restores.reverse()) restore(); };
    this.screenWarmup.status = 'screen_upload';
  }
  addLightning(lights) {
    const packets = lights.filter((light) => /lightning/i.test(light.sourceKind ?? light.id ?? '')
      && Number(light.effectiveIntensity ?? light.intensity ?? 0) > 0.025);
    this.lightningAnchors = packets.map((packet) => ({
      id: packet.id,
      worldX: Number(packet.worldX) || 0,
      worldY: Number(packet.worldY) || 0,
      visualAnchorPolicy: packet.visualAnchorPolicy ?? null,
      originAcquisition: packet.stormEvent?.originAcquisition ? { ...packet.stormEvent.originAcquisition } : null
    }));
    for (const packet of packets) {
      const group = this.acquire('lightning-bolt', () => createLightningBolt(this));
      const strength = clamp01(packet.effectiveIntensity ?? packet.intensity ?? 1);
      group.position.copy(this.point(packet.worldX, packet.worldY, 0.025));
      updateMaterial(group.userData.material, packet.innerColour ?? '#dbe9ff', {
        emissive: packet.colour ?? '#a9c9ff', opacity: Math.max(0.14, strength), transparent: true, depthWrite: false
      });
      const points = group.userData.points;
      const eventIndex = Number(packet.stormEvent?.eventIndex ?? 0);
      const flashIndex = Number(packet.stormEvent?.flashIndex ?? 0);
      const phase = hash01(eventIndex + 3, flashIndex + 41) * Math.PI * 2;
      const height = 8.5;
      for (let index = 0; index < points.length; index += 1) {
        const t = index / (points.length - 1);
        const envelope = Math.sin(t * Math.PI) * (0.28 + t * 0.46);
        points[index].set(
          (Math.sin(index * 2.17 + phase) * 0.62 + (hash01(index + eventIndex * 11, 71 + flashIndex) - 0.5) * 0.38) * envelope,
          t * height,
          (Math.cos(index * 1.73 + phase) * 0.62 + (hash01(index + eventIndex * 17, 97 + flashIndex) - 0.5) * 0.38) * envelope
        );
      }
      group.userData.segments.forEach((segment, index) => placeSegment(segment, points[index], points[index + 1], 0.014 + strength * 0.015));
      group.userData.impact.position.set(0, 0.035, 0);
      group.userData.impact.scale.setScalar(0.04 + strength * 0.07);
    }
    return packets.length;
  }
  addDisc(key, packet, height, emissive) {
    const mesh = this.acquire(key, () => this.mesh('disc', () => new THREE.CircleGeometry(1, 16), packet.colour));
    updateMaterial(mesh.material, packet.fillColour ?? packet.hotColour ?? packet.colour, {
      emissive: emissive ? packet.hotColour ?? packet.colour : null,
      opacity: Number(packet.opacity ?? packet.life01 ?? 0.76),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const radius = pixelsToMeters(packet.radius, this.tileSize);
    mesh.position.copy(this.point(packet.worldX, packet.worldY, height));
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.scale.set(radius, radius * 0.78, radius);
    mesh.receiveShadow = true;
  }
  addOrb(key, packet, height, emissive) {
    const mesh = this.acquire(key, () => this.mesh('effect-orb', () => new THREE.IcosahedronGeometry(1, 1), packet.colour));
    updateMaterial(mesh.material, packet.coreColour ?? packet.colour, {
      emissive: emissive ? packet.colour : null,
      opacity: Number(packet.opacity ?? 1),
      transparent: Number(packet.opacity ?? 1) < 0.999
    });
    mesh.position.copy(this.point(packet.worldX, packet.worldY, height));
    mesh.scale.setScalar(Math.max(0.025, pixelsToMeters(packet.radius, this.tileSize)));
  }
  addEffect(packet) {
    if (/smoke/i.test(packet.kind ?? packet.visualRole ?? '')) return this.addSmoke(packet);
    const mesh = this.acquire('effect-ring', () => this.mesh('effect-ring', () => new THREE.RingGeometry(0.7, 1, 18), packet.colour));
    updateMaterial(mesh.material, packet.coreColour ?? packet.colour, {
      emissive: /fire|inferno|torch|napalm/i.test(packet.kind ?? '') ? packet.colour : null,
      opacity: Number(packet.opacity ?? packet.life01 ?? 0.72),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const radius = Math.max(0.05, pixelsToMeters(packet.radius, this.tileSize));
    mesh.position.copy(this.point(packet.worldX, packet.worldY, 0.055));
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.scale.setScalar(radius * (1.2 - (packet.life01 ?? 1) * 0.2));
  }
  addSmoke(packet) {
    const mesh = this.acquire('smoke', () => this.mesh('smoke-mass', () => new THREE.IcosahedronGeometry(1, 1), '#777b79'));
    const radius = Math.max(0.08, pixelsToMeters(packet.radius, this.tileSize));
    updateMaterial(mesh.material, packet.colour ?? '#777b79', {
      opacity: Math.max(0.03, Math.min(0.5, Number(packet.opacity ?? packet.life01 ?? 0.32))),
      transparent: true,
      depthWrite: false
    });
    mesh.position.copy(this.point(packet.worldX, packet.worldY, 0.28 + radius * 0.42));
    mesh.scale.set(radius * 1.2, radius * 0.7, radius);
  }
  addDroppedTorch(packet) {
    const shaft = this.acquire('dropped-torch', () => this.mesh('dropped-torch', () => new THREE.CylinderGeometry(0.018, 0.024, 1, 5), '#6d3f1e'));
    updateMaterial(shaft.material, packet.palette?.torch ?? '#6d3f1e');
    placeSegment(shaft, this.point(packet.gripWorldX, packet.gripWorldY, 0.045), this.point(packet.tipWorldX, packet.tipWorldY, 0.08));
    shaft.castShadow = true;
    if ((packet.render?.flameAlpha ?? 0) > 0.03) {
      this.addOrb('torch-flame', { ...packet, worldX: packet.flameWorldX, worldY: packet.flameWorldY, radius: packet.flameWorldRadius, colour: packet.palette?.flame, coreColour: packet.palette?.flameCore, opacity: packet.render.flameAlpha }, 0.13, true);
    }
  }
  addParticles(particles) {
    const mesh = this.ensureInstanced('particles', particles.length, 'particle', () => new THREE.IcosahedronGeometry(0.025, 0), '#d6a466', { emissive: '#c87932', opacity: 0.72, transparent: true, depthWrite: false });
    if (!mesh) return;
    this.quaternion.identity();
    particles.forEach((particle, index) => {
      const height = /leaf/.test(particle.kind) ? 1.2 + particle.phase * 1.8 : 0.18 + particle.phase * 1.15;
      const scale = Math.max(0.35, Number(particle.radius ?? 1)) * 0.45;
      this.scale.setScalar(scale);
      this.matrix.compose(this.point(particle.worldX, particle.worldY, height), this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  addWorldEvents(events) {
    for (const group of this.pools.get('mama-flyover') ?? []) if (group.userData.fireRoot) group.userData.fireRoot.visible = false;
    for (const flyover of events?.flyovers ?? []) this.addFlyover(flyover);
  }

  addFlyover(packet) {
    const group = this.acquire('mama-flyover', () => createDragonfireFlyoverGroup(this));
    const altitudeMeters = packet.altitudeMeters ?? 9.2;
    const screenAnchorOffset = this.mamaFlyover.apply(packet, this.point(packet.worldX, packet.worldY, altitudeMeters));
    const fireRoot = group.userData.fireRoot;
    fireRoot.visible = !!packet.breath?.active;
    if (fireRoot.visible) {
      const origin = this.point(packet.breath.originWorldX, packet.breath.originWorldY, altitudeMeters - 0.22).add(screenAnchorOffset);
      const target = this.point(packet.breath.targetWorldX, packet.breath.targetWorldY, 0.2);
      updateDragonfireStream(group, origin, target, packet.breath.opacity, packet.breath.phase);
    }
  }

  addOpeningEgg(egg) {
    if (!egg?.visible) return;
    const mesh = this.acquire('opening-egg', () => this.mesh('opening-egg', () => new THREE.SphereGeometry(1, 9, 7), '#8d826c'));
    updateMaterial(mesh.material, '#8d826c', { opacity: Math.max(0.08, egg.revealOpacity), transparent: egg.revealOpacity < 0.99 });
    mesh.position.copy(this.point(egg.worldX, egg.worldY, 0.42));
    mesh.rotation.y = -(egg.rotation ?? 0);
    mesh.scale.set(pixelsToMeters(egg.radiusX, this.tileSize), 0.55, pixelsToMeters(egg.radiusY, this.tileSize));
    mesh.castShadow = mesh.receiveShadow = true;
  }

  acquire(key, factory) {
    const cursor = this.poolCursors.get(key) ?? 0;
    const pool = this.pools.get(key) ?? [];
    let object = pool[cursor];
    if (!object) {
      object = factory();
      object.name = `effects:${key}:${cursor}`;
      pool.push(object);
      this.pools.set(key, pool);
      this.root.add(object);
      this.allocations += 1;
    } else {
      this.reuses += 1;
    }
    object.visible = true;
    this.poolCursors.set(key, cursor + 1);
    return object;
  }

  ensureInstanced(key, count, geometryKey, geometryFactory, colour, options) {
    let entry = this.instanced.get(key);
    if (!entry || count > entry.capacity) {
      entry?.mesh.removeFromParent();
      entry?.material.dispose();
      const capacity = Math.max(1, nextPowerOfTwo(count));
      const material = createMaterial(colour, options);
      const mesh = new THREE.InstancedMesh(this.geometry(geometryKey, geometryFactory), material, capacity);
      mesh.name = `effects:${key}:instanced`;
      mesh.frustumCulled = true;
      this.root.add(mesh);
      entry = { mesh, material, capacity };
      this.instanced.set(key, entry);
      this.ownedMaterials.add(material);
      this.allocations += 1;
    } else {
      this.reuses += 1;
    }
    entry.mesh.count = count;
    entry.mesh.visible = count > 0;
    return count > 0 ? entry.mesh : null;
  }

  hideUnusedPools() {
    for (const [key, pool] of this.pools) {
      const used = this.poolCursors.get(key) ?? 0;
      for (let index = used; index < pool.length; index += 1) {
        pool[index].visible = false;
        if (pool[index].userData?.flame) pool[index].userData.flame.visible = false;
      }
    }
  }

  mesh(geometryKey, geometryFactory, colour, options = {}) {
    const material = createMaterial(colour, options);
    this.ownedMaterials.add(material);
    return new THREE.Mesh(this.geometry(geometryKey, geometryFactory), material);
  }

  point(worldX, worldY, height) {
    const point = renderWorldPointToWorld3D(worldX, worldY, this.tileSize, height);
    return new THREE.Vector3(point.x, point.y, point.z);
  }

  geometry(key, factory) {
    if (!this.geometries.has(key)) this.geometries.set(key, factory());
    return this.geometries.get(key);
  }

  diagnostics() {
    return { contract: THREE_EFFECTS_LAYER_CONTRACT, ...this.stats, geometryCacheEntries: this.geometries.size, materialCacheEntries: this.ownedMaterials.size };
  }

  takeWarmupBundle() { return this.mamaFlyover.takeWarmupBundle(); }

  dispose() {
    this.root.removeFromParent();
    this.mamaFlyover.dispose();
    this.babyNapalmDrool.dispose();
    this.foliageFireEffects.dispose();
    this.mamaNapalmFirewall.dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.geometries.clear();
    this.ownedMaterials.clear();
    this.pools.clear();
    this.instanced.clear();
  }
}

function createLightningBolt(layer) {
  const group = new THREE.Group();
  const material = createMaterial('#dbe9ff', {
    emissive: '#a9c9ff', opacity: 1, transparent: true, depthWrite: false, roughness: 0.28
  });
  material.blending = THREE.AdditiveBlending;
  layer.ownedMaterials.add(material);
  const segments = Array.from({ length: 7 }, () => {
    const mesh = new THREE.Mesh(layer.geometry('lightning-segment', () => new THREE.CylinderGeometry(1, 1, 1, 5, 1)), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    return mesh;
  });
  const impact = new THREE.Mesh(layer.geometry('lightning-impact', () => new THREE.IcosahedronGeometry(1, 1)), material);
  impact.frustumCulled = false;
  impact.renderOrder = 3;
  group.add(impact);
  group.userData = {
    material,
    segments,
    impact,
    points: Array.from({ length: segments.length + 1 }, () => new THREE.Vector3())
  };
  return group;
}

function createMaterial(colour, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: parseColour(colour),
    roughness: options.roughness ?? 0.72,
    metalness: 0,
    emissive: options.emissive ? parseColour(options.emissive) : 0x000000,
    emissiveIntensity: options.emissive ? 4 : 0,
    opacity: options.opacity ?? 1,
    transparent: options.transparent ?? false,
    depthWrite: options.depthWrite ?? true,
    depthTest: options.depthTest ?? true,
    side: options.side ?? THREE.FrontSide,
    flatShading: true
  });
  if (material.transparent && material.side === THREE.DoubleSide) material.forceSinglePass = true;
  return material;
}

function updateMaterial(material, colour, options = {}) {
  material.color.set(parseColour(colour));
  material.roughness = options.roughness ?? material.roughness ?? 0.72;
  material.emissive.set(options.emissive ? parseColour(options.emissive) : 0x000000);
  material.emissiveIntensity = options.emissive ? 4 : 0;
  material.opacity = options.opacity ?? 1;
  const transparent = options.transparent ?? material.opacity < 0.999;
  const depthWrite = options.depthWrite ?? !transparent;
  const depthTest = options.depthTest ?? material.depthTest;
  if (material.transparent !== transparent || material.depthWrite !== depthWrite || material.depthTest !== depthTest || (options.side != null && material.side !== options.side)) material.needsUpdate = true;
  material.transparent = transparent;
  material.depthWrite = depthWrite;
  material.depthTest = depthTest;
  material.side = options.side ?? THREE.FrontSide;
  material.forceSinglePass = material.transparent && material.side === THREE.DoubleSide;
}

function pixelsToMeters(value, tileSize) { return Math.max(0, Number(value ?? 0)) / tileSize * 0.5; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function nextPowerOfTwo(value) { return 2 ** Math.ceil(Math.log2(Math.max(1, value))); }

function parseColour(value) {
  const match = String(value ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return match ? (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]) : value ?? '#ffffff';
}

function hash01(index, salt) {
  return fract(Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453);
}

function fract(value) { return value - Math.floor(value); }

function placeSegment(mesh, a, b, thickness = 1) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(0.0001, direction.length());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.scale.set(thickness, length, thickness);
}
