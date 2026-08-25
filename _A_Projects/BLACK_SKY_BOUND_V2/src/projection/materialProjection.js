import { getMaterialProfile, MaterialFamily } from '../data/materialProfiles.js';

export const MATERIAL_PROJECTION_CONTRACT = 'black-sky-bound.material-profile-projection.v0';

export function buildMaterialProjection(profileId, options = {}) {
  const profile = getMaterialProfile(profileId);
  const state = normalizeMaterialState({ ...profile.stateDefaults, ...(options.state ?? {}) });
  return {
    classification: 'renderer_neutral_material_projection',
    contract: MATERIAL_PROJECTION_CONTRACT,
    profileId: profile.id,
    family: options.family ?? profile.family,
    shaderVariant: state.firePhase
      ? `${profile.shaderVariant}+foliage_fire_lifecycle_v1`
      : profile.shaderVariant,
    uniforms: {
      ...profile.uniforms,
      ...(options.uniforms ?? {})
    },
    state,
    tags: [...profile.tags],
    source: options.source ?? null,
    provenance: {
      owner: 'src/projection/materialProjection.js',
      truthSource: 'material profile registry plus projected object state',
      note: 'renderer-neutral material packet; render backends consume this through adapters, not object-type branches'
    }
  };
}

export function buildActorMaterialState(actor, team) {
  const hp = Number(actor?.hp);
  const maxHp = Math.max(1, Number(actor?.maxHp) || 1);
  return normalizeMaterialState({
    damageAmount: Number.isFinite(hp) ? 1 - hp / maxHp : 0,
    burnAmount: actor?.status?.burnAmount ?? 0,
    wetness: actor?.status?.wetness ?? 0,
    factionTint: factionTintForTeam(team ?? actor?.team),
    selectionHighlight: actor?.selected ? 1 : 0,
    nightReveal: team === 'player' ? 0.86 : 0.68,
    integrity: Number.isFinite(hp) ? hp / maxHp : 1
  });
}

export function buildSceneObjectMaterialState(object) {
  const foliageFire = object?.materialState?.foliageFire ?? null;
  return normalizeMaterialState({
    burnAmount: object?.materialState?.burnAmount ?? 0,
    wetness: object?.materialState?.wetness ?? 0,
    damageAmount: object?.materialState?.damageAmount ?? 0,
    integrity: object?.materialState?.integrity ?? 1,
    density: object?.materialState?.density ?? (object?.blocksMovement ? 0.82 : 0.48),
    selectionHighlight: object?.selected ? 1 : 0,
    nightReveal: object?.materialState?.nightReveal ?? (object?.blocksMovement ? 0.54 : 0.46),
    fireFamily: foliageFire?.family ?? null,
    firePhase: foliageFire?.phase ?? null,
    fireAge: foliageFire?.age ?? 0,
    firePhaseProgress: foliageFire?.phaseProgress ?? 0,
    heatAmount: foliageFire?.heatAmount ?? 0,
    emberAmount: foliageFire?.emberAmount ?? 0,
    smokeAmount: foliageFire?.smokeAmount ?? 0,
    charAmount: foliageFire?.charAmount ?? object?.materialState?.charAmount ?? 0
  });
}

export function buildTerrainMaterialState(type, terrain) {
  return normalizeMaterialState({
    burnAmount: type === 'scorched' ? 0.86 : 0,
    wetness: type === 'water' ? 1 : 0,
    density: terrain?.obscures ? 0.86 : (terrain?.blocks ? 0.72 : 0.42),
    integrity: terrain?.blocks ? 0.92 : 1,
    nightReveal: terrain?.obscures ? 0.42 : 0.56
  });
}

export function buildMaterialSummary(projections = []) {
  const profiles = new Map();
  for (const material of projections.filter(Boolean)) {
    const entry = profiles.get(material.profileId) ?? {
      profileId: material.profileId,
      family: material.family,
      shaderVariant: material.shaderVariant,
      count: 0
    };
    entry.count += 1;
    profiles.set(material.profileId, entry);
  }
  return {
    classification: 'renderer_neutral_material_profile_summary',
    contract: MATERIAL_PROJECTION_CONTRACT,
    profileCount: profiles.size,
    profiles: [...profiles.values()].sort((a, b) => a.profileId.localeCompare(b.profileId))
  };
}

function factionTintForTeam(team) {
  if (team === 'player') return '#d18355';
  if (team === 'enemy') return '#9a6a52';
  return null;
}

function normalizeMaterialState(state = {}) {
  return {
    damageAmount: clamp01(state.damageAmount),
    burnAmount: clamp01(state.burnAmount),
    wetness: clamp01(state.wetness),
    factionTint: typeof state.factionTint === 'string' ? state.factionTint : null,
    nightReveal: clamp01(state.nightReveal ?? 1),
    windSway: clamp01(state.windSway),
    density: clamp01(state.density ?? 1),
    integrity: clamp01(state.integrity ?? 1),
    selectionHighlight: clamp01(state.selectionHighlight),
    firePhase: typeof state.firePhase === 'string' ? state.firePhase : null,
    fireFamily: typeof state.fireFamily === 'string' ? state.fireFamily : null,
    fireAge: finiteNonNegative(state.fireAge),
    firePhaseProgress: clamp01(state.firePhaseProgress),
    heatAmount: clamp01(state.heatAmount),
    emberAmount: clamp01(state.emberAmount),
    smokeAmount: clamp01(state.smokeAmount),
    charAmount: clamp01(state.charAmount)
  };
}

function finiteNonNegative(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

export { MaterialFamily };
