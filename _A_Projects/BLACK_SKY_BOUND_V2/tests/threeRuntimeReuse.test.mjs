import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { ThreeEffectsLayer } from '../src/render/backends/three/ThreeEffectsLayer.js';

const root = new THREE.Group();
const layer = new ThreeEffectsLayer(root, 32);
const packet = {
  actors: [{ id: 1, team: 'player', alive: true, x: 4, y: 5 }],
  decals: [{ worldX: 128, worldY: 160, radius: 12, colour: '#442218', opacity: 0.5 }],
  groundHazards: [{ worldX: 132, worldY: 164, radius: 10, colour: '#ff4218', hotColour: '#ffc26e', opacity: 0.8 }],
  projectiles: [],
  effects: [],
  fogSmoke: [{ worldX: 128, worldY: 160, radius: 18, colour: '#666666', opacity: 0.3 }],
  droppedTorches: [],
  particles: [{ worldX: 128, worldY: 160, radius: 1, phase: 0.4, kind: 'ember' }],
  lights: [{ id: 'storm:1:0', sourceKind: 'storm_lightning', worldX: 150, worldY: 145, effectiveIntensity: 0.92, colour: '#a9c9ff', innerColour: '#f1f6ff', stormEvent: { eventIndex: 1, flashIndex: 0 } }],
  atmosphericOverlay: { enabled: true, renderTime: 1, tuning: { rainEnabled: true, rainDensity: 0.3, rainSpeed: 900, rainAngle: 14, overlayOpacity: 0.8 } },
  worldEvents: { flyovers: [], fireWalls: [], treeFires: [] }
};

layer.update(packet);
const first = layer.diagnostics();
layer.update(packet);
const second = layer.diagnostics();
equal(second.allocations, first.allocations, 'stable effect counts should not allocate new Three.js objects on the next frame');
assert(second.reuses > 0, 'stable effect counts should reuse pooled and instanced objects');
assert(second.poolCount >= 4, 'effect families should expose bounded pool diagnostics');
equal(second.lightningBolts, 1, 'active lightning should have a visible pooled world-space strike, not only an invisible light impulse');
layer.dispose();
equal(layer.geometries.size, 0, 'effect disposal should clear cached geometries');
equal(layer.ownedMaterials.size, 0, 'effect disposal should clear owned materials');
