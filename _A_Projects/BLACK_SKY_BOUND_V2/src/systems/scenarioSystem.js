import { ComponentType } from '../constants/componentTypes.js';
import { EventType } from '../constants/eventTypes.js';
import { ScenarioPhase } from '../constants/scenarioPhases.js';
import { PlayerLifecycleState } from '../data/playerLifecycle.js';
import { getScenario } from '../data/scenarios.js';
import { getComponent } from '../ecs/world.js';
import { emitEvent } from '../ecs/events.js';
import { isInsideRect } from '../world/map.js';

export function scenarioSystem({ game, map }) {
  const scenario = getScenario(game.scenarioId);
  const health = getComponent(game.world, game.dragonId, ComponentType.Health);
  const lifecycle = getComponent(game.world, game.dragonId, ComponentType.PlayerLifecycle);
  const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  if (!health?.alive) {
    if (lifecycle && lifecycle.state !== PlayerLifecycleState.ALIVE) {
      game.status = ScenarioPhase.PLAYING;
      return;
    }
    if (game.status !== ScenarioPhase.LOST) emitEvent(game.world, EventType.SCENARIO_FAILED, { reason: 'dragon_overwhelmed' });
    game.status = ScenarioPhase.LOST;
    game.message = scenario.lossMessage;
    return;
  }
  if (isInsideRect({ x: transform.x, y: transform.y }, map.escapeZone)) {
    const transition = map.transitions?.escapeZone;
    if (transition?.mode === 'load_next_map') {
      requestEscapeMapTransition(game, scenario, transition);
      return;
    }
    if (game.status !== ScenarioPhase.WON) emitEvent(game.world, EventType.SCENARIO_COMPLETED, { objective: scenario.objective.id });
    game.status = ScenarioPhase.WON;
    game.message = scenario.winMessage;
    game.objectives[0].complete = true;
  }
}

function requestEscapeMapTransition(game, scenario, transition) {
  if (['requested', 'loading', 'failed'].includes(game.mapTransition?.status)) return;
  game.mapTransition = {
    status: 'requested',
    reason: 'escape_zone',
    objective: scenario.objective.id,
    nextMapPath: transition.nextMapPath,
    nextMapId: transition.nextMapId,
    departureSequenceId: transition.departureSequenceId,
    arrivalSequenceId: transition.arrivalSequenceId,
    label: transition.label
  };
  emitEvent(game.world, EventType.SCENARIO_COMPLETED, {
    objective: scenario.objective.id,
    transition: game.mapTransition
  });
  game.status = ScenarioPhase.TRANSITIONING;
  game.message = `Escaping toward ${transition.label}.`;
  game.objectives[0].complete = true;
}
