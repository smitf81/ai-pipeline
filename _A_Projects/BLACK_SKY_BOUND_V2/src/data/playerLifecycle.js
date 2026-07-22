export const PlayerLifecycleState = Object.freeze({
  ALIVE: 'alive',
  DYING: 'dying',
  DEATH_FADE: 'deathFade',
  RESPAWN_PENDING: 'respawnPending',
  WAKING: 'waking'
});

export const PLAYER_LIFECYCLE_PROFILE = Object.freeze({
  id: 'young_dragon_player_lifecycle_respawn_v0',
  deathFadeSeconds: 1.05,
  respawnPendingSeconds: 0.04,
  wakeSeconds: 1.45,
  controlReturnAt: 0.66,
  deathFadeMaxOpacity: 0.985,
  respawnStartOpacity: 0.94,
  wakeEndOpacity: 0,
  overlayColour: [0.002, 0.004, 0.008, 1],
  respawn: Object.freeze({
    sourcePolicy: 'map_spawn_safe_point_v0',
    healthRatio: 1,
    pressure: 0,
    staminaRatio: 1
  })
});

export function createWakeFlickerSequence(seed = 1) {
  const base = Math.max(1, Math.floor(Number(seed) || 1));
  return [0, 1, 2, 3].map((index) => {
    const noise = deterministic01(base + index * 101);
    return Object.freeze({
      center: [0.13, 0.31, 0.48, 0.66][index] + (noise - 0.5) * 0.035,
      width: [0.075, 0.085, 0.105, 0.14][index],
      openAmount: [0.24, 0.42, 0.33, 0.28][index] + noise * 0.045
    });
  });
}

export function resolvePlayerLifecycleOverlay(lifecycle, profile = PLAYER_LIFECYCLE_PROFILE) {
  const state = lifecycle?.state ?? PlayerLifecycleState.ALIVE;
  if (state === PlayerLifecycleState.DEATH_FADE || state === PlayerLifecycleState.DYING) {
    const progress = clamp01((lifecycle?.stateElapsed ?? 0) / Math.max(0.001, profile.deathFadeSeconds));
    return buildOverlay(state, easeInCubic(progress) * profile.deathFadeMaxOpacity, progress, false, profile);
  }
  if (state === PlayerLifecycleState.RESPAWN_PENDING) {
    return buildOverlay(state, profile.respawnStartOpacity, 1, false, profile);
  }
  if (state === PlayerLifecycleState.WAKING) {
    const progress = clamp01((lifecycle?.stateElapsed ?? 0) / Math.max(0.001, profile.wakeSeconds));
    const base = lerp(profile.respawnStartOpacity, profile.wakeEndOpacity, smooth01(progress));
    const openPulse = (lifecycle?.wakeFlicker ?? []).reduce((sum, pulse) => {
      const distance = Math.abs(progress - pulse.center);
      if (distance >= pulse.width) return sum;
      const local = 1 - distance / pulse.width;
      return sum + pulse.openAmount * Math.sin(local * Math.PI);
    }, 0);
    return buildOverlay(state, clamp01(base - openPulse), progress, progress >= profile.controlReturnAt, profile);
  }
  return buildOverlay(PlayerLifecycleState.ALIVE, 0, 1, true, profile);
}

export function isPlayerInteractiveLifecycle(lifecycle) {
  if (!lifecycle || lifecycle.state === PlayerLifecycleState.ALIVE) return true;
  if (lifecycle.state !== PlayerLifecycleState.WAKING) return false;
  return (lifecycle.stateElapsed ?? 0) >= PLAYER_LIFECYCLE_PROFILE.wakeSeconds * PLAYER_LIFECYCLE_PROFILE.controlReturnAt;
}

function buildOverlay(state, opacity, progress, controlReady, profile) {
  return {
    classification: 'player_lifecycle_darkness_overlay_v0',
    owner: 'player_lifecycle',
    state,
    opacity: clamp01(opacity),
    progress: clamp01(progress),
    controlReady: controlReady === true,
    colour: [...profile.overlayColour],
    opacityPolicy: 'separate_screen_mask_not_health_pressure'
  };
}

function deterministic01(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function easeInCubic(value) {
  const t = clamp01(value);
  return t * t * t;
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
