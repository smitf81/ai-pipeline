import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { ThreeEffectsLayer } from '../src/render/backends/three/ThreeEffectsLayer.js';

const root = new THREE.Group();
const layer = new ThreeEffectsLayer(root, 32);
const rainMaterial = layer.instanced.get('rain').material;
const sparkMaterial = layer.atmosphereSparkField.material;
const rainMaterialVersion = rainMaterial.version;
const sparkMaterialVersion = sparkMaterial.version;
assert(
  layer.babyNapalmDrool.materials.filter((material) => material.transparent && material.side === THREE.DoubleSide)
    .every((material) => material.forceSinglePass),
  'transparent double-sided baby drool batches should render in one pass'
);
assert(
  layer.foliageFireEffects.materials.every((material) => material.forceSinglePass),
  'transparent double-sided foliage fire batches should render in one pass'
);
const packet = {
  renderTime: 1,
  actors: [{ id: 1, team: 'player', alive: true, x: 4, y: 5 }],
  decals: [{ worldX: 128, worldY: 160, radius: 12, colour: '#442218', opacity: 0.5 }],
  groundHazards: [{ worldX: 132, worldY: 164, radius: 10, colour: '#ff4218', hotColour: '#ffc26e', opacity: 0.8 }],
  projectiles: [],
  effects: [],
  fogSmoke: [
    { id: 'generic-smoke', sourceKind: 'dragon_smoke_cloud', worldX: 128, worldY: 160, radius: 18, colour: '#666666', opacity: 0.3 },
    { id: 'shrub-smoulder', sourceKind: 'smoulder_patch_wisp', worldX: 144, worldY: 164, radius: 24, opacity: 0.62, forwardX: 0.18, forwardY: -1 }
  ],
  droppedTorches: [],
  particles: [{ worldX: 128, worldY: 160, radius: 1, phase: 0.4, kind: 'ember' }],
  lights: [{ id: 'storm:1:0', sourceKind: 'storm_lightning', worldX: 150, worldY: 145, effectiveIntensity: 0.92, colour: '#a9c9ff', innerColour: '#f1f6ff', stormEvent: { eventIndex: 1, flashIndex: 0 } }],
  atmosphericOverlay: { enabled: true, renderTime: 1, tuning: { rainEnabled: true, rainDensity: 1, rainSpeed: 1380, rainAngle: 18, sparkEnabled: true, sparkRate: 3.4, sparkDrift: { x: -34, y: -118 }, overlayOpacity: 0.98 } },
  worldEvents: {
    flyovers: [{
      id: 'reuse-test-mama',
      worldX: 128,
      worldY: 160,
      headingRadians: 0,
      scale: 0.46,
      opacity: 0.82,
      altitudeMeters: 9.2,
      breath: {
        active: true,
        opacity: 0.88,
        phase: 0.5,
        originWorldX: 136,
        originWorldY: 160,
        targetWorldX: 248,
        targetWorldY: 164
      }
    }],
    fireWalls: [],
    foliageFires: [{ id: 'burning-shrub', family: 'shrub', phase: 'ablaze', heatAmount: 0.88, physicalHeightMeters: 0.72, worldX: 144, worldY: 164, worldWidth: 24, worldHeight: 20 }]
  }
};

const view = {
  cameraTarget: new THREE.Vector3(2, 0, 2.5),
  cameraDirection: new THREE.Vector3(-0.45, -0.75, -0.45),
  cameraRight: new THREE.Vector3(0.707, 0, -0.707),
  frustumHeight: 10
};
layer.update(packet, {}, view);
const first = layer.diagnostics();
layer.update(packet, {}, view);
const second = layer.diagnostics();
equal(rainMaterial.version, rainMaterialVersion, 'stable rain updates must not invalidate the material every frame');
equal(sparkMaterial.version, sparkMaterialVersion, 'stable atmospheric spark updates must not invalidate the material every frame');
equal(second.allocations, first.allocations, 'stable effect counts should not allocate new Three.js objects on the next frame');
assert(second.reuses > 0, 'stable effect counts should reuse pooled and instanced objects');
assert(second.poolCount >= 4, 'effect families should expose bounded pool diagnostics');
equal(second.lightningBolts, 1, 'active lightning should have a visible pooled world-space strike, not only an invisible light impulse');
equal(second.lightningAnchors[0].worldX, 150, 'lightning diagnostics should retain the authored world anchor');
assert(second.rainStreaks >= 280, 'the Three renderer should spend the storm overlay budget on dense rain');
assert(second.atmosphereSparks >= 1 && second.atmosphereSparks <= 6, 'the Three renderer should preserve the sparse pre-3D active spark cadence');
equal(second.atmosphereSparkPresentation.primitive, 'soft_round_glowing_point_mote', 'atmospheric sparks should be tiny round glowing motes');
equal(second.atmosphereSparkPresentation.cadencePolicy, 'pre_3d_spawn_rate_lifetime_window_v0', 'Three sparks should consume sparkRate as a temporal spawn cadence');
equal(second.atmosphereSparkPresentation.triangleFallbacks, 0, 'atmospheric sparks must not revive the abundant cone/triangle fallback');
assert(second.atmosphereSparkPresentation.maxPointSizePx <= 5.6, 'spark cores should remain small screen-space specks');
assert(!layer.instanced.has('atmosphere-sparks'), 'atmospheric sparks should not retain the old instanced cone field');
equal(layer.atmosphereSparkField.type, 'Points', 'atmospheric sparks should share one soft-point batch');
equal(second.foliageFire.flameTufts, 1, 'burning shrubbery should render one grounded tapered flame tuft');
equal(second.foliageFire.smokeWisps, 1, 'smouldering shrubbery should render one rising smoke wisp');
equal(second.foliageFire.primitiveFallbacks, 0, 'foliage effects must not revive primitive orb or smoke-mass fallbacks');
equal(layer.pools.get('smoke').filter((mesh) => mesh.visible).length, 1, 'only the unrelated generic smoke packet should use the legacy smoke pool');
assert(!layer.pools.has('foliage-fire'), 'foliage fire must not own the obsolete icosahedron orb pool');
const mamaPool = layer.pools.get('mama-flyover')?.[0];
assert(mamaPool?.userData?.flameBatch?.isInstancedMesh, 'Mama dragonfire segments should share one instanced batch');
assert(mamaPool?.userData?.coreBatch?.isInstancedMesh, 'Mama dragonfire pressure core should share one separate instanced batch');
assert(mamaPool?.userData?.emberBatch?.isInstancedMesh, 'Mama dragonfire embers should share one instanced batch');
equal(mamaPool.userData.flameBatch.count, 14, 'dragonfire outer batch should retain nine delivery segments plus five impact lashes');
equal(mamaPool.userData.coreBatch.count, 14, 'dragonfire core batch should mirror every delivery and impact segment');
equal(mamaPool.userData.emberBatch.count, 18, 'dragonfire ember batch should retain eighteen bounded embers');
equal(second.dragonfireStream.segmentCount, 9, 'dragonfire diagnostics should expose nine pressurised delivery segments');
equal(second.dragonfireStream.impactLashCount, 5, 'dragonfire diagnostics should expose five ground-impact lashes');
equal(second.dragonfireStream.drawCalls, 3, 'dragonfire should remain bounded to outer, core and ember batches');
equal(layer.foliageFireEffects.flames.geometry.type, 'BufferGeometry', 'foliage flames should use the dedicated tapered tuft geometry');
equal(layer.foliageFireEffects.smoke.geometry.type, 'BufferGeometry', 'foliage smoke should use the dedicated crossed-ribbon geometry');
layer.dispose();
equal(layer.geometries.size, 0, 'effect disposal should clear cached geometries');
equal(layer.ownedMaterials.size, 0, 'effect disposal should clear owned materials');
