export const SCENE_ENTITY_VERSION = 'field-fronts.scene-entity.v0';

export const SHELTER_NODE_TYPES = Object.freeze({
  EXPOSED_CLEARING: Object.freeze({
    label: 'Exposed grass clearing',
    shelterRating: 0.05,
    visibilityModifier: 0.34,
    movementModifier: 1,
    tags: Object.freeze(['exposed', 'torch_visibility_risk'])
  }),
  LIGHT_TREE_COVER: Object.freeze({
    label: 'Light tree cover',
    shelterRating: 0.36,
    visibilityModifier: -0.14,
    movementModifier: 0.92,
    tags: Object.freeze(['partial_cover', 'torch_visibility_risk'])
  }),
  DENSE_CANOPY: Object.freeze({
    label: 'Dense canopy',
    shelterRating: 0.72,
    visibilityModifier: -0.42,
    movementModifier: 0.72,
    tags: Object.freeze(['concealed', 'sheltered', 'blocks_line_of_sight', 'slows_movement'])
  }),
  BOULDER_COVER: Object.freeze({
    label: 'Boulder cover',
    shelterRating: 0.66,
    visibilityModifier: -0.3,
    movementModifier: 0.82,
    tags: Object.freeze(['partial_cover', 'sheltered', 'blocks_line_of_sight'])
  }),
  FALLEN_LOG: Object.freeze({
    label: 'Fallen tree',
    shelterRating: 0.48,
    visibilityModifier: -0.2,
    movementModifier: 0.78,
    tags: Object.freeze(['partial_cover', 'slows_movement'])
  }),
  ROOT_HOLLOW: Object.freeze({
    label: 'Root hollow',
    shelterRating: 0.68,
    visibilityModifier: -0.38,
    movementModifier: 0.7,
    tags: Object.freeze(['concealed', 'sheltered', 'regroup_safe'])
  }),
  THORN_SCRUB: Object.freeze({
    label: 'Thorn scrub',
    shelterRating: 0.54,
    visibilityModifier: -0.3,
    movementModifier: 0.58,
    tags: Object.freeze(['concealed', 'slows_movement', 'noise_risk'])
  }),
  REED_BED: Object.freeze({
    label: 'Reed bed',
    shelterRating: 0.42,
    visibilityModifier: -0.24,
    movementModifier: 0.58,
    tags: Object.freeze(['concealed', 'slows_movement', 'noise_risk'])
  }),
  RIVERBANK_HOLLOW: Object.freeze({
    label: 'Riverbank hollow',
    shelterRating: 0.58,
    visibilityModifier: -0.3,
    movementModifier: 0.7,
    tags: Object.freeze(['partial_cover', 'sheltered', 'regroup_safe'])
  }),
  CLIFF_OVERHANG: Object.freeze({
    label: 'Cliff overhang',
    shelterRating: 0.82,
    visibilityModifier: -0.52,
    movementModifier: 0.74,
    tags: Object.freeze(['concealed', 'sheltered', 'blocks_line_of_sight', 'regroup_safe'])
  }),
  SHALLOW_CAVE: Object.freeze({
    label: 'Shallow cave',
    shelterRating: 0.94,
    visibilityModifier: -0.68,
    movementModifier: 0.68,
    tags: Object.freeze(['concealed', 'sheltered', 'blocks_line_of_sight', 'regroup_safe', 'final_shelter'])
  }),
  MIST_PATCH: Object.freeze({
    label: 'Mist pocket',
    shelterRating: 0.32,
    visibilityModifier: -0.36,
    movementModifier: 0.86,
    tags: Object.freeze(['concealed', 'torch_visibility_risk'])
  })
});

const SHELTER_PLACEMENT_TOOLS = Object.entries(SHELTER_NODE_TYPES).map(([shelterType, definition]) => Object.freeze({
  id: `shelter_${shelterType.toLowerCase()}`,
  label: definition.label,
  kind: 'shelter',
  factionId: 'neutral',
  shelterType
}));

export const SCENE_PLACEMENT_TOOLS = Object.freeze([
  Object.freeze({ id: 'player_start', label: 'Player Start', kind: 'start', factionId: 'player', unique: true }),
  Object.freeze({ id: 'enemy_start', label: 'Enemy Start', kind: 'start', factionId: 'enemy', unique: true }),
  Object.freeze({ id: 'neutral_outpost', label: 'Outpost', kind: 'outpost', factionId: 'neutral' }),
  Object.freeze({ id: 'player_infantry', label: 'Player Unit', kind: 'unit', factionId: 'player', unitId: 'infantry' }),
  Object.freeze({ id: 'enemy_infantry', label: 'Enemy Unit', kind: 'unit', factionId: 'enemy', unitId: 'infantry' }),
  Object.freeze({ id: 'hunter_guard', label: 'Hunter', kind: 'unit', factionId: 'player', unitId: 'warrior' }),
  Object.freeze({ id: 'scout_forager', label: 'Forager Scout', kind: 'unit', factionId: 'player', unitId: 'scout' }),
  Object.freeze({ id: 'tribe_members', label: 'Vulnerable Survivors', kind: 'unit', factionId: 'player', unitId: 'survivors' }),
  Object.freeze({ id: 'wounded_survivor', label: 'Wounded Survivor', kind: 'unit', factionId: 'player', unitId: 'wounded_survivor' }),
  Object.freeze({ id: 'supply_bundle', label: 'Hand-carried supplies', kind: 'prop', factionId: 'player' }),
  Object.freeze({ id: 'cover', label: 'Cover', kind: 'cover', factionId: 'neutral' }),
  Object.freeze({ id: 'scene_beat', label: 'Beat', kind: 'beat', factionId: 'neutral' }),
  Object.freeze({ id: 'trigger', label: 'Trigger', kind: 'trigger', factionId: 'neutral' }),
  Object.freeze({ id: 'spawner', label: 'Spawner', kind: 'spawner', factionId: 'enemy' }),
  ...SHELTER_PLACEMENT_TOOLS
]);

const FULL_PRESENTATION = Object.freeze({
  ui: Object.freeze({
    statusBar: true,
    playtest: true,
    build: true,
    resources: true,
    selection: true
  }),
  visuals: Object.freeze({
    weather: true,
    scenarioLayer: true
  })
});

const BLANK_PRESENTATION = Object.freeze({
  ui: Object.freeze({
    statusBar: false,
    playtest: false,
    build: false,
    resources: false,
    selection: false
  }),
  visuals: Object.freeze({
    weather: false,
    scenarioLayer: false
  })
});

const FIRST_NIGHT_PRESENTATION = Object.freeze({
  ui: Object.freeze({
    statusBar: true,
    playtest: true,
    build: false,
    resources: false,
    selection: true
  }),
  visuals: Object.freeze({
    weather: true,
    scenarioLayer: true
  })
});

export function createDefaultSceneEntity(overrides = {}) {
  return normaliseSceneEntity({
    contract: SCENE_ENTITY_VERSION,
    id: 'chapter_001_scene',
    title: 'Chapter 1 Scene',
    template: 'generated',
    runtimeSeedMode: 'legacy',
    presentation: FULL_PRESENTATION,
    authoredEntities: [],
    ...overrides
  });
}

export function createBlankSceneEntity({ id = 'chapter_001_scene', title = 'Chapter 1 Blank Scene' } = {}) {
  return normaliseSceneEntity({
    contract: SCENE_ENTITY_VERSION,
    id,
    title,
    template: 'blank',
    runtimeSeedMode: 'authored',
    presentation: BLANK_PRESENTATION,
    authoredEntities: []
  });
}

export function createFirstNightSceneEntity({ start = { x: 6, y: 20 }, shelterNodes = [] } = {}) {
  const placements = [
    { id: 'leader_start', toolId: 'player_start', label: 'Tribal Leader', tile: start, scenarioRole: 'commander', survivorCount: 1 },
    { id: 'hunter_01', toolId: 'hunter_guard', label: 'Hunter', tile: offsetTile(start, -1, -1), scenarioRole: 'hunter', survivorCount: 1 },
    { id: 'hunter_02', toolId: 'hunter_guard', label: 'Hunter', tile: offsetTile(start, -1, 1), scenarioRole: 'hunter', survivorCount: 1 },
    { id: 'forager_01', toolId: 'scout_forager', label: 'Forager Scout', tile: offsetTile(start, 1, -1), scenarioRole: 'scout', survivorCount: 1 },
    { id: 'forager_02', toolId: 'scout_forager', label: 'Forager Scout', tile: offsetTile(start, 1, 1), scenarioRole: 'scout', survivorCount: 1 },
    { id: 'survivors_01', toolId: 'tribe_members', label: 'Vulnerable Survivors', tile: offsetTile(start, -2, 0), scenarioRole: 'vulnerable', survivorCount: 5 },
    { id: 'wounded_01', toolId: 'wounded_survivor', label: 'Wounded Survivor', tile: offsetTile(start, -2, 1), scenarioRole: 'wounded', survivorCount: 1 },
    { id: 'supplies_01', toolId: 'supply_bundle', label: 'Hand-carried supplies', tile: offsetTile(start, -2, -1), scenarioRole: 'supplies' },
    ...shelterNodes.map((node) => ({
      id: node.id,
      toolId: `shelter_${node.type.toLowerCase()}`,
      label: node.label,
      tile: node.position ?? node.tile,
      shelterType: node.type,
      shelterRating: node.shelterRating,
      visibilityModifier: node.visibilityModifier,
      movementModifier: node.movementModifier,
      tags: node.tags,
      region: node.region
    }))
  ];
  return normaliseSceneEntity({
    contract: SCENE_ENTITY_VERSION,
    id: 'chapter_001_first_night_scene',
    title: 'The First Night',
    template: 'first_night',
    runtimeSeedMode: 'authored',
    runtimeProfile: 'nomadic_survival',
    presentation: FIRST_NIGHT_PRESENTATION,
    authoredEntities: placements
  });
}

export function ensureSceneEntityForMap(map) {
  if (!map || typeof map !== 'object') return null;
  map.scenario = map.scenario && typeof map.scenario === 'object' ? map.scenario : {};
  map.scenario.sceneEntity = normaliseSceneEntity(map.scenario.sceneEntity ?? createDefaultSceneEntity());
  syncAuthoredRuntimeMapSeeds(map);
  return map.scenario.sceneEntity;
}

export function normaliseSceneEntity(scene) {
  if (!scene || typeof scene !== 'object') {
    return createDefaultSceneEntity();
  }
  const nomadic = scene.template === 'first_night' || scene.runtimeProfile === 'nomadic_survival';
  const authored = nomadic || scene.template === 'blank' || scene.runtimeSeedMode === 'authored';
  const defaultPresentation = nomadic ? FIRST_NIGHT_PRESENTATION : authored ? BLANK_PRESENTATION : FULL_PRESENTATION;
  return {
    contract: SCENE_ENTITY_VERSION,
    id: normaliseText(scene.id, 'chapter_001_scene'),
    title: normaliseText(scene.title, nomadic ? 'The First Night' : authored ? 'Chapter 1 Blank Scene' : 'Chapter 1 Scene'),
    template: nomadic ? 'first_night' : authored ? 'blank' : 'generated',
    runtimeSeedMode: authored ? 'authored' : 'legacy',
    runtimeProfile: nomadic ? 'nomadic_survival' : authored ? 'authored' : 'legacy',
    presentation: {
      ui: normaliseFlagGroup(scene.presentation?.ui, defaultPresentation.ui),
      visuals: normaliseFlagGroup(scene.presentation?.visuals, defaultPresentation.visuals)
    },
    authoredEntities: normaliseAuthoredEntities(scene.authoredEntities)
  };
}

export function getSceneEntity(map) {
  return normaliseSceneEntity(map?.scenario?.sceneEntity ?? createDefaultSceneEntity());
}

export function getScenePresentation(map) {
  return getSceneEntity(map).presentation;
}

export function isAuthoredRuntimeScene(map) {
  return getSceneEntity(map).runtimeSeedMode === 'authored';
}

export function isNomadicSurvivalScene(map) {
  return getSceneEntity(map).runtimeProfile === 'nomadic_survival';
}

export function getShelterNodes(map) {
  return getSceneEntity(map).authoredEntities.filter((entity) => entity.kind === 'shelter');
}

export function updateScenePresentation(map, group, id, enabled) {
  const scene = ensureSceneEntityForMap(map);
  if (!scene?.presentation?.[group] || !Object.prototype.hasOwnProperty.call(scene.presentation[group], id)) {
    return scene;
  }
  map.scenario.sceneEntity = normaliseSceneEntity({
    ...scene,
    presentation: {
      ...scene.presentation,
      [group]: {
        ...scene.presentation[group],
        [id]: Boolean(enabled)
      }
    }
  });
  return map.scenario.sceneEntity;
}

export function placeSceneEntity(map, toolId, tile) {
  const scene = ensureSceneEntityForMap(map);
  const tool = SCENE_PLACEMENT_TOOLS.find((candidate) => candidate.id === toolId);
  const safeTile = normaliseTile(tile);
  if (!tool || !safeTile) {
    return { ok: false, reason: 'invalid-scene-placement', scene };
  }
  const retained = tool.unique
    ? scene.authoredEntities.filter((entity) => entity.toolId !== tool.id)
    : scene.authoredEntities;
  const matchingCount = retained.filter((entity) => entity.toolId === tool.id).length + 1;
  const entity = normaliseAuthoredEntity({
    id: `${tool.id}_${String(matchingCount).padStart(2, '0')}`,
    toolId: tool.id,
    kind: tool.kind,
    factionId: tool.factionId,
    unitId: tool.unitId ?? null,
    label: tool.label,
    tile: safeTile
  });
  map.scenario.sceneEntity = normaliseSceneEntity({
    ...scene,
    authoredEntities: [...retained, entity]
  });
  syncAuthoredRuntimeMapSeeds(map);
  return { ok: true, entity, scene: map.scenario.sceneEntity };
}

export function summarizeSceneEntity(map) {
  const scene = getSceneEntity(map);
  return {
    contract: scene.contract,
    id: scene.id,
    title: scene.title,
    template: scene.template,
    runtimeSeedMode: scene.runtimeSeedMode,
    presentation: scene.presentation,
    authoredEntityCount: scene.authoredEntities.length,
    placements: Object.fromEntries(SCENE_PLACEMENT_TOOLS.map((tool) => [
      tool.id,
      scene.authoredEntities.filter((entity) => entity.toolId === tool.id).length
    ]))
  };
}

function syncAuthoredRuntimeMapSeeds(map) {
  const scene = map?.scenario?.sceneEntity;
  if (!scene || scene.runtimeSeedMode !== 'authored') return;
  const playerStart = scene.authoredEntities.find((entity) => entity.toolId === 'player_start')?.tile ?? null;
  const enemyStart = scene.authoredEntities.find((entity) => entity.toolId === 'enemy_start')?.tile ?? null;
  map.scenario.starts = {
    ...(playerStart ? { player: { ...playerStart } } : {}),
    ...(enemyStart ? { enemy: { ...enemyStart } } : {})
  };
  if (scene.runtimeProfile === 'nomadic_survival') {
    map.scenario.neutralOutposts = [];
    return;
  }
  map.scenario.neutralOutposts = scene.authoredEntities
    .filter((entity) => entity.toolId === 'neutral_outpost')
    .map((entity, index) => ({
      id: `outpost_neutral_${String(index + 1).padStart(2, '0')}`,
      name: `Authored Outpost ${index + 1}`,
      tile: { ...entity.tile },
      supply: 0.62
    }));
}

function normaliseAuthoredEntities(entities) {
  return Array.isArray(entities)
    ? entities.map(normaliseAuthoredEntity).filter(Boolean).slice(0, 128)
    : [];
}

function normaliseAuthoredEntity(entity) {
  const tool = SCENE_PLACEMENT_TOOLS.find((candidate) => candidate.id === entity?.toolId);
  const tile = normaliseTile(entity?.tile);
  if (!tool || !tile) return null;
  return {
    id: normaliseText(entity.id, `${tool.id}_01`),
    toolId: tool.id,
    kind: tool.kind,
    factionId: tool.factionId,
    unitId: tool.unitId ?? null,
    label: normaliseText(entity.label, tool.label),
    tile,
    scenarioRole: typeof entity.scenarioRole === 'string' ? entity.scenarioRole : null,
    survivorCount: Number.isFinite(Number(entity.survivorCount)) ? Math.max(0, Math.round(Number(entity.survivorCount))) : null,
    region: typeof entity.region === 'string' ? entity.region : null,
    ...(tool.kind === 'shelter' ? normaliseShelterNode(entity, tool) : {})
  };
}

function normaliseShelterNode(entity, tool) {
  const type = typeof entity.shelterType === 'string' && SHELTER_NODE_TYPES[entity.shelterType]
    ? entity.shelterType
    : tool.shelterType;
  const definition = SHELTER_NODE_TYPES[type];
  return {
    shelterType: type,
    shelterRating: clamp01(entity.shelterRating, definition.shelterRating),
    visibilityModifier: normaliseNumber(entity.visibilityModifier, definition.visibilityModifier),
    movementModifier: clamp01(entity.movementModifier, definition.movementModifier),
    tags: Array.isArray(entity.tags)
      ? [...new Set(entity.tags.filter((tag) => typeof tag === 'string'))]
      : [...definition.tags]
  };
}

function normaliseFlagGroup(group, defaults) {
  return Object.fromEntries(Object.entries(defaults).map(([id, fallback]) => [
    id,
    typeof group?.[id] === 'boolean' ? group[id] : fallback
  ]));
}

function normaliseTile(tile) {
  if (!Number.isFinite(Number(tile?.x)) || !Number.isFinite(Number(tile?.y))) return null;
  return { x: Math.round(Number(tile.x)), y: Math.round(Number(tile.y)) };
}

function normaliseText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normaliseNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value, fallback = 0) {
  return Math.max(0, Math.min(1, normaliseNumber(value, fallback)));
}

function offsetTile(tile, dx, dy) {
  return {
    x: Math.round(Number(tile?.x) || 0) + dx,
    y: Math.round(Number(tile?.y) || 0) + dy
  };
}
