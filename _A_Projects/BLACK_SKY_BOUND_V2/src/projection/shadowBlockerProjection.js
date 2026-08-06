export function buildShadowBlockerProjection(blockers, tileSize) {
  return blockers.map((blocker) => ({
    id: blocker.id,
    classification: blocker.classification ?? 'renderer_neutral_shadow_blocker_projection',
    source: blocker.source ?? 'explicit_physical_occluder',
    entityId: blocker.entityId ?? null,
    worldX: blocker.x * tileSize,
    worldY: blocker.y * tileSize,
    radius: Math.max(1, blocker.radius * tileSize),
    height: blocker.height ?? blocker.occlusionHeight ?? 0,
    kind: blocker.blockerKind ?? blocker.kind ?? 'shadow_blocker',
    static: blocker.static !== false,
    shadowShapeContract: blocker.shadowShape?.contract ?? blocker.shadowSilhouette?.contract ?? null,
    shadowShapeProfileId: blocker.shadowShape?.profileId ?? null,
    shadowShapeVariantId: blocker.shadowShape?.variantId ?? null,
    shadowContactShape: blocker.shadowShape?.contact?.shape ?? null,
    shadowSilhouetteContract: blocker.shadowShape?.contract ?? blocker.shadowSilhouette?.contract ?? null,
    shadowSilhouetteShape: blocker.shadowShape?.profileId ?? blocker.shadowSilhouette?.shape ?? null,
    shadowSilhouettePrimitiveCount: blocker.shadowShape?.primitives?.length ?? blocker.shadowSilhouette?.primitives?.length ?? 0
  }));
}
