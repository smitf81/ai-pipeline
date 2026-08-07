import {
  BSB_V2_MAP_RESIZE_CONTRACT,
  BSB_V2_MAP_SIZE_LIMITS,
  resizeBsbV2AuthoringDocument
} from './bsb-v2-map-resize.js';
import {
  createBsbV2MapViewport,
  panBsbV2MapViewport,
  resolveBsbV2MapCanvasLayout,
  zoomBsbV2MapViewport
} from './bsb-v2-map-viewport.js';
import {
  BSB_V2_TREE_DNA_CONTRACT,
  BSB_V2_TREE_OPERATION_CONTRACT,
  BSB_V2_TREE_SEASONS,
  BSB_V2_TREE_SPECIES_OPTIONS,
  applyBsbV2TreeOperation as applyBsbV2TreeRecordOperation,
  createBsbV2TreeDefinition,
  isBsbV2TreeRecord,
  normalizeBsbV2TreeRecord,
  treeDefinitionSummary
} from './bsb-v2-tree-authoring.js';
import {
  BSB_V2_UNDERGROWTH_DNA_CONTRACT,
  BSB_V2_UNDERGROWTH_OPERATION_CONTRACT,
  BSB_V2_UNDERGROWTH_SEASONS,
  BSB_V2_UNDERGROWTH_SPECIES_OPTIONS,
  BSB_V2_UNDERGROWTH_SPECIES_RECIPES,
  applyBsbV2UndergrowthOperation as applyBsbV2UndergrowthRecordOperation,
  createBsbV2UndergrowthDefinition,
  isBsbV2UndergrowthRecord,
  normalizeBsbV2UndergrowthRecord,
  undergrowthDefinitionSummary
} from './bsb-v2-undergrowth-authoring.js';
import {
  BSB_V2_UNDERGROWTH_BRUSH_CONFIG_CONTRACT,
  BSB_V2_UNDERGROWTH_BRUSH_PREVIEW_CONTRACT,
  BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT,
  BSB_V2_UNDERGROWTH_BRUSH_SPECIES,
  applyBsbV2UndergrowthBrushPreview,
  createBsbV2UndergrowthBrushPreview,
  normalizeBsbV2UndergrowthBrushConfig,
  undoBsbV2UndergrowthBrush
} from './bsb-v2-undergrowth-brush.js';
import {
  BSB_V2_GEOLOGY_DNA_CONTRACT,
  BSB_V2_GEOLOGY_OPERATION_CONTRACT,
  BSB_V2_GEOLOGY_RECIPE_OPTIONS,
  applyBsbV2GeologyOperation as applyBsbV2GeologyRecordOperation,
  createBsbV2GeologyDefinition,
  geologyDefinitionSummary,
  isBsbV2GeologyRecord,
  normalizeBsbV2GeologyRecord
} from './bsb-v2-geology-authoring.js';
import {
  BSB_V2_TRANSITION_SEQUENCE_CONTRACT,
  BSB_V2_TRANSITION_SEQUENCE_OPERATION_CONTRACT,
  SMOKE_INSTINCT_DEPARTURE_ID,
  applyBsbV2TransitionSequenceOperation as applyBsbV2TransitionSequenceRecordOperation,
  normalizeBsbV2TransitionSequences,
  normalizeBsbV2TransitionSequenceIntentProposal,
  parseBsbV2TransitionSequenceCommand
} from './bsb-v2-scene-sequence-authoring.js';

export const BSB_V2_AUTHORING_CONTRACT = 'axiom.bsb-map-authoring.v0';
export const BSB_V2_RUNTIME_MAP_CONTRACT = 'black-sky-bound.runtime-map.v0';
export const BSB_V2_DEFAULT_AUTHORING_PATH = 'data/bsb-v2/maps/first_escape.authoring.json';
export const BSB_V2_AUTHORING_PATH = BSB_V2_DEFAULT_AUTHORING_PATH;
export const BSB_V2_MAP_MANIFEST_CONTRACT = 'black-sky-bound.map-manifest.v0';
export const BSB_V2_MAP_MANIFEST_PATH = 'data/maps/manifest.json';
export const AXIOM_WORKSPACE_CONTEXT_CONTRACT = 'axiom.workspace-context.v0';
export const BSB_V2_PROJECT_WORKSPACE_CONTRACT = 'axiom.project-workspace.v0';
export const BSB_V2_AUTHORING_SURFACE_ID = 'bsb-v2-map-authoring';
export const BSB_V2_DEMO_ARENA_CONTRACT = 'black-sky-bound.demo-arena.v1';

const DEMO_ARENA_ABILITIES = new Set([
  'move', 'bite_claw', 'body_lunge', 'smoke_burst',
  'smoke_spit', 'dodge', 'charge_counter', 'dragonfire'
]);

export function resolveBsbV2WorkspaceBinding(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('bsb_workspace_context_missing');
  if (context.schema !== AXIOM_WORKSPACE_CONTEXT_CONTRACT) throw new Error(`bsb_workspace_context_contract_invalid:${context.schema ?? 'missing'}`);
  if (context.status === 'failed') throw new Error(`bsb_workspace_context_failed:${context.errors?.join(',') || 'unknown'}`);
  const project = context.project;
  const workspace = project?.workspace;
  if (!project?.id) throw new Error('bsb_workspace_active_project_missing');
  if (!workspace || workspace.contract !== BSB_V2_PROJECT_WORKSPACE_CONTRACT) {
    throw new Error(`bsb_project_workspace_contract_invalid:${workspace?.contract ?? 'missing'}`);
  }
  if (workspace.surfaceId !== BSB_V2_AUTHORING_SURFACE_ID) {
    throw new Error(`bsb_project_workspace_surface_invalid:${workspace.surfaceId ?? 'missing'}`);
  }
  const authoringProjectId = String(workspace.authoring?.projectId || '').trim();
  const runtimeProjectId = String(workspace.runtimeBake?.projectId || '').trim();
  const mapManifestPath = String(workspace.scene?.manifestPath || '').trim().replace(/\\/g, '/');
  if (!authoringProjectId) throw new Error('bsb_workspace_authoring_project_missing');
  if (!runtimeProjectId) throw new Error('bsb_workspace_runtime_project_missing');
  if (project.id !== runtimeProjectId) throw new Error(`bsb_workspace_runtime_owner_mismatch:${project.id}:${runtimeProjectId}`);
  if (mapManifestPath !== BSB_V2_MAP_MANIFEST_PATH) throw new Error(`bsb_workspace_map_manifest_mismatch:${mapManifestPath || 'missing'}`);
  if (workspace.runtimeBake?.explicit !== true) throw new Error('bsb_workspace_explicit_bake_required');
  return Object.freeze({
    contract: BSB_V2_PROJECT_WORKSPACE_CONTRACT,
    surfaceId: BSB_V2_AUTHORING_SURFACE_ID,
    project: Object.freeze({ id: project.id, name: project.name || project.id, root: project.root || null }),
    scene: Object.freeze({ kind: workspace.scene?.kind || 'map', manifestPath: mapManifestPath }),
    authoring: Object.freeze({ ...workspace.authoring, projectId: authoringProjectId }),
    runtimeBake: Object.freeze({ ...workspace.runtimeBake, projectId: runtimeProjectId, explicit: true })
  });
}

export function classifyBsbV2RuntimeFreshness({ dirty = false, saveReceipt = null, bakeReceipt = null, runtimeVerification = null, status = 'idle' } = {}) {
  if (dirty || status === 'new draft') return 'stale';
  if (bakeReceipt) return 'current';
  if (['current', 'stale', 'failed'].includes(runtimeVerification?.status)) return runtimeVerification.status;
  if (saveReceipt) return 'stale';
  return 'unverified';
}

export function inspectBsbV2RuntimeBake(authoringDocument, runtimeMap, publication) {
  const authoring = validateBsbV2AuthoringDocument(authoringDocument);
  const mismatches = [];
  if (!runtimeMap || typeof runtimeMap !== 'object' || Array.isArray(runtimeMap)) {
    return Object.freeze({ status: 'failed', errors: ['runtime_map_payload_invalid'], mismatches: [] });
  }
  if (runtimeMap.contract !== BSB_V2_RUNTIME_MAP_CONTRACT) mismatches.push(`contract:${runtimeMap.contract ?? 'missing'}`);
  if (runtimeMap.id !== authoring.mapId) mismatches.push(`mapId:${runtimeMap.id ?? 'missing'}:${authoring.mapId}`);
  if (runtimeMap.scenarioId !== authoring.scenarioId) mismatches.push(`scenarioId:${runtimeMap.scenarioId ?? 'missing'}:${authoring.scenarioId}`);
  if (Number(runtimeMap.revision) !== authoring.revision) mismatches.push(`revision:${runtimeMap.revision ?? 'missing'}:${authoring.revision}`);
  if (Number(runtimeMap.width) !== authoring.width || Number(runtimeMap.height) !== authoring.height) mismatches.push(`dimensions:${runtimeMap.width ?? 'missing'}x${runtimeMap.height ?? 'missing'}:${authoring.width}x${authoring.height}`);
  if (JSON.stringify(runtimeMap.spawn) !== JSON.stringify(authoring.spawn)) mismatches.push('player_spawn_mismatch');
  if (publication?.runtimeMapId && runtimeMap.id !== publication.runtimeMapId) mismatches.push(`publication_mapId:${runtimeMap.id ?? 'missing'}:${publication.runtimeMapId}`);
  return Object.freeze({
    status: mismatches.length ? 'stale' : 'current',
    errors: [],
    mismatches: Object.freeze(mismatches),
    revision: Number.isInteger(Number(runtimeMap.revision)) ? Number(runtimeMap.revision) : null,
    mapId: runtimeMap.id || null,
    spawnMatches: !mismatches.includes('player_spawn_mismatch')
  });
}

const TERRAIN = Object.freeze({
  grass: { label: 'Grass', color: '#314d2f' },
  forest: { label: 'Forest', color: '#162f21' },
  dirt: { label: 'Dirt', color: '#5b4732' },
  water: { label: 'Water', color: '#244c66' },
  rock: { label: 'Rock', color: '#565a60' },
  scorched: { label: 'Scorched', color: '#1d1b18' }
});

const SCENE_OBJECTS = Object.freeze([
  ['tree', 'Tree'], ['birch_tree', 'Birch'], ['dead_snag', 'Dead snag'], ['boulder', 'Boulder'],
  ['fern_patch', 'Fern'], ['forest_shrub', 'Shrub'], ['leaf_litter', 'Leaf litter'], ['root_decal', 'Roots'],
  ['fire_arrow_cluster', 'Fire arrows'], ['smouldering_fern', 'Smouldering fern'], ['smouldering_bramble', 'Smouldering bramble']
]);
const UNIT_TYPES = Object.freeze([['raider', 'Raider'], ['husk', 'Husk'], ['werewolf', 'Werewolf']]);
const UNIT_DEFAULT_TEAMS = Object.freeze({
  raider: 'raiders',
  husk: 'husks',
  werewolf: 'wolves'
});
const AUTHORING_UNIT_TEAMS = Object.freeze(['raiders', 'husks', 'wolves', 'player', 'allies', 'neutral']);
const RECORD_COLLECTIONS = Object.freeze({
  sceneObject: Object.freeze({ field: 'sceneObjects', allowedTypes: new Set(SCENE_OBJECTS.map(([id]) => id)), withTeam: false }),
  unit: Object.freeze({ field: 'unitPlacements', allowedTypes: new Set(UNIT_TYPES.map(([id]) => id)), withTeam: true }),
  spawner: Object.freeze({ field: 'unitSpawners', allowedTypes: new Set(UNIT_TYPES.map(([id]) => id)), withTeam: true })
});
const SPAWNER_NUMBER_FIELDS = Object.freeze({
  intervalSeconds: Object.freeze({ min: 0.1, max: 120, fallback: 4, decimals: 3 }),
  initialDelaySeconds: Object.freeze({ min: 0, max: 120, fallback: 0.2, decimals: 3 }),
  burstCount: Object.freeze({ min: 1, max: 24, fallback: 1, integer: true }),
  maxAlive: Object.freeze({ min: 1, max: 96, fallback: 3, integer: true }),
  limit: Object.freeze({ min: 0, max: 999, fallback: 0, integer: true }),
  spawnRadiusTiles: Object.freeze({ min: 0, max: 12, fallback: 0.6, decimals: 3 }),
  hitPoints: Object.freeze({ min: 1, max: 999, fallback: 36, integer: true }),
  fixtureRadiusTiles: Object.freeze({ min: 0.15, max: 3, fallback: 0.48, decimals: 3 })
});
const SCENE_OBJECT_NUMBER_FIELDS = Object.freeze({
  visualWidthTiles: Object.freeze({ min: 0.1, max: 12, fallback: null, decimals: 3 }),
  visualHeightTiles: Object.freeze({ min: 0.1, max: 12, fallback: null, decimals: 3 }),
  visualOffsetX: Object.freeze({ min: -6, max: 6, fallback: 0, decimals: 3 }),
  visualOffsetY: Object.freeze({ min: -6, max: 6, fallback: 0, decimals: 3 })
});
const AUDIO_EMITTER_NUMBER_FIELDS = Object.freeze({
  anchorHeightMeters: Object.freeze({ min: 0, max: 30, decimals: 3 }),
  referenceDistanceMeters: Object.freeze({ min: 0.1, max: 160, decimals: 3 }),
  maxDistanceMeters: Object.freeze({ min: 1, max: 500, decimals: 3 }),
  rolloffFactor: Object.freeze({ min: 0, max: 8, decimals: 3 }),
  coneInnerAngle: Object.freeze({ min: 0, max: 360, decimals: 2 }),
  coneOuterAngle: Object.freeze({ min: 0, max: 360, decimals: 2 }),
  coneOuterGain: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  dopplerScale: Object.freeze({ min: 0, max: 1, decimals: 3 }),
  priority: Object.freeze({ min: 0, max: 255, integer: true })
});
const AUDIO_EMITTER_PROFILE_OPTIONS = Object.freeze([
  ['creature_voice_spatial_v1', 'Creature voice'],
  ['creature_impact_spatial_v1', 'Creature impact'],
  ['smoulder_fire_spatial_v1', 'Smoulder / fire'],
  ['mama_voice_spatial_v1', 'Mama voice'],
  ['storm_spatial_v1', 'Storm']
]);

export const BSB_V2_AUTHORING_TOOLS = Object.freeze([
  ...Object.entries(TERRAIN).map(([id, value]) => Object.freeze({ id: `terrain:${id}`, kind: 'terrain', value: id, label: value.label, color: value.color })),
  ...SCENE_OBJECTS.map(([id, label]) => Object.freeze({ id: `object:${id}`, kind: 'sceneObject', value: id, label })),
  ...UNIT_TYPES.map(([id, label]) => Object.freeze({ id: `unit:${id}`, kind: 'unit', value: id, label })),
  ...UNIT_TYPES.map(([id, label]) => Object.freeze({ id: `spawner:${id}`, kind: 'spawner', value: id, label: `${label} spawner` })),
  Object.freeze({ id: 'marker:player', kind: 'playerSpawn', value: 'player', label: 'Player spawn' }),
  Object.freeze({ id: 'marker:escape', kind: 'escapeZone', value: 'escape', label: 'Escape zone' }),
  Object.freeze({ id: 'erase', kind: 'erase', value: 'erase', label: 'Erase' })
]);

export function resolveBsbV2MapPublication(source, authoringDocument = null) {
  const library = resolveBsbV2MapLibrary(source);
  const document = authoringDocument ? validateBsbV2AuthoringDocument(authoringDocument) : null;
  const entry = document
    ? library.maps.find((candidate) => (
      candidate.runtimeMapId === document.mapId
      && candidate.scenarioId === document.scenarioId
    ))
    : library.maps.find((candidate) => candidate.id === library.defaultMapId);
  if (!entry) {
    throw new Error(document
      ? `bsb_map_publication_missing:${document.mapId}:${document.scenarioId}`
      : `bsb_map_manifest_default_missing:${library.defaultMapId ?? 'missing'}`);
  }
  return Object.freeze({
    manifestContract: BSB_V2_MAP_MANIFEST_CONTRACT,
    manifestPath: BSB_V2_MAP_MANIFEST_PATH,
    catalogueMapId: entry.id,
    title: entry.title,
    scenarioId: entry.scenarioId,
    runtimeMapId: entry.runtimeMapId,
    runtimePath: entry.runtimePath,
    writePath: entry.runtimePath.slice(1),
    authoringPath: entry.authoringPath,
    nextMapId: entry.nextMapId
  });
}

export function resolveBsbV2MapLibrary(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('bsb_map_manifest_payload_invalid');
  }
  if (source.contract !== BSB_V2_MAP_MANIFEST_CONTRACT) {
    throw new Error(`bsb_map_manifest_contract_invalid:${source.contract ?? 'missing'}`);
  }
  if (!Array.isArray(source.maps) || source.maps.length === 0) {
    throw new Error('bsb_map_manifest_maps_missing');
  }

  const seenIds = new Set();
  const maps = source.maps.map((entry, index) => {
    const id = identifier(entry?.id, `maps:${index}.id`);
    if (seenIds.has(id)) throw new Error(`bsb_map_manifest_map_id_duplicate:${id}`);
    seenIds.add(id);
    const runtimeMapId = identifier(entry?.runtimeMapId, `maps:${index}.runtimeMapId`);
    return {
      id,
      title: text(entry?.title, id),
      scenarioId: identifier(entry?.scenarioId, `maps:${index}.scenarioId`),
      runtimeMapId,
      runtimePath: normalizeBsbV2RuntimeMapPath(entry?.runtimePath),
      authoringPath: normalizeBsbV2AuthoringPath(entry?.authoringPath ?? defaultAuthoringPathForMap(id, runtimeMapId)),
      nextMapId: entry?.nextMapId == null ? null : identifier(entry.nextMapId, `maps:${index}.nextMapId`)
    };
  });
  const defaultMapId = identifier(source.defaultMapId, 'defaultMapId');
  if (!seenIds.has(defaultMapId)) throw new Error(`bsb_map_manifest_default_missing:${defaultMapId}`);
  for (const entry of maps) {
    if (entry.nextMapId && !seenIds.has(entry.nextMapId)) {
      throw new Error(`bsb_map_manifest_next_missing:${entry.id}:${entry.nextMapId}`);
    }
  }
  return Object.freeze({
    contract: BSB_V2_MAP_MANIFEST_CONTRACT,
    defaultMapId,
    maps: Object.freeze(maps.map((entry) => Object.freeze(entry)))
  });
}

const TOOL_BY_ID = new Map(BSB_V2_AUTHORING_TOOLS.map((tool) => [tool.id, tool]));
const UNDERGROWTH_BRUSH_TOOL_SETTINGS = Object.freeze({
  fern_patch: Object.freeze({ species: 'wood_fern', woodFernType: 'fern_patch' }),
  forest_shrub: Object.freeze({ species: 'forest_shrub', woodFernType: 'fern_patch' }),
  smouldering_fern: Object.freeze({ species: 'wood_fern', woodFernType: 'smouldering_fern' }),
  smouldering_bramble: Object.freeze({ species: 'ember_bramble', woodFernType: 'fern_patch' })
});
const SCENE_RECORD_VISUALS = Object.freeze({
  tree: Object.freeze({ glyph: 'T', color: '#5fa36b', shape: 'tree' }),
  birch_tree: Object.freeze({ glyph: 'T', color: '#b9d7c1', shape: 'tree' }),
  dead_snag: Object.freeze({ glyph: 'Y', color: '#9b7955', shape: 'snag' }),
  boulder: Object.freeze({ glyph: '◆', color: '#aab1b8', shape: 'diamond' }),
  fern_patch: Object.freeze({ glyph: '✣', color: '#72bd78', shape: 'foliage' }),
  forest_shrub: Object.freeze({ glyph: '●', color: '#4f8f59', shape: 'foliage' }),
  leaf_litter: Object.freeze({ glyph: '·', color: '#a17a50', shape: 'dot' }),
  root_decal: Object.freeze({ glyph: '≈', color: '#a5835f', shape: 'roots' }),
  fire_arrow_cluster: Object.freeze({ glyph: '↑', color: '#ffb04a', shape: 'flame' }),
  smouldering_fern: Object.freeze({ glyph: '✦', color: '#ff8068', shape: 'flame' }),
  smouldering_bramble: Object.freeze({ glyph: '×', color: '#ef655d', shape: 'bramble' })
});
const UNIT_RECORD_VISUALS = Object.freeze({
  raider: Object.freeze({ glyph: 'R', color: '#ff7f7f', shape: 'unit' }),
  husk: Object.freeze({ glyph: 'H', color: '#d7c6a2', shape: 'unit' }),
  werewolf: Object.freeze({ glyph: 'W', color: '#c89cff', shape: 'unit' })
});

export function describeBsbV2AuthoringRecord(kind, record = {}) {
  const type = String(record?.type || '').trim();
  if (kind === 'sceneObject') {
    return Object.freeze({
      kind,
      type,
      ...(SCENE_RECORD_VISUALS[type] || { glyph: '◇', color: '#ffd27a', shape: 'diamond' })
    });
  }
  const unitVisual = UNIT_RECORD_VISUALS[type] || { glyph: '?', color: '#ff8f8f', shape: 'unit' };
  if (kind === 'spawner') {
    return Object.freeze({ kind, type, glyph: `${unitVisual.glyph}+`, color: unitVisual.color, shape: 'spawner' });
  }
  return Object.freeze({ kind, type, ...unitVisual });
}

export function filterBsbV2AuthoringRecords(records, options = {}) {
  const source = Array.isArray(records) ? records : [];
  const query = String(options.query || '').trim().toLowerCase();
  const kind = ['all', 'sceneObject', 'unit', 'spawner'].includes(options.kind) ? options.kind : 'all';
  return source.filter((entry) => {
    if (kind !== 'all' && entry?.kind !== kind) return false;
    if (!query) return true;
    const haystack = [
      entry?.kind,
      entry?.type,
      entry?.label,
      entry?.id,
      entry?.team,
      entry?.tree?.species,
      entry?.undergrowth?.species,
      `${entry?.x ?? ''},${entry?.y ?? ''}`
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function createDefaultBsbV2AuthoringDocument() {
  const width = 42;
  const height = 30;
  const tiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (
    x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'rock' : 'grass'
  )));
  paintTiles(tiles, width, height, 14, 8, 5, 'forest');
  paintTiles(tiles, width, height, 27, 20, 6, 'forest');
  paintTiles(tiles, width, height, 20, 15, 3, 'dirt');
  for (let x = 28; x <= 34; x += 1) tiles[13][x] = 'water';
  return {
    contract: BSB_V2_AUTHORING_CONTRACT,
    mapId: 'axiom_first_escape',
    title: 'AXIOM First Escape',
    scenarioId: 'first_escape',
    revision: 0,
    width,
    height,
    tiles,
    spawn: { x: 6, y: 15 },
    escapeZone: { x: 36, y: 6, w: 4, h: 5 },
    transitions: {
      escapeZone: {
        mode: 'load_next_map',
        nextMapId: 'axiom_second_approach',
        nextMapPath: '/data/maps/axiom-second-approach.runtime-map.json',
        arrivalSequenceId: 'smoke_instinct_awakening',
        label: 'Ash Road Threshold'
      }
    },
    sceneSequences: [],
    sceneObjects: [
      { id: 'boulder:start-route', type: 'boulder', x: 8, y: 15 },
      normalizeBsbV2UndergrowthRecord({ id: 'fern:start-route-left', type: 'fern_patch', x: 7, y: 17 }),
      { id: 'fire-arrow:start-left', type: 'fire_arrow_cluster', x: 6, y: 12 }
    ],
    unitPlacements: [
      { id: 'raider:1', type: 'raider', team: defaultTeamForUnit('raider'), x: 14, y: 13 },
      { id: 'raider:2', type: 'raider', team: defaultTeamForUnit('raider'), x: 17, y: 17 },
      { id: 'husk:1', type: 'husk', team: defaultTeamForUnit('husk'), x: 22, y: 11 },
      { id: 'husk:2', type: 'husk', team: defaultTeamForUnit('husk'), x: 25, y: 20 },
      { id: 'werewolf:1', type: 'werewolf', team: defaultTeamForUnit('werewolf'), x: 31, y: 9 }
    ],
    unitSpawners: [],
    lastResize: null,
    provenance: {
      canonicalOwner: 'AXIOM',
      purpose: 'editable_source_for_bsb_runtime_map_bake',
      runtimeAuthority: false
    },
    updatedAt: null
  };
}

export function createSecondApproachBsbV2AuthoringDocument() {
  const width = 52;
  const height = 34;
  const tiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (
    x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'rock' : 'grass'
  )));
  paintTiles(tiles, width, height, 11, 17, 4, 'scorched');
  paintTiles(tiles, width, height, 27, 12, 7, 'forest');
  paintTiles(tiles, width, height, 37, 24, 5, 'dirt');
  for (let y = 9; y <= 24; y += 1) tiles[y][25] = 'water';
  return {
    contract: BSB_V2_AUTHORING_CONTRACT,
    mapId: 'axiom_second_approach',
    title: 'Ash Road Threshold',
    scenarioId: 'first_escape',
    revision: 0,
    width,
    height,
    tiles,
    spawn: { x: 24, y: 31, rotation: -Math.PI / 2 },
    escapeZone: { x: 46, y: 11, w: 4, h: 5 },
    transitions: { escapeZone: null },
    sceneSequences: [],
    sceneObjects: [
      { id: 'snag:arrival-ash-road', type: 'dead_snag', x: 9, y: 15 },
      { id: 'boulder:ash-road-left', type: 'boulder', x: 12, y: 19 },
      normalizeBsbV2TreeRecord({ id: 'tree:threshold-cover', type: 'tree', x: 28, y: 13 }),
      { id: 'shrub:threshold-bank', type: 'forest_shrub', x: 24, y: 20 },
      { id: 'fire-arrow:far-warning', type: 'fire_arrow_cluster', x: 41, y: 13 }
    ],
    unitPlacements: [
      { id: 'husk:threshold-1', type: 'husk', team: defaultTeamForUnit('husk'), x: 18, y: 15 },
      { id: 'raider:threshold-1', type: 'raider', team: defaultTeamForUnit('raider'), x: 34, y: 12 },
      { id: 'werewolf:threshold-1', type: 'werewolf', team: defaultTeamForUnit('werewolf'), x: 39, y: 22 }
    ],
    unitSpawners: [],
    lastResize: null,
    provenance: {
      canonicalOwner: 'AXIOM',
      purpose: 'editable_source_for_bsb_runtime_map_bake',
      runtimeAuthority: false
    },
    updatedAt: null
  };
}

export function createCrownOfCindersBsbV2AuthoringDocument() {
  const width = 64;
  const height = 48;
  const tiles = Array.from({ length: height }, () => Array(width).fill('rock'));
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const nx = (x - 31.5) / 30;
      const ny = (y - 23.5) / 21.5;
      const edgeNoise = Math.sin(x * 0.71) * 0.035 + Math.cos(y * 0.83) * 0.035;
      if ((nx * nx) + (ny * ny) < 0.94 + edgeNoise) tiles[y][x] = 'grass';
    }
  }
  paintTiles(tiles, width, height, 32, 24, 8, 'scorched');
  paintTiles(tiles, width, height, 32, 24, 3, 'dirt');
  paintTiles(tiles, width, height, 32, 8, 4, 'scorched');
  paintTiles(tiles, width, height, 54, 24, 4, 'dirt');
  paintTiles(tiles, width, height, 32, 40, 4, 'scorched');
  paintTiles(tiles, width, height, 9, 24, 4, 'dirt');
  for (let y = 9; y <= 39; y += 1) {
    if (Math.abs(y - 24) > 8) tiles[y][32] = y % 3 === 0 ? 'scorched' : 'dirt';
  }
  for (let x = 10; x <= 53; x += 1) {
    if (Math.abs(x - 32) > 9) tiles[24][x] = x % 3 === 0 ? 'scorched' : 'dirt';
  }
  for (const [x, y] of [[18, 13], [46, 13], [18, 35], [46, 35], [25, 18], [39, 30]]) {
    paintTiles(tiles, width, height, x, y, 2, 'rock');
  }

  const spawners = [
    arenaSpawner('wave1_husk_north', 'Husks at the Broken Crown', 'husk', 32, 8, 1.55, 3, 2),
    arenaSpawner('wave1_husk_south', 'Husks on the Ash Stair', 'husk', 32, 40, 1.7, 3, 2),
    arenaSpawner('wave2_raider_west', 'West Spearline', 'raider', 9, 24, 2.25, 3, 2, 48),
    arenaSpawner('wave2_raider_east', 'East Spearline', 'raider', 54, 24, 2.1, 3, 2, 48),
    arenaSpawner('wave2_husk_north', 'Crown Rabble', 'husk', 32, 8, 1.4, 4, 3),
    arenaSpawner('wave3_husk_west', 'West Ash Press', 'husk', 9, 24, 1.15, 5, 3),
    arenaSpawner('wave3_husk_east', 'East Ash Press', 'husk', 54, 24, 1.15, 5, 3),
    arenaSpawner('wave3_raider_north', 'Crown Torchbearers', 'raider', 32, 8, 1.9, 4, 2, 52),
    arenaSpawner('wave4_wolf_nw', 'Northwest Hunt', 'werewolf', 14, 12, 2.8, 2, 1, 76),
    arenaSpawner('wave4_wolf_se', 'Southeast Hunt', 'werewolf', 49, 36, 2.8, 2, 1, 76),
    arenaSpawner('wave4_raider_south', 'Ash Stair Spears', 'raider', 32, 40, 1.75, 5, 3, 54),
    arenaSpawner('wave5_husk_north', 'Black Sky North', 'husk', 32, 8, 1.0, 6, 4),
    arenaSpawner('wave5_raider_east', 'Black Sky East', 'raider', 54, 24, 1.55, 5, 3, 58),
    arenaSpawner('wave5_wolf_south', 'Black Sky Hunt', 'werewolf', 32, 40, 2.35, 3, 2, 82),
    arenaSpawner('wave5_husk_west', 'Black Sky West', 'husk', 9, 24, 1.0, 6, 4)
  ];
  const sceneObjects = [
    ['snag:northwest', 'dead_snag', 11, 10], ['snag:northeast', 'dead_snag', 52, 11],
    ['snag:southwest', 'dead_snag', 12, 37], ['snag:southeast', 'dead_snag', 51, 37],
    ['boulder:crown-west', 'boulder', 25, 24], ['boulder:crown-east', 'boulder', 39, 24],
    ['boulder:crown-north', 'boulder', 32, 17], ['boulder:crown-south', 'boulder', 32, 31],
    ['embers:crown-nw', 'smouldering_bramble', 27, 20], ['embers:crown-ne', 'smouldering_fern', 37, 20],
    ['embers:crown-sw', 'smouldering_fern', 27, 28], ['embers:crown-se', 'smouldering_bramble', 37, 28],
    ['arrows:west', 'fire_arrow_cluster', 16, 24], ['arrows:east', 'fire_arrow_cluster', 48, 24],
    ['roots:north', 'root_decal', 31, 14], ['roots:south', 'root_decal', 33, 34],
    ['litter:west', 'leaf_litter', 20, 27], ['litter:east', 'leaf_litter', 44, 21]
  ].map(([id, type, x, y]) => ({ id, type, x, y }));
  return {
    contract: BSB_V2_AUTHORING_CONTRACT,
    mapId: 'axiom_crown_of_cinders',
    title: 'The Crown of Cinders',
    scenarioId: 'demo_arena',
    revision: 1,
    width,
    height,
    tiles,
    spawn: { x: 32, y: 24, rotation: -Math.PI / 2 },
    escapeZone: { x: 1, y: 1, w: 1, h: 1 },
    transitions: { escapeZone: null },
    sceneSequences: [],
    sceneObjects,
    unitPlacements: [],
    unitSpawners: spawners,
    arena: {
      contract: BSB_V2_DEMO_ARENA_CONTRACT,
      initialUnlockedAbilityIds: ['move', 'bite_claw'],
      startDelaySeconds: 2.5,
      intermissionSeconds: 4,
      recoveryPerWave: 24,
      waves: [
        arenaWave('first_blood', 'I · FIRST BLOOD', ['wave1_husk_north', 'wave1_husk_south'], 'dodge', 'INSTINCT AWAKENED · DODGE'),
        arenaWave('spearline', 'II · THE SPEARLINE', ['wave2_raider_west', 'wave2_raider_east', 'wave2_husk_north'], 'body_lunge', 'INSTINCT AWAKENED · BODY LUNGE'),
        arenaWave('the_press', 'III · THE PRESS', ['wave3_husk_west', 'wave3_husk_east', 'wave3_raider_north'], 'smoke_burst', 'INSTINCT AWAKENED · SMOKE BURST'),
        arenaWave('the_hunt', 'IV · THE HUNT', ['wave4_wolf_nw', 'wave4_wolf_se', 'wave4_raider_south'], 'charge_counter', 'INSTINCT AWAKENED · DODGE CHARGE'),
        arenaWave('black_sky', 'V · BLACK SKY', ['wave5_husk_north', 'wave5_raider_east', 'wave5_wolf_south', 'wave5_husk_west'])
      ],
      victoryMessage: 'THE CROWN HOLDS · DEMO COMPLETE'
    },
    lastResize: null,
    provenance: {
      canonicalOwner: 'AXIOM',
      purpose: 'editable_source_for_bsb_public_demo_arena_bake',
      runtimeAuthority: false
    },
    updatedAt: '2026-07-29T00:00:00.000Z'
  };
}

function arenaSpawner(id, label, type, x, y, intervalSeconds, limit, maxAlive, hitPoints = 40) {
  return {
    id,
    label,
    type,
    team: defaultTeamForUnit(type),
    x,
    y,
    enabled: true,
    intervalSeconds,
    initialDelaySeconds: 0.35,
    burstCount: 1,
    maxAlive,
    limit,
    spawnRadiusTiles: 1.15,
    hitPoints,
    fixtureRadiusTiles: type === 'werewolf' ? 0.68 : 0.58
  };
}

function arenaWave(id, label, spawnerIds, rewardAbilityId = null, rewardLabel = null) {
  return { id, label, spawnerIds, rewardAbilityId, rewardLabel };
}

function normalizeDemoArenaDefinition(source, spawners) {
  if (source == null) return null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('bsb_demo_arena_invalid');
  if (source.contract !== BSB_V2_DEMO_ARENA_CONTRACT) {
    throw new Error(`bsb_demo_arena_contract_invalid:${source.contract ?? 'missing'}`);
  }
  const initialUnlockedAbilityIds = normalizeArenaAbilityIds(source.initialUnlockedAbilityIds, 'initialUnlockedAbilityIds');
  if (!initialUnlockedAbilityIds.includes('move') || !initialUnlockedAbilityIds.includes('bite_claw')) {
    throw new Error('bsb_demo_arena_starting_actions_missing');
  }
  if (!Array.isArray(source.waves) || source.waves.length < 1 || source.waves.length > 12) {
    throw new Error('bsb_demo_arena_waves_invalid');
  }
  const spawnerById = new Map(spawners.map((entry) => [entry.id, entry]));
  const assignedSpawnerIds = new Set();
  const rewardAbilityIds = new Set(initialUnlockedAbilityIds);
  const waveIds = new Set();
  const waves = source.waves.map((wave, index) => {
    const id = identifier(wave?.id, `arena.waves:${index}.id`);
    if (waveIds.has(id)) throw new Error(`bsb_demo_arena_wave_duplicate:${id}`);
    waveIds.add(id);
    if (!Array.isArray(wave?.spawnerIds) || wave.spawnerIds.length === 0) {
      throw new Error(`bsb_demo_arena_wave_spawners_missing:${id}`);
    }
    const spawnerIds = [...new Set(wave.spawnerIds.map((value, spawnerIndex) => identifier(value, `arena.waves:${index}.spawnerIds:${spawnerIndex}`)))];
    for (const spawnerId of spawnerIds) {
      const spawner = spawnerById.get(spawnerId);
      if (!spawner) throw new Error(`bsb_demo_arena_spawner_missing:${id}:${spawnerId}`);
      if (assignedSpawnerIds.has(spawnerId)) throw new Error(`bsb_demo_arena_spawner_reused:${spawnerId}`);
      if (!(spawner.limit > 0)) throw new Error(`bsb_demo_arena_spawner_limit_required:${spawnerId}`);
      assignedSpawnerIds.add(spawnerId);
    }
    const rewardAbilityId = wave.rewardAbilityId == null ? null : identifier(wave.rewardAbilityId, `arena.waves:${index}.rewardAbilityId`);
    if (rewardAbilityId && !DEMO_ARENA_ABILITIES.has(rewardAbilityId)) throw new Error(`bsb_demo_arena_ability_unknown:${rewardAbilityId}`);
    if (rewardAbilityId && rewardAbilityIds.has(rewardAbilityId)) throw new Error(`bsb_demo_arena_reward_repeated:${rewardAbilityId}`);
    if (rewardAbilityId) rewardAbilityIds.add(rewardAbilityId);
    return {
      id,
      label: text(wave.label, `WAVE ${index + 1}`),
      spawnerIds,
      rewardAbilityId,
      rewardLabel: rewardAbilityId ? text(wave.rewardLabel, `INSTINCT AWAKENED · ${rewardAbilityId.replaceAll('_', ' ').toUpperCase()}`) : null
    };
  });
  if (assignedSpawnerIds.size !== spawners.length) {
    const unassigned = spawners.find((entry) => !assignedSpawnerIds.has(entry.id));
    throw new Error(`bsb_demo_arena_spawner_unassigned:${unassigned?.id ?? 'unknown'}`);
  }
  return {
    contract: BSB_V2_DEMO_ARENA_CONTRACT,
    initialUnlockedAbilityIds,
    startDelaySeconds: arenaNumber(source.startDelaySeconds, 2.5, 0, 30),
    intermissionSeconds: arenaNumber(source.intermissionSeconds, 4, 0.5, 30),
    recoveryPerWave: arenaNumber(source.recoveryPerWave, 20, 0, 999),
    waves,
    victoryMessage: text(source.victoryMessage, 'DEMO COMPLETE')
  };
}

function normalizeArenaAbilityIds(values, label) {
  if (!Array.isArray(values)) throw new Error(`bsb_demo_arena_abilities_invalid:${label}`);
  const normalized = [...new Set(values.map((value, index) => identifier(value, `arena.${label}:${index}`)))];
  const unknown = normalized.find((value) => !DEMO_ARENA_ABILITIES.has(value));
  if (unknown) throw new Error(`bsb_demo_arena_ability_unknown:${unknown}`);
  return normalized;
}

function arenaNumber(value, fallback, min, max) {
  const numeric = value == null ? fallback : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new Error('bsb_demo_arena_number_invalid');
  return Math.round(numeric * 1000) / 1000;
}

export function validateBsbV2AuthoringDocument(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('bsb_authoring_document_invalid');
  if (source.contract !== BSB_V2_AUTHORING_CONTRACT) throw new Error(`bsb_authoring_contract_invalid:${source.contract ?? 'missing'}`);
  const width = integer(source.width, 'width', 4, 256);
  const height = integer(source.height, 'height', 4, 256);
  if (!Array.isArray(source.tiles) || source.tiles.length !== height) throw new Error('bsb_authoring_tiles_height_invalid');
  const tiles = source.tiles.map((row, y) => {
    if (!Array.isArray(row) || row.length !== width) throw new Error(`bsb_authoring_tiles_width_invalid:${y}`);
    return row.map((tile, x) => {
      if (!Object.hasOwn(TERRAIN, tile)) throw new Error(`bsb_authoring_terrain_invalid:${x}:${y}:${tile}`);
      return tile;
    });
  });
  const sceneObjects = normalizeRecords(source.sceneObjects, 'sceneObjects', width, height, new Set(SCENE_OBJECTS.map(([id]) => id)));
  const unitPlacements = normalizeRecords(source.unitPlacements, 'unitPlacements', width, height, new Set(UNIT_TYPES.map(([id]) => id)), true);
  const unitSpawners = normalizeRecords(source.unitSpawners, 'unitSpawners', width, height, new Set(UNIT_TYPES.map(([id]) => id)), true);
  const arena = normalizeDemoArenaDefinition(source.arena, unitSpawners);
  const sceneSequences = normalizeBsbV2TransitionSequences(source.sceneSequences, {
    actorIds: unitPlacements.map((entry) => entry.id)
  });
  const transitions = normalizeAuthoringTransitions(source.transitions);
  const departureSequenceId = transitions.escapeZone?.departureSequenceId;
  if (departureSequenceId && !sceneSequences.some((entry) => entry.id === departureSequenceId)) {
    throw new Error(`bsb_authoring_departure_sequence_missing:${departureSequenceId}`);
  }
  const lastResize = normalizeLastResize(source.lastResize, width, height);
  return {
    contract: BSB_V2_AUTHORING_CONTRACT,
    mapId: identifier(source.mapId, 'mapId'),
    title: text(source.title, 'Untitled BSB Map'),
    scenarioId: identifier(source.scenarioId, 'scenarioId'),
    revision: integer(source.revision, 'revision', 0, Number.MAX_SAFE_INTEGER),
    width,
    height,
    tiles,
    spawn: spawnPoint(source.spawn, width, height, 'spawn'),
    escapeZone: rect(source.escapeZone, width, height, 'escapeZone'),
    transitions,
    sceneSequences,
    sceneObjects,
    unitPlacements,
    unitSpawners,
    ...(arena ? { arena } : {}),
    lastResize,
    provenance: {
      canonicalOwner: 'AXIOM',
      purpose: 'editable_source_for_bsb_runtime_map_bake',
      runtimeAuthority: false
    },
    updatedAt: source.updatedAt ? text(source.updatedAt, null) : null
  };
}

export function applyBsbV2AuthoringTool(source, toolId, tileX, tileY, options = {}) {
  const document = validateBsbV2AuthoringDocument(source);
  const tool = TOOL_BY_ID.get(String(toolId || ''));
  if (!tool) throw new Error(`bsb_authoring_tool_unknown:${toolId}`);
  const x = integer(tileX, 'tileX', 0, document.width - 1);
  const y = integer(tileY, 'tileY', 0, document.height - 1);
  const nextRevision = document.revision + 1;

  if (tool.kind === 'terrain') {
    paintTiles(document.tiles, document.width, document.height, x, y, integer(options.brushRadius ?? 1, 'brushRadius', 0, 8), tool.value);
  } else if (tool.kind === 'playerSpawn') {
    document.spawn = { x, y };
  } else if (tool.kind === 'escapeZone') {
    document.escapeZone = {
      x: Math.min(x, document.width - document.escapeZone.w),
      y: Math.min(y, document.height - document.escapeZone.h),
      w: document.escapeZone.w,
      h: document.escapeZone.h
    };
  } else if (tool.kind === 'sceneObject') {
    document.sceneObjects = document.sceneObjects.filter((entry) => entry.type !== tool.value || entry.x !== x || entry.y !== y);
    const placed = { id: uniqueId(tool.value, x, y, nextRevision), type: tool.value, x, y };
    document.sceneObjects.push(isBsbV2TreeRecord(placed)
      ? normalizeBsbV2TreeRecord(placed)
      : isBsbV2UndergrowthRecord(placed)
        ? normalizeBsbV2UndergrowthRecord(placed)
        : isBsbV2GeologyRecord(placed)
          ? normalizeBsbV2GeologyRecord(placed)
          : placed);
  } else if (tool.kind === 'unit') {
    document.unitPlacements = document.unitPlacements.filter((entry) => entry.type !== tool.value || entry.x !== x || entry.y !== y);
    document.unitPlacements.push({ id: uniqueId(tool.value, x, y, nextRevision), type: tool.value, team: defaultTeamForUnit(tool.value), x, y });
  } else if (tool.kind === 'spawner') {
    document.unitSpawners = document.unitSpawners.filter((entry) => entry.type !== tool.value || entry.x !== x || entry.y !== y);
    document.unitSpawners.push({
      id: uniqueId(`spawner-${tool.value}`, x, y, nextRevision),
      label: `${tool.label}`,
      type: tool.value,
      team: defaultTeamForUnit(tool.value),
      x,
      y,
      enabled: true,
      intervalSeconds: 4,
      initialDelaySeconds: 0.2,
      burstCount: 1,
      maxAlive: 3,
      limit: 0,
      spawnRadiusTiles: 0.6
    });
  } else if (tool.kind === 'erase') {
    document.sceneObjects = document.sceneObjects.filter((entry) => entry.x !== x || entry.y !== y);
    document.unitPlacements = document.unitPlacements.filter((entry) => entry.x !== x || entry.y !== y);
    document.unitSpawners = document.unitSpawners.filter((entry) => entry.x !== x || entry.y !== y);
    document.tiles[y][x] = 'grass';
  }
  document.revision = nextRevision;
  document.updatedAt = new Date().toISOString();
  return document;
}

export function buildBsbV2RuntimeMap(source) {
  const document = validateBsbV2AuthoringDocument(source);
  return {
    contract: BSB_V2_RUNTIME_MAP_CONTRACT,
    id: document.mapId,
    title: document.title,
    scenarioId: document.scenarioId,
    width: document.width,
    height: document.height,
    tiles: document.tiles.map((row) => [...row]),
    revision: document.revision,
    spawn: { ...document.spawn },
    escapeZone: { ...document.escapeZone },
    transitions: cloneRecord(document.transitions),
    sceneSequences: document.sceneSequences.map(cloneRecord),
    enemySpawns: document.unitPlacements.filter((entry) => entry.team === 'enemy').map(cloneRecord),
    unitPlacements: document.unitPlacements.map(cloneRecord),
    unitSpawners: document.unitSpawners.map(cloneRecord),
    ...(document.arena ? { arena: cloneRecord(document.arena) } : {}),
    sceneObjects: document.sceneObjects.map((entry) => ({ ...cloneRecord(entry), source: 'axiom.bsb-map-authoring.v0' }))
  };
}

export function patchBsbV2AuthoringRecord(source, kind, id, patch = {}) {
  const document = validateBsbV2AuthoringDocument(source);
  const collection = recordCollection(kind);
  const recordId = text(id, '');
  const index = document[collection.field].findIndex((entry) => entry.id === recordId);
  if (index < 0) throw new Error(`bsb_authoring_record_missing:${kind}:${recordId}`);
  const current = document[collection.field][index];
  const next = normalizeRecordPatch(document, kind, current, patch);
  document[collection.field] = document[collection.field].map((entry, entryIndex) => (entryIndex === index ? next : entry));
  document.revision += 1;
  document.updatedAt = new Date().toISOString();
  return validateBsbV2AuthoringDocument(document);
}

export function applyBsbV2TreeOperation(source, operation = {}) {
  const document = validateBsbV2AuthoringDocument(source);
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('bsb_tree_operation_invalid');
  const op = String(operation.op ?? operation.operation ?? '').trim().toLowerCase().replace(/-/g, '_');
  const treeRecords = document.sceneObjects.filter(isBsbV2TreeRecord);
  const beforeRevision = document.revision;
  let affectedIds = [];

  if (op === 'create') {
    const x = integer(operation.x, 'tree.x', 0, document.width - 1);
    const y = integer(operation.y, 'tree.y', 0, document.height - 1);
    const id = text(operation.id, uniqueId('tree', x, y, beforeRevision + 1));
    if (document.sceneObjects.some((entry) => entry.id === id)) throw new Error(`bsb_tree_id_duplicate:${id}`);
    const record = normalizeBsbV2TreeRecord({
      id,
      type: operation.type === 'birch_tree' ? 'birch_tree' : 'tree',
      x,
      y,
      label: operation.label,
      tree: createBsbV2TreeDefinition(operation.tree ?? operation, { id, type: operation.type, x, y })
    });
    if (!record.label) delete record.label;
    document.sceneObjects.push(record);
    affectedIds = [record.id];
  } else {
    const requestedId = text(operation.treeId ?? operation.id, '');
    const scopeAll = operation.scope === 'all' || op === 'make_forest_ancient';
    const targets = scopeAll
      ? treeRecords
      : treeRecords.filter((entry) => entry.id === requestedId);
    if (!targets.length) throw new Error(`bsb_tree_target_missing:${requestedId || operation.scope || 'selection'}`);
    const targetIds = new Set(targets.map((entry) => entry.id));
    const recordOperation = op === 'make_forest_ancient' ? { ...operation, op: 'make_ancient' } : operation;
    document.sceneObjects = document.sceneObjects.map((entry) => (
      targetIds.has(entry.id) ? applyBsbV2TreeRecordOperation(entry, recordOperation) : entry
    ));
    affectedIds = [...targetIds];
  }

  document.revision = beforeRevision + 1;
  document.updatedAt = new Date().toISOString();
  const validated = validateBsbV2AuthoringDocument(document);
  return Object.freeze({
    ok: true,
    applied: true,
    contract: BSB_V2_TREE_OPERATION_CONTRACT,
    operation: op,
    affectedIds: Object.freeze(affectedIds),
    beforeRevision,
    afterRevision: validated.revision,
    document: validated
  });
}

export function applyBsbV2UndergrowthOperation(source, operation = {}) {
  const document = validateBsbV2AuthoringDocument(source);
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('bsb_undergrowth_operation_invalid');
  const op = String(operation.op ?? operation.operation ?? '').trim().toLowerCase().replace(/-/g, '_');
  const records = document.sceneObjects.filter(isBsbV2UndergrowthRecord);
  const beforeRevision = document.revision;
  let affectedIds = [];

  if (op === 'create') {
    const x = integer(operation.x, 'undergrowth.x', 0, document.width - 1);
    const y = integer(operation.y, 'undergrowth.y', 0, document.height - 1);
    const species = String(operation.species ?? operation.undergrowth?.species ?? 'wood_fern').trim().toLowerCase();
    const recipe = BSB_V2_UNDERGROWTH_SPECIES_RECIPES[species];
    if (!recipe) throw new Error(`bsb_undergrowth_species_invalid:${species || 'missing'}`);
    const id = text(operation.id, uniqueId(recipe.defaultType, x, y, beforeRevision + 1));
    if (document.sceneObjects.some((entry) => entry.id === id)) throw new Error(`bsb_undergrowth_id_duplicate:${id}`);
    const record = normalizeBsbV2UndergrowthRecord({
      id,
      type: recipe.defaultType,
      x,
      y,
      label: operation.label,
      undergrowth: createBsbV2UndergrowthDefinition(operation.undergrowth ?? operation, { id, type: recipe.defaultType, x, y })
    });
    if (!record.label) delete record.label;
    document.sceneObjects.push(record);
    affectedIds = [record.id];
  } else {
    const requestedId = text(operation.undergrowthId ?? operation.id, '');
    const scopeAll = operation.scope === 'all' || op === 'make_undergrowth_wild';
    const targets = scopeAll ? records : records.filter((entry) => entry.id === requestedId);
    if (!targets.length) throw new Error(`bsb_undergrowth_target_missing:${requestedId || operation.scope || 'selection'}`);
    const targetIds = new Set(targets.map((entry) => entry.id));
    const recordOperation = op === 'make_undergrowth_wild' ? { ...operation, op: 'make_wild' } : operation;
    document.sceneObjects = document.sceneObjects.map((entry) => (
      targetIds.has(entry.id) ? applyBsbV2UndergrowthRecordOperation(entry, recordOperation) : entry
    ));
    affectedIds = [...targetIds];
  }

  document.revision = beforeRevision + 1;
  document.updatedAt = new Date().toISOString();
  const validated = validateBsbV2AuthoringDocument(document);
  return Object.freeze({
    ok: true,
    applied: true,
    contract: BSB_V2_UNDERGROWTH_OPERATION_CONTRACT,
    operation: op,
    affectedIds: Object.freeze(affectedIds),
    beforeRevision,
    afterRevision: validated.revision,
    document: validated
  });
}

export function applyBsbV2GeologyOperation(source, operation = {}) {
  const document = validateBsbV2AuthoringDocument(source);
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('bsb_geology_operation_invalid');
  const op = String(operation.op ?? operation.operation ?? '').trim().toLowerCase().replace(/-/g, '_');
  const records = document.sceneObjects.filter(isBsbV2GeologyRecord);
  const beforeRevision = document.revision;
  let affectedIds = [];
  let requestedCount = 1;

  if (op === 'create') {
    const x = integer(operation.x, 'geology.x', 0, document.width - 1);
    const y = integer(operation.y, 'geology.y', 0, document.height - 1);
    const id = text(operation.id, uniqueId('boulder', x, y, beforeRevision + 1));
    if (document.sceneObjects.some((entry) => entry.id === id)) throw new Error(`bsb_geology_id_duplicate:${id}`);
    const record = normalizeBsbV2GeologyRecord({
      id,
      type: 'boulder',
      x,
      y,
      label: operation.label,
      geology: createBsbV2GeologyDefinition(operation.geology ?? operation, { id, type: 'boulder', x, y })
    });
    if (!record.label) delete record.label;
    document.sceneObjects.push(record);
    affectedIds = [id];
  } else if (op === 'create_cluster') {
    const centerX = integer(operation.x, 'geology.cluster.x', 0, document.width - 1);
    const centerY = integer(operation.y, 'geology.cluster.y', 0, document.height - 1);
    requestedCount = integer(operation.count ?? 5, 'geology.cluster.count', 2, 12);
    const radiusTiles = integer(operation.radiusTiles ?? operation.radius ?? 4, 'geology.cluster.radiusTiles', 1, 8);
    const cluster = createGeologyCluster(document, {
      ...operation,
      x: centerX,
      y: centerY,
      count: requestedCount,
      radiusTiles,
      revision: beforeRevision + 1
    });
    if (!cluster.records.length) throw new Error('bsb_geology_cluster_capacity_exhausted');
    document.sceneObjects.push(...cluster.records);
    affectedIds = cluster.records.map((entry) => entry.id);
  } else {
    const requestedId = text(operation.geologyId ?? operation.id, '');
    const targets = operation.scope === 'all' ? records : records.filter((entry) => entry.id === requestedId);
    if (!targets.length) throw new Error(`bsb_geology_target_missing:${requestedId || operation.scope || 'selection'}`);
    const targetIds = new Set(targets.map((entry) => entry.id));
    document.sceneObjects = document.sceneObjects.map((entry) => (
      targetIds.has(entry.id) ? applyBsbV2GeologyRecordOperation(entry, operation) : entry
    ));
    affectedIds = [...targetIds];
    requestedCount = affectedIds.length;
  }

  document.revision = beforeRevision + 1;
  document.updatedAt = new Date().toISOString();
  const validated = validateBsbV2AuthoringDocument(document);
  return Object.freeze({
    ok: true,
    applied: true,
    contract: BSB_V2_GEOLOGY_OPERATION_CONTRACT,
    operation: op,
    affectedIds: Object.freeze(affectedIds),
    requestedCount,
    createdCount: op === 'create' || op === 'create_cluster' ? affectedIds.length : 0,
    skippedCount: op === 'create_cluster' ? requestedCount - affectedIds.length : 0,
    beforeRevision,
    afterRevision: validated.revision,
    document: validated
  });
}

function createGeologyCluster(document, options) {
  const rootDefinition = createBsbV2GeologyDefinition(options.geology ?? options, {
    id: options.idPrefix ?? `geology-cluster:${options.x}:${options.y}:${options.revision}`,
    type: 'boulder',
    x: options.x,
    y: options.y
  });
  const random = seededRandomForGeologyCluster(rootDefinition.seed);
  const candidates = [{ x: options.x, y: options.y }];
  for (let attempt = 0; attempt < options.count * 36; attempt += 1) {
    const radius = Math.sqrt(random()) * options.radiusTiles;
    const angle = random() * Math.PI * 2;
    candidates.push({ x: Math.round(options.x + Math.cos(angle) * radius), y: Math.round(options.y + Math.sin(angle) * radius) });
  }
  const accepted = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (accepted.length >= options.count) break;
    const key = `${candidate.x}:${candidate.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!geologyClusterTileAvailable(document, candidate.x, candidate.y, accepted)) continue;
    const index = accepted.length;
    const id = `${text(options.idPrefix, 'boulder-cluster')}:${candidate.x}:${candidate.y}:${options.revision}:${index + 1}`;
    const seed = (rootDefinition.seed + Math.imul(index + 1, 104729)) % 2147483646 + 1;
    accepted.push(normalizeBsbV2GeologyRecord({
      id,
      type: 'boulder',
      x: candidate.x,
      y: candidate.y,
      geology: createBsbV2GeologyDefinition({
        ...rootDefinition,
        seed,
        scale: Math.max(0.45, Math.min(2.4, rootDefinition.scale * (0.78 + random() * 0.42))),
        heightMeters: Math.max(0.3, Math.min(4.2, rootDefinition.heightMeters * (0.74 + random() * 0.5)))
      }, { id, type: 'boulder', x: candidate.x, y: candidate.y })
    }));
  }
  return { records: accepted };
}

function geologyClusterTileAvailable(document, x, y, accepted) {
  const footprint = { x, y, w: 2, h: 2 };
  if (x < 0 || y < 0 || x + footprint.w > document.width || y + footprint.h > document.height) return false;
  if (pointInsideRect(document.spawn, footprint) || rectanglesOverlap(footprint, document.escapeZone)) return false;
  if ([...document.unitPlacements, ...document.unitSpawners].some((entry) => pointInsideRect(entry, footprint))) return false;
  const occupied = [...document.sceneObjects, ...accepted];
  return !occupied.some((entry) => rectanglesOverlap(footprint, {
    x: entry.x,
    y: entry.y,
    w: entry.w ?? entry.widthTiles ?? (entry.type === 'boulder' ? 2 : 1),
    h: entry.h ?? entry.heightTiles ?? (entry.type === 'boulder' ? 2 : 1)
  }));
}

function pointInsideRect(pointValue, rectValue) {
  return pointValue && pointValue.x >= rectValue.x && pointValue.y >= rectValue.y
    && pointValue.x < rectValue.x + rectValue.w && pointValue.y < rectValue.y + rectValue.h;
}

function rectanglesOverlap(left, right) {
  if (!left || !right) return false;
  return left.x < right.x + right.w && left.x + left.w > right.x
    && left.y < right.y + right.h && left.y + left.h > right.y;
}

function seededRandomForGeologyCluster(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function createRuntime() {
  const state = {
    active: false,
    document: null,
    dirty: false,
    status: 'idle',
    error: null,
    selectedToolId: 'terrain:forest',
    palette: 'terrain',
    brushRadius: 2,
    view: 'author',
    inputOwner: 'inspect',
    diaryAnchor: null,
    hoverTile: null,
    painting: false,
    lastPaintKey: null,
    undergrowthBrushConfig: normalizeBsbV2UndergrowthBrushConfig(),
    undergrowthBrushStroke: [],
    undergrowthBrushPreview: null,
    undergrowthBrushLastPaintReceipt: null,
    undergrowthBrushLastReceipt: null,
    saveReceipt: null,
    bakeReceipt: null,
    runtimeVerification: null,
    publication: null,
    mapLibrary: null,
    activeCatalogueMapId: null,
    authoringPath: BSB_V2_AUTHORING_PATH,
    resizeReceipt: null,
    selectedRecord: null,
    outlinerQuery: '',
    outlinerKind: 'all',
    viewport: createBsbV2MapViewport(),
    panning: null,
    canvasLayout: null,
    resizeObserver: null,
    workspaceProject: null,
    workspaceBinding: null,
    lastWorkspaceFingerprint: null
  };

  function readWorkspaceContext(required = true) {
    const getContext = window.EDITOR?.workspace?.getContext;
    if (typeof getContext !== 'function') {
      if (required) throw new Error('bsb_workspace_context_unavailable');
      return null;
    }
    const context = getContext();
    if (!context && required) throw new Error('bsb_workspace_context_missing');
    return context || null;
  }

  function workspaceDeclaresBsbSurface(context) {
    return context?.project?.workspace?.surfaceId === BSB_V2_AUTHORING_SURFACE_ID;
  }

  function requireWorkspaceBinding() {
    const context = readWorkspaceContext(true);
    const binding = resolveBsbV2WorkspaceBinding(context);
    state.workspaceProject = binding.project;
    state.workspaceBinding = binding;
    return binding;
  }

  function resetInactiveState() {
    state.document = null;
    state.dirty = false;
    state.status = 'idle';
    state.error = null;
    state.saveReceipt = null;
    state.bakeReceipt = null;
    state.runtimeVerification = null;
    state.publication = null;
    state.mapLibrary = null;
    state.activeCatalogueMapId = null;
    state.authoringPath = BSB_V2_AUTHORING_PATH;
    state.resizeReceipt = null;
    state.selectedRecord = null;
    state.inputOwner = 'inspect';
    state.diaryAnchor = null;
    state.workspaceProject = null;
    state.workspaceBinding = null;
    state.viewport = createBsbV2MapViewport();
    state.canvasLayout = null;
    resetUndergrowthBrushProjection({ clearReceipt: true });
  }

  function notify(type, message) {
    try { window.EDITOR?.notify?.(type, message); } catch (_) {}
  }

  async function mcp(tool, params) {
    const call = window.EDITOR?.mcp?.call;
    if (typeof call !== 'function') throw new Error('bsb_authoring_file_bridge_unavailable');
    const response = await call(tool, params);
    if (response?.ok === false) throw new Error(response.error || `${tool}_failed`);
    return response;
  }

  async function loadMapLibrary() {
    const binding = requireWorkspaceBinding();
    const response = await mcp('safe_read_project_file', {
      projectId: binding.runtimeBake.projectId,
      path: binding.scene.manifestPath,
      full: true
    });
    if (response?.result?.error) throw new Error(`bsb_map_manifest_read_failed:${response.result.error}`);
    let manifest;
    try {
      manifest = JSON.parse(response?.result?.content ?? '');
    } catch {
      throw new Error('bsb_map_manifest_json_invalid');
    }
    state.mapLibrary = resolveBsbV2MapLibrary(manifest);
    if (!state.activeCatalogueMapId) state.activeCatalogueMapId = state.mapLibrary.defaultMapId;
    return state.mapLibrary;
  }

  async function loadPublicationContract() {
    const library = await loadMapLibrary();
    state.publication = resolveBsbV2MapPublication(library, state.document);
    state.activeCatalogueMapId = state.publication.catalogueMapId;
    state.authoringPath = state.publication.authoringPath;
    return state.publication;
  }

  async function verifyRuntimeBake(binding = requireWorkspaceBinding()) {
    if (!state.document || !state.publication) {
      state.runtimeVerification = { status: 'unverified', error: 'runtime_verification_inputs_missing' };
      return state.runtimeVerification;
    }
    try {
      const response = await mcp('safe_read_project_file', {
        projectId: binding.runtimeBake.projectId,
        path: state.publication.writePath,
        full: true
      });
      if (response?.result?.error) throw new Error(response.result.error);
      const runtimeMap = JSON.parse(response?.result?.content ?? '');
      const inspected = inspectBsbV2RuntimeBake(state.document, runtimeMap, state.publication);
      state.runtimeVerification = {
        ...inspected,
        path: state.publication.runtimePath,
        verifiedAt: new Date().toISOString(),
        error: inspected.errors?.length ? inspected.errors.join(',') : null
      };
    } catch (error) {
      state.runtimeVerification = {
        status: 'failed',
        path: state.publication.runtimePath,
        verifiedAt: new Date().toISOString(),
        error: `runtime_bake_verification_failed:${String(error?.message || error)}`,
        mismatches: []
      };
    }
    return state.runtimeVerification;
  }

  async function selectPublication(catalogueMapId = null) {
    const library = state.mapLibrary ?? await loadMapLibrary();
    const id = catalogueMapId || state.activeCatalogueMapId || library.defaultMapId;
    const entry = library.maps.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`bsb_map_catalogue_missing:${id}`);
    state.activeCatalogueMapId = entry.id;
    state.authoringPath = entry.authoringPath;
    state.publication = resolveBsbV2MapPublication(library, {
      ...createDraftForPublication(entry),
      mapId: entry.runtimeMapId,
      title: entry.title,
      scenarioId: entry.scenarioId
    });
    return state.publication;
  }

  function ensureWorkspace() {
    const body = document.querySelector('#project-preview-panel .project-preview-body');
    const head = document.querySelector('#project-preview-panel .project-preview-head');
    if (!body || !head) return false;
    let stage = document.getElementById('bsb-v2-authoring-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'bsb-v2-authoring-stage';
      stage.className = 'bsb-v2-authoring-stage';
      stage.hidden = true;
      stage.innerHTML = `
        <div class="bsb-v2-stage-head">
          <b id="bsb-v2-stage-title">AXIOM Map Authoring</b>
          <span id="bsb-v2-stage-meta">No authoring document loaded</span>
          <div class="bsb-v2-stage-spacer"></div>
          <button id="bsb-v2-stage-diary-return" class="bsb-v2-context-return" type="button" onclick="ProjectDiaryRuntime.open()" title="Return to the Project Diary without losing this map context">Diary</button>
          <span id="bsb-v2-stage-input-owner" class="bsb-v2-input-owner">Input: inspect</span>
          <div class="bsb-v2-viewport-controls" aria-label="Map viewport controls">
            <button title="Zoom out" onclick="BsbV2MapAuthoring.zoomViewport(0.8)">−</button>
            <button title="Fit the full map" onclick="BsbV2MapAuthoring.fitViewport()">Fit</button>
            <button title="Zoom in" onclick="BsbV2MapAuthoring.zoomViewport(1.25)">+</button>
            <span id="bsb-v2-stage-zoom">100%</span>
          </div>
          <span class="bsb-v2-control-hint" title="Select with click. Zoom with the wheel. Pan with middle/right mouse or Shift-drag. Fit returns home.">Wheel zoom · MMB/Shift pan · Fit home</span>
          <span id="bsb-v2-stage-tool">Tool: Forest</span>
        </div>
        <div class="bsb-v2-map-canvas-wrap"><canvas id="bsb-v2-map-canvas" class="bsb-v2-map-canvas"></canvas></div>`;
      body.appendChild(stage);
      const canvas = stage.querySelector('canvas');
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('contextmenu', (event) => event.preventDefault());
      window.addEventListener('pointerup', onPointerUp);
      state.resizeObserver = new ResizeObserver(() => draw());
      state.resizeObserver.observe(canvas.parentElement);
    }
    let switcher = document.getElementById('bsb-v2-preview-switch');
    if (!switcher) {
      switcher = document.createElement('div');
      switcher.id = 'bsb-v2-preview-switch';
      switcher.className = 'bsb-v2-preview-switch';
      switcher.hidden = true;
      switcher.innerHTML = `<button data-view="author" onclick="BsbV2MapAuthoring.setView('author')">Author</button><button data-view="runtime" onclick="BsbV2MapAuthoring.setView('runtime')">Runtime</button>`;
      head.insertBefore(switcher, head.querySelector('.project-preview-spacer'));
    }
    return true;
  }

  async function syncProject() {
    ensureWorkspace();
    const wasActive = state.active;
    const context = readWorkspaceContext(false);
    state.active = workspaceDeclaresBsbSurface(context);
    const switcher = document.getElementById('bsb-v2-preview-switch');
    if (switcher) switcher.hidden = !state.active;
    if (!state.active) {
      const stage = document.getElementById('bsb-v2-authoring-stage');
      if (stage) stage.hidden = true;
      if (wasActive) resetInactiveState();
      publishWorkspaceState('project_deactivated');
      return;
    }
    try {
      const binding = resolveBsbV2WorkspaceBinding(context);
      state.workspaceProject = binding.project;
      state.workspaceBinding = binding;
    } catch (error) {
      state.status = 'error';
      state.error = String(error?.message || error);
      render();
      return status();
    }
    setView(state.view);
    if (!wasActive || !state.document) await load();
    else render();
    setInputOwner(inputOwnerForPanel(window.AxiomUXRuntime?.getState?.()?.activeLeftPanel), { source: 'workspace_sync', force: true });
    return status();
  }

  async function load(catalogueMapId = null) {
    state.status = 'loading';
    state.error = null;
    render();
    try {
      const binding = requireWorkspaceBinding();
      const publication = await selectPublication(catalogueMapId);
      const response = await mcp('safe_read_project_file', {
        projectId: binding.authoring.projectId,
        path: publication.authoringPath,
        full: true
      });
      if (response?.result?.error) {
        state.document = createDraftForPublication(publication);
        state.dirty = true;
        state.status = 'new draft';
      } else {
        state.document = validateBsbV2AuthoringDocument(JSON.parse(response.result.content));
        state.dirty = false;
        state.status = 'saved';
      }
      state.publication = resolveBsbV2MapPublication(state.mapLibrary, state.document);
      state.activeCatalogueMapId = state.publication.catalogueMapId;
      state.authoringPath = state.publication.authoringPath;
      state.resizeReceipt = state.document.lastResize;
      state.viewport = createBsbV2MapViewport(state.document);
      state.hoverTile = null;
      state.selectedRecord = null;
      resetUndergrowthBrushProjection({ clearReceipt: true });
      state.saveReceipt = null;
      state.bakeReceipt = null;
      await verifyRuntimeBake(binding);
    } catch (error) {
      state.document = null;
      state.status = 'error';
      state.error = String(error?.message || error);
    }
    render();
    return status();
  }

  async function save() {
    if (!state.document) return fail('bsb_authoring_document_missing');
    state.status = 'saving';
    state.error = null;
    render();
    try {
      const binding = requireWorkspaceBinding();
      state.document.updatedAt = new Date().toISOString();
      const normalized = validateBsbV2AuthoringDocument(state.document);
      const response = await mcp('safe_write_project_file', {
        projectId: binding.authoring.projectId,
        path: state.authoringPath,
        content: `${JSON.stringify(normalized, null, 2)}\n`,
        overwrite: true,
        reason: 'Persist canonical AXIOM BSB V2 map authoring document'
      });
      state.document = normalized;
      state.saveReceipt = response.receipt || response.result || null;
      state.dirty = false;
      state.status = 'saved';
      console.info(
        `[AXIOM BSB map] authoring saved id=${state.document.mapId} dimensions=${state.document.width}x${state.document.height} `
        + `path=${state.authoringPath} hash=${state.saveReceipt?.afterHash ?? 'unavailable'}`
      );
      notify('ok', 'BSB V2 authoring document saved in AXIOM.');
    } catch (error) {
      state.status = 'error';
      state.error = String(error?.message || error);
      notify('err', `BSB map save failed: ${state.error}`);
    }
    render();
    return status();
  }

  async function bakeAndPreview() {
    if (!state.document) return fail('bsb_authoring_document_missing');
    const saveState = await save();
    if (saveState.error) return saveState;
    state.status = 'baking';
    render();
    try {
      const binding = requireWorkspaceBinding();
      const publication = await loadPublicationContract();
      const runtimeMap = buildBsbV2RuntimeMap(state.document);
      const response = await mcp('safe_write_project_file', {
        projectId: binding.runtimeBake.projectId,
        path: publication.writePath,
        content: `${JSON.stringify(runtimeMap, null, 2)}\n`,
        overwrite: true,
        reason: 'Bake AXIOM-authored BSB V2 map into immutable runtime content'
      });
      state.bakeReceipt = response.receipt || response.result || null;
      state.runtimeVerification = {
        status: 'current',
        path: publication.runtimePath,
        revision: runtimeMap.revision,
        mapId: runtimeMap.id,
        spawnMatches: true,
        verifiedAt: new Date().toISOString(),
        error: null,
        mismatches: []
      };
      state.status = 'runtime ready';
      state.error = null;
      console.info(
        `[AXIOM BSB map] runtime baked id=${runtimeMap.id} dimensions=${runtimeMap.width}x${runtimeMap.height} `
        + `path=${publication.runtimePath} hash=${state.bakeReceipt?.afterHash ?? 'unavailable'}`
      );
      window.AXIOM_PROJECT_PREVIEW?.setRuntimeQuery?.({ map: publication.runtimePath, source: 'axiom-authoring' });
      setView('runtime');
      notify('ok', 'BSB V2 map baked and loaded into the runtime preview.');
    } catch (error) {
      state.status = 'error';
      state.error = String(error?.message || error);
      notify('err', `BSB map bake failed: ${state.error}`);
    }
    render();
    return status();
  }

  function setView(view) {
    state.view = view === 'runtime' ? 'runtime' : 'author';
    const stage = document.getElementById('bsb-v2-authoring-stage');
    const frame = document.getElementById('project-preview-frame');
    if (stage) stage.hidden = !state.active || state.view !== 'author';
    if (frame) frame.style.visibility = state.active && state.view === 'author' ? 'hidden' : '';
    document.querySelectorAll('#bsb-v2-preview-switch button').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
    if (state.view === 'author') draw();
    return status();
  }

  function setInputOwner(owner, options = {}) {
    const next = ['diary', 'forge', 'inspect'].includes(owner) ? owner : 'inspect';
    if (state.inputOwner === next && options.force !== true) {
      updateStageReadout();
      return status();
    }
    state.inputOwner = next;
    state.painting = false;
    state.lastPaintKey = null;
    const canvas = document.getElementById('bsb-v2-map-canvas');
    if (canvas) canvas.dataset.inputOwner = next;
    updateStageReadout();
    publishWorkspaceState('input_owner_changed');
    try { window.EDITOR?.events?.emit?.('bsb:inputOwnerChanged', { owner: next, source: options.source || 'BsbV2MapAuthoring' }); } catch (_) {}
    return status();
  }

  function inputOwnerForPanel(panelId) {
    if (panelId === 'diary') return 'diary';
    if (panelId === 'bsb-map') return 'forge';
    return 'inspect';
  }

  async function selectRegion(catalogueMapId) {
    if (state.dirty) return fail('bsb_authoring_unsaved_region_switch_blocked');
    return load(catalogueMapId);
  }

  function setTool(toolId) {
    if (!TOOL_BY_ID.has(toolId)) return fail(`bsb_authoring_tool_unknown:${toolId}`);
    state.selectedToolId = toolId;
    const tool = TOOL_BY_ID.get(toolId);
    state.palette = paletteForTool(tool);
    resetUndergrowthBrushProjection();
    const brushSettings = undergrowthBrushSettingsForTool(tool);
    if (brushSettings) {
      state.undergrowthBrushConfig = normalizeBsbV2UndergrowthBrushConfig({
        ...state.undergrowthBrushConfig,
        woodFernType: brushSettings.woodFernType,
        speciesMix: Object.fromEntries(BSB_V2_UNDERGROWTH_BRUSH_SPECIES.map((id) => [id, id === brushSettings.species ? 1 : 0]))
      });
    }
    render();
    return status();
  }

  function setPalette(palette) {
    const palettes = {
      terrain: BSB_V2_AUTHORING_TOOLS.filter((entry) => entry.kind === 'terrain'),
      objects: BSB_V2_AUTHORING_TOOLS.filter((entry) => entry.kind === 'sceneObject'),
      units: BSB_V2_AUTHORING_TOOLS.filter((entry) => entry.kind === 'unit'),
      markers: BSB_V2_AUTHORING_TOOLS.filter((entry) => ['spawner', 'playerSpawn', 'escapeZone', 'erase'].includes(entry.kind))
    };
    if (!palettes[palette]) return fail(`bsb_authoring_palette_unknown:${palette}`);
    state.palette = palette;
    if (!palettes[palette].some((entry) => entry.id === state.selectedToolId)) {
      state.selectedToolId = palettes[palette][0]?.id || state.selectedToolId;
    }
    resetUndergrowthBrushProjection();
    render();
    return status();
  }

  function setOutlinerQuery(value) {
    state.outlinerQuery = String(value || '').slice(0, 160);
    return refreshOutliner();
  }

  function setOutlinerKind(value) {
    state.outlinerKind = ['all', 'sceneObject', 'unit', 'spawner'].includes(value) ? value : 'all';
    return refreshOutliner();
  }

  function setBrushRadius(value) {
    state.brushRadius = integer(Number(value), 'brushRadius', 0, 8);
    render();
    return status();
  }

  function setUndergrowthBrushField(field, value) {
    if (!['radiusTiles', 'falloff', 'density', 'seed'].includes(field)) return fail(`bsb_undergrowth_brush_field_unknown:${field}`);
    try {
      state.undergrowthBrushConfig = normalizeBsbV2UndergrowthBrushConfig({
        ...state.undergrowthBrushConfig,
        [field]: Number(value)
      });
      rebuildUndergrowthBrushPreview();
      render();
      return status();
    } catch (error) {
      return fail(error?.message || error);
    }
  }

  function setUndergrowthBrushSpeciesWeight(species, value) {
    if (!BSB_V2_UNDERGROWTH_BRUSH_SPECIES.includes(species)) return fail(`bsb_undergrowth_brush_species_unknown:${species}`);
    try {
      const target = Math.max(0, Math.min(1, Number(value) / 100));
      const others = BSB_V2_UNDERGROWTH_BRUSH_SPECIES.filter((entry) => entry !== species);
      const previousOtherTotal = others.reduce((sum, entry) => sum + state.undergrowthBrushConfig.speciesMix[entry], 0);
      const speciesMix = { ...state.undergrowthBrushConfig.speciesMix, [species]: target };
      for (const entry of others) {
        speciesMix[entry] = previousOtherTotal > 0
          ? state.undergrowthBrushConfig.speciesMix[entry] / previousOtherTotal * (1 - target)
          : (1 - target) / others.length;
      }
      state.undergrowthBrushConfig = normalizeBsbV2UndergrowthBrushConfig({ ...state.undergrowthBrushConfig, speciesMix });
      rebuildUndergrowthBrushPreview();
      render();
      return status();
    } catch (error) {
      return fail(error?.message || error);
    }
  }

  function randomiseUndergrowthBrushSeed() {
    const seed = (Math.imul(state.undergrowthBrushConfig.seed, 1664525) + 1013904223 >>> 0) % 2147483646 + 1;
    return setUndergrowthBrushField('seed', seed);
  }

  function clearUndergrowthBrushPreview() {
    resetUndergrowthBrushProjection();
    draw();
    render();
    return status();
  }

  function commitUndergrowthBrushPreview() {
    if (!state.document) return fail('bsb_authoring_document_missing');
    if (!state.undergrowthBrushPreview) return fail('bsb_undergrowth_brush_preview_missing');
    try {
      const receipt = applyUndergrowthBrushBatch(state.undergrowthBrushPreview, 'Map Forge brush');
      notify('ok', `${receipt.createdCount} procedural undergrowth records committed in one batch.`);
      return status();
    } catch (error) {
      return fail(error?.message || error);
    }
  }

  function undoLastUndergrowthBrush() {
    if (!state.document) return fail('bsb_authoring_document_missing');
    if (!canUndoUndergrowthBrush()) return fail('bsb_undergrowth_brush_undo_unavailable');
    try {
      const receipt = undoUndergrowthBrushBatch(state.undergrowthBrushLastPaintReceipt, 'Map Forge brush');
      notify('ok', `${receipt.removedCount} undergrowth records removed by batch undo.`);
      return status();
    } catch (error) {
      return fail(error?.message || error);
    }
  }

  function resizeMap(width, height, options = {}) {
    if (!state.document) return fail('bsb_authoring_document_missing');
    try {
      const fillTerrain = String(options.fillTerrain || 'grass');
      if (!Object.hasOwn(TERRAIN, fillTerrain)) throw new Error(`bsb_map_resize_fill_terrain_invalid:${fillTerrain}`);
      const source = validateBsbV2AuthoringDocument(state.document);
      const resized = resizeBsbV2AuthoringDocument(source, Number(width), Number(height), {
        anchor: options.anchor || 'center',
        fillTerrain
      });
      state.document = validateBsbV2AuthoringDocument(resized);
      state.resizeReceipt = state.document.lastResize;
      state.viewport = createBsbV2MapViewport(state.document);
      state.hoverTile = null;
      resetUndergrowthBrushProjection();
      state.saveReceipt = null;
      state.bakeReceipt = null;
      state.runtimeVerification = { status: 'stale', error: null, mismatches: ['authoring_resized_after_last_bake'] };
      state.dirty = true;
      state.status = 'resized';
      state.error = null;
      console.info(
        `[AXIOM BSB map] resized id=${state.document.mapId} dimensions=${source.width}x${source.height}->${state.document.width}x${state.document.height} `
        + `anchor=${state.resizeReceipt.anchor} offset=${state.resizeReceipt.offset.x},${state.resizeReceipt.offset.y} `
        + `fill=${state.resizeReceipt.fillTerrain} preservedTiles=${state.resizeReceipt.preserved.tiles}`
      );
      notify('ok', `BSB map expanded to ${state.document.width}×${state.document.height}; existing content centred.`);
      render();
      return status();
    } catch (error) {
      return fail(error?.message || error);
    }
  }

  function resizeMapFromUI() {
    const width = document.getElementById('bsb-v2-resize-width')?.value;
    const height = document.getElementById('bsb-v2-resize-height')?.value;
    return resizeMap(width, height, { anchor: 'center', fillTerrain: 'grass' });
  }

  function fitViewport() {
    if (!state.document) return status();
    state.viewport = createBsbV2MapViewport(state.document);
    draw();
    return status();
  }

  function zoomViewport(factor) {
    const canvas = document.getElementById('bsb-v2-map-canvas');
    if (!canvas || !state.document || !state.canvasLayout) return status();
    const bounds = canvas.getBoundingClientRect();
    state.viewport = zoomBsbV2MapViewport(
      state.document,
      state.viewport,
      state.canvasLayout,
      state.viewport.zoom * Number(factor || 1),
      bounds.width / 2,
      bounds.height / 2,
      bounds.width,
      bounds.height
    );
    draw();
    return status();
  }

  function updateTitle(value) {
    if (!state.document) return;
    state.document.title = text(value, state.document.title);
    markDirty();
  }

  function applyAt(x, y) {
    if (!state.document) return;
    const tool = TOOL_BY_ID.get(state.selectedToolId);
    state.document = applyBsbV2AuthoringTool(state.document, state.selectedToolId, x, y, { brushRadius: state.brushRadius });
    selectPlacedRecord(tool, x, y);
    markDirty(false);
  }

  function undergrowthBrushSettingsForTool(tool = TOOL_BY_ID.get(state.selectedToolId)) {
    return tool?.kind === 'sceneObject' ? UNDERGROWTH_BRUSH_TOOL_SETTINGS[tool.value] ?? null : null;
  }

  function isUndergrowthBrushActive() {
    return Boolean(undergrowthBrushSettingsForTool());
  }

  function resetUndergrowthBrushProjection(options = {}) {
    state.undergrowthBrushStroke = [];
    state.undergrowthBrushPreview = null;
    if (options.clearReceipt) {
      state.undergrowthBrushLastPaintReceipt = null;
      state.undergrowthBrushLastReceipt = null;
    }
  }

  function rebuildUndergrowthBrushPreview() {
    if (!state.document || !isUndergrowthBrushActive()) {
      state.undergrowthBrushPreview = null;
      return null;
    }
    const centers = state.undergrowthBrushStroke.length
      ? state.undergrowthBrushStroke
      : state.hoverTile ? [state.hoverTile] : [];
    state.undergrowthBrushPreview = centers.length
      ? createBsbV2UndergrowthBrushPreview(state.document, centers, state.undergrowthBrushConfig)
      : null;
    return state.undergrowthBrushPreview;
  }

  function appendUndergrowthBrushCenter(tile, reset = false) {
    if (!tile) return null;
    if (reset) state.undergrowthBrushStroke = [];
    const key = `${tile.x},${tile.y}`;
    if (state.undergrowthBrushStroke.some((entry) => `${entry.x},${entry.y}` === key)) return state.undergrowthBrushPreview;
    state.undergrowthBrushStroke.push({ x: tile.x, y: tile.y });
    state.lastPaintKey = key;
    return rebuildUndergrowthBrushPreview();
  }

  function canUndoUndergrowthBrush() {
    return Boolean(
      state.document
      && state.undergrowthBrushLastPaintReceipt?.contract === BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT
      && state.undergrowthBrushLastPaintReceipt.afterRevision === state.document.revision
    );
  }

  function previewUndergrowthBrush(strokeCenters, configuration = state.undergrowthBrushConfig) {
    if (!state.document) throw new Error('bsb_undergrowth_authoring_document_unavailable');
    return cloneRecord(createBsbV2UndergrowthBrushPreview(state.document, strokeCenters, configuration));
  }

  function applyUndergrowthBrushBatch(preview, source = 'EDITOR.procedural.undergrowth.brush') {
    if (!state.document) throw new Error('bsb_undergrowth_authoring_document_unavailable');
    const result = applyBsbV2UndergrowthBrushPreview(state.document, preview);
    state.document = validateBsbV2AuthoringDocument(result.document);
    const receipt = { ...result, document: undefined, ok: true, applied: true, source };
    state.undergrowthBrushLastPaintReceipt = receipt;
    state.undergrowthBrushLastReceipt = receipt;
    const selectedId = result.createdIds.at(-1);
    state.selectedRecord = selectedId ? { kind: 'sceneObject', id: selectedId } : null;
    resetUndergrowthBrushProjection();
    markDirty();
    try { window.EDITOR?.events?.emit?.('undergrowth:brushBatchApplied', cloneRecord(receipt)); } catch (_) {}
    return cloneRecord(receipt);
  }

  function undoUndergrowthBrushBatch(receipt = state.undergrowthBrushLastPaintReceipt, source = 'EDITOR.procedural.undergrowth.brush') {
    if (!state.document) throw new Error('bsb_undergrowth_authoring_document_unavailable');
    const result = undoBsbV2UndergrowthBrush(state.document, receipt);
    const removed = new Set(result.removedIds);
    state.document = validateBsbV2AuthoringDocument(result.document);
    if (state.selectedRecord?.kind === 'sceneObject' && removed.has(state.selectedRecord.id)) state.selectedRecord = null;
    state.undergrowthBrushLastPaintReceipt = null;
    const undoReceipt = { ...result, document: undefined, ok: true, applied: true, source };
    state.undergrowthBrushLastReceipt = undoReceipt;
    resetUndergrowthBrushProjection();
    markDirty();
    try { window.EDITOR?.events?.emit?.('undergrowth:brushBatchUndone', cloneRecord(undoReceipt)); } catch (_) {}
    return cloneRecord(undoReceipt);
  }

  function selectRecord(kind, id) {
    if (!state.document) return status();
    const selected = findRecord(state.document, kind, id);
    state.selectedRecord = selected ? { kind, id } : null;
    render();
    draw();
    return status();
  }

  function updateSelectedRecord(field, value) {
    if (!state.document || !state.selectedRecord) return status();
    try {
      state.document = patchBsbV2AuthoringRecord(
        state.document,
        state.selectedRecord.kind,
        state.selectedRecord.id,
        { [field]: value }
      );
      state.saveReceipt = null;
      state.bakeReceipt = null;
      markDirty();
      return status();
    } catch (error) {
      return fail(error?.message || error);
    }
  }

  function updateSelectedAudioEmitterField(field, value) {
    if (!state.document || !state.selectedRecord) return status();
    try {
      const selected = selectedRecordData();
      const defaults = defaultAudioEmitterForRecord(selected.kind, selected.record.type);
      const audioEmitter = { ...defaults, ...(selected.record.audioEmitter ?? {}) };
      if (field === 'enabled') audioEmitter.enabled = value === true || value === 'true';
      else if (AUDIO_EMITTER_NUMBER_FIELDS[field]) audioEmitter[field] = value;
      else audioEmitter[field] = String(value ?? '').trim();
      state.document = patchBsbV2AuthoringRecord(
        state.document,
        state.selectedRecord.kind,
        state.selectedRecord.id,
        { audioEmitter }
      );
      state.saveReceipt = null;
      state.bakeReceipt = null;
      markDirty();
      return status();
    } catch (error) {
      return fail(error?.message || error);
    }
  }

  function applyTreeOperation(operation = {}) {
    if (!state.document) throw new Error('bsb_tree_authoring_document_unavailable');
    const selectedTreeId = state.selectedRecord?.kind === 'sceneObject'
      && isBsbV2TreeRecord(findRecord(state.document, 'sceneObject', state.selectedRecord.id))
      ? state.selectedRecord.id
      : null;
    const request = {
      ...operation,
      treeId: operation.treeId ?? operation.id ?? selectedTreeId
    };
    const result = applyBsbV2TreeOperation(state.document, request);
    state.document = result.document;
    const selectedId = result.affectedIds.at(-1) ?? null;
    if (selectedId) state.selectedRecord = { kind: 'sceneObject', id: selectedId };
    state.saveReceipt = null;
    state.bakeReceipt = null;
    markDirty();
    const receipt = {
      ok: true,
      applied: true,
      contract: result.contract,
      operation: result.operation,
      affectedIds: [...result.affectedIds],
      beforeRevision: result.beforeRevision,
      afterRevision: result.afterRevision,
      authoringPath: state.authoringPath,
      runtimeStatus: classifyBsbV2RuntimeFreshness(state),
      source: 'EDITOR.procedural.trees'
    };
    try { window.EDITOR?.events?.emit?.('tree:operationApplied', cloneRecord(receipt)); } catch (_) {}
    return receipt;
  }

  function updateSelectedTreeField(field, value) {
    const patch = { [field]: value };
    return applyTreeOperation({ op: 'patch', patch });
  }

  function operateSelectedTree(op, value = null) {
    const operation = { op };
    if (value != null && value !== '') {
      if (op === 'age') operation.years = Number(value);
      else if (op === 'damage' || op === 'regrow') operation.amount = Number(value);
      else if (op === 'set_species') operation.species = value;
      else if (op === 'set_height') operation.heightMeters = Number(value);
      else if (op === 'set_leaf_density') operation.leafDensity = Number(value);
    }
    return applyTreeOperation(operation);
  }

  const treeApi = Object.freeze({
    contract: BSB_V2_TREE_OPERATION_CONTRACT,
    catalogue() {
      return {
        contract: BSB_V2_TREE_DNA_CONTRACT,
        species: BSB_V2_TREE_SPECIES_OPTIONS.map(([id, label]) => ({ id, label })),
        seasons: [...BSB_V2_TREE_SEASONS],
        operations: ['create', 'set_species', 'set_height', 'set_leaf_density', 'randomise', 'age', 'damage', 'regrow', 'make_ancient', 'make_forest_ancient', 'patch']
      };
    },
    get(treeId = null) {
      if (!state.document) return null;
      const id = treeId ?? (state.selectedRecord?.kind === 'sceneObject' ? state.selectedRecord.id : null);
      const record = state.document.sceneObjects.find((entry) => entry.id === id && isBsbV2TreeRecord(entry));
      return record ? cloneRecord(record) : null;
    },
    create(options = {}) { return applyTreeOperation({ ...options, op: 'create' }); },
    setSpecies(treeId, species) { return applyTreeOperation({ op: 'set_species', treeId, species }); },
    setHeight(treeId, heightMeters) { return applyTreeOperation({ op: 'set_height', treeId, heightMeters }); },
    setLeafDensity(treeId, leafDensity) { return applyTreeOperation({ op: 'set_leaf_density', treeId, leafDensity }); },
    randomise(treeId, options = {}) { return applyTreeOperation({ ...options, op: 'randomise', treeId }); },
    randomize(treeId, options = {}) { return applyTreeOperation({ ...options, op: 'randomise', treeId }); },
    age(treeId, years = 1) { return applyTreeOperation({ op: 'age', treeId, years }); },
    damage(treeId, amount = 0.2) { return applyTreeOperation({ op: 'damage', treeId, amount }); },
    regrow(treeId, amount = 0.24) { return applyTreeOperation({ op: 'regrow', treeId, amount }); },
    makeAncient(treeId, years = 160) { return applyTreeOperation({ op: 'make_ancient', treeId, years }); },
    makeForestAncient(options = {}) { return applyTreeOperation({ ...options, op: 'make_forest_ancient', scope: 'all' }); },
    applyOperation(operation) { return applyTreeOperation(operation); }
  });

  function applyUndergrowthOperation(operation = {}) {
    if (!state.document) throw new Error('bsb_undergrowth_authoring_document_unavailable');
    const selectedId = state.selectedRecord?.kind === 'sceneObject'
      && isBsbV2UndergrowthRecord(findRecord(state.document, 'sceneObject', state.selectedRecord.id))
      ? state.selectedRecord.id
      : null;
    const request = { ...operation, undergrowthId: operation.undergrowthId ?? operation.id ?? selectedId };
    const result = applyBsbV2UndergrowthOperation(state.document, request);
    state.document = result.document;
    const affectedId = result.affectedIds.at(-1) ?? null;
    if (affectedId) state.selectedRecord = { kind: 'sceneObject', id: affectedId };
    state.saveReceipt = null;
    state.bakeReceipt = null;
    markDirty();
    const receipt = {
      ok: true,
      applied: true,
      contract: result.contract,
      operation: result.operation,
      affectedIds: [...result.affectedIds],
      beforeRevision: result.beforeRevision,
      afterRevision: result.afterRevision,
      authoringPath: state.authoringPath,
      runtimeStatus: classifyBsbV2RuntimeFreshness(state),
      source: 'EDITOR.procedural.undergrowth'
    };
    try { window.EDITOR?.events?.emit?.('undergrowth:operationApplied', cloneRecord(receipt)); } catch (_) {}
    return receipt;
  }

  function updateSelectedUndergrowthField(field, value) {
    return applyUndergrowthOperation({ op: 'patch', patch: { [field]: value } });
  }

  function operateSelectedUndergrowth(op, value = null) {
    const operation = { op };
    if (value != null && value !== '') {
      if (op === 'age' || op === 'make_wild') operation.years = Number(value);
      else if (op === 'damage' || op === 'regrow') operation.amount = Number(value);
      else if (op === 'set_species') operation.species = value;
      else if (op === 'set_height') operation.heightMeters = Number(value);
      else if (op === 'set_spread') operation.spreadMeters = Number(value);
      else if (op === 'set_density') operation.density = Number(value);
    }
    return applyUndergrowthOperation(operation);
  }

  const undergrowthApi = Object.freeze({
    contract: BSB_V2_UNDERGROWTH_OPERATION_CONTRACT,
    catalogue() {
      return {
        contract: BSB_V2_UNDERGROWTH_DNA_CONTRACT,
        species: BSB_V2_UNDERGROWTH_SPECIES_OPTIONS.map(([id, label]) => ({ id, label })),
        seasons: [...BSB_V2_UNDERGROWTH_SEASONS],
        operations: ['create', 'set_species', 'set_height', 'set_spread', 'set_density', 'randomise', 'age', 'damage', 'regrow', 'make_wild', 'make_undergrowth_wild', 'patch'],
        brush: {
          configContract: BSB_V2_UNDERGROWTH_BRUSH_CONFIG_CONTRACT,
          previewContract: BSB_V2_UNDERGROWTH_BRUSH_PREVIEW_CONTRACT,
          receiptContract: BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT,
          operations: ['preview', 'commit', 'undo']
        }
      };
    },
    get(undergrowthId = null) {
      if (!state.document) return null;
      const id = undergrowthId ?? (state.selectedRecord?.kind === 'sceneObject' ? state.selectedRecord.id : null);
      const record = state.document.sceneObjects.find((entry) => entry.id === id && isBsbV2UndergrowthRecord(entry));
      return record ? cloneRecord(record) : null;
    },
    create(options = {}) { return applyUndergrowthOperation({ ...options, op: 'create' }); },
    setSpecies(undergrowthId, species) { return applyUndergrowthOperation({ op: 'set_species', undergrowthId, species }); },
    setHeight(undergrowthId, heightMeters) { return applyUndergrowthOperation({ op: 'set_height', undergrowthId, heightMeters }); },
    setSpread(undergrowthId, spreadMeters) { return applyUndergrowthOperation({ op: 'set_spread', undergrowthId, spreadMeters }); },
    setDensity(undergrowthId, density) { return applyUndergrowthOperation({ op: 'set_density', undergrowthId, density }); },
    randomise(undergrowthId, options = {}) { return applyUndergrowthOperation({ ...options, op: 'randomise', undergrowthId }); },
    randomize(undergrowthId, options = {}) { return applyUndergrowthOperation({ ...options, op: 'randomise', undergrowthId }); },
    age(undergrowthId, years = 1) { return applyUndergrowthOperation({ op: 'age', undergrowthId, years }); },
    damage(undergrowthId, amount = 0.2) { return applyUndergrowthOperation({ op: 'damage', undergrowthId, amount }); },
    regrow(undergrowthId, amount = 0.24) { return applyUndergrowthOperation({ op: 'regrow', undergrowthId, amount }); },
    makeWild(undergrowthId, years = 4) { return applyUndergrowthOperation({ op: 'make_wild', undergrowthId, years }); },
    makeAllWild(options = {}) { return applyUndergrowthOperation({ ...options, op: 'make_undergrowth_wild', scope: 'all' }); },
    brush: Object.freeze({
      contract: BSB_V2_UNDERGROWTH_BRUSH_RECEIPT_CONTRACT,
      preview(strokeCenters, configuration = state.undergrowthBrushConfig) { return previewUndergrowthBrush(strokeCenters, configuration); },
      commit(preview) { return applyUndergrowthBrushBatch(preview); },
      undo(receipt = state.undergrowthBrushLastPaintReceipt) { return undoUndergrowthBrushBatch(receipt); },
      status() {
        return {
          config: cloneRecord(state.undergrowthBrushConfig),
          preview: state.undergrowthBrushPreview ? cloneRecord(state.undergrowthBrushPreview) : null,
          lastReceipt: state.undergrowthBrushLastReceipt ? cloneRecord(state.undergrowthBrushLastReceipt) : null,
          canUndo: canUndoUndergrowthBrush()
        };
      }
    }),
    applyOperation(operation) { return applyUndergrowthOperation(operation); }
  });

  function applyGeologyOperation(operation = {}) {
    if (!state.document) throw new Error('bsb_geology_authoring_document_unavailable');
    const selectedId = state.selectedRecord?.kind === 'sceneObject'
      && isBsbV2GeologyRecord(findRecord(state.document, 'sceneObject', state.selectedRecord.id))
      ? state.selectedRecord.id
      : null;
    const request = { ...operation, geologyId: operation.geologyId ?? operation.id ?? selectedId };
    const result = applyBsbV2GeologyOperation(state.document, request);
    state.document = result.document;
    const affectedId = result.affectedIds.at(-1) ?? null;
    if (affectedId) state.selectedRecord = { kind: 'sceneObject', id: affectedId };
    state.saveReceipt = null;
    state.bakeReceipt = null;
    markDirty();
    const receipt = {
      ok: true,
      applied: true,
      contract: result.contract,
      operation: result.operation,
      affectedIds: [...result.affectedIds],
      requestedCount: result.requestedCount,
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      beforeRevision: result.beforeRevision,
      afterRevision: result.afterRevision,
      authoringPath: state.authoringPath,
      runtimeStatus: classifyBsbV2RuntimeFreshness(state),
      source: 'EDITOR.procedural.geology'
    };
    try { window.EDITOR?.events?.emit?.('geology:operationApplied', cloneRecord(receipt)); } catch (_) {}
    return receipt;
  }

  function updateSelectedGeologyField(field, value) {
    return applyGeologyOperation({ op: 'patch', patch: { [field]: value } });
  }

  function operateSelectedGeology(op, value = null) {
    const operation = { op };
    if (value != null && value !== '') {
      if (op === 'set_formation') operation.formation = value;
      else if (op === 'set_scale') operation.scale = Number(value);
      else if (['erode', 'fracture', 'moss', 'weather'].includes(op)) operation.amount = Number(value);
    }
    return applyGeologyOperation(operation);
  }

  const geologyApi = Object.freeze({
    contract: BSB_V2_GEOLOGY_OPERATION_CONTRACT,
    catalogue() {
      return {
        contract: BSB_V2_GEOLOGY_DNA_CONTRACT,
        formations: BSB_V2_GEOLOGY_RECIPE_OPTIONS.map(([id, label]) => ({ id, label })),
        operations: ['create', 'create_cluster', 'set_formation', 'set_scale', 'randomise', 'erode', 'fracture', 'moss', 'weather', 'patch']
      };
    },
    get(geologyId = null) {
      if (!state.document) return null;
      const id = geologyId ?? (state.selectedRecord?.kind === 'sceneObject' ? state.selectedRecord.id : null);
      const record = state.document.sceneObjects.find((entry) => entry.id === id && isBsbV2GeologyRecord(entry));
      return record ? cloneRecord(record) : null;
    },
    list() {
      if (!state.document) return [];
      return state.document.sceneObjects
        .filter(isBsbV2GeologyRecord)
        .map((record) => cloneRecord(record));
    },
    create(options = {}) { return applyGeologyOperation({ ...options, op: 'create' }); },
    createCluster(options = {}) { return applyGeologyOperation({ ...options, op: 'create_cluster' }); },
    setFormation(geologyId, formation) { return applyGeologyOperation({ op: 'set_formation', geologyId, formation }); },
    setScale(geologyId, scale) { return applyGeologyOperation({ op: 'set_scale', geologyId, scale }); },
    randomise(geologyId, options = {}) { return applyGeologyOperation({ ...options, op: 'randomise', geologyId }); },
    randomize(geologyId, options = {}) { return applyGeologyOperation({ ...options, op: 'randomise', geologyId }); },
    erode(geologyId, amount = 0.18) { return applyGeologyOperation({ op: 'erode', geologyId, amount }); },
    fracture(geologyId, amount = 0.2) { return applyGeologyOperation({ op: 'fracture', geologyId, amount }); },
    moss(geologyId, amount = 0.2) { return applyGeologyOperation({ op: 'moss', geologyId, amount }); },
    weather(geologyId, amount = 0.18) { return applyGeologyOperation({ op: 'weather', geologyId, amount }); },
    applyOperation(operation) { return applyGeologyOperation(operation); }
  });

  function applyTransitionSequenceOperation(operation = {}) {
    if (!state.document) throw new Error('bsb_transition_sequence_authoring_document_unavailable');
    const result = applyBsbV2TransitionSequenceRecordOperation(state.document, operation);
    state.document = validateBsbV2AuthoringDocument(result.document);
    state.saveReceipt = null;
    state.bakeReceipt = null;
    markDirty();
    const receipt = {
      ok: true,
      applied: true,
      contract: result.contract,
      operation: result.operation,
      affectedIds: [...result.affectedIds],
      beforeRevision: result.beforeRevision,
      afterRevision: result.afterRevision,
      authoringPath: state.authoringPath,
      runtimeStatus: classifyBsbV2RuntimeFreshness(state),
      source: 'EDITOR.scenes.transitions'
    };
    try { window.EDITOR?.events?.emit?.('sceneSequence:operationApplied', cloneRecord(receipt)); } catch (_) {}
    return receipt;
  }

  function updateTransitionSequencePhase(sequenceId, phaseId, durationSeconds) {
    return applyTransitionSequenceOperation({ op: 'set_phase_duration', sequenceId, phaseId, durationSeconds: Number(durationSeconds) });
  }

  function updateTransitionSequenceLanding(sequenceId, axis, value) {
    const sequence = state.document?.sceneSequences?.find((entry) => entry.id === sequenceId);
    if (!sequence) throw new Error(`bsb_transition_sequence_missing:${sequenceId}`);
    return applyTransitionSequenceOperation({
      op: 'set_landing_anchor',
      sequenceId,
      x: axis === 'x' ? Number(value) : sequence.landing.anchor.x,
      y: axis === 'y' ? Number(value) : sequence.landing.anchor.y
    });
  }

  const transitionSequenceApi = Object.freeze({
    contract: BSB_V2_TRANSITION_SEQUENCE_OPERATION_CONTRACT,
    catalogue() {
      return {
        contract: BSB_V2_TRANSITION_SEQUENCE_CONTRACT,
        operations: ['ensure_smoke_instinct_departure', 'upsert', 'set_landing_anchor', 'set_phase_duration', 'set_smoke_threshold', 'set_actor_path', 'remove']
      };
    },
    list() { return cloneRecord(state.document?.sceneSequences ?? []); },
    get(sequenceId = SMOKE_INSTINCT_DEPARTURE_ID) {
      const sequence = state.document?.sceneSequences?.find((entry) => entry.id === sequenceId);
      return sequence ? cloneRecord(sequence) : null;
    },
    parseCommand(text) { return parseBsbV2TransitionSequenceCommand(text); },
    interpretProposal(proposal) { return normalizeBsbV2TransitionSequenceIntentProposal(proposal); },
    applyOperation(operation) { return applyTransitionSequenceOperation(operation); }
  });

  function removeRecord(kind, id) {
    if (!state.document) return;
    const field = kind === 'sceneObject' ? 'sceneObjects' : kind === 'unit' ? 'unitPlacements' : 'unitSpawners';
    state.document[field] = state.document[field].filter((entry) => entry.id !== id);
    if (state.selectedRecord?.kind === kind && state.selectedRecord?.id === id) state.selectedRecord = null;
    state.document.revision += 1;
    state.document.updatedAt = new Date().toISOString();
    markDirty();
  }

  function selectPlacedRecord(tool, x, y) {
    if (!tool || !state.document) return;
    const kind = tool.kind === 'sceneObject' ? 'sceneObject' : tool.kind === 'unit' ? 'unit' : tool.kind === 'spawner' ? 'spawner' : null;
    if (!kind) return;
    const collection = recordCollection(kind);
    const record = [...state.document[collection.field]].reverse().find((entry) => entry.type === tool.value && entry.x === x && entry.y === y);
    if (record) state.selectedRecord = { kind, id: record.id };
  }

  function markDirty(renderPanel = true) {
    state.dirty = true;
    state.status = 'dirty';
    state.error = null;
    state.saveReceipt = null;
    state.bakeReceipt = null;
    state.runtimeVerification = { status: 'stale', error: null, mismatches: ['authoring_changed_after_last_bake'] };
    draw();
    if (renderPanel) render();
    else updateStageReadout();
  }

  function onPointerDown(event) {
    if (!state.active || state.view !== 'author') return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      state.panning = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      event.currentTarget.classList.add('panning');
      state.painting = false;
      state.lastPaintKey = null;
      event.preventDefault();
      return;
    }
    if (state.inputOwner === 'diary') {
      state.painting = false;
      state.lastPaintKey = null;
      captureDiaryAnchor(pointerTile(event), { source: 'map_viewport_click' });
      event.preventDefault();
      return;
    }
    if (state.inputOwner !== 'forge') {
      state.painting = false;
      state.lastPaintKey = null;
      selectRecordAtTile(pointerTile(event));
      event.preventDefault();
      return;
    }
    state.painting = true;
    state.lastPaintKey = null;
    if (isUndergrowthBrushActive()) {
      appendUndergrowthBrushCenter(pointerTile(event), true);
      draw();
    } else {
      applyPointer(event);
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (state.panning && state.canvasLayout && state.document) {
      const canvas = document.getElementById('bsb-v2-map-canvas');
      const bounds = canvas.getBoundingClientRect();
      state.viewport = panBsbV2MapViewport(
        state.document,
        state.viewport,
        state.canvasLayout,
        event.clientX - state.panning.clientX,
        event.clientY - state.panning.clientY,
        bounds.width,
        bounds.height
      );
      state.panning.clientX = event.clientX;
      state.panning.clientY = event.clientY;
      state.hoverTile = null;
      draw();
      return;
    }
    const previousHover = state.hoverTile;
    const tile = pointerTile(event);
    state.hoverTile = tile;
    if (state.painting) {
      const tool = TOOL_BY_ID.get(state.selectedToolId);
      if (isUndergrowthBrushActive()) appendUndergrowthBrushCenter(tile);
      else if (tool?.kind === 'terrain' || tool?.kind === 'erase') applyPointer(event);
    } else if (
      isUndergrowthBrushActive()
      && state.undergrowthBrushStroke.length === 0
      && (previousHover?.x !== tile?.x || previousHover?.y !== tile?.y)
    ) {
      rebuildUndergrowthBrushPreview();
    }
    draw();
  }

  function onPointerLeave() {
    state.hoverTile = null;
    if (isUndergrowthBrushActive() && state.undergrowthBrushStroke.length === 0) state.undergrowthBrushPreview = null;
    draw();
  }

  function onPointerUp() {
    if (state.panning) {
      state.panning = null;
      document.getElementById('bsb-v2-map-canvas')?.classList.remove('panning');
      draw();
      return;
    }
    if (!state.painting) return;
    state.painting = false;
    state.lastPaintKey = null;
    render();
  }

  function onWheel(event) {
    if (!state.active || state.view !== 'author' || !state.document || !state.canvasLayout) return;
    event.preventDefault();
    const canvas = document.getElementById('bsb-v2-map-canvas');
    const bounds = canvas.getBoundingClientRect();
    state.viewport = zoomBsbV2MapViewport(
      state.document,
      state.viewport,
      state.canvasLayout,
      state.viewport.zoom * (event.deltaY < 0 ? 1.25 : 0.8),
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      bounds.width,
      bounds.height
    );
    draw();
  }

  function applyPointer(event) {
    const tile = pointerTile(event);
    if (!tile) return;
    const key = `${tile.x},${tile.y}`;
    if (key === state.lastPaintKey) return;
    state.lastPaintKey = key;
    applyAt(tile.x, tile.y);
  }

  function recordAtTile(tile) {
    if (!tile || !state.document) return null;
    const records = [
      ...state.document.sceneObjects.map((record) => ({ kind: 'sceneObject', record })),
      ...state.document.unitPlacements.map((record) => ({ kind: 'unit', record })),
      ...state.document.unitSpawners.map((record) => ({ kind: 'spawner', record }))
    ];
    return [...records].reverse().find((item) => item.record.x === tile.x && item.record.y === tile.y) || null;
  }

  function selectRecordAtTile(tile) {
    const hit = recordAtTile(tile);
    if (hit) state.selectedRecord = { kind: hit.kind, id: hit.record.id };
    draw();
    render();
    return hit;
  }

  function captureDiaryAnchor(tile, options = {}) {
    if (!tile || !state.document) return null;
    const hit = recordAtTile(tile);
    if (hit) state.selectedRecord = { kind: hit.kind, id: hit.record.id };
    const anchor = {
      schema: 'axiom.project-diary.spatial-anchor.v0',
      surfaceId: BSB_V2_AUTHORING_SURFACE_ID,
      catalogueMapId: state.activeCatalogueMapId,
      mapId: state.document.mapId,
      tile: { x: tile.x, y: tile.y },
      selection: hit ? { kind: hit.kind, id: hit.record.id } : (state.selectedRecord ? cloneRecord(state.selectedRecord) : null),
      viewport: { zoom: state.viewport.zoom, centerX: state.viewport.centerX, centerY: state.viewport.centerY },
      source: options.source || 'diary_context_pin',
      capturedAt: new Date().toISOString()
    };
    state.diaryAnchor = anchor;
    draw();
    render();
    try { window.EDITOR?.events?.emit?.('diary:spatialAnchorChanged', { anchor: cloneRecord(anchor), source: anchor.source }); } catch (_) {}
    notify('info', `Diary context pinned at ${tile.x},${tile.y}${hit ? ` · ${hit.record.type}` : ''}.`);
    return cloneRecord(anchor);
  }

  async function focusContext(context = {}, options = {}) {
    const targetCatalogueMapId = context.catalogueMapId || context.scene?.catalogueMapId || null;
    if (targetCatalogueMapId && targetCatalogueMapId !== state.activeCatalogueMapId) {
      const switched = await selectRegion(targetCatalogueMapId);
      if (switched?.error) return switched;
    }
    setView('author');
    const selection = context.selection || context.scene?.selection || null;
    if (selection?.kind && selection?.id) selectRecord(selection.kind, selection.id);
    const anchor = context.spatialAnchor || context.anchor || null;
    if (anchor?.tile && state.document) {
      state.diaryAnchor = cloneRecord(anchor);
      state.viewport = {
        ...state.viewport,
        zoom: Math.max(2, Number(state.viewport.zoom || 1)),
        centerX: Number(anchor.tile.x) + 0.5,
        centerY: Number(anchor.tile.y) + 0.5
      };
    }
    setInputOwner(options.inputOwner || 'forge', { source: options.source || 'diary_focus_handoff', force: true });
    draw();
    render();
    return status();
  }

  function pointerTile(event) {
    const canvas = document.getElementById('bsb-v2-map-canvas');
    const layout = state.canvasLayout;
    if (!canvas || !layout) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left - layout.offsetX) / layout.cell);
    const y = Math.floor((event.clientY - bounds.top - layout.offsetY) / layout.cell);
    if (x < 0 || y < 0 || x >= state.document.width || y >= state.document.height) return null;
    return { x, y };
  }

  function draw() {
    const canvas = document.getElementById('bsb-v2-map-canvas');
    if (!canvas || !state.document || canvas.closest('[hidden]')) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.floor(bounds.width * dpr);
    const height = Math.floor(bounds.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, bounds.width, bounds.height);
    const layout = resolveBsbV2MapCanvasLayout(state.document, state.viewport, bounds.width, bounds.height);
    state.viewport = layout.viewport;
    const { cell, mapWidth, mapHeight, offsetX, offsetY } = layout;
    state.canvasLayout = layout;
    ctx.fillStyle = '#060708';
    ctx.fillRect(0, 0, bounds.width, bounds.height);
    const visible = layout.visibleTiles;
    for (let y = visible.minY; y <= visible.maxY; y += 1) {
      for (let x = visible.minX; x <= visible.maxX; x += 1) {
        ctx.fillStyle = TERRAIN[state.document.tiles[y][x]].color;
        ctx.fillRect(offsetX + x * cell, offsetY + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    if (cell >= 7) {
      ctx.strokeStyle = 'rgba(255,255,255,.055)';
      ctx.lineWidth = 1;
      for (let x = visible.minX; x <= Math.min(state.document.width, visible.maxX + 1); x += 1) {
        ctx.beginPath(); ctx.moveTo(offsetX + x * cell, offsetY); ctx.lineTo(offsetX + x * cell, offsetY + mapHeight); ctx.stroke();
      }
      for (let y = visible.minY; y <= Math.min(state.document.height, visible.maxY + 1); y += 1) {
        ctx.beginPath(); ctx.moveTo(offsetX, offsetY + y * cell); ctx.lineTo(offsetX + mapWidth, offsetY + y * cell); ctx.stroke();
      }
    }
    drawEscape(ctx, state.document.escapeZone, offsetX, offsetY, cell);
    drawMarker(ctx, state.document.spawn.x, state.document.spawn.y, offsetX, offsetY, cell, '#6ee7ff', 'P');
    state.document.sceneObjects.forEach((entry) => drawRecordMarker(ctx, entry, 'sceneObject', offsetX, offsetY, cell));
    state.document.unitPlacements.forEach((entry) => drawRecordMarker(ctx, entry, 'unit', offsetX, offsetY, cell));
    state.document.unitSpawners.forEach((entry) => drawRecordMarker(ctx, entry, 'spawner', offsetX, offsetY, cell));
    if (state.undergrowthBrushPreview) drawUndergrowthBrushPreview(ctx, state.undergrowthBrushPreview, offsetX, offsetY, cell);
    const selected = selectedRecordData();
    if (selected) drawSelectedRecord(ctx, selected.record, offsetX, offsetY, cell);
    if (state.hoverTile) {
      ctx.strokeStyle = '#bff7ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX + state.hoverTile.x * cell + 1, offsetY + state.hoverTile.y * cell + 1, Math.max(1, cell - 2), Math.max(1, cell - 2));
    }
    if (state.diaryAnchor?.tile && state.diaryAnchor.catalogueMapId === state.activeCatalogueMapId) {
      const anchorX = offsetX + (state.diaryAnchor.tile.x + 0.5) * cell;
      const anchorY = offsetY + (state.diaryAnchor.tile.y + 0.5) * cell;
      ctx.save();
      ctx.strokeStyle = '#ffd27a';
      ctx.fillStyle = 'rgba(255, 210, 122, .14)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(anchorX, anchorY, Math.max(6, Math.min(18, cell * 0.72)), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    updateStageReadout();
    publishWorkspaceState('viewport_or_authoring_state_changed');
  }

  function workspaceState() {
    return {
      contract: BSB_V2_AUTHORING_CONTRACT,
      active: state.active,
      status: state.status,
      error: state.error,
      dirty: state.dirty,
      runtimeStatus: classifyBsbV2RuntimeFreshness(state),
      sceneId: state.document?.scenarioId || null,
      mapId: state.document?.mapId || null,
      catalogueMapId: state.activeCatalogueMapId,
      revision: state.document?.revision ?? null,
      proceduralTrees: state.document ? {
        contract: BSB_V2_TREE_DNA_CONTRACT,
        count: state.document.sceneObjects.filter(isBsbV2TreeRecord).length
      } : null,
      proceduralUndergrowth: state.document ? {
        contract: BSB_V2_UNDERGROWTH_DNA_CONTRACT,
        count: state.document.sceneObjects.filter(isBsbV2UndergrowthRecord).length
      } : null,
      transitionSequences: state.document ? {
        contract: BSB_V2_TRANSITION_SEQUENCE_CONTRACT,
        count: state.document.sceneSequences.length,
        ids: state.document.sceneSequences.map((entry) => entry.id)
      } : null,
      undergrowthBrush: {
        active: isUndergrowthBrushActive(),
        previewCount: state.undergrowthBrushPreview?.candidates.length ?? 0,
        blockedCount: state.undergrowthBrushPreview?.diagnostics.blocked ?? 0,
        canUndo: canUndoUndergrowthBrush()
      },
      selection: state.selectedRecord ? cloneRecord(state.selectedRecord) : null,
      inputOwner: state.inputOwner,
      diaryAnchor: state.diaryAnchor ? cloneRecord(state.diaryAnchor) : null,
      authoringPath: state.authoringPath,
      bakedMapPath: state.publication?.runtimePath ?? null,
      mapManifestPath: state.workspaceBinding?.scene?.manifestPath || BSB_V2_MAP_MANIFEST_PATH,
      binding: state.workspaceBinding ? cloneRecord(state.workspaceBinding) : null,
      project: state.workspaceProject ? cloneRecord(state.workspaceProject) : null,
      viewport: {
        zoom: state.viewport?.zoom ?? 1,
        centerX: state.viewport?.centerX ?? null,
        centerY: state.viewport?.centerY ?? null,
        visibleTiles: state.canvasLayout?.visibleTiles ? cloneRecord(state.canvasLayout.visibleTiles) : null,
        controls: ['input_owner_guard', 'diary_pin_click', 'forge_author_click', 'undergrowth_preview_commit_undo', 'wheel_zoom', 'middle_right_or_shift_drag_pan', 'fit_home', 'resize_observer']
      },
      saveReceipt: state.saveReceipt ? cloneRecord(state.saveReceipt) : null,
      bakeReceipt: state.bakeReceipt ? cloneRecord(state.bakeReceipt) : null,
      runtimeVerification: state.runtimeVerification ? cloneRecord(state.runtimeVerification) : null
    };
  }

  function publishWorkspaceState(reason = 'authoring_state_changed') {
    const surfaceState = workspaceState();
    const fingerprint = JSON.stringify({
      active: surfaceState.active,
      status: surfaceState.status,
      error: surfaceState.error,
      dirty: surfaceState.dirty,
      runtimeStatus: surfaceState.runtimeStatus,
      mapId: surfaceState.mapId,
      catalogueMapId: surfaceState.catalogueMapId,
      revision: surfaceState.revision,
      selection: surfaceState.selection,
      inputOwner: surfaceState.inputOwner,
      undergrowthBrush: surfaceState.undergrowthBrush,
      diaryAnchor: surfaceState.diaryAnchor,
      authoringPath: surfaceState.authoringPath,
      bakedMapPath: surfaceState.bakedMapPath,
      zoom: surfaceState.viewport.zoom,
      visibleTiles: surfaceState.viewport.visibleTiles
    });
    if (fingerprint === state.lastWorkspaceFingerprint) return surfaceState;
    state.lastWorkspaceFingerprint = fingerprint;
    try { window.EDITOR?.events?.emit?.('workspace:surfaceStateChanged', { reason, surfaceId: BSB_V2_AUTHORING_SURFACE_ID, state: surfaceState }); } catch (_) {}
    return surfaceState;
  }

  function render() {
    if (!state.active) return;
    ensureWorkspace();
    const root = document.getElementById('bsb-map-panel');
    if (!root) return;
    const doc = state.document;
    const tool = TOOL_BY_ID.get(state.selectedToolId);
    const resize = state.resizeReceipt;
    const workspaceContext = readWorkspaceContext(false);
    const records = doc ? [
      ...doc.sceneObjects.map((entry) => ({ ...entry, kind: 'sceneObject' })),
      ...doc.unitPlacements.map((entry) => ({ ...entry, kind: 'unit' })),
      ...doc.unitSpawners.map((entry) => ({ ...entry, kind: 'spawner' }))
    ] : [];
    const filteredRecords = filterBsbV2AuthoringRecords(records, {
      query: state.outlinerQuery,
      kind: state.outlinerKind
    });
    root.className = 'bsb-v2-map-panel';
    root.innerHTML = `
      <div class="bsb-v2-workbench-head">
        <div><span class="bsb-v2-eyebrow">Black Sky Bound V2</span><strong>Map Forge</strong></div>
        <span class="bsb-v2-status ${statusClass()}">${escapeHtml(state.status)}</span>
        <small>Edit AXIOM source here. BSB only consumes an explicit, verified runtime bake.</small>
      </div>
      ${renderWorkspaceOwnership(workspaceContext)}
      ${state.error ? `<div class="bsb-v2-error">${escapeHtml(state.error)}</div>` : ''}
      ${doc ? `
        ${renderRegionSelector(doc)}
        ${renderAuthoringLifecycle(doc, records.length, workspaceContext)}
        ${renderTransitionSequenceEditor(doc)}
        <div class="bsb-v2-actions">
          <button class="bsb-v2-button primary" onclick="BsbV2MapAuthoring.save()" ${!state.dirty || ['saving', 'baking', 'loading'].includes(state.status) ? 'disabled' : ''}>${state.dirty ? 'Save Source' : 'Source Saved'}</button>
          <button class="bsb-v2-button accent" onclick="BsbV2MapAuthoring.bakeAndPreview()" ${['saving', 'baking', 'loading'].includes(state.status) ? 'disabled' : ''}>Bake & Preview</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.load()" ${['saving', 'baking', 'loading'].includes(state.status) ? 'disabled' : ''}>Reload Saved</button>
        </div>
        <div class="bsb-v2-field bsb-v2-title-field"><label>Map title</label><input value="${escapeAttr(doc.title)}" onchange="BsbV2MapAuthoring.updateTitle(this.value)"></div>
        <details class="bsb-v2-card">
          <summary>Map bounds · ${doc.width}×${doc.height}</summary>
          <div class="bsb-v2-resize-grid">
            <label>Width<input id="bsb-v2-resize-width" type="number" min="${doc.width}" max="${BSB_V2_MAP_SIZE_LIMITS.max}" step="1" value="${doc.width}"></label>
            <label>Height<input id="bsb-v2-resize-height" type="number" min="${doc.height}" max="${BSB_V2_MAP_SIZE_LIMITS.max}" step="1" value="${doc.height}"></label>
            <button class="bsb-v2-button primary" onclick="BsbV2MapAuthoring.resizeMapFromUI()">Expand · centre</button>
          </div>
          <div class="bsb-v2-muted">Growth only · centre anchored · new cells use grass. Reload Saved discards an unsaved expansion.</div>
          ${resize ? `<div class="bsb-v2-resize-receipt">${resize.from.width}×${resize.from.height} → ${resize.to.width}×${resize.to.height} · offset +${resize.offset.x},+${resize.offset.y} · ${resize.preserved.tiles} tiles preserved</div>` : ''}
        </details>
        ${renderToolPalette(tool)}
        ${renderRecordInspector(doc)}
        <details class="bsb-v2-card" ${records.length ? 'open' : ''}>
          <summary>Outliner · <span id="bsb-v2-outliner-count">${filteredRecords.length === records.length ? records.length : `${filteredRecords.length}/${records.length}`}</span></summary>
          <div class="bsb-v2-outliner-controls">
            <input id="bsb-v2-outliner-query" type="search" value="${escapeAttr(state.outlinerQuery)}" placeholder="Find type, label, id, or tile…" aria-label="Filter authored records" oninput="BsbV2MapAuthoring.setOutlinerQuery(this.value)">
            <select id="bsb-v2-outliner-kind" aria-label="Filter authored record kind" onchange="BsbV2MapAuthoring.setOutlinerKind(this.value)">
              ${[['all', 'All'], ['sceneObject', 'Scenery'], ['unit', 'Units'], ['spawner', 'Spawners']].map(([id, label]) => `<option value="${id}" ${state.outlinerKind === id ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          <div id="bsb-v2-outliner-results" class="bsb-v2-outliner">${renderOutlinerRows(filteredRecords)}</div>
        </details>
        <details class="bsb-v2-provenance">
          <summary>Paths & receipts</summary>
          <div class="bsb-v2-receipt">Source: ${escapeHtml(state.authoringPath)} · ${doc.width}×${doc.height}${state.saveReceipt?.afterHash ? ` · saved ${escapeHtml(state.saveReceipt.afterHash.slice(0, 8))}` : ''}</div>
          <div class="bsb-v2-receipt">Bake: ${escapeHtml(state.publication?.runtimePath || `${BSB_V2_MAP_MANIFEST_PATH} (resolved on bake)`)} · ${doc.width}×${doc.height}${state.bakeReceipt?.afterHash ? ` · baked ${escapeHtml(state.bakeReceipt.afterHash.slice(0, 8))}` : ''}</div>
        </details>
      ` : '<div class="bsb-v2-card"><div class="bsb-v2-muted">Loading the canonical AXIOM authoring document…</div></div>'}`;
    setView(state.view);
    draw();
  }

  function renderTransitionSequenceEditor(doc) {
    const sequence = doc.sceneSequences.find((entry) => entry.id === doc.transitions?.escapeZone?.departureSequenceId)
      ?? doc.sceneSequences[0]
      ?? null;
    if (!sequence) {
      return `<details class="bsb-v2-card"><summary>Scene transition · none authored</summary>
        <div class="bsb-v2-muted">Author impact, actor paths, and cover timing before a map handoff.</div>
        <button class="bsb-v2-button primary" onclick="BsbV2MapAuthoring.applyTransitionSequenceOperation({op:'ensure_smoke_instinct_departure'})">Author smoke instinct departure</button>
      </details>`;
    }
    const phase = (id) => sequence.phases.find((entry) => entry.id === id);
    return `<details class="bsb-v2-card" open data-scene-sequence-id="${escapeAttr(sequence.id)}">
      <summary>Scene transition · ${escapeHtml(sequence.label)}</summary>
      <div class="bsb-v2-muted">${sequence.actorTracks.length} authored actors · ${escapeHtml(sequence.landing.debris.direction.replaceAll('_', ' '))} · handoff at ${Math.round(sequence.smoke.coverageThreshold * 100)}% smoke</div>
      <div class="bsb-v2-resize-grid">
        <label>Landing X<input type="number" step="0.1" value="${sequence.landing.anchor.x}" onchange="BsbV2MapAuthoring.updateTransitionSequenceLanding('${escapeAttr(sequence.id)}','x',this.value)"></label>
        <label>Landing Y<input type="number" step="0.1" value="${sequence.landing.anchor.y}" onchange="BsbV2MapAuthoring.updateTransitionSequenceLanding('${escapeAttr(sequence.id)}','y',this.value)"></label>
        <label>Impact s<input type="number" min="0.1" max="30" step="0.05" value="${phase('impact').durationSeconds}" onchange="BsbV2MapAuthoring.updateTransitionSequencePhase('${escapeAttr(sequence.id)}','impact',this.value)"></label>
        <label>Charge s<input type="number" min="0.1" max="30" step="0.05" value="${phase('raider_charge').durationSeconds}" onchange="BsbV2MapAuthoring.updateTransitionSequencePhase('${escapeAttr(sequence.id)}','raider_charge',this.value)"></label>
        <label>Smoke s<input type="number" min="0.1" max="30" step="0.05" value="${phase('smoke_cover').durationSeconds}" onchange="BsbV2MapAuthoring.updateTransitionSequencePhase('${escapeAttr(sequence.id)}','smoke_cover',this.value)"></label>
      </div>
      <div class="bsb-v2-muted">Actors: ${sequence.actorTracks.map((entry) => escapeHtml(entry.actorId)).join(' · ')}</div>
    </details>`;
  }

  function renderOutlinerRows(records) {
    return records.map((entry) => {
      const visual = describeBsbV2AuthoringRecord(entry.kind, entry);
      return `
        <div class="bsb-v2-outliner-row ${state.selectedRecord?.kind === entry.kind && state.selectedRecord?.id === entry.id ? 'active' : ''}">
          <button class="bsb-v2-outliner-select" onclick="BsbV2MapAuthoring.selectRecord('${entry.kind}','${escapeAttr(entry.id)}')">
            <i class="bsb-v2-outliner-icon" style="--marker-color:${escapeAttr(visual.color)}">${escapeHtml(visual.glyph)}</i>
            <span class="bsb-v2-outliner-copy"><span>${escapeHtml(entry.label || entry.type)} · ${entry.x},${entry.y}</span><small>${escapeHtml(entry.kind)} · ${escapeHtml(entry.type)}</small></span>
          </button>
          <button class="bsb-v2-outliner-remove" title="Remove" onclick="BsbV2MapAuthoring.removeRecord('${entry.kind}','${escapeAttr(entry.id)}')">×</button>
        </div>`;
    }).join('') || '<div class="bsb-v2-muted">No authored records match this filter.</div>';
  }

  function refreshOutliner() {
    if (!state.document) return status();
    const records = [
      ...state.document.sceneObjects.map((entry) => ({ ...entry, kind: 'sceneObject' })),
      ...state.document.unitPlacements.map((entry) => ({ ...entry, kind: 'unit' })),
      ...state.document.unitSpawners.map((entry) => ({ ...entry, kind: 'spawner' }))
    ];
    const filtered = filterBsbV2AuthoringRecords(records, {
      query: state.outlinerQuery,
      kind: state.outlinerKind
    });
    const count = document.getElementById('bsb-v2-outliner-count');
    const results = document.getElementById('bsb-v2-outliner-results');
    if (count) count.textContent = filtered.length === records.length ? String(records.length) : `${filtered.length}/${records.length}`;
    if (results) results.innerHTML = renderOutlinerRows(filtered);
    return status();
  }

  function renderWorkspaceOwnership(context) {
    const project = context?.project || state.workspaceProject || {};
    const connections = context?.connections || {};
    const connectionStates = [
      ['SSE', connections.sse?.state || 'unknown'],
      ['MCP', connections.mcp?.state || 'unknown'],
      ['Model', connections.localModel?.state || 'unknown']
    ];
    return `<div class="bsb-v2-project-summary" aria-label="Active AXIOM workspace ownership">
      <div class="bsb-v2-project-identity"><span>Active project</span><b>${escapeHtml(project.name || project.id || 'Unavailable')}</b><small>${escapeHtml(project.root || 'root unavailable')}</small></div>
      <div class="bsb-v2-connection-row">${connectionStates.map(([label, value]) => `<span class="bsb-v2-connection ${['live', 'ready'].includes(value) ? 'good' : ['failed', 'disconnected'].includes(value) ? 'bad' : 'warn'}">${escapeHtml(label)} ${escapeHtml(value)}</span>`).join('')}</div>
    </div>`;
  }

  function renderAuthoringLifecycle(doc, recordCount, context) {
    const sourceStatus = state.dirty ? 'unsaved changes' : state.status === 'new draft' ? 'new draft' : 'saved source';
    const runtimeStatus = context?.runtimeBake?.status || classifyBsbV2RuntimeFreshness(state);
    const runtimeTone = runtimeStatus === 'current' ? 'good' : runtimeStatus === 'failed' ? 'bad' : 'warn';
    return `<div class="bsb-v2-lifecycle" aria-label="Authoring publication lifecycle">
      <div class="bsb-v2-lifecycle-step ${state.dirty ? 'warn' : 'good'}">
        <span>1 · Authoring source</span><b>${escapeHtml(sourceStatus)}</b><small>rev ${doc.revision} · ${doc.width}×${doc.height}</small>
      </div>
      <span class="bsb-v2-lifecycle-arrow" aria-hidden="true">→</span>
      <div class="bsb-v2-lifecycle-step ${runtimeTone}">
        <span>2 · BSB runtime</span><b>${escapeHtml(runtimeStatus)}</b><small>${recordCount} authored · ${state.mapLibrary?.maps?.length ?? 1} regions</small>
      </div>
    </div>`;
  }

  function renderRegionSelector(doc) {
    const maps = state.mapLibrary?.maps ?? [];
    const transition = doc.transitions?.escapeZone;
    return `<div class="bsb-v2-region-row">
      <label>Region<select id="bsb-v2-region-select" onchange="BsbV2MapAuthoring.selectRegion(this.value)">${maps.map((entry) => `
        <option value="${escapeAttr(entry.id)}" ${entry.id === state.activeCatalogueMapId ? 'selected' : ''}>${escapeHtml(entry.title)}</option>`).join('')}</select></label>
      <div class="bsb-v2-region-meta">
        <b>${escapeHtml(state.publication?.runtimeMapId || doc.mapId)}</b>
        <span>${transition ? `Escape loads ${escapeHtml(transition.label || transition.nextMapPath)}` : 'Escape completes this placeholder region'}</span>
      </div>
    </div>`;
  }

  function paletteForTool(tool) {
    if (tool?.kind === 'sceneObject') return 'objects';
    if (tool?.kind === 'unit') return 'units';
    if (['spawner', 'playerSpawn', 'escapeZone', 'erase'].includes(tool?.kind)) return 'markers';
    return 'terrain';
  }

  function renderToolPalette(activeTool) {
    const palettes = [
      ['terrain', 'Terrain', BSB_V2_AUTHORING_TOOLS.filter((entry) => entry.kind === 'terrain')],
      ['objects', 'Objects', BSB_V2_AUTHORING_TOOLS.filter((entry) => entry.kind === 'sceneObject')],
      ['units', 'Units', BSB_V2_AUTHORING_TOOLS.filter((entry) => entry.kind === 'unit')],
      ['markers', 'Spawners', BSB_V2_AUTHORING_TOOLS.filter((entry) => ['spawner', 'playerSpawn', 'escapeZone', 'erase'].includes(entry.kind))]
    ];
    const active = palettes.find(([id]) => id === state.palette) || palettes[0];
    const brushActive = isUndergrowthBrushActive();
    return `<section class="bsb-v2-palette" aria-label="Authoring tools">
      <div class="bsb-v2-palette-tabs" role="tablist">${palettes.map(([id, label]) => `<button role="tab" aria-selected="${id === active[0]}" class="${id === active[0] ? 'active' : ''}" onclick="BsbV2MapAuthoring.setPalette('${id}')">${escapeHtml(label)}</button>`).join('')}</div>
      ${state.palette === 'terrain' ? `<div class="bsb-v2-field bsb-v2-brush-field"><label>Brush · ${state.brushRadius}t</label><input aria-label="Terrain brush radius" type="range" min="0" max="8" step="1" value="${state.brushRadius}" oninput="BsbV2MapAuthoring.setBrushRadius(this.value)"></div>` : ''}
      <div class="bsb-v2-tool-grid">${active[2].map((tool) => `
      <button class="bsb-v2-tool ${state.selectedToolId === tool.id ? 'active' : ''}" onclick="BsbV2MapAuthoring.setTool('${escapeAttr(tool.id)}')">
        <span>${tool.color ? `<i style="display:inline-block;width:8px;height:8px;margin-right:5px;background:${tool.color}"></i>` : ''}${escapeHtml(tool.label)}</span><small>${escapeHtml(tool.kind)}</small>
      </button>`).join('')}</div>
      ${brushActive ? renderUndergrowthBrushControls() : ''}
      <div class="bsb-v2-active-tool"><span>Active tool</span><b>${escapeHtml(activeTool?.label || state.selectedToolId)}</b><small>${brushActive ? 'Drag on the map to shape a preview; Commit batch is the only write.' : `Click the map to ${activeTool?.kind === 'terrain' ? 'paint' : activeTool?.kind === 'erase' ? 'remove' : 'place or select'}.`}</small></div>
    </section>`;
  }

  function renderUndergrowthBrushControls() {
    const config = state.undergrowthBrushConfig;
    const preview = state.undergrowthBrushPreview;
    const candidateCount = preview?.candidates.length ?? 0;
    const blockedCount = preview?.diagnostics.blocked ?? 0;
    const isStale = preview && preview.sourceRevision !== state.document?.revision;
    const receipt = state.undergrowthBrushLastReceipt;
    return `<div class="bsb-v2-undergrowth-brush" data-preview-count="${candidateCount}">
      <div class="bsb-v2-undergrowth-brush-head">
        <div><span>Procedural paint</span><b>Undergrowth brush</b></div>
        <output id="bsb-v2-undergrowth-preview-count" class="${isStale ? 'stale' : ''}">${isStale ? 'stale' : `${candidateCount} ready`}</output>
      </div>
      <div class="bsb-v2-undergrowth-brush-readout">${preview ? `${preview.strokeCenters.length} stroke ${preview.strokeCenters.length === 1 ? 'point' : 'points'} · ${blockedCount} blocked · source rev ${preview.sourceRevision}` : 'Hover for a seeded preview, or drag to shape a stroke.'}</div>
      <div class="bsb-v2-undergrowth-brush-grid">
        ${brushRangeField('Radius', 'radiusTiles', config.radiusTiles, 1, 8, 1, `${config.radiusTiles}t`)}
        ${brushRangeField('Falloff', 'falloff', config.falloff, 0, 1, .05, `${Math.round(config.falloff * 100)}%`)}
        ${brushRangeField('Density', 'density', config.density, .05, 1, .05, `${Math.round(config.density * 100)}%`)}
      </div>
      <div class="bsb-v2-undergrowth-mix" aria-label="Undergrowth species mix">
        <span class="bsb-v2-undergrowth-section-label">Species mix</span>
        ${BSB_V2_UNDERGROWTH_BRUSH_SPECIES.map((species) => {
          const percent = Math.round(config.speciesMix[species] * 100);
          return `<label><span>${escapeHtml(BSB_V2_UNDERGROWTH_SPECIES_RECIPES[species].label)}</span><input aria-label="${escapeAttr(BSB_V2_UNDERGROWTH_SPECIES_RECIPES[species].label)} mix" type="range" min="0" max="100" step="5" value="${percent}" onchange="BsbV2MapAuthoring.setUndergrowthBrushSpeciesWeight('${species}', this.value)"><output>${percent}%</output></label>`;
        }).join('')}
      </div>
      <div class="bsb-v2-undergrowth-seed">
        <label>Seed<input aria-label="Undergrowth brush seed" type="number" min="1" max="2147483647" step="1" value="${config.seed}" onchange="BsbV2MapAuthoring.setUndergrowthBrushField('seed', this.value)"></label>
        <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.randomiseUndergrowthBrushSeed()">New seed</button>
      </div>
      <div class="bsb-v2-undergrowth-actions">
        <button id="bsb-v2-undergrowth-commit" class="bsb-v2-button accent" onclick="BsbV2MapAuthoring.commitUndergrowthBrushPreview()" ${!candidateCount || isStale ? 'disabled' : ''}>Commit ${candidateCount || ''}</button>
        <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.clearUndergrowthBrushPreview()" ${!preview ? 'disabled' : ''}>Clear</button>
        <button id="bsb-v2-undergrowth-undo" class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.undoLastUndergrowthBrush()" ${canUndoUndergrowthBrush() ? '' : 'disabled'}>Undo batch</button>
      </div>
      ${receipt ? `<div class="bsb-v2-undergrowth-receipt">${receipt.operation === 'undo' ? `${receipt.removedCount} removed` : `${receipt.createdCount} committed`} · rev ${receipt.beforeRevision}→${receipt.afterRevision}</div>` : ''}
    </div>`;
  }

  function brushRangeField(label, field, value, min, max, step, output) {
    return `<label><span>${label}</span><input aria-label="Undergrowth brush ${field}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" onchange="BsbV2MapAuthoring.setUndergrowthBrushField('${field}', this.value)"><output>${output}</output></label>`;
  }

  function renderRecordInspector(doc) {
    const selected = selectedRecordData();
    if (!selected) {
      return `<details class="bsb-v2-card bsb-v2-inspector" open><summary>Inspector</summary><div class="bsb-v2-muted">Select an authored object, unit, or spawner.</div></details>`;
    }
    const { kind, record } = selected;
    const title = `${record.type} · ${record.x},${record.y}`;
    return `<details class="bsb-v2-card bsb-v2-inspector" open>
      <summary>Inspector · ${escapeHtml(title)}</summary>
      <div class="bsb-v2-inspector-grid">
        ${kind === 'sceneObject' ? sceneObjectInspectorFields(record, doc) : unitInspectorFields(record, kind, doc)}
        ${audioEmitterInspectorFields(kind, record)}
      </div>
    </details>`;
  }

  function audioEmitterInspectorFields(kind, record) {
    const emitter = { ...defaultAudioEmitterForRecord(kind, record.type), ...(record.audioEmitter ?? {}) };
    return `<details id="bsb-v2-audio-emitter-inspector" class="bsb-v2-card bsb-v2-audio-emitter" ${record.audioEmitter ? 'open' : ''}>
      <summary>Audio emitter <small>${escapeHtml(emitter.profileId)}</small></summary>
      <div class="bsb-v2-inspector-grid">
        ${audioCheckboxField('enabled', emitter.enabled !== false)}
        ${audioSelectField('profileId', emitter.profileId, AUDIO_EMITTER_PROFILE_OPTIONS)}
        ${audioTextField('emitterId', emitter.emitterId)}
        ${audioTextField('anchor', emitter.anchor)}
        ${audioNumberField('anchorHeightMeters', emitter.anchorHeightMeters, 0, 30, 0.05)}
        ${audioNumberField('referenceDistanceMeters', emitter.referenceDistanceMeters, 0.1, 160, 0.1)}
        ${audioNumberField('maxDistanceMeters', emitter.maxDistanceMeters, 1, 500, 1)}
        ${audioNumberField('rolloffFactor', emitter.rolloffFactor, 0, 8, 0.05)}
        ${audioNumberField('coneInnerAngle', emitter.coneInnerAngle, 0, 360, 1)}
        ${audioNumberField('coneOuterAngle', emitter.coneOuterAngle, 0, 360, 1)}
        ${audioNumberField('coneOuterGain', emitter.coneOuterGain, 0, 1, 0.01)}
        ${audioNumberField('dopplerScale', emitter.dopplerScale, 0, 1, 0.01)}
        ${audioNumberField('priority', emitter.priority, 0, 255, 1)}
      </div>
      <p class="bsb-v2-muted">Position is resolved from this owner’s Transform. Coordinate copies are rejected.</p>
    </details>`;
  }

  function defaultAudioEmitterForRecord(kind, type) {
    const fire = kind === 'sceneObject' && ['fire_arrow_cluster', 'smouldering_fern', 'smouldering_bramble'].includes(type);
    return fire
      ? { emitterId: 'fire', profileId: 'smoulder_fire_spatial_v1', anchor: 'transform', enabled: true, anchorHeightMeters: 0.35, referenceDistanceMeters: 1.5, maxDistanceMeters: 28, rolloffFactor: 1.35, coneInnerAngle: 360, coneOuterAngle: 360, coneOuterGain: 1, dopplerScale: 0, priority: 32 }
      : { emitterId: 'voice', profileId: 'creature_voice_spatial_v1', anchor: type === 'werewolf' ? 'mouth' : 'head', enabled: kind !== 'sceneObject', anchorHeightMeters: type === 'werewolf' ? 0.82 : 1.42, referenceDistanceMeters: 2, maxDistanceMeters: 45, rolloffFactor: 1.15, coneInnerAngle: 220, coneOuterAngle: 300, coneOuterGain: 0.42, dopplerScale: 0.65, priority: 70 };
  }

  function audioTextField(field, value) {
    return `<label>${escapeHtml(fieldLabel(field))}<input id="bsb-v2-audio-${escapeAttr(field)}" value="${escapeAttr(value)}" onchange="BsbV2MapAuthoring.updateSelectedAudioEmitterField('${escapeAttr(field)}', this.value)"></label>`;
  }

  function audioNumberField(field, value, min, max, step) {
    return `<label>${escapeHtml(fieldLabel(field))}<input id="bsb-v2-audio-${escapeAttr(field)}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeAttr(value)}" onchange="BsbV2MapAuthoring.updateSelectedAudioEmitterField('${escapeAttr(field)}', this.value)"></label>`;
  }

  function audioSelectField(field, value, options) {
    return `<label>${escapeHtml(fieldLabel(field))}<select id="bsb-v2-audio-${escapeAttr(field)}" onchange="BsbV2MapAuthoring.updateSelectedAudioEmitterField('${escapeAttr(field)}', this.value)">${options.map(([id, label]) => `<option value="${escapeAttr(id)}" ${id === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
  }

  function audioCheckboxField(field, value) {
    return `<label class="bsb-v2-checkbox">${escapeHtml(fieldLabel(field))}<input id="bsb-v2-audio-${escapeAttr(field)}" type="checkbox" ${value ? 'checked' : ''} onchange="BsbV2MapAuthoring.updateSelectedAudioEmitterField('${escapeAttr(field)}', this.checked)"></label>`;
  }

  function sceneObjectInspectorFields(record, doc) {
    const shared = [
      selectField('type', record.type, SCENE_OBJECTS),
      textField('label', record.label ?? ''),
      numberField('x', record.x, 0, doc.width - 1, 1),
      numberField('y', record.y, 0, doc.height - 1, 1),
      numberField('visualWidthTiles', record.visualWidthTiles ?? '', 0.1, 12, 0.1),
      numberField('visualHeightTiles', record.visualHeightTiles ?? '', 0.1, 12, 0.1),
      numberField('visualOffsetX', record.visualOffsetX ?? 0, -6, 6, 0.1),
      numberField('visualOffsetY', record.visualOffsetY ?? 0, -6, 6, 0.1)
    ].join('');
    if (isBsbV2GeologyRecord(record)) {
      const dna = record.geology;
      return `
        <div class="bsb-v2-tree-dna-head">
          <span>Geology DNA</span>
          <small>${escapeHtml(geologyDefinitionSummary(dna))}</small>
        </div>
        ${geologySelectField('formation', dna.formation, BSB_V2_GEOLOGY_RECIPE_OPTIONS, 'set_formation')}
        ${geologyNumberField('seed', dna.seed, 1, 2147483647, 1)}
        ${geologyNumberField('scale', dna.scale, .45, 2.4, .05)}
        ${geologyNumberField('heightMeters', dna.heightMeters, .3, 4.2, .05)}
        ${geologyNumberField('angularity', dna.angularity, 0, 1, .05)}
        ${geologyNumberField('strataAngleDegrees', dna.strataAngleDegrees, 0, 180, 1)}
        ${geologyNumberField('strataDensity', dna.strataDensity, 0, 1, .05)}
        ${geologyNumberField('erosion', dna.erosion, 0, 1, .05)}
        ${geologyNumberField('crackDensity', dna.crackDensity, 0, 1, .05)}
        ${geologyNumberField('fracture', dna.fracture, 0, 1, .05)}
        ${geologyNumberField('moss', dna.moss, 0, 1, .05)}
        ${geologyNumberField('wetness', dna.wetness, 0, 1, .05)}
        <div class="bsb-v2-tree-actions">
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedGeology('randomise')">Randomise</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedGeology('erode', .18)">Erode</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedGeology('fracture', .2)">Fracture</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedGeology('moss', .2)">Add moss</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedGeology('weather', .18)">Weather</button>
        </div>
        ${shared}`;
    }
    if (isBsbV2UndergrowthRecord(record)) {
      const dna = record.undergrowth;
      return `
        <div class="bsb-v2-tree-dna-head">
          <span>Undergrowth DNA</span>
          <small>${escapeHtml(undergrowthDefinitionSummary(dna))}</small>
        </div>
        ${undergrowthSelectField('species', dna.species, BSB_V2_UNDERGROWTH_SPECIES_OPTIONS, 'set_species')}
        ${undergrowthSelectField('season', dna.season, BSB_V2_UNDERGROWTH_SEASONS.map((season) => [season, season]), 'patch')}
        ${undergrowthNumberField('ageYears', dna.ageYears, .2, 120, .5)}
        ${undergrowthNumberField('health', dna.health, 0, 1, .05)}
        ${undergrowthNumberField('heightMeters', dna.heightMeters, .08, 3, .05)}
        ${undergrowthNumberField('spreadMeters', dna.spreadMeters, .2, 5, .05)}
        ${undergrowthNumberField('density', dna.density, .05, 1, .05)}
        ${undergrowthNumberField('stemCount', dna.stemCount, 2, 28, 1)}
        ${undergrowthNumberField('leafSize', dna.leafSize, .04, .5, .01)}
        ${undergrowthNumberField('curl', dna.curl, 0, 1, .05)}
        ${undergrowthNumberField('irregularity', dna.irregularity, 0, 1, .05)}
        ${undergrowthNumberField('groundCover', dna.groundCover, 0, 1, .05)}
        ${undergrowthNumberField('burn', dna.burn, 0, 1, .05)}
        <div class="bsb-v2-tree-actions">
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedUndergrowth('randomise')">Randomise</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedUndergrowth('age', 4)">Age +4y</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedUndergrowth('damage', .2)">Damage</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedUndergrowth('regrow', .25)">Regrow</button>
          <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedUndergrowth('make_wild', 6)">Make wild</button>
        </div>
        ${shared}`;
    }
    if (!isBsbV2TreeRecord(record)) return shared;
    const tree = record.tree;
    return `
      <div class="bsb-v2-tree-dna-head">
        <span>Tree DNA</span>
        <small>${escapeHtml(treeDefinitionSummary(tree))}</small>
      </div>
      ${treeSelectField('species', tree.species, BSB_V2_TREE_SPECIES_OPTIONS, 'set_species')}
      ${treeSelectField('season', tree.season, BSB_V2_TREE_SEASONS.map((season) => [season, season]), 'patch')}
      ${treeNumberField('ageYears', tree.ageYears, 1, 800, 1)}
      ${treeNumberField('health', tree.health, 0, 1, 0.05)}
      ${treeNumberField('heightMeters', tree.heightMeters, 1.5, 30, 0.1)}
      ${treeNumberField('trunkRadiusMeters', tree.trunkRadiusMeters, 0.08, 2.4, 0.05)}
      ${treeNumberField('bend', tree.bend, 0, 0.85, 0.02)}
      ${treeNumberField('branchDensity', tree.branchDensity, 0.1, 1, 0.05)}
      ${treeNumberField('leafDensity', tree.leafDensity, 0, 1, 0.05)}
      ${treeNumberField('rootScale', tree.rootScale, 0.2, 2.2, 0.05)}
      ${treeNumberField('moss', tree.moss, 0, 1, 0.05)}
      <div class="bsb-v2-tree-actions">
        <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedTree('randomise')">Randomise</button>
        <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedTree('age', 25)">Age +25y</button>
        <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedTree('damage', .2)">Damage</button>
        <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedTree('regrow', .25)">Regrow</button>
        <button class="bsb-v2-button secondary" onclick="BsbV2MapAuthoring.operateSelectedTree('make_ancient', 160)">Make ancient</button>
      </div>
      ${shared}`;
  }

  function treeNumberField(field, value, min, max, step) {
    return `<label>${escapeHtml(fieldLabel(field))}<input id="bsb-v2-tree-${escapeAttr(field)}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeAttr(value)}" onchange="BsbV2MapAuthoring.updateSelectedTreeField('${escapeAttr(field)}', this.value)"></label>`;
  }

  function treeSelectField(field, value, options, operation) {
    const action = operation === 'set_species'
      ? `BsbV2MapAuthoring.operateSelectedTree('set_species', this.value)`
      : `BsbV2MapAuthoring.updateSelectedTreeField('${escapeAttr(field)}', this.value)`;
    return `<label>${escapeHtml(fieldLabel(field))}<select id="bsb-v2-tree-${escapeAttr(field)}" onchange="${action}">${options.map(([id, label]) => `<option value="${escapeAttr(id)}" ${id === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
  }

  function undergrowthNumberField(field, value, min, max, step) {
    return `<label>${escapeHtml(fieldLabel(field))}<input id="bsb-v2-undergrowth-${escapeAttr(field)}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeAttr(value)}" onchange="BsbV2MapAuthoring.updateSelectedUndergrowthField('${escapeAttr(field)}', this.value)"></label>`;
  }

  function undergrowthSelectField(field, value, options, operation) {
    const action = operation === 'set_species'
      ? `BsbV2MapAuthoring.operateSelectedUndergrowth('set_species', this.value)`
      : `BsbV2MapAuthoring.updateSelectedUndergrowthField('${escapeAttr(field)}', this.value)`;
    return `<label>${escapeHtml(fieldLabel(field))}<select id="bsb-v2-undergrowth-${escapeAttr(field)}" onchange="${action}">${options.map(([id, label]) => `<option value="${escapeAttr(id)}" ${id === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
  }

  function geologyNumberField(field, value, min, max, step) {
    return `<label>${escapeHtml(fieldLabel(field))}<input id="bsb-v2-geology-${escapeAttr(field)}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeAttr(value)}" onchange="BsbV2MapAuthoring.updateSelectedGeologyField('${escapeAttr(field)}', this.value)"></label>`;
  }

  function geologySelectField(field, value, options, operation) {
    const action = operation === 'set_formation'
      ? `BsbV2MapAuthoring.operateSelectedGeology('set_formation', this.value)`
      : `BsbV2MapAuthoring.updateSelectedGeologyField('${escapeAttr(field)}', this.value)`;
    return `<label>${escapeHtml(fieldLabel(field))}<select id="bsb-v2-geology-${escapeAttr(field)}" onchange="${action}">${options.map(([id, label]) => `<option value="${escapeAttr(id)}" ${id === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
  }

  function unitInspectorFields(record, kind, doc) {
    const shared = [
      selectField('type', record.type, UNIT_TYPES),
      selectField('team', record.team, AUTHORING_UNIT_TEAMS.map((team) => [team, team])),
      textField('label', record.label ?? ''),
      numberField('x', record.x, 0, doc.width - 1, 1),
      numberField('y', record.y, 0, doc.height - 1, 1)
    ];
    if (kind !== 'spawner') return shared.join('');
    return [
      ...shared,
      checkboxField('enabled', record.enabled !== false),
      numberField('intervalSeconds', record.intervalSeconds ?? 4, 0.1, 120, 0.1),
      numberField('initialDelaySeconds', record.initialDelaySeconds ?? 0.2, 0, 120, 0.1),
      numberField('burstCount', record.burstCount ?? 1, 1, 24, 1),
      numberField('maxAlive', record.maxAlive ?? 3, 1, 96, 1),
      numberField('limit', record.limit ?? 0, 0, 999, 1),
      numberField('spawnRadiusTiles', record.spawnRadiusTiles ?? 0.6, 0, 12, 0.1),
      numberField('hitPoints', record.hitPoints ?? 36, 1, 999, 1),
      numberField('fixtureRadiusTiles', record.fixtureRadiusTiles ?? 0.48, 0.15, 3, 0.05)
    ].join('');
  }

  function textField(field, value) {
    return `<label>${escapeHtml(fieldLabel(field))}<input id="bsb-v2-inspector-${escapeAttr(field)}" value="${escapeAttr(value)}" onchange="BsbV2MapAuthoring.updateSelectedRecord('${escapeAttr(field)}', this.value)"></label>`;
  }

  function numberField(field, value, min, max, step) {
    return `<label>${escapeHtml(fieldLabel(field))}<input id="bsb-v2-inspector-${escapeAttr(field)}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeAttr(value)}" onchange="BsbV2MapAuthoring.updateSelectedRecord('${escapeAttr(field)}', this.value)"></label>`;
  }

  function selectField(field, value, options) {
    return `<label>${escapeHtml(fieldLabel(field))}<select id="bsb-v2-inspector-${escapeAttr(field)}" onchange="BsbV2MapAuthoring.updateSelectedRecord('${escapeAttr(field)}', this.value)">${options.map(([id, label]) => `<option value="${escapeAttr(id)}" ${id === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
  }

  function checkboxField(field, value) {
    return `<label class="bsb-v2-checkbox">${escapeHtml(fieldLabel(field))}<input id="bsb-v2-inspector-${escapeAttr(field)}" type="checkbox" ${value ? 'checked' : ''} onchange="BsbV2MapAuthoring.updateSelectedRecord('${escapeAttr(field)}', this.checked)"></label>`;
  }

  function fieldLabel(field) {
    return String(field).replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
  }

  function selectedRecordData() {
    if (!state.document || !state.selectedRecord) return null;
    const record = findRecord(state.document, state.selectedRecord.kind, state.selectedRecord.id);
    return record ? { ...state.selectedRecord, record } : null;
  }

  function updateStageReadout() {
    const title = document.getElementById('bsb-v2-stage-title');
    const meta = document.getElementById('bsb-v2-stage-meta');
    const zoom = document.getElementById('bsb-v2-stage-zoom');
    const tool = document.getElementById('bsb-v2-stage-tool');
    const inputOwner = document.getElementById('bsb-v2-stage-input-owner');
    const diaryReturn = document.getElementById('bsb-v2-stage-diary-return');
    const canvas = document.getElementById('bsb-v2-map-canvas');
    if (title && state.document) title.textContent = state.document.title;
    if (meta && state.document) meta.textContent = `${state.document.width}×${state.document.height} · revision ${state.document.revision} · ${state.dirty ? 'unsaved' : 'saved'}`;
    if (zoom) zoom.textContent = `${Math.round((state.viewport?.zoom ?? 1) * 100)}%`;
    if (tool) tool.textContent = state.inputOwner === 'forge'
      ? isUndergrowthBrushActive()
        ? `Tool: Undergrowth brush · ${state.undergrowthBrushConfig.radiusTiles}t · ${state.undergrowthBrushPreview?.candidates.length ?? 0} ready`
        : `Tool: ${TOOL_BY_ID.get(state.selectedToolId)?.label || state.selectedToolId} · ${state.brushRadius}t`
      : state.inputOwner === 'diary'
        ? 'Click map to pin Diary context · no authoring'
        : 'Viewport inspect-only · no authoring';
    if (inputOwner) {
      inputOwner.textContent = state.inputOwner === 'forge' ? 'Input: Forge' : state.inputOwner === 'diary' ? 'Input: Diary pin' : 'Input: inspect';
      inputOwner.dataset.owner = state.inputOwner;
    }
    if (diaryReturn) diaryReturn.hidden = state.inputOwner === 'diary';
    if (canvas) {
      canvas.dataset.inputOwner = state.inputOwner;
      canvas.title = state.inputOwner === 'forge'
        ? isUndergrowthBrushActive()
          ? 'Drag to shape a deterministic undergrowth preview. Commit from Map Forge to change the source.'
          : 'Forge owns click input: selected tools can change the authoring source.'
        : state.inputOwner === 'diary'
          ? 'Diary owns click input: click to attach a location without changing the map.'
          : 'Inspect-only: map authoring is disabled while this panel is active.';
    }
  }

  function statusClass() {
    if (state.error || state.status === 'error') return 'error';
    if (state.dirty || ['saving', 'baking', 'new draft'].includes(state.status)) return state.status === 'new draft' ? 'dirty' : state.status;
    return '';
  }

  function status() {
    return {
      ok: !state.error,
      contract: BSB_V2_AUTHORING_CONTRACT,
      active: state.active,
      status: state.status,
      error: state.error,
      dirty: state.dirty,
      runtimeStatus: classifyBsbV2RuntimeFreshness(state),
      view: state.view,
      inputOwner: state.inputOwner,
      diaryAnchor: state.diaryAnchor ? cloneRecord(state.diaryAnchor) : null,
      selectedToolId: state.selectedToolId,
      palette: state.palette,
      brushRadius: state.brushRadius,
      undergrowthBrush: {
        config: cloneRecord(state.undergrowthBrushConfig),
        strokeCenters: cloneRecord(state.undergrowthBrushStroke),
        preview: state.undergrowthBrushPreview ? cloneRecord(state.undergrowthBrushPreview) : null,
        lastReceipt: state.undergrowthBrushLastReceipt ? cloneRecord(state.undergrowthBrushLastReceipt) : null,
        canUndo: canUndoUndergrowthBrush()
      },
      viewport: cloneRecord(state.viewport),
      visibleTiles: state.canvasLayout?.visibleTiles ? cloneRecord(state.canvasLayout.visibleTiles) : null,
      viewportLayout: state.canvasLayout ? { cell: state.canvasLayout.cell, offsetX: state.canvasLayout.offsetX, offsetY: state.canvasLayout.offsetY } : null,
      document: state.document ? cloneRecord(state.document) : null,
      selectedRecord: state.selectedRecord ? cloneRecord(state.selectedRecord) : null,
      selectedRecordData: selectedRecordData()?.record ? cloneRecord(selectedRecordData().record) : null,
      authoringPath: state.authoringPath,
      mapManifestPath: BSB_V2_MAP_MANIFEST_PATH,
      activeCatalogueMapId: state.activeCatalogueMapId,
      mapLibrary: state.mapLibrary ? cloneRecord(state.mapLibrary) : null,
      bakedMapPath: state.publication?.runtimePath ?? null,
      publication: state.publication ? cloneRecord(state.publication) : null,
      workspaceProject: state.workspaceProject ? cloneRecord(state.workspaceProject) : null,
      workspaceBinding: state.workspaceBinding ? cloneRecord(state.workspaceBinding) : null,
      resizeReceipt: state.resizeReceipt ? cloneRecord(state.resizeReceipt) : null,
      saveReceipt: state.saveReceipt,
      bakeReceipt: state.bakeReceipt,
      runtimeVerification: state.runtimeVerification ? cloneRecord(state.runtimeVerification) : null
    };
  }

  function fail(error) {
    state.status = 'error';
    state.error = String(error);
    render();
    return status();
  }

  function init() {
    ensureWorkspace();
    window.EDITOR?.events?.on?.('fileManager:stateChanged', () => { syncProject().catch((error) => fail(error?.message || error)); });
    window.EDITOR?.events?.on?.('sse:connectionChanged', () => { if (state.active) render(); });
    window.EDITOR?.events?.on?.('model:scan', () => { if (state.active) render(); });
    window.EDITOR?.events?.on?.('model:changed', () => { if (state.active) render(); });
    window.EDITOR?.events?.on?.('ux:leftPanelChanged', (event = {}) => {
      if (!state.active) return;
      setInputOwner(inputOwnerForPanel(event.panelId), { source: 'left_panel_changed' });
    });
    syncProject().catch((error) => fail(error?.message || error));
    return status();
  }

  return {
    init, status, workspaceState, load, loadMapLibrary, save, bakeAndPreview, setView, selectRegion, setTool, setPalette, setBrushRadius,
    setUndergrowthBrushField, setUndergrowthBrushSpeciesWeight, randomiseUndergrowthBrushSeed,
    clearUndergrowthBrushPreview, commitUndergrowthBrushPreview, undoLastUndergrowthBrush,
    resizeMap, resizeMapFromUI, fitViewport, zoomViewport,
    updateTitle, selectRecord, updateSelectedRecord, updateSelectedAudioEmitterField, removeRecord, syncProject,
    updateSelectedTreeField, operateSelectedTree, updateSelectedUndergrowthField, operateSelectedUndergrowth,
    updateSelectedGeologyField, operateSelectedGeology,
    applyTransitionSequenceOperation, updateTransitionSequencePhase, updateTransitionSequenceLanding,
    setOutlinerQuery, setOutlinerKind,
    setInputOwner, captureDiaryAnchor, focusContext, getDiaryAnchor: () => state.diaryAnchor ? cloneRecord(state.diaryAnchor) : null,
    trees: treeApi,
    undergrowth: undergrowthApi,
    geology: geologyApi,
    transitionSequences: transitionSequenceApi
  };
}

function drawRecordMarker(ctx, record, kind, offsetX, offsetY, cell) {
  const visual = describeBsbV2AuthoringRecord(kind, record);
  const cx = offsetX + (record.x + 0.5) * cell;
  const cy = offsetY + (record.y + 0.5) * cell;
  const radius = Math.max(2.3, Math.min(8, cell * 0.34));
  ctx.save();
  ctx.fillStyle = visual.color;
  ctx.strokeStyle = 'rgba(5, 7, 8, .92)';
  ctx.lineWidth = Math.max(1, cell * 0.08);

  if (visual.shape === 'tree') {
    ctx.strokeStyle = record.tree?.barkColour || '#5b3a25';
    ctx.lineWidth = Math.max(1.5, radius * .28);
    ctx.beginPath();
    ctx.moveTo(cx, cy + radius * .86);
    ctx.quadraticCurveTo(cx - radius * .12, cy, cx + radius * .08, cy - radius * .72);
    ctx.stroke();
    ctx.fillStyle = record.tree?.leafColour || visual.color;
    for (const lobe of [[0, -.48, .7], [-.46, -.1, .54], [.43, -.08, .56], [0, .2, .64]]) {
      ctx.beginPath();
      ctx.arc(cx + radius * lobe[0], cy + radius * lobe[1], radius * lobe[2], 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (visual.shape === 'triangle' || visual.shape === 'flame') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius * .88, cy + radius * .8);
    ctx.lineTo(cx - radius * .88, cy + radius * .8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (visual.shape === 'diamond' || visual.shape === 'bramble') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius, cy);
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx - radius, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (visual.shape === 'snag' || visual.shape === 'roots') {
    ctx.beginPath();
    ctx.moveTo(cx, cy + radius);
    ctx.lineTo(cx, cy - radius);
    ctx.moveTo(cx, cy - radius * .2);
    ctx.lineTo(cx - radius * .75, cy - radius * .72);
    ctx.moveTo(cx, cy - radius * .05);
    ctx.lineTo(cx + radius * .75, cy - radius * .68);
    ctx.strokeStyle = visual.color;
    ctx.lineWidth = Math.max(1.4, radius * .35);
    ctx.stroke();
  } else if (visual.shape === 'spawner') {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = visual.color;
    ctx.lineWidth = Math.max(1.4, radius * .3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - radius * .45, cy);
    ctx.lineTo(cx + radius * .45, cy);
    ctx.moveTo(cx, cy - radius * .45);
    ctx.lineTo(cx, cy + radius * .45);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, visual.shape === 'dot' ? radius * .45 : radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (cell >= 9 && !['dot', 'snag', 'roots'].includes(visual.shape)) {
    ctx.fillStyle = '#07090a';
    ctx.font = `800 ${Math.max(6, Math.min(10, cell * .48))}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(visual.glyph, cx, cy + .3);
  }
  ctx.restore();
}

function drawUndergrowthBrushPreview(ctx, preview, offsetX, offsetY, cell) {
  const speciesColours = {
    wood_fern: '#76d78a',
    forest_shrub: '#b7d976',
    ember_bramble: '#ff8b61'
  };
  ctx.save();
  ctx.setLineDash([Math.max(2, cell * .22), Math.max(2, cell * .18)]);
  ctx.strokeStyle = 'rgba(158, 230, 181, .5)';
  ctx.fillStyle = 'rgba(79, 160, 102, .055)';
  ctx.lineWidth = Math.max(1, Math.min(2, cell * .12));
  for (const center of preview.strokeCenters) {
    ctx.beginPath();
    ctx.arc(
      offsetX + (center.x + .5) * cell,
      offsetY + (center.y + .5) * cell,
      preview.config.radiusTiles * cell,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const blocked of preview.blocked) {
    const cx = offsetX + (blocked.x + .5) * cell;
    const cy = offsetY + (blocked.y + .5) * cell;
    const radius = Math.max(1.5, Math.min(5, cell * .22));
    ctx.strokeStyle = 'rgba(255, 112, 112, .62)';
    ctx.lineWidth = Math.max(1, cell * .08);
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy - radius);
    ctx.lineTo(cx + radius, cy + radius);
    ctx.moveTo(cx + radius, cy - radius);
    ctx.lineTo(cx - radius, cy + radius);
    ctx.stroke();
  }
  for (const candidate of preview.candidates) {
    const cx = offsetX + (candidate.x + .5) * cell;
    const cy = offsetY + (candidate.y + .5) * cell;
    const radius = Math.max(1.7, Math.min(6, cell * .27));
    ctx.fillStyle = speciesColours[candidate.species] || '#8ed59a';
    ctx.globalAlpha = .72;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(225, 255, 232, .78)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawMarker(ctx, x, y, offsetX, offsetY, cell, color, label) {
  const cx = offsetX + (x + 0.5) * cell;
  const cy = offsetY + (y + 0.5) * cell;
  const radius = Math.max(3, Math.min(9, cell * 0.38));
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
  if (cell >= 11) {
    ctx.fillStyle = '#07090a';
    ctx.font = `700 ${Math.max(7, cell * 0.55)}px ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, cy + 0.5);
  }
}

function drawSelectedRecord(ctx, record, offsetX, offsetY, cell) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX + record.x * cell + 2, offsetY + record.y * cell + 2, Math.max(1, cell - 4), Math.max(1, cell - 4));
}

function drawEscape(ctx, zone, offsetX, offsetY, cell) {
  ctx.fillStyle = 'rgba(61, 255, 160, .14)';
  ctx.strokeStyle = '#59e8a4';
  ctx.lineWidth = 2;
  ctx.fillRect(offsetX + zone.x * cell, offsetY + zone.y * cell, zone.w * cell, zone.h * cell);
  ctx.strokeRect(offsetX + zone.x * cell + 1, offsetY + zone.y * cell + 1, zone.w * cell - 2, zone.h * cell - 2);
}

function paintTiles(tiles, width, height, cx, cy, radius, type) {
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x += 1) {
      if (Math.hypot(x - cx, y - cy) <= radius + 0.001) tiles[y][x] = type;
    }
  }
}

function normalizeRecords(entries, label, width, height, allowedTypes, withTeam = false) {
  if (!Array.isArray(entries)) throw new Error(`bsb_authoring_${label}_invalid`);
  return entries.map((entry, index) => {
    if (!allowedTypes.has(entry?.type)) throw new Error(`bsb_authoring_${label}_type_invalid:${index}`);
    const normalized = {
      ...cloneRecord(entry),
      id: text(entry.id, `${entry.type}:${index + 1}`),
      type: entry.type,
      ...point(entry, width, height, `${label}:${index}`)
    };
    if (withTeam) normalized.team = normalizeAuthoringUnitTeam(entry, entry.type);
    if (entry.audioEmitter) normalized.audioEmitter = normalizeAudioEmitter(entry.audioEmitter, `${label}:${index}`);
    if (label === 'sceneObjects' && isBsbV2TreeRecord(normalized)) return normalizeBsbV2TreeRecord(normalized);
    if (label === 'sceneObjects' && isBsbV2UndergrowthRecord(normalized)) return normalizeBsbV2UndergrowthRecord(normalized);
    if (label === 'sceneObjects' && isBsbV2GeologyRecord(normalized)) return normalizeBsbV2GeologyRecord(normalized);
    return normalized;
  });
}

function recordCollection(kind) {
  const collection = RECORD_COLLECTIONS[String(kind || '')];
  if (!collection) throw new Error(`bsb_authoring_record_kind_invalid:${kind ?? 'missing'}`);
  return collection;
}

function findRecord(document, kind, id) {
  const collection = recordCollection(kind);
  return document[collection.field].find((entry) => entry.id === id) ?? null;
}

function normalizeRecordPatch(document, kind, current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('bsb_authoring_record_patch_invalid');
  const collection = recordCollection(kind);
  const next = cloneRecord(current);
  if (Object.hasOwn(patch, 'type')) {
    const type = text(patch.type, next.type);
    if (!collection.allowedTypes.has(type)) throw new Error(`bsb_authoring_record_type_invalid:${kind}:${type}`);
    next.type = type;
    if (kind === 'sceneObject' && type === 'birch_tree') next.tree = { ...(next.tree ?? {}), species: 'silver_birch' };
    if (kind === 'sceneObject' && isBsbV2UndergrowthRecord({ type })) { delete next.tree; delete next.geology; }
    if (kind === 'sceneObject' && isBsbV2TreeRecord({ type })) { delete next.undergrowth; delete next.geology; }
    if (kind === 'sceneObject' && type === 'boulder') { delete next.tree; delete next.undergrowth; }
    if (kind === 'sceneObject' && type !== 'boulder') delete next.geology;
    if (collection.withTeam && !Object.hasOwn(patch, 'team')) next.team = defaultTeamForUnit(type);
  }
  if (Object.hasOwn(patch, 'label')) setOptionalText(next, 'label', patch.label);
  if (Object.hasOwn(patch, 'x')) next.x = integer(patch.x, `${kind}.x`, 0, document.width - 1);
  if (Object.hasOwn(patch, 'y')) next.y = integer(patch.y, `${kind}.y`, 0, document.height - 1);
  if (collection.withTeam && Object.hasOwn(patch, 'team')) next.team = normalizeAuthoringUnitTeam({ team: patch.team }, next.type);
  if (Object.hasOwn(patch, 'audioEmitter')) {
    if (patch.audioEmitter == null) delete next.audioEmitter;
    else next.audioEmitter = normalizeAudioEmitter(patch.audioEmitter, `${kind}:${next.id}`);
  }

  if (kind === 'spawner') {
    if (Object.hasOwn(patch, 'enabled')) next.enabled = boolean(patch.enabled);
    for (const [field, spec] of Object.entries(SPAWNER_NUMBER_FIELDS)) {
      if (!Object.hasOwn(patch, field)) continue;
      next[field] = normalizeEditableNumber(patch[field], `${kind}.${field}`, spec);
    }
  }
  if (kind === 'sceneObject') {
    for (const [field, spec] of Object.entries(SCENE_OBJECT_NUMBER_FIELDS)) {
      if (!Object.hasOwn(patch, field)) continue;
      const value = normalizeEditableOptionalNumber(patch[field], `${kind}.${field}`, spec);
      if (value == null) delete next[field];
      else next[field] = value;
    }
    if (isBsbV2TreeRecord(next)) return normalizeBsbV2TreeRecord(next);
    if (isBsbV2UndergrowthRecord(next)) {
      delete next.tree;
      delete next.geology;
      return normalizeBsbV2UndergrowthRecord(next);
    }
    if (isBsbV2GeologyRecord(next)) {
      delete next.tree;
      delete next.undergrowth;
      return normalizeBsbV2GeologyRecord(next);
    }
    delete next.tree;
    delete next.undergrowth;
    delete next.geology;
  }
  return next;
}

function normalizeAudioEmitter(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`bsb_authoring_audio_emitter_invalid:${label}`);
  if (['x', 'y', 'z', 'position'].some((field) => Object.hasOwn(value, field))) {
    throw new Error(`bsb_authoring_audio_emitter_duplicate_position:${label}`);
  }
  const next = {
    contract: 'black-sky-bound.audio-emitter.v1',
    emitterId: text(value.emitterId, 'voice'),
    profileId: text(value.profileId, 'creature_voice_spatial_v1'),
    anchor: text(value.anchor, 'transform'),
    enabled: value.enabled !== false,
    ...cloneRecord(value)
  };
  for (const [field, spec] of Object.entries(AUDIO_EMITTER_NUMBER_FIELDS)) {
    if (next[field] == null || next[field] === '') { delete next[field]; continue; }
    next[field] = normalizeEditableNumber(next[field], `audioEmitter.${field}`, spec);
  }
  return next;
}

function setOptionalText(target, field, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) delete target[field];
  else target[field] = normalized;
}

function normalizeEditableNumber(value, label, spec) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`bsb_authoring_number_invalid:${label}`);
  const clamped = Math.max(spec.min, Math.min(spec.max, numeric));
  if (spec.integer) return Math.round(clamped);
  const scale = 10 ** (spec.decimals ?? 3);
  return Math.round(clamped * scale) / scale;
}

function normalizeEditableOptionalNumber(value, label, spec) {
  if (value === '' || value == null) return null;
  return normalizeEditableNumber(value, label, spec);
}

function boolean(value) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function defaultTeamForUnit(type) {
  return UNIT_DEFAULT_TEAMS[type] ?? 'enemy';
}

function normalizeAuthoringUnitTeam(entry, type) {
  const team = String(entry?.team ?? '').trim();
  if (AUTHORING_UNIT_TEAMS.includes(team)) return team;
  return defaultTeamForUnit(type);
}

function createDraftForPublication(publication) {
  const runtimeMapId = publication?.runtimeMapId;
  if (runtimeMapId === 'axiom_second_approach') return createSecondApproachBsbV2AuthoringDocument();
  return createDefaultBsbV2AuthoringDocument();
}

function normalizeAuthoringTransitions(source) {
  if (source == null) return { escapeZone: null };
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('bsb_authoring_transitions_invalid');
  return { escapeZone: normalizeAuthoringEscapeTransition(source.escapeZone) };
}

function normalizeAuthoringEscapeTransition(source) {
  if (source == null) return null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('bsb_authoring_escape_transition_invalid');
  const mode = text(source.mode, 'load_next_map');
  if (mode !== 'load_next_map') throw new Error(`bsb_authoring_escape_transition_mode_invalid:${mode}`);
  return {
    mode,
    nextMapPath: normalizeBsbV2RuntimeMapPath(source.nextMapPath),
    nextMapId: source.nextMapId == null ? null : identifier(source.nextMapId, 'transitions.escapeZone.nextMapId'),
    departureSequenceId: source.departureSequenceId == null ? null : identifier(source.departureSequenceId, 'transitions.escapeZone.departureSequenceId'),
    arrivalSequenceId: source.arrivalSequenceId == null ? null : identifier(source.arrivalSequenceId, 'transitions.escapeZone.arrivalSequenceId'),
    label: text(source.label, 'Next region')
  };
}

function normalizeLastResize(source, width, height) {
  if (source == null) return null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('bsb_authoring_last_resize_invalid');
  if (source.contract !== BSB_V2_MAP_RESIZE_CONTRACT) throw new Error(`bsb_authoring_last_resize_contract_invalid:${source.contract ?? 'missing'}`);
  const from = {
    width: integer(source.from?.width, 'lastResize.from.width', BSB_V2_MAP_SIZE_LIMITS.min, BSB_V2_MAP_SIZE_LIMITS.max),
    height: integer(source.from?.height, 'lastResize.from.height', BSB_V2_MAP_SIZE_LIMITS.min, BSB_V2_MAP_SIZE_LIMITS.max)
  };
  const to = {
    width: integer(source.to?.width, 'lastResize.to.width', BSB_V2_MAP_SIZE_LIMITS.min, BSB_V2_MAP_SIZE_LIMITS.max),
    height: integer(source.to?.height, 'lastResize.to.height', BSB_V2_MAP_SIZE_LIMITS.min, BSB_V2_MAP_SIZE_LIMITS.max)
  };
  if (to.width !== width || to.height !== height) throw new Error('bsb_authoring_last_resize_dimensions_mismatch');
  if (source.anchor !== 'center') throw new Error(`bsb_authoring_last_resize_anchor_invalid:${source.anchor ?? 'missing'}`);
  const offset = {
    x: integer(source.offset?.x, 'lastResize.offset.x', 0, BSB_V2_MAP_SIZE_LIMITS.max),
    y: integer(source.offset?.y, 'lastResize.offset.y', 0, BSB_V2_MAP_SIZE_LIMITS.max)
  };
  if (offset.x !== Math.floor((to.width - from.width) / 2) || offset.y !== Math.floor((to.height - from.height) / 2)) {
    throw new Error('bsb_authoring_last_resize_offset_mismatch');
  }
  const fillTerrain = String(source.fillTerrain || '');
  if (!Object.hasOwn(TERRAIN, fillTerrain)) throw new Error(`bsb_authoring_last_resize_fill_invalid:${fillTerrain || 'missing'}`);
  return {
    contract: BSB_V2_MAP_RESIZE_CONTRACT,
    from,
    to,
    anchor: 'center',
    offset,
    fillTerrain,
    preserved: {
      tiles: integer(source.preserved?.tiles, 'lastResize.preserved.tiles', 0, Number.MAX_SAFE_INTEGER),
      sceneObjects: integer(source.preserved?.sceneObjects, 'lastResize.preserved.sceneObjects', 0, Number.MAX_SAFE_INTEGER),
      unitPlacements: integer(source.preserved?.unitPlacements, 'lastResize.preserved.unitPlacements', 0, Number.MAX_SAFE_INTEGER),
      unitSpawners: integer(source.preserved?.unitSpawners, 'lastResize.preserved.unitSpawners', 0, Number.MAX_SAFE_INTEGER)
    },
    resizedAt: text(source.resizedAt, '')
  };
}

function point(value, width, height, label) {
  return { x: integer(value?.x, `${label}.x`, 0, width - 1), y: integer(value?.y, `${label}.y`, 0, height - 1) };
}

function spawnPoint(value, width, height, label) {
  const position = point(value, width, height, label);
  const rotation = value?.rotation == null ? 0 : Number(value.rotation);
  if (!Number.isFinite(rotation)) throw new Error(`bsb_authoring_number_invalid:${label}.rotation`);
  return { ...position, rotation };
}

function rect(value, width, height, label) {
  const origin = point(value, width, height, label);
  const w = integer(value?.w, `${label}.w`, 1, width);
  const h = integer(value?.h, `${label}.h`, 1, height);
  if (origin.x + w > width || origin.y + h > height) throw new Error(`bsb_authoring_rect_out_of_bounds:${label}`);
  return { ...origin, w, h };
}

function integer(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`bsb_authoring_integer_invalid:${label}`);
  return number;
}

function identifier(value, label) {
  const normalized = text(value, '');
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(normalized)) throw new Error(`bsb_authoring_id_invalid:${label}`);
  return normalized;
}

function normalizeBsbV2RuntimeMapPath(value) {
  const normalized = String(value ?? '').trim().replace(/\\/g, '/');
  if (normalized.includes('..') || !/^\/?data\/maps\/[a-z0-9][a-z0-9._-]*\.runtime-map\.json$/i.test(normalized)) {
    throw new Error('bsb_map_manifest_runtime_path_invalid');
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeBsbV2AuthoringPath(value) {
  const normalized = String(value ?? '').trim().replace(/\\/g, '/');
  if (normalized.includes('..') || !/^data\/bsb-v2\/maps\/[a-z0-9][a-z0-9._-]*\.authoring\.json$/i.test(normalized)) {
    throw new Error('bsb_map_manifest_authoring_path_invalid');
  }
  return normalized;
}

function defaultAuthoringPathForMap(catalogueMapId, runtimeMapId) {
  if (runtimeMapId === 'axiom_first_escape') return BSB_V2_AUTHORING_PATH;
  const slug = String(catalogueMapId || runtimeMapId || 'map').toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  return `data/bsb-v2/maps/${slug}.authoring.json`;
}

function text(value, fallback) {
  return String(value ?? '').trim() || String(fallback ?? '');
}

function uniqueId(type, x, y, revision) {
  return `${type}:${x}:${y}:${revision}`;
}

function cloneRecord(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const runtime = createRuntime();
  window.BsbV2MapAuthoring = runtime;
  if (window.EDITOR) {
    window.EDITOR.procedural = window.EDITOR.procedural || {};
    window.EDITOR.procedural.trees = runtime.trees;
    window.EDITOR.procedural.undergrowth = runtime.undergrowth;
    window.EDITOR.procedural.geology = runtime.geology;
    window.EDITOR.scenes = window.EDITOR.scenes || {};
    window.EDITOR.scenes.transitions = runtime.transitionSequences;
  }
  queueMicrotask(() => runtime.init());
}
