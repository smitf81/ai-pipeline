import * as THREE from 'three';
import { TERRAIN_DETAIL_TUNING } from '../../../data/terrainMaterialLayers.js';

export const THREE_GRASS_DETAIL_CONTRACT = 'black-sky-bound.instanced-grass-detail.v1';

export class ThreeGrassDetail {
  constructor(options = {}) {
    this.tileMeters = options.tileMeters;
    this.enabled = options.enabled ?? TERRAIN_DETAIL_TUNING.defaultEnabled;
    this.density = clamp(Number(options.density ?? TERRAIN_DETAIL_TUNING.defaultDensity), TERRAIN_DETAIL_TUNING.minDensity, TERRAIN_DETAIL_TUNING.maxDensity);
    this.cullDistanceMeters = clamp(Number(options.cullDistanceMeters ?? TERRAIN_DETAIL_TUNING.cullDistanceMeters), TERRAIN_DETAIL_TUNING.minCullDistanceMeters, TERRAIN_DETAIL_TUNING.maxCullDistanceMeters);
    this.group = new THREE.Group();
    this.group.name = 'terrain:grass-detail';
    this.candidates = [];
    this.mesh = null;
    this.boundsHelper = new THREE.Box3Helper(new THREE.Box3(), 0x56c7ad);
    this.boundsHelper.name = 'terrain:grass-detail-cull-bounds';
    this.boundsHelper.visible = false;
    this.group.add(this.boundsHelper);
    this.debugVisible = false;
    this.focusCell = '';
    this.visibleCount = 0;
    this.cullUpdates = 0;
    this.scatterSignature = '';
    this.stats = emptyStats(this);
    this.temp = {
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      colour: new THREE.Color(),
      axis: new THREE.Vector3(0, 1, 0)
    };
  }

  rebuild(terrain, scenery = []) {
    this.clearMesh();
    this.candidates = buildCandidates(terrain, scenery, this.tileMeters, this.density);
    this.scatterSignature = signatureForCandidates(this.candidates);
    const geometry = createGrassClumpGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0,
      emissive: 0x0b160c,
      emissiveIntensity: 0.24,
      side: THREE.DoubleSide,
      vertexColors: true
    });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, this.candidates.length));
    mesh.name = 'terrain:grass-detail-instances';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.contract = THREE_GRASS_DETAIL_CONTRACT;
    this.mesh = mesh;
    this.group.add(mesh);
    this.focusCell = '';
    this.visibleCount = 0;
    this.stats = {
      ...emptyStats(this),
      candidateCount: this.candidates.length,
      scatterSignature: this.scatterSignature,
      geometryTrianglesPerInstance: TERRAIN_DETAIL_TUNING.bladeTrianglesPerInstance,
      placementPolicy: TERRAIN_DETAIL_TUNING.sourcePolicy
    };
  }

  update(focus) {
    if (!this.mesh) return;
    const x = Number(focus?.x);
    const z = Number(focus?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const cellSize = TERRAIN_DETAIL_TUNING.cullCellMeters;
    const cell = `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}:${this.enabled ? 1 : 0}`;
    if (cell === this.focusCell) return;
    this.focusCell = cell;
    const radiusSq = this.cullDistanceMeters * this.cullDistanceMeters;
    let visible = 0;
    if (this.enabled) {
      for (const candidate of this.candidates) {
        if ((candidate.x - x) ** 2 + (candidate.z - z) ** 2 > radiusSq) continue;
        this.writeInstance(visible, candidate);
        visible += 1;
      }
    }
    this.mesh.count = visible;
    this.mesh.visible = this.enabled && visible > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.visibleCount = visible;
    this.cullUpdates += 1;
    this.boundsHelper.box.min.set(x - this.cullDistanceMeters, 0, z - this.cullDistanceMeters);
    this.boundsHelper.box.max.set(x + this.cullDistanceMeters, 0.55, z + this.cullDistanceMeters);
    this.boundsHelper.visible = this.debugVisible;
    this.stats = {
      ...this.stats,
      enabled: this.enabled,
      visibleCount: visible,
      culledCount: Math.max(0, this.candidates.length - visible),
      visibleTriangles: visible * TERRAIN_DETAIL_TUNING.bladeTrianglesPerInstance,
      cullUpdates: this.cullUpdates,
      focusCell: cell,
      cullBounds: {
        minX: round(x - this.cullDistanceMeters),
        minZ: round(z - this.cullDistanceMeters),
        maxX: round(x + this.cullDistanceMeters),
        maxZ: round(z + this.cullDistanceMeters)
      }
    };
  }

  writeInstance(index, candidate) {
    const temp = this.temp;
    temp.position.set(candidate.x, 0.031, candidate.z);
    temp.quaternion.setFromAxisAngle(temp.axis, candidate.rotation);
    temp.scale.set(candidate.widthScale, candidate.heightScale, candidate.widthScale);
    temp.matrix.compose(temp.position, temp.quaternion, temp.scale);
    this.mesh.setMatrixAt(index, temp.matrix);
    temp.colour.setRGB(candidate.colour[0], candidate.colour[1], candidate.colour[2], THREE.SRGBColorSpace);
    this.mesh.setColorAt(index, temp.colour);
  }

  setEnabled(value) {
    this.enabled = !!value;
    this.focusCell = '';
  }

  setDebugVisible(value) {
    this.debugVisible = !!value;
    this.boundsHelper.visible = this.debugVisible && !!this.mesh;
  }

  diagnostics() { return { contract: THREE_GRASS_DETAIL_CONTRACT, ...this.stats }; }

  clearMesh() {
    if (!this.mesh) return;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
    this.mesh = null;
  }

  dispose() {
    this.clearMesh();
    this.boundsHelper.geometry.dispose();
    this.boundsHelper.material.dispose();
    this.group.removeFromParent();
    this.candidates.length = 0;
  }
}

function buildCandidates(terrain, scenery, tileMeters, density) {
  const grid = terrainGrid(terrain);
  const natural = scenery.filter(isNaturalFeature).map(featureBounds);
  const occupied = scenery.filter((packet) => !isGroundDecal(packet)).map(featureBounds);
  const exclusions = terrain.detailExclusionZones ?? [];
  const seed = `${terrain.mapId ?? 'unknown'}:${terrain.mapWidth}:${terrain.mapHeight}:${terrain.revision ?? 0}`;
  const candidates = [];
  for (const tile of terrain.tiles ?? []) {
    if (tile.type !== 'grass') continue;
    const neighbours = neighbourTypes(grid, tile.x, tile.y);
    const travelledEdges = travelledEdgeSet(neighbours);
    const naturalBoundary = [...neighbours.values()].some((type) => type === 'forest' || type === 'rock');
    for (let index = 0; index < TERRAIN_DETAIL_TUNING.candidatesPerGrassTile; index += 1) {
      const localX = 0.11 + hash01(`${seed}:${tile.x}:${tile.y}:${index}:x`) * 0.78;
      const localY = 0.11 + hash01(`${seed}:${tile.x}:${tile.y}:${index}:y`) * 0.78;
      const point = { x: tile.x + localX, y: tile.y + localY };
      if (insideExclusion(point, exclusions) || tooCloseToOccupied(point, occupied)) continue;
      if (insideTravelledClearance(localX, localY, travelledEdges)) continue;
      const naturalBias = naturalFeatureBias(point, natural);
      const patchNoise = spatialNoise(`${seed}:patch`, point.x / 3.2, point.y / 3.2);
      const patchMultiplier = patchNoise < 0.3 ? 0.14 : 0.48 + patchNoise * 0.92;
      let threshold = density * patchMultiplier * (naturalBoundary ? TERRAIN_DETAIL_TUNING.forestRockBoundaryDensityMultiplier : 1);
      if (travelledEdges.size) threshold *= TERRAIN_DETAIL_TUNING.travelledBoundaryDensityMultiplier;
      threshold *= naturalBias;
      if (hash01(`${seed}:${tile.x}:${tile.y}:${index}:keep`) > Math.min(1, threshold)) continue;
      const shade = 0.74 + hash01(`${seed}:${tile.x}:${tile.y}:${index}:shade`) * 0.23;
      const prevailingAngle = 0.62 + (spatialNoise(`${seed}:wind`, point.x / 8, point.y / 8) - 0.5) * 0.82;
      candidates.push({
        x: point.x * tileMeters,
        z: point.y * tileMeters,
        rotation: prevailingAngle + (hash01(`${seed}:${tile.x}:${tile.y}:${index}:rotation`) - 0.5) * 0.72,
        widthScale: 0.82 + hash01(`${seed}:${tile.x}:${tile.y}:${index}:width`) * 0.46,
        heightScale: 0.76 + hash01(`${seed}:${tile.x}:${tile.y}:${index}:height`) * 0.64,
        colour: [0.4 * shade, 0.55 * shade, 0.25 * shade]
      });
    }
  }
  return candidates;
}

function terrainGrid(terrain) {
  const values = Array.from({ length: terrain.mapHeight }, () => Array.from({ length: terrain.mapWidth }, () => null));
  for (const tile of terrain.tiles ?? []) values[tile.y][tile.x] = tile.type;
  return values;
}

function neighbourTypes(grid, x, y) {
  return new Map([
    ['n', grid[y - 1]?.[x]], ['e', grid[y]?.[x + 1]], ['s', grid[y + 1]?.[x]], ['w', grid[y]?.[x - 1]]
  ]);
}

function travelledEdgeSet(neighbours) {
  return new Set([...neighbours].filter(([, type]) => type === 'dirt' || type === 'scorched').map(([direction]) => direction));
}

function insideTravelledClearance(x, y, edges) {
  const clearance = TERRAIN_DETAIL_TUNING.travelledBoundaryClearanceTiles;
  return (edges.has('n') && y < clearance) || (edges.has('s') && y > 1 - clearance)
    || (edges.has('w') && x < clearance) || (edges.has('e') && x > 1 - clearance);
}

function featureBounds(packet) {
  const width = Number(packet.collisionFootprint?.w ?? packet.widthTiles ?? 1);
  const height = Number(packet.collisionFootprint?.h ?? packet.heightTiles ?? 1);
  return {
    x: Number(packet.anchorX ?? packet.x ?? 0),
    y: Number(packet.anchorY ?? packet.y ?? 0),
    radius: Math.max(0.24, Math.max(width, height) * 0.46)
  };
}

function tooCloseToOccupied(point, occupied) {
  return occupied.some((item) => Math.hypot(point.x - item.x, point.y - item.y) < item.radius + TERRAIN_DETAIL_TUNING.occupiedClearanceTiles);
}

function naturalFeatureBias(point, natural) {
  for (const item of natural) {
    const distance = Math.hypot(point.x - item.x, point.y - item.y);
    if (distance >= item.radius + TERRAIN_DETAIL_TUNING.naturalFeatureInnerClearanceTiles
      && distance <= item.radius + TERRAIN_DETAIL_TUNING.naturalFeatureOuterBiasTiles) {
      return TERRAIN_DETAIL_TUNING.naturalFeatureDensityMultiplier;
    }
  }
  return 1;
}

function insideExclusion(point, exclusions) {
  return exclusions.some((zone) => {
    if (zone.kind === 'circle') return Math.hypot(point.x - zone.x, point.y - zone.y) <= zone.radiusTiles;
    return point.x >= zone.x - zone.paddingTiles && point.x <= zone.x + zone.w + zone.paddingTiles
      && point.y >= zone.y - zone.paddingTiles && point.y <= zone.y + zone.h + zone.paddingTiles;
  });
}

function isNaturalFeature(packet) { return /tree|snag|boulder|geology/.test(`${packet.type ?? ''}:${packet.render?.kind ?? ''}`); }
function isGroundDecal(packet) { return /ground_decal|leaf_litter|root_decal/.test(`${packet.type ?? ''}:${packet.render?.kind ?? ''}`); }

function createGrassClumpGeometry() {
  const positions = [];
  const colours = [];
  const uvs = [];
  const indices = [];
  const bladeSpecs = [
    [-0.055, -0.032, 0.18, 0.25, 0.013, 0.038], [0.004, -0.052, 0.145, 1.08, 0.011, 0.03],
    [0.057, -0.024, 0.205, 2.02, 0.014, 0.05], [-0.042, 0.024, 0.135, 2.72, 0.01, 0.026],
    [0.012, 0.004, 0.235, 0.68, 0.015, 0.06], [0.061, 0.038, 0.16, 1.58, 0.012, 0.034],
    [-0.004, 0.062, 0.195, 2.35, 0.013, 0.046], [-0.071, 0.055, 0.125, 0.94, 0.009, 0.024],
    [0.082, 0.015, 0.15, 2.95, 0.011, 0.032], [-0.018, -0.002, 0.17, 1.9, 0.012, 0.041]
  ];
  for (const [offsetX, offsetZ, height, angle, halfWidth, lean] of bladeSpecs) {
    const dx = Math.cos(angle) * halfWidth;
    const dz = Math.sin(angle) * halfWidth;
    const leanX = lean + Math.sin(angle * 1.7) * 0.012;
    const leanZ = lean * 0.34 + Math.cos(angle * 1.3) * 0.01;
    const midX = offsetX + leanX * 0.46;
    const midZ = offsetZ + leanZ * 0.46;
    const base = positions.length / 3;
    positions.push(
      offsetX - dx, 0, offsetZ - dz,
      offsetX + dx, 0, offsetZ + dz,
      midX + dx * 0.58, height * 0.56, midZ + dz * 0.58,
      offsetX + leanX, height, offsetZ + leanZ,
      midX - dx * 0.58, height * 0.56, midZ - dz * 0.58
    );
    uvs.push(0, 0, 1, 0, 1, 0.56, 0.5, 1, 0, 0.56);
    pushShade(colours, 0.68, 0.68, 0.96, 1.14, 0.96);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 4, base + 4, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let index = 0; index < normals.count; index += 1) {
    const x = normals.getX(index) * 0.58;
    const z = normals.getZ(index) * 0.58;
    const length = Math.hypot(x, 0.82, z) || 1;
    normals.setXYZ(index, x / length, 0.82 / length, z / length);
  }
  normals.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

function pushShade(target, ...values) {
  for (const value of values) target.push(value, value, value);
}

function spatialNoise(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth01(x - x0);
  const ty = smooth01(y - y0);
  const a = hash01(`${seed}:${x0}:${y0}`);
  const b = hash01(`${seed}:${x0 + 1}:${y0}`);
  const c = hash01(`${seed}:${x0}:${y0 + 1}`);
  const d = hash01(`${seed}:${x0 + 1}:${y0 + 1}`);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function smooth01(value) { return value * value * (3 - 2 * value); }
function lerp(a, b, amount) { return a + (b - a) * amount; }

function emptyStats(source) {
  return {
    enabled: source.enabled,
    density: source.density,
    cullDistanceMeters: source.cullDistanceMeters,
    candidateCount: 0,
    visibleCount: 0,
    culledCount: 0,
    visibleTriangles: 0,
    cullUpdates: 0,
    focusCell: '',
    cullBounds: null,
    scatterSignature: ''
  };
}

function signatureForCandidates(candidates) {
  let hash = 2166136261;
  for (const point of candidates) {
    hash = Math.imul(hash ^ Math.round(point.x * 1000), 16777619);
    hash = Math.imul(hash ^ Math.round(point.z * 1000), 16777619);
  }
  return `${candidates.length}:${hash >>> 0}`;
}

function hash01(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value) { return Math.round(value * 1000) / 1000; }
