import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { generateProceduralTreeSpatialRecipe } from '../../../world/proceduralTreeSpatialRecipe.js';

export class ThreeTreeMeshFactory {
  constructor() {
    this.geometryCache = new Map();
    this.materialCache = new Map();
    this.createdGroups = 0;
    this.disposed = false;
  }

  create(definition) {
    if (this.disposed) throw new Error('three_tree_factory_disposed');
    const recipe = generateProceduralTreeSpatialRecipe(definition);
    const signature = geometrySignature(definition);
    let cached = this.geometryCache.get(signature);
    if (!cached) {
      cached = buildTreeGeometry(recipe);
      this.geometryCache.set(signature, cached);
    }
    const materials = this.getMaterials(recipe);
    const group = new THREE.Group();
    group.name = `tree:${definition.species}:${definition.seed}`;
    const bark = new THREE.Mesh(cached.bark, materials.bark);
    bark.name = `${group.name}:wood`;
    bark.castShadow = true;
    bark.receiveShadow = true;
    group.add(bark);
    if (cached.foliageMatrices.length) {
      const foliage = new THREE.InstancedMesh(cached.foliage, materials.foliage, cached.foliageMatrices.length);
      cached.foliageMatrices.forEach((matrix, index) => foliage.setMatrixAt(index, matrix));
      foliage.instanceMatrix.needsUpdate = true;
      foliage.castShadow = true;
      foliage.receiveShadow = true;
      foliage.name = `${group.name}:foliage`;
      group.add(foliage);
    }
    group.userData = { recipe, geometrySignature: signature, topology: cached.topology };
    this.createdGroups += 1;
    return group;
  }

  getMaterials(recipe) {
    const key = `${recipe.material.barkColour}:${recipe.material.leafColour}:${recipe.material.roughness}`;
    let cached = this.materialCache.get(key);
    if (!cached) {
      cached = {
        bark: new THREE.MeshStandardMaterial({
          color: recipe.material.barkColour,
          roughness: 0.94,
          metalness: 0,
          flatShading: false
        }),
        foliage: new THREE.MeshStandardMaterial({
          color: recipe.material.leafColour,
          roughness: recipe.material.roughness,
          metalness: 0,
          flatShading: true
        })
      };
      this.materialCache.set(key, cached);
    }
    return cached;
  }

  diagnostics() {
    return {
      geometryCacheEntries: this.geometryCache.size,
      materialCacheEntries: this.materialCache.size,
      createdGroups: this.createdGroups,
      disposed: this.disposed
    };
  }

  dispose() {
    if (this.disposed) return;
    for (const entry of this.geometryCache.values()) {
      entry.bark.dispose();
      entry.foliage.dispose();
    }
    for (const entry of this.materialCache.values()) {
      entry.bark.dispose();
      entry.foliage.dispose();
    }
    this.geometryCache.clear();
    this.materialCache.clear();
    this.disposed = true;
  }
}

function buildTreeGeometry(recipe) {
  const positions = [];
  const indices = [];
  const implicit = appendImplicitWood(
    positions, indices, recipe.skeleton.trunk, recipe.skeleton.roots, recipe.skeleton.branches
  );
  const rootTrunkIndexCount = implicit.rootIndexCount;
  const bark = new THREE.BufferGeometry();
  bark.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bark.setIndex(indices);
  bark.computeVertexNormals();
  bark.computeBoundingBox();
  bark.computeBoundingSphere();
  const topology = auditClosedTreeGeometry(bark);
  Object.assign(bark.userData, {
    construction: 'implicit_manifold_wood_v3',
    integratedRootCount: recipe.skeleton.roots.length,
    implicitResolution: implicit.resolution,
    implicitVertexCount: implicit.vertexCount,
    implicitTriangleCount: implicit.triangleCount,
    rootTrunkIndexCount,
    branchComponentCount: 0,
    ...topology
  });
  const foliage = new THREE.IcosahedronGeometry(1, 1);
  const foliageMatrices = recipe.skeleton.foliageClusters.map((cluster) => new THREE.Matrix4().compose(
    new THREE.Vector3(cluster.x, cluster.y, cluster.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cluster.rotationY, 0)),
    new THREE.Vector3(cluster.radiusX, cluster.radiusY, cluster.radiusZ)
  ));
  return { bark, foliage, foliageMatrices, topology: { ...bark.userData } };
}

function appendImplicitWood(positions, indices, trunk, roots, branches) {
  const floorY = -0.11;
  const paths = [trunk, ...roots, ...branches];
  const segments = paths.flatMap((path) => path.points.slice(0, -1).map((first, index) => {
    const second = path.points[index + 1];
    return {
      ax: first.x, ay: first.y, az: first.z,
      bx: second.x, by: second.y, bz: second.z,
      ar: path.kind === 'branch' ? Math.max(0.055, first.radius) : first.radius,
      br: path.kind === 'branch' ? Math.max(0.045, second.radius) : second.radius,
      verticalScale: path.kind === 'root' ? 0.6 : 1
    };
  }));
  const bounds = implicitBounds(paths, floorY);
  const resolution = implicitResolution(bounds);
  const geometry = polygoniseImplicitField(bounds, resolution, segments, floorY);
  if (!geometry.indices.length) throw new Error('tree_implicit_surface_empty');
  const rootCutoff = Math.max(4.5, trunk.points[0].radius * 4);
  const rootIndices = [];
  const upperIndices = [];
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const target = [geometry.indices[offset], geometry.indices[offset + 1], geometry.indices[offset + 2]]
      .every((index) => geometry.positions[index * 3 + 1] <= rootCutoff) ? rootIndices : upperIndices;
    target.push(geometry.indices[offset], geometry.indices[offset + 1], geometry.indices[offset + 2]);
  }
  geometry.indices = [...rootIndices, ...upperIndices];
  const base = positions.length / 3;
  positions.push(...geometry.positions);
  for (const index of geometry.indices) indices.push(base + index);
  return {
    resolution: `${resolution}^3_anisotropic`,
    vertexCount: geometry.positions.length / 3,
    triangleCount: geometry.indices.length / 3,
    rootIndexCount: rootIndices.length
  };
}

function implicitResolution(bounds) {
  const span = bounds.max.clone().sub(bounds.min);
  return Math.max(32, Math.min(44, Math.ceil(Math.max(span.x / 0.17, span.y / 0.26, span.z / 0.17))));
}

function polygoniseImplicitField(bounds, resolution, segments, floorY) {
  const polygoniser = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), false, false, 24000);
  polygoniser.isolation = 0;
  const span = bounds.max.clone().sub(bounds.min);
  populateImplicitField(polygoniser.field, bounds, span, resolution, segments, floorY);
  polygoniser.update();
  const count = polygoniser.geometry.drawRange.count;
  const source = polygoniser.geometry.getAttribute('position');
  const raw = new THREE.BufferGeometry();
  const transformed = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    transformed[index * 3] = bounds.min.x + (source.getX(index) + 1) * 0.5 * span.x;
    transformed[index * 3 + 1] = bounds.min.y + (source.getY(index) + 1) * 0.5 * span.y;
    transformed[index * 3 + 2] = bounds.min.z + (source.getZ(index) + 1) * 0.5 * span.z;
  }
  raw.setAttribute('position', new THREE.BufferAttribute(transformed, 3));
  const merged = mergeVertices(raw, 1e-4);
  const retained = retainLargestIndexedComponent(
    Array.from(merged.getAttribute('position').array),
    Array.from(merged.index.array)
  );
  const mergedPositions = retained.positions;
  const mergedIndices = retained.indices;
  if (signedGeometryVolume(mergedPositions, mergedIndices) < 0) {
    for (let index = 0; index < mergedIndices.length; index += 3) {
      [mergedIndices[index + 1], mergedIndices[index + 2]] = [mergedIndices[index + 2], mergedIndices[index + 1]];
    }
  }
  polygoniser.material.dispose();
  polygoniser.geometry.dispose();
  raw.dispose();
  merged.dispose();
  return { positions: mergedPositions, indices: mergedIndices };
}

function populateImplicitField(field, bounds, span, resolution, segments, floorY) {
  const step = { x: span.x / resolution, y: span.y / resolution, z: span.z / resolution };
  const padding = Math.max(step.x, step.y, step.z) * 1.75;
  field.fill(padding * 2);
  for (const segment of segments) {
    const radius = Math.max(segment.ar, segment.br) + padding;
    const ranges = [
      gridRange(Math.min(segment.ax, segment.bx) - radius, Math.max(segment.ax, segment.bx) + radius, bounds.min.x, step.x, resolution),
      gridRange(Math.min(segment.ay, segment.by) - radius, Math.max(segment.ay, segment.by) + radius, bounds.min.y, step.y, resolution),
      gridRange(Math.min(segment.az, segment.bz) - radius, Math.max(segment.az, segment.bz) + radius, bounds.min.z, step.z, resolution)
    ];
    for (let z = ranges[2][0]; z <= ranges[2][1]; z += 1) {
      const pz = bounds.min.z + step.z * z;
      for (let y = ranges[1][0]; y <= ranges[1][1]; y += 1) {
        const py = bounds.min.y + step.y * y;
        for (let x = ranges[0][0]; x <= ranges[0][1]; x += 1) {
          const px = bounds.min.x + step.x * x;
          const index = z * resolution * resolution + y * resolution + x;
          field[index] = Math.min(field[index], taperedSegmentDistance(px, py, pz, segment));
        }
      }
    }
  }
  for (let z = 0; z < resolution; z += 1) {
    for (let y = 0; y < resolution; y += 1) {
      const floorDistance = floorY - (bounds.min.y + step.y * y);
      for (let x = 0; x < resolution; x += 1) {
        const index = z * resolution * resolution + y * resolution + x;
        const distance = Math.max(field[index], floorDistance);
        field[index] = Math.abs(distance) < 1e-5 ? 1e-5 : distance;
      }
    }
  }
}

function gridRange(minimum, maximum, origin, step, resolution) {
  return [
    Math.max(0, Math.floor((minimum - origin) / step)),
    Math.min(resolution - 1, Math.ceil((maximum - origin) / step))
  ];
}

function retainLargestIndexedComponent(positions, indices) {
  const parents = Array.from({ length: positions.length / 3 }, (_, index) => index);
  for (let offset = 0; offset < indices.length; offset += 3) {
    union(parents, indices[offset], indices[offset + 1]);
    union(parents, indices[offset + 1], indices[offset + 2]);
  }
  const groups = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const root = find(parents, indices[offset]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(indices[offset], indices[offset + 1], indices[offset + 2]);
  }
  const retained = [...groups.values()].sort((first, second) => second.length - first.length)[0] ?? [];
  const remap = new Map();
  const compactPositions = [];
  const compactIndices = retained.map((sourceIndex) => {
    if (!remap.has(sourceIndex)) {
      remap.set(sourceIndex, compactPositions.length / 3);
      compactPositions.push(positions[sourceIndex * 3], positions[sourceIndex * 3 + 1], positions[sourceIndex * 3 + 2]);
    }
    return remap.get(sourceIndex);
  });
  return { positions: compactPositions, indices: compactIndices };
}

function signedGeometryVolume(positions, indices) {
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = readPosition(positions, indices[index]);
    const b = readPosition(positions, indices[index + 1]);
    const c = readPosition(positions, indices[index + 2]);
    volume += a.dot(b.cross(c)) / 6;
  }
  return volume;
}

function implicitBounds(paths, floorY) {
  const min = new THREE.Vector3(Infinity, floorY - 0.75, Infinity);
  const max = new THREE.Vector3(-Infinity, floorY + 0.75, -Infinity);
  for (const path of paths) {
    for (const point of path.points) {
      min.x = Math.min(min.x, point.x - point.radius - 0.5);
      min.z = Math.min(min.z, point.z - point.radius - 0.5);
      max.x = Math.max(max.x, point.x + point.radius + 0.5);
      max.z = Math.max(max.z, point.z + point.radius + 0.5);
      max.y = Math.max(max.y, point.y + point.radius + 0.75);
    }
  }
  return { min, max };
}

function taperedSegmentDistance(px, py, pz, segment) {
  const bax = segment.bx - segment.ax;
  const bay = segment.by - segment.ay;
  const baz = segment.bz - segment.az;
  const pax = px - segment.ax;
  const pay = (py - segment.ay) / segment.verticalScale;
  const paz = pz - segment.az;
  const scaledBay = bay / segment.verticalScale;
  const denominator = bax * bax + scaledBay * scaledBay + baz * baz;
  const progress = Math.max(0, Math.min(1, (pax * bax + pay * scaledBay + paz * baz) / Math.max(0.000001, denominator)));
  return Math.hypot(pax - bax * progress, pay - scaledBay * progress, paz - baz * progress)
    - lerp(segment.ar, segment.br, progress);
}

function readPosition(positions, index) {
  return new THREE.Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
}

export function auditClosedTreeGeometry(geometry) {
  const position = geometry.attributes.position;
  const triangles = geometry.index?.array ?? [];
  const edges = new Map();
  const parents = Array.from({ length: position.count }, (_, index) => index);
  let degenerateTriangles = 0;
  let signedVolume = 0;
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const ids = [triangles[offset], triangles[offset + 1], triangles[offset + 2]];
    const a = new THREE.Vector3().fromBufferAttribute(position, ids[0]);
    const b = new THREE.Vector3().fromBufferAttribute(position, ids[1]);
    const c = new THREE.Vector3().fromBufferAttribute(position, ids[2]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-18) degenerateTriangles += 1;
    signedVolume += a.dot(b.clone().cross(c)) / 6;
    union(parents, ids[0], ids[1]);
    union(parents, ids[1], ids[2]);
    for (let edge = 0; edge < 3; edge += 1) {
      const first = ids[edge];
      const second = ids[(edge + 1) % 3];
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  const counts = [...edges.values()];
  return {
    vertexCount: position.count,
    triangleCount: triangles.length / 3,
    connectedComponents: new Set(parents.map((_, index) => find(parents, index))).size,
    boundaryEdges: counts.filter((count) => count === 1).length,
    nonManifoldEdges: counts.filter((count) => count > 2).length,
    degenerateTriangles,
    signedVolume: Number(signedVolume.toFixed(6))
  };
}

function find(parents, value) {
  while (parents[value] !== value) {
    parents[value] = parents[parents[value]];
    value = parents[value];
  }
  return value;
}

function union(parents, first, second) {
  const a = find(parents, first);
  const b = find(parents, second);
  if (a !== b) parents[b] = a;
}

function geometrySignature(definition) {
  return ['implicit-manifold-wood-v3', definition.species, definition.seed, definition.ageYears, definition.health, definition.season,
    definition.heightMeters, definition.trunkRadiusMeters, definition.branchLevels, definition.branchDensity,
    definition.leafDensity, definition.canopySpread, definition.rootScale].join(':');
}

function lerp(a, b, t) { return a + (b - a) * t; }
