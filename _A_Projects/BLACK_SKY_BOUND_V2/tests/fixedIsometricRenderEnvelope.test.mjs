import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { ThreeOrthographicCamera } from '../src/render/backends/three/ThreeOrthographicCamera.js';
import {
  RenderEnvelopeClass,
  resolveRenderEnvelopeOptions,
  ThreeFixedIsometricRenderEnvelope,
  THREE_FIXED_ISOMETRIC_RENDER_ENVELOPE_CONTRACT
} from '../src/render/backends/three/ThreeFixedIsometricRenderEnvelope.js';

const cameraRig = new ThreeOrthographicCamera({ clientWidth: 1280, clientHeight: 720 });
cameraRig.viewportW = 1280;
cameraRig.viewportH = 720;
cameraRig.frustumHeight = 10;
cameraRig.updateFrustum();
cameraRig.target.set(12, 0, 18);
cameraRig.syncPose();

const envelope = new ThreeFixedIsometricRenderEnvelope({
  enabled: true,
  safetyMarginMeters: 1.5,
  chunkSizeTiles: 12
});
const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRig.camera.quaternion).normalize();
const center = boxAt(cameraRig.target.x, cameraRig.target.z);
const margin = boxAt(
  cameraRig.target.x + right.x * (cameraRig.camera.right + 0.75),
  cameraRig.target.z + right.z * (cameraRig.camera.right + 0.75)
);
const far = boxAt(
  cameraRig.target.x + right.x * (cameraRig.camera.right + 3),
  cameraRig.target.z + right.z * (cameraRig.camera.right + 3)
);
const centerEntry = envelope.register(center, { id: 'center-tree', kind: 'foliage' });
const marginEntry = envelope.register(margin, { id: 'edge-prop', kind: 'scenery' });
const farEntry = envelope.register(far, { id: 'far-chunk', kind: 'terrain' });

envelope.update(cameraRig.camera);
let diagnostics = envelope.diagnostics();
equal(diagnostics.contract, THREE_FIXED_ISOMETRIC_RENDER_ENVELOPE_CONTRACT, '3D culling should expose one fixed-isometric render-envelope contract');
equal(diagnostics.totalRenderables, 3, 'diagnostics should count every registered render-only candidate');
equal(diagnostics.visible, 1, 'the camera-centred object should classify inside the true view');
equal(diagnostics.margin, 1, 'an object just beyond the camera edge should remain rendered in the safety margin');
equal(diagnostics.culled, 1, 'an object beyond the safety margin should be skipped');
equal(centerEntry.classification, RenderEnvelopeClass.VISIBLE, 'centre scenery should remain normally visible');
equal(marginEntry.classification, RenderEnvelopeClass.MARGIN, 'edge scenery should retain the anti-pop margin state');
equal(farEntry.classification, RenderEnvelopeClass.CULLED, 'far scenery should enter the render-only culled state');
equal(center.visible, true, 'visible renderables should be submitted');
equal(margin.visible, true, 'margin renderables should stay submitted');
equal(far.visible, false, 'culled renderables should be skipped by Three.js');
equal(diagnostics.byKind.foliage.visible, 1, 'diagnostics should retain renderable-family ownership');
equal(diagnostics.visibleGroundPolygon.length, 4, 'the actual ground-plane camera footprint should be inspectable');
for (const point of diagnostics.visibleGroundPolygon) {
  const ndc = new THREE.Vector3(point.x, 0, point.z).project(cameraRig.camera);
  assert(Math.abs(Math.abs(ndc.x) - 1) < 0.002 && Math.abs(Math.abs(ndc.y) - 1) < 0.002, 'ground envelope corners should project to the real orthographic screen corners');
}

envelope.setOwnerVisible(center, false);
envelope.update(cameraRig.camera);
equal(center.visible, false, 'render-envelope updates must preserve an owning render layer visibility override');

cameraRig.target.set(far.position.x, 0, far.position.z);
cameraRig.syncPose();
envelope.update(cameraRig.camera);
diagnostics = envelope.diagnostics();
equal(farEntry.classification, RenderEnvelopeClass.VISIBLE, 'moving the real camera should immediately reclassify the new centre as visible');
equal(far.visible, true, 'camera movement should restore newly visible renderables without simulation involvement');
equal(center.visible, false, 'the owner-hidden object should remain hidden after camera movement');
assert(diagnostics.transitionCount > 3, 'diagnostics should expose envelope transitions for edge-pop investigation');

const queryOptions = resolveRenderEnvelopeOptions({
  enabled: true,
  safetyMarginMeters: 1.5,
  chunkSizeTiles: 12
}, '?renderEnvelope=0&renderEnvelopeMargin=2.25&renderEnvelopeChunkTiles=8');
equal(queryOptions.enabled, false, 'the render-only pass should be runtime-disableable for A/B proof');
equal(queryOptions.safetyMarginMeters, 2.25, 'the safety margin should be configurable in world metres');
equal(queryOptions.chunkSizeTiles, 8, 'the render partition should be configurable without changing terrain truth');

function boxAt(x, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
  mesh.position.set(x, 0.05, z);
  return mesh;
}
