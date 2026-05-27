import { createField, getElevationSlope, getTerrainField } from '../world/fields.js';
import { deriveWeatherFields } from '../world/weatherFields.js';
import { getTerrain } from '../config/terrain.js';
import { getTile, isInBounds } from '../world/mapModel.js';
import { getSceneEntity, getShelterNodes, isAuthoredRuntimeScene, isNomadicSurvivalScene } from '../world/sceneEntity.js';
import {
  beginCollisionFrame,
  normaliseMovableCollisionMetadata,
  resolveSoftUnitSeparation,
  summarizeCollisionAuthority
} from './collisionAuthority.js';
import { RESOURCE_IDS, SUPPLIES_COMPONENT_IDS, applyResourceIncomeTick, applySupplyIncomeTick, canAffordCost, createInitialEconomy, describeResourceCost, normaliseEconomy, scaleResourceCost, setFactionStorageCapacity, spendCost, spendResource, summarizeEconomy } from './economy.js';
import { getBuildOption } from './buildCatalog.js';
import { createInitialProgressionState, isBuildOptionUnlocked, normaliseProgressionState } from './progressionSystem.js';
import { CONSTRUCTION_STATES, createStructureInstance, getStructureDefinition, normaliseStructureInstance } from './structureRegistry.js';
import {
  BUILDER_CREW_TEMPLATE,
  CONSTRUCTION_JOB_STATES,
  advanceConstruction as advanceConstructionSystem,
  createConstructionJobFromStructure as createConstructionJobFromStructureSystem,
  findNearestBuilderBase,
  getConstructionWoodBudget,
  getStructureWorkPointCandidates as getStructureWorkPointCandidatesSystem,
  normaliseConstructionJob as normaliseConstructionJobSystem,
  placeStructureBuildOrder as placeStructureBuildOrderSystem,
  placeStructurePathBuildOrder as placeStructurePathBuildOrderSystem,
  summarizeConstruction as summarizeConstructionSystem,
  validateConstructionAccess as validateConstructionAccessSystem
} from './constructionSystem.js';
import {
  SUPPLY_TRANSPORT_STATES,
  advanceLogistics as advanceLogisticsSystem,
  createSupplyTransport as createSupplyTransportSystem,
  normaliseTransport as normaliseSupplyTransportSystem,
  syncSupplyTransportsForStorageStructures as syncSupplyTransportsForStorageStructuresSystem,
  summarizeSupplyLines as summarizeSupplyLinesSystem
} from './logisticsSystem.js';
import {
  MOVEMENT_MODEL,
  advanceMovableEntityMovement as advanceMovableEntityMovementSystem,
  advanceMovementPathCursor,
  canTraverseTileStep,
  entityNavigationMapSignature,
  ensureMovementPath as ensureMovementPathSystem,
  findNearestNavigableTile,
  getMovementPathWaypoint,
  isMovementBlocked,
  issueFactionMovementOrder as issueFactionMovementOrderSystem,
  issuePlayerMoveCommand as issuePlayerMoveCommandSystem,
  movementTerrainMultiplier,
  normaliseMovementOrder,
  normaliseMovementOrderPath,
  normaliseMovementPath,
  normaliseMovementState as normaliseLeaderMovement,
  normaliseRuntimeMovementPathNodes,
  resolveMovementStep,
  resolveNavigableMovementTarget,
  summarizeMovementPath,
  validateRuntimeMovementPathNodes
} from './movementSystem.js';
import {
  RUNTIME_EVENTS,
  clearRuntimeDirty,
  completeScheduledSystem,
  createRuntimeDirtyState,
  createRuntimeEventState,
  createRuntimeScheduler,
  createRuntimeVersions,
  drainRuntimeEvents,
  enqueueRuntimeEvent,
  bumpRuntimeVersions,
  markRuntimeDirty,
  normaliseRuntimeCoordinator as ensureRuntimeCoordination,
  shouldRunScheduledSystem,
  summarizeRuntimeCoordinator as summarizeRuntimeCoordination
} from './runtimeEvents.js';
import {
  areAdjacentOrSame,
  canStructureUseExistingTile,
  canStructuresJoin,
  createJoinMask,
  directionFromTo,
  enrichStructureSketchTiles,
  getStructureJoinProfile,
  isSketchableStructureType,
  materialiseStructureSketchPath
} from './structureJoinery.js';
import {
  createStructureNavigationSignature,
  getStructureMovementCostModifier,
  summarizeStructureTopology
} from './structureTopology.js';
import {
  AI_INTENT_STATES,
  createIntentPacket
} from './aiContracts.js';
import {
  applyResolvedIntentToEntityAI,
  appraiseEntityBehaviour,
  createAIEntityState,
  createAISystemState,
  issueIntentThroughAccumulator,
  normaliseAIEntityState,
  normaliseAISystemState
} from './aiStateMachine.js';
import {
  deriveCadencedBehaviourFields,
  findBestBehaviourFieldTile,
  sampleBehaviourFields
} from '../world/behaviourFields.js';
import {
  getCorpseMovementCostModifier,
  normaliseCorpses,
  summarizeCorpses
} from './corpseSystem.js';
import {
  COMBAT_MODEL,
  advanceCombat,
  normaliseCombatComponent,
  normaliseDeathEvents,
  normaliseHealthComponent,
  normaliseImpactEvents,
  normaliseProjectiles,
  summarizeCombat as summarizeCombatSystem,
  throwStoneProjectile
} from './combatSystem.js';
import {
  appendSoundEvent,
  normaliseSoundEvents,
  summarizeSoundEvents
} from './soundSystem.js';
import {
  advanceBattlefieldTrace,
  createBattlefieldTrace,
  normaliseBattlefieldTrace,
  summarizeBattlefieldTrace
} from './battlefieldTrace.js';
import {
  applyUnitStealthStates,
  canObserverDetectEntity,
  getMobilityProfile
} from './coverSystem.js';
export { MOVEMENT_MODEL } from './movementSystem.js';
export { COMBAT_MODEL } from './combatSystem.js';
export {
  collectMovableCollisionBodies,
  getMovableCollisionBody,
  summarizeCollisionAuthority
} from './collisionAuthority.js';
export {
  collectCompletedStructureBlockers,
  collectStructureMovementModifiers,
  createStructureBlockerSignature,
  createStructureMovementModifierSignature,
  createStructureNavigationSignature,
  getStructureCollisionBody,
  getStructureMovementCostModifier,
  isTileBlockedByStructure,
  summarizeStructureTopology
} from './structureTopology.js';
import {
  ENTITY_TYPES,
  GAME_MODES,
  GAME_PHASES,
  GAME_STATE_CONTRACT_ID,
  GAME_STATE_VERSION,
  assertGameStateContract,
  assertMapDataContract,
  cloneTile,
  createMapRef,
  getGameEntities
} from './contracts.js';

export const GAME_OVERLAYS = {
  none: { id: 'none', label: 'None' },
  playerCommand: { id: 'playerCommand', label: 'Player Command' },
  enemyCommand: { id: 'enemyCommand', label: 'Enemy Command' },
  playerLoS: { id: 'playerLoS', label: 'Player LoS' },
  enemyLoS: { id: 'enemyLoS', label: 'Enemy LoS' },
  control: { id: 'control', label: 'Control Balance' },
  influenceFrontline: { id: 'influenceFrontline', label: 'Influence Frontline' },
  frontPressure: { id: 'frontPressure', label: 'Front Pressure' },
  objectivePressure: { id: 'objectivePressure', label: 'Objective Pressure' },
  foodResource: { id: 'foodResource', label: 'Food Resource' },
  woodResource: { id: 'woodResource', label: 'Wood Resource' },
  heat: { id: 'heat', label: 'Heat Field' },
  humidity: { id: 'humidity', label: 'Humidity Field' },
  uplift: { id: 'uplift', label: 'Uplift Field' },
  stormPotential: { id: 'stormPotential', label: 'Storm Potential' },
  cloudCover: { id: 'cloudCover', label: 'Cloud Cover' },
  rainfall: { id: 'rainfall', label: 'Rainfall' }
};

export const FACTIONS = {
  player: {
    id: 'player',
    label: 'Player',
    shortLabel: 'P',
    color: '#6fb3ff',
    softColor: 'rgba(111, 179, 255, 0.18)',
    stroke: '#b8dcff'
  },
  enemy: {
    id: 'enemy',
    label: 'Enemy',
    shortLabel: 'E',
    color: '#ff876f',
    softColor: 'rgba(255, 135, 111, 0.18)',
    stroke: '#ffd0c4'
  },
  neutral: {
    id: 'neutral',
    label: 'Neutral',
    shortLabel: 'N',
    color: '#e5c35d',
    softColor: 'rgba(229, 195, 93, 0.14)',
    stroke: '#fff1ad'
  }
};

export const FACTION_CONTROL = Object.freeze({
  player: 'player',
  ai: 'ai',
  neutral: 'neutral'
});

export const FACTION_CONTROL_OWNERS = Object.freeze({
  player: FACTION_CONTROL.player,
  enemy: FACTION_CONTROL.ai,
  neutral: FACTION_CONTROL.neutral
});

const LINE_OF_SIGHT_RECOMPUTE_INTERVAL_TICKS = 12;
const COMMAND_FIELD_RECOMPUTE_INTERVAL_TICKS = 8;
const FRONTLINE_RECOMPUTE_INTERVAL_TICKS = 2;
const OBJECTIVE_PRESSURE_CORRIDOR_RADIUS = 3.2;

const START_TARGETS = {
  player: { x: 6, y: 15 },
  enemy: { x: 40, y: 23 }
};
const OPENING_LOGISTICS_STOCKPILE = Object.freeze({
  [RESOURCE_IDS.supplies]: 0,
  [RESOURCE_IDS.gold]: 115,
  [RESOURCE_IDS.food]: 36,
  [RESOURCE_IDS.wood]: 32,
  [RESOURCE_IDS.population]: 10
});

const OUTPOST_NATIVE_RESOURCE_TRICKLE = Object.freeze({
  [RESOURCE_IDS.food]: 0.08,
  [RESOURCE_IDS.wood]: 0.06
});


const LEADER_TEMPLATE = {
  presence: 0.72,
  judgement: 0.66,
  discipline: 0.68,
  logistics: 0.64,
  initiative: 0.62,
  health: 150,
  armour: 0.12,
  attackRange: 6.8,
  attackDamage: 10,
  meleeRange: 1.25,
  meleeDamage: 9,
  meleeRateOfFireTicks: 2,
  rateOfFireTicks: 3,
  projectileSpeedTilesPerTick: 7.4,
  accuracy: 0.72,
  hearingRadius: 9
};

const LEADER_QUALITY_KEYS = ['presence', 'judgement', 'discipline', 'logistics', 'initiative'];

const WARRIOR_SQUAD_TEMPLATE = {
  unitId: 'warrior',
  label: 'Warrior',
  members: 1,
  cohesion: 0.68,
  morale: 0.72,
  firepower: 0.38,
  discipline: 0.48,
  scouting: 0.5,
  influenceRadius: 3.2,
  sightRadius: 6.4,
  hearingRadius: 7.2,
  speedMultiplier: 0.92,
  health: 62,
  armour: 0.03,
  attackRange: 4.6,
  attackDamage: 4,
  meleeRange: 1.28,
  meleeDamage: 8,
  meleeRateOfFireTicks: 2,
  rateOfFireTicks: 4,
  projectileSpeedTilesPerTick: 6.4,
  accuracy: 0.55,
  weaponProfile: 'spear-melee-thrown'
};

const INFANTRY_SQUAD_TEMPLATE = {
  unitId: 'infantry',
  label: 'Infantry Squad',
  members: 4,
  cohesion: 0.74,
  morale: 0.68,
  firepower: 0.58,
  discipline: 0.62,
  scouting: 0.54,
  influenceRadius: 5.6,
  sightRadius: 7.4,
  hearingRadius: 8.2,
  speedMultiplier: 0.84,
  health: 96,
  armour: 0.06,
  attackRange: 5.8,
  attackDamage: 5,
  meleeRange: 1.18,
  meleeDamage: 5.5,
  meleeRateOfFireTicks: 2,
  rateOfFireTicks: 3,
  projectileSpeedTilesPerTick: 7,
  accuracy: 0.62
};

const SCOUT_SQUAD_TEMPLATE = {
  unitId: 'scout',
  label: 'Forager Scout',
  members: 1,
  cohesion: 0.58,
  morale: 0.55,
  firepower: 0.05,
  discipline: 0.44,
  scouting: 0.84,
  influenceRadius: 2.6,
  sightRadius: 8,
  hearingRadius: 8.4,
  speedMultiplier: 1.02,
  health: 42,
  armour: 0,
  attackRange: 0,
  attackDamage: 0,
  meleeRange: 0,
  meleeDamage: 0,
  meleeRateOfFireTicks: 4,
  rateOfFireTicks: 4,
  projectileSpeedTilesPerTick: 0,
  accuracy: 0,
  combatEnabled: false,
  weaponProfile: 'none'
};

const SURVIVOR_GROUP_TEMPLATE = {
  ...SCOUT_SQUAD_TEMPLATE,
  unitId: 'survivors',
  label: 'Vulnerable Survivors',
  members: 5,
  cohesion: 0.46,
  morale: 0.38,
  scouting: 0.28,
  influenceRadius: 2,
  sightRadius: 4.8,
  speedMultiplier: 0.72,
  health: 70
};

const WOUNDED_SURVIVOR_TEMPLATE = {
  ...SCOUT_SQUAD_TEMPLATE,
  unitId: 'wounded_survivor',
  label: 'Wounded Survivor',
  members: 1,
  cohesion: 0.36,
  morale: 0.34,
  scouting: 0.22,
  influenceRadius: 1.4,
  sightRadius: 4.2,
  speedMultiplier: 0.5,
  health: 30
};

const RESOURCE_WORKER_TEMPLATE = {
  speedMultiplier: 0.72,
  arrivalDistanceTiles: 0.28,
  depositDistanceTiles: 0.82
};

const RESOURCE_WORKER_STATES = Object.freeze({
  idle: 'idle',
  gathering: 'gathering',
  outbound: 'outbound',
  harvesting: 'harvesting',
  returning: 'returning',
  blocked: 'blocked'
});

export const GAME_TIME = Object.freeze({
  dayLengthMs: 60 * 60 * 1000,
  tickDurationMs: 750,
  dayStartHour: 6,
  dawnHour: 5,
  duskHour: 19
});

export const FIELD_FOOD_SUPPLY = Object.freeze({
  capacity: 12,
  startingFood: 12,
  deliveryRequestThreshold: 7.5,
  consumptionPerDay: 2,
  starvationRetreatTicks: 160
});

const ENEMY_AI_DEFAULTS = Object.freeze({
  attackThreshold: 2,
  buildCooldownTicks: 8,
  attackRetargetTicks: 5,
  openingMusterDelayTicks: 18
});

const ENEMY_NEED_TYPES = Object.freeze({
  food: 'food',
  wood: 'wood',
  storage: 'storage',
  regroup: 'regroup'
});

const ENEMY_LOGISTICS_STRUCTURE_TYPES = Object.freeze({
  [ENEMY_NEED_TYPES.food]: 'hunting_tent',
  [ENEMY_NEED_TYPES.wood]: 'wood_gathering_post',
  [ENEMY_NEED_TYPES.storage]: 'storage_tent'
});

const ENEMY_FIGHTER_UNIT_PRIORITY = Object.freeze(['infantry', 'warrior']);
const ENEMY_FIGHTER_UNIT_IDS = Object.freeze(['warrior', 'infantry']);
const ENEMY_EXPANSION_STRUCTURE_PRIORITY = Object.freeze(['watchtower', 'builder_lodge']);

const ENEMY_STORAGE_PRESSURE_RATIO = 0.86;

export const ENEMY_AI_STATES = Object.freeze({
  boot: 'boot',
  survey: 'survey',
  buildBase: 'build_base',
  gatherForce: 'gather_force',
  expand: 'expand',
  attack: 'attack',
  retreatOrRebuild: 'retreat_or_rebuild'
});

export { CONSTRUCTION_JOB_STATES };

export const SQUAD_OCCUPANCY_STATES = Object.freeze({
  field: 'field',
  movingToOccupy: 'moving_to_occupy',
  occupied: 'occupied'
});

const OCCUPANCY_ENTRY_DISTANCE_TILES = 0.72;

export const PRESSURE_STANCES = {
  hold: {
    id: 'hold',
    label: 'Hold',
    objectiveMultiplier: 0.68,
    contestMultiplier: 0.72,
    moveMultiplier: 0.34,
    targetMode: 'anchor',
    description: 'Protects the anchor and reduces objective pressure.'
  },
  probe: {
    id: 'probe',
    label: 'Probe',
    objectiveMultiplier: 1,
    contestMultiplier: 1,
    moveMultiplier: 0.66,
    targetMode: 'staging',
    description: 'Balanced pressure without overcommitting.'
  },
  commit: {
    id: 'commit',
    label: 'Commit',
    objectiveMultiplier: 1.36,
    contestMultiplier: 1.22,
    moveMultiplier: 0.96,
    targetMode: 'objective',
    description: 'Pushes harder at the contest node.'
  }
};

export function createInitialGameState(map) {
  assertMapDataContract(map);
  const seed = isAuthoredRuntimeScene(map) ? createAuthoredSceneRuntimeSeed(map) : createLegacyRuntimeSeed(map);
  const outposts = seed.outposts;
  const structures = createOutpostStructureInstances(outposts);
  const runtimeDormancy = createRuntimeDormancyState(map);

  const game = {
    contract: GAME_STATE_CONTRACT_ID,
    version: GAME_STATE_VERSION,
    mapRef: createMapRef(map),
    tick: 0,
    phase: GAME_PHASES.openingCommandField,
    mode: GAME_MODES.leaderDuelSeed,
    selectedEntityId: seed.leaders.find((leader) => leader.factionId === 'player')?.id
      ?? seed.squads.find((squad) => squad.factionId === 'player')?.id
      ?? null,
    runtimeProfile: getSceneEntity(map).runtimeProfile,
    runtimeDormancy,
    factions: FACTIONS,
    time: normaliseGameTime(null, 0),
    economy: createOpeningEconomy(['player', 'enemy']),
    progression: createInitialProgressionState(),
    enemyAI: createEnemyAIState(runtimeDormancy.enabled ? {
      dormant: true,
      lastAction: 'Dormant: no hostile structure force is active in this survival scenario'
    } : {}),
    ai: createAISystemState(),
    weather: null,
    outposts,
    structures,
    constructionJobs: [],
    builders: createInitialBuilderCrews(structures),
    resourceWorkers: [],
    transports: [],
    leaders: seed.leaders,
    squads: seed.squads,
    projectiles: [],
    soundEvents: [],
    impactEvents: [],
    deathEvents: [],
    corpses: [],
    battlefieldTrace: createBattlefieldTrace(),
    combatStats: summarizeCombat(null),
    events: [],
    runtimeEvents: createRuntimeEventState(),
    dirty: createRuntimeDirtyState(),
    versions: createRuntimeVersions(map),
    scheduler: createRuntimeScheduler(),
    fields: {},
    collisionStats: summarizeCollisionAuthority(null)
  };

  return recomputeGameState(game, map);
}

function createLegacyRuntimeSeed(map) {
  const startTargets = getMapStartTargets(map);
  const playerOutpost = chooseAnchorTile(map, startTargets.player);
  const enemyOutpost = chooseAnchorTile(map, startTargets.enemy, {
    avoid: [playerOutpost],
    minDistance: Math.max(18, Math.floor(Math.min(map.width, map.height) * 0.34))
  });
  return {
    outposts: [
      createOutpost({ id: 'outpost_player_01', factionId: 'player', name: 'Player Field Outpost', tile: playerOutpost, buildableBy: 'player' }),
      createOutpost({ id: 'outpost_enemy_01', factionId: 'enemy', name: 'Enemy Field Outpost', tile: enemyOutpost, buildableBy: 'enemy' }),
      ...createScenarioContestableOutposts(map, playerOutpost, enemyOutpost)
    ],
    leaders: [
      createLeader({ id: 'leader_player_01', factionId: 'player', name: 'Player Command Unit', tile: playerOutpost, controller: 'player', stance: 'probe' }),
      createLeader({ id: 'leader_enemy_01', factionId: 'enemy', name: 'Enemy Command Unit', tile: enemyOutpost, controller: 'ai', stance: 'probe' })
    ],
    squads: []
  };
}

function createAuthoredSceneRuntimeSeed(map) {
  const entities = getSceneEntity(map).authoredEntities;
  const starts = entities.filter((entity) => entity.kind === 'start');
  const nomadicSurvival = isNomadicSurvivalScene(map);
  const outposts = nomadicSurvival ? [] : starts.map((entity) => createOutpost({
    id: entity.factionId === 'player' ? 'outpost_player_01' : 'outpost_enemy_01',
    factionId: entity.factionId,
    name: entity.factionId === 'player' ? 'Player Field Outpost' : 'Enemy Field Outpost',
    tile: entity.tile,
    buildableBy: entity.factionId
  }));
  if (!nomadicSurvival) {
    (map?.scenario?.neutralOutposts ?? []).forEach((outpost, index) => {
      outposts.push(createContestableOutpost({
        id: outpost.id ?? `outpost_neutral_${String(index + 1).padStart(2, '0')}`,
        name: outpost.name ?? `Authored Outpost ${index + 1}`,
        tile: outpost.tile,
        supply: outpost.supply
      }));
    });
  }
  const leaders = starts.map((entity) => {
    const leader = createLeader({
      id: entity.factionId === 'player' ? 'leader_player_01' : 'leader_enemy_01',
      factionId: entity.factionId,
      name: nomadicSurvival ? entity.label : entity.factionId === 'player' ? 'Player Command Unit' : 'Enemy Command Unit',
      tile: entity.tile,
      controller: entity.factionId === 'player' ? 'player' : 'ai',
      stance: 'probe',
      scenarioRole: entity.scenarioRole,
      survivorCount: entity.survivorCount,
      combatEnabled: !nomadicSurvival
    });
    return nomadicSurvival ? {
      ...leader,
      behavior: {
        ...leader.behavior,
        intent: 'guide-survivors',
        lastDecision: 'Keep the band together and seek shelter'
      }
    } : leader;
  });
  const squads = entities
    .filter((entity) => entity.kind === 'unit')
    .map((entity, index) => {
      const squad = createSquadFromTemplate(getSquadTemplate(entity.unitId), {
        id: `squad_${entity.factionId}_authored_${String(index + 1).padStart(2, '0')}`,
        factionId: entity.factionId,
        name: entity.label ?? `${FACTIONS[entity.factionId]?.label ?? entity.factionId} Unit ${index + 1}`,
        tile: entity.tile,
        stance: 'probe',
        scenarioRole: entity.scenarioRole,
        survivorCount: entity.survivorCount
      });
      return nomadicSurvival ? {
        ...squad,
        behavior: {
          ...squad.behavior,
          intent: 'follow-commander',
          lastDecision: 'Awaiting shelter movement from the tribal leader'
        }
      } : squad;
    });
  return { outposts, leaders, squads };
}

function createOpeningEconomy(factionIds = ['player', 'enemy']) {
  const economy = createInitialEconomy(factionIds);
  factionIds.forEach((factionId) => {
    economy.factions[factionId] = {
      ...economy.factions[factionId],
      stockpiles: {
        ...economy.factions[factionId].stockpiles,
        [RESOURCE_IDS.supplies]: createOpeningStockpile(RESOURCE_IDS.supplies, OPENING_LOGISTICS_STOCKPILE[RESOURCE_IDS.supplies]),
        [RESOURCE_IDS.gold]: createOpeningStockpile(RESOURCE_IDS.gold, OPENING_LOGISTICS_STOCKPILE[RESOURCE_IDS.gold]),
        [RESOURCE_IDS.food]: createOpeningStockpile(RESOURCE_IDS.food, OPENING_LOGISTICS_STOCKPILE[RESOURCE_IDS.food]),
        [RESOURCE_IDS.wood]: createOpeningStockpile(RESOURCE_IDS.wood, OPENING_LOGISTICS_STOCKPILE[RESOURCE_IDS.wood]),
        [RESOURCE_IDS.population]: createOpeningStockpile(RESOURCE_IDS.population, OPENING_LOGISTICS_STOCKPILE[RESOURCE_IDS.population])
      }
    };
  });
  return normaliseEconomy(economy, factionIds);
}

function createOpeningStockpile(resourceId, amount) {
  const rounded = round3(amount);
  if (resourceId === RESOURCE_IDS.supplies) {
    const components = splitAmountAcrossComponents(rounded, SUPPLIES_COMPONENT_IDS);
    return {
      resourceId,
      amount: rounded,
      components
    };
  }
  return {
    resourceId,
    amount: rounded,
    components: { [resourceId]: rounded }
  };
}

function splitAmountAcrossComponents(amount, componentIds) {
  const safeIds = componentIds.length > 0 ? componentIds : ['amount'];
  let assigned = 0;
  return Object.fromEntries(safeIds.map((componentId, index) => {
    const value = index === safeIds.length - 1
      ? round3(amount - assigned)
      : round3(amount / safeIds.length);
    assigned += value;
    return [componentId, value];
  }));
}

function emitRuntimeEvent(game, event = {}) {
  const entry = enqueueRuntimeEvent(game, event);
  drainRuntimeEvents(game);
  return entry;
}

function emitStructureNavigationChange(game, beforeSignature, afterSignature, payload = {}) {
  if (afterSignature === beforeSignature) {
    return false;
  }
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    constructionReachability: null,
    movementBlocked: null,
    navigationRoutes: null,
    structureNavigation: null
  };
  emitRuntimeEvent(game, {
    type: RUNTIME_EVENTS.structureNavChanged,
    payload: {
      beforeSignature,
      afterSignature,
      ...payload
    }
  });
  return true;
}

function getMovementOrderDeps() {
  return {
    ENTITY_TYPES,
    emitRuntimeEvent,
    getGameEntities,
    isFactionPlayerControlled,
    normaliseLeaderBehavior,
    normaliseSquadBehavior,
    recomputeGameState
  };
}

function getMovementPathDeps() {
  return {
    buildNavigationFlowField,
    materialiseFlowRoute
  };
}

function getConstructionSystemDeps() {
  return {
    FACTIONS,
    MOVEMENT_MODEL,
    advanceMovementPathCursor,
    bindRuntimeOwner,
    buildNavigationFlowField,
    canTraverseTileStep,
    clamp,
    clampToMapPosition,
    createJoinMask,
    directionFromTo,
    emitRuntimeEvent,
    emitStructureNavigationChange,
    ensureMovementPath,
    ensureRuntimeCoordination,
    entityNavigationMapSignature,
    getMovementPathWaypoint,
    getStructureMovementCostModifier,
    isMovementBlocked,
    materialiseFlowRoute,
    movementTerrainMultiplier,
    normaliseBuilder,
    normaliseLeaderMovement,
    normalisePosition,
    positionToTile,
    positiveNumber,
    recomputeGameState,
    refreshStructureJoineryConnections,
    resolveMovementStep,
    resolveNavigableMovementTarget,
    tileDistance,
    tileKey,
    validateStructurePathPlacement,
    validateStructurePlacement,
    validatePlacementFootprintSupport,
    validateRuntimeMovementPathNodes
  };
}

function getLogisticsSystemDeps() {
  return {
    ENTITY_TYPES,
    FIELD_FOOD_SUPPLY,
    GAME_TIME,
    MOVEMENT_MODEL,
    advanceMovementPathCursor,
    bindRuntimeOwner,
    clearRuntimeDirty,
    clamp,
    cloneTile,
    clampToMapPosition,
    completeScheduledSystem,
    createFieldSquadOccupancy,
    ensureMovementPath,
    ensureRuntimeCoordination,
    findOutpostForSquad,
    getMovementPathWaypoint,
    getSquadSupplyStatus,
    getStructureMovementCostModifier,
    issueFactionMovementOrder,
    movementTerrainMultiplier,
    normaliseLeaderMovement,
    normaliseMovableCollisionMetadata,
    normaliseMovementPath,
    normalisePosition,
    normaliseSquad,
    normaliseSquadSupply,
    positionToTile,
    positiveNumber,
    resolveMovementStep,
    resolveNavigableMovementTarget,
    shouldRunScheduledSystem,
    syncEconomyStorageCapacity,
    tileDistance,
    tileToPosition
  };
}

export function resetGameForMap(state) {
  state.game = createInitialGameState(state.map);
  state.gameOverlay = 'none';
  state.mode = 'play';
  state.status = 'Core loop reset: leaders seeded with one neutral contest node';
  state.gameDirty = true;
  return state.game;
}

export function advanceGameTick(game, map) {
  ensureRuntimeCoordination(game, map);
  drainRuntimeEvents(game);
  game.tick += 1;
  game.time = normaliseGameTime(game.time, game.tick);
  beginCollisionFrame(game);
  game.phase = game.tick === 0 ? GAME_PHASES.openingCommandField : GAME_PHASES.commandFieldStabilising;
  const runtimeDormancy = createRuntimeDormancyState(map);
  game.runtimeDormancy = runtimeDormancy;
  if (!runtimeDormancy.enabled) {
    advanceEnemyAIDirector(game, map);
  }
  advanceLeaderMovement(game, map);
  advanceSquadMovement(game, map);
  emitMovementSounds(game);
  if (!runtimeDormancy.enabled) {
    advanceResourceGathering(game, map);
    advanceSupplyLines(game, map);
    advanceConstructionJobs(game, map);
    syncStructureOccupancy(game, map);
  }
  resolveSoftUnitSeparation(game, map, {
    isHardBlocked: (tile, factionId, allowTile) => isMovementBlocked(map, tile, game, factionId, { allowTile })
  });
  recomputeGameState(game, map, { resolveContest: true });
  const beforeCombatNavigationSignature = createStructureNavigationSignature(game);
  const combatResult = advanceCombat(game, map, getCombatSystemDeps());
  emitStructureNavigationChange(game, beforeCombatNavigationSignature, createStructureNavigationSignature(game), {
    reason: 'combat-structure-state',
    tick: game.tick ?? 0
  });
  if (combatResult.needsRecompute) {
    recomputeGameState(game, map, { resolveContest: true });
  }
  advanceBattlefieldTrace(game);
  if (!runtimeDormancy.enabled) {
    game.economy = applySupplyIncomeTick(game.economy, game.outposts, ['player', 'enemy']);
  }
  assertGameStateContract(game);
  return game;
}

export function setPlayerPressureStance(game, map, stanceId) {
  const stance = normalisePressureStance(stanceId);
  game.leaders = game.leaders.map((leader) => {
    if (leader.factionId !== 'player') {
      return leader;
    }
    return {
      ...leader,
      behavior: {
        ...normaliseLeaderBehavior(leader.behavior, leader.factionId),
        stance,
        intent: 'contest-objective',
        lastDecision: `Player ordered ${PRESSURE_STANCES[stance].label.toLowerCase()} pressure`
      }
    };
  });
  game.squads = (game.squads ?? []).map((squad) => {
    if (squad.factionId !== 'player') {
      return squad;
    }
    return {
      ...squad,
      behavior: {
        ...normaliseSquadBehavior(squad.behavior, squad.factionId),
        stance,
        intent: 'contest-objective',
        lastDecision: `Player ordered ${PRESSURE_STANCES[stance].label.toLowerCase()} squad pressure`
      }
    };
  });
  emitRuntimeEvent(game, {
    type: 'stance:changed',
    factionId: 'player',
    payload: { stance, scope: 'army' }
  });
  return recomputeGameState(game, map);
}

export function setPlayerEntityPressureStance(game, map, entityId, stanceId) {
  const stance = normalisePressureStance(stanceId);
  const label = PRESSURE_STANCES[stance].label.toLowerCase();
  let matched = false;

  game.leaders = (game.leaders ?? []).map((leader) => {
    if (leader.id !== entityId || leader.factionId !== 'player') {
      return leader;
    }
    matched = true;
    return {
      ...leader,
      behavior: {
        ...normaliseLeaderBehavior(leader.behavior, leader.factionId),
        stance,
        intent: 'contest-objective',
        lastDecision: `Player ordered ${label} pressure override`
      }
    };
  });

  game.squads = (game.squads ?? []).map((squad) => {
    if (squad.id !== entityId || squad.factionId !== 'player') {
      return squad;
    }
    matched = true;
    return {
      ...squad,
      behavior: {
        ...normaliseSquadBehavior(squad.behavior, squad.factionId),
        stance,
        intent: 'contest-objective',
        lastDecision: `Player ordered ${label} squad override`
      }
    };
  });

  if (matched) {
    game.selectedEntityId = entityId;
    emitRuntimeEvent(game, {
      type: 'stance:changed',
      factionId: 'player',
      payload: { stance, scope: 'entity', entityId }
    });
  }

  return {
    ok: matched,
    reason: matched ? null : 'invalid-player-command-target',
    stance,
    entityId,
    game: recomputeGameState(game, map)
  };
}


const ACTIONABLE_COMMAND_SHELTER_THRESHOLD = 0.2;

export function issueAIBehaviourIntent(game, map, args = {}) {
  ensureRuntimeCoordination(game, map);
  const authority = validateCommanderLocalAuthority(game, map, args.target);
  if (!authority.ok) {
    return {
      ok: false,
      reason: authority.reason,
      message: authority.message,
      packet: null,
      accumulator: null,
      targetEntityIds: [],
      responses: [{
        status: 'rejected',
        reason: authority.message,
        chosenTarget: authority.target
      }],
      game
    };
  }
  game.ai = normaliseAISystemState(game.ai, game.tick);
  const selectedEntityId = typeof args.sourceEntityId === 'string'
    ? args.sourceEntityId
    : typeof game.selectedEntityId === 'string'
      ? game.selectedEntityId
      : 'leader_player_01';
  const intent = createIntentPacket({
    ...args,
    sourceEntityId: selectedEntityId,
    factionId: args.factionId ?? 'player',
    issuedAtTick: game.tick ?? 0,
    priority: args.priority ?? 0.48
  });
  const issued = issueIntentThroughAccumulator(game.ai, intent);
  game.ai = issued.state;
  const targetEntityIds = resolveAIIntentTargetEntityIds(game, issued.packet);

  if (issued.packet.type === AI_INTENT_STATES.distract && issued.packet.target) {
    const thrower = [...(game.leaders ?? []), ...(game.squads ?? [])]
      .find((entity) => entity.id === issued.packet.sourceEntityId && entity.factionId === issued.packet.factionId);
    const stone = thrower ? throwStoneProjectile(game, thrower, issued.packet.target, { sourceIntentId: issued.packet.id }) : null;
    if (stone) {
      emitRuntimeEvent(game, {
        type: RUNTIME_EVENTS.aiAttentionMarker,
        factionId: issued.packet.factionId,
        payload: { type: 'stone_thrown', projectileId: stone.id, sourceIntentId: issued.packet.id, position: stone.targetPosition }
      });
    }
  }

  emitRuntimeEvent(game, {
    type: RUNTIME_EVENTS.aiIntentIssued,
    factionId: issued.packet.factionId,
    payload: {
      intentId: issued.packet.id,
      type: issued.packet.type,
      sourceEntityId: issued.packet.sourceEntityId,
      target: issued.packet.target,
      scope: issued.packet.scope,
      urgency: issued.packet.urgency,
      repeatCount: issued.packet.repeatCount,
      overrideRisk: issued.accumulator.overrideRisk,
      strainDebt: issued.accumulator.strainDebt,
      targetEntityIds
    }
  });

  const behaviourFields = deriveCadencedBehaviourFields(map, game, game.fields ?? {});
  const responses = applyAIIntentResponses(game, map, issued.packet, targetEntityIds, behaviourFields);
  responses.forEach((response) => {
    emitRuntimeEvent(game, {
      type: RUNTIME_EVENTS.aiIntentResponse,
      factionId: issued.packet.factionId,
      payload: {
        intentId: response.intentId,
        entityId: response.entityId,
        status: response.status,
        confidence: response.confidence,
        chosenState: response.chosenState,
        chosenTarget: response.chosenTarget,
        reason: response.reason,
        overrideCost: response.overrideCost
      }
    });
  });

  return {
    ok: true,
    packet: issued.packet,
    accumulator: issued.accumulator,
    targetEntityIds,
    responses,
    game: recomputeGameState(game, map)
  };
}


function resolveAIIntentTargetEntityIds(game, packet) {
  const factionId = packet.factionId ?? 'player';
  const candidates = [...(game.leaders ?? []), ...(game.squads ?? [])].filter((entity) => entity.factionId === factionId);
  if (packet.scope === 'faction') {
    return candidates.map((entity) => entity.id);
  }
  if (packet.target?.entityId) {
    return candidates.some((entity) => entity.id === packet.target.entityId) ? [packet.target.entityId] : [];
  }
  if (typeof game.selectedEntityId === 'string' && candidates.some((entity) => entity.id === game.selectedEntityId)) {
    return [game.selectedEntityId];
  }
  return candidates.length > 0 ? [candidates[0].id] : [];
}

function applyAIIntentResponses(game, map, packet, targetEntityIds = [], behaviourFields = game.fields ?? {}) {
  const responses = [];
  const responseByKey = { ...(game.ai?.intentResponses ?? {}) };
  const applyToEntity = (entity) => {
    if (!targetEntityIds.includes(entity.id)) return entity;
    const context = createAIIntentEntityContext(game, map, entity, packet, behaviourFields);
    const result = applyResolvedIntentToEntityAI(entity, packet, context.sample, context);
    const response = result.response;
    responses.push(response);
    responseByKey[`${packet.id}:${entity.id}`] = response;
    let next = {
      ...entity,
      ai: result.ai,
      behavior: patchBehaviourFromAIResponse(entity, response)
    };
    next = applyMovementFromAIResponse(next, response, game.tick ?? 0);
    return next;
  };
  game.leaders = (game.leaders ?? []).map((leader) => applyToEntity(normaliseLeader(leader)));
  game.squads = (game.squads ?? []).map((squad) => applyToEntity(normaliseSquad(squad)));
  game.ai = normaliseAISystemState({
    ...game.ai,
    intentResponses: responseByKey
  }, game.tick);
  return responses;
}

function createAIIntentEntityContext(game, map, entity, packet, behaviourFields = game.fields ?? {}) {
  const position = entity.position ?? entity.tile;
  const tile = positionToTile(map, position);
  const sample = sampleBehaviourFields(behaviourFields, tile.x, tile.y);
  const explicitShelterTarget = resolveExplicitShelterCommandTarget(map, packet);
  const fieldShelterCandidate = findBestBehaviourFieldTile(map, behaviourFields, tile, {
    fieldId: 'shelter',
    avoidFieldId: 'threat',
    radius: packet.type === AI_INTENT_STATES.regroup ? 8 : 6
  });
  const shelterCandidate = explicitShelterTarget?.usable
    ? { x: explicitShelterTarget.position.x, y: explicitShelterTarget.position.y, score: explicitShelterTarget.shelterRating }
    : fieldShelterCandidate;
  const commander = findCommanderForFaction(game, entity.factionId);
  const commanderTarget = commander ? commander.position ?? commander.tile : null;
  const shelterTarget = shelterCandidate ? tileToPosition({ x: shelterCandidate.x, y: shelterCandidate.y }) : null;
  const fallbackTarget = shelterTarget ?? commanderTarget ?? entity.position ?? entity.tile;
  const shelterAvailable = explicitShelterTarget
    ? explicitShelterTarget.usable
    : Boolean(fieldShelterCandidate && fieldShelterCandidate.score > 0.18);
  return {
    entityId: entity.id,
    tick: game.tick ?? 0,
    sample,
    shelter: explicitShelterTarget?.usable ? explicitShelterTarget.shelterRating : sample.shelter,
    threat: sample.threat,
    exposure: sample.exposure,
    commandConfidence: sample.commandConfidence,
    morale: sample.morale,
    shelterAvailable,
    shelterTarget,
    shelterTargetId: explicitShelterTarget?.id ?? null,
    shelterRating: explicitShelterTarget?.shelterRating ?? fieldShelterCandidate?.score ?? null,
    shelterSource: explicitShelterTarget ? 'command_target' : fieldShelterCandidate ? 'field_query' : null,
    shelterDegradeReason: explicitShelterTarget && !explicitShelterTarget.usable
      ? explicitShelterTarget.reason
      : !explicitShelterTarget && packet.type === AI_INTENT_STATES.seekShelter && !fieldShelterCandidate
        ? 'no_shelter_candidate_near_unit'
        : null,
    commanderTarget,
    fallbackTarget,
    nearCommander: commander ? tileDistance(entity.position ?? entity.tile, commander.position ?? commander.tile) <= 4.5 : false,
    commanderDead: !commander && entity.factionId === 'player'
  };
}


function resolveExplicitShelterCommandTarget(map, packet = {}) {
  if (packet.type !== AI_INTENT_STATES.seekShelter || !packet.target) {
    return null;
  }
  const targetContract = packet.metadata?.commandTarget && typeof packet.metadata.commandTarget === 'object'
    ? packet.metadata.commandTarget
    : null;
  const targetTile = normaliseShelterTargetTile(targetContract?.position ?? packet.target);
  const authoredNode = findShelterNodeForCommandTarget(map, targetContract, targetTile);
  if (!targetContract && !authoredNode) {
    return null;
  }
  const position = normaliseShelterTargetTile(targetContract?.position ?? authoredNode?.tile ?? authoredNode?.position ?? packet.target);
  const shelterRating = clamp01(Number(targetContract?.shelterRating ?? authoredNode?.shelterRating ?? 0));
  const id = typeof targetContract?.id === 'string' ? targetContract.id : authoredNode?.id ?? null;
  if (!position) {
    return { id, usable: false, position: null, shelterRating, reason: 'no_anchor_position' };
  }
  if (targetContract?.knownToCommander === false) {
    return { id, usable: false, position, shelterRating, reason: 'target_not_known_to_commander' };
  }
  if (targetContract?.reachableKnown === false) {
    return { id, usable: false, position, shelterRating, reason: 'target_not_reachable' };
  }
  if (shelterRating < ACTIONABLE_COMMAND_SHELTER_THRESHOLD) {
    return { id, usable: false, position, shelterRating, reason: 'target_below_shelter_threshold' };
  }
  return { id, usable: true, position, shelterRating, reason: null };
}

function findShelterNodeForCommandTarget(map, targetContract, targetTile) {
  const nodes = isNomadicSurvivalScene(map) ? getShelterNodes(map) : [];
  const targetId = typeof targetContract?.id === 'string' ? targetContract.id : null;
  if (targetId) {
    const exact = nodes.find((node) => node.id === targetId);
    if (exact) return exact;
  }
  if (!targetTile) return null;
  return nodes
    .map((node) => ({ node, distance: tileDistance(node.tile ?? node.position ?? { x: 0, y: 0 }, targetTile) }))
    .filter((entry) => entry.distance <= 1.1)
    .sort((left, right) => left.distance - right.distance)[0]?.node ?? null;
}

function normaliseShelterTargetTile(value) {
  return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
    ? { x: Math.round(Number(value.x)), y: Math.round(Number(value.y)) }
    : null;
}

function patchBehaviourFromAIResponse(entity, response) {
  const patch = {
    intent: response.chosenState ?? entity.behavior?.intent ?? 'idle',
    lastDecision: response.reason ?? entity.behavior?.lastDecision ?? 'AI intent response'
  };
  if (response.status === 'accepted') patch.stance = entity.behavior?.stance ?? 'probe';
  if (response.status === 'degraded') patch.stance = 'probe';
  if (response.status === 'rejected') patch.stance = 'hold';
  if (response.status === 'overridden_by_survival') patch.stance = 'commit';
  if (entity.type === ENTITY_TYPES.leader) {
    return { ...normaliseLeaderBehavior(entity.behavior, entity.factionId), ...patch };
  }
  return { ...normaliseSquadBehavior(entity.behavior, entity.factionId), ...patch };
}

function applyMovementFromAIResponse(entity, response, tick = 0) {
  if (!response?.chosenTarget || !response.chosenState) return entity;
  const movingStates = new Set([
    AI_INTENT_STATES.moveToTarget,
    AI_INTENT_STATES.seekShelter,
    AI_INTENT_STATES.quietMove,
    AI_INTENT_STATES.regroup,
    AI_INTENT_STATES.investigate,
    AI_INTENT_STATES.flee
  ]);
  if (!movingStates.has(response.chosenState)) {
    return entity;
  }
  return issueFactionMovementOrder(entity, response.chosenTarget, tick, {
    routeMode: 'player-intended',
    stance: response.status === 'overridden_by_survival' ? 'commit' : response.status === 'rejected' ? 'hold' : 'probe',
    intent: response.chosenState,
    lastDecision: response.reason
  });
}

function findCommanderForFaction(game, factionId) {
  return (game.leaders ?? []).find((leader) => leader.factionId === factionId && leader.health?.state !== 'dead') ?? null;
}

export function setPlayerMovementIntent(game, map, entityId, path) {
  return issuePlayerMoveCommand(game, map, entityId, path).game;
}

export function issuePlayerMoveCommand(game, map, entityId, path) {
  const authority = validateCommanderLocalAuthority(game, map, path?.[path.length - 1]);
  if (!authority.ok) {
    return {
      ok: false,
      reason: authority.reason,
      message: authority.message,
      entityId,
      game
    };
  }
  return issuePlayerMoveCommandSystem(game, map, entityId, path, getMovementOrderDeps());
}

function validateCommanderLocalAuthority(game, map, target) {
  if (!isNomadicSurvivalScene(map) || !target) {
    return { ok: true, reason: null, message: null, target };
  }
  const commander = findCommanderForFaction(game, 'player');
  if (!commander) {
    return { ok: false, reason: 'commander-unavailable', message: 'The band has no leader able to carry this command.', target };
  }
  const radius = Math.max(1, Number(map?.scenario?.scenarioLayer?.cameraRig?.commandRadiusTiles) || 12);
  if (tileDistance(commander.position ?? commander.tile, target) <= radius) {
    return { ok: true, reason: null, message: null, target };
  }
  return {
    ok: false,
    reason: 'outside-commander-authority',
    message: 'That point is beyond the tribal leader\'s calling reach.',
    target
  };
}

export function probeMapAt(game, map, tile) {
  if (!tile || !isInBounds(map, tile.x, tile.y)) {
    return {
      valid: false,
      reason: 'out-of-bounds',
      tile: null
    };
  }
  const terrainField = getTerrainField(map, tile.x, tile.y);
  const entity = getGameEntities(game)
    .map((candidate) => ({
      entity: candidate,
      distance: tileDistance(candidate.position ?? candidate.tile, tile)
    }))
    .filter((entry) => entry.distance <= 1.15)
    .sort((a, b) => a.distance - b.distance)[0]?.entity ?? null;
  return {
    valid: true,
    tile: { ...tile },
    terrain: getTerrain(getTile(map, tile.x, tile.y)).id,
    passability: terrainField.passability,
    water: terrainField.water,
    blocked: isMovementBlocked(map, tile, game, 'player'),
    entity: entity ? {
      id: entity.id,
      type: entity.type ?? entity.entityType,
      factionId: entity.factionId,
      controlOwner: getFactionControlOwner(entity.factionId)
    } : null
  };
}

export function spawnWarriorSquad(game, map, { factionId = 'player', select = true } = {}) {
  const outpost = game.outposts.find((candidate) => !candidate.contestable && candidate.factionId === factionId);
  if (!outpost) {
    return { ok: false, reason: 'missing-deployment-outpost', game: recomputeGameState(game, map) };
  }
  const count = (game.squads ?? []).filter((squad) => squad.factionId === factionId && squad.unitId === 'warrior').length + 1;
  const id = `squad_${factionId}_warrior_${String(count).padStart(2, '0')}`;
  const leader = game.leaders.find((candidate) => candidate.factionId === factionId);
  game.squads = [
    ...(game.squads ?? []),
    createWarriorSquad({
      id,
      factionId,
      name: `${FACTIONS[factionId]?.label ?? factionId} Warrior ${count}`,
      tile: outpost.tile,
      stance: leader?.behavior?.stance ?? 'probe'
    })
  ];
  if (select) {
    game.selectedEntityId = id;
  }
  emitRuntimeEvent(game, {
    type: 'squad:spawned',
    factionId,
    payload: { squadId: id, unitId: 'warrior' }
  });
  return { ok: true, squad: game.squads[game.squads.length - 1], game: recomputeGameState(game, map) };
}

export function spawnInfantrySquad(game, map, { factionId = 'player', select = true } = {}) {
  const outpost = game.outposts.find((candidate) => !candidate.contestable && candidate.factionId === factionId);
  if (!outpost) {
    return { ok: false, reason: 'missing-deployment-outpost', game: recomputeGameState(game, map) };
  }
  const count = (game.squads ?? []).filter((squad) => squad.factionId === factionId && squad.unitId === 'infantry').length + 1;
  const id = `squad_${factionId}_infantry_${String(count).padStart(2, '0')}`;
  const leader = game.leaders.find((candidate) => candidate.factionId === factionId);
  game.squads = [
    ...(game.squads ?? []),
    createInfantrySquad({
      id,
      factionId,
      name: `${FACTIONS[factionId]?.label ?? factionId} Infantry ${count}`,
      tile: outpost.tile,
      stance: leader?.behavior?.stance ?? 'probe'
    })
  ];
  if (select) {
    game.selectedEntityId = id;
  }
  emitRuntimeEvent(game, {
    type: 'squad:spawned',
    factionId,
    payload: { squadId: id, unitId: 'infantry' }
  });
  return { ok: true, squad: game.squads[game.squads.length - 1], game: recomputeGameState(game, map) };
}

export function summarizeBuilderCapacity(game, factionIds = ['player', 'enemy']) {
  const structures = (game?.structures ?? []).map(normaliseStructure);
  const builders = (game?.builders ?? []).map(normaliseBuilder);
  return Object.fromEntries(factionIds.map((factionId) => {
    const capacity = structures
      .filter((structure) => structure.factionId === factionId)
      .filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.complete)
      .filter((structure) => structure.workforce?.enabled)
      .reduce((sum, structure) => sum + Math.max(0, structure.workforce?.builderCapacityBonus ?? 0), 0);
    const used = builders.filter((builder) => builder.factionId === factionId).length;
    return [factionId, {
      factionId,
      used,
      capacity,
      free: Math.max(0, capacity - used),
      trainingStructureIds: structures
        .filter((structure) => structure.factionId === factionId)
        .filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.complete)
        .filter((structure) => structure.workforce?.enabled && structure.workforce?.canTrainBuilders)
        .map((structure) => structure.id)
    }];
  }));
}

export function validateBuilderCrewTraining(game, map, { factionId = 'player' } = {}) {
  assertMapDataContract(map);
  const capacity = summarizeBuilderCapacity(game)[factionId] ?? { used: 0, capacity: 0, free: 0, trainingStructureIds: [] };
  if (capacity.trainingStructureIds.length <= 0) {
    return { ok: false, reason: 'missing-builder-home', capacity, base: null };
  }
  if (capacity.used >= capacity.capacity) {
    return { ok: false, reason: 'builder-capacity-reached', capacity, base: null };
  }
  const base = findBuilderTrainingBase(game, factionId, capacity.trainingStructureIds);
  if (!base) {
    return { ok: false, reason: 'missing-builder-home', capacity, base: null };
  }
  return { ok: true, reason: null, capacity, base };
}

export function spawnBuilderCrew(game, map, { factionId = 'player', select = true } = {}) {
  const validation = validateBuilderCrewTraining(game, map, { factionId });
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, capacity: validation.capacity, game: recomputeGameState(game, map) };
  }

  const base = validation.base;
  const count = (game.builders ?? []).filter((builder) => builder.factionId === factionId).length + 1;
  let id = `builder_${factionId}_${String(count).padStart(2, '0')}`;
  let suffix = count;
  const existingIds = new Set((game.builders ?? []).map((builder) => builder.id));
  while (existingIds.has(id)) {
    suffix += 1;
    id = `builder_${factionId}_${String(suffix).padStart(2, '0')}`;
  }

  const spawnPosition = getBuilderSpawnPosition(map, base, count);
  const builder = createBuilderCrew({
    id,
    factionId,
    name: `${FACTIONS[factionId]?.label ?? factionId} Builder ${count}`,
    tile: positionToTile(map, spawnPosition),
    position: spawnPosition,
    baseStructureId: base.id
  });

  game.builders = [...(game.builders ?? []), builder];
  if (select) {
    game.selectedEntityId = id;
  }
  emitRuntimeEvent(game, {
    type: 'builder:spawned',
    factionId,
    payload: { builderId: id, baseStructureId: base.id, capacity: validation.capacity.capacity, used: validation.capacity.used + 1 }
  });
  return { ok: true, builder, capacity: summarizeBuilderCapacity(game)[factionId], game: recomputeGameState(game, map) };
}

export function validateStructurePlacement(game, map, { type, factionId = 'player', position = null, tile = null, checkConstructionAccess = true } = {}) {
  const definition = getStructureDefinition(type);
  const targetPosition = normalisePosition(position, tile);
  const targetTile = positionToTile(map, targetPosition);
  if (!definition) {
    return createPlacementValidation(false, 'unknown-structure', 'Unknown structure type');
  }
  if (!isInBounds(map, targetTile.x, targetTile.y)) {
    return createPlacementValidation(false, 'out-of-bounds', 'Outside map bounds');
  }
  const terrainField = getTerrainField(map, targetTile.x, targetTile.y);
  if (terrainField.passability < 0.42 || terrainField.water >= 0.75) {
    return createPlacementValidation(false, 'unbuildable-terrain', 'Terrain cannot support construction');
  }
  const cost = definition.construction?.supplyCost ?? 0;
  const resourceCost = definition.construction?.resourceCost ?? { [RESOURCE_IDS.supplies]: cost };
  const affordability = canAffordCost(game.economy, factionId, resourceCost);
  if (!affordability.ok) {
    return {
      ...createPlacementValidation(false, affordability.reason ?? 'insufficient-resources', `Need ${describeResourceCost(resourceCost)}`),
      cost,
      resourceCost,
      missingResources: affordability.missing
    };
  }

  const existingStructures = (game.structures ?? []).filter((structure) => structure.construction?.state !== CONSTRUCTION_STATES.ruined);
  const sameTileStructure = existingStructures.find((structure) => sameTile(structure.tile ?? structure.position, targetTile));
  const placementRelation = resolveSingleStructurePlacementRelation(type, sameTileStructure);

  if (sameTileStructure && !placementRelation.allowed) {
    return createPlacementValidation(false, 'occupied-tile', `Blocked by ${sameTileStructure.name ?? sameTileStructure.type}`);
  }

  const inheritedOrientation = placementRelation.inheritOrientation
    ? sameTileStructure?.orientation ?? null
    : null;
  const candidate = createStructureInstance(type, {
    factionId,
    tile: targetTile,
    position: targetPosition,
    orientation: inheritedOrientation,
    construction: {
      state: CONSTRUCTION_STATES.blueprint,
      progress: 0
    }
  });
  const footprintSupport = validatePlacementFootprintSupport(map, candidate);
  if (!footprintSupport.valid) {
    return createPlacementValidation(false, footprintSupport.reason, footprintSupport.message);
  }
  const overlap = existingStructures.find((structure) => {
    if (sameTileStructure && structure.id === sameTileStructure.id && placementRelation.allowed) {
      return false;
    }
    if (!structureFootprintsOverlap(candidate, structure)) {
      return false;
    }
    return !canStructuresJoin(type, structure.type) || !areAdjacentOrSame(targetTile, structure.tile ?? structure.position);
  });
  if (overlap) {
    return createPlacementValidation(false, 'overlaps-structure', `Overlaps ${overlap.name ?? overlap.type}`);
  }
  const connectors = collectSinglePlacementConnectors(type, targetTile, existingStructures, sameTileStructure);
  const sourceBase = findNearestBuilderBase(game, factionId, targetPosition);
  const access = checkConstructionAccess && sourceBase ? validateConstructionAccess(game, map, candidate, factionId, sourceBase) : null;
  if (access && !access.valid) {
    return {
      ...createPlacementValidation(false, access.reason, access.message),
      cost,
      sourceBaseId: sourceBase?.id ?? null,
      position: roundPosition(targetPosition),
      tile: targetTile,
      structureType: type,
      constructionAccess: access
    };
  }
  return {
    ...createPlacementValidation(true, sourceBase ? 'valid' : 'pending-builder-base', sourceBase ? 'Placement ready' : 'No builder base; job will wait'),
    cost,
    resourceCost,
    sourceBaseId: sourceBase?.id ?? null,
    position: roundPosition(targetPosition),
    tile: targetTile,
    structureType: type,
    constructionAccess: access,
    placementRelation: placementRelation.allowed ? {
      mode: placementRelation.mode,
      targetStructureId: sameTileStructure?.id ?? null,
      targetType: sameTileStructure?.type ?? null,
      inheritOrientation: placementRelation.inheritOrientation
    } : null,
    connectors: dedupeConnectors(connectors)
  };
}

export function validateStructurePathPlacement(game, map, { type, factionId = 'player', path = [] } = {}) {
  const definition = getStructureDefinition(type);
  if (!definition) {
    return createPlacementValidation(false, 'unknown-structure', 'Unknown structure type');
  }
  if (!isSketchableStructureType(type)) {
    return createPlacementValidation(false, 'not-path-buildable', `${definition.label} is placed as a single structure`);
  }
  const sketchTiles = materialiseStructureSketchPath(path);
  if (sketchTiles.length === 0) {
    return createPlacementValidation(false, 'empty-path', 'Drag a build line to sketch this structure');
  }
  const existingStructures = (game.structures ?? []).filter((structure) => structure.construction?.state !== CONSTRUCTION_STATES.ruined);
  const connectors = [];
  const candidateTiles = [];
  const errors = [];

  sketchTiles.forEach((tile, index) => {
    if (!isInBounds(map, tile.x, tile.y)) {
      errors.push({ tile, reason: 'out-of-bounds', message: 'Outside map bounds' });
      return;
    }
    const sameTileStructure = existingStructures.find((structure) => sameTile(structure.tile ?? structure.position, tile));
    if (sameTileStructure) {
      if (canStructureUseExistingTile(type, sameTileStructure)) {
        connectors.push(createStructureConnector(sameTileStructure, tile, 'built-on', tile));
        return;
      }
      errors.push({ tile, reason: 'occupied-tile', message: `Blocked by ${sameTileStructure.name ?? sameTileStructure.type}` });
      return;
    }
    const terrainField = getTerrainField(map, tile.x, tile.y);
    if (terrainField.passability < 0.42 || terrainField.water >= 0.75) {
      errors.push({ tile, reason: 'unbuildable-terrain', message: 'Terrain cannot support construction' });
      return;
    }
    const candidate = createStructureInstance(type, {
      factionId,
      tile,
      position: tile,
      construction: { state: CONSTRUCTION_STATES.blueprint, progress: 0 }
    });
    const overlap = existingStructures.find((structure) => {
      if (!structureFootprintsOverlap(candidate, structure)) {
        return false;
      }
      return !canStructuresJoin(type, structure.type) || !areAdjacentOrSame(tile, structure.tile ?? structure.position);
    });
    if (overlap) {
      errors.push({ tile, reason: 'overlaps-structure', message: `Overlaps ${overlap.name ?? overlap.type}` });
      return;
    }
    existingStructures
      .filter((structure) => canStructuresJoin(type, structure.type) && areAdjacentOrSame(tile, structure.tile ?? structure.position))
      .forEach((structure) => connectors.push(createStructureConnector(structure, structure.tile ?? structure.position, 'adjacent', tile)));
    candidateTiles.push(tile);
  });

  const uniqueCandidateTiles = dedupeTiles(candidateTiles);
  if (errors.length > 0) {
    const first = errors[0];
    return {
      ...createPlacementValidation(false, first.reason, first.message),
      path: sketchTiles,
      pathPlan: {
        type,
        factionId,
        tiles: sketchTiles,
        candidates: uniqueCandidateTiles,
        connectors: dedupeConnectors(connectors),
        errors
      }
    };
  }
  if (uniqueCandidateTiles.length === 0) {
    return {
      ...createPlacementValidation(false, 'no-new-segments', 'Path only touches existing anchors; sketch through empty tiles to add segments'),
      path: sketchTiles,
      pathPlan: { type, factionId, tiles: sketchTiles, candidates: [], connectors: dedupeConnectors(connectors), errors: [] }
    };
  }

  const sourceBase = findNearestBuilderBase(game, factionId, uniqueCandidateTiles[0]);
  const segments = enrichStructureSketchTiles(type, uniqueCandidateTiles, dedupeConnectors(connectors));
  const accessChecks = sourceBase
    ? segments.map((segment) => validateConstructionAccess(game, map, createStructureInstance(type, {
      factionId,
      tile: segment.tile,
      position: segment.position,
      orientation: segment.orientation,
      construction: { state: CONSTRUCTION_STATES.blueprint, progress: 0 }
    }), factionId, sourceBase))
    : [];
  const blockedAccess = accessChecks.find((access) => !access.valid);
  if (blockedAccess) {
    return {
      ...createPlacementValidation(false, blockedAccess.reason, blockedAccess.message),
      sourceBaseId: sourceBase?.id ?? null,
      path: sketchTiles,
      pathPlan: { type, factionId, tiles: sketchTiles, candidates: uniqueCandidateTiles, segments, connectors: dedupeConnectors(connectors), errors: [] },
      constructionAccess: blockedAccess
    };
  }
  const cost = Math.max(0, Number(definition.construction?.supplyCost) || 0) * segments.length;
  const resourceCost = scaleResourceCost(definition.construction?.resourceCost ?? { [RESOURCE_IDS.supplies]: definition.construction?.supplyCost ?? 0 }, segments.length);
  const affordability = canAffordCost(game.economy, factionId, resourceCost);
  if (!affordability.ok) {
    return {
      ...createPlacementValidation(false, affordability.reason ?? 'insufficient-resources', `Need ${describeResourceCost(resourceCost)}`),
      cost,
      resourceCost,
      missingResources: affordability.missing,
      sourceBaseId: sourceBase?.id ?? null,
      path: sketchTiles,
      pathPlan: { type, factionId, tiles: sketchTiles, candidates: uniqueCandidateTiles, segments, connectors: dedupeConnectors(connectors), errors: [] }
    };
  }

  return {
    ...createPlacementValidation(true, sourceBase ? 'valid' : 'pending-builder-base', sourceBase ? 'Path blueprint ready' : 'No builder base; job will wait'),
    cost,
    sourceBaseId: sourceBase?.id ?? null,
    position: segments[0]?.position ?? null,
    tile: segments[0]?.tile ?? null,
    structureType: type,
    path: sketchTiles,
    pathPlan: {
      type,
      factionId,
      tiles: sketchTiles,
      candidates: uniqueCandidateTiles,
      segments,
      connectors: dedupeConnectors(connectors),
      errors: []
    },
    constructionAccess: sourceBase ? {
      valid: true,
      reason: 'reachable',
      message: 'Builder access ready',
      checkedSegments: accessChecks.length
    } : null
  };
}

export function placeStructurePathBuildOrder(game, map, { type, factionId = 'player', path = [] } = {}) {
  return placeStructurePathBuildOrderSystem(game, map, { type, factionId, path }, getConstructionSystemDeps());
}

export function placeStructureBuildOrder(game, map, { type, factionId = 'player', position = null, tile = null } = {}) {
  return placeStructureBuildOrderSystem(game, map, { type, factionId, position, tile }, getConstructionSystemDeps());
}


export function issueSquadOccupyStructureAtTile(game, map, squadId, tile) {
  const squad = (game?.squads ?? []).find((candidate) => candidate.id === squadId);
  if (!squad || squad.factionId !== 'player') {
    return { ok: false, reason: 'invalid-squad', message: 'Select a friendly infantry squad first.', game: recomputeGameState(game, map) };
  }
  const targetStructure = findOccupiableStructureAtTile(game, tile, squad);
  if (!targetStructure) {
    return { ok: false, reason: 'no-occupiable-structure', message: 'No friendly occupiable structure on that tile.', game: recomputeGameState(game, map) };
  }
  return issueSquadOccupyStructureCommand(game, map, squad.id, targetStructure.id);
}

export function issueSquadOccupyStructureCommand(game, map, squadId, structureId) {
  const squad = (game?.squads ?? []).find((candidate) => candidate.id === squadId);
  const structure = (game?.structures ?? []).find((candidate) => candidate.id === structureId);
  if (!squad) {
    return { ok: false, reason: 'missing-squad', message: 'Squad not found.', game: recomputeGameState(game, map) };
  }
  if (!structure) {
    return { ok: false, reason: 'missing-structure', message: 'Structure not found.', game: recomputeGameState(game, map) };
  }
  const validation = validateSquadOccupyStructure(squad, structure);
  if (!validation.valid) {
    return { ok: false, reason: validation.reason, message: validation.message, structure, squad, game: recomputeGameState(game, map) };
  }

  const entryPoint = chooseStructureAccessPoint(structure, squad.position ?? squad.tile, 'entry');
  const distanceToEntry = tileDistance(squad.position ?? squad.tile, entryPoint);
  if (distanceToEntry <= OCCUPANCY_ENTRY_DISTANCE_TILES) {
    game.squads = (game.squads ?? []).map((candidate) => (
      candidate.id === squad.id ? enterSquadStructure(game, map, normaliseSquad(candidate), normaliseStructure(structure)) : candidate
    ));
    game.selectedEntityId = structure.id;
    return { ok: true, mode: 'entered', structure, squad, game: recomputeGameState(game, map) };
  }

  game.squads = (game.squads ?? []).map((candidate) => {
    if (candidate.id !== squad.id) {
      return normaliseSquad(candidate);
    }
    const normalised = normaliseSquad(candidate);
    return {
      ...normalised,
      occupancy: {
        state: SQUAD_OCCUPANCY_STATES.movingToOccupy,
        structureId: structure.id,
        assignedAtTick: game.tick ?? 0,
        enteredAtTick: null
      },
      movementOrder: {
        type: 'path-hold',
        routeMode: 'occupy-structure',
        path: normaliseRuntimeMovementPathNodes([normalised.position, entryPoint]),
        target: roundPosition(entryPoint),
        issuedAtTick: game.tick ?? 0
      },
      movementPath: null,
      behavior: {
        ...normaliseSquadBehavior(normalised.behavior, normalised.factionId),
        stance: 'hold',
        intent: 'occupy-structure',
        lastDecision: `Moving to occupy ${structure.name ?? structure.type}`
      }
    };
  });
  game.selectedEntityId = squad.id;
  return { ok: true, mode: 'moving', structure, squad, entryPoint, game: recomputeGameState(game, map) };
}

export function evacuateStructureOccupants(game, map, structureId, { squadId = null } = {}) {
  const structure = (game?.structures ?? []).find((candidate) => candidate.id === structureId);
  if (!structure?.occupancy?.enabled) {
    return { ok: false, reason: 'not-occupiable', message: 'Selected structure cannot hold squads.', game: recomputeGameState(game, map) };
  }
  const occupants = (structure.occupancy.occupants ?? []).filter((id) => !squadId || id === squadId);
  if (occupants.length === 0) {
    return { ok: false, reason: 'empty', message: 'No occupants to evacuate.', game: recomputeGameState(game, map) };
  }

  const exitPoints = structure.occupancy.exitPoints?.length ? structure.occupancy.exitPoints : structure.occupancy.entryPoints;
  game.structures = (game.structures ?? []).map((candidate) => {
    if (candidate.id !== structure.id) {
      return normaliseStructure(candidate);
    }
    return normaliseStructure({
      ...candidate,
      occupancy: {
        ...candidate.occupancy,
        occupants: (candidate.occupancy.occupants ?? []).filter((id) => !occupants.includes(id))
      }
    });
  });

  game.squads = (game.squads ?? []).map((candidate) => {
    const normalised = normaliseSquad(candidate);
    if (!occupants.includes(normalised.id)) {
      return normalised;
    }
    const exitPoint = resolveEvacuationPoint(map, game, structure, exitPoints[occupants.indexOf(normalised.id) % Math.max(1, exitPoints.length)] ?? structure.position, normalised.factionId);
    return {
      ...normalised,
      position: exitPoint,
      tile: positionToTile(map, exitPoint),
      occupancy: createFieldSquadOccupancy(),
      movement: normaliseLeaderMovement({
        status: 'idle',
        target: exitPoint,
        targetMode: 'evacuated',
        distanceToTarget: 0,
        lastStepTiles: 0
      }, exitPoint),
      movementOrder: null,
      movementPath: null,
      behavior: {
        ...normaliseSquadBehavior(normalised.behavior, normalised.factionId),
        intent: 'support-objective',
        lastDecision: `Evacuated from ${structure.name ?? structure.type}`
      }
    };
  });
  game.selectedEntityId = occupants[0] ?? structure.id;
  return { ok: true, evacuatedSquadIds: occupants, structure, game: recomputeGameState(game, map) };
}

export function summarizeStructureOccupancy(game) {
  const structures = game?.structures ?? [];
  const occupiable = structures.filter((structure) => structure.occupancy?.enabled && (structure.occupancy.capacitySquads ?? 0) > 0);
  const occupied = occupiable.reduce((sum, structure) => sum + (structure.occupancy?.occupants?.length ?? 0), 0);
  const capacity = occupiable.reduce((sum, structure) => sum + (structure.occupancy?.capacitySquads ?? 0), 0);
  return {
    occupiableStructures: occupiable.length,
    occupiedSquads: occupied,
    capacitySquads: capacity,
    openSlots: Math.max(0, capacity - occupied),
    structures: occupiable.map((structure) => ({
      id: structure.id,
      type: structure.type,
      factionId: structure.factionId,
      mode: structure.occupancy.mode,
      occupants: [...(structure.occupancy.occupants ?? [])],
      capacitySquads: structure.occupancy.capacitySquads
    }))
  };
}

export function summarizeCombat(game) {
  return summarizeCombatSystem(game, getCombatSystemDeps());
}

export function recomputeGameState(game, map, { resolveContest = false } = {}) {
  assertMapDataContract(map);
  const runtimeDormancy = createRuntimeDormancyState(map);
  game.contract = game.contract ?? GAME_STATE_CONTRACT_ID;
  game.version = game.version ?? GAME_STATE_VERSION;
  ensureRuntimeCoordination(game, map);
  game.mapRef = createMapRef(map);
  game.runtimeProfile = getSceneEntity(map).runtimeProfile;
  game.runtimeDormancy = runtimeDormancy;
  game.factions = game.factions ?? FACTIONS;
  game.time = normaliseGameTime(game.time, game.tick);
  game.economy = normaliseEconomy(game.economy, ['player', 'enemy']);
  game.enemyAI = normaliseEnemyAIState(runtimeDormancy.enabled ? {
    ...game.enemyAI,
    dormant: true,
    lastAction: 'Dormant: no hostile structure force is active in this survival scenario'
  } : { ...game.enemyAI, dormant: false });
  game.ai = normaliseAISystemState(game.ai, game.tick);
  game.weather = normaliseWeatherState(game.weather);
  game.collisionStats = summarizeCollisionAuthority(game);
  game.outposts = game.outposts.map(normaliseOutpost);
  game.structures = normaliseGameStructures(game);
  if (!runtimeDormancy.enabled) {
    game.economy = syncEconomyStorageCapacity(game);
  }
  game.constructionJobs = (game.constructionJobs ?? []).map(normaliseConstructionJob);
  game.builders = (runtimeDormancy.enabled
    ? (game.builders ?? [])
    : (Array.isArray(game.builders) && game.builders.length > 0 ? game.builders : createInitialBuilderCrews(game.structures))).map(normaliseBuilder);
  game.builderCapacity = summarizeBuilderCapacity(game);
  game.resourceWorkers = runtimeDormancy.enabled
    ? (game.resourceWorkers ?? []).map(normaliseResourceWorker)
    : syncResourceWorkersForGatheringStructures(game, map);
  game.transports = runtimeDormancy.enabled
    ? (game.transports ?? []).map(normaliseSupplyTransport)
    : syncSupplyTransportsForStorageStructures(game, map);
  game.squads = (game.squads ?? []).map(normaliseSquad);
  game.projectiles = normaliseProjectiles(game.projectiles);
  game.soundEvents = normaliseSoundEvents(game.soundEvents, game.tick);
  game.impactEvents = normaliseImpactEvents(game.impactEvents);
  game.deathEvents = normaliseDeathEvents(game.deathEvents);
  game.corpses = normaliseCorpses(game.corpses);
  game.battlefieldTrace = normaliseBattlefieldTrace(game.battlefieldTrace);
  if (!runtimeDormancy.enabled) {
    syncStructureOccupancy(game, map);
  }
  game.leaders = game.leaders.map((leader) => {
    const normalisedLeader = normaliseLeader(leader);
    const outpost = findOutpostForLeader(game, normalisedLeader);
    const objective = findPrimaryContestableOutpost(game);
    const command = evaluateLeaderCommand(map, normalisedLeader, outpost);
    return {
      ...normalisedLeader,
      command,
      commandScore: command.score,
      influenceRadius: command.influenceRadius,
      objectiveProjection: objective ? evaluateObjectiveProjection(map, normalisedLeader, objective, command) : null
    };
  });
  applyUnitStealthStates(game, map);
  updateContestableOutposts(game, map, { resolveContest });
  game.fields = deriveCadencedCommandInfluenceFields(map, game);
  game.fields = {
    ...game.fields,
    ...deriveLineOfSightFields(map, game),
    ...(runtimeDormancy.enabled ? {} : deriveCachedResourceFields(map, game))
  };
  const weather = deriveCachedWeatherFields(map, game);
  game.weather = weather.summary;
  game.fields = {
    ...game.fields,
    ...weather.fields
  };
  const behaviourFields = deriveRuntimeBehaviourFields(map, game, game.fields);
  game.fields = {
    ...game.fields,
    ...behaviourFields
  };
  game.frontline = deriveCadencedInfluenceFrontline(map, game.fields, game);
  game.constructionStats = summarizeConstruction(game);
  game.supplyLineStats = summarizeSupplyLines(game);
  game.combatStats = summarizeCombat(game);
  assertGameStateContract(game);
  return game;
}

function deriveCachedWeatherFields(map, game) {
  ensureRuntimeCoordination(game, map);
  const cached = game?._runtimeCache?.weatherFields;
  if (cached?.fields && cached?.summary && !shouldRunScheduledSystem(game, 'weatherFields')) {
    return cached;
  }
  const weather = deriveWeatherFields(map, game);
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    weatherFields: weather
  };
  completeScheduledSystem(game, 'weatherFields');
  return weather;
}

function normaliseWeatherState(weather = null) {
  if (!weather || typeof weather !== 'object') {
    return null;
  }
  return {
    source: typeof weather.source === 'string' ? weather.source : 'weather_spatial_fields',
    tick: Math.max(0, Math.floor(Number(weather.tick) || 0)),
    weatherPhase: Math.max(0, Math.floor(Number(weather.weatherPhase) || 0)),
    dominant: typeof weather.dominant === 'string' ? weather.dominant : 'clear',
    stormCells: Math.max(0, Math.floor(Number(weather.stormCells) || 0)),
    rainCells: Math.max(0, Math.floor(Number(weather.rainCells) || 0)),
    stormAnchor: weather.stormAnchor && typeof weather.stormAnchor === 'object' ? { ...weather.stormAnchor } : null,
    fields: weather.fields && typeof weather.fields === 'object' ? { ...weather.fields } : {}
  };
}

function deriveRuntimeBehaviourFields(map, game, sourceFields) {
  const cached = game?._runtimeCache?.behaviourFields;
  if (cached?.fields && !shouldRunScheduledSystem(game, 'aiAppraisal')) {
    return cached.fields;
  }
  const fields = deriveCadencedBehaviourFields(map, game, sourceFields);
  runAIBehaviourAppraisal(game, map, fields);
  completeScheduledSystem(game, 'aiAppraisal');
  const latestIntentTick = game.ai?.lastIssuedIntent?.issuedAtTick;
  if (latestIntentTick !== (game.tick ?? 0)) {
    clearRuntimeDirty(game, ['ai']);
  }
  return fields;
}


function runAIBehaviourAppraisal(game, map, behaviourFields = game.fields ?? {}) {
  const commanderDeadByFaction = new Map(['player', 'enemy'].map((factionId) => [
    factionId,
    !(game.leaders ?? []).some((leader) => leader.factionId === factionId && leader.health?.state !== 'dead')
  ]));
  const appraise = (entity) => {
    const normalised = entity.type === ENTITY_TYPES.leader ? normaliseLeader(entity) : normaliseSquad(entity);
    const tile = positionToTile(map, normalised.position ?? normalised.tile);
    const sample = sampleBehaviourFields(behaviourFields, tile.x, tile.y);
    const commander = findCommanderForFaction(game, normalised.factionId);
    return {
      ...normalised,
      objectiveProjection: entity.objectiveProjection ?? normalised.objectiveProjection ?? null,
      ai: appraiseEntityBehaviour({ ...normalised, ai: entity.ai ?? normalised.ai }, sample, {
        tick: game.tick ?? 0,
        commanderDead: commanderDeadByFaction.get(normalised.factionId) ?? false,
        nearCommander: commander ? tileDistance(normalised.position ?? normalised.tile, commander.position ?? commander.tile) <= 4.5 : false,
        deathPressure: calculateNearbyDeathPressure(game, normalised.position ?? normalised.tile),
        isolation: calculateIsolationPressure(game, normalised)
      })
    };
  };
  game.leaders = (game.leaders ?? []).map(appraise);
  game.squads = (game.squads ?? []).map(appraise);
}

function calculateNearbyDeathPressure(game, position) {
  const tick = game.tick ?? 0;
  return Math.max(0, ...(game.deathEvents ?? []).slice(-12).map((event) => {
    const eventPosition = event.position ?? event.tile;
    if (!eventPosition) return 0;
    const age = Math.max(0, tick - (event.tick ?? tick));
    const distance = tileDistance(position, eventPosition);
    return Math.max(0, 1 - distance / 5.5) * Math.max(0, 1 - age / 24);
  }));
}

function calculateIsolationPressure(game, entity) {
  const allies = [...(game.leaders ?? []), ...(game.squads ?? [])]
    .filter((candidate) => candidate.id !== entity.id && candidate.factionId === entity.factionId && candidate.health?.state !== 'dead');
  if (allies.length === 0) return 0.62;
  const nearest = allies.reduce((best, ally) => Math.min(best, tileDistance(entity.position ?? entity.tile, ally.position ?? ally.tile)), Infinity);
  return clamp01((nearest - 3) / 8);
}

export function evaluateLeaderCommand(map, leader, outpost) {
  const terrainTile = getLeaderTile(leader);
  const terrain = getTerrain(getTile(map, terrainTile.x, terrainTile.y));
  const terrainField = getTerrainField(map, terrainTile.x, terrainTile.y);
  const terrainLogistics = clamp01((terrainField.passability * 0.42) + (terrainField.logistics * 0.4) + (terrainField.height * 0.18));
  const defensibility = clamp01((terrainField.cover * 0.5) + (terrainField.height * 0.5));
  const outpostSupport = outpost ? clamp01(0.74 + terrainField.logistics * 0.18 + defensibility * 0.08) : 0.15;
  const qualities = leader.qualities;

  const graph = [
    {
      id: 'presence',
      label: 'Presence',
      value: qualities.presence,
      weight: 0.2,
      sources: ['leader.presence']
    },
    {
      id: 'morale-cohesion',
      label: 'Morale Cohesion',
      value: (qualities.presence + qualities.discipline) / 2,
      weight: 0.2,
      sources: ['leader.presence', 'leader.discipline']
    },
    {
      id: 'terrain-logistics',
      label: 'Terrain Logistics',
      value: terrainLogistics,
      weight: 0.18,
      sources: ['tile.passability', 'tile.logistics', 'tile.height']
    },
    {
      id: 'defensible-ground',
      label: 'Defensible Ground',
      value: defensibility,
      weight: 0.1,
      sources: ['tile.cover', 'tile.height']
    },
    ...(outpost ? [{
      id: 'outpost-anchor',
      label: 'Outpost Anchor',
      value: outpostSupport,
      weight: 0.14,
      sources: ['outpost.buildable', 'outpost.supply']
    }] : []),
    {
      id: 'initiative-clarity',
      label: 'Initiative Clarity',
      value: (qualities.initiative + qualities.judgement) / 2,
      weight: 0.14,
      sources: ['leader.initiative', 'leader.judgement']
    },
    {
      id: 'logistical-discipline',
      label: 'Logistical Discipline',
      value: (qualities.logistics + qualities.discipline) / 2,
      weight: 0.08,
      sources: ['leader.logistics', 'leader.discipline']
    }
  ];

  const weightTotal = graph.reduce((sum, node) => sum + node.weight, 0);
  const weighted = graph.reduce((sum, node) => sum + node.value * node.weight, 0) / weightTotal;
  const score = Math.round(clamp01(weighted) * 100);
  const influenceRadius = Math.max(5, Math.round(4 + score / 12 + outpostSupport * 2));

  return {
    score,
    influenceRadius,
    terrain: terrain.id,
    graph: graph.map((node) => ({
      ...node,
      value: round3(node.value),
      contribution: round3((node.value * node.weight) / weightTotal)
    }))
  };
}

export function deriveCommandInfluenceFields(map, game) {
  const fields = {
    playerCommand: createField(map.width, map.height, 0),
    enemyCommand: createField(map.width, map.height, 0),
    playerCommandRaw: createField(map.width, map.height, 0),
    enemyCommandRaw: createField(map.width, map.height, 0),
    control: createField(map.width, map.height, 0.5),
    frontPressure: createField(map.width, map.height, 0),
    objectivePressure: createField(map.width, map.height, 0)
  };

  const influenceEntitiesByFaction = Object.fromEntries(Object.keys(FACTIONS).map((factionId) => [factionId, []]));
  game.leaders.forEach((leader) => influenceEntitiesByFaction[leader.factionId]?.push(leader));
  (game.squads ?? []).forEach((squad) => influenceEntitiesByFaction[squad.factionId]?.push(squad));

  const terrainRuntime = ensureTerrainRuntimeFields(map, game);
  paintCommandInfluenceField(map, fields.playerCommandRaw, influenceEntitiesByFaction.player, terrainRuntime.commandCarry);
  paintCommandInfluenceField(map, fields.enemyCommandRaw, influenceEntitiesByFaction.enemy, terrainRuntime.commandCarry);
  const playerObjectivePressure = createField(map.width, map.height, 0);
  const enemyObjectivePressure = createField(map.width, map.height, 0);
  paintObjectivePressureField(map, playerObjectivePressure, influenceEntitiesByFaction.player);
  paintObjectivePressureField(map, enemyObjectivePressure, influenceEntitiesByFaction.enemy);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const terrainField = getTerrainField(map, x, y);
      const rawPlayer = fields.playerCommandRaw.values[y][x];
      const rawEnemy = fields.enemyCommandRaw.values[y][x];
      const totalInfluence = rawPlayer + rawEnemy;
      const balance = totalInfluence > 0.001 ? clamp01(rawPlayer / totalInfluence) : 0.5;
      const parity = totalInfluence > 0.001 ? clamp01(1 - Math.abs(rawPlayer - rawEnemy) / totalInfluence) : 0;
      const contact = clamp01(Math.sqrt(Math.min(rawPlayer, rawEnemy)) * 1.45);
      const terrainResistance = 0.85 + terrainField.height * 0.25 + terrainField.cover * 0.16;
      const resistance = clamp01(contact * (0.35 + parity * 0.9) * terrainResistance);
      const playerResolved = resolveResistedInfluence(rawPlayer, balance, resistance);
      const enemyResolved = resolveResistedInfluence(rawEnemy, 1 - balance, resistance);

      fields.playerCommandRaw.values[y][x] = round3(rawPlayer);
      fields.enemyCommandRaw.values[y][x] = round3(rawEnemy);
      fields.playerCommand.values[y][x] = round3(playerResolved);
      fields.enemyCommand.values[y][x] = round3(enemyResolved);
      fields.control.values[y][x] = round3(balance);
      fields.frontPressure.values[y][x] = round3(resistance);
      const objectivePlayer = playerObjectivePressure.values[y][x];
      const objectiveEnemy = enemyObjectivePressure.values[y][x];
      fields.objectivePressure.values[y][x] = round3(Math.max(objectivePlayer, objectiveEnemy, Math.min(objectivePlayer, objectiveEnemy) * 1.2));
    }
  }

  return fields;
}

function deriveCadencedCommandInfluenceFields(map, game) {
  const mapSignature = entityPathMapSignature(map);
  const signature = createCommandFieldStaticSignature(game);
  const cached = game?._runtimeCache?.commandFields;
  if (
    cached?.mapSignature === mapSignature &&
    cached.signature === signature &&
    cached.fields &&
    Number.isFinite(cached.tick) &&
    ((game?.tick ?? 0) - cached.tick) < COMMAND_FIELD_RECOMPUTE_INTERVAL_TICKS
  ) {
    return cached.fields;
  }

  const fields = deriveCommandInfluenceFields(map, game);
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    commandFields: {
      mapSignature,
      signature,
      tick: game.tick ?? 0,
      fields
    }
  };
  return fields;
}

export function deriveResourceFields(map) {
  const fields = {
    foodResource: createField(map.width, map.height, 0),
    woodResource: createField(map.width, map.height, 0)
  };

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const terrainId = getTile(map, x, y);
      const terrainField = getTerrainField(map, x, y);
      const slopePenalty = getElevationSlope(map, x, y) * 0.24;
      const waterPenalty = terrainField.water * 0.78;
      const foodBase = terrainId === 'forest'
        ? 0.92
        : terrainId === 'land'
          ? 0.56
          : terrainId === 'river'
            ? 0.18
            : terrainId === 'mountains'
              ? 0.14
              : 0;
      const woodBase = terrainId === 'forest' ? 1 : terrainId === 'land' ? 0.08 : 0;
      fields.foodResource.values[y][x] = round3(clamp01(foodBase + terrainField.cover * 0.12 - waterPenalty - slopePenalty));
      fields.woodResource.values[y][x] = round3(clamp01(woodBase + terrainField.cover * 0.04 - waterPenalty));
    }
  }

  return fields;
}

function deriveCachedResourceFields(map, game) {
  if (game) {
    ensureRuntimeCoordination(game, map);
  }
  const mapVersion = Math.max(0, Number(map?.revision) || 0, Number(game?.versions?.map) || 0);
  const mapSignature = entityPathMapSignature(map);
  const cached = game?._runtimeCache?.resourceFields;
  if (
    cached?.mapVersion === mapVersion &&
    cached.mapSignature === mapSignature &&
    cached.fields?.foodResource &&
    cached.fields?.woodResource
  ) {
    return cached.fields;
  }

  const fields = deriveResourceFields(map);
  if (game) {
    game._runtimeCache = {
      ...(game._runtimeCache ?? {}),
      resourceFields: {
        mapVersion,
        mapSignature,
        fields
      }
    };
    clearRuntimeDirty(game, ['fields']);
  }
  return fields;
}

function sampleResourceFieldAround(field, position, radius = 1) {
  if (!field?.values) {
    return 0;
  }
  const origin = roundPosition(position);
  const maxRadius = Math.max(0, Number(radius) || 0);
  const minX = clamp(0, field.width - 1, Math.floor(origin.x - maxRadius));
  const maxX = clamp(0, field.width - 1, Math.ceil(origin.x + maxRadius));
  const minY = clamp(0, field.height - 1, Math.floor(origin.y - maxRadius));
  const maxY = clamp(0, field.height - 1, Math.ceil(origin.y + maxRadius));
  let weighted = 0;
  let weightTotal = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = tileDistance(origin, { x, y });
      if (distance > maxRadius) {
        continue;
      }
      const weight = Math.max(0.1, 1 - distance / Math.max(1, maxRadius));
      weighted += (field.values[y][x] ?? 0) * weight;
      weightTotal += weight;
    }
  }
  return weightTotal > 0 ? round3(weighted / weightTotal) : 0;
}

function createCommandFieldStaticSignature(game) {
  return [
    game?.leaders?.map((leader) => [
      leader.id,
      leader.factionId,
      leader.behavior?.stance ?? '',
      commandFieldTargetSignature(leader),
      round3(leader.commandScore ?? 0),
      round3(leader.influenceRadius ?? 0)
    ].join(',')).join('|') ?? '',
    game?.squads?.map((squad) => [
      squad.id,
      squad.factionId,
      squad.behavior?.stance ?? '',
      commandFieldTargetSignature(squad),
      squad.occupancy?.state ?? 'field',
      squad.occupancy?.structureId ?? '',
      round3(getEntityInfluenceScore(squad)),
      round3(squad.influenceRadius ?? 0)
    ].join(',')).join('|') ?? '',
    game?.outposts?.map((outpost) => [
      outpost.id,
      outpost.factionId ?? '',
      outpost.ownerFactionId ?? ''
    ].join(',')).join('|') ?? ''
  ].join('/');
}

function commandFieldTargetSignature(entity) {
  const target = entity?.movementOrder?.target ?? entity?.movement?.target;
  return target ? `${round3(target.x)},${round3(target.y)}` : '';
}

function paintCommandInfluenceField(map, field, entities = [], commandCarry = null) {
  entities.forEach((entity) => {
    const origin = getEntityPosition(entity);
    const radius = Math.max(1, entity.influenceRadius ?? 1);
    const scoreFactor = getEntityInfluenceScore(entity) / 100;
    if (scoreFactor <= 0) {
      return;
    }
    const minX = clamp(0, map.width - 1, Math.floor(origin.x - radius));
    const maxX = clamp(0, map.width - 1, Math.ceil(origin.x + radius));
    const minY = clamp(0, map.height - 1, Math.floor(origin.y - radius));
    const maxY = clamp(0, map.height - 1, Math.ceil(origin.y + radius));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = tileDistance({ x, y }, origin);
        if (distance > radius) {
          continue;
        }
        const terrainCarry = commandCarry?.[y]?.[x] ?? 0;
        const falloff = clamp01(1 - distance / radius);
        const value = falloff * scoreFactor * (0.35 + terrainCarry * 0.65);
        if (value > field.values[y][x]) {
          field.values[y][x] = value;
        }
      }
    }
  });
}

function paintObjectivePressureField(map, field, entities = []) {
  entities.forEach((entity) => {
    const objective = findPathPressureObjective(entity);
    if (!objective || objective.value <= 0) {
      return;
    }
    const start = getEntityPosition(entity);
    const end = objective.tile;
    const minX = clamp(0, map.width - 1, Math.floor(Math.min(start.x, end.x) - OBJECTIVE_PRESSURE_CORRIDOR_RADIUS));
    const maxX = clamp(0, map.width - 1, Math.ceil(Math.max(start.x, end.x) + OBJECTIVE_PRESSURE_CORRIDOR_RADIUS));
    const minY = clamp(0, map.height - 1, Math.floor(Math.min(start.y, end.y) - OBJECTIVE_PRESSURE_CORRIDOR_RADIUS));
    const maxY = clamp(0, map.height - 1, Math.ceil(Math.max(start.y, end.y) + OBJECTIVE_PRESSURE_CORRIDOR_RADIUS));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const value = entityPathPressureAtTile({ x, y }, entity);
        if (value > field.values[y][x]) {
          field.values[y][x] = value;
        }
      }
    }
  });
}

export function deriveLineOfSightFields(map, game) {
  const signature = createLineOfSightSignature(map, game);
  const mapSignature = entityPathMapSignature(map);
  const cached = game?._runtimeCache?.lineOfSight;
  if (cached?.signature === signature && cached.fields?.playerLoS && cached.fields?.enemyLoS) {
    return cached.fields;
  }
  if (
    cached?.mapSignature === mapSignature &&
    cached.fields?.playerLoS &&
    cached.fields?.enemyLoS &&
    Number.isFinite(cached.tick) &&
    (game.tick - cached.tick) < LINE_OF_SIGHT_RECOMPUTE_INTERVAL_TICKS
  ) {
    return cached.fields;
  }

  const fields = {
    playerLoS: createField(map.width, map.height, 0),
    enemyLoS: createField(map.width, map.height, 0)
  };
  const terrainRuntime = ensureTerrainRuntimeFields(map, game);
  const playerEntities = [...(game.leaders ?? []), ...(game.squads ?? [])].filter((entity) => entity.factionId === 'player');
  const enemyEntities = [...(game.leaders ?? []), ...(game.squads ?? [])].filter((entity) => entity.factionId === 'enemy');

  paintLineOfSightField(map, fields.playerLoS, playerEntities, terrainRuntime.losClarity);
  paintLineOfSightField(map, fields.enemyLoS, enemyEntities, terrainRuntime.losClarity);
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    lineOfSight: {
      signature,
      mapSignature,
      tick: game.tick,
      fields
    }
  };

  return fields;
}

export function deriveInfluenceFrontline(map, fields, game = null) {
  const isoValue = 0.5;
  const segments = [];

  for (let y = 0; y < map.height - 1; y += 1) {
    for (let x = 0; x < map.width - 1; x += 1) {
      const corners = [
        createFrontlineCorner(fields, x, y),
        createFrontlineCorner(fields, x + 1, y),
        createFrontlineCorner(fields, x + 1, y + 1),
        createFrontlineCorner(fields, x, y + 1)
      ];
      const intersections = collectIsoIntersections(corners, isoValue);
      const pressure = corners.reduce((sum, corner) => sum + corner.pressure, 0) / corners.length;
      const rawMass = corners.reduce((sum, corner) => sum + corner.rawMass, 0) / corners.length;
      const linePressure = Math.max(pressure, rawMass * 0.35);
      if (intersections.length < 2 || rawMass < 0.035) {
        continue;
      }
      for (let index = 0; index < intersections.length - 1; index += 2) {
        segments.push({
          start: intersections[index],
          end: intersections[index + 1],
          pressure: round3(linePressure)
        });
      }
    }
  }

  const totalPressure = segments.reduce((sum, segment) => sum + segment.pressure, 0);
  const averagePressure = segments.length > 0 ? totalPressure / segments.length : 0;
  if ((segments.length < 8 || averagePressure < 0.06) && game?.leaders?.length) {
    segments.push(...deriveLeaderBisectorFrontline(map, game));
  }

  const resolvedTotalPressure = segments.reduce((sum, segment) => sum + segment.pressure, 0);
  return {
    isoValue,
    segmentCount: segments.length,
    averagePressure: segments.length > 0 ? round3(resolvedTotalPressure / segments.length) : 0,
    segments
  };
}

function deriveCadencedInfluenceFrontline(map, fields, game = null) {
  const mapSignature = entityPathMapSignature(map);
  const signature = createFrontlineCadenceSignature(game);
  const cached = game?._runtimeCache?.frontline;
  if (
    cached?.mapSignature === mapSignature &&
    (cached.signature === signature || cached.tick !== (game?.tick ?? 0)) &&
    cached.frontline &&
    Number.isFinite(cached.tick) &&
    ((game?.tick ?? 0) - cached.tick) < FRONTLINE_RECOMPUTE_INTERVAL_TICKS
  ) {
    return cached.frontline;
  }

  const frontline = deriveInfluenceFrontline(map, fields, game);
  if (game) {
    game._runtimeCache = {
      ...(game._runtimeCache ?? {}),
      frontline: {
        mapSignature,
        signature,
        tick: game.tick ?? 0,
        frontline
      }
    };
  }
  return frontline;
}

function createFrontlineCadenceSignature(game) {
  return [
    game?.leaders?.map((leader) => `${leader.id}:${leader.factionId}:${round3(getEntityPosition(leader).x)}:${round3(getEntityPosition(leader).y)}:${leader.behavior?.stance ?? ''}:${leader.commandScore ?? 0}`).join('|') ?? '',
    game?.squads?.map((squad) => `${squad.id}:${squad.factionId}:${round3(getEntityPosition(squad).x)}:${round3(getEntityPosition(squad).y)}:${squad.behavior?.stance ?? ''}:${squad.movement?.status ?? ''}:${squad.occupancy?.state ?? 'field'}:${squad.occupancy?.structureId ?? ''}`).join('|') ?? '',
    game?.outposts?.map((outpost) => `${outpost.id}:${outpost.status ?? ''}:${round3(outpost.control?.player ?? 0.5)}`).join('|') ?? ''
  ].join('/');
}

export function getGameFieldValue(game, fieldId, x, y) {
  const field = game?.fields?.[fieldId];
  if (!field || x < 0 || y < 0 || x >= field.width || y >= field.height) {
    return null;
  }
  return field.values[y][x];
}

export function selectGameEntityAtTile(game, tile) {
  if (!tile) {
    game.selectedEntityId = null;
    return null;
  }
  const entity = inspectGameEntityAtTile(game, tile);
  game.selectedEntityId = entity?.id ?? null;
  return entity;
}

export function selectPlayerControllableEntityAtTile(game, tile) {
  const selectedBefore = game.selectedEntityId ?? null;
  const inspected = inspectGameEntityAtTile(game, tile);
  if (!inspected) {
    game.selectedEntityId = null;
    return { entity: null, rejected: false, reason: 'empty-tile', selectedBefore };
  }
  if (!isPlayerCommandableEntity(inspected)) {
    return {
      entity: inspected,
      rejected: true,
      reason: 'not-player-controlled',
      message: inspected.factionId === 'enemy'
        ? 'Enemy units cannot be directly commanded.'
        : 'This entity cannot be directly commanded.',
      selectedBefore
    };
  }
  game.selectedEntityId = inspected.id;
  return { entity: inspected, rejected: false, reason: null, selectedBefore };
}

export function getSelectedGameEntity(game) {
  return getGameEntities(game).find((entity) => entity.id === game.selectedEntityId) ?? null;
}

export function createGameStateSnapshot(game, map, { recompute = true } = {}) {
  const recomputed = recompute
    ? recomputeGameState(structuredCloneWithoutFields(game), map)
    : normaliseGameStateForSnapshot(game, map);
  return {
    contract: GAME_STATE_CONTRACT_ID,
    version: GAME_STATE_VERSION,
    savedAt: new Date().toISOString(),
    mapRef: createMapRef(map),
    tick: recomputed.tick,
    time: recomputed.time,
    phase: recomputed.phase,
    mode: recomputed.mode,
    selectedEntityId: recomputed.selectedEntityId,
    economy: recomputed.economy,
    progression: normaliseProgressionState(recomputed.progression),
    enemyAI: recomputed.enemyAI,
    impactEvents: normaliseImpactEvents(recomputed.impactEvents),
    soundEvents: normaliseSoundEvents(recomputed.soundEvents, recomputed.tick),
    deathEvents: normaliseDeathEvents(recomputed.deathEvents),
    corpses: normaliseCorpses(recomputed.corpses),
    battlefieldTrace: normaliseBattlefieldTrace(recomputed.battlefieldTrace),
    outposts: recomputed.outposts.map(stripRuntimeOutpost),
    structures: recomputed.structures.map(stripRuntimeStructure),
    constructionJobs: recomputed.constructionJobs.map(stripRuntimeConstructionJob),
    leaders: recomputed.leaders.map(stripRuntimeLeader),
    squads: recomputed.squads.map(stripRuntimeSquad),
    builders: recomputed.builders.map(stripRuntimeBuilder),
    resourceWorkers: recomputed.resourceWorkers.map(stripRuntimeResourceWorker),
    transports: recomputed.transports.map(stripRuntimeSupplyTransport)
  };
}

export function serializeGameState(game, map, options = {}) {
  return JSON.stringify(createGameStateSnapshot(game, map, options), null, 2);
}

export function deserializeGameState(json, map) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (!parsed || parsed.contract !== GAME_STATE_CONTRACT_ID) {
    throw new Error('Game import failed: unsupported or missing game-state contract');
  }
  if (parsed.version !== GAME_STATE_VERSION) {
    throw new Error(`Game import failed: unsupported game-state version ${parsed.version}`);
  }
  const next = {
    contract: GAME_STATE_CONTRACT_ID,
    version: GAME_STATE_VERSION,
    mapRef: createMapRef(map),
    tick: Number.isInteger(parsed.tick) ? parsed.tick : 0,
    time: normaliseGameTime(parsed.time, Number.isInteger(parsed.tick) ? parsed.tick : 0),
    phase: typeof parsed.phase === 'string' ? parsed.phase : GAME_PHASES.openingCommandField,
    mode: typeof parsed.mode === 'string' ? parsed.mode : GAME_MODES.leaderDuelSeed,
    selectedEntityId: typeof parsed.selectedEntityId === 'string' ? parsed.selectedEntityId : null,
    factions: FACTIONS,
    economy: normaliseEconomy(parsed.economy, ['player', 'enemy']),
    progression: normaliseProgressionState(parsed.progression),
    enemyAI: normaliseEnemyAIState(parsed.enemyAI),
    collisionStats: summarizeCollisionAuthority(parsed),
    combatStats: summarizeCombat(parsed),
    projectiles: [],
    soundEvents: normaliseSoundEvents(parsed.soundEvents, Number.isInteger(parsed.tick) ? parsed.tick : 0),
    impactEvents: normaliseImpactEvents(parsed.impactEvents),
    deathEvents: normaliseDeathEvents(parsed.deathEvents),
    corpses: normaliseCorpses(parsed.corpses),
    battlefieldTrace: normaliseBattlefieldTrace(parsed.battlefieldTrace),
    outposts: Array.isArray(parsed.outposts) ? parsed.outposts.map(normaliseOutpost) : [],
    structures: Array.isArray(parsed.structures) ? parsed.structures.map(normaliseStructure) : [],
    constructionJobs: Array.isArray(parsed.constructionJobs) ? parsed.constructionJobs.map(normaliseConstructionJob) : [],
    leaders: Array.isArray(parsed.leaders) ? parsed.leaders.map(normaliseLeader) : [],
    squads: Array.isArray(parsed.squads) ? parsed.squads.map(normaliseSquad) : [],
    builders: Array.isArray(parsed.builders) ? parsed.builders.map(normaliseBuilder) : [],
    resourceWorkers: Array.isArray(parsed.resourceWorkers) ? parsed.resourceWorkers.map(normaliseResourceWorker) : [],
    transports: Array.isArray(parsed.transports) ? parsed.transports.map(normaliseSupplyTransport) : [],
    fields: {}
  };
  if ((!isNomadicSurvivalScene(map) && next.outposts.length === 0) || next.leaders.length === 0) {
    throw new Error('Game import failed: game state must contain its required opening entities');
  }
  return recomputeGameState(next, map);
}

export function summarizeGame(game) {
  const runtime = summarizeRuntimeCoordination(game);
  return {
    contract: game.contract,
    version: game.version,
    mapRef: game.mapRef,
    tick: game.tick,
    time: game.time,
    phase: game.phase,
    mode: game.mode,
    selectedEntityId: game.selectedEntityId,
    entityCount: getGameEntities(game).length,
    control: {
      player: FACTION_CONTROL.player,
      enemy: FACTION_CONTROL.ai,
      neutral: FACTION_CONTROL.neutral
    },
    runtime: {
      ...runtime,
      runtimeProfile: game.runtimeProfile ?? 'legacy',
      dormancy: game.runtimeDormancy ?? { enabled: false, reason: null, dormantSystems: [] }
    },
    enemyAI: game.enemyAI,
    structureTopology: summarizeStructureTopology(game),
    construction: summarizeConstruction(game),
    builderCapacity: game.builderCapacity ?? summarizeBuilderCapacity(game),
    resourceGathering: summarizeResourceGathering(game),
    supplyLines: summarizeSupplyLines(game),
    occupancy: summarizeStructureOccupancy(game),
    collision: summarizeCollisionAuthority(game),
    combat: summarizeCombat(game),
    sound: summarizeSoundEvents(game),
    corpses: summarizeCorpses(game),
    battlefieldTrace: summarizeBattlefieldTrace(game),
    economy: summarizeEconomy(game.economy),
    frontline: {
      segmentCount: game.frontline?.segmentCount ?? 0,
      averagePressure: game.frontline?.averagePressure ?? 0
    },
    lineOfSight: {
      playerKnownTiles: countFieldAbove(game.fields?.playerLoS, 0.05),
      enemyKnownTiles: countFieldAbove(game.fields?.enemyLoS, 0.05)
    },
    leaders: game.leaders.map((leader) => ({
      id: leader.id,
      type: leader.type,
      factionId: leader.factionId,
      name: leader.name,
      tile: leader.tile,
      position: leader.position,
      collision: leader.collision,
      movement: leader.movement,
      movementOrder: leader.movementOrder,
      movementPath: summarizeMovementPath(leader.movementPath),
      health: leader.health,
      combat: leader.combat,
      commandScore: leader.commandScore,
      influenceRadius: leader.influenceRadius,
      hearingRadius: leader.hearingRadius,
      stealth: leader.stealth,
      behavior: leader.behavior,
      ai: normaliseAIEntityState(leader.ai),
      objectiveProjection: leader.objectiveProjection,
      commandGraph: leader.command.graph
    })),
    squads: (game.squads ?? []).map((squad) => ({
      id: squad.id,
      type: squad.type,
      unitId: squad.unitId,
      factionId: squad.factionId,
      name: squad.name,
      tile: squad.tile,
      position: squad.position,
      members: squad.members,
      attributes: squad.attributes,
      influenceRadius: squad.influenceRadius,
      sightRadius: squad.sightRadius,
      hearingRadius: squad.hearingRadius,
      stealth: squad.stealth,
      collision: squad.collision,
      movement: squad.movement,
      movementOrder: squad.movementOrder,
      movementPath: summarizeMovementPath(squad.movementPath),
      health: squad.health,
      combat: squad.combat,
      behavior: squad.behavior,
      ai: normaliseAIEntityState(squad.ai),
      supply: squad.supply,
      occupancy: squad.occupancy
    })),
    projectiles: (game.projectiles ?? []).map((projectile) => ({
      id: projectile.id,
      weaponId: projectile.weaponId,
      factionId: projectile.factionId,
      sourceId: projectile.sourceId,
      sourceIntentId: projectile.sourceIntentId,
      sourceType: projectile.sourceType,
      sourceStructureId: projectile.sourceStructureId,
      targetId: projectile.targetId,
      targetType: projectile.targetType,
      origin: projectile.origin,
      previousPosition: projectile.previousPosition,
      position: projectile.position,
      targetPosition: projectile.targetPosition,
      damage: projectile.damage,
      accuracy: projectile.accuracy,
      speedTilesPerTick: projectile.speedTilesPerTick,
      ageTicks: projectile.ageTicks,
      maxAgeTicks: projectile.maxAgeTicks,
      maxTravelDistance: projectile.maxTravelDistance,
      travelledDistance: projectile.travelledDistance,
      state: projectile.state,
      impactTicksRemaining: projectile.impactTicksRemaining,
      impactApplied: projectile.impactApplied,
      impactOutcome: projectile.impactOutcome,
      impactTargetId: projectile.impactTargetId,
      impactTargetType: projectile.impactTargetType
    })),
    soundEvents: normaliseSoundEvents(game.soundEvents, game.tick),
    deathEvents: normaliseDeathEvents(game.deathEvents),
    impactEvents: normaliseImpactEvents(game.impactEvents),
    builders: (game.builders ?? []).map((builder) => ({
      id: builder.id,
      type: builder.type,
      unitId: builder.unitId,
      factionId: builder.factionId,
      name: builder.name,
      tile: builder.tile,
      position: builder.position,
      baseStructureId: builder.baseStructureId,
      jobId: builder.jobId,
      state: builder.state,
      workPoint: builder.workPoint,
      workPerTick: builder.workPerTick,
      blockedTicks: builder.blockedTicks,
      collision: builder.collision,
      movement: builder.movement,
      movementPath: summarizeMovementPath(builder.movementPath)
    })),
    resourceWorkers: (game.resourceWorkers ?? []).map((worker) => ({
      id: worker.id,
      type: worker.type,
      factionId: worker.factionId,
      name: worker.name,
      tile: worker.tile,
      position: worker.position,
      homeStructureId: worker.homeStructureId,
      resourceId: worker.resourceId,
      state: worker.state,
      targetTile: worker.targetTile,
      carriedAmount: worker.carriedAmount,
      lastDepositAmount: worker.lastDepositAmount,
      movement: worker.movement,
      movementPath: summarizeMovementPath(worker.movementPath)
    })),
    transports: (game.transports ?? []).map((transport) => ({
      id: transport.id,
      type: transport.type,
      factionId: transport.factionId,
      name: transport.name,
      tile: transport.tile,
      position: transport.position,
      homeStructureId: transport.homeStructureId,
      state: transport.state,
      targetKind: transport.targetKind,
      targetId: transport.targetId,
      targetPosition: transport.targetPosition,
      resourceId: transport.resourceId,
      carriedAmount: transport.carriedAmount,
      lastDeliveryAmount: transport.lastDeliveryAmount,
      movement: transport.movement,
      movementPath: summarizeMovementPath(transport.movementPath)
    })),
    constructionJobs: (game.constructionJobs ?? []).map((job) => ({
      id: job.id,
      type: job.type,
      structureId: job.structureId,
      factionId: job.factionId,
      position: job.position,
      requiredWork: job.requiredWork,
      progress: job.progress,
      assignedBuilderIds: job.assignedBuilderIds,
      deliveredResources: job.deliveredResources,
      resourceBlocker: job.resourceBlocker,
      maxAssignedBuilders: job.maxAssignedBuilders,
      state: job.state,
      sourceBaseId: job.sourceBaseId,
      createdAtTick: job.createdAtTick,
      updatedAtTick: job.updatedAtTick
    })),
    outposts: game.outposts.map((outpost) => ({
      id: outpost.id,
      type: outpost.type,
      factionId: outpost.factionId,
      name: outpost.name,
      tile: outpost.tile,
      buildableBy: outpost.buildableBy,
      spawnLeaderId: outpost.spawnLeaderId,
      supply: outpost.supply,
      contestable: outpost.contestable,
      ownerFactionId: outpost.ownerFactionId,
      control: outpost.control,
      projectedPressure: outpost.projectedPressure,
      status: outpost.status
    })),
    structures: (game.structures ?? []).map((structure) => ({
      id: structure.id,
      entityType: structure.entityType,
      type: structure.type,
      factionId: structure.factionId,
      name: structure.name,
      tile: structure.tile,
      position: structure.position,
      construction: structure.construction,
      footprint: structure.footprint,
      occupancy: structure.occupancy,
      workforce: structure.workforce,
      integrity: structure.integrity
    }))
  };
}

function createLeader({ id, factionId, name, tile, controller = factionId === 'player' ? 'player' : 'ai', stance = 'probe', scenarioRole = null, survivorCount = null, combatEnabled = true }) {
  return normaliseLeader({
    id,
    type: ENTITY_TYPES.leader,
    factionId,
    name,
    tile: { ...tile },
    position: tileToPosition(tile),
    qualities: { ...LEADER_TEMPLATE },
    command: null,
    commandScore: 0,
    influenceRadius: 0,
    scenarioRole,
    survivorCount,
    behavior: normaliseLeaderBehavior({ controller, stance }, factionId),
    combat: { enabled: combatEnabled }
  });
}

function createEnemyAIState(overrides = {}) {
  return normaliseEnemyAIState({
    state: ENEMY_AI_STATES.boot,
    previousState: null,
    attackThreshold: ENEMY_AI_DEFAULTS.attackThreshold,
    buildCooldownUntil: 0,
    lastAttackOrderTick: -ENEMY_AI_DEFAULTS.attackRetargetTicks,
    lastAttackTargetId: null,
    attackGroupIds: [],
    lastAction: 'Enemy director booting',
    updatedAtTick: 0,
    ...overrides
  });
}

function inspectGameEntityAtTile(game, tile) {
  if (!tile) {
    return null;
  }
  const selectableUnit = [
    ...game.leaders.map((entity) => ({ entity, distance: tileDistance(getEntityPosition(entity), tile), radius: 1.15 })),
    ...(game.squads ?? [])
      .filter((entity) => !isSquadOccupied(entity))
      .map((entity) => ({ entity, distance: tileDistance(getEntityPosition(entity), tile), radius: 1.05 })),
    ...(game.builders ?? []).map((entity) => ({ entity, distance: tileDistance(getEntityPosition(entity), tile), radius: 0.95 })),
    ...(game.resourceWorkers ?? []).map((entity) => ({ entity, distance: tileDistance(getEntityPosition(entity), tile), radius: 0.85 }))
  ]
    .filter((entry) => entry.distance <= entry.radius)
    .sort((a, b) => a.distance - b.distance)[0]?.entity;

  if (selectableUnit) {
    return selectableUnit;
  }

  const outpost = game.outposts.find((candidate) => tileDistance(candidate.tile, tile) <= 1.2);
  if (outpost) {
    return outpost;
  }

  return (game.structures ?? [])
    .filter((candidate) => tileDistance(candidate.position ?? candidate.tile, tile) <= getStructureSelectionRadius(candidate))
    .sort((a, b) => tileDistance(a.position ?? a.tile, tile) - tileDistance(b.position ?? b.tile, tile))[0] ?? null;
}

function normaliseEnemyAIState(enemyAI = {}) {
  const state = Object.values(ENEMY_AI_STATES).includes(enemyAI.state) ? enemyAI.state : ENEMY_AI_STATES.boot;
  return {
    state,
    dormant: Boolean(enemyAI.dormant),
    previousState: Object.values(ENEMY_AI_STATES).includes(enemyAI.previousState) ? enemyAI.previousState : null,
    attackThreshold: Math.max(1, Math.floor(Number(enemyAI.attackThreshold) || ENEMY_AI_DEFAULTS.attackThreshold)),
    buildCooldownUntil: Number.isInteger(enemyAI.buildCooldownUntil) ? Math.max(0, enemyAI.buildCooldownUntil) : 0,
    lastAttackOrderTick: Number.isInteger(enemyAI.lastAttackOrderTick) ? enemyAI.lastAttackOrderTick : -ENEMY_AI_DEFAULTS.attackRetargetTicks,
    lastAttackTargetId: typeof enemyAI.lastAttackTargetId === 'string' ? enemyAI.lastAttackTargetId : null,
    attackGroupIds: Array.isArray(enemyAI.attackGroupIds) ? enemyAI.attackGroupIds.filter((id) => typeof id === 'string') : [],
    lastAction: typeof enemyAI.lastAction === 'string' ? enemyAI.lastAction : 'Enemy director standing by',
    updatedAtTick: Number.isInteger(enemyAI.updatedAtTick) ? Math.max(0, enemyAI.updatedAtTick) : 0
  };
}

function createRuntimeDormancyState(map) {
  const enabled = isNomadicSurvivalScene(map);
  return {
    enabled,
    reason: enabled ? 'opening_survival_has_no_active_structure_economy_or_hostile_force' : null,
    dormantSystems: enabled
      ? ['enemyAI', 'resourceGathering', 'supplyLines', 'constructionJobs', 'structureOccupancy', 'structureIncome']
      : []
  };
}

export function getFactionControlOwner(factionId) {
  return FACTION_CONTROL_OWNERS[factionId] ?? FACTION_CONTROL.neutral;
}

export function isFactionPlayerControlled(factionId) {
  return getFactionControlOwner(factionId) === FACTION_CONTROL.player;
}

function isPlayerCommandableEntity(entity) {
  return Boolean(entity && isFactionPlayerControlled(entity.factionId));
}

function createWarriorSquad({ id, factionId, name, tile, stance = 'probe' }) {
  return createSquadFromTemplate(WARRIOR_SQUAD_TEMPLATE, { id, factionId, name, tile, stance });
}

function createInfantrySquad({ id, factionId, name, tile, stance = 'probe' }) {
  return createSquadFromTemplate(INFANTRY_SQUAD_TEMPLATE, { id, factionId, name, tile, stance });
}

function createSquadFromTemplate(template, { id, factionId, name, tile, stance = 'probe', scenarioRole = null, survivorCount = null }) {
  return normaliseSquad({
    id,
    type: ENTITY_TYPES.squad,
    unitId: template.unitId,
    factionId,
    name,
    scenarioRole,
    survivorCount,
    tile: { ...tile },
    position: {
      x: tile.x + 0.82,
      y: tile.y
    },
    members: Array.from({ length: template.members }, (_, index) => ({
      id: `${id}_m${index + 1}`,
      offset: getSquadMemberOffset(index)
    })),
    attributes: {
      cohesion: template.cohesion,
      morale: template.morale,
      firepower: template.firepower,
      discipline: template.discipline,
      scouting: template.scouting
    },
    influenceRadius: template.influenceRadius,
    sightRadius: template.sightRadius,
    hearingRadius: template.hearingRadius,
    speedMultiplier: template.speedMultiplier,
    supply: createFullSquadSupply(),
    behavior: normaliseSquadBehavior({ controller: factionId === 'player' ? 'player' : 'ai', stance }, factionId),
    combat: {
      enabled: template.combatEnabled !== false,
      attackRange: template.attackRange,
      attackDamage: template.attackDamage,
      meleeRange: template.meleeRange,
      meleeDamage: template.meleeDamage,
      meleeRateOfFireTicks: template.meleeRateOfFireTicks,
      rateOfFireTicks: template.rateOfFireTicks,
      projectileSpeedTilesPerTick: template.projectileSpeedTilesPerTick,
      accuracy: template.accuracy,
      weaponProfile: template.weaponProfile ?? 'bow'
    }
  });
}

function createInitialBuilderCrews(structures = []) {
  return structures
    .map(normaliseStructure)
    .filter((structure) => structure.factionId !== 'neutral' && structure.construction?.state === CONSTRUCTION_STATES.complete)
    .filter((structure) => structure.workforce?.enabled && structure.workforce?.initialBuilderCrews > 0)
    .flatMap((structure) => Array.from({ length: structure.workforce.initialBuilderCrews }, (_, localIndex) => ({ structure, localIndex })))
    .map(({ structure, localIndex }, index) => createBuilderCrew({
      id: `builder_${structure.factionId}_${String(index + 1).padStart(2, '0')}`,
      factionId: structure.factionId,
      name: `${FACTIONS[structure.factionId]?.label ?? structure.factionId} Construction Crew ${index + 1}`,
      tile: structure.tile,
      position: {
        x: structure.position.x + 0.35 + (localIndex * 0.18),
        y: structure.position.y + 0.35
      },
      baseStructureId: structure.id
    }));
}

function createBuilderCrew({ id, factionId, name, tile, position, baseStructureId }) {
  return normaliseBuilder({
    id,
    type: ENTITY_TYPES.builder,
    unitId: BUILDER_CREW_TEMPLATE.unitId,
    factionId,
    name,
    tile: { ...tile },
    position: position ?? tileToPosition(tile),
    baseStructureId,
    jobId: null,
    state: 'idle',
    workPerTick: BUILDER_CREW_TEMPLATE.workPerTick,
    speedMultiplier: BUILDER_CREW_TEMPLATE.speedMultiplier,
    lastClaimTick: -BUILDER_CREW_TEMPLATE.claimCadenceTicks
  });
}

function findBuilderTrainingBase(game, factionId, preferredIds = []) {
  const preferred = new Set(preferredIds);
  return (game.structures ?? [])
    .map(normaliseStructure)
    .filter((structure) => structure.factionId === factionId)
    .filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.complete)
    .filter((structure) => structure.workforce?.enabled && structure.workforce?.canTrainBuilders)
    .sort((a, b) => {
      const aPreferred = preferred.has(a.id) ? 0 : 1;
      const bPreferred = preferred.has(b.id) ? 0 : 1;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
      return (a.type === 'builder_lodge' ? 0 : 1) - (b.type === 'builder_lodge' ? 0 : 1);
    })[0] ?? null;
}

function getBuilderSpawnPosition(map, base, count = 1) {
  const offsets = [
    { x: 0.42, y: 0.35 },
    { x: -0.42, y: 0.35 },
    { x: 0.35, y: -0.42 },
    { x: -0.35, y: -0.42 },
    { x: 0.75, y: 0 },
    { x: -0.75, y: 0 }
  ];
  const offset = offsets[(Math.max(1, count) - 1) % offsets.length];
  return clampToMapPosition(map, {
    x: (base.position?.x ?? base.tile?.x ?? 0) + offset.x,
    y: (base.position?.y ?? base.tile?.y ?? 0) + offset.y
  });
}

function createResourceWorker({ id, factionId, name, tile, position, homeStructureId, resourceId, state = RESOURCE_WORKER_STATES.idle, targetTile = null }) {
  return normaliseResourceWorker({
    id,
    type: ENTITY_TYPES.resourceWorker,
    factionId,
    name,
    tile: { ...tile },
    position: position ?? tileToPosition(tile),
    homeStructureId,
    resourceId,
    state,
    targetTile,
    carriedAmount: 0,
    lastDepositAmount: 0,
    speedMultiplier: RESOURCE_WORKER_TEMPLATE.speedMultiplier
  });
}

function createSupplyTransport(args) {
  return createSupplyTransportSystem(args, getLogisticsSystemDeps());
}

function createOutpost({ id, factionId, name, tile, buildableBy }) {
  return normaliseOutpost({
    id,
    type: ENTITY_TYPES.outpost,
    factionId,
    name,
    tile: { ...tile },
    buildable: true,
    buildableBy,
    spawnLeaderId: factionId === 'player' ? 'leader_player_01' : 'leader_enemy_01',
    supply: 1,
    contestable: false,
    ownerFactionId: factionId,
    control: { player: factionId === 'player' ? 1 : 0, enemy: factionId === 'enemy' ? 1 : 0 },
    projectedPressure: { player: 0, enemy: 0 },
    status: 'held'
  });
}

function createContestableOutpost({ id, name, tile, supply = 0.62 }) {
  return normaliseOutpost({
    id,
    type: ENTITY_TYPES.outpost,
    factionId: 'neutral',
    name,
    tile: { ...tile },
    buildable: false,
    buildableBy: 'both',
    spawnLeaderId: null,
    supply: Number.isFinite(Number(supply)) ? Number(supply) : 0.62,
    contestable: true,
    ownerFactionId: null,
    control: { player: 0.5, enemy: 0.5 },
    projectedPressure: { player: 0, enemy: 0 },
    status: 'neutral-contested'
  });
}

function createOutpostStructureInstances(outposts = []) {
  return outposts.map((outpost) => createStructureInstance('outpost', {
    id: `structure_${outpost.id}`,
    factionId: outpost.factionId,
    name: `${outpost.name} Structure`,
    tile: outpost.tile,
    position: tileToPosition(outpost.tile),
    construction: {
      state: 'complete',
      progress: 1
    }
  }));
}

function normaliseLeader(leader) {
  const tile = cloneTile(leader.tile);
  const position = normalisePosition(leader.position, tile);
  return {
    id: String(leader.id),
    type: ENTITY_TYPES.leader,
    factionId: String(leader.factionId),
    name: leader.name ?? leader.id,
    scenarioRole: typeof leader.scenarioRole === 'string' ? leader.scenarioRole : null,
    survivorCount: Number.isFinite(Number(leader.survivorCount)) ? Math.max(0, Math.round(Number(leader.survivorCount))) : 1,
    tile,
    position,
    qualities: normaliseQualities(leader.qualities),
    command: leader.command ?? null,
    commandScore: Number.isFinite(leader.commandScore) ? leader.commandScore : 0,
    influenceRadius: Number.isFinite(leader.influenceRadius) ? leader.influenceRadius : 0,
    hearingRadius: Number.isFinite(leader.hearingRadius) ? Math.max(1, leader.hearingRadius) : LEADER_TEMPLATE.hearingRadius,
    behavior: normaliseLeaderBehavior(leader.behavior, leader.factionId),
    ai: normaliseAIEntityState(leader.ai ?? createAIEntityState({
      morale: leader.qualities?.presence ?? LEADER_TEMPLATE.presence,
      commandConfidence: leader.qualities?.discipline ?? LEADER_TEMPLATE.discipline,
      intentState: AI_INTENT_STATES.holdPosition
    })),
    collision: normaliseMovableCollisionMetadata({ ...leader, type: ENTITY_TYPES.leader }, leader.collision),
    health: normaliseHealthComponent(leader.health, {
      maxHealth: LEADER_TEMPLATE.health,
      armour: LEADER_TEMPLATE.armour
    }),
    combat: normaliseCombatComponent(leader.combat, {
      enabled: true,
      weaponId: COMBAT_MODEL.weaponId,
      weaponProfile: 'command-spear',
      attackRange: LEADER_TEMPLATE.attackRange,
      baseDamage: LEADER_TEMPLATE.attackDamage,
      meleeRange: LEADER_TEMPLATE.meleeRange,
      meleeDamage: LEADER_TEMPLATE.meleeDamage,
      meleeRateOfFireTicks: LEADER_TEMPLATE.meleeRateOfFireTicks,
      rateOfFireTicks: LEADER_TEMPLATE.rateOfFireTicks,
      projectileSpeedTilesPerTick: LEADER_TEMPLATE.projectileSpeedTilesPerTick,
      accuracy: LEADER_TEMPLATE.accuracy,
      volleySize: 1
    }),
    movement: normaliseLeaderMovement(leader.movement, position),
    movementOrder: normaliseMovementOrder(leader.movementOrder),
    movementPath: normaliseMovementPath(leader.movementPath)
  };
}

function getSquadTemplate(unitId) {
  if (unitId === WARRIOR_SQUAD_TEMPLATE.unitId) return WARRIOR_SQUAD_TEMPLATE;
  if (unitId === SCOUT_SQUAD_TEMPLATE.unitId) return SCOUT_SQUAD_TEMPLATE;
  if (unitId === SURVIVOR_GROUP_TEMPLATE.unitId) return SURVIVOR_GROUP_TEMPLATE;
  if (unitId === WOUNDED_SURVIVOR_TEMPLATE.unitId) return WOUNDED_SURVIVOR_TEMPLATE;
  return INFANTRY_SQUAD_TEMPLATE;
}

function normaliseSquad(squad) {
  const tile = cloneTile(squad.tile);
  const position = normalisePosition(squad.position, tile);
  const unitId = squad.unitId ?? 'infantry';
  const template = getSquadTemplate(unitId);
  const members = normaliseSquadMembers(squad.members, template.members);
  return {
    id: String(squad.id),
    type: ENTITY_TYPES.squad,
    unitId,
    factionId: String(squad.factionId),
    name: squad.name ?? squad.id,
    scenarioRole: typeof squad.scenarioRole === 'string' ? squad.scenarioRole : null,
    survivorCount: Number.isFinite(Number(squad.survivorCount)) ? Math.max(0, Math.round(Number(squad.survivorCount))) : members.length,
    tile,
    position,
    members,
    attributes: normaliseSquadAttributes(squad.attributes),
    influenceRadius: Number.isFinite(squad.influenceRadius) ? Math.max(1, squad.influenceRadius) : template.influenceRadius,
    sightRadius: Number.isFinite(squad.sightRadius) ? Math.max(1, squad.sightRadius) : template.sightRadius,
    hearingRadius: Number.isFinite(squad.hearingRadius) ? Math.max(1, squad.hearingRadius) : template.hearingRadius,
    speedMultiplier: Number.isFinite(squad.speedMultiplier) ? Math.max(0.1, squad.speedMultiplier) : template.speedMultiplier,
    behavior: normaliseSquadBehavior(squad.behavior, squad.factionId),
    ai: normaliseAIEntityState(squad.ai ?? createAIEntityState({
      morale: squad.attributes?.morale ?? template.morale,
      commandConfidence: squad.attributes?.discipline ?? template.discipline,
      intentState: AI_INTENT_STATES.idle
    })),
    occupancy: normaliseSquadOccupancy(squad.occupancy),
    supply: normaliseSquadSupply(squad.supply),
    collision: normaliseMovableCollisionMetadata({ ...squad, type: ENTITY_TYPES.squad }, squad.collision),
    health: normaliseHealthComponent(squad.health, {
      maxHealth: template.health,
      armour: template.armour
    }),
    combat: normaliseCombatComponent(squad.combat, {
      enabled: template.combatEnabled !== false && squad.unitId !== 'builder_crew',
      weaponId: COMBAT_MODEL.weaponId,
      attackRange: template.attackRange,
      baseDamage: template.attackDamage,
      meleeRange: template.meleeRange,
      meleeDamage: template.meleeDamage,
      meleeRateOfFireTicks: template.meleeRateOfFireTicks,
      rateOfFireTicks: template.rateOfFireTicks,
      projectileSpeedTilesPerTick: template.projectileSpeedTilesPerTick,
      accuracy: template.accuracy,
      volleySize: Math.max(1, members.length || template.members)
    }),
    movement: normaliseLeaderMovement(squad.movement, position),
    movementOrder: normaliseMovementOrder(squad.movementOrder),
    movementPath: normaliseMovementPath(squad.movementPath)
  };
}

function normaliseBuilder(builder) {
  const tile = cloneTile(builder.tile);
  const position = normalisePosition(builder.position, tile);
  return {
    id: String(builder.id),
    type: ENTITY_TYPES.builder,
    unitId: builder.unitId ?? BUILDER_CREW_TEMPLATE.unitId,
    factionId: String(builder.factionId),
    name: builder.name ?? builder.id,
    tile,
    position,
    baseStructureId: typeof builder.baseStructureId === 'string' ? builder.baseStructureId : null,
    jobId: typeof builder.jobId === 'string' ? builder.jobId : null,
    state: ['idle', 'moving', 'working', 'returning'].includes(builder.state) ? builder.state : 'idle',
    workPerTick: positiveNumber(builder.workPerTick, BUILDER_CREW_TEMPLATE.workPerTick),
    speedMultiplier: positiveNumber(builder.speedMultiplier, BUILDER_CREW_TEMPLATE.speedMultiplier),
    lastClaimTick: Number.isInteger(builder.lastClaimTick) ? builder.lastClaimTick : 0,
    blockedTicks: Number.isInteger(builder.blockedTicks) ? Math.max(0, builder.blockedTicks) : 0,
    workPoint: builder.workPoint ? normalisePosition(builder.workPoint, position) : null,
    avoidedWorkPointKeys: Array.isArray(builder.avoidedWorkPointKeys)
      ? builder.avoidedWorkPointKeys.filter((key) => typeof key === 'string').slice(-6)
      : [],
    collision: normaliseMovableCollisionMetadata({ ...builder, type: ENTITY_TYPES.builder }, builder.collision),
    movement: normaliseLeaderMovement(builder.movement, position),
    movementPath: normaliseMovementPath(builder.movementPath)
  };
}

function normaliseResourceWorker(worker) {
  const tile = cloneTile(worker.tile);
  const position = normalisePosition(worker.position, tile);
  return {
    id: String(worker.id),
    type: ENTITY_TYPES.resourceWorker,
    factionId: String(worker.factionId),
    name: worker.name ?? worker.id,
    tile,
    position,
    homeStructureId: typeof worker.homeStructureId === 'string' ? worker.homeStructureId : null,
    resourceId: typeof worker.resourceId === 'string' ? worker.resourceId : RESOURCE_IDS.food,
    state: Object.values(RESOURCE_WORKER_STATES).includes(worker.state) ? worker.state : RESOURCE_WORKER_STATES.idle,
    targetTile: worker.targetTile && Number.isFinite(worker.targetTile.x) && Number.isFinite(worker.targetTile.y)
      ? { x: Math.round(worker.targetTile.x), y: Math.round(worker.targetTile.y) }
      : null,
    carriedAmount: Math.max(0, Number(worker.carriedAmount) || 0),
    lastDepositAmount: Math.max(0, Number(worker.lastDepositAmount) || 0),
    speedMultiplier: positiveNumber(worker.speedMultiplier, RESOURCE_WORKER_TEMPLATE.speedMultiplier),
    collision: normaliseMovableCollisionMetadata({ ...worker, type: ENTITY_TYPES.resourceWorker }, worker.collision),
    movement: normaliseLeaderMovement(worker.movement, position),
    movementPath: normaliseMovementPath(worker.movementPath)
  };
}

function normaliseSupplyTransport(transport) {
  return normaliseSupplyTransportSystem(transport, getLogisticsSystemDeps());
}

function syncSupplyTransportsForStorageStructures(game, map) {
  return syncSupplyTransportsForStorageStructuresSystem(game, map, getLogisticsSystemDeps());
}

function normaliseConstructionJob(job) {
  return normaliseConstructionJobSystem(job, getConstructionSystemDeps());
}

function createConstructionJobFromStructure(structure, options = {}) {
  return createConstructionJobFromStructureSystem(structure, options, getConstructionSystemDeps());
}

function validateConstructionAccess(game, map, structure, factionId, sourceBase) {
  return validateConstructionAccessSystem(game, map, structure, factionId, sourceBase, getConstructionSystemDeps());
}

function getStructureWorkPointCandidates(structure) {
  return getStructureWorkPointCandidatesSystem(structure);
}

function normaliseOutpost(outpost) {
  const control = normaliseControl(outpost.control);
  const projectedPressure = normalisePressure(outpost.projectedPressure);
  const contestable = Boolean(outpost.contestable);
  const ownerFactionId = outpost.ownerFactionId ?? (contestable ? null : outpost.factionId);
  return {
    id: String(outpost.id),
    type: ENTITY_TYPES.outpost,
    factionId: String(outpost.factionId),
    name: outpost.name ?? outpost.id,
    tile: cloneTile(outpost.tile),
    buildable: outpost.buildable !== false,
    buildableBy: outpost.buildableBy ?? outpost.factionId,
    spawnLeaderId: outpost.spawnLeaderId ?? null,
    supply: Number.isFinite(outpost.supply) ? clamp01(outpost.supply) : 1,
    contestable,
    ownerFactionId,
    control,
    projectedPressure,
    status: outpost.status ?? getOutpostStatus({ contestable, ownerFactionId, control, projectedPressure })
  };
}

function normaliseStructure(structure) {
  return normaliseStructureInstance(structure);
}

function getStructureSelectionRadius(structure) {
  const footprint = structure?.footprint ?? {};
  return Math.max(
    0.8,
    Number(footprint.radius) || 0,
    (Number(footprint.width) || 0) / 2,
    (Number(footprint.height) || 0) / 2
  );
}

function normaliseGameStructures(game) {
  const structures = Array.isArray(game.structures) ? game.structures : [];
  if (structures.length > 0) {
    return structures.map(normaliseStructure);
  }
  return createOutpostStructureInstances(game.outposts ?? []);
}

function syncEconomyStorageCapacity(game) {
  const capacities = { player: 0, enemy: 0 };
  (game.structures ?? []).forEach((structure) => {
    const normalised = normaliseStructure(structure);
    if (
      normalised.construction?.state === CONSTRUCTION_STATES.complete &&
      normalised.storage?.enabled &&
      Object.prototype.hasOwnProperty.call(capacities, normalised.factionId)
    ) {
      capacities[normalised.factionId] += normalised.storage.capacityBonus;
    }
  });
  return setFactionStorageCapacity(game.economy, capacities, ['player', 'enemy']);
}

function normaliseQualities(qualities = {}) {
  return Object.fromEntries(LEADER_QUALITY_KEYS.map((key) => [
    key,
    Number.isFinite(qualities[key]) ? clamp01(qualities[key]) : LEADER_TEMPLATE[key]
  ]));
}

function normaliseLeaderBehavior(behavior = {}, factionId = 'player') {
  const controller = behavior.controller === 'ai' || factionId === 'enemy' ? 'ai' : 'player';
  const stance = normalisePressureStance(behavior.stance);
  return {
    controller,
    stance,
    intent: behavior.intent ?? 'contest-objective',
    lastDecision: behavior.lastDecision ?? (controller === 'ai' ? 'Enemy probing for a weak route' : 'Player probing the objective')
  };
}

function normaliseSquadBehavior(behavior = {}, factionId = 'player') {
  const controller = behavior.controller === 'ai' || factionId === 'enemy' ? 'ai' : 'player';
  const stance = normalisePressureStance(behavior.stance);
  return {
    controller,
    stance,
    intent: behavior.intent ?? 'support-objective',
    lastDecision: behavior.lastDecision ?? (controller === 'ai' ? 'Enemy infantry supporting the line' : 'Infantry awaiting orders')
  };
}

function normaliseSquadMembers(members = [], limit = INFANTRY_SQUAD_TEMPLATE.members) {
  const source = Array.isArray(members) && members.length > 0
    ? members
    : Array.from({ length: limit }, (_, index) => ({ id: `m${index + 1}`, offset: getSquadMemberOffset(index) }));
  return source.slice(0, limit).map((member, index) => ({
    id: typeof member.id === 'string' ? member.id : `m${index + 1}`,
    offset: normalisePosition(member.offset, getSquadMemberOffset(index))
  }));
}

function normaliseSquadAttributes(attributes = {}) {
  return Object.fromEntries(['cohesion', 'morale', 'firepower', 'discipline', 'scouting'].map((key) => [
    key,
    Number.isFinite(attributes[key]) ? clamp01(attributes[key]) : INFANTRY_SQUAD_TEMPLATE[key]
  ]));
}


function normaliseSquadOccupancy(occupancy = {}) {
  const state = Object.values(SQUAD_OCCUPANCY_STATES).includes(occupancy.state)
    ? occupancy.state
    : SQUAD_OCCUPANCY_STATES.field;
  return {
    state,
    structureId: typeof occupancy.structureId === 'string' ? occupancy.structureId : null,
    assignedAtTick: Number.isInteger(occupancy.assignedAtTick) ? Math.max(0, occupancy.assignedAtTick) : null,
    enteredAtTick: Number.isInteger(occupancy.enteredAtTick) ? Math.max(0, occupancy.enteredAtTick) : null
  };
}

function normaliseSquadSupply(supply = {}) {
  const capacity = positiveNumber(supply.foodCapacity, FIELD_FOOD_SUPPLY.capacity);
  const fallbackFood = Number.isFinite(supply.food) ? supply.food : FIELD_FOOD_SUPPLY.startingFood;
  const food = clamp(0, capacity, fallbackFood);
  const ratio = capacity > 0 ? clamp01(food / capacity) : 0;
  return {
    foodCapacity: round3(capacity),
    food: round3(food),
    foodRatio: round3(ratio),
    starvingTicks: Number.isInteger(supply.starvingTicks) ? Math.max(0, supply.starvingTicks) : 0,
    lastFoodDelivered: Number.isFinite(supply.lastFoodDelivered) ? Math.max(0, supply.lastFoodDelivered) : 0,
    status: supply.status === 'ready' && food >= capacity
      ? 'ready'
      : getSquadSupplyStatus(food, capacity)
  };
}

function createFullSquadSupply() {
  return normaliseSquadSupply({
    foodCapacity: FIELD_FOOD_SUPPLY.capacity,
    food: FIELD_FOOD_SUPPLY.capacity,
    starvingTicks: 0,
    lastFoodDelivered: 0,
    status: 'ready'
  });
}

function getSquadSupplyStatus(food, capacity) {
  if (food <= 0) {
    return 'starving';
  }
  const ratio = capacity > 0 ? food / capacity : 0;
  if (ratio <= 0.3) {
    return 'hungry';
  }
  if (ratio <= 0.62) {
    return 'thin';
  }
  return 'supplied';
}

function normaliseGameTime(time = {}, tick = 0) {
  const tickDurationMs = positiveNumber(time?.tickDurationMs, GAME_TIME.tickDurationMs);
  const dayLengthMs = positiveNumber(time?.dayLengthMs, GAME_TIME.dayLengthMs);
  const ticksPerDay = Math.max(1, Math.round(dayLengthMs / tickDurationMs));
  const absoluteTick = Math.max(0, Math.floor(Number.isInteger(tick) ? tick : 0));
  const tickInDay = absoluteTick % ticksPerDay;
  const dayProgress = tickInDay / ticksPerDay;
  const day = Math.floor(absoluteTick / ticksPerDay) + 1;
  const totalHours = (GAME_TIME.dayStartHour + dayProgress * 24) % 24;
  const hour = Math.floor(totalHours);
  const minute = Math.floor((totalHours - hour) * 60);
  const phase = getTimeOfDayPhase(totalHours);
  return {
    day,
    tickInDay,
    ticksPerDay,
    dayProgress: round3(dayProgress),
    hour,
    minute,
    clockLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    phase,
    tickDurationMs,
    dayLengthMs
  };
}

function getTimeOfDayPhase(hour) {
  if (hour >= GAME_TIME.dawnHour && hour < 7) {
    return 'dawn';
  }
  if (hour >= 7 && hour < 17) {
    return 'day';
  }
  if (hour >= 17 && hour < GAME_TIME.duskHour) {
    return 'dusk';
  }
  return 'night';
}

function createFieldSquadOccupancy() {
  return {
    state: SQUAD_OCCUPANCY_STATES.field,
    structureId: null,
    assignedAtTick: null,
    enteredAtTick: null
  };
}

function isSquadOccupied(squad) {
  return squad?.occupancy?.state === SQUAD_OCCUPANCY_STATES.occupied;
}

function isSquadMovingToOccupy(squad) {
  return squad?.occupancy?.state === SQUAD_OCCUPANCY_STATES.movingToOccupy && typeof squad.occupancy.structureId === 'string';
}

function normalisePressureStance(stanceId) {
  return Object.prototype.hasOwnProperty.call(PRESSURE_STANCES, stanceId) ? stanceId : 'probe';
}

function normalisePosition(position, fallbackTile) {
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return roundPosition(position);
  }
  return tileToPosition(fallbackTile);
}

function bindRuntimeOwner(entity, game) {
  Object.defineProperty(entity, '_runtimeOwner', {
    value: game,
    enumerable: false,
    configurable: true
  });
  return entity;
}

function stripRuntimeLeader(leader) {
  return {
    id: leader.id,
    type: leader.type,
    factionId: leader.factionId,
    name: leader.name,
    tile: { ...leader.tile },
    position: roundPosition(leader.position),
    collision: { ...leader.collision },
    health: { ...leader.health },
    combat: { ...leader.combat },
    movement: stripRuntimeMovement(leader.movement),
    movementOrder: stripRuntimeMovementOrder(leader.movementOrder),
    movementPath: stripRuntimeMovementPath(leader.movementPath),
    qualities: { ...leader.qualities },
    hearingRadius: round3(leader.hearingRadius),
    behavior: { ...leader.behavior },
    ai: normaliseAIEntityState(leader.ai)
  };
}

function stripRuntimeSquad(squad) {
  return {
    id: squad.id,
    type: squad.type,
    unitId: squad.unitId,
    factionId: squad.factionId,
    name: squad.name,
    tile: { ...squad.tile },
    position: roundPosition(squad.position),
    members: squad.members.map((member) => ({
      id: member.id,
      offset: roundPosition(member.offset)
    })),
    attributes: { ...squad.attributes },
    influenceRadius: round3(squad.influenceRadius),
    sightRadius: round3(squad.sightRadius),
    hearingRadius: round3(squad.hearingRadius),
    speedMultiplier: round3(squad.speedMultiplier),
    collision: { ...squad.collision },
    health: { ...squad.health },
    combat: { ...squad.combat },
    behavior: { ...squad.behavior },
    supply: { ...squad.supply },
    occupancy: { ...squad.occupancy },
    movement: stripRuntimeMovement(squad.movement),
    movementOrder: stripRuntimeMovementOrder(squad.movementOrder),
    movementPath: stripRuntimeMovementPath(squad.movementPath),
    ai: normaliseAIEntityState(squad.ai)
  };
}

function stripRuntimeMovement(movement) {
  return normaliseLeaderMovement(movement);
}

function stripRuntimeMovementOrder(movementOrder) {
  return movementOrder ? normaliseMovementOrder(movementOrder) : null;
}

function stripRuntimeMovementPath(movementPath) {
  return movementPath ? normaliseMovementPath(movementPath) : null;
}

function stripRuntimeOutpost(outpost) {
  return {
    id: outpost.id,
    type: outpost.type,
    factionId: outpost.factionId,
    name: outpost.name,
    tile: { ...outpost.tile },
    buildable: outpost.buildable,
    buildableBy: outpost.buildableBy,
    spawnLeaderId: outpost.spawnLeaderId,
    supply: outpost.supply,
    contestable: outpost.contestable,
    ownerFactionId: outpost.ownerFactionId,
    control: { ...outpost.control },
    projectedPressure: { ...outpost.projectedPressure },
    status: outpost.status
  };
}

function stripRuntimeStructure(structure) {
  return normaliseStructure(structuredClone(structure));
}

function stripRuntimeConstructionJob(job) {
  return normaliseConstructionJob(structuredClone(job));
}

function stripRuntimeBuilder(builder) {
  const normalised = normaliseBuilder(builder);
  return {
    ...normalised,
    movement: stripRuntimeMovement(normalised.movement),
    movementPath: stripRuntimeMovementPath(normalised.movementPath)
  };
}

function stripRuntimeResourceWorker(worker) {
  const normalised = normaliseResourceWorker(worker);
  return {
    ...normalised,
    movement: stripRuntimeMovement(normalised.movement),
    movementPath: stripRuntimeMovementPath(normalised.movementPath)
  };
}

function stripRuntimeSupplyTransport(transport) {
  const normalised = normaliseSupplyTransport(transport);
  return {
    ...normalised,
    movement: stripRuntimeMovement(normalised.movement),
    movementPath: stripRuntimeMovementPath(normalised.movementPath)
  };
}

function structuredCloneWithoutFields(game) {
  return {
    ...game,
    economy: game.economy ? structuredClone(game.economy) : undefined,
    collisionStats: game.collisionStats ? structuredClone(game.collisionStats) : undefined,
    outposts: game.outposts ? structuredClone(game.outposts) : [],
    structures: game.structures ? structuredClone(game.structures) : [],
    constructionJobs: game.constructionJobs ? structuredClone(game.constructionJobs) : [],
    leaders: game.leaders ? structuredClone(game.leaders) : [],
    squads: game.squads ? structuredClone(game.squads) : [],
    projectiles: game.projectiles ? structuredClone(game.projectiles) : [],
    soundEvents: game.soundEvents ? structuredClone(game.soundEvents) : [],
    impactEvents: game.impactEvents ? structuredClone(game.impactEvents) : [],
    deathEvents: game.deathEvents ? structuredClone(game.deathEvents) : [],
    corpses: game.corpses ? structuredClone(game.corpses) : [],
    battlefieldTrace: game.battlefieldTrace ? structuredClone(game.battlefieldTrace) : createBattlefieldTrace(),
    combatStats: game.combatStats ? structuredClone(game.combatStats) : undefined,
    builders: game.builders ? structuredClone(game.builders) : [],
    resourceWorkers: game.resourceWorkers ? structuredClone(game.resourceWorkers) : [],
    transports: game.transports ? structuredClone(game.transports) : [],
    fields: {}
  };
}

function normaliseGameStateForSnapshot(game, map) {
  return {
    ...game,
    contract: GAME_STATE_CONTRACT_ID,
    version: GAME_STATE_VERSION,
    mapRef: createMapRef(map),
    tick: Number.isInteger(game.tick) ? game.tick : 0,
    time: normaliseGameTime(game.time, Number.isInteger(game.tick) ? game.tick : 0),
    phase: typeof game.phase === 'string' ? game.phase : GAME_PHASES.openingCommandField,
    mode: typeof game.mode === 'string' ? game.mode : GAME_MODES.leaderDuelSeed,
    selectedEntityId: typeof game.selectedEntityId === 'string' ? game.selectedEntityId : null,
    economy: normaliseEconomy(game.economy, ['player', 'enemy']),
    progression: normaliseProgressionState(game.progression),
    enemyAI: normaliseEnemyAIState(game.enemyAI),
    ai: normaliseAISystemState(game.ai, Number.isInteger(game.tick) ? game.tick : 0),
    collisionStats: summarizeCollisionAuthority(game),
    outposts: (game.outposts ?? []).map(normaliseOutpost),
    structures: normaliseGameStructures(game),
    constructionJobs: (game.constructionJobs ?? []).map(normaliseConstructionJob),
    leaders: (game.leaders ?? []).map(normaliseLeader),
    squads: (game.squads ?? []).map(normaliseSquad),
    projectiles: normaliseProjectiles(game.projectiles),
    soundEvents: normaliseSoundEvents(game.soundEvents, Number.isInteger(game.tick) ? game.tick : 0),
    impactEvents: normaliseImpactEvents(game.impactEvents),
    deathEvents: normaliseDeathEvents(game.deathEvents),
    corpses: normaliseCorpses(game.corpses),
    battlefieldTrace: normaliseBattlefieldTrace(game.battlefieldTrace),
    combatStats: summarizeCombat(game),
    builders: (game.builders ?? []).map(normaliseBuilder),
    resourceWorkers: (game.resourceWorkers ?? []).map(normaliseResourceWorker),
    transports: (game.transports ?? []).map(normaliseSupplyTransport)
  };
}

function findOutpostForLeader(game, leader) {
  return game.outposts.find((outpost) => !outpost.contestable && outpost.factionId === leader.factionId) ?? null;
}

function findOutpostForSquad(game, squad) {
  return game.outposts.find((outpost) => !outpost.contestable && outpost.factionId === squad.factionId) ?? null;
}

function findPrimaryContestableOutpost(game) {
  return game.outposts.find((outpost) => outpost.contestable) ?? null;
}

function advanceEnemyAIDirector(game, map) {
  ensureRuntimeCoordination(game, map);
  game.enemyAI = normaliseEnemyAIState(game.enemyAI);
  game.ai = normaliseAISystemState(game.ai, game.tick);
  const forceBootstrapDecision = [ENEMY_AI_STATES.boot, ENEMY_AI_STATES.survey].includes(game.enemyAI.state);
  if (!forceBootstrapDecision && !shouldRunScheduledSystem(game, 'enemyAI')) {
    return;
  }
  runEnemyBehaviour(game);

  const context = getEnemyAIContext(game);
  const needs = context.needs;
  let nextState = game.enemyAI.state;
  let action = game.enemyAI.lastAction;

  if (game.enemyAI.state === ENEMY_AI_STATES.boot) {
    nextState = ENEMY_AI_STATES.survey;
    action = 'Enemy director initialised';
  } else if (!context.hasBase || context.baseDamaged) {
    nextState = ENEMY_AI_STATES.buildBase;
    action = context.hasBase ? 'Enemy base damaged; rebuilding posture' : 'Enemy has no completed base';
  } else if (needs.primaryNeed && needs.primaryNeed.type !== ENEMY_NEED_TYPES.regroup) {
    nextState = ENEMY_AI_STATES.gatherForce;
    action = maybeCreateEnemyLogisticsJob(game, map, context, needs.primaryNeed);
  } else if (needs.forceStarving && context.fighters.length >= game.enemyAI.attackThreshold) {
    nextState = ENEMY_AI_STATES.retreatOrRebuild;
    action = issueEnemyRegroupOrders(game, map, context);
  } else if (context.readyFighters.length < game.enemyAI.attackThreshold) {
    nextState = ENEMY_AI_STATES.gatherForce;
    const openingMusterDelayed = context.fighters.length <= 0 && (game.tick ?? 0) < ENEMY_AI_DEFAULTS.openingMusterDelayTicks;
    action = openingMusterDelayed
      ? 'Enemy surveying before mustering first warband'
      : musterEnemyForce(game, map);
  } else if (shouldEnemyExpand(game, context)) {
    nextState = ENEMY_AI_STATES.expand;
    action = maybeCreateEnemyExpansionJob(game, map, context);
  } else {
    nextState = ENEMY_AI_STATES.attack;
    action = shouldRefreshEnemyAttackOrders(game, context)
      ? issueEnemyAttackOrders(game, map, context)
      : `Enemy maintaining attack on ${context.target?.name ?? context.target?.id ?? 'friendly target'}`;
  }

  game.enemyAI = {
    ...game.enemyAI,
    previousState: game.enemyAI.state === nextState ? game.enemyAI.previousState : game.enemyAI.state,
    state: nextState,
    attackGroupIds: context.readyFighters.map((squad) => squad.id),
    lastAction: action,
    updatedAtTick: game.tick ?? 0
  };
  completeScheduledSystem(game, 'enemyAI');
}

function getEnemyAIContext(game) {
  const enemyStructures = (game.structures ?? []).filter((structure) => structure.factionId === 'enemy');
  const completedBases = enemyStructures.filter((structure) => structure.type === 'outpost' && structure.construction?.state === CONSTRUCTION_STATES.complete);
  const fighters = (game.squads ?? []).filter(isEnemyFighterSquad);
  const readyFighters = fighters.filter(isEnemyFighterReadyForAttack);
  const incompleteJobs = (game.constructionJobs ?? []).filter((job) => job.factionId === 'enemy' && job.state !== CONSTRUCTION_JOB_STATES.complete && job.state !== CONSTRUCTION_JOB_STATES.cancelled);
  const target = findEnemyAttackTarget(game);
  const needs = evaluateEnemyNeeds(game);
  return {
    hasBase: completedBases.length > 0,
    base: completedBases[0] ?? null,
    baseDamaged: completedBases.some((base) => base.integrity?.health < base.integrity?.maxHealth * 0.45),
    fighters,
    readyFighters,
    incompleteJobs,
    target,
    needs
  };
}

function isEnemyFighterSquad(squad) {
  return squad?.factionId === 'enemy' && ENEMY_FIGHTER_UNIT_IDS.includes(squad.unitId);
}

function isEnemyFighterReadyForAttack(squad) {
  return normaliseSquadSupply(squad?.supply).food > 0;
}

function evaluateEnemyNeeds(game) {
  const faction = normaliseEconomy(game.economy, ['player', 'enemy']).factions.enemy;
  const stockpiles = faction?.stockpiles ?? {};
  const storage = faction?.storage ?? { capacity: 0, used: 0, free: 0 };
  const enemySquads = (game.squads ?? [])
    .filter(isEnemyFighterSquad)
    .map(normaliseSquad);
  const hungrySquads = enemySquads.filter((squad) => squad.supply.food <= FIELD_FOOD_SUPPLY.deliveryRequestThreshold);
  const starvingSquads = enemySquads.filter((squad) => squad.supply.food <= 0 || squad.supply.status === 'starving');
  const woodBlockedJobs = getEnemyWoodBlockedConstructionJobs(game);
  const storageRatio = storage.capacity > 0 ? storage.used / storage.capacity : (storage.used > 0 ? 1 : 0);
  const hasFoodProduction = hasEnemyStructureOrJob(game, ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.food]);
  const hasWoodProduction = hasEnemyStructureOrJob(game, ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.wood]);
  const hasExtraStorage = hasEnemyStructureOrJob(game, ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.storage]);
  const foodStructureAvailable = isEnemyStructureAvailable(game, ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.food]);
  const woodStructureAvailable = isEnemyStructureAvailable(game, ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.wood]);
  const storageStructureAvailable = isEnemyStructureAvailable(game, ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.storage]);
  const foodDemandExists = enemySquads.length > 0 && (hungrySquads.length > 0 || (stockpiles[RESOURCE_IDS.food]?.amount ?? 0) <= 0);
  const primaryNeed = resolveEnemyPrimaryNeed({
    foodDemandExists,
    hungrySquads,
    starvingSquads,
    woodBlockedJobs,
    storageRatio,
    hasFoodProduction,
    hasWoodProduction,
    hasExtraStorage,
    foodStructureAvailable,
    woodStructureAvailable,
    storageStructureAvailable,
    enemySquads
  });

  return {
    food: round3(stockpiles[RESOURCE_IDS.food]?.amount ?? 0),
    wood: round3(stockpiles[RESOURCE_IDS.wood]?.amount ?? 0),
    supplies: round3(stockpiles[RESOURCE_IDS.supplies]?.amount ?? 0),
    storage: {
      capacity: round3(storage.capacity ?? 0),
      used: round3(storage.used ?? 0),
      free: round3(storage.free ?? 0),
      ratio: round3(storageRatio)
    },
    hungrySquadIds: hungrySquads.map((squad) => squad.id),
    starvingSquadIds: starvingSquads.map((squad) => squad.id),
    woodBlockedJobIds: woodBlockedJobs.map((job) => job.id),
    hasFoodProduction,
    hasWoodProduction,
    hasExtraStorage,
    foodStructureAvailable,
    woodStructureAvailable,
    storageStructureAvailable,
    primaryNeed,
    forceStarving: enemySquads.length > 0 && starvingSquads.length >= enemySquads.length
  };
}

function resolveEnemyPrimaryNeed({
  foodDemandExists,
  hungrySquads,
  starvingSquads,
  woodBlockedJobs,
  storageRatio,
  hasFoodProduction,
  hasWoodProduction,
  hasExtraStorage,
  foodStructureAvailable,
  woodStructureAvailable,
  storageStructureAvailable,
  enemySquads
}) {
  if ((foodDemandExists || hungrySquads.length > 0 || starvingSquads.length > 0) && !hasFoodProduction && foodStructureAvailable) {
    return {
      type: ENEMY_NEED_TYPES.food,
      structureType: ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.food],
      reason: starvingSquads.length > 0 ? 'starving-squads' : 'food-demand'
    };
  }
  if (woodBlockedJobs.length > 0 && !hasWoodProduction && woodStructureAvailable) {
    return {
      type: ENEMY_NEED_TYPES.wood,
      structureType: ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.wood],
      reason: 'wood-blocked-construction'
    };
  }
  if (storageRatio >= ENEMY_STORAGE_PRESSURE_RATIO && !hasExtraStorage && storageStructureAvailable) {
    return {
      type: ENEMY_NEED_TYPES.storage,
      structureType: ENEMY_LOGISTICS_STRUCTURE_TYPES[ENEMY_NEED_TYPES.storage],
      reason: 'storage-pressure'
    };
  }
  if (enemySquads.length > 0 && starvingSquads.length >= enemySquads.length) {
    return {
      type: ENEMY_NEED_TYPES.regroup,
      structureType: null,
      reason: 'force-starving'
    };
  }
  return null;
}

function hasEnemyStructureOrJob(game, type) {
  const hasStructure = (game.structures ?? []).some((structure) => (
    structure.factionId === 'enemy' &&
    structure.type === type &&
    structure.construction?.state !== CONSTRUCTION_STATES.ruined
  ));
  if (hasStructure) {
    return true;
  }
  return (game.constructionJobs ?? []).map(normaliseConstructionJob).some((job) => {
    if (job.factionId !== 'enemy' || job.state === CONSTRUCTION_JOB_STATES.complete || job.state === CONSTRUCTION_JOB_STATES.cancelled) {
      return false;
    }
    const structure = (game.structures ?? []).find((candidate) => candidate.id === job.structureId);
    return structure?.type === type && structure.construction?.state !== CONSTRUCTION_STATES.ruined;
  });
}

function getEnemyWoodBlockedConstructionJobs(game) {
  return (game.constructionJobs ?? []).map(normaliseConstructionJob).filter((job) => {
    if (job.factionId !== 'enemy' || job.state === CONSTRUCTION_JOB_STATES.complete || job.state === CONSTRUCTION_JOB_STATES.cancelled) {
      return false;
    }
    if (job.resourceBlocker === RESOURCE_IDS.wood) {
      return true;
    }
    const structure = (game.structures ?? []).find((candidate) => candidate.id === job.structureId);
    const woodBudget = getConstructionWoodBudget(structure, job);
    return woodBudget > 0 && (job.deliveredResources?.[RESOURCE_IDS.wood] ?? 0) < woodBudget && job.progress <= 0;
  });
}

function musterEnemyForce(game, map) {
  const unitId = getEnemyAvailableFighterUnitId(game);
  if (!unitId) {
    return 'Enemy gathering force: no unlocked fighter unit';
  }
  const option = getBuildOption('unit', unitId);
  const resourceCost = option?.resourceCost ?? { [RESOURCE_IDS.gold]: 15, [RESOURCE_IDS.food]: 8, [RESOURCE_IDS.wood]: 4, [RESOURCE_IDS.population]: 1 };
  const affordability = canAffordCost(game.economy, 'enemy', resourceCost);
  if (!affordability.ok) {
    return `Enemy gathering force: waiting for ${option?.costLabel ?? describeResourceCost(resourceCost)}`;
  }
  const spend = spendCost(game.economy, 'enemy', resourceCost);
  if (!spend.ok) {
    return 'Enemy gathering force: resource spend blocked';
  }
  game.economy = spend.economy;
  const spawn = spawnEnemyFighterSquad(game, map, unitId);
  return spawn.ok ? `Enemy mustered ${spawn.squad.name}` : `Enemy muster failed: ${spawn.reason}`;
}

function getEnemyAvailableFighterUnitId(game) {
  const progression = normaliseProgressionState(game.progression);
  return ENEMY_FIGHTER_UNIT_PRIORITY.find((unitId) => isBuildOptionUnlocked(progression, { type: 'unit', id: unitId })) ?? null;
}

function spawnEnemyFighterSquad(game, map, unitId) {
  if (unitId === 'warrior') {
    return spawnWarriorSquad(game, map, { factionId: 'enemy', select: false });
  }
  if (unitId === 'infantry') {
    return spawnInfantrySquad(game, map, { factionId: 'enemy', select: false });
  }
  return { ok: false, reason: `unsupported-enemy-fighter:${unitId}`, game };
}

function isEnemyStructureAvailable(game, structureType) {
  if (!structureType) return false;
  return isBuildOptionUnlocked(normaliseProgressionState(game.progression), { type: 'building', id: structureType });
}

function maybeCreateEnemyLogisticsJob(game, map, context, need) {
  const structureType = need?.structureType;
  if (!structureType) {
    return 'Enemy logistics paused: no buildable need';
  }
  if (!isEnemyStructureAvailable(game, structureType)) {
    return `Enemy ${need.type} logistics locked: ${structureType} is not available in the current progression stage`;
  }
  if (hasEnemyStructureOrJob(game, structureType)) {
    return `Enemy logistics satisfied: ${structureType} already queued`;
  }

  game.enemyAI = {
    ...game.enemyAI,
    buildCooldownUntil: Math.max(game.enemyAI.buildCooldownUntil, (game.tick ?? 0) + ENEMY_AI_DEFAULTS.buildCooldownTicks)
  };
  const position = chooseEnemyLogisticsPosition(game, map, context, structureType);
  if (!position) {
    return `Enemy ${need.type} logistics blocked: no buildable site`;
  }
  const result = placeStructureBuildOrder(game, map, {
    type: structureType,
    factionId: 'enemy',
    position
  });
  if (!result.ok) {
    return `Enemy ${need.type} logistics waits: ${result.reason}`;
  }
  return `Enemy needs ${need.type}: queued ${result.structure.name}`;
}

function chooseEnemyLogisticsPosition(game, map, context, structureType) {
  const base = context.base;
  if (!base) {
    return null;
  }
  const origin = base.position ?? base.tile;
  const target = context.target?.position ?? context.target?.tile ?? origin;
  const forwardX = Math.sign(target.x - origin.x);
  const forwardY = Math.sign(target.y - origin.y);
  const awayX = forwardX === 0 ? 1 : -forwardX;
  const awayY = forwardY === 0 ? 0 : -forwardY;
  const lateral = forwardY !== 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const candidates = [];

  for (let distance = 2; distance <= 7; distance += 1) {
    for (const offset of [0, 1, -1, 2, -2, 3, -3]) {
      candidates.push({
        x: Math.round(origin.x + awayX * distance + lateral.x * offset),
        y: Math.round(origin.y + awayY * distance + lateral.y * offset)
      });
    }
  }
  for (let radius = 2; radius <= 6; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        candidates.push({ x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) });
      }
    }
  }

  return dedupeTiles(candidates).find((candidate) => validateStructurePlacement(game, map, {
    type: structureType,
    factionId: 'enemy',
    position: candidate,
    checkConstructionAccess: false
  }).valid) ?? null;
}

function issueEnemyRegroupOrders(game, map, context) {
  const base = context.base;
  if (!base) {
    return 'Enemy regroup delayed: no completed base';
  }
  const basePosition = base.position ?? base.tile;
  let issued = 0;
  game.squads = (game.squads ?? []).map((squad) => {
    if (!isEnemyFighterSquad(squad)) {
      return squad;
    }
    const order = normaliseMovementOrder(squad.movementOrder);
    if (order?.routeMode === 'ai-director' && order.target && tileDistance(order.target, basePosition) <= 0.5 && squad.behavior?.intent === 'regroup-for-food') {
      return squad;
    }
    issued += 1;
    return issueFactionMovementOrder(squad, basePosition, game.tick, {
      routeMode: 'ai-director',
      stance: 'hold',
      intent: 'regroup-for-food',
      lastDecision: 'Enemy regrouping near base while food recovers'
    });
  });
  game.enemyAI = {
    ...game.enemyAI,
    lastAttackTargetId: null
  };
  return issued > 0
    ? 'Enemy holding: squads starving near base'
    : 'Enemy maintaining regroup near base';
}

function shouldEnemyExpand(game, context) {
  if (!context.hasBase || context.incompleteJobs.length > 0) {
    return false;
  }
  if ((game.tick ?? 0) < game.enemyAI.buildCooldownUntil) {
    return false;
  }
  const structureType = getEnemyExpansionStructureType(game);
  if (!structureType) {
    return false;
  }
  return !(game.structures ?? []).some((structure) => (
    structure.factionId === 'enemy' &&
    structure.type === structureType &&
    structure.construction?.state !== CONSTRUCTION_STATES.ruined
  ));
}

function getEnemyExpansionStructureType(game) {
  const progression = normaliseProgressionState(game.progression);
  return ENEMY_EXPANSION_STRUCTURE_PRIORITY.find((structureType) => (
    isBuildOptionUnlocked(progression, { type: 'building', id: structureType })
  )) ?? null;
}

function maybeCreateEnemyExpansionJob(game, map, context) {
  const structureType = getEnemyExpansionStructureType(game);
  if (!structureType) {
    return 'Enemy expansion paused: no available structure in current progression stage';
  }
  game.enemyAI = {
    ...game.enemyAI,
    buildCooldownUntil: (game.tick ?? 0) + ENEMY_AI_DEFAULTS.buildCooldownTicks
  };
  const position = chooseEnemyExpansionPosition(game, map, context, structureType);
  if (!position) {
    return `Enemy ${structureType} expansion blocked: no buildable site`;
  }
  const result = placeStructureBuildOrder(game, map, {
    type: structureType,
    factionId: 'enemy',
    position
  });
  return result.ok ? `Enemy queued ${result.structure.name}` : `Enemy expansion waits: ${result.reason}`;
}

function chooseEnemyExpansionPosition(game, map, context, structureType) {
  const base = context.base;
  const target = context.target;
  if (!base || !target) {
    return null;
  }
  const origin = base.position ?? base.tile;
  const destination = target.position ?? target.tile;
  const dx = Math.sign(destination.x - origin.x);
  const dy = Math.sign(destination.y - origin.y);
  const candidates = [];
  for (let distance = 3; distance <= 7; distance += 1) {
    for (const offset of [-2, -1, 0, 1, 2]) {
      candidates.push({
        x: Math.round(origin.x + dx * distance + (dy !== 0 ? offset : 0)),
        y: Math.round(origin.y + dy * distance + (dx !== 0 ? offset : 0))
      });
    }
  }
  return candidates.find((candidate) => validateStructurePlacement(game, map, {
    type: structureType,
    factionId: 'enemy',
    position: candidate,
    checkConstructionAccess: false
  }).valid) ?? null;
}

function issueEnemyAttackOrders(game, map, context) {
  const target = context.target;
  if (!target) {
    return 'Enemy attack delayed: no friendly target';
  }
  const targetPosition = target.position ?? target.tile;
  const attackIds = new Set((context.readyFighters ?? []).map((squad) => squad.id));
  const basePosition = context.base?.position ?? context.base?.tile ?? null;
  game.squads = (game.squads ?? []).map((squad) => {
    if (!isEnemyFighterSquad(squad)) {
      return squad;
    }
    if (!attackIds.has(squad.id)) {
      if (!basePosition || isEnemyFighterReadyForAttack(squad)) {
        return squad;
      }
      return issueFactionMovementOrder(squad, basePosition, game.tick, {
        routeMode: 'ai-director',
        stance: 'hold',
        intent: 'regroup-for-food',
        lastDecision: 'Enemy regrouping near base while food recovers'
      });
    }
    return issueFactionMovementOrder(squad, targetPosition, game.tick, {
      routeMode: 'ai-director',
      stance: 'commit',
      intent: 'attack-friendly-structure',
      lastDecision: `Enemy attacking ${target.name ?? target.id}`
    });
  });
  game.enemyAI = {
    ...game.enemyAI,
    lastAttackOrderTick: game.tick ?? 0,
    lastAttackTargetId: target.id ?? null
  };
  return `Enemy attacking ${target.name ?? target.id}`;
}

function shouldRefreshEnemyAttackOrders(game, context) {
  const targetId = context.target?.id ?? null;
  if (!targetId) {
    return true;
  }
  if (game.enemyAI.lastAttackTargetId !== targetId) {
    return true;
  }
  const retargetTicks = Math.max(1, ENEMY_AI_DEFAULTS.attackRetargetTicks);
  if ((game.tick ?? 0) - game.enemyAI.lastAttackOrderTick < retargetTicks) {
    return false;
  }
  return context.readyFighters.some((squad) => {
    const order = normaliseMovementOrder(squad.movementOrder);
    return order?.routeMode !== 'ai-director' || tileDistance(order.target, context.target.position ?? context.target.tile) > 0.5;
  });
}

function findEnemyAttackTarget(game) {
  const completedFriendlyStructures = (game.structures ?? [])
    .filter((structure) => structure.factionId === 'player' && structure.construction?.state === CONSTRUCTION_STATES.complete);
  const enemyBase = (game.structures ?? []).find((structure) => structure.factionId === 'enemy' && structure.type === 'outpost');
  if (completedFriendlyStructures.length > 0) {
    const origin = enemyBase?.position ?? enemyBase?.tile ?? { x: 0, y: 0 };
    return completedFriendlyStructures
      .sort((a, b) => tileDistance(origin, a.position ?? a.tile) - tileDistance(origin, b.position ?? b.tile))[0];
  }
  return game.outposts.find((outpost) => outpost.factionId === 'player' && !outpost.contestable) ?? null;
}

function emitMovementSounds(game) {
  if ((game.tick ?? 0) % 2 !== 0) {
    return;
  }
  [...(game.leaders ?? []), ...(game.squads ?? [])].forEach((entity) => {
    if ((entity.movement?.lastStepTiles ?? 0) < 0.04) {
      return;
    }
    const noiseMultiplier = entity.stealth?.mobility?.noiseMultiplier ?? 1;
    emitPerceptionSound(game, {
      id: `sound_footstep_${entity.id}_${game.tick ?? 0}`,
      kind: 'footstep',
      sourceId: entity.id,
      sourceFactionId: entity.factionId,
      position: entity.position ?? entity.tile,
      audibleRadiusTiles: (entity.type === ENTITY_TYPES.squad ? 3.2 : 2.45) * noiseMultiplier,
      strength: (entity.type === ENTITY_TYPES.squad ? 0.38 : 0.29) * noiseMultiplier
    });
  });
}

function emitPerceptionSound(game, args = {}) {
  const event = appendSoundEvent(game, args);
  if (event.sourceFactionId !== 'player') {
    return event;
  }
  const investigate = (entity) => {
    if (entity.factionId !== 'enemy' || entity.health?.state === 'dead') {
      return entity;
    }
    const hearingRadius = Math.max(1, Number(entity.hearingRadius) || (entity.type === ENTITY_TYPES.leader ? LEADER_TEMPLATE.hearingRadius : getSquadTemplate(entity.unitId).hearingRadius));
    const audibleRadius = Math.min(hearingRadius, event.audibleRadiusTiles);
    if (tileDistance(entity.position ?? entity.tile, event.position) > audibleRadius) {
      return entity;
    }
    const ordered = issueFactionMovementOrder(entity, event.position, game.tick ?? 0, {
      routeMode: 'sound-investigation',
      stance: 'probe',
      intent: 'investigate-sound',
      lastDecision: `Investigating ${event.label.toLowerCase()}`
    });
    return {
      ...ordered,
      ai: normaliseAIEntityState({
        ...ordered.ai,
        perceptionState: 'investigating',
        flags: {
          ...(ordered.ai?.flags ?? {}),
          heardSoundId: event.id,
          heardSoundKind: event.kind
        }
      })
    };
  };
  game.leaders = (game.leaders ?? []).map(investigate);
  game.squads = (game.squads ?? []).map(investigate);
  return event;
}

function getCombatSystemDeps() {
  return {
    getCombatDefaultsForEntity,
    getHealthDefaultsForEntity,
    normaliseSquadSupply,
    normaliseStructure,
    normaliseSquad,
    createFieldSquadOccupancy,
    normaliseLeaderMovement,
    positionToTileFromPosition,
    canDetectTarget: (observer, target) => canObserverDetectEntity(observer, target),
    emitSoundEvent: emitPerceptionSound,
    emitRuntimeEvent,
    RUNTIME_EVENTS
  };
}

function getHealthDefaultsForEntity(entity) {
  if (entity?.type === ENTITY_TYPES.leader) {
    return { maxHealth: LEADER_TEMPLATE.health, armour: LEADER_TEMPLATE.armour };
  }
  if (entity?.type === ENTITY_TYPES.squad) {
    const template = getSquadTemplate(entity.unitId);
    return { maxHealth: template.health, armour: template.armour };
  }
  return { maxHealth: INFANTRY_SQUAD_TEMPLATE.health, armour: INFANTRY_SQUAD_TEMPLATE.armour };
}

function getCombatDefaultsForEntity(entity) {
  if (entity?.type === ENTITY_TYPES.leader) {
    return {
      enabled: true,
      weaponId: COMBAT_MODEL.weaponId,
      weaponProfile: 'command-spear',
      attackRange: LEADER_TEMPLATE.attackRange,
      baseDamage: LEADER_TEMPLATE.attackDamage,
      meleeRange: LEADER_TEMPLATE.meleeRange,
      meleeDamage: LEADER_TEMPLATE.meleeDamage,
      meleeRateOfFireTicks: LEADER_TEMPLATE.meleeRateOfFireTicks,
      rateOfFireTicks: LEADER_TEMPLATE.rateOfFireTicks,
      projectileSpeedTilesPerTick: LEADER_TEMPLATE.projectileSpeedTilesPerTick,
      accuracy: LEADER_TEMPLATE.accuracy,
      volleySize: 1
    };
  }
  const template = entity?.type === ENTITY_TYPES.squad ? getSquadTemplate(entity.unitId) : INFANTRY_SQUAD_TEMPLATE;
  return {
    enabled: entity?.unitId !== 'builder_crew',
    weaponId: COMBAT_MODEL.weaponId,
    weaponProfile: template.weaponProfile ?? 'bow',
    attackRange: template.attackRange,
    baseDamage: template.attackDamage,
    meleeRange: template.meleeRange,
    meleeDamage: template.meleeDamage,
    meleeRateOfFireTicks: template.meleeRateOfFireTicks,
    rateOfFireTicks: template.rateOfFireTicks,
    projectileSpeedTilesPerTick: template.projectileSpeedTilesPerTick,
    accuracy: template.accuracy,
    volleySize: entity?.members?.length ?? template.members
  };
}

function issueFactionMovementOrder(entity, target, tick, { routeMode = 'direct', stance = 'commit', intent = 'move', lastDecision = 'Move order issued' } = {}) {
  return issueFactionMovementOrderSystem(entity, target, tick, { routeMode, stance, intent, lastDecision }, getMovementOrderDeps());
}

function runEnemyBehaviour(game) {
  const objective = findPrimaryContestableOutpost(game);
  const enemy = game.leaders.find((leader) => leader.factionId === 'enemy');
  if (!objective || !enemy) {
    return;
  }

  const playerControl = objective.control?.player ?? 0.5;
  const playerPressure = objective.projectedPressure?.player ?? 0;
  const enemyPressure = objective.projectedPressure?.enemy ?? 0;
  let stance = 'probe';
  let lastDecision = 'Enemy probes the neutral route';

  if (objective.ownerFactionId === 'player' || playerControl >= 0.6) {
    stance = 'commit';
    lastDecision = 'Enemy commits to recover the contest node';
  } else if (objective.ownerFactionId === 'enemy' || playerControl <= 0.4) {
    stance = 'hold';
    lastDecision = 'Enemy holds while the player is off balance';
  } else if (enemyPressure + 0.02 < playerPressure) {
    stance = 'commit';
    lastDecision = 'Enemy counters stronger player pressure';
  }

  enemy.behavior = {
    ...normaliseLeaderBehavior(enemy.behavior, enemy.factionId),
    controller: 'ai',
    stance,
    intent: 'contest-objective',
    lastDecision
  };
}

function advanceLeaderMovement(game, map) {
  const objective = findPrimaryContestableOutpost(game);
  game.leaders = game.leaders.map((leader) => {
    const normalisedLeader = normaliseLeader(leader);
    bindRuntimeOwner(normalisedLeader, game);
    const outpost = findOutpostForLeader(game, normalisedLeader);
    const plan = evaluateLeaderMovementPlan(map, normalisedLeader, outpost, objective);
    return advanceMovableEntityMovementSystem(normalisedLeader, plan, map, game);
  });
}

function syncStructureOccupancy(game, map) {
  const squadsById = new Map((game.squads ?? []).map((squad) => [squad.id, normaliseSquad(squad)]));
  const seenOccupants = new Set();

  game.structures = (game.structures ?? []).map((structure) => {
    const normalised = normaliseStructure(structure);
    if (!normalised.occupancy?.enabled || normalised.construction?.state !== CONSTRUCTION_STATES.complete) {
      return normaliseStructure({
        ...normalised,
        occupancy: { ...normalised.occupancy, occupants: [] }
      });
    }
    const occupants = [];
    for (const occupantId of normalised.occupancy.occupants ?? []) {
      if (occupants.length >= normalised.occupancy.capacitySquads || seenOccupants.has(occupantId)) {
        continue;
      }
      const squad = squadsById.get(occupantId);
      if (!squad || !canSquadOccupyStructure(squad, normalised, { countExistingOccupant: true })) {
        continue;
      }
      occupants.push(occupantId);
      seenOccupants.add(occupantId);
    }
    return normaliseStructure({
      ...normalised,
      occupancy: { ...normalised.occupancy, occupants }
    });
  });

  const structuresById = new Map((game.structures ?? []).map((structure) => [structure.id, structure]));
  game.squads = (game.squads ?? []).map((squad) => {
    const normalised = normaliseSquad(squad);
    const hostingStructure = [...structuresById.values()].find((structure) => (structure.occupancy?.occupants ?? []).includes(normalised.id));
    if (hostingStructure) {
      return setSquadOccupiedInStructure(normalised, hostingStructure, game.tick ?? 0, map);
    }
    if (normalised.occupancy.state === SQUAD_OCCUPANCY_STATES.occupied) {
      return {
        ...normalised,
        occupancy: createFieldSquadOccupancy(),
        movement: normaliseLeaderMovement({ status: 'idle', target: normalised.position }, normalised.position),
        movementOrder: null,
        movementPath: null
      };
    }
    if (normalised.occupancy.state === SQUAD_OCCUPANCY_STATES.movingToOccupy) {
      const target = structuresById.get(normalised.occupancy.structureId);
      if (!target || !validateSquadOccupyStructure(normalised, target).valid) {
        return {
          ...normalised,
          occupancy: createFieldSquadOccupancy(),
          movementOrder: null,
          movementPath: null,
          behavior: {
            ...normaliseSquadBehavior(normalised.behavior, normalised.factionId),
            intent: 'support-objective',
            lastDecision: 'Occupancy order cancelled: target unavailable'
          }
        };
      }
    }
    return normalised;
  });
}

function canSquadOccupyStructure(squad, structure, { countExistingOccupant = false } = {}) {
  if (!squad || !structure) return false;
  if (squad.type !== ENTITY_TYPES.squad) return false;
  if (squad.factionId !== structure.factionId) return false;
  if (structure.construction?.state !== CONSTRUCTION_STATES.complete) return false;
  if (!structure.occupancy?.enabled || (structure.occupancy.capacitySquads ?? 0) <= 0) return false;
  const allowed = structure.combat?.allowedWeapons ?? [];
  if (allowed.length > 0 && !allowed.includes(squad.unitId)) return false;
  const occupants = structure.occupancy.occupants ?? [];
  if (occupants.includes(squad.id)) return true;
  return countExistingOccupant ? occupants.length <= structure.occupancy.capacitySquads : occupants.length < structure.occupancy.capacitySquads;
}

function validateSquadOccupyStructure(squad, structure) {
  if (!structure?.occupancy?.enabled) {
    return { valid: false, reason: 'not-occupiable', message: 'That structure cannot be occupied.' };
  }
  if (structure.construction?.state !== CONSTRUCTION_STATES.complete) {
    return { valid: false, reason: 'not-complete', message: 'Structure must be complete before squads can occupy it.' };
  }
  if (squad.factionId !== structure.factionId) {
    return { valid: false, reason: 'wrong-faction', message: 'Squads can only occupy friendly structures for now.' };
  }
  const allowed = structure.combat?.allowedWeapons ?? [];
  if (allowed.length > 0 && !allowed.includes(squad.unitId)) {
    return { valid: false, reason: 'unit-not-supported', message: `${structure.name ?? structure.type} cannot hold that unit type.` };
  }
  const occupants = structure.occupancy?.occupants ?? [];
  if (!occupants.includes(squad.id) && occupants.length >= (structure.occupancy.capacitySquads ?? 0)) {
    return { valid: false, reason: 'full', message: `${structure.name ?? structure.type} is full.` };
  }
  return { valid: true, reason: 'valid', message: 'Occupancy order accepted.' };
}

function findOccupiableStructureAtTile(game, tile, squad) {
  if (!tile) return null;
  return (game.structures ?? [])
    .map(normaliseStructure)
    .filter((structure) => validateSquadOccupyStructure(squad, structure).valid)
    .filter((structure) => tileDistance(structure.position ?? structure.tile, tile) <= getStructureSelectionRadius(structure))
    .sort((a, b) => tileDistance(a.position ?? a.tile, tile) - tileDistance(b.position ?? b.tile, tile))[0] ?? null;
}

function chooseStructureAccessPoint(structure, fromPosition, accessKind = 'entry') {
  const points = accessKind === 'exit' ? structure.occupancy?.exitPoints : structure.occupancy?.entryPoints;
  const candidates = points?.length ? points : [...(structure.occupancy?.entryPoints ?? []), ...(structure.occupancy?.exitPoints ?? [])];
  if (!candidates || candidates.length === 0) {
    return roundPosition(structure.position ?? structure.tile);
  }
  return candidates
    .map(roundPosition)
    .sort((a, b) => tileDistance(a, fromPosition) - tileDistance(b, fromPosition))[0];
}

function enterSquadStructure(game, map, squad, structure) {
  const validation = validateSquadOccupyStructure(squad, structure);
  if (!validation.valid) {
    return {
      ...squad,
      occupancy: createFieldSquadOccupancy(),
      movementOrder: null,
      movementPath: null
    };
  }
  game.structures = (game.structures ?? []).map((candidate) => {
    if (candidate.id !== structure.id) {
      return normaliseStructure(candidate);
    }
    const occupants = [...new Set([...(candidate.occupancy?.occupants ?? []), squad.id])].slice(0, candidate.occupancy?.capacitySquads ?? 0);
    return normaliseStructure({
      ...candidate,
      occupancy: {
        ...candidate.occupancy,
        occupants
      }
    });
  });
  return setSquadOccupiedInStructure(squad, structure, game.tick ?? 0, map);
}

function setSquadOccupiedInStructure(squad, structure, tick, map) {
  const position = roundPosition(structure.position ?? structure.tile);
  return {
    ...squad,
    position,
    tile: positionToTile(map, position),
    occupancy: {
      state: SQUAD_OCCUPANCY_STATES.occupied,
      structureId: structure.id,
      assignedAtTick: squad.occupancy?.assignedAtTick ?? tick,
      enteredAtTick: squad.occupancy?.enteredAtTick ?? tick
    },
    movement: normaliseLeaderMovement({
      status: 'garrisoned',
      target: position,
      targetMode: structure.occupancy?.mode ?? 'occupancy',
      speedTilesPerTick: 0,
      speedKph: 0,
      distanceToTarget: 0,
      lastStepTiles: 0
    }, position),
    movementOrder: null,
    movementPath: null,
    behavior: {
      ...normaliseSquadBehavior(squad.behavior, squad.factionId),
      stance: 'hold',
      intent: 'occupy-structure',
      lastDecision: `Occupying ${structure.name ?? structure.type}`
    }
  };
}

function resolveEvacuationPoint(map, game, structure, rawPoint, factionId) {
  const desired = roundPosition(rawPoint ?? structure.position ?? structure.tile);
  const tile = positionToTile(map, desired);
  if (isInBounds(map, tile.x, tile.y) && !isMovementBlocked(map, tile, game, factionId, { allowTile: positionToTile(map, structure.position ?? structure.tile) })) {
    return desired;
  }
  const fallback = findNearestNavigableTile(map, tile, game, factionId, positionToTile(map, structure.position ?? structure.tile));
  return fallback ? tileToPosition(fallback) : roundPosition(structure.position ?? structure.tile);
}

function advanceSquadMovement(game, map) {
  const objective = findPrimaryContestableOutpost(game);
  game.squads = (game.squads ?? []).map((squad) => {
    const normalisedSquad = normaliseSquad(squad);
    bindRuntimeOwner(normalisedSquad, game);
    if (isSquadOccupied(normalisedSquad)) {
      const structure = (game.structures ?? []).find((candidate) => candidate.id === normalisedSquad.occupancy.structureId);
      return structure ? setSquadOccupiedInStructure(normalisedSquad, structure, game.tick ?? 0, map) : {
        ...normalisedSquad,
        occupancy: createFieldSquadOccupancy(),
        movementOrder: null,
        movementPath: null
      };
    }
    if (isSquadMovingToOccupy(normalisedSquad)) {
      const structure = (game.structures ?? []).find((candidate) => candidate.id === normalisedSquad.occupancy.structureId);
      const entryPoint = structure ? chooseStructureAccessPoint(structure, normalisedSquad.position ?? normalisedSquad.tile, 'entry') : null;
      if (!structure || !validateSquadOccupyStructure(normalisedSquad, structure).valid) {
        return { ...normalisedSquad, occupancy: createFieldSquadOccupancy(), movementOrder: null, movementPath: null };
      }
      if (entryPoint && tileDistance(normalisedSquad.position ?? normalisedSquad.tile, entryPoint) <= OCCUPANCY_ENTRY_DISTANCE_TILES) {
        return enterSquadStructure(game, map, normalisedSquad, structure);
      }
    }
    const outpost = findOutpostForSquad(game, normalisedSquad);
    const plan = evaluateSquadMovementPlan(map, normalisedSquad, outpost, objective);
    return advanceMovableEntityMovementSystem(normalisedSquad, plan, map, game);
  });
}

function advanceConstructionJobs(game, map) {
  return advanceConstructionSystem(game, map, getConstructionSystemDeps());
}

function advanceResourceGathering(game, map) {
  game.resourceWorkers = syncResourceWorkersForGatheringStructures(game, map);
  const resourceFields = deriveCachedResourceFields(map, game);
  const incomeByFaction = {};

  addNativeOutpostResourceTrickle(game, map, incomeByFaction);

  game.resourceWorkers = (game.resourceWorkers ?? []).map((worker) => {
    const normalisedWorker = normaliseResourceWorker(worker);
    const structure = (game.structures ?? []).find((candidate) => candidate.id === normalisedWorker.homeStructureId);
    if (!structure || structure.construction?.state !== CONSTRUCTION_STATES.complete || !structure.gathering?.enabled) {
      return {
        ...normalisedWorker,
        state: RESOURCE_WORKER_STATES.idle,
        targetTile: null,
        carriedAmount: 0,
        movementPath: null
      };
    }

    if (structure.gathering.mode === 'outpost-native') {
      return advanceNativeOutpostResourceWorker(game, map, normalisedWorker, structure, incomeByFaction);
    }
    if (structure.gathering.mode === 'passive-field') {
      return advancePassiveResourceWorker(game, map, normalisedWorker, structure, resourceFields, incomeByFaction);
    }
    if (structure.gathering.mode === 'haul-forest') {
      return advanceHaulingResourceWorker(game, map, normalisedWorker, structure, resourceFields, incomeByFaction);
    }
    return normalisedWorker;
  });

  game.economy = applyResourceIncomeTick(game.economy, incomeByFaction, ['player', 'enemy']);
  game.resourceGatheringStats = summarizeResourceGathering(game);
}

function advanceSupplyLines(game, map) {
  return advanceLogisticsSystem(game, map, getLogisticsSystemDeps());
}

function syncResourceWorkersForGatheringStructures(game, map) {
  const existingWorkers = new Map((game.resourceWorkers ?? []).map((worker) => {
    const normalised = normaliseResourceWorker(worker);
    return [normalised.id, normalised];
  }));
  const workers = [];
  const structures = (game.structures ?? [])
    .map(normaliseStructure)
    .filter((structure) => structure.factionId === 'player' || structure.factionId === 'enemy')
    .filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.complete && structure.gathering?.enabled);

  structures.forEach((structure) => {
    const assigned = Math.max(0, structure.gathering.assignedWorkers ?? 0);
    for (let index = 0; index < assigned; index += 1) {
      const id = `resource_worker_${structure.id}_${index + 1}`;
      const existing = existingWorkers.get(id);
      const spawnPosition = getGatheringWorkerSpawnPosition(map, structure, index, assigned);
      const fallbackState = ['passive-field', 'outpost-native'].includes(structure.gathering.mode)
        ? RESOURCE_WORKER_STATES.gathering
        : RESOURCE_WORKER_STATES.outbound;
      workers.push(normaliseResourceWorker(existing ? {
        ...existing,
        factionId: structure.factionId,
        homeStructureId: structure.id,
        resourceId: structure.gathering.resourceId,
        name: existing.name ?? `${structure.name} Worker ${index + 1}`
      } : createResourceWorker({
        id,
        factionId: structure.factionId,
        name: `${structure.name} Worker ${index + 1}`,
        tile: structure.tile,
        position: spawnPosition,
        homeStructureId: structure.id,
        resourceId: structure.gathering.resourceId,
        state: fallbackState
      })));
    }
  });

  return workers;
}

function addNativeOutpostResourceTrickle(game, map, incomeByFaction) {
  (game.structures ?? [])
    .map(normaliseStructure)
    .filter((structure) => structure.type === 'outpost')
    .filter((structure) => structure.factionId === 'player' || structure.factionId === 'enemy')
    .filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.complete)
    .forEach((structure) => {
      Object.entries(OUTPOST_NATIVE_RESOURCE_TRICKLE).forEach(([resourceId, amount]) => {
        addGatheringIncome(incomeByFaction, structure.factionId, resourceId, amount, {
          structureId: structure.id,
          workerId: null,
          kind: 'outpost-native-trickle',
          tile: structure.tile,
          amount
        });
      });
    });
}

function advanceNativeOutpostResourceWorker(game, map, worker, structure, incomeByFaction) {
  const home = roundPosition(structure.position ?? structure.tile);
  return {
    ...worker,
    state: RESOURCE_WORKER_STATES.gathering,
    targetTile: structure.tile,
    carriedAmount: 0,
    lastDepositAmount: round3(Object.values(OUTPOST_NATIVE_RESOURCE_TRICKLE).reduce((sum, amount) => sum + amount, 0)),
    position: home,
    tile: positionToTile(map, home),
    movement: normaliseLeaderMovement({
      status: 'gathering',
      target: home,
      targetMode: 'outpost-native',
      speedTilesPerTick: 0,
      speedKph: 0,
      distanceToTarget: 0,
      lastStepTiles: 0
    }, home),
    movementPath: null
  };
}

function advancePassiveResourceWorker(game, map, worker, structure, resourceFields, incomeByFaction) {
  const resourceId = structure.gathering.resourceId ?? RESOURCE_IDS.food;
  const sourceValue = sampleResourceFieldAround(resourceFields.foodResource, structure.position, structure.gathering.radiusTiles);
  const amount = round3((structure.gathering.ratePerWorker ?? 0) * sourceValue);
  if (amount > 0) {
    addGatheringIncome(incomeByFaction, structure.factionId, resourceId, amount, {
      structureId: structure.id,
      workerId: worker.id,
      kind: 'hunting-field',
      tile: structure.tile,
      amount
    });
  }
  const home = roundPosition(structure.position ?? structure.tile);
  return {
    ...worker,
    state: RESOURCE_WORKER_STATES.gathering,
    targetTile: structure.tile,
    carriedAmount: 0,
    lastDepositAmount: amount,
    position: home,
    tile: positionToTile(map, home),
    movement: normaliseLeaderMovement({
      status: 'gathering',
      target: home,
      targetMode: 'food-field',
      speedTilesPerTick: 0,
      speedKph: 0,
      distanceToTarget: 0,
      lastStepTiles: 0
    }, home),
    movementPath: null
  };
}

function advanceHaulingResourceWorker(game, map, worker, structure, resourceFields, incomeByFaction) {
  const carrying = worker.carriedAmount > 0;
  const homePoint = getResourceDropoffPoint(game, map, structure, worker) ?? roundPosition(structure.position ?? structure.tile);
  if (carrying) {
    if (tileDistance(worker.position, homePoint) <= RESOURCE_WORKER_TEMPLATE.depositDistanceTiles) {
      const amount = round3(worker.carriedAmount);
      addGatheringIncome(incomeByFaction, structure.factionId, worker.resourceId, amount, {
        structureId: structure.id,
        workerId: worker.id,
        kind: 'wood-delivery',
        tile: worker.targetTile ?? structure.tile,
        amount
      });
      return {
        ...worker,
        state: RESOURCE_WORKER_STATES.outbound,
        carriedAmount: 0,
        lastDepositAmount: amount,
        targetTile: null,
        movementPath: null,
        movement: normaliseLeaderMovement({
          status: 'depositing',
          target: homePoint,
          targetMode: 'resource-dropoff',
          distanceToTarget: 0,
          lastStepTiles: 0
        }, worker.position)
      };
    }
    return moveResourceWorkerTowards(game, map, worker, homePoint, RESOURCE_WORKER_STATES.returning, 'resource-return');
  }

  const targetTile = worker.targetTile && isResourceTileUsable(map, game, worker.targetTile, structure.gathering.sourceTerrain, worker.factionId)
    ? worker.targetTile
    : findNearestResourceTile(map, game, worker.position, structure.gathering.sourceTerrain, worker.factionId, structure.gathering.radiusTiles);
  if (!targetTile) {
    return {
      ...worker,
      state: RESOURCE_WORKER_STATES.idle,
      targetTile: null,
      movementPath: null,
      movement: normaliseLeaderMovement({
        status: 'no-resource-tile',
        target: worker.position,
        targetMode: 'resource-search',
        distanceToTarget: 0,
        lastStepTiles: 0
      }, worker.position)
    };
  }

  const targetPosition = tileToPosition(targetTile);
  if (tileDistance(worker.position, targetPosition) <= RESOURCE_WORKER_TEMPLATE.arrivalDistanceTiles) {
    const fieldValue = resourceFields.woodResource.values[targetTile.y]?.[targetTile.x] ?? 0;
    const amount = round3(Math.min(structure.gathering.carryCapacity || 1, (structure.gathering.ratePerWorker ?? 0) * Math.max(0.2, fieldValue)));
    return {
      ...worker,
      state: RESOURCE_WORKER_STATES.returning,
      targetTile,
      carriedAmount: amount,
      lastDepositAmount: 0,
      movementPath: null,
      movement: normaliseLeaderMovement({
        status: 'harvesting',
        target: targetPosition,
        targetMode: 'forest-harvest',
        distanceToTarget: 0,
        lastStepTiles: 0
      }, worker.position)
    };
  }

  return moveResourceWorkerTowards(game, map, { ...worker, targetTile }, targetPosition, RESOURCE_WORKER_STATES.outbound, 'forest-source');
}

function moveResourceWorkerTowards(game, map, worker, targetPosition, state, targetMode) {
  const position = clampToMapPosition(map, worker.position);
  const movingWorker = bindRuntimeOwner(normaliseResourceWorker(worker), game);
  const target = resolveNavigableMovementTarget(map, movingWorker, position, clampToMapPosition(map, targetPosition));
  const movementPath = ensureMovementPath(map, movingWorker, position, target);
  const waypoint = getMovementPathWaypoint(movementPath, position, { map, game: movingWorker._runtimeOwner, entity: movingWorker });
  if (!waypoint) {
    return {
      ...worker,
      state: RESOURCE_WORKER_STATES.blocked,
      movementPath,
      movement: normaliseLeaderMovement({
        status: 'blocked',
        target,
        waypoint: null,
        targetMode,
        distanceToTarget: tileDistance(position, target),
        lastStepTiles: 0
      }, position)
    };
  }

  const sampleTile = positionToTile(map, position);
  const terrainField = getTerrainField(map, sampleTile.x, sampleTile.y);
  const terrainMultiplier = movementTerrainMultiplier(terrainField) / getStructureMovementCostModifier(game, map, sampleTile, worker.factionId);
  const speedTilesPerTick = Math.max(
    MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
    MOVEMENT_MODEL.baseFootSpeedTilesPerTick * worker.speedMultiplier * 0.7 * terrainMultiplier
  );
  const step = resolveMovementStep(map, game, movingWorker, position, waypoint, speedTilesPerTick);
  if (step.blocked) {
    return {
      ...worker,
      state: RESOURCE_WORKER_STATES.blocked,
      movementPath,
      movement: normaliseLeaderMovement({
        status: 'blocked',
        target,
        waypoint,
        targetMode,
        distanceToTarget: tileDistance(position, target),
        lastStepTiles: 0
      }, position)
    };
  }

  const nextPosition = roundPosition(step.position);
  return {
    ...worker,
    state,
    position: nextPosition,
    tile: positionToTile(map, nextPosition),
    movement: normaliseLeaderMovement({
      status: step.slidAxis ? `sliding-${step.slidAxis}` : 'moving',
      target,
      waypoint,
      targetMode,
      terrain: getTerrain(getTile(map, step.tile.x, step.tile.y)).id,
      distanceToTarget: tileDistance(nextPosition, target),
      lastStepTiles: tileDistance(position, nextPosition),
      speedTilesPerTick,
      speedKph: speedTilesPerTick * MOVEMENT_MODEL.tileMeters / MOVEMENT_MODEL.tickMinutes * 0.06,
      movementPath
    }, nextPosition),
    movementPath: advanceMovementPathCursor(movementPath, nextPosition)
  };
}

function addGatheringIncome(incomeByFaction, factionId, resourceId, amount, source) {
  if (!incomeByFaction[factionId]) {
    incomeByFaction[factionId] = {};
  }
  if (!incomeByFaction[factionId][resourceId]) {
    incomeByFaction[factionId][resourceId] = {
      resourceId,
      amount: 0,
      sources: []
    };
  }
  incomeByFaction[factionId][resourceId].amount = round3(incomeByFaction[factionId][resourceId].amount + amount);
  incomeByFaction[factionId][resourceId].sources.push(source);
}

function getGatheringWorkerSpawnPosition(map, structure, index, total) {
  const origin = structure.position ?? structure.tile;
  const angle = total > 0 ? (Math.PI * 2 * index) / total : 0;
  return roundPosition(clampToMapPosition(map, {
    x: origin.x + Math.cos(angle) * 0.48,
    y: origin.y + Math.sin(angle) * 0.48
  }));
}

function getResourceDropoffPoint(game, map, structure, worker) {
  const workerPosition = worker.position ?? worker.tile ?? structure.position;
  const candidates = getStructureWorkPointCandidates(structure)
    .filter((point) => isInBounds(map, Math.round(point.x), Math.round(point.y)))
    .filter((point) => !isMovementBlocked(map, positionToTile(map, point), game, worker.factionId, {
      allowTile: positionToTile(map, workerPosition)
    }));
  return (candidates.length > 0 ? candidates : [structure.position ?? structure.tile])
    .map(roundPosition)
    .sort((a, b) => tileDistance(a, workerPosition) - tileDistance(b, workerPosition))[0] ?? null;
}

function findNearestResourceTile(map, game, position, terrainIds = [], factionId = null, radius = 12) {
  const origin = positionToTile(map, position);
  const maxRadius = Math.max(1, Math.ceil(radius || Math.max(map.width, map.height)));
  let best = null;
  for (let y = Math.max(0, origin.y - maxRadius); y <= Math.min(map.height - 1, origin.y + maxRadius); y += 1) {
    for (let x = Math.max(0, origin.x - maxRadius); x <= Math.min(map.width - 1, origin.x + maxRadius); x += 1) {
      const tile = { x, y };
      if (!isResourceTileUsable(map, game, tile, terrainIds, factionId)) {
        continue;
      }
      const distance = tileDistance(position, tile);
      if (!best || distance < best.distance) {
        best = { tile, distance };
      }
    }
  }
  return best?.tile ?? null;
}

function isResourceTileUsable(map, game, tile, terrainIds = [], factionId = null) {
  if (!isInBounds(map, tile.x, tile.y)) {
    return false;
  }
  if (terrainIds.length > 0 && !terrainIds.includes(getTile(map, tile.x, tile.y))) {
    return false;
  }
  return !isMovementBlocked(map, tile, game, factionId);
}

function resolveSingleStructurePlacementRelation(type, existingStructure) {
  if (!existingStructure) {
    return { allowed: true, mode: 'new', inheritOrientation: false };
  }
  const canUse = canStructureUseExistingTile(type, existingStructure);
  if (!canUse) {
    return { allowed: false, mode: 'blocked', inheritOrientation: false };
  }
  const definition = getStructureDefinition(type);
  const builtOn = definition?.joinery?.builtOn ?? [];
  const shouldReplace = type === 'gate' && existingStructure.type === 'wall_segment';
  return {
    allowed: true,
    mode: shouldReplace ? 'replace' : builtOn.includes(existingStructure.type) ? 'build-on' : 'join-overlap',
    inheritOrientation: shouldReplace || builtOn.includes(existingStructure.type)
  };
}

function collectSinglePlacementConnectors(type, tile, structures = [], sameTileStructure = null) {
  return structures
    .filter((structure) => !sameTileStructure || structure.id !== sameTileStructure.id)
    .filter((structure) => canStructuresJoin(type, structure.type))
    .filter((structure) => areAdjacentOrSame(tile, structure.tile ?? structure.position))
    .map((structure) => createStructureConnector(structure, structure.tile ?? structure.position, 'adjacent', tile));
}

function refreshStructureJoineryConnections(structures = []) {
  const active = structures.filter((structure) => structure.construction?.state !== CONSTRUCTION_STATES.ruined);
  return structures.map((structure) => {
    if (structure.construction?.state === CONSTRUCTION_STATES.ruined) {
      return structure;
    }
    const preservedConnections = (structure.joinery?.connections ?? []).filter((connection) => (
      ['previous', 'next', 'replaces'].includes(connection.kind)
    ));
    const neighbours = active
      .filter((candidate) => candidate.id !== structure.id)
      .filter((candidate) => canStructuresJoin(structure.type, candidate.type))
      .filter((candidate) => areStructuresSocketAdjacent(structure, candidate))
      .map((candidate) => createStructureJoinConnection(structure, candidate));
    const connections = dedupeJoinConnections([...preservedConnections, ...neighbours]);
    return {
      ...structure,
      joinery: {
        ...structure.joinery,
        connections,
        joinMask: createJoinMask(connections)
      }
    };
  });
}

function areStructuresSocketAdjacent(a, b) {
  const aTile = a.tile ?? a.position;
  const bTile = b.tile ?? b.position;
  if (sameTile(aTile, bTile)) {
    return canStructureUseExistingTile(a.type, b) || canStructureUseExistingTile(b.type, a);
  }
  if (!areAdjacentOrSame(aTile, bTile)) {
    return socketsTouch(a, b);
  }

  const aProfile = getStructureJoinProfile(a.type);
  const bProfile = getStructureJoinProfile(b.type);
  const aIsPath = aProfile.placement === 'path';
  const bIsPath = bProfile.placement === 'path';
  const aIsAnchor = aProfile.placement === 'anchor';
  const bIsAnchor = bProfile.placement === 'anchor';

  if (aIsAnchor || bIsAnchor) {
    return true;
  }
  if (aIsPath && bIsPath) {
    return pathSocketsFaceEachOther(a, b);
  }
  if (aIsPath || bIsPath) {
    const pathStructure = aIsPath ? a : b;
    const other = aIsPath ? b : a;
    return pathStructureFaces(pathStructure, other);
  }
  return true;
}

function createStructureJoinConnection(source, target) {
  const sourceTile = source.tile ?? source.position;
  const targetTile = target.tile ?? target.position;
  const direction = directionFromTo(sourceTile, targetTile);
  const socket = resolveConnectionSocket(source, target, direction);
  return {
    kind: 'structure',
    direction,
    structureId: target.id,
    structureType: target.type,
    distance: tileDistance(sourceTile, targetTile),
    socket,
    socketRole: socket === 'same' ? 'built_on' : 'adjacent'
  };
}

function resolveConnectionSocket(source, target, fallbackDirection = 'same') {
  if (sameTile(source.tile ?? source.position, target.tile ?? target.position)) {
    return 'same';
  }
  const targetTile = target.tile ?? target.position;
  const exactSocket = getStructureSocketTiles(source).find((socket) => sameTile(socket.tile, targetTile));
  if (exactSocket) {
    return exactSocket.direction;
  }
  return fallbackDirection;
}

function socketsTouch(a, b) {
  const aSockets = getStructureSocketTiles(a);
  const bTile = b.tile ?? b.position;
  if (aSockets.some((socket) => sameTile(socket.tile, bTile))) {
    return true;
  }
  const bSockets = getStructureSocketTiles(b);
  const aTile = a.tile ?? a.position;
  return bSockets.some((socket) => sameTile(socket.tile, aTile));
}

function pathSocketsFaceEachOther(a, b) {
  const aTile = a.tile ?? a.position;
  const bTile = b.tile ?? b.position;
  const aToB = directionFromTo(aTile, bTile);
  const bToA = directionFromTo(bTile, aTile);
  return pathStructureExposesDirection(a, aToB) && pathStructureExposesDirection(b, bToA);
}

function pathStructureFaces(pathStructure, otherStructure) {
  const pathTile = pathStructure.tile ?? pathStructure.position;
  const otherTile = otherStructure.tile ?? otherStructure.position;
  return pathStructureExposesDirection(pathStructure, directionFromTo(pathTile, otherTile));
}

function pathStructureExposesDirection(structure, direction) {
  if (!direction || direction === 'same') {
    return true;
  }
  const socketDirections = getPathEndSocketDirections(structure);
  if (socketDirections.includes(direction)) {
    return true;
  }
  const junctionDirections = structure.joinery?.junction?.directions ?? [];
  return junctionDirections.includes(direction);
}


function getStructureSocketTiles(structure) {
  const definition = getStructureDefinition(structure?.type);
  const placement = definition?.joinery?.placement ?? structure?.joinery?.placement ?? 'single';
  const position = structure?.tile ?? structure?.position ?? { x: 0, y: 0 };
  const directions = placement === 'path'
    ? getPathEndSocketDirections(structure)
    : ['n', 'e', 's', 'w'];
  return directions.map((direction) => ({
    direction,
    tile: offsetTile(position, direction)
  }));
}

function getPathEndSocketDirections(structure) {
  const tangent = structure?.orientation?.tangent ?? { x: 1, y: 0 };
  const forward = directionFromTo({ x: 0, y: 0 }, { x: tangent.x, y: tangent.y });
  const backward = directionFromTo({ x: 0, y: 0 }, { x: -tangent.x, y: -tangent.y });
  return forward === backward ? [forward] : [forward, backward];
}

function offsetTile(tile, direction) {
  const offsets = {
    n: { x: 0, y: -1 },
    e: { x: 1, y: 0 },
    s: { x: 0, y: 1 },
    w: { x: -1, y: 0 },
    ne: { x: 1, y: -1 },
    nw: { x: -1, y: -1 },
    se: { x: 1, y: 1 },
    sw: { x: -1, y: 1 },
    same: { x: 0, y: 0 }
  }[direction] ?? { x: 0, y: 0 };
  return { x: Math.round((tile?.x ?? 0) + offsets.x), y: Math.round((tile?.y ?? 0) + offsets.y) };
}

function dedupeJoinConnections(connections = []) {
  const seen = new Set();
  const out = [];
  connections.forEach((connection) => {
    const key = `${connection.kind}:${connection.structureId ?? 'none'}:${connection.structureType ?? 'none'}:${connection.direction}:${connection.socket ?? 'none'}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(connection);
    }
  });
  return out;
}

function sameTile(a, b) {
  return Math.round(a?.x ?? -9999) === Math.round(b?.x ?? -9998)
    && Math.round(a?.y ?? -9999) === Math.round(b?.y ?? -9998);
}

function dedupeTiles(tiles = []) {
  const seen = new Set();
  const out = [];
  tiles.forEach((tile) => {
    const key = `${tile.x},${tile.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ x: tile.x, y: tile.y });
    }
  });
  return out;
}

function createStructureConnector(structure, tile, mode = 'adjacent', originTile = null) {
  const connectorTile = { x: Math.round(tile.x), y: Math.round(tile.y) };
  const socket = originTile ? directionFromTo(connectorTile, originTile) : null;
  return {
    id: structure.id,
    type: structure.type,
    factionId: structure.factionId,
    mode,
    tile: connectorTile,
    position: roundPosition(structure.position ?? tile),
    socket,
    socketRole: mode === 'built-on' ? 'built_on' : 'adjacent'
  };
}

function dedupeConnectors(connectors = []) {
  const seen = new Set();
  const out = [];
  connectors.forEach((connector) => {
    const key = `${connector.id}:${connector.mode}:${connector.tile?.x},${connector.tile?.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(connector);
    }
  });
  return out;
}

function structureFootprintsOverlap(a, b) {
  const aShape = createPlacementShape(a);
  const bShape = createPlacementShape(b);
  if (aShape.kind === 'circle' && bShape.kind === 'circle') {
    return tileDistance(aShape.center, bShape.center) < (aShape.radius + bShape.radius + 0.08);
  }
  if (aShape.kind === 'circle') {
    return circleOverlapsRect(aShape, bShape);
  }
  if (bShape.kind === 'circle') {
    return circleOverlapsRect(bShape, aShape);
  }
  return orientedRectsOverlap(aShape, bShape);
}

function createPlacementShape(structure) {
  const footprint = structure?.footprint ?? {};
  const center = structure?.position ?? structure?.tile ?? { x: 0, y: 0 };
  if (footprint.shape === 'circle') {
    return {
      kind: 'circle',
      center,
      radius: Math.max(0.42, Number(footprint.radius) || (Number(footprint.width) || 1) / 2)
    };
  }
  const width = Math.max(0.35, Number(footprint.width) || 1);
  const height = Math.max(0.28, Number(footprint.height) || 1);
  const angle = Number(structure?.orientation?.angleRadians) || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    kind: 'rect',
    center,
    halfWidth: width / 2,
    halfHeight: height / 2,
    axes: [
      { x: cos, y: sin },
      { x: -sin, y: cos }
    ]
  };
}

function circleOverlapsRect(circle, rect) {
  const dx = circle.center.x - rect.center.x;
  const dy = circle.center.y - rect.center.y;
  const localX = dx * rect.axes[0].x + dy * rect.axes[0].y;
  const localY = dx * rect.axes[1].x + dy * rect.axes[1].y;
  const closestX = Math.max(-rect.halfWidth, Math.min(rect.halfWidth, localX));
  const closestY = Math.max(-rect.halfHeight, Math.min(rect.halfHeight, localY));
  const outX = localX - closestX;
  const outY = localY - closestY;
  return (outX * outX + outY * outY) < ((circle.radius + 0.08) ** 2);
}

function orientedRectsOverlap(a, b) {
  const axes = [...a.axes, ...b.axes];
  return axes.every((axis) => projectionsOverlap(projectRect(a, axis), projectRect(b, axis), 0.02));
}

function projectRect(rect, axis) {
  const center = rect.center.x * axis.x + rect.center.y * axis.y;
  const radius = rect.halfWidth * Math.abs(rect.axes[0].x * axis.x + rect.axes[0].y * axis.y)
    + rect.halfHeight * Math.abs(rect.axes[1].x * axis.x + rect.axes[1].y * axis.y);
  return { min: center - radius, max: center + radius };
}

function projectionsOverlap(a, b, padding = 0) {
  return a.max > b.min + padding && b.max > a.min + padding;
}


function validatePlacementFootprintSupport(map, structure) {
  const tiles = getPlacementSupportTiles(map, structure);
  const badTile = tiles.find((tile) => {
    if (!isInBounds(map, tile.x, tile.y)) {
      return true;
    }
    const field = getTerrainField(map, tile.x, tile.y);
    return field.passability < 0.42 || field.water >= 0.75;
  });
  if (badTile) {
    return {
      valid: false,
      reason: 'unbuildable-footprint',
      message: 'Blueprint footprint needs stable ground'
    };
  }
  return { valid: true, reason: 'buildable-footprint', message: 'Blueprint footprint supported', tiles };
}

function getPlacementSupportTiles(map, structure) {
  if (structure?.footprint?.shape === 'line') {
    return [positionToTile(map, structure.position ?? structure.tile)];
  }
  const shape = createPlacementShape(structure);
  const radius = shape.kind === 'circle'
    ? Math.max(0.45, shape.radius)
    : Math.max(0.45, Math.hypot(shape.halfWidth, shape.halfHeight));
  const center = shape.kind === 'circle' ? shape.center : shape.center;
  const tiles = [];
  for (let y = Math.floor(center.y - radius); y <= Math.ceil(center.y + radius); y += 1) {
    for (let x = Math.floor(center.x - radius); x <= Math.ceil(center.x + radius); x += 1) {
      const tile = { x, y };
      if (shapeContainsTile(shape, tile)) {
        tiles.push(tile);
      }
    }
  }
  return tiles.length > 0 ? tiles : [positionToTile(map, center)];
}

function shapeContainsTile(shape, tile) {
  if (shape.kind === 'circle') {
    return tileDistance(shape.center, tile) <= Math.max(0.45, shape.radius);
  }
  const dx = tile.x - shape.center.x;
  const dy = tile.y - shape.center.y;
  const localX = dx * shape.axes[0].x + dy * shape.axes[0].y;
  const localY = dx * shape.axes[1].x + dy * shape.axes[1].y;
  return Math.abs(localX) <= Math.max(0.45, shape.halfWidth)
    && Math.abs(localY) <= Math.max(0.45, shape.halfHeight);
}

function createPlacementValidation(valid, reason, message) {
  return {
    valid,
    reason,
    message,
    cost: 0,
    sourceBaseId: null,
    position: null,
    tile: null,
    structureType: null
  };
}

export function summarizeConstruction(game) {
  return summarizeConstructionSystem(game);
}

export function summarizeResourceGathering(game) {
  const structures = (game?.structures ?? []).filter((structure) => structure.gathering?.enabled);
  const completed = structures.filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.complete);
  const workers = game?.resourceWorkers ?? [];
  return {
    gatheringStructures: structures.length,
    completedGatheringStructures: completed.length,
    assignedWorkers: workers.length,
    workersByState: Object.fromEntries(Object.values(RESOURCE_WORKER_STATES).map((state) => [
      state,
      workers.filter((worker) => worker.state === state).length
    ])),
    activeRoutes: workers.filter((worker) => worker.state === RESOURCE_WORKER_STATES.outbound || worker.state === RESOURCE_WORKER_STATES.returning).length,
    carriedWood: round3(workers
      .filter((worker) => worker.resourceId === RESOURCE_IDS.wood)
      .reduce((sum, worker) => sum + (worker.carriedAmount ?? 0), 0)),
    structures: completed.map((structure) => ({
      id: structure.id,
      type: structure.type,
      factionId: structure.factionId,
      resourceId: structure.gathering.resourceId,
      assignedWorkers: structure.gathering.assignedWorkers,
      mode: structure.gathering.mode
    }))
  };
}

export function summarizeSupplyLines(game) {
  return summarizeSupplyLinesSystem(game, getLogisticsSystemDeps());
}

function evaluateLeaderMovementPlan(map, leader, outpost, objective) {
  const position = clampToMapPosition(map, getLeaderPosition(leader));
  const target = getLeaderMovementTarget(leader, outpost, objective);
  const targetPosition = resolveNavigableMovementTarget(map, leader, position, clampToMapPosition(map, target ?? position));
  const sampleTile = positionToTile(map, position);
  const terrain = getTerrain(getTile(map, sampleTile.x, sampleTile.y));
  const terrainField = getTerrainField(map, sampleTile.x, sampleTile.y);
  const stance = getStance(leader);
  const terrainMultiplier = movementTerrainMultiplier(terrainField) / getStructureMovementCostModifier(leader._runtimeOwner, map, sampleTile, leader.factionId);
  const movementPath = ensureMovementPath(map, leader, position, targetPosition);
  const waypoint = getMovementPathWaypoint(movementPath, position, { map, game: leader._runtimeOwner, entity: leader });
  const blocked = isMovementBlocked(map, sampleTile, leader._runtimeOwner, leader.factionId, { allowTile: positionToTile(map, position) }) || !waypoint;
  const speedTilesPerTick = blocked
    ? 0
    : Math.max(
      MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
      MOVEMENT_MODEL.baseFootSpeedTilesPerTick * stance.moveMultiplier * terrainMultiplier * getMobilityProfile(leader).speedMultiplier
    );
  const speedMetersPerMinute = speedTilesPerTick * MOVEMENT_MODEL.tileMeters / MOVEMENT_MODEL.tickMinutes;

  return {
    target: roundPosition(targetPosition),
    waypoint: waypoint ? roundPosition(waypoint) : null,
    targetMode: stance.targetMode,
    position: roundPosition(position),
    terrain: terrain.id,
    blocked,
    speedTilesPerTick: round3(speedTilesPerTick),
    speedKph: round3(speedMetersPerMinute * 0.06),
    status: blocked ? 'blocked' : 'moving',
    distanceToTarget: round3(tileDistance(position, targetPosition)),
    lastStepTiles: 0,
    movementPath
  };
}

function evaluateSquadMovementPlan(map, squad, outpost, objective) {
  const position = clampToMapPosition(map, getEntityPosition(squad));
  const target = getSquadMovementTarget(squad, outpost, objective);
  const targetPosition = resolveNavigableMovementTarget(map, squad, position, clampToMapPosition(map, target ?? position));
  const sampleTile = positionToTile(map, position);
  const terrain = getTerrain(getTile(map, sampleTile.x, sampleTile.y));
  const terrainField = getTerrainField(map, sampleTile.x, sampleTile.y);
  const stance = getStance(squad);
  const terrainMultiplier = movementTerrainMultiplier(terrainField) / getStructureMovementCostModifier(squad._runtimeOwner, map, sampleTile, squad.factionId);
  const movementPath = ensureMovementPath(map, squad, position, targetPosition);
  const waypoint = getMovementPathWaypoint(movementPath, position, { map, game: squad._runtimeOwner, entity: squad });
  const blocked = isMovementBlocked(map, sampleTile, squad._runtimeOwner, squad.factionId, { allowTile: positionToTile(map, position) }) || !waypoint;
  const speedTilesPerTick = blocked
    ? 0
    : Math.max(
      MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
      MOVEMENT_MODEL.baseFootSpeedTilesPerTick * squad.speedMultiplier * stance.moveMultiplier * terrainMultiplier * getMobilityProfile(squad).speedMultiplier
    );
  const speedMetersPerMinute = speedTilesPerTick * MOVEMENT_MODEL.tileMeters / MOVEMENT_MODEL.tickMinutes;

  return {
    target: roundPosition(targetPosition),
    waypoint: waypoint ? roundPosition(waypoint) : null,
    targetMode: stance.targetMode,
    position: roundPosition(position),
    terrain: terrain.id,
    blocked,
    speedTilesPerTick: round3(speedTilesPerTick),
    speedKph: round3(speedMetersPerMinute * 0.06),
    status: blocked ? 'blocked' : 'moving',
    distanceToTarget: round3(tileDistance(position, targetPosition)),
    lastStepTiles: 0,
    movementPath
  };
}

function getLeaderMovementTarget(leader, outpost, objective) {
  const orderTarget = leader.movementOrder?.target;
  if (orderTarget) {
    return orderTarget;
  }

  const anchor = outpost?.tile ?? getLeaderTile(leader);
  if (!objective) {
    return tileToPosition(anchor);
  }

  const stance = getStance(leader);
  if (stance.targetMode === 'anchor') {
    return tileToPosition(anchor);
  }
  if (stance.targetMode === 'staging') {
    return {
      x: anchor.x + (objective.tile.x - anchor.x) * 0.65,
      y: anchor.y + (objective.tile.y - anchor.y) * 0.65
    };
  }
  return tileToPosition(objective.tile);
}

function getSquadMovementTarget(squad, outpost, objective) {
  if (isSquadMovingToOccupy(squad)) {
    const structure = (squad._runtimeOwner?.structures ?? []).find((candidate) => candidate.id === squad.occupancy.structureId);
    if (structure) {
      return chooseStructureAccessPoint(structure, squad.position ?? squad.tile, 'entry');
    }
  }
  const orderTarget = squad.movementOrder?.target;
  if (orderTarget) {
    return orderTarget;
  }

  const anchor = outpost?.tile ?? squad.tile;
  if (!objective) {
    return tileToPosition(anchor);
  }

  const stance = getStance(squad);
  if (stance.targetMode === 'anchor') {
    return tileToPosition(anchor);
  }
  if (stance.targetMode === 'staging') {
    return {
      x: anchor.x + (objective.tile.x - anchor.x) * 0.55,
      y: anchor.y + (objective.tile.y - anchor.y) * 0.55
    };
  }
  return tileToPosition(objective.tile);
}

function ensureMovementPath(map, entity, position, target) {
  return ensureMovementPathSystem(map, entity, position, target, getMovementPathDeps());
}

function entityPathMapSignature(map) {
  return map.mapRef?.tileSignature ?? `${map.width}x${map.height}:${map.tiles.map((row) => row.join(',')).join('|')}`;
}

function buildNavigationFlowField(map, target, game = null, factionId = null) {
  const goal = positionToTile(map, target);
  if (!isInBounds(map, goal.x, goal.y) || isMovementBlocked(map, goal, game, factionId)) {
    return {
      target: roundPosition(target),
      nextByTile: new Map(),
      reachable: false
    };
  }

  const frontier = [];
  pushPriority(frontier, { tile: goal, priority: 0 });
  const costSoFar = new Map([[tileKey(goal), 0]]);
  const nextByTile = new Map([[tileKey(goal), goal]]);
  let visitedTiles = 0;
  let pushedTiles = 1;
  const directions = [
    { x: 1, y: 0, cost: 1 },
    { x: -1, y: 0, cost: 1 },
    { x: 0, y: 1, cost: 1 },
    { x: 0, y: -1, cost: 1 },
    { x: 1, y: 1, cost: Math.SQRT2 },
    { x: 1, y: -1, cost: Math.SQRT2 },
    { x: -1, y: 1, cost: Math.SQRT2 },
    { x: -1, y: -1, cost: Math.SQRT2 }
  ];

  while (frontier.length > 0) {
    const entry = popPriority(frontier);
    const current = entry.tile;
    const currentKey = tileKey(current);
    if (entry.priority > (costSoFar.get(currentKey) ?? Number.POSITIVE_INFINITY) + 0.0001) {
      continue;
    }
    visitedTiles += 1;

    directions.forEach((direction) => {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!canTraverseTileStep(map, current, next, game, factionId)) {
        return;
      }

      const terrainField = getTerrainField(map, next.x, next.y);
      const currentCost = costSoFar.get(tileKey(current));
      const slopeCost = 1 + getElevationSlope(map, next.x, next.y) * 1.35;
      const structureCost = getStructureMovementCostModifier(game, map, next, factionId);
      const corpseCost = getCorpseMovementCostModifier(game, next);
      const newCost = currentCost + (direction.cost * slopeCost * structureCost * corpseCost) / movementTerrainMultiplier(terrainField);
      const key = tileKey(next);
      if (!costSoFar.has(key) || newCost < costSoFar.get(key)) {
        costSoFar.set(key, newCost);
        nextByTile.set(key, current);
        pushPriority(frontier, {
          tile: next,
          priority: newCost
        });
        pushedTiles += 1;
      }
    });
  }

  return {
    target: roundPosition(target),
    nextByTile,
    visitedTiles,
    pushedTiles,
    reachable: true
  };
}

function pushPriority(heap, entry) {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].priority <= heap[index].priority) {
      break;
    }
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function popPriority(heap) {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length > 0 && last) {
    heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && heap[left].priority < heap[smallest].priority) {
        smallest = left;
      }
      if (right < heap.length && heap[right].priority < heap[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return first;
}

function materialiseFlowRoute(flow, position, target) {
  const start = positionToTileFromPosition(position);
  const goal = positionToTileFromPosition(target);
  const startKey = tileKey(start);
  if (!flow?.reachable || !flow.nextByTile) {
    return [];
  }

  const nodes = [roundPosition(position)];
  let current = start;
  if (!flow.nextByTile.has(startKey)) {
    const exit = findNearestFlowExitTile(flow, start);
    if (!exit) {
      return [];
    }
    nodes.push(tileToPosition(exit));
    current = exit;
  }
  let guard = 0;
  const maxSteps = Math.max(1, flow.nextByTile.size + 1);
  while (!(current.x === goal.x && current.y === goal.y) && guard < maxSteps) {
    const next = flow.nextByTile.get(tileKey(current));
    if (!next) {
      return [];
    }
    nodes.push(tileToPosition(next));
    current = next;
    guard += 1;
  }

  const targetPosition = roundPosition(target);
  const simplified = simplifyPath(nodes).map(roundPosition);
  const finalNode = simplified[simplified.length - 1];
  if (finalNode && tileDistance(finalNode, targetPosition) > 0.001) {
    simplified[simplified.length - 1] = targetPosition;
  }
  return simplified;
}

function findNearestFlowExitTile(flow, tile) {
  const candidates = [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
    { x: tile.x + 1, y: tile.y + 1 },
    { x: tile.x + 1, y: tile.y - 1 },
    { x: tile.x - 1, y: tile.y + 1 },
    { x: tile.x - 1, y: tile.y - 1 }
  ];
  return candidates
    .filter((candidate) => flow.nextByTile.has(tileKey(candidate)))
    .sort((a, b) => tileDistance(a, flow.target) - tileDistance(b, flow.target))[0] ?? null;
}

function positionToTileFromPosition(position) {
  return {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };
}

function updateContestableOutposts(game, map, { resolveContest = false } = {}) {
  game.outposts = game.outposts.map((outpost) => {
    if (!outpost.contestable) {
      return outpost;
    }

    const pressures = Object.fromEntries(['player', 'enemy'].map((factionId) => {
      const leader = game.leaders.find((candidate) => candidate.factionId === factionId);
      const projection = leader ? evaluateObjectiveProjection(map, leader, outpost, leader.command) : null;
      const squadPressure = (game.squads ?? [])
        .filter((squad) => squad.factionId === factionId)
        .reduce((sum, squad) => sum + evaluateSquadObjectivePressure(map, squad, outpost), 0);
      return [factionId, (projection ? projection.value * getStance(leader).contestMultiplier : 0) + squadPressure];
    }));
    const delta = resolveContest ? clamp(-0.08, 0.08, (pressures.player - pressures.enemy) * 0.12) : 0;
    const playerControl = clamp01((outpost.control?.player ?? 0.5) + delta);
    const control = {
      player: round3(playerControl),
      enemy: round3(1 - playerControl)
    };
    const ownerFactionId = playerControl >= 0.72
      ? 'player'
      : playerControl <= 0.28
        ? 'enemy'
        : null;
    const projectedPressure = {
      player: round3(pressures.player),
      enemy: round3(pressures.enemy)
    };

    return {
      ...outpost,
      factionId: ownerFactionId ?? 'neutral',
      ownerFactionId,
      control,
      projectedPressure,
      status: getOutpostStatus({ contestable: true, ownerFactionId, control, projectedPressure })
    };
  });
}

function evaluateObjectiveProjection(map, leader, objective, command = leader.command) {
  if (!leader || !objective || !command) {
    return null;
  }
  const terrainField = getTerrainField(map, objective.tile.x, objective.tile.y);
  const distance = tileDistance(getLeaderPosition(leader), objective.tile);
  const distanceFactor = clamp01(1 - distance / Math.max(1, command.influenceRadius * 2.7));
  const commandFactor = command.score / 100;
  const terrainFactor = clamp01(0.2 + terrainField.passability * 0.28 + terrainField.logistics * 0.28 + terrainField.cover * 0.1 + terrainField.height * 0.14);
  const supplyFactor = clamp01(0.45 + (objective.supply ?? 0.5) * 0.55);
  const stance = getStance(leader);
  return {
    objectiveId: objective.id,
    objectiveTile: { ...objective.tile },
    distance: round3(distance),
    stance: stance.id,
    value: round3(commandFactor * distanceFactor * terrainFactor * supplyFactor * stance.objectiveMultiplier)
  };
}

function evaluateSquadObjectivePressure(map, squad, objective) {
  if (!squad || !objective) {
    return 0;
  }
  const terrainField = getTerrainField(map, objective.tile.x, objective.tile.y);
  const distance = tileDistance(getEntityPosition(squad), objective.tile);
  const distanceFactor = clamp01(1 - distance / Math.max(1, squad.influenceRadius * 2.4));
  const attributes = squad.attributes ?? {};
  const combatFactor = clamp01(((attributes.firepower ?? 0.5) * 0.36) + ((attributes.cohesion ?? 0.5) * 0.28) + ((attributes.morale ?? 0.5) * 0.2) + ((attributes.discipline ?? 0.5) * 0.16));
  const terrainFactor = clamp01(0.2 + terrainField.passability * 0.22 + terrainField.cover * 0.26 + terrainField.height * 0.14 + terrainField.logistics * 0.16);
  return round3(combatFactor * distanceFactor * terrainFactor * getStance(squad).contestMultiplier * 0.62);
}

function getStance(leader) {
  return PRESSURE_STANCES[normalisePressureStance(leader?.behavior?.stance)] ?? PRESSURE_STANCES.probe;
}

function strongestObjectivePressureAtTile(tile, playerEntities, enemyEntities) {
  const player = playerEntities.reduce((best, entity) => Math.max(best, entityPathPressureAtTile(tile, entity)), 0);
  const enemy = enemyEntities.reduce((best, entity) => Math.max(best, entityPathPressureAtTile(tile, entity)), 0);
  return Math.max(player, enemy, Math.min(player, enemy) * 1.2);
}

function entityPathPressureAtTile(tile, entity) {
  const objective = findPathPressureObjective(entity);
  if (!objective || objective.value <= 0) return 0;
  const start = getEntityPosition(entity);
  const end = objective.tile;
  const length = Math.max(0.001, tileDistance(start, end));
  const distanceFromLine = distanceToSegment(tile, start, end);
  const along = projectionAlongSegment(tile, start, end);
  if (along < -0.02 || along > 1.02 || distanceFromLine > 3.2) {
    return 0;
  }
  const corridor = clamp01(1 - distanceFromLine / 3.2);
  const taper = clamp01(1 - Math.abs(along - 0.5) * 0.35);
  return objective.value * corridor * taper * clamp01(length / Math.max(1, length));
}

function findPathPressureObjective(entity) {
  if (entity.type === ENTITY_TYPES.leader && entity.objectiveProjection?.objectiveTile) {
    return {
      tile: entity.objectiveProjection.objectiveTile,
      value: entity.objectiveProjection.value
    };
  }
  if (entity.type === ENTITY_TYPES.squad && entity.movement?.target) {
    return {
      tile: entity.movement.target,
      value: clamp01(getEntityInfluenceScore(entity) / 100) * 0.42
    };
  }
  return null;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t = projectionAlongSegment(point, start, end);
  const clampedT = clamp01(t);
  const closest = {
    x: start.x + dx * clampedT,
    y: start.y + dy * clampedT
  };
  return tileDistance(point, closest);
}

function projectionAlongSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) {
    return 0;
  }
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
}

function collectIsoIntersections(corners, isoValue) {
  const edges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]]
  ];
  const intersections = [];

  edges.forEach(([start, end]) => {
    const startDelta = start.value - isoValue;
    const endDelta = end.value - isoValue;
    if (startDelta === 0 && endDelta === 0) {
      return;
    }
    if (startDelta === 0) {
      intersections.push({ x: round3(start.x), y: round3(start.y) });
      return;
    }
    if (endDelta === 0) {
      intersections.push({ x: round3(end.x), y: round3(end.y) });
      return;
    }
    if (startDelta * endDelta > 0) {
      return;
    }
    intersections.push(lerpIsoPoint(start, end, isoValue));
  });

  return dedupePoints(intersections);
}

function createFrontlineCorner(fields, x, y) {
  const rawPlayer = fields.playerCommandRaw?.values[y][x] ?? fields.playerCommand.values[y][x];
  const rawEnemy = fields.enemyCommandRaw?.values[y][x] ?? fields.enemyCommand.values[y][x];
  return {
    x,
    y,
    value: fields.control.values[y][x],
    pressure: fields.frontPressure.values[y][x],
    rawMass: rawPlayer + rawEnemy
  };
}

function deriveLeaderBisectorFrontline(map, game) {
  const player = game.leaders.find((leader) => leader.factionId === 'player');
  const enemy = game.leaders.find((leader) => leader.factionId === 'enemy');
  if (!player || !enemy) {
    return [];
  }
  const playerPosition = getLeaderPosition(player);
  const enemyPosition = getLeaderPosition(enemy);
  const dx = enemyPosition.x - playerPosition.x;
  const dy = enemyPosition.y - playerPosition.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) {
    return [];
  }

  const totalCommand = Math.max(1, (player.commandScore ?? 0) + (enemy.commandScore ?? 0));
  const commandWeightedT = clamp(0.35, 0.65, (enemy.commandScore ?? 0) / totalCommand);
  const centre = {
    x: lerp(playerPosition.x, enemyPosition.x, commandWeightedT),
    y: lerp(playerPosition.y, enemyPosition.y, commandWeightedT)
  };
  const perp = { x: -dy / distance, y: dx / distance };
  const clippedLine = clipLineToMap(map, centre, perp);
  if (!clippedLine) {
    return [];
  }
  const segmentCount = 18;
  const segments = [];
  const pressure = round3(Math.max(0.04, Math.min(player.objectiveProjection?.value ?? 0, enemy.objectiveProjection?.value ?? 0) * 0.7));
  const objective = findPrimaryContestableOutpost(game);
  const curveControl = objective
    ? {
      x: lerp(centre.x, objective.tile.x, 0.82),
      y: lerp(centre.y, objective.tile.y, 0.82)
    }
    : centre;

  for (let index = 0; index < segmentCount; index += 1) {
    const t0 = index / segmentCount;
    const t1 = (index + 1) / segmentCount;
    const start = quadraticPoint(clippedLine.start, curveControl, clippedLine.end, t0);
    const end = quadraticPoint(clippedLine.start, curveControl, clippedLine.end, t1);
    if (tileDistance(start, end) > 0.05) {
      segments.push({
        start: roundPosition(start),
        end: roundPosition(end),
        pressure
      });
    }
  }

  return segments;
}

function clipLineToMap(map, point, direction) {
  let tMin = Number.NEGATIVE_INFINITY;
  let tMax = Number.POSITIVE_INFINITY;
  const bounds = [
    { min: 0, max: map.width - 1, point: point.x, direction: direction.x },
    { min: 0, max: map.height - 1, point: point.y, direction: direction.y }
  ];

  for (const bound of bounds) {
    if (Math.abs(bound.direction) < 0.0001) {
      if (bound.point < bound.min || bound.point > bound.max) {
        return null;
      }
      continue;
    }
    const t1 = (bound.min - bound.point) / bound.direction;
    const t2 = (bound.max - bound.point) / bound.direction;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin >= tMax) {
    return null;
  }
  return {
    start: roundPosition({
      x: point.x + direction.x * tMin,
      y: point.y + direction.y * tMin
    }),
    end: roundPosition({
      x: point.x + direction.x * tMax,
      y: point.y + direction.y * tMax
    })
  };
}

function quadraticPoint(start, control, end, t) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
  };
}

function lerpIsoPoint(start, end, isoValue) {
  const span = end.value - start.value;
  const t = span === 0 ? 0.5 : clamp01((isoValue - start.value) / span);
  return {
    x: round3(lerp(start.x, end.x, t)),
    y: round3(lerp(start.y, end.y, t))
  };
}

function dedupePoints(points) {
  const seen = new Set();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normaliseControl(control = {}) {
  const player = Number.isFinite(control.player) ? clamp01(control.player) : 0.5;
  return {
    player: round3(player),
    enemy: round3(1 - player)
  };
}

function normalisePressure(pressure = {}) {
  return {
    player: Number.isFinite(pressure.player) ? clamp01(pressure.player) : 0,
    enemy: Number.isFinite(pressure.enemy) ? clamp01(pressure.enemy) : 0
  };
}

function getOutpostStatus({ contestable, ownerFactionId, control, projectedPressure }) {
  if (!contestable) {
    return 'held';
  }
  if (ownerFactionId) {
    return `${ownerFactionId}-controlled`;
  }
  const pressureGap = Math.abs((projectedPressure?.player ?? 0) - (projectedPressure?.enemy ?? 0));
  const controlGap = Math.abs((control?.player ?? 0.5) - 0.5);
  if (pressureGap < 0.025 && controlGap < 0.08) {
    return 'neutral-contested';
  }
  if (controlGap < 0.08 && pressureGap >= 0.025) {
    return projectedPressure.player > projectedPressure.enemy ? 'player-pressuring' : 'enemy-pressuring';
  }
  return control.player > control.enemy ? 'player-leaning' : 'enemy-leaning';
}

function strongestInfluenceAtTile(tile, terrainCarry, entities) {
  return entities.reduce((best, entity) => {
    const distance = tileDistance(tile, getEntityPosition(entity));
    const falloff = clamp01(1 - distance / Math.max(1, entity.influenceRadius));
    const scoreFactor = getEntityInfluenceScore(entity) / 100;
    const value = falloff * scoreFactor * (0.35 + terrainCarry * 0.65);
    return Math.max(best, value);
  }, 0);
}

function createLineOfSightSignature(map, game) {
  const entitySignature = [...(game.leaders ?? []), ...(game.squads ?? [])]
    .map((entity) => {
      const tile = positionToTile(map, getEntityPosition(entity));
      return [
        entity.id,
        entity.factionId,
        tile.x,
        tile.y,
        round3(entity.sightRadius ?? entity.influenceRadius ?? 0),
        round3(entity.attributes?.scouting ?? 0)
      ].join(',');
    })
    .join('|');
  return [
    entityPathMapSignature(map),
    game.leaders?.length ?? 0,
    game.squads?.length ?? 0,
    entitySignature
  ].join(':');
}

function ensureTerrainRuntimeFields(map, game) {
  const mapSignature = entityPathMapSignature(map);
  const cached = game?._runtimeCache?.terrainFields;
  if (
    cached?.mapSignature === mapSignature &&
    cached.commandCarry &&
    cached.losClarity
  ) {
    return cached;
  }

  const commandCarry = createField(map.width, map.height, 0).values;
  const losClarity = createField(map.width, map.height, 0).values;
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const field = getTerrainField(map, x, y);
      commandCarry[y][x] = clamp01((field.passability * 0.4) + (field.logistics * 0.28) + (field.cover * 0.16) + (field.height * 0.16));
      const terrainBlock = field.water >= 0.95
        ? 0.28
        : clamp01(field.cover * 0.16 + field.height * 0.18 + (field.passability < 0.12 ? 0.35 : 0));
      losClarity[y][x] = clamp01(1 - terrainBlock);
    }
  }

  const terrainFields = {
    mapSignature,
    commandCarry,
    losClarity
  };
  if (game) {
    game._runtimeCache = {
      ...(game._runtimeCache ?? {}),
      terrainFields
    };
  }
  return terrainFields;
}

function paintLineOfSightField(map, field, entities, losClarity = null) {
  const useFastMassApproximation = entities.length > 16;
  entities.forEach((entity) => {
    const origin = getEntityPosition(entity);
    const radius = entity.sightRadius ?? (entity.influenceRadius * 0.75);
    const scouting = entity.type === ENTITY_TYPES.squad ? (entity.attributes?.scouting ?? 0.5) : 0.72;
    const minX = clamp(0, map.width - 1, Math.floor(origin.x - radius));
    const maxX = clamp(0, map.width - 1, Math.ceil(origin.x + radius));
    const minY = clamp(0, map.height - 1, Math.floor(origin.y - radius));
    const maxY = clamp(0, map.height - 1, Math.ceil(origin.y + radius));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const tile = { x, y };
        const distance = tileDistance(tile, origin);
        if (distance > radius) {
          continue;
        }
        const clarity = useFastMassApproximation
          ? approximateLineOfSightClarity(map, tile, losClarity)
          : traceLineOfSight(map, origin, tile);
        if (clarity <= 0) {
          continue;
        }
        const falloff = clamp01(1 - distance / Math.max(1, radius));
        const value = round3(clarity * (0.28 + falloff * 0.72) * (0.72 + scouting * 0.28));
        if (value > field.values[y][x]) {
          field.values[y][x] = value;
        }
      }
    }
  });
}

function approximateLineOfSightClarity(map, tile, losClarity = null) {
  if (!isInBounds(map, tile.x, tile.y)) {
    return 0;
  }
  if (losClarity?.[tile.y]?.[tile.x] != null) {
    return losClarity[tile.y][tile.x];
  }
  const field = getTerrainField(map, tile.x, tile.y);
  const terrainBlock = field.water >= 0.95
    ? 0.28
    : clamp01(field.cover * 0.16 + field.height * 0.18 + (field.passability < 0.12 ? 0.35 : 0));
  return clamp01(1 - terrainBlock);
}

function traceLineOfSight(map, origin, target) {
  const distance = tileDistance(origin, target);
  const steps = Math.max(1, Math.ceil(distance * 2));
  let clarity = 1;
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const sample = {
      x: Math.round(lerp(origin.x, target.x, t)),
      y: Math.round(lerp(origin.y, target.y, t))
    };
    if (!isInBounds(map, sample.x, sample.y)) {
      return 0;
    }
    const field = getTerrainField(map, sample.x, sample.y);
    const block = field.water >= 0.95
      ? 0.06
      : clamp01(field.cover * 0.16 + field.height * 0.18 + (field.passability < 0.12 ? 0.35 : 0));
    clarity *= (1 - block);
    if (clarity < 0.08) {
      return 0;
    }
  }
  return clamp01(clarity);
}

function getEntityInfluenceScore(entity) {
  if (entity.type === ENTITY_TYPES.leader) {
    return entity.commandScore ?? 0;
  }
  const attributes = entity.attributes ?? {};
  const base = clamp01(((attributes.firepower ?? 0.5) * 0.32) + ((attributes.cohesion ?? 0.5) * 0.26) + ((attributes.morale ?? 0.5) * 0.22) + ((attributes.discipline ?? 0.5) * 0.2));
  const occupancyBonus = entity.occupancy?.state === SQUAD_OCCUPANCY_STATES.occupied ? 1.12 : 1;
  return Math.round(clamp01(base * occupancyBonus) * 100);
}

function resolveResistedInfluence(rawInfluence, ownBalance, resistance) {
  const bleed = 0.1;
  const dominance = smoothstep(0.43, 0.57, ownBalance);
  const membraneLoss = 0.55 * resistance;
  return rawInfluence * (bleed + (1 - bleed) * dominance) * (1 - membraneLoss);
}

function getLeaderPosition(leader) {
  return normalisePosition(leader?.position, leader?.tile ?? { x: 0, y: 0 });
}

function getEntityPosition(entity) {
  return normalisePosition(entity?.position, entity?.tile ?? { x: 0, y: 0 });
}

function getLeaderTile(leader) {
  const position = getLeaderPosition(leader);
  return {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };
}

function tileToPosition(tile) {
  return {
    x: Number.isFinite(tile?.x) ? tile.x : 0,
    y: Number.isFinite(tile?.y) ? tile.y : 0
  };
}

function getSquadMemberOffset(index) {
  const offsets = [
    { x: -0.18, y: -0.16 },
    { x: 0.18, y: -0.14 },
    { x: -0.14, y: 0.18 },
    { x: 0.2, y: 0.16 }
  ];
  return offsets[index] ?? { x: 0, y: 0 };
}

function roundPosition(position) {
  return {
    x: round3(position.x),
    y: round3(position.y)
  };
}

function countFieldAbove(field, threshold) {
  if (!field?.values) return 0;
  return field.values.reduce((sum, row) => sum + row.filter((value) => value > threshold).length, 0);
}

function positionToTile(map, position) {
  return {
    x: clamp(0, map.width - 1, Math.round(position.x)),
    y: clamp(0, map.height - 1, Math.round(position.y))
  };
}

function clampToMapPosition(map, position) {
  return {
    x: clamp(0, map.width - 1, position.x),
    y: clamp(0, map.height - 1, position.y)
  };
}

function movePositionTowards(position, target, distance) {
  const fullDistance = tileDistance(position, target);
  if (fullDistance <= 0 || distance <= 0) {
    return roundPosition(position);
  }
  const ratio = Math.min(1, distance / fullDistance);
  return roundPosition({
    x: position.x + (target.x - position.x) * ratio,
    y: position.y + (target.y - position.y) * ratio
  });
}

function simplifyPath(path) {
  if (path.length <= 2) return path;
  const simplified = [path[0]];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = path[index];
    const next = path[index + 1];
    const dx1 = Math.sign(current.x - previous.x);
    const dy1 = Math.sign(current.y - previous.y);
    const dx2 = Math.sign(next.x - current.x);
    const dy2 = Math.sign(next.y - current.y);
    if (dx1 !== dx2 || dy1 !== dy2) {
      simplified.push(current);
    }
  }
  simplified.push(path[path.length - 1]);
  return simplified;
}

function tileKey(tile) {
  return `${tile.x},${tile.y}`;
}


function getMapStartTargets(map) {
  const scenario = map?.scenario ?? {};
  const starts = scenario.starts ?? {};
  return {
    player: normaliseScenarioTile(starts.player) ?? { ...START_TARGETS.player },
    enemy: normaliseScenarioTile(starts.enemy) ?? { ...START_TARGETS.enemy }
  };
}

function createScenarioContestableOutposts(map, playerOutpost, enemyOutpost) {
  const scenarioOutposts = Array.isArray(map?.scenario?.neutralOutposts)
    ? map.scenario.neutralOutposts
    : [];
  if (scenarioOutposts.length === 0) {
    return [createContestableOutpost({
      id: 'outpost_contested_01',
      name: 'Signal Knoll',
      tile: chooseContestableOutpostTile(map, playerOutpost, enemyOutpost)
    })];
  }

  const avoid = [playerOutpost, enemyOutpost];
  return scenarioOutposts.map((entry, index) => {
    const target = normaliseScenarioTile(entry?.tile) ?? chooseContestableOutpostTile(map, playerOutpost, enemyOutpost);
    const tile = chooseAnchorTile(map, target, {
      avoid,
      minDistance: Math.max(6, Math.floor(Math.min(map.width, map.height) * 0.09))
    });
    avoid.push(tile);
    return createContestableOutpost({
      id: typeof entry?.id === 'string' ? entry.id : `outpost_neutral_${String(index + 1).padStart(2, '0')}`,
      name: typeof entry?.name === 'string' ? entry.name : `Neutral Outpost ${index + 1}`,
      tile,
      supply: Number.isFinite(Number(entry?.supply)) ? Number(entry.supply) : 0.62
    });
  });
}

function normaliseScenarioTile(tile) {
  if (!Number.isFinite(Number(tile?.x)) || !Number.isFinite(Number(tile?.y))) {
    return null;
  }
  return { x: Math.round(Number(tile.x)), y: Math.round(Number(tile.y)) };
}

function chooseContestableOutpostTile(map, playerOutpost, enemyOutpost) {
  const midpoint = {
    x: Math.round((playerOutpost.x + enemyOutpost.x) / 2),
    y: Math.round((playerOutpost.y + enemyOutpost.y) / 2)
  };
  return chooseAnchorTile(map, midpoint, {
    avoid: [playerOutpost, enemyOutpost],
    minDistance: 8
  });
}

function chooseAnchorTile(map, target, { avoid = [], minDistance = 0 } = {}) {
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (!isInBounds(map, x, y)) {
        continue;
      }
      const terrainField = getTerrainField(map, x, y);
      const viable = terrainField.passability >= 0.48 && terrainField.logistics >= 0.28;
      if (!viable) {
        continue;
      }
      if (avoid.some((tile) => tileDistance(tile, { x, y }) < minDistance)) {
        continue;
      }
      const score = tileDistance(target, { x, y }) - terrainField.logistics * 1.6 - terrainField.height * 0.7;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }

  return best ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
}

function tileDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function boundedNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(min, max, numeric) : fallback;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}
