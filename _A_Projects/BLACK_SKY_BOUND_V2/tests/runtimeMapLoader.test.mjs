import { assert, equal } from './assert.mjs';
import { createDemoMap } from '../src/world/map.js';
import {
  loadRuntimeMap,
  loadRuntimeMapWithReceipt,
  normalizeRuntimeMapPath,
  normalizeRuntimeMap,
  resolveRuntimeMapRequest
} from '../src/world/runtimeMapLoader.js';
import { Faction } from '../src/constants/factions.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { CreatureRecipeId } from '../src/data/creatures/creatureRecipes.js';

const payload = JSON.parse(JSON.stringify(createDemoMap()));
payload.title = 'AXIOM Runtime Map';
payload.spawn.rotation = -Math.PI / 2;
payload.unitPlacements = [{ id: 'husk-a', type: 'husk', team: 'enemy', x: 12, y: 12 }];
payload.unitSpawners = [{
  id: 'wolf-den-a',
  type: 'werewolf',
  team: 'wolves',
  x: 14,
  y: 12,
  intervalSeconds: 2.5,
  hitPoints: 64,
  fixtureRadiusTiles: 0.7
}];
payload.transitions = {
  escapeZone: {
    mode: 'load_next_map',
    nextMapId: 'axiom_second_approach',
    nextMapPath: '/data/maps/axiom-second-approach.runtime-map.json',
    arrivalSequenceId: 'smoke_instinct_awakening',
    label: 'Ash Road Threshold'
  }
};

const normalized = normalizeRuntimeMap(payload);
equal(normalized.contract, 'black-sky-bound.runtime-map.v0', 'loader should preserve the runtime contract');
equal(normalized.title, 'AXIOM Runtime Map', 'loader should preserve runtime metadata');
equal(normalized.spawn.rotation, -Math.PI / 2, 'loader should preserve an authored north-facing arrival');
equal(normalized.unitPlacements.length, 1, 'loader should preserve direct unit placements');
equal(normalized.unitSpawners[0].hitPoints, 64, 'loader should preserve baked spawner fixture health');
equal(normalized.unitSpawners[0].fixtureRadiusTiles, 0.7, 'loader should preserve baked spawner fixture radius');
equal(normalized.transitions.escapeZone.nextMapPath, '/data/maps/axiom-second-approach.runtime-map.json', 'loader should preserve bounded escape-zone next-map paths');
equal(normalized.transitions.escapeZone.nextMapId, 'axiom_second_approach', 'loader should preserve transition target identity for diagnostics');
equal(normalized.transitions.escapeZone.arrivalSequenceId, 'smoke_instinct_awakening', 'loader should preserve the authored arrival sequence trigger');
equal(normalized.atmosphere.rainAndSparksEnabled, true, 'legacy runtime maps should default rain and sparks on');
equal(normalized.sceneObjects.length, payload.sceneObjects.length, 'loader should normalize baked scene objects');
equal(Object.isFrozen(normalized), true, 'loaded runtime maps should be immutable');
equal(Object.isFrozen(normalized.tiles), true, 'loaded runtime map tiles should be immutable');
const northFacingGame = createInitialGameState(normalized);
equal(getComponent(northFacingGame.world, northFacingGame.dragonId, ComponentType.Transform).rotation, -Math.PI / 2, 'runtime game creation should apply the authored arrival facing');
equal(northFacingGame.renderLayers.atmosphericOverlay.enabled, true, 'initial game state should apply the region atmosphere policy');

const clearAtmosphereMap = normalizeRuntimeMap({
  ...payload,
  atmosphere: { contract: 'black-sky-bound.region-atmosphere.v1', rainAndSparksEnabled: false }
});
equal(clearAtmosphereMap.atmosphere.rainAndSparksEnabled, false, 'runtime loader should preserve an authored local atmosphere override');
equal(createInitialGameState(clearAtmosphereMap).renderLayers.atmosphericOverlay.enabled, false, 'runtime game state should suppress both atmosphere effects for a disabled region');
assertThrows(
  () => normalizeRuntimeMap({ ...payload, atmosphere: { rainAndSparksEnabled: 'yes' } }),
  /runtime_map_region_atmosphere_enabled_invalid/,
  'runtime loader should reject ambiguous atmosphere settings'
);

const factionDefaultsPayload = JSON.parse(JSON.stringify(payload));
factionDefaultsPayload.unitPlacements = [
  { id: 'raider-default', type: 'raider', x: 10, y: 10, creature: { recipeId: CreatureRecipeId.RAIDER_SCAVENGER, seed: 445 } },
  { id: 'husk-default', type: 'husk', x: 11, y: 10 },
  { id: 'wolf-default', type: 'werewolf', x: 12, y: 10 },
  { id: 'legacy-enemy', type: 'raider', team: 'enemy', x: 13, y: 10 }
];
const factionDefaults = normalizeRuntimeMap(factionDefaultsPayload);
equal(factionDefaults.unitPlacements[0].team, Faction.RAIDERS, 'runtime raider placements should use actor faction defaults');
equal(factionDefaults.unitPlacements[0].creature.seed, 445, 'runtime raider placements should preserve recipe seed data');
equal(factionDefaults.unitPlacements[1].team, Faction.HUSKS, 'runtime husk placements should use actor faction defaults');
equal(factionDefaults.unitPlacements[2].team, Faction.WOLVES, 'runtime werewolf placements should use actor faction defaults');
equal(factionDefaults.unitPlacements[3].team, Faction.ENEMY, 'explicit legacy enemy teams should remain compatible');
assert(factionDefaults.enemySpawns.every((entry) => entry.team === Faction.ENEMY), 'legacy enemySpawns without teams should remain generic enemy');

equal(resolveRuntimeMapRequest('?map=/data/maps/axiom-first-escape.runtime-map.json'), '/data/maps/axiom-first-escape.runtime-map.json', 'map query should resolve a bounded runtime-map path');
equal(resolveRuntimeMapRequest('?proof=1'), null, 'missing map query should keep the built-in map path');
equal(normalizeRuntimeMapPath('data\\maps\\axiom-first-escape.runtime-map.json'), '/data/maps/axiom-first-escape.runtime-map.json', 'runtime paths should normalize separators and leading slash');
assertThrows(() => resolveRuntimeMapRequest('?map=../../outside.json'), /runtime_map_request_invalid/, 'map query should reject traversal');
assertThrows(() => normalizeRuntimeMap({ ...payload, sceneDocument: {} }), /runtime_map_authoring_field_forbidden:sceneDocument/, 'loader should reject editor state');
assertThrows(() => normalizeRuntimeMap({ ...payload, lastResize: {} }), /runtime_map_authoring_field_forbidden:lastResize/, 'loader should reject authoring resize provenance');
assertThrows(() => normalizeRuntimeMap({ ...payload, contract: 'wrong.contract' }), /runtime_map_contract_invalid/, 'loader should reject mismatched contracts');
assertThrows(
  () => normalizeRuntimeMap({
    ...payload,
    transitions: { escapeZone: { mode: 'load_next_map', nextMapPath: '../../outside.runtime-map.json' } }
  }),
  /runtime_map_escape_transition_path_invalid/,
  'loader should reject transition targets outside the runtime map directory'
);

const fetched = await loadRuntimeMap('/data/maps/axiom-first-escape.runtime-map.json', {
  fetchImpl: async () => ({ ok: true, json: async () => payload })
});
assert(fetched.sceneObjects.length > 0, 'fetch loader should return normalized runtime content');

const receipt = await loadRuntimeMapWithReceipt('/data/maps/axiom-first-escape.runtime-map.json', {
  fetchImpl: async (path, options) => {
    equal(path, '/data/maps/axiom-first-escape.runtime-map.json', 'loader should fetch the normalized runtime path');
    equal(options.cache, 'no-store', 'loader should bypass stale browser cache');
    return { ok: true, text: async () => `${JSON.stringify(payload)}\n` };
  },
  expectedMapId: payload.id,
  expectedScenarioId: payload.scenarioId,
  hashImpl: async () => 'proof-hash'
});
equal(receipt.map.id, payload.id, 'load receipt should carry the normalized map');
equal(receipt.width, payload.width, 'load receipt should expose runtime width');
equal(receipt.height, payload.height, 'load receipt should expose runtime height');
equal(receipt.path, '/data/maps/axiom-first-escape.runtime-map.json', 'load receipt should expose the exact path');
equal(receipt.hash, 'proof-hash', 'load receipt should expose the content hash when available');
equal(receipt.version, `${payload.contract}:revision-${payload.revision}`, 'load receipt should expose contract and revision as version');
equal(receipt.fallbackUsed, false, 'runtime-map loading should never disguise fallback as success');

const expandedPayload = {
  ...payload,
  width: 80,
  height: 60,
  tiles: Array.from({ length: 60 }, (_, y) => Array.from({ length: 80 }, (_, x) => (
    x === 0 || y === 0 || x === 79 || y === 59 ? 'rock' : (x === 75 && y === 55 ? 'water' : 'grass')
  ))),
  spawn: { x: 40, y: 41 },
  escapeZone: { x: 39, y: 17, w: 4, h: 5 },
  blobMasks: {}
};
const expanded = normalizeRuntimeMap(expandedPayload);
equal(expanded.width, 80, 'runtime loader should accept expanded width');
equal(expanded.height, 60, 'runtime loader should accept expanded height');
equal(expanded.tiles[55][75], 'water', 'runtime loader should preserve expanded outer terrain');
equal(expanded.blobMasks.water.some((entry) => entry.x === 75 && entry.y === 55), true, 'runtime loader should rebuild outer terrain masks');
const withoutBlobMasks = { ...expandedPayload };
delete withoutBlobMasks.blobMasks;
equal(normalizeRuntimeMap(withoutBlobMasks).blobMasks.water.some((entry) => entry.x === 75 && entry.y === 55), true, 'runtime loader should derive masks when bake omits the cache');

await assertRejects(
  () => loadRuntimeMapWithReceipt('/data/maps/axiom-first-escape.runtime-map.json', {
    fetchImpl: async () => ({ ok: false, status: 404 })
  }),
  /runtime_map_fetch_failed:404/,
  'missing canonical map should fail instead of falling back to the built-in demo'
);

function assertThrows(run, pattern, message) {
  let error = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  assert(error && pattern.test(String(error.message || error)), message);
}

async function assertRejects(run, pattern, message) {
  let error = null;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  assert(error && pattern.test(String(error.message || error)), message);
}
