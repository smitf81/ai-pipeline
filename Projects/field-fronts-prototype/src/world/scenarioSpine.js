import { COMMANDER_AUTHORITY_CAMERA_CONTRACT, FIRST_NIGHT_CAMERA_RIG, SCENARIO_CAMERA_MODES, normaliseScenarioCameraRig, normaliseScenarioLayer } from './scenarioLayer.js';
import { getShelterNodes, isNomadicSurvivalScene } from './sceneEntity.js';

export const SCENARIO_SPINE_VERSION = 'field-fronts.scenario-spine.v0';
export const SCENARIO_RUNTIME_VERSION = 'field-fronts.scenario-runtime.v0';

export const SCENARIO_SPINE_STATES = Object.freeze({
  inactive: 'inactive',
  opening: 'opening',
  active: 'active',
  resolving: 'resolving',
  completed: 'completed',
  failed: 'failed'
});

const DEFAULT_DISCOVERY_RADIUS = 6;
const DEFAULT_VICTORY_RADIUS = 5;

export function createDefaultScenarioSpine(map, layer = map?.scenario?.scenarioLayer) {
  const safeLayer = normaliseScenarioLayer(layer);
  if (isNomadicSurvivalScene(map) || safeLayer?.preset === 'first_night') {
    return createFirstNightScenarioSpine(map, safeLayer);
  }
  const starts = map?.scenario?.starts ?? {};
  const playerStart = normaliseTile(starts.player) ?? normaliseTile(map?.scenario?.scenarioLayer?.storyBeats?.[0]?.tile) ?? { x: 1, y: 1 };
  const enemyStart = normaliseTile(starts.enemy) ?? { x: Math.max(1, (map?.width ?? 48) - 2), y: Math.max(1, Math.round((map?.height ?? 32) * 0.5)) };
  const outpost = firstNeutralOutpost(map);
  const outpostTile = normaliseTile(outpost?.tile) ?? safeLayer?.locations?.[0]?.tile ?? playerStart;
  const firstBeat = safeLayer?.storyBeats?.[0] ?? null;
  const firstCue = safeLayer?.cameraCues?.[0] ?? null;
  const shelterTile = chooseScenarioOffsetTile(map, playerStart, { dx: 4, dy: -3 }) ?? playerStart;
  const escapeLaneTile = chooseScenarioOffsetTile(map, outpostTile, { dx: -5, dy: 2 }) ?? outpostTile;
  const corpseWarningTile = chooseScenarioOffsetTile(map, outpostTile, { dx: -2, dy: 1 }) ?? outpostTile;
  const ridgeTile = chooseScenarioOffsetTile(map, outpostTile, { dx: 6, dy: -4 }) ?? outpostTile;

  return normaliseScenarioSpine({
    contract: SCENARIO_SPINE_VERSION,
    id: 'chapter_001_spine',
    chapterId: 'chapter_001',
    title: 'Chapter 1',
    designIntent: 'A seamless survival-command scenario: the player directs vulnerable humans through shelter, fear, distraction and regrouping while the black-sky world reveals itself through silhouettes, pressure and terrain events.',
    beginning: {
      id: 'beginning_commanders_first_crossing',
      commanderStart: playerStart,
      openingCamera: {
        mode: 'commander',
        zoom: 1.35,
        point: playerStart
      },
      worldCue: {
        id: 'cue_black_sky_first_omen',
        type: 'lightning_flash',
        label: 'Black sky first omen',
        tile: normaliseTile(firstCue?.tile ?? firstBeat?.tile) ?? playerStart,
        description: 'A hard blue flash rolls behind thick cloud. No dialogue, no pause — just the world warning the commander.'
      },
      silhouette: {
        id: 'silhouette_wing_over_ridge',
        type: 'silhouette_reveal',
        tile: ridgeTile,
        description: 'A wing-shape crosses the ridge for a breath, too large to be a unit, too distant to fight.'
      }
    },
    middle: {
      events: [
        {
          id: 'middle_shelter_lane_revealed',
          label: 'Shelter lane revealed',
          trigger: {
            type: 'tick_reached',
            tick: 2
          },
          effects: [
            { type: 'non_verbal_marker', tile: shelterTile, label: 'shelter-glow', intensity: 0.58 },
            { type: 'storm_pulse', tile: shelterTile, label: 'cover flickers in blue light', intensity: 0.42 }
          ]
        },
        {
          id: 'middle_outpost_discovered',
          label: 'Neutral outpost discovered',
          trigger: {
            type: 'commander_near_outpost',
            outpostId: outpost?.id ?? 'outpost_neutral_01',
            radius: DEFAULT_DISCOVERY_RADIUS
          },
          effects: [
            { type: 'non_verbal_marker', tile: outpostTile, label: 'outpost-glow', intensity: 0.76 },
            { type: 'smoke_column', tile: outpostTile, label: 'thin smoke from empty watchfires', intensity: 0.62 }
          ]
        },
        {
          id: 'middle_noise_draws_attention',
          label: 'Noise draws attention',
          trigger: {
            type: 'tick_reached',
            tick: 5
          },
          effects: [
            { type: 'attention_ping', tile: escapeLaneTile, label: 'something moves through the grass', intensity: 0.64 },
            { type: 'non_verbal_marker', tile: escapeLaneTile, label: 'bait route', intensity: 0.48 }
          ]
        },
        {
          id: 'middle_body_wall_warning',
          label: 'Body wall warning',
          trigger: {
            type: 'event_triggered',
            eventId: 'middle_noise_draws_attention'
          },
          effects: [
            { type: 'corpse_warning', tile: corpseWarningTile, label: 'bodies change the road', intensity: 0.68 },
            { type: 'camera_nudge', tile: corpseWarningTile, label: 'look at the blocked ground', intensity: 0.34 }
          ]
        },
        {
          id: 'middle_enemy_pressure',
          label: 'Enemy pressure stirs',
          trigger: {
            type: 'tick_reached',
            tick: 8
          },
          effects: [
            { type: 'enemy_banner_reveal', tile: enemyStart, label: 'enemy banner glimpsed', intensity: 0.72 },
            { type: 'storm_pulse', tile: outpostTile, label: 'stormline pulse', intensity: 0.56 }
          ]
        },
        {
          id: 'middle_dragon_shadow_over_outpost',
          label: 'Dragon shadow over outpost',
          trigger: {
            type: 'event_triggered',
            eventId: 'middle_outpost_discovered'
          },
          effects: [
            { type: 'silhouette_reveal', tile: ridgeTile, label: 'wing-shape over the ridge', intensity: 0.82 },
            { type: 'lightning_flash', tile: ridgeTile, label: 'black cloud opens', intensity: 0.76 },
            { type: 'camera_nudge', tile: outpostTile, label: 'brief attention nudge', intensity: 0.38 }
          ]
        }
      ]
    },
    ending: {
      victory: {
        id: 'victory_reach_first_outpost',
        type: 'commander_reaches_outpost',
        outpostId: outpost?.id ?? 'outpost_neutral_01',
        radius: DEFAULT_VICTORY_RADIUS,
        summary: 'Scenario ends when the commander reaches and secures the first neutral outpost.'
      },
      failure: {
        id: 'failure_commander_dies',
        type: 'commander_dies',
        summary: 'Scenario fails if the player commander dies.'
      },
      nextScenarioId: 'chapter_002'
    }
  });
}

export function createFirstNightScenarioSpine(map, layer = map?.scenario?.scenarioLayer) {
  const safeLayer = normaliseScenarioLayer(layer);
  const nodes = getShelterNodes(map);
  const node = (type) => nodes.find((entry) => entry.shelterType === type);
  const playerStart = normaliseTile(map?.scenario?.starts?.player) ?? node('EXPOSED_CLEARING')?.tile ?? { x: 1, y: 1 };
  const firstTrees = node('LIGHT_TREE_COVER');
  const canopy = node('DENSE_CANOPY') ?? node('ROOT_HOLLOW');
  const crossing = node('RIVERBANK_HOLLOW') ?? node('REED_BED');
  const finalShelter = node('SHALLOW_CAVE') ?? node('CLIFF_OVERHANG');
  return normaliseScenarioSpine({
    contract: SCENARIO_SPINE_VERSION,
    id: 'chapter_001_first_night_spine',
    chapterId: 'chapter_001',
    title: 'The First Night',
    designIntent: 'Guide a frightened travelling band through darkness and natural shelter. Movement, concealment and regrouping are the solution.',
    beginning: {
      id: 'beginning_exposed_slope',
      commanderStart: playerStart,
      openingCamera: { ...FIRST_NIGHT_CAMERA_RIG, point: playerStart },
      worldCue: {
        id: 'cue_first_torch_warning',
        type: 'torch_glow',
        label: 'A covered torch draws the eye',
        tile: playerStart,
        description: 'Firelight gives comfort, but carries through darkness.'
      },
      silhouette: {
        id: 'cue_canopy_movement',
        type: 'natural_warning',
        label: 'Branches shift in the distance',
        tile: canopy?.tile ?? firstTrees?.tile ?? playerStart,
        description: 'The living terrain offers concealment and uncertainty.'
      }
    },
    objectives: [
      { id: 'objective_first_shelter', label: 'Reach the first tree shelter', condition: { type: 'commander_near_shelter', shelterNodeId: firstTrees?.id, radius: 3 } },
      { id: 'objective_canopy_chain', label: 'Move through the canopy shelter chain', condition: { type: 'commander_near_shelter', shelterNodeId: canopy?.id, radius: 3 } },
      { id: 'objective_crossing', label: 'Cross the muddy natural hazard', condition: { type: 'commander_near_shelter', shelterNodeId: crossing?.id, radius: 3 } },
      { id: 'objective_regroup', label: 'Regroup near final shelter', condition: { type: 'commander_near_shelter', shelterNodeId: finalShelter?.id, radius: 4 } },
      { id: 'objective_survivors', label: 'Bring at least eight survivors into shelter', condition: { type: 'survivors_reach_shelter', shelterNodeId: finalShelter?.id, radius: 4, minimumSurvivors: 8, requireCommander: true } }
    ],
    middle: {
      events: [
        {
          id: 'middle_first_shelter_reached',
          label: 'The group leaves open ground',
          trigger: { type: 'commander_near_shelter', shelterNodeId: firstTrees?.id, radius: 3 },
          effects: [{ type: 'non_verbal_marker', tile: firstTrees?.tile, label: 'tree cover', intensity: 0.46 }]
        },
        {
          id: 'middle_canopy_reached',
          label: 'Canopy cover closes overhead',
          trigger: { type: 'commander_near_shelter', shelterNodeId: canopy?.id, radius: 3 },
          effects: [{ type: 'mist_pulse', tile: canopy?.tile, label: 'quiet movement', intensity: 0.32 }]
        },
        {
          id: 'middle_crossing_reached',
          label: 'Light risks the crossing',
          trigger: { type: 'commander_near_shelter', shelterNodeId: crossing?.id, radius: 3 },
          effects: [{ type: 'torch_warning', tile: crossing?.tile, label: 'cover the flame', intensity: 0.54 }]
        },
        {
          id: 'middle_final_shelter_reached',
          label: 'Final shelter found',
          trigger: { type: 'commander_near_shelter', shelterNodeId: finalShelter?.id, radius: 4 },
          effects: [{ type: 'non_verbal_marker', tile: finalShelter?.tile, label: 'regroup here', intensity: 0.66 }]
        }
      ]
    },
    ending: {
      victory: {
        id: 'victory_survivors_sheltered',
        type: 'survivors_reach_shelter',
        shelterNodeId: finalShelter?.id,
        radius: 4,
        minimumSurvivors: 8,
        requireCommander: true,
        summary: 'Enough survivors reach deep shelter with their leader.'
      },
      failure: {
        id: 'failure_commander_dies',
        type: 'commander_dies',
        summary: 'The band loses direction if its leader dies.'
      },
      nextScenarioId: 'chapter_002',
      unlockNextChapter: false
    },
    sourceLayerPreset: safeLayer?.preset ?? 'first_night'
  }, { map, layer: safeLayer });
}

export function normaliseScenarioSpine(spine, { map = null, layer = map?.scenario?.scenarioLayer } = {}) {
  if (!spine || typeof spine !== 'object') {
    return null;
  }
  const safeLayer = normaliseScenarioLayer(layer);
  const playerStart = normaliseTile(spine.beginning?.commanderStart)
    ?? normaliseTile(map?.scenario?.starts?.player)
    ?? safeLayer?.storyBeats?.[0]?.tile
    ?? null;
  const firstNight = safeLayer?.preset === 'first_night' || spine.id === 'chapter_001_first_night_spine';
  const firstNightCameraNeedsUpgrade = firstNight
    && spine.cameraAuthorityContract !== COMMANDER_AUTHORITY_CAMERA_CONTRACT;
  const openingCamera = normaliseScenarioCameraRig(
    firstNightCameraNeedsUpgrade
      ? { ...FIRST_NIGHT_CAMERA_RIG, point: playerStart }
      : spine.beginning?.openingCamera ?? { mode: 'commander', point: playerStart, zoom: 1.25 },
    { fallbackPoint: playerStart }
  );
  return {
    contract: SCENARIO_SPINE_VERSION,
    id: normaliseText(spine.id, 'chapter_001_spine'),
    chapterId: normaliseText(spine.chapterId, 'chapter_001'),
    title: normaliseText(spine.title, 'Chapter 1'),
    cameraAuthorityContract: firstNight ? COMMANDER_AUTHORITY_CAMERA_CONTRACT : null,
    designIntent: normaliseText(spine.designIntent, 'Beginning → gameplay events → ending; seamless and diegetic.'),
    beginning: {
      id: normaliseText(spine.beginning?.id, 'beginning_arrival'),
      commanderStart: playerStart,
      openingCamera,
      worldCue: normaliseCue(spine.beginning?.worldCue, playerStart),
      silhouette: normaliseCue(spine.beginning?.silhouette, playerStart)
    },
    objectives: normaliseObjectiveList(spine.objectives),
    middle: {
      events: normaliseEventList(spine.middle?.events ?? spine.events ?? [])
    },
    ending: {
      victory: spine.ending && Object.prototype.hasOwnProperty.call(spine.ending, 'victory')
        ? normaliseCondition(spine.ending.victory)
        : null,
      failure: spine.ending && Object.prototype.hasOwnProperty.call(spine.ending, 'failure')
        ? normaliseCondition(spine.ending.failure)
        : null,
      nextScenarioId: typeof spine.ending?.nextScenarioId === 'string' ? spine.ending.nextScenarioId : null,
      unlockNextChapter: spine.ending?.unlockNextChapter !== false
    }
  };
}

export function ensureScenarioSpineForMap(map) {
  if (!map || typeof map !== 'object') return map;
  map.scenario = map.scenario && typeof map.scenario === 'object' ? map.scenario : {};
  if (!map.scenario.scenarioSpine) {
    map.scenario.scenarioSpine = createDefaultScenarioSpine(map, map.scenario.scenarioLayer);
  } else {
    map.scenario.scenarioSpine = normaliseScenarioSpine(map.scenario.scenarioSpine, { map, layer: map.scenario.scenarioLayer })
      ?? createDefaultScenarioSpine(map, map.scenario.scenarioLayer);
  }
  return map;
}

export function validateScenarioSpine(spine, { map = null } = {}) {
  const safe = normaliseScenarioSpine(spine, { map });
  const missing = [];
  const warnings = [];
  if (!safe) {
    return {
      status: 'broken',
      completionPercent: 0,
      missing: ['scenario spine'],
      warnings: [],
      beginningReady: false,
      middleReady: false,
      endingReady: false,
      nextChapterTarget: null
    };
  }
  const beginningReady = Boolean(safe.beginning?.commanderStart && safe.beginning?.openingCamera?.mode);
  const middleReady = Array.isArray(safe.middle?.events) && safe.middle.events.length > 0;
  const endingReady = Boolean(safe.ending?.victory?.type && safe.ending?.failure?.type);
  if (!safe.beginning?.commanderStart) missing.push('beginning commander start');
  if (!safe.beginning?.openingCamera?.mode) missing.push('opening camera mode');
  if (!middleReady) missing.push('at least one middle event');
  if (!safe.ending?.victory?.type) missing.push('victory/end scenario condition');
  if (!safe.ending?.failure?.type) missing.push('failure condition');
  if (!safe.beginning?.worldCue) warnings.push('opening world cue missing');
  if (!safe.beginning?.silhouette) warnings.push('opening silhouette/omen missing');
  if (!safe.ending?.nextScenarioId) warnings.push('next chapter target is placeholder/missing');

  const requiredReadyCount = [beginningReady, middleReady, endingReady].filter(Boolean).length;
  const optionalReadyCount = [safe.beginning.worldCue, safe.beginning.silhouette, safe.ending.nextScenarioId, safe.middle.events.length >= 2].filter(Boolean).length;
  const completionPercent = Math.round(((requiredReadyCount / 3) * 80) + ((optionalReadyCount / 4) * 20));
  return {
    status: missing.length === 0 ? 'playable' : 'incomplete',
    completionPercent,
    missing,
    warnings,
    beginningReady,
    middleReady,
    endingReady,
    nextChapterTarget: safe.ending.nextScenarioId
  };
}

export function summarizeScenarioSpine(spine, { map = null, runtime = null } = {}) {
  const safe = normaliseScenarioSpine(spine, { map });
  const validation = validateScenarioSpine(safe, { map });
  const state = normaliseScenarioRuntime(runtime, safe);
  return {
    present: Boolean(safe),
    contract: SCENARIO_SPINE_VERSION,
    title: safe?.title ?? null,
    status: validation.status,
    completionPercent: validation.completionPercent,
    runtimeState: state.status,
    beginningReady: validation.beginningReady,
    middleReady: validation.middleReady,
    endingReady: validation.endingReady,
    middleEvents: safe?.middle?.events?.length ?? 0,
    triggeredEvents: state.triggeredEventIds.length,
    objectiveCount: safe?.objectives?.length ?? 0,
    completedObjectives: state.completedObjectiveIds.length,
    missing: validation.missing,
    warnings: validation.warnings,
    nextChapterTarget: validation.nextChapterTarget
  };
}

export function normaliseScenarioRuntime(runtime = {}, spine = null) {
  const safeSpine = normaliseScenarioSpine(spine);
  const validStates = Object.values(SCENARIO_SPINE_STATES);
  const status = validStates.includes(runtime?.status) ? runtime.status : SCENARIO_SPINE_STATES.opening;
  const triggeredEventIds = Array.isArray(runtime?.triggeredEventIds)
    ? [...new Set(runtime.triggeredEventIds.filter((id) => typeof id === 'string'))]
    : [];
  const completedObjectiveIds = Array.isArray(runtime?.completedObjectiveIds)
    ? [...new Set(runtime.completedObjectiveIds.filter((id) => typeof id === 'string'))]
    : [];
  return {
    contract: SCENARIO_RUNTIME_VERSION,
    spineId: typeof runtime?.spineId === 'string' ? runtime.spineId : safeSpine?.id ?? null,
    status,
    startedAtTick: Number.isInteger(runtime?.startedAtTick) ? Math.max(0, runtime.startedAtTick) : null,
    completedAtTick: Number.isInteger(runtime?.completedAtTick) ? Math.max(0, runtime.completedAtTick) : null,
    failedAtTick: Number.isInteger(runtime?.failedAtTick) ? Math.max(0, runtime.failedAtTick) : null,
    triggeredEventIds,
    completedObjectiveIds,
    lastEventId: typeof runtime?.lastEventId === 'string' ? runtime.lastEventId : null,
    lastEffect: runtime?.lastEffect && typeof runtime.lastEffect === 'object' ? { ...runtime.lastEffect } : null,
    effectHistory: normaliseEffectHistory(runtime?.effectHistory),
    nextScenarioId: typeof runtime?.nextScenarioId === 'string' ? runtime.nextScenarioId : safeSpine?.ending?.nextScenarioId ?? null,
    unlockNextChapter: typeof runtime?.unlockNextChapter === 'boolean' ? runtime.unlockNextChapter : safeSpine?.ending?.unlockNextChapter !== false
  };
}

export function advanceScenarioSpineRuntime({ spine, runtime = {}, game = null, map = null } = {}) {
  const safe = normaliseScenarioSpine(spine, { map });
  let next = normaliseScenarioRuntime(runtime, safe);
  const validation = validateScenarioSpine(safe, { map });
  if (!safe || validation.status === 'broken') {
    return { runtime: { ...next, status: SCENARIO_SPINE_STATES.inactive }, events: [], validation };
  }
  if (next.status === SCENARIO_SPINE_STATES.completed || next.status === SCENARIO_SPINE_STATES.failed) {
    return { runtime: next, events: [], validation };
  }
  const tick = Math.max(0, Math.floor(Number(game?.tick) || 0));
  const emitted = [];
  if (next.startedAtTick == null) {
    next = { ...next, startedAtTick: tick, status: SCENARIO_SPINE_STATES.opening };
    emitted.push(createRuntimeEffect('beginning_started', safe.beginning?.worldCue, tick));
  }

  if (evaluateCondition(safe.ending.failure, { game, map, runtime: next, spine: safe })) {
    next = {
      ...appendEffects(next, [createRuntimeEffect('scenario_failed', safe.ending.failure, tick)]),
      status: SCENARIO_SPINE_STATES.failed,
      failedAtTick: tick
    };
    return { runtime: next, events: emitted, validation };
  }

  if (next.status === SCENARIO_SPINE_STATES.opening && tick > next.startedAtTick) {
    next = { ...next, status: SCENARIO_SPINE_STATES.active };
  }

  const newlyTriggered = [];
  for (const event of safe.middle.events) {
    if (next.triggeredEventIds.includes(event.id)) continue;
    if (evaluateCondition(event.trigger, { game, map, runtime: next, spine: safe })) {
      newlyTriggered.push(event);
      next = {
        ...next,
        triggeredEventIds: [...next.triggeredEventIds, event.id],
        lastEventId: event.id
      };
    }
  }
  if (newlyTriggered.length > 0) {
    next = appendEffects(next, newlyTriggered.flatMap((event) => event.effects.map((effect) => createRuntimeEffect(event.id, effect, tick))));
  }

  const nextObjective = safe.objectives.find((objective) => !next.completedObjectiveIds.includes(objective.id));
  if (nextObjective && evaluateCondition(nextObjective.condition, { game, map, runtime: next, spine: safe })) {
    next = {
      ...appendEffects(next, [createRuntimeEffect(nextObjective.id, { type: 'objective_completed', label: nextObjective.label }, tick)]),
      completedObjectiveIds: [...next.completedObjectiveIds, nextObjective.id]
    };
  }

  const requiredObjectiveIds = safe.objectives.slice(0, -1).map((objective) => objective.id);
  const pathComplete = requiredObjectiveIds.every((id) => next.completedObjectiveIds.includes(id));
  if ((requiredObjectiveIds.length === 0 || pathComplete) && evaluateCondition(safe.ending.victory, { game, map, runtime: next, spine: safe })) {
    next = {
      ...appendEffects(next, [createRuntimeEffect('scenario_completed', safe.ending.victory, tick)]),
      status: SCENARIO_SPINE_STATES.completed,
      completedAtTick: tick,
      nextScenarioId: safe.ending.nextScenarioId,
      unlockNextChapter: safe.ending.unlockNextChapter
    };
  }

  return { runtime: next, events: emitted.concat(newlyTriggered), validation };
}

export function applyScenarioRuntimeProgress(map, runtime, scenarioId = 'chapter_001') {
  if (!map?.scenario || runtime?.status !== SCENARIO_SPINE_STATES.completed) return map;
  const progress = map.scenario.progress ?? {};
  const completed = new Set(Array.isArray(progress.completedScenarioIds) ? progress.completedScenarioIds : []);
  completed.add(scenarioId);
  const unlocked = new Set(Array.isArray(progress.unlockedScenarioIds) ? progress.unlockedScenarioIds : []);
  if (runtime.nextScenarioId && runtime.unlockNextChapter) unlocked.add(runtime.nextScenarioId);
  map.scenario.progress = {
    ...progress,
    completedScenarioIds: [...completed],
    unlockedScenarioIds: [...unlocked]
  };
  return map;
}

function evaluateCondition(condition, { game = null, map = null, runtime = null } = {}) {
  const safe = normaliseCondition(condition);
  if (!safe?.type) return false;
  if (safe.type === 'tick_reached') {
    return Math.max(0, Math.floor(Number(game?.tick) || 0)) >= Math.max(0, Math.floor(Number(safe.tick) || 0));
  }
  if (safe.type === 'event_triggered') {
    return runtime?.triggeredEventIds?.includes(safe.eventId);
  }
  if (safe.type === 'commander_dies') {
    const commander = findCommander(game);
    return Boolean(commander && commander.health && Number(commander.health.health) <= 0);
  }
  if (safe.type === 'commander_near_outpost' || safe.type === 'commander_reaches_outpost') {
    const commander = findCommander(game);
    const outpost = findOutpost(game, map, safe.outpostId);
    if (!commander || !outpost?.tile) return false;
    return distance(getEntityTile(commander), outpost.tile) <= Math.max(1, Number(safe.radius) || DEFAULT_DISCOVERY_RADIUS);
  }
  if (safe.type === 'player_controls_outpost') {
    const outpost = findOutpost(game, map, safe.outpostId);
    return outpost?.ownerFactionId === 'player' || outpost?.factionId === 'player';
  }
  if (safe.type === 'commander_near_shelter') {
    const commander = findCommander(game);
    const shelter = findShelter(map, safe.shelterNodeId);
    return Boolean(commander && shelter && distance(getEntityTile(commander), shelter.tile) <= Math.max(1, Number(safe.radius) || DEFAULT_DISCOVERY_RADIUS));
  }
  if (safe.type === 'survivors_reach_shelter') {
    const shelter = findShelter(map, safe.shelterNodeId);
    if (!shelter) return false;
    const radius = Math.max(1, Number(safe.radius) || DEFAULT_VICTORY_RADIUS);
    const commander = findCommander(game);
    if (safe.requireCommander && (!commander || distance(getEntityTile(commander), shelter.tile) > radius)) {
      return false;
    }
    return countSurvivorsNearShelter(game, shelter.tile, radius) >= Math.max(1, Number(safe.minimumSurvivors) || 1);
  }
  return false;
}

function findCommander(game) {
  return game?.leaders?.find((leader) => leader.id === 'leader_player_01' || (leader.factionId === 'player' && leader.controller === 'player')) ?? null;
}

function findOutpost(game, map, outpostId) {
  const byId = outpostId ? game?.outposts?.find((outpost) => outpost.id === outpostId) : null;
  if (byId) return byId;
  return game?.outposts?.find((outpost) => outpost.contestable)
    ?? map?.scenario?.neutralOutposts?.[0]
    ?? null;
}

function findShelter(map, shelterNodeId) {
  const nodes = getShelterNodes(map);
  return nodes.find((node) => node.id === shelterNodeId) ?? nodes.find((node) => node.tags?.includes('final_shelter')) ?? null;
}

function countSurvivorsNearShelter(game, tile, radius) {
  return [...(game?.leaders ?? []), ...(game?.squads ?? [])]
    .filter((entity) => entity.factionId === 'player' && Number(entity.health?.health ?? 1) > 0)
    .filter((entity) => distance(getEntityTile(entity), tile) <= radius)
    .reduce((total, entity) => total + Math.max(0, Number(entity.survivorCount) || (entity.type === 'leader' ? 1 : entity.members?.length ?? 1)), 0);
}

function getEntityTile(entity) {
  return normaliseTile(entity?.tile ?? entity?.position ?? entity?.movement?.position ?? entity?.objectiveProjection?.from) ?? { x: 0, y: 0 };
}

function chooseScenarioOffsetTile(map, origin, { dx = 0, dy = 0 } = {}) {
  const safe = normaliseTile(origin);
  if (!safe) return null;
  const width = Math.max(1, Number(map?.width) || 1);
  const height = Math.max(1, Number(map?.height) || 1);
  return {
    x: Math.max(0, Math.min(width - 1, safe.x + Math.round(Number(dx) || 0))),
    y: Math.max(0, Math.min(height - 1, safe.y + Math.round(Number(dy) || 0)))
  };
}

function firstNeutralOutpost(map) {
  return Array.isArray(map?.scenario?.neutralOutposts) && map.scenario.neutralOutposts.length > 0
    ? map.scenario.neutralOutposts[0]
    : null;
}

function normaliseEventList(events = []) {
  return Array.isArray(events)
    ? events.map(normaliseMiddleEvent).filter(Boolean)
    : [];
}

function normaliseObjectiveList(objectives = []) {
  return Array.isArray(objectives)
    ? objectives.map((objective, index) => ({
      id: normaliseText(objective?.id, `objective_${index + 1}`),
      label: normaliseText(objective?.label, `Objective ${index + 1}`),
      condition: normaliseCondition(objective?.condition)
    })).filter((objective) => objective.condition.type)
    : [];
}

function normaliseMiddleEvent(event, index = 0) {
  if (!event || typeof event !== 'object') return null;
  return {
    id: normaliseText(event.id, `middle_event_${index + 1}`),
    label: normaliseText(event.label ?? event.title, `Middle Event ${index + 1}`),
    trigger: normaliseCondition(event.trigger, { type: 'tick_reached', tick: 1 + index }),
    effects: Array.isArray(event.effects) ? event.effects.map((effect) => normaliseEffect(effect)).filter(Boolean) : []
  };
}

function normaliseCue(cue, fallbackTile = null) {
  if (!cue || typeof cue !== 'object') return null;
  return {
    id: normaliseText(cue.id, `${cue.type ?? 'cue'}_${tileId(cue.tile ?? fallbackTile)}`),
    type: normaliseText(cue.type, 'world_cue'),
    label: normaliseText(cue.label ?? cue.title, cue.type ?? 'world cue'),
    tile: normaliseTile(cue.tile) ?? normaliseTile(fallbackTile),
    description: normaliseText(cue.description, '')
  };
}

function normaliseEffect(effect) {
  if (!effect || typeof effect !== 'object') return null;
  return {
    type: normaliseText(effect.type, 'world_cue'),
    label: normaliseText(effect.label ?? effect.title, effect.type ?? 'effect'),
    tile: normaliseTile(effect.tile) ?? null,
    intensity: Number.isFinite(Number(effect.intensity)) ? Number(effect.intensity) : null
  };
}

function normaliseCondition(condition, fallback = {}) {
  const source = condition && typeof condition === 'object' ? condition : fallback;
  return {
    ...source,
    type: typeof source.type === 'string' ? source.type : fallback.type ?? null,
    outpostId: typeof source.outpostId === 'string' ? source.outpostId : fallback.outpostId ?? null,
    shelterNodeId: typeof source.shelterNodeId === 'string' ? source.shelterNodeId : fallback.shelterNodeId ?? null,
    eventId: typeof source.eventId === 'string' ? source.eventId : fallback.eventId ?? null,
    radius: Number.isFinite(Number(source.radius)) ? Number(source.radius) : fallback.radius ?? null,
    tick: Number.isFinite(Number(source.tick)) ? Math.floor(Number(source.tick)) : fallback.tick ?? null,
    minimumSurvivors: Number.isFinite(Number(source.minimumSurvivors)) ? Math.max(1, Math.round(Number(source.minimumSurvivors))) : fallback.minimumSurvivors ?? null,
    requireCommander: typeof source.requireCommander === 'boolean' ? source.requireCommander : Boolean(fallback.requireCommander),
    summary: typeof source.summary === 'string' ? source.summary : fallback.summary ?? null
  };
}

function createRuntimeEffect(sourceId, effect, tick) {
  return {
    id: `scenario_effect_${sourceId}_${tick}`,
    sourceId,
    tick,
    type: effect?.type ?? 'world_cue',
    label: effect?.label ?? effect?.summary ?? sourceId,
    tile: normaliseTile(effect?.tile) ?? null
  };
}

function appendEffects(runtime, effects = []) {
  const effectHistory = normaliseEffectHistory([...(runtime.effectHistory ?? []), ...effects]);
  return {
    ...runtime,
    effectHistory,
    lastEffect: effectHistory[effectHistory.length - 1] ?? runtime.lastEffect ?? null
  };
}

function normaliseEffectHistory(history = []) {
  return Array.isArray(history)
    ? history.filter((entry) => entry && typeof entry === 'object').slice(-16).map((entry) => ({ ...entry, tile: normaliseTile(entry.tile) }))
    : [];
}

function normaliseTile(tile) {
  if (!Number.isFinite(Number(tile?.x)) || !Number.isFinite(Number(tile?.y))) return null;
  return { x: Math.round(Number(tile.x)), y: Math.round(Number(tile.y)) };
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tileId(tile) {
  const safe = normaliseTile(tile);
  return safe ? `${safe.x}_${safe.y}` : 'unknown';
}

function normaliseText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
