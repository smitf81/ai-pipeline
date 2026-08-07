import { getAliveEnemies as selectAliveEnemies } from './selectors.js';

export function applyDamage(actor, amount) {
  actor.hp = Math.max(0, actor.hp - amount);
  actor.alive = actor.hp > 0;
  return !actor.alive;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function actorInRadius(actor, point, radius) {
  return distance(actor, point) <= radius + (actor.radius ?? 0);
}

export function getAliveEnemies(game) {
  return selectAliveEnemies(game);
}
