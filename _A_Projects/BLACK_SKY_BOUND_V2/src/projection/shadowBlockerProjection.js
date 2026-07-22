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
    shadowSilhouetteContract: blocker.shadowSilhouette?.contract ?? null,
    shadowSilhouetteShape: blocker.shadowSilhouette?.shape ?? null,
    shadowSilhouettePrimitiveCount: blocker.shadowSilhouette?.primitives?.length ?? 0
  }));
}
