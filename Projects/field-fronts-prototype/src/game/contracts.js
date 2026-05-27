export const GAME_STATE_CONTRACT_ID = 'field-fronts.game-state.v1';
export const MAP_DATA_CONTRACT_ID = 'field-fronts.map-data.v1';
export const GAME_STATE_VERSION = 1;

export const ENTITY_TYPES = Object.freeze({
  leader: 'leader',
  outpost: 'outpost',
  squad: 'squad',
  structure: 'structure',
  builder: 'builder',
  resourceWorker: 'resource_worker',
  transport: 'transport'
});

export const GAME_PHASES = Object.freeze({
  openingCommandField: 'opening-command-field',
  commandFieldStabilising: 'command-field-stabilising'
});

export const GAME_MODES = Object.freeze({
  leaderDuelSeed: 'leader-duel-seed'
});

export const COMMAND_GRAPH_CONTRACT = Object.freeze({
  id: 'field-fronts.command-graph.v1',
  requiredNodeFields: ['id', 'label', 'value', 'weight', 'sources', 'contribution']
});

/**
 * Runtime contract notes:
 *
 * MapData is authored/imported level data. It owns terrain tiles, per-tile
 * elevation, terrain definitions, and should remain serialisable by the map
 * maker.
 *
 * GameState is mutable runtime data. It owns tick, phase, selected entity,
 * time, economy, structures, resource workers, outposts, leaders, combat/death records, battlefield trace history, and any future objective/contest state. Derived
 * fields are rebuilt from MapData + GameState and are intentionally not
 * persisted.
 *
 * Entity is the shared base shape for all runtime units/nodes. `tile` is the
 * coarse integer map reference; moving entities may also carry fractional
 * `position` for grounded per-tick motion.
 * { id, type, factionId, name, tile }
 *
 * Outpost extends Entity:
 * { buildable, buildableBy, spawnLeaderId, supply, contestable, ownerFactionId, control, projectedPressure, status }
 *
 * Structure is a tactical spatial entity stored separately from legacy outpost
 * control/economy state. Its `type` is the registry id, and `entityType`
 * identifies the runtime class.
 * { id, entityType: "structure", type, factionId, tile, position, construction, footprint, collision, nav, occupancy, combat, influence, integrity }
 *
 * Builder extends Entity:
 * { position, baseStructureId, jobId, state, workPerTick, movement, movementPath }
 *
 * ResourceWorker extends Entity:
 * { position, homeStructureId, resourceId, state, targetTile, carriedAmount, movement, movementPath }
 *
 * Transport extends Entity:
 * { position, homeStructureId, resourceId, state, targetKind, targetId, carriedAmount, movement, movementPath }
 *
 * ConstructionJob is runtime-owned construction work, separate from structure
 * metadata and UI placement state.
 * { id, type: "construct_structure", structureId, factionId, position, requiredWork, progress, assignedBuilderIds, maxAssignedBuilders, state, sourceBaseId, createdAtTick, updatedAtTick }
 *
 * Leader extends Entity:
 * { position, qualities, health, combat, behavior, movement, command, commandScore, influenceRadius, objectiveProjection }
 *
 * Squad extends Entity:
 * { position, members, attributes, health, combat, supply, occupancy, behavior, movement }
 *
 * Projectile is transient GameState combat runtime:
 * { id, weaponId, factionId, sourceId, targetId, origin, position, targetPosition, damage, speedTilesPerTick }
 *
 * CommandGraph is attached to Leader.command.graph and remains inspectable as
 * weighted subinfluence nodes instead of flattening leadership into one number.
 */

export function createMapRef(map, { id = 'field-fronts-map' } = {}) {
  assertMapDataContract(map);
  return {
    contract: MAP_DATA_CONTRACT_ID,
    id,
    version: map.version ?? 1,
    width: map.width,
    height: map.height,
    tileSignature: createTileSignature(map),
    elevationSignature: createElevationSignature(map),
    scenarioSignature: createScenarioSignature(map),
    exportedAt: map.exportedAt ?? null,
    source: map.provenance?.source ?? 'unknown'
  };
}

export function assertMapDataContract(map) {
  if (!map || typeof map !== 'object') {
    throw new Error('MapData contract failed: map must be an object');
  }
  if (!Number.isInteger(map.width) || map.width <= 0) {
    throw new Error('MapData contract failed: width must be a positive integer');
  }
  if (!Number.isInteger(map.height) || map.height <= 0) {
    throw new Error('MapData contract failed: height must be a positive integer');
  }
  if (!Array.isArray(map.tiles) || map.tiles.length !== map.height) {
    throw new Error('MapData contract failed: tiles must contain one row per map height');
  }
  map.tiles.forEach((row, y) => {
    if (!Array.isArray(row) || row.length !== map.width) {
      throw new Error(`MapData contract failed: row ${y} must contain one tile per map width`);
    }
  });
  if (map.elevation !== undefined) {
    if (!Array.isArray(map.elevation) || map.elevation.length !== map.height) {
      throw new Error('MapData contract failed: elevation must contain one row per map height');
    }
    map.elevation.forEach((row, y) => {
      if (!Array.isArray(row) || row.length !== map.width || row.some((value) => !Number.isFinite(Number(value)))) {
        throw new Error(`MapData contract failed: elevation row ${y} must contain numeric values per map width`);
      }
    });
  }
  return true;
}

export function assertGameStateContract(game) {
  if (!game || typeof game !== 'object') {
    throw new Error('GameState contract failed: game state must be an object');
  }
  if (game.contract && game.contract !== GAME_STATE_CONTRACT_ID) {
    throw new Error(`GameState contract failed: unsupported contract ${game.contract}`);
  }
  if (game.version !== GAME_STATE_VERSION) {
    throw new Error(`GameState contract failed: unsupported version ${game.version}`);
  }
  if (!Number.isInteger(game.tick) || game.tick < 0) {
    throw new Error('GameState contract failed: tick must be a non-negative integer');
  }
  if (!Array.isArray(game.leaders) || !Array.isArray(game.outposts) || !Array.isArray(game.squads) || !Array.isArray(game.structures) || !Array.isArray(game.builders) || !Array.isArray(game.resourceWorkers) || !Array.isArray(game.transports) || !Array.isArray(game.constructionJobs)) {
    throw new Error('GameState contract failed: leaders, squads, outposts, structures, builders, resourceWorkers, transports, and constructionJobs must be arrays');
  }
  if (game.projectiles !== undefined && !Array.isArray(game.projectiles)) {
    throw new Error('GameState contract failed: projectiles must be an array when present');
  }
  if (game.deathEvents !== undefined && !Array.isArray(game.deathEvents)) {
    throw new Error('GameState contract failed: deathEvents must be an array when present');
  }
  if (game.impactEvents !== undefined && !Array.isArray(game.impactEvents)) {
    throw new Error('GameState contract failed: impactEvents must be an array when present');
  }
  if (game.soundEvents !== undefined && !Array.isArray(game.soundEvents)) {
    throw new Error('GameState contract failed: soundEvents must be an array when present');
  }
  if (game.corpses !== undefined && !Array.isArray(game.corpses)) {
    throw new Error('GameState contract failed: corpses must be an array when present');
  }
  if (game.battlefieldTrace !== undefined && (!game.battlefieldTrace || typeof game.battlefieldTrace !== 'object')) {
    throw new Error('GameState contract failed: battlefieldTrace must be an object when present');
  }
  if (!game.economy || typeof game.economy !== 'object') {
    throw new Error('GameState contract failed: economy must be an object');
  }
  game.leaders.forEach((leader) => assertEntityContract(leader, ENTITY_TYPES.leader));
  game.squads.forEach((squad) => assertEntityContract(squad, ENTITY_TYPES.squad));
  game.builders.forEach((builder) => assertEntityContract(builder, ENTITY_TYPES.builder));
  game.resourceWorkers.forEach((worker) => assertEntityContract(worker, ENTITY_TYPES.resourceWorker));
  game.transports.forEach((transport) => assertEntityContract(transport, ENTITY_TYPES.transport));
  game.outposts.forEach((outpost) => assertEntityContract(outpost, ENTITY_TYPES.outpost));
  game.structures.forEach(assertStructureEntityContract);
  game.constructionJobs.forEach(assertConstructionJobContract);
  return true;
}

export function assertEntityContract(entity, expectedType = null) {
  if (!entity || typeof entity !== 'object') {
    throw new Error('Entity contract failed: entity must be an object');
  }
  if (!entity.id || typeof entity.id !== 'string') {
    throw new Error('Entity contract failed: id must be a string');
  }
  if (!entity.type || typeof entity.type !== 'string') {
    throw new Error(`Entity contract failed for ${entity.id}: type must be a string`);
  }
  if (expectedType && entity.type !== expectedType) {
    throw new Error(`Entity contract failed for ${entity.id}: expected ${expectedType}, got ${entity.type}`);
  }
  if (!entity.factionId || typeof entity.factionId !== 'string') {
    throw new Error(`Entity contract failed for ${entity.id}: factionId must be a string`);
  }
  assertTileContract(entity.tile, `Entity contract failed for ${entity.id}`);
  return true;
}

export function assertTileContract(tile, prefix = 'Tile contract failed') {
  if (!tile || !Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
    throw new Error(`${prefix}: tile must contain integer x/y coordinates`);
  }
  return true;
}


export function createScenarioSignature(map) {
  const scenario = map?.scenario;
  if (!scenario || typeof scenario !== 'object') {
    return 'scenario:none';
  }
  const starts = scenario.starts ?? {};
  const neutral = Array.isArray(scenario.neutralOutposts) ? scenario.neutralOutposts : [];
  const scene = scenario.sceneEntity;
  const authored = Array.isArray(scene?.authoredEntities) ? scene.authoredEntities : [];
  return [
    `seed:${scenario.generator?.seed ?? 'none'}`,
    `preset:${scenario.generator?.preset ?? 'unknown'}`,
    `p:${tileSignaturePart(starts.player)}`,
    `e:${tileSignaturePart(starts.enemy)}`,
    `n:${neutral.map((outpost) => `${outpost.id ?? 'outpost'}@${tileSignaturePart(outpost.tile)}:${Number(outpost.supply ?? 0).toFixed(2)}`).join('|')}`,
    `scene:${scene?.id ?? 'none'}:${scene?.runtimeSeedMode ?? 'legacy'}:${authored.map((entity) => `${entity.toolId ?? 'entity'}@${tileSignaturePart(entity.tile)}`).join('|')}`,
    `presentation:${scene?.presentation?.ui?.build !== false ? 'build' : 'no-build'}:${scene?.presentation?.ui?.resources !== false ? 'resources' : 'no-resources'}:${scene?.presentation?.visuals?.weather !== false ? 'weather' : 'no-weather'}`
  ].join(';');
}

function tileSignaturePart(tile) {
  return Number.isFinite(Number(tile?.x)) && Number.isFinite(Number(tile?.y))
    ? `${Math.round(Number(tile.x))},${Math.round(Number(tile.y))}`
    : 'none';
}

export function createTileSignature(map) {
  assertMapDataContract(map);
  const counts = new Map();
  map.tiles.forEach((row) => {
    row.forEach((tileId) => counts.set(tileId, (counts.get(tileId) ?? 0) + 1));
  });
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => `${id}:${count}`)
    .join('|');
}

export function createElevationSignature(map) {
  if (!Array.isArray(map.elevation)) {
    return 'legacy:none';
  }
  let sum = 0;
  let min = 1;
  let max = 0;
  map.elevation.forEach((row) => {
    row.forEach((rawValue) => {
      const value = Math.max(0, Math.min(1, Number(rawValue) || 0));
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
  });
  const count = Math.max(1, map.width * map.height);
  return `min:${round3(min)}|max:${round3(max)}|avg:${round3(sum / count)}`;
}

export function cloneTile(tile) {
  assertTileContract(tile);
  return { x: tile.x, y: tile.y };
}

export function getGameEntities(game) {
  return [...(game?.outposts ?? []), ...(game?.structures ?? []), ...(game?.leaders ?? []), ...(game?.squads ?? []), ...(game?.builders ?? []), ...(game?.resourceWorkers ?? []), ...(game?.transports ?? [])];
}

export function assertStructureEntityContract(structure) {
  assertEntityContract({
    id: structure?.id,
    type: structure?.entityType,
    factionId: structure?.factionId,
    tile: structure?.tile
  }, ENTITY_TYPES.structure);
  if (!structure.type || typeof structure.type !== 'string') {
    throw new Error(`Structure contract failed for ${structure.id}: registry type must be a string`);
  }
  if (!structure.position || !Number.isFinite(structure.position.x) || !Number.isFinite(structure.position.y)) {
    throw new Error(`Structure contract failed for ${structure.id}: position must contain numeric x/y coordinates`);
  }
  for (const layer of ['construction', 'footprint', 'collision', 'nav', 'occupancy', 'combat', 'influence', 'integrity']) {
    if (!structure[layer] || typeof structure[layer] !== 'object') {
      throw new Error(`Structure contract failed for ${structure.id}: ${layer} metadata is required`);
    }
  }
  return true;
}

export function assertConstructionJobContract(job) {
  if (!job || typeof job !== 'object') {
    throw new Error('ConstructionJob contract failed: job must be an object');
  }
  if (!job.id || typeof job.id !== 'string') {
    throw new Error('ConstructionJob contract failed: id must be a string');
  }
  if (job.type !== 'construct_structure') {
    throw new Error(`ConstructionJob contract failed for ${job.id}: type must be construct_structure`);
  }
  if (!job.structureId || typeof job.structureId !== 'string') {
    throw new Error(`ConstructionJob contract failed for ${job.id}: structureId must be a string`);
  }
  if (!job.factionId || typeof job.factionId !== 'string') {
    throw new Error(`ConstructionJob contract failed for ${job.id}: factionId must be a string`);
  }
  if (!job.position || !Number.isFinite(job.position.x) || !Number.isFinite(job.position.y)) {
    throw new Error(`ConstructionJob contract failed for ${job.id}: position must contain numeric x/y coordinates`);
  }
  return true;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
