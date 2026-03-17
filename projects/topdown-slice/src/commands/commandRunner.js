import { placeBuilding, removeBuilding } from '../buildings/buildings.js';
import { spawnUnit } from '../units/units.js';
import { enqueueAgentAction } from '../ai/agentStub.js';

export function runCommand(state, command) {
  switch (command.kind) {
    case 'spawn-unit':
      return spawnUnit(state.store, state.map, { type: command.unitType, x: command.x, y: command.y });
    case 'place-building':
      return placeBuilding(state.store, state.map, { type: command.buildingType, x: command.x, y: command.y });
    case 'move-agent':
      enqueueAgentAction(state.store.agent, { kind: 'move', x: command.x, y: command.y });
      return { ok: true };
    case 'delete-building':
      return removeBuilding(state.store, command.id);
    default:
      return { ok: false, error: `Unsupported command kind: ${command.kind}` };
  }
}
