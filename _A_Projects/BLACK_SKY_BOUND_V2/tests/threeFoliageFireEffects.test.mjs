import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import {
  THREE_FOLIAGE_FIRE_EFFECTS_CONTRACT,
  ThreeFoliageFireEffects
} from '../src/render/backends/three/ThreeFoliageFireEffects.js';

const root = new THREE.Group();
const effects = new ThreeFoliageFireEffects(root, 32);
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
camera.position.set(0, 4, 8);
camera.lookAt(0, 1, 0);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);

effects.update([smoke('near-smoke', 0, 0)], [fire('near-fire', 0, 0)], 0, { camera });
const visible = effects.diagnostics();
equal(visible.contract, THREE_FOLIAGE_FIRE_EFFECTS_CONTRACT, 'foliage VFX should expose its runtime contract');
assert(visible.flameTufts > 0 && visible.smokeWisps > 0, 'camera-local fire and smoke should populate their preallocated instance batches');
equal(visible.culledFires, 0, 'camera-local fire should remain visible');
equal(visible.culledSmokeWisps, 0, 'camera-local smoke should remain visible');

effects.update([smoke('far-smoke', 32000, 32000)], [fire('far-fire', 32000, 32000)], 1, { camera });
const culled = effects.diagnostics();
equal(culled.flameTufts, 0, 'off-camera fire should not upload dormant instances');
equal(culled.smokeWisps, 0, 'off-camera smoke should not upload dormant instances');
equal(culled.culledFires, 1, 'off-camera fire should be accounted for by the frustum LoD');
equal(culled.culledSmokeWisps, 1, 'off-camera smoke should be accounted for by the frustum LoD');
equal(culled.lodPolicy, 'camera_frustum_sphere_cull_before_instance_upload_v1', 'diagnostics should name the bounded VFX LoD policy');

effects.dispose();
equal(root.children.length, 0, 'disposing foliage fire effects should detach its root');

function fire(id, worldX, worldY) {
  return {
    id,
    family: 'tree',
    phase: 'ablaze',
    worldX,
    worldY,
    physicalHeightMeters: 3,
    heatAmount: 1
  };
}

function smoke(id, worldX, worldY) {
  return {
    id,
    sourceKind: 'burning_foliage_smoke',
    shape: 'rising_burning_tree_plume',
    worldX,
    worldY,
    heightMeters: 1.4,
    radius: 48
  };
}
