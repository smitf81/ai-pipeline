import { LightEmitterId } from '../constants/lightEmitterIds.js';

export const SmokeSourceKind = Object.freeze({
  DRAGON_SMOKE_CLOUD: 'dragon_smoke_cloud',
  DRAGON_SMOKE_PLUME: 'dragon_smoke_plume',
  NAPALM_DROPLET_WISP: 'napalm_droplet_wisp',
  NAPALM_SMOULDER: 'napalm_smoulder',
  TORCH_WISP: 'torch_wisp',
  RAID_FLAME_WISP: 'raid_flame_wisp',
  SMOULDER_PATCH_WISP: 'smoulder_patch_wisp'
});

export const SMOKE_SOURCE_RECIPES = Object.freeze({
  [SmokeSourceKind.DRAGON_SMOKE_CLOUD]: Object.freeze({
    id: SmokeSourceKind.DRAGON_SMOKE_CLOUD,
    classification: 'projection_smoke_source_recipe',
    label: 'Dragon smoke cloud density source',
    sourceAuthority: 'SmokeCloud component view',
    density: 1.0,
    radiusScale: 1.0,
    driftScale: 1.0,
    renderPriority: 90
  }),
  [SmokeSourceKind.DRAGON_SMOKE_PLUME]: Object.freeze({
    id: SmokeSourceKind.DRAGON_SMOKE_PLUME,
    classification: 'projection_smoke_source_recipe',
    label: 'Dragon smoke spit plume density source',
    sourceAuthority: 'SmokeCloud plume component view',
    density: 1.05,
    radiusScale: 1.0,
    driftScale: 1.08,
    renderPriority: 96
  }),
  [SmokeSourceKind.NAPALM_DROPLET_WISP]: Object.freeze({
    id: SmokeSourceKind.NAPALM_DROPLET_WISP,
    classification: 'projection_smoke_source_recipe',
    label: 'Napalm droplet micro-wisp density source',
    sourceAuthority: 'active napalm droplet projection state',
    density: 0.16,
    radiusScale: 1.65,
    driftScale: 0.5,
    renderPriority: 76
  }),
  [SmokeSourceKind.NAPALM_SMOULDER]: Object.freeze({
    id: SmokeSourceKind.NAPALM_SMOULDER,
    classification: 'projection_smoke_source_recipe',
    label: 'Napalm pool smoulder density source',
    sourceAuthority: 'active napalm pool projection state',
    density: 0.5,
    radiusScale: 2.42,
    driftScale: 0.76,
    renderPriority: 70
  }),
  [SmokeSourceKind.TORCH_WISP]: Object.freeze({
    id: SmokeSourceKind.TORCH_WISP,
    classification: 'projection_smoke_source_recipe',
    label: 'Torch wisp density source',
    sourceAuthority: `${LightEmitterId.TORCH} LightEmitter view`,
    density: 0.3,
    radiusScale: 0.46,
    driftScale: 0.62,
    renderPriority: 44
  }),
  [SmokeSourceKind.RAID_FLAME_WISP]: Object.freeze({
    id: SmokeSourceKind.RAID_FLAME_WISP,
    classification: 'projection_smoke_source_recipe',
    label: 'Raid flame arrow wisp density source',
    sourceAuthority: `${LightEmitterId.RAID_FLAME} scene object emitter view`,
    density: 0.22,
    radiusScale: 0.28,
    driftScale: 0.44,
    renderPriority: 48
  }),
  [SmokeSourceKind.SMOULDER_PATCH_WISP]: Object.freeze({
    id: SmokeSourceKind.SMOULDER_PATCH_WISP,
    classification: 'projection_smoke_source_recipe',
    label: 'Smouldering plant density source',
    sourceAuthority: `${LightEmitterId.SMOULDER_PATCH} scene object emitter view`,
    density: 0.3,
    radiusScale: 0.64,
    driftScale: 0.54,
    renderPriority: 52
  })
});

export function getSmokeSourceRecipe(kind) {
  const recipe = SMOKE_SOURCE_RECIPES[kind];
  if (!recipe) throw new Error(`Unknown smoke source kind: ${kind}`);
  return recipe;
}
