import { equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { ScenarioPhase } from '../src/constants/scenarioPhases.js';
import { getComponent } from '../src/ecs/world.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { scenarioSystem } from '../src/systems/scenarioSystem.js';
import { createDemoMap } from '../src/world/map.js';

const transitionMap = createDemoMap();
transitionMap.enemySpawns = [];
transitionMap.unitPlacements = [];
transitionMap.transitions = {
  escapeZone: {
    mode: 'load_next_map',
    nextMapId: 'axiom_second_approach',
    nextMapPath: '/data/maps/axiom-second-approach.runtime-map.json',
    arrivalSequenceId: 'smoke_instinct_awakening',
    label: 'Ash Road Threshold'
  }
};
const transitionGame = createInitialGameState(transitionMap);
movePlayerToEscapeZone(transitionGame, transitionMap);
scenarioSystem({ game: transitionGame, map: transitionMap });
equal(transitionGame.status, ScenarioPhase.TRANSITIONING, 'escape zone should request a map transition when one is authored');
equal(transitionGame.mapTransition.status, 'requested', 'transition request should be inspectable before the app loader consumes it');
equal(transitionGame.mapTransition.nextMapPath, '/data/maps/axiom-second-approach.runtime-map.json', 'transition request should preserve the canonical next map path');
equal(transitionGame.mapTransition.arrivalSequenceId, 'smoke_instinct_awakening', 'transition request should carry the authored arrival sequence without inferring it from ability lock state');
equal(transitionGame.objectives[0].complete, true, 'escape objective should complete before leaving the region');

const terminalMap = createDemoMap();
terminalMap.enemySpawns = [];
terminalMap.unitPlacements = [];
terminalMap.transitions = { escapeZone: null };
const terminalGame = createInitialGameState(terminalMap);
movePlayerToEscapeZone(terminalGame, terminalMap);
scenarioSystem({ game: terminalGame, map: terminalMap });
equal(terminalGame.status, ScenarioPhase.WON, 'maps without a next-map transition should keep the existing terminal win behavior');

function movePlayerToEscapeZone(game, map) {
  const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  transform.x = map.escapeZone.x + 0.5;
  transform.y = map.escapeZone.y + 0.5;
}
