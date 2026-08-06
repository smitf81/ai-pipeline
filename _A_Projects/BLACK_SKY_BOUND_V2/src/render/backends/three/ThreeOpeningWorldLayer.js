import * as THREE from 'three';
import { renderWorldPointToWorld3D } from '../../three/worldTransform3D.js';

export const THREE_OPENING_WORLD_CONTRACT = 'black-sky-bound.three-opening-world.v1';

const SHELL_PALETTE = Object.freeze(['#9a8b72', '#716552', '#b3a487']);

export class ThreeOpeningWorldLayer {
  constructor(root, tileSize) {
    this.tileSize = tileSize;
    this.group = new THREE.Group();
    this.group.name = 'opening:world-shell';
    root.add(this.group);
    this.baseGeometry = new THREE.SphereGeometry(1, 10, 8);
    this.baseMaterial = shellMaterial('#8d826c');
    this.base = new THREE.Mesh(this.baseGeometry, this.baseMaterial);
    this.base.castShadow = this.base.receiveShadow = true;
    this.group.add(this.base);
    this.pieces = new Map();
    this.stats = { contract: THREE_OPENING_WORLD_CONTRACT, visible: false, shellPieces: 0, shellOpenProgress: 0 };
  }

  update(opening) {
    const egg = opening?.egg;
    this.group.visible = !!egg?.visible;
    if (!egg?.visible) {
      this.stats.visible = false;
      return;
    }
    const center = renderWorldPointToWorld3D(egg.worldX, egg.worldY, this.tileSize, 0);
    this.group.position.set(center.x, 0, center.z);
    this.group.rotation.y = -(egg.rotation ?? 0);
    const radiusX = pixelsToMeters(egg.radiusX, this.tileSize);
    const radiusZ = pixelsToMeters(egg.radiusY, this.tileSize);
    const open = clamp01(egg.shellOpenProgress);
    this.base.scale.set(radiusX, 0.58, radiusZ);
    this.base.position.y = 0.42;
    this.baseMaterial.opacity = Math.max(0.08, Number(egg.revealOpacity ?? 0)) * (1 - open * 0.82);
    this.baseMaterial.transparent = this.baseMaterial.opacity < 0.99;
    this.base.visible = open < 0.98;
    const active = new Set();
    for (const packet of egg.shellPieces ?? []) {
      active.add(packet.id);
      let entry = this.pieces.get(packet.id);
      if (!entry) {
        entry = createShellPiece(packet);
        this.pieces.set(packet.id, entry);
        this.group.add(entry.mesh);
      }
      const progress = clamp01(packet.progress ?? open);
      entry.mesh.visible = open > 0.01;
      entry.mesh.position.set(
        Number(packet.travelX ?? 0) * radiusX * progress,
        0.14 + Math.abs(Number(packet.travelY ?? 0)) * 0.22 + progress * Number(packet.travel ?? 0) * 0.8,
        Number(packet.travelY ?? 0) * radiusZ * progress
      );
      entry.mesh.rotation.set(-Math.PI / 2, 0, Number(packet.rotation ?? 0) * progress);
      entry.mesh.scale.set(radiusX, radiusZ, 1);
      entry.material.opacity = Math.max(0.22, Number(egg.revealOpacity ?? 0.2));
    }
    for (const [id, entry] of this.pieces) if (!active.has(id)) entry.mesh.visible = false;
    this.stats = { contract: THREE_OPENING_WORLD_CONTRACT, visible: true, shellPieces: active.size, shellOpenProgress: open };
  }

  diagnostics() { return { ...this.stats }; }

  dispose() {
    this.group.removeFromParent();
    this.baseGeometry.dispose();
    this.baseMaterial.dispose();
    for (const entry of this.pieces.values()) {
      entry.geometry.dispose();
      entry.material.dispose();
    }
    this.pieces.clear();
  }
}

function createShellPiece(packet) {
  const points = packet.points ?? [];
  const shape = new THREE.Shape();
  if (points.length) {
    shape.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index].x, points[index].y);
    shape.closePath();
  }
  const geometry = new THREE.ShapeGeometry(shape);
  const material = shellMaterial(SHELL_PALETTE[packet.paletteIndex % SHELL_PALETTE.length] ?? SHELL_PALETTE[0]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `opening:shell:${packet.id}`;
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, geometry, material };
}

function shellMaterial(colour) {
  return new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92, metalness: 0, flatShading: true, side: THREE.DoubleSide, transparent: true });
}

function pixelsToMeters(value, tileSize) { return Math.max(0, Number(value ?? 0)) / tileSize * 0.5; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
