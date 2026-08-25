import * as THREE from 'three';
import { generateProceduralUndergrowthSkeleton } from '../../../world/proceduralUndergrowthGenerator.js';
import { renderWorldPointToWorld3D } from '../../three/worldTransform3D.js';

export const THREE_UNDERGROWTH_LAYER_CONTRACT = 'black-sky-bound.three-undergrowth-batch.v1';

export class ThreeUndergrowthLayer {
  constructor(parent, tileSize, options = {}) {
    this.parent = parent;
    this.tileSize = tileSize;
    this.chunkSizeTiles = Math.max(1, Math.round(options.chunkSizeTiles ?? 24));
    this.root = new THREE.Group();
    this.root.name = 'scenery:procedural-undergrowth-batch';
    parent.add(this.root);
    this.objectRanges = new Map();
    this.meshes = {};
    this.resources = [];
    this.chunks = [];
    this.stats = emptyStats();
  }

  rebuild(packets = []) {
    this.clear();
    if (this.root.parent !== this.parent) this.parent.add(this.root);
    const entries = packets.map((packet) => buildEntry(packet, this.tileSize));
    const totals = { stemCount: 0, leafCount: 0, groundClusterCount: 0, emberSocketCount: 0, drawCalls: 0 };
    for (const { key, entries: chunkEntries } of groupEntriesIntoSpatialChunks(entries, this.tileSize, this.chunkSizeTiles)) {
      const chunkRoot = new THREE.Group();
      chunkRoot.name = `undergrowth:chunk:${key}`;
      const stem = buildStemBatch(chunkEntries);
      const leaves = buildInstanceBatch(chunkEntries, 'leaves', createLeafGeometry(), createFoliageMaterial(), leafMatrix, leafColour);
      const ground = buildInstanceBatch(chunkEntries, 'groundClusters', createGroundGeometry(), createGroundMaterial(), groundMatrix, groundColour);
      const embers = buildInstanceBatch(chunkEntries, 'emberSockets', createEmberGeometry(), createEmberMaterial(), emberMatrix, emberColour);
      this.installMesh(chunkRoot, 'stems', stem.mesh, stem.resources);
      this.installMesh(chunkRoot, 'leaves', leaves.mesh, leaves.resources);
      this.installMesh(chunkRoot, 'groundClusters', ground.mesh, ground.resources);
      this.installMesh(chunkRoot, 'emberSockets', embers.mesh, embers.resources);
      this.root.add(chunkRoot);
      this.chunks.push({ object: chunkRoot, id: chunkRoot.name, kind: 'foliage' });
      for (const entry of chunkEntries) {
        this.objectRanges.set(entry.packet.id, {
          definition: entry.definition,
          stem: rangeWithMesh(stem.ranges.get(entry.packet.id), stem.mesh),
          leaves: rangeWithMesh(leaves.ranges.get(entry.packet.id), leaves.mesh),
          groundClusters: rangeWithMesh(ground.ranges.get(entry.packet.id), ground.mesh),
          emberSockets: rangeWithMesh(embers.ranges.get(entry.packet.id), embers.mesh)
        });
      }
      totals.stemCount += chunkEntries.reduce((sum, entry) => sum + entry.skeleton.stems.length, 0);
      totals.leafCount += leaves.count;
      totals.groundClusterCount += ground.count;
      totals.emberSocketCount += embers.count;
      totals.drawCalls += [stem.mesh, leaves.mesh, ground.mesh, embers.mesh].filter(Boolean).length;
    }
    this.stats = {
      contract: THREE_UNDERGROWTH_LAYER_CONTRACT,
      objectCount: entries.length,
      stemCount: totals.stemCount,
      leafCount: totals.leafCount,
      groundClusterCount: totals.groundClusterCount,
      emberSocketCount: totals.emberSocketCount,
      drawCalls: totals.drawCalls,
      chunkCount: this.chunks.length,
      chunkSizeTiles: this.chunkSizeTiles,
      objectIdRangeCount: this.objectRanges.size,
      species: countBy(entries, (entry) => entry.definition.species)
    };
  }

  applyMaterialUpdates(updates = []) {
    for (const update of updates) {
      const ranges = this.objectRanges.get(update.id);
      const state = update.material?.state;
      if (!ranges || !state) continue;
      const char = clamp01(state.charAmount ?? state.burnAmount);
      const heat = clamp01(state.heatAmount);
      const ember = clamp01(state.emberAmount);
      const stemColours = ranges.stem.mesh?.geometry?.getAttribute('color');
      updateStemRange(stemColours, ranges.stem, char, heat);
      updateInstanceRange(ranges.leaves.mesh, ranges.leaves, char, heat, state.firePhase === 'burnt_out' ? 0.045 : Math.max(0.12, 1 - char * 0.82));
      updateInstanceRange(ranges.groundClusters.mesh, ranges.groundClusters, char, heat, Math.max(0.32, 1 - char * 0.55));
      updateEmberRange(ranges.emberSockets.mesh, ranges.emberSockets, ember, heat, ranges.definition.burn);
      if (stemColours) stemColours.needsUpdate = true;
    }
  }

  installMesh(root, key, mesh, resources = []) {
    if (!mesh) return;
    mesh.name = `undergrowth:${key}`;
    mesh.userData.semanticRole = key === 'stems' ? 'foliage_stem' : key === 'leaves' ? 'foliage_leaf' : key === 'groundClusters' ? 'foliage_ground_cluster' : 'foliage_ember_socket';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    if (!this.meshes[key]) this.meshes[key] = mesh;
    this.resources.push(...resources);
    root.add(mesh);
  }

  diagnostics() { return { ...this.stats }; }

  renderEnvelopeObjects() { return this.chunks.map((entry) => ({ ...entry })); }

  clear() {
    this.root.clear();
    for (const resource of this.resources) resource.dispose?.();
    this.resources.length = 0;
    this.objectRanges.clear();
    this.meshes = {};
    this.chunks.length = 0;
    this.stats = emptyStats();
  }

  dispose() {
    this.clear();
    this.root.removeFromParent();
  }
}

function buildEntry(packet, tileSize) {
  if (!packet.undergrowthDefinition) throw new Error(`three_undergrowth_definition_required:${packet.id}`);
  const origin = renderWorldPointToWorld3D(packet.anchorWorldX, packet.anchorWorldY, tileSize, 0);
  return {
    packet,
    definition: packet.undergrowthDefinition,
    skeleton: generateProceduralUndergrowthSkeleton(packet.undergrowthDefinition),
    origin: new THREE.Vector3(origin.x, origin.y, origin.z)
  };
}

function groupEntriesIntoSpatialChunks(entries, tileSize, chunkSizeTiles) {
  const groups = new Map();
  const chunkWorldSize = Math.max(1, tileSize) * Math.max(1, chunkSizeTiles);
  for (const entry of entries) {
    const key = `${Math.floor(entry.packet.anchorWorldX / chunkWorldSize)}:${Math.floor(entry.packet.anchorWorldY / chunkWorldSize)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()].map(([key, chunkEntries]) => ({ key, entries: chunkEntries }));
}

function buildStemBatch(entries) {
  const positions = [];
  const colours = [];
  const ranges = new Map();
  for (const entry of entries) {
    const start = positions.length / 3;
    const base = colourForDefinition(entry.definition.stemColour, entry.definition);
    for (const sourceStem of entry.skeleton.stems) {
      for (let index = 0; index < sourceStem.points.length - 1; index += 1) {
        const first = sourceStem.points[index];
        const second = sourceStem.points[index + 1];
        appendCrossedTaperedSegment(positions, colours, entry.origin, first, second, base);
      }
    }
    const count = positions.length / 3 - start;
    ranges.set(entry.packet.id, { start, count, baseColours: colours.slice(start * 3, (start + count) * 3) });
  }
  if (!positions.length) return { mesh: null, resources: [], ranges };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  return { mesh: new THREE.Mesh(geometry, material), resources: [geometry, material], ranges };
}

function appendCrossedTaperedSegment(positions, colours, origin, first, second, colour) {
  const a = new THREE.Vector3(first.x, first.y, first.z).add(origin);
  const b = new THREE.Vector3(second.x, second.y, second.z).add(origin);
  const direction = b.clone().sub(a).normalize();
  let side = direction.clone().cross(new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 0.001) side.set(1, 0, 0);
  side.normalize();
  const secondSide = direction.clone().cross(side).normalize();
  for (const ribbonSide of [side, secondSide]) appendRibbon(positions, colours, a, b, ribbonSide, first.radius, second.radius, colour);
}

function appendRibbon(positions, colours, a, b, side, firstRadius, secondRadius, colour) {
  const aLeft = a.clone().addScaledVector(side, firstRadius);
  const aRight = a.clone().addScaledVector(side, -firstRadius);
  const bLeft = b.clone().addScaledVector(side, secondRadius);
  const bRight = b.clone().addScaledVector(side, -secondRadius);
  for (const point of [aLeft, aRight, bRight, aLeft, bRight, bLeft]) {
    positions.push(point.x, point.y, point.z);
    colours.push(colour.r, colour.g, colour.b);
  }
}

function buildInstanceBatch(entries, skeletonKey, geometry, material, matrixBuilder, colourBuilder) {
  const count = entries.reduce((sum, entry) => sum + entry.skeleton[skeletonKey].length, 0);
  const ranges = new Map();
  if (!count) {
    geometry.dispose();
    material.dispose();
    return { mesh: null, resources: [], ranges, count: 0 };
  }
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const baseMatrices = [];
  const baseColours = [];
  let cursor = 0;
  for (const entry of entries) {
    const start = cursor;
    for (const item of entry.skeleton[skeletonKey]) {
      const matrix = matrixBuilder(item, entry.origin);
      const colour = colourBuilder(item, entry.definition);
      mesh.setMatrixAt(cursor, matrix);
      mesh.setColorAt(cursor, colour);
      baseMatrices.push(matrix.clone());
      baseColours.push(colour.clone());
      cursor += 1;
    }
    ranges.set(entry.packet.id, { start, count: cursor - start, baseMatrices, baseColours });
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh, resources: [geometry, material], ranges, count };
}

function leafMatrix(leaf, origin) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(origin.x + leaf.x, origin.y + leaf.y, origin.z + leaf.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(leaf.rotationZ ?? 0, leaf.rotationY ?? 0, 0)),
    new THREE.Vector3(leaf.radiusX, leaf.radiusY, leaf.radiusZ)
  );
}

function groundMatrix(cluster, origin) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(origin.x + cluster.x, origin.y + cluster.y, origin.z + cluster.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, cluster.rotationY ?? 0)),
    new THREE.Vector3(cluster.radiusX, cluster.radiusZ, 1)
  );
}

function emberMatrix(socket, origin) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(origin.x + socket.x, origin.y + socket.y, origin.z + socket.z),
    new THREE.Quaternion(),
    new THREE.Vector3(socket.radius, socket.radius, socket.radius)
  );
}

function leafColour(leaf, definition) {
  const colour = colourForDefinition(definition.leafColour, definition);
  return colour.offsetHSL(leaf.colourShift * 0.05, 0, leaf.colourShift * 0.12);
}
function groundColour(_cluster, definition) { return colourForDefinition(definition.leafColour, definition).lerp(new THREE.Color(definition.stemColour), 0.42); }
function emberColour(socket) { return new THREE.Color('#ff6c22').lerp(new THREE.Color('#ffd978'), socket.intensity * 0.45); }

function updateStemRange(attribute, range, char, heat) {
  if (!attribute || !range.count) return;
  for (let local = 0; local < range.count; local += 1) {
    const source = new THREE.Color(range.baseColours[local * 3], range.baseColours[local * 3 + 1], range.baseColours[local * 3 + 2]);
    source.lerp(new THREE.Color('#160e0a'), char * 0.88).lerp(new THREE.Color('#7e210c'), heat * 0.16);
    attribute.setXYZ(range.start + local, source.r, source.g, source.b);
  }
}

function updateInstanceRange(mesh, range, char, heat, scale) {
  if (!mesh || !range.count) return;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const baseScale = new THREE.Vector3();
  for (let local = 0; local < range.count; local += 1) {
    const index = range.start + local;
    range.baseMatrices[index].decompose(position, quaternion, baseScale);
    mesh.setMatrixAt(index, new THREE.Matrix4().compose(position, quaternion, baseScale.multiplyScalar(scale)));
    const colour = range.baseColours[index].clone().lerp(new THREE.Color('#130d09'), char * 0.94).lerp(new THREE.Color('#8b2109'), heat * 0.18);
    mesh.setColorAt(index, colour);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function updateEmberRange(mesh, range, ember, heat, authoredBurn) {
  if (!mesh || !range.count) return;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const baseScale = new THREE.Vector3();
  const activity = Math.max(authoredBurn * 0.72, ember, heat * 0.8);
  for (let local = 0; local < range.count; local += 1) {
    const index = range.start + local;
    range.baseMatrices[index].decompose(position, quaternion, baseScale);
    mesh.setMatrixAt(index, new THREE.Matrix4().compose(position, quaternion, baseScale.multiplyScalar(Math.max(0.01, activity))));
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function colourForDefinition(value, definition) {
  const colour = new THREE.Color(value);
  if (definition.season === 'autumn') colour.lerp(new THREE.Color('#9b5523'), 0.48);
  if (definition.season === 'spring') colour.lerp(new THREE.Color('#77a841'), 0.24);
  if (definition.season === 'winter') colour.lerp(new THREE.Color('#504834'), 0.58);
  colour.lerp(new THREE.Color('#17110d'), clamp01(definition.char) * 0.82);
  colour.lerp(new THREE.Color('#7b210c'), clamp01(definition.burn) * 0.14);
  return colour;
}

function createLeafGeometry() { return new THREE.IcosahedronGeometry(1, 0); }
function createGroundGeometry() { return new THREE.CircleGeometry(1, 7); }
function createEmberGeometry() { return new THREE.IcosahedronGeometry(1, 0); }
function createFoliageMaterial() { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true }); }
function createGroundMaterial() { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide }); }
function createEmberMaterial() { return new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffffff', emissive: '#ff3d0c', emissiveIntensity: 5, roughness: 0.35 }); }
function rangeWithMesh(range, mesh) { return { ...(range ?? emptyRange()), mesh }; }
function emptyRange() { return { start: 0, count: 0, baseMatrices: [], baseColours: [], mesh: null }; }
function emptyStats() { return { contract: THREE_UNDERGROWTH_LAYER_CONTRACT, objectCount: 0, stemCount: 0, leafCount: 0, groundClusterCount: 0, emberSocketCount: 0, drawCalls: 0, chunkCount: 0, objectIdRangeCount: 0, species: {} }; }
function countBy(values, keyFor) {
  const output = {};
  for (const value of values) { const key = keyFor(value); output[key] = (output[key] ?? 0) + 1; }
  return output;
}
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
