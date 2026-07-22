export function buildPlayerAbilityText(dragon) {
  return {
    chargeCounter: dragon.chargeCounterState ? {
      state: dragon.chargeCounterState.state,
      active: dragon.chargeCounterState.active === true,
      queued: dragon.chargeCounterState.queued === true,
      followupWindowRemaining: rounded(dragon.chargeCounterState.followupWindowRemaining),
      directionX: rounded(dragon.chargeCounterState.queuedDirectionX),
      directionY: rounded(dragon.chargeCounterState.queuedDirectionY),
      count: dragon.chargeCounterState.count ?? 0,
      hitCount: dragon.chargeCounterState.hitCount ?? 0,
      lastDeniedReason: dragon.chargeCounterState.lastDeniedReason ?? null,
      lastReceipt: dragon.chargeCounterState.lastReceipt ?? null
    } : null,
    abilities: dragon.abilityProgression ? {
      unlocked: [...dragon.abilityProgression.unlockedAbilities],
      consumedUnlockEvents: [...dragon.abilityProgression.consumedUnlockEvents],
      lastUnlockReceipt: dragon.abilityProgression.lastUnlockReceipt ?? null
    } : null
  };
}

function rounded(value) {
  return Number((value ?? 0).toFixed(3));
}
