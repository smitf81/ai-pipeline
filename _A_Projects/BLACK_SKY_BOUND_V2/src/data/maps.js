import { normalizeRuntimeMapPath } from '../world/runtimeMapLoader.js';

export const MAP_MANIFEST_CONTRACT = 'black-sky-bound.map-manifest.v0';
export const MAP_MANIFEST_PATH = '/data/maps/manifest.json';

export async function loadMapManifest(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const manifestPath = options.manifestPath ?? MAP_MANIFEST_PATH;
  if (typeof fetchImpl !== 'function') throw new Error('map_manifest_fetch_unavailable');
  const response = await fetchImpl(manifestPath, { cache: 'no-store' });
  if (!response?.ok) throw new Error(`map_manifest_fetch_failed:${response?.status ?? 'unknown'}`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('map_manifest_json_invalid');
  }
  return normalizeMapManifest(payload);
}

export function normalizeMapManifest(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('map_manifest_payload_invalid');
  }
  if (source.contract !== MAP_MANIFEST_CONTRACT) {
    throw new Error(`map_manifest_contract_invalid:${source.contract ?? 'missing'}`);
  }
  if (!Array.isArray(source.maps) || source.maps.length === 0) {
    throw new Error('map_manifest_maps_missing');
  }

  const seenIds = new Set();
  const seenPaths = new Set();
  const maps = source.maps.map((entry, index) => {
    const id = normalizeId(entry?.id, `maps:${index}.id`);
    const runtimePath = normalizeRuntimeMapPath(entry?.runtimePath, 'map_manifest_runtime_path_invalid');
    if (seenIds.has(id)) throw new Error(`map_manifest_map_id_duplicate:${id}`);
    if (seenPaths.has(runtimePath)) throw new Error(`map_manifest_runtime_path_duplicate:${runtimePath}`);
    seenIds.add(id);
    seenPaths.add(runtimePath);
    return {
      id,
      title: normalizeText(entry?.title, id),
      scenarioId: normalizeId(entry?.scenarioId, `maps:${index}.scenarioId`),
      runtimeMapId: normalizeId(entry?.runtimeMapId, `maps:${index}.runtimeMapId`),
      runtimePath,
      nextMapId: entry?.nextMapId == null ? null : normalizeId(entry.nextMapId, `maps:${index}.nextMapId`)
    };
  });

  const defaultMapId = normalizeId(source.defaultMapId, 'defaultMapId');
  if (!seenIds.has(defaultMapId)) throw new Error(`map_manifest_default_missing:${defaultMapId}`);
  for (const entry of maps) {
    if (entry.nextMapId && !seenIds.has(entry.nextMapId)) {
      throw new Error(`map_manifest_next_missing:${entry.id}:${entry.nextMapId}`);
    }
  }
  return Object.freeze({
    contract: MAP_MANIFEST_CONTRACT,
    defaultMapId,
    maps: Object.freeze(maps.map((entry) => Object.freeze(entry)))
  });
}

export function getDefaultMapPublication(manifest) {
  const normalized = normalizeMapManifest(manifest);
  return normalized.maps.find((entry) => entry.id === normalized.defaultMapId);
}

export function findMapPublicationByPath(manifest, runtimePath) {
  const normalized = normalizeMapManifest(manifest);
  const path = normalizeRuntimeMapPath(runtimePath);
  return normalized.maps.find((entry) => entry.runtimePath === path) ?? null;
}

function normalizeId(value, label) {
  const text = String(value ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) throw new Error(`map_manifest_id_invalid:${label}`);
  return text;
}

function normalizeText(value, fallback) {
  return String(value ?? '').trim() || String(fallback ?? '');
}
