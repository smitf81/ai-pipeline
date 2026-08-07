import { PLAYER_LIFECYCLE_PROFILE, resolvePlayerLifecycleOverlay } from '../data/playerLifecycle.js';

export function buildPlayerLifecycleProjection(actors) {
  const player = actors.find((actor) => actor.team === 'player');
  const lifecycle = player?.playerLifecycle ?? null;
  const overlay = resolvePlayerLifecycleOverlay(lifecycle, PLAYER_LIFECYCLE_PROFILE);
  return {
    classification: 'renderer_neutral_player_lifecycle_projection_v0',
    profileId: PLAYER_LIFECYCLE_PROFILE.id,
    state: lifecycle?.state ?? 'alive',
    previousState: lifecycle?.previousState ?? null,
    stateElapsed: lifecycle?.stateElapsed ?? 0,
    deathCount: lifecycle?.deathCount ?? 0,
    respawnCount: lifecycle?.respawnCount ?? 0,
    controlSuppressed: lifecycle?.controlSuppressed === true,
    lastRespawnSource: lifecycle?.lastRespawnSource ?? null,
    lastRespawnX: lifecycle?.lastRespawnX ?? null,
    lastRespawnY: lifecycle?.lastRespawnY ?? null,
    overlay
  };
}
