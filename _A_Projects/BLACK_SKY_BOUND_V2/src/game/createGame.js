import { createWorld } from '../ecs/world.js';
import { EntityKind } from '../constants/entityKinds.js';
import { Faction } from '../constants/factions.js';
import { ScenarioPhase } from '../constants/scenarioPhases.js';
import { getScenario } from '../data/scenarios.js';
import { spawnActor } from './spawn.js';
import { syncGameViews } from './selectors.js';
import { createRenderLayerState } from '../projection/renderLayerState.js';
import { LightingProfileId } from '../data/lightingProfiles.js';
import { SmokeFieldProfileId } from '../data/smokeFields.js';
import { createSceneLights } from '../data/sceneLights.js';
import { normalizeCreatureTuning } from '../data/creatures/creatureTuning.js';
import { buildSceneObjectOcclusionBlockers, createRuntimeSceneObjectState } from '../world/sceneObjects.js';
import { createRuntimeUnitSpawners } from './unitSpawners.js';
import { getDefaultActorFaction } from '../data/actors.js';
import { createMamaWyvernWorldEventState } from '../data/mamaWyvernWorldEvents.js';
import { hydrateAbilityProgressionFromProfile } from './playerProfile.js';

export function createInitialGameState(map, options = {}) {
  const scenario = getScenario(map.scenarioId);
  const world = createWorld();
  const sceneObjects = createRuntimeSceneObjectState(map.sceneObjects ?? []);
  const dragonId = spawnActor(world, EntityKind.YOUNG_DRAGON, map.spawn.x + 0.5, map.spawn.y + 0.5, Faction.PLAYER);
  if (options.playerProfile) hydrateAbilityProgressionFromProfile(world, dragonId, options.playerProfile);
  const sourcePlacements = Array.isArray(map.unitPlacements) && map.unitPlacements.length > 0
    ? map.unitPlacements
    : (map.enemySpawns ?? []).map((spawn) => ({ ...spawn, team: spawn.team ?? Faction.ENEMY }));
  const unitPlacements = sourcePlacements.map((placement) => ({
    ...placement,
    team: placement.team ?? getDefaultActorFaction(placement.type)
  }));
  for (const placement of unitPlacements) {
    spawnActor(world, placement.type, placement.x + 0.5, placement.y + 0.5, placement.team);
  }
  const game = {
    architecture: 'ecs_foundation_v1',
    scenarioId: scenario.id,
    status: ScenarioPhase.PLAYING,
    message: scenario.startMessage,
    dragonId,
    world,
    actors: [],
    effects: [],
    corpses: [],
    sceneObjects,
    unitPlacements: unitPlacements.map((placement) => ({ ...placement })),
    unitSpawners: createRuntimeUnitSpawners(map.unitSpawners ?? [], world),
    smokeClouds: [],
    smokeSources: [],
    occlusionBlockers: buildSceneObjectOcclusionBlockers(sceneObjects),
    lights: [],
    sceneLights: createSceneLights(),
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
