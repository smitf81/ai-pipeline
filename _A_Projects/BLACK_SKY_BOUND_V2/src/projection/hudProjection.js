export function buildHudProjection(game) {
  const actors = game.actors ?? [];
  const player = actors.find((actor) => actor.team === 'player') ?? null;
  const aliveEnemies = actors.filter((actor) => actor.alive && actor.team !== 'player').length;
  return {
    status: game.status ?? 'unknown',
    objective: game.objectives?.[0]?.text ?? game.message ?? '',
    message: game.message ?? '',
    playerHp: player?.hp ?? 0,
    playerMaxHp: player?.maxHp ?? 0,
    playerStamina: player?.stamina?.current ?? 0,
    playerMaxStamina: player?.stamina?.max ?? 0,
    staminaState: player?.stamina?.state ?? 'inactive',
    sprinting: player?.stamina?.sprinting === true,
    dodgeCooldown: player?.dodgeState?.cooldownRemaining ?? 0,
    dodging: player?.dodgeState?.active === true,
    enemyCount: aliveEnemies,
    arena: buildArenaHud(game, player),
    cooldowns: player ? {
      bite: player.biteCooldown ?? 0,
      lunge: player.lungeCooldown ?? 0,
      smoke: player.smokeCooldown ?? 0
    } : {
      bite: 0,
      lunge: 0,
      smoke: 0
    }
  };
}

function buildArenaHud(game, player) {
  const arena = game.arena;
  if (!arena) return null;
  const wave = arena.waveIndex >= 0 ? arena.definition.waves[arena.waveIndex] : null;
  return {
    phase: arena.phase,
    waveNumber: arena.waveIndex + 1,
    totalWaves: arena.definition.waves.length,
    waveLabel: wave?.label ?? 'THE CROWN OF CINDERS',
    timeRemaining: arena.timeRemaining,
    remainingThreats: arena.remainingThreats,
    banner: arena.banner,
    bannerDetail: arena.bannerDetail,
    bannerSeconds: arena.bannerSeconds,
    unlockedAbilityIds: [...(player?.abilityProgression?.unlockedAbilities ?? [])]
  };
}
