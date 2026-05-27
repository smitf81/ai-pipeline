import { getTerrain } from '../config/terrain.js';
import { getTerrainField } from '../world/fields.js';
import { getTile, isInBounds } from '../world/mapModel.js';
import { RESOURCE_IDS, spendResource } from './economy.js';
import { CONSTRUCTION_STATES, normaliseStructureInstance } from './structureRegistry.js';
import {
  CONSTRUCTION_JOB_STATES,
  getConstructionWoodBudget,
  getStructureWorkPointCandidates,
  normaliseConstructionJob
} from './constructionSystem.js';

export const SUPPLY_TRANSPORT_TEMPLATE = Object.freeze({
  speedMultiplier: 0.84,
  arrivalDistanceTiles: 0.32,
  deliveryDistanceTiles: 0.78,
  carryCapacity: 10
});

export const SUPPLY_TRANSPORT_STATES = Object.freeze({
  idle: 'idle',
  outbound: 'outbound',
  delivering: 'delivering',
  returning: 'returning',
  blocked: 'blocked'
});

export const SUPPLY_DEMAND_KINDS = Object.freeze({
  construction: 'construction',
  squad: 'squad',
  structure: 'structure'
});

export function createSupplyTransport({ id, factionId, name, tile, position, homeStructureId }, deps) {
  return normaliseTransport({
    id,
    type: deps.ENTITY_TYPES.transport,
    factionId,
    name,
    tile: { ...tile },
    position: position ?? deps.tileToPosition(tile),
    homeStructureId,
    state: SUPPLY_TRANSPORT_STATES.idle,
    targetKind: null,
    targetId: null,
    targetPosition: null,
    resourceId: null,
    carriedAmount: 0,
    lastDeliveryAmount: 0,
    speedMultiplier: SUPPLY_TRANSPORT_TEMPLATE.speedMultiplier
  }, deps);
}

export function normaliseTransport(transport, deps) {
  const tile = deps.cloneTile(transport.tile);
  const position = deps.normalisePosition(transport.position, tile);
  return {
    id: String(transport.id),
    type: deps.ENTITY_TYPES.transport,
    factionId: String(transport.factionId),
    name: transport.name ?? transport.id,
    tile,
    position,
    homeStructureId: typeof transport.homeStructureId === 'string' ? transport.homeStructureId : null,
    state: Object.values(SUPPLY_TRANSPORT_STATES).includes(transport.state) ? transport.state : SUPPLY_TRANSPORT_STATES.idle,
    targetKind: Object.values(SUPPLY_DEMAND_KINDS).includes(transport.targetKind) ? transport.targetKind : null,
    targetId: typeof transport.targetId === 'string' ? transport.targetId : null,
    targetPosition: transport.targetPosition && Number.isFinite(transport.targetPosition.x) && Number.isFinite(transport.targetPosition.y)
      ? deps.normalisePosition(transport.targetPosition, position)
      : null,
    resourceId: typeof transport.resourceId === 'string' ? transport.resourceId : null,
    carriedAmount: Math.max(0, Number(transport.carriedAmount) || 0),
    lastDeliveryAmount: Math.max(0, Number(transport.lastDeliveryAmount) || 0),
    speedMultiplier: deps.positiveNumber(transport.speedMultiplier, SUPPLY_TRANSPORT_TEMPLATE.speedMultiplier),
    collision: deps.normaliseMovableCollisionMetadata({ ...transport, type: deps.ENTITY_TYPES.transport }, transport.collision),
    movement: deps.normaliseLeaderMovement(transport.movement, position),
    movementPath: deps.normaliseMovementPath(transport.movementPath)
  };
}

export function normaliseTransports(transports = [], deps) {
  return (Array.isArray(transports) ? transports : []).map((transport) => normaliseTransport(transport, deps));
}

export function advanceLogistics(game, map, deps) {
  deps.ensureRuntimeCoordination(game, map);
  const assignIdleDemand = deps.shouldRunScheduledSystem(game, 'logistics');
  game.economy = deps.syncEconomyStorageCapacity(game);
  game.transports = syncSupplyTransportsForStorageStructures(game, map, deps);
  consumeFieldFood(game, map, deps);

  game.transports = advanceActiveTransports(game, map, deps, assignIdleDemand);

  if (assignIdleDemand) {
    deps.completeScheduledSystem(game, 'logistics');
    deps.clearRuntimeDirty(game, ['logistics']);
  }
  game.supplyLineStats = summarizeSupplyLines(game, deps);
}

export function advanceActiveTransports(game, map, deps, assignIdleDemand = true) {
  return (game.transports ?? []).map((transport) => {
    const normalisedTransport = normaliseTransport(transport, deps);
    const home = findSupplyHomeStructure(game, normalisedTransport);
    if (!home) {
      return {
        ...normalisedTransport,
        state: SUPPLY_TRANSPORT_STATES.idle,
        homeStructureId: null,
        carriedAmount: 0,
        targetKind: null,
        targetId: null,
        targetPosition: null,
        movementPath: null
      };
    }

    const homePoint = getSupplyTransportHomePoint(map, home, normalisedTransport, deps);
    if (normalisedTransport.carriedAmount > 0) {
      const target = resolveSupplyTransportTarget(game, normalisedTransport, deps);
      if (!target) {
        return moveSupplyTransportTowards(game, map, normalisedTransport, homePoint, SUPPLY_TRANSPORT_STATES.returning, 'supply-return', deps);
      }
      if (deps.tileDistance(normalisedTransport.position, target.position) <= SUPPLY_TRANSPORT_TEMPLATE.deliveryDistanceTiles) {
        applyTransportDelivery(game, normalisedTransport, target, deps);
        return moveSupplyTransportTowards(game, map, {
          ...normalisedTransport,
          carriedAmount: 0,
          lastDeliveryAmount: normalisedTransport.carriedAmount,
          targetKind: null,
          targetId: null,
          targetPosition: null,
          resourceId: null,
          movementPath: null
        }, homePoint, SUPPLY_TRANSPORT_STATES.returning, 'supply-return', deps);
      }
      return moveSupplyTransportTowards(game, map, normalisedTransport, target.position, SUPPLY_TRANSPORT_STATES.outbound, target.resourceId === RESOURCE_IDS.wood ? 'wood-delivery' : 'food-delivery', deps);
    }

    if (deps.tileDistance(normalisedTransport.position, homePoint) > SUPPLY_TRANSPORT_TEMPLATE.arrivalDistanceTiles && normalisedTransport.state === SUPPLY_TRANSPORT_STATES.returning) {
      return moveSupplyTransportTowards(game, map, normalisedTransport, homePoint, SUPPLY_TRANSPORT_STATES.returning, 'supply-return', deps);
    }

    const demand = assignIdleDemand ? findNearestSupplyDemand(game, normalisedTransport, deps) : null;
    if (!demand) {
      return {
        ...normalisedTransport,
        state: SUPPLY_TRANSPORT_STATES.idle,
        carriedAmount: 0,
        lastDeliveryAmount: 0,
        resourceId: null,
        targetKind: null,
        targetId: null,
        targetPosition: null,
        movementPath: null,
        movement: deps.normaliseLeaderMovement({
          status: 'idle',
          target: homePoint,
          targetMode: 'supply-home',
          distanceToTarget: deps.tileDistance(normalisedTransport.position, homePoint),
          lastStepTiles: 0
        }, normalisedTransport.position)
      };
    }

    const available = game.economy.factions?.[normalisedTransport.factionId]?.stockpiles?.[demand.resourceId]?.amount ?? 0;
    const carriedAmount = round3(Math.min(SUPPLY_TRANSPORT_TEMPLATE.carryCapacity, demand.amount, available));
    if (carriedAmount <= 0) {
      return {
        ...normalisedTransport,
        state: SUPPLY_TRANSPORT_STATES.idle,
        movementPath: null
      };
    }
    const spend = spendResource(game.economy, normalisedTransport.factionId, demand.resourceId, carriedAmount);
    if (!spend.ok) {
      return {
        ...normalisedTransport,
        state: SUPPLY_TRANSPORT_STATES.idle,
        movementPath: null
      };
    }
    game.economy = spend.economy;
    return moveSupplyTransportTowards(game, map, {
      ...normalisedTransport,
      state: SUPPLY_TRANSPORT_STATES.outbound,
      resourceId: demand.resourceId,
      carriedAmount,
      lastDeliveryAmount: 0,
      targetKind: demand.kind,
      targetId: demand.id,
      targetPosition: demand.position,
      movementPath: null
    }, demand.position, SUPPLY_TRANSPORT_STATES.outbound, demand.resourceId === RESOURCE_IDS.wood ? 'wood-delivery' : 'food-delivery', deps);
  });
}

export function assignIdleLogisticsTransports(game, map, deps) {
  game.transports = advanceActiveTransports(game, map, deps, true);
  return game.transports;
}

export function createLogisticsDemandSnapshot(game, factionId, deps) {
  return collectSupplyDemands(game, factionId, deps);
}

export function applyTransportDelivery(game, transport, target, deps) {
  if (transport.resourceId === RESOURCE_IDS.wood && target.kind === SUPPLY_DEMAND_KINDS.construction) {
    game.constructionJobs = (game.constructionJobs ?? []).map((job) => {
      const normalised = normaliseConstructionJob(job, deps);
      if (normalised.id !== target.id) {
        return normalised;
      }
      return {
        ...normalised,
        deliveredResources: {
          ...normalised.deliveredResources,
          [RESOURCE_IDS.wood]: round3((normalised.deliveredResources?.[RESOURCE_IDS.wood] ?? 0) + transport.carriedAmount)
        },
        resourceBlocker: null,
        updatedAtTick: game.tick ?? normalised.updatedAtTick
      };
    });
    return;
  }
  if (transport.resourceId === RESOURCE_IDS.food && target.kind === SUPPLY_DEMAND_KINDS.squad) {
    game.squads = (game.squads ?? []).map((squad) => {
      const normalised = deps.normaliseSquad(squad);
      if (normalised.id !== target.id) {
        return normalised;
      }
      const foodCapacity = normalised.supply.foodCapacity;
      const food = round3(Math.min(foodCapacity, normalised.supply.food + transport.carriedAmount));
      return {
        ...normalised,
        supply: {
          ...normalised.supply,
          food,
          foodRatio: round3(food / Math.max(1, foodCapacity)),
          starvingTicks: food > 0 ? 0 : normalised.supply.starvingTicks,
          lastFoodDelivered: round3(transport.carriedAmount),
          status: deps.getSquadSupplyStatus(food, foodCapacity)
        }
      };
    });
  }
}

export function summarizeSupplyLines(game, deps) {
  const transports = game?.transports ?? [];
  const squads = (game?.squads ?? []).map(deps.normaliseSquad);
  const jobs = (game?.constructionJobs ?? []).map((job) => normaliseConstructionJob(job, deps));
  return {
    transports: transports.length,
    transportsByState: Object.fromEntries(Object.values(SUPPLY_TRANSPORT_STATES).map((state) => [
      state,
      transports.filter((transport) => transport.state === state).length
    ])),
    carrying: round3(transports.reduce((sum, transport) => sum + (Number(transport.carriedAmount) || 0), 0)),
    woodDemand: round3(jobs.reduce((sum, job) => {
      if (job.state === CONSTRUCTION_JOB_STATES.complete || job.state === CONSTRUCTION_JOB_STATES.cancelled) {
        return sum;
      }
      const structure = (game?.structures ?? []).find((candidate) => candidate.id === job.structureId);
      return sum + Math.max(0, getConstructionWoodBudget(structure, job) - (job.deliveredResources?.[RESOURCE_IDS.wood] ?? 0));
    }, 0)),
    hungrySquads: squads.filter((squad) => squad.supply.food <= deps.FIELD_FOOD_SUPPLY.deliveryRequestThreshold).length,
    starvingSquads: squads.filter((squad) => squad.supply.food <= 0).length
  };
}

export function syncSupplyTransportsForStorageStructures(game, map, deps) {
  const existingTransports = new Map((game.transports ?? []).map((transport) => {
    const normalised = normaliseTransport(transport, deps);
    return [normalised.id, normalised];
  }));
  const transports = [];
  findSupplyStorageStructures(game).forEach((structure) => {
    const slots = Math.max(0, structure.storage?.transportSlots ?? 0);
    for (let index = 0; index < slots; index += 1) {
      const id = `transport_${structure.id}_${index + 1}`;
      const existing = existingTransports.get(id);
      const spawnPosition = getSupplyTransportSpawnPosition(map, structure, index, slots, deps);
      transports.push(normaliseTransport(existing ? {
        ...existing,
        factionId: structure.factionId,
        homeStructureId: structure.id,
        name: existing.name ?? `${structure.name} Transport ${index + 1}`
      } : createSupplyTransport({
        id,
        factionId: structure.factionId,
        name: `${structure.name} Transport ${index + 1}`,
        tile: structure.tile,
        position: spawnPosition,
        homeStructureId: structure.id
      }, deps), deps));
    }
  });
  return transports;
}

function findSupplyStorageStructures(game) {
  return (game.structures ?? [])
    .map(normaliseStructureInstance)
    .filter((structure) => (
      structure.factionId !== 'neutral' &&
      structure.construction?.state === CONSTRUCTION_STATES.complete &&
      structure.storage?.enabled &&
      structure.storage.transportSlots > 0
    ));
}

function findSupplyHomeStructure(game, transport) {
  return findSupplyStorageStructures(game).find((structure) => structure.id === transport.homeStructureId) ?? null;
}

function consumeFieldFood(game, map, deps) {
  const consumption = getFoodConsumptionPerTick(game.time, deps);
  game.squads = (game.squads ?? []).map((squad) => {
    const normalised = deps.normaliseSquad(squad);
    const currentFood = normalised.supply.food;
    const nextFood = round3(Math.max(0, currentFood - consumption));
    const starvingTicks = nextFood <= 0
      ? normalised.supply.starvingTicks + 1
      : 0;
    const status = deps.getSquadSupplyStatus(nextFood, normalised.supply.foodCapacity);
    let nextSquad = {
      ...normalised,
      supply: {
        ...normalised.supply,
        food: nextFood,
        foodRatio: round3(nextFood / Math.max(1, normalised.supply.foodCapacity)),
        starvingTicks,
        status
      }
    };
    if (starvingTicks >= deps.FIELD_FOOD_SUPPLY.starvationRetreatTicks) {
      nextSquad = returnHungrySquadToOutpost(game, map, nextSquad, deps);
    }
    return nextSquad;
  });
}

function getFoodConsumptionPerTick(time = null, deps) {
  const ticksPerDay = Number.isFinite(time?.ticksPerDay) && time.ticksPerDay > 0
    ? time.ticksPerDay
    : Math.max(1, Math.round(deps.GAME_TIME.dayLengthMs / deps.GAME_TIME.tickDurationMs));
  return deps.FIELD_FOOD_SUPPLY.consumptionPerDay / ticksPerDay;
}

function returnHungrySquadToOutpost(game, map, squad, deps) {
  const outpost = deps.findOutpostForSquad(game, squad);
  if (!outpost) {
    return squad;
  }
  if (squad.occupancy?.structureId) {
    removeSquadFromStructureOccupancy(game, squad.id, squad.occupancy.structureId);
  }
  return deps.issueFactionMovementOrder({
    ...squad,
    occupancy: deps.createFieldSquadOccupancy(),
    movementPath: null
  }, deps.tileToPosition(outpost.tile), game.tick, {
    routeMode: 'ai-director',
    stance: 'hold',
    intent: 'return-for-food',
    lastDecision: 'Out of food; returning to outpost'
  });
}

function removeSquadFromStructureOccupancy(game, squadId, structureId) {
  game.structures = (game.structures ?? []).map((structure) => {
    if (structure.id !== structureId) {
      return structure;
    }
    return normaliseStructureInstance({
      ...structure,
      occupancy: {
        ...structure.occupancy,
        occupants: (structure.occupancy?.occupants ?? []).filter((id) => id !== squadId)
      }
    });
  });
}

function findNearestSupplyDemand(game, transport, deps) {
  const demands = collectSupplyDemands(game, transport.factionId, deps)
    .filter((demand) => demand.amount > 0)
    .filter((demand) => (game.economy.factions?.[transport.factionId]?.stockpiles?.[demand.resourceId]?.amount ?? 0) > 0);
  return demands
    .sort((a, b) => deps.tileDistance(transport.position, a.position) - deps.tileDistance(transport.position, b.position))[0] ?? null;
}

function collectSupplyDemands(game, factionId, deps) {
  const demands = [];
  const inTransit = (kind, id, resourceId) => round3((game.transports ?? [])
    .filter((transport) => transport.targetKind === kind && transport.targetId === id && transport.resourceId === resourceId)
    .reduce((sum, transport) => sum + (Number(transport.carriedAmount) || 0), 0));

  (game.constructionJobs ?? []).map((job) => normaliseConstructionJob(job, deps)).forEach((job) => {
    if (job.factionId !== factionId || job.state === CONSTRUCTION_JOB_STATES.complete || job.state === CONSTRUCTION_JOB_STATES.cancelled) {
      return;
    }
    const structure = (game.structures ?? []).find((candidate) => candidate.id === job.structureId);
    const totalWood = getConstructionWoodBudget(structure, job);
    const remaining = round3(Math.max(0, totalWood - (job.deliveredResources?.[RESOURCE_IDS.wood] ?? 0) - inTransit(SUPPLY_DEMAND_KINDS.construction, job.id, RESOURCE_IDS.wood)));
    if (remaining > 0) {
      demands.push({
        kind: SUPPLY_DEMAND_KINDS.construction,
        id: job.id,
        resourceId: RESOURCE_IDS.wood,
        amount: remaining,
        position: roundPosition(job.position)
      });
    }
  });

  (game.squads ?? []).map(deps.normaliseSquad).forEach((squad) => {
    if (squad.factionId !== factionId || squad.health?.state === 'dead') {
      return;
    }
    const food = squad.supply ?? deps.normaliseSquadSupply();
    if (food.food > deps.FIELD_FOOD_SUPPLY.deliveryRequestThreshold) {
      return;
    }
    const remaining = round3(Math.max(0, food.foodCapacity - food.food - inTransit(SUPPLY_DEMAND_KINDS.squad, squad.id, RESOURCE_IDS.food)));
    if (remaining > 0) {
      demands.push({
        kind: SUPPLY_DEMAND_KINDS.squad,
        id: squad.id,
        resourceId: RESOURCE_IDS.food,
        amount: remaining,
        position: getSquadSupplyPosition(game, squad)
      });
    }
  });

  return demands;
}

function resolveSupplyTransportTarget(game, transport, deps) {
  if (!transport.targetKind || !transport.targetId || !transport.resourceId) {
    return null;
  }
  const demand = collectSupplyDemands(game, transport.factionId, deps)
    .find((candidate) => candidate.kind === transport.targetKind && candidate.id === transport.targetId && candidate.resourceId === transport.resourceId);
  if (demand) {
    return demand;
  }
  if (transport.targetPosition) {
    return {
      kind: transport.targetKind,
      id: transport.targetId,
      resourceId: transport.resourceId,
      amount: transport.carriedAmount,
      position: transport.targetPosition
    };
  }
  return null;
}

function moveSupplyTransportTowards(game, map, transport, targetPosition, state, targetMode, deps) {
  const position = deps.clampToMapPosition(map, transport.position);
  const movingTransport = deps.bindRuntimeOwner(normaliseTransport(transport, deps), game);
  const target = deps.resolveNavigableMovementTarget(map, movingTransport, position, deps.clampToMapPosition(map, targetPosition));
  const movementPath = deps.ensureMovementPath(map, movingTransport, position, target);
  const waypoint = deps.getMovementPathWaypoint(movementPath, position, { map, game, entity: movingTransport });
  if (!waypoint) {
    return {
      ...transport,
      state: SUPPLY_TRANSPORT_STATES.blocked,
      movementPath,
      movement: deps.normaliseLeaderMovement({
        status: 'blocked',
        target,
        waypoint: null,
        targetMode,
        distanceToTarget: deps.tileDistance(position, target),
        lastStepTiles: 0
      }, position)
    };
  }

  const sampleTile = deps.positionToTile(map, position);
  const terrainField = getTerrainField(map, sampleTile.x, sampleTile.y);
  const terrainMultiplier = deps.movementTerrainMultiplier(terrainField) / deps.getStructureMovementCostModifier(game, map, sampleTile, transport.factionId);
  const speedTilesPerTick = Math.max(
    deps.MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
    deps.MOVEMENT_MODEL.baseFootSpeedTilesPerTick * transport.speedMultiplier * 0.78 * terrainMultiplier
  );
  const step = deps.resolveMovementStep(map, game, movingTransport, position, waypoint, speedTilesPerTick);
  if (step.blocked) {
    return {
      ...transport,
      state: SUPPLY_TRANSPORT_STATES.blocked,
      movementPath,
      movement: deps.normaliseLeaderMovement({
        status: 'blocked',
        target,
        waypoint,
        targetMode,
        distanceToTarget: deps.tileDistance(position, target),
        lastStepTiles: 0
      }, position)
    };
  }

  const nextPosition = roundPosition(step.position);
  return {
    ...transport,
    state,
    position: nextPosition,
    tile: deps.positionToTile(map, nextPosition),
    movement: deps.normaliseLeaderMovement({
      status: step.slidAxis ? `sliding-${step.slidAxis}` : 'moving',
      target,
      waypoint,
      targetMode,
      terrain: getTerrain(getTile(map, step.tile.x, step.tile.y)).id,
      distanceToTarget: deps.tileDistance(nextPosition, target),
      lastStepTiles: deps.tileDistance(position, nextPosition),
      speedTilesPerTick,
      speedKph: speedTilesPerTick * deps.MOVEMENT_MODEL.tileMeters / deps.MOVEMENT_MODEL.tickMinutes * 0.06,
      movementPath
    }, nextPosition),
    movementPath: deps.advanceMovementPathCursor(movementPath, nextPosition)
  };
}

function getSupplyTransportHomePoint(map, structure, transport, deps) {
  const candidates = getStructureWorkPointCandidates(structure)
    .filter((point) => isInBounds(map, Math.round(point.x), Math.round(point.y)));
  return (candidates.length > 0 ? candidates : [structure.position ?? structure.tile])
    .map(roundPosition)
    .sort((a, b) => deps.tileDistance(a, transport.position ?? transport.tile) - deps.tileDistance(b, transport.position ?? transport.tile))[0];
}

function getSupplyTransportSpawnPosition(map, structure, index, total, deps) {
  const origin = structure.position ?? structure.tile;
  const angle = total > 0 ? (Math.PI * 2 * index) / total : 0;
  return roundPosition(deps.clampToMapPosition(map, {
    x: origin.x + Math.cos(angle) * 0.72,
    y: origin.y + Math.sin(angle) * 0.72
  }));
}

function getSquadSupplyPosition(game, squad) {
  if (squad.occupancy?.state === 'occupied' && squad.occupancy.structureId) {
    const structure = (game.structures ?? []).find((candidate) => candidate.id === squad.occupancy.structureId);
    if (structure) {
      return roundPosition(structure.position ?? structure.tile);
    }
  }
  return roundPosition(squad.position ?? squad.tile);
}

function roundPosition(position) {
  return {
    x: round3(position.x),
    y: round3(position.y)
  };
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
