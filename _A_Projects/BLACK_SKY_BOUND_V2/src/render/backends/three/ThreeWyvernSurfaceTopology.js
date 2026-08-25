import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

export class DynamicWyvernSweepBatch {
  constructor(definitions) {
    this.definitions = new Map();
    this.definitionList = [];
    this.positions = [];
    this.colours = [];
    this.indices = [];
    this.center = new THREE.Vector3();
    this.previous = new THREE.Vector3();
    this.next = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.lateral = new THREE.Vector3();
    this.vertical = new THREE.Vector3();
    for (const source of definitions) this.addDefinition(source);
    this.geometry = createDynamicGeometry(this.positions.length / 3, this.positions, this.colours, this.indices);
    this.positionAttribute = this.geometry.getAttribute('position');
    this.normalAttribute = this.geometry.getAttribute('normal');
    this.topology = Object.freeze({
      sweepCount: definitions.length,
      vertexCount: this.positionAttribute.count,
      triangleCount: this.indices.length / 3
    });
  }

  addDefinition(source) {
    const pointCount = Math.max(2, Number(source.pointCount) || 2);
    const sides = Math.max(3, Number(source.sides) || 6);
    const vertexOffset = this.positions.length / 3;
    const points = Array(pointCount).fill(null);
    const definition = {
      id: source.id,
      pointCount,
      sides,
      points,
      vertexOffset,
      startCap: vertexOffset + pointCount * sides,
      endCap: vertexOffset + pointCount * sides + 1,
      radiusScale: Number(source.radiusScale) || 1,
      depthScale: Number(source.depthScale) || 1
    };
    this.definitions.set(source.id, definition);
    this.definitionList.push(definition);
    const colour = new THREE.Color(source.colour ?? '#5c2f25');
    for (let ring = 0; ring < pointCount; ring += 1) {
      for (let side = 0; side < sides; side += 1) {
        this.positions.push(0, 0, 0);
        const tone = 0.62 + ((ring * 3 + side * 5) % 5) * 0.085;
        this.colours.push(colour.r * tone, colour.g * tone, colour.b * tone);
      }
    }
    for (let cap = 0; cap < 2; cap += 1) {
      this.positions.push(0, 0, 0);
      this.colours.push(colour.r * 0.72, colour.g * 0.72, colour.b * 0.72);
    }
    for (let ring = 0; ring < pointCount - 1; ring += 1) {
      const current = vertexOffset + ring * sides;
      const following = current + sides;
      for (let side = 0; side < sides; side += 1) {
        const nextSide = (side + 1) % sides;
        const a = current + side;
        const b = current + nextSide;
        const c = following + side;
        const d = following + nextSide;
        this.indices.push(a, b, c, b, d, c);
      }
    }
    for (let side = 0; side < sides; side += 1) {
      const nextSide = (side + 1) % sides;
      this.indices.push(definition.startCap, vertexOffset + nextSide, vertexOffset + side);
      const endRing = vertexOffset + (pointCount - 1) * sides;
      this.indices.push(definition.endCap, endRing + side, endRing + nextSide);
    }
  }

  points(id) {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`wyvern_surface_sweep_missing:${id}`);
    return definition.points;
  }

  update() {
    for (let index = 0; index < this.definitionList.length; index += 1) this.writeDefinition(this.definitionList[index]);
    this.positionAttribute.needsUpdate = true;
    updateNormals(this.geometry, this.normalAttribute);
  }

  writeDefinition(definition) {
    const { points, pointCount, sides, vertexOffset } = definition;
    for (let ring = 0; ring < pointCount; ring += 1) {
      const point = requireSurfacePoint(points[ring], `${definition.id}:${ring}`);
      setVector(this.center, point);
      setVector(this.previous, points[Math.max(0, ring - 1)] ?? point);
      setVector(this.next, points[Math.min(pointCount - 1, ring + 1)] ?? point);
      this.tangent.subVectors(this.next, this.previous);
      if (this.tangent.lengthSq() < 1e-8) this.tangent.set(0, 0, 1);
      this.tangent.normalize();
      this.lateral.crossVectors(UP, this.tangent);
      if (this.lateral.lengthSq() < 1e-8) this.lateral.copy(X_AXIS);
      else this.lateral.normalize();
      this.vertical.crossVectors(this.tangent, this.lateral).normalize();
      const lateralRadius = Math.max(0.007, Number(point.width) * WORLD_SCALE.tileMeters * 0.52 * definition.radiusScale);
      const verticalRadius = Math.max(0.006, Number(point.verticalRadius) * definition.depthScale);
      for (let side = 0; side < sides; side += 1) {
        const theta = side / sides * Math.PI * 2;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const vertex = (vertexOffset + ring * sides + side) * 3;
        this.positionAttribute.setXYZ(
          vertex / 3,
          this.center.x + this.lateral.x * cos * lateralRadius + this.vertical.x * sin * verticalRadius,
          this.center.y + this.lateral.y * cos * lateralRadius + this.vertical.y * sin * verticalRadius,
          this.center.z + this.lateral.z * cos * lateralRadius + this.vertical.z * sin * verticalRadius
        );
      }
    }
    setVector(this.center, points[0]);
    this.positionAttribute.setXYZ(definition.startCap, this.center.x, this.center.y, this.center.z);
    setVector(this.center, points.at(-1));
    this.positionAttribute.setXYZ(definition.endCap, this.center.x, this.center.y, this.center.z);
  }

  dispose() { this.geometry.dispose(); }
}

export class DynamicWyvernMembraneBatch {
  constructor() {
    this.pointsBySide = { left: Array(8).fill(null), right: Array(8).fill(null) };
    const positions = new Array(16 * 3).fill(0);
    const colours = [];
    const indices = [];
    const base = new THREE.Color('#2d1714');
    for (let side = 0; side < 2; side += 1) {
      const offset = side * 8;
      for (let point = 0; point < 8; point += 1) {
        const tone = 0.64 + ((point + side * 2) % 4) * 0.085;
        colours.push(base.r * tone, base.g * tone, base.b * tone);
      }
      for (let point = 1; point < 7; point += 1) indices.push(offset, offset + point, offset + point + 1);
    }
    this.geometry = createDynamicGeometry(16, positions, colours, indices);
    this.positionAttribute = this.geometry.getAttribute('position');
    this.normalAttribute = this.geometry.getAttribute('normal');
    this.topology = Object.freeze({ vertexCount: 16, triangleCount: indices.length / 3, panelCount: indices.length / 3 });
  }

  points(side) { return this.pointsBySide[side]; }

  update() {
    let index = 0;
    for (let sideIndex = 0; sideIndex < SIDE_NAMES.length; sideIndex += 1) {
      const side = SIDE_NAMES[sideIndex];
      for (let pointIndex = 0; pointIndex < 8; pointIndex += 1) {
        const point = requireSurfacePoint(this.pointsBySide[side][pointIndex], `membrane:${side}:${pointIndex}`);
        this.positionAttribute.setXYZ(index, point.x * WORLD_SCALE.tileMeters, point.height, point.y * WORLD_SCALE.tileMeters);
        index += 1;
      }
    }
    this.positionAttribute.needsUpdate = true;
    updateNormals(this.geometry, this.normalAttribute);
  }

  dispose() { this.geometry.dispose(); }
}

function createDynamicGeometry(vertexCount, positions, colours, indices) {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(positions), 3);
  position.setUsage(THREE.DynamicDrawUsage);
  const normal = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
  normal.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colours), 3));
  geometry.setIndex(indices);
  return geometry;
}

function updateNormals(geometry, normalAttribute) {
  const positions = geometry.getAttribute('position').array;
  const normals = normalAttribute.array;
  const indices = geometry.index.array;
  normals.fill(0);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const ai = indices[offset] * 3;
    const bi = indices[offset + 1] * 3;
    const ci = indices[offset + 2] * 3;
    const abx = positions[bi] - positions[ai];
    const aby = positions[bi + 1] - positions[ai + 1];
    const abz = positions[bi + 2] - positions[ai + 2];
    const acx = positions[ci] - positions[ai];
    const acy = positions[ci + 1] - positions[ai + 1];
    const acz = positions[ci + 2] - positions[ai + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[ai] += nx;
    normals[ai + 1] += ny;
    normals[ai + 2] += nz;
    normals[bi] += nx;
    normals[bi + 1] += ny;
    normals[bi + 2] += nz;
    normals[ci] += nx;
    normals[ci + 1] += ny;
    normals[ci + 2] += nz;
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1;
    normals[index] /= length;
    normals[index + 1] /= length;
    normals[index + 2] /= length;
  }
  normalAttribute.needsUpdate = true;
}

function requireSurfacePoint(point, role) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.width)
    || !Number.isFinite(point.height) || !Number.isFinite(point.verticalRadius) || point.verticalRadius <= 0) {
    throw new Error(`wyvern_surface_point_invalid:${role}`);
  }
  return point;
}

function setVector(target, point) {
  const valid = requireSurfacePoint(point, point?.role ?? 'anonymous');
  target.set(valid.x * WORLD_SCALE.tileMeters, valid.height, valid.y * WORLD_SCALE.tileMeters);
}

const SIDE_NAMES = Object.freeze(['left', 'right']);
