import { getSceneObjectDefinition } from '../data/sceneObjects.js';
import { resolveShadowShapeProfile } from '../data/shadowShapeProfiles.js';
import {
  getTreeSpeciesRecipe,
  isProceduralTreeType,
  resolveProceduralTreeDefinition,
  resolveProceduralTreeSceneProfile
} from '../data/proceduralTrees.js';
import {
  getUndergrowthSpeciesRecipe,
  isProceduralUndergrowthType,
  resolveProceduralUndergrowthDefinition,
  resolveProceduralUndergrowthSceneProfile
} from '../data/proceduralUndergrowth.js';
import {
  getGeologyRecipe,
  isProceduralGeologyType,
  resolveProceduralGeologyDefinition,
  resolveProceduralGeologySceneProfile
} from '../data/proceduralGeology.js';
import { WORLD_SCALE } from '../data/worldScale.js';
import { generateProceduralTreeSpatialRecipe } from './proceduralTreeSpatialRecipe.js';
import { createCircleCollision, createConvexPolygonCollision, translateCollisionShape } from '../physics/collisionShapes.js';
import { translateTraversalModifier } from '../physics/traversalModifiers.js';

export function createSceneObjects(entries = []) {
  return entries.map((entry, index) => createSceneObject(entry, index));
}

export function createRuntimeSceneObjectState(sceneObjects = []) {
  return sceneObjects.map((object) => JSON.parse(JSON.stringify(object)));
}

export function createSceneObject(entry, index = 0) {
  const authoredType = entry.type;
  const initialDef = getSceneObjectDefinition(authoredType);
  const tileX = toInteger(entry.x ?? entry.tileX, `scene_object_x:${index}`);
  const tileY = toInteger(entry.y ?? entry.tileY, `scene_object_y:${index}`);
  const id = entry.id ?? `${initialDef.type}:${tileX}:${tileY}:${index}`;
  const treeDefinition = isProceduralTreeType(authoredType)
    ? resolveProceduralTreeDefinition(entry.tree ?? entry.treeDefinition ?? {}, { id, type: authoredType, x: tileX, y: tileY })
    : null;
  const undergrowthDefinition = isProceduralUndergrowthType(authoredType)
    ? resolveProceduralUndergrowthDefinition(entry.undergrowth ?? entry.undergrowthDefinition ?? {}, {
      id,
      type: authoredType,
      x: tileX,
      y: tileY,
      materialState: { ...(initialDef.materialState ?? {}), ...(entry.materialState ?? {}) }
    })
    : null;
  const geologyDefinition = isProceduralGeologyType(authoredType)
    ? resolveProceduralGeologyDefinition(entry.geology ?? entry.geologyDefinition ?? {}, { id, type: authoredType, x: tileX, y: tileY })
    : null;
  const def = treeDefinition?.species === 'silver_birch'
    ? getSceneObjectDefinition('birch_tree')
    : initialDef;
  const treeProfile = treeDefinition ? resolveProceduralTreeSceneProfile(treeDefinition) : null;
  const undergrowthProfile = undergrowthDefinition ? resolveProceduralUndergrowthSceneProfile(undergrowthDefinition) : null;
  const geologyProfile = geologyDefinition ? resolveProceduralGeologySceneProfile(geologyDefinition) : null;
  const visualProfile = treeProfile?.visualFootprint ?? undergrowthProfile?.visualFootprint ?? geologyProfile?.visualFootprint ?? def.visualFootprint;
  const widthTiles = positiveTileSpan(entry.w ?? entry.widthTiles ?? def.footprint.w, 1);
  const heightTiles = positiveTileSpan(entry.h ?? entry.heightTiles ?? def.footprint.h, 1);
  const visualWidthTiles = positiveNumber(
    entry.visualWidthTiles ?? entry.visualFootprint?.w ?? visualProfile?.w,
    widthTiles
  );
  const visualHeightTiles = positiveNumber(
    entry.visualHeightTiles ?? entry.visualFootprint?.h ?? visualProfile?.h,
    heightTiles
  );
  const visualOffsetX = finiteNumber(
    entry.visualOffsetX ?? entry.visualFootprint?.offsetX ?? visualProfile?.offsetX,
    (widthTiles - visualWidthTiles) / 2
  );
  const visualOffsetY = finiteNumber(
    entry.visualOffsetY ?? entry.visualFootprint?.offsetY ?? visualProfile?.offsetY,
    (heightTiles - visualHeightTiles) / 2
  );
  const shadowShapeReference = def.occlusion?.shadowShape || entry.occlusion?.shadowShape
    ? { ...(def.occlusion?.shadowShape ?? {}), ...(entry.occlusion?.shadowShape ?? {}) }
    : null;
  const occlusion = {
    ...def.occlusion,
    ...(entry.occlusion ?? {}),
    shadowShape: shadowShapeReference ? resolveShadowShapeProfile(shadowShapeReference) : null
  };
  const render = {
    ...def.render,
    ...(undergrowthProfile?.render ?? {}),
    ...(geologyProfile?.render ?? {}),
    ...(treeProfile?.render ?? {}),
    ...(entry.render ?? {})
  };
  const emitter = def.emitter || entry.emitter
    ? {
      ...(def.emitter ?? {}),
      ...(entry.emitter ?? {})
    }
    : null;
  const visualTileX = tileX + visualOffsetX;
  const visualTileY = tileY + visualOffsetY;
  const blocksMovement = entry.blocksMovement ?? def.collision.blocksMovement;
  const objectX = tileX + widthTiles / 2;
  const objectY = tileY + heightTiles / 2;
  const treeSpatialRecipe = treeDefinition ? generateProceduralTreeSpatialRecipe(treeDefinition) : null;
  const collisionShape = blocksMovement
    ? buildSceneObjectCollisionShape({ treeDefinition, treeSpatialRecipe, geologyDefinition, def, entry, x: objectX, y: objectY, widthTiles, heightTiles, id })
    : null;
  const traversalModifiers = treeSpatialRecipe
    ? treeSpatialRecipe.traversalModifiers.map((modifier) => translateTraversalModifier(modifier, objectX, objectY, {
      ...modifier.source, sourceId: id
    }))
    : [];
  return {
    id,
    type: treeDefinition ? 'tree' : def.type,
    authoredType,
    label: entry.label ?? (treeDefinition
      ? getTreeSpeciesRecipe(treeDefinition.species).label
      : undergrowthDefinition
        ? getUndergrowthSpeciesRecipe(undergrowthDefinition.species).label
        : geologyDefinition
          ? getGeologyRecipe(geologyDefinition.formation).label
          : def.label),
    scaleProfileId: entry.scaleProfileId ?? def.scaleProfileId ?? null,
    materialProfileId: entry.materialProfileId ?? treeProfile?.materialProfileId ?? undergrowthProfile?.materialProfileId ?? geologyProfile?.materialProfileId ?? def.materialProfileId ?? null,
    materialState: {
      ...(def.materialState ?? {}),
      ...(undergrowthProfile?.materialState ?? {}),
      ...(geologyProfile?.materialState ?? {}),
      ...(entry.materialState ?? {})
    },
    physical: {
      ...(def.physical ?? {}),
      ...(undergrowthProfile?.physical ?? {}),
      ...(geologyProfile?.physical ?? {}),
      ...(treeProfile?.physical ?? {}),
      ...(entry.physical ?? {})
    },
    treeDefinition,
    undergrowthDefinition,
    geologyDefinition,
    tileX,
    tileY,
    x: objectX,
    y: objectY,
    widthTiles,
    heightTiles,
    collisionFootprint: { w: widthTiles, h: heightTiles },
    visualTileX,
    visualTileY,
    visualX: visualTileX + visualWidthTiles / 2,
    visualY: visualTileY + visualHeightTiles / 2,
    visualWidthTiles,
    visualHeightTiles,
    visualFootprint: {
      w: visualWidthTiles,
      h: visualHeightTiles,
      offsetX: visualOffsetX,
      offsetY: visualOffsetY
    },
    blocksMovement,
    collisionPolicy: treeSpatialRecipe ? 'recipe_derived_trunk_circle_root_traversal_v2'
      : collisionShape ? 'recipe_derived_spatial_shape_v1' : def.collision.policy,
    collisionShape,
    traversalModifiers,
    render,
    emitter,
    occlusion,
    source: entry.source ?? 'scenario.sceneObjects'
  };
}

function buildSceneObjectCollisionShape({ treeDefinition, treeSpatialRecipe, geologyDefinition, def, entry, x, y, widthTiles, heightTiles, id }) {
  if (entry.collisionShape?.contract === 'black-sky-bound.collision-shape-2d.v1') return entry.collisionShape;
  if (treeDefinition) {
    const local = treeSpatialRecipe.collision;
    return translateCollisionShape(local, x, y, {
      sourceKind: 'procedural_tree', sourceId: id, species: treeDefinition.species,
      policy: 'visible_trunk_circle_roots_traversable_canopy_excluded'
    });
  }
  if (geologyDefinition || def.render?.kind === 'procedural_geology' || def.render?.kind === 'dead_snag') {
    const widthMeters = Number(def.physical?.widthMeters ?? def.physical?.trunkBaseMeters ?? widthTiles * WORLD_SCALE.tileMeters);
    const depthMeters = Number(def.physical?.depthMeters ?? def.physical?.trunkBaseMeters ?? heightTiles * WORLD_SCALE.tileMeters);
    return createCircleCollision(x, y, Math.max(0.18, Math.min(widthMeters, depthMeters) / WORLD_SCALE.tileMeters * 0.5), {
      sourceKind: def.render?.kind, sourceId: id, policy: 'visible_base_circle'
    });
  }
  return createConvexPolygonCollision([
    { x: x - widthTiles * 0.5, y: y - heightTiles * 0.5 },
    { x: x + widthTiles * 0.5, y: y - heightTiles * 0.5 },
    { x: x + widthTiles * 0.5, y: y + heightTiles * 0.5 },
    { x: x - widthTiles * 0.5, y: y + heightTiles * 0.5 }
  ], { sourceKind: def.render?.kind ?? 'scene_object', sourceId: id, policy: 'visible_footprint_polygon' });
}

export function isSceneObjectBlocked(map, x, y) {
  return !!getBlockingSceneObjectAtTile(map, Math.floor(x), Math.floor(y));
}

export function getBlockingSceneObjectAtTile(map, tileX, tileY) {
  const objects = Array.isArray(map?.sceneObjects) ? map.sceneObjects : [];
  return objects.find((object) => {
    if (!object.blocksMovement) return false;
    return tileX >= object.tileX
      && tileY >= object.tileY
      && tileX < object.tileX + object.widthTiles
      && tileY < object.tileY + object.heightTiles;
  }) ?? null;
}

export function buildSceneObjectOcclusionBlockers(sceneObjects = []) {
  return sceneObjects
    .filter((object) => object.occlusion?.castsShadow !== false && object.occlusion?.shadowShape?.castsShadow !== false)
    .map((object) => ({
      id: object.id,
      entityId: object.id,
      kind: object.type,
      blockerKind: object.type,
      x: object.x,
      y: object.y,
      radius: positiveNumber(object.occlusion?.radius, Math.max(object.widthTiles, object.heightTiles) * 0.45),
      height: positiveNumber(object.occlusion?.height ?? object.occlusion?.occlusionHeight, 0),
      shadowShape: object.occlusion?.shadowShape ?? null,
      static: true,
      source: object.source
    }))
    .filter((blocker) => blocker.height > 0);
}

function toInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) throw new Error(`Invalid ${label}`);
  return numeric;
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function positiveTileSpan(value, fallback) {
  return Math.max(1, Math.ceil(positiveNumber(value, fallback)));
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
