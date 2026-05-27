import { getTerrain } from '../config/terrain.js';
import { getTerrainField } from '../world/fields.js';
import { getTile, isInBounds } from '../world/mapModel.js';
import { RESOURCE_IDS, spendCost, scaleResourceCost } from './economy.js';
import { CONSTRUCTION_STATES, createStructureInstance, getStructureDefinition, normaliseStructureInstance } from './structureRegistry.js';
import { createStructureNavigationSignature } from './structureTopology.js';

export const BUILDER_CREW_TEMPLATE = Object.freeze({
  unitId: 'builder_crew',
  label: 'Construction Crew',
  workPerTick: 1,
  speedMultiplier: 0.78,
  claimCadenceTicks: 2,
  workRangeTiles: 1.15,
  workPointRetryTicks: 3,
  blockedRetryTicks: 8
});

export const CONSTRUCTION_JOB_STATES = Object.freeze({
  pending: 'pending',
  claimed: 'claimed',
  active: 'active',
  complete: 'complete',
  blocked: 'blocked',
  cancelled: 'cancelled'
});

export function normaliseConstructionJob(job, deps) {
  const position = deps.normalisePosition(job.position, job.tile);
  const state = Object.values(CONSTRUCTION_JOB_STATES).includes(job.state) ? job.state : CONSTRUCTION_JOB_STATES.pending;
  const requiredWork = deps.positiveNumber(job.requiredWork, 1);
  const progress = deps.clamp(0, requiredWork, Number(job.progress) || 0);
  return {
    id: String(job.id),
    type: 'construct_structure',
    structureId: String(job.structureId),
    factionId: String(job.factionId ?? 'neutral'),
    position,
    requiredWork,
    progress,
    deliveredResources: normaliseDeliveredResources(job.deliveredResources),
    resourceBlocker: typeof job.resourceBlocker === 'string' ? job.resourceBlocker : null,
    assignedBuilderIds: Array.isArray(job.assignedBuilderIds) ? job.assignedBuilderIds.filter((id) => typeof id === 'string') : [],
    maxAssignedBuilders: Math.max(1, Math.floor(deps.positiveNumber(job.maxAssignedBuilders, 1))),
    state,
    sourceBaseId: typeof job.sourceBaseId === 'string' ? job.sourceBaseId : null,
    createdAtTick: Number.isInteger(job.createdAtTick) ? Math.max(0, job.createdAtTick) : 0,
    updatedAtTick: Number.isInteger(job.updatedAtTick) ? Math.max(0, job.updatedAtTick) : 0
  };
}

export function normaliseConstructionJobs(jobs = [], deps) {
  return (Array.isArray(jobs) ? jobs : []).map((job) => normaliseConstructionJob(job, deps));
}

export function createConstructionJobFromStructure(structure, { sourceBaseId = null, createdAtTick = 0 } = {}, deps) {
  return normaliseConstructionJob({
    id: `job_construct_${structure.id}`,
    type: 'construct_structure',
    structureId: structure.id,
    factionId: structure.factionId,
    position: { ...structure.position },
    requiredWork: structure.construction.requiredWork,
    progress: 0,
    deliveredResources: { [RESOURCE_IDS.wood]: Math.max(0, Number(structure.construction?.resourceCost?.[RESOURCE_IDS.wood]) || 0) },
    resourceBlocker: null,
    assignedBuilderIds: [],
    maxAssignedBuilders: structure.construction.maxAssignedBuilders,
    state: CONSTRUCTION_JOB_STATES.pending,
    sourceBaseId,
    createdAtTick,
    updatedAtTick: createdAtTick
  }, deps);
}

export function placeStructurePathBuildOrder(game, map, { type, factionId = 'player', path = [] } = {}, deps) {
  const validation = deps.validateStructurePathPlacement(game, map, { type, factionId, path });
  if (!validation.valid) {
    return { ok: false, reason: validation.reason, validation, game };
  }
  const definition = getStructureDefinition(type);
  const segments = validation.pathPlan?.segments ?? [];
  const resourceCost = validation.resourceCost ?? scaleResourceCost(definition.construction?.resourceCost ?? { supplies: validation.cost }, validation.pathPlan?.segments?.length ?? 1);
  const purchase = spendCost(game.economy, factionId, resourceCost);
  if (!purchase.ok) {
    return { ok: false, reason: purchase.reason, validation: { ...validation, valid: false, reason: purchase.reason }, game };
  }

  game.economy = purchase.economy;
  const existingCount = (game.structures ?? []).filter((structure) => structure.type === type && structure.factionId === factionId).length;
  const pathId = `path_${type}_${factionId}_${game.tick ?? 0}_${segments[0]?.tile?.x ?? 0}_${segments[0]?.tile?.y ?? 0}`;
  const structures = segments.map((segment, index) => {
    const sequence = existingCount + index + 1;
    const id = `structure_${type}_${factionId}_${String(sequence).padStart(2, '0')}_${segment.tile.x}_${segment.tile.y}`;
    return createStructureInstance(type, {
      id,
      factionId,
      name: `${deps.FACTIONS[factionId]?.label ?? factionId} ${definition.label} ${sequence}`,
      tile: segment.tile,
      position: segment.position,
      orientation: segment.orientation,
      joinery: {
        ...segment.joinery,
        pathId,
        pathBlueprint: true,
        segmentIndex: index,
        segmentCount: segments.length
      },
      construction: {
        state: CONSTRUCTION_STATES.blueprint,
        progress: 0,
        requiredWork: definition.construction.requiredWork,
        assignedBuilders: [],
        createdAtTick: game.tick ?? 0
      }
    });
  });
  const jobs = structures.map((structure) => createConstructionJobFromStructure(structure, {
    sourceBaseId: validation.sourceBaseId,
    createdAtTick: game.tick ?? 0
  }, deps));

  game.structures = deps.refreshStructureJoineryConnections([...(game.structures ?? []), ...structures]);
  game.constructionJobs = [...(game.constructionJobs ?? []), ...jobs];
  game.selectedEntityId = structures[structures.length - 1]?.id ?? game.selectedEntityId;
  game.constructionStats = {
    ...summarizeConstruction(game),
    lastPlacedStructureId: game.selectedEntityId,
    lastPlacedPathId: pathId,
    lastPlacedPathSegments: structures.length
  };
  deps.emitRuntimeEvent(game, {
    type: 'economy:spent',
    factionId,
    payload: { resourceCost, legacySupplyCost: validation.cost, reason: 'path-build-order' }
  });
  jobs.forEach((job) => deps.emitRuntimeEvent(game, {
    type: 'construction:job_created',
    factionId,
    payload: { jobId: job.id, structureId: job.structureId, structureType: type, pathId }
  }));

  return {
    ok: true,
    structures,
    jobs,
    validation,
    cost: validation.cost,
    resourceCost,
    pathId,
    game: deps.recomputeGameState(game, map)
  };
}

export function placeStructureBuildOrder(game, map, { type, factionId = 'player', position = null, tile = null } = {}, deps) {
  const validation = deps.validateStructurePlacement(game, map, { type, factionId, position, tile });
  if (!validation.valid) {
    return { ok: false, reason: validation.reason, validation, game };
  }

  const definition = getStructureDefinition(type);
  const resourceCost = validation.resourceCost ?? definition.construction?.resourceCost ?? { supplies: validation.cost };
  const purchase = spendCost(game.economy, factionId, resourceCost);
  if (!purchase.ok) {
    return { ok: false, reason: purchase.reason, validation: { ...validation, valid: false, reason: purchase.reason }, game };
  }

  game.economy = purchase.economy;
  const beforeSignature = createStructureNavigationSignature(game);
  const relation = validation.placementRelation ?? null;
  const replacedStructure = relation?.mode === 'replace'
    ? (game.structures ?? []).find((structure) => structure.id === relation.targetStructureId) ?? null
    : null;

  if (replacedStructure) {
    game.structures = (game.structures ?? []).filter((structure) => structure.id !== replacedStructure.id);
    game.constructionJobs = (game.constructionJobs ?? []).filter((job) => job.structureId !== replacedStructure.id);
  }

  const existingCount = (game.structures ?? []).filter((structure) => structure.type === type && structure.factionId === factionId).length + 1;
  const id = `structure_${type}_${factionId}_${String(existingCount).padStart(2, '0')}_${validation.tile.x}_${validation.tile.y}`;
  const staticConnections = (validation.connectors ?? []).map((connector) => ({
    kind: connector.mode ?? 'structure',
    direction: deps.directionFromTo(validation.tile, connector.tile ?? connector.position),
    structureId: connector.id,
    structureType: connector.type,
    distance: deps.tileDistance(validation.tile, connector.tile ?? connector.position),
    socket: connector.socket ?? null,
    socketRole: connector.socketRole ?? null
  }));
  if (replacedStructure) {
    staticConnections.push({
      kind: 'replaces',
      direction: 'same',
      structureId: replacedStructure.id,
      structureType: replacedStructure.type,
      distance: 0,
      socket: 'same',
      socketRole: 'built_on'
    });
  }
  const structure = createStructureInstance(type, {
    id,
    factionId,
    name: `${deps.FACTIONS[factionId]?.label ?? factionId} ${definition.label} ${existingCount}`,
    tile: validation.tile,
    position: validation.position,
    orientation: replacedStructure?.orientation ?? validation.orientation ?? null,
    joinery: {
      connections: staticConnections,
      joinMask: deps.createJoinMask(staticConnections),
      builtOnStructureId: relation?.mode === 'build-on' ? relation.targetStructureId : null,
      replacedStructureId: replacedStructure?.id ?? null,
      socketRole: relation?.mode ?? null
    },
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
  }, deps);

  game.structures = deps.refreshStructureJoineryConnections([...(game.structures ?? []), structure]);
  game.constructionJobs = [...(game.constructionJobs ?? []), job];
  game.selectedEntityId = structure.id;
  game.constructionStats = {
    ...summarizeConstruction(game),
    lastPlacedStructureId: structure.id,
    lastPlacementRelation: relation?.mode ?? null,
    lastReplacedStructureId: replacedStructure?.id ?? null
  };
  deps.emitStructureNavigationChange(game, beforeSignature, createStructureNavigationSignature(game), {
    reason: 'build-order',
    structureId: structure.id,
    replacedStructureId: replacedStructure?.id ?? null
  });
  deps.emitRuntimeEvent(game, {
    type: 'economy:spent',
    factionId,
    payload: { resourceCost, legacySupplyCost: validation.cost, reason: 'build-order' }
  });
  deps.emitRuntimeEvent(game, {
    type: 'construction:job_created',
    factionId,
    payload: { jobId: job.id, structureId: structure.id, structureType: type }
  });

  return {
    ok: true,
    structure,
    replacedStructure,
    job,
    validation,
    cost: validation.cost,
    resourceCost,
    game: deps.recomputeGameState(game, map)
  };
}

export function advanceConstruction(game, map, deps) {
  const stats = {
    ...summarizeConstruction(game),
    constructionProgressUpdates: 0,
    blockerSignatureChanges: 0
  };
  const beforeSignature = createStructureNavigationSignature(game);
  const beforeJobStates = new Map((game.constructionJobs ?? []).map((job) => [job.id, normaliseConstructionJob(job, deps).state]));
  refreshConstructionJobBases(game, deps);
  claimAvailableConstructionJobs(game, deps);

  game.builders = (game.builders ?? []).map((builder) => advanceBuilderCrew(game, map, builder, stats, deps));
  game.constructionJobs = normaliseConstructionJobs(game.constructionJobs, deps);
  syncConstructionStructures(game, stats);
  game.constructionJobs
    .filter((job) => job.state === CONSTRUCTION_JOB_STATES.complete && beforeJobStates.get(job.id) !== CONSTRUCTION_JOB_STATES.complete)
    .forEach((job) => deps.emitRuntimeEvent(game, {
      type: 'construction:job_completed',
      factionId: job.factionId,
      payload: { jobId: job.id, structureId: job.structureId }
    }));

  const afterSignature = createStructureNavigationSignature(game);
  if (deps.emitStructureNavigationChange(game, beforeSignature, afterSignature, {
    reason: 'construction-job-sync'
  })) {
    stats.blockerSignatureChanges += 1;
  }
  game.constructionStats = {
    ...summarizeConstruction(game),
    constructionProgressUpdates: stats.constructionProgressUpdates,
    blockerSignatureChanges: stats.blockerSignatureChanges
  };
}

export function assignIdleBuildersToConstruction(game, deps) {
  return claimAvailableConstructionJobs(game, deps);
}

export function validateConstructionAccess(game, map, structure, factionId, sourceBase, deps) {
  if (!sourceBase) {
    return { valid: false, reason: 'missing-builder-base', message: 'No builder base can service this blueprint' };
  }
  const support = deps.validatePlacementFootprintSupport(map, structure);
  if (!support.valid) {
    return support;
  }
  const start = deps.clampToMapPosition(map, sourceBase.position ?? sourceBase.tile);
  const startTile = deps.positionToTile(map, start);
  const candidates = getStructureWorkPointCandidates(structure)
    .filter((point) => isInBounds(map, Math.round(point.x), Math.round(point.y)))
    .filter((point) => !deps.isMovementBlocked(map, deps.positionToTile(map, point), game, factionId, { allowTile: startTile }))
    .map((point) => ({ point, distance: deps.tileDistance(start, point), tile: deps.positionToTile(map, point) }))
    .sort((a, b) => a.distance - b.distance);

  const directlyReachable = candidates.filter((entry) => isDirectConstructionRouteReachable(map, game, factionId, startTile, entry.tile, deps));
  const reachable = directlyReachable.length > 0
    ? directlyReachable
    : candidates.filter((entry) => isTileReachableForConstruction(map, game, factionId, startTile, entry.tile, deps));
  if (reachable.length === 0) {
    return {
      valid: false,
      reason: 'no-builder-access',
      message: 'Builders need a reachable edge to work this blueprint',
      candidateCount: candidates.length
    };
  }
  return {
    valid: true,
    reason: 'reachable',
    message: 'Builder access ready',
    workPoint: roundPosition(reachable[0].point),
    candidateCount: candidates.length
  };
}

export function getConstructionReachabilityCacheKey(map, game, factionId, startTile, deps) {
  return [
    map.width,
    map.height,
    Math.max(0, Number(game?.versions?.map) || 0),
    Math.max(0, Number(game?.versions?.nav) || 0),
    factionId ?? 'any',
    startTile.x,
    startTile.y,
    deps.entityNavigationMapSignature(map, game)
  ].join(':');
}

export function getStructureWorkPointCandidates(structure) {
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

export function getConstructionWoodBudget(structure, job) {
  const timberShare = Number(structure?.construction?.materials?.timber) || 0;
  return round3(Math.max(0, job.requiredWork * timberShare * 0.25));
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
    occupiedStructures: structures.filter((structure) => (structure.occupancy?.occupants?.length ?? 0) > 0).length,
    occupiedSquads: structures.reduce((sum, structure) => sum + (structure.occupancy?.occupants?.length ?? 0), 0),
    constructionProgressUpdates: game?.constructionStats?.constructionProgressUpdates ?? 0,
    blockerSignatureChanges: game?.constructionStats?.blockerSignatureChanges ?? 0
  };
}

function refreshConstructionJobBases(game, deps) {
  game.constructionJobs = normaliseConstructionJobs(game.constructionJobs, deps).map((normalisedJob) => {
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

function claimAvailableConstructionJobs(game, deps) {
  const jobsById = new Map((game.constructionJobs ?? []).map((job) => [job.id, normaliseConstructionJob(job, deps)]));
  game.builders = (game.builders ?? []).map((builder) => {
    const normalisedBuilder = deps.normaliseBuilder(builder);
    if (normalisedBuilder.jobId || normalisedBuilder.state !== 'idle') {
      return normalisedBuilder;
    }
    if ((game.tick ?? 0) - normalisedBuilder.lastClaimTick < BUILDER_CREW_TEMPLATE.claimCadenceTicks) {
      return normalisedBuilder;
    }
    const job = findNearestClaimableConstructionJob(game, normalisedBuilder, jobsById, deps);
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
      workPoint: null,
      movementPath: null
    };
  });
  game.constructionJobs = [...jobsById.values()];
}

function advanceBuilderCrew(game, map, builder, stats, deps) {
  const normalisedBuilder = deps.normaliseBuilder(builder);
  if (!normalisedBuilder.jobId) {
    return normalisedBuilder;
  }
  const job = (game.constructionJobs ?? []).find((candidate) => candidate.id === normalisedBuilder.jobId);
  const structure = job ? (game.structures ?? []).find((candidate) => candidate.id === job.structureId) : null;
  if (!job || !structure || job.state === CONSTRUCTION_JOB_STATES.cancelled || job.state === CONSTRUCTION_JOB_STATES.complete) {
    releaseBuilderFromJob(game, normalisedBuilder.id, normalisedBuilder.jobId, CONSTRUCTION_JOB_STATES.pending, deps);
    return {
      ...normalisedBuilder,
      jobId: null,
      state: 'idle',
      workPoint: null,
      movementPath: null
    };
  }

  const position = deps.clampToMapPosition(map, normalisedBuilder.position);
  deps.bindRuntimeOwner(normalisedBuilder, game);
  const workPoint = getStructureWorkPoint(game, map, structure, normalisedBuilder, deps);
  if (!workPoint) {
    return releaseBlockedBuilder(game, normalisedBuilder, job, CONSTRUCTION_JOB_STATES.blocked, deps);
  }
  const distanceToWork = deps.tileDistance(position, workPoint);
  if (distanceToWork <= BUILDER_CREW_TEMPLATE.workRangeTiles) {
    const completed = applyBuilderWork(game, job.id, normalisedBuilder.id, stats, deps);
    if (completed) {
      return {
        ...normalisedBuilder,
        jobId: null,
        state: 'idle',
        blockedTicks: 0,
        workPoint: null,
        movementPath: null,
        avoidedWorkPointKeys: []
      };
    }
    return {
      ...normalisedBuilder,
      state: 'working',
      blockedTicks: 0,
      workPoint,
      avoidedWorkPointKeys: [],
      movement: deps.normaliseLeaderMovement({
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

  const target = deps.resolveNavigableMovementTarget(map, normalisedBuilder, position, deps.clampToMapPosition(map, workPoint));
  const movementPath = deps.ensureMovementPath(map, normalisedBuilder, position, target);
  const waypoint = deps.getMovementPathWaypoint(movementPath, position, { map, game, entity: normalisedBuilder });
  if (!waypoint) {
    return handleBuilderBlocked(game, map, normalisedBuilder, job, {
      target,
      waypoint: null,
      distanceToWork,
      movementPath,
      finalState: CONSTRUCTION_JOB_STATES.blocked
    }, deps);
  }

  const sampleTile = deps.positionToTile(map, position);
  const terrainField = getTerrainField(map, sampleTile.x, sampleTile.y);
  const terrainMultiplier = deps.movementTerrainMultiplier(terrainField) / deps.getStructureMovementCostModifier(game, map, sampleTile, normalisedBuilder.factionId);
  const speedTilesPerTick = Math.max(
    deps.MOVEMENT_MODEL.minimumFootSpeedTilesPerTick,
    deps.MOVEMENT_MODEL.baseFootSpeedTilesPerTick * normalisedBuilder.speedMultiplier * 0.72 * terrainMultiplier
  );
  const step = deps.resolveMovementStep(map, game, normalisedBuilder, position, waypoint, speedTilesPerTick);
  if (step.blocked) {
    return handleBuilderBlocked(game, map, normalisedBuilder, job, {
      target,
      waypoint,
      distanceToWork,
      movementPath,
      finalState: CONSTRUCTION_JOB_STATES.pending
    }, deps);
  }
  return applyBuilderPosition({
    ...normalisedBuilder,
    blockedTicks: 0,
    workPoint,
    avoidedWorkPointKeys: []
  }, step.position, {
    status: step.slidAxis ? `sliding-${step.slidAxis}` : 'moving',
    target,
    waypoint,
    targetMode: 'construction',
    terrain: getTerrain(getTile(map, step.tile.x, step.tile.y)).id,
    distanceToTarget: deps.tileDistance(step.position, workPoint),
    lastStepTiles: deps.tileDistance(position, step.position),
    speedTilesPerTick,
    speedKph: speedTilesPerTick * deps.MOVEMENT_MODEL.tileMeters / deps.MOVEMENT_MODEL.tickMinutes * 0.06,
    movementPath
  }, map, deps);
}

function applyBuilderWork(game, jobId, builderId, stats, deps) {
  const jobIndex = (game.constructionJobs ?? []).findIndex((job) => job.id === jobId);
  if (jobIndex < 0) {
    return false;
  }
  const job = normaliseConstructionJob(game.constructionJobs[jobIndex], deps);
  const structure = (game.structures ?? []).find((candidate) => candidate.id === job.structureId);
  const builderCount = Math.max(1, job.assignedBuilderIds.length);
  const workRate = deps.positiveNumber(structure?.construction?.workPerTick, 1) * Math.max(0.3, Number(getBuilderById(game, builderId)?.workPerTick) || 1);
  const woodNeeded = getConstructionWoodForWork(structure, job, workRate / Math.sqrt(builderCount));
  if (woodNeeded > 0 && (job.deliveredResources?.[RESOURCE_IDS.wood] ?? 0) < woodNeeded) {
    game.constructionJobs[jobIndex] = {
      ...job,
      state: CONSTRUCTION_JOB_STATES.active,
      resourceBlocker: RESOURCE_IDS.wood,
      updatedAtTick: game.tick ?? job.updatedAtTick
    };
    updateStructureConstructionProgress(game, job.structureId, {
      progress: job.progress,
      requiredWork: job.requiredWork,
      assignedBuilderIds: job.assignedBuilderIds,
      complete: false
    });
    return false;
  }
  const nextProgress = Math.min(job.requiredWork, job.progress + workRate / Math.sqrt(builderCount));
  const complete = nextProgress >= job.requiredWork;
  const deliveredResources = {
    ...job.deliveredResources,
    [RESOURCE_IDS.wood]: round3(Math.max(0, (job.deliveredResources?.[RESOURCE_IDS.wood] ?? 0) - woodNeeded))
  };
  game.constructionJobs[jobIndex] = {
    ...job,
    progress: round3(nextProgress),
    deliveredResources,
    resourceBlocker: null,
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

function handleBuilderBlocked(game, map, builder, job, { target, waypoint, distanceToWork, movementPath, finalState }, deps) {
  const blockedTicks = (builder.blockedTicks ?? 0) + 1;
  if (blockedTicks >= BUILDER_CREW_TEMPLATE.blockedRetryTicks) {
    return releaseBlockedBuilder(game, builder, job, finalState, deps);
  }
  const position = builder.position ?? builder.tile;
  const tile = deps.positionToTile(map, position);
  const shouldRetryWorkPoint = blockedTicks >= BUILDER_CREW_TEMPLATE.workPointRetryTicks && builder.workPoint;
  const avoidedWorkPointKeys = shouldRetryWorkPoint
    ? dedupeWorkPointKeys([...(builder.avoidedWorkPointKeys ?? []), workPointKey(builder.workPoint)])
    : builder.avoidedWorkPointKeys ?? [];
  return {
    ...builder,
    blockedTicks: shouldRetryWorkPoint ? 0 : blockedTicks,
    state: 'moving',
    workPoint: shouldRetryWorkPoint ? null : builder.workPoint ?? null,
    avoidedWorkPointKeys,
    movement: deps.normaliseLeaderMovement({
      status: shouldRetryWorkPoint ? 'rerouting-construction-access' : 'blocked',
      target,
      waypoint,
      terrain: getTerrain(getTile(map, tile.x, tile.y)).id,
      distanceToTarget: distanceToWork,
      lastStepTiles: 0
    }, position),
    movementPath: shouldRetryWorkPoint ? null : movementPath
  };
}

function releaseBlockedBuilder(game, builder, job, nextJobState = CONSTRUCTION_JOB_STATES.pending, deps) {
  releaseBuilderFromJob(game, builder.id, job.id, nextJobState, deps);
  return {
    ...builder,
    jobId: null,
    state: 'idle',
    blockedTicks: 0,
    workPoint: null,
    avoidedWorkPointKeys: [],
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
  game.structures = (game.structures ?? []).map(normaliseStructureInstance);
  stats.plannedStructures = game.structures.filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.blueprint).length;
  stats.underConstructionStructures = game.structures.filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.underConstruction).length;
}

function findNearestClaimableConstructionJob(game, builder, jobsById, deps) {
  return [...jobsById.values()]
    .filter((job) => job.factionId === builder.factionId)
    .filter((job) => [CONSTRUCTION_JOB_STATES.pending, CONSTRUCTION_JOB_STATES.claimed, CONSTRUCTION_JOB_STATES.active].includes(job.state))
    .filter((job) => job.sourceBaseId)
    .filter((job) => job.assignedBuilderIds.length < job.maxAssignedBuilders)
    .sort((a, b) => deps.tileDistance(builder.position, a.position) - deps.tileDistance(builder.position, b.position))[0] ?? null;
}

export function findNearestBuilderBase(game, factionId, position) {
  const bases = findBuilderBases(game, factionId);
  return bases
    .sort((a, b) => Math.hypot((a.position ?? a.tile).x - position.x, (a.position ?? a.tile).y - position.y))[0] ?? null;
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
    return normaliseStructureInstance({
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

function releaseBuilderFromJob(game, builderId, jobId, nextState = CONSTRUCTION_JOB_STATES.pending, deps) {
  game.constructionJobs = (game.constructionJobs ?? []).map((job) => (
    job.id === jobId ? releaseConstructionJobBuilder(job, builderId, nextState, game.tick, deps) : job
  ));
}

function releaseConstructionJobBuilder(job, builderId, nextState, tick, deps) {
  const normalisedJob = normaliseConstructionJob(job, deps);
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
    state,
    assignedBuilderIds,
    updatedAtTick: tick ?? normalisedJob.updatedAtTick
  };
}

function getBuilderById(game, builderId) {
  return (game.builders ?? []).find((builder) => builder.id === builderId) ?? null;
}

function getStructureWorkPoint(game, map, structure, builder = null, deps) {
  const builderPosition = builder?.position ?? builder?.tile ?? structure.position;
  if (builder?.workPoint && isBuilderWorkPointUsable(game, map, builder, builder.workPoint, builderPosition, deps)) {
    return builder.workPoint;
  }
  const candidates = getStructureWorkPointCandidates(structure);
  const rejectedKeys = new Set(builder?.avoidedWorkPointKeys ?? []);
  const preferredCandidates = candidates.filter((point) => !rejectedKeys.has(workPointKey(point)));
  const candidatePool = preferredCandidates.length > 0 ? preferredCandidates : candidates;
  const builderStartTile = builder ? deps.positionToTile(map, builderPosition) : null;
  const reachable = candidatePool
    .filter((point) => isInBounds(map, Math.round(point.x), Math.round(point.y)))
    .map((point) => {
      const tile = deps.positionToTile(map, point);
      const open = !deps.isMovementBlocked(map, tile, game, builder?.factionId, { allowTile: builderStartTile });
      const directlyReachable = builder && open
        ? isDirectTileReachableForConstruction(map, game, builder.factionId, builderStartTile, tile, deps)
        : false;
      const reachableForBuilder = !builder || (open && (directlyReachable || isTileReachableForConstruction(map, game, builder.factionId, builderStartTile, tile, deps)));
      return {
        point,
        reachable: reachableForBuilder,
        routeCost: deps.tileDistance(point, builderPosition)
      };
    })
    .filter((entry) => entry.reachable);
  if (builder && reachable.length === 0) {
    return null;
  }
  return (reachable.length > 0 ? reachable : candidates.map((point) => ({ point, routeCost: deps.tileDistance(point, builderPosition) })))
    .sort((a, b) => a.routeCost - b.routeCost)[0]?.point ?? null;
}

function isBuilderWorkPointUsable(game, map, builder, point, builderPosition, deps) {
  if (!point || !isInBounds(map, Math.round(point.x), Math.round(point.y))) {
    return false;
  }
  return !deps.isMovementBlocked(map, deps.positionToTile(map, point), game, builder?.factionId, {
    allowTile: deps.positionToTile(map, builderPosition)
  });
}

function previewRouteToWorkPoint(map, game, builder, point, deps) {
  recordConstructionWorkPointPreview(game);
  const target = deps.resolveNavigableMovementTarget(map, builder, builder.position, deps.clampToMapPosition(map, point));
  const flow = deps.buildNavigationFlowField(map, target, game, builder.factionId);
  const nodes = deps.materialiseFlowRoute(flow, builder.position, target);
  return {
    reachable: nodes.length >= 2 && deps.validateRuntimeMovementPathNodes(map, game, builder, nodes),
    nodeCount: nodes.length
  };
}

function recordConstructionWorkPointPreview(game) {
  game._runtimeCache = {
    ...(game._runtimeCache ?? {}),
    constructionWorkPointPreviews: (game._runtimeCache?.constructionWorkPointPreviews ?? 0) + 1
  };
}

function applyBuilderPosition(builder, position, movement, map, deps) {
  const nextPosition = roundPosition(deps.clampToMapPosition(map, position));
  const movementPath = deps.advanceMovementPathCursor(movement.movementPath, nextPosition);
  return {
    ...builder,
    state: movement.status === 'working' ? 'working' : 'moving',
    position: nextPosition,
    tile: deps.positionToTile(map, nextPosition),
    movement: deps.normaliseLeaderMovement(movement, nextPosition),
    movementPath
  };
}

function getConstructionWoodForWork(structure, job, workAmount) {
  const timberShare = Number(structure?.construction?.materials?.timber) || 0;
  if (timberShare <= 0) {
    return 0;
  }
  const totalWoodBudget = getConstructionWoodBudget(structure, job);
  if (totalWoodBudget <= 0) {
    return 0;
  }
  return round3((totalWoodBudget * Math.max(0, workAmount)) / Math.max(1, job.requiredWork));
}


function isDirectTileReachableForConstruction(map, game, factionId, startTile, targetTile, deps) {
  if (!startTile || !targetTile || !isInBounds(map, targetTile.x, targetTile.y)) {
    return false;
  }
  const dx = targetTile.x - startTile.x;
  const dy = targetTile.y - startTile.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) {
    return true;
  }
  let previous = startTile;
  const visited = new Set([deps.tileKey(startTile)]);
  for (let step = 1; step <= steps; step += 1) {
    const tile = {
      x: Math.round(startTile.x + (dx * step) / steps),
      y: Math.round(startTile.y + (dy * step) / steps)
    };
    const key = deps.tileKey(tile);
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (!deps.canTraverseTileStep(map, previous, tile, game, factionId, { allowTile: startTile })) {
      return false;
    }
    previous = tile;
  }
  return true;
}


function isDirectConstructionRouteReachable(map, game, factionId, startTile, targetTile, deps) {
  if (!isInBounds(map, targetTile.x, targetTile.y) || deps.isMovementBlocked(map, targetTile, game, factionId, { allowTile: startTile })) {
    return false;
  }
  let current = { x: startTile.x, y: startTile.y };
  const dxTotal = targetTile.x - startTile.x;
  const dyTotal = targetTile.y - startTile.y;
  const steps = Math.max(Math.abs(dxTotal), Math.abs(dyTotal));
  if (steps <= 0) {
    return true;
  }
  for (let step = 1; step <= steps; step += 1) {
    const next = {
      x: Math.round(startTile.x + (dxTotal * step) / steps),
      y: Math.round(startTile.y + (dyTotal * step) / steps)
    };
    if (next.x === current.x && next.y === current.y) {
      continue;
    }
    if (!deps.canTraverseTileStep(map, current, next, game, factionId, { allowTile: startTile })) {
      return false;
    }
    current = next;
  }
  return true;
}

function isTileReachableForConstruction(map, game, factionId, startTile, targetTile, deps) {
  if (!isInBounds(map, targetTile.x, targetTile.y) || deps.isMovementBlocked(map, targetTile, game, factionId, { allowTile: startTile })) {
    return false;
  }
  return getConstructionReachableTileSet(map, game, factionId, startTile, deps).has(deps.tileKey(targetTile));
}

function getConstructionReachableTileSet(map, game, factionId, startTile, deps) {
  if (game) {
    deps.ensureRuntimeCoordination(game, map);
  }
  const cacheKey = getConstructionReachabilityCacheKey(map, game, factionId, startTile, deps);
  const existing = game?._runtimeCache?.constructionReachability;
  if (existing?.key === cacheKey && existing.reachable instanceof Set) {
    return existing.reachable;
  }
  const reachable = new Set();
  const visited = new Set();
  const queue = [startTile];
  const directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
  ];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    const currentKey = deps.tileKey(current);
    if (visited.has(currentKey)) {
      continue;
    }
    visited.add(currentKey);
    reachable.add(currentKey);
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = deps.tileKey(next);
      if (!isInBounds(map, next.x, next.y) || visited.has(nextKey)) {
        continue;
      }
      if (!deps.canTraverseTileStep(map, current, next, game, factionId, { allowTile: startTile })) {
        continue;
      }
      queue.push(next);
    }
  }
  if (game) {
    game._runtimeCache = {
      ...(game._runtimeCache ?? {}),
      constructionReachability: { key: cacheKey, reachable }
    };
  }
  return reachable;
}

function normaliseDeliveredResources(resources = {}) {
  return {
    [RESOURCE_IDS.wood]: Math.max(0, Number(resources?.[RESOURCE_IDS.wood]) || 0)
  };
}

function workPointKey(point) {
  return `${Math.round((point?.x ?? 0) * 100) / 100},${Math.round((point?.y ?? 0) * 100) / 100}`;
}

function dedupeWorkPointKeys(keys = []) {
  const seen = new Set();
  const out = [];
  keys.forEach((key) => {
    if (typeof key === 'string' && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  });
  return out.slice(-6);
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

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
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
