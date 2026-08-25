import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';
import { ThreeSceneryFactory } from './ThreeSceneryFactory.js';
import { ThreePhysicalLightAdapter } from './ThreePhysicalLightAdapter.js';
import { ThreeActorLayer } from './ThreeActorLayer.js';
import { ThreeEffectsLayer } from './ThreeEffectsLayer.js';
import { ThreeOpeningWorldLayer } from './ThreeOpeningWorldLayer.js';
import { ThreeTerrainMaterialSystem } from './ThreeTerrainMaterialSystem.js';
import { ThreeCameraVisibilityFocus } from './ThreeCameraVisibilityFocus.js';
import { ThreeUndergrowthLayer } from './ThreeUndergrowthLayer.js';
import { RENDER_BUDGETS } from '../../../data/renderBudgets.js';
import { ThreeFixedIsometricRenderEnvelope } from './ThreeFixedIsometricRenderEnvelope.js';

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
    this.renderEnvelope = new ThreeFixedIsometricRenderEnvelope({
      ...RENDER_BUDGETS.renderEnvelope3D,
      search: options.search
    });
    this.undergrowth = new ThreeUndergrowthLayer(this.staticRoot, tileSize, {
      chunkSizeTiles: this.renderEnvelope.options.chunkSizeTiles
    });
    this.terrainSystem = new ThreeTerrainMaterialSystem(this.staticRoot, {
      tileMeters: WORLD_SCALE.tileMeters,
      chunkSizeTiles: this.renderEnvelope.options.chunkSizeTiles,
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
    this.sceneryMaterialStats = emptySceneryMaterialStats();
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
    this.actors.update(dynamicWorld.actors, view);
    this.effects.update(dynamicWorld, projection.screen ?? projection, view);
    this.opening.update((projection.screen ?? projection).opening);
    this.terrainSystem.updateWeather(dynamicWorld.atmosphericOverlay, dynamicWorld.renderTime ?? projection.source?.renderTime ?? 0);
    this.terrainSystem.updateView(view);
    this.updateShadowCasters(dynamicWorld.actors);
    if (this.renderEnvelope.update(view.camera) > 0) this.lights.requestShadowRefresh();
  }

  rebuildStatic(projection) {
    this.clearStatic();
    this.buildTerrain(projection.terrain, projection.scenery);
    for (const entry of this.terrainSystem.renderEnvelopeObjects()) this.renderEnvelope.register(entry.object, entry);
    for (const entry of this.terrainSystem.cameraOcclusionObjects()) {
      this.cameraVisibilityFocus.registerObject(entry.object, { id: entry.object.name, role: entry.role });
    }
    const tree = { count: 0, branches: 0, foliage: 0 };
    this.sceneryMaterialStats = emptySceneryMaterialStats();
    const undergrowthPackets = (projection.scenery ?? []).filter((packet) => packet.render?.kind === 'procedural_undergrowth');
    this.undergrowth.rebuild(undergrowthPackets);
    for (const entry of this.undergrowth.renderEnvelopeObjects()) this.renderEnvelope.register(entry.object, entry);
    for (const packet of projection.scenery ?? []) {
      if (packet.render?.kind === 'procedural_undergrowth') continue;
      const object = this.sceneryFactory.create(packet);
      const prepared = prepareSceneryMaterialTargets(object);
      this.sceneryMaterialStats.preparedTargets += prepared.targetCount;
      this.sceneryMaterialStats.sharedFireBindings += prepared.sharedFireBindings;
      this.sceneryMaterialStats.fallbackTargets += prepared.fallbackTargets;
      this.staticRoot.add(object);
      this.cameraVisibilityFocus.registerObject(object, { id: packet.id, role: packet.renderKind ?? packet.type ?? 'scenery' });
      this.sceneryObjects.set(packet.id, object);
      this.renderEnvelope.register(object, { id: packet.id, kind: sceneryRenderEnvelopeKind(packet) });
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
    this.stats.undergrowth = this.undergrowth.diagnostics();
  }

  setDebugVisible(enabled) {
    this.actors.setDebugVisible(enabled);
    this.terrainSystem.setDebugVisible(enabled);
  }

  setTerrainDebugMode(mode) { return this.terrainSystem.setDebugMode(mode); }
  cycleTerrainDebugMode() { return this.terrainSystem.cycleDebugMode(); }
  setGroundDetailEnabled(enabled) { return this.terrainSystem.setGroundDetailEnabled(enabled); }
  toggleGroundDetail() { return this.terrainSystem.toggleGroundDetail(); }
  takeWarmupBundle() { return this.effects.takeWarmupBundle(); }
  setTerrainProofCanopyVisible(visible) {
    for (const object of this.sceneryObjects.values()) {
      if (/tree|procedural_tree/.test(String(object.userData.renderKind ?? ''))) this.renderEnvelope.setOwnerVisible(object, visible);
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
    this.renderEnvelope.clear();
    this.cameraVisibilityFocus.clearOccluders();
    for (const object of this.sceneryObjects.values()) disposeDynamicSceneryMaterials(object);
    this.undergrowth.clear();
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
    this.undergrowth.applyMaterialUpdates(updates);
    for (const update of updates ?? []) {
      const object = this.sceneryObjects.get(update.id);
      const state = update.material?.state;
      if (!object || !state) continue;
      this.sceneryMaterialStats.updatePackets += 1;
      const targets = object.userData.sceneryMaterialTargets ?? prepareSceneryMaterialTargets(object).targets;
      for (const target of targets) this.applySceneryMaterialTarget(target, state);
    }
  }

  applySceneryMaterialTarget(target, state) {
    const child = target.child;
    const char = clamp01(state.charAmount ?? state.burnAmount);
    const heat = clamp01(state.heatAmount);
    const ember = clamp01(state.emberAmount);
    if (target.sceneryState) {
      target.sceneryState.charAmount = char;
      target.sceneryState.heatAmount = heat;
      target.sceneryState.emberAmount = ember;
      this.sceneryMaterialStats.sharedStateUpdates += 1;
    } else {
      if (!target.dynamicMaterial) {
        target.dynamicMaterial = cloneSceneryMaterial(child.material);
        child.material = target.dynamicMaterial;
        child.userData.dynamicSceneryMaterial = target.dynamicMaterial;
        this.cameraVisibilityFocus.registerMaterial(target.dynamicMaterial);
        this.sceneryMaterialStats.fallbackMaterialAllocations += 1;
      }
      const material = target.dynamicMaterial;
      const charScale = target.role === 'foliage_leaf' ? 0.88 : 0.72;
      if (target.baseColour && material.color) material.color.copy(target.baseColour).multiplyScalar(Math.max(target.role === 'foliage_leaf' ? 0.08 : 0.22, 1 - char * charScale));
      if (material.emissive) {
        material.emissive.set(0xff4a13);
        material.emissiveIntensity = heat * 2.8 + ember * 0.8;
      }
    }
    if (child.isInstancedMesh && target.role === 'foliage_leaf') {
      child.count = state.firePhase === 'burnt_out' ? 0 : Math.max(0, Math.round(target.baseInstanceCount * (1 - char * 0.86)));
    }
  }

  diagnostics() {
    const terrainDiagnostics = this.terrainSystem.diagnostics();
    return {
      contract: THREE_LIVE_WORLD_CONTRACT,
      ...this.stats,
      scenery: this.sceneryFactory.diagnostics(),
      undergrowth: this.undergrowth.diagnostics(),
      lights: this.lights.diagnostics(),
      cameraVisibilityFocus: this.cameraVisibilityFocus.diagnostics(),
      renderEnvelope: this.renderEnvelope.diagnostics(),
      sceneryMaterials: { ...this.sceneryMaterialStats },
      actors: this.actors.diagnostics(),
      effects: this.effects.diagnostics(),
      opening: this.opening.diagnostics(),
      ...terrainDiagnostics,
      staticSignature: this.staticSignature
    };
  }

  dispose() {
    this.clearStatic();
    this.undergrowth.dispose();
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

function prepareSceneryMaterialTargets(object) {
  const targets = [];
  let sharedFireBindings = 0;
  let fallbackTargets = 0;
  object.traverse((child) => {
    if (!child.isMesh || !child.material?.isMaterial) return;
    const uniforms = sceneryStateUniforms(child.material);
    const sceneryState = uniforms ? installSceneryStateBinding(child, uniforms) : null;
    if (sceneryState) sharedFireBindings += 1;
    else fallbackTargets += 1;
    targets.push({
      child,
      role: child.userData.semanticRole,
      baseColour: child.material.color?.clone() ?? null,
      baseInstanceCount: child.isInstancedMesh
        ? child.userData.semanticBaseInstanceCount ?? child.instanceMatrix.count
        : 0,
      sceneryState,
      dynamicMaterial: null
    });
  });
  object.userData.sceneryMaterialTargets = targets;
  return { targets, targetCount: targets.length, sharedFireBindings, fallbackTargets };
}

function installSceneryStateBinding(child, uniforms) {
  if (child.userData.sceneryMaterialState) return child.userData.sceneryMaterialState;
  const state = { charAmount: 0, heatAmount: 0, emberAmount: 0 };
  const previous = child.onBeforeRender;
  child.onBeforeRender = function (...args) {
    previous?.apply(this, args);
    uniforms.uSceneryCharAmount.value = state.charAmount;
    uniforms.uSceneryHeatAmount.value = state.heatAmount;
    uniforms.uSceneryEmberAmount.value = state.emberAmount;
  };
  child.userData.sceneryMaterialState = state;
  return state;
}

function sceneryStateUniforms(material) {
  return material.userData?.barkPbr?.sceneryStateUniforms
    ?? material.userData?.foliagePbr?.sceneryStateUniforms
    ?? null;
}

function cloneSceneryMaterial(source) {
  const userData = source.userData;
  let clone;
  source.userData = {};
  try {
    clone = source.clone();
  } finally {
    source.userData = userData;
  }
  clone.userData = { dynamicSceneryClone: true };
  clone.onBeforeCompile = source.onBeforeCompile;
  clone.customProgramCacheKey = source.customProgramCacheKey;
  return clone;
}

function emptySceneryMaterialStats() {
  return {
    policy: 'shared_tree_fire_uniforms_with_prepared_render_targets_v1',
    preparedTargets: 0,
    sharedFireBindings: 0,
    fallbackTargets: 0,
    updatePackets: 0,
    sharedStateUpdates: 0,
    fallbackMaterialAllocations: 0
  };
}

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

function sceneryRenderEnvelopeKind(packet) {
  return /tree|foliage|fern|shrub|bramble/.test(`${packet.render?.kind ?? ''}:${packet.type ?? ''}`)
    ? 'foliage'
    : 'scenery';
}
