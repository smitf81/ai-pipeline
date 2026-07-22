import { readFile } from 'node:fs/promises';
import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { Faction } from '../src/constants/factions.js';
import { MAP_MANIFEST_PATH } from '../src/data/maps.js';
import { getComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { findNearestHostileEntity } from '../src/systems/enemyPressureSystem.js';
import { loadRuntimeMapTransition, loadStandaloneRuntimeMap, logRuntimeMapLoad } from '../src/world/runtimeMapBootstrap.js';

const manifestText = await readFile(new URL('../data/maps/manifest.json', import.meta.url), 'utf8');
const mapText = await readFile(new URL('../data/maps/axiom-first-escape.runtime-map.json', import.meta.url), 'utf8');
const secondMapText = await readFile(new URL('../data/maps/axiom-second-approach.runtime-map.json', import.meta.url), 'utf8');
const requests = [];
const fetchImpl = async (path, options) => {
  requests.push({ path, cache: options?.cache });
  if (path === MAP_MANIFEST_PATH) return jsonResponse(manifestText);
  if (path === '/data/maps/axiom-first-escape.runtime-map.json') return textResponse(mapText);
  if (path === '/data/maps/axiom-second-approach.runtime-map.json') return textResponse(secondMapText);
  return { ok: false, status: 404 };
};

const standalone = await loadStandaloneRuntimeMap('', { fetchImpl, hashImpl: async () => 'standalone-hash' });
assert(standalone.ok, 'standalone default should load from the manifest');
equal(standalone.load.path, '/data/maps/axiom-first-escape.runtime-map.json', 'standalone should load the AXIOM bake path');
equal(standalone.load.mapId, 'axiom_first_escape', 'standalone should load the baked map id');
equal(standalone.load.width, standalone.map.width, 'standalone receipt should expose loaded width');
equal(standalone.load.height, standalone.map.height, 'standalone receipt should expose loaded height');
equal(standalone.load.selectionSource, 'manifest_default', 'standalone should identify manifest ownership');
equal(standalone.load.manifestPath, MAP_MANIFEST_PATH, 'standalone should expose its manifest path');
equal(standalone.load.hash, 'standalone-hash', 'standalone should expose the loaded content hash');
equal(standalone.load.fallbackUsed, false, 'standalone should report that no fallback was used');
equal(Object.isFrozen(standalone.map), true, 'standalone should activate immutable baked content');
equal(requests.length, 2, 'standalone should fetch exactly the manifest and selected runtime map');
assert(requests.every((request) => request.cache === 'no-store'), 'standalone publication fetches should bypass stale caches');
assert(
  standalone.map.unitPlacements.some((entry) => entry.type === EntityKind.RAIDER && entry.team === Faction.RAIDERS),
  'published runtime map should keep raiders on the raider faction'
);
assert(
  standalone.map.unitPlacements.some((entry) => entry.type === EntityKind.HUSK && entry.team === Faction.HUSKS),
  'published runtime map should keep husks on the husk faction'
);
const game = createInitialGameState(standalone.map);
const raiders = query(game.world, [ComponentType.EnemyPressureAI, ComponentType.Team, ComponentType.Kind])
  .filter((entity) => (
    getComponent(game.world, entity, ComponentType.Kind).type === EntityKind.RAIDER
    && getComponent(game.world, entity, ComponentType.Team).id === Faction.RAIDERS
  ));
assert(raiders.length > 0, 'published runtime map should spawn raider-faction AI actors');
const conflict = raiders
  .map((raider) => ({ raider, target: findNearestHostileEntity(game.world, raider, 14) }))
  .find(({ target }) => target && target !== game.dragonId);
assert(conflict, 'published runtime raiders should include an active hostile non-player conflict');
const raiderTarget = conflict.target;
equal(
  getComponent(game.world, raiderTarget, ComponentType.Team).id,
  Faction.HUSKS,
  'nearest published non-player conflict target should be a husk-faction actor'
);
const loadLogs = [];
logRuntimeMapLoad(standalone, { info: (message) => loadLogs.push(message), error: () => {} });
assert(loadLogs[0].includes(`dimensions=${standalone.map.width}x${standalone.map.height}`), 'runtime log should expose loaded dimensions');
assert(loadLogs[0].includes('fallbackUsed=false'), 'runtime log should expose fallback provenance');

const transition = await loadRuntimeMapTransition(standalone.map.transitions.escapeZone.nextMapPath, {
  fetchImpl,
  hashImpl: async () => 'transition-hash'
});
equal(transition.map.id, 'axiom_second_approach', 'escape transition should load the registered second runtime map');
equal(transition.load.path, '/data/maps/axiom-second-approach.runtime-map.json', 'transition receipt should expose the next map path');
equal(transition.load.selectionSource, 'escape_zone_transition', 'transition receipt should expose transition ownership');
equal(transition.load.catalogueMapId, 'ash_road_threshold', 'transition should resolve through the manifest catalogue entry');
equal(transition.load.hash, 'transition-hash', 'transition receipt should expose loaded content hash');

await assertRejects(
  () => loadRuntimeMapTransition('/data/maps/unregistered.runtime-map.json', { fetchImpl }),
  /runtime_map_transition_unregistered/,
  'escape transitions should not load maps outside the registered manifest catalogue'
);

const missingMap = await loadStandaloneRuntimeMap('', {
  fetchImpl: async (path) => path === MAP_MANIFEST_PATH ? jsonResponse(manifestText) : { ok: false, status: 404 }
});
equal(missingMap.ok, false, 'missing canonical runtime map should block standalone boot');
equal(missingMap.load.reason, 'runtime_map_fetch_failed:404', 'failure should expose the exact fetch reason');
equal(missingMap.load.width, null, 'failed load should not invent width');
equal(missingMap.load.height, null, 'failed load should not invent height');
equal(missingMap.load.path, '/data/maps/axiom-first-escape.runtime-map.json', 'failure should expose the failed map path');
equal(missingMap.load.fallbackUsed, false, 'failed canonical load should not silently activate built-in data');

function jsonResponse(text) {
  return { ok: true, json: async () => JSON.parse(text) };
}

function textResponse(text) {
  return { ok: true, text: async () => text };
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
