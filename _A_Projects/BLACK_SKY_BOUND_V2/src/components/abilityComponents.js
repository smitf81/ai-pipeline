export function createChargeCounterState(ability) {
  return {
    classification: 'buffered_dodge_charge_counter_state_v0',
    abilityId: ability?.id ?? 'charge_counter',
    state: 'idle',
    active: false,
    queued: false,
    followupWindowRemaining: 0,
    bufferWindowSeconds: Math.max(0, finiteNumber(ability?.bufferWindowMs, 0) / 1000),
    maxRedirectRadians: Math.max(0, finiteNumber(ability?.maxRedirectDegrees, 0) * Math.PI / 180),
    queuedDirectionX: 0,
    queuedDirectionY: 0,
    count: 0,
    hitCount: 0,
    lastHitIds: [],
    lastDeniedReason: null,
    lastReceipt: null
  };
}

export function createAbilityProgression(unlockedAbilities = []) {
  return {
    classification: 'player_ability_progression_state_v0',
    unlockedAbilities: [...new Set(unlockedAbilities)],
    consumedUnlockEvents: [],
    lastUnlockReceipt: null
  };
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
