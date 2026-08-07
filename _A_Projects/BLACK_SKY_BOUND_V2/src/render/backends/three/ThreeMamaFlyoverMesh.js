import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_TRANSFORM_3D } from '../../three/worldTransform3D.js';

export const THREE_MAMA_FLYOVER_MESH_CONTRACT = 'black-sky-bound.three-mama-flyover-mesh.v1';

const MODEL_URL = new URL('../../../../assets/models/mama/dragon_main_march_v5_flyover.glb', import.meta.url).href;

export const MAMA_FLYOVER_MESH_PROFILE = Object.freeze({
  id: 'mama_wyvern_dragon_main_march_v5_flyover',
  sourceFilename: 'Dragon_Main_March_V5.blend',
  assetFilename: 'dragon_main_march_v5_flyover.glb',
  expectedMeshCount: 1,
  expectedTriangleCount: 62848,
  sourceWingspanMeters: 9.873,
  sourceLengthMeters: 7.97,
  sourceThicknessMeters: 0.963,
  headingAxisCorrectionRadians: -Math.PI / 2,
  screenAnchorPolicy: 'fixed_camera_orthographic_parallax_compensation_v1',
  materialPolicy: 'unlit_near_black_translucent_silhouette_v1'
});

export class ThreeMamaFlyoverMesh {
  constructor({ autoLoad = isBrowserRuntime(), loaderFactory = () => new GLTFLoader() } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'effects:mama-flyover:dragon-main-march-v5';
    this.root.visible = false;
    this.visualRoot = new THREE.Group();
    this.visualRoot.name = 'mama-flyover:source-axis-correction';
    this.visualRoot.rotation.y = MAMA_FLYOVER_MESH_PROFILE.headingAxisCorrectionRadians;
    this.root.add(this.visualRoot);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x010102,
      opacity: 0,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false
    });
    this.status = autoLoad ? 'loading' : 'deferred_non_browser';
    this.error = null;
    this.model = null;
    this.meshCount = 0;
    this.triangleCount = 0;
    this.dimensions = new THREE.Vector3();
    this.screenAnchorOffset = new THREE.Vector3();
    this.geometries = new Set();
    this.disposed = false;
    this.loadPromise = autoLoad ? this.load(loaderFactory()) : null;
  }

  async load(loader = new GLTFLoader()) {
    if (this.loadPromise) return this.loadPromise;
    this.status = 'loading';
    this.loadPromise = loader.loadAsync(MODEL_URL)
      .then((gltf) => this.installScene(gltf.scene))
      .catch((error) => {
        if (this.disposed) return null;
        this.status = 'failed';
        this.error = String(error?.message ?? error);
        return null;
      });
    return this.loadPromise;
  }

  installScene(scene) {
    if (this.disposed) return null;
    if (!scene?.isObject3D) throw new Error('mama_flyover_gltf_scene_required');
    this.removeModel();
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    if (bounds.isEmpty()) throw new Error('mama_flyover_gltf_bounds_empty');
    const center = bounds.getCenter(new THREE.Vector3());
    bounds.getSize(this.dimensions);
    scene.position.sub(center);
    scene.updateMatrixWorld(true);
    const replacedMaterials = new Set();
    scene.traverse((object) => {
      if (!object.isMesh) return;
      this.meshCount += 1;
      this.geometries.add(object.geometry);
      this.triangleCount += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3;
      for (const material of asArray(object.material)) if (material && material !== this.material) replacedMaterials.add(material);
      object.material = this.material;
      object.castShadow = false;
      object.receiveShadow = false;
      object.renderOrder = 2;
    });
    for (const material of replacedMaterials) material.dispose();
    if (!this.meshCount || !this.triangleCount) throw new Error('mama_flyover_gltf_mesh_missing');
    this.model = scene;
    this.model.name = 'mama-flyover:dragon-main-march-v5:model';
    this.visualRoot.add(scene);
    this.status = 'ready';
    this.error = null;
    return scene;
  }

  apply(packet, position) {
    const scale = Math.max(0.01, Number(packet?.scale) || 0.46);
    const yaw = WORLD_TRANSFORM_3D.camera.yawDegrees * Math.PI / 180;
    const elevation = WORLD_TRANSFORM_3D.camera.elevationDegrees * Math.PI / 180;
    const horizontalOffset = Math.max(0, Number(position?.y) || 0) / Math.tan(elevation);
    this.screenAnchorOffset.set(Math.sin(yaw) * horizontalOffset, 0, Math.cos(yaw) * horizontalOffset);
    this.root.position.copy(position).add(this.screenAnchorOffset);
    this.root.rotation.set(0, -(Number(packet?.headingRadians) || 0), 0);
    this.root.scale.setScalar(scale);
    this.material.opacity = clamp01(packet?.opacity ?? 0.82);
    return this.screenAnchorOffset;
  }

  diagnostics() {
    const scale = this.root.scale.x || 1;
    return {
      contract: THREE_MAMA_FLYOVER_MESH_CONTRACT,
      assetId: MAMA_FLYOVER_MESH_PROFILE.id,
      sourceFilename: MAMA_FLYOVER_MESH_PROFILE.sourceFilename,
      assetFilename: MAMA_FLYOVER_MESH_PROFILE.assetFilename,
      status: this.status,
      error: this.error,
      visible: this.root.visible && this.status === 'ready',
      projectedWithoutMesh: this.root.visible && this.status !== 'ready',
      meshCount: this.meshCount,
      triangleCount: Math.round(this.triangleCount),
      sourceDimensionsMeters: vectorRecord(this.dimensions),
      effectiveDimensionsMeters: vectorRecord(this.dimensions, scale),
      altitudeMeters: round(this.root.position.y),
      screenAnchorPolicy: MAMA_FLYOVER_MESH_PROFILE.screenAnchorPolicy,
      screenAnchorOffsetMeters: vectorRecord(this.screenAnchorOffset),
      scale: round(scale),
      opacity: round(this.material.opacity),
      materialPolicy: MAMA_FLYOVER_MESH_PROFILE.materialPolicy
    };
  }

  removeModel() {
    this.model?.removeFromParent();
    this.model = null;
    this.meshCount = 0;
    this.triangleCount = 0;
  }

  dispose() {
    this.disposed = true;
    this.removeModel();
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear();
    this.material.dispose();
    this.root.removeFromParent();
  }
}

function asArray(value) { return Array.isArray(value) ? value : [value]; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function isBrowserRuntime() { return typeof document !== 'undefined' && typeof location !== 'undefined'; }
function round(value) { return Math.round((Number(value) || 0) * 1000) / 1000; }
function vectorRecord(vector, scale = 1) {
  return { x: round(vector.x * scale), y: round(vector.y * scale), z: round(vector.z * scale) };
}
