export function buildPlayerAbilityText(dragon) {
  return {
    pounceCounter: (dragon.pounceCounterState ?? dragon.chargeCounterState) ? {
      state: (dragon.pounceCounterState ?? dragon.chargeCounterState).state,
      active: (dragon.pounceCounterState ?? dragon.chargeCounterState).active === true,
      queued: (dragon.pounceCounterState ?? dragon.chargeCounterState).queued === true,
      followupWindowRemaining: rounded((dragon.pounceCounterState ?? dragon.chargeCounterState).followupWindowRemaining),
      directionX: rounded((dragon.pounceCounterState ?? dragon.chargeCounterState).queuedDirectionX),
      directionY: rounded((dragon.pounceCounterState ?? dragon.chargeCounterState).queuedDirectionY),
      count: (dragon.pounceCounterState ?? dragon.chargeCounterState).count ?? 0,
      hitCount: (dragon.pounceCounterState ?? dragon.chargeCounterState).hitCount ?? 0,
      lastDeniedReason: (dragon.pounceCounterState ?? dragon.chargeCounterState).lastDeniedReason ?? null,
      lastReceipt: (dragon.pounceCounterState ?? dragon.chargeCounterState).lastReceipt ?? null,
      lastImpactReceipt: dragon.wyvernProjection?.actionState?.lastImpactReceipt ?? null
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
