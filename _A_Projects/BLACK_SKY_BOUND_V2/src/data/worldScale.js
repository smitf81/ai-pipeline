export const WORLD_SCALE = Object.freeze({
  id: 'hatchling_half_meter_tiles_v0',
  classification: 'world_scale_profile',
  tileMeters: 0.5,
  tileRole: 'movement_and_composition_grid_not_literal_terrain_meter',
  referenceCreature: Object.freeze({
    id: 'grounded_wyvern_hatchling_skeletal_gait_v0',
    bodyMeters: 1,
    tailMeters: 1,
    noseToTailMeters: 2,
    noseToTailTiles: 4,
    note: 'Fresh hatchling reads as roughly four half-meter grid tiles nose to tail.'
  }),
  sceneObjectTargets: Object.freeze({
    dwarfingTree: Object.freeze({
      trunkBaseMeters: 1,
      crownWidthMeters: 3,
      crownDepthMeters: 3.5,
      heightMeters: 8,
      collisionTiles: Object.freeze({ w: 2, h: 2 }),
      visualTiles: Object.freeze({ w: 6, h: 7 }),
      note: 'A mature tree should visibly dwarf the two-meter hatchling without making terrain tiles smaller.'
    }),
    boulder: Object.freeze({
      widthMeters: 1,
      depthMeters: 1,
      heightMeters: 0.8,
      collisionTiles: Object.freeze({ w: 2, h: 2 }),
      visualTiles: Object.freeze({ w: 2.4, h: 2.1 }),
      note: 'A waist-high boulder is still Pokemon-simple but no longer a single half-meter pebble.'
    }),
    fireArrowEmitter: Object.freeze({
      single: Object.freeze({
        widthMeters: 0.34,
        depthMeters: 0.26,
        heightMeters: 0.18,
        collisionTiles: Object.freeze({ w: 1, h: 1 }),
        visualTiles: Object.freeze({ w: 0.68, h: 0.52 })
      }),
      cluster: Object.freeze({
        widthMeters: 0.48,
        depthMeters: 0.36,
        heightMeters: 0.2,
        collisionTiles: Object.freeze({ w: 1, h: 1 }),
        visualTiles: Object.freeze({ w: 0.96, h: 0.72 })
      }),
      note: 'Flaming arrows are tiny embedded ignition sockets, not barricades or campfire props.'
    })
  })
});

export function metersToTiles(meters, scale = WORLD_SCALE) {
  const numeric = Number(meters);
  if (!Number.isFinite(numeric)) return 0;
  return Number((numeric / scale.tileMeters).toFixed(3));
}

export function tileSpanForMeters(meters, scale = WORLD_SCALE) {
  return Math.max(1, Math.ceil(metersToTiles(meters, scale)));
}
