export function buildHudProjection(game) {
  const actors = game.actors ?? [];
  const player = actors.find((actor) => actor.alive && actor.team === 'player') ?? null;
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
