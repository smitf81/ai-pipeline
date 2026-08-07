import { assert, equal } from './assert.mjs';
import {
  Faction,
  areFactionsFriendly,
  areFactionsHostile,
  isFaction
} from '../src/constants/factions.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { ACTORS } from '../src/data/actors.js';
import { createWorld, getComponent } from '../src/ecs/world.js';
import { spawnActor } from '../src/game/spawn.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { createDemoMap } from '../src/world/map.js';

for (const faction of ['player', 'raiders', 'husks', 'wolves', 'allies', 'enemy', 'neutral']) {
  assert(isFaction(faction), `faction registry should include ${faction}`);
}

for (const a of Object.values(Faction)) {
  for (const b of Object.values(Faction)) {
    equal(areFactionsHostile(a, b), areFactionsHostile(b, a), `hostility should be symmetric for ${a}/${b}`);
    equal(areFactionsFriendly(a, b), areFactionsFriendly(b, a), `friendliness should be symmetric for ${a}/${b}`);
    assert(!(areFactionsHostile(a, b) && areFactionsFriendly(a, b)), `${a}/${b} should not be both hostile and friendly`);
  }
}

equal(areFactionsFriendly(Faction.PLAYER, Faction.ALLIES), true, 'player and allies should be friendly');
equal(areFactionsFriendly(Faction.ENEMY, Faction.RAIDERS), true, 'legacy enemy should remain friendly with faction-specific hostile teams');
equal(areFactionsFriendly(Faction.NEUTRAL, Faction.NEUTRAL), true, 'same neutral faction should be friendly without becoming hostile');
equal(areFactionsHostile(Faction.PLAYER, Faction.ENEMY), true, 'legacy enemy should remain hostile to player');
equal(areFactionsHostile(Faction.ENEMY, Faction.PLAYER), true, 'legacy hostility should be symmetric');
equal(areFactionsHostile(Faction.RAIDERS, Faction.HUSKS), true, 'raiders and husks should be hostile encounter factions');
equal(areFactionsHostile(Faction.HUSKS, Faction.WOLVES), true, 'husks and wolves should be hostile encounter factions');
equal(areFactionsHostile(Faction.NEUTRAL, Faction.PLAYER), false, 'neutral should not be hostile to player');
equal(areFactionsHostile(Faction.PLAYER, Faction.NEUTRAL), false, 'player should not be hostile to neutral');
equal(areFactionsHostile('unknown', Faction.PLAYER), false, 'unknown faction ids should not silently become hostile');
equal(areFactionsFriendly('unknown', Faction.PLAYER), false, 'unknown faction ids should not silently become friendly');

equal(ACTORS[EntityKind.RAIDER].defaultTeam, Faction.RAIDERS, 'raiders should default to the raider faction');
equal(ACTORS[EntityKind.HUSK].defaultTeam, Faction.HUSKS, 'husks should default to the husk faction');
equal(ACTORS[EntityKind.WEREWOLF].defaultTeam, Faction.WOLVES, 'werewolves should default to the wolf faction');

const world = createWorld();
const raider = spawnActor(world, EntityKind.RAIDER, 2, 2);
const husk = spawnActor(world, EntityKind.HUSK, 3, 2);
const wolf = spawnActor(world, EntityKind.WEREWOLF, 4, 2);
equal(getComponent(world, raider, ComponentType.Team).id, Faction.RAIDERS, 'direct raider spawns should use actor faction defaults');
equal(getComponent(world, husk, ComponentType.Team).id, Faction.HUSKS, 'direct husk spawns should use actor faction defaults');
equal(getComponent(world, wolf, ComponentType.Team).id, Faction.WOLVES, 'direct werewolf spawns should use actor faction defaults');

const legacyGame = createInitialGameState(createDemoMap());
const legacyTeams = legacyGame.actors
  .filter((actor) => actor.id !== legacyGame.dragonId)
  .map((actor) => actor.team);
assert(legacyTeams.length > 0 && legacyTeams.every((team) => team === Faction.ENEMY), 'legacy enemySpawns should preserve the generic enemy team');
