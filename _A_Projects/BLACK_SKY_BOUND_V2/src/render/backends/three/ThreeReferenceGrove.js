import * as THREE from 'three';
import { resolveProceduralTreeDefinition } from '../../../data/proceduralTrees.js';

export const THREE_REFERENCE_GROVE_CONTRACT = 'black-sky-bound.three-reference-grove.v2';

const TREE_FIXTURES = Object.freeze([
  Object.freeze({ species: 'old_pine', seed: 6371, ageYears: 145, x: -4.4, z: 0.8 }),
  Object.freeze({ species: 'silver_birch', seed: 1997, ageYears: 82, x: 0, z: -0.25 }),
  Object.freeze({ species: 'ancient_oak', seed: 8042, ageYears: 290, x: 4.8, z: 0.8 })
]);

export const REFERENCE_GROVE_LIGHTING_PROFILE = Object.freeze({
  skyIrradiance: 0.12,
  moonIlluminanceLux: 2.2,
  torchLuminousPowerLumens: 8500,
  lightningLuminousPowerLumens: 90000
});

export class ThreeReferenceGrove {
  constructor(scene, treeFactory, search = '') {
    this.scene = scene;
    this.treeFactory = treeFactory;
    this.search = new URLSearchParams(search);
    this.selectedTree = this.search.get('tree') ?? 'all';
    this.viewMode = normalizeView(this.search.get('treeView'));
    this.canopyVisible = this.search.get('canopy') !== '0';
    this.angle = normalizeAngle(this.search.get('angle'));
    this.framing = normalizeFraming(this.search.get('framing'), this.selectedTree);
    this.root = new THREE.Group();
    this.root.name = 'reference:tree-grove';
    this.scene.add(this.root);
    this.trees = [];
    this.treeStats = {
      count: 0, branches: 0, foliage: 0, hardColliders: 0, rootTraversalShapes: 0,
      barkVertices: 0, barkTriangles: 0, connectedWoodyComponents: 0, boundaryEdges: 0, nonManifoldEdges: 0
    };
    this.diagnosticMaterials = {
      wireframe: new THREE.MeshBasicMaterial({ color: 0xc4d6d8, wireframe: true }),
      normals: new THREE.MeshNormalMaterial({ flatShading: false })
    };
    this.createGround();
    this.createTrees();
    this.createLights();
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 22, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x17201b, roughness: 0.98, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.035, 1.5);
    ground.receiveShadow = true;
    ground.name = 'reference:ground';
    this.root.add(ground);
    this.ground = ground;
  }

  createTrees() {
    const fixtures = this.selectedTree === 'all'
      ? TREE_FIXTURES
      : TREE_FIXTURES.filter((fixture) => fixture.species === this.selectedTree);
    if (!fixtures.length) throw new Error(`tree_reference_fixture_invalid:${this.selectedTree}`);
    for (const fixture of fixtures) {
      const definition = resolveProceduralTreeDefinition(fixture, { id: `reference:${fixture.species}` });
      const tree = this.treeFactory.create(definition);
      const isolated = this.selectedTree !== 'all';
      tree.position.set(isolated ? 0 : fixture.x, 0, isolated ? 0 : fixture.z);
      tree.rotation.y = seededRotation(fixture.seed) + this.angle;
      this.root.add(tree);
      this.trees.push(tree);
      const wood = tree.children.find((child) => child.name.endsWith(':wood'));
      const foliage = tree.children.find((child) => child.name.endsWith(':foliage'));
      wood.userData.litMaterial = wood.material;
      if (this.framing === 'roots') wood.geometry.setDrawRange(0, tree.userData.topology.rootTrunkIndexCount);
      foliage && (foliage.visible = this.canopyVisible);
      this.treeStats.count += 1;
      this.treeStats.branches += tree.userData.recipe.diagnostics.branchCount;
      this.treeStats.foliage += tree.userData.recipe.diagnostics.foliageClusterCount;
      this.treeStats.hardColliders += tree.userData.recipe.diagnostics.hardColliderPrimitiveCount;
      this.treeStats.rootTraversalShapes += tree.userData.recipe.diagnostics.rootTraversalShapeCount;
      this.treeStats.barkVertices += tree.userData.topology.vertexCount;
      this.treeStats.barkTriangles += tree.userData.topology.triangleCount;
      this.treeStats.connectedWoodyComponents += tree.userData.topology.connectedComponents;
      this.treeStats.boundaryEdges += tree.userData.topology.boundaryEdges;
      this.treeStats.nonManifoldEdges += tree.userData.topology.nonManifoldEdges;
    }
    this.setDiagnosticView(this.viewMode);
  }

  setDiagnosticView(mode) {
    this.viewMode = normalizeView(mode);
    for (const tree of this.trees) {
      const wood = tree.children.find((child) => child.name.endsWith(':wood'));
      wood.material = this.viewMode === 'wireframe' ? this.diagnosticMaterials.wireframe
        : this.viewMode === 'normals' ? this.diagnosticMaterials.normals
          : wood.userData.litMaterial;
    }
    return this.viewMode;
  }

  setCanopyVisible(visible) {
    this.canopyVisible = !!visible;
    for (const tree of this.trees) {
      const foliage = tree.children.find((child) => child.name.endsWith(':foliage'));
      if (foliage) foliage.visible = this.canopyVisible;
    }
    return this.canopyVisible;
  }

  cameraPreset() {
    if (this.selectedTree === 'all' || this.framing === 'gameplay') return { x: 0, y: 3.5, z: 1.4, frustumHeight: 17.5 };
    const height = this.trees[0].userData.recipe.skeleton.trunk.points.at(-1).y;
    if (this.framing === 'roots') return { x: 0, y: 0.72, z: 0, frustumHeight: Math.max(4.2, height * 0.5) };
    return { x: 0, y: height * 0.46, z: 0, frustumHeight: height * 1.16 };
  }

  createLights() {
    this.sky = new THREE.HemisphereLight(0x25364a, 0x080705, REFERENCE_GROVE_LIGHTING_PROFILE.skyIrradiance);
    this.sky.name = 'physical:night-sky-irradiance';
    this.root.add(this.sky);

    this.moon = new THREE.DirectionalLight(0x91aece, REFERENCE_GROVE_LIGHTING_PROFILE.moonIlluminanceLux);
    this.moon.name = 'physical:moon';
    this.moon.position.set(-9, 16, -7);
    this.moon.target.position.set(0, 2.5, 1);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.camera.left = -13;
    this.moon.shadow.camera.right = 13;
    this.moon.shadow.camera.top = 13;
    this.moon.shadow.camera.bottom = -13;
    this.moon.shadow.camera.near = 0.5;
    this.moon.shadow.camera.far = 48;
    this.moon.shadow.bias = -0.0002;
    this.moon.shadow.normalBias = 0.025;
    this.root.add(this.moon, this.moon.target);

    this.torch = new THREE.PointLight(0xff8a3b, 1, 0, 2);
    this.torch.name = 'physical:moving-torch';
    this.torch.power = REFERENCE_GROVE_LIGHTING_PROFILE.torchLuminousPowerLumens;
    this.torch.castShadow = true;
    this.torch.shadow.mapSize.set(512, 512);
    this.torch.shadow.camera.near = 0.08;
    this.torch.shadow.camera.far = 15;
    this.torch.shadow.bias = -0.00035;
    this.root.add(this.torch);
    this.torchSource = emissiveSource(0xff7a28, 0xffd18a, 0.1);
    this.root.add(this.torchSource);

    this.lightning = new THREE.PointLight(0xc7dcff, 0, 0, 2);
    this.lightning.name = 'physical:lightning-impulse';
    this.lightning.position.set(-1.5, 12, -4);
    this.lightning.power = 0;
    this.lightning.castShadow = false;
    this.lightning.shadow.mapSize.set(512, 512);
    this.lightning.shadow.camera.near = 0.5;
    this.lightning.shadow.camera.far = 36;
    this.lightning.shadow.bias = -0.00025;
    this.root.add(this.lightning);
    this.shadowOwner = 'moving_torch';
  }

  update(timeSeconds) {
    const state = this.search.get('lighting') ?? 'auto';
    const studio = state === 'studio';
    this.sky.intensity = studio ? 0.28 : REFERENCE_GROVE_LIGHTING_PROFILE.skyIrradiance;
    this.moon.intensity = studio ? 22 : REFERENCE_GROVE_LIGHTING_PROFILE.moonIlluminanceLux;
    this.moon.position.set(studio ? 8 : -9, studio ? 12 : 16, studio ? 8 : -7);
    this.moon.target.position.set(0, studio ? 0.8 : 2.5, studio ? 0 : 1);
    const fixedTorch = state === 'torch-a' ? -4.2 : state === 'torch-b' ? 4.2 : null;
    const torchX = fixedTorch ?? Math.sin(timeSeconds * 0.34) * 5.2;
    const torchZ = state === 'torch-b' ? 3.1 : 3.6 + Math.cos(timeSeconds * 0.27) * 1.1;
    this.torch.position.set(torchX, 1.25, torchZ);
    this.torchSource.position.copy(this.torch.position);
    this.torch.power = state === 'moon' || studio
      ? 0
      : REFERENCE_GROVE_LIGHTING_PROFILE.torchLuminousPowerLumens * (0.92 + Math.sin(timeSeconds * 9.7) * 0.08);

    const automaticFlash = state === 'auto' && timeSeconds % 8 < 0.12;
    const lightningActive = state === 'lightning' || automaticFlash;
    this.lightning.power = lightningActive ? REFERENCE_GROVE_LIGHTING_PROFILE.lightningLuminousPowerLumens : 0;
    this.lightning.castShadow = lightningActive;
    this.torch.castShadow = !lightningActive && state !== 'moon' && !studio;
    this.shadowOwner = lightningActive ? 'lightning_impulse' : studio ? 'studio_directional' : state === 'moon' ? 'moon_only' : 'moving_torch';
  }

  diagnostics() {
    return {
      contract: THREE_REFERENCE_GROVE_CONTRACT,
      reference: 'tree-grove',
      tree: { ...this.treeStats },
      diagnostic: {
        selectedTree: this.selectedTree,
        viewMode: this.viewMode,
        canopyVisible: this.canopyVisible,
        angleDegrees: Number((this.angle * 180 / Math.PI).toFixed(1)),
        framing: this.framing
      },
      lightCount: 3,
      shadowOwner: this.shadowOwner
    };
  }

  dispose() {
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.torchSource.traverse((object) => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
    Object.values(this.diagnosticMaterials).forEach((material) => material.dispose());
    this.root.removeFromParent();
  }
}

function emissiveSource(outer, inner, radius) {
  const group = new THREE.Group();
  const outerMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 1),
    new THREE.MeshStandardMaterial({ color: outer, emissive: outer, emissiveIntensity: 4, roughness: 0.5 })
  );
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 0.42, 1),
    new THREE.MeshBasicMaterial({ color: inner })
  );
  group.add(outerMesh, core);
  return group;
}

function seededRotation(seed) {
  return ((seed * 2654435761) >>> 0) / 4294967296 * Math.PI * 2;
}

function normalizeView(value) {
  const mode = String(value ?? 'lit').toLowerCase();
  if (!['lit', 'wireframe', 'normals'].includes(mode)) throw new Error(`tree_reference_view_invalid:${mode}`);
  return mode;
}

function normalizeAngle(value) {
  const named = { front: 0, right: 90, rear: 180, left: 270, threequarter: 45, 'three-quarter': 45 };
  const text = String(value ?? 'front').toLowerCase();
  const degrees = Object.hasOwn(named, text) ? named[text] : Number(text);
  if (!Number.isFinite(degrees)) throw new Error(`tree_reference_angle_invalid:${text}`);
  return degrees * Math.PI / 180;
}

function normalizeFraming(value, selectedTree) {
  const framing = String(value ?? (selectedTree === 'all' ? 'gameplay' : 'full')).toLowerCase();
  if (!['gameplay', 'full', 'roots'].includes(framing)) throw new Error(`tree_reference_framing_invalid:${framing}`);
  return framing;
}
