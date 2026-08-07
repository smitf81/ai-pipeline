import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { ThreeOpeningWorldLayer, THREE_OPENING_WORLD_CONTRACT } from '../src/render/backends/three/ThreeOpeningWorldLayer.js';

const root = new THREE.Group();
const layer = new ThreeOpeningWorldLayer(root, 32);
layer.update({ egg: {
  visible: true,
  worldX: 320,
  worldY: 448,
  rotation: 0.4,
  radiusX: 34,
  radiusY: 42,
  revealOpacity: 0,
  shellOpenProgress: 0.5,
  shellPieces: [{ id: 'front', layer: 'front', travelX: 0.2, travelY: 0.1, rotation: 0.3, travel: 0.4, paletteIndex: 1, progress: 0.5, points: [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0, y: 0.8 }] }]
} });
const diagnostics = layer.diagnostics();
equal(diagnostics.contract, THREE_OPENING_WORLD_CONTRACT, 'opening world layer should publish its contract');
equal(diagnostics.shellPieces, 1, 'opening world layer should materialise authored shell pieces');
assert(layer.group.visible, 'egg exterior should remain visible when reveal opacity is zero');
assert(layer.baseMaterial.opacity > 0, 'exterior visibility should be independent from interior reveal opacity');
layer.dispose();
