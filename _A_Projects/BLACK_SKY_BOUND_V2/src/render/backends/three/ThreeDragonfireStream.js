import * as THREE from 'three';

export const THREE_DRAGONFIRE_STREAM_CONTRACT = 'black-sky-bound.three-dragonfire-stream.v1';

const DELIVERY_SEGMENT_COUNT = 9;
const IMPACT_LASH_COUNT = 5;
const FLAME_INSTANCE_COUNT = DELIVERY_SEGMENT_COUNT + IMPACT_LASH_COUNT;
const EMBER_COUNT = 18;

export function createDragonfireFlyoverGroup(layer) {
  const group = layer.mamaFlyover.root;
  const outerMaterial = streamMaterial('#ff4c12', 0.82);
  const coreMaterial = streamMaterial('#ffd078', 0.72, THREE.AdditiveBlending);
  const emberMaterial = streamMaterial('#ffb64c', 0.72, THREE.AdditiveBlending);
  layer.ownedMaterials.add(outerMaterial);
  layer.ownedMaterials.add(coreMaterial);
  layer.ownedMaterials.add(emberMaterial);
  const fireRoot = new THREE.Group();
  fireRoot.name = 'mama:head-rooted-dragonfire';
  fireRoot.visible = false;
  layer.root.add(fireRoot);

  const flameBatch = new THREE.InstancedMesh(
    layer.geometry('dragonfire-stream-outer-ribbon-v3', () => createStreamRibbonGeometry(0.46, 0.82)),
    outerMaterial,
    FLAME_INSTANCE_COUNT
  );
  flameBatch.name = 'mama:dragonfire-stream:outer-liquid-ribbon';
  flameBatch.renderOrder = 4;
  flameBatch.frustumCulled = false;
  flameBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fireRoot.add(flameBatch);

  const coreBatch = new THREE.InstancedMesh(
    layer.geometry('dragonfire-stream-core-ribbon-v3', () => createStreamRibbonGeometry(0.22, 0.43)),
    coreMaterial,
    FLAME_INSTANCE_COUNT
  );
  coreBatch.name = 'mama:dragonfire-stream:pressurised-hot-core';
  coreBatch.renderOrder = 5;
  coreBatch.frustumCulled = false;
  coreBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fireRoot.add(coreBatch);

  const emberBatch = new THREE.InstancedMesh(
    layer.geometry('dragonfire-ember', () => new THREE.IcosahedronGeometry(1, 0)),
    emberMaterial,
    EMBER_COUNT
  );
  emberBatch.name = 'mama:dragonfire-ember:instanced';
  emberBatch.renderOrder = 6;
  emberBatch.frustumCulled = false;
  emberBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fireRoot.add(emberBatch);

  group.userData.fireRoot = fireRoot;
  group.userData.flameBatch = flameBatch;
  group.userData.coreBatch = coreBatch;
  group.userData.emberBatch = emberBatch;
  group.userData.dragonfireScratch = createScratch(DELIVERY_SEGMENT_COUNT);
  group.userData.dragonfireBatchPolicy = 'three_instanced_batches_layered_delivery_impact_and_embers_v2';
  return group;
}

export function updateDragonfireStream(group, origin, target, opacity, phase) {
  const flameBatch = group.userData.flameBatch;
  const coreBatch = group.userData.coreBatch;
  const emberBatch = group.userData.emberBatch;
  const scratch = group.userData.dragonfireScratch;
  if (!flameBatch || !coreBatch || !emberBatch || !scratch) return;
  const direction = scratch.direction.subVectors(target, origin);
  const length = Math.max(0.001, direction.length());
  scratch.unitDirection.copy(direction).multiplyScalar(1 / length);
  const right = scratch.right.set(-direction.z, 0, direction.x).normalize();
  const points = scratch.points;
  for (let index = 0; index < points.length; index += 1) {
    const t = index / (points.length - 1);
    points[index].copy(origin).lerp(target, t)
      .addScaledVector(right, Math.sin((t * 2.35 + phase * 1.6) * Math.PI) * (0.035 + t * 0.075));
    points[index].y -= Math.sin(t * Math.PI) * (0.08 + t * 0.16);
  }

  flameBatch.material.opacity = Math.max(0.06, opacity) * 0.84;
  coreBatch.material.opacity = Math.max(0.06, opacity) * 0.76;
  for (let index = 0; index < DELIVERY_SEGMENT_COUNT; index += 1) {
    const t = (index + 0.5) / DELIVERY_SEGMENT_COUNT;
    const pressurePulse = 0.9 + Math.sin(phase * 16 + index * 1.73) * 0.1;
    const thickness = (0.048 + Math.sin(t * Math.PI) * 0.13 + t * 0.018) * pressurePulse;
    setSegmentInstance(flameBatch, index, points[index], points[index + 1], thickness, scratch);
    setSegmentInstance(coreBatch, index, points[index], points[index + 1], thickness * 0.92, scratch);
  }
  for (let index = 0; index < IMPACT_LASH_COUNT; index += 1) {
    const instanceIndex = DELIVERY_SEGMENT_COUNT + index;
    const side = (index - (IMPACT_LASH_COUNT - 1) * 0.5) * 0.085;
    scratch.impactA.copy(target)
      .addScaledVector(right, side)
      .addScaledVector(scratch.unitDirection, -0.025 * index);
    scratch.impactB.copy(scratch.impactA)
      .addScaledVector(scratch.unitDirection, -(0.11 + index * 0.025))
      .addScaledVector(right, Math.sin(index * 4.3 + phase * 11) * 0.09);
    scratch.impactB.y += 0.22 + (index % 3) * 0.12;
    const thickness = 0.04 + (index % 2) * 0.018;
    setSegmentInstance(flameBatch, instanceIndex, scratch.impactA, scratch.impactB, thickness, scratch);
    setSegmentInstance(coreBatch, instanceIndex, scratch.impactA, scratch.impactB, thickness * 0.84, scratch);
  }
  flameBatch.instanceMatrix.needsUpdate = true;
  coreBatch.instanceMatrix.needsUpdate = true;

  emberBatch.material.opacity = Math.max(0.05, opacity) * 0.68;
  scratch.quaternion.identity();
  for (let index = 0; index < EMBER_COUNT; index += 1) {
    const t = 0.24 + (index / Math.max(1, emberBatch.count - 1)) * 0.78;
    const jitter = Math.sin(index * 12.9898 + phase * 17.3);
    scratch.position.copy(origin).addScaledVector(direction, t)
      .addScaledVector(right, jitter * (0.035 + t * 0.24));
    scratch.position.y += Math.cos(index * 5.31 + phase * 8) * 0.1 - t * 0.11;
    scratch.scale.setScalar((0.012 + (index % 5) * 0.006) * (0.72 + opacity * 0.52));
    scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
    emberBatch.setMatrixAt(index, scratch.matrix);
  }
  emberBatch.instanceMatrix.needsUpdate = true;
  group.userData.dragonfireAlignment = {
    lengthMeters: Number(length.toFixed(3)),
    segmentCount: DELIVERY_SEGMENT_COUNT,
    impactLashCount: IMPACT_LASH_COUNT,
    flameInstanceCount: FLAME_INSTANCE_COUNT,
    emberCount: emberBatch.count,
    layeredCore: true,
    drawCalls: 3,
    batchPolicy: group.userData.dragonfireBatchPolicy
  };
}

function createScratch(segmentCount) {
  return {
    direction: new THREE.Vector3(),
    unitDirection: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(),
    impactA: new THREE.Vector3(),
    impactB: new THREE.Vector3(),
    position: new THREE.Vector3(),
    segmentDirection: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
    points: Array.from({ length: segmentCount + 1 }, () => new THREE.Vector3())
  };
}

function setSegmentInstance(batch, index, a, b, thickness, scratch) {
  const direction = scratch.segmentDirection.subVectors(b, a);
  const length = Math.max(0.0001, direction.length());
  scratch.position.copy(a).add(b).multiplyScalar(0.5);
  scratch.quaternion.setFromUnitVectors(scratch.up, direction.normalize());
  scratch.scale.set(thickness, length, thickness);
  scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
  batch.setMatrixAt(index, scratch.matrix);
}

function streamMaterial(colour, opacity, blending = THREE.NormalBlending) {
  return new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending,
    toneMapped: false,
    forceSinglePass: true
  });
}

function createStreamRibbonGeometry(topWidth, bottomWidth) {
  const positions = [];
  const indices = [];
  appendStreamRibbon(positions, indices, 'x', topWidth, bottomWidth);
  appendStreamRibbon(positions, indices, 'z', topWidth, bottomWidth);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function appendStreamRibbon(positions, indices, axis, topWidth, bottomWidth) {
  const start = positions.length / 3;
  if (axis === 'x') {
    positions.push(-bottomWidth, -0.5, 0, bottomWidth, -0.5, 0, topWidth, 0.5, 0, -topWidth, 0.5, 0);
  } else {
    positions.push(0, -0.5, -bottomWidth, 0, -0.5, bottomWidth, 0, 0.5, topWidth, 0, 0.5, -topWidth);
  }
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}
