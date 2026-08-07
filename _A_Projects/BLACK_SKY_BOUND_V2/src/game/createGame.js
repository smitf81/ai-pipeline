import { createWorld, getComponent } from '../ecs/world.js';
import { ComponentType } from '../constants/componentTypes.js';
import { EntityKind } from '../constants/entityKinds.js';
import { Faction } from '../constants/factions.js';
import { ScenarioPhase } from '../constants/scenarioPhases.js';
import { getScenario } from '../data/scenarios.js';
import { spawnActor } from './spawn.js';
import { syncGameViews } from './selectors.js';
import { createRenderLayerState } from '../projection/renderLayerState.js';
import { LightingProfileId } from '../data/lightingProfiles.js';
import { SmokeFieldProfileId } from '../data/smokeFields.js';
import { createSceneLights, SceneLightId } from '../data/sceneLights.js';
import { normalizeCreatureTuning } from '../data/creatures/creatureTuning.js';
import { buildSceneObjectOcclusionBlockers, createRuntimeSceneObjectState } from '../world/sceneObjects.js';
import { createRuntimeUnitSpawners } from './unitSpawners.js';
import { getDefaultActorFaction } from '../data/actors.js';
import { createMamaWyvernWorldEventState } from '../data/mamaWyvernWorldEvents.js';
import { hydrateAbilityProgressionFromProfile } from './playerProfile.js';
import { hydrateRunAbilityProgression } from './playerAbilities.js';
import { applyArenaStartingLoadout, createArenaEncounter } from './arenaEncounter.js';
import { createCameraVisibilityFocusState } from './cameraVisibilityFocus.js';

export function createInitialGameState(map, options = {}) {
  const scenario = getScenario(map.scenarioId);
  const world = createWorld();
  const sceneObjects = createRuntimeSceneObjectState(map.sceneObjects ?? []);
  const dragonId = spawnActor(world, EntityKind.YOUNG_DRAGON, map.spawn.x + 0.5, map.spawn.y + 0.5, Faction.PLAYER);
  if (options.playerProfile) hydrateAbilityProgressionFromProfile(world, dragonId, options.playerProfile);
  if (options.runAbilityProgression) hydrateRunAbilityProgression(world, dragonId, options.runAbilityProgression);
  const arena = createArenaEncounter(map.arena, map.unitSpawners ?? []);
  applyArenaStartingLoadout(world, dragonId, arena);
  const dragonTransform = getComponent(world, dragonId, ComponentType.Transform);
  if (dragonTransform) dragonTransform.rotation = Number.isFinite(map.spawn.rotation) ? map.spawn.rotation : 0;
  const sourcePlacements = Array.isArray(map.unitPlacements) && map.unitPlacements.length > 0
    ? map.unitPlacements
    : (map.enemySpawns ?? []).map((spawn) => ({ ...spawn, team: spawn.team ?? Faction.ENEMY }));
  const unitPlacements = sourcePlacements.map((placement, index) => ({
    ...placement,
    id: placement.id ?? `legacy_${placement.type}_${index + 1}`,
    team: placement.team ?? getDefaultActorFaction(placement.type)
  }));
  const reservedActorIds = new Set(
    (map.sceneSequences ?? []).flatMap((sequence) => sequence.actorTracks ?? [])
      .filter((track) => track.reserve !== false)
      .map((track) => track.actorId)
  );
  const authoredEntities = Object.create(null);
  const entityAuthoredIds = Object.create(null);
  const reservedTransitionActorPlacements = Object.create(null);
  for (const placement of unitPlacements) {
    if (reservedActorIds.has(placement.id)) {
      reservedTransitionActorPlacements[placement.id] = { ...placement };
      continue;
    }
    const entity = spawnActor(world, placement.type, placement.x + 0.5, placement.y + 0.5, placement.team, {
      creature: placement.creature,
      sourceId: placement.id,
      sourceKind: 'authored_placement_id'
    });
    authoredEntities[placement.id] = entity;
    entityAuthoredIds[entity] = placement.id;
  }
  for (const actorId of reservedActorIds) {
    if (!reservedTransitionActorPlacements[actorId]) throw new Error(`reserved_transition_actor_missing:${actorId}`);
  }
  const game = {
    architecture: 'ecs_foundation_v1',
    scenarioId: scenario.id,
    status: ScenarioPhase.PLAYING,
    message: scenario.startMessage,
    dragonId,
    cameraVisibilityFocus: createCameraVisibilityFocusState(dragonId),
    world,
    actors: [],
    effects: [],
    corpses: [],
    sceneObjects,
    unitPlacements: unitPlacements.map((placement) => ({ ...placement })),
    authoredEntities,
    entityAuthoredIds,
    reservedTransitionActorIds: [...reservedActorIds],
    reservedTransitionActorPlacements,
    unitSpawners: arena ? [] : createRuntimeUnitSpawners(map.unitSpawners ?? [], world),
    arena,
    smokeClouds: [],
    smokeSources: [],
    occlusionBlockers: buildSceneObjectOcclusionBlockers(sceneObjects),
    lights: [],
    sceneLights: createSceneLights(arena ? [SceneLightId.MOONLIGHT, SceneLightId.STORM_LIGHTNING] : undefined),
    worldEvents: createMamaWyvernWorldEventState(),
    spatialHazards: [],
    lighting: { enabled: true, profileId: LightingProfileId.EARLY_NIGHT },
    smokeField: { enabled: true, profileId: SmokeFieldProfileId.LOW_NIGHT_SMOKE },
    creatureTuning: normalizeCreatureTuning(options.creatureTuning).tuning,
    renderLayers: createRenderLayerState(),
    objectives: [{ ...scenario.objective, complete: false }]
  };
  return syncGameViews(game);
}
