import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import {
  GEOLOGY_DNA_CONTRACT,
  PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT,
  resolveProceduralGeologyDefinition
} from '../src/data/proceduralGeology.js';
import {
  generateProceduralGeologyFormation,
  PROCEDURAL_GEOLOGY_FORMATION_CONTRACT
} from '../src/world/proceduralGeologyGenerator.js';
import { createSceneObject } from '../src/world/sceneObjects.js';
import { buildSceneryProjection } from '../src/projection/sceneObjectProjection.js';
import { buildWebGLSceneryDepthItems } from '../src/render/backends/webgl/layers/WebGLSceneryLayer.js';

const authored = {
  contract: GEOLOGY_DNA_CONTRACT,
  seed: 48117,
  formation: 'fractured_basalt',
  palette: 'basalt_ash',
  scale: 1.28,
  heightMeters: 1.82,
  angularity: .88,
  strataAngleDegrees: 84,
  strataDensity: .68,
  erosion: .14,
  crackDensity: .82,
  fracture: .86,
  moss: .18,
  wetness: .36,
  bodyColour: '#4b5056',
  shadeColour: '#292d33',
  strataColour: '#737982',
  mossColour: '#293d31'
};

const definition = resolveProceduralGeologyDefinition(authored, { id: 'boulder:proof', type: 'boulder', x: 8, y: 6 });
equal(definition.contract, PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT, 'Geology DNA should resolve into one runtime definition contract');
equal(definition.seed, 48117, 'seed should remain compact authored truth');
equal(definition.formation, 'fractured_basalt', 'formation should select a recipe without storing mesh geometry');

const first = generateProceduralGeologyFormation(definition);
const second = generateProceduralGeologyFormation(definition);
equal(first.contract, PROCEDURAL_GEOLOGY_FORMATION_CONTRACT, 'generator should publish one inspectable formation contract');
assert(JSON.stringify(first) === JSON.stringify(second), 'the same geology seed should reproduce the same hull and surface projections');
assert(first.hull.length >= 8, 'procedural boulders should have a multi-point hull instead of one fixed triangle');
equal(first.facets.length, first.hull.length, 'the hull should be decomposed into generated facets at runtime');
assert(first.strata.length >= 3, 'strata density should generate bounded surface polylines');
assert(first.cracks.length >= 4 && first.cracks.every((crack) => crack.points.length >= 3), 'fracture intent should generate branched-looking crack polylines');
assert(first.mossPatches.length >= 1, 'moss intent should generate surface patches');

const alternate = generateProceduralGeologyFormation(resolveProceduralGeologyDefinition({ ...authored, seed: 48118 }, { id: 'boulder:alternate', type: 'boulder' }));
assert(JSON.stringify(alternate.hull) !== JSON.stringify(first.hull), 'changing only the seed should produce a distinct boulder silhouette');
const weathered = generateProceduralGeologyFormation(resolveProceduralGeologyDefinition({ ...authored, formation: 'weathered_outcrop', strataDensity: .9, erosion: .82 }, { id: 'boulder:weathered', type: 'boulder' }));
assert(weathered.strata.length > first.strata.length, 'weathered outcrop intent should project a stronger layered read');

const runtimeObjects = [
  createSceneObject({ id: 'boulder:legacy', type: 'boulder', x: 4, y: 6 }),
  createSceneObject({ id: 'boulder:basalt', type: 'boulder', x: 9, y: 6, geology: authored }),
  createSceneObject({ id: 'boulder:outcrop', type: 'boulder', x: 14, y: 6, geology: { seed: 9127, formation: 'weathered_outcrop', scale: 1.45, moss: .42 } })
];
assert(runtimeObjects.every((object) => object.geologyDefinition?.contract === PROCEDURAL_GEOLOGY_DEFINITION_CONTRACT), 'legacy boulders should normalize at the runtime boundary');
assert(runtimeObjects.every((object) => object.render.kind === 'procedural_geology'), 'all geology recipes should share one generated renderer path');
assert(runtimeObjects.every((object) => object.widthTiles === 2 && object.heightTiles === 2 && object.blocksMovement), 'procedural visuals must preserve the established 2x2 blocker');
assert(runtimeObjects.every((object) => object.materialProfileId === 'stone_moss'), 'procedural geology must preserve the stone material contract');

const projection = { scenery: buildSceneryProjection(runtimeObjects, 16) };
assert(projection.scenery.every((object) => object.geologyDefinition?.formation), 'renderer-neutral projection should carry resolved geology intent');
const built = buildWebGLSceneryDepthItems(projection, {
  camera: { visibleWorldBounds: () => ({ left: 0, top: 0, right: 512, bottom: 512 }) },
  lightSpaceCulling: { enabled: false }
});
equal(built.proceduralGeologyCount, 3, 'WebGL diagnostics should prove all boulders used the procedural path');
assert(built.proceduralGeologyHullPointCount >= 24, 'WebGL diagnostics should expose generated hull complexity');
assert(built.proceduralGeologyFacetCount >= 24, 'WebGL diagnostics should expose generated facets');
assert(built.proceduralGeologyStrataSegmentCount > 0, 'WebGL diagnostics should expose strata projections');
assert(built.proceduralGeologyCrackSegmentCount > 0, 'WebGL diagnostics should expose crack projections');
assert(built.items.every((item) => item.proceduralGeology?.generatedTriangleCount > 12), 'procedural geology should triangulate only at the renderer boundary');

const scenerySource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLSceneryLayer.js', import.meta.url), 'utf8');
assert(!scenerySource.includes('function buildBoulder'), 'the fixed boulder builder should be deleted after procedural migration');
assert(!scenerySource.includes("renderKind === 'boulder'"), 'no lit-detail branch should retain the legacy boulder render kind');

console.log('proceduralGeology.test.mjs passed');
