import { AUDIO_TUNING } from '../data/audio/audioTuning.js';

export function resolveOpeningMix(opening, tuning = AUDIO_TUNING) {
  const profile = tuning?.openingPerspective ?? AUDIO_TUNING.openingPerspective;
  const maxCutoffHz = tuning?.bodyState?.muffle?.maxCutoffHz ?? AUDIO_TUNING.bodyState.muffle.maxCutoffHz;
  if (opening?.released !== false) {
    return { ambience: 1, breath: 1, heartbeat: 0, muffle: 0, exteriorGain: 1, cutoffHz: maxCutoffHz, exposure: 1 };
  }
  const shellOpening = clamp01(opening.openingProgress ?? 0);
  const shellStrain = clamp01(opening.strainProgress ?? 0);
  const emergence = clamp01(opening.emergenceProgress ?? 0);
  const settling = clamp01(opening.settleProgress ?? 0);
  const exposure = clamp01(Math.max(
    shellOpening * profile.shellOpeningLeakWeight,
    emergence * profile.emergenceExposureRate,
    settling
  ));
  const sealedCutoffHz = Math.min(maxCutoffHz, Math.max(20, profile.sealedCutoffHz));
  const crackedCutoffHz = Math.min(maxCutoffHz, Math.max(sealedCutoffHz, profile.crackedCutoffHz ?? 2600));
  const crackExposure = clamp01(Math.max(shellOpening, shellStrain * profile.shellOpeningLeakWeight));
  const openExposure = clamp01(Math.max(emergence * profile.emergenceExposureRate, settling));
  const crackedStageCutoff = sealedCutoffHz + (crackedCutoffHz - sealedCutoffHz) * crackExposure;
  const shellCutoff = crackedStageCutoff + (maxCutoffHz - crackedStageCutoff) * openExposure;
  const closedGain = profile.sealedExteriorGain;
  const crackedGain = Math.max(closedGain, profile.crackedExteriorGain ?? 0.72);
  const crackedStageGain = closedGain + (crackedGain - closedGain) * crackExposure;
  const shellGain = crackedStageGain + (1 - crackedStageGain) * openExposure;
  return {
    ambience: 0.16 + exposure * 0.84,
    breath: 1,
    heartbeat: 0.9,
    muffle: profile.maxMuffleIntensity * (1 - exposure),
    exteriorGain: shellGain,
    cutoffHz: shellCutoff,
    exposure
  };
}

export function damageIntensity(amount) {
  return clamp01((Number(amount) || 0) / 44);
}

export function summarizePayload(payload) {
  const summary = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (typeof value === 'number') summary[key] = rounded(value);
    else if (typeof value === 'string' || typeof value === 'boolean' || value == null) summary[key] = value;
    else if (key === 'sourceRef' && value?.ownerKind && value?.ownerId) summary[key] = { ...value };
  }
  return summary;
}

export function findAudioPlayer(game) {
  return (game?.actors ?? []).find((actor) => actor.id === game.dragonId)
    ?? (game?.actors ?? []).find((actor) => actor.team === 'player')
    ?? null;
}

export function findNearestEnemy(game, player) {
  if (!game || !player) return null;
  let nearest = null;
  for (const actor of game.actors ?? []) {
    if (!actor.alive || actor.team === player.team) continue;
    const distance = Math.hypot(actor.x - player.x, actor.y - player.y);
    if (!nearest || distance < nearest.distance) nearest = { actor, distance };
  }
  return nearest;
}

export function rounded(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(3)) : 0;
}

export function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
