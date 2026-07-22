export const EnemyPressureState = Object.freeze({
  ROAM: 'roam',
  ALERT: 'alert',
  ATTACK: 'attack',
  SEARCH: 'search',
  RETURN: 'return'
});

const ENEMY_PRESSURE_STATES = Object.freeze(Object.values(EnemyPressureState));

export function isEnemyPressureState(value) {
  return ENEMY_PRESSURE_STATES.includes(value);
}
