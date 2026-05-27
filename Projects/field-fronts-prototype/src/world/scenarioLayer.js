import { getShelterNodes } from './sceneEntity.js';

export const SCENARIO_LAYER_VERSION = 'field-fronts.scenario-layer.v1';
export const COMMANDER_AUTHORITY_CAMERA_CONTRACT = 'field-fronts.commander-authority-camera.v1';

export const SCENARIO_CAMERA_MODES = Object.freeze({
  full_scene: Object.freeze({ id: 'full_scene', label: 'Full Scene', follow: 'map', description: 'Fit the whole 2D map in view.' }),
  commander: Object.freeze({ id: 'commander', label: 'Commander Unit', follow: 'leader_player_01', description: 'Keep the player commander centred while the scenario plays.' }),
  commander_follow_tactical_leash: Object.freeze({ id: 'commander_follow_tactical_leash', label: 'Commander Tactical Leash', follow: 'leader_player_01', description: 'Follow the commander with a bounded local tactical pan and detail radius.' }),
  selected_unit: Object.freeze({ id: 'selected_unit', label: 'Selected Unit', follow: 'selected_entity', description: 'Follow whichever friendly unit or squad is selected.' }),
  selected_point: Object.freeze({ id: 'selected_point', label: 'Selected Point', follow: 'tile', description: 'Lock the 2D camera to an authored map point with adjustable zoom.' })
});

export const DEFAULT_SCENARIO_CAMERA_RIG = Object.freeze({
  mode: 'full_scene',
  zoom: 1,
  point: null,
  followEntityId: null,
  cueId: null,
  followStrength: 0.08,
  softLeashStartTiles: 7,
  maxPanDistanceTiles: 12,
  commandRadiusTiles: 12,
  detailRadiusTiles: 18,
  farDetailRadiusTiles: 28,
  fogOfWarMode: 'none'
});

export const FIRST_NIGHT_CAMERA_RIG = Object.freeze({
  ...DEFAULT_SCENARIO_CAMERA_RIG,
  mode: 'commander_follow_tactical_leash',
  zoom: 1.65,
  followEntityId: 'leader_player_01',
  fogOfWarMode: 'commander_los'
});

export const SCENARIO_STORY_PRESETS = Object.freeze({
  first_night: Object.freeze({
    id: 'first_night',
    label: 'The First Night',
    tone: 'night wilderness survival',
    cameraShakeIntensity: 0.2,
    speechDensity: 0.22
  }),
  black_sky_arrival: Object.freeze({
    id: 'black_sky_arrival',
    label: 'Black Sky Arrival',
    tone: 'ominous frontier myth',
    cameraShakeIntensity: 0.64,
    speechDensity: 0.72
  }),
  ash_road_patrol: Object.freeze({
    id: 'ash_road_patrol',
    label: 'Ash Road Patrol',
    tone: 'gritty patrol aftermath',
    cameraShakeIntensity: 0.46,
    speechDensity: 0.52
  }),
  silent_ruins: Object.freeze({
    id: 'silent_ruins',
    label: 'Silent Ruins',
    tone: 'quiet environmental storytelling',
    cameraShakeIntensity: 0.28,
    speechDensity: 0.18
  })
});

const LOCATION_NAMES = Object.freeze([
  'The Split Banner',
  'Blackroot Ford',
  'Old Signal Cairn',
  'The Bone-Dry Well',
  'Ash Prayer Stones',
  'Collapsed Waystation',
  'Stormglass Ridge',
  'The Last Cookfire'
]);

const ITEM_NAMES = Object.freeze([
  'torn command banner',
  'sealed ration crate',
  'burnt map case',
  'cracked signal horn',
  'field surgeon satchel',
  'charred family charm',
  'blood-rusted spear bundle',
  'storm-blackened idol'
]);

const ASSET_NAMES = Object.freeze([
  'smoke column',
  'crow spiral',
  'torn prayer flags',
  'half-buried wagon',
  'blue lightning fork',
  'wind-scoured bones',
  'embers in wet ash',
  'collapsed watch pole'
]);

const CHARACTER_ARCHETYPES = Object.freeze([
  { role: 'wounded-scout', label: 'Wounded Scout', bubble: 'Storm took the ridge.' },
  { role: 'silent-child', label: 'Silent Child', bubble: '...' },
  { role: 'old-builder', label: 'Old Builder', bubble: 'Walls first. Questions later.' },
  { role: 'ash-priest', label: 'Ash Priest', bubble: 'Do not look up when it glows.' },
  { role: 'lost-carrier', label: 'Lost Carrier', bubble: 'I had orders. I lost the road.' }
]);

export function createRandomScenarioSeed(prefix = 'scene') {
  const entropy = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
  return `${prefix}-${entropy}`;
}

export function createScenarioLayerForMap(map, { seed = createRandomScenarioSeed(), preset = 'black_sky_arrival' } = {}) {
  const storyPreset = normaliseStoryPreset(preset);
  if (storyPreset.id === 'first_night') {
    return createFirstNightScenarioLayer(map, seed);
  }
  const rng = createSeededRng(`${seed}:${storyPreset.id}:scenario-layer`);
  const anchors = buildScenarioAnchors(map, seed, rng);
  const locations = createLocations(map, anchors, seed, rng, storyPreset);
  const items = createItems(map, anchors, locations, seed, rng);
  const assets = createAssets(map, anchors, locations, seed, rng, storyPreset);
  const characters = createCharacters(map, anchors, seed, rng, storyPreset);
  const storyBeats = createStoryBeats(map, anchors, locations, characters, seed, storyPreset);
  const cameraCues = createCameraCues(storyBeats, locations, seed, rng, storyPreset);
  const speechBubbles = createSpeechBubbles(characters, storyBeats, storyPreset);

  return normaliseScenarioLayer({
    contract: SCENARIO_LAYER_VERSION,
    seed,
    preset: storyPreset.id,
    generatedAt: new Date().toISOString(),
    authoringLayer: 'above-map-maker',
    status: 'draft',
    notes: 'Scenario layer is narrative metadata over the terrain map. It does not alter pathfinding or terrain passability.',
    storyBeats,
    locations,
    items,
    assets,
    characters,
    speechBubbles,
    cameraCues,
    effects: createEffects(storyBeats, cameraCues, assets),
    cameraRig: createDefaultScenarioCameraRig(storyBeats)
  });
}

export function normaliseStoryPreset(preset = 'black_sky_arrival') {
  if (typeof preset === 'string' && SCENARIO_STORY_PRESETS[preset]) {
    return SCENARIO_STORY_PRESETS[preset];
  }
  if (preset && typeof preset === 'object') {
    const base = SCENARIO_STORY_PRESETS[preset.id] ?? SCENARIO_STORY_PRESETS.black_sky_arrival;
    return Object.freeze({ ...base, ...preset, id: preset.id ?? base.id, label: preset.label ?? base.label });
  }
  return SCENARIO_STORY_PRESETS.black_sky_arrival;
}

export function normaliseScenarioLayer(layer) {
  if (!layer || typeof layer !== 'object') {
    return null;
  }
  const seed = typeof layer.seed === 'string' && layer.seed.trim() ? layer.seed.trim() : 'scenario-unknown';
  const preset = typeof layer.preset === 'string' && SCENARIO_STORY_PRESETS[layer.preset]
    ? layer.preset
    : 'black_sky_arrival';
  const firstNightCameraNeedsUpgrade = preset === 'first_night'
    && layer.cameraAuthorityContract !== COMMANDER_AUTHORITY_CAMERA_CONTRACT;
  return {
    contract: SCENARIO_LAYER_VERSION,
    seed,
    preset,
    generatedAt: typeof layer.generatedAt === 'string' ? layer.generatedAt : null,
    authoringLayer: 'above-map-maker',
    status: typeof layer.status === 'string' ? layer.status : 'draft',
    cameraAuthorityContract: preset === 'first_night' ? COMMANDER_AUTHORITY_CAMERA_CONTRACT : null,
    notes: typeof layer.notes === 'string'
      ? layer.notes
      : 'Scenario layer is narrative metadata over the terrain map.',
    type: typeof layer.type === 'string' ? layer.type : null,
    biomeTheme: typeof layer.biomeTheme === 'string' ? layer.biomeTheme : null,
    techLevel: typeof layer.techLevel === 'string' ? layer.techLevel : null,
    allowedHumanTech: Array.isArray(layer.allowedHumanTech) ? layer.allowedHumanTech.filter((entry) => typeof entry === 'string') : [],
    shelterNodes: normaliseScenarioEntries(layer.shelterNodes, normaliseShelterLayerNode),
    storyBeats: normaliseScenarioEntries(layer.storyBeats, normaliseStoryBeat),
    locations: normaliseScenarioEntries(layer.locations, normaliseLocation),
    items: normaliseScenarioEntries(layer.items, normaliseItem),
    assets: normaliseScenarioEntries(layer.assets, normaliseAsset),
    characters: normaliseScenarioEntries(layer.characters, normaliseCharacter),
    speechBubbles: normaliseScenarioEntries(layer.speechBubbles, normaliseSpeechBubble),
    cameraCues: normaliseScenarioEntries(layer.cameraCues, normaliseCameraCue),
    effects: normaliseScenarioEntries(layer.effects, normaliseEffect),
    cameraRig: normaliseScenarioCameraRig(
      firstNightCameraNeedsUpgrade ? FIRST_NIGHT_CAMERA_RIG : layer.cameraRig,
      { fallbackPoint: normaliseTile(layer.storyBeats?.[0]?.tile) }
    )
  };
}

function createFirstNightScenarioLayer(map, seed) {
  const shelterNodes = getShelterNodes(map);
  const findNode = (type) => shelterNodes.find((node) => node.shelterType === type);
  const firstTrees = findNode('LIGHT_TREE_COVER');
  const canopy = findNode('DENSE_CANOPY');
  const boulders = findNode('BOULDER_COVER');
  const reeds = findNode('REED_BED');
  const thorns = findNode('THORN_SCRUB');
  const finalShelter = findNode('SHALLOW_CAVE') ?? findNode('CLIFF_OVERHANG');
  const start = findNode('EXPOSED_CLEARING')?.tile ?? map?.scenario?.starts?.player ?? { x: 7, y: 21 };
  const locations = [
    { id: 'location_exposed_start', name: 'Exposed grassland', kind: 'exposed_clearing', tile: start, visualHint: 'open dusk slope' },
    { id: 'location_animal_trail', name: 'Animal trail', kind: 'light_tree_cover', tile: firstTrees?.tile, visualHint: 'sparse branches' },
    { id: 'location_dense_canopy', name: 'Dense canopy', kind: 'shelter_chain', tile: canopy?.tile, visualHint: 'dark leaf cover' },
    { id: 'location_boulders', name: 'Boulder cluster', kind: 'natural_cover', tile: boulders?.tile, visualHint: 'broken sight lines' },
    { id: 'location_reeds', name: 'Muddy reed crossing', kind: 'natural_hazard', tile: reeds?.tile, visualHint: 'shallow water and reeds' },
    { id: 'location_thorns', name: 'Thorn scrub choke', kind: 'natural_choke', tile: thorns?.tile, visualHint: 'tight passage beneath branches' },
    { id: 'location_shelter', name: 'Shallow cave shelter', kind: 'final_shelter', tile: finalShelter?.tile, visualHint: 'dark overhang' }
  ].filter((entry) => entry.tile).map((entry) => ({
    ...entry,
    mood: 'hushed night movement',
    reveal: 'visible_on_map'
  }));
  const items = [
    { id: 'item_arrows', name: 'wrapped arrow bundle', kind: 'supply', tile: start, state: 'carried', reveal: 'visible_on_map', storyValue: 0.42 },
    { id: 'item_supplies', name: 'hand-carried supplies', kind: 'supply', tile: firstTrees?.tile, state: 'carried', reveal: 'visible_on_map', storyValue: 0.64 },
    { id: 'item_tinder', name: 'dry tinder pouch', kind: 'supply', tile: canopy?.tile, state: 'carried', reveal: 'nearby_only', storyValue: 0.36 }
  ].filter((entry) => entry.tile);
  const assets = [
    { id: 'asset_mist', name: 'mist pocket', kind: 'weather', tile: reeds?.tile, intensity: 0.52, animation: 'idle_loop', palette: 'moon_mist' },
    { id: 'asset_fallen_tree', name: 'fallen tree', kind: 'terrain_detail', tile: thorns?.tile, intensity: 0.58, animation: 'idle_loop', palette: 'wet_bark' },
    { id: 'asset_torch', name: 'covered torch glow', kind: 'light_risk', tile: start, intensity: 0.42, animation: 'sporadic_glow', palette: 'ember_gold' },
    { id: 'asset_reeds', name: 'wind through reeds', kind: 'weather', tile: reeds?.tile, intensity: 0.38, animation: 'wind_rattle', palette: 'moon_mist' }
  ].filter((entry) => entry.tile);
  const characters = [
    { id: 'character_leader', name: 'Tribal Leader', role: 'leader', tile: start, factionId: 'player', posture: 'still', reveal: 'visible_on_map', speechBubbleId: 'speech_leader', nonVerbalCue: 'gesture' },
    { id: 'character_wounded', name: 'Wounded Survivor', role: 'wounded', tile: start, factionId: 'player', posture: 'still', reveal: 'visible_on_map', speechBubbleId: 'speech_wounded', nonVerbalCue: 'gesture' }
  ];
  const storyBeats = [
    {
      id: 'beat_leave_exposure',
      title: 'Leave the open ground',
      type: 'movement_instruction',
      tile: firstTrees?.tile ?? start,
      trigger: { kind: 'proximity', radius: 4, once: true },
      cue: 'Move quietly beneath the first branches.',
      cameraCueId: 'camera_first_trees',
      speechBubbleIds: []
    },
    {
      id: 'beat_use_canopy',
      title: 'Keep beneath the canopy',
      type: 'shelter_instruction',
      tile: canopy?.tile ?? firstTrees?.tile ?? start,
      trigger: { kind: 'proximity', radius: 4, once: true },
      cue: 'Gather the frightened group beneath leaf cover.',
      cameraCueId: 'camera_canopy',
      speechBubbleIds: []
    },
    {
      id: 'beat_cross_in_dark',
      title: 'Cross with the light covered',
      type: 'light_risk_instruction',
      tile: reeds?.tile ?? boulders?.tile ?? start,
      trigger: { kind: 'proximity', radius: 4, once: true },
      cue: 'Torch glow carries across water and mist.',
      cameraCueId: 'camera_crossing',
      speechBubbleIds: []
    },
    {
      id: 'beat_regroup',
      title: 'Regroup beneath the overhang',
      type: 'survival_goal',
      tile: finalShelter?.tile ?? start,
      trigger: { kind: 'proximity', radius: 4, once: true },
      cue: 'Bring enough survivors into deep shelter.',
      cameraCueId: 'camera_shelter',
      speechBubbleIds: []
    }
  ];
  const cameraCues = storyBeats.map((beat) => ({
    id: beat.cameraCueId,
    beatId: beat.id,
    tile: beat.tile,
    kind: 'small_shake',
    durationMs: 320,
    strengthPx: 1,
    easing: 'decay',
    followLocationId: null
  }));
  return normaliseScenarioLayer({
    contract: SCENARIO_LAYER_VERSION,
    seed,
    preset: 'first_night',
    generatedAt: new Date().toISOString(),
    authoringLayer: 'above-map-maker',
    status: 'playable_blockout',
    notes: 'Short survival-command blockout through living terrain, darkness and natural shelter.',
    type: 'opening_survival_tutorial',
    biomeTheme: 'naturalistic_nomadic_wilderness',
    techLevel: 'tribal_nomadic',
    allowedHumanTech: ['bows', 'arrows', 'torches', 'rudimentary tents', 'hand-carried supplies'],
    shelterNodes,
    locations,
    items,
    assets,
    characters,
    storyBeats,
    speechBubbles: [
      { id: 'speech_leader', characterId: 'character_leader', beatId: 'beat_leave_exposure', text: 'Stay close. Keep low.', emote: 'whisper', reveal: 'visible_on_map', durationTicks: 5 },
      { id: 'speech_wounded', characterId: 'character_wounded', beatId: 'beat_regroup', text: '', emote: 'breath', reveal: 'visible_on_map', durationTicks: 3, nonVerbalFallback: 'leans on a forager' }
    ],
    cameraCues,
    effects: [
      { id: 'effect_torch', kind: 'torch_glow', tile: start, assetId: 'asset_torch', animation: 'sporadic_glow', intensity: 0.42 },
      { id: 'effect_mist', kind: 'ambient_weather', tile: reeds?.tile, assetId: 'asset_mist', animation: 'idle_loop', intensity: 0.52 }
    ].filter((entry) => entry.tile),
    cameraRig: normaliseScenarioCameraRig(FIRST_NIGHT_CAMERA_RIG)
  });
}

export function summarizeScenarioLayer(layer) {
  const safe = normaliseScenarioLayer(layer);
  if (!safe) {
    return {
      present: false,
      contract: SCENARIO_LAYER_VERSION,
      seed: null,
      preset: null,
      storyBeats: 0,
      locations: 0,
      items: 0,
      assets: 0,
      characters: 0,
      speechBubbles: 0,
      cameraCues: 0,
      effects: 0,
      cameraRig: { ...DEFAULT_SCENARIO_CAMERA_RIG }
    };
  }
  return {
    present: true,
    contract: safe.contract,
    seed: safe.seed,
    preset: safe.preset,
    storyBeats: safe.storyBeats.length,
    locations: safe.locations.length,
    items: safe.items.length,
    assets: safe.assets.length,
    characters: safe.characters.length,
    speechBubbles: safe.speechBubbles.length,
    cameraCues: safe.cameraCues.length,
    effects: safe.effects.length,
    cameraRig: safe.cameraRig
  };
}


export function normaliseScenarioCameraRig(rig, { fallbackPoint = null } = {}) {
  const source = rig && typeof rig === 'object' ? rig : DEFAULT_SCENARIO_CAMERA_RIG;
  const mode = typeof source.mode === 'string' && SCENARIO_CAMERA_MODES[source.mode]
    ? source.mode
    : DEFAULT_SCENARIO_CAMERA_RIG.mode;
  const zoom = clampZoom(source.zoom);
  const point = normaliseTile(source.point) ?? normaliseTile(fallbackPoint);
  return {
    mode,
    zoom: mode === 'full_scene' ? 1 : zoom,
    point: mode === 'selected_point' ? point : normaliseTile(source.point),
    followEntityId: typeof source.followEntityId === 'string' ? source.followEntityId : null,
    cueId: typeof source.cueId === 'string' ? source.cueId : null,
    followStrength: clampCameraValue(source.followStrength, DEFAULT_SCENARIO_CAMERA_RIG.followStrength, 0.02, 0.18),
    softLeashStartTiles: clampCameraValue(source.softLeashStartTiles, DEFAULT_SCENARIO_CAMERA_RIG.softLeashStartTiles, 2, 24),
    maxPanDistanceTiles: clampCameraValue(source.maxPanDistanceTiles, DEFAULT_SCENARIO_CAMERA_RIG.maxPanDistanceTiles, 3, 36),
    commandRadiusTiles: clampCameraValue(source.commandRadiusTiles, DEFAULT_SCENARIO_CAMERA_RIG.commandRadiusTiles, 3, 40),
    detailRadiusTiles: clampCameraValue(source.detailRadiusTiles, DEFAULT_SCENARIO_CAMERA_RIG.detailRadiusTiles, 4, 48),
    farDetailRadiusTiles: clampCameraValue(source.farDetailRadiusTiles, DEFAULT_SCENARIO_CAMERA_RIG.farDetailRadiusTiles, 6, 72),
    fogOfWarMode: typeof source.fogOfWarMode === 'string' ? source.fogOfWarMode : DEFAULT_SCENARIO_CAMERA_RIG.fogOfWarMode
  };
}

export function createDefaultScenarioCameraRig(storyBeats = []) {
  const firstPoint = normaliseTile(storyBeats?.[0]?.tile);
  return normaliseScenarioCameraRig({
    ...DEFAULT_SCENARIO_CAMERA_RIG,
    point: firstPoint
  }, { fallbackPoint: firstPoint });
}

export function updateScenarioCameraRig(layer, patch = {}) {
  const safe = normaliseScenarioLayer(layer);
  if (!safe) {
    return normaliseScenarioCameraRig(patch);
  }
  return {
    ...safe,
    cameraRig: normaliseScenarioCameraRig({
      ...safe.cameraRig,
      ...(patch ?? {})
    }, { fallbackPoint: safe.storyBeats?.[0]?.tile })
  };
}

function clampZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.round(Math.max(1, Math.min(4, numeric)) * 100) / 100;
}

function clampCameraValue(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.max(min, Math.min(max, numeric)) * 100) / 100;
}

function buildScenarioAnchors(map, seed, rng) {
  const starts = map?.scenario?.starts ?? {};
  const player = normaliseTile(starts.player) ?? chooseViableTile(map, { x: Math.round(map.width * 0.18), y: Math.round(map.height * 0.52) }, { seed, salt: 'player-anchor' });
  const enemy = normaliseTile(starts.enemy) ?? chooseViableTile(map, { x: Math.round(map.width * 0.82), y: Math.round(map.height * 0.52) }, { seed, salt: 'enemy-anchor', avoid: [player] });
  const outposts = Array.isArray(map?.scenario?.neutralOutposts)
    ? map.scenario.neutralOutposts.map((outpost) => normaliseTile(outpost?.tile)).filter(Boolean)
    : [];
  const midpoint = chooseViableTile(map, {
    x: Math.round((player.x + enemy.x) / 2),
    y: Math.round((player.y + enemy.y) / 2)
  }, { seed, salt: 'midpoint', avoid: [player, enemy] });
  const flankA = chooseViableTile(map, {
    x: Math.round(map.width * (0.32 + rng() * 0.12)),
    y: Math.round(map.height * (0.24 + rng() * 0.16))
  }, { seed, salt: 'flank-a', avoid: [player, enemy, midpoint] });
  const flankB = chooseViableTile(map, {
    x: Math.round(map.width * (0.58 + rng() * 0.12)),
    y: Math.round(map.height * (0.62 + rng() * 0.16))
  }, { seed, salt: 'flank-b', avoid: [player, enemy, midpoint, flankA] });

  return {
    player,
    enemy,
    midpoint,
    outposts,
    all: [player, enemy, midpoint, flankA, flankB, ...outposts].filter(Boolean)
  };
}

function createLocations(map, anchors, seed, rng, preset) {
  const targets = [anchors.midpoint, ...anchors.outposts, anchors.all[3], anchors.all[4]].filter(Boolean).slice(0, 6);
  return targets.map((target, index) => {
    const tile = chooseViableTile(map, jitterTile(target, rng, 4), {
      seed,
      salt: `location-${index}`,
      avoid: targets.slice(0, index),
      minDistance: Math.max(4, Math.min(map.width, map.height) * 0.045),
      preferHighGround: index % 2 === 0
    });
    return {
      id: `location_${String(index + 1).padStart(2, '0')}`,
      name: LOCATION_NAMES[(index + Math.floor(rng() * LOCATION_NAMES.length)) % LOCATION_NAMES.length],
      kind: index === 0 ? 'story_anchor' : index % 2 === 0 ? 'ruin' : 'landmark',
      tile,
      mood: preset.tone,
      visualHint: index === 0 ? 'main scenario anchor' : index % 2 === 0 ? 'broken silhouette' : 'distant marker',
      reveal: 'visible_on_map'
    };
  });
}

function createItems(map, anchors, locations, seed, rng) {
  const sourceTiles = [...locations.map((entry) => entry.tile), anchors.player, anchors.midpoint].filter(Boolean);
  return sourceTiles.slice(0, 7).map((target, index) => {
    const tile = chooseViableTile(map, jitterTile(target, rng, 3), {
      seed,
      salt: `item-${index}`,
      avoid: sourceTiles.slice(0, index),
      minDistance: 2
    });
    return {
      id: `item_${String(index + 1).padStart(2, '0')}`,
      name: ITEM_NAMES[(index + Math.floor(rng() * ITEM_NAMES.length)) % ITEM_NAMES.length],
      kind: index % 3 === 0 ? 'clue' : index % 3 === 1 ? 'supply' : 'relic',
      tile,
      state: 'unclaimed',
      reveal: index < 2 ? 'visible_on_map' : 'nearby_only',
      storyValue: round3(0.42 + rng() * 0.44)
    };
  });
}

function createAssets(map, anchors, locations, seed, rng, preset) {
  const sourceTiles = [anchors.enemy, anchors.midpoint, ...locations.map((entry) => entry.tile)].filter(Boolean);
  return sourceTiles.slice(0, 8).map((target, index) => {
    const tile = chooseViableTile(map, jitterTile(target, rng, 5), {
      seed,
      salt: `asset-${index}`,
      avoid: sourceTiles.slice(0, index),
      minDistance: 2,
      allowRoughTerrain: true
    });
    return {
      id: `asset_${String(index + 1).padStart(2, '0')}`,
      name: ASSET_NAMES[(index + Math.floor(rng() * ASSET_NAMES.length)) % ASSET_NAMES.length],
      kind: index % 4 === 0 ? 'weather' : index % 4 === 1 ? 'debris' : index % 4 === 2 ? 'wildlife' : 'camp_trace',
      tile,
      intensity: round3(0.35 + rng() * 0.52),
      animation: index % 4 === 0 ? 'sporadic_glow' : index % 4 === 1 ? 'wind_rattle' : 'idle_loop',
      palette: preset.id === 'silent_ruins' ? 'muted_ash' : 'black_sky_blue'
    };
  });
}

function createCharacters(map, anchors, seed, rng, preset) {
  const targets = [anchors.player, anchors.midpoint, ...anchors.outposts, anchors.all[3]].filter(Boolean).slice(0, 5);
  return targets.map((target, index) => {
    const archetype = CHARACTER_ARCHETYPES[(index + Math.floor(rng() * CHARACTER_ARCHETYPES.length)) % CHARACTER_ARCHETYPES.length];
    const tile = chooseViableTile(map, jitterTile(target, rng, 3), {
      seed,
      salt: `character-${index}`,
      avoid: targets.slice(0, index),
      minDistance: 3
    });
    return {
      id: `character_${String(index + 1).padStart(2, '0')}`,
      name: archetype.label,
      role: archetype.role,
      tile,
      factionId: index === 0 ? 'player' : 'neutral',
      posture: index % 2 === 0 ? 'still' : 'patrol_short',
      reveal: index <= 1 ? 'visible_on_map' : 'line_of_sight',
      speechBubbleId: `speech_${String(index + 1).padStart(2, '0')}`,
      nonVerbalCue: preset.id === 'silent_ruins' || rng() > preset.speechDensity ? 'gesture' : 'speech'
    };
  });
}

function createStoryBeats(map, anchors, locations, characters, seed, preset) {
  const firstLocation = locations[0]?.tile ?? anchors.midpoint;
  const secondLocation = locations[1]?.tile ?? anchors.outposts[0] ?? anchors.midpoint;
  const thirdLocation = locations[2]?.tile ?? anchors.enemy;
  return [
    {
      id: 'beat_001_arrival_pressure',
      title: 'The sky opens without rain',
      type: 'environmental_reveal',
      tile: chooseViableTile(map, firstLocation, { seed, salt: 'beat-1', avoid: [anchors.player], minDistance: 4 }),
      trigger: { kind: 'proximity', radius: 6, once: true },
      cue: 'blue lightning blooms behind black cloud cover',
      cameraCueId: 'camera_001_storm_glow',
      speechBubbleIds: []
    },
    {
      id: 'beat_002_found_survivor',
      title: 'Someone got here first',
      type: 'character_discovery',
      tile: characters[1]?.tile ?? secondLocation,
      trigger: { kind: 'line_of_sight', radius: 5, once: true },
      cue: 'survivor silhouette turns away from the ruined outpost',
      cameraCueId: 'camera_002_small_shudder',
      speechBubbleIds: characters[1]?.speechBubbleId ? [characters[1].speechBubbleId] : []
    },
    {
      id: 'beat_003_ground_answers',
      title: 'The road remembers weight',
      type: 'item_clue_chain',
      tile: chooseViableTile(map, secondLocation, { seed, salt: 'beat-3', avoid: [anchors.player, anchors.enemy], minDistance: 5 }),
      trigger: { kind: 'item_seen', radius: 4, once: true },
      cue: 'old supplies, churned mud, and broken arrows point towards the ridge',
      cameraCueId: 'camera_003_distant_impact',
      speechBubbleIds: []
    },
    {
      id: 'beat_004_enemy_shadow',
      title: 'Movement under the black sky',
      type: 'threat_foreshadow',
      tile: chooseViableTile(map, thirdLocation, { seed, salt: 'beat-4', avoid: [anchors.player], minDistance: 8, allowRoughTerrain: true }),
      trigger: { kind: 'timer_or_scouting', afterTicks: 18, once: true },
      cue: 'distant torches blink out as enemy pressure rises',
      cameraCueId: 'camera_004_rumble',
      speechBubbleIds: []
    }
  ];
}

function createCameraCues(storyBeats, locations, seed, rng, preset) {
  return storyBeats.map((beat, index) => ({
    id: beat.cameraCueId ?? `camera_${String(index + 1).padStart(3, '0')}`,
    beatId: beat.id,
    tile: beat.tile,
    kind: index === 0 ? 'lightning_glow' : index === 1 ? 'small_shake' : 'distant_rumble',
    durationMs: index === 0 ? 900 : 420 + Math.round(rng() * 360),
    strengthPx: Math.round((3 + index * 2 + rng() * 4) * preset.cameraShakeIntensity),
    easing: 'decay',
    followLocationId: locations[index % Math.max(1, locations.length)]?.id ?? null
  }));
}

function createSpeechBubbles(characters, storyBeats, preset) {
  return characters
    .map((character, index) => {
      const archetype = CHARACTER_ARCHETYPES.find((entry) => entry.role === character.role) ?? CHARACTER_ARCHETYPES[0];
      const visible = character.nonVerbalCue === 'speech' || index === 0;
      return {
        id: character.speechBubbleId,
        characterId: character.id,
        beatId: storyBeats[index % storyBeats.length]?.id ?? null,
        text: visible ? archetype.bubble : '',
        emote: visible ? 'mutter' : 'look-away',
        reveal: character.reveal,
        durationTicks: visible ? 5 + index : 3,
        nonVerbalFallback: visible ? null : 'points towards smoke without speaking'
      };
    })
    .filter((bubble) => bubble.id);
}

function createEffects(storyBeats, cameraCues, assets) {
  const weatherEffects = assets
    .filter((asset) => asset.kind === 'weather')
    .map((asset, index) => ({
      id: `effect_weather_${String(index + 1).padStart(2, '0')}`,
      kind: 'ambient_weather',
      tile: asset.tile,
      assetId: asset.id,
      animation: asset.animation,
      intensity: asset.intensity
    }));
  const beatEffects = storyBeats.map((beat, index) => ({
    id: `effect_beat_${String(index + 1).padStart(2, '0')}`,
    kind: index === 0 ? 'lightning_flash' : index === 3 ? 'distant_thunder' : 'story_pulse',
    tile: beat.tile,
    beatId: beat.id,
    cameraCueId: beat.cameraCueId ?? cameraCues[index]?.id ?? null,
    intensity: round3(0.45 + index * 0.12)
  }));
  return [...weatherEffects, ...beatEffects];
}

function normaliseScenarioEntries(entries, normaliser) {
  return Array.isArray(entries) ? entries.map(normaliser).filter(Boolean) : [];
}

function normaliseStoryBeat(entry, index = 0) {
  const tile = normaliseTile(entry?.tile);
  if (!tile) return null;
  return {
    id: normaliseId(entry?.id, `beat_${String(index + 1).padStart(3, '0')}`),
    title: typeof entry?.title === 'string' ? entry.title : 'Untitled beat',
    type: typeof entry?.type === 'string' ? entry.type : 'environmental_reveal',
    tile,
    trigger: entry?.trigger && typeof entry.trigger === 'object' ? { ...entry.trigger } : { kind: 'proximity', radius: 5, once: true },
    cue: typeof entry?.cue === 'string' ? entry.cue : '',
    cameraCueId: typeof entry?.cameraCueId === 'string' ? entry.cameraCueId : null,
    speechBubbleIds: Array.isArray(entry?.speechBubbleIds) ? entry.speechBubbleIds.filter((id) => typeof id === 'string') : []
  };
}

function normaliseLocation(entry, index = 0) {
  const tile = normaliseTile(entry?.tile);
  if (!tile) return null;
  return {
    id: normaliseId(entry?.id, `location_${String(index + 1).padStart(2, '0')}`),
    name: typeof entry?.name === 'string' ? entry.name : `Location ${index + 1}`,
    kind: typeof entry?.kind === 'string' ? entry.kind : 'landmark',
    tile,
    mood: typeof entry?.mood === 'string' ? entry.mood : 'unknown',
    visualHint: typeof entry?.visualHint === 'string' ? entry.visualHint : 'marker',
    reveal: typeof entry?.reveal === 'string' ? entry.reveal : 'visible_on_map'
  };
}

function normaliseItem(entry, index = 0) {
  const tile = normaliseTile(entry?.tile);
  if (!tile) return null;
  return {
    id: normaliseId(entry?.id, `item_${String(index + 1).padStart(2, '0')}`),
    name: typeof entry?.name === 'string' ? entry.name : `Item ${index + 1}`,
    kind: typeof entry?.kind === 'string' ? entry.kind : 'clue',
    tile,
    state: typeof entry?.state === 'string' ? entry.state : 'unclaimed',
    reveal: typeof entry?.reveal === 'string' ? entry.reveal : 'nearby_only',
    storyValue: clamp01(Number(entry?.storyValue) || 0)
  };
}

function normaliseAsset(entry, index = 0) {
  const tile = normaliseTile(entry?.tile);
  if (!tile) return null;
  return {
    id: normaliseId(entry?.id, `asset_${String(index + 1).padStart(2, '0')}`),
    name: typeof entry?.name === 'string' ? entry.name : `Asset ${index + 1}`,
    kind: typeof entry?.kind === 'string' ? entry.kind : 'camp_trace',
    tile,
    intensity: clamp01(Number(entry?.intensity) || 0.5),
    animation: typeof entry?.animation === 'string' ? entry.animation : 'idle_loop',
    palette: typeof entry?.palette === 'string' ? entry.palette : 'black_sky_blue'
  };
}

function normaliseCharacter(entry, index = 0) {
  const tile = normaliseTile(entry?.tile);
  if (!tile) return null;
  return {
    id: normaliseId(entry?.id, `character_${String(index + 1).padStart(2, '0')}`),
    name: typeof entry?.name === 'string' ? entry.name : `Character ${index + 1}`,
    role: typeof entry?.role === 'string' ? entry.role : 'neutral',
    tile,
    factionId: typeof entry?.factionId === 'string' ? entry.factionId : 'neutral',
    posture: typeof entry?.posture === 'string' ? entry.posture : 'still',
    reveal: typeof entry?.reveal === 'string' ? entry.reveal : 'line_of_sight',
    speechBubbleId: typeof entry?.speechBubbleId === 'string' ? entry.speechBubbleId : null,
    nonVerbalCue: typeof entry?.nonVerbalCue === 'string' ? entry.nonVerbalCue : 'gesture'
  };
}

function normaliseSpeechBubble(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    id: normaliseId(entry.id, `speech_${String(index + 1).padStart(2, '0')}`),
    characterId: typeof entry.characterId === 'string' ? entry.characterId : null,
    beatId: typeof entry.beatId === 'string' ? entry.beatId : null,
    text: typeof entry.text === 'string' ? entry.text : '',
    emote: typeof entry.emote === 'string' ? entry.emote : 'mutter',
    reveal: typeof entry.reveal === 'string' ? entry.reveal : 'line_of_sight',
    durationTicks: clampInteger(entry.durationTicks, 1, 20, 5),
    nonVerbalFallback: typeof entry.nonVerbalFallback === 'string' ? entry.nonVerbalFallback : null
  };
}

function normaliseCameraCue(entry, index = 0) {
  const tile = normaliseTile(entry?.tile);
  if (!tile) return null;
  return {
    id: normaliseId(entry?.id, `camera_${String(index + 1).padStart(3, '0')}`),
    beatId: typeof entry?.beatId === 'string' ? entry.beatId : null,
    tile,
    kind: typeof entry?.kind === 'string' ? entry.kind : 'small_shake',
    durationMs: clampInteger(entry?.durationMs, 80, 2400, 500),
    strengthPx: clampInteger(entry?.strengthPx, 0, 24, 5),
    easing: typeof entry?.easing === 'string' ? entry.easing : 'decay',
    followLocationId: typeof entry?.followLocationId === 'string' ? entry.followLocationId : null
  };
}

function normaliseEffect(entry, index = 0) {
  const tile = normaliseTile(entry?.tile);
  if (!tile) return null;
  return {
    id: normaliseId(entry?.id, `effect_${String(index + 1).padStart(2, '0')}`),
    kind: typeof entry?.kind === 'string' ? entry.kind : 'story_pulse',
    tile,
    assetId: typeof entry?.assetId === 'string' ? entry.assetId : null,
    beatId: typeof entry?.beatId === 'string' ? entry.beatId : null,
    cameraCueId: typeof entry?.cameraCueId === 'string' ? entry.cameraCueId : null,
    animation: typeof entry?.animation === 'string' ? entry.animation : 'idle_loop',
    intensity: clamp01(Number(entry?.intensity) || 0.5)
  };
}

function normaliseShelterLayerNode(entry, index = 0) {
  const tile = normaliseTile(entry?.tile ?? entry?.position);
  if (!tile) return null;
  return {
    id: normaliseId(entry?.id, `shelter_${String(index + 1).padStart(2, '0')}`),
    type: typeof entry?.shelterType === 'string' ? entry.shelterType : typeof entry?.type === 'string' ? entry.type : 'LIGHT_TREE_COVER',
    position: tile,
    region: typeof entry?.region === 'string' ? entry.region : null,
    shelterRating: clamp01(Number(entry?.shelterRating) || 0),
    visibilityModifier: Number.isFinite(Number(entry?.visibilityModifier)) ? Number(entry.visibilityModifier) : 0,
    movementModifier: clamp01(Number(entry?.movementModifier) || 1),
    tags: Array.isArray(entry?.tags) ? entry.tags.filter((tag) => typeof tag === 'string') : []
  };
}

function chooseViableTile(map, target, { seed = 'scenario', salt = 'tile', avoid = [], minDistance = 0, preferHighGround = false, allowRoughTerrain = false } = {}) {
  const fallback = clampTile(map, target);
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const terrainId = getRawTile(map, x, y);
      if (!allowRoughTerrain && !isNarrativeWalkableTerrain(terrainId)) continue;
      if (terrainId === 'sea' || terrainId === 'river') continue;
      if (avoid.some((tile) => tile && Math.hypot(tile.x - x, tile.y - y) < minDistance)) continue;
      const elevation = getRawElevation(map, x, y);
      const jitter = rngFromTile(seed, x, y, salt) * 0.75;
      const roughPenalty = terrainId === 'mountains' ? 1.8 : terrainId === 'forest' ? 0.45 : 0;
      const score = Math.hypot(target.x - x, target.y - y) + jitter + roughPenalty - (preferHighGround ? elevation * 2.6 : elevation * 0.4);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best ?? fallback;
}

function isNarrativeWalkableTerrain(terrainId) {
  return terrainId === 'land' || terrainId === 'forest';
}

function jitterTile(tile, rng, radius = 3) {
  return {
    x: Math.round((tile?.x ?? 0) + (rng() - 0.5) * radius * 2),
    y: Math.round((tile?.y ?? 0) + (rng() - 0.5) * radius * 2)
  };
}

function getRawTile(map, x, y) {
  return map?.tiles?.[y]?.[x] ?? null;
}

function getRawElevation(map, x, y) {
  const value = map?.elevation?.[y]?.[x];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normaliseTile(tile) {
  if (!Number.isFinite(Number(tile?.x)) || !Number.isFinite(Number(tile?.y))) {
    return null;
  }
  return { x: Math.round(Number(tile.x)), y: Math.round(Number(tile.y)) };
}

function clampTile(map, tile) {
  return {
    x: clampInteger(tile?.x, 1, Math.max(1, (map?.width ?? 4) - 2), Math.floor((map?.width ?? 4) / 2)),
    y: clampInteger(tile?.y, 1, Math.max(1, (map?.height ?? 4) - 2), Math.floor((map?.height ?? 4) / 2))
  };
}

function normaliseId(id, fallback) {
  return typeof id === 'string' && id.trim() ? id.trim() : fallback;
}

function createSeededRng(seed) {
  let state = hash32(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFromTile(seed, x, y, salt) {
  return hashUnit(`${seed}:${salt}:${x}:${y}`);
}

function hashUnit(value) {
  return hash32(value) / 4294967295;
}

function hash32(value) {
  const input = String(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
