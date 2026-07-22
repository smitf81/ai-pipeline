import { getSceneObjectDefinition } from '../data/sceneObjects.js';
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
  const occlusion = {
    ...def.occlusion,
    ...(entry.occlusion ?? {})
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
    x: tileX + widthTiles / 2,
    y: tileY + heightTiles / 2,
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
    blocksMovement: entry.blocksMovement ?? def.collision.blocksMovement,
    collisionPolicy: def.collision.policy,
    render,
    emitter,
    occlusion,
    source: entry.source ?? 'scenario.sceneObjects'
  };
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
    .filter((object) => object.occlusion?.castsShadow !== false)
    .map((object) => ({
      id: object.id,
      entityId: object.id,
      kind: object.type,
      blockerKind: object.type,
      x: object.x,
      y: object.y,
      radius: positiveNumber(object.occlusion?.radius, Math.max(object.widthTiles, object.heightTiles) * 0.45),
      height: positiveNumber(object.occlusion?.height ?? object.occlusion?.occlusionHeight, 0),
      shadowSilhouette: object.occlusion?.shadowSilhouette ?? null,
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
