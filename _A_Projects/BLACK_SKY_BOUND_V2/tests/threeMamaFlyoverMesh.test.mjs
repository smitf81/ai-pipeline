import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assert, equal } from './assert.mjs';
import {
  MAMA_FLYOVER_MESH_PROFILE,
  THREE_MAMA_FLYOVER_MESH_CONTRACT,
  ThreeMamaFlyoverMesh
} from '../src/render/backends/three/ThreeMamaFlyoverMesh.js';
import { MAMA_WYVERN_WORLD_EVENT } from '../src/data/mamaWyvernWorldEvents.js';

const assetUrl = new URL('../assets/models/mama/dragon_main_march_v5_flyover.glb', import.meta.url);
const bytes = await readFile(assetUrl);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
const flyover = new ThreeMamaFlyoverMesh({ autoLoad: false });
flyover.installScene(gltf.scene);
flyover.root.visible = true;
flyover.apply({
  scale: MAMA_WYVERN_WORLD_EVENT.shadow.scale,
  altitudeMeters: MAMA_WYVERN_WORLD_EVENT.shadow.altitudeMeters,
  headingRadians: 0.7,
  opacity: MAMA_WYVERN_WORLD_EVENT.shadow.opacity
}, { x: 4, y: MAMA_WYVERN_WORLD_EVENT.shadow.altitudeMeters, z: 6 });

const diagnostics = flyover.diagnostics();
equal(diagnostics.contract, THREE_MAMA_FLYOVER_MESH_CONTRACT, 'Mama GLB should publish its Three mesh contract');
equal(diagnostics.status, 'ready', 'the exported Mama GLB should parse and install');
equal(diagnostics.assetId, MAMA_FLYOVER_MESH_PROFILE.id, 'the runtime should identify the V5 Blender source asset');
equal(diagnostics.meshCount, MAMA_FLYOVER_MESH_PROFILE.expectedMeshCount, 'the selected Blender export should remain one mesh');
equal(diagnostics.triangleCount, MAMA_FLYOVER_MESH_PROFILE.expectedTriangleCount, 'the evaluated Blender silhouette triangle count drifted');
assert(diagnostics.effectiveDimensionsMeters.x > 4.5, 'canonical Mama scale should produce a greater-than-four-metre wingspan');
assert(diagnostics.effectiveDimensionsMeters.z > 3.6, 'canonical Mama scale should preserve the authored long body and tail');
assert(diagnostics.altitudeMeters > 8, 'Mama should clear the authored mature-tree height during the flyover');
assert(diagnostics.screenAnchorOffsetMeters.x > 5, 'the elevated mesh should compensate for fixed-camera orthographic parallax');
equal(diagnostics.screenAnchorPolicy, MAMA_FLYOVER_MESH_PROFILE.screenAnchorPolicy, 'the screen-aligned high flyover policy should stay inspectable');
equal(flyover.material.type, 'MeshBasicMaterial', 'Mama shadow should use the current unlit Three silhouette material');
equal(flyover.material.color.getHex(), 0x010102, 'Mama silhouette should remain near-black');
equal(flyover.model.children[0].material, flyover.material, 'the stale Blender material path must not own the runtime silhouette');
flyover.dispose();
