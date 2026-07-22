import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { InterfaceType, hasInterface } from '../src/ecs/interfaces.js';
import { getComponent } from '../src/ecs/world.js';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/state.js';

const game = createInitialGameState(createDemoMap());
const dragon = game.dragonId;
equal(game.architecture, 'ecs_foundation_v1', 'game should declare ECS foundation architecture');
assert(game.world.entities.has(dragon), 'dragon should be an ECS entity id');
assert(hasInterface(game.world, dragon, InterfaceType.Damageable), 'dragon should satisfy Damageable interface');
assert(hasInterface(game.world, dragon, InterfaceType.AttackSource), 'dragon should satisfy AttackSource interface');
equal(getComponent(game.world, dragon, ComponentType.Kind).type, EntityKind.YOUNG_DRAGON, 'dragon kind should be component-backed');
equal(game.actors.length, 6, 'compatibility actor view should still expose playable actors');
