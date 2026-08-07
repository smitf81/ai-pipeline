import { ComponentType } from '../constants/componentTypes.js';
import { hasComponents } from './query.js';

export const InterfaceType = Object.freeze({
  Damageable: 'Damageable',
  Moveable: 'Moveable',
  AttackSource: 'AttackSource',
  SmokeAffectable: 'SmokeAffectable',
  EnemyTarget: 'EnemyTarget',
  Renderable: 'Renderable',
  LifetimeBound: 'LifetimeBound',
  ScenarioObjective: 'ScenarioObjective'
});

export const InterfaceComponents = Object.freeze({
  [InterfaceType.Damageable]: [ComponentType.Health],
  [InterfaceType.Moveable]: [ComponentType.Transform, ComponentType.Motion],
  [InterfaceType.AttackSource]: [ComponentType.Transform, ComponentType.AttackSet, ComponentType.Cooldowns],
  [InterfaceType.SmokeAffectable]: [ComponentType.Transform, ComponentType.StatusEffects],
  [InterfaceType.EnemyTarget]: [ComponentType.Transform, ComponentType.Team, ComponentType.Health],
  [InterfaceType.Renderable]: [ComponentType.Transform, ComponentType.Renderable],
  [InterfaceType.LifetimeBound]: [ComponentType.Lifetime],
  [InterfaceType.ScenarioObjective]: [ComponentType.ScenarioObjective]
});

export function hasInterface(world, entity, interfaceName) {
  const components = InterfaceComponents[interfaceName];
  if (!components) throw new Error(`Unknown ECS interface: ${interfaceName}`);
  return hasComponents(world, entity, components);
}
