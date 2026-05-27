import { getSceneEntity, isNomadicSurvivalScene } from './sceneEntity.js';

export const WORLD_ASSET_LIFECYCLE_CONTRACT = 'field-fronts.world-asset-lifecycle.v1';

export const WORLD_ASSET_CATEGORIES = Object.freeze({
  staticVisual: 'static_visual_assets',
  staticGameplay: 'static_gameplay_assets',
  dormantStructure: 'dormant_structures',
  activeStructure: 'active_structures',
  dynamicUnit: 'dynamic_units',
  dynamicThreat: 'dynamic_threats',
  dynamicEffect: 'dynamic_effects',
  diagnosticOverlay: 'ui_diagnostic_overlays'
});

export function summarizeWorldAssetLifecycle(map, game = null, uiState = null) {
  const scene = getSceneEntity(map);
  const authored = scene.authoredEntities ?? [];
  const layer = map?.scenario?.scenarioLayer ?? {};
  const structures = game?.structures ?? [];
  const friendlyUnits = collectUnits(game).filter((entity) => entity.factionId === 'player');
  const threats = collectUnits(game).filter((entity) => entity.factionId === 'enemy');
  const terrain = summarizeTerrainSubstrate(map);
  const dormantStructures = structures.filter((structure) => !isStructureActivated(structure));
  const activeStructures = structures.filter(isStructureActivated);
  const overlays = [
    uiState?.gameOverlay && uiState.gameOverlay !== 'none' ? 'field_overlay' : null,
    uiState?.showCommandRadii ? 'command_radii' : null,
    uiState?.showNoisePings ? 'sound_pings' : null,
    uiState?.showFieldOfView ? 'field_of_view' : null
  ].filter(Boolean);

  return {
    contract: WORLD_ASSET_LIFECYCLE_CONTRACT,
    runtimeProfile: scene.runtimeProfile,
    policy: isNomadicSurvivalScene(map)
      ? {
        activeSimulation: ['movement', 'unit_behaviour', 'cover_queries', 'line_of_sight', 'weather'],
        dormantSystems: ['enemy_director', 'structure_occupancy', 'resource_gathering', 'supply_lines', 'construction_jobs', 'structure_income']
      }
      : {
        activeSimulation: ['movement', 'combat', 'construction', 'logistics', 'economy'],
        dormantSystems: []
      },
    authoredAssets: {
      placements: authored.length,
      shelters: authored.filter((entity) => entity.kind === 'shelter').length,
      unitSeeds: authored.filter((entity) => entity.kind === 'unit' || entity.kind === 'start').length,
      props: authored.filter((entity) => entity.kind === 'prop').length,
      scenarioDetails: (layer.assets?.length ?? 0) + (layer.items?.length ?? 0) + (layer.locations?.length ?? 0)
    },
    categories: {
      [WORLD_ASSET_CATEGORIES.staticVisual]: {
        count: terrain.totalCells + (layer.assets?.length ?? 0),
        detailBudgeted: true
      },
      [WORLD_ASSET_CATEGORIES.staticGameplay]: {
        count: authored.filter((entity) => ['shelter', 'cover', 'prop', 'trigger'].includes(entity.kind)).length,
        spatialQueryOnly: true
      },
      [WORLD_ASSET_CATEGORIES.dormantStructure]: { count: dormantStructures.length },
      [WORLD_ASSET_CATEGORIES.activeStructure]: { count: activeStructures.length },
      [WORLD_ASSET_CATEGORIES.dynamicUnit]: { count: friendlyUnits.length },
      [WORLD_ASSET_CATEGORIES.dynamicThreat]: { count: threats.length },
      [WORLD_ASSET_CATEGORIES.dynamicEffect]: {
        count: (game?.projectiles?.length ?? 0) + (game?.soundEvents?.length ?? 0) + (game?.impactEvents?.length ?? 0)
      },
      [WORLD_ASSET_CATEGORIES.diagnosticOverlay]: { count: overlays.length, active: overlays }
    },
    terrain
  };
}

function summarizeTerrainSubstrate(map) {
  const counts = {};
  for (const row of map?.tiles ?? []) {
    for (const tile of row ?? []) {
      counts[tile] = (counts[tile] ?? 0) + 1;
    }
  }
  return {
    totalCells: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts
  };
}

function collectUnits(game) {
  return [
    ...(game?.leaders ?? []),
    ...(game?.squads ?? []),
    ...(game?.builders ?? []),
    ...(game?.resourceWorkers ?? []),
    ...(game?.transports ?? [])
  ].filter((entity) => entity.health?.state !== 'dead');
}

function isStructureActivated(structure) {
  return structure.construction?.state !== 'complete'
    || (structure.occupancy?.occupants?.length ?? 0) > 0
    || (structure.integrity?.health ?? 1) < (structure.integrity?.maxHealth ?? 1)
    || Boolean(structure.gathering?.enabled || structure.workforce?.enabled || structure.storage?.enabled);
}
