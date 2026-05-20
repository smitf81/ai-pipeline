import { createField, getElevationSlope, getTerrainField } from '../world/fields.js';
import { getTerrain } from '../config/terrain.js';
import { getTile, isInBounds } from '../world/mapModel.js';
import {
  beginCollisionFrame,
  normaliseMovableCollisionMetadata,
  recordHardBlockerCheck,
  resolveSoftUnitSeparation,
  summarizeCollisionAuthority
} from './collisionAuthority.js';
import { applySupplyIncomeTick, canAffordSupplies, createInitialEconomy, normaliseEconomy, spendSupplies, summarizeEconomy } from './economy.js';
import { CONSTRUCTION_STATES, createStructureInstance, getStructureDefinition, normaliseStructureInstance } from './structureRegistry.js';
import {
  createStructureNavigationSignature,
  getStructureMovementCostModifier,
  isTileBlockedByStructure,
  summarizeStructureTopology
} from './structureTopology.js';
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
  objectivePressure: { id: 'objectivePressure', label: 'Objective Pressure' }
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

export const MOVEMENT_MODEL = {
  tickMinutes: 1,
  tileMeters: 100,
  baseFootSpeedTilesPerTick: 0.52,
  minimumFootSpeedTilesPerTick: 0.04,
  arrivalDistanceTiles: 0.16,
  impassableThreshold: 0.12,
  pathNodeArrivalDistanceTiles: 0.22
};

const LINE_OF_SIGHT_RECOMPUTE_INTERVAL_TICKS = 12;
const COMMAND_FIELD_RECOMPUTE_INTERVAL_TICKS = 8;
const FRONTLINE_RECOMPUTE_INTERVAL_TICKS = 2;
const OBJECTIVE_PRESSURE_CORRIDOR_RADIUS = 3.2;

const START_TARGETS = {
  player: { x: 6, y: 15 },
  enemy: { x: 40, y: 23 }
};

const LEADER_TEMPLATE = {
  presence: 0.72,
  judgement: 0.66,
  discipline: 0.68,
  logistics: 0.64,
  initiative: 0.62
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
  speedMultiplier: 0.84
};

const BUILDER_CREW_TEMPLATE = {
  unitId: 'builder_crew',
  label: 'Construction Crew',
  workPerTick: 1,
  speedMultiplier: 0.78,
  claimCadenceTicks: 2,
  workRangeTiles: 1.15,
  blockedRetryTicks: 8
};

export const CONSTRUCTION_JOB_STATES = Object.freeze({
  pending: 'pending',
  claimed: 'claimed',
  active: 'active',
  complete: 'complete',
  blocked: 'blocked',
  cancelled: 'cancelled'
});

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
  const playerOutpost = chooseAnchorTile(map, START_TARGETS.player);
  const enemyOutpost = chooseAnchorTile(map, START_TARGETS.enemy, { avoid: [playerOutpost], minDistance: 18 });
  const contestOutpost = chooseContestableOutpostTile(map, playerOutpost, enemyOutpost);
  const outposts = [
    createOutpost({ id: 'outpost_player_01', factionId: 'player', name: 'Player Field Outpost', tile: playerOutpost, buildableBy: 'player' }),
    createOutpost({ id: 'outpost_enemy_01', factionId: 'enemy', name: 'Enemy Field Outpost', tile: enemyOutpost, buildableBy: 'enemy' }),
    createContestableOutpost({ id: 'outpost_contested_01', name: 'Signal Knoll', tile: contestOutpost })
  ];
  const structures = createOutpostStructureInstances(outposts);

  const game = {
    contract: GAME_STATE_CONTRACT_ID,
    version: GAME_STATE_VERSION,
    mapRef: createMapRef(map),
    tick: 0,
    phase: GAME_PHASES.openingCommandField,
    mode: GAME_MODES.leaderDuelSeed,
    selectedEntityId: 'leader_player_01',
    factions: FACTIONS,
    economy: createInitialEconomy(['player', 'enemy']),
    outposts,
    structures,
    constructionJobs: [],
    builders: createInitialBuilderCrews(structures),
    leaders: [
      createLeader({ id: 'leader_player_01', factionId: 'player', name: 'Player Command Unit', tile: playerOutpost, controller: 'player', stance: 'probe' }),
      createLeader({ id: 'leader_enemy_01', factionId: 'enemy', name: 'Enemy Command Unit', tile: enemyOutpost, controller: 'ai', stance: 'probe' })
    ],
    squads: [],
    fields: {},
    collisionStats: summarizeCollisionAuthority(null)
  };

  return recomputeGameState(game, map);
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
  game.tick += 1;
  beginCollisionFrame(game);
  game.phase = game.tick === 0 ? GAME_PHASES.openingCommandField : GAME_PHASES.commandFieldStabilising;
  runEnemyBehaviour(game);
  advanceLeaderMovement(game, map);
  advanceSquadMovement(game, map);
  advanceConstructionJobs(game, map);
  resolveSoftUnitSeparation(game, map, {
    isHardBlocked: (tile, factionId, allowTile) => isMovementBlocked(map, tile, game, factionId, { allowTile })
  });
  recomputeGameState(game, map, { resolveContest: true });
  game.economy = applySupplyIncomeTick(game.economy, game.outposts, ['player', 'enemy']);
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
  return recomputeGameState(game, map);
}

export function setPlayerMovementIntent(game, map, entityId, path) {
  const orderPath = normaliseMovementOrderPath(path);
  if (orderPath.length < 2) {
    return recomputeGameState(game, map);
  }
  const target = orderPath[orderPath.length - 1];
  game.leaders = game.leaders.map((leader) => {
    if (leader.id !== entityId || leader.factionId !== 'player') {
      return leader;
    }
    return {
      ...leader,
      movementOrder: {
        type: 'path-hold',
        routeMode: 'player-intended',
        path: orderPath,
        target,
        issuedAtTick: game.tick
      },
      movementPath: null,
      behavior: {
        ...normaliseLeaderBehavior(leader.behavior, leader.factionId),
        stance: 'commit',
        intent: 'path-hold-objective',
        lastDecision: `Player ordered path hold at ${target.x}, ${target.y}`
      }
    };
  });
  game.squads = (game.squads ?? []).map((squad) => {
    if (squad.id !== entityId || squad.factionId !== 'player') {
      return squad;
    }
    return {
      ...squad,
      movementOrder: {
        type: 'path-hold',
        routeMode: 'player-intended',
        path: orderPath,
        target,
        issuedAtTick: game.tick
      },
      movementPath: null,
      behavior: {
        ...normaliseSquadBehavior(squad.behavior, squad.factionId),
        stance: 'commit',
        intent: 'path-hold-objective',
        lastDecision: `Player ordered infantry path hold at ${target.x}, ${target.y}`
      }
    };
  });
  return recomputeGameState(game, map);
}

export function spawnInfantrySquad(game, map, { factionId = 'player' } = {}) {
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
  game.selectedEntityId = id;
  return { ok: true, squad: game.squads[game.squads.length - 1], game: recomputeGameState(game, map) };
}

export function validateStructurePlacement(game, map, { type, factionId = 'player', position = null, tile = null } = {}) {
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
  if (!canAffordSupplies(game.economy, factionId, cost)) {
    return createPlacementValidation(false, 'insufficient-supplies', `Need ${cost} Supplies`);
  }
  const candidate = createStructureInstance(type, {
    factionId,
    tile: targetTile,
    position: targetPosition,
    construction: {
      state: CONSTRUCTION_STATES.blueprint,
      progress: 0
    }
  });
  const overlap = (game.structures ?? []).find((structure) => {
    const state = structure.construction?.state;
    if (state === CONSTRUCTION_STATES.ruined) {
      return false;
    }
    return structureFootprintsOverlap(candidate, structure);
  });
  if (overlap) {
    return createPlacementValidation(false, 'overlaps-structure', `Overlaps ${overlap.name ?? overlap.type}`);
  }
  const sourceBase = findNearestBuilderBase(game, factionId, targetPosition);
  return {
    ...createPlacementValidation(true, sourceBase ? 'valid' : 'pending-builder-base', sourceBase ? 'Placement ready' : 'No builder base; job will wait'),
    cost,
    sourceBaseId: sourceBase?.id ?? null,
    position: roundPosition(targetPosition),
    tile: targetTile,
    structureType: type
  };
}

export function placeStructureBuildOrder(game, map, { type, factionId = 'player', position = null, tile = null } = {}) {
  const validation = validateStructurePlacement(game, map, { type, factionId, position, tile });
  if (!validation.valid) {
    return { ok: false, reason: validation.reason, validation, game };
  }

  const definition = getStructureDefinition(type);
  const purchase = spendSupplies(game.economy, factionId, validation.cost);
  if (!purchase.ok) {
    return { ok: false, reason: purchase.reason, validation: { ...validation, valid: false, reason: purchase.reason }, game };
  }

  game.economy = purchase.economy;
  const existingCount = (game.structures ?? []).filter((structure) => structure.type === type && structure.factionId === factionId).length + 1;
  const id = `structure_${type}_${factionId}_${String(existingCount).padStart(2, '0')}_${validation.tile.x}_${validation.tile.y}`;
  const structure = createStructureInstance(type, {
    id,
    factionId,
    name: `${FACTIONS[factionId]?.label ?? factionId} ${definition.label} ${existingCount}`,
    tile: validation.tile,
    position: validation.position,
    construction: {
      state: CONSTRUCTION_STATES.blueprint,
      progress: 0,
      requiredWork: definition.construction.requiredWork,
      assignedBuilders: [],
      createdAtTick: game.tick ?? 0
    }
  });
  const job = createConstructionJobFromStructure(structure, {
    sourceBaseId: validation.sourceBaseId,
    createdAtTick: game.tick ?? 0
  });

  game.structures = [...(game.structures ?? []), structure];
  game.constructionJobs = [...(game.constructionJobs ?? []), job];
  game.selectedEntityId = structure.id;
  game.constructionStats = {
    ...summarizeConstruction(game),
    lastPlacedStructureId: structure.id
  };

  return {
    ok: true,
    structure,
    job,
    validation,
    cost: validation.cost,
    game: recomputeGameState(game, map)
  };
}

export function recomputeGameState(game, map, { resolveContest = false } = {}) {
  assertMapDataContract(map);
  game.contract = game.contract ?? GAME_STATE_CONTRACT_ID;
  game.version = game.version ?? GAME_STATE_VERSION;
  game.mapRef = createMapRef(map);
  game.factions = game.factions ?? FACTIONS;
  game.economy = normaliseEconomy(game.economy, ['player', 'enemy']);
  game.collisionStats = summarizeCollisionAuthority(game);
  game.outposts = game.outposts.map(normaliseOutpost);
  game.structures = normaliseGameStructures(game);
  game.constructionJobs = (game.constructionJobs ?? []).map(normaliseConstructionJob);
  game.builders = (Array.isArray(game.builders) && game.builders.length > 0 ? game.builders : createInitialBuilderCrews(game.structures)).map(normaliseBuilder);
  game.squads = (game.squads ?? []).map(normaliseSquad);
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
  updateContestableOutposts(game, map, { resolveContest });
  game.fields = deriveCadencedCommandInfluenceFields(map, game);
  game.fields = {
    ...game.fields,
    ...deriveLineOfSightFields(map, game)
  };
  game.frontline = deriveCadencedInfluenceFrontline(map, game.fields, game);
  game.constructionStats = summarizeConstruction(game);
  assertGameStateContract(game);
  return game;
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
    {
      id: 'outpost-anchor',
      label: 'Outpost Anchor',
      value: outpostSupport,
      weight: 0.14,
      sources: ['outpost.buildable', 'outpost.supply']
    },
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
    game?.squads?.map((squad) => `${squad.id}:${squad.factionId}:${round3(getEntityPosition(squad).x)}:${round3(getEntityPosition(squad).y)}:${squad.behavior?.stance ?? ''}:${squad.movement?.status ?? ''}`).join('|') ?? '',
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

  const selectableUnit = [
    ...game.leaders.map((entity) => ({ entity, distance: tileDistance(getEntityPosition(entity), tile), radius: 1.15 })),
    ...(game.squads ?? []).map((entity) => ({ entity, distance: tileDistance(getEntityPosition(entity), tile), radius: 1.05 })),
    ...(game.builders ?? []).map((entity) => ({ entity, distance: tileDistance(getEntityPosition(entity), tile), radius: 0.95 }))
  ]
    .filter((entry) => entry.distance <= entry.radius)
    .sort((a, b) => a.distance - b.distance)[0]?.entity;

  if (selectableUnit) {
    game.selectedEntityId = selectableUnit.id;
    return selectableUnit;
  }

  const outpost = game.outposts.find((candidate) => tileDistance(candidate.tile, tile) <= 1.2);
  if (outpost) {
    game.selectedEntityId = outpost.id;
    return outpost;
  }

  const structure = (game.structures ?? [])
    .filter((candidate) => tileDistance(candidate.position ?? candidate.tile, tile) <= getStructureSelectionRadius(candidate))
    .sort((a, b) => tileDistance(a.position ?? a.tile, tile) - tileDistance(b.position ?? b.tile, tile))[0] ?? null;
  game.selectedEntityId = structure?.id ?? null;
  return structure;
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
    phase: recomputed.phase,
    mode: recomputed.mode,
    selectedEntityId: recomputed.selectedEntityId,
    economy: recomputed.economy,
    outposts: recomputed.outposts.map(stripRuntimeOutpost),
    structures: recomputed.structures.map(stripRuntimeStructure),
    constructionJobs: recomputed.constructionJobs.map(stripRuntimeConstructionJob),
    leaders: recomputed.leaders.map(stripRuntimeLeader),
    squads: recomputed.squads.map(stripRuntimeSquad),
    builders: recomputed.builders.map(stripRuntimeBuilder)
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
    phase: typeof parsed.phase === 'string' ? parsed.phase : GAME_PHASES.openingCommandField,
    mode: typeof parsed.mode === 'string' ? parsed.mode : GAME_MODES.leaderDuelSeed,
    selectedEntityId: typeof parsed.selectedEntityId === 'string' ? parsed.selectedEntityId : null,
    factions: FACTIONS,
    economy: normaliseEconomy(parsed.economy, ['player', 'enemy']),
    collisionStats: summarizeCollisionAuthority(parsed),
    outposts: Array.isArray(parsed.outposts) ? parsed.outposts.map(normaliseOutpost) : [],
    structures: Array.isArray(parsed.structures) ? parsed.structures.map(normaliseStructure) : [],
    constructionJobs: Array.isArray(parsed.constructionJobs) ? parsed.constructionJobs.map(normaliseConstructionJob) : [],
    leaders: Array.isArray(parsed.leaders) ? parsed.leaders.map(normaliseLeader) : [],
    squads: Array.isArray(parsed.squads) ? parsed.squads.map(normaliseSquad) : [],
    builders: Array.isArray(parsed.builders) ? parsed.builders.map(normaliseBuilder) : [],
    fields: {}
  };
  if (next.outposts.length === 0 || next.leaders.length === 0) {
    throw new Error('Game import failed: game state must contain at least one outpost and one leader');
  }
  return recomputeGameState(next, map);
}

export function summarizeGame(game) {
  return {
    contract: game.contract,
    version: game.version,
    mapRef: game.mapRef,
    tick: game.tick,
    phase: game.phase,
    mode: game.mode,
    selectedEntityId: game.selectedEntityId,
    entityCount: getGameEntities(game).length,
    structureTopology: summarizeStructureTopology(game),
    construction: summarizeConstruction(game),
    collision: summarizeCollisionAuthority(game),
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
      commandScore: leader.commandScore,
      influenceRadius: leader.influenceRadius,
      behavior: leader.behavior,
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
      collision: squad.collision,
      movement: squad.movement,
      movementOrder: squad.movementOrder,
      movementPath: summarizeMovementPath(squad.movementPath),
      behavior: squad.behavior
    })),
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
      workPerTick: builder.workPerTick,
      blockedTicks: builder.blockedTicks,
      collision: builder.collision,
      movement: builder.movement,
      movementPath: summarizeMovementPath(builder.movementPath)
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
      integrity: structure.integrity
    }))
  };
}

function createLeader({ id, factionId, name, tile, controller = factionId === 'player' ? 'player' : 'ai', stance = 'probe' }) {
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
    behavior: normaliseLeaderBehavior({ controller, stance }, factionId)
  });
}

function createInfantrySquad({ id, factionId, name, tile, stance = 'probe' }) {
  const template = INFANTRY_SQUAD_TEMPLATE;
  return normaliseSquad({
    id,
    type: ENTITY_TYPES.squad,
    unitId: template.unitId,
    factionId,
    name,
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
    speedMultiplier: template.speedMultiplier,
    behavior: normaliseSquadBehavior({ controller: factionId === 'player' ? 'player' : 'ai', stance }, factionId)
  });
}

function createInitialBuilderCrews(structures = []) {
  return structures
    .filter((structure) => structure.type === 'outpost' && structure.factionId !== 'neutral' && structure.construction?.state === CONSTRUCTION_STATES.complete)
    .map((structure, index) => createBuilderCrew({
      id: `builder_${structure.factionId}_${String(index + 1).padStart(2, '0')}`,
      factionId: structure.factionId,
      name: `${FACTIONS[structure.factionId]?.label ?? structure.factionId} Construction Crew ${index + 1}`,
      tile: structure.tile,
      position: {
        x: structure.position.x + 0.35,
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

function createContestableOutpost({ id, name, tile }) {
  return normaliseOutpost({
    id,
    type: ENTITY_TYPES.outpost,
    factionId: 'neutral',
    name,
    tile: { ...tile },
    buildable: false,
    buildableBy: 'both',
    spawnLeaderId: null,
    supply: 0.62,
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
    tile,
    position,
    qualities: normaliseQualities(leader.qualities),
    command: leader.command ?? null,
    commandScore: Number.isFinite(leader.commandScore) ? leader.commandScore : 0,
    influenceRadius: Number.isFinite(leader.influenceRadius) ? leader.influenceRadius : 0,
    behavior: normaliseLeaderBehavior(leader.behavior, leader.factionId),
    collision: normaliseMovableCollisionMetadata({ ...leader, type: ENTITY_TYPES.leader }, leader.collision),
    movement: normaliseLeaderMovement(leader.movement, position),
    movementOrder: normaliseMovementOrder(leader.movementOrder),
    movementPath: normaliseMovementPath(leader.movementPath)
  };
}

function normaliseSquad(squad) {
  const tile = cloneTile(squad.tile);
  const position = normalisePosition(squad.position, tile);
  return {
    id: String(squad.id),
    type: ENTITY_TYPES.squad,
    unitId: squad.unitId ?? 'infantry',
    factionId: String(squad.factionId),
    name: squad.name ?? squad.id,
    tile,
    position,
    members: normaliseSquadMembers(squad.members),
    attributes: normaliseSquadAttributes(squad.attributes),
    influenceRadius: Number.isFinite(squad.influenceRadius) ? Math.max(1, squad.influenceRadius) : INFANTRY_SQUAD_TEMPLATE.influenceRadius,
    sightRadius: Number.isFinite(squad.sightRadius) ? Math.max(1, squad.sightRadius) : INFANTRY_SQUAD_TEMPLATE.sightRadius,
    speedMultiplier: Number.isFinite(squad.speedMultiplier) ? Math.max(0.1, squad.speedMultiplier) : INFANTRY_SQUAD_TEMPLATE.speedMultiplier,
    behavior: normaliseSquadBehavior(squad.behavior, squad.factionId),
    collision: normaliseMovableCollisionMetadata({ ...squad, type: ENTITY_TYPES.squad }, squad.collision),
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
    collision: normaliseMovableCollisionMetadata({ ...builder, type: ENTITY_TYPES.builder }, builder.collision),
    movement: normaliseLeaderMovement(builder.movement, position),
    movementPath: normaliseMovementPath(builder.movementPath)
  };
}

function normaliseConstructionJob(job) {
  const position = normalisePosition(job.position, job.tile);
  const state = Object.values(CONSTRUCTION_JOB_STATES).includes(job.state) ? job.state : CONSTRUCTION_JOB_STATES.pending;
  const requiredWork = positiveNumber(job.requiredWork, 1);
  const progress = clamp(0, requiredWork, Number(job.progress) || 0);
  return {
    id: String(job.id),
    type: 'construct_structure',
    structureId: String(job.structureId),
    factionId: String(job.factionId ?? 'neutral'),
    position,
    requiredWork,
    progress,
    assignedBuilderIds: Array.isArray(job.assignedBuilderIds) ? job.assignedBuilderIds.filter((id) => typeof id === 'string') : [],
    maxAssignedBuilders: Math.max(1, Math.floor(positiveNumber(job.maxAssignedBuilders, 1))),
    state,
    sourceBaseId: typeof job.sourceBaseId === 'string' ? job.sourceBaseId : null,
    createdAtTick: Number.isInteger(job.createdAtTick) ? Math.max(0, job.createdAtTick) : 0,
    updatedAtTick: Number.isInteger(job.updatedAtTick) ? Math.max(0, job.updatedAtTick) : 0
  };
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

function normaliseQualities(qualities = {}) {
  return Object.fromEntries(Object.entries(LEADER_TEMPLATE).map(([key, fallback]) => [
    key,
    Number.isFinite(qualities[key]) ? clamp01(qualities[key]) : fallback
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

function normaliseSquadMembers(members = []) {
  const source = Array.isArray(members) && members.length > 0
    ? members
    : Array.from({ length: INFANTRY_SQUAD_TEMPLATE.members }, (_, index) => ({ id: `m${index + 1}`, offset: getSquadMemberOffset(index) }));
  return source.slice(0, INFANTRY_SQUAD_TEMPLATE.members).map((member, index) => ({
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

function normalisePressureStance(stanceId) {
  return Object.prototype.hasOwnProperty.call(PRESSURE_STANCES, stanceId) ? stanceId : 'probe';
}

function normalisePosition(position, fallbackTile) {
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return roundPosition(position);
  }
  return tileToPosition(fallbackTile);
}

function normaliseLeaderMovement(movement = {}, position) {
  return {
    status: typeof movement.status === 'string' ? movement.status : 'idle',
    target: normalisePosition(movement.target, position),
    waypoint: movement.waypoint ? normalisePosition(movement.waypoint, position) : null,
    targetMode: typeof movement.targetMode === 'string' ? movement.targetMode : 'staging',
    terrain: typeof movement.terrain === 'string' ? movement.terrain : 'land',
    speedTilesPerTick: Number.isFinite(movement.speedTilesPerTick) ? round3(Math.max(0, movement.speedTilesPerTick)) : 0,
    speedKph: Number.isFinite(movement.speedKph) ? round3(Math.max(0, movement.speedKph)) : 0,
    distanceToTarget: Number.isFinite(movement.distanceToTarget) ? round3(Math.max(0, movement.distanceToTarget)) : 0,
    lastStepTiles: Number.isFinite(movement.lastStepTiles) ? round3(Math.max(0, movement.lastStepTiles)) : 0
  };
}

function normaliseMovementOrder(movementOrder) {
  if (!movementOrder || movementOrder.type !== 'path-hold') {
    return null;
  }
  const path = normaliseMovementOrderPath(movementOrder.path);
  if (path.length < 2) {
    return null;
  }
  return {
    type: 'path-hold',
    routeMode: movementOrder.routeMode === 'player-intended' ? 'player-intended' : 'direct',
    path,
    target: normalisePosition(movementOrder.target, path[path.length - 1]),
    issuedAtTick: Number.isInteger(movementOrder.issuedAtTick) ? movementOrder.issuedAtTick : 0
  };
}

function normaliseMovementPath(movementPath) {
  if (!movementPath || !Array.isArray(movementPath.nodes)) {
    return null;
  }
  const nodes = normaliseRuntimeMovementPathNodes(movementPath.nodes);
  if (nodes.length < 2) {
    return null;
  }
  return {
    kind: movementPath.kind === 'player-intended' ? 'player-intended' : 'auto',
    target: normalisePosition(movementPath.target, nodes[nodes.length - 1]),
    sourceSignature: typeof movementPath.sourceSignature === 'string' ? movementPath.sourceSignature : '',
    mapSignature: typeof movementPath.mapSignature === 'string' ? movementPath.mapSignature : '',
    routeCacheKey: typeof movementPath.routeCacheKey === 'string' ? movementPath.routeCacheKey : '',
    routeCacheHit: Boolean(movementPath.routeCacheHit),
    nodes,
    cursor: Number.isInteger(movementPath.cursor) ? clamp(0, nodes.length - 1, movementPath.cursor) : 1,
    blocked: Boolean(movementPath.blocked)
  };
}

function bindRuntimeOwner(entity, game) {
  Object.defineProperty(entity, '_runtimeOwner', {
    value: game,
    enumerable: false,
    configurable: true
  });
  return entity;
}

function normaliseMovementOrderPath(path) {
  if (!Array.isArray(path)) {
    return [];
  }
  return stabilizePath(path
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => roundPosition(point)));
}

function normaliseRuntimeMovementPathNodes(path) {
  if (!Array.isArray(path)) {
    return [];
  }
  const nodes = [];
  path
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => roundPosition(point))
    .forEach((point) => {
      const previous = nodes[nodes.length - 1];
      if (!previous || tileDistance(previous, point) >= 0.001) {
        nodes.push(point);
      }
    });
  return nodes;
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
    movement: stripRuntimeMovement(leader.movement),
    movementOrder: stripRuntimeMovementOrder(leader.movementOrder),
    movementPath: stripRuntimeMovementPath(leader.movementPath),
    qualities: { ...leader.qualities },
    behavior: { ...leader.behavior }
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
    speedMultiplier: round3(squad.speedMultiplier),
    collision: { ...squad.collision },
    behavior: { ...squad.behavior },
    movement: stripRuntimeMovement(squad.movement),
    movementOrder: stripRuntimeMovementOrder(squad.movementOrder),
    movementPath: stripRuntimeMovementPath(squad.movementPath)
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
    builders: game.builders ? structuredClone(game.builders) : [],
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
    phase: typeof game.phase === 'string' ? game.phase : GAME_PHASES.openingCommandField,
    mode: typeof game.mode === 'string' ? game.mode : GAME_MODES.leaderDuelSeed,
    selectedEntityId: typeof game.selectedEntityId === 'string' ? game.selectedEntityId : null,
    economy: normaliseEconomy(game.economy, ['player', 'enemy']),
    collisionStats: summarizeCollisionAuthority(game),
    outposts: (game.outposts ?? []).map(normaliseOutpost),
    structures: normaliseGameStructures(game),
    constructionJobs: (game.constructionJobs ?? []).map(normaliseConstructionJob),
    leaders: (game.leaders ?? []).map(normaliseLeader),
    squads: (game.squads ?? []).map(normaliseSquad),
    builders: (game.builders ?? []).map(normaliseBuilder)
  };
}

function summarizeMovementPath(movementPath) {
  const path = normaliseMovementPath(movementPath);
  if (!path) return null;
  return {
    kind: path.kind,
    target: path.target,
    cursor: path.cursor,
    nodeCount: path.nodes.length,
    blocked: path.blocked
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
    const distanceToTarget = tileDistance(plan.position, plan.target);

    if (distanceToTarget <= MOVEMENT_MODEL.arrivalDistanceTiles) {
      return applyLeaderPosition(normalisedLeader, plan.position, {
        ...plan,
        status: 'arrived',
        distanceToTarget: round3(distanceToTarget),
        lastStepTiles: 0
      }, map);
    }

    if (plan.blocked || !plan.waypoint) {
      return applyLeaderPosition(normalisedLeader, plan.position, {
        ...plan,
        status: 'blocked',
        distanceToTarget: round3(distanceToTarget),
        lastStepTiles: 0
      }, map);
    }

    const step = resolveMovementStep(map, game, normalisedLeader, plan.position, plan.waypoint, plan.speedTilesPerTick);
    const nextTerrain = getTerrain(getTile(map, step.tile.x, step.tile.y));

    if (step.blocked) {
      return applyLeaderPosition(normalisedLeader, plan.position, {
        ...plan,
        status: 'blocked',
        terrain: nextTerrain.id,
        distanceToTarget: round3(distanceToTarget),
        lastStepTiles: 0
      }, map);
    }

    const lastStepTiles = tileDistance(plan.position, step.position);
    return applyLeaderPosition(normalisedLeader, step.position, {
      ...plan,
      status: step.slidAxis ? `sliding-${step.slidAxis}` : 'moving',
      terrain: nextTerrain.id,
      distanceToTarget: round3(tileDistance(step.position, plan.target)),
      lastStepTiles: round3(lastStepTiles)
    }, map);
  });
}

function advanceSquadMovement(game, map) {
  const objective = findPrimaryContestableOutpost(game);
  game.squads = (game.squads ?? []).map((squad) => {
    const normalisedSquad = normaliseSquad(squad);
    bindRuntimeOwner(normalisedSquad, game);
    const outpost = findOutpostForSquad(game, normalisedSquad);
    const plan = evaluateSquadMovementPlan(map, normalisedSquad, outpost, objective);
    const distanceToTarget = tileDistance(plan.position, plan.target);

    if (distanceToTarget <= MOVEMENT_MODEL.arrivalDistanceTiles) {
      return applySquadPosition(normalisedSquad, plan.position, {
        ...plan,
        status: 'arrived',
        distanceToTarget: round3(distanceToTarget),
        lastStepTiles: 0
      }, map);
    }

    if (plan.blocked || !plan.waypoint) {
      return applySquadPosition(normalisedSquad, plan.position, {
        ...plan,
        status: 'blocked',
        distanceToTarget: round3(distanceToTarget),
        lastStepTiles: 0
      }, map);
    }

    const step = resolveMovementStep(map, game, normalisedSquad, plan.position, plan.waypoint, plan.speedTilesPerTick);
    const nextTerrain = getTerrain(getTile(map, step.tile.x, step.tile.y));

    if (step.blocked) {
      return applySquadPosition(normalisedSquad, plan.position, {
        ...plan,
        status: 'blocked',
        terrain: nextTerrain.id,
        distanceToTarget: round3(distanceToTarget),
        lastStepTiles: 0
      }, map);
    }

    const lastStepTiles = tileDistance(plan.position, step.position);
    return applySquadPosition(normalisedSquad, step.position, {
      ...plan,
      status: step.slidAxis ? `sliding-${step.slidAxis}` : 'moving',
      terrain: nextTerrain.id,
      distanceToTarget: round3(tileDistance(step.position, plan.target)),
      lastStepTiles: round3(lastStepTiles)
    }, map);
  });
}

function advanceConstructionJobs(game, map) {
  const stats = {
    ...summarizeConstruction(game),
    constructionProgressUpdates: 0,
    blockerSignatureChanges: 0
  };
  const beforeSignature = createStructureNavigationSignature(game);
  refreshConstructionJobBases(game);
  claimAvailableConstructionJobs(game);

  game.builders = (game.builders ?? []).map((builder) => advanceBuilderCrew(game, map, builder, stats));
  game.constructionJobs = (game.constructionJobs ?? []).map(normaliseConstructionJob);
  syncConstructionStructures(game, stats);

  const afterSignature = createStructureNavigationSignature(game);
  if (afterSignature !== beforeSignature) {
    stats.blockerSignatureChanges += 1;
    game._runtimeCache = {
      ...(game._runtimeCache ?? {}),
      navigationRoutes: null,
      structureNavigation: null
    };
  }
  game.constructionStats = {
    ...summarizeConstruction(game),
    constructionProgressUpdates: stats.constructionProgressUpdates,
    blockerSignatureChanges: stats.blockerSignatureChanges
  };
}

function refreshConstructionJobBases(game) {
  game.constructionJobs = (game.constructionJobs ?? []).map((job) => {
    const normalisedJob = normaliseConstructionJob(job);
    if (
      normalisedJob.state === CONSTRUCTION_JOB_STATES.complete ||
      normalisedJob.state === CONSTRUCTION_JOB_STATES.cancelled ||
      normalisedJob.sourceBaseId
    ) {
      return normalisedJob;
    }
    const sourceBase = findNearestBuilderBase(game, normalisedJob.factionId, normalisedJob.position);
    return {
      ...normalisedJob,
      sourceBaseId: sourceBase?.id ?? null,
      state: CONSTRUCTION_JOB_STATES.pending,
      updatedAtTick: game.tick ?? normalisedJob.updatedAtTick
    };
  });
}

function claimAvailableConstructionJobs(game) {
  const jobsById = new Map((game.constructionJobs ?? []).map((job) => [job.id, normaliseConstructionJob(job)]));
  game.builders = (game.builders ?? []).map((builder) => {
    const normalisedBuilder = normaliseBuilder(builder);
    if (normalisedBuilder.jobId || normalisedBuilder.state !== 'idle') {
      return normalisedBuilder;
    }
    if ((game.tick ?? 0) - normalisedBuilder.lastClaimTick < BUILDER_CREW_TEMPLATE.claimCadenceTicks) {
      return normalisedBuilder;
    }
    const job = findNearestClaimableConstructionJob(game, normalisedBuilder, jobsById);
    if (!job) {
      return {
        ...normalisedBuilder,
        lastClaimTick: game.tick ?? normalisedBuilder.lastClaimTick
      };
    }
    const claimedJob = {
      ...job,
      state: CONSTRUCTION_JOB_STATES.claimed,
      assignedBuilderIds: [...job.assignedBuilderIds, normalisedBuilder.id].slice(0, job.maxAssignedBuilders),
      updatedAtTick: game.tick ?? job.updatedAtTick
    };
    jobsById.set(job.id, claimedJob);
    return {
      ...normalisedBuilder,
      jobId: job.id,
      state: 'moving',
      lastClaimTick: game.tick ?? normalisedBuilder.lastClaimTick,
      movementPath: null
    };
  });
  game.constructionJobs = [...jobsById.values()];
}

function advanceBuilderCrew(game, map, builder, stats) {
  const normalisedBuilder = normaliseBuilder(builder);
  if (!normalisedBuilder.jobId) {
    return normalisedBuilder;
  }
  const job = (game.constructionJobs ?? []).find((candidate) => candidate.id === normalisedBuilder.jobId);
  const structure = job ? (game.structures ?? []).find((candidate) => candidate.id === job.structureId) : null;
  if (!job || !structure || job.state === CONSTRUCTION_JOB_STATES.cancelled || job.state === CONSTRUCTION_JOB_STATES.complete) {
    releaseBuilderFromJob(game, normalisedBuilder.id, normalisedBuilder.jobId);
    return {
      ...normalisedBuilder,
      jobId: null,
      state: 'idle',
      movementPath: null
    };
  }

  const position = clampToMapPosition(map, normalisedBuilder.position);
  bindRuntimeOwner(normalisedBuilder, game);
  const workPoint = getStructureWorkPoint(game, map, structure, normalisedBuilder);
  if (!workPoint) {
    return releaseBlockedBuilder(game, normalisedBuilder, job, CONSTRUCTION_JOB_STATES.blocked);
  }
  const distanceToWork = tileDistance(position, workPoint);
  if (distanceToWork <= BUILDER_CREW_TEMPLATE.workRangeTiles) {
    const completed = applyBuilderWork(game, job.id, normalisedBuilder.id, stats);
    if (completed) {
      return {
        ...normalisedBuilder,
        jobId: null,
        state: 'idle',
        blockedTicks: 0,
        movementPath: null
      };
    }
    return {
      ...normalisedBuilder,
      state: 'working',
      blockedTicks: 0,
      movement: normaliseLeaderMovement({
        status: 'working',
        target: workPoint,
        waypoint: null,
        targetMode: 'construction',
        terrain: getTerrain(getTile(map, normalisedBuilder.tile.x, normalisedBuilder.tile.y)).id,
        distanceToTarget: distanceToWork,
        lastStepTiles: 0
      }, position),
      movementPath: null
    };
  }

  const target = resolveNavigableMovementTarget(map, normalisedBuilder, position, clampToMapPosition(map, workPoint));
  const movementPath = ensureMovementPath(map, normalisedBuilder, position, target);
  const waypoint = getMovementPathWaypoint(movementPath, position);
  if (!waypoint) {
    return handleBuilderBlocked(game, map, normalisedBuilder, job, {
      target,
      waypoint: null,
      distanceToWork,
      movementPath,
      finalState: CONSTRUCTION_JOB_STATES.blocked
    });
  }

  const sampleTile = positionToTile(map, position);
  const terrainField = getTerrainField(map, sampleTile.x, sampleTile.y);
  const terrainMultiplier = movementTerrainMultiplier(terrainField) / getStructureMovementCostModifier(game, map, sampleTile, normalisedBuilder.factionId);
  const speedTilesPerTick = Math.max(
    MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
    MOVEMENT_MODEL.baseFootSpeedTilesPerTick * normalisedBuilder.speedMultiplier * 0.72 * terrainMultiplier
  );
  const step = resolveMovementStep(map, game, normalisedBuilder, position, waypoint, speedTilesPerTick);
  if (step.blocked) {
    return handleBuilderBlocked(game, map, normalisedBuilder, job, {
      target,
      waypoint,
      distanceToWork,
      movementPath,
      finalState: CONSTRUCTION_JOB_STATES.pending
    });
  }
  return applyBuilderPosition({
    ...normalisedBuilder,
    blockedTicks: 0
  }, step.position, {
    status: step.slidAxis ? `sliding-${step.slidAxis}` : 'moving',
    target,
    waypoint,
    targetMode: 'construction',
    terrain: getTerrain(getTile(map, step.tile.x, step.tile.y)).id,
    distanceToTarget: tileDistance(step.position, workPoint),
    lastStepTiles: tileDistance(position, step.position),
    speedTilesPerTick,
    speedKph: speedTilesPerTick * MOVEMENT_MODEL.tileMeters / MOVEMENT_MODEL.tickMinutes * 0.06,
    movementPath
  }, map);
}

function applyBuilderWork(game, jobId, builderId, stats) {
  const jobIndex = (game.constructionJobs ?? []).findIndex((job) => job.id === jobId);
  if (jobIndex < 0) {
    return false;
  }
  const job = normaliseConstructionJob(game.constructionJobs[jobIndex]);
  const structure = (game.structures ?? []).find((candidate) => candidate.id === job.structureId);
  const builderCount = Math.max(1, job.assignedBuilderIds.length);
  const workRate = positiveNumber(structure?.construction?.workPerTick, 1) * Math.max(0.3, Number(getBuilderById(game, builderId)?.workPerTick) || 1);
  const nextProgress = Math.min(job.requiredWork, job.progress + workRate / Math.sqrt(builderCount));
  const complete = nextProgress >= job.requiredWork;
  game.constructionJobs[jobIndex] = {
    ...job,
    progress: round3(nextProgress),
    state: complete ? CONSTRUCTION_JOB_STATES.complete : CONSTRUCTION_JOB_STATES.active,
    updatedAtTick: game.tick ?? job.updatedAtTick
  };
  stats.constructionProgressUpdates += 1;
  updateStructureConstructionProgress(game, job.structureId, {
    progress: nextProgress,
    requiredWork: job.requiredWork,
    assignedBuilderIds: job.assignedBuilderIds,
    complete
  });
  return complete;
}

function handleBuilderBlocked(game, map, builder, job, { target, waypoint, distanceToWork, movementPath, finalState }) {
  const blockedTicks = (builder.blockedTicks ?? 0) + 1;
  if (blockedTicks >= BUILDER_CREW_TEMPLATE.blockedRetryTicks) {
    return releaseBlockedBuilder(game, builder, job, finalState);
  }
  const position = builder.position ?? builder.tile;
  const tile = positionToTile(map, position);
  return {
    ...builder,
    blockedTicks,
    state: 'moving',
    movement: normaliseLeaderMovement({
      status: 'blocked',
      target,
      waypoint,
      terrain: getTerrain(getTile(map, tile.x, tile.y)).id,
      distanceToTarget: distanceToWork,
      lastStepTiles: 0
    }, position),
    movementPath
  };
}

function releaseBlockedBuilder(game, builder, job, nextJobState = CONSTRUCTION_JOB_STATES.pending) {
  releaseBuilderFromJob(game, builder.id, job.id, nextJobState);
  return {
    ...builder,
    jobId: null,
    state: 'idle',
    blockedTicks: 0,
    movementPath: null
  };
}

function syncConstructionStructures(game, stats) {
  (game.constructionJobs ?? []).forEach((job) => {
    if (job.state === CONSTRUCTION_JOB_STATES.complete) {
      updateStructureConstructionProgress(game, job.structureId, {
        progress: job.requiredWork,
        requiredWork: job.requiredWork,
        assignedBuilderIds: job.assignedBuilderIds,
        complete: true
      });
      return;
    }
    updateStructureConstructionProgress(game, job.structureId, {
      progress: job.progress,
      requiredWork: job.requiredWork,
      assignedBuilderIds: job.assignedBuilderIds,
      complete: false
    });
  });
  game.structures = (game.structures ?? []).map(normaliseStructure);
  stats.plannedStructures = game.structures.filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.blueprint).length;
  stats.underConstructionStructures = game.structures.filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.underConstruction).length;
}

function createConstructionJobFromStructure(structure, { sourceBaseId = null, createdAtTick = 0 } = {}) {
  return normaliseConstructionJob({
    id: `job_construct_${structure.id}`,
    type: 'construct_structure',
    structureId: structure.id,
    factionId: structure.factionId,
    position: { ...structure.position },
    requiredWork: structure.construction.requiredWork,
    progress: 0,
    assignedBuilderIds: [],
    maxAssignedBuilders: structure.construction.maxAssignedBuilders,
    state: CONSTRUCTION_JOB_STATES.pending,
    sourceBaseId,
    createdAtTick,
    updatedAtTick: createdAtTick
  });
}

function findNearestClaimableConstructionJob(game, builder, jobsById) {
  return [...jobsById.values()]
    .filter((job) => job.factionId === builder.factionId)
    .filter((job) => [CONSTRUCTION_JOB_STATES.pending, CONSTRUCTION_JOB_STATES.claimed, CONSTRUCTION_JOB_STATES.active].includes(job.state))
    .filter((job) => job.sourceBaseId)
    .filter((job) => job.assignedBuilderIds.length < job.maxAssignedBuilders)
    .sort((a, b) => tileDistance(builder.position, a.position) - tileDistance(builder.position, b.position))[0] ?? null;
}

function findNearestBuilderBase(game, factionId, position) {
  const bases = findBuilderBases(game, factionId);
  return bases
    .sort((a, b) => tileDistance(a.position ?? a.tile, position) - tileDistance(b.position ?? b.tile, position))[0] ?? null;
}

function findBuilderBases(game, factionId) {
  const structures = (game?.structures ?? []).filter((structure) => (
    structure.factionId === factionId &&
    structure.construction?.state === CONSTRUCTION_STATES.complete
  ));
  const preferred = structures.filter((structure) => ['builder_yard', 'workshop'].includes(structure.type));
  if (preferred.length > 0) {
    return preferred;
  }
  return structures.filter((structure) => structure.type === 'outpost');
}

function updateStructureConstructionProgress(game, structureId, { progress, requiredWork, assignedBuilderIds, complete }) {
  game.structures = (game.structures ?? []).map((structure) => {
    if (structure.id !== structureId) {
      return structure;
    }
    const progressRatio = clamp01(progress / Math.max(1, requiredWork));
    const currentState = structure.construction?.state;
    const nextState = complete
      ? CONSTRUCTION_STATES.complete
      : progress > 0 || (assignedBuilderIds ?? []).length > 0
        ? CONSTRUCTION_STATES.underConstruction
        : currentState === CONSTRUCTION_STATES.underConstruction
          ? CONSTRUCTION_STATES.underConstruction
          : CONSTRUCTION_STATES.blueprint;
    return normaliseStructure({
      ...structure,
      construction: {
        ...structure.construction,
        state: nextState,
        progress: complete ? 1 : progressRatio,
        requiredWork,
        assignedBuilders: assignedBuilderIds ?? [],
        completedAtTick: complete ? structure.construction?.completedAtTick ?? game.tick ?? 0 : structure.construction?.completedAtTick ?? null
      }
    });
  });
}

function releaseBuilderFromJob(game, builderId, jobId, nextState = CONSTRUCTION_JOB_STATES.pending) {
  game.constructionJobs = (game.constructionJobs ?? []).map((job) => (
    job.id === jobId ? releaseConstructionJobBuilder(job, builderId, nextState, game.tick) : job
  ));
}

function releaseConstructionJobBuilder(job, builderId, nextState, tick) {
  const normalisedJob = normaliseConstructionJob(job);
  const assignedBuilderIds = normalisedJob.assignedBuilderIds.filter((id) => id !== builderId);
  if (normalisedJob.state === CONSTRUCTION_JOB_STATES.complete || normalisedJob.state === CONSTRUCTION_JOB_STATES.cancelled) {
    return {
      ...normalisedJob,
      assignedBuilderIds,
      updatedAtTick: tick ?? normalisedJob.updatedAtTick
    };
  }
  const state = nextState === CONSTRUCTION_JOB_STATES.blocked
    ? CONSTRUCTION_JOB_STATES.blocked
    : assignedBuilderIds.length > 0
      ? normalisedJob.progress > 0 ? CONSTRUCTION_JOB_STATES.active : CONSTRUCTION_JOB_STATES.claimed
      : CONSTRUCTION_JOB_STATES.pending;
  return {
    ...normalisedJob,
    assignedBuilderIds,
    state,
    updatedAtTick: tick ?? normalisedJob.updatedAtTick
  };
}

function markConstructionJobBlocked(game, jobId) {
  game.constructionJobs = (game.constructionJobs ?? []).map((job) => (
    job.id === jobId
      ? { ...normaliseConstructionJob(job), state: CONSTRUCTION_JOB_STATES.blocked, updatedAtTick: game.tick ?? job.updatedAtTick }
      : job
  ));
}

function getBuilderById(game, builderId) {
  return (game.builders ?? []).find((builder) => builder.id === builderId) ?? null;
}

function getStructureWorkPoint(game, map, structure, builder = null) {
  const candidates = getStructureWorkPointCandidates(structure);
  const builderPosition = builder?.position ?? builder?.tile ?? structure.position;
  const reachable = candidates
    .filter((point) => isInBounds(map, Math.round(point.x), Math.round(point.y)))
    .filter((point) => !isMovementBlocked(map, positionToTile(map, point), game, builder?.factionId, { allowTile: positionToTile(map, builderPosition) }))
    .map((point) => ({
      point,
      route: builder ? previewRouteToWorkPoint(map, game, builder, point) : null
    }))
    .filter((entry) => !builder || entry.route.reachable);
  if (builder && reachable.length === 0) {
    return null;
  }
  return (reachable.length > 0 ? reachable : candidates.map((point) => ({ point, route: null })))
    .sort((a, b) => {
      const aCost = a.route?.nodeCount ?? tileDistance(a.point, builderPosition);
      const bCost = b.route?.nodeCount ?? tileDistance(b.point, builderPosition);
      return aCost - bCost;
    })[0]?.point ?? null;
}

function getStructureWorkPointCandidates(structure) {
  const footprint = structure.footprint ?? {};
  const origin = structure.position ?? structure.tile ?? { x: 0, y: 0 };
  const halfWidth = Math.max(0.65, Number(footprint.width) / 2 || Number(footprint.radius) || 0.65);
  const halfHeight = Math.max(0.65, Number(footprint.height) / 2 || Number(footprint.radius) || 0.65);
  const pad = BUILDER_CREW_TEMPLATE.workRangeTiles * 0.55;
  const accessPoints = [
    ...(structure.occupancy?.entryPoints ?? []),
    ...(structure.occupancy?.exitPoints ?? [])
  ].map(roundPosition);
  const perimeter = [
    { x: origin.x, y: origin.y - halfHeight - pad },
    { x: origin.x, y: origin.y + halfHeight + pad },
    { x: origin.x - halfWidth - pad, y: origin.y },
    { x: origin.x + halfWidth + pad, y: origin.y },
    { x: origin.x - halfWidth - pad, y: origin.y - halfHeight - pad },
    { x: origin.x + halfWidth + pad, y: origin.y - halfHeight - pad },
    { x: origin.x - halfWidth - pad, y: origin.y + halfHeight + pad },
    { x: origin.x + halfWidth + pad, y: origin.y + halfHeight + pad }
  ].map(roundPosition);
  return dedupePoints([...accessPoints, ...perimeter]);
}

function previewRouteToWorkPoint(map, game, builder, point) {
  const target = resolveNavigableMovementTarget(map, builder, builder.position, clampToMapPosition(map, point));
  const flow = buildNavigationFlowField(map, target, game, builder.factionId);
  const nodes = materialiseFlowRoute(flow, builder.position, target);
  return {
    reachable: nodes.length >= 2 && validateRuntimeMovementPathNodes(map, game, builder, nodes),
    nodeCount: nodes.length
  };
}

function applyBuilderPosition(builder, position, movement, map) {
  const nextPosition = roundPosition(clampToMapPosition(map, position));
  const movementPath = advanceMovementPathCursor(movement.movementPath, nextPosition);
  return {
    ...builder,
    state: movement.status === 'working' ? 'working' : 'moving',
    position: nextPosition,
    tile: positionToTile(map, nextPosition),
    movement: normaliseLeaderMovement(movement, nextPosition),
    movementPath
  };
}

function resolveMovementStep(map, game, entity, position, waypoint, speedTilesPerTick) {
  const distanceToWaypoint = tileDistance(position, waypoint);
  const desired = movePositionTowards(position, waypoint, Math.min(speedTilesPerTick, distanceToWaypoint));
  const allowTile = positionToTile(map, position);
  const attempts = [
    { axis: null, position: desired },
    { axis: 'x', position: roundPosition({ x: desired.x, y: position.y }) },
    { axis: 'y', position: roundPosition({ x: position.x, y: desired.y }) }
  ];
  for (const attempt of attempts) {
    if (tileDistance(position, attempt.position) <= 0.0001) {
      continue;
    }
    const nextPosition = clampToMapPosition(map, attempt.position);
    const tile = positionToTile(map, nextPosition);
    if (!isMovementBlocked(map, tile, game, entity.factionId, { allowTile })) {
      return {
        blocked: false,
        slidAxis: attempt.axis,
        position: roundPosition(nextPosition),
        tile
      };
    }
  }
  return {
    blocked: true,
    slidAxis: null,
    position: roundPosition(position),
    tile: allowTile
  };
}

function structureFootprintsOverlap(a, b) {
  const aRadius = getStructurePlacementRadius(a);
  const bRadius = getStructurePlacementRadius(b);
  return tileDistance(a.position, b.position) < (aRadius + bRadius + 0.12);
}

function getStructurePlacementRadius(structure) {
  const footprint = structure?.footprint ?? {};
  return Math.max(
    0.45,
    Number(footprint.radius) || 0,
    (Number(footprint.width) || 0) / 2,
    (Number(footprint.height) || 0) / 2
  );
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
  const structures = game?.structures ?? [];
  const jobs = game?.constructionJobs ?? [];
  const builders = game?.builders ?? [];
  return {
    selectedPlacementType: null,
    plannedStructures: structures.filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.blueprint).length,
    underConstructionStructures: structures.filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.underConstruction).length,
    completedStructures: structures.filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.complete).length,
    jobsPending: jobs.filter((job) => job.state === CONSTRUCTION_JOB_STATES.pending || job.state === CONSTRUCTION_JOB_STATES.blocked).length,
    jobsActive: jobs.filter((job) => job.state === CONSTRUCTION_JOB_STATES.claimed || job.state === CONSTRUCTION_JOB_STATES.active).length,
    jobsComplete: jobs.filter((job) => job.state === CONSTRUCTION_JOB_STATES.complete).length,
    buildersIdle: builders.filter((builder) => builder.state === 'idle' && !builder.jobId).length,
    buildersAssigned: builders.filter((builder) => Boolean(builder.jobId)).length,
    buildersWorking: builders.filter((builder) => builder.state === 'working').length,
    constructionProgressUpdates: game?.constructionStats?.constructionProgressUpdates ?? 0,
    blockerSignatureChanges: game?.constructionStats?.blockerSignatureChanges ?? 0
  };
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
  const waypoint = getMovementPathWaypoint(movementPath, position);
  const blocked = isMovementBlocked(map, sampleTile, leader._runtimeOwner, leader.factionId, { allowTile: positionToTile(map, position) }) || !waypoint;
  const speedTilesPerTick = blocked
    ? 0
    : Math.max(
      MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
      MOVEMENT_MODEL.baseFootSpeedTilesPerTick * stance.moveMultiplier * terrainMultiplier
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
  const waypoint = getMovementPathWaypoint(movementPath, position);
  const blocked = isMovementBlocked(map, sampleTile, squad._runtimeOwner, squad.factionId, { allowTile: positionToTile(map, position) }) || !waypoint;
  const speedTilesPerTick = blocked
    ? 0
    : Math.max(
      MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
      MOVEMENT_MODEL.baseFootSpeedTilesPerTick * squad.speedMultiplier * stance.moveMultiplier * terrainMultiplier
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
  if (orderTarget && leader.factionId === 'player') {
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
  const orderTarget = squad.movementOrder?.target;
  if (orderTarget && squad.factionId === 'player') {
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

function resolveNavigableMovementTarget(map, entity, position, target) {
  const game = entity?._runtimeOwner;
  const targetTile = positionToTile(map, target);
  const startTile = positionToTile(map, position);
  if (!isMovementBlocked(map, targetTile, game, entity?.factionId, { allowTile: startTile })) {
    return roundPosition(target);
  }

  const fallback = findNearestNavigableTile(map, targetTile, game, entity?.factionId, startTile);
  return fallback ? tileToPosition(fallback) : roundPosition(position);
}

function findNearestNavigableTile(map, origin, game, factionId, startTile) {
  const visited = new Set();
  const queue = [{ tile: origin, distance: 0 }];
  const maxRadius = 4;
  while (queue.length > 0) {
    const entry = queue.shift();
    const key = tileKey(entry.tile);
    if (visited.has(key) || entry.distance > maxRadius) {
      continue;
    }
    visited.add(key);
    if (
      isInBounds(map, entry.tile.x, entry.tile.y) &&
      !isMovementBlocked(map, entry.tile, game, factionId, { allowTile: startTile })
    ) {
      return entry.tile;
    }
    [
      { x: entry.tile.x + 1, y: entry.tile.y },
      { x: entry.tile.x - 1, y: entry.tile.y },
      { x: entry.tile.x, y: entry.tile.y + 1 },
      { x: entry.tile.x, y: entry.tile.y - 1 },
      { x: entry.tile.x + 1, y: entry.tile.y + 1 },
      { x: entry.tile.x + 1, y: entry.tile.y - 1 },
      { x: entry.tile.x - 1, y: entry.tile.y + 1 },
      { x: entry.tile.x - 1, y: entry.tile.y - 1 }
    ].forEach((tile) => {
      if (isInBounds(map, tile.x, tile.y) && !visited.has(tileKey(tile))) {
        queue.push({ tile, distance: entry.distance + 1 });
      }
    });
  }
  return null;
}

function ensureMovementPath(map, entity, position, target) {
  const cached = normaliseMovementPath(entity.movementPath);
  const sourceSignature = createMovementSourceSignature(entity, target);
  const mapSignature = entityNavigationMapSignature(map, entity?._runtimeOwner);
  const targetPosition = roundPosition(target);

  if (
    cached &&
    !cached.blocked &&
    cached.sourceSignature === sourceSignature &&
    cached.mapSignature === mapSignature &&
    tileDistance(cached.target, targetPosition) <= 0.05 &&
    cached.cursor < cached.nodes.length
  ) {
    return advanceMovementPathCursor(cached, position);
  }

  return buildMovementPath(map, entity, position, targetPosition, sourceSignature, mapSignature);
}

function buildMovementPath(map, entity, position, target, sourceSignature, mapSignature) {
  const order = entity.factionId === 'player' ? normaliseMovementOrder(entity.movementOrder) : null;
  const anchors = order?.routeMode === 'player-intended'
    ? [position, ...order.path.slice(1)]
    : [position, target];
  const route = getSharedMovementRoute(map, entity, anchors, sourceSignature, mapSignature);
  const nodes = route.nodes;
  if (nodes.length < 2 || !validateRuntimeMovementPathNodes(map, entity?._runtimeOwner, entity, nodes)) {
    return {
      kind: order?.routeMode === 'player-intended' ? 'player-intended' : 'auto',
      target,
      sourceSignature,
      mapSignature,
      routeCacheKey: route.cacheKey,
      routeCacheHit: route.cacheHit,
      nodes: [roundPosition(position), target],
      cursor: 1,
      blocked: true,
      validation: nodes.length < 2 ? 'empty-route' : 'blocked-route-node'
    };
  }
  return {
    kind: order?.routeMode === 'player-intended' ? 'player-intended' : 'auto',
    target,
    sourceSignature,
    mapSignature,
    routeCacheKey: route.cacheKey,
    routeCacheHit: route.cacheHit,
    nodes,
    cursor: Math.min(1, nodes.length - 1),
    blocked: false
  };
}

function getSharedMovementRoute(map, entity, anchors, sourceSignature, mapSignature) {
  const cleanAnchors = normaliseMovementOrderPath(anchors);
  if (cleanAnchors.length < 2) {
    return { nodes: [], cacheKey: '', cacheHit: false };
  }

  const target = cleanAnchors[cleanAnchors.length - 1];
  const cache = getNavigationRouteCache(entity, map);
  const cacheKey = createSharedMovementRouteKey({
    mapSignature,
    sourceSignature,
    target,
    routeMode: entity.factionId === 'player' ? normaliseMovementOrder(entity.movementOrder)?.routeMode : 'auto'
  });
  const start = cleanAnchors[0];
  const cachedRoute = cache.routes.get(cacheKey);
  if (cachedRoute) {
    const startedAt = nowMs();
    const nodes = materialiseFlowRoute(cachedRoute.flow, start, target);
    recordNavigationRouteStat(cache, 'materialiseMs', nowMs() - startedAt);
    recordNavigationRouteStat(cache, 'cacheHits', 1);
    return {
      nodes,
      cacheKey,
      cacheHit: true
    };
  }

  const buildStartedAt = nowMs();
  const flow = buildNavigationFlowField(map, target, entity?._runtimeOwner, entity?.factionId);
  recordNavigationRouteStat(cache, 'flowBuildMs', nowMs() - buildStartedAt);
  recordNavigationRouteStat(cache, 'flowBuilds', 1);
  const route = {
    flow,
    target: roundPosition(target),
    builtAtTick: Number(entity?._gameTick ?? 0)
  };
  cache.routes.set(cacheKey, route);
  const materialiseStartedAt = nowMs();
  const nodes = materialiseFlowRoute(flow, start, target);
  recordNavigationRouteStat(cache, 'materialiseMs', nowMs() - materialiseStartedAt);
  recordNavigationRouteStat(cache, 'cacheMisses', 1);

  return {
    nodes,
    cacheKey,
    cacheHit: false
  };
}

function getNavigationRouteCache(entity, map) {
  const game = entity?._runtimeOwner;
  if (!game) {
    return { routes: new Map() };
  }

  const mapSignature = entityNavigationMapSignature(map, game);
  const existing = game._runtimeCache?.navigationRoutes;
  if (existing?.mapSignature === mapSignature && existing.routes instanceof Map) {
    return existing;
  }

  const nextCache = {
    mapSignature,
    routes: new Map(),
    stats: {}
  };
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    navigationRoutes: nextCache
  };
  return nextCache;
}

function recordNavigationRouteStat(cache, key, amount) {
  cache.stats = cache.stats ?? {};
  cache.stats[key] = round3((cache.stats[key] ?? 0) + amount);
}

function createSharedMovementRouteKey({ mapSignature, sourceSignature, target, routeMode }) {
  return [
    mapSignature,
    routeMode ?? 'auto',
    sourceSignature,
    round3(target.x),
    round3(target.y)
  ].join(':');
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
      if (!isInBounds(map, next.x, next.y) || isMovementBlocked(map, next, game, factionId)) {
        return;
      }

      const terrainField = getTerrainField(map, next.x, next.y);
      const currentCost = costSoFar.get(tileKey(current));
      const slopeCost = 1 + getElevationSlope(map, next.x, next.y) * 1.35;
      const structureCost = getStructureMovementCostModifier(game, map, next, factionId);
      const newCost = currentCost + (direction.cost * slopeCost * structureCost) / movementTerrainMultiplier(terrainField);
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

  return simplifyPath(nodes).map(roundPosition);
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

function getMovementPathWaypoint(movementPath, position) {
  const path = normaliseMovementPath(movementPath);
  if (!path || path.blocked) return null;
  const advanced = advanceMovementPathCursor(path, position);
  return advanced.nodes[advanced.cursor] ?? advanced.target;
}

function advanceMovementPathCursor(movementPath, position) {
  const path = normaliseMovementPath(movementPath);
  if (!path) return null;
  let cursor = path.cursor;
  while (
    cursor < path.nodes.length - 1 &&
    tileDistance(position, path.nodes[cursor]) <= MOVEMENT_MODEL.pathNodeArrivalDistanceTiles
  ) {
    cursor += 1;
  }
  return { ...path, cursor };
}

function createMovementSourceSignature(entity, target = null) {
  const order = normaliseMovementOrder(entity.movementOrder);
  if (order && entity.factionId === 'player') {
    return `player:${order.routeMode}:${pathSignature(order.path.slice(1))}`;
  }
  const stance = entity.behavior?.stance ?? 'probe';
  const targetSignature = target ? `${round3(target.x)},${round3(target.y)}` : 'no-target';
  return `ai:${entity.type}:${entity.factionId}:${stance}:${targetSignature}`;
}

function pathSignature(path) {
  return path.map((point) => `${round3(point.x)},${round3(point.y)}`).join('|');
}

function validateRuntimeMovementPathNodes(map, game, entity, nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return false;
  }
  const originTile = positionToTile(map, nodes[0]);
  return nodes.every((node, index) => {
    const tile = positionToTile(map, node);
    if (index === 0 && tile.x === originTile.x && tile.y === originTile.y) {
      return true;
    }
    return !isMovementBlocked(map, tile, game, entity?.factionId, { allowTile: originTile });
  });
}

function entityPathMapSignature(map) {
  return map.mapRef?.tileSignature ?? `${map.width}x${map.height}:${map.tiles.map((row) => row.join(',')).join('|')}`;
}

function entityNavigationMapSignature(map, game = null) {
  return [
    entityPathMapSignature(map),
    createStructureNavigationSignature(game)
  ].join('::structures:');
}

function advanceMovementOrder(movementOrder, position) {
  const order = normaliseMovementOrder(movementOrder);
  if (!order) {
    return null;
  }
  const nextIndex = order.path.findIndex((point, index) => index > 0 && isMeaningfulOrderPoint(position, point));
  if (nextIndex > 1) {
    order.path.splice(1, nextIndex - 1);
  }
  return {
    ...order,
    target: order.path[order.path.length - 1]
  };
}

function applyLeaderPosition(leader, position, movement, map) {
  const nextPosition = roundPosition(clampToMapPosition(map, position));
  const movementPath = advanceMovementPathCursor(movement.movementPath, nextPosition);
  return {
    ...leader,
    position: nextPosition,
    tile: positionToTile(map, nextPosition),
    movement: normaliseLeaderMovement(movement, nextPosition),
    movementOrder: advanceMovementOrder(leader.movementOrder, nextPosition),
    movementPath
  };
}

function applySquadPosition(squad, position, movement, map) {
  const nextPosition = roundPosition(clampToMapPosition(map, position));
  const movementPath = advanceMovementPathCursor(movement.movementPath, nextPosition);
  return {
    ...squad,
    position: nextPosition,
    tile: positionToTile(map, nextPosition),
    movement: normaliseLeaderMovement(movement, nextPosition),
    movementOrder: advanceMovementOrder(squad.movementOrder, nextPosition),
    movementPath
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
  return Math.round(clamp01(((attributes.firepower ?? 0.5) * 0.32) + ((attributes.cohesion ?? 0.5) * 0.26) + ((attributes.morale ?? 0.5) * 0.22) + ((attributes.discipline ?? 0.5) * 0.2)) * 100);
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

function stabilizePath(path) {
  const deduped = [];
  path.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || tileDistance(previous, point) >= 0.5) {
      deduped.push(point);
    }
  });
  if (deduped.length <= 2) {
    return deduped;
  }
  const smoothed = deduped.map((point, index) => {
    if (index === 0 || index === deduped.length - 1) {
      return point;
    }
    const previous = deduped[index - 1];
    const next = deduped[index + 1];
    return roundPosition({
      x: previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
      y: previous.y * 0.25 + point.y * 0.5 + next.y * 0.25
    });
  });
  return smoothed;
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

function nextMovementOrderPoint(path, position) {
  return path.find((point, index) => index > 0 && isMeaningfulOrderPoint(position, point)) ?? null;
}

function isMeaningfulOrderPoint(position, point) {
  return tileDistance(position, point) > MOVEMENT_MODEL.arrivalDistanceTiles * 2.5;
}

function movementTerrainMultiplier(terrainField) {
  return clamp(0.18, 1, terrainField.passability * 0.64 + terrainField.logistics * 0.24 + (1 - terrainField.height) * 0.12);
}

function isMovementBlocked(map, tile, game = null, factionId = null, { allowTile = null } = {}) {
  if (allowTile && allowTile.x === tile.x && allowTile.y === tile.y) {
    return false;
  }
  recordHardBlockerCheck(game);
  const terrainField = getTerrainField(map, tile.x, tile.y);
  return terrainField.passability < MOVEMENT_MODEL.impassableThreshold
    || terrainField.water >= 0.95
    || isTileBlockedByStructure(game, map, tile, factionId);
}

function tileKey(tile) {
  return `${tile.x},${tile.y}`;
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
