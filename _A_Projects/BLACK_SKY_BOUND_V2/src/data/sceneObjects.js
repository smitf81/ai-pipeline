import { WORLD_SCALE, metersToTiles, tileSpanForMeters } from './worldScale.js';
import { MaterialProfileId } from './materialProfiles.js';
import { LightEmitterId } from '../constants/lightEmitterIds.js';
import { SmokeSourceKind } from './smokeSources.js';
import { buildRaidEmitterSceneObjects } from './sceneObjectRaidEmitterDefs.js';

export const SceneObjectType = Object.freeze({
  TREE: 'tree',
  BIRCH_TREE: 'birch_tree',
  DEAD_SNAG: 'dead_snag',
  BOULDER: 'boulder',
  FERN_PATCH: 'fern_patch',
  FOREST_SHRUB: 'forest_shrub',
  LEAF_LITTER: 'leaf_litter',
  ROOT_DECAL: 'root_decal',
  FIRE_ARROW_LEFT: 'fire_arrow_left',
  FIRE_ARROW_RIGHT: 'fire_arrow_right',
  FIRE_ARROW_STEEP: 'fire_arrow_steep',
  FIRE_ARROW_CLUSTER: 'fire_arrow_cluster',
  SMOULDERING_FERN: 'smouldering_fern',
  SMOULDERING_BRAMBLE: 'smouldering_bramble'
});

const TREE_PHYSICAL = Object.freeze({
  trunkBaseMeters: WORLD_SCALE.sceneObjectTargets.dwarfingTree.trunkBaseMeters,
  crownWidthMeters: WORLD_SCALE.sceneObjectTargets.dwarfingTree.crownWidthMeters,
  crownDepthMeters: WORLD_SCALE.sceneObjectTargets.dwarfingTree.crownDepthMeters,
  heightMeters: WORLD_SCALE.sceneObjectTargets.dwarfingTree.heightMeters
});

const BOULDER_PHYSICAL = Object.freeze({
  widthMeters: WORLD_SCALE.sceneObjectTargets.boulder.widthMeters,
  depthMeters: WORLD_SCALE.sceneObjectTargets.boulder.depthMeters,
  heightMeters: WORLD_SCALE.sceneObjectTargets.boulder.heightMeters
});

const BIRCH_TREE_PHYSICAL = Object.freeze({
  trunkBaseMeters: 0.8,
  crownWidthMeters: 2.4,
  crownDepthMeters: 3.1,
  heightMeters: 7.2
});

const DEAD_SNAG_PHYSICAL = Object.freeze({
  trunkBaseMeters: 0.7,
  crownWidthMeters: 1.35,
  crownDepthMeters: 2.2,
  heightMeters: 4.6
});

const FERN_PATCH_PHYSICAL = Object.freeze({
  widthMeters: 1.45,
  depthMeters: 0.85,
  heightMeters: 0.45
});

const SHRUB_PHYSICAL = Object.freeze({
  widthMeters: 1.6,
  depthMeters: 1.05,
  heightMeters: 0.7
});

const LEAF_LITTER_PHYSICAL = Object.freeze({
  widthMeters: 1.8,
  depthMeters: 1.0,
  heightMeters: 0.02
});

const ROOT_DECAL_PHYSICAL = Object.freeze({
  widthMeters: 1.55,
  depthMeters: 0.85,
  heightMeters: 0.03
});

export const SCENE_OBJECTS = Object.freeze({
  [SceneObjectType.TREE]: Object.freeze({
    type: SceneObjectType.TREE,
    label: 'Old Pine',
    scaleProfileId: WORLD_SCALE.id,
    materialProfileId: MaterialProfileId.WOOD_PINE,
    physical: TREE_PHYSICAL,
    footprint: {
      w: tileSpanForMeters(TREE_PHYSICAL.trunkBaseMeters),
      h: tileSpanForMeters(TREE_PHYSICAL.trunkBaseMeters)
    },
    visualFootprint: {
      w: metersToTiles(TREE_PHYSICAL.crownWidthMeters),
      h: metersToTiles(TREE_PHYSICAL.crownDepthMeters),
      offsetX: -2,
      offsetY: -5
    },
    collision: {
      blocksMovement: true,
      policy: 'coarse_tile_footprint_blocker_v0'
    },
    occlusion: {
      castsShadow: true,
      radius: 1.25,
      height: 2.2,
      shadowSilhouette: {
        contract: 'scene_object_shadow_silhouette.v1',
        shape: 'compound_tree_crown_trunk_sdf_v0',
        primitives: [
          { id: 'trunk', kind: 'trunk_core', offsetX: 0, offsetY: 0, widthScale: 0.46, lengthScale: 0.74, tailWidthScale: 0.42, dimnessScale: 1.18, softnessScale: 0.78 },
          { id: 'crown_nw', kind: 'crown_lobe', offsetX: -0.55, offsetY: -0.72, widthScale: 0.58, lengthScale: 1.04, tailWidthScale: 0.62, dimnessScale: 0.78, softnessScale: 1.08 },
          { id: 'crown_ne', kind: 'crown_lobe', offsetX: 0.52, offsetY: -0.66, widthScale: 0.54, lengthScale: 0.96, tailWidthScale: 0.58, dimnessScale: 0.72, softnessScale: 1.12 },
          { id: 'crown_s', kind: 'crown_lobe', offsetX: -0.08, offsetY: 0.48, widthScale: 0.48, lengthScale: 0.88, tailWidthScale: 0.52, dimnessScale: 0.7, softnessScale: 1.04 },
          { id: 'canopy_gap', kind: 'negative_space_hint', offsetX: 0.28, offsetY: -0.1, widthScale: 0.25, lengthScale: 0.72, tailWidthScale: 0.34, dimnessScale: 0.42, softnessScale: 1.2 }
        ]
      }
    },
    render: {
      kind: 'tree',
      scaleRead: 'mature_tree_dwarfs_hatchling_v0',
      trunkColour: '#3f2e1c',
      trunkShadow: '#21180f',
      crownColour: '#1f4a30',
      crownShade: '#143521',
      crownHighlight: '#2f6541',
      baseShadow: 'rgba(0,0,0,0.34)'
    }
  }),
  [SceneObjectType.BIRCH_TREE]: Object.freeze({
    type: SceneObjectType.BIRCH_TREE,
    label: 'Silver Birch',
    scaleProfileId: WORLD_SCALE.id,
    materialProfileId: MaterialProfileId.WOOD_BIRCH,
    materialState: {
      density: 0.72,
      nightReveal: 0.58
    },
    physical: BIRCH_TREE_PHYSICAL,
    footprint: {
      w: tileSpanForMeters(BIRCH_TREE_PHYSICAL.trunkBaseMeters),
      h: tileSpanForMeters(BIRCH_TREE_PHYSICAL.trunkBaseMeters)
    },
    visualFootprint: {
      w: metersToTiles(BIRCH_TREE_PHYSICAL.crownWidthMeters),
      h: metersToTiles(BIRCH_TREE_PHYSICAL.crownDepthMeters),
      offsetX: -1.5,
      offsetY: -4.5
    },
    collision: {
      blocksMovement: true,
      policy: 'coarse_tile_footprint_blocker_v0'
    },
    occlusion: {
      castsShadow: true,
      radius: 1.05,
      height: 2,
      shadowSilhouette: {
        contract: 'scene_object_shadow_silhouette.v1',
        shape: 'compound_airier_tree_crown_trunk_sdf_v0',
        primitives: [
          { id: 'trunk', kind: 'trunk_core', offsetX: 0, offsetY: 0.08, widthScale: 0.36, lengthScale: 0.78, tailWidthScale: 0.34, dimnessScale: 1.05, softnessScale: 0.78 },
          { id: 'crown_l', kind: 'crown_lobe', offsetX: -0.42, offsetY: -0.54, widthScale: 0.46, lengthScale: 0.9, tailWidthScale: 0.5, dimnessScale: 0.66, softnessScale: 1.12 },
          { id: 'crown_r', kind: 'crown_lobe', offsetX: 0.42, offsetY: -0.46, widthScale: 0.42, lengthScale: 0.84, tailWidthScale: 0.46, dimnessScale: 0.62, softnessScale: 1.16 }
        ]
      }
    },
    render: {
      kind: 'tree',
      scaleRead: 'slender_tree_variant_v0',
      ambientParticles: { kind: 'leaf_drift' },
      trunkColour: '#d8d0b8',
      trunkShadow: '#6b614d',
      crownColour: '#6f8749',
      crownShade: '#435b35',
      crownHighlight: '#a3ad69',
      baseShadow: 'rgba(0,0,0,0.28)'
    }
  }),
  [SceneObjectType.DEAD_SNAG]: Object.freeze({
    type: SceneObjectType.DEAD_SNAG,
    label: 'Dead Snag',
    scaleProfileId: WORLD_SCALE.id,
    materialProfileId: MaterialProfileId.WOOD_DEAD_SNAG,
    materialState: {
      density: 0.58,
      integrity: 0.72,
      nightReveal: 0.48
    },
    physical: DEAD_SNAG_PHYSICAL,
    footprint: {
      w: tileSpanForMeters(DEAD_SNAG_PHYSICAL.trunkBaseMeters),
      h: tileSpanForMeters(DEAD_SNAG_PHYSICAL.trunkBaseMeters)
    },
    visualFootprint: {
      w: metersToTiles(DEAD_SNAG_PHYSICAL.crownWidthMeters),
      h: metersToTiles(DEAD_SNAG_PHYSICAL.crownDepthMeters),
      offsetX: -0.8,
      offsetY: -2.9
    },
    collision: {
      blocksMovement: true,
      policy: 'coarse_tile_footprint_blocker_v0'
    },
    occlusion: {
      castsShadow: true,
      radius: 0.74,
      height: 1.35,
      shadowSilhouette: {
        contract: 'scene_object_shadow_silhouette.v1',
        shape: 'dead_snag_branch_sdf_v0',
        primitives: [
          { id: 'trunk', kind: 'trunk_core', offsetX: 0, offsetY: 0.05, widthScale: 0.42, lengthScale: 0.9, tailWidthScale: 0.28, dimnessScale: 1.02, softnessScale: 0.76 },
          { id: 'branch_left', kind: 'dead_branch', offsetX: -0.32, offsetY: -0.34, widthScale: 0.18, lengthScale: 0.58, tailWidthScale: 0.16, dimnessScale: 0.54, softnessScale: 0.9 },
          { id: 'branch_right', kind: 'dead_branch', offsetX: 0.38, offsetY: -0.22, widthScale: 0.16, lengthScale: 0.5, tailWidthScale: 0.14, dimnessScale: 0.5, softnessScale: 0.92 }
        ]
      }
    },
    render: {
      kind: 'dead_snag',
      scaleRead: 'dry_snag_blocker_v0',
      trunkColour: '#4a3326',
      trunkShadow: '#271b14',
      highlightColour: '#72513b',
      baseShadow: 'rgba(0,0,0,0.26)'
    }
  }),
  [SceneObjectType.BOULDER]: Object.freeze({
    type: SceneObjectType.BOULDER,
    label: 'Moss Boulder',
    scaleProfileId: WORLD_SCALE.id,
    materialProfileId: MaterialProfileId.STONE_MOSS,
    physical: BOULDER_PHYSICAL,
    footprint: {
      w: tileSpanForMeters(BOULDER_PHYSICAL.widthMeters),
      h: tileSpanForMeters(BOULDER_PHYSICAL.depthMeters)
    },
    visualFootprint: {
      w: metersToTiles(BOULDER_PHYSICAL.widthMeters) + 0.4,
      h: metersToTiles(BOULDER_PHYSICAL.depthMeters) + 0.1,
      offsetX: -0.2,
      offsetY: -0.05
    },
    collision: {
      blocksMovement: true,
      policy: 'coarse_tile_footprint_blocker_v0'
    },
    occlusion: {
      castsShadow: true,
      radius: 0.95,
      height: 0.92,
      shadowSilhouette: {
        contract: 'scene_object_shadow_silhouette.v1',
        shape: 'faceted_boulder_sdf_v0',
        primitives: [
          { id: 'mass_core', kind: 'stone_mass', offsetX: 0, offsetY: 0, widthScale: 0.72, lengthScale: 0.86, tailWidthScale: 0.5, dimnessScale: 1.05, softnessScale: 0.86 },
          { id: 'left_facet', kind: 'stone_facet', offsetX: -0.34, offsetY: -0.12, widthScale: 0.42, lengthScale: 0.76, tailWidthScale: 0.36, dimnessScale: 0.78, softnessScale: 0.74 },
          { id: 'right_facet', kind: 'stone_facet', offsetX: 0.36, offsetY: 0.18, widthScale: 0.38, lengthScale: 0.68, tailWidthScale: 0.32, dimnessScale: 0.7, softnessScale: 0.78 }
        ]
      }
    },
    render: {
      kind: 'procedural_geology',
      geometryContract: 'black-sky-bound.procedural-geology-hull-geometry.v1',
      scaleRead: 'fieldstone_geology_dna_v1',
      bodyColour: '#626a66',
      shadeColour: '#3f4645',
      highlightColour: '#879087',
      mossColour: '#314d35',
      baseShadow: 'rgba(0,0,0,0.3)'
    }
  }),
  [SceneObjectType.FERN_PATCH]: Object.freeze({
    type: SceneObjectType.FERN_PATCH,
    label: 'Fern Patch',
    scaleProfileId: WORLD_SCALE.id,
    materialProfileId: MaterialProfileId.FOLIAGE_FERN,
    materialState: {
      density: 0.62,
      nightReveal: 0.48
    },
    physical: FERN_PATCH_PHYSICAL,
    footprint: { w: 1, h: 1 },
    visualFootprint: {
      w: metersToTiles(FERN_PATCH_PHYSICAL.widthMeters),
      h: metersToTiles(FERN_PATCH_PHYSICAL.depthMeters),
      offsetX: -0.95,
      offsetY: -0.45
    },
    collision: {
      blocksMovement: false,
      policy: 'non_blocking_scene_detail_v0'
    },
    occlusion: {
      castsShadow: false,
      radius: 0.38,
      height: FERN_PATCH_PHYSICAL.heightMeters
    },
    render: {
      kind: 'fern_patch',
      scaleRead: 'knee_high_forest_undergrowth_v0',
      frondColour: '#24482f',
      frondShade: '#162d22',
      frondHighlight: '#4d7248',
      baseShadow: 'rgba(0,0,0,0.18)'
    }
  }),
  [SceneObjectType.FOREST_SHRUB]: Object.freeze({
    type: SceneObjectType.FOREST_SHRUB,
    label: 'Forest Shrub',
    scaleProfileId: WORLD_SCALE.id,
    materialProfileId: MaterialProfileId.FOLIAGE_SHRUB,
    materialState: {
      density: 0.7,
      nightReveal: 0.46
    },
    physical: SHRUB_PHYSICAL,
    footprint: { w: 1, h: 1 },
    visualFootprint: {
      w: metersToTiles(SHRUB_PHYSICAL.widthMeters),
      h: metersToTiles(SHRUB_PHYSICAL.depthMeters),
      offsetX: -1.1,
      offsetY: -0.75
    },
    collision: {
      blocksMovement: false,
      policy: 'non_blocking_scene_detail_v0'
    },
    occlusion: {
      castsShadow: false,
      radius: 0.48,
      height: SHRUB_PHYSICAL.heightMeters
    },
    render: {
      kind: 'forest_shrub',
      scaleRead: 'waist_high_shrub_cluster_v0',
      ambientParticles: { kind: 'leaf_drift' },
      bodyColour: '#2d4d2d',
      shadeColour: '#1b3322',
      highlightColour: '#567447',
      baseShadow: 'rgba(0,0,0,0.2)'
    }
  }),
  [SceneObjectType.LEAF_LITTER]: Object.freeze({
    type: SceneObjectType.LEAF_LITTER,
    label: 'Leaf Litter',
    scaleProfileId: WORLD_SCALE.id,
    materialProfileId: MaterialProfileId.FOREST_FLOOR_DECAL,
    materialState: {
      density: 0.34,
      nightReveal: 0.42
    },
    physical: LEAF_LITTER_PHYSICAL,
    footprint: { w: 1, h: 1 },
    visualFootprint: {
      w: metersToTiles(LEAF_LITTER_PHYSICAL.widthMeters),
      h: metersToTiles(LEAF_LITTER_PHYSICAL.depthMeters),
      offsetX: -1.3,
      offsetY: -0.55
    },
    collision: {
      blocksMovement: false,
      policy: 'non_blocking_ground_decal_v0'
    },
    occlusion: {
      castsShadow: false,
      radius: 0.44,
      height: LEAF_LITTER_PHYSICAL.heightMeters
    },
    render: {
      kind: 'ground_decal',
      decalProfile: 'leaf_litter',
      scaleRead: 'forest_floor_leaf_scatter_v0',
      sortBias: -20,
      bodyColour: 'rgba(78,56,33,0.54)',
      shadeColour: 'rgba(42,31,23,0.46)',
      highlightColour: 'rgba(130,105,58,0.5)'
    }
  }),
  [SceneObjectType.ROOT_DECAL]: Object.freeze({
    type: SceneObjectType.ROOT_DECAL,
    label: 'Root Mat',
    scaleProfileId: WORLD_SCALE.id,
    materialProfileId: MaterialProfileId.FOREST_FLOOR_DECAL,
    materialState: {
      density: 0.38,
      nightReveal: 0.42
    },
    physical: ROOT_DECAL_PHYSICAL,
    footprint: { w: 1, h: 1 },
    visualFootprint: {
      w: metersToTiles(ROOT_DECAL_PHYSICAL.widthMeters),
      h: metersToTiles(ROOT_DECAL_PHYSICAL.depthMeters),
      offsetX: -1.05,
      offsetY: -0.45
    },
    collision: {
      blocksMovement: false,
      policy: 'non_blocking_ground_decal_v0'
    },
    occlusion: {
      castsShadow: false,
      radius: 0.4,
      height: ROOT_DECAL_PHYSICAL.heightMeters
    },
    render: {
      kind: 'ground_decal',
      decalProfile: 'root_mat',
      scaleRead: 'exposed_roots_ground_trace_v0',
      sortBias: -20,
      bodyColour: 'rgba(68,42,26,0.58)',
      shadeColour: 'rgba(31,23,18,0.48)',
      highlightColour: 'rgba(111,76,43,0.48)'
    }
  }),
  ...buildRaidEmitterSceneObjects({
    SceneObjectType,
    WORLD_SCALE,
    metersToTiles,
    MaterialProfileId,
    LightEmitterId,
    SmokeSourceKind
  })
});

export function getSceneObjectDefinition(type) {
  const def = SCENE_OBJECTS[type];
  if (!def) throw new Error(`Unknown scene object type: ${type}`);
  return def;
}
