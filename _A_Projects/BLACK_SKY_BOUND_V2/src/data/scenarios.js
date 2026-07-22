import { EntityKind } from '../constants/entityKinds.js';
import { SceneObjectType } from './sceneObjects.js';
import { TerrainType } from '../world/terrain.js';

export const ScenarioId = Object.freeze({
  FIRST_ESCAPE: 'first_escape'
});

export const SCENARIOS = Object.freeze({
  [ScenarioId.FIRST_ESCAPE]: Object.freeze({
    id: ScenarioId.FIRST_ESCAPE,
    label: 'First Escape',
    map: { width: 42, height: 30 },
    spawn: { x: 6, y: 15 },
    escapeZone: { x: 36, y: 6, w: 4, h: 5 },
    startMessage: 'Reach the smoke-lit escape edge. Tooth, claw, smoke. No flight. No fire yet.',
    winMessage: 'Safety reached. First playable loop complete.',
    lossMessage: 'Overwhelmed. The young dragon does not escape.',
    objective: {
      id: 'escape',
      text: 'Reach safety before being overwhelmed'
    },
    enemySpawns: [
      { type: EntityKind.RAIDER, x: 14, y: 13 },
      { type: EntityKind.RAIDER, x: 17, y: 17 },
      { type: EntityKind.HUSK, x: 22, y: 11 },
      { type: EntityKind.HUSK, x: 25, y: 20 },
      { type: EntityKind.WEREWOLF, x: 31, y: 9 }
    ],
    sceneObjects: [
      { id: 'boulder:start-route', type: SceneObjectType.BOULDER, x: 8, y: 15 },
      { id: 'fern:start-route-left', type: SceneObjectType.FERN_PATCH, x: 7, y: 17 },
      { id: 'smoulder:start-fern', type: SceneObjectType.SMOULDERING_FERN, x: 5, y: 13 },
      { id: 'fire-arrow:start-left', type: SceneObjectType.FIRE_ARROW_LEFT, x: 6, y: 12 },
      { id: 'fire-arrow:start-right', type: SceneObjectType.FIRE_ARROW_RIGHT, x: 8, y: 13 },
      { id: 'decal:leaf-litter-start', type: SceneObjectType.LEAF_LITTER, x: 10, y: 14 },
      { id: 'fire-arrow:torch-edge-cluster', type: SceneObjectType.FIRE_ARROW_CLUSTER, x: 11, y: 11 },
      { id: 'tree:torch-edge', type: SceneObjectType.TREE, x: 13, y: 11 },
      { id: 'tree:birch-torch-edge', type: SceneObjectType.BIRCH_TREE, x: 10, y: 9 },
      { id: 'boulder:second-raider-cover', type: SceneObjectType.BOULDER, x: 15, y: 18 },
      { id: 'shrub:second-raider-cover', type: SceneObjectType.FOREST_SHRUB, x: 17, y: 20 },
      { id: 'decal:root-crossing', type: SceneObjectType.ROOT_DECAL, x: 18, y: 15 },
      { id: 'snag:old-lightning-hit', type: SceneObjectType.DEAD_SNAG, x: 20, y: 8 },
      { id: 'smoulder:old-lightning-bramble', type: SceneObjectType.SMOULDERING_BRAMBLE, x: 21, y: 9 },
      { id: 'tree:deep-forest', type: SceneObjectType.TREE, x: 24, y: 18 },
      { id: 'fern:deep-forest-floor', type: SceneObjectType.FERN_PATCH, x: 22, y: 20 },
      { id: 'shrub:deep-forest-understory', type: SceneObjectType.FOREST_SHRUB, x: 26, y: 17 },
      { id: 'decal:leaf-litter-deep-forest', type: SceneObjectType.LEAF_LITTER, x: 25, y: 20 },
      { id: 'boulder:river-bank', type: SceneObjectType.BOULDER, x: 30, y: 13 },
      { id: 'decal:root-river-bank', type: SceneObjectType.ROOT_DECAL, x: 29, y: 15 },
      { id: 'fire-arrow:wolf-edge-steep', type: SceneObjectType.FIRE_ARROW_STEEP, x: 31, y: 11 },
      { id: 'tree:wolf-edge', type: SceneObjectType.TREE, x: 32, y: 9 }
    ],
    terrainBlobs: [
      { cx: 12, cy: 8, radius: 5, type: TerrainType.FOREST },
      { cx: 25, cy: 18, radius: 7, type: TerrainType.FOREST },
      { cx: 18, cy: 23, radius: 4, type: TerrainType.DIRT },
      { cx: 31, cy: 5, radius: 4, type: TerrainType.SCORCHED }
    ],
    waterRuns: [
      { from: { x: 28, y: 13 }, to: { x: 33, y: 13 } },
      { from: { x: 33, y: 10 }, to: { x: 33, y: 15 } }
    ]
  })
});

export function getScenario(id = ScenarioId.FIRST_ESCAPE) {
  const scenario = SCENARIOS[id];
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}
