import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';

export const THREE_CONTACT_DEBUG_LAYER_CONTRACT = 'black-sky-bound.three-contact-debug-layer.v1';

const COLOURS = Object.freeze({ broadPhase: 0x43d9ff, hurtVolumes: 0xffd45a, attackVolumes: 0xff4c35 });

export class ThreeContactDebugLayer {
  constructor(root) {
    this.root = new THREE.Group();
    this.root.name = 'debug:authoritative-contact-rigs';
    this.root.visible = false;
    root.add(this.root);
    this.circleGeometry = new THREE.CylinderGeometry(1, 1, 0.035, 18, 1, true);
    this.segmentGeometry = new THREE.BoxGeometry(1, 0.035, 1);
    this.materials = new Map(Object.entries(COLOURS).map(([family, colour]) => [family, new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: family === 'attackVolumes' ? 0.46 : 0.26,
      depthWrite: false, wireframe: true, side: THREE.DoubleSide
    })]));
    this.pool = [];
    this.activeCount = 0;
  }

  setEnabled(enabled) {
    this.root.visible = !!enabled;
  }

  update(actors = []) {
    if (!this.root.visible) return;
    let cursor = 0;
    for (const actor of actors) {
      const rig = actor.bodyContactRig;
      if (!rig) continue;
      if (rig.broadPhase) this.place(this.slot(cursor++, 'broadPhase'), rig.broadPhase);
      for (const shape of rig.hurtVolumes ?? []) this.place(this.slot(cursor++, 'hurtVolumes'), shape);
      for (const shape of rig.attackVolumes ?? []) this.place(this.slot(cursor++, 'attackVolumes'), shape);
    }
    for (let index = cursor; index < this.pool.length; index += 1) this.pool[index].group.visible = false;
    this.activeCount = cursor;
  }

  slot(index, family) {
    let entry = this.pool[index];
    if (!entry) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(this.segmentGeometry, this.materials.get(family));
      const capA = new THREE.Mesh(this.circleGeometry, this.materials.get(family));
      const capB = new THREE.Mesh(this.circleGeometry, this.materials.get(family));
      group.add(body, capA, capB);
      group.renderOrder = 100;
      this.root.add(group);
      entry = { group, body, capA, capB, family };
      this.pool.push(entry);
    }
    if (entry.family !== family) {
      entry.family = family;
      const material = this.materials.get(family);
      entry.body.material = entry.capA.material = entry.capB.material = material;
    }
    entry.group.visible = true;
    return entry;
  }

  place(entry, shape) {
    const scale = WORLD_SCALE.tileMeters;
    const radius = Math.max(0.01, Number(shape.radius ?? 0.08) * scale);
    const height = entry.family === 'attackVolumes' ? 0.09 : entry.family === 'hurtVolumes' ? 0.07 : 0.05;
    if (shape.kind === 'circle') {
      entry.body.visible = entry.capB.visible = false;
      entry.capA.visible = true;
      entry.capA.position.set(Number(shape.x) * scale, height, Number(shape.y) * scale);
      entry.capA.scale.set(radius, 1, radius);
      return;
    }
    const ax = Number(shape.ax) * scale;
    const az = Number(shape.ay) * scale;
    const bx = Number(shape.bx) * scale;
    const bz = Number(shape.by) * scale;
    const dx = bx - ax;
    const dz = bz - az;
    entry.body.visible = entry.capA.visible = entry.capB.visible = true;
    entry.body.position.set((ax + bx) * 0.5, height, (az + bz) * 0.5);
    entry.body.rotation.set(0, -Math.atan2(dz, dx), 0);
    entry.body.scale.set(Math.max(0.001, Math.hypot(dx, dz)), 1, radius * 2);
    entry.capA.position.set(ax, height, az);
    entry.capB.position.set(bx, height, bz);
    entry.capA.scale.set(radius, 1, radius);
    entry.capB.scale.set(radius, 1, radius);
  }

  diagnostics() {
    return { contract: THREE_CONTACT_DEBUG_LAYER_CONTRACT, enabled: this.root.visible, activeVolumes: this.activeCount, pooledVolumes: this.pool.length };
  }

  dispose() {
    this.root.removeFromParent();
    this.circleGeometry.dispose();
    this.segmentGeometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.pool.length = 0;
  }
}
