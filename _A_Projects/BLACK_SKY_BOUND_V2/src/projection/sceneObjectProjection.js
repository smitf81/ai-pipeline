import { MaterialFamily } from '../data/materialProfiles.js';
import { buildMaterialProjection, buildSceneObjectMaterialState } from './materialProjection.js';

export function buildSceneryProjection(sceneObjects, tileSize) {
  return sceneObjects.map((object) => ({
    classification: 'renderer_neutral_scene_object_projection',
    id: object.id,
    type: object.type,
    authoredType: object.authoredType ?? object.type,
    label: object.label,
    treeDefinition: cloneProjectionData(object.treeDefinition),
    undergrowthDefinition: cloneProjectionData(object.undergrowthDefinition),
    geologyDefinition: cloneProjectionData(object.geologyDefinition),
    scaleProfileId: object.scaleProfileId ?? null,
    physical: cloneProjectionData(object.physical) ?? {},
    x: object.visualX,
    y: object.visualY,
    anchorX: object.x,
    anchorY: object.y,
    tileX: object.tileX,
    tileY: object.tileY,
    widthTiles: object.widthTiles,
    heightTiles: object.heightTiles,
    collisionFootprint: cloneProjectionData(object.collisionFootprint) ?? { w: object.widthTiles, h: object.heightTiles },
    visualTileX: object.visualTileX,
    visualTileY: object.visualTileY,
    visualWidthTiles: object.visualWidthTiles,
    visualHeightTiles: object.visualHeightTiles,
    visualFootprint: cloneProjectionData(object.visualFootprint) ?? {
      w: object.visualWidthTiles,
      h: object.visualHeightTiles,
      offsetX: 0,
      offsetY: 0
    },
    worldX: object.visualX * tileSize,
    worldY: object.visualY * tileSize,
    anchorWorldX: object.x * tileSize,
    anchorWorldY: object.y * tileSize,
    worldTileX: object.visualTileX * tileSize,
    worldTileY: object.visualTileY * tileSize,
    worldWidth: object.visualWidthTiles * tileSize,
    worldHeight: object.visualHeightTiles * tileSize,
    collisionWorldTileX: object.tileX * tileSize,
    collisionWorldTileY: object.tileY * tileSize,
    collisionWorldWidth: object.widthTiles * tileSize,
    collisionWorldHeight: object.heightTiles * tileSize,
    worldRadius: Math.max(1, Math.max(object.visualWidthTiles, object.visualHeightTiles) * tileSize * 0.5),
    blocksMovement: !!object.blocksMovement,
    collisionPolicy: object.collisionPolicy,
    occlusionHeight: object.occlusion?.height ?? object.occlusion?.occlusionHeight ?? 0,
    occlusionRadius: object.occlusion?.radius ?? 0,
    materialProfileId: object.materialProfileId ?? null,
    material: object.materialProfileId ? buildMaterialProjection(object.materialProfileId, {
      family: MaterialFamily.SCENE_OBJECT,
      state: buildSceneObjectMaterialState(object),
      source: { kind: 'sceneObject', id: object.id, type: object.type }
    }) : null,
    render: cloneProjectionData(object.render) ?? {}
  }));
}

function cloneProjectionData(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}
