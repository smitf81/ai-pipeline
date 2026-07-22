export function buildCorpseDecalProjection(corpses, tileSize) {
  return corpses.flatMap((corpse) => {
    const cos = Math.cos(corpse.rotation ?? 0);
    const sin = Math.sin(corpse.rotation ?? 0);
    const bloodX = corpse.x + corpse.bloodOffsetX * cos - corpse.bloodOffsetY * sin;
    const bloodY = corpse.y + corpse.bloodOffsetX * sin + corpse.bloodOffsetY * cos;
    return [
      {
        classification: 'renderer_neutral_decal_projection',
        id: `${corpse.id}:blood`,
        kind: 'corpse_blood_pool',
        sourceKind: 'blood_spatter_stain',
        sourceEntityId: corpse.sourceEntityId,
        visualRole: 'ground_decal',
        visualMaterial: 'residual_blood_spatter_stain_v0',
        worldX: bloodX * tileSize,
        worldY: bloodY * tileSize,
        radius: Math.max(2, corpse.bloodRadius * tileSize),
        colour: corpse.bloodColour,
        rimColour: corpse.bloodRimColour,
        opacity: 0.9,
        softness: 0.82,
        poolShape: 'bounded_corpse_blood_pool'
      },
      {
        classification: 'renderer_neutral_decal_projection',
        id: `${corpse.id}:body`,
        kind: 'corpse_body',
        sourceKind: corpse.sourceKind,
        sourceEntityId: corpse.sourceEntityId,
        corpseProfileId: corpse.profileId,
        visualRole: 'corpse_body',
        worldX: corpse.x * tileSize,
        worldY: corpse.y * tileSize,
        radius: Math.max(2, corpse.bodyLength * tileSize * 0.62),
        worldLength: corpse.bodyLength * tileSize,
        worldWidth: corpse.bodyWidth * tileSize,
        rotation: corpse.rotation ?? 0,
        colour: corpse.bodyColour,
        detailColour: corpse.detailColour,
        opacity: 0.9,
        softness: 0.76
      }
    ];
  });
}
