import { EntityKind } from '../constants/entityKinds.js';
import { Faction, isFaction } from '../constants/factions.js';
import { getDefaultActorFaction } from '../data/actors.js';
import { getScenario } from '../data/scenarios.js';
import { normalizeUnitSpawnerList } from '../game/unitSpawners.js';
import { buildAllBlobMasks } from './map.js';
import {
  RUNTIME_MAP_AUTHORING_FIELDS,
  RUNTIME_MAP_CONTRACT,
  RUNTIME_MAP_REQUIRED_FIELDS,
  REGION_ATMOSPHERE_CONTRACT
} from './runtimeMapContract.js';
import { createSceneObjects } from './sceneObjects.js';
import { TerrainType } from './terrain.js';
import { normalizeRuntimeTransitionSequences } from './transitionSequences.js';
import { normalizeDemoArenaDefinition } from '../game/arenaEncounter.js';
import { getCreatureRecipe, normalizeCreatureRecipeReference } from '../data/creatures/creatureRecipes.js';
import { FIRST_PLAYTHROUGH_REGION_CONTRACT, getInstinctDefinition } from '../data/instincts.js';

const TERRAIN_TYPES = new Set(Object.values(TerrainType));
const ENTITY_KINDS = new Set([EntityKind.RAIDER, EntityKind.HUSK, EntityKind.WEREWOLF]);
const RUNTIME_MAP_PATH = /^\/?data\/maps\/[a-z0-9][a-z0-9._-]*\.runtime-map\.json$/i;

export function resolveRuntimeMapRequest(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const requested = params.get('map');
  if (!requested) return null;
  return normalizeRuntimeMapPath(requested, 'runtime_map_request_invalid');
}

export async function loadRuntimeMap(requestPath, options = {}) {
  const result = await loadRuntimeMapWithReceipt(requestPath, options);
  return result.map;
}

export async function loadRuntimeMapWithReceipt(requestPath, options = {}) {
  const normalizedPath = normalizeRuntimeMapPath(requestPath);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('runtime_map_fetch_unavailable');
  const response = await fetchImpl(normalizedPath, { cache: 'no-store' });
  if (!response?.ok) throw new Error(`runtime_map_fetch_failed:${response?.status ?? 'unknown'}`);
  let rawContent = null;
  let payload;
  try {
    if (typeof response.text === 'function') {
      rawContent = await response.text();
      payload = JSON.parse(rawContent);
    } else {
      payload = await response.json();
      rawContent = JSON.stringify(payload);
    }
  } catch {
    throw new Error('runtime_map_json_invalid');
  }
  const map = normalizeRuntimeMap(payload);
  if (options.expectedMapId && map.id !== options.expectedMapId) {
    throw new Error(`runtime_map_id_mismatch:${options.expectedMapId}:${map.id}`);
  }
  if (options.expectedScenarioId && map.scenarioId !== options.expectedScenarioId) {
    throw new Error(`runtime_map_scenario_mismatch:${options.expectedScenarioId}:${map.scenarioId}`);
  }
  const hashImpl = options.hashImpl ?? sha256Hex;
  const hash = await hashImpl(rawContent);
  return Object.freeze({
    map,
    mapId: map.id,
    scenarioId: map.scenarioId,
    width: map.width,
    height: map.height,
    path: normalizedPath,
    hash,
    version: `${map.contract}:revision-${map.revision}`,
    revision: map.revision,
    fallbackUsed: false
  });
}

export function normalizeRuntimeMapPath(value, errorCode = 'runtime_map_path_invalid') {
  const normalized = String(value ?? '').trim().replace(/\\/g, '/');
  if (normalized.includes('..') || !RUNTIME_MAP_PATH.test(normalized)) {
    throw new Error(errorCode);
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function normalizeRuntimeMap(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('runtime_map_payload_invalid');
  }
  if (source.contract !== RUNTIME_MAP_CONTRACT) {
    throw new Error(`runtime_map_contract_invalid:${source.contract ?? 'missing'}`);
  }
  for (const field of RUNTIME_MAP_REQUIRED_FIELDS) {
    if (!Object.hasOwn(source, field)) throw new Error(`runtime_map_required_field_missing:${field}`);
  }
  for (const field of RUNTIME_MAP_AUTHORING_FIELDS) {
    if (Object.hasOwn(source, field)) throw new Error(`runtime_map_authoring_field_forbidden:${field}`);
  }

  const width = boundedInteger(source.width, 'width', 4, 256);
  const height = boundedInteger(source.height, 'height', 4, 256);
  const tiles = normalizeTiles(source.tiles, width, height);
  const scenarioId = normalizeId(source.scenarioId, 'scenarioId');
  getScenario(scenarioId);
  const unitPlacements = normalizeUnitPlacements(source.unitPlacements, width, height);
  const unitSpawners = normalizeUnitSpawnerList(source.unitSpawners).map((entry) => ({ ...entry }));
  const arena = normalizeDemoArenaDefinition(source.arena, unitSpawners);
  const transitions = normalizeRuntimeTransitions(source.transitions);
  const sceneSequences = normalizeRuntimeTransitionSequences(source.sceneSequences, {
    actorIds: unitPlacements.map((entry) => entry.id)
  });
  const departureSequenceId = transitions.escapeZone?.departureSequenceId;
  if (departureSequenceId && !sceneSequences.some((entry) => entry.id === departureSequenceId)) {
    throw new Error(`runtime_map_departure_sequence_missing:${departureSequenceId}`);
  }
  const firstPlaythrough = normalizeFirstPlaythrough(source.firstPlaythrough);
  const atmosphere = normalizeRegionAtmosphere(source.atmosphere);

  const map = {
    contract: RUNTIME_MAP_CONTRACT,
    id: normalizeId(source.id, 'id'),
    title: normalizeText(source.title, source.id),
    scenarioId,
    width,
    height,
    tiles,
    revision: boundedInteger(source.revision, 'revision', 0, Number.MAX_SAFE_INTEGER),
    spawn: normalizeSpawnPoint(source.spawn, width, height, 'spawn'),
    escapeZone: normalizeRect(source.escapeZone, width, height, 'escapeZone'),
    transitions,
    enemySpawns: normalizeUnitPlacements(source.enemySpawns, width, height, Faction.ENEMY),
    unitPlacements,
    unitSpawners,
    sceneObjects: createSceneObjects(normalizeSceneObjectInputs(source.sceneObjects)),
    sceneSequences,
    firstPlaythrough,
    atmosphere,
    ...(arena ? { arena } : {})
  };
  map.blobMasks = buildAllBlobMasks(map);
  return deepFreeze(map);
}

function normalizeFirstPlaythrough(source) {
  if (source == null) return { contract: FIRST_PLAYTHROUGH_REGION_CONTRACT, availableInstinctIds: [] };
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('runtime_map_first_playthrough_invalid');
  }
  if (!Array.isArray(source.availableInstinctIds)) {
    throw new Error('runtime_map_first_playthrough_instincts_invalid');
  }
  if (source.contract != null && source.contract !== FIRST_PLAYTHROUGH_REGION_CONTRACT) {
    throw new Error(`runtime_map_first_playthrough_contract_invalid:${source.contract}`);
  }
  const availableInstinctIds = [...new Set(source.availableInstinctIds.map((value) => String(value ?? '').trim()))];
  const unknown = availableInstinctIds.find((instinctId) => !getInstinctDefinition(instinctId));
  if (unknown) throw new Error(`runtime_map_first_playthrough_instinct_unknown:${unknown}`);
  return { contract: FIRST_PLAYTHROUGH_REGION_CONTRACT, availableInstinctIds };
}

function normalizeRegionAtmosphere(source) {
  if (source == null) {
    return { contract: REGION_ATMOSPHERE_CONTRACT, rainAndSparksEnabled: true };
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('runtime_map_region_atmosphere_invalid');
  }
  if (source.contract != null && source.contract !== REGION_ATMOSPHERE_CONTRACT) {
    throw new Error(`runtime_map_region_atmosphere_contract_invalid:${source.contract}`);
  }
  if (typeof source.rainAndSparksEnabled !== 'boolean') {
    throw new Error('runtime_map_region_atmosphere_enabled_invalid');
  }
  return { contract: REGION_ATMOSPHERE_CONTRACT, rainAndSparksEnabled: source.rainAndSparksEnabled };
}

function normalizeTiles(source, width, height) {
  if (!Array.isArray(source) || source.length !== height) throw new Error('runtime_map_tiles_height_invalid');
  return source.map((row, y) => {
    if (!Array.isArray(row) || row.length !== width) throw new Error(`runtime_map_tiles_width_invalid:${y}`);
    return row.map((type, x) => {
      if (!TERRAIN_TYPES.has(type)) throw new Error(`runtime_map_terrain_invalid:${x}:${y}:${type}`);
      return type;
    });
  });
}

function normalizeSceneObjectInputs(entries) {
  if (!Array.isArray(entries)) throw new Error('runtime_map_scene_objects_invalid');
  return entries.map((entry) => ({
    ...entry,
    x: entry?.tileX ?? entry?.x,
    y: entry?.tileY ?? entry?.y
  }));
}

function normalizeUnitPlacements(entries, width, height, compatibilityTeam = null) {
  if (entries == null) return [];
  if (!Array.isArray(entries)) throw new Error('runtime_map_unit_placements_invalid');
  return entries.map((entry, index) => {
    if (!ENTITY_KINDS.has(entry?.type)) throw new Error(`runtime_map_unit_type_invalid:${index}`);
    const team = isFaction(entry?.team)
      ? entry.team
      : compatibilityTeam ?? getDefaultActorFaction(entry.type);
    const point = normalizePoint(entry, width, height, `unit:${index}`);
    const creature = normalizeCreatureRecipeReference(entry.creature);
    if (creature && getCreatureRecipe(creature.recipeId).identity.actorKind !== entry.type) {
      throw new Error(`runtime_map_unit_creature_kind_mismatch:${index}:${creature.recipeId}:${entry.type}`);
    }
    return {
      id: normalizeText(entry.id, `unit_${index + 1}`),
      label: normalizeText(entry.label, entry.type),
      type: entry.type,
      team,
      x: point.x,
      y: point.y,
      ...(entry.audioEmitter ? { audioEmitter: normalizeAudioEmitterBlock(entry.audioEmitter, `unit:${index}`) } : {}),
      ...(creature ? { creature } : {})
    };
  });
}

function normalizeAudioEmitterBlock(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`runtime_map_audio_emitter_invalid:${label}`);
  if (Object.hasOwn(value, 'x') || Object.hasOwn(value, 'y') || Object.hasOwn(value, 'z') || Object.hasOwn(value, 'position')) {
    throw new Error(`runtime_map_audio_emitter_duplicate_position:${label}`);
  }
  const result = { ...value };
  for (const field of ['anchorHeightMeters', 'referenceDistanceMeters', 'maxDistanceMeters', 'rolloffFactor', 'coneInnerAngle', 'coneOuterAngle', 'coneOuterGain', 'dopplerScale', 'priority']) {
    if (result[field] == null) continue;
    const numeric = Number(result[field]);
    if (!Number.isFinite(numeric)) throw new Error(`runtime_map_audio_emitter_number_invalid:${label}:${field}`);
    result[field] = numeric;
  }
  return result;
}

function normalizeRuntimeTransitions(source) {
  if (source == null) return { escapeZone: null };
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('runtime_map_transitions_invalid');
  }
  const escapeZone = normalizeEscapeZoneTransition(source.escapeZone);
  return { escapeZone };
}

function normalizeEscapeZoneTransition(source) {
  if (source == null) return null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('runtime_map_escape_transition_invalid');
  }
  const mode = normalizeText(source.mode, 'load_next_map');
  if (mode !== 'load_next_map') throw new Error(`runtime_map_escape_transition_mode_invalid:${mode}`);
  return {
    mode,
    nextMapPath: normalizeRuntimeMapPath(source.nextMapPath, 'runtime_map_escape_transition_path_invalid'),
    nextMapId: source.nextMapId == null ? null : normalizeId(source.nextMapId, 'transitions.escapeZone.nextMapId'),
    departureSequenceId: source.departureSequenceId == null ? null : normalizeId(source.departureSequenceId, 'transitions.escapeZone.departureSequenceId'),
    arrivalSequenceId: source.arrivalSequenceId == null ? null : normalizeId(source.arrivalSequenceId, 'transitions.escapeZone.arrivalSequenceId'),
    label: normalizeText(source.label, 'Next region')
  };
}

function normalizePoint(value, width, height, label) {
  const x = boundedInteger(value?.x, `${label}.x`, 0, width - 1);
  const y = boundedInteger(value?.y, `${label}.y`, 0, height - 1);
  return { x, y };
}

function normalizeSpawnPoint(value, width, height, label) {
  const point = normalizePoint(value, width, height, label);
  const rotation = value?.rotation == null ? 0 : Number(value.rotation);
  if (!Number.isFinite(rotation)) throw new Error(`runtime_map_number_invalid:${label}.rotation`);
  return { ...point, rotation };
}

function normalizeRect(value, width, height, label) {
  const point = normalizePoint(value, width, height, label);
  const w = boundedInteger(value?.w, `${label}.w`, 1, width);
  const h = boundedInteger(value?.h, `${label}.h`, 1, height);
  if (point.x + w > width || point.y + h > height) throw new Error(`runtime_map_rect_out_of_bounds:${label}`);
  return { ...point, w, h };
}

function boundedInteger(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`runtime_map_integer_invalid:${label}`);
  }
  return number;
}

function normalizeId(value, label) {
  const text = String(value ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) throw new Error(`runtime_map_id_invalid:${label}`);
  return text;
}

function normalizeText(value, fallback) {
  return String(value ?? '').trim() || String(fallback ?? '');
}

async function sha256Hex(content) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(String(content ?? '')));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
