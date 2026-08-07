import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { moveEntityRaw } from './movementSystem.js';

const KNOCKBACK_DAMPING = 8.5;

export function impactResponseSystem({ game, map, dt }) {
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.ImpactResponse])) {
    const impact = getComponent(game.world, entity, ComponentType.ImpactResponse);
    const vx = impact.knockbackVelocityX ?? 0;
    const vy = impact.knockbackVelocityY ?? 0;
    if (Math.hypot(vx, vy) > 0.001) moveEntityRaw(game.world, entity, vx * dt, vy * dt, map);
    const decay = Math.exp(-KNOCKBACK_DAMPING * dt);
    impact.knockbackVelocityX = Math.abs(vx * decay) < 0.01 ? 0 : vx * decay;
    impact.knockbackVelocityY = Math.abs(vy * decay) < 0.01 ? 0 : vy * decay;
    impact.staggerTimer = Math.max(0, (impact.staggerTimer ?? 0) - dt);
    if (impact.staggerTimer <= 0) impact.reactionDuration = 0;
  }
}
