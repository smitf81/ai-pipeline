import { readFile } from 'node:fs/promises';
import { assert, equal } from './assert.mjs';
import {
  MAP_MANIFEST_CONTRACT,
  MAP_MANIFEST_PATH,
  findMapPublicationByPath,
  getDefaultMapPublication,
  loadMapManifest,
  normalizeMapManifest
} from '../src/data/maps.js';

const source = JSON.parse(await readFile(new URL('../data/maps/manifest.json', import.meta.url), 'utf8'));
const manifest = normalizeMapManifest(source);
const firstEscape = getDefaultMapPublication(manifest);

equal(manifest.contract, MAP_MANIFEST_CONTRACT, 'map manifest should preserve its contract');
equal(MAP_MANIFEST_PATH, '/data/maps/manifest.json', 'runtime should use one explicit manifest URL');
equal(manifest.defaultMapId, 'first_flightless_night', 'First Flightless Night should be the standalone default');
equal(manifest.maps.length, 3, 'map manifest should register two campaign regions and the isolated demo arena');
equal(firstEscape.scenarioId, 'first_escape', 'default map should own the First Escape scenario');
equal(firstEscape.runtimeMapId, 'axiom_first_escape', 'manifest should bind the AXIOM runtime-map id');
equal(firstEscape.runtimePath, '/data/maps/axiom-first-escape.runtime-map.json', 'manifest should own the AXIOM bake path');
equal(firstEscape.nextMapId, 'ash_road_threshold', 'opening map should declare the next catalogue region');
const secondRegion = manifest.maps.find((entry) => entry.id === 'ash_road_threshold');
equal(secondRegion.runtimeMapId, 'axiom_second_approach', 'second region should bind its own runtime map id');
equal(secondRegion.runtimePath, '/data/maps/axiom-second-approach.runtime-map.json', 'second region should own a separate bake path');
const demoArena = manifest.maps.find((entry) => entry.id === 'crown_of_cinders_demo');
equal(demoArena.scenarioId, 'demo_arena', 'demo publication should own the arena scenario');
equal(demoArena.runtimePath, '/data/maps/axiom-crown-of-cinders.runtime-map.json', 'demo publication should bind the Axiom arena bake');
equal(findMapPublicationByPath(manifest, firstEscape.runtimePath)?.id, firstEscape.id, 'path lookup should return the registered publication');
equal(findMapPublicationByPath(manifest, '/data/maps/unregistered.runtime-map.json'), null, 'unregistered imports should not invent catalogue entries');

const fetched = await loadMapManifest({
  fetchImpl: async (path, options) => {
    equal(path, MAP_MANIFEST_PATH, 'manifest loader should fetch the canonical path');
    equal(options.cache, 'no-store', 'manifest loader should not accept a stale browser cache');
    return { ok: true, json: async () => source };
  }
});
equal(getDefaultMapPublication(fetched).runtimePath, firstEscape.runtimePath, 'fetched manifest should preserve the default path');

assertThrows(
  () => normalizeMapManifest({ ...source, defaultMapId: 'missing' }),
  /map_manifest_default_missing:missing/,
  'manifest should fail loudly when the default is not registered'
);
assertThrows(
  () => normalizeMapManifest({ ...source, maps: [{ ...source.maps[0], runtimePath: '../../outside.json' }] }),
  /map_manifest_runtime_path_invalid/,
  'manifest should reject paths outside the bounded runtime-map root'
);
assertThrows(
  () => normalizeMapManifest({ ...source, maps: [{ ...source.maps[0], nextMapId: 'missing' }, source.maps[1]] }),
  /map_manifest_next_missing:first_flightless_night:missing/,
  'manifest should reject next-map links that do not point at a registered region'
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
