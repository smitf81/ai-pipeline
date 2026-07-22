export const AmbientParticleKind = Object.freeze({
  TORCH_SPARK: 'torch_spark',
  RAID_FLAME_SPARK: 'raid_flame_spark',
  NAPALM_EMBER: 'napalm_ember',
  SMOKE_TRAIL_MOTE: 'smoke_trail_mote',
  ASH_FLECK: 'ash_fleck',
  MAMA_INFERNO_EMBER: 'mama_inferno_ember',
  TREE_FIRE_EMBER: 'tree_fire_ember',
  LEAF_DRIFT: 'leaf_drift'
});

export const AMBIENT_PARTICLE_PROJECTION_MODE = 'ambient_particles_projection_v0';

export const AMBIENT_PARTICLE_RECIPES = Object.freeze({
  [AmbientParticleKind.TORCH_SPARK]: Object.freeze({
    id: AmbientParticleKind.TORCH_SPARK,
    classification: 'ambient_particle_recipe',
    visualRole: 'flame_spark',
    sourceAuthority: 'projected torch light socket',
    count: 4,
    cycleSeconds: 0.92,
    radiusPx: 1.15,
    driftPx: 19,
    spreadPx: 4.5,
    colour: 'rgba(255,134,42,0.78)',
    coreColour: 'rgba(255,224,132,0.86)',
    opacity: 0.72,
    softness: 0.76,
    renderPriority: 96
  }),
  [AmbientParticleKind.RAID_FLAME_SPARK]: Object.freeze({
    id: AmbientParticleKind.RAID_FLAME_SPARK,
    classification: 'ambient_particle_recipe',
    visualRole: 'flame_spark',
    sourceAuthority: 'projected raid flame scene-object socket',
    count: 2,
    cycleSeconds: 1.12,
    radiusPx: 0.62,
    driftPx: 8,
    spreadPx: 1.6,
    colour: 'rgba(255,112,32,0.68)',
    coreColour: 'rgba(255,210,116,0.78)',
    opacity: 0.52,
    softness: 0.8,
    renderPriority: 94
  }),
  [AmbientParticleKind.NAPALM_EMBER]: Object.freeze({
    id: AmbientParticleKind.NAPALM_EMBER,
    classification: 'ambient_particle_recipe',
    visualRole: 'hot_ember',
    sourceAuthority: 'projected active napalm pool',
    count: 3,
    cycleSeconds: 1.12,
    radiusPx: 1.05,
    driftPx: 15,
    colour: 'rgba(226,82,28,0.72)',
    coreColour: 'rgba(255,198,86,0.78)',
    opacity: 0.62,
    softness: 0.8,
    renderPriority: 88
  }),
  [AmbientParticleKind.MAMA_INFERNO_EMBER]: Object.freeze({
    id: AmbientParticleKind.MAMA_INFERNO_EMBER,
    classification: 'ambient_particle_recipe',
    visualRole: 'hot_ember',
    sourceAuthority: 'projected mama inferno light nodes',
    count: 3,
    cycleSeconds: 0.82,
    radiusPx: 1.7,
    driftPx: 54,
    spreadPx: 22,
    colour: 'rgba(255,86,18,0.86)',
    coreColour: 'rgba(255,232,132,0.94)',
    opacity: 0.82,
    softness: 0.7,
    renderPriority: 126
  }),
  [AmbientParticleKind.TREE_FIRE_EMBER]: Object.freeze({
    id: AmbientParticleKind.TREE_FIRE_EMBER,
    classification: 'ambient_particle_recipe',
    visualRole: 'hot_ember',
    sourceAuthority: 'projected runtime tree-fire light nodes',
    count: 3,
    cycleSeconds: 1.08,
    radiusPx: 1.18,
    driftPx: 34,
    spreadPx: 12,
    colour: 'rgba(238,72,18,0.78)',
    coreColour: 'rgba(255,196,74,0.9)',
    opacity: 0.72,
    softness: 0.74,
    renderPriority: 122
  }),
  [AmbientParticleKind.SMOKE_TRAIL_MOTE]: Object.freeze({
    id: AmbientParticleKind.SMOKE_TRAIL_MOTE,
    classification: 'ambient_particle_recipe',
    visualRole: 'smoke_trail_mote',
    sourceAuthority: 'projected smoke plume source',
    count: 4,
    cycleSeconds: 1.35,
    radiusPx: 3.2,
    driftPx: 32,
    colour: 'rgba(170,174,158,0.26)',
    coreColour: 'rgba(205,204,184,0.2)',
    opacity: 0.32,
    softness: 0.92,
    renderPriority: 54
  }),
  [AmbientParticleKind.ASH_FLECK]: Object.freeze({
    id: AmbientParticleKind.ASH_FLECK,
    classification: 'ambient_particle_recipe',
    visualRole: 'ash_fleck',
    sourceAuthority: 'projected smouldering smoke source',
    count: 2,
    cycleSeconds: 1.85,
    radiusPx: 1,
    driftPx: 24,
    colour: 'rgba(86,78,68,0.5)',
    coreColour: 'rgba(130,116,95,0.36)',
    opacity: 0.36,
    softness: 0.84,
    renderPriority: 46
  }),
  [AmbientParticleKind.LEAF_DRIFT]: Object.freeze({
    id: AmbientParticleKind.LEAF_DRIFT,
    classification: 'ambient_particle_recipe',
    visualRole: 'leaf_drift',
    sourceAuthority: 'projected tree scenery',
    count: 4,
    cycleSeconds: 2.4,
    radiusPx: 3.6,
    driftPx: 44,
    colour: 'rgba(79,116,57,0.62)',
    coreColour: 'rgba(120,126,63,0.54)',
    opacity: 0.58,
    softness: 0.8,
    renderPriority: 38
  })
});

export function getAmbientParticleRecipe(kind) {
  const recipe = AMBIENT_PARTICLE_RECIPES[kind];
  if (!recipe) throw new Error(`Unknown ambient particle kind: ${kind}`);
  return recipe;
}
