import { createTask, enqueueActorTask, taskToLabel } from '../ai/agentStub.js';
import { getActorEnergyText } from '../units/energy.js';

const ASSIGNMENT_STRATEGIES = new Set(['manual', 'nearest_worker', 'least_loaded_worker']);

export function runCommand(state, command) {
  if (command.kind === 'list-workers') {
    const workers = state.store.units.filter((unit) => unit.type === 'worker');
    return {
      ok: true,
      mode: 'list-workers',
      message: workers.length === 0
        ? 'No workers available.'
        : workers.map((worker) => `${worker.id} @ (${worker.x}, ${worker.y}) | energy ${getActorEnergyText(worker)}`).join(' | '),
      workers
    };
  }

  if (command.kind === 'set-assignment-strategy') {
    if (!ASSIGNMENT_STRATEGIES.has(command.strategy)) {
      return { ok: false, error: `Unknown strategy: ${command.strategy}` };
    }
    state.assignmentStrategy = command.strategy;
    return { ok: true, mode: 'strategy', message: `Assignment strategy set to ${command.strategy}` };
  }

  if (command.kind === 'show-assignment-strategy') {
    return { ok: true, mode: 'strategy', message: `Assignment strategy: ${state.assignmentStrategy}` };
  }

  if (command.kind === 'assign-worker-task') {
    const worker = state.store.units.find((unit) => unit.id === command.workerId && unit.type === 'worker');
    if (!worker) {
      return { ok: false, error: `Worker ${command.workerId} not found.` };
    }

    const task = createTask(state.store, {
      ...command.taskSpec,
      assignedActorId: worker.id,
      issuedByActorId: state.store.agent.id
    });
    enqueueActorTask(worker, task);

    return {
      ok: true,
      mode: 'enqueue-worker',
      enqueuedActorId: worker.id,
      queuedTasks: [task],
      message: `Assigned ${taskToLabel(task)} to ${worker.id}`
    };
  }

  const taskSpecs = commandToTaskSpecs(command);
  if (!taskSpecs.ok) {
    return taskSpecs;
  }

  const queuedTasks = [];
  const actorsTouched = new Set();

  taskSpecs.taskSpecs.forEach((taskSpec) => {
    const assignee = resolveAssignee(state, taskSpec);
    const task = createTask(state.store, {
      ...taskSpec,
      assignedActorId: assignee.id,
      issuedByActorId: state.store.agent.id
    });
    enqueueActorTask(assignee, task);
    queuedTasks.push(task);
    actorsTouched.add(assignee.id);
  });

  return {
    ok: true,
    mode: 'enqueue-auto',
    enqueuedActorId: queuedTasks[0]?.assignedActorId ?? state.store.agent.id,
    actorIds: [...actorsTouched],
    queuedTasks,
    message: queuedTasks.map((task) => `${task.id}:${taskToLabel(task)}`).join(' | ')
  };
}

export function resolveAssignee(state, taskSpec) {
  if (!isWorkerAssignable(taskSpec.type) || state.assignmentStrategy === 'manual') {
    return state.store.agent;
  }

  const workers = state.store.units.filter((unit) => unit.type === 'worker');
  if (workers.length === 0) {
    return state.store.agent;
  }

  if (state.assignmentStrategy === 'least_loaded_worker') {
    return workers.reduce((best, candidate) => {
      const candidateLoad = candidate.taskQueue.length + (candidate.currentTask ? 1 : 0);
      const bestLoad = best.taskQueue.length + (best.currentTask ? 1 : 0);
      return candidateLoad < bestLoad ? candidate : best;
    }, workers[0]);
  }

  return workers.reduce((best, candidate) => {
    const target = taskSpec.target ?? { x: candidate.x, y: candidate.y };
    const candidateDist = Math.abs(candidate.x - target.x) + Math.abs(candidate.y - target.y);
    const bestDist = Math.abs(best.x - target.x) + Math.abs(best.y - target.y);
    return candidateDist < bestDist ? candidate : best;
  }, workers[0]);
}

function isWorkerAssignable(taskType) {
  return new Set(['moveTo', 'placeBuilding', 'paintTile', 'deleteBuilding']).has(taskType);
}

export function commandToTaskSpecs(command) {
  switch (command.kind) {
    case 'spawn-worker':
      return {
        ok: true,
        taskSpecs: [
          {
            type: 'spawnUnit',
            target: { x: command.x, y: command.y },
            payload: { unitType: 'worker' }
          }
        ]
      };
    case 'spawn-unit':
      return {
        ok: true,
        taskSpecs: [
          {
            type: 'spawnUnit',
            target: { x: command.x, y: command.y },
            payload: { unitType: command.unitType }
          }
        ]
      };
    case 'place-building':
      return {
        ok: true,
        taskSpecs: [
          {
            type: 'placeBuilding',
            target: { x: command.x, y: command.y },
            payload: { buildingType: command.buildingType }
          }
        ]
      };
    case 'move-agent':
      return {
        ok: true,
        taskSpecs: [
          {
            type: 'moveTo',
            target: { x: command.x, y: command.y },
            payload: {}
          }
        ]
      };
    case 'delete-building':
      return {
        ok: true,
        taskSpecs: [
          {
            type: 'deleteBuilding',
            target: null,
            payload: { id: command.id }
          }
        ]
      };
    case 'paint-tile':
      return {
        ok: true,
        taskSpecs: [
          {
            type: 'paintTile',
            target: { x: command.x, y: command.y },
            payload: { tileType: command.tileType }
          }
        ]
      };
    default:
      return { ok: false, error: `Unsupported command kind: ${command.kind}` };
  }
}
