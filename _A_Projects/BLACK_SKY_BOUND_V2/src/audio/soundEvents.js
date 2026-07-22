export const AudioEventType = Object.freeze({
  PLAYER_HIT: 'player.hit',
  PLAYER_STAMINA_LOW: 'player.stamina.low',
  PLAYER_ACTION_CLAW: 'player.action.claw',
  PLAYER_ACTION_BITE: 'player.action.bite',
  PLAYER_ACTION_LUNGE: 'player.action.lunge',
  PLAYER_SMOKE_EXHALE: 'player.smoke.exhale',
  COMBAT_ENEMY_HIT: 'combat.enemy.hit',
  ENEMY_NEAR: 'enemy.raider.near',
  ENEMY_ATTACK_WARNING: 'enemy.raider.warn',
  MAMA_WYVERN_ROAR: 'world.mama_wyvern.roar',
  UI_PAUSE: 'ui.pause'
});

export function createAudioEventQueue() {
  const queued = [];
  return {
    emit(type, payload = {}) {
      const event = {
        type,
        payload,
        queuedAt: queued.length
      };
      queued.push(event);
      return event;
    },
    drain() {
      const events = queued.splice(0, queued.length);
      return events;
    },
    get length() {
      return queued.length;
    }
  };
}

export function resolveActionAudioEvent(actionId) {
  if (actionId === 'bite_attack') return AudioEventType.PLAYER_ACTION_BITE;
  if (actionId === 'lunge_attack') return AudioEventType.PLAYER_ACTION_LUNGE;
  if (typeof actionId === 'string' && actionId.includes('claw')) return AudioEventType.PLAYER_ACTION_CLAW;
  return null;
}
