import {
  MAP_MANIFEST_PATH,
  findMapPublicationByPath,
  getDefaultMapPublication,
  loadMapManifest
} from '../data/maps.js';
import {
  loadRuntimeMapWithReceipt,
  resolveRuntimeMapRequest
} from './runtimeMapLoader.js';

export async function loadStandaloneRuntimeMap(search = '', options = {}) {
  let requestedPath = null;
  let selectedPublication = null;
  try {
    const manifest = await loadMapManifest({ fetchImpl: options.fetchImpl });
    const explicitRequest = resolveRuntimeMapRequest(search);
    selectedPublication = explicitRequest
      ? findMapPublicationByPath(manifest, explicitRequest)
      : getDefaultMapPublication(manifest);
    requestedPath = explicitRequest ?? selectedPublication.runtimePath;
    const receipt = await loadRuntimeMapWithReceipt(requestedPath, {
      fetchImpl: options.fetchImpl,
      hashImpl: options.hashImpl,
      expectedMapId: selectedPublication?.runtimeMapId,
      expectedScenarioId: selectedPublication?.scenarioId
    });
    return Object.freeze({
      ok: true,
      map: receipt.map,
      load: Object.freeze({
        mapId: receipt.mapId,
        scenarioId: receipt.scenarioId,
        width: receipt.width,
        height: receipt.height,
        path: receipt.path,
        hash: receipt.hash,
        version: receipt.version,
        revision: receipt.revision,
        fallbackUsed: false,
        selectionSource: explicitRequest ? 'query_override' : 'manifest_default',
        manifestPath: MAP_MANIFEST_PATH,
        catalogueMapId: selectedPublication?.id ?? null,
        transition: null
      })
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      map: null,
      load: Object.freeze({
        reason: String(error?.message || error),
        source: 'runtime_map_loader',
        mapId: selectedPublication?.runtimeMapId ?? null,
        width: null,
        height: null,
        path: requestedPath ?? MAP_MANIFEST_PATH,
        hash: null,
        version: null,
        fallbackUsed: false,
        transition: null
      })
    });
  }
}

export async function loadRuntimeMapTransition(nextMapPath, options = {}) {
  const manifest = await loadMapManifest({ fetchImpl: options.fetchImpl });
  const selectedPublication = findMapPublicationByPath(manifest, nextMapPath);
  if (!selectedPublication) throw new Error(`runtime_map_transition_unregistered:${nextMapPath}`);
  const receipt = await loadRuntimeMapWithReceipt(selectedPublication.runtimePath, {
    fetchImpl: options.fetchImpl,
    hashImpl: options.hashImpl,
    expectedMapId: selectedPublication.runtimeMapId,
    expectedScenarioId: selectedPublication.scenarioId
  });
  return Object.freeze({
    map: receipt.map,
    load: Object.freeze({
      mapId: receipt.mapId,
      scenarioId: receipt.scenarioId,
      width: receipt.width,
      height: receipt.height,
      path: receipt.path,
      hash: receipt.hash,
      version: receipt.version,
      revision: receipt.revision,
      fallbackUsed: false,
      selectionSource: 'escape_zone_transition',
      manifestPath: MAP_MANIFEST_PATH,
      catalogueMapId: selectedPublication.id
    })
  });
}

export function createProgrammaticRuntimeMapLoad(map, source = 'built_in_demo') {
  return Object.freeze({
    mapId: map.id,
    scenarioId: map.scenarioId,
    width: map.width,
    height: map.height,
    path: source,
    hash: null,
    version: `${map.contract}:revision-${map.revision ?? 0}`,
    revision: map.revision ?? 0,
    fallbackUsed: false,
    selectionSource: 'programmatic_default',
    manifestPath: null,
    catalogueMapId: null,
    transition: null
  });
}

export function logRuntimeMapLoad(result, logger = console) {
  const receipt = result.load;
  if (result.ok) {
    logger.info(
      `[BSB map] loaded id=${receipt.mapId} dimensions=${receipt.width}x${receipt.height} path=${receipt.path} `
      + `hash=${receipt.hash ?? 'unavailable'} version=${receipt.version} `
      + `fallbackUsed=${receipt.fallbackUsed}`
    );
    return;
  }
  logger.error(
    `[BSB map] load failed id=${receipt.mapId ?? 'unknown'} path=${receipt.path} `
    + `fallbackUsed=${receipt.fallbackUsed} reason=${receipt.reason}`
  );
}
