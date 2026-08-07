import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';
import { ThreeSceneryFactory } from './ThreeSceneryFactory.js';
import { ThreePhysicalLightAdapter } from './ThreePhysicalLightAdapter.js';
import { ThreeActorLayer } from './ThreeActorLayer.js';
import { ThreeEffectsLayer } from './ThreeEffectsLayer.js';
import { ThreeOpeningWorldLayer } from './ThreeOpeningWorldLayer.js';
import { ThreeTerrainMaterialSystem } from './ThreeTerrainMaterialSystem.js';
import { ThreeCameraVisibilityFocus } from './ThreeCameraVisibilityFocus.js';

export const THREE_LIVE_WORLD_CONTRACT = 'black-sky-bound.three-live-world.v1';

export class ThreeLiveWorld {
  constructor(scene, treeFactory, tileSize, options = {}) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.root = new THREE.Group();
    this.root.name = 'live-world:root';
    this.staticRoot = new THREE.Group();
    this.staticRoot.name = 'live-world:static';
    this.dynamicRoot = new THREE.Group();
    this.dynamicRoot.name = 'live-world:dynamic';
    this.root.add(this.staticRoot, this.dynamicRoot);
    scene.add(this.root);
    this.sceneryFactory = new ThreeSceneryFactory(treeFactory, tileSize);
    this.terrainSystem = new ThreeTerrainMaterialSystem(this.staticRoot, {
      tileMeters: WORLD_SCALE.tileMeters,
      anisotropy: options.anisotropy,
      search: options.search
    });
    this.lights = new ThreePhysicalLightAdapter(this.root, tileSize);
    this.cameraVisibilityFocus = new ThreeCameraVisibilityFocus(this.root, tileSize);
    this.actors = new ThreeActorLayer(this.dynamicRoot, { search: options.search });
    this.effects = new ThreeEffectsLayer(this.dynamicRoot, tileSize);
    this.opening = new ThreeOpeningWorldLayer(this.dynamicRoot, tileSize);
    this.staticSignature = null;
    this.shadowCandidates = [];
    this.sceneryObjects = new Map();
    this.shadowSelectionCell = '';
    this.staticInvalidated = true;
    this.stats = { terrainTiles: 0, cliffTiles: 0, sceneryCount: 0, tree: { count: 0, branches: 0, foliage: 0 } };
  }

  update(projection, view = {}) {
    const staticWorld = projection.staticWorld ?? projection;
    const dynamicWorld = projection.dynamicWorld ?? projection;
    const signature = staticWorld.signature ?? `${projection.source?.mapId}:${projection.source?.mapRevision}:${staticWorld.terrain?.mapWidth}:${staticWorld.terrain?.mapHeight}`;
    if (signature !== this.staticSignature) {
      this.rebuildStatic(staticWorld);
      this.staticSignature = signature;
      this.staticInvalidated = true;
    }
    this.applySceneryMaterialUpdates(dynamicWorld.sceneryMaterialUpdates);
    const player = dynamicWorld.actors?.find((actor) => actor.team === 'player' && actor.alive) ?? dynamicWorld.actors?.[0] ?? null;
    this.lights.update(dynamicWorld.lights, dynamicWorld.renderTime ?? projection.source?.renderTime ?? 0, (projection.screen ?? projection).opening, player);
    this.cameraVisibilityFocus.update(dynamicWorld.cameraVisibilityFocus, view);
    this.actors.update(dynamicWorld.actors);
    this.effects.update(dynamicWorld, projection.screen ?? projection);
    this.opening.update((projection.screen ?? projection).opening);
    this.terrainSystem.updateView(view);
    this.updateShadowCasters(dynamicWorld.actors);
  }

  rebuildStatic(projection) {
    this.clearStatic();
    this.buildTerrain(projection.terrain, projection.scenery);
    for (const entry of this.terrainSystem.cameraOcclusionObjects()) {
      this.cameraVisibilityFocus.registerObject(entry.object, { id: entry.object.name, role: entry.role });
    }
    const tree = { count: 0, branches: 0, foliage: 0 };
    for (const packet of projection.scenery ?? []) {
      const object = this.sceneryFactory.create(packet);
      this.staticRoot.add(object);
      this.cameraVisibilityFocus.registerObject(object, { id: packet.id, role: packet.renderKind ?? packet.type ?? 'scenery' });
      this.sceneryObjects.set(packet.id, object);
      if (hasShadowCaster(object)) this.shadowCandidates.push(object);
      const recipe = object.userData.recipe;
      if (recipe) {
        tree.count += 1;
        tree.branches += recipe.diagnostics.branchCount;
        tree.foliage += recipe.diagnostics.foliageClusterCount;
      }
    }
    this.stats.sceneryCount = projection.scenery?.length ?? 0;
    this.stats.tree = tree;
  }

  setDebugVisible(enabled) {
    this.actors.setDebugVisible(enabled);
    this.terrainSystem.setDebugVisible(enabled);
  }

  setTerrainDebugMode(mode) { return this.terrainSystem.setDebugMode(mode); }
  cycleTerrainDebugMode() { return this.terrainSystem.cycleDebugMode(); }
  setGroundDetailEnabled(enabled) { return this.terrainSystem.setGroundDetailEnabled(enabled); }
  toggleGroundDetail() { return this.terrainSystem.toggleGroundDetail(); }
  setTerrainProofCanopyVisible(visible) {
    for (const object of this.sceneryObjects.values()) {
      if (/tree|procedural_tree/.test(String(object.userData.renderKind ?? ''))) object.visible = !!visible;
    }
    return !!visible;
  }

  consumeStaticInvalidation() {
    const value = this.staticInvalidated;
    this.staticInvalidated = false;
    return value;
  }

  buildTerrain(terrain, scenery) {
    this.terrainSystem.rebuild(terrain, scenery);
    const cliffTiles = (terrain?.tiles ?? []).filter((tile) => tile.blocks === true).length;
    this.stats.terrainTiles = terrain?.tiles?.length ?? 0;
    this.stats.cliffTiles = cliffTiles;
  }

  clearStatic() {
    this.cameraVisibilityFocus.clearOccluders();
    for (const object of this.sceneryObjects.values()) disposeDynamicSceneryMaterials(object);
    this.staticRoot.clear();
    this.shadowCandidates.length = 0;
    this.sceneryObjects.clear();
    this.shadowSelectionCell = '';
    this.terrainSystem.clearSurfaces();
  }

  updateShadowCasters(actors = []) {
    const player = actors.find((actor) => actor.team === 'player' && actor.alive) ?? actors[0];
    if (!player) return;
    const focusX = player.x * WORLD_SCALE.tileMeters;
    const focusZ = player.y * WORLD_SCALE.tileMeters;
    const cell = `${Math.floor(focusX)}:${Math.floor(focusZ)}:${this.staticSignature}`;
    if (cell === this.shadowSelectionCell) return;
    this.shadowSelectionCell = cell;
    const selected = new Set(this.shadowCandidates
      .map((object) => ({ object, distance: Math.hypot(object.position.x - focusX, object.position.z - focusZ) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 24)
      .map((entry) => entry.object));
    for (const object of this.shadowCandidates) {
      const enabled = selected.has(object);
      object.traverse((child) => { if (child.isMesh) child.castShadow = enabled; });
    }
    this.stats.shadowCasterObjects = selected.size;
    this.stats.shadowSelectionCell = cell;
    this.lights.requestShadowRefresh();
  }

  applySceneryMaterialUpdates(updates = []) {
    for (const update of updates ?? []) {
      const object = this.sceneryObjects.get(update.id);
      const state = update.material?.state;
      if (!object || !state) continue;
      object.traverse((child) => {
        if (!child.isMesh || !child.material?.isMaterial) return;
        if (!child.userData.dynamicSceneryMaterial) {
          const clone = child.material.clone();
          child.material = clone;
          this.cameraVisibilityFocus.registerMaterial(clone);
          child.userData.dynamicSceneryMaterial = clone;
          child.userData.dynamicSceneryBaseColour = clone.color?.clone();
        }
        const material = child.material;
        const base = child.userData.dynamicSceneryBaseColour;
        if (base && material.color) material.color.copy(base).multiplyScalar(Math.max(0.22, 1 - Number(state.charAmount ?? state.burnAmount ?? 0) * 0.72));
        if (material.emissive) {
          material.emissive.set(0xff4a13);
          material.emissiveIntensity = Number(state.heatAmount ?? 0) * 2.8 + Number(state.emberAmount ?? 0) * 0.8;
        }
      });
    }
  }

  diagnostics() {
    const terrainDiagnostics = this.terrainSystem.diagnostics();
    return {
      contract: THREE_LIVE_WORLD_CONTRACT,
      ...this.stats,
      scenery: this.sceneryFactory.diagnostics(),
      lights: this.lights.diagnostics(),
      cameraVisibilityFocus: this.cameraVisibilityFocus.diagnostics(),
      actors: this.actors.diagnostics(),
      effects: this.effects.diagnostics(),
      opening: this.opening.diagnostics(),
      ...terrainDiagnostics,
      staticSignature: this.staticSignature
    };
  }

  dispose() {
    this.clearStatic();
    this.sceneryFactory.dispose();
    this.lights.dispose();
    this.cameraVisibilityFocus.dispose();
    this.actors.dispose();
    this.effects.dispose();
    this.opening.dispose();
    this.terrainSystem.dispose();
    this.root.removeFromParent();
  }
}

function hasShadowCaster(object) {
  let result = false;
  object.traverse((child) => { if (child.castShadow) result = true; });
  return result;
}

function disposeDynamicSceneryMaterials(object) {
  object.traverse((child) => {
    child.userData?.dynamicSceneryMaterial?.dispose?.();
    if (child.userData) delete child.userData.dynamicSceneryMaterial;
  });
}
