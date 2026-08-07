export function buildArenaWaveText(game) {
  const arena = game?.arena;
  if (!arena) return null;
  const progression = game.actors?.find((actor) => actor.id === game.dragonId)?.abilityProgression;
  return {
    contract: arena.contract,
    phase: arena.phase,
    waveIndex: arena.waveIndex,
    waveNumber: arena.waveIndex + 1,
    totalWaves: arena.definition.waves.length,
    activeWaveId: arena.activeWaveId,
    completedWaveIds: [...arena.completedWaveIds],
    timeRemaining: Number((arena.timeRemaining ?? 0).toFixed(3)),
    remainingThreats: arena.remainingThreats,
    banner: arena.banner,
    bannerDetail: arena.bannerDetail,
    lastRewardAbilityId: arena.lastRewardAbilityId,
    unlockedAbilityIds: [...(progression?.unlockedAbilities ?? [])]
  };
}
